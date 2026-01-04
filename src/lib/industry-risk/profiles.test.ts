/**
 * Industry Risk Profiles Tests
 *
 * Tests for industry risk data and profile retrieval functions
 */

import { describe, it, expect } from 'vitest'
import {
  INDUSTRY_PROFILES,
  getIndustryProfile,
  getAllIndustrySectors,
  getIndustriesByRisk,
} from './profiles'
import type { IndustrySector } from '@/types/industry-risk'

describe('Industry Risk Profiles', () => {
  describe('INDUSTRY_PROFILES', () => {
    it('should define profiles for all industry sectors', () => {
      const expectedSectors: IndustrySector[] = [
        'manufacturing',
        'technology',
        'healthcare',
        'construction',
        'retail',
        'wholesale',
        'transportation',
        'hospitality',
        'finance',
        'real_estate',
        'professional_services',
        'education',
        'agriculture',
        'mining',
        'utilities',
        'food_beverage',
        'textile',
        'automotive',
        'chemical',
        'logistics',
      ]

      expectedSectors.forEach((sector) => {
        expect(INDUSTRY_PROFILES[sector]).toBeDefined()
      })
    })

    it('should have valid manufacturing profile', () => {
      const profile = INDUSTRY_PROFILES.manufacturing

      expect(profile.sector).toBe('manufacturing')
      expect(profile.name).toBe('Manufacturing')
      expect(profile.nameTr).toBe('İmalat')
      expect(profile.overallRiskScore).toBeGreaterThan(0)
      expect(profile.overallRiskScore).toBeLessThanOrEqual(100)
    })

    it('should have valid technology profile', () => {
      const profile = INDUSTRY_PROFILES.technology

      expect(profile.sector).toBe('technology')
      expect(profile.name).toBe('Technology')
      expect(profile.overallRiskScore).toBeLessThan(60) // Tech is moderate risk
    })

    it('should have valid healthcare profile', () => {
      const profile = INDUSTRY_PROFILES.healthcare

      expect(profile.sector).toBe('healthcare')
      expect(profile.overallRiskLevel).toBe('high')
    })

    it('should have valid construction profile', () => {
      const profile = INDUSTRY_PROFILES.construction

      expect(profile.sector).toBe('construction')
      expect(profile.overallRiskScore).toBeGreaterThan(70) // High risk industry
    })

    it('should have risk factors for each profile', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        expect(profile.riskFactors).toBeDefined()
        expect(profile.riskFactors.length).toBeGreaterThan(0)
      })
    })

    it('should have coverage requirements for each profile', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        expect(profile.coverageRequirements).toBeDefined()
        expect(profile.coverageRequirements.length).toBeGreaterThan(0)
      })
    })

    it('should have category scores for each profile', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        expect(profile.categoryScores).toBeDefined()
        expect(profile.categoryScores.operational).toBeDefined()
        expect(profile.categoryScores.property).toBeDefined()
        expect(profile.categoryScores.liability).toBeDefined()
        expect(profile.categoryScores.employee).toBeDefined()
        expect(profile.categoryScores.cyber).toBeDefined()
      })
    })

    it('should have premium modifiers for each profile', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        expect(profile.premiumModifiers).toBeDefined()
        expect(profile.premiumModifiers.baseMultiplier).toBeGreaterThan(0)
        expect(profile.premiumModifiers.sizeAdjustments).toBeDefined()
        expect(profile.premiumModifiers.regionAdjustments).toBeDefined()
      })
    })

    it('should have benchmarks for each profile', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        expect(profile.benchmarks).toBeDefined()
        expect(profile.benchmarks.avgPremium).toBeGreaterThan(0)
        expect(profile.benchmarks.avgClaimsRatio).toBeGreaterThan(0)
        expect(profile.benchmarks.avgClaimsRatio).toBeLessThanOrEqual(1)
      })
    })

    it('should have trends for each profile', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        expect(profile.trends).toBeDefined()
        expect(['increasing', 'stable', 'decreasing']).toContain(profile.trends.riskTrend)
        expect(['increasing', 'stable', 'decreasing']).toContain(profile.trends.premiumTrend)
      })
    })
  })

  describe('getIndustryProfile', () => {
    it('should return correct profile for manufacturing', () => {
      const profile = getIndustryProfile('manufacturing')

      expect(profile).toBeDefined()
      expect(profile.sector).toBe('manufacturing')
      expect(profile.name).toBe('Manufacturing')
    })

    it('should return correct profile for technology', () => {
      const profile = getIndustryProfile('technology')

      expect(profile).toBeDefined()
      expect(profile.sector).toBe('technology')
    })

    it('should return correct profile for healthcare', () => {
      const profile = getIndustryProfile('healthcare')

      expect(profile).toBeDefined()
      expect(profile.sector).toBe('healthcare')
    })

    it('should return correct profile for construction', () => {
      const profile = getIndustryProfile('construction')

      expect(profile).toBeDefined()
      expect(profile.sector).toBe('construction')
    })

    it('should return correct profile for retail', () => {
      const profile = getIndustryProfile('retail')

      expect(profile).toBeDefined()
      expect(profile.sector).toBe('retail')
    })

    it('should return correct profile for all sectors', () => {
      const sectors = getAllIndustrySectors()

      sectors.forEach((sector) => {
        const profile = getIndustryProfile(sector)
        expect(profile).toBeDefined()
        expect(profile.sector).toBe(sector)
      })
    })
  })

  describe('getAllIndustrySectors', () => {
    it('should return all industry sectors', () => {
      const sectors = getAllIndustrySectors()

      expect(sectors).toBeDefined()
      expect(Array.isArray(sectors)).toBe(true)
      expect(sectors.length).toBe(20)
    })

    it('should include all major sectors', () => {
      const sectors = getAllIndustrySectors()

      expect(sectors).toContain('manufacturing')
      expect(sectors).toContain('technology')
      expect(sectors).toContain('healthcare')
      expect(sectors).toContain('construction')
      expect(sectors).toContain('retail')
    })

    it('should include all sectors defined in INDUSTRY_PROFILES', () => {
      const sectors = getAllIndustrySectors()
      const profileKeys = Object.keys(INDUSTRY_PROFILES)

      expect(sectors.length).toBe(profileKeys.length)
      profileKeys.forEach((key) => {
        expect(sectors).toContain(key)
      })
    })
  })

  describe('getIndustriesByRisk', () => {
    it('should return industries sorted by risk score', () => {
      const industries = getIndustriesByRisk()

      expect(industries).toBeDefined()
      expect(Array.isArray(industries)).toBe(true)
      expect(industries.length).toBe(20)

      // Should be sorted descending by score
      for (let i = 1; i < industries.length; i++) {
        expect(industries[i - 1].score).toBeGreaterThanOrEqual(industries[i].score)
      }
    })

    it('should include sector, score, and level for each entry', () => {
      const industries = getIndustriesByRisk()

      industries.forEach((industry) => {
        expect(industry.sector).toBeDefined()
        expect(industry.score).toBeDefined()
        expect(industry.level).toBeDefined()
        expect(industry.score).toBeGreaterThan(0)
        expect(industry.score).toBeLessThanOrEqual(100)
      })
    })

    it('should have mining as highest risk industry', () => {
      const industries = getIndustriesByRisk()

      // Mining should be at or near the top due to its high risk score
      expect(industries[0].sector).toBe('mining')
      expect(industries[0].score).toBe(85)
    })

    it('should have valid risk levels', () => {
      const industries = getIndustriesByRisk()
      const validLevels = ['very_low', 'low', 'moderate', 'high', 'very_high']

      industries.forEach((industry) => {
        expect(validLevels).toContain(industry.level)
      })
    })
  })

  describe('Risk Factor Structure', () => {
    it('should have valid risk factor properties', () => {
      const profile = INDUSTRY_PROFILES.manufacturing
      const riskFactor = profile.riskFactors[0]

      expect(riskFactor.category).toBeDefined()
      expect(riskFactor.name).toBeDefined()
      expect(riskFactor.nameTr).toBeDefined()
      expect(riskFactor.baseScore).toBeDefined()
      expect(riskFactor.level).toBeDefined()
      expect(riskFactor.frequency).toBeDefined()
      expect(riskFactor.severity).toBeDefined()
      expect(riskFactor.controlMeasures).toBeDefined()
      expect(riskFactor.controlMeasuresTr).toBeDefined()
    })

    it('should have valid frequency values', () => {
      const validFrequencies = ['rare', 'occasional', 'common', 'frequent']

      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        profile.riskFactors.forEach((factor) => {
          expect(validFrequencies).toContain(factor.frequency)
        })
      })
    })

    it('should have valid severity values', () => {
      const validSeverities = ['minor', 'moderate', 'major', 'catastrophic']

      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        profile.riskFactors.forEach((factor) => {
          expect(validSeverities).toContain(factor.severity)
        })
      })
    })
  })

  describe('Coverage Requirements Structure', () => {
    it('should have valid coverage requirement properties', () => {
      const profile = INDUSTRY_PROFILES.manufacturing
      const requirement = profile.coverageRequirements[0]

      expect(requirement.coverageType).toBeDefined()
      expect(requirement.coverageTypeTr).toBeDefined()
      expect(requirement.importance).toBeDefined()
      expect(requirement.minLimit).toBeDefined()
      expect(requirement.recommendedLimit).toBeDefined()
      expect(requirement.typicalDeductible).toBeDefined()
      expect(requirement.reason).toBeDefined()
      expect(requirement.reasonTr).toBeDefined()
    })

    it('should have valid importance values', () => {
      const validImportance = ['mandatory', 'highly_recommended', 'recommended', 'optional']

      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        profile.coverageRequirements.forEach((req) => {
          expect(validImportance).toContain(req.importance)
        })
      })
    })

    it('should have recommended limit >= min limit', () => {
      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        profile.coverageRequirements.forEach((req) => {
          expect(req.recommendedLimit).toBeGreaterThanOrEqual(req.minLimit)
        })
      })
    })
  })

  describe('Category Scores Structure', () => {
    it('should have valid category score properties', () => {
      const profile = INDUSTRY_PROFILES.manufacturing
      const categoryScore = profile.categoryScores.operational

      expect(categoryScore.score).toBeDefined()
      expect(categoryScore.level).toBeDefined()
      expect(categoryScore.weight).toBeDefined()
      expect(categoryScore.score).toBeGreaterThanOrEqual(0)
      expect(categoryScore.score).toBeLessThanOrEqual(100)
      expect(categoryScore.weight).toBeGreaterThanOrEqual(0)
      expect(categoryScore.weight).toBeLessThanOrEqual(1)
    })

    it('should have all required categories', () => {
      const requiredCategories = [
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

      Object.values(INDUSTRY_PROFILES).forEach((profile) => {
        requiredCategories.forEach((category) => {
          expect(
            profile.categoryScores[category as keyof typeof profile.categoryScores]
          ).toBeDefined()
        })
      })
    })
  })

  describe('Regulatory Requirements Structure', () => {
    it('should have valid regulatory requirements', () => {
      const profile = INDUSTRY_PROFILES.manufacturing

      expect(profile.regulatoryRequirements).toBeDefined()
      expect(profile.regulatoryRequirements.mandatory).toBeDefined()
      expect(profile.regulatoryRequirements.mandatoryTr).toBeDefined()
      expect(profile.regulatoryRequirements.recommended).toBeDefined()
      expect(profile.regulatoryRequirements.recommendedTr).toBeDefined()
      expect(Array.isArray(profile.regulatoryRequirements.mandatory)).toBe(true)
    })
  })
})
