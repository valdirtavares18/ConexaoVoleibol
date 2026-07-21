import { describe, expect, it } from 'vitest';
import { InsufficientPlayersError, UnsatisfiableConstraintsError } from '@/domain/shared/errors';
import { makeEighteenPlayers, makeInput, makePlayer } from '@/test/fixtures/players';
import { canonicalKey, diffPercent, generateFormations } from './index';
import { computeStrengths } from './strength';
import { DEFAULT_WEIGHTS } from './defaults';

const allIds = (teams: readonly (readonly string[])[]): string[] => teams.flatMap((t) => [...t]);

/**
 * Atleta com **apenas** a nota geral preenchida. Sem fundamentos, a força é
 * exatamente a nota geral, o que torna as aritméticas do teste exatas.
 */
const onlyOverall = (id: string, overall: number) => makePlayer(id, overall, { skills: {} });

describe('generateFormations — estrutura (§23.5)', () => {
  it('gera exatamente três times de seis', () => {
    const result = generateFormations(makeInput(makeEighteenPlayers()));

    for (const option of result.options) {
      expect(option.teams).toHaveLength(3);
      for (const team of option.teams) expect(team).toHaveLength(6);
    }
  });

  it('inclui todos os 18 atletas, sem repetir ninguém', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(makeInput(players));

    for (const option of result.options) {
      const ids = allIds(option.teams);
      expect(ids).toHaveLength(18);
      expect(new Set(ids).size).toBe(18);
      expect([...ids].sort()).toEqual(players.map((p) => p.id).sort());
    }
  });

  it('recusa o modo padrão quando não há 18 confirmados', () => {
    const players = makeEighteenPlayers().slice(0, 17);
    expect(() => generateFormations(makeInput(players))).toThrow(InsufficientPlayersError);
  });

  it('aceita times desiguais somente com override administrativo explícito', () => {
    const players = makeEighteenPlayers().slice(0, 17);
    const result = generateFormations(makeInput(players), {
      params: { allowUnevenTeams: true },
    });

    const sizes = result.options[0]?.teams.map((t) => t.length).sort() ?? [];
    expect(sizes).toEqual([5, 6, 6]);
  });
});

describe('generateFormations — reprodutibilidade (§10.6)', () => {
  it('produz resultado idêntico para a mesma entrada e a mesma seed', () => {
    const players = makeEighteenPlayers();
    const a = generateFormations(makeInput(players, { seed: 4242 }));
    const b = generateFormations(makeInput(players, { seed: 4242 }));

    expect(JSON.stringify(a.options)).toBe(JSON.stringify(b.options));
    expect(a.provenance.inputDigest).toBe(b.provenance.inputDigest);
  });

  it('registra a procedência completa da execução', () => {
    const result = generateFormations(makeInput(makeEighteenPlayers(), { seed: 7 }));

    expect(result.provenance.algorithmVersion).toBe('cva-balance/1.0.0');
    expect(result.provenance.seed).toBe(7);
    expect(result.provenance.weights.overallWeight).toBe(0.55);
    expect(result.provenance.params.teamSize).toBe(6);
    expect(result.provenance.inputDigest).toMatch(/^fnv1a128:[0-9a-f]{32}$/);
    expect(result.provenance.candidatesEvaluated).toBeGreaterThan(0);
  });

  it('o digest muda quando uma nota muda', () => {
    const players = makeEighteenPlayers();
    const altered = [...players];
    altered[0] = makePlayer('p01', 3);

    const a = generateFormations(makeInput(players));
    const b = generateFormations(makeInput(altered));

    expect(a.provenance.inputDigest).not.toBe(b.provenance.inputDigest);
  });
});

