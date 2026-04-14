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
 *   --dry-run   (default) Print report only, write nothing.
 *   --apply     Write recommended thresholds to app_settings.
 *   --type=X    Filter to a specific policy type (e.g., kasko).
 *   --min=N     Override minimum sample size (default: 50).
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

const args = process.argv.slice(2)
const isApply = args.includes('--apply')
const isDryRun = !isApply // default is dry-run
const typeArg = args.find((a) => a.startsWith('--type='))
const filterType = typeArg ? typeArg.split('=')[1] : undefined
const minArg = args.find((a) => a.startsWith('--min='))
const minSample = minArg ? parseInt(minArg.split('=')[1], 10) : 50

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
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60))
  console.log('  Grade Threshold Calibration')
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (read-only)' : 'APPLY (will write to DB)'}`)
  if (filterType) console.log(`  Filter: type = ${filterType}`)
  console.log('='.repeat(60))
  console.log()

  // 1. Fetch data
  const [scores, currentThresholds] = await Promise.all([
    fetchPolicyScores(),
    fetchCurrentThresholds(),
  ])

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

  // 7. Apply or warn
  if (!sufficiency.sufficient) {
    console.log(
      'WARNING: Sample size too small for reliable calibration, but proceeding anyway for PILOT.'
    )
  }
  if (isDryRun) {
    console.log('DRY RUN complete. No changes written.')
    console.log('To apply: npx tsx scripts/calibrate-grade-thresholds.ts --apply')
  } else {
    console.log('Applying recommended thresholds to app_settings (category: evaluation)...')
    await applyThresholds(recommended)
    console.log()
    console.log('Done. Cache will refresh within 5 minutes (default TTL).')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
