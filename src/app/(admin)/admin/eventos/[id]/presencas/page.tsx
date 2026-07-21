import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
import { listAthletes } from '@/server/services/athletes';
import { getRoster } from '@/server/services/attendance';
import { getEvent } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';
import { AttendanceManager } from './attendance-manager';

export const metadata: Metadata = { title: 'Presenças' };

export default async function PresencasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();

  const event = await getEvent(db, { actor, eventId: id });
  if (!event) notFound();

  const [roster, athletes] = await Promise.all([
    getRoster(db, id),
    listAthletes(db, { actor }),
  ]);

  const nameOf = new Map(
    athletes.map((athlete) => [athlete.id, athlete.nickname ?? athlete.fullName]),
  );

  const responded = new Set([
    ...roster.confirmed.map((c) => c.athleteId),
    ...roster.waitlist.map((w) => w.athleteId),
    ...roster.maybe,
    ...roster.declined,
  ]);

  const noResponse = athletes.filter((athlete) => !responded.has(athlete.id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href={`/admin/eventos/${id}`} className="hover:underline">
            ← {event.title}
          </Link>
        }
        title="Presenças"
        description={formatEventDate(event.eventDate)}
      />

      <Panel>
        <MetricRow>
          <Metric
            label="Confirmados"
            value={`${roster.confirmed.length}/${event.capacity}`}
            tone={roster.confirmed.length === event.capacity ? 'positive' : 'neutral'}
          />
          <Metric label="Lista de espera" value={roster.waitlist.length} />
          <Metric label="Talvez" value={roster.maybe.length} />
          <Metric label="Sem resposta" value={noResponse.length} />
        </MetricRow>
      </Panel>

      {roster.confirmed.length === event.capacity ? (
        <Callout tone="success" title="Lista completa">
          As {event.capacity} vagas estão preenchidas. Dá para montar os times.
        </Callout>
      ) : null}

      <AttendanceManager
        eventId={id}
        capacity={event.capacity}
        confirmed={roster.confirmed.map((entry) => ({
          athleteId: entry.athleteId,
          displayName: nameOf.get(entry.athleteId) ?? 'Atleta',
          slot: entry.slot,
        }))}
        waitlist={roster.waitlist.map((entry) => ({
          athleteId: entry.athleteId,
          displayName: nameOf.get(entry.athleteId) ?? 'Atleta',
          position: entry.position,
        }))}
        maybe={roster.maybe.map((athleteId) => ({
          athleteId,
          displayName: nameOf.get(athleteId) ?? 'Atleta',
        }))}
        declined={roster.declined.map((athleteId) => ({
          athleteId,
          displayName: nameOf.get(athleteId) ?? 'Atleta',
        }))}
        noResponse={noResponse.map((athlete) => ({
          athleteId: athlete.id,
          displayName: athlete.nickname ?? athlete.fullName,
        }))}
      />

      <Panel>
        <PanelHeader title="Como a fila funciona" />
        <PanelBody>
          <p className="text-cva-text-muted text-sm">
            O sistema nunca confirma além da capacidade: a partir da {event.capacity + 1}ª
            confirmação, o atleta entra na lista de espera. Quando alguém cancela, o primeiro da
            fila é promovido automaticamente e assume a vaga liberada — tudo na mesma operação,
            então não existe momento com vaga aberta e fila parada.
          </p>
        </PanelBody>
      </Panel>

      {roster.declined.length > 0 ? (
        <Panel>
          <PanelHeader title="Não vão" description={`${roster.declined.length} atleta(s)`} />
          <PanelBody flush>
            <ul className="divide-cva-border divide-y">
              {roster.declined.map((athleteId) => (
                <li key={athleteId} className="text-cva-text px-4 py-2.5 text-sm sm:px-5">
                  {nameOf.get(athleteId) ?? 'Atleta'}
                  <Badge tone="neutral">Não participa</Badge>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
