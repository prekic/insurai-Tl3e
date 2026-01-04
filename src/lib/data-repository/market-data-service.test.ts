/**
 * Tests for Market Data Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Define mock data and functions using vi.hoisted
const {
  mockBenchmarkRepository,
  mockLoadMarketData,
  mockCheckDataFreshness,
  mockMarketDataLoader,
  mockValidateRepository,
  mockCalculateQualityScore,
  mockCalculateFreshnessScore,
} = vi.hoisted(() => {
  const mockBenchmarkRepository = {
    benchmarks: {
      kasko: {
        type: 'kasko',
        premiumRange: { min: 1000, max: 5000, average: 3000 },
        coverageRange: { min: 50000, max: 500000, median: 200000 },
        commonCoverages: [
          { name: 'Collision', inclusionRate: 95, typicalDeductible: 1000 },
          { name: 'Theft', inclusionRate: 90, typicalDeductible: 500 },
          { name: 'Fire', inclusionRate: 85, typicalDeductible: 200 },
        ],
      },
      home: {
        type: 'home',
        premiumRange: { min: 500, max: 3000, average: 1500 },
        coverageRange: { min: 100000, max: 1000000, median: 400000 },
        commonCoverages: [
          { name: 'Fire', inclusionRate: 100, typicalDeductible: 0 },
          { name: 'Flood', inclusionRate: 70, typicalDeductible: 2000 },
        ],
      },
      traffic: {
        type: 'traffic',
        premiumRange: { min: 200, max: 800 },
        coverageRange: { min: 10000, max: 100000 },
        commonCoverages: [],
      },
      dask: {
        type: 'dask',
        premiumRange: { min: 100, max: 500 },
        coverageRange: { min: 50000, max: 300000 },
        commonCoverages: [],
      },
    },
    providers: {
      allianz: {
        id: 'allianz',
        name: 'Allianz Sigorta',
        marketShare: 15,
        rating: 4.5,
      },
      axa: {
        id: 'axa',
        name: 'AXA Sigorta',
        marketShare: 12,
        rating: 4.3,
      },
      anadolu: {
        id: 'anadolu',
        name: 'Anadolu Sigorta',
        marketShare: 10,
        rating: 4.0,
      },
      aksigorta: {
        id: 'aksigorta',
        name: 'Aksigorta',
        marketShare: 8,
        rating: 3.8,
      },
      sompo: {
        id: 'sompo',
        name: 'Sompo Japan',
        marketShare: 5,
        rating: 3.5,
      },
      mapfre: {
        id: 'mapfre',
        name: 'Mapfre Sigorta',
        marketShare: 4,
      },
    },
    regionalFactors: {
      marmara: {
        region: 'marmara',
        baseFactor: 1.2,
        riskProfile: {
          earthquake: 'high',
          flood: 'medium',
          theft: 'high',
          traffic: 'high',
        },
      },
      ic_anadolu: {
        region: 'ic_anadolu',
        baseFactor: 1.0,
        riskProfile: {
          earthquake: 'medium',
          flood: 'low',
          theft: 'medium',
          traffic: 'medium',
        },
      },
      ege: {
        region: 'ege',
        baseFactor: 1.1,
        riskProfile: {
          earthquake: 'very_high',
          flood: 'high',
          theft: 'medium',
          traffic: 'medium',
        },
      },
    },
    metadata: {
      id: 'benchmark-2024',
      name: 'Turkish Insurance Benchmarks 2024',
      description: 'Market benchmark data',
      version: '1.0.0',
      lastUpdated: '2024-01-15',
      effectiveFrom: '2024-01-01',
      effectiveTo: '2024-12-31',
      source: {
        name: 'TSB',
        type: 'official' as const,
        confidence: 0.9,
      },
      quality: {
        completeness: 95,
        accuracy: 90,
        timeliness: 85,
        consistency: 92,
        overallScore: 90,
      },
    },
  }

  return {
    mockBenchmarkRepository,
    mockLoadMarketData: vi.fn(),
    mockCheckDataFreshness: vi.fn(),
    mockMarketDataLoader: { invalidateCache: vi.fn() },
    mockValidateRepository: vi.fn(),
    mockCalculateQualityScore: vi.fn(),
    mockCalculateFreshnessScore: vi.fn(),
  }
})

// Mock dependencies
vi.mock('./data-loader', () => ({
  loadMarketData: mockLoadMarketData,
  checkDataFreshness: mockCheckDataFreshness,
  marketDataLoader: mockMarketDataLoader,
}))

vi.mock('./validators', () => ({
  validateRepository: mockValidateRepository,
  calculateQualityScore: mockCalculateQualityScore,
}))

vi.mock('@/types/data-repository', () => ({
  calculateFreshnessScore: mockCalculateFreshnessScore,
}))

describe('MarketDataService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    // Setup default mock implementations
    mockLoadMarketData.mockResolvedValue({
      success: true,
      data: mockBenchmarkRepository,
    })
    mockCheckDataFreshness.mockResolvedValue({ fresh: true })
    mockValidateRepository.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    })
    mockCalculateQualityScore.mockReturnValue(90)
    mockCalculateFreshnessScore.mockReturnValue(85)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize and load market data', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      expect(mockLoadMarketData).toHaveBeenCalled()
    })

    it('should only initialize once when called multiple times', async () => {
      const { marketDataService } = await import('./market-data-service')

      await Promise.all([
        marketDataService.initialize(),
        marketDataService.initialize(),
        marketDataService.initialize(),
      ])

      expect(mockLoadMarketData).toHaveBeenCalledTimes(1)
    })

    it('should handle initialization failure gracefully', async () => {
      mockLoadMarketData.mockResolvedValue({
        success: false,
        data: null,
      })

      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      await expect(marketDataService.getPolicyTypes()).rejects.toThrow('Failed to load market data repository')
    })
  })

  describe('Subscription', () => {
    it('should notify subscribers when data is loaded', async () => {
      const { marketDataService } = await import('./market-data-service')
      const callback = vi.fn()

      marketDataService.subscribe(callback)
      await marketDataService.initialize()

      expect(callback).toHaveBeenCalledWith(mockBenchmarkRepository)
    })

    it('should call subscriber immediately if data already loaded', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const callback = vi.fn()
      marketDataService.subscribe(callback)

      expect(callback).toHaveBeenCalledWith(mockBenchmarkRepository)
    })

    it('should allow unsubscribing', async () => {
      const { marketDataService } = await import('./market-data-service')
      const callback = vi.fn()

      const unsubscribe = marketDataService.subscribe(callback)
      unsubscribe()

      await marketDataService.refresh()

      // Callback should only be called once (initial subscribe, not after refresh)
      expect(callback).toHaveBeenCalledTimes(0)
    })
  })

  describe('Benchmark Access', () => {
    it('should get all policy types', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const types = await marketDataService.getPolicyTypes()
      expect(types).toContain('kasko')
      expect(types).toContain('home')
      expect(types).toContain('traffic')
      expect(types).toContain('dask')
    })

    it('should get benchmark for specific policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const benchmark = await marketDataService.getBenchmark('kasko')
      expect(benchmark).toBeDefined()
      expect(benchmark?.type).toBe('kasko')
      expect(benchmark?.premiumRange).toBeDefined()
    })

    it('should return null for unknown policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const benchmark = await marketDataService.getBenchmark('unknown' as any)
      expect(benchmark).toBeNull()
    })

    it('should get all benchmarks', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const benchmarks = await marketDataService.getAllBenchmarks()
      expect(Object.keys(benchmarks)).toHaveLength(4)
    })
  })

  describe('Premium Range', () => {
    it('should get premium range for policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const range = await marketDataService.getPremiumRange('kasko')
      expect(range).toEqual({
        min: 1000,
        max: 5000,
        average: 3000,
      })
    })

    it('should calculate average if not provided', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const range = await marketDataService.getPremiumRange('traffic')
      expect(range).toEqual({
        min: 200,
        max: 800,
        average: 500, // (200 + 800) / 2
      })
    })

    it('should return null for unknown policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const range = await marketDataService.getPremiumRange('unknown' as any)
      expect(range).toBeNull()
    })
  })

  describe('Coverage Range', () => {
    it('should get coverage range for policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const range = await marketDataService.getCoverageRange('kasko')
      expect(range).toEqual({
        min: 50000,
        max: 500000,
        recommended: 200000,
      })
    })

    it('should calculate recommended if median not provided', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const range = await marketDataService.getCoverageRange('traffic')
      expect(range).toEqual({
        min: 10000,
        max: 100000,
        recommended: 70000, // max * 0.7
      })
    })

    it('should return null for unknown policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const range = await marketDataService.getCoverageRange('unknown' as any)
      expect(range).toBeNull()
    })
  })

  describe('Common Coverages', () => {
    it('should get common coverages for policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const coverages = await marketDataService.getCommonCoverages('kasko')
      expect(coverages).toHaveLength(3)
      expect(coverages[0].name).toBe('Collision')
    })

    it('should return empty array for policy type without coverages', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const coverages = await marketDataService.getCommonCoverages('traffic')
      expect(coverages).toEqual([])
    })

    it('should return empty array for unknown policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const coverages = await marketDataService.getCommonCoverages('unknown' as any)
      expect(coverages).toEqual([])
    })
  })

  describe('Market Leaders', () => {
    it('should get market leaders (top 5 providers by rating)', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const leaders = await marketDataService.getMarketLeaders('kasko')
      expect(leaders).toHaveLength(5)
      expect(leaders[0].rating).toBeGreaterThanOrEqual(leaders[1].rating!)
    })
  })

  describe('Provider Access', () => {
    it('should get all providers', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const providers = await marketDataService.getAllProviders()
      expect(Object.keys(providers)).toHaveLength(6)
    })

    it('should get specific provider', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const provider = await marketDataService.getProvider('allianz')
      expect(provider).toBeDefined()
      expect(provider?.name).toBe('Allianz Sigorta')
    })

    it('should return null for unknown provider', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const provider = await marketDataService.getProvider('unknown' as any)
      expect(provider).toBeNull()
    })

    it('should get providers by specialty (sorted by market share)', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const providers = await marketDataService.getProvidersBySpecialty('kasko')
      expect(providers[0].marketShare).toBeGreaterThanOrEqual(providers[1].marketShare)
    })

    it('should get top providers by rating', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const topProviders = await marketDataService.getTopProviders(3)
      expect(topProviders).toHaveLength(3)
      expect(topProviders[0].rating).toBe(4.5)
      expect(topProviders[1].rating).toBe(4.3)
    })

    it('should filter out providers without rating', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const topProviders = await marketDataService.getTopProviders(10)
      // mapfre has no rating, so should not be included
      expect(topProviders.every(p => p.rating !== undefined)).toBe(true)
    })
  })

  describe('Regional Access', () => {
    it('should get all regions', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const regions = await marketDataService.getAllRegions()
      expect(Object.keys(regions)).toHaveLength(3)
    })

    it('should get specific region', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const region = await marketDataService.getRegion('marmara')
      expect(region).toBeDefined()
      expect(region?.baseFactor).toBe(1.2)
    })

    it('should return null for unknown region', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const region = await marketDataService.getRegion('unknown' as any)
      expect(region).toBeNull()
    })
  })

  describe('Regional Adjustment Calculation', () => {
    it('should calculate regional adjustment for home insurance', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'marmara', 'home')
      expect(adjustment.region).toBe('marmara')
      expect(adjustment.baseFactor).toBe(1.2)
      expect(adjustment.riskMultiplier).toBeGreaterThan(1) // High earthquake risk
      expect(adjustment.adjustedValue).toBeGreaterThan(1000)
    })

    it('should calculate regional adjustment for kasko', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'marmara', 'kasko')
      expect(adjustment.riskMultiplier).toBeGreaterThan(1) // High theft and traffic risk
    })

    it('should calculate regional adjustment for traffic insurance', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'marmara', 'traffic')
      expect(adjustment.riskMultiplier).toBeGreaterThan(1) // High traffic risk
    })

    it('should calculate regional adjustment for dask', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'ege', 'dask')
      expect(adjustment.riskMultiplier).toBeGreaterThan(1) // Very high earthquake risk
    })

    it('should return default adjustment for unknown region', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'unknown' as any, 'home')
      expect(adjustment.baseFactor).toBe(1.0)
      expect(adjustment.riskMultiplier).toBe(1.0)
      expect(adjustment.adjustedValue).toBe(1000)
    })

    it('should handle life insurance without regional risk factors', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'marmara', 'life' as any)
      expect(adjustment.riskMultiplier).toBe(1.0) // No special risk for life insurance
    })

    it('should calculate with low risk region', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const adjustment = await marketDataService.calculateRegionalAdjustment(1000, 'ic_anadolu', 'home')
      expect(adjustment.riskMultiplier).toBeLessThanOrEqual(1.0) // Low flood risk
    })
  })

  describe('Benchmark Comparison', () => {
    it('should compare premium to benchmark', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('kasko', 'premium', 3000)
      expect(comparison).toBeDefined()
      expect(comparison?.field).toBe('premium')
      expect(comparison?.marketMin).toBe(1000)
      expect(comparison?.marketMax).toBe(5000)
      expect(comparison?.assessment).toBe('at_market')
    })

    it('should compare coverage to benchmark', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('kasko', 'coverage', 50000)
      expect(comparison).toBeDefined()
      expect(comparison?.assessment).toBe('below_market')
    })

    it('should compare deductible to benchmark', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('kasko', 'deductible', 500)
      expect(comparison).toBeDefined()
      expect(comparison?.field).toBe('deductible')
    })

    it('should return null for unknown policy type', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('unknown' as any, 'premium', 3000)
      expect(comparison).toBeNull()
    })

    it('should return null for deductible when no coverages defined', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('traffic', 'deductible', 500)
      expect(comparison).toBeNull()
    })

    it('should classify high value as above_market', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('kasko', 'premium', 4800)
      expect(comparison?.assessment).toBe('above_market')
      expect(comparison?.percentile).toBeGreaterThan(75)
    })

    it('should classify low value as below_market', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const comparison = await marketDataService.compareToBenchmark('kasko', 'premium', 1100)
      expect(comparison?.assessment).toBe('below_market')
      expect(comparison?.percentile).toBeLessThan(25)
    })

    it('should clamp percentile between 0 and 100', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const lowComparison = await marketDataService.compareToBenchmark('kasko', 'premium', 0)
      expect(lowComparison?.percentile).toBeGreaterThanOrEqual(0)

      const highComparison = await marketDataService.compareToBenchmark('kasko', 'premium', 10000)
      expect(highComparison?.percentile).toBeLessThanOrEqual(100)
    })
  })

  describe('Coverage Importance', () => {
    it('should get coverage importance ranking', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const importance = await marketDataService.getCoverageImportance('kasko')
      expect(importance.get('Collision')).toBe(95)
      expect(importance.get('Theft')).toBe(90)
    })

    it('should return empty map for policy type without coverages', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const importance = await marketDataService.getCoverageImportance('traffic')
      expect(importance.size).toBe(0)
    })

    it('should cap importance score at 100', async () => {
      const repoWithHighInclusion = {
        ...mockBenchmarkRepository,
        benchmarks: {
          ...mockBenchmarkRepository.benchmarks,
          test: {
            type: 'test',
            commonCoverages: [{ name: 'Test', inclusionRate: 150 }],
          },
        },
      }
      mockLoadMarketData.mockResolvedValue({
        success: true,
        data: repoWithHighInclusion,
      })

      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const importance = await marketDataService.getCoverageImportance('test' as any)
      expect(importance.get('Test')).toBe(100)
    })
  })

  describe('Metadata & Quality', () => {
    it('should get metadata', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const metadata = await marketDataService.getMetadata()
      expect(metadata).toBeDefined()
      expect(metadata?.version).toBe('1.0.0')
    })

    it('should get quality metrics', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const quality = await marketDataService.getQualityMetrics()
      expect(quality).toBeDefined()
      expect(quality?.completeness).toBe(95)
    })

    it('should validate data', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const validation = await marketDataService.validateData()
      expect(mockValidateRepository).toHaveBeenCalledWith(mockBenchmarkRepository)
      expect(validation.valid).toBe(true)
    })

    it('should get stats', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const stats = await marketDataService.getStats()
      expect(stats.policyTypes).toBe(4)
      expect(stats.providers).toBe(6)
      expect(stats.regions).toBe(3)
      expect(stats.totalCoverages).toBe(5) // 3 + 2 + 0 + 0
      expect(stats.freshnessScore).toBe(85)
      expect(stats.qualityScore).toBe(90)
    })
  })

  describe('Data Refresh', () => {
    it('should check if data needs refresh', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      mockCheckDataFreshness.mockResolvedValue({ fresh: false })
      const needsRefresh = await marketDataService.needsRefresh()
      expect(needsRefresh).toBe(true)
    })

    it('should return false when data is fresh', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      mockCheckDataFreshness.mockResolvedValue({ fresh: true })
      const needsRefresh = await marketDataService.needsRefresh()
      expect(needsRefresh).toBe(false)
    })

    it('should refresh data successfully', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      const result = await marketDataService.refresh()
      expect(result).toBe(true)
      expect(mockMarketDataLoader.invalidateCache).toHaveBeenCalled()
      expect(mockLoadMarketData).toHaveBeenCalledTimes(2) // Initial + refresh
    })

    it('should return false when refresh fails', async () => {
      const { marketDataService } = await import('./market-data-service')
      await marketDataService.initialize()

      mockLoadMarketData.mockRejectedValue(new Error('Network error'))

      const result = await marketDataService.refresh()
      expect(result).toBe(false)
    })
  })

  describe('Exported Functions', () => {
    it('should export getMarketDataService', async () => {
      const { getMarketDataService, marketDataService } = await import('./market-data-service')
      expect(getMarketDataService()).toBe(marketDataService)
    })

    it('should export initializeMarketData', async () => {
      const { initializeMarketData } = await import('./market-data-service')
      await initializeMarketData()
      expect(mockLoadMarketData).toHaveBeenCalled()
    })
  })
})
