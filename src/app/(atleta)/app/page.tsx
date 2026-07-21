import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AttendanceControls,
  type ParticipationStatus,
} from '@/components/events/attendance-controls';
import {
  Badge,
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getMyParticipation, getNextEvent, listPastEvents } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';
import { getPublishedFormation } from '@/server/services/team-formation';
import { getCurrentSelfAssessment } from '@/server/services/evaluations';

export const metadata: Metadata = { title: 'Início' };

/**
 * Painel do atleta (§17).
 *
 * Não é uma grade de widgets: é uma visão operacional em ordem de urgência —
 * o próximo encontro e a ação de confirmar vêm primeiro, porque é para isso que
 * o atleta abre o app.
 */
export default async function AppHomePage() {
  const actor = await getActor();
  const nextEvent = await getNextEvent(db, actor);

  const [participation, formation, selfAssessment, recent] = await Promise.all([
    nextEvent ? getMyParticipation(db, { actor, eventId: nextEvent.id }) : null,
    nextEvent ? getPublishedFormation(db, nextEvent.id) : null,
    actor?.athleteId ? getCurrentSelfAssessment(db, actor.athleteId) : null,
    listPastEvents(db, { actor, limit: 4 }),
  ]);

  const status = (participation?.status ?? 'sem_resposta') as ParticipationStatus;
  const deadlinePassed =
    nextEvent?.confirmationDeadline !== null &&
    nextEvent?.confirmationDeadline !== undefined &&
    nextEvent.confirmationDeadline.getTime() < Date.now();

  const spotsLeft = nextEvent ? Math.max(0, nextEvent.capacity - nextEvent.confirmedCount) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Conexão Voleibol Alegrete"
        title="Seu próximo jogo"
        description="Confirme presença, veja os times publicados e acompanhe a agenda do grupo."
      />

      {/* ---- Próximo encontro: o destaque da página ------------------------ */}
      {nextEvent ? (
        <Panel as="article" className="overflow-hidden">
          <div className="bg-cva-navy-950 relative px-5 py-5">
            <div className="cva-stripes absolute inset-0 opacity-50" aria-hidden="true" />
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-cva-gold-500 text-xs font-semibold tracking-wider uppercase">
                  Próximo encontro
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
                  {nextEvent.title}
                </h2>
                <p className="text-cva-blue-100 mt-1 text-sm">
                  {formatEventDate(nextEvent.eventDate)}
                  {nextEvent.startTime ? ` às ${nextEvent.startTime.slice(0, 5)}` : ''}
                </p>
                {nextEvent.venueName ? (
                  <p className="text-cva-blue-100 text-sm">
                    {nextEvent.venueName}
                    {nextEvent.address ? ` — ${nextEvent.address}` : ''}
                  </p>
                ) : null}
              </div>

              <div className="text-right">
                <p data-numeric className="text-3xl font-bold text-white">
                  {nextEvent.confirmedCount}
                  <span className="text-cva-blue-100 text-lg">/{nextEvent.capacity}</span>
                </p>
                <p className="text-cva-blue-100 text-xs">
                  {spotsLeft > 0
                    ? `${spotsLeft} ${spotsLeft === 1 ? 'vaga' : 'vagas'}`
                    : 'vagas preenchidas'}
                </p>
              </div>
            </div>
          </div>

          <PanelBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {status === 'confirmado' ? (
                <Badge tone="success" dot>
                  Presença confirmada
                </Badge>
              ) : status === 'lista_espera' ? (
                <Badge tone="warning" dot>
                  Lista de espera · {participation?.waitlistPosition}º
                </Badge>
              ) : status === 'talvez' ? (
                <Badge tone="info" dot>
                  Você marcou “talvez”
                </Badge>
              ) : status === 'nao_participa' ? (
                <Badge tone="neutral" dot>
                  Você não vai a este encontro
                </Badge>
              ) : (
                <Badge tone="gold" dot>
                  Aguardando sua resposta
                </Badge>
              )}

              {nextEvent.waitlistCount > 0 ? (
                <Badge tone="neutral">{nextEvent.waitlistCount} na lista de espera</Badge>
              ) : null}
            </div>

            {nextEvent.notes ? (
              <p className="text-cva-text-muted text-sm">{nextEvent.notes}</p>
            ) : null}

            <AttendanceControls
              eventId={nextEvent.id}
              status={status}
              waitlistPosition={participation?.waitlistPosition ?? null}
              deadlinePassed={deadlinePassed}
            />
          </PanelBody>
        </Panel>
      ) : (
        <EmptyState
          title="Nenhum encontro marcado"
          description="Assim que um administrador publicar o próximo encontro, ele aparece aqui para você confirmar."
        />
      )}

      {/* ---- Times publicados ---------------------------------------------- */}
      {formation ? (
        <Panel>
          <PanelHeader
            title="Times publicados"
            description={
              formation.status === 'necessita_revisao'
                ? 'Alguém cancelou depois da publicação — os times podem mudar.'
                : `Versão ${formation.version}`
            }
            actions={
              <Link
                href="/app/times"
                className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/50 rounded-md border px-3 py-1.5 text-sm font-semibold"
              >
                Ver detalhes
              </Link>
            }
          />
          <PanelBody flush>
            <div className="bg-cva-border grid gap-px sm:grid-cols-3">
              {formation.teams.map((team) => (
                <div key={team.index} className="bg-cva-panel px-4 py-3.5">
                  <p className="text-cva-navy-900 text-sm font-semibold">{team.name}</p>
                  <ul className="text-cva-text mt-2 flex flex-col gap-1 text-sm">
                    {team.members.map((member) => (
                      <li key={member.id}>{member.displayName}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      {/* ---- Pendências do perfil ------------------------------------------ */}
      {!selfAssessment ? (
        <Callout tone="info" title="Sua autoavaliação ainda não foi enviada">
          Ela ajuda os administradores a calibrar as avaliações e montar times mais equilibrados.{' '}
          <Link href="/app/autoavaliacao" className="font-semibold underline underline-offset-2">
            Preencher agora
          </Link>
        </Callout>
      ) : null}

      {/* ---- Histórico recente ---------------------------------------------- */}
      <Panel>
        <PanelHeader
          title="Encontros recentes"
          actions={
            <Link
              href="/app/historico"
              className="text-cva-blue-700 text-sm underline underline-offset-4"
            >
              Ver histórico
            </Link>
          }
        />
        <PanelBody flush>
          {recent.length === 0 ? (
            <div className="text-cva-text-muted px-4 py-6 text-sm sm:px-5">
              Ainda não há encontros finalizados.
            </div>
          ) : (
            <ul className="divide-cva-border divide-y">
              {recent.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-cva-text truncate text-sm font-medium">{event.title}</p>
                    <p className="text-cva-text-muted text-xs">
                      {formatEventDate(event.eventDate)}
                    </p>
                  </div>
                  <Badge tone={event.status === 'finalizado' ? 'neutral' : 'info'}>
                    {event.status === 'finalizado' ? 'Finalizado' : event.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
