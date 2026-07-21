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
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listAllEvents } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';
import { NewEventForm } from './new-event-form';

export const metadata: Metadata = { title: 'Jogos' };

const STATUS = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  publicado: { label: 'Publicado', tone: 'success' },
  em_andamento: { label: 'Em andamento', tone: 'gold' },
  finalizado: { label: 'Finalizado', tone: 'info' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
} as const;

const TYPE_LABELS: Record<string, string> = {
  treino: 'Treino',
  amistoso: 'Amistoso',
  campeonato: 'Campeonato',
  confraternizacao: 'Confraternização',
  outro: 'Outro',
};

export default async function AdminJogosPage() {
  const actor = await getActor();
  const events = await listAllEvents(db, { actor, limit: 60 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jogos"
        description={`${events.length} registrado(s). Clique em um jogo para ver os detalhes, presenças, times e financeiro.`}
      />

      <NewEventForm />

      <Panel>
        <PanelHeader title="Todos os jogos" />
        <PanelBody flush>
          {events.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhum jogo ainda"
                description="Crie o primeiro jogo para o grupo começar a confirmar presença."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TH width="8rem">Data</TH>
                <TH>Jogo</TH>
                <TH width="8rem" align="center">
                  Confirmados
                </TH>
                <TH width="8rem" align="center">
                  Times
                </TH>
                <TH width="8rem" align="center">
                  Situação
                </TH>
                <TH width="3rem" />
              </THead>
              <TBody>
                {events.map((event) => {
                  const status = STATUS[event.status as keyof typeof STATUS];
                  const href = `/admin/eventos/${event.id}`;

                  /*
                   * A linha inteira é clicável, não só o título. Um alvo de
                   * clique do tamanho de uma palavra numa tabela larga obriga a
                   * mirar — e a coluna útil muda conforme o que se procura.
                   *
                   * O link fica dentro de cada célula, e não envolvendo o `<tr>`:
                   * `<a>` não pode conter `<td>`, e envolver a linha quebraria a
                   * semântica da tabela para leitores de tela.
                   *
                   * Apenas o link do **título** é anunciado e recebe foco — é
                   * ele que descreve o destino. Os outros são decorativos, para
                   * não repetir seis vezes o mesmo link na navegação por
                   * teclado nem anunciar "24/07" como nome de um link.
                   */
                  const cellLink = (content: React.ReactNode, accessible = false) => (
                    <Link
                      href={href}
                      tabIndex={accessible ? undefined : -1}
                      aria-hidden={accessible ? undefined : true}
                      className="-mx-3 -my-2.5 block px-3 py-2.5"
                    >
                      {content}
                    </Link>
                  );

                  return (
                    <TR key={event.id} className="cursor-pointer">
                      <TD numeric className="text-cva-text-muted p-0 whitespace-nowrap">
                        {cellLink(formatEventDate(event.eventDate).split(', ')[1])}
                      </TD>
                      <TD className="p-0">
                        {cellLink(
                          <>
                            <span className="text-cva-navy-900 block font-medium">
                              {event.title}
                              {TYPE_LABELS[event.type] ? (
                                <span className="text-cva-text-muted font-normal">
                                  {' '}
                                  · {TYPE_LABELS[event.type]}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-cva-text-muted block text-xs">
                              {[
                                event.startTime ? event.startTime.slice(0, 5) : null,
                                event.venueName,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'sem local definido'}
                            </span>
                          </>,
                          true,
                        )}
                      </TD>
                      <TD align="center" numeric className="p-0">
                        {cellLink(
                          <>
                            {event.confirmedCount}/{event.capacity}
                            {event.waitlistCount > 0 ? (
                              <span className="text-cva-warning block text-xs">
                                +{event.waitlistCount} na espera
                              </span>
                            ) : null}
                          </>,
                        )}
                      </TD>
                      <TD align="center" className="p-0">
                        {cellLink(
                          event.formationNeedsReview ? (
                            <Badge tone="warning">Revisar</Badge>
                          ) : event.hasPublishedFormation ? (
                            <Badge tone="success">Publicados</Badge>
                          ) : (
                            <Badge tone="neutral">Pendentes</Badge>
                          ),
                        )}
                      </TD>
                      <TD align="center" className="p-0">
                        {cellLink(
                          <Badge tone={status?.tone ?? 'neutral'} dot>
                            {status?.label ?? event.status}
                          </Badge>,
                        )}
                      </TD>
                      <TD align="right" className="text-cva-text-muted p-0">
                        {cellLink(<span aria-hidden="true">›</span>)}
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
