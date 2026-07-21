import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ClubMark } from '@/components/brand/club-mark';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/server/auth/actions';
import { getActor } from '@/server/context';

export const metadata: Metadata = { title: 'Aguardando aprovação' };

export default async function AguardandoAprovacaoPage() {
  const actor = await getActor();

  if (!actor) redirect('/entrar');
  if (actor.status === 'ativo') redirect('/app');

  const rejected = actor.status === 'rejeitado';
  const needsChanges = actor.status === 'ajustes_solicitados';

  return (
    <main className="bg-cva-navy-950 relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12">
      <div className="cva-stripes absolute inset-0 opacity-50" aria-hidden="true" />

      <div className="relative w-full max-w-md text-center">
        <div className="flex justify-center">
          <ClubMark size="xl" priority />
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
          {rejected
            ? 'Cadastro não aprovado'
            : needsChanges
              ? 'Ajustes solicitados'
              : 'Cadastro em análise'}
        </h1>

        <p className="text-cva-blue-100 mt-3 text-sm leading-relaxed">
          {rejected
            ? 'Seu cadastro não foi aprovado. Se acha que houve engano, procure alguém da organização do grupo.'
            : needsChanges
              ? 'Um administrador pediu ajustes no seu cadastro. Procure alguém da organização para saber o que falta.'
              : 'Seu cadastro foi enviado e está aguardando a aprovação de um administrador do CVA. Assim que for liberado, você consegue confirmar presença nos jogos.'}
        </p>

        <div className="mt-8">
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="lg" block>
              Sair
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
