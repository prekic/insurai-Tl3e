/**
 * Tests for Insurance Knowledge Base
 */

import { describe, it, expect } from 'vitest'
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
} from './knowledge-base'

// =============================================================================
// Data Structure Tests
// =============================================================================

describe('INSURANCE_TERMS', () => {
  it('should contain insurance terms', () => {
    expect(INSURANCE_TERMS.length).toBeGreaterThan(0)
  })

  it('should have proper term structure', () => {
    const term = INSURANCE_TERMS[0]
    expect(term).toHaveProperty('term')
    expect(term).toHaveProperty('termTr')
    expect(term).toHaveProperty('definition')
    expect(term).toHaveProperty('definitionTr')
    expect(term).toHaveProperty('category')
  })

  it('should have relatedTerms as arrays', () => {
    INSURANCE_TERMS.forEach((term) => {
      if (term.relatedTerms) {
        expect(Array.isArray(term.relatedTerms)).toBe(true)
      }
    })
  })

  it('should contain Turkish-specific terms', () => {
    const turkishTerms = ['DASK', 'Kasko', 'Traffic Insurance', 'SEDDK', 'TSB']
    const termNames = INSURANCE_TERMS.map((t) => t.term)
    turkishTerms.forEach((turkishTerm) => {
      expect(termNames).toContain(turkishTerm)
    })
  })

  it('should have examples for some terms', () => {
    const termsWithExamples = INSURANCE_TERMS.filter((t) => t.example)
    expect(termsWithExamples.length).toBeGreaterThan(0)
    termsWithExamples.forEach((term) => {
      expect(term.exampleTr).toBeDefined()
    })
  })
})

