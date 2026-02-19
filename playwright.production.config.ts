import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright Production E2E Configuration
 *
 * Runs the full E2E test suite against the live Railway production deployment.
 * No local webServer needed — tests hit the production URL directly.
 *
 * Usage:
 *   npx playwright test --config=playwright.production.config.ts
 *   npx playwright test --config=playwright.production.config.ts --project=chromium
 */

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://insurai-production.up.railway.app'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1, // Retry once for network flakiness against production
  workers: 2, // Limit parallelism to avoid rate limiting
  reporter: [['list'], ['html', { open: 'never' }]],

  // Generous timeouts for production (network latency)
  timeout: 60000, // 60s per test
  expect: {
    timeout: 15000, // 15s for assertions (production can be slower)
  },

  use: {
    baseURL: PRODUCTION_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Generous action timeouts for production
    actionTimeout: 20000, // 20s for clicks, fills
    navigationTimeout: 30000, // 30s for page navigation
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // No webServer — we're testing against live production
})
