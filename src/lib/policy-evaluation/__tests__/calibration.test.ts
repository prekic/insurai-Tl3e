/**
 * WS-4 — Grade Threshold Calibration Pure Functions
 */
import { describe, it, expect } from 'vitest'
import {
  computePercentile,
  computeScoreDistribution,
  computeRecommendedThresholds,
  compareThresholds,
  isSampleSufficient,
} from '../calibration'

// ============================================================================
// computePercentile
// ============================================================================

describe('computePercentile', () => {
  it('returns NaN for empty array', () => {
    expect(computePercentile([], 50)).toBeNaN()
  })

  it('returns the single value for a 1-element array', () => {
    expect(computePercentile([42], 0)).toBe(42)
    expect(computePercentile([42], 50)).toBe(42)
    expect(computePercentile([42], 100)).toBe(42)
  })

  it('returns min at p0 and max at p100', () => {
    const scores = [10, 20, 30, 40, 50]
    expect(computePercentile(scores, 0)).toBe(10)
    expect(computePercentile(scores, 100)).toBe(50)
  })

  it('returns median at p50 for odd-length array', () => {
    expect(computePercentile([10, 20, 30, 40, 50], 50)).toBe(30)
  })

  it('interpolates at p50 for even-length array', () => {
    expect(computePercentile([10, 20, 30, 40], 50)).toBe(25)
  })

  it('handles unsorted input', () => {
    expect(computePercentile([50, 10, 30, 20, 40], 50)).toBe(30)
  })

  it('computes p25 and p75 correctly', () => {
    // [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(computePercentile(scores, 25)).toBeCloseTo(32.5, 1)
    expect(computePercentile(scores, 75)).toBeCloseTo(77.5, 1)
  })

  it('does not mutate the input array', () => {
    const scores = [50, 10, 30]
    computePercentile(scores, 50)
    expect(scores).toEqual([50, 10, 30])
  })
})

// ============================================================================
// computeScoreDistribution
// ============================================================================

describe('computeScoreDistribution', () => {
  it('returns all NaN for empty array', () => {
    const dist = computeScoreDistribution([])
    expect(dist.count).toBe(0)
    expect(dist.min).toBeNaN()
    expect(dist.max).toBeNaN()
    expect(dist.mean).toBeNaN()
  })

  it('computes correct stats for a known dataset', () => {
    const scores = [60, 70, 75, 80, 85, 88, 90, 92, 95, 100]
    const dist = computeScoreDistribution(scores)

    expect(dist.count).toBe(10)
    expect(dist.min).toBe(60)
    expect(dist.max).toBe(100)
    expect(dist.mean).toBe(83.5)
    expect(dist.median).toBe(86.5) // interpolation between 85 and 88
    expect(dist.stddev).toBeGreaterThan(0)
    // p10 of [60,70,75,80,85,88,90,92,95,100] with linear interpolation:
    // idx = 0.1 * 9 = 0.9 → lerp(60, 70, 0.9) = 69
    expect(dist.p10).toBeCloseTo(69, 0)
    // p90: idx = 0.9 * 9 = 8.1 → lerp(95, 100, 0.1) = 95.5
    expect(dist.p90).toBeCloseTo(95.5, 0)
  })

  it('computes correct stats for single-element array', () => {
    const dist = computeScoreDistribution([50])
    expect(dist.count).toBe(1)
    expect(dist.min).toBe(50)
    expect(dist.max).toBe(50)
    expect(dist.mean).toBe(50)
    expect(dist.median).toBe(50)
    expect(dist.stddev).toBe(0)
  })
})

// ============================================================================
// computeRecommendedThresholds
// ============================================================================

