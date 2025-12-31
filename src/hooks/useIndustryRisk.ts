/**
 * Industry Risk Hooks
 * React hooks for B2B insurance risk profiles and assessment
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type {
  IndustrySector,
  BusinessSize,
  IndustryRiskProfile,
  BusinessInfo,
  BusinessRiskAssessment,
  IndustryComparison,
  IndustryRanking,
  IndustryRiskCategory,
} from '@/types/industry-risk'
import {
  INDUSTRY_PROFILES,
  getIndustryProfile,
  getAllIndustrySectors,
  getIndustriesByRisk,
} from '@/lib/industry-risk/profiles'
import {
  assessBusinessRisk,
  compareIndustries,
  getIndustryRankings,
  findSimilarIndustries,
} from '@/lib/industry-risk/assessment'
import { getBusinessSize } from '@/types/industry-risk'

// =============================================================================
// Industry Profile Hook
// =============================================================================

interface UseIndustryProfileResult {
  profile: IndustryRiskProfile | null
  isLoading: boolean
  error: string | null
}

/**
 * Get industry risk profile for a sector
 */
export function useIndustryProfile(sector: IndustrySector | null): UseIndustryProfileResult {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const profile = useMemo(() => {
    if (!sector) return null
    try {
      return getIndustryProfile(sector)
    } catch {
      setError(`Failed to load profile for sector: ${sector}`)
      return null
    }
  }, [sector])

  useEffect(() => {
    setIsLoading(false)
  }, [sector])

  return { profile, isLoading, error }
}

// =============================================================================
// All Industries Hook
// =============================================================================

interface UseAllIndustriesResult {
  industries: IndustrySector[]
  profiles: Record<IndustrySector, IndustryRiskProfile>
  byRisk: { sector: IndustrySector; score: number; level: string }[]
  isLoading: boolean
}

/**
 * Get all industry sectors and profiles
 */
export function useAllIndustries(): UseAllIndustriesResult {
  const [isLoading, setIsLoading] = useState(true)

  const industries = useMemo(() => getAllIndustrySectors(), [])
  const profiles = useMemo(() => INDUSTRY_PROFILES, [])
  const byRisk = useMemo(() => getIndustriesByRisk(), [])

  useEffect(() => {
    setIsLoading(false)
  }, [])

  return { industries, profiles, byRisk, isLoading }
}

// =============================================================================
// Business Risk Assessment Hook
// =============================================================================

interface UseBusinessRiskAssessmentResult {
  assessment: BusinessRiskAssessment | null
  isLoading: boolean
  error: string | null
  assess: (business: BusinessInfo) => void
  reset: () => void
}

/**
 * Assess business risk based on company information
 */
