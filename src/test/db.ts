import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '@/db/schema';

/**
 * Harness de testes de integração contra **Postgres de verdade**.
 *
 * Por que não PGlite: o requisito §23.4 exige provar que duas confirmações
 * simultâneas não produzem 19 confirmados. Isso depende de `SELECT ... FOR
 * UPDATE` com duas conexões concorrentes — semântica que só um Postgres real
 * exercita. Um banco em WASM de conexão única passaria no teste sem provar nada.
 *
 * O banco de testes é separado do de desenvolvimento e recriado sob demanda.
 */

const DEV_URL = process.env.DATABASE_URL ?? 'postgresql://cva:cva@localhost:5433/cva_gestao';

/**
 * Um banco por **worker** do Vitest.
 *
 * Arquivos de teste rodam em paralelo em processos separados. Com um banco
 * único, o `truncate` de um arquivo apagaria os dados do outro no meio da
 * execução — falha intermitente e confusa. Isolar por worker preserva o
 * paralelismo e elimina a interferência.
 */
const WORKER_ID = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? '1';
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? `cva_gestao_test_${WORKER_ID}`;

function testUrl(): string {
  const url = new URL(DEV_URL);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}

function adminUrl(): string {
  const url = new URL(DEV_URL);
  url.pathname = '/postgres';
  return url.toString();
}

export interface TestDb {
  db: PostgresJsDatabase<typeof schema>;
  client: ReturnType<typeof postgres>;
  /** Esvazia todas as tabelas de dados, preservando o schema. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

let migrated = false;

/**
 * `true` quando há um Postgres acessível. Os testes de integração usam isto
 * para **pular** em vez de falhar quando o Docker não está rodando — assim um
 * `npm test` local sem Docker continua útil, sem mascarar falha real em CI.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  const client = postgres(adminUrl(), { max: 1, connect_timeout: 3, prepare: false });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function setupTestDb(): Promise<TestDb> {
  if (!migrated) {
    const admin = postgres(adminUrl(), { max: 1, prepare: false });
    try {
      const existing = await admin`
        select 1 from pg_database where datname = ${TEST_DB_NAME}
      `;
      if (existing.length === 0) {
        // Identificador não pode ser parametrizado; o nome vem de env controlada.
        await admin.unsafe(`create database "${TEST_DB_NAME}"`);
      }
    } finally {
      await admin.end();
    }

    const migrator = postgres(testUrl(), { max: 1, prepare: false });
    try {
      await migrate(drizzle(migrator), { migrationsFolder: 'src/db/migrations' });
    } finally {
      await migrator.end();
    }

    migrated = true;
  }

  // `max: 4` é o que permite transações concorrentes de verdade nos testes.
  const client = postgres(testUrl(), { max: 4, prepare: false });
  const db = drizzle(client, { schema });

  const reset = async (): Promise<void> => {
    const tables = await client<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> '__drizzle_migrations'
    `;
    if (tables.length === 0) return;

    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await client.unsafe(`truncate table ${list} restart identity cascade`);
  };

  return {
    db,
    client,
    reset,
    close: async () => {
      await client.end();
    },
  };
}

/** Insere as configurações padrão do clube — pré-requisito de vários serviços. */
export async function seedClubSettings(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  await db.insert(schema.clubSettings).values({ id: 'default' }).onConflictDoNothing();
  await db.execute(sql`select 1`);
}
