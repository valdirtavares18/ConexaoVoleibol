import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  athletes,
  cashTransactions,
  eventCharges,
  eventExpenses,
  eventParticipants,
  eventPayments,
  events,
  extraEventCharges,
  extraEventExpenses,
  extraFinancialEvents,
} from '@/db/schema';
import { ConflictError, DomainError, NotFoundError } from '@/domain/shared/errors';
import {
  addCents,
  cents,
  formatCents,
  subtractCents,
  ZERO_CENTS,
  type Cents,
} from '@/domain/shared/money';
import {
  applyPayment,
  buildExtraCharges,
  settleEvent,
  type ChargeLine,
  type EventSettlement,
  type PaymentMethod,
} from '@/domain/finance';
import { requireFinanceAccess, type Actor } from '@/server/policies';
import { recordAudit } from './audit';

/**
 * Financeiro (§13) ligado ao banco.
 *
 * **Toda** função exportada daqui chama `requireFinanceAccess` como primeira
 * instrução. Não existe função de leitura "sem ator" neste módulo — é o que
 * garante que nenhuma rota consiga expor dado financeiro por descuido.
 *
 * Os cálculos vivem em `src/domain/finance`; aqui só há carga e persistência.
 */

export interface EventFinanceView {
  eventId: string;
  title: string;
  eventDate: string;
  valuePerAthleteCents: Cents;
  courtCostCents: Cents;
  settlement: EventSettlement;
  lines: {
    athleteId: string;
    displayName: string;
    amountDueCents: Cents;
    amountPaidCents: Cents;
    status: ChargeLine['status'];
  }[];
  expenses: { id: string; description: string; amountCents: Cents; paid: boolean }[];
}

/** Cria as cobranças de um encontro a partir dos atletas confirmados. */
export async function generateEventCharges(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<{ created: number }> {
  const actor = requireFinanceAccess(params.actor);

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, params.eventId))
      .for('update')
      .limit(1);

    if (!event) throw new NotFoundError('Encontro não encontrado.');
    if (event.financialStatus === 'fechado') {
      throw new ConflictError('O financeiro deste encontro já foi fechado.');
    }

    const participants = await tx
      .select({ athleteId: eventParticipants.athleteId })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, params.eventId),
          inArray(eventParticipants.status, [
            'confirmado',
            'presente',
            'chegou_atrasado',
            'saiu_antecipadamente',
          ]),
        ),
      );

    if (participants.length === 0) return { created: 0 };

    // `onConflictDoNothing` mantém a operação idempotente: reexecutar não
    // duplica cobrança nem zera o que já foi pago.
    const inserted = await tx
      .insert(eventCharges)
      .values(
        participants.map((p) => ({
          eventId: params.eventId,
          athleteId: p.athleteId,
          amountDueCents: event.valuePerAthleteCents,
        })),
      )
      .onConflictDoNothing({ target: [eventCharges.eventId, eventCharges.athleteId] })
      .returning({ id: eventCharges.id });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'financeiro.gerar_cobrancas',
      entityType: 'event',
      entityId: params.eventId,
      after: { created: inserted.length },
    });

    return { created: inserted.length };
  });
}

