import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  athleteAccountLinks,
  athletePositions,
  athletes,
  officialEvaluations,
  userRoles,
  users,
} from '@/db/schema';
import { outer } from '@/db/sql';
import type { PositionCode } from '@/domain/positions';
import { ConflictError, DomainError, NotFoundError } from '@/domain/shared/errors';
import {
  isAdmin,
  requireActive,
  requireAdmin,
  requireAthleteEdit,
  restrictAthletePatch,
  sanitizeAthlete,
  type Actor,
  type AthleteRecord,
} from '@/server/policies';
import type { EmailMessage } from '@/server/email/mailer';
import { registrationApprovedEmail } from '@/server/email/templates';
import { recordAudit } from './audit';
import { createNotification, sendEmailsInBackground } from './notifications';

/** Cadastro e vínculo de atletas (§5). */

export interface AthleteInput {
  fullName: string;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  shirtNumber?: number | null;
  uniformSize?: string | null;
  joinedAt?: string | null;
  status?: 'ativo' | 'inativo' | 'afastado' | 'lesionado';
  athleteNotes?: string | null;
  adminNotes?: string | null;
  healthRestrictions?: string | null;
  primaryPosition?: PositionCode | null;
  secondaryPositions?: readonly PositionCode[];
  unwantedPositions?: readonly PositionCode[];
}

/**
 * Cria um perfil de atleta **sem conta** (§5.2).
 *
 * Esse perfil já participa de eventos, recebe avaliação, entra em times e tem
 * financeiro. A conta pode ser vinculada depois, por convite ou reivindicação.
 */
export async function createAthlete(
  db: Database,
  params: { actor: Actor | null; input: AthleteInput },
): Promise<{ id: string }> {
  const actor = requireAdmin(params.actor);

  return db.transaction(async (tx) => {
    await assertNoDuplicate(tx as unknown as Database, params.input);

    const [created] = await tx
      .insert(athletes)
      .values({
        fullName: params.input.fullName,
        nickname: params.input.nickname ?? null,
        phone: params.input.phone ?? null,
        email: params.input.email?.toLowerCase() ?? null,
        birthDate: params.input.birthDate ?? null,
        shirtNumber: params.input.shirtNumber ?? null,
        uniformSize: params.input.uniformSize ?? null,
        joinedAt: params.input.joinedAt ?? new Date().toISOString().slice(0, 10),
        status: params.input.status ?? 'ativo',
        athleteNotes: params.input.athleteNotes ?? null,
        adminNotes: params.input.adminNotes ?? null,
        healthRestrictions: params.input.healthRestrictions ?? null,
        createdByUserId: actor.userId,
      })
      .returning({ id: athletes.id });

    const athleteId = created?.id as string;
    await replacePositions(tx as unknown as Database, athleteId, params.input);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'atleta.criar',
      entityType: 'athlete',
      entityId: athleteId,
      after: { fullName: params.input.fullName },
    });

    return { id: athleteId };
  });
}

export async function updateAthlete(
  db: Database,
  params: { actor: Actor | null; athleteId: string; patch: AthleteInput },
): Promise<void> {
  const actor = requireAthleteEdit(params.actor, params.athleteId);

  // Descarta no servidor qualquer campo que o ator não possa alterar. Um atleta
  // que forje o formulário com `adminNotes` tem o campo removido aqui.
  const allowed = restrictAthletePatch(actor, params.athleteId, {
    ...params.patch,
  }) as AthleteInput;

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(athletes)
      .where(eq(athletes.id, params.athleteId))
      .limit(1);
    if (!before) throw new NotFoundError('Atleta não encontrado.');

    const { primaryPosition, secondaryPositions, unwantedPositions, email, ...columns } = allowed;

    await tx
      .update(athletes)
      .set({
        ...columns,
        ...(email !== undefined ? { email: email?.toLowerCase() ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(athletes.id, params.athleteId));

    // Posições só são reescritas quando vieram no patch — um patch parcial não
    // deve apagar silenciosamente as posições existentes.
    if (
      primaryPosition !== undefined ||
      secondaryPositions !== undefined ||
      unwantedPositions !== undefined
    ) {
      await replacePositions(tx as unknown as Database, params.athleteId, allowed);
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'atleta.editar',
      entityType: 'athlete',
      entityId: params.athleteId,
      before: { fullName: before.fullName, status: before.status },
      after: allowed,
    });
  });
}

/** Exclusão lógica: preserva presenças, times, histórico e financeiro (§5.3). */
export async function deactivateAthlete(
  db: Database,
  params: { actor: Actor | null; athleteId: string; reason: string },
): Promise<void> {
  const actor = requireAdmin(params.actor);

  if (params.reason.trim().length < 3) {
    throw new DomainError('ENTRADA_INVALIDA', 'Informe o motivo da remoção.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(athletes)
      .set({ deletedAt: new Date(), status: 'inativo', updatedAt: new Date() })
      .where(eq(athletes.id, params.athleteId));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'atleta.remover',
      entityType: 'athlete',
      entityId: params.athleteId,
      reason: params.reason.trim(),
    });
  });
}

