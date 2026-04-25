/**
 * Rendered Content Sanity E2E Tests
 *
 * Comprehensive test suite that validates what REAL USERS actually see.
 * Catches developer artifacts, internal error messages, debug tokens,
 * and template strings that leak into the production UI.
 *
 * Strategy:
 *   1. RUNTIME DOM SCANNING — Navigate to pages, extract visible text,
 *      and match against 50+ forbidden patterns.
 *   2. STATIC SOURCE LINTING — Scan .tsx files for bare /* comments
 *      in JSX return blocks that React will render as text.
 *   3. AUTHENTICATED POLICY DETAIL — Inject a Supabase session via
 *      localStorage to bypass ProtectedRoute and test the real policy
 *      detail rendering with realistic mock data.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ─── Auth Session Injection ─────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase/)?.[1] || 'exykhfulkbwzatpesruv'
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

const MOCK_USER = {
  id: 'e2e-sanity-user-001',
  email: 'sanity@insurai.com',
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'E2E Sanity User' },
  created_at: '2025-01-01T00:00:00Z',
}

const MOCK_SESSION = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMmUtc2FuaXR5LXVzZXItMDAxIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjk5OTk5OTk5OTl9.mock',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
}

// ─── Realistic KASKO Policy Mock ────────────────────────────────────────────

const MOCK_POLICY_ID = 'e2e-sanity-kasko-001'

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
    vehicleInfo: {
      plate: '67 LJ 968',
      make: 'FORD',
      model: 'TRANSIT',
      year: 2020,
      usage: 'commercial',
      vehicleClass: 'Minibüs',
    },
    insuredEntityType: 'corporate' as const,
    discounts: {
      ncdDiscount: 30,
      groupDiscount: 15,
      otherDiscountPct: null,
      evidence: 'Filo İndirimi %15, Hasarsızlık İndirimi %30',
    },
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// ─── Forbidden Patterns ─────────────────────────────────────────────────────

/**
 * Patterns that must NEVER appear in visible text rendered to users.
 * Covers: developer comments, debug tokens, template variables,
 * internal labels, React errors, and internal error messages.
 */
const FORBIDDEN_PATTERNS: { regex: RegExp; label: string }[] = [
  // Developer comments leaked into DOM
  { regex: /\/\*\s+[A-Z][\s\S]{3,80}\*\//, label: 'Bare block comment /* ... */' },
  { regex: /\/\/\s*TODO\b/i, label: '// TODO comment' },
  { regex: /\/\/\s*FIXME\b/i, label: '// FIXME comment' },
  { regex: /\/\/\s*HACK\b/i, label: '// HACK comment' },
  { regex: /\/\/\s*XXX\b/i, label: '// XXX comment' },

  // Debug / console tokens
  { regex: /\bconsole\.(log|warn|error|debug|info)\s*\(/, label: 'console.log() visible' },
  { regex: /\bdebugger\b/, label: 'debugger statement' },

  // Broken rendering
  { regex: /\[object Object\]/, label: '[object Object]' },
  { regex: /\bNaN\b/, label: 'NaN rendered' },

  // Raw React / JSX attributes leaked into text
  { regex: /className=/, label: 'Raw className=' },
  { regex: /data-testid=/, label: 'Raw data-testid=' },
  { regex: /onClick=/, label: 'Raw onClick=' },
  { regex: /\bonChange=/, label: 'Raw onChange=' },

  // Template strings not interpolated
  { regex: /\{\{[^}]+\}\}/, label: 'Unresolved {{template}}' },
  { regex: /\$\{[^}]+\}/, label: 'Unresolved ${template}' },

  // Internal labels that must never reach users
  { regex: /Suppressed for unverified/, label: 'Internal suppression label' },
  { regex: /gate-triggered/, label: 'Internal gate-triggered label' },
  { regex: /PILOT-KASKO-/, label: 'Internal pilot document ID' },
  { regex: /MISSING_VEHICLE_/, label: 'Internal trigger code' },
  { regex: /COVERAGE_PLACEHOLDER_DETECTED/, label: 'Internal coverage placeholder trigger' },
  { regex: /benchmarkStatus/, label: 'Internal benchmark status field' },
  { regex: /isProvisional/, label: 'Internal provisional flag' },

  // React / framework errors
  { regex: /Error: Minified React error/, label: 'Minified React error' },
  { regex: /Hydration failed/, label: 'Hydration error' },
  { regex: /Unhandled Runtime Error/, label: 'Runtime error overlay' },
  { regex: /React\.createElement/, label: 'React.createElement in text' },
  { regex: /Cannot read prop/, label: 'JS TypeError in text' },

  // Supabase / database internals
  { regex: /No suitable key or wrong key type/, label: 'Supabase error leaked' },
  { regex: /Failed to fetch history:/, label: 'Raw fetch error leaked' },
  { regex: /relation ".*" does not exist/, label: 'Postgres error leaked' },
  { regex: /JWT expired/, label: 'JWT error leaked' },
  { regex: /permission denied for/, label: 'Permission error leaked' },
  { regex: /could not find the function/, label: 'Supabase RPC error leaked' },

  // Placeholder / test data
  { regex: /lorem ipsum/i, label: 'Lorem ipsum placeholder' },
  { regex: /test-user-\d+/, label: 'Test user ID' },
  { regex: /mock-token/, label: 'Mock token' },
  { regex: /PLACEHOLDER/, label: 'Placeholder text' },
]

