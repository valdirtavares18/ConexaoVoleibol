import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { athletes } from './athletes';
import {
  eventFinancialStatusEnum,
  eventStatusEnum,
  eventTypeEnum,
  participationStatusEnum,
} from './enums';
import { users } from './users';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    type: eventTypeEnum('type').notNull().default('encontro'),
    status: eventStatusEnum('status').notNull().default('rascunho'),

    eventDate: date('event_date').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    /** Instante absoluto derivado de data + hora no fuso do clube. Ordena a agenda. */
    startsAt: timestamp('starts_at', { withTimezone: true }),

    venueName: text('venue_name'),
    address: text('address'),
    notes: text('notes'),
    confirmationDeadline: timestamp('confirmation_deadline', { withTimezone: true }),

    capacity: integer('capacity').notNull().default(18),
    teamCount: integer('team_count').notNull().default(3),
    teamSize: integer('team_size').notNull().default(6),

    /** Valores monetários sempre em centavos inteiros (§11). */
    valuePerAthleteCents: integer('value_per_athlete_cents').notNull().default(1000),
    courtCostCents: integer('court_cost_cents').notNull().default(0),
    courtCostPaid: timestamp('court_cost_paid_at', { withTimezone: true }),
    financialStatus: eventFinancialStatusEnum('financial_status').notNull().default('aberto'),
    financialClosedAt: timestamp('financial_closed_at', { withTimezone: true }),
    financialClosedByUserId: uuid('financial_closed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('events_date_idx').on(table.eventDate),
    index('events_status_idx').on(table.status, table.eventDate),
    check('events_capacity_positive', sql`capacity > 0`),
    check('events_team_layout', sql`team_count > 0 and team_size > 0`),
    check('events_money_non_negative', sql`value_per_athlete_cents >= 0 and court_cost_cents >= 0`),
  ],
);

/**
 * Participação de um atleta em um evento (§9.2 e §9.3).
 *
 * **Invariante de concorrência.** `confirmedSlot` recebe um número de 1 até a
 * capacidade do evento, e o índice único parcial abaixo torna fisicamente
 * impossível existirem duas confirmações no mesmo slot. Combinado com o
 * `SELECT ... FOR UPDATE` na linha do evento, duas confirmações simultâneas não
 * conseguem produzir 19 confirmados: a segunda ou pega o slot seguinte, ou vai
 * para a lista de espera.
 *
 * O índice é a rede de segurança; o lock é o mecanismo principal. Ter os dois é
 * deliberado — um bug futuro que esqueça o lock ainda falha em vez de corromper.
 */
export const eventParticipants = pgTable(
  'event_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    status: participationStatusEnum('status').notNull().default('talvez'),

    confirmedSlot: integer('confirmed_slot'),
    waitlistPosition: integer('waitlist_position'),

    respondedAt: timestamp('responded_at', { withTimezone: true }),
    /** Preenchido quando um admin responde em nome de um perfil gerenciado. */
    respondedByUserId: uuid('responded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('event_participant_unique').on(table.eventId, table.athleteId),
    uniqueIndex('event_confirmed_slot_unique')
      .on(table.eventId, table.confirmedSlot)
      .where(sql`${table.confirmedSlot} is not null`),
    uniqueIndex('event_waitlist_position_unique')
      .on(table.eventId, table.waitlistPosition)
      .where(sql`${table.waitlistPosition} is not null`),
    index('event_participant_status_idx').on(table.eventId, table.status),
    check('event_confirmed_slot_positive', sql`confirmed_slot is null or confirmed_slot > 0`),
    check(
      'event_waitlist_position_positive',
      sql`waitlist_position is null or waitlist_position > 0`,
    ),
    // Slot e posição de espera são mutuamente exclusivos.
    check('event_slot_xor_waitlist', sql`confirmed_slot is null or waitlist_position is null`),
  ],
);
