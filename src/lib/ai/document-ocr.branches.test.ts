/**
 * Branch Coverage Tests for Document AI OCR module
 *
 * Targets uncovered branches in document-ocr.ts:
 * - splitTextByPages: page break pattern matching, fallback division
 * - extractSinglePdfWithDocumentAI: no-pages fallback, formField/table defaults
 * - extractWithDocumentAIChunked: partial failures, all-chunks-fail
 * - combineChunkResults: empty pages, confidence calc
 * - Response error handling: JSON parse failure on error response
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { extractWithDocumentAI, computePdfHash } from './document-ocr'
import * as config from './config'
import * as pdfSplitter from './pdf-splitter'

// Polyfill File.prototype.arrayBuffer for jsdom
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

vi.mock('./config', () => ({
  isProxyConfigured: vi.fn(() => false),
  getProxyUrl: vi.fn(() => 'http://localhost:4001'),
}))

vi.mock('./pdf-splitter', () => ({
  splitPdf: vi.fn(),
  chunkToFile: vi.fn(),
  getPdfPageCount: vi.fn(),
  DOCUMENT_AI_PAGE_LIMIT: 15,
}))

const mockIsProxy = vi.mocked(config.isProxyConfigured)
const mockGetProxy = vi.mocked(config.getProxyUrl)
const mockPageCount = vi.mocked(pdfSplitter.getPdfPageCount)
const mockSplitPdf = vi.mocked(pdfSplitter.splitPdf)
const mockChunkToFile = vi.mocked(pdfSplitter.chunkToFile)

beforeEach(() => {
  vi.clearAllMocks()
  mockIsProxy.mockReturnValue(false)
  mockGetProxy.mockReturnValue('http://localhost:4001')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeFile(content = 'pdf content', name = 'test.pdf') {
  return new File([content], name, { type: 'application/pdf' })
}

// ==========================================================================
// splitTextByPages branches (tested via no-pages fallback in extraction)
// ==========================================================================
describe('splitTextByPages branches (via no-pages response)', () => {
  beforeEach(() => {
    mockIsProxy.mockReturnValue(true)
    mockPageCount.mockResolvedValue(3)
  })

  it('splits text by form feed when pages not in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          text: 'Page 1 content\fPage 2 content\fPage 3 content',
          pageCount: 3,
          confidence: 0.9,
          // No pages array → triggers splitTextByPages fallback
        },
      }),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pages).toHaveLength(3)
      expect(result.data.pages[0].text).toContain('Page 1')
      expect(result.data.pages[2].text).toContain('Page 3')
    }
  })

  it('splits text by page markers when form feed does not match', async () => {
    const text = 'Content A\n------Page 1------\nContent B\n------Page 2------\nContent C'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { text, pageCount: 3, confidence: 0.85 },
      }),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pages).toHaveLength(3)
    }
  })

  it('evenly divides text when no pattern matches page count', async () => {
    const longText = 'A'.repeat(300)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { text: longText, pageCount: 3, confidence: 0.8 },
      }),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pages).toHaveLength(3)
      // Each page should have ~100 chars
      for (const page of result.data.pages) {
        expect(page.text.length).toBeGreaterThan(50)
      }
    }
  })

  it('returns single page when pageCount is 1', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { text: 'Single page text', pageCount: 1, confidence: 0.9 },
      }),
    }))
    mockPageCount.mockResolvedValue(1)

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pages).toHaveLength(1)
      expect(result.data.pages[0].text).toBe('Single page text')
    }
  })
})

// ==========================================================================
// Response error branches
// ==========================================================================
describe('response error handling branches', () => {
  beforeEach(() => {
    mockIsProxy.mockReturnValue(true)
    mockPageCount.mockResolvedValue(3)
  })

  it('handles json parse failure on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('invalid json')),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('OCR_FAILED')
      expect(result.error.message).toContain('502')
    }
  })

  it('handles 403 as AUTH_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('AUTH_ERROR')
    }
  })

  it('handles success:false in response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error: 'Processing failed',
      }),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('OCR_FAILED')
      expect(result.error.message).toBe('Processing failed')
    }
  })

  it('handles fetch throwing (network error in single PDF)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })

  it('handles non-Error throw', async () => {
    mockPageCount.mockRejectedValue('string error')

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain('Unknown error')
    }
  })
})

// ==========================================================================
// Page warnings and form field/table defaults
// ==========================================================================
describe('page processing branches', () => {
  beforeEach(() => {
    mockIsProxy.mockReturnValue(true)
    mockPageCount.mockResolvedValue(2)
  })

  it('assigns default values for missing formField page and table fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          text: 'text',
          pageCount: 1,
          confidence: 0.9,
          pages: [{ pageNumber: 1, text: 'text', confidence: 0.9 }],
          formFields: [{ name: 'Field1', value: 'Val1', confidence: 0.8 }], // no page
          tables: [{ rows: [{ cells: [] }] }], // no headerRows, confidence, page
        },
      }),
    }))
    mockPageCount.mockResolvedValue(1)

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.formFields[0].pageNumber).toBe(1) // default
      expect(result.data.tables[0].headerRows).toBe(0) // default
      expect(result.data.tables[0].confidence).toBe(0.9) // fallback to doc confidence
      expect(result.data.tables[0].pageNumber).toBe(1) // default
    }
  })

  it('uses document confidence when pages array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          text: 'text',
          pageCount: 1,
          confidence: 0.77,
          pages: [], // empty pages array → should use doc confidence
        },
      }),
    }))
    mockPageCount.mockResolvedValue(1)

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      // Empty pages means no pages to average, fallback to ocrData.confidence
      expect(result.data.confidence).toBe(0.77)
    }
  })

  it('uses file.type or defaults to application/pdf', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { text: 't', pageCount: 1, confidence: 0.9, pages: [{ pageNumber: 1, text: 't', confidence: 0.9 }] },
      }),
    }))
    mockPageCount.mockResolvedValue(1)

    // File without type
    const file = new File(['test'], 'doc.pdf', { type: '' })
    const result = await extractWithDocumentAI(file)
    expect(result.success).toBe(true)

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.mimeType).toBe('application/pdf') // fallback
  })
})

// ==========================================================================
// Chunked extraction branches
// ==========================================================================
describe('chunked extraction branches', () => {
  beforeEach(() => {
    mockIsProxy.mockReturnValue(true)
  })

  it('returns error when all chunks fail', async () => {
    mockPageCount.mockResolvedValue(20)
    mockSplitPdf.mockResolvedValue({
      totalPages: 20,
      chunks: [new Uint8Array(10), new Uint8Array(10)],
      pageRanges: [[1, 15], [16, 20]] as [number, number][],
      wasSplit: true,
    })
    mockChunkToFile.mockReturnValue(makeFile('chunk'))

    // Both chunks fail
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server down' }),
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('OCR_FAILED')
      expect(result.error.message).toContain('All')
      expect(result.error.details).toBeDefined()
    }
  })

  it('succeeds with partial chunks and adds warning', async () => {
    mockPageCount.mockResolvedValue(20)
    mockSplitPdf.mockResolvedValue({
      totalPages: 20,
      chunks: [new Uint8Array(10), new Uint8Array(10)],
      pageRanges: [[1, 15], [16, 20]] as [number, number][],
      wasSplit: true,
    })
    mockChunkToFile.mockReturnValue(makeFile('chunk'))

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First chunk succeeds
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              text: 'Chunk 1 text',
              pageCount: 15,
              confidence: 0.9,
              pages: Array.from({ length: 15 }, (_, i) => ({
                pageNumber: i + 1,
                text: `Page ${i + 1}`,
                confidence: 0.9,
              })),
            },
          }),
        })
      }
      // Second chunk fails
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Chunk failed' }),
      })
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.warnings.some(w => w.includes('failed'))).toBe(true)
      expect(result.data.pages.length).toBeGreaterThan(0)
    }
  })

  it('handles splitPdf throwing error', async () => {
    mockPageCount.mockResolvedValue(20)
    mockSplitPdf.mockRejectedValue(new Error('Split failed'))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('OCR_FAILED')
      expect(result.error.message).toContain('Split failed')
    }
  })

  it('applies correct page offsets in chunked results', async () => {
    mockPageCount.mockResolvedValue(20)
    mockSplitPdf.mockResolvedValue({
      totalPages: 20,
      chunks: [new Uint8Array(10), new Uint8Array(10)],
      pageRanges: [[1, 15], [16, 20]] as [number, number][],
      wasSplit: true,
    })
    mockChunkToFile.mockReturnValue(makeFile('chunk'))

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++
      const pageOffset = callCount === 1 ? 0 : 15
      const numPages = callCount === 1 ? 15 : 5
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            text: `Chunk ${callCount}`,
            pageCount: numPages,
            confidence: 0.88,
            pages: Array.from({ length: numPages }, (_, i) => ({
              pageNumber: i + 1,
              text: `P${i + 1 + pageOffset}`,
              confidence: 0.88,
            })),
          },
        }),
      })
    }))

    const result = await extractWithDocumentAI(makeFile())
    expect(result.success).toBe(true)
    if (result.success) {
      // Pages should be sorted and have correct offsets
      expect(result.data.pages.length).toBe(20)
      expect(result.data.pages[0].pageNumber).toBe(1)
      expect(result.data.pages[14].pageNumber).toBe(15)
      // Second chunk pages should have offset applied
      expect(result.data.pages[15].pageNumber).toBe(16)
      expect(result.data.pages[19].pageNumber).toBe(20)
      expect(result.data.metadata.warnings.some(w => w.includes('chunks'))).toBe(true)
    }
  })
})

// ==========================================================================
// computePdfHash edge case
// ==========================================================================
describe('computePdfHash edge branches', () => {
  it('handles large buffers', async () => {
    const largeBuffer = new ArrayBuffer(1024 * 100) // 100KB
    const hash = await computePdfHash(largeBuffer)
    expect(hash).toHaveLength(64)
  })
})
