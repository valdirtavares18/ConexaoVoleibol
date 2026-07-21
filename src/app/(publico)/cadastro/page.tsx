import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClubMark } from '@/components/brand/club-mark';
import { getActor } from '@/server/context';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function CadastroPage() {
  const actor = await getActor();
  if (actor) redirect('/app');

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <ClubMark size="lg" priority />

      <h1 className="text-cva-navy-900 mt-6 text-2xl font-bold tracking-tight">
        Entrar no Conexão Voleibol Alegrete
      </h1>
      <p className="text-cva-text-muted mt-1.5 text-sm">
        Crie sua conta. Um administrador aprova o cadastro antes de liberar o acesso.
      </p>

      <div className="mt-8">
        <SignUpForm />
      </div>

      <p className="text-cva-text-muted mt-6 text-sm">
        Já tem conta?{' '}
        <Link href="/entrar" className="text-cva-blue-700 underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </main>
  );
}
