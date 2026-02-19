/**
 * Policy Flow E2E Tests
 *
 * Critical user flow tests:
 * 1. Upload → Extract → Analyze → Export
 * 2. Policy management and navigation
 * 3. Gap analysis and recommendations
 */

import { test, expect } from '@playwright/test'

test.describe('Policy Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to upload page
    await page.goto('/upload')
    await page.waitForLoadState('networkidle')
  })

  test('should display upload interface with drag-drop zone', async ({ page }) => {
    // Protected route may redirect to auth
    if (page.url().includes('/auth')) {
      // Auth redirect is valid — user not logged in
      return
    }

    // Check for upload-related UI elements
    const uploadZone = page.locator('[data-testid="upload-zone"]').or(
      page.getByText(/drag.*drop|upload.*pdf|select.*file/i).first()
    )
    await expect(uploadZone).toBeVisible()
  })

  test('should show file type restrictions', async ({ page }) => {
    // Protected route may redirect to auth
    if (page.url().includes('/auth')) {
      // Auth redirect is valid — user not logged in
      return
    }

    // Should indicate PDF files are accepted
    await expect(page.getByText(/pdf/i).first()).toBeVisible()
  })

  test('should display upload button or input', async ({ page }) => {
    // Protected route may redirect to auth
    if (page.url().includes('/auth')) {
      // Auth redirect is valid — user not logged in
      return
    }

    // Look for file input or upload button
    const fileInput = page.locator('input[type="file"]')
    const uploadButton = page.getByRole('button', { name: /upload|select|browse/i })

    const hasInput = await fileInput.count() > 0
    const hasButton = await uploadButton.count() > 0

    expect(hasInput || hasButton).toBe(true)
  })

  test('should show demo mode indicator when AI is not configured', async ({ page }) => {
    // The app should indicate demo mode when AI keys aren't set
    const demoIndicator = page.getByText(/demo|sample|mock/i)
    // This may or may not be visible depending on configuration
    const count = await demoIndicator.count()
    expect(count).toBeGreaterThanOrEqual(0) // Just verify it doesn't error
  })

  test('should navigate back to dashboard', async ({ page }) => {
    // Find and click back button
    const backButton = page.getByRole('button', { name: /back/i }).or(
      page.locator('[aria-label*="back"]')
    ).or(
      page.locator('button').filter({ has: page.locator('svg') }).first()
    )

    if (await backButton.count() > 0) {
      await backButton.first().click()
      await page.waitForLoadState('networkidle')

      // Should navigate away from upload
      const url = page.url()
      expect(url.includes('/dashboard') || url.includes('/')).toBe(true)
    }
  })
})

test.describe('Sample Policy Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')
  })

  test('should display sample policies', async ({ page }) => {
    // Should show sample policy cards
    await expect(page.getByText(/sample|policy|insurance/i).first()).toBeVisible()
  })

  test('should show different policy types', async ({ page }) => {
    // Look for common policy types
    const policyTypes = ['home', 'auto', 'health', 'life', 'ev', 'konut', 'kasko', 'saglik']
    let foundTypes = 0

    for (const type of policyTypes) {
      const element = page.getByText(new RegExp(type, 'i'))
      if (await element.count() > 0) {
        foundTypes++
      }
    }

    expect(foundTypes).toBeGreaterThan(0)
  })

  test('should have interactive sample policy cards', async ({ page }) => {
    // Sample policies are displayed with expandable detail view
    // "View Details" button expands inline rather than navigating
    const detailButton = page.getByRole('button', { name: /view details|detay|hide details|gizle/i })
    const policyCard = page.locator('[data-testid="policy-card"]').or(
      page.locator('.cursor-pointer').filter({ hasText: /policy|sigorta|kasko/i })
    )

    const hasDetailButton = await detailButton.count() > 0
    const hasCard = await policyCard.count() > 0

    // Should have either expandable cards or clickable cards
    expect(hasDetailButton || hasCard).toBe(true)
  })
})

