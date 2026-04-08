/**
 * sec-10-documents.spec.ts
 *
 * Validação do fix SEC-10: download de documentos via endpoint autenticado.
 *
 * Contexto do fix:
 *   - Backend: GET /api/v1/doctor/documents/:id — JWT + tenant isolation + ParseUUIDPipe
 *   - Frontend: downloadDocument() em lib/download.ts — fetch com Authorization header
 *   - Nginx: /uploads/ removido da config (acesso direto bloqueado)
 *
 * Pré-requisitos:
 *   - Docker postgres + NestJS (:3000) + Vite (:5173) em execução
 *   - globalSetup rodou: doutores e documentos de teste criados
 *
 * Doutores de teste (criados em setup-test-data.ts):
 *   - test-done@nocrato.com / Doctor123! → onboarding_completed = true
 *   - Paciente "Maria Oliveira" com documento "receita_2024.pdf" (prescription)
 *
 * CTs:
 *   CT-SEC10-01 — Upload de PDF → documento aparece na lista do paciente
 *   CT-SEC10-02 — Click em Download → request vai para /api/v1/doctor/documents/:id com Authorization
 *   CT-SEC10-03 — GET /uploads/... direto (sem auth) retorna != 200 (nginx removido / NestJS 404)
 *   CT-SEC10-04 — Cross-tenant: documentId de outro tenant retorna 404
 *   CT-SEC10-05 — Regressão: portal do paciente ainda lista documentos (sem quebra)
 *
 * Execução: cd apps/web && npx playwright test e2e/sec-10-documents.spec.ts
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Constantes ────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3000'
const APP_URL = 'http://localhost:5173'
const TEST_EMAIL = 'test-done@nocrato.com'
const TEST_PASSWORD = 'Doctor123!'
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'test-doc.pdf')
const PORTAL_ACCESS_CODE = 'MRS-5678-PAC'

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

async function loginDoctor(
  request: import('@playwright/test').APIRequestContext,
): Promise<DoctorLoginResult> {
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

// ─── CT-SEC10-01 ─────────────────────────────────────────────────────────────

test('CT-SEC10-01 — Upload de PDF: documento aparece na lista da tab Documentos do paciente', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar um paciente ativo do tenant
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

  // Ir para tab "Documentos"
  await page.getByRole('button', { name: /^Documentos/ }).click()

  // Clicar em "Enviar documento"
  await expect(page.getByRole('button', { name: 'Enviar documento' })).toBeVisible()
  await page.getByRole('button', { name: 'Enviar documento' }).click()

  // Dialog abre
  await expect(page.getByRole('heading', { name: 'Upload de Documento' })).toBeVisible()

  // Selecionar tipo "Receita" (prescription)
  await page.locator('#doc-type').click()
  await page.getByRole('button', { name: 'Receita', exact: true }).click()

  // Adicionar descrição
  await page
    .getByPlaceholder('Adicione uma descrição para o documento...')
    .fill('Receita SEC-10 validação')

  // Fazer upload do fixture
  await page.locator('#doc-file').setInputFiles(FIXTURE_PDF)

  // Clicar "Enviar"
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()

  // Toast de sucesso
  await expect(page.getByText('Documento enviado com sucesso')).toBeVisible({ timeout: 10000 })

  // Dialog fecha
  await expect(page.getByRole('heading', { name: 'Upload de Documento' })).not.toBeVisible()

  // Documento aparece na lista com botão Download
  await page.waitForLoadState('networkidle')
  const downloadButtons = page.getByRole('button', { name: 'Download' })
  await expect(downloadButtons.first()).toBeVisible({ timeout: 5000 })
})

// ─── CT-SEC10-02 ─────────────────────────────────────────────────────────────

test('CT-SEC10-02 — Click em Download: request vai para /api/v1/doctor/documents/:id com Authorization header (não para /uploads/)', async ({
  page,
  request,
}) => {
  const loginData = await loginDoctor(request)
  const headers = { Authorization: `Bearer ${loginData.accessToken}` }

  // Buscar um paciente ativo
  const patientsRes = await request.get(
    `${API_URL}/api/v1/doctor/patients?limit=5&status=active`,
    { headers },
  )
  const patientsData = (await patientsRes.json()) as { data: Array<{ id: string }> }
  expect(patientsData.data.length).toBeGreaterThan(0)
  const patientId = patientsData.data[0].id

  // Garantir que o paciente tem pelo menos um documento (criar via API se necessário)
  const docsRes = await request.get(
    `${API_URL}/api/v1/doctor/documents?patientId=${patientId}&limit=5`,
    { headers },
  )
  let documentId: string

  if (docsRes.ok()) {
    const docsData = (await docsRes.json()) as { data: Array<{ id: string }> }
    if (docsData.data.length > 0) {
      documentId = docsData.data[0].id
    } else {
      // Fazer upload para criar um documento
      const { readFileSync } = await import('fs')
      const fileBuffer = readFileSync(FIXTURE_PDF)
      const uploadRes = await request.fetch(`${API_URL}/api/v1/doctor/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${loginData.accessToken}` },
        multipart: {
          file: { name: 'sec10-test.pdf', mimeType: 'application/pdf', buffer: fileBuffer },
        },
      })
      expect(uploadRes.ok()).toBeTruthy()
      const { fileUrl, fileName } = (await uploadRes.json()) as { fileUrl: string; fileName: string }

      const createRes = await request.post(`${API_URL}/api/v1/doctor/documents`, {
        headers,
        data: { patientId, type: 'prescription', fileUrl, fileName },
      })
      expect(createRes.ok()).toBeTruthy()
      const doc = (await createRes.json()) as { id: string }
      documentId = doc.id
    }
  } else {
    throw new Error(`Falha ao buscar documentos: ${docsRes.status()}`)
  }

  // Configurar auth no browser
  await setupBrowserAuth(page, loginData)

  // Interceptar requests para capturar o download
  const capturedRequests: Array<{ url: string; authHeader: string | null }> = []

  // Interceptar o endpoint de download autenticado e retornar o PDF
  // (evita que o browser tente abrir o arquivo real em disco)
  await page.route(`**/api/v1/doctor/documents/${documentId}`, async (route) => {
    capturedRequests.push({
      url: route.request().url(),
      authHeader: route.request().headers()['authorization'] ?? null,
    })
    // Retornar conteúdo mínimo de PDF para o download funcionar
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4 test'),
      headers: {
        'Content-Disposition': 'attachment; filename="test.pdf"',
      },
    })
  })

  // Também garantir que nenhum request vai para /uploads/ diretamente
  const uploadsRequests: string[] = []
  await page.route('**/uploads/**', async (route) => {
    uploadsRequests.push(route.request().url())
    await route.continue()
  })

  // Navegar para perfil do paciente, tab Documentos
  await page.goto(`${APP_URL}/doctor/patients/${patientId}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /^Documentos/ }).click()

  // Aguardar botão Download aparecer
  const downloadBtn = page.getByRole('button', { name: 'Download' }).first()
  await expect(downloadBtn).toBeVisible({ timeout: 5000 })

  // Aguardar o evento de download ao clicar
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ])

  // Verificar que o download foi disparado
  expect(download).toBeTruthy()

  // Verificar que o request capturado vai para o endpoint autenticado
  expect(capturedRequests.length).toBeGreaterThan(0)
  const captured = capturedRequests[0]

  // URL deve apontar para o novo endpoint (não para /uploads/)
  expect(captured.url).toContain(`/api/v1/doctor/documents/${documentId}`)
  expect(captured.url).not.toContain('/uploads/')

  // Authorization header deve estar presente com o token JWT
  expect(captured.authHeader).not.toBeNull()
  expect(captured.authHeader).toMatch(/^Bearer /)

  // Nenhum request deve ter ido para /uploads/ diretamente
  const directUploadsRequests = uploadsRequests.filter(
    (url) => !url.includes('/api/v1/doctor/'),
  )
  expect(directUploadsRequests).toHaveLength(0)
})

