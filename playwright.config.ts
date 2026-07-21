import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Testes end-to-end (§23.8).
 *
 * Rodam contra o **build de produção** e um banco dedicado (`cva_gestao_e2e`),
 * preparado por `e2e/global-setup.ts`. Rodar contra `next dev` esconderia
 * problemas de bundling servidor/cliente — que foram justamente os que mais
 * apareceram neste projeto.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const testDatabaseUrl = (() => {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://cva:cva@localhost:5433/cva_gestao',
  );
  url.pathname = '/cva_gestao_e2e';
  return url.toString();
})();

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  // Um worker só: os testes compartilham o mesmo banco e a mesma sequência de
  // estado do encontro (confirmar → montar times → rodízio → fechar caixa).
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Autentica uma vez por papel e guarda o estado (ver `auth.setup.ts`):
    // sem isso a suíte estoura o rate limit de login, que é proteção real.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    // O atleta usa o celular: o layout precisa funcionar a partir de ~360 px.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /atleta\.spec\.ts/,
    },
  ],

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      AUTH_SECRET: process.env.AUTH_SECRET ?? '',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NODE_ENV: 'production',
    },
  },
});
