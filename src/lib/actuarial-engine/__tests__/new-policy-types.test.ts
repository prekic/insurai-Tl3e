/**
 * Unit Tests for Extended Actuarial Engine Coverage (Health, Life, Business)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFullEvaluation } from '../engine'
import { ActuarialPolicyInput } from '../types'

describe('Actuarial Engine - Extended Policy Support', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('correctly evaluates a Health policy with inpatient coverage', () => {
    const healthPolicy: ActuarialPolicyInput = {
      policyId: 'health-test-1',
      policyType: 'health',
      premium: { currency: 'TRY', amount: 8000 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      coverages: [
        { code: 'INPATIENT', included: true, limit: { value: { kind: 'unlimited' } } },
        { code: 'OUTPATIENT', included: true, limit: { value: { currency: 'TRY', amount: 5000 } } },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(healthPolicy)
    expect(result.eligible).toBe(true)
    expect(result.expectedOutOfPocket.scenarioBreakdown).toContainEqual(
      expect.objectContaining({ scenarioCode: 'HOSPITALIZATION_STAY' })
    )
  })

  it('blocks a Health policy missing inpatient coverage', () => {
    const badHealthPolicy: ActuarialPolicyInput = {
      policyId: 'health-test-fail',
      policyType: 'health',
      premium: { currency: 'TRY', amount: 2000 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      coverages: [
        { code: 'OUTPATIENT', included: true, limit: { value: { currency: 'TRY', amount: 1000 } } },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(badHealthPolicy)
    expect(result.eligible).toBe(false)
    expect(result.blockingReasons).toContainEqual(
      expect.objectContaining({ code: 'HEALTH_NO_INPATIENT_COVERAGE' })
    )
  })

  it('correctly evaluates a Life policy', () => {
    const lifePolicy: ActuarialPolicyInput = {
      policyId: 'life-test-1',
      policyType: 'life',
      premium: { currency: 'TRY', amount: 1500 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      coverages: [
        {
          code: 'DEATH_BENEFIT',
          included: true,
          limit: { value: { currency: 'TRY', amount: 1000000 } },
        },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(lifePolicy)
    expect(result.eligible).toBe(true)
    expect(result.expectedOutOfPocket.scenarioBreakdown).toContainEqual(
      expect.objectContaining({ scenarioCode: 'NATURAL_DEATH' })
    )
  })

  it('correctly evaluates a Business policy', () => {
    const businessPolicy: ActuarialPolicyInput = {
      policyId: 'business-test-1',
      policyType: 'business',
      premium: { currency: 'TRY', amount: 15000 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      coverages: [
        { code: 'FIRE', included: true, limit: { value: { currency: 'TRY', amount: 5000000 } } },
        {
          code: 'LIABILITY',
          included: true,
          limit: { value: { currency: 'TRY', amount: 1000000 } },
        },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(businessPolicy)
    expect(result.eligible).toBe(true)
    expect(result.expectedOutOfPocket.scenarioBreakdown).toContainEqual(
      expect.objectContaining({ scenarioCode: 'COMMERCIAL_FIRE' })
    )
  })
})
