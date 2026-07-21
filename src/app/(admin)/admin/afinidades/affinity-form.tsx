'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { saveAdminAffinityAction } from '@/server/actions/admin-actions';

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
export function AffinityForm({
  athletes,
}: {
  athletes: { id: string; displayName: string }[];
}) {
  const [state, formAction] = useActionState(saveAdminAffinityAction, EMPTY_ACTION_STATE);
  const [rigidity, setRigidity] = useState('preferencia_flexivel');

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
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fromAthleteId" className="text-cva-text text-sm font-medium">
                De (quem prefere)
              </label>
              <select
                id="fromAthleteId"
                name="fromAthleteId"
                required
                className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="toAthleteId" className="text-cva-text text-sm font-medium">
                Para (em relação a quem)
              </label>
              <select
                id="toAthleteId"
                name="toAthleteId"
                required
                className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="type" className="text-cva-text text-sm font-medium">
                Tipo
              </label>
              <select
                id="type"
                name="type"
                defaultValue="pessoal"
                className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm"
              >
                <option value="pessoal">Pessoal</option>
                <option value="tatica">Tática</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="intensity" className="text-cva-text text-sm font-medium">
                Intensidade
              </label>
              <select
                id="intensity"
                name="intensity"
                defaultValue="2"
                className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm"
              >
                <option value="3">+3 — muito forte, juntos</option>
                <option value="2">+2 — forte, juntos</option>
                <option value="1">+1 — leve, juntos</option>
                <option value="0">0 — neutro (remove)</option>
                <option value="-1">−1 — leve, separados</option>
                <option value="-2">−2 — forte, separados</option>
                <option value="-3">−3 — muito forte, separados</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rigidity" className="text-cva-text text-sm font-medium">
              Rigidez
            </label>
            <select
              id="rigidity"
              name="rigidity"
              value={rigidity}
              onChange={(event) => setRigidity(event.target.value)}
              className="border-cva-border-strong bg-cva-panel text-cva-text h-11 rounded-md border px-3 text-sm sm:max-w-md"
            >
              <option value="preferencia_flexivel">
                Preferência flexível — considerada se não desequilibrar
              </option>
              <option value="restricao_obrigatoria">
                Restrição obrigatória — nunca violada
              </option>
            </select>
          </div>

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
