import { describe, it, expect, vi } from 'vitest'
import { runStage2Validation } from '../../../../src/lib/policy-pipeline/stage2-validate/orchestrator'

// Mock the dependencies
vi.mock('../../../../src/lib/policy-pipeline/stage2-validate/derive-entity-type', () => ({
  deriveEntityType: vi.fn((val) => (val.length === 11 ? 'INDIVIDUAL' : 'CORPORATE')),
}))

vi.mock('../../../../src/lib/policy-pipeline/stage2-validate/normalize-text', () => ({
  normalizeCoverageLabel: vi.fn((val) => val.toLowerCase().trim()),
}))

vi.mock('../../../../src/lib/policy-pipeline/stage2-validate/canonicalize-coverage', () => ({
  canonicalizeCoverage: vi.fn((val) => {
    if (val === 'cam') return 'GLASS_COVERAGE'
    throw new Error('Unknown')
  }),
}))

vi.mock('../../../../src/lib/policy-pipeline/stage2-validate/parse-coverage-limit', () => ({
  parseCoverageLimit: vi.fn((_val) => ({ type: 'MONETARY', amount: 1000, currency: 'TRY' })),
}))

describe('runStage2Validation', () => {
  it('should return null or non-objects unmodified', () => {
    expect(runStage2Validation(null)).toBeNull()
    expect(runStage2Validation('string')).toBe('string')
  })

  it('should derive entityType from identityNumber or taxNumber', () => {
    const data1 = { identityNumber: '12345678901' }
    const result1 = runStage2Validation(data1)
    expect(result1.entityType).toBe('INDIVIDUAL')

    const data2 = { insured: { identityNumber: '1234567890' } }
    const result2 = runStage2Validation(data2)
    expect(result2.entityType).toBe('CORPORATE')
  })

  it('should canonicalize coverages and parse limits', () => {
    const data = {
      coverages: [{ name: 'CAM', limit: '1000 TL' }, { name: 'Unknown Coverage' }, null],
    }
    const result = runStage2Validation(data)

    expect(result.coverages[0].normalizedName).toBe('cam')
    expect(result.coverages[0].canonicalName).toBe('GLASS_COVERAGE')
    expect(result.coverages[0].parsedLimit).toEqual({
      type: 'MONETARY',
      amount: 1000,
      currency: 'TRY',
    })

    expect(result.coverages[1].normalizedName).toBe('unknown coverage')
    expect(result.coverages[1].canonicalName).toBe('UNKNOWN')
    expect(result.coverages[1].parsedLimit).toBeUndefined()

    expect(result.coverages[2]).toBeNull()
  })

  it('should not overwrite existing entityType', () => {
    const data = { entityType: 'CORPORATE', identityNumber: '12345678901' }
    const result = runStage2Validation(data)
    expect(result.entityType).toBe('CORPORATE')
  })
})
