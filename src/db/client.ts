import 'server-only';

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Conexão com o Postgres.
 *
 * Em serverless (Vercel), cada invocação pode criar uma instância nova. O
 * cliente é memoizado no escopo global para sobreviver ao hot reload em
 * desenvolvimento e para reaproveitar conexões entre invocações quentes.
 */

declare global {
  var __cvaSql: ReturnType<typeof postgres> | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não está definida. Copie `.env.example` para `.env.local` e preencha.',
    );
  }
  return url;
}

function createClient(): ReturnType<typeof postgres> {
  return postgres(connectionString(), {
    // O pooler do Supabase (porta 6543) não suporta prepared statements.
    prepare: false,
    max: process.env.NODE_ENV === 'production' ? 5 : 2,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

const sql = globalThis.__cvaSql ?? createClient();
if (process.env.NODE_ENV !== 'production') globalThis.__cvaSql = sql;

export const db: PostgresJsDatabase<typeof schema> = drizzle(sql, { schema });
export { schema, sql };

export type Database = typeof db;

/**
 * Tipo aceito por qualquer função que precise rodar dentro de uma transação.
 * Serviços recebem isto em vez de `db` diretamente, para que possam ser
 * compostos numa mesma transação (§27).
 */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
