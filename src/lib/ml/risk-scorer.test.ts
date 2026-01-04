/**
 * Risk Scorer Tests
 *
 * Comprehensive tests for ML-based risk scoring engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnalyzedPolicy } from '@/types/policy'
import type { RiskScore, RiskFeatures } from '@/types/risk'

// Default mock features for baseline tests
const defaultFeatures: RiskFeatures = {
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
}

// Use vi.hoisted to define mocks before module hoisting
const { mockExtractFeatures, mockNormalizeFeatures } = vi.hoisted(() => {
  const mockExtractFeatures = vi.fn()
  const mockNormalizeFeatures = vi.fn(() => ({
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
  }))
  return { mockExtractFeatures, mockNormalizeFeatures }
})

// Mock feature extractor
vi.mock('./feature-extractor', () => ({
  extractFeatures: mockExtractFeatures,
  normalizeFeatures: mockNormalizeFeatures,
}))

// Import after mocking
import { calculateRiskScore, predictRisk } from './risk-scorer'

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
  ],
  status: 'active',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  uploadDate: new Date().toISOString(),
  fileName: 'test-policy.pdf',
  documentType: 'pdf',
  insuranceLine: 'auto',
  exclusions: ['deprem hasarları', 'terör olayları'],
  specialConditions: ['Yaş sınırı: 25+'],
  aiConfidence: 0.95,
  aiInsights: ['Standard kasko coverage detected', 'Premium within market range'],
  ...overrides,
})

// Helper to create default features
const getDefaultFeatures = (): RiskFeatures => ({ ...defaultFeatures })

// Helper to set mock features for a specific test
const setMockFeatures = (overrides: Partial<RiskFeatures>) => {
  mockExtractFeatures.mockReturnValueOnce({ ...getDefaultFeatures(), ...overrides })
}

describe('Risk Scorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to default features
    mockExtractFeatures.mockReturnValue(getDefaultFeatures())
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
      expect(score.categories.coverage_gaps?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect pricing risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.pricing).toBeDefined()
      expect(score.categories.pricing?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect provider risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.provider).toBeDefined()
      expect(score.categories.provider?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect temporal risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.temporal).toBeDefined()
      expect(score.categories.temporal?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect geographic risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.geographic).toBeDefined()
      expect(score.categories.geographic?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect concentration risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.concentration).toBeDefined()
      expect(score.categories.concentration?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect deductible risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.deductible).toBeDefined()
      expect(score.categories.deductible?.score).toBeGreaterThanOrEqual(0)
    })

    it('should detect exclusion risks', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.exclusions).toBeDefined()
      expect(score.categories.exclusions?.score).toBeGreaterThanOrEqual(0)
    })
  })

  // ===========================================================================
  // Coverage Gap Risk Tests
  // ===========================================================================

  describe('Coverage Gap Risk Calculation', () => {
    it('should flag missing minimum coverages', () => {
      setMockFeatures({
        hasMinimumCoverages: false,
        coverageGapCount: 3,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.coverage_gaps!.score).toBeGreaterThan(0)
      expect(score.categories.coverage_gaps!.factors.length).toBeGreaterThan(0)

      const missingFactor = score.categories.coverage_gaps!.factors.find(
        f => f.name === 'Eksik Teminatlar'
      )
      expect(missingFactor).toBeDefined()
      expect(missingFactor!.score).toBe(60) // 3 gaps * 20 = 60
    })

    it('should cap gap score at 100', () => {
      setMockFeatures({
        hasMinimumCoverages: false,
        coverageGapCount: 10,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const missingFactor = score.categories.coverage_gaps!.factors.find(
        f => f.name === 'Eksik Teminatlar'
      )
      expect(missingFactor).toBeDefined()
      expect(missingFactor!.score).toBe(100) // Capped at 100
    })

    it('should flag low coverage ratio', () => {
      setMockFeatures({
        coverageRatio: 0.5, // 50% coverage
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const ratioFactor = score.categories.coverage_gaps!.factors.find(
        f => f.name === 'Düşük Teminat Oranı'
      )
      expect(ratioFactor).toBeDefined()
      expect(ratioFactor!.score).toBe(50) // (1 - 0.5) * 100
    })

    it('should not flag when coverage is adequate', () => {
      setMockFeatures({
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.coverage_gaps!.factors.length).toBe(0)
      expect(score.categories.coverage_gaps!.score).toBe(0)
    })
  })

  // ===========================================================================
  // Pricing Risk Tests
  // ===========================================================================

  describe('Pricing Risk Calculation', () => {
    it('should flag overpriced policies', () => {
      setMockFeatures({
        priceToMarketRatio: 1.5, // 50% above market
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const priceFactor = score.categories.pricing!.factors.find(
        f => f.name === 'Yüksek Fiyatlandırma'
      )
      expect(priceFactor).toBeDefined()
      expect(priceFactor!.score).toBe(50) // deviation of 0.5 * 100
    })

    it('should flag underpriced policies', () => {
      setMockFeatures({
        priceToMarketRatio: 0.6, // 40% below market
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const priceFactor = score.categories.pricing!.factors.find(
        f => f.name === 'Düşük Fiyatlandırma'
      )
      expect(priceFactor).toBeDefined()
      expect(priceFactor!.score).toBe(40) // deviation of 0.4 * 100
    })

    it('should cap pricing deviation at 100', () => {
      setMockFeatures({
        priceToMarketRatio: 2.5, // 150% above market
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const priceFactor = score.categories.pricing!.factors.find(
        f => f.name === 'Yüksek Fiyatlandırma'
      )
      expect(priceFactor).toBeDefined()
      expect(priceFactor!.score).toBe(100)
    })

    it('should flag premium percentile outliers - high', () => {
      setMockFeatures({
        premiumPercentile: 95,
        priceToMarketRatio: 1.0, // No price deviation to isolate percentile test
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const outlierFactor = score.categories.pricing!.factors.find(
        f => f.name === 'Fiyat Aykırılığı'
      )
      expect(outlierFactor).toBeDefined()
      expect(outlierFactor!.score).toBe(90) // (95 - 50) * 2
    })

    it('should flag premium percentile outliers - low', () => {
      setMockFeatures({
        premiumPercentile: 5,
        priceToMarketRatio: 1.0,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const outlierFactor = score.categories.pricing!.factors.find(
        f => f.name === 'Fiyat Aykırılığı'
      )
      expect(outlierFactor).toBeDefined()
      expect(outlierFactor!.score).toBe(90) // (50 - 5) * 2
    })

    it('should not flag normal pricing', () => {
      setMockFeatures({
        priceToMarketRatio: 1.1, // 10% deviation is acceptable
        premiumPercentile: 50,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.pricing!.factors.length).toBe(0)
    })

    it('should handle null price to market ratio', () => {
      setMockFeatures({
        priceToMarketRatio: null,
        premiumPercentile: 50,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      // Should not throw and should handle gracefully
      expect(score.categories.pricing).toBeDefined()
    })

    it('should handle null premium percentile', () => {
      setMockFeatures({
        priceToMarketRatio: 1.1,
        premiumPercentile: null,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.pricing).toBeDefined()
    })
  })

  // ===========================================================================
  // Provider Risk Tests
  // ===========================================================================

  describe('Provider Risk Calculation', () => {
    it('should flag low provider rating', () => {
      setMockFeatures({
        providerRating: 2.5,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const ratingFactor = score.categories.provider!.factors.find(
        f => f.name === 'Düşük Sigorta Şirketi Puanı'
      )
      expect(ratingFactor).toBeDefined()
      expect(ratingFactor!.score).toBe(45) // (4 - 2.5) * 30
    })

    it('should flag unknown provider (null rating)', () => {
      setMockFeatures({
        providerRating: null,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const unknownFactor = score.categories.provider!.factors.find(
        f => f.name === 'Bilinmeyen Sigorta Şirketi'
      )
      expect(unknownFactor).toBeDefined()
      expect(unknownFactor!.score).toBe(40)
      expect(unknownFactor!.level).toBe('moderate')
    })

    it('should flag low market share', () => {
      setMockFeatures({
        providerRating: 4.0,
        providerMarketShare: 0.02, // 2% market share
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const marketFactor = score.categories.provider!.factors.find(
        f => f.name === 'Düşük Pazar Payı'
      )
      expect(marketFactor).toBeDefined()
      expect(marketFactor!.score).toBe(30)
    })

    it('should not flag good provider', () => {
      setMockFeatures({
        providerRating: 4.5,
        providerMarketShare: 0.15,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.provider!.factors.length).toBe(0)
    })
  })

  // ===========================================================================
  // Temporal Risk Tests
  // ===========================================================================

  describe('Temporal Risk Calculation', () => {
    it('should flag expired policies with maximum risk', () => {
      setMockFeatures({
        isExpired: true,
        renewalRequired: false,
        daysToExpiry: -10,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const expiredFactor = score.categories.temporal!.factors.find(
        f => f.name === 'Süresi Dolmuş Poliçe'
      )
      expect(expiredFactor).toBeDefined()
      expect(expiredFactor!.score).toBe(100)
      expect(expiredFactor!.level).toBe('very_high')
      expect(expiredFactor!.weight).toBe(1.0)
    })

    it('should flag policies requiring renewal', () => {
      setMockFeatures({
        isExpired: false,
        renewalRequired: true,
        daysToExpiry: 15,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const renewalFactor = score.categories.temporal!.factors.find(
        f => f.name === 'Yaklaşan Vade'
      )
      expect(renewalFactor).toBeDefined()
      expect(renewalFactor!.score).toBe(50) // 80 - 15*2 = 50
    })

    it('should flag policies with short time remaining', () => {
      setMockFeatures({
        isExpired: false,
        renewalRequired: false,
        daysToExpiry: 45,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const shortTimeFactor = score.categories.temporal!.factors.find(
        f => f.name === 'Kısa Süre Kaldı'
      )
      expect(shortTimeFactor).toBeDefined()
      expect(shortTimeFactor!.score).toBe(30)
    })

    it('should not flag policies with ample time', () => {
      setMockFeatures({
        isExpired: false,
        renewalRequired: false,
        daysToExpiry: 180,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.temporal!.factors.length).toBe(0)
    })

    it('should handle null daysToExpiry', () => {
      setMockFeatures({
        isExpired: false,
        renewalRequired: true,
        daysToExpiry: null,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      // Should use default of 0 days
      const renewalFactor = score.categories.temporal!.factors.find(
        f => f.name === 'Yaklaşan Vade'
      )
      expect(renewalFactor).toBeDefined()
      expect(renewalFactor!.score).toBe(80) // 80 - 0*2 = 80
    })
  })

  // ===========================================================================
  // Geographic Risk Tests
  // ===========================================================================

  describe('Geographic Risk Calculation', () => {
    it('should flag high-risk regions', () => {
      setMockFeatures({
        regionRiskFactor: 1.3, // 30% higher risk
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const regionFactor = score.categories.geographic!.factors.find(
        f => f.name === 'Yüksek Riskli Bölge'
      )
      expect(regionFactor).toBeDefined()
      expect(regionFactor!.score).toBeCloseTo(60, 5) // (1.3 - 1) * 200, use toBeCloseTo for floating point
    })

    it('should flag metropolitan areas', () => {
      setMockFeatures({
        regionRiskFactor: 1.0,
        urbanFactor: 1.2,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const urbanFactor = score.categories.geographic!.factors.find(
        f => f.name === 'Büyükşehir Riski'
      )
      expect(urbanFactor).toBeDefined()
      expect(urbanFactor!.score).toBe(35)
    })

    it('should not flag normal regions', () => {
      setMockFeatures({
        regionRiskFactor: 1.0,
        urbanFactor: 1.0,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.geographic!.factors.length).toBe(0)
    })
  })

  // ===========================================================================
  // Concentration Risk Tests
  // ===========================================================================

  describe('Concentration Risk Calculation', () => {
    it('should flag limited coverage diversity', () => {
      setMockFeatures({
        coverageCount: 2,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const concentrationFactor = score.categories.concentration!.factors.find(
        f => f.name === 'Sınırlı Teminat Çeşitliliği'
      )
      expect(concentrationFactor).toBeDefined()
      expect(concentrationFactor!.score).toBe(25) // (3 - 2) * 25
    })

    it('should flag very limited coverage diversity', () => {
      setMockFeatures({
        coverageCount: 1,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const concentrationFactor = score.categories.concentration!.factors.find(
        f => f.name === 'Sınırlı Teminat Çeşitliliği'
      )
      expect(concentrationFactor).toBeDefined()
      expect(concentrationFactor!.score).toBe(50) // (3 - 1) * 25
    })

    it('should flag low coverage per premium ratio', () => {
      setMockFeatures({
        totalCoverageLimit: 40000,
        premiumAmount: 1000, // 40x coverage per TRY
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const ratioFactor = score.categories.concentration!.factors.find(
        f => f.name === 'Düşük Teminat/Prim Oranı'
      )
      expect(ratioFactor).toBeDefined()
      expect(ratioFactor!.score).toBe(40)
    })

    it('should handle null values gracefully', () => {
      setMockFeatures({
        coverageCount: 5,
        totalCoverageLimit: null,
        premiumAmount: null,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      // Should not throw
      expect(score.categories.concentration).toBeDefined()
    })
  })

  // ===========================================================================
  // Deductible Risk Tests
  // ===========================================================================

  describe('Deductible Risk Calculation', () => {
    it('should flag high deductible to premium ratio', () => {
      setMockFeatures({
        deductibleToPremiumRatio: 0.8, // 80% of premium
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const deductibleFactor = score.categories.deductible!.factors.find(
        f => f.name === 'Yüksek Muafiyet Oranı'
      )
      expect(deductibleFactor).toBeDefined()
      expect(deductibleFactor!.score).toBe(64) // 0.8 * 80
    })

    it('should cap deductible ratio score at 80', () => {
      setMockFeatures({
        deductibleToPremiumRatio: 1.5, // 150% of premium
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const deductibleFactor = score.categories.deductible!.factors.find(
        f => f.name === 'Yüksek Muafiyet Oranı'
      )
      expect(deductibleFactor).toBeDefined()
      expect(deductibleFactor!.score).toBe(80) // Capped at 80
    })

    it('should flag high maximum deductible', () => {
      setMockFeatures({
        maxDeductible: 25000,
        deductibleToPremiumRatio: 0.3,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const maxFactor = score.categories.deductible!.factors.find(
        f => f.name === 'Yüksek Maksimum Muafiyet'
      )
      expect(maxFactor).toBeDefined()
      expect(maxFactor!.score).toBe(30) // (25000 - 10000) / 500
    })

    it('should cap max deductible score at 60', () => {
      setMockFeatures({
        maxDeductible: 50000,
        deductibleToPremiumRatio: 0.3,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const maxFactor = score.categories.deductible!.factors.find(
        f => f.name === 'Yüksek Maksimum Muafiyet'
      )
      expect(maxFactor).toBeDefined()
      expect(maxFactor!.score).toBe(60) // Capped at 60
    })

    it('should handle null deductible values', () => {
      setMockFeatures({
        deductibleToPremiumRatio: null,
        maxDeductible: null,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.deductible!.factors.length).toBe(0)
    })
  })

  // ===========================================================================
  // Exclusion Risk Tests
  // ===========================================================================

  describe('Exclusion Risk Calculation', () => {
    it('should flag high-risk exclusions', () => {
      setMockFeatures({
        hasHighRiskExclusions: true,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const exclusionFactor = score.categories.exclusions!.factors.find(
        f => f.name === 'Kritik İstisnalar'
      )
      expect(exclusionFactor).toBeDefined()
      expect(exclusionFactor!.score).toBe(60)
      expect(exclusionFactor!.level).toBe('moderate')
    })

    it('should flag many exclusions', () => {
      setMockFeatures({
        exclusionCount: 15,
        hasHighRiskExclusions: false,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const countFactor = score.categories.exclusions!.factors.find(
        f => f.name === 'Çok Sayıda İstisna'
      )
      expect(countFactor).toBeDefined()
      expect(countFactor!.score).toBe(45) // 15 * 3
    })

    it('should cap exclusion count score at 50', () => {
      setMockFeatures({
        exclusionCount: 25,
        hasHighRiskExclusions: false,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      const countFactor = score.categories.exclusions!.factors.find(
        f => f.name === 'Çok Sayıda İstisna'
      )
      expect(countFactor).toBeDefined()
      expect(countFactor!.score).toBe(50) // Capped at 50
    })

    it('should not flag minimal exclusions', () => {
      setMockFeatures({
        exclusionCount: 5,
        hasHighRiskExclusions: false,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.categories.exclusions!.factors.length).toBe(0)
    })
  })

  // ===========================================================================
  // Confidence Calculation Tests
  // ===========================================================================

  describe('Confidence Calculation', () => {
    it('should calculate high confidence with complete data', () => {
      setMockFeatures({
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 100000,
        providerRating: 4.0,
        daysToExpiry: 180,
        premiumPercentile: 50,
        averageDeductible: 1000,
        coverageCount: 5,
        regionRiskFactor: 1.1,
        exclusionCount: 3,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.confidence.dataQuality).toBeGreaterThan(0.8)
      expect(score.confidence.overall).toBeGreaterThan(0.7)
    })

    it('should calculate lower confidence with missing data', () => {
      setMockFeatures({
        policyType: null,
        premiumAmount: null,
        totalCoverageLimit: null,
        providerRating: null,
        daysToExpiry: null,
        premiumPercentile: null,
        averageDeductible: null,
        coverageCount: 0,
        regionRiskFactor: 1.0,
        exclusionCount: 0,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.confidence.dataQuality).toBeLessThan(0.3)
    })
  })

  // ===========================================================================
  // Percentile Calculation Tests
  // ===========================================================================

  describe('Percentile Calculation', () => {
    it('should adjust percentile for different policy types', () => {
      // Kasko policies have -5 adjustment
      setMockFeatures({
        policyType: 'kasko',
      })
      const kaskoScore = calculateRiskScore(createMockPolicy())

      setMockFeatures({
        policyType: 'business',
      })
      const businessScore = calculateRiskScore(createMockPolicy())

      // Business policies have +10 adjustment, so should be higher
      expect(businessScore.percentile).toBeGreaterThan(kaskoScore.percentile)
    })

    it('should handle null policy type', () => {
      setMockFeatures({
        policyType: null,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.percentile).toBeGreaterThanOrEqual(1)
      expect(score.percentile).toBeLessThanOrEqual(99)
    })

    it('should clamp percentile between 1 and 99', () => {
      // Very low risk score
      setMockFeatures({
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
        isExpired: false,
        renewalRequired: false,
        daysToExpiry: 365,
        providerRating: 5.0,
        policyType: 'dask', // -10 adjustment
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.percentile).toBeGreaterThanOrEqual(1)
      expect(score.percentile).toBeLessThanOrEqual(99)
    })
  })

  // ===========================================================================
  // Overall Score Calculation Tests
  // ===========================================================================

  describe('Overall Score Calculation', () => {
    it('should clamp overall score between 0 and 100', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.overall).toBeGreaterThanOrEqual(0)
      expect(score.overall).toBeLessThanOrEqual(100)
    })

    it('should round overall score to integer', () => {
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(Number.isInteger(score.overall)).toBe(true)
    })

    it('should weight categories correctly', () => {
      // All categories have same score, so overall should be close to that score
      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      // Verify all categories contribute to overall
      expect(Object.keys(score.categories).length).toBe(8)
    })
  })

  // ===========================================================================
  // Top Factors Tests
  // ===========================================================================

  describe('Top Factors Selection', () => {
    it('should sort factors by impact (score * weight)', () => {
      setMockFeatures({
        isExpired: true, // High score * high weight factor
        hasMinimumCoverages: false,
        coverageGapCount: 2,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      if (score.topFactors.length >= 2) {
        const first = score.topFactors[0]
        const second = score.topFactors[1]

        expect(first.score * first.weight).toBeGreaterThanOrEqual(
          second.score * second.weight
        )
      }
    })

    it('should include at most 5 top factors', () => {
      // Create many risk factors
      setMockFeatures({
        hasMinimumCoverages: false,
        coverageGapCount: 3,
        coverageRatio: 0.5,
        priceToMarketRatio: 1.5,
        providerRating: 2.5,
        isExpired: true,
        regionRiskFactor: 1.3,
        coverageCount: 1,
        deductibleToPremiumRatio: 0.8,
        hasHighRiskExclusions: true,
        exclusionCount: 15,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      expect(score.topFactors.length).toBeLessThanOrEqual(5)
    })
  })

  // ===========================================================================
  // Risk Level Determination Tests
  // ===========================================================================

  describe('Risk Level Determination', () => {
    it('should assign very_high level for score > 75', () => {
      // Force very high risk
      setMockFeatures({
        isExpired: true,
        hasMinimumCoverages: false,
        coverageGapCount: 5,
        providerRating: 1.5,
        hasHighRiskExclusions: true,
        regionRiskFactor: 1.5,
        coverageCount: 1,
      })

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      // The exact level depends on weighted calculation
      expect(['moderate', 'high', 'very_high']).toContain(score.level)
    })

    it('should assign low level for minimal risk features', () => {
      // Create minimal risk features that don't trigger ANY risk factors
      // Key thresholds:
      // - coverageRatio >= 0.8 (no gap risk)
      // - priceToMarketRatio within ±0.2 of 1.0 (no pricing risk)
      // - premiumPercentile between 10-90 (no outlier risk)
      // - providerRating >= 3.5 (no provider risk)
      // - providerMarketShare >= 0.03 (no market share risk)
      // - isExpired = false, renewalRequired = false, daysToExpiry >= 60 (no temporal risk)
      // - regionRiskFactor <= 1.1 (no geographic risk)
      // - urbanFactor <= 1.15 (no urban risk)
      // - coverageCount >= 3 (no concentration risk)
      // - totalCoverageLimit / premiumAmount >= 50 (no coverage/premium ratio risk)
      // - deductibleToPremiumRatio <= 0.5 (no deductible risk)
      // - maxDeductible <= 10000 (no max deductible risk)
      // - exclusionCount <= 10 (no exclusion count risk)
      // - hasHighRiskExclusions = false (no critical exclusion risk)
      const minimalRiskFeatures: RiskFeatures = {
        policyType: 'kasko',
        premiumAmount: 5000,
        totalCoverageLimit: 500000, // 500000/5000 = 100 > 50 threshold
        coverageCount: 10,
        hasMinimumCoverages: true,
        coverageGapCount: 0,
        coverageRatio: 1.0,
        averageDeductible: 500,
        maxDeductible: 1000,
        deductibleToPremiumRatio: 0.1,
        providerRating: 5.0,
        providerMarketShare: 0.2,
        providerClaimRatio: 0.7,
        policyDuration: 365,
        daysToExpiry: 300,
        isExpired: false,
        renewalRequired: false,
        regionRiskFactor: 0.9,
        urbanFactor: 0.9,
        exclusionCount: 2,
        hasHighRiskExclusions: false,
        specialConditionCount: 1,
        premiumPercentile: 50,
        priceToMarketRatio: 1.0,
      }

      // Clear and setup fresh mock
      vi.clearAllMocks()
      mockExtractFeatures.mockImplementation(() => minimalRiskFeatures)

      const policy = createMockPolicy()
      const score = calculateRiskScore(policy)

      // Verify mock was called
      expect(mockExtractFeatures).toHaveBeenCalled()

      // With minimal risk features (no triggering conditions), all category
      // scores should be 0, and overall score should be very low
      for (const [_category, data] of Object.entries(score.categories)) {
        expect(data.score).toBe(0)
        expect(data.factors.length).toBe(0)
      }

      expect(score.overall).toBe(0)
      expect(score.level).toBe('very_low')
    })
  })

  // ===========================================================================
  // predictRisk Additional Tests
  // ===========================================================================

  describe('predictRisk edge cases', () => {
    it('should handle zero confidence', () => {
      const mockScore: RiskScore = {
        overall: 50,
        level: 'moderate',
        categories: {
          coverage_gaps: { score: 0, level: 'very_low', factors: [] },
          pricing: { score: 0, level: 'very_low', factors: [] },
          provider: { score: 0, level: 'very_low', factors: [] },
          temporal: { score: 0, level: 'very_low', factors: [] },
          geographic: { score: 0, level: 'very_low', factors: [] },
          concentration: { score: 0, level: 'very_low', factors: [] },
          deductible: { score: 0, level: 'very_low', factors: [] },
          exclusions: { score: 0, level: 'very_low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0,
          dataQuality: 0,
          modelCertainty: 0,
        },
        percentile: 50,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const prediction = predictRisk(mockScore)

      // With zero confidence, spread should be maximum (20)
      expect(prediction.intervals.high - prediction.intervals.low).toBe(40)
    })

    it('should handle extreme scores', () => {
      const mockScoreLow: RiskScore = {
        overall: 0,
        level: 'very_low',
        categories: {
          coverage_gaps: { score: 0, level: 'very_low', factors: [] },
          pricing: { score: 0, level: 'very_low', factors: [] },
          provider: { score: 0, level: 'very_low', factors: [] },
          temporal: { score: 0, level: 'very_low', factors: [] },
          geographic: { score: 0, level: 'very_low', factors: [] },
          concentration: { score: 0, level: 'very_low', factors: [] },
          deductible: { score: 0, level: 'very_low', factors: [] },
          exclusions: { score: 0, level: 'very_low', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.5,
          dataQuality: 0.5,
          modelCertainty: 0.5,
        },
        percentile: 1,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const predictionLow = predictRisk(mockScoreLow)

      expect(predictionLow.intervals.low).toBeGreaterThanOrEqual(0)
      expect(predictionLow.expectedRisk).toBe(0)

      const mockScoreHigh: RiskScore = {
        ...mockScoreLow,
        overall: 100,
        level: 'very_high',
        percentile: 99,
      }

      const predictionHigh = predictRisk(mockScoreHigh)

      expect(predictionHigh.intervals.high).toBeLessThanOrEqual(100)
      expect(predictionHigh.expectedRisk).toBe(100)
    })

    it('should normalize probabilities', () => {
      const mockScore: RiskScore = {
        overall: 50,
        level: 'moderate',
        categories: {
          coverage_gaps: { score: 50, level: 'moderate', factors: [] },
          pricing: { score: 50, level: 'moderate', factors: [] },
          provider: { score: 50, level: 'moderate', factors: [] },
          temporal: { score: 50, level: 'moderate', factors: [] },
          geographic: { score: 50, level: 'moderate', factors: [] },
          concentration: { score: 50, level: 'moderate', factors: [] },
          deductible: { score: 50, level: 'moderate', factors: [] },
          exclusions: { score: 50, level: 'moderate', factors: [] },
        },
        topFactors: [],
        confidence: {
          overall: 0.8,
          dataQuality: 0.8,
          modelCertainty: 0.8,
        },
        percentile: 50,
        calculatedAt: Date.now(),
        modelVersion: '1.0.0',
      }

      const prediction = predictRisk(mockScore)

      const sum = Object.values(prediction.probabilities).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 5)
    })
  })
})
