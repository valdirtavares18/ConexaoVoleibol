'use server';

import { eq, isNull, and } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { isDomainError } from '@/domain/shared/errors';
import type { AuthFormState } from '@/lib/action-state';
import { verifyPassword } from './password';
import { consumeRateLimit, clearRateLimit, pruneRateLimits, RATE_LIMITS } from './rate-limit';
import { createSession, destroySession } from './session';

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe o seu e-mail.')
    .email('Esse e-mail não parece válido.')
    .toLowerCase(),
  password: z.string().min(1, 'Informe a sua senha.'),
});

/**
 * Autenticação por e-mail e senha.
 *
 * Duas decisões de segurança que valem explicar:
 *
 *  1. **Mensagem genérica.** Credencial errada e e-mail inexistente devolvem a
 *     mesma mensagem, para não permitir enumeração de contas do grupo.
 *  2. **Rate limit por e-mail e por IP.** Limitar só por e-mail deixaria um
 *     atacante varrer muitas contas; limitar só por IP puniria o grupo inteiro
 *     atrás de uma mesma rede.
 */
export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      error: null,
      fieldErrors: {
        email: flat.email?.[0],
        password: flat.password?.[0],
      },
    };
  }

  const { email, password } = parsed.data;
  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';

  try {
    await consumeRateLimit(`login:email:${email}`, RATE_LIMITS.login);
    await consumeRateLimit(`login:ip:${ip}`, RATE_LIMITS.login);

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    const passwordOk = user ? await verifyPassword(user.passwordHash, password) : false;

    if (!user || !passwordOk) {
      return {
        error: 'E-mail ou senha incorretos.',
        fieldErrors: {},
      };
    }

    if (user.status === 'rejeitado' || user.status === 'desativado') {
      return {
        error: 'Sua conta não está ativa. Fale com um administrador do grupo.',
        fieldErrors: {},
      };
    }

    await clearRateLimit(`login:email:${email}`);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    await createSession({
      userId: user.id,
      userAgent: requestHeaders.get('user-agent'),
      ipAddress: ip,
    });

    // Oportunista: mantém a tabela de tentativas pequena sem precisar de cron.
    void pruneRateLimits().catch(() => undefined);
  } catch (error) {
    if (isDomainError(error)) {
      return { error: error.message, fieldErrors: {} };
    }
    throw error;
  }

  // `redirect` lança por design — precisa ficar fora do `try`, senão o `catch`
  // o trataria como falha de login.
  redirect('/app');
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/entrar');
}
