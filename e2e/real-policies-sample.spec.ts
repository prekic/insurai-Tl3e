/**
 * Real-World Policy Sample (Investigation)
 *
 * Runs 3 representative production PDFs against the live Railway deployment.
 * Always captures: full-page screenshot, visible body text, console + network log.
 * Outcome is annotated as SUCCESS | EXTRACTION_ERROR | UPLOAD_HANG | NAVIGATION_TIMEOUT | UI_CRASH.
 *
 * Run:
 *   E2E_BASE_URL=https://insurai-production.up.railway.app \
 *     npx playwright test e2e/real-policies-sample.spec.ts --project=chromium --reporter=list,html
 */
import { test, expect, type Page, type Response } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const POLICIES_DIR = path.resolve(__dirname, '../policies')
const PROOF_DIR = path.resolve(__dirname, 'proof/real-policies')

/**
 * Workaround for a Playwright/Chromium-DevTools-Protocol limitation: when the
 * file path passed to `setInputFiles` contains non-ASCII characters (Turkish
 * `İ`, `ğ`, etc.), the file fails to attach to the input element. The React
 * change handler never fires, no upload happens, and the test silently hangs.
 *
 * Real users picking files via the OS file picker do NOT hit this — Chromium
 * handles Unicode filenames natively at that surface. This is a test-automation
 * artifact only.
 *
 * Fix: copy any non-ASCII fixture to a tmp path with a transliterated ASCII
 * filename before passing it to `setInputFiles`. Idempotent — safe to call
 * multiple times.
 *
 * Confirmed via the Run #6 A/B test (2026-04-27 18:10 UTC) — see
 * `e2e/findings/real-policies-findings-2026-04-27.md` "Run #6 — final
 * verification" section.
 */
function ensureAsciiFixturePath(originalPath: string): string {
  const base = path.basename(originalPath)
  // Pure ASCII fast path (printable chars 0x20–0x7E).
  if (/^[\x20-\x7E]+$/.test(base)) return originalPath

  const asciiBase = base
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    // Anything else outside printable ASCII falls back to underscore.
    .replace(/[^\x20-\x7E]/g, '_')

  const tmpDir = path.join(os.tmpdir(), 'insurai-e2e-fixtures')
  fs.mkdirSync(tmpDir, { recursive: true })
  const dest = path.join(tmpDir, asciiBase)
  // Copy only if missing or stale (older mtime than source).
  if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(originalPath).mtimeMs) {
    fs.copyFileSync(originalPath, dest)
  }
  return dest
}

interface SampleFixture {
  name: string
  filename: string
  expect: { provider?: string; year?: string; plate?: string }
  notes: string
}

const FIXTURES: SampleFixture[] = [
  {
    name: 'anadolu-single',
    filename: 'ANADOLU.PDF',
    expect: {},
    notes: 'Anadolu Sigorta single-vehicle KASKO. Smallest fixture (90 KB).',
  },
  {
    name: 'allianz-peugeot',
    filename: 'allianz-police-0001021024147152-TR.pdf',
    expect: { provider: 'Allianz', plate: '34 GM 6461' },
    notes: 'Allianz format with inverted ": VALUE\\tLabel" line layout (gotcha #103). 161 KB.',
  },
  {
    name: 'erdemir-fleet',
    filename: 'KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf',
    expect: { provider: 'AXA Sigorta', plate: '67 TY 932' },
    notes: 'Erdemir corporate fleet KASKO (AXA Sigorta). 289 KB, complex multi-coverage layout.',
  },
]

type Outcome = 'SUCCESS' | 'EXTRACTION_ERROR' | 'UPLOAD_HANG' | 'NAVIGATION_TIMEOUT' | 'UI_CRASH'

interface RunArtifacts {
  outcome: Outcome
  wallTimeMs: number
  startedAt: string
  finalUrl: string
  detail: string
  extractStatus?: number | null
  extractEndpoint?: string | null
}

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function captureBody(page: Page): Promise<string> {
  try {
    return await page.locator('body').innerText({ timeout: 5000 })
  } catch {
    return '<body innerText capture failed>'
  }
}