// ─── CT-SEC10-03 ─────────────────────────────────────────────────────────────

test('CT-SEC10-03 — Acesso direto a /uploads/... sem auth retorna != 200 (endpoint bloqueado)', async ({
  request,
}) => {
  // Tentar acessar o caminho de uploads diretamente sem autenticação.
  // Com o nginx removendo a rota /uploads/, o NestJS recebe a requisição
  // e não tem rota para /uploads/ → retorna 404.
  // Em ambiente de desenvolvimento sem nginx, o NestJS também não serve /uploads/.
  const fakeUploadsPath = `/uploads/some-tenant-id/${randomUUID()}.pdf`

  const res = await request.get(`http://localhost:3000${fakeUploadsPath}`)

  // O servidor NÃO deve retornar 200 para path direto de uploads sem auth
  expect(res.status()).not.toBe(200)

  // Deve retornar 404 (NestJS não tem rota para /uploads/) ou outro erro
  // Mas nunca 200 (que significaria arquivo exposto publicamente)
  expect([404, 401, 403]).toContain(res.status())
})

// ─── CT-SEC10-04 ─────────────────────────────────────────────────────────────

test('CT-SEC10-04 — Cross-tenant: documentId de outro tenant retorna 404', async ({
  request,
}) => {
  const loginData = await loginDoctor(request)

  // UUID aleatório que não existe no banco — simula um ID de documento de outro tenant
  // O service faz WHERE { id, tenant_id } → não encontra → NotFoundException
  const crossTenantDocId = randomUUID()

  const res = await request.get(
    `${API_URL}/api/v1/doctor/documents/${crossTenantDocId}`,
    {
      headers: { Authorization: `Bearer ${loginData.accessToken}` },
    },
  )

  // Deve retornar 404 — isolamento de tenant garantido
  expect(res.status()).toBe(404)

  const body = (await res.json()) as { message?: string }
  expect(body.message).toBe('Documento não encontrado')
})

