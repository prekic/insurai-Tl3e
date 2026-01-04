/**
 * Policy Template Hooks
 * React hooks for accessing policy templates and knowledge base
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PolicyType, Policy } from '@/types/policy'
import type {
  PolicyTemplate,
  UserProfile,
  TemplateRecommendation,
  PolicyTemplateGap,
  TemplateSearchCriteria,
  TemplateSearchResult,
  CoverageTier,
  InsuranceTerm,
  FAQEntry,
  RegulatoryRequirement,
  MarketInsight,
  BestPractice,
} from '@/types/policy-template'
import {
  getAllTemplates,
  getTemplatesByType,
  getTemplateById,
  getTemplatesByTier,
} from '@/lib/policy-templates/templates'
import {
  INSURANCE_TERMS,
  FAQ_ENTRIES,
  REGULATORY_REQUIREMENTS,
  MARKET_INSIGHTS,
  GLOBAL_BEST_PRACTICES,
  searchTerms,
  getTerm,
  searchFaqs,
  getFaqsByCategory,
  getRegulationsForPolicy,
  getRecentInsights,
  getActionableInsights,
} from '@/lib/policy-templates/knowledge-base'
import {
  findMatchingTemplates,
  analyzeTemplateGap,
  findBestTemplateForPolicy,
  searchTemplates,
  compareTemplates,
  getUpgradeRecommendation,
} from '@/lib/policy-templates/recommendations'

// =============================================================================
// Template Access Hooks
// =============================================================================

interface UseTemplatesResult {
  templates: PolicyTemplate[]
  isLoading: boolean
}

/**
 * Get all policy templates
 */
export function useAllTemplates(): UseTemplatesResult {
  const [isLoading, setIsLoading] = useState(true)

  const templates = useMemo(() => getAllTemplates(), [])

  useEffect(() => {
    setIsLoading(false)
  }, [])

  return { templates, isLoading }
}

/**
 * Get templates by policy type
 */
export function useTemplatesByType(policyType: PolicyType | null): UseTemplatesResult {
  const [isLoading, setIsLoading] = useState(true)

  const templates = useMemo(() => {
    if (!policyType) return []
    return getTemplatesByType(policyType)
  }, [policyType])

  useEffect(() => {
    setIsLoading(false)
  }, [policyType])

  return { templates, isLoading }
}

/**
 * Get templates by coverage tier
 */
export function useTemplatesByTier(tier: CoverageTier | null): UseTemplatesResult {
  const [isLoading, setIsLoading] = useState(true)

  const templates = useMemo(() => {
    if (!tier) return []
    return getTemplatesByTier(tier)
  }, [tier])

  useEffect(() => {
    setIsLoading(false)
  }, [tier])

  return { templates, isLoading }
}

/**
 * Get a specific template by ID
 */
export function useTemplate(templateId: string | null): {
  template: PolicyTemplate | null
  isLoading: boolean
} {
  const [isLoading, setIsLoading] = useState(true)

  const template = useMemo(() => {
    if (!templateId) return null
    return getTemplateById(templateId)
  }, [templateId])

  useEffect(() => {
    setIsLoading(false)
  }, [templateId])

  return { template, isLoading }
}

// =============================================================================
// Template Recommendation Hook
// =============================================================================

interface UseTemplateRecommendationsResult {
  recommendation: TemplateRecommendation | null
  isLoading: boolean
  error: string | null
  getRecommendations: (profile: UserProfile) => void
  reset: () => void
}

/**
 * Get template recommendations for a user profile
 */
