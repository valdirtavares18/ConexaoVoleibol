/**
 * Gerador pseudoaleatório semeado (mulberry32).
 *
 * O domínio **nunca** chama `Math.random()` nem `Date.now()`. Todo sorteio passa
 * por aqui, o que torna a formação de times totalmente reprodutível: mesma
 * entrada + mesma seed ⇒ mesmo resultado.
 */

export interface Prng {
  /** Float em [0, 1). */
  next(): number;
  /** Inteiro em [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt: (maxExclusive: number) => Math.floor(next() * maxExclusive),
  };
}

/** Fisher–Yates sobre uma cópia. Não muta a entrada. */
export function shuffled<T>(items: readonly T[], prng: Prng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = prng.nextInt(i + 1);
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Hash determinístico (FNV-1a 32 bits) de uma string.
 * Usado para derivar seeds estáveis a partir do id de um evento.
 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
