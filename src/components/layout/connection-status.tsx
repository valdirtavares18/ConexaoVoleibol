'use client';

import { useEffect, useState } from 'react';

/**
 * Aviso de falta de conexão (§22).
 *
 * O ginásio do encontro tem sinal ruim, e a pessoa operando o painel de quadra
 * precisa saber **na hora** que o "Encerrar partida" não chegou ao servidor —
 * caso contrário anota mentalmente o resultado errado e o rodízio desanda.
 *
 * Não é um service worker: é um aviso honesto. Sincronizar mutações offline
 * exigiria fila com resolução de conflito, o que muda a semântica do rodízio e
 * não cabe nesta versão.
 */
export function ConnectionStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = (): void => setOffline(!navigator.onLine);

    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-cva-danger fixed inset-x-0 bottom-0 z-50 px-4 py-2.5 text-center text-sm font-semibold text-white sm:bottom-auto sm:top-0"
    >
      Sem conexão. O que você registrar agora <strong>não</strong> será salvo até a internet
      voltar.
    </div>
  );
}