export function useBusinessRiskAssessment(): UseBusinessRiskAssessmentResult {
  const [assessment, setAssessment] = useState<BusinessRiskAssessment | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assess = useCallback((business: BusinessInfo) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = assessBusinessRisk(business)
      setAssessment(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
      setAssessment(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setAssessment(null)
    setError(null)
  }, [])

  return { assessment, isLoading, error, assess, reset }
}

// =============================================================================
// Industry Comparison Hook
// =============================================================================

interface UseIndustryComparisonResult {
  comparison: IndustryComparison | null
  isLoading: boolean
  compare: (industry1: IndustrySector, industry2: IndustrySector) => void
}

/**
 * Compare two industries
 */
export function useIndustryComparison(): UseIndustryComparisonResult {
  const [comparison, setComparison] = useState<IndustryComparison | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const compare = useCallback((industry1: IndustrySector, industry2: IndustrySector) => {
    setIsLoading(true)
    try {
      const result = compareIndustries(industry1, industry2)
      setComparison(result)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { comparison, isLoading, compare }
}

// =============================================================================
// Industry Rankings Hook
// =============================================================================

interface UseIndustryRankingsResult {
  rankings: IndustryRanking | null
  isLoading: boolean
  getRankings: (metric: 'risk' | 'premium' | 'claims' | 'growth') => void
}

/**
 * Get industry rankings by metric
 */
export function useIndustryRankings(): UseIndustryRankingsResult {
  const [rankings, setRankings] = useState<IndustryRanking | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const getRankings = useCallback((metric: 'risk' | 'premium' | 'claims' | 'growth') => {
    setIsLoading(true)
    try {
      const result = getIndustryRankings(metric)
      setRankings(result)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { rankings, isLoading, getRankings }
}

// =============================================================================
// Similar Industries Hook
// =============================================================================

interface UseSimilarIndustriesResult {
  similar: { sector: IndustrySector; similarity: number }[]
  isLoading: boolean
}

/**
 * Find industries similar to the given sector
 */
export function useSimilarIndustries(
  sector: IndustrySector | null,
  count: number = 5
): UseSimilarIndustriesResult {
  const [isLoading, setIsLoading] = useState(true)

  const similar = useMemo(() => {
    if (!sector) return []
    return findSimilarIndustries(sector, count)
  }, [sector, count])

  useEffect(() => {
    setIsLoading(false)
  }, [sector])

  return { similar, isLoading }
}

// =============================================================================
// Business Size Calculator Hook
// =============================================================================

interface UseBusinessSizeResult {
  size: BusinessSize
  calculate: (employees: number, revenue: number) => BusinessSize
}

/**
 * Calculate business size from metrics
 */
export function useBusinessSize(
  employees: number = 0,
  revenue: number = 0
): UseBusinessSizeResult {
  const size = useMemo(() => getBusinessSize(employees, revenue), [employees, revenue])

  const calculate = useCallback((emp: number, rev: number) => {
    return getBusinessSize(emp, rev)
  }, [])

  return { size, calculate }
}

// =============================================================================
// Industry Risk Categories Hook
// =============================================================================

interface UseIndustryRiskCategoriesResult {
  categories: IndustryRiskCategory[]
  getCategoryScore: (
    sector: IndustrySector,
    category: IndustryRiskCategory
  ) => { score: number; level: string; weight: number } | null
  getTopRiskCategories: (
    sector: IndustrySector,
    count?: number
  ) => { category: IndustryRiskCategory; score: number }[]
}

/**
 * Work with industry risk categories
 */
export function useIndustryRiskCategories(): UseIndustryRiskCategoriesResult {
  const categories: IndustryRiskCategory[] = [
    'operational',
    'property',
    'liability',
    'employee',
    'cyber',
    'environmental',
    'product',
    'business_interruption',
    'regulatory',
    'supply_chain',
    'reputation',
    'financial',
  ]

  const getCategoryScore = useCallback(
    (sector: IndustrySector, category: IndustryRiskCategory) => {
      const profile = getIndustryProfile(sector)
      return profile.categoryScores[category] || null
    },
    []
  )

  const getTopRiskCategories = useCallback(
    (sector: IndustrySector, count: number = 5) => {
      const profile = getIndustryProfile(sector)
      const entries = Object.entries(profile.categoryScores)
        .map(([cat, data]) => ({
          category: cat as IndustryRiskCategory,
          score: data.score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count)

      return entries
    },
    []
  )

  return { categories, getCategoryScore, getTopRiskCategories }
}

// =============================================================================
// Coverage Requirements Hook
// =============================================================================

interface UseCoverageRequirementsResult {
  requirements: IndustryRiskProfile['coverageRequirements']
  mandatory: IndustryRiskProfile['coverageRequirements']
  recommended: IndustryRiskProfile['coverageRequirements']
  isLoading: boolean
}

/**
 * Get coverage requirements for an industry
 */
export function useCoverageRequirements(
  sector: IndustrySector | null
): UseCoverageRequirementsResult {
  const [isLoading, setIsLoading] = useState(true)

  const { requirements, mandatory, recommended } = useMemo(() => {
    if (!sector) {
      return { requirements: [], mandatory: [], recommended: [] }
    }

    const profile = getIndustryProfile(sector)
    const reqs = profile.coverageRequirements

    return {
      requirements: reqs,
      mandatory: reqs.filter((r) => r.importance === 'mandatory'),
      recommended: reqs.filter(
        (r) => r.importance === 'highly_recommended' || r.importance === 'recommended'
      ),
    }
  }, [sector])

  useEffect(() => {
    setIsLoading(false)
  }, [sector])

  return { requirements, mandatory, recommended, isLoading }
}

// =============================================================================
// Premium Estimate Hook
// =============================================================================

interface UsePremiumEstimateResult {
  estimate: {
    basePremium: number
    adjustedPremium: number
    perMillionRevenue: number
    modifiers: {
      industry: number
      size: number
      region: number
    }
  } | null
  calculate: (params: {
    sector: IndustrySector
    size: BusinessSize
    revenue: number
    region?: string
  }) => void
}

/**
 * Calculate premium estimates based on industry and business factors
 */
export function usePremiumEstimate(): UsePremiumEstimateResult {
  const [estimate, setEstimate] = useState<UsePremiumEstimateResult['estimate']>(null)

  const calculate = useCallback(
    (params: {
      sector: IndustrySector
      size: BusinessSize
      revenue: number
      region?: string
    }) => {
      const profile = getIndustryProfile(params.sector)
      const { premiumModifiers } = profile

      const industryMultiplier = premiumModifiers.baseMultiplier
      const sizeMultiplier = premiumModifiers.sizeAdjustments[params.size]
      const regionMultiplier =
        params.region && premiumModifiers.regionAdjustments[params.region]
          ? premiumModifiers.regionAdjustments[params.region]
          : 1.0

      // Base premium per million TRY revenue
      const basePremiumPerMillion = profile.benchmarks.avgPremium
      const revenueInMillions = params.revenue / 1000000

      const basePremium = basePremiumPerMillion * revenueInMillions
      const adjustedPremium =
        basePremium * industryMultiplier * sizeMultiplier * regionMultiplier

      setEstimate({
        basePremium,
        adjustedPremium,
        perMillionRevenue: adjustedPremium / revenueInMillions,
        modifiers: {
          industry: industryMultiplier,
          size: sizeMultiplier,
          region: regionMultiplier,
        },
      })
    },
    []
  )

  return { estimate, calculate }
}

// =============================================================================
// Industry Trends Hook
// =============================================================================

interface UseIndustryTrendsResult {
  trends: IndustryRiskProfile['trends'] | null
  emergingRisks: string[]
  isIncreasing: boolean
  isLoading: boolean
}

/**
 * Get trend data for an industry
 */
export function useIndustryTrends(sector: IndustrySector | null): UseIndustryTrendsResult {
  const [isLoading, setIsLoading] = useState(true)

  const { trends, emergingRisks, isIncreasing } = useMemo(() => {
    if (!sector) {
      return { trends: null, emergingRisks: [], isIncreasing: false }
    }

    const profile = getIndustryProfile(sector)
    return {
      trends: profile.trends,
      emergingRisks: profile.trends.emergingRisks,
      isIncreasing: profile.trends.riskTrend === 'increasing',
    }
  }, [sector])

  useEffect(() => {
    setIsLoading(false)
  }, [sector])

  return { trends, emergingRisks, isIncreasing, isLoading }
}
