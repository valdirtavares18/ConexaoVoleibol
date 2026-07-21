import { describe, expect, it } from 'vitest';
import { RotationError } from '@/domain/shared/errors';
import {
  completeMatch,
  forcedLeavingTeam,
  previewNextMatch,
  startSession,
  undoLastMatch,
  type MatchRecord,
  type RotationState,
} from './index';

const TEAMS = ['A', 'B', 'C'] as const;

const win = (teamId: string) => ({ leftScore: 25, rightScore: 20, winnerTeamId: teamId });
const tie = () => ({ leftScore: 20, rightScore: 20, winnerTeamId: null });

/** Confronto atual como par ordenado alfabeticamente, para comparação estável. */
const facing = (state: RotationState): string =>
  [state.leftTeamId, state.rightTeamId].sort().join(' x ');

describe('rodízio — sequência canônica da especificação (§23.6)', () => {
  it('segue exatamente a sequência com A vencendo a primeira partida', () => {
    let state = startSession(TEAMS);
    const records: MatchRecord[] = [];

    // Partida 1: A x B, C aguarda.
    expect(facing(state)).toBe('A x B');
    expect(state.waitingTeamId).toBe('C');

    // A vence e permanece.
    let step = completeMatch(state, win('A'), {});
    records.push(step.record);
    state = step.next;
    expect(step.record.leavingTeamId).toBe('B');
    expect(step.record.leaveReason).toBe('derrota');

    // Partida 2: A x C, B aguarda.
    expect(facing(state)).toBe('A x C');
    expect(state.waitingTeamId).toBe('B');
    expect(state.consecutiveByTeam['A']).toBe(2);

    // A sai obrigatoriamente, independentemente do resultado.
    expect(forcedLeavingTeam(state)).toBe('A');
    step = completeMatch(state, win('A'), {});
    records.push(step.record);
    state = step.next;
    expect(step.record.leavingTeamId).toBe('A');
    expect(step.record.leaveReason).toBe('limite_consecutivas');

    // Partida 3: B x C, A aguarda.
    expect(facing(state)).toBe('B x C');
    expect(state.waitingTeamId).toBe('A');

    // C sai obrigatoriamente: jogou as partidas 2 e 3.
    expect(forcedLeavingTeam(state)).toBe('C');
    step = completeMatch(state, win('C'), {});
    records.push(step.record);
    state = step.next;
    expect(step.record.leavingTeamId).toBe('C');

    // Partida 4: A x B, C aguarda.
    expect(facing(state)).toBe('A x B');
    expect(state.waitingTeamId).toBe('C');
    expect(state.matchNumber).toBe(4);
  });

  it('segue a sequência espelhada quando B vence a primeira partida', () => {
    let state = startSession(TEAMS);

    let step = completeMatch(state, win('B'), {});
    state = step.next;
    expect(step.record.leavingTeamId).toBe('A');
    expect(facing(state)).toBe('B x C');
    expect(state.waitingTeamId).toBe('A');

    // B sai obrigatoriamente na partida 2.
    expect(forcedLeavingTeam(state)).toBe('B');
    step = completeMatch(state, win('B'), {});
    state = step.next;
    expect(facing(state)).toBe('A x C');
    expect(state.waitingTeamId).toBe('B');

    // C sai obrigatoriamente na partida 3.
    expect(forcedLeavingTeam(state)).toBe('C');
    step = completeMatch(state, win('A'), {});
    state = step.next;
    expect(facing(state)).toBe('A x B');
    expect(state.waitingTeamId).toBe('C');
  });
});

describe('rodízio — invariantes (§11.2)', () => {
  it('nenhum time joga mais de duas partidas seguidas em 30 partidas', () => {
    let state = startSession(TEAMS);
    // Sequência de vencedores determinística e variada.
    const winners = ['A', 'B', 'C', 'C', 'A', 'B'];

    for (let i = 0; i < 30; i++) {
      const playing = [state.leftTeamId, state.rightTeamId];
      const winner = playing.includes(winners[i % winners.length] as string)
        ? (winners[i % winners.length] as string)
        : (playing[0] as string);

      for (const team of playing) {
        expect(state.consecutiveByTeam[team] ?? 0).toBeLessThanOrEqual(2);
      }

      state = completeMatch(state, win(winner), {}).next;
    }
  });

  it('nenhum time fica duas partidas seguidas aguardando', () => {
    let state = startSession(TEAMS);
    let previousWaiting: string | null = null;

    for (let i = 0; i < 30; i++) {
      if (previousWaiting !== null) {
        expect(state.waitingTeamId).not.toBe(previousWaiting);
      }
      previousWaiting = state.waitingTeamId;

      const winner = state.leftTeamId;
      state = completeMatch(state, win(winner), {}).next;
    }
  });

  it('cada time joga duas e descansa uma no regime estável', () => {
    let state = startSession(TEAMS);
    const played: Record<string, number> = { A: 0, B: 0, C: 0 };

    for (let i = 0; i < 30; i++) {
      played[state.leftTeamId] = (played[state.leftTeamId] ?? 0) + 1;
      played[state.rightTeamId] = (played[state.rightTeamId] ?? 0) + 1;
      state = completeMatch(state, win(state.leftTeamId), {}).next;
    }

    // 30 partidas × 2 times = 60 participações, divididas igualmente ±2.
    for (const team of TEAMS) {
      expect(played[team]).toBeGreaterThanOrEqual(18);
      expect(played[team]).toBeLessThanOrEqual(22);
    }
  });

  it('o time que permanece não troca de lado da quadra', () => {
    const state = startSession(TEAMS);
    const { record, next } = completeMatch(state, win('A'), {});

    expect(record.stayingTeamId).toBe('A');
    expect(next.leftTeamId).toBe('A');
    expect(next.rightTeamId).toBe('C');
  });
});

