/**
 * Rendered Content Sanity Tests
 *
 * Guards against developer artifacts (code comments, debug tokens,
 * placeholder strings, raw JSON keys, internal CSS class names, etc.)
 * leaking into the visible UI that real users see.
 *
 * This spec would have caught the bare JSX `/* ... * /` comment bug
 * in PolicyScoreSection.tsx that rendered code comments as visible text.
 */

import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

// ────────────────────────────────────────────────────────────────────────────
// Forbidden patterns — things that should NEVER appear in user-visible text
// ────────────────────────────────────────────────────────────────────────────

/**
 * Each pattern has:
 *   regex  — what to look for in the full-page text content
 *   label  — human-readable description for error messages
 */
const FORBIDDEN_PATTERNS: { regex: RegExp; label: string }[] = [
  // ── Code comment leaks ───────────────────────────────────────────────
  { regex: /\/\*\s+[A-Z][\s\S]{3,80}\*\//, label: 'Bare CSS/JS block comment (/* ... */)' },
  { regex: /\/\/\s*TODO\b/i, label: '// TODO comment' },
  { regex: /\/\/\s*FIXME\b/i, label: '// FIXME comment' },
  { regex: /\/\/\s*HACK\b/i, label: '// HACK comment' },
  { regex: /\/\/\s*XXX\b/i, label: '// XXX comment' },

  // ── Debug / developer tokens ─────────────────────────────────────────
  { regex: /\bconsole\.(log|warn|error|debug)\b/, label: 'console.log/warn/error visible in UI' },
  { regex: /\bundefined\b/, label: 'Literal "undefined" rendered to user' },
  { regex: /\b\[object Object\]/, label: '[object Object] rendered to user' },
  { regex: /\bNaN\b/, label: 'NaN rendered to user' },
  { regex: /data-testid=/, label: 'Raw data-testid attribute in text' },
  { regex: /className=/, label: 'Raw className attribute in text' },

  // ── Placeholder / template leaks ─────────────────────────────────────
  { regex: /\{\{[^}]+\}\}/, label: 'Unresolved mustache template {{...}}' },
  { regex: /\$\{[^}]+\}/, label: 'Unresolved template literal ${...}' },
  { regex: /\bLorem ipsum\b/i, label: 'Lorem ipsum placeholder text' },
  { regex: /\bplaceholder\b/i, label: '"placeholder" text visible to user' },

  // ── React / framework internals ──────────────────────────────────────
  { regex: /\bError: Minified React error/, label: 'Minified React error' },
  { regex: /\bInvariant Violation\b/, label: 'React Invariant Violation' },
  { regex: /\bUnhandled Runtime Error\b/, label: 'Next.js runtime error overlay' },
  { regex: /\bHydration failed\b/, label: 'React hydration error' },

  // ── Suppressed / internal labels from our codebase ───────────────────
  { regex: /Suppressed for unverified/, label: 'Internal suppression comment leaked' },
  { regex: /gate-triggered/, label: 'Internal "gate-triggered" term leaked' },
  { regex: /leaking confident/, label: 'Internal "leaking confident" term leaked' },
]

// ────────────────────────────────────────────────────────────────────────────
// Helper: extract full visible text from the page
// ────────────────────────────────────────────────────────────────────────────

async function getVisibleText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    // Walk the DOM and collect text from visible elements only.
    // Skip <script>, <style>, <noscript>, <template>, and hidden elements.
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
      // Skip hidden elements
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return
      if (el.getAttribute('aria-hidden') === 'true') return

      for (const child of el.childNodes) walk(child)
    }

    walk(document.body)
    return parts.join(' ')
  })
}

/**
 * Helper: scan page text for all forbidden patterns and return violations.
 */
async function findViolations(page: import('@playwright/test').Page): Promise<string[]> {
  const text = await getVisibleText(page)
  const violations: string[] = []

  for (const { regex, label } of FORBIDDEN_PATTERNS) {
    const match = text.match(regex)
    if (match) {
      // Include the matched snippet (truncated) for diagnostics
      const snippet = match[0].length > 80 ? match[0].slice(0, 80) + '…' : match[0]
      violations.push(`${label}  →  "${snippet}"`)
    }
  }

  return violations
}

// ────────────────────────────────────────────────────────────────────────────
// Tests — scan every page a real user would visit
// ────────────────────────────────────────────────────────────────────────────

