import { expect, test } from '@playwright/test';
import { ADMIN_STATE, E2E, actionFeedback, confirmAllAthletes, openEventPresences } from './helpers';

/**
 * Fluxo completo de um encontro (§23.8).
 *
 * Um único `test.describe.serial` em vez de testes independentes: o encontro é
 * uma máquina de estados (confirmar → montar → rodízio → fechar caixa), e
 * recriar todo o estado anterior a cada teste tornaria a suíte lenta e frágil.
 * A ordem aqui é a regra de negócio, não um acidente.
 */
test.use({ storageState: ADMIN_STATE });

test.describe.serial('encontro de ponta a ponta', () => {
  let eventId: string;

  test('confirma 18 atletas e fecha a lista', async ({ page }) => {
    eventId = await openEventPresences(page);

    await confirmAllAthletes(page, E2E.athleteCount);

    await expect(page.getByText('Lista completa')).toBeVisible();
    await expect(page.getByText('18/18')).toBeVisible();
  });

  test('a capacidade não é ultrapassada', async ({ page }) => {
    await page.goto(`/admin/eventos/${eventId}/presencas`);

    // Com as 18 vagas ocupadas e todos os atletas já respondendo, não sobra
    // ninguém para confirmar — a invariante de capacidade fica visível.
    await expect(page.getByText('Todos os atletas do grupo já responderam.')).toBeVisible();
    await expect(page.getByText('Lista completa')).toBeVisible();
  });

  test('gera as opções de times e publica', async ({ page }) => {
    await page.goto(`/admin/eventos/${eventId}/times`);

    await expect(page.getByRole('heading', { name: 'Montar times' })).toBeVisible();
    await expect(page.getByText('Opções geradas')).toBeVisible();

    // §10.7 — no mínimo três alternativas.
    const options = page.locator('button[aria-pressed]').filter({ hasText: '%' });
    expect(await options.count()).toBeGreaterThanOrEqual(3);

    // §10.4 — a diferença precisa estar dentro do limite configurado de 5%.
    const diffText = await page
      .getByText(/^Diferença \d/)
      .first()
      .textContent();
    const diff = Number((diffText ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
    expect(diff).toBeLessThanOrEqual(5);

    await page.getByRole('button', { name: 'Publicar times' }).click();
    await expect(page.getByText('Times publicados. O grupo já consegue ver.')).toBeVisible();
  });

  test('os times publicados não expõem notas nem afinidades', async ({ page }) => {
    await page.goto(`/app/times`);

    const body = (await page.locator('main').textContent()) ?? '';
    expect(body).not.toMatch(/diferença estimada|afinidade|nota oficial|R\$/i);
  });

  test('executa o rodízio respeitando o limite de duas partidas seguidas', async ({ page }) => {
    await page.goto(`/admin/eventos/${eventId}/quadra`);

    await page.getByRole('button', { name: 'Iniciar rodízio' }).click();
    await expect(page.getByText('Partida 1')).toBeVisible();

    await page.locator('button:has-text("venceu")').first().click();
    await expect(page.getByText('Partida 2')).toBeVisible();

    // O vencedor da primeira está na 2ª consecutiva: a saída dele já está
    // definida, independentemente do resultado (§11.2).
    await expect(page.getByText('Próxima troca já definida')).toBeVisible();

    await page.locator('button:has-text("venceu")').first().click();
    await expect(page.getByText('Partida 3')).toBeVisible();

    await expect(page.getByText('#1')).toBeVisible();
    await expect(page.getByText('#2')).toBeVisible();
    await expect(page.getByText('saiu por ter jogado duas seguidas')).toBeVisible();
  });

  test('corrige a última partida e restaura o estado anterior', async ({ page }) => {
    await page.goto(`/admin/eventos/${eventId}/quadra`);
    await expect(page.getByText('Partida 3')).toBeVisible();

    await page.getByRole('button', { name: 'Corrigir última partida' }).click();
    await expect(actionFeedback(page, 'Última partida corrigida.')).toBeVisible();
    await expect(page.getByText('Partida 2')).toBeVisible();
  });

  test('gera cobranças, recebe de todos e fecha o financeiro', async ({ page }) => {
    // São 18 recebimentos em sequência, cada um re-renderizando a tabela.
    test.setTimeout(180_000);

    await page.goto(`/admin/financeiro/eventos/${eventId}`);

    await page.getByRole('button', { name: 'Gerar cobranças' }).click();
    await expect(page.getByText('Cobranças geradas')).toBeVisible();

    // 18 × R$ 10,00 = R$ 180,00 (§23.7).
    await expect(page.getByText('R$ 180,00').first()).toBeVisible();

    const receiveButtons = page.getByRole('button', { name: 'Receber' });
    await expect(receiveButtons).toHaveCount(E2E.athleteCount);

    // Espera a contagem cair a cada recebimento, em vez de confiar na mensagem:
    // a linha some da tabela, e é esse o sinal de que a operação concluiu.
    for (let remaining = E2E.athleteCount; remaining > 0; remaining--) {
      await receiveButtons.first().click();
      await expect(receiveButtons).toHaveCount(remaining - 1, { timeout: 20_000 });
    }

    await page.getByRole('button', { name: 'Fechar financeiro' }).click();
    await expect(page.getByText('Financeiro fechado')).toBeVisible();
  });

  test('o caixa reflete o excedente de R$ 30,00', async ({ page }) => {
    await page.goto('/admin/financeiro');

    // R$ 180,00 recebidos − R$ 150,00 de quadra = R$ 30,00.
    await expect(page.getByText('R$ 30,00').first()).toBeVisible();
  });

  test('a auditoria registrou as ações sensíveis', async ({ page }) => {
    await page.goto('/admin/auditoria');

    await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
    await expect(page.getByText('times.publicar').first()).toBeVisible();
    await expect(page.getByText('financeiro.fechar_evento').first()).toBeVisible();
  });
});
