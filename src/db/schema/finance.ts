import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { athletes } from './athletes';
import {
  cashTransactionKindEnum,
  eventFinancialStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from './enums';
import { events } from './events';
import { users } from './users';

/**
 * Módulo financeiro (§13). **Exclusivo de administradores** — a proteção é feita
 * nas policies do servidor, e nenhuma consulta destas tabelas é exposta em rota
 * acessível a atleta.
 *
 * Todos os valores são `integer` em centavos. Nenhuma coluna monetária usa
 * ponto flutuante.
 */

/** Cobrança de um atleta em um evento. */
export const eventCharges = pgTable(
  'event_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    amountDueCents: integer('amount_due_cents').notNull(),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    status: paymentStatusEnum('status').notNull().default('pendente'),
    /** Motivo obrigatório quando dispensado ou estornado. */
    adjustmentReason: text('adjustment_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('event_charge_unique').on(table.eventId, table.athleteId),
    index('event_charge_status_idx').on(table.eventId, table.status),
    check('event_charge_amounts_non_negative', sql`amount_due_cents >= 0 and amount_paid_cents >= 0`),
    check('event_charge_not_overpaid', sql`amount_paid_cents <= amount_due_cents`),
    check(
      'event_charge_adjustment_needs_reason',
      sql`status not in ('dispensado', 'estornado') or (adjustment_reason is not null and length(trim(adjustment_reason)) >= 3)`,
    ),
  ],
);

/** Cada recebimento individual. Uma cobrança pode ter vários (pagamento parcial). */
export const eventPayments = pgTable(
  'event_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chargeId: uuid('charge_id')
      .notNull()
      .references(() => eventCharges.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    method: paymentMethodEnum('method').notNull().default('pix'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('event_payment_charge_idx').on(table.chargeId),
    check('event_payment_amount_positive', sql`amount_cents > 0`),
  ],
);

/** Despesas do evento além do custo da quadra. */
export const eventExpenses = pgTable(
  'event_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('event_expense_event_idx').on(table.eventId),
    check('event_expense_amount_positive', sql`amount_cents > 0`),
  ],
);

/**
 * Caixa do grupo (§13.4). **Somente movimentos liquidados** (`settledAt` não
 * nulo) entram no saldo — receita esperada nunca conta como dinheiro disponível.
 */
export const cashTransactions = pgTable(
  'cash_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: cashTransactionKindEnum('kind').notNull(),
    /** Positivo entra, negativo sai. */
    amountCents: integer('amount_cents').notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    description: text('description').notNull(),
    /** Obrigatório em ajuste manual (§13.4). */
    reason: text('reason'),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    extraEventId: uuid('extra_event_id'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cash_tx_occurred_idx').on(table.occurredAt),
    index('cash_tx_settled_idx').on(table.settledAt),
    index('cash_tx_event_idx').on(table.eventId),
    check('cash_tx_amount_non_zero', sql`amount_cents <> 0`),
    check(
      'cash_tx_manual_needs_reason',
      sql`kind <> 'ajuste_manual' or (reason is not null and length(trim(reason)) >= 3)`,
    ),
  ],
);

/** Churrascos e confraternizações (§13.5). */
export const extraFinancialEvents = pgTable(
  'extra_financial_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    occurredOn: date('occurred_on').notNull(),
    notes: text('notes'),
    /** `por_pessoa` ou `total_rateado`. */
    chargeMode: text('charge_mode').notNull().default('por_pessoa'),
    valuePerPersonCents: integer('value_per_person_cents'),
    totalCents: integer('total_cents'),
    financialStatus: eventFinancialStatusEnum('financial_status').notNull().default('aberto'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('extra_event_date_idx').on(table.occurredOn),
    check(
      'extra_event_mode_values',
      sql`(charge_mode = 'por_pessoa' and value_per_person_cents is not null) or (charge_mode = 'total_rateado' and total_cents is not null)`,
    ),
  ],
);

export const extraEventCharges = pgTable(
  'extra_event_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extraEventId: uuid('extra_event_id')
      .notNull()
      .references(() => extraFinancialEvents.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    amountDueCents: integer('amount_due_cents').notNull(),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    status: paymentStatusEnum('status').notNull().default('pendente'),
    adjustmentReason: text('adjustment_reason'),
  },
  (table) => [
    uniqueIndex('extra_event_charge_unique').on(table.extraEventId, table.athleteId),
    check('extra_charge_amounts_non_negative', sql`amount_due_cents >= 0 and amount_paid_cents >= 0`),
    check('extra_charge_not_overpaid', sql`amount_paid_cents <= amount_due_cents`),
  ],
);

export const extraEventExpenses = pgTable(
  'extra_event_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extraEventId: uuid('extra_event_id')
      .notNull()
      .references(() => extraFinancialEvents.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (table) => [
    index('extra_expense_event_idx').on(table.extraEventId),
    check('extra_expense_amount_positive', sql`amount_cents > 0`),
  ],
);