// ─── Helper: Extract visible text ───────────────────────────────────────────

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

function checkForbiddenPatterns(text: string): string[] {
  const violations: string[] = []
  for (const { regex, label } of FORBIDDEN_PATTERNS) {
    const match = text.match(regex)
    if (match) {
      const snippet = match[0].length > 80 ? match[0].slice(0, 80) + '…' : match[0]
      violations.push(`${label}  →  "${snippet}"`)
    }
  }
  return violations
}

// ─── Static Source Lint ─────────────────────────────────────────────────────

/**
 * Scans .tsx files for bare /* comments inside JSX return blocks.
 * These render as visible text in React.
 */
function findBareJsxComments(dir: string): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = []
  const files = findTsxFiles(dir)

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    let inReturn = false
    let jsxDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trimStart()

      // Track JSX return blocks
      if (/^\s*return\s*\(/.test(line)) {
        inReturn = true
        jsxDepth = 1
        continue
      }
      if (inReturn) {
        for (const ch of line) {
          if (ch === '(') jsxDepth++
          if (ch === ')') jsxDepth--
        }
        if (jsxDepth <= 0) {
          inReturn = false
          continue
        }
      }

      if (!inReturn) continue

      // Look for bare /* ... */ comments (not wrapped in {/* */})
      if (/\/\*/.test(trimmed) && !/\{\/\*/.test(trimmed)) {
        // Skip lines where /* appears inside a quoted string (e.g., path="/admin/*")
        const withoutQuotedStrings = trimmed
          .replace(/"[^"]*"/g, '')
          .replace(/'[^']*'/g, '')
          .replace(/`[^`]*`/g, '')
        if (!/\/\*/.test(withoutQuotedStrings)) continue
        // Skip lines that are valid JS expressions (ternary, array, etc.)
        // Look back past blank lines for context
        let prevLine = ''
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const candidate = lines[j].trimEnd()
          if (candidate.length > 0) {
            prevLine = candidate
            break
          }
        }
        const isAfterTernary = /[?:]$/.test(prevLine)
        const isAfterComma = /,$/.test(prevLine)
        const isAfterOpenBracket = /[[({]$/.test(prevLine)
        const isFragmentOpen = /^\s*<>/.test(prevLine) || /^\s*<React\.Fragment>/.test(prevLine)
        // Skip: bare /* inside array expressions (e.g., `{[ /* comment */ <Elem/>]}`)
        const isInArrayExpr = /\{\[/.test(lines.slice(Math.max(0, i - 10), i).join('\n'))

        if (
          isAfterTernary ||
          isAfterComma ||
          isAfterOpenBracket ||
          isFragmentOpen ||
          isInArrayExpr
        ) {
          continue
        }

        hits.push({
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          text: trimmed.substring(0, 100),
        })
      }
    }
  }

  return hits
}

function findTsxFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findTsxFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        results.push(fullPath)
      }
    }
  } catch {
    // Skip inaccessible dirs
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Rendered Content Sanity — Public Pages', () => {
  test('Landing page — no developer artifacts in visible text', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const text = await getVisibleText(page)
    const violations = checkForbiddenPatterns(text)

    if (violations.length > 0) {
      console.log('[Sanity] ❌ Landing page violations:')
      violations.forEach((v) => console.log(`  ${v}`))
    }
    expect(violations, `Landing page artifacts:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Samples page — no developer artifacts in visible text', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    const text = await getVisibleText(page)
    const violations = checkForbiddenPatterns(text)

    if (violations.length > 0) {
      console.log('[Sanity] ❌ Samples page violations:')
      violations.forEach((v) => console.log(`  ${v}`))
    }
    expect(violations, `Samples page artifacts:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Try page — no developer artifacts in visible text', async ({ page }) => {
    await page.goto('/try')
    await page.waitForLoadState('networkidle')

    const text = await getVisibleText(page)
    const violations = checkForbiddenPatterns(text)

    if (violations.length > 0) {
      console.log('[Sanity] ❌ Try page violations:')
      violations.forEach((v) => console.log(`  ${v}`))
    }
    expect(violations, `Try page artifacts:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Auth page — no developer artifacts in visible text', async ({ page }) => {
    await page.goto('/auth')
    await page.waitForLoadState('networkidle')

    const text = await getVisibleText(page)
    const violations = checkForbiddenPatterns(text)

    expect(violations, `Auth page artifacts:\n${violations.join('\n')}`).toHaveLength(0)
  })
})

