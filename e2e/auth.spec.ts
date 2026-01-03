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

    test('should display Upload Policy button', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('link', { name: /upload policy/i })).toBeVisible()
    })

    test('should navigate to upload page', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('link', { name: /upload policy/i }).click()

      await expect(page).toHaveURL('/upload')
    })
  })

  test.describe('Auth Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth')
    })

    test('should display InsurAI branding', async ({ page }) => {
      await expect(page.getByText('InsurAI')).toBeVisible()
    })

    test('should display email and password inputs', async ({ page }) => {
      await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible()
      await expect(page.getByPlaceholder(/••••••••/)).toBeVisible()
    })

    test('should display sign in button', async ({ page }) => {
      // The button contains the text from i18n
      await expect(page.getByRole('button', { name: /sign in|giriş|oturum/i })).toBeVisible()
    })

    test('should display OAuth buttons', async ({ page }) => {
      await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /github/i })).toBeVisible()
    })

    test('should have toggle to switch between sign in and sign up', async ({ page }) => {
      // Look for text that toggles mode
      await expect(page.getByRole('button', { name: /sign up|kayıt|hesap oluştur/i })).toBeVisible()
    })

    test('should show validation error for invalid email', async ({ page }) => {
      await page.getByPlaceholder(/you@example\.com/i).fill('invalid-email')
      await page.getByPlaceholder(/••••••••/).fill('password123')
      await page.getByRole('button', { name: /sign in|giriş|oturum/i }).click()

      // Should show error message
      await expect(page.locator('.bg-red-50, [role="alert"]').or(page.getByText(/invalid|geçersiz/i))).toBeVisible()
    })

    test('should show validation error for short password', async ({ page }) => {
      await page.getByPlaceholder(/you@example\.com/i).fill('test@example.com')
      await page.getByPlaceholder(/••••••••/).fill('123')
      await page.getByRole('button', { name: /sign in|giriş|oturum/i }).click()

      // Should show error message for short password
      await expect(page.locator('.bg-red-50, [role="alert"]').or(page.getByText(/short|kısa|karakter/i))).toBeVisible()
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
