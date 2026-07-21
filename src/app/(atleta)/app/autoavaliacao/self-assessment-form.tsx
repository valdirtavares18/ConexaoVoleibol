'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { OVERALL_LEVEL_DESCRIPTIONS, SKILL_DEFINITIONS } from '@/domain/positions';
import type { Rating } from '@/domain/shared/rating';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { submitSelfAssessmentAction } from '@/server/actions/profile-actions';

/**
 * Autoavaliação (§7.1).
 *
 * Cada critério traz a **descrição objetiva de cada nível** e a opção "não sei
 * avaliar" — que grava `null`, e não zero. Um grupo amador não tem repertório
 * para dizer "meu bloqueio é 3" no vazio; a descrição é o que torna a nota
 * comparável entre pessoas diferentes.
 */

const SCALE = [1, 2, 3, 4, 5] as const;

function RatingChoice({
  name,
  legend,
  description,
  levels,
  defaultValue,
}: {
  name: string;
  legend: string;
  description?: string;
  levels: Readonly<Record<1 | 2 | 3 | 4 | 5, string>>;
  defaultValue: Rating;
}) {
  return (
    <fieldset className="border-cva-border border-t px-4 py-4 first:border-t-0 sm:px-5">
      <legend className="sr-only">{legend}</legend>

      <div className="mb-2.5">
        <p className="text-cva-navy-900 text-sm font-semibold">{legend}</p>
        {description ? <p className="text-cva-text-muted mt-0.5 text-xs">{description}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        {SCALE.map((level) => (
          <label
            key={level}
            className="border-cva-border hover:bg-cva-blue-100/40 has-[:checked]:border-cva-gold-500 has-[:checked]:bg-cva-gold-100/60 flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors"
          >
            <input
              type="radio"
              name={name}
              value={level}
              defaultChecked={defaultValue === level}
              className="accent-cva-navy-900 mt-0.5 size-4 shrink-0"
            />
            <span>
              <span data-numeric className="text-cva-navy-900 font-semibold">
                {level}
              </span>
              <span className="text-cva-text"> — {levels[level]}</span>
            </span>
          </label>
        ))}

        <label className="border-cva-border text-cva-text-muted hover:bg-cva-surface has-[:checked]:border-cva-border-strong has-[:checked]:bg-cva-surface flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed px-3 py-2 text-sm transition-colors">
          <input
            type="radio"
            name={name}
            value="nao_sei"
            defaultChecked={defaultValue === null}
            className="accent-cva-navy-900 size-4 shrink-0"
          />
          Não sei avaliar
        </label>
      </div>
    </fieldset>
  );
}

function SubmitBar({ isUpdate }: { isUpdate: boolean }) {
  const { pending } = useFormStatus();

  return (
    // Barra de ação fixa: o formulário é longo e a ação não pode sumir do
    // alcance no celular (§15.4).
    <div className="border-cva-border bg-cva-panel/95 sticky bottom-14 z-10 -mx-4 border-t px-4 py-3 backdrop-blur sm:bottom-0 sm:mx-0 sm:rounded-b-lg">
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? 'Enviando…' : isUpdate ? 'Enviar nova revisão' : 'Enviar autoavaliação'}
      </Button>
    </div>
  );
}

export function SelfAssessmentForm({
  current,
}: {
  current: { overall: Rating; skills: Partial<Record<string, Rating>>; note: string | null } | null;
}) {
  const [state, formAction] = useActionState(submitSelfAssessmentAction, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      <Callout tone="info" title="Como isto é usado">
        Sua autoavaliação é uma <strong>referência</strong> para os administradores. Ela não define
        a nota oficial nem entra diretamente na montagem dos times.
      </Callout>

      <Panel>
        <PanelHeader
          title="Nível geral"
          description="Como você se enxerga no vôlei hoje, de forma geral."
        />
        <PanelBody flush>
          <RatingChoice
            name="overall"
            legend="Nível geral"
            levels={OVERALL_LEVEL_DESCRIPTIONS}
            defaultValue={current?.overall ?? null}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Fundamentos"
          description="Um de cada vez. Se não souber avaliar algum, marque a última opção."
        />
        <PanelBody flush>
          {SKILL_DEFINITIONS.map((skill) => (
            <RatingChoice
              key={skill.code}
              name={skill.code}
              legend={skill.name}
              levels={skill.levels}
              defaultValue={current?.skills[skill.code] ?? null}
            />
          ))}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Observação" description="Opcional." />
        <PanelBody>
          <label htmlFor="note" className="sr-only">
            Observação
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            defaultValue={current?.note ?? ''}
            placeholder="Algo que ajude a entender o seu momento: lesão, tempo sem jogar, posição que quer treinar…"
            className="border-cva-border-strong bg-cva-panel text-cva-text placeholder:text-cva-text-muted w-full rounded-md border px-3 py-2 text-sm"
          />
        </PanelBody>
      </Panel>

      <SubmitBar isUpdate={current !== null} />
    </form>
  );
}