test.describe('Rendered Content Sanity — No Developer Artifacts Visible', () => {
  test('Landing page (/) has no developer artifacts', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Dashboard (/dashboard) has no developer artifacts', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Samples page (/samples) has no developer artifacts', async ({ page }) => {
    await page.goto('/samples')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Settings page (/settings) has no developer artifacts', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Upload page (/upload) has no developer artifacts', async ({ page }) => {
    await page.goto('/upload')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Chat page (/chat) has no developer artifacts', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  test('Compare page (/compare) has no developer artifacts', async ({ page }) => {
    await page.goto('/compare')
    await page.waitForLoadState('networkidle')

    const violations = await findViolations(page)
    expect(violations, `Developer artifacts found:\n${violations.join('\n')}`).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Policy detail page — mocked so we test the RENDERED evaluation/score UI
// This is the exact flow the user reported the bug on.
// ────────────────────────────────────────────────────────────────────────────

const MOCK_POLICY_ID = 'e2e-content-sanity-001'

const MOCK_POLICY = {
  id: MOCK_POLICY_ID,
  user_id: 'e2e-user-001',
  policy_number: 'POL-SANITY-001',
  provider: 'AXA Sigorta',
  type: 'kasko',
  type_tr: 'Kasko',
  coverage: 500000,
  premium: 18000,
  deductible: 5000,
  start_date: '2025-01-01',
  expiry_date: '2026-01-01',
  status: 'active',
  insured_person: 'Test User',
  location: 'Istanbul',
  document_type: 'policy',
  upload_date: '2025-01-01',
  logo: null,
  raw_data: {
    coverages: [
      {
        name: 'Collision',
        nameTr: 'Çarpma/Çarpışma',
        limit: 500000,
        deductible: 5000,
        included: true,
      },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 500000, deductible: 0, included: true },
    ],
    exclusions: ['Earthquake damage excluded from base coverage'],
    aiConfidence: 0.92,
    aiInsights: ['✓ Comprehensive coverage up to market value', '✓ Theft protection included'],
    vehicle: { make: 'Toyota', model: 'Corolla', year: 2022, plateNumber: '34 ABC 123' },
  },
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

test.describe('Policy Detail — No Developer Artifacts in Evaluation UI', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API calls to serve a predictable policy
    await page.route('**/rest/v1/policies*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_POLICY]),
      })
    })

    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: { id: 'e2e-user-001', email: 'test@insurai.com', role: 'authenticated' },
        }),
      })
    })

    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-user-001',
          email: 'test@insurai.com',
          role: 'authenticated',
        }),
      })
    })
  })

  test('Policy detail page has no developer artifacts (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    const violations = await findViolations(page)
    expect(
      violations,
      `Developer artifacts on policy detail:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  test('Policy detail page has no developer artifacts (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/policy/${MOCK_POLICY_ID}`)
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    const violations = await findViolations(page)
    expect(
      violations,
      `Developer artifacts on mobile policy detail:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Static lint-style scan of JSX source files for bare comments
// This catches the root cause at build time, not runtime.
// ────────────────────────────────────────────────────────────────────────────

function collectTsxFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      // Skip node_modules and build artifacts
      if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue
      results.push(...collectTsxFiles(full))
    } else if (extname(entry) === '.tsx') {
      results.push(full)
    }
  }
  return results
}

/**
 * Detect bare `/* ... * /` comments inside JSX return blocks that would
 * render as visible text to users.
 *
 * Strategy: inside a return ( ... ) block in a .tsx file, any line that
 * starts with optional whitespace then `/*` (without a leading `{`) is
 * a bare comment that will render as text — UNLESS it's in a valid JS
 * expression position (ternary branch, array element, or fragment).
 *
 * Safe positions where bare comments are valid JS and won't render:
 *   - After ternary `:` or `) :`  →  condition ? <A/> : /* comment * / <B/>
 *   - After array `,`            →  [<A/>, /* comment * / <B/>]
 *   - After fragment `<>`        →  <> /* comment * / ... </>
 *   - After ternary `? (`        →  condition ? ( /* comment * / ...
 */
function findBareJsxComments(filePath: string): { line: number; text: string }[] {
  const source = readFileSync(filePath, 'utf-8')
  const lines = source.split('\n')
  const issues: { line: number; text: string }[] = []

  let insideReturn = false
  let braceDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Track when we enter a JSX return block
    if (/\breturn\s*\(/.test(trimmed)) {
      insideReturn = true
      braceDepth = 0
    }

    if (insideReturn) {
      // Count parens to know when the return block ends
      for (const ch of trimmed) {
        if (ch === '(') braceDepth++
        if (ch === ')') braceDepth--
      }
      if (braceDepth <= 0 && trimmed.endsWith(')')) {
        insideReturn = false
      }

      // Check for bare block comment (not wrapped in { })
      // Pattern: line starts with whitespace then /*, but NOT {/*
      if (/^\s*\/\*/.test(line) && !/^\s*\{\/\*/.test(line)) {
        // Look at the previous non-empty line to check if this comment is
        // in a valid JS expression position (won't render as JSX text).
        let prevTrimmed = ''
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim()
          if (prev) {
            prevTrimmed = prev
            break
          }
        }

        // Safe positions: ternary branch (ends with : or ) :), array
        // element (ends with , or [), fragment opening (<>), ternary start
        // (ends with ? ( ), or JSX expression opening (ends with {)
        const isSafePosition =
          /[,:]\s*$/.test(prevTrimmed) || // array element or ternary branch
          prevTrimmed.endsWith('[') || // array opening bracket
          /\)\s*:\s*\(?\s*$/.test(prevTrimmed) || // ) : or ) : (
          /:\s*\(\s*$/.test(prevTrimmed) || // : (
          /\?\s*\(\s*$/.test(prevTrimmed) || // ? (
          prevTrimmed.endsWith('<>') || // fragment opening
          prevTrimmed.endsWith('{') // JSX expression opening

        if (!isSafePosition) {
          issues.push({ line: i + 1, text: trimmed.slice(0, 100) })
        }
      }
    }
  }

  return issues
}

test.describe('Static Lint — No Bare JSX Comments in Source', () => {
  test('All .tsx files use {/* */} syntax for JSX comments, not bare /* */', () => {
    const srcDir = join(process.cwd(), 'src')
    const tsxFiles = collectTsxFiles(srcDir)
    const allIssues: { file: string; line: number; text: string }[] = []

    for (const file of tsxFiles) {
      const issues = findBareJsxComments(file)
      for (const issue of issues) {
        allIssues.push({ file, ...issue })
      }
    }

    if (allIssues.length > 0) {
      const report = allIssues.map((i) => `  ${i.file}:${i.line}  →  ${i.text}`).join('\n')
      expect(allIssues, `Bare /* */ comments inside JSX return blocks:\n${report}`).toHaveLength(0)
    }
  })
})
