/**
 * Quem está agindo. Todo acesso a dado sensível exige um `Actor` explícito —
 * não existe caminho de leitura "anônimo" para essas tabelas.
 *
 * Papéis **não são exclusivos**: um administrador também pode ser atleta, e
 * nesse caso `athleteId` está preenchido além de `roles` conter `admin`.
 */

export type Role = 'admin' | 'atleta';

export type UserStatus =
  'aguardando_aprovacao' | 'ativo' | 'ajustes_solicitados' | 'rejeitado' | 'desativado';

export interface Actor {
  userId: string;
  /** Perfil de atleta vinculado, quando existe. `null` para admin sem perfil. */
  athleteId: string | null;
  roles: readonly Role[];
  status: UserStatus;
}

/** Configurações que afetam decisões de visibilidade. */
export interface VisibilitySettings {
  /**
   * §4 — por padrão o atleta **não** vê a própria avaliação oficial.
   * Configuração administrativa que pode liberar isso no futuro.
   */
  selfOfficialEvaluationVisible: boolean;
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  selfOfficialEvaluationVisible: false,
};

export function isAdmin(actor: Actor | null): boolean {
  return actor?.roles.includes('admin') ?? false;
}

/** Conta liberada para usar o sistema. Cadastro pendente ainda não é. */
export function isActive(actor: Actor | null): boolean {
  return actor?.status === 'ativo';
}

export function isSelf(actor: Actor | null, athleteId: string): boolean {
  return actor?.athleteId !== null && actor?.athleteId === athleteId;
}
