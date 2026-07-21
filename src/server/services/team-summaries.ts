import { asc, eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { athletes, teamMembers, teams } from '@/db/schema';

export interface TeamSummary {
  id: string;
  index: number;
  name: string;
  colorToken: string;
  members: { id: string; displayName: string }[];
}

/**
 * Times de uma formação, com os nomes já resolvidos.
 *
 * Mora em módulo próprio porque é consumido tanto pelo painel de quadra quanto
 * pelo compartilhamento — e nenhum dos dois deveria depender do outro.
 */
export async function getPublishedFormationTeams(
  db: Database,
  formationId: string,
): Promise<TeamSummary[]> {
  const rows = await db
    .select({
      teamId: teams.id,
      teamIndex: teams.teamIndex,
      name: teams.name,
      colorToken: teams.colorToken,
      athleteId: athletes.id,
      fullName: athletes.fullName,
      nickname: athletes.nickname,
      shirtNumber: athletes.shirtNumber,
    })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .leftJoin(athletes, eq(athletes.id, teamMembers.athleteId))
    .where(eq(teams.formationId, formationId))
    .orderBy(asc(teams.teamIndex), asc(athletes.fullName));

  const byId = new Map<string, TeamSummary>();

  for (const row of rows) {
    const team = byId.get(row.teamId) ?? {
      id: row.teamId,
      index: row.teamIndex,
      name: row.name,
      colorToken: row.colorToken,
      members: [],
    };

    if (row.athleteId && row.fullName) {
      team.members.push({
        id: row.athleteId,
        displayName: row.nickname ?? row.fullName,
      });
    }

    byId.set(row.teamId, team);
  }

  return [...byId.values()].sort((a, b) => a.index - b.index);
}
