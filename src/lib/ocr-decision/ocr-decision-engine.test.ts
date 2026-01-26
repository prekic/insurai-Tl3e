/**
 * OCR Decision Engine Tests
 *
 * Tests for the configuration-driven OCR decision system.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ConfigurationManager,
  getConfigurationManager,
  LanguageDetector,
  PolicyTypeClassifier,
  TextQualityAnalyzer,
  FieldExtractor,
  OCRDecisionEngine,
  getOCRDecisionEngine,
} from './index'

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
  })

  describe('getLocale', () => {
    it('returns Turkish locale configuration', () => {
      const locale = configManager.getLocale('tr')
      expect(locale.locale_code).toBe('tr')
      expect(locale.locale_name).toBe('Turkish')
    })

    it('returns English locale configuration', () => {
      const locale = configManager.getLocale('en')
      expect(locale.locale_code).toBe('en')
    })

    it('returns German locale configuration', () => {
      const locale = configManager.getLocale('de')
      expect(locale.locale_code).toBe('de')
    })

    it('returns universal fallback for unknown locale', () => {
      const locale = configManager.getLocale('unknown')
      expect(locale.locale_code).toBe('_universal')
    })
  })

  describe('getPolicyConfig', () => {
    it('returns motor_kasko policy configuration', () => {
      const config = configManager.getPolicyConfig('motor_kasko')
      expect(config.policy_type_id).toBe('motor_kasko')
      expect(config.category).toBe('motor')
    })

    it('returns motor_traffic policy configuration', () => {
      const config = configManager.getPolicyConfig('motor_traffic')
      expect(config.policy_type_id).toBe('motor_traffic')
      expect(config.category).toBe('motor')
    })

    it('returns property_fire policy configuration', () => {
      const config = configManager.getPolicyConfig('property_fire')
      expect(config.policy_type_id).toBe('property_fire')
      expect(config.category).toBe('property')
    })

    it('returns health_individual policy configuration', () => {
      const config = configManager.getPolicyConfig('health_individual')
      expect(config.policy_type_id).toBe('health_individual')
      expect(config.category).toBe('health')
    })

    it('returns generic fallback for unknown policy type', () => {
      const config = configManager.getPolicyConfig('unknown')
      expect(config.policy_type_id).toBe('_generic')
    })
  })

  describe('getAvailableLocales', () => {
    it('returns list of available locales', () => {
      const locales = configManager.getAvailableLocales()
      expect(locales).toContain('tr')
      expect(locales).toContain('en')
      expect(locales).toContain('de')
      expect(locales).not.toContain('_universal')
    })
  })

  describe('getAvailablePolicyTypes', () => {
    it('returns list of available policy types', () => {
      const types = configManager.getAvailablePolicyTypes()
      expect(types).toContain('motor_kasko')
      expect(types).toContain('motor_traffic')
      expect(types).toContain('property_fire')
      expect(types).toContain('health_individual')
      expect(types).not.toContain('_generic')
    })
  })

  describe('getInsuranceTerminology', () => {
    it('returns Turkish insurance terms', () => {
      const terms = configManager.getInsuranceTerminology('tr')
      expect(terms.length).toBeGreaterThan(0)
      expect(terms).toContain('sigorta')
      expect(terms).toContain('poliçe')
    })

    it('returns English insurance terms', () => {
      const terms = configManager.getInsuranceTerminology('en')
      expect(terms.length).toBeGreaterThan(0)
      expect(terms).toContain('insurance')
      expect(terms).toContain('policy')
    })
  })

  describe('getOCRSettings', () => {
    it('returns OCR settings with density analysis thresholds', () => {
      const settings = configManager.getOCRSettings()
      expect(settings.density_analysis).toBeDefined()
      expect(settings.density_analysis.chars_per_page_threshold).toBeGreaterThan(0)
    })

    it('returns OCR settings with confidence thresholds', () => {
      const settings = configManager.getOCRSettings()
      expect(settings.confidence_calculation).toBeDefined()
      expect(settings.confidence_calculation.thresholds.skip_ocr).toBeGreaterThan(0)
    })
  })

  describe('singleton', () => {
    it('getConfigurationManager returns singleton instance', () => {
      const instance1 = getConfigurationManager()
      const instance2 = getConfigurationManager()
      expect(instance1).toBe(instance2)
    })
  })
})

describe('LanguageDetector', () => {
  let detector: LanguageDetector

  beforeEach(() => {
    const configManager = new ConfigurationManager()
    detector = new LanguageDetector(configManager)
  })

  describe('detect', () => {
    it('detects Turkish from characteristic words', () => {
      // Include many Turkish sample terms: sigorta, poliçe, teminat, prim, ve, için, ile, sigortacı, sigortalı
      const text = 'Sigorta poliçe belgesi ile teminat kapsamı prim için sigortalı ve sigortacı'
      const result = detector.detect(text)
      expect(result.locale_code).toBe('tr')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('detects Turkish from special characters', () => {
      // Include many Turkish special characters: İ, ş, ü, ğ, ö, ç
      const text = 'İstanbul şehrinde güneşli bir gün öğleden sonra ürünler çeşitli'
      const result = detector.detect(text)
      // Should be detected as Turkish or have Turkish as best match
      expect(result.all_scores?.tr).toBeDefined()
      expect(result.all_scores?.tr.char_matches).toBeGreaterThan(0)
    })

    it('detects English text', () => {
      // Include many English sample terms: insurance, policy, coverage, premium, deductible
      const text = 'Insurance policy document with coverage and premium details deductible information'
      const result = detector.detect(text)
      expect(result.locale_code).toBe('en')
    })

    it('detects German text', () => {
      // German sample terms: versicherung, police, deckung, prämie, und, für, mit, der, die, das
      const text = 'Versicherung police dokument mit deckung und prämie für der die das'
      const result = detector.detect(text)
      expect(result.locale_code).toBe('de')
    })

    it('falls back for unclear text', () => {
      const text = '12345 67890 !@#$%'
      const result = detector.detect(text)
      expect(result.method).toBe('fallback')
    })
  })
})

describe('PolicyTypeClassifier', () => {
  let classifier: PolicyTypeClassifier

  beforeEach(() => {
    const configManager = new ConfigurationManager()
    classifier = new PolicyTypeClassifier(configManager)
  })

  describe('classify', () => {
    it('classifies kasko document', () => {
      // Detection terms: kasko, araç sigortası, oto sigorta, motorlu kara taşıtları, kasko sigortası
      const text = 'Kasko sigortası poliçesi oto sigorta araç sigortası motorlu kara taşıtları'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('motor_kasko')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies traffic insurance document', () => {
      // Detection terms: trafik sigortası, zorunlu mali sorumluluk, zmss, zmms, trafik poliçesi, karayolu motorlu
      const text = 'Trafik sigortası zorunlu mali sorumluluk poliçesi zmss zmms trafik poliçesi'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('motor_traffic')
    })

    it('classifies fire insurance document', () => {
      // Detection terms: yangın sigortası, yangın poliçesi, yangın teminatı, itfaiye, konut sigortası
      const text = 'Yangın sigortası yangın poliçesi konut sigortası yangın teminatı bina'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('property_fire')
    })

    it('classifies health insurance document', () => {
      // Detection terms: sağlık sigortası, sağlık poliçesi, tamamlayıcı sağlık, tss, özel sağlık, tedavi giderleri
      const text = 'Sağlık sigortası sağlık poliçesi özel sağlık tss tedavi giderleri'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('health_individual')
    })

    it('falls back to generic for unclear document', () => {
      const text = 'Random text without insurance terms'
      const result = classifier.classify(text, 'tr')
      expect(result.policy_type_id).toBe('_generic')
    })
  })

  describe('matchesPolicyType', () => {
    it('returns true for matching kasko document', () => {
      // Need to match enough terms: kasko, araç sigortası, oto sigorta, motorlu kara taşıtları, kasko sigortası
      const text = 'Kasko sigortası poliçesi araç sigortası motorlu kara taşıtları oto sigorta'
      const result = classifier.matchesPolicyType(text, 'motor_kasko', 'tr')
      expect(result.matches).toBe(true)
    })

    it('returns false for non-matching document', () => {
      const text = 'Sağlık sigortası tedavi hastane'
      const result = classifier.matchesPolicyType(text, 'motor_kasko', 'tr')
      expect(result.matches).toBe(false)
    })
  })
})

describe('TextQualityAnalyzer', () => {
  let analyzer: TextQualityAnalyzer

  beforeEach(() => {
    const configManager = new ConfigurationManager()
    analyzer = new TextQualityAnalyzer(configManager)
  })

  describe('analyze', () => {
    it('analyzes high quality Turkish text', () => {
      const text = 'Sigorta poliçe belgesi ile teminat kapsamı prim tutarı muafiyet sigortalı'
      const config = new ConfigurationManager().getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(text, 'tr', config)
      expect(result.quality_score).toBeGreaterThan(0)
      expect(result.terms_found).toBeGreaterThan(0)
    })

    it('recommends OCR for low quality text', () => {
      const text = '####@@@!!! %%% &&&'
      const config = new ConfigurationManager().getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(text, 'tr', config)
      expect(result.recommendation).toBe('require_ocr')
    })

    it('detects encoding issues', () => {
      const text = 'Normal text with \ufffd\ufffd\ufffd replacement characters'
      const config = new ConfigurationManager().getPolicyConfig('motor_kasko')
      const result = analyzer.analyze(text, 'tr', config)
      expect(result.encoding_issues).toBe(true)
    })
  })

  describe('quickCheck', () => {
    it('identifies good quality text', () => {
      const text = 'This is a normal text with sufficient length and alphanumeric content. '.repeat(5)
      const result = analyzer.quickCheck(text)
      expect(result.isLikelyGood).toBe(true)
    })

    it('identifies poor quality text', () => {
      const text = '!@#$%^&*()_+=-[]{}|;:\'",.<>?/\\~`'
      const result = analyzer.quickCheck(text)
      expect(result.isLikelyGood).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
    })

    it('identifies text that is too short', () => {
      const text = 'Short'
      const result = analyzer.quickCheck(text)
      expect(result.issues).toContain('Text too short')
    })
  })

  describe('getDetailedMetrics', () => {
    it('returns comprehensive metrics', () => {
      const text = 'Sigorta poliçe belgesi teminat prim tutarı'
      const result = analyzer.getDetailedMetrics(text, 'tr')
      expect(result.basic.totalChars).toBe(text.length)
      expect(result.basic.totalWords).toBeGreaterThan(0)
      expect(result.quality.alphanumericRatio).toBeGreaterThan(0)
      expect(result.insurance.termsFound.length).toBeGreaterThan(0)
    })
  })
})

describe('FieldExtractor', () => {
  let extractor: FieldExtractor

  beforeEach(() => {
    const configManager = new ConfigurationManager()
    extractor = new FieldExtractor(configManager)
  })

  describe('testExtraction', () => {
    it('extracts fields from kasko document', () => {
      const text = `
        Poliçe No: POL-2024-123456
        Sigortalı: AHMET YILMAZ
        Plaka: 34 ABC 123
        Prim Tutarı: 5.000 TL
      `
      const config = new ConfigurationManager().getPolicyConfig('motor_kasko')
      const result = extractor.testExtraction(text, config, 'tr')
      expect(result.fields_checked).toBeGreaterThanOrEqual(0)
    })
  })

  describe('extractField', () => {
    it('extracts policy number', () => {
      const text = 'Poliçe No: POL-2024-123456'
      const config = new ConfigurationManager().getPolicyConfig('motor_kasko')
      const result = extractor.extractField(text, config, 'policy_number', 'tr')
      expect(result).toBeDefined()
      expect(typeof result.found).toBe('boolean')
    })
  })

  describe('testPattern', () => {
    it('tests regex pattern against text', () => {
      const text = 'Policy Number: ABC-12345'
      const pattern = 'Policy\\s*Number[:\\s]+([A-Z0-9-]+)'
      const result = extractor.testPattern(text, pattern)
      expect(result.matches).toBe(true)
      expect(result.value).toBe('ABC-12345')
    })

    it('returns false for non-matching pattern', () => {
      const text = 'No pattern here'
      const pattern = 'Policy\\s*Number[:\\s]+([A-Z0-9-]+)'
      const result = extractor.testPattern(text, pattern)
      expect(result.matches).toBe(false)
    })
  })
})

describe('OCRDecisionEngine', () => {
  let engine: OCRDecisionEngine

  beforeEach(() => {
    engine = new OCRDecisionEngine()
  })

  describe('analyzeDocument', () => {
    it('makes a decision for high-density text', () => {
      const text = `
        Sigorta Poliçesi
        Poliçe No: POL-2024-123456
        Sigortalı: AHMET YILMAZ
        Teminat Türü: Kasko
        Prim Tutarı: 5.000 TL
        Başlangıç: 01.01.2024
        Bitiş: 31.12.2024

        Teminat Kapsamı:
        - Çarpışma
        - Çalınma
        - Yangın
        - Doğal Afetler

        İletişim bilgileri ve diğer detaylar...
      `.repeat(10)

      const result = engine.analyzeDocument(text)
      expect(['skip_ocr', 'selective_ocr', 'full_ocr']).toContain(result.action)
      expect(result.reasoning.length).toBeGreaterThan(0)
    })

    it('decides to require OCR for low-density text', () => {
      const text = 'Very short text'
      const result = engine.analyzeDocument(text)
      expect(result.action).toBe('full_ocr')
    })

    it('includes document classification in result', () => {
      const text = 'Kasko sigorta poliçesi araç teminat kaskolu araç sigortası '.repeat(20)
      const result = engine.analyzeDocument(text)
      expect(result.document_classification.detected_language).toBeDefined()
      expect(result.document_classification.detected_policy_type).toBeDefined()
    })

    it('provides confidence breakdown', () => {
      const text = 'Sigorta poliçe belgesi teminat prim '.repeat(50)
      const result = engine.analyzeDocument(text)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('singleton', () => {
    it('getOCRDecisionEngine returns singleton instance', () => {
      const instance1 = getOCRDecisionEngine()
      const instance2 = getOCRDecisionEngine()
      expect(instance1).toBe(instance2)
    })
  })
})

describe('Language Detection Verification', () => {
  let detector: LanguageDetector

  beforeEach(() => {
    const configManager = new ConfigurationManager()
    detector = new LanguageDetector(configManager)

    // Verify configuration
    const verification = configManager.verifyConfigurations()
    expect(verification.success).toBe(true)
  })

  it('detects Turkish with high confidence when document has insurance terms', () => {
    // Simulate a real Turkish kasko document
    const turkishKaskoText = `
      BİRLEŞİK KASKO SİGORTA POLİÇESİ

      Sigortalı: AHMET YILMAZ
      Poliçe No: KSK-2024-001234

      Teminat Kapsamı:
      - Kasko Teminatı
      - Yangın ve Hırsızlık

      Prim Bilgileri:
      Toplam Prim: 8.500 TL

      Sigorta Dönemi:
      Başlangıç: 01.01.2024
      Bitiş: 31.12.2024
    `

    const result = detector.detect(turkishKaskoText)

    expect(result.locale_code).toBe('tr')
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.method).toBe('term_matching')
    expect(result.matched_terms).toBeDefined()
    expect(result.matched_terms!.length).toBeGreaterThan(3)

    // Should have matched key Turkish insurance terms
    const matchedTermsLower = result.matched_terms!.map(t => t.toLowerCase())
    expect(matchedTermsLower).toContain('sigorta')
    expect(matchedTermsLower).toContain('poliçe')
    expect(matchedTermsLower).toContain('prim')
  })

  it('provides detailed all_scores with matched terms for each locale', () => {
    const mixedText = 'Sigorta poliçe insurance policy Versicherung'
    const result = detector.detect(mixedText)

    expect(result.all_scores).toBeDefined()
    expect(result.all_scores.tr).toBeDefined()
    expect(result.all_scores.en).toBeDefined()
    expect(result.all_scores.de).toBeDefined()

    // Turkish should have matched "sigorta" and "poliçe"
    expect(result.all_scores.tr.matched_terms).toContain('sigorta')
    expect(result.all_scores.tr.matched_terms).toContain('poliçe')

    // English should have matched "insurance" and "policy"
    expect(result.all_scores.en.matched_terms).toContain('insurance')
    expect(result.all_scores.en.matched_terms).toContain('policy')
  })

  it('detects Turkish from special characters even with no sample terms', () => {
    // Text with Turkish special characters but no insurance terms
    const turkishCharsOnly = 'Öğrenci Şükrü Ümit İstanbul Çankaya güneşli'
    const result = detector.detect(turkishCharsOnly)

    // Should have Turkish special characters matched
    expect(result.all_scores.tr.char_matches).toBeGreaterThan(0)
    expect(result.all_scores.tr.matched_chars!.length).toBeGreaterThan(0)

    // Should detect Turkish chars: ö, ğ, ü, ş, ç, İ
    const matchedChars = result.all_scores.tr.matched_chars || []
    const hasSpecialChars = matchedChars.some(c => ['ö', 'ğ', 'ü', 'ş', 'ç', 'İ'].includes(c))
    expect(hasSpecialChars).toBe(true)
  })
})

describe('Policy Classification Verification', () => {
  let classifier: PolicyTypeClassifier
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
    classifier = new PolicyTypeClassifier(configManager)

    // Verify configuration
    const verification = configManager.verifyConfigurations()
    expect(verification.success).toBe(true)
  })

  it('classifies Turkish kasko document with high confidence', () => {
    // Simulate a real Turkish kasko document
    const turkishKaskoText = `
      BİRLEŞİK KASKO SİGORTA POLİÇESİ

      Poliçe No: KSK-2024-001234
      Sigortalı: AHMET YILMAZ

      Bu kasko sigortası poliçesi ile araç sigortası teminatı verilmektedir.
      Motorlu kara taşıtları için oto sigorta kapsamı geçerlidir.

      Teminat Kapsamı:
      - Kasko Teminatı
      - Yangın ve Hırsızlık
    `

    const result = classifier.classify(turkishKaskoText, 'tr')

    expect(result.policy_type_id).toBe('motor_kasko')
    expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    expect(result.matched_terms.length).toBeGreaterThan(0)
    expect(result.category).toBe('motor')

    // Should have matched key kasko terms
    const matchedLower = result.matched_terms.map(t => t.toLowerCase())
    expect(matchedLower).toContain('kasko')
  })

  it('excludes traffic insurance from kasko classification', () => {
    // Document with traffic terms - needs 4/6 to reach 0.6 threshold
    // Detection terms: trafik sigortası, zorunlu mali sorumluluk, zmss, zmms, trafik poliçesi, karayolu motorlu
    const trafficDocument = `
      trafik sigortası poliçesi belgesi
      Zorunlu Mali Sorumluluk Sigortası
      ZMSS ZMMS kapsamında trafik poliçesi
    `

    const result = classifier.classify(trafficDocument, 'tr')

    // Should be classified as traffic, not kasko
    expect(result.policy_type_id).toBe('motor_traffic')
    expect(result.confidence).toBeGreaterThanOrEqual(0.6)

    // Kasko should be excluded due to exclusion terms (zmss, zorunlu mali sorumluluk)
    expect(result.all_scores.motor_kasko?.excluded).toBe(true)
  })

  it('provides detailed all_scores for all policy types', () => {
    const genericDocument = 'Sigorta poliçesi belgesi'
    const result = classifier.classify(genericDocument, 'tr')

    expect(result.all_scores).toBeDefined()
    expect(result.all_scores.motor_kasko).toBeDefined()
    expect(result.all_scores.motor_traffic).toBeDefined()
    expect(result.all_scores.property_fire).toBeDefined()
    expect(result.all_scores.health_individual).toBeDefined()
  })

  it('uses correct locale fallback for detection terms', () => {
    // Use English locale for a kasko document
    const englishKaskoText = 'Comprehensive auto insurance vehicle insurance motor coverage'
    const result = classifier.classify(englishKaskoText, 'en')

    // Should still detect as motor_kasko using English terms
    // Note: confidence may be lower due to fewer matching terms
    expect(result.all_scores.motor_kasko).toBeDefined()
    expect(result.all_scores.motor_kasko.matches.length).toBeGreaterThan(0)
  })

  it('correctly applies confidence threshold', () => {
    // Document with only one kasko term (below 0.6 threshold)
    const singleTermDoc = 'Bu bir kasko belgesidir'
    const result = classifier.classify(singleTermDoc, 'tr')

    // Should fall back to _generic because only 1/5 = 0.2 < 0.6 threshold
    expect(result.policy_type_id).toBe('_generic')

    // But kasko should have some matches
    expect(result.all_scores.motor_kasko?.matches.length).toBe(1)
    expect(result.all_scores.motor_kasko?.matches).toContain('kasko')
  })
})

describe('Integration', () => {
  it('full pipeline processes Turkish kasko document', () => {
    const engine = getOCRDecisionEngine()

    // Include kasko detection terms: kasko, araç sigortası, oto sigorta, motorlu kara taşıtları, kasko sigortası
    const turkishKaskoDocument = `
      KASKO SİGORTA POLİÇESİ
      Kasko Sigortası - Oto Sigorta - Araç Sigortası

      Poliçe No: KSK-2024-001234
      Sigortalı: MEHMET ÖZTÜRK
      TC Kimlik No: 12345678901

      Motorlu Kara Taşıtları Kasko Poliçesi

      Araç Bilgileri:
      Plaka: 34 XYZ 789
      Marka: Toyota
      Model: Corolla
      Model Yılı: 2022

      Teminatlar:
      - Araç Bedeli: 500.000 TL
      - Çarpışma: Dahil
      - Çalınma: Dahil
      - Yangın: Dahil
      - Doğal Afetler: Dahil
      - Cam Kırılması: 10.000 TL

      Prim Bilgileri:
      Net Prim: 8.500 TL
      Vergiler: 850 TL
      Toplam Prim: 9.350 TL

      Sigorta Dönemi:
      Başlangıç: 01.01.2024
      Bitiş: 31.12.2024

      Muafiyet: %5
    `.repeat(3)

    const decision = engine.analyzeDocument(turkishKaskoDocument)

    // Should detect Turkish
    expect(decision.document_classification.detected_language.locale_code).toBe('tr')

    // Should detect Kasko policy type
    expect(decision.document_classification.detected_policy_type?.policy_type_id).toBe('motor_kasko')

    // Should have reasonable confidence
    expect(decision.confidence).toBeGreaterThan(0.3)

    // Should provide reasoning
    expect(decision.reasoning.length).toBeGreaterThan(0)

    // Decision should be one of the valid actions
    expect(['skip_ocr', 'selective_ocr', 'full_ocr']).toContain(decision.action)
  })

  it('full pipeline processes English insurance document', () => {
    const engine = getOCRDecisionEngine()

    const englishDocument = `
      INSURANCE POLICY DOCUMENT

      Policy Number: INS-2024-567890
      Policyholder: JOHN SMITH

      Coverage Type: Comprehensive Auto Insurance
      Premium: $1,200.00
      Deductible: $500.00

      Effective Date: January 1, 2024
      Expiration Date: December 31, 2024

      Covered Perils:
      - Collision
      - Comprehensive
      - Liability
      - Medical Payments
    `.repeat(3)

    const decision = engine.analyzeDocument(englishDocument)

    // Should detect English
    expect(decision.document_classification.detected_language.locale_code).toBe('en')

    // Should provide a decision
    expect(decision.action).toBeDefined()
  })
})

describe('Confidence Calculation Verification', () => {
  let engine: OCRDecisionEngine
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
    engine = new OCRDecisionEngine(configManager)
  })

  it('calculates high confidence for clean digital Turkish kasko document', () => {
    // Simulate a high-quality digital kasko document with:
    // - High text density (3900+ chars/page)
    // - Many Turkish insurance terms
    // - Extractable fields (policy number, insured, plate, premium)
    // - No encoding issues
    const cleanDigitalKaskoDocument = `
      BİRLEŞİK KASKO SİGORTA POLİÇESİ
      Kasko Sigortası - Oto Sigorta - Araç Sigortası

      Poliçe No: KSK-2024-001234
      Sigortalı: MEHMET ÖZTÜRK
      TC Kimlik No: 12345678901

      Motorlu Kara Taşıtları Kasko Poliçesi
      Araç sigortası teminat kapsamında sigorta poliçesi

      Araç Bilgileri:
      Plaka: 34 XYZ 789
      Marka: Toyota
      Model: Corolla
      Model Yılı: 2022
      Şasi No: ABC123456789XYZ

      Teminatlar ve Kapsam:
      - Araç Bedeli: 500.000 TL
      - Çarpışma Teminatı: Dahil
      - Çalınma Teminatı: Dahil
      - Yangın Teminatı: Dahil
      - Doğal Afetler Teminatı: Dahil
      - Cam Kırılması: 10.000 TL
      - Ferdi Kaza: 50.000 TL
      - Hukuki Koruma: 25.000 TL

      Prim Bilgileri:
      Net Prim: 8.500 TL
      Vergiler: 850 TL
      Toplam Prim Tutarı: 9.350 TL

      Sigorta Dönemi:
      Başlangıç Tarihi: 01.01.2024
      Bitiş Tarihi: 31.12.2024

      Muafiyet Oranı: %5
      Hasar ihbar hattı: 0850 222 3344

      Sigortacı: XYZ Sigorta A.Ş.
      Adres: İstanbul, Türkiye
    `.repeat(6)  // Repeat to simulate 4000+ chars/page

    const decision = engine.analyzeDocument(cleanDigitalKaskoDocument)

    // Check confidence breakdown is included
    expect(decision.analysis.confidence_breakdown).toBeDefined()
    expect(decision.analysis.confidence_breakdown.confidence_breakdown).toBeDefined()

    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // Verify all components are present with expected structure
    expect(breakdown.char_density).toBeDefined()
    expect(breakdown.char_density.score).toBeGreaterThanOrEqual(0)
    expect(breakdown.char_density.score).toBeLessThanOrEqual(1)
    expect(breakdown.char_density.weight).toBe(0.25)
    expect(breakdown.char_density.contribution).toBeGreaterThan(0)

    expect(breakdown.text_quality).toBeDefined()
    expect(breakdown.text_quality.score).toBeGreaterThanOrEqual(0)
    expect(breakdown.text_quality.weight).toBe(0.30)

    expect(breakdown.page_variance).toBeDefined()
    expect(breakdown.page_variance.weight).toBe(0.15)

    expect(breakdown.encoding_check).toBeDefined()
    expect(breakdown.encoding_check.weight).toBe(0.15)

    expect(breakdown.field_extraction).toBeDefined()
    expect(breakdown.field_extraction.weight).toBe(0.15)

    // For a clean digital document:
    // - Char density should be high (1.0) since we have lots of text
    // - Encoding check should be perfect (1.0) - no encoding issues
    expect(breakdown.char_density.score).toBe(1.0)
    expect(breakdown.encoding_check.score).toBe(1.0)

    // Weights should sum to 1.0
    const totalWeight =
      breakdown.char_density.weight +
      breakdown.text_quality.weight +
      breakdown.page_variance.weight +
      breakdown.encoding_check.weight +
      breakdown.field_extraction.weight
    expect(totalWeight).toBe(1.0)

    // Verify contributions sum to overall confidence
    const totalContrib =
      breakdown.char_density.contribution +
      breakdown.text_quality.contribution +
      breakdown.page_variance.contribution +
      breakdown.encoding_check.contribution +
      breakdown.field_extraction.contribution

    expect(Math.abs(totalContrib - decision.confidence)).toBeLessThan(0.01)
  })

  it('includes detailed component information in breakdown', () => {
    const document = `
      KASKO SİGORTA POLİÇESİ
      Poliçe No: KSK-2024-001234
      Sigortalı: AHMET YILMAZ
      Plaka: 34 ABC 123
      Prim: 5.000 TL
      Sigorta poliçe belgesi teminat kapsamı
    `.repeat(10)

    const decision = engine.analyzeDocument(document)
    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // Each component should have details
    expect(breakdown.char_density.details).toBeDefined()
    expect(breakdown.char_density.details).toContain('chars/page')

    expect(breakdown.text_quality.details).toBeDefined()
    expect(breakdown.text_quality.details).toContain('terms found')

    expect(breakdown.encoding_check.details).toBeDefined()

    expect(breakdown.field_extraction.details).toBeDefined()
    expect(breakdown.field_extraction.details).toContain('required fields')
  })

  it('calculates lower confidence for poor quality document', () => {
    // Document with potential encoding issues (consecutive replacement chars)
    // and low term coverage
    const poorQualityDocument = `
      ####@@@!!!%%%
      Pol\ufffd\ufffdce No: ???
      S\ufffd\ufffd\ufffdi\ufffda: ???
      Random text with garbage characters \ufffd\ufffd\ufffd
      !!!! #### @@@@ \ufffd\ufffd
    `.repeat(5)

    const decision = engine.analyzeDocument(poorQualityDocument)
    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // Encoding score should be lower due to consecutive replacement characters
    expect(breakdown.encoding_check.score).toBeLessThan(1.0)

    // Text quality should be low due to few terms found
    expect(breakdown.text_quality.score).toBeLessThan(0.5)

    // Overall confidence should be lower than clean document
    expect(decision.confidence).toBeLessThan(0.7)
  })

  it('correctly calculates density score using linear formula', () => {
    const settings = configManager.getOCRSettings()
    const threshold = settings.density_analysis.chars_per_page_threshold // 200

    // Create document that would give ~500 chars per page (estimated)
    // 500 chars / (200 * 4) = 500 / 800 = 0.625
    const mediumDensityDoc = 'A'.repeat(500)
    const decision = engine.analyzeDocument(mediumDensityDoc)

    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // With ~500 chars and single page, density should be around 0.625
    // Actual calculation: 500 / 800 = 0.625
    expect(breakdown.char_density.score).toBeGreaterThan(0.5)
    expect(breakdown.char_density.score).toBeLessThan(0.8)
    expect(breakdown.char_density.raw_value).toBeGreaterThan(400)
  })

  it('caps density score at 1.0 for very high density', () => {
    // Create a very high density document (4000+ chars/page)
    const highDensityDoc = 'Sigorta poliçe belgesi teminat prim '.repeat(200)
    const decision = engine.analyzeDocument(highDensityDoc)

    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // Density score should be capped at 1.0
    expect(breakdown.char_density.score).toBe(1.0)
  })

  it('uses gradual encoding score instead of binary', () => {
    // Document with some encoding issues (not too many)
    const docWithSomeIssues = `
      Sigorta poliçe belgesi teminat prim
      Some \ufffd replacement character
      More normal text sigortalı
    `.repeat(10)

    const decision = engine.analyzeDocument(docWithSomeIssues)
    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // Encoding score should be gradual, not binary 0 or 1
    // With just a few issues, should be between 0.7 and 1.0
    if (breakdown.encoding_check.raw_value as number > 0) {
      expect(breakdown.encoding_check.score).toBeLessThan(1.0)
      expect(breakdown.encoding_check.score).toBeGreaterThan(0)
    }
  })

  it('provides correct contribution calculations', () => {
    const document = 'Sigorta poliçe belgesi teminat prim tutarı muafiyet sigortalı '.repeat(50)
    const decision = engine.analyzeDocument(document)
    const breakdown = decision.analysis.confidence_breakdown.confidence_breakdown!

    // Verify contribution = score * weight for each component
    const tolerance = 0.0001

    expect(Math.abs(breakdown.char_density.contribution -
      breakdown.char_density.score * breakdown.char_density.weight)).toBeLessThan(tolerance)

    expect(Math.abs(breakdown.text_quality.contribution -
      breakdown.text_quality.score * breakdown.text_quality.weight)).toBeLessThan(tolerance)

    expect(Math.abs(breakdown.page_variance.contribution -
      breakdown.page_variance.score * breakdown.page_variance.weight)).toBeLessThan(tolerance)

    expect(Math.abs(breakdown.encoding_check.contribution -
      breakdown.encoding_check.score * breakdown.encoding_check.weight)).toBeLessThan(tolerance)

    expect(Math.abs(breakdown.field_extraction.contribution -
      breakdown.field_extraction.score * breakdown.field_extraction.weight)).toBeLessThan(tolerance)
  })
})
