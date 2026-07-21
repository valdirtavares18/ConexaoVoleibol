import { UnsatisfiableConstraintsError } from '@/domain/shared/errors';
import type { Assignment } from './metrics';
import type { BalancingPlayer, HardConstraint, PlayerLock } from './types';

/**
 * Restrições duras pré-processadas. Ver §3 do doc do algoritmo: são filtros de
 * viabilidade, nunca penalidades — uma solução que viola qualquer uma delas
 * jamais é retornada.
 */
export interface ConstraintIndex {
  /** ids que **não podem** dividir time com a chave. */
  apart: ReadonlyMap<string, ReadonlySet<string>>;
  /** Grupos de atletas que **devem** ficar juntos (fecho transitivo). */
  togetherGroups: readonly (readonly string[])[];
  /** id → índice do grupo `togetherGroups`. */
  groupOfPlayer: ReadonlyMap<string, number>;
  /** id → índice de time fixado manualmente. */
  lockedTeamOf: ReadonlyMap<string, number>;
  lockedTeamIndexes: ReadonlySet<number>;
}

export function buildConstraintIndex(
  players: readonly BalancingPlayer[],
  constraints: readonly HardConstraint[],
  locks: readonly PlayerLock[],
  lockedTeamIndexes: readonly number[],
  params: { teamCount: number; teamSize: number },
): ConstraintIndex {
  const known = new Set(players.map((p) => p.id));

  // --- must_be_together: união disjunta para obter o fecho transitivo --------
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of known) parent.set(id, id);

  for (const constraint of constraints) {
    if (constraint.kind !== 'must_be_together') continue;
    if (!known.has(constraint.playerAId) || !known.has(constraint.playerBId)) continue;
    union(constraint.playerAId, constraint.playerBId);
  }

  const groupsByRoot = new Map<string, string[]>();
  for (const id of known) {
    const root = find(id);
    const bucket = groupsByRoot.get(root);
    if (bucket) bucket.push(id);
    else groupsByRoot.set(root, [id]);
  }

  const togetherGroups = [...groupsByRoot.values()]
    .map((group) => [...group].sort())
    .sort((a, b) => (a[0] as string).localeCompare(b[0] as string));

  const groupOfPlayer = new Map<string, number>();
  togetherGroups.forEach((group, index) => group.forEach((id) => groupOfPlayer.set(id, index)));

  // Um grupo obrigatório maior que um time é insatisfazível por construção.
  for (const group of togetherGroups) {
    if (group.length > params.teamSize) {
      throw new UnsatisfiableConstraintsError(
        `O grupo obrigatório com ${group.length} atletas não cabe em um time de ${params.teamSize}.`,
        { playerIds: group },
      );
    }
  }

  // --- must_be_apart --------------------------------------------------------
  const apart = new Map<string, Set<string>>();
  const addApart = (a: string, b: string): void => {
    const bucket = apart.get(a);
    if (bucket) bucket.add(b);
    else apart.set(a, new Set([b]));
  };

  for (const constraint of constraints) {
    if (constraint.kind !== 'must_be_apart') continue;
    if (!known.has(constraint.playerAId) || !known.has(constraint.playerBId)) continue;

    const groupA = groupOfPlayer.get(constraint.playerAId);
    const groupB = groupOfPlayer.get(constraint.playerBId);
    if (groupA !== undefined && groupA === groupB) {
      throw new UnsatisfiableConstraintsError(
        'Há uma restrição que exige separar dois atletas que outra restrição exige manter juntos.',
        { playerIds: [constraint.playerAId, constraint.playerBId], reason: constraint.reason },
      );
    }

    // "Separar" se propaga para os grupos inteiros: se A deve ficar longe de B
    // e B está obrigado a jogar com C, então A também não pode jogar com C.
    const membersA = groupA !== undefined ? (togetherGroups[groupA] as readonly string[]) : [constraint.playerAId];
    const membersB = groupB !== undefined ? (togetherGroups[groupB] as readonly string[]) : [constraint.playerBId];

    for (const a of membersA) {
      for (const b of membersB) {
        addApart(a, b);
        addApart(b, a);
      }
    }
  }

  // --- bloqueios manuais ----------------------------------------------------
  const lockedTeamOf = new Map<string, number>();
  for (const lock of locks) {
    if (!known.has(lock.playerId)) continue;
    if (lock.teamIndex < 0 || lock.teamIndex >= params.teamCount) {
      throw new UnsatisfiableConstraintsError(
        `Bloqueio aponta para um time inexistente (índice ${lock.teamIndex}).`,
        { playerId: lock.playerId },
      );
    }
    const existing = lockedTeamOf.get(lock.playerId);
    if (existing !== undefined && existing !== lock.teamIndex) {
      throw new UnsatisfiableConstraintsError(
        'O mesmo atleta está bloqueado em dois times diferentes.',
        { playerId: lock.playerId },
      );
    }
    lockedTeamOf.set(lock.playerId, lock.teamIndex);
  }

  // Bloqueios precisam ser coerentes entre si e com as restrições.
  const perTeam = new Map<number, string[]>();
  for (const [playerId, teamIndex] of lockedTeamOf) {
    const bucket = perTeam.get(teamIndex);
    if (bucket) bucket.push(playerId);
    else perTeam.set(teamIndex, [playerId]);
  }

  for (const [teamIndex, ids] of perTeam) {
    if (ids.length > params.teamSize) {
      throw new UnsatisfiableConstraintsError(
        `Há ${ids.length} atletas bloqueados no time ${teamIndex + 1}, que comporta ${params.teamSize}.`,
        { teamIndex, playerIds: ids },
      );
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (apart.get(ids[i] as string)?.has(ids[j] as string)) {
          throw new UnsatisfiableConstraintsError(
            'Dois atletas bloqueados no mesmo time têm uma restrição obrigatória de separação.',
            { teamIndex, playerIds: [ids[i], ids[j]] },
          );
        }
      }
    }
  }

  // Membros de um mesmo grupo obrigatório não podem estar travados em times diferentes.
  for (const group of togetherGroups) {
    const teams = new Set(
      group.map((id) => lockedTeamOf.get(id)).filter((t): t is number => t !== undefined),
    );
    if (teams.size > 1) {
      throw new UnsatisfiableConstraintsError(
        'Atletas que precisam jogar juntos estão bloqueados em times diferentes.',
        { playerIds: group },
      );
    }
  }

  return {
    apart,
    togetherGroups,
    groupOfPlayer,
    lockedTeamOf,
    lockedTeamIndexes: new Set(lockedTeamIndexes),
  };
}

