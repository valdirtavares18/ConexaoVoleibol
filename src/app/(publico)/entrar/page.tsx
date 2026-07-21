import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ClubMark } from '@/components/brand/club-mark';
import { getActor } from '@/server/context';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Entrar' };

/**
 * Tela de acesso.
 *
 * Composição em duas colunas no desktop: painel azul-marinho da marca à
 * esquerda (com as faixas diagonais da identidade em baixa intensidade) e o
 * formulário à direita. No celular vira coluna única com o brasão no topo —
 * sem espremer o painel decorativo numa faixa inútil.
 */
export default async function EntrarPage() {
  const actor = await getActor();
  if (actor) redirect('/app');

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      {/* Painel da marca — some no celular, onde o espaço é do formulário. */}
      <section className="relative hidden overflow-hidden bg-cva-navy-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="cva-stripes absolute inset-0 opacity-60" aria-hidden="true" />

        <div className="relative">
          <ClubMark size="xl" priority />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Conexão Voleibol Alegrete
          </h1>
          <p className="mt-4 text-lg text-cva-blue-100">
            Times equilibrados, rodízio organizado e o caixa do grupo em ordem — tudo em um
            lugar só.
          </p>
          <p className="mt-8 flex items-center gap-2 text-sm text-cva-gold-500">
            <span aria-hidden="true">★★★</span>
            <span className="text-cva-blue-100">Desde 2023 · Apenas vôlei e amizades</span>
          </p>
        </div>

        <p className="relative text-xs text-cva-blue-100/70">
          Sistema interno do grupo. O acesso é liberado por um administrador.
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <ClubMark size="lg" priority />
          </div>

          <h2 className="mt-6 text-2xl font-bold tracking-tight text-cva-navy-900 lg:mt-0">
            Entrar no CVA Gestão
          </h2>
          <p className="mt-1.5 text-sm text-cva-text-muted">
            Use o e-mail cadastrado no grupo.
          </p>

          <div className="mt-8">
            <SignInForm />
          </div>
        </div>
      </section>
    </main>
  );
}
