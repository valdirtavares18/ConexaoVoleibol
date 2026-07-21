import type { Metadata } from 'next';
import Link from 'next/link';
import { ShareButton } from '@/components/events/share-button';
import {
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getNextEvent } from '@/server/services/events';
import { buildTeamsMessage, formatEventDate } from '@/server/services/sharing';
import { getPublishedFormation } from '@/server/services/team-formation';

export const metadata: Metadata = { title: 'Times' };

/**
 * Times publicados, na visão do atleta.
 *
 * A formação chega por `getPublishedFormation`, que devolve apenas nome do time
 * e nome dos atletas. Notas, afinidades e métricas não passam por aqui — não é
 * questão de não renderizar, é que os campos não existem no objeto.
 */
export default async function TimesPage() {
  const actor = await getActor();
  const event = await getNextEvent(db, actor);
  const formation = event ? await getPublishedFormation(db, event.id) : null;

  if (!event || !formation) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Times" description="Os times do próximo encontro aparecem aqui." />
        <EmptyState
          title="Times ainda não publicados"
          description={
            event
              ? 'Os administradores publicam os times depois que a lista de confirmados fecha.'
              : 'Assim que houver um encontro marcado e os times forem publicados, eles aparecem aqui.'
          }
          action={
            event ? (
              <Link
                href={`/app/eventos/${event.id}`}
                className="bg-cva-navy-900 rounded-md px-4 py-2 text-sm font-semibold text-white"
              >
                Ver o encontro
              </Link>
            ) : null
          }
        />
      </div>
    );
  }

  const message = buildTeamsMessage({
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
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatEventDate(event.eventDate)}
        title={event.title}
        description={`Times publicados · versão ${formation.version}`}
        actions={
          <ShareButton
            title={`Times — ${event.title}`}
            text={message}
            artUrl={`/api/eventos/${event.id}/arte`}
          />
        }
      />

      {formation.status === 'necessita_revisao' ? (
        <Callout tone="warning" title="Os times podem mudar">
          {formation.reviewReason ??
            'Houve uma alteração na lista de confirmados depois da publicação.'}
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {formation.teams.map((team, index) => (
          <Panel key={team.index} as="article" className="overflow-hidden">
            {/* Faixa colorida no topo identifica o time sem depender só do nome. */}
            <div
              aria-hidden="true"
              className={
                index === 0
                  ? 'bg-cva-navy-900 h-1.5'
                  : index === 1
                    ? 'bg-cva-gold-500 h-1.5'
                    : 'bg-cva-blue-600 h-1.5'
              }
            />
            <PanelHeader title={team.name} description={`${team.members.length} atletas`} />
            <PanelBody flush>
              <ol className="divide-cva-border divide-y">
                {team.members.map((member, position) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5"
                  >
                    <span
                      data-numeric
                      aria-hidden="true"
                      className="text-cva-text-muted w-4 shrink-0 text-xs"
                    >
                      {position + 1}
                    </span>
                    <span className="text-cva-text truncate">{member.displayName}</span>
                  </li>
                ))}
              </ol>
            </PanelBody>
          </Panel>
        ))}
      </div>

      {formation.teams.length >= 3 ? (
        <Panel>
          <PanelBody>
            <p className="text-cva-text text-sm">
              Começam jogando{' '}
              <strong className="text-cva-navy-900">{formation.teams[0]?.name}</strong> contra{' '}
              <strong className="text-cva-navy-900">{formation.teams[1]?.name}</strong>.{' '}
              <strong className="text-cva-navy-900">{formation.teams[2]?.name}</strong> começa
              aguardando. O vencedor fica, o perdedor sai — e nenhum time joga mais de duas partidas
              seguidas.
            </p>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
