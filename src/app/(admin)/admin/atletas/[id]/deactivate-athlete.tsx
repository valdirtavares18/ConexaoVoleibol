'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { deactivateAthleteAction } from '@/server/actions/admin-actions';

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? 'Removendo…' : 'Confirmar remoção'}
    </Button>
  );
}

/**
 * Remoção de atleta (§5.3).
 *
 * É **exclusão lógica**: o registro sai das listagens mas continua existindo,
 * porque presenças, times, partidas e financeiro antigos apontam para ele.
 * Apagar de verdade quebraria o histórico do grupo.
 */
export function DeactivateAthlete({ athleteId, name }: { athleteId: string; name: string }) {
  const [state, formAction] = useActionState(deactivateAthleteAction, EMPTY_ACTION_STATE);
  const [confirming, setConfirming] = useState(false);

  return (
    <Panel>
      <PanelHeader
        title="Remover do grupo"
        description="O histórico é preservado — o atleta apenas deixa de aparecer nas listagens."
      />
      <PanelBody className="flex flex-col gap-3">
        {state.message ? (
          <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
        ) : null}

        {!confirming ? (
          <div>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Remover {name} do grupo
            </Button>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="athleteId" value={athleteId} />

            <Callout tone="danger" title={`Remover ${name}?`}>
              Presenças, times, partidas e financeiro anteriores continuam intactos. O atleta some
              das listagens e não pode mais ser escalado.
            </Callout>

            <label htmlFor="deactivate-reason" className="text-cva-text text-sm font-medium">
              Motivo
            </label>
            <input
              id="deactivate-reason"
              name="reason"
              required
              minLength={3}
              placeholder="Ex.: saiu do grupo em julho"
              className="border-cva-border-strong bg-cva-panel h-11 rounded-md border px-3 text-sm"
            />

            <div className="flex gap-2">
              <ConfirmButton />
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </PanelBody>
    </Panel>
  );
}