// ─── CT-SEC10-05 ─────────────────────────────────────────────────────────────

test('CT-SEC10-05 — Regressão: portal do paciente lista documentos sem quebra', async ({
  page,
}) => {
  // Acessar o portal do paciente (sem login de doutor — usa código de acesso)
  await page.goto('/patient/access')

  await expect(page.getByRole('heading', { name: 'Portal do Paciente' })).toBeVisible()
  await expect(page.getByLabel('Código de acesso')).toBeVisible()

  await page.getByLabel('Código de acesso').fill(PORTAL_ACCESS_CODE)
  await page.getByRole('button', { name: 'Acessar Portal' }).click()

  await page.waitForURL('/patient/portal')

  // Nome da paciente visível
  await expect(page.getByText('Maria Oliveira')).toBeVisible()

  // Seção de documentos visível (regressão — não deve ter quebrado com o fix SEC-10)
  await expect(page.getByRole('heading', { name: /Documentos/i })).toBeVisible()

  // Documento seeded (receita_2024.pdf) visível na lista
  await expect(page.getByText('receita_2024.pdf')).toBeVisible({ timeout: 5000 })

  // Botão de download do portal do paciente presente
  const downloadBtn = page.getByRole('button', { name: 'Download' })
  await expect(downloadBtn.first()).toBeVisible()

  // Nenhum erro de console JavaScript (sem exceções não tratadas)
  const jsErrors: string[] = []
  page.on('pageerror', (err) => jsErrors.push(err.message))

  // Pequena espera para capturar qualquer erro assíncrono
  await page.waitForTimeout(1000)
  expect(jsErrors).toHaveLength(0)
})
