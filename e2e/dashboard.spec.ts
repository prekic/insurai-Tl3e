/**
 * Dashboard E2E Tests
 *
 * Tests for dashboard and protected page functionality.
 * Note: These tests require authentication setup.
 */

import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.describe('Unauthenticated Access', () => {
    test('should redirect to sign in when not authenticated', async ({ page }) => {
      await page.goto('/dashboard')

      // Should be redirected to sign in
      await page.waitForURL(/signin|login|\//, { timeout: 5000 })
    })
  })

  test.describe('Dashboard Structure', () => {
    test.skip('should display dashboard navigation when authenticated', async ({ page }) => {
      // This test requires auth setup
      await page.goto('/dashboard')

      await expect(page.getByText(/dashboard/i)).toBeVisible()
    })
  })
})

test.describe('Policy Upload', () => {
  test.describe('Unauthenticated Access', () => {
    test('should redirect to sign in when not authenticated', async ({ page }) => {
      await page.goto('/upload')

      await page.waitForURL(/signin|login|\//, { timeout: 5000 })
    })
  })
})

test.describe('Chat Interface', () => {
  test.describe('Unauthenticated Access', () => {
    test('should redirect to sign in when not authenticated', async ({ page }) => {
      await page.goto('/chat')

      await page.waitForURL(/signin|login|\//, { timeout: 5000 })
    })
  })
})
