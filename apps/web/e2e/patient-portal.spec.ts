import { test, expect } from '@playwright/test'

// Código de acesso definido em setup-test-data.ts (PORTAL_ACCESS_CODE)
const PORTAL_ACCESS_CODE = 'MRO-5678-PAC'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function accessPortal(page: Parameters<typeof test>[1] extends (page: infer P) => unknown ? P : never) {
  await page.goto('/patient/access')
  await page.getByLabel('Código de acesso').fill(PORTAL_ACCESS_CODE)
  await page.getByRole('button', { name: 'Acessar Portal' }).click()
  await page.waitForURL('/patient/portal')
}

// ─── Testes ───────────────────────────────────────────────────────────────────

test.describe('CT-103 — Portal do Paciente (US-10.3)', () => {

  // ── CT-103-01 ────────────────────────────────────────────────────────────────
  test('CT-103-01 — Happy path: digita código válido e acessa portal', async ({ page }) => {
    await page.goto('/patient/access')

    await expect(page.getByRole('heading', { name: 'Portal do Paciente' })).toBeVisible()
    await expect(page.getByLabel('Código de acesso')).toBeVisible()

    await page.getByLabel('Código de acesso').fill(PORTAL_ACCESS_CODE)
    await page.getByRole('button', { name: 'Acessar Portal' }).click()

    await page.waitForURL('/patient/portal')

    // Verifica nome do paciente no portal
    await expect(page.getByText('Maria Oliveira')).toBeVisible()

    // Verifica seção de consultas
    await expect(page.getByRole('heading', { name: /Consultas/i })).toBeVisible()

    // Verifica seção de documentos
    await expect(page.getByRole('heading', { name: /Documentos/i })).toBeVisible()
  })

  // ── CT-103-02 ────────────────────────────────────────────────────────────────
  test('CT-103-02 — Código inválido exibe mensagem de erro na tela', async ({ page }) => {
    await page.goto('/patient/access')

    await page.getByLabel('Código de acesso').fill('ZZZ-0000-ZZZ')
    await page.getByRole('button', { name: 'Acessar Portal' }).click()

    // Deve permanecer na página de acesso (sem redirecionar)
    await expect(page).toHaveURL('/patient/access')

    // Mensagem de erro visível
    await expect(page.locator('[class*="red"]').first()).toBeVisible()
  })

  // ── CT-103-03 ────────────────────────────────────────────────────────────────
  test('CT-103-03 — Portal exibe dados pessoais em modo read-only', async ({ page }) => {
    await accessPortal(page)

    // Seção "Seus Dados" visível
    await expect(page.getByRole('heading', { name: /Seus Dados/i })).toBeVisible()

    // Campos de dados visíveis
    await expect(page.getByText('Nome')).toBeVisible()
    await expect(page.getByText('Maria Oliveira')).toBeVisible()
    await expect(page.getByText('Telefone')).toBeVisible()

    // Nenhum input editável ou botão de editar
    const inputs = page.locator('input:not([type="hidden"])')
    await expect(inputs).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Editar/i })).toHaveCount(0)
  })

  // ── CT-103-04 ────────────────────────────────────────────────────────────────
  test('CT-103-04 — Consultas exibidas (futura primeiro)', async ({ page }) => {
    await accessPortal(page)

    // Pelo menos 2 consultas visíveis
    const appointmentCards = page.locator('section').filter({ hasText: /Consultas/i }).locator('.rounded-xl')
    await expect(appointmentCards).toHaveCount(2)

    // Primeira consulta deve ter badge "Agendada" (futura)
    const firstCard = appointmentCards.first()
    await expect(firstCard.getByText('Agendada')).toBeVisible()

    // Última consulta deve ter badge "Concluída"
    const lastCard = appointmentCards.last()
    await expect(lastCard.getByText('Concluída')).toBeVisible()
  })

  // ── CT-103-05 ────────────────────────────────────────────────────────────────
  test('CT-103-05 — Botão de download de documento funciona', async ({ page }) => {
    await accessPortal(page)

    // Documento visível
    const docSection = page.locator('section').filter({ hasText: /Documentos/i })
    await expect(docSection.getByText('receita_2024.pdf')).toBeVisible()

    // Interceptar window.open para verificar URL do download
    await page.evaluate(() => {
      window.__downloadUrl = ''
      const origOpen = window.open.bind(window)
      window.open = (url?: string | URL, ...args: unknown[]) => {
        window.__downloadUrl = String(url ?? '')
        return origOpen(url as string, ...(args as [string, string]))
      }
    })

    await docSection.getByRole('button', { name: 'Download' }).click()

    const downloadUrl = await page.evaluate<string>(() => window.__downloadUrl)
    expect(downloadUrl).toContain('/api/v1/patient/portal/documents/')
    expect(downloadUrl).toContain(`code=${encodeURIComponent(PORTAL_ACCESS_CODE)}`)
  })

  // ── CT-103-06 ────────────────────────────────────────────────────────────────
  test('CT-103-06 — Portal aplica cor primária do tenant no branding', async ({ page }) => {
    await accessPortal(page)

    // O avatar colorido no header usa a primary_color do tenant (#D97706)
    // O elemento é um div com style backgroundColor quando não há logo_url
    const coloredAvatar = page.locator('[style*="background-color: rgb(217, 119, 6)"], [style*="background-color:#D97706"], [style*="backgroundColor: rgb(217, 119, 6)"]')

    // Fallback: verificar via JS o valor real do style
    const avatarBg = await page.evaluate(() => {
      const header = document.querySelector('header')
      if (!header) return ''
      const colored = header.querySelector<HTMLElement>('[style]')
      return colored ? colored.style.backgroundColor : ''
    })

    // rgb(217, 119, 6) é o equivalente de #D97706
    expect(avatarBg).toBe('rgb(217, 119, 6)')
  })

})
