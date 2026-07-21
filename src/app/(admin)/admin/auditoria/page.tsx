import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import {
  Badge,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { auditLogs, users } from '@/db/schema';
import { getActor } from '@/server/context';
import { requireAuditAccess } from '@/server/policies';

export const metadata: Metadata = { title: 'Auditoria' };

/** Ações que merecem destaque por alterarem regra ou dinheiro. */
const SENSITIVE = new Set([
  'financeiro.ajuste_manual',
  'financeiro.dispensado',
  'financeiro.estornado',
  'quadra.override',
  'quadra.corrigir',
  'atleta.remover',
  'evento.cancelado',
  'cadastro.rejeitar',
]);

export default async function AuditoriaPage() {
  const actor = await getActor();
  requireAuditAccess(actor);

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      reason: auditLogs.reason,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Auditoria"
        description="Registro append-only das ações sensíveis. Nada aqui é editado ou apagado."
      />

      <Panel>
        <PanelHeader title="Últimas ações" description={`${rows.length} registro(s)`} />
        <PanelBody flush>
          {rows.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhuma ação registrada"
                description="O registro começa a aparecer conforme o sistema é usado."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TH width="11rem">Quando</TH>
                <TH width="10rem">Quem</TH>
                <TH width="14rem">Ação</TH>
                <TH>Motivo / detalhe</TH>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id} highlighted={SENSITIVE.has(row.action)}>
                    <TD numeric className="text-cva-text-muted whitespace-nowrap">
                      {row.createdAt.toLocaleString('pt-BR')}
                    </TD>
                    <TD className="text-cva-text">{row.actorName ?? 'Sistema'}</TD>
                    <TD>
                      <span className="text-cva-navy-900 font-medium">{row.action}</span>
                      {SENSITIVE.has(row.action) ? <Badge tone="warning">Sensível</Badge> : null}
                      <span className="text-cva-text-muted block text-xs">
                        {row.entityType}
                        {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
                      </span>
                    </TD>
                    <TD className="text-cva-text-muted text-sm">{row.reason ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