async function runFixture(
  page: Page,
  fixture: SampleFixture,
  testInfo: import('@playwright/test').TestInfo
) {
  const fixturePath = path.join(POLICIES_DIR, fixture.filename)
  expect(fs.existsSync(fixturePath), `Fixture missing: ${fixturePath}`).toBe(true)

  const safe = safeName(fixture.name)
  const screenshotPath = path.join(PROOF_DIR, `${safe}.png`)
  const textPath = path.join(PROOF_DIR, `${safe}.txt`)
  const logPath = path.join(PROOF_DIR, `${safe}.log`)

  const consoleLines: string[] = []
  const requestFailedLines: string[] = []
  let extractStatus: number | null = null
  let extractEndpoint: string | null = null

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLines.push(`[${msg.type()}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => {
    consoleLines.push(`[pageerror] ${err.message}`)
  })
  page.on('requestfailed', (req) => {
    requestFailedLines.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`)
  })

  // Pin the FINAL AI extraction response (post-OCR). Match /api/ai/extract or /api/ai/ai/* providers.
  // The OCR call returns first but the actual extraction is a separate request.
  const extractResponsePromise: Promise<Response | null> = page
    .waitForResponse(
      (resp) =>
        /\/api\/ai\/extract(\/|\?|$)/.test(resp.url()) || /\/api\/ai\/ocr\//.test(resp.url()),
      { timeout: 180_000 }
    )
    .catch(() => null)

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  let outcome: Outcome = 'UI_CRASH'
  let detail = ''
  let bodySnapshot = '<not captured>'

  try {
    // Page load with retry against the known intermittent Cloudflare-edge 503s
    // ("DNS cache overflow") documented in runbook 08. Without this the spec
    // is flaky against an issue that's outside our infrastructure.
    let pageLoaded = false
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await page.goto('/', { waitUntil: 'load', timeout: 25_000 })
        const title = await page.title()
        if (title && title.toLowerCase().includes('insurai')) {
          pageLoaded = true
          break
        }
        // Got a non-app response (likely the 503 error page). Retry.
      } catch {
        // Network error or timeout — retry.
      }
      if (attempt < 4) await page.waitForTimeout(8_000)
    }
    if (!pageLoaded) {
      outcome = 'NAVIGATION_TIMEOUT'
      detail =
        'Page failed to load InsurAI app after 4 attempts (probable Cloudflare 503 window — runbook 08)'
      bodySnapshot = await captureBody(page)
      return
    }

    // Target the landing-page UploadWidget specifically, not the
    // GlobalNavigation top-bar Upload button. Production has 3 file inputs:
    //   index 0: <nav> Upload button (GlobalNavigation.tsx) — different code path
    //   index 1: <label> "Analyze Your Policy Free" — UploadWidget compact mode
    //   index 2: <div> drag-drop area — UploadWidget regular mode
    // `input[type="file"]'.first()` was picking the nav button, so we were
    // testing the wrong component (and its instrumentation never fired).
    // Run #6 (2026-04-27) caught this — see the findings file's "Bonus
    // discovery" note. We now scope to the hero label that wraps the
    // UploadWidget compact button.
    const uploadWidgetInput = page
      .locator('label')
      .filter({ hasText: /Analyze Your Policy Free/i })
      .locator('input[type="file"]')
      .first()
    // 25 s timeout because the LandingPage's UploadWidget is lazy-loaded;
    // depending on bundle-load latency it can take longer than the default
    // 5 s to attach to the DOM. The corresponding GlobalNavigation input
    // attaches earlier (it's in the always-visible nav chrome) but that's
    // not the input we want to test.
    await uploadWidgetInput.waitFor({ state: 'attached', timeout: 25_000 })

    // Apply the ASCII-rename workaround for any non-ASCII fixture filenames.
    // No-op for ASCII paths, identity-equivalent file content for the rest.
    const safePath = ensureAsciiFixturePath(fixturePath)
    await uploadWidgetInput.setInputFiles(safePath)

    try {
      await page.waitForURL(/\/(try|upload|policy)/, { timeout: 30_000 })
    } catch {
      outcome = 'NAVIGATION_TIMEOUT'
      detail = `URL still ${page.url()} after upload`
      bodySnapshot = await captureBody(page)
      return
    }

    if (!page.url().includes('/try')) {
      outcome = 'SUCCESS'
      detail = `Redirected to ${page.url()} (authenticated path — cannot validate output without auth)`
      bodySnapshot = await captureBody(page)
      return
    }

    // Strict end-state SUCCESS tokens only — these only appear AFTER extraction completes.
    // Header labels like "Sigortalı" / "Insured" were too eager (matched mid-OCR scaffolding).
    const successSignal = page.locator(
      'text=/(\\d{1,3}\\s*\\/\\s*100|Toplam Puan|Overall Score|Teminatlar|Coverages)/i'
    )
    const failureSignal = page.locator(
      'text=/(Tekrar Dene|Try Again|Extraction Failed|Çıkarım Başarısız|Bir hata oluştu|Could not extract)/i'
    )

    const winner = await Promise.race([
      successSignal
        .first()
        .waitFor({ state: 'visible', timeout: 170_000 })
        .then(() => 'success' as const)
        .catch(() => null),
      failureSignal
        .first()
        .waitFor({ state: 'visible', timeout: 170_000 })
        .then(() => 'failure' as const)
        .catch(() => null),
    ])

    const extractResp = await extractResponsePromise
    if (extractResp) {
      extractStatus = extractResp.status()
      extractEndpoint = extractResp.url()
    }

    bodySnapshot = await captureBody(page)

    const explicitError =
      /Tekrar Dene|Try Again|Extraction Failed|Çıkarım Başarısız|Bir hata oluştu|Could not extract|Incomplete extraction|re-scan recommended/i.test(
        bodySnapshot
      )
    const explicitResult =
      /\d{1,3}\s*\/\s*100|Toplam Puan|Overall Score|Teminatlar|Coverages|Sigortalı(?!\s*Tutar)|Insured Person/i.test(
        bodySnapshot
      )

    if (winner === null) {
      outcome = 'UPLOAD_HANG'
      detail = 'Neither result nor explicit error became visible within 170 s'
    } else if (winner === 'failure' || (explicitError && !explicitResult)) {
      outcome = 'EXTRACTION_ERROR'
      detail = 'Failure UI visible (retry banner / extraction error)'
    } else if (explicitResult) {
      outcome = 'SUCCESS'
      detail = explicitError
        ? 'Result visible AND error/incomplete banner present (partial — investigate)'
        : 'Result visible'
    } else {
      outcome = 'UI_CRASH'
      detail = `winner=${winner ?? 'null'} but body has no recognizable result or error tokens`
    }
  } catch (err) {
    outcome = 'UI_CRASH'
    detail = err instanceof Error ? err.message : String(err)
    try {
      bodySnapshot = await captureBody(page)
    } catch {
      /* keep going */
    }
  } finally {
    const wallTimeMs = Date.now() - t0
    const finalUrl = page.url()
    let body = bodySnapshot
    if (body === '<not captured>') {
      try {
        body = await captureBody(page)
      } catch {
        body = '<could not capture body>'
      }
    }

    fs.mkdirSync(PROOF_DIR, { recursive: true })
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true })
    } catch {
      /* keep going */
    }
    fs.writeFileSync(textPath, body, 'utf8')
    fs.writeFileSync(
      logPath,
      [
        `# ${fixture.filename}`,
        `startedAt: ${startedAt}`,
        `wallTimeMs: ${Date.now() - t0}`,
        `finalUrl: ${finalUrl}`,
        `outcome: ${outcome}`,
        `detail: ${detail}`,
        `extractStatus: ${extractStatus ?? 'n/a'}`,
        `extractEndpoint: ${extractEndpoint ?? 'n/a'}`,
        '',
        '## Console errors / warnings',
        ...(consoleLines.length ? consoleLines : ['(none)']),
        '',
        '## Failed network requests',
        ...(requestFailedLines.length ? requestFailedLines : ['(none)']),
      ].join('\n'),
      'utf8'
    )

    const artifacts: RunArtifacts = {
      outcome,
      wallTimeMs,
      startedAt,
      finalUrl,
      detail,
      extractStatus,
      extractEndpoint,
    }
    testInfo.annotations.push({ type: 'outcome', description: outcome })
    testInfo.annotations.push({ type: 'wallTimeMs', description: String(wallTimeMs) })
    testInfo.annotations.push({ type: 'detail', description: detail })
    if (extractStatus !== null) {
      testInfo.annotations.push({
        type: 'extractStatus',
        description: `${extractStatus} ${extractEndpoint}`,
      })
    }

    await testInfo.attach(`${safe}.png`, { path: screenshotPath, contentType: 'image/png' })
    await testInfo.attach(`${safe}.txt`, { path: textPath, contentType: 'text/plain' })
    await testInfo.attach(`${safe}.log`, { path: logPath, contentType: 'text/plain' })
    await testInfo.attach(`${safe}-summary.json`, {
      body: JSON.stringify(artifacts, null, 2),
      contentType: 'application/json',
    })
  }
}

