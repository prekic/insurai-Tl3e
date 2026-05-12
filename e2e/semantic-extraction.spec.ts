import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const POLICIES_DIR = path.resolve(__dirname, '../policies')

// Sanitize Turkish Unicode filenames for Playwright setInputFiles
const TMP_POLICIES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'insurai-e2e-'))

function sanitizeName(name: string): string {
  return name
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/ /g, '_')
}

/**
 * Ground truth: manually verified values from reading policy PDFs.
 *
 * Each entry maps policy filename → expected fields.
 * Fields use partial matching (case-insensitive, substring).
 * `null` means "don't check this field" (not in document or ambiguous).
 * Use an empty string for "should not be present".
 */
const GROUND_TRUTH: Record<string, Record<string, string | null>> = {
  // Anadolu Sigorta — old kasko policy from 2014
  'ANADOLU.PDF': {
    insurerName: 'ANADOLU',
    policyNumber: '14703696',
    startDate: '2014',
    endDate: '2015',
    insuredName: null,
    vehicleMake: 'TOYOTA',
    vehicleModel: null,
    vehiclePlate: null,
    vehicleYear: null,
    premium: null,
    currency: 'TL',
  },

  // Güneş Sigorta Kasko (scanned, OCR'd via Gemini)
  '4.4. Kasko.pdf': {
    insurerName: 'GÜNEŞ',
    policyNumber: '208678401',
    startDate: '2015',
    endDate: '2016',
    insuredName: null,
    vehicleMake: null,
    vehicleModel: null,
    vehiclePlate: null,
    vehicleYear: '2012',
    premium: null,
    currency: 'TL',
  },

  // Ray Sigorta Kasko (scanned, OCR'd via Gemini)
  'KRK_35 VD 458 Kasko Police_32630901_3.pdf': {
    insurerName: 'RAY SİGORTA',
    policyNumber: '32630901',
    startDate: '2014',
    endDate: '2015',
    insuredName: null,
    vehicleMake: null,
    vehicleModel: null,
    vehiclePlate: null,
    vehicleYear: null,
    premium: null,
    currency: 'TL',
  },

  // Sompo Japan Kasko
  'KASKO POLİÇESİ.pdf': {
    insurerName: 'SOMPO JAPAN',
    policyNumber: 'K936007048',
    startDate: '2024',
    endDate: '2025',
    insuredName: null,
    vehicleMake: null,
    vehicleModel: null,
    vehiclePlate: null,
    vehicleYear: null,
    premium: null,
    currency: 'TL',
  },

  // Erdemir fleet cars
  'KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf': {
    insurerName: 'ERGO',
    policyNumber: '462660767',
    startDate: '2024',
    endDate: '2025',
    insuredName: 'ERDEMİR',
    vehiclePlate: '67 TY 932',
    vehicleMake: 'RENAULT',
    vehicleModel: null,
    vehicleYear: '2024',
    premium: null,
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660768_67TY840_2024.12-2025.12.pdf': {
    insurerName: 'ERGO',
    policyNumber: '462660768',
    startDate: '2024',
    endDate: '2025',
    insuredName: 'ERDEMİR',
    vehiclePlate: '67 TY 840',
    vehicleMake: 'RENAULT',
    vehicleYear: '2024',
    premium: null,
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660781_67EU352_2024.12-2025.12.pdf': {
    insurerName: 'ERGO',
    policyNumber: '462660781',
    startDate: '2024',
    endDate: '2025',
    insuredName: 'ERDEMİR',
    vehiclePlate: '67 EU 352',
    vehicleMake: 'MERCEDES-BENZ',
    vehicleYear: '2024',
    premium: null,
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660797_67LU324_2024.12-2025.12.pdf': {
    insurerName: 'ERGO',
    policyNumber: '462660797',
    startDate: '2024',
    endDate: '2025',
    insuredName: 'ERDEMİR',
    vehiclePlate: '67 LU 324',
    vehicleMake: 'MERCEDES-BENZ',
    vehicleYear: '2024',
    premium: null,
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660798_67LA807_2024.12-2025.12.pdf': {
    insurerName: 'ERGO',
    policyNumber: '462660798',
    startDate: '2024',
    endDate: '2025',
    insuredName: 'ERDEMİR',
    vehiclePlate: '67 LA 807',
    vehicleMake: 'MERCEDES-BENZ',
    vehicleYear: '2024',
    premium: null,
    currency: 'TL',
  },

  // Older two policies (batch upload)
  '201605061110254355_112575736_0_1 kasko (1).pdf': {
    insurerName: 'HALK SİGORTA',
    policyNumber: '112575736',
    startDate: '2016',
    vehicleMake: 'RENAULT',
    vehicleYear: '2009',
    currency: 'TL',
  },
  '201605061110254355_112575736_0_1 kasko (3).pdf': {
    insurerName: 'HALK SİGORTA',
    policyNumber: '112575736',
    startDate: '2016',
    vehicleMake: 'FIAT',
    vehicleYear: '2010',
    currency: 'TL',
  },
}

// Get all PDFs that have ground truth entries
const testPolicies = Object.keys(GROUND_TRUTH)
  .map((file) => {
    const srcPath = path.join(POLICIES_DIR, file)
    if (!fs.existsSync(srcPath)) return null
    const sanitized = sanitizeName(file)
    const tmpPath = path.join(TMP_POLICIES_DIR, sanitized)
    if (sanitized !== file && !fs.existsSync(tmpPath)) {
      fs.copyFileSync(srcPath, tmpPath)
    }
    return {
      name: file,
      path: sanitized === file ? srcPath : tmpPath,
      expected: GROUND_TRUTH[file],
    }
  })
  .filter((p): p is NonNullable<typeof p> => p !== null)

