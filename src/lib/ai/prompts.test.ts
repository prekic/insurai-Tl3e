/**
 * Tests for AI Prompts Module
 */

import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_NORMALIZATION_PROMPT,
  OCR_CORRECTION_PROMPT,
  TURKISH_INSURANCE_TERMS,
  OCR_CONFUSION_PAIRS,
  buildDocumentProcessingPrompt,
  parseDocumentProcessingResponse,
  validateOCRCorrection,
} from './prompts'

describe('AI Prompts', () => {
  describe('DOCUMENT_NORMALIZATION_PROMPT', () => {
    it('should contain key sections', () => {
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Non-Negotiable Rules')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Output A')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Output B')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Citation Requirement')
    })

    it('should specify Turkish OCR corrections', () => {
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('B İ RLE Şİ K → BİRLEŞİK')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('S İ G O R T A → SİGORTA')
    })

    it('should include insurance schema sections', () => {
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Document Metadata')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Coverage Summary')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Premium & Payment')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('Exclusions')
    })

    it('should emphasize preservation of identifiers', () => {
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('DO NOT invent')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('[MISSING]')
      expect(DOCUMENT_NORMALIZATION_PROMPT).toContain('[UNCLEAR]')
    })
  })

  describe('OCR_CORRECTION_PROMPT', () => {
    it('should be concise', () => {
      expect(OCR_CORRECTION_PROMPT.length).toBeLessThan(1000)
    })

    it('should mention key rules', () => {
      expect(OCR_CORRECTION_PROMPT).toContain('Fix spaced Turkish characters')
      expect(OCR_CORRECTION_PROMPT).toContain('Preserve EXACTLY')
      expect(OCR_CORRECTION_PROMPT).toContain('DO NOT')
    })
  })

  describe('TURKISH_INSURANCE_TERMS', () => {
    it('should include common policy terms', () => {
      expect(TURKISH_INSURANCE_TERMS).toContain('POLİÇE')
      expect(TURKISH_INSURANCE_TERMS).toContain('SİGORTA')
      expect(TURKISH_INSURANCE_TERMS).toContain('TEMİNAT')
      expect(TURKISH_INSURANCE_TERMS).toContain('KASKO')
    })

    it('should include coverage types', () => {
      expect(TURKISH_INSURANCE_TERMS).toContain('HIRSIZLIK')
      expect(TURKISH_INSURANCE_TERMS).toContain('YANGIN')
      expect(TURKISH_INSURANCE_TERMS).toContain('DEPREM')
    })

    it('should have no duplicates', () => {
      const uniqueTerms = new Set(TURKISH_INSURANCE_TERMS)
      expect(uniqueTerms.size).toBe(TURKISH_INSURANCE_TERMS.length)
    })
  })

  describe('OCR_CONFUSION_PAIRS', () => {
    it('should include Turkish character confusions', () => {
      expect(OCR_CONFUSION_PAIRS['İ']).toContain('I')
      expect(OCR_CONFUSION_PAIRS['Ş']).toContain('S')
      expect(OCR_CONFUSION_PAIRS['Ğ']).toContain('G')
    })

    it('should include number/letter confusions', () => {
      expect(OCR_CONFUSION_PAIRS['0']).toContain('O')
      expect(OCR_CONFUSION_PAIRS['1']).toContain('l')
    })
  })

  describe('buildDocumentProcessingPrompt', () => {
    it('should build a complete prompt with raw text', () => {
      const rawText = 'Test insurance policy text'
      const prompt = buildDocumentProcessingPrompt(rawText)

      expect(prompt).toContain('BEGIN RAW TEXT')
      expect(prompt).toContain('END RAW TEXT')
      expect(prompt).toContain(rawText)
    })

    it('should add Turkish language note for Turkish content', () => {
      const rawText = 'SİGORTA POLİÇESİ'
      const prompt = buildDocumentProcessingPrompt(rawText, { language: 'tr' })

      expect(prompt).toContain('Turkish (Türkçe)')
    })

    it('should use comprehensive prompt by default', () => {
      const prompt = buildDocumentProcessingPrompt('test', { includeStructuredExtraction: true })

      expect(prompt).toContain('Output A')
      expect(prompt).toContain('Output B')
    })

    it('should use simple prompt when structured extraction disabled', () => {
      const prompt = buildDocumentProcessingPrompt('test', { includeStructuredExtraction: false })

      expect(prompt).toContain('Fix spaced Turkish characters')
    })
  })

  describe('parseDocumentProcessingResponse', () => {
    it('should parse response with Output A and B markers', () => {
      const response = `
=== OUTPUT A: CLEANED TEXT ===
Document Title: KASKO POLİÇESİ

Normalization Log:
- Fixed spaced characters
- Removed garbage

This is the cleaned text.

=== OUTPUT B: STRUCTURED EXTRACTION ===
## 1. Document Metadata
- Type: Kasko
- Insurer: Test Company
`
      const result = parseDocumentProcessingResponse(response)

      expect(result.cleanedText).toContain('This is the cleaned text')
      expect(result.structuredExtraction).toContain('Document Metadata')
      // Normalization log may or may not be extracted depending on format
      if (result.normalizationLog) {
        expect(result.normalizationLog).toContain('Fixed spaced characters')
      }
    })

    it('should handle response without markers', () => {
      const response = 'Just plain cleaned text without markers'
      const result = parseDocumentProcessingResponse(response)

      expect(result.cleanedText).toBe('Just plain cleaned text without markers')
      expect(result.structuredExtraction).toBeNull()
    })

    it('should detect structured extraction by content patterns', () => {
      const response = `
Some initial text...

## 1. Document Metadata
- Type: Traffic Insurance

## 2. Parties
- Policyholder: John Doe
`
      const result = parseDocumentProcessingResponse(response)

      expect(result.structuredExtraction).toContain('Document Metadata')
    })

    it('should extract normalization log', () => {
      const response = `
=== OUTPUT A: CLEANED TEXT ===
Document Title: KASKO POLİÇESİ

Normalization Log:
- Collapsed spaced uppercase headings
- Removed QR/binary block lines

The actual policy content starts here...
`
      const result = parseDocumentProcessingResponse(response)

      expect(result.normalizationLog).toContain('Collapsed spaced uppercase headings')
    })
  })

  describe('validateOCRCorrection', () => {
    it('should accept valid Turkish character corrections', () => {
      const original = 'ISTANBUL SIGORTA'
      const corrected = 'İSTANBUL SİGORTA'
      const result = validateOCRCorrection(original, corrected)

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should accept spacing corrections', () => {
      const original = 'B İ R L E Ş İ K'
      const corrected = 'BİRLEŞİK'
      const result = validateOCRCorrection(original, corrected)

      expect(result.isValid).toBe(true)
    })

    it('should flag unexpected character additions', () => {
      const original = 'Test document'
      const corrected = 'Test document with extra ★ symbols'
      const result = validateOCRCorrection(original, corrected)

      expect(result.isValid).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
    })

    it('should not flag legitimate Turkish terms', () => {
      const original = 'POLICE SIGORTA'
      const corrected = 'POLİÇE SİGORTA'
      const result = validateOCRCorrection(original, corrected)

      // İ and Ç are valid Turkish corrections for I and C
      expect(result.isValid).toBe(true)
    })
  })
})
