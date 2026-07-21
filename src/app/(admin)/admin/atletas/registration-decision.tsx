'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import {
  approveRegistrationAction,
  rejectRegistrationAction,
} from '@/server/actions/admin-actions';

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
  const [linkTo, setLinkTo] = useState(matchAthleteId ?? '');

  const feedback = approveState.message ?? rejectState.message;
  const ok = approveState.ok || rejectState.ok;

  return (
    <div className="flex flex-col gap-3">
      {feedback ? <Callout tone={ok ? 'success' : 'danger'}>{feedback}</Callout> : null}

      <form action={approveAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="linkToAthleteId" value={linkTo} />

        <div className="flex min-w-56 flex-col gap-1.5">
          <label
            htmlFor={`link-${userId}`}
            className="text-cva-text text-xs font-medium"
          >
            Vincular a um perfil existente
          </label>
          <select
            id={`link-${userId}`}
            value={linkTo}
            onChange={(event) => setLinkTo(event.target.value)}
            className="border-cva-border-strong bg-cva-panel text-cva-text h-9 rounded-md border px-2.5 text-sm"
          >
            <option value="">Criar um perfil novo para {name}</option>
            {matchAthleteId && matchName ? (
              <option value={matchAthleteId}>{matchName} (e-mail coincide)</option>
            ) : null}
            {athletes
              .filter((athlete) => athlete.id !== matchAthleteId)
              .map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.displayName}
                </option>
              ))}
          </select>
        </div>

        <ApproveButton label={linkTo ? 'Aprovar e vincular' : 'Aprovar'} />

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
