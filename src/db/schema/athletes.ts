import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accountLinkStatusEnum, athleteStatusEnum, positionCodeEnum, positionRoleEnum } from './enums';
import { users } from './users';

/**
 * Atletas. Um atleta pode existir **sem conta** (perfil criado pelo admin) e ser
 * vinculado a uma conta depois — por isso `users` e `athletes` são tabelas
 * separadas ligadas por `athleteAccountLinks` (§5.2 e §5.3).
 */
export const athletes = pgTable(
  'athletes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    nickname: text('nickname'),
    avatarUrl: text('avatar_url'),
    phone: text('phone'),
    email: text('email'),
    birthDate: date('birth_date'),
    shirtNumber: integer('shirt_number'),
    uniformSize: text('uniform_size'),
    joinedAt: date('joined_at'),
    status: athleteStatusEnum('status').notNull().default('ativo'),

    /** Observações escritas pelo próprio atleta — visíveis a ele. */
    athleteNotes: text('athlete_notes'),
    /** Observações internas dos administradores — **nunca** vão ao cliente do atleta. */
    adminNotes: text('admin_notes'),
    /** Restrições físicas/médicas — acesso administrativo restrito. */
    healthRestrictions: text('health_restrictions'),

    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Exclusão lógica: preserva histórico de presenças, times e financeiro. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('athletes_status_idx').on(table.status),
    index('athletes_name_idx').on(table.fullName),
    // Telefone e e-mail identificam duplicidade na reivindicação de perfil (§5.3).
    uniqueIndex('athletes_email_unique')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null and ${table.deletedAt} is null`),
    uniqueIndex('athletes_phone_unique')
      .on(table.phone)
      .where(sql`${table.phone} is not null and ${table.deletedAt} is null`),
    uniqueIndex('athletes_shirt_unique')
      .on(table.shirtNumber)
      .where(sql`${table.shirtNumber} is not null and ${table.deletedAt} is null`),
  ],
);

/**
 * Vínculo entre conta e perfil de atleta.
 *
 * Invariante: no máximo **uma** ligação aprovada por usuário e por atleta —
 * garantido por índices únicos parciais, não por verificação em código.
 */
export const athleteAccountLinks = pgTable(
  'athlete_account_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: accountLinkStatusEnum('status').notNull().default('pendente'),
    /** Como o vínculo foi proposto: convite do admin ou reivindicação do atleta. */
    origin: text('origin').notNull().default('reivindicacao'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
  },
  (table) => [
    uniqueIndex('athlete_link_athlete_unique')
      .on(table.athleteId)
      .where(sql`${table.status} = 'aprovado'`),
    uniqueIndex('athlete_link_user_unique')
      .on(table.userId)
      .where(sql`${table.status} = 'aprovado'`),
    index('athlete_link_status_idx').on(table.status),
  ],
);

/** Convites de vínculo, com expiração obrigatória (§20). */
export const athleteInvitations = pgTable(
  'athlete_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('athlete_invitation_token_unique').on(table.tokenHash),
    index('athlete_invitation_athlete_idx').on(table.athleteId),
  ],
);

/**
 * Posições de um atleta. Normalizado em vez de três colunas de array: permite
 * consultar "quem joga de levantador" com índice, e a nota por posição vive em
 * `positionRatings` referenciando o mesmo par.
 */
export const athletePositions = pgTable(
  'athlete_positions',
  {
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    position: positionCodeEnum('position').notNull(),
    role: positionRoleEnum('role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.athleteId, table.position] }),
    index('athlete_positions_position_idx').on(table.position, table.role),
    // Uma única posição principal por atleta.
    uniqueIndex('athlete_primary_position_unique')
      .on(table.athleteId)
      .where(sql`${table.role} = 'principal'`),
  ],
);
