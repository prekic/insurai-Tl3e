import { describe, it, expect } from 'vitest'
import {
  analyzeTextQuality,
  isTextQualityAcceptable,
  getTextQualityScore,
} from './text-quality-analyzer'

describe('TextQualityAnalyzer', () => {
  describe('analyzeTextQuality', () => {
    it('returns zero quality for empty text', () => {
      const result = analyzeTextQuality('')
      expect(result.qualityScore).toBe(0)
      expect(result.qualityOk).toBe(false)
      expect(result.issues).toContain('Empty text')
    })

    it('detects high single-character ratio (glyph splitting)', () => {
      // Simulated glyph-split text: "B İ R L E Ş İ K   K A S K O"
      const glyphSplitText = 'B İ R L E Ş İ K   K A S K O   S İ G O R T A   P O L İ Ç E S İ'
      const result = analyzeTextQuality(glyphSplitText)

      expect(result.singleCharRatio).toBeGreaterThan(0.5) // Most tokens are single chars
      expect(result.qualityOk).toBe(false)
      expect(result.issues.some(i => i.includes('glyph splitting'))).toBe(true)
    })

    it('detects good quality text with proper Turkish words', () => {
      const goodText = `BİRLEŞİK KASKO SİGORTA POLİÇESİ
        Poliçe Numarası: TR-2024-123456
        Sigortalı: Ahmet Yılmaz
        Sigorta Şirketi: Anadolu Sigorta
        Teminat Bedeli: 500.000 TL
        Prim: 12.500 TL
        Muafiyet: 2.000 TL
        Başlangıç Tarihi: 01.01.2024
        Bitiş Tarihi: 31.12.2024`

      const result = analyzeTextQuality(goodText)

      expect(result.qualityScore).toBeGreaterThan(70)
      expect(result.qualityOk).toBe(true)
      expect(result.turkishTermsFound).toBeGreaterThan(5)
      expect(result.singleCharRatio).toBeLessThan(0.15)
    })

    it('detects barcode noise patterns', () => {
      const noisyText = `Normal text here
        ^^^B^^^B^^^B^^^B
        More normal text
        ♠♣♦♥♠♣♦♥
        █▀▄░▒▓█▀▄
        BBBBBBBBB
        Final normal text`

      const result = analyzeTextQuality(noisyText)

      expect(result.barcodePatternCount).toBeGreaterThan(2)
      expect(result.issues.some(i => i.includes('Barcode'))).toBe(true)
    })

    it('detects control character contamination', () => {
      // Text with control characters
      const textWithControl = `Normal text\x00\x01\x02\x03 more text\x1F\x7F end`
      const result = analyzeTextQuality(textWithControl)

      expect(result.controlCharRatio).toBeGreaterThan(0)
      expect(result.qualityScore).toBeLessThan(100)
    })

    it('correctly identifies Turkish insurance terms', () => {
      const insuranceText = `Kasko sigorta poliçesi
        Teminat kapsamı ve muafiyet oranları
        Sigortalı kişi bilgileri
        Prim hesaplama detayları
        Hasar tazminat prosedürleri`

      const result = analyzeTextQuality(insuranceText)

      expect(result.turkishTermsFound).toBeGreaterThanOrEqual(5)
    })

    it('calculates correct average word length', () => {
      const text = 'bir iki üç dört beş altı yedi sekiz dokuz on'
      const result = analyzeTextQuality(text)

      // Average of word lengths: (3+3+2+4+3+4+4+5+5+2)/10 = 3.5
      expect(result.averageWordLength).toBeGreaterThan(2)
      expect(result.averageWordLength).toBeLessThan(5)
    })

    it('handles mixed quality text appropriately', () => {
      const mixedText = `B İ R L E Ş İ K   K A S K O
        Sigorta Şirketi: Allianz
        Normal policy details follow here
        Teminat bedeli 500.000 TL
        ^^^noise^^^
        More normal text about muafiyet`

      const result = analyzeTextQuality(mixedText)

      // Mixed quality should result in moderate score
      expect(result.qualityScore).toBeGreaterThan(30)
      expect(result.qualityScore).toBeLessThan(90)
    })
  })

  describe('isTextQualityAcceptable', () => {
    it('returns true for good quality text', () => {
      const goodText = `BİRLEŞİK KASKO SİGORTA POLİÇESİ
        Poliçe Numarası: TR-2024-123456
        Sigortalı: Ahmet Yılmaz
        Teminat: 500.000 TL`

      expect(isTextQualityAcceptable(goodText)).toBe(true)
    })

    it('returns false for glyph-split text', () => {
      const badText = 'B İ R L E Ş İ K   S İ G O R T A'
      expect(isTextQualityAcceptable(badText)).toBe(false)
    })
  })

  describe('getTextQualityScore', () => {
    it('returns numeric score', () => {
      const text = 'Kasko sigorta poliçesi teminat bilgileri'
      const score = getTextQualityScore(text)

      expect(typeof score).toBe('number')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })
})
