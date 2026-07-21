import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  affinities,
  athletePositions,
  athletes,
  clubSettings,
  eventParticipants,
  events,
  officialEvaluationSkills,
  officialEvaluations,
  selfAssessments,
  teamFormations,
  users,
} from '@/db/schema';
import { ConflictError, ForbiddenError } from '@/domain/shared/errors';
import type { Actor } from '@/server/policies';
import { isDatabaseAvailable, setupTestDb, type TestDb } from '@/test/db';
import {
  buildBalancingContext,
  generateOptionsForEvent,
  getPublishedFormation,
  publishFormation,
} from './team-formation';

const available = await isDatabaseAvailable();

describe.skipIf(!available)('formação de times ligada ao banco (§10)', () => {
  let harness: TestDb;
  let db: Database;
  let eventId: string;
  let athleteIds: string[] = [];
  let adminUserId: string;

  const admin = (): Actor => ({
    userId: adminUserId,
    athleteId: null,
    roles: ['admin'],
    status: 'ativo',
  });

  const atleta = (): Actor => ({
    userId: adminUserId,
    athleteId: athleteIds[0] ?? null,
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
    await db.insert(clubSettings).values({ id: 'default' });

    const [user] = await db
      .insert(users)
      .values({
        email: 'admin@teste.local',
        name: 'Admin',
        passwordHash: 'x',
        status: 'ativo',
      })
      .returning({ id: users.id });
    adminUserId = user?.id as string;

    // 18 atletas com níveis variados e uma posição principal cada.
    const levels = [5, 4.5, 4.5, 4, 4, 4, 3.5, 3.5, 3.5, 3, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1];
    const positions = ['levantador', 'ponteiro', 'central', 'oposto', 'libero', 'ponteiro'] as const;

    const created = await db
      .insert(athletes)
      .values(
        levels.map((_, i) => ({ fullName: `Atleta ${String(i + 1).padStart(2, '0')}` })),
      )
      .returning({ id: athletes.id });

    athleteIds = created.map((row) => row.id);

    for (const [i, athleteId] of athleteIds.entries()) {
      await db.insert(athletePositions).values({
        athleteId,
        position: positions[i % positions.length] as (typeof positions)[number],
        role: 'principal',
      });

      const [evaluation] = await db
        .insert(officialEvaluations)
        .values({
          athleteId,
          revision: 1,
          overall: String(levels[i]),
          status: i < 2 ? 'provisoria' : 'definitiva',
          isCurrent: true,
          evaluatedByUserId: adminUserId,
        })
        .returning({ id: officialEvaluations.id });

      await db.insert(officialEvaluationSkills).values([
        { evaluationId: evaluation?.id as string, skill: 'ataque', rating: String(levels[i]) },
        { evaluationId: evaluation?.id as string, skill: 'defesa', rating: String(levels[i]) },
      ]);
    }

    const [event] = await db
      .insert(events)
      .values({
        title: 'Encontro de quarta',
        status: 'publicado',
        eventDate: '2026-07-22',
        capacity: 18,
        teamCount: 3,
        teamSize: 6,
      })
      .returning({ id: events.id });
    eventId = event?.id as string;

    await db.insert(eventParticipants).values(
      athleteIds.map((athleteId, i) => ({
        eventId,
        athleteId,
        status: 'confirmado' as const,
        confirmedSlot: i + 1,
      })),
    );
  });

  it('monta a entrada do algoritmo a partir da avaliação oficial', async () => {
    const context = await buildBalancingContext(db, eventId);

    expect(context.input.players).toHaveLength(18);
    expect(context.teamCount).toBe(3);
    expect(context.teamSize).toBe(6);
    expect(context.maxImbalancePct).toBe(5);

    const strongest = context.input.players.find((p) => p.id === athleteIds[0]);
    expect(strongest?.overall).toBe(5);
    expect(strongest?.primaryPosition).toBe('levantador');
    expect(strongest?.isProvisional).toBe(true);
  });

  it('a autoavaliação nunca alimenta o algoritmo (§23.2)', async () => {
    // Autoavaliação com nota oposta à oficial: se vazasse para o algoritmo, a
    // força do atleta mudaria.
    await db.insert(selfAssessments).values({
      athleteId: athleteIds[17] as string,
      revision: 1,
      overall: '5.0',
    });

    const context = await buildBalancingContext(db, eventId);
    const weakest = context.input.players.find((p) => p.id === athleteIds[17]);

    // A nota oficial dele é 1, não a autoavaliação de 5.
    expect(weakest?.overall).toBe(1);
  });

  it('gera três times de seis com todos os confirmados', async () => {
    const result = await generateOptionsForEvent(db, { actor: admin(), eventId });

    expect(result.options.length).toBeGreaterThanOrEqual(3);

    for (const option of result.options) {
      expect(option.teams).toHaveLength(3);
      for (const team of option.teams) expect(team).toHaveLength(6);

      const flat = option.teams.flat();
      expect(new Set(flat).size).toBe(18);
    }
  });

  it('a mesma seed produz o mesmo resultado', async () => {
    const a = await generateOptionsForEvent(db, { actor: admin(), eventId, seed: 777 });
    const b = await generateOptionsForEvent(db, { actor: admin(), eventId, seed: 777 });

    expect(a.provenance.inputDigest).toBe(b.provenance.inputDigest);
    expect(JSON.stringify(a.options.map((o) => o.teams))).toBe(
      JSON.stringify(b.options.map((o) => o.teams)),
    );
  });

  it('respeita restrição obrigatória cadastrada pelo administrador', async () => {
    await db.insert(affinities).values({
      fromAthleteId: athleteIds[0] as string,
      toAthleteId: athleteIds[1] as string,
      type: 'pessoal',
      intensity: -3,
      rigidity: 'restricao_obrigatoria',
      createdByUserId: adminUserId,
    });

    const result = await generateOptionsForEvent(db, { actor: admin(), eventId });

    for (const option of result.options) {
      const teamOf = new Map<string, number>();
      option.teams.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));
      expect(teamOf.get(athleteIds[0] as string)).not.toBe(teamOf.get(athleteIds[1] as string));
    }
  });

  it('atleta não gera nem publica times', async () => {
    await expect(
      generateOptionsForEvent(db, { actor: atleta(), eventId }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      publishFormation(db, {
        actor: atleta(),
        eventId,
        strategy: 'equilibrio_maximo',
        teams: [athleteIds.slice(0, 6), athleteIds.slice(6, 12), athleteIds.slice(12, 18)],
        provenance: {},
        metrics: {},
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('publica a formação como versão imutável e substitui a anterior', async () => {
    const result = await generateOptionsForEvent(db, { actor: admin(), eventId });
    const option = result.options[0];
    if (!option) throw new Error('esperava uma opção');

    const first = await publishFormation(db, {
      actor: admin(),
      eventId,
      strategy: option.strategy,
      teams: option.teams,
      provenance: result.provenance,
      metrics: option.metrics,
    });

    expect(first.version).toBe(1);

    const second = await publishFormation(db, {
      actor: admin(),
      eventId,
      strategy: 'ajuste_manual',
      teams: option.teams,
      provenance: result.provenance,
      metrics: option.metrics,
    });

    expect(second.version).toBe(2);

    const all = await db
      .select()
      .from(teamFormations)
      .where(eq(teamFormations.eventId, eventId));

    // Versão anterior preservada, não apagada.
    expect(all).toHaveLength(2);
    expect(all.filter((f) => f.status === 'publicada')).toHaveLength(1);
    expect(all.find((f) => f.version === 1)?.status).toBe('substituida');
  });

  it('recusa publicar formação com atleta repetido', async () => {
    const duplicated = [
      athleteIds.slice(0, 6),
      [athleteIds[0] as string, ...athleteIds.slice(7, 12)],
      athleteIds.slice(12, 18),
    ];

    await expect(
      publishFormation(db, {
        actor: admin(),
        eventId,
        strategy: 'ajuste_manual',
        teams: duplicated,
        provenance: {},
        metrics: {},
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('recusa publicar formação com atleta não confirmado', async () => {
    const [outsider] = await db
      .insert(athletes)
      .values({ fullName: 'Quem não confirmou' })
      .returning({ id: athletes.id });

    const teamsWithOutsider = [
      [...athleteIds.slice(0, 5), outsider?.id as string],
      athleteIds.slice(6, 12),
      athleteIds.slice(12, 18),
    ];

    await expect(
      publishFormation(db, {
        actor: admin(),
        eventId,
        strategy: 'ajuste_manual',
        teams: teamsWithOutsider,
        provenance: {},
        metrics: {},
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('lê a formação publicada com os nomes resolvidos', async () => {
    const result = await generateOptionsForEvent(db, { actor: admin(), eventId });
    const option = result.options[0];
    if (!option) throw new Error('esperava uma opção');

    await publishFormation(db, {
      actor: admin(),
      eventId,
      strategy: option.strategy,
      teams: option.teams,
      provenance: result.provenance,
      metrics: option.metrics,
    });

    const published = await getPublishedFormation(db, eventId);

    expect(published?.version).toBe(1);
    expect(published?.teams).toHaveLength(3);
    expect(published?.teams[0]?.name).toBe('Time A');
    for (const team of published?.teams ?? []) {
      expect(team.members).toHaveLength(6);
      expect(team.members[0]?.displayName).toMatch(/^Atleta \d\d$/);
    }
  });

  it('respeita bloqueio manual ao recalcular', async () => {
    const locked = athleteIds[0] as string;
    const result = await generateOptionsForEvent(db, {
      actor: admin(),
      eventId,
      locks: [{ playerId: locked, teamIndex: 2 }],
    });

    for (const option of result.options) {
      expect(option.teams[2]).toContain(locked);
    }
  });
});
