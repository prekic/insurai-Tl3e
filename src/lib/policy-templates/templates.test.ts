/**
 * Tests for Policy Template Library Data
 */

import { describe, it, expect } from 'vitest'
import {
  HOME_TEMPLATES,
  KASKO_TEMPLATES,
  BUSINESS_TEMPLATES,
  HEALTH_TEMPLATES,
  ALL_TEMPLATES,
  getTemplatesByType,
  getTemplateById,
  getTemplatesByTier,
  getAllTemplates,
} from './templates'

// =============================================================================
// Template Data Structure Tests
// =============================================================================

describe('HOME_TEMPLATES', () => {
  it('should contain home insurance templates', () => {
    expect(HOME_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('should have all required template fields', () => {
    HOME_TEMPLATES.forEach((template) => {
      expect(template.id).toBeDefined()
      expect(template.name).toBeDefined()
      expect(template.nameTr).toBeDefined()
      expect(template.description).toBeDefined()
      expect(template.descriptionTr).toBeDefined()
      expect(template.policyType).toBe('home')
      expect(template.tier).toBeDefined()
      expect(template.audience).toBeDefined()
      expect(template.useCases.length).toBeGreaterThan(0)
      expect(template.coverages.length).toBeGreaterThan(0)
      expect(template.estimatedPremiumRange).toBeDefined()
      expect(template.highlights.length).toBeGreaterThan(0)
      expect(template.suitableFor.length).toBeGreaterThan(0)
      expect(template.notSuitableFor.length).toBeGreaterThan(0)
    })
  })

  it('should have unique IDs', () => {
    const ids = HOME_TEMPLATES.map((t) => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have basic, standard, and comprehensive tiers', () => {
    const tiers = HOME_TEMPLATES.map((t) => t.tier)
    expect(tiers).toContain('basic')
    expect(tiers).toContain('standard')
    expect(tiers).toContain('comprehensive')
  })

  it('should have valid premium ranges', () => {
    HOME_TEMPLATES.forEach((template) => {
      expect(template.estimatedPremiumRange.min).toBeLessThan(
        template.estimatedPremiumRange.max
      )
      expect(template.estimatedPremiumRange.typical).toBeGreaterThanOrEqual(
        template.estimatedPremiumRange.min
      )
      expect(template.estimatedPremiumRange.typical).toBeLessThanOrEqual(
        template.estimatedPremiumRange.max
      )
    })
  })

  it('should have increasing premiums with higher tiers', () => {
    const basic = HOME_TEMPLATES.find((t) => t.tier === 'basic')
    const standard = HOME_TEMPLATES.find((t) => t.tier === 'standard')
    const comprehensive = HOME_TEMPLATES.find((t) => t.tier === 'comprehensive')

    if (basic && standard) {
      expect(standard.estimatedPremiumRange.typical).toBeGreaterThan(
        basic.estimatedPremiumRange.typical
      )
    }
    if (standard && comprehensive) {
      expect(comprehensive.estimatedPremiumRange.typical).toBeGreaterThan(
        standard.estimatedPremiumRange.typical
      )
    }
  })

  it('should have coverages with proper structure', () => {
    HOME_TEMPLATES.forEach((template) => {
      template.coverages.forEach((coverage) => {
        expect(coverage.name).toBeDefined()
        expect(coverage.nameTr).toBeDefined()
        expect(coverage.category).toBeDefined()
        expect(['core', 'recommended', 'optional', 'add_on']).toContain(coverage.category)
        expect(coverage.minLimit).toBeGreaterThan(0)
        expect(coverage.recommendedLimit).toBeGreaterThanOrEqual(coverage.minLimit)
        expect(coverage.maxLimit).toBeGreaterThanOrEqual(coverage.recommendedLimit)
        expect(coverage.importance).toBeDefined()
        expect(['critical', 'high', 'medium', 'low']).toContain(coverage.importance)
      })
    })
  })

  it('should have best practices', () => {
    HOME_TEMPLATES.forEach((template) => {
      expect(template.bestPractices.length).toBeGreaterThan(0)
      template.bestPractices.forEach((bp) => {
        expect(bp.id).toBeDefined()
        expect(bp.title).toBeDefined()
        expect(bp.guidance.length).toBeGreaterThan(0)
        expect(bp.pitfalls.length).toBeGreaterThan(0)
      })
    })
  })

  it('should have Turkish translations for key fields', () => {
    HOME_TEMPLATES.forEach((template) => {
      expect(template.nameTr.length).toBeGreaterThan(0)
      expect(template.descriptionTr.length).toBeGreaterThan(0)
      expect(template.highlightsTr.length).toBe(template.highlights.length)
      expect(template.suitableForTr.length).toBe(template.suitableFor.length)
      expect(template.tagsTr.length).toBe(template.tags.length)
    })
  })
})

describe('KASKO_TEMPLATES', () => {
  it('should contain kasko insurance templates', () => {
    expect(KASKO_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('should all be kasko type', () => {
    KASKO_TEMPLATES.forEach((template) => {
      expect(template.policyType).toBe('kasko')
    })
  })

  it('should have unique IDs', () => {
    const ids = KASKO_TEMPLATES.map((t) => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have collision coverage in basic template', () => {
    const basic = KASKO_TEMPLATES.find((t) => t.tier === 'basic')
    if (basic) {
      const hasCollision = basic.coverages.some(
        (c) => c.name.toLowerCase() === 'collision'
      )
      expect(hasCollision).toBe(true)
    }
  })

  it('should have theft coverage as critical', () => {
    KASKO_TEMPLATES.forEach((template) => {
      const theft = template.coverages.find(
        (c) => c.name.toLowerCase() === 'theft'
      )
      if (theft) {
        expect(theft.importance).toBe('critical')
      }
    })
  })

  it('should have valid auto-specific coverages', () => {
    const autoCoverages = ['collision', 'theft', 'fire', 'glass', 'natural disasters']
    KASKO_TEMPLATES.forEach((template) => {
      const coverageNames = template.coverages.map((c) => c.name.toLowerCase())
      // Should have at least some auto-specific coverages
      const hasAutoCoverages = autoCoverages.some((ac) =>
        coverageNames.includes(ac)
      )
      expect(hasAutoCoverages).toBe(true)
    })
  })
})

describe('BUSINESS_TEMPLATES', () => {
  it('should contain business insurance templates', () => {
    expect(BUSINESS_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('should all be business type', () => {
    BUSINESS_TEMPLATES.forEach((template) => {
      expect(template.policyType).toBe('business')
    })
  })

  it('should have general liability coverage', () => {
    BUSINESS_TEMPLATES.forEach((template) => {
      const hasLiability = template.coverages.some(
        (c) => c.name.toLowerCase().includes('liability')
      )
      expect(hasLiability).toBe(true)
    })
  })

  it('should have business interruption coverage', () => {
    BUSINESS_TEMPLATES.forEach((template) => {
      const hasBI = template.coverages.some(
        (c) => c.name.toLowerCase().includes('business interruption')
      )
      expect(hasBI).toBe(true)
    })
  })

  it('should target small business audience', () => {
    const smb = BUSINESS_TEMPLATES.find((t) => t.audience === 'small_business')
    expect(smb).toBeDefined()
  })

  it('should have cyber liability coverage', () => {
    const standard = BUSINESS_TEMPLATES.find((t) => t.tier === 'standard')
    if (standard) {
      const hasCyber = standard.coverages.some(
        (c) => c.name.toLowerCase().includes('cyber')
      )
      expect(hasCyber).toBe(true)
    }
  })
})

describe('HEALTH_TEMPLATES', () => {
  it('should contain health insurance templates', () => {
    expect(HEALTH_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('should all be health type', () => {
    HEALTH_TEMPLATES.forEach((template) => {
      expect(template.policyType).toBe('health')
    })
  })

  it('should have inpatient care coverage', () => {
    HEALTH_TEMPLATES.forEach((template) => {
      const hasInpatient = template.coverages.some(
        (c) => c.name.toLowerCase().includes('inpatient')
      )
      expect(hasInpatient).toBe(true)
    })
  })

  it('should have outpatient care coverage', () => {
    HEALTH_TEMPLATES.forEach((template) => {
      const hasOutpatient = template.coverages.some(
        (c) => c.name.toLowerCase().includes('outpatient')
      )
      expect(hasOutpatient).toBe(true)
    })
  })

  it('should have prescription drug coverage', () => {
    HEALTH_TEMPLATES.forEach((template) => {
      const hasRx = template.coverages.some(
        (c) => c.name.toLowerCase().includes('prescription') ||
              c.name.toLowerCase().includes('drug')
      )
      expect(hasRx).toBe(true)
    })
  })

  it('should target family audience', () => {
    const family = HEALTH_TEMPLATES.find((t) => t.audience === 'family')
    expect(family).toBeDefined()
  })
})

describe('ALL_TEMPLATES', () => {
  it('should have entries for all policy types', () => {
    expect(ALL_TEMPLATES.home).toBeDefined()
    expect(ALL_TEMPLATES.kasko).toBeDefined()
    expect(ALL_TEMPLATES.business).toBeDefined()
    expect(ALL_TEMPLATES.health).toBeDefined()
    expect(ALL_TEMPLATES.traffic).toBeDefined()
    expect(ALL_TEMPLATES.life).toBeDefined()
    expect(ALL_TEMPLATES.dask).toBeDefined()
  })

  it('should have home templates in home key', () => {
    expect(ALL_TEMPLATES.home).toEqual(HOME_TEMPLATES)
  })

  it('should have kasko templates in kasko key', () => {
    expect(ALL_TEMPLATES.kasko).toEqual(KASKO_TEMPLATES)
  })

  it('should have business templates in business key', () => {
    expect(ALL_TEMPLATES.business).toEqual(BUSINESS_TEMPLATES)
  })

  it('should have health templates in health key', () => {
    expect(ALL_TEMPLATES.health).toEqual(HEALTH_TEMPLATES)
  })

  it('should have empty arrays for unimplemented types', () => {
    expect(ALL_TEMPLATES.traffic).toEqual([])
    expect(ALL_TEMPLATES.life).toEqual([])
    expect(ALL_TEMPLATES.dask).toEqual([])
  })
})

// =============================================================================
// Function Tests
// =============================================================================

describe('getTemplatesByType', () => {
  it('should return home templates for home type', () => {
    const templates = getTemplatesByType('home')
    expect(templates).toEqual(HOME_TEMPLATES)
    templates.forEach((t) => {
      expect(t.policyType).toBe('home')
    })
  })

  it('should return kasko templates for kasko type', () => {
    const templates = getTemplatesByType('kasko')
    expect(templates).toEqual(KASKO_TEMPLATES)
    templates.forEach((t) => {
      expect(t.policyType).toBe('kasko')
    })
  })

  it('should return business templates for business type', () => {
    const templates = getTemplatesByType('business')
    expect(templates).toEqual(BUSINESS_TEMPLATES)
    templates.forEach((t) => {
      expect(t.policyType).toBe('business')
    })
  })

  it('should return health templates for health type', () => {
    const templates = getTemplatesByType('health')
    expect(templates).toEqual(HEALTH_TEMPLATES)
    templates.forEach((t) => {
      expect(t.policyType).toBe('health')
    })
  })

  it('should return empty array for traffic type', () => {
    const templates = getTemplatesByType('traffic')
    expect(templates).toEqual([])
  })

  it('should return empty array for life type', () => {
    const templates = getTemplatesByType('life')
    expect(templates).toEqual([])
  })

  it('should return empty array for dask type', () => {
    const templates = getTemplatesByType('dask')
    expect(templates).toEqual([])
  })

  it('should return empty array for unknown type', () => {
    const templates = getTemplatesByType('unknown' as never)
    expect(templates).toEqual([])
  })
})

describe('getTemplateById', () => {
  it('should find home-basic template', () => {
    const template = getTemplateById('home-basic')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('home-basic')
    expect(template!.policyType).toBe('home')
    expect(template!.tier).toBe('basic')
  })

  it('should find home-standard template', () => {
    const template = getTemplateById('home-standard')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('home-standard')
    expect(template!.tier).toBe('standard')
  })

  it('should find home-comprehensive template', () => {
    const template = getTemplateById('home-comprehensive')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('home-comprehensive')
    expect(template!.tier).toBe('comprehensive')
  })

  it('should find kasko-basic template', () => {
    const template = getTemplateById('kasko-basic')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('kasko-basic')
    expect(template!.policyType).toBe('kasko')
  })

  it('should find kasko-standard template', () => {
    const template = getTemplateById('kasko-standard')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('kasko-standard')
  })

  it('should find business-standard template', () => {
    const template = getTemplateById('business-standard')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('business-standard')
    expect(template!.policyType).toBe('business')
  })

  it('should find health-standard template', () => {
    const template = getTemplateById('health-standard')
    expect(template).not.toBeNull()
    expect(template!.id).toBe('health-standard')
    expect(template!.policyType).toBe('health')
  })

  it('should return null for non-existent template', () => {
    const template = getTemplateById('non-existent-template')
    expect(template).toBeNull()
  })

  it('should return null for empty string', () => {
    const template = getTemplateById('')
    expect(template).toBeNull()
  })

  it('should search across all policy types', () => {
    const homeTemplate = getTemplateById('home-basic')
    const kaskoTemplate = getTemplateById('kasko-basic')
    const businessTemplate = getTemplateById('business-standard')

    expect(homeTemplate?.policyType).toBe('home')
    expect(kaskoTemplate?.policyType).toBe('kasko')
    expect(businessTemplate?.policyType).toBe('business')
  })
})

describe('getTemplatesByTier', () => {
  it('should find all basic tier templates', () => {
    const templates = getTemplatesByTier('basic')
    expect(templates.length).toBeGreaterThan(0)
    templates.forEach((t) => {
      expect(t.tier).toBe('basic')
    })
  })

  it('should find all standard tier templates', () => {
    const templates = getTemplatesByTier('standard')
    expect(templates.length).toBeGreaterThan(0)
    templates.forEach((t) => {
      expect(t.tier).toBe('standard')
    })
  })

  it('should find all comprehensive tier templates', () => {
    const templates = getTemplatesByTier('comprehensive')
    expect(templates.length).toBeGreaterThan(0)
    templates.forEach((t) => {
      expect(t.tier).toBe('comprehensive')
    })
  })

  it('should return empty array for premium tier if none exist', () => {
    const templates = getTemplatesByTier('premium')
    templates.forEach((t) => {
      expect(t.tier).toBe('premium')
    })
  })

  it('should include templates from multiple policy types', () => {
    const basicTemplates = getTemplatesByTier('basic')
    const policyTypes = new Set(basicTemplates.map((t) => t.policyType))
    expect(policyTypes.size).toBeGreaterThan(1)
  })

  it('should find templates across different policy types for standard tier', () => {
    const standardTemplates = getTemplatesByTier('standard')
    const policyTypes = standardTemplates.map((t) => t.policyType)

    // Should have standard templates for multiple types
    expect(policyTypes.includes('home') || policyTypes.includes('kasko')).toBe(true)
  })
})

describe('getAllTemplates', () => {
  it('should return all templates as flat array', () => {
    const templates = getAllTemplates()
    expect(templates.length).toBeGreaterThan(0)
  })

  it('should include templates from all defined types', () => {
    const templates = getAllTemplates()
    const policyTypes = new Set(templates.map((t) => t.policyType))

    expect(policyTypes.has('home')).toBe(true)
    expect(policyTypes.has('kasko')).toBe(true)
    expect(policyTypes.has('business')).toBe(true)
    expect(policyTypes.has('health')).toBe(true)
  })

  it('should have total count matching individual type counts', () => {
    const all = getAllTemplates()
    const expectedCount =
      HOME_TEMPLATES.length +
      KASKO_TEMPLATES.length +
      BUSINESS_TEMPLATES.length +
      HEALTH_TEMPLATES.length

    expect(all.length).toBe(expectedCount)
  })

  it('should have unique IDs across all templates', () => {
    const templates = getAllTemplates()
    const ids = templates.map((t) => t.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should return valid PolicyTemplate objects', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      expect(template.id).toBeDefined()
      expect(template.name).toBeDefined()
      expect(template.policyType).toBeDefined()
      expect(template.tier).toBeDefined()
      expect(template.coverages).toBeDefined()
      expect(Array.isArray(template.coverages)).toBe(true)
    })
  })
})

// =============================================================================
// Coverage Data Validation Tests
// =============================================================================

describe('Template Coverage Validation', () => {
  it('should have watch exclusions for coverages', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      template.coverages.forEach((coverage) => {
        expect(coverage.watchExclusions).toBeDefined()
        expect(Array.isArray(coverage.watchExclusions)).toBe(true)
        expect(coverage.watchExclusionsTr).toBeDefined()
        expect(coverage.watchExclusions.length).toBe(coverage.watchExclusionsTr.length)
      })
    })
  })

  it('should have rationale for all coverages', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      template.coverages.forEach((coverage) => {
        expect(coverage.rationale).toBeDefined()
        expect(coverage.rationale.length).toBeGreaterThan(0)
        expect(coverage.rationaleTr).toBeDefined()
        expect(coverage.rationaleTr.length).toBeGreaterThan(0)
      })
    })
  })

  it('should have positive deductible values or zero', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      template.coverages.forEach((coverage) => {
        expect(coverage.typicalDeductible).toBeGreaterThanOrEqual(0)
      })
    })
  })

  it('should have core coverages marked as critical or high importance', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      const coreCoverages = template.coverages.filter((c) => c.category === 'core')
      coreCoverages.forEach((coverage) => {
        expect(['critical', 'high']).toContain(coverage.importance)
      })
    })
  })
})

// =============================================================================
// Template Comparison Tests
// =============================================================================

describe('Template Tier Progression', () => {
  it('should have more coverages in higher tiers for home', () => {
    const basic = getTemplateById('home-basic')
    const standard = getTemplateById('home-standard')
    const comprehensive = getTemplateById('home-comprehensive')

    if (basic && standard) {
      expect(standard.coverages.length).toBeGreaterThanOrEqual(basic.coverages.length)
    }
    if (standard && comprehensive) {
      expect(comprehensive.coverages.length).toBeGreaterThanOrEqual(standard.coverages.length)
    }
  })

  it('should have higher limits in higher tiers for home', () => {
    const basic = getTemplateById('home-basic')
    const comprehensive = getTemplateById('home-comprehensive')

    if (basic && comprehensive) {
      const basicFire = basic.coverages.find((c) => c.name === 'Fire')
      const compFire = comprehensive.coverages.find((c) => c.name === 'Fire')

      if (basicFire && compFire) {
        expect(compFire.recommendedLimit).toBeGreaterThan(basicFire.recommendedLimit)
      }
    }
  })

  it('should have more coverages in standard kasko than basic', () => {
    const basic = getTemplateById('kasko-basic')
    const standard = getTemplateById('kasko-standard')

    if (basic && standard) {
      expect(standard.coverages.length).toBeGreaterThan(basic.coverages.length)
    }
  })
})

describe('Template Metadata', () => {
  it('should have valid version strings', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      expect(template.version).toBeDefined()
      expect(template.version).toMatch(/^\d+\.\d+$/)
    })
  })

  it('should have valid lastUpdated dates', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      const date = new Date(template.lastUpdated)
      expect(date.getTime()).not.toBeNaN()
    })
  })

  it('should have valid source values', () => {
    const validSources = ['market_analysis', 'regulatory', 'industry_standard', 'expert_recommendation']
    const templates = getAllTemplates()
    templates.forEach((template) => {
      expect(validSources).toContain(template.source)
    })
  })

  it('should have tags for searchability', () => {
    const templates = getAllTemplates()
    templates.forEach((template) => {
      expect(template.tags.length).toBeGreaterThan(0)
      expect(template.tagsTr.length).toBeGreaterThan(0)
    })
  })
})
