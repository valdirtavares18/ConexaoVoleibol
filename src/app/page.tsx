import { redirect } from 'next/navigation';
import { getActor } from '@/server/context';
import { isAdmin } from '@/server/policies';

/**
 * Raiz. Não existe landing page pública: o sistema é interno do clube, então a
 * raiz apenas encaminha para o lugar certo conforme quem está acessando.
 */
export default async function RootPage() {
  const actor = await getActor();

  if (!actor) redirect('/entrar');
  if (actor.status === 'aguardando_aprovacao') redirect('/aguardando-aprovacao');

  redirect(isAdmin(actor) ? '/admin' : '/app');
}
