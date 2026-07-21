import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
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
  positionRatings,
  teamFormations,
  teamMembers,
  teams,
} from '@/db/schema';
import type { PositionCode, SkillCode } from '@/domain/positions';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { hashString } from '@/domain/shared/prng';
import {
  generateFormations,
  pairKey,
  type AffinityEdge,
  type BalancingInput,
  type BalancingPlayer,
  type BalancingResult,
  type BalancingStrategy,
  type BalancingWeights,
  type HardConstraint,
  type PlayerLock,
} from '@/domain/team-balancing';
import { requireTeamGeneration, type Actor } from '@/server/policies';
import { recordAudit } from './audit';

/**
 * Ponte entre o banco e o gerador de times (`src/domain/team-balancing`).
 *
 * O algoritmo continua puro: este módulo carrega os dados, monta a entrada,
 * chama a função e persiste o resultado. Nenhuma regra de equilíbrio mora aqui.
 *
 * Ponto importante de §7: **só a avaliação oficial** alimenta o algoritmo. A
 * consulta abaixo nem toca nas tabelas de autoavaliação — não é uma questão de
 * filtrar depois, é de nunca carregar.
 */

/** Converte `numeric` do Postgres (que chega como string) para nota ou `null`. */
function toRating(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface EventBalancingContext {
  input: BalancingInput;
  /** Nomes para exibição, fora do algoritmo. */
  displayNames: Map<string, string>;
  weights: Partial<BalancingWeights>;
  teamCount: number;
  teamSize: number;
  maxImbalancePct: number;
  requiredPositions: readonly PositionCode[];
}

/**
 * Carrega tudo que o algoritmo precisa para um evento.
 *
 * A seed é derivada do id do evento: a mesma geração, repetida, produz o mesmo
 * resultado — mas eventos diferentes não compartilham a mesma sequência.
 */
export async function buildBalancingContext(
  db: Database,
  eventId: string,
  seedOverride?: number,
): Promise<EventBalancingContext> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new NotFoundError('Este encontro não foi encontrado.');

  const [settings] = await db
    .select()
    .from(clubSettings)
    .where(eq(clubSettings.id, 'default'))
    .limit(1);
  if (!settings) {
    throw new NotFoundError('Configurações do clube não encontradas. Rode `npm run db:seed`.');
  }

  // --- Atletas confirmados ------------------------------------------------
  const confirmed = await db
    .select({
      athleteId: eventParticipants.athleteId,
      name: athletes.fullName,
      nickname: athletes.nickname,
    })
    .from(eventParticipants)
    .innerJoin(athletes, eq(athletes.id, eventParticipants.athleteId))
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.status, 'confirmado'),
        isNull(athletes.deletedAt),
      ),
    );

  const athleteIds = confirmed.map((row) => row.athleteId);
  const displayNames = new Map(confirmed.map((row) => [row.athleteId, row.nickname ?? row.name]));

  if (athleteIds.length === 0) {
    return {
      input: {
        players: [],
        constraints: [],
        affinities: [],
        locks: [],
        lockedTeamIndexes: [],
        recentPairings: {},
        seed: seedOverride ?? hashString(eventId),
      },
      displayNames,
      weights: (settings.balancingWeights ?? {}) as Partial<BalancingWeights>,
      teamCount: event.teamCount,
      teamSize: event.teamSize,
      maxImbalancePct: settings.maxImbalanceBasisPoints / 100,
      requiredPositions: (settings.requiredPositions ?? []) as PositionCode[],
    };
  }

  // --- Avaliação oficial vigente ------------------------------------------
  const evaluations = await db
    .select({
      id: officialEvaluations.id,
      athleteId: officialEvaluations.athleteId,
      overall: officialEvaluations.overall,
      status: officialEvaluations.status,
    })
    .from(officialEvaluations)
    .where(
      and(
        inArray(officialEvaluations.athleteId, athleteIds),
        eq(officialEvaluations.isCurrent, true),
      ),
    );

  const evaluationIds = evaluations.map((e) => e.id);

  const skillRows = evaluationIds.length
    ? await db
        .select()
        .from(officialEvaluationSkills)
        .where(inArray(officialEvaluationSkills.evaluationId, evaluationIds))
    : [];

  const positionRatingRows = evaluationIds.length
    ? await db
        .select()
        .from(positionRatings)
        .where(inArray(positionRatings.evaluationId, evaluationIds))
    : [];

  const positionRows = await db
    .select()
    .from(athletePositions)
    .where(inArray(athletePositions.athleteId, athleteIds));

  // --- Indexação ----------------------------------------------------------
  const evaluationByAthlete = new Map(evaluations.map((e) => [e.athleteId, e]));
  const evaluationIdToAthlete = new Map(evaluations.map((e) => [e.id, e.athleteId]));

  const skillsByAthlete = new Map<string, Partial<Record<SkillCode, number | null>>>();
  for (const row of skillRows) {
    const athleteId = evaluationIdToAthlete.get(row.evaluationId);
    if (!athleteId) continue;
    const bucket = skillsByAthlete.get(athleteId) ?? {};
    bucket[row.skill] = toRating(row.rating);
    skillsByAthlete.set(athleteId, bucket);
  }

  const positionRatingsByAthlete = new Map<string, Partial<Record<PositionCode, number | null>>>();
  for (const row of positionRatingRows) {
    const athleteId = evaluationIdToAthlete.get(row.evaluationId);
    if (!athleteId) continue;
    const bucket = positionRatingsByAthlete.get(athleteId) ?? {};
    bucket[row.position] = toRating(row.rating);
    positionRatingsByAthlete.set(athleteId, bucket);
  }

  const players: BalancingPlayer[] = confirmed.map((row) => {
    const evaluation = evaluationByAthlete.get(row.athleteId);
    const positions = positionRows.filter((p) => p.athleteId === row.athleteId);

    return {
      id: row.athleteId,
      displayName: displayNames.get(row.athleteId) ?? row.name,
      overall: toRating(evaluation?.overall ?? null),
      skills: skillsByAthlete.get(row.athleteId) ?? {},
      positionRatings: positionRatingsByAthlete.get(row.athleteId) ?? {},
      primaryPosition: positions.find((p) => p.role === 'principal')?.position ?? null,
      secondaryPositions: positions.filter((p) => p.role === 'secundaria').map((p) => p.position),
      unwantedPositions: positions.filter((p) => p.role === 'indesejada').map((p) => p.position),
      isProvisional: evaluation?.status === 'provisoria',
    };
  });

  // --- Afinidades e restrições --------------------------------------------
  const affinityRows = await db
    .select()
    .from(affinities)
    .where(
      and(
        inArray(affinities.fromAthleteId, athleteIds),
        inArray(affinities.toAthleteId, athleteIds),
      ),
    );

  const edges: AffinityEdge[] = [];
  const constraints: HardConstraint[] = [];

  for (const row of affinityRows) {
    if (row.rigidity === 'restricao_obrigatoria') {
      constraints.push({
        playerAId: row.fromAthleteId,
        playerBId: row.toAthleteId,
        kind: row.intensity >= 0 ? 'must_be_together' : 'must_be_apart',
        reason: row.note ?? undefined,
      });
    } else {
      edges.push({
        fromPlayerId: row.fromAthleteId,
        toPlayerId: row.toAthleteId,
        type: row.type,
        intensity: row.intensity,
      });
    }
  }

  // --- Repetição de duplas recentes ---------------------------------------
  const recentPairings = await loadRecentPairings(
    db,
    eventId,
    athleteIds,
    settings.recentPairingWindow,
  );

  return {
    input: {
      players,
      constraints,
      affinities: edges,
      locks: [],
      lockedTeamIndexes: [],
      recentPairings,
      seed: seedOverride ?? hashString(eventId),
    },
    displayNames,
    weights: (settings.balancingWeights ?? {}) as Partial<BalancingWeights>,
    teamCount: event.teamCount,
    teamSize: event.teamSize,
    maxImbalancePct: settings.maxImbalanceBasisPoints / 100,
    requiredPositions: (settings.requiredPositions ?? []) as PositionCode[],
  };
}