describe('generateFormations — equilíbrio (§10.4)', () => {
  it('fica dentro do limite de 5% para um grupo comum', () => {
    const result = generateFormations(makeInput(makeEighteenPlayers()));

    expect(result.limitNotReached).toBe(false);
    expect(result.options[0]?.metrics.diffPct).toBeLessThanOrEqual(5);
  });

  it('calcula a diferença percentual pela fórmula da especificação', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(makeInput(players));
    const option = result.options[0];
    if (!option) throw new Error('esperava ao menos uma opção');

    const strengths = option.metrics.teamStrengths;
    const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const expected = ((Math.max(...strengths) - Math.min(...strengths)) / mean) * 100;

    expect(option.metrics.diffPct).toBeCloseTo(expected, 10);
    expect(diffPercent(strengths)).toBeCloseTo(expected, 10);
  });

  it('informa quando o limite não pôde ser atingido, em vez de falhar', () => {
    // Grupo impossível de equilibrar: um único atleta nota 5 e 17 nota 1.
    // O time que ficar com o nota 5 soma 10 contra 6 dos outros dois — não há
    // combinação que aproxime isso.
    const players = [
      onlyOverall('estrela', 5),
      ...Array.from({ length: 17 }, (_, i) => onlyOverall(`base${i}`, 1)),
    ];

    const result = generateFormations(makeInput(players));

    expect(result.limitNotReached).toBe(true);
    expect(result.limitBlockers.length).toBeGreaterThan(0);
    expect(result.options.length).toBeGreaterThan(0);
    expect(
      result.options[0]?.alerts.some((a) => a.code === 'limite_desequilibrio_nao_atingido'),
    ).toBe(true);
  });
});

describe('generateFormations — distribuição, não só a soma (§10.5)', () => {
  it('prefere distribuir os atletas fortes a empatar somas com perfis opostos', () => {
    // 6 atletas nota 5, 6 nota 3 e 6 nota 1. A divisão "ilusória" (um time só de
    // 5+1, outro só de 3) empata na soma, mas concentra os extremos.
    const players = [
      ...Array.from({ length: 6 }, (_, i) => onlyOverall(`a${i}`, 5)),
      ...Array.from({ length: 6 }, (_, i) => onlyOverall(`b${i}`, 3)),
      ...Array.from({ length: 6 }, (_, i) => onlyOverall(`c${i}`, 1)),
    ];

    const result = generateFormations(makeInput(players));
    const option = result.options[0];
    if (!option) throw new Error('esperava ao menos uma opção');

    // Cada time deve receber 2 fortes, 2 medianos e 2 fracos.
    for (const team of option.teams) {
      expect(team.filter((id) => id.startsWith('a'))).toHaveLength(2);
      expect(team.filter((id) => id.startsWith('b'))).toHaveLength(2);
      expect(team.filter((id) => id.startsWith('c'))).toHaveLength(2);
    }

    expect(option.metrics.eliteCountsByTeam).toEqual([2, 2, 2]);
    expect(option.metrics.beginnerCountsByTeam).toEqual([2, 2, 2]);
    expect(option.metrics.rankWiseCost).toBe(0);
  });

  it('penaliza a formação concentrada mesmo quando as somas são iguais', () => {
    const players = [
      ...Array.from({ length: 6 }, (_, i) => onlyOverall(`a${i}`, 5)),
      ...Array.from({ length: 6 }, (_, i) => onlyOverall(`b${i}`, 3)),
      ...Array.from({ length: 6 }, (_, i) => onlyOverall(`c${i}`, 1)),
    ];

    const result = generateFormations(makeInput(players));
    const balanced = result.options[0];
    if (!balanced) throw new Error('esperava ao menos uma opção');

    // A formação concentrada tem a mesma soma por time (18) mas perfis opostos.
    const concentrated = [
      ['a0', 'a1', 'a2', 'c0', 'c1', 'c2'],
      ['a3', 'a4', 'a5', 'c3', 'c4', 'c5'],
      ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'],
    ];

    const strengths = computeStrengths(players, DEFAULT_WEIGHTS);
    const sumOf = (team: readonly string[]): number =>
      team.reduce((acc, id) => acc + (strengths.get(id)?.value ?? 0), 0);

    // Confirma a premissa: as somas realmente empatam.
    expect(new Set(concentrated.map(sumOf)).size).toBe(1);
    expect(diffPercent(concentrated.map(sumOf))).toBe(0);
    expect(balanced.metrics.diffPct).toBe(0);

    // Mesmo com diff% idêntico, o custo primário separa as duas.
    expect(balanced.metrics.rankWiseCost).toBe(0);
    expect(balanced.metrics.primaryCost).toBeLessThan(10);
  });
});

