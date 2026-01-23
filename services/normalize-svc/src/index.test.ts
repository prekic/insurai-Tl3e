/**
 * Normalize Service Tests
 *
 * Tests the deterministic normalization engine that:
 * - Applies Unicode normalization (NFKC)
 * - Normalizes whitespace
 * - Applies split letter merge patterns
 * - Applies custom rules (garbage removal, word splitting)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Normalizer, type NormalizeOptions } from './index'

// Mock locale rule pack for Turkish (matches LocaleRulePack type)
const turkishLocalePack = {
  id: 'tr-TR',
  type: 'locale' as const,
  locale: 'tr-TR',
  version: '1.0.0',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalization: {
    unicode: ['NFKC'],
    whitespace: {
      collapseRuns: true,
      preserveParagraphs: true,
      trimLines: true,
    },
    splitLetterMerge: {
      enabled: true,
      patterns: [
        // Match single-letter-spaced words and merge them
        { regex: '([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])', action: 'mergeRemoveSpaces' as const },
        { regex: '([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])', action: 'mergeRemoveSpaces' as const },
        { regex: '([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])\\s+([A-ZÇĞİÖŞÜ])', action: 'mergeRemoveSpaces' as const },
      ],
    },
    numberCanonicalization: {
      decimalSeparator: ',',
      thousandSeparator: '.',
      outputDecimalSeparator: '.',
      preserveOriginal: true,
    },
    customRules: [
      // Garbage removal
      { id: 'barcode-b', name: 'Barcode B', pattern: 'B[\\^<>]+B[^\\s\\n]*', replacement: '', flags: 'g', order: 200 },
      { id: 'barcode-a', name: 'Barcode A', pattern: 'a!{2,}[aA!]*', replacement: '', flags: 'g', order: 200 },
      { id: 'punct-runs', name: 'Punctuation Runs', pattern: '[!^~_<>|]{3,}[^\\s\\n]*', replacement: '', flags: 'g', order: 200 },
      // Glued word splitting
      { id: 'sigortasirket', name: 'Sigorta Sirket', pattern: 'Sigorta([şŞ])irket', replacement: 'Sigorta Şirket', flags: 'gi', order: 50 },
      { id: 'hususiotomobil', name: 'Hususi Otomobil', pattern: 'HUSUSİOTOMOBİL', replacement: 'HUSUSİ OTOMOBİL', flags: 'g', order: 60 },
    ],
  },
  validators: {
    date: [{ format: 'DD.MM.YYYY', strict: true }],
    currency: [{ code: 'TRY', symbols: ['TL', '₺'] }],
  },
}

// Mock policy rule pack (matches PolicyRulePack type)
const kaskoPolicyPack = {
  id: 'motor_kasko_tr',
  type: 'policy' as const,
  policyType: 'motor_kasko',
  locales: ['tr-TR'],
  version: '1.0.0',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  classifiers: {
    keywordsAny: ['kasko', 'sigorta'],
    keywordsStrong: ['kasko sigortası', 'araç sigortası'],
  },
  validators: {
    'vehicle.plate': [{ regex: '^\\d{2}\\s?[A-Z]{1,3}\\s?\\d{1,4}$', severity: 'error' as const }],
  },
  extractionTargets: ['vehicle.plate', 'vehicle.vin', 'policy.policyNo'],
}

describe('Normalizer', () => {
  let normalizer: Normalizer

  beforeEach(() => {
    normalizer = new Normalizer({
      localePack: turkishLocalePack as any,
      policyPack: kaskoPolicyPack as any,
      docId: 'test-doc-001',
      preserveEvidence: true,
    })
  })

  describe('Unicode Normalization', () => {
    it('should apply NFKC normalization', () => {
      // NFKC normalizes compatibility characters
      const input = 'ﬁle' // fi ligature
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toContain('fi')
    })

    it('should preserve Turkish İ and ı correctly', () => {
      const input = 'İstanbul'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toBe('İstanbul')
    })
  })

  describe('Whitespace Normalization', () => {
    it('should collapse multiple spaces', () => {
      const input = 'Hello    World'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toBe('Hello World')
    })

    it('should trim line whitespace', () => {
      const input = '  Line1  \n  Line2  '
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toContain('Line1')
      expect(result.normalizedText).toContain('Line2')
    })

    it('should normalize line breaks', () => {
      const input = 'Line1\r\nLine2\rLine3\nLine4'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toContain('Line1')
      expect(result.normalizedText).toContain('Line2')
      expect(result.normalizedText).toContain('Line3')
      expect(result.normalizedText).toContain('Line4')
    })
  })

  describe('Split Letter Merging', () => {
    it('should merge 5-letter spaced words: K A S K O', () => {
      const input = 'K A S K O'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toBe('KASKO')
    })

    it('should merge 6-letter spaced words: K A S K O S', () => {
      const input = 'S İ G O R T'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).not.toContain(' ')
    })

    it('should merge 7-letter spaced words', () => {
      const input = 'S İ G O R T A'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toBe('SİGORTA')
    })
  })

  describe('Garbage Artifact Removal', () => {
    it('should remove B^^^B barcode artifacts', () => {
      const input = 'Valid text B^^^Bgarbage more text'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).not.toContain('B^^^B')
      expect(result.normalizedText).toContain('Valid text')
      expect(result.normalizedText).toContain('more text')
    })

    it('should remove a!!!a barcode artifacts', () => {
      const input = 'Normal a!!!!!a garbage text'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).not.toContain('a!!!!!')
      expect(result.normalizedText).toContain('Normal')
      expect(result.normalizedText).toContain('text')
    })

    it('should remove punctuation runs', () => {
      const input = 'Text !!!!>>> garbage ~~~~stuff normal'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toContain('Text')
      expect(result.normalizedText).toContain('normal')
    })

    it('should preserve valid punctuation', () => {
      const input = 'Hello! How are you?'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toBe('Hello! How are you?')
    })
  })

  describe('Glued Word Splitting', () => {
    it('should split Sigortaşirket → Sigorta Şirket', () => {
      const input = 'Sigortaşirket Adı'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toContain('Sigorta Şirket')
    })

    it('should split HUSUSİOTOMOBİL → HUSUSİ OTOMOBİL', () => {
      const input = 'HUSUSİOTOMOBİL'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toBe('HUSUSİ OTOMOBİL')
    })
  })

  describe('Transform Tracking', () => {
    it('should generate transforms array', () => {
      const input = 'Hello World'
      const result = normalizer.normalize(input)

      expect(result.transforms).toBeDefined()
      expect(Array.isArray(result.transforms)).toBe(true)
    })

    it('should include applied rules in transforms', () => {
      const input = 'B^^^Bgarbage text'
      const result = normalizer.normalize(input)

      expect(result.transforms.length).toBeGreaterThan(0)
      const transform = result.transforms[0]
      expect(transform.appliedRules).toBeDefined()
    })
  })

  describe('Reading Order Blocks', () => {
    it('should extract reading order blocks', () => {
      const input = 'Paragraph 1\n\nParagraph 2'
      const result = normalizer.normalize(input)

      expect(result.readingOrderBlocks).toBeDefined()
      expect(result.readingOrderBlocks.length).toBeGreaterThan(0)
    })

    it('should assign block types', () => {
      const input = 'HEADING\n\nNormal paragraph text'
      const result = normalizer.normalize(input)

      const headingBlock = result.readingOrderBlocks.find(b => b.type === 'heading')
      expect(headingBlock).toBeDefined()
    })
  })

  describe('Evidence Index', () => {
    it('should build evidence index', () => {
      const input = 'Hello World Test'
      const result = normalizer.normalize(input)

      expect(result.evidenceIndex).toBeDefined()
      expect(result.evidenceIndex.tokens).toBeDefined()
      expect(result.evidenceIndex.tokens.length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = normalizer.normalize('')
      expect(result.normalizedText).toBe('')
    })

    it('should handle input with only whitespace', () => {
      const result = normalizer.normalize('   \n\t   ')
      expect(result.normalizedText.trim()).toBe('')
    })

    it('should handle input with only garbage', () => {
      const input = 'B^^^Bgarbage a!!!!!a'
      const result = normalizer.normalize(input)
      // Garbage should be removed
      expect(result.normalizedText.trim().length).toBeLessThan(input.length)
    })

    it('should handle special characters', () => {
      const input = '₺15.000 %50 @email #tag'
      const result = normalizer.normalize(input)
      expect(result.normalizedText).toContain('₺')
      expect(result.normalizedText).toContain('%')
    })
  })

  describe('Real World Input', () => {
    it('should process simple OCR output', () => {
      const input = 'Sigortaşirket Adı: Test A.Ş.'
      const result = normalizer.normalize(input)

      expect(result.normalizedText).toContain('Sigorta Şirket')
      expect(result.normalizedText).toContain('Test A.Ş.')
    })

    it('should handle mixed garbage and valid text', () => {
      const input = 'Valid text B^^^Bgarbage more valid text'
      const result = normalizer.normalize(input)

      expect(result.normalizedText).toContain('Valid text')
      expect(result.normalizedText).toContain('more valid text')
      expect(result.normalizedText).not.toContain('B^^^B')
    })
  })
})

describe('Normalizer without policy pack', () => {
  it('should work with only locale pack', () => {
    const normalizer = new Normalizer({
      localePack: turkishLocalePack as any,
      docId: 'test-doc-002',
    })

    const result = normalizer.normalize('Hello World')
    expect(result.normalizedText).toBe('Hello World')
  })
})
