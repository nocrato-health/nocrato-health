/**
 * clinical.spec.ts
 *
 * Testes E2E para US-6.5 — Notas clínicas e documentos no portal do doutor.
 *
 * Pré-requisito: globalSetup (global-setup.ts) cria dados de teste no banco.
 * Doutor usado: test-done@nocrato.com / Doctor123! (onboarding concluído)
 *
 * CT-65-01: criar nota clínica a partir do detalhe da consulta
 * CT-65-02: ver notas na tab "Notas" do perfil do paciente
 * CT-65-03: upload de documento e visualização na tab "Documentos"
 * CT-65-04: estados vazios com mensagem explicativa
 * CT-65-05: filtro por tipo de documento funciona no frontend
 *
 * Seletores verificados via inspeção de componentes (2026-03-03):
 *   - Dialog: h2 via getByRole('heading') — sem role="dialog"
 *   - TabsTrigger: <button> — getByRole('button', { name: /Notas/ })
 *   - SelectValue: mostra valor bruto (ex: "prescription"), não label
 *   - SelectTrigger (vazio): mostra placeholder (ex: "Todos os tipos")
 *   - Toast: <div> com texto da mensagem, dura 3.5s
 *
 * Execução: cd apps/web && npx playwright test e2e/clinical.spec.ts
 */

import { test, expect, type APIRequestContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Constantes ────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3000'
const APP_URL = 'http://localhost:5173'
const TEST_EMAIL = 'test-done@nocrato.com'
const TEST_PASSWORD = 'Doctor123!'
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'test-doc.pdf')

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

async function setupBrowserAuth(
  page: import('@playwright/test').Page,
  loginData: DoctorLoginResult,
): Promise<void> {
  await page.goto(APP_URL)
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'nocrato-auth', value: buildAuthState(loginData) },
  )
}

// ─── CT-65-01: criar nota clínica a partir do detalhe da consulta ─────────────

test('CT-65-01: criar nota clínica a partir do detalhe da consulta', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar qualquer consulta disponível (qualquer status)
  const listRes = await request.get(`${API_URL}/api/v1/doctor/appointments?limit=5`, { headers })
  expect(listRes.ok()).toBeTruthy()
  const listData = (await listRes.json()) as { data: Array<{ id: string }> }
  expect(listData.data.length).toBeGreaterThan(0)
  const appointmentId = listData.data[0].id

  // Configurar auth no browser
  await setupBrowserAuth(page, loginData)

  // Navegar para detalhe da consulta
  await page.goto(`${APP_URL}/doctor/appointments/${appointmentId}`)
  await page.waitForLoadState('networkidle')

  // Seção "Notas clínicas" deve estar visível
  await expect(page.getByRole('heading', { name: 'Notas clínicas' })).toBeVisible()

  // Botão "Adicionar nota" presente (aparece quando patient existe)
  await expect(page.getByRole('button', { name: 'Adicionar nota' })).toBeVisible()

  // Clicar no botão
  await page.getByRole('button', { name: 'Adicionar nota' }).click()

  // Dialog abre — verificar pelo heading h2
  await expect(page.getByRole('heading', { name: 'Adicionar Nota Clínica' })).toBeVisible()

  // Preencher textarea (validação mín. 10 chars)
  await page.getByPlaceholder('Descreva a evolução do paciente...').fill(
    'Paciente apresentou melhora significativa. Pressão normalizada.',
  )

  // Clicar "Salvar"
  await page.getByRole('button', { name: 'Salvar' }).click()

  // Toast de sucesso
  await expect(page.getByText('Nota criada com sucesso')).toBeVisible({ timeout: 5000 })

  // Dialog fecha
  await expect(page.getByRole('heading', { name: 'Adicionar Nota Clínica' })).not.toBeVisible()

  // Nota aparece na seção "Notas clínicas" da página
  await expect(
    page.getByText('Paciente apresentou melhora significativa. Pressão normalizada.'),
  ).toBeVisible({ timeout: 5000 })
})

// ─── CT-65-02: ver notas na tab "Notas" do perfil do paciente ─────────────────

