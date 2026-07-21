import type { Metadata } from 'next';
import { Callout, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listOwnAffinities, listSelectableAthletes } from '@/server/services/affinities';
import { PreferencesForm } from './preferences-form';

export const metadata: Metadata = { title: 'Preferências' };

export default async function PreferenciasPage() {
  const actor = await getActor();

  if (!actor?.athleteId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Preferências" />
        <Callout tone="warning" title="Conta ainda não vinculada">
          Sua conta precisa estar ligada a um perfil de atleta. Fale com um administrador.
        </Callout>
      </div>
    );
  }

  const [athletes, existing] = await Promise.all([
    listSelectableAthletes(db, { actor, excludeAthleteId: actor.athleteId }),
    listOwnAffinities(db, { actor, athleteId: actor.athleteId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Preferências"
        description="Com quem você prefere jogar junto — ou separado. É privado."
      />

      <PreferencesForm
        athletes={athletes}
        existing={existing.map((item) => ({
          id: item.id,
          toAthleteId: item.toAthleteId,
          toDisplayName: item.toDisplayName,
          type: item.type,
          intensity: item.intensity,
        }))}
      />
    </div>
  );
}
