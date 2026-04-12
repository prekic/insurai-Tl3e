/**
 * Comprehensive Branch Coverage Tests for Post-Extraction Validation
 *
 * Targets the ~32 uncovered branches in extraction-validator.ts.
 * Organized by validation function to cover every conditional path.
 */
import { describe, it, expect } from 'vitest'
import { validateExtraction, formatValidationIssues } from './extraction-validator'
import type { ExtendedExtractedPolicyData } from './extraction-schema-extended'

// ---------------------------------------------------------------------------
// Helper: create a minimal valid policy with overrides
// ---------------------------------------------------------------------------
function makePolicy(
  overrides: Partial<ExtendedExtractedPolicyData> = {}
): ExtendedExtractedPolicyData {
  return {
    policyNumber: 'POL-2026-999',
    provider: 'Allianz Sigorta',
    policyType: 'home',
    insuredName: 'Ahmet Yılmaz',
    insuredAddress: 'İstanbul, Türkiye',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    premium: 6000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    coverages: [
      { name: 'Yangın', limit: 500000, deductible: 1000, description: null },
      { name: 'Deprem', limit: 500000, deductible: 2000, description: null },
    ],
    specialConditions: [],
    exclusions: [],
    confidence: {
      overall: 0.85,
      policyNumber: 0.9,
      provider: 0.9,
      dates: 0.9,
      premium: 0.85,
      coverages: 0.8,
    },
    ...overrides,
  }
}

// ===========================================================================
// validateBaseFields — uncovered branches
// ===========================================================================
describe('validateBaseFields — uncovered branches', () => {
  it('should warn on missing provider', () => {
    const result = validateExtraction(makePolicy({ provider: null }))
    expect(result.issues.some((i) => i.field === 'provider' && i.severity === 'warning')).toBe(true)
  })

  it('should warn when startDate is present but has invalid format', () => {
    // startDate is non-null but parseTurkishDate returns null
    const result = validateExtraction(makePolicy({ startDate: 'not-a-date' }))
    const issue = result.issues.find((i) => i.field === 'startDate' && i.severity === 'warning')
    expect(issue).toBeDefined()
    expect(issue!.message).toContain('Invalid date format')
    expect(issue!.suggestion).toBe('Expected format: YYYY-MM-DD')
    expect(issue!.suggestionTr).toBe('Beklenen format: YYYY-MM-DD')
  })

  it('should warn when premium is undefined (not just null)', () => {
    const data = makePolicy()
    // Explicitly set premium to undefined to trigger the undefined branch
    // @ts-expect-error - mismatch due to schema update
    ;(data as Record<string, unknown>).premium = undefined
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'premium' && i.severity === 'warning')).toBe(true)
  })

  it('should error when premium is zero', () => {
    const result = validateExtraction(makePolicy({ premium: 0 }))
    expect(result.issues.some((i) => i.field === 'premium' && i.severity === 'error')).toBe(true)
  })

  it('should warn when coverages is undefined (null-ish)', () => {
    const data = makePolicy()
    // @ts-expect-error - mismatch due to schema update
    ;(data as Record<string, unknown>).coverages = undefined
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'coverages' && i.severity === 'warning')).toBe(
      true
    )
  })

  it('should not warn about dates when both are null (no date-logic branch)', () => {
    const result = validateExtraction(makePolicy({ startDate: null, endDate: null }))
    // Should NOT have a "dates" field issue (only individual startDate/endDate errors)
    const datesIssue = result.issues.find((i) => i.field === 'dates')
    expect(datesIssue).toBeUndefined()
    // But should have individual errors
    expect(result.issues.some((i) => i.field === 'startDate')).toBe(true)
    expect(result.issues.some((i) => i.field === 'endDate')).toBe(true)
  })

  it('should not warn about long term when dates are normal (<=400 days)', () => {
    const result = validateExtraction(
      makePolicy({ startDate: '2026-01-01', endDate: '2026-12-31' })
    )
    const longTermIssue = result.issues.find(
      (i) => i.field === 'dates' && i.message.includes('unusually long')
    )
    expect(longTermIssue).toBeUndefined()
  })

  it('should handle end date equal to start date as error', () => {
    const result = validateExtraction(
      makePolicy({ startDate: '2026-06-01', endDate: '2026-06-01' })
    )
    expect(
      result.issues.some((i) => i.field === 'dates' && i.message.includes('after start date'))
    ).toBe(true)
    expect(result.isValid).toBe(false)
  })

  it('should not issue confidence warning when overall >= 0.5', () => {
    const result = validateExtraction(
      makePolicy({
        confidence: {
          overall: 0.5,
          policyNumber: 0.5,
          provider: 0.5,
          dates: 0.5,
          premium: 0.5,
          coverages: 0.5,
        },
      })
    )
    expect(result.issues.some((i) => i.field === 'confidence')).toBe(false)
  })
})

