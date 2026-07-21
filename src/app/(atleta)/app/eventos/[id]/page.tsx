import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  AttendanceControls,
  type ParticipationStatus,
} from '@/components/events/attendance-controls';
import { ShareButton } from '@/components/events/share-button';
import {
  Badge,
  Callout,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getEvent, getMyParticipation } from '@/server/services/events';
import { buildTeamsMessage, formatEventDate } from '@/server/services/sharing';
import { getPublishedFormation } from '@/server/services/team-formation';

export const metadata: Metadata = { title: 'Jogo' };

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();

  const event = await getEvent(db, { actor, eventId: id });
  if (!event) notFound();

  const [participation, formation] = await Promise.all([
    getMyParticipation(db, { actor, eventId: id }),
    getPublishedFormation(db, id),
  ]);

  const status = (participation?.status ?? 'sem_resposta') as ParticipationStatus;
  const deadlinePassed =
    event.confirmationDeadline !== null && event.confirmationDeadline.getTime() < Date.now();

  const open = event.status === 'publicado' || event.status === 'em_andamento';

  // A mensagem compartilhável é montada a partir de `TeamSummary`, que não
  // carrega nota, afinidade nem valor — ver `sharing.ts`.
  const shareMessage = formation
    ? buildTeamsMessage({
        event: {
          title: event.title,
          eventDate: event.eventDate,
          startTime: event.startTime,
          venueName: event.venueName,
          address: event.address,
          notes: event.notes,
        },
        teams: formation.teams.map((team) => ({
          id: String(team.index),
          index: team.index,
          name: team.name,
          colorToken: team.colorToken,
          members: team.members,
        })),
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatEventDate(event.eventDate)}
        title={event.title}
        description={
          [
            event.startTime ? `Início às ${event.startTime.slice(0, 5)}` : null,
            event.venueName,
            event.address,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          <Badge tone={event.status === 'cancelado' ? 'danger' : open ? 'success' : 'neutral'}>
            {event.status === 'cancelado'
              ? 'Cancelado'
              : event.status === 'finalizado'
                ? 'Finalizado'
                : event.status === 'em_andamento'
                  ? 'Em andamento'
                  : 'Confirmações abertas'}
          </Badge>
        }
      />

      {event.status === 'cancelado' ? (
        <Callout tone="danger" title="Este jogo foi cancelado">
          Fique de olho na agenda para o próximo.
        </Callout>
      ) : null}

      {event.notes ? (
        <Panel>
          <PanelBody>
            <p className="text-cva-text text-sm">{event.notes}</p>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Presença"
          description={`${event.confirmedCount} de ${event.capacity} confirmados${
            event.waitlistCount > 0 ? ` · ${event.waitlistCount} na lista de espera` : ''
          }`}
        />
        <PanelBody>
          {open ? (
            <AttendanceControls
              eventId={event.id}
              status={status}
              waitlistPosition={participation?.waitlistPosition ?? null}
              deadlinePassed={deadlinePassed}
            />
          ) : (
            <p className="text-cva-text-muted text-sm">
              As confirmações deste jogo estão encerradas.
            </p>
          )}
        </PanelBody>
      </Panel>

      {formation ? (
        <Panel>
          <PanelHeader
            title="Times"
            description={
              formation.status === 'necessita_revisao'
                ? 'Houve cancelamento depois da publicação — os times podem mudar.'
                : `Versão ${formation.version}`
            }
            actions={
              shareMessage ? (
                <ShareButton
                  title={event.title}
                  text={shareMessage}
                  artUrl={`/api/eventos/${event.id}/arte`}
                />
              ) : null
            }
          />
          <PanelBody flush>
            <div className="bg-cva-border grid gap-px sm:grid-cols-3">
              {formation.teams.map((team) => (
                <div key={team.index} className="bg-cva-panel px-4 py-4">
                  <p className="text-cva-navy-900 text-sm font-semibold">{team.name}</p>
                  <ul className="text-cva-text mt-2 flex flex-col gap-1.5 text-sm">
                    {team.members.map((member) => (
                      <li key={member.id}>{member.displayName}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {formation.teams.length >= 3 ? (
              <div className="border-cva-border text-cva-text-muted border-t px-4 py-3 text-sm sm:px-5">
                Começam jogando{' '}
                <strong className="text-cva-navy-900">{formation.teams[0]?.name}</strong> e{' '}
                <strong className="text-cva-navy-900">{formation.teams[1]?.name}</strong>.{' '}
                <strong className="text-cva-navy-900">{formation.teams[2]?.name}</strong> aguarda.
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
