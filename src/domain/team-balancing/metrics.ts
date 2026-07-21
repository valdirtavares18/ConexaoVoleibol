import { SKILL_CODES, type PositionCode } from '@/domain/positions';
import { skillValueForBalance, type PlayerStrength } from './strength';
import type {
  AffinityEdge,
  BalancingParams,
  BalancingPlayer,
  BalancingWeights,
  PositionCoverage,
  TeamSkillSummary,
} from './types';

/** Uma solução candidata: para cada time, os ids dos seus membros. */
export type Assignment = readonly (readonly string[])[];

export interface EvaluationContext {
  players: ReadonlyMap<string, BalancingPlayer>;
  strengths: ReadonlyMap<string, PlayerStrength>;
  weights: BalancingWeights;
  params: BalancingParams;
  /** Arestas de afinidade indexadas por `from|to`. */
  affinities: readonly AffinityEdge[];
  recentPairings: Readonly<Record<string, number>>;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

/** `(max − min) / média × 100`. Zero quando a média é zero (grupo vazio). */
export function diffPercent(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  if (m === 0) return 0;
  return ((Math.max(...values) - Math.min(...values)) / m) * 100;
}

// ---------------------------------------------------------------------------
// Componentes do custo
// ---------------------------------------------------------------------------

export function teamStrengths(assignment: Assignment, ctx: EvaluationContext): number[] {
  return assignment.map((team) =>
    team.reduce((acc, id) => acc + (ctx.strengths.get(id)?.value ?? 0), 0),
  );
}

export function perSkillSummaries(
  assignment: Assignment,
  ctx: EvaluationContext,
): TeamSkillSummary[] {
  return SKILL_CODES.map((code) => {
    const totals = assignment.map((team) =>
      team.reduce((acc, id) => {
        const strength = ctx.strengths.get(id);
        return acc + (strength ? skillValueForBalance(strength, code) : 0);
      }, 0),
    );
    return { code, totals, diffPct: diffPercent(totals) };
  });
}

/**
 * Desequilíbrio por posto: compara o k-ésimo atleta mais forte de cada time.
 * É a defesa direta contra "equilíbrio ilusório por soma" — §4.3(a) do doc.
 */
export function rankWiseCost(assignment: Assignment, ctx: EvaluationContext): number {
  const sorted = assignment.map((team) =>
    team
      .map((id) => ctx.strengths.get(id)?.value ?? 0)
      .sort((a, b) => b - a),
  );

  const maxSize = Math.max(0, ...sorted.map((team) => team.length));
  let cost = 0;

  for (let rank = 0; rank < maxSize; rank++) {
    const atRank = sorted
      .map((team) => team[rank])
      .filter((value): value is number => value !== undefined);
    if (atRank.length < 2) continue;
    cost += Math.max(...atRank) - Math.min(...atRank);
  }

  return cost;
}

export function extremeCounts(
  assignment: Assignment,
  ctx: EvaluationContext,
): { elite: number[]; beginner: number[] } {
  const elite: number[] = [];
  const beginner: number[] = [];

  for (const team of assignment) {
    let e = 0;
    let b = 0;
    for (const id of team) {
      const value = ctx.strengths.get(id)?.value ?? 0;
      if (value >= ctx.weights.eliteThreshold) e++;
      if (value <= ctx.weights.beginnerThreshold) b++;
    }
    elite.push(e);
    beginner.push(b);
  }

  return { elite, beginner };
}

export function internalStdDevs(assignment: Assignment, ctx: EvaluationContext): number[] {
  return assignment.map((team) => stdDev(team.map((id) => ctx.strengths.get(id)?.value ?? 0)));
}

/** Um atleta cobre a posição se a joga (principal/secundária), não a rejeita e tem nota suficiente. */
export function playerCoversPosition(
  player: BalancingPlayer,
  position: PositionCode,
  minRating: number,
): boolean {
  if (player.unwantedPositions.includes(position)) return false;

  const plays =
    player.primaryPosition === position ||
    player.secondaryPositions.includes(position) ||
    player.primaryPosition === 'coringa';
  if (!plays) return false;

  const rating = player.positionRatings[position];
  // Sem nota de posição, a declaração do atleta basta: falta de dado não vira
  // ausência de cobertura.
  if (rating === null || rating === undefined) return true;
  return rating >= minRating;
}

export function positionCoverage(
  assignment: Assignment,
  ctx: EvaluationContext,
): PositionCoverage[] {
  return ctx.params.requiredPositions.map((position) => {
    const countsByTeam = assignment.map(
      (team) =>
        team.filter((id) => {
          const player = ctx.players.get(id);
          return (
            player !== undefined &&
            playerCoversPosition(player, position, ctx.params.minPositionRatingForCoverage)
          );
        }).length,
    );

    const missingTeamIndexes = countsByTeam
      .map((count, index) => (count === 0 ? index : -1))
      .filter((index) => index >= 0);

    return { position, countsByTeam, missingTeamIndexes };
  });
}

/**
 * Escore de afinidade. Positivo é bom.
 *
 * - Preferência positiva conta quando os dois estão no **mesmo** time.
 * - Preferência negativa conta quando estão em times **diferentes**; quando
 *   estão juntos, subtrai com o multiplicador negativo aplicado.
 * - Relações mútuas (mesmo sinal nas duas direções) ganham bônus.
 */
export function affinityScore(assignment: Assignment, ctx: EvaluationContext): number {
  const teamOf = new Map<string, number>();
  assignment.forEach((team, index) => team.forEach((id) => teamOf.set(id, index)));

  const byDirected = new Map<string, number>();
  for (const edge of ctx.affinities) {
    byDirected.set(`${edge.fromPlayerId}|${edge.toPlayerId}`, edge.intensity);
  }

  let score = 0;

  for (const edge of ctx.affinities) {
    const a = teamOf.get(edge.fromPlayerId);
    const b = teamOf.get(edge.toPlayerId);
    if (a === undefined || b === undefined) continue;

    const together = a === b;
    const typeWeight =
      edge.type === 'pessoal'
        ? ctx.weights.personalAffinityWeight
        : ctx.weights.tacticalAffinityWeight;

    const reverse = byDirected.get(`${edge.toPlayerId}|${edge.fromPlayerId}`);
    const isMutual = reverse !== undefined && Math.sign(reverse) === Math.sign(edge.intensity);
    const mutualFactor = isMutual ? 1 + ctx.weights.mutualAffinityBonus : 1;

    const magnitude = Math.abs(edge.intensity) * typeWeight * mutualFactor;

    if (edge.intensity > 0) {
      score += together ? magnitude : -magnitude;
    } else if (edge.intensity < 0) {
      const weighted = magnitude * ctx.weights.negativeAffinityMultiplier;
      score += together ? -weighted : weighted;
    }
  }

  return score;
}

export function repeatedPairCost(assignment: Assignment, ctx: EvaluationContext): number {
  let cost = 0;
  for (const team of assignment) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        cost += ctx.recentPairings[pairKey(team[i] as string, team[j] as string)] ?? 0;
      }
    }
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Custos agregados
// ---------------------------------------------------------------------------

