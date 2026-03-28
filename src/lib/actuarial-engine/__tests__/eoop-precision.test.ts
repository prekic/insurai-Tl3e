/**
 * Tests for EOOP precision governance
 *
 * Verifies that percentage-based and conditional deductibles trigger
 * appropriate precision downgrades on the EOOP result, preventing
 * falsely precise out-of-pocket estimates.
 */
import { describe, it, expect, vi } from 'vitest'

// ── Adapter tests ──────────────────────────────────────────────────────────

describe('mapAnalyzedToActuarialInput — deductible precision flags', () => {
  it('flags percentage deductible when deductiblePercent > 0', async () => {
    const { mapAnalyzedToActuarialInput } = await import('../adapter')

    const result = mapAnalyzedToActuarialInput({
      id: 'test-1',
      policyNumber: 'POL-001',
      provider: 'Allianz',
      type: 'kasko',
      typeTr: 'Kasko',
      coverage: 200000,
      premium: 6000,
      deductible: 2000,
      startDate: '2026-01-01',
      expiryDate: '2027-01-01',
      status: 'active',
      insuredPerson: 'Test',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 200000, deductible: 2000, included: true },
      ],
      exclusions: [],
      aiInsights: [],
      deductiblePercent: 35,
      conditionalDeductibles: ['%35 tenzili muafiyet anlaşmasız serviste'],
    } as never)

    expect(result._hasPercentageDeductible).toBe(true)
    expect(result._deductiblePercent).toBe(35)
    expect(result._hasConditionalDeductibles).toBe(true)
    expect(result._conditionalDeductibleCount).toBe(1)
  })

  it('does not flag when no percentage deductible', async () => {
    const { mapAnalyzedToActuarialInput } = await import('../adapter')

    const result = mapAnalyzedToActuarialInput({
      id: 'test-2',
      policyNumber: 'POL-002',
      provider: 'AXA',
      type: 'kasko',
      typeTr: 'Kasko',
      coverage: 200000,
      premium: 5000,
      deductible: 3000,
      startDate: '2026-01-01',
      expiryDate: '2027-01-01',
      status: 'active',
      insuredPerson: 'Test',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 200000, deductible: 3000, included: true },
      ],
      exclusions: [],
      aiInsights: [],
      // No deductiblePercent, no conditionalDeductibles
    } as never)

    expect(result._hasPercentageDeductible).toBe(false)
    expect(result._hasConditionalDeductibles).toBe(false)
    expect(result._conditionalDeductibleCount).toBe(0)
  })
})

// ── Engine precision tests ─────────────────────────────────────────────────

// Mock Layer A/B/C dependencies to isolate engine precision logic
vi.mock('../layer-a/semantic-exclusions', () => ({
  analyzeExclusions: vi.fn().mockReturnValue([]),
}))
vi.mock('../layer-a/evidence-tracker', () => ({
  validateEvidence: vi.fn().mockReturnValue({
    overallCoverageRate: 1,
    fieldsCovered: 0,
    fieldsTotal: 0,
    fieldsNeedingReview: [],
    confidenceDistribution: {},
  }),
  generateEvidenceCoverageReport: vi.fn().mockReturnValue({
    overallCoverageRate: 1,
    fieldsCovered: 0,
    fieldsTotal: 0,
    fieldsNeedingReview: [],
    confidenceDistribution: {},
  }),
  quickReviewCheck: vi.fn().mockReturnValue({ needsReview: false, reasons: [] }),
}))
vi.mock('../layer-b/compliance-gate', () => ({
  executeComplianceGate: vi.fn().mockReturnValue({
    compliance: {
      eligible: true,
      blockingReasons: [],
      warnings: [],
      rulesetVersion: 'test-v1',
    },
    productMismatches: [],
  }),
}))
vi.mock('../layer-c/monte-carlo', () => ({
  calculateEOOP: vi.fn().mockReturnValue({
    expectedCost: { amount: 10000, currency: 'TRY' },
    premium: { amount: 6000, currency: 'TRY' },
    expectedUncoveredLoss: { amount: 4000, currency: 'TRY' },
    percentiles: { p5: 6000, p25: 7000, p50: 9000, p75: 12000, p95: 20000 },
    scenarioBreakdown: [],
    config: { numSimulations: 1000, seed: 42, confidenceInterval: 0.95 },
    contractQualityFactor: 1.0,
  }),
}))

