/**
 * Tests for Extraction Schema
 * Tests JSON schema structure and system prompt for AI policy extraction
 */

import { describe, it, expect } from 'vitest'
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from './extraction-schema'
import { validateStrictCompliance } from './strict-mode-validator'
import type { ExtractedPolicyData, ExtractedCoverage } from './extraction-schema'

// =============================================================================
// EXTRACTION_JSON_SCHEMA Structure Tests
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA', () => {
  it('should have correct schema name', () => {
    expect(EXTRACTION_JSON_SCHEMA.name).toBe('policy_extraction')
  })

  it('should be strict mode', () => {
    expect(EXTRACTION_JSON_SCHEMA.strict).toBe(true)
  })

  it('should define object type', () => {
    expect(EXTRACTION_JSON_SCHEMA.schema.type).toBe('object')
  })

  it('should not allow additional properties', () => {
    expect(EXTRACTION_JSON_SCHEMA.schema.additionalProperties).toBe(false)
  })
})

// =============================================================================
// Required Fields Tests
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA Required Fields', () => {
  const required = EXTRACTION_JSON_SCHEMA.schema.required

  it('should require policyNumber', () => {
    expect(required).toContain('policyNumber')
  })

  it('should require provider', () => {
    expect(required).toContain('provider')
  })

  it('should require policyType', () => {
    expect(required).toContain('policyType')
  })

  it('should require insuredName', () => {
    expect(required).toContain('insuredName')
  })

  it('should require insuredAddress', () => {
    expect(required).toContain('insuredAddress')
  })

  it('should require startDate', () => {
    expect(required).toContain('startDate')
  })

  it('should require endDate', () => {
    expect(required).toContain('endDate')
  })

  it('should require premium', () => {
    expect(required).toContain('premium')
  })

  it('should require currency', () => {
    expect(required).toContain('currency')
  })

  it('should require paymentFrequency', () => {
    expect(required).toContain('paymentFrequency')
  })

  it('should require coverages', () => {
    expect(required).toContain('coverages')
  })

  it('should require specialConditions', () => {
    expect(required).toContain('specialConditions')
  })

  it('should require exclusions', () => {
    expect(required).toContain('exclusions')
  })

  it('should require confidence', () => {
    expect(required).toContain('confidence')
  })

  it('should require clauseGraph', () => {
    expect(required).toContain('clauseGraph')
  })

  it('should have exactly 19 required fields', () => {
    // 17 original + exclusionsEn + conditionalDeductibles (added in #331 to
    // satisfy OpenAI strict mode — every property in `properties` must also
    // be in `required[]`. Both are nullable types so the LLM can return null.)
    expect(required.length).toBe(19)
  })
})

// =============================================================================
// Property Type Tests
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA Property Types', () => {
  const props = EXTRACTION_JSON_SCHEMA.schema.properties

  it('should define policyNumber as string or null', () => {
    expect(props.policyNumber.type).toContain('string')
    expect(props.policyNumber.type).toContain('null')
  })

  it('should define provider as string or null', () => {
    expect(props.provider.type).toContain('string')
    expect(props.provider.type).toContain('null')
  })

  it('should define policyType with enum values', () => {
    expect(props.policyType.enum).toContain('kasko')
    expect(props.policyType.enum).toContain('traffic')
    expect(props.policyType.enum).toContain('home')
    expect(props.policyType.enum).toContain('health')
    expect(props.policyType.enum).toContain('life')
    expect(props.policyType.enum).toContain('dask')
    expect(props.policyType.enum).toContain('business')
    expect(props.policyType.enum).toContain(null)
  })

  it('should define premium as number or null', () => {
    expect(props.premium.type).toContain('number')
    expect(props.premium.type).toContain('null')
  })

  it('should define paymentFrequency with enum values', () => {
    expect(props.paymentFrequency.enum).toContain('annual')
    expect(props.paymentFrequency.enum).toContain('semi-annual')
    expect(props.paymentFrequency.enum).toContain('quarterly')
    expect(props.paymentFrequency.enum).toContain('monthly')
    expect(props.paymentFrequency.enum).toContain(null)
  })

  it('should define coverages as array', () => {
    expect(props.coverages.type).toBe('array')
  })

  it('should define specialConditions as array of strings', () => {
    expect(props.specialConditions.type).toBe('array')
    expect(props.specialConditions.items.type).toBe('string')
  })

  it('should define exclusions as array of strings', () => {
    expect(props.exclusions.type).toBe('array')
    expect(props.exclusions.items.type).toBe('string')
  })

  it('should define confidence as object', () => {
    expect(props.confidence.type).toBe('object')
  })

  it('should define clauseGraph as object', () => {
    expect(props.clauseGraph.type).toBe('object')
  })
})

