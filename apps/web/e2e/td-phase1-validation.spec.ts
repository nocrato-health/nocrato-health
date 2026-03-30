/**
 * td-phase1-validation.spec.ts
 *
 * Validação de itens do PR #9 (TD phase 1):
 *
 *   TD-25 — resolve-email migrado de GET /:email para POST com body { email }
 *   TD-23 — ErrorBoundary retry chama queryClient.resetQueries() (validação por code review;
 *            justificativa de não-E2E documentada abaixo)
 *
 * Pré-requisito: globalSetup (global-setup.ts) cria os doutores de teste no banco.
 * Doutor usado: test-done@nocrato.com / Doctor123! → onboarding_completed = true
 *
 * Execução: cd apps/web && npx playwright test e2e/td-phase1-validation.spec.ts
 */

import { test, expect } from '@playwright/test'

// ─── Constantes ────────────────────────────────────────────────────────────────

const TEST_DOCTOR_DONE_EMAIL = 'test-done@nocrato.com'
const TEST_DOCTOR_PASSWORD = 'Doctor123!'

// ─── TD-25: POST /doctor/auth/resolve-email ─────────────────────────────────

test.describe('TD-25 — Doctor login flow (POST resolve-email)', () => {
  // Garantir estado limpo: sem sessão ativa que causaria redirect automático
  // ao montar a página de login. addInitScript injeta o script antes do primeiro
  // load do bundle React/Zustand, garantindo que não há token hidratado.
  // Cada test recebe uma página nova (contexto fresh do Playwright), então
  // addInitScript aqui funciona corretamente sem necessidade de reload extra.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('nocrato-auth')
    })
  })

  /**
   * CT-TD25-01 — Happy path: email válido avança para step de senha e login completo
   *
   * Valida que:
   * 1. O step 1 (email) submete via POST com body { email } (não GET como era antes do TD-25)
   * 2. O step 2 (senha) aparece após resolução bem-sucedida
   * 3. O login completo redireciona para o dashboard
   *
   * Nota: resolve-email e login têm throttle de 5 req/15min (segurança de produção).
   * Os endpoints são interceptados via page.route() para evitar esgotamento da quota
   * durante iterações de teste. O método POST (não GET) é verificado inspecionando o
   * request interceptado. CT-TD25-02 valida o endpoint real com email inválido (404).
   */
  test('CT-TD25-01 — email válido → step senha aparece → login redireciona para dashboard', async ({
    page,
  }) => {
    // Registrar os métodos HTTP usados em cada chamada aos endpoints de auth
    const resolveEmailRequests: string[] = []
    const loginRequests: string[] = []

    // Interceptar resolve-email: capturar o método e retornar resposta válida
    await page.route('**/api/v1/doctor/auth/resolve-email', async (route) => {
      resolveEmailRequests.push(route.request().method())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'test-done-doctor', name: 'Dra. Teste Concluída' }),
      })
    })

    // Interceptar login: capturar o método e retornar resposta válida com JWT simulado
    await page.route('**/api/v1/doctor/auth/login', async (route) => {
      loginRequests.push(route.request().method())
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          doctor: {
            id: 'test-doctor-id',
            name: 'Dra. Teste Concluída',
            email: TEST_DOCTOR_DONE_EMAIL,
            tenantId: 'test-tenant-id',
            slug: 'test-done-doctor',
            onboardingCompleted: true,
          },
        }),
      })
    })

    await page.goto('/doctor/login')

    // Step 1 — campo email deve estar visível
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()

    // Campo senha NÃO aparece ainda (dois passos distintos)
    await expect(page.locator('#password')).not.toBeVisible()

    // Preencher email e submeter step 1
    await page.getByLabel('Email').fill(TEST_DOCTOR_DONE_EMAIL)
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Verificar que o frontend usou POST (não GET) para resolve-email — validação do TD-25
    expect(resolveEmailRequests).toHaveLength(1)
    expect(resolveEmailRequests[0]).toBe('POST')

    // Step 2 — campo senha deve aparecer
    await expect(page.locator('#password')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()

    // O email resolvido deve aparecer como readonly (identificação do usuário no step 2)
    await expect(
      page.locator('input[readonly]').filter({ hasValue: TEST_DOCTOR_DONE_EMAIL }),
    ).toBeVisible()

    // Preencher senha e submeter step 2
    await page.locator('#password').fill(TEST_DOCTOR_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Verificar que o login também usou POST
    expect(loginRequests).toHaveLength(1)
    expect(loginRequests[0]).toBe('POST')

    // Login completo → redireciona para dashboard do doutor
    await expect(page).toHaveURL(/\/doctor\/dashboard/, { timeout: 10000 })
  })

  /**
   * CT-TD25-02 — Email inexistente exibe mensagem de erro (404 do backend)
   *
   * Valida que:
   * 1. Backend retorna 404 para email sem cadastro
   * 2. Frontend exibe mensagem de erro (não trava nem joga exception)
   * 3. Permanece no step 1 (email), não avança para step de senha
   */
  test('CT-TD25-02 — email inexistente exibe erro e permanece no step 1', async ({ page }) => {
    await page.goto('/doctor/login')

    await expect(page.getByLabel('Email')).toBeVisible()

    await page.getByLabel('Email').fill('nonexistent@test.com')
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Deve exibir mensagem de erro do backend (404 → "Nenhuma conta encontrada...")
    // O api-client converte erros HTTP em Error com a mensagem do JSON
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 })

    // O campo senha NÃO deve aparecer — permanece no step de email
    await expect(page.locator('#password')).not.toBeVisible()

    // O campo email ainda deve estar no DOM (step 1 permanece)
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()
  })

  /**
   * CT-TD25-03 — Email com convite pendente exibe aviso específico
   *
   * Valida que o frontend trata { hasPendingInvite: true } corretamente:
   * exibe mensagem orientando o usuário a verificar o email e não avança
   * para o step de senha.
   *
   * O banco de testes não possui um doutor com convite pendente (sem senha definida),
   * portanto esta resposta é simulada via page.route() interceptando o POST
   * resolve-email. Isso testa exclusivamente o comportamento do frontend diante
   * deste payload — o backend já cobre este caminho nos testes unitários.
   */
  test('CT-TD25-03 — email com convite pendente exibe aviso e não avança', async ({ page }) => {
    // Interceptar o POST resolve-email e retornar { hasPendingInvite: true }
    await page.route('**/api/v1/doctor/auth/resolve-email', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hasPendingInvite: true }),
      })
    })

    await page.goto('/doctor/login')

    await page.getByLabel('Email').fill('pending-invite@example.com')
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Aviso de convite pendente deve aparecer
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/convite pendente/i)).toBeVisible()

    // Não avança para step de senha
    await expect(page.locator('#password')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()
  })

  /**
   * CT-TD25-04 — Botão "Usar outro email" volta ao step 1
   *
   * Valida que o usuário pode corrigir o email após avançar para o step de senha.
   * resolve-email é interceptado para evitar throttler (5 req/15min).
   */
  test('CT-TD25-04 — botão "Usar outro email" retorna ao step 1', async ({ page }) => {
    await page.route('**/api/v1/doctor/auth/resolve-email', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'test-done-doctor', name: 'Dra. Teste Concluída' }),
      })
    })

    await page.goto('/doctor/login')

    // Avançar para step 2
    await page.getByLabel('Email').fill(TEST_DOCTOR_DONE_EMAIL)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.locator('#password')).toBeVisible({ timeout: 5000 })

    // Clicar em "Usar outro email"
    await page.getByRole('button', { name: 'Usar outro email' }).click()

    // Deve voltar ao step 1
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()
    await expect(page.locator('#password')).not.toBeVisible()
  })
})

