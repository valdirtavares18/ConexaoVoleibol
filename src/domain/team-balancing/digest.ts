import { hashString } from '@/domain/shared/prng';
import type { BalancingInput } from './types';

/**
 * Serialização **canônica** de um objeto: chaves ordenadas em todos os níveis.
 * Sem isso, a mesma entrada com ordem de chaves diferente geraria digests
 * diferentes e quebraria a promessa de reprodutibilidade.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Digest de 128 bits, puro TypeScript (quatro passadas FNV-1a com sementes
 * distintas). Não é criptográfico e não precisa ser: serve para provar que duas
 * execuções receberam a mesma entrada, não para resistir a adversário.
 */
export function digestOf(value: unknown): string {
  const json = canonicalJson(value);
  const parts = [0, 1, 2, 3].map((salt) =>
    hashString(`${salt}:${json}:${json.length}`).toString(16).padStart(8, '0'),
  );
  return `fnv1a128:${parts.join('')}`;
}

/**
 * Digest da entrada do algoritmo, normalizada: apenas o que afeta o resultado,
 * com listas ordenadas para que a ordem de leitura do banco não interfira.
 */
export function digestInput(input: BalancingInput): string {
  return digestOf({
    players: [...input.players]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((player) => ({
        id: player.id,
        overall: player.overall,
        skills: player.skills,
        positionRatings: player.positionRatings,
        primaryPosition: player.primaryPosition,
        secondaryPositions: [...player.secondaryPositions].sort(),
        unwantedPositions: [...player.unwantedPositions].sort(),
        isProvisional: player.isProvisional,
      })),
    constraints: [...input.constraints]
      .map((c) => ({ ...c, reason: undefined }))
      .sort((a, b) =>
        `${a.playerAId}${a.playerBId}${a.kind}`.localeCompare(
          `${b.playerAId}${b.playerBId}${b.kind}`,
        ),
      ),
    affinities: [...input.affinities].sort((a, b) =>
      `${a.fromPlayerId}${a.toPlayerId}${a.type}`.localeCompare(
        `${b.fromPlayerId}${b.toPlayerId}${b.type}`,
      ),
    ),
    locks: [...input.locks].sort((a, b) => a.playerId.localeCompare(b.playerId)),
    lockedTeamIndexes: [...input.lockedTeamIndexes].sort((a, b) => a - b),
    recentPairings: input.recentPairings,
    seed: input.seed,
  });
}
