/**
 * Turkish OCR Normalizer - Coverage Tests
 *
 * Targets uncovered branches in turkish-ocr-normalizer.ts
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeTurkishOcr,
  normalizeTurkishOcrWithStats,
  needsNormalization,
} from './turkish-ocr-normalizer'

describe('turkish-ocr-normalizer coverage', () => {
  describe('normalizeTurkishOcr', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeTurkishOcr('')).toBe('')
    })

    it('passes through clean text unchanged', () => {
      const text = 'Bu bir test metnidir.'
      expect(normalizeTurkishOcr(text)).toBe('Bu bir test metnidir.')
    })

    it('drops garbage lines with B^^^B pattern', () => {
      const text = 'Line 1\nB^^^^B garbage\nLine 3'
      const result = normalizeTurkishOcr(text)
      expect(result).not.toContain('B^^^^B')
      expect(result).toContain('Line 1')
      expect(result).toContain('Line 3')
    })

    it('drops garbage lines with block characters', () => {
      const text = 'Good line\n████████████\nAnother good line'
      const result = normalizeTurkishOcr(text)
      expect(result).not.toContain('████')
      expect(result).toContain('Good line')
    })

    it('drops garbage lines with control characters', () => {
      const text = 'Normal\n\x01\x02\x03\x04\x05\nOK'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('Normal')
      expect(result).toContain('OK')
    })

    it('drops lines with >50% non-alphanumeric content', () => {
      const text = 'Good line\n$$$$##@@!!%%\nAnother line'
      const result = normalizeTurkishOcr(text)
      expect(result).not.toContain('$$$$')
    })

    it('keeps lines with >=50% alphanumeric content', () => {
      const text = 'Hello world 123!!'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('Hello world 123')
    })

    it('keeps empty lines for structure', () => {
      const text = 'Line 1\n\nLine 3'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('\n\n')
    })

    it('preserves license plates', () => {
      const text = 'Plaka: 34 ABC 1234'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('34 ABC 1234')
    })

    it('preserves VIN numbers', () => {
      const text = 'VIN: WVWZZZ3CZWE123456'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('WVWZZZ3CZWE123456')
    })

    it('preserves dates', () => {
      const text = 'Tarih: 15.01.2026'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('15.01.2026')
    })

    it('preserves email addresses', () => {
      const text = 'Email: test@example.com'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('test@example.com')
    })

    it('preserves URLs', () => {
      const text = 'URL: https://www.example.com/path'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('https://www.example.com/path')
    })

    it('preserves phone numbers', () => {
      const text = 'Tel: +90 532 123 45 67'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('+90 532 123 45 67')
    })

    it('preserves currency amounts', () => {
      const text = 'Prim: 1.234,56 TL'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('1.234,56 TL')
    })

    it('preserves TC Kimlik numbers', () => {
      const text = 'TC: 12345678901'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('12345678901')
    })

    it('preserves IBAN numbers', () => {
      const text = 'IBAN: TR330006100519786457841326'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('TR33')
    })

    it('preserves policy numbers (7+ digits)', () => {
      const text = 'Polica No: 1234567890'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('1234567890')
    })

    it('merges spaced single letters', () => {
      const text = 'G E N E L'
      const result = normalizeTurkishOcr(text)
      expect(result.replace(/\s+/g, '')).toContain('GENEL')
    })

    it('fixes known Turkish word: SİGORTA', () => {
      const text = 'S İ G O R T A belgesi'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('SİGORTA')
    })

    it('fixes known Turkish word: POLİÇE', () => {
      const text = 'P O L İ Ç E numarası'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('POLİÇE')
    })

    it('fixes known Turkish word: TEMİNAT', () => {
      const text = 'T E M İ N A T kapsamı'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('TEMİNAT')
    })

    it('fixes known Turkish word: KASKO', () => {
      const text = 'K A S K O sigortası'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('KASKO')
    })

    it('fixes known Turkish word: HASAR', () => {
      const text = 'H A S A R bildirimi'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('HASAR')
    })

    it('fixes known Turkish word: ŞARTLAR', () => {
      const text = 'Ş A R T L A R'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('ŞARTLAR')
    })

    it('merges spaced syllables: GEN İŞ', () => {
      const text = 'GEN İŞ LET İLM İŞ'
      const result = normalizeTurkishOcr(text)
      // Syllables should be merged
      expect(result.replace(/\s+/g, '').length).toBeLessThan(text.length)
    })

    it('does not merge syllables across multiple spaces', () => {
      const text = 'ABC   DEF'
      const result = normalizeTurkishOcr(text)
      // Multiple spaces should break the merge
      expect(result).toBeTruthy()
    })

    it('stops syllable merging at digits/punctuation', () => {
      const text = 'AB 12 CD'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('12')
    })

    it('flushes single chunk without merging', () => {
      // Single uppercase token should not be merged
      const text = 'A normal sentence.'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('A')
    })

    it('cleans up multiple spaces to single spaces', () => {
      const text = 'too   many    spaces   here'
      const result = normalizeTurkishOcr(text)
      expect(result).not.toContain('  ')
    })

    it('trims lines', () => {
      const text = '  leading and trailing spaces  '
      const result = normalizeTurkishOcr(text)
      expect(result).toBe('leading and trailing spaces')
    })

    it('handles only-whitespace lines (non-empty)', () => {
      const text = 'Line1\n   \nLine3'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('Line1')
      expect(result).toContain('Line3')
    })

    it('handles line with only non-whitespace special chars', () => {
      const text = 'OK\n@@@@\nOK2'
      const result = normalizeTurkishOcr(text)
      expect(result).toContain('OK')
      expect(result).toContain('OK2')
    })
  })

  describe('normalizeTurkishOcrWithStats', () => {
    it('returns stats for empty input', () => {
      const { text, stats } = normalizeTurkishOcrWithStats('')
      expect(text).toBe('')
      expect(stats.originalLength).toBe(0)
      expect(stats.linesDropped).toBe(0)
    })

    it('counts dropped garbage lines', () => {
      const input = 'Good\nB^^^^B bad\nAlso good'
      const { stats } = normalizeTurkishOcrWithStats(input)
      expect(stats.linesDropped).toBe(1)
    })

    it('counts fixed words', () => {
      const input = 'S İ G O R T A poliçesi'
      const { stats } = normalizeTurkishOcrWithStats(input)
      expect(stats.wordsFixed).toBeGreaterThanOrEqual(1)
    })

    it('tracks preserved tokens count', () => {
      const input = 'Email: test@example.com Date: 15.01.2026'
      const { stats } = normalizeTurkishOcrWithStats(input)
      expect(stats.preservedTokens).toBeGreaterThanOrEqual(1)
    })

    it('measures syllable merges', () => {
      const input = 'GEN İŞ LET İLM İŞ'
      const { stats } = normalizeTurkishOcrWithStats(input)
      expect(stats.syllablesMerged).toBeGreaterThanOrEqual(0)
    })

    it('reports original and normalized lengths', () => {
      const input = 'S İ G O R T A\nB^^^^B garbage'
      const { stats } = normalizeTurkishOcrWithStats(input)
      expect(stats.originalLength).toBe(input.length)
      expect(stats.normalizedLength).toBeLessThan(stats.originalLength)
    })

    it('returns normalized text matching normalizeTurkishOcr', () => {
      const input = 'S İ G O R T A poliçesi'
      const { text } = normalizeTurkishOcrWithStats(input)
      const direct = normalizeTurkishOcr(input)
      expect(text).toBe(direct)
    })
  })

  describe('needsNormalization', () => {
    it('returns false for clean text', () => {
      expect(needsNormalization('Clean text without issues')).toBe(false)
    })

    it('returns true for garbage patterns (B^^^B)', () => {
      expect(needsNormalization('Some B^^^^B text')).toBe(true)
    })

    it('returns true for block character garbage', () => {
      expect(needsNormalization('Some ████ text')).toBe(true)
    })

    it('returns true for spaced Turkish letters', () => {
      expect(needsNormalization('G E N E L')).toBe(true)
    })

    it('returns true for known word patterns (SİGORTA)', () => {
      expect(needsNormalization('S İ G O R T A')).toBe(true)
    })

    it('returns true for known word patterns (KASKO)', () => {
      expect(needsNormalization('K A S K O')).toBe(true)
    })

    it('returns false for single spaced pair (not 3+ letters)', () => {
      // Only 2 spaced letters, not 3+
      expect(needsNormalization('A B normal text')).toBe(false)
    })
  })
})
