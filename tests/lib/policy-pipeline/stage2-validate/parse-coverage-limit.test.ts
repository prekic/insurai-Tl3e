import { describe, expect, it } from 'vitest'
import { parseCoverageLimit } from '../../../../src/lib/policy-pipeline/stage2-validate/parse-coverage-limit'

describe('parseCoverageLimit', () => {
  it('returns unlimited if isUnlimited is true', () => {
    expect(parseCoverageLimit(1000, true, false)).toEqual({ type: 'unlimited' })
    expect(parseCoverageLimit(null, true, null)).toEqual({ type: 'unlimited' })
  })

  it('returns market_value if isMarketValue is true', () => {
    expect(parseCoverageLimit(1000, false, true)).toEqual({ type: 'market_value' })
    expect(parseCoverageLimit(null, null, true)).toEqual({ type: 'market_value' })
  })

  it('returns numeric if limit is a positive number', () => {
    expect(parseCoverageLimit(1500, false, false)).toEqual({ type: 'numeric', amount: 1500 })
  })

  it('prioritizes unlimited over market_value over numeric', () => {
    expect(parseCoverageLimit(1000, true, true)).toEqual({ type: 'unlimited' })
  })

  it('returns unknown if nothing matches', () => {
    expect(parseCoverageLimit(null, null, null)).toEqual({ type: 'unknown' })
    expect(parseCoverageLimit(0, false, false)).toEqual({ type: 'unknown' })
    expect(parseCoverageLimit(undefined, undefined, undefined)).toEqual({ type: 'unknown' })
  })
})
