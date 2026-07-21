'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { SearchField } from '@/components/ui/search-field';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { POSITION_BY_CODE, type PositionCode } from '@/domain/positions';
import { matches } from '@/lib/search';

export interface EvaluationRow {
  id: string;
  fullName: string;
  nickname: string | null;
  primaryPosition: PositionCode | null;
  officialOverall: number | null;
  evaluationStatus: 'provisoria' | 'definitiva' | null;
}

type Filter = 'todos' | 'pendentes';

export function EvaluationsTable({
  athletes,
  dueIds,
}: {
  athletes: EvaluationRow[];
  /** Atletas com avaliação provisória vencida. */
  dueIds: string[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');

  const due = new Set(dueIds);
  const isPending = (athlete: EvaluationRow): boolean =>
    athlete.officialOverall === null || due.has(athlete.id);

  const pendingCount = athletes.filter(isPending).length;

  const visible = athletes
    .filter((athlete) => (filter === 'pendentes' ? isPending(athlete) : true))
    .filter((athlete) =>
      matches(
        query,
        athlete.fullName,
        athlete.nickname,
        athlete.primaryPosition ? POSITION_BY_CODE[athlete.primaryPosition].name : null,
      ),
    );

  return (
    <Panel>
      <PanelHeader
        title="Atletas"
        description={`${athletes.length} no grupo`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/*
              Alternância simples em vez de menu: são dois estados e o que
              importa é ver rápido quem está pendente antes de um jogo.
            */}
            {pendingCount > 0 ? (
              <div
                role="group"
                aria-label="Filtrar avaliações"
                className="border-cva-border-strong flex overflow-hidden rounded-md border text-sm"
              >
                {(
                  [
                    ['todos', `Todos (${athletes.length})`],
                    ['pendentes', `Pendentes (${pendingCount})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                    className={
                      filter === key
                        ? 'bg-cva-navy-900 px-3 py-1.5 font-semibold text-white'
                        : 'bg-cva-panel text-cva-text hover:bg-cva-blue-100/60 px-3 py-1.5'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            <SearchField
              className="w-56"
              label="Buscar atleta"
              placeholder="Nome, apelido ou posição…"
              value={query}
              onChange={setQuery}
              resultCount={visible.length}
              totalCount={athletes.length}
            />
          </div>
        }
      />
      <PanelBody flush>
        {visible.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              title={query ? `Nenhum atleta com “${query}”` : 'Nenhuma avaliação pendente'}
              description={
                query
                  ? 'Tente outro nome, apelido ou posição.'
                  : 'Todo mundo está com a avaliação em dia.'
              }
            />
          </div>
        ) : (
          <TableWrap>
            <THead>
              <TH>Atleta</TH>
              <TH width="9rem">Posição</TH>
              <TH width="8rem" align="center">
                Nota oficial
              </TH>
              <TH width="10rem" align="center">
                Situação
              </TH>
              <TH width="7rem" align="right" />
            </THead>
            <TBody>
              {visible.map((athlete) => (
                <TR key={athlete.id} highlighted={due.has(athlete.id)}>
                  <TD>
                    <span className="text-cva-navy-900 font-medium">{athlete.fullName}</span>
                    {athlete.nickname ? (
                      <span className="text-cva-text-muted block text-xs">{athlete.nickname}</span>
                    ) : null}
                  </TD>
                  <TD className="text-cva-text-muted">
                    {athlete.primaryPosition
                      ? POSITION_BY_CODE[athlete.primaryPosition].name
                      : '—'}
                  </TD>
                  <TD align="center" numeric>
                    {athlete.officialOverall === null ? (
                      <span className="text-cva-text-muted">—</span>
                    ) : (
                      <span className="text-cva-navy-900 text-base font-semibold">
                        {athlete.officialOverall.toFixed(1)}
                      </span>
                    )}
                  </TD>
                  <TD align="center">
                    {athlete.officialOverall === null ? (
                      <Badge tone="danger">Sem avaliação</Badge>
                    ) : due.has(athlete.id) ? (
                      <Badge tone="warning" dot>
                        Revisar provisória
                      </Badge>
                    ) : athlete.evaluationStatus === 'provisoria' ? (
                      <Badge tone="warning">Provisória</Badge>
                    ) : (
                      <Badge tone="success">Definitiva</Badge>
                    )}
                  </TD>
                  <TD align="right">
                    <Link
                      href={`/admin/avaliacoes/${athlete.id}`}
                      className={
                        isPending(athlete)
                          ? 'bg-cva-gold-500 text-cva-navy-950 hover:bg-cva-gold-600 inline-flex h-8 items-center rounded-md px-3.5 text-sm font-semibold hover:text-white'
                          : 'border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/60 inline-flex h-8 items-center rounded-md border px-3.5 text-sm font-semibold'
                      }
                    >
                      {athlete.officialOverall === null ? 'Avaliar' : 'Revisar'}
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </PanelBody>
    </Panel>
  );
}