test.describe('Real-World Policy Sample (Investigation)', () => {
  // Sandbox Chromium ships with a stripped CA bundle that rejects Railway's chain; curl works.
  // Production deployment is fine — this is a sandbox environment artifact only.
  test.use({ ignoreHTTPSErrors: true })
  test.describe.configure({ retries: 0, mode: 'serial' })

  for (const fixture of FIXTURES) {
    test(`real-world: ${fixture.name} (${fixture.filename})`, async ({ page }, testInfo) => {
      test.setTimeout(220_000)
      await runFixture(page, fixture, testInfo)
    })
  }

  // Supabase CORS smoke check — confirms either:
  //   (a) the preflight succeeds with the expected ACAO header, OR
  //   (b) the preflight returned 5xx (the known intermittent Cloudflare-edge
  //       "DNS cache overflow" issue documented in runbook 08; retry succeeds).
  //
  // We do NOT fail the suite on (b) because it's a Cloudflare-side transient
  // unrelated to our config. The original PR #384 misdiagnosed this as a
  // Supabase allowlist issue; PR #386 corrected the runbook. This test is
  // now an informational tripwire — if it consistently fails on (a) (i.e. 200
  // responses without ACAO), Supabase actually changed its CORS posture and
  // we need to investigate.
  test('supabase preflight returns ACAO header when 2xx', async ({ request }, testInfo) => {
    const PROD_ORIGIN = 'https://insurai-production.up.railway.app'
    const SUPABASE_REST = 'https://exykhfulkbwzatpesruv.supabase.co/rest/v1/app_settings'
    const params = '?select=key%2Cvalue&category=eq.ocr&order=display_order.asc'

    const response = await request.fetch(SUPABASE_REST + params, {
      method: 'OPTIONS',
      headers: {
        Origin: PROD_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'apikey,authorization,content-type',
      },
    })

    const status = response.status()
    const acao = response.headers()['access-control-allow-origin']
    testInfo.annotations.push({
      type: 'supabase-preflight',
      description: `status=${status} acao=${acao ?? '(missing)'}`,
    })

    if (status >= 500) {
      // Known transient — see runbook 08. Skip rather than fail.
      console.warn(
        `[supabase-cors] preflight returned ${status} (${response.statusText() || 'no statusText'}). ` +
          `This is the documented intermittent Cloudflare-edge "DNS cache overflow" issue. ` +
          `Skipping assertion. See docs/runbooks/08-supabase-cors-allowlist.md.`
      )
      test.skip(true, 'Cloudflare 5xx during preflight — known transient')
      return
    }

    // Healthy preflight must include the ACAO header. Supabase historically
    // returns `*`. If it ever switched to a strict allowlist, this assertion
    // is the trip wire that catches it.
    expect(
      acao,
      `Healthy Supabase preflight (status ${status}) returned no ACAO header — ` +
        `this would mean Supabase changed its CORS posture. Investigate.`
    ).toMatch(new RegExp(`${PROD_ORIGIN.replace(/\./g, '\\.')}|\\*`))
  })
})
