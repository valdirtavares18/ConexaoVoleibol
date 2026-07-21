import { DEFAULT_REQUIRED_POSITIONS, DEFAULT_SKILL_WEIGHTS } from '@/domain/positions';
import type { BalancingParams, BalancingWeights } from './types';

/**
 * Pesos e parâmetros padrão. Todos são sobrescritos por `club_settings` em
 * runtime — nada aqui é constante de negócio, apenas o ponto de partida.
 */
export const DEFAULT_WEIGHTS: BalancingWeights = {
  overallWeight: 0.55,
  skillsWeight: 0.45,
  skillWeights: DEFAULT_SKILL_WEIGHTS,

  totalStrengthWeight: 1,
  perSkillWeight: 0.35,
  rankWiseWeight: 0.5,
  extremesWeight: 0.4,
  internalSpreadWeight: 0.2,
  positionCoverageWeight: 25,

  personalAffinityWeight: 1,
  tacticalAffinityWeight: 0.8,
  negativeAffinityMultiplier: 1.8,
  mutualAffinityBonus: 0.25,
  repetitionWeight: 1,

  eliteThreshold: 4,
  beginnerThreshold: 2,
};

export const DEFAULT_PARAMS: BalancingParams = {
  teamCount: 3,
  teamSize: 6,
  maxImbalancePct: 5,
  gateSlackPct: 0.25,
  requiredPositions: DEFAULT_REQUIRED_POSITIONS,
  minPositionRatingForCoverage: 2.5,
  randomRestarts: 32,
  maxLocalSearchPasses: 8,
  minOptionDistance: 2,
  allowUnevenTeams: false,
};

export function resolveWeights(overrides?: Partial<BalancingWeights>): BalancingWeights {
  return {
    ...DEFAULT_WEIGHTS,
    ...overrides,
    skillWeights: { ...DEFAULT_WEIGHTS.skillWeights, ...overrides?.skillWeights },
  };
}

export function resolveParams(overrides?: Partial<BalancingParams>): BalancingParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}
