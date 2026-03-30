/**
 * WS-2 — KASKO Branch-Specific Validation Rules
 *
 * Tests the 5 KASKO-specific Warning-level rules added to validateExtractionSafety().
 * All rules are Warning-only — none block extraction.
 */
import { describe, it, expect } from 'vitest'
import { validateExtractionSafety } from './validator'
import type { ExtractedPolicyData } from './extraction-schema'

/** Baseline kasko data that passes all 5 rules. */
function makeKaskoData(overrides: Partial<ExtractedPolicyData> = {}): Partial<ExtractedPolicyData> {
  return {
    policyType: 'kasko',
    currency: 'TRY',
    premium: 8000,
    policyNumber: 'KSK-001',
    provider: 'Allianz',
    insuredName: 'Test User',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    coverages: [
      {
        name: 'Collision',
        nameTr: 'Çarpma/Çarpışma',
        limit: null,
        deductible: 500,
        isMarketValue: true,
        category: 'main',
        description: 'Orijinal parça ile onarım',
      },
      {
        name: 'Theft',
        nameTr: 'Hırsızlık',
        limit: null,
        deductible: 0,
        isMarketValue: true,
        category: 'main',
        description: null,
      },
      {
        name: 'Fire',
        nameTr: 'Yangın',
        limit: null,
        deductible: 0,
        isMarketValue: true,
        category: 'main',
        description: null,
      },
    ],
    specialConditions: [],
    exclusions: [],
    confidence: {
      overall: 0.9,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.9,
      coverages: 0.85,
    },
    ...overrides,
  }
}

function flagFields(result: ReturnType<typeof validateExtractionSafety>): string[] {
  return result.flags.filter((f) => f.level === 'Warning').map((f) => f.field || '')
}

// ============================================================================
// Rule 1: Vehicle value basis
// ============================================================================

describe('validateKasko — vehicle value basis', () => {
  it('should not warn when a coverage has isMarketValue: true', () => {
    const result = validateExtractionSafety(makeKaskoData())
    expect(flagFields(result)).not.toContain('coverages.valueBasis')
  })

  it('should not warn when a main coverage has a positive limit', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: 200000,
            deductible: 500,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 0, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: 0, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).not.toContain('coverages.valueBasis')
  })

  it('should warn when no market value and no main coverage with positive limit', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            category: 'supplementary',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.valueBasis')
  })
})

// ============================================================================
// Rule 2: Parts standard
// ============================================================================

describe('validateKasko — parts standard', () => {
  it('should not warn when specialConditions contain "orijinal"', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: null,
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
        specialConditions: ['Onarım orijinal parça ile yapılır'],
      })
    )
    expect(flagFields(result)).not.toContain('specialConditions.partsStandard')
  })

  it('should not warn when a coverage description contains "eşdeğer"', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Eşdeğer parça kullanılır',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).not.toContain('specialConditions.partsStandard')
  })

  it('should not warn when "OEM" is found in conditions', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: null,
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
        specialConditions: ['OEM parts used for repair'],
      })
    )
    expect(flagFields(result)).not.toContain('specialConditions.partsStandard')
  })

  it('should warn when no parts terms found anywhere', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Standard coverage',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('specialConditions.partsStandard')
  })
})

// ============================================================================
// Rule 3: Deductible structure
// ============================================================================

describe('validateKasko — deductible structure', () => {
  it('should not warn when at least one coverage has deductible > 0', () => {
    const result = validateExtractionSafety(makeKaskoData())
    expect(flagFields(result)).not.toContain('coverages.deductible')
  })

  it('should not warn when conditions mention "muafiyet"', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 0,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
        specialConditions: ['Muafiyet: %10'],
      })
    )
    expect(flagFields(result)).not.toContain('coverages.deductible')
  })

  it('should warn when all deductibles are 0/null and no deductible term in conditions', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 0,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          {
            name: 'Theft',
            nameTr: 'Hırsızlık',
            limit: null,
            deductible: null,
            description: null,
          },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.deductible')
  })
})

// ============================================================================
// Rule 4: Minimum expected coverages
// ============================================================================

describe('validateKasko — minimum expected coverages', () => {
  it('should not warn when collision, theft, and fire are all present', () => {
    const result = validateExtractionSafety(makeKaskoData())
    expect(flagFields(result)).not.toContain('coverages.collision')
    expect(flagFields(result)).not.toContain('coverages.theft')
    expect(flagFields(result)).not.toContain('coverages.fire')
  })

  it('should warn when collision is missing', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Theft',
            nameTr: 'Hırsızlık',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.collision')
  })

  it('should warn when theft is missing', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.theft')
  })

  it('should warn when fire is missing', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          {
            name: 'Theft',
            nameTr: 'Hırsızlık',
            limit: null,
            deductible: 0,
            description: null,
          },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.fire')
  })

  it('should detect Turkish collision name "çarpışma" via nameTr', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Main',
            nameTr: 'Çarpışma',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).not.toContain('coverages.collision')
  })
})

// ============================================================================
// Rule 5: Tam Kasko consistency
// ============================================================================

describe('validateKasko — Tam Kasko consistency', () => {
  it('should not trigger flood/earthquake checks when label is absent', () => {
    const result = validateExtractionSafety(makeKaskoData())
    expect(flagFields(result)).not.toContain('coverages.flood')
    expect(flagFields(result)).not.toContain('coverages.earthquake')
  })

  it('should warn about missing flood when "Tam Kasko" is in coverage name', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Tam Kasko',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
          { name: 'Earthquake', nameTr: 'Deprem', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.flood')
    expect(flagFields(result)).not.toContain('coverages.earthquake')
  })

  it('should warn about missing earthquake when "tam kasko" is in specialConditions', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Collision',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
          { name: 'Flood', nameTr: 'Sel', limit: null, deductible: 0, description: null },
        ],
        specialConditions: ['Bu poliçe Tam Kasko kapsamındadır'],
      })
    )
    expect(flagFields(result)).toContain('coverages.earthquake')
    expect(flagFields(result)).not.toContain('coverages.flood')
  })

  it('should detect "genişletilmiş" as Tam Kasko label', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Genişletilmiş Kasko',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.flood')
    expect(flagFields(result)).toContain('coverages.earthquake')
  })

  it('should not warn when Tam Kasko has both flood and earthquake', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Tam Kasko',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
          { name: 'Flood', nameTr: 'Sel', limit: null, deductible: 0, description: null },
          { name: 'Earthquake', nameTr: 'Deprem', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).not.toContain('coverages.flood')
    expect(flagFields(result)).not.toContain('coverages.earthquake')
  })

  it('should warn about both flood and earthquake when both are missing', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Tam Kasko',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).toContain('coverages.flood')
    expect(flagFields(result)).toContain('coverages.earthquake')
  })

  it('should detect "full kasko" with flood + earthquake present (no warn)', () => {
    const result = validateExtractionSafety(
      makeKaskoData({
        coverages: [
          {
            name: 'Full Kasko',
            limit: null,
            deductible: 500,
            isMarketValue: true,
            category: 'main',
            description: 'Orijinal',
          },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: null, deductible: 0, description: null },
          { name: 'Fire', nameTr: 'Yangın', limit: null, deductible: 0, description: null },
          {
            name: 'Flood',
            nameTr: 'Sel/Su Baskını',
            limit: null,
            deductible: 0,
            description: null,
          },
          { name: 'Earthquake', nameTr: 'Deprem', limit: null, deductible: 0, description: null },
        ],
      })
    )
    expect(flagFields(result)).not.toContain('coverages.flood')
    expect(flagFields(result)).not.toContain('coverages.earthquake')
  })
})
