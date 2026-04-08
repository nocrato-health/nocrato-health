/**
 * doctor-onboarding.spec.ts
 *
 * Testes E2E para US-3.2 — Wizard de onboarding do doutor.
 *
 * Pré-requisito: globalSetup (global-setup.ts) cria os doutores de teste no banco.
 * Doutores usados:
 *   - test-new@nocrato.com   / Doctor123! → onboarding_completed = false
 *   - test-done@nocrato.com  / Doctor123! → onboarding_completed = true
 *
 * Execução: cd apps/web && npx playwright test e2e/doctor-onboarding.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API_LOGIN_URL = '/api/v1/doctor/auth/login'
const TEST_DOCTOR_NEW_EMAIL = 'test-new@nocrato.com'
const TEST_DOCTOR_DONE_EMAIL = 'test-done@nocrato.com'
const TEST_DOCTOR_PASSWORD = 'Doctor123!'

interface DoctorLoginResult {
  accessToken: string
  refreshToken: string
  doctor: {
    id: string
    name: string
    email: string
    tenantId: string
    slug: string
    onboardingCompleted: boolean
  }
}

async function loginDoctor(
  request: APIRequestContext,
  email: string,
): Promise<DoctorLoginResult> {
  const res = await request.post(API_LOGIN_URL, {
    data: { email, password: TEST_DOCTOR_PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`Login failed (${res.status()}): ${await res.text()}`)
  }
  return res.json() as Promise<DoctorLoginResult>
}

function buildAuthState(
  data: DoctorLoginResult,
  onboardingCompleted: boolean,
): string {
  return JSON.stringify({
    state: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.doctor,
      userType: 'doctor',
      tenantId: data.doctor.tenantId,
      onboardingCompleted,
    },
    version: 0,
  })
}

async function setDoctorAuth(page: Page, authState: string): Promise<void> {
  await page.addInitScript((state: string) => {
    localStorage.setItem('nocrato-auth', state)
  }, authState)
}

// ─── CT-32-06 — Acesso sem autenticação redireciona para login ──────────────────

test.describe('CT-32-06 — Unauthenticated redirect', () => {
  test('acesso a /doctor/onboarding sem token redireciona para /doctor/login', async ({
    page,
  }) => {
    await page.goto('/doctor/onboarding')
    await expect(page).toHaveURL(/\/doctor\/login/)
  })
})

// ─── Testes com doutor NÃO-onboardizado ──────────────────────────────────────

test.describe('Doctor Wizard — doutor com onboarding pendente', () => {
  let authStateNew: string

  test.beforeAll(async ({ request }) => {
    const data = await loginDoctor(request, TEST_DOCTOR_NEW_EMAIL)
    authStateNew = buildAuthState(data, false)
  })

  // CT-32-02 — Redirect automático de /doctor/dashboard para /doctor/onboarding

  test('CT-32-02 — acesso ao dashboard redireciona para onboarding quando pendente', async ({
    page,
  }) => {
    await setDoctorAuth(page, authStateNew)
    await page.goto('/doctor/dashboard')
    await expect(page).toHaveURL(/\/doctor\/onboarding/)
  })

  // CT-32-04 — Validação do Step 1

  test('CT-32-04 — Step 1: campos obrigatórios bloqueiam avanço se vazios', async ({
    page,
  }) => {
    await setDoctorAuth(page, authStateNew)
    await page.goto('/doctor/onboarding')

    // Deve exibir Step 1 com título
    await expect(page.getByText('Perfil profissional')).toBeVisible()
    await expect(page.getByText('25% concluído')).toBeVisible()

    // Clicar "Próximo" sem preencher nada — validação deve bloquear
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Mensagem de erro de nome visível
    await expect(page.getByText('Nome deve ter ao menos 3 caracteres')).toBeVisible()

    // Permanece no Step 1
    await expect(page).toHaveURL(/\/doctor\/onboarding/)
    await expect(page.getByText('Perfil profissional')).toBeVisible()

    // Preencher nome mas deixar CRM vazio
    await page.fill('#name', 'Dra. Ana Carvalho')
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Erro de CRM visível
    await expect(page.getByText('CRM deve ter ao menos 3 caracteres')).toBeVisible()

    // Permanece no Step 1
    await expect(page.getByText('Perfil profissional')).toBeVisible()
  })

  // CT-32-05 — Step 3 (Branding) é opcional — avanço sem preenchimento

  test('CT-32-05 — Step 3 branding é opcional: avança para Step 4 sem preenchimento', async ({
    page,
  }) => {
    await setDoctorAuth(page, authStateNew)
    await page.goto('/doctor/onboarding')

    // Step 1 — preencher dados mínimos obrigatórios
    await expect(page.getByText('Perfil profissional')).toBeVisible()
    await page.fill('#name', 'Dra. Ana Carvalho')
    await page.fill('#crm', '654321')
    // crmState é shadcn Select (button) — SelectItem também renderiza como button
    await page.getByRole('button', { name: 'Selecione o estado' }).click()
    await page.getByRole('button', { name: 'RJ', exact: true }).click()
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Step 2 — horários já têm defaults (seg-sex habilitados); apenas clicar Próximo
    await expect(page.getByRole('heading', { name: 'Horários de atendimento' })).toBeVisible()
    await expect(page.getByText('50% concluído')).toBeVisible()
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Step 3 — branding: verificar aviso de opcional + avançar sem preencher
    await expect(page.getByText('Identidade visual')).toBeVisible()
    await expect(page.getByText('75% concluído')).toBeVisible()
    await expect(
      page.getByText('Esta etapa é opcional — você pode avançar sem preencher nada'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Step 4 — deve ter avançado sem erro
    await expect(page.getByText('Configuração do agente')).toBeVisible()
    await expect(page.getByText('100% concluído')).toBeVisible()
  })

  // CT-32-01 — Happy path completo: 4 steps → redirect para dashboard

  test('CT-32-01 — happy path: wizard completo redireciona para dashboard', async ({
    page,
  }) => {
    await setDoctorAuth(page, authStateNew)
    await page.goto('/doctor/onboarding')

    // Step 1 — Perfil
    await expect(page.getByText('Perfil profissional')).toBeVisible()
    await expect(page.getByText('25% concluído')).toBeVisible()
    await page.fill('#name', 'Dra. Ana Carvalho')
    await page.fill('#crm', '654321')
    // crmState é shadcn Select (button) — SelectItem também renderiza como button
    await page.getByRole('button', { name: 'Selecione o estado' }).click()
    await page.getByRole('button', { name: 'RJ', exact: true }).click()
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Step 2 — Horários
    await expect(page.getByRole('heading', { name: 'Horários de atendimento' })).toBeVisible()
    await expect(page.getByText('50% concluído')).toBeVisible()
    // Defaults: seg-sex habilitados (08:00-17:00), timezone Brasília, 30min
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Step 3 — Branding (opcional)
    await expect(page.getByText('Identidade visual')).toBeVisible()
    await expect(page.getByText('75% concluído')).toBeVisible()
    await page.getByRole('button', { name: 'Próximo' }).click()

    // Step 4 — Agente
    await expect(page.getByText('Configuração do agente')).toBeVisible()
    await expect(page.getByText('100% concluído')).toBeVisible()
    await page.fill('#welcomeMessage', 'Olá! Sou o assistente da Dra. Ana. Como posso ajudar?')
    await page.getByRole('button', { name: 'Concluir configuração' }).click()

    // Deve redirecionar para o dashboard após conclusão
    await expect(page).toHaveURL(/\/doctor\/dashboard/, { timeout: 10000 })
  })
})

// ─── CT-32-03 — Doutor onboardizado não entra no wizard ───────────────────────

test.describe('CT-32-03 — Doutor com onboarding completo', () => {
  let authStateDone: string

  test.beforeAll(async ({ request }) => {
    const data = await loginDoctor(request, TEST_DOCTOR_DONE_EMAIL)
    authStateDone = buildAuthState(data, true)
  })

  test('CT-32-03 — acesso a /doctor/onboarding redireciona para dashboard', async ({
    page,
  }) => {
    await setDoctorAuth(page, authStateDone)
    await page.goto('/doctor/onboarding')
    await expect(page).toHaveURL(/\/doctor\/dashboard/)
  })
})
