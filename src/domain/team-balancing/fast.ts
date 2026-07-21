import { SKILL_CODES } from '@/domain/positions';
import { playerCoversPosition } from './metrics';
import type { Assignment, EvaluationContext } from './metrics';

/**
 * Caminho quente da busca.
 *
 * A busca local avalia dezenas de milhares de candidatos. As funções descritivas
 * de `metrics.ts` são otimizadas para legibilidade e alocam objetos a cada
 * chamada — perfeito para montar o relatório de uma formação, caro demais para o
 * laço interno.
 *
 * Aqui os mesmos números são calculados uma única vez em buffers pré-alocados,
 * indexados por posição inteira. As duas implementações são comparadas por teste
 * (`fast.test.ts`) para garantir que não divirjam.
 */
export interface FastIndex {
  playerIndex: ReadonlyMap<string, number>;
  playerCount: number;
  /** Força de cada atleta, indexada por `playerIndex`. */
  strength: Float64Array;
  /** Matriz `[skill][player]` achatada: `skills[s * playerCount + p]`. */
  skills: Float64Array;
  /** Matriz `[posiçãoExigida][player]` achatada, 1 quando o atleta cobre. */
  covers: Uint8Array;
  requiredPositionCount: number;
  skillCount: number;
}

export function buildFastIndex(ctx: EvaluationContext): FastIndex {
  const ids = [...ctx.players.keys()].sort();
  const playerIndex = new Map(ids.map((id, i) => [id, i]));
  const playerCount = ids.length;
  const skillCount = SKILL_CODES.length;
  const required = ctx.params.requiredPositions;

  const strength = new Float64Array(playerCount);
  const skills = new Float64Array(skillCount * playerCount);
  const covers = new Uint8Array(required.length * playerCount);

  ids.forEach((id, p) => {
    const playerStrength = ctx.strengths.get(id);
    const value = playerStrength?.value ?? 0;
    strength[p] = value;

    SKILL_CODES.forEach((code, s) => {
      // Fundamento não avaliado usa a força geral — ver `skillValueForBalance`.
      skills[s * playerCount + p] = playerStrength?.perSkill[code] ?? value;
    });

    const player = ctx.players.get(id);
    required.forEach((position, r) => {
      const ok =
        player !== undefined &&
        playerCoversPosition(player, position, ctx.params.minPositionRatingForCoverage);
      covers[r * playerCount + p] = ok ? 1 : 0;
    });
  });

  return {
    playerIndex,
    playerCount,
    strength,
    skills,
    covers,
    requiredPositionCount: required.length,
    skillCount,
  };
}

/** Buffers reutilizados entre avaliações — evita alocação no laço interno. */
interface Scratch {
  teamStrength: Float64Array;
  teamSkill: Float64Array;
  teamCovers: Int32Array;
  elite: Int32Array;
  beginner: Int32Array;
  sorted: Float64Array;
  teamSizes: Int32Array;
}

function makeScratch(teamCount: number, skillCount: number, maxTeamSize: number): Scratch {
  return {
    teamStrength: new Float64Array(teamCount),
    teamSkill: new Float64Array(skillCount * teamCount),
    teamCovers: new Int32Array(teamCount * 8),
    elite: new Int32Array(teamCount),
    beginner: new Int32Array(teamCount),
    sorted: new Float64Array(teamCount * maxTeamSize),
    teamSizes: new Int32Array(teamCount),
  };
}

function diffPct(values: Float64Array, count: number): number {
  if (count === 0) return 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const v = values[i] as number;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / count;
  if (mean === 0) return 0;
  return ((max - min) / mean) * 100;
}

function diffPctStrided(
  values: Float64Array,
  offset: number,
  count: number,
): number {
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const v = values[offset + i] as number;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / count;
  if (mean === 0) return 0;
  return ((max - min) / mean) * 100;
}

/**
 * Avaliador do custo primário com estado reutilizável.
 *
 * Criado uma vez por execução do algoritmo e chamado dezenas de milhares de
 * vezes. Retorna exatamente o mesmo valor que `primaryCost` de `metrics.ts`.
 */
