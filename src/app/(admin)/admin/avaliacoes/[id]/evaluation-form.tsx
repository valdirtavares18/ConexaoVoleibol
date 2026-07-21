'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { SKILL_DEFINITIONS } from '@/domain/positions';
import { RATING_VALUES, type Rating } from '@/domain/shared/rating';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { saveOfficialEvaluationAction } from '@/server/actions/admin-actions';

/**
 * Revisão administrativa da avaliação (§7.2).
 *
 * Layout de três colunas no desktop: **autoavaliação à esquerda, diferença no
 * centro, avaliação oficial à direita**. Ver a diferença ao lado do campo é o
 * que torna a revisão rápida — o admin foca onde o atleta se avalia distante da
 * percepção do grupo. No celular vira uma coluna, com a autoavaliação como
 * referência acima do campo.
 */

interface AssessmentLike {
  overall: Rating;
  skills: Partial<Record<string, Rating>>;
}

function DiffBadge({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return <span className="text-cva-text-muted text-xs">—</span>;
  }

  if (Math.abs(value) < 0.01) {
    return <span className="text-cva-text-muted text-xs">igual</span>;
  }

  const positive = value > 0;

  return (
    <span
      className={`text-xs font-semibold ${positive ? 'text-cva-warning' : 'text-cva-info'}`}
      title={positive ? 'O atleta se avalia acima' : 'O atleta se avalia abaixo'}
    >
      {positive ? '+' : ''}
      {value.toFixed(1)}
    </span>
  );
}

function RatingSelect({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: Rating;
  label: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`field-${name}`}>
        {label}
      </label>
      <select
        id={`field-${name}`}
        name={name}
        defaultValue={defaultValue === null ? 'nao_avaliado' : String(defaultValue)}
        className="border-cva-border-strong bg-cva-panel text-cva-text h-9 w-full rounded-md border px-2 text-sm"
      >
        <option value="nao_avaliado">Não avaliado</option>
        {RATING_VALUES.map((value) => (
          <option key={value} value={value}>
            {value.toFixed(1)}
          </option>
        ))}
      </select>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" size="lg" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar avaliação oficial'}
    </Button>
  );
}

export function EvaluationForm({
  athleteId,
  self,
  official,
  differences,
}: {
  athleteId: string;
  self: AssessmentLike | null;
  official: (AssessmentLike & { status: string; internalNote: string | null }) | null;
  differences: Partial<Record<string, number>>;
}) {
  const [state, formAction] = useActionState(saveOfficialEvaluationAction, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="athleteId" value={athleteId} />

      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      {!self ? (
        <Callout tone="info">
          Este atleta ainda não enviou autoavaliação. A coluna de referência fica vazia.
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="Comparação"
          description="Autoavaliação · diferença · avaliação oficial"
        />
        <PanelBody flush>
          {/* Cabeçalho das colunas, só no desktop. */}
          <div className="text-cva-text-muted border-cva-border hidden grid-cols-[minmax(0,1fr)_5rem_4rem_9rem] items-center gap-3 border-b px-4 py-2 text-xs font-semibold tracking-wide uppercase sm:grid sm:px-5">
            <span>Critério</span>
            <span className="text-center">Autoaval.</span>
            <span className="text-center">Dif.</span>
            <span className="text-center">Oficial</span>
          </div>

          <div className="divide-cva-border divide-y">
            {/* Nível geral */}
            <div className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_4rem_9rem] sm:gap-3 sm:px-5">
              <span className="text-cva-navy-900 text-sm font-semibold">Nível geral</span>
              <span data-numeric className="text-cva-text-muted text-sm sm:text-center">
                <span className="sm:hidden">Autoavaliação: </span>
                {self?.overall?.toFixed(1) ?? '—'}
              </span>
              <span className="sm:text-center">
                <DiffBadge value={differences.overall} />
              </span>
              <RatingSelect
                name="overall"
                defaultValue={official?.overall ?? null}
                label="Nível geral oficial"
              />
            </div>

            {SKILL_DEFINITIONS.map((skill) => (
              <div
                key={skill.code}
                className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_4rem_9rem] sm:gap-3 sm:px-5"
              >
                <span className="text-cva-text text-sm">{skill.name}</span>
                <span data-numeric className="text-cva-text-muted text-sm sm:text-center">
                  <span className="sm:hidden">Autoavaliação: </span>
                  {self?.skills[skill.code]?.toFixed(1) ?? '—'}
                </span>
                <span className="sm:text-center">
                  <DiffBadge value={differences[skill.code]} />
                </span>
                <RatingSelect
                  name={skill.code}
                  defaultValue={(official?.skills[skill.code] as Rating) ?? null}
                  label={`${skill.name} oficial`}
                />
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Registro da alteração" />
        <PanelBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="status" className="text-cva-text text-sm font-medium">
                Situação da avaliação
              </label>
              <select
                id="status"
                name="status"
                defaultValue={official?.status ?? 'provisoria'}
                className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm"
              >
                <option value="provisoria">
                  Provisória — revisar após as próximas participações
                </option>
                <option value="definitiva">Definitiva</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="internalNote" className="text-cva-text text-sm font-medium">
                Observação interna
              </label>
              <input
                id="internalNote"
                name="internalNote"
                defaultValue={official?.internalNote ?? ''}
                placeholder="Nunca visível ao atleta"
                className="border-cva-border-strong bg-cva-panel h-11 rounded-md border px-3 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="justification" className="text-cva-text text-sm font-medium">
              Justificativa
            </label>
            <input
              id="justification"
              name="justification"
              required
              minLength={3}
              placeholder="Ex.: evoluiu bastante na recepção nos últimos três encontros"
              className="border-cva-border-strong bg-cva-panel h-11 rounded-md border px-3 text-sm"
            />
            <p className="text-cva-text-muted text-xs">
              Obrigatória. Vai para o histórico imutável junto com o que mudou.
            </p>
          </div>

          <div>
            <SubmitButton />
          </div>
        </PanelBody>
      </Panel>
    </form>
  );
}