describe('rodízio — empate (§11.3)', () => {
  it('exige decisão do administrador no empate da primeira partida', () => {
    const state = startSession(TEAMS);
    expect(() => completeMatch(state, tie(), {})).toThrow(RotationError);
  });

  it('aplica a decisão do administrador no empate', () => {
    const state = startSession(TEAMS);
    const { record, next } = completeMatch(state, tie(), { stayingTeamIdOnTie: 'B' });

    expect(record.leavingTeamId).toBe('A');
    expect(record.leaveReason).toBe('empate_decidido');
    expect(next.waitingTeamId).toBe('A');
  });

  it('não exige decisão quando o limite de consecutivas já resolve', () => {
    let state = startSession(TEAMS);
    state = completeMatch(state, win('A'), {}).next;

    // A está na segunda consecutiva: sai mesmo empatando.
    const { record } = completeMatch(state, tie(), {});
    expect(record.leavingTeamId).toBe('A');
    expect(record.leaveReason).toBe('limite_consecutivas');
  });

  it('recusa um time fora de quadra como escolha do empate', () => {
    const state = startSession(TEAMS);
    expect(() => completeMatch(state, tie(), { stayingTeamIdOnTie: 'C' })).toThrow(RotationError);
  });
});

describe('rodízio — override manual (§11.3)', () => {
  it('permite override com justificativa e registra o motivo', () => {
    const state = startSession(TEAMS);
    const { record, next } = completeMatch(state, win('A'), {
      override: { leavingTeamId: 'A', justification: 'Dois atletas do time A precisaram sair.' },
    });

    expect(record.leavingTeamId).toBe('A');
    expect(record.leaveReason).toBe('override_manual');
    expect(record.overrideJustification).toBe('Dois atletas do time A precisaram sair.');
    expect(next.waitingTeamId).toBe('A');
  });

  it('recusa override sem justificativa', () => {
    const state = startSession(TEAMS);
    expect(() =>
      completeMatch(state, win('A'), {
        override: { leavingTeamId: 'A', justification: '  ' },
      }),
    ).toThrow(RotationError);
  });

  it('recusa override apontando time fora de quadra', () => {
    const state = startSession(TEAMS);
    expect(() =>
      completeMatch(state, win('A'), {
        override: { leavingTeamId: 'C', justification: 'motivo qualquer' },
      }),
    ).toThrow(RotationError);
  });
});

describe('rodízio — correção da última ação (§11.3)', () => {
  it('restaura exatamente o estado anterior', () => {
    const initial = startSession(TEAMS);
    const first = completeMatch(initial, win('A'), {});
    const second = completeMatch(first.next, win('A'), {});

    const restored = undoLastMatch([first.record, second.record]);

    expect(restored).toEqual(first.next);
  });

  it('restaura o estado inicial ao corrigir a primeira partida', () => {
    const initial = startSession(TEAMS);
    const first = completeMatch(initial, win('B'), {});

    expect(undoLastMatch([first.record])).toEqual(initial);
  });

  it('sobrevive a várias correções em sequência', () => {
    let state = startSession(TEAMS);
    const records: MatchRecord[] = [];
    const snapshots: RotationState[] = [state];

    for (let i = 0; i < 6; i++) {
      const step = completeMatch(state, win(state.leftTeamId), {});
      records.push(step.record);
      state = step.next;
      snapshots.push(state);
    }

    for (let i = records.length; i > 0; i--) {
      expect(undoLastMatch(records.slice(0, i))).toEqual(snapshots[i - 1]);
    }
  });

  it('recusa correção sem histórico', () => {
    expect(() => undoLastMatch([])).toThrow(RotationError);
  });
});

describe('rodízio — previsão do painel de quadra', () => {
  it('informa que o resultado decide na primeira partida', () => {
    const preview = previewNextMatch(startSession(TEAMS));
    expect(preview.certain).toBe(false);
    expect(preview.enteringTeamId).toBe('C');
  });

  it('informa quem sai quando o limite já decide', () => {
    const state = completeMatch(startSession(TEAMS), win('A'), {}).next;
    const preview = previewNextMatch(state);

    expect(preview.certain).toBe(true);
    expect(preview.leavingTeamId).toBe('A');
    expect(preview.stayingTeamId).toBe('C');
    expect(preview.enteringTeamId).toBe('B');
  });
});

describe('rodízio — validações de entrada', () => {
  it('recusa iniciar com times repetidos', () => {
    expect(() => startSession(['A', 'A', 'B'])).toThrow(RotationError);
  });

  it('recusa vencedor que não está em quadra', () => {
    const state = startSession(TEAMS);
    expect(() => completeMatch(state, win('C'), {})).toThrow(RotationError);
  });
});
