import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Callout, Panel, PanelBody, PanelHeader, PageHeader } from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { db } from '@/db/client';
import { POSITION_BY_CODE } from '@/domain/positions';
import { getActor } from '@/server/context';
import { listAthletes } from '@/server/services/athletes';
import { listProvisionalReviewsDue } from '@/server/services/evaluations';

export const metadata: Metadata = { title: 'Avaliações' };

export default async function AvaliacoesPage() {
  const actor = await getActor();

  const [athletes, provisionalDue] = await Promise.all([
    listAthletes(db, { actor }),
    listProvisionalReviewsDue(db, actor),
  ]);

  const dueIds = new Set(provisionalDue.map((item) => item.athleteId));
  const withoutEvaluation = athletes.filter((a) => a.officialOverall === null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avaliações"
        description="A avaliação oficial é a única fonte do gerador de times. A autoavaliação é referência."
      />

      {provisionalDue.length > 0 ? (
        <Callout tone="warning" title={`${provisionalDue.length} avaliação(ões) provisória(s) para revisar`}>
          Estes atletas já atingiram o número de participações definido nas configurações. O
          sistema apenas avisa — nenhuma nota muda sozinha.
        </Callout>
      ) : null}

      {withoutEvaluation.length > 0 ? (
        <Callout tone="info" title={`${withoutEvaluation.length} atleta(s) sem avaliação oficial`}>
          Sem nota, o gerador usa a mediana do grupo como estimativa e sinaliza o atleta na
          formação.
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader title="Atletas" description={`${athletes.length} no grupo`} />
        <PanelBody flush>
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
              {athletes.map((athlete) => (
                <TR key={athlete.id} highlighted={dueIds.has(athlete.id)}>
                  <TD>
                    <span className="text-cva-navy-900 font-medium">{athlete.fullName}</span>
                    {athlete.nickname ? (
                      <span className="text-cva-text-muted block text-xs">
                        {athlete.nickname}
                      </span>
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
                    ) : dueIds.has(athlete.id) ? (
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
                      className="text-cva-blue-700 text-sm underline underline-offset-4"
                    >
                      Avaliar
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </PanelBody>
      </Panel>
    </div>
  );
}
