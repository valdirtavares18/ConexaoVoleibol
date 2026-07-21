import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { getEvent } from '@/server/services/events';
import { getCourtPanel } from '@/server/services/rotation';
import { formatEventDate } from '@/server/services/sharing';
import { getPublishedFormation } from '@/server/services/team-formation';
import { CourtPanel } from './court-panel';
import { StartSession } from './start-session';

export const metadata: Metadata = { title: 'Painel de quadra' };

export default async function QuadraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();

  const event = await getEvent(db, { actor, eventId: id });
  if (!event) notFound();

  const [panel, formation] = await Promise.all([
    getCourtPanel(db, { actor, eventId: id }),
    getPublishedFormation(db, id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href={`/admin/eventos/${id}`} className="hover:underline">
            ← {event.title}
          </Link>
        }
        title="Painel de quadra"
        description={formatEventDate(event.eventDate)}
      />

      {panel ? (
        <CourtPanel eventId={id} panel={panel} />
      ) : formation ? (
        <StartSession eventId={id} teamNames={formation.teams.map((team) => team.name)} />
      ) : (
        <EmptyState
          title="Publique os times antes de começar"
          description="O rodízio precisa dos três times publicados para saber quem entra e quem aguarda."
          action={
            <Link
              href={`/admin/eventos/${id}/times`}
              className="bg-cva-navy-900 rounded-md px-4 py-2 text-sm font-semibold text-white"
            >
              Montar times
            </Link>
          }
        />
      )}
    </div>
  );
}
