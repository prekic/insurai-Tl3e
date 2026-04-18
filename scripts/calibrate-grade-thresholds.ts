/**
 * calibrate-grade-thresholds.ts
 *
 * Reads policy evaluation scores from Supabase and computes percentile-based
 * grade threshold recommendations.
 *
 * Usage:
 *   npx tsx scripts/calibrate-grade-thresholds.ts --dry-run
 *   npx tsx scripts/calibrate-grade-thresholds.ts --dry-run --type=kasko
 *   npx tsx scripts/calibrate-grade-thresholds.ts --apply
 *
 * Flags:
 *   --dry-run         (default) Print report only, write nothing.
 *   --apply           Write recommended thresholds to app_settings.
 *   --type=X          Filter to a specific policy type (e.g., kasko).
 *   --min=N           Override minimum sample size (default: 50).
 *   --force           Allow --apply to proceed below the sample minimum.
 *                     Required for pilot-phase calibration at small n.
 *                     Prints a loud warning and records the event for audit.
 *   --production      Enforce MIN_SAMPLE_SIZE = 50 and reject --force.
 *                     Use once pilot volume is sufficient (post Phase E).
 *   --auto-production Detect whether the sample count has crossed 50 since
 *                     the last forced calibration. If yes, behave as if
 *                     --production was passed (no further action needed).
 *                     If no (still below 50, OR last calibration already
 *                     ran in production mode), exits 0 as a no-op so the
 *                     script can be safely cron-scheduled.
 *
 * Requires .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

import {
  computeScoreDistribution,
  computeRecommendedThresholds,
  compareThresholds,
  isSampleSufficient,
} from '../src/lib/policy-evaluation/calibration'
import { DEFAULT_GRADE_THRESHOLDS } from '../src/lib/policy-evaluation/types'
import type { GradeThresholds } from '../src/lib/policy-evaluation/types'

dotenv.config({ path: '.env' })

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const PRODUCTION_MIN_SAMPLE_SIZE = 50

const args = process.argv.slice(2)
const isApply = args.includes('--apply')
const isDryRun = !isApply // default is dry-run
const isForce = args.includes('--force')
const isAutoProduction = args.includes('--auto-production')
// --production is explicit; --auto-production escalates to it below after probe
let isProduction = args.includes('--production')
const typeArg = args.find((a) => a.startsWith('--type='))
const filterType = typeArg ? typeArg.split('=')[1] : undefined
const minArg = args.find((a) => a.startsWith('--min='))
const requestedMin = minArg ? parseInt(minArg.split('=')[1], 10) : PRODUCTION_MIN_SAMPLE_SIZE
let minSample = isProduction ? PRODUCTION_MIN_SAMPLE_SIZE : requestedMin

if (isProduction && isForce) {
  console.error('ERROR: --production and --force are mutually exclusive.')
  console.error('       --production enforces the sample minimum; --force bypasses it.')
  process.exit(1)
}
if (isAutoProduction && isForce) {
  console.error('ERROR: --auto-production and --force are mutually exclusive.')
  process.exit(1)
}
if (isAutoProduction && isProduction) {
  console.error('ERROR: --auto-production and --production are redundant; pick one.')
  process.exit(1)
}
if (isProduction && requestedMin < PRODUCTION_MIN_SAMPLE_SIZE) {
  console.error(
    `ERROR: --production refuses to lower the sample minimum below ${PRODUCTION_MIN_SAMPLE_SIZE} ` +
      `(requested --min=${requestedMin}).`
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Supabase init (bypasses Vite — uses process.env directly)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ---------------------------------------------------------------------------
// Score extraction from policies
// ---------------------------------------------------------------------------

/**
 * Extract overall evaluation scores from policies.
 * Scores live in raw_data JSONB as raw_data.evaluation.overallScore
 * or can be approximated from policy fields.
 */
