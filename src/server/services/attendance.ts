import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { eventParticipants, events, teamFormations } from '@/db/schema';
import { ConflictError, DomainError, NotFoundError } from '@/domain/shared/errors';
import { requireAttendanceResponse, requireEventManagement, type Actor } from '@/server/policies';
import { recordAudit } from './audit';

/**
 * Presenças e lista de espera (§9.2 e §9.3).
 *
 * ## A invariante que este módulo existe para proteger
 *
 * Um encontro tem capacidade 18. O 19º **não** pode ser confirmado — precisa ir
 * para a lista de espera. Duas pessoas tocando "confirmar" no mesmo instante
 * não podem produzir 19 confirmados.
 *
 * Três mecanismos, em camadas:
 *
 * 1. **`SELECT ... FOR UPDATE` na linha do evento.** É o mecanismo principal:
 *    serializa todas as respostas de um mesmo evento. Um contador lido fora do
 *    lock estaria desatualizado no instante seguinte.
 * 2. **Índice único parcial** `(event_id, confirmed_slot)`. Rede de segurança:
 *    se um caminho futuro esquecer o lock, o banco recusa em vez de corromper.
 * 3. **Slot explícito** em vez de `count(*)`. O slot é um recurso concreto e
 *    escasso; alocá-lo torna o limite representável no schema.
 *
 * Bloquear a linha do evento serializa apenas as respostas *daquele* encontro —
 * eventos diferentes não disputam o mesmo lock.
 */

export type AttendanceResponse = 'confirmar' | 'talvez' | 'nao_participar' | 'cancelar';

export interface AttendanceOutcome {
  status: 'confirmado' | 'talvez' | 'nao_participa' | 'lista_espera' | 'cancelou_apos_prazo';
  /** Slot ocupado, quando confirmado. */
  confirmedSlot: number | null;
  /** Posição na fila, quando em lista de espera. */
  waitlistPosition: number | null;
  /** Atleta promovido da lista de espera por este cancelamento, se houve. */
  promotedAthleteId: string | null;
  /** `true` quando a formação publicada passou a precisar de revisão. */
  formationNeedsReview: boolean;
}

/** Menor slot livre dentro da capacidade. `null` quando o evento está lotado. */
function firstFreeSlot(taken: readonly number[], capacity: number): number | null {
  const used = new Set(taken);
  for (let slot = 1; slot <= capacity; slot++) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

export async function respondToEvent(
  db: Database,
  params: {
    actor: Actor | null;
    eventId: string;
    athleteId: string;
    response: AttendanceResponse;
    /** Admin respondendo em nome de um perfil gerenciado. */
    onBehalf?: boolean;
  },
): Promise<AttendanceOutcome> {
  const actor = requireAttendanceResponse(params.actor, params.athleteId);

  return db.transaction(async (tx) => {
    // Lock da linha do evento: serializa todas as respostas deste encontro.
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, params.eventId))
      .for('update')
      .limit(1);

    if (!event || event.deletedAt) {
      throw new NotFoundError('Este encontro não foi encontrado.');
    }

    if (event.status === 'cancelado') {
      throw new ConflictError('Este encontro foi cancelado.');
    }
    if (event.status === 'rascunho') {
      throw new ConflictError('Este encontro ainda não foi publicado.');
    }
    if (event.status === 'finalizado') {
      throw new ConflictError('Este encontro já foi finalizado.');
    }

    const pastDeadline =
      event.confirmationDeadline !== null && event.confirmationDeadline.getTime() < Date.now();

    const [existing] = await tx
      .select()
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, params.eventId),
          eq(eventParticipants.athleteId, params.athleteId),
        ),
      )
      .limit(1);

    const wasConfirmed = existing?.status === 'confirmado';
    const freedSlot = wasConfirmed ? existing.confirmedSlot : null;

    let outcome: AttendanceOutcome = {
      status: 'talvez',
      confirmedSlot: null,
      waitlistPosition: null,
      promotedAthleteId: null,
      formationNeedsReview: false,
    };

    if (params.response === 'confirmar') {
      if (wasConfirmed) {
        return {
          ...outcome,
          status: 'confirmado',
          confirmedSlot: existing.confirmedSlot,
        };
      }

      if (pastDeadline && !params.onBehalf) {
        throw new DomainError(
          'PRAZO_ENCERRADO',
          'O prazo de confirmação deste encontro já passou. Fale com um administrador.',
        );
      }

      const taken = await tx
        .select({ slot: eventParticipants.confirmedSlot })
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, params.eventId),
            isNotNull(eventParticipants.confirmedSlot),
          ),
        );

      const slot = firstFreeSlot(
        taken.map((row) => row.slot).filter((s): s is number => s !== null),
        event.capacity,
      );

      if (slot === null) {
        // Evento lotado: entra na fila, nunca como 19º confirmado.
        const [last] = await tx
          .select({ max: sql<number | null>`max(${eventParticipants.waitlistPosition})` })
          .from(eventParticipants)
          .where(eq(eventParticipants.eventId, params.eventId));

        const position = (last?.max ?? 0) + 1;

        outcome = {
          ...outcome,
          status: 'lista_espera',
          waitlistPosition: position,
        };
      } else {
        outcome = { ...outcome, status: 'confirmado', confirmedSlot: slot };
      }
    } else if (params.response === 'talvez') {
      outcome = { ...outcome, status: 'talvez' };
    } else {
      // `nao_participar` e `cancelar` liberam slot e saem da fila.
      outcome = {
        ...outcome,
        status: pastDeadline && wasConfirmed ? 'cancelou_apos_prazo' : 'nao_participa',
      };
    }

    await tx
      .insert(eventParticipants)
      .values({
        eventId: params.eventId,
        athleteId: params.athleteId,
        status: outcome.status,
        confirmedSlot: outcome.confirmedSlot,
        waitlistPosition: outcome.waitlistPosition,
        respondedAt: new Date(),
        respondedByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: [eventParticipants.eventId, eventParticipants.athleteId],
        set: {
          status: outcome.status,
          confirmedSlot: outcome.confirmedSlot,
          waitlistPosition: outcome.waitlistPosition,
          respondedAt: new Date(),
          respondedByUserId: actor.userId,
          updatedAt: new Date(),
        },
      });

    // --- Promoção da lista de espera --------------------------------------
    // Acontece na **mesma transação** que liberou a vaga: não existe instante
    // em que a vaga esteja livre e a fila parada.
    if (freedSlot !== null) {
      const [next] = await tx
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, params.eventId),
            eq(eventParticipants.status, 'lista_espera'),
          ),
        )
        .orderBy(asc(eventParticipants.waitlistPosition))
        .limit(1);

      if (next) {
        await tx
          .update(eventParticipants)
          .set({
            status: 'confirmado',
            confirmedSlot: freedSlot,
            waitlistPosition: null,
            updatedAt: new Date(),
          })
          .where(eq(eventParticipants.id, next.id));

        outcome = { ...outcome, promotedAthleteId: next.athleteId };
      }

      // §9.4 — formação publicada deixa de refletir a lista de confirmados.
      const [published] = await tx
        .select()
        .from(teamFormations)
        .where(
          and(
            eq(teamFormations.eventId, params.eventId),
            eq(teamFormations.status, 'publicada'),
          ),
        )
        .limit(1);

      if (published) {
        await tx
          .update(teamFormations)
          .set({
            status: 'necessita_revisao',
            reviewReason: next
              ? 'Um atleta cancelou e o primeiro da lista de espera foi promovido.'
              : 'Um atleta cancelou e a vaga ficou aberta.',
          })
          .where(eq(teamFormations.id, published.id));

        outcome = { ...outcome, formationNeedsReview: true };
      }
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: `presenca.${params.response}`,
      entityType: 'event_participant',
      entityId: `${params.eventId}:${params.athleteId}`,
      before: existing
        ? { status: existing.status, confirmedSlot: existing.confirmedSlot }
        : null,
      after: { status: outcome.status, confirmedSlot: outcome.confirmedSlot },
    });

    return outcome;
  });
}

