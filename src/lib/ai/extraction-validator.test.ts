/**
 * Tests for Post-Extraction Validation
 */
import { describe, it, expect } from 'vitest'
import {
  validateExtraction,
  formatValidationIssues,
  type ValidationResult,
} from './extraction-validator'
import type { ExtendedExtractedPolicyData } from './extraction-schema-extended'

// Helper to create base policy data
function createBasePolicy(
  overrides: Partial<ExtendedExtractedPolicyData> = {}
): ExtendedExtractedPolicyData {
  return {
    policyNumber: 'POL-2024-001',
    provider: 'Test Insurance',
    policyType: 'home',
    insuredName: 'John Doe',
    insuredAddress: 'İstanbul, Turkey',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 5000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    coverages: [
      { name: 'Fire Coverage', limit: 500000, deductible: 1000, description: null },
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

describe('Base Field Validation', () => {
  it('should pass validation for complete data', () => {
    const data = createBasePolicy()
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThan(80)
    expect(result.summary.errors).toBe(0)
  })

  it('should warn about missing policy number', () => {
    const data = createBasePolicy({ policyNumber: null })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'policyNumber')).toBe(true)
    expect(result.summary.warnings).toBeGreaterThan(0)
  })

  it('should error on missing start date', () => {
    const data = createBasePolicy({ startDate: null })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(false)
    expect(result.issues.some((i) => i.field === 'startDate' && i.severity === 'error')).toBe(
      true
    )
  })

  it('should error on missing end date', () => {
    const data = createBasePolicy({ endDate: null })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(false)
  })

  it('should error when end date is before start date', () => {
    const data = createBasePolicy({
      startDate: '2024-06-01',
      endDate: '2024-01-01',
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(false)
    expect(result.issues.some((i) => i.field === 'dates')).toBe(true)
  })

  it('should warn about unusually long policy term', () => {
    const data = createBasePolicy({
      startDate: '2024-01-01',
      endDate: '2026-06-01', // 2.5 years
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'dates' && i.severity === 'warning')).toBe(
      true
    )
  })

  it('should warn about missing premium', () => {
    const data = createBasePolicy({ premium: null })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'premium')).toBe(true)
  })

  it('should error on negative premium', () => {
    const data = createBasePolicy({ premium: -100 })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(false)
    expect(result.issues.some((i) => i.field === 'premium' && i.severity === 'error')).toBe(
      true
    )
  })

  it('should warn about missing coverages', () => {
    const data = createBasePolicy({ coverages: [] })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'coverages')).toBe(true)
  })

  it('should warn about low confidence', () => {
    const data = createBasePolicy({
      confidence: {
        overall: 0.4,
        policyNumber: 0.5,
        provider: 0.5,
        dates: 0.5,
        premium: 0.5,
        coverages: 0.5,
      },
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'confidence')).toBe(true)
  })
})

