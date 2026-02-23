import { test, expect } from '@playwright/test'

test.describe('Translation Chunk Loading Exclusivity', () => {
    test('loads only English translation chunk for EN locale', async ({ page }) => {
        // Navigate with EN locale in localStorage
        await page.goto('/')
        await page.evaluate(() => window.localStorage.setItem('insurai_locale', 'en'))

        const requestedChunks: string[] = []
        page.on('request', request => {
            const url = request.url()
            if (url.includes('translations-en')) requestedChunks.push('en')
            if (url.includes('translations-tr')) requestedChunks.push('tr')
        })

        // Reload to trigger translation load
        await page.goto('/', { waitUntil: 'networkidle' })

        // Wait for the skeleton translations to be replaced by actual EN string
        await expect(page.locator('text="Sign In"').first()).toBeVisible({ timeout: 10000 })

        expect(requestedChunks).toContain('en')
        expect(requestedChunks).not.toContain('tr')
    })

    test('loads only Turkish translation chunk for TR locale', async ({ page }) => {
        // Navigate with TR locale in localStorage
        await page.goto('/')
        await page.evaluate(() => window.localStorage.setItem('insurai_locale', 'tr'))

        const requestedChunks: string[] = []
        page.on('request', request => {
            const url = request.url()
            if (url.includes('translations-en')) requestedChunks.push('en')
            if (url.includes('translations-tr')) requestedChunks.push('tr')
        })

        // Reload to trigger translation load
        await page.goto('/', { waitUntil: 'networkidle' })

        // Wait for the skeleton translations to be replaced by actual TR string
        await expect(page.locator('text="Giriş Yap"').first()).toBeVisible({ timeout: 10000 })

        expect(requestedChunks).toContain('tr')
        expect(requestedChunks).not.toContain('en')
    })
})
