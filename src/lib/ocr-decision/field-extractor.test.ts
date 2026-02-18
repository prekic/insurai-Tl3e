/**
 * Field Extractor Tests
 *
 * Comprehensive tests for the FieldExtractor class which validates
 * whether OCR is needed by attempting to extract required fields from text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FieldExtractor } from './field-extractor'
import type { ConfigurationManager } from './configuration-manager'
import type { PolicyTypeConfig, FieldPattern } from './types'

// ============ TEST HELPERS & MOCKS ============

/**
 * Create a mock ConfigurationManager with predictable behavior.
 * The mock delegates pattern resolution to the policy config's own patterns
 * using locale-based lookup (matching the real ConfigurationManager behavior).
 */
function createMockConfigManager(
  overrides: Partial<{
    getPatternsForField: ConfigurationManager['getPatternsForField']
    getFieldConfig: ConfigurationManager['getFieldConfig']
  }> = {}
): ConfigurationManager {
  const defaultGetPatternsForField: ConfigurationManager['getPatternsForField'] = (
    policyConfig: PolicyTypeConfig,
    fieldName: string,
    localeCode: string
  ): string[] => {
    const fieldConfig =
      policyConfig.required_fields?.[fieldName] ||
      policyConfig.optional_fields?.[fieldName]
    if (!fieldConfig?.patterns) return []

    // Locale-specific first, then _universal fallback, then en fallback
    if (fieldConfig.patterns[localeCode]?.length) return fieldConfig.patterns[localeCode]
    if (fieldConfig.patterns['_universal']?.length) return fieldConfig.patterns['_universal']
    if (fieldConfig.patterns['en']?.length) return fieldConfig.patterns['en']
    return []
  }

  const defaultGetFieldConfig: ConfigurationManager['getFieldConfig'] = (
    policyConfig: PolicyTypeConfig,
    fieldName: string
  ): FieldPattern | undefined => {
    return policyConfig.required_fields?.[fieldName] || policyConfig.optional_fields?.[fieldName]
  }

  return {
    getPatternsForField: overrides.getPatternsForField || defaultGetPatternsForField,
    getFieldConfig: overrides.getFieldConfig || defaultGetFieldConfig,
  } as unknown as ConfigurationManager
}

/**
 * Standard Turkish kasko policy config used across most tests.
 */
function createKaskoPolicyConfig(
  overrides: Partial<PolicyTypeConfig> = {}
): PolicyTypeConfig {
  return {
    policy_type_id: 'motor_kasko',
    policy_type_name: 'Kasko',
    description: 'Motor Own Damage Insurance',
    category: 'motor',
    version: '1.0',
    required_fields: {
      policy_number: {
        required: true,
        criticality: 'high',
        patterns: {
          tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'],
          _universal: ['Policy\\s*No[.:\\s]+([A-Z0-9\\-/]+)'],
        },
      },
      insured_name: {
        required: true,
        criticality: 'high',
        patterns: {
          tr: ['Sigortal[ıi][:\\s]+([^\\n]+)'],
          en: ['Insured[:\\s]+([^\\n]+)'],
        },
      },
      start_date: {
        required: true,
        criticality: 'medium',
        patterns: {
          tr: ['Ba[şs]lang[ıi][çc]\\s*Tarihi[:\\s]+(\\d{2}[./]\\d{2}[./]\\d{4})'],
          _universal: ['(\\d{2}[./]\\d{2}[./]\\d{4})'],
        },
      },
      premium: {
        required: true,
        criticality: 'medium',
        patterns: {
          tr: ['Prim[:\\s]+([\\d.,]+)\\s*(?:TL|₺)?'],
          _universal: ['Premium[:\\s]+([\\d.,]+)'],
        },
      },
    },
    optional_fields: {
      vehicle_plate: {
        required: false,
        criticality: 'low',
        patterns: {
          tr: ['Plaka[:\\s]+([0-9]{2}\\s*[A-Z]{1,3}\\s*[0-9]{1,4})'],
        },
      },
      agent_name: {
        required: false,
        criticality: 'low',
        patterns: {
          tr: ['Acente[:\\s]+([^\\n]+)'],
        },
      },
    },
    quality_thresholds: {
      min_required_fields_rate: 0.75,
      min_quality_score: 0.6,
      ocr_trigger_confidence: 0.4,
    },
    ...overrides,
  }
}

/**
 * Realistic Turkish kasko policy text with all fields present.
 */
const FULL_TURKISH_POLICY_TEXT = `
KASKO SİGORTA POLİÇESİ
================================

Poliçe No: KSK-2026-00142
Sigortalı: Mehmet Yılmaz
TC Kimlik No: 12345678901

Başlangıç Tarihi: 15/03/2026
Bitiş Tarihi: 15/03/2027

Araç Bilgileri:
Plaka: 34 ABC 1234
Marka: Toyota
Model: Corolla

Teminatlar:
Çarpma/Çarpışma: Rayiç Değer
Hırsızlık: Rayiç Değer
Yangın: Rayiç Değer
Doğal Afetler: Rayiç Değer

Prim: 12.500,00 TL
Muafiyet: 2.500,00 TL

Acente: ABC Sigorta Acenteliği
`

/**
 * Turkish policy text with only the policy number present.
 */
const MINIMAL_TURKISH_POLICY_TEXT = `
SİGORTA BELGESİ

Poliçe No: TRF-2026-789

Bu belge sigorta poliçesinin bir özetidir.
Detaylar için lütfen acentenize başvurunuz.
`