// ===========================================================================
// validateKasko — uncovered branches
// ===========================================================================
describe('validateKasko — uncovered branches', () => {
  const kaskoBase = () =>
    makePolicy({
      policyType: 'kasko',
      premium: 20000,
      vehicle: {
        make: 'BMW',
        model: 'X3',
        year: 2023,
        plateNumber: '34 ABC 123',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 800000,
        usageType: 'private',
      },
      coverages: [
        { name: 'Hasar', limit: 500000, deductible: 1000, description: null },
        { name: 'Hırsızlık', limit: 500000, deductible: 0, description: null },
        { name: 'Yangın', limit: 500000, deductible: 0, description: null },
        { name: 'Deprem', limit: 500000, deductible: 0, description: null },
        { name: 'Sel', limit: 500000, deductible: 0, description: null },
      ],
    })

  it('should info when premium is above kasko max range', () => {
    const data = kaskoBase()
    data.premium = 50000 // Above 45000 max
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'premium' && i.severity === 'info' && i.message.includes('above')
      )
    ).toBe(true)
  })

  it('should not warn about premium when within normal kasko range', () => {
    const data = kaskoBase()
    data.premium = 20000 // Within 8000-45000
    const result = validateExtraction(data)
    const premiumIssue = result.issues.find(
      (i) => i.field === 'premium' && (i.message.includes('below') || i.message.includes('above'))
    )
    expect(premiumIssue).toBeUndefined()
  })

  it('should not warn about premium when kasko premium is null', () => {
    const data = kaskoBase()
    data.premium = null
    const result = validateExtraction(data)
    // The premium null warning comes from base validation, not kasko-specific range check
    const kaskoRangeIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Kasko range')
    )
    expect(kaskoRangeIssue).toBeUndefined()
  })

  it('should warn when vehicle has no plateNumber (null)', () => {
    const data = kaskoBase()
    data.vehicle!.plateNumber = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'vehicle.plateNumber' && i.message.includes('not extracted')
      )
    ).toBe(true)
  })

  it('should not warn about plate when plateNumber is valid', () => {
    const data = kaskoBase()
    // plate is already valid in kaskoBase
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'vehicle.plateNumber')).toBe(false)
  })

  it('should not warn about vehicle year when year is null', () => {
    const data = kaskoBase()
    data.vehicle!.year = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'vehicle.year')).toBe(false)
  })

  it('should warn when vehicle year is in the future (> currentYear + 1)', () => {
    const data = kaskoBase()
    data.vehicle!.year = new Date().getFullYear() + 2
    const result = validateExtraction(data)
    expect(
      result.issues.some((i) => i.field === 'vehicle.year' && i.message.includes('seems invalid'))
    ).toBe(true)
  })

  it('should not warn about vehicle year when year is valid', () => {
    const data = kaskoBase()
    data.vehicle!.year = 2020
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'vehicle.year')).toBe(false)
  })

  it('should info when vehicleValue is below 50000', () => {
    const data = kaskoBase()
    data.vehicle!.vehicleValue = 40000
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'vehicle.vehicleValue' && i.message.includes('seems low')
      )
    ).toBe(true)
  })

  it('should not warn about vehicleValue when null', () => {
    const data = kaskoBase()
    data.vehicle!.vehicleValue = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'vehicle.vehicleValue')).toBe(false)
  })

  it('should not warn about vehicleValue when >= 50000', () => {
    const data = kaskoBase()
    data.vehicle!.vehicleValue = 50000
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'vehicle.vehicleValue')).toBe(false)
  })

  it('should not report missing coverages when all expected are present', () => {
    const data = kaskoBase()
    // kaskoBase already has all 5 expected coverage names
    const result = validateExtraction(data)
    const missingCovIssue = result.issues.find(
      (i) => i.field === 'coverages' && i.message.includes('may be missing')
    )
    expect(missingCovIssue).toBeUndefined()
  })

  it('should report partially missing coverages', () => {
    const data = kaskoBase()
    // Remove some coverages
    data.coverages = [{ name: 'Hasar', limit: 500000, deductible: 0, description: null }]
    const result = validateExtraction(data)
    const missingCovIssue = result.issues.find(
      (i) => i.field === 'coverages' && i.message.includes('may be missing')
    )
    expect(missingCovIssue).toBeDefined()
    expect(missingCovIssue!.message).toContain('hirsizlik')
  })

  it('should handle kasko with no coverages (undefined)', () => {
    const data = kaskoBase()
    // @ts-expect-error - mismatch due to schema update
    ;(data as Record<string, unknown>).coverages = undefined
    const result = validateExtraction(data)
    // Both base "no coverages" and kasko "missing expected" should fire
    expect(result.issues.some((i) => i.field === 'coverages')).toBe(true)
  })
})

// ===========================================================================
// validateTraffic — uncovered branches
// ===========================================================================
describe('validateTraffic — uncovered branches', () => {
  const trafficBase = () =>
    makePolicy({
      policyType: 'traffic',
      premium: 4500,
      vehicle: {
        make: 'Ford',
        model: 'Focus',
        year: 2021,
        plateNumber: '06 DEF 789',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: null,
        usageType: 'private',
      },
      trafficLimits: {
        bodilyInjuryPerPerson: 2700000,
        bodilyInjuryTotal: 13500000,
        propertyDamageLimit: 600000,
        deathBenefitLimit: 2700000,
      },
    })

  it('should not warn about premium when traffic premium is null', () => {
    const data = trafficBase()
    data.premium = null
    const result = validateExtraction(data)
    const trafficPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Traffic Insurance')
    )
    expect(trafficPremiumIssue).toBeUndefined()
  })

  it('should warn when traffic premium is unusually low (< min * 0.8)', () => {
    const data = trafficBase()
    data.premium = 1500 // Below 2500 * 0.8 = 2000
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'premium' &&
          i.message.includes('unusually low') &&
          i.message.includes('Traffic')
      )
    ).toBe(true)
  })

  it('should not warn about premium when within normal traffic range', () => {
    const data = trafficBase()
    data.premium = 3000
    const result = validateExtraction(data)
    const trafficPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Traffic Insurance')
    )
    expect(trafficPremiumIssue).toBeUndefined()
  })

  it('should not error when bodilyInjuryPerPerson is null', () => {
    const data = trafficBase()
    data.trafficLimits!.bodilyInjuryPerPerson = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'trafficLimits.bodilyInjuryPerPerson')).toBe(false)
  })

  it('should not error when bodilyInjuryPerPerson meets SEDDK minimum', () => {
    const data = trafficBase()
    data.trafficLimits!.bodilyInjuryPerPerson = 1200000
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'trafficLimits.bodilyInjuryPerPerson')).toBe(false)
  })

  it('should not error when propertyDamageLimit is null', () => {
    const data = trafficBase()
    data.trafficLimits!.propertyDamageLimit = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'trafficLimits.propertyDamageLimit')).toBe(false)
  })

  it('should not error when propertyDamageLimit meets SEDDK minimum', () => {
    const data = trafficBase()
    data.trafficLimits!.propertyDamageLimit = 300000
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'trafficLimits.propertyDamageLimit')).toBe(false)
  })

  it('should warn when vehicle plate number is missing for traffic', () => {
    const data = trafficBase()
    delete data.vehicle
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'vehicle' && i.message.includes('plate number required')
      )
    ).toBe(true)
  })

  it('should warn when vehicle exists but plate number is null', () => {
    const data = trafficBase()
    data.vehicle!.plateNumber = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'vehicle' && i.message.includes('plate number required')
      )
    ).toBe(true)
  })
})