/** Registra um recebimento. O status da cobrança é derivado, nunca informado. */
export async function registerPayment(
  db: Database,
  params: {
    actor: Actor | null;
    eventId: string;
    athleteId: string;
    amountCents: Cents;
    method: PaymentMethod;
    note?: string | null;
  },
): Promise<void> {
  const actor = requireFinanceAccess(params.actor);

  await db.transaction(async (tx) => {
    const [charge] = await tx
      .select()
      .from(eventCharges)
      .where(
        and(eq(eventCharges.eventId, params.eventId), eq(eventCharges.athleteId, params.athleteId)),
      )
      .for('update')
      .limit(1);

    if (!charge) throw new NotFoundError('Cobrança não encontrada para este atleta.');

    const line: ChargeLine = {
      participantId: params.athleteId,
      amountDueCents: cents(charge.amountDueCents),
      amountPaidCents: cents(charge.amountPaidCents),
      status: charge.status,
    };

    // A regra de negócio (parcial, pago, recusa de valor acima do devido) vive
    // no domínio; aqui só aplicamos o resultado.
    const updated = applyPayment(line, params.amountCents);

    await tx
      .update(eventCharges)
      .set({
        amountPaidCents: updated.amountPaidCents,
        status: updated.status,
        updatedAt: new Date(),
      })
      .where(eq(eventCharges.id, charge.id));

    await tx.insert(eventPayments).values({
      chargeId: charge.id,
      amountCents: params.amountCents,
      method: params.method,
      note: params.note ?? null,
      recordedByUserId: actor.userId,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'financeiro.registrar_pagamento',
      entityType: 'event_charge',
      entityId: charge.id,
      before: { amountPaidCents: charge.amountPaidCents, status: charge.status },
      after: { amountPaidCents: updated.amountPaidCents, status: updated.status },
    });
  });
}

/** Dispensa ou estorna uma cobrança. Exige motivo — o CHECK do banco também. */
export async function adjustCharge(
  db: Database,
  params: {
    actor: Actor | null;
    eventId: string;
    athleteId: string;
    status: 'dispensado' | 'estornado' | 'pendente';
    reason: string;
  },
): Promise<void> {
  const actor = requireFinanceAccess(params.actor);

  if (params.status !== 'pendente' && params.reason.trim().length < 3) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Dispensar ou estornar uma cobrança exige um motivo registrado.',
    );
  }

  await db.transaction(async (tx) => {
    const [charge] = await tx
      .select()
      .from(eventCharges)
      .where(
        and(eq(eventCharges.eventId, params.eventId), eq(eventCharges.athleteId, params.athleteId)),
      )
      .limit(1);

    if (!charge) throw new NotFoundError('Cobrança não encontrada.');

    await tx
      .update(eventCharges)
      .set({
        status: params.status,
        adjustmentReason: params.status === 'pendente' ? null : params.reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(eventCharges.id, charge.id));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: `financeiro.${params.status}`,
      entityType: 'event_charge',
      entityId: charge.id,
      before: { status: charge.status },
      after: { status: params.status },
      reason: params.reason.trim(),
    });
  });
}

export async function getEventFinance(
  db: Database,
  params: { actor: Actor | null; eventId: string },
): Promise<EventFinanceView> {
  requireFinanceAccess(params.actor);

  const [event] = await db.select().from(events).where(eq(events.id, params.eventId)).limit(1);
  if (!event) throw new NotFoundError('Encontro não encontrado.');

  const chargeRows = await db
    .select({
      athleteId: eventCharges.athleteId,
      amountDueCents: eventCharges.amountDueCents,
      amountPaidCents: eventCharges.amountPaidCents,
      status: eventCharges.status,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
    })
    .from(eventCharges)
    .innerJoin(athletes, eq(athletes.id, eventCharges.athleteId))
    .where(eq(eventCharges.eventId, params.eventId))
    .orderBy(athletes.fullName);

  const expenseRows = await db
    .select()
    .from(eventExpenses)
    .where(eq(eventExpenses.eventId, params.eventId));

  const settlement = settleEvent({
    valuePerAthleteCents: cents(event.valuePerAthleteCents),
    courtCostCents: cents(event.courtCostCents),
    courtCostPaid: event.courtCostPaid !== null,
    charges: chargeRows.map((row) => ({
      participantId: row.athleteId,
      amountDueCents: cents(row.amountDueCents),
      amountPaidCents: cents(row.amountPaidCents),
      status: row.status,
    })),
    expenses: expenseRows.map((row) => ({
      description: row.description,
      amountCents: cents(row.amountCents),
      paid: row.paidAt !== null,
    })),
  });

  return {
    eventId: event.id,
    title: event.title,
    eventDate: event.eventDate,
    valuePerAthleteCents: cents(event.valuePerAthleteCents),
    courtCostCents: cents(event.courtCostCents),
    settlement,
    lines: chargeRows.map((row) => ({
      athleteId: row.athleteId,
      displayName: row.nickname ?? row.fullName,
      amountDueCents: cents(row.amountDueCents),
      amountPaidCents: cents(row.amountPaidCents),
      status: row.status,
    })),
    expenses: expenseRows.map((row) => ({
      id: row.id,
      description: row.description,
      amountCents: cents(row.amountCents),
      paid: row.paidAt !== null,
    })),
  };
}

