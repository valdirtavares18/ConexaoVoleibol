import { describe, expect, it } from 'vitest';
import { createPrng, shuffled } from '@/domain/shared/prng';
import { makeEighteenPlayers } from '@/test/fixtures/players';
import { buildConstraintIndex } from './constraints';
import { DEFAULT_PARAMS, DEFAULT_WEIGHTS } from './defaults';
import { buildFastIndex, createDiffPctEvaluator, createPrimaryCostEvaluator } from './fast';
import { diffPercent, primaryCost, teamStrengths, type EvaluationContext } from './metrics';
import { computeStrengths } from './strength';

function buildCtx(): EvaluationContext {
  const players = makeEighteenPlayers();
  return {
    players: new Map(players.map((p) => [p.id, p])),
    strengths: computeStrengths(players, DEFAULT_WEIGHTS),
    weights: DEFAULT_WEIGHTS,
    params: DEFAULT_PARAMS,
    affinities: [],
    recentPairings: {},
  };
}

/**
 * O avaliador rápido existe só por desempenho. Se ele divergir da implementação
 * legível, o algoritmo passa a otimizar uma métrica diferente da documentada —
 * por isso as duas são comparadas em formações aleatórias.
 */
describe('avaliador rápido × implementação de referência', () => {
  it('produz o mesmo custo primário para 200 formações aleatórias', () => {
    const ctx = buildCtx();
    const fast = createPrimaryCostEvaluator(ctx, buildFastIndex(ctx));
    const ids = [...ctx.players.keys()];
    const prng = createPrng(99);

    for (let i = 0; i < 200; i++) {
      const order = shuffled(ids, prng);
      const assignment = [order.slice(0, 6), order.slice(6, 12), order.slice(12, 18)];

      expect(fast(assignment)).toBeCloseTo(primaryCost(assignment, ctx), 9);
    }
  });

  it('produz a mesma diferença percentual', () => {
    const ctx = buildCtx();
    const fast = createDiffPctEvaluator(ctx, buildFastIndex(ctx));
    const ids = [...ctx.players.keys()];
    const prng = createPrng(1234);

    for (let i = 0; i < 200; i++) {
      const order = shuffled(ids, prng);
      const assignment = [order.slice(0, 6), order.slice(6, 12), order.slice(12, 18)];

      expect(fast(assignment)).toBeCloseTo(
        diffPercent(teamStrengths(assignment, ctx)),
        9,
      );
    }
  });
});

describe('restrições — índice', () => {
  it('propaga "separar" para todo o grupo obrigatório', () => {
    const players = makeEighteenPlayers();
    const index = buildConstraintIndex(
      players,
      [
        { playerAId: 'p01', playerBId: 'p02', kind: 'must_be_together' },
        { playerAId: 'p01', playerBId: 'p03', kind: 'must_be_apart' },
      ],
      [],
      [],
      { teamCount: 3, teamSize: 6 },
    );

    // p02 está obrigado a jogar com p01, que não pode jogar com p03.
    expect(index.apart.get('p02')?.has('p03')).toBe(true);
    expect(index.apart.get('p03')?.has('p02')).toBe(true);
  });
});