/** Reordena a fila de espera manualmente (§9.3). Exclusivo de administradores. */
export async function reorderWaitlist(
  db: Database,
  params: { actor: Actor | null; eventId: string; orderedAthleteIds: readonly string[] },
): Promise<void> {
  const actor = requireEventManagement(params.actor);

  await db.transaction(async (tx) => {
    await tx.select().from(events).where(eq(events.id, params.eventId)).for('update').limit(1);

    // Duas passadas: a primeira move para uma faixa alta temporária, para não
    // colidir com o índice único durante a renumeração. A faixa precisa ser
    // **positiva** — o CHECK `event_waitlist_position_positive` (corretamente)
    // recusa zero e negativos.
    const TEMP_OFFSET = 100_000;

    for (const [index, athleteId] of params.orderedAthleteIds.entries()) {
      await tx
        .update(eventParticipants)
        .set({ waitlistPosition: TEMP_OFFSET + index + 1 })
        .where(
          and(
            eq(eventParticipants.eventId, params.eventId),
            eq(eventParticipants.athleteId, athleteId),
            eq(eventParticipants.status, 'lista_espera'),
          ),
        );
    }

    for (const [index, athleteId] of params.orderedAthleteIds.entries()) {
      await tx
        .update(eventParticipants)
        .set({ waitlistPosition: index + 1, updatedAt: new Date() })
        .where(
          and(
            eq(eventParticipants.eventId, params.eventId),
            eq(eventParticipants.athleteId, athleteId),
            eq(eventParticipants.status, 'lista_espera'),
          ),
        );
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'presenca.reordenar_fila',
      entityType: 'event',
      entityId: params.eventId,
      after: { ordem: params.orderedAthleteIds },
    });
  });
}

export interface EventRoster {
  confirmed: { athleteId: string; slot: number }[];
  waitlist: { athleteId: string; position: number }[];
  maybe: string[];
  declined: string[];
}

export async function getRoster(db: Database, eventId: string): Promise<EventRoster> {
  const rows = await db
    .select()
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId))
    .orderBy(asc(eventParticipants.confirmedSlot), asc(eventParticipants.waitlistPosition));

  return {
    confirmed: rows
      .filter((r) => r.status === 'confirmado' && r.confirmedSlot !== null)
      .map((r) => ({ athleteId: r.athleteId, slot: r.confirmedSlot as number })),
    waitlist: rows
      .filter((r) => r.status === 'lista_espera' && r.waitlistPosition !== null)
      .map((r) => ({ athleteId: r.athleteId, position: r.waitlistPosition as number })),
    maybe: rows.filter((r) => r.status === 'talvez').map((r) => r.athleteId),
    declined: rows
      .filter((r) => r.status === 'nao_participa' || r.status === 'cancelou_apos_prazo')
      .map((r) => r.athleteId),
  };
}
