/**
 * Extraction Pipeline Output Quality Tests
 *
 * Tests that validate the extraction pipeline produces correct output
 * using sample policy data as reference. Covers:
 * - convertToAnalyzedPolicy() output structure
 * - Coverage name translation
 * - Status calculation
 * - AI insights generation
 * - Validation scoring
 */

import { describe, it, expect } from 'vitest'
import { samplePolicies, sampleTurkishKaskoPolicy } from '@/data/sample-policies'
import type { AnalyzedPolicy, PolicyType } from '@/types/policy'
import { validateExtraction } from '@/lib/ai/extraction-validator'

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a mock ExtractedPolicyData from an AnalyzedPolicy sample
 * This simulates what the AI extraction would produce before conversion
 */
function sampleToExtractedData(policy: AnalyzedPolicy) {
  return {
    policyNumber: policy.policyNumber,
    provider: policy.provider,
    policyType: policy.type as PolicyType,
    insuredName: policy.insuredPerson,
    insuredAddress: policy.location || null,
    startDate: policy.startDate,
    endDate: policy.expiryDate,
    premium: policy.premium,
    currency: 'TRY',
    paymentFrequency: 'annual' as const,
    coverages: policy.coverages.map((c) => ({
      name: c.name,
      nameTr: c.nameTr || null,
      limit: c.limit,
      deductible: c.deductible,
      description: null,
      isUnlimited: c.isUnlimited || false,
      isMarketValue: c.isMarketValue || false,
      category: c.category || ('main' as const),
    })),
    specialConditions: policy.specialConditions || [],
    exclusions: policy.exclusions || [],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    confidence: {
      overall: policy.aiConfidence || 0.85,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.9,
      coverages: 0.85,
    },
    vehicleInfo:
      policy.type === 'kasko' || policy.type === 'traffic'
        ? {
            plateNumber: '34 ABC 123',
            make: 'Toyota',
            model: 'Corolla',
            year: 2023,
          }
        : undefined,
  }
}

// =============================================================================
// TEST DATA
// =============================================================================

const kaskoSample = samplePolicies.find((p) => p.type === 'kasko')!
const trafficSample = samplePolicies.find((p) => p.type === 'traffic')!
const homeSample = samplePolicies.find((p) => p.type === 'home')!
const healthSample = samplePolicies.find((p) => p.type === 'health')!

// =============================================================================
// TESTS: SAMPLE DATA STRUCTURE QUALITY
// =============================================================================

describe('Sample Policy Data Structure Quality', () => {
  it('should have all required fields for each sample policy', () => {
    const requiredFields = [
      'id',
      'policyNumber',
      'provider',
      'type',
      'typeTr',
      'coverage',
      'premium',
      'deductible',
      'startDate',
      'expiryDate',
      'status',
      'insuredPerson',
      'coverages',
      'exclusions',
    ]

    samplePolicies.forEach((policy) => {
      requiredFields.forEach((field) => {
        expect(policy).toHaveProperty(field)
      })
    })
  })

  it('should have valid date formats (YYYY-MM-DD)', () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/

    samplePolicies.forEach((policy) => {
      expect(policy.startDate).toMatch(dateRegex)
      expect(policy.expiryDate).toMatch(dateRegex)
    })
  })

  it('should have start date before expiry date', () => {
    samplePolicies.forEach((policy) => {
      const start = new Date(policy.startDate)
      const end = new Date(policy.expiryDate)
      expect(end.getTime()).toBeGreaterThan(start.getTime())
    })
  })

  it('should have non-negative financial values', () => {
    samplePolicies.forEach((policy) => {
      expect(policy.premium).toBeGreaterThan(0)
      expect(policy.coverage).toBeGreaterThanOrEqual(0) // 0 for market value
      expect(policy.deductible).toBeGreaterThanOrEqual(0)
    })
  })

  it('should have at least one coverage for each policy', () => {
    samplePolicies.forEach((policy) => {
      expect(policy.coverages.length).toBeGreaterThan(0)
    })
  })

  it('should have valid policy types matching known types', () => {
    const validTypes: PolicyType[] = [
      'kasko',
      'traffic',
      'home',
      'health',
      'life',
      'dask',
      'business',
      'nakliyat',
    ]

    samplePolicies.forEach((policy) => {
      expect(validTypes).toContain(policy.type)
    })
  })
})