describe('FAQ_ENTRIES', () => {
  it('should contain FAQ entries', () => {
    expect(FAQ_ENTRIES.length).toBeGreaterThan(0)
  })

  it('should have proper FAQ structure', () => {
    const faq = FAQ_ENTRIES[0]
    expect(faq).toHaveProperty('id')
    expect(faq).toHaveProperty('question')
    expect(faq).toHaveProperty('questionTr')
    expect(faq).toHaveProperty('answer')
    expect(faq).toHaveProperty('answerTr')
    expect(faq).toHaveProperty('category')
    expect(faq).toHaveProperty('tags')
  })

  it('should have unique IDs', () => {
    const ids = FAQ_ENTRIES.map((f) => f.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have tags as arrays', () => {
    FAQ_ENTRIES.forEach((faq) => {
      expect(Array.isArray(faq.tags)).toBe(true)
      expect(faq.tags.length).toBeGreaterThan(0)
    })
  })

  it('should have voting counters initialized', () => {
    FAQ_ENTRIES.forEach((faq) => {
      expect(typeof faq.helpful).toBe('number')
      expect(typeof faq.notHelpful).toBe('number')
    })
  })
})

describe('REGULATORY_REQUIREMENTS', () => {
  it('should contain regulatory requirements', () => {
    expect(REGULATORY_REQUIREMENTS.length).toBeGreaterThan(0)
  })

  it('should have proper structure', () => {
    const reg = REGULATORY_REQUIREMENTS[0]
    expect(reg).toHaveProperty('id')
    expect(reg).toHaveProperty('name')
    expect(reg).toHaveProperty('nameTr')
    expect(reg).toHaveProperty('description')
    expect(reg).toHaveProperty('applicableTo')
    expect(reg).toHaveProperty('mandatoryCoverages')
    expect(reg).toHaveProperty('minimumLimits')
    expect(reg).toHaveProperty('effectiveDate')
  })

  it('should have DASK regulation', () => {
    const dask = REGULATORY_REQUIREMENTS.find((r) => r.id === 'reg-dask')
    expect(dask).toBeDefined()
    expect(dask!.applicableTo).toContain('dask')
    expect(dask!.mandatoryCoverages).toContain('earthquake')
  })

  it('should have traffic insurance regulation', () => {
    const traffic = REGULATORY_REQUIREMENTS.find((r) => r.id === 'reg-traffic')
    expect(traffic).toBeDefined()
    expect(traffic!.applicableTo).toContain('traffic')
    expect(traffic!.penalties).toBeDefined()
  })

  it('should have valid dates', () => {
    REGULATORY_REQUIREMENTS.forEach((reg) => {
      const date = new Date(reg.effectiveDate)
      expect(date.getTime()).not.toBeNaN()
    })
  })
})

describe('MARKET_INSIGHTS', () => {
  it('should contain market insights', () => {
    expect(MARKET_INSIGHTS.length).toBeGreaterThan(0)
  })

  it('should have proper structure', () => {
    const insight = MARKET_INSIGHTS[0]
    expect(insight).toHaveProperty('id')
    expect(insight).toHaveProperty('title')
    expect(insight).toHaveProperty('titleTr')
    expect(insight).toHaveProperty('insight')
    expect(insight).toHaveProperty('insightTr')
    expect(insight).toHaveProperty('category')
    expect(insight).toHaveProperty('policyTypes')
    expect(insight).toHaveProperty('date')
    expect(insight).toHaveProperty('impact')
  })

  it('should have valid impact levels', () => {
    const validImpacts = ['high', 'medium', 'low']
    MARKET_INSIGHTS.forEach((insight) => {
      expect(validImpacts).toContain(insight.impact)
    })
  })

  it('should have some actionable insights', () => {
    const actionable = MARKET_INSIGHTS.filter((i) => i.actionable)
    expect(actionable.length).toBeGreaterThan(0)
    actionable.forEach((insight) => {
      expect(insight.recommendation).toBeDefined()
      expect(insight.recommendationTr).toBeDefined()
    })
  })
})

describe('GLOBAL_BEST_PRACTICES', () => {
  it('should contain best practices', () => {
    expect(GLOBAL_BEST_PRACTICES.length).toBeGreaterThan(0)
  })

  it('should have proper structure', () => {
    const bp = GLOBAL_BEST_PRACTICES[0]
    expect(bp).toHaveProperty('id')
    expect(bp).toHaveProperty('title')
    expect(bp).toHaveProperty('titleTr')
    expect(bp).toHaveProperty('description')
    expect(bp).toHaveProperty('category')
    expect(bp).toHaveProperty('priority')
    expect(bp).toHaveProperty('guidance')
    expect(bp).toHaveProperty('guidanceTr')
    expect(bp).toHaveProperty('pitfalls')
    expect(bp).toHaveProperty('pitfallsTr')
  })

  it('should have valid priority levels', () => {
    const validPriorities = ['essential', 'recommended', 'optional']
    GLOBAL_BEST_PRACTICES.forEach((bp) => {
      expect(validPriorities).toContain(bp.priority)
    })
  })

  it('should have guidance arrays with content', () => {
    GLOBAL_BEST_PRACTICES.forEach((bp) => {
      expect(Array.isArray(bp.guidance)).toBe(true)
      expect(bp.guidance.length).toBeGreaterThan(0)
      expect(bp.guidanceTr.length).toBe(bp.guidance.length)
    })
  })
})

// =============================================================================
// Search Functions Tests
// =============================================================================

describe('searchTerms', () => {
  it('should find terms by English name', () => {
    const results = searchTerms('premium')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((t) => t.term.toLowerCase().includes('premium'))).toBe(true)
  })

  it('should find terms by Turkish name', () => {
    const results = searchTerms('prim')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should find terms by definition content', () => {
    const results = searchTerms('insurance policy')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should be case insensitive', () => {
    const lowerResults = searchTerms('deductible')
    const upperResults = searchTerms('DEDUCTIBLE')
    expect(lowerResults.length).toBe(upperResults.length)
  })

  it('should return empty array for non-matching query', () => {
    const results = searchTerms('xyznonexistent123')
    expect(results).toEqual([])
  })

  it('should find DASK-related terms', () => {
    const results = searchTerms('DASK')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((t) => t.term === 'DASK')).toBe(true)
  })
})

