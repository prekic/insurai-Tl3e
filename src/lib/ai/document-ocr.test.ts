/**
 * Tests for Document AI OCR extraction module
 *
 * Tests the helper functions, hash computation, chunked extraction logic,
 * and error handling paths.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { computePdfHash, computePdfHashFromFile, isDocumentOCRAvailable, extractWithDocumentAI } from './document-ocr'
import * as config from './config'
import * as pdfSplitter from './pdf-splitter'

// Polyfill File.prototype.arrayBuffer for jsdom (which doesn't support it)
beforeAll(() => {
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(this)
      })
    }
  }
})

// Mock the config module
vi.mock('./config', () => ({
  isProxyConfigured: vi.fn(() => false),
  getProxyUrl: vi.fn(() => 'http://localhost:4001'),
}))

// Mock the pdf-splitter module
vi.mock('./pdf-splitter', () => ({
  splitPdf: vi.fn(),
  chunkToFile: vi.fn(),
  getPdfPageCount: vi.fn(),
  DOCUMENT_AI_PAGE_LIMIT: 15,
}))

const mockIsProxyConfigured = vi.mocked(config.isProxyConfigured)
const mockGetProxyUrl = vi.mocked(config.getProxyUrl)
const mockGetPdfPageCount = vi.mocked(pdfSplitter.getPdfPageCount)
const mockSplitPdf = vi.mocked(pdfSplitter.splitPdf)
const mockChunkToFile = vi.mocked(pdfSplitter.chunkToFile)

describe('Document OCR Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    mockIsProxyConfigured.mockReturnValue(false)
    mockGetProxyUrl.mockReturnValue('http://localhost:4001')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ==========================================================================
  // computePdfHash
  // ==========================================================================

  describe('computePdfHash', () => {
    it('should compute a SHA-256 hash of an ArrayBuffer', async () => {
      const data = new TextEncoder().encode('test pdf content')
      const hash = await computePdfHash(data.buffer)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should produce same hash for same input', async () => {
      const data = new TextEncoder().encode('deterministic content')
      const hash1 = await computePdfHash(data.buffer)
      const hash2 = await computePdfHash(new TextEncoder().encode('deterministic content').buffer)

      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await computePdfHash(new TextEncoder().encode('content A').buffer)
      const hash2 = await computePdfHash(new TextEncoder().encode('content B').buffer)

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty ArrayBuffer', async () => {
      const hash = await computePdfHash(new ArrayBuffer(0))

      expect(hash).toBeDefined()
      expect(hash).toHaveLength(64)
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })
  })

  // ==========================================================================
  // computePdfHashFromFile
  // ==========================================================================

  describe('computePdfHashFromFile', () => {
    it('should compute hash from a File object', async () => {
      const file = new File(['test pdf content'], 'test.pdf', { type: 'application/pdf' })
      const hash = await computePdfHashFromFile(file)

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should produce same hash as computePdfHash for same content', async () => {
      const content = 'matching content for hash test'
      const file = new File([content], 'test.pdf', { type: 'application/pdf' })
      const fileHash = await computePdfHashFromFile(file)

      const buffer = new TextEncoder().encode(content).buffer
      const bufferHash = await computePdfHash(buffer)

      expect(fileHash).toBe(bufferHash)
    })

    it('should handle empty file', async () => {
      const file = new File([], 'empty.pdf', { type: 'application/pdf' })
      const hash = await computePdfHashFromFile(file)

      // Empty file should produce the SHA-256 of empty input
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })
  })

  // ==========================================================================
  // isDocumentOCRAvailable
  // ==========================================================================

  describe('isDocumentOCRAvailable', () => {
    it('should return false when proxy is not configured', () => {
      mockIsProxyConfigured.mockReturnValue(false)
      expect(isDocumentOCRAvailable()).toBe(false)
    })

    it('should return true when proxy is configured', () => {
      mockIsProxyConfigured.mockReturnValue(true)
      expect(isDocumentOCRAvailable()).toBe(true)
    })
  })

  // ==========================================================================
  // extractWithDocumentAI
  // ==========================================================================

  describe('extractWithDocumentAI', () => {
    it('should return NO_OCR_CONFIG when proxy is not configured', async () => {
      mockIsProxyConfigured.mockReturnValue(false)

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const result = await extractWithDocumentAI(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_OCR_CONFIG')
      }
    })

    it('should handle network errors gracefully', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetPdfPageCount.mockRejectedValue(new Error('Network timeout'))

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const result = await extractWithDocumentAI(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NETWORK_ERROR')
        expect(result.error.message).toContain('Network timeout')
      }
    })

    it('should trigger chunked extraction for PDFs over 15 pages', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetPdfPageCount.mockResolvedValue(20)

      mockSplitPdf.mockResolvedValue({
        totalPages: 20,
        chunks: [new Uint8Array(10), new Uint8Array(10)],
        pageRanges: [[1, 15], [16, 20]] as Array<[number, number]>,
        wasSplit: true,
      })

      mockChunkToFile.mockReturnValue(new File(['chunk'], 'test_chunk.pdf', { type: 'application/pdf' }))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            text: 'extracted text',
            pageCount: 15,
            confidence: 0.95,
            pages: [{ pageNumber: 1, text: 'page text', confidence: 0.95 }],
          },
        }),
      }))

      const file = new File(['test pdf content'], 'test.pdf', { type: 'application/pdf' })
      await extractWithDocumentAI(file)

      expect(mockSplitPdf).toHaveBeenCalledWith(file, 15)
    })

    it('should process single PDF when within page limit', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetPdfPageCount.mockResolvedValue(10)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            text: 'extracted policy text here',
            pageCount: 10,
            confidence: 0.92,
            pages: Array.from({ length: 10 }, (_, i) => ({
              pageNumber: i + 1,
              text: `Page ${i + 1} content`,
              confidence: 0.92,
            })),
            formFields: [{ name: 'PolicyNo', value: '123', confidence: 0.9, page: 1 }],
            tables: [],
          },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const file = new File(['test pdf'], 'test.pdf', { type: 'application/pdf' })
      const result = await extractWithDocumentAI(file)

      // Verify fetch was called with correct endpoint and parameters
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:4001/api/ai/ocr/document-ai')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')
      const body = JSON.parse(options.body)
      expect(body.languageHints).toEqual(['tr', 'en'])
      expect(body.mimeType).toBe('application/pdf')
      expect(body.documentBase64).toBeDefined()

      // Verify result structure
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.pageCount).toBe(10)
        expect(result.data.pages).toHaveLength(10)
        expect(result.data.pages[0].pageNumber).toBe(1)
        expect(result.data.pages[9].pageNumber).toBe(10)
        expect(result.data.confidence).toBeCloseTo(0.92)
        expect(result.data.metadata.backend).toBe('document-ai')
        expect(result.data.pdfHash).toHaveLength(64)
        expect(result.data.formFields).toHaveLength(1)
        expect(result.data.formFields[0].name).toBe('PolicyNo')
        expect(result.data.metadata.processingTimeMs).toBeGreaterThanOrEqual(0)
      }
    })

    it('should handle server error responses', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetPdfPageCount.mockResolvedValue(5)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      }))

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const result = await extractWithDocumentAI(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_FAILED')
      }
    })

    it('should handle 401 auth errors', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetPdfPageCount.mockResolvedValue(5)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      }))

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const result = await extractWithDocumentAI(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR')
      }
    })

    it('should flag low confidence pages with warnings', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockGetPdfPageCount.mockResolvedValue(2)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            text: 'some text',
            pageCount: 2,
            confidence: 0.5,
            pages: [
              { pageNumber: 1, text: 'Good text on page 1 with enough characters to pass the length check threshold', confidence: 0.95 },
              { pageNumber: 2, text: 'Bad', confidence: 0.3 },
            ],
          },
        }),
      }))

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const result = await extractWithDocumentAI(file)

      expect(result.success).toBe(true)
      if (result.success) {
        const page2 = result.data.pages.find(p => p.pageNumber === 2)
        expect(page2).toBeDefined()
        expect(page2!.warnings.some(w => w.includes('Low OCR confidence'))).toBe(true)
        expect(page2!.warnings.some(w => w.includes('Very little text'))).toBe(true)
      }
    })
  })
})