/** O atleta pode entrar neste time sem violar restrição dura? */
export function canPlace(
  playerId: string,
  teamIndex: number,
  team: readonly string[],
  index: ConstraintIndex,
): boolean {
  const locked = index.lockedTeamOf.get(playerId);
  if (locked !== undefined && locked !== teamIndex) return false;
  if (index.lockedTeamIndexes.has(teamIndex) && locked === undefined) return false;

  const enemies = index.apart.get(playerId);
  if (enemies) {
    for (const member of team) {
      if (enemies.has(member)) return false;
    }
  }

  return true;
}

/** Verificação completa de uma solução: tamanhos, bloqueios e restrições. */
export function isFeasible(
  assignment: Assignment,
  index: ConstraintIndex,
  params: { teamCount: number; teamSize: number; allowUnevenTeams: boolean },
): boolean {
  if (assignment.length !== params.teamCount) return false;

  for (const team of assignment) {
    if (!params.allowUnevenTeams && team.length !== params.teamSize) return false;
    if (params.allowUnevenTeams && Math.abs(team.length - params.teamSize) > 1) return false;
  }

  const teamOf = new Map<string, number>();
  assignment.forEach((team, i) => team.forEach((id) => teamOf.set(id, i)));

  for (const [playerId, teamIndex] of index.lockedTeamOf) {
    if (teamOf.has(playerId) && teamOf.get(playerId) !== teamIndex) return false;
  }

  for (const group of index.togetherGroups) {
    if (group.length < 2) continue;
    const teams = new Set(group.map((id) => teamOf.get(id)).filter((t) => t !== undefined));
    if (teams.size > 1) return false;
  }

  for (const [playerId, enemies] of index.apart) {
    const team = teamOf.get(playerId);
    if (team === undefined) continue;
    for (const enemy of enemies) {
      if (teamOf.get(enemy) === team) return false;
    }
  }

  return true;
}

/** Atletas que a busca pode mover: nem travados individualmente, nem em time travado. */
export function movablePlayerIds(
  players: readonly BalancingPlayer[],
  index: ConstraintIndex,
): Set<string> {
  const movable = new Set<string>();
  for (const player of players) {
    const locked = index.lockedTeamOf.get(player.id);
    if (locked !== undefined) continue;
    movable.add(player.id);
  }
  return movable;
}
