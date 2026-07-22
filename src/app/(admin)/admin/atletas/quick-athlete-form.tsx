'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { quickCreateAthleteAction } from '@/server/actions/admin-actions';

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" disabled={pending}>
      {pending ? 'Cadastrando…' : 'Cadastrar e continuar'}
    </Button>
  );
}

/**
 * Cadastro rápido de atleta (§5.2).
 *
 * Feito para o administrador sentar e cadastrar o grupo inteiro de uma vez: só
 * nome e contato, sem posições nem avaliação — isso fica para a edição depois.
 *
 * Ao contrário da tela de cadastro completo, o formulário **não redireciona**;
 * ele se limpa e devolve o foco ao nome, pronto para o próximo. A lista do lado
 * confirma quem entrou nesta sessão — sem ela, cadastrar dez pessoas seguidas é
 * às cegas.
 */
export function QuickAthleteForm() {
  const [state, formAction] = useActionState(quickCreateAthleteAction, EMPTY_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const [added, setAdded] = useState<string[]>([]);

  // A action revalida a rota e a tabela ao lado se atualiza sozinha; aqui só
  // limpamos os campos e registramos o nome para o feedback da sessão. O
  // `state.message` é a fonte — não incrementamos um contador à parte que
  // poderia divergir do que o servidor de fato gravou.
  useEffect(() => {
    if (state.ok && state.message) {
      formRef.current?.reset();
      formRef.current?.querySelector<HTMLInputElement>('input[name="fullName"]')?.focus();
      setAdded((prev) => [state.message as string, ...prev]);
    }
  }, [state]);

  return (
    <Panel>
      <PanelHeader
        title="Cadastro rápido"
        description="Só nome e contato. As posições e a avaliação ficam para depois, na edição de cada atleta."
      />
      <PanelBody className="flex flex-col gap-4">
        {state.message ? (
          <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
        ) : null}

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" name="fullName" required autoComplete="off" />
            <Field label="Apelido" name="nickname" autoComplete="off" />
            <Field label="Telefone" name="phone" type="tel" autoComplete="off" />
            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="off"
              hint="Por e-mail ou telefone o sistema reconhece a pessoa quando ela criar a conta."
            />
          </div>

          <div>
            <AddButton />
          </div>
        </form>

        {added.length > 0 ? (
          <div className="border-cva-border border-t pt-4">
            <p className="text-cva-text-muted text-xs font-medium">
              Cadastrados nesta sessão ({added.length})
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {added.map((label, index) => (
                <li
                  key={`${label}-${index}`}
                  className="bg-cva-blue-100/50 text-cva-navy-900 rounded-full px-2.5 py-1 text-xs"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