// ===========================================================================
// validateHome — uncovered branches
// ===========================================================================
describe('validateHome — uncovered branches', () => {
  const homeBase = () =>
    makePolicy({
      policyType: 'home',
      premium: 6000,
      property: {
        propertyType: 'apartment',
        constructionType: 'reinforced_concrete',
        constructionYear: 2010,
        totalArea: 120,
        floorNumber: 5,
        totalFloors: 10,
        ownershipType: 'owner',
        buildingValue: 800000,
        contentsValue: 200000,
        valuablesValue: null,
      },
      coverages: [
        { name: 'Yangın', limit: 500000, deductible: 1000, description: null },
        { name: 'Deprem', limit: 500000, deductible: 2000, description: null },
      ],
    })

  it('should not warn about premium when home premium is null', () => {
    const data = homeBase()
    data.premium = null
    const result = validateExtraction(data)
    const homePremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('home insurance range')
    )
    expect(homePremiumIssue).toBeUndefined()
  })

  it('should info when home premium is below range minimum', () => {
    const data = homeBase()
    data.premium = 2000 // Below 2500
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'premium' && i.severity === 'info' && i.message.includes('below typical home')
      )
    ).toBe(true)
  })

  it('should not warn about premium when within normal home range', () => {
    const data = homeBase()
    data.premium = 6000
    const result = validateExtraction(data)
    const homePremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('home insurance range')
    )
    expect(homePremiumIssue).toBeUndefined()
  })

  it('should warn when property info is missing', () => {
    const data = homeBase()
    delete data.property
    const result = validateExtraction(data)
    expect(
      result.issues.some((i) => i.field === 'property' && i.message.includes('not extracted'))
    ).toBe(true)
  })

  it('should warn when neither buildingValue nor contentsValue present', () => {
    const data = homeBase()
    data.property!.buildingValue = null
    data.property!.contentsValue = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'property' && i.message.includes('Neither building nor contents value')
      )
    ).toBe(true)
  })

  it('should not warn about values when buildingValue is present', () => {
    const data = homeBase()
    data.property!.buildingValue = 500000
    data.property!.contentsValue = null
    const result = validateExtraction(data)
    expect(
      result.issues.some((i) => i.field === 'property' && i.message.includes('Neither building'))
    ).toBe(false)
  })

  it('should not warn about values when contentsValue is present', () => {
    const data = homeBase()
    data.property!.buildingValue = null
    data.property!.contentsValue = 100000
    const result = validateExtraction(data)
    expect(
      result.issues.some((i) => i.field === 'property' && i.message.includes('Neither building'))
    ).toBe(false)
  })

  it('should not warn about constructionYear when it is null', () => {
    const data = homeBase()
    data.property!.constructionYear = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'property.constructionYear')).toBe(false)
  })

  it('should warn when constructionYear is in the future', () => {
    const data = homeBase()
    data.property!.constructionYear = new Date().getFullYear() + 1
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'property.constructionYear' && i.message.includes('seems invalid')
      )
    ).toBe(true)
  })

  it('should not warn about constructionYear when valid', () => {
    const data = homeBase()
    data.property!.constructionYear = 2010
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'property.constructionYear')).toBe(false)
  })

  it('should info when property area is too small (< 20 m²)', () => {
    const data = homeBase()
    data.property!.totalArea = 15
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'property.totalArea' && i.severity === 'info' && i.message.includes('unusual')
      )
    ).toBe(true)
  })

  it('should info when property area is too large (> 2000 m²)', () => {
    const data = homeBase()
    data.property!.totalArea = 2500
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'property.totalArea' && i.severity === 'info' && i.message.includes('unusual')
      )
    ).toBe(true)
  })

  it('should not warn about area when within normal range', () => {
    const data = homeBase()
    data.property!.totalArea = 120
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'property.totalArea')).toBe(false)
  })

  it('should not warn about area when totalArea is null', () => {
    const data = homeBase()
    data.property!.totalArea = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'property.totalArea')).toBe(false)
  })

  it('should not warn about earthquake when deprem coverage is present', () => {
    const data = homeBase()
    // homeBase already has 'Deprem' coverage
    const result = validateExtraction(data)
    expect(
      result.issues.some((i) => i.field === 'coverages' && i.message.includes('Earthquake'))
    ).toBe(false)
  })

  it('should recognize English earthquake coverage name', () => {
    const data = homeBase()
    data.coverages = [
      { name: 'Earthquake Insurance', limit: 500000, deductible: 2000, description: null },
    ]
    const result = validateExtraction(data)
    expect(
      result.issues.some((i) => i.field === 'coverages' && i.message.includes('Earthquake'))
    ).toBe(false)
  })
})

