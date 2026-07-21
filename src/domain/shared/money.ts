/**
 * Dinheiro em **centavos inteiros**. Nunca use ponto flutuante para valores
 * monetários — ver ADR-0003 e `docs/product-spec.md` §11.
 *
 * O tipo é nominal (branded) para que um `number` cru não passe por engano
 * onde se espera um valor monetário.
 */

declare const CentsBrand: unique symbol;

/** Valor monetário em centavos. Sempre inteiro; pode ser negativo (débito). */
export type Cents = number & { readonly [CentsBrand]: true };

export const ZERO_CENTS = 0 as Cents;

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Valor monetário deve ser inteiro em centavos, recebido: ${value}`);
  }
  return value as Cents;
}

/** Converte reais para centavos com arredondamento para o centavo mais próximo. */
export function reaisToCents(reais: number): Cents {
  if (!Number.isFinite(reais)) {
    throw new RangeError(`Valor em reais inválido: ${reais}`);
  }
  return cents(Math.round(reais * 100));
}

export function centsToReais(value: Cents): number {
  return value / 100;
}

export function addCents(...values: Cents[]): Cents {
  return cents(values.reduce<number>((acc, v) => acc + v, 0));
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

/** Multiplica por uma quantidade inteira (ex.: 18 atletas × R$ 10,00). */
export function multiplyCents(value: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity)) {
    throw new RangeError(`Quantidade deve ser inteira, recebido: ${quantity}`);
  }
  return cents(value * quantity);
}

export const clampNonNegative = (value: Cents): Cents => (value < 0 ? ZERO_CENTS : value);

/**
 * Rateio de um valor total entre N participantes **sem perder centavos**.
 * Os centavos de resto são distribuídos um a um entre os primeiros participantes,
 * garantindo que a soma das partes seja exatamente igual ao total.
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`Número de partes inválido: ${parts}`);
  }
  const base = Math.trunc(total / parts);
  const remainder = total - base * parts;
  const sign = remainder >= 0 ? 1 : -1;
  const spread = Math.abs(remainder);

  return Array.from({ length: parts }, (_, index) => cents(base + (index < spread ? sign : 0)));
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * ` ` (espaço não separável) e ` ` (espaço estreito não separável) são
 * o que o ICU insere entre "R$" e o número em pt-BR, variando conforme a versão
 * do Node. Isso quebra comparação de strings e aparece como caractere estranho
 * ao colar no WhatsApp, então normalizamos para espaço comum.
 */
const NON_BREAKING_SPACES = /[  ]/g;

export function formatCents(value: Cents): string {
  return BRL.format(centsToReais(value)).replace(NON_BREAKING_SPACES, ' ');
}