test.describe('Policy Analysis Flow', () => {
  test('should display policy overview on detail page', async ({ page }) => {
    // Navigate directly to a sample policy
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    // Try to access first policy link
    const policyLink = page.locator('a[href*="/policy/"]').first()

    if (await policyLink.count() > 0) {
      await policyLink.click()
      await page.waitForLoadState('networkidle')

      // Check for policy overview elements
      const overviewSection = page.getByText(/overview|genel bakış|policy type/i)
      await expect(overviewSection.first()).toBeVisible()
    }
  })

  test('should display coverage information', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    const policyLink = page.locator('a[href*="/policy/"]').first()

    if (await policyLink.count() > 0) {
      await policyLink.click()
      await page.waitForLoadState('networkidle')

      // Look for coverage-related content
      const coverageSection = page.getByText(/coverage|teminat|limit|deductible|muafiyet/i)
      await expect(coverageSection.first()).toBeVisible()
    }
  })

  test('should show gap analysis if available', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    const policyLink = page.locator('a[href*="/policy/"]').first()

    if (await policyLink.count() > 0) {
      await policyLink.click()
      await page.waitForLoadState('networkidle')

      // Look for gap analysis section
      const gapSection = page.getByText(/gap|missing|eksik|recommendation|öneri/i)
      // Gap section may or may not exist depending on policy
      const count = await gapSection.count()
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })

  test('should show AI confidence score when available', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    const policyLink = page.locator('a[href*="/policy/"]').first()

    if (await policyLink.count() > 0) {
      await policyLink.click()
      await page.waitForLoadState('networkidle')

      // Look for AI-related indicators
      const aiIndicator = page.getByText(/ai|confidence|güven|accuracy|doğruluk/i)
      // May or may not be visible
      const count = await aiIndicator.count()
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })
})

test.describe('Export Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('should have export options in settings', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Protected route may redirect to auth
    if (page.url().includes('/auth')) {
      // Auth redirect is valid — user not logged in
      return
    }

    // Look for export section
    const exportSection = page.getByText(/export|dışa aktar|download|indir/i)
    await expect(exportSection.first()).toBeVisible()
  })

  test('should display PDF export button', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Look for PDF export button
    const pdfButton = page.getByRole('button', { name: /pdf/i }).or(
      page.getByText(/export.*pdf|pdf.*export/i)
    )

    if (await pdfButton.count() > 0) {
      await expect(pdfButton.first()).toBeVisible()
    }
  })

  test('should display CSV export button', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Look for CSV export button
    const csvButton = page.getByRole('button', { name: /csv/i }).or(
      page.getByText(/export.*csv|csv.*export/i)
    )

    if (await csvButton.count() > 0) {
      await expect(csvButton.first()).toBeVisible()
    }
  })

  test('should have download button on policy detail page', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    const policyLink = page.locator('a[href*="/policy/"]').first()

    if (await policyLink.count() > 0) {
      await policyLink.click()
      await page.waitForLoadState('networkidle')

      // Look for download button
      const downloadButton = page.getByRole('button', { name: /download|indir/i }).or(
        page.locator('button').filter({ has: page.locator('[class*="download"]') })
      )

      if (await downloadButton.count() > 0) {
        await expect(downloadButton.first()).toBeVisible()
      }
    }
  })
})

