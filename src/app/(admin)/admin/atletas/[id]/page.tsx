import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AthleteAvatar, Badge, Panel, PanelBody, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getAthlete, getAthletePositions } from '@/server/services/athletes';
import { getOfficialEvaluation } from '@/server/services/evaluations';
import { AthleteForm } from '../athlete-form';
import { DeactivateAthlete } from './deactivate-athlete';

export const metadata: Metadata = { title: 'Atleta' };

export default async function AdminAtletaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();

  const athlete = await getAthlete(db, { actor, athleteId: id });
  if (!athlete) notFound();

  const [positions, evaluation] = await Promise.all([
    getAthletePositions(db, id),
    // Administrador sempre enxerga; o flag de visibilidade só afeta o atleta.
    getOfficialEvaluation(db, { actor, athleteId: id, selfVisible: false }),
  ]);

  // `sanitizeAthlete` mantém estes campos porque quem consulta é administrador.
  const full = athlete as typeof athlete & {
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    uniformSize?: string | null;
    adminNotes?: string | null;
    healthRestrictions?: string | null;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/admin/atletas" className="hover:underline">
            ← Atletas
          </Link>
        }
        title={athlete.fullName}
        description={athlete.nickname ? `“${athlete.nickname}”` : undefined}
        actions={
          <Link
            href={`/admin/avaliacoes/${id}`}
            className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/50 rounded-md border px-3.5 py-2 text-sm font-semibold"
          >
            Avaliar
          </Link>
        }
      />

      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-4">
          <AthleteAvatar name={athlete.fullName} avatarUrl={athlete.avatarUrl} size={56} />
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={athlete.status === 'ativo' ? 'success' : 'warning'} dot>
              {athlete.status}
            </Badge>
            {athlete.shirtNumber ? (
              <Badge tone="neutral">Camisa {athlete.shirtNumber}</Badge>
            ) : null}
            {evaluation ? (
              <Badge tone={evaluation.status === 'provisoria' ? 'warning' : 'info'}>
                Nota oficial {evaluation.overall?.toFixed(1) ?? '—'}
                {evaluation.status === 'provisoria' ? ' (provisória)' : ''}
              </Badge>
            ) : (
              <Badge tone="danger">Sem avaliação oficial</Badge>
            )}
          </div>
        </PanelBody>
      </Panel>

      <AthleteForm
        initial={{
          athleteId: id,
          fullName: athlete.fullName,
          nickname: athlete.nickname ?? '',
          phone: full.phone ?? '',
          email: full.email ?? '',
          birthDate: full.birthDate ?? '',
          shirtNumber: athlete.shirtNumber ? String(athlete.shirtNumber) : '',
          uniformSize: full.uniformSize ?? '',
          status: athlete.status,
          adminNotes: full.adminNotes ?? '',
          healthRestrictions: full.healthRestrictions ?? '',
          primaryPosition: positions.primary ?? '',
          secondaryPositions: positions.secondary,
          unwantedPositions: positions.unwanted,
        }}
      />

      <DeactivateAthlete athleteId={id} name={athlete.fullName} />
    </div>
  );
}