export function useTemplateRecommendations(): UseTemplateRecommendationsResult {
  const [recommendation, setRecommendation] = useState<TemplateRecommendation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getRecommendations = useCallback((profile: UserProfile) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = findMatchingTemplates(profile)
      setRecommendation(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendations')
      setRecommendation(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setRecommendation(null)
    setError(null)
  }, [])

  return { recommendation, isLoading, error, getRecommendations, reset }
}

// =============================================================================
// Template Gap Analysis Hook
// =============================================================================

interface UseTemplateGapAnalysisResult {
  gap: PolicyTemplateGap | null
  isLoading: boolean
  analyze: (policy: Policy, templateId: string) => void
  findBestMatch: (policy: Policy) => PolicyTemplate | null
}

/**
 * Analyze gaps between a policy and a template
 */
export function useTemplateGapAnalysis(): UseTemplateGapAnalysisResult {
  const [gap, setGap] = useState<PolicyTemplateGap | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const analyze = useCallback((policy: Policy, templateId: string) => {
    setIsLoading(true)
    try {
      const result = analyzeTemplateGap(policy, templateId)
      setGap(result)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const findBestMatch = useCallback((policy: Policy): PolicyTemplate | null => {
    return findBestTemplateForPolicy(policy)
  }, [])

  return { gap, isLoading, analyze, findBestMatch }
}

// =============================================================================
// Template Search Hook
// =============================================================================

interface UseTemplateSearchResult {
  results: TemplateSearchResult[]
  isLoading: boolean
  search: (criteria: TemplateSearchCriteria) => void
  clear: () => void
}

/**
 * Search templates by criteria
 */
export function useTemplateSearch(): UseTemplateSearchResult {
  const [results, setResults] = useState<TemplateSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const search = useCallback((criteria: TemplateSearchCriteria) => {
    setIsLoading(true)
    try {
      const searchResults = searchTemplates(criteria)
      setResults(searchResults)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResults([])
  }, [])

  return { results, isLoading, search, clear }
}

// =============================================================================
// Template Comparison Hook
// =============================================================================

interface UseTemplateComparisonResult {
  comparison: ReturnType<typeof compareTemplates>
  isLoading: boolean
  compare: (templateIdA: string, templateIdB: string) => void
  getUpgrade: (templateId: string) => PolicyTemplate | null
}

/**
 * Compare templates
 */
export function useTemplateComparison(): UseTemplateComparisonResult {
  const [comparison, setComparison] = useState<ReturnType<typeof compareTemplates>>(null)
  const [isLoading, setIsLoading] = useState(false)

  const compare = useCallback((templateIdA: string, templateIdB: string) => {
    setIsLoading(true)
    try {
      const result = compareTemplates(templateIdA, templateIdB)
      setComparison(result)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getUpgrade = useCallback((templateId: string): PolicyTemplate | null => {
    return getUpgradeRecommendation(templateId)
  }, [])

  return { comparison, isLoading, compare, getUpgrade }
}

// =============================================================================
// Knowledge Base Hooks
// =============================================================================

interface UseInsuranceTermsResult {
  terms: InsuranceTerm[]
  search: (query: string) => InsuranceTerm[]
  getTerm: (termName: string) => InsuranceTerm | null
}

/**
 * Access insurance terms dictionary
 */
export function useInsuranceTerms(): UseInsuranceTermsResult {
  const terms = useMemo(() => INSURANCE_TERMS, [])

  const search = useCallback((query: string): InsuranceTerm[] => {
    return searchTerms(query)
  }, [])

  const getTermFn = useCallback((termName: string): InsuranceTerm | null => {
    return getTerm(termName)
  }, [])

  return { terms, search, getTerm: getTermFn }
}

interface UseFaqsResult {
  faqs: FAQEntry[]
  search: (query: string) => FAQEntry[]
  getByCategory: (category: FAQEntry['category']) => FAQEntry[]
}

/**
 * Access FAQs
 */
export function useFaqs(): UseFaqsResult {
  const faqs = useMemo(() => FAQ_ENTRIES, [])

  const search = useCallback((query: string): FAQEntry[] => {
    return searchFaqs(query)
  }, [])

  const getByCategory = useCallback((category: FAQEntry['category']): FAQEntry[] => {
    return getFaqsByCategory(category)
  }, [])

  return { faqs, search, getByCategory }
}

interface UseRegulationsResult {
  regulations: RegulatoryRequirement[]
  getForPolicy: (policyType: string) => RegulatoryRequirement[]
}

/**
 * Access regulatory requirements
 */
export function useRegulations(): UseRegulationsResult {
  const regulations = useMemo(() => REGULATORY_REQUIREMENTS, [])

  const getForPolicy = useCallback((policyType: string): RegulatoryRequirement[] => {
    return getRegulationsForPolicy(policyType)
  }, [])

  return { regulations, getForPolicy }
}

interface UseMarketInsightsResult {
  insights: MarketInsight[]
  recent: MarketInsight[]
  actionable: MarketInsight[]
  getRecent: (count?: number) => MarketInsight[]
}

/**
 * Access market insights
 */
export function useMarketInsights(): UseMarketInsightsResult {
  const insights = useMemo(() => MARKET_INSIGHTS, [])
  const recent = useMemo(() => getRecentInsights(5), [])
  const actionable = useMemo(() => getActionableInsights(), [])

  const getRecent = useCallback((count: number = 5): MarketInsight[] => {
    return getRecentInsights(count)
  }, [])

  return { insights, recent, actionable, getRecent }
}

interface UseBestPracticesResult {
  practices: BestPractice[]
  essential: BestPractice[]
  recommended: BestPractice[]
}

/**
 * Access global best practices
 */
export function useBestPractices(): UseBestPracticesResult {
  const practices = useMemo(() => GLOBAL_BEST_PRACTICES, [])

  const essential = useMemo(
    () => GLOBAL_BEST_PRACTICES.filter((bp) => bp.priority === 'essential'),
    []
  )

  const recommended = useMemo(
    () => GLOBAL_BEST_PRACTICES.filter((bp) => bp.priority === 'recommended'),
    []
  )

  return { practices, essential, recommended }
}

// =============================================================================
// Combined Knowledge Base Hook
// =============================================================================

interface UseKnowledgeBaseResult {
  terms: InsuranceTerm[]
  faqs: FAQEntry[]
  regulations: RegulatoryRequirement[]
  insights: MarketInsight[]
  bestPractices: BestPractice[]
  searchTerms: (query: string) => InsuranceTerm[]
  searchFaqs: (query: string) => FAQEntry[]
  getRegulationsForPolicy: (policyType: string) => RegulatoryRequirement[]
  getRecentInsights: (count?: number) => MarketInsight[]
}

/**
 * Access full knowledge base
 */
export function useKnowledgeBase(): UseKnowledgeBaseResult {
  return {
    terms: INSURANCE_TERMS,
    faqs: FAQ_ENTRIES,
    regulations: REGULATORY_REQUIREMENTS,
    insights: MARKET_INSIGHTS,
    bestPractices: GLOBAL_BEST_PRACTICES,
    searchTerms,
    searchFaqs,
    getRegulationsForPolicy,
    getRecentInsights,
  }
}

// =============================================================================
// Template Library Stats Hook
// =============================================================================

interface UseTemplateStatsResult {
  totalTemplates: number
  byPolicyType: Record<PolicyType, number>
  byTier: Record<CoverageTier, number>
  totalTerms: number
  totalFaqs: number
  totalRegulations: number
}

/**
 * Get template library statistics
 */
export function useTemplateStats(): UseTemplateStatsResult {
  const stats = useMemo(() => {
    const templates = getAllTemplates()

    const byPolicyType = templates.reduce(
      (acc, t) => {
        acc[t.policyType] = (acc[t.policyType] || 0) + 1
        return acc
      },
      {} as Record<PolicyType, number>
    )

    const byTier = templates.reduce(
      (acc, t) => {
        acc[t.tier] = (acc[t.tier] || 0) + 1
        return acc
      },
      {} as Record<CoverageTier, number>
    )

    return {
      totalTemplates: templates.length,
      byPolicyType,
      byTier,
      totalTerms: INSURANCE_TERMS.length,
      totalFaqs: FAQ_ENTRIES.length,
      totalRegulations: REGULATORY_REQUIREMENTS.length,
    }
  }, [])

  return stats
}
