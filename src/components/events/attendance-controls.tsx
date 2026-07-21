'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { respondToEventAction } from '@/server/actions/attendance-actions';

/**
 * Ação de confirmar/cancelar presença.
 *
 * A tela mostra a ação **oposta** ao estado atual, em vez de três botões sempre
 * visíveis: no celular, o atleta abre o app para fazer uma coisa só.
 */

function ActionButton({
  children,
  variant,
  value,
}: {
  children: React.ReactNode;
  variant: 'gold' | 'secondary' | 'ghost';
  value: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name="response"
      value={value}
      variant={variant}
      size="lg"
      block
      disabled={pending}
    >
      {pending ? 'Enviando…' : children}
    </Button>
  );
}

export type ParticipationStatus =
  | 'confirmado'
  | 'talvez'
  | 'nao_participa'
  | 'lista_espera'
  | 'cancelou_apos_prazo'
  | 'sem_resposta';

export function AttendanceControls({
  eventId,
  status,
  waitlistPosition,
  deadlinePassed,
}: {
  eventId: string;
  status: ParticipationStatus;
  waitlistPosition: number | null;
  deadlinePassed: boolean;
}) {
  const [state, formAction] = useActionState(respondToEventAction, EMPTY_ACTION_STATE);

  return (
    <div className="flex flex-col gap-3">
      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      {status === 'lista_espera' ? (
        <Callout tone="warning" title={`Você é o ${waitlistPosition ?? 1}º da lista de espera`}>
          Se alguém cancelar, você entra automaticamente e recebe um aviso.
        </Callout>
      ) : null}

      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="eventId" value={eventId} />

        {status === 'confirmado' || status === 'lista_espera' ? (
          <>
            <ActionButton variant="secondary" value="cancelar">
              {status === 'lista_espera' ? 'Sair da lista de espera' : 'Cancelar presença'}
            </ActionButton>
            {deadlinePassed ? (
              <p className="text-cva-text-muted self-center text-xs">
                O prazo já passou — o cancelamento fica registrado como aviso em cima da hora.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <ActionButton variant="gold" value="confirmar">
              Vou jogar
            </ActionButton>
            {status !== 'talvez' ? (
              <ActionButton variant="ghost" value="talvez">
                Talvez
              </ActionButton>
            ) : null}
            {status !== 'nao_participa' ? (
              <ActionButton variant="ghost" value="nao_participar">
                Não vou
              </ActionButton>
            ) : null}
          </>
        )}
      </form>
    </div>
  );
}