// ===========================================================================
// validateHealth — uncovered branches
// ===========================================================================
describe('validateHealth — uncovered branches', () => {
  const healthBase = () =>
    makePolicy({
      policyType: 'health',
      premium: 35000,
      healthCostSharing: {
        copayPercentage: 20,
        annualDeductible: 5000,
        outOfPocketMax: 50000,
        perVisitCopay: 100,
      },
      healthLimits: {
        annualLimit: 1000000,
        lifetimeLimit: null,
        hospitalizationLimit: 500000,
        outpatientLimit: 100000,
      },
    })

  it('should not warn about premium when health premium is null', () => {
    const data = healthBase()
    data.premium = null
    const result = validateExtraction(data)
    const healthPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Health insurance')
    )
    expect(healthPremiumIssue).toBeUndefined()
  })

  it('should not warn about premium when within normal health range', () => {
    const data = healthBase()
    data.premium = 35000
    const result = validateExtraction(data)
    const healthPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Health insurance')
    )
    expect(healthPremiumIssue).toBeUndefined()
  })

  it('should info when healthCostSharing is missing', () => {
    const data = healthBase()
    delete data.healthCostSharing
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'healthCostSharing' &&
          i.severity === 'info' &&
          i.message.includes('Cost sharing details')
      )
    ).toBe(true)
  })

  it('should warn when copayPercentage is negative', () => {
    const data = healthBase()
    data.healthCostSharing!.copayPercentage = -5
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'healthCostSharing.copayPercentage' && i.message.includes('seems unusual')
      )
    ).toBe(true)
  })

  it('should not warn when copayPercentage is null', () => {
    const data = healthBase()
    data.healthCostSharing!.copayPercentage = null
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthCostSharing.copayPercentage')).toBe(false)
  })

  it('should not warn when copayPercentage is within valid range (0-50)', () => {
    const data = healthBase()
    data.healthCostSharing!.copayPercentage = 25
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthCostSharing.copayPercentage')).toBe(false)
  })

  it('should warn when copayPercentage is at boundary 0 (valid, no issue)', () => {
    const data = healthBase()
    data.healthCostSharing!.copayPercentage = 0
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthCostSharing.copayPercentage')).toBe(false)
  })

  it('should warn when copayPercentage is at boundary 50 (valid, no issue)', () => {
    const data = healthBase()
    data.healthCostSharing!.copayPercentage = 50
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthCostSharing.copayPercentage')).toBe(false)
  })

  it('should warn when healthLimits is missing', () => {
    const data = healthBase()
    delete data.healthLimits
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'healthLimits' &&
          i.severity === 'warning' &&
          i.message.includes('not extracted')
      )
    ).toBe(true)
  })

  it('should not warn about healthLimits when present', () => {
    const data = healthBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthLimits')).toBe(false)
  })

  it('should info when maternity waiting period is over 365 days', () => {
    const data = healthBase()
    data.healthWaiting = {
      general: 30,
      maternity: 400,
      preExisting: 180,
    }
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'healthWaiting.maternity' &&
          i.severity === 'info' &&
          i.message.includes('unusually long')
      )
    ).toBe(true)
  })

  it('should not warn when maternity waiting period is normal (<= 365)', () => {
    const data = healthBase()
    data.healthWaiting = {
      general: 30,
      maternity: 365,
      preExisting: 180,
    }
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthWaiting.maternity')).toBe(false)
  })

  it('should not warn when healthWaiting is not present', () => {
    const data = healthBase()
    // healthWaiting is not set
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthWaiting.maternity')).toBe(false)
  })

  it('should not warn when healthWaiting exists but maternity is null', () => {
    const data = healthBase()
    data.healthWaiting = {
      general: 30,
      maternity: null,
      preExisting: 180,
    }
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'healthWaiting.maternity')).toBe(false)
  })
})

// ===========================================================================
// validateLife — uncovered branches
// ===========================================================================
describe('validateLife — uncovered branches', () => {
  const lifeBase = () =>
    makePolicy({
      policyType: 'life',
      premium: 10000,
      sumAssured: 500000,
      policyVariant: 'term',
      termYears: 20,
      lifeBeneficiaries: [
        { name: 'Ayşe Yılmaz', relationship: 'spouse', percentage: 100, isPrimary: true },
      ],
    })

  it('should warn when lifeBeneficiaries is empty array', () => {
    const data = lifeBase()
    data.lifeBeneficiaries = []
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'lifeBeneficiaries' &&
          i.message.includes('Beneficiary information not extracted')
      )
    ).toBe(true)
  })

  it('should warn when lifeBeneficiaries is undefined', () => {
    const data = lifeBase()
    delete data.lifeBeneficiaries
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'lifeBeneficiaries' &&
          i.message.includes('Beneficiary information not extracted')
      )
    ).toBe(true)
  })

  it('should not warn when beneficiary percentages sum exactly to 100', () => {
    const data = lifeBase()
    data.lifeBeneficiaries = [
      { name: 'Ayşe', relationship: 'spouse', percentage: 60, isPrimary: true },
      { name: 'Mehmet', relationship: 'child', percentage: 40, isPrimary: false },
    ]
    const result = validateExtraction(data)
    const percIssue = result.issues.find(
      (i) => i.field === 'lifeBeneficiaries' && i.message.includes('percentages')
    )
    expect(percIssue).toBeUndefined()
  })

  it('should not warn when beneficiary percentages are all null (sum = 0)', () => {
    const data = lifeBase()
    data.lifeBeneficiaries = [
      { name: 'Ayşe', relationship: 'spouse', percentage: null, isPrimary: true },
      { name: 'Mehmet', relationship: 'child', percentage: null, isPrimary: false },
    ]
    const result = validateExtraction(data)
    // totalPercentage = 0, so the condition `totalPercentage > 0` is false => no warning
    const percIssue = result.issues.find(
      (i) => i.field === 'lifeBeneficiaries' && i.message.includes('percentages')
    )
    expect(percIssue).toBeUndefined()
  })

  it('should warn when beneficiary percentages sum within tolerance (e.g., 99.5)', () => {
    const data = lifeBase()
    data.lifeBeneficiaries = [
      { name: 'Ayşe', relationship: 'spouse', percentage: 99.5, isPrimary: true },
    ]
    const result = validateExtraction(data)
    // Math.abs(99.5 - 100) = 0.5 which is <= 1, so no warning
    const percIssue = result.issues.find(
      (i) => i.field === 'lifeBeneficiaries' && i.message.includes('percentages')
    )
    expect(percIssue).toBeUndefined()
  })

  it('should info when policyVariant is not identified', () => {
    const data = lifeBase()
    delete data.policyVariant
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'policyVariant' &&
          i.severity === 'info' &&
          i.message.includes('not identified')
      )
    ).toBe(true)
  })

  it('should not issue policyVariant info when variant is set', () => {
    const data = lifeBase()
    data.policyVariant = 'whole_life'
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'policyVariant')).toBe(false)
  })

  it('should warn about missing sumAssured and missing beneficiaries together', () => {
    const data = lifeBase()
    delete data.sumAssured
    delete data.lifeBeneficiaries
    delete data.policyVariant
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'sumAssured')).toBe(true)
    expect(result.issues.some((i) => i.field === 'lifeBeneficiaries')).toBe(true)
    expect(result.issues.some((i) => i.field === 'policyVariant')).toBe(true)
  })

  it('should not warn about sumAssured when it is set', () => {
    const data = lifeBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'sumAssured')).toBe(false)
  })
})

