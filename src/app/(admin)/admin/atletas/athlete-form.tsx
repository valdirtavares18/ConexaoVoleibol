'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { DEFAULT_POSITIONS, type PositionCode } from '@/domain/positions';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { createAthleteAction, updateAthleteAction } from '@/server/actions/admin-actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" size="lg" disabled={pending}>
      {pending ? 'Salvando…' : label}
    </Button>
  );
}

export interface AthleteFormValues {
  athleteId?: string;
  fullName: string;
  nickname: string;
  phone: string;
  email: string;
  birthDate: string;
  shirtNumber: string;
  uniformSize: string;
  status: string;
  adminNotes: string;
  healthRestrictions: string;
  primaryPosition: PositionCode | '';
  secondaryPositions: PositionCode[];
  unwantedPositions: PositionCode[];
}

export const EMPTY_ATHLETE: AthleteFormValues = {
  fullName: '',
  nickname: '',
  phone: '',
  email: '',
  birthDate: '',
  shirtNumber: '',
  uniformSize: '',
  status: 'ativo',
  adminNotes: '',
  healthRestrictions: '',
  primaryPosition: '',
  secondaryPositions: [],
  unwantedPositions: [],
};

/**
 * Cadastro e edição de atleta pelo administrador (§5.2 e §5.3).
 *
 * Os campos privados — observação interna e restrição física — ficam num painel
 * separado e rotulado como tal. Não é decoração: deixa explícito para quem
 * preenche que aquilo nunca chega ao cliente do atleta.
 */
export function AthleteForm({ initial }: { initial: AthleteFormValues }) {
  const isEdit = Boolean(initial.athleteId);
  const [state, formAction] = useActionState(
    isEdit ? updateAthleteAction : createAthleteAction,
    EMPTY_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {initial.athleteId ? (
        <input type="hidden" name="athleteId" value={initial.athleteId} />
      ) : null}

      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      <Panel>
        <PanelHeader title="Dados do atleta" />
        <PanelBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" name="fullName" defaultValue={initial.fullName} required />
            <Field label="Apelido" name="nickname" defaultValue={initial.nickname} />
            <Field label="Telefone" name="phone" type="tel" defaultValue={initial.phone} />
            <Field label="E-mail" name="email" type="email" defaultValue={initial.email} />
            <Field
              label="Data de nascimento"
              name="birthDate"
              type="date"
              defaultValue={initial.birthDate}
            />
            <Field
              label="Número da camisa"
              name="shirtNumber"
              type="number"
              min={0}
              defaultValue={initial.shirtNumber}
            />
            <Field
              label="Tamanho do uniforme"
              name="uniformSize"
              defaultValue={initial.uniformSize}
              placeholder="P, M, G, GG…"
            />

            <Select
              label="Situação"
              name="status"
              defaultValue={initial.status}
              options={[
                { value: 'ativo', label: 'Ativo', hint: 'entra na escalação normalmente' },
                { value: 'lesionado', label: 'Lesionado' },
                { value: 'afastado', label: 'Afastado' },
                { value: 'inativo', label: 'Inativo', hint: 'não aparece nas listagens' },
              ]}
            />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Posições"
          description="A principal alimenta a cobertura tática do gerador de times."
        />
        <PanelBody className="flex flex-col gap-4">
          <Select
            className="sm:max-w-xs"
            label="Posição principal"
            name="primaryPosition"
            defaultValue={initial.primaryPosition || 'sem_posicao'}
            options={[
              { value: 'sem_posicao', label: 'Não definida' },
              ...DEFAULT_POSITIONS.map((position) => ({
                value: position.code,
                label: position.name,
                hint: position.description,
              })),
            ]}
          />

          <fieldset>
            <legend className="text-cva-text text-sm font-medium">Posições secundárias</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEFAULT_POSITIONS.map((position) => (
                <label
                  key={position.code}
                  className="border-cva-border hover:bg-cva-blue-100/40 has-[:checked]:border-cva-gold-500 has-[:checked]:bg-cva-gold-100/60 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="secondaryPositions"
                    value={position.code}
                    defaultChecked={initial.secondaryPositions.includes(position.code)}
                    className="accent-cva-navy-900 size-4"
                  />
                  {position.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-cva-text text-sm font-medium">
              Prefere não jogar nestas posições
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEFAULT_POSITIONS.map((position) => (
                <label
                  key={position.code}
                  className="border-cva-border hover:bg-cva-danger-soft has-[:checked]:border-cva-danger has-[:checked]:bg-cva-danger-soft flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="unwantedPositions"
                    value={position.code}
                    defaultChecked={initial.unwantedPositions.includes(position.code)}
                    className="accent-cva-danger size-4"
                  />
                  {position.name}
                </label>
              ))}
            </div>
            <p className="text-cva-text-muted mt-1.5 text-xs">
              O gerador não conta estas posições como cobertura para o atleta.
            </p>
          </fieldset>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Informações restritas"
          description="Nunca são enviadas para o cliente de um atleta — nem para o próprio, no caso da observação interna."
        />
        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="adminNotes" className="text-cva-text text-sm font-medium">
              Observação interna dos administradores
            </label>
            <textarea
              id="adminNotes"
              name="adminNotes"
              rows={2}
              defaultValue={initial.adminNotes}
              className="border-cva-border-strong bg-cva-panel rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="healthRestrictions" className="text-cva-text text-sm font-medium">
              Restrições físicas ou médicas
            </label>
            <textarea
              id="healthRestrictions"
              name="healthRestrictions"
              rows={2}
              defaultValue={initial.healthRestrictions}
              placeholder="Ex.: tendinite no ombro direito — evitar saque viagem"
              className="border-cva-border-strong bg-cva-panel rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-cva-text-muted text-xs">
              Visível ao próprio atleta e aos administradores. Nunca a terceiros.
            </p>
          </div>
        </PanelBody>
      </Panel>

      <div>
        <SubmitButton label={isEdit ? 'Salvar alterações' : 'Cadastrar atleta'} />
      </div>
    </form>
  );
}
