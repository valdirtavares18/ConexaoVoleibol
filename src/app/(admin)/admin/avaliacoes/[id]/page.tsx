import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Panel, PanelBody, PanelHeader, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getAthlete } from '@/server/services/athletes';
import { compareAssessments, getEvaluationHistory } from '@/server/services/evaluations';
import { EvaluationForm } from './evaluation-form';

export const metadata: Metadata = { title: 'Avaliar atleta' };

export default async function AvaliarAtletaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();

  const athlete = await getAthlete(db, { actor, athleteId: id });
  if (!athlete) notFound();

  const [comparison, history] = await Promise.all([
    compareAssessments(db, { actor, athleteId: id }),
    getEvaluationHistory(db, { actor, athleteId: id }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/admin/avaliacoes" className="hover:underline">
            ← Avaliações
          </Link>
        }
        title={athlete.fullName}
        description={
          comparison.official
            ? `Avaliação vigente: ${comparison.official.overall?.toFixed(1) ?? '—'} (revisão ${comparison.official.revision})`
            : 'Este atleta ainda não tem avaliação oficial.'
        }
        actions={
          comparison.official?.status === 'provisoria' ? (
            <Badge tone="warning" dot>
              Provisória
            </Badge>
          ) : null
        }
      />

      <EvaluationForm
        athleteId={id}
        self={comparison.self}
        official={comparison.official}
        differences={comparison.differences}
      />

      <Panel>
        <PanelHeader
          title="Histórico de alterações"
          description="Registro imutável: nenhuma linha é editada ou apagada."
        />
        <PanelBody flush>
          {history.length === 0 ? (
            <p className="text-cva-text-muted px-4 py-4 text-sm sm:px-5">
              Nenhuma alteração registrada ainda.
            </p>
          ) : (
            <ul className="divide-cva-border divide-y">
              {history.map((entry) => (
                <li key={entry.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-cva-text text-sm">
                      {entry.changedAt.toLocaleString('pt-BR')}
                    </span>
                    <Badge tone={entry.status === 'provisoria' ? 'warning' : 'success'}>
                      {entry.status === 'provisoria' ? 'Provisória' : 'Definitiva'}
                    </Badge>
                  </div>
                  <p className="text-cva-text-muted mt-1 text-sm">{entry.justification}</p>
                  {entry.changes && Object.keys(entry.changes as object).length > 0 ? (
                    <ul className="text-cva-text-muted mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {Object.entries(entry.changes as Record<string, { anterior: unknown; novo: unknown }>).map(
                        ([key, change]) => (
                          <li key={key}>
                            <span className="font-medium">{key}</span>:{' '}
                            {String(change.anterior ?? '—')} → {String(change.novo ?? '—')}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
