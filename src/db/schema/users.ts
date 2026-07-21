import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { roleEnum, userStatusEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** Hash Argon2id. A senha em claro nunca sai do handler de autenticação. */
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    status: userStatusEnum('status').notNull().default('aguardando_aprovacao'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // E-mail é único entre contas vivas; a exclusão lógica libera o endereço.
    uniqueIndex('users_email_unique')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} is null`),
    index('users_status_idx').on(table.status),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index('user_roles_role_idx').on(table.role),
  ],
);

/**
 * Sessões persistidas. O cookie carrega apenas o id da sessão assinado; a
 * revogação é imediata porque a validade é conferida no banco a cada requisição
 * autenticada — um JWT auto-contido não permitiria "sair de todos os aparelhos".
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);

/** Tokens de recuperação de acesso. Guardamos o hash, nunca o token em claro. */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('password_reset_token_hash_unique').on(table.tokenHash),
    index('password_reset_user_idx').on(table.userId),
  ],
);

/**
 * Controle de tentativas para rate limit de autenticação e ações sensíveis
 * (§20). Fica no banco para valer entre instâncias serverless — memória local
 * não protegeria nada na Vercel.
 */
export const rateLimitAttempts = pgTable(
  'rate_limit_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Ex.: `login:valdir@exemplo.com` ou `reset:187.0.0.1`. */
    bucketKey: text('bucket_key').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('rate_limit_bucket_idx').on(table.bucketKey, table.attemptedAt)],
);