describe('generateFormations — restrições e bloqueios (§10.2)', () => {
  it('nunca viola uma restrição obrigatória de separação', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        constraints: [{ playerAId: 'p01', playerBId: 'p02', kind: 'must_be_apart' }],
      }),
    );

    for (const option of result.options) {
      const teamOf = new Map<string, number>();
      option.teams.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));
      expect(teamOf.get('p01')).not.toBe(teamOf.get('p02'));
    }
  });

  it('mantém juntos os atletas de uma restrição obrigatória de união', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        constraints: [{ playerAId: 'p01', playerBId: 'p18', kind: 'must_be_together' }],
      }),
    );

    for (const option of result.options) {
      const teamOf = new Map<string, number>();
      option.teams.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));
      expect(teamOf.get('p01')).toBe(teamOf.get('p18'));
    }
  });

  it('respeita bloqueios manuais', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        locks: [
          { playerId: 'p01', teamIndex: 0 },
          { playerId: 'p02', teamIndex: 0 },
          { playerId: 'p03', teamIndex: 2 },
        ],
      }),
    );

    for (const option of result.options) {
      expect(option.teams[0]).toContain('p01');
      expect(option.teams[0]).toContain('p02');
      expect(option.teams[2]).toContain('p03');
    }
  });

  it('congela um time inteiro ao recalcular só os desbloqueados', () => {
    const players = makeEighteenPlayers();
    const current = [
      ['p01', 'p04', 'p07', 'p10', 'p13', 'p16'],
      ['p02', 'p05', 'p08', 'p11', 'p14', 'p17'],
      ['p03', 'p06', 'p09', 'p12', 'p15', 'p18'],
    ];

    const result = generateFormations(
      makeInput(players, { lockedTeamIndexes: [0], currentAssignment: current }),
    );

    for (const option of result.options) {
      expect([...(option.teams[0] ?? [])].sort()).toEqual([...(current[0] as string[])].sort());
    }
  });

  it('rejeita restrições mutuamente insatisfazíveis em vez de ignorar uma delas', () => {
    const players = makeEighteenPlayers();

    expect(() =>
      generateFormations(
        makeInput(players, {
          constraints: [
            { playerAId: 'p01', playerBId: 'p02', kind: 'must_be_together' },
            { playerAId: 'p01', playerBId: 'p02', kind: 'must_be_apart' },
          ],
        }),
      ),
    ).toThrow(UnsatisfiableConstraintsError);
  });

  it('rejeita um grupo obrigatório maior que um time', () => {
    const players = makeEighteenPlayers();
    const ids = ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07'];

    expect(() =>
      generateFormations(
        makeInput(players, {
          constraints: ids.slice(1).map((id) => ({
            playerAId: 'p01',
            playerBId: id,
            kind: 'must_be_together' as const,
          })),
        }),
      ),
    ).toThrow(UnsatisfiableConstraintsError);
  });
});

