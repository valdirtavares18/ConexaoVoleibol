import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { config as loadEnv } from 'dotenv';
import { hash } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { clubSettings, positions, userRoles, users } from '@/db/schema';
import { DEFAULT_POSITIONS } from '@/domain/positions';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Cria o **primeiro administrador** e as configurações iniciais do clube.
 *
 * Nenhuma credencial fica no código nem no repositório: a senha é lida do
 * ambiente (`ADMIN_PASSWORD`) ou gerada aleatoriamente e mostrada uma única vez
 * no terminal. Ver `docs/deploy.md`.
 *
 *   npm run bootstrap:admin -- --email=voce@exemplo.com --name="Seu Nome"
 */

function parseArgs(): { email?: string; name?: string } {
  const result: { email?: string; name?: string } = {};
  for (const arg of process.argv.slice(2)) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'email') result.email = value;
    if (key === 'name') result.name = value;
  }
  return result;
}

/** Senha forte legível: 24 caracteres base64url, ~144 bits de entropia. */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');

  const args = parseArgs();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const email = (args.email ?? (await rl.question('E-mail do administrador: '))).trim().toLowerCase();
  const name = (args.name ?? (await rl.question('Nome do administrador: '))).trim();
  rl.close();

  if (!email.includes('@')) throw new Error('E-mail inválido.');
  if (name.length < 2) throw new Error('Informe um nome.');

  const password = process.env.ADMIN_PASSWORD ?? generatePassword();
  const generated = !process.env.ADMIN_PASSWORD;

  const sqlClient = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sqlClient);

  try {
    await db.transaction(async (tx) => {
      // Configurações do clube: linha única, criada se ainda não existir.
      await tx
        .insert(clubSettings)
        .values({ id: 'default' })
        .onConflictDoNothing({ target: clubSettings.id });

      // Posições padrão. Idempotente: reexecutar não duplica nem sobrescreve.
      for (const position of DEFAULT_POSITIONS) {
        await tx
          .insert(positions)
          .values({
            code: position.code,
            name: position.name,
            shortName: position.shortName,
            description: position.description,
            sortOrder: position.sortOrder,
          })
          .onConflictDoNothing({ target: positions.code });
      }

      const existing = await tx.select().from(users).where(eq(users.email, email)).limit(1);

      if (existing[0]) {
        // Conta já existe: apenas promove a administrador, sem tocar na senha.
        await tx
          .insert(userRoles)
          .values({ userId: existing[0].id, role: 'admin' })
          .onConflictDoNothing();
        await tx.update(users).set({ status: 'ativo' }).where(eq(users.id, existing[0].id));

        console.log(`\nConta ${email} já existia — promovida a administrador e ativada.`);
        console.log('A senha atual foi mantida.\n');
        return;
      }

      const passwordHash = await hash(password, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });

      const [created] = await tx
        .insert(users)
        .values({
          email,
          name,
          passwordHash,
          status: 'ativo',
          emailVerifiedAt: sql`now()`,
        })
        .returning({ id: users.id });

      if (!created) throw new Error('Falha ao criar o usuário administrador.');

      await tx.insert(userRoles).values([
        { userId: created.id, role: 'admin' },
        { userId: created.id, role: 'atleta' },
      ]);

      console.log('\n─────────────────────────────────────────────');
      console.log(' Administrador criado com sucesso');
      console.log('─────────────────────────────────────────────');
      console.log(` E-mail: ${email}`);
      if (generated) {
        console.log(` Senha:  ${password}`);
        console.log('\n Esta senha é mostrada UMA ÚNICA VEZ. Guarde-a agora');
        console.log(' e troque-a no primeiro acesso.');
      } else {
        console.log(' Senha:  a definida em ADMIN_PASSWORD.');
      }
      console.log('─────────────────────────────────────────────\n');
    });
  } finally {
    await sqlClient.end();
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao criar o administrador:', error);
  process.exit(1);
});
