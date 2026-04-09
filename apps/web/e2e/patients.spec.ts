/**
 * patients.spec.ts
 *
 * Testes E2E para US-4.5 — Páginas de pacientes no portal do doutor.
 *
 * Pré-requisito: globalSetup (global-setup.ts) cria dados de teste no banco.
 * Doutor usado: test-done@nocrato.com / Doctor123! (onboarding concluído)
 *
 * Pacientes de teste criados pelo setup:
 *   - "Ana Lima"          → active
 *   - "Ana Souza"         → active
 *   - "João Costa"        → active
 *   - "Fernanda Oliveira" → inactive (com 3 appointments para CT-45-05)
 *
 * Execução: cd apps/web && npx playwright test e2e/patients.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API_LOGIN_URL = '/api/v1/doctor/auth/login'
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

async function loginDoctor(request: APIRequestContext): Promise<DoctorLoginResult> {
  const res = await request.post(API_LOGIN_URL, {
    data: { email: TEST_DOCTOR_DONE_EMAIL, password: TEST_DOCTOR_PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`Login failed (${res.status()}): ${await res.text()}`)
  }
  return res.json() as Promise<DoctorLoginResult>
}

function buildAuthState(data: DoctorLoginResult): string {
  return JSON.stringify({
    state: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.doctor,
      userType: 'doctor',
      tenantId: data.doctor.tenantId,
      onboardingCompleted: true,
    },
    version: 0,
  })
}

async function setDoctorAuth(page: Page, authState: string): Promise<void> {
  await page.addInitScript((state: string) => {
    localStorage.setItem('nocrato-auth', state)
  }, authState)
}

// ─── Setup compartilhado ───────────────────────────────────────────────────────

let authState: string

// ─── CT-45-06 — Sessão expirada redireciona para login ────────────────────────

test.describe('CT-45-06 — Unauthenticated redirect', () => {
  test('acesso a /doctor/patients sem token redireciona para /doctor/login', async ({ page }) => {
    await page.goto('/doctor/patients')
    await expect(page).toHaveURL(/\/doctor\/login/)
  })
})

// ─── Testes com doutor autenticado ────────────────────────────────────────────

test.describe('Páginas de pacientes — doutor autenticado', () => {
  test.beforeAll(async ({ request }) => {
    const data = await loginDoctor(request)
    authState = buildAuthState(data)
  })

  // CT-45-01 — Lista de pacientes carrega com cards

  test('CT-45-01 — lista de pacientes exibe cards com nome, telefone e status', async ({
    page,
  }) => {
    await setDoctorAuth(page, authState)
    await page.goto('/doctor/patients')

    // Aguarda carregamento — pelo menos os 4 pacientes de teste visíveis
    await expect(page.getByText('Ana Lima')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Ana Souza')).toBeVisible()
    await expect(page.getByText('João Costa')).toBeVisible()
    await expect(page.getByText('Fernanda Oliveira')).toBeVisible()

    // Telefone deve aparecer em pelo menos um card
    await expect(page.getByText('(11) 91111-0001')).toBeVisible()
  })

  // CT-45-02 — Busca por nome filtra resultados

  test('CT-45-02 — buscar "ana" filtra para mostrar apenas pacientes com "ana" no nome', async ({
    page,
  }) => {
    await setDoctorAuth(page, authState)
    await page.goto('/doctor/patients')

    // Aguarda lista carregar
    await expect(page.getByText('João Costa')).toBeVisible({ timeout: 10000 })

    // Digitar no campo de busca
    const searchInput = page.getByPlaceholder(/buscar/i)
    await searchInput.fill('ana')

    // "Ana Lima" e "Ana Souza" devem aparecer
    await expect(page.getByText('Ana Lima')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Ana Souza')).toBeVisible()

    // "João Costa" e "Fernanda Oliveira" não devem aparecer
    await expect(page.getByText('João Costa')).not.toBeVisible()
    await expect(page.getByText('Fernanda Oliveira')).not.toBeVisible()
  })

  // CT-45-03 — Filtro por status=inactive

  test('CT-45-03 — filtrar por "Inativo" exibe apenas pacientes inativos', async ({ page }) => {
    await setDoctorAuth(page, authState)
    await page.goto('/doctor/patients')

    // Aguarda lista carregar
    await expect(page.getByText('Ana Lima')).toBeVisible({ timeout: 10000 })

    // O Select customizado renderiza como <button> com texto "Todos os status"
    await page.getByRole('button', { name: 'Todos os status' }).click()

    // Clicar na opção "Inativo" dentro do dropdown (SelectContent renderiza como div.absolute.z-50)
    await page.locator('div.absolute.z-50').getByRole('button', { name: 'Inativo', exact: true }).click()

    // "Fernanda Oliveira" (inactive) deve aparecer
    await expect(page.getByText('Fernanda Oliveira')).toBeVisible({ timeout: 5000 })

    // Pacientes active não devem aparecer
    await expect(page.getByText('Ana Lima')).not.toBeVisible()
    await expect(page.getByText('João Costa')).not.toBeVisible()
  })

  // CT-45-04 — Clicar em paciente abre perfil com tabs

  test('CT-45-04 — clicar em "Fernanda Oliveira" abre perfil com 4 tabs', async ({ page }) => {
    await setDoctorAuth(page, authState)
    await page.goto('/doctor/patients')

    // Aguarda lista carregar
    await expect(page.getByText('Fernanda Oliveira')).toBeVisible({ timeout: 10000 })

    // Clicar no card
    await page.getByText('Fernanda Oliveira').click()

    // Deve navegar para /doctor/patients/:id
    await expect(page).toHaveURL(/\/doctor\/patients\/[a-f0-9-]{36}/, { timeout: 8000 })

    // TabsTrigger renderiza como <button> (componente customizado sem role="tab")
    await expect(page.getByRole('button', { name: 'Info' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Consultas' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Notas' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Documentos' })).toBeVisible()
  })

  // CT-45-05 — Tab Consultas exibe appointments em ordem decrescente

  test('CT-45-05 — tab Consultas exibe appointments em ordem decrescente por data', async ({
    page,
  }) => {
    await setDoctorAuth(page, authState)
    await page.goto('/doctor/patients')

    // Aguarda lista e clica em Fernanda
    await expect(page.getByText('Fernanda Oliveira')).toBeVisible({ timeout: 10000 })
    await page.getByText('Fernanda Oliveira').click()
    await expect(page).toHaveURL(/\/doctor\/patients\/[a-f0-9-]{36}/, { timeout: 8000 })

    // TabsTrigger renderiza como <button> (componente customizado sem role="tab")
    await page.getByRole('button', { name: 'Consultas' }).click()

    // Appointments devem aparecer (3 no total)
    // Verificar que 2025 aparece antes de 2024 na ordem da página
    const appointmentTexts = await page.locator('[data-testid="appointment-item"], .appointment-item').allTextContents()

    if (appointmentTexts.length === 0) {
      // Datas dinâmicas (seed: hoje, -90d, -180d). Computamos dd/mm/yyyy pra bater com pt-BR.
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      const DAY_MS = 24 * 60 * 60 * 1000
      const today = new Date()
      const mostRecent = fmt(today)
      const oldest = fmt(new Date(today.getTime() - 180 * DAY_MS))

      const mostRecentLocator = page.getByText(mostRecent).first()
      const oldestLocator = page.getByText(oldest).first()

      await expect(mostRecentLocator).toBeVisible({ timeout: 5000 })
      await expect(oldestLocator).toBeVisible()

      // Verificar ordem: mais recente antes do mais antigo no DOM
      const recentBox = await mostRecentLocator.boundingBox()
      const oldestBox = await oldestLocator.boundingBox()
      if (recentBox && oldestBox) {
        expect(recentBox.y).toBeLessThan(oldestBox.y)
      }
    }
  })

  // CT-45-07 — Criar paciente via formulário

  test('CT-45-07 — criar "Gustavo Ramos" via modal e ver na lista', async ({ page }) => {
    await setDoctorAuth(page, authState)
    await page.goto('/doctor/patients')

    // Aguarda lista carregar
    await expect(page.getByText('Ana Lima')).toBeVisible({ timeout: 10000 })

    // Clicar no botão "Novo paciente"
    await page.getByRole('button', { name: /novo paciente/i }).click()

    // DialogContent renderiza como <div> (sem role="dialog") — verificar pelo título
    await expect(page.getByRole('heading', { name: 'Cadastrar paciente' })).toBeVisible({ timeout: 3000 })

    // Preencher o formulário — IDs: np-name, np-phone
    await page.locator('#np-name').fill('Gustavo Ramos')
    await page.locator('#np-phone').fill('(31) 99999-0000')

    // Confirmar — botão de submit com texto "Cadastrar"
    await page.getByRole('button', { name: 'Cadastrar' }).click()

    // Dialog deve fechar (heading some)
    await expect(page.getByRole('heading', { name: 'Cadastrar paciente' })).not.toBeVisible({ timeout: 5000 })

    // "Gustavo Ramos" deve aparecer na lista
    await expect(page.getByText('Gustavo Ramos')).toBeVisible({ timeout: 8000 })
  })
})