/**
 * Custo primário: cobertura de posições + equilíbrio geral + equilíbrio por
 * fundamento + distribuição. **Não** contém afinidade nem repetição — é o que
 * garante a lexicografia da §5.1 do doc.
 */
export function primaryCost(assignment: Assignment, ctx: EvaluationContext): number {
  const { weights } = ctx;
  const strengths = teamStrengths(assignment, ctx);

  const overall = diffPercent(strengths);
  const perSkill = mean(perSkillSummaries(assignment, ctx).map((s) => s.diffPct));
  const rank = rankWiseCost(assignment, ctx);
  const { elite, beginner } = extremeCounts(assignment, ctx);
  const extremes = variance(elite) + variance(beginner);
  const spread = stdDev(internalStdDevs(assignment, ctx));

  const missing = positionCoverage(assignment, ctx).reduce(
    (acc, coverage) => acc + coverage.missingTeamIndexes.length,
    0,
  );

  return (
    overall * weights.totalStrengthWeight +
    perSkill * weights.perSkillWeight +
    rank * weights.rankWiseWeight +
    extremes * weights.extremesWeight +
    spread * weights.internalSpreadWeight +
    missing * weights.positionCoverageWeight
  );
}

/** Custo secundário: afinidade e variação social. Só usado dentro do portão. */
export function secondaryCost(assignment: Assignment, ctx: EvaluationContext): number {
  return (
    -affinityScore(assignment, ctx) +
    repeatedPairCost(assignment, ctx) * ctx.weights.repetitionWeight
  );
}

export { mean, stdDev, variance };
