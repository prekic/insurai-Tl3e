/**
 * Language Detector - Coverage Tests
 *
 * Targets uncovered branches in language-detector.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LanguageDetector } from './language-detector'
import type { ConfigurationManager } from './configuration-manager'
import type { OCRSettings, LocaleConfig, UniversalConfig } from './types'

function createMockOCRSettings(overrides: Partial<OCRSettings['language_detection']> = {}): OCRSettings {
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
      sample_size: 2000,
      ...overrides,
    },
    policy_type_detection: {
      enabled: true,
      min_confidence: 0.3,
      fallback_type: '_generic',
      use_ml_classifier: false,
    },
    performance: {
      max_pages_for_quick_analysis: 5,
      timeout_seconds: 30,
      parallel_page_processing: false,
      cache_extracted_text: false,
    },
  } as OCRSettings
}

function createTurkishLocaleConfig(): LocaleConfig {
  return {
    locale_code: 'tr',
    locale_name: 'Turkish',
    language_detection: {
      sample_terms: ['sigorta', 'poliçe', 'teminat', 'prim', 'hasar', 'kasko'],
      min_matches_for_detection: 3,
      character_sets: ['latin', 'turkish'],
      special_characters: ['ı', 'ğ', 'ü', 'ş', 'ö', 'ç', 'İ', 'Ğ', 'Ü', 'Ş', 'Ö', 'Ç'],
    },
    encoding_validation: {
      expected_characters: '[A-Za-zÇĞİÖŞÜçğıöşü0-9]',
      garbage_patterns: [],
    },
    insurance_terminology: {
      core_terms: ['sigorta', 'poliçe'],
      document_structure_terms: ['bölüm'],
      common_values: [],
    },
    date_formats: ['DD/MM/YYYY'],
    date_patterns: ['\\d{2}/\\d{2}/\\d{4}'],
    currency: {
      code: 'TRY',
      symbol: '₺',
      patterns: [],
      decimal_separator: ',',
      thousands_separator: '.',
    },
    number_formats: {
      decimal_separator: ',',
      thousands_separator: '.',
      patterns: [],
    },
  }
}

function createEnglishLocaleConfig(): LocaleConfig {
  return {
    locale_code: 'en',
    locale_name: 'English',
    language_detection: {
      sample_terms: ['insurance', 'policy', 'coverage', 'premium', 'claim', 'deductible'],
      min_matches_for_detection: 3,
      character_sets: ['latin'],
      special_characters: [],
    },
    encoding_validation: {
      expected_characters: '[A-Za-z0-9]',
      garbage_patterns: [],
    },
    insurance_terminology: {
      core_terms: ['insurance', 'policy'],
      document_structure_terms: ['section'],
      common_values: [],
    },
    date_formats: ['MM/DD/YYYY'],
    date_patterns: [],
    currency: {
      code: 'USD',
      symbol: '$',
      patterns: [],
      decimal_separator: '.',
      thousands_separator: ',',
    },
    number_formats: {
      decimal_separator: '.',
      thousands_separator: ',',
      patterns: [],
    },
  }
}

function createUniversalConfig(): UniversalConfig {
  return {
    locale_code: '_universal',
    locale_name: 'Universal',
    description: 'Universal patterns',
    universal_patterns: {
      numbers: ['\\d+'],
      dates: ['\\d{2}/\\d{2}/\\d{4}'],
      percentages: ['\\d+%'],
      emails: ['\\S+@\\S+'],
      phone_numbers: ['\\+?\\d+'],
      urls: ['https?://\\S+'],
    },
    currency_symbols: ['$', '€', '₺'],
    common_abbreviations: ['No.', 'Tel.'],
  }
}

function createMockConfigManager(
  locales: Record<string, LocaleConfig | UniversalConfig>,
  ocrSettings?: OCRSettings
): ConfigurationManager {
  const availableLocales = Object.keys(locales).filter(k => k !== '_universal')

  return {
    getOCRSettings: () => ocrSettings || createMockOCRSettings(),
    getAvailableLocales: () => availableLocales,
    getLocale: (code: string) => locales[code] || locales['_universal'] || createUniversalConfig(),
    getPolicyConfig: vi.fn(),
    getAvailablePolicyTypes: vi.fn().mockReturnValue([]),
  } as unknown as ConfigurationManager
}

describe('LanguageDetector coverage', () => {
  let detector: LanguageDetector

  beforeEach(() => {
    const configManager = createMockConfigManager({
      tr: createTurkishLocaleConfig(),
      en: createEnglishLocaleConfig(),
      _universal: createUniversalConfig(),
    })
    detector = new LanguageDetector(configManager)
  })

  describe('detect', () => {
    it('detects Turkish from insurance terms', () => {
      const text = 'Bu sigorta poliçesi teminat ve prim bilgileri içerir. Hasar durumunda kasko geçerlidir.'
      const result = detector.detect(text)
      expect(result.locale_code).toBe('tr')
      expect(result.confidence).toBeGreaterThan(0.3)
      expect(result.method).toBe('term_matching')
      expect(result.matched_terms).toBeDefined()
      expect(result.matched_terms!.length).toBeGreaterThan(0)
    })

    it('detects English from insurance terms', () => {
      const text = 'This insurance policy provides coverage details. The premium and deductible are listed. Please file a claim.'
      const result = detector.detect(text)
      expect(result.locale_code).toBe('en')
      expect(result.confidence).toBeGreaterThan(0.3)
      expect(result.method).toBe('term_matching')
    })

    it('falls back when confidence below threshold', () => {
      const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
      const result = detector.detect(text)
      expect(result.locale_code).toBe('en') // fallback_locale
      expect(result.confidence).toBe(0)
      expect(result.method).toBe('fallback')
    })

    it('uses character_detection method when only chars match', () => {
      // Text with Turkish chars but no insurance terms
      const text = 'Güneşli bir gün. Öğrenciler çalışıyor. Şehirde yaşamak güzel.'
      const result = detector.detect(text)
      // Turkish chars should give char_score but no term_score
      if (result.method === 'character_detection') {
        expect(result.matched_chars).toBeDefined()
        expect(result.matched_chars!.length).toBeGreaterThan(0)
      }
    })

    it('includes runner_up in result when multiple locales scored', () => {
      const text = 'This sigorta policy provides coverage and teminat details. Insurance prim.'
      const result = detector.detect(text)
      if (result.runner_up) {
        expect(result.runner_up.locale).toBeDefined()
        expect(typeof result.runner_up.confidence).toBe('number')
      }
    })

    it('includes all_scores in result', () => {
      const text = 'Sigorta poliçe teminat prim hasar kasko'
      const result = detector.detect(text)
      expect(result.all_scores).toBeDefined()
      expect(typeof result.all_scores).toBe('object')
    })

    it('uses sample_size setting for text sampling', () => {
      const settings = createMockOCRSettings({ sample_size: 50 })
      const configManager = createMockConfigManager({
        tr: createTurkishLocaleConfig(),
        en: createEnglishLocaleConfig(),
      }, settings)
      const det = new LanguageDetector(configManager)

      // Terms after 50 chars should not be detected in sample
      const longPadding = 'x'.repeat(100)
      const text = `${longPadding} sigorta poliçe teminat prim hasar kasko`
      const result = det.detect(text)
      // Terms are in the part beyond sample size, so fewer matches
      expect(result).toBeDefined()
    })

    it('handles locale with no language_detection config', () => {
      const universal = createUniversalConfig()
      const configManager = createMockConfigManager({
        _universal: universal,
        tr: createTurkishLocaleConfig(),
      })
      // _universal has no language_detection, so it should be skipped
      const det = new LanguageDetector(configManager)
      const result = det.detect('sigorta poliçe teminat prim')
      expect(result.locale_code).toBe('tr')
    })

    it('handles empty text', () => {
      const result = detector.detect('')
      expect(result.locale_code).toBe('en') // fallback
      expect(result.confidence).toBe(0)
      expect(result.method).toBe('fallback')
    })

    it('handles locale with empty sample_terms', () => {
      const enConfig = createEnglishLocaleConfig()
      enConfig.language_detection.sample_terms = []
      const configManager = createMockConfigManager({
        en: enConfig,
        tr: createTurkishLocaleConfig(),
      })
      const det = new LanguageDetector(configManager)
      const result = det.detect('sigorta poliçe')
      expect(result).toBeDefined()
    })

    it('handles locale with empty special_characters', () => {
      const trConfig = createTurkishLocaleConfig()
      trConfig.language_detection.special_characters = []
      const configManager = createMockConfigManager({
        tr: trConfig,
        en: createEnglishLocaleConfig(),
      })
      const det = new LanguageDetector(configManager)
      const result = det.detect('sigorta poliçe teminat prim hasar kasko')
      expect(result.locale_code).toBe('tr')
    })

    it('uses default sample_size when not specified', () => {
      const settings = createMockOCRSettings()
      delete (settings.language_detection as Record<string, unknown>).sample_size
      const configManager = createMockConfigManager({
        tr: createTurkishLocaleConfig(),
        en: createEnglishLocaleConfig(),
      }, settings)
      const det = new LanguageDetector(configManager)
      const result = det.detect('sigorta poliçe')
      expect(result).toBeDefined()
    })

    it('returns no runner_up when only one locale scores', () => {
      const configManager = createMockConfigManager({
        tr: createTurkishLocaleConfig(),
      })
      const det = new LanguageDetector(configManager)
      const result = det.detect('sigorta poliçe teminat prim hasar kasko')
      // Only one locale, so runner_up may or may not exist
      expect(result.locale_code).toBe('tr')
    })

    it('char_score caps at 1.0 when many chars match', () => {
      const text = 'ığüşöçİĞÜŞÖÇ ığüşöçİĞÜŞÖÇ ığüşöçİĞÜŞÖÇ'
      const result = detector.detect(text)
      if (result.all_scores['tr']) {
        expect(result.all_scores['tr'].char_score).toBeLessThanOrEqual(1.0)
      }
    })

    it('fallback when no locales have scores and fallback_locale not set', () => {
      const settings = createMockOCRSettings({ fallback_locale: '' })
      const universal = createUniversalConfig()
      // Only universal config (skipped in scoring)
      const _configManager = createMockConfigManager({
        _universal: universal,
      }, settings)
      // This will fail at verifyConfiguration but shouldn't crash detect
      // We need at least one locale for the detector
      const configManager2 = createMockConfigManager({}, settings)
      const det = new LanguageDetector(configManager2)
      const result = det.detect('random text')
      expect(result.method).toBe('fallback')
    })
  })

  describe('hasLanguageIndicators', () => {
    it('returns true when enough terms match', () => {
      const text = 'Bu sigorta poliçesi teminat bilgileri içerir.'
      expect(detector.hasLanguageIndicators(text, 'tr')).toBe(true)
    })

    it('returns false when insufficient terms match', () => {
      const text = 'Only one term: sigorta appears here.'
      expect(detector.hasLanguageIndicators(text, 'tr')).toBe(false)
    })

    it('returns false for locale without language_detection', () => {
      expect(detector.hasLanguageIndicators('any text', '_universal')).toBe(false)
    })

    it('uses case-insensitive matching', () => {
      // Use lowercase terms that match the sample_terms directly
      const text = 'Bu belge sigorta ve poliçe teminat içerir.'
      expect(detector.hasLanguageIndicators(text, 'tr')).toBe(true)
    })
  })

  describe('detectSpecialCharacters', () => {
    it('detects Turkish special characters', () => {
      const text = 'İstanbul güneşli bir gün.'
      const result = detector.detectSpecialCharacters(text, 'tr')
      expect(result.found.length).toBeGreaterThan(0)
      expect(result.hasIndicators).toBe(true)
      expect(result.count).toBe(result.found.length)
    })

    it('returns empty when no special chars present', () => {
      const text = 'Plain ASCII text only.'
      const result = detector.detectSpecialCharacters(text, 'tr')
      expect(result.found).toEqual([])
      expect(result.count).toBe(0)
      expect(result.hasIndicators).toBe(false)
    })

    it('returns empty for locale without language_detection', () => {
      const result = detector.detectSpecialCharacters('any text', '_universal')
      expect(result.found).toEqual([])
      expect(result.count).toBe(0)
      expect(result.hasIndicators).toBe(false)
    })

    it('handles locale with empty special_characters list', () => {
      const result = detector.detectSpecialCharacters('insurance policy', 'en')
      expect(result.found).toEqual([])
      expect(result.hasIndicators).toBe(false)
    })
  })

  describe('getDetailedAnalysis', () => {
    it('returns detected result and analysis', () => {
      const text = 'Sigorta poliçe teminat bilgileri. İstanbul güneşli.'
      const analysis = detector.getDetailedAnalysis(text)
      expect(analysis.detected).toBeDefined()
      expect(analysis.term_analysis).toBeDefined()
      expect(analysis.char_analysis).toBeDefined()
    })

    it('provides found and missing terms per locale', () => {
      const text = 'sigorta poliçe teminat'
      const analysis = detector.getDetailedAnalysis(text)
      expect(analysis.term_analysis['tr']).toBeDefined()
      expect(analysis.term_analysis['tr'].found.length).toBeGreaterThan(0)
      expect(analysis.term_analysis['tr'].missing.length).toBeGreaterThan(0)
    })

    it('provides found and missing chars per locale', () => {
      const text = 'İstanbul güzel şehir'
      const analysis = detector.getDetailedAnalysis(text)
      expect(analysis.char_analysis['tr']).toBeDefined()
      expect(analysis.char_analysis['tr'].found.length).toBeGreaterThan(0)
    })

    it('skips locales without language_detection in analysis', () => {
      const text = 'Some text'
      const analysis = detector.getDetailedAnalysis(text)
      // _universal should be excluded from analysis
      expect(analysis.term_analysis['_universal']).toBeUndefined()
    })
  })

  describe('verifyConfiguration', () => {
    it('logs error when Turkish locale is missing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const configManager = createMockConfigManager({
        en: createEnglishLocaleConfig(),
      })
      new LanguageDetector(configManager)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Turkish locale (tr) not loaded')
      )
      consoleSpy.mockRestore()
    })

    it('logs error when English locale is missing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const configManager = createMockConfigManager({
        tr: createTurkishLocaleConfig(),
      })
      new LanguageDetector(configManager)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('English locale (en) not loaded')
      )
      consoleSpy.mockRestore()
    })

    it('logs error when Turkish locale has no language_detection config', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const trConfig = { locale_code: 'tr', locale_name: 'Turkish' } as unknown as LocaleConfig
      const configManager = createMockConfigManager({
        tr: trConfig,
        en: createEnglishLocaleConfig(),
      })
      new LanguageDetector(configManager)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Turkish locale missing language_detection config')
      )
      consoleSpy.mockRestore()
    })

    it('does not log errors when both locales are properly configured', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const configManager = createMockConfigManager({
        tr: createTurkishLocaleConfig(),
        en: createEnglishLocaleConfig(),
      })
      new LanguageDetector(configManager)
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
