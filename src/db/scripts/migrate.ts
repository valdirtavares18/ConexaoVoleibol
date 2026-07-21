import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL não definida. Copie `.env.example` para `.env.local`.');
  }

  // `max: 1` porque migrations precisam rodar em série numa única conexão.
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    console.log('Aplicando migrations...');
    await migrate(drizzle(sql), { migrationsFolder: 'src/db/migrations' });
    console.log('Migrations aplicadas com sucesso.');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao aplicar migrations:', error);
  process.exit(1);
});
