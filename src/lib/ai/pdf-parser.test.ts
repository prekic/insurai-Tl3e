/**
 * Tests for PDF Parser
 * Tests isPDFFile function and PDFParseResult/PDFParseError types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pdfjs-dist to avoid DOMMatrix dependency in Node.js
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '4.0.0',
  getDocument: vi.fn(),
}))

import { isPDFFile } from './pdf-parser'

// Helper to create mock File
function createMockFile(options: {
  name?: string
  type?: string
  content?: ArrayBuffer
}): File {
  const { name = 'test.pdf', type = 'application/pdf', content = new ArrayBuffer(8) } = options

  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

// =============================================================================
// isPDFFile Tests
// =============================================================================

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
    // File with wrong MIME type but correct extension
    const file = createMockFile({ type: 'text/plain', name: 'policy.pdf' })

    expect(isPDFFile(file)).toBe(true)
  })

  it('should return true when only MIME type matches', () => {
    // File with correct MIME type but non-pdf extension
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
    // Note: This tests the exact behavior - trailing spaces after .pdf
    const file = createMockFile({ type: '', name: 'document.pdf ' })

    // .pdf with trailing space won't match endsWith('.pdf')
    expect(isPDFFile(file)).toBe(false)
  })
})

// =============================================================================
// PDF MIME Type Tests
// =============================================================================

describe('PDF MIME Types', () => {
  it('should recognize application/pdf', () => {
    const file = createMockFile({ type: 'application/pdf', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(true)
  })

  it('should not recognize application/x-pdf', () => {
    // Some older systems use this, but our function only checks application/pdf
    const file = createMockFile({ type: 'application/x-pdf', name: 'test.doc' })
    expect(isPDFFile(file)).toBe(false)
  })

  it('should handle uppercase MIME type', () => {
    // File API may normalize MIME type to lowercase
    const file = createMockFile({ type: 'APPLICATION/PDF', name: 'test.doc' })
    // In jsdom/Node environment, File normalizes type to lowercase
    expect(isPDFFile(file)).toBe(true)
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

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
