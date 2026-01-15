/**
 * Mobile Viewport Overflow Tests
 *
 * Tests to ensure no horizontal overflow on mobile devices.
 * This test reproduces the exact issue: content expanding beyond viewport on mobile.
 */

import { test, expect } from '@playwright/test'

// Helper to check for horizontal overflow
async function hasHorizontalOverflow(page: import('@playwright/test').Page): Promise<{
  hasOverflow: boolean
  scrollWidth: number
  clientWidth: number
  difference: number
}> {
  const result = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth
    const clientWidth = document.documentElement.clientWidth
    return {
      scrollWidth,
      clientWidth,
      difference: scrollWidth - clientWidth,
      hasOverflow: scrollWidth > clientWidth
    }
  })
  return result
}

// Helper to find elements causing overflow
async function findOverflowingElements(page: import('@playwright/test').Page): Promise<string[]> {
  return await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const overflowing: string[] = []

    const allElements = document.querySelectorAll('*')
    allElements.forEach(el => {
      const rect = el.getBoundingClientRect()
      if (rect.right > viewportWidth + 1) { // +1 for rounding
        const identifier = el.tagName +
          (el.id ? `#${el.id}` : '') +
          (el.className ? `.${el.className.toString().split(' ').slice(0, 3).join('.')}` : '')
        overflowing.push(`${identifier} (right: ${Math.round(rect.right)}px, viewport: ${viewportWidth}px)`)
      }
    })

    // Return unique elements, limit to first 10
    return [...new Set(overflowing)].slice(0, 10)
  })
}

test.describe('Mobile Viewport - No Horizontal Overflow', () => {
  // Use iPhone 13 viewport explicitly
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })

  test('Dashboard should not have horizontal overflow', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Wait for any animations to complete
    await page.waitForTimeout(500)

    const overflow = await hasHorizontalOverflow(page)

    if (overflow.hasOverflow) {
      const overflowingElements = await findOverflowingElements(page)
      console.log('OVERFLOW DETECTED!')
      console.log(`Scroll width: ${overflow.scrollWidth}px`)
      console.log(`Client width: ${overflow.clientWidth}px`)
      console.log(`Overflow amount: ${overflow.difference}px`)
      console.log('Overflowing elements:', overflowingElements)

      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/dashboard-overflow.png', fullPage: true })
    }

    expect(overflow.hasOverflow,
      `Dashboard has horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px (diff: ${overflow.difference}px)`
    ).toBe(false)
  })

  test('Policy Detail View should not have horizontal overflow', async ({ page }) => {
    // First go to dashboard to potentially load policies
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Try to navigate to a policy detail page (using samples for predictable content)
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const overflow = await hasHorizontalOverflow(page)

    if (overflow.hasOverflow) {
      const overflowingElements = await findOverflowingElements(page)
      console.log('OVERFLOW DETECTED on samples page!')
      console.log(`Scroll width: ${overflow.scrollWidth}px`)
      console.log(`Client width: ${overflow.clientWidth}px`)
      console.log(`Overflow amount: ${overflow.difference}px`)
      console.log('Overflowing elements:', overflowingElements)

      await page.screenshot({ path: 'test-results/samples-overflow.png', fullPage: true })
    }

    expect(overflow.hasOverflow,
      `Samples page has horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px (diff: ${overflow.difference}px)`
    ).toBe(false)
  })

  test('Landing page should not have horizontal overflow', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const overflow = await hasHorizontalOverflow(page)

    if (overflow.hasOverflow) {
      const overflowingElements = await findOverflowingElements(page)
      console.log('OVERFLOW DETECTED on landing page!')
      console.log(`Scroll width: ${overflow.scrollWidth}px`)
      console.log(`Client width: ${overflow.clientWidth}px`)
      console.log(`Overflow amount: ${overflow.difference}px`)
      console.log('Overflowing elements:', overflowingElements)

      await page.screenshot({ path: 'test-results/landing-overflow.png', fullPage: true })
    }

    expect(overflow.hasOverflow,
      `Landing page has horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px (diff: ${overflow.difference}px)`
    ).toBe(false)
  })

  test('Settings page should not have horizontal overflow', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const overflow = await hasHorizontalOverflow(page)

    if (overflow.hasOverflow) {
      const overflowingElements = await findOverflowingElements(page)
      console.log('OVERFLOW DETECTED on settings page!')
      console.log(`Scroll width: ${overflow.scrollWidth}px`)
      console.log(`Client width: ${overflow.clientWidth}px`)
      console.log(`Overflow amount: ${overflow.difference}px`)
      console.log('Overflowing elements:', overflowingElements)

      await page.screenshot({ path: 'test-results/settings-overflow.png', fullPage: true })
    }

    expect(overflow.hasOverflow,
      `Settings page has horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px (diff: ${overflow.difference}px)`
    ).toBe(false)
  })
})

// Test with smaller viewport (iPhone SE)
test.describe('Mobile Viewport - iPhone SE (smaller screen)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })

  test('Dashboard should fit iPhone SE viewport', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const overflow = await hasHorizontalOverflow(page)

    if (overflow.hasOverflow) {
      const overflowingElements = await findOverflowingElements(page)
      console.log('OVERFLOW on iPhone SE!')
      console.log(`Overflow: ${overflow.difference}px`)
      console.log('Elements:', overflowingElements)

      await page.screenshot({ path: 'test-results/dashboard-iphonese-overflow.png', fullPage: true })
    }

    expect(overflow.hasOverflow,
      `Dashboard overflows on iPhone SE by ${overflow.difference}px`
    ).toBe(false)
  })
})
