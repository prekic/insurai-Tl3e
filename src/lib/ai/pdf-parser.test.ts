/**
 * Tests for PDF Parser
 * Tests isPDFFile function and extractTextFromPDF
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Define mocks using vi.hoisted
const { mockGetDocument } = vi.hoisted(() => {
  const mockLoadingTask = {
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(),
      getMetadata: vi.fn(),
    }),
  }

  return {
    mockGetDocument: vi.fn(() => mockLoadingTask),
    mockLoadingTask,
  }
})

// Mock pdfjs-dist to avoid DOMMatrix dependency in Node.js
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '4.0.0',
  getDocument: mockGetDocument,
}))

import { isPDFFile, extractTextFromPDF } from './pdf-parser'

// Helper to create mock File with arrayBuffer support
function createMockFile(options: {
  name?: string
  type?: string
  content?: string
}): File {
  const { name = 'test.pdf', type = 'application/pdf', content = 'PDF content' } = options

  const encoder = new TextEncoder()
  const uint8Array = encoder.encode(content)
  const blob = new Blob([uint8Array], { type })
  const file = new File([blob], name, { type })

  // Add arrayBuffer method if not present (jsdom doesn't implement it)
  if (!file.arrayBuffer) {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => uint8Array.buffer,
    })
  }

  return file
}

// Helper to create a mock PDF document
function createMockPDFDocument(options: {
  numPages?: number
  pageTexts?: string[]
  metadata?: Record<string, unknown> | null
}) {
  const { numPages = 1, pageTexts = ['Page content'], metadata = null } = options

  const mockPages = pageTexts.map((text) => ({
    getTextContent: vi.fn().mockResolvedValue({
      items: text.split(' ').map((str) => ({ str })),
    }),
  }))

  return {
    numPages,
    getPage: vi.fn((pageNum: number) => Promise.resolve(mockPages[pageNum - 1])),
    getMetadata: vi.fn().mockResolvedValue(
      metadata
        ? { info: metadata }
        : null
    ),
  }
}

describe('isPDFFile', () => {
  it('should return true for application/pdf MIME type', () => {
    const file = createMockFile({ type: 'application/pdf', name: 'document.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should return true for .pdf extension (lowercase)', () => {
    const file = createMockFile({ type: '', name: 'document.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should return true for .PDF extension (uppercase)', () => {
    const file = createMockFile({ type: '', name: 'DOCUMENT.PDF' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should return true for mixed case extension', () => {
    const file = createMockFile({ type: '', name: 'Document.Pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should return false for non-PDF MIME type without pdf extension', () => {
    const file = createMockFile({ type: 'image/png', name: 'image.png' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should return false for non-PDF extension', () => {
    const file = createMockFile({ type: '', name: 'document.docx' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should return false for text file', () => {
    const file = createMockFile({ type: 'text/plain', name: 'file.txt' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should return false for image file', () => {
    const file = createMockFile({ type: 'image/jpeg', name: 'photo.jpg' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should return true when only extension matches', () => {
    const file = createMockFile({ type: 'text/plain', name: 'policy.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should return true when only MIME type matches', () => {
    const file = createMockFile({ type: 'application/pdf', name: 'document.doc' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should handle files with no extension', () => {
    const file = createMockFile({ type: '', name: 'noextension' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should handle files with multiple dots', () => {
    const file = createMockFile({ type: '', name: 'document.backup.2024.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should handle files with pdf in name but different extension', () => {
    const file = createMockFile({ type: '', name: 'pdf_document.txt' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should handle empty file name with PDF MIME type', () => {
    const file = createMockFile({ type: 'application/pdf', name: '' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should handle special characters in filename', () => {
    const file = createMockFile({ type: '', name: 'poliçe şartları (2024).pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should handle very long filename', () => {
    const longName = 'a'.repeat(200) + '.pdf'
    const file = createMockFile({ type: '', name: longName })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should handle filename with only extension', () => {
    const file = createMockFile({ type: '', name: '.pdf' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should handle filename ending with .pdf followed by spaces', () => {
    const file = createMockFile({ type: '', name: 'document.pdf ' })
    expect(isPDFFile(file)).toBe(false)
  })
})

describe('PDF MIME Types', () => {
  it('should recognize application/pdf', () => {
    const file = createMockFile({ type: 'application/pdf', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should not recognize application/x-pdf', () => {
    const file = createMockFile({ type: 'application/x-pdf', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should handle uppercase MIME type', () => {
    const file = createMockFile({ type: 'APPLICATION/PDF', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(true)
  })
})

describe('Edge Cases', () => {
  it('should handle file with only spaces in name', () => {
    const file = createMockFile({ type: '', name: '   ' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should handle file with unicode extension', () => {
    const file = createMockFile({ type: '', name: 'document.пдф' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should handle file with .PDF. in the middle', () => {
    const file = createMockFile({ type: '', name: 'backup.pdf.old' })
    expect(isPDFFile(file)).toBe(false)
  })
})

describe('extractTextFromPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should extract text from a valid PDF', async () => {
    const mockPdf = createMockPDFDocument({
      numPages: 1,
      pageTexts: ['This is a test policy document with enough text to pass the threshold'],
    })
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'policy.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('This')
      expect(result.data.text).toContain('policy')
      expect(result.data.pageCount).toBe(1)
    }
  })

  it('should extract text from multi-page PDF', async () => {
    const mockPdf = createMockPDFDocument({
      numPages: 3,
      pageTexts: [
        'Page one content with sufficient text to pass the threshold for extraction',
        'Page two content with more text for the second page of the document',
        'Page three content with additional text for the final page',
      ],
    })
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'multi-page.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageCount).toBe(3)
      expect(result.data.text).toContain('Page one')
      expect(result.data.text).toContain('Page two')
      expect(result.data.text).toContain('Page three')
    }
  })

  it('should extract metadata from PDF', async () => {
    const mockPdf = createMockPDFDocument({
      numPages: 1,
      pageTexts: ['Document content with sufficient text length to pass validation requirements'],
      metadata: {
        Title: 'Insurance Policy',
        Author: 'Test Author',
        CreationDate: '2024-01-15',
      },
    })
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'policy.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.title).toBe('Insurance Policy')
      expect(result.data.metadata.author).toBe('Test Author')
      expect(result.data.metadata.creationDate).toBe('2024-01-15')
    }
  })

  it('should return EMPTY_PDF error for PDF with 0 pages', async () => {
    const mockPdf = { numPages: 0, getPage: vi.fn(), getMetadata: vi.fn() }
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'empty.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EMPTY_PDF')
      expect(result.error.message).toContain('empty')
    }
  })

  it('should return EMPTY_PDF error for PDF with very little text', async () => {
    const mockPdf = createMockPDFDocument({
      numPages: 1,
      pageTexts: ['Short'], // Less than 50 characters
    })
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'scanned.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EMPTY_PDF')
      expect(result.error.message).toContain('OCR')
    }
  })

  it('should return PASSWORD_PROTECTED error for protected PDFs', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.reject(new Error('password required')),
    })

    const file = createMockFile({ name: 'protected.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PASSWORD_PROTECTED')
      expect(result.error.message).toContain('password protected')
    }
  })

  it('should return INVALID_PDF error for invalid PDF files', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure')),
    })

    const file = createMockFile({ name: 'corrupt.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PDF')
      expect(result.error.message).toContain('not appear to be a valid PDF')
    }
  })

  it('should return PARSE_ERROR for other errors', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.reject(new Error('Unknown error occurred')),
    })

    const file = createMockFile({ name: 'broken.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
      expect(result.error.message).toContain('Failed to parse PDF')
    }
  })

  it('should handle non-Error exceptions', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.reject('String error'),
    })

    const file = createMockFile({ name: 'error.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR')
      expect(result.error.message).toContain('Unknown error')
    }
  })

  it('should handle metadata fetch errors gracefully', async () => {
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: 'This is enough text content for the PDF validation threshold to pass'.split(' ').map(str => ({ str })),
        }),
      }),
      getMetadata: vi.fn().mockRejectedValue(new Error('Metadata error')),
    }
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'no-metadata.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.title).toBeUndefined()
      expect(result.data.metadata.author).toBeUndefined()
    }
  })

  it('should handle text items without str property', async () => {
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Valid' },
            { notStr: 'Invalid' }, // Missing str property
            { str: 'text that is long enough to pass the fifty character threshold' },
          ],
        }),
      }),
      getMetadata: vi.fn().mockResolvedValue(null),
    }
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'mixed-items.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('Valid')
      expect(result.data.text).not.toContain('Invalid')
    }
  })

  it('should normalize whitespace in extracted text', async () => {
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Text' },
            { str: '   with  ' },
            { str: 'extra   spaces that should be normalized properly' },
          ],
        }),
      }),
      getMetadata: vi.fn().mockResolvedValue(null),
    }
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'whitespace.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      // Should not have multiple consecutive spaces
      expect(result.data.text).not.toMatch(/\s{2,}/)
    }
  })

  it('should call getDocument with correct options', async () => {
    const mockPdf = createMockPDFDocument({
      numPages: 1,
      pageTexts: ['Text content that is long enough to pass the validation threshold for PDF'],
    })
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'test.pdf' })
    await extractTextFromPDF(file)

    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        useSystemFonts: true,
      })
    )
  })

  it('should handle Turkish text correctly', async () => {
    const turkishText = 'Sigorta Poliçesi - Türkçe karakterler: İ, Ş, Ğ, Ü, Ö, Ç, ı test metni için yeterli uzunluk'
    const mockPdf = createMockPDFDocument({
      numPages: 1,
      pageTexts: [turkishText],
    })
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) })

    const file = createMockFile({ name: 'turkish-policy.pdf' })
    const result = await extractTextFromPDF(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('Sigorta')
      expect(result.data.text).toContain('Poliçesi')
    }
  })
})
