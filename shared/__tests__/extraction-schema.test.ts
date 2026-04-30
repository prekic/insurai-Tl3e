/**
 * Tests for the shared extraction schema and strict-mode validator.
 *
 * These tests validate the canonical single source of truth at shared/.
 * They replace the old extraction-schema-parity test (deleted — no longer
 * needed since there's only one copy).
 */

import { describe, it, expect } from 'vitest'
import { EXTRACTION_JSON_SCHEMA } from '../extraction-schema'
import { validateStrictCompliance } from '../strict-mode-validator'

describe('shared/extraction-schema', () => {
  const schema = EXTRACTION_JSON_SCHEMA.schema
  const props = schema.properties

  it('has correct top-level structure', () => {
    expect(EXTRACTION_JSON_SCHEMA.name).toBe('policy_extraction')
    expect(EXTRACTION_JSON_SCHEMA.strict).toBe(true)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
  })

  it('has 34 top-level required fields', () => {
    // This count tracks EXTRACTION_JSON_SCHEMA.schema.required.length and must
    // be updated alongside every top-level property addition/removal per
    // gotcha #47 (OpenAI strict-mode required[] completeness).
    // 32→34: added isBundle + bundleProducts for P1 #4 bundle detection.
    expect(schema.required).toHaveLength(34)
  })

  it('has discounts object with required sub-fields', () => {
    expect(props.discounts).toBeDefined()
    expect(schema.required).toContain('discounts')
    const discountProps = props.discounts.properties as Record<string, unknown>
    expect(discountProps.ncdDiscount).toBeDefined()
    expect(discountProps.groupDiscount).toBeDefined()
    expect(discountProps.otherDiscountPct).toBeDefined()
    expect(discountProps.evidence).toBeDefined()
    expect(props.discounts.required).toEqual([
      'ncdDiscount',
      'groupDiscount',
      'otherDiscountPct',
      'evidence',
    ])
  })

  it('has every property in required array (strict mode)', () => {
    const propertyKeys = Object.keys(props)
    for (const key of propertyKeys) {
      expect(schema.required).toContain(key)
    }
  })

  it('passes recursive strict-mode compliance', () => {
    const errors = validateStrictCompliance(schema)
    expect(errors).toHaveLength(0)
  })

  it('has currency description that prohibits defaulting to TRY', () => {
    expect(props.currency.description).toContain('DO NOT default')
    expect(props.currency.description).not.toContain('Default to TRY')
  })

  it('has nameTr in coverage items', () => {
    const coverageProps = props.coverages.items.properties
    expect(coverageProps.nameTr).toBeDefined()
    expect(props.coverages.items.required).toContain('nameTr')
  })

  it('has all 14 coverage item properties in required', () => {
    // Must be updated alongside every addition/removal of a coverage-item
    // property per gotcha #47. v4: added `carveOuts` (13 → 14).
    const coverageItems = props.coverages.items
    const coverageKeys = Object.keys(coverageItems.properties)
    expect(coverageKeys).toHaveLength(14)
    for (const key of coverageKeys) {
      expect(coverageItems.required).toContain(key)
    }
  })
})

describe('shared/strict-mode-validator', () => {
  it('detects missing required field', () => {
    const schema = {
      type: 'object',
      properties: { foo: { type: 'string' }, bar: { type: 'string' } },
      required: ['foo'],
      additionalProperties: false,
    }
    const errors = validateStrictCompliance(schema)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('bar')
  })

  it('detects missing additionalProperties: false', () => {
    const schema = {
      type: 'object',
      properties: { foo: { type: 'string' } },
      required: ['foo'],
    }
    const errors = validateStrictCompliance(schema)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('additionalProperties')
  })

  it('returns empty array for compliant schema', () => {
    const schema = {
      type: 'object',
      properties: { foo: { type: 'string' } },
      required: ['foo'],
      additionalProperties: false,
    }
    expect(validateStrictCompliance(schema)).toHaveLength(0)
  })

  it('recurses into nested objects', () => {
    const schema = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: { a: { type: 'string' }, b: { type: 'string' } },
          required: ['a'],
          additionalProperties: false,
        },
      },
      required: ['nested'],
      additionalProperties: false,
    }
    const errors = validateStrictCompliance(schema)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('nested.b')
  })

  it('recurses into array items', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: { x: { type: 'number' } },
        required: [],
        additionalProperties: false,
      },
    }
    const errors = validateStrictCompliance(schema)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('root[].x')
  })
})
