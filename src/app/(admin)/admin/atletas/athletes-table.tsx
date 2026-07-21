'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AthleteAvatar, Badge, EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { SearchField } from '@/components/ui/search-field';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { POSITION_BY_CODE, type PositionCode } from '@/domain/positions';
import { matches } from '@/lib/search';

/**
 * Tabela de atletas com busca.
 *
 * É componente cliente só por causa do filtro — os dados continuam vindo do
 * servidor já sanitizados por `listAthletes`. Nada sensível passa a existir
 * aqui: `officialOverall` só vem preenchido para administradores, decidido no
 * servidor.
 */

export interface AthleteRow {
  id: string;
  fullName: string;
  nickname: string | null;
  avatarUrl: string | null;
  shirtNumber: number | null;
  status: string;
  primaryPosition: PositionCode | null;
  hasAccount: boolean;
  officialOverall: number | null;
  evaluationStatus: 'provisoria' | 'definitiva' | null;
}

const STATUS_TONE = {
  ativo: 'success',
  lesionado: 'warning',
  afastado: 'warning',
  inativo: 'neutral',
} as const;

const STATUS_LABEL = {
  ativo: 'Ativo',
  lesionado: 'Lesionado',
  afastado: 'Afastado',
  inativo: 'Inativo',
} as const;

export function AthletesTable({ athletes }: { athletes: AthleteRow[] }) {
  const [query, setQuery] = useState('');

  const visible = athletes.filter((athlete) =>
    matches(
      query,
      athlete.fullName,
      athlete.nickname,
      athlete.shirtNumber !== null ? String(athlete.shirtNumber) : null,
      athlete.primaryPosition ? POSITION_BY_CODE[athlete.primaryPosition].name : null,
    ),
  );

  return (
    <Panel>
      <PanelHeader
        title="Todos os atletas"
        actions={
          <SearchField
            className="w-64"
            label="Buscar atleta"
            placeholder="Nome, apelido, camisa ou posição…"
            value={query}
            onChange={setQuery}
            resultCount={visible.length}
            totalCount={athletes.length}
          />
        }
      />
      <PanelBody flush>
        {athletes.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              title="Nenhum atleta cadastrado"
              description="Cadastre os atletas do grupo para começar a montar jogos."
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              title={`Nenhum atleta com “${query}”`}
              description="Tente outro nome, apelido, número de camisa ou posição."
            />
          </div>
        ) : (
          <TableWrap>
            <THead>
              <TH>Atleta</TH>
              <TH width="8rem">Posição</TH>
              <TH width="6rem" align="center">
                Camisa
              </TH>
              <TH width="8rem" align="center">
                Avaliação
              </TH>
              <TH width="7rem" align="center">
                Conta
              </TH>
              <TH width="7rem" align="center">
                Situação
              </TH>
              <TH width="6rem" align="right">
                Ações
              </TH>
            </THead>
            <TBody>
              {visible.map((athlete) => {
                const href = `/admin/atletas/${athlete.id}`;

                // Linha inteira clicável; só o link do nome é anunciado.
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
                  <TR key={athlete.id} className="cursor-pointer">
                    <TD className="p-0">
                      {cellLink(
                        <span className="flex items-center gap-2.5">
                          <AthleteAvatar
                            name={athlete.fullName}
                            avatarUrl={athlete.avatarUrl}
                            size={32}
                          />
                          <span className="min-w-0">
                            <span className="text-cva-navy-900 block truncate text-sm font-medium">
                              {athlete.fullName}
                            </span>
                            {athlete.nickname ? (
                              <span className="text-cva-text-muted block truncate text-xs">
                                {athlete.nickname}
                              </span>
                            ) : null}
                          </span>
                        </span>,
                        true,
                      )}
                    </TD>
                    <TD className="text-cva-text-muted p-0 text-sm">
                      {cellLink(
                        athlete.primaryPosition
                          ? POSITION_BY_CODE[athlete.primaryPosition].name
                          : '—',
                      )}
                    </TD>
                    <TD align="center" numeric className="p-0">
                      {cellLink(athlete.shirtNumber ?? '—')}
                    </TD>
                    <TD align="center" numeric className="p-0">
                      {cellLink(
                        athlete.officialOverall === null ? (
                          <Badge tone="warning">Sem avaliação</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-cva-navy-900 font-semibold">
                              {athlete.officialOverall.toFixed(1)}
                            </span>
                            {athlete.evaluationStatus === 'provisoria' ? (
                              <Badge tone="warning">Provisória</Badge>
                            ) : null}
                          </span>
                        ),
                      )}
                    </TD>
                    <TD align="center" className="p-0">
                      {cellLink(
                        <Badge tone={athlete.hasAccount ? 'info' : 'neutral'}>
                          {athlete.hasAccount ? 'Vinculada' : 'Sem conta'}
                        </Badge>,
                      )}
                    </TD>
                    <TD align="center" className="p-0">
                      {cellLink(
                        <Badge
                          tone={STATUS_TONE[athlete.status as keyof typeof STATUS_TONE] ?? 'neutral'}
                          dot
                        >
                          {STATUS_LABEL[athlete.status as keyof typeof STATUS_LABEL] ??
                            athlete.status}
                        </Badge>,
                      )}
                    </TD>
                    <TD align="right">
                      <Link
                        href={href}
                        className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/60 inline-flex h-8 items-center rounded-md border px-3 text-sm font-semibold"
                      >
                        Editar
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </PanelBody>
    </Panel>
  );
}