describe('Kasko Validation', () => {
  it('should validate kasko with vehicle info', () => {
    const data = createBasePolicy({
      policyType: 'kasko',
      premium: 18000,
      vehicle: {
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        plateNumber: '34 ABC 123',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 500000,
        usageType: 'private',
      },
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should warn about missing vehicle info for kasko', () => {
    const data = createBasePolicy({
      policyType: 'kasko',
      premium: 18000,
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'vehicle')).toBe(true)
  })

  it('should warn about premium below typical range', () => {
    const data = createBasePolicy({
      policyType: 'kasko',
      premium: 5000, // Below 8000 minimum
    })
    const result = validateExtraction(data)

    expect(
      result.issues.some((i) => i.field === 'premium' && i.message.includes('below'))
    ).toBe(true)
  })

  it('should warn about invalid plate number', () => {
    const data = createBasePolicy({
      policyType: 'kasko',
      premium: 18000,
      vehicle: {
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        plateNumber: 'INVALID',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 500000,
        usageType: 'private',
      },
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'vehicle.plateNumber')).toBe(true)
  })

  it('should warn about invalid vehicle year', () => {
    const data = createBasePolicy({
      policyType: 'kasko',
      premium: 18000,
      vehicle: {
        make: 'Toyota',
        model: 'Corolla',
        year: 1980, // Too old
        plateNumber: '34 ABC 123',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: 500000,
        usageType: 'private',
      },
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'vehicle.year')).toBe(true)
  })
})

describe('Traffic Insurance Validation', () => {
  it('should validate traffic with liability limits', () => {
    const data = createBasePolicy({
      policyType: 'traffic',
      premium: 4500,
      vehicle: {
        make: 'Ford',
        model: 'Focus',
        year: 2020,
        plateNumber: '34 DEF 456',
        chassisNumber: null,
        engineNumber: null,
        vehicleValue: null,
        usageType: 'private',
      },
      trafficLimits: {
        bodilyInjuryPerPerson: 1200000,
        bodilyInjuryTotal: 6000000,
        propertyDamageLimit: 300000,
        deathBenefitLimit: 1200000,
      },
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should error on bodily injury below SEDDK minimum', () => {
    const data = createBasePolicy({
      policyType: 'traffic',
      premium: 4500,
      trafficLimits: {
        bodilyInjuryPerPerson: 500000, // Below 1,200,000 minimum
        bodilyInjuryTotal: null,
        propertyDamageLimit: 300000,
        deathBenefitLimit: null,
      },
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(false)
    expect(
      result.issues.some(
        (i) => i.field === 'trafficLimits.bodilyInjuryPerPerson' && i.severity === 'error'
      )
    ).toBe(true)
  })

  it('should error on property damage below SEDDK minimum', () => {
    const data = createBasePolicy({
      policyType: 'traffic',
      premium: 4500,
      trafficLimits: {
        bodilyInjuryPerPerson: 1200000,
        bodilyInjuryTotal: null,
        propertyDamageLimit: 200000, // Below 300,000 minimum
        deathBenefitLimit: null,
      },
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(false)
  })

  it('should warn about missing traffic limits', () => {
    const data = createBasePolicy({
      policyType: 'traffic',
      premium: 4500,
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'trafficLimits')).toBe(true)
  })
})

describe('Home Insurance Validation', () => {
  it('should validate home with property info', () => {
    const data = createBasePolicy({
      policyType: 'home',
      premium: 6000,
      property: {
        propertyType: 'apartment',
        constructionType: 'reinforced_concrete',
        constructionYear: 2015,
        totalArea: 120,
        floorNumber: 3,
        totalFloors: 10,
        ownershipType: 'owner',
        buildingValue: 1000000,
        contentsValue: 200000,
        valuablesValue: null,
      },
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should warn about missing earthquake coverage', () => {
    const data = createBasePolicy({
      policyType: 'home',
      premium: 6000,
      coverages: [
        { name: 'Fire', limit: 500000, deductible: 1000, description: null },
        { name: 'Theft', limit: 100000, deductible: 500, description: null },
      ],
    })
    const result = validateExtraction(data)

    expect(
      result.issues.some((i) => i.message.includes('Earthquake') || i.message.includes('DASK'))
    ).toBe(true)
  })

  it('should warn about invalid construction year', () => {
    const data = createBasePolicy({
      policyType: 'home',
      premium: 6000,
      property: {
        propertyType: 'apartment',
        constructionType: 'reinforced_concrete',
        constructionYear: 1800, // Too old
        totalArea: 120,
        floorNumber: 3,
        totalFloors: 10,
        ownershipType: 'owner',
        buildingValue: 1000000,
        contentsValue: 200000,
        valuablesValue: null,
      },
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'property.constructionYear')).toBe(true)
  })
})

describe('Health Insurance Validation', () => {
  it('should validate health with cost sharing', () => {
    const data = createBasePolicy({
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
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should warn about low health premium', () => {
    const data = createBasePolicy({
      policyType: 'health',
      premium: 5000, // Below 12000 minimum
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'premium')).toBe(true)
  })

  it('should warn about unusual copay percentage', () => {
    const data = createBasePolicy({
      policyType: 'health',
      premium: 35000,
      healthCostSharing: {
        copayPercentage: 60, // Above 50%
        annualDeductible: null,
        outOfPocketMax: null,
        perVisitCopay: null,
      },
    })
    const result = validateExtraction(data)

    expect(
      result.issues.some((i) => i.field === 'healthCostSharing.copayPercentage')
    ).toBe(true)
  })
})

describe('Life Insurance Validation', () => {
  it('should validate life with beneficiaries', () => {
    const data = createBasePolicy({
      policyType: 'life',
      premium: 10000,
      sumAssured: 500000,
      policyVariant: 'term',
      termYears: 20,
      lifeBeneficiaries: [
        { name: 'Jane Doe', relationship: 'spouse', percentage: 100, isPrimary: true },
      ],
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should warn about missing sum assured', () => {
    const data = createBasePolicy({
      policyType: 'life',
      premium: 10000,
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'sumAssured')).toBe(true)
  })

  it('should warn about beneficiary percentages not summing to 100', () => {
    const data = createBasePolicy({
      policyType: 'life',
      premium: 10000,
      sumAssured: 500000,
      lifeBeneficiaries: [
        { name: 'Jane Doe', relationship: 'spouse', percentage: 60, isPrimary: true },
        { name: 'John Jr', relationship: 'child', percentage: 30, isPrimary: false },
        // Missing 10%
      ],
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'lifeBeneficiaries')).toBe(true)
  })
})

describe('DASK Validation', () => {
  it('should validate DASK with building info', () => {
    const data = createBasePolicy({
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
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should warn about missing building info', () => {
    const data = createBasePolicy({
      policyType: 'dask',
      premium: 900,
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'daskBuilding')).toBe(true)
  })

  it('should warn about low DASK premium', () => {
    const data = createBasePolicy({
      policyType: 'dask',
      premium: 100, // Below 250 minimum
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'premium')).toBe(true)
  })

  it('should info about large area exceeding DASK limits', () => {
    const data = createBasePolicy({
      policyType: 'dask',
      premium: 2000,
      daskBuilding: {
        buildingClass: 'A',
        constructionYear: 2010,
        totalArea: 400, // Above 320 m² limit
        floorCount: 10,
        unitFloor: 5,
        earthquakeZone: 1,
        landRegistryInfo: null,
        apartmentNumber: null,
        buildingType: 'residential',
      },
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'daskBuilding.totalArea')).toBe(true)
  })
})

describe('Business Insurance Validation', () => {
  it('should validate business with all info', () => {
    const data = createBasePolicy({
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
    })
    const result = validateExtraction(data)

    expect(result.isValid).toBe(true)
  })

  it('should warn about low business premium', () => {
    const data = createBasePolicy({
      policyType: 'business',
      premium: 2000, // Below 5000 * 0.5
    })
    const result = validateExtraction(data)

    expect(result.issues.some((i) => i.field === 'premium')).toBe(true)
  })
})

describe('Score Calculation', () => {
  it('should give high score for complete data', () => {
    const data = createBasePolicy({
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

    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('should reduce score for errors', () => {
    const data = createBasePolicy({
      startDate: null,
      endDate: null,
    })
    const result = validateExtraction(data)

    expect(result.score).toBeLessThan(80)
  })

  it('should reduce score for warnings', () => {
    const data = createBasePolicy({
      policyNumber: null,
      provider: null,
    })
    const result = validateExtraction(data)

    expect(result.score).toBeLessThan(95)
  })
})

describe('Format Validation Issues', () => {
  it('should format issues in English', () => {
    const data = createBasePolicy({ policyNumber: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')

    expect(formatted.some((f) => f.includes('Policy number'))).toBe(true)
  })

  it('should format issues in Turkish', () => {
    const data = createBasePolicy({ policyNumber: null })
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'tr')

    expect(formatted.some((f) => f.includes('Poliçe numarası'))).toBe(true)
  })

  it('should include severity emoji', () => {
    const data = createBasePolicy({ startDate: null }) // Error
    const result = validateExtraction(data)
    const formatted = formatValidationIssues(result.issues, 'en')

    expect(formatted.some((f) => f.includes('❌'))).toBe(true)
  })
})
