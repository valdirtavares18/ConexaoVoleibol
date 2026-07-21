import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { clubSettings, eventParticipants, events, teamFormations } from '@/db/schema';
import { outer } from '@/db/sql';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { requireActive, requireEventManagement, type Actor } from '@/server/policies';
import { recordAudit } from './audit';

/** Eventos e agenda (§9). */

export interface EventInput {
  title: string;
  type: 'encontro' | 'treino' | 'amistoso' | 'campeonato' | 'confraternizacao' | 'outro';
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  venueName?: string | null;
  address?: string | null;
  notes?: string | null;
  confirmationDeadline?: Date | null;
  capacity?: number;
  teamCount?: number;
  teamSize?: number;
  valuePerAthleteCents?: number;
  courtCostCents?: number;
}

export async function createEvent(
  db: Database,
  params: { actor: Actor | null; input: EventInput },
): Promise<{ id: string }> {
  const actor = requireEventManagement(params.actor);

  return db.transaction(async (tx) => {
    // Padrões vêm da configuração do clube, não de constantes de código.
    const [settings] = await tx
      .select()
      .from(clubSettings)
      .where(eq(clubSettings.id, 'default'))
      .limit(1);

    const [created] = await tx
      .insert(events)
      .values({
        title: params.input.title,
        type: params.input.type,
        status: 'rascunho',
        eventDate: params.input.eventDate,
        startTime: params.input.startTime ?? null,
        endTime: params.input.endTime ?? null,
        venueName: params.input.venueName ?? null,
        address: params.input.address ?? null,
        notes: params.input.notes ?? null,
        confirmationDeadline: params.input.confirmationDeadline ?? null,
        capacity: params.input.capacity ?? settings?.defaultCapacity ?? 18,
        teamCount: params.input.teamCount ?? settings?.defaultTeamCount ?? 3,
        teamSize: params.input.teamSize ?? settings?.defaultTeamSize ?? 6,
        valuePerAthleteCents:
          params.input.valuePerAthleteCents ?? settings?.defaultValuePerAthleteCents ?? 1000,
        courtCostCents: params.input.courtCostCents ?? settings?.defaultCourtCostCents ?? 15000,
        createdByUserId: actor.userId,
      })
      .returning({ id: events.id });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'evento.criar',
      entityType: 'event',
      entityId: created?.id ?? null,
      after: params.input,
    });

    return { id: created?.id as string };
  });
}

export async function updateEvent(
  db: Database,
  params: { actor: Actor | null; eventId: string; patch: Partial<EventInput> },
): Promise<void> {
  const actor = requireEventManagement(params.actor);

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(events).where(eq(events.id, params.eventId)).limit(1);
    if (!before) throw new NotFoundError('Encontro não encontrado.');

    await tx
      .update(events)
      .set({ ...params.patch, updatedAt: new Date() })
      .where(eq(events.id, params.eventId));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'evento.editar',
      entityType: 'event',
      entityId: params.eventId,
      before: { title: before.title, eventDate: before.eventDate, status: before.status },
      after: params.patch,
    });
  });
}

export async function setEventStatus(
  db: Database,
  params: {
    actor: Actor | null;
    eventId: string;
    status: 'rascunho' | 'publicado' | 'em_andamento' | 'finalizado' | 'cancelado';
    reason?: string;
  },
): Promise<void> {
  const actor = requireEventManagement(params.actor);

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(events)
      .where(eq(events.id, params.eventId))
      .for('update')
      .limit(1);

    if (!before) throw new NotFoundError('Encontro não encontrado.');

    if (before.status === 'finalizado' && params.status !== 'finalizado') {
      throw new ConflictError('Um encontro finalizado não volta a outro estado.');
    }

    await tx
      .update(events)
      .set({ status: params.status, updatedAt: new Date() })
      .where(eq(events.id, params.eventId));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: `evento.${params.status}`,
      entityType: 'event',
      entityId: params.eventId,
      before: { status: before.status },
      after: { status: params.status },
      reason: params.reason ?? null,
    });
  });
}

export interface EventSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  eventDate: string;
  startTime: string | null;
  venueName: string | null;
  address: string | null;
  notes: string | null;
  capacity: number;
  confirmationDeadline: Date | null;
  confirmedCount: number;
  waitlistCount: number;
  hasPublishedFormation: boolean;
  formationNeedsReview: boolean;
}

