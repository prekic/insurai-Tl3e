#!/usr/bin/env node
/**
 * Kasko Vehicle Extraction Smoke Test
 *
 * Uploads each PDF fixture in tests/fixtures/kasko/ to the production upload
 * endpoint, polls Supabase for the resulting policy row (≤ 30s), and asserts
 * vehicleInfo.make / .model are populated and match an expected value declared
 * per fixture. Prints per-fixture pass/fail with extracted values, then a
 * summary pass rate. Exits 0 if pass rate ≥ 80, else 1.
 *
 * Required env vars:
 *   SUPABASE_URL          — Supabase project URL
 *   SUPABASE_SERVICE_KEY  — service-role key (bypasses RLS for the poll)
 *   SMOKE_UPLOAD_URL      — full URL of the upload endpoint
 *   SMOKE_AUTH_TOKEN      — Bearer token sent on the upload request
 *
 * Exit codes:
 *   0  pass rate ≥ PASS_THRESHOLD
 *   1  pass rate < PASS_THRESHOLD
 *   2  setup error (missing env, no fixtures, manifest unparseable)
 *
 * See tests/fixtures/kasko/README.md for fixture conventions.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const PASS_THRESHOLD = 80
const POLL_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 2_000
const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')

interface Fixture {
  file: string
  expectedMake: string
  expectedModel?: string
  insurer: string
  notes?: string
}

interface FixturesManifest {
  fixtures: Fixture[]
}

interface ExtractedValues {
  make: string
  model: string
  confidence: number
}

interface FixtureResult {
  fixture: Fixture
  status: 'pass' | 'fail'
  reason?: string
  extracted?: ExtractedValues
}

function exitSetupError(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(2)
}

function envOrFail(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) exitSetupError(`Missing env var: ${name}`)
  return v
}

function loadFixtures(): Fixture[] {
  if (!fs.existsSync(FIXTURES_DIR)) {
    exitSetupError(
      `Fixture directory not found: ${FIXTURES_DIR}\n` +
        `  Create it and add PDFs per tests/fixtures/kasko/README.md.`
    )
  }
  const manifestPath = path.join(FIXTURES_DIR, 'fixtures.json')
  if (!fs.existsSync(manifestPath)) {
    exitSetupError(
      `Manifest not found: ${manifestPath}\n` +
        `  See tests/fixtures/kasko/README.md for the format.`
    )
  }
  let manifest: FixturesManifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    exitSetupError(
      `Failed to parse fixtures.json: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) {
    exitSetupError('fixtures.json has no fixtures. Add at least one entry.')
  }

  const present: Fixture[] = []
  const missing: string[] = []
  for (const f of manifest.fixtures) {
    if (!f.file || !f.expectedMake || !f.insurer) {
      console.warn(`⚠ Skipping malformed fixture entry: ${JSON.stringify(f)}`)
      continue
    }
    const pdfPath = path.join(FIXTURES_DIR, f.file)
    if (fs.existsSync(pdfPath)) {
      present.push(f)
    } else {
      missing.push(f.file)
    }
  }
  if (missing.length > 0) {
    console.warn(`⚠ Skipping ${missing.length} fixture(s) — PDFs missing: ${missing.join(', ')}`)
  }
  if (present.length === 0) {
    exitSetupError(
      `No fixture PDFs found in ${FIXTURES_DIR}.\n` +
        `  fixtures.json references files that don't exist on disk.\n` +
        `  See tests/fixtures/kasko/README.md.`
    )
  }
  return present
}

async function uploadFixture(
  uploadUrl: string,
  authToken: string,
  pdfPath: string,
  uniqueName: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const buffer = fs.readFileSync(pdfPath)
  const form = new FormData()
  const blob = new Blob([buffer], { type: 'application/pdf' })
  form.append('file', blob, uniqueName)
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}

async function pollForRow(
  supabase: SupabaseClient,
  uniqueFilenamePart: string,
  startMs: number
): Promise<Record<string, unknown> | null> {
  const deadline = startMs + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('policies')
      .select('id, raw_data, created_at')
      .eq('type', 'kasko')
      .gte('created_at', new Date(startMs - 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    if (!error && Array.isArray(data)) {
      const match = data.find((r) => {
        const raw = r.raw_data as Record<string, unknown> | null
        const fn = raw && typeof raw === 'object' ? raw.fileName : null
        return typeof fn === 'string' && fn.includes(uniqueFilenamePart)
      })
      if (match) return match as Record<string, unknown>
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return null
}

function checkExtraction(row: Record<string, unknown>, fixture: Fixture): FixtureResult {
  const raw = (row.raw_data as Record<string, unknown> | null) ?? {}
  const vi = (raw.vehicleInfo as Record<string, unknown> | null) ?? {}
  const make = typeof vi.make === 'string' ? vi.make : ''
  const model = typeof vi.model === 'string' ? vi.model : ''
  const confidenceRaw = raw.aiConfidence
  const confidence = typeof confidenceRaw === 'number' ? confidenceRaw : 0
  const extracted: ExtractedValues = { make, model, confidence }

  if (!make.trim()) {
    return { fixture, status: 'fail', reason: 'vehicleInfo.make is empty', extracted }
  }
  if (!model.trim()) {
    return { fixture, status: 'fail', reason: 'vehicleInfo.model is empty', extracted }
  }
  if (!make.toLowerCase().includes(fixture.expectedMake.toLowerCase())) {
    return {
      fixture,
      status: 'fail',
      reason: `make mismatch: expected "${fixture.expectedMake}", got "${make}"`,
      extracted,
    }
  }
  if (fixture.expectedModel && !model.toLowerCase().includes(fixture.expectedModel.toLowerCase())) {
    return {
      fixture,
      status: 'fail',
      reason: `model mismatch: expected "${fixture.expectedModel}", got "${model}"`,
      extracted,
    }
  }
  return { fixture, status: 'pass', extracted }
}

async function main(): Promise<void> {
  console.log('► Kasko vehicle extraction smoke test')
  const supabaseUrl = envOrFail('SUPABASE_URL')
  const supabaseKey = envOrFail('SUPABASE_SERVICE_KEY')
  const uploadUrl = envOrFail('SMOKE_UPLOAD_URL')
  const authToken = envOrFail('SMOKE_AUTH_TOKEN')

  const fixtures = loadFixtures()
  console.log(`► Loaded ${fixtures.length} fixture(s) from ${FIXTURES_DIR}`)
  console.log(`► Pass threshold: ${PASS_THRESHOLD}%, poll timeout: ${POLL_TIMEOUT_MS / 1000}s`)

  const supabase = createClient(supabaseUrl, supabaseKey)
  const results: FixtureResult[] = []

  for (const fixture of fixtures) {
    const pdfPath = path.join(FIXTURES_DIR, fixture.file)
    const smokeId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const uniqueName = `${smokeId}-${fixture.file}`
    const startMs = Date.now()
    console.log(
      `\n┄ ${fixture.insurer} (${fixture.file}) — expecting make ~ "${fixture.expectedMake}"`
    )
    try {
      const upload = await uploadFixture(uploadUrl, authToken, pdfPath, uniqueName)
      if (!upload.ok) {
        const reason = `upload failed: HTTP ${upload.status} — ${upload.body.slice(0, 200)}`
        results.push({ fixture, status: 'fail', reason })
        console.log(`  ✗ ${reason}`)
        continue
      }
      const row = await pollForRow(supabase, smokeId, startMs)
      if (!row) {
        const reason = `no policy row appeared in ${POLL_TIMEOUT_MS / 1000}s (filtered by raw_data.fileName containing "${smokeId}")`
        results.push({ fixture, status: 'fail', reason })
        console.log(`  ✗ ${reason}`)
        continue
      }
      const result = checkExtraction(row, fixture)
      results.push(result)
      if (result.status === 'pass' && result.extracted) {
        console.log(
          `  ✓ make="${result.extracted.make}" model="${result.extracted.model}" confidence=${result.extracted.confidence.toFixed(2)}`
        )
      } else {
        console.log(`  ✗ ${result.reason}`)
        if (result.extracted) {
          console.log(`    extracted: ${JSON.stringify(result.extracted)}`)
        }
      }
    } catch (err) {
      const reason = `exception: ${err instanceof Error ? err.message : String(err)}`
      results.push({ fixture, status: 'fail', reason })
      console.log(`  ✗ ${reason}`)
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length
  const total = results.length
  const passRate = total > 0 ? (passed / total) * 100 : 0
  console.log('\n━ Summary')
  console.log(`  ${passed}/${total} pass (${passRate.toFixed(1)}%)`)
  console.log(`  Threshold: ${PASS_THRESHOLD}% — ${passRate >= PASS_THRESHOLD ? 'PASS' : 'FAIL'}`)

  process.exit(passRate >= PASS_THRESHOLD ? 0 : 1)
}

main().catch((err) => {
  console.error('✗ Fatal error:', err instanceof Error ? err.stack : err)
  process.exit(2)
})
