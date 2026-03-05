/**
 * CT-75-xx — Página pública de agendamento (US-7.5)
 *
 * Pré-requisitos:
 *   - Docker postgres + NestJS (:3000) + Vite (:5173) em execução
 *   - Dados seed criados pelo globalSetup (setup-test-data.ts)
 *
 * Tokens usados (inseridos pelo seed, 64 chars hex cada):
 *   - VALID_TOKEN    → CT-75-01 happy path (consumido após o teste)
 *   - EXPIRED_TOKEN  → CT-75-03 expirado
 *   - PHONE_TOKEN    → CT-75-04 phone='+5511987654321' (não consumido)
 *   - CONFLICT_TOKEN → CT-75-05 race condition (POST mockado, não consumido)
 */
import { test, expect } from '@playwright/test'

const SLUG = 'test-done-doctor'
const VALID_TOKEN    = 'abcdef01'.repeat(8)
const EXPIRED_TOKEN  = 'dead0000'.repeat(8)
const PHONE_TOKEN    = 'cafe1234'.repeat(8)
const CONFLICT_TOKEN = 'beef5678'.repeat(8)

/** Retorna a próxima segunda-feira como "YYYY-MM-DD" (nunca hoje). */
function getNextMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7
  d.setDate(d.getDate() + daysUntilMonday)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

test.describe('CT-75 — Página pública de agendamento', () => {

  // ---------------------------------------------------------------------------
  // CT-75-01 — Happy path
  // ---------------------------------------------------------------------------
  test('CT-75-01 — Happy path: booking completo no browser', async ({ page }) => {
    await page.goto(`/book/${SLUG}?token=${VALID_TOKEN}`)

    // Aguarda clinic header (validação OK)
    await expect(page.getByText('Dra. Teste Concluída')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Portal Teste (Completo)')).toBeVisible()

    // Step 1: selecionar próxima segunda-feira (doctor tem working_hours.monday)
    await page.locator('#date-input').fill(getNextMonday())
    await page.getByRole('button', { name: 'Ver horários disponíveis' }).click()

    // Step 2: aguardar grid de slots e selecionar 08:00
    await expect(page.getByText('Selecione um horário')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: '08:00' }).first().click()

    // Step 3: preencher formulário
    await expect(page.getByRole('heading', { name: 'Confirmar agendamento' })).toBeVisible()
    await page.locator('#confirm-name').fill('Carlos Pereira')
    await page.locator('#confirm-phone').fill('(11) 91234-5678')
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click()

    // Step 4: tela de sucesso
    await expect(page.getByText('Consulta agendada!')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Você receberá confirmação no WhatsApp.')).toBeVisible()
    await expect(page.getByText('Dra. Teste Concluída')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // CT-75-02 — Token ausente
  // ---------------------------------------------------------------------------
  test('CT-75-02 — Token ausente exibe tela de erro', async ({ page }) => {
    await page.goto(`/book/${SLUG}`)

    await expect(page.getByRole('heading', { name: 'Link não disponível' })).toBeVisible()
    await expect(page.getByText('Link inválido.')).toBeVisible()
    await expect(page.locator('#date-input')).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // CT-75-03 — Token expirado
  // ---------------------------------------------------------------------------
  test('CT-75-03 — Token expirado exibe mensagem adequada', async ({ page }) => {
    await page.goto(`/book/${SLUG}?token=${EXPIRED_TOKEN}`)

    await expect(
      page.getByRole('heading', { name: 'Link não disponível' }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('Este link expirou. Solicite um novo link pelo WhatsApp.'),
    ).toBeVisible()
    await expect(page.locator('#date-input')).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // CT-75-04 — Telefone pré-preenchido
  // ---------------------------------------------------------------------------
  test('CT-75-04 — Telefone pré-preenchido quando token tem phone vinculado', async ({ page }) => {
    await page.goto(`/book/${SLUG}?token=${PHONE_TOKEN}`)

    await expect(page.getByText('Dra. Teste Concluída')).toBeVisible({ timeout: 10000 })

    // Step 1 → Step 2
    await page.locator('#date-input').fill(getNextMonday())
    await page.getByRole('button', { name: 'Ver horários disponíveis' }).click()

    await expect(page.getByText('Selecione um horário')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: '08:30' }).first().click()

    // Step 3: verificar campo telefone pré-preenchido e readonly
    const phoneInput = page.locator('#confirm-phone')
    await expect(phoneInput).toBeVisible()
    await expect(phoneInput).toHaveValue('+5511987654321')
    await expect(phoneInput).not.toBeEditable()
    await expect(page.getByText('Telefone confirmado pelo WhatsApp.')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // CT-75-05 — Race condition (409 SLOT_CONFLICT)
  // ---------------------------------------------------------------------------
  test('CT-75-05 — Race condition (409) retorna ao seletor de slots', async ({ page }) => {
    await page.goto(`/book/${SLUG}?token=${CONFLICT_TOKEN}`)

    await expect(page.getByText('Dra. Teste Concluída')).toBeVisible({ timeout: 10000 })

    // Step 1 → Step 2
    await page.locator('#date-input').fill(getNextMonday())
    await page.getByRole('button', { name: 'Ver horários disponíveis' }).click()

    await expect(page.getByText('Selecione um horário')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: '08:30' }).first().click()

    // Registrar mock ANTES de clicar confirmar
    await page.route(
      'http://localhost:3000/api/v1/public/booking/*/book',
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'SLOT_CONFLICT', message: 'Horário não disponível' }),
          })
        } else {
          await route.continue()
        }
      },
    )

    // Step 3: preencher e confirmar (POST será interceptado → 409)
    await page.locator('#confirm-name').fill('Carlos Pereira')
    await page.locator('#confirm-phone').fill('(11) 91234-5678')
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click()

    // onConflict() → setStep(2) → slot picker visível novamente
    await expect(page.getByText('Selecione um horário')).toBeVisible({ timeout: 5000 })
  })
})
