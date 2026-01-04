/**
 * Feature Extractor Tests
 *
 * Tests for ML feature extraction from analyzed policies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractFeatures, normalizeFeatures } from './feature-extractor'
import type { AnalyzedPolicy } from '@/types/policy'
import type { RiskFeatures } from '@/types/risk'

// Mock MarketDataService
vi.mock('@/lib/market-data/service', () => ({
  MarketDataService: {
    analyzePolicyBenchmark: vi.fn(() => ({
      premiumVsAverage: 10,
      premiumPercentile: 65,
    })),
  },
}))

// Mock region detector
vi.mock('@/lib/market-data/region-detector', () => ({
  detectRegionFromAddress: vi.fn((address: string) => {
    if (address?.toLowerCase().includes('istanbul')) return 'marmara'
    if (address?.toLowerCase().includes('ankara')) return 'ic_anadolu'
    if (address?.toLowerCase().includes('izmir')) return 'ege'
    return null
  }),
}))

const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
  id: 'policy-1',
  policyNumber: 'POL-001',
  type: 'kasko',
  typeTr: 'Kasko',
  provider: 'Allianz',
  logo: 'allianz-logo.png',
  premium: 5000,
  monthlyPremium: 416,
  coverage: 100000,
  deductible: 1000,
  coverages: [
    { name: 'Hasar', nameTr: 'Hasar Teminatı', limit: 50000, deductible: 1000, included: true },
    { name: 'Hırsızlık', nameTr: 'Hırsızlık', limit: 30000, deductible: 500, included: true },
    { name: 'Cam', nameTr: 'Cam Kırılması', limit: 5000, deductible: 0, included: true },
  ],
  status: 'active',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  uploadDate: new Date().toISOString(),
  fileName: 'test-policy.pdf',
  documentType: 'pdf',
  insuranceLine: 'auto',
  insuredAddress: 'Istanbul, Beşiktaş',
  exclusions: ['deprem hasarları', 'terör olayları'],
  specialConditions: ['Yaş sınırı: 25+'],
  aiConfidence: 0.95,
  aiInsights: ['Standard kasko coverage detected', 'Premium within market range'],
  ...overrides,
})

describe('Feature Extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('extractFeatures', () => {
    it('should extract basic policy features', () => {
      const policy = createMockPolicy()
      const features = extractFeatures(policy)

      expect(features.policyType).toBe('kasko')
      expect(features.premiumAmount).toBe(5000)
      expect(features.coverageCount).toBe(3)
    })

    it('should calculate coverage metrics correctly', () => {
      const policy = createMockPolicy()
      const features = extractFeatures(policy)

      expect(features.totalCoverageLimit).toBe(85000) // 50000 + 30000 + 5000
      expect(features.coverageGapCount).toBeGreaterThanOrEqual(0)
      expect(features.coverageRatio).toBeGreaterThan(0)
      expect(features.coverageRatio).toBeLessThanOrEqual(1)
    })

    it('should identify missing minimum coverages', () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Hasar', nameTr: 'Hasar', limit: 50000, deductible: 1000, included: true },
        ],
      })
      const features = extractFeatures(policy)

      expect(features.hasMinimumCoverages).toBe(false)
      expect(features.coverageGapCount).toBeGreaterThan(0)
    })

    it('should calculate deductible metrics', () => {
      const policy = createMockPolicy()
      const features = extractFeatures(policy)

      expect(features.averageDeductible).toBe(500) // (1000 + 500 + 0) / 3
      expect(features.maxDeductible).toBe(1000)
      expect(features.deductibleToPremiumRatio).toBe(0.1) // 500 / 5000
    })

    it('should handle policies with zero deductibles', () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Coverage1', nameTr: 'Teminat1', limit: 10000, deductible: 0, included: true },
        ],
      })
      const features = extractFeatures(policy)

      // A deductible of 0 is still a valid deductible (no out-of-pocket)
      expect(features.averageDeductible).toBe(0)
      expect(features.maxDeductible).toBe(0)
      expect(features.deductibleToPremiumRatio).toBe(0)
    })

    it('should extract provider metrics', () => {
      const policy = createMockPolicy({ provider: 'Allianz' })
      const features = extractFeatures(policy)

      expect(features.providerRating).toBe(4.5)
      expect(features.providerMarketShare).not.toBeNull()
      expect(features.providerClaimRatio).not.toBeNull()
    })

    it('should handle unknown providers', () => {
      const policy = createMockPolicy({ provider: 'Unknown Company' })
      const features = extractFeatures(policy)

      expect(features.providerRating).toBeNull()
      expect(features.providerMarketShare).toBeNull()
    })

    it('should calculate temporal features', () => {
      const now = new Date()
      const start = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000)
      const end = new Date(now.getTime() + 265 * 24 * 60 * 60 * 1000)

      const policy = createMockPolicy({
        startDate: start.toISOString(),
        expiryDate: end.toISOString(),
      })
      const features = extractFeatures(policy)

      expect(features.policyDuration).toBe(365)
      expect(features.daysToExpiry).toBe(265)
      expect(features.isExpired).toBe(false)
      expect(features.renewalRequired).toBe(false)
    })

    it('should detect expired policies', () => {
      const now = new Date()
      const start = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000)
      const end = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000)

      const policy = createMockPolicy({
        startDate: start.toISOString(),
        expiryDate: end.toISOString(),
      })
      const features = extractFeatures(policy)

      expect(features.isExpired).toBe(true)
    })

    it('should detect policies requiring renewal', () => {
      const now = new Date()
      const start = new Date(now.getTime() - 350 * 24 * 60 * 60 * 1000)
      const end = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

      const policy = createMockPolicy({
        startDate: start.toISOString(),
        expiryDate: end.toISOString(),
      })
      const features = extractFeatures(policy)

      expect(features.renewalRequired).toBe(true)
    })

    it('should calculate geographic features', () => {
      const policy = createMockPolicy({ insuredAddress: 'Istanbul, Beşiktaş' })
      const features = extractFeatures(policy)

      expect(features.regionRiskFactor).toBe(1.15) // Marmara region
      expect(features.urbanFactor).toBe(1.2) // Major city
    })

    it('should handle secondary cities', () => {
      const policy = createMockPolicy({ insuredAddress: 'Eskişehir' })
      const features = extractFeatures(policy)

      expect(features.urbanFactor).toBe(1.1)
    })

    it('should handle rural areas', () => {
      const policy = createMockPolicy({ insuredAddress: 'Küçük Köy, Trakya' })
      const features = extractFeatures(policy)

      expect(features.urbanFactor).toBe(0.9)
    })

    it('should analyze exclusions for high risk', () => {
      const policy = createMockPolicy({
        exclusions: ['deprem hasarları', 'sel ve su baskını'],
      })
      const features = extractFeatures(policy)

      expect(features.hasHighRiskExclusions).toBe(true)
      expect(features.exclusionCount).toBe(2)
    })

    it('should detect no high-risk exclusions', () => {
      const policy = createMockPolicy({
        exclusions: ['kozmetik hasarlar', 'normal aşınma'],
      })
      const features = extractFeatures(policy)

      expect(features.hasHighRiskExclusions).toBe(false)
    })

    it('should include special condition count', () => {
      const policy = createMockPolicy({
        specialConditions: ['Condition 1', 'Condition 2', 'Condition 3'],
      })
      const features = extractFeatures(policy)

      expect(features.specialConditionCount).toBe(3)
    })

    it('should calculate pricing metrics', () => {
      const policy = createMockPolicy()
      const features = extractFeatures(policy)

      expect(features.premiumPercentile).toBeDefined()
      expect(features.priceToMarketRatio).toBeDefined()
    })
  })

  describe('normalizeFeatures', () => {
    it('should normalize coverage features to 0-1 scale', () => {
      const features: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 100000,
        coverageCount: 5,
        hasMinimumCoverages: true,
        coverageGapCount: 2,
        coverageRatio: 0.8,
        averageDeductible: 1000,
        maxDeductible: 2000,
        deductibleToPremiumRatio: 0.2,
        providerRating: 4.0,
        providerMarketShare: 0.1,
        providerClaimRatio: 0.8,
        policyDuration: 365,
        daysToExpiry: 180,
        isExpired: false,
        renewalRequired: false,
        regionRiskFactor: 1.1,
        urbanFactor: 1.1,
        exclusionCount: 3,
        hasHighRiskExclusions: false,
        specialConditionCount: 2,
        premiumPercentile: 60,
        priceToMarketRatio: 1.05,
      }

      const normalized = normalizeFeatures(features)

      expect(normalized.coverage_ratio).toBe(0.8)
      expect(normalized.coverage_gap_normalized).toBe(0.4) // 2/5
      expect(normalized.has_minimum).toBe(0) // Has minimum = 0 risk
    })

    it('should cap normalized values at 1', () => {
      const features: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 1000,
        totalCoverageLimit: 10000,
        coverageCount: 1,
        hasMinimumCoverages: false,
        coverageGapCount: 10, // Very high
        coverageRatio: 0.5,
        averageDeductible: null,
        maxDeductible: null,
        deductibleToPremiumRatio: 2.0, // Very high
        providerRating: null,
        providerMarketShare: null,
        providerClaimRatio: null,
        policyDuration: null,
        daysToExpiry: null,
        isExpired: false,
        renewalRequired: false,
        regionRiskFactor: 1.0,
        urbanFactor: 1.0,
        exclusionCount: 0,
        hasHighRiskExclusions: false,
        specialConditionCount: 0,
        premiumPercentile: null,
        priceToMarketRatio: null,
      }

      const normalized = normalizeFeatures(features)

      expect(normalized.coverage_gap_normalized).toBeLessThanOrEqual(1)
      expect(normalized.deductible_ratio).toBeLessThanOrEqual(1)
    })

    it('should handle missing provider rating', () => {
      const features: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 50000,
        coverageCount: 3,
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
        averageDeductible: 500,
        maxDeductible: 1000,
        deductibleToPremiumRatio: 0.1,
        providerRating: null,
        providerMarketShare: null,
        providerClaimRatio: null,
        policyDuration: 365,
        daysToExpiry: 180,
        isExpired: false,
        renewalRequired: false,
        regionRiskFactor: 1.0,
        urbanFactor: 1.0,
        exclusionCount: 0,
        hasHighRiskExclusions: false,
        specialConditionCount: 0,
        premiumPercentile: 50,
        priceToMarketRatio: 1.0,
      }

      const normalized = normalizeFeatures(features)

      expect(normalized.provider_score).toBe(0.5) // Default when null
    })

    it('should calculate expiry risk correctly', () => {
      // Expired policy
      const expiredFeatures: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 50000,
        coverageCount: 3,
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
        averageDeductible: null,
        maxDeductible: null,
        deductibleToPremiumRatio: null,
        providerRating: 4.0,
        providerMarketShare: 0.1,
        providerClaimRatio: 0.8,
        policyDuration: 365,
        daysToExpiry: -10,
        isExpired: true,
        renewalRequired: false,
        regionRiskFactor: 1.0,
        urbanFactor: 1.0,
        exclusionCount: 0,
        hasHighRiskExclusions: false,
        specialConditionCount: 0,
        premiumPercentile: 50,
        priceToMarketRatio: 1.0,
      }

      const normalized = normalizeFeatures(expiredFeatures)
      expect(normalized.expiry_risk).toBe(1)
    })

    it('should calculate renewal required risk', () => {
      const renewalFeatures: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 50000,
        coverageCount: 3,
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
        averageDeductible: null,
        maxDeductible: null,
        deductibleToPremiumRatio: null,
        providerRating: 4.0,
        providerMarketShare: 0.1,
        providerClaimRatio: 0.8,
        policyDuration: 365,
        daysToExpiry: 20,
        isExpired: false,
        renewalRequired: true,
        regionRiskFactor: 1.0,
        urbanFactor: 1.0,
        exclusionCount: 0,
        hasHighRiskExclusions: false,
        specialConditionCount: 0,
        premiumPercentile: 50,
        priceToMarketRatio: 1.0,
      }

      const normalized = normalizeFeatures(renewalFeatures)
      expect(normalized.expiry_risk).toBe(0.7)
    })

    it('should calculate exclusion risk', () => {
      const highRiskFeatures: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 50000,
        coverageCount: 3,
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
        averageDeductible: null,
        maxDeductible: null,
        deductibleToPremiumRatio: null,
        providerRating: 4.0,
        providerMarketShare: 0.1,
        providerClaimRatio: 0.8,
        policyDuration: 365,
        daysToExpiry: 180,
        isExpired: false,
        renewalRequired: false,
        regionRiskFactor: 1.0,
        urbanFactor: 1.0,
        exclusionCount: 5,
        hasHighRiskExclusions: true,
        specialConditionCount: 3,
        premiumPercentile: 50,
        priceToMarketRatio: 1.0,
      }

      const normalized = normalizeFeatures(highRiskFeatures)
      expect(normalized.exclusion_risk).toBe(0.8)
      expect(normalized.condition_complexity).toBe(0.3) // 3/10
    })
  })

  describe('edge cases', () => {
    it('should handle unknown provider', () => {
      const policy = createMockPolicy({ provider: 'Unknown Company' })
      const features = extractFeatures(policy)

      expect(features.providerRating).toBeNull()
    })

    it('should handle empty coverages', () => {
      const policy = createMockPolicy({ coverages: [] })
      const features = extractFeatures(policy)

      expect(features.coverageCount).toBe(0)
      expect(features.totalCoverageLimit).toBeNull()
    })

    it('should handle missing dates', () => {
      const policy = createMockPolicy({
        startDate: undefined,
        expiryDate: undefined,
      })
      const features = extractFeatures(policy)

      expect(features.policyDuration).toBeNull()
      expect(features.daysToExpiry).toBeNull()
      expect(features.isExpired).toBe(false)
    })

    it('should handle missing address', () => {
      const policy = createMockPolicy({ insuredAddress: undefined })
      const features = extractFeatures(policy)

      expect(features.regionRiskFactor).toBe(1.0)
      expect(features.urbanFactor).toBe(0.9)
    })
  })
})
