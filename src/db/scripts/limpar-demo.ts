import { createInterface } from 'node:readline/promises';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Limpa os dados de demonstração, deixando o sistema pronto para uso real.
 *
 *   npm run db:limpar-demo
 *
 * **Preserva**: contas que não são de demonstração (com seus papéis e sessões
 * ativas — quem estiver logado continua logado), as configurações do clube e as
 * posições. **Apaga**: atletas, jogos, formações, partidas, avaliações,
 * afinidades, financeiro, notificações e auditoria.
 *
 * As contas de demonstração são reconhecidas pelo domínio `@demo.cva.local`,
 * que o seed usa justamente para tornar essa distinção possível.
 *
 * Ação destrutiva e sem volta: pede confirmação e recusa rodar em produção sem
 * `--sim` explícito.
 */

const DEMO_DOMAIN = '@demo.cva.local';

/**
 * Tabelas de dados operacionais.
 *
 * `TRUNCATE ... CASCADE` propaga para quem as referencia — apagar `athletes`
 * leva junto posições, avaliações, afinidades, participações e cobranças, sem
 * precisar acertar a ordem à mão. `users` não referencia nenhuma delas, então
 * as contas sobrevivem.
 */
const OPERATIONAL_TABLES = [
  'athletes',
  'events',
  'cash_transactions',
  'extra_financial_events',
  'notifications',
  'audit_logs',
  'announcements',
  'rate_limit_attempts',
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');

  const target = new URL(url).pathname.replace('/', '');
  const skipPrompt = process.argv.includes('--sim');

  if (process.env.NODE_ENV === 'production' && !skipPrompt) {
    throw new Error('Em produção, rode com `--sim` para confirmar que é isto mesmo.');
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    const [before] = await db.execute<{
      demo_users: number;
      real_users: number;
      athletes: number;
      events: number;
    }>(sql`
      select
        (select count(*)::int from users where email like ${'%' + DEMO_DOMAIN}) as demo_users,
        (select count(*)::int from users where email not like ${'%' + DEMO_DOMAIN}) as real_users,
        (select count(*)::int from athletes) as athletes,
        (select count(*)::int from events) as events
    `);

    console.log(`\nBanco: ${target}`);
    console.log(`  atletas ........... ${before?.athletes ?? 0}`);
    console.log(`  jogos ............. ${before?.events ?? 0}`);
    console.log(`  contas demo ....... ${before?.demo_users ?? 0}  (serão apagadas)`);
    console.log(`  contas preservadas  ${before?.real_users ?? 0}\n`);

    if ((before?.real_users ?? 0) === 0) {
      console.warn(
        'ATENÇÃO: nenhuma conta fora do domínio de demonstração. Limpar agora deixaria o\n' +
          'sistema sem nenhum acesso. Crie um administrador antes:\n' +
          '  npm run bootstrap:admin\n',
      );
      return;
    }

    if (!skipPrompt) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(
        `Isto apaga TODOS os dados operacionais de "${target}". Digite o nome do banco para confirmar: `,
      );
      rl.close();

      if (answer.trim() !== target) {
        console.log('Cancelado — nada foi alterado.');
        return;
      }
    }

    await db.transaction(async (tx) => {
      const list = OPERATIONAL_TABLES.map((table) => `"public"."${table}"`).join(', ');
      await tx.execute(sql.raw(`truncate table ${list} restart identity cascade`));

      // As contas de demonstração saem depois: apagá-las antes faria o CASCADE
      // percorrer o mesmo caminho duas vezes sem necessidade.
      await tx.execute(sql`delete from users where email like ${'%' + DEMO_DOMAIN}`);
    });

    const [after] = await db.execute<{ users: number; athletes: number; events: number }>(sql`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from athletes) as athletes,
        (select count(*)::int from events) as events
    `);

    console.log('Pronto.');
    console.log(`  contas restantes .. ${after?.users ?? 0}`);
    console.log(`  atletas ........... ${after?.athletes ?? 0}`);
    console.log(`  jogos ............. ${after?.events ?? 0}`);
    console.log('\nConfigurações do clube e posições foram preservadas.\n');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao limpar os dados de demonstração:', error);
  process.exit(1);
});