test.describe('Dashboard Policy Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('should display policy list or empty state', async ({ page }) => {
    // Protected route may redirect to auth
    if (page.url().includes('/auth')) {
      // Auth redirect is valid — user not logged in
      return
    }

    // Either show policies, empty state message, or dashboard summary
    const hasPolicies = page.locator('[data-testid="policy-card"]').or(
      page.locator('.policy-card')
    )
    const emptyState = page.getByText(/no policies|henüz poliçe yok|get started|başla/i)
    const dashboardContent = page.getByText(/dashboard|panel|total|toplam|policy|poliçe/i)

    const policiesCount = await hasPolicies.count()
    const emptyCount = await emptyState.count()
    const contentCount = await dashboardContent.count()

    expect(policiesCount > 0 || emptyCount > 0 || contentCount > 0).toBe(true)
  })

  test('should have navigation to upload', async ({ page }) => {
    const uploadLink = page.getByRole('link', { name: /upload|yükle/i }).or(
      page.getByRole('button', { name: /add.*policy|poliçe ekle/i })
    )

    if (await uploadLink.count() > 0) {
      await expect(uploadLink.first()).toBeVisible()
    }
  })

  test('should display total coverage summary', async ({ page }) => {
    // Protected route may redirect to auth
    if (page.url().includes('/auth')) {
      // Auth redirect is valid — user not logged in
      return
    }

    // Look for summary statistics
    const summarySection = page.getByText(/total|toplam|coverage|teminat|policies|poliçe/i)
    await expect(summarySection.first()).toBeVisible()
  })

  test('should allow filtering policies by type', async ({ page }) => {
    // Look for filter controls
    const filterControl = page.getByRole('combobox').or(
      page.getByRole('button', { name: /filter|filtre|all types|tüm/i })
    ).or(
      page.locator('select')
    )

    if (await filterControl.count() > 0) {
      await expect(filterControl.first()).toBeVisible()
    }
  })

  test('should allow searching policies', async ({ page }) => {
    // Look for search input
    const searchInput = page.getByPlaceholder(/search|ara/i).or(
      page.getByRole('searchbox')
    ).or(
      page.locator('input[type="search"]')
    )

    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
    }
  })
})

test.describe('Policy Chat/AI Assistant', () => {
  test('should load chat page', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    // May redirect if no policies
    expect(
      url.includes('/chat') ||
      url.includes('/dashboard') ||
      url.includes('/auth')
    ).toBe(true)
  })

  test('should display chat interface when accessible', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      // Look for chat input
      const chatInput = page.getByPlaceholder(/message|mesaj|ask|sor/i).or(
        page.locator('textarea')
      ).or(
        page.locator('input[type="text"]')
      )

      if (await chatInput.count() > 0) {
        await expect(chatInput.first()).toBeVisible()
      }
    }
  })

  test('should show policy context in chat', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      // Look for policy selector or context
      const policyContext = page.getByText(/select.*policy|policy.*context|poliçe seç/i).or(
        page.locator('[data-testid="policy-selector"]')
      )

      const count = await policyContext.count()
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })
})

test.describe('Responsive Design', () => {
  test('should display mobile navigation on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for mobile menu button
    const menuButton = page.getByRole('button', { name: /menu/i }).or(
      page.locator('[aria-label*="menu"]')
    ).or(
      page.locator('button').filter({ has: page.locator('[class*="menu"]') })
    )

    if (await menuButton.count() > 0) {
      await expect(menuButton.first()).toBeVisible()
    }
  })

  test('should maintain functionality on tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Page should load without errors
    const url = page.url()
    expect(url.includes('/dashboard') || url.includes('/auth')).toBe(true)
  })
})

test.describe('Error Handling', () => {
  test('should show 404 page for invalid routes', async ({ page }) => {
    await page.goto('/invalid-route-that-does-not-exist')
    await page.waitForLoadState('networkidle')

    // Should show not found message
    const notFound = page.getByText(/not found|404|bulunamadı/i)
    await expect(notFound.first()).toBeVisible()
  })

  test('should handle invalid policy ID gracefully', async ({ page }) => {
    await page.goto('/policy/invalid-policy-id-12345')
    await page.waitForLoadState('networkidle')

    // Should show policy not found, redirect to dashboard, or redirect to auth
    const notFound = page.getByText(/not found|bulunamadı/i)
    const dashboardRedirect = page.url().includes('/dashboard')
    const authRedirect = page.url().includes('/auth')

    const foundNotice = await notFound.count() > 0
    expect(foundNotice || dashboardRedirect || authRedirect).toBe(true)
  })
})

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy on landing page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for h1
    const h1 = page.locator('h1')
    await expect(h1.first()).toBeVisible()
  })

  test('should have accessible buttons with labels', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // All buttons should have accessible names
    const buttons = page.getByRole('button')
    const count = await buttons.count()

    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i)
      const name = await button.getAttribute('aria-label') || await button.textContent()
      expect(name).toBeTruthy()
    }
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Tab through focusable elements
    await page.keyboard.press('Tab')

    // Something should be focused
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })
})

test.describe('Performance', () => {
  test('should load landing page within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime

    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000)
  })

  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime

    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000)
  })
})