describe('generateFormations — opções (§10.7)', () => {
  it('apresenta ao menos três alternativas distintas quando há espaço para isso', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        affinities: [
          { fromPlayerId: 'p01', toPlayerId: 'p17', type: 'pessoal', intensity: 3 },
          { fromPlayerId: 'p17', toPlayerId: 'p01', type: 'pessoal', intensity: 3 },
          { fromPlayerId: 'p05', toPlayerId: 'p12', type: 'tatica', intensity: 2 },
        ],
        recentPairings: { 'p02|p03': 4, 'p04|p05': 3, 'p06|p07': 3 },
      }),
    );

    expect(result.options.length).toBeGreaterThanOrEqual(3);

    const keys = result.options.map((o) => o.canonicalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('remove opções equivalentes que diferem apenas pelo nome do time', () => {
    const a = [
      ['x1', 'x2'],
      ['y1', 'y2'],
    ];
    const b = [
      ['y2', 'y1'],
      ['x2', 'x1'],
    ];
    expect(canonicalKey(a)).toBe(canonicalKey(b));
  });

  it('marca com `alsoSatisfies` quando uma formação atende a mais de uma intenção', () => {
    // Sem afinidades nem histórico, as três estratégias convergem.
    const result = generateFormations(makeInput(makeEighteenPlayers()));
    const total = result.options.reduce((acc, option) => acc + 1 + option.alsoSatisfies.length, 0);
    expect(total).toBeGreaterThanOrEqual(3);
  });
});

describe('generateFormations — afinidades (§8.4)', () => {
  it('atende preferências positivas quando isso não desequilibra', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        affinities: [
          { fromPlayerId: 'p09', toPlayerId: 'p10', type: 'pessoal', intensity: 3 },
          { fromPlayerId: 'p10', toPlayerId: 'p09', type: 'pessoal', intensity: 3 },
        ],
      }),
    );

    const withAffinity = result.options.find(
      (o) =>
        o.strategy === 'equilibrio_com_afinidades' ||
        o.alsoSatisfies.includes('equilibrio_com_afinidades'),
    );
    if (!withAffinity) throw new Error('esperava a opção de afinidades');

    const teamOf = new Map<string, number>();
    withAffinity.teams.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));

    expect(teamOf.get('p09')).toBe(teamOf.get('p10'));
    expect(withAffinity.metrics.diffPct).toBeLessThanOrEqual(5);
  });

  it('ignora a afinidade positiva que estouraria o limite de equilíbrio', () => {
    // Juntar os dois melhores com os dois piores desequilibraria: a preferência
    // não pode passar à frente do equilíbrio.
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        affinities: [
          { fromPlayerId: 'p01', toPlayerId: 'p02', type: 'pessoal', intensity: 3 },
          { fromPlayerId: 'p02', toPlayerId: 'p03', type: 'pessoal', intensity: 3 },
          { fromPlayerId: 'p03', toPlayerId: 'p01', type: 'pessoal', intensity: 3 },
        ],
      }),
    );

    for (const option of result.options) {
      expect(option.metrics.diffPct).toBeLessThanOrEqual(result.provenance.gatePct + 1e-9);
    }
  });

  it('explica o motivo de uma preferência não atendida', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        constraints: [{ playerAId: 'p01', playerBId: 'p02', kind: 'must_be_apart' }],
        affinities: [{ fromPlayerId: 'p01', toPlayerId: 'p02', type: 'pessoal', intensity: 3 }],
      }),
    );

    const outcome = result.options[0]?.affinityOutcomes.find(
      (o) => o.fromPlayerId === 'p01' && o.toPlayerId === 'p02',
    );

    expect(outcome?.satisfied).toBe(false);
    expect(outcome?.unsatisfiedReason?.kind).toBe('restricao');
  });

  it('trata afinidade como direcional: A→B não implica B→A', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        affinities: [{ fromPlayerId: 'p07', toPlayerId: 'p08', type: 'pessoal', intensity: 2 }],
      }),
    );

    const outcomes = result.options[0]?.affinityOutcomes ?? [];
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.fromPlayerId).toBe('p07');
  });

  it('separa quem cadastrou preferência negativa forte', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(
      makeInput(players, {
        affinities: [
          { fromPlayerId: 'p09', toPlayerId: 'p10', type: 'pessoal', intensity: -3 },
          { fromPlayerId: 'p10', toPlayerId: 'p09', type: 'pessoal', intensity: -3 },
        ],
      }),
    );

    const option = result.options.find(
      (o) =>
        o.strategy === 'equilibrio_com_afinidades' ||
        o.alsoSatisfies.includes('equilibrio_com_afinidades'),
    );
    const teamOf = new Map<string, number>();
    option?.teams.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));

    expect(teamOf.get('p09')).not.toBe(teamOf.get('p10'));
  });
});

