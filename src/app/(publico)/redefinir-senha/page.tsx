import type { Metadata } from 'next';
import Link from 'next/link';
import { ClubMark } from '@/components/brand/club-mark';
import { Callout } from '@/components/ui/primitives';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Nova senha' };

/**
 * Consome o link enviado por e-mail.
 *
 * O token vem na query e é repassado ao formulário como campo oculto — a
 * validação (existe, não usado, não expirado) acontece no servidor, na action.
 * A página não consulta o banco: um token inválido não deve nem revelar que
 * chegou até aqui.
 */
export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <ClubMark size="lg" priority />

      <h1 className="text-cva-navy-900 mt-6 text-2xl font-bold tracking-tight">Nova senha</h1>
      <p className="text-cva-text-muted mt-1.5 text-sm">
        Escolha uma senha nova para a sua conta no CVA Gestão.
      </p>

      <div className="mt-8">
        {token ? (
          <ResetForm token={token} />
        ) : (
          <div className="flex flex-col gap-4">
            <Callout tone="danger" title="Link incompleto">
              Este endereço não traz o código de recuperação. Abra o link direto do e-mail que você
              recebeu, ou solicite outro.
            </Callout>
            <Link
              href="/recuperar-acesso"
              className="text-cva-blue-700 text-sm underline underline-offset-4"
            >
              Solicitar novo link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