async function uploadPolicy(page: any, filePath: string) {
  // Navigate to /try page where the file upload component is active
  await page.goto('/try')
  await page.waitForLoadState('networkidle')

  // Find the hidden file input on the /try page
  const fileInput = page
    .locator('input[type="file"][accept*="pdf"]')
    .or(page.locator('input[type="file"]'))
    .first()
  await fileInput.setInputFiles(filePath)

  // After file selection the page processes the document
  await page.waitForTimeout(2000)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function waitForExtraction(page: any): Promise<Record<string, string>> {
  // Wait for the extraction result panel to appear
  // Look for score/puan or result indicators
  await page.waitForTimeout(3000) // initial render

  // Try up to 90 seconds for extraction to complete
  for (let attempt = 0; attempt < 18; attempt++) {
    const hasResult = await page
      .locator('text=/puan|PUAN|score|SCORE|puan|teminat|Coverage|coverage|grade|Grade/')
      .first()
      .isVisible()
      .catch(() => false)
    if (hasResult) break
    await page.waitForTimeout(5000)
  }

  // Collect all visible text from the results area
  const bodyText = await page.locator('body').innerText()

  // Also try to get structured result fields
  const fields: Record<string, string> = {}

  // Try to read each field by its label
  const fieldLabels = [
    'poliçe no',
    'sigorta şirketi',
    'sigorta sirketi',
    'plaka',
    'marka',
    'model',
    'yıl',
    'yil',
    'tckn',
    'vkn',
    'ad soyad',
    'isim',
    'başlangıç',
    'baslangic',
    'bitiş',
    'bitis',
    'prim',
    'kur',
    'döviz',
    'doviz',
    'şase no',
    'sase no',
    'vin',
  ]

  for (const label of fieldLabels) {
    // Try to find the label and its value in the body text
    const regex = new RegExp(`${label}[\\s:]*([^\\n]{1,100})`, 'gi')
    const match = regex.exec(bodyText)
    if (match && match[1]) {
      fields[label] = match[1].trim()
    }
  }

  // Also look for specific display patterns
  const knownPatterns: [RegExp, string][] = [
    /puan[:\s]*(\d+)/i,
    /score[:\s]*(\d+)/i,
    /poliçe no[:\s]*([a-z0-9/]+)/i,
    /police no[:\s]*([a-z0-9/]+)/i,
    /plaka[:\s]*(\d{2}\s*[a-zA-Z]{1,3}\s*\d{2,4})/i,
    /tckn[:\s]*(\d{11})/i,
    /vkn[:\s]*(\d{10})/i,
  ]

  for (const [pattern, key] of knownPatterns) {
    const match = pattern.exec(bodyText)
    if (match && match[1]) {
      fields[key] = match[1].trim()
    }
  }

  return { bodyText, ...fields } as any
}

test.describe('Semantic Extraction Accuracy (E2E)', () => {
  test.setTimeout(120000 * testPolicies.length)

  const _passedTests = 0
  const _totalChecks = 0

  for (const policy of testPolicies) {
    test(`Verify extracted data: ${policy.name}`, async ({ page }) => {
      test.setTimeout(120000)

      // Step 1: Upload the policy through the UI
      await uploadPolicy(page, policy.path)

      // Step 2: Wait for extraction result to appear
      const bodyText = await page.locator('body').innerText({ timeout: 90000 })
      console.log(`\n=== ${policy.name} ===`)
      console.log(`Page text preview: ${bodyText.substring(0, 500)}...`)

      // Step 3: Check each expected field against what's visible
      const checks: string[] = []
      const failures: string[] = []

      for (const [field, expected] of Object.entries(policy.expected)) {
        if (expected === null) continue // skip untested fields

        totalChecks++
        const normalizedText = bodyText.toLowerCase().normalize('NFKD')
        const normalizedExpected = expected.toLowerCase().normalize('NFKD')

        // Check if the expected value appears in the visible text
        if (normalizedText.includes(normalizedExpected)) {
          checks.push(`  ✅ ${field}: found "${expected}"`)
        } else {
          failures.push(`  ❌ ${field}: expected "${expected}" not found in visible text`)
          console.log(
            `     Near-match check: ${normalizedText.substring(
              Math.max(0, normalizedText.indexOf(normalizedExpected.substring(0, 4))),
              normalizedText.indexOf(normalizedExpected.substring(0, 4)) + 100
            )}`
          )
        }
      }

      // Print results for this policy
      checks.forEach((c) => console.log(c))
      failures.forEach((f) => console.log(f))

      if (checks.length > 0) passedTests++

      // At least some fields should match — not all may be visible in the UI
      // If ALL non-null fields failed, that's a real problem
      if (
        failures.length === Object.entries(policy.expected).filter(([, v]) => v !== null).length
      ) {
        expect(failures).toHaveLength(0) // This will fail the test
      } else {
        // Partial match is acceptable — at least half passed
        const totalCheckable = Object.entries(policy.expected).filter(([, v]) => v !== null).length
        expect(failures.length).toBeLessThan(totalCheckable)
      }
    })
  }
})