test('CT-65-02: ver notas clínicas na tab "Notas" do perfil do paciente', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar uma consulta para obter patient_id
  const listRes = await request.get(`${API_URL}/api/v1/doctor/appointments?limit=5`, { headers })
  expect(listRes.ok()).toBeTruthy()
  const listData = (await listRes.json()) as {
    data: Array<{ id: string; patient_id: string }>
  }
  expect(listData.data.length).toBeGreaterThan(0)
  const appointment = listData.data[0]
  const patientId = appointment.patient_id

  // Criar uma nota via API para garantir que a tab tenha conteúdo
  const noteRes = await request.post(`${API_URL}/api/v1/doctor/clinical-notes`, {
    headers,
    data: {
      appointmentId: appointment.id,
      patientId,
      content: 'Nota de acompanhamento: pressão arterial dentro do esperado.',
    },
  })
  expect(noteRes.ok()).toBeTruthy()

  // Configurar auth no browser
  await setupBrowserAuth(page, loginData)

  // Navegar para perfil do paciente
  await page.goto(`${APP_URL}/doctor/patients/${patientId}`)
  await page.waitForLoadState('networkidle')

  // Clicar na tab "Notas" (renderiza como <button>)
  await page.getByRole('button', { name: /^Notas/ }).click()

  // Conteúdo da nota criada via API deve estar visível (podem existir múltiplas notas)
  await expect(
    page.getByText(/pressão arterial dentro do esperado|melhora significativa/i).first(),
  ).toBeVisible({ timeout: 5000 })
})

// ─── CT-65-03: upload de documento e visualização na tab "Documentos" ─────────

test('CT-65-03: upload de documento e visualização na tab "Documentos"', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar qualquer paciente ativo
  const patientsRes = await request.get(
    `${API_URL}/api/v1/doctor/patients?limit=5&status=active`,
    { headers },
  )
  expect(patientsRes.ok()).toBeTruthy()
  const patientsData = (await patientsRes.json()) as { data: Array<{ id: string; name: string }> }
  expect(patientsData.data.length).toBeGreaterThan(0)
  const patient = patientsData.data[0]

  // Configurar auth no browser
  await setupBrowserAuth(page, loginData)

  // Navegar para perfil do paciente
  await page.goto(`${APP_URL}/doctor/patients/${patient.id}`)
  await page.waitForLoadState('networkidle')

  // Clicar na tab "Documentos"
  await page.getByRole('button', { name: /^Documentos/ }).click()

  // Botão "Enviar documento" visível
  await expect(page.getByRole('button', { name: 'Enviar documento' })).toBeVisible()

  // Clicar no botão de upload
  await page.getByRole('button', { name: 'Enviar documento' }).click()

  // Dialog abre — verificar pelo heading h2
  await expect(page.getByRole('heading', { name: 'Upload de Documento' })).toBeVisible()

  // Selecionar tipo "Exame" — clicar no trigger do Select (id="doc-type")
  await page.locator('#doc-type').click()
  // Selecionar a opção "Exame" no dropdown (renderiza como button)
  await page.getByRole('button', { name: 'Exame', exact: true }).click()

  // Preencher descrição
  await page
    .getByPlaceholder('Adicione uma descrição para o documento...')
    .fill('Hemograma completo')

  // Fazer upload do arquivo de teste
  await page.locator('#doc-file').setInputFiles(FIXTURE_PDF)

  // Clicar "Enviar" (exact: true evita conflito com "Enviar documento")
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()

  // Toast de sucesso (upload pode levar alguns segundos)
  await expect(page.getByText('Documento enviado com sucesso')).toBeVisible({ timeout: 10000 })

  // Dialog fecha
  await expect(page.getByRole('heading', { name: 'Upload de Documento' })).not.toBeVisible()

  // Documento aparece na lista — tipo "Exame" visível
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Exame').first()).toBeVisible({ timeout: 5000 })
})

// ─── CT-65-04: estados vazios exibem mensagem explicativa ─────────────────────

test('CT-65-04: estados vazios exibem mensagem explicativa nas tabs Notas e Documentos', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Criar um paciente novo sem histórico
  const createRes = await request.post(`${API_URL}/api/v1/doctor/patients`, {
    headers,
    data: { name: 'Paciente Vazio CT65', phone: '(11) 99000-0065' },
  })
  expect(createRes.ok()).toBeTruthy()
  const newPatient = (await createRes.json()) as { id: string }

  // Configurar auth no browser
  await setupBrowserAuth(page, loginData)

  // Navegar para perfil do paciente
  await page.goto(`${APP_URL}/doctor/patients/${newPatient.id}`)
  await page.waitForLoadState('networkidle')

  // Tab "Notas" — empty state
  await page.getByRole('button', { name: /^Notas/ }).click()
  await expect(page.getByText('Nenhuma nota clínica')).toBeVisible()
  await expect(
    page.getByText(/notas clínicas são criadas a partir das consultas/i),
  ).toBeVisible()

  // Tab "Documentos" — empty state + botão "Enviar documento"
  await page.getByRole('button', { name: /^Documentos/ }).click()
  await expect(page.getByText('Nenhum documento encontrado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar documento' })).toBeVisible()
})