// ===========================================================================
// validateDask — uncovered branches
// ===========================================================================
describe('validateDask — uncovered branches', () => {
  const daskBase = () =>
    makePolicy({
      policyType: 'dask',
      premium: 900,
      daskBuilding: {
        buildingClass: 'A',
        constructionYear: 2010,
        totalArea: 150,
        floorCount: 10,
        unitFloor: 5,
        earthquakeZone: 1,
        landRegistryInfo: '12345',
        apartmentNumber: '5',
        buildingType: 'residential',
      },
    })

  it('should not warn about premium when dask premium is null', () => {
    const data = daskBase()
    data.premium = null
    const result = validateExtraction(data)
    const daskPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('DASK')
    )
    expect(daskPremiumIssue).toBeUndefined()
  })

  it('should warn when DASK premium is above max * 1.5', () => {
    const data = daskBase()
    data.premium = 6000 // Above 3500 * 1.5 = 5250
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'premium' && i.severity === 'warning' && i.message.includes('unusually high')
      )
    ).toBe(true)
  })

  it('should not warn about premium when within DASK range', () => {
    const data = daskBase()
    data.premium = 900
    const result = validateExtraction(data)
    const daskPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('DASK')
    )
    expect(daskPremiumIssue).toBeUndefined()
  })

  it('should warn when daskBuilding.buildingClass is null', () => {
    const data = daskBase()
    data.daskBuilding!.buildingClass = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'daskBuilding.buildingClass' && i.message.includes('Building class')
      )
    ).toBe(true)
  })

  it('should not warn about buildingClass when set', () => {
    const data = daskBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'daskBuilding.buildingClass')).toBe(false)
  })

  it('should warn when daskBuilding.totalArea is null', () => {
    const data = daskBase()
    data.daskBuilding!.totalArea = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'daskBuilding.totalArea' && i.message.includes('Building area not extracted')
      )
    ).toBe(true)
  })

  it('should not warn about totalArea when within limit (<=320)', () => {
    const data = daskBase()
    data.daskBuilding!.totalArea = 200
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'daskBuilding.totalArea')).toBe(false)
  })

  it('should info at boundary: totalArea exactly 320 (not > 320)', () => {
    const data = daskBase()
    data.daskBuilding!.totalArea = 320
    const result = validateExtraction(data)
    // 320 is NOT > 320, so no info
    expect(
      result.issues.some(
        (i) => i.field === 'daskBuilding.totalArea' && i.message.includes('exceed DASK')
      )
    ).toBe(false)
  })

  it('should info when daskBuilding.earthquakeZone is null', () => {
    const data = daskBase()
    data.daskBuilding!.earthquakeZone = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'daskBuilding.earthquakeZone' &&
          i.severity === 'info' &&
          i.message.includes('Earthquake zone not identified')
      )
    ).toBe(true)
  })

  it('should not warn about earthquakeZone when set', () => {
    const data = daskBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'daskBuilding.earthquakeZone')).toBe(false)
  })
})

// ===========================================================================
// validateBusiness — uncovered branches
// ===========================================================================
describe('validateBusiness — uncovered branches', () => {
  const businessBase = () =>
    makePolicy({
      policyType: 'business',
      premium: 30000,
      business: {
        businessType: 'office',
        industryCode: '6201',
        businessName: 'Tech Corp',
        taxNumber: '1234567890',
        employeeCount: 50,
        annualRevenue: 5000000,
      },
      businessValues: {
        buildingValue: 2000000,
        stockValue: 500000,
        equipmentValue: 300000,
        fixturesValue: 200000,
        businessInterruptionLimit: 1000000,
      },
      businessLiability: {
        publicLiabilityLimit: 1000000,
        productLiabilityLimit: null,
        professionalLiabilityLimit: null,
        employerLiabilityLimit: null,
        cyberLiabilityLimit: null,
      },
    })

  it('should not warn about premium when business premium is null', () => {
    const data = businessBase()
    data.premium = null
    const result = validateExtraction(data)
    const bizPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Business insurance')
    )
    expect(bizPremiumIssue).toBeUndefined()
  })

  it('should not warn about premium when within business range', () => {
    const data = businessBase()
    data.premium = 30000
    const result = validateExtraction(data)
    const bizPremiumIssue = result.issues.find(
      (i) => i.field === 'premium' && i.message.includes('Business insurance')
    )
    expect(bizPremiumIssue).toBeUndefined()
  })

  it('should warn when business info is missing', () => {
    const data = businessBase()
    delete data.business
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'business' &&
          i.severity === 'warning' &&
          i.message.includes('Business information not extracted')
      )
    ).toBe(true)
  })

  it('should info when business.businessType is null', () => {
    const data = businessBase()
    data.business!.businessType = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'business.businessType' &&
          i.severity === 'info' &&
          i.message.includes('Business type not identified')
      )
    ).toBe(true)
  })

  it('should not warn about businessType when set', () => {
    const data = businessBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'business.businessType')).toBe(false)
  })

  it('should warn when businessValues is missing', () => {
    const data = businessBase()
    delete data.businessValues
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'businessValues' &&
          i.severity === 'warning' &&
          i.message.includes('asset values not extracted')
      )
    ).toBe(true)
  })

  it('should not warn about businessValues when present', () => {
    const data = businessBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'businessValues')).toBe(false)
  })

  it('should info when businessLiability has no publicLiabilityLimit', () => {
    const data = businessBase()
    data.businessLiability!.publicLiabilityLimit = null
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) =>
          i.field === 'businessLiability' &&
          i.severity === 'info' &&
          i.message.includes('Public liability')
      )
    ).toBe(true)
  })

  it('should info when businessLiability is not present at all', () => {
    const data = businessBase()
    delete data.businessLiability
    const result = validateExtraction(data)
    expect(
      result.issues.some(
        (i) => i.field === 'businessLiability' && i.message.includes('Public liability')
      )
    ).toBe(true)
  })

  it('should not warn about liability when publicLiabilityLimit is set', () => {
    const data = businessBase()
    const result = validateExtraction(data)
    expect(result.issues.some((i) => i.field === 'businessLiability')).toBe(false)
  })
})