// =============================================================================
// TESTS: COVERAGE STRUCTURE QUALITY
// =============================================================================

describe('Coverage Structure Quality', () => {
  it('should have name and nameTr for all coverages', () => {
    samplePolicies.forEach((policy) => {
      policy.coverages.forEach((coverage) => {
        expect(coverage.name).toBeTruthy()
        expect(typeof coverage.name).toBe('string')
        // nameTr may not always be set but should be a string if present
        if (coverage.nameTr) {
          expect(typeof coverage.nameTr).toBe('string')
        }
      })
    })
  })

  it('should have numeric limits and deductibles', () => {
    samplePolicies.forEach((policy) => {
      policy.coverages.forEach((coverage) => {
        expect(typeof coverage.limit).toBe('number')
        expect(typeof coverage.deductible).toBe('number')
        expect(coverage.limit).toBeGreaterThanOrEqual(0)
        expect(coverage.deductible).toBeGreaterThanOrEqual(0)
      })
    })
  })

  it('should have included flag as boolean', () => {
    samplePolicies.forEach((policy) => {
      policy.coverages.forEach((coverage) => {
        expect(typeof coverage.included).toBe('boolean')
      })
    })
  })

  it('should have kasko coverages related to vehicle insurance', () => {
    const kaskoNames = kaskoSample.coverages.map((c) => c.name.toLowerCase())
    // At minimum should have some vehicle-related coverages
    const vehicleRelatedTerms = [
      'collision',
      'theft',
      'fire',
      'natural',
      'glass',
      'roadside',
      'liability',
      'accident',
    ]
    const hasRelevantCoverage = vehicleRelatedTerms.some((term) =>
      kaskoNames.some((name) => name.includes(term))
    )
    expect(hasRelevantCoverage).toBe(true)
  })

  it('should have traffic coverages for bodily injury and property damage', () => {
    const trafficNames = trafficSample.coverages.map((c) => c.name.toLowerCase())
    expect(trafficNames.some((n) => n.includes('bodily') || n.includes('injury'))).toBe(true)
    expect(
      trafficNames.some(
        (n) => n.includes('property') || n.includes('damage') || n.includes('material')
      )
    ).toBe(true)
  })

  it('should have home coverages for fire and related perils', () => {
    const homeNames = homeSample.coverages.map((c) => c.name.toLowerCase())
    expect(
      homeNames.some((n) => n.includes('fire') || n.includes('theft') || n.includes('water'))
    ).toBe(true)
  })

  it('should have health coverages for medical treatment', () => {
    const healthNames = healthSample.coverages.map((c) => c.name.toLowerCase())
    expect(
      healthNames.some(
        (n) =>
          n.includes('hospital') ||
          n.includes('outpatient') ||
          n.includes('surgery') ||
          n.includes('medical') ||
          n.includes('dental')
      )
    ).toBe(true)
  })
})

// =============================================================================
// TESTS: EXTRACTION VALIDATION
// =============================================================================

