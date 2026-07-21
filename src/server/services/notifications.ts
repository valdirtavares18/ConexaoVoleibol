import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, DbExecutor } from '@/db/client';
import { athleteAccountLinks, notifications, users } from '@/db/schema';
import { requireActive, type Actor } from '@/server/policies';
import { sendEmail, type EmailMessage } from '@/server/email/mailer';

/**
 * Comunicação com o grupo (§14).
 *
 * Duas camadas, e a ordem importa:
 *
 *  1. **Notificação no app** — grava no banco, dentro da mesma transação da ação
 *     que a originou. Se a ação reverter, o aviso não fica pendurado.
 *  2. **E-mail** — disparado **depois** do commit e sem `await` bloqueante. Um
 *     provedor lento ou fora do ar não pode segurar a resposta de "confirmar
 *     presença", nem fazer a transação expirar.
 */

export type NotificationKind =
  | 'comunicado'
  | 'novo_evento'
  | 'confirmacao_presenca'
  | 'lista_espera'
  | 'vaga_liberada'
  | 'times_publicados'
  | 'avaliacao_pendente'
  | 'revisao_provisoria';

export interface NotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string | null;
}

/** Grava a notificação. Deve ser chamada **dentro** da transação da ação. */
export async function createNotification(
  tx: DbExecutor,
  input: NotificationInput,
): Promise<void> {
  await tx.insert(notifications).values({
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
  });
}

export async function createNotifications(
  tx: DbExecutor,
  inputs: readonly NotificationInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  await tx.insert(notifications).values(
    inputs.map((input) => ({
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    })),
  );
}

/**
 * Dispara e-mails sem bloquear o chamador.
 *
 * Rejeições são registradas e engolidas de propósito: a ação de negócio já
 * aconteceu e não deve falhar retroativamente porque um e-mail não saiu.
 */
export function sendEmailsInBackground(messages: readonly EmailMessage[]): void {
  for (const message of messages) {
    void sendEmail(message).catch((error: unknown) => {
      console.error('Falha ao enviar e-mail em segundo plano:', error);
    });
  }
}

/** Conta e e-mail dos usuários ligados a estes atletas, para avisá-los. */
export async function resolveAccountsForAthletes(
  db: DbExecutor,
  athleteIds: readonly string[],
): Promise<{ athleteId: string; userId: string; email: string; name: string }[]> {
  if (athleteIds.length === 0) return [];

  return db
    .select({
      athleteId: athleteAccountLinks.athleteId,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(athleteAccountLinks)
    .innerJoin(users, eq(users.id, athleteAccountLinks.userId))
    .where(
      and(
        inArray(athleteAccountLinks.athleteId, [...athleteIds]),
        eq(athleteAccountLinks.status, 'aprovado'),
        eq(users.status, 'ativo'),
        isNull(users.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: Date;
}

export async function listNotifications(
  db: Database,
  params: { actor: Actor | null; limit?: number },
): Promise<NotificationView[]> {
  const active = requireActive(params.actor);

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, active.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(params.limit ?? 30);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  }));
}

export async function countUnread(db: Database, actor: Actor | null): Promise<number> {
  if (!actor || actor.status !== 'ativo') return 0;

  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));

  return row?.total ?? 0;
}

export async function markAllRead(db: Database, actor: Actor | null): Promise<void> {
  const active = requireActive(actor);

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, active.userId), isNull(notifications.readAt)));
}
