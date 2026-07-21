import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Callout, EmptyState, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { InsufficientPlayersError, isDomainError } from '@/domain/shared/errors';
import { computeStrengths, DEFAULT_WEIGHTS } from '@/domain/team-balancing';
import { getActor, getClubSettings, maxImbalancePct } from '@/server/context';
import { getEvent } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';
import { buildBalancingContext, generateOptionsForEvent } from '@/server/services/team-formation';
import { TeamBuilder, type BuilderPlayer } from './team-builder';

export const metadata: Metadata = { title: 'Montar times' };

export default async function AdminTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ override?: string; seed?: string }>;
}) {
  const { id } = await params;
  const { override, seed } = await searchParams;

  const actor = await getActor();
  const settings = await getClubSettings();

  const event = await getEvent(db, { actor, eventId: id });
  if (!event) notFound();

  const allowUnevenTeams = override === '1';
  const seedNumber = seed ? Number(seed) : undefined;

  let result;
  let error: string | null = null;

  try {
    result = await generateOptionsForEvent(db, {
      actor,
      eventId: id,
      allowUnevenTeams,
      ...(seedNumber !== undefined && Number.isFinite(seedNumber) ? { seed: seedNumber } : {}),
    });
  } catch (caught) {
    if (caught instanceof InsufficientPlayersError || isDomainError(caught)) {
      error = caught.message;
    } else {
      throw caught;
    }
  }

  const header = (
    <PageHeader
      eyebrow={
        <Link href={`/admin/eventos/${id}`} className="hover:underline">
          ← {event.title}
        </Link>
      }
      title="Montar times"
      description={`${formatEventDate(event.eventDate)} · ${event.confirmedCount} de ${event.capacity} confirmados`}
    />
  );

  if (error || !result) {
    return (
      <div className="flex flex-col gap-6">
        {header}

        <EmptyState
          title="Ainda não dá para montar os times no modo padrão"
          description={error ?? 'Não foi possível gerar as opções.'}
          action={
            <div className="flex flex-col items-center gap-3">
              <Link
                href={`/admin/eventos/${id}/presencas`}
                className="bg-cva-navy-900 rounded-md px-4 py-2 text-sm font-semibold text-white"
              >
                Ver presenças
              </Link>
              {/*
                Override administrativo explícito (§10): times desiguais só saem
                daqui, com o admin sabendo o que está fazendo.
              */}
              {!allowUnevenTeams ? (
                <Link
                  href={`/admin/eventos/${id}/times?override=1`}
                  className="text-cva-text-muted text-xs underline underline-offset-4"
                >
                  Montar mesmo assim, com times de tamanhos diferentes
                </Link>
              ) : null}
            </div>
          }
        />
      </div>
    );
  }

  // As forças vêm calculadas do servidor: o cliente reordena e recalcula somas,
  // mas nunca reinterpreta avaliação.
  const context = await buildBalancingContext(db, id);
  const strengths = computeStrengths(context.input.players, {
    ...DEFAULT_WEIGHTS,
    ...context.weights,
  });

  const players: BuilderPlayer[] = context.input.players.map((player) => ({
    id: player.id,
    displayName: player.displayName,
    strength: strengths.get(player.id)?.value ?? 0,
    primaryPosition: player.primaryPosition,
    isProvisional: player.isProvisional,
    isUnrated: strengths.get(player.id)?.isUnrated ?? false,
  }));

  const teamPresets = (settings.teamPresets as { name?: string }[] | null) ?? [];
  const teamNames = Array.from(
    { length: event.capacity > 0 ? (result.options[0]?.teams.length ?? 3) : 3 },
    (_, index) => teamPresets[index]?.name ?? `Time ${String.fromCharCode(65 + index)}`,
  );

  return (
    <div className="flex flex-col gap-6">
      {header}

      {allowUnevenTeams ? (
        <Callout tone="warning" title="Override administrativo ativo">
          Os times estão sendo montados com tamanhos diferentes porque o número de confirmados não
          fecha a divisão exata.
        </Callout>
      ) : null}

      <TeamBuilder
        eventId={id}
        options={[...result.options]}
        players={players}
        maxImbalancePct={maxImbalancePct(settings)}
        limitNotReached={result.limitNotReached}
        limitBlockers={[...result.limitBlockers]}
        bestAchievableDiffPct={result.provenance.bestAchievableDiffPct}
        provenance={result.provenance}
        teamNames={teamNames}
      />
    </div>
  );
}