// =============================================================================
// Coverage Schema Tests
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA Coverage Items', () => {
  const coverageSchema = EXTRACTION_JSON_SCHEMA.schema.properties.coverages.items

  it('should define coverage as object', () => {
    expect(coverageSchema.type).toBe('object')
  })

  it('should have name property', () => {
    expect(coverageSchema.properties.name.type).toBe('string')
  })

  it('should have limit property (number or null)', () => {
    expect(coverageSchema.properties.limit.type).toContain('number')
    expect(coverageSchema.properties.limit.type).toContain('null')
  })

  it('should have deductible property (number or null)', () => {
    expect(coverageSchema.properties.deductible.type).toContain('number')
    expect(coverageSchema.properties.deductible.type).toContain('null')
  })

  it('should have description property (string or null)', () => {
    expect(coverageSchema.properties.description.type).toContain('string')
    expect(coverageSchema.properties.description.type).toContain('null')
  })

  it('should require name field', () => {
    expect(coverageSchema.required).toContain('name')
  })

  it('should not allow additional properties', () => {
    expect(coverageSchema.additionalProperties).toBe(false)
  })
})

// =============================================================================
// Confidence Schema Tests
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA Confidence Object', () => {
  const confidenceSchema = EXTRACTION_JSON_SCHEMA.schema.properties.confidence

  it('should have overall confidence', () => {
    expect(confidenceSchema.properties.overall.type).toBe('number')
  })

  it('should have policyNumber confidence', () => {
    expect(confidenceSchema.properties.policyNumber.type).toBe('number')
  })

  it('should have provider confidence', () => {
    expect(confidenceSchema.properties.provider.type).toBe('number')
  })

  it('should have dates confidence', () => {
    expect(confidenceSchema.properties.dates.type).toBe('number')
  })

  it('should have premium confidence', () => {
    expect(confidenceSchema.properties.premium.type).toBe('number')
  })

  it('should have coverages confidence', () => {
    expect(confidenceSchema.properties.coverages.type).toBe('number')
  })

  it('should require all confidence fields', () => {
    const required = confidenceSchema.required
    expect(required).toContain('overall')
    expect(required).toContain('policyNumber')
    expect(required).toContain('provider')
    expect(required).toContain('dates')
    expect(required).toContain('premium')
    expect(required).toContain('coverages')
  })

  it('should not allow additional properties', () => {
    expect(confidenceSchema.additionalProperties).toBe(false)
  })
})

// =============================================================================
// Property Descriptions Tests
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA Descriptions', () => {
  const props = EXTRACTION_JSON_SCHEMA.schema.properties

  it('should have description for policyNumber', () => {
    expect(props.policyNumber.description).toBeDefined()
    expect(props.policyNumber.description.length).toBeGreaterThan(0)
  })

  it('should have description for provider', () => {
    expect(props.provider.description).toBeDefined()
  })

  it('should have description for policyType', () => {
    expect(props.policyType.description).toBeDefined()
  })

  it('should have description for dates', () => {
    expect(props.startDate.description).toContain('YYYY-MM-DD')
    expect(props.endDate.description).toContain('YYYY-MM-DD')
  })

  it('should have description for premium', () => {
    expect(props.premium.description).toBeDefined()
  })

  it('should have description for currency', () => {
    expect(props.currency.description).toContain('TRY')
  })

  it('should have description for coverages', () => {
    expect(props.coverages.description).toBeDefined()
  })

  it('should have description for confidence scores', () => {
    expect(props.confidence.description).toContain('Confidence')
  })
})

