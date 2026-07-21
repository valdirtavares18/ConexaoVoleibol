import type { Metadata } from 'next';
import {
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
import { getActor } from '@/server/context';
import { listAllAffinities, listSelectableAthletes } from '@/server/services/affinities';
import { AffinityForm } from './affinity-form';

export const metadata: Metadata = { title: 'Afinidades' };

const INTENSITY_LABEL: Record<number, string> = {
  3: 'Muito forte — juntos',
  2: 'Forte — juntos',
  1: 'Leve — juntos',
  [-1]: 'Leve — separados',
  [-2]: 'Forte — separados',
  [-3]: 'Muito forte — separados',
};

export default async function AfinidadesPage() {
  const actor = await getActor();

  const [affinities, athletes] = await Promise.all([
    listAllAffinities(db, actor),
    listSelectableAthletes(db, { actor }),
  ]);

  const mandatory = affinities.filter((a) => a.rigidity === 'restricao_obrigatoria');
  const flexible = affinities.filter((a) => a.rigidity === 'preferencia_flexivel');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Afinidades"
        description="Preferências são direcionais: A → B não implica B → A."
      />

      <Callout tone="info" title="Como o gerador usa isto">
        Restrições obrigatórias <strong>nunca</strong> são violadas — são filtro, não penalidade.
        Preferências flexíveis são consideradas apenas entre as combinações que já respeitam o
        limite de desequilíbrio: afinidade nunca passa à frente do equilíbrio.
      </Callout>

      <AffinityForm athletes={athletes} />

      <Panel>
        <PanelHeader
          title="Restrições obrigatórias"
          description={`${mandatory.length} — só administradores podem criar.`}
        />
        <PanelBody flush>
          {mandatory.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhuma restrição obrigatória"
                description="Use apenas quando dois atletas realmente não podem ficar no mesmo time."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TH>De</TH>
                <TH>Para</TH>
                <TH width="8rem" align="center">
                  Tipo
                </TH>
                <TH width="10rem" align="center">
                  Regra
                </TH>
                <TH>Motivo</TH>
              </THead>
              <TBody>
                {mandatory.map((affinity) => (
                  <TR key={affinity.id}>
                    <TD>{affinity.fromDisplayName}</TD>
                    <TD>{affinity.toDisplayName}</TD>
                    <TD align="center" className="text-cva-text-muted">
                      {affinity.type === 'pessoal' ? 'Pessoal' : 'Tática'}
                    </TD>
                    <TD align="center">
                      <Badge tone={affinity.intensity < 0 ? 'danger' : 'success'} dot>
                        {affinity.intensity < 0 ? 'Sempre separados' : 'Sempre juntos'}
                      </Badge>
                    </TD>
                    <TD className="text-cva-text-muted text-xs">{affinity.note ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Preferências flexíveis"
          description={`${flexible.length} cadastradas pelos atletas e pelos administradores.`}
        />
        <PanelBody flush>
          {flexible.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState title="Nenhuma preferência cadastrada" />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TH>De</TH>
                <TH>Para</TH>
                <TH width="7rem" align="center">
                  Tipo
                </TH>
                <TH width="11rem" align="center">
                  Intensidade
                </TH>
                <TH width="7rem" align="center">
                  Mútua
                </TH>
              </THead>
              <TBody>
                {flexible.map((affinity) => (
                  <TR key={affinity.id}>
                    <TD>{affinity.fromDisplayName}</TD>
                    <TD>{affinity.toDisplayName}</TD>
                    <TD align="center" className="text-cva-text-muted">
                      {affinity.type === 'pessoal' ? 'Pessoal' : 'Tática'}
                    </TD>
                    <TD align="center">
                      <Badge tone={affinity.intensity > 0 ? 'success' : 'danger'}>
                        {INTENSITY_LABEL[affinity.intensity] ?? affinity.intensity}
                      </Badge>
                    </TD>
                    <TD align="center">
                      {affinity.mutual ? (
                        <Badge tone="info">Mútua</Badge>
                      ) : (
                        <span className="text-cva-text-muted text-xs">unilateral</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