describe('getTerm', () => {
  it('should find term by exact English name', () => {
    const term = getTerm('Premium')
    expect(term).not.toBeNull()
    expect(term!.term).toBe('Premium')
  })

  it('should find term by exact Turkish name', () => {
    const term = getTerm('Prim')
    expect(term).not.toBeNull()
    expect(term!.termTr).toBe('Prim')
  })

  it('should be case insensitive', () => {
    const term1 = getTerm('premium')
    const term2 = getTerm('PREMIUM')
    expect(term1).toEqual(term2)
  })

  it('should return null for non-existent term', () => {
    const term = getTerm('NonExistentTerm')
    expect(term).toBeNull()
  })

  it('should find Turkish-specific terms', () => {
    const kasko = getTerm('Kasko')
    expect(kasko).not.toBeNull()
    expect(kasko!.definition).toContain('auto insurance')
  })
})

describe('searchFaqs', () => {
  it('should find FAQs by question content', () => {
    const results = searchFaqs('claim')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should find FAQs by Turkish question content', () => {
    const results = searchFaqs('hasar')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should find FAQs by answer content', () => {
    const results = searchFaqs('insurer')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should find FAQs by tags', () => {
    const results = searchFaqs('documentation')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should be case insensitive', () => {
    const lower = searchFaqs('claim')
    const upper = searchFaqs('CLAIM')
    expect(lower.length).toBe(upper.length)
  })

  it('should return empty array for non-matching query', () => {
    const results = searchFaqs('xyznonexistent123')
    expect(results).toEqual([])
  })
})

describe('getFaqsByCategory', () => {
  it('should find FAQs by claims category', () => {
    const results = getFaqsByCategory('claims')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((faq) => {
      expect(faq.category).toBe('claims')
    })
  })

  it('should find FAQs by general category', () => {
    const results = getFaqsByCategory('general')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((faq) => {
      expect(faq.category).toBe('general')
    })
  })

  it('should find FAQs by home category', () => {
    const results = getFaqsByCategory('home')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((faq) => {
      expect(faq.category).toBe('home')
    })
  })

  it('should find FAQs by kasko category', () => {
    const results = getFaqsByCategory('kasko')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((faq) => {
      expect(faq.category).toBe('kasko')
    })
  })

  it('should return empty array for non-existent category', () => {
    const results = getFaqsByCategory('nonexistent' as never)
    expect(results).toEqual([])
  })
})

describe('getRegulationsForPolicy', () => {
  it('should find regulations for home policies', () => {
    const results = getRegulationsForPolicy('home')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should find regulations for DASK', () => {
    const results = getRegulationsForPolicy('dask')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.id === 'reg-dask')).toBe(true)
  })

  it('should find regulations for traffic insurance', () => {
    const results = getRegulationsForPolicy('traffic')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.id === 'reg-traffic')).toBe(true)
  })

  it('should find regulations for business', () => {
    const results = getRegulationsForPolicy('business')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should return empty array for policy type with no regulations', () => {
    const results = getRegulationsForPolicy('nonexistent')
    expect(results).toEqual([])
  })
})

describe('getRecentInsights', () => {
  it('should return insights sorted by date descending', () => {
    const results = getRecentInsights(5)
    for (let i = 0; i < results.length - 1; i++) {
      const date1 = new Date(results[i].date)
      const date2 = new Date(results[i + 1].date)
      expect(date1.getTime()).toBeGreaterThanOrEqual(date2.getTime())
    }
  })

  it('should respect limit parameter', () => {
    const results3 = getRecentInsights(3)
    expect(results3.length).toBeLessThanOrEqual(3)

    const results2 = getRecentInsights(2)
    expect(results2.length).toBeLessThanOrEqual(2)
  })

  it('should use default limit of 5', () => {
    const results = getRecentInsights()
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('should handle limit larger than available insights', () => {
    const results = getRecentInsights(100)
    expect(results.length).toBe(MARKET_INSIGHTS.length)
  })
})

describe('getActionableInsights', () => {
  it('should return only actionable insights', () => {
    const results = getActionableInsights()
    expect(results.length).toBeGreaterThan(0)
    results.forEach((insight) => {
      expect(insight.actionable).toBe(true)
    })
  })

  it('should have recommendations for all actionable insights', () => {
    const results = getActionableInsights()
    results.forEach((insight) => {
      expect(insight.recommendation).toBeDefined()
      expect(insight.recommendationTr).toBeDefined()
    })
  })

  it('should return fewer insights than total', () => {
    const actionable = getActionableInsights()
    expect(actionable.length).toBeLessThanOrEqual(MARKET_INSIGHTS.length)
  })
})
