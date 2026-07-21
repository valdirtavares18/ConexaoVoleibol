import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  clubSettings,
  courtRotationHistory,
  courtRotationSessions,
  events,
  matches,
  teamFormations,
  teams,
} from '@/db/schema';
import { ConflictError, NotFoundError, RotationError } from '@/domain/shared/errors';
import {
  completeMatch,
  previewNextMatch,
  startSession,
  undoLastMatch,
  type MatchOutcome,
  type MatchRecord,
  type RotationState,
  type TeamId,
} from '@/domain/rotation';
import { requireCourtOperation, type Actor } from '@/server/policies';
import { recordAudit } from './audit';
import { getPublishedFormationTeams, type TeamSummary } from './team-summaries';

/**
 * Painel de quadra (§11) ligado ao banco.
 *
 * O estado do rodízio é **derivado do histórico de partidas**, não guardado como
 * fonte de verdade paralela. A coluna de estado na sessão é um cache de leitura;
 * `rebuildState` é quem manda. Isso elimina a classe de bug em que o painel
 * mostra um confronto e o histórico conta outra história.
 */

export interface CourtPanelState {
  sessionId: string;
  formationId: string;
  matchNumber: number;
  left: TeamSummary;
  right: TeamSummary;
  waiting: TeamSummary;
  consecutiveByTeam: Record<string, number>;
  /** Quem já se sabe que sai, independentemente do placar. */
  forcedLeavingTeamId: string | null;
  nextMatchDescription: string;
  history: MatchHistoryEntry[];
  finished: boolean;
}

export type { TeamSummary };

export interface MatchHistoryEntry {
  matchNumber: number;
  leftTeamName: string;
  rightTeamName: string;
  leftScore: number | null;
  rightScore: number | null;
  winnerTeamName: string | null;
  leavingTeamName: string;
  leaveReason: MatchRecord['leaveReason'];
}

/** Inicia o rodízio a partir da formação publicada do evento. */
export async function startCourtSession(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<{ sessionId: string }> {
  const actor = requireCourtOperation(params.actor);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(courtRotationSessions)
      .where(
        and(
          eq(courtRotationSessions.eventId, params.eventId),
          isNull(courtRotationSessions.finishedAt),
        ),
      )
      .limit(1);

    if (existing) return { sessionId: existing.id };

    const [formation] = await tx
      .select()
      .from(teamFormations)
      .where(
        and(eq(teamFormations.eventId, params.eventId), eq(teamFormations.status, 'publicada')),
      )
      .limit(1);

    if (!formation) {
      throw new ConflictError('Publique os times antes de começar o rodízio.', {
        eventId: params.eventId,
      });
    }

    const teamRows = await tx
      .select()
      .from(teams)
      .where(eq(teams.formationId, formation.id))
      .orderBy(asc(teams.teamIndex));

    if (teamRows.length !== 3) {
      throw new RotationError('O rodízio do CVA precisa de exatamente três times.');
    }

    const [a, b, c] = teamRows.map((t) => t.id) as [string, string, string];
    const state = startSession([a, b, c]);

    const [session] = await tx
      .insert(courtRotationSessions)
      .values({
        eventId: params.eventId,
        formationId: formation.id,
        currentMatchNumber: state.matchNumber,
        leftTeamId: state.leftTeamId,
        rightTeamId: state.rightTeamId,
        waitingTeamId: state.waitingTeamId,
        consecutiveByTeam: state.consecutiveByTeam,
      })
      .returning({ id: courtRotationSessions.id });

    const sessionId = session?.id as string;

    await tx.update(events).set({ status: 'em_andamento' }).where(eq(events.id, params.eventId));

    await tx.insert(courtRotationHistory).values({
      sessionId,
      action: 'iniciar',
      stateAfter: state,
      performedByUserId: actor.userId,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'quadra.iniciar',
      entityType: 'court_rotation_session',
      entityId: sessionId,
      after: state,
    });

    return { sessionId };
  });
}

