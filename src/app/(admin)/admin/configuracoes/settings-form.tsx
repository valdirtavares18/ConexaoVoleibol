'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { updateSettingsAction } from '@/server/actions/settings-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" size="lg" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar configurações'}
    </Button>
  );
}

export function SettingsForm({
  settings,
}: {
  settings: {
    clubName: string;
    shortName: string;
    timezone: string;
    defaultValuePerAthlete: number;
    defaultCourtCost: number;
    defaultCapacity: number;
    defaultTeamCount: number;
    defaultTeamSize: number;
    maxConsecutiveMatches: number;
    maxImbalancePct: number;
    provisionalReviewAfterEvents: number;
    selfOfficialEvaluationVisible: boolean;
    recentPairingWindow: number;
  };
}) {
  const [state, formAction] = useActionState(updateSettingsAction, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      <Panel>
        <PanelHeader title="Identidade" />
        <PanelBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome do clube" name="clubName" defaultValue={settings.clubName} required />
            <Field label="Nome curto" name="shortName" defaultValue={settings.shortName} required />
            <Field label="Fuso horário" name="timezone" defaultValue={settings.timezone} required />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Encontro padrão"
          description="Usado ao criar um novo encontro. A capacidade precisa bater com times × atletas."
        />
        <PanelBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Valor por atleta (R$)"
              name="defaultValuePerAthlete"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings.defaultValuePerAthlete}
              required
            />
            <Field
              label="Custo padrão da quadra (R$)"
              name="defaultCourtCost"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings.defaultCourtCost}
              required
            />
            <Field
              label="Capacidade"
              name="defaultCapacity"
              type="number"
              min={2}
              defaultValue={settings.defaultCapacity}
              required
            />
            <Field
              label="Quantidade de times"
              name="defaultTeamCount"
              type="number"
              min={2}
              defaultValue={settings.defaultTeamCount}
              required
            />
            <Field
              label="Atletas por time"
              name="defaultTeamSize"
              type="number"
              min={2}
              defaultValue={settings.defaultTeamSize}
              required
            />
            <Field
              label="Partidas consecutivas"
              name="maxConsecutiveMatches"
              type="number"
              min={1}
              max={5}
              defaultValue={settings.maxConsecutiveMatches}
              hint="Máximo que um time joga seguido antes de sair obrigatoriamente."
              required
            />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Gerador de times e avaliações" />
        <PanelBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Limite de desequilíbrio (%)"
              name="maxImbalancePct"
              type="number"
              step="0.25"
              min="0"
              defaultValue={settings.maxImbalancePct}
              hint="Diferença aceitável entre o time mais forte e o mais fraco."
              required
            />
            <Field
              label="Revisar provisória após"
              name="provisionalReviewAfterEvents"
              type="number"
              min={1}
              defaultValue={settings.provisionalReviewAfterEvents}
              hint="Participações até o sistema avisar. Nenhuma nota muda sozinha."
              required
            />
            <Field
              label="Janela de duplas recentes"
              name="recentPairingWindow"
              type="number"
              min={0}
              max={20}
              defaultValue={settings.recentPairingWindow}
              hint="Quantos encontros contam para a variação social."
              required
            />
          </div>

          <label className="border-cva-border flex items-start gap-2.5 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              name="selfOfficialEvaluationVisible"
              defaultChecked={settings.selfOfficialEvaluationVisible}
              className="accent-cva-navy-900 mt-0.5 size-4"
            />
            <span>
              <span className="text-cva-navy-900 font-medium">
                Permitir que cada atleta veja a própria avaliação oficial
              </span>
              <span className="text-cva-text-muted block text-xs">
                Desligado por padrão. Mesmo ligado, ninguém vê a avaliação de outra pessoa — não
                existe ranking no CVA.
              </span>
            </span>
          </label>
        </PanelBody>
      </Panel>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
