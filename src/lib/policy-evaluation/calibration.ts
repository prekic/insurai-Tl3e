/**
 * Grade threshold calibration — pure computation functions.
 *
 * No Vite deps, no DB deps. Designed for use by both the CLI calibration
 * script and unit tests.
 */
import type { GradeThresholds } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreDistribution {
  count: number
  min: number
  max: number
  mean: number
  median: number
  stddev: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export interface RecommendedThresholds {
  gradeAThreshold: number // p90
  gradeBThreshold: number // p75
  gradeCThreshold: number // p50
  gradeDThreshold: number // p25
}

export interface ThresholdComparison {
  grade: 'A' | 'B' | 'C' | 'D'
  current: number
  recommended: number
  delta: number
  direction: 'raise' | 'lower' | 'unchanged'
}

export interface SampleSufficiencyResult {
  sufficient: boolean
  count: number
  minRequired: number
  message: string
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

const MIN_SAMPLE_SIZE = 5

/**
 * Compute the p-th percentile of a numeric array using linear interpolation.
 * `p` is in [0, 100]. Returns NaN for empty arrays.
 */
export function computePercentile(scores: number[], p: number): number {
  if (scores.length === 0) return NaN
  const sorted = [...scores].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/**
 * Compute descriptive statistics for an array of scores.
 */
export function computeScoreDistribution(scores: number[]): ScoreDistribution {
  const n = scores.length
  if (n === 0) {
    return {
      count: 0,
      min: NaN,
      max: NaN,
      mean: NaN,
      median: NaN,
      stddev: NaN,
      p10: NaN,
      p25: NaN,
      p50: NaN,
      p75: NaN,
      p90: NaN,
    }
  }

  const sorted = [...scores].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)

  return {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: Math.round(mean * 100) / 100,
    median: computePercentile(scores, 50),
    stddev: Math.round(stddev * 100) / 100,
    p10: computePercentile(scores, 10),
    p25: computePercentile(scores, 25),
    p50: computePercentile(scores, 50),
    p75: computePercentile(scores, 75),
    p90: computePercentile(scores, 90),
  }
}

/**
 * Derive recommended grade thresholds from a score distribution.
 *   A = top 10%  (p90)
 *   B = top 25%  (p75)
 *   C = top 50%  (p50)
 *   D = top 75%  (p25)
 *   F = below D threshold
 *
 * All values are rounded to the nearest integer.
 */
export function computeRecommendedThresholds(scores: number[]): RecommendedThresholds {
  return {
    gradeAThreshold: Math.round(computePercentile(scores, 90)),
    gradeBThreshold: Math.round(computePercentile(scores, 75)),
    gradeCThreshold: Math.round(computePercentile(scores, 50)),
    gradeDThreshold: Math.round(computePercentile(scores, 25)),
  }
}

/**
 * Compare current thresholds against recommended ones.
 */
export function compareThresholds(
  current: GradeThresholds,
  recommended: RecommendedThresholds
): ThresholdComparison[] {
  const grades: Array<{ grade: ThresholdComparison['grade']; key: keyof GradeThresholds }> = [
    { grade: 'A', key: 'gradeAThreshold' },
    { grade: 'B', key: 'gradeBThreshold' },
    { grade: 'C', key: 'gradeCThreshold' },
    { grade: 'D', key: 'gradeDThreshold' },
  ]

  return grades.map(({ grade, key }) => {
    const cur = current[key]
    const rec = recommended[key]
    const delta = rec - cur
    return {
      grade,
      current: cur,
      recommended: rec,
      delta,
      direction: delta > 0 ? 'raise' : delta < 0 ? 'lower' : 'unchanged',
    }
  })
}

/**
 * Check whether the sample size is large enough for reliable calibration.
 */
export function isSampleSufficient(
  count: number,
  minRequired: number = MIN_SAMPLE_SIZE
): SampleSufficiencyResult {
  if (count >= minRequired) {
    return {
      sufficient: true,
      count,
      minRequired,
      message: `Sample size ${count} meets minimum requirement of ${minRequired}.`,
    }
  }
  return {
    sufficient: false,
    count,
    minRequired,
    message: `WARNING: Sample size ${count} is below minimum ${minRequired}. Thresholds derived from this data are unreliable and should NOT be applied.`,
  }
}
