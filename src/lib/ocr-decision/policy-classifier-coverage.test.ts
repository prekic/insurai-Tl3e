/**
 * Policy Type Classifier - Coverage Tests
 *
 * Targets uncovered branches in policy-classifier.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PolicyTypeClassifier } from './policy-classifier'
import type { ConfigurationManager } from './configuration-manager'
import type { OCRSettings, PolicyTypeConfig } from './types'

function createMockOCRSettings(overrides: Partial<OCRSettings['policy_type_detection']> = {}): OCRSettings {
  return {
    version: '1.0.0',
    last_updated: '2026-01-01',
    density_analysis: {
      chars_per_page_threshold: 200,
      min_pages_for_average_calculation: 2,
      enable_page_level_analysis: true,
      page_variance_threshold: 0.5,
      min_chars_for_valid_page: 50,
    },
    confidence_calculation: {
      weights: { char_density: 0.25, text_quality: 0.30, page_variance: 0.15, encoding_check: 0.15, field_extraction: 0.15 },
      thresholds: { skip_ocr: 0.70, selective_ocr: 0.40, full_ocr: 0.0 },
    },
    ocr_providers: {
      primary: 'google_document_ai',
      fallback: 'google_vision',
      available: {},
    },
    language_detection: {
      enabled: true,
      min_confidence: 0.3,
      fallback_locale: 'en',
      supported_locales: ['tr', 'en'],
      multi_language_support: false,
    },
    policy_type_detection: {
      enabled: true,
      min_confidence: 0.3,
      fallback_type: '_generic',
      use_ml_classifier: false,
      ...overrides,
    },
    performance: {
      max_pages_for_quick_analysis: 5,
      timeout_seconds: 30,
      parallel_page_processing: false,
      cache_extracted_text: false,
    },
  } as OCRSettings
}

function createKaskoConfig(): PolicyTypeConfig {
  return {
    policy_type_id: 'motor_kasko',
    policy_type_name: 'Kasko',
    description: 'Motor own damage insurance',
    category: 'motor',
    version: '1.0.0',
    classification: {
      detection_terms: {
        tr: ['kasko', 'araç', 'oto', 'motorlu taşıt', 'araç sigortası'],
        en: ['motor', 'vehicle', 'auto', 'car insurance'],
      },
      confidence_threshold: 0.3,
      exclude_if_contains: {
        tr: ['zorunlu trafik', 'zmss'],
        en: ['compulsory traffic', 'mtpl'],
      },
    },
  }
}

function createTrafficConfig(): PolicyTypeConfig {
  return {
    policy_type_id: 'motor_traffic',
    policy_type_name: 'Traffic',
    description: 'Compulsory motor liability',
    category: 'motor',
    version: '1.0.0',
    classification: {
      detection_terms: {
        tr: ['zorunlu trafik', 'zmss', 'trafik sigortası', 'mali mesuliyet'],
        en: ['traffic insurance', 'compulsory', 'mtpl', 'motor liability'],
      },
      confidence_threshold: 0.3,
    },
  }
}

function createHealthConfig(): PolicyTypeConfig {
  return {
    policy_type_id: 'health_private',
    policy_type_name: 'Health',
    description: 'Private health insurance',
    category: 'health',
    version: '1.0.0',
    classification: {
      detection_terms: {
        tr: ['sağlık', 'hastane', 'tedavi', 'ameliyat'],
        en: ['health', 'hospital', 'treatment', 'surgery'],
      },
      confidence_threshold: 0.3,
    },
  }
}

function createFallbackConfig(): PolicyTypeConfig {
  return {
    policy_type_id: '_generic',
    policy_type_name: 'Generic',
    description: 'Generic fallback',
    category: 'generic',
    version: '1.0.0',
    classification: {
      detection_terms: {},
      confidence_threshold: 0.5,
      is_fallback: true,
    },
  }
}

function createNoClassificationConfig(): PolicyTypeConfig {
  return {
    policy_type_id: 'no_class',
    policy_type_name: 'NoClass',
    description: 'No classification config',
    category: 'other',
    version: '1.0.0',
  }
}

function createMockConfigManager(
  configs: Record<string, PolicyTypeConfig>,
  ocrSettings?: OCRSettings
): ConfigurationManager {
  const policyTypes = Object.keys(configs)

  return {
    getOCRSettings: () => ocrSettings || createMockOCRSettings(),
    getAvailablePolicyTypes: () => policyTypes,
    getPolicyConfig: (id: string) => configs[id] || configs['_generic'] || createFallbackConfig(),
    getAvailableLocales: vi.fn().mockReturnValue(['tr', 'en']),
    getLocale: vi.fn(),
  } as unknown as ConfigurationManager
}

describe('PolicyTypeClassifier coverage', () => {
  let classifier: PolicyTypeClassifier

  const defaultConfigs: Record<string, PolicyTypeConfig> = {
    motor_kasko: createKaskoConfig(),
    motor_traffic: createTrafficConfig(),
    health_private: createHealthConfig(),
    _generic: createFallbackConfig(),
  }

  beforeEach(() => {
    const configManager = createMockConfigManager(defaultConfigs)
    classifier = new PolicyTypeClassifier(configManager)
  })

  describe('classify', () => {
    it('classifies Turkish kasko document', () => {
      const text = 'Bu kasko sigortası araç için oto teminatı sağlar. Motorlu taşıt kasko poliçesi. Araç sigortası.'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('motor_kasko')
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.matched_terms.length).toBeGreaterThan(0)
      expect(result.config_path).toContain('motor_kasko')
    })

    it('classifies English kasko document', () => {
      const text = 'This motor vehicle auto insurance covers car insurance for damages.'
      const result = classifier.classify(text, 'en')
      expect(result.policy_type_id).toBe('motor_kasko')
      expect(result.matched_terms.length).toBeGreaterThan(0)
    })

    it('classifies traffic insurance', () => {
      const text = 'Zorunlu trafik sigortası. ZMSS trafik sigortası. Mali mesuliyet poliçesi.'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('motor_traffic')
    })

    it('excludes kasko when exclusion terms match', () => {
      const text = 'Bu zorunlu trafik sigortası kasko ve araç teminatı sağlar.'
      const result = classifier.classify(text, 'tr')
      // kasko should be excluded because 'zorunlu trafik' is in exclude_if_contains
      if (result.all_scores['motor_kasko']) {
        expect(result.all_scores['motor_kasko'].excluded).toBe(true)
      }
    })

    it('falls back to _generic when no matches above threshold', () => {
      const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('_generic')
      expect(result.confidence).toBe(0)
      expect(result.matched_terms).toEqual([])
    })

    it('skips configs with is_fallback true', () => {
      const text = 'Lorem ipsum dolor sit amet.'
      const result = classifier.classify(text, 'tr')
      // _generic has is_fallback: true, should not appear in scoring
      expect(result.all_scores['_generic']).toBeUndefined()
    })

    it('skips configs without classification', () => {
      const configs = {
        ...defaultConfigs,
        no_class: createNoClassificationConfig(),
      }
      const configManager = createMockConfigManager(configs)
      const cls = new PolicyTypeClassifier(configManager)
      const result = cls.classify('any text', 'tr')
      expect(result.all_scores['no_class']).toBeUndefined()
    })

    it('returns all_scores with excluded info', () => {
      const text = 'zorunlu trafik kasko araç oto motorlu taşıt'
      const result = classifier.classify(text, 'tr')
      expect(result.all_scores).toBeDefined()
      // motor_kasko should be excluded (zorunlu trafik present)
      if (result.all_scores['motor_kasko']) {
        expect(result.all_scores['motor_kasko'].excluded).toBe(true)
      }
    })

    it('includes category and policy_type_name in result', () => {
      const text = 'kasko araç oto motorlu taşıt araç sigortası'
      const result = classifier.classify(text, 'tr')
      expect(result.category).toBe('motor')
      expect(result.policy_type_name).toBe('Kasko')
    })

    it('includes config_path for fallback', () => {
      const text = 'random text without insurance terms'
      const result = classifier.classify(text, 'tr')
      expect(result.config_path).toContain('_generic')
    })

    it('handles empty text gracefully', () => {
      const result = classifier.classify('', 'tr')
      expect(result.policy_type_id).toBe('_generic')
      expect(result.confidence).toBe(0)
    })
  })

  describe('getTermsForLocale (via classify)', () => {
    it('falls back to English when locale-specific terms missing', () => {
      const text = 'motor vehicle auto car insurance'
      // Use French locale which has no terms defined
      const result = classifier.classify(text, 'fr')
      // Should fall back to English terms
      expect(result.policy_type_id).toBe('motor_kasko')
    })

    it('falls back to first available when no English terms', () => {
      const configs: Record<string, PolicyTypeConfig> = {
        custom: {
          policy_type_id: 'custom',
          policy_type_name: 'Custom',
          description: 'Custom type',
          category: 'custom',
          version: '1.0.0',
          classification: {
            detection_terms: {
              de: ['versicherung', 'police', 'haftpflicht'],
            },
            confidence_threshold: 0.3,
          },
        },
        _generic: createFallbackConfig(),
      }
      const configManager = createMockConfigManager(configs)
      const cls = new PolicyTypeClassifier(configManager)
      const text = 'versicherung police haftpflicht'
      // No 'ja' terms, no 'en' terms, should fall back to 'de' terms
      const result = cls.classify(text, 'ja')
      expect(result.policy_type_id).toBe('custom')
    })

    it('returns empty when no terms available at all', () => {
      const configs: Record<string, PolicyTypeConfig> = {
        empty_terms: {
          policy_type_id: 'empty_terms',
          policy_type_name: 'Empty',
          description: 'Empty terms',
          category: 'other',
          version: '1.0.0',
          classification: {
            detection_terms: {},
            confidence_threshold: 0.3,
          },
        },
        _generic: createFallbackConfig(),
      }
      const configManager = createMockConfigManager(configs)
      const cls = new PolicyTypeClassifier(configManager)
      const result = cls.classify('any text', 'tr')
      expect(result.all_scores['empty_terms']).toBeDefined()
      expect(result.all_scores['empty_terms'].score).toBe(0)
    })
  })

  describe('classifyWithDetails', () => {
    it('returns result and analysis', () => {
      const text = 'kasko araç oto motorlu taşıt araç sigortası'
      const { result, analysis } = classifier.classifyWithDetails(text, 'tr')
      expect(result.policy_type_id).toBe('motor_kasko')
      expect(analysis.all_detections.length).toBeGreaterThan(0)
      expect(analysis.text_sample).toBeTruthy()
      expect(analysis.locale_used).toBe('tr')
    })

    it('all_detections sorted by score descending', () => {
      const text = 'kasko araç sigorta poliçe sağlık hastane'
      const { analysis } = classifier.classifyWithDetails(text, 'tr')
      for (let i = 0; i < analysis.all_detections.length - 1; i++) {
        expect(analysis.all_detections[i].score).toBeGreaterThanOrEqual(
          analysis.all_detections[i + 1].score
        )
      }
    })

    it('includes exclusion info in all_detections', () => {
      const text = 'zorunlu trafik kasko araç oto motorlu taşıt'
      const { analysis } = classifier.classifyWithDetails(text, 'tr')
      const kaskoDetection = analysis.all_detections.find(d => d.policy_type === 'motor_kasko')
      if (kaskoDetection) {
        expect(kaskoDetection.excluded).toBe(true)
        expect(kaskoDetection.exclusion_terms).toBeDefined()
      }
    })

    it('skips fallback configs in all_detections', () => {
      const text = 'any text'
      const { analysis } = classifier.classifyWithDetails(text, 'tr')
      const genericDetection = analysis.all_detections.find(d => d.policy_type === '_generic')
      expect(genericDetection).toBeUndefined()
    })

    it('text_sample truncated to 500 chars', () => {
      const text = 'kasko '.repeat(200) // 1200 chars
      const { analysis } = classifier.classifyWithDetails(text, 'tr')
      expect(analysis.text_sample.length).toBeLessThanOrEqual(500)
    })
  })

  describe('matchesPolicyType', () => {
    it('returns true when policy matches with sufficient confidence', () => {
      const text = 'kasko araç oto motorlu taşıt araç sigortası'
      const result = classifier.matchesPolicyType(text, 'motor_kasko', 'tr')
      expect(result.matches).toBe(true)
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.matched_terms.length).toBeGreaterThan(0)
    })

    it('returns false when confidence below threshold', () => {
      const text = 'random text without insurance terms'
      const result = classifier.matchesPolicyType(text, 'motor_kasko', 'tr')
      expect(result.matches).toBe(false)
      expect(result.confidence).toBeLessThan(0.3)
    })

    it('returns false when excluded by exclude_if_contains', () => {
      const text = 'zorunlu trafik kasko araç oto motorlu taşıt araç sigortası'
      const result = classifier.matchesPolicyType(text, 'motor_kasko', 'tr')
      expect(result.matches).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('returns false when no classification config exists', () => {
      const configs = {
        ...defaultConfigs,
        no_class: createNoClassificationConfig(),
      }
      const configManager = createMockConfigManager(configs)
      const cls = new PolicyTypeClassifier(configManager)
      const result = cls.matchesPolicyType('any text', 'no_class', 'tr')
      expect(result.matches).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('uses locale fallback for terms', () => {
      const text = 'motor vehicle auto car insurance'
      const result = classifier.matchesPolicyType(text, 'motor_kasko', 'fr')
      // Should fall back to English terms
      expect(result.confidence).toBeGreaterThan(0)
    })
  })

  describe('getAllPotentialMatches', () => {
    it('returns all matches above minConfidence', () => {
      const text = 'kasko araç oto sigorta poliçe sağlık hastane tedavi'
      const matches = classifier.getAllPotentialMatches(text, 'tr', 0.1)
      expect(matches.length).toBeGreaterThan(0)
      for (const match of matches) {
        expect(match.confidence).toBeGreaterThanOrEqual(0.1)
        expect(match.policy_type_id).toBeTruthy()
        expect(match.policy_type_name).toBeTruthy()
      }
    })

    it('returns empty when no matches above threshold', () => {
      const text = 'random text without insurance terms'
      const matches = classifier.getAllPotentialMatches(text, 'tr', 0.9)
      expect(matches).toEqual([])
    })

    it('sorted by confidence descending', () => {
      const text = 'kasko araç oto sağlık hastane tedavi ameliyat sigorta poliçe'
      const matches = classifier.getAllPotentialMatches(text, 'tr', 0.1)
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].confidence).toBeGreaterThanOrEqual(matches[i + 1].confidence)
      }
    })

    it('uses default minConfidence of 0.3', () => {
      const text = 'kasko araç oto motorlu taşıt araç sigortası'
      const matches = classifier.getAllPotentialMatches(text, 'tr')
      for (const match of matches) {
        expect(match.confidence).toBeGreaterThanOrEqual(0.3)
      }
    })

    it('excludes excluded types', () => {
      const text = 'zorunlu trafik kasko araç oto'
      const matches = classifier.getAllPotentialMatches(text, 'tr', 0.0)
      // motor_kasko should be excluded (zorunlu trafik present)
      const kaskoMatch = matches.find(m => m.policy_type_id === 'motor_kasko')
      expect(kaskoMatch).toBeUndefined()
    })
  })

  describe('verifyConfiguration', () => {
    it('logs error when motor_kasko not loaded', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const configs: Record<string, PolicyTypeConfig> = {
        _generic: createFallbackConfig(),
      }
      const configManager = createMockConfigManager(configs)
      new PolicyTypeClassifier(configManager)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Kasko policy type (motor_kasko) not loaded')
      )
      consoleSpy.mockRestore()
    })

    it('logs error when kasko has no classification config', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const configs: Record<string, PolicyTypeConfig> = {
        motor_kasko: {
          policy_type_id: 'motor_kasko',
          policy_type_name: 'Kasko',
          description: 'test',
          category: 'motor',
          version: '1.0.0',
          // No classification
        },
        _generic: createFallbackConfig(),
      }
      const configManager = createMockConfigManager(configs)
      new PolicyTypeClassifier(configManager)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Kasko policy missing classification config')
      )
      consoleSpy.mockRestore()
    })

    it('does not log errors when kasko is properly configured', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const configManager = createMockConfigManager(defaultConfigs)
      new PolicyTypeClassifier(configManager)
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
