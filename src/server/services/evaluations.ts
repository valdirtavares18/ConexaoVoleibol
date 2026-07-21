import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  athletes,
  clubSettings,
  evaluationHistory,
  eventParticipants,
  events,
  officialEvaluationSkills,
  officialEvaluations,
  positionRatings,
  selfAssessmentPositions,
  selfAssessmentSkills,
  selfAssessments,
} from '@/db/schema';
import type { PositionCode, SkillCode } from '@/domain/positions';
import { DomainError, NotFoundError } from '@/domain/shared/errors';
import { isValidRating, type Rating } from '@/domain/shared/rating';
import {
  canViewOfficialEvaluation,
  requireAdmin,
  requireOfficialEvaluationEdit,
  requireSelfAssessmentSubmit,
  type Actor,
} from '@/server/policies';
import { recordAudit } from './audit';

/**
 * Avaliações (§7).
 *
 * Autoavaliação e avaliação oficial são **tabelas separadas** e nunca se
 * misturam: não existe caminho de código em que um envio do atleta altere a nota
 * oficial. O gerador de times lê exclusivamente a oficial.
 */

function ratingToColumn(value: Rating): string | null {
  if (value === null) return null;
  if (!isValidRating(value)) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      `Nota inválida: ${value}. Use valores de 1 a 5, de meio em meio ponto.`,
    );
  }
  return value.toFixed(1);
}

function columnToRating(value: string | null): Rating {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Autoavaliação
// ---------------------------------------------------------------------------

export interface SelfAssessmentPayload {
  overall: Rating;
  note?: string | null;
  skills: Partial<Record<SkillCode, Rating>>;
  positions?: Partial<Record<PositionCode, Rating>>;
}

/**
 * Envia uma autoavaliação. Cada envio cria uma **nova revisão** — o histórico
 * anterior nunca é sobrescrito (§7.1).
 */
export async function submitSelfAssessment(
  db: Database,
  params: { actor: Actor | null; athleteId: string; payload: SelfAssessmentPayload },
): Promise<{ assessmentId: string; revision: number }> {
  const actor = requireSelfAssessmentSubmit(params.actor, params.athleteId);

  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ revision: selfAssessments.revision })
      .from(selfAssessments)
      .where(eq(selfAssessments.athleteId, params.athleteId))
      .orderBy(desc(selfAssessments.revision))
      .limit(1);

    const revision = (last?.revision ?? 0) + 1;

    const [assessment] = await tx
      .insert(selfAssessments)
      .values({
        athleteId: params.athleteId,
        revision,
        overall: ratingToColumn(params.payload.overall),
        note: params.payload.note ?? null,
      })
      .returning({ id: selfAssessments.id });

    const assessmentId = assessment?.id as string;

    const skillRows = Object.entries(params.payload.skills).map(([skill, rating]) => ({
      assessmentId,
      skill: skill as SkillCode,
      rating: ratingToColumn(rating ?? null),
    }));
    if (skillRows.length > 0) await tx.insert(selfAssessmentSkills).values(skillRows);

    const positionRows = Object.entries(params.payload.positions ?? {}).map(
      ([position, rating]) => ({
        assessmentId,
        position: position as PositionCode,
        rating: ratingToColumn(rating ?? null),
      }),
    );
    if (positionRows.length > 0) await tx.insert(selfAssessmentPositions).values(positionRows);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'autoavaliacao.enviar',
      entityType: 'self_assessment',
      entityId: assessmentId,
      after: { revision },
    });

    return { assessmentId, revision };
  });
}

export interface AssessmentView {
  revision: number;
  overall: Rating;
  note: string | null;
  submittedAt: Date;
  skills: Partial<Record<SkillCode, Rating>>;
}

/** Autoavaliação mais recente de um atleta. */
export async function getCurrentSelfAssessment(
  db: Database,
  athleteId: string,
): Promise<AssessmentView | null> {
  const [assessment] = await db
    .select()
    .from(selfAssessments)
    .where(eq(selfAssessments.athleteId, athleteId))
    .orderBy(desc(selfAssessments.revision))
    .limit(1);

  if (!assessment) return null;

  const skills = await db
    .select()
    .from(selfAssessmentSkills)
    .where(eq(selfAssessmentSkills.assessmentId, assessment.id));

  return {
    revision: assessment.revision,
    overall: columnToRating(assessment.overall),
    note: assessment.note,
    submittedAt: assessment.submittedAt,
    skills: Object.fromEntries(skills.map((s) => [s.skill, columnToRating(s.rating)])),
  };
}

// ---------------------------------------------------------------------------
// Avaliação oficial
// ---------------------------------------------------------------------------

export interface OfficialEvaluationPayload {
  overall: Rating;
  status: 'provisoria' | 'definitiva';
  skills: Partial<Record<SkillCode, Rating>>;
  positions?: Partial<Record<PositionCode, Rating>>;
  internalNote?: string | null;
  justification: string;
}

export interface OfficialEvaluationView extends AssessmentView {
  id: string;
  status: 'provisoria' | 'definitiva';
  internalNote: string | null;
  positions: Partial<Record<PositionCode, Rating>>;
}

