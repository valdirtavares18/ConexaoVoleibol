import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { athletes } from './athletes';
import { evaluationStatusEnum, positionCodeEnum, skillCodeEnum } from './enums';
import { users } from './users';

/**
 * Notas são `numeric(2,1)` e **anuláveis**: `null` significa "não avaliado" e
 * jamais é lido como zero (§5). O CHECK abaixo garante a escala 1–5 em passos de
 * 0,5 direto no banco, então nem uma migração manual consegue gravar 3,7.
 */
const ratingCheck = (column: string) =>
  sql.raw(
    `${column} is null or (${column} >= 1 and ${column} <= 5 and (${column} * 2) = floor(${column} * 2))`,
  );

// ---------------------------------------------------------------------------
// Autoavaliação (§7.1) — nunca alimenta o gerador de times.
// ---------------------------------------------------------------------------

export const selfAssessments = pgTable(
  'self_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    /** Cada reenvio cria uma nova revisão; as anteriores são preservadas. */
    revision: integer('revision').notNull(),
    overall: numeric('overall', { precision: 2, scale: 1 }),
    note: text('note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('self_assessment_revision_unique').on(table.athleteId, table.revision),
    index('self_assessment_athlete_idx').on(table.athleteId, table.submittedAt),
    check('self_assessment_overall_scale', ratingCheck('overall')),
  ],
);

export const selfAssessmentSkills = pgTable(
  'self_assessment_skills',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => selfAssessments.id, { onDelete: 'cascade' }),
    skill: skillCodeEnum('skill').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }),
    note: text('note'),
  },
  (table) => [
    primaryKey({ columns: [table.assessmentId, table.skill] }),
    check('self_assessment_skill_scale', ratingCheck('rating')),
  ],
);

export const selfAssessmentPositions = pgTable(
  'self_assessment_positions',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => selfAssessments.id, { onDelete: 'cascade' }),
    position: positionCodeEnum('position').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }),
  },
  (table) => [
    primaryKey({ columns: [table.assessmentId, table.position] }),
    check('self_assessment_position_scale', ratingCheck('rating')),
  ],
);

// ---------------------------------------------------------------------------
// Avaliação oficial (§7.2) — a única fonte do gerador de times.
// ---------------------------------------------------------------------------

export const officialEvaluations = pgTable(
  'official_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    overall: numeric('overall', { precision: 2, scale: 1 }),
    status: evaluationStatusEnum('status').notNull().default('provisoria'),
    /** Apenas a revisão vigente responde `true`. Índice único parcial abaixo. */
    isCurrent: boolean('is_current').notNull().default(true),
    /** Observação interna do administrador. Nunca vai ao cliente do atleta. */
    internalNote: text('internal_note'),
    /** Justificativa da alteração — obrigatória a partir da 2ª revisão. */
    justification: text('justification'),
    /**
     * Participações contabilizadas quando esta avaliação provisória foi criada.
     * A revisão é sinalizada ao atingir `provisional_review_after_events` a mais.
     */
    participationsAtCreation: integer('participations_at_creation').notNull().default(0),
    evaluatedByUserId: uuid('evaluated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('official_evaluation_revision_unique').on(table.athleteId, table.revision),
    uniqueIndex('official_evaluation_current_unique')
      .on(table.athleteId)
      .where(sql`${table.isCurrent}`),
    index('official_evaluation_status_idx').on(table.status),
    check('official_evaluation_overall_scale', ratingCheck('overall')),
  ],
);

export const officialEvaluationSkills = pgTable(
  'official_evaluation_skills',
  {
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => officialEvaluations.id, { onDelete: 'cascade' }),
    skill: skillCodeEnum('skill').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }),
  },
  (table) => [
    primaryKey({ columns: [table.evaluationId, table.skill] }),
    check('official_evaluation_skill_scale', ratingCheck('rating')),
  ],
);

/** Notas oficiais por posição — usadas para cobertura tática, não para força. */
export const positionRatings = pgTable(
  'position_ratings',
  {
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => officialEvaluations.id, { onDelete: 'cascade' }),
    position: positionCodeEnum('position').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }),
  },
  (table) => [
    primaryKey({ columns: [table.evaluationId, table.position] }),
    check('position_rating_scale', ratingCheck('rating')),
  ],
);

/**
 * Histórico **imutável** de alterações oficiais (§7.4).
 *
 * A aplicação só insere aqui; não há caminho de `UPDATE` nem `DELETE`. O diff
 * fica em JSONB porque é um registro de auditoria congelado no tempo — se as
 * colunas de avaliação mudarem amanhã, o histórico antigo continua legível.
 */
export const evaluationHistory = pgTable(
  'evaluation_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    evaluationId: uuid('evaluation_id').references(() => officialEvaluations.id, {
      onDelete: 'set null',
    }),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: evaluationStatusEnum('status').notNull(),
    justification: text('justification').notNull(),
    /** `{ criterio: { anterior, novo } }` — o conjunto exato do que mudou. */
    changes: jsonb('changes').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('evaluation_history_athlete_idx').on(table.athleteId, table.changedAt)],
);
