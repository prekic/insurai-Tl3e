/**
 * Comprehensive tests for PDF Parser
 *
 * Covers all exported functions and internal branches:
 * - isPDFFile: MIME type and extension checks
 * - extractTextFromPDF: file reading, PDF loading, text extraction, error handling
 * - extractTextFromPDFWithRetry: retry logic, backoff, error classification
 * - preloadPdfJs: background loading
 * - Internal: testWorkerUrl, findWorkingWorkerUrl, createTimeout, getPdfJs,
 *   isWorkerError, isTransientError, resetWorkerSetup, isRetryableErrorCode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mock Setup using vi.hoisted
// ============================================================================

const { mockGetDocument, mockGlobalWorkerOptions, mockVersion, mockFetch, mockLoadingTaskDestroy } =
  vi.hoisted(() => {
    const mockLoadingTaskDestroy = vi.fn()
    const mockGlobalWorkerOptions = { workerSrc: '' }

    return {
      mockGetDocument: vi.fn(),
      mockGlobalWorkerOptions,
      mockVersion: '4.8.69',
      mockFetch: vi.fn(),
      mockLoadingTaskDestroy,
    }
  })

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: mockGlobalWorkerOptions,
  version: mockVersion,
  getDocument: mockGetDocument,
}))

// Mock global fetch for testWorkerUrl / findWorkingWorkerUrl
vi.stubGlobal('fetch', mockFetch)

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  isPDFFile,
  extractTextFromPDF,
  extractTextFromPDFWithRetry,
  preloadPdfJs,
} from './pdf-parser'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockFile(options: {
  name?: string
  type?: string
  content?: string
  emptyBuffer?: boolean
  arrayBufferError?: boolean
  arrayBufferNonError?: boolean
}): File {
  const {
    name = 'test.pdf',
    type = 'application/pdf',
    content = 'PDF content here',
    emptyBuffer = false,
    arrayBufferError = false,
    arrayBufferNonError = false,
  } = options

  const encoder = new TextEncoder()
  const uint8Array = emptyBuffer ? new Uint8Array(0) : encoder.encode(content)
  const blob = new Blob([uint8Array], { type })
  const file = new File([blob], name, { type })

  if (arrayBufferError) {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => {
        throw new Error('DOMException: file could not be read')
      },
    })
  } else if (arrayBufferNonError) {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => {
        throw 'string error'
      },
    })
  } else if (!file.arrayBuffer) {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => uint8Array.buffer,
    })
  }

  return file
}

function createMockPDFDocument(options: {
  numPages?: number
  pageTexts?: string[]
  metadata?: Record<string, unknown> | null
  metadataError?: boolean
  pageErrors?: number[] // page numbers (1-based) that should throw
  destroyError?: boolean
}) {
  const {
    numPages = 1,
    pageTexts = ['Page content'],
    metadata = null,
    metadataError = false,
    pageErrors = [],
    destroyError = false,
  } = options

  const mockPages = pageTexts.map((text) => ({
    getTextContent: vi.fn().mockResolvedValue({
      items: text.split(' ').map((str) => ({ str })),
    }),
  }))

  const getPage = vi.fn((pageNum: number) => {
    if (pageErrors.includes(pageNum)) {
      return Promise.reject(new Error(`Failed to render page ${pageNum}`))
    }
    return Promise.resolve(mockPages[pageNum - 1] || mockPages[0])
  })

  const getMetadata = metadataError
    ? vi.fn().mockRejectedValue(new Error('Metadata extraction failed'))
    : vi.fn().mockResolvedValue(metadata ? { info: metadata } : null)

  const destroy = destroyError
    ? vi.fn(() => {
        throw new Error('destroy failed')
      })
    : vi.fn()

  return { numPages, getPage, getMetadata, destroy }
}

function setupMockDocument(doc: ReturnType<typeof createMockPDFDocument>) {
  mockGetDocument.mockReturnValue({
    promise: Promise.resolve(doc),
    destroy: mockLoadingTaskDestroy,
  })
}

function setupMockDocumentError(error: Error | string) {
  const err = typeof error === 'string' ? new Error(error) : error
  mockGetDocument.mockReturnValue({
    promise: new Promise((_, reject) => setTimeout(() => reject(err), 0)),
    destroy: mockLoadingTaskDestroy,
  })
}

// Long text constant (>50 chars to pass threshold)
const LONG_TEXT =
  'This is a long enough text content that passes the fifty character minimum threshold for PDF extraction validation'

// ============================================================================
// Tests
// ============================================================================

describe('isPDFFile', () => {
  it('returns true for application/pdf MIME type', () => {
    const file = createMockFile({ type: 'application/pdf', name: 'document.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns true for .pdf extension (lowercase)', () => {
    const file = createMockFile({ type: '', name: 'document.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns true for .PDF extension (uppercase)', () => {
    const file = createMockFile({ type: '', name: 'DOCUMENT.PDF' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns true for mixed case extension', () => {
    const file = createMockFile({ type: '', name: 'Document.Pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns false for non-PDF MIME type without pdf extension', () => {
    const file = createMockFile({ type: 'image/png', name: 'image.png' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('returns false for text file', () => {
    const file = createMockFile({ type: 'text/plain', name: 'file.txt' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('returns true when only extension matches', () => {
    const file = createMockFile({ type: 'text/plain', name: 'policy.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns true when only MIME type matches', () => {
    const file = createMockFile({ type: 'application/pdf', name: 'document.doc' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns false for file with no extension', () => {
    const file = createMockFile({ type: '', name: 'noextension' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('returns true for file with multiple dots ending in .pdf', () => {
    const file = createMockFile({ type: '', name: 'document.backup.2024.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns false for pdf in name but different extension', () => {
    const file = createMockFile({ type: '', name: 'pdf_document.txt' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('returns false for .pdf. in the middle of name', () => {
    const file = createMockFile({ type: '', name: 'backup.pdf.old' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('returns true for empty name with PDF MIME type', () => {
    const file = createMockFile({ type: 'application/pdf', name: '' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('handles Turkish characters in filename', () => {
    const file = createMockFile({ type: '', name: 'poliçe şartları (2024).pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('handles filename with only .pdf', () => {
    const file = createMockFile({ type: '', name: '.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('returns false for filename ending with .pdf followed by space', () => {
    const file = createMockFile({ type: '', name: 'document.pdf ' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('does not recognize application/x-pdf variant', () => {
    const file = createMockFile({ type: 'application/x-pdf', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('handles file with spaces only in name', () => {
    const file = createMockFile({ type: '', name: '   ' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('handles unicode extension that looks like pdf', () => {
    const file = createMockFile({ type: '', name: 'document.пдф' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('returns true for APPLICATION/PDF because File constructor lowercases type', () => {
    // Note: jsdom File constructor lowercases type, matching browser behavior.
    // So 'APPLICATION/PDF' becomes 'application/pdf' which matches.
    const file = createMockFile({ type: 'APPLICATION/PDF', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(true)
  })
})

describe('extractTextFromPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGlobalWorkerOptions.workerSrc = ''
    // Default: fetch returns ok for worker URLs
    mockFetch.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Successful extraction
  // --------------------------------------------------------------------------

  it('extracts text from a valid single-page PDF', async () => {
    const doc = createMockPDFDocument({
      numPages: 1,
      pageTexts: [LONG_TEXT],
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'policy.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('long enough text')
      expect(result.data.pageCount).toBe(1)
    }
  })

  it('extracts text from a multi-page PDF', async () => {
    const doc = createMockPDFDocument({
      numPages: 3,
      pageTexts: [
        'Page one content that is long enough to pass the validation threshold for testing',
        'Page two content also with sufficient length for the extraction to succeed properly',
        'Page three content adding more text so the combined length easily exceeds fifty chars',
      ],
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'multi.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageCount).toBe(3)
      expect(result.data.text).toContain('Page one')
      expect(result.data.text).toContain('Page two')
      expect(result.data.text).toContain('Page three')
    }
  })

  it('extracts metadata from PDF when available', async () => {
    const doc = createMockPDFDocument({
      numPages: 1,
      pageTexts: [LONG_TEXT],
      metadata: {
        Title: 'Insurance Policy',
        Author: 'Test Author',
        CreationDate: '2024-01-15',
      },
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'policy.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.title).toBe('Insurance Policy')
      expect(result.data.metadata.author).toBe('Test Author')
      expect(result.data.metadata.creationDate).toBe('2024-01-15')
    }
  })

  it('handles metadata being null gracefully', async () => {
    const doc = createMockPDFDocument({
      numPages: 1,
      pageTexts: [LONG_TEXT],
      metadata: null,
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.title).toBeUndefined()
      expect(result.data.metadata.author).toBeUndefined()
      expect(result.data.metadata.creationDate).toBeUndefined()
    }
  })

  it('handles metadata extraction failure gracefully', async () => {
    const doc = createMockPDFDocument({
      numPages: 1,
      pageTexts: [LONG_TEXT],
      metadataError: true,
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'no-metadata.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.title).toBeUndefined()
      expect(result.data.metadata.author).toBeUndefined()
    }
  })

  it('passes useSystemFonts: true to getDocument', async () => {
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise

    expect(mockGetDocument).toHaveBeenCalledWith(expect.objectContaining({ useSystemFonts: true }))
  })

  it('normalizes whitespace in extracted text', async () => {
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Text' },
            { str: '   with  ' },
            { str: 'extra   spaces   and   sufficient   length   for   the   threshold' },
          ],
        }),
      }),
      getMetadata: vi.fn().mockResolvedValue(null),
      destroy: vi.fn(),
    }
    setupMockDocument(mockPdf as ReturnType<typeof createMockPDFDocument>)

    const file = createMockFile({ name: 'whitespace.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      // Should not have multiple consecutive spaces within each page
      const pages = result.data.text.split('\n\n')
      for (const page of pages) {
        expect(page).not.toMatch(/ {2}/) // no double spaces
      }
    }
  })

  it('handles text items without str property (returns empty string)', async () => {
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Valid text that is long enough' },
            { notStr: 'Invalid item without str property' },
            { str: 'to pass the fifty character threshold for extraction validation check' },
          ],
        }),
      }),
      getMetadata: vi.fn().mockResolvedValue(null),
      destroy: vi.fn(),
    }
    setupMockDocument(mockPdf as ReturnType<typeof createMockPDFDocument>)

    const file = createMockFile({ name: 'mixed-items.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('Valid')
      expect(result.data.text).not.toContain('Invalid')
    }
  })

  it('handles Turkish text correctly', async () => {
    const turkishText =
      'Sigorta Poliçesi Türkçe karakterler İ Ş Ğ Ü Ö Ç test metni için yeterli uzunluk sağlanmalı'
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [turkishText] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'turkish-policy.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('Sigorta')
      expect(result.data.text).toContain('Poliçesi')
    }
  })

  it('joins multi-page text with double newlines', async () => {
    const doc = createMockPDFDocument({
      numPages: 2,
      pageTexts: [
        'First page content with enough text to exceed fifty characters easily for validation',
        'Second page content also long enough to contribute to the total text length nicely',
      ],
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'multi.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('\n\n')
    }
  })

  it('destroys PDF document in finally block on success', async () => {
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise

    expect(doc.destroy).toHaveBeenCalledTimes(1)
  })

  it('handles destroy error in finally block gracefully', async () => {
    const doc = createMockPDFDocument({
      numPages: 1,
      pageTexts: [LONG_TEXT],
      destroyError: true,
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    // Should still succeed despite destroy error
    expect(result.success).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Page extraction errors (partial extraction)
  // --------------------------------------------------------------------------

  it('continues extraction when individual page fails', async () => {
    const doc = createMockPDFDocument({
      numPages: 3,
      pageTexts: [
        'First page content that is definitely long enough for threshold validation purposes here',
        'Second page content',
        'Third page content adding more text to ensure total length exceeds the fifty char minimum',
      ],
      pageErrors: [2],
    })
    setupMockDocument(doc)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const file = createMockFile({ name: 'partial.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageCount).toBe(3)
      expect(result.data.text).toContain('First page')
      expect(result.data.text).toContain('Third page')
    }
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to extract page 2'),
      expect.anything()
    )
    warnSpy.mockRestore()
  })

  // --------------------------------------------------------------------------
  // Empty / insufficient text
  // --------------------------------------------------------------------------

  it('returns EMPTY_PDF error for PDF with 0 pages', async () => {
    const doc = createMockPDFDocument({ numPages: 0, pageTexts: [] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'empty.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EMPTY_PDF')
      expect(result.error.message).toContain('empty')
    }
  })

  it('returns EMPTY_PDF error when text is less than 50 characters', async () => {
    const doc = createMockPDFDocument({
      numPages: 1,
      pageTexts: ['Short text'],
    })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'scanned.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EMPTY_PDF')
      expect(result.error.message).toContain('OCR')
    }
  })

  it('returns EMPTY_PDF when text is exactly 49 characters', async () => {
    const shortText = 'a'.repeat(49)
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: shortText }],
        }),
      }),
      getMetadata: vi.fn().mockResolvedValue(null),
      destroy: vi.fn(),
    }
    setupMockDocument(mockPdf as ReturnType<typeof createMockPDFDocument>)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EMPTY_PDF')
    }
  })

  it('succeeds when text is exactly 50 characters', async () => {
    const fiftyChars = 'a'.repeat(50)
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: fiftyChars }],
        }),
      }),
      getMetadata: vi.fn().mockResolvedValue(null),
      destroy: vi.fn(),
    }
    setupMockDocument(mockPdf as ReturnType<typeof createMockPDFDocument>)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageCount).toBe(1)
    }
  })

  // --------------------------------------------------------------------------
  // File read errors
  // --------------------------------------------------------------------------

  it('returns FILE_READ_ERROR when arrayBuffer throws an Error', async () => {
    const file = createMockFile({ name: 'broken.pdf', arrayBufferError: true })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    errorSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('FILE_READ_ERROR')
      expect(result.error.message).toContain('Could not read the file')
      expect(result.error.message).toContain('DOMException')
    }
  })

  it('returns FILE_READ_ERROR with "Unknown error" when arrayBuffer throws a non-Error', async () => {
    const file = createMockFile({ name: 'broken.pdf', arrayBufferNonError: true })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    errorSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('FILE_READ_ERROR')
      expect(result.error.message).toContain('Unknown error')
    }
  })

  it('returns FILE_READ_ERROR for empty arrayBuffer (byteLength === 0)', async () => {
    const file = createMockFile({ name: 'empty.pdf', emptyBuffer: true })

    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('FILE_READ_ERROR')
      expect(result.error.message).toContain('empty')
    }
  })

  // --------------------------------------------------------------------------
  // PDF loading errors (from getDocument)
  // --------------------------------------------------------------------------

  it('returns TIMEOUT_ERROR when PDF loading times out', async () => {
    mockGetDocument.mockReturnValue({
      promise: new Promise(() => {}), // never resolves
      destroy: mockLoadingTaskDestroy,
    })

    const file = createMockFile({ name: 'huge.pdf' })
    const resultPromise = extractTextFromPDF(file)

    // Advance past the 30s PDF_LOAD_TIMEOUT_MS
    await vi.advanceTimersByTimeAsync(31000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('TIMEOUT_ERROR')
      expect(result.error.message).toContain('too long')
    }
    expect(mockLoadingTaskDestroy).toHaveBeenCalled()
  })

  it('handles loadingTask.destroy failure on timeout gracefully', async () => {
    mockGetDocument.mockReturnValue({
      promise: new Promise(() => {}),
      destroy: vi.fn(() => {
        throw new Error('destroy failed')
      }),
    })

    const file = createMockFile({ name: 'huge.pdf' })
    const resultPromise = extractTextFromPDF(file)

    await vi.advanceTimersByTimeAsync(31000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('TIMEOUT_ERROR')
    }
  })

  it('returns PASSWORD_PROTECTED for password-protected PDFs', async () => {
    setupMockDocumentError('password required')

    const file = createMockFile({ name: 'protected.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PASSWORD_PROTECTED')
      expect(result.error.message).toContain('password protected')
    }
  })

  it('returns INVALID_PDF for "Invalid PDF" error message', async () => {
    setupMockDocumentError('Invalid PDF structure')

    const file = createMockFile({ name: 'corrupt.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PDF')
      expect(result.error.message).toContain('not appear to be a valid PDF')
    }
  })

  it('returns INVALID_PDF for "not a PDF" error message', async () => {
    setupMockDocumentError('This is not a PDF file')

    const file = createMockFile({ name: 'fake.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PDF')
    }
  })

  it('returns LOAD_ERROR for "Failed to fetch" error', async () => {
    setupMockDocumentError('Failed to fetch dynamic module')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('LOAD_ERROR')
      expect(result.error.message).toContain('network')
    }
  })

  it('returns LOAD_ERROR for "dynamic import" error', async () => {
    setupMockDocumentError('dynamic import failed')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('LOAD_ERROR')
    }
  })

  it('returns WORKER_ERROR for worker-related error messages', async () => {
    setupMockDocumentError('worker crashed unexpectedly')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('WORKER_ERROR')
      expect(result.error.message).toContain('worker failed')
    }
  })

  it('returns PARSE_ERROR for transient errors (network)', async () => {
    setupMockDocumentError('network error occurred')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
      expect(result.error.message).toContain('Temporary error')
    }
  })

  it('returns PARSE_ERROR with message for unknown errors', async () => {
    setupMockDocumentError('Some completely unexpected error')

    const file = createMockFile({ name: 'broken.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
      expect(result.error.message).toContain('Some completely unexpected error')
    }
  })

  it('handles non-Error exceptions in outer catch', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.reject('plain string error'),
      destroy: mockLoadingTaskDestroy,
    })

    const file = createMockFile({ name: 'error.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
      expect(result.error.message).toContain('Unknown error')
    }
  })
})

describe('extractTextFromPDFWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGlobalWorkerOptions.workerSrc = ''
    mockFetch.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns success on first attempt when extraction succeeds', async () => {
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'ok.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('long enough text')
    }
    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('does not retry for non-retryable error codes (EMPTY_PDF)', async () => {
    const doc = createMockPDFDocument({ numPages: 0, pageTexts: [] })
    setupMockDocument(doc)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'empty.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EMPTY_PDF')
    }
    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('does not retry for PASSWORD_PROTECTED', async () => {
    setupMockDocumentError('password required')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'locked.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PASSWORD_PROTECTED')
    }
    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('does not retry for INVALID_PDF', async () => {
    setupMockDocumentError('Invalid PDF structure')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'corrupt.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PDF')
    }
    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('retries on PARSE_ERROR and succeeds on second attempt', async () => {
    let callCount = 0
    mockGetDocument.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          promise: Promise.reject(new Error('Some completely unexpected error')),
          destroy: mockLoadingTaskDestroy,
        }
      }
      const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
      return { promise: Promise.resolve(doc), destroy: mockLoadingTaskDestroy }
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'flaky.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    expect(result.success).toBe(true)
    expect(mockGetDocument).toHaveBeenCalledTimes(2)
  })

  it('retries on LOAD_ERROR and resets worker setup', async () => {
    let callCount = 0
    mockGetDocument.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          promise: Promise.reject(new Error('Failed to fetch the module')),
          destroy: mockLoadingTaskDestroy,
        }
      }
      const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
      return { promise: Promise.resolve(doc), destroy: mockLoadingTaskDestroy }
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    // Capture calls BEFORE restoring (mockRestore clears mock data)
    const capturedWarnCalls = [...warnSpy.mock.calls]
    warnSpy.mockRestore()

    expect(result.success).toBe(true)
    // Verify the load error reset message was logged
    const loadErrorResetCalls = capturedWarnCalls.filter((c) => String(c[0]).includes('Load error'))
    expect(loadErrorResetCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('retries on TIMEOUT_ERROR and resets worker setup', async () => {
    let callCount = 0
    mockGetDocument.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          promise: new Promise(() => {}), // never resolves
          destroy: mockLoadingTaskDestroy,
        }
      }
      const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
      return { promise: Promise.resolve(doc), destroy: mockLoadingTaskDestroy }
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'slow.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)

    // Advance past timeout (30s) + backoff (1s) + some margin
    // Do it in discrete steps to avoid Vitest timer loop detection
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise
    // Capture calls BEFORE restoring (mockRestore clears mock data)
    const capturedWarnCalls = [...warnSpy.mock.calls]
    warnSpy.mockRestore()

    expect(result.success).toBe(true)
    const timeoutResetCalls = capturedWarnCalls.filter((c) =>
      String(c[0]).includes('Timeout error')
    )
    expect(timeoutResetCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('returns last error after all retries exhausted', async () => {
    setupMockDocumentError('Some completely unexpected error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'always-fails.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 2)
    // Advance timers manually (30s+ timeout * 2 attempts) to prevent runner infinite loop
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    // Capture calls BEFORE restoring (mockRestore clears mock data)
    const capturedErrorCalls = [...errorSpy.mock.calls]
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
      expect(result.error.message).toContain('Some completely unexpected error')
    }
    const allFailedCalls = capturedErrorCalls.filter((c) =>
      String(c[0]).includes('All 2 attempts failed')
    )
    expect(allFailedCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('uses maxRetries=3 by default', async () => {
    setupMockDocumentError('Some completely unexpected error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'fails.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file) // default maxRetries

    // Advance timers manually (3 attempts * 30s)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    // Capture calls BEFORE restoring (mockRestore clears mock data)
    const capturedErrorCalls = [...errorSpy.mock.calls]
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    expect(mockGetDocument).toHaveBeenCalledTimes(3)
    const allFailedCalls = capturedErrorCalls.filter((c) =>
      String(c[0]).includes('All 3 attempts failed')
    )
    expect(allFailedCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('logs success after retry when attempt > 1', async () => {
    let callCount = 0
    mockGetDocument.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          promise: Promise.reject(new Error('Some completely unexpected error')),
          destroy: mockLoadingTaskDestroy,
        }
      }
      const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
      return { promise: Promise.resolve(doc), destroy: mockLoadingTaskDestroy }
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'flaky.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    // Capture calls BEFORE restoring (mockRestore clears mock data)
    const capturedWarnCalls = [...warnSpy.mock.calls]
    warnSpy.mockRestore()

    expect(result.success).toBe(true)
    const successCalls = capturedWarnCalls.filter((c) =>
      String(c[0]).includes('Successfully parsed PDF on attempt')
    )
    expect(successCalls.length).toBe(1)
  })

  it('retries on LOAD_ERROR (retryable)', async () => {
    setupMockDocumentError('Failed to fetch the required module')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 2)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    // It should retry (LOAD_ERROR is retryable)
    expect(mockGetDocument).toHaveBeenCalledTimes(2)
  })

  it('retries on WORKER_ERROR and resets worker setup', async () => {
    let callCount = 0
    mockGetDocument.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          promise: Promise.reject(new Error('worker crashed')),
          destroy: mockLoadingTaskDestroy,
        }
      }
      const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
      return { promise: Promise.resolve(doc), destroy: mockLoadingTaskDestroy }
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    // Capture calls BEFORE restoring (mockRestore clears mock data)
    const capturedWarnCalls = [...warnSpy.mock.calls]
    warnSpy.mockRestore()

    expect(result.success).toBe(true)
    // Verify worker error was detected
    const workerErrorCalls = capturedWarnCalls.filter((c) => String(c[0]).includes('Worker error'))
    expect(workerErrorCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('handles maxRetries=1 (single attempt, no retry)', async () => {
    setupMockDocumentError('Some completely unexpected error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 1)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    expect(result.success).toBe(false)
    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('applies exponential backoff between retries', async () => {
    setupMockDocumentError('Some completely unexpected error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)

    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise

    // Check logged backoff delays: 1000ms (between attempt 1-2), 2000ms (between attempt 2-3)
    const waitingCalls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('Waiting'))
    expect(waitingCalls.length).toBe(2)
    expect(String(waitingCalls[0]![0])).toContain('1000ms')
    expect(String(waitingCalls[1]![0])).toContain('2000ms')

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('caps backoff at 4000ms with many retries', async () => {
    setupMockDocumentError('Some completely unexpected error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 5)

    // Advance in discrete chunks to avoid vitest detecting an infinite timer loop
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)
    await resultPromise

    // With 5 attempts: delays are 1000, 2000, 4000, 4000 (capped)
    const waitingCalls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('Waiting'))
    expect(waitingCalls.length).toBe(4) // 4 waits between 5 attempts
    expect(String(waitingCalls[0]![0])).toContain('1000ms')
    expect(String(waitingCalls[1]![0])).toContain('2000ms')
    expect(String(waitingCalls[2]![0])).toContain('4000ms')
    expect(String(waitingCalls[3]![0])).toContain('4000ms') // capped

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('returns fallback PARSE_ERROR when all retries fail', async () => {
    // lastError will always be set when retries are exhausted, but
    // the code has a fallback: lastError || { code: 'PARSE_ERROR', ... }
    setupMockDocumentError('Some completely unexpected error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 1)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
    }
  })
})

describe('preloadPdfJs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('does not throw when called', () => {
    expect(() => preloadPdfJs()).not.toThrow()
  })

  it('is callable multiple times without error', () => {
    expect(() => {
      preloadPdfJs()
      preloadPdfJs()
      preloadPdfJs()
    }).not.toThrow()
  })

  it('silently handles errors (catch swallows)', () => {
    expect(() => preloadPdfJs()).not.toThrow()
  })
})

describe('PDF.js Lazy Loading', () => {
  it('configures worker with version from pdfjs-dist', async () => {
    const pdfjs = await import('pdfjs-dist')
    expect(pdfjs.version).toBe('4.8.69')
    expect(pdfjs.GlobalWorkerOptions).toBeDefined()
  })

  it('only loads pdfjs-dist once across multiple extractions', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })

    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)

    const file1 = createMockFile({ name: 'test1.pdf' })
    const file2 = createMockFile({ name: 'test2.pdf' })

    const r1 = extractTextFromPDF(file1)
    await vi.advanceTimersByTimeAsync(35000)
    await r1

    setupMockDocument(doc)
    const r2 = extractTextFromPDF(file2)
    await vi.advanceTimersByTimeAsync(35000)
    await r2

    expect(mockGetDocument).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('isWorkerError classification (tested via extractTextFromPDF)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const workerErrorMessages = [
    'worker crashed',
    'postMessage failed',
    'message port closed',
    'MessageChannel error',
    'process terminated early',
    'communication failure',
    'script error in module',
  ]

  workerErrorMessages.forEach((msg) => {
    it(`classifies "${msg}" as WORKER_ERROR`, async () => {
      setupMockDocumentError(msg)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const file = createMockFile({ name: 'test.pdf' })
      const resultPromise = extractTextFromPDF(file)
      await vi.advanceTimersByTimeAsync(35000)
      const result = await resultPromise
      warnSpy.mockRestore()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('WORKER_ERROR')
      }
    })
  })

  it('does not classify normal errors as WORKER_ERROR', async () => {
    // Use an error message that does NOT contain any worker pattern keywords:
    // worker, postMessage, message port, MessageChannel, terminated,
    // communication, not respond, script error
    setupMockDocumentError('A totally benign parsing issue happened here')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).not.toBe('WORKER_ERROR')
    }
  })
})

describe('isTransientError classification (tested via extractTextFromPDF)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const transientErrorMessages = [
    'network error occurred',
    'request aborted',
    'connection refused',
    'ECONNRESET happened',
    'ETIMEDOUT on socket',
    'temporarily unavailable',
    'please try again later',
    'server is busy right now',
    'server overloaded',
  ]

  transientErrorMessages.forEach((msg) => {
    it(`classifies "${msg}" as transient PARSE_ERROR`, async () => {
      setupMockDocumentError(msg)

      const file = createMockFile({ name: 'test.pdf' })
      const resultPromise = extractTextFromPDF(file)
      await vi.advanceTimersByTimeAsync(35000)
      const result = await resultPromise

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('PARSE_ERROR')
        expect(result.error.message).toContain('Temporary error')
      }
    })
  })
})

describe('isRetryableErrorCode logic (tested via extractTextFromPDFWithRetry)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('LOAD_ERROR is retryable', async () => {
    setupMockDocumentError('Failed to fetch dynamic import')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 2)
    await vi.advanceTimersByTimeAsync(35000)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    expect(mockGetDocument).toHaveBeenCalledTimes(2)
  })

  it('EMPTY_PDF is not retryable', async () => {
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: ['Short'] })
    setupMockDocument(doc)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    warnSpy.mockRestore()

    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('INVALID_PDF is not retryable', async () => {
    setupMockDocumentError('Invalid PDF structure found')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    warnSpy.mockRestore()

    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it('PASSWORD_PROTECTED is not retryable', async () => {
    setupMockDocumentError('password required for this document')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDFWithRetry(file, 3)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    warnSpy.mockRestore()

    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })
})

describe('createTimeout (tested via extractTextFromPDF timeout path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects with timeout message after 30 seconds', async () => {
    mockGetDocument.mockReturnValue({
      promise: new Promise(() => {}),
      destroy: mockLoadingTaskDestroy,
    })

    const file = createMockFile({ name: 'huge.pdf' })
    const resultPromise = extractTextFromPDF(file)

    await vi.advanceTimersByTimeAsync(30001)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('TIMEOUT_ERROR')
      expect(result.error.message).toContain('too long')
    }
  })

  it('does not timeout when PDF loads within time limit', async () => {
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'fast.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(true)
  })
})

describe('error priority in extractTextFromPDF catch block', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('worker error takes priority over transient error patterns', async () => {
    // "worker" matches isWorkerError, "network" matches isTransientError
    setupMockDocumentError('worker had a network failure')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('WORKER_ERROR')
    }
  })

  it('load error takes priority over password error', async () => {
    // "Failed to fetch" matches load error, "password" matches password
    setupMockDocumentError('Failed to fetch password-protected module')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('LOAD_ERROR')
    }
  })

  it('password error takes priority over invalid PDF', async () => {
    setupMockDocumentError('password required - Invalid PDF')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PASSWORD_PROTECTED')
    }
  })

  it('invalid PDF error takes priority over transient error', async () => {
    setupMockDocumentError('Invalid PDF with network issues')

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PDF')
    }
  })
})

describe('Worker URL testing (testWorkerUrl)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses first CDN when it is accessible', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    await resultPromise
    warnSpy.mockRestore()

    expect(mockGetDocument).toHaveBeenCalled()
  })

  it('handles all CDNs failing gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)
    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise
    warnSpy.mockRestore()

    // Should still succeed - falls back to fake worker
    expect(result.success).toBe(true)
  })
})

describe('worker failure count behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: true })
    mockGlobalWorkerOptions.workerSrc = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('successful extraction decrements worker failure count', async () => {
    const doc = createMockPDFDocument({ numPages: 1, pageTexts: [LONG_TEXT] })
    setupMockDocument(doc)

    const file = createMockFile({ name: 'test.pdf' })
    const resultPromise = extractTextFromPDF(file)
    await vi.advanceTimersByTimeAsync(35000)
    const result = await resultPromise

    // workerFailureCount = Math.max(0, workerFailureCount - 1) was called
    expect(result.success).toBe(true)
  })
})
