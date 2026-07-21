import { test as setup } from '@playwright/test';
import { ADMIN_STATE, ATHLETE_STATE, E2E, signIn } from './helpers';

/**
 * Autentica uma única vez por papel e guarda o estado da sessão.
 *
 * Sem isto, cada teste faria seu próprio login e a suíte estouraria o rate
 * limit de autenticação (8 tentativas por IP a cada 15 minutos) — que é
 * proteção real de produção e **não** deve ser afrouxada para acomodar teste.
 * Os testes que exercitam o próprio login usam contexto limpo e cabem na cota.
 */

setup('autentica como administrador', async ({ page }) => {
  await signIn(page, E2E.adminEmail, E2E.adminPassword);
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('autentica como atleta', async ({ page }) => {
  await signIn(page, E2E.athleteEmail, E2E.athletePassword);
  await page.context().storageState({ path: ATHLETE_STATE });
});
