import { test, expect } from '@playwright/test'

test.describe('Agency Portal', () => {
  test('redireciona não autenticado para login', async ({ page }) => {
    await page.goto('http://localhost:5173/agency')
    await expect(page).toHaveURL(/\/agency\/login/)
  })

  test('login bem-sucedido vai para dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173/agency/login')
    await page.fill('input[name="email"]', 'admin@nocrato.com')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/agency/)
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('dashboard mostra cards de stats', async ({ page }) => {
    await page.goto('http://localhost:5173/agency/login')
    await page.fill('input[name="email"]', 'admin@nocrato.com')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/agency/)
    await expect(page.getByText(/Total de Doutores|Doutores|Pacientes/i).first()).toBeVisible()
  })

  test('navega para lista de doutores', async ({ page }) => {
    await page.goto('http://localhost:5173/agency/login')
    await page.fill('input[name="email"]', 'admin@nocrato.com')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.click('a[href="/agency/doctors"]')
    await expect(page).toHaveURL(/\/agency\/doctors/)
  })
})
