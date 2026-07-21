export * from './types';
export * from './defaults';
export { generateFormations, type GenerateOverrides } from './generate';
export { computeStrengths, type PlayerStrength } from './strength';
export {
  diffPercent,
  pairKey,
  primaryCost,
  secondaryCost,
  affinityScore,
  positionCoverage,
  teamStrengths,
  type Assignment,
  type EvaluationContext,
} from './metrics';
export { canonicalKey, assignmentDistance } from './search';
export { buildConstraintIndex, isFeasible, type ConstraintIndex } from './constraints';
export { digestInput, digestOf } from './digest';