/** Reconstrói o estado corrente relendo as partidas registradas. */
async function rebuildState(
  db: Database,
  sessionId: string,
): Promise<{ state: RotationState; records: MatchRecord[]; maxConsecutive: number }> {
  const [session] = await db
    .select()
    .from(courtRotationSessions)
    .where(eq(courtRotationSessions.id, sessionId))
    .limit(1);

  if (!session) throw new NotFoundError('Sessão de rodízio não encontrada.');

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.formationId, session.formationId))
    .orderBy(asc(teams.teamIndex));

  const [a, b, c] = teamRows.map((t) => t.id) as [string, string, string];

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.sessionId, sessionId))
    .orderBy(asc(matches.matchNumber));

  const records: MatchRecord[] = matchRows.map((row) => ({
    matchNumber: row.matchNumber,
    leftTeamId: row.leftTeamId,
    rightTeamId: row.rightTeamId,
    waitingTeamId: row.waitingTeamId,
    leftScore: row.leftScore,
    rightScore: row.rightScore,
    winnerTeamId: row.winnerTeamId,
    leavingTeamId: row.leavingTeamId,
    stayingTeamId: row.stayingTeamId,
    enteringTeamId: row.enteringTeamId,
    leaveReason: row.leaveReason,
    overrideJustification: row.overrideJustification,
  }));

  let state = startSession([a, b, c]);
  for (const record of records) {
    state = {
      matchNumber: record.matchNumber + 1,
      leftTeamId:
        record.leavingTeamId === record.leftTeamId ? record.enteringTeamId : record.stayingTeamId,
      rightTeamId:
        record.leavingTeamId === record.leftTeamId ? record.stayingTeamId : record.enteringTeamId,
      waitingTeamId: record.leavingTeamId,
      consecutiveByTeam: {
        [record.stayingTeamId]: (state.consecutiveByTeam[record.stayingTeamId] ?? 0) + 1,
        [record.enteringTeamId]: 1,
        [record.leavingTeamId]: 0,
      },
    };
  }

  return { state, records, maxConsecutive: session.maxConsecutiveMatches };
}

/** Encerra a partida atual e calcula o próximo confronto. */
export async function finishMatch(
  db: Database,
  params: {
    actor: Actor | null;
    sessionId: string;
    outcome: MatchOutcome;
    stayingTeamIdOnTie?: TeamId;
    override?: { leavingTeamId: TeamId; justification: string };
  },
): Promise<{ record: MatchRecord; next: RotationState }> {
  const actor = requireCourtOperation(params.actor);

  return db.transaction(async (tx) => {
    // Lock da sessão: duas pessoas encerrando a mesma partida no celular não
    // podem gravar duas partidas com o mesmo número.
    const [session] = await tx
      .select()
      .from(courtRotationSessions)
      .where(eq(courtRotationSessions.id, params.sessionId))
      .for('update')
      .limit(1);

    if (!session) throw new NotFoundError('Sessão de rodízio não encontrada.');
    if (session.finishedAt) throw new ConflictError('Este rodízio já foi encerrado.');

    const { state, maxConsecutive } = await rebuildState(
      tx as unknown as Database,
      params.sessionId,
    );

    const { record, next } = completeMatch(
      state,
      params.outcome,
      {
        ...(params.stayingTeamIdOnTie ? { stayingTeamIdOnTie: params.stayingTeamIdOnTie } : {}),
        ...(params.override ? { override: params.override } : {}),
      },
      { maxConsecutiveMatches: maxConsecutive },
    );

    await tx.insert(matches).values({
      sessionId: params.sessionId,
      matchNumber: record.matchNumber,
      leftTeamId: record.leftTeamId,
      rightTeamId: record.rightTeamId,
      waitingTeamId: record.waitingTeamId,
      leftScore: record.leftScore,
      rightScore: record.rightScore,
      winnerTeamId: record.winnerTeamId,
      leavingTeamId: record.leavingTeamId,
      stayingTeamId: record.stayingTeamId,
      enteringTeamId: record.enteringTeamId,
      leaveReason: record.leaveReason,
      overrideJustification: record.overrideJustification,
      recordedByUserId: actor.userId,
    });

    await tx
      .update(courtRotationSessions)
      .set({
        currentMatchNumber: next.matchNumber,
        leftTeamId: next.leftTeamId,
        rightTeamId: next.rightTeamId,
        waitingTeamId: next.waitingTeamId,
        consecutiveByTeam: next.consecutiveByTeam,
      })
      .where(eq(courtRotationSessions.id, params.sessionId));

    await tx.insert(courtRotationHistory).values({
      sessionId: params.sessionId,
      action: params.override ? 'encerrar_com_override' : 'encerrar',
      stateAfter: next,
      justification: record.overrideJustification,
      performedByUserId: actor.userId,
    });

    // Override manual sempre gera auditoria com justificativa (§11.3).
    if (params.override) {
      await recordAudit(tx, {
        actorUserId: actor.userId,
        action: 'quadra.override',
        entityType: 'match',
        entityId: `${params.sessionId}:${record.matchNumber}`,
        after: record,
        reason: record.overrideJustification,
      });
    }

    return { record, next };
  });
}

/**
 * Corrige a última ação, restaurando exatamente o estado anterior (§11.3).
 *
 * A partida é removida, mas a correção fica registrada em
 * `court_rotation_history` — o histórico de ações continua completo.
 */
