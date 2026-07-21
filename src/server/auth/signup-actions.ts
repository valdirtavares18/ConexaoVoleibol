'use server';

import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { athleteAccountLinks, athletes, passwordResetTokens, userRoles, users } from '@/db/schema';
import { isDomainError } from '@/domain/shared/errors';
import { PASSWORD_MIN_LENGTH } from '@/domain/shared/password-policy';
import type { AuthFormState } from '@/lib/action-state';
import { isEmailConfigured } from '@/server/email/mailer';
import { passwordResetEmail } from '@/server/email/templates';
import { sendEmailsInBackground } from '@/server/services/notifications';
import { hashPassword, validatePasswordStrength } from './password';
import { consumeRateLimit, RATE_LIMITS } from './rate-limit';
import { createSession, revokeAllSessions } from './session';

const signUpSchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o seu nome completo.').max(120),
    email: z.string().trim().toLowerCase().email('Esse e-mail não parece válido.'),
    phone: z.string().trim().max(20).optional(),
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      ),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não coincidem.',
    path: ['passwordConfirmation'],
  });

/**
 * Autocadastro (§5.1).
 *
 * A conta nasce `aguardando_aprovacao`. Se o e-mail ou o telefone coincidirem
 * com um perfil já criado pelo administrador, criamos uma **solicitação de
 * vínculo** em vez de um perfil novo — é o que evita duplicidade (§23.1).
 */
export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: null, fieldErrors };
  }

  const { name, email, phone, password } = parsed.data;
  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';

  try {
    await consumeRateLimit(`signup:ip:${ip}`, RATE_LIMITS.signup);
    validatePasswordStrength(password, [email, name]);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (existing) {
      // Mensagem neutra: não confirmamos a existência da conta para terceiros.
      return {
        error:
          'Se já houver um cadastro com esse e-mail, use "Esqueci minha senha" para recuperar o acesso.',
        fieldErrors: {},
      };
    }

    const passwordHash = await hashPassword(password);
    let createdUserId: string | null = null;

    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email, name, passwordHash, status: 'aguardando_aprovacao' })
        .returning({ id: users.id });

      const userId = user?.id as string;
      createdUserId = userId;
      await tx.insert(userRoles).values({ userId, role: 'atleta' });

      // Perfil gerenciado com o mesmo e-mail ou telefone: propõe o vínculo.
      const [match] = await tx
        .select({ id: athletes.id })
        .from(athletes)
        .where(
          and(
            isNull(athletes.deletedAt),
            phone ? eq(athletes.phone, phone) : eq(athletes.email, email),
          ),
        )
        .limit(1);

      if (match) {
        await tx
          .insert(athleteAccountLinks)
          .values({
            athleteId: match.id,
            userId,
            status: 'pendente',
            origin: 'reivindicacao',
          })
          .onConflictDoNothing();
      }
    });

    // Cria a sessão já no cadastro. Sem isto, `/aguardando-aprovacao` não
    // encontraria ator e devolveria a pessoa para a tela de login logo depois
    // de ela ter se cadastrado — sem explicação nenhuma. Os portões de `/app` e
    // `/admin` continuam barrando enquanto o status não for `ativo`.
    if (createdUserId) {
      await createSession({
        userId: createdUserId,
        userAgent: requestHeaders.get('user-agent'),
        ipAddress: ip,
      });
    }
  } catch (error) {
    if (isDomainError(error)) return { error: error.message, fieldErrors: {} };
    throw error;
  }

  redirect('/aguardando-aprovacao');
}

// ---------------------------------------------------------------------------
// Recuperação de acesso (§20)
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().email('Esse e-mail não parece válido.'),
});

/**
 * Solicita a recuperação de acesso.
 *
 * Responde **sempre** a mesma coisa, exista a conta ou não: qualquer diferença
 * permitiria descobrir quem faz parte do grupo. Guardamos apenas o hash do
 * token, nunca o token em claro.
 */
export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = requestResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: null, fieldErrors: { email: parsed.error.issues[0]?.message ?? '' } };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';

  const genericResponse: AuthFormState = {
    error: null,
    fieldErrors: {},
    ok: true,
    message:
      'Se existir uma conta com esse e-mail, um administrador do grupo poderá liberar a troca de senha. ' +
      'Procure alguém da organização para concluir.',
  };

  try {
    await consumeRateLimit(`reset:ip:${ip}`, RATE_LIMITS.passwordReset);
    await consumeRateLimit(`reset:email:${parsed.data.email}`, RATE_LIMITS.passwordReset);
  } catch (error) {
    if (isDomainError(error)) return { error: error.message, fieldErrors: {} };
    throw error;
  }

  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.email, parsed.data.email), isNull(users.deletedAt)))
    .limit(1);

  if (user) {
    const token = randomBytes(32).toString('base64url');

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    // Guardamos apenas o hash; o token em claro existe só nesta variável e no
    // e-mail. Envio em segundo plano: a resposta ao usuário é a mesma exista a
    // conta ou não, e não pode variar de tempo conforme o provedor responde.
    sendEmailsInBackground([
      passwordResetEmail({ to: parsed.data.email, name: user.name, token }),
    ]);
  }

  return {
    ...genericResponse,
    message: isEmailConfigured()
      ? 'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. ' +
        'O link vale por 1 hora.'
      : genericResponse.message,
  };
}

const resetSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(PASSWORD_MIN_LENGTH),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não coincidem.',
    path: ['passwordConfirmation'],
  });

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: null, fieldErrors };
  }

  const tokenHash = hashToken(parsed.data.token);

  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) {
    return {
      error: 'Este link de recuperação é inválido ou expirou. Solicite outro.',
      fieldErrors: {},
    };
  }

  try {
    validatePasswordStrength(parsed.data.password);
    const passwordHash = await hashPassword(parsed.data.password);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));
    });

    // Trocar a senha derruba todas as sessões: se houve acesso indevido, ele
    // termina aqui.
    await revokeAllSessions(record.userId);
    await createSession({ userId: record.userId });
  } catch (error) {
    if (isDomainError(error)) return { error: error.message, fieldErrors: {} };
    throw error;
  }

  redirect('/app');
}
