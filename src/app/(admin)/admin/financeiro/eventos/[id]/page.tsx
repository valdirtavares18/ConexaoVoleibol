import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Callout,
  Metric,
  MetricRow,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { formatCents } from '@/domain/shared/money';
import { NotFoundError, isDomainError } from '@/domain/shared/errors';
import { getActor } from '@/server/context';
import { getEventFinance } from '@/server/services/finance';
import { formatEventDate } from '@/server/services/sharing';
import { EventFinanceManager } from './event-finance-manager';

export const metadata: Metadata = { title: 'Financeiro do encontro' };

export default async function FinanceiroEventoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();

  let finance;
  try {
    finance = await getEventFinance(db, { actor, eventId: id });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (isDomainError(error)) throw error;
    throw error;
  }

  const { settlement } = finance;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/admin/financeiro" className="hover:underline">
            ← Financeiro
          </Link>
        }
        title={finance.title}
        description={`${formatEventDate(finance.eventDate)} · ${formatCents(finance.valuePerAthleteCents)} por atleta · quadra ${formatCents(finance.courtCostCents)}`}
      />

      <Panel>
        <MetricRow>
          <Metric
            label="Arrecadação esperada"
            value={formatCents(settlement.expectedRevenueCents)}
            hint={`${settlement.chargedCount} atletas cobrados`}
          />
          <Metric
            label="Recebido"
            value={formatCents(settlement.receivedCents)}
            tone="positive"
          />
          <Metric
            label="Pendente"
            value={formatCents(settlement.pendingCents)}
            tone={settlement.pendingCents > 0 ? 'negative' : 'neutral'}
            hint={
              settlement.pendingParticipantIds.length > 0
                ? `${settlement.pendingParticipantIds.length} atleta(s)`
                : 'tudo em dia'
            }
          />
          <Metric
            label="Excedente esperado"
            value={formatCents(settlement.expectedSurplusCents)}
            tone={settlement.expectedSurplusCents < 0 ? 'negative' : 'positive'}
            hint="esperado − quadra − despesas"
          />
        </MetricRow>
      </Panel>

      <Panel>
        <PanelBody className="text-cva-text-muted flex flex-col gap-1 text-sm">
          <p>
            <strong className="text-cva-navy-900">Excedente realizado:</strong>{' '}
            {formatCents(settlement.realizedSurplusCents)} — recebido de fato menos despesas já
            pagas. É esse valor que vai para o caixa.
          </p>
          <p>
            Despesas pagas: {formatCents(settlement.paidExpensesCents)} · outras despesas
            registradas: {formatCents(settlement.otherExpensesCents)}
          </p>
        </PanelBody>
      </Panel>

      {finance.eventFinancialStatus === 'fechado' ? (
        <Callout tone="success" title="Financeiro fechado">
          Este encontro já foi conciliado e incorporado ao caixa.
        </Callout>
      ) : settlement.pendingCents === 0 && settlement.receivedCents > 0 ? (
        <Callout tone="info" title="Tudo recebido">
          Falta apenas fechar o encontro para incorporar o resultado ao caixa.
        </Callout>
      ) : null}

      <EventFinanceManager
        eventId={id}
        lines={finance.lines.map((line) => ({
          athleteId: line.athleteId,
          displayName: line.displayName,
          dueCents: line.amountDueCents,
          paidCents: line.amountPaidCents,
          status: line.status,
          dueLabel: formatCents(line.amountDueCents),
          paidLabel: formatCents(line.amountPaidCents),
        }))}
        eventFinancialStatus={finance.eventFinancialStatus}
        courtCostPaid={finance.courtCostPaid}
      />

      <Panel>
        <PanelHeader title="Como o caixa é calculado" />
        <PanelBody>
          <p className="text-cva-text-muted text-sm">
            A arrecadação esperada é{' '}
            <strong className="text-cva-navy-900">
              {settlement.chargedCount} × {formatCents(finance.valuePerAthleteCents)} ={' '}
              {formatCents(settlement.expectedRevenueCents)}
            </strong>
            . O excedente esperado desconta o custo da quadra. Já o saldo do caixa considera
            apenas o que entrou e saiu de fato — valores pendentes continuam pendentes e nunca
            aparecem como dinheiro disponível.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
