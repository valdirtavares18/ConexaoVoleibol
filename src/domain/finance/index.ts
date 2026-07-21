import { ConflictError, DomainError } from '@/domain/shared/errors';
import {
  addCents,
  cents,
  multiplyCents,
  splitCents,
  subtractCents,
  ZERO_CENTS,
  type Cents,
} from '@/domain/shared/money';
import type {
  CashTransaction,
  ChargeLine,
  EventFinancialStatus,
  EventSettlement,
  EventSettlementInput,
} from './types';

export * from './types';

/**
 * Fechamento financeiro de um evento (§13.1 e §13.3).
 *
 * Todos os valores são centavos inteiros. Nenhuma operação usa ponto flutuante.
 */
export function settleEvent(input: EventSettlementInput): EventSettlement {
  const billable = input.charges.filter(
    (charge) => charge.status !== 'dispensado' && charge.status !== 'estornado',
  );

  const expectedRevenueCents = addCents(...billable.map((c) => c.amountDueCents));

  // Estornado devolveu o dinheiro: não conta como recebido.
  const receivedCents = addCents(
    ...input.charges
      .filter((charge) => charge.status !== 'estornado' && charge.status !== 'dispensado')
      .map((charge) => charge.amountPaidCents),
  );

  const pendingLines = billable.filter(
    (charge) => charge.amountDueCents > charge.amountPaidCents,
  );

  const pendingCents = addCents(
    ...pendingLines.map((charge) => subtractCents(charge.amountDueCents, charge.amountPaidCents)),
  );

  const otherExpensesCents = addCents(...input.expenses.map((e) => e.amountCents));
  const paidOtherExpenses = addCents(
    ...input.expenses.filter((e) => e.paid).map((e) => e.amountCents),
  );
  const paidExpensesCents = addCents(
    paidOtherExpenses,
    input.courtCostPaid ? input.courtCostCents : ZERO_CENTS,
  );

  const expectedSurplusCents = subtractCents(
    subtractCents(expectedRevenueCents, input.courtCostCents),
    otherExpensesCents,
  );

  const realizedSurplusCents = subtractCents(receivedCents, paidExpensesCents);

  return {
    chargedCount: billable.length,
    expectedRevenueCents,
    receivedCents,
    pendingCents,
    courtCostCents: input.courtCostCents,
    otherExpensesCents,
    paidExpensesCents,
    expectedSurplusCents,
    realizedSurplusCents,
    status: deriveStatus(receivedCents, pendingCents, expectedRevenueCents),
    pendingParticipantIds: pendingLines.map((c) => c.participantId),
  };
}

function deriveStatus(
  received: Cents,
  pending: Cents,
  expected: Cents,
): EventFinancialStatus {
  if (expected === 0) return received === 0 ? 'aberto' : 'fechado';
  if (pending === 0) return 'fechado';
  if (received === 0) return 'aberto';
  return 'parcialmente_recebido';
}

/** Receita esperada de um encontro normal: `atletas × valor por atleta` (§13.1). */
export function expectedRevenueFor(chargedCount: number, valuePerAthlete: Cents): Cents {
  if (!Number.isInteger(chargedCount) || chargedCount < 0) {
    throw new DomainError('ENTRADA_INVALIDA', 'Quantidade de atletas cobrados inválida.');
  }
  return multiplyCents(valuePerAthlete, chargedCount);
}

/** Excedente esperado: receita esperada menos o custo da quadra (§13.1). */
export function expectedSurplusFor(expectedRevenue: Cents, courtCost: Cents): Cents {
  return subtractCents(expectedRevenue, courtCost);
}

/** Cria as linhas de cobrança de um encontro, todas pendentes. */
export function buildCharges(
  participantIds: readonly string[],
  valuePerAthlete: Cents,
): ChargeLine[] {
  return participantIds.map((participantId) => ({
    participantId,
    amountDueCents: valuePerAthlete,
    amountPaidCents: ZERO_CENTS,
    status: 'pendente' as const,
  }));
}

/**
 * Aplica um pagamento a uma linha, derivando o status.
 * Nunca aceita valor negativo nem pagamento acima do devido sem intenção
 * explícita — um valor a maior seria erro de digitação, não crédito.
 */
export function applyPayment(line: ChargeLine, amountCents: Cents): ChargeLine {
  if (amountCents < 0) {
    throw new DomainError('ENTRADA_INVALIDA', 'O valor recebido não pode ser negativo.');
  }
  if (line.status === 'estornado' || line.status === 'dispensado') {
    throw new ConflictError(
      'Esta cobrança foi dispensada ou estornada. Reabra-a antes de registrar um pagamento.',
      { participantId: line.participantId, status: line.status },
    );
  }

  const total = addCents(line.amountPaidCents, amountCents);
  if (total > line.amountDueCents) {
    throw new ConflictError(
      'O valor recebido ultrapassa o valor devido por este atleta.',
      {
        participantId: line.participantId,
        dueCents: line.amountDueCents,
        attemptedCents: total,
      },
    );
  }

  return {
    ...line,
    amountPaidCents: total,
    status: total === line.amountDueCents ? 'pago' : total > 0 ? 'parcial' : 'pendente',
  };
}

/**
 * Saldo do caixa (§13.4): **somente** movimentos liquidados.
 * Receita esperada nunca vira dinheiro disponível.
 */
export function cashBalance(transactions: readonly CashTransaction[]): Cents {
  return addCents(
    ...transactions.filter((t) => t.settled).map((t) => t.amountCents),
  );
}

/** Ajuste manual de caixa: exige motivo, sempre (§13.4). */
export function buildManualAdjustment(params: {
  id: string;
  amountCents: Cents;
  reason: string;
  occurredAt: Date;
}): CashTransaction {
  if (params.reason.trim().length < 3) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Um ajuste manual de caixa exige um motivo descrito.',
    );
  }
  if (params.amountCents === 0) {
    throw new DomainError('ENTRADA_INVALIDA', 'O ajuste precisa ter um valor diferente de zero.');
  }

  return {
    id: params.id,
    kind: 'ajuste_manual',
    amountCents: params.amountCents,
    settled: true,
    occurredAt: params.occurredAt,
    reason: params.reason.trim(),
  };
}

// ---------------------------------------------------------------------------
// Eventos extraordinários (§13.5)
// ---------------------------------------------------------------------------

export type ExtraChargeMode =
  | { kind: 'por_pessoa'; valuePerPersonCents: Cents }
  | { kind: 'total_rateado'; totalCents: Cents };

/**
 * Rateio de uma confraternização. No modo rateado, os centavos de resto são
 * distribuídos entre os primeiros participantes para que a soma feche exata.
 */
export function buildExtraCharges(
  participantIds: readonly string[],
  mode: ExtraChargeMode,
): ChargeLine[] {
  if (participantIds.length === 0) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Informe ao menos um participante para dividir o valor.',
    );
  }

  const amounts =
    mode.kind === 'por_pessoa'
      ? participantIds.map(() => mode.valuePerPersonCents)
      : splitCents(mode.totalCents, participantIds.length);

  return participantIds.map((participantId, i) => ({
    participantId,
    amountDueCents: amounts[i] ?? cents(0),
    amountPaidCents: ZERO_CENTS,
    status: 'pendente' as const,
  }));
}
