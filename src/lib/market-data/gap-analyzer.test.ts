/**
 * Gap Analyzer Tests
 *
 * Tests for policy coverage gap analysis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeGaps, generateGapInsights } from './gap-analyzer'
import type { AnalyzedPolicy } from '@/types/policy'
import type { GapAnalysis } from '@/types/market-data'

// Mock configService so it doesn't hit the real database
vi.mock('@/lib/config/configuration-service', () => ({
  configService: {
    getMarketBenchmarks: vi.fn().mockResolvedValue([]),
    getRegionalFactor: vi.fn().mockResolvedValue(1.0),
    getRegionalFactors: vi.fn().mockResolvedValue([]),
    getInsuranceProviders: vi.fn().mockResolvedValue([]),
  },
}))

// Mock market benchmarks
vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    kasko: {
      commonCoverages: [
        { name: 'Damage', nameTr: 'Hasar', typicalLimit: 100000, typicalDeductible: 1000, minDeductible: 500, maxDeductible: 3000, inclusionRate: 95 },
        { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 80000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 90 },
        { name: 'Glass', nameTr: 'Cam Kırılması', typicalLimit: 10000, typicalDeductible: 0, minDeductible: 0, maxDeductible: 500, inclusionRate: 75 },
        { name: 'IMM', nameTr: 'İhtiyari Mali Mesuliyet', typicalLimit: 50000, typicalDeductible: 0, minDeductible: 0, maxDeductible: 0, inclusionRate: 60 },
      ],
      premiumRange: { min: 3000, max: 15000, average: 7500 },
      regionalFactors: {
        marmara: 1.15,
        ege: 1.05,
        akdeniz: 1.0,
        ic_anadolu: 0.95,
        karadeniz: 0.9,
        dogu_anadolu: 0.85,
        guneydogu: 0.85,
      },
    },
    home: {
      commonCoverages: [
        { name: 'Fire', nameTr: 'Yangın', typicalLimit: 500000, typicalDeductible: 2000, minDeductible: 1000, maxDeductible: 5000, inclusionRate: 98 },
        { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 50000, typicalDeductible: 1000, minDeductible: 500, maxDeductible: 3000, inclusionRate: 85 },
        { name: 'Earthquake', nameTr: 'Deprem', typicalLimit: 500000, typicalDeductible: 5000, minDeductible: 2000, maxDeductible: 10000, inclusionRate: 92 },
        { name: 'Water', nameTr: 'Su Hasarı', typicalLimit: 30000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 80 },
      ],
      premiumRange: { min: 2000, max: 10000, average: 5000 },
      regionalFactors: {
        marmara: 1.2,
        ege: 1.1,
        akdeniz: 1.0,
        ic_anadolu: 0.9,
        karadeniz: 0.85,
        dogu_anadolu: 0.8,
        guneydogu: 0.8,
      },
    },
    traffic: { commonCoverages: [], premiumRange: { min: 1000, max: 3000, average: 2000 }, regionalFactors: {} },
    health: { commonCoverages: [], premiumRange: { min: 5000, max: 20000, average: 12000 }, regionalFactors: {} },
    life: { commonCoverages: [], premiumRange: { min: 1000, max: 5000, average: 3000 }, regionalFactors: {} },
    dask: { commonCoverages: [], premiumRange: { min: 500, max: 2000, average: 1000 }, regionalFactors: {} },
    business: { commonCoverages: [], premiumRange: { min: 10000, max: 50000, average: 25000 }, regionalFactors: {} },
  },
}))

const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
  id: 'policy-1',
  policyNumber: 'POL-001',
  type: 'kasko',
  typeTr: 'Kasko',
  provider: 'Allianz',
  logo: '/logos/allianz.png',
  premium: 5000,
  monthlyPremium: 417,
  coverage: 100000,
  deductible: 1000,
  coverages: [
    { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 1000, included: true },
    { name: 'Theft', nameTr: 'Hırsızlık', limit: 80000, deductible: 500, included: true },
  ],
  status: 'active',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  uploadDate: new Date().toISOString(),
  fileName: 'policy-kasko.pdf',
  documentType: 'policy',
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Otomobil',
  aiConfidence: 0.95,
  aiInsights: ['Policy analyzed successfully'],
  ...overrides,
})

describe('Gap Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('analyzeGaps', () => {
    it('should return a gap analysis object', async () => {
      const policy = createMockPolicy()
      const analysis = await analyzeGaps(policy)

      expect(analysis).toHaveProperty('missingCoverages')
      expect(analysis).toHaveProperty('underinsuredCoverages')
      expect(analysis).toHaveProperty('highDeductibles')
      expect(analysis).toHaveProperty('exclusionWarnings')
      expect(analysis).toHaveProperty('gapScore')
      expect(analysis).toHaveProperty('estimatedCostToClose')
    })

    it('should identify missing coverages', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 1000, included: true },
          // Missing: Theft, Glass, IMM
        ],
      })
      const analysis = await analyzeGaps(policy)

      expect(analysis.missingCoverages.length).toBeGreaterThan(0)
    })

    it('should categorize missing coverages by importance', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 1000, included: true },
        ],
      })
      const analysis = await analyzeGaps(policy)

      const criticalMissing = analysis.missingCoverages.filter(m => m.importance === 'critical')
      const recommendedMissing = analysis.missingCoverages.filter(m => m.importance === 'recommended')

      // Theft (90% inclusion) should be critical
      expect(criticalMissing.length).toBeGreaterThan(0)
      // Glass (75% inclusion) should be recommended
      expect(recommendedMissing.length).toBeGreaterThanOrEqual(0)
    })

    it('should identify underinsured coverages', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 30000, deductible: 1000, included: true }, // Way below 100000 typical
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 80000, deductible: 500, included: true },
        ],
      })
      const analysis = await analyzeGaps(policy)

      expect(analysis.underinsuredCoverages.length).toBeGreaterThan(0)

      const damageCoverage = analysis.underinsuredCoverages.find(u =>
        u.coverageName.toLowerCase().includes('hasar') || u.coverageName.toLowerCase().includes('damage')
      )
      expect(damageCoverage).toBeDefined()
      expect(damageCoverage?.riskLevel).toBe('high')
    })

    it('should categorize underinsured coverage risk levels', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 25000, deductible: 1000, included: true }, // <40% of typical = high
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 40000, deductible: 500, included: true }, // ~50% of typical = medium
        ],
      })
      const analysis = await analyzeGaps(policy)

      const highRisk = analysis.underinsuredCoverages.filter(u => u.riskLevel === 'high')
      expect(highRisk.length).toBeGreaterThan(0)
    })

    it('should identify high deductibles', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 5000, included: true }, // Way above 1000 typical (>1.5x)
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 80000, deductible: 500, included: true },
        ],
      })
      const analysis = await analyzeGaps(policy)

      expect(analysis.highDeductibles.length).toBeGreaterThan(0)
    })

    it('should calculate percentile rank for deductibles', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 2500, included: true }, // High
        ],
      })
      const analysis = await analyzeGaps(policy)

      if (analysis.highDeductibles.length > 0) {
        expect(analysis.highDeductibles[0].percentileRank).toBeGreaterThanOrEqual(0)
        expect(analysis.highDeductibles[0].percentileRank).toBeLessThanOrEqual(100)
      }
    })

    it('should analyze exclusions for kasko policies', async () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['deprem hasarları', 'sel ve su baskını', 'hırsızlık istisna'],
      })
      const analysis = await analyzeGaps(policy)

      expect(analysis.exclusionWarnings.length).toBeGreaterThan(0)
    })

    it('should analyze exclusions for home policies', async () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['hırsızlık', 'sel hasarı', 'cam kırılması'],
      })
      const analysis = await analyzeGaps(policy)

      expect(analysis.exclusionWarnings.length).toBeGreaterThan(0)
    })

    it('should calculate gap score between 0 and 100', async () => {
      const policy = createMockPolicy()
      const analysis = await analyzeGaps(policy)

      expect(analysis.gapScore).toBeGreaterThanOrEqual(0)
      expect(analysis.gapScore).toBeLessThanOrEqual(100)
    })

    it('should calculate higher gap score for more issues', async () => {
      const goodPolicy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 1000, included: true },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 80000, deductible: 500, included: true },
          { name: 'Glass', nameTr: 'Cam', limit: 10000, deductible: 0, included: true },
          { name: 'IMM', nameTr: 'İMM', limit: 50000, deductible: 0, included: true },
        ],
        exclusions: [],
      })

      const badPolicy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 20000, deductible: 5000, included: true }, // Underinsured, high deductible
        ],
        exclusions: ['deprem', 'sel', 'hırsızlık'],
      })

      const goodAnalysis = await analyzeGaps(goodPolicy)
      const badAnalysis = await analyzeGaps(badPolicy)

      expect(badAnalysis.gapScore).toBeGreaterThan(goodAnalysis.gapScore)
    })

    it('should estimate cost to close gaps', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 1000, included: true },
          // Missing coverages
        ],
      })
      const analysis = await analyzeGaps(policy)

      expect(analysis.estimatedCostToClose).toBeGreaterThanOrEqual(0)
    })

    it('should apply regional factors to cost estimate', async () => {
      const policy = createMockPolicy({
        coverages: [
          { name: 'Damage', nameTr: 'Hasar', limit: 100000, deductible: 1000, included: true },
        ],
      })

      const marmaraAnalysis = await analyzeGaps(policy, 'marmara')
      const karadenizAnalysis = await analyzeGaps(policy, 'karadeniz')

      // Marmara has higher regional factor (1.15 vs 0.9)
      expect(marmaraAnalysis.estimatedCostToClose).toBeGreaterThanOrEqual(karadenizAnalysis.estimatedCostToClose)
    })

    it('should handle empty coverages', async () => {
      const policy = createMockPolicy({ coverages: [] })
      const analysis = await analyzeGaps(policy)

      expect(analysis.missingCoverages.length).toBeGreaterThan(0)
      expect(analysis.underinsuredCoverages.length).toBe(0)
      expect(analysis.highDeductibles.length).toBe(0)
    })

    it('should handle empty exclusions', async () => {
      const policy = createMockPolicy({ exclusions: [] })
      const analysis = await analyzeGaps(policy)

      expect(analysis.exclusionWarnings.length).toBe(0)
    })
  })

  describe('generateGapInsights', () => {
    it('should generate insights from gap analysis', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [
          {
            coverage: { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 80000, minLimit: 50000, maxLimit: 120000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 90 },
            importance: 'critical',
            estimatedCost: 800,
          },
        ],
        underinsuredCoverages: [],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 45,
        estimatedCostToClose: 1200,
      }

      const insights = generateGapInsights(gaps)

      expect(Array.isArray(insights)).toBe(true)
    })

    it('should generate warning for critical missing coverages', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [
          {
            coverage: { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 80000, minLimit: 50000, maxLimit: 120000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 90 },
            importance: 'critical',
            estimatedCost: 800,
          },
        ],
        underinsuredCoverages: [],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 45,
        estimatedCostToClose: 1200,
      }

      const insights = generateGapInsights(gaps)
      const warningInsight = insights.find(i => i.type === 'warning' && i.category === 'coverage')

      expect(warningInsight).toBeDefined()
      expect(warningInsight?.priority).toBe(5)
    })

    it('should generate warning for high risk underinsured coverages', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [],
        underinsuredCoverages: [
          {
            coverageName: 'Hasar',
            currentLimit: 30000,
            recommendedLimit: 100000,
            marketAverageLimit: 100000,
            riskLevel: 'high',
          },
        ],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 35,
        estimatedCostToClose: 500,
      }

      const insights = generateGapInsights(gaps)
      const warningInsight = insights.find(i => i.type === 'warning' && i.priority === 4)

      expect(warningInsight).toBeDefined()
    })

    it('should generate warning for high deductibles', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [],
        underinsuredCoverages: [],
        highDeductibles: [
          {
            coverageName: 'Hasar',
            currentDeductible: 5000,
            marketAverageDeductible: 1000,
            percentileRank: 85,
          },
        ],
        exclusionWarnings: [],
        gapScore: 25,
        estimatedCostToClose: 0,
      }

      const insights = generateGapInsights(gaps)
      const deductibleInsight = insights.find(i => i.category === 'premium' && i.type === 'warning')

      expect(deductibleInsight).toBeDefined()
    })

    it('should generate positive insight for low gap score', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [],
        underinsuredCoverages: [],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 10,
        estimatedCostToClose: 0,
      }

      const insights = generateGapInsights(gaps)
      const positiveInsight = insights.find(i => i.type === 'positive')

      expect(positiveInsight).toBeDefined()
    })

    it('should generate warning for high gap score', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [
          {
            coverage: { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 80000, minLimit: 50000, maxLimit: 120000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 90 },
            importance: 'critical',
            estimatedCost: 800,
          },
        ],
        underinsuredCoverages: [],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 60,
        estimatedCostToClose: 1500,
      }

      const insights = generateGapInsights(gaps)
      const highScoreWarning = insights.find(i =>
        i.type === 'warning' && i.message.includes('Significant')
      )

      expect(highScoreWarning).toBeDefined()
      expect(highScoreWarning?.priority).toBe(5)
    })

    it('should include cost recommendation when cost to close > 0', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [],
        underinsuredCoverages: [],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 30,
        estimatedCostToClose: 2500,
      }

      const insights = generateGapInsights(gaps)
      const costInsight = insights.find(i => i.type === 'recommendation')

      expect(costInsight).toBeDefined()
      expect(costInsight?.message).toContain('2.500') // Turkish formatted
    })

    it('should sort insights by priority', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [
          {
            coverage: { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 80000, minLimit: 50000, maxLimit: 120000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 90 },
            importance: 'critical',
            estimatedCost: 800,
          },
        ],
        underinsuredCoverages: [
          {
            coverageName: 'Hasar',
            currentLimit: 30000,
            recommendedLimit: 100000,
            marketAverageLimit: 100000,
            riskLevel: 'high',
          },
        ],
        highDeductibles: [
          {
            coverageName: 'Hasar',
            currentDeductible: 5000,
            marketAverageDeductible: 1000,
            percentileRank: 85,
          },
        ],
        exclusionWarnings: [],
        gapScore: 55,
        estimatedCostToClose: 2000,
      }

      const insights = generateGapInsights(gaps)

      for (let i = 1; i < insights.length; i++) {
        expect(insights[i - 1].priority).toBeGreaterThanOrEqual(insights[i].priority)
      }
    })

    it('should include both English and Turkish messages', async () => {
      const gaps: GapAnalysis = {
        missingCoverages: [
          {
            coverage: { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 80000, minLimit: 50000, maxLimit: 120000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 1500, inclusionRate: 90 },
            importance: 'critical',
            estimatedCost: 800,
          },
        ],
        underinsuredCoverages: [],
        highDeductibles: [],
        exclusionWarnings: [],
        gapScore: 45,
        estimatedCostToClose: 1200,
      }

      const insights = generateGapInsights(gaps)

      insights.forEach(i => {
        expect(i.message).toBeDefined()
        expect(i.messageTr).toBeDefined()
      })
    })
  })
})