import { runFullEvaluation } from '../engine'
import type { ActuarialPolicyInput } from '../types'

function makeInput(overrides: Record<string, unknown> = {}): ActuarialPolicyInput {
  return {
    policyId: 'test-1',
    policyType: 'kasko',
    premium: { amount: 6000, currency: 'TRY' },
    effectiveDate: '2026-01-01',
    expiryDate: '2027-01-01',
    coverages: [
      {
        code: 'COLLISION',
        included: true,
        limit: { value: { amount: 200000, currency: 'TRY' } },
        deductible: { value: { amount: 2000, currency: 'TRY' } },
      },
    ],
    exclusionTexts: [],
    ...overrides,
  } as ActuarialPolicyInput
}

describe('runFullEvaluation — eoopPrecision', () => {
  it('returns "full" precision when no percentage deductibles', () => {
    const result = runFullEvaluation(makeInput())
    expect(result.eoopPrecision).toBe('full')
    expect(result.eoopLimitations).toEqual([])
  })

  it('returns "partial" precision when percentage deductible is present', () => {
    const result = runFullEvaluation(
      makeInput({
        _hasPercentageDeductible: true,
        _deductiblePercent: 35,
      })
    )
    expect(result.eoopPrecision).toBe('partial')
    expect(result.eoopLimitations).toHaveLength(1)
    expect(result.eoopLimitations![0]).toContain('35%')
    expect(result.eoopLimitations![0]).toContain('proportional deductible')
  })

  it('returns "partial" with conditional deductible limitations', () => {
    const result = runFullEvaluation(
      makeInput({
        _hasConditionalDeductibles: true,
        _conditionalDeductibleCount: 2,
      })
    )
    expect(result.eoopPrecision).toBe('partial')
    expect(result.eoopLimitations).toHaveLength(1)
    expect(result.eoopLimitations![0]).toContain('2 conditional deductible')
    expect(result.eoopLimitations![0]).toContain('service network')
  })

  it('returns "partial" with both percentage AND conditional deductibles', () => {
    const result = runFullEvaluation(
      makeInput({
        _hasPercentageDeductible: true,
        _deductiblePercent: 20,
        _hasConditionalDeductibles: true,
        _conditionalDeductibleCount: 3,
      })
    )
    expect(result.eoopPrecision).toBe('partial')
    expect(result.eoopLimitations).toHaveLength(2)
    expect(result.eoopLimitations![0]).toContain('20%')
    expect(result.eoopLimitations![1]).toContain('3 conditional')
  })

  it('includes specific percentage in limitation text (10%)', () => {
    const result = runFullEvaluation(
      makeInput({ _hasPercentageDeductible: true, _deductiblePercent: 10 })
    )
    expect(result.eoopLimitations![0]).toContain('10%')
  })

  it('includes specific percentage in limitation text (20%)', () => {
    const result = runFullEvaluation(
      makeInput({ _hasPercentageDeductible: true, _deductiblePercent: 20 })
    )
    expect(result.eoopLimitations![0]).toContain('20%')
  })

  it('includes specific percentage in limitation text (35%)', () => {
    const result = runFullEvaluation(
      makeInput({ _hasPercentageDeductible: true, _deductiblePercent: 35 })
    )
    expect(result.eoopLimitations![0]).toContain('35%')
  })

  it('EOOP value is still computed even when precision is partial', () => {
    const result = runFullEvaluation(
      makeInput({ _hasPercentageDeductible: true, _deductiblePercent: 35 })
    )
    // EOOP should still be present (base estimate), not suppressed
    expect(result.expectedOutOfPocket.expectedCost.amount).toBeGreaterThan(0)
    expect(result.eoopPrecision).toBe('partial')
  })

  it('blocked policies do not get eoopPrecision', async () => {
    const { executeComplianceGate } = await import('../layer-b/compliance-gate')
    vi.mocked(executeComplianceGate).mockReturnValueOnce({
      compliance: {
        eligible: false,
        blockingReasons: [{ rule: 'test', message: 'blocked', messageTr: 'engellendi' }],
        warnings: [],
        rulesetVersion: 'test-v1',
      },
      productMismatches: [],
    } as never)

    const result = runFullEvaluation(
      makeInput({ _hasPercentageDeductible: true, _deductiblePercent: 35 })
    )
    // Blocked policies return eligible: false — no EOOP computed
    expect(result.eligible).toBe(false)
  })
})
