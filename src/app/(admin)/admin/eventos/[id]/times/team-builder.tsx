'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Callout,
  Metric,
  MetricRow,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/ui/primitives';
import type { BalancingStrategy, FormationOption } from '@/domain/team-balancing';
import { publishFormationAction } from '@/server/actions/admin-actions';

/**
 * Montagem e ajuste dos times (§10.7 e §10.9).
 *
 * Duas decisões de interface que vale explicar:
 *
 * 1. **Troca por seleção, não só arrastar.** O drag & drop existe no desktop,
 *    mas a via principal é: clicar num atleta, clicar no destino. É acessível
 *    por teclado, funciona no celular e é mais rápida que arrastar — o §21 pede
 *    alternativa ao drag, e aqui a alternativa é a via padrão.
 *
 * 2. **As métricas são recalculadas no cliente a cada movimento.** O cálculo é o
 *    mesmo do servidor (forças pré-computadas vêm no payload), então o admin vê
 *    o impacto antes de confirmar, sem ida e volta de rede.
 */

export interface BuilderPlayer {
  id: string;
  displayName: string;
  /** Força já calculada no servidor. O cliente **não** recalcula avaliação. */
  strength: number;
  primaryPosition: string | null;
  isProvisional: boolean;
  isUnrated: boolean;
}

const STRATEGY_LABELS: Record<BalancingStrategy, string> = {
  equilibrio_maximo: 'Equilíbrio máximo',
  equilibrio_com_afinidades: 'Equilíbrio com afinidades',
  variacao_social: 'Variação social',
  cobertura_de_posicoes: 'Cobertura de posições',
};

const STRATEGY_HINTS: Record<BalancingStrategy, string> = {
  equilibrio_maximo: 'O melhor equilíbrio possível, ignorando preferências.',
  equilibrio_com_afinidades: 'Melhor combinação de preferências dentro do limite de equilíbrio.',
  variacao_social: 'Evita repetir as duplas dos últimos encontros.',
  cobertura_de_posicoes: 'Prioriza a distribuição tática mais completa.',
};

const TEAM_ACCENTS = ['bg-cva-navy-900', 'bg-cva-gold-500', 'bg-cva-blue-600'] as const;

function diffPercent(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  return ((Math.max(...values) - Math.min(...values)) / mean) * 100;
}

