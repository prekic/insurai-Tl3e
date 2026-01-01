/**
 * Regional Benchmark Hooks Tests
 * Tests for location intelligence and regional comparison hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Create mock data using vi.hoisted
const {
  mockRiskProfile,
  mockStats,
  mockPremiumBenchmark,
  mockRankedRegions,
  mockComparison,
  mockLocationAnalysis,
  mockNearbyComparison,
  mockNationalStats,
  mockRankings,
} = vi.hoisted(() => {
  const mockRiskProfile = {
    region: 'marmara',
    earthquakeZone: 1,
    floodRisk: 'medium',
    overallRiskScore: 0.75,
  }

  const mockStats = {
    region: 'marmara',
    totalPolicies: 1000000,
    averagePremium: 3500,
    penetrationRate: 0.45,
    claimsRatio: 0.68,
  }

  const mockPremiumBenchmark = {
    region: 'marmara',
    policyType: 'home',
    minPremium: 1500,
    maxPremium: 8000,
    avgPremium: 3500,
    medianPremium: 3200,
  }

  const mockRankedRegions = [
    { region: 'marmara', rank: 1, value: 0.75 },
    { region: 'ic-anadolu', rank: 2, value: 0.65 },
    { region: 'ege', rank: 3, value: 0.60 },
  ]

  const mockComparison = {
    sourceRegion: 'marmara',
    targetRegion: 'ege',
    premiumDifference: {
      amount: -500,
      percentage: -14.3,
    },
    riskDifference: 0.15,
  }

  const mockLocationAnalysis = {
    address: 'Istanbul, Marmara',
    region: 'marmara',
    province: { code: '34', name: 'Istanbul', nameTr: 'İstanbul', region: 'marmara' },
    riskFactors: ['earthquake', 'density'],
  }

  const mockNearbyComparison = {
    centerProvince: { code: '34', name: 'Istanbul', nameTr: 'İstanbul', region: 'marmara' },
    nearbyProvinces: [],
    premiumComparison: [],
  }

  const mockNationalStats = {
    totalPolicies: 10000000,
    averagePremium: 3000,
    totalClaims: 500000,
  }

  const mockRankings = {
    metric: 'premium',
    policyType: 'home',
    rankings: mockRankedRegions,
  }

  return {
    mockRiskProfile,
    mockStats,
    mockPremiumBenchmark,
    mockRankedRegions,
    mockComparison,
    mockLocationAnalysis,
    mockNearbyComparison,
    mockNationalStats,
    mockRankings,
  }
})

// Mock the data module
vi.mock('@/lib/regional-benchmark/data', () => ({
  PROVINCES: {
    '34': { code: '34', name: 'Istanbul', nameTr: 'İstanbul', region: 'marmara' },
    '06': { code: '06', name: 'Ankara', nameTr: 'Ankara', region: 'ic-anadolu' },
    '35': { code: '35', name: 'Izmir', nameTr: 'İzmir', region: 'ege' },
  },
  getProvincesByRegion: vi.fn().mockReturnValue([
    { code: '34', name: 'Istanbul', nameTr: 'İstanbul', region: 'marmara' },
  ]),
  getRegionalRiskProfile: vi.fn().mockReturnValue(mockRiskProfile),
  getRegionalInsuranceStats: vi.fn().mockReturnValue(mockStats),
  getRegionalPremiumBenchmarks: vi.fn().mockReturnValue({
    marmara: mockPremiumBenchmark,
    ege: { ...mockPremiumBenchmark, region: 'ege', avgPremium: 3000 },
  }),
  calculateRegionalRiskScore: vi.fn().mockReturnValue(0.75),
  getRankedRegions: vi.fn().mockReturnValue(mockRankedRegions),
}))

// Mock the comparison module
vi.mock('@/lib/regional-benchmark/comparison', () => ({
  compareRegions: vi.fn().mockReturnValue(mockComparison),
  compareAllRegions: vi.fn().mockReturnValue([mockComparison]),
  analyzeLocation: vi.fn().mockReturnValue(mockLocationAnalysis),
  compareNearbyProvinces: vi.fn().mockReturnValue(mockNearbyComparison),
  getNationalStatistics: vi.fn().mockReturnValue(mockNationalStats),
  getRegionalRankings: vi.fn().mockReturnValue(mockRankings),
}))

// Import after mocking
import {
  useRegionalRisk,
  useRegionalStats,
  useRegionalPremiums,
  useAllRegionalPremiums,
  useRegionComparison,
  useAllRegionComparisons,
  useLocationAnalysis,
  useNearbyComparison,
  useProvinces,
  useProvinceSearch,
  useNationalStatistics,
  useRegionalRankings,
  useRegionalBenchmark,
} from './useRegionalBenchmark'

describe('useRegionalRisk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return risk profile for region', () => {
    const { result } = renderHook(() => useRegionalRisk('marmara'))

    expect(result.current.riskProfile).toBeDefined()
    expect(result.current.riskProfile.region).toBe('marmara')
  })

  it('should return risk score', () => {
    const { result } = renderHook(() => useRegionalRisk('marmara'))

    expect(result.current.riskScore).toBe(0.75)
  })

  it('should return ranking', () => {
    const { result } = renderHook(() => useRegionalRisk('marmara'))

    expect(result.current.ranking).toBeDefined()
    expect(result.current.ranking.rank).toBe(1)
    expect(result.current.ranking.total).toBeGreaterThan(0)
  })
})

describe('useRegionalStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return regional statistics', () => {
    const { result } = renderHook(() => useRegionalStats('marmara'))

    expect(result.current.stats).toBeDefined()
    expect(result.current.stats.region).toBe('marmara')
    expect(result.current.stats.totalPolicies).toBeGreaterThan(0)
  })

  it('should return market position', () => {
    const { result } = renderHook(() => useRegionalStats('marmara'))

    expect(result.current.marketPosition).toBeDefined()
    expect(result.current.marketPosition.premiumRank).toBeDefined()
    expect(result.current.marketPosition.penetrationRank).toBeDefined()
  })
})

describe('useRegionalPremiums', () => {
  it('should return premium benchmark for region and policy type', () => {
    const { result } = renderHook(() => useRegionalPremiums('marmara', 'home'))

    expect(result.current).toBeDefined()
    expect(result.current.avgPremium).toBe(3500)
  })
})

describe('useAllRegionalPremiums', () => {
  it('should return all regional premium benchmarks', () => {
    const { result } = renderHook(() => useAllRegionalPremiums('home'))

    expect(result.current).toBeDefined()
    expect(result.current.marmara).toBeDefined()
  })
})

describe('useRegionComparison', () => {
  it('should compare two regions', () => {
    const { result } = renderHook(() =>
      useRegionComparison('marmara', 'ege', 'home')
    )

    expect(result.current).toBeDefined()
    expect(result.current.sourceRegion).toBe('marmara')
    expect(result.current.targetRegion).toBe('ege')
    expect(result.current.premiumDifference).toBeDefined()
  })
})

describe('useAllRegionComparisons', () => {
  it('should compare against all regions', () => {
    const { result } = renderHook(() =>
      useAllRegionComparisons('marmara', 'home')
    )

    expect(result.current.comparisons).toBeDefined()
    expect(Array.isArray(result.current.comparisons)).toBe(true)
  })

  it('should identify cheapest and most expensive regions', () => {
    const { result } = renderHook(() =>
      useAllRegionComparisons('marmara', 'home')
    )

    expect(result.current.cheapestRegion).toBeDefined()
    expect(result.current.savingsRange).toBeDefined()
  })
})

describe('useLocationAnalysis', () => {
  it('should return null for undefined address', () => {
    const { result } = renderHook(() => useLocationAnalysis(undefined))

    expect(result.current.analysis).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('should analyze address', () => {
    const { result } = renderHook(() => useLocationAnalysis('Istanbul'))

    expect(result.current.analysis).toBeDefined()
    expect(result.current.analysis?.region).toBe('marmara')
  })

  it('should provide refresh function', () => {
    const { result } = renderHook(() => useLocationAnalysis('Istanbul'))

    expect(typeof result.current.refresh).toBe('function')

    act(() => {
      result.current.refresh()
    })
  })
})

describe('useNearbyComparison', () => {
  it('should return null for undefined province', () => {
    const { result } = renderHook(() => useNearbyComparison(undefined, 'home'))

    expect(result.current).toBeNull()
  })

  it('should compare nearby provinces', () => {
    const province = { code: '34', name: 'Istanbul', nameTr: 'İstanbul', region: 'marmara' as const }
    const { result } = renderHook(() => useNearbyComparison(province, 'home'))

    expect(result.current).toBeDefined()
    expect(result.current?.centerProvince).toBeDefined()
  })
})

describe('useProvinces', () => {
  it('should return all provinces when no region specified', () => {
    const { result } = renderHook(() => useProvinces())

    expect(result.current.length).toBeGreaterThan(0)
  })

  it('should filter by region', () => {
    const { result } = renderHook(() => useProvinces('marmara'))

    expect(result.current.length).toBeGreaterThan(0)
    expect(result.current[0].region).toBe('marmara')
  })
})

describe('useProvinceSearch', () => {
  it('should return empty for short query', () => {
    const { result } = renderHook(() => useProvinceSearch('I'))

    expect(result.current).toEqual([])
  })

  it('should search provinces by name', () => {
    const { result } = renderHook(() => useProvinceSearch('Istanbul'))

    expect(Array.isArray(result.current)).toBe(true)
  })
})

describe('useNationalStatistics', () => {
  it('should return national statistics', () => {
    const { result } = renderHook(() => useNationalStatistics())

    expect(result.current).toBeDefined()
    expect(result.current.totalPolicies).toBeGreaterThan(0)
    expect(result.current.averagePremium).toBeGreaterThan(0)
  })
})

describe('useRegionalRankings', () => {
  it('should return rankings by metric', () => {
    const { result } = renderHook(() => useRegionalRankings('home', 'premium'))

    expect(result.current).toBeDefined()
    expect(result.current.rankings).toBeDefined()
    expect(result.current.rankings.length).toBeGreaterThan(0)
  })
})

describe('useRegionalBenchmark', () => {
  it('should combine all regional data', () => {
    const { result } = renderHook(() => useRegionalBenchmark('marmara', 'home'))

    // Risk data
    expect(result.current.riskProfile).toBeDefined()
    expect(result.current.riskScore).toBeDefined()

    // Stats
    expect(result.current.stats).toBeDefined()
    expect(result.current.premiumBenchmark).toBeDefined()

    // Comparisons
    expect(result.current.comparedToAll).toBeDefined()

    // Rankings
    expect(result.current.premiumRank).toBeDefined()
    expect(result.current.riskRank).toBeDefined()
    expect(result.current.valueRank).toBeDefined()

    // National context
    expect(result.current.nationalStats).toBeDefined()
  })

  it('should calculate potential savings', () => {
    const { result } = renderHook(() => useRegionalBenchmark('marmara', 'home'))

    expect(typeof result.current.potentialSavings).toBe('number')
  })

  it('should identify cheapest alternative', () => {
    const { result } = renderHook(() => useRegionalBenchmark('marmara', 'home'))

    expect(result.current.cheapestAlternative).toBeDefined()
  })
})
