/**
 * analyze-pilot-results.ts
 *
 * Parses saved pilot JSON output (from GET or POST /api/admin/backfill/pilot)
 * and produces a human-readable summary report.
 *
 * Usage:
 *   npx tsx scripts/analyze-pilot-results.ts pilot_dry_run.json
 *   npx tsx scripts/analyze-pilot-results.ts pilot_write.json
 *   npx tsx scripts/analyze-pilot-results.ts pilot_dry_run.json --format=markdown
 *
 * Input: JSON file saved from the backfill pilot endpoint response.
 * Output: Structured summary to stdout.
 */

import * as fs from 'fs'

const filePath = process.argv[2]
const formatArg = process.argv.find((a) => a.startsWith('--format='))
const _format = formatArg ? formatArg.split('=')[1] : 'text' // reserved for future markdown output

if (!filePath) {
  console.error(
    'Usage: npx tsx scripts/analyze-pilot-results.ts <pilot_output.json> [--format=text|markdown]'
  )
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

interface PilotRecord {
  id: string
  policy_number: string
  type: string
  provider: string
  bucket: string
  current: { insured_person: string | null; start_date: string | null; expiry_date: string | null }
  proposed?: {
    insured_person: string | null
    start_date: string | null
    expiry_date: string | null
    source: string
  }
  deltas?: Array<{ field: string; before: string | null; after: string | null; changed: boolean }>
  legacy_arrays: { coverages: number; exclusions: number; insights: number }
  verification?: {
    legacy_arrays_before: Record<string, number>
    legacy_arrays_after: Record<string, number>
    arrays_stable: boolean
  }
  write_action?: string
  write_error?: string
}

interface PilotData {
  mode: string
  timestamp: string
  total: number
  buckets: Record<string, number>
  records: PilotRecord[]
  write_summary?: {
    attempted: number
    updated: number
    skipped: number
    errors: number
    all_arrays_stable: boolean
  }
  errors: string[]
  warnings: string[]
}

const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
const data: PilotData = raw.data || raw
const out = console.log.bind(console)

function hr() {
  out('─'.repeat(70))
}

// ── Summary ──────────────────────────────────────────────────────────────

out('')
out(`BACKFILL PILOT REPORT — ${data.mode.toUpperCase()}`)
out(`Timestamp: ${data.timestamp}`)
hr()

out('')
out('COHORT SUMMARY')
out(`  Total scanned:          ${data.total}`)
out(`  Modern (no action):     ${data.buckets.modern ?? 0}`)
out(`  Recoverable (raw_data): ${data.buckets.recoverableFromRawData ?? 0}`)
out(`  Requires re-extraction: ${data.buckets.requiresReExtraction ?? 0}`)
out(`  Unrecoverable:          ${data.buckets.unrecoverable ?? 0}`)

if (data.write_summary) {
  out('')
  out('WRITE SUMMARY')
  out(`  Attempted:              ${data.write_summary.attempted}`)
  out(`  Updated:                ${data.write_summary.updated}`)
  out(`  Skipped (no changes):   ${data.write_summary.skipped}`)
  out(`  Errors:                 ${data.write_summary.errors}`)
  out(
    `  All arrays stable:      ${data.write_summary.all_arrays_stable ? '✓ YES' : '✗ NO — INVESTIGATE'}`
  )
}

// ── Record Details ───────────────────────────────────────────────────────

out('')
hr()
out('RECORD DETAILS')
hr()

for (const r of data.records) {
  out('')
  out(`  ID:          ${r.id}`)
  out(`  Policy #:    ${r.policy_number}`)
  out(`  Type:        ${r.type}`)
  out(`  Provider:    ${r.provider}`)
  out(`  Bucket:      ${r.bucket}`)
  out(
    `  Arrays:      cov=${r.legacy_arrays.coverages} excl=${r.legacy_arrays.exclusions} ins=${r.legacy_arrays.insights}`
  )

  if (r.write_action) {
    out(`  Write:       ${r.write_action}${r.write_error ? ' — ' + r.write_error : ''}`)
  }

  if (r.deltas && r.deltas.some((d) => d.changed)) {
    out('  Changes:')
    for (const d of r.deltas.filter((d) => d.changed)) {
      out(`    ${d.field}: '${d.before ?? '(null)'}' → '${d.after ?? '(null)'}'`)
    }
  }

  if (r.verification) {
    const v = r.verification
    out(`  Verification: arrays_stable=${v.arrays_stable ? '✓' : '✗ CRITICAL'}`)
    if (!v.arrays_stable) {
      out(`    BEFORE: ${JSON.stringify(v.legacy_arrays_before)}`)
      out(`    AFTER:  ${JSON.stringify(v.legacy_arrays_after)}`)
    }
  }
}

// ── Warnings & Errors ────────────────────────────────────────────────────

if (data.warnings.length > 0) {
  out('')
  hr()
  out(`WARNINGS (${data.warnings.length})`)
  for (const w of data.warnings) out(`  ⚠ ${w}`)
}

if (data.errors.length > 0) {
  out('')
  hr()
  out(`ERRORS (${data.errors.length})`)
  for (const e of data.errors) out(`  ✗ ${e}`)
}

// ── Safety Checks ────────────────────────────────────────────────────────

out('')
hr()
out('SAFETY CHECKS')

const recoverable = data.records.filter((r) => r.bucket === 'recoverableFromRawData')
const todayStr = new Date().toISOString().slice(0, 10)

const hasFakeDates = recoverable.some(
  (r) => r.proposed?.start_date === todayStr || r.proposed?.expiry_date === todayStr
)
const hasBadInsured = recoverable.some(
  (r) =>
    r.proposed?.insured_person === '-' ||
    r.proposed?.insured_person === '' ||
    r.proposed?.insured_person === 'N/A'
)
const wrongBucketWrites = data.records.filter(
  (r) => r.write_action === 'updated' && r.bucket !== 'recoverableFromRawData'
)
const arrayFailures = data.records.filter((r) => r.verification && !r.verification.arrays_stable)

out(`  Only header fields hydrated?        ${wrongBucketWrites.length === 0 ? '✓ YES' : '✗ NO'}`)
out(
  `  Any legacy arrays changed?          ${arrayFailures.length === 0 ? '✓ NO' : '✗ YES — ' + arrayFailures.length + ' records'}`
)
out(`  Any current-day date fallback?      ${hasFakeDates ? '✗ YES — INVESTIGATE' : '✓ NO'}`)
out(`  Any misleading insured rendering?   ${hasBadInsured ? '✗ YES — INVESTIGATE' : '✓ NO'}`)

const allSafe =
  wrongBucketWrites.length === 0 &&
  arrayFailures.length === 0 &&
  !hasFakeDates &&
  !hasBadInsured &&
  data.errors.filter((e) => e.startsWith('CRITICAL')).length === 0

out('')
out(`RECOMMENDATION: ${allSafe ? 'READY for broader rollout' : 'NOT READY — review issues above'}`)
out('')
