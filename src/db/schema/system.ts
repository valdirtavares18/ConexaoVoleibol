import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { notificationKindEnum, positionCodeEnum } from './enums';
import { users } from './users';

/**
 * Configurações do clube (§19). Linha única (`id = 'default'`), para que as
 * consultas nunca precisem escolher entre registros.
 */
export const clubSettings = pgTable('club_settings', {
  id: text('id').primaryKey().default('default'),

  clubName: text('club_name').notNull().default('Conexão Voleibol Alegrete'),
  shortName: text('short_name').notNull().default('CVA'),
  logoUrl: text('logo_url'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  locale: text('locale').notNull().default('pt-BR'),
  currency: text('currency').notNull().default('BRL'),

  /** Valores monetários em centavos. */
  defaultValuePerAthleteCents: integer('default_value_per_athlete_cents').notNull().default(1000),
  defaultCourtCostCents: integer('default_court_cost_cents').notNull().default(15000),

  defaultCapacity: integer('default_capacity').notNull().default(18),
  defaultTeamCount: integer('default_team_count').notNull().default(3),
  defaultTeamSize: integer('default_team_size').notNull().default(6),
  maxConsecutiveMatches: integer('max_consecutive_matches').notNull().default(2),

  /** Limite de desequilíbrio em pontos percentuais × 100 (500 = 5,00%). */
  maxImbalanceBasisPoints: integer('max_imbalance_basis_points').notNull().default(500),
  /** Participações até sinalizar revisão de avaliação provisória. */
  provisionalReviewAfterEvents: integer('provisional_review_after_events').notNull().default(3),
  /** §4 — por padrão o atleta **não** vê a própria avaliação oficial. */
  selfOfficialEvaluationVisible: boolean('self_official_evaluation_visible')
    .notNull()
    .default(false),

  /** Pesos do algoritmo e das afinidades (`BalancingWeights` parcial). */
  balancingWeights: jsonb('balancing_weights').notNull().default({}),
  /** Posições que cada time precisa cobrir. */
  requiredPositions: jsonb('required_positions').notNull().default(['levantador']),
  /** Nome e cor de cada time, por índice. */
  teamPresets: jsonb('team_presets').notNull().default([]),
  /** Quantos eventos recentes contam para a métrica de repetição de duplas. */
  recentPairingWindow: integer('recent_pairing_window').notNull().default(4),

  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Posições configuráveis (§6). A semente traz as seis padrão; a tabela existe
 * para permitir ajuste futuro sem alterar código.
 */
export const positions = pgTable(
  'positions',
  {
    code: positionCodeEnum('code').primaryKey(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [index('positions_order_idx').on(table.sortOrder)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Link interno para onde a notificação leva. */
    href: text('href'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notification_user_idx').on(table.userId, table.createdAt),
    index('notification_unread_idx').on(table.userId, table.readAt),
  ],
);

/**
 * Auditoria (§20). Append-only: a aplicação nunca atualiza nem apaga.
 *
 * `before`/`after` ficam em JSONB de propósito — é um retrato congelado do
 * registro no momento da ação, que precisa continuar legível mesmo depois de a
 * tabela de origem mudar de forma.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    /** Justificativa, quando a ação exige (override de rodízio, ajuste de caixa). */
    reason: text('reason'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    index('audit_actor_idx').on(table.actorUserId, table.createdAt),
    index('audit_created_idx').on(table.createdAt),
  ],
);

/** Comunicados internos do grupo (§14). */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('announcement_title_date_unique').on(table.title, table.createdAt)],
);