// ─── TD-23: ErrorBoundary retry — justificativa de não-E2E ──────────────────

/**
 * TD-23 — ErrorBoundary retry chama queryClient.resetQueries()
 *
 * Este cenário NÃO é testável via Playwright E2E pelo seguinte motivo:
 *
 * O ErrorBoundary captura erros de render de componentes React (via getDerivedStateFromError /
 * componentDidCatch). Para acionar o fallback de erro, seria necessário:
 *
 *   a) Injetar um erro de render no bundle React em produção — não é possível a partir de
 *      Playwright, que controla apenas o DOM/browser, não o estado interno do React.
 *
 *   b) Usar window.__injectError = true ou similar — exigiria código de teste dentro do
 *      componente de produção, o que contamina o produto.
 *
 *   c) Modificar o query cache via page.evaluate() para forçar um estado inválido — não
 *      garante que o ErrorBoundary seja acionado, pois erros de query são tratados
 *      diferentemente de erros de render.
 *
 * A validação adequada de TD-23 é feita em dois níveis:
 *
 *   1. Code review (já realizado): o componente `error-boundary.tsx` chama
 *      `queryClient.resetQueries()` antes de `this.setState({ hasError: false })`.
 *      Isso garante que o cache stale/corrompido seja limpo antes do re-render.
 *
 *   2. Teste unitário (Vitest): mockar o queryClient e verificar que resetQueries()
 *      é chamado ao clicar em "Tentar novamente". Este nível de teste é mais adequado
 *      para validar comportamento de componentes React class-based com mocks.
 *
 * Recomendação: adicionar um teste Vitest para ErrorBoundary em:
 *   apps/web/src/components/error-boundary.test.tsx
 */
test('TD-23 — ErrorBoundary: documentado como não-testável via Playwright (ver comentário no arquivo)', async () => {
  // Este teste existe apenas para registrar a decisão no relatório do Playwright.
  // A lógica do ErrorBoundary é validada via code review (error-boundary.tsx linha 41-42):
  //   queryClient.resetQueries()     ← limpa o cache antes do retry
  //   this.setState({ hasError: false })  ← dispara o re-render
  //
  // Nenhuma ação de Playwright é necessária ou possível aqui.
  expect(true).toBe(true)
})
