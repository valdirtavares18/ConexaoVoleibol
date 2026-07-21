import { config as loadEnv } from 'dotenv';

/**
 * Setup global do Vitest — roda **dentro de cada worker**.
 *
 * O carregamento do `.env` precisa acontecer aqui, e não em `vitest.config.ts`:
 * com `pool: 'forks'`, o config roda em outro processo e as variáveis definidas
 * lá não chegam de forma confiável ao worker que executa os testes.
 */
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

process.env.TZ = 'America/Sao_Paulo';

// `@testing-library/jest-dom` só faz sentido nos arquivos que declaram
// `// @vitest-environment jsdom`; em ambiente Node o import é ignorado.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

export {};