async function fetchPolicyScores(): Promise<number[]> {
  let query = supabase.from('policies').select('id, type, premium, coverage, deductible, raw_data')

  if (filterType) {
    query = query.eq('type', filterType)
  }

  const { data: policies, error } = await query

  if (error) {
    console.error('Failed to fetch policies:', error.message)
    process.exit(1)
  }

  if (!policies || policies.length === 0) {
    console.error('No policies found' + (filterType ? ` for type "${filterType}"` : ''))
    process.exit(1)
  }

  console.log(`Found ${policies.length} policies${filterType ? ` (type: ${filterType})` : ''}`)

  const scores: number[] = []

  for (const policy of policies) {
    // Try to read pre-computed evaluation score from raw_data
    const rawData = policy.raw_data as Record<string, unknown> | null
    const evaluation = rawData?.evaluation as Record<string, unknown> | undefined
    const storedScore = evaluation?.overallScore as number | undefined

    if (typeof storedScore === 'number' && storedScore >= 0 && storedScore <= 100) {
      scores.push(storedScore)
      continue
    }

    // Fallback: compute a simplified score from policy fields
    // This is a rough approximation — real evaluatePolicy() uses benchmarks,
    // compliance checks, and weighted scoring. This is intentionally simple
    // to give a directional signal when stored scores are absent.
    const premium = policy.premium as number | null
    const coverage = policy.coverage as number | null
    const deductible = policy.deductible as number | null

    if (premium && premium > 0 && coverage && coverage > 0) {
      // Value ratio: coverage per premium unit, normalized to 0-100 range
      const valueRatio = Math.min(coverage / premium, 100)
      // Deductible penalty: higher deductible = lower score
      const deductiblePenalty = deductible && deductible > 0 ? Math.min(deductible / 1000, 20) : 0
      // Simple score: value ratio scaled, with deductible penalty
      const approxScore = Math.max(0, Math.min(100, valueRatio * 2 - deductiblePenalty))
      scores.push(Math.round(approxScore * 100) / 100)
    }
  }

  return scores
}

// ---------------------------------------------------------------------------
// Read current thresholds from DB
// ---------------------------------------------------------------------------

async function fetchCurrentThresholds(): Promise<GradeThresholds> {
  const thresholds = { ...DEFAULT_GRADE_THRESHOLDS }

  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('category', 'evaluation')
    .in('key', ['grade_a_threshold', 'grade_b_threshold', 'grade_c_threshold', 'grade_d_threshold'])

  if (settings) {
    for (const s of settings) {
      const v = Number(s.value)
      if (!isNaN(v)) {
        if (s.key === 'grade_a_threshold') thresholds.gradeAThreshold = v
        if (s.key === 'grade_b_threshold') thresholds.gradeBThreshold = v
        if (s.key === 'grade_c_threshold') thresholds.gradeCThreshold = v
        if (s.key === 'grade_d_threshold') thresholds.gradeDThreshold = v
      }
    }
  }

  return thresholds
}

// ---------------------------------------------------------------------------
// Apply thresholds to DB
// ---------------------------------------------------------------------------

