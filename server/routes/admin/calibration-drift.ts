/**
 * Grade-threshold calibration drift monitor.
 *
 * Compares the currently configured grade thresholds (Grade A/B/C/D cutoffs
 * from `app_settings.evaluation.grade_*_threshold`) against the empirical
 * score distribution from recent `policies` rows. Produces a drift report
 * used by the Phase E pre-entry checklist (see
 * docs/runbooks/04-phase-e-production-scaleup.md).
 *
 * Endpoint:
 *   GET /api/admin/monitoring/calibration-drift
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       windowDays: 7,
 *       sampleCount: number,
 *       currentThresholds: { gradeA, gradeB, gradeC, gradeD },
 *       empiricalPercentiles: { p90, p75, p50, p25 },
 *       drifts: { gradeA, gradeB, gradeC, gradeD }, // empirical − threshold
 *       toleranceAbs: 5,
 *       driftExceedsTolerance: boolean,
 *       message?: string,
 *     }
 *   }
 */

import { Router, Response } from 'express'
import { authenticateAdmin, getSupabaseWithError, logger } from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const log = logger.child('AdminCalibrationDrift')
const router = Router()

const WINDOW_DAYS = 7
const TOLERANCE_ABS = 5

const DEFAULT_GRADE_A = 90
const DEFAULT_GRADE_B = 80
const DEFAULT_GRADE_C = 70
const DEFAULT_GRADE_D = 60

const THRESHOLD_KEYS = [
  'grade_a_threshold',
  'grade_b_threshold',
  'grade_c_threshold',
  'grade_d_threshold',
] as const

/**
 * Linear-interpolated percentile — same formula as
 * src/lib/policy-evaluation/calibration.ts:computePercentile().
 * Inlined here to keep the server bundle free of cross-rootDir imports
 * (server/tsconfig.json excludes src/).
 */
function percentile(scores: number[], p: number): number {
  if (scores.length === 0) return NaN
  if (scores.length === 1) return scores[0]
  const sorted = [...scores].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function round2(v: number): number {
  if (!Number.isFinite(v)) return v
  return Math.round(v * 100) / 100
}

router.get(
  '/monitoring/calibration-drift',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const { client: supabase, error: dbError } = getSupabaseWithError()

      if (!supabase) {
        log.warn('Supabase not configured for calibration drift', { error: dbError })
        return res.json({
          success: true,
          data: {
            windowDays: WINDOW_DAYS,
            sampleCount: 0,
            currentThresholds: {
              gradeA: DEFAULT_GRADE_A,
              gradeB: DEFAULT_GRADE_B,
              gradeC: DEFAULT_GRADE_C,
              gradeD: DEFAULT_GRADE_D,
            },
            empiricalPercentiles: { p90: null, p75: null, p50: null, p25: null },
            drifts: { gradeA: null, gradeB: null, gradeC: null, gradeD: null },
            toleranceAbs: TOLERANCE_ABS,
            driftExceedsTolerance: false,
            message: dbError || 'Supabase not configured',
          },
        })
      }

      // 1. Load current thresholds from app_settings.
      const { data: settingsRows, error: settingsErr } = await supabase
        .from('app_settings')
        .select('key, value')
        .eq('category', 'evaluation')
        .in('key', [...THRESHOLD_KEYS])

      if (settingsErr) {
        log.warn('Failed to load evaluation thresholds', { error: settingsErr.message })
      }

      const thresholdMap: Record<string, number> = {
        grade_a_threshold: DEFAULT_GRADE_A,
        grade_b_threshold: DEFAULT_GRADE_B,
        grade_c_threshold: DEFAULT_GRADE_C,
        grade_d_threshold: DEFAULT_GRADE_D,
      }
      for (const row of settingsRows ?? []) {
        // app_settings.value is stored as text; parse defensively.
        const raw = (row as { key: string; value: string }).value
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) {
          thresholdMap[(row as { key: string }).key] = parsed
        }
      }
      const currentThresholds = {
        gradeA: thresholdMap.grade_a_threshold,
        gradeB: thresholdMap.grade_b_threshold,
        gradeC: thresholdMap.grade_c_threshold,
        gradeD: thresholdMap.grade_d_threshold,
      }

      // 2. Load scored policies from the last WINDOW_DAYS days.
      const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { data: policyRows, error: policiesErr } = await supabase
        .from('policies')
        .select('raw_data, created_at')
        .gte('created_at', windowStart)

      if (policiesErr) {
        log.warn('Failed to load scored policies for drift calc', {
          error: policiesErr.message,
        })
        return res.json({
          success: true,
          data: {
            windowDays: WINDOW_DAYS,
            sampleCount: 0,
            currentThresholds,
            empiricalPercentiles: { p90: null, p75: null, p50: null, p25: null },
            drifts: { gradeA: null, gradeB: null, gradeC: null, gradeD: null },
            toleranceAbs: TOLERANCE_ABS,
            driftExceedsTolerance: false,
            message: 'Unable to query policies table (see server logs)',
          },
        })
      }

      // Extract overallScore from each row's raw_data.evaluation.overallScore.
      // Skip rows where the score is missing (not yet evaluated) or non-numeric.
      const scores: number[] = []
      for (const row of policyRows ?? []) {
        const rd = (row as { raw_data?: unknown }).raw_data
        if (!rd || typeof rd !== 'object') continue
        const evaluation = (rd as { evaluation?: unknown }).evaluation
        if (!evaluation || typeof evaluation !== 'object') continue
        const score = (evaluation as { overallScore?: unknown }).overallScore
        const n = Number(score)
        if (Number.isFinite(n)) scores.push(n)
      }

      if (scores.length === 0) {
        return res.json({
          success: true,
          data: {
            windowDays: WINDOW_DAYS,
            sampleCount: 0,
            currentThresholds,
            empiricalPercentiles: { p90: null, p75: null, p50: null, p25: null },
            drifts: { gradeA: null, gradeB: null, gradeC: null, gradeD: null },
            toleranceAbs: TOLERANCE_ABS,
            driftExceedsTolerance: false,
            message:
              'No scored policies in the last ' +
              WINDOW_DAYS +
              ' days. Run scripts/backfill-evaluation-scores.ts if policies exist but raw_data.evaluation is missing.',
          },
        })
      }

      const p90 = percentile(scores, 90)
      const p75 = percentile(scores, 75)
      const p50 = percentile(scores, 50)
      const p25 = percentile(scores, 25)

      const drifts = {
        gradeA: round2(p90 - currentThresholds.gradeA),
        gradeB: round2(p75 - currentThresholds.gradeB),
        gradeC: round2(p50 - currentThresholds.gradeC),
        gradeD: round2(p25 - currentThresholds.gradeD),
      }

      const driftExceedsTolerance = Object.values(drifts).some((d) => Math.abs(d) > TOLERANCE_ABS)

      return res.json({
        success: true,
        data: {
          windowDays: WINDOW_DAYS,
          sampleCount: scores.length,
          currentThresholds,
          empiricalPercentiles: {
            p90: round2(p90),
            p75: round2(p75),
            p50: round2(p50),
            p25: round2(p25),
          },
          drifts,
          toleranceAbs: TOLERANCE_ABS,
          driftExceedsTolerance,
        },
      })
    } catch (err) {
      log.error('Unexpected error computing calibration drift', {
        error: err instanceof Error ? err.message : String(err),
      })
      return res.status(500).json({
        success: false,
        error: 'Internal error computing calibration drift',
      })
    }
  }
)

export default router
