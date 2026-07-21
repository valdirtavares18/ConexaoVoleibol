import type { Metadata } from 'next';
import Link from 'next/link';
import { ClubMark } from '@/components/brand/club-mark';
import { RecoverForm } from './recover-form';

export const metadata: Metadata = { title: 'Recuperar acesso' };

export default function RecuperarAcessoPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <ClubMark size="lg" priority />

      <h1 className="text-cva-navy-900 mt-6 text-2xl font-bold tracking-tight">Recuperar acesso</h1>
      <p className="text-cva-text-muted mt-1.5 text-sm">Informe o e-mail cadastrado no grupo.</p>

      <div className="mt-8">
        <RecoverForm />
      </div>

      <p className="text-cva-text-muted mt-6 text-sm">
        Lembrou a senha?{' '}
        <Link href="/entrar" className="text-cva-blue-700 underline underline-offset-4">
          Voltar para entrar
        </Link>
      </p>
    </main>
  );
}
