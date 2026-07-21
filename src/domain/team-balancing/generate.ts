import { InsufficientPlayersError } from '@/domain/shared/errors';
import { createPrng } from '@/domain/shared/prng';
import { buildConstraintIndex, type ConstraintIndex } from './constraints';
import { resolveParams, resolveWeights } from './defaults';
import { digestInput } from './digest';
import { buildFastIndex, createDiffPctEvaluator, createPrimaryCostEvaluator } from './fast';
import {
  affinityScore,
  diffPercent,
  extremeCounts,
  internalStdDevs,
  perSkillSummaries,
  positionCoverage,
  primaryCost,
  rankWiseCost,
  repeatedPairCost,
  secondaryCost,
  stdDev,
  teamStrengths,
  type Assignment,
  type EvaluationContext,
} from './metrics';
import {
  assignmentDistance,
  canonicalKey,
  constructCandidates,
  isFeasible,
  localImprove,
  normalizeAssignment,
} from './search';
import { computeStrengths } from './strength';
import {
  ALGORITHM_VERSION,
  type AffinityOutcome,
  type BalancingInput,
  type BalancingMetrics,
  type BalancingParams,
  type BalancingResult,
  type BalancingStrategy,
  type BalancingWeights,
  type FormationAlert,
  type FormationOption,
} from './types';

export interface GenerateOverrides {
  weights?: Partial<BalancingWeights>;
  params?: Partial<BalancingParams>;
}

interface Candidate {
  assignment: Assignment;
  key: string;
  primary: number;
  secondary: number;
  diffPct: number;
  affinity: number;
  repetition: number;
  missingCoverage: number;
}

/** Quantas alternativas contrafactuais calculamos para explicar não atendimentos. */
const MAX_COUNTERFACTUALS = 12;

// ---------------------------------------------------------------------------

export function generateFormations(
  input: BalancingInput,
  overrides: GenerateOverrides = {},
): BalancingResult {
  const weights = resolveWeights(overrides.weights);
  const params = resolveParams(overrides.params);

  const expectedCount = params.teamCount * params.teamSize;
  if (!params.allowUnevenTeams && input.players.length !== expectedCount) {
    throw new InsufficientPlayersError(expectedCount, input.players.length);
  }

  const index = buildIndexFor(input, params);
  const ctx = buildContext(input, weights, params);
  const prng = createPrng(input.seed >>> 0);

  // --- Fase A: equilíbrio ---------------------------------------------------
  // O avaliador rápido devolve exatamente o mesmo número que `primaryCost`, mas
  // com buffers reutilizados — é chamado dezenas de milhares de vezes.
  const fast = buildFastIndex(ctx);
  const primary = createPrimaryCostEvaluator(ctx, fast);
  const diffOnly = createDiffPctEvaluator(ctx, fast);
  const rawCandidates = constructCandidates(ctx, index, prng, {
    teamCount: params.teamCount,
    teamSize: params.teamSize,
    allowUnevenTeams: params.allowUnevenTeams,
    randomRestarts: params.randomRestarts,
  });

  const pool = new Map<string, Candidate>();
  const remember = (assignment: Assignment): void => {
    if (!isFeasible(assignment, index, params)) return;
    const normalized = normalizeAssignment(assignment, index);
    const key = canonicalKey(normalized);
    if (pool.has(key)) return;
    pool.set(key, describe(normalized, key, ctx));
  };

  for (const candidate of rawCandidates) {
    remember(localImprove(candidate, ctx, index, primary, params.maxLocalSearchPasses, false));
  }

  // Refino com rotações 3-cíclicas apenas nos melhores — é a etapa cara.
  const refineTargets = [...pool.values()]
    .sort((a, b) => a.primary - b.primary)
    .slice(0, 12)
    .map((candidate) => candidate.assignment);

  for (const candidate of refineTargets) {
    remember(localImprove(candidate, ctx, index, primary, params.maxLocalSearchPasses, true));
    // Uma passada otimizando exclusivamente a diferença percentual afia o
    // `melhorDiff%` alcançável, que define o portão da fase B.
    remember(localImprove(candidate, ctx, index, diffOnly, params.maxLocalSearchPasses, true));
  }

  const candidates = [...pool.values()];
  if (candidates.length === 0) {
    throw new InsufficientPlayersError(expectedCount, input.players.length);
  }

  const bestAchievableDiffPct = Math.min(...candidates.map((c) => c.diffPct));
  const gatePct = Math.max(params.maxImbalancePct, bestAchievableDiffPct + params.gateSlackPct);
  const eligible = candidates.filter((c) => c.diffPct <= gatePct + 1e-9);

  // --- Fase B: escolha das opções sob o portão ------------------------------
  const byStrategy = selectStrategies(candidates, eligible, params);
  const options = buildOptions(byStrategy, ctx, index, params);

  const limitNotReached = bestAchievableDiffPct > params.maxImbalancePct + 1e-9;

  return {
    options,
    limitNotReached,
    limitBlockers: limitNotReached ? explainBlockers(input, index, params) : [],
    provenance: {
      algorithmVersion: ALGORITHM_VERSION,
      seed: input.seed,
      weights,
      params,
      inputDigest: digestInput(input),
      candidatesEvaluated: candidates.length,
      bestAchievableDiffPct,
      gatePct,
    },
  };
}

