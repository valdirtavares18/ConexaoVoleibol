/**
 * Política de senha, em módulo neutro.
 *
 * Fica separado de `src/server/auth/password.ts` porque **o formulário de
 * cadastro precisa deste número** para exibir a regra ao usuário — e aquele
 * módulo é `server-only` (carrega Argon2, que é nativo e não pode ir para o
 * bundle do cliente).
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_HINT =
  `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres. ` +
  'Uma frase curta que você lembre funciona melhor que uma palavra com símbolos.';
