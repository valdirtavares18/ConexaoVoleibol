'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { addCashAdjustmentAction } from '@/server/actions/admin-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Registrando…' : 'Registrar ajuste'}
    </Button>
  );
}

/**
 * Ajuste manual de caixa (§13.4).
 *
 * O motivo é obrigatório na interface, na server action, no serviço **e** num
 * CHECK do banco. Redundância deliberada: um ajuste sem explicação é
 * exatamente o registro que ninguém consegue reconstruir seis meses depois.
 */
export function CashAdjustmentForm() {
  const [state, formAction] = useActionState(addCashAdjustmentAction, EMPTY_ACTION_STATE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Registrar ajuste manual
        </Button>
      </div>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Ajuste manual de caixa"
        description="Use para corrigir divergências ou registrar entradas e saídas fora dos encontros."
        actions={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        }
      />
      <PanelBody>
        {state.message ? (
          <div className="mb-4">
            <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
          </div>
        ) : null}

        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="direction" className="text-cva-text text-sm font-medium">
                Tipo
              </label>
              <select
                id="direction"
                name="direction"
                defaultValue="entrada"
                className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm"
              >
                <option value="entrada">Entrada no caixa</option>
                <option value="saida">Saída do caixa</option>
              </select>
            </div>

            <Field
              label="Valor (R$)"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
            />

            <Field label="Descrição" name="description" required minLength={3} />
          </div>

          <Field
            label="Motivo"
            name="reason"
            required
            minLength={3}
            hint="Obrigatório. Fica registrado na auditoria com seu nome e a data."
          />

          <div>
            <SubmitButton />
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
