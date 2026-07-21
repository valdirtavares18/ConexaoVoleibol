'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import {
  approveRegistrationAction,
  rejectRegistrationAction,
} from '@/server/actions/admin-actions';

/**
 * Sentinela para "criar perfil novo". O Radix não aceita item com valor vazio,
 * então a opção precisa de um valor próprio — convertido de volta para vazio no
 * campo oculto que a server action lê.
 */
const NEW_PROFILE = 'novo_perfil';

/**
 * Decisão sobre um cadastro pendente (§5.1).
 *
 * O caminho de **vincular a um perfil existente** fica em destaque quando há
 * coincidência de e-mail: criar um segundo perfil para a mesma pessoa é o erro
 * mais caro aqui, porque quebra histórico, presença e financeiro em dois.
 */

function ApproveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="gold" disabled={pending}>
      {pending ? 'Aprovando…' : label}
    </Button>
  );
}

function RejectButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? 'Enviando…' : label}
    </Button>
  );
}

export function RegistrationDecision({
  userId,
  name,
  matchAthleteId,
  matchName,
  athletes,
}: {
  userId: string;
  name: string;
  matchAthleteId: string | null;
  matchName: string | null;
  athletes: { id: string; displayName: string }[];
}) {
  const [approveState, approveAction] = useActionState(
    approveRegistrationAction,
    EMPTY_ACTION_STATE,
  );
  const [rejectState, rejectAction] = useActionState(rejectRegistrationAction, EMPTY_ACTION_STATE);
  const [showReject, setShowReject] = useState(false);
  const [linkTo, setLinkTo] = useState(matchAthleteId ?? NEW_PROFILE);

  const feedback = approveState.message ?? rejectState.message;
  const ok = approveState.ok || rejectState.ok;

  return (
    <div className="flex flex-col gap-3">
      {feedback ? <Callout tone={ok ? 'success' : 'danger'}>{feedback}</Callout> : null}

      <form action={approveAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="userId" value={userId} />
        {/* Vazio quando é para criar um perfil novo — a action trata assim. */}
        <input type="hidden" name="linkToAthleteId" value={linkTo === NEW_PROFILE ? '' : linkTo} />

        <Select
          size="sm"
          className="min-w-64"
          label="Vincular a um perfil existente"
          name={`link-${userId}`}
          value={linkTo}
          onValueChange={setLinkTo}
          options={[
            { value: NEW_PROFILE, label: `Criar um perfil novo para ${name}` },
            ...(matchAthleteId && matchName
              ? [{ value: matchAthleteId, label: matchName, hint: 'o e-mail coincide' }]
              : []),
            ...athletes
              .filter((athlete) => athlete.id !== matchAthleteId)
              .map((athlete) => ({ value: athlete.id, label: athlete.displayName })),
          ]}
        />

        <ApproveButton label={linkTo === NEW_PROFILE ? 'Aprovar' : 'Aprovar e vincular'} />

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowReject((open) => !open)}
        >
          {showReject ? 'Cancelar' : 'Recusar ou pedir ajustes'}
        </Button>
      </form>

      {showReject ? (
        <form action={rejectAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="userId" value={userId} />

          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label htmlFor={`reason-${userId}`} className="text-cva-text text-xs font-medium">
              Motivo (fica registrado na auditoria)
            </label>
            <input
              id={`reason-${userId}`}
              name="reason"
              required
              minLength={3}
              className="border-cva-border-strong bg-cva-panel text-cva-text h-9 rounded-md border px-2.5 text-sm"
            />
          </div>

          <input type="hidden" name="mode" value="ajustes" />
          <RejectButton label="Pedir ajustes" />
        </form>
      ) : null}
    </div>
  );
}