const summarySelection = {
  id: events.id,
  title: events.title,
  type: events.type,
  status: events.status,
  eventDate: events.eventDate,
  startTime: events.startTime,
  venueName: events.venueName,
  address: events.address,
  notes: events.notes,
  capacity: events.capacity,
  confirmationDeadline: events.confirmationDeadline,
  confirmedCount: sql<number>`(select count(*) from event_participants p where p.event_id = ${outer(events.id)} and p.status = 'confirmado')::int`,
  waitlistCount: sql<number>`(select count(*) from event_participants p where p.event_id = ${outer(events.id)} and p.status = 'lista_espera')::int`,
  publishedFormations: sql<number>`(select count(*) from team_formations f where f.event_id = ${outer(events.id)} and f.status = 'publicada')::int`,
  reviewFormations: sql<number>`(select count(*) from team_formations f where f.event_id = ${outer(events.id)} and f.status = 'necessita_revisao')::int`,
};

function toSummary(
  row: {
    publishedFormations: number;
    reviewFormations: number;
  } & Omit<EventSummary, 'hasPublishedFormation' | 'formationNeedsReview'>,
): EventSummary {
  const { publishedFormations, reviewFormations, ...rest } = row;
  return {
    ...rest,
    hasPublishedFormation: publishedFormations > 0,
    formationNeedsReview: reviewFormations > 0,
  };
}

/** Agenda futura, visível a qualquer conta ativa. */
export async function listUpcomingEvents(
  db: Database,
  params: { actor: Actor | null; limit?: number },
): Promise<EventSummary[]> {
  requireActive(params.actor);

  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select(summarySelection)
    .from(events)
    .where(
      and(
        isNull(events.deletedAt),
        gte(events.eventDate, today),
        sql`${events.status} in ('publicado', 'em_andamento')`,
      ),
    )
    .orderBy(asc(events.eventDate), asc(events.startTime))
    .limit(params.limit ?? 10);

  return rows.map(toSummary);
}

export async function listPastEvents(
  db: Database,
  params: { actor: Actor | null; limit?: number },
): Promise<EventSummary[]> {
  requireActive(params.actor);

  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select(summarySelection)
    .from(events)
    .where(and(isNull(events.deletedAt), lt(events.eventDate, today)))
    .orderBy(desc(events.eventDate))
    .limit(params.limit ?? 20);

  return rows.map(toSummary);
}

/** Todos os encontros, inclusive rascunhos. Exclusivo de administradores. */
export async function listAllEvents(
  db: Database,
  params: { actor: Actor | null; limit?: number },
): Promise<EventSummary[]> {
  requireEventManagement(params.actor);

  const rows = await db
    .select(summarySelection)
    .from(events)
    .where(isNull(events.deletedAt))
    .orderBy(desc(events.eventDate))
    .limit(params.limit ?? 50);

  return rows.map(toSummary);
}

export async function getEvent(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<EventSummary | null> {
  requireActive(params.actor);

  const rows = await db.select(summarySelection).from(events).where(eq(events.id, params.eventId));
  const row = rows[0];
  return row ? toSummary(row) : null;
}

/** O próximo encontro publicado — destaque dos dois painéis (§17). */
export async function getNextEvent(
  db: Database,
  actor: Actor | null,
): Promise<EventSummary | null> {
  const upcoming = await listUpcomingEvents(db, { actor, limit: 1 });
  return upcoming[0] ?? null;
}

/** Situação do atleta logado no evento, para decidir qual ação mostrar. */
export async function getMyParticipation(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<{ status: string; waitlistPosition: number | null } | null> {
  const active = requireActive(params.actor);
  if (!active.athleteId) return null;

  const [row] = await db
    .select({
      status: eventParticipants.status,
      waitlistPosition: eventParticipants.waitlistPosition,
    })
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, params.eventId),
        eq(eventParticipants.athleteId, active.athleteId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Formações de um evento, da mais recente para a mais antiga. */
export async function listFormationVersions(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<
  { id: string; version: number; status: string; strategy: string; publishedAt: Date | null }[]
> {
  requireEventManagement(params.actor);

  return db
    .select({
      id: teamFormations.id,
      version: teamFormations.version,
      status: teamFormations.status,
      strategy: teamFormations.strategy,
      publishedAt: teamFormations.publishedAt,
    })
    .from(teamFormations)
    .where(eq(teamFormations.eventId, params.eventId))
    .orderBy(desc(teamFormations.version));
}
