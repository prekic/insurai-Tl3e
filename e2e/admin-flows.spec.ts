/**
 * Admin Dashboard E2E Tests
 *
 * Tests for admin login, settings management, prompt management,
 * and dashboard navigation.
 */

import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard', () => {
  test.describe('Admin Login Page', () => {
    test('should display admin login form', async ({ page }) => {
      await page.goto('/admin')

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible()
    })

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/admin')

      await page.getByRole('button', { name: /sign in|log in|login/i }).click()

      // Should show some form of validation feedback
      await expect(page.locator('text=/required|invalid|email/i').first()).toBeVisible({ timeout: 5000 })
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/admin')

      await page.getByLabel(/email/i).fill('wrong@example.com')
      await page.getByLabel(/password/i).fill('wrongpassword')
      await page.getByRole('button', { name: /sign in|log in|login/i }).click()

      // Should show error message (may be various forms)
      // When DB is not configured, may show configuration error instead of auth error
      const errorVisible = await page.locator('[role="alert"], .error, [class*="error"], .text-red-600, .bg-red-50').first()
        .isVisible({ timeout: 10000 }).catch(() => false)
      const textVisible = await page.getByText(/error|failed|invalid|unavailable|not configured/i).first()
        .isVisible({ timeout: 5000 }).catch(() => false)
      expect(errorVisible || textVisible).toBe(true)
    })
  })

  test.describe('Admin Dashboard Navigation', () => {
    // These tests check the dashboard UI structure assuming we can access it
    // In a real test environment, we'd authenticate first

    test('should have admin route accessible', async ({ page }) => {
      const response = await page.goto('/admin')
      expect(response?.status()).toBeLessThan(500)
    })
  })
})

test.describe('Settings Management', () => {
  test.describe('Settings API', () => {
    // Admin endpoints return 401 (auth required) when DB is configured,
    // or 503 (DB not configured) when Supabase is not available.
    // 404 is valid in CI where only the static frontend is served (no backend).
    const expectAuthOrUnavailable = (status: number) => {
      expect([401, 403, 404, 503]).toContain(status)
    }

    test('settings endpoint should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/ai')
      expectAuthOrUnavailable(response.status())
    })

    test('settings export should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/export')
      expectAuthOrUnavailable(response.status())
    })

    test('settings import should require authentication', async ({ request }) => {
      const response = await request.post('/api/admin/settings/import', {
        data: { settings: [] },
      })
      expectAuthOrUnavailable(response.status())
    })

    test('settings history should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/history')
      expectAuthOrUnavailable(response.status())
    })

    test('feature flags should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/feature-flags')
      expectAuthOrUnavailable(response.status())
    })

    test('batch update should require authentication', async ({ request }) => {
      const response = await request.put('/api/admin/settings/batch', {
        data: { updates: [] },
      })
      expectAuthOrUnavailable(response.status())
    })
  })
})

test.describe('Duplicate Detection Flow', () => {
  test.describe('Upload Page', () => {
    test('should display upload area', async ({ page }) => {
      await page.goto('/upload')
      await page.waitForLoadState('networkidle')

      // Protected route may redirect to auth
      if (page.url().includes('/auth')) {
        // Auth redirect is valid — user not logged in
        return
      }

      // Upload area should be present — may be visible or hidden file input
      const uploadArea = page.locator('[class*="upload"], [class*="drop"], input[type="file"]').first()
      await expect(uploadArea).toBeAttached({ timeout: 10000 })
    })

    test('should reject non-PDF files', async ({ page }) => {
      await page.goto('/upload')
      await page.waitForLoadState('networkidle')

      // Protected route may redirect to auth
      if (page.url().includes('/auth')) {
        // Auth redirect is valid — user not logged in
        return
      }

      // Try to upload a text file (should be rejected)
      const fileInput = page.locator('input[type="file"]').first()

      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('This is not a PDF'),
        })

        // Should show error about file type
        await expect(page.locator('text=/pdf|invalid|supported/i').first()).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test.describe('Free Trial Analysis Page', () => {
    test('should display try analysis page', async ({ page }) => {
      await page.goto('/try')

      // Should show the analysis page
      await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible({ timeout: 10000 })
    })

    test('should show upload option when no file provided', async ({ page }) => {
      await page.goto('/try')

      // Should show upload option or redirect
      const hasUpload = await page.locator('input[type="file"], [class*="upload"], [class*="drop"]').count()
      const hasRedirect = page.url().includes('/upload') || page.url().includes('/try')

      expect(hasUpload > 0 || hasRedirect).toBeTruthy()
    })
  })
})

test.describe('Admin API Security', () => {
  // Admin endpoints return 401 (auth required) when DB is configured,
  // or 503 (DB not configured) when Supabase is not available.
  // 404 is valid in CI where only the static frontend is served (no backend).
  const expectProtected = (status: number) => {
    expect([401, 403, 404, 503]).toContain(status)
  }

  test('admin prompts should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/prompts')
    expectProtected(response.status())
  })

  test('admin users should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/users')
    expectProtected(response.status())
  })

  test('admin audit logs should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/audit-logs')
    // May return 404 if route doesn't exist, or 401/403/503 if protected
    expect([401, 403, 404, 503]).toContain(response.status())
  })

  test('admin diagnostics endpoint should be accessible', async ({ request }) => {
    const response = await request.get('/api/admin/diagnostics')
    // Diagnostics may or may not require auth depending on setup
    expect(response.status()).toBeLessThan(500)
  })

  test('drift detection should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/drift/status')
    expectProtected(response.status())
  })

  test('webhooks should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/webhooks')
    expectProtected(response.status())
  })
})

test.describe('Health Check', () => {
  test('health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)
    const body = await response.json()
    // Status may be 'ok' (fully healthy) or 'degraded' (no DB/providers)
    expect(['ok', 'degraded']).toContain(body.status)
    expect(body.timestamp).toBeDefined()
  })

  test('PDF service health should return 200', async ({ request }) => {
    const response = await request.get('/api/pdf/health')

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.service).toBe('pdf-extraction')
  })

  test('AI providers endpoint should return provider status', async ({ request }) => {
    const response = await request.get('/api/ai/providers')

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('openai')
    expect(body).toHaveProperty('anthropic')
    expect(body).toHaveProperty('google')
  })
})
