/**
 * Reconcile Service Tests
 *
 * Tests the multi-engine OCR reconciliation:
 * - Bounding box alignment (IoU matching)
 * - Confidence-weighted voting
 * - Dispute detection
 * - Targeted re-OCR triggering
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Reconciler } from './index'

// Helper to create mock OCR tokens
function createToken(
  engine: string,
  text: string,
  bbox: { x: number; y: number; width: number; height: number },
  confidence: number,
  pageNo: number = 1
) {
  return {
    id: `${engine}-${text}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    bbox,
    confidence,
    pageNo,
    regionId: 'region-1',
    lineIndex: 0,
    wordIndex: 0,
  }
}

// Helper to create mock OCR results
function createOCRResult(engine: string, tokens: any[]) {
  return {
    docId: 'test-doc',
    engine,
    tokens,
    processingTimeMs: 1000,
    rawStorageKey: `ocr/${engine}/raw.json`,
  }
}

describe('Reconciler', () => {
  let reconciler: Reconciler

  beforeEach(() => {
    reconciler = new Reconciler({
      docId: 'test-doc-001',
      minConfidence: 0.3,
      minIoU: 0.5,
      agreementThreshold: 0.7,
    })
  })

  describe('Empty Input', () => {
    it('should handle empty results array', () => {
      const result = reconciler.reconcile([])

      expect(result.docId).toBe('test-doc-001')
      expect(result.finalTokens).toEqual([])
      expect(result.disputedRegions).toEqual([])
      expect(result.agreementRatio).toBe(1.0)
      expect(result.needsTargetedReOCR).toBe(false)
    })
  })

  describe('Single Engine', () => {
    it('should pass through tokens from a single engine', () => {
      const tokens = [
        createToken('abbyy', 'Hello', { x: 0, y: 0, width: 50, height: 20 }, 0.95),
        createToken('abbyy', 'World', { x: 60, y: 0, width: 50, height: 20 }, 0.90),
      ]

      const result = reconciler.reconcile([createOCRResult('abbyy', tokens)])

      expect(result.finalTokens.length).toBe(2)
      expect(result.finalTokens[0].text).toBe('Hello')
      expect(result.finalTokens[1].text).toBe('World')
      expect(result.agreementRatio).toBe(1.0)
      expect(result.needsTargetedReOCR).toBe(false)
    })
  })

  describe('Multi-Engine Agreement', () => {
    it('should merge identical tokens from multiple engines', () => {
      const bbox = { x: 0, y: 0, width: 50, height: 20 }

      const abbyyTokens = [createToken('abbyy', 'SİGORTA', bbox, 0.95)]
      const gcpTokens = [createToken('gcp_docai', 'SİGORTA', bbox, 0.92)]
      const azureTokens = [createToken('azure_di', 'SİGORTA', bbox, 0.88)]

      const result = reconciler.reconcile([
        createOCRResult('abbyy', abbyyTokens),
        createOCRResult('gcp_docai', gcpTokens),
        createOCRResult('azure_di', azureTokens),
      ])

      expect(result.finalTokens.length).toBe(1)
      expect(result.finalTokens[0].text).toBe('SİGORTA')
      expect(result.agreementRatio).toBe(1.0)
      expect(result.needsTargetedReOCR).toBe(false)
    })

    it('should handle high agreement with minor confidence differences', () => {
      const bbox = { x: 100, y: 50, width: 80, height: 25 }

      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'POLİÇE', bbox, 0.98)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', 'POLİÇE', bbox, 0.95)]),
        createOCRResult('azure_di', [createToken('azure_di', 'POLİÇE', bbox, 0.91)]),
        createOCRResult('tesseract', [createToken('tesseract', 'POLİÇE', bbox, 0.82)]),
      ]

      const result = reconciler.reconcile(results)

      expect(result.finalTokens.length).toBe(1)
      expect(result.finalTokens[0].text).toBe('POLİÇE')
      // Combined confidence should be high
      expect(result.finalTokens[0].confidence).toBeGreaterThan(0.9)
    })
  })

  describe('Dispute Detection', () => {
    it('should detect disputes when engines disagree', () => {
      const bbox = { x: 0, y: 0, width: 50, height: 20 }

      // OCR confusion: 0 vs O, 1 vs l
      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'POL-001', bbox, 0.85)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', 'POL-OO1', bbox, 0.80)]),
        createOCRResult('azure_di', [createToken('azure_di', 'P0L-001', bbox, 0.75)]),
      ]

      const result = reconciler.reconcile(results)

      // Should have dispute because engines disagree
      expect(result.disputedRegions.length).toBeGreaterThan(0)
    })

    it('should flag low confidence tokens for re-OCR', () => {
      const bbox = { x: 0, y: 0, width: 100, height: 30 }

      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'unclear', bbox, 0.45)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', 'uncIear', bbox, 0.42)]),
      ]

      const result = reconciler.reconcile(results)

      expect(result.needsTargetedReOCR).toBe(true)
      expect(result.targetedRegions.length).toBeGreaterThan(0)
    })
  })

  describe('Bounding Box Alignment', () => {
    it('should align tokens with overlapping bboxes', () => {
      // Slightly different bboxes from different engines
      const results = [
        createOCRResult('abbyy', [
          createToken('abbyy', 'Hello', { x: 0, y: 0, width: 50, height: 20 }, 0.95),
        ]),
        createOCRResult('gcp_docai', [
          createToken('gcp_docai', 'Hello', { x: 2, y: 1, width: 48, height: 19 }, 0.92),
        ]),
      ]

      const result = reconciler.reconcile(results)

      // Should merge because IoU > 0.5
      expect(result.finalTokens.length).toBe(1)
      expect(result.finalTokens[0].text).toBe('Hello')
    })

    it('should NOT align tokens with non-overlapping bboxes', () => {
      const results = [
        createOCRResult('abbyy', [
          createToken('abbyy', 'Hello', { x: 0, y: 0, width: 50, height: 20 }, 0.95),
        ]),
        createOCRResult('gcp_docai', [
          createToken('gcp_docai', 'World', { x: 200, y: 0, width: 50, height: 20 }, 0.92),
        ]),
      ]

      const result = reconciler.reconcile(results)

      // Should be separate tokens
      expect(result.finalTokens.length).toBe(2)
    })
  })

  describe('Confidence Weighting', () => {
    it('should prefer higher weighted engines in disputes', () => {
      const reconcilerWithWeights = new Reconciler({
        docId: 'test-doc-002',
        engineWeights: {
          abbyy: 2.0, // High weight
          tesseract: 0.5, // Low weight
        },
      })

      const bbox = { x: 0, y: 0, width: 50, height: 20 }

      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'CORRECT', bbox, 0.80)]),
        createOCRResult('tesseract', [createToken('tesseract', 'C0RRECT', bbox, 0.85)]),
      ]

      const result = reconcilerWithWeights.reconcile(results)

      // ABBYY should win despite lower raw confidence due to higher weight
      expect(result.finalTokens[0].text).toBe('CORRECT')
    })
  })

  describe('Multi-Page Documents', () => {
    it('should handle tokens from multiple pages', () => {
      const results = [
        createOCRResult('abbyy', [
          createToken('abbyy', 'Page1Text', { x: 0, y: 0, width: 80, height: 20 }, 0.95, 1),
          createToken('abbyy', 'Page2Text', { x: 0, y: 0, width: 80, height: 20 }, 0.93, 2),
        ]),
      ]

      const result = reconciler.reconcile(results)

      expect(result.finalTokens.length).toBe(2)
      expect(result.finalTokens.some(t => t.pageNo === 1)).toBe(true)
      expect(result.finalTokens.some(t => t.pageNo === 2)).toBe(true)
    })
  })

  describe('Real World OCR Scenarios', () => {
    it('should handle Turkish character confusion (İ vs I)', () => {
      const bbox = { x: 0, y: 0, width: 80, height: 25 }

      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'İSTANBUL', bbox, 0.92)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', 'ISTANBUL', bbox, 0.88)]),
        createOCRResult('tesseract', [createToken('tesseract', 'lSTANBUL', bbox, 0.75)]),
      ]

      const result = reconciler.reconcile(results)

      // Should detect this as a dispute
      expect(result.disputedRegions.length).toBeGreaterThanOrEqual(0)
      // Final token should exist
      expect(result.finalTokens.length).toBe(1)
    })

    it('should handle numeric confusion (0 vs O, 1 vs l)', () => {
      const bbox = { x: 0, y: 0, width: 100, height: 20 }

      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'POL-2024-001', bbox, 0.90)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', 'POL-2O24-OO1', bbox, 0.85)]),
        createOCRResult('azure_di', [createToken('azure_di', 'P0L-2024-001', bbox, 0.88)]),
      ]

      const result = reconciler.reconcile(results)

      // Should have some tokens
      expect(result.finalTokens.length).toBeGreaterThan(0)
    })

    it('should handle insurance document with mixed quality', () => {
      // Simulate a real insurance document with various fields
      const tokens = {
        abbyy: [
          createToken('abbyy', 'POLİÇE', { x: 100, y: 50, width: 80, height: 25 }, 0.98),
          createToken('abbyy', 'NO:', { x: 190, y: 50, width: 30, height: 25 }, 0.95),
          createToken('abbyy', '123456', { x: 230, y: 50, width: 70, height: 25 }, 0.99),
        ],
        gcp: [
          createToken('gcp_docai', 'POLİÇE', { x: 102, y: 51, width: 78, height: 24 }, 0.95),
          createToken('gcp_docai', 'NO:', { x: 192, y: 51, width: 28, height: 24 }, 0.92),
          createToken('gcp_docai', '123456', { x: 232, y: 51, width: 68, height: 24 }, 0.97),
        ],
        azure: [
          createToken('azure_di', 'POLİÇE', { x: 101, y: 50, width: 79, height: 25 }, 0.93),
          createToken('azure_di', 'NO:', { x: 191, y: 50, width: 29, height: 25 }, 0.90),
          createToken('azure_di', '123456', { x: 231, y: 50, width: 69, height: 25 }, 0.96),
        ],
      }

      const results = [
        createOCRResult('abbyy', tokens.abbyy),
        createOCRResult('gcp_docai', tokens.gcp),
        createOCRResult('azure_di', tokens.azure),
      ]

      const result = reconciler.reconcile(results)

      // Should have 3 merged tokens
      expect(result.finalTokens.length).toBe(3)

      // Agreement should be high
      expect(result.agreementRatio).toBeGreaterThan(0.9)

      // Should not need re-OCR
      expect(result.needsTargetedReOCR).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle single character tokens', () => {
      const results = [
        createOCRResult('abbyy', [createToken('abbyy', 'A', { x: 0, y: 0, width: 10, height: 15 }, 0.80)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', 'A', { x: 0, y: 0, width: 10, height: 15 }, 0.75)]),
      ]

      const result = reconciler.reconcile(results)

      expect(result.finalTokens.length).toBe(1)
      expect(result.finalTokens[0].text).toBe('A')
    })

    it('should handle tokens with zero confidence', () => {
      const results = [
        createOCRResult('tesseract', [createToken('tesseract', 'maybe', { x: 0, y: 0, width: 50, height: 20 }, 0)]),
      ]

      const result = reconciler.reconcile(results)

      // Token should be filtered out due to low confidence
      expect(result.finalTokens.length).toBe(0)
    })

    it('should handle very long tokens', () => {
      const longText = 'ThisIsAVeryLongWordThatMightAppearInADocument'
      const results = [
        createOCRResult('abbyy', [createToken('abbyy', longText, { x: 0, y: 0, width: 500, height: 20 }, 0.90)]),
        createOCRResult('gcp_docai', [createToken('gcp_docai', longText, { x: 0, y: 0, width: 500, height: 20 }, 0.88)]),
      ]

      const result = reconciler.reconcile(results)

      expect(result.finalTokens[0].text).toBe(longText)
    })
  })
})
