import 'server-only';

import { and, eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db/client';
import { athleteAccountLinks, clubSettings } from '@/db/schema';
import { getSessionUser } from './auth/session';
import type { Actor, VisibilitySettings } from './policies';

/**
 * Contexto da requisição: quem está agindo e as configurações do clube.
 *
 * `cache()` do React memoiza por requisição, então várias chamadas ao longo da
 * árvore de componentes servidor resultam em uma única consulta ao banco.
 */

export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getSessionUser();
  if (!session) return null;

  const [link] = await db
    .select({ athleteId: athleteAccountLinks.athleteId })
    .from(athleteAccountLinks)
    .where(
      and(
        eq(athleteAccountLinks.userId, session.userId),
        eq(athleteAccountLinks.status, 'aprovado'),
      ),
    )
    .limit(1);

  return {
    userId: session.userId,
    athleteId: link?.athleteId ?? null,
    roles: session.roles,
    status: session.status,
  };
});

export type ClubSettings = typeof clubSettings.$inferSelect;

export const getClubSettings = cache(async (): Promise<ClubSettings> => {
  const [row] = await db.select().from(clubSettings).where(eq(clubSettings.id, 'default'));

  if (!row) {
    throw new Error(
      'Configurações do clube não encontradas. Rode `npm run db:seed` ou `npm run bootstrap:admin`.',
    );
  }

  return row;
});

export const getVisibilitySettings = cache(async (): Promise<VisibilitySettings> => {
  const settings = await getClubSettings();
  return { selfOfficialEvaluationVisible: settings.selfOfficialEvaluationVisible };
});

/** Limite de desequilíbrio em pontos percentuais, a partir dos basis points. */
export function maxImbalancePct(settings: ClubSettings): number {
  return settings.maxImbalanceBasisPoints / 100;
}
