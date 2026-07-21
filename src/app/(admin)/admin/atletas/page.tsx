import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AthleteAvatar,
  Badge,
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { POSITION_BY_CODE } from '@/domain/positions';
import { getActor } from '@/server/context';
import { listAthletes, listPendingRegistrations } from '@/server/services/athletes';
import { RegistrationDecision } from './registration-decision';

export const metadata: Metadata = { title: 'Atletas' };

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

export default async function AdminAtletasPage() {
  const actor = await getActor();

  const [athletes, pending] = await Promise.all([
    listAthletes(db, { actor, includeInactive: true }),
    listPendingRegistrations(db, actor),
  ]);

  const withoutAccount = athletes.filter((a) => !a.hasAccount).length;
  const withoutEvaluation = athletes.filter((a) => a.officialOverall === null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atletas"
        description={`${athletes.length} no grupo · ${withoutAccount} sem conta · ${withoutEvaluation} sem avaliação oficial`}
        actions={
          <Link
            href="/admin/atletas/novo"
            className="bg-cva-navy-900 hover:bg-cva-navy-800 rounded-md px-4 py-2 text-sm font-semibold text-white"
          >
            Cadastrar atleta
          </Link>
        }
      />

      {pending.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Cadastros aguardando aprovação"
            description={`${pending.length} pessoa(s) criaram conta e aguardam liberação.`}
          />
          <PanelBody flush>
            <ul className="divide-cva-border divide-y">
              {pending.map((registration) => (
                <li key={registration.userId} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-cva-navy-900 text-sm font-semibold">{registration.name}</p>
                      <p className="text-cva-text-muted truncate text-xs">{registration.email}</p>
                    </div>
                  </div>

                  {registration.possibleMatchName ? (
                    <div className="mt-3">
                      <Callout tone="warning" title="Possível duplicidade">
                        Já existe um perfil chamado{' '}
                        <strong>{registration.possibleMatchName}</strong> com o mesmo e-mail.
                        Vincular a conta a ele evita um cadastro repetido.
                      </Callout>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <RegistrationDecision
                      userId={registration.userId}
                      name={registration.name}
                      matchAthleteId={registration.possibleMatchAthleteId}
                      matchName={registration.possibleMatchName}
                      athletes={athletes
                        .filter((a) => !a.hasAccount)
                        .map((a) => ({ id: a.id, displayName: a.nickname ?? a.fullName }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader title="Todos os atletas" />
        <PanelBody flush>
          {athletes.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhum atleta cadastrado"
                description="Cadastre os atletas do grupo para começar a montar jogos."
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
                {athletes.map((athlete) => {
                  const href = `/admin/atletas/${athlete.id}`;

                  // Linha inteira clicável; ver a nota em `/admin/eventos/page.tsx`
                  // sobre por que o link fica dentro da célula.
                  const cellLink = (content: React.ReactNode, first = false) => (
                    <Link
                      href={href}
                      tabIndex={first ? undefined : -1}
                      aria-hidden={first ? undefined : true}
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
                            tone={
                              STATUS_TONE[athlete.status as keyof typeof STATUS_TONE] ?? 'neutral'
                            }
                            dot
                          >
                            {STATUS_LABEL[athlete.status as keyof typeof STATUS_LABEL] ??
                              athlete.status}
                          </Badge>,
                        )}
                      </TD>
                      <TD align="right">
                        {/* Ação explícita: a linha inteira leva ao mesmo lugar,
                            mas "Editar" deixa claro o que acontece ao clicar. */}
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
    </div>
  );
}
