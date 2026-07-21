import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AthleteShell } from '@/components/layout/athlete-shell';
import { signOutAction } from '@/server/auth/actions';
import { getActor } from '@/server/context';
import { isAdmin } from '@/server/policies';

/**
 * Portão da área do atleta.
 *
 * A verificação acontece no **servidor**, antes de qualquer conteúdo ser
 * renderizado. Um layout que só escondesse a navegação deixaria as páginas
 * filhas acessíveis por URL direta.
 */
export default async function AtletaLayout({ children }: { children: ReactNode }) {
  const actor = await getActor();

  if (!actor) redirect('/entrar');
  if (actor.status === 'aguardando_aprovacao' || actor.status === 'ajustes_solicitados') {
    redirect('/aguardando-aprovacao');
  }
  if (actor.status !== 'ativo') redirect('/entrar');

  return (
    <AthleteShell isAdmin={isAdmin(actor)} signOut={signOutAction}>
      {children}
    </AthleteShell>
  );
}
