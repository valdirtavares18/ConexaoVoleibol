/**
 * Busca por texto tolerante a acentos.
 *
 * Num grupo brasileiro, metade dos nomes tem acento e ninguém digita "Otávio"
 * com acento numa caixa de busca. Comparar sem normalizar faria a busca falhar
 * exatamente nos nomes mais comuns.
 *
 * `NFD` separa a letra do sinal diacrítico, e o intervalo `̀-ͯ`
 * (combining diacritical marks) remove os sinais: `á` vira `a`.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** O termo aparece em algum dos campos informados? */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalize(query);
  if (needle === '') return true;

  return fields.some((field) => (field ? normalize(field).includes(needle) : false));
}
