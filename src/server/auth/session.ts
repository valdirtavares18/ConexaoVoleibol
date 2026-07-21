import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { sessions, userRoles, users } from '@/db/schema';

/**
 * Sessão por cookie assinado + registro no banco.
 *
 * O cookie carrega **apenas** o id da sessão, assinado (HS256) para impedir
 * forja. A validade real é conferida no banco a cada requisição autenticada —
 * é isso que permite revogar acesso na hora ("sair de todos os aparelhos"),
 * o que um JWT auto-contido não permitiria. Ver ADR-0001.
 */

export const SESSION_COOKIE = 'cva_session';
const SESSION_DURATION_DAYS = 30;
const ISSUER = 'cva-gestao';

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'AUTH_SECRET ausente ou curta demais (mínimo 32 caracteres). Veja `.env.example`.',
    );
  }
  return new TextEncoder().encode(value);
}

async function signSessionToken(sessionId: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

async function readSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    const sid = payload.sid;
    return typeof sid === 'string' ? sid : null;
  } catch {
    // Assinatura inválida ou expirada: trata como "sem sessão", sem vazar o motivo.
    return null;
  }
}

export interface SessionUser {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  roles: readonly ('admin' | 'atleta')[];
  status: (typeof users.$inferSelect)['status'];
}

/** Cria a sessão no banco e grava o cookie. */
export async function createSession(params: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: params.userId,
    expiresAt,
    userAgent: params.userAgent ?? null,
    ipAddress: params.ipAddress ?? null,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSessionToken(sessionId, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Lê a sessão corrente. Retorna `null` quando não há sessão válida —
 * autorização é responsabilidade das policies, não desta função.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessionId = await readSessionToken(token);
  if (!sessionId) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, row.userId));

  return { ...row, roles: roleRows.map((r) => r.role) };
}

/** Revoga a sessão corrente e limpa o cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    const sessionId = await readSessionToken(token);
    if (sessionId) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
    }
  }

  jar.delete(SESSION_COOKIE);
}

/** Revoga todas as sessões de um usuário — usado ao trocar a senha. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