async function replacePositions(
  db: Database,
  athleteId: string,
  input: AthleteInput,
): Promise<void> {
  await db.delete(athletePositions).where(eq(athletePositions.athleteId, athleteId));

  const rows: {
    athleteId: string;
    position: PositionCode;
    role: 'principal' | 'secundaria' | 'indesejada';
  }[] = [];

  if (input.primaryPosition) {
    rows.push({ athleteId, position: input.primaryPosition, role: 'principal' });
  }
  for (const position of input.secondaryPositions ?? []) {
    if (position !== input.primaryPosition) {
      rows.push({ athleteId, position, role: 'secundaria' });
    }
  }
  for (const position of input.unwantedPositions ?? []) {
    if (
      position !== input.primaryPosition &&
      !(input.secondaryPositions ?? []).includes(position)
    ) {
      rows.push({ athleteId, position, role: 'indesejada' });
    }
  }

  if (rows.length > 0) await db.insert(athletePositions).values(rows);
}

/** Duplicidade por e-mail ou telefone é tratada explicitamente (§23.1). */
async function assertNoDuplicate(db: Database, input: AthleteInput): Promise<void> {
  const email = input.email?.toLowerCase();
  const phone = input.phone;

  if (!email && !phone) return;

  const conditions = [];
  if (email) conditions.push(sql`lower(${athletes.email}) = ${email}`);
  if (phone) conditions.push(eq(athletes.phone, phone));

  const [existing] = await db
    .select({ id: athletes.id, fullName: athletes.fullName })
    .from(athletes)
    .where(and(isNull(athletes.deletedAt), or(...conditions)))
    .limit(1);

  if (existing) {
    throw new ConflictError(
      `Já existe um atleta cadastrado com esse e-mail ou telefone: ${existing.fullName}. ` +
        'Vincule a conta ao perfil existente em vez de criar outro.',
      { athleteId: existing.id },
    );
  }
}

export interface AthleteListItem {
  id: string;
  fullName: string;
  nickname: string | null;
  avatarUrl: string | null;
  shirtNumber: number | null;
  status: string;
  primaryPosition: PositionCode | null;
  hasAccount: boolean;
  /** Só preenchido para administradores. */
  officialOverall: number | null;
  evaluationStatus: 'provisoria' | 'definitiva' | null;
}

export async function listAthletes(
  db: Database,
  params: { actor: Actor | null; includeInactive?: boolean },
): Promise<AthleteListItem[]> {
  const active = requireActive(params.actor);
  const admin = isAdmin(active);

  const rows = await db
    .select({
      id: athletes.id,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
      avatarUrl: athletes.avatarUrl,
      shirtNumber: athletes.shirtNumber,
      status: athletes.status,
      primaryPosition: sql<PositionCode | null>`(select p.position from athlete_positions p where p.athlete_id = ${outer(athletes.id)} and p.role = 'principal' limit 1)`,
      hasAccount: sql<boolean>`exists (select 1 from athlete_account_links l where l.athlete_id = ${outer(athletes.id)} and l.status = 'aprovado')`,
      officialOverall: officialEvaluations.overall,
      evaluationStatus: officialEvaluations.status,
    })
    .from(athletes)
    .leftJoin(
      officialEvaluations,
      and(eq(officialEvaluations.athleteId, athletes.id), eq(officialEvaluations.isCurrent, true)),
    )
    .where(
      params.includeInactive
        ? isNull(athletes.deletedAt)
        : and(isNull(athletes.deletedAt), sql`${athletes.status} <> 'inativo'`),
    )
    .orderBy(athletes.fullName);

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    shirtNumber: row.shirtNumber,
    status: row.status,
    primaryPosition: row.primaryPosition,
    hasAccount: row.hasAccount,
    // A nota oficial nunca é serializada para quem não é administrador — a
    // remoção acontece aqui, no servidor, não na renderização.
    officialOverall: admin && row.officialOverall !== null ? Number(row.officialOverall) : null,
    evaluationStatus: admin ? row.evaluationStatus : null,
  }));
}

export async function getAthlete(
  db: Database,
  params: { actor: Actor | null; athleteId: string },
): Promise<ReturnType<typeof sanitizeAthlete> | null> {
  const active = requireActive(params.actor);

  const [row] = await db
    .select()
    .from(athletes)
    .where(and(eq(athletes.id, params.athleteId), isNull(athletes.deletedAt)))
    .limit(1);

  if (!row) return null;

  return sanitizeAthlete(active, row as AthleteRecord);
}