export async function undoLastFinishedMatch(
  db: Database,
  params: { actor: Actor | null; sessionId: string },
): Promise<RotationState> {
  const actor = requireCourtOperation(params.actor);

  return db.transaction(async (tx) => {
    await tx
      .select()
      .from(courtRotationSessions)
      .where(eq(courtRotationSessions.id, params.sessionId))
      .for('update')
      .limit(1);

    const { records } = await rebuildState(tx as unknown as Database, params.sessionId);
    if (records.length === 0) {
      throw new RotationError('Não há partida registrada para corrigir.');
    }

    const restored = undoLastMatch(records);
    const last = records[records.length - 1] as MatchRecord;

    await tx
      .delete(matches)
      .where(
        and(eq(matches.sessionId, params.sessionId), eq(matches.matchNumber, last.matchNumber)),
      );

    await tx
      .update(courtRotationSessions)
      .set({
        currentMatchNumber: restored.matchNumber,
        leftTeamId: restored.leftTeamId,
        rightTeamId: restored.rightTeamId,
        waitingTeamId: restored.waitingTeamId,
        consecutiveByTeam: restored.consecutiveByTeam,
      })
      .where(eq(courtRotationSessions.id, params.sessionId));

    await tx.insert(courtRotationHistory).values({
      sessionId: params.sessionId,
      action: 'corrigir_ultima',
      stateAfter: restored,
      performedByUserId: actor.userId,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'quadra.corrigir',
      entityType: 'match',
      entityId: `${params.sessionId}:${last.matchNumber}`,
      before: last,
      reason: 'Correção da última partida registrada.',
    });

    return restored;
  });
}

export async function finishCourtSession(
  db: Database,
  params: { actor: Actor | null; sessionId: string },
): Promise<void> {
  const actor = requireCourtOperation(params.actor);

  await db.transaction(async (tx) => {
    const [session] = await tx
      .update(courtRotationSessions)
      .set({ finishedAt: new Date() })
      .where(eq(courtRotationSessions.id, params.sessionId))
      .returning({ eventId: courtRotationSessions.eventId });

    if (session) {
      await tx.update(events).set({ status: 'finalizado' }).where(eq(events.id, session.eventId));
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'quadra.encerrar',
      entityType: 'court_rotation_session',
      entityId: params.sessionId,
    });
  });
}

/** Tudo que o painel de quadra precisa exibir, em uma consulta. */
export async function getCourtPanel(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<CourtPanelState | null> {
  requireCourtOperation(params.actor);

  const [session] = await db
    .select()
    .from(courtRotationSessions)
    .where(eq(courtRotationSessions.eventId, params.eventId))
    .orderBy(desc(courtRotationSessions.startedAt))
    .limit(1);

  if (!session) return null;

  const { state, records, maxConsecutive } = await rebuildState(db, session.id);

  const summaries = await getPublishedFormationTeams(db, session.formationId);
  const byId = new Map(summaries.map((t) => [t.id, t]));
  const nameOf = (id: string | null): string => (id ? (byId.get(id)?.name ?? 'Time') : '—');

  const preview = previewNextMatch(state, { maxConsecutiveMatches: maxConsecutive });

  return {
    sessionId: session.id,
    formationId: session.formationId,
    matchNumber: state.matchNumber,
    left: byId.get(state.leftTeamId) as TeamSummary,
    right: byId.get(state.rightTeamId) as TeamSummary,
    waiting: byId.get(state.waitingTeamId) as TeamSummary,
    consecutiveByTeam: state.consecutiveByTeam,
    forcedLeavingTeamId: preview.leavingTeamId,
    nextMatchDescription: preview.description,
    finished: session.finishedAt !== null,
    history: records.map((record) => ({
      matchNumber: record.matchNumber,
      leftTeamName: nameOf(record.leftTeamId),
      rightTeamName: nameOf(record.rightTeamId),
      leftScore: record.leftScore,
      rightScore: record.rightScore,
      winnerTeamName: record.winnerTeamId ? nameOf(record.winnerTeamId) : null,
      leavingTeamName: nameOf(record.leavingTeamId),
      leaveReason: record.leaveReason,
    })),
  };
}

/** Configuração do limite de partidas consecutivas. */
export async function getMaxConsecutiveMatches(db: Database): Promise<number> {
  const [settings] = await db
    .select({ value: clubSettings.maxConsecutiveMatches })
    .from(clubSettings)
    .where(eq(clubSettings.id, 'default'))
    .limit(1);

  return settings?.value ?? 2;
}
