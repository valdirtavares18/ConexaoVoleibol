import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { athletes } from './athletes';
import { affinityRigidityEnum, affinityTypeEnum } from './enums';
import { users } from './users';

/**
 * Afinidades **direcionais** (§8).
 *
 * A chave única é `(from, to, type)` — e não um par não ordenado — justamente
 * para que "João prefere jogar com Pedro" e "Pedro é indiferente a João" possam
 * coexistir. Reciprocidade nunca é presumida.
 */
export const affinities = pgTable(
  'affinities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromAthleteId: uuid('from_athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    toAthleteId: uuid('to_athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    type: affinityTypeEnum('type').notNull().default('pessoal'),
    /** −3 … +3. Ver escala em §8.2. */
    intensity: integer('intensity').notNull(),
    rigidity: affinityRigidityEnum('rigidity').notNull().default('preferencia_flexivel'),
    /** Motivo visível apenas a administradores. */
    note: text('note'),
    /**
     * Quem cadastrou. Uma preferência criada pelo próprio atleta só é visível
     * para ele e para os administradores; o **alvo nunca sabe** (§8.3).
     */
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('affinity_direction_unique').on(table.fromAthleteId, table.toAthleteId, table.type),
    index('affinity_from_idx').on(table.fromAthleteId),
    index('affinity_to_idx').on(table.toAthleteId),
    // Restrições obrigatórias são consultadas a cada geração de times.
    index('affinity_rigidity_idx')
      .on(table.rigidity)
      .where(sql`${table.rigidity} = 'restricao_obrigatoria'`),
    check('affinity_intensity_range', sql`intensity between -3 and 3`),
    check('affinity_not_self', sql`from_athlete_id <> to_athlete_id`),
  ],
);
