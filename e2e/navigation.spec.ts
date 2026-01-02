/**
 * Navigation E2E Tests
 *
 * Tests for page navigation and routing.
 */

import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test.describe('Landing Page', () => {
    test('should load the landing page', async ({ page }) => {
      await page.goto('/')

      await expect(page).toHaveTitle(/insurai/i)
    })

    test('should display the logo and branding', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByText(/insurai/i).first()).toBeVisible()
    })

    test('should display hero section', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('should have accessible navigation', async ({ page }) => {
      await page.goto('/')

      const nav = page.getByRole('navigation')
      await expect(nav).toBeVisible()
    })
  })

  test.describe('Responsive Design', () => {
    test('should display mobile navigation on small screens', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/')

      const nav = page.getByRole('navigation')
      await expect(nav).toBeVisible()
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
})
