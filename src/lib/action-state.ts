/**
 * Estado das server actions.
 *
 * Mora fora dos arquivos `'use server'` porque um módulo com essa diretiva só
 * pode exportar **funções async** — exportar um objeto de estado inicial de lá
 * quebra o build. Aqui o tipo e a constante ficam disponíveis para os dois
 * lados sem violar a regra.
 */

export interface ActionState {
  ok: boolean;
  message: string | null;
}

export const EMPTY_ACTION_STATE: ActionState = { ok: false, message: null };

/** Estado das actions de autenticação, que reportam erro por campo. */
export interface AuthFormState {
  error: string | null;
  fieldErrors: Partial<Record<string, string>>;
  ok?: boolean;
  message?: string;
}

export const EMPTY_AUTH_STATE: AuthFormState = { error: null, fieldErrors: {} };