/**
 * Fecha o financeiro do encontro e incorpora o resultado ao caixa (§13.3).
 *
 * Só entram no caixa valores **efetivamente movimentados**: o recebido e as
 * despesas pagas. Pendências continuam pendências.
 */
export async function closeEventFinance(
  db: Database,
  params: { actor: Actor | null; eventId: string; courtCostPaid: boolean },
): Promise<EventSettlement> {
  const actor = requireFinanceAccess(params.actor);

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, params.eventId))
      .for('update')
      .limit(1);

    if (!event) throw new NotFoundError('Encontro não encontrado.');
    if (event.financialStatus === 'fechado') {
      throw new ConflictError('O financeiro deste encontro já está fechado.');
    }

    if (params.courtCostPaid && event.courtCostPaid === null) {
      await tx
        .update(events)
        .set({ courtCostPaid: new Date() })
        .where(eq(events.id, params.eventId));
    }

    const view = await getEventFinance(tx as unknown as Database, {
      actor,
      eventId: params.eventId,
    });

    const settlement = view.settlement;

    // Evita lançar duas vezes se o fechamento for repetido após reabertura.
    await tx
      .delete(cashTransactions)
      .where(
        and(
          eq(cashTransactions.eventId, params.eventId),
          inArray(cashTransactions.kind, ['arrecadacao_evento', 'despesa_evento']),
        ),
      );

    const now = new Date();
    const rows = [];

    if (settlement.receivedCents > 0) {
      rows.push({
        kind: 'arrecadacao_evento' as const,
        amountCents: settlement.receivedCents,
        settledAt: now,
        occurredAt: now,
        description: `Arrecadação — ${event.title}`,
        eventId: params.eventId,
        recordedByUserId: actor.userId,
      });
    }

    if (settlement.paidExpensesCents > 0) {
      rows.push({
        kind: 'despesa_evento' as const,
        amountCents: -settlement.paidExpensesCents,
        settledAt: now,
        occurredAt: now,
        description: `Despesas — ${event.title}`,
        eventId: params.eventId,
        recordedByUserId: actor.userId,
      });
    }

    if (rows.length > 0) await tx.insert(cashTransactions).values(rows);

    await tx
      .update(events)
      .set({
        financialStatus: settlement.pendingCents === 0 ? 'fechado' : 'parcialmente_recebido',
        financialClosedAt: settlement.pendingCents === 0 ? now : null,
        financialClosedByUserId: actor.userId,
      })
      .where(eq(events.id, params.eventId));

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'financeiro.fechar_evento',
      entityType: 'event',
      entityId: params.eventId,
      after: {
        recebido: formatCents(settlement.receivedCents),
        pendente: formatCents(settlement.pendingCents),
        excedenteRealizado: formatCents(settlement.realizedSurplusCents),
      },
    });

    return settlement;
  });
}

export interface CashSummary {
  balanceCents: Cents;
  /** Total ainda a receber. Nunca entra no saldo. */
  pendingCents: Cents;
  recentTransactions: {
    id: string;
    kind: string;
    amountCents: Cents;
    description: string;
    occurredAt: Date;
    reason: string | null;
    settled: boolean;
  }[];
}