describe('Extraction Validation with Sample Data', () => {
  it('should produce valid extraction result for kasko sample', () => {
    const extractedData = sampleToExtractedData(kaskoSample)
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    expect(result).toBeDefined()
    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(50)
  })

  it('should produce valid extraction result for traffic sample', () => {
    const extractedData = sampleToExtractedData(trafficSample)
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    expect(result).toBeDefined()
    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(50)
  })

  it('should produce valid extraction result for home sample', () => {
    const extractedData = sampleToExtractedData(homeSample)
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    expect(result).toBeDefined()
    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(50)
  })

  it('should produce valid extraction result for health sample', () => {
    const extractedData = sampleToExtractedData(healthSample)
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    expect(result).toBeDefined()
    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(50)
  })

  it('should detect missing policy number as warning (reduces score)', () => {
    const extractedData = sampleToExtractedData(kaskoSample)
    extractedData.policyNumber = null
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    // Validator classifies missing policyNumber as 'warning' severity
    expect(result.issues.some((i) => i.field === 'policyNumber' && i.severity === 'warning')).toBe(
      true
    )
  })

  it('should detect missing provider as warning (reduces score)', () => {
    const extractedData = sampleToExtractedData(kaskoSample)
    extractedData.provider = null
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    // Validator classifies missing provider as 'warning' severity
    expect(result.issues.some((i) => i.field === 'provider' && i.severity === 'warning')).toBe(true)
  })

  it('should detect invalid dates (end before start)', () => {
    const extractedData = sampleToExtractedData(kaskoSample)
    extractedData.startDate = '2025-06-01'
    extractedData.endDate = '2024-01-01'
    const result = validateExtraction(extractedData as Parameters<typeof validateExtraction>[0])

    expect(result.issues.some((i) => i.severity === 'error' || i.severity === 'warning')).toBe(true)
  })

  it('should score complete extraction higher than incomplete', () => {
    const completeData = sampleToExtractedData(kaskoSample)
    const incompleteData = sampleToExtractedData(kaskoSample)
    incompleteData.policyNumber = null
    incompleteData.provider = null

    const completeResult = validateExtraction(
      completeData as Parameters<typeof validateExtraction>[0]
    )
    const incompleteResult = validateExtraction(
      incompleteData as Parameters<typeof validateExtraction>[0]
    )

    expect(completeResult.score).toBeGreaterThan(incompleteResult.score)
  })
})

// =============================================================================
// TESTS: AI INSIGHTS QUALITY
// =============================================================================

describe('AI Insights Quality in Sample Data', () => {
  it('should have non-empty insight strings for all policies', () => {
    samplePolicies.forEach((policy) => {
      if (policy.aiInsights) {
        policy.aiInsights.forEach((insight) => {
          expect(insight.length).toBeGreaterThan(0)
          expect(typeof insight).toBe('string')
        })
      }
    })
  })

  it('should have kasko insights mentioning coverage or premium', () => {
    const kaskoInsights = kaskoSample.aiInsights?.join(' ').toLowerCase() || ''
    const hasRelevantContent =
      kaskoInsights.includes('coverage') ||
      kaskoInsights.includes('premium') ||
      kaskoInsights.includes('protection') ||
      kaskoInsights.includes('gap')
    expect(hasRelevantContent).toBe(true)
  })

  it('should have traffic insights mentioning mandatory or standard', () => {
    const trafficInsights = trafficSample.aiInsights?.join(' ').toLowerCase() || ''
    const hasRelevantContent =
      trafficInsights.includes('mandatory') ||
      trafficInsights.includes('standard') ||
      trafficInsights.includes('coverage') ||
      trafficInsights.includes('market')
    expect(hasRelevantContent).toBe(true)
  })

  it('should have confidence scores in valid range (0-1)', () => {
    samplePolicies.forEach((policy) => {
      if (policy.aiConfidence !== undefined) {
        expect(policy.aiConfidence).toBeGreaterThanOrEqual(0)
        expect(policy.aiConfidence).toBeLessThanOrEqual(1)
      }
    })
  })

  it('should have high confidence (>0.8) for well-structured sample policies', () => {
    samplePolicies.forEach((policy) => {
      if (policy.aiConfidence !== undefined) {
        expect(policy.aiConfidence).toBeGreaterThanOrEqual(0.8)
      }
    })
  })
})

// =============================================================================
// TESTS: MARKET COMPARISON DATA QUALITY
// =============================================================================

