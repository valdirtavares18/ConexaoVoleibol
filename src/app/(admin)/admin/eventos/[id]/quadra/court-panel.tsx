'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import {
  finishMatchAction,
  finishSessionAction,
  undoMatchAction,
} from '@/server/actions/admin-actions';
import type { CourtPanelState } from '@/server/services/rotation';

/**
 * Painel de quadra (§11.3).
 *
 * É um painel **operacional**, usado com o celular na mão durante o jogo: fonte
 * grande, botões grandes, nada de administração no caminho. Placar é opcional
 * porque o grupo nem sempre anota — o que o rodízio precisa saber é quem venceu.
 */

const REASON_LABELS: Record<string, string> = {
  limite_consecutivas: 'saiu por ter jogado duas seguidas',
  derrota: 'saiu por ter perdido',
  empate_decidido: 'saiu por decisão no empate',
  override_manual: 'saiu por decisão manual',
};

export function CourtPanel({ eventId, panel }: { eventId: string; panel: CourtPanelState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [leftScore, setLeftScore] = useState('');
  const [rightScore, setRightScore] = useState('');
  const [tieChoice, setTieChoice] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideTeam, setOverrideTeam] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const consecutive = (teamId: string): number => panel.consecutiveByTeam[teamId] ?? 0;

  const finish = (winnerTeamId: string | null): void => {
    startTransition(async () => {
      const result = await finishMatchAction({
        eventId,
        sessionId: panel.sessionId,
        leftScore: leftScore === '' ? null : Number(leftScore),
        rightScore: rightScore === '' ? null : Number(rightScore),
        winnerTeamId,
        ...(winnerTeamId === null && tieChoice ? { stayingTeamIdOnTie: tieChoice } : {}),
        ...(showOverride && overrideTeam
          ? { override: { leavingTeamId: overrideTeam, justification: overrideReason } }
          : {}),
      });

      setFeedback({ ok: result.ok, message: result.message ?? '' });
      if (result.ok) {
        // Ações chamadas fora de `<form action>` não re-renderizam a árvore
        // servidor sozinhas — sem isto o painel continuaria na partida anterior.
        router.refresh();
        setLeftScore('');
        setRightScore('');
        setTieChoice(null);
        setShowOverride(false);
        setOverrideTeam(null);
        setOverrideReason('');
      }
    });
  };

  const undo = (): void => {
    startTransition(async () => {
      const result = await undoMatchAction(eventId, panel.sessionId);
      setFeedback({ ok: result.ok, message: result.message ?? '' });
      if (result.ok) router.refresh();
    });
  };

  const finishSession = (): void => {
    startTransition(async () => {
      const result = await finishSessionAction(eventId, panel.sessionId);
      setFeedback({ ok: result.ok, message: result.message ?? '' });
      if (result.ok) router.refresh();
    });
  };

  if (panel.finished) {
    return (
      <Callout tone="success" title="Rodízio encerrado">
        Foram {panel.history.length} partidas. O encontro está finalizado.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {feedback ? (
        <Callout tone={feedback.ok ? 'success' : 'danger'}>{feedback.message}</Callout>
      ) : null}

      {/* ---- Confronto atual ------------------------------------------------ */}
      <Panel className="overflow-hidden">
        <div className="bg-cva-navy-950 relative px-4 py-6 sm:px-6">
          <div className="cva-stripes absolute inset-0 opacity-40" aria-hidden="true" />

          <div className="relative">
            <p className="text-cva-gold-500 text-center text-xs font-semibold tracking-wider uppercase">
              Partida {panel.matchNumber}
            </p>

            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="min-w-0 text-center">
                <p className="truncate text-xl font-bold text-white sm:text-2xl">
                  {panel.left.name}
                </p>
                <p className="text-cva-blue-100 mt-0.5 text-xs">
                  {consecutive(panel.left.id)}ª seguida
                </p>
              </div>

              <p aria-hidden="true" className="text-cva-blue-100 text-lg font-semibold">
                ×
              </p>

              <div className="min-w-0 text-center">
                <p className="truncate text-xl font-bold text-white sm:text-2xl">
                  {panel.right.name}
                </p>
                <p className="text-cva-blue-100 mt-0.5 text-xs">
                  {consecutive(panel.right.id)}ª seguida
                </p>
              </div>
            </div>

            <p className="text-cva-blue-100 mt-4 text-center text-sm">
              Aguardando: <strong className="text-white">{panel.waiting.name}</strong>
            </p>
          </div>
        </div>

        <PanelBody className="flex flex-col gap-4">
          {panel.forcedLeavingTeamId ? (
            <Callout tone="warning" title="Próxima troca já definida">
              {panel.left.id === panel.forcedLeavingTeamId ? panel.left.name : panel.right.name}{' '}
              sai ao fim desta partida — {panel.nextMatchDescription}
            </Callout>
          ) : (
            <Callout tone="info">{panel.nextMatchDescription}</Callout>
          )}

          {/* Placar opcional */}
          <fieldset className="flex items-end justify-center gap-3">
            <legend className="sr-only">Placar (opcional)</legend>

            <div className="flex flex-col gap-1">
              <label htmlFor="left-score" className="text-cva-text-muted text-xs">
                {panel.left.name}
              </label>
              <input
                id="left-score"
                type="number"
                inputMode="numeric"
                min={0}
                value={leftScore}
                onChange={(event) => setLeftScore(event.target.value)}
                className="border-cva-border-strong bg-cva-panel h-14 w-20 rounded-md border text-center text-2xl font-bold"
              />
            </div>

            <span aria-hidden="true" className="text-cva-text-muted pb-4">
              ×
            </span>

            <div className="flex flex-col gap-1">
              <label htmlFor="right-score" className="text-cva-text-muted text-xs">
                {panel.right.name}
              </label>
              <input
                id="right-score"
                type="number"
                inputMode="numeric"
                min={0}
                value={rightScore}
                onChange={(event) => setRightScore(event.target.value)}
                className="border-cva-border-strong bg-cva-panel h-14 w-20 rounded-md border text-center text-2xl font-bold"
              />
            </div>
          </fieldset>

          <p className="text-cva-text-muted text-center text-xs">
            O placar é opcional. Quem venceu é o que define o rodízio.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="lg" variant="gold" onClick={() => finish(panel.left.id)} disabled={pending}>
              {panel.left.name} venceu
            </Button>
            <Button size="lg" variant="gold" onClick={() => finish(panel.right.id)} disabled={pending}>
              {panel.right.name} venceu
            </Button>
          </div>

          {/* Empate: só exige escolha quando o limite de consecutivas não decide. */}
          {panel.forcedLeavingTeamId ? (
            <Button size="lg" variant="secondary" onClick={() => finish(null)} disabled={pending}>
              Empatou
            </Button>
          ) : (
            <div className="border-cva-border flex flex-col gap-2 rounded-md border border-dashed p-3">
              <p className="text-cva-text text-sm font-medium">
                Empatou? Escolha quem permanece em quadra:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[panel.left, panel.right].map((team) => (
                  <Button
                    key={team.id}
                    size="md"
                    variant={tieChoice === team.id ? 'primary' : 'secondary'}
                    onClick={() => setTieChoice(team.id)}
                  >
                    {team.name} fica
                  </Button>
                ))}
              </div>
              <Button
                size="md"
                variant="ghost"
                onClick={() => finish(null)}
                disabled={pending || !tieChoice}
              >
                Registrar empate
              </Button>
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* ---- Ações secundárias --------------------------------------------- */}
      <Panel>
        <PanelHeader title="Correções" />
        <PanelBody className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={undo}
              disabled={pending || panel.history.length === 0}
            >
              Corrigir última partida
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowOverride((open) => !open)}
              disabled={pending}
            >
              {showOverride ? 'Cancelar troca manual' : 'Forçar troca manual'}
            </Button>
            <Button variant="danger" onClick={finishSession} disabled={pending}>
              Encerrar rodízio
            </Button>
          </div>

          {showOverride ? (
            <div className="border-cva-warning/30 bg-cva-warning-soft flex flex-col gap-2 rounded-md border p-3">
              <p className="text-cva-warning text-sm font-medium">
                A troca manual quebra a regra do rodízio e fica registrada na auditoria.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                {[panel.left, panel.right].map((team) => (
                  <Button
                    key={team.id}
                    size="sm"
                    variant={overrideTeam === team.id ? 'primary' : 'secondary'}
                    onClick={() => setOverrideTeam(team.id)}
                  >
                    {team.name} sai
                  </Button>
                ))}
              </div>

              <label htmlFor="override-reason" className="text-cva-warning text-xs font-medium">
                Justificativa (obrigatória)
              </label>
              <input
                id="override-reason"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                minLength={3}
                placeholder="Ex.: dois atletas do time precisaram sair antes"
                className="border-cva-border-strong bg-cva-panel h-10 rounded-md border px-3 text-sm"
              />

              <Button
                size="md"
                variant="gold"
                disabled={pending || !overrideTeam || overrideReason.trim().length < 3}
                onClick={() => finish(panel.left.id)}
              >
                Aplicar troca manual
              </Button>
            </div>
          ) : null}
        </PanelBody>
      </Panel>

      {/* ---- Histórico ------------------------------------------------------ */}
      <Panel>
        <PanelHeader title="Sequência" description={`${panel.history.length} partida(s)`} />
        <PanelBody flush>
          {panel.history.length === 0 ? (
            <p className="text-cva-text-muted px-4 py-4 text-sm sm:px-5">
              Nenhuma partida encerrada ainda.
            </p>
          ) : (
            <ol className="divide-cva-border divide-y">
              {[...panel.history].reverse().map((match) => (
                <li
                  key={match.matchNumber}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5"
                >
                  <span className="text-cva-text">
                    <span data-numeric className="text-cva-text-muted mr-2">
                      #{match.matchNumber}
                    </span>
                    {match.leftTeamName} × {match.rightTeamName}
                    {match.leftScore !== null && match.rightScore !== null ? (
                      <span data-numeric className="text-cva-text-muted ml-2">
                        {match.leftScore}–{match.rightScore}
                      </span>
                    ) : null}
                  </span>

                  <span className="flex items-center gap-2">
                    {match.winnerTeamName ? (
                      <Badge tone="success">{match.winnerTeamName} venceu</Badge>
                    ) : (
                      <Badge tone="neutral">Empate</Badge>
                    )}
                    <span className="text-cva-text-muted text-xs">
                      {match.leavingTeamName} {REASON_LABELS[match.leaveReason]}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
