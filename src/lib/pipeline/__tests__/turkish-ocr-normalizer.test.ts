/**
 * Unit tests for Turkish OCR Normalizer
 *
 * Tests deterministic normalization rules:
 * 1. Drop garbage lines (B^^^B, >50% non-alphanumeric)
 * 2. Merge spaced letters (G E N İ Ş → GENİŞ)
 * 3. Merge spaced syllables (GEN İŞ → GENİŞ)
 * 4. Preserve numbers, dates, plates, VIN, emails
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeTurkishOcr,
  normalizeTurkishOcrWithStats,
  needsNormalization,
} from '../turkish-ocr-normalizer'

describe('normalizeTurkishOcr', () => {
  describe('Spaced Letter Merging', () => {
    it('should merge spaced uppercase letters: G E N İ Ş → GENİŞ', () => {
      const input = 'G E N İ Ş'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('GENİŞ')
    })

    it('should merge spaced letters in SÖZLEŞME', () => {
      const input = 'S Ö Z L E Ş M E'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('SÖZLEŞME')
    })

    it('should merge spaced letters in POLİÇE', () => {
      const input = 'P O L İ Ç E'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('POLİÇE')
    })

    it('should merge spaced letters in TEMİNAT', () => {
      const input = 'T E M İ N A T'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('TEMİNAT')
    })
  })

  describe('Spaced Syllable Merging', () => {
    it('should merge spaced syllables: GEN İŞ LETİLM İŞ → GENİŞLETİLMİŞ', () => {
      const input = 'GEN İŞ LETİLM İŞ'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('GENİŞLETİLMİŞ')
    })

    it('should merge spaced syllables in SİGORTA', () => {
      const input = 'SİG OR TA'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('SİGORTA')
    })

    it('should merge spaced syllables in KASKO', () => {
      const input = 'KAS KO'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('KASKO')
    })
  })

  describe('Known Word Fixes', () => {
    it('should fix GENİŞLETİLMİŞ with various spacing', () => {
      const input = 'G E N İ Ş L E T İ L M İ Ş'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('GENİŞLETİLMİŞ')
    })

    it('should fix SÖZLEŞME', () => {
      const input = 'S Ö ZLE Ş ME'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('SÖZLEŞME')
    })

    it('should fix MUAFİYET', () => {
      const input = 'M U A F İ Y E T'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('MUAFİYET')
    })

    it('should fix HASAR', () => {
      const input = 'H A S A R'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('HASAR')
    })
  })

  describe('Preservation of Important Patterns', () => {
    it('should preserve license plates: 34 RZ9511', () => {
      const input = '34 RZ9511'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('34')
      expect(output).toMatch(/34\s*RZ\s*9511/)
    })

    it('should preserve license plates: 06 AB 123', () => {
      const input = 'Araç Plakası: 06 AB 123'
      const output = normalizeTurkishOcr(input)
      expect(output).toMatch(/06\s*AB\s*123/)
    })

    it('should preserve VIN numbers (17 chars)', () => {
      const input = 'Şasi No: WVWZZZ3CZWE123456'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('WVWZZZ3CZWE123456')
    })

    it('should preserve dates: DD.MM.YYYY', () => {
      const input = 'Başlangıç: 15.01.2026'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('15.01.2026')
    })

    it('should preserve dates: DD/MM/YYYY', () => {
      const input = 'Tarih: 25/12/2025'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('25/12/2025')
    })

    it('should preserve policy numbers (7+ digits)', () => {
      const input = 'Poliçe No: 1234567890'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('1234567890')
    })

    it('should preserve email addresses', () => {
      const input = 'Email: test@example.com'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('test@example.com')
    })

    it('should preserve phone numbers', () => {
      const input = 'Tel: +90 532 123 45 67'
      const output = normalizeTurkishOcr(input)
      expect(output).toMatch(/\+90.*532.*123.*45.*67/)
    })

    it('should preserve TC Kimlik numbers (11 digits)', () => {
      const input = 'TC Kimlik: 12345678901'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('12345678901')
    })

    it('should preserve IBAN numbers', () => {
      const input = 'IBAN: TR12 0001 0002 0003 0004 0005 06'
      const output = normalizeTurkishOcr(input)
      expect(output).toMatch(/TR12/)
    })

    it('should preserve currency amounts', () => {
      const input = 'Prim: 15.000,00 TL'
      const output = normalizeTurkishOcr(input)
      expect(output).toMatch(/15.*000.*TL/)
    })
  })

  describe('Garbage Line Removal', () => {
    it('should remove lines containing B^^^B pattern', () => {
      const input = 'Normal line\nB^^^B garbage line\nAnother normal line'
      const output = normalizeTurkishOcr(input)
      expect(output).not.toContain('B^^^B')
      expect(output).toContain('Normal line')
      expect(output).toContain('Another normal line')
    })

    it('should remove lines with block characters', () => {
      const input = 'POLİÇE BİLGİLERİ\n█████████████\nAdı: Test Kişi'
      const output = normalizeTurkishOcr(input)
      expect(output).not.toContain('█████')
      expect(output).toContain('POLİÇE')
      expect(output).toContain('Adı')
    })

    it('should remove lines with >50% non-alphanumeric', () => {
      const input = 'Valid text\n@#$%^&*()!@#$%\nMore valid text'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('Valid text')
      expect(output).toContain('More valid text')
    })

    it('should keep empty lines for structure', () => {
      const input = 'Line 1\n\nLine 2'
      const output = normalizeTurkishOcr(input)
      expect(output).toContain('Line 1')
      expect(output).toContain('Line 2')
    })
  })

  describe('Complex Documents', () => {
    it('should handle a realistic policy excerpt', () => {
      const input = `
K A S K O  S İ G O R T A  P O L İ Ç E S İ
Poliçe No: 1234567890
Araç Plakası: 34 ABC 123
Şasi No: WVWZZZ3CZWE123456
B^^^B corrupt data here
T E M İ N A T L A R
- Çarpma/Çarpışma
- Hırsızlık
PRİM: 15.000,00 TL
      `.trim()

      const output = normalizeTurkishOcr(input)

      // Check spaced words are merged
      expect(output).toContain('KASKO')
      expect(output).toContain('SİGORTA')
      expect(output).toContain('POLİÇE')
      expect(output).toContain('TEMİNAT')

      // Check preserved patterns
      expect(output).toContain('1234567890')
      expect(output).toContain('WVWZZZ3CZWE123456')

      // Check garbage removed
      expect(output).not.toContain('B^^^B')
    })

    it('should handle mixed content with preservation', () => {
      const input = `
S İ G O R T A L I  BİLGİLERİ
Ad Soyad: AHMET YILMAZ
TC Kimlik: 12345678901
Email: ahmet@test.com

A R A Ç  BİLGİLERİ
Plaka: 34 XY 7890
Marka: V O L K S W A G E N
      `.trim()

      const output = normalizeTurkishOcr(input)

      expect(output).toContain('SİGORTALI')
      expect(output).toContain('BİLGİLERİ')
      expect(output).toContain('12345678901')
      expect(output).toContain('ahmet@test.com')
      expect(output).toContain('ARAÇ')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const output = normalizeTurkishOcr('')
      expect(output).toBe('')
    })

    it('should handle whitespace-only input', () => {
      const output = normalizeTurkishOcr('   \n   \n   ')
      // Preserves line structure but trims each line
      expect(output.trim()).toBe('')
    })

    it('should handle single word without spacing', () => {
      const input = 'KASKO'
      const output = normalizeTurkishOcr(input)
      expect(output).toBe('KASKO')
    })

    it('should not merge lowercase letters', () => {
      const input = 'a b c d e'
      const output = normalizeTurkishOcr(input)
      // Should not merge as they are lowercase
      expect(output).toBe('a b c d e')
    })

    it('should handle mixed case preserving numbers', () => {
      const input = 'A 1 B 2 C 3'
      const output = normalizeTurkishOcr(input)
      // Numbers break the letter sequence
      expect(output).toContain('1')
      expect(output).toContain('2')
      expect(output).toContain('3')
    })
  })
})

describe('normalizeTurkishOcrWithStats', () => {
  it('should return stats along with normalized text', () => {
    const input = `
G E N İ Ş  TEMİNAT
B^^^B garbage
Poliçe: 1234567890
    `.trim()

    const { text, stats } = normalizeTurkishOcrWithStats(input)

    expect(text).toContain('GENİŞ')
    expect(text).toContain('1234567890')
    expect(text).not.toContain('B^^^B')

    expect(stats.linesDropped).toBeGreaterThanOrEqual(1)
    expect(stats.originalLength).toBeGreaterThan(stats.normalizedLength)
    expect(stats.preservedTokens).toBeGreaterThanOrEqual(1) // Policy number
  })

  it('should track words fixed count', () => {
    const input = 'G E N İ Ş L E T İ L M İ Ş KASKO'
    const { stats } = normalizeTurkishOcrWithStats(input)
    expect(stats.wordsFixed).toBeGreaterThanOrEqual(1)
  })
})

describe('needsNormalization', () => {
  it('should return true for text with spaced Turkish letters', () => {
    expect(needsNormalization('G E N İ Ş')).toBe(true)
    expect(needsNormalization('K A S K O')).toBe(true)
  })

  it('should return true for text with garbage patterns', () => {
    expect(needsNormalization('Text with B^^^B pattern')).toBe(true)
  })

  it('should return true for text with known word patterns', () => {
    expect(needsNormalization('S İ G O R T A')).toBe(true)
    expect(needsNormalization('P O L İ Ç E')).toBe(true)
  })

  it('should return false for clean text', () => {
    // Text that doesn't contain any known Turkish insurance terms
    // or spaced letter patterns
    expect(needsNormalization('Normal text without issues')).toBe(false)
    expect(needsNormalization('Bu bir test cümlesidir.')).toBe(false)
  })

  it('should return false for empty text', () => {
    expect(needsNormalization('')).toBe(false)
  })
})
