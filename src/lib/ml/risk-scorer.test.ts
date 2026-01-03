/**
 * Risk Scorer Tests
 *
 * Tests for ML-based risk scoring engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateRiskScore, predictRisk } from './risk-scorer'
import type { AnalyzedPolicy } from '@/types/policy'
import type { RiskScore } from '@/types/risk'

// Mock feature extractor
vi.mock('./feature-extractor', () => ({
  extractFeatures: vi.fn(() => ({
    policyType: 'kasko',
    premiumAmount: 5000,
    totalCoverageLimit: 100000,
    coverageCount: 5,
    hasMinimumCoverages: true,
    coverageGapCount: 1,
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
  })),
  normalizeFeatures: vi.fn(() => ({
    coverage_ratio: 0.8,
    coverage_gap_normalized: 0.2,
    has_minimum: 0,
    deductible_ratio: 0.2,
    provider_score: 0.25,
    expiry_risk: 0.3,
    region_risk: 0.43,
    urban_risk: 0.67,
    exclusion_risk: 0.2,
    condition_complexity: 0.2,
    pricing_risk: 0.05,
  })),
}))

const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
  id: 'policy-1',
  policyNumber: 'POL-001',
  type: 'kasko',
  provider: 'Allianz',
  premium: 5000,
  coverage: 100000,
  coverages: [
    { name: 'Hasar', nameTr: 'Hasar Teminatı', limit: 50000, deductible: 1000 },
    { name: 'Hırsızlık', nameTr: 'Hırsızlık', limit: 30000, deductible: 500 },
  ],
  status: 'active',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

describe('Risk Scorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateRiskScore', () => {
    it('should return a valid risk score object', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score).toHaveProperty('overall')
      expect(score).toHaveProperty('level')
      expect(score).toHaveProperty('categories')
      expect(score).toHaveProperty('topFactors')
      expect(score).toHaveProperty('confidence')
      expect(score).toHaveProperty('percentile')
      expect(score).toHaveProperty('calculatedAt')
      expect(score).toHaveProperty('modelVersion')
    })

    it('should calculate overall score between 0 and 100', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.overall).toBeGreaterThanOrEqual(0)
      expect(score.overall).toBeLessThanOrEqual(100)
    })

    it('should determine risk level based on score', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(['very_low', 'low', 'moderate', 'high', 'very_high']).toContain(score.level)
    })

    it('should include category scores', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories).toHaveProperty('coverage_gaps')
      expect(score.categories).toHaveProperty('pricing')
      expect(score.categories).toHaveProperty('provider')
      expect(score.categories).toHaveProperty('temporal')
      expect(score.categories).toHaveProperty('geographic')
      expect(score.categories).toHaveProperty('concentration')
      expect(score.categories).toHaveProperty('deductible')
      expect(score.categories).toHaveProperty('exclusions')
    })

    it('should include category details', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      for (const category of Object.values(score.categories)) {
        expect(category).toHaveProperty('score')
        expect(category).toHaveProperty('level')
        expect(category).toHaveProperty('factors')
        expect(category.score).toBeGreaterThanOrEqual(0)
        expect(category.score).toBeLessThanOrEqual(100)
      }
    })

    it('should return top 5 risk factors', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.topFactors.length).toBeLessThanOrEqual(5)
      score.topFactors.forEach(factor => {
        expect(factor).toHaveProperty('category')
        expect(factor).toHaveProperty('name')
        expect(factor).toHaveProperty('score')
        expect(factor).toHaveProperty('weight')
        expect(factor).toHaveProperty('level')
      })
    })

    it('should calculate confidence metrics', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.confidence).toHaveProperty('overall')
      expect(score.confidence).toHaveProperty('dataQuality')
      expect(score.confidence).toHaveProperty('modelCertainty')

      expect(score.confidence.overall).toBeGreaterThanOrEqual(0)
      expect(score.confidence.overall).toBeLessThanOrEqual(1)
      expect(score.confidence.dataQuality).toBeGreaterThanOrEqual(0)
      expect(score.confidence.dataQuality).toBeLessThanOrEqual(1)
      expect(score.confidence.modelCertainty).toBeGreaterThanOrEqual(0)
      expect(score.confidence.modelCertainty).toBeLessThanOrEqual(1)
    })

    it('should calculate percentile', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.percentile).toBeGreaterThanOrEqual(1)
      expect(score.percentile).toBeLessThanOrEqual(99)
    })

    it('should include model version', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.modelVersion).toMatch(/^\d+\.\d+\.\d+$/)
    })

    it('should include calculation timestamp', () => {
      const before = Date.now()
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)
      const after = Date.now()

      expect(score.calculatedAt).toBeGreaterThanOrEqual(before)
      expect(score.calculatedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('predictRisk', () => {
    it('should return risk prediction with intervals', () => {
      const mockScore: RiskScore = {
        overall: 45,
        level: 'moderate',
        categories: {
          coverage_gaps: { score: 30, level: 'low', factors: [] },
          pricing: { score: 20, level: 'low', factors: [] },
          provider: { score: 25, level: 'low', factors: [] },
          temporal: { score: 10, level: 'very_low', factors: [] },
          geographic: { score: 35, level: 'low', factors: [] },
          concentration: { score: 40, level: 'moderate', factors: [] },
          deductible: { score: 50, level: 'moderate', factors: [] },
          exclusions: { score: 30, level: 'low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.8,
          dataQuality: 0.75,
          modelCertainty: 0.85,
        },
        percentile: 45,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const prediction = predictRisk(mockScore)

      expect(prediction).toHaveProperty('expectedRisk')
      expect(prediction).toHaveProperty('intervals')
      expect(prediction).toHaveProperty('probabilities')
      expect(prediction).toHaveProperty('trend')
      expect(prediction).toHaveProperty('trendConfidence')
    })

    it('should have valid interval bounds', () => {
      const mockScore: RiskScore = {
        overall: 50,
        level: 'moderate',
        categories: {
          coverage_gaps: { score: 30, level: 'low', factors: [] },
          pricing: { score: 20, level: 'low', factors: [] },
          provider: { score: 25, level: 'low', factors: [] },
          temporal: { score: 10, level: 'very_low', factors: [] },
          geographic: { score: 35, level: 'low', factors: [] },
          concentration: { score: 40, level: 'moderate', factors: [] },
          deductible: { score: 50, level: 'moderate', factors: [] },
          exclusions: { score: 30, level: 'low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.9,
          dataQuality: 0.85,
          modelCertainty: 0.95,
        },
        percentile: 50,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const prediction = predictRisk(mockScore)

      expect(prediction.intervals.low).toBeLessThanOrEqual(prediction.intervals.median)
      expect(prediction.intervals.median).toBeLessThanOrEqual(prediction.intervals.high)
      expect(prediction.intervals.low).toBeGreaterThanOrEqual(0)
      expect(prediction.intervals.high).toBeLessThanOrEqual(100)
    })

    it('should calculate probabilities for all risk levels', () => {
      const mockScore: RiskScore = {
        overall: 50,
        level: 'moderate',
        categories: {
          coverage_gaps: { score: 30, level: 'low', factors: [] },
          pricing: { score: 20, level: 'low', factors: [] },
          provider: { score: 25, level: 'low', factors: [] },
          temporal: { score: 10, level: 'very_low', factors: [] },
          geographic: { score: 35, level: 'low', factors: [] },
          concentration: { score: 40, level: 'moderate', factors: [] },
          deductible: { score: 50, level: 'moderate', factors: [] },
          exclusions: { score: 30, level: 'low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.8,
          dataQuality: 0.75,
          modelCertainty: 0.85,
        },
        percentile: 50,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const prediction = predictRisk(mockScore)

      expect(prediction.probabilities).toHaveProperty('very_low')
      expect(prediction.probabilities).toHaveProperty('low')
      expect(prediction.probabilities).toHaveProperty('moderate')
      expect(prediction.probabilities).toHaveProperty('high')
      expect(prediction.probabilities).toHaveProperty('very_high')

      // Probabilities should sum to approximately 1
      const sum = Object.values(prediction.probabilities).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 1)
    })

    it('should return expected risk matching score', () => {
      const mockScore: RiskScore = {
        overall: 65,
        level: 'high',
        categories: {
          coverage_gaps: { score: 30, level: 'low', factors: [] },
          pricing: { score: 20, level: 'low', factors: [] },
          provider: { score: 25, level: 'low', factors: [] },
          temporal: { score: 10, level: 'very_low', factors: [] },
          geographic: { score: 35, level: 'low', factors: [] },
          concentration: { score: 40, level: 'moderate', factors: [] },
          deductible: { score: 50, level: 'moderate', factors: [] },
          exclusions: { score: 30, level: 'low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.8,
          dataQuality: 0.75,
          modelCertainty: 0.85,
        },
        percentile: 65,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const prediction = predictRisk(mockScore)

      expect(prediction.expectedRisk).toBe(65)
    })

    it('should have wider intervals with lower confidence', () => {
      const highConfScore: RiskScore = {
        overall: 50,
        level: 'moderate',
        categories: {
          coverage_gaps: { score: 30, level: 'low', factors: [] },
          pricing: { score: 20, level: 'low', factors: [] },
          provider: { score: 25, level: 'low', factors: [] },
          temporal: { score: 10, level: 'very_low', factors: [] },
          geographic: { score: 35, level: 'low', factors: [] },
          concentration: { score: 40, level: 'moderate', factors: [] },
          deductible: { score: 50, level: 'moderate', factors: [] },
          exclusions: { score: 30, level: 'low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.95,
          dataQuality: 0.9,
          modelCertainty: 1.0,
        },
        percentile: 50,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const lowConfScore: RiskScore = {
        ...highConfScore,
        confidence: {
          overall: 0.5,
          dataQuality: 0.4,
          modelCertainty: 0.6,
        },
      }

      const highConfPrediction = predictRisk(highConfScore)
      const lowConfPrediction = predictRisk(lowConfScore)

      const highConfSpread = highConfPrediction.intervals.high - highConfPrediction.intervals.low
      const lowConfSpread = lowConfPrediction.intervals.high - lowConfPrediction.intervals.low

      expect(lowConfSpread).toBeGreaterThan(highConfSpread)
    })
  })

  describe('category calculations', () => {
    it('should detect coverage gap risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.coverage_gaps).toBeDefined()
      expect(score.categories.coverage_gaps.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect pricing risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.pricing).toBeDefined()
      expect(score.categories.pricing.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect provider risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.provider).toBeDefined()
      expect(score.categories.provider.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect temporal risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.temporal).toBeDefined()
      expect(score.categories.temporal.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect geographic risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.geographic).toBeDefined()
      expect(score.categories.geographic.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect concentration risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.concentration).toBeDefined()
      expect(score.categories.concentration.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect deductible risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.deductible).toBeDefined()
      expect(score.categories.deductible.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect exclusion risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.exclusions).toBeDefined()
      expect(score.categories.exclusions.score).toBeGreaterThanOrEqual(0)
    })
  })
})
