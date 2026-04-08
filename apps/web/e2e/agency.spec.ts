import { test, expect, type Page } from '@playwright/test'

async function loginAsAdmin(page: Page) {
  await page.goto('/agency/login')
  await page.fill('input[name="email"]', 'admin@nocrato.com')
  await page.fill('input[name="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/agency$/)
}

test.describe('Agency Portal — Autenticação', () => {
  test('redireciona não autenticado para login', async ({ page }) => {
    await page.goto('/agency')
    await expect(page).toHaveURL(/\/agency\/login/)
  })

  test('login bem-sucedido vai para dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL(/\/agency$/)
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('credenciais inválidas exibem mensagem de erro', async ({ page }) => {
    await page.goto('/agency/login')
    await page.fill('input[name="email"]', 'admin@nocrato.com')
    await page.fill('input[name="password"]', 'senhaerrada')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/agency\/login/)
    await expect(page.getByRole('alert')).toContainText('Credenciais inválidas')
  })

  test('logout redireciona para login', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/agency\/login/)
  })
})

test.describe('Agency Portal — Dashboard', () => {
  test('exibe os cinco cards de estatísticas', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByText('Total de Doutores')).toBeVisible()
    await expect(page.getByText('Doutores Ativos')).toBeVisible()
    await expect(page.getByText('Total de Pacientes')).toBeVisible()
    await expect(page.getByText('Total de Consultas')).toBeVisible()
    await expect(page.getByText('Consultas Futuras')).toBeVisible()
  })
})

test.describe('Agency Portal — Navegação', () => {
  test('navega para lista de doutores via sidebar', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Doutores' }).click()
    await expect(page).toHaveURL(/\/agency\/doctors/)
  })

  test('navega para colaboradores via sidebar', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Colaboradores' }).click()
    await expect(page).toHaveURL(/\/agency\/members/)
  })
})

test.describe('Agency Portal — Doutores', () => {
  // Seed cria 2 doutores (test-new@ e test-done@) — asserção pelo EMAIL, que é
  // estável entre runs. O nome do test-new é mutado em paralelo pelos testes de
  // onboarding (CT-32-01 renomeia para "Dra. Ana Carvalho"), então não serve.
  test('lista de doutores exibe doutores semeados', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/agency/doctors')
    await expect(page.getByText('test-new@nocrato.com')).toBeVisible()
    await expect(page.getByText('test-done@nocrato.com')).toBeVisible()
  })

  test('filtro de status aceita seleção de "Ativo"', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/agency/doctors')
    const filtro = page.getByRole('combobox', { name: /Filtrar por status/i })
    await expect(filtro).toBeVisible()
    await filtro.selectOption('active')
    await expect(filtro).toHaveValue('active')
    // Ambos os doutores semeados têm status='active' — asserção pelo email estável
    await expect(page.getByText('test-new@nocrato.com')).toBeVisible()
    await expect(page.getByText('test-done@nocrato.com')).toBeVisible()
  })

  test('modal de convite abre e fecha com Cancelar', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/agency/doctors')
    await page.getByRole('button', { name: 'Convidar Doutor' }).click()
    await expect(page.getByRole('heading', { name: 'Convidar Doutor' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('heading', { name: 'Convidar Doutor' })).not.toBeVisible()
  })

  test('modal de convite bloqueia envio sem email (validação nativa)', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/agency/doctors')
    await page.getByRole('button', { name: 'Convidar Doutor' }).click()
    await page.getByRole('button', { name: 'Enviar convite' }).click()
    // HTML required: modal permanece aberto, formulário não é submetido
    await expect(page.getByRole('heading', { name: 'Convidar Doutor' })).toBeVisible()
  })
})

test.describe('Agency Portal — Colaboradores', () => {
  test('exibe admin@nocrato.com com status Ativo', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/agency/members')
    await expect(page.getByRole('heading', { name: 'Colaboradores' })).toBeVisible()
    await expect(page.getByText('admin@nocrato.com')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Ativo' })).toBeVisible()
  })

  test('filtro de status na lista de colaboradores', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/agency/members')
    const filtro = page.getByRole('combobox', { name: /Filtrar por status/i })
    await expect(filtro).toBeVisible()
    await filtro.selectOption('active')
    await expect(filtro).toHaveValue('active')
    // Admin ainda deve aparecer com filtro "Ativo"
    await expect(page.getByText('admin@nocrato.com')).toBeVisible()
  })
})
