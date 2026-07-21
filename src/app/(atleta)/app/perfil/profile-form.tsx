'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { updateProfileAction } from '@/server/actions/profile-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar alterações'}
    </Button>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: {
    nickname: string;
    phone: string;
    email: string;
    birthDate: string;
    uniformSize: string;
    athleteNotes: string;
  };
}) {
  const [state, formAction] = useActionState(updateProfileAction, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Apelido" name="nickname" defaultValue={initial.nickname} maxLength={40} />
        <Field
          label="Telefone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={initial.phone}
          hint="Usado apenas pelos administradores para contato do grupo."
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={initial.email}
        />
        <Field
          label="Data de nascimento"
          name="birthDate"
          type="date"
          defaultValue={initial.birthDate}
        />
        <Field
          label="Tamanho do uniforme"
          name="uniformSize"
          defaultValue={initial.uniformSize}
          maxLength={6}
          placeholder="P, M, G, GG…"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="athleteNotes" className="text-cva-text text-sm font-medium">
          Observações
        </label>
        <textarea
          id="athleteNotes"
          name="athleteNotes"
          rows={3}
          maxLength={500}
          defaultValue={initial.athleteNotes}
          placeholder="Algo que o grupo deva saber: horário, disponibilidade, posição que quer treinar…"
          className="border-cva-border-strong bg-cva-panel text-cva-text placeholder:text-cva-text-muted rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
