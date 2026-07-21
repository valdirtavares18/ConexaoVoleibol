import { SKILL_CODES, type PositionCode, type SkillCode } from '@/domain/positions';
import type { BalancingInput, BalancingPlayer } from '@/domain/team-balancing';

/**
 * Fábrica de atletas para os testes do algoritmo. Determinística por construção:
 * nenhum valor depende de `Math.random()` ou do relógio.
 */
export function makePlayer(
  id: string,
  overall: number | null,
  options: Partial<Omit<BalancingPlayer, 'id' | 'overall'>> = {},
): BalancingPlayer {
  const skills: Partial<Record<SkillCode, number | null>> = {};
  if (overall !== null) {
    // Fundamentos oscilam em torno da nota geral de forma determinística, para
    // que o equilíbrio por fundamento tenha o que medir.
    SKILL_CODES.forEach((code, i) => {
      const delta = ((i % 3) - 1) * 0.5;
      skills[code] = Math.min(5, Math.max(1, overall + delta));
    });
  }

  return {
    id,
    displayName: id,
    overall,
    skills,
    positionRatings: {},
    primaryPosition: 'coringa',
    secondaryPositions: [],
    unwantedPositions: [],
    isProvisional: false,
    ...options,
  };
}

/** 18 atletas com níveis variados — o cenário padrão de um encontro do CVA. */
export function makeEighteenPlayers(): BalancingPlayer[] {
  const levels = [
    5, 4.5, 4.5, 4, 4, 4, 3.5, 3.5, 3.5, 3, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1,
  ] as const;

  const positions: PositionCode[] = [
    'levantador',
    'ponteiro',
    'central',
    'oposto',
    'libero',
    'ponteiro',
  ];

  return levels.map((overall, i) =>
    makePlayer(`p${String(i + 1).padStart(2, '0')}`, overall, {
      primaryPosition: positions[i % positions.length] as PositionCode,
    }),
  );
}

export function makeInput(
  players: readonly BalancingPlayer[],
  overrides: Partial<BalancingInput> = {},
): BalancingInput {
  return {
    players,
    constraints: [],
    affinities: [],
    locks: [],
    lockedTeamIndexes: [],
    recentPairings: {},
    seed: 20260721,
    ...overrides,
  };
}
