/**
 * Tests for PDF Splitter Utility
 *
 * Tests the PDF splitting functionality used for Document AI's 15-page limit.
 * Uses pdf-lib to create real PDF files for testing.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  DOCUMENT_AI_PAGE_LIMIT,
  getPdfPageCount,
  splitPdf,
  chunkToFile,
} from './pdf-splitter'

/**
 * jsdom's File/Blob implementation does not support .arrayBuffer().
 * Polyfill it once before all tests so the source code works.
 */
beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(this)
      })
    }
  }
})

/**
 * Helper: create a real PDF File with the specified number of pages using pdf-lib
 */
async function createTestPdf(pageCount: number, filename = 'test.pdf'): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    doc.addPage()
  }
  const bytes = await doc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return new File([blob], filename, { type: 'application/pdf' })
}

// ---------------------------------------------------------------------------
// DOCUMENT_AI_PAGE_LIMIT
// ---------------------------------------------------------------------------
describe('DOCUMENT_AI_PAGE_LIMIT', () => {
  it('should be 15', () => {
    expect(DOCUMENT_AI_PAGE_LIMIT).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// getPdfPageCount
// ---------------------------------------------------------------------------
describe('getPdfPageCount', () => {
  it('returns the correct page count for a single-page PDF', async () => {
    const file = await createTestPdf(1)
    const count = await getPdfPageCount(file)
    expect(count).toBe(1)
  })

  it('returns the correct page count for a multi-page PDF', async () => {
    const file = await createTestPdf(7)
    const count = await getPdfPageCount(file)
    expect(count).toBe(7)
  })

  it('returns the correct page count for a large PDF', async () => {
    const file = await createTestPdf(31)
    const count = await getPdfPageCount(file)
    expect(count).toBe(31)
  })
})

// ---------------------------------------------------------------------------
// chunkToFile
// ---------------------------------------------------------------------------
describe('chunkToFile', () => {
  it('creates a File with the correct naming pattern', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = chunkToFile(chunk, 'policy.pdf', 0, [1, 15])
    expect(result.name).toBe('policy_chunk1_pages1-15.pdf')
  })

  it('uses 1-based chunk index in the filename', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = chunkToFile(chunk, 'report.pdf', 2, [31, 45])
    expect(result.name).toBe('report_chunk3_pages31-45.pdf')
  })

  it('strips .pdf extension before constructing filename', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = chunkToFile(chunk, 'my-document.pdf', 0, [1, 10])
    expect(result.name).toBe('my-document_chunk1_pages1-10.pdf')
  })

  it('handles filenames without .pdf extension', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = chunkToFile(chunk, 'document', 0, [1, 5])
    expect(result.name).toBe('document_chunk1_pages1-5.pdf')
  })

  it('creates a File with application/pdf MIME type', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = chunkToFile(chunk, 'test.pdf', 0, [1, 15])
    expect(result.type).toBe('application/pdf')
  })

  it('creates a File that contains the chunk data', async () => {
    const chunk = new Uint8Array([10, 20, 30, 40, 50])
    const result = chunkToFile(chunk, 'test.pdf', 0, [1, 1])
    const arrayBuffer = await result.arrayBuffer()
    const resultBytes = new Uint8Array(arrayBuffer)
    expect(resultBytes).toEqual(chunk)
  })

  it('handles a single-page range in filename', () => {
    const chunk = new Uint8Array([1])
    const result = chunkToFile(chunk, 'scan.pdf', 1, [16, 16])
    expect(result.name).toBe('scan_chunk2_pages16-16.pdf')
  })
})

