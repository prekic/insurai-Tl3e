/**
 * PDF Splitter Utility
 *
 * Splits large PDFs into smaller chunks for processing by Document AI
 * which has a 15-page limit per request.
 */

import { PDFDocument } from 'pdf-lib'

/** Maximum pages per chunk for Document AI */
export const DOCUMENT_AI_PAGE_LIMIT = 15

/**
 * Result of splitting a PDF
 */
export interface PDFSplitResult {
  /** Original page count */
  totalPages: number
  /** Array of PDF chunks as Uint8Array */
  chunks: Uint8Array[]
  /** Page ranges for each chunk [startPage, endPage] (1-indexed) */
  pageRanges: Array<[number, number]>
  /** Whether splitting was needed */
  wasSplit: boolean
}

/**
 * Get the page count of a PDF file without fully loading it
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer()
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  return pdfDoc.getPageCount()
}

/**
 * Split a PDF file into chunks of maximum `maxPagesPerChunk` pages
 *
 * @param file - The PDF file to split
 * @param maxPagesPerChunk - Maximum pages per chunk (default: 15 for Document AI)
 * @returns Split result with chunks and metadata
 */
export async function splitPdf(
  file: File,
  maxPagesPerChunk: number = DOCUMENT_AI_PAGE_LIMIT
): Promise<PDFSplitResult> {
  const buffer = await file.arrayBuffer()
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const totalPages = pdfDoc.getPageCount()

  // If within limit, no splitting needed
  if (totalPages <= maxPagesPerChunk) {
    return {
      totalPages,
      chunks: [new Uint8Array(buffer)],
      pageRanges: [[1, totalPages]],
      wasSplit: false,
    }
  }

  // Calculate number of chunks needed
  const numChunks = Math.ceil(totalPages / maxPagesPerChunk)
  const chunks: Uint8Array[] = []
  const pageRanges: Array<[number, number]> = []

  console.warn(`[PDF Splitter] Splitting ${totalPages} pages into ${numChunks} chunks of max ${maxPagesPerChunk} pages`)

  for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
    const startPage = chunkIndex * maxPagesPerChunk
    const endPage = Math.min(startPage + maxPagesPerChunk, totalPages)

    // Create a new PDF document for this chunk
    const chunkDoc = await PDFDocument.create()

    // Copy pages from original to chunk
    const pageIndices = Array.from(
      { length: endPage - startPage },
      (_, i) => startPage + i
    )
    const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices)

    for (const page of copiedPages) {
      chunkDoc.addPage(page)
    }

    // Save chunk as bytes
    const chunkBytes = await chunkDoc.save()
    chunks.push(chunkBytes)
    pageRanges.push([startPage + 1, endPage]) // 1-indexed

    console.warn(`[PDF Splitter] Created chunk ${chunkIndex + 1}/${numChunks}: pages ${startPage + 1}-${endPage}`)
  }

  return {
    totalPages,
    chunks,
    pageRanges,
    wasSplit: true,
  }
}

/**
 * Convert a Uint8Array chunk to a File object for processing
 */
export function chunkToFile(
  chunk: Uint8Array,
  originalFilename: string,
  chunkIndex: number,
  pageRange: [number, number]
): File {
  const blob = new Blob([chunk], { type: 'application/pdf' })
  const chunkFilename = `${originalFilename.replace('.pdf', '')}_chunk${chunkIndex + 1}_pages${pageRange[0]}-${pageRange[1]}.pdf`
  return new File([blob], chunkFilename, { type: 'application/pdf' })
}