/**
 * Quantas vezes cada dupla jogou junta nos últimos `window` encontros, com
 * decaimento: um encontro mais recente pesa mais que um antigo.
 */
async function loadRecentPairings(
  db: Database,
  currentEventId: string,
  athleteIds: readonly string[],
  window: number,
): Promise<Record<string, number>> {
  const [current] = await db
    .select({ eventDate: events.eventDate })
    .from(events)
    .where(eq(events.id, currentEventId))
    .limit(1);

  if (!current) return {};

  const recentEvents = await db
    .select({ id: events.id, eventDate: events.eventDate })
    .from(events)
    .where(and(eq(events.status, 'finalizado'), isNull(events.deletedAt)))
    .orderBy(desc(events.eventDate))
    .limit(window);

  if (recentEvents.length === 0) return {};

  const rows = await db
    .select({
      eventId: teamFormations.eventId,
      teamId: teamMembers.teamId,
      athleteId: teamMembers.athleteId,
    })
    .from(teamMembers)
    .innerJoin(teamFormations, eq(teamFormations.id, teamMembers.formationId))
    .where(
      and(
        inArray(
          teamFormations.eventId,
          recentEvents.map((e) => e.id),
        ),
        eq(teamFormations.status, 'publicada'),
        inArray(teamMembers.athleteId, [...athleteIds]),
      ),
    );

  const byTeam = new Map<string, { eventId: string; members: string[] }>();
  for (const row of rows) {
    const bucket = byTeam.get(row.teamId) ?? { eventId: row.eventId, members: [] };
    bucket.members.push(row.athleteId);
    byTeam.set(row.teamId, bucket);
  }

  const recencyRank = new Map(recentEvents.map((e, index) => [e.id, index]));
  const pairings: Record<string, number> = {};

  for (const { eventId, members } of byTeam.values()) {
    // Decaimento linear: o encontro mais recente vale 1, o mais antigo da
    // janela vale 1/window.
    const rank = recencyRank.get(eventId) ?? recentEvents.length;
    const weight = Math.max(0, (recentEvents.length - rank) / recentEvents.length);

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i] as string, members[j] as string);
        pairings[key] = (pairings[key] ?? 0) + weight;
      }
    }
  }

  return pairings;
}

