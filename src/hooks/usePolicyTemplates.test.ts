/**
 * Policy Templates Hooks Tests
 * Tests for policy template library and knowledge base hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Create mock data using vi.hoisted
const {
  mockTemplate,
  mockTemplates,
  mockRecommendation,
  mockGap,
  mockSearchResult,
  mockTerms,
  mockFaqs,
  mockRegulations,
  mockInsights,
  mockBestPractices,
} = vi.hoisted(() => {
  const mockTemplate = {
    id: 'template-home-basic',
    name: 'Basic Home Insurance',
    nameTr: 'Temel Konut Sigortası',
    policyType: 'home',
    tier: 'basic',
    description: 'Basic coverage for homeowners',
    coverages: [
      { type: 'fire', limit: 100000, deductible: 1000 },
      { type: 'theft', limit: 50000, deductible: 500 },
    ],
    premiumRange: { min: 1500, max: 3000, typical: 2000 },
  }

  const mockTemplates = [
    mockTemplate,
    { ...mockTemplate, id: 'template-home-premium', tier: 'premium', name: 'Premium Home' },
  ]

  const mockRecommendation = {
    templates: mockTemplates,
    bestMatch: mockTemplate,
    score: 0.85,
    reasons: ['Matches budget', 'Good coverage'],
  }

  const mockGap = {
    policy: { id: 'policy-1' },
    template: mockTemplate,
    missingCoverages: ['earthquake'],
    insufficientLimits: [],
    overallGapScore: 0.25,
  }

  const mockSearchResult = {
    template: mockTemplate,
    score: 0.9,
    matchedCriteria: ['policyType', 'tier'],
  }

  const mockTerms = [
    { term: 'Premium', termTr: 'Prim', definition: 'Cost of insurance', category: 'general' },
    { term: 'Deductible', termTr: 'Muafiyet', definition: 'Amount paid before coverage', category: 'general' },
  ]

  const mockFaqs = [
    { id: '1', question: 'What is home insurance?', answer: 'Coverage for home', category: 'general' },
    { id: '2', question: 'How to file a claim?', answer: 'Contact provider', category: 'claims' },
  ]

  const mockRegulations = [
    { id: 'reg-1', name: 'DASK', description: 'Earthquake insurance', policyTypes: ['home'] },
  ]

  const mockInsights = [
    { id: 'insight-1', title: 'Market Update', content: 'Premiums rising', date: '2024-01-15', actionable: true },
  ]

  const mockBestPractices = [
    { id: 'bp-1', practice: 'Review annually', priority: 'essential', category: 'general' },
    { id: 'bp-2', practice: 'Document assets', priority: 'recommended', category: 'claims' },
  ]

  return {
    mockTemplate,
    mockTemplates,
    mockRecommendation,
    mockGap,
    mockSearchResult,
    mockTerms,
    mockFaqs,
    mockRegulations,
    mockInsights,
    mockBestPractices,
  }
})

// Mock the templates module
vi.mock('@/lib/policy-templates/templates', () => ({
  getAllTemplates: vi.fn().mockReturnValue(mockTemplates),
  getTemplatesByType: vi.fn().mockReturnValue(mockTemplates),
  getTemplateById: vi.fn().mockReturnValue(mockTemplate),
  getTemplatesByTier: vi.fn().mockReturnValue(mockTemplates),
}))

// Mock the knowledge base module
vi.mock('@/lib/policy-templates/knowledge-base', () => ({
  INSURANCE_TERMS: mockTerms,
  FAQ_ENTRIES: mockFaqs,
  REGULATORY_REQUIREMENTS: mockRegulations,
  MARKET_INSIGHTS: mockInsights,
  GLOBAL_BEST_PRACTICES: mockBestPractices,
  searchTerms: vi.fn().mockReturnValue(mockTerms),
  getTerm: vi.fn().mockReturnValue(mockTerms[0]),
  searchFaqs: vi.fn().mockReturnValue(mockFaqs),
  getFaqsByCategory: vi.fn().mockReturnValue([mockFaqs[0]]),
  getRegulationsForPolicy: vi.fn().mockReturnValue(mockRegulations),
  getRecentInsights: vi.fn().mockReturnValue(mockInsights),
  getActionableInsights: vi.fn().mockReturnValue(mockInsights),
}))

// Mock the recommendations module
vi.mock('@/lib/policy-templates/recommendations', () => ({
  findMatchingTemplates: vi.fn().mockReturnValue(mockRecommendation),
  analyzeTemplateGap: vi.fn().mockReturnValue(mockGap),
  findBestTemplateForPolicy: vi.fn().mockReturnValue(mockTemplate),
  searchTemplates: vi.fn().mockReturnValue([mockSearchResult]),
  compareTemplates: vi.fn().mockReturnValue({
    templateA: mockTemplate,
    templateB: mockTemplates[1],
    differences: [],
    recommendation: 'template-home-basic',
  }),
  getUpgradeRecommendation: vi.fn().mockReturnValue(mockTemplates[1]),
}))

// Import after mocking
import {
  useAllTemplates,
  useTemplatesByType,
  useTemplatesByTier,
  useTemplate,
  useTemplateRecommendations,
  useTemplateGapAnalysis,
  useTemplateSearch,
  useTemplateComparison,
  useInsuranceTerms,
  useFaqs,
  useRegulations,
  useMarketInsights,
  useBestPractices,
  useKnowledgeBase,
  useTemplateStats,
} from './usePolicyTemplates'

describe('useAllTemplates', () => {
  it('should return all templates', () => {
    const { result } = renderHook(() => useAllTemplates())

    expect(result.current.templates.length).toBeGreaterThan(0)
    expect(result.current.isLoading).toBe(false)
  })
})

describe('useTemplatesByType', () => {
  it('should return empty for null type', () => {
    const { result } = renderHook(() => useTemplatesByType(null))

    expect(result.current.templates).toEqual([])
  })

  it('should return templates by policy type', () => {
    const { result } = renderHook(() => useTemplatesByType('home'))

    expect(result.current.templates.length).toBeGreaterThan(0)
  })
})

describe('useTemplatesByTier', () => {
  it('should return empty for null tier', () => {
    const { result } = renderHook(() => useTemplatesByTier(null))

    expect(result.current.templates).toEqual([])
  })

  it('should return templates by tier', () => {
    const { result } = renderHook(() => useTemplatesByTier('basic'))

    expect(result.current.templates.length).toBeGreaterThan(0)
  })
})

describe('useTemplate', () => {
  it('should return null for null id', () => {
    const { result } = renderHook(() => useTemplate(null))

    expect(result.current.template).toBeNull()
  })

  it('should return template by id', () => {
    const { result } = renderHook(() => useTemplate('template-home-basic'))

    expect(result.current.template).toBeDefined()
    expect(result.current.template?.id).toBe('template-home-basic')
  })
})

describe('useTemplateRecommendations', () => {
  it('should start with null recommendation', () => {
    const { result } = renderHook(() => useTemplateRecommendations())

    expect(result.current.recommendation).toBeNull()
  })

  it('should get recommendations for profile', () => {
    const { result } = renderHook(() => useTemplateRecommendations())

    act(() => {
      result.current.getRecommendations({
        policyType: 'home',
        budget: 2500,
        coverageNeeds: ['fire', 'theft'],
      })
    })

    expect(result.current.recommendation).toBeDefined()
    expect(result.current.recommendation?.bestMatch).toBeDefined()
  })

  it('should provide reset function', () => {
    const { result } = renderHook(() => useTemplateRecommendations())

    act(() => {
      result.current.getRecommendations({ policyType: 'home' })
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.recommendation).toBeNull()
  })
})

describe('useTemplateGapAnalysis', () => {
  it('should start with null gap', () => {
    const { result } = renderHook(() => useTemplateGapAnalysis())

    expect(result.current.gap).toBeNull()
  })

  it('should analyze gap between policy and template', () => {
    const { result } = renderHook(() => useTemplateGapAnalysis())

    act(() => {
      result.current.analyze(
        { id: 'policy-1', type: 'home' } as never,
        'template-home-basic'
      )
    })

    expect(result.current.gap).toBeDefined()
    expect(result.current.gap?.missingCoverages).toBeDefined()
  })

  it('should find best match for policy', () => {
    const { result } = renderHook(() => useTemplateGapAnalysis())

    const match = result.current.findBestMatch({ id: 'policy-1', type: 'home' } as never)

    expect(match).toBeDefined()
  })
})

describe('useTemplateSearch', () => {
  it('should start with empty results', () => {
    const { result } = renderHook(() => useTemplateSearch())

    expect(result.current.results).toEqual([])
  })

  it('should search templates', () => {
    const { result } = renderHook(() => useTemplateSearch())

    act(() => {
      result.current.search({ policyType: 'home', tier: 'basic' })
    })

    expect(result.current.results.length).toBeGreaterThan(0)
  })

  it('should provide clear function', () => {
    const { result } = renderHook(() => useTemplateSearch())

    act(() => {
      result.current.search({ policyType: 'home' })
    })

    act(() => {
      result.current.clear()
    })

    expect(result.current.results).toEqual([])
  })
})

describe('useTemplateComparison', () => {
  it('should start with null comparison', () => {
    const { result } = renderHook(() => useTemplateComparison())

    expect(result.current.comparison).toBeNull()
  })

  it('should compare templates', () => {
    const { result } = renderHook(() => useTemplateComparison())

    act(() => {
      result.current.compare('template-home-basic', 'template-home-premium')
    })

    expect(result.current.comparison).toBeDefined()
  })

  it('should get upgrade recommendation', () => {
    const { result } = renderHook(() => useTemplateComparison())

    const upgrade = result.current.getUpgrade('template-home-basic')

    expect(upgrade).toBeDefined()
  })
})

describe('useInsuranceTerms', () => {
  it('should return all terms', () => {
    const { result } = renderHook(() => useInsuranceTerms())

    expect(result.current.terms.length).toBeGreaterThan(0)
  })

  it('should search terms', () => {
    const { result } = renderHook(() => useInsuranceTerms())

    const found = result.current.search('premium')

    expect(found.length).toBeGreaterThan(0)
  })

  it('should get term by name', () => {
    const { result } = renderHook(() => useInsuranceTerms())

    const term = result.current.getTerm('Premium')

    expect(term).toBeDefined()
    expect(term?.term).toBe('Premium')
  })
})

describe('useFaqs', () => {
  it('should return all FAQs', () => {
    const { result } = renderHook(() => useFaqs())

    expect(result.current.faqs.length).toBeGreaterThan(0)
  })

  it('should search FAQs', () => {
    const { result } = renderHook(() => useFaqs())

    const found = result.current.search('home')

    expect(found.length).toBeGreaterThan(0)
  })

  it('should get FAQs by category', () => {
    const { result } = renderHook(() => useFaqs())

    const found = result.current.getByCategory('general')

    expect(found.length).toBeGreaterThan(0)
  })
})

describe('useRegulations', () => {
  it('should return all regulations', () => {
    const { result } = renderHook(() => useRegulations())

    expect(result.current.regulations.length).toBeGreaterThan(0)
  })

  it('should get regulations for policy type', () => {
    const { result } = renderHook(() => useRegulations())

    const found = result.current.getForPolicy('home')

    expect(found.length).toBeGreaterThan(0)
  })
})

describe('useMarketInsights', () => {
  it('should return all insights', () => {
    const { result } = renderHook(() => useMarketInsights())

    expect(result.current.insights.length).toBeGreaterThan(0)
  })

  it('should return recent insights', () => {
    const { result } = renderHook(() => useMarketInsights())

    expect(result.current.recent.length).toBeGreaterThan(0)
  })

  it('should return actionable insights', () => {
    const { result } = renderHook(() => useMarketInsights())

    expect(result.current.actionable.length).toBeGreaterThan(0)
  })

  it('should get recent insights by count', () => {
    const { result } = renderHook(() => useMarketInsights())

    const recent = result.current.getRecent(3)

    expect(recent.length).toBeLessThanOrEqual(3)
  })
})

describe('useBestPractices', () => {
  it('should return all practices', () => {
    const { result } = renderHook(() => useBestPractices())

    expect(result.current.practices.length).toBeGreaterThan(0)
  })

  it('should return essential practices', () => {
    const { result } = renderHook(() => useBestPractices())

    expect(result.current.essential.length).toBeGreaterThan(0)
    result.current.essential.forEach((p) => {
      expect(p.priority).toBe('essential')
    })
  })

  it('should return recommended practices', () => {
    const { result } = renderHook(() => useBestPractices())

    expect(result.current.recommended.length).toBeGreaterThan(0)
    result.current.recommended.forEach((p) => {
      expect(p.priority).toBe('recommended')
    })
  })
})

describe('useKnowledgeBase', () => {
  it('should return full knowledge base', () => {
    const { result } = renderHook(() => useKnowledgeBase())

    expect(result.current.terms.length).toBeGreaterThan(0)
    expect(result.current.faqs.length).toBeGreaterThan(0)
    expect(result.current.regulations.length).toBeGreaterThan(0)
    expect(result.current.insights.length).toBeGreaterThan(0)
    expect(result.current.bestPractices.length).toBeGreaterThan(0)
  })

  it('should provide search functions', () => {
    const { result } = renderHook(() => useKnowledgeBase())

    expect(typeof result.current.searchTerms).toBe('function')
    expect(typeof result.current.searchFaqs).toBe('function')
    expect(typeof result.current.getRegulationsForPolicy).toBe('function')
    expect(typeof result.current.getRecentInsights).toBe('function')
  })
})

describe('useTemplateStats', () => {
  it('should return template statistics', () => {
    const { result } = renderHook(() => useTemplateStats())

    expect(result.current.totalTemplates).toBeGreaterThan(0)
    expect(result.current.totalTerms).toBeGreaterThan(0)
    expect(result.current.totalFaqs).toBeGreaterThan(0)
    expect(result.current.totalRegulations).toBeGreaterThan(0)
  })

  it('should return breakdown by policy type', () => {
    const { result } = renderHook(() => useTemplateStats())

    expect(result.current.byPolicyType).toBeDefined()
  })

  it('should return breakdown by tier', () => {
    const { result } = renderHook(() => useTemplateStats())

    expect(result.current.byTier).toBeDefined()
  })
})
