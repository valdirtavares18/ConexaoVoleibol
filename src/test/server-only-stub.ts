/**
 * Substituto de `server-only` nos testes.
 *
 * O pacote real lança ao ser importado fora do ambiente de servidor do Next, o
 * que quebraria qualquer teste que toque num módulo marcado como server-only.
 * A proteção que interessa — impedir que um componente cliente importe código
 * de servidor — continua ativa no `next build`, que é onde ela vale.
 */
export {};