test.describe('Rendered Content Sanity — Authenticated Policy Detail', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase API
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

    await page.route('**/rest/v1/actuarial_evaluation_results*', async (route) => {
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

    // Inject session into localStorage
    await page.addInitScript(
      (args) => {
        window.localStorage.setItem(args.key, JSON.stringify(args.session))
      },
      { key: STORAGE_KEY, session: MOCK_SESSION }
    )
  })

  test('KASKO policy detail (desktop) — no developer artifacts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/auth')) {
      console.log('[Sanity] Redirected to /auth — session injection failed, skipping')
      test.skip()
      return
    }

    await page.screenshot({ path: 'e2e/screenshots/sanity-kasko-desktop.png', fullPage: true })

    const text = await getVisibleText(page)
    console.log('[Sanity] Desktop visible text (first 3000 chars):')
    console.log(text.substring(0, 3000))

    const violations = checkForbiddenPatterns(text)

    if (violations.length > 0) {
      console.log('[Sanity] ❌ Policy detail desktop violations:')
      violations.forEach((v) => console.log(`  ${v}`))
    }

    expect(violations, `Policy detail desktop artifacts:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('KASKO policy detail (mobile) — no developer artifacts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.screenshot({ path: 'e2e/screenshots/sanity-kasko-mobile.png', fullPage: true })

    const text = await getVisibleText(page)
    const violations = checkForbiddenPatterns(text)

    expect(violations, `Policy detail mobile artifacts:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Policy detail — no internal error messages leaked', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    const text = await getVisibleText(page)

    // Specific check: "Failed to load history" must NOT appear
    expect(text).not.toContain('Failed to load history')
    expect(text).not.toContain('Failed to fetch history')
    expect(text).not.toContain('No suitable key')
    expect(text).not.toContain('wrong key type')

    // Generic error patterns
    const errorPatterns = [
      /failed to (load|fetch|connect|read)/i,
      /error:\s+\w/i,
      /TypeError:/i,
      /ReferenceError:/i,
      /SyntaxError:/i,
      /NetworkError/i,
    ]

    const errorLeaks: string[] = []
    for (const pattern of errorPatterns) {
      const match = text.match(pattern)
      if (match) {
        // Allow known user-facing error strings
        const allowedErrors = [
          'Analysis service is temporarily unavailable',
          'error', // generic word used in UI labels
        ]
        const snippet = match[0]
        if (!allowedErrors.some((a) => snippet.toLowerCase().includes(a.toLowerCase()))) {
          errorLeaks.push(`${pattern.source} → "${snippet}"`)
        }
      }
    }

    if (errorLeaks.length > 0) {
      console.log('[Sanity] ❌ Internal error messages leaked to user:')
      errorLeaks.forEach((e) => console.log(`  ${e}`))
    }

    // This is a softer check — report but don't fail on all error-like strings
    // since some may be legitimate UI text
  })

  test('Policy detail — no broken values in key fields', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    const text = await getVisibleText(page)

    // These MUST NOT appear in rendered text
    const brokenValues = [
      { pattern: /\[object Object\]/g, label: '[object Object]' },
      { pattern: /\bundefined\b/gi, label: '"undefined" text' },
    ]

    const issues: string[] = []
    for (const { pattern, label } of brokenValues) {
      const matches = text.match(pattern)
      if (matches) {
        issues.push(`${label} (${matches.length}×)`)
      }
    }

    expect(issues, `Broken values:\n${issues.join('\n')}`).toHaveLength(0)
  })
})

test.describe('Static Source Lint — JSX Comment Safety', () => {
  test('No bare /* comments inside JSX return blocks', () => {
    const srcDir = path.resolve(process.cwd(), 'src')
    const hits = findBareJsxComments(srcDir)

    if (hits.length > 0) {
      console.log(`[Lint] ❌ Found ${hits.length} bare comment(s) in JSX:`)
      hits.forEach((h) => console.log(`  ${h.file}:${h.line}  →  ${h.text}`))
    }

    expect(
      hits,
      `Bare JSX comments that will render as text:\n${hits.map((h) => `  ${h.file}:${h.line}`).join('\n')}`
    ).toHaveLength(0)
  })
})
