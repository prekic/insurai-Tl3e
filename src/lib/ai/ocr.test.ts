/**
 * Tests for OCR module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Define mocks using vi.hoisted
const {
  mockIsOCRConfigured,
  mockGetGoogleCloudApiKey,
  mockAiCache,
} = vi.hoisted(() => {
  return {
    mockIsOCRConfigured: vi.fn(),
    mockGetGoogleCloudApiKey: vi.fn(),
    mockAiCache: {
      initialize: vi.fn(),
      getOCR: vi.fn(),
      setOCR: vi.fn(),
    },
  }
})

// Mock dependencies
vi.mock('./config', () => ({
  isOCRConfigured: mockIsOCRConfigured,
  getGoogleCloudApiKey: mockGetGoogleCloudApiKey,
}))

vi.mock('./cache', () => ({
  aiCache: mockAiCache,
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock btoa for Node.js environment
vi.stubGlobal('btoa', (str: string) => Buffer.from(str, 'binary').toString('base64'))

// Import after mocking
import { isLikelyScannedPDF, performOCR, performMultiPageOCR } from './ocr'

// Helper to create mock File with arrayBuffer support (jsdom doesn't have File.arrayBuffer)
function createMockFile(content: string = 'test content', name: string = 'test.pdf'): File {
  const encoder = new TextEncoder()
  const uint8Array = encoder.encode(content)
  const blob = new Blob([uint8Array], { type: 'application/pdf' })

  // Create a File-like object with arrayBuffer method
  const file = new File([blob], name, { type: 'application/pdf' })

  // Add arrayBuffer method if not present (jsdom doesn't implement it)
  if (!file.arrayBuffer) {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => uint8Array.buffer,
    })
  }

  return file
}

// Helper to create mock Blob with arrayBuffer support
function createMockBlob(content: string = 'page content'): Blob {
  const encoder = new TextEncoder()
  const uint8Array = encoder.encode(content)
  const blob = new Blob([uint8Array], { type: 'image/png' })

  // Add arrayBuffer method if not present (jsdom doesn't implement it)
  if (!blob.arrayBuffer) {
    Object.defineProperty(blob, 'arrayBuffer', {
      value: async () => uint8Array.buffer,
    })
  }

  return blob
}

describe('OCR Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAiCache.initialize.mockResolvedValue(undefined)
    mockAiCache.getOCR.mockResolvedValue(null)
    mockAiCache.setOCR.mockResolvedValue(undefined)
    // Reset mocks to default state
    mockIsOCRConfigured.mockReturnValue(true)
    mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isLikelyScannedPDF', () => {
    it('should return true for PDFs with very little text per page', () => {
      // 50 chars for 1 page = 50 chars/page (< 200)
      expect(isLikelyScannedPDF('x'.repeat(50), 1)).toBe(true)
    })

    it('should return true for multi-page PDFs with low text density', () => {
      // 300 chars for 5 pages = 60 chars/page (< 200)
      expect(isLikelyScannedPDF('x'.repeat(300), 5)).toBe(true)
    })

    it('should return false for PDFs with normal text density', () => {
      // 2000 chars for 1 page = 2000 chars/page (> 200)
      expect(isLikelyScannedPDF('x'.repeat(2000), 1)).toBe(false)
    })

    it('should return false for PDFs with high text density', () => {
      // 5000 chars for 1 page = 5000 chars/page (> 200)
      expect(isLikelyScannedPDF('x'.repeat(5000), 1)).toBe(false)
    })

    it('should handle edge case of 0 pages', () => {
      // Should use max(1, pageCount) to avoid division by zero
      expect(isLikelyScannedPDF('x'.repeat(50), 0)).toBe(true)
    })

    it('should handle empty text', () => {
      expect(isLikelyScannedPDF('', 1)).toBe(true)
    })

    it('should calculate correctly for typical document', () => {
      // 4500 chars for 3 pages = 1500 chars/page (> 200, typical text PDF)
      expect(isLikelyScannedPDF('x'.repeat(4500), 3)).toBe(false)
    })

    it('should identify scanned document with minimal OCR artifacts', () => {
      // Some scanned PDFs have OCR artifacts but still low text density
      // 180 chars for 2 pages = 90 chars/page (< 200)
      expect(isLikelyScannedPDF('x'.repeat(180), 2)).toBe(true)
    })

    it('should handle boundary case at 200 chars/page', () => {
      // Exactly 200 chars/page should not be considered scanned
      expect(isLikelyScannedPDF('x'.repeat(200), 1)).toBe(false)
      // Just under 200 should be considered scanned
      expect(isLikelyScannedPDF('x'.repeat(199), 1)).toBe(true)
    })

    it('should handle Turkish text correctly', () => {
      // Turkish characters should be counted properly
      const turkishText = 'Merhaba dünya! Türkçe karakterler: İ, Ş, Ğ, Ü, Ö, Ç, ı'
      // 54 chars for 1 page = 54 chars/page (< 200)
      expect(isLikelyScannedPDF(turkishText, 1)).toBe(true)

      // Long Turkish text
      const longTurkishText = turkishText.repeat(40) // ~2160 chars
      expect(isLikelyScannedPDF(longTurkishText, 1)).toBe(false)
    })

    it('should handle large multi-page documents', () => {
      // 10000 chars for 10 pages = 1000 chars/page (> 200)
      expect(isLikelyScannedPDF('x'.repeat(10000), 10)).toBe(false)

      // 500 chars for 10 pages = 50 chars/page (< 200)
      expect(isLikelyScannedPDF('x'.repeat(500), 10)).toBe(true)
    })

    it('should correctly identify insurance policy PDF patterns', () => {
      // Typical scanned policy: minimal text extracted
      expect(isLikelyScannedPDF('Poliçe No: 12345', 3)).toBe(true)

      // Typical digital policy: lots of extracted text
      const digitalPolicy = `
        Sigorta Poliçesi
        Poliçe Numarası: 2024-123456
        Sigorta Ettiren: Test Kullanıcı
        Teminat Limiti: 500.000 TL
        Prim Tutarı: 1.500 TL
        Başlangıç Tarihi: 01.01.2024
        Bitiş Tarihi: 01.01.2025
      `.repeat(5) // ~800 chars
      expect(isLikelyScannedPDF(digitalPolicy, 1)).toBe(false)
    })
  })

  describe('performOCR', () => {
    it('should return cached result if available', async () => {
      const cachedResult = {
        text: 'Cached OCR text',
        confidence: 0.95,
        pageCount: 1,
        isScanned: true,
      }
      mockAiCache.getOCR.mockResolvedValue(cachedResult)

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(cachedResult)
      }
      expect(mockAiCache.initialize).toHaveBeenCalled()
      expect(mockAiCache.getOCR).toHaveBeenCalledWith(file)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return NO_OCR_CONFIG error when OCR is not configured', async () => {
      mockIsOCRConfigured.mockReturnValue(false)

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
        expect(result.error.message).toContain('not configured')
      }
    })

    it('should return NO_OCR_CONFIG error when API key is not available', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue(null)

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
        expect(result.error.message).toContain('not available')
      }
    })

    it('should call Google Vision API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Extracted text from OCR',
                pages: [
                  {
                    blocks: [{ confidence: 0.9 }],
                  },
                ],
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      await performOCR(file)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('vision.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )

      // Verify request body contains correct structure
      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body.requests[0].features[0].type).toBe('DOCUMENT_TEXT_DETECTION')
      expect(body.requests[0].imageContext.languageHints).toContain('tr')
    })

    it('should extract text and confidence from API response', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Policy document text',
                pages: [
                  {
                    blocks: [
                      { confidence: 0.95 },
                      { confidence: 0.85 },
                    ],
                  },
                ],
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('Policy document text')
        expect(result.data.confidence).toBeCloseTo(0.9, 2) // Average of 0.95 and 0.85
        expect(result.data.pageCount).toBe(1)
        expect(result.data.isScanned).toBe(true)
      }
    })

    it('should cache successful OCR results', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Cached text',
                pages: [{ blocks: [{ confidence: 0.9 }] }],
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      await performOCR(file)

      expect(mockAiCache.setOCR).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          text: 'Cached text',
          isScanned: true,
        })
      )
    })

    it('should handle empty OCR response (no text detected)', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [{}], // No fullTextAnnotation
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
        expect(result.data.pageCount).toBe(1)
      }
    })

    it('should handle API error response', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid API key' },
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toContain('Invalid API key')
      }
    })

    it('should handle API error with no error message', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toContain('API error: 500')
      }
    })

    it('should handle network errors', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue(new Error('Network error'))

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toBe('Network error')
      }
    })

    it('should handle non-Error exceptions', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue('String error')

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toBe('OCR processing failed')
      }
    })

    it('should handle multiple pages in response', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Multi-page document',
                pages: [
                  { blocks: [{ confidence: 0.9 }] },
                  { blocks: [{ confidence: 0.8 }] },
                  { blocks: [{ confidence: 0.85 }] },
                ],
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.pageCount).toBe(3)
        expect(result.data.confidence).toBeCloseTo(0.85, 2)
      }
    })

    it('should default confidence to 0.8 when no blocks have confidence', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Text without confidence',
                pages: [{ blocks: [] }],
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.confidence).toBe(0.8)
      }
    })
  })

  describe('performMultiPageOCR', () => {
    it('should return NO_OCR_CONFIG error when OCR is not configured', async () => {
      mockIsOCRConfigured.mockReturnValue(false)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should return NO_OCR_CONFIG error when API key is not available', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue(null)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should process multiple pages in parallel', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Page text',
                pages: [{ blocks: [{ confidence: 0.9 }] }],
              },
            },
          ],
        }),
      })

      const pages = [createMockBlob('page1'), createMockBlob('page2'), createMockBlob('page3')]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.pageCount).toBe(3)
        expect(result.data.text).toContain('Page text')
      }

      // Should call fetch for each page
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should combine text from multiple pages', async () => {
      // Use a different approach - return same text for all pages
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Page content',
                pages: [{ blocks: [{ confidence: 0.9 }] }],
              },
            },
          ],
        }),
      })

      const pages = [createMockBlob(), createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        // Text should be combined with double newlines between pages
        expect(result.data.text).toBe('Page content\n\nPage content')
        expect(result.data.pageCount).toBe(2)
      }
    })

    it('should calculate average confidence across pages', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      let callCount = 0
      const confidences = [0.9, 0.8, 0.7]
      mockFetch.mockImplementation(async () => {
        const confidence = confidences[callCount++]
        return {
          ok: true,
          json: async () => ({
            responses: [
              {
                fullTextAnnotation: {
                  text: 'Text',
                  pages: [{ blocks: [{ confidence }] }],
                },
              },
            ],
          }),
        }
      })

      const pages = [createMockBlob(), createMockBlob(), createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.confidence).toBeCloseTo(0.8, 2) // Average of 0.9, 0.8, 0.7
      }
    })

    it('should handle failed individual page OCR gracefully', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      let callCount = 0
      mockFetch.mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          return { ok: false, status: 500 }
        }
        return {
          ok: true,
          json: async () => ({
            responses: [
              {
                fullTextAnnotation: {
                  text: `Page ${callCount} text`,
                  pages: [{ blocks: [{ confidence: 0.9 }] }],
                },
              },
            ],
          }),
        }
      })

      const pages = [createMockBlob(), createMockBlob(), createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        // Should still succeed, just with empty text for failed page
        expect(result.data.pageCount).toBe(3)
      }
    })

    it('should handle network errors', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue(new Error('Network error'))

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toBe('Network error')
      }
    })

    it('should handle non-Error exceptions', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue('String error')

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toBe('Multi-page OCR processing failed')
      }
    })

    it('should handle pages with no text annotation', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [{}],
        }),
      })

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0.8) // Default confidence
      }
    })

    it('should set isScanned to true for all results', async () => {
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'OCR text',
                pages: [{ blocks: [{ confidence: 0.9 }] }],
              },
            },
          ],
        }),
      })

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isScanned).toBe(true)
      }
    })
  })
})
