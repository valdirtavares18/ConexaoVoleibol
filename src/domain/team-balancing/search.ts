import { SKILL_CODES, type SkillCode } from '@/domain/positions';
import { UnsatisfiableConstraintsError } from '@/domain/shared/errors';
import { shuffled, type Prng } from '@/domain/shared/prng';
import { canPlace, isFeasible, type ConstraintIndex } from './constraints';
import type { Assignment, EvaluationContext } from './metrics';
import { skillValueForBalance } from './strength';

/**
 * Unidade indivisível da busca: um atleta, ou um grupo que uma restrição
 * obrigatória manda manter junto. Tratar grupos como unidades atômicas mantém
 * a restrição satisfeita por construção em vez de por verificação.
 */
interface Unit {
  ids: readonly string[];
  strength: number;
  lockedTeamIndex: number | null;
}

export type CostFn = (assignment: Assignment) => number;

function buildUnits(ctx: EvaluationContext, index: ConstraintIndex): Unit[] {
  return index.togetherGroups.map((ids) => {
    const strength = ids.reduce((acc, id) => acc + (ctx.strengths.get(id)?.value ?? 0), 0);
    const lockedTeamIndex =
      ids.map((id) => index.lockedTeamOf.get(id)).find((t) => t !== undefined) ?? null;
    return { ids, strength, lockedTeamIndex };
  });
}

/**
 * Colocação por busca em profundidade com heurística de ordem de time.
 *
 * A DFS é exata dentro do orçamento de nós: se existe uma solução viável para as
 * restrições duras, ela é encontrada. A heurística só define *qual* solução
 * viável aparece primeiro, produzindo pontos de partida diferentes.
 */
function placeUnits(
  units: readonly Unit[],
  teamCount: number,
  capacities: readonly number[],
  index: ConstraintIndex,
  preferredTeams: (unit: Unit, step: number, teams: readonly string[][]) => number[],
  nodeBudget = 20_000,
): Assignment | null {
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  const remaining = [...capacities];
  let nodes = 0;

  const recurse = (step: number): boolean => {
    if (step === units.length) return true;
    if (++nodes > nodeBudget) return false;

    const unit = units[step] as Unit;

    const order =
      unit.lockedTeamIndex !== null ? [unit.lockedTeamIndex] : preferredTeams(unit, step, teams);

    for (const teamIndex of order) {
      const capacity = remaining[teamIndex] as number;
      if (capacity < unit.ids.length) continue;
      if (index.lockedTeamIndexes.has(teamIndex) && unit.lockedTeamIndex === null) continue;

      const team = teams[teamIndex] as string[];
      if (!unit.ids.every((id) => canPlace(id, teamIndex, team, index))) continue;

      team.push(...unit.ids);
      remaining[teamIndex] = capacity - unit.ids.length;

      if (recurse(step + 1)) return true;

      team.length -= unit.ids.length;
      remaining[teamIndex] = capacity;
    }

    return false;
  };

  return recurse(0) ? teams.map((team) => [...team]) : null;
}

function currentStrength(team: readonly string[], ctx: EvaluationContext): number {
  return team.reduce((acc, id) => acc + (ctx.strengths.get(id)?.value ?? 0), 0);
}

function byAscendingStrength(teams: readonly string[][], ctx: EvaluationContext): number[] {
  return teams
    .map((team, index) => ({ index, strength: currentStrength(team, ctx) }))
    .sort((a, b) => a.strength - b.strength || a.index - b.index)
    .map((entry) => entry.index);
}

/** Ordem serpentina: 0,1,2,2,1,0,0,1,2… */
function snakeTeamIndex(step: number, teamCount: number): number {
  const round = Math.floor(step / teamCount);
  const position = step % teamCount;
  return round % 2 === 0 ? position : teamCount - 1 - position;
}

export interface ConstructionOptions {
  teamCount: number;
  teamSize: number;
  allowUnevenTeams: boolean;
  randomRestarts: number;
}

/**
 * Constrói os candidatos iniciais (§6.2 do doc): serpentina, serpentinas por
 * fundamento, guloso por déficit e restarts aleatórios semeados.
 */
