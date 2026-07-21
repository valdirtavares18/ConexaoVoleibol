/**
 * Escala de notas do CVA: 1,0 a 5,0 em incrementos de 0,5.
 *
 * `null` significa **"não avaliado"** e nunca deve ser tratado como zero.
 * Ver `docs/product-spec.md` §5.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATING_STEP = 0.5;

/** Nota válida, ou `null` para "não avaliado". */
export type Rating = number | null;

export const RATING_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

export function isValidRating(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < RATING_MIN || value > RATING_MAX) return false;
  // Evita erro de ponto flutuante ao checar o passo de 0,5.
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/**
 * Arredonda para o incremento válido mais próximo e trava dentro da escala.
 * Usado ao normalizar entrada de formulário e sugestões calculadas.
 */
export function clampToRatingStep(value: number): number {
  const clamped = Math.min(RATING_MAX, Math.max(RATING_MIN, value));
  return Math.round(clamped / RATING_STEP) * RATING_STEP;
}

/**
 * Média ponderada que **ignora** valores não avaliados e renormaliza os pesos
 * dos critérios restantes (§2.1 do documento do algoritmo).
 *
 * Retorna `null` quando nenhum critério foi avaliado — jamais 0.
 */
export function weightedMeanIgnoringNulls(
  entries: ReadonlyArray<{ value: Rating; weight: number }>,
): number | null {
  let sum = 0;
  let weightSum = 0;

  for (const entry of entries) {
    if (entry.value === null || entry.weight <= 0) continue;
    sum += entry.value * entry.weight;
    weightSum += entry.weight;
  }

  if (weightSum === 0) return null;
  return sum / weightSum;
}

/** Mediana de uma lista não vazia. Usada como estimativa neutra para não avaliados. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Rótulo curto usado na interface. Não é usado em cálculo. */
export function describeRating(value: Rating): string {
  if (value === null) return 'Não avaliado';
  if (value < 2) return 'Iniciante';
  if (value < 3) return 'Em evolução';
  if (value < 4) return 'Intermediário';
  if (value < 4.5) return 'Avançado';
  return 'Referência';
}