export async function getAthletePositions(
  db: Database,
  athleteId: string,
): Promise<{ primary: PositionCode | null; secondary: PositionCode[]; unwanted: PositionCode[] }> {
  const rows = await db
    .select()
    .from(athletePositions)
    .where(eq(athletePositions.athleteId, athleteId));

  return {
    primary: rows.find((r) => r.role === 'principal')?.position ?? null,
    secondary: rows.filter((r) => r.role === 'secundaria').map((r) => r.position),
    unwanted: rows.filter((r) => r.role === 'indesejada').map((r) => r.position),
  };
}

// ---------------------------------------------------------------------------
// Aprovação de cadastro e vínculo de conta (§5.1 e §5.3)
// ---------------------------------------------------------------------------

export interface PendingRegistration {
  userId: string;
  name: string;
  email: string;
  createdAt: Date;
  /** Perfil existente com e-mail ou telefone coincidente, se houver. */
  possibleMatchAthleteId: string | null;
  possibleMatchName: string | null;
}

export async function listPendingRegistrations(
  db: Database,
  actor: Actor | null,
): Promise<PendingRegistration[]> {
  requireAdmin(actor);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      matchId: sql<
        string | null
      >`(select a.id from athletes a where lower(a.email) = lower(${outer(users.email)}) and a.deleted_at is null limit 1)`,
      matchName: sql<
        string | null
      >`(select a.full_name from athletes a where lower(a.email) = lower(${outer(users.email)}) and a.deleted_at is null limit 1)`,
    })
    .from(users)
    .where(and(eq(users.status, 'aguardando_aprovacao'), isNull(users.deletedAt)))
    .orderBy(desc(users.createdAt));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
    possibleMatchAthleteId: row.matchId,
    possibleMatchName: row.matchName,
  }));
}

/**
 * Aprova um cadastro. Se `linkToAthleteId` for informado, vincula ao perfil
 * existente em vez de criar outro — é o caminho que evita duplicidade (§5.1).
 */
export async function approveRegistration(
  db: Database,
  params: { actor: Actor | null; userId: string; linkToAthleteId?: string; note?: string },
): Promise<{ athleteId: string }> {
  const actor = requireAdmin(params.actor);

  let pendingEmails: EmailMessage[] = [];

  const result = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, params.userId)).limit(1);
    if (!user) throw new NotFoundError('Cadastro não encontrado.');

    let athleteId = params.linkToAthleteId;

    if (!athleteId) {
      const [created] = await tx
        .insert(athletes)
        .values({
          fullName: user.name,
          email: user.email,
          joinedAt: new Date().toISOString().slice(0, 10),
          status: 'ativo',
          createdByUserId: actor.userId,
        })
        .returning({ id: athletes.id });
      athleteId = created?.id as string;
    }

    await tx
      .insert(athleteAccountLinks)
      .values({
        athleteId,
        userId: params.userId,
        status: 'aprovado',
        origin: params.linkToAthleteId ? 'reivindicacao' : 'autocadastro',
        decidedAt: new Date(),
        decidedByUserId: actor.userId,
        decisionNote: params.note ?? null,
      })
      .onConflictDoNothing();

    await tx.update(users).set({ status: 'ativo' }).where(eq(users.id, params.userId));
    await tx
      .insert(userRoles)
      .values({ userId: params.userId, role: 'atleta', grantedByUserId: actor.userId })
      .onConflictDoNothing();

    await createNotification(tx, {
      userId: params.userId,
      kind: 'comunicado',
      title: 'Cadastro aprovado',
      body: 'Bem-vindo ao Conexão Voleibol Alegrete. Você já pode confirmar presença nos encontros.',
      href: '/app',
    });

    pendingEmails = [registrationApprovedEmail({ to: user.email, name: user.name })];

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'cadastro.aprovar',
      entityType: 'user',
      entityId: params.userId,
      after: { athleteId, vinculadoAPerfilExistente: Boolean(params.linkToAthleteId) },
      reason: params.note ?? null,
    });

    return { athleteId };
  });

  sendEmailsInBackground(pendingEmails);

  return result;
}

export async function rejectRegistration(
  db: Database,
  params: { actor: Actor | null; userId: string; reason: string },
): Promise<void> {
  const actor = requireAdmin(params.actor);

  if (params.reason.trim().length < 3) {
    throw new DomainError('ENTRADA_INVALIDA', 'Informe o motivo da recusa.');
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: 'rejeitado' }).where(eq(users.id, params.userId));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'cadastro.rejeitar',
      entityType: 'user',
      entityId: params.userId,
      reason: params.reason.trim(),
    });
  });
}

export async function requestRegistrationChanges(
  db: Database,
  params: { actor: Actor | null; userId: string; note: string },
): Promise<void> {
  const actor = requireAdmin(params.actor);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status: 'ajustes_solicitados' })
      .where(eq(users.id, params.userId));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'cadastro.solicitar_ajustes',
      entityType: 'user',
      entityId: params.userId,
      reason: params.note,
    });
  });
}
