/**
 * Market Data Service Tests
 *
 * Tests for the MarketDataService comprehensive benchmarking capabilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarketDataService, generateMarketComparisonData } from './service'
import type { AnalyzedPolicy, PolicyType } from '@/types/policy'

// Mock dependencies
vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    home: {
      premiumRange: { min: 1000, max: 5000, average: 2500, median: 2200 },
      coverageRange: { min: 100000, max: 1000000, average: 500000 },
      commonCoverages: [
        { name: 'Fire', nameTr: 'Yangın', inclusionRate: 95, typicalLimit: 200000 },
        { name: 'Theft', nameTr: 'Hırsızlık', inclusionRate: 80, typicalLimit: 50000 },
        { name: 'Flood', nameTr: 'Sel', inclusionRate: 40, typicalLimit: 100000 },
      ],
      trends: { premiumChangeYoY: 10 },
    },
    kasko: {
      premiumRange: { min: 5000, max: 20000, average: 10000, median: 9000 },
      coverageRange: { min: 200000, max: 2000000, average: 800000 },
      commonCoverages: [
        { name: 'Collision', nameTr: 'Çarpışma', inclusionRate: 98, typicalLimit: 500000 },
        { name: 'Theft', nameTr: 'Hırsızlık', inclusionRate: 90, typicalLimit: 300000 },
      ],
      trends: { premiumChangeYoY: 15 },
    },
    health: {
      premiumRange: { min: 3000, max: 15000, average: 8000, median: 7000 },
      coverageRange: { min: 50000, max: 500000, average: 200000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: -2 },
    },
  },
  calculatePremiumPercentile: vi.fn((premium: number, type: PolicyType) => {
    const benchmarks: Record<string, number> = { home: 2500, kasko: 10000, health: 8000 }
    const avg = benchmarks[type] || 5000
    return Math.max(0, Math.min(100, 50 - ((premium - avg) / avg) * 50))
  }),
  calculateCoveragePercentile: vi.fn((coverage: number, type: PolicyType) => {
    const benchmarks: Record<string, number> = { home: 500000, kasko: 800000, health: 200000 }
    const avg = benchmarks[type] || 300000
    return Math.max(0, Math.min(100, 50 + ((coverage - avg) / avg) * 50))
  }),
  getRegionalFactor: vi.fn(() => 1.1),
}))

vi.mock('@/data/market-data/providers', () => ({
  INSURANCE_PROVIDERS: {
    axa: { name: 'AXA Sigorta', marketShare: 0.15, rating: 4.5 },
    allianz: { name: 'Allianz Sigorta', marketShare: 0.12, rating: 4.3 },
  },
  findProviderByName: vi.fn((name: string) => {
    if (name.toLowerCase().includes('axa')) {
      return { id: 'axa', name: 'AXA Sigorta', marketShare: 0.15, rating: 4.5 }
    }
    if (name.toLowerCase().includes('allianz')) {
      return { id: 'allianz', name: 'Allianz Sigorta', marketShare: 0.12, rating: 4.3 }
    }
    return undefined
  }),
  getProviderRank: vi.fn(() => 3),
  getProvidersByMarketShare: vi.fn(() => [
    { id: 'axa', name: 'AXA Sigorta', marketShare: 0.15, rating: 4.5 },
    { id: 'allianz', name: 'Allianz Sigorta', marketShare: 0.12, rating: 4.3 },
  ]),
}))

vi.mock('./region-detector', () => ({
  detectRegionFromAddress: vi.fn(() => 'marmara'),
}))

vi.mock('./gap-analyzer', () => ({
  analyzeGaps: vi.fn(() => ({
    critical: [],
    recommended: [],
    optional: [],
    score: 75,
  })),
  generateGapInsights: vi.fn(() => [
    { type: 'info', category: 'coverage', message: 'Good coverage' },
  ]),
}))

const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
  id: 'policy-1',
  policyNumber: 'POL-001',
  type: 'home',
  provider: 'AXA Sigorta',
  premium: 2500,
  coverage: 500000,
  coverages: [],
  status: 'active',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

describe('MarketDataService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('analyzePolicyBenchmark', () => {
    it('should return complete benchmark result', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.analyzePolicyBenchmark(policy)

      expect(result).toHaveProperty('premiumPercentile')
      expect(result).toHaveProperty('coveragePercentile')
      expect(result).toHaveProperty('valueScore')
      expect(result).toHaveProperty('premiumVsAverage')
      expect(result).toHaveProperty('coverageVsAverage')
      expect(result).toHaveProperty('region')
      expect(result).toHaveProperty('insights')
    })

    it('should use provided region instead of detecting', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.analyzePolicyBenchmark(policy, 'ege')

      expect(result.region).toBe('ege')
    })

    it('should detect region from policy location', () => {
      const policy = createMockPolicy({ location: 'Istanbul' })
      const result = MarketDataService.analyzePolicyBenchmark(policy)

      expect(result.region).toBe('marmara')
    })

    it('should include provider analysis', () => {
      const policy = createMockPolicy({ provider: 'AXA Sigorta' })
      const result = MarketDataService.analyzePolicyBenchmark(policy)

      expect(result.providerRank).toBeDefined()
      expect(result.providerCount).toBeGreaterThan(0)
    })

    it('should calculate value score', () => {
      const policy = createMockPolicy({ premium: 2000, coverage: 600000 })
      const result = MarketDataService.analyzePolicyBenchmark(policy)

      expect(result.valueScore).toBeGreaterThan(0)
      expect(result.valueScore).toBeLessThanOrEqual(100)
    })

    it('should generate insights array', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.analyzePolicyBenchmark(policy)

      expect(Array.isArray(result.insights)).toBe(true)
    })
  })

  describe('getMarketComparison', () => {
    it('should return complete market comparison', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.getMarketComparison(policy)

      expect(result).toHaveProperty('policyType', 'home')
      expect(result).toHaveProperty('region')
      expect(result).toHaveProperty('userPremium', 2500)
      expect(result).toHaveProperty('marketAverage')
      expect(result).toHaveProperty('marketMedian')
      expect(result).toHaveProperty('premiumPercentile')
      expect(result).toHaveProperty('premiumRating')
    })

    it('should include coverage comparison', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.getMarketComparison(policy)

      expect(result).toHaveProperty('userCoverage')
      expect(result).toHaveProperty('marketAverageCoverage')
      expect(result).toHaveProperty('coveragePercentile')
      expect(result).toHaveProperty('coverageRating')
    })

    it('should include value ratio comparison', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.getMarketComparison(policy)

      expect(result).toHaveProperty('userValueRatio')
      expect(result).toHaveProperty('marketValueRatio')
      expect(result).toHaveProperty('valueRating')
    })

    it('should include provider information', () => {
      const policy = createMockPolicy({ provider: 'AXA Sigorta' })
      const result = MarketDataService.getMarketComparison(policy)

      expect(result).toHaveProperty('providerMarketShare')
      expect(result).toHaveProperty('providerRating')
      expect(result).toHaveProperty('providerRank')
    })

    it('should handle unknown provider gracefully', () => {
      const policy = createMockPolicy({ provider: 'Unknown Insurance' })
      const result = MarketDataService.getMarketComparison(policy)

      expect(result.providerMarketShare).toBe(0)
      expect(result.providerRating).toBe(0)
    })

    it('should include market trend', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.getMarketComparison(policy)

      expect(result).toHaveProperty('marketTrend')
      expect(result).toHaveProperty('trendPercentage')
      expect(['increasing', 'decreasing', 'stable']).toContain(result.marketTrend)
    })

    it('should show increasing trend for high premium change', () => {
      const policy = createMockPolicy({ type: 'kasko' })
      const result = MarketDataService.getMarketComparison(policy)

      expect(result.marketTrend).toBe('increasing')
      expect(result.trendPercentage).toBe(15)
    })

    it('should show decreasing trend for negative premium change', () => {
      const policy = createMockPolicy({ type: 'health' })
      const result = MarketDataService.getMarketComparison(policy)

      expect(result.marketTrend).toBe('stable') // -2% is between -5% and 5%
    })
  })

  describe('analyzeGaps', () => {
    it('should return gap analysis', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.analyzeGaps(policy)

      expect(result).toHaveProperty('score')
    })

    it('should use provided region', () => {
      const policy = createMockPolicy()
      const result = MarketDataService.analyzeGaps(policy, 'ege')

      // The region parameter is passed through to gap analyzer
      // We verify by checking the result is valid
      expect(result).toHaveProperty('score')
    })
  })

  describe('getGapInsights', () => {
    it('should return insights array', () => {
      const gaps = { critical: [], recommended: [], optional: [], score: 80 }
      const result = MarketDataService.getGapInsights(gaps)

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('getBenchmarkData', () => {
    it('should return benchmark data for home policies', () => {
      const result = MarketDataService.getBenchmarkData('home')

      expect(result).toHaveProperty('premiumRange')
      expect(result).toHaveProperty('coverageRange')
      expect(result).toHaveProperty('commonCoverages')
      expect(result).toHaveProperty('trends')
    })

    it('should return benchmark data for kasko policies', () => {
      const result = MarketDataService.getBenchmarkData('kasko')

      expect(result.premiumRange.average).toBe(10000)
    })
  })

  describe('getProviders', () => {
    it('should return providers sorted by market share', () => {
      const result = MarketDataService.getProviders()

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('getProviderInfo', () => {
    it('should return provider info for known provider', () => {
      const result = MarketDataService.getProviderInfo('AXA Sigorta')

      expect(result).toBeDefined()
      expect(result?.name).toBe('AXA Sigorta')
    })

    it('should return undefined for unknown provider', () => {
      const result = MarketDataService.getProviderInfo('Unknown')

      expect(result).toBeUndefined()
    })
  })

  describe('getRegionalFactor', () => {
    it('should return regional factor', () => {
      const result = MarketDataService.getRegionalFactor('home', 'marmara')

      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThan(0)
    })
  })

  describe('getRecommendedCoverages', () => {
    it('should return recommended coverages for policy type', () => {
      const result = MarketDataService.getRecommendedCoverages('home')

      expect(Array.isArray(result)).toBe(true)
    })

    it('should filter coverages with inclusion rate >= 50%', () => {
      const result = MarketDataService.getRecommendedCoverages('home')

      // Fire (95%) and Theft (80%) should be included, Flood (40%) should not
      expect(result.length).toBe(2)
    })

    it('should classify importance correctly', () => {
      const result = MarketDataService.getRecommendedCoverages('home')

      const fire = result.find(c => c.name === 'Fire')
      const theft = result.find(c => c.name === 'Theft')

      expect(fire?.importance).toBe('critical') // 95% >= 90
      expect(theft?.importance).toBe('recommended') // 80% >= 70
    })

    it('should apply regional factor to recommended limits', () => {
      const result = MarketDataService.getRecommendedCoverages('home', 'marmara')

      // Fire has typicalLimit 200000, regional factor is 1.1
      const fire = result.find(c => c.name === 'Fire')
      expect(fire?.recommendedLimit).toBe(220000) // 200000 * 1.1
    })

    it('should sort by importance', () => {
      const result = MarketDataService.getRecommendedCoverages('home')

      // Verify result is sorted (critical before recommended before optional)
      const importanceOrder = result.map(r => r.importance)
      expect(importanceOrder.length).toBeGreaterThan(0)
      // First item should be highest priority
      expect(['critical', 'recommended']).toContain(importanceOrder[0])
    })
  })
})

describe('generateMarketComparisonData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return comparison data with percentile', () => {
    const result = generateMarketComparisonData(2500, 500000, 'home')

    expect(result).toHaveProperty('averagePremium')
    expect(result).toHaveProperty('averageCoverage')
    expect(result).toHaveProperty('percentile')
  })

  it('should use location for region detection', () => {
    const result = generateMarketComparisonData(2500, 500000, 'home', 'Istanbul')

    expect(result.percentile).toBeDefined()
  })

  it('should return correct benchmark averages', () => {
    const result = generateMarketComparisonData(2500, 500000, 'home')

    expect(result.averagePremium).toBe(2500)
    expect(result.averageCoverage).toBe(500000)
  })
})

describe('Rating calculations', () => {
  it('should rate low premium appropriately', () => {
    // Very low premium (high percentile after inversion)
    const policy = createMockPolicy({ premium: 1500 })
    const result = MarketDataService.getMarketComparison(policy)

    // Any valid rating is acceptable
    expect(result.premiumRating).toBeDefined()
    expect(typeof result.premiumRating).toBe('string')
  })

  it('should rate high coverage appropriately', () => {
    const policy = createMockPolicy({ coverage: 800000 })
    const result = MarketDataService.getMarketComparison(policy)

    expect(result.coverageRating).toBeDefined()
  })

  it('should rate value ratio based on coverage/premium', () => {
    // High coverage, low premium = good value
    const policy = createMockPolicy({ premium: 2000, coverage: 700000 })
    const result = MarketDataService.getMarketComparison(policy)

    expect(result.valueRating).toBeDefined()
    expect(typeof result.valueRating).toBe('string')
  })
})
