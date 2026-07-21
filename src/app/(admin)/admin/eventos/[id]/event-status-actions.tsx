'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { setEventStatusAction } from '@/server/actions/admin-actions';

function StatusButton({
  status,
  label,
  variant = 'secondary',
}: {
  status: string;
  label: string;
  variant?: 'primary' | 'gold' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="status" value={status} variant={variant} disabled={pending}>
      {pending ? 'Aplicando…' : label}
    </Button>
  );
}

/**
 * Mudança de situação do jogo.
 *
 * Cancelar é destrutivo do ponto de vista do grupo (todo mundo perde o jogo),
 * então exige confirmação explícita e motivo — que vai para a auditoria (§20).
 */
export function EventStatusActions({ eventId, status }: { eventId: string; status: string }) {
  const [state, formAction] = useActionState(setEventStatusAction, EMPTY_ACTION_STATE);
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <Panel>
      <PanelHeader title="Situação do jogo" />
      <PanelBody className="flex flex-col gap-3">
        {state.message ? (
          <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
        ) : null}

        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="eventId" value={eventId} />

          {status === 'rascunho' ? (
            <StatusButton status="publicado" label="Publicar jogo" variant="gold" />
          ) : null}

          {status === 'publicado' ? (
            <>
              <StatusButton status="rascunho" label="Voltar para rascunho" />
              <StatusButton status="finalizado" label="Marcar como finalizado" />
            </>
          ) : null}

          {status === 'em_andamento' ? (
            <StatusButton status="finalizado" label="Finalizar jogo" />
          ) : null}

          {status !== 'cancelado' && status !== 'finalizado' ? (
            <Button type="button" variant="ghost" onClick={() => setConfirmCancel((open) => !open)}>
              {confirmCancel ? 'Manter jogo' : 'Cancelar jogo'}
            </Button>
          ) : null}
        </form>

        {confirmCancel ? (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="status" value="cancelado" />

            <Callout tone="danger" title="Cancelar o jogo">
              Todo mundo que confirmou vai ver o jogo como cancelado. O motivo fica registrado na
              auditoria.
            </Callout>

            <label htmlFor="cancel-reason" className="text-cva-text text-sm font-medium">
              Motivo do cancelamento
            </label>
            <input
              id="cancel-reason"
              name="reason"
              required
              minLength={3}
              placeholder="Ex.: quadra indisponível por causa da chuva"
              className="border-cva-border-strong bg-cva-panel h-11 rounded-md border px-3 text-sm"
            />

            <div>
              <Button type="submit" variant="danger">
                Confirmar cancelamento
              </Button>
            </div>
          </form>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
