/**
 * Setup global do Vitest.
 *
 * `@testing-library/jest-dom` só é carregado em arquivos que declaram
 * `// @vitest-environment jsdom`; em ambiente Node o import é ignorado.
 */
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

process.env.TZ = 'America/Sao_Paulo';

export {};