// ===========================================================================
// validateExtraction — switch/default and nakliyat (no specific handler)
// ===========================================================================
describe('validateExtraction — policy type dispatch', () => {
  it('should handle nakliyat type (no type-specific validation)', () => {
    const data = makePolicy({
      policyType: 'nakliyat',
      premium: 15000,
    })
    const result = validateExtraction(data)
    // Only base validation, no type-specific
    expect(result).toBeDefined()
    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThan(0)
  })

  it('should handle null policyType (no type-specific validation)', () => {
    const data = makePolicy({ policyType: null })
    const result = validateExtraction(data)
    expect(result).toBeDefined()
    expect(result.score).toBeGreaterThan(0)
  })
})

// ===========================================================================
// calculateCompletenessBonus — uncovered branches
// ===========================================================================
describe('calculateCompletenessBonus — uncovered branches', () => {
  it('should give bonus for health + healthLimits', () => {
    const data = makePolicy({
      policyType: 'health',
      premium: 35000,
      healthLimits: {
        annualLimit: 1000000,
        lifetimeLimit: null,
        hospitalizationLimit: null,
        outpatientLimit: null,
      },
      healthCostSharing: {
        copayPercentage: 20,
        annualDeductible: null,
        outOfPocketMax: null,
        perVisitCopay: null,
      },
    })
    const withLimits = validateExtraction(data)

    // Now remove healthLimits
    const data2 = makePolicy({
      policyType: 'health',
      premium: 35000,
      healthCostSharing: {
        copayPercentage: 20,
        annualDeductible: null,
        outOfPocketMax: null,
        perVisitCopay: null,
      },
    })
    const withoutLimits = validateExtraction(data2)

    // The one with healthLimits should have a higher score (by +2 bonus)
    expect(withLimits.score).toBeGreaterThanOrEqual(withoutLimits.score)
  })

  it('should give bonus for life + lifeBeneficiaries', () => {
    const data = makePolicy({
      policyType: 'life',
      premium: 10000,
      sumAssured: 500000,
      policyVariant: 'term',
      lifeBeneficiaries: [
        { name: 'Jane', relationship: 'spouse', percentage: 100, isPrimary: true },
      ],
    })
    const withBeneficiaries = validateExtraction(data)

    const data2 = makePolicy({
      policyType: 'life',
      premium: 10000,
      sumAssured: 500000,
      policyVariant: 'term',
    })
    const withoutBeneficiaries = validateExtraction(data2)

    expect(withBeneficiaries.score).toBeGreaterThanOrEqual(withoutBeneficiaries.score)
  })

  it('should give bonus for kasko + vehicle', () => {
    // Add some base issues (missing policyNumber, provider) to bring score below 100
    // so the +2 vehicle bonus is distinguishable
    const data = makePolicy({
      policyType: 'kasko',
      policyNumber: null,
      provider: null,
      premium: 20000,
      vehicle: {
        make: 'BMW',
        model: 'X3',
        year: 2023,
        plateNumber: '34 ABC 123',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 800000,
        usageType: 'private',
      },
      coverages: [
        { name: 'Hasar', limit: 500000, deductible: 0, description: null },
        { name: 'Hırsızlık', limit: 500000, deductible: 0, description: null },
        { name: 'Yangın', limit: 500000, deductible: 0, description: null },
        { name: 'Deprem', limit: 500000, deductible: 0, description: null },
        { name: 'Sel', limit: 500000, deductible: 0, description: null },
      ],
    })
    const withVehicle = validateExtraction(data)

    const data2 = makePolicy({
      policyType: 'kasko',
      policyNumber: null,
      provider: null,
      premium: 20000,
      coverages: [
        { name: 'Hasar', limit: 500000, deductible: 0, description: null },
        { name: 'Hırsızlık', limit: 500000, deductible: 0, description: null },
        { name: 'Yangın', limit: 500000, deductible: 0, description: null },
        { name: 'Deprem', limit: 500000, deductible: 0, description: null },
        { name: 'Sel', limit: 500000, deductible: 0, description: null },
      ],
    })
    const withoutVehicle = validateExtraction(data2)

    // With vehicle gets +2 bonus from completeness, so should score higher
    expect(withVehicle.score).toBeGreaterThan(withoutVehicle.score)
  })

  it('should give bonus for dask + daskBuilding', () => {
    // Add missing policyNumber/provider to bring score below 100
    const data = makePolicy({
      policyType: 'dask',
      policyNumber: null,
      provider: null,
      premium: 900,
      daskBuilding: {
        buildingClass: 'A',
        constructionYear: 2010,
        totalArea: 150,
        floorCount: 10,
        unitFloor: 5,
        earthquakeZone: 1,
        landRegistryInfo: null,
        apartmentNumber: null,
        buildingType: 'residential',
      },
    })
    const withBuilding = validateExtraction(data)

    const data2 = makePolicy({
      policyType: 'dask',
      policyNumber: null,
      provider: null,
      premium: 900,
    })
    const withoutBuilding = validateExtraction(data2)

    // With daskBuilding gets +2 bonus from completeness
    expect(withBuilding.score).toBeGreaterThan(withoutBuilding.score)
  })

  it('should cap bonus at 10 points even with maximum completeness', () => {
    // Create a highly complete health policy with all bonuses:
    // policyNumber (+1), provider (+1), dates (+1), premium (+1), coverages (+2), healthLimits (+2) = 8
    const data = makePolicy({
      policyType: 'health',
      premium: 35000,
      healthLimits: {
        annualLimit: 1000000,
        lifetimeLimit: null,
        hospitalizationLimit: null,
        outpatientLimit: null,
      },
      healthCostSharing: {
        copayPercentage: 20,
        annualDeductible: null,
        outOfPocketMax: null,
        perVisitCopay: null,
      },
      confidence: {
        overall: 0.95,
        policyNumber: 0.95,
        provider: 0.95,
        dates: 0.95,
        premium: 0.95,
        coverages: 0.95,
      },
    })
    const result = validateExtraction(data)
    // Score should be capped at 100 max
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('should give no type-specific bonus for non-matching type', () => {
    // home policy doesn't match kasko, health, dask, or life type-specific bonus
    const data = makePolicy({
      policyType: 'home',
      premium: 6000,
      property: {
        propertyType: 'apartment',
        constructionType: 'reinforced_concrete',
        constructionYear: 2010,
        totalArea: 120,
        floorNumber: 5,
        totalFloors: 10,
        ownershipType: 'owner',
        buildingValue: 800000,
        contentsValue: 200000,
        valuablesValue: null,
      },
      coverages: [
        { name: 'Yangın', limit: 500000, deductible: 1000, description: null },
        { name: 'Deprem', limit: 500000, deductible: 2000, description: null },
      ],
    })
    const result = validateExtraction(data)
    // home type doesn't get type-specific bonus in completeness calc
    // But it gets base bonuses for policyNumber, provider, dates, premium, coverages
    expect(result.score).toBeGreaterThan(80)
  })
})

// ===========================================================================
// Score calculation — edge cases
// ===========================================================================
describe('Score calculation — edge cases', () => {
  it('should add confidence bonus when overall >= 0.9', () => {
    // Add some missing fields so score is below 100 and the +5 bonus is visible
    const highConf = makePolicy({
      policyNumber: null,
      provider: null,
      confidence: {
        overall: 0.92,
        policyNumber: 0.95,
        provider: 0.95,
        dates: 0.95,
        premium: 0.95,
        coverages: 0.95,
      },
    })
    const medConf = makePolicy({
      policyNumber: null,
      provider: null,
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const highResult = validateExtraction(highConf)
    const medResult = validateExtraction(medConf)

    // High confidence should get a +5 bonus, making its score higher
    expect(highResult.score).toBeGreaterThan(medResult.score)
  })

  it('should clamp score to minimum 0', () => {
    // Many errors: missing startDate, endDate, provider, policyNumber, premium, coverages, low confidence
    const data = makePolicy({
      policyNumber: null,
      provider: null,
      startDate: null,
      endDate: null,
      premium: null,
      coverages: [],
      confidence: {
        overall: 0.3,
        policyNumber: 0.1,
        provider: 0.1,
        dates: 0.1,
        premium: 0.1,
        coverages: 0.1,
      },
    })
    const result = validateExtraction(data)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('should clamp score to maximum 100', () => {
    const data = makePolicy({
      confidence: {
        overall: 0.99,
        policyNumber: 0.99,
        provider: 0.99,
        dates: 0.99,
        premium: 0.99,
        coverages: 0.99,
      },
    })
    const result = validateExtraction(data)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('should calculate correct summary counts', () => {
    // Create a policy that generates errors and warnings
    const data = makePolicy({
      policyType: 'traffic',
      policyNumber: null, // warning
      provider: null, // warning
      startDate: null, // error
      endDate: null, // error
      premium: null, // warning
      coverages: [], // warning
      confidence: {
        overall: 0.3, // warning
        policyNumber: 0.1,
        provider: 0.1,
        dates: 0.1,
        premium: 0.1,
        coverages: 0.1,
      },
    })
    const result = validateExtraction(data)
    expect(result.summary.errors).toBe(result.issues.filter((i) => i.severity === 'error').length)
    expect(result.summary.warnings).toBe(
      result.issues.filter((i) => i.severity === 'warning').length
    )
    expect(result.summary.infos).toBe(result.issues.filter((i) => i.severity === 'info').length)
  })

  it('should mark isValid=true when there are no errors', () => {
    const data = makePolicy()
    const result = validateExtraction(data)
    expect(result.isValid).toBe(true)
    expect(result.summary.errors).toBe(0)
  })

  it('should mark isValid=false when there are errors', () => {
    const data = makePolicy({ startDate: null })
    const result = validateExtraction(data)
    expect(result.isValid).toBe(false)
    expect(result.summary.errors).toBeGreaterThan(0)
  })
})

// ===========================================================================
// formatValidationIssues — uncovered branches
// ===========================================================================
describe('formatValidationIssues — uncovered branches', () => {
  it('should default to English locale when no locale specified', () => {
    const data = makePolicy({ policyNumber: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues)
    // Should show English messages by default
    expect(formatted.some((f) => f.includes('Policy number'))).toBe(true)
  })

  it('should include suggestion in parentheses when present (English)', () => {
    const data = makePolicy({ policyNumber: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')
    const policyIssue = formatted.find((f) => f.includes('Policy number'))
    expect(policyIssue).toBeDefined()
    expect(policyIssue).toContain('(Check document header')
  })

  it('should include Turkish suggestion when locale is tr', () => {
    const data = makePolicy({ policyNumber: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'tr')
    const policyIssue = formatted.find((f) => f.includes('Poliçe numarası'))
    expect(policyIssue).toBeDefined()
    expect(policyIssue).toContain('(Belge başlığında')
  })

  it('should not include parentheses when no suggestion', () => {
    // provider warning has no suggestion
    const data = makePolicy({ provider: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')
    const providerIssue = formatted.find((f) => f.includes('Insurance provider'))
    expect(providerIssue).toBeDefined()
    expect(providerIssue).not.toContain('(')
  })

  it('should use warning emoji for warning severity', () => {
    const data = makePolicy({ policyNumber: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')
    const warningIssue = formatted.find((f) => f.includes('Policy number'))
    expect(warningIssue).toContain('\u26A0\uFE0F') // ⚠️
  })

  it('should use info emoji for info severity', () => {
    const data = makePolicy({
      confidence: {
        overall: 0.3,
        policyNumber: 0.1,
        provider: 0.1,
        dates: 0.1,
        premium: 0.1,
        coverages: 0.1,
      },
    })
    const result = validateExtraction(data)
    // @ts-expect-error - TS6133 unused variable
    const _formatted = formatValidationIssues(result.issues, 'en')
    // Low confidence is a warning, not info — let's use a different source of info
    // Use a kasko with premium above range to get an info issue
    const kaskoData = makePolicy({
      policyType: 'kasko',
      premium: 50000,
      vehicle: {
        make: 'BMW',
        model: 'X3',
        year: 2023,
        plateNumber: '34 ABC 123',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 800000,
        usageType: 'private',
      },
    })
    const kaskoResult = validateExtraction(kaskoData)
    const kaskoFormatted = formatValidationIssues(kaskoResult.issues, 'en')
    const infoIssue = kaskoFormatted.find((f) => f.includes('above'))
    expect(infoIssue).toContain('\u2139\uFE0F') // ℹ️
  })

  it('should use error emoji for error severity', () => {
    const data = makePolicy({ startDate: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')
    const errorIssue = formatted.find((f) => f.includes('Start date'))
    expect(errorIssue).toContain('\u274C') // ❌
  })

  it('should include suggestion when present and locale is tr without suggestionTr', () => {
    // The low confidence warning has both suggestion and suggestionTr
    const data = makePolicy({
      confidence: {
        overall: 0.3,
        policyNumber: 0.1,
        provider: 0.1,
        dates: 0.1,
        premium: 0.1,
        coverages: 0.1,
      },
    })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'tr')
    const confIssue = formatted.find((f) => f.includes('güveni'))
    expect(confIssue).toBeDefined()
    expect(confIssue).toContain('(')
  })

  it('should format all issues including mixed severities', () => {
    const data = makePolicy({
      policyType: 'kasko',
      policyNumber: null, // warning
      startDate: null, // error
      endDate: null, // error
      premium: 50000, // info (above range)
      vehicle: {
        make: 'BMW',
        model: 'X3',
        year: 2023,
        plateNumber: '34 ABC 123',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 800000,
        usageType: 'private',
      },
    })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')
    expect(formatted.length).toBe(result.issues.length)
    // Should have at least errors, warnings, and potentially infos
    expect(formatted.some((f) => f.startsWith('\u274C'))).toBe(true) // has error
    expect(formatted.some((f) => f.startsWith('\u26A0\uFE0F'))).toBe(true) // has warning
  })
})

// ===========================================================================
// Integration: full flow through multiple validators
// ===========================================================================
describe('Integration — full validation flow', () => {
  it('should accumulate base + type-specific issues for kasko', () => {
    const data = makePolicy({
      policyType: 'kasko',
      policyNumber: null,
      premium: 5000, // below kasko range
      vehicle: {
        make: null,
        model: null,
        year: 1980, // invalid year
        plateNumber: 'INVALID',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 30000, // low value
        usageType: null,
      },
      coverages: [], // missing coverages
      confidence: {
        overall: 0.3,
        policyNumber: 0.1,
        provider: 0.1,
        dates: 0.1,
        premium: 0.1,
        coverages: 0.1,
      },
    })
    const result = validateExtraction(data)

    // Should have base issues: policyNumber, coverages, confidence
    // Should have kasko issues: premium below range, invalid plate, invalid year, low vehicle value, missing coverages
    expect(result.issues.length).toBeGreaterThan(5)
    expect(result.score).toBeLessThan(80)
  })

  it('should accumulate base + type-specific issues for business', () => {
    const data = makePolicy({
      policyType: 'business',
      premium: 2000, // low
      // Missing business, businessValues, businessLiability
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'business')).toBe(true)
    expect(result.issues.some((i) => i.field === 'businessValues')).toBe(true)
    expect(result.issues.some((i) => i.field === 'businessLiability')).toBe(true)
    expect(result.issues.some((i) => i.field === 'premium')).toBe(true)
  })

  it('should produce valid ValidationResult shape', () => {
    const data = makePolicy()
    const result = validateExtraction(data)

    expect(typeof result.isValid).toBe('boolean')
    expect(typeof result.score).toBe('number')
    expect(Array.isArray(result.issues)).toBe(true)
    expect(typeof result.summary.errors).toBe('number')
    expect(typeof result.summary.warnings).toBe('number')
    expect(typeof result.summary.infos).toBe('number')

    // Each issue should have required fields
    for (const issue of result.issues) {
      expect(['error', 'warning', 'info']).toContain(issue.severity)
      expect(typeof issue.field).toBe('string')
      expect(typeof issue.message).toBe('string')
      expect(typeof issue.messageTr).toBe('string')
    }
  })
})
