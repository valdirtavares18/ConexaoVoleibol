import type { PositionCode, SkillCode } from '@/domain/positions';
import type { Rating } from '@/domain/shared/rating';

export const ALGORITHM_VERSION = 'cva-balance/1.0.0';

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Atleta já resolvido para o algoritmo: as notas aqui vêm **exclusivamente** da
 * avaliação oficial (definitiva ou provisória). Autoavaliação nunca chega aqui
 * — ver `docs/product-spec.md` §6.2.
 */
export interface BalancingPlayer {
  id: string;
  displayName: string;
  overall: Rating;
  skills: Readonly<Partial<Record<SkillCode, Rating>>>;
  positionRatings: Readonly<Partial<Record<PositionCode, Rating>>>;
  primaryPosition: PositionCode | null;
  secondaryPositions: readonly PositionCode[];
  /** Posições que o atleta prefere não jogar; não contam como cobertura. */
  unwantedPositions: readonly PositionCode[];
  /** Avaliação oficial ainda provisória — vira alerta na explicação. */
  isProvisional: boolean;
}

export type ConstraintKind = 'must_be_together' | 'must_be_apart';

/** Restrição obrigatória: filtro de viabilidade, nunca penalidade. */
export interface HardConstraint {
  playerAId: string;
  playerBId: string;
  kind: ConstraintKind;
  /** Texto do admin, usado na explicação de inviabilidade. */
  reason?: string;
}

export type AffinityType = 'pessoal' | 'tatica';

/** Preferência **direcional**: de `fromPlayerId` para `toPlayerId`. */
export interface AffinityEdge {
  fromPlayerId: string;
  toPlayerId: string;
  type: AffinityType;
  /** −3…+3. Positivo = quer jogar junto; negativo = prefere separado. */
  intensity: number;
}

/** Atleta fixado manualmente em um time (índice 0-based). */
export interface PlayerLock {
  playerId: string;
  teamIndex: number;
}

export interface BalancingWeights {
  /** Composição da força individual. Normalizados para somar 1. */
  overallWeight: number;
  skillsWeight: number;
  /** Peso de cada fundamento dentro da média de fundamentos. */
  skillWeights: Readonly<Record<SkillCode, number>>;

  /** Custo primário (equilíbrio). */
  totalStrengthWeight: number;
  perSkillWeight: number;
  rankWiseWeight: number;
  extremesWeight: number;
  internalSpreadWeight: number;
  positionCoverageWeight: number;

  /** Custo secundário (afinidade e variação). */
  personalAffinityWeight: number;
  tacticalAffinityWeight: number;
  negativeAffinityMultiplier: number;
  mutualAffinityBonus: number;
  repetitionWeight: number;

  /** Limiares de classificação de nível. */
  eliteThreshold: number;
  beginnerThreshold: number;
}

export interface BalancingParams {
  teamCount: number;
  teamSize: number;
  maxImbalancePct: number;
  /** Folga acima do melhor `diff%` alcançado, para o portão da fase B. */
  gateSlackPct: number;
  requiredPositions: readonly PositionCode[];
  /** Nota mínima na posição para contar como cobertura. */
  minPositionRatingForCoverage: number;
  /** Número de candidatos iniciais aleatórios semeados. */
  randomRestarts: number;
  /** Teto de passadas de melhoria local por candidato. */
  maxLocalSearchPasses: number;
  /** Distância mínima (atletas em times diferentes) entre opções retornadas. */
  minOptionDistance: number;
  /** Permite times de tamanhos diferentes — só via override administrativo. */
  allowUnevenTeams: boolean;
}

export interface BalancingInput {
  players: readonly BalancingPlayer[];
  constraints: readonly HardConstraint[];
  affinities: readonly AffinityEdge[];
  locks: readonly PlayerLock[];
  /** Índices de times inteiramente congelados. Exige `currentAssignment`. */
  lockedTeamIndexes: readonly number[];
  /**
   * Formação atual, quando se está **recalculando** em cima de uma existente.
   * Obrigatória se `lockedTeamIndexes` não estiver vazio — é dela que saem os
   * bloqueios implícitos dos membros dos times congelados.
   */
  currentAssignment?: readonly (readonly string[])[];
  /**
   * Quantas vezes cada dupla jogou junta recentemente, já com decaimento
   * aplicado. Chave: `menorId|maiorId`.
   */
  recentPairings: Readonly<Record<string, number>>;
  seed: number;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export interface TeamSkillSummary {
  code: SkillCode;
  totals: readonly number[];
  diffPct: number;
}

export interface PositionCoverage {
  position: PositionCode;
  /** Por time: quantos atletas cobrem essa posição. */
  countsByTeam: readonly number[];
  /** Índices de times que não cobrem a posição exigida. */
  missingTeamIndexes: readonly number[];
}

export interface AffinityOutcome {
  fromPlayerId: string;
  toPlayerId: string;
  type: AffinityType;
  intensity: number;
  satisfied: boolean;
  /** Presente apenas quando não atendida — calculado por contrafactual. */
  unsatisfiedReason?: {
    kind: 'desequilibrio' | 'restricao' | 'bloqueio' | 'capacidade';
    projectedDiffPct?: number;
  };
}

export interface BalancingMetrics {
  teamStrengths: readonly number[];
  meanStrength: number;
  stdDevStrength: number;
  diffPct: number;
  perSkill: readonly TeamSkillSummary[];
  rankWiseCost: number;
  eliteCountsByTeam: readonly number[];
  beginnerCountsByTeam: readonly number[];
  internalStdDevByTeam: readonly number[];
  positionCoverage: readonly PositionCoverage[];
  repeatedPairs: number;
  affinityScore: number;
  primaryCost: number;
  secondaryCost: number;
}

export type FormationAlertCode =
  | 'limite_desequilibrio_nao_atingido'
  | 'posicao_nao_coberta'
  | 'atleta_provisorio'
  | 'atleta_sem_avaliacao';

export interface FormationAlert {
  code: FormationAlertCode;
  message: string;
  playerIds?: readonly string[];
  teamIndexes?: readonly number[];
}

export type BalancingStrategy =
  'equilibrio_maximo' | 'equilibrio_com_afinidades' | 'variacao_social' | 'cobertura_de_posicoes';

export interface FormationOption {
  strategy: BalancingStrategy;
  /** Outras estratégias que resultaram nesta mesma formação. */
  alsoSatisfies: readonly BalancingStrategy[];
  /** Times como listas de ids, na ordem canônica. */
  teams: readonly (readonly string[])[];
  metrics: BalancingMetrics;
  affinityOutcomes: readonly AffinityOutcome[];
  alerts: readonly FormationAlert[];
  /** Chave canônica — igual para formações que diferem só pelo nome do time. */
  canonicalKey: string;
}

export interface BalancingProvenance {
  algorithmVersion: string;
  seed: number;
  weights: BalancingWeights;
  params: BalancingParams;
  inputDigest: string;
  candidatesEvaluated: number;
  bestAchievableDiffPct: number;
  gatePct: number;
}

export interface BalancingResult {
  options: readonly FormationOption[];
  provenance: BalancingProvenance;
  /** `true` quando nem a melhor combinação ficou abaixo do limite configurado. */
  limitNotReached: boolean;
  /** Explicação de por que o limite não foi atingido, quando aplicável. */
  limitBlockers: readonly string[];
}
