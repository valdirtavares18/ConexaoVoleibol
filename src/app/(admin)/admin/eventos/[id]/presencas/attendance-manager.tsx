'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/ui/primitives';
import { SearchField } from '@/components/ui/search-field';
import { matches } from '@/lib/search';
import { reorderWaitlistAction, respondToEventAction } from '@/server/actions/attendance-actions';

/**
 * Gestão de presenças pelo administrador (§9.3).
 *
 * O admin responde em nome de qualquer atleta — inclusive dos perfis
 * gerenciados, que nem conta têm. A reordenação da fila usa botões de subir e
 * descer em vez de arrastar: funciona por teclado, no celular, e não depende de
 * gesto (§21).
 */

interface Entry {
  athleteId: string;
  displayName: string;
}

interface ConfirmedEntry extends Entry {
  slot: number;
}

interface WaitlistEntry extends Entry {
  position: number;
}

export function AttendanceManager({
  eventId,
  capacity,
  confirmed,
  waitlist,
  maybe,
  declined,
  noResponse,
}: {
  eventId: string;
  capacity: number;
  confirmed: ConfirmedEntry[];
  waitlist: WaitlistEntry[];
  maybe: Entry[];
  declined: Entry[];
  noResponse: Entry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [queue, setQueue] = useState(waitlist);
  const [availableQuery, setAvailableQuery] = useState('');
  const [confirmedQuery, setConfirmedQuery] = useState('');

  const respond = (athleteId: string, response: string): void => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('eventId', eventId);
      formData.set('athleteId', athleteId);
      formData.set('response', response);

      const result = await respondToEventAction({ ok: false, message: null }, formData);
      setFeedback({ ok: result.ok, message: result.message ?? '' });

      // Ações chamadas fora de `<form action>` não re-renderizam a árvore
      // servidor sozinhas. Sem isto, a lista continuaria mostrando o atleta que
      // acabou de ser confirmado.
      if (result.ok) router.refresh();
    });
  };

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= queue.length) return;

    const next = [...queue];
    const a = next[index] as WaitlistEntry;
    const b = next[target] as WaitlistEntry;
    next[index] = b;
    next[target] = a;
    setQueue(next);

    startTransition(async () => {
      const result = await reorderWaitlistAction(
        eventId,
        next.map((entry) => entry.athleteId),
      );
      setFeedback({ ok: result.ok, message: result.message ?? '' });
    });
  };

  const available = [...noResponse, ...maybe, ...declined];

  // Filtro no cliente: a lista já veio inteira e tem dezenas de nomes, não
  // milhares. Filtrar aqui responde a cada tecla, sem ida ao servidor.
  const visibleAvailable = available.filter((entry) => matches(availableQuery, entry.displayName));
  const visibleConfirmed = confirmed.filter((entry) => matches(confirmedQuery, entry.displayName));

  return (
    <div className="flex flex-col gap-5">
      {feedback ? (
        <Callout tone={feedback.ok ? 'success' : 'danger'}>{feedback.message}</Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="Confirmados"
          description={`${confirmed.length} de ${capacity} vagas`}
          actions={
            // A busca só aparece quando a lista já é grande o bastante para
            // justificar — num jogo com 5 confirmados ela só ocuparia espaço.
            confirmed.length > 8 ? (
              <SearchField
                className="w-56"
                label="Buscar entre os confirmados"
                value={confirmedQuery}
                onChange={setConfirmedQuery}
                resultCount={visibleConfirmed.length}
                totalCount={confirmed.length}
              />
            ) : null
          }
        />
        <PanelBody flush>
          {confirmed.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState title="Ninguém confirmou ainda" />
            </div>
          ) : visibleConfirmed.length === 0 ? (
            <p className="text-cva-text-muted px-4 py-4 text-sm sm:px-5">
              Nenhum confirmado com “{confirmedQuery}”.
            </p>
          ) : (
            <ul className="divide-cva-border divide-y">
              {visibleConfirmed.map((entry) => (
                <li
                  key={entry.athleteId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      data-numeric
                      aria-hidden="true"
                      className="text-cva-text-muted w-5 shrink-0 text-xs"
                    >
                      {entry.slot}
                    </span>
                    <span className="text-cva-text truncate text-sm">{entry.displayName}</span>
                  </span>

                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => respond(entry.athleteId, 'cancelar')}
                  >
                    Cancelar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      {queue.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Lista de espera"
            description="A ordem define quem entra quando alguém cancela."
          />
          <PanelBody flush>
            <ol className="divide-cva-border divide-y">
              {queue.map((entry, index) => (
                <li
                  key={entry.athleteId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Badge tone="warning">{index + 1}º</Badge>
                    <span className="text-cva-text truncate text-sm">{entry.displayName}</span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Subir ${entry.displayName} na fila`}
                      disabled={pending || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Descer ${entry.displayName} na fila`}
                      disabled={pending || index === queue.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => respond(entry.athleteId, 'nao_participar')}
                    >
                      Remover
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Confirmar em nome de um atleta"
          description="Inclui quem ainda não tem conta no sistema."
          actions={
            available.length > 8 ? (
              <SearchField
                className="w-56"
                label="Buscar atleta para confirmar"
                placeholder="Buscar atleta…"
                value={availableQuery}
                onChange={setAvailableQuery}
                resultCount={visibleAvailable.length}
                totalCount={available.length}
              />
            ) : null
          }
        />
        <PanelBody flush>
          {available.length === 0 ? (
            <p className="text-cva-text-muted px-4 py-4 text-sm sm:px-5">
              Todos os atletas do grupo já responderam.
            </p>
          ) : visibleAvailable.length === 0 ? (
            <p className="text-cva-text-muted px-4 py-4 text-sm sm:px-5">
              Nenhum atleta com “{availableQuery}”.
            </p>
          ) : (
            <ul className="divide-cva-border divide-y">
              {visibleAvailable.map((entry) => (
                <li
                  key={entry.athleteId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <span className="text-cva-text truncate text-sm">{entry.displayName}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => respond(entry.athleteId, 'confirmar')}
                  >
                    Confirmar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
