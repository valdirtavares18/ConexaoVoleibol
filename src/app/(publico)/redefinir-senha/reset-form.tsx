'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout } from '@/components/ui/primitives';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '@/domain/shared/password-policy';
import { EMPTY_AUTH_STATE } from '@/lib/action-state';
import { resetPasswordAction } from '@/server/auth/signup-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar nova senha'}
    </Button>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <div className="flex flex-col gap-3">
          <Callout tone="danger">{state.error}</Callout>
          <Link
            href="/recuperar-acesso"
            className="text-cva-blue-700 text-sm underline underline-offset-4"
          >
            Solicitar novo link
          </Link>
        </div>
      ) : null}

      <Field
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        error={state.fieldErrors.password}
        hint={PASSWORD_HINT}
      />

      <Field
        label="Confirme a nova senha"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors.passwordConfirmation}
      />

      <SubmitButton />

      <p className="text-cva-text-muted text-xs">
        Salvar uma senha nova encerra a sessão em todos os aparelhos.
      </p>
    </form>
  );
}
