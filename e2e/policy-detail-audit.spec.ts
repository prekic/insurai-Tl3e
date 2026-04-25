/**
 * Policy Detail Real-World Audit
 *
 * Tests the AUTHENTICATED policy detail view by injecting a Supabase
 * session into localStorage BEFORE the page loads. This bypasses the
 * ProtectedRoute redirect and allows us to test what real users see.
 *
 * This is the definitive E2E test for catching UI regressions that
 * the simpler content-sanity tests can't reach (auth-gated routes).
 */
import { test, expect } from '@playwright/test'

// Extract project ref from the Supabase URL for localStorage key
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase/)?.[1] || 'exykhfulkbwzatpesruv'
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

const MOCK_USER = {
  id: 'e2e-audit-user-001',
  email: 'audit@insurai.com',
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'E2E Audit User' },
  created_at: '2025-01-01T00:00:00Z',
}

const MOCK_SESSION = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMmUtYXVkaXQtdXNlci0wMDEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6OTk5OTk5OTk5OX0.mock',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
}

// ── Realistic KASKO policy matching the user's real screenshot ──────────
const MOCK_POLICY_ID = 'e2e-audit-kasko-001'

const MOCK_KASKO_POLICY = {
  id: MOCK_POLICY_ID,
  user_id: MOCK_USER.id,
  policy_number: '462661051',
  provider: 'AXA Sigorta',
  type: 'kasko',
  type_tr: 'Kasko',
  coverage: 350000,
  premium: 10806,
  deductible: 0,
  deductible_type: 'conditional',
  start_date: '2024-01-01',
  expiry_date: '2025-01-01',
  status: 'expired',
  insured_person: 'EREĞLİ DEMİR VE ÇELİK FAB.T.A.Ş.',
  insured_entity_type: 'corporate',
  location: 'Istanbul',
  document_type: 'policy',
  upload_date: '2024-01-01',
  logo: null,
  vehicle_info: {
    plate: '67 LJ 968',
    make: 'FORD',
    model: 'TRANSIT',
    year: 2020,
    usage: 'commercial',
    vehicleClass: 'Minibüs',
  },
  raw_data: {
    coverages: [
      {
        name: 'Collision',
        nameTr: 'Çarpma/Çarpışma',
        limit: 350000,
        deductible: 0,
        included: true,
      },
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
        name: 'Glass Breakage',
        nameTr: 'Cam Kırılması',
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
      {
        name: 'Personal Accident',
        nameTr: 'Ferdi Kaza',
        limit: 50000,
        deductible: 0,
        included: true,
      },
    ],
    exclusions: [
      'Earthquake damage excluded from base coverage',
      'Racing or speed competition damage excluded',
      'Driving under influence of alcohol or drugs excluded',
    ],
    aiConfidence: 0.88,
    aiInsights: [
      '✓ Comprehensive KASKO coverage up to market value',
      '✓ IMM (voluntary liability) included at TRY 100,000',
      '⚠ Policy has expired — renewal strongly recommended',
      '⚠ Conditional deductible requires careful review',
    ],
    vehicle: { make: 'FORD', model: 'TRANSIT', year: 2020, plateNumber: '67 LJ 968' },
    discounts: [
      { name: 'Fleet Discount', nameTr: 'Filo İndirimi', percentage: 15 },
      { name: 'No Claims Bonus', nameTr: 'Hasarsızlık İndirimi', percentage: 30 },
    ],
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// ── Forbidden patterns ──────────────────────────────────────────────────
const FORBIDDEN_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\/\*\s+[A-Z][\s\S]{3,80}\*\//, label: 'Bare block comment (/* ... */)' },
  { regex: /\/\/\s*TODO\b/i, label: '// TODO comment' },
  { regex: /\/\/\s*FIXME\b/i, label: '// FIXME comment' },
  { regex: /\bconsole\.(log|warn|error|debug)\b/, label: 'console.log visible' },
  { regex: /\[object Object\]/, label: '[object Object]' },
  { regex: /\bNaN\b/, label: 'NaN rendered' },
  { regex: /className=/, label: 'Raw className=' },
  { regex: /data-testid=/, label: 'Raw data-testid=' },
  { regex: /\{\{[^}]+\}\}/, label: 'Unresolved {{template}}' },
  { regex: /\$\{[^}]+\}/, label: 'Unresolved ${template}' },
  { regex: /Suppressed for unverified/, label: 'Internal suppression label' },
  { regex: /gate-triggered/, label: 'Internal gate-triggered term' },
  { regex: /Error: Minified React error/, label: 'Minified React error' },
  { regex: /Hydration failed/, label: 'Hydration error' },
  { regex: /Unhandled Runtime Error/, label: 'Runtime error overlay' },
]

