import { auditLogs } from '@/db/schema';
import type { DbExecutor } from '@/db/client';

/**
 * Registro de auditoria (§20).
 *
 * Recebe o executor para que o registro entre **na mesma transação** da ação que
 * o originou: se a operação falhar e reverter, não fica auditoria de algo que
 * não aconteceu.
 */
export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
}

export async function recordAudit(tx: DbExecutor, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}
