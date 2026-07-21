import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Badge,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listPastEvents, listUpcomingEvents } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';

export const metadata: Metadata = { title: 'Agenda' };

const TYPE_LABELS: Record<string, string> = {
  encontro: 'Jogo',
  treino: 'Treino',
  amistoso: 'Amistoso',
  campeonato: 'Campeonato',
  confraternizacao: 'Confraternização',
  outro: 'Outro',
};

/**
 * Agenda em timeline, não em grade de cards: uma lista cronológica comunica
 * "o que vem primeiro" muito melhor que cartões lado a lado (§15.3).
 */
export default async function AgendaPage() {
  const actor = await getActor();

  const [upcoming, past] = await Promise.all([
    listUpcomingEvents(db, { actor, limit: 20 }),
    listPastEvents(db, { actor, limit: 20 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Agenda" description="Próximos jogos do grupo e o que já aconteceu." />

      <Panel>
        <PanelHeader title="Próximos" description={`${upcoming.length} agendado(s)`} />
        <PanelBody flush>
          {upcoming.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nada marcado por enquanto"
                description="Quando o próximo jogo for publicado, ele aparece aqui."
              />
            </div>
          ) : (
            <ul className="divide-cva-border divide-y">
              {upcoming.map((event) => {
                const spotsLeft = Math.max(0, event.capacity - event.confirmedCount);

                return (
                  <li key={event.id}>
                    <Link
                      href={`/app/eventos/${event.id}`}
                      className="hover:bg-cva-blue-100/35 flex items-center gap-4 px-4 py-3.5 transition-colors sm:px-5"
                    >
                      {/* Coluna de data: âncora visual da timeline. */}
                      <div className="w-14 shrink-0 text-center">
                        <p
                          data-numeric
                          className="text-cva-navy-900 text-xl leading-none font-bold"
                        >
                          {event.eventDate.slice(8, 10)}
                        </p>
                        <p className="text-cva-text-muted text-xs uppercase">
                          {formatEventDate(event.eventDate).split(', ')[1]?.slice(3, 5)}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-cva-navy-900 truncate text-sm font-semibold">
                          {event.title}
                        </p>
                        <p className="text-cva-text-muted truncate text-xs">
                          {formatEventDate(event.eventDate)}
                          {event.startTime ? ` · ${event.startTime.slice(0, 5)}` : ''}
                          {event.venueName ? ` · ${event.venueName}` : ''}
                        </p>
                      </div>

                      <div className="hidden shrink-0 items-center gap-2 sm:flex">
                        {event.type !== 'encontro' ? (
                          <Badge tone="info">{TYPE_LABELS[event.type] ?? event.type}</Badge>
                        ) : null}
                        <Badge tone={spotsLeft > 0 ? 'neutral' : 'warning'}>
                          {spotsLeft > 0
                            ? `${spotsLeft} ${spotsLeft === 1 ? 'vaga' : 'vagas'}`
                            : 'Lotado'}
                        </Badge>
                      </div>

                      <span aria-hidden="true" className="text-cva-text-muted shrink-0">
                        ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Já aconteceram" />
        <PanelBody flush>
          {past.length === 0 ? (
            <div className="text-cva-text-muted px-4 py-6 text-sm sm:px-5">
              Ainda não há jogos passados.
            </div>
          ) : (
            <ul className="divide-cva-border divide-y">
              {past.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/app/eventos/${event.id}`}
                    className="hover:bg-cva-blue-100/35 flex items-center justify-between gap-3 px-4 py-3 transition-colors sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-cva-text truncate text-sm">{event.title}</p>
                      <p className="text-cva-text-muted text-xs">
                        {formatEventDate(event.eventDate)}
                      </p>
                    </div>
                    <Badge tone={event.status === 'cancelado' ? 'danger' : 'neutral'}>
                      {event.status === 'cancelado' ? 'Cancelado' : 'Finalizado'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