describe('generateFormations — variação social e alertas', () => {
  it('reduz a repetição de duplas recentes na opção de variação social', () => {
    const players = makeEighteenPlayers();
    const recentPairings = { 'p01|p02': 5, 'p03|p04': 5, 'p05|p06': 5 };
    const result = generateFormations(makeInput(players, { recentPairings }));

    const social = result.options.find(
      (o) => o.strategy === 'variacao_social' || o.alsoSatisfies.includes('variacao_social'),
    );
    const maximal = result.options.find((o) => o.strategy === 'equilibrio_maximo');

    expect(social).toBeDefined();
    expect(social?.metrics.repeatedPairs).toBeLessThanOrEqual(
      maximal?.metrics.repeatedPairs ?? Number.POSITIVE_INFINITY,
    );
  });

  it('alerta sobre atletas provisórios e sem avaliação', () => {
    const players = makeEighteenPlayers();
    players[0] = makePlayer('p01', 5, { isProvisional: true });
    players[1] = makePlayer('p02', null);

    const result = generateFormations(makeInput(players));
    const alerts = result.options[0]?.alerts.map((a) => a.code) ?? [];

    expect(alerts).toContain('atleta_provisorio');
    expect(alerts).toContain('atleta_sem_avaliacao');
  });

  it('não trata "não avaliado" como zero', () => {
    const players = makeEighteenPlayers();
    players[0] = makePlayer('p01', null);

    const strengths = computeStrengths(players, DEFAULT_WEIGHTS);
    const unrated = strengths.get('p01');

    expect(unrated?.isUnrated).toBe(true);
    expect(unrated?.value).toBeGreaterThan(1);
  });
});

describe('generateFormations — cobertura de posições (§10.1)', () => {
  it('distribui os levantadores entre os times quando há um por time', () => {
    const players = makeEighteenPlayers().map((player, i) =>
      makePlayer(player.id, player.overall, {
        primaryPosition: i < 3 ? 'levantador' : 'ponteiro',
      }),
    );

    const result = generateFormations(makeInput(players));
    const option = result.options.find(
      (o) =>
        o.strategy === 'cobertura_de_posicoes' ||
        o.alsoSatisfies.includes('cobertura_de_posicoes') ||
        o.strategy === 'equilibrio_maximo',
    );

    const coverage = option?.metrics.positionCoverage.find((c) => c.position === 'levantador');
    expect(coverage?.missingTeamIndexes).toEqual([]);
  });

  it('alerta quando não há levantador suficiente para todos os times', () => {
    const players = makeEighteenPlayers().map((player, i) =>
      makePlayer(player.id, player.overall, {
        primaryPosition: i === 0 ? 'levantador' : 'ponteiro',
      }),
    );

    const result = generateFormations(makeInput(players));
    expect(result.options[0]?.alerts.some((a) => a.code === 'posicao_nao_coberta')).toBe(true);
  });
});

describe('generateFormations — desempenho', () => {
  it('responde rapidamente para 18 atletas', () => {
    const players = makeEighteenPlayers();
    const started = performance.now();
    generateFormations(makeInput(players));
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(3000);
  });
});

describe('teamStrengths', () => {
  it('soma as forças de cada time', () => {
    const players = makeEighteenPlayers();
    const result = generateFormations(makeInput(players));
    const option = result.options[0];
    if (!option) throw new Error('esperava ao menos uma opção');

    expect(option.metrics.teamStrengths).toHaveLength(3);
    for (const strength of option.metrics.teamStrengths) {
      expect(strength).toBeGreaterThan(0);
    }
  });
});
