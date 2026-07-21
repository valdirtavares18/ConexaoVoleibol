import { createInterface } from 'node:readline/promises';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Esvazia todas as tabelas de dados, preservando o schema e as migrations.
 *
 * Ação destrutiva: pede confirmação, e recusa rodar em produção. Ver §20 —
 * "confirmação em ações destrutivas".
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('`db:reset` não roda em produção.');
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');

  const target = new URL(url).pathname.replace('/', '');

  if (!process.argv.includes('--sim')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Isto vai APAGAR todos os dados de "${target}". Digite o nome do banco para confirmar: `,
    );
    rl.close();

    if (answer.trim() !== target) {
      console.log('Cancelado — nada foi alterado.');
      return;
    }
  }

  const client = postgres(url, { max: 1, prepare: false });

  try {
    const tables = await client<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> '__drizzle_migrations'
    `;

    if (tables.length === 0) {
      console.log('Nenhuma tabela encontrada. Rode `npm run db:migrate` primeiro.');
      return;
    }

    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await client.unsafe(`truncate table ${list} restart identity cascade`);

    console.log(`${tables.length} tabelas esvaziadas em "${target}".`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao limpar o banco:', error);
  process.exit(1);
});
