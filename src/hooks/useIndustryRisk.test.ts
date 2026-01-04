/**
 * Industry Risk Hooks Tests
 * Tests for B2B insurance risk profile and assessment hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Create mock data using vi.hoisted
const {
  mockIndustryProfile,
  mockAssessment,
  mockComparison,
  mockRankings,
  mockSimilarIndustries,
} = vi.hoisted(() => {
  const mockIndustryProfile = {
    sector: 'technology',
    name: 'Technology',
    nameTr: 'Teknoloji',
    description: 'Technology sector',
    riskLevel: 'medium',
    overallRiskScore: 0.55,
    categoryScores: {
      operational: { score: 0.4, level: 'low', weight: 0.1 },
      cyber: { score: 0.8, level: 'high', weight: 0.25 },
      liability: { score: 0.5, level: 'medium', weight: 0.15 },
    },
    coverageRequirements: [
      { type: 'cyber', importance: 'mandatory', minCoverage: 1000000 },
      { type: 'liability', importance: 'highly_recommended', minCoverage: 500000 },
    ],
    benchmarks: { avgPremium: 15000, avgClaimsRatio: 0.45 },
    premiumModifiers: {
      baseMultiplier: 1.0,
      sizeAdjustments: { micro: 0.8, small: 1.0, medium: 1.2, large: 1.5 },
      regionAdjustments: { marmara: 1.1 },
    },
    trends: {
      riskTrend: 'increasing',
      emergingRisks: ['AI liability', 'data breaches'],
    },
  }

  const mockAssessment = {
    business: { sector: 'technology', size: 'small', annualRevenue: 5000000 },
    overallScore: 0.6,
    overallRiskLevel: 'medium',
    recommendations: [],
    premiumEstimate: 18000,
  }

  const mockComparison = {
    industry1: 'technology',
    industry2: 'manufacturing',
    riskDifference: -0.15,
    premiumDifference: 5000,
    categoryDifferences: [],
  }

  const mockRankings = {
    metric: 'risk',
    rankings: [
      { sector: 'construction', rank: 1, score: 0.85 },
      { sector: 'manufacturing', rank: 2, score: 0.7 },
      { sector: 'technology', rank: 3, score: 0.55 },
    ],
  }

  const mockSimilarIndustries = [
    { sector: 'it_services', similarity: 0.9 },
    { sector: 'telecommunications', similarity: 0.75 },
  ]

  return {
    mockIndustryProfile,
    mockAssessment,
    mockComparison,
    mockRankings,
    mockSimilarIndustries,
  }
})

// Mock the profiles module
vi.mock('@/lib/industry-risk/profiles', () => ({
  INDUSTRY_PROFILES: {
    technology: mockIndustryProfile,
    manufacturing: { ...mockIndustryProfile, sector: 'manufacturing' },
  },
  getIndustryProfile: vi.fn().mockReturnValue(mockIndustryProfile),
  getAllIndustrySectors: vi.fn().mockReturnValue(['technology', 'manufacturing', 'construction']),
  getIndustriesByRisk: vi.fn().mockReturnValue([
    { sector: 'construction', score: 0.85, level: 'high' },
    { sector: 'technology', score: 0.55, level: 'medium' },
  ]),
}))

// Mock the assessment module
vi.mock('@/lib/industry-risk/assessment', () => ({
  assessBusinessRisk: vi.fn().mockReturnValue(mockAssessment),
  compareIndustries: vi.fn().mockReturnValue(mockComparison),
  getIndustryRankings: vi.fn().mockReturnValue(mockRankings),
  findSimilarIndustries: vi.fn().mockReturnValue(mockSimilarIndustries),
}))

// Mock the types module
vi.mock('@/types/industry-risk', () => ({
  getBusinessSize: vi.fn().mockImplementation((employees: number, revenue: number) => {
    if (employees < 10 && revenue < 5000000) return 'micro'
    if (employees < 50 && revenue < 50000000) return 'small'
    if (employees < 250 && revenue < 250000000) return 'medium'
    return 'large'
  }),
}))

// Import after mocking
import {
  useIndustryProfile,
  useAllIndustries,
  useBusinessRiskAssessment,
  useIndustryComparison,
  useIndustryRankings,
  useSimilarIndustries,
  useBusinessSize,
  useIndustryRiskCategories,
  useCoverageRequirements,
  usePremiumEstimate,
  useIndustryTrends,
} from './useIndustryRisk'

describe('useIndustryProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for null sector', () => {
    const { result } = renderHook(() => useIndustryProfile(null))

    expect(result.current.profile).toBeNull()
  })

  it('should return profile for sector', async () => {
    const { result } = renderHook(() => useIndustryProfile('technology'))

    expect(result.current.profile).toBeDefined()
    expect(result.current.profile?.sector).toBe('technology')
    expect(result.current.isLoading).toBe(false)
  })
})

describe('useAllIndustries', () => {
  it('should return all industries', () => {
    const { result } = renderHook(() => useAllIndustries())

    expect(result.current.industries.length).toBeGreaterThan(0)
    expect(result.current.profiles).toBeDefined()
    expect(result.current.byRisk.length).toBeGreaterThan(0)
  })
})

describe('useBusinessRiskAssessment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should start with null assessment', () => {
    const { result } = renderHook(() => useBusinessRiskAssessment())

    expect(result.current.assessment).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('should assess business risk', () => {
    const { result } = renderHook(() => useBusinessRiskAssessment())

    act(() => {
      result.current.assess({
        sector: 'technology',
        size: 'small',
        annualRevenue: 5000000,
        employeeCount: 25,
      })
    })

    expect(result.current.assessment).toBeDefined()
    expect(result.current.assessment?.overallRiskLevel).toBe('medium')
  })

  it('should provide reset function', () => {
    const { result } = renderHook(() => useBusinessRiskAssessment())

    act(() => {
      result.current.assess({
        sector: 'technology',
        size: 'small',
        annualRevenue: 5000000,
        employeeCount: 25,
      })
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.assessment).toBeNull()
  })
})

describe('useIndustryComparison', () => {
  it('should start with null comparison', () => {
    const { result } = renderHook(() => useIndustryComparison())

    expect(result.current.comparison).toBeNull()
  })

  it('should compare industries', () => {
    const { result } = renderHook(() => useIndustryComparison())

    act(() => {
      result.current.compare('technology', 'manufacturing')
    })

    expect(result.current.comparison).toBeDefined()
    expect(result.current.comparison?.riskDifference).toBeDefined()
  })
})

describe('useIndustryRankings', () => {
  it('should start with null rankings', () => {
    const { result } = renderHook(() => useIndustryRankings())

    expect(result.current.rankings).toBeNull()
  })

  it('should get rankings by metric', () => {
    const { result } = renderHook(() => useIndustryRankings())

    act(() => {
      result.current.getRankings('risk')
    })

    expect(result.current.rankings).toBeDefined()
    expect(result.current.rankings?.rankings.length).toBeGreaterThan(0)
  })
})

describe('useSimilarIndustries', () => {
  it('should return empty for null sector', () => {
    const { result } = renderHook(() => useSimilarIndustries(null))

    expect(result.current.similar).toEqual([])
  })

  it('should find similar industries', () => {
    const { result } = renderHook(() => useSimilarIndustries('technology'))

    expect(result.current.similar.length).toBeGreaterThan(0)
    expect(result.current.similar[0].similarity).toBeGreaterThan(0)
  })

  it('should respect count parameter', () => {
    const { result } = renderHook(() => useSimilarIndustries('technology', 3))

    expect(result.current.similar.length).toBeLessThanOrEqual(3)
  })
})

describe('useBusinessSize', () => {
  it('should calculate business size', () => {
    const { result } = renderHook(() => useBusinessSize(25, 10000000))

    expect(result.current.size).toBeDefined()
  })

  it('should provide calculate function', () => {
    const { result } = renderHook(() => useBusinessSize())

    const size = result.current.calculate(5, 1000000)
    expect(size).toBe('micro')
  })

  it('should return micro for small businesses', () => {
    const { result } = renderHook(() => useBusinessSize(5, 1000000))

    expect(result.current.size).toBe('micro')
  })

  it('should return small for medium-sized businesses', () => {
    const { result } = renderHook(() => useBusinessSize(25, 10000000))

    expect(result.current.size).toBe('small')
  })
})

describe('useIndustryRiskCategories', () => {
  it('should return all risk categories', () => {
    const { result } = renderHook(() => useIndustryRiskCategories())

    expect(result.current.categories.length).toBeGreaterThan(0)
    expect(result.current.categories).toContain('operational')
    expect(result.current.categories).toContain('cyber')
  })

  it('should get category score', () => {
    const { result } = renderHook(() => useIndustryRiskCategories())

    const score = result.current.getCategoryScore('technology', 'cyber')
    expect(score).toBeDefined()
    expect(score?.score).toBe(0.8)
  })

  it('should get top risk categories', () => {
    const { result } = renderHook(() => useIndustryRiskCategories())

    const top = result.current.getTopRiskCategories('technology', 3)
    expect(top.length).toBeLessThanOrEqual(3)
    expect(top[0].score).toBeGreaterThanOrEqual(top[top.length - 1].score)
  })
})

describe('useCoverageRequirements', () => {
  it('should return empty for null sector', () => {
    const { result } = renderHook(() => useCoverageRequirements(null))

    expect(result.current.requirements).toEqual([])
    expect(result.current.mandatory).toEqual([])
  })

  it('should return coverage requirements', () => {
    const { result } = renderHook(() => useCoverageRequirements('technology'))

    expect(result.current.requirements.length).toBeGreaterThan(0)
    expect(result.current.mandatory.length).toBeGreaterThan(0)
  })

  it('should separate mandatory and recommended', () => {
    const { result } = renderHook(() => useCoverageRequirements('technology'))

    result.current.mandatory.forEach((req) => {
      expect(req.importance).toBe('mandatory')
    })
  })
})

describe('usePremiumEstimate', () => {
  it('should start with null estimate', () => {
    const { result } = renderHook(() => usePremiumEstimate())

    expect(result.current.estimate).toBeNull()
  })

  it('should calculate premium estimate', () => {
    const { result } = renderHook(() => usePremiumEstimate())

    act(() => {
      result.current.calculate({
        sector: 'technology',
        size: 'small',
        revenue: 10000000,
      })
    })

    expect(result.current.estimate).toBeDefined()
    expect(result.current.estimate?.basePremium).toBeGreaterThan(0)
    expect(result.current.estimate?.adjustedPremium).toBeGreaterThan(0)
  })

  it('should include modifiers in estimate', () => {
    const { result } = renderHook(() => usePremiumEstimate())

    act(() => {
      result.current.calculate({
        sector: 'technology',
        size: 'medium',
        revenue: 50000000,
        region: 'marmara',
      })
    })

    expect(result.current.estimate?.modifiers).toBeDefined()
    expect(result.current.estimate?.modifiers.industry).toBeDefined()
    expect(result.current.estimate?.modifiers.size).toBeDefined()
    expect(result.current.estimate?.modifiers.region).toBeDefined()
  })
})

describe('useIndustryTrends', () => {
  it('should return null trends for null sector', () => {
    const { result } = renderHook(() => useIndustryTrends(null))

    expect(result.current.trends).toBeNull()
    expect(result.current.emergingRisks).toEqual([])
  })

  it('should return trends for sector', () => {
    const { result } = renderHook(() => useIndustryTrends('technology'))

    expect(result.current.trends).toBeDefined()
    expect(result.current.emergingRisks.length).toBeGreaterThan(0)
  })

  it('should identify increasing trend', () => {
    const { result } = renderHook(() => useIndustryTrends('technology'))

    expect(result.current.isIncreasing).toBe(true)
  })
})
