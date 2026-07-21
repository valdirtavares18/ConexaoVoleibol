import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/admin-shell';
import { db } from '@/db/client';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { signOutAction } from '@/server/auth/actions';
import { getActor } from '@/server/context';
import { isAdmin } from '@/server/policies';

/**
 * Portão da área administrativa.
 *
 * A checagem é de servidor e vale para **todas** as rotas filhas, inclusive as
 * financeiras. Cada serviço financeiro reconfere a permissão por conta própria —
 * a proteção em camadas é deliberada: um layout esquecido não abriria o caixa.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getActor();

  if (!actor) redirect('/entrar');
  if (!isAdmin(actor)) redirect('/app');
  if (actor.status !== 'ativo') redirect('/entrar');

  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);

  return (
    <AdminShell
      userName={user?.name ?? 'Administrador'}
      isAlsoAthlete={actor.athleteId !== null}
      signOut={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
