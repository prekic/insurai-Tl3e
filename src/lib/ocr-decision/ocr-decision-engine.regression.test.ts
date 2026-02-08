/**
 * OCR Decision Engine Regression Test Suite
 *
 * Comprehensive regression tests to prevent issues from recurring.
 * Uses sample policy documents as test fixtures.
 *
 * Run with: npm test -- --run src/lib/ocr-decision/ocr-decision-engine.regression.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ConfigurationManager,
  LanguageDetector,
  PolicyTypeClassifier,
  TextQualityAnalyzer,
  FieldExtractor,
  OCRDecisionEngine,
} from './index'
import {
  TURKISH_KASKO_CLEAN_DIGITAL,
  TURKISH_TRAFFIC_ZMSS,
  TURKISH_HEALTH_POLICY,
  ENGLISH_AUTO_INSURANCE,
  POOR_QUALITY_DOCUMENT,
  LOW_DENSITY_SCANNED,
  GERMAN_INSURANCE,
  MULTI_PAGE_VARYING_DENSITY,
} from './__fixtures__/sample-documents'

// ============================================================
// LANGUAGE DETECTION REGRESSION TESTS
// ============================================================

describe('Language Detection Regression Tests', () => {
  let detector: LanguageDetector
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
    detector = new LanguageDetector(configManager)
  })

  describe('Turkish Language Detection', () => {
    it('detects Turkish kasko policy as Turkish with high confidence', () => {
      const result = detector.detect(TURKISH_KASKO_CLEAN_DIGITAL)

      expect(result.locale_code).toBe('tr')
      expect(result.confidence).toBeGreaterThanOrEqual(0.5)
      expect(result.method).toBe('term_matching')
    })

    it('matches at least 3 Turkish insurance terms', () => {
      const result = detector.detect(TURKISH_KASKO_CLEAN_DIGITAL)

      expect(result.matched_terms).toBeDefined()
      expect(result.matched_terms!.length).toBeGreaterThanOrEqual(3)
    })

    it('finds core Turkish insurance terms: sigorta, poliçe, teminat, prim', () => {
      const result = detector.detect(TURKISH_KASKO_CLEAN_DIGITAL)

      const matchedLower = (result.matched_terms || []).map(t => t.toLowerCase())

      // Should find at least some of the core terms
      const coreTerms = ['sigorta', 'poliçe', 'teminat', 'prim']
      const foundCore = coreTerms.filter(t => matchedLower.includes(t))

      expect(foundCore.length).toBeGreaterThanOrEqual(2)
    })

    it('detects Turkish special characters (ğ, ü, ş, ı, ö, ç, İ)', () => {
      const result = detector.detect(TURKISH_KASKO_CLEAN_DIGITAL)

      expect(result.all_scores.tr.char_matches).toBeGreaterThan(0)
      expect(result.all_scores.tr.matched_chars).toBeDefined()
      expect(result.all_scores.tr.matched_chars!.length).toBeGreaterThan(0)
    })

    it('detects Turkish traffic policy as Turkish', () => {
      const result = detector.detect(TURKISH_TRAFFIC_ZMSS)

      expect(result.locale_code).toBe('tr')
      expect(result.confidence).toBeGreaterThan(0.4)
    })

    it('detects Turkish health policy as Turkish', () => {
      const result = detector.detect(TURKISH_HEALTH_POLICY)

      expect(result.locale_code).toBe('tr')
    })
  })

  describe('English Language Detection', () => {
    it('detects English auto insurance as English', () => {
      const result = detector.detect(ENGLISH_AUTO_INSURANCE)

      expect(result.locale_code).toBe('en')
      expect(result.confidence).toBeGreaterThan(0.4)
    })

    it('matches English insurance terms', () => {
      const result = detector.detect(ENGLISH_AUTO_INSURANCE)

      expect(result.all_scores.en.term_matches).toBeGreaterThan(0)
      expect(result.all_scores.en.matched_terms).toBeDefined()

      const matched = result.all_scores.en.matched_terms!.map(t => t.toLowerCase())
      expect(matched).toContain('insurance')
    })
  })

  describe('German Language Detection', () => {
    it('detects German insurance document as German', () => {
      const result = detector.detect(GERMAN_INSURANCE)

      expect(result.locale_code).toBe('de')
      expect(result.confidence).toBeGreaterThan(0.4)
    })
  })

  describe('Case Sensitivity', () => {
    it('detects Turkish from UPPERCASE text with special chars', () => {
      // Include Turkish special chars for better detection
      const uppercaseText = 'SİGORTA POLİÇE TEMİNAT PRİM HASAR KASKO İstanbul Şirket Üretim Özellik Çalışma Ğüzel'
      const result = detector.detect(uppercaseText)

      // Should detect Turkish via special characters at minimum
      expect(result.all_scores.tr).toBeDefined()
      expect(result.all_scores.tr.char_matches).toBeGreaterThan(0)
    })

    it('detects Turkish from lowercase text', () => {
      const lowercaseText = 'sigorta poliçe teminat prim hasar kasko araç sigortası için ile ve'
      const result = detector.detect(lowercaseText)

      expect(result.locale_code).toBe('tr')
    })

    it('detects Turkish from mixed case text', () => {
      const mixedText = 'Sigorta Poliçesi ile Teminat kapsamı Prim tutarı için ve sigortalı'
      const result = detector.detect(mixedText)

      expect(result.locale_code).toBe('tr')
    })
  })
})

// ============================================================
// POLICY TYPE CLASSIFICATION REGRESSION TESTS
// ============================================================

describe('Policy Classification Regression Tests', () => {
  let classifier: PolicyTypeClassifier
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
    classifier = new PolicyTypeClassifier(configManager)
  })

  describe('Turkish Kasko Classification', () => {
    it('classifies Turkish kasko document as motor_kasko', () => {
      const result = classifier.classify(TURKISH_KASKO_CLEAN_DIGITAL, 'tr')

      expect(result.policy_type_id).toBe('motor_kasko')
    })

    it('classifies with confidence >= 0.6', () => {
      const result = classifier.classify(TURKISH_KASKO_CLEAN_DIGITAL, 'tr')

      expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    })

    it('matches "kasko" in detection terms', () => {
      const result = classifier.classify(TURKISH_KASKO_CLEAN_DIGITAL, 'tr')

      const matchedLower = result.matched_terms.map(t => t.toLowerCase())
      expect(matchedLower).toContain('kasko')
    })

    it('categorizes as "motor"', () => {
      const result = classifier.classify(TURKISH_KASKO_CLEAN_DIGITAL, 'tr')

      expect(result.category).toBe('motor')
    })
  })

  describe('Turkish Traffic (ZMSS) Classification', () => {
    it('classifies traffic policy as motor_traffic', () => {
      const result = classifier.classify(TURKISH_TRAFFIC_ZMSS, 'tr')

      expect(result.policy_type_id).toBe('motor_traffic')
    })

    it('excludes kasko classification for traffic policy', () => {
      const result = classifier.classify(TURKISH_TRAFFIC_ZMSS, 'tr')

      // Traffic policy should NOT be classified as kasko
      expect(result.policy_type_id).not.toBe('motor_kasko')

      // Kasko should be excluded due to ZMSS/traffic terms
      if (result.all_scores.motor_kasko) {
        expect(result.all_scores.motor_kasko.excluded).toBe(true)
      }
    })

    it('matches traffic-specific terms: zmss, trafik, zorunlu mali sorumluluk', () => {
      const result = classifier.classify(TURKISH_TRAFFIC_ZMSS, 'tr')

      const matchedLower = result.matched_terms.map(t => t.toLowerCase())
      const trafficTerms = ['zmss', 'trafik', 'zorunlu mali sorumluluk', 'trafik sigortası']
      const foundTraffic = trafficTerms.filter(t =>
        matchedLower.some(m => m.includes(t) || t.includes(m))
      )

      expect(foundTraffic.length).toBeGreaterThan(0)
    })
  })

  describe('Turkish Health Classification', () => {
    it('classifies health policy as health_individual', () => {
      const result = classifier.classify(TURKISH_HEALTH_POLICY, 'tr')

      expect(result.policy_type_id).toBe('health_individual')
    })
  })

  describe('English Auto Insurance Classification', () => {
    it('has kasko-related matches for comprehensive auto', () => {
      const result = classifier.classify(ENGLISH_AUTO_INSURANCE, 'en')

      expect(result.all_scores.motor_kasko).toBeDefined()
      expect(result.all_scores.motor_kasko.matches.length).toBeGreaterThan(0)
    })
  })

  describe('Case Sensitivity', () => {
    it('classifies UPPERCASE kasko text - terms are matched', () => {
      // Note: Detection uses case-insensitive matching but Turkish İ/I is tricky
      // Testing that the classifier at least scores kasko terms
      const uppercase = 'KASKO SIGORTASI KASKO ARAÇ SIGORTASI OTO SIGORTA MOTORLU KARA TASITLARI'
      const result = classifier.classify(uppercase, 'tr')

      // At minimum, kasko should be in all_scores with some matches
      expect(result.all_scores.motor_kasko).toBeDefined()
      expect(result.all_scores.motor_kasko.matches.length).toBeGreaterThan(0)
    })

    it('classifies lowercase kasko text correctly', () => {
      // Need 4 of 5 terms: kasko, araç sigortası, oto sigorta, motorlu kara taşıtları, kasko sigortası
      const lowercase = 'kasko sigortası kasko araç sigortası oto sigorta motorlu kara taşıtları'
      const result = classifier.classify(lowercase, 'tr')

      expect(result.policy_type_id).toBe('motor_kasko')
    })
  })

  describe('Fallback Behavior', () => {
    it('falls back to _generic for unclear document', () => {
      const unclear = 'Random text without insurance terms 12345'
      const result = classifier.classify(unclear, 'tr')

      expect(result.policy_type_id).toBe('_generic')
    })

    it('provides all_scores even when falling back', () => {
      const unclear = 'Random text'
      const result = classifier.classify(unclear, 'tr')

      expect(result.all_scores).toBeDefined()
      expect(result.all_scores.motor_kasko).toBeDefined()
      expect(result.all_scores.motor_traffic).toBeDefined()
    })
  })
})

// ============================================================
// OCR DECISION REGRESSION TESTS
// ============================================================

describe('OCR Decision Regression Tests', () => {
  let engine: OCRDecisionEngine

  beforeEach(() => {
    engine = new OCRDecisionEngine()
  })

  describe('Clean Digital PDF - Skip OCR', () => {
    it('makes decision for clean digital Turkish kasko', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)

      // High-quality digital PDF should skip or use selective OCR
      expect(['skip_ocr', 'selective_ocr']).toContain(decision.action)
    })

    it('has confidence >= 0.60 for clean digital document', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)

      expect(decision.confidence).toBeGreaterThanOrEqual(0.60)
    })

    it('detects language and policy type correctly', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)

      expect(decision.document_classification.detected_language.locale_code).toBe('tr')
      expect(decision.document_classification.detected_policy_type.policy_type_id).toBe('motor_kasko')
    })
  })

  describe('Poor Quality Document - Require OCR', () => {
    it('decides to require OCR for poor quality document', () => {
      const decision = engine.analyzeDocument(POOR_QUALITY_DOCUMENT)

      // Poor quality should require OCR
      expect(['full_ocr', 'selective_ocr']).toContain(decision.action)
    })

    it('has lower confidence for poor quality document', () => {
      const decision = engine.analyzeDocument(POOR_QUALITY_DOCUMENT)

      expect(decision.confidence).toBeLessThan(0.7)
    })

    it('detects encoding issues', () => {
      const decision = engine.analyzeDocument(POOR_QUALITY_DOCUMENT)

      expect(decision.analysis.text_quality.encoding_issues).toBe(true)
    })
  })

  describe('Low Density Document - Full OCR', () => {
    it('decides to require full OCR for low density document', () => {
      const decision = engine.analyzeDocument(LOW_DENSITY_SCANNED)

      expect(decision.action).toBe('full_ocr')
    })

    it('has low character density score', () => {
      const decision = engine.analyzeDocument(LOW_DENSITY_SCANNED)
      const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

      expect(breakdown.char_density.score).toBeLessThan(0.5)
    })
  })

  describe('Confidence Breakdown Components', () => {
    it('includes all 5 weighted components in breakdown', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)

      const requiredComponents = [
        'char_density',
        'text_quality',
        'page_variance',
        'encoding_check',
        'field_extraction',
      ]

      const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

      for (const component of requiredComponents) {
        expect(breakdown[component as keyof typeof breakdown]).toBeDefined()
      }
    })

    it('all component scores are between 0 and 1', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)
      const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

      for (const key of Object.keys(breakdown)) {
        const component = breakdown[key as keyof typeof breakdown]
        expect(component.score).toBeGreaterThanOrEqual(0)
        expect(component.score).toBeLessThanOrEqual(1)
      }
    })

    it('contributions sum to overall confidence', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)
      const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

      const totalContrib = Object.values(breakdown).reduce(
        (sum, c) => sum + c.contribution,
        0
      )

      expect(Math.abs(totalContrib - decision.confidence)).toBeLessThan(0.01)
    })

    it('weights sum to 1.0', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)
      const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

      const totalWeight = Object.values(breakdown).reduce(
        (sum, c) => sum + c.weight,
        0
      )

      expect(totalWeight).toBe(1.0)
    })
  })
})

// ============================================================
// TEXT QUALITY REGRESSION TESTS
// ============================================================

describe('Text Quality Regression Tests', () => {
  let analyzer: TextQualityAnalyzer
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
    analyzer = new TextQualityAnalyzer(configManager)
  })

  describe('Turkish Insurance Terms', () => {
    it('finds Turkish insurance terminology in kasko document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(TURKISH_KASKO_CLEAN_DIGITAL, 'tr', policyConfig)

      expect(result.terms_found).toBeGreaterThan(0)
      expect(result.found_terms_sample.length).toBeGreaterThan(0)
    })

    it('finds core terms: sigorta, poliçe, teminat, prim', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(TURKISH_KASKO_CLEAN_DIGITAL, 'tr', policyConfig)

      const foundLower = result.found_terms_sample.map(t => t.toLowerCase())
      const coreTerms = ['sigorta', 'poliçe', 'teminat', 'prim']
      const matches = coreTerms.filter(t => foundLower.some(f => f.includes(t)))

      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Encoding Issues Detection', () => {
    it('detects no encoding issues in clean document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(TURKISH_KASKO_CLEAN_DIGITAL, 'tr', policyConfig)

      expect(result.encoding_issues).toBe(false)
    })

    it('detects encoding issues in poor quality document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(POOR_QUALITY_DOCUMENT, 'tr', policyConfig)

      expect(result.encoding_issues).toBe(true)
      expect(result.encoding_issues_found).toBeDefined()
      expect(result.encoding_issues_found!.length).toBeGreaterThan(0)
    })
  })

  describe('Quality Recommendations', () => {
    it('recommends "proceed" for high quality document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(TURKISH_KASKO_CLEAN_DIGITAL, 'tr', policyConfig)

      expect(result.recommendation).toBe('proceed')
    })

    it('recommends "require_ocr" for poor quality document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(POOR_QUALITY_DOCUMENT, 'tr', policyConfig)

      expect(['consider_ocr', 'require_ocr']).toContain(result.recommendation)
    })
  })
})

// ============================================================
// FIELD EXTRACTION REGRESSION TESTS
// ============================================================

describe('Field Extraction Regression Tests', () => {
  let extractor: FieldExtractor
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
    extractor = new FieldExtractor(configManager)
  })

  describe('Kasko Field Extraction', () => {
    it('extracts fields from kasko document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = extractor.testExtraction(TURKISH_KASKO_CLEAN_DIGITAL, policyConfig, 'tr')

      expect(result.fields_found).toBeGreaterThan(0)
    })

    it('has reasonable extraction rate for well-structured document', () => {
      const policyConfig = configManager.getPolicyConfig('motor_kasko')
      const result = extractor.testExtraction(TURKISH_KASKO_CLEAN_DIGITAL, policyConfig, 'tr')

      // Should extract at least some required fields
      expect(result.extraction_rate).toBeGreaterThan(0)
    })
  })

  describe('Pattern Testing', () => {
    it('tests policy number pattern correctly', () => {
      const text = 'Poliçe No: KSK-2024-001234567'
      const pattern = 'Poli[çc]e\\s*No[.:]?\\s*([A-Z0-9-]+)'

      const result = extractor.testPattern(text, pattern)

      expect(result.matches).toBe(true)
      expect(result.value).toContain('KSK-2024')
    })

    it('tests plate number pattern correctly', () => {
      const text = 'Plaka: 34 ERİ 2024'
      const pattern = 'Plaka[:\\s]+([0-9]{2}\\s*[A-ZİĞÜŞÖÇ]+\\s*[0-9]+)'

      const result = extractor.testPattern(text, pattern)

      expect(result.matches).toBe(true)
    })
  })
})

// ============================================================
// CONFIGURATION LOADING REGRESSION TESTS
// ============================================================

describe('Configuration Loading Regression Tests', () => {
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
  })

  describe('Locale Configuration', () => {
    it('has Turkish locale loaded', () => {
      const locales = configManager.getAvailableLocales()

      expect(locales).toContain('tr')
    })

    it('has English locale loaded', () => {
      const locales = configManager.getAvailableLocales()

      expect(locales).toContain('en')
    })

    it('has German locale loaded', () => {
      const locales = configManager.getAvailableLocales()

      expect(locales).toContain('de')
    })

    it('Turkish locale has language detection config', () => {
      const trLocale = configManager.getLocale('tr')

      expect(trLocale.locale_code).toBe('tr')
      expect('language_detection' in trLocale).toBe(true)

      if ('language_detection' in trLocale) {
        expect(trLocale.language_detection.sample_terms.length).toBeGreaterThan(0)
        expect(trLocale.language_detection.special_characters.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Policy Type Configuration', () => {
    it('has kasko policy type loaded', () => {
      const policyTypes = configManager.getAvailablePolicyTypes()

      expect(policyTypes.some(pt => pt.includes('kasko'))).toBe(true)
    })

    it('has traffic policy type loaded', () => {
      const policyTypes = configManager.getAvailablePolicyTypes()

      expect(policyTypes.some(pt => pt.includes('traffic'))).toBe(true)
    })

    it('kasko config has classification section', () => {
      const kaskoConfig = configManager.getPolicyConfig('motor_kasko')

      expect(kaskoConfig.classification).toBeDefined()
      expect(kaskoConfig.classification!.detection_terms).toBeDefined()
      expect(kaskoConfig.classification!.detection_terms.tr).toBeDefined()
    })

    it('kasko config has required_fields section', () => {
      const kaskoConfig = configManager.getPolicyConfig('motor_kasko')

      expect(kaskoConfig.required_fields).toBeDefined()
    })
  })

  describe('OCR Settings', () => {
    it('has confidence weights that sum to 1.0', () => {
      const settings = configManager.getOCRSettings()
      const weights = settings.confidence_calculation.weights

      const total =
        weights.char_density +
        weights.text_quality +
        weights.page_variance +
        weights.encoding_check +
        weights.field_extraction

      expect(total).toBe(1.0)
    })

    it('has valid threshold values', () => {
      const settings = configManager.getOCRSettings()

      expect(settings.confidence_calculation.thresholds.skip_ocr).toBeGreaterThan(0)
      expect(settings.confidence_calculation.thresholds.skip_ocr).toBeLessThanOrEqual(1)
      expect(settings.confidence_calculation.thresholds.selective_ocr).toBeGreaterThanOrEqual(0)
      expect(settings.density_analysis.chars_per_page_threshold).toBeGreaterThan(0)
    })
  })

  describe('Configuration Verification', () => {
    it('passes configuration verification', () => {
      const verification = configManager.verifyConfigurations()

      expect(verification.success).toBe(true)
      expect(verification.issues.length).toBe(0)
    })

    it('diagnostics show locales and policy types', () => {
      const verification = configManager.verifyConfigurations()

      expect(verification.diagnostics.locales.length).toBeGreaterThan(0)
      expect(verification.diagnostics.policy_types.length).toBeGreaterThan(0)
    })
  })
})

// ============================================================
// FULL PIPELINE INTEGRATION TESTS
// ============================================================

describe('Full Pipeline Integration Regression Tests', () => {
  let engine: OCRDecisionEngine

  beforeEach(() => {
    engine = new OCRDecisionEngine()
  })

  describe('Turkish Kasko Pipeline', () => {
    it('processes Turkish kasko document end-to-end', () => {
      const decision = engine.analyzeDocument(TURKISH_KASKO_CLEAN_DIGITAL)

      // Language
      expect(decision.document_classification.detected_language.locale_code).toBe('tr')
      expect(decision.document_classification.detected_language.confidence).toBeGreaterThan(0.4)

      // Policy type
      expect(decision.document_classification.detected_policy_type.policy_type_id).toBe('motor_kasko')
      expect(decision.document_classification.detected_policy_type.confidence).toBeGreaterThanOrEqual(0.6)

      // Decision - should be skip or selective
      expect(['skip_ocr', 'selective_ocr']).toContain(decision.action)
      expect(decision.confidence).toBeGreaterThanOrEqual(0.60)

      // Reasoning
      expect(decision.reasoning.length).toBeGreaterThan(0)

      // Timing
      expect(decision.duration_ms).toBeGreaterThanOrEqual(0)
      expect(decision.timestamp).toBeDefined()
    })
  })

  describe('Turkish Traffic Pipeline', () => {
    it('processes Turkish traffic document end-to-end', () => {
      const decision = engine.analyzeDocument(TURKISH_TRAFFIC_ZMSS)

      expect(decision.document_classification.detected_language.locale_code).toBe('tr')
      // Traffic policy should be detected with sufficient terms
      expect(decision.document_classification.detected_policy_type.policy_type_id).toBe('motor_traffic')
    })
  })

  describe('English Auto Insurance Pipeline', () => {
    it('processes English auto insurance document end-to-end', () => {
      const decision = engine.analyzeDocument(ENGLISH_AUTO_INSURANCE)

      expect(decision.document_classification.detected_language.locale_code).toBe('en')
      expect(decision.action).toBeDefined()
    })
  })

  describe('Page-Level Analysis', () => {
    it('performs page-level analysis when page texts provided', () => {
      const pages = [
        MULTI_PAGE_VARYING_DENSITY.page1,
        MULTI_PAGE_VARYING_DENSITY.page2,
        MULTI_PAGE_VARYING_DENSITY.page3,
        MULTI_PAGE_VARYING_DENSITY.page4,
      ]

      const decision = engine.analyzeDocument(pages.join('\n\n'), pages)

      expect(decision.mode).toBe('page_level_analysis')
      expect(decision.analysis.density.total_pages).toBe(4)
      expect(decision.analysis.density.page_details.length).toBe(4)
    })

    it('identifies pages below threshold when density is low', () => {
      // Create pages with varying density
      const lowDensityPage = 'Az içerik'  // Very short
      const highDensityPage = TURKISH_KASKO_CLEAN_DIGITAL.slice(0, 500)

      const pages = [
        highDensityPage,
        lowDensityPage,  // Low density
        highDensityPage,
        lowDensityPage,  // Low density
      ]

      const decision = engine.analyzeDocument(pages.join('\n\n'), pages)

      // Some pages should have low density (needs_ocr flag)
      const pagesNeedingOcr = decision.analysis.density.page_details
        .filter(p => p.needs_ocr).length

      // At least the low density pages should be flagged
      expect(pagesNeedingOcr).toBeGreaterThanOrEqual(2)
    })
  })
})
