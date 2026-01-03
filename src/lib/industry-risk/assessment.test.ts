/**
 * Tests for Industry Risk Assessment
 * Tests business risk assessment and comparison utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  assessBusinessRisk,
  compareIndustries,
  getIndustryRankings,
  findSimilarIndustries,
} from './assessment'
import type { BusinessInfo, IndustrySector, BusinessRiskAssessment } from '@/types/industry-risk'

// Mock the profiles module
vi.mock('./profiles', () => ({
  INDUSTRY_PROFILES: {
    manufacturing: {
      sector: 'manufacturing',
      name: 'Manufacturing',
      nameTr: 'İmalat',
      overallRiskScore: 65,
      overallRiskLevel: 'high',
      categoryScores: {
        operational: { score: 70 },
        property: { score: 65 },
        liability: { score: 55 },
        employee: { score: 75 },
        cyber: { score: 40 },
        environmental: { score: 60 },
        product: { score: 50 },
        business_interruption: { score: 65 },
        regulatory: { score: 45 },
        supply_chain: { score: 55 },
        reputation: { score: 35 },
        financial: { score: 45 },
      },
      riskFactors: [
        { category: 'operational', nameTr: 'Ekipman arızası', baseScore: 70, controlMeasures: ['Maintenance schedule'], controlMeasuresTr: ['Bakım programı'] },
        { category: 'employee', nameTr: 'İş kazaları', baseScore: 75, controlMeasures: ['Safety training'], controlMeasuresTr: ['Güvenlik eğitimi'] },
      ],
      coverageRequirements: [
        { coverageType: 'Property Insurance', importance: 'mandatory', recommendedLimit: 1000000, reasonTr: 'Mülk koruması' },
        { coverageType: 'Employer Liability', importance: 'highly_recommended', recommendedLimit: 500000, reasonTr: 'İşveren sorumluluğu' },
      ],
      premiumModifiers: {
        baseMultiplier: 1.2,
        sizeAdjustments: { micro: 0.8, small: 0.9, medium: 1.0, large: 1.1, enterprise: 1.2 },
      },
      benchmarks: {
        avgPremium: 15000,
        avgClaimsRatio: 0.65,
      },
      trends: {
        premiumTrend: 'increasing',
        riskTrend: 'stable',
      },
    },
    retail: {
      sector: 'retail',
      name: 'Retail',
      nameTr: 'Perakende',
      overallRiskScore: 45,
      overallRiskLevel: 'moderate',
      categoryScores: {
        operational: { score: 40 },
        property: { score: 55 },
        liability: { score: 60 },
        employee: { score: 45 },
        cyber: { score: 55 },
        environmental: { score: 20 },
        product: { score: 35 },
        business_interruption: { score: 50 },
        regulatory: { score: 35 },
        supply_chain: { score: 45 },
        reputation: { score: 50 },
        financial: { score: 40 },
      },
      riskFactors: [
        { category: 'liability', nameTr: 'Müşteri yaralanması', baseScore: 60, controlMeasures: ['Safety protocols'], controlMeasuresTr: ['Güvenlik protokolleri'] },
        { category: 'cyber', nameTr: 'Veri ihlali', baseScore: 55, controlMeasures: ['PCI compliance'], controlMeasuresTr: ['PCI uyumluluğu'] },
      ],
      coverageRequirements: [
        { coverageType: 'General Liability', importance: 'mandatory', recommendedLimit: 500000, reasonTr: 'Sorumluluk sigortası' },
        { coverageType: 'Cyber Insurance', importance: 'recommended', recommendedLimit: 250000, reasonTr: 'Siber güvenlik' },
      ],
      premiumModifiers: {
        baseMultiplier: 0.9,
        sizeAdjustments: { micro: 0.7, small: 0.8, medium: 1.0, large: 1.1, enterprise: 1.15 },
      },
      benchmarks: {
        avgPremium: 8000,
        avgClaimsRatio: 0.45,
      },
      trends: {
        premiumTrend: 'stable',
        riskTrend: 'increasing',
      },
    },
    technology: {
      sector: 'technology',
      name: 'Technology',
      nameTr: 'Teknoloji',
      overallRiskScore: 50,
      overallRiskLevel: 'moderate',
      categoryScores: {
        operational: { score: 35 },
        property: { score: 25 },
        liability: { score: 50 },
        employee: { score: 40 },
        cyber: { score: 80 },
        environmental: { score: 10 },
        product: { score: 55 },
        business_interruption: { score: 60 },
        regulatory: { score: 50 },
        supply_chain: { score: 35 },
        reputation: { score: 65 },
        financial: { score: 50 },
      },
      riskFactors: [
        { category: 'cyber', nameTr: 'Siber saldırı', baseScore: 80, controlMeasures: ['Security audits'], controlMeasuresTr: ['Güvenlik denetimleri'] },
      ],
      coverageRequirements: [
        { coverageType: 'Cyber Insurance', importance: 'mandatory', recommendedLimit: 1000000, reasonTr: 'Siber güvenlik' },
        { coverageType: 'E&O Insurance', importance: 'highly_recommended', recommendedLimit: 500000, reasonTr: 'Mesleki sorumluluk' },
      ],
      premiumModifiers: {
        baseMultiplier: 1.1,
        sizeAdjustments: { micro: 0.8, small: 0.9, medium: 1.0, large: 1.1, enterprise: 1.2 },
      },
      benchmarks: {
        avgPremium: 12000,
        avgClaimsRatio: 0.55,
      },
      trends: {
        premiumTrend: 'increasing',
        riskTrend: 'increasing',
      },
    },
    healthcare: {
      sector: 'healthcare',
      name: 'Healthcare',
      nameTr: 'Sağlık',
      overallRiskScore: 70,
      overallRiskLevel: 'high',
      categoryScores: {
        operational: { score: 60 },
        property: { score: 50 },
        liability: { score: 85 },
        employee: { score: 65 },
        cyber: { score: 75 },
        environmental: { score: 55 },
        product: { score: 40 },
        business_interruption: { score: 55 },
        regulatory: { score: 80 },
        supply_chain: { score: 45 },
        reputation: { score: 70 },
        financial: { score: 55 },
      },
      riskFactors: [
        { category: 'liability', nameTr: 'Malpraktis', baseScore: 85, controlMeasures: ['Credentialing'], controlMeasuresTr: ['Yetkilendirme'] },
      ],
      coverageRequirements: [
        { coverageType: 'Medical Malpractice', importance: 'mandatory', recommendedLimit: 2000000, reasonTr: 'Tıbbi malpraktis' },
      ],
      premiumModifiers: {
        baseMultiplier: 1.5,
        sizeAdjustments: { micro: 0.85, small: 0.95, medium: 1.0, large: 1.15, enterprise: 1.3 },
      },
      benchmarks: {
        avgPremium: 25000,
        avgClaimsRatio: 0.70,
      },
      trends: {
        premiumTrend: 'increasing',
        riskTrend: 'stable',
      },
    },
  },
  getIndustryProfile: vi.fn((sector: IndustrySector) => {
    const profiles: Record<string, unknown> = {
      manufacturing: {
        sector: 'manufacturing',
        name: 'Manufacturing',
        nameTr: 'İmalat',
        overallRiskScore: 65,
        categoryScores: {
          operational: { score: 70 },
          property: { score: 65 },
          liability: { score: 55 },
          employee: { score: 75 },
          cyber: { score: 40 },
          environmental: { score: 60 },
          product: { score: 50 },
          business_interruption: { score: 65 },
          regulatory: { score: 45 },
          supply_chain: { score: 55 },
          reputation: { score: 35 },
          financial: { score: 45 },
        },
        riskFactors: [
          { category: 'operational', nameTr: 'Ekipman arızası', baseScore: 70, controlMeasures: ['Maintenance schedule'], controlMeasuresTr: ['Bakım programı'] },
          { category: 'employee', nameTr: 'İş kazaları', baseScore: 75, controlMeasures: ['Safety training'], controlMeasuresTr: ['Güvenlik eğitimi'] },
        ],
        coverageRequirements: [
          { coverageType: 'Property Insurance', importance: 'mandatory', recommendedLimit: 1000000, reasonTr: 'Mülk koruması' },
          { coverageType: 'Employer Liability', importance: 'highly_recommended', recommendedLimit: 500000, reasonTr: 'İşveren sorumluluğu' },
        ],
        premiumModifiers: {
          baseMultiplier: 1.2,
          sizeAdjustments: { micro: 0.8, small: 0.9, medium: 1.0, large: 1.1, enterprise: 1.2 },
        },
        benchmarks: {
          avgPremium: 15000,
          avgClaimsRatio: 0.65,
        },
        trends: {
          premiumTrend: 'increasing',
          riskTrend: 'stable',
        },
      },
      retail: {
        sector: 'retail',
        name: 'Retail',
        nameTr: 'Perakende',
        overallRiskScore: 45,
        categoryScores: {
          operational: { score: 40 },
          property: { score: 55 },
          liability: { score: 60 },
          employee: { score: 45 },
          cyber: { score: 55 },
          environmental: { score: 20 },
          product: { score: 35 },
          business_interruption: { score: 50 },
          regulatory: { score: 35 },
          supply_chain: { score: 45 },
          reputation: { score: 50 },
          financial: { score: 40 },
        },
        riskFactors: [],
        coverageRequirements: [
          { coverageType: 'General Liability', importance: 'mandatory', recommendedLimit: 500000, reasonTr: 'Sorumluluk sigortası' },
        ],
        premiumModifiers: {
          baseMultiplier: 0.9,
          sizeAdjustments: { micro: 0.7, small: 0.8, medium: 1.0, large: 1.1, enterprise: 1.15 },
        },
        benchmarks: { avgPremium: 8000, avgClaimsRatio: 0.45 },
        trends: { premiumTrend: 'stable', riskTrend: 'increasing' },
      },
      technology: {
        sector: 'technology',
        name: 'Technology',
        nameTr: 'Teknoloji',
        overallRiskScore: 50,
        categoryScores: {
          operational: { score: 35 },
          property: { score: 25 },
          liability: { score: 50 },
          employee: { score: 40 },
          cyber: { score: 80 },
          environmental: { score: 10 },
          product: { score: 55 },
          business_interruption: { score: 60 },
          regulatory: { score: 50 },
          supply_chain: { score: 35 },
          reputation: { score: 65 },
          financial: { score: 50 },
        },
        riskFactors: [],
        coverageRequirements: [],
        premiumModifiers: {
          baseMultiplier: 1.1,
          sizeAdjustments: { micro: 0.8, small: 0.9, medium: 1.0, large: 1.1, enterprise: 1.2 },
        },
        benchmarks: { avgPremium: 12000, avgClaimsRatio: 0.55 },
        trends: { premiumTrend: 'increasing', riskTrend: 'increasing' },
      },
    }
    return profiles[sector] || profiles.manufacturing
  }),
}))

vi.mock('@/types/risk', () => ({
  getRiskLevel: (score: number) => {
    if (score <= 20) return 'very_low'
    if (score <= 35) return 'low'
    if (score <= 55) return 'moderate'
    if (score <= 75) return 'high'
    return 'very_high'
  },
}))

vi.mock('@/types/industry-risk', async () => {
  const actual = await vi.importActual('@/types/industry-risk')
  return {
    ...actual,
    getBusinessSize: (employees: number, revenue: number) => {
      if (employees < 10 || revenue < 1000000) return 'micro'
      if (employees < 50 || revenue < 10000000) return 'small'
      if (employees < 250 || revenue < 50000000) return 'medium'
      if (employees < 1000 || revenue < 250000000) return 'large'
      return 'enterprise'
    },
    DEFAULT_INDUSTRY_CATEGORY_WEIGHTS: {
      operational: 0.12,
      property: 0.10,
      liability: 0.12,
      employee: 0.10,
      cyber: 0.10,
      environmental: 0.06,
      product: 0.08,
      business_interruption: 0.08,
      regulatory: 0.08,
      supply_chain: 0.06,
      reputation: 0.05,
      financial: 0.05,
    },
  }
})

// =============================================================================
// Test Data Factories
// =============================================================================

function createMockBusiness(overrides: Partial<BusinessInfo> = {}): BusinessInfo {
  return {
    sector: 'manufacturing',
    name: 'Test Manufacturing Co.',
    employeeCount: 50,
    annualRevenue: 10000000,
    yearsInOperation: 5,
    ...overrides,
  }
}

// =============================================================================
// assessBusinessRisk Tests
// =============================================================================

describe('assessBusinessRisk', () => {
  describe('Basic Assessment', () => {
    it('should return a complete business risk assessment', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment).toHaveProperty('business')
      expect(assessment).toHaveProperty('industryProfile')
      expect(assessment).toHaveProperty('overallRiskScore')
      expect(assessment).toHaveProperty('overallRiskLevel')
      expect(assessment).toHaveProperty('categoryAssessment')
      expect(assessment).toHaveProperty('premiumEstimate')
      expect(assessment).toHaveProperty('coverageRecommendations')
      expect(assessment).toHaveProperty('mitigationPlan')
      expect(assessment).toHaveProperty('peerComparison')
      expect(assessment).toHaveProperty('assessedAt')
      expect(assessment).toHaveProperty('validUntil')
    })

    it('should include industry profile in assessment', () => {
      const business = createMockBusiness({ sector: 'manufacturing' })
      const assessment = assessBusinessRisk(business)

      expect(assessment.industryProfile).toBeDefined()
      expect(assessment.industryProfile.sector).toBe('manufacturing')
    })

    it('should calculate overall risk score', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(typeof assessment.overallRiskScore).toBe('number')
      expect(assessment.overallRiskScore).toBeGreaterThanOrEqual(0)
      expect(assessment.overallRiskScore).toBeLessThanOrEqual(100)
    })

    it('should determine risk level based on score', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(['very_low', 'low', 'moderate', 'high', 'very_high']).toContain(assessment.overallRiskLevel)
    })

    it('should set validity period to 90 days', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      const expectedValidUntil = assessment.assessedAt + 90 * 24 * 60 * 60 * 1000
      expect(assessment.validUntil).toBe(expectedValidUntil)
    })
  })

  describe('Category Assessment', () => {
    it('should assess all risk categories', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      const expectedCategories = [
        'operational', 'property', 'liability', 'employee', 'cyber',
        'environmental', 'product', 'business_interruption', 'regulatory',
        'supply_chain', 'reputation', 'financial',
      ]

      for (const category of expectedCategories) {
        expect(assessment.categoryAssessment).toHaveProperty(category)
      }
    })

    it('should include score, level, factors, and recommendations for each category', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      const operational = assessment.categoryAssessment.operational
      expect(operational).toHaveProperty('score')
      expect(operational).toHaveProperty('level')
      expect(operational).toHaveProperty('factors')
      expect(operational).toHaveProperty('recommendations')
    })

    it('should increase cyber risk for businesses processing personal data', () => {
      const businessWithData = createMockBusiness({ processesPersonalData: true })
      const businessWithoutData = createMockBusiness({ processesPersonalData: false })

      const assessmentWithData = assessBusinessRisk(businessWithData)
      const assessmentWithoutData = assessBusinessRisk(businessWithoutData)

      expect(assessmentWithData.categoryAssessment.cyber.score)
        .toBeGreaterThan(assessmentWithoutData.categoryAssessment.cyber.score)
    })

    it('should increase employee risk for high-risk roles', () => {
      const businessHighRisk = createMockBusiness({ hasHighRiskRoles: true })
      const businessNormalRisk = createMockBusiness({ hasHighRiskRoles: false })

      const assessmentHighRisk = assessBusinessRisk(businessHighRisk)
      const assessmentNormalRisk = assessBusinessRisk(businessNormalRisk)

      expect(assessmentHighRisk.categoryAssessment.employee.score)
        .toBeGreaterThan(assessmentNormalRisk.categoryAssessment.employee.score)
    })

    it('should adjust supply chain risk for single source dependencies', () => {
      const businessSingleSource = createMockBusiness({ singleSourceRisk: true })
      const businessMultiSource = createMockBusiness({ singleSourceRisk: false })

      const assessmentSingleSource = assessBusinessRisk(businessSingleSource)
      const assessmentMultiSource = assessBusinessRisk(businessMultiSource)

      expect(assessmentSingleSource.categoryAssessment.supply_chain.score)
        .toBeGreaterThan(assessmentMultiSource.categoryAssessment.supply_chain.score)
    })

    it('should reduce operational risk for established businesses', () => {
      const newBusiness = createMockBusiness({ yearsInOperation: 1 })
      const establishedBusiness = createMockBusiness({ yearsInOperation: 15 })

      const assessmentNew = assessBusinessRisk(newBusiness)
      const assessmentEstablished = assessBusinessRisk(establishedBusiness)

      expect(assessmentNew.categoryAssessment.operational.score)
        .toBeGreaterThan(assessmentEstablished.categoryAssessment.operational.score)
    })
  })

  describe('Premium Estimate', () => {
    it('should calculate premium estimate', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment.premiumEstimate).toHaveProperty('annualPremium')
      expect(assessment.premiumEstimate).toHaveProperty('perMillionRevenue')
      expect(assessment.premiumEstimate).toHaveProperty('vsIndustryAverage')
    })

    it('should scale premium with revenue', () => {
      const smallBusiness = createMockBusiness({ annualRevenue: 5000000 })
      const largeBusiness = createMockBusiness({ annualRevenue: 50000000 })

      const smallAssessment = assessBusinessRisk(smallBusiness)
      const largeAssessment = assessBusinessRisk(largeBusiness)

      expect(largeAssessment.premiumEstimate.annualPremium)
        .toBeGreaterThan(smallAssessment.premiumEstimate.annualPremium)
    })

    it('should apply size modifiers', () => {
      const business = createMockBusiness({ size: 'small' })
      const assessment = assessBusinessRisk(business)

      expect(assessment.premiumEstimate.annualPremium).toBeGreaterThan(0)
    })
  })

  describe('Coverage Recommendations', () => {
    it('should generate coverage recommendations', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment.coverageRecommendations).toBeInstanceOf(Array)
      expect(assessment.coverageRecommendations.length).toBeGreaterThan(0)
    })

    it('should prioritize mandatory coverages', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      const mandatoryIndex = assessment.coverageRecommendations.findIndex(
        r => r.coverage.importance === 'mandatory'
      )
      const optionalIndex = assessment.coverageRecommendations.findIndex(
        r => r.coverage.importance === 'optional'
      )

      if (mandatoryIndex !== -1 && optionalIndex !== -1) {
        expect(mandatoryIndex).toBeLessThan(optionalIndex)
      }
    })

    it('should include customized limits based on revenue', () => {
      const business = createMockBusiness({ annualRevenue: 20000000 })
      const assessment = assessBusinessRisk(business)

      const rec = assessment.coverageRecommendations[0]
      expect(rec.customizedLimit).toBeDefined()
      expect(rec.customizedLimit).toBeGreaterThan(0)
    })
  })

  describe('Mitigation Plan', () => {
    it('should generate mitigation plan for high-risk areas', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment.mitigationPlan).toBeInstanceOf(Array)
    })

    it('should include priority levels in mitigation actions', () => {
      const business = createMockBusiness({ hasHighRiskRoles: true })
      const assessment = assessBusinessRisk(business)

      if (assessment.mitigationPlan.length > 0) {
        const action = assessment.mitigationPlan[0]
        expect(['critical', 'high', 'medium']).toContain(action.priority)
      }
    })

    it('should include expected impact and timeline', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      if (assessment.mitigationPlan.length > 0) {
        const action = assessment.mitigationPlan[0]
        expect(action).toHaveProperty('expectedImpact')
        expect(action).toHaveProperty('timeline')
      }
    })
  })

  describe('Peer Comparison', () => {
    it('should calculate peer comparison', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment.peerComparison).toHaveProperty('percentile')
      expect(assessment.peerComparison).toHaveProperty('betterThan')
      expect(assessment.peerComparison).toHaveProperty('keyDifferences')
    })

    it('should have percentile between 1 and 99', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment.peerComparison.percentile).toBeGreaterThanOrEqual(1)
      expect(assessment.peerComparison.percentile).toBeLessThanOrEqual(99)
    })

    it('should calculate betterThan correctly', () => {
      const business = createMockBusiness()
      const assessment = assessBusinessRisk(business)

      expect(assessment.peerComparison.betterThan).toBe(100 - assessment.peerComparison.percentile)
    })
  })
})

// =============================================================================
// compareIndustries Tests
// =============================================================================

describe('compareIndustries', () => {
  it('should compare two industries', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    expect(comparison).toHaveProperty('industry1', 'manufacturing')
    expect(comparison).toHaveProperty('industry2', 'retail')
    expect(comparison).toHaveProperty('riskDifference')
    expect(comparison).toHaveProperty('premiumDifference')
    expect(comparison).toHaveProperty('coverageDifferences')
    expect(comparison).toHaveProperty('insights')
  })

  it('should calculate overall risk difference', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    expect(comparison.riskDifference.overall).toBeDefined()
    expect(typeof comparison.riskDifference.overall).toBe('number')
  })

  it('should calculate risk difference by category', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    expect(comparison.riskDifference.byCategory).toBeDefined()
    expect(comparison.riskDifference.byCategory.operational).toBeDefined()
    expect(comparison.riskDifference.byCategory.cyber).toBeDefined()
  })

  it('should calculate premium difference', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    expect(typeof comparison.premiumDifference).toBe('number')
  })

  it('should identify coverage differences', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    expect(comparison.coverageDifferences).toBeInstanceOf(Array)
  })

  it('should generate insights for significant differences', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    expect(comparison.insights).toBeInstanceOf(Array)
  })

  it('should identify advantage when first industry has lower risk', () => {
    const comparison = compareIndustries('retail', 'manufacturing')

    const hasAdvantage = comparison.insights.some(i => i.type === 'advantage')
    expect(hasAdvantage).toBe(true)
  })

  it('should identify disadvantage when first industry has higher risk', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    const hasDisadvantage = comparison.insights.some(i => i.type === 'disadvantage')
    expect(hasDisadvantage).toBe(true)
  })

  it('should include Turkish messages in insights', () => {
    const comparison = compareIndustries('manufacturing', 'retail')

    if (comparison.insights.length > 0) {
      expect(comparison.insights[0]).toHaveProperty('messageTr')
    }
  })
})

// =============================================================================
// getIndustryRankings Tests
// =============================================================================

describe('getIndustryRankings', () => {
  describe('Risk Rankings', () => {
    it('should return rankings by risk', () => {
      const rankings = getIndustryRankings('risk')

      expect(rankings).toHaveProperty('metric', 'risk')
      expect(rankings).toHaveProperty('rankings')
      expect(rankings.rankings).toBeInstanceOf(Array)
    })

    it('should include rank and value for each industry', () => {
      const rankings = getIndustryRankings('risk')

      const first = rankings.rankings[0]
      expect(first).toHaveProperty('rank')
      expect(first).toHaveProperty('sector')
      expect(first).toHaveProperty('value')
      expect(first).toHaveProperty('trend')
    })

    it('should order by risk descending', () => {
      const rankings = getIndustryRankings('risk')

      for (let i = 0; i < rankings.rankings.length - 1; i++) {
        expect(rankings.rankings[i].value).toBeGreaterThanOrEqual(rankings.rankings[i + 1].value)
      }
    })

    it('should assign ranks starting from 1', () => {
      const rankings = getIndustryRankings('risk')

      expect(rankings.rankings[0].rank).toBe(1)
    })
  })

  describe('Premium Rankings', () => {
    it('should return rankings by premium', () => {
      const rankings = getIndustryRankings('premium')

      expect(rankings.metric).toBe('premium')
      expect(rankings.rankings.length).toBeGreaterThan(0)
    })

    it('should order by premium ascending', () => {
      const rankings = getIndustryRankings('premium')

      for (let i = 0; i < rankings.rankings.length - 1; i++) {
        expect(rankings.rankings[i].value).toBeLessThanOrEqual(rankings.rankings[i + 1].value)
      }
    })
  })

  describe('Claims Rankings', () => {
    it('should return rankings by claims ratio', () => {
      const rankings = getIndustryRankings('claims')

      expect(rankings.metric).toBe('claims')
      expect(rankings.rankings.length).toBeGreaterThan(0)
    })

    it('should include claims ratio as percentage', () => {
      const rankings = getIndustryRankings('claims')

      // Claims ratios should be between 0 and 100 (as percentages)
      for (const ranking of rankings.rankings) {
        expect(ranking.value).toBeGreaterThanOrEqual(0)
        expect(ranking.value).toBeLessThanOrEqual(100)
      }
    })
  })

  describe('Growth Rankings', () => {
    it('should return rankings by growth', () => {
      const rankings = getIndustryRankings('growth')

      expect(rankings.metric).toBe('growth')
      expect(rankings.rankings.length).toBeGreaterThan(0)
    })
  })

  describe('Trend Indicators', () => {
    it('should include trend direction', () => {
      const rankings = getIndustryRankings('risk')

      for (const ranking of rankings.rankings) {
        expect(['up', 'down', 'stable']).toContain(ranking.trend)
      }
    })
  })
})

// =============================================================================
// findSimilarIndustries Tests
// =============================================================================

describe('findSimilarIndustries', () => {
  it('should find similar industries', () => {
    const similar = findSimilarIndustries('manufacturing')

    expect(similar).toBeInstanceOf(Array)
    expect(similar.length).toBeGreaterThan(0)
  })

  it('should not include the source industry', () => {
    const similar = findSimilarIndustries('manufacturing')

    const hasSelf = similar.some(s => s.sector === 'manufacturing')
    expect(hasSelf).toBe(false)
  })

  it('should include similarity score', () => {
    const similar = findSimilarIndustries('manufacturing')

    for (const item of similar) {
      expect(item).toHaveProperty('sector')
      expect(item).toHaveProperty('similarity')
      expect(typeof item.similarity).toBe('number')
    }
  })

  it('should respect count parameter', () => {
    const similar2 = findSimilarIndustries('manufacturing', 2)
    const similar5 = findSimilarIndustries('manufacturing', 5)

    expect(similar2.length).toBeLessThanOrEqual(2)
    expect(similar5.length).toBeLessThanOrEqual(5)
  })

  it('should default to 3 results', () => {
    const similar = findSimilarIndustries('manufacturing')

    expect(similar.length).toBeLessThanOrEqual(3)
  })

  it('should order by similarity descending', () => {
    const similar = findSimilarIndustries('manufacturing')

    for (let i = 0; i < similar.length - 1; i++) {
      expect(similar[i].similarity).toBeGreaterThanOrEqual(similar[i + 1].similarity)
    }
  })

  it('should have non-negative similarity scores', () => {
    const similar = findSimilarIndustries('retail')

    for (const item of similar) {
      expect(item.similarity).toBeGreaterThanOrEqual(0)
    }
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Assessment Integration', () => {
  it('should work with various business characteristics', () => {
    const business = createMockBusiness({
      sector: 'manufacturing',
      employeeCount: 200,
      annualRevenue: 50000000,
      yearsInOperation: 10,
      processesPersonalData: true,
      hasHighRiskRoles: true,
      hasFleet: true,
      fleetSize: 15,
      ownedProperties: true,
      singleSourceRisk: true,
      internationalSuppliers: true,
      certifications: ['ISO9001', 'ISO14001', 'OHSAS18001'],
    })

    const assessment = assessBusinessRisk(business)

    expect(assessment.overallRiskScore).toBeGreaterThan(0)
    expect(assessment.categoryAssessment.cyber.score).toBeGreaterThan(40) // Higher due to personal data
    expect(assessment.categoryAssessment.employee.score).toBeGreaterThan(75) // Higher due to high risk roles
    expect(assessment.categoryAssessment.liability.score).toBeGreaterThan(55) // Higher due to fleet
  })

  it('should assess different industry sectors', () => {
    const sectors: IndustrySector[] = ['manufacturing', 'retail', 'technology']

    for (const sector of sectors) {
      const business = createMockBusiness({ sector })
      const assessment = assessBusinessRisk(business)

      expect(assessment.industryProfile.sector).toBe(sector)
      expect(assessment.overallRiskScore).toBeGreaterThan(0)
    }
  })

  it('should compare and rank consistently', () => {
    const comparison = compareIndustries('manufacturing', 'retail')
    const rankings = getIndustryRankings('risk')

    // Manufacturing has higher risk than retail, so difference (second - first) is negative
    expect(comparison.riskDifference.overall).toBeLessThan(0)

    // Manufacturing should rank higher (worse) in risk rankings
    const mfgRank = rankings.rankings.find(r => r.sector === 'manufacturing')?.rank ?? 0
    const retailRank = rankings.rankings.find(r => r.sector === 'retail')?.rank ?? 0

    expect(mfgRank).toBeLessThan(retailRank) // Lower rank number = higher risk
  })
})