/** Saldo do caixa: **somente** movimentos liquidados (§13.4). */
export async function getCashSummary(
  db: Database,
  params: { actor: Actor | null; limit?: number },
): Promise<CashSummary> {
  requireFinanceAccess(params.actor);

  const [balanceRow] = await db
    .select({ total: sql<number>`coalesce(sum(${cashTransactions.amountCents}), 0)::int` })
    .from(cashTransactions)
    .where(isNotNull(cashTransactions.settledAt));

  const [pendingEvents] = await db
    .select({
      total: sql<number>`coalesce(sum(${eventCharges.amountDueCents} - ${eventCharges.amountPaidCents}), 0)::int`,
    })
    .from(eventCharges)
    .where(inArray(eventCharges.status, ['pendente', 'parcial']));

  const [pendingExtra] = await db
    .select({
      total: sql<number>`coalesce(sum(${extraEventCharges.amountDueCents} - ${extraEventCharges.amountPaidCents}), 0)::int`,
    })
    .from(extraEventCharges)
    .where(inArray(extraEventCharges.status, ['pendente', 'parcial']));

  const recent = await db
    .select()
    .from(cashTransactions)
    .orderBy(desc(cashTransactions.occurredAt))
    .limit(params.limit ?? 20);

  return {
    balanceCents: cents(balanceRow?.total ?? 0),
    pendingCents: addCents(cents(pendingEvents?.total ?? 0), cents(pendingExtra?.total ?? 0)),
    recentTransactions: recent.map((row) => ({
      id: row.id,
      kind: row.kind,
      amountCents: cents(row.amountCents),
      description: row.description,
      occurredAt: row.occurredAt,
      reason: row.reason,
      settled: row.settledAt !== null,
    })),
  };
}

/** Ajuste manual de caixa. Exige motivo e gera auditoria (§13.4). */
export async function addManualAdjustment(
  db: Database,
  params: { actor: Actor | null; amountCents: Cents; description: string; reason: string },
): Promise<void> {
  const actor = requireFinanceAccess(params.actor);

  if (params.reason.trim().length < 3) {
    throw new DomainError('ENTRADA_INVALIDA', 'Um ajuste manual de caixa exige um motivo.');
  }
  if (params.amountCents === 0) {
    throw new DomainError('ENTRADA_INVALIDA', 'O ajuste precisa ter valor diferente de zero.');
  }

  await db.transaction(async (tx) => {
    const now = new Date();

    await tx.insert(cashTransactions).values({
      kind: 'ajuste_manual',
      amountCents: params.amountCents,
      settledAt: now,
      occurredAt: now,
      description: params.description,
      reason: params.reason.trim(),
      recordedByUserId: actor.userId,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'financeiro.ajuste_manual',
      entityType: 'cash_transaction',
      after: { valor: formatCents(params.amountCents), descricao: params.description },
      reason: params.reason.trim(),
    });
  });
}

// ---------------------------------------------------------------------------
// Eventos extraordinários (§13.5)
// ---------------------------------------------------------------------------

export async function createExtraEvent(
  db: Database,
  params: {
    actor: Actor | null;
    name: string;
    occurredOn: string;
    notes?: string | null;
    participantIds: readonly string[];
    mode:
      | { kind: 'por_pessoa'; valuePerPersonCents: Cents }
      | { kind: 'total_rateado'; totalCents: Cents };
  },
): Promise<{ id: string }> {
  const actor = requireFinanceAccess(params.actor);

  const charges = buildExtraCharges(params.participantIds, params.mode);

  return db.transaction(async (tx) => {
    const [extra] = await tx
      .insert(extraFinancialEvents)
      .values({
        name: params.name,
        occurredOn: params.occurredOn,
        notes: params.notes ?? null,
        chargeMode: params.mode.kind,
        valuePerPersonCents:
          params.mode.kind === 'por_pessoa' ? params.mode.valuePerPersonCents : null,
        totalCents: params.mode.kind === 'total_rateado' ? params.mode.totalCents : null,
        createdByUserId: actor.userId,
      })
      .returning({ id: extraFinancialEvents.id });

    const extraId = extra?.id as string;

    await tx.insert(extraEventCharges).values(
      charges.map((charge) => ({
        extraEventId: extraId,
        athleteId: charge.participantId,
        amountDueCents: charge.amountDueCents,
      })),
    );

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'financeiro.criar_evento_extra',
      entityType: 'extra_financial_event',
      entityId: extraId,
      after: { nome: params.name, participantes: params.participantIds.length },
    });

    return { id: extraId };
  });
}

