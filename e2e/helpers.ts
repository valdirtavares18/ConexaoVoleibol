import { expect, type Page } from '@playwright/test';
import { E2E } from './global-setup';

export { E2E };

/**
 * Estados de sessão gravados por `auth.setup.ts`.
 *
 * Os caminhos vivem aqui, e não no próprio setup, porque o Playwright proíbe um
 * arquivo de teste importar outro arquivo de teste.
 */
export const ADMIN_STATE = 'e2e/.auth/admin.json';
export const ATHLETE_STATE = 'e2e/.auth/athlete.json';

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // O redirecionamento pós-login confirma que a sessão foi criada.
  await page.waitForURL(/\/(app|admin)/);
}

export const signInAsAdmin = (page: Page): Promise<void> =>
  signIn(page, E2E.adminEmail, E2E.adminPassword);

export const signInAsAthlete = (page: Page): Promise<void> =>
  signIn(page, E2E.athleteEmail, E2E.athletePassword);

/** Abre a tela de presenças do encontro de teste. */
export async function openEventPresences(page: Page): Promise<string> {
  await page.goto('/admin/eventos');
  await page.getByRole('link', { name: E2E.eventTitle }).first().click();
  await page.waitForURL(/\/admin\/eventos\/[0-9a-f-]+$/);

  const eventId = page.url().split('/').pop() as string;
  await page.goto(`/admin/eventos/${eventId}/presencas`);
  await expect(page.getByRole('heading', { name: 'Presenças' })).toBeVisible();

  return eventId;
}

/**
 * Mensagem de retorno de uma ação.
 *
 * Combina `role="status"` (do `Callout`) **com** o texto esperado. Só o papel
 * não basta: as páginas também explicam as regras em avisos permanentes, que
 * usam o mesmo papel — filtrar pelo texto é o que distingue o retorno da ação
 * da prosa da tela.
 */
export const actionFeedback = (page: Page, text: string | RegExp) =>
  page.getByRole('status').filter({ hasText: text }).first();

/** Erro de formulário. Filtra o anunciador de rota do Next, que também é `alert`. */
export const formError = (page: Page, text: string | RegExp) =>
  page.getByRole('alert').filter({ hasText: text }).first();

/**
 * Confirma todos os atletas disponíveis até encher as vagas.
 *
 * Clica sempre no primeiro botão da lista: a linha sai da seção "confirmar em
 * nome de" assim que o atleta é confirmado, então o primeiro botão é sempre o
 * próximo atleta pendente.
 */
export async function confirmAllAthletes(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const button = page.getByRole('button', { name: 'Confirmar' }).first();
    await expect(button).toBeVisible();
    await button.click();
    await expect(actionFeedback(page, /Presença confirmada|lista de espera/)).toBeVisible();
  }
}
