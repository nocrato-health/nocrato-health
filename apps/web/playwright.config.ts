import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    // TD-29: bypass do ThrottlerGuard quando a API roda em NODE_ENV=test.
    // Match com E2E_THROTTLE_BYPASS_SECRET no .env da API.
    extraHTTPHeaders: {
      'x-e2e-bypass': process.env.E2E_THROTTLE_BYPASS_SECRET ?? 'local-e2e-bypass-secret-dev',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 12'], browserName: 'chromium' },
      testMatch: '**/booking.spec.ts',
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
