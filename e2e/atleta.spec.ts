import { expect, test } from '@playwright/test';
import {
  ADMIN_STATE,
  ATHLETE_STATE,
  E2E,
  actionFeedback,
  chooseFirstOption,
  chooseOption,
  formError,
} from './helpers';

/**
 * Fluxo do atleta. Roda também em viewport de celular (ver `playwright.config.ts`),
 * porque é ali que a maior parte das confirmações acontece.
 */
test.describe('atleta', () => {
  test.use({ storageState: ATHLETE_STATE });

  test('vê o próximo encontro e responde à convocação', async ({ page }) => {
    await page.goto('/app');

    await expect(page.getByRole('heading', { name: 'Seu próximo jogo' })).toBeVisible();
    await expect(page.getByText(E2E.eventTitle).first()).toBeVisible();

    const confirm = page.getByRole('button', { name: 'Vou jogar' });
    const cancel = page.getByRole('button', { name: /Cancelar presença|Sair da lista/ });

    if (await confirm.isVisible()) {
      await confirm.click();
      await expect(actionFeedback(page, /Presença confirmada|lista de espera/)).toBeVisible();
    } else {
      // Já confirmado pelo fluxo administrativo: a ação oposta precisa aparecer.
      await expect(cancel).toBeVisible();
    }
  });

  test('a navegação inferior funciona no celular', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'A barra inferior só existe em viewport de celular.');

    await page.goto('/app');

    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Agenda' }).click();
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible();
  });

  test('envia autoavaliação e ela não vira nota oficial', async ({ page }) => {
    await page.goto('/app/autoavaliacao');

    await expect(page.getByText('Sua autoavaliação é uma')).toBeVisible();

    await page.locator('input[name="overall"][value="5"]').check();
    // Um fundamento como "não sei avaliar": grava `null`, não zero.
    await page.locator('input[name="bloqueio"][value="nao_sei"]').check();

    await page.getByRole('button', { name: /Enviar/ }).click();
    await expect(actionFeedback(page, /Autoavaliação (enviada|atualizada)/)).toBeVisible();

    // O perfil continua sem revelar a nota oficial: a autoavaliação não a altera
    // e a visibilidade da oficial está desligada por padrão (§4).
    await page.goto('/app/perfil');
    await expect(
      page.getByText('As avaliações oficiais são usadas apenas para montar times'),
    ).toBeVisible();
  });

  test('cadastra uma preferência e ela permanece privada', async ({ page }) => {
    await page.goto('/app/preferencias');

    await expect(page.getByText('Suas preferências são privadas')).toBeVisible();

    await chooseFirstOption(page, 'Atleta');
    await chooseOption(page, 'Intensidade', /Gosto de jogar junto/);
    await page.getByRole('button', { name: 'Salvar preferência' }).click();

    await expect(actionFeedback(page, /Preferência salva/)).toBeVisible();
  });

  test('não acessa o financeiro nem a administração', async ({ page }) => {
    // O layout administrativo redireciona antes de renderizar qualquer conteúdo.
    for (const path of ['/admin/financeiro', '/admin/atletas', '/admin']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/app/);
    }
  });
});

test.describe('acesso', () => {
  // Contexto limpo: estes testes exercitam o próprio login.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sem sessão, tudo redireciona para a tela de entrada', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/entrar/);

    await page.goto('/admin/financeiro');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('credencial errada não revela se a conta existe', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(E2E.athleteEmail);
    await page.getByLabel('Senha').fill('senha-totalmente-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(formError(page, 'E-mail ou senha incorretos.')).toBeVisible();

    // Conta inexistente devolve exatamente a mesma mensagem.
    await page.getByLabel('E-mail').fill('nao.existe@cva.local');
    await page.getByLabel('Senha').fill('outra-senha-qualquer');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(formError(page, 'E-mail ou senha incorretos.')).toBeVisible();
  });

  test('cadastro novo fica aguardando aprovação', async ({ page }) => {
    const unique = Date.now();

    await page.goto('/cadastro');
    await page.getByLabel('Nome completo').fill('Novo Atleta E2E');
    await page.getByLabel('E-mail').fill(`novo.${unique}@cva.local`);
    await page.getByLabel('Senha', { exact: true }).fill('SenhaLongaDeTeste2026');
    await page.getByLabel('Confirme a senha').fill('SenhaLongaDeTeste2026');
    await page.getByRole('button', { name: 'Criar conta' }).click();

    await expect(page).toHaveURL(/aguardando-aprovacao/);
    await expect(page.getByText('Cadastro em análise')).toBeVisible();
  });
});

test.describe('administrador aprova cadastro', () => {
  test.use({ storageState: ADMIN_STATE });

  test('aprova o cadastro pendente criado pelo autocadastro', async ({ page }) => {
    await page.goto('/admin/atletas');

    const pending = page.getByText('Cadastros aguardando aprovação');
    if (!(await pending.isVisible())) {
      test.skip(true, 'Nenhum cadastro pendente nesta execução.');
    }

    await page
      .getByRole('button', { name: /^Aprovar/ })
      .first()
      .click();

    // Verifica o **resultado**, não a mensagem: ao aprovar, o item some da fila
    // de pendentes, o que desmonta o componente que exibia o retorno da ação.
    await expect(page.getByRole('button', { name: /^Aprovar/ })).toHaveCount(0);
    // `.first()`: os projetos desktop e mobile criam cada um o seu cadastro.
    await expect(page.getByText('Novo Atleta E2E').first()).toBeVisible();
  });
});
