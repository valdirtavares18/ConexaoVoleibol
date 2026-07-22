// Build da Vercel: aplica as migrations no banco antes de compilar, para que a
// primeira publicação já suba com o schema pronto, e — só quando pedido —
// cria o primeiro administrador.
//
// Roda no build porque é lá que a `DATABASE_URL` do banco gerenciado existe: ela
// é marcada como sensível e não pode ser baixada para a máquina local. As
// migrations do Drizzle são idempotentes (guardam o que já aplicaram), então
// reexecutar a cada deploy não repete nada.
//
// O bootstrap do admin fica atrás de BOOTSTRAP_ADMIN=true: liga-se uma vez, no
// primeiro deploy, e desliga-se depois — a criação em si também é idempotente
// (se a conta já existe, apenas confirma o papel de administrador).

import { execSync } from 'node:child_process';

function run(command) {
  console.log(`\n› ${command}`);
  execSync(command, { stdio: 'inherit' });
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente no build. Conecte o banco ao projeto na Vercel.');
}

run('npm run db:migrate');

if (process.env.BOOTSTRAP_ADMIN === 'true') {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_NAME) {
    throw new Error('BOOTSTRAP_ADMIN=true exige ADMIN_EMAIL e ADMIN_NAME definidos.');
  }
  run('npm run bootstrap:admin');
}

run('next build');
