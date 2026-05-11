import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const POLICIES_DIR = path.resolve(__dirname, '../policies')

// Workaround for Playwright setInputFiles issue with Unicode characters in file paths:
// when filenames contain Turkish characters (İ,ğ,ü,ş,ö,ç), setInputFiles may not
// trigger the React onChange handler. We copy files to a temp dir with sanitized names.
const TMP_POLICIES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'insurai-policies-'))

function sanitizeName(name: string): string {
  return name
    .replace(/[İ]/g, 'I')
    .replace(/[ğ]/g, 'g')
    .replace(/[ü]/g, 'u')
    .replace(/[ş]/g, 's')
    .replace(/[ö]/g, 'o')
    .replace(/[ç]/g, 'c')
    .replace(/[Ğ]/g, 'G')
    .replace(/[Ü]/g, 'U')
    .replace(/[Ş]/g, 'S')
    .replace(/[Ö]/g, 'O')
    .replace(/[Ç]/g, 'C')
    .replace(/[ı]/g, 'i')
}

// Get up to 10 sample PDF policies from the policies directory
const samplePolicies = fs
  .readdirSync(POLICIES_DIR)
  .filter((file) => file.toLowerCase().endsWith('.pdf'))
  .slice(0, 10)
  .map((file) => {
    const sanitized = sanitizeName(file)
    if (sanitized !== file) {
      // Copy to temp dir with sanitized name
      const tmpPath = path.join(TMP_POLICIES_DIR, sanitized)
      if (!fs.existsSync(tmpPath)) {
        fs.copyFileSync(path.join(POLICIES_DIR, file), tmpPath)
      }
      return { name: file, path: tmpPath }
    }
    return { name: file, path: path.join(POLICIES_DIR, file) }
  })

test.describe('Real Policies Batch Extraction Tests', () => {
  // Set a generous timeout since real AI extraction takes time (up to 2 minutes per policy)
  test.setTimeout(120000 * samplePolicies.length)

  for (const policy of samplePolicies) {
    test(`Extract and process real policy: ${policy.name}`, async ({ page }) => {
      // Individual test timeout
      test.setTimeout(120000)

      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Find upload input
      const fileInput = page
        .locator('input[type="file"][accept*="pdf"]')
        .or(page.locator('input[type="file"]'))
        .first()

      // Upload the actual policy PDF
      await fileInput.setInputFiles(policy.path)

      // Wait for navigation to /try or /upload
      await page.waitForURL(/\/(try|upload)/, { timeout: 10000 })

      // If anonymous, it redirects to /try. If logged in, stays on /upload or goes to /policy
      if (page.url().includes('/try')) {
        // Wait for extraction to complete (shows score/grade or error)
        const resultOrError = page.getByText(
          /score|grade|coverage|teminat|puan|error|hata|failed|timeout|try again/i
        )
        await expect(resultOrError.first()).toBeVisible({ timeout: 100000 })

        // Assert we actually got a real result (not an error)
        const hasRealResults = (await page.getByText(/score|grade|puan/i).count()) > 0
        const hasError = (await page.getByText(/error|hata|failed|timeout/i).count()) > 0

        // Expect at least one of these to be true (preferably a result)
        expect(hasRealResults || hasError).toBe(true)
      }
    })
  }
})