export function constructCandidates(
  ctx: EvaluationContext,
  index: ConstraintIndex,
  prng: Prng,
  options: ConstructionOptions,
): Assignment[] {
  const { teamCount, teamSize, allowUnevenTeams, randomRestarts } = options;
  const units = buildUnits(ctx, index);

  const totalPlayers = units.reduce((acc, unit) => acc + unit.ids.length, 0);
  const capacities = Array.from({ length: teamCount }, (_, i) => {
    if (!allowUnevenTeams) return teamSize;
    const base = Math.floor(totalPlayers / teamCount);
    return base + (i < totalPlayers % teamCount ? 1 : 0);
  });

  // Unidades maiores e travadas primeiro: mais restritas, falham mais cedo.
  const constrainedFirst = (a: Unit, b: Unit): number =>
    b.ids.length - a.ids.length ||
    (a.lockedTeamIndex === null ? 1 : 0) - (b.lockedTeamIndex === null ? 1 : 0);

  const byStrengthDesc = [...units].sort(
    (a, b) =>
      constrainedFirst(a, b) ||
      b.strength - a.strength ||
      (a.ids[0] as string).localeCompare(b.ids[0] as string),
  );

  const candidates: Assignment[] = [];
  const push = (assignment: Assignment | null): void => {
    if (assignment) candidates.push(assignment);
  };

  // 1. Serpentina clássica sobre a força.
  push(
    placeUnits(byStrengthDesc, teamCount, capacities, index, (_unit, step, teams) => {
      const preferred = snakeTeamIndex(step, teamCount);
      return [preferred, ...byAscendingStrength(teams, ctx).filter((i) => i !== preferred)];
    }),
  );

  // 2. Uma serpentina por fundamento: pontos de partida com perfis táticos distintos.
  for (const code of SKILL_CODES) {
    const bySkill = [...units].sort((a, b) => {
      const value = (unit: Unit): number =>
        unit.ids.reduce((acc, id) => {
          const strength = ctx.strengths.get(id);
          return acc + (strength ? skillValueForBalance(strength, code as SkillCode) : 0);
        }, 0);
      return (
        constrainedFirst(a, b) ||
        value(b) - value(a) ||
        (a.ids[0] as string).localeCompare(b.ids[0] as string)
      );
    });

    push(
      placeUnits(bySkill, teamCount, capacities, index, (_unit, step, teams) => {
        const preferred = snakeTeamIndex(step, teamCount);
        return [preferred, ...byAscendingStrength(teams, ctx).filter((i) => i !== preferred)];
      }),
    );
  }

  // 3. Guloso por déficit: cada unidade vai para o time mais fraco que a aceite.
  push(
    placeUnits(byStrengthDesc, teamCount, capacities, index, (_unit, _step, teams) =>
      byAscendingStrength(teams, ctx),
    ),
  );

  // 4. Restarts aleatórios semeados.
  for (let restart = 0; restart < randomRestarts; restart++) {
    const order = shuffled(units, prng).sort(constrainedFirst);
    push(
      placeUnits(order, teamCount, capacities, index, (_unit, _step, teams) => {
        const ascending = byAscendingStrength(teams, ctx);
        // Mistura leve: às vezes escolhe o segundo time mais fraco, gerando
        // diversidade sem abandonar o equilíbrio.
        return prng.next() < 0.3 ? shuffled(ascending, prng) : ascending;
      }),
    );
  }

  if (candidates.length === 0) {
    throw new UnsatisfiableConstraintsError(
      'Nenhuma combinação respeita simultaneamente todas as restrições obrigatórias e os bloqueios manuais.',
    );
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Melhoria local
// ---------------------------------------------------------------------------

function cloneAssignment(assignment: Assignment): string[][] {
  return assignment.map((team) => [...team]);
}

/**
 * Descida mais íngreme com trocas 2-opt e rotações 3-cíclicas (§6.3).
 * Só considera movimentos que mantêm a viabilidade das restrições duras.
 */
export function localImprove(
  start: Assignment,
  ctx: EvaluationContext,
  index: ConstraintIndex,
  cost: CostFn,
  maxPasses: number,
  /**
   * Rotações 3-cíclicas custam ~10× mais que as trocas de pares. São aplicadas
   * só na fase de refino dos melhores candidatos, não em todos os 30+ iniciais.
   */
  useThreeCycle = true,
): Assignment {
  const movable = (id: string): boolean => index.lockedTeamOf.get(id) === undefined;
  const teamMovable = (teamIndex: number): boolean => !index.lockedTeamIndexes.has(teamIndex);

  let current = cloneAssignment(start);
  let currentCost = cost(current);

  for (let pass = 0; pass < maxPasses; pass++) {
    let bestCost = currentCost;
    let bestMove: (() => string[][]) | null = null;

    // --- trocas entre dois times -------------------------------------------
    for (let a = 0; a < current.length; a++) {
      if (!teamMovable(a)) continue;
      for (let b = a + 1; b < current.length; b++) {
        if (!teamMovable(b)) continue;

        const teamA = current[a] as string[];
        const teamB = current[b] as string[];

        for (let i = 0; i < teamA.length; i++) {
          const x = teamA[i] as string;
          if (!movable(x)) continue;

          for (let j = 0; j < teamB.length; j++) {
            const y = teamB[j] as string;
            if (!movable(y)) continue;

            const restA = teamA.filter((_, k) => k !== i);
            const restB = teamB.filter((_, k) => k !== j);
            if (!canPlace(x, b, restB, index)) continue;
            if (!canPlace(y, a, restA, index)) continue;

            const next = cloneAssignment(current);
            (next[a] as string[])[i] = y;
            (next[b] as string[])[j] = x;

            const nextCost = cost(next);
            if (nextCost < bestCost - 1e-9) {
              bestCost = nextCost;
              bestMove = () => next;
            }
          }
        }
      }
    }

    // --- rotações de três times --------------------------------------------
    if (useThreeCycle && current.length >= 3) {
      for (let a = 0; a < current.length; a++) {
        for (let b = 0; b < current.length; b++) {
          if (b === a) continue;
          for (let c = 0; c < current.length; c++) {
            if (c === a || c === b) continue;
            if (!teamMovable(a) || !teamMovable(b) || !teamMovable(c)) continue;

            const teamA = current[a] as string[];
            const teamB = current[b] as string[];
            const teamC = current[c] as string[];

            for (let i = 0; i < teamA.length; i++) {
              const x = teamA[i] as string;
              if (!movable(x)) continue;
              for (let j = 0; j < teamB.length; j++) {
                const y = teamB[j] as string;
                if (!movable(y)) continue;
                for (let k = 0; k < teamC.length; k++) {
                  const z = teamC[k] as string;
                  if (!movable(z)) continue;

                  // x → B, y → C, z → A
                  const restA = teamA.filter((_, n) => n !== i);
                  const restB = teamB.filter((_, n) => n !== j);
                  const restC = teamC.filter((_, n) => n !== k);
                  if (!canPlace(x, b, restB, index)) continue;
                  if (!canPlace(y, c, restC, index)) continue;
                  if (!canPlace(z, a, restA, index)) continue;

                  const next = cloneAssignment(current);
                  (next[a] as string[])[i] = z;
                  (next[b] as string[])[j] = x;
                  (next[c] as string[])[k] = y;

                  const nextCost = cost(next);
                  if (nextCost < bestCost - 1e-9) {
                    bestCost = nextCost;
                    bestMove = () => next;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!bestMove) break;
    current = bestMove();
    currentCost = bestCost;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Canonicalização
// ---------------------------------------------------------------------------

/**
 * Chave canônica de uma formação. Times são conjuntos **não ordenados**: duas
 * soluções que diferem só por trocar "Time A" com "Time B" produzem a mesma
 * chave e são deduplicadas (§6.4).
 */
export function canonicalKey(assignment: Assignment): string {
  return assignment
    .map((team) => [...team].sort().join(','))
    .sort()
    .join(' || ');
}

/**
 * Ordena a formação de modo determinístico quando não há bloqueios — com
 * bloqueios, os índices dos times têm significado e são preservados.
 */
export function normalizeAssignment(assignment: Assignment, index: ConstraintIndex): string[][] {
  const sortedTeams = assignment.map((team) => [...team].sort());
  const hasLocks = index.lockedTeamOf.size > 0 || index.lockedTeamIndexes.size > 0;
  if (hasLocks) return sortedTeams;
  return sortedTeams.sort((a, b) => a.join(',').localeCompare(b.join(',')));
}

/** Quantos atletas estão em times diferentes entre duas formações (§6.5). */
export function assignmentDistance(a: Assignment, b: Assignment): number {
  const teamOfB = new Map<string, number>();
  b.forEach((team, i) => team.forEach((id) => teamOfB.set(id, i)));

  // Times não têm identidade: buscamos o melhor pareamento entre os times de
  // A e os de B, e contamos quantos atletas ficam fora dele.
  let bestMatched = 0;
  const permutations = permute(a.map((_, i) => i));

  for (const perm of permutations) {
    let matched = 0;
    a.forEach((team, i) => {
      const target = perm[i] as number;
      for (const id of team) {
        if (teamOfB.get(id) === target) matched++;
      }
    });
    bestMatched = Math.max(bestMatched, matched);
  }

  const total = a.reduce((acc, team) => acc + team.length, 0);
  return total - bestMatched;
}

function permute(items: readonly number[]): number[][] {
  if (items.length <= 1) return [[...items]];
  const result: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.filter((_, index) => index !== i);
    for (const tail of permute(rest)) result.push([items[i] as number, ...tail]);
  }
  return result;
}

export { isFeasible };