/**
 * Define a avaliação oficial. Apenas administradores (§7.2).
 *
 * Cria uma nova revisão, marca a anterior como não vigente e grava o diff em
 * `evaluation_history`, que é **append-only**: a aplicação nunca atualiza nem
 * apaga essa tabela.
 */
export async function setOfficialEvaluation(
  db: Database,
  params: { actor: Actor | null; athleteId: string; payload: OfficialEvaluationPayload },
): Promise<{ evaluationId: string; revision: number }> {
  const actor = requireOfficialEvaluationEdit(params.actor);

  if (params.payload.justification.trim().length < 3) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Descreva o motivo da avaliação — ele fica registrado no histórico.',
    );
  }

  return db.transaction(async (tx) => {
    const [athlete] = await tx
      .select({ id: athletes.id })
      .from(athletes)
      .where(eq(athletes.id, params.athleteId))
      .limit(1);
    if (!athlete) throw new NotFoundError('Atleta não encontrado.');

    const previous = await loadCurrentOfficial(tx as unknown as Database, params.athleteId);

    const [last] = await tx
      .select({ revision: officialEvaluations.revision })
      .from(officialEvaluations)
      .where(eq(officialEvaluations.athleteId, params.athleteId))
      .orderBy(desc(officialEvaluations.revision))
      .limit(1);

    const revision = (last?.revision ?? 0) + 1;

    // A anterior sai de vigente antes de a nova entrar: o índice único parcial
    // garante que só exista uma `is_current` por atleta.
    await tx
      .update(officialEvaluations)
      .set({ isCurrent: false })
      .where(
        and(
          eq(officialEvaluations.athleteId, params.athleteId),
          eq(officialEvaluations.isCurrent, true),
        ),
      );

    const participations = await countFinishedParticipations(
      tx as unknown as Database,
      params.athleteId,
    );

    const [created] = await tx
      .insert(officialEvaluations)
      .values({
        athleteId: params.athleteId,
        revision,
        overall: ratingToColumn(params.payload.overall),
        status: params.payload.status,
        isCurrent: true,
        internalNote: params.payload.internalNote ?? null,
        justification: params.payload.justification.trim(),
        participationsAtCreation: participations,
        evaluatedByUserId: actor.userId,
      })
      .returning({ id: officialEvaluations.id });

    const evaluationId = created?.id as string;

    const skillRows = Object.entries(params.payload.skills).map(([skill, rating]) => ({
      evaluationId,
      skill: skill as SkillCode,
      rating: ratingToColumn(rating ?? null),
    }));
    if (skillRows.length > 0) await tx.insert(officialEvaluationSkills).values(skillRows);

    const positionRows = Object.entries(params.payload.positions ?? {}).map(
      ([position, rating]) => ({
        evaluationId,
        position: position as PositionCode,
        rating: ratingToColumn(rating ?? null),
      }),
    );
    if (positionRows.length > 0) await tx.insert(positionRatings).values(positionRows);

    // --- Histórico imutável ------------------------------------------------
    const changes: Record<string, { anterior: unknown; novo: unknown }> = {};

    if (previous?.overall !== params.payload.overall) {
      changes.nivel_geral = { anterior: previous?.overall ?? null, novo: params.payload.overall };
    }
    if (previous?.status !== params.payload.status) {
      changes.status = { anterior: previous?.status ?? null, novo: params.payload.status };
    }
    for (const [skill, rating] of Object.entries(params.payload.skills)) {
      const before = previous?.skills[skill as SkillCode] ?? null;
      if (before !== (rating ?? null)) {
        changes[skill] = { anterior: before, novo: rating ?? null };
      }
    }

    await tx.insert(evaluationHistory).values({
      athleteId: params.athleteId,
      evaluationId,
      changedByUserId: actor.userId,
      status: params.payload.status,
      justification: params.payload.justification.trim(),
      changes,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'avaliacao_oficial.definir',
      entityType: 'official_evaluation',
      entityId: evaluationId,
      before: previous ? { overall: previous.overall, status: previous.status } : null,
      after: { overall: params.payload.overall, status: params.payload.status },
      reason: params.payload.justification.trim(),
    });

    return { evaluationId, revision };
  });
}

async function loadCurrentOfficial(
  db: Database,
  athleteId: string,
): Promise<OfficialEvaluationView | null> {
  const [evaluation] = await db
    .select()
    .from(officialEvaluations)
    .where(
      and(eq(officialEvaluations.athleteId, athleteId), eq(officialEvaluations.isCurrent, true)),
    )
    .limit(1);

  if (!evaluation) return null;

  const [skills, positionRows] = await Promise.all([
    db
      .select()
      .from(officialEvaluationSkills)
      .where(eq(officialEvaluationSkills.evaluationId, evaluation.id)),
    db.select().from(positionRatings).where(eq(positionRatings.evaluationId, evaluation.id)),
  ]);

  return {
    id: evaluation.id,
    revision: evaluation.revision,
    overall: columnToRating(evaluation.overall),
    status: evaluation.status,
    note: null,
    internalNote: evaluation.internalNote,
    submittedAt: evaluation.createdAt,
    skills: Object.fromEntries(skills.map((s) => [s.skill, columnToRating(s.rating)])),
    positions: Object.fromEntries(positionRows.map((p) => [p.position, columnToRating(p.rating)])),
  };
}

