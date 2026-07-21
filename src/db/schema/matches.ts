import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { matchLeaveReasonEnum } from './enums';
import { events } from './events';
import { teamFormations, teams } from './teams';
import { users } from './users';

/**
 * Sessão de rodízio de um encontro (§11). Amarra as partidas a uma formação
 * específica, para que o histórico continue legível mesmo depois de a formação
 * ser substituída.
 */
export const courtRotationSessions = pgTable(
  'court_rotation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => teamFormations.id, { onDelete: 'restrict' }),

    /** Estado corrente do rodízio — reconstruível a partir do histórico. */
    currentMatchNumber: integer('current_match_number').notNull().default(1),
    leftTeamId: uuid('left_team_id').references(() => teams.id, { onDelete: 'set null' }),
    rightTeamId: uuid('right_team_id').references(() => teams.id, { onDelete: 'set null' }),
    waitingTeamId: uuid('waiting_team_id').references(() => teams.id, { onDelete: 'set null' }),
    /** `{ [teamId]: partidasConsecutivas }`. */
    consecutiveByTeam: jsonb('consecutive_by_team').notNull().default({}),

    maxConsecutiveMatches: integer('max_consecutive_matches').notNull().default(2),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // Uma sessão de rodízio ativa por evento.
    uniqueIndex('rotation_session_active_unique')
      .on(table.eventId)
      .where(sql`${table.finishedAt} is null`),
    index('rotation_session_event_idx').on(table.eventId),
  ],
);

/** Partida disputada (§12). Registro append-only; corrigir gera um novo estado. */
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => courtRotationSessions.id, { onDelete: 'cascade' }),
    matchNumber: integer('match_number').notNull(),

    leftTeamId: uuid('left_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    rightTeamId: uuid('right_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    waitingTeamId: uuid('waiting_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),

    /** Placar é opcional: o grupo nem sempre anota. */
    leftScore: integer('left_score'),
    rightScore: integer('right_score'),
    /** `null` = empate. */
    winnerTeamId: uuid('winner_team_id').references(() => teams.id, { onDelete: 'set null' }),

    leavingTeamId: uuid('leaving_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    stayingTeamId: uuid('staying_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    enteringTeamId: uuid('entering_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    leaveReason: matchLeaveReasonEnum('leave_reason').notNull(),
    overrideJustification: text('override_justification'),

    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('match_number_unique').on(table.sessionId, table.matchNumber),
    index('match_session_idx').on(table.sessionId, table.matchNumber),
    check('match_teams_distinct', sql`left_team_id <> right_team_id`),
    check('match_score_non_negative', sql`(left_score is null or left_score >= 0) and (right_score is null or right_score >= 0)`),
    check(
      'match_override_needs_justification',
      sql`leave_reason <> 'override_manual' or (override_justification is not null and length(trim(override_justification)) >= 3)`,
    ),
  ],
);

/**
 * Histórico de ações do rodízio, incluindo correções (§11.3).
 * Append-only: corrigir a última partida **insere** um registro de correção em
 * vez de apagar o anterior.
 */
export const courtRotationHistory = pgTable(
  'court_rotation_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => courtRotationSessions.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
    /** Estado do rodízio depois desta ação. */
    stateAfter: jsonb('state_after').notNull(),
    justification: text('justification'),
    performedByUserId: uuid('performed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('rotation_history_session_idx').on(table.sessionId, table.performedAt)],
);
