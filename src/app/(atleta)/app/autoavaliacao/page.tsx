import type { Metadata } from 'next';
import { Callout, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getCurrentSelfAssessment } from '@/server/services/evaluations';
import { SelfAssessmentForm } from './self-assessment-form';

export const metadata: Metadata = { title: 'Autoavaliação' };

export default async function AutoavaliacaoPage() {
  const actor = await getActor();

  if (!actor?.athleteId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Autoavaliação" />
        <Callout tone="warning" title="Conta ainda não vinculada">
          Sua conta precisa estar ligada a um perfil de atleta para enviar a autoavaliação. Fale com
          um administrador do grupo.
        </Callout>
      </div>
    );
  }

  const current = await getCurrentSelfAssessment(db, actor.athleteId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Autoavaliação"
        description={
          current
            ? `Você já enviou a revisão ${current.revision}. Enviar de novo cria uma nova revisão e mantém as anteriores.`
            : 'Leve o tempo que precisar. Você pode reenviar quando quiser.'
        }
      />

      <SelfAssessmentForm
        current={
          current ? { overall: current.overall, skills: current.skills, note: current.note } : null
        }
      />
    </div>
  );
}