export interface ExtraEventView {
  id: string;
  name: string;
  occurredOn: string;
  expectedCents: Cents;
  receivedCents: Cents;
  pendingCents: Cents;
  expensesCents: Cents;
  resultCents: Cents;
  lines: {
    athleteId: string;
    displayName: string;
    dueCents: Cents;
    paidCents: Cents;
    status: string;
  }[];
}

export async function getExtraEvent(
  db: Database,
  params: { actor: Actor | null; extraEventId: string },
): Promise<ExtraEventView> {
  requireFinanceAccess(params.actor);

  const [extra] = await db
    .select()
    .from(extraFinancialEvents)
    .where(eq(extraFinancialEvents.id, params.extraEventId))
    .limit(1);

  if (!extra) throw new NotFoundError('Confraternização não encontrada.');

  const chargeRows = await db
    .select({
      athleteId: extraEventCharges.athleteId,
      dueCents: extraEventCharges.amountDueCents,
      paidCents: extraEventCharges.amountPaidCents,
      status: extraEventCharges.status,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
    })
    .from(extraEventCharges)
    .innerJoin(athletes, eq(athletes.id, extraEventCharges.athleteId))
    .where(eq(extraEventCharges.extraEventId, params.extraEventId))
    .orderBy(athletes.fullName);

  const expenseRows = await db
    .select()
    .from(extraEventExpenses)
    .where(eq(extraEventExpenses.extraEventId, params.extraEventId));

  const expected = addCents(...chargeRows.map((r) => cents(r.dueCents)));
  const received = addCents(...chargeRows.map((r) => cents(r.paidCents)));
  const expenses = addCents(
    ...expenseRows.filter((r) => r.paidAt !== null).map((r) => cents(r.amountCents)),
  );

  return {
    id: extra.id,
    name: extra.name,
    occurredOn: extra.occurredOn,
    expectedCents: expected,
    receivedCents: received,
    pendingCents: subtractCents(expected, received),
    expensesCents: expenses,
    resultCents: subtractCents(received, expenses),
    lines: chargeRows.map((row) => ({
      athleteId: row.athleteId,
      displayName: row.nickname ?? row.fullName,
      dueCents: cents(row.dueCents),
      paidCents: cents(row.paidCents),
      status: row.status,
    })),
  };
}

export async function listEventsWithFinance(
  db: Database,
  params: { actor: Actor | null; limit?: number },
): Promise<
  {
    id: string;
    title: string;
    eventDate: string;
    status: string;
    financialStatus: string;
    expectedCents: Cents;
    receivedCents: Cents;
  }[]
> {
  requireFinanceAccess(params.actor);

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      eventDate: events.eventDate,
      status: events.status,
      financialStatus: events.financialStatus,
      expected: sql<number>`coalesce((select sum(c.amount_due_cents) from event_charges c where c.event_id = ${events.id} and c.status not in ('dispensado','estornado')), 0)::int`,
      received: sql<number>`coalesce((select sum(c.amount_paid_cents) from event_charges c where c.event_id = ${events.id} and c.status not in ('dispensado','estornado')), 0)::int`,
    })
    .from(events)
    .orderBy(desc(events.eventDate))
    .limit(params.limit ?? 30);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    eventDate: row.eventDate,
    status: row.status,
    financialStatus: row.financialStatus,
    expectedCents: cents(row.expected),
    receivedCents: cents(row.received),
  }));
}

export const ZERO = ZERO_CENTS;
