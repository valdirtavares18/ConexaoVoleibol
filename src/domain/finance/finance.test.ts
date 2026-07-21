import { describe, expect, it } from 'vitest';
import { ConflictError, DomainError } from '@/domain/shared/errors';
import {
  addCents,
  cents,
  formatCents,
  reaisToCents,
  splitCents,
  ZERO_CENTS,
} from '@/domain/shared/money';
import {
  applyPayment,
  buildCharges,
  buildExtraCharges,
  buildManualAdjustment,
  cashBalance,
  expectedRevenueFor,
  expectedSurplusFor,
  settleEvent,
  type CashTransaction,
  type ChargeLine,
} from './index';

const PER_ATHLETE = reaisToCents(10);
const COURT_150 = reaisToCents(150);
const COURT_160 = reaisToCents(160);

const participants = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `atleta-${i + 1}`);

const payAll = (lines: ChargeLine[], howMany: number): ChargeLine[] =>
  lines.map((line, i) => (i < howMany ? applyPayment(line, line.amountDueCents) : line));

describe('financeiro — valores obrigatórios da especificação (§23.7)', () => {
  it('18 atletas × R$ 10,00 = R$ 180,00', () => {
    const expected = expectedRevenueFor(18, PER_ATHLETE);
    expect(expected).toBe(reaisToCents(180));
    expect(formatCents(expected)).toBe('R$ 180,00');
  });

  it('quadra de R$ 150,00 gera excedente esperado de R$ 30,00', () => {
    const surplus = expectedSurplusFor(expectedRevenueFor(18, PER_ATHLETE), COURT_150);
    expect(surplus).toBe(reaisToCents(30));
  });

  it('quadra de R$ 160,00 gera excedente esperado de R$ 20,00', () => {
    const surplus = expectedSurplusFor(expectedRevenueFor(18, PER_ATHLETE), COURT_160);
    expect(surplus).toBe(reaisToCents(20));
  });

  it('17 pagamentos recebidos geram R$ 170,00 recebidos e R$ 10,00 pendentes', () => {
    const charges = payAll(buildCharges(participants(18), PER_ATHLETE), 17);
    const settlement = settleEvent({
      valuePerAthleteCents: PER_ATHLETE,
      courtCostCents: COURT_150,
      courtCostPaid: false,
      charges,
      expenses: [],
    });

    expect(settlement.receivedCents).toBe(reaisToCents(170));
    expect(settlement.pendingCents).toBe(reaisToCents(10));
    expect(settlement.pendingParticipantIds).toEqual(['atleta-18']);
    expect(settlement.status).toBe('parcialmente_recebido');
  });
});

describe('financeiro — fechamento do evento (§13.3)', () => {
  it('fecha o evento quando todos pagaram', () => {
    const charges = payAll(buildCharges(participants(18), PER_ATHLETE), 18);
    const settlement = settleEvent({
      valuePerAthleteCents: PER_ATHLETE,
      courtCostCents: COURT_150,
      courtCostPaid: true,
      charges,
      expenses: [],
    });

    expect(settlement.status).toBe('fechado');
    expect(settlement.pendingCents).toBe(ZERO_CENTS);
    expect(settlement.expectedSurplusCents).toBe(reaisToCents(30));
    expect(settlement.realizedSurplusCents).toBe(reaisToCents(30));
  });

  it('o excedente realizado usa despesas efetivamente pagas', () => {
    const charges = payAll(buildCharges(participants(18), PER_ATHLETE), 18);
    const settlement = settleEvent({
      valuePerAthleteCents: PER_ATHLETE,
      courtCostCents: COURT_150,
      // Quadra ainda não paga: o dinheiro recebido está inteiro no caixa.
      courtCostPaid: false,
      charges,
      expenses: [],
    });

    expect(settlement.realizedSurplusCents).toBe(reaisToCents(180));
    expect(settlement.expectedSurplusCents).toBe(reaisToCents(30));
  });

  it('desconta despesas extras do evento', () => {
    const charges = payAll(buildCharges(participants(18), PER_ATHLETE), 18);
    const settlement = settleEvent({
      valuePerAthleteCents: PER_ATHLETE,
      courtCostCents: COURT_150,
      courtCostPaid: true,
      charges,
      expenses: [{ description: 'Bolas novas', amountCents: reaisToCents(25), paid: true }],
    });

    expect(settlement.expectedSurplusCents).toBe(reaisToCents(5));
    expect(settlement.realizedSurplusCents).toBe(reaisToCents(5));
  });

  it('não cobra atleta dispensado por ajuste administrativo', () => {
    const charges = buildCharges(participants(18), PER_ATHLETE).map((line, i) =>
      i === 0 ? { ...line, status: 'dispensado' as const } : line,
    );

    const settlement = settleEvent({
      valuePerAthleteCents: PER_ATHLETE,
      courtCostCents: COURT_150,
      courtCostPaid: false,
      charges,
      expenses: [],
    });

    expect(settlement.chargedCount).toBe(17);
    expect(settlement.expectedRevenueCents).toBe(reaisToCents(170));
  });

  it('estorno não conta como valor recebido', () => {
    const charges = buildCharges(participants(18), PER_ATHLETE).map((line, i) =>
      i === 0
        ? { ...line, amountPaidCents: PER_ATHLETE, status: 'estornado' as const }
        : line,
    );

    const settlement = settleEvent({
      valuePerAthleteCents: PER_ATHLETE,
      courtCostCents: COURT_150,
      courtCostPaid: false,
      charges,
      expenses: [],
    });

    expect(settlement.receivedCents).toBe(ZERO_CENTS);
    expect(settlement.chargedCount).toBe(17);
  });
});

