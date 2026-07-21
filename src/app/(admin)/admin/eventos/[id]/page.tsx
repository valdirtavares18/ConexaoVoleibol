import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareButton } from '@/components/events/share-button';
import {
  Badge,
  Callout,
  Metric,
  MetricRow,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getEvent, listFormationVersions } from '@/server/services/events';
import { buildEventInviteMessage, formatEventDate } from '@/server/services/sharing';
import { EventStatusActions } from './event-status-actions';

export const metadata: Metadata = { title: 'Encontro' };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default async function AdminEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();

  const event = await getEvent(db, { actor, eventId: id });
  if (!event) notFound();

  const versions = await listFormationVersions(db, { actor, eventId: id });

  const invite = buildEventInviteMessage({
    event: {
      title: event.title,
      eventDate: event.eventDate,
      startTime: event.startTime,
      venueName: event.venueName,
      address: event.address,
      notes: event.notes,
    },
    confirmedCount: event.confirmedCount,
    capacity: event.capacity,
    appUrl: `${APP_URL}/app/eventos/${id}`,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/admin/eventos" className="hover:underline">
            ← Encontros
          </Link>
        }
        title={event.title}
        description={`${formatEventDate(event.eventDate)}${
          event.startTime ? ` às ${event.startTime.slice(0, 5)}` : ''
        }${event.venueName ? ` · ${event.venueName}` : ''}`}
        actions={<ShareButton title={event.title} text={invite} />}
      />

      <Panel>
        <MetricRow>
          <Metric label="Confirmados" value={`${event.confirmedCount}/${event.capacity}`} />
          <Metric
            label="Lista de espera"
            value={event.waitlistCount}
            tone={event.waitlistCount > 0 ? 'negative' : 'neutral'}
          />
          <Metric
            label="Times"
            value={
              event.formationNeedsReview
                ? 'Revisar'
                : event.hasPublishedFormation
                  ? 'Publicados'
                  : 'Pendentes'
            }
            tone={
              event.formationNeedsReview
                ? 'negative'
                : event.hasPublishedFormation
                  ? 'positive'
                  : 'neutral'
            }
          />
          <Metric label="Versões de formação" value={versions.length} />
        </MetricRow>
      </Panel>

      {event.formationNeedsReview ? (
        <Callout tone="warning" title="A formação publicada precisa de revisão">
          Alguém cancelou depois da publicação. Revise os times antes do encontro.
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: `/admin/eventos/${id}/presencas`, label: 'Presenças', hint: 'Confirmar, cancelar e reordenar a fila' },
          { href: `/admin/eventos/${id}/times`, label: 'Times', hint: 'Gerar, ajustar e publicar' },
          { href: `/admin/eventos/${id}/quadra`, label: 'Painel de quadra', hint: 'Rodízio durante o encontro' },
          { href: `/admin/financeiro/eventos/${id}`, label: 'Financeiro', hint: 'Cobranças e fechamento' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border-cva-border bg-cva-panel hover:border-cva-gold-500 rounded-lg border px-4 py-3.5 transition-colors"
          >
            <p className="text-cva-navy-900 text-sm font-semibold">{item.label}</p>
            <p className="text-cva-text-muted mt-0.5 text-xs">{item.hint}</p>
          </Link>
        ))}
      </div>

      <EventStatusActions eventId={id} status={event.status} />

      {event.notes ? (
        <Panel>
          <PanelHeader title="Observações" />
          <PanelBody>
            <p className="text-cva-text text-sm">{event.notes}</p>
          </PanelBody>
        </Panel>
      ) : null}

      {versions.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Versões da formação"
            description="Nenhuma versão é apagada — publicar cria uma nova."
          />
          <PanelBody flush>
            <ul className="divide-cva-border divide-y">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5"
                >
                  <span className="text-cva-text">
                    <span data-numeric className="text-cva-text-muted mr-2">
                      v{version.version}
                    </span>
                    {version.strategy.replace(/_/g, ' ')}
                  </span>
                  <Badge
                    tone={
                      version.status === 'publicada'
                        ? 'success'
                        : version.status === 'necessita_revisao'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {version.status === 'publicada'
                      ? 'Publicada'
                      : version.status === 'necessita_revisao'
                        ? 'Precisa revisão'
                        : version.status === 'substituida'
                          ? 'Substituída'
                          : 'Rascunho'}
                  </Badge>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
