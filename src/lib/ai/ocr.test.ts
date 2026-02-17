/**
 * Tests for OCR module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Define mocks using vi.hoisted
const {
  mockIsOCRConfigured,
  mockGetGoogleCloudApiKey,
  mockIsProxyConfigured,
  mockGetProxyUrl,
  mockAiCache,
} = vi.hoisted(() => {
  return {
    mockIsOCRConfigured: vi.fn(),
    mockGetGoogleCloudApiKey: vi.fn(),
    mockIsProxyConfigured: vi.fn(() => true),
    mockGetProxyUrl: vi.fn(() => 'http://localhost:4001'),
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
  isProxyConfigured: mockIsProxyConfigured,
  getProxyUrl: mockGetProxyUrl,
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
import {
  isLikelyScannedPDF,
  performOCR,
  performMultiPageOCR,
  isDocumentAIConfigured,
  extractFormFieldMap,
  findFormField,
  TURKISH_FORM_FIELD_PATTERNS,
} from './ocr'

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
    mockIsProxyConfigured.mockReturnValue(true)
    mockGetProxyUrl.mockReturnValue('http://localhost:4001')
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
      // Disable both OCR and proxy to get NO_OCR_CONFIG
      mockIsOCRConfigured.mockReturnValue(false)
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
        expect(result.error.message).toContain('No OCR backend configured')
      }
    })

    it('should return NO_OCR_CONFIG error when API key is not available', async () => {
      // Disable proxy to force direct API call, then API key will be needed
      mockIsOCRConfigured.mockReturnValue(true)
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
        expect(result.data.confidence).toBe(0.8) // Default confidence when no blocks
        expect(result.data.pageCount).toBe(1)
      }
    })

    it('should handle API error response', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
        expect(result.error.code).toBe('VISION_API_ERROR')
        expect(result.error.message).toContain('Invalid API key')
      }
    })

    it('should handle API error with no error message', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
        expect(result.error.code).toBe('VISION_API_ERROR')
        expect(result.error.message).toContain('API error: 500')
      }
    })

    it('should handle network errors', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue(new Error('Network error'))

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('VISION_API_ERROR')
        expect(result.error.message).toBe('Network error')
      }
    })

    it('should handle non-Error exceptions', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue('String error')

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('VISION_API_ERROR')
        expect(result.error.message).toBe('Vision API processing failed')
      }
    })

    it('should handle multiple pages in response', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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

    it('should handle undefined pages array in annotation', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Text with no pages',
                // pages is undefined
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('Text with no pages')
        expect(result.data.confidence).toBe(0.8) // Default when no pages
        expect(result.data.pageCount).toBe(1) // Default when pages.length is 0
      }
    })

    it('should handle undefined blocks array in page', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Text with page but no blocks',
                pages: [
                  {}, // blocks is undefined
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
        expect(result.data.text).toBe('Text with page but no blocks')
        expect(result.data.confidence).toBe(0.8) // Default when no blocks
        expect(result.data.pageCount).toBe(1)
      }
    })

    it('should handle undefined text in annotation', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                // text is undefined
                pages: [{ blocks: [{ confidence: 0.9 }] }],
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('') // Defaults to empty string
        expect(result.data.confidence).toBe(0.9)
        expect(result.data.pageCount).toBe(1)
      }
    })

    it('should handle empty pages array (pageCount defaults to 1)', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Some text',
                pages: [], // Empty array, length is 0 (falsy)
              },
            },
          ],
        }),
      })

      const file = createMockFile()
      const result = await performOCR(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('Some text')
        expect(result.data.pageCount).toBe(1) // Defaults to 1 when pages.length is 0
        expect(result.data.confidence).toBe(0.8) // Default when no blocks
      }
    })

    it('should handle block without confidence property', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Text with blocks but no confidence',
                pages: [
                  {
                    blocks: [
                      { boundingBox: {} }, // No confidence
                      { confidence: 0.85 }, // Has confidence
                      { boundingBox: {} }, // No confidence
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
        expect(result.data.confidence).toBe(0.85) // Only counts the one with confidence
      }
    })
  })

  describe('performMultiPageOCR', () => {
    it('should return NO_OCR_CONFIG error when OCR is not configured', async () => {
      // Disable both OCR and proxy to get NO_OCR_CONFIG
      mockIsOCRConfigured.mockReturnValue(false)
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should return NO_OCR_CONFIG error when API key is not available', async () => {
      // Disable proxy to force direct API call, then API key will be needed
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(false)
      mockGetGoogleCloudApiKey.mockReturnValue(null)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should process multiple pages in parallel', async () => {
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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
      // Disable proxy to force direct Vision API call
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
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

    it('should use proxy for multi-page OCR when configured', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')
      mockIsOCRConfigured.mockReturnValue(true)

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { text: 'Proxy OCR text', confidence: 0.88 },
        }),
      })

      const pages = [createMockBlob(), createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toContain('Proxy OCR text')
        expect(result.data.pageCount).toBe(2)
      }

      // Should have called proxy URL
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/ocr',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('should handle proxy returning non-ok response', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')
      mockIsOCRConfigured.mockReturnValue(true)

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
      }
    })

    it('should handle fetch error in multi-page OCR', async () => {
      mockIsProxyConfigured.mockReturnValue(false)
      mockGetProxyUrl.mockReturnValue(null)
      mockIsOCRConfigured.mockReturnValue(true)
      mockGetGoogleCloudApiKey.mockReturnValue('test-api-key')

      mockFetch.mockRejectedValue(new Error('Network error'))

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toContain('Network error')
      }
    })
  })

  describe('isDocumentAIConfigured', () => {
    it('should return true when proxy is configured', () => {
      mockIsProxyConfigured.mockReturnValue(true)
      expect(isDocumentAIConfigured()).toBe(true)
    })

    it('should return false when proxy is not configured', () => {
      mockIsProxyConfigured.mockReturnValue(false)
      expect(isDocumentAIConfigured()).toBe(false)
    })
  })

  describe('isLikelyScannedPDF', () => {
    it('should return true for very low text density', () => {
      expect(isLikelyScannedPDF('short text', 5)).toBe(true)
    })

    it('should return false for text-heavy PDFs', () => {
      const longText = 'A'.repeat(5000) // 5000 chars, 1 page
      expect(isLikelyScannedPDF(longText, 1)).toBe(false)
    })

    it('should return true when avg chars per page is below 200', () => {
      const text = 'A'.repeat(399) // 399 chars / 2 pages = 199.5
      expect(isLikelyScannedPDF(text, 2)).toBe(true)
    })

    it('should return false when avg chars per page is 200 or more', () => {
      const text = 'A'.repeat(400) // 400 chars / 2 pages = 200
      expect(isLikelyScannedPDF(text, 2)).toBe(false)
    })

    it('should handle empty text', () => {
      expect(isLikelyScannedPDF('', 1)).toBe(true)
    })

    it('should handle zero pages (edge case)', () => {
      // pageCount is clamped to Math.max(1, pageCount) internally
      expect(isLikelyScannedPDF('A'.repeat(100), 0)).toBe(true)
    })
  })

  describe('extractFormFieldMap', () => {
    it('should convert form fields to key-value map', () => {
      const fields: FormField[] = [
        { name: 'Policy Number', value: 'POL-001', confidence: 0.9 },
        { name: 'Premium', value: '₺5,000', confidence: 0.85 },
      ]

      const map = extractFormFieldMap(fields)
      expect(map['policy number']).toBe('POL-001')
      expect(map['premium']).toBe('₺5,000')
    })

    it('should normalize field names to lowercase', () => {
      const fields: FormField[] = [
        { name: 'POLİÇE NO', value: '12345', confidence: 0.9 },
      ]

      const map = extractFormFieldMap(fields)
      expect(map['poli̇çe no']).toBeDefined()
    })

    it('should trim field names and values', () => {
      const fields: FormField[] = [
        { name: '  Name  ', value: '  John Doe  ', confidence: 0.9 },
      ]

      const map = extractFormFieldMap(fields)
      expect(map['name']).toBe('John Doe')
    })

    it('should skip fields with low confidence (<=0.5)', () => {
      const fields: FormField[] = [
        { name: 'Low', value: 'value', confidence: 0.5 },
        { name: 'High', value: 'value', confidence: 0.51 },
      ]

      const map = extractFormFieldMap(fields)
      expect(map['low']).toBeUndefined()
      expect(map['high']).toBe('value')
    })

    it('should skip fields with empty name or value', () => {
      const fields: FormField[] = [
        { name: '', value: 'value', confidence: 0.9 },
        { name: 'name', value: '', confidence: 0.9 },
      ]

      const map = extractFormFieldMap(fields)
      expect(Object.keys(map)).toHaveLength(0)
    })

    it('should return empty map for empty fields array', () => {
      expect(extractFormFieldMap([])).toEqual({})
    })
  })

  describe('findFormField', () => {
    const sampleFields: FormField[] = [
      { name: 'Poliçe No', value: 'POL-001', confidence: 0.9 },
      { name: 'Sigortalı Ad Soyad', value: 'Ali Veli', confidence: 0.85 },
      { name: 'Prim Tutarı', value: '₺5,000', confidence: 0.88 },
      { name: 'Başlangıç Tarihi', value: '01.01.2026', confidence: 0.92 },
    ]

    it('should find field by string pattern', () => {
      const field = findFormField(sampleFields, ['poliçe no'])
      expect(field).toBeDefined()
      expect(field?.value).toBe('POL-001')
    })

    it('should find field by regex pattern', () => {
      const field = findFormField(sampleFields, [/poli[çc]e\s*n/i])
      expect(field).toBeDefined()
      expect(field?.value).toBe('POL-001')
    })

    it('should return first match from multiple patterns', () => {
      const field = findFormField(sampleFields, ['nonexistent', 'sigortalı'])
      expect(field).toBeDefined()
      expect(field?.value).toBe('Ali Veli')
    })

    it('should return undefined when no patterns match', () => {
      const field = findFormField(sampleFields, ['vehicle', 'şasi no'])
      expect(field).toBeUndefined()
    })

    it('should be case-insensitive for string patterns', () => {
      // 'PRIM' lowercased to 'prim' should match 'prim tutarı' via includes()
      const field = findFormField(sampleFields, ['PRIM'])
      expect(field).toBeDefined()
      expect(field?.value).toBe('₺5,000')
    })

    it('should handle empty patterns array', () => {
      const field = findFormField(sampleFields, [])
      expect(field).toBeUndefined()
    })

    it('should handle empty fields array', () => {
      const field = findFormField([], ['poliçe no'])
      expect(field).toBeUndefined()
    })
  })

  describe('TURKISH_FORM_FIELD_PATTERNS', () => {
    it('should have patterns for all key insurance fields', () => {
      expect(TURKISH_FORM_FIELD_PATTERNS.policyNumber).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.tcKimlik).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.insuredName).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.startDate).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.endDate).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.premium).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.vehiclePlate).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.vin).toBeDefined()
    })

    it('should include both string and regex patterns', () => {
      const patterns = TURKISH_FORM_FIELD_PATTERNS.policyNumber
      const hasString = patterns.some(p => typeof p === 'string')
      const hasRegex = patterns.some(p => p instanceof RegExp)
      expect(hasString).toBe(true)
      expect(hasRegex).toBe(true)
    })

    it('should work with findFormField for policy number', () => {
      const fields: FormField[] = [
        { name: 'Poliçe Numarası', value: 'POL-001', confidence: 0.9 },
      ]
      const field = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.policyNumber)
      expect(field?.value).toBe('POL-001')
    })

    it('should work with findFormField for TC Kimlik', () => {
      const fields: FormField[] = [
        { name: 'T.C. Kimlik No', value: '12345678901', confidence: 0.9 },
      ]
      const field = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.tcKimlik)
      expect(field?.value).toBe('12345678901')
    })

    it('should work with findFormField for premium', () => {
      const fields: FormField[] = [
        { name: 'Toplam Prim', value: '₺5,000', confidence: 0.9 },
      ]
      const field = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.premium)
      expect(field?.value).toBe('₺5,000')
    })
  })
})
