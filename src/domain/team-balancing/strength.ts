import { SKILL_CODES, type SkillCode } from '@/domain/positions';
import { median, weightedMeanIgnoringNulls } from '@/domain/shared/rating';
import type { BalancingPlayer, BalancingWeights } from './types';

export interface PlayerStrength {
  playerId: string;
  /** Força na escala 1–5. */
  value: number;
  /** Força por fundamento (escala 1–5); `null` quando não avaliado. */
  perSkill: Readonly<Partial<Record<SkillCode, number>>>;
  /** Nenhum critério oficial avaliado — recebeu a mediana como estimativa. */
  isUnrated: boolean;
}

/**
 * Força de um atleta: combinação da nota geral oficial com a média ponderada dos
 * fundamentos, na mesma escala 1–5.
 *
 * Retorna `null` quando **nada** foi avaliado — o chamador substitui pela mediana
 * do grupo (§2.1 do doc do algoritmo). Nunca retorna 0 por falta de dado.
 */
function rawStrength(player: BalancingPlayer, weights: BalancingWeights): number | null {
  const skillsMean = weightedMeanIgnoringNulls(
    SKILL_CODES.map((code) => ({
      value: player.skills[code] ?? null,
      weight: weights.skillWeights[code] ?? 0,
    })),
  );

  const overall = player.overall;

  if (overall === null && skillsMean === null) return null;
  if (overall === null) return skillsMean;
  if (skillsMean === null) return overall;

  const total = weights.overallWeight + weights.skillsWeight;
  if (total <= 0) return overall;

  // Normaliza para que os pesos somem 1, mantendo a escala 1–5.
  return (overall * weights.overallWeight + skillsMean * weights.skillsWeight) / total;
}

/**
 * Calcula a força de todos os atletas de uma vez, porque atletas sem nenhuma
 * avaliação dependem da mediana dos demais.
 */
export function computeStrengths(
  players: readonly BalancingPlayer[],
  weights: BalancingWeights,
): Map<string, PlayerStrength> {
  const raw = players.map((player) => ({ player, value: rawStrength(player, weights) }));

  const ratedValues = raw
    .map((entry) => entry.value)
    .filter((value): value is number => value !== null);

  // Grupo inteiro sem avaliação: todos ficam no meio da escala, o que mantém o
  // algoritmo funcional e faz o alerta de "sem avaliação" aparecer para todos.
  const fallback = median(ratedValues) ?? 3;

  const result = new Map<string, PlayerStrength>();

  for (const { player, value } of raw) {
    const perSkill: Partial<Record<SkillCode, number>> = {};
    for (const code of SKILL_CODES) {
      const rating = player.skills[code];
      if (rating !== null && rating !== undefined) perSkill[code] = rating;
    }

    result.set(player.id, {
      playerId: player.id,
      value: value ?? fallback,
      perSkill,
      isUnrated: value === null,
    });
  }

  return result;
}

/**
 * Valor usado no equilíbrio por fundamento. Um fundamento não avaliado usa a
 * força geral do atleta como estimativa — melhor que zero (que puniria o time
 * do atleta apenas por falta de dado) e melhor que ignorar (que deixaria times
 * com contagens diferentes de fundamentos, tornando as somas incomparáveis).
 */
export function skillValueForBalance(strength: PlayerStrength, code: SkillCode): number {
  return strength.perSkill[code] ?? strength.value;
}