describe('computeRecommendedThresholds', () => {
  it('maps percentiles to grade thresholds', () => {
    // Uniform distribution: 1, 2, 3, ..., 100
    const scores = Array.from({ length: 100 }, (_, i) => i + 1)
    const rec = computeRecommendedThresholds(scores)

    // Linear interpolation on [1..100]:
    // p90: idx = 0.9 * 99 = 89.1 → lerp(90, 91, 0.1) ≈ 90.1 → round = 90
    // p75: idx = 0.75 * 99 = 74.25 → lerp(75, 76, 0.25) = 75.25 → round = 75
    // p50: idx = 0.5 * 99 = 49.5 → lerp(50, 51, 0.5) = 50.5 → round = 51
    // p25: idx = 0.25 * 99 = 24.75 → lerp(25, 26, 0.75) = 25.75 → round = 26
    expect(rec.gradeAThreshold).toBe(90)
    expect(rec.gradeBThreshold).toBe(75)
    expect(rec.gradeCThreshold).toBe(51)
    expect(rec.gradeDThreshold).toBe(26)
  })

  it('rounds to nearest integer', () => {
    const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const rec = computeRecommendedThresholds(scores)
    expect(Number.isInteger(rec.gradeAThreshold)).toBe(true)
    expect(Number.isInteger(rec.gradeBThreshold)).toBe(true)
    expect(Number.isInteger(rec.gradeCThreshold)).toBe(true)
    expect(Number.isInteger(rec.gradeDThreshold)).toBe(true)
  })

  it('handles clustered scores', () => {
    // All scores near 80 — thresholds should cluster around 80
    const scores = [78, 79, 80, 80, 81, 82, 80, 79, 81, 80]
    const rec = computeRecommendedThresholds(scores)
    expect(rec.gradeAThreshold).toBeGreaterThanOrEqual(81)
    expect(rec.gradeDThreshold).toBeLessThanOrEqual(80)
  })
})

// ============================================================================
// compareThresholds
// ============================================================================

describe('compareThresholds', () => {
  it('computes deltas and directions correctly', () => {
    const current = {
      gradeAThreshold: 90,
      gradeBThreshold: 80,
      gradeCThreshold: 70,
      gradeDThreshold: 60,
    }
    const recommended = {
      gradeAThreshold: 85,
      gradeBThreshold: 80,
      gradeCThreshold: 75,
      gradeDThreshold: 55,
    }
    const result = compareThresholds(current, recommended)

    expect(result).toHaveLength(4)

    const a = result.find((r) => r.grade === 'A')!
    expect(a.current).toBe(90)
    expect(a.recommended).toBe(85)
    expect(a.delta).toBe(-5)
    expect(a.direction).toBe('lower')

    const b = result.find((r) => r.grade === 'B')!
    expect(b.delta).toBe(0)
    expect(b.direction).toBe('unchanged')

    const c = result.find((r) => r.grade === 'C')!
    expect(c.delta).toBe(5)
    expect(c.direction).toBe('raise')

    const d = result.find((r) => r.grade === 'D')!
    expect(d.delta).toBe(-5)
    expect(d.direction).toBe('lower')
  })
})

// ============================================================================
// isSampleSufficient
// ============================================================================

describe('isSampleSufficient', () => {
  it('returns sufficient for count >= default minimum (50)', () => {
    const result = isSampleSufficient(50)
    expect(result.sufficient).toBe(true)
    expect(result.count).toBe(50)
    expect(result.minRequired).toBe(50)
  })

  it('returns insufficient for count < default minimum', () => {
    const result = isSampleSufficient(49)
    expect(result.sufficient).toBe(false)
    expect(result.message).toContain('WARNING')
    expect(result.message).toContain('49')
  })

  it('accepts custom minimum', () => {
    const result = isSampleSufficient(10, 10)
    expect(result.sufficient).toBe(true)
  })

  it('returns insufficient when custom minimum not met', () => {
    const result = isSampleSufficient(99, 100)
    expect(result.sufficient).toBe(false)
  })

  it('returns sufficient for count = 0 with min = 0', () => {
    const result = isSampleSufficient(0, 0)
    expect(result.sufficient).toBe(true)
  })
})
