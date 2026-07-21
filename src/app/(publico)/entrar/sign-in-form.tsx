'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { EMPTY_AUTH_STATE } from '@/lib/action-state';
import { signInAction } from '@/server/auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </Button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        // `role="alert"` faz o leitor de tela anunciar a falha sem precisar de foco.
        <p
          role="alert"
          className="border-cva-danger/30 bg-cva-danger-soft text-cva-danger rounded-md border px-3 py-2.5 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="voce@exemplo.com"
        error={state.fieldErrors.email}
      />

      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors.password}
      />

      <SubmitButton />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
        <Link
          href="/recuperar-acesso"
          className="text-cva-blue-700 hover:text-cva-navy-900 underline underline-offset-4"
        >
          Esqueci minha senha
        </Link>
        <Link
          href="/cadastro"
          className="text-cva-blue-700 hover:text-cva-navy-900 underline underline-offset-4"
        >
          Quero entrar no grupo
        </Link>
      </div>
    </form>
  );
}
