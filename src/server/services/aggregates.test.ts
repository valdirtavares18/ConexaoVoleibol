import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  athleteAccountLinks,
  athletePositions,
  athletes,
  clubSettings,
  eventCharges,
  eventParticipants,
  events,
  teamFormations,
  users,
} from '@/db/schema';
import type { Actor } from '@/server/policies';
import { isDatabaseAvailable, setupTestDb, type TestDb } from '@/test/db';
import { listAthletes, listPendingRegistrations } from './athletes';
import { getEvent, listAllEvents, listUpcomingEvents } from './events';
import { listEventsWithFinance } from './finance';

const available = await isDatabaseAvailable();

/**
 * Regressão das **subconsultas correlacionadas** nas listagens.
 *
 * Estas colunas são calculadas por subconsulta correlacionada com a tabela
 * externa. Interpolar a coluna sem qualificar faz o Drizzle emitir só `"id"`,
 * que dentro da subconsulta resolve para a tabela **interna** — a correlação
 * se perde, a comparação nunca casa e o resultado vem zerado, sem erro nenhum.
 *
 * Esse bug chegou a produção nesta base: o painel do atleta mostrava "0/18" com
 * 18 atletas confirmados no banco. Passou pelos testes porque a tela de
 * presenças conta pelo roster (consulta direta) e o E2E do atleta só conferia o
 * título do encontro.
 *
 * A regra destes testes: **toda coluna agregada precisa ter um valor esperado
 * diferente de zero**. Um teste que aceita zero não pega esta classe de falha.
 */
describe.skipIf(!available)('listagens com subconsulta correlacionada', () => {
  let harness: TestDb;
  let db: Database;
  let adminUserId: string;
  let eventId: string;
  let athleteIds: string[] = [];

  const admin = (): Actor => ({
    userId: adminUserId,
    athleteId: null,
    roles: ['admin'],
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
    await db.insert(clubSettings).values({ id: 'default' });

    const [admin1] = await db
      .insert(users)
      .values({
        email: 'admin@agregados.local',
        name: 'Admin',
        passwordHash: 'x',
        status: 'ativo',
      })
      .returning({ id: users.id });
    adminUserId = admin1?.id as string;

    const created = await db
      .insert(athletes)
      .values(
        Array.from({ length: 10 }, (_, i) => ({
          fullName: `Atleta ${i + 1}`,
          email: `atleta${i + 1}@agregados.local`,
        })),
      )
      .returning({ id: athletes.id });

    athleteIds = created.map((row) => row.id);

    // Posição principal só para os três primeiros.
    for (const athleteId of athleteIds.slice(0, 3)) {
      await db.insert(athletePositions).values({
        athleteId,
        position: 'levantador',
        role: 'principal',
      });
    }

    // Conta vinculada só para os dois primeiros.
    for (const [i, athleteId] of athleteIds.slice(0, 2).entries()) {
      const [user] = await db
        .insert(users)
        .values({
          email: `conta${i}@agregados.local`,
          name: `Conta ${i}`,
          passwordHash: 'x',
          status: 'ativo',
        })
        .returning({ id: users.id });

      await db.insert(athleteAccountLinks).values({
        athleteId,
        userId: user?.id as string,
        status: 'aprovado',
      });
    }

    const future = new Date();
    future.setDate(future.getDate() + 5);

    const [event] = await db
      .insert(events)
      .values({
        title: 'Encontro agregado',
        status: 'publicado',
        eventDate: future.toISOString().slice(0, 10),
        capacity: 6,
        valuePerAthleteCents: 1000,
        courtCostCents: 15000,
      })
      .returning({ id: events.id });
    eventId = event?.id as string;

    // 6 confirmados (lotando) e 2 na lista de espera.
    await db.insert(eventParticipants).values([
      ...athleteIds.slice(0, 6).map((athleteId, i) => ({
        eventId,
        athleteId,
        status: 'confirmado' as const,
        confirmedSlot: i + 1,
      })),
      ...athleteIds.slice(6, 8).map((athleteId, i) => ({
        eventId,
        athleteId,
        status: 'lista_espera' as const,
        waitlistPosition: i + 1,
      })),
    ]);

    await db.insert(teamFormations).values({
      eventId,
      version: 1,
      status: 'publicada',
      strategy: 'equilibrio_maximo',
      provenance: {},
      metrics: {},
      publishedAt: new Date(),
    });

    // Cobranças: 6 de R$ 10,00, com 4 já pagas.
    await db.insert(eventCharges).values(
      athleteIds.slice(0, 6).map((athleteId, i) => ({
        eventId,
        athleteId,
        amountDueCents: 1000,
        amountPaidCents: i < 4 ? 1000 : 0,
        status: i < 4 ? ('pago' as const) : ('pendente' as const),
      })),
    );
  });

  it('conta confirmados e lista de espera do evento', async () => {
    const [event] = await listUpcomingEvents(db, { actor: admin() });

    expect(event?.confirmedCount).toBe(6);
    expect(event?.waitlistCount).toBe(2);
  });

  it('detecta a formação publicada', async () => {
    const [event] = await listUpcomingEvents(db, { actor: admin() });

    expect(event?.hasPublishedFormation).toBe(true);
    expect(event?.formationNeedsReview).toBe(false);
  });

  it('marca a formação como necessitando revisão quando é o caso', async () => {
    await harness.db
      .update(teamFormations)
      .set({ status: 'necessita_revisao' })
      .where(eq(teamFormations.eventId, eventId));

    const [event] = await listUpcomingEvents(db, { actor: admin() });

    expect(event?.formationNeedsReview).toBe(true);
    expect(event?.hasPublishedFormation).toBe(false);
  });

  it('vale para `getEvent` e `listAllEvents`, não só para a agenda', async () => {
    const single = await getEvent(db, { actor: admin(), eventId });
    expect(single?.confirmedCount).toBe(6);
    expect(single?.waitlistCount).toBe(2);

    const [fromList] = await listAllEvents(db, { actor: admin() });
    expect(fromList?.confirmedCount).toBe(6);
  });

  it('resolve a posição principal e a existência de conta por atleta', async () => {
    const list = await listAthletes(db, { actor: admin() });

    expect(list.filter((a) => a.primaryPosition === 'levantador')).toHaveLength(3);
    expect(list.filter((a) => a.hasAccount)).toHaveLength(2);
    // O restante precisa ficar realmente nulo, não "tudo nulo por bug".
    expect(list.filter((a) => a.primaryPosition === null)).toHaveLength(7);
  });

  it('soma o esperado e o recebido de cada encontro', async () => {
    const [event] = await listEventsWithFinance(db, { actor: admin() });

    expect(event?.expectedCents).toBe(6000);
    expect(event?.receivedCents).toBe(4000);
  });

  it('encontra o perfil coincidente de um cadastro pendente pelo e-mail', async () => {
    await db.insert(users).values({
      email: 'atleta3@agregados.local',
      name: 'Atleta Três',
      passwordHash: 'x',
      status: 'aguardando_aprovacao',
    });

    const [pending] = await listPendingRegistrations(db, admin());

    // O e-mail bate com o do atleta 3 — a duplicidade precisa ser detectada.
    expect(pending?.possibleMatchAthleteId).toBe(athleteIds[2]);
    expect(pending?.possibleMatchName).toBe('Atleta 3');
  });
});