async function applyThresholds(recommended: GradeThresholds): Promise<void> {
  const updates: Array<{ key: string; value: number }> = [
    { key: 'grade_a_threshold', value: recommended.gradeAThreshold },
    { key: 'grade_b_threshold', value: recommended.gradeBThreshold },
    { key: 'grade_c_threshold', value: recommended.gradeCThreshold },
    { key: 'grade_d_threshold', value: recommended.gradeDThreshold },
  ]

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from('app_settings')
      .update({ value: String(value), updated_at: new Date().toISOString() })
      .eq('category', 'evaluation')
      .eq('key', key)

    if (error) {
      console.error(`Failed to update ${key}:`, error.message)
    } else {
      console.log(`  Updated app_settings[evaluation/${key}] = ${value}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Audit trail — record the last calibration event in app_settings
// ---------------------------------------------------------------------------

interface CalibrationAuditMeta {
  forced: boolean
  minSample: number
  production: boolean
  filterType?: string
}

async function recordCalibrationAudit(
  applied: GradeThresholds,
  sampleCount: number,
  meta: CalibrationAuditMeta
): Promise<void> {
  const audit = {
    appliedAt: new Date().toISOString(),
    sampleCount,
    forced: meta.forced,
    minSample: meta.minSample,
    production: meta.production,
    filterType: meta.filterType ?? 'all',
    thresholds: applied,
  }

  const { error } = await supabase.from('app_settings').upsert(
    {
      category: 'evaluation',
      key: 'grade_thresholds_last_calibrated',
      value: JSON.stringify(audit),
      value_type: 'json',
      description:
        'Audit record of the last grade threshold calibration (timestamp, sample size, mode).',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'category,key' }
  )

  if (error) {
    console.error(`  Audit record write failed (non-fatal): ${error.message}`)
  } else {
    console.log(
      `  Audit recorded: n=${sampleCount}, forced=${meta.forced}, production=${meta.production}`
    )
  }
}

// ---------------------------------------------------------------------------
// --auto-production probe
// ---------------------------------------------------------------------------

/**
 * Returns true when:
 *   - Sample count ≥ PRODUCTION_MIN_SAMPLE_SIZE, AND
 *   - The last recorded calibration audit (if any) was either absent OR
 *     ran with `forced: true` (i.e. pilot-phase). This means the thresholds
 *     on disk were produced under pilot assumptions and should now be
 *     recomputed at production scale.
 *
 * Returns false otherwise (stay pilot / already migrated / below threshold).
 */
async function probeAutoProductionGate(sampleCount: number): Promise<boolean> {
  if (sampleCount < PRODUCTION_MIN_SAMPLE_SIZE) {
    console.log(
      `AUTO-PRODUCTION: sample count ${sampleCount} < ${PRODUCTION_MIN_SAMPLE_SIZE} — no action.`
    )
    return false
  }

  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('category', 'evaluation')
    .eq('key', 'grade_thresholds_last_calibrated')
    .maybeSingle()

  if (!row?.value) {
    console.log(
      'AUTO-PRODUCTION: no prior calibration audit on record — escalating to production mode.'
    )
    return true
  }

  try {
    const prior = JSON.parse(String(row.value)) as { forced?: boolean; production?: boolean }
    if (prior.production === true) {
      console.log('AUTO-PRODUCTION: last calibration already ran in --production mode — no action.')
      return false
    }
    if (prior.forced === true) {
      console.log('AUTO-PRODUCTION: last calibration ran with --force at small n — escalating.')
      return true
    }
    // Unexpected shape (neither forced nor production) — be conservative.
    console.log(
      'AUTO-PRODUCTION: prior audit was neither forced nor production — escalating anyway.'
    )
    return true
  } catch {
    console.log('AUTO-PRODUCTION: could not parse prior audit JSON — escalating.')
    return true
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60))
  console.log('  Grade Threshold Calibration')
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (read-only)' : 'APPLY (will write to DB)'}`)
  if (isAutoProduction) console.log('  Profile: AUTO-PRODUCTION (probing sample count + audit)')
  else if (isProduction) console.log('  Profile: PRODUCTION (min sample = 50, --force disabled)')
  else if (isForce) console.log('  Profile: PILOT (sample minimum override via --force)')
  if (filterType) console.log(`  Filter: type = ${filterType}`)
  console.log(`  Min sample: ${minSample}`)
  console.log('='.repeat(60))
  console.log()

  // 1. Fetch data
  const [scores, currentThresholds] = await Promise.all([
    fetchPolicyScores(),
    fetchCurrentThresholds(),
  ])

  // 1a. --auto-production probe: exit as no-op unless we're at/above the
  // production threshold AND the last calibration ran in force mode.
  if (isAutoProduction) {
    const shouldEscalate = await probeAutoProductionGate(scores.length)
    if (!shouldEscalate) {
      // Safe no-op — script can be cron-scheduled without spamming DB writes.
      process.exit(0)
    }
    // Escalate to production mode for the rest of this run.
    isProduction = true
    minSample = PRODUCTION_MIN_SAMPLE_SIZE
    console.log('AUTO-PRODUCTION: gate crossed — escalating to --production mode for this run.')
    console.log()
  }

  // 2. Check sample sufficiency
  const sufficiency = isSampleSufficient(scores.length, minSample)
  console.log(`Sample: ${sufficiency.message}`)
  console.log()

  // 3. Compute distribution
  const dist = computeScoreDistribution(scores)
  console.log('Score Distribution:')
  console.log(`  Count:  ${dist.count}`)
  console.log(`  Min:    ${dist.min}`)
  console.log(`  Max:    ${dist.max}`)
  console.log(`  Mean:   ${dist.mean}`)
  console.log(`  Median: ${dist.median}`)
  console.log(`  Stddev: ${dist.stddev}`)
  console.log(`  P10:    ${dist.p10}`)
  console.log(`  P25:    ${dist.p25}`)
  console.log(`  P50:    ${dist.p50}`)
  console.log(`  P75:    ${dist.p75}`)
  console.log(`  P90:    ${dist.p90}`)
  console.log()

  // 4. Current thresholds
  console.log('Current Thresholds:')
  console.log(`  A: >= ${currentThresholds.gradeAThreshold}`)
  console.log(`  B: >= ${currentThresholds.gradeBThreshold}`)
  console.log(`  C: >= ${currentThresholds.gradeCThreshold}`)
  console.log(`  D: >= ${currentThresholds.gradeDThreshold}`)
  console.log(`  F: < ${currentThresholds.gradeDThreshold}`)
  console.log()

  // 5. Recommended thresholds
  const recommended = computeRecommendedThresholds(scores)
  console.log('Recommended Thresholds (percentile-based):')
  console.log(`  A: >= ${recommended.gradeAThreshold}  (p90)`)
  console.log(`  B: >= ${recommended.gradeBThreshold}  (p75)`)
  console.log(`  C: >= ${recommended.gradeCThreshold}  (p50)`)
  console.log(`  D: >= ${recommended.gradeDThreshold}  (p25)`)
  console.log(`  F: < ${recommended.gradeDThreshold}`)
  console.log()

  // 6. Comparison
  const comparison = compareThresholds(currentThresholds, recommended)
  console.log('Comparison:')
  for (const c of comparison) {
    const arrow = c.direction === 'raise' ? '↑' : c.direction === 'lower' ? '↓' : '='
    console.log(
      `  Grade ${c.grade}: ${c.current} → ${c.recommended} (${arrow} ${c.delta >= 0 ? '+' : ''}${c.delta})`
    )
  }
  console.log()

  // 7. Apply, warn, or block
  if (!sufficiency.sufficient) {
    if (isApply && !isForce) {
      console.error(
        `ERROR: Sample size ${scores.length} is below minimum ${minSample}. ` +
          `Refusing to --apply without --force.`
      )
      console.error(
        'Either gather more samples, lower --min=N, or pass --force for a pilot-phase override.'
      )
      process.exit(2)
    }
    if (isApply && isForce) {
      console.log(
        `WARNING: Sample size ${scores.length} below minimum ${minSample}. ` +
          `Proceeding because --force was passed (pilot-phase override).`
      )
    }
  }
  if (isDryRun) {
    console.log('DRY RUN complete. No changes written.')
    console.log('To apply: npx tsx scripts/calibrate-grade-thresholds.ts --apply')
  } else {
    console.log('Applying recommended thresholds to app_settings (category: evaluation)...')
    await applyThresholds(recommended)
    await recordCalibrationAudit(recommended, scores.length, {
      forced: isForce,
      minSample,
      production: isProduction,
      filterType,
    })
    console.log()
    console.log('Done. Cache will refresh within 5 minutes (default TTL).')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
