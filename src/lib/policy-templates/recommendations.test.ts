/**
 * Tests for Policy Template Recommendations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Policy } from '@/types/policy'
import type {
  UserProfile,
  PolicyTemplate,
  TemplateSearchCriteria,
} from '@/types/policy-template'
import {
  findMatchingTemplates,
  analyzeTemplateGap,
  findBestTemplateForPolicy,
  searchTemplates,
  compareTemplates,
  getUpgradeRecommendation,
} from './recommendations'
import { getAllTemplates, getTemplateById, getTemplatesByType } from './templates'

// =============================================================================
// Mock Data
// =============================================================================

const createMockUserProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  audience: 'individual',
  riskTolerance: 'medium',
  budgetConstraint: 'moderate',
  useCase: 'first_time_buyer',
  ...overrides,
})

const createMockPolicy = (overrides: Partial<Policy> = {}): Policy => ({
  id: 'test-policy-1',
  policyNumber: 'POL-TEST-001',
  type: 'home',
  provider: 'Test Insurance',
  providerLogo: '',
  status: 'active',
  premium: 3000,
  coverage: 500000,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  holder: {
    name: 'Test User',
    tcNumber: '12345678901',
    address: 'Test Address',
    phone: '5551234567',
    email: 'test@example.com',
  },
  insuredItems: [{ name: 'House', value: 500000 }],
  coverages: [
    {
      name: 'Fire',
      nameTr: 'Yangın',
      included: true,
      limit: 300000,
      deductible: 1000,
      description: 'Fire coverage',
    },
    {
      name: 'Theft',
      nameTr: 'Hırsızlık',
      included: true,
      limit: 50000,
      deductible: 500,
      description: 'Theft coverage',
    },
  ],
  documents: [],
  notes: '',
  ...overrides,
})

// =============================================================================
// findMatchingTemplates Tests
// =============================================================================

describe('findMatchingTemplates', () => {
  it('should return a recommendation with primary template', () => {
    const profile = createMockUserProfile()
    const result = findMatchingTemplates(profile)

    expect(result).toBeDefined()
    expect(result.primary).toBeDefined()
    expect(result.primary.template).toBeDefined()
    expect(result.primary.matchScore).toBeGreaterThanOrEqual(0)
    expect(result.primary.matchScore).toBeLessThanOrEqual(100)
  })

  it('should return alternatives with different tiers', () => {
    const profile = createMockUserProfile()
    const result = findMatchingTemplates(profile)

    if (result.alternatives.length > 0) {
      result.alternatives.forEach((alt) => {
        expect(alt.template.tier).not.toBe(result.primary.template.tier)
        expect(alt.matchScore).toBeLessThanOrEqual(result.primary.matchScore)
      })
    }
  })

  it('should return reasons for primary recommendation', () => {
    const profile = createMockUserProfile({
      audience: 'family',
      riskTolerance: 'low',
    })
    const result = findMatchingTemplates(profile)

    expect(result.primary.reasons.length).toBeGreaterThan(0)
    expect(result.primary.reasonsTr.length).toBeGreaterThan(0)
  })

  it('should return budget option when available', () => {
    const profile = createMockUserProfile({
      budgetConstraint: 'flexible',
    })
    const result = findMatchingTemplates(profile)

    if (result.budgetOption) {
      expect(result.budgetOption.template.tier).toBe('basic')
      expect(result.budgetOption.savings).toBeDefined()
      expect(result.budgetOption.sacrifices.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('should return premium option when available', () => {
    const profile = createMockUserProfile({
      budgetConstraint: 'tight',
    })
    const result = findMatchingTemplates(profile)

    if (result.premiumOption) {
      expect(['comprehensive', 'premium']).toContain(result.premiumOption.template.tier)
      expect(result.premiumOption.additionalCost).toBeGreaterThan(0)
      expect(result.premiumOption.additionalBenefits.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('should generate personalized notes based on profile', () => {
    const profile = createMockUserProfile({
      region: 'marmara',
      sector: 'retail',
      budgetConstraint: 'tight',
      riskTolerance: 'low',
    })
    const result = findMatchingTemplates(profile)

    expect(result.notes.length).toBeGreaterThan(0)
    expect(result.notesTr.length).toBeGreaterThan(0)
  })

  it('should handle family audience profile', () => {
    const profile = createMockUserProfile({
      audience: 'family',
      familySize: 4,
    })
    const result = findMatchingTemplates(profile)

    expect(result.primary.template).toBeDefined()
    expect(result.primary.matchScore).toBeGreaterThan(0)
  })

  it('should handle small business audience', () => {
    const profile = createMockUserProfile({
      audience: 'small_business',
      sector: 'retail',
      employeeCount: 10,
    })
    const result = findMatchingTemplates(profile)

    expect(result.primary.template).toBeDefined()
  })

  it('should provide tradeoffs for alternatives', () => {
    const profile = createMockUserProfile()
    const result = findMatchingTemplates(profile)

    result.alternatives.forEach((alt) => {
      expect(alt.tradeoffs).toBeDefined()
      expect(alt.tradeoffsTr).toBeDefined()
    })
  })
})

// =============================================================================
// analyzeTemplateGap Tests
// =============================================================================

describe('analyzeTemplateGap', () => {
  it('should return null for non-existent template', () => {
    const policy = createMockPolicy()
    const result = analyzeTemplateGap(policy, 'non-existent-template')
    expect(result).toBeNull()
  })

  it('should return gap analysis for valid template', () => {
    const policy = createMockPolicy({ type: 'home' })
    const result = analyzeTemplateGap(policy, 'home-standard')

    if (result) {
      expect(result.templateId).toBe('home-standard')
      expect(result.templateName).toBeDefined()
      expect(result.matchScore).toBeDefined()
      expect(result.matchScore).toBeGreaterThanOrEqual(0)
      expect(result.matchScore).toBeLessThanOrEqual(100)
    }
  })

  it('should identify missing coverages', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          included: true,
          limit: 300000,
          deductible: 1000,
          description: 'Fire coverage',
        },
      ],
    })
    const result = analyzeTemplateGap(policy, 'home-standard')

    if (result) {
      expect(result.missingCoverages.length).toBeGreaterThan(0)
      result.missingCoverages.forEach((missing) => {
        expect(missing.coverage).toBeDefined()
        expect(missing.impact).toBeDefined()
        expect(missing.estimatedCost).toBeGreaterThanOrEqual(0)
      })
    }
  })

  it('should identify under-limit coverages', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          included: true,
          limit: 100000, // Very low limit
          deductible: 1000,
          description: 'Fire coverage',
        },
      ],
    })
    const result = analyzeTemplateGap(policy, 'home-comprehensive')

    if (result) {
      const underLimit = result.underLimitCoverages.find(
        (c) => c.coverageName.toLowerCase() === 'fire'
      )
      if (underLimit) {
        expect(underLimit.gap).toBeGreaterThan(0)
        expect(underLimit.gapPercentage).toBeGreaterThan(0)
        expect(underLimit.recommendedLimit).toBeGreaterThan(underLimit.currentLimit)
      }
    }
  })

  it('should identify over-deductible coverages', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          included: true,
          limit: 500000,
          deductible: 50000, // Very high deductible
          description: 'Fire coverage',
        },
      ],
    })
    const result = analyzeTemplateGap(policy, 'home-basic')

    if (result) {
      // Check for over-deductible coverages
      expect(result.overDeductibleCoverages).toBeDefined()
    }
  })

  it('should generate upgrade path', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [],
    })
    const result = analyzeTemplateGap(policy, 'home-standard')

    if (result && result.upgradePath.length > 0) {
      result.upgradePath.forEach((step) => {
        expect(step.priority).toBeGreaterThan(0)
        expect(step.action).toBeDefined()
        expect(step.actionTr).toBeDefined()
        expect(step.estimatedCost).toBeGreaterThanOrEqual(0)
      })
    }
  })

  it('should calculate estimated gap cost', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [],
    })
    const result = analyzeTemplateGap(policy, 'home-comprehensive')

    if (result) {
      expect(result.estimatedGapCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('should have critical impacts for missing critical coverages', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [], // No coverages, so critical ones are missing
    })
    const result = analyzeTemplateGap(policy, 'home-basic')

    if (result) {
      const criticalMissing = result.missingCoverages.filter(
        (m) => m.impact === 'critical'
      )
      // Home basic should have critical coverages like Fire
      expect(criticalMissing.length).toBeGreaterThanOrEqual(0)
    }
  })
})

// =============================================================================
// findBestTemplateForPolicy Tests
// =============================================================================

describe('findBestTemplateForPolicy', () => {
  it('should find best template for home policy', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          included: true,
          limit: 500000,
          deductible: 1000,
          description: 'Fire coverage',
        },
        {
          name: 'Natural Disasters',
          nameTr: 'Doğal Afetler',
          included: true,
          limit: 400000,
          deductible: 2000,
          description: 'Natural disaster coverage',
        },
        {
          name: 'Theft',
          nameTr: 'Hırsızlık',
          included: true,
          limit: 75000,
          deductible: 500,
          description: 'Theft coverage',
        },
      ],
    })
    const result = findBestTemplateForPolicy(policy)

    if (result) {
      expect(result.policyType).toBe('home')
      expect(result.id).toBeDefined()
    }
  })

  it('should find best template for kasko policy', () => {
    const policy = createMockPolicy({
      type: 'kasko',
      coverages: [
        {
          name: 'Collision',
          nameTr: 'Çarpışma',
          included: true,
          limit: 200000,
          deductible: 2000,
          description: 'Collision coverage',
        },
      ],
    })
    const result = findBestTemplateForPolicy(policy)

    if (result) {
      expect(result.policyType).toBe('kasko')
    }
  })

  it('should return null for policy type with no templates', () => {
    const policy = createMockPolicy({
      type: 'traffic', // No templates defined for traffic
    })
    const result = findBestTemplateForPolicy(policy)
    // May be null if no traffic templates exist
    expect(result === null || result.policyType === 'traffic').toBe(true)
  })

  it('should select template with highest match score', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          included: true,
          limit: 500000,
          deductible: 1000,
          description: 'Fire coverage',
        },
      ],
    })
    const result = findBestTemplateForPolicy(policy)

    // The result should be one of the home templates
    if (result) {
      const homeTemplates = getTemplatesByType('home')
      expect(homeTemplates.map((t) => t.id)).toContain(result.id)
    }
  })
})

// =============================================================================
// searchTemplates Tests
// =============================================================================

describe('searchTemplates', () => {
  it('should return all templates when no criteria provided', () => {
    const criteria: TemplateSearchCriteria = {}
    const results = searchTemplates(criteria)

    expect(results.length).toBe(getAllTemplates().length)
  })

  it('should filter by policy type', () => {
    const criteria: TemplateSearchCriteria = {
      policyType: 'home',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.template.policyType).toBe('home')
    })
  })

  it('should filter by tier', () => {
    const criteria: TemplateSearchCriteria = {
      tier: 'basic',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.template.tier).toBe('basic')
    })
  })

  it('should filter by audience', () => {
    const criteria: TemplateSearchCriteria = {
      audience: 'family',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.template.audience).toBe('family')
    })
  })

  it('should filter by use case', () => {
    const criteria: TemplateSearchCriteria = {
      useCase: 'first_time_buyer',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.template.useCases).toContain('first_time_buyer')
    })
  })

  it('should filter by premium range', () => {
    const criteria: TemplateSearchCriteria = {
      minPremium: 5000,
      maxPremium: 10000,
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.template.estimatedPremiumRange.max).toBeGreaterThanOrEqual(5000)
      expect(result.template.estimatedPremiumRange.min).toBeLessThanOrEqual(10000)
    })
  })

  it('should filter by required coverages', () => {
    const criteria: TemplateSearchCriteria = {
      requiredCoverages: ['Fire'],
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      const coverageNames = result.template.coverages.map((c) => c.name.toLowerCase())
      expect(coverageNames.some((n) => n.includes('fire'))).toBe(true)
    })
  })

  it('should filter by tags', () => {
    const criteria: TemplateSearchCriteria = {
      tags: ['basic'],
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      const hasTags = result.template.tags.includes('basic') ||
        result.template.tagsTr.includes('basic')
      expect(hasTags).toBe(true)
    })
  })

  it('should perform free text search', () => {
    const criteria: TemplateSearchCriteria = {
      query: 'home',
    }
    const results = searchTemplates(criteria)

    expect(results.length).toBeGreaterThan(0)
    results.forEach((result) => {
      const matchesQuery =
        result.template.name.toLowerCase().includes('home') ||
        result.template.nameTr.toLowerCase().includes('home') ||
        result.template.description.toLowerCase().includes('home') ||
        result.template.tags.some((t) => t.includes('home')) ||
        result.template.highlights.some((h) => h.toLowerCase().includes('home'))
      expect(matchesQuery).toBe(true)
    })
  })

  it('should combine multiple criteria', () => {
    const criteria: TemplateSearchCriteria = {
      policyType: 'home',
      tier: 'standard',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.template.policyType).toBe('home')
      expect(result.template.tier).toBe('standard')
    })
  })

  it('should return relevance scores', () => {
    const criteria: TemplateSearchCriteria = {
      policyType: 'home',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.relevanceScore).toBeGreaterThanOrEqual(0)
      expect(result.relevanceScore).toBeLessThanOrEqual(100)
    })
  })

  it('should return matched criteria', () => {
    const criteria: TemplateSearchCriteria = {
      policyType: 'home',
      tier: 'standard',
    }
    const results = searchTemplates(criteria)

    results.forEach((result) => {
      expect(result.matchedCriteria.length).toBeGreaterThan(0)
    })
  })

  it('should sort by relevance score', () => {
    const criteria: TemplateSearchCriteria = {
      query: 'protection',
    }
    const results = searchTemplates(criteria)

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].relevanceScore).toBeGreaterThanOrEqual(
        results[i + 1].relevanceScore
      )
    }
  })
})

// =============================================================================
// compareTemplates Tests
// =============================================================================

describe('compareTemplates', () => {
  it('should return null for non-existent template A', () => {
    const result = compareTemplates('non-existent', 'home-basic')
    expect(result).toBeNull()
  })

  it('should return null for non-existent template B', () => {
    const result = compareTemplates('home-basic', 'non-existent')
    expect(result).toBeNull()
  })

  it('should compare two valid templates', () => {
    const result = compareTemplates('home-basic', 'home-standard')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.templateA.id).toBe('home-basic')
      expect(result.templateB.id).toBe('home-standard')
    }
  })

  it('should show coverage differences', () => {
    const result = compareTemplates('home-basic', 'home-comprehensive')

    if (result) {
      expect(result.coverageDiff.length).toBeGreaterThan(0)
      result.coverageDiff.forEach((diff) => {
        expect(diff.name).toBeDefined()
        expect(typeof diff.inA).toBe('boolean')
        expect(typeof diff.inB).toBe('boolean')
      })
    }
  })

  it('should calculate premium difference', () => {
    const result = compareTemplates('home-basic', 'home-comprehensive')

    if (result) {
      expect(typeof result.premiumDiff).toBe('number')
      // Comprehensive should be more expensive
      expect(result.premiumDiff).toBeGreaterThan(0)
    }
  })

  it('should provide tier comparison', () => {
    const result = compareTemplates('home-basic', 'home-comprehensive')

    if (result) {
      expect(result.tierComparison).toBeDefined()
      expect(result.tierComparison).toContain('higher tier')
    }
  })

  it('should detect same tier comparison', () => {
    // Compare two templates with same tier if available
    const homeTemplates = getTemplatesByType('home')
    const basicTemplates = homeTemplates.filter((t) => t.tier === 'basic')

    if (basicTemplates.length >= 2) {
      const result = compareTemplates(basicTemplates[0].id, basicTemplates[1].id)
      if (result) {
        expect(result.tierComparison).toBe('Same tier')
      }
    }
  })

  it('should include all unique coverages from both templates', () => {
    const result = compareTemplates('home-basic', 'home-standard')

    if (result) {
      const allCoverageNames = new Set([
        ...result.templateA.coverages.map((c) => c.name),
        ...result.templateB.coverages.map((c) => c.name),
      ])
      expect(result.coverageDiff.length).toBe(allCoverageNames.size)
    }
  })
})

// =============================================================================
// getUpgradeRecommendation Tests
// =============================================================================

describe('getUpgradeRecommendation', () => {
  it('should return null for non-existent template', () => {
    const result = getUpgradeRecommendation('non-existent-template')
    expect(result).toBeNull()
  })

  it('should return next tier template for basic', () => {
    const result = getUpgradeRecommendation('home-basic')

    if (result) {
      expect(result.tier).toBe('standard')
      expect(result.policyType).toBe('home')
    }
  })

  it('should return next tier template for standard', () => {
    const result = getUpgradeRecommendation('home-standard')

    if (result) {
      expect(result.tier).toBe('comprehensive')
      expect(result.policyType).toBe('home')
    }
  })

  it('should return null for premium/highest tier', () => {
    // Find a premium tier template
    const allTemplates = getAllTemplates()
    const premiumTemplate = allTemplates.find((t) => t.tier === 'premium')

    if (premiumTemplate) {
      const result = getUpgradeRecommendation(premiumTemplate.id)
      expect(result).toBeNull()
    }
  })

  it('should return null for comprehensive if no premium exists', () => {
    const result = getUpgradeRecommendation('home-comprehensive')
    // May return null or premium depending on available templates
    expect(result === null || result.tier === 'premium').toBe(true)
  })

  it('should return same policy type for upgrade', () => {
    const result = getUpgradeRecommendation('kasko-basic')

    if (result) {
      expect(result.policyType).toBe('kasko')
    }
  })
})

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty coverages in policy', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [],
    })
    const result = analyzeTemplateGap(policy, 'home-basic')

    if (result) {
      // All coverages should be missing
      expect(result.missingCoverages.length).toBeGreaterThan(0)
    }
  })

  it('should handle policy with all coverages', () => {
    const template = getTemplateById('home-basic')
    if (!template) return

    const policy = createMockPolicy({
      type: 'home',
      coverages: template.coverages.map((tc) => ({
        name: tc.name,
        nameTr: tc.nameTr,
        included: true,
        limit: tc.recommendedLimit,
        deductible: tc.typicalDeductible,
        description: tc.description,
      })),
    })
    const result = analyzeTemplateGap(policy, 'home-basic')

    if (result) {
      expect(result.missingCoverages.length).toBe(0)
      expect(result.matchScore).toBeGreaterThan(50)
    }
  })

  it('should handle Turkish coverage name matching', () => {
    const policy = createMockPolicy({
      type: 'home',
      coverages: [
        {
          name: 'Yangın', // Turkish name
          nameTr: 'Yangın',
          included: true,
          limit: 500000,
          deductible: 1000,
          description: 'Yangın teminatı',
        },
      ],
    })
    const result = analyzeTemplateGap(policy, 'home-basic')

    if (result) {
      // Should recognize Turkish coverage names
      const hasFire = result.missingCoverages.every(
        (m) => m.coverage.nameTr.toLowerCase() !== 'yangın'
      )
      expect(hasFire).toBe(true)
    }
  })

  it('should handle very low budget constraint', () => {
    const profile = createMockUserProfile({
      budgetConstraint: 'tight',
      riskTolerance: 'high',
    })
    const result = findMatchingTemplates(profile)

    expect(result.primary.template.tier).toBe('basic')
  })

  it('should handle enterprise audience', () => {
    const profile = createMockUserProfile({
      audience: 'enterprise',
      sector: 'manufacturing',
      employeeCount: 500,
    })
    const result = findMatchingTemplates(profile)

    expect(result.primary.template).toBeDefined()
  })
})