describe('financeiro — pagamentos individuais (§13.2)', () => {
  it('marca como parcial quando recebe menos que o devido', () => {
    const [line] = buildCharges(['atleta-1'], PER_ATHLETE);
    const updated = applyPayment(line as ChargeLine, reaisToCents(6));

    expect(updated.status).toBe('parcial');
    expect(updated.amountPaidCents).toBe(reaisToCents(6));
  });

  it('marca como pago ao completar o valor devido em duas parcelas', () => {
    const [line] = buildCharges(['atleta-1'], PER_ATHLETE);
    const partial = applyPayment(line as ChargeLine, reaisToCents(6));
    const complete = applyPayment(partial, reaisToCents(4));

    expect(complete.status).toBe('pago');
    expect(complete.amountPaidCents).toBe(PER_ATHLETE);
  });

  it('recusa pagamento acima do valor devido', () => {
    const [line] = buildCharges(['atleta-1'], PER_ATHLETE);
    expect(() => applyPayment(line as ChargeLine, reaisToCents(11))).toThrow(ConflictError);
  });

  it('recusa pagamento negativo', () => {
    const [line] = buildCharges(['atleta-1'], PER_ATHLETE);
    expect(() => applyPayment(line as ChargeLine, cents(-100))).toThrow(DomainError);
  });

  it('recusa pagamento em cobrança dispensada', () => {
    const [line] = buildCharges(['atleta-1'], PER_ATHLETE);
    const dispensed = { ...(line as ChargeLine), status: 'dispensado' as const };
    expect(() => applyPayment(dispensed, PER_ATHLETE)).toThrow(ConflictError);
  });
});

describe('financeiro — caixa (§13.4)', () => {
  const tx = (
    id: string,
    amount: number,
    settled: boolean,
  ): CashTransaction => ({
    id,
    kind: 'arrecadacao_evento',
    amountCents: reaisToCents(amount),
    settled,
    occurredAt: new Date('2026-07-01T00:00:00Z'),
    reason: null,
  });

  it('o saldo usa apenas valores efetivamente recebidos, não os esperados', () => {
    const balance = cashBalance([
      tx('a', 180, true),
      tx('b', 200, false), // ainda não liquidado
      { ...tx('c', -150, true), kind: 'despesa_evento' },
    ]);

    expect(balance).toBe(reaisToCents(30));
  });

  it('ajuste manual exige motivo', () => {
    expect(() =>
      buildManualAdjustment({
        id: 'aj-1',
        amountCents: reaisToCents(50),
        reason: '',
        occurredAt: new Date(),
      }),
    ).toThrow(DomainError);
  });

  it('ajuste manual com motivo entra liquidado no caixa', () => {
    const adjustment = buildManualAdjustment({
      id: 'aj-1',
      amountCents: reaisToCents(50),
      reason: 'Sobra de caixa do churrasco de junho',
      occurredAt: new Date('2026-06-30T00:00:00Z'),
    });

    expect(adjustment.settled).toBe(true);
    expect(cashBalance([adjustment])).toBe(reaisToCents(50));
  });

  it('recusa ajuste de valor zero', () => {
    expect(() =>
      buildManualAdjustment({
        id: 'aj-1',
        amountCents: ZERO_CENTS,
        reason: 'motivo qualquer',
        occurredAt: new Date(),
      }),
    ).toThrow(DomainError);
  });
});

describe('financeiro — evento extraordinário (§13.5)', () => {
  it('cobra valor fixo por pessoa', () => {
    const charges = buildExtraCharges(participants(12), {
      kind: 'por_pessoa',
      valuePerPersonCents: reaisToCents(35),
    });

    expect(charges).toHaveLength(12);
    expect(addCents(...charges.map((c) => c.amountDueCents))).toBe(reaisToCents(420));
  });

  it('rateia o total sem perder centavos', () => {
    const charges = buildExtraCharges(participants(7), {
      kind: 'total_rateado',
      totalCents: reaisToCents(100),
    });

    // R$ 100,00 / 7 = R$ 14,2857… — a soma precisa fechar exatamente.
    expect(addCents(...charges.map((c) => c.amountDueCents))).toBe(reaisToCents(100));
    expect(charges[0]?.amountDueCents).toBe(cents(1429));
    expect(charges[6]?.amountDueCents).toBe(cents(1428));
  });

  it('recusa rateio sem participantes', () => {
    expect(() =>
      buildExtraCharges([], { kind: 'total_rateado', totalCents: reaisToCents(100) }),
    ).toThrow(DomainError);
  });
});

describe('dinheiro — primitivas', () => {
  it('nunca usa ponto flutuante: 0,1 + 0,2 fecha exato em centavos', () => {
    expect(addCents(reaisToCents(0.1), reaisToCents(0.2))).toBe(reaisToCents(0.3));
    // A mesma conta em ponto flutuante falharia.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('rejeita valores não inteiros em centavos', () => {
    expect(() => cents(10.5)).toThrow(RangeError);
  });

  it('divide preservando o total', () => {
    const parts = splitCents(cents(1000), 3);
    expect(parts).toEqual([cents(334), cents(333), cents(333)]);
    expect(addCents(...parts)).toBe(cents(1000));
  });

  it('formata em real brasileiro', () => {
    expect(formatCents(reaisToCents(1234.5))).toBe('R$ 1.234,50');
  });
});