// ─── CT-65-05: filtro por tipo de documento funciona no frontend ───────────────

test('CT-65-05: filtro por tipo de documento funciona no frontend', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar qualquer paciente ativo
  const patientsRes = await request.get(
    `${API_URL}/api/v1/doctor/patients?limit=5&status=active`,
    { headers },
  )
  const patientsData = (await patientsRes.json()) as { data: Array<{ id: string }> }
  const patientId = patientsData.data[0].id

  // Criar 2 documentos de tipos diferentes via API (upload + create)
  // Usar readFile diretamente em Node para multipart
  const { readFileSync } = await import('fs')
  const fileBuffer = readFileSync(FIXTURE_PDF)

  // Documento 1: prescrição
  const upload1 = await request.fetch(`${API_URL}/api/v1/doctor/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginData.accessToken}` },
    multipart: {
      file: { name: 'receita-ct65.pdf', mimeType: 'application/pdf', buffer: fileBuffer },
    },
  })
  expect(upload1.ok()).toBeTruthy()
  const { fileUrl: fileUrl1, fileName: fileName1 } = (await upload1.json()) as {
    fileUrl: string
    fileName: string
  }
  await request.post(`${API_URL}/api/v1/doctor/documents`, {
    headers,
    data: {
      patientId,
      type: 'prescription',
      fileUrl: fileUrl1,
      fileName: fileName1,
      description: 'Receita de amoxicilina CT65',
    },
  })

  // Documento 2: exame
  const upload2 = await request.fetch(`${API_URL}/api/v1/doctor/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginData.accessToken}` },
    multipart: {
      file: { name: 'exame-ct65.pdf', mimeType: 'application/pdf', buffer: fileBuffer },
    },
  })
  expect(upload2.ok()).toBeTruthy()
  const { fileUrl: fileUrl2, fileName: fileName2 } = (await upload2.json()) as {
    fileUrl: string
    fileName: string
  }
  await request.post(`${API_URL}/api/v1/doctor/documents`, {
    headers,
    data: {
      patientId,
      type: 'exam',
      fileUrl: fileUrl2,
      fileName: fileName2,
      description: 'Hemograma CT65',
    },
  })

  // Configurar auth no browser
  await setupBrowserAuth(page, loginData)

  // Navegar para perfil do paciente
  await page.goto(`${APP_URL}/doctor/patients/${patientId}`)
  await page.waitForLoadState('networkidle')

  // Clicar na tab "Documentos"
  await page.getByRole('button', { name: /^Documentos/ }).click()
  await page.waitForLoadState('networkidle')

  // Ambos os tipos devem estar visíveis inicialmente
  await expect(page.getByText('Receita').first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('Exame').first()).toBeVisible()

  // Clicar no Select de filtro (trigger mostra "Todos os tipos" quando vazio)
  await page.getByRole('button', { name: 'Todos os tipos' }).click()

  // Selecionar "Receita" no dropdown
  await page.getByRole('button', { name: 'Receita', exact: true }).click()

  // Apenas documentos do tipo "Receita" devem aparecer como tipo de documento
  // O trigger agora mostra o valor bruto "prescription"
  await expect(page.getByRole('button', { name: 'prescription' })).toBeVisible()

  // Verificar que o filtro foi aplicado: arquivo da receita visível, arquivo do exame não
  await expect(page.getByText('receita-ct65.pdf')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('exame-ct65.pdf')).not.toBeVisible()

  // Resetar filtro: clicar no trigger (mostra "prescription") e selecionar "Todos"
  await page.getByRole('button', { name: 'prescription' }).click()
  await page.getByRole('button', { name: 'Todos', exact: true }).click()

  // Após limpar o filtro, ambos os arquivos voltam a aparecer
  await expect(page.getByText('receita-ct65.pdf')).toBeVisible()
  await expect(page.getByText('exame-ct65.pdf')).toBeVisible()
})
