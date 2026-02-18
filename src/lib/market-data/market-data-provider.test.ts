/**
 * Market Data Provider Tests
 *
 * Tests for the MarketDataProviderImpl singleton with DB-first, static-fallback pattern.
 * Covers all 10 public methods: 6 async (DB+fallback) and 4 sync (static-only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock() is hoisted to the top of the file, so any
// variables referenced inside the factory must be created with vi.hoisted()
// to avoid "Cannot access before initialization" TDZ errors.
// ---------------------------------------------------------------------------
const {
  mockGetMarketBenchmarks,
  mockGetRegionalFactor,
  mockGetRegionalFactors,
  mockGetInsuranceProviders,
  mockStaticGetRegionalFactor,
  mockStaticCalculatePremiumPercentile,
  mockStaticCalculateCoveragePercentile,
  mockStaticFindProviderByName,
  mockStaticGetProvidersByMarketShare,
  mockStaticGetProviderRank,
  MOCK_KASKO_COVERAGES,
  MOCK_MARKET_BENCHMARKS,
  MOCK_REGIONAL_FACTORS,
  MOCK_INSURANCE_PROVIDERS,
} = vi.hoisted(() => {
  const mockGetMarketBenchmarks = vi.fn()
  const mockGetRegionalFactor = vi.fn()
  const mockGetRegionalFactors = vi.fn()
  const mockGetInsuranceProviders = vi.fn()

  const MOCK_KASKO_COVERAGES = [
    {
      name: 'Collision Damage',
      nameTr: 'Çarpma/Çarpışma',
      typicalLimit: 500000,
      minLimit: 100000,
      maxLimit: 2000000,
      typicalDeductible: 2500,
      minDeductible: 0,
      maxDeductible: 10000,
      inclusionRate: 100,
    },
    {
      name: 'Theft',
      nameTr: 'Hırsızlık',
      typicalLimit: 500000,
      minLimit: 100000,
      maxLimit: 2000000,
      typicalDeductible: 2500,
      minDeductible: 0,
      maxDeductible: 10000,
      inclusionRate: 100,
    },
  ]

  const MOCK_MARKET_BENCHMARKS: Record<string, {
    type: string; typeTr: string;
    premiumRange: { min: number; max: number; average: number; median: number; percentile25: number; percentile75: number };
    coverageRange: { min: number; max: number; average: number; median: number };
    commonCoverages: typeof MOCK_KASKO_COVERAGES;
    commonExclusions: string[];
    trends: { premiumChangeYoY: number; claimsRatio: number; marketGrowth: number };
    regionalFactors: Record<string, number>;
    dataDate: string; source: string;
  }> = {
    kasko: {
      type: 'kasko',
      typeTr: 'Kasko',
      premiumRange: { min: 5000, max: 20000, average: 10000, median: 9000, percentile25: 7000, percentile75: 13000 },
      coverageRange: { min: 200000, max: 2000000, average: 800000, median: 700000 },
      commonCoverages: MOCK_KASKO_COVERAGES,
      commonExclusions: ['Alcohol-related accidents'],
      trends: { premiumChangeYoY: 15, claimsRatio: 0.65, marketGrowth: 8 },
      regionalFactors: { marmara: 1.15, ege: 1.05, akdeniz: 1.08, ic_anadolu: 0.95, karadeniz: 0.90, dogu_anadolu: 0.85, guneydogu: 0.88 },
      dataDate: '2024-01-01',
      source: 'TSB/SEDDK',
    },
    traffic: {
      type: 'traffic',
      typeTr: 'Trafik',
      premiumRange: { min: 2000, max: 8000, average: 4000, median: 3500, percentile25: 2800, percentile75: 5200 },
      coverageRange: { min: 100000, max: 1000000, average: 400000, median: 350000 },
      commonCoverages: [],
      commonExclusions: [],
      trends: { premiumChangeYoY: 10, claimsRatio: 0.70, marketGrowth: 5 },
      regionalFactors: { marmara: 1.10, ege: 1.02, akdeniz: 1.05, ic_anadolu: 0.92, karadeniz: 0.88, dogu_anadolu: 0.82, guneydogu: 0.85 },
      dataDate: '2024-01-01',
      source: 'TSB/SEDDK',
    },
    home: {
      type: 'home',
      typeTr: 'Konut',
      premiumRange: { min: 1000, max: 5000, average: 2500, median: 2200, percentile25: 1600, percentile75: 3400 },
      coverageRange: { min: 100000, max: 1000000, average: 500000, median: 400000 },
      commonCoverages: [],
      commonExclusions: [],
      trends: { premiumChangeYoY: 8, claimsRatio: 0.55, marketGrowth: 6 },
      regionalFactors: { marmara: 1.12, ege: 1.04, akdeniz: 1.06, ic_anadolu: 0.93, karadeniz: 0.89, dogu_anadolu: 0.84, guneydogu: 0.87 },
      dataDate: '2024-01-01',
      source: 'TSB/SEDDK',
    },
  }

  const MOCK_REGIONAL_FACTORS: Record<string, { name: string; nameTr: string; factor: number }> = {
    marmara: { name: 'Marmara', nameTr: 'Marmara', factor: 1.15 },
    ege: { name: 'Aegean', nameTr: 'Ege', factor: 1.05 },
    akdeniz: { name: 'Mediterranean', nameTr: 'Akdeniz', factor: 1.08 },
    ic_anadolu: { name: 'Central Anatolia', nameTr: 'İç Anadolu', factor: 0.95 },
    karadeniz: { name: 'Black Sea', nameTr: 'Karadeniz', factor: 0.90 },
    dogu_anadolu: { name: 'Eastern Anatolia', nameTr: 'Doğu Anadolu', factor: 0.85 },
    guneydogu: { name: 'Southeastern Anatolia', nameTr: 'Güneydoğu Anadolu', factor: 0.88 },
  }

  const MOCK_INSURANCE_PROVIDERS: Record<string, {
    id: string; name: string; nameTr: string; marketShare: number;
    rating: number; established: number; headquarters: string;
  }> = {
    allianz: { id: 'allianz', name: 'Allianz Sigorta', nameTr: 'Allianz Sigorta', marketShare: 12.8, rating: 4.2, established: 1923, headquarters: 'Istanbul' },
    axa: { id: 'axa', name: 'AXA Sigorta', nameTr: 'AXA Sigorta', marketShare: 10.5, rating: 4.0, established: 1893, headquarters: 'Istanbul' },
    anadolu: { id: 'anadolu', name: 'Anadolu Sigorta', nameTr: 'Anadolu Sigorta', marketShare: 9.2, rating: 4.3, established: 1925, headquarters: 'Istanbul' },
  }

  const mockStaticGetRegionalFactor = vi.fn()
  const mockStaticCalculatePremiumPercentile = vi.fn()
  const mockStaticCalculateCoveragePercentile = vi.fn()
  const mockStaticFindProviderByName = vi.fn()
  const mockStaticGetProvidersByMarketShare = vi.fn()
  const mockStaticGetProviderRank = vi.fn()

  return {
    mockGetMarketBenchmarks,
    mockGetRegionalFactor,
    mockGetRegionalFactors,
    mockGetInsuranceProviders,
    mockStaticGetRegionalFactor,
    mockStaticCalculatePremiumPercentile,
    mockStaticCalculateCoveragePercentile,
    mockStaticFindProviderByName,
    mockStaticGetProvidersByMarketShare,
    mockStaticGetProviderRank,
    MOCK_KASKO_COVERAGES,
    MOCK_MARKET_BENCHMARKS,
    MOCK_REGIONAL_FACTORS,
    MOCK_INSURANCE_PROVIDERS,
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/config/configuration-service', () => ({
  configService: {
    getMarketBenchmarks: (...args: unknown[]) => mockGetMarketBenchmarks(...args),
    getRegionalFactor: (...args: unknown[]) => mockGetRegionalFactor(...args),
    getRegionalFactors: (...args: unknown[]) => mockGetRegionalFactors(...args),
    getInsuranceProviders: (...args: unknown[]) => mockGetInsuranceProviders(...args),
  },
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: MOCK_MARKET_BENCHMARKS,
  REGIONAL_FACTORS: MOCK_REGIONAL_FACTORS,
  calculatePremiumPercentile: (...args: unknown[]) => mockStaticCalculatePremiumPercentile(...args),
  calculateCoveragePercentile: (...args: unknown[]) => mockStaticCalculateCoveragePercentile(...args),
  getRegionalFactor: (...args: unknown[]) => mockStaticGetRegionalFactor(...args),
}))

vi.mock('@/data/market-data/providers', () => ({
  INSURANCE_PROVIDERS: MOCK_INSURANCE_PROVIDERS,
  findProviderByName: (...args: unknown[]) => mockStaticFindProviderByName(...args),
  getProvidersByMarketShare: (...args: unknown[]) => mockStaticGetProvidersByMarketShare(...args),
  getProviderRank: (...args: unknown[]) => mockStaticGetProviderRank(...args),
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks are set up)
// ---------------------------------------------------------------------------
import { marketDataProvider } from './market-data-provider'

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// getBenchmark
// =============================================================================
describe('getBenchmark', () => {
  it('returns DB benchmark data when available, merged with static', async () => {
    const dbRows = [
      {
        id: '1',
        policyType: 'kasko',
        coverageType: 'Glass Coverage',
        coverageNameTr: 'Cam Kırılması',
        regionCode: 'all',
        year: 2024,
        typicalLimit: 25000,
        minLimit: 10000,
        maxLimit: 50000,
        typicalDeductible: 500,
        minDeductible: 0,
        maxDeductible: 2000,
        inclusionRate: 85,
        importance: 'standard' as const,
        isActive: true,
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('kasko')

    expect(mockGetMarketBenchmarks).toHaveBeenCalledWith('kasko')
    // DB coverages should replace static commonCoverages
    expect(result.commonCoverages).toHaveLength(1)
    expect(result.commonCoverages[0].name).toBe('Glass Coverage')
    expect(result.commonCoverages[0].nameTr).toBe('Cam Kırılması')
    expect(result.commonCoverages[0].typicalLimit).toBe(25000)
    expect(result.commonCoverages[0].inclusionRate).toBe(85)
    // Other fields should come from static data
    expect(result.premiumRange).toEqual(MOCK_MARKET_BENCHMARKS.kasko.premiumRange)
    expect(result.trends).toEqual(MOCK_MARKET_BENCHMARKS.kasko.trends)
    expect(result.commonExclusions).toEqual(MOCK_MARKET_BENCHMARKS.kasko.commonExclusions)
    expect(result.type).toBe('kasko')
  })

  it('falls back to static data when DB returns empty array', async () => {
    mockGetMarketBenchmarks.mockResolvedValue([])

    const result = await marketDataProvider.getBenchmark('kasko')

    expect(result).toEqual(MOCK_MARKET_BENCHMARKS.kasko)
    expect(result.commonCoverages).toEqual(MOCK_KASKO_COVERAGES)
  })

  it('falls back to static data when DB throws an error', async () => {
    mockGetMarketBenchmarks.mockRejectedValue(new Error('DB connection failed'))

    const result = await marketDataProvider.getBenchmark('kasko')

    expect(result).toEqual(MOCK_MARKET_BENCHMARKS.kasko)
  })

  it('handles DB rows with missing optional fields using defaults', async () => {
    const dbRows = [
      {
        id: '2',
        policyType: 'kasko',
        coverageType: 'Minimal Coverage',
        // coverageNameTr is undefined
        regionCode: 'all',
        year: 2024,
        // All numeric fields undefined
        importance: 'optional' as const,
        isActive: true,
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('kasko')

    expect(result.commonCoverages).toHaveLength(1)
    const cov = result.commonCoverages[0]
    expect(cov.name).toBe('Minimal Coverage')
    // nameTr falls back to coverageType when coverageNameTr is undefined
    expect(cov.nameTr).toBe('Minimal Coverage')
    // All numeric fields default to 0
    expect(cov.typicalLimit).toBe(0)
    expect(cov.minLimit).toBe(0)
    expect(cov.maxLimit).toBe(0)
    expect(cov.typicalDeductible).toBe(0)
    expect(cov.minDeductible).toBe(0)
    expect(cov.maxDeductible).toBe(0)
    expect(cov.inclusionRate).toBe(0)
  })

  it('transforms multiple DB rows into CoverageBenchmark array', async () => {
    const dbRows = [
      {
        id: '1', policyType: 'kasko', coverageType: 'Fire', coverageNameTr: 'Yangın',
        regionCode: 'all', year: 2024, typicalLimit: 500000, minLimit: 100000,
        maxLimit: 2000000, typicalDeductible: 2500, minDeductible: 0, maxDeductible: 10000,
        inclusionRate: 100, importance: 'critical' as const, isActive: true,
      },
      {
        id: '2', policyType: 'kasko', coverageType: 'Glass', coverageNameTr: 'Cam',
        regionCode: 'all', year: 2024, typicalLimit: 25000, minLimit: 5000,
        maxLimit: 50000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 2000,
        inclusionRate: 85, importance: 'standard' as const, isActive: true,
      },
      {
        id: '3', policyType: 'kasko', coverageType: 'Towing', coverageNameTr: 'Çekme',
        regionCode: 'all', year: 2024, typicalLimit: 5000, minLimit: 1000,
        maxLimit: 10000, typicalDeductible: 0, minDeductible: 0, maxDeductible: 0,
        inclusionRate: 70, importance: 'optional' as const, isActive: true,
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('kasko')

    expect(result.commonCoverages).toHaveLength(3)
    expect(result.commonCoverages[0].name).toBe('Fire')
    expect(result.commonCoverages[1].name).toBe('Glass')
    expect(result.commonCoverages[2].name).toBe('Towing')
  })

  it('preserves static fields (premiumRange, trends, etc.) when merging with DB', async () => {
    const dbRows = [
      {
        id: '1', policyType: 'traffic', coverageType: 'Bodily Injury',
        coverageNameTr: 'Bedensel Hasar', regionCode: 'all', year: 2024,
        typicalLimit: 2700000, minLimit: 2700000, maxLimit: 2700000,
        typicalDeductible: 0, minDeductible: 0, maxDeductible: 0,
        inclusionRate: 100, importance: 'critical' as const, isActive: true,
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('traffic')

    // Verify all non-coverage fields come from static data
    expect(result.premiumRange).toEqual(MOCK_MARKET_BENCHMARKS.traffic.premiumRange)
    expect(result.coverageRange).toEqual(MOCK_MARKET_BENCHMARKS.traffic.coverageRange)
    expect(result.commonExclusions).toEqual(MOCK_MARKET_BENCHMARKS.traffic.commonExclusions)
    expect(result.trends).toEqual(MOCK_MARKET_BENCHMARKS.traffic.trends)
    expect(result.regionalFactors).toEqual(MOCK_MARKET_BENCHMARKS.traffic.regionalFactors)
    expect(result.dataDate).toBe(MOCK_MARKET_BENCHMARKS.traffic.dataDate)
    expect(result.source).toBe(MOCK_MARKET_BENCHMARKS.traffic.source)
    // But coverages come from DB
    expect(result.commonCoverages[0].name).toBe('Bodily Injury')
  })

  it('works for different policy types', async () => {
    mockGetMarketBenchmarks.mockResolvedValue([])

    const resultHome = await marketDataProvider.getBenchmark('home')
    expect(resultHome.type).toBe('home')
    expect(resultHome.typeTr).toBe('Konut')

    const resultTraffic = await marketDataProvider.getBenchmark('traffic')
    expect(resultTraffic.type).toBe('traffic')
  })
})

// =============================================================================
// getRegionalFactor
// =============================================================================
describe('getRegionalFactor', () => {
  it('returns DB factor when DB returns a non-1.0 value', async () => {
    mockGetRegionalFactor.mockResolvedValue(1.20)

    const result = await marketDataProvider.getRegionalFactor('kasko', 'marmara')

    expect(mockGetRegionalFactor).toHaveBeenCalledWith('marmara', 'kasko')
    expect(result).toBe(1.20)
  })

  it('returns DB factor when DB returns 1.0 and static also returns 1.0', async () => {
    // Both DB and static agree on 1.0 — use the DB value
    mockGetRegionalFactor.mockResolvedValue(1.0)
    mockStaticGetRegionalFactor.mockReturnValue(1.0)

    const result = await marketDataProvider.getRegionalFactor('kasko', 'marmara')

    expect(result).toBe(1.0)
  })

  it('tries "all" policy type in DB when DB returns 1.0 but static differs', async () => {
    // DB returns 1.0 (default fallback), but static says 1.15 (real value)
    // This triggers a second DB call with policy type "all"
    mockGetRegionalFactor
      .mockResolvedValueOnce(1.0)   // First call: getRegionalFactor('marmara', 'kasko')
      .mockResolvedValueOnce(1.18)  // Second call: getRegionalFactor('marmara', 'all')
    mockStaticGetRegionalFactor.mockReturnValue(1.15)

    const result = await marketDataProvider.getRegionalFactor('kasko', 'marmara')

    expect(mockGetRegionalFactor).toHaveBeenCalledTimes(2)
    expect(mockGetRegionalFactor).toHaveBeenNthCalledWith(1, 'marmara', 'kasko')
    expect(mockGetRegionalFactor).toHaveBeenNthCalledWith(2, 'marmara', 'all')
    expect(result).toBe(1.18)
  })

  it('returns original DB value (1.0) when "all" policy type also returns 1.0', async () => {
    // DB returns 1.0 for both specific and "all" policy types
    mockGetRegionalFactor
      .mockResolvedValueOnce(1.0)  // First call: specific policy type
      .mockResolvedValueOnce(1.0)  // Second call: "all" policy type
    mockStaticGetRegionalFactor.mockReturnValue(1.15)

    const result = await marketDataProvider.getRegionalFactor('kasko', 'marmara')

    // Falls back to the original DB value (1.0) from the first call
    expect(result).toBe(1.0)
  })

  it('falls back to static factor when DB throws an error', async () => {
    mockGetRegionalFactor.mockRejectedValue(new Error('DB unavailable'))
    mockStaticGetRegionalFactor.mockReturnValue(1.15)

    const result = await marketDataProvider.getRegionalFactor('kasko', 'marmara')

    expect(mockStaticGetRegionalFactor).toHaveBeenCalledWith('kasko', 'marmara')
    expect(result).toBe(1.15)
  })

  it('falls back to static when second DB call (all) also throws', async () => {
    mockGetRegionalFactor
      .mockResolvedValueOnce(1.0)                          // First: returns 1.0
      .mockRejectedValueOnce(new Error('DB flaky'))        // Second: throws
    mockStaticGetRegionalFactor.mockReturnValue(1.08)

    // The outer catch should trigger and use static
    const result = await marketDataProvider.getRegionalFactor('kasko', 'akdeniz')

    expect(mockStaticGetRegionalFactor).toHaveBeenCalledWith('kasko', 'akdeniz')
    expect(result).toBe(1.08)
  })

  it('returns correct static factor for different regions', async () => {
    mockGetRegionalFactor.mockRejectedValue(new Error('DB down'))

    mockStaticGetRegionalFactor.mockReturnValueOnce(0.85)
    const eastern = await marketDataProvider.getRegionalFactor('kasko', 'dogu_anadolu')
    expect(eastern).toBe(0.85)

    mockStaticGetRegionalFactor.mockReturnValueOnce(0.90)
    const blackSea = await marketDataProvider.getRegionalFactor('kasko', 'karadeniz')
    expect(blackSea).toBe(0.90)
  })
})

// =============================================================================
// getAllRegionalFactors
// =============================================================================
describe('getAllRegionalFactors', () => {
  it('merges DB factors into static regional factors', async () => {
    const dbFactors = [
      {
        id: '1', regionCode: 'marmara', regionName: 'Marmara Region',
        regionNameTr: 'Marmara Bölgesi', policyType: 'all', riskFactor: 1.22,
        year: 2025, isActive: true,
      },
      {
        id: '2', regionCode: 'ege', regionName: 'Aegean Region',
        regionNameTr: 'Ege Bölgesi', policyType: 'all', riskFactor: 1.10,
        year: 2025, isActive: true,
      },
    ]
    mockGetRegionalFactors.mockResolvedValue(dbFactors)

    const result = await marketDataProvider.getAllRegionalFactors()

    // DB-provided regions should be updated
    expect(result.marmara.name).toBe('Marmara Region')
    expect(result.marmara.nameTr).toBe('Marmara Bölgesi')
    expect(result.marmara.factor).toBe(1.22)
    expect(result.ege.name).toBe('Aegean Region')
    expect(result.ege.nameTr).toBe('Ege Bölgesi')
    expect(result.ege.factor).toBe(1.10)
    // Non-DB regions should keep static values
    expect(result.akdeniz.factor).toBe(1.08)
    expect(result.ic_anadolu.factor).toBe(0.95)
    expect(result.karadeniz.factor).toBe(0.90)
  })

  it('returns static factors when DB returns empty array', async () => {
    mockGetRegionalFactors.mockResolvedValue([])

    const result = await marketDataProvider.getAllRegionalFactors()

    expect(result).toEqual(MOCK_REGIONAL_FACTORS)
  })

  it('returns static factors when DB throws an error', async () => {
    mockGetRegionalFactors.mockRejectedValue(new Error('DB error'))

    const result = await marketDataProvider.getAllRegionalFactors()

    expect(result).toEqual(MOCK_REGIONAL_FACTORS)
  })

  it('uses DB name fields and falls back to static names when DB fields are null', async () => {
    const dbFactors = [
      {
        id: '1', regionCode: 'marmara', regionName: null, regionNameTr: null,
        policyType: 'all', riskFactor: 1.25, year: 2025, isActive: true,
      },
    ]
    mockGetRegionalFactors.mockResolvedValue(dbFactors)

    const result = await marketDataProvider.getAllRegionalFactors()

    // Factor should be from DB
    expect(result.marmara.factor).toBe(1.25)
    // Names should fall back to static since DB has null
    expect(result.marmara.name).toBe('Marmara')
    expect(result.marmara.nameTr).toBe('Marmara')
  })

  it('ignores DB region codes that do not exist in static data', async () => {
    const dbFactors = [
      {
        id: '1', regionCode: 'nonexistent_region', regionName: 'Unknown',
        regionNameTr: 'Bilinmeyen', policyType: 'all', riskFactor: 2.0,
        year: 2025, isActive: true,
      },
    ]
    mockGetRegionalFactors.mockResolvedValue(dbFactors)

    const result = await marketDataProvider.getAllRegionalFactors()

    // Unknown region should not appear; existing regions unchanged
    expect(result).not.toHaveProperty('nonexistent_region')
    expect(result.marmara.factor).toBe(1.15)
  })

  it('does not mutate the original REGIONAL_FACTORS static data', async () => {
    const dbFactors = [
      {
        id: '1', regionCode: 'marmara', regionName: 'Updated Name',
        regionNameTr: 'Güncel İsim', policyType: 'all', riskFactor: 9.99,
        year: 2025, isActive: true,
      },
    ]
    mockGetRegionalFactors.mockResolvedValue(dbFactors)

    await marketDataProvider.getAllRegionalFactors()

    // The original mock data should be untouched (spread operator creates shallow copy)
    expect(MOCK_REGIONAL_FACTORS.marmara.factor).toBe(1.15)
    expect(MOCK_REGIONAL_FACTORS.marmara.name).toBe('Marmara')
  })
})

// =============================================================================
// calculatePremiumPercentile
// =============================================================================
describe('calculatePremiumPercentile', () => {
  it('delegates to static calculatePremiumPercentile function', async () => {
    mockStaticCalculatePremiumPercentile.mockReturnValue(65)

    const result = await marketDataProvider.calculatePremiumPercentile(12000, 'kasko')

    expect(mockStaticCalculatePremiumPercentile).toHaveBeenCalledWith(12000, 'kasko', undefined)
    expect(result).toBe(65)
  })

  it('passes region parameter to static function', async () => {
    mockStaticCalculatePremiumPercentile.mockReturnValue(72)

    const result = await marketDataProvider.calculatePremiumPercentile(8000, 'kasko', 'marmara')

    expect(mockStaticCalculatePremiumPercentile).toHaveBeenCalledWith(8000, 'kasko', 'marmara')
    expect(result).toBe(72)
  })

  it('returns 0 for minimum premium', async () => {
    mockStaticCalculatePremiumPercentile.mockReturnValue(0)

    const result = await marketDataProvider.calculatePremiumPercentile(5000, 'kasko')

    expect(result).toBe(0)
  })

  it('returns 100 for maximum premium', async () => {
    mockStaticCalculatePremiumPercentile.mockReturnValue(100)

    const result = await marketDataProvider.calculatePremiumPercentile(20000, 'kasko')

    expect(result).toBe(100)
  })
})

// =============================================================================
// calculateCoveragePercentile
// =============================================================================
describe('calculateCoveragePercentile', () => {
  it('delegates to static calculateCoveragePercentile function', async () => {
    mockStaticCalculateCoveragePercentile.mockReturnValue(50)

    const result = await marketDataProvider.calculateCoveragePercentile(800000, 'kasko')

    expect(mockStaticCalculateCoveragePercentile).toHaveBeenCalledWith(800000, 'kasko')
    expect(result).toBe(50)
  })

  it('handles low coverage values', async () => {
    mockStaticCalculateCoveragePercentile.mockReturnValue(5)

    const result = await marketDataProvider.calculateCoveragePercentile(200000, 'kasko')

    expect(result).toBe(5)
  })

  it('handles high coverage values', async () => {
    mockStaticCalculateCoveragePercentile.mockReturnValue(95)

    const result = await marketDataProvider.calculateCoveragePercentile(1800000, 'kasko')

    expect(result).toBe(95)
  })
})

// =============================================================================
// getInsuranceProviders
// =============================================================================
describe('getInsuranceProviders', () => {
  it('returns DB providers when available', async () => {
    const dbProviders = [
      {
        id: 'p1', code: 'allianz', name: 'Allianz Sigorta', nameTr: 'Allianz Sigorta',
        marketShare: 13.5, customerRating: 4.3, establishedYear: 1923,
        headquarters: 'Istanbul', specialties: ['kasko', 'traffic'], isActive: true,
      },
      {
        id: 'p2', code: 'axa', name: 'AXA Sigorta', nameTr: 'AXA Sigorta',
        marketShare: 11.0, customerRating: 4.1, establishedYear: 1893,
        headquarters: 'Istanbul', specialties: ['health', 'life'], isActive: true,
      },
    ]
    mockGetInsuranceProviders.mockResolvedValue(dbProviders)

    const result = await marketDataProvider.getInsuranceProviders()

    expect(mockGetInsuranceProviders).toHaveBeenCalled()
    expect(result).toEqual(dbProviders)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when DB returns empty', async () => {
    mockGetInsuranceProviders.mockResolvedValue([])

    const result = await marketDataProvider.getInsuranceProviders()

    expect(result).toEqual([])
  })

  it('returns empty array when DB throws an error', async () => {
    mockGetInsuranceProviders.mockRejectedValue(new Error('DB connection lost'))

    const result = await marketDataProvider.getInsuranceProviders()

    expect(result).toEqual([])
  })
})

// =============================================================================
// findProviderByName (sync)
// =============================================================================
describe('findProviderByName', () => {
  it('delegates to static findProviderByName', () => {
    const expected = MOCK_INSURANCE_PROVIDERS.allianz
    mockStaticFindProviderByName.mockReturnValue(expected)

    const result = marketDataProvider.findProviderByName('Allianz')

    expect(mockStaticFindProviderByName).toHaveBeenCalledWith('Allianz')
    expect(result).toEqual(expected)
  })

  it('returns undefined for unknown provider', () => {
    mockStaticFindProviderByName.mockReturnValue(undefined)

    const result = marketDataProvider.findProviderByName('UnknownProvider')

    expect(result).toBeUndefined()
  })

  it('finds provider by partial name', () => {
    const expected = MOCK_INSURANCE_PROVIDERS.axa
    mockStaticFindProviderByName.mockReturnValue(expected)

    const result = marketDataProvider.findProviderByName('AXA')

    expect(result).toEqual(expected)
  })
})

// =============================================================================
// getProvidersByMarketShare (sync)
// =============================================================================
describe('getProvidersByMarketShare', () => {
  it('delegates to static getProvidersByMarketShare', () => {
    const sorted = [
      MOCK_INSURANCE_PROVIDERS.allianz,
      MOCK_INSURANCE_PROVIDERS.axa,
      MOCK_INSURANCE_PROVIDERS.anadolu,
    ]
    mockStaticGetProvidersByMarketShare.mockReturnValue(sorted)

    const result = marketDataProvider.getProvidersByMarketShare()

    expect(mockStaticGetProvidersByMarketShare).toHaveBeenCalled()
    expect(result).toEqual(sorted)
    expect(result[0].marketShare).toBeGreaterThanOrEqual(result[1].marketShare)
  })

  it('returns array in descending market share order', () => {
    const sorted = [
      MOCK_INSURANCE_PROVIDERS.allianz, // 12.8
      MOCK_INSURANCE_PROVIDERS.axa,     // 10.5
      MOCK_INSURANCE_PROVIDERS.anadolu, // 9.2
    ]
    mockStaticGetProvidersByMarketShare.mockReturnValue(sorted)

    const result = marketDataProvider.getProvidersByMarketShare()

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].marketShare).toBeGreaterThanOrEqual(result[i].marketShare)
    }
  })
})

// =============================================================================
// getProviderRank (sync)
// =============================================================================
describe('getProviderRank', () => {
  it('delegates to static getProviderRank', () => {
    mockStaticGetProviderRank.mockReturnValue(1)

    const result = marketDataProvider.getProviderRank('allianz')

    expect(mockStaticGetProviderRank).toHaveBeenCalledWith('allianz')
    expect(result).toBe(1)
  })

  it('returns correct rank for different providers', () => {
    mockStaticGetProviderRank.mockReturnValue(2)

    const result = marketDataProvider.getProviderRank('axa')

    expect(result).toBe(2)
  })

  it('returns 0 for provider not found', () => {
    mockStaticGetProviderRank.mockReturnValue(0)

    const result = marketDataProvider.getProviderRank('nonexistent')

    expect(result).toBe(0)
  })
})

// =============================================================================
// getProviderCount (sync)
// =============================================================================
describe('getProviderCount', () => {
  it('returns the number of providers in INSURANCE_PROVIDERS', () => {
    const result = marketDataProvider.getProviderCount()

    expect(result).toBe(Object.keys(MOCK_INSURANCE_PROVIDERS).length)
    expect(result).toBe(3)
  })
})

// =============================================================================
// dbRowsToCoverageBenchmarks (tested indirectly via getBenchmark)
// =============================================================================
describe('dbRowsToCoverageBenchmarks (indirect)', () => {
  it('maps coverageType to name and all fields correctly', async () => {
    const dbRows = [
      {
        id: '1', policyType: 'kasko', coverageType: 'Personal Accident',
        coverageNameTr: 'Ferdi Kaza', regionCode: 'all', year: 2024,
        typicalLimit: 100000, minLimit: 25000, maxLimit: 500000,
        typicalDeductible: 1000, minDeductible: 0, maxDeductible: 5000,
        inclusionRate: 70, importance: 'standard' as const, isActive: true,
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('kasko')

    const cov = result.commonCoverages[0]
    expect(cov.name).toBe('Personal Accident')
    expect(cov.nameTr).toBe('Ferdi Kaza')
    expect(cov.typicalLimit).toBe(100000)
    expect(cov.minLimit).toBe(25000)
    expect(cov.maxLimit).toBe(500000)
    expect(cov.typicalDeductible).toBe(1000)
    expect(cov.minDeductible).toBe(0)
    expect(cov.maxDeductible).toBe(5000)
    expect(cov.inclusionRate).toBe(70)
  })

  it('defaults all numeric fields to 0 when undefined', async () => {
    const dbRows = [
      {
        id: '1', policyType: 'kasko', coverageType: 'Bare Minimum',
        regionCode: 'all', year: 2024,
        importance: 'optional' as const, isActive: true,
        // All numeric fields omitted
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('kasko')

    const cov = result.commonCoverages[0]
    expect(cov.typicalLimit).toBe(0)
    expect(cov.minLimit).toBe(0)
    expect(cov.maxLimit).toBe(0)
    expect(cov.typicalDeductible).toBe(0)
    expect(cov.minDeductible).toBe(0)
    expect(cov.maxDeductible).toBe(0)
    expect(cov.inclusionRate).toBe(0)
  })

  it('uses coverageType as nameTr fallback when coverageNameTr is null', async () => {
    const dbRows = [
      {
        id: '1', policyType: 'kasko', coverageType: 'Road Assistance',
        coverageNameTr: null,
        regionCode: 'all', year: 2024, typicalLimit: 5000,
        importance: 'optional' as const, isActive: true,
      },
    ]
    mockGetMarketBenchmarks.mockResolvedValue(dbRows)

    const result = await marketDataProvider.getBenchmark('kasko')

    expect(result.commonCoverages[0].nameTr).toBe('Road Assistance')
  })
})

// =============================================================================
// Edge cases and integration behavior
// =============================================================================
describe('edge cases', () => {
  it('getBenchmark handles policy types with empty static coverages', async () => {
    mockGetMarketBenchmarks.mockResolvedValue([])

    // 'home' exists in mock data but has empty commonCoverages
    const result = await marketDataProvider.getBenchmark('home')

    expect(result.type).toBe('home')
    expect(result.commonCoverages).toEqual([])
  })

  it('singleton instance is always the same object', async () => {
    // Verify the exported instance is consistent
    const { marketDataProvider: provider2 } = await import('./market-data-provider')

    expect(provider2).toBe(marketDataProvider)
  })

  it('getRegionalFactor skips "all" fallback when DB returns 1.0 and static is also 1.0', async () => {
    // This tests the branch where factor === 1.0 AND staticFactor === 1.0
    // In this case, the second DB call for "all" should NOT be made
    mockGetRegionalFactor.mockResolvedValue(1.0)
    mockStaticGetRegionalFactor.mockReturnValue(1.0)

    const result = await marketDataProvider.getRegionalFactor('home', 'ic_anadolu')

    // Should only call once (no "all" fallback needed since static also returns 1.0)
    expect(mockGetRegionalFactor).toHaveBeenCalledTimes(1)
    expect(result).toBe(1.0)
  })

  it('getAllRegionalFactors returns all 7 Turkish regions', async () => {
    mockGetRegionalFactors.mockResolvedValue([])

    const result = await marketDataProvider.getAllRegionalFactors()

    const regionKeys = Object.keys(result)
    expect(regionKeys).toContain('marmara')
    expect(regionKeys).toContain('ege')
    expect(regionKeys).toContain('akdeniz')
    expect(regionKeys).toContain('ic_anadolu')
    expect(regionKeys).toContain('karadeniz')
    expect(regionKeys).toContain('dogu_anadolu')
    expect(regionKeys).toContain('guneydogu')
    expect(regionKeys).toHaveLength(7)
  })

  it('concurrent calls to getBenchmark do not interfere with each other', async () => {
    mockGetMarketBenchmarks.mockImplementation(async (policyType: string) => {
      if (policyType === 'kasko') {
        return [
          {
            id: '1', policyType: 'kasko', coverageType: 'DB Kasko Coverage',
            coverageNameTr: 'DB Kasko', regionCode: 'all', year: 2024,
            typicalLimit: 999999, importance: 'critical' as const, isActive: true,
          },
        ]
      }
      return []
    })

    const [kaskoResult, trafficResult, homeResult] = await Promise.all([
      marketDataProvider.getBenchmark('kasko'),
      marketDataProvider.getBenchmark('traffic'),
      marketDataProvider.getBenchmark('home'),
    ])

    expect(kaskoResult.commonCoverages[0].name).toBe('DB Kasko Coverage')
    expect(trafficResult.commonCoverages).toEqual([]) // static fallback (empty)
    expect(homeResult.commonCoverages).toEqual([])     // static fallback (empty)
  })

  it('getInsuranceProviders does not fall back to static — returns empty array', async () => {
    // Unlike getBenchmark which falls back to static, getInsuranceProviders returns []
    mockGetInsuranceProviders.mockRejectedValue(new Error('DB error'))

    const result = await marketDataProvider.getInsuranceProviders()

    expect(result).toEqual([])
    expect(result).not.toBe(MOCK_INSURANCE_PROVIDERS)
  })

  it('getBenchmark error does not propagate — returns static data gracefully', async () => {
    mockGetMarketBenchmarks.mockRejectedValue(new TypeError('Network failure'))

    // Should not throw
    const result = await marketDataProvider.getBenchmark('kasko')

    expect(result).toBeDefined()
    expect(result.type).toBe('kasko')
  })

  it('getAllRegionalFactors with partial DB data preserves all regions', async () => {
    // Only update 1 region via DB — other 6 should remain from static
    const dbFactors = [
      {
        id: '1', regionCode: 'guneydogu', regionName: 'Southeast',
        regionNameTr: 'Güneydoğu', policyType: 'all', riskFactor: 0.92,
        year: 2025, isActive: true,
      },
    ]
    mockGetRegionalFactors.mockResolvedValue(dbFactors)

    const result = await marketDataProvider.getAllRegionalFactors()

    expect(result.guneydogu.factor).toBe(0.92)
    expect(result.guneydogu.name).toBe('Southeast')
    // All other regions untouched
    expect(result.marmara.factor).toBe(1.15)
    expect(result.ege.factor).toBe(1.05)
    expect(result.akdeniz.factor).toBe(1.08)
    expect(result.ic_anadolu.factor).toBe(0.95)
    expect(result.karadeniz.factor).toBe(0.90)
    expect(result.dogu_anadolu.factor).toBe(0.85)
  })
})
