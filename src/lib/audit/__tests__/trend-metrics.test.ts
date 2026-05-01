/**
 * Phase 4 — trend-metrics tests.
 *
 * Pure-function tests for `extractMetrics` and `compareMetrics`. Covers
 * empty inputs, the evidence.insights vs aiInsights fallback, regression
 * thresholds, and the small-baseline guard.
 */
import { describe, it, expect } from 'vitest'
import {
  extractMetrics,
  compareMetrics,
  formatDelta,
  TREND_METRIC_KEYS,
  type TrendMetrics,
} from '../trend-metrics'

const ZERO: TrendMetrics = {
  coverages: 0,
  exclusions: 0,
  conditional_deductibles: 0,
  ai_insights: 0,
  supplementary_count: 0,
  bundle_products: 0,
}

describe('extractMetrics', () => {
  it('returns zeros for null / undefined / non-object input', () => {
    expect(extractMetrics(null)).toEqual(ZERO)
    expect(extractMetrics(undefined)).toEqual(ZERO)
    expect(extractMetrics('not an object')).toEqual(ZERO)
    expect(extractMetrics(42)).toEqual(ZERO)
  })

  it('counts top-level array fields', () => {
    const m = extractMetrics({
      coverages: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      exclusions: ['x', 'y'],
      conditionalDeductibles: ['Pert: %35'],
      bundleProducts: ['Genişletilmiş Kasko'],
    })
    expect(m.coverages).toBe(3)
    expect(m.exclusions).toBe(2)
    expect(m.conditional_deductibles).toBe(1)
    expect(m.bundle_products).toBe(1)
  })

  it('reads ai_insights from evidence.insights[]', () => {
    const m = extractMetrics({
      evidence: { insights: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
    })
    expect(m.ai_insights).toBe(3)
  })

  it('falls back to top-level aiInsights[] when evidence.insights absent', () => {
    const m = extractMetrics({ aiInsights: ['a', 'b'] })
    expect(m.ai_insights).toBe(2)
  })

  it('counts supplementary coverages by category field', () => {
    const m = extractMetrics({
      coverages: [
        { name: 'A', category: 'main' },
        { name: 'B', category: 'supplementary' },
        { name: 'C', category: 'supplementary' },
        { name: 'D', category: 'liability' },
        { name: 'E' }, // no category
      ],
    })
    expect(m.coverages).toBe(5)
    expect(m.supplementary_count).toBe(2)
  })

  it('tolerates malformed array members without throwing', () => {
    const m = extractMetrics({
      coverages: [null, undefined, 'string', { name: 'A', category: 'supplementary' }],
    })
    expect(m.coverages).toBe(4)
    expect(m.supplementary_count).toBe(1)
  })
})

describe('compareMetrics', () => {
  it('returns all-pass with current values when baseline is null (first run)', () => {
    const current: TrendMetrics = { ...ZERO, coverages: 5, exclusions: 3 }
    const r = compareMetrics(null, current)
    expect(r.severity).toBe('pass')
    expect(r.flagged).toEqual([])
    expect(r.deltas).toHaveLength(TREND_METRIC_KEYS.length)
    expect(r.deltas.find((d) => d.key === 'coverages')?.current).toBe(5)
  })

  it('passes when current matches or exceeds baseline', () => {
    const baseline: TrendMetrics = { ...ZERO, coverages: 10, ai_insights: 7 }
    const current: TrendMetrics = { ...ZERO, coverages: 12, ai_insights: 7 }
    const r = compareMetrics(baseline, current)
    expect(r.severity).toBe('pass')
  })

  it("warns when a metric drops by ≥30% but <60% (reviewer's 10→7 case)", () => {
    const baseline: TrendMetrics = { ...ZERO, coverages: 10, ai_insights: 10 }
    const current: TrendMetrics = { ...ZERO, coverages: 10, ai_insights: 6 }
    const r = compareMetrics(baseline, current)
    expect(r.severity).toBe('warn')
    expect(r.flagged).toHaveLength(1)
    expect(r.flagged[0].key).toBe('ai_insights')
    expect(r.flagged[0].severity).toBe('warn')
  })

  it("emits critical when a metric drops by ≥60% (reviewer's 10→3 case)", () => {
    const baseline: TrendMetrics = { ...ZERO, coverages: 10, ai_insights: 10 }
    const current: TrendMetrics = { ...ZERO, coverages: 10, ai_insights: 3 }
    const r = compareMetrics(baseline, current)
    expect(r.severity).toBe('critical')
    expect(r.flagged[0].severity).toBe('critical')
  })

  it('overall severity is the worst across all 6 metrics', () => {
    const baseline: TrendMetrics = {
      coverages: 10,
      exclusions: 10,
      conditional_deductibles: 10,
      ai_insights: 10,
      supplementary_count: 10,
      bundle_products: 10,
    }
    // ai_insights drops to critical, exclusions drops to warn, others pass
    const current: TrendMetrics = {
      coverages: 10,
      exclusions: 6, // -40% → warn
      conditional_deductibles: 10,
      ai_insights: 2, // -80% → critical
      supplementary_count: 10,
      bundle_products: 10,
    }
    const r = compareMetrics(baseline, current)
    expect(r.severity).toBe('critical')
    expect(r.flagged.map((d) => d.key).sort()).toEqual(['ai_insights', 'exclusions'])
  })

  it('does NOT flag drops when baseline is below minBaseline=3', () => {
    const baseline: TrendMetrics = { ...ZERO, ai_insights: 2 }
    const current: TrendMetrics = { ...ZERO, ai_insights: 0 }
    // 100% drop, but baseline=2 < minBaseline=3 → suppressed
    const r = compareMetrics(baseline, current)
    expect(r.severity).toBe('pass')
  })

  it('respects custom thresholds', () => {
    const baseline: TrendMetrics = { ...ZERO, coverages: 10 }
    const current: TrendMetrics = { ...ZERO, coverages: 9 }
    // 10% drop — below the default 30% warn, but above a custom 5% warn
    const rDefault = compareMetrics(baseline, current)
    expect(rDefault.severity).toBe('pass')
    const rCustom = compareMetrics(baseline, current, { warnDropRatio: 0.05 })
    expect(rCustom.severity).toBe('warn')
  })

  it('passes when baseline is 0 (cannot compute ratio)', () => {
    const baseline: TrendMetrics = ZERO
    const current: TrendMetrics = { ...ZERO, coverages: 5 }
    const r = compareMetrics(baseline, current)
    expect(r.severity).toBe('pass')
  })
})

describe('formatDelta', () => {
  it('renders no-change as "(=)"', () => {
    expect(
      formatDelta({
        key: 'coverages',
        baseline: 10,
        current: 10,
        delta: 0,
        ratio: 0,
        severity: 'pass',
      })
    ).toBe('10 (=)')
  })
  it('renders increase with leading +', () => {
    expect(
      formatDelta({
        key: 'coverages',
        baseline: 10,
        current: 12,
        delta: 2,
        ratio: 0.2,
        severity: 'pass',
      })
    ).toBe('12 (+2)')
  })
  it('renders decrease with leading -', () => {
    expect(
      formatDelta({
        key: 'ai_insights',
        baseline: 10,
        current: 3,
        delta: -7,
        ratio: -0.7,
        severity: 'critical',
      })
    ).toBe('3 (-7)')
  })
})
