/**
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE 2 — RENDER-CONTRACT GUARDS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Catches the silent-render-failure class flagged in the April 30 reviewer
 * round (Anadolu Birleşik Kasko): an Exclusions panel that displayed "3"
 * with an empty body, an Ask-Insurer panel that disappeared even though
 * data existed, and supplementary coverages that never rendered despite
 * the LLM extracting all 11 of them.
 *
 * The contract: if structured data has N items, the DOM has at least N
 * corresponding rows (small dedup tolerance for exclusions, exact for
 * coverages). Failures mean the rendering pipeline silently dropped data.
 *
 * Mocks Supabase via the auth-bypass pattern from real-user-proof.spec.ts.
 * Each test feeds in a different policy shape and counts data-testid'd
 * rows in the DOM.
 *
 * Run locally:
 *   npx playwright test e2e/render-contract.spec.ts --project=chromium
 *
 * If a test fails after a UI change, check the data-testid attributes
 * that gate the assertion — they were added in the same commit as this
 * file (PolicyCoverageSection.tsx, PolicyScenariosSection.tsx).
 */
import { test, expect, type Page } from '@playwright/test'

// ─── Auth Setup (mirrors real-user-proof.spec.ts) ───────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase/)?.[1] || 'exykhfulkbwzatpesruv'
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

const MOCK_USER = {
  id: 'render-contract-user',
  email: 'render-contract@insurai.com',
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Render Contract Tester' },
  created_at: '2025-01-01T00:00:00Z',
}

const MOCK_SESSION = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZW5kZXItY29udHJhY3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6OTk5OTk5OTk5OX0.mock',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'render-contract-refresh',
  user: MOCK_USER,
}

// ─── Helpers ────────────────────────────────────────────────────────────
type MockPolicy = {
  id: string
  user_id: string
  policy_number: string
  provider: string
  type: string
  type_tr: string
  coverage: number
  premium: number
  deductible: number
  start_date: string
  expiry_date: string
  status: string
  insured_person: string
  location: string
  document_type: string
  upload_date: string
  logo: null
  raw_data: Record<string, unknown>
  created_at: string
  updated_at: string
}

function buildMockPolicy(overrides: {
  id: string
  exclusions?: string[]
  coverages?: Array<Record<string, unknown>>
}): MockPolicy {
  return {
    id: overrides.id,
    user_id: MOCK_USER.id,
    policy_number: `RC-${overrides.id}`,
    provider: 'Render Contract Test Sigorta',
    type: 'kasko',
    type_tr: 'Kasko',
    coverage: 500000,
    premium: 12000,
    deductible: 0,
    start_date: '2025-01-01',
    expiry_date: '2026-01-01',
    status: 'active',
    insured_person: 'Render Contract Test User',
    location: 'Istanbul',
    document_type: 'policy',
    upload_date: '2025-01-01',
    logo: null,
    raw_data: {
      coverages: overrides.coverages ?? [
        {
          name: 'Collision',
          nameTr: 'Çarpma/Çarpışma',
          limit: 350000,
          deductible: 0,
          included: true,
          category: 'main',
        },
      ],
      exclusions: overrides.exclusions ?? [],
      aiConfidence: 0.92,
      aiInsights: ['✓ Test policy rendered for render-contract guard'],
      vehicleInfo: {
        plate: '34 RC 0001',
        make: 'TEST',
        model: 'CONTRACT',
        year: 2024,
      },
    },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }
}

