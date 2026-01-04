/**
 * Policy Flow Integration Tests
 *
 * Tests for policy data structures and validation.
 */

import { describe, it, expect } from 'vitest'
import type { Policy, Coverage, AnalyzedPolicy } from '@/types/policy'

const mockCoverage: Coverage = {
  name: 'Fire Insurance',
  nameTr: 'Yangın Sigortası',
  limit: 1000000,
  deductible: 5000,
  included: true,
  description: 'Fire coverage',
}

const mockPolicy: Policy = {
  id: 'test-policy-1',
  policyNumber: 'POL-2024-001',
  type: 'home',
  typeTr: 'Konut Sigortası',
  provider: 'Test Sigorta',
  logo: '/logos/test.png',
  coverage: 1000000,
  premium: 5000,
  monthlyPremium: 416.67,
  deductible: 5000,
  startDate: '2024-01-01',
  expiryDate: '2025-01-01',
  status: 'active',
  uploadDate: '2024-01-01',
  fileName: 'policy.pdf',
  documentType: 'pdf',
  coverages: [mockCoverage],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'property',
}

describe('Policy Data Structures', () => {
  describe('Policy Types', () => {
    it('should support home policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'home' }
      expect(policy.type).toBe('home')
    })

    it('should support kasko policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'kasko' }
      expect(policy.type).toBe('kasko')
    })

    it('should support traffic policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'traffic' }
      expect(policy.type).toBe('traffic')
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

    it('should support dask policy type', () => {
      const policy: Policy = { ...mockPolicy, type: 'dask' }
      expect(policy.type).toBe('dask')
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

    it('should support expiring status', () => {
      const policy: Policy = { ...mockPolicy, status: 'expiring' }
      expect(policy.status).toBe('expiring')
    })
  })

  describe('Coverage Data', () => {
    it('should have required coverage fields', () => {
      const coverage: Coverage = mockPolicy.coverages[0]
      expect(coverage.name).toBeDefined()
      expect(coverage.nameTr).toBeDefined()
      expect(coverage.limit).toBeDefined()
      expect(coverage.deductible).toBeDefined()
      expect(coverage.included).toBeDefined()
    })

    it('should support multiple coverages', () => {
      const policy: Policy = {
        ...mockPolicy,
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 1000000, deductible: 5000, included: true, description: 'Fire coverage' },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 500000, deductible: 2500, included: true, description: 'Theft coverage' },
          { name: 'Natural Disaster', nameTr: 'Doğal Afet', limit: 2000000, deductible: 10000, included: true, description: 'Natural disaster coverage' },
        ],
      }
      expect(policy.coverages).toHaveLength(3)
    })

    it('should support coverages with included false', () => {
      const coverage: Coverage = {
        name: 'Flood',
        nameTr: 'Sel',
        limit: 0,
        deductible: 0,
        included: false,
        description: 'Flood coverage (not included)',
      }
      expect(coverage.included).toBe(false)
    })
  })

  describe('AnalyzedPolicy Gap Analysis', () => {
    const analyzedPolicy: AnalyzedPolicy = {
      ...mockPolicy,
      aiConfidence: 0.95,
      aiInsights: ['Good coverage', 'Competitive pricing'],
      gapAnalysis: {
        overallScore: 25,
        criticalCount: 0,
        highCount: 1,
        totalCount: 2,
        topIssue: 'Missing flood coverage',
        topIssueTr: 'Sel sigortası eksik',
        financialExposure: 50000,
        remediationCost: 1500,
      },
      gapActions: [
        {
          priority: 'high',
          action: 'Add flood insurance',
          actionTr: 'Sel sigortası ekleyin',
          estimatedCost: 1500,
        },
      ],
    }

    it('should handle policies without gaps', () => {
      const policy: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        gapAnalysis: {
          overallScore: 0,
          criticalCount: 0,
          highCount: 0,
          totalCount: 0,
          topIssue: null,
          topIssueTr: null,
          financialExposure: 0,
          remediationCost: 0,
        },
      }
      expect(policy.gapAnalysis?.totalCount).toBe(0)
    })

    it('should handle policies with gap analysis', () => {
      expect(analyzedPolicy.gapAnalysis?.totalCount).toBe(2)
      expect(analyzedPolicy.gapAnalysis?.topIssue).toBe('Missing flood coverage')
    })

    it('should support different gap priorities', () => {
      const gapActions = [
        { priority: 'critical' as const, action: 'Critical gap', actionTr: 'Kritik boşluk', estimatedCost: 5000 },
        { priority: 'high' as const, action: 'High gap', actionTr: 'Yüksek boşluk', estimatedCost: 2000 },
        { priority: 'medium' as const, action: 'Medium gap', actionTr: 'Orta boşluk', estimatedCost: 1000 },
        { priority: 'low' as const, action: 'Low gap', actionTr: 'Düşük boşluk', estimatedCost: 500 },
      ]

      expect(gapActions[0].priority).toBe('critical')
      expect(gapActions[1].priority).toBe('high')
      expect(gapActions[2].priority).toBe('medium')
      expect(gapActions[3].priority).toBe('low')
    })
  })

  describe('Risk Score', () => {
    it('should have a risk score between 0 and 100', () => {
      const policy: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        riskScore: {
          overall: 75,
          level: 'high',
          topIssue: 'Underinsured property',
          confidence: 0.85,
        },
      }
      expect(policy.riskScore?.overall).toBeGreaterThanOrEqual(0)
      expect(policy.riskScore?.overall).toBeLessThanOrEqual(100)
    })

    it('should support different risk levels', () => {
      const veryLowRisk: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        riskScore: { overall: 10, level: 'very_low', topIssue: null, confidence: 0.9 },
      }
      const lowRisk: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        riskScore: { overall: 25, level: 'low', topIssue: null, confidence: 0.85 },
      }
      const moderateRisk: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        riskScore: { overall: 50, level: 'moderate', topIssue: 'Some concerns', confidence: 0.8 },
      }
      const highRisk: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        riskScore: { overall: 75, level: 'high', topIssue: 'Major issues', confidence: 0.75 },
      }
      const veryHighRisk: AnalyzedPolicy = {
        ...mockPolicy,
        aiConfidence: 0.9,
        aiInsights: [],
        riskScore: { overall: 90, level: 'very_high', topIssue: 'Critical issues', confidence: 0.7 },
      }

      expect(veryLowRisk.riskScore?.level).toBe('very_low')
      expect(lowRisk.riskScore?.level).toBe('low')
      expect(moderateRisk.riskScore?.level).toBe('moderate')
      expect(highRisk.riskScore?.level).toBe('high')
      expect(veryHighRisk.riskScore?.level).toBe('very_high')
    })
  })

  describe('Insured Person', () => {
    it('should have insured person information', () => {
      const policy: Policy = {
        ...mockPolicy,
        insuredPerson: 'Test User',
        location: 'Istanbul, Turkey',
      }
      expect(policy.insuredPerson).toBe('Test User')
      expect(policy.location).toContain('Istanbul')
    })
  })

  describe('Turkish Insurance Terms', () => {
    it('should support Turkish coverage names', () => {
      const turkishCoverages: Coverage[] = [
        { name: 'Fire Insurance', nameTr: 'Yangın Sigortası', limit: 1000000, deductible: 5000, included: true },
        { name: 'Comprehensive Auto', nameTr: 'Kasko', limit: 500000, deductible: 2500, included: true },
        { name: 'Traffic Insurance', nameTr: 'Trafik Sigortası', limit: 100000, deductible: 0, included: true },
        { name: 'Earthquake', nameTr: 'DASK', limit: 300000, deductible: 1000, included: true },
        { name: 'Personal Accident', nameTr: 'Ferdi Kaza', limit: 200000, deductible: 500, included: true },
      ]

      turkishCoverages.forEach((coverage) => {
        expect(coverage.nameTr).toBeDefined()
        expect(coverage.nameTr.length).toBeGreaterThan(0)
      })
    })

    it('should handle Turkish characters in policy data', () => {
      const policy: Policy = {
        ...mockPolicy,
        provider: 'Türkiye Sigorta',
        insuredPerson: 'Müşteri Özel',
        location: 'İstanbul, Şişli, Güneşli',
      }

      expect(policy.provider).toBe('Türkiye Sigorta')
      expect(policy.insuredPerson).toContain('ü')
      expect(policy.location).toContain('İ')
      expect(policy.location).toContain('Ş')
    })
  })
})
