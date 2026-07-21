import type { Metadata } from 'next';
import { Callout, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listAthletes } from '@/server/services/athletes';
import { listProvisionalReviewsDue } from '@/server/services/evaluations';
import { EvaluationsTable } from './evaluations-table';

export const metadata: Metadata = { title: 'Avaliações' };

export default async function AvaliacoesPage() {
  const actor = await getActor();

  const [athletes, provisionalDue] = await Promise.all([
    listAthletes(db, { actor }),
    listProvisionalReviewsDue(db, actor),
  ]);

  const withoutEvaluation = athletes.filter((a) => a.officialOverall === null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avaliações"
        description="A avaliação oficial é a única fonte do gerador de times. A autoavaliação é referência."
      />

      {provisionalDue.length > 0 ? (
        <Callout
          tone="warning"
          title={`${provisionalDue.length} avaliação(ões) provisória(s) para revisar`}
        >
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

      <EvaluationsTable
        athletes={athletes.map((athlete) => ({
          id: athlete.id,
          fullName: athlete.fullName,
          nickname: athlete.nickname,
          primaryPosition: athlete.primaryPosition,
          officialOverall: athlete.officialOverall,
          evaluationStatus: athlete.evaluationStatus,
        }))}
        dueIds={provisionalDue.map((item) => item.athleteId)}
      />
    </div>
  );
}
