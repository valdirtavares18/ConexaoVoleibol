import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Badge,
  Callout,
  Metric,
  MetricRow,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { formatCents } from '@/domain/shared/money';
import { getActor } from '@/server/context';
import { getCashSummary, listEventsWithFinance } from '@/server/services/finance';
import { formatEventDate } from '@/server/services/sharing';
import { CashAdjustmentForm } from './cash-adjustment-form';

export const metadata: Metadata = { title: 'Financeiro' };

const KIND_LABELS: Record<string, string> = {
  arrecadacao_evento: 'Arrecadação de encontro',
  despesa_evento: 'Despesa de encontro',
  arrecadacao_extra: 'Arrecadação extraordinária',
  despesa_extra: 'Despesa extraordinária',
  ajuste_manual: 'Ajuste manual',
};

const FINANCIAL_STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  aberto: { label: 'Aberto', tone: 'neutral' },
  parcialmente_recebido: { label: 'Parcial', tone: 'warning' },
  fechado: { label: 'Fechado', tone: 'success' },
};

/**
 * Caixa do grupo (§13.4).
 *
 * Todo o carregamento passa por `getCashSummary` / `listEventsWithFinance`, que
 * exigem `requireFinanceAccess`. Um atleta que chegasse a esta URL já teria
 * parado no layout administrativo — mas o serviço recusa de novo, de propósito.
 */
export default async function FinanceiroPage() {
  const actor = await getActor();

  const [cash, events] = await Promise.all([
    getCashSummary(db, { actor, limit: 20 }),
    listEventsWithFinance(db, { actor, limit: 20 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financeiro"
        description="Caixa do grupo, cobranças e fechamentos. Visível apenas para administradores."
      />

      <Panel>
        <MetricRow>
          <Metric
            label="Saldo em caixa"
            value={formatCents(cash.balanceCents)}
            hint="Somente valores efetivamente movimentados"
            tone={cash.balanceCents < 0 ? 'negative' : 'positive'}
          />
          <Metric
            label="A receber"
            value={formatCents(cash.pendingCents)}
            hint="Não entra no saldo"
            tone={cash.pendingCents > 0 ? 'negative' : 'neutral'}
          />
          <Metric label="Encontros listados" value={events.length} />
          <Metric label="Movimentos recentes" value={cash.recentTransactions.length} />
        </MetricRow>
      </Panel>

      {cash.pendingCents > 0 ? (
        <Callout tone="warning" title="Há valores em aberto">
          {formatCents(cash.pendingCents)} ainda não foram recebidos. Receita esperada nunca conta
          como dinheiro disponível.
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader title="Encontros" description="Situação financeira de cada um." />
        <PanelBody flush>
          <TableWrap>
            <THead>
              <TH width="7rem">Data</TH>
              <TH>Encontro</TH>
              <TH width="8rem" align="right">
                Esperado
              </TH>
              <TH width="8rem" align="right">
                Recebido
              </TH>
              <TH width="7rem" align="right">
                Situação
              </TH>
            </THead>
            <TBody>
              {events.map((event) => {
                const status = FINANCIAL_STATUS[event.financialStatus];

                return (
                  <TR key={event.id}>
                    <TD numeric className="text-cva-text-muted whitespace-nowrap">
                      {formatEventDate(event.eventDate).split(', ')[1]}
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/financeiro/eventos/${event.id}`}
                        className="text-cva-navy-900 font-medium hover:underline"
                      >
                        {event.title}
                      </Link>
                    </TD>
                    <TD align="right" numeric>
                      {formatCents(event.expectedCents)}
                    </TD>
                    <TD align="right" numeric>
                      {formatCents(event.receivedCents)}
                    </TD>
                    <TD align="right">
                      <Badge tone={status?.tone ?? 'neutral'}>
                        {status?.label ?? event.financialStatus}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        </PanelBody>
      </Panel>

      <CashAdjustmentForm />

      <Panel>
        <PanelHeader title="Movimentações recentes" />
        <PanelBody flush>
          <TableWrap>
            <THead>
              <TH width="7rem">Data</TH>
              <TH>Descrição</TH>
              <TH width="9rem" align="right">
                Valor
              </TH>
              <TH width="7rem" align="right">
                Situação
              </TH>
            </THead>
            <TBody>
              {cash.recentTransactions.map((transaction) => (
                <TR key={transaction.id}>
                  <TD numeric className="text-cva-text-muted whitespace-nowrap">
                    {transaction.occurredAt.toLocaleDateString('pt-BR')}
                  </TD>
                  <TD>
                    <span className="text-cva-text">{transaction.description}</span>
                    <span className="text-cva-text-muted block text-xs">
                      {KIND_LABELS[transaction.kind] ?? transaction.kind}
                      {transaction.reason ? ` · ${transaction.reason}` : ''}
                    </span>
                  </TD>
                  <TD
                    align="right"
                    numeric
                    className={
                      transaction.amountCents < 0 ? 'text-cva-danger' : 'text-cva-success'
                    }
                  >
                    {formatCents(transaction.amountCents)}
                  </TD>
                  <TD align="right">
                    <Badge tone={transaction.settled ? 'success' : 'neutral'}>
                      {transaction.settled ? 'Liquidado' : 'Previsto'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </PanelBody>
      </Panel>
    </div>
  );
}
