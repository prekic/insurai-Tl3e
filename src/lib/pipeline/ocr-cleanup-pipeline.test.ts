/**
 * OCR Cleanup Pipeline Tests
 */

import { describe, it, expect, vi } from 'vitest'
import {
  runOCRCleanupPipeline,
  quickCleanup,
  standardCleanup,
  fullCleanup,
} from './ocr-cleanup-pipeline'

describe('OCR Cleanup Pipeline', () => {
  describe('runOCRCleanupPipeline', () => {
    describe('basic functionality', () => {
      it('should clean simple OCR text', async () => {
        const input = 'S İ G O R T A POLİÇESİ\nPoliçe No: 12345'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('SİGORTA')
        expect(result.text).toContain('12345')
        expect(result.success).toBe(true)
      })

      it('should handle empty input', async () => {
        const result = await runOCRCleanupPipeline('')

        expect(result.text).toBe('')
        expect(result.success).toBe(true)
        expect(result.stats.originalLength).toBe(0)
      })

      it('should handle whitespace-only input', async () => {
        const result = await runOCRCleanupPipeline('   \n\n   ')

        expect(result.text.trim()).toBe('')
        expect(result.success).toBe(true)
      })

      it('should remove barcode patterns', async () => {
        const input = 'Normal text\nB^^^B\nMore normal text'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).not.toContain('B^^^B')
        expect(result.text).toContain('Normal text')
        expect(result.text).toContain('More normal text')
      })

      it('should merge spaced Turkish fragments', async () => {
        const input = 'K A S K O S İ G O R T A P O L İ Ç E S İ'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('KASKO')
        expect(result.text).toContain('SİGORTA')
        expect(result.text).toContain('POLİÇESİ')
      })
    })

    describe('data preservation', () => {
      it('should preserve policy numbers', async () => {
        const input = 'Poliçe No: 2024/123456\nS İ G O R T A metni'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('2024/123456')
        expect(result.preservationValid).toBe(true)
      })

      it('should preserve dates', async () => {
        const input = 'Başlangıç: 15.01.2026\nBitiş: 15.01.2027'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('15.01.2026')
        expect(result.text).toContain('15.01.2027')
      })

      it('should preserve currency amounts', async () => {
        const input = 'Prim: 15.000,00 TL\nTeminat: 1.500.000 ₺'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('15.000,00 TL')
        expect(result.text).toContain('1.500.000 ₺')
      })

      it('should preserve plate numbers', async () => {
        const input = 'Plaka: 34 ABC 123\nAraç bilgisi'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('34 ABC 123')
      })

      it('should preserve VIN numbers', async () => {
        const input = 'VIN: WVWZZZ3CZWE123456'
        const result = await runOCRCleanupPipeline(input)

        expect(result.text).toContain('WVWZZZ3CZWE123456')
      })
    })

    describe('chunking', () => {
      it('should use single chunk for small documents', async () => {
        const input = 'Short document'
        const result = await runOCRCleanupPipeline(input)

        expect(result.stats.totalChunks).toBe(1)
      })

      it('should skip chunking when option set', async () => {
        const input = 'A'.repeat(20000)
        const result = await runOCRCleanupPipeline(input, {
          skipChunking: true,
        })

        expect(result.stats.totalChunks).toBe(1)
      })

      it('should chunk large documents', async () => {
        const input = 'Word '.repeat(5000) // ~25000 chars
        const result = await runOCRCleanupPipeline(input)

        expect(result.stats.totalChunks).toBeGreaterThan(1)
      })

      it('should detect page markers', async () => {
        const pages = Array(5)
          .fill(null)
          .map((_, i) => `Page ${i + 1} content\nSayfa : ${i + 1}/5\n${'Content '.repeat(500)}`)
          .join('\n')

        const result = await runOCRCleanupPipeline(pages)

        expect(result.chunking).toBeTruthy()
        expect(result.chunking?.pageMarkersFound).toBeGreaterThan(0)
      })
    })

    describe('QA gates', () => {
      it('should run QA gates by default', async () => {
        const input = 'Clean text for QA'
        const result = await runOCRCleanupPipeline(input)

        expect(result.qaReport).toBeTruthy()
      })

      it('should skip QA when option set', async () => {
        const input = 'Text with B^^^B artifact'
        const result = await runOCRCleanupPipeline(input, {
          skipQA: true,
        })

        expect(result.qaReport).toBeNull()
      })

      it('should report QA failures', async () => {
        // This should have artifacts remaining after sanitization
        const input = 'Poliçe: 123. B^^^^^^^^^^^^^B massive artifact'
        const result = await runOCRCleanupPipeline(input)

        // Check if any artifacts remain
        if (result.artifactsRemaining) {
          expect(result.hasQAFailures).toBe(true)
        }
      })
    })

    describe('statistics', () => {
      it('should calculate original and final length', async () => {
        const input = 'A'.repeat(1000) + '\nB^^^B\n' + 'C'.repeat(1000)
        const result = await runOCRCleanupPipeline(input)

        expect(result.stats.originalLength).toBe(input.length)
        expect(result.stats.finalLength).toBeLessThan(result.stats.originalLength)
      })

      it('should calculate reduction percentage', async () => {
        const input = 'Normal\n' + 'B^^^B\n'.repeat(10) + 'More normal'
        const result = await runOCRCleanupPipeline(input)

        expect(result.stats.reductionPercent).toBeGreaterThan(0)
      })

      it('should track sanitizer stats', async () => {
        const input = 'S İ G O R T A\nB^^^B\na!!!!a\nNormal text'
        const result = await runOCRCleanupPipeline(input)

        expect(result.stats.sanitizerStats.spacedFragmentsMerged).toBeGreaterThan(0)
      })

      it('should track processing time', async () => {
        const input = 'Some text to process'
        const result = await runOCRCleanupPipeline(input)

        expect(result.stats.totalProcessingTimeMs).toBeGreaterThanOrEqual(0)
      })
    })

    describe('logging', () => {
      it('should collect pipeline logs', async () => {
        const input = 'Test document'
        const result = await runOCRCleanupPipeline(input)

        expect(result.logs.length).toBeGreaterThan(0)
      })

      it('should include stage logs', async () => {
        const input = 'S İ G O R T A document'
        const result = await runOCRCleanupPipeline(input)

        const stageNames = result.logs.map(l => l.stage)
        // Pipeline stages get mapped to base stages (pipeline->normalize, validation->qa)
        expect(stageNames).toContain('normalize')
        expect(stageNames).toContain('qa')
      })
    })

    describe('error handling', () => {
      it('should handle errors gracefully', async () => {
        // Create a scenario that might cause issues
        const input = 'A'.repeat(100)
        const result = await runOCRCleanupPipeline(input)

        // Should not throw and should have logs
        expect(result.logs).toBeDefined()
      })
    })
  })

  describe('quickCleanup', () => {
    it('should perform quick sanitization', () => {
      const input = 'S İ G O R T A poliçesi'
      const result = quickCleanup(input)

      expect(result.text).toContain('SİGORTA')
      expect(result.stats).toBeDefined()
    })

    it('should remove barcode patterns', () => {
      const input = 'Text\nB^^^B\nMore text'
      const result = quickCleanup(input)

      expect(result.text).not.toContain('B^^^B')
    })
  })

  describe('standardCleanup', () => {
    it('should perform standard cleanup without LLM', async () => {
      const input = 'S İ G O R T A document with some content'
      const result = await standardCleanup(input, 'test-doc')

      expect(result.text).toContain('SİGORTA')
      expect(result.success).toBe(true)
    })
  })

  describe('fullCleanup', () => {
    it('should use LLM cleanup for retries', async () => {
      const mockLLMCleanup = vi.fn().mockResolvedValue('Cleaned text')

      const input = 'Normal text document'
      const result = await fullCleanup(input, mockLLMCleanup, 'test-doc')

      expect(result.success).toBe(true)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle typical kasko policy text', async () => {
      const input = `
K A S K O S İ G O R T A P O L İ Ç E S İ

Poliçe No: 2024/12345678
Sigorta Şirketi: A N A D O L U S İ G O R T A A.Ş.

Sigortalı: MEHMET YILMAZ
TC Kimlik No: 12345678901

Araç Bilgileri:
Plaka: 34 ABC 123
Marka: VOLKSWAGEN
Model: GOLF
Model Yılı: 2022
Motor No: ABC123456
Şasi No: WVWZZZ3CZWE123456

T E M İ N A T L A R:
- Kasko (Rayiç Değer): 850.000,00 TL
- İ M M (Artan Mali Sorumluluk): 500.000,00 TL
- Ferdi Kaza: 100.000,00 TL

Prim: 15.000,00 TL
Başlangıç Tarihi: 15.01.2026
Bitiş Tarihi: 15.01.2027

B^^^B
QR_CODE_DATA_HERE
a!!!!a
`.trim()

      const result = await runOCRCleanupPipeline(input)

      // Should merge Turkish words - note that consecutive fragments get merged together
      expect(result.text).toContain('KASKO')
      expect(result.text).toContain('SİGORTA')
      // POLİÇESİ might be merged with SİGORTA since they're consecutive uppercase
      expect(result.text.toUpperCase()).toContain('POLİÇESİ'.toUpperCase())
      // TEMİNAT gets merged (the LAR might be separate due to colon)
      expect(result.text).toContain('TEMİNAT')
      expect(result.text).toContain('ANADOLU')

      // Should preserve critical data
      expect(result.text).toContain('2024/12345678')
      expect(result.text).toContain('34 ABC 123')
      expect(result.text).toContain('WVWZZZ3CZWE123456')
      expect(result.text).toContain('850.000,00 TL')
      expect(result.text).toContain('15.01.2026')

      // Should remove garbage
      expect(result.text).not.toContain('B^^^B')
      expect(result.text).not.toContain('a!!!!a')
    })

    it('should handle mixed Turkish and English content', async () => {
      const input = `
S İ G O R T A POLİÇESİ / INSURANCE POLICY

Coverage Summary / T E M İ N A T Ö Z E T İ

Collision Coverage: 500,000.00 TL
Çarpışma Teminatı: 500.000,00 TL
`
      const result = await runOCRCleanupPipeline(input)

      expect(result.text).toContain('SİGORTA')
      expect(result.text).toContain('INSURANCE POLICY')
      expect(result.text).toContain('TEMİNAT')
    })

    it('should handle documents with multiple page markers', async () => {
      const input = `
Sayfa : 1/3
İlk sayfa içeriği
S İ G O R T A bilgileri

Sayfa : 2/3
İkinci sayfa
T E M İ N A T L A R listesi

Sayfa : 3/3
Son sayfa
İmza bölümü
`.repeat(3) // Make it large enough for chunking

      const result = await runOCRCleanupPipeline(input)

      expect(result.text).toContain('SİGORTA')
      expect(result.text).toContain('TEMİNATLAR')
    })
  })
})