async function mockSupabaseForPolicy(
  page: Page,
  policy: MockPolicy,
  options: { trustedBenchmarks?: boolean } = {}
): Promise<void> {
  await page.route('**/rest/v1/policies*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([policy]),
    })
  })
  await page.route('**/rest/v1/policy_documents*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/actuarial_evaluation_results*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  // Premium benchmark fetch — without this, the hardcoded fallback returns
  // benchmarkStatus='untrusted' which flips evaluation.isProvisional=true
  // and suppresses PolicyScenariosSection (so the caveat test cannot find
  // its target). The trustedBenchmarks option enables a trusted mock.
  if (options.trustedBenchmarks) {
    await page.route('**/rest/v1/premium_benchmarks*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'benchmark-mock-1',
            insurance_type: 'kasko',
            insurance_type_tr: 'Kasko',
            sub_type: null,
            sub_type_tr: null,
            min_premium: 8000,
            avg_premium: 12000,
            max_premium: 18000,
            comparison_method: 'direct_premium',
            value_min_rate: null,
            value_avg_rate: null,
            value_max_rate: null,
            currency: 'TRY',
            year: 2026,
            source: 'render-contract-mock',
            source_tr: 'render-contract-mock',
            is_active: true,
            data_date: new Date().toISOString().split('T')[0],
          },
        ]),
      })
    })
  }
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
}