export function createPrimaryCostEvaluator(
  ctx: EvaluationContext,
  fast: FastIndex,
): (assignment: Assignment) => number {
  const { weights, params } = ctx;
  const teamCount = params.teamCount;
  const maxTeamSize = params.teamSize + 1;
  const scratch = makeScratch(teamCount, fast.skillCount, maxTeamSize);
  const { playerCount, strength, skills, covers, skillCount, requiredPositionCount } = fast;

  return (assignment: Assignment): number => {
    const {
      teamStrength,
      teamSkill,
      teamCovers,
      elite,
      beginner,
      sorted,
      teamSizes,
    } = scratch;

    teamStrength.fill(0);
    teamSkill.fill(0);
    teamCovers.fill(0);
    elite.fill(0);
    beginner.fill(0);
    teamSizes.fill(0);

    for (let t = 0; t < teamCount; t++) {
      const team = assignment[t] as readonly string[];
      teamSizes[t] = team.length;

      for (let m = 0; m < team.length; m++) {
        const p = fast.playerIndex.get(team[m] as string);
        if (p === undefined) continue;

        const value = strength[p] as number;
        teamStrength[t] = (teamStrength[t] as number) + value;
        sorted[t * maxTeamSize + m] = value;

        if (value >= weights.eliteThreshold) elite[t] = (elite[t] as number) + 1;
        if (value <= weights.beginnerThreshold) beginner[t] = (beginner[t] as number) + 1;

        for (let s = 0; s < skillCount; s++) {
          teamSkill[s * teamCount + t] =
            (teamSkill[s * teamCount + t] as number) + (skills[s * playerCount + p] as number);
        }

        for (let r = 0; r < requiredPositionCount; r++) {
          if (covers[r * playerCount + p] === 1) {
            teamCovers[r * teamCount + t] = (teamCovers[r * teamCount + t] as number) + 1;
          }
        }
      }
    }

    // --- equilíbrio geral ---------------------------------------------------
    const overall = diffPct(teamStrength, teamCount);

    // --- equilíbrio por fundamento -----------------------------------------
    let perSkillSum = 0;
    for (let s = 0; s < skillCount; s++) {
      perSkillSum += diffPctStrided(teamSkill, s * teamCount, teamCount);
    }
    const perSkill = skillCount === 0 ? 0 : perSkillSum / skillCount;

    // --- desequilíbrio por posto -------------------------------------------
    let rank = 0;
    for (let t = 0; t < teamCount; t++) {
      const size = teamSizes[t] as number;
      const base = t * maxTeamSize;
      // Inserção: times têm 6 elementos, é mais rápido que `Array.sort`.
      for (let i = 1; i < size; i++) {
        const key = sorted[base + i] as number;
        let j = i - 1;
        while (j >= 0 && (sorted[base + j] as number) < key) {
          sorted[base + j + 1] = sorted[base + j] as number;
          j--;
        }
        sorted[base + j + 1] = key;
      }
    }

    let maxSize = 0;
    for (let t = 0; t < teamCount; t++) maxSize = Math.max(maxSize, teamSizes[t] as number);

    for (let position = 0; position < maxSize; position++) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let seen = 0;
      for (let t = 0; t < teamCount; t++) {
        if (position >= (teamSizes[t] as number)) continue;
        const v = sorted[t * maxTeamSize + position] as number;
        if (v < min) min = v;
        if (v > max) max = v;
        seen++;
      }
      if (seen >= 2) rank += max - min;
    }

    // --- concentração de extremos ------------------------------------------
    const extremes = varianceOf(elite, teamCount) + varianceOf(beginner, teamCount);

    // --- dispersão interna --------------------------------------------------
    let spreadSum = 0;
    let spreadSquares = 0;
    for (let t = 0; t < teamCount; t++) {
      const size = teamSizes[t] as number;
      if (size === 0) continue;
      const base = t * maxTeamSize;
      let sum = 0;
      for (let i = 0; i < size; i++) sum += sorted[base + i] as number;
      const mean = sum / size;
      let sq = 0;
      for (let i = 0; i < size; i++) {
        const d = (sorted[base + i] as number) - mean;
        sq += d * d;
      }
      const sd = Math.sqrt(sq / size);
      spreadSum += sd;
      spreadSquares += sd * sd;
    }
    const spreadMean = spreadSum / teamCount;
    const spread = Math.sqrt(Math.max(0, spreadSquares / teamCount - spreadMean * spreadMean));

    // --- cobertura de posições ---------------------------------------------
    let missing = 0;
    for (let r = 0; r < requiredPositionCount; r++) {
      for (let t = 0; t < teamCount; t++) {
        if ((teamCovers[r * teamCount + t] as number) === 0) missing++;
      }
    }

    return (
      overall * weights.totalStrengthWeight +
      perSkill * weights.perSkillWeight +
      rank * weights.rankWiseWeight +
      extremes * weights.extremesWeight +
      spread * weights.internalSpreadWeight +
      missing * weights.positionCoverageWeight
    );
  };
}

function varianceOf(values: Int32Array, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += values[i] as number;
  const mean = sum / count;
  let sq = 0;
  for (let i = 0; i < count; i++) {
    const d = (values[i] as number) - mean;
    sq += d * d;
  }
  return sq / count;
}

/** Diferença percentual apenas das forças totais — usado para afiar o portão. */
export function createDiffPctEvaluator(
  ctx: EvaluationContext,
  fast: FastIndex,
): (assignment: Assignment) => number {
  const teamCount = ctx.params.teamCount;
  const buffer = new Float64Array(teamCount);

  return (assignment: Assignment): number => {
    buffer.fill(0);
    for (let t = 0; t < teamCount; t++) {
      const team = assignment[t] as readonly string[];
      let sum = 0;
      for (let m = 0; m < team.length; m++) {
        const p = fast.playerIndex.get(team[m] as string);
        if (p !== undefined) sum += fast.strength[p] as number;
      }
      buffer[t] = sum;
    }
    return diffPct(buffer, teamCount);
  };
}
