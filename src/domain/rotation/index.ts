import { RotationError } from '@/domain/shared/errors';
import {
  DEFAULT_MAX_CONSECUTIVE_MATCHES,
  type CompleteMatchOptions,
  type CompleteMatchResult,
  type MatchOutcome,
  type MatchRecord,
  type RotationState,
  type TeamId,
} from './types';

export * from './types';

/**
 * Rodízio de três times (§11 da especificação).
 *
 * Regras, em ordem de precedência:
 *  1. Um time nunca joga mais de `maxConsecutive` partidas seguidas. Ao completar
 *     a última permitida, ele sai — tenha vencido ou perdido.
 *  2. Fora disso, o vencedor permanece e o perdedor sai.
 *  3. Empate sem ninguém no limite: o administrador decide quem permanece.
 *
 * Consequência que vale registrar: a partir da 2ª partida a regra 1 sempre
 * decide sozinha, porque um dos dois times em quadra chegou permanecendo (2
 * consecutivas) e o outro acabou de entrar (1). O resultado só importa de fato
 * na primeira partida.
 */

export interface RotationConfig {
  maxConsecutiveMatches: number;
}

export const DEFAULT_ROTATION_CONFIG: RotationConfig = {
  maxConsecutiveMatches: DEFAULT_MAX_CONSECUTIVE_MATCHES,
};

/**
 * Estado inicial: os dois primeiros times entram em quadra, o terceiro aguarda.
 */
export function startSession(teamIds: readonly [TeamId, TeamId, TeamId]): RotationState {
  const unique = new Set(teamIds);
  if (unique.size !== 3) {
    throw new RotationError('O rodízio precisa de três times distintos.');
  }

  const [left, right, waiting] = teamIds;

  return {
    matchNumber: 1,
    leftTeamId: left,
    rightTeamId: right,
    waitingTeamId: waiting,
    consecutiveByTeam: { [left]: 1, [right]: 1, [waiting]: 0 },
  };
}

/** Times que atingiram o limite e são obrigados a sair ao fim da partida atual. */
export function teamsAtConsecutiveLimit(
  state: RotationState,
  config: RotationConfig = DEFAULT_ROTATION_CONFIG,
): TeamId[] {
  return [state.leftTeamId, state.rightTeamId].filter(
    (teamId) => (state.consecutiveByTeam[teamId] ?? 0) >= config.maxConsecutiveMatches,
  );
}

/**
 * O time que já se sabe que vai sair, **independentemente do resultado**.
 * `null` quando a decisão depende de quem vencer.
 */
export function forcedLeavingTeam(
  state: RotationState,
  config: RotationConfig = DEFAULT_ROTATION_CONFIG,
): TeamId | null {
  const atLimit = teamsAtConsecutiveLimit(state, config);
  return atLimit.length === 1 ? (atLimit[0] as TeamId) : null;
}

/** Empate exige decisão do administrador? */
export function tieRequiresDecision(
  state: RotationState,
  config: RotationConfig = DEFAULT_ROTATION_CONFIG,
): boolean {
  return forcedLeavingTeam(state, config) === null;
}

function resolveLeaving(
  state: RotationState,
  outcome: MatchOutcome,
  options: CompleteMatchOptions,
  config: RotationConfig,
): { leavingTeamId: TeamId; reason: MatchRecord['leaveReason'] } {
  const playing: TeamId[] = [state.leftTeamId, state.rightTeamId];

  if (options.override) {
    const { leavingTeamId, justification } = options.override;
    if (!playing.includes(leavingTeamId)) {
      throw new RotationError('O override precisa apontar um time que está em quadra.');
    }
    if (justification.trim().length < 3) {
      throw new RotationError('O override manual do rodízio exige uma justificativa.');
    }
    return { leavingTeamId, reason: 'override_manual' };
  }

  const atLimit = teamsAtConsecutiveLimit(state, config);

  if (atLimit.length === 1) {
    return { leavingTeamId: atLimit[0] as TeamId, reason: 'limite_consecutivas' };
  }

  if (atLimit.length === 2) {
    // Só alcançável por override manual anterior. Manter uma regra explícita é
    // melhor do que deixar o estado indefinido.
    if (!outcome.winnerTeamId) {
      throw new RotationError(
        'Os dois times atingiram o limite de partidas consecutivas e a partida empatou. ' +
          'Escolha manualmente quem sai.',
      );
    }
    const loser = playing.find((id) => id !== outcome.winnerTeamId) as TeamId;
    return { leavingTeamId: loser, reason: 'limite_consecutivas' };
  }

  if (outcome.winnerTeamId === null) {
    const staying = options.stayingTeamIdOnTie;
    if (!staying) {
      throw new RotationError(
        'A partida empatou. Escolha qual time permanece em quadra para seguir o rodízio.',
      );
    }
    if (!playing.includes(staying)) {
      throw new RotationError('O time escolhido para permanecer não está em quadra.');
    }
    const leaving = playing.find((id) => id !== staying) as TeamId;
    return { leavingTeamId: leaving, reason: 'empate_decidido' };
  }

  if (!playing.includes(outcome.winnerTeamId)) {
    throw new RotationError('O vencedor informado não está em quadra.');
  }

  const loser = playing.find((id) => id !== outcome.winnerTeamId) as TeamId;
  return { leavingTeamId: loser, reason: 'derrota' };
}

