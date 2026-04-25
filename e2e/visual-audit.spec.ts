/**
 * Visual audit — capture screenshots + text of every major page
 * to identify rendering problems visible to real users.
 */
import { test } from '@playwright/test'

test.describe('Visual Audit — Capture Real UI State', () => {
  test('Landing page visual state', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'e2e/screenshots/landing.png', fullPage: true })

    // Get visible text to check for problems
    const bodyText = await page.innerText('body')
    console.log('=== LANDING PAGE TEXT (first 2000 chars) ===')
    console.log(bodyText.substring(0, 2000))
    console.log('=== END ===')
  })

  test('Samples/Demo page visual state', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'e2e/screenshots/samples.png', fullPage: true })

    const bodyText = await page.innerText('body')
    console.log('=== SAMPLES PAGE TEXT (first 2000 chars) ===')
    console.log(bodyText.substring(0, 2000))
    console.log('=== END ===')
  })

  test('Try analysis page visual state', async ({ page }) => {
    await page.goto('/try')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'e2e/screenshots/try.png', fullPage: true })

    const bodyText = await page.innerText('body')
    console.log('=== TRY PAGE TEXT (first 2000 chars) ===')
    console.log(bodyText.substring(0, 2000))
    console.log('=== END ===')
  })
})
