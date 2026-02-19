/**
 * Dashboard E2E Tests
 *
 * Tests for dashboard and main application pages.
 */

import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('should load dashboard page', async ({ page }) => {
    await page.goto('/dashboard')

    // Should load and show dashboard content or redirect to auth
    await page.waitForLoadState('networkidle')
    const url = page.url()
    expect(url.includes('/dashboard') || url.includes('/auth')).toBe(true)
  })

  test('should display navigation when on dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // If we're on dashboard (demo mode), check for nav
    if (page.url().includes('/dashboard')) {
      const nav = page.getByRole('navigation')
      await expect(nav).toBeVisible()
    }
  })
})

test.describe('Upload Page', () => {
  test('should load upload page', async ({ page }) => {
    await page.goto('/upload')

    await page.waitForLoadState('networkidle')
    const url = page.url()
    expect(url.includes('/upload') || url.includes('/auth')).toBe(true)
  })

  test('should display upload interface when on page', async ({ page }) => {
    await page.goto('/upload')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/upload')) {
      // Look for upload-related text
      await expect(page.getByText(/upload|compare|policy/i).first()).toBeVisible()
    }
  })
})

test.describe('Settings Page', () => {
  test('should load settings page', async ({ page }) => {
    await page.goto('/settings')

    await page.waitForLoadState('networkidle')
    // Settings should be accessible or redirect to auth
    const url = page.url()
    expect(url.includes('/settings') || url.includes('/auth')).toBe(true)
  })
})

test.describe('Chat Page', () => {
  test('should load chat page', async ({ page }) => {
    await page.goto('/chat')

    await page.waitForLoadState('networkidle')
    const url = page.url()
    // Chat may redirect if no policies
    expect(
      url.includes('/chat') || url.includes('/auth') || url.includes('/dashboard')
    ).toBe(true)
  })
})

test.describe('Samples Page', () => {
  test('should load samples page', async ({ page }) => {
    await page.goto('/samples')

    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/samples')
  })

  test('should display sample policies', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    // Should have some content about samples
    await expect(page.getByText(/sample|policy|insurance/i).first()).toBeVisible()
  })
})
