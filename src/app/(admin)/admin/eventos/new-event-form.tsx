'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { createEventAction } from '@/server/actions/admin-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" disabled={pending}>
      {pending ? 'Criando…' : 'Criar jogo'}
    </Button>
  );
}

/**
 * Criação de jogo.
 *
 * Fica recolhido por padrão: a tela de jogos é usada muito mais para
 * consultar do que para criar, e um formulário sempre aberto empurraria a lista
 * para baixo da dobra.
 */
export function NewEventForm() {
  const [state, formAction] = useActionState(createEventAction, EMPTY_ACTION_STATE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div>
        <Button variant="gold" onClick={() => setOpen(true)}>
          Novo jogo
        </Button>
      </div>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Novo jogo"
        description="Os valores em branco usam os padrões do clube."
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" name="title" required defaultValue="Jogo de quarta" />

            <Select
              label="Tipo"
              name="type"
              defaultValue="encontro"
              options={[
                { value: 'encontro', label: 'Jogo', hint: 'o jogo normal do grupo' },
                { value: 'treino', label: 'Treino' },
                { value: 'amistoso', label: 'Amistoso' },
                { value: 'campeonato', label: 'Campeonato' },
                { value: 'confraternizacao', label: 'Confraternização' },
                { value: 'outro', label: 'Outro' },
              ]}
            />

            <Field label="Data" name="eventDate" type="date" required />
            <Field label="Horário de início" name="startTime" type="time" defaultValue="20:00" />
            <Field label="Local" name="venueName" placeholder="Ginásio do Bairro Centro" />
            <Field label="Endereço" name="address" />
            <Field
              label="Prazo de confirmação"
              name="confirmationDeadline"
              type="datetime-local"
              hint="Depois disso, só um administrador confirma presença."
            />
            <Field
              label="Capacidade"
              name="capacity"
              type="number"
              inputMode="numeric"
              min={2}
              placeholder="18"
            />
            <Field
              label="Valor por atleta (R$)"
              name="valuePerAthlete"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              placeholder="10,00"
            />
            <Field
              label="Custo da quadra (R$)"
              name="courtCost"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              placeholder="150,00"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="notes" className="text-cva-text text-sm font-medium">
              Observações
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={600}
              placeholder="Levar a camisa clara. Quem chegar antes ajuda a montar a rede."
              className="border-cva-border-strong bg-cva-panel text-cva-text placeholder:text-cva-text-muted rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <SubmitButton />
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