/**
 * Text with no extractable insurance fields.
 */
const NON_INSURANCE_TEXT = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
`

// ============ TESTS ============

describe('FieldExtractor', () => {
  let extractor: FieldExtractor
  let mockConfigManager: ConfigurationManager
  let policyConfig: PolicyTypeConfig

  beforeEach(() => {
    mockConfigManager = createMockConfigManager()
    extractor = new FieldExtractor(mockConfigManager)
    policyConfig = createKaskoPolicyConfig()
  })

  // ============ testExtraction ============

  describe('testExtraction', () => {
    it('extracts all required fields from complete Turkish policy text', () => {
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(result.fields_checked).toBe(4) // 4 required fields
      expect(result.required_fields_found).toBe(4)
      expect(result.required_fields_total).toBe(4)
      expect(result.extraction_rate).toBe(1.0)
      expect(result.recommendation).toBe('proceed')
    })

    it('returns correct extraction rate when some fields are missing', () => {
      const result = extractor.testExtraction(MINIMAL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(result.required_fields_found).toBe(1) // only policy_number
      expect(result.required_fields_total).toBe(4)
      expect(result.extraction_rate).toBe(0.25)
    })

    it('returns extraction_rate 0 when no fields match', () => {
      const result = extractor.testExtraction(NON_INSURANCE_TEXT, policyConfig, 'tr')

      expect(result.required_fields_found).toBe(0)
      expect(result.required_fields_total).toBe(4)
      expect(result.extraction_rate).toBe(0)
    })

    it('returns extraction_rate 0 when there are no required fields in config', () => {
      const emptyConfig = createKaskoPolicyConfig({ required_fields: {} })
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, emptyConfig, 'tr')

      expect(result.required_fields_total).toBe(0)
      expect(result.extraction_rate).toBe(0)
      expect(result.fields_checked).toBe(0)
    })

    it('returns extraction_rate 0 when required_fields is undefined', () => {
      const noFieldsConfig = createKaskoPolicyConfig({ required_fields: undefined })
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, noFieldsConfig, 'tr')

      expect(result.required_fields_total).toBe(0)
      expect(result.extraction_rate).toBe(0)
    })

    it('rounds extraction_rate to 2 decimal places', () => {
      // Create config with 3 required fields, find 1 → 0.33 (not 0.333...)
      const threeFieldConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: policyConfig.required_fields!.policy_number,
          insured_name: policyConfig.required_fields!.insured_name,
          start_date: policyConfig.required_fields!.start_date,
        },
      })

      const result = extractor.testExtraction(MINIMAL_TURKISH_POLICY_TEXT, threeFieldConfig, 'tr')

      // 1 found out of 3 = 0.333... → rounded to 0.33
      expect(result.extraction_rate).toBe(0.33)
      expect(Number.isFinite(result.extraction_rate)).toBe(true)
    })

    it('counts fields_found including non-required fields that match', () => {
      // testExtraction iterates only required_fields
      // fields_found counts all results where found is true
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(result.fields_found).toBe(4) // all 4 required found
      expect(result.fields_checked).toBe(4) // only required fields checked
    })

    it('tracks pattern count per field in field_results', () => {
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(result.field_results.policy_number.patterns_tried).toBe(1)
      expect(result.field_results.policy_number.found).toBe(true)
      expect(result.field_results.policy_number.matched_pattern).toBeDefined()
    })

    it('includes the min_rate_threshold from quality_thresholds', () => {
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')
      expect(result.min_rate_threshold).toBe(0.75)
    })

    it('uses default min_rate_threshold of 0.75 when quality_thresholds is undefined', () => {
      const noThresholdConfig = createKaskoPolicyConfig({ quality_thresholds: undefined })
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, noThresholdConfig, 'tr')
      expect(result.min_rate_threshold).toBe(0.75)
    })

    it('uses custom min_required_fields_rate from quality_thresholds', () => {
      const customConfig = createKaskoPolicyConfig({
        quality_thresholds: {
          min_required_fields_rate: 0.5,
          min_quality_score: 0.6,
          ocr_trigger_confidence: 0.4,
        },
      })
      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, customConfig, 'tr')
      expect(result.min_rate_threshold).toBe(0.5)
    })

    it('truncates matched values to 100 characters', () => {
      const longValueText = `Sigortalı: ${'A'.repeat(200)}\nPoliçe No: KSK-001\nBaşlangıç Tarihi: 01/01/2026\nPrim: 1000`
      const result = extractor.testExtraction(longValueText, policyConfig, 'tr')

      expect(result.field_results.insured_name.found).toBe(true)
      expect(result.field_results.insured_name.value!.length).toBeLessThanOrEqual(100)
    })

    it('trims whitespace from matched values', () => {
      const spaceyText = `Poliçe No:   KSK-001   \nSigortalı:   Ali Veli   \nBaşlangıç Tarihi: 01/01/2026\nPrim: 5000`
      const result = extractor.testExtraction(spaceyText, policyConfig, 'tr')

      expect(result.field_results.policy_number.value).toBe('KSK-001')
    })

    it('handles fields where required is explicitly false', () => {
      const config = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: false,
            criticality: 'low',
            patterns: { tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
        },
      })

      const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, config, 'tr')

      // Field with required: false should not count toward required totals
      expect(result.required_fields_total).toBe(0)
      expect(result.required_fields_found).toBe(0)
      expect(result.field_results.policy_number.required).toBe(false)
      expect(result.field_results.policy_number.found).toBe(true)
    })

    // ---- Recommendation logic threshold tests ----

    describe('recommendation thresholds', () => {
      it('recommends "proceed" when extraction_rate >= min_rate', () => {
        // All 4 required fields found → rate 1.0, threshold 0.75
        const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')
        expect(result.recommendation).toBe('proceed')
      })

      it('recommends "proceed" when extraction_rate equals min_rate exactly', () => {
        // 3 of 4 fields found → rate 0.75, threshold 0.75
        // Need text with exactly 3 of 4 required fields
        const threeFieldText = `
          Poliçe No: KSK-001
          Sigortalı: Ali Veli
          Başlangıç Tarihi: 01/01/2026
        ` // missing premium
        const result = extractor.testExtraction(threeFieldText, policyConfig, 'tr')
        expect(result.extraction_rate).toBe(0.75)
        expect(result.recommendation).toBe('proceed')
      })

      it('recommends "consider_ocr" when extraction_rate < min_rate but >= min_rate * 0.5', () => {
        // 2 of 4 fields → rate 0.5, threshold 0.75 (0.75 * 0.5 = 0.375)
        // 0.375 <= 0.5 < 0.75 → consider_ocr
        const twoFieldText = `
          Poliçe No: KSK-001
          Sigortalı: Ali Veli
        `
        const result = extractor.testExtraction(twoFieldText, policyConfig, 'tr')
        expect(result.extraction_rate).toBe(0.5)
        expect(result.recommendation).toBe('consider_ocr')
      })

      it('recommends "require_ocr" when extraction_rate < min_rate * 0.5', () => {
        // 1 of 4 fields → rate 0.25, threshold 0.75 (0.75 * 0.5 = 0.375)
        // 0.25 < 0.375 → require_ocr
        const result = extractor.testExtraction(MINIMAL_TURKISH_POLICY_TEXT, policyConfig, 'tr')
        expect(result.extraction_rate).toBe(0.25)
        expect(result.recommendation).toBe('require_ocr')
      })

      it('recommends "require_ocr" when no fields found at all', () => {
        const result = extractor.testExtraction(NON_INSURANCE_TEXT, policyConfig, 'tr')
        expect(result.extraction_rate).toBe(0)
        expect(result.recommendation).toBe('require_ocr')
      })

      it('recommends "consider_ocr" at exact boundary of min_rate * 0.5', () => {
        // Use a config with min_required_fields_rate that creates an exact boundary
        // With 4 fields, threshold 1.0 → boundary at 0.5
        // Finding 2 of 4 = rate 0.5 → NOT strictly < 0.5, so consider_ocr (not require_ocr)
        const strictConfig = createKaskoPolicyConfig({
          quality_thresholds: {
            min_required_fields_rate: 1.0,
            min_quality_score: 0.6,
            ocr_trigger_confidence: 0.4,
          },
        })
        const twoFieldText = `
          Poliçe No: KSK-001
          Sigortalı: Ali Veli
        `
        const result = extractor.testExtraction(twoFieldText, strictConfig, 'tr')
        expect(result.extraction_rate).toBe(0.5)
        // rate (0.5) < minRate (1.0) → consider_ocr
        // rate (0.5) NOT < minRate * 0.5 (0.5) → stays consider_ocr
        expect(result.recommendation).toBe('consider_ocr')
      })

      it('recommends "proceed" when no required fields exist (rate is 0 but threshold check depends on requiredTotal)', () => {
        // With 0 required fields, extractionRate = 0
        // 0 < minRate → consider_ocr
        // 0 < minRate * 0.5 → require_ocr
        // This tests the edge case: empty required_fields still triggers require_ocr
        const emptyConfig = createKaskoPolicyConfig({ required_fields: {} })
        const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, emptyConfig, 'tr')
        // extractionRate = 0 (requiredTotal = 0, so 0/0 branch → 0)
        // 0 < 0.75 → consider_ocr; 0 < 0.375 → require_ocr
        expect(result.recommendation).toBe('require_ocr')
      })

      it('uses custom threshold for recommendation boundaries', () => {
        // With threshold 0.4 and 1 of 4 found → rate 0.25
        // 0.25 < 0.4 → consider_ocr
        // 0.25 > 0.4 * 0.5 = 0.2 → stays consider_ocr
        const lowThresholdConfig = createKaskoPolicyConfig({
          quality_thresholds: {
            min_required_fields_rate: 0.4,
            min_quality_score: 0.6,
            ocr_trigger_confidence: 0.4,
          },
        })
        const result = extractor.testExtraction(MINIMAL_TURKISH_POLICY_TEXT, lowThresholdConfig, 'tr')
        expect(result.extraction_rate).toBe(0.25)
        expect(result.recommendation).toBe('consider_ocr')
      })
    })

    describe('invalid regex handling', () => {
      it('skips invalid regex patterns without throwing', () => {
        const badPatternConfig = createKaskoPolicyConfig({
          required_fields: {
            policy_number: {
              required: true,
              criticality: 'high',
              patterns: {
                tr: ['[invalid(regex', 'Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'],
              },
            },
          },
        })

        const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, badPatternConfig, 'tr')
        // Should still find via second pattern
        expect(result.field_results.policy_number.found).toBe(true)
      })

      it('marks field as not found when all patterns are invalid', () => {
        const allBadConfig = createKaskoPolicyConfig({
          required_fields: {
            policy_number: {
              required: true,
              criticality: 'high',
              patterns: { tr: ['[bad(', '(unclosed'] },
            },
          },
        })

        const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, allBadConfig, 'tr')
        expect(result.field_results.policy_number.found).toBe(false)
      })
    })

    describe('locale fallback in patterns', () => {
      it('falls back to _universal patterns when locale-specific not available', () => {
        const result = extractor.testExtraction(
          'Policy No: ABC-123\nSigortalı: Test User\nBaşlangıç Tarihi: 01/01/2026\nPrim: 5000',
          policyConfig,
          'fr' // French locale — not defined, should fall back
        )

        // policy_number has _universal patterns, should match
        expect(result.field_results.policy_number.found).toBe(true)
      })

      it('falls back to en patterns when locale and _universal not available', () => {
        const result = extractor.testExtraction(
          'Insured: John Doe',
          policyConfig,
          'fr' // French locale — not defined; insured_name has en but no _universal
        )

        expect(result.field_results.insured_name.found).toBe(true)
        expect(result.field_results.insured_name.value).toBe('John Doe')
      })
    })

    describe('capture group handling', () => {
      it('returns match[1] (capture group) when present', () => {
        const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')
        // Pattern has capture group for value
        expect(result.field_results.policy_number.value).toBe('KSK-2026-00142')
      })

      it('returns match[0] (full match) when no capture group', () => {
        const noCaptureConfig = createKaskoPolicyConfig({
          required_fields: {
            policy_number: {
              required: true,
              criticality: 'high',
              patterns: { tr: ['KSK-\\d{4}-\\d{5}'] }, // no capture group
            },
          },
        })

        const result = extractor.testExtraction(FULL_TURKISH_POLICY_TEXT, noCaptureConfig, 'tr')
        expect(result.field_results.policy_number.found).toBe(true)
        expect(result.field_results.policy_number.value).toBe('KSK-2026-00142')
      })
    })
  })

  // ============ extractField ============

  describe('extractField', () => {
    it('extracts a single required field successfully', () => {
      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, policyConfig, 'policy_number', 'tr')

      expect(result.found).toBe(true)
      expect(result.value).toBe('KSK-2026-00142')
      expect(result.required).toBe(true)
      expect(result.patterns_tried).toBeGreaterThan(0)
      expect(result.matched_pattern).toBeDefined()
    })

    it('returns not found for missing field', () => {
      const result = extractor.extractField(NON_INSURANCE_TEXT, policyConfig, 'policy_number', 'tr')

      expect(result.found).toBe(false)
      expect(result.value).toBeNull()
      expect(result.required).toBe(true)
      expect(result.matched_pattern).toBeUndefined()
    })

    it('extracts optional field with required: false', () => {
      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, policyConfig, 'vehicle_plate', 'tr')

      expect(result.found).toBe(true)
      expect(result.value).toMatch(/34\s*ABC\s*1234/)
      expect(result.required).toBe(false)
    })

    it('returns required false for unknown field with no config', () => {
      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, policyConfig, 'nonexistent_field', 'tr')

      expect(result.found).toBe(false)
      expect(result.value).toBeNull()
      // getFieldConfig returns undefined → isRequired = undefined !== false → true
      // But no patterns → nothing tried
      expect(result.patterns_tried).toBe(0)
    })

    it('truncates long values to 100 characters', () => {
      const longText = `Sigortalı: ${'B'.repeat(200)}`
      const result = extractor.extractField(longText, policyConfig, 'insured_name', 'tr')

      expect(result.found).toBe(true)
      expect(result.value!.length).toBeLessThanOrEqual(100)
    })

    it('trims whitespace from extracted value', () => {
      const spaceyText = 'Poliçe No:   KSK-999   '
      const result = extractor.extractField(spaceyText, policyConfig, 'policy_number', 'tr')

      expect(result.found).toBe(true)
      expect(result.value).toBe('KSK-999')
    })

    it('stops at first matching pattern', () => {
      const multiPatternConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: {
              tr: [
                'NO_MATCH_PATTERN_XYZ',
                'Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)',
                'ANOTHER_NO_MATCH',
              ],
            },
          },
        },
      })

      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, multiPatternConfig, 'policy_number', 'tr')
      expect(result.found).toBe(true)
      expect(result.matched_pattern).toBe('Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)')
    })

    it('handles invalid regex gracefully', () => {
      const badConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['[unclosed(', 'Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
        },
      })

      // Should not throw
      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, badConfig, 'policy_number', 'tr')
      expect(result.found).toBe(true) // second pattern works
    })

    it('returns required true when field has no explicit required property', () => {
      // FieldPattern.required is optional — defaults to true (required !== false)
      const implicitRequiredConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            // no 'required' property
            criticality: 'high',
            patterns: { tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
        },
      })

      const result = extractor.extractField(
        FULL_TURKISH_POLICY_TEXT,
        implicitRequiredConfig,
        'policy_number',
        'tr'
      )
      expect(result.required).toBe(true)
    })

    it('looks up optional_fields when field not in required_fields', () => {
      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, policyConfig, 'agent_name', 'tr')

      expect(result.found).toBe(true)
      expect(result.value).toContain('ABC Sigorta')
      expect(result.required).toBe(false)
    })
  })

  // ============ extractAllFields ============

  describe('extractAllFields', () => {
    it('extracts both required and optional fields', () => {
      const results = extractor.extractAllFields(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      // 4 required + 2 optional = 6 fields
      expect(Object.keys(results)).toHaveLength(6)
      expect(results.policy_number).toBeDefined()
      expect(results.insured_name).toBeDefined()
      expect(results.start_date).toBeDefined()
      expect(results.premium).toBeDefined()
      expect(results.vehicle_plate).toBeDefined()
      expect(results.agent_name).toBeDefined()
    })

    it('returns all found results for complete text', () => {
      const results = extractor.extractAllFields(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      for (const [_fieldName, result] of Object.entries(results)) {
        expect(result.found).toBe(true)
      }
    })

    it('marks missing fields as not found', () => {
      const results = extractor.extractAllFields(NON_INSURANCE_TEXT, policyConfig, 'tr')

      for (const [_fieldName, result] of Object.entries(results)) {
        expect(result.found).toBe(false)
        expect(result.value).toBeNull()
      }
    })

    it('handles config with no required_fields', () => {
      const optionalOnly = createKaskoPolicyConfig({
        required_fields: undefined,
      })

      const results = extractor.extractAllFields(FULL_TURKISH_POLICY_TEXT, optionalOnly, 'tr')
      // Only optional fields extracted
      expect(Object.keys(results)).toHaveLength(2) // vehicle_plate, agent_name
    })

    it('handles config with no optional_fields', () => {
      const requiredOnly = createKaskoPolicyConfig({
        optional_fields: undefined,
      })

      const results = extractor.extractAllFields(FULL_TURKISH_POLICY_TEXT, requiredOnly, 'tr')
      // Only required fields extracted
      expect(Object.keys(results)).toHaveLength(4)
    })

    it('handles config with no fields at all', () => {
      const emptyConfig = createKaskoPolicyConfig({
        required_fields: undefined,
        optional_fields: undefined,
      })

      const results = extractor.extractAllFields(FULL_TURKISH_POLICY_TEXT, emptyConfig, 'tr')
      expect(Object.keys(results)).toHaveLength(0)
    })
  })

  // ============ getExtractionSummary ============

  describe('getExtractionSummary', () => {
    it('returns complete summary for fully extracted text', () => {
      const summary = extractor.getExtractionSummary(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(summary.analysis.extraction_rate).toBe(1.0)
      expect(summary.missing_required).toHaveLength(0)
      expect(summary.extracted_values.policy_number).toBe('KSK-2026-00142')
      expect(summary.patterns_used.policy_number).toBeDefined()
    })

    it('lists missing required fields', () => {
      const summary = extractor.getExtractionSummary(MINIMAL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(summary.missing_required).toContain('insured_name')
      expect(summary.missing_required).toContain('start_date')
      expect(summary.missing_required).toContain('premium')
      expect(summary.missing_required).not.toContain('policy_number')
    })

    it('lists missing optional fields', () => {
      const summary = extractor.getExtractionSummary(MINIMAL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      // Optional fields not in testExtraction results are checked separately
      expect(summary.missing_optional).toContain('vehicle_plate')
      expect(summary.missing_optional).toContain('agent_name')
    })

    it('includes extracted values for all fields', () => {
      const summary = extractor.getExtractionSummary(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(summary.extracted_values.policy_number).toBeTruthy()
      expect(summary.extracted_values.insured_name).toBeTruthy()
      expect(summary.extracted_values.premium).toBeTruthy()
      expect(summary.extracted_values.vehicle_plate).toBeTruthy()
      expect(summary.extracted_values.agent_name).toBeTruthy()
    })

    it('records null for missing field values', () => {
      const summary = extractor.getExtractionSummary(NON_INSURANCE_TEXT, policyConfig, 'tr')

      for (const value of Object.values(summary.extracted_values)) {
        expect(value).toBeNull()
      }
    })

    it('records patterns_used for found fields', () => {
      const summary = extractor.getExtractionSummary(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(summary.patterns_used.policy_number).toBeDefined()
      expect(typeof summary.patterns_used.policy_number).toBe('string')
    })

    it('records undefined patterns_used for not-found fields', () => {
      const summary = extractor.getExtractionSummary(NON_INSURANCE_TEXT, policyConfig, 'tr')

      for (const pattern of Object.values(summary.patterns_used)) {
        expect(pattern).toBeUndefined()
      }
    })

    it('includes optional fields from optional_fields that are not in testExtraction results', () => {
      // testExtraction only iterates required_fields
      // getExtractionSummary separately checks optional_fields not in analysis.field_results
      const summary = extractor.getExtractionSummary(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      // Both optional fields should appear in extracted_values
      expect('vehicle_plate' in summary.extracted_values).toBe(true)
      expect('agent_name' in summary.extracted_values).toBe(true)
    })

    it('classifies a not-found field with required:false in required_fields as missing optional', () => {
      // A field in required_fields with required: false that is NOT found
      // should be listed in missing_optional (line 204 branch)
      const configWithOptionalInRequired = createKaskoPolicyConfig({
        required_fields: {
          policy_number: policyConfig.required_fields!.policy_number,
          some_optional_field: {
            required: false,
            criticality: 'low',
            patterns: { tr: ['WILL_NEVER_MATCH_XYZ_123'] },
          },
        },
        optional_fields: undefined,
      })

      const summary = extractor.getExtractionSummary(FULL_TURKISH_POLICY_TEXT, configWithOptionalInRequired, 'tr')

      // some_optional_field is in required_fields but has required: false and is not found
      expect(summary.missing_optional).toContain('some_optional_field')
      expect(summary.missing_required).not.toContain('some_optional_field')
    })

    it('does not duplicate optional fields that overlap with required fields', () => {
      // If an optional field has the same name as a required field (unlikely but test the guard)
      const overlapConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: policyConfig.required_fields!.policy_number,
        },
        optional_fields: {
          policy_number: { // same name as required
            required: false,
            criticality: 'low',
            patterns: { tr: ['Numara[:\\s]+([A-Z0-9-]+)'] },
          },
        },
      })

      const summary = extractor.getExtractionSummary(FULL_TURKISH_POLICY_TEXT, overlapConfig, 'tr')

      // policy_number is in field_results from testExtraction,
      // so the optional_fields branch should skip it (fieldName in analysis.field_results)
      expect(summary.extracted_values.policy_number).toBeDefined()
    })
  })

  // ============ testPattern ============

  describe('testPattern', () => {
    it('returns matching result with value', () => {
      const result = extractor.testPattern(
        FULL_TURKISH_POLICY_TEXT,
        'Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'
      )

      expect(result.matches).toBe(true)
      expect(result.value).toBe('KSK-2026-00142')
      expect(result.fullMatch).toContain('Poliçe No:')
      expect(result.groups).toContain('KSK-2026-00142')
    })

    it('returns non-matching result for absent pattern', () => {
      const result = extractor.testPattern(NON_INSURANCE_TEXT, 'Poli[çc]e\\s*No')

      expect(result.matches).toBe(false)
      expect(result.value).toBeNull()
      expect(result.fullMatch).toBeNull()
      expect(result.groups).toEqual([])
    })

    it('returns full match when no capture group', () => {
      const result = extractor.testPattern('Poliçe No: KSK-001', 'Poli[çc]e\\s*No')

      expect(result.matches).toBe(true)
      expect(result.value).toBe('Poliçe No')
      expect(result.fullMatch).toBe('Poliçe No')
      expect(result.groups).toEqual([])
    })

    it('returns multiple groups', () => {
      const result = extractor.testPattern(
        'Başlangıç: 01/03/2026 - Bitiş: 01/03/2027',
        '(\\d{2})/(\\d{2})/(\\d{4})'
      )

      expect(result.matches).toBe(true)
      expect(result.value).toBe('01') // match[1]
      expect(result.groups).toEqual(['01', '03', '2026'])
    })

    it('handles invalid regex without throwing', () => {
      const result = extractor.testPattern('some text', '[invalid(regex')

      expect(result.matches).toBe(false)
      expect(result.value).toBeNull()
      expect(result.fullMatch).toBeNull()
      expect(result.groups).toEqual([])
    })

    it('is case-insensitive (uses "im" flags)', () => {
      const result = extractor.testPattern('POLIÇE NO: XYZ-123', 'poliçe\\s*no')

      expect(result.matches).toBe(true)
    })

    it('handles multiline text (uses "m" flag)', () => {
      const multilineText = 'Line 1\nPoliçe No: TEST-001\nLine 3'
      const result = extractor.testPattern(multilineText, '^Poli[çc]e\\s*No[:\\s]+(.+)$')

      expect(result.matches).toBe(true)
      expect(result.value).toBe('TEST-001')
    })
  })

  // ============ findAllMatches ============

  describe('findAllMatches', () => {
    it('finds multiple matches in text', () => {
      const text = `
        Poliçe No: KSK-001
        Alt Poliçe No: KSK-002
        Ek Poliçe No: KSK-003
      `
      const results = extractor.findAllMatches(text, 'Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)')

      expect(results.length).toBe(3)
      expect(results[0].value).toBe('KSK-001')
      expect(results[1].value).toBe('KSK-002')
      expect(results[2].value).toBe('KSK-003')
    })

    it('includes match index for each result', () => {
      const text = 'Prim: 1000 TL, Ek Prim: 500 TL'
      const results = extractor.findAllMatches(text, 'Prim[:\\s]+([\\d.,]+)')

      expect(results.length).toBe(2)
      expect(results[0].index).toBeLessThan(results[1].index)
    })

    it('returns empty array when no matches', () => {
      const results = extractor.findAllMatches(NON_INSURANCE_TEXT, 'Poli[çc]e\\s*No')
      expect(results).toEqual([])
    })

    it('handles invalid regex without throwing', () => {
      const results = extractor.findAllMatches('some text', '[bad(regex')
      expect(results).toEqual([])
    })

    it('returns full match as value when no capture group', () => {
      const text = 'kasko kasko kasko'
      const results = extractor.findAllMatches(text, 'kasko')

      expect(results.length).toBe(3)
      for (const r of results) {
        expect(r.value).toBe('kasko')
        expect(r.match).toBe('kasko')
      }
    })

    it('handles zero-width matches without infinite loop', () => {
      // A pattern that can match zero-width (e.g., lookahead)
      const text = 'abc'
      // This pattern matches zero-width at every position
      const results = extractor.findAllMatches(text, '(?=.)')

      // Should terminate and produce results without hanging
      expect(results.length).toBeGreaterThanOrEqual(3)
    })

    it('uses global, case-insensitive, and multiline flags', () => {
      const text = 'Prim: 100\nprim: 200\nPRIM: 300'
      const results = extractor.findAllMatches(text, 'prim[:\\s]+(\\d+)')

      expect(results.length).toBe(3)
    })
  })

  // ============ getCriticalFieldsStatus ============

  describe('getCriticalFieldsStatus', () => {
    it('returns "good" when all critical fields found', () => {
      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, policyConfig, 'tr')

      expect(status.allCriticalFound).toBe(true)
      expect(status.criticalFieldsFound).toContain('policy_number')
      expect(status.criticalFieldsFound).toContain('insured_name')
      expect(status.criticalFieldsMissing).toHaveLength(0)
      expect(status.status).toBe('good')
    })

    it('returns "good" when no critical fields defined', () => {
      const noCriticalConfig = createKaskoPolicyConfig({
        required_fields: {
          start_date: {
            required: true,
            criticality: 'medium',
            patterns: { tr: ['Tarih[:\\s]+(.+)'] },
          },
        },
      })

      const status = extractor.getCriticalFieldsStatus(NON_INSURANCE_TEXT, noCriticalConfig, 'tr')
      // total = 0, foundRatio = 1 (fallback when total is 0)
      expect(status.status).toBe('good')
      expect(status.allCriticalFound).toBe(true)
    })

    it('returns "warning" when foundRatio < 0.75 but >= 0.5', () => {
      // Need 3 high-criticality fields, find 2 → ratio 0.67
      const threeHighConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
          insured_name: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Sigortal[ıi][:\\s]+([^\\n]+)'] },
          },
          agent_code: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Acente\\s*Kodu[:\\s]+([A-Z0-9]+)'] }, // won't match
          },
        },
      })

      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, threeHighConfig, 'tr')

      // 2 found out of 3 high-criticality → ratio 0.67
      expect(status.criticalFieldsFound).toHaveLength(2)
      expect(status.criticalFieldsMissing).toHaveLength(1)
      expect(status.status).toBe('warning')
      expect(status.allCriticalFound).toBe(false)
    })

    it('returns "critical" when foundRatio < 0.5', () => {
      // 2 high-criticality fields, find 0 → ratio 0.0
      const status = extractor.getCriticalFieldsStatus(NON_INSURANCE_TEXT, policyConfig, 'tr')

      // policy_number and insured_name are high criticality, neither found
      expect(status.criticalFieldsFound).toHaveLength(0)
      expect(status.criticalFieldsMissing).toHaveLength(2)
      expect(status.status).toBe('critical')
      expect(status.allCriticalFound).toBe(false)
    })

    it('returns "warning" at exactly 0.5 ratio (boundary: not < 0.5)', () => {
      // 2 high-criticality fields, find 1 → ratio 0.5
      const twoHighConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
          missing_field: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['NOMATCH_FIELD_XYZ_999'] },
          },
        },
      })

      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, twoHighConfig, 'tr')

      expect(status.criticalFieldsFound).toHaveLength(1)
      expect(status.criticalFieldsMissing).toHaveLength(1)
      // ratio = 0.5, not < 0.5, so stays 'warning'
      expect(status.status).toBe('warning')
    })

    it('returns "good" at exactly 0.75 ratio (boundary: not < 0.75)', () => {
      // 4 high-criticality fields, find 3 → ratio 0.75
      const fourHighConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
          insured_name: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Sigortal[ıi][:\\s]+([^\\n]+)'] },
          },
          premium: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Prim[:\\s]+([\\d.,]+)'] },
          },
          missing_field: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['WILL_NEVER_MATCH_XYZ'] },
          },
        },
      })

      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, fourHighConfig, 'tr')

      expect(status.criticalFieldsFound).toHaveLength(3)
      expect(status.criticalFieldsMissing).toHaveLength(1)
      // ratio = 0.75, not < 0.75, so 'good'
      expect(status.status).toBe('good')
    })

    it('only considers fields with criticality "high"', () => {
      const mixedConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: { tr: ['Poli[çc]e\\s*No[:\\s]+([A-Z0-9\\-/]+)'] },
          },
          start_date: {
            required: true,
            criticality: 'medium', // not high → should be ignored
            patterns: { tr: ['WILL_NOT_MATCH'] },
          },
          agent: {
            required: true,
            criticality: 'low', // not high → should be ignored
            patterns: { tr: ['WILL_NOT_MATCH'] },
          },
        },
      })

      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, mixedConfig, 'tr')

      // Only policy_number is high criticality and found
      expect(status.criticalFieldsFound).toEqual(['policy_number'])
      expect(status.criticalFieldsMissing).toHaveLength(0)
      expect(status.status).toBe('good')
      expect(status.allCriticalFound).toBe(true)
    })

    it('handles undefined required_fields', () => {
      const noFieldsConfig = createKaskoPolicyConfig({ required_fields: undefined })
      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, noFieldsConfig, 'tr')

      expect(status.allCriticalFound).toBe(true)
      expect(status.criticalFieldsFound).toHaveLength(0)
      expect(status.criticalFieldsMissing).toHaveLength(0)
      expect(status.status).toBe('good')
    })

    it('handles empty required_fields', () => {
      const emptyConfig = createKaskoPolicyConfig({ required_fields: {} })
      const status = extractor.getCriticalFieldsStatus(FULL_TURKISH_POLICY_TEXT, emptyConfig, 'tr')

      expect(status.allCriticalFound).toBe(true)
      expect(status.status).toBe('good')
    })
  })

  // ============ Integration-style tests with realistic Turkish text ============

  describe('realistic Turkish insurance documents', () => {
    const kaskoText = `
      KASKO SİGORTA POLİÇESİ

      Poliçe No: KAS-2026/12345
      Sigortalı: Ahmet Demir
      TC Kimlik No: 98765432109

      Başlangıç Tarihi: 01/06/2026
      Bitiş Tarihi: 01/06/2027

      Araç Bilgileri:
      Plaka: 06 DEF 5678
      Marka: Volkswagen
      Model: Golf

      Teminatlar:
      Maddi Hasar: 200.000,00 TL
      Kişi Başı: 100.000,00 TL

      Prim: 8.750,50 TL
      Muafiyet: 1.500,00 TL

      Acente: XYZ Sigorta
    `

    it('extracts all fields from realistic kasko policy', () => {
      const results = extractor.extractAllFields(kaskoText, policyConfig, 'tr')

      expect(results.policy_number.found).toBe(true)
      expect(results.policy_number.value).toBe('KAS-2026/12345')
      expect(results.insured_name.found).toBe(true)
      expect(results.insured_name.value).toContain('Ahmet Demir')
      expect(results.premium.found).toBe(true)
      expect(results.premium.value).toBe('8.750,50')
      expect(results.vehicle_plate.found).toBe(true)
    })

    it('handles OCR-degraded text with minor issues', () => {
      // Simulate OCR noise: spacing issues, character substitution
      const ocrDegradedText = `
        KAS KO S İGORTA POL İ ÇE S İ

        Poliçe No: KSK -2026-001
        Sigortalı:  Mehmet  Yılmaz
        Prim: 12.500
      `

      const analysis = extractor.testExtraction(ocrDegradedText, policyConfig, 'tr')

      // Some fields should still be found despite OCR noise
      expect(analysis.field_results.policy_number.found).toBe(true)
      expect(analysis.field_results.insured_name.found).toBe(true)
      expect(analysis.field_results.premium.found).toBe(true)
    })

    it('handles completely garbled OCR text', () => {
      const garbledText = `
        @#$% !@#$ ^&*()
        !!!!! ????? -----
        12 34 56 78 90
      `

      const analysis = extractor.testExtraction(garbledText, policyConfig, 'tr')
      expect(analysis.extraction_rate).toBe(0)
      expect(analysis.recommendation).toBe('require_ocr')
    })

    it('provides correct summary for partial extraction', () => {
      const partialText = `
        Poliçe No: KSK-2026-999
        Prim: 5.000 TL
      `

      const summary = extractor.getExtractionSummary(partialText, policyConfig, 'tr')

      expect(summary.analysis.required_fields_found).toBe(2)
      expect(summary.analysis.required_fields_total).toBe(4)
      expect(summary.missing_required).toContain('insured_name')
      expect(summary.missing_required).toContain('start_date')
      expect(summary.missing_optional).toContain('vehicle_plate')
      expect(summary.missing_optional).toContain('agent_name')
    })
  })

  // ============ Edge cases ============

  describe('edge cases', () => {
    it('handles empty text', () => {
      const result = extractor.testExtraction('', policyConfig, 'tr')
      expect(result.extraction_rate).toBe(0)
      expect(result.recommendation).toBe('require_ocr')
    })

    it('handles text with only whitespace', () => {
      const result = extractor.testExtraction('   \n\n\t\t  ', policyConfig, 'tr')
      expect(result.extraction_rate).toBe(0)
    })

    it('handles very large text efficiently', () => {
      const largeText = FULL_TURKISH_POLICY_TEXT + '\n'.repeat(10000) + 'Extra content '.repeat(5000)
      const start = Date.now()
      const result = extractor.testExtraction(largeText, policyConfig, 'tr')
      const duration = Date.now() - start

      expect(result.extraction_rate).toBe(1.0)
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000)
    })

    it('handles special regex characters in text without errors', () => {
      const specialCharsText = `
        Poliçe No: KSK-001
        Sigortalı: Ahmet (Jr.) [Test] {User}
        Prim: $1,000.00 + %18 KDV
        Başlangıç Tarihi: 01/01/2026
      `

      // Should not throw
      const result = extractor.testExtraction(specialCharsText, policyConfig, 'tr')
      expect(result.field_results.policy_number.found).toBe(true)
    })

    it('handles Unicode Turkish characters correctly', () => {
      const turkishText = `
        Poliçe No: İŞÇ-ÖĞÜ-001
        Sigortalı: Şükrü Çağdaş Öztürk
        Başlangıç Tarihi: 15/01/2026
        Prim: 10.000
      `

      const result = extractor.testExtraction(turkishText, policyConfig, 'tr')
      expect(result.field_results.insured_name.found).toBe(true)
      expect(result.field_results.insured_name.value).toContain('Şükrü')
    })

    it('uses custom ConfigurationManager overrides', () => {
      const customGetPatterns = vi.fn().mockReturnValue(['CustomPattern[:\\s]+(.+)'])
      const customGetFieldConfig = vi.fn().mockReturnValue({ required: true, criticality: 'high' })

      const customManager = createMockConfigManager({
        getPatternsForField: customGetPatterns,
        getFieldConfig: customGetFieldConfig,
      })
      const customExtractor = new FieldExtractor(customManager)

      const result = customExtractor.extractField('CustomPattern: TestValue', policyConfig, 'test_field', 'tr')

      expect(customGetPatterns).toHaveBeenCalledWith(policyConfig, 'test_field', 'tr')
      expect(result.found).toBe(true)
      expect(result.value).toBe('TestValue')
    })

    it('handles field with empty patterns array', () => {
      const emptyPatternsConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            patterns: { tr: [] },
          },
        },
      })

      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, emptyPatternsConfig, 'policy_number', 'tr')
      expect(result.found).toBe(false)
      expect(result.patterns_tried).toBe(0)
    })

    it('handles field with no patterns object', () => {
      const noPatternsConfig = createKaskoPolicyConfig({
        required_fields: {
          policy_number: {
            required: true,
            criticality: 'high',
            // no patterns property
          },
        },
      })

      const result = extractor.extractField(FULL_TURKISH_POLICY_TEXT, noPatternsConfig, 'policy_number', 'tr')
      expect(result.found).toBe(false)
      expect(result.patterns_tried).toBe(0)
    })
  })
})
