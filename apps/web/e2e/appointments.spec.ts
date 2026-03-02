/**
 * appointments.spec.ts
 *
 * Testes E2E para US-5.6 — Dashboard + páginas de consultas no portal do doutor.
 *
 * Pré-requisito: globalSetup (global-setup.ts) cria dados de teste no banco.
 * Doutor usado: test-done@nocrato.com / Doctor123! (onboarding concluído)
 *
 * Dados criados pelo seed:
 *   - Pacientes: Ana Lima, Ana Souza, João Costa, Fernanda Oliveira (inactive)
 *   - Appointments: 1 scheduled HOJE às 10h UTC (Fernanda), 2 completed antigos
 *
 * Seletores verificados via Playwright MCP (2026-03-02):
 *   - Select customizado: renderiza como <button> com texto do valor atual
 *   - Dialog: heading via getByRole('heading'), submit via getByRole('button', { name })
 *   - Detalhe: breadcrumb usa link "Consultas" (não "Voltar")
 *
 * Execução: cd apps/web && npx playwright test e2e/appointments.spec.ts
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3000'
const TEST_EMAIL = 'test-done@nocrato.com'
const TEST_PASSWORD = 'Doctor123!'

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
  const res = await request.post(`${API_URL}/api/v1/doctor/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
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

// ─── CT-56-01: Dashboard exibe consultas de hoje ───────────────────────────────

test('CT-56-01: dashboard exibe cards de stats e lista de consultas de hoje', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'nocrato-auth', value: buildAuthState(loginData) },
  )

  await page.goto('http://localhost:5173/doctor/dashboard')
  await page.waitForLoadState('networkidle')

  // Cards de stats devem estar visíveis
  await expect(page.getByText('Consultas hoje')).toBeVisible()
  await expect(page.getByText('Total de pacientes')).toBeVisible()
  await expect(page.getByText('Seguimentos pendentes')).toBeVisible()

  // Seção de consultas de hoje
  await expect(page.getByRole('heading', { name: 'Consultas de hoje' })).toBeVisible()

  // Pelo menos 1 consulta hoje (seed cria 1 scheduled para hoje)
  const appointmentLinks = page.locator('a[href*="/doctor/appointments/"]')
  await expect(appointmentLinks.first()).toBeVisible()

  // Badge de status (pode ser "Agendada" ou outro conforme estado do DB)
  const statusBadge = page.locator('a[href*="/doctor/appointments/"]').first()
    .locator('span, [class*="bg-"]')
  await expect(statusBadge.first()).toBeVisible()

  // Link "Ver todas" vai para /doctor/appointments
  const verTodas = page.getByRole('link', { name: /ver todas/i })
  await expect(verTodas).toBeVisible()
  await verTodas.click()
  await expect(page).toHaveURL(/\/doctor\/appointments/)
})

// ─── CT-56-02: Listagem com filtro de status funciona ─────────────────────────

test('CT-56-02: listagem de consultas com filtro de status', async ({ page, request }) => {
  const loginData = await loginDoctor(request)
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'nocrato-auth', value: buildAuthState(loginData) },
  )

  await page.goto('http://localhost:5173/doctor/appointments')
  await page.waitForLoadState('networkidle')

  // Cabeçalho da página
  await expect(page.getByRole('heading', { name: 'Consultas', exact: true })).toBeVisible()

  // Tabela deve ter pelo menos 1 linha (seed tem 3 appointments)
  const tableRows = page.locator('table tbody tr')
  await expect(tableRows.first()).toBeVisible()

  // Filtrar por status "Agendada" — Select customizado abre ao clicar no trigger
  await page.getByRole('button', { name: 'Todos os status' }).click()

  // Dropdown com opções deve aparecer — botão "Agendada" fica visível
  await expect(page.getByRole('button', { name: 'Agendada', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Agendada', exact: true }).click()

  // Apenas consultas scheduled devem aparecer — "Concluída" some
  await expect(page.getByText('Concluída')).not.toBeVisible()

  // Resetar filtro via "Limpar filtros" (botão que aparece quando há filtro ativo)
  await expect(page.getByRole('button', { name: 'Limpar filtros' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpar filtros' }).click()

  // Consultas "Concluída" voltam a aparecer
  await expect(page.getByText('Concluída').first()).toBeVisible()
})

// ─── CT-56-03: Dialog criar consulta manual funciona ──────────────────────────

test('CT-56-03: dialog nova consulta cria appointment e exibe na lista', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'nocrato-auth', value: buildAuthState(loginData) },
  )

  await page.goto('http://localhost:5173/doctor/appointments')
  await page.waitForLoadState('networkidle')

  // Contar linhas antes de criar
  const tableRows = page.locator('table tbody tr')
  const countBefore = await tableRows.count()

  // Clicar em "Nova consulta"
  await page.getByRole('button', { name: 'Nova consulta' }).click()

  // Dialog deve aparecer pelo heading
  await expect(page.getByRole('heading', { name: 'Nova consulta' })).toBeVisible()

  // Buscar paciente "Ana" (Ana Lima ou Ana Souza do seed)
  await page.getByPlaceholder('Buscar paciente por nome...').fill('Ana')
  await page.waitForTimeout(700) // aguardar debounce da query

  // Selecionar primeira opção que aparecer (Ana Lima ou Ana Souza)
  const firstPatientOption = page.getByRole('button', { name: /ana/i }).first()
  await expect(firstPatientOption).toBeVisible({ timeout: 5000 })
  await firstPatientOption.click()

  // Preencher data e hora (15 dias à frente às 09:00)
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 15)
  const dateStr = futureDate.toISOString().slice(0, 10) // YYYY-MM-DD
  const dateTimeLocal = `${dateStr}T09:00`

  await page.getByLabel('Data e hora *').fill(dateTimeLocal)

  // Clicar em "Criar consulta"
  await page.getByRole('button', { name: 'Criar consulta' }).click()

  // Toast de sucesso
  await expect(page.getByText(/consulta criada/i)).toBeVisible({ timeout: 5000 })

  // Nova consulta aparece na lista — count deve ter aumentado
  await page.waitForLoadState('networkidle')
  const countAfter = await tableRows.count()
  expect(countAfter).toBeGreaterThan(countBefore)
})

// ─── CT-56-04: Botões contextuais mudam conforme status da consulta ────────────

test('CT-56-04: botões contextuais corretos por status (waiting → in_progress)', async ({
  page,
  request,
}) => {
  // Login via API
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar a consulta scheduled de hoje (criada pelo seed para Fernanda Oliveira)
  const listRes = await request.get(`${API_URL}/api/v1/doctor/appointments?status=scheduled`, {
    headers,
  })
  expect(listRes.ok()).toBeTruthy()
  const listData = (await listRes.json()) as { data: Array<{ id: string }> }
  expect(listData.data.length).toBeGreaterThan(0)
  const appointmentId = listData.data[0].id

  // Avançar para "waiting" via API (simula chamar o paciente)
  const patchRes = await request.patch(
    `${API_URL}/api/v1/doctor/appointments/${appointmentId}/status`,
    { headers, data: { status: 'waiting' } },
  )
  expect(patchRes.ok()).toBeTruthy()

  // Configurar auth no browser
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'nocrato-auth', value: buildAuthState(loginData) },
  )

  // Navegar para detalhe da consulta
  await page.goto(`http://localhost:5173/doctor/appointments/${appointmentId}`)
  await page.waitForLoadState('networkidle')

  // Badge "Aguardando" deve estar visível
  await expect(page.getByText('Aguardando').first()).toBeVisible()

  // Botão "Iniciar atendimento" presente
  await expect(page.getByRole('button', { name: 'Iniciar atendimento' })).toBeVisible()

  // "Finalizar consulta" ausente neste estado
  await expect(page.getByRole('button', { name: 'Finalizar consulta' })).not.toBeVisible()

  // Clicar "Iniciar atendimento" → muda para in_progress
  await page.getByRole('button', { name: 'Iniciar atendimento' }).click()

  // Aguardar badge mudar para "Em atendimento"
  await expect(page.getByText('Em atendimento').first()).toBeVisible({ timeout: 5000 })

  // Agora "Finalizar consulta" deve aparecer; "Iniciar atendimento" some
  await expect(page.getByRole('button', { name: 'Finalizar consulta' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar atendimento' })).not.toBeVisible()
})

// ─── CT-56-05: Detalhe exibe paciente e seção de notas clínicas ───────────────

test('CT-56-05: detalhe da consulta exibe dados do paciente e seção de notas clínicas', async ({
  page,
  request,
}) => {
  // Login via API
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar a consulta de hoje (in_progress após CT-56-04, ou scheduled na primeira rodada)
  // Preferimos in_progress → scheduled → qualquer uma
  let appointmentId: string | undefined
  for (const status of ['in_progress', 'scheduled', '']) {
    const url = status
      ? `${API_URL}/api/v1/doctor/appointments?status=${status}&limit=5`
      : `${API_URL}/api/v1/doctor/appointments?limit=5`
    const listRes = await request.get(url, { headers })
    if (listRes.ok()) {
      const listData = (await listRes.json()) as { data: Array<{ id: string }> }
      if (listData.data.length > 0) {
        appointmentId = listData.data[0].id
        break
      }
    }
  }
  expect(appointmentId).toBeTruthy()

  // Configurar auth no browser
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'nocrato-auth', value: buildAuthState(loginData) },
  )

  await page.goto(`http://localhost:5173/doctor/appointments/${appointmentId}`)
  await page.waitForLoadState('networkidle')

  // Breadcrumb com link "Consultas" na main (escopo para evitar conflito com sidebar)
  await expect(page.getByRole('main').getByRole('link', { name: 'Consultas' })).toBeVisible()

  // Card do paciente visível (heading "Paciente" + campo "Nome" preenchido)
  await expect(page.getByRole('heading', { name: 'Paciente' })).toBeVisible()
  await expect(page.getByText('Nome').first()).toBeVisible()

  // Seção de notas clínicas deve existir (Epic 6 ainda não implementado → estado vazio)
  await expect(page.getByRole('heading', { name: 'Notas clínicas' })).toBeVisible()

  // Mensagem de estado vazio das notas
  await expect(page.getByText(/nenhuma nota clínica/i)).toBeVisible()

  // Status badge visível no topo
  const mainArea = page.locator('main')
  const statusText = mainArea.locator('text=/Agendada|Aguardando|Em atendimento|Concluída|Cancelada|Reagendada|Não compareceu/')
  await expect(statusText.first()).toBeVisible()
})