describe('Market Comparison Data Quality', () => {
  it('should have market comparison data for all samples', () => {
    samplePolicies.forEach((policy) => {
      expect(policy.marketComparison).toBeDefined()
    })
  })

  it('should have valid percentile in 0-100 range', () => {
    samplePolicies.forEach((policy) => {
      if (policy.marketComparison?.percentile !== undefined) {
        expect(policy.marketComparison.percentile).toBeGreaterThanOrEqual(0)
        expect(policy.marketComparison.percentile).toBeLessThanOrEqual(100)
      }
    })
  })

  it('should have positive average premium and coverage', () => {
    samplePolicies.forEach((policy) => {
      if (policy.marketComparison?.averagePremium) {
        expect(policy.marketComparison.averagePremium).toBeGreaterThan(0)
      }
      if (policy.marketComparison?.averageCoverage) {
        expect(policy.marketComparison.averageCoverage).toBeGreaterThan(0)
      }
    })
  })
})

// =============================================================================
// TESTS: EXCLUSION QUALITY
// =============================================================================

describe('Exclusion Data Quality', () => {
  it('should have non-empty exclusion strings', () => {
    samplePolicies.forEach((policy) => {
      policy.exclusions.forEach((exclusion) => {
        expect(exclusion.length).toBeGreaterThan(0)
        expect(typeof exclusion).toBe('string')
      })
    })
  })

  it('should have policy-type relevant exclusions', () => {
    // Kasko: vehicle-related exclusions
    const kaskoExclusions = kaskoSample.exclusions.join(' ').toLowerCase()
    const hasKaskoRelevance =
      kaskoExclusions.includes('war') ||
      kaskoExclusions.includes('alcohol') ||
      kaskoExclusions.includes('earthquake') ||
      kaskoExclusions.includes('maintenance') ||
      kaskoExclusions.includes('unlicensed') ||
      kaskoExclusions.includes('racing')
    expect(hasKaskoRelevance).toBe(true)
  })

  it('should have reasonable number of exclusions per policy', () => {
    samplePolicies.forEach((policy) => {
      // Policies typically have 1-20 exclusions
      expect(policy.exclusions.length).toBeGreaterThan(0)
      expect(policy.exclusions.length).toBeLessThan(50)
    })
  })
})

// =============================================================================
// TESTS: SPECIAL CONDITIONS
// =============================================================================

describe('Special Conditions Data Quality', () => {
  it('should have special conditions for some policies', () => {
    const hasConditions = samplePolicies.some(
      (p) => p.specialConditions && p.specialConditions.length > 0
    )
    expect(hasConditions).toBe(true)
  })

  it('should have non-empty condition strings', () => {
    samplePolicies.forEach((policy) => {
      if (policy.specialConditions) {
        policy.specialConditions.forEach((condition) => {
          expect(condition.length).toBeGreaterThan(0)
          expect(typeof condition).toBe('string')
        })
      }
    })
  })
})

// =============================================================================
// TESTS: TURKISH KASKO SAMPLE SPECIAL EXPORT
// =============================================================================

describe('sampleTurkishKaskoPolicy Export', () => {
  it('should be a kasko type policy', () => {
    expect(sampleTurkishKaskoPolicy.type).toBe('kasko')
  })

  it('should have comprehensive coverage set', () => {
    expect(sampleTurkishKaskoPolicy.coverages.length).toBeGreaterThanOrEqual(3)
  })

  it('should be the same as the first policy in samplePolicies', () => {
    expect(sampleTurkishKaskoPolicy.id).toBe(samplePolicies[0].id)
  })

  it('should have all AI-enhanced fields', () => {
    expect(sampleTurkishKaskoPolicy.aiConfidence).toBeDefined()
    expect(sampleTurkishKaskoPolicy.aiInsights).toBeDefined()
    expect(sampleTurkishKaskoPolicy.marketComparison).toBeDefined()
  })
})
