import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { affinities, athletes } from '@/db/schema';
import { DomainError } from '@/domain/shared/errors';
import {
  isAdmin,
  requireActive,
  requireAdmin,
  requireAffinityWrite,
  type Actor,
} from '@/server/policies';
import { recordAudit } from './audit';

/**
 * Afinidades direcionais (§8).
 *
 * A privacidade aqui não é detalhe de interface: as consultas deste módulo
 * **nunca** filtram por `toAthleteId` para um atleta. Se filtrassem, bastaria
 * inverter um parâmetro para alguém descobrir quem o marcou negativamente.
 * A visibilidade é sempre por `fromAthleteId`.
 */

export interface AffinityInput {
  fromAthleteId: string;
  toAthleteId: string;
  type: 'pessoal' | 'tatica';
  intensity: number;
  rigidity?: 'preferencia_flexivel' | 'restricao_obrigatoria';
  note?: string | null;
}

export interface AffinityView {
  id: string;
  fromAthleteId: string;
  toAthleteId: string;
  toDisplayName: string;
  type: 'pessoal' | 'tatica';
  intensity: number;
  rigidity: 'preferencia_flexivel' | 'restricao_obrigatoria';
  note: string | null;
}

export async function upsertAffinity(
  db: Database,
  params: { actor: Actor | null; input: AffinityInput },
): Promise<{ id: string }> {
  const { input } = params;
  const rigidity = input.rigidity ?? 'preferencia_flexivel';

  const actor = requireAffinityWrite(params.actor, {
    fromAthleteId: input.fromAthleteId,
    rigidity,
  });

  if (input.fromAthleteId === input.toAthleteId) {
    throw new DomainError('ENTRADA_INVALIDA', 'Não dá para cadastrar uma preferência sobre si.');
  }
  if (!Number.isInteger(input.intensity) || input.intensity < -3 || input.intensity > 3) {
    throw new DomainError('ENTRADA_INVALIDA', 'A intensidade precisa estar entre -3 e +3.');
  }

  return db.transaction(async (tx) => {
    // Intensidade 0 é "neutro": em vez de guardar uma linha sem efeito, apagamos
    // a preferência. Isso mantém a listagem do atleta enxuta.
    if (input.intensity === 0) {
      await tx
        .delete(affinities)
        .where(
          and(
            eq(affinities.fromAthleteId, input.fromAthleteId),
            eq(affinities.toAthleteId, input.toAthleteId),
            eq(affinities.type, input.type),
          ),
        );

      await recordAudit(tx, {
        actorUserId: actor.userId,
        action: 'afinidade.remover',
        entityType: 'affinity',
        entityId: `${input.fromAthleteId}->${input.toAthleteId}`,
      });

      return { id: '' };
    }

    const [row] = await tx
      .insert(affinities)
      .values({
        fromAthleteId: input.fromAthleteId,
        toAthleteId: input.toAthleteId,
        type: input.type,
        intensity: input.intensity,
        rigidity,
        note: input.note ?? null,
        createdByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: [affinities.fromAthleteId, affinities.toAthleteId, affinities.type],
        set: {
          intensity: input.intensity,
          rigidity,
          note: input.note ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: affinities.id });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'afinidade.definir',
      entityType: 'affinity',
      entityId: row?.id ?? null,
      after: { ...input, rigidity },
    });

    return { id: row?.id as string };
  });
}

export async function deleteAffinity(
  db: Database,
  params: { actor: Actor | null; affinityId: string },
): Promise<void> {
  const active = requireActive(params.actor);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(affinities)
      .where(eq(affinities.id, params.affinityId))
      .limit(1);

    if (!existing) return;

    requireAffinityWrite(active, {
      fromAthleteId: existing.fromAthleteId,
      rigidity: existing.rigidity,
    });

    await tx.delete(affinities).where(eq(affinities.id, params.affinityId));

    await recordAudit(tx, {
      actorUserId: active.userId,
      action: 'afinidade.remover',
      entityType: 'affinity',
      entityId: params.affinityId,
      before: existing,
    });
  });
}

/**
 * Preferências **cadastradas pelo próprio atleta**.
 *
 * Deliberadamente não existe uma função "preferências sobre mim": esse dado não
 * pode ser exposto ao alvo em nenhuma circunstância (§8.3).
 */
