/**
 * Concatena classes ignorando valores falsos.
 *
 * Deliberadamente sem `tailwind-merge`: as variantes deste design system são
 * mutuamente exclusivas por construção, então não há conflito de classes para
 * resolver — e uma dependência a menos no bundle do cliente.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
