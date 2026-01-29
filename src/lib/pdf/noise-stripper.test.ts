import { describe, it, expect } from 'vitest'
import {
  stripBarcodeNoise,
  stripControlCharacters,
  fixGlyphSplitTurkish,
  cleanExtractedText,
} from './noise-stripper'

describe('NoiseStripper', () => {
  describe('stripBarcodeNoise', () => {
    it('removes lines with caret sequences', () => {
      const text = `Normal line 1
^^^B^^^B^^^B
Normal line 2
^^^^^`
      const result = stripBarcodeNoise(text)

      expect(result.text).not.toContain('^^^')
      expect(result.text).toContain('Normal line 1')
      expect(result.text).toContain('Normal line 2')
      expect(result.noiseTypes).toContain('caret-sequence')
    })

    it('removes lines with block characters', () => {
      const text = `Normal text
█▀▄░▒▓█▀▄
More normal text
♠♣♦♥♠♣`
      const result = stripBarcodeNoise(text)

      expect(result.text).not.toContain('█▀▄')
      expect(result.text).not.toContain('♠♣♦')
      // Block chars are caught as either 'block-chars' or 'non-printable'
      expect(result.noiseTypes.length).toBeGreaterThan(0)
    })

    it('removes lines with low printable ratio', () => {
      const text = `Normal text here
\x00\x01\x02\x03\x04\x05\x06\x07\x08
Another normal line`
      const result = stripBarcodeNoise(text)

      expect(result.text).toContain('Normal text here')
      expect(result.text).toContain('Another normal line')
      expect(result.noiseTypes).toContain('non-printable')
    })

    it('removes lines with only special characters', () => {
      const text = `Policy details
!@#$%^&*()
More details
=====----`
      const result = stripBarcodeNoise(text)

      expect(result.text).toContain('Policy details')
      expect(result.text).toContain('More details')
      expect(result.noiseTypes).toContain('special-chars-only')
    })

    it('keeps legitimate text lines', () => {
      const text = `Sigorta Poliçesi
Poliçe No: TR-2024-123456
Tutar: 500.000 TL`
      const result = stripBarcodeNoise(text)

      expect(result.text).toContain('Sigorta Poliçesi')
      expect(result.text).toContain('TR-2024-123456')
      expect(result.text).toContain('500.000 TL')
      expect(result.linesRemoved).toBe(0)
    })

    it('collapses excessive whitespace', () => {
      const text = `Text with    excessive     spaces
Another    line`
      const result = stripBarcodeNoise(text)

      expect(result.text).not.toMatch(/\s{4,}/)
    })

    it('reports removed lines and characters count', () => {
      const text = `Normal
^^^noise^^^
Normal again
█▀▄░▒▓`
      const result = stripBarcodeNoise(text)

      expect(result.linesRemoved).toBeGreaterThan(0)
      expect(result.charsRemoved).toBeGreaterThan(0)
    })
  })

  describe('stripControlCharacters', () => {
    it('removes C0 control characters except tab/newline', () => {
      const text = 'Hello\x00\x01\x02World\x03\x04End'
      const result = stripControlCharacters(text)

      expect(result).toBe('HelloWorldEnd')
      // eslint-disable-next-line no-control-regex
      expect(result).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/)
    })

    it('removes C1 control characters', () => {
      const text = 'Hello\x80\x90World\x9F'
      const result = stripControlCharacters(text)

      expect(result).toBe('HelloWorld')
       
      expect(result).not.toMatch(/[\x7F-\x9F]/)
    })

    it('preserves tabs and newlines', () => {
      const text = 'Line 1\tTabbed\nLine 2\rLine 3'
      const result = stripControlCharacters(text)

      expect(result).toContain('\t')
      expect(result).toContain('\n')
    })

    it('preserves Turkish characters', () => {
      const text = 'Türkçe: çğıöşüÇĞİÖŞÜ'
      const result = stripControlCharacters(text)

      expect(result).toContain('çğıöşüÇĞİÖŞÜ')
    })
  })

  describe('fixGlyphSplitTurkish', () => {
    it('fixes split SİGORTA', () => {
      const text = 'S İ G O R T A poliçesi'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('SİGORTA')
      // Should not contain split letters with spaces between them
      expect(result).not.toContain('S İ G')
    })

    it('fixes split POLİÇE', () => {
      const text = 'Kasko P O L İ Ç E numarası'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('POLİÇE')
    })

    it('fixes split KASKO', () => {
      const text = 'K A S K O sigortası'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('KASKO')
    })

    it('fixes split TEMİNAT', () => {
      const text = 'T E M İ N A T bedeli'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('TEMİNAT')
    })

    it('fixes split BİRLEŞİK', () => {
      const text = 'B İ R L E Ş İ K kasko'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('BİRLEŞİK')
    })

    it('fixes split ANADOLU', () => {
      const text = 'A N A D O L U Sigorta'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('ANADOLU')
    })

    it('handles multiple split words in same text', () => {
      const text = 'B İ R L E Ş İ K   K A S K O   S İ G O R T A   P O L İ Ç E S İ'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toContain('BİRLEŞİK')
      expect(result).toContain('KASKO')
      expect(result).toContain('SİGORTA')
      expect(result).toContain('POLİÇE')
    })

    it('preserves already correct words', () => {
      const text = 'SİGORTA POLİÇESİ KASKO TEMİNAT'
      const result = fixGlyphSplitTurkish(text)

      expect(result).toBe(text)
    })
  })

  describe('cleanExtractedText', () => {
    it('applies full cleaning pipeline', () => {
      const dirtyText = `B İ R L E Ş İ K   K A S K O
^^^noise^^^
P O L İ Ç E   numarası: TR-123
█▀▄░▒▓
Normal text\x00\x01\x02 continues


Extra spacing   between    words`

      const result = cleanExtractedText(dirtyText)

      // Should fix glyph splits
      expect(result.text).toContain('BİRLEŞİK')
      expect(result.text).toContain('KASKO')
      expect(result.text).toContain('POLİÇE')

      // Should remove noise
      expect(result.text).not.toContain('^^^')
      expect(result.text).not.toContain('█▀▄')

      // Should remove control characters
      // eslint-disable-next-line no-control-regex
      expect(result.text).not.toMatch(/[\x00-\x08]/)

      // Should normalize whitespace
      expect(result.text).not.toMatch(/\n{4,}/)

      // Should report cleaning stats
      expect(result.linesRemoved).toBeGreaterThan(0)
      expect(result.charsRemoved).toBeGreaterThan(0)
    })

    it('handles clean text without errors', () => {
      const cleanText = `BİRLEŞİK KASKO SİGORTA POLİÇESİ
Sigortalı: Ahmet Yılmaz
Teminat: 500.000 TL`

      const result = cleanExtractedText(cleanText)

      expect(result.text.length).toBeGreaterThan(0)
      expect(result.linesRemoved).toBe(0)
    })

    it('preserves Turkish characters throughout pipeline', () => {
      const text = 'Türkçe karakterler: çğıöşüÇĞİÖŞÜ'
      const result = cleanExtractedText(text)

      expect(result.text).toContain('çğıöşüÇĞİÖŞÜ')
    })
  })
})
