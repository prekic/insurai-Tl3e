import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 *
 * Run with: npx playwright test
 * Run UI mode: npx playwright test --ui
 * Run fast (Chromium only): npx playwright test --project=chromium
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  // Global timeout settings for faster execution
  timeout: 30000, // 30s per test (down from default 60s)
  expect: {
    timeout: 5000, // 5s for assertions
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Faster action timeouts
    actionTimeout: 10000, // 10s for clicks, fills, etc.
    navigationTimeout: 15000, // 15s for page navigation
  },

  projects: [
    // Primary browser - fastest, run first
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    // Firefox - slower, run last (skip in CI with --project=chromium)
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
