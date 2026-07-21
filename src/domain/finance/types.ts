import type { Cents } from '@/domain/shared/money';

/** §13.2 — situação da cobrança de um participante. */
export const PAYMENT_STATUSES = [
  'pendente',
  'pago',
  'parcial',
  'dispensado',
  'estornado',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'outro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** §13.3 — situação financeira de um evento. */
export const EVENT_FINANCIAL_STATUSES = [
  'aberto',
  'parcialmente_recebido',
  'fechado',
] as const;

export type EventFinancialStatus = (typeof EVENT_FINANCIAL_STATUSES)[number];

/** Uma linha de cobrança: o quanto um participante deve e o quanto já pagou. */
export interface ChargeLine {
  participantId: string;
  amountDueCents: Cents;
  amountPaidCents: Cents;
  status: PaymentStatus;
}

/** Despesa vinculada ao evento além do custo da quadra. */
export interface EventExpense {
  description: string;
  amountCents: Cents;
  /** Só despesas efetivamente pagas entram no excedente realizado. */
  paid: boolean;
}

export interface EventSettlementInput {
  valuePerAthleteCents: Cents;
  courtCostCents: Cents;
  /** O custo da quadra já foi efetivamente pago? Afeta o excedente realizado. */
  courtCostPaid: boolean;
  charges: readonly ChargeLine[];
  expenses: readonly EventExpense[];
}

export interface EventSettlement {
  /** Atletas efetivamente cobrados (exclui dispensados e estornados). */
  chargedCount: number;
  expectedRevenueCents: Cents;
  receivedCents: Cents;
  pendingCents: Cents;
  courtCostCents: Cents;
  otherExpensesCents: Cents;
  paidExpensesCents: Cents;
  expectedSurplusCents: Cents;
  realizedSurplusCents: Cents;
  status: EventFinancialStatus;
  /** Participantes com valor em aberto — a lista de cobrança do admin. */
  pendingParticipantIds: readonly string[];
}

/** §13.4 — movimento do caixa. */
export const CASH_TRANSACTION_KINDS = [
  'arrecadacao_evento',
  'despesa_evento',
  'arrecadacao_extra',
  'despesa_extra',
  'ajuste_manual',
] as const;

export type CashTransactionKind = (typeof CASH_TRANSACTION_KINDS)[number];

export interface CashTransaction {
  id: string;
  kind: CashTransactionKind;
  /** Positivo entra no caixa, negativo sai. */
  amountCents: Cents;
  /**
   * Somente movimentos **liquidados** entram no saldo. Receita esperada nunca
   * conta como dinheiro disponível (§13.4).
   */
  settled: boolean;
  occurredAt: Date;
  reason: string | null;
}
