import { describe, it, expect } from 'vitest'
import { compareSnapshots, valuesEqual } from '../services/drift-detection-service.js'
import type { DriftBaseline } from '../services/drift-detection-service.js'

function makeBaseline(snapshot: Record<string, Record<string, unknown>>): DriftBaseline {
  return {
    id: 'baseline-1',
    name: 'Test Baseline',
    snapshot,
    is_active: true,
    created_at: '2026-02-06T10:00:00Z',
  }
}

describe('valuesEqual', () => {
  it('should consider identical values equal', () => {
    expect(valuesEqual(42, 42)).toBe(true)
    expect(valuesEqual('hello', 'hello')).toBe(true)
    expect(valuesEqual(true, true)).toBe(true)
    expect(valuesEqual(null, null)).toBe(true)
  })

  it('should consider different values unequal', () => {
    expect(valuesEqual(42, 43)).toBe(false)
    expect(valuesEqual('hello', 'world')).toBe(false)
    expect(valuesEqual(true, false)).toBe(false)
  })

  it('should handle string-number coercion', () => {
    expect(valuesEqual('42', 42)).toBe(true)
    expect(valuesEqual(42, '42')).toBe(true)
    expect(valuesEqual('0.1', 0.1)).toBe(true)
  })

  it('should not coerce non-numeric strings to numbers', () => {
    expect(valuesEqual('abc', 0)).toBe(false)
  })

  it('should deep-compare objects and arrays', () => {
    expect(valuesEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(valuesEqual([1, 2], [1, 2])).toBe(true)
    expect(valuesEqual([1, 2], [2, 1])).toBe(false)
  })

  it('should treat null and undefined as equal', () => {
    expect(valuesEqual(null, undefined)).toBe(true)
    expect(valuesEqual(undefined, null)).toBe(true)
  })
})

describe('compareSnapshots', () => {
  it('should report no drifts when snapshots match', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1, max_tokens: 4096 },
      ocr: { timeout_seconds: 30 },
    })
    const current = {
      ai: { temperature: 0.1, max_tokens: 4096 },
      ocr: { timeout_seconds: 30 },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.driftedCount).toBe(0)
    expect(report.matchedCount).toBe(3)
    expect(report.totalSettings).toBe(3)
    expect(report.drifts).toHaveLength(0)
  })

  it('should detect changed values', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1, max_tokens: 4096 },
    })
    const current = {
      ai: { temperature: 0.3, max_tokens: 4096 },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.driftedCount).toBe(1)
    expect(report.matchedCount).toBe(1)
    expect(report.drifts).toHaveLength(1)
    expect(report.drifts[0]).toEqual({
      category: 'ai',
      key: 'temperature',
      baselineValue: 0.1,
      currentValue: 0.3,
    })
  })

  it('should detect settings removed since baseline', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1, max_tokens: 4096, old_setting: 'value' },
    })
    const current = {
      ai: { temperature: 0.1, max_tokens: 4096 },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.missingFromCurrent).toBe(1)
    expect(report.drifts.find((d) => d.key === 'old_setting')).toEqual({
      category: 'ai',
      key: 'old_setting',
      baselineValue: 'value',
      currentValue: undefined,
    })
  })

  it('should detect settings added since baseline', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1 },
    })
    const current = {
      ai: { temperature: 0.1, new_setting: 'value' },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.addedSinceBaseline).toBe(1)
    expect(report.drifts.find((d) => d.key === 'new_setting')).toEqual({
      category: 'ai',
      key: 'new_setting',
      baselineValue: undefined,
      currentValue: 'value',
    })
  })

  it('should detect new categories added since baseline', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1 },
    })
    const current = {
      ai: { temperature: 0.1 },
      email: { reminder_days: [30, 14] },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.addedSinceBaseline).toBe(1)
    expect(report.drifts.find((d) => d.category === 'email')).toBeDefined()
  })

  it('should detect categories removed since baseline', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1 },
      email: { reminder_days: [30, 14] },
    })
    const current = {
      ai: { temperature: 0.1 },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.missingFromCurrent).toBe(1)
    expect(report.drifts.find((d) => d.category === 'email')).toBeDefined()
  })

  it('should handle multiple changes across categories', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1, max_tokens: 4096 },
      ocr: { timeout_seconds: 30 },
      evaluation: { weight_premium: 20 },
    })
    const current = {
      ai: { temperature: 0.3, max_tokens: 8192 },
      ocr: { timeout_seconds: 30 },
      evaluation: { weight_premium: 25 },
    }

    const report = compareSnapshots(baseline, current)
    expect(report.driftedCount).toBe(3)
    expect(report.matchedCount).toBe(1) // ocr timeout_seconds
    expect(report.drifts).toHaveLength(3)
  })

  it('should handle string-number coercion in comparison', () => {
    const baseline = makeBaseline({
      ai: { temperature: 0.1 },
    })
    // Database might store number as string
    const current = {
      ai: { temperature: '0.1' as unknown },
    }

    const report = compareSnapshots(baseline, current as Record<string, Record<string, unknown>>)
    expect(report.driftedCount).toBe(0)
  })

  it('should include baseline metadata in report', () => {
    const baseline = makeBaseline({ ai: { temperature: 0.1 } })
    const current = { ai: { temperature: 0.1 } }

    const report = compareSnapshots(baseline, current)
    expect(report.baseline.id).toBe('baseline-1')
    expect(report.baseline.name).toBe('Test Baseline')
    expect(report.checkedAt).toBeTruthy()
  })

  it('should handle empty baseline', () => {
    const baseline = makeBaseline({})
    const current = { ai: { temperature: 0.1 } }

    const report = compareSnapshots(baseline, current)
    expect(report.addedSinceBaseline).toBe(1)
    expect(report.driftedCount).toBe(1)
  })

  it('should handle empty current', () => {
    const baseline = makeBaseline({ ai: { temperature: 0.1 } })
    const current = {}

    const report = compareSnapshots(baseline, current)
    expect(report.missingFromCurrent).toBe(1)
    expect(report.driftedCount).toBe(1)
  })
})
