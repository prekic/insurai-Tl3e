/**
 * Policy Flow Integration Tests
 *
 * Tests for policy data structures and validation.
 */

import { describe, it, expect } from 'vitest'
import type { Policy, Coverage, PolicyGap } from '@/types/policy'

const mockPolicy: Policy = {
  id: 'test-policy-1',
  policyNumber: 'POL-2024-001',
  type: 'home',
  provider: 'Test Sigorta',
  premium: 5000,
  startDate: '2024-01-01',
  endDate: '2025-01-01',
  status: 'active',
  coverages: [
    {
      id: 'cov-1',
      type: 'Yangın Sigortası',
      limit: 1000000,
      deductible: 5000,
      description: 'Fire coverage',
    },
  ],
  gaps: [],
  riskScore: 75,
  insuredParty: {
    name: 'Test User',
    tcNumber: '12345678901',
    address: 'Test Address, Istanbul',
  },
}

describe('Policy Data Structures', () => {
  describe('Policy Types', () => {
    it('should support home policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'home' }
      expect(policy.type).toBe('home')
    })

    it('should support auto policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'auto' }
      expect(policy.type).toBe('auto')
    })

    it('should support life policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'life' }
      expect(policy.type).toBe('life')
    })

    it('should support health policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'health' }
      expect(policy.type).toBe('health')
    })

    it('should support business policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'business' }
      expect(policy.type).toBe('business')
    })
  })

  describe('Policy Status', () => {
    it('should support active status', () => {
      const policy: Policy = { ...mockPolicy, status: 'active' }
      expect(policy.status).toBe('active')
    })

    it('should support expired status', () => {
      const policy: Policy = { ...mockPolicy, status: 'expired' }
      expect(policy.status).toBe('expired')
    })

    it('should support pending status', () => {
      const policy: Policy = { ...mockPolicy, status: 'pending' }
      expect(policy.status).toBe('pending')
    })

    it('should support cancelled status', () => {
      const policy: Policy = { ...mockPolicy, status: 'cancelled' }
      expect(policy.status).toBe('cancelled')
    })
  })

  describe('Coverage Data', () => {
    it('should have required coverage fields', () => {
      const coverage: Coverage = mockPolicy.coverages[0]
      expect(coverage.id).toBeDefined()
      expect(coverage.type).toBeDefined()
      expect(coverage.limit).toBeDefined()
    })

    it('should support multiple coverages', () => {
      const policy: Policy = {
        ...mockPolicy,
        coverages: [
          { id: 'cov-1', type: 'Fire', limit: 1000000, deductible: 5000, description: 'Fire coverage' },
          { id: 'cov-2', type: 'Theft', limit: 500000, deductible: 2500, description: 'Theft coverage' },
          { id: 'cov-3', type: 'Natural Disaster', limit: 2000000, deductible: 10000, description: 'Natural disaster coverage' },
        ],
      }
      expect(policy.coverages).toHaveLength(3)
    })
  })

  describe('Policy Gaps', () => {
    it('should handle policies without gaps', () => {
      const policy: Policy = { ...mockPolicy, gaps: [] }
      expect(policy.gaps).toHaveLength(0)
    })

    it('should handle policies with gaps', () => {
      const gaps: PolicyGap[] = [
        {
          id: 'gap-1',
          type: 'coverage',
          severity: 'high',
          description: 'Missing flood coverage',
          recommendation: 'Add flood insurance',
        },
        {
          id: 'gap-2',
          type: 'limit',
          severity: 'medium',
          description: 'Low coverage limit',
          recommendation: 'Increase coverage',
        },
      ]
      const policy: Policy = { ...mockPolicy, gaps }
      expect(policy.gaps).toHaveLength(2)
    })

    it('should support different gap severities', () => {
      const highGap: PolicyGap = {
        id: 'gap-high',
        type: 'coverage',
        severity: 'high',
        description: 'Critical gap',
        recommendation: 'Fix immediately',
      }
      const mediumGap: PolicyGap = {
        id: 'gap-medium',
        type: 'limit',
        severity: 'medium',
        description: 'Moderate gap',
        recommendation: 'Consider fixing',
      }
      const lowGap: PolicyGap = {
        id: 'gap-low',
        type: 'exclusion',
        severity: 'low',
        description: 'Minor gap',
        recommendation: 'Optional fix',
      }

      expect(highGap.severity).toBe('high')
      expect(mediumGap.severity).toBe('medium')
      expect(lowGap.severity).toBe('low')
    })
  })

  describe('Risk Score', () => {
    it('should have a risk score between 0 and 100', () => {
      expect(mockPolicy.riskScore).toBeGreaterThanOrEqual(0)
      expect(mockPolicy.riskScore).toBeLessThanOrEqual(100)
    })

    it('should support different risk levels', () => {
      const lowRisk: Policy = { ...mockPolicy, riskScore: 25 }
      const mediumRisk: Policy = { ...mockPolicy, riskScore: 50 }
      const highRisk: Policy = { ...mockPolicy, riskScore: 85 }

      expect(lowRisk.riskScore).toBeLessThan(40)
      expect(mediumRisk.riskScore).toBeGreaterThanOrEqual(40)
      expect(mediumRisk.riskScore).toBeLessThan(70)
      expect(highRisk.riskScore).toBeGreaterThanOrEqual(70)
    })
  })

  describe('Insured Party', () => {
    it('should have insured party information', () => {
      expect(mockPolicy.insuredParty).toBeDefined()
      expect(mockPolicy.insuredParty?.name).toBe('Test User')
      expect(mockPolicy.insuredParty?.tcNumber).toBe('12345678901')
      expect(mockPolicy.insuredParty?.address).toContain('Istanbul')
    })
  })

  describe('Turkish Insurance Terms', () => {
    it('should support Turkish coverage types', () => {
      const turkishCoverages = [
        'Yangın Sigortası',
        'Kasko',
        'Trafik Sigortası',
        'DASK',
        'Ferdi Kaza',
      ]

      turkishCoverages.forEach((coverageType) => {
        const coverage: Coverage = {
          id: `cov-${coverageType}`,
          type: coverageType,
          limit: 1000000,
          deductible: 5000,
          description: `${coverageType} coverage`,
        }
        expect(coverage.type).toBe(coverageType)
      })
    })

    it('should handle Turkish characters in policy data', () => {
      const policy: Policy = {
        ...mockPolicy,
        provider: 'Türkiye Sigorta',
        insuredParty: {
          name: 'Müşteri Özel',
          tcNumber: '12345678901',
          address: 'İstanbul, Şişli, Güneşli',
        },
      }

      expect(policy.provider).toBe('Türkiye Sigorta')
      expect(policy.insuredParty?.name).toContain('ü')
      expect(policy.insuredParty?.address).toContain('İ')
      expect(policy.insuredParty?.address).toContain('Ş')
    })
  })
})