/**
 * Avaliação oficial vigente, **respeitando a política de visibilidade**.
 * Retorna `null` — e não lança — quando o ator simplesmente não tem direito de
 * ver, porque para ele o dado não existe.
 */
export async function getOfficialEvaluation(
  db: Database,
  params: { actor: Actor | null; athleteId: string; selfVisible: boolean },
): Promise<OfficialEvaluationView | null> {
  const allowed = canViewOfficialEvaluation(params.actor, params.athleteId, {
    selfOfficialEvaluationVisible: params.selfVisible,
  });
  if (!allowed) return null;

  return loadCurrentOfficial(db, params.athleteId);
}

/** Participações em encontros já finalizados — base da revisão provisória. */
async function countFinishedParticipations(db: Database, athleteId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventParticipants)
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .where(
      and(
        eq(eventParticipants.athleteId, athleteId),
        eq(events.status, 'finalizado'),
        inArray(eventParticipants.status, ['presente', 'confirmado', 'chegou_atrasado']),
      ),
    );

  return row?.count ?? 0;
}

export interface ProvisionalReviewItem {
  athleteId: string;
  fullName: string;
  nickname: string | null;
  overall: Rating;
  participationsSinceEvaluation: number;
  threshold: number;
}

/**
 * Atletas com avaliação provisória que já atingiram o número de participações
 * para revisão (§7.3).
 *
 * O sistema **apenas sinaliza** — nunca altera uma nota automaticamente.
 */
export async function listProvisionalReviewsDue(
  db: Database,
  actor: Actor | null,
): Promise<ProvisionalReviewItem[]> {
  requireAdmin(actor);

  const [settings] = await db
    .select({ threshold: clubSettings.provisionalReviewAfterEvents })
    .from(clubSettings)
    .where(eq(clubSettings.id, 'default'))
    .limit(1);

  const threshold = settings?.threshold ?? 3;

  const rows = await db
    .select({
      athleteId: athletes.id,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
      overall: officialEvaluations.overall,
      participationsAtCreation: officialEvaluations.participationsAtCreation,
    })
    .from(officialEvaluations)
    .innerJoin(athletes, eq(athletes.id, officialEvaluations.athleteId))
    .where(
      and(eq(officialEvaluations.isCurrent, true), eq(officialEvaluations.status, 'provisoria')),
    );

  const items: ProvisionalReviewItem[] = [];

  for (const row of rows) {
    const total = await countFinishedParticipations(db, row.athleteId);
    const since = total - row.participationsAtCreation;

    if (since >= threshold) {
      items.push({
        athleteId: row.athleteId,
        fullName: row.fullName,
        nickname: row.nickname,
        overall: columnToRating(row.overall),
        participationsSinceEvaluation: since,
        threshold,
      });
    }
  }

  return items;
}

export interface EvaluationComparison {
  self: AssessmentView | null;
  official: OfficialEvaluationView | null;
  /** Diferença por critério: positivo = o atleta se avalia acima da oficial. */
  differences: Partial<Record<SkillCode | 'overall', number>>;
}

/** Comparação lado a lado para a revisão administrativa (§7.2). */
export async function compareAssessments(
  db: Database,
  params: { actor: Actor | null; athleteId: string },
): Promise<EvaluationComparison> {
  requireAdmin(params.actor);

  const [self, official] = await Promise.all([
    getCurrentSelfAssessment(db, params.athleteId),
    loadCurrentOfficial(db, params.athleteId),
  ]);

  const differences: Partial<Record<SkillCode | 'overall', number>> = {};

  if (self?.overall != null && official?.overall != null) {
    differences.overall = self.overall - official.overall;
  }

  for (const [skill, selfRating] of Object.entries(self?.skills ?? {})) {
    const officialRating = official?.skills[skill as SkillCode];
    // Só compara onde os dois lados avaliaram: `null` significa "não avaliado",
    // e subtrair de "não avaliado" não produziria informação.
    if (selfRating != null && officialRating != null) {
      differences[skill as SkillCode] = selfRating - officialRating;
    }
  }

  return { self, official, differences };
}

export interface EvaluationHistoryEntry {
  id: string;
  changedAt: Date;
  status: 'provisoria' | 'definitiva';
  justification: string;
  changes: unknown;
  changedByUserId: string | null;
}

export async function getEvaluationHistory(
  db: Database,
  params: { actor: Actor | null; athleteId: string },
): Promise<EvaluationHistoryEntry[]> {
  requireAdmin(params.actor);

  return db
    .select({
      id: evaluationHistory.id,
      changedAt: evaluationHistory.changedAt,
      status: evaluationHistory.status,
      justification: evaluationHistory.justification,
      changes: evaluationHistory.changes,
      changedByUserId: evaluationHistory.changedByUserId,
    })
    .from(evaluationHistory)
    .where(eq(evaluationHistory.athleteId, params.athleteId))
    .orderBy(desc(evaluationHistory.changedAt));
}