// =============================================================================
// EXTRACTION_SYSTEM_PROMPT Tests
// =============================================================================

describe('EXTRACTION_SYSTEM_PROMPT', () => {
  it('should be a non-empty string', () => {
    expect(typeof EXTRACTION_SYSTEM_PROMPT).toBe('string')
    expect(EXTRACTION_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  it('should mention Turkish insurance', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Turkish')
  })

  it('should include Turkish insurance terms', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Poliçe')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Sigortalı')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Prim')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Teminat')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Muafiyet')
  })

  it('should document policy types', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('kasko')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('traffic')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('home')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('health')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('life')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('dask')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('business')
  })

  it('should mention date format YYYY-MM-DD', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('YYYY-MM-DD')
  })

  it('should mention TRY currency', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('TRY')
  })

  it('should explain confidence scores', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Confidence')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('0-1')
  })

  it('should instruct to use null for missing info', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('null')
  })

  it('should mention coverages extraction', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Coverages')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Ana Teminat')
  })
})

// =============================================================================
// Type Structure Tests
// =============================================================================

describe('ExtractedPolicyData Type', () => {
  it('should be assignable with valid data', () => {
    const data: ExtractedPolicyData = {
      policyNumber: 'POL-123',
      provider: 'Allianz',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: 'Istanbul',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 5000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.9,
        policyNumber: 0.95,
        provider: 0.9,
        dates: 0.85,
        premium: 0.9,
        coverages: 0.8,
      },
    }

    expect(data.policyNumber).toBe('POL-123')
    expect(data.provider).toBe('Allianz')
    expect(data.policyType).toBe('home')
  })

  it('should accept null values for optional fields', () => {
    const data: ExtractedPolicyData = {
      policyNumber: null,
      provider: null,
      policyType: null,
      insuredName: null,
      insuredAddress: null,
      startDate: null,
      endDate: null,
      premium: null,
      currency: null,
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.5,
        policyNumber: 0,
        provider: 0,
        dates: 0,
        premium: 0,
        coverages: 0,
      },
    }

    expect(data.policyNumber).toBeNull()
    expect(data.premium).toBeNull()
  })
})

describe('ExtractedCoverage Type', () => {
  it('should be assignable with full data', () => {
    const coverage: ExtractedCoverage = {
      name: 'Fire Coverage',
      limit: 1000000,
      deductible: 5000,
      description: 'Covers fire damage',
    }

    expect(coverage.name).toBe('Fire Coverage')
    expect(coverage.limit).toBe(1000000)
  })

  it('should accept null for optional fields', () => {
    const coverage: ExtractedCoverage = {
      name: 'Basic Coverage',
      limit: null,
      deductible: null,
      description: null,
    }

    expect(coverage.name).toBe('Basic Coverage')
    expect(coverage.limit).toBeNull()
  })
})

// =============================================================================
// Schema Validity Tests
// =============================================================================

describe('Schema Validity', () => {
  it('should be a valid JSON-serializable object', () => {
    const serialized = JSON.stringify(EXTRACTION_JSON_SCHEMA)
    const parsed = JSON.parse(serialized)

    expect(parsed.name).toBe(EXTRACTION_JSON_SCHEMA.name)
    expect(parsed.schema).toBeDefined()
  })

  it('should have properties defined for all required fields', () => {
    const required = EXTRACTION_JSON_SCHEMA.schema.required
    const properties = Object.keys(EXTRACTION_JSON_SCHEMA.schema.properties)

    for (const field of required) {
      expect(properties).toContain(field)
    }
  })
})

// =============================================================================
// OpenAI Strict Mode Compliance (recursive validation)
// =============================================================================

describe('EXTRACTION_JSON_SCHEMA strict mode compliance', () => {
  it('should have all nested objects with all properties in required', () => {
    const errors = validateStrictCompliance(EXTRACTION_JSON_SCHEMA.schema)

    if (errors.length > 0) {
      console.error('Strict mode compliance errors:', errors)
    }

    expect(errors).toHaveLength(0)
  })
})
