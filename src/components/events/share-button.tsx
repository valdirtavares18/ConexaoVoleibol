'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Compartilhamento dos times (§14).
 *
 * Usa a Web Share API quando disponível (celular), que abre o seletor nativo
 * com o WhatsApp junto. Sem ela — desktop, em geral — cai para copiar a
 * mensagem, que é o que o usuário faria em seguida de qualquer forma.
 *
 * O texto vem pronto do servidor: esta camada não monta mensagem, para não
 * existir um segundo lugar capaz de vazar dado privado.
 */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const share = async (): Promise<void> => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (error) {
        // O usuário cancelar o seletor nativo não é erro: só não fazemos nada.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setFeedback('Mensagem copiada.');
      setTimeout(() => setFeedback(null), 2500);
    } catch {
      setFeedback('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {feedback ? (
        <span role="status" className="text-cva-success text-xs">
          {feedback}
        </span>
      ) : null}
      <Button variant="secondary" size="sm" onClick={() => void share()}>
        Compartilhar
      </Button>
    </div>
  );
}
