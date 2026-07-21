import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// Os testes de integração precisam de `DATABASE_URL`. O Next carrega
// `.env.local` sozinho, o Vitest não — daí o carregamento explícito aqui.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // `server-only` existe para quebrar o build se um módulo de servidor for
      // importado pelo cliente. Fora do Next ele lança sempre, então nos testes
      // é substituído por um módulo vazio — a garantia continua valendo onde
      // importa, que é no `next build`.
      // `fileURLToPath`, não `URL.pathname`: no Windows o pathname vem como
      // `/C:/...` e o resolver não encontra o arquivo.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Testes de domínio (algoritmo, rodízio, financeiro) rodam em Node.
    // Testes de componente declaram `// @vitest-environment jsdom` no topo.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/server/**'],
      reporter: ['text', 'html'],
    },
  },
});