// ---------------------------------------------------------------------------
// Montagem do contexto
// ---------------------------------------------------------------------------

function buildIndexFor(input: BalancingInput, params: BalancingParams): ConstraintIndex {
  // Um time congelado equivale a bloquear individualmente cada um dos seus
  // membros — assim existe uma única representação de bloqueio na busca.
  const locks = [...input.locks];

  if (input.lockedTeamIndexes.length > 0) {
    const current = input.currentAssignment;
    if (!current) {
      throw new InsufficientPlayersError(params.teamCount * params.teamSize, 0);
    }
    for (const teamIndex of input.lockedTeamIndexes) {
      for (const playerId of current[teamIndex] ?? []) {
        locks.push({ playerId, teamIndex });
      }
    }
  }

  return buildConstraintIndex(input.players, input.constraints, locks, input.lockedTeamIndexes, {
    teamCount: params.teamCount,
    teamSize: params.teamSize,
  });
}

function buildContext(
  input: BalancingInput,
  weights: BalancingWeights,
  params: BalancingParams,
): EvaluationContext {
  return {
    players: new Map(input.players.map((player) => [player.id, player])),
    strengths: computeStrengths(input.players, weights),
    weights,
    params,
    affinities: input.affinities,
    recentPairings: input.recentPairings,
  };
}

function describe(assignment: Assignment, key: string, ctx: EvaluationContext): Candidate {
  return {
    assignment,
    key,
    primary: primaryCost(assignment, ctx),
    secondary: secondaryCost(assignment, ctx),
    diffPct: diffPercent(teamStrengths(assignment, ctx)),
    affinity: affinityScore(assignment, ctx),
    repetition: repeatedPairCost(assignment, ctx),
    missingCoverage: positionCoverage(assignment, ctx).reduce(
      (acc, coverage) => acc + coverage.missingTeamIndexes.length,
      0,
    ),
  };
}

// ---------------------------------------------------------------------------
// Seleção das opções
// ---------------------------------------------------------------------------

function selectStrategies(
  all: readonly Candidate[],
  eligible: readonly Candidate[],
  params: BalancingParams,
): Map<BalancingStrategy, Candidate> {
  const pickBest = (
    pool: readonly Candidate[],
    compare: (a: Candidate, b: Candidate) => number,
  ): Candidate | null => {
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => compare(a, b) || a.key.localeCompare(b.key))[0] ?? null;
  };

  const chosen = new Map<BalancingStrategy, Candidate>();
  const used: Candidate[] = [];

  /**
   * Escolhe o melhor candidato que ainda esteja suficientemente distante dos já
   * escolhidos — evita devolver três opções praticamente idênticas (§6.5).
   */
  const claim = (
    strategy: BalancingStrategy,
    pool: readonly Candidate[],
    compare: (a: Candidate, b: Candidate) => number,
  ): void => {
    const ordered = [...pool].sort((a, b) => compare(a, b) || a.key.localeCompare(b.key));

    const distinct = ordered.find((candidate) =>
      used.every(
        (existing) =>
          existing.key !== candidate.key &&
          assignmentDistance(existing.assignment, candidate.assignment) >=
            params.minOptionDistance,
      ),
    );

    // Sem alternativa distinta, reaproveitamos a melhor: a UI informa que a
    // opção atende a mais de uma intenção, em vez de fingir formações diferentes.
    const picked = distinct ?? pickBest(pool, compare);
    if (!picked) return;

    chosen.set(strategy, picked);
    if (!used.some((existing) => existing.key === picked.key)) used.push(picked);
  };

  claim('equilibrio_maximo', all, (a, b) => a.primary - b.primary);
  claim('equilibrio_com_afinidades', eligible, (a, b) => b.affinity - a.affinity || a.primary - b.primary);
  claim('variacao_social', eligible, (a, b) => a.repetition - b.repetition || a.primary - b.primary);
  claim(
    'cobertura_de_posicoes',
    eligible,
    (a, b) => a.missingCoverage - b.missingCoverage || a.primary - b.primary,
  );

  return chosen;
}

