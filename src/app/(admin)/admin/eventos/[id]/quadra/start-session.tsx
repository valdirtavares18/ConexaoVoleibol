'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Callout, Panel, PanelBody, PanelHeader } from '@/components/ui/primitives';
import { startCourtSessionAction } from '@/server/actions/admin-actions';

/**
 * Início do rodízio. Mostra a regra antes de começar — é a parte do sistema que
 * mais gera dúvida em quadra, e deixá-la explícita evita discussão no meio do
 * encontro.
 */
export function StartSession({
  eventId,
  teamNames,
}: {
  eventId: string;
  teamNames: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = (): void => {
    startTransition(async () => {
      const result = await startCourtSessionAction(eventId);
      if (!result.ok) setError(result.message);
    });
  };

  const [a, b, c] = teamNames;

  return (
    <Panel>
      <PanelHeader
        title="Começar o rodízio"
        description="A partir daqui o encontro entra em andamento."
      />
      <PanelBody className="flex flex-col gap-4">
        {error ? <Callout tone="danger">{error}</Callout> : null}

        <div className="text-cva-text flex flex-col gap-1.5 text-sm">
          <p>
            <strong>{a}</strong> e <strong>{b}</strong> começam jogando.{' '}
            <strong>{c}</strong> aguarda.
          </p>
          <p className="text-cva-text-muted">
            O vencedor fica e o perdedor sai. A partir da segunda partida, nenhum time joga mais
            de duas seguidas: quem completa a segunda sai obrigatoriamente, tenha vencido ou
            perdido.
          </p>
        </div>

        <div>
          <Button size="lg" variant="gold" onClick={start} disabled={pending}>
            {pending ? 'Iniciando…' : 'Iniciar rodízio'}
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}