export function completeMatch(
  state: RotationState,
  outcome: MatchOutcome,
  options: CompleteMatchOptions = {},
  config: RotationConfig = DEFAULT_ROTATION_CONFIG,
): CompleteMatchResult {
  const { leavingTeamId, reason } = resolveLeaving(state, outcome, options, config);

  const stayingTeamId = (
    leavingTeamId === state.leftTeamId ? state.rightTeamId : state.leftTeamId
  ) as TeamId;
  const enteringTeamId = state.waitingTeamId;

  const record: MatchRecord = {
    matchNumber: state.matchNumber,
    leftTeamId: state.leftTeamId,
    rightTeamId: state.rightTeamId,
    waitingTeamId: state.waitingTeamId,
    leftScore: outcome.leftScore,
    rightScore: outcome.rightScore,
    winnerTeamId: outcome.winnerTeamId,
    leavingTeamId,
    stayingTeamId,
    enteringTeamId,
    leaveReason: reason,
    overrideJustification: options.override?.justification ?? null,
  };

  // Quem entra ocupa o lado de quem saiu — o time que fica não atravessa a quadra.
  const leavingWasLeft = leavingTeamId === state.leftTeamId;

  const next: RotationState = {
    matchNumber: state.matchNumber + 1,
    leftTeamId: leavingWasLeft ? enteringTeamId : stayingTeamId,
    rightTeamId: leavingWasLeft ? stayingTeamId : enteringTeamId,
    waitingTeamId: leavingTeamId,
    consecutiveByTeam: {
      [stayingTeamId]: (state.consecutiveByTeam[stayingTeamId] ?? 0) + 1,
      [enteringTeamId]: 1,
      [leavingTeamId]: 0,
    },
  };

  return { record, next };
}

/**
 * Desfaz a última partida restaurando exatamente o estado anterior.
 *
 * O estado é reconstruído a partir do registro da partida, e não de um snapshot
 * guardado à parte — assim não existe a possibilidade de o histórico e o estado
 * divergirem.
 */
export function undoLastMatch(records: readonly MatchRecord[]): RotationState {
  const last = records[records.length - 1];
  if (!last) {
    throw new RotationError('Não há partida registrada para corrigir.');
  }

  return {
    matchNumber: last.matchNumber,
    leftTeamId: last.leftTeamId,
    rightTeamId: last.rightTeamId,
    waitingTeamId: last.waitingTeamId,
    consecutiveByTeam: consecutiveBefore(records.slice(0, -1), last),
  };
}

/**
 * Reconstrói a contagem de consecutivas vigente **antes** da última partida,
 * relendo o histórico desde o início.
 */
function consecutiveBefore(
  previous: readonly MatchRecord[],
  target: MatchRecord,
): Record<TeamId, number> {
  if (previous.length === 0) {
    return {
      [target.leftTeamId]: 1,
      [target.rightTeamId]: 1,
      [target.waitingTeamId]: 0,
    };
  }

  const first = previous[0] as MatchRecord;
  const counts: Record<TeamId, number> = {
    [first.leftTeamId]: 1,
    [first.rightTeamId]: 1,
    [first.waitingTeamId]: 0,
  };

  for (const record of previous) {
    counts[record.stayingTeamId] = (counts[record.stayingTeamId] ?? 0) + 1;
    counts[record.enteringTeamId] = 1;
    counts[record.leavingTeamId] = 0;
  }

  return counts;
}

/** Confronto previsto para a partida seguinte, para exibição no painel. */
export function previewNextMatch(
  state: RotationState,
  config: RotationConfig = DEFAULT_ROTATION_CONFIG,
): {
  /** `true` quando o próximo confronto já está definido, independente do placar. */
  certain: boolean;
  leavingTeamId: TeamId | null;
  stayingTeamId: TeamId | null;
  enteringTeamId: TeamId;
  description: string;
} {
  const forced = forcedLeavingTeam(state, config);

  if (forced) {
    const staying = (
      forced === state.leftTeamId ? state.rightTeamId : state.leftTeamId
    ) as TeamId;

    return {
      certain: true,
      leavingTeamId: forced,
      stayingTeamId: staying,
      enteringTeamId: state.waitingTeamId,
      description:
        `Ao fim desta partida esse time sai por ter jogado ${config.maxConsecutiveMatches} ` +
        'seguidas, tenha vencido ou perdido.',
    };
  }

  return {
    certain: false,
    leavingTeamId: null,
    stayingTeamId: null,
    enteringTeamId: state.waitingTeamId,
    description: 'Quem perder sai e o time que está aguardando entra.',
  };
}
