import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Badge,
  Callout,
  EmptyState,
  Metric,
  MetricRow,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { formatCents } from '@/domain/shared/money';
import { getActor } from '@/server/context';
import { listPendingRegistrations } from '@/server/services/athletes';
import { listProvisionalReviewsDue } from '@/server/services/evaluations';
import { getNextEvent, listPastEvents } from '@/server/services/events';
import { getCashSummary } from '@/server/services/finance';
import { formatEventDate } from '@/server/services/sharing';
import { getPublishedFormation } from '@/server/services/team-formation';

export const metadata: Metadata = { title: 'Visão geral' };

/**
 * Painel administrativo (§17).
 *
 * Composição editorial: um painel principal com o próximo encontro — que é a
 * unidade de trabalho real do grupo — e, ao lado, as listas de pendências.
 * Não são doze cards iguais.
 */
export default async function AdminHomePage() {
  const actor = await getActor();

  const nextEvent = await getNextEvent(db, actor);

  const [formation, pendingRegistrations, provisionalDue, cash, recentEvents] = await Promise.all([
    nextEvent ? getPublishedFormation(db, nextEvent.id) : null,
    listPendingRegistrations(db, actor),
    listProvisionalReviewsDue(db, actor),
    getCashSummary(db, { actor, limit: 5 }),
    listPastEvents(db, { actor, limit: 5 }),
  ]);

  const spotsLeft = nextEvent ? Math.max(0, nextEvent.capacity - nextEvent.confirmedCount) : 0;
  const readyForTeams = nextEvent ? nextEvent.confirmedCount === nextEvent.capacity : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CVA Gestão"
        title="Visão geral"
        description="O que precisa da sua atenção agora."
        actions={
          <Link
            href="/admin/eventos"
            className="bg-cva-navy-900 hover:bg-cva-navy-800 rounded-md px-4 py-2 text-sm font-semibold text-white"
          >
            Gerenciar encontros
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ---- Coluna principal ------------------------------------------- */}
        <div className="flex flex-col gap-6">
          {nextEvent ? (
            <Panel as="article" className="overflow-hidden">
              <div className="bg-cva-navy-950 relative px-5 py-5">
                <div className="cva-stripes absolute inset-0 opacity-50" aria-hidden="true" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
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
                      {nextEvent.venueName ? ` · ${nextEvent.venueName}` : ''}
                    </p>
                  </div>
                  <p data-numeric className="text-3xl font-bold text-white">
                    {nextEvent.confirmedCount}
                    <span className="text-cva-blue-100 text-lg">/{nextEvent.capacity}</span>
                  </p>
                </div>
              </div>

              <MetricRow>
                <Metric label="Confirmados" value={nextEvent.confirmedCount} />
                <Metric
                  label="Vagas"
                  value={spotsLeft}
                  tone={spotsLeft === 0 ? 'positive' : 'neutral'}
                />
                <Metric
                  label="Lista de espera"
                  value={nextEvent.waitlistCount}
                  tone={nextEvent.waitlistCount > 0 ? 'negative' : 'neutral'}
                />
                <Metric
                  label="Times"
                  value={
                    nextEvent.formationNeedsReview
                      ? 'Revisar'
                      : nextEvent.hasPublishedFormation
                        ? 'Publicados'
                        : 'Pendentes'
                  }
                  tone={
                    nextEvent.formationNeedsReview
                      ? 'negative'
                      : nextEvent.hasPublishedFormation
                        ? 'positive'
                        : 'neutral'
                  }
                />
              </MetricRow>

              <PanelBody className="border-cva-border flex flex-col gap-3 border-t">
                {nextEvent.formationNeedsReview ? (
                  <Callout tone="warning" title="A formação precisa de revisão">
                    {formation?.reviewReason ??
                      'A lista de confirmados mudou depois da publicação dos times.'}
                  </Callout>
                ) : !nextEvent.hasPublishedFormation && readyForTeams ? (
                  <Callout tone="success" title="Lista completa">
                    Os {nextEvent.capacity} confirmados estão fechados. Dá para gerar os times.
                  </Callout>
                ) : !readyForTeams ? (
                  <Callout tone="info">
                    Faltam {spotsLeft} {spotsLeft === 1 ? 'confirmação' : 'confirmações'} para
                    fechar a lista e montar os times no modo padrão.
                  </Callout>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/eventos/${nextEvent.id}/presencas`}
                    className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/50 rounded-md border px-3.5 py-2 text-sm font-semibold"
                  >
                    Presenças
                  </Link>
                  <Link
                    href={`/admin/eventos/${nextEvent.id}/times`}
                    className="bg-cva-gold-500 text-cva-navy-950 hover:bg-cva-gold-600 rounded-md px-3.5 py-2 text-sm font-semibold hover:text-white"
                  >
                    {nextEvent.hasPublishedFormation ? 'Ajustar times' : 'Gerar times'}
                  </Link>
                  {nextEvent.hasPublishedFormation ? (
                    <Link
                      href={`/admin/eventos/${nextEvent.id}/quadra`}
                      className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/50 rounded-md border px-3.5 py-2 text-sm font-semibold"
                    >
                      Painel de quadra
                    </Link>
                  ) : null}
                </div>
              </PanelBody>
            </Panel>
          ) : (
            <EmptyState
              title="Nenhum encontro publicado"
              description="Crie o próximo encontro para o grupo começar a confirmar presença."
              action={
                <Link
                  href="/admin/eventos"
                  className="bg-cva-navy-900 rounded-md px-4 py-2 text-sm font-semibold text-white"
                >
                  Criar encontro
                </Link>
              }
            />
          )}

          <Panel>
            <PanelHeader
              title="Últimos encontros"
              actions={
                <Link
                  href="/admin/historico"
                  className="text-cva-blue-700 text-sm underline underline-offset-4"
                >
                  Ver histórico
                </Link>
              }
            />
            <PanelBody flush>
              {recentEvents.length === 0 ? (
                <div className="text-cva-text-muted px-4 py-6 text-sm sm:px-5">
                  Nenhum encontro finalizado ainda.
                </div>
              ) : (
                <ul className="divide-cva-border divide-y">
                  {recentEvents.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/admin/eventos/${event.id}`}
                        className="hover:bg-cva-blue-100/35 flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="text-cva-text truncate text-sm font-medium">
                            {event.title}
                          </p>
                          <p className="text-cva-text-muted text-xs">
                            {formatEventDate(event.eventDate)} · {event.confirmedCount} atletas
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

        {/* ---- Coluna de pendências ---------------------------------------- */}
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Caixa do grupo" />
            <PanelBody className="flex flex-col gap-3">
              <div>
                <p className="text-cva-text-muted text-xs font-medium tracking-wide uppercase">
                  Saldo disponível
                </p>
                <p
                  data-numeric
                  className={`mt-0.5 text-3xl font-bold tracking-tight ${
                    cash.balanceCents < 0 ? 'text-cva-danger' : 'text-cva-navy-900'
                  }`}
                >
                  {formatCents(cash.balanceCents)}
                </p>
                <p className="text-cva-text-muted mt-0.5 text-xs">
                  Considera apenas o que já entrou e saiu de fato.
                </p>
              </div>

              {cash.pendingCents > 0 ? (
                <Callout tone="warning">
                  {formatCents(cash.pendingCents)} ainda a receber — não entram no saldo.
                </Callout>
              ) : null}

              <Link
                href="/admin/financeiro"
                className="text-cva-blue-700 text-sm underline underline-offset-4"
              >
                Abrir financeiro
              </Link>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Cadastros aguardando"
              description={`${pendingRegistrations.length} pendente(s)`}
            />
            <PanelBody flush>
              {pendingRegistrations.length === 0 ? (
                <div className="text-cva-text-muted px-4 py-5 text-sm sm:px-5">
                  Nenhum cadastro aguardando aprovação.
                </div>
              ) : (
                <ul className="divide-cva-border divide-y">
                  {pendingRegistrations.slice(0, 5).map((registration) => (
                    <li key={registration.userId} className="px-4 py-3 sm:px-5">
                      <p className="text-cva-text text-sm font-medium">{registration.name}</p>
                      <p className="text-cva-text-muted truncate text-xs">{registration.email}</p>
                      {registration.possibleMatchName ? (
                        <p className="text-cva-warning mt-1 text-xs">
                          Possível duplicidade com {registration.possibleMatchName}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
            {pendingRegistrations.length > 0 ? (
              <div className="border-cva-border border-t px-4 py-2.5 sm:px-5">
                <Link
                  href="/admin/atletas"
                  className="text-cva-blue-700 text-sm underline underline-offset-4"
                >
                  Revisar cadastros
                </Link>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader
              title="Avaliações provisórias"
              description="Atletas que já atingiram o número de participações para revisão."
            />
            <PanelBody flush>
              {provisionalDue.length === 0 ? (
                <div className="text-cva-text-muted px-4 py-5 text-sm sm:px-5">
                  Nenhuma revisão pendente.
                </div>
              ) : (
                <ul className="divide-cva-border divide-y">
                  {provisionalDue.map((item) => (
                    <li
                      key={item.athleteId}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-cva-text truncate text-sm font-medium">
                          {item.nickname ?? item.fullName}
                        </p>
                        <p className="text-cva-text-muted text-xs">
                          {item.participationsSinceEvaluation} participações desde a avaliação
                        </p>
                      </div>
                      <Link
                        href={`/admin/avaliacoes/${item.athleteId}`}
                        className="text-cva-blue-700 shrink-0 text-sm underline underline-offset-4"
                      >
                        Revisar
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
