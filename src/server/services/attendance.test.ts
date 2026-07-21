import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { athletes, events, teamFormations, teams, users } from '@/db/schema';
import { DomainError } from '@/domain/shared/errors';
import type { Actor } from '@/server/policies';
import { isDatabaseAvailable, setupTestDb, type TestDb } from '@/test/db';
import { getRoster, reorderWaitlist, respondToEvent } from './attendance';

const available = await isDatabaseAvailable();

/**
 * Testes de integração contra Postgres real. Pulam (em vez de falhar) quando o
 * Docker não está de pé, para não quebrar um `npm test` local — mas em CI o
 * banco está sempre disponível e eles rodam.
 */
describe.skipIf(!available)('presenças e lista de espera (§23.4)', () => {
  let harness: TestDb;
  let db: Database;

  let eventId: string;
  let athleteIds: string[] = [];
  let adminUserId: string;
  let athleteUserId: string;

  /**
   * `responded_by_user_id` tem chave estrangeira para `users`: os atores dos
   * testes precisam de contas reais, senão o teste passaria a exercitar a FK em
   * vez da regra de negócio.
   */
  const admin = (): Actor => ({
    userId: adminUserId,
    athleteId: null,
    roles: ['admin'],
    status: 'ativo',
  });

  const actorFor = (athleteId: string): Actor => ({
    userId: athleteUserId,
    athleteId,
    roles: ['atleta'],
    status: 'ativo',
  });

  beforeAll(async () => {
    harness = await setupTestDb();
    db = harness.db as unknown as Database;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();

    const createdUsers = await db
      .insert(users)
      .values([
        {
          email: 'admin@teste.local',
          name: 'Admin de Teste',
          passwordHash: 'x',
          status: 'ativo' as const,
        },
        {
          email: 'atleta@teste.local',
          name: 'Atleta de Teste',
          passwordHash: 'x',
          status: 'ativo' as const,
        },
      ])
      .returning({ id: users.id });

    adminUserId = createdUsers[0]?.id as string;
    athleteUserId = createdUsers[1]?.id as string;

    const inserted = await db
      .insert(athletes)
      .values(
        Array.from({ length: 25 }, (_, i) => ({
          fullName: `Atleta ${String(i + 1).padStart(2, '0')}`,
        })),
      )
      .returning({ id: athletes.id });

    athleteIds = inserted.map((row) => row.id);

    const [event] = await db
      .insert(events)
      .values({
        title: 'Encontro de quarta',
        type: 'encontro',
        status: 'publicado',
        eventDate: '2026-07-22',
        capacity: 18,
        valuePerAthleteCents: 1000,
        courtCostCents: 15000,
      })
      .returning({ id: events.id });

    eventId = event?.id as string;
  });

  const confirm = (athleteId: string) =>
    respondToEvent(db, {
      actor: actorFor(athleteId),
      eventId,
      athleteId,
      response: 'confirmar',
    });

  it('confirma até 18 atletas e coloca o 19º na lista de espera', async () => {
    for (let i = 0; i < 18; i++) {
      const result = await confirm(athleteIds[i] as string);
      expect(result.status).toBe('confirmado');
      expect(result.confirmedSlot).toBe(i + 1);
    }

    const nineteenth = await confirm(athleteIds[18] as string);
    expect(nineteenth.status).toBe('lista_espera');
    expect(nineteenth.waitlistPosition).toBe(1);
    expect(nineteenth.confirmedSlot).toBeNull();

    const roster = await getRoster(db, eventId);
    expect(roster.confirmed).toHaveLength(18);
    expect(roster.waitlist).toHaveLength(1);
  });

  it('duas confirmações simultâneas nunca produzem 19 confirmados', async () => {
    // Preenche 17 vagas: sobra exatamente uma disputada por duas pessoas.
    for (let i = 0; i < 17; i++) {
      await confirm(athleteIds[i] as string);
    }

    const [a, b] = await Promise.all([
      confirm(athleteIds[17] as string),
      confirm(athleteIds[18] as string),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['confirmado', 'lista_espera']);

    const roster = await getRoster(db, eventId);
    expect(roster.confirmed).toHaveLength(18);
    expect(roster.waitlist).toHaveLength(1);
  });

  it('resiste a uma corrida de oito confirmações para três vagas', async () => {
    for (let i = 0; i < 15; i++) {
      await confirm(athleteIds[i] as string);
    }

    const results = await Promise.all(athleteIds.slice(15, 23).map((id) => confirm(id)));

    expect(results.filter((r) => r.status === 'confirmado')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'lista_espera')).toHaveLength(5);

    const roster = await getRoster(db, eventId);
    expect(roster.confirmed).toHaveLength(18);
    // Slots distintos e dentro da capacidade.
    expect(new Set(roster.confirmed.map((c) => c.slot)).size).toBe(18);
    expect(Math.max(...roster.confirmed.map((c) => c.slot))).toBeLessThanOrEqual(18);

    // Posições de fila também distintas.
    const positions = roster.waitlist.map((w) => w.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('cancelamento promove o primeiro da fila na mesma transação', async () => {
    for (let i = 0; i < 20; i++) {
      await confirm(athleteIds[i] as string);
    }

    const firstInLine = athleteIds[18] as string;
    const cancelling = athleteIds[0] as string;

    const result = await respondToEvent(db, {
      actor: actorFor(cancelling),
      eventId,
      athleteId: cancelling,
      response: 'cancelar',
    });

    expect(result.promotedAthleteId).toBe(firstInLine);

    const roster = await getRoster(db, eventId);
    expect(roster.confirmed).toHaveLength(18);
    expect(roster.confirmed.some((c) => c.athleteId === firstInLine)).toBe(true);
    expect(roster.confirmed.some((c) => c.athleteId === cancelling)).toBe(false);
    expect(roster.waitlist).toHaveLength(1);
  });

  it('o promovido ocupa exatamente o slot liberado', async () => {
    for (let i = 0; i < 19; i++) {
      await confirm(athleteIds[i] as string);
    }

    // Cancela quem ocupa o slot 5.
    const target = athleteIds[4] as string;
    await respondToEvent(db, {
      actor: actorFor(target),
      eventId,
      athleteId: target,
      response: 'cancelar',
    });

    const roster = await getRoster(db, eventId);
    const promoted = roster.confirmed.find((c) => c.athleteId === athleteIds[18]);
    expect(promoted?.slot).toBe(5);
  });

  it('marca a formação publicada como necessitando revisão após um cancelamento', async () => {
    for (let i = 0; i < 18; i++) {
      await confirm(athleteIds[i] as string);
    }

    const [formation] = await db
      .insert(teamFormations)
      .values({
        eventId,
        version: 1,
        status: 'publicada',
        strategy: 'equilibrio_maximo',
        provenance: {},
        metrics: {},
        publishedAt: new Date(),
      })
      .returning({ id: teamFormations.id });

    await db.insert(teams).values({
      formationId: formation?.id as string,
      teamIndex: 0,
      name: 'Time A',
    });

    const cancelling = athleteIds[3] as string;
    const result = await respondToEvent(db, {
      actor: actorFor(cancelling),
      eventId,
      athleteId: cancelling,
      response: 'cancelar',
    });

    expect(result.formationNeedsReview).toBe(true);

    const [updated] = await db
      .select()
      .from(teamFormations)
      .where(eq(teamFormations.id, formation?.id as string));

    expect(updated?.status).toBe('necessita_revisao');
    expect(updated?.reviewReason).toContain('cancelou');
  });

  it('confirmar duas vezes é idempotente e não consome outro slot', async () => {
    const athleteId = athleteIds[0] as string;
    const first = await confirm(athleteId);
    const second = await confirm(athleteId);

    expect(second.status).toBe('confirmado');
    expect(second.confirmedSlot).toBe(first.confirmedSlot);

    const roster = await getRoster(db, eventId);
    expect(roster.confirmed).toHaveLength(1);
  });

  it('recusa confirmação após o prazo, mas o administrador confirma em nome do atleta', async () => {
    await db
      .update(events)
      .set({ confirmationDeadline: new Date(Date.now() - 60_000) })
      .where(eq(events.id, eventId));

    const athleteId = athleteIds[0] as string;

    await expect(confirm(athleteId)).rejects.toThrow(DomainError);

    const byAdmin = await respondToEvent(db, {
      actor: admin(),
      eventId,
      athleteId,
      response: 'confirmar',
      onBehalf: true,
    });

    expect(byAdmin.status).toBe('confirmado');
  });

  it('registra cancelamento após o prazo com status próprio', async () => {
    const athleteId = athleteIds[0] as string;
    await confirm(athleteId);

    await db
      .update(events)
      .set({ confirmationDeadline: new Date(Date.now() - 60_000) })
      .where(eq(events.id, eventId));

    const result = await respondToEvent(db, {
      actor: actorFor(athleteId),
      eventId,
      athleteId,
      response: 'cancelar',
    });

    expect(result.status).toBe('cancelou_apos_prazo');
  });

  it('permite ao administrador reordenar a fila de espera', async () => {
    for (let i = 0; i < 21; i++) {
      await confirm(athleteIds[i] as string);
    }

    const queue = (await getRoster(db, eventId)).waitlist.map((w) => w.athleteId);
    expect(queue).toHaveLength(3);

    const reversed = [...queue].reverse();
    await reorderWaitlist(db, { actor: admin(), eventId, orderedAthleteIds: reversed });

    const after = (await getRoster(db, eventId)).waitlist;
    expect(after.map((w) => w.athleteId)).toEqual(reversed);
    expect(after.map((w) => w.position)).toEqual([1, 2, 3]);
  });

  it('recusa resposta em encontro ainda em rascunho', async () => {
    await db.update(events).set({ status: 'rascunho' }).where(eq(events.id, eventId));
    await expect(confirm(athleteIds[0] as string)).rejects.toThrow(DomainError);
  });

  it('recusa resposta em encontro cancelado', async () => {
    await db.update(events).set({ status: 'cancelado' }).where(eq(events.id, eventId));
    await expect(confirm(athleteIds[0] as string)).rejects.toThrow(DomainError);
  });

  it('um atleta não confirma presença no lugar de outro', async () => {
    await expect(
      respondToEvent(db, {
        actor: actorFor(athleteIds[0] as string),
        eventId,
        athleteId: athleteIds[1] as string,
        response: 'confirmar',
      }),
    ).rejects.toThrow(DomainError);
  });
});
