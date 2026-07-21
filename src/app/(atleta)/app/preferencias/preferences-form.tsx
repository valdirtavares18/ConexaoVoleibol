'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/ui/primitives';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select } from '@/components/ui/select';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { deleteAffinityAction, saveAffinityAction } from '@/server/actions/profile-actions';

/**
 * Preferências de afinidade do atleta (§8).
 *
 * A tela só mostra o que o próprio atleta cadastrou. Não existe — nem no
 * servidor — consulta de "quem me marcou": o alvo de uma preferência nunca fica
 * sabendo, e isso vale principalmente para as negativas.
 */

interface AffinityItem {
  id: string;
  toAthleteId: string;
  toDisplayName: string;
  type: 'pessoal' | 'tatica';
  intensity: number;
}

const INTENSITY_LABELS: Record<number, string> = {
  3: 'Faço questão de jogar junto',
  2: 'Gosto de jogar junto',
  1: 'Prefiro levemente jogar junto',
  0: 'Tanto faz (remove a preferência)',
  [-1]: 'Prefiro levemente jogar separado',
  [-2]: 'Prefiro jogar separado',
  [-3]: 'Faço questão de jogar separado',
};

function toneFor(intensity: number): 'success' | 'neutral' | 'danger' {
  if (intensity > 0) return 'success';
  if (intensity < 0) return 'danger';
  return 'neutral';
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar preferência'}
    </Button>
  );
}

export function PreferencesForm({
  athletes,
  existing,
}: {
  athletes: { id: string; displayName: string }[];
  existing: AffinityItem[];
}) {
  const [state, formAction] = useActionState(saveAffinityAction, EMPTY_ACTION_STATE);
  const [pending, startTransition] = useTransition();
  const [removeFeedback, setRemoveFeedback] = useState<string | null>(null);

  const remove = (id: string): void => {
    startTransition(async () => {
      const result = await deleteAffinityAction(id);
      setRemoveFeedback(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Callout tone="info" title="Suas preferências são privadas">
        Apenas você e os administradores enxergam o que você cadastra aqui. A outra pessoa
        <strong> nunca</strong> é informada. O equilíbrio dos times continua tendo prioridade sobre
        as preferências.
      </Callout>

      <Panel>
        <PanelHeader
          title="Nova preferência"
          description="Escolha o atleta e o quanto você prefere jogar junto ou separado."
        />
        <PanelBody>
          {state.message ? (
            <div className="mb-3">
              <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
            </div>
          ) : null}

          <form action={formAction} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableSelect
                label="Atleta"
                name="toAthleteId"
                required
                searchPlaceholder="Nome ou apelido…"
                options={athletes.map((athlete) => ({
                  value: athlete.id,
                  label: athlete.displayName,
                }))}
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
            </div>

            <Select
              label="Intensidade"
              name="intensity"
              defaultValue="2"
              options={[3, 2, 1, 0, -1, -2, -3].map((value) => ({
                value: String(value),
                label: INTENSITY_LABELS[value] ?? String(value),
              }))}
            />

            <div>
              <SubmitButton />
            </div>
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Suas preferências" description={`${existing.length} cadastrada(s)`} />
        <PanelBody flush>
          {removeFeedback ? (
            <div className="px-4 pt-3 sm:px-5">
              <Callout tone="success">{removeFeedback}</Callout>
            </div>
          ) : null}

          {existing.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhuma preferência cadastrada"
                description="Sem preferências, os times são montados apenas pelo equilíbrio técnico."
              />
            </div>
          ) : (
            <ul className="divide-cva-border divide-y">
              {existing.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-cva-text truncate text-sm font-medium">
                      {item.toDisplayName}
                    </p>
                    <p className="text-cva-text-muted text-xs">
                      {item.type === 'pessoal' ? 'Pessoal' : 'Tática'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={toneFor(item.intensity)} dot>
                      {INTENSITY_LABELS[item.intensity] ?? item.intensity}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(item.id)}
                      disabled={pending}
                    >
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