function buildOptions(
  byStrategy: ReadonlyMap<BalancingStrategy, Candidate>,
  ctx: EvaluationContext,
  index: ConstraintIndex,
  params: BalancingParams,
): FormationOption[] {
  const order: BalancingStrategy[] = [
    'equilibrio_maximo',
    'equilibrio_com_afinidades',
    'variacao_social',
    'cobertura_de_posicoes',
  ];

  const byKey = new Map<string, { candidate: Candidate; strategies: BalancingStrategy[] }>();

  for (const strategy of order) {
    const candidate = byStrategy.get(strategy);
    if (!candidate) continue;
    const existing = byKey.get(candidate.key);
    if (existing) existing.strategies.push(strategy);
    else byKey.set(candidate.key, { candidate, strategies: [strategy] });
  }

  return [...byKey.values()].map(({ candidate, strategies }) => {
    const [primaryStrategy, ...alsoSatisfies] = strategies as [
      BalancingStrategy,
      ...BalancingStrategy[],
    ];

    return {
      strategy: primaryStrategy,
      alsoSatisfies,
      teams: candidate.assignment,
      canonicalKey: candidate.key,
      metrics: buildMetrics(candidate, ctx),
      affinityOutcomes: buildAffinityOutcomes(candidate, ctx, index, params),
      alerts: buildAlerts(candidate, ctx, params),
    };
  });
}

function buildMetrics(candidate: Candidate, ctx: EvaluationContext): BalancingMetrics {
  const strengths = teamStrengths(candidate.assignment, ctx);
  const { elite, beginner } = extremeCounts(candidate.assignment, ctx);

  return {
    teamStrengths: strengths,
    meanStrength: strengths.reduce((acc, v) => acc + v, 0) / (strengths.length || 1),
    stdDevStrength: stdDev(strengths),
    diffPct: candidate.diffPct,
    perSkill: perSkillSummaries(candidate.assignment, ctx),
    rankWiseCost: rankWiseCost(candidate.assignment, ctx),
    eliteCountsByTeam: elite,
    beginnerCountsByTeam: beginner,
    internalStdDevByTeam: internalStdDevs(candidate.assignment, ctx),
    positionCoverage: positionCoverage(candidate.assignment, ctx),
    repeatedPairs: candidate.repetition,
    affinityScore: candidate.affinity,
    primaryCost: candidate.primary,
    secondaryCost: candidate.secondary,
  };
}

// ---------------------------------------------------------------------------
// Explicação
// ---------------------------------------------------------------------------

/**
 * Motivo de uma preferência não atendida, por **contrafactual**: força-se o par
 * na mesma situação desejada, reotimiza-se, e mede-se a diferença percentual
 * resultante (§8 do doc do algoritmo).
 */
function buildAffinityOutcomes(
  candidate: Candidate,
  ctx: EvaluationContext,
  index: ConstraintIndex,
  params: BalancingParams,
): AffinityOutcome[] {
  const teamOf = new Map<string, number>();
  candidate.assignment.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));

  let counterfactualBudget = MAX_COUNTERFACTUALS;

  return ctx.affinities.map((edge) => {
    const a = teamOf.get(edge.fromPlayerId);
    const b = teamOf.get(edge.toPlayerId);
    const together = a !== undefined && a === b;
    const satisfied = edge.intensity > 0 ? together : edge.intensity < 0 ? !together : true;

    if (satisfied || edge.intensity === 0) {
      return {
        fromPlayerId: edge.fromPlayerId,
        toPlayerId: edge.toPlayerId,
        type: edge.type,
        intensity: edge.intensity,
        satisfied: true,
      };
    }

    // Restrição dura já explica o não atendimento sem precisar de contrafactual.
    if (index.apart.get(edge.fromPlayerId)?.has(edge.toPlayerId)) {
      return {
        fromPlayerId: edge.fromPlayerId,
        toPlayerId: edge.toPlayerId,
        type: edge.type,
        intensity: edge.intensity,
        satisfied: false,
        unsatisfiedReason: { kind: 'restricao' },
      };
    }

    const lockedA = index.lockedTeamOf.get(edge.fromPlayerId);
    const lockedB = index.lockedTeamOf.get(edge.toPlayerId);
    if (lockedA !== undefined && lockedB !== undefined && lockedA !== lockedB) {
      return {
        fromPlayerId: edge.fromPlayerId,
        toPlayerId: edge.toPlayerId,
        type: edge.type,
        intensity: edge.intensity,
        satisfied: false,
        unsatisfiedReason: { kind: 'bloqueio' },
      };
    }

    if (counterfactualBudget <= 0) {
      return {
        fromPlayerId: edge.fromPlayerId,
        toPlayerId: edge.toPlayerId,
        type: edge.type,
        intensity: edge.intensity,
        satisfied: false,
        unsatisfiedReason: { kind: 'desequilibrio' },
      };
    }

    counterfactualBudget--;
    const projectedDiffPct = projectDiffIfForced(edge, ctx, params);

    return {
      fromPlayerId: edge.fromPlayerId,
      toPlayerId: edge.toPlayerId,
      type: edge.type,
      intensity: edge.intensity,
      satisfied: false,
      unsatisfiedReason:
        projectedDiffPct === null
          ? { kind: 'capacidade' }
          : { kind: 'desequilibrio', projectedDiffPct },
    };
  });
}

