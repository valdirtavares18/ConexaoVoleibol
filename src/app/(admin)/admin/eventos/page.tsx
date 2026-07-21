import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState, Panel, PanelBody, PanelHeader, PageHeader } from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listAllEvents } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';
import { NewEventForm } from './new-event-form';

export const metadata: Metadata = { title: 'Encontros' };

const STATUS = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  publicado: { label: 'Publicado', tone: 'success' },
  em_andamento: { label: 'Em andamento', tone: 'gold' },
  finalizado: { label: 'Finalizado', tone: 'info' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
} as const;

export default async function AdminEventosPage() {
  const actor = await getActor();
  const events = await listAllEvents(db, { actor, limit: 60 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Encontros"
        description={`${events.length} registrado(s)`}
      />

      <NewEventForm />

      <Panel>
        <PanelHeader title="Todos os encontros" />
        <PanelBody flush>
          {events.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhum encontro ainda"
                description="Crie o primeiro encontro para o grupo começar a confirmar presença."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TH width="8rem">Data</TH>
                <TH>Encontro</TH>
                <TH width="8rem" align="center">
                  Confirmados
                </TH>
                <TH width="8rem" align="center">
                  Times
                </TH>
                <TH width="8rem" align="right">
                  Situação
                </TH>
              </THead>
              <TBody>
                {events.map((event) => {
                  const status = STATUS[event.status as keyof typeof STATUS];

                  return (
                    <TR key={event.id}>
                      <TD numeric className="text-cva-text-muted whitespace-nowrap">
                        {formatEventDate(event.eventDate).split(', ')[1]}
                      </TD>
                      <TD>
                        <Link
                          href={`/admin/eventos/${event.id}`}
                          className="text-cva-navy-900 font-medium hover:underline"
                        >
                          {event.title}
                        </Link>
                        {event.venueName ? (
                          <span className="text-cva-text-muted block text-xs">
                            {event.venueName}
                          </span>
                        ) : null}
                      </TD>
                      <TD align="center" numeric>
                        {event.confirmedCount}/{event.capacity}
                        {event.waitlistCount > 0 ? (
                          <span className="text-cva-warning block text-xs">
                            +{event.waitlistCount} na espera
                          </span>
                        ) : null}
                      </TD>
                      <TD align="center">
                        {event.formationNeedsReview ? (
                          <Badge tone="warning">Revisar</Badge>
                        ) : event.hasPublishedFormation ? (
                          <Badge tone="success">Publicados</Badge>
                        ) : (
                          <Badge tone="neutral">Pendentes</Badge>
                        )}
                      </TD>
                      <TD align="right">
                        <Badge tone={status?.tone ?? 'neutral'} dot>
                          {status?.label ?? event.status}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
