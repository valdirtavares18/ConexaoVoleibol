import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { athletes } from './athletes';
import { balancingStrategyEnum, formationStatusEnum, positionCodeEnum } from './enums';
import { events } from './events';
import { users } from './users';

/**
 * Uma versão da formação de times de um evento (§10.10).
 *
 * Publicar **nunca** sobrescreve: cria uma nova versão e marca a anterior como
 * `substituida`. Nenhuma versão é apagada.
 */
export const teamFormations = pgTable(
  'team_formations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: formationStatusEnum('status').notNull().default('rascunho'),
    strategy: balancingStrategyEnum('strategy').notNull(),

    /**
     * Snapshot imutável da procedência do algoritmo: versão, seed, pesos,
     * parâmetros e digest da entrada. JSON é o formato certo aqui — é um
     * registro congelado, não um dado consultável por relacionamento.
     */
    provenance: jsonb('provenance').notNull(),
    /** Métricas completas da opção escolhida, congeladas no momento da geração. */
    metrics: jsonb('metrics').notNull(),

    generatedByUserId: uuid('generated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Motivo pelo qual a formação precisa de revisão (ex.: cancelamento). */
    reviewReason: text('review_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('team_formation_version_unique').on(table.eventId, table.version),
    // No máximo uma formação publicada por evento.
    uniqueIndex('team_formation_published_unique')
      .on(table.eventId)
      .where(sql`${table.status} = 'publicada'`),
    index('team_formation_event_idx').on(table.eventId, table.createdAt),
    check('team_formation_version_positive', sql`version > 0`),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => teamFormations.id, { onDelete: 'cascade' }),
    /** 0-based, alinhado ao índice usado pelo algoritmo. */
    teamIndex: integer('team_index').notNull(),
    name: text('name').notNull(),
    colorToken: text('color_token').notNull().default('cva-blue'),
    /** Time inteiro congelado no recálculo (§10.9). */
    locked: boolean('locked').notNull().default(false),
  },
  (table) => [
    uniqueIndex('team_index_unique').on(table.formationId, table.teamIndex),
    index('team_formation_idx').on(table.formationId),
    // Alvo da chave estrangeira composta de `team_members`, que é o que garante
    // que o time citado pertence mesmo à formação citada. Precisa ser uma
    // UNIQUE *constraint* (criada junto da tabela), não um índice único — o
    // Postgres exige a constraint no momento em que a FK é declarada.
    unique('team_id_formation_unique').on(table.id, table.formationId),
  ],
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    /**
     * Denormalizado de propósito: é o que permite ao banco garantir que um
     * atleta não apareça em dois times da **mesma formação** (§23.5). Sem esta
     * coluna, a unicidade só poderia ser verificada em código.
     */
    formationId: uuid('formation_id')
      .notNull()
      .references(() => teamFormations.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    /** Função sugerida pelo algoritmo para este atleta neste time. */
    assignedPosition: positionCodeEnum('assigned_position'),
    /** Atleta travado neste time durante o recálculo. */
    locked: boolean('locked').notNull().default(false),
    /** `true` quando o admin moveu o atleta manualmente após a geração. */
    manuallyPlaced: boolean('manually_placed').notNull().default(false),
  },
  (table) => [
    uniqueIndex('team_member_unique').on(table.teamId, table.athleteId),
    // Um atleta em no máximo um time por formação.
    uniqueIndex('team_member_formation_unique').on(table.formationId, table.athleteId),
    index('team_member_athlete_idx').on(table.athleteId),
    // Impede que `formationId` divirja da formação real do time.
    foreignKey({
      columns: [table.teamId, table.formationId],
      foreignColumns: [teams.id, teams.formationId],
      name: 'team_member_team_formation_fk',
    }).onDelete('cascade'),
  ],
);
