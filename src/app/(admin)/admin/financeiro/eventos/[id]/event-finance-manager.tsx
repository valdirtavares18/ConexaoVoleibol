'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import {
  adjustChargeAction,
  closeEventFinanceAction,
  generateChargesAction,
  registerPaymentAction,
} from '@/server/actions/admin-actions';

interface Line {
  athleteId: string;
  displayName: string;
  dueCents: number;
  paidCents: number;
  status: string;
  dueLabel: string;
  paidLabel: string;
}

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  pendente: { label: 'Pendente', tone: 'warning' },
  pago: { label: 'Pago', tone: 'success' },
  parcial: { label: 'Parcial', tone: 'warning' },
  dispensado: { label: 'Dispensado', tone: 'neutral' },
  estornado: { label: 'Estornado', tone: 'danger' },
};

/**
 * Cobranças de um jogo (§13.2).
 *
 * O botão de "marcar como pago" preenche o valor devido — que é o caso comum,
 * já que quase todo mundo paga o valor cheio em Pix na hora. Pagamento parcial
 * continua possível pelo campo de valor.
 */
export function EventFinanceManager({
  eventId,
  lines,
  eventFinancialStatus,
  courtCostPaid,
}: {
  eventId: string;
  lines: Line[];
  /** Situação persistida do jogo, não a completude dos pagamentos. */
  eventFinancialStatus: 'aberto' | 'parcialmente_recebido' | 'fechado';
  courtCostPaid: boolean;
}) {
  const [paymentState, paymentAction] = useActionState(registerPaymentAction, EMPTY_ACTION_STATE);
  const [adjustState, adjustAction] = useActionState(adjustChargeAction, EMPTY_ACTION_STATE);
  const [closeState, closeAction] = useActionState(closeEventFinanceAction, EMPTY_ACTION_STATE);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [generateFeedback, setGenerateFeedback] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<string | null>(null);

  const generate = (): void => {
    startTransition(async () => {
      const result = await generateChargesAction(eventId);
      setGenerateFeedback(result.message);

      // Ação chamada fora de `<form action>`: sem o refresh, a tabela de
      // cobranças recém-criadas não apareceria até um recarregamento manual.
      if (result.ok) router.refresh();
    });
  };

  const feedback = paymentState.message ?? adjustState.message ?? closeState.message;
  const ok = paymentState.ok || adjustState.ok || closeState.ok;

  return (
    <div className="flex flex-col gap-5">
      {feedback ? <Callout tone={ok ? 'success' : 'danger'}>{feedback}</Callout> : null}
      {generateFeedback ? <Callout tone="success">{generateFeedback}</Callout> : null}

      {lines.length === 0 ? (
        <Panel>
          <PanelHeader
            title="Cobranças ainda não geradas"
            description="Gere as cobranças a partir da lista de atletas confirmados."
          />
          <PanelBody>
            <Button variant="gold" onClick={generate} disabled={pending}>
              {pending ? 'Gerando…' : 'Gerar cobranças'}
            </Button>
          </PanelBody>
        </Panel>
      ) : (
        <Panel>
          <PanelHeader
            title="Cobranças"
            description={`${lines.length} atleta(s)`}
            actions={
              <Button size="sm" variant="secondary" onClick={generate} disabled={pending}>
                Atualizar lista
              </Button>
            }
          />
          <PanelBody flush>
            <TableWrap>
              <THead>
                <TH>Atleta</TH>
                <TH width="7rem" align="right">
                  Devido
                </TH>
                <TH width="7rem" align="right">
                  Pago
                </TH>
                <TH width="7rem" align="center">
                  Situação
                </TH>
                <TH width="16rem" align="right">
                  Ações
                </TH>
              </THead>
              <TBody>
                {lines.map((line) => {
                  const remaining = (line.dueCents - line.paidCents) / 100;
                  const info = STATUS[line.status];

                  return (
                    <TR key={line.athleteId}>
                      <TD>{line.displayName}</TD>
                      <TD align="right" numeric>
                        {line.dueLabel}
                      </TD>
                      <TD align="right" numeric>
                        {line.paidLabel}
                      </TD>
                      <TD align="center">
                        <Badge tone={info?.tone ?? 'neutral'}>{info?.label ?? line.status}</Badge>
                      </TD>
                      <TD align="right">
                        {remaining > 0 ? (
                          <form
                            action={paymentAction}
                            className="flex items-center justify-end gap-1.5"
                          >
                            <input type="hidden" name="eventId" value={eventId} />
                            <input type="hidden" name="athleteId" value={line.athleteId} />
                            <label className="sr-only" htmlFor={`amount-${line.athleteId}`}>
                              Valor recebido de {line.displayName}
                            </label>
                            <input
                              id={`amount-${line.athleteId}`}
                              name="amount"
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={remaining}
                              defaultValue={remaining.toFixed(2)}
                              className="border-cva-border-strong bg-cva-panel h-8 w-20 rounded-md border px-2 text-right text-sm"
                            />
                            <Select
                              hideLabel
                              size="sm"
                              className="w-28"
                              label={`Método do pagamento de ${line.displayName}`}
                              name="method"
                              defaultValue="pix"
                              options={[
                                { value: 'pix', label: 'Pix' },
                                { value: 'dinheiro', label: 'Dinheiro' },
                                { value: 'outro', label: 'Outro' },
                              ]}
                            />
                            <Button type="submit" size="sm" variant="secondary">
                              Receber
                            </Button>
                          </form>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setAdjusting(adjusting === line.athleteId ? null : line.athleteId)
                            }
                          >
                            Ajustar
                          </Button>
                        )}

                        {adjusting === line.athleteId ? (
                          <form
                            action={adjustAction}
                            className="mt-2 flex flex-col items-end gap-1.5"
                          >
                            <input type="hidden" name="eventId" value={eventId} />
                            <input type="hidden" name="athleteId" value={line.athleteId} />
                            <Select
                              hideLabel
                              size="sm"
                              className="w-40"
                              label={`Ajuste da cobrança de ${line.displayName}`}
                              name="status"
                              defaultValue="dispensado"
                              options={[
                                { value: 'dispensado', label: 'Dispensar' },
                                { value: 'estornado', label: 'Estornar' },
                                { value: 'pendente', label: 'Reabrir' },
                              ]}
                            />
                            <input
                              name="reason"
                              required
                              minLength={3}
                              placeholder="Motivo (obrigatório)"
                              aria-label="Motivo do ajuste"
                              className="border-cva-border-strong bg-cva-panel h-8 w-48 rounded-md border px-2 text-sm"
                            />
                            <Button type="submit" size="sm" variant="secondary">
                              Aplicar
                            </Button>
                          </form>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          </PanelBody>
        </Panel>
      )}

      {lines.length > 0 && eventFinancialStatus !== 'fechado' ? (
        <Panel>
          <PanelHeader
            title="Fechar o jogo"
            description="Incorpora ao caixa apenas o que foi efetivamente recebido e pago."
          />
          <PanelBody>
            <form action={closeAction} className="flex flex-col gap-3">
              <input type="hidden" name="eventId" value={eventId} />

              <label className="text-cva-text flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="courtCostPaid"
                  // Já registrado como pago: vem marcado e o texto reflete isso.
                  // Ainda não pago: vem marcado mesmo assim, porque fechar o
                  // jogo normalmente acontece depois de acertar a quadra.
                  defaultChecked
                  className="accent-cva-navy-900 size-4"
                />
                {courtCostPaid
                  ? 'O custo da quadra já está registrado como pago'
                  : 'O custo da quadra já foi pago'}
              </label>

              <div>
                <Button type="submit" variant="gold">
                  Fechar financeiro
                </Button>
              </div>
            </form>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
