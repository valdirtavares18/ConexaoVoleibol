'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout } from '@/components/ui/primitives';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '@/domain/shared/password-policy';
import { EMPTY_AUTH_STATE } from '@/lib/action-state';
import { signUpAction } from '@/server/auth/signup-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? 'Enviando…' : 'Criar conta'}
    </Button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Callout tone="danger">{state.error}</Callout> : null}

      <Field
        label="Nome completo"
        name="name"
        autoComplete="name"
        required
        error={state.fieldErrors.name}
      />

      <Field
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={state.fieldErrors.email}
      />

      <Field
        label="Telefone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        error={state.fieldErrors.phone}
        hint="Ajuda a encontrar seu cadastro se você já joga no grupo."
      />

      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        error={state.fieldErrors.password}
        hint={PASSWORD_HINT}
      />

      <Field
        label="Confirme a senha"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors.passwordConfirmation}
      />

      <SubmitButton />
    </form>
  );
}
