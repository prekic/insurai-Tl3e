/**
 * Tests for Extraction Schema
 *
 * Validates that the schema conforms to OpenAI's strict JSON schema requirements.
 */

import { describe, it, expect } from 'vitest'
import { EXTRACTION_JSON_SCHEMA } from './extraction-schema'

describe('EXTRACTION_JSON_SCHEMA', () => {
  it('should have correct top-level structure', () => {
    expect(EXTRACTION_JSON_SCHEMA.name).toBe('policy_extraction')
    expect(EXTRACTION_JSON_SCHEMA.strict).toBe(true)
    expect(EXTRACTION_JSON_SCHEMA.schema).toBeDefined()
    expect(EXTRACTION_JSON_SCHEMA.schema.type).toBe('object')
    expect(EXTRACTION_JSON_SCHEMA.schema.additionalProperties).toBe(false)
  })

  it('should have all top-level properties in required array', () => {
    const properties = Object.keys(EXTRACTION_JSON_SCHEMA.schema.properties)
    const required = EXTRACTION_JSON_SCHEMA.schema.required

    // All properties should be in required for strict mode
    for (const prop of properties) {
      expect(required).toContain(prop)
    }
  })

  describe('coverage items schema', () => {
    const coverageSchema = EXTRACTION_JSON_SCHEMA.schema.properties.coverages.items

    it('should have all properties in required for strict mode', () => {
      const properties = Object.keys(coverageSchema.properties)
      const required = coverageSchema.required

      // OpenAI strict mode requires ALL properties to be in required
      for (const prop of properties) {
        expect(required).toContain(prop)
      }
    })

    it('should have additionalProperties set to false', () => {
      expect(coverageSchema.additionalProperties).toBe(false)
    })

    it('should have correct property types', () => {
      const props = coverageSchema.properties

      // name is required string (not nullable)
      expect(props.name.type).toBe('string')

      // limit, deductible, description are nullable
      expect(props.limit.type).toContain('null')
      expect(props.deductible.type).toContain('null')
      expect(props.description.type).toContain('null')

      // booleans are required
      expect(props.isUnlimited.type).toBe('boolean')
      expect(props.isMarketValue.type).toBe('boolean')

      // category is nullable enum using anyOf pattern
      const category = props.category as { anyOf: Array<{ type: string; enum?: string[] }> }
      expect(category.anyOf).toBeDefined()
      expect(category.anyOf).toHaveLength(2)
    })
  })

  describe('amendmentInfo schema', () => {
    const amendmentSchema = EXTRACTION_JSON_SCHEMA.schema.properties.amendmentInfo

    it('should have all properties in required', () => {
      const properties = Object.keys(amendmentSchema.properties)
      const required = amendmentSchema.required

      for (const prop of properties) {
        expect(required).toContain(prop)
      }
    })

    it('should have additionalProperties set to false', () => {
      expect(amendmentSchema.additionalProperties).toBe(false)
    })
  })

  describe('confidence schema', () => {
    const confidenceSchema = EXTRACTION_JSON_SCHEMA.schema.properties.confidence

    it('should have all properties in required', () => {
      const properties = Object.keys(confidenceSchema.properties)
      const required = confidenceSchema.required

      for (const prop of properties) {
        expect(required).toContain(prop)
      }
    })

    it('should have additionalProperties set to false', () => {
      expect(confidenceSchema.additionalProperties).toBe(false)
    })

    it('should have all confidence scores as numbers', () => {
      const props = confidenceSchema.properties

      expect(props.overall.type).toBe('number')
      expect(props.policyNumber.type).toBe('number')
      expect(props.provider.type).toBe('number')
      expect(props.dates.type).toBe('number')
      expect(props.premium.type).toBe('number')
      expect(props.coverages.type).toBe('number')
    })
  })

  describe('nullable enums with anyOf pattern', () => {
    it('should use anyOf pattern for nullable policyType enum', () => {
      const policyType = EXTRACTION_JSON_SCHEMA.schema.properties.policyType as {
        anyOf: Array<{ type: string; enum?: string[] }>
      }

      expect(policyType.anyOf).toBeDefined()
      expect(policyType.anyOf).toHaveLength(2)

      // First option: string enum
      const stringOption = policyType.anyOf.find((opt) => opt.type === 'string')
      expect(stringOption).toBeDefined()
      expect(stringOption?.enum).toContain('kasko')
      expect(stringOption?.enum).toContain('traffic')
      expect(stringOption?.enum).toContain('home')
      expect(stringOption?.enum).toContain('health')
      expect(stringOption?.enum).toContain('life')
      expect(stringOption?.enum).toContain('dask')
      expect(stringOption?.enum).toContain('business')
      expect(stringOption?.enum).toContain('nakliyat')

      // Second option: null
      const nullOption = policyType.anyOf.find((opt) => opt.type === 'null')
      expect(nullOption).toBeDefined()
    })

    it('should use anyOf pattern for nullable paymentFrequency enum', () => {
      const paymentFreq = EXTRACTION_JSON_SCHEMA.schema.properties.paymentFrequency as {
        anyOf: Array<{ type: string; enum?: string[] }>
      }

      expect(paymentFreq.anyOf).toBeDefined()
      expect(paymentFreq.anyOf).toHaveLength(2)

      // First option: string enum
      const stringOption = paymentFreq.anyOf.find((opt) => opt.type === 'string')
      expect(stringOption).toBeDefined()
      expect(stringOption?.enum).toContain('annual')
      expect(stringOption?.enum).toContain('semi-annual')
      expect(stringOption?.enum).toContain('quarterly')
      expect(stringOption?.enum).toContain('monthly')

      // Second option: null
      const nullOption = paymentFreq.anyOf.find((opt) => opt.type === 'null')
      expect(nullOption).toBeDefined()
    })

    it('should use anyOf pattern for nullable coverage category enum', () => {
      const category = EXTRACTION_JSON_SCHEMA.schema.properties.coverages.items.properties.category as {
        anyOf: Array<{ type: string; enum?: string[] }>
      }

      expect(category.anyOf).toBeDefined()
      expect(category.anyOf).toHaveLength(2)

      // First option: string enum
      const stringOption = category.anyOf.find((opt) => opt.type === 'string')
      expect(stringOption).toBeDefined()
      expect(stringOption?.enum).toContain('main')
      expect(stringOption?.enum).toContain('liability')
      expect(stringOption?.enum).toContain('supplementary')
      expect(stringOption?.enum).toContain('assistance')
      expect(stringOption?.enum).toContain('legal')
      expect(stringOption?.enum).toContain('other')

      // Second option: null
      const nullOption = category.anyOf.find((opt) => opt.type === 'null')
      expect(nullOption).toBeDefined()
    })
  })

  describe('OpenAI strict mode compliance', () => {
    /**
     * Helper to recursively check that all object schemas have
     * all their properties in the required array
     */
    function validateStrictCompliance(
      schema: Record<string, unknown>,
      path: string = 'root'
    ): string[] {
      const errors: string[] = []

      if (schema.type === 'object' && schema.properties) {
        const properties = Object.keys(schema.properties as Record<string, unknown>)
        const required = (schema.required as string[]) || []

        // Check all properties are in required
        for (const prop of properties) {
          if (!required.includes(prop)) {
            errors.push(`${path}.${prop} is not in required array`)
          }
        }

        // Check additionalProperties is false
        if (schema.additionalProperties !== false) {
          errors.push(`${path} does not have additionalProperties: false`)
        }

        // Recurse into nested object properties
        for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
          const propSchema = value as Record<string, unknown>
          if (propSchema.type === 'object') {
            errors.push(...validateStrictCompliance(propSchema, `${path}.${key}`))
          }
        }
      }

      if (schema.type === 'array' && schema.items) {
        const itemSchema = schema.items as Record<string, unknown>
        if (itemSchema.type === 'object') {
          errors.push(...validateStrictCompliance(itemSchema, `${path}[]`))
        }
      }

      return errors
    }

    it('should have all nested objects with all properties in required', () => {
      const errors = validateStrictCompliance(EXTRACTION_JSON_SCHEMA.schema)

      if (errors.length > 0) {
        console.error('Strict mode compliance errors:', errors)
      }

      expect(errors).toHaveLength(0)
    })
  })
})
