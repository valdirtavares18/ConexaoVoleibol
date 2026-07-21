export type TeamId = string;

/** Lado da quadra. Serve ao painel operacional: o time que fica não troca de lado. */
export type CourtSide = 'left' | 'right';

export interface RotationState {
  /** Número da **próxima** partida a ser disputada (1-based). */
  matchNumber: number;
  leftTeamId: TeamId;
  rightTeamId: TeamId;
  waitingTeamId: TeamId;
  /**
   * Partidas consecutivas já disputadas por cada time, **incluindo** a que está
   * prestes a começar. Quem entra chega com 1; quem permaneceu, com 2.
   */
  consecutiveByTeam: Readonly<Record<TeamId, number>>;
}

export interface MatchOutcome {
  /** Placar é opcional: o grupo nem sempre anota. */
  leftScore: number | null;
  rightScore: number | null;
  /** `null` significa empate — exige decisão do administrador na 1ª partida. */
  winnerTeamId: TeamId | null;
}

export interface CompleteMatchOptions {
  /**
   * Obrigatório quando a partida empata e nenhum time atingiu o limite de
   * partidas consecutivas: o administrador decide quem permanece.
   */
  stayingTeamIdOnTie?: TeamId;
  /**
   * Override manual do time que sai. Exige justificativa e gera auditoria
   * (§11.3 da especificação).
   */
  override?: {
    leavingTeamId: TeamId;
    justification: string;
  };
}

export interface MatchRecord {
  matchNumber: number;
  leftTeamId: TeamId;
  rightTeamId: TeamId;
  waitingTeamId: TeamId;
  leftScore: number | null;
  rightScore: number | null;
  winnerTeamId: TeamId | null;
  /** Time que saiu de quadra ao fim desta partida. */
  leavingTeamId: TeamId;
  /** Time que permaneceu em quadra. */
  stayingTeamId: TeamId;
  /** Time que entrou para a próxima partida. */
  enteringTeamId: TeamId;
  /** Por que este time saiu — usado na explicação do painel de quadra. */
  leaveReason: 'limite_consecutivas' | 'derrota' | 'empate_decidido' | 'override_manual';
  overrideJustification: string | null;
}

export interface CompleteMatchResult {
  record: MatchRecord;
  next: RotationState;
}

/** Limite de partidas consecutivas. Configurável; padrão 2 (§11.2). */
export const DEFAULT_MAX_CONSECUTIVE_MATCHES = 2;
