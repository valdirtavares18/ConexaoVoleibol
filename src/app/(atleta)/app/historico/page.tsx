import type { Metadata } from 'next';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { eventParticipants, events } from '@/db/schema';
import { getActor } from '@/server/context';
import { requireActive } from '@/server/policies';
import { formatEventDate } from '@/server/services/sharing';

export const metadata: Metadata = { title: 'Histórico' };

const PRESENT_STATUSES = [
  'presente',
  'confirmado',
  'chegou_atrasado',
  'saiu_antecipadamente',
] as const;
const ABSENT_STATUSES = [
  'faltou',
  'falta_sem_aviso',
  'falta_avisada',
  'cancelou_apos_prazo',
] as const;

const STATUS_LABELS: Record<string, string> = {
  presente: 'Presente',
  confirmado: 'Presente',
  chegou_atrasado: 'Chegou atrasado',
  saiu_antecipadamente: 'Saiu antes',
  faltou: 'Faltou',
  falta_avisada: 'Falta avisada',
  falta_sem_aviso: 'Falta sem aviso',
  cancelou_apos_prazo: 'Cancelou em cima da hora',
  nao_participa: 'Não participou',
  lista_espera: 'Ficou na lista de espera',
  talvez: 'Não respondeu',
};

/**
 * Histórico pessoal do atleta.
 *
 * Mostra presença e participação — **não** desempenho comparado a terceiros.
 * Não existe ranking no CVA (§4), então nada aqui posiciona o atleta em relação
 * aos outros.
 */
export default async function HistoricoPage() {
  const actor = await getActor();
  requireActive(actor);

  if (!actor?.athleteId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Histórico" />
        <EmptyState
          title="Sem histórico ainda"
          description="Sua conta ainda não está vinculada a um perfil de atleta."
        />
      </div>
    );
  }

  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      eventDate: events.eventDate,
      eventStatus: events.status,
      status: eventParticipants.status,
    })
    .from(eventParticipants)
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .where(
      and(
        eq(eventParticipants.athleteId, actor.athleteId),
        inArray(events.status, ['finalizado', 'cancelado']),
      ),
    )
    .orderBy(sql`${events.eventDate} desc`)
    .limit(60);

  const finished = rows.filter((row) => row.eventStatus === 'finalizado');
  const present = finished.filter((row) =>
    (PRESENT_STATUSES as readonly string[]).includes(row.status),
  ).length;
  const absent = finished.filter((row) =>
    (ABSENT_STATUSES as readonly string[]).includes(row.status),
  ).length;

  const rate = finished.length > 0 ? Math.round((present / finished.length) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Seu histórico" description="Presença nos jogos do grupo." />

      <Panel>
        <MetricRow>
          <Metric label="Jogos" value={finished.length} />
          <Metric label="Presenças" value={present} tone="positive" />
          <Metric label="Faltas" value={absent} tone={absent > 0 ? 'negative' : 'neutral'} />
          <Metric
            label="Aproveitamento"
            value={rate === null ? '—' : `${rate}%`}
            hint={rate === null ? 'Sem jogos finalizados' : undefined}
          />
        </MetricRow>
      </Panel>

      <Panel>
        <PanelHeader title="Jogo a jogo" />
        <PanelBody flush>
          {rows.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhum jogo registrado"
                description="Seu histórico começa a aparecer depois do primeiro jogo finalizado."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TH width="8rem">Data</TH>
                <TH>Jogo</TH>
                <TH align="right">Situação</TH>
              </THead>
              <TBody>
                {rows.map((row) => {
                  const wasPresent = (PRESENT_STATUSES as readonly string[]).includes(row.status);
                  const wasAbsent = (ABSENT_STATUSES as readonly string[]).includes(row.status);

                  return (
                    <TR key={row.eventId}>
                      <TD numeric className="text-cva-text-muted whitespace-nowrap">
                        {formatEventDate(row.eventDate).split(', ')[1]}
                      </TD>
                      <TD>{row.title}</TD>
                      <TD align="right">
                        {row.eventStatus === 'cancelado' ? (
                          <Badge tone="neutral">Jogo cancelado</Badge>
                        ) : (
                          <Badge
                            tone={wasPresent ? 'success' : wasAbsent ? 'danger' : 'neutral'}
                            dot
                          >
                            {STATUS_LABELS[row.status] ?? row.status}
                          </Badge>
                        )}
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