/**
 * Reotimiza forçando a preferência e devolve o `diff%` resultante.
 * Roda uma busca reduzida — é uma projeção para explicação, não uma proposta.
 */
function projectDiffIfForced(
  edge: { fromPlayerId: string; toPlayerId: string; intensity: number },
  ctx: EvaluationContext,
  params: BalancingParams,
): number | null {
  const players = [...ctx.players.values()];

  try {
    const forcedIndex = buildConstraintIndex(
      players,
      [
        {
          playerAId: edge.fromPlayerId,
          playerBId: edge.toPlayerId,
          kind: edge.intensity > 0 ? 'must_be_together' : 'must_be_apart',
        },
      ],
      [],
      [],
      { teamCount: params.teamCount, teamSize: params.teamSize },
    );

    const prng = createPrng(0x5eed);
    const candidates = constructCandidates(ctx, forcedIndex, prng, {
      teamCount: params.teamCount,
      teamSize: params.teamSize,
      allowUnevenTeams: params.allowUnevenTeams,
      randomRestarts: 8,
    });

    const cost = createDiffPctEvaluator(ctx, buildFastIndex(ctx));

    let best = Number.POSITIVE_INFINITY;
    for (const candidate of candidates.slice(0, 8)) {
      const improved = localImprove(candidate, ctx, forcedIndex, cost, 6, false);
      best = Math.min(best, cost(improved));
    }

    return Number.isFinite(best) ? best : null;
  } catch {
    // Restrição forçada tornou o problema insatisfazível: a preferência não cabe.
    return null;
  }
}

function buildAlerts(
  candidate: Candidate,
  ctx: EvaluationContext,
  params: BalancingParams,
): FormationAlert[] {
  const alerts: FormationAlert[] = [];

  if (candidate.diffPct > params.maxImbalancePct + 1e-9) {
    alerts.push({
      code: 'limite_desequilibrio_nao_atingido',
      message:
        `A diferença estimada é de ${candidate.diffPct.toFixed(1)}%, acima do limite ` +
        `configurado de ${params.maxImbalancePct}%.`,
    });
  }

  for (const coverage of positionCoverage(candidate.assignment, ctx)) {
    if (coverage.missingTeamIndexes.length === 0) continue;
    alerts.push({
      code: 'posicao_nao_coberta',
      message: `Nenhum atleta cobre a posição exigida "${coverage.position}" em ${
        coverage.missingTeamIndexes.length === 1 ? 'um time' : 'mais de um time'
      }.`,
      teamIndexes: coverage.missingTeamIndexes,
    });
  }

  const provisional = [...ctx.players.values()].filter((p) => p.isProvisional).map((p) => p.id);
  if (provisional.length > 0) {
    alerts.push({
      code: 'atleta_provisorio',
      message:
        `${provisional.length} ${provisional.length === 1 ? 'atleta está' : 'atletas estão'} ` +
        'com avaliação provisória — o equilíbrio calculado pode mudar após a revisão.',
      playerIds: provisional,
    });
  }

  const unrated = [...ctx.strengths.values()].filter((s) => s.isUnrated).map((s) => s.playerId);
  if (unrated.length > 0) {
    alerts.push({
      code: 'atleta_sem_avaliacao',
      message:
        `${unrated.length} ${unrated.length === 1 ? 'atleta ainda não tem' : 'atletas ainda não têm'} ` +
        'avaliação oficial; foi usada a mediana do grupo como estimativa.',
      playerIds: unrated,
    });
  }

  return alerts;
}

function explainBlockers(
  input: BalancingInput,
  index: ConstraintIndex,
  params: BalancingParams,
): string[] {
  const blockers: string[] = [];

  const mandatory = input.constraints.length;
  if (mandatory > 0) {
    blockers.push(
      `${mandatory} ${mandatory === 1 ? 'restrição obrigatória limita' : 'restrições obrigatórias limitam'} as combinações possíveis.`,
    );
  }

  if (index.lockedTeamOf.size > 0) {
    blockers.push(
      `${index.lockedTeamOf.size} ${index.lockedTeamOf.size === 1 ? 'atleta está bloqueado' : 'atletas estão bloqueados'} em um time específico.`,
    );
  }

  if (params.requiredPositions.length > 0) {
    blockers.push(
      `A exigência de cobrir ${params.requiredPositions.join(', ')} em todos os times restringe as trocas.`,
    );
  }

  blockers.push(
    'A distribuição de níveis dos atletas confirmados não permite times mais próximos que isso.',
  );

  return blockers;
}