export function TeamBuilder({
  eventId,
  options,
  players,
  maxImbalancePct,
  limitNotReached,
  limitBlockers,
  bestAchievableDiffPct,
  provenance,
  teamNames,
}: {
  eventId: string;
  options: FormationOption[];
  players: BuilderPlayer[];
  maxImbalancePct: number;
  limitNotReached: boolean;
  limitBlockers: string[];
  bestAchievableDiffPct: number;
  provenance: unknown;
  teamNames: string[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [teams, setTeams] = useState<string[][]>(
    () => options[0]?.teams.map((team) => [...team]) ?? [],
  );
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const option = options[selectedIndex];

  const strengths = useMemo(
    () =>
      teams.map((team) =>
        team.reduce((sum, id) => sum + (playerById.get(id)?.strength ?? 0), 0),
      ),
    [teams, playerById],
  );

  const currentDiff = diffPercent(strengths);
  const withinLimit = currentDiff <= maxImbalancePct + 1e-9;

  const selectOption = (index: number): void => {
    setSelectedIndex(index);
    setTeams(options[index]?.teams.map((team) => [...team]) ?? []);
    setSelectedPlayer(null);
    setTouched(false);
    setFeedback(null);
  };

  /**
   * Move o atleta selecionado para o time de destino, trocando com alguém
   * quando o time já está cheio — o tamanho dos times é invariante.
   */
  const moveTo = (targetTeam: number, swapWith?: string): void => {
    if (!selectedPlayer) return;

    setTeams((current) => {
      const next = current.map((team) => [...team]);
      const fromTeam = next.findIndex((team) => team.includes(selectedPlayer));
      if (fromTeam === -1 || fromTeam === targetTeam) return current;

      const partner =
        swapWith ??
        (next[targetTeam]!.length >= next[fromTeam]!.length ? next[targetTeam]![0] : undefined);

      next[fromTeam] = next[fromTeam]!.filter((id) => id !== selectedPlayer);
      next[targetTeam] = next[targetTeam]!.filter((id) => id !== partner);
      next[targetTeam]!.push(selectedPlayer);
      if (partner) next[fromTeam]!.push(partner);

      return next;
    });

    setSelectedPlayer(null);
    setTouched(true);
  };

  const publish = (): void => {
    startTransition(async () => {
      const result = await publishFormationAction({
        eventId,
        strategy: touched ? 'ajuste_manual' : (option?.strategy ?? 'equilibrio_maximo'),
        teams,
        provenance,
        metrics: touched
          ? { diffPct: currentDiff, teamStrengths: strengths, ajusteManual: true }
          : (option?.metrics ?? {}),
      });

      setFeedback({ ok: result.ok, message: result.message ?? '' });
    });
  };

  if (!option) {
    return <Callout tone="danger">Nenhuma formação foi gerada.</Callout>;
  }

  return (
    <div className="flex flex-col gap-5">
      {limitNotReached ? (
        <Callout tone="warning" title="O limite de equilíbrio não pôde ser atingido">
          A melhor diferença possível para este grupo é de{' '}
          <strong>{bestAchievableDiffPct.toFixed(1)}%</strong>, acima do limite configurado de{' '}
          {maxImbalancePct}%.
          <ul className="mt-1.5 list-disc pl-5">
            {limitBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {/* ---- Opções ------------------------------------------------------- */}
      <Panel>
        <PanelHeader
          title="Opções geradas"
          description="Todas respeitam as restrições obrigatórias e os bloqueios."
        />
        <PanelBody flush>
          <ul className="divide-cva-border divide-y">
            {options.map((item, index) => (
              <li key={item.canonicalKey}>
                <button
                  type="button"
                  onClick={() => selectOption(index)}
                  aria-pressed={index === selectedIndex}
                  className={`hover:bg-cva-blue-100/35 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${
                    index === selectedIndex ? 'bg-cva-gold-100/50' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-8 w-1 shrink-0 rounded-full ${
                      index === selectedIndex ? 'bg-cva-gold-500' : 'bg-cva-border'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-cva-navy-900 block text-sm font-semibold">
                      {STRATEGY_LABELS[item.strategy]}
                      {item.alsoSatisfies.length > 0 ? (
                        <span className="text-cva-text-muted font-normal">
                          {' '}
                          · atende também:{' '}
                          {item.alsoSatisfies.map((s) => STRATEGY_LABELS[s]).join(', ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-cva-text-muted block text-xs">
                      {STRATEGY_HINTS[item.strategy]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      data-numeric
                      className={`block text-lg font-bold ${
                        item.metrics.diffPct <= maxImbalancePct
                          ? 'text-cva-success'
                          : 'text-cva-warning'
                      }`}
                    >
                      {item.metrics.diffPct.toFixed(1)}%
                    </span>
                    <span className="text-cva-text-muted block text-xs">diferença</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>

      {/* ---- Métricas ao vivo ---------------------------------------------- */}
      <Panel>
        <MetricRow>
          <Metric
            label="Diferença atual"
            value={`${currentDiff.toFixed(1)}%`}
            hint={`Limite: ${maxImbalancePct}%`}
            tone={withinLimit ? 'positive' : 'negative'}
          />
          {strengths.map((strength, index) => (
            <Metric
              key={index}
              label={teamNames[index] ?? `Time ${index + 1}`}
              value={strength.toFixed(1)}
              hint="força total"
            />
          ))}
        </MetricRow>
      </Panel>

      {touched ? (
        <Callout tone="info" title="Formação ajustada manualmente">
          As métricas acima já refletem suas trocas. Ao publicar, a versão fica registrada como
          ajuste manual.{' '}
          <button
            type="button"
            onClick={() => selectOption(selectedIndex)}
            className="font-semibold underline underline-offset-2"
          >
            Restaurar a sugestão original
          </button>
        </Callout>
      ) : null}

      {/* ---- Times ---------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {teams.map((team, teamIndex) => (
          <Panel key={teamIndex} className="overflow-hidden">
            <div aria-hidden="true" className={`h-1.5 ${TEAM_ACCENTS[teamIndex % 3]}`} />
            <PanelHeader
              title={teamNames[teamIndex] ?? `Time ${teamIndex + 1}`}
              description={`${team.length} atletas · força ${strengths[teamIndex]?.toFixed(1)}`}
              actions={
                selectedPlayer && !team.includes(selectedPlayer) ? (
                  <Button size="sm" variant="gold" onClick={() => moveTo(teamIndex)}>
                    Mover para cá
                  </Button>
                ) : null
              }
            />
            <PanelBody flush>
              <ul className="divide-cva-border divide-y">
                {team.map((playerId) => {
                  const player = playerById.get(playerId);
                  const isSelected = selectedPlayer === playerId;

                  return (
                    <li key={playerId}>
                      <button
                        type="button"
                        onClick={() =>
                          selectedPlayer && !isSelected && !team.includes(selectedPlayer)
                            ? moveTo(teamIndex, playerId)
                            : setSelectedPlayer(isSelected ? null : playerId)
                        }
                        aria-pressed={isSelected}
                        className={`hover:bg-cva-blue-100/35 flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors sm:px-5 ${
                          isSelected ? 'bg-cva-gold-100' : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="text-cva-text block truncate text-sm">
                            {player?.displayName ?? playerId}
                          </span>
                          <span className="text-cva-text-muted block text-xs">
                            {player?.primaryPosition ?? 'sem posição'}
                          </span>
                        </span>

                        {player?.isProvisional ? <Badge tone="warning">Provisória</Badge> : null}
                        {player?.isUnrated ? <Badge tone="danger">Sem nota</Badge> : null}

                        <span
                          data-numeric
                          className="text-cva-text-muted shrink-0 text-sm font-medium"
                        >
                          {player?.strength.toFixed(1) ?? '—'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PanelBody>
          </Panel>
        ))}
      </div>

      {selectedPlayer ? (
        <Callout tone="info">
          <strong>{playerById.get(selectedPlayer)?.displayName}</strong> selecionado. Escolha
          &ldquo;Mover para cá&rdquo; no time de destino, ou clique em um atleta de outro time
          para trocar os dois.
        </Callout>
      ) : null}

      {/* ---- Explicação administrativa (§10.8) ----------------------------- */}
      <Panel>
        <PanelHeader
          title="Explicação"
          description="Visível apenas para administradores. Não aparece nos times publicados."
        />
        <PanelBody className="flex flex-col gap-3 text-sm">
          <p className="text-cva-text">
            Esta opção apresenta diferença estimada de{' '}
            <strong>{option.metrics.diffPct.toFixed(1)}%</strong>.{' '}
            {option.affinityOutcomes.filter((o) => o.satisfied).length} preferência(s) atendida(s)
            e {option.affinityOutcomes.filter((o) => !o.satisfied).length} não atendida(s).
          </p>

          {option.affinityOutcomes
            .filter((outcome) => !outcome.satisfied)
            .map((outcome) => (
              <p
                key={`${outcome.fromPlayerId}-${outcome.toPlayerId}`}
                className="text-cva-text-muted text-xs"
              >
                Preferência de{' '}
                <strong>{playerById.get(outcome.fromPlayerId)?.displayName}</strong> não atendida
                {outcome.unsatisfiedReason?.kind === 'restricao'
                  ? ' porque existe uma restrição obrigatória em sentido contrário.'
                  : outcome.unsatisfiedReason?.kind === 'bloqueio'
                    ? ' porque os dois estão bloqueados em times diferentes.'
                    : outcome.unsatisfiedReason?.projectedDiffPct !== undefined
                      ? ` porque elevaria a diferença estimada para ${outcome.unsatisfiedReason.projectedDiffPct.toFixed(1)}%.`
                      : ' pelo equilíbrio dos times.'}
              </p>
            ))}

          {option.alerts.map((alert) => (
            <Callout
              key={alert.code}
              tone={alert.code === 'limite_desequilibrio_nao_atingido' ? 'warning' : 'info'}
            >
              {alert.message}
            </Callout>
          ))}

          <div>
            <p className="text-cva-text-muted text-xs font-medium tracking-wide uppercase">
              Cobertura de posições
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {option.metrics.positionCoverage.map((coverage) => (
                <li key={coverage.position} className="text-cva-text text-xs">
                  {coverage.position}: {coverage.countsByTeam.join(' · ')}
                  {coverage.missingTeamIndexes.length > 0 ? (
                    <span className="text-cva-danger"> — falta em algum time</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </PanelBody>
      </Panel>

      {/* ---- Barra de ação fixa -------------------------------------------- */}
      <div className="border-cva-border bg-cva-panel/95 sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="min-w-0">
          {feedback ? (
            <p className={feedback.ok ? 'text-cva-success text-sm' : 'text-cva-danger text-sm'}>
              {feedback.message}
            </p>
          ) : (
            <p className="text-cva-text-muted text-sm">
              Diferença {currentDiff.toFixed(1)}% · limite {maxImbalancePct}%
            </p>
          )}
        </div>

        <Button variant="gold" size="lg" onClick={publish} disabled={pending}>
          {pending ? 'Publicando…' : 'Publicar times'}
        </Button>
      </div>
    </div>
  );
}
