/**
 * Comprehensive coverage tests for ocr.ts
 * Targets: uncovered branches in performOCR, performDocumentAIOCR, performVisionAPIOCR,
 * performMultiPageOCR, isLikelyScannedPDF, extractFormFieldMap, findFormField,
 * isDocumentAIConfigured, TURKISH_FORM_FIELD_PATTERNS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to avoid TDZ errors with vi.mock factories
const { mockGetOCR, mockSetOCR, mockInitialize } = vi.hoisted(() => ({
  mockGetOCR: vi.fn(() => null),
  mockSetOCR: vi.fn(),
  mockInitialize: vi.fn(),
}))

// Mock the config module
vi.mock('./config', () => ({
  getGoogleCloudApiKey: vi.fn(() => null),
  isOCRConfigured: vi.fn(() => false),
  isProxyConfigured: vi.fn(() => false),
  getProxyUrl: vi.fn(() => null),
}))

// Mock the cache module
vi.mock('./cache', () => ({
  aiCache: {
    getOCR: mockGetOCR,
    setOCR: mockSetOCR,
    initialize: mockInitialize,
  },
}))

import {
  isDocumentAIConfigured,
  isLikelyScannedPDF,
  performOCR,
  performMultiPageOCR,
  extractFormFieldMap,
  findFormField,
  TURKISH_FORM_FIELD_PATTERNS,
} from './ocr'
import type { FormField } from './ocr'
import { getGoogleCloudApiKey, isOCRConfigured, isProxyConfigured, getProxyUrl } from './config'

// Helper to create a mock file with arrayBuffer support
function createMockFile(name = 'test.pdf', type = 'application/pdf', content = 'mock'): File {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  // Ensure arrayBuffer is available (jsdom may not have it)
  if (!file.arrayBuffer) {
    (file as unknown as Record<string, unknown>).arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(blob)
      })
  }
  return file
}

// Helper to create a mock blob with arrayBuffer support
function createMockBlob(content = 'mock'): Blob {
  const blob = new Blob([content], { type: 'image/png' })
  if (!blob.arrayBuffer) {
    (blob as unknown as Record<string, unknown>).arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(blob)
      })
  }
  return blob
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getGoogleCloudApiKey).mockReturnValue(null)
  vi.mocked(isOCRConfigured).mockReturnValue(false)
  vi.mocked(isProxyConfigured).mockReturnValue(false)
  vi.mocked(getProxyUrl).mockReturnValue(null)
  mockGetOCR.mockResolvedValue(null)
  mockSetOCR.mockResolvedValue(undefined)
  mockInitialize.mockResolvedValue(undefined)
})

describe('ocr coverage', () => {
  describe('isDocumentAIConfigured', () => {
    it('should return false when proxy not configured', () => {
      vi.mocked(isProxyConfigured).mockReturnValue(false)
      expect(isDocumentAIConfigured()).toBe(false)
    })

    it('should return true when proxy configured', () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      expect(isDocumentAIConfigured()).toBe(true)
    })
  })

  describe('isLikelyScannedPDF', () => {
    it('should return true for very short text', () => {
      expect(isLikelyScannedPDF('hello', 3)).toBe(true)
    })

    it('should return false for text-rich PDF', () => {
      const longText = 'A'.repeat(3000) // 3000 chars for 1 page = 3000 per page
      expect(isLikelyScannedPDF(longText, 1)).toBe(false)
    })

    it('should return true for empty text', () => {
      expect(isLikelyScannedPDF('', 5)).toBe(true)
    })

    it('should handle zero page count', () => {
      // Math.max(1, 0) = 1
      expect(isLikelyScannedPDF('', 0)).toBe(true)
    })

    it('should handle boundary case exactly at 200 chars/page', () => {
      const text = 'A'.repeat(200)
      expect(isLikelyScannedPDF(text, 1)).toBe(false) // 200 is NOT < 200
    })

    it('should handle boundary case just below 200 chars/page', () => {
      const text = 'A'.repeat(199)
      expect(isLikelyScannedPDF(text, 1)).toBe(true) // 199 < 200
    })

    it('should handle multi-page with moderate text', () => {
      const text = 'A'.repeat(600) // 600 chars, 10 pages = 60 per page
      expect(isLikelyScannedPDF(text, 10)).toBe(true)
    })
  })

  describe('performOCR', () => {
    it('should return NO_OCR_CONFIG when nothing is configured', async () => {
      const file = createMockFile()
      const result = await performOCR(file)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should return cached result when available', async () => {
      const cachedData = {
        text: 'cached text',
        confidence: 0.95,
        pageCount: 1,
        isScanned: true,
        backend: 'document-ai' as const,
      }
      mockGetOCR.mockResolvedValue(cachedData)

      const file = createMockFile()
      const result = await performOCR(file)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('cached text')
      }
    })

    it('should skip cache when skipCache is true', async () => {
      const cachedData = {
        text: 'cached text',
        confidence: 0.95,
        pageCount: 1,
        isScanned: true,
      }
      mockGetOCR.mockResolvedValue(cachedData)
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-key')

      // Mock global fetch for Vision API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          responses: [{ fullTextAnnotation: { text: 'fresh text', pages: [] } }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { skipCache: true })
      expect(mockGetOCR).not.toHaveBeenCalled()
      expect(result.success).toBe(true)

      vi.unstubAllGlobals()
    })

    it('should use Document AI when configured (auto mode)', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            text: 'Document AI text',
            confidence: 0.95,
            pageCount: 2,
            formFields: [],
            tables: [],
          },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.backend).toBe('document-ai')
        expect(result.data.text).toBe('Document AI text')
      }

      vi.unstubAllGlobals()
    })

    it('should fall back to Vision API when Document AI fails in auto mode', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      let _callCount = 0
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        _callCount++
        if (url.includes('document-ai')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Document AI error' }),
          })
        }
        // Vision API proxy call
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: { text: 'Vision fallback text', confidence: 0.8, pageCount: 1 },
          }),
        })
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'auto' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.backend).toBe('vision-api')
      }

      vi.unstubAllGlobals()
    })

    it('should not fall back when backend is explicitly document-ai', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Document AI error' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('DOCUMENT_AI_ERROR')
      }

      vi.unstubAllGlobals()
    })

    it('should use Vision API when backend is vision-api', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { text: 'Vision text', confidence: 0.85, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.backend).toBe('vision-api')
      }

      vi.unstubAllGlobals()
    })

    it('should cache successful results', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { text: 'cached text', confidence: 0.85, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      await performOCR(file, { backend: 'vision-api' })
      expect(mockSetOCR).toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it('should not cache when skipCache is true', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { text: 'text', confidence: 0.85, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      await performOCR(file, { backend: 'vision-api', skipCache: true })
      expect(mockSetOCR).not.toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it('should not cache failed results', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      await performOCR(file, { backend: 'vision-api' })
      expect(mockSetOCR).not.toHaveBeenCalled()

      vi.unstubAllGlobals()
    })
  })

  describe('performDocumentAIOCR (via performOCR)', () => {
    it('should return NO_OCR_CONFIG when proxy URL is null', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(isOCRConfigured).mockReturnValue(true)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
        expect(result.error.backend).toBe('document-ai')
      }
    })

    it('should handle network errors in Document AI', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('DOCUMENT_AI_ERROR')
        expect(result.error.message).toBe('Network error')
      }

      vi.unstubAllGlobals()
    })

    it('should handle non-Error thrown in Document AI', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockRejectedValue('string error')
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Document AI processing failed')
      }

      vi.unstubAllGlobals()
    })

    it('should handle API error with json parse failure', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON')),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('DOCUMENT_AI_ERROR')
      }

      vi.unstubAllGlobals()
    })

    it('should handle result.success === false from server', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Processing failed' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Processing failed')
      }

      vi.unstubAllGlobals()
    })

    it('should detect PNG mime type', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { text: 'text', confidence: 0.9, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pngFile = createMockFile('scan.png', 'image/png')
      await performOCR(pngFile, { backend: 'document-ai' })
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.mimeType).toBe('image/png')

      vi.unstubAllGlobals()
    })

    it('should detect JPEG mime type from file name when type is empty', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { text: 'text', confidence: 0.9, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      // Use createMockFile with empty type to get arrayBuffer support
      const jpgFile = createMockFile('scan.jpg', '')
      await performOCR(jpgFile, { backend: 'document-ai' })
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.mimeType).toBe('image/jpeg')

      vi.unstubAllGlobals()
    })

    it('should detect JPEG mime type from .jpeg extension', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { text: 'text', confidence: 0.9, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const jpegFile = createMockFile('scan.jpeg', '')
      await performOCR(jpegFile, { backend: 'document-ai' })
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.mimeType).toBe('image/jpeg')

      vi.unstubAllGlobals()
    })

    it('should detect PNG mime type from file name when type is empty', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { text: 'text', confidence: 0.9, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pngFile = createMockFile('scan.png', '')
      await performOCR(pngFile, { backend: 'document-ai' })
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.mimeType).toBe('image/png')

      vi.unstubAllGlobals()
    })

    it('should default to application/pdf when no type or extension match', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { text: 'text', confidence: 0.9, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const unknownFile = createMockFile('document.xyz', '')
      await performOCR(unknownFile, { backend: 'document-ai' })
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.mimeType).toBe('application/pdf')

      vi.unstubAllGlobals()
    })

    it('should handle result with missing data fields', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {}, // Missing text, confidence, pageCount
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'document-ai' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
        expect(result.data.pageCount).toBe(1)
      }

      vi.unstubAllGlobals()
    })
  })

  describe('performVisionAPIOCR (via performOCR)', () => {
    it('should use proxy when available', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { text: 'Vision proxy text', confidence: 0.9, pageCount: 1 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('Vision proxy text')
        expect(result.data.backend).toBe('vision-api')
      }
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/ocr',
        expect.any(Object)
      )

      vi.unstubAllGlobals()
    })

    it('should handle proxy error response for Vision API', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Proxy error' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('VISION_API_ERROR')
      }

      vi.unstubAllGlobals()
    })

    it('should handle proxy error with json parse failure', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON')),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Unknown error')
      }

      vi.unstubAllGlobals()
    })

    it('should use direct Vision API when no proxy and API key available', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-api-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          responses: [{
            fullTextAnnotation: {
              text: 'Direct Vision text',
              pages: [{
                blocks: [
                  { confidence: 0.9 },
                  { confidence: 0.8 },
                ],
              }],
            },
          }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('Direct Vision text')
        expect(result.data.confidence).toBeCloseTo(0.85) // (0.9+0.8)/2
      }
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('vision.googleapis.com'),
        expect.any(Object)
      )

      vi.unstubAllGlobals()
    })

    it('should return NO_OCR_CONFIG when no proxy and no API key', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue(null)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
        expect(result.error.backend).toBe('vision-api')
      }
    })

    it('should handle direct Vision API error response', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-api-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'API key invalid' } }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('API key invalid')
      }

      vi.unstubAllGlobals()
    })

    it('should handle direct Vision API error with no error message', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-api-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('API error')
      }

      vi.unstubAllGlobals()
    })

    it('should handle direct Vision API json parse failure', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-api-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse error')),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)

      vi.unstubAllGlobals()
    })

    it('should handle missing annotation in Vision API response', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-api-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ responses: [{}] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0.8) // default when no blocks
        expect(result.data.pageCount).toBe(1) // 0 pages || 1
      }

      vi.unstubAllGlobals()
    })

    it('should handle blocks without confidence', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-api-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          responses: [{
            fullTextAnnotation: {
              text: 'text',
              pages: [{
                blocks: [{}, {}], // blocks without confidence
              }],
            },
          }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.confidence).toBe(0.8) // default when blockCount is 0
      }

      vi.unstubAllGlobals()
    })

    it('should handle proxy response with missing data fields', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}), // no data field
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
        expect(result.data.pageCount).toBe(1)
      }

      vi.unstubAllGlobals()
    })

    it('should handle network errors in Vision API', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network fail'))
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('VISION_API_ERROR')
        expect(result.error.message).toBe('Network fail')
      }

      vi.unstubAllGlobals()
    })

    it('should handle non-Error thrown in Vision API', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockRejectedValue('string error')
      vi.stubGlobal('fetch', mockFetch)

      const file = createMockFile()
      const result = await performOCR(file, { backend: 'vision-api' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Vision API processing failed')
      }

      vi.unstubAllGlobals()
    })
  })

  describe('performMultiPageOCR', () => {
    it('should return NO_OCR_CONFIG when nothing configured', async () => {
      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should process pages with proxy', async () => {
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { text: 'page text', confidence: 0.9 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob(), createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toContain('page text')
        expect(result.data.pageCount).toBe(2)
        expect(result.data.confidence).toBe(0.9)
      }

      vi.unstubAllGlobals()
    })

    it('should handle proxy failure for individual pages', async () => {
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
      }

      vi.unstubAllGlobals()
    })

    it('should use direct Vision API when no proxy but API key available', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          responses: [{
            fullTextAnnotation: {
              text: 'Direct page text',
              pages: [{ blocks: [{ confidence: 0.95 }] }],
            },
          }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('Direct page text')
        expect(result.data.confidence).toBe(0.95)
      }

      vi.unstubAllGlobals()
    })

    it('should return empty result when no proxy and no API key for individual pages', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue(null)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
      }
    })

    it('should handle direct Vision API failure for individual pages', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0)
      }

      vi.unstubAllGlobals()
    })

    it('should handle missing annotation in direct API page response', async () => {
      vi.mocked(isOCRConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue(null)
      vi.mocked(getGoogleCloudApiKey).mockReturnValue('test-key')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ responses: [{}] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('')
        expect(result.data.confidence).toBe(0.8) // default from annotation fallback
      }

      vi.unstubAllGlobals()
    })

    it('should combine text from multiple pages', async () => {
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      let callIndex = 0
      const mockFetch = vi.fn().mockImplementation(() => {
        const text = `page ${++callIndex} text`
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: { text, confidence: 0.85 },
          }),
        })
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob(), createMockBlob(), createMockBlob()]
      const result = await performMultiPageOCR(pages)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toContain('page 1 text')
        expect(result.data.text).toContain('page 2 text')
        expect(result.data.text).toContain('page 3 text')
        expect(result.data.pageCount).toBe(3)
      }

      vi.unstubAllGlobals()
    })

    it('should handle general errors in multipage OCR', async () => {
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      // Use a Blob that throws on arrayBuffer to cause a general error
      const badBlob = {
        arrayBuffer: () => Promise.reject(new Error('Blob error')),
      } as unknown as Blob

      const result = await performMultiPageOCR([badBlob])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
        expect(result.error.message).toBe('Blob error')
      }
    })

    it('should handle non-Error thrown in multipage OCR', async () => {
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const badBlob = {
        arrayBuffer: () => Promise.reject('string error'),
      } as unknown as Blob

      const result = await performMultiPageOCR([badBlob])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Multi-page OCR processing failed')
      }
    })

    it('should log warning for Document AI multipage', async () => {
      vi.mocked(isProxyConfigured).mockReturnValue(true)
      vi.mocked(getProxyUrl).mockReturnValue('http://localhost:4001')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { text: 'text', confidence: 0.9 },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const pages = [createMockBlob()]
      await performMultiPageOCR(pages, { backend: 'document-ai' })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multi-page OCR with Document AI')
      )
      consoleSpy.mockRestore()

      vi.unstubAllGlobals()
    })
  })

  describe('extractFormFieldMap', () => {
    it('should extract fields with sufficient confidence', () => {
      const fields: FormField[] = [
        { name: 'Poliçe No', value: 'POL-123', confidence: 0.9 },
        { name: 'Sigortalı', value: 'Ahmet Yilmaz', confidence: 0.8 },
      ]
      const map = extractFormFieldMap(fields)
      expect(map['poliçe no']).toBe('POL-123')
      expect(map['sigortalı']).toBe('Ahmet Yilmaz')
    })

    it('should skip low confidence fields', () => {
      const fields: FormField[] = [
        { name: 'Field', value: 'value', confidence: 0.3 },
      ]
      const map = extractFormFieldMap(fields)
      expect(Object.keys(map)).toHaveLength(0)
    })

    it('should skip fields with boundary confidence (0.5)', () => {
      const fields: FormField[] = [
        { name: 'Field', value: 'value', confidence: 0.5 },
      ]
      const map = extractFormFieldMap(fields)
      expect(Object.keys(map)).toHaveLength(0)
    })

    it('should include fields just above 0.5 confidence', () => {
      const fields: FormField[] = [
        { name: 'Field', value: 'value', confidence: 0.51 },
      ]
      const map = extractFormFieldMap(fields)
      expect(map['field']).toBe('value')
    })

    it('should skip fields with empty name or value', () => {
      const fields: FormField[] = [
        { name: '', value: 'value', confidence: 0.9 },
        { name: 'field', value: '', confidence: 0.9 },
      ]
      const map = extractFormFieldMap(fields)
      expect(Object.keys(map)).toHaveLength(0)
    })

    it('should normalize and trim field names', () => {
      const fields: FormField[] = [
        { name: '  Poliçe No  ', value: '  POL-123  ', confidence: 0.9 },
      ]
      const map = extractFormFieldMap(fields)
      expect(map['poliçe no']).toBe('POL-123')
    })

    it('should handle empty array', () => {
      const map = extractFormFieldMap([])
      expect(Object.keys(map)).toHaveLength(0)
    })
  })

  describe('findFormField', () => {
    const fields: FormField[] = [
      { name: 'Poliçe No', value: 'POL-123', confidence: 0.9 },
      { name: 'Sigortalı Ad Soyad', value: 'Ahmet', confidence: 0.8 },
      { name: 'Başlangıç Tarihi', value: '2026-01-01', confidence: 0.95 },
    ]

    it('should find by string pattern', () => {
      const found = findFormField(fields, ['poliçe no'])
      expect(found).toBeTruthy()
      expect(found!.value).toBe('POL-123')
    })

    it('should find by regex pattern', () => {
      const found = findFormField(fields, [/poli[çc]e\s*n/i])
      expect(found).toBeTruthy()
      expect(found!.value).toBe('POL-123')
    })

    it('should return first match among multiple patterns', () => {
      const found = findFormField(fields, ['nonexistent', 'sigortalı'])
      expect(found).toBeTruthy()
      expect(found!.value).toBe('Ahmet')
    })

    it('should return undefined when no match', () => {
      const found = findFormField(fields, ['nonexistent', /xyz/])
      expect(found).toBeUndefined()
    })

    it('should be case insensitive for string patterns', () => {
      // Note: JS toLowerCase() is locale-independent so 'İ' -> 'i̇' not 'i'
      // findFormField uses name.includes(pattern.toLowerCase()), so pattern must lowercase match
      const found = findFormField(fields, ['POLIÇE NO'])
      expect(found).toBeTruthy()
    })

    it('should handle empty patterns array', () => {
      const found = findFormField(fields, [])
      expect(found).toBeUndefined()
    })

    it('should handle empty fields array', () => {
      const found = findFormField([], ['test'])
      expect(found).toBeUndefined()
    })
  })

  describe('TURKISH_FORM_FIELD_PATTERNS', () => {
    it('should have all expected pattern keys', () => {
      expect(TURKISH_FORM_FIELD_PATTERNS.policyNumber).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.tcKimlik).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.insuredName).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.startDate).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.endDate).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.premium).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.vehiclePlate).toBeDefined()
      expect(TURKISH_FORM_FIELD_PATTERNS.vin).toBeDefined()
    })

    it('should match policy number patterns', () => {
      const fields: FormField[] = [
        { name: 'Poliçe Numarası', value: 'POL-123', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.policyNumber)
      expect(found).toBeTruthy()
    })

    it('should match TC Kimlik patterns', () => {
      const fields: FormField[] = [
        { name: 'T.C. Kimlik No', value: '12345678901', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.tcKimlik)
      expect(found).toBeTruthy()
    })

    it('should match insured name patterns', () => {
      const fields: FormField[] = [
        { name: 'Sigortalı', value: 'Ahmet', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.insuredName)
      expect(found).toBeTruthy()
    })

    it('should match start date patterns', () => {
      const fields: FormField[] = [
        { name: 'Başlangıç Tarihi', value: '2026-01-01', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.startDate)
      expect(found).toBeTruthy()
    })

    it('should match end date patterns', () => {
      const fields: FormField[] = [
        { name: 'Bitiş Tarihi', value: '2027-01-01', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.endDate)
      expect(found).toBeTruthy()
    })

    it('should match premium patterns', () => {
      const fields: FormField[] = [
        { name: 'Toplam Prim', value: '15000', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.premium)
      expect(found).toBeTruthy()
    })

    it('should match vehicle plate patterns', () => {
      const fields: FormField[] = [
        { name: 'Araç Plaka', value: '34 ABC 1234', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.vehiclePlate)
      expect(found).toBeTruthy()
    })

    it('should match VIN/chassis patterns', () => {
      const fields: FormField[] = [
        { name: 'Şasi Numarası', value: 'VIN123', confidence: 0.9 },
      ]
      const found = findFormField(fields, TURKISH_FORM_FIELD_PATTERNS.vin)
      expect(found).toBeTruthy()
    })
  })
})