async function setupAuthAndNavigate(page: Page, policyId: string): Promise<boolean> {
  await page.addInitScript(
    (args) => {
      window.localStorage.setItem(args.key, JSON.stringify(args.session))
    },
    { key: STORAGE_KEY, session: MOCK_SESSION }
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/policy/${policyId}`)
  await page.waitForLoadState('networkidle')
  if (page.url().includes('/auth')) return false
  return true
}

/**
 * The Exclusions & Questions section in PolicyDetailView is rendered as a
 * collapsible card. Until the user clicks the header, the exclusion rows
 * and the Ask-Insurer panel are NOT mounted in the DOM (collapsed via
 * conditional rendering, not CSS). Tests counting these rows must
 * expand the section first.
 */
async function expandExclusionsSection(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: /Exclusions\s*&\s*Questions/i })
  if ((await trigger.count()) === 0) return // already expanded or not present
  await trigger.first().click()
  // Allow the collapse transition to settle.
  await page.waitForTimeout(300)
}

// ─── TESTS ──────────────────────────────────────────────────────────────

test.describe('🧷 Render-contract guards — Phase 2', () => {
  // -------------------------------------------------------------------
  // 1. EXCLUSIONS — input N → DOM has ≥1 exclusion row per input string
  // -------------------------------------------------------------------
  test('exclusions render-contract: 3 input exclusions → ≥3 DOM rows', async ({ page }) => {
    const policy = buildMockPolicy({
      id: 'rc-exclusions-1',
      exclusions: [
        'Driving under the influence of alcohol or drugs is excluded',
        'Damage from racing or speed competitions is excluded',
        'Intentional acts by the insured are excluded',
      ],
    })
    await mockSupabaseForPolicy(page, policy)
    const ok = await setupAuthAndNavigate(page, policy.id)
    if (!ok) {
      test.skip(true, 'Auth bypass redirected to /auth — skipping in this environment')
      return
    }

    await page.waitForSelector(`text=${policy.policy_number}`, { timeout: 10000 })
    await expandExclusionsSection(page)

    const rows = page.getByTestId('exclusion-row')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
    const count = await rows.count()
    // The exclusion analyser may dedup near-paraphrases, but for 3 distinct
    // inputs we expect at least 3 rows. A strict `=== 3` would falsely fail
    // if the analyser ever splits one input into multiple analysed items
    // (e.g. one umbrella exclusion that surfaces sub-bullets).
    expect(count).toBeGreaterThanOrEqual(3)
    expect(count).toBeLessThanOrEqual(6)
  })

  // -------------------------------------------------------------------
  // 2. ASK-INSURER — input data → at least 1 ask-insurer row visible
  // -------------------------------------------------------------------
  test('ask-insurer render-contract: kasko policy with broad-stroke exclusions surfaces at least one Ask-Insurer entry', async ({
    page,
  }) => {
    // A kasko policy that lists a vague catch-all exclusion ("hasarlar")
    // routes to either clarificationNeeded (analyser flagged) OR
    // missingImportantExclusions (knowledge base flagged the topic as
    // commonly clarified). Either way, the panel should render at least
    // one row across the three sub-types (clarify / addressed / missing).
    const policy = buildMockPolicy({
      id: 'rc-ask-insurer-1',
      exclusions: ['Belirsiz hasarlar teminat dışıdır', 'Servis seçimi muafiyete tabidir'],
    })
    await mockSupabaseForPolicy(page, policy)
    const ok = await setupAuthAndNavigate(page, policy.id)
    if (!ok) {
      test.skip(true, 'Auth bypass redirected to /auth — skipping in this environment')
      return
    }

    await page.waitForSelector(`text=${policy.policy_number}`, { timeout: 10000 })
    await expandExclusionsSection(page)

    // Any of the three sub-types satisfies the contract — count rows where
    // the testid begins with "ask-insurer-".
    const allRows = page.locator('[data-testid^="ask-insurer-"]')
    await expect(allRows.first()).toBeVisible({ timeout: 10000 })
    const count = await allRows.count()
    // Soft assertion: the kasko-knowledge analyser should always surface
    // at least one common topic (e.g. theft preconditions, OEM parts
    // policy) for a kasko policy regardless of input specifics.
    expect(count).toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------
  // 3. SUPPLEMENTARY COVERAGES — input N → DOM has N rows after expand
  // -------------------------------------------------------------------
  test('supplementary coverage render-contract: 5 input supplementary coverages → 5 DOM rows after expand', async ({
    page,
  }) => {
    const supplementaryCoverages = [
      { name: 'Hatalı Akaryakıt', nameTr: 'Hatalı Akaryakıt', limit: 25000 },
      { name: 'Cam Hasar Koruma', nameTr: 'Cam Hasar Koruma', limit: 10000 },
      { name: 'Hasarsızlık Koruma', nameTr: 'Hasarsızlık Koruma', limit: 0 },
      { name: 'Mini Repair', nameTr: 'Mini Tamir', limit: 5000 },
      { name: 'Anahtar Kaybı', nameTr: 'Anahtar Kaybı', limit: 7500 },
    ].map((c) => ({
      ...c,
      deductible: 0,
      included: true,
      category: 'supplementary' as const,
    }))

    const coverages = [
      // One main coverage so the policy isn't degenerate
      {
        name: 'Collision',
        nameTr: 'Çarpma/Çarpışma',
        limit: 350000,
        deductible: 0,
        included: true,
        category: 'main' as const,
      },
      ...supplementaryCoverages,
    ]

    const policy = buildMockPolicy({ id: 'rc-supplementary-1', coverages })
    await mockSupabaseForPolicy(page, policy)
    const ok = await setupAuthAndNavigate(page, policy.id)
    if (!ok) {
      test.skip(true, 'Auth bypass redirected to /auth — skipping in this environment')
      return
    }

    await page.waitForSelector(`text=${policy.policy_number}`, { timeout: 10000 })

    // The outer "Coverage Details" card defaults to expanded
    // (coveragesExpanded=true in PolicyDetailView state — DON'T click it,
    // that would COLLAPSE the section). The supplementary subcategory is
    // collapsed by default (only the first non-empty category, "main",
    // gets defaultExpanded). Click the supplementary header to reveal rows.
    const supplementaryCategory = page.locator('[data-coverage-category="supplementary"]')
    await expect(supplementaryCategory).toBeVisible({ timeout: 10000 })
    const header = supplementaryCategory.locator('button').first()
    await header.click()
    await page.waitForTimeout(300)

    const supplementaryRows = supplementaryCategory.locator('[data-testid="coverage-row"]')
    const count = await supplementaryRows.count()
    expect(count).toBe(5)
  })

  // -------------------------------------------------------------------
  // 4. CAVEAT — unlimited coverage with carveOuts surfaces a caveat note
  //
  // SKIPPED in this E2E spec — the same render-contract guard ships at the
  // component level in `PolicyScenariosSection.test.tsx` ("Render-contract
  // — carve-out caveat" describe block, 6 tests). That coverage catches
  // the same regression class (data has caveat → DOM renders it) and
  // additionally locks down: (a) the count contract for multiple
  // scenarios, (b) the role="note" a11y attribute, (c) the isUnverified
  // suppression invariant, (d) caveat-content sanity (must contain both
  // the qualifying amount AND a location keyword).
  //
  // The full E2E variant remained intractable because the test
  // environment unavoidably hits the hardcoded benchmark fallback
  // (`benchmarkStatus: 'untrusted'`), which flips
  // `evaluation.isProvisional = true` → `isUnverified = true` →
  // `PolicyScenariosSection` returns null → no caveat ever mounts.
  // Mocking `/rest/v1/premium_benchmarks*` doesn't help because the
  // hardcoded fallback runs synchronously before the route mock
  // resolves. The component-level test sidesteps this entirely.
  //
  // Carve-out detection logic itself is also covered by:
  //   - src/lib/audit/__tests__/quality-detectors.test.ts (Phase 1
  //     CARVE_OUT_DISPLAY_MISMATCH detector)
  //   - src/lib/policy-evaluation/__tests__/imm-scenario-detection.test.ts
  //   - src/lib/policy-evaluation/__tests__/evaluator.test.ts (Phase 1
  //     "Self-Audit Detectors" describe block)
  // -------------------------------------------------------------------
  test.skip('caveat render-contract: unlimited IMM with carve-outs renders at least one scenario-caveat note', async ({
    page,
  }) => {
    const coverages = [
      {
        name: 'Collision',
        nameTr: 'Çarpma/Çarpışma',
        limit: 350000,
        deductible: 0,
        included: true,
        category: 'main' as const,
      },
      {
        name: 'Artan Mali Sorumluluk',
        nameTr: 'Artan Mali Sorumluluk',
        limit: 0,
        deductible: 0,
        included: true,
        isUnlimited: true,
        category: 'liability' as const,
        carveOuts: [
          'Havalimanı, liman, akaryakıt depoları, rafineri ve benzeri yerlerde olay başı 2.500.000 TL üst sınırı uygulanır.',
        ],
        clause: 'Ek Sözleşme Maddeleri',
        quote:
          'Artan Mali Sorumluluk teminatı sınırsızdır. Ancak havalimanı, liman, akaryakıt depoları, rafineri ve benzeri yüksek riskli yerlerde 2.500.000 TL üst sınırı uygulanır.',
      },
    ]

    const policy = buildMockPolicy({ id: 'rc-caveat-1', coverages })
    await mockSupabaseForPolicy(page, policy, { trustedBenchmarks: true })
    const ok = await setupAuthAndNavigate(page, policy.id)
    if (!ok) {
      test.skip(true, 'Auth bypass redirected to /auth — skipping in this environment')
      return
    }

    await page.waitForSelector(`text=${policy.policy_number}`, { timeout: 10000 })

    // The IMM scenario card surfaces the carve-out as a small amber note.
    // Scroll through scenarios so the lazy-mounted ones get into the DOM.
    await page.evaluate(() => window.scrollBy(0, 1500))
    await page.waitForTimeout(500)

    const caveats = page.getByTestId('scenario-caveat')
    const count = await caveats.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Sanity: the caveat text must include the qualifying amount or
    // location reference — not an empty pill.
    const firstCaveatText = await caveats.first().innerText()
    const hasAmount = /2[.,]500[.,]000|2[,.]5\s*milyon/i.test(firstCaveatText)
    const hasLocation = /havalimanı|airport|liman|port|akaryakıt|fuel/i.test(firstCaveatText)
    expect(hasAmount || hasLocation).toBe(true)
  })
})