// ---------------------------------------------------------------------------
// splitPdf
// ---------------------------------------------------------------------------
describe('splitPdf', () => {
  it('does not split a single-page PDF', async () => {
    const file = await createTestPdf(1)
    const result = await splitPdf(file)

    expect(result.wasSplit).toBe(false)
    expect(result.totalPages).toBe(1)
    expect(result.chunks).toHaveLength(1)
    expect(result.pageRanges).toEqual([[1, 1]])
  })

  it('does not split a PDF at exactly the page limit (15 pages)', async () => {
    const file = await createTestPdf(15)
    const result = await splitPdf(file)

    expect(result.wasSplit).toBe(false)
    expect(result.totalPages).toBe(15)
    expect(result.chunks).toHaveLength(1)
    expect(result.pageRanges).toEqual([[1, 15]])
  })

  it('splits a 16-page PDF into 2 chunks (15 + 1)', async () => {
    const file = await createTestPdf(16)
    const result = await splitPdf(file)

    expect(result.wasSplit).toBe(true)
    expect(result.totalPages).toBe(16)
    expect(result.chunks).toHaveLength(2)
    expect(result.pageRanges).toEqual([[1, 15], [16, 16]])
  })

  it('splits a 30-page PDF into 2 chunks (15 + 15)', async () => {
    const file = await createTestPdf(30)
    const result = await splitPdf(file)

    expect(result.wasSplit).toBe(true)
    expect(result.totalPages).toBe(30)
    expect(result.chunks).toHaveLength(2)
    expect(result.pageRanges).toEqual([[1, 15], [16, 30]])
  })

  it('splits a 31-page PDF into 3 chunks (15 + 15 + 1)', async () => {
    const file = await createTestPdf(31)
    const result = await splitPdf(file)

    expect(result.wasSplit).toBe(true)
    expect(result.totalPages).toBe(31)
    expect(result.chunks).toHaveLength(3)
    expect(result.pageRanges).toEqual([[1, 15], [16, 30], [31, 31]])
  })

  it('uses custom maxPagesPerChunk when provided', async () => {
    const file = await createTestPdf(12)
    const result = await splitPdf(file, 5)

    expect(result.wasSplit).toBe(true)
    expect(result.totalPages).toBe(12)
    expect(result.chunks).toHaveLength(3)
    expect(result.pageRanges).toEqual([[1, 5], [6, 10], [11, 12]])
  })

  it('does not split when pages are within custom limit', async () => {
    const file = await createTestPdf(5)
    const result = await splitPdf(file, 10)

    expect(result.wasSplit).toBe(false)
    expect(result.totalPages).toBe(5)
    expect(result.chunks).toHaveLength(1)
    expect(result.pageRanges).toEqual([[1, 5]])
  })

  it('produces page ranges that are 1-indexed', async () => {
    const file = await createTestPdf(20)
    const result = await splitPdf(file)

    // First chunk starts at page 1, not 0
    expect(result.pageRanges[0][0]).toBe(1)
    // Second chunk starts at page 16
    expect(result.pageRanges[1][0]).toBe(16)
    // Last page range ends at the total page count
    const lastRange = result.pageRanges[result.pageRanges.length - 1]
    expect(lastRange[1]).toBe(20)
  })

  it('produces chunks that are valid Uint8Arrays', async () => {
    const file = await createTestPdf(20)
    const result = await splitPdf(file)

    for (const chunk of result.chunks) {
      expect(chunk).toBeInstanceOf(Uint8Array)
      expect(chunk.length).toBeGreaterThan(0)
    }
  })

  it('produces chunks that are valid PDF documents with correct page counts', async () => {
    const file = await createTestPdf(16)
    const result = await splitPdf(file)

    // First chunk should have 15 pages
    const chunk1Doc = await PDFDocument.load(result.chunks[0])
    expect(chunk1Doc.getPageCount()).toBe(15)

    // Second chunk should have 1 page
    const chunk2Doc = await PDFDocument.load(result.chunks[1])
    expect(chunk2Doc.getPageCount()).toBe(1)
  })

  it('preserves totalPages accurately across all page ranges', async () => {
    const file = await createTestPdf(47)
    const result = await splitPdf(file)

    expect(result.totalPages).toBe(47)

    // Sum of pages across all ranges should equal totalPages
    let totalFromRanges = 0
    for (const [start, end] of result.pageRanges) {
      totalFromRanges += end - start + 1
    }
    expect(totalFromRanges).toBe(47)
  })

  it('page ranges are contiguous with no gaps or overlaps', async () => {
    const file = await createTestPdf(50)
    const result = await splitPdf(file)

    for (let i = 1; i < result.pageRanges.length; i++) {
      const prevEnd = result.pageRanges[i - 1][1]
      const currStart = result.pageRanges[i][0]
      expect(currStart).toBe(prevEnd + 1)
    }

    // First range starts at 1
    expect(result.pageRanges[0][0]).toBe(1)
    // Last range ends at totalPages
    expect(result.pageRanges[result.pageRanges.length - 1][1]).toBe(50)
  })

  it('returns original bytes as single chunk when no split is needed', async () => {
    const file = await createTestPdf(3)
    const result = await splitPdf(file)

    expect(result.wasSplit).toBe(false)
    expect(result.chunks).toHaveLength(1)

    // The single chunk should be a valid PDF with 3 pages
    const doc = await PDFDocument.load(result.chunks[0])
    expect(doc.getPageCount()).toBe(3)
  })

  it('handles maxPagesPerChunk of 1 (every page is a chunk)', async () => {
    const file = await createTestPdf(3)
    const result = await splitPdf(file, 1)

    expect(result.wasSplit).toBe(true)
    expect(result.totalPages).toBe(3)
    expect(result.chunks).toHaveLength(3)
    expect(result.pageRanges).toEqual([[1, 1], [2, 2], [3, 3]])

    // Verify each chunk has exactly 1 page
    for (const chunk of result.chunks) {
      const doc = await PDFDocument.load(chunk)
      expect(doc.getPageCount()).toBe(1)
    }
  })
})
