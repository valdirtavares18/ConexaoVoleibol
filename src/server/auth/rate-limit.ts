import 'server-only';

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rateLimitAttempts } from '@/db/schema';
import { DomainError } from '@/domain/shared/errors';

/**
 * Rate limit de autenticação e ações sensíveis (§20).
 *
 * O contador vive no **banco**, não em memória: na Vercel cada requisição pode
 * cair numa instância diferente, então um `Map` em memória não limitaria nada.
 */

export interface RateLimitRule {
  /** Tentativas permitidas dentro da janela. */
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  passwordReset: { limit: 4, windowMs: 60 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Registra a tentativa e lança quando o limite é excedido.
 *
 * Contamos **antes** de registrar para que a n-ésima tentativa ainda passe e a
 * (n+1)-ésima falhe — do contrário o limite efetivo seria `limit - 1`.
 */
export async function consumeRateLimit(bucketKey: string, rule: RateLimitRule): Promise<void> {
  const since = new Date(Date.now() - rule.windowMs);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rateLimitAttempts)
    .where(
      and(eq(rateLimitAttempts.bucketKey, bucketKey), gte(rateLimitAttempts.attemptedAt, since)),
    );

  if ((row?.count ?? 0) >= rule.limit) {
    throw new DomainError(
      'LIMITE_DE_TAXA',
      'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.',
      { bucketKey, retryAfterMs: rule.windowMs },
    );
  }

  await db.insert(rateLimitAttempts).values({ bucketKey });
}

/** Zera o contador — chamado após uma autenticação bem-sucedida. */
export async function clearRateLimit(bucketKey: string): Promise<void> {
  await db.delete(rateLimitAttempts).where(eq(rateLimitAttempts.bucketKey, bucketKey));
}

/** Limpeza de registros vencidos. Chamado oportunisticamente no login. */
export async function pruneRateLimits(olderThanMs = 24 * 60 * 60_000): Promise<void> {
  await db
    .delete(rateLimitAttempts)
    .where(lt(rateLimitAttempts.attemptedAt, new Date(Date.now() - olderThanMs)));
}
