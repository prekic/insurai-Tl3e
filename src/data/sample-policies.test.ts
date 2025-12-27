import { describe, it, expect } from 'vitest'
import { samplePolicies, sampleTurkishKaskoPolicy, allSamplePolicies } from './sample-policies'

describe('Sample Policies Data', () => {
  it('has at least 4 sample policies', () => {
    expect(samplePolicies.length).toBeGreaterThanOrEqual(4)
  })

  it('exports sampleTurkishKaskoPolicy as the first policy', () => {
    expect(sampleTurkishKaskoPolicy).toBe(samplePolicies[0])
    expect(sampleTurkishKaskoPolicy.type).toBe('kasko')
  })

  it('exports allSamplePolicies as the same as samplePolicies', () => {
    expect(allSamplePolicies).toBe(samplePolicies)
  })

  describe('Policy Structure', () => {
    samplePolicies.forEach((policy, index) => {
      describe(`Policy ${index + 1}: ${policy.provider}`, () => {
        it('has required identification fields', () => {
          expect(policy.id).toBeTruthy()
          expect(policy.policyNumber).toBeTruthy()
          expect(policy.provider).toBeTruthy()
        })

        it('has valid coverage and premium values', () => {
          expect(policy.coverage).toBeGreaterThan(0)
          expect(policy.premium).toBeGreaterThan(0)
          expect(policy.monthlyPremium).toBeGreaterThan(0)
          expect(policy.deductible).toBeGreaterThanOrEqual(0)
        })

        it('has valid dates', () => {
          const startDate = new Date(policy.startDate)
          const expiryDate = new Date(policy.expiryDate)
          expect(startDate.getTime()).toBeLessThan(expiryDate.getTime())
        })

        it('has valid status', () => {
          expect(['active', 'expiring', 'expired', 'pending']).toContain(policy.status)
        })

        it('has coverages array with at least one item', () => {
          expect(Array.isArray(policy.coverages)).toBe(true)
          expect(policy.coverages.length).toBeGreaterThan(0)
        })

        it('has AI confidence between 0 and 1', () => {
          expect(policy.aiConfidence).toBeGreaterThanOrEqual(0)
          expect(policy.aiConfidence).toBeLessThanOrEqual(1)
        })

        it('has AI insights array', () => {
          expect(Array.isArray(policy.aiInsights)).toBe(true)
          expect(policy.aiInsights.length).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('Policy Types Coverage', () => {
    it('includes Kasko insurance', () => {
      expect(samplePolicies.some(p => p.type === 'kasko')).toBe(true)
    })

    it('includes Traffic insurance', () => {
      expect(samplePolicies.some(p => p.type === 'traffic')).toBe(true)
    })

    it('includes Home insurance', () => {
      expect(samplePolicies.some(p => p.type === 'home')).toBe(true)
    })

    it('includes Health insurance', () => {
      expect(samplePolicies.some(p => p.type === 'health')).toBe(true)
    })
  })
})
