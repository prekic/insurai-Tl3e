/**
 * Navigation E2E Tests
 *
 * Tests for page navigation and layout.
 */

import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test.describe('Landing Page', () => {
    test('should load the landing page', async ({ page }) => {
      await page.goto('/')

      await expect(page).toHaveTitle(/insurai/i)
    })

    test('should display the InsurAI logo and branding', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByText('InsurAI').first()).toBeVisible()
    })

    test('should display hero section with headline', async ({ page }) => {
      await page.goto('/')

      // Check for the main headline
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('should have accessible navigation', async ({ page }) => {
      await page.goto('/')

      const nav = page.getByRole('navigation')
      await expect(nav).toBeVisible()
    })

    test('should display key navigation links', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /upload policy/i })).toBeVisible()
    })
  })

  test.describe('Responsive Design', () => {
    test('should display navigation on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/')

      // Mobile menu button should be visible
      const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first()
      await expect(menuButton).toBeVisible()
    })

    test('should toggle mobile menu', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/')

      // Find and click the mobile menu button (hamburger icon)
      const menuButton = page.locator('nav button').first()
      await menuButton.click()

      // Mobile menu items should appear
      await expect(page.getByText('Dashboard')).toBeVisible()
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('/')

      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()
    })
  })

  test.describe('Performance', () => {
    test('should load within acceptable time', async ({ page }) => {
      const startTime = Date.now()

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      const loadTime = Date.now() - startTime
      expect(loadTime).toBeLessThan(5000)
    })
  })

  test.describe('Page Routing', () => {
    test('should navigate to dashboard', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('link', { name: /dashboard/i }).first().click()

      await expect(page).toHaveURL(/dashboard/)
    })

    test('should navigate to upload page', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('link', { name: /upload policy/i }).click()

      await expect(page).toHaveURL(/upload/)
    })
  })
})