export interface GenerateOptionsParams {
  actor: Actor | null;
  eventId: string;
  seed?: number;
  locks?: readonly PlayerLock[];
  lockedTeamIndexes?: readonly number[];
  currentAssignment?: readonly (readonly string[])[];
  /** Override administrativo explícito para times desiguais (§10). */
  allowUnevenTeams?: boolean;
}

/** Gera as opções de formação. Exclusivo de administradores (§10). */
export async function generateOptionsForEvent(
  db: Database,
  params: GenerateOptionsParams,
): Promise<BalancingResult> {
  requireTeamGeneration(params.actor);

  const context = await buildBalancingContext(db, params.eventId, params.seed);

  const input: BalancingInput = {
    ...context.input,
    locks: params.locks ?? [],
    lockedTeamIndexes: params.lockedTeamIndexes ?? [],
    ...(params.currentAssignment ? { currentAssignment: params.currentAssignment } : {}),
  };

  return generateFormations(input, {
    weights: context.weights,
    params: {
      teamCount: context.teamCount,
      teamSize: context.teamSize,
      maxImbalancePct: context.maxImbalancePct,
      requiredPositions: context.requiredPositions,
      allowUnevenTeams: params.allowUnevenTeams ?? false,
    },
  });
}

export interface PublishFormationParams {
  actor: Actor | null;
  eventId: string;
  strategy: BalancingStrategy | 'ajuste_manual';
  teams: readonly (readonly string[])[];
  provenance: unknown;
  metrics: unknown;
  teamPresets?: readonly { name: string; colorToken: string }[];
}

const DEFAULT_TEAM_PRESETS = [
  { name: 'Time A', colorToken: 'cva-navy' },
  { name: 'Time B', colorToken: 'cva-gold' },
  { name: 'Time C', colorToken: 'cva-blue' },
] as const;

/**
 * Publica uma formação como **nova versão imutável** (§10.10).
 *
 * A versão anterior nunca é apagada: passa a `substituida`. É isso que permite
 * comparar formações ao longo do tempo e desfazer uma publicação equivocada.
 */