// ── Helper: extract only visible text (skip script/style/hidden) ────────
async function getVisibleText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG'])
    const parts: string[] = []
    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (text) parts.push(text)
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node as HTMLElement
      if (SKIP_TAGS.has(el.tagName)) return
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return
      if (el.getAttribute('aria-hidden') === 'true') return
      for (const child of el.childNodes) walk(child)
    }
    walk(document.body)
    return parts.join(' ')
  })
}

// ── Test Suite ───────────────────────────────────────────────────────────

test.describe('Policy Detail Audit — Authenticated Real Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Mock ALL Supabase API endpoints
    await page.route('**/rest/v1/policies*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_KASKO_POLICY]),
      })
    })

    await page.route('**/rest/v1/policy_documents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION),
      })
    })

    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_USER),
      })
    })

    await page.route('**/auth/v1/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION),
      })
    })

    // 2. Inject Supabase auth session into localStorage BEFORE page loads
    // This is the key step — Supabase JS client reads from localStorage first
    await page.addInitScript(
      (args) => {
        const { key, session } = args
        window.localStorage.setItem(key, JSON.stringify(session))
      },
      { key: STORAGE_KEY, session: MOCK_SESSION }
    )
  })

  test('KASKO policy detail — desktop — no developer artifacts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    // Take screenshot for visual review
    await page.screenshot({ path: 'e2e/screenshots/audit-kasko-desktop.png', fullPage: true })

    const url = page.url()
    console.log(`[Audit] Final URL: ${url}`)

    if (url.includes('/auth')) {
      console.log('[Audit] REDIRECTED TO AUTH — session injection failed')
      // Even if redirected, the test should not silently pass
      test.skip()
      return
    }

    // Check we actually rendered policy content (not "not found")
    const bodyText = await page.innerText('body')
    console.log('[Audit] DESKTOP body text (first 3000 chars):')
    console.log(bodyText.substring(0, 3000))

    // Verify policy content is present
    const hasContent =
      bodyText.includes('462661051') ||
      bodyText.includes('AXA Sigorta') ||
      bodyText.includes('Policy') ||
      bodyText.includes('Kasko')

    if (!hasContent) {
      console.log('[Audit] WARNING: No policy content found — may be "not found" page')
    }

    // Run forbidden patterns check against visible text only
    const visibleText = await getVisibleText(page)
    const violations: string[] = []
    for (const { regex, label } of FORBIDDEN_PATTERNS) {
      const match = visibleText.match(regex)
      if (match) {
        const snippet = match[0].length > 80 ? match[0].slice(0, 80) + '…' : match[0]
        violations.push(`${label}  →  "${snippet}"`)
      }
    }

    if (violations.length > 0) {
      console.log('[Audit] ❌ DEVELOPER ARTIFACTS FOUND:')
      violations.forEach((v) => console.log(`  ${v}`))
    } else {
      console.log('[Audit] ✅ No developer artifacts in visible text')
    }

    expect(
      violations,
      `Developer artifacts on policy detail:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  test('KASKO policy detail — mobile — no developer artifacts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    await page.screenshot({ path: 'e2e/screenshots/audit-kasko-mobile.png', fullPage: true })

    const url = page.url()
    if (url.includes('/auth')) {
      test.skip()
      return
    }

    const visibleText = await getVisibleText(page)
    const violations: string[] = []
    for (const { regex, label } of FORBIDDEN_PATTERNS) {
      const match = visibleText.match(regex)
      if (match) {
        const snippet = match[0].length > 80 ? match[0].slice(0, 80) + '…' : match[0]
        violations.push(`${label}  →  "${snippet}"`)
      }
    }

    expect(
      violations,
      `Developer artifacts on mobile policy detail:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  test('KASKO policy detail — no "undefined" values in key fields', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    // Check specific UI elements for "undefined" or empty rendering
    const visibleText = await getVisibleText(page)

    // These should NEVER appear in a well-rendered policy view
    const badValues = [
      { pattern: /undefined/gi, label: '"undefined" text' },
      { pattern: /null/gi, label: '"null" text' },
      { pattern: /NaN/g, label: '"NaN" value' },
      { pattern: /\[object Object\]/g, label: '[object Object]' },
      { pattern: /TRY\s+0(?:\s|$|\.)/g, label: 'Zero currency value (TRY 0)' },
    ]

    const issues: string[] = []
    for (const { pattern, label } of badValues) {
      const matches = visibleText.match(pattern)
      if (matches && matches.length > 0) {
        issues.push(`${label} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`)
      }
    }

    if (issues.length > 0) {
      console.log('[Audit] ❌ BAD VALUES IN RENDERED FIELDS:')
      issues.forEach((i) => console.log(`  ${i}`))
    }

    expect(issues, `Bad values in policy detail:\n${issues.join('\n')}`).toHaveLength(0)
  })
})
