'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout } from '@/components/ui/primitives';
import { EMPTY_AUTH_STATE } from '@/lib/action-state';
import { requestPasswordResetAction } from '@/server/auth/signup-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? 'Enviando…' : 'Solicitar recuperação'}
    </Button>
  );
}

export function RecoverForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Callout tone="danger">{state.error}</Callout> : null}
      {state.ok && state.message ? <Callout tone="success">{state.message}</Callout> : null}

      <Field
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={state.fieldErrors.email}
      />

      <SubmitButton />
    </form>
  );
}
