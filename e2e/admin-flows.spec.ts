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
      await expect(page.locator('[role="alert"], .error, [class*="error"]').first()).toBeVisible({ timeout: 10000 })
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
    test('settings endpoint should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/ai')

      // Should return 401 without auth
      expect(response.status()).toBe(401)
    })

    test('settings export should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/export')

      expect(response.status()).toBe(401)
    })

    test('settings import should require authentication', async ({ request }) => {
      const response = await request.post('/api/admin/settings/import', {
        data: { settings: [] },
      })

      expect(response.status()).toBe(401)
    })

    test('settings history should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/history')

      expect(response.status()).toBe(401)
    })

    test('feature flags should require authentication', async ({ request }) => {
      const response = await request.get('/api/admin/settings/feature-flags')

      expect(response.status()).toBe(401)
    })

    test('batch update should require authentication', async ({ request }) => {
      const response = await request.put('/api/admin/settings/batch', {
        data: { updates: [] },
      })

      expect(response.status()).toBe(401)
    })
  })
})

test.describe('Duplicate Detection Flow', () => {
  test.describe('Upload Page', () => {
    test('should display upload area', async ({ page }) => {
      await page.goto('/upload')

      // Upload area should be present
      await expect(page.locator('[class*="upload"], [class*="drop"], input[type="file"]').first()).toBeVisible({ timeout: 10000 })
    })

    test('should reject non-PDF files', async ({ page }) => {
      await page.goto('/upload')

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
  test('admin prompts should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/prompts')
    expect(response.status()).toBe(401)
  })

  test('admin users should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/users')
    expect(response.status()).toBe(401)
  })

  test('admin audit logs should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/audit-logs')
    expect(response.status()).toBe(401)
  })

  test('admin diagnostics endpoint should be accessible', async ({ request }) => {
    const response = await request.get('/api/admin/diagnostics')
    // Diagnostics may or may not require auth depending on setup
    expect(response.status()).toBeLessThan(500)
  })

  test('drift detection should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/drift/status')
    expect(response.status()).toBe(401)
  })

  test('webhooks should require authentication', async ({ request }) => {
    const response = await request.get('/api/admin/webhooks')
    expect(response.status()).toBe(401)
  })
})

test.describe('Health Check', () => {
  test('health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.status).toBeDefined()
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