export async function listOwnAffinities(
  db: Database,
  params: { actor: Actor | null; athleteId: string },
): Promise<AffinityView[]> {
  const active = requireActive(params.actor);

  if (!isAdmin(active) && active.athleteId !== params.athleteId) {
    throw new DomainError('SEM_PERMISSAO', 'Você só pode ver as suas próprias preferências.');
  }

  const rows = await db
    .select({
      id: affinities.id,
      fromAthleteId: affinities.fromAthleteId,
      toAthleteId: affinities.toAthleteId,
      type: affinities.type,
      intensity: affinities.intensity,
      rigidity: affinities.rigidity,
      note: affinities.note,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
    })
    .from(affinities)
    .innerJoin(athletes, eq(athletes.id, affinities.toAthleteId))
    .where(eq(affinities.fromAthleteId, params.athleteId));

  return rows.map((row) => ({
    id: row.id,
    fromAthleteId: row.fromAthleteId,
    toAthleteId: row.toAthleteId,
    toDisplayName: row.nickname ?? row.fullName,
    type: row.type,
    intensity: row.intensity,
    rigidity: row.rigidity,
    // A nota é escrita por administradores: o atleta não a vê.
    note: null,
  }));
}

export interface AffinityMatrixEntry extends AffinityView {
  fromDisplayName: string;
  /** Existe a relação inversa com o mesmo sinal? */
  mutual: boolean;
}

/** Visão completa das relações. Exclusiva de administradores (§8.3). */
export async function listAllAffinities(
  db: Database,
  actor: Actor | null,
): Promise<AffinityMatrixEntry[]> {
  requireAdmin(actor);

  const fromAthlete = { id: athletes.id, fullName: athletes.fullName, nickname: athletes.nickname };

  const rows = await db
    .select({
      id: affinities.id,
      fromAthleteId: affinities.fromAthleteId,
      toAthleteId: affinities.toAthleteId,
      type: affinities.type,
      intensity: affinities.intensity,
      rigidity: affinities.rigidity,
      note: affinities.note,
    })
    .from(affinities);

  const athleteIds = [...new Set(rows.flatMap((r) => [r.fromAthleteId, r.toAthleteId]))];

  const names =
    athleteIds.length > 0
      ? await db.select(fromAthlete).from(athletes).where(inArray(athletes.id, athleteIds))
      : [];

  const nameOf = new Map(names.map((n) => [n.id, n.nickname ?? n.fullName]));
  const byDirection = new Map(
    rows.map((r) => [`${r.fromAthleteId}|${r.toAthleteId}|${r.type}`, r]),
  );

  return rows.map((row) => {
    const reverse = byDirection.get(`${row.toAthleteId}|${row.fromAthleteId}|${row.type}`);

    return {
      ...row,
      fromDisplayName: nameOf.get(row.fromAthleteId) ?? 'Atleta',
      toDisplayName: nameOf.get(row.toAthleteId) ?? 'Atleta',
      mutual: reverse !== undefined && Math.sign(reverse.intensity) === Math.sign(row.intensity),
    };
  });
}

/** Restrições obrigatórias vigentes — o que o gerador trata como regra dura. */
export async function listMandatoryConstraints(
  db: Database,
  actor: Actor | null,
): Promise<AffinityMatrixEntry[]> {
  const all = await listAllAffinities(db, actor);
  return all.filter((entry) => entry.rigidity === 'restricao_obrigatoria');
}

/** Atletas disponíveis para escolher em uma preferência. */
export async function listSelectableAthletes(
  db: Database,
  params: { actor: Actor | null; excludeAthleteId?: string },
): Promise<{ id: string; displayName: string }[]> {
  requireActive(params.actor);

  const rows = await db
    .select({ id: athletes.id, fullName: athletes.fullName, nickname: athletes.nickname })
    .from(athletes)
    .where(
      and(
        isNull(athletes.deletedAt),
        or(eq(athletes.status, 'ativo'), eq(athletes.status, 'lesionado')),
      ),
    )
    .orderBy(athletes.fullName);

  return rows
    .filter((row) => row.id !== params.excludeAthleteId)
    .map((row) => ({ id: row.id, displayName: row.nickname ?? row.fullName }));
}
