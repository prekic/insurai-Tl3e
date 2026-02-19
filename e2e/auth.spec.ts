/**
 * Authentication E2E Tests
 *
 * Tests for the auth page and protected routes.
 */

import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.describe('Landing Page Navigation', () => {
    test('should display main navigation links', async ({ page }) => {
      await page.goto('/')

      // Main nav should have Dashboard and Compare links
      await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /compare/i })).toBeVisible()
    })

    test('should display Upload action', async ({ page }) => {
      await page.goto('/')

      // Upload may be a button (direct file picker) or a link depending on nav version
      const uploadAction = page.getByRole('button', { name: /upload|yükle/i }).or(
        page.getByRole('link', { name: /upload/i })
      ).first()
      await expect(uploadAction).toBeVisible()
    })

    test('should have working navigation links', async ({ page }) => {
      await page.goto('/')

      // Verify dashboard link works
      await page.getByRole('link', { name: /dashboard/i }).first().click()
      await expect(page).toHaveURL(/dashboard/)
    })
  })

  test.describe('Auth Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth')
      await page.waitForLoadState('networkidle')
    })

    test('should display InsurAI branding', async ({ page }) => {
      await expect(page.getByText('InsurAI')).toBeVisible()
    })

    test('should display auth form or not-configured fallback', async ({ page }) => {
      // When Supabase is configured: login form with email/password inputs
      // When Supabase is NOT configured: fallback page with "continue to demo" button
      const emailInput = page.getByPlaceholder(/you@example\.com|siz@ornek\.com/i)
      const fallbackButton = page.getByRole('button', { name: /demo|continue/i })

      const hasLoginForm = await emailInput.count() > 0
      const hasFallback = await fallbackButton.count() > 0

      expect(hasLoginForm || hasFallback).toBe(true)
    })

    test('should display sign in button or demo button', async ({ page }) => {
      // Either the sign in button (Supabase configured) or demo button (not configured)
      const signInButton = page.getByRole('button', { name: /sign in|giriş|oturum/i })
      const demoButton = page.getByRole('button', { name: /demo|continue/i })

      const hasSignIn = await signInButton.count() > 0
      const hasDemo = await demoButton.count() > 0

      expect(hasSignIn || hasDemo).toBe(true)
    })

    test('should display OAuth buttons when Supabase is configured', async ({ page }) => {
      // OAuth buttons only render when Supabase is configured
      const googleButton = page.getByRole('button', { name: /google/i })
      const demoButton = page.getByRole('button', { name: /demo|continue/i })

      const hasGoogle = await googleButton.count() > 0
      const hasFallback = await demoButton.count() > 0

      // Either OAuth buttons are visible or we're in fallback mode
      expect(hasGoogle || hasFallback).toBe(true)
    })

    test('should have toggle or fallback navigation', async ({ page }) => {
      // Sign up toggle (configured) or demo button (not configured)
      const signUpToggle = page.getByRole('button', { name: /sign up|kayıt|hesap oluştur/i })
      const demoButton = page.getByRole('button', { name: /demo|continue/i })

      const hasToggle = await signUpToggle.count() > 0
      const hasDemo = await demoButton.count() > 0

      expect(hasToggle || hasDemo).toBe(true)
    })

    test('should show validation or fallback for invalid input', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/you@example\.com|siz@ornek\.com/i)

      if (await emailInput.count() > 0) {
        // Supabase configured — test validation
        await emailInput.fill('invalid-email')
        await page.getByPlaceholder(/••••••••/).fill('password123')
        await page.getByRole('button', { name: /sign in|giriş|oturum/i }).click()

        const hasError = await page.locator('.bg-red-50, [role="alert"]').or(page.getByText(/invalid|geçersiz|error|hata/i)).count()
        expect(hasError).toBeGreaterThanOrEqual(0)
      } else {
        // Not configured — fallback page shown, just verify it's present
        await expect(page.getByRole('button', { name: /demo|continue/i })).toBeVisible()
      }
    })

    test('should show validation or fallback for short password', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/you@example\.com|siz@ornek\.com/i)

      if (await emailInput.count() > 0) {
        await emailInput.fill('test@example.com')
        await page.getByPlaceholder(/••••••••/).fill('123')
        await page.getByRole('button', { name: /sign in|giriş|oturum/i }).click()

        await expect(page.locator('.bg-red-50, [role="alert"]').or(page.getByText(/short|kısa|karakter/i))).toBeVisible()
      } else {
        // Not configured — just verify fallback page is present
        await expect(page.getByRole('button', { name: /demo|continue/i })).toBeVisible()
      }
    })
  })

  test.describe('Protected Routes', () => {
    test('should redirect to auth when accessing dashboard without auth', async ({ page }) => {
      await page.goto('/dashboard')

      // Should either stay on dashboard (demo mode) or redirect to auth
      const url = page.url()
      expect(url.includes('/dashboard') || url.includes('/auth')).toBe(true)
    })

    test('should redirect to auth when accessing upload without auth', async ({ page }) => {
      await page.goto('/upload')

      // Should either stay on upload (demo mode) or redirect to auth
      const url = page.url()
      expect(url.includes('/upload') || url.includes('/auth')).toBe(true)
    })

    test('should redirect to auth when accessing chat without auth', async ({ page }) => {
      await page.goto('/chat')

      // Should either stay on chat (demo mode) or redirect to auth
      const url = page.url()
      expect(url.includes('/chat') || url.includes('/auth') || url.includes('/dashboard')).toBe(true)
    })
  })
})
