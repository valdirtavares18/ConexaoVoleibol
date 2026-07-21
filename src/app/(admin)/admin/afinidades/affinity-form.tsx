'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { Select, type SelectOption } from '@/components/ui/select';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { saveAdminAffinityAction } from '@/server/actions/admin-actions';

const INTENSITY_OPTIONS: SelectOption[] = [
  { value: '3', label: '+3 · muito forte', hint: 'faz questão de jogar junto' },
  { value: '2', label: '+2 · forte', hint: 'gosta de jogar junto' },
  { value: '1', label: '+1 · leve', hint: 'prefere levemente jogar junto' },
  { value: '0', label: '0 · neutro', hint: 'remove a preferência' },
  { value: '-1', label: '−1 · leve', hint: 'prefere levemente jogar separado' },
  { value: '-2', label: '−2 · forte', hint: 'prefere jogar separado' },
  { value: '-3', label: '−3 · muito forte', hint: 'faz questão de jogar separado' },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" disabled={pending}>
      {pending ? 'Salvando…' : 'Registrar'}
    </Button>
  );
}

/**
 * Cadastro administrativo de afinidade.
 *
 * A escolha entre "preferência" e "restrição obrigatória" fica explícita e com
 * aviso: transformar algo em restrição dura reduz o espaço de busca do gerador
 * e pode impedir que o limite de equilíbrio seja atingido.
 */
export function AffinityForm({ athletes }: { athletes: { id: string; displayName: string }[] }) {
  const [state, formAction] = useActionState(saveAdminAffinityAction, EMPTY_ACTION_STATE);
  const [rigidity, setRigidity] = useState('preferencia_flexivel');

  const athleteOptions: SelectOption[] = athletes.map((athlete) => ({
    value: athlete.id,
    label: athlete.displayName,
  }));

  return (
    <Panel>
      <PanelHeader
        title="Registrar relação"
        description="A direção importa: quem prefere, e em relação a quem."
      />
      <PanelBody>
        {state.message ? (
          <div className="mb-4">
            <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
          </div>
        ) : null}

        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="De (quem prefere)"
              name="fromAthleteId"
              required
              options={athleteOptions}
            />

            <Select
              label="Para (em relação a quem)"
              name="toAthleteId"
              required
              options={athleteOptions}
            />

            <Select
              label="Tipo"
              name="type"
              defaultValue="pessoal"
              options={[
                { value: 'pessoal', label: 'Pessoal', hint: 'amizade, entrosamento' },
                { value: 'tatica', label: 'Tática', hint: 'funciona bem em quadra' },
              ]}
            />

            <Select
              label="Intensidade"
              name="intensity"
              defaultValue="2"
              options={INTENSITY_OPTIONS}
            />
          </div>

          <Select
            className="sm:max-w-md"
            label="Rigidez"
            name="rigidity"
            value={rigidity}
            onValueChange={setRigidity}
            options={[
              {
                value: 'preferencia_flexivel',
                label: 'Preferência flexível',
                hint: 'considerada se não desequilibrar',
              },
              {
                value: 'restricao_obrigatoria',
                label: 'Restrição obrigatória',
                hint: 'nunca violada pelo gerador',
              },
            ]}
          />

          {rigidity === 'restricao_obrigatoria' ? (
            <Callout tone="warning" title="Restrição obrigatória">
              O gerador nunca vai violar isto. Em compensação, restrições demais reduzem as
              combinações possíveis e podem impedir que o limite de equilíbrio seja atingido.
            </Callout>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="note" className="text-cva-text text-sm font-medium">
              Motivo (visível apenas a administradores)
            </label>
            <input
              id="note"
              name="note"
              maxLength={300}
              className="border-cva-border-strong bg-cva-panel h-11 rounded-md border px-3 text-sm sm:max-w-xl"
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