export async function publishFormation(
  db: Database,
  params: PublishFormationParams,
): Promise<{ formationId: string; version: number }> {
  const actor = requireTeamGeneration(params.actor);

  const flat = params.teams.flat();
  if (new Set(flat).size !== flat.length) {
    throw new ConflictError('Há um atleta repetido em mais de um time.');
  }

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, params.eventId))
      .for('update')
      .limit(1);

    if (!event) throw new NotFoundError('Este encontro não foi encontrado.');

    // Confere que todos os atletas da formação estão realmente confirmados —
    // publicar um time com quem cancelou seria pior que falhar.
    const confirmed = await tx
      .select({ athleteId: eventParticipants.athleteId })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, params.eventId),
          eq(eventParticipants.status, 'confirmado'),
        ),
      );

    const confirmedSet = new Set(confirmed.map((row) => row.athleteId));
    const missing = flat.filter((id) => !confirmedSet.has(id));
    if (missing.length > 0) {
      throw new ConflictError(
        'A formação inclui atletas que não estão confirmados neste encontro.',
        { athleteIds: missing },
      );
    }

    const [previous] = await tx
      .select({ version: teamFormations.version })
      .from(teamFormations)
      .where(eq(teamFormations.eventId, params.eventId))
      .orderBy(desc(teamFormations.version))
      .limit(1);

    const version = (previous?.version ?? 0) + 1;

    // A anterior sai de `publicada` antes de a nova entrar — o índice único
    // parcial garante que nunca haja duas publicadas ao mesmo tempo.
    await tx
      .update(teamFormations)
      .set({ status: 'substituida' })
      .where(
        and(
          eq(teamFormations.eventId, params.eventId),
          inArray(teamFormations.status, ['publicada', 'necessita_revisao']),
        ),
      );

    const [formation] = await tx
      .insert(teamFormations)
      .values({
        eventId: params.eventId,
        version,
        status: 'publicada',
        strategy: params.strategy,
        provenance: params.provenance as object,
        metrics: params.metrics as object,
        generatedByUserId: actor.userId,
        publishedByUserId: actor.userId,
        publishedAt: new Date(),
      })
      .returning({ id: teamFormations.id });

    const formationId = formation?.id as string;
    const presets = params.teamPresets ?? DEFAULT_TEAM_PRESETS;

    for (const [teamIndex, members] of params.teams.entries()) {
      const preset = presets[teamIndex] ?? {
        name: `Time ${teamIndex + 1}`,
        colorToken: 'cva-blue',
      };

      const [team] = await tx
        .insert(teams)
        .values({
          formationId,
          teamIndex,
          name: preset.name,
          colorToken: preset.colorToken,
        })
        .returning({ id: teams.id });

      if (members.length > 0) {
        await tx.insert(teamMembers).values(
          members.map((athleteId) => ({
            teamId: team?.id as string,
            formationId,
            athleteId,
          })),
        );
      }
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      action: 'times.publicar',
      entityType: 'team_formation',
      entityId: formationId,
      after: { version, strategy: params.strategy, teams: params.teams },
    });

    return { formationId, version };
  });
}

export interface PublishedFormation {
  id: string;
  version: number;
  status: string;
  publishedAt: Date | null;
  reviewReason: string | null;
  teams: {
    index: number;
    name: string;
    colorToken: string;
    members: { id: string; displayName: string }[];
  }[];
}

/** Formação publicada de um evento, com os nomes já resolvidos para exibição. */
export async function getPublishedFormation(
  db: Database,
  eventId: string,
): Promise<PublishedFormation | null> {
  const [formation] = await db
    .select()
    .from(teamFormations)
    .where(
      and(
        eq(teamFormations.eventId, eventId),
        inArray(teamFormations.status, ['publicada', 'necessita_revisao']),
      ),
    )
    .orderBy(desc(teamFormations.version))
    .limit(1);

  if (!formation) return null;

  const rows = await db
    .select({
      teamIndex: teams.teamIndex,
      teamName: teams.name,
      colorToken: teams.colorToken,
      athleteId: athletes.id,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
    })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .leftJoin(athletes, eq(athletes.id, teamMembers.athleteId))
    .where(eq(teams.formationId, formation.id))
    .orderBy(teams.teamIndex, athletes.fullName);

  const byIndex = new Map<number, PublishedFormation['teams'][number]>();

  for (const row of rows) {
    const team = byIndex.get(row.teamIndex) ?? {
      index: row.teamIndex,
      name: row.teamName,
      colorToken: row.colorToken,
      members: [],
    };

    if (row.athleteId && row.fullName) {
      team.members.push({
        id: row.athleteId,
        displayName: row.nickname ?? row.fullName,
      });
    }

    byIndex.set(row.teamIndex, team);
  }

  return {
    id: formation.id,
    version: formation.version,
    status: formation.status,
    publishedAt: formation.publishedAt,
    reviewReason: formation.reviewReason,
    teams: [...byIndex.values()].sort((a, b) => a.index - b.index),
  };
}

/** Contagem de participações finalizadas — base da revisão de nota provisória (§7.3). */
export async function countParticipations(db: Database, athleteId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventParticipants)
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .where(
      and(
        eq(eventParticipants.athleteId, athleteId),
        eq(events.status, 'finalizado'),
        inArray(eventParticipants.status, ['presente', 'confirmado', 'chegou_atrasado']),
        gte(events.eventDate, '1900-01-01'),
      ),
    );

  return row?.count ?? 0;
}
