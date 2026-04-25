/**
 * Policy Trial View Audit — tests the UNAUTHENTICATED trial path
 * which is how the user's screenshot was generated.
 * Uses page.evaluate() to inject state and navigate.
 */
import { test, expect } from '@playwright/test'

const MOCK_KASKO = {
  id: 'trial-audit-001',
  user_id: 'anon',
  policyNumber: '462661051',
  provider: 'AXA Sigorta',
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 350000,
  premium: 10806,
  deductible: 0,
  deductibleType: 'conditional',
  startDate: '2024-01-01',
  expiryDate: '2025-01-01',
  status: 'expired',
  insuredPerson: 'EREĞLİ DEMİR VE ÇELİK FAB.T.A.Ş.',
  insuredEntityType: 'corporate',
  location: 'Istanbul',
  documentType: 'policy',
  uploadDate: '2024-01-01',
  logo: null,
  vehicleInfo: {
    plate: '67 LJ 968',
    make: 'FORD',
    model: 'TRANSIT',
    year: 2020,
    usage: 'commercial',
    vehicleClass: 'Minibüs',
  },
  coverages: [
    { name: 'Collision', nameTr: 'Çarpma/Çarpışma', limit: 350000, deductible: 0, included: true },
    { name: 'Theft', nameTr: 'Hırsızlık', limit: 350000, deductible: 0, included: true },
    { name: 'Fire', nameTr: 'Yangın', limit: 350000, deductible: 0, included: true },
    {
      name: 'Natural Disaster',
      nameTr: 'Doğal Afet',
      limit: 350000,
      deductible: 0,
      included: true,
    },
    {
      name: 'IMM',
      nameTr: 'İhtiyari Mali Mesuliyet',
      limit: 100000,
      deductible: 0,
      included: true,
    },
  ],
  exclusions: [
    'Earthquake damage excluded from base coverage',
    'Racing or speed competition damage excluded',
  ],
  aiConfidence: 0.88,
  aiInsights: [
    '✓ Comprehensive KASKO coverage up to market value',
    '✓ IMM included at TRY 100,000',
    '⚠ Policy expired — renewal recommended',
  ],
  discounts: [
    { name: 'Fleet Discount', nameTr: 'Filo İndirimi', percentage: 15 },
    { name: 'No Claims Bonus', nameTr: 'Hasarsızlık İndirimi', percentage: 30 },
  ],
  rawData: {},
}

test.describe('Policy Trial Audit — Unauthenticated Real Rendering', () => {
  test('Trial policy detail renders clean UI (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })

    // First navigate to the app to load React
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Now use React Router's navigate to go to /policy/trial with state
    await page.evaluate((policyData) => {
      // Use history.pushState + a custom event to trigger React Router
      const state = {
        policy: policyData,
        isTrialResult: true,
        lowConfidence: false,
        confidenceScore: 0.88,
      }
      window.history.pushState(state, '', '/policy/trial')
      window.dispatchEvent(new PopStateEvent('popstate', { state }))
    }, MOCK_KASKO)

    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/trial-detail-desktop.png', fullPage: true })

    const bodyText = await page.innerText('body')
    console.log('=== TRIAL POLICY DETAIL (DESKTOP) ===')
    console.log(bodyText.substring(0, 6000))
    console.log('=== END ===')

    const url = page.url()
    console.log('=== URL: ' + url + ' ===')

    // Forbidden patterns check
    const FORBIDDEN = [
      { pattern: /\/\*\s+[A-Z][\s\S]{3,80}\*\//, name: 'Bare block comment' },
      { pattern: /\[object Object\]/, name: '[object Object]' },
      { pattern: /\bundefined\b/i, name: 'undefined text' },
      { pattern: /\bNaN\b/, name: 'NaN text' },
      { pattern: /console\.(log|warn|error)/, name: 'console.log' },
      { pattern: /className=/, name: 'Raw className' },
      { pattern: /data-testid=/, name: 'Raw data-testid' },
      { pattern: /\{\{[^}]+\}\}/, name: 'Template mustache' },
    ]

    const violations: string[] = []
    for (const { pattern, name } of FORBIDDEN) {
      if (pattern.test(bodyText)) {
        const match = bodyText.match(pattern)
        violations.push(`${name}: "${match?.[0]?.substring(0, 80)}"`)
      }
    }

    if (violations.length > 0) {
      console.log('=== ❌ VIOLATIONS FOUND ===')
      violations.forEach((v) => console.log(`  ${v}`))
    } else {
      console.log('=== ✅ NO FORBIDDEN PATTERNS ===')
    }

    expect(violations).toHaveLength(0)
  })

  test('Trial policy detail renders clean UI (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.evaluate((policyData) => {
      const state = {
        policy: policyData,
        isTrialResult: true,
        lowConfidence: false,
        confidenceScore: 0.88,
      }
      window.history.pushState(state, '', '/policy/trial')
      window.dispatchEvent(new PopStateEvent('popstate', { state }))
    }, MOCK_KASKO)

    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/trial-detail-mobile.png', fullPage: true })

    const bodyText = await page.innerText('body')
    console.log('=== TRIAL POLICY DETAIL (MOBILE) ===')
    console.log(bodyText.substring(0, 6000))
    console.log('=== END ===')
  })
})
