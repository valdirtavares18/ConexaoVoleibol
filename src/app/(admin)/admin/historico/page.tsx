import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, desc, inArray } from 'drizzle-orm';
import {
  Badge,
  EmptyState,
  Metric,
  MetricRow,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { courtRotationSessions, events, matches, teams } from '@/db/schema';
import { getActor } from '@/server/context';
import { requireEventManagement } from '@/server/policies';
import { formatEventDate } from '@/server/services/sharing';

export const metadata: Metadata = { title: 'Histórico' };

const REASON_LABELS: Record<string, string> = {
  limite_consecutivas: 'saiu por ter jogado duas seguidas',
  derrota: 'saiu por ter perdido',
  empate_decidido: 'saiu por decisão no empate',
  override_manual: 'saiu por decisão manual',
};

/**
 * Histórico dos encontros finalizados (§12).
 *
 * Master-detail em vez de tabela única: cada encontro traz sua sequência de
 * partidas logo abaixo, que é como o grupo lembra do que aconteceu.
 */
export default async function AdminHistoricoPage() {
  const actor = await getActor();
  requireEventManagement(actor);

  const finished = await db
    .select({
      id: events.id,
      title: events.title,
      eventDate: events.eventDate,
      status: events.status,
    })
    .from(events)
    .where(inArray(events.status, ['finalizado', 'cancelado']))
    .orderBy(desc(events.eventDate))
    .limit(20);

  const eventIds = finished.map((event) => event.id);

  const sessions =
    eventIds.length > 0
      ? await db
          .select({
            id: courtRotationSessions.id,
            eventId: courtRotationSessions.eventId,
          })
          .from(courtRotationSessions)
          .where(inArray(courtRotationSessions.eventId, eventIds))
      : [];

  const sessionIds = sessions.map((session) => session.id);

  const allMatches =
    sessionIds.length > 0
      ? await db
          .select({
            sessionId: matches.sessionId,
            matchNumber: matches.matchNumber,
            leftScore: matches.leftScore,
            rightScore: matches.rightScore,
            leftTeamId: matches.leftTeamId,
            rightTeamId: matches.rightTeamId,
            winnerTeamId: matches.winnerTeamId,
            leavingTeamId: matches.leavingTeamId,
            leaveReason: matches.leaveReason,
          })
          .from(matches)
          .where(inArray(matches.sessionId, sessionIds))
          .orderBy(asc(matches.matchNumber))
      : [];

  const teamIds = [
    ...new Set(allMatches.flatMap((m) => [m.leftTeamId, m.rightTeamId, m.leavingTeamId])),
  ];

  const teamRows =
    teamIds.length > 0
      ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
      : [];

  const teamName = new Map(teamRows.map((team) => [team.id, team.name]));
  const sessionByEvent = new Map(sessions.map((session) => [session.eventId, session.id]));

  const matchesBySession = new Map<string, typeof allMatches>();
  for (const match of allMatches) {
    const bucket = matchesBySession.get(match.sessionId) ?? [];
    bucket.push(match);
    matchesBySession.set(match.sessionId, bucket);
  }

  const totalMatches = allMatches.length;
  const withScore = allMatches.filter(
    (m) => m.leftScore !== null && m.rightScore !== null,
  ).length;
  const overrides = allMatches.filter((m) => m.leaveReason === 'override_manual').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Histórico"
        description="Encontros finalizados, formações usadas e sequência de partidas."
      />

      <Panel>
        <MetricRow>
          <Metric label="Encontros" value={finished.length} />
          <Metric label="Partidas" value={totalMatches} />
          <Metric label="Com placar anotado" value={withScore} />
          <Metric
            label="Trocas manuais"
            value={overrides}
            tone={overrides > 0 ? 'negative' : 'neutral'}
            hint={overrides > 0 ? 'registradas na auditoria' : undefined}
          />
        </MetricRow>
      </Panel>

      {finished.length === 0 ? (
        <EmptyState
          title="Nenhum encontro finalizado"
          description="O histórico começa depois do primeiro encontro concluído no painel de quadra."
        />
      ) : (
        finished.map((event) => {
          const sessionId = sessionByEvent.get(event.id);
          const eventMatches = sessionId ? (matchesBySession.get(sessionId) ?? []) : [];

          return (
            <Panel key={event.id} as="article">
              <PanelHeader
                title={
                  <Link href={`/admin/eventos/${event.id}`} className="hover:underline">
                    {event.title}
                  </Link>
                }
                description={`${formatEventDate(event.eventDate)} · ${eventMatches.length} partida(s)`}
                actions={
                  event.status === 'cancelado' ? (
                    <Badge tone="danger">Cancelado</Badge>
                  ) : (
                    <Badge tone="neutral">Finalizado</Badge>
                  )
                }
              />
              <PanelBody flush>
                {eventMatches.length === 0 ? (
                  <p className="text-cva-text-muted px-4 py-3 text-sm sm:px-5">
                    Nenhuma partida registrada para este encontro.
                  </p>
                ) : (
                  <ol className="divide-cva-border divide-y">
                    {eventMatches.map((match) => (
                      <li
                        key={`${match.sessionId}-${match.matchNumber}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5"
                      >
                        <span className="text-cva-text">
                          <span data-numeric className="text-cva-text-muted mr-2">
                            #{match.matchNumber}
                          </span>
                          {teamName.get(match.leftTeamId) ?? 'Time'} ×{' '}
                          {teamName.get(match.rightTeamId) ?? 'Time'}
                          {match.leftScore !== null && match.rightScore !== null ? (
                            <span data-numeric className="text-cva-navy-900 ml-2 font-semibold">
                              {match.leftScore}–{match.rightScore}
                            </span>
                          ) : null}
                        </span>

                        <span className="text-cva-text-muted text-xs">
                          {teamName.get(match.leavingTeamId) ?? 'Time'}{' '}
                          {REASON_LABELS[match.leaveReason] ?? match.leaveReason}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </PanelBody>
            </Panel>
          );
        })
      )}
    </div>
  );
}
