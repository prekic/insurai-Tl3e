/**
 * Document AI OCR Extraction Module
 *
 * ALWAYS uses Google Document AI OCR for text extraction, even for native text PDFs.
 * This ensures consistent, high-quality text reconstruction across all document types.
 *
 * Benefits:
 * - Standardized input quality for AI extraction
 * - Avoids silent corruption from pdf.js glyph-splitting
 * - Per-page text with confidence scores
 * - Form field and table detection included
 * - Automatic PDF splitting for documents >15 pages
 *
 * Cost: ~$0.001-0.01 per page (cheaper than engineering time debugging bad extraction)
 */

import { isProxyConfigured, getProxyUrl } from './config'
import { splitPdf, chunkToFile, getPdfPageCount, DOCUMENT_AI_PAGE_LIMIT } from './pdf-splitter'

// ============================================================================
// TYPES
// ============================================================================

export interface PageText {
  /** 1-indexed page number */
  pageNumber: number
  /** Extracted text for this page */
  text: string
  /** Confidence score 0-1 for this page */
  confidence: number
  /** Warnings or issues detected on this page */
  warnings: string[]
}

export interface DocumentOCRResult {
  /** Full document text (all pages concatenated) */
  text: string
  /** Per-page text extraction results */
  pages: PageText[]
  /** Total page count */
  pageCount: number
  /** Overall document confidence (average of page confidences) */
  confidence: number
  /** SHA-256 hash of the original PDF */
  pdfHash: string
  /** Form fields extracted by Document AI */
  formFields: FormField[]
  /** Tables extracted by Document AI */
  tables: Table[]
  /** Processing metadata */
  metadata: {
    backend: 'document-ai'
    processingTimeMs: number
    modelVersion?: string
    warnings: string[]
  }
}

export interface FormField {
  name: string
  value: string
  confidence: number
  pageNumber: number
}

export interface Table {
  rows: TableRow[]
  headerRows: number
  confidence: number
  pageNumber: number
}

export interface TableRow {
  cells: TableCell[]
}

export interface TableCell {
  text: string
  rowSpan: number
  colSpan: number
  confidence: number
}

export interface DocumentOCRError {
  success: false
  error: {
    code: 'NO_OCR_CONFIG' | 'OCR_FAILED' | 'INVALID_DOCUMENT' | 'NETWORK_ERROR' | 'AUTH_ERROR'
    message: string
    details?: string
  }
}

export type DocumentOCRResponse =
  | { success: true; data: DocumentOCRResult }
  | DocumentOCRError

// ============================================================================
// PDF HASH COMPUTATION
// ============================================================================

/**
 * Compute SHA-256 hash of PDF buffer
 */
export async function computePdfHash(pdfBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', pdfBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compute SHA-256 hash from File object
 */
export async function computePdfHashFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return computePdfHash(buffer)
}

// ============================================================================
// DOCUMENT AI OCR EXTRACTION
// ============================================================================

/**
 * Extract text from PDF using Google Document AI OCR
 *
 * This is the PRIMARY extraction method - used for ALL PDFs regardless of
 * whether they have native text or are scanned images.
 *
 * For PDFs with more than 15 pages, automatically splits into chunks
 * and processes each chunk separately, then combines results.
 */
export async function extractWithDocumentAI(file: File): Promise<DocumentOCRResponse> {
  const startTime = performance.now()

  // Check if OCR is configured
  if (!isProxyConfigured()) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'Document AI OCR is not configured. Ensure the backend server is running.',
      },
    }
  }

  try {
    // Check page count first to determine if splitting is needed
    const pageCount = await getPdfPageCount(file)
    console.warn(`[Document AI] PDF has ${pageCount} pages (limit: ${DOCUMENT_AI_PAGE_LIMIT})`)

    if (pageCount > DOCUMENT_AI_PAGE_LIMIT) {
      // Split and process in chunks
      console.warn(`[Document AI] PDF exceeds ${DOCUMENT_AI_PAGE_LIMIT}-page limit, splitting into chunks...`)
      return await extractWithDocumentAIChunked(file, startTime)
    }

    // Process single PDF (within page limit)
    return await extractSinglePdfWithDocumentAI(file, startTime)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `Failed to process PDF: ${errorMessage}`,
      },
    }
  }
}

/**
 * Process a single PDF file (must be within 15-page limit)
 */
async function extractSinglePdfWithDocumentAI(
  file: File,
  startTime: number,
  pageOffset: number = 0
): Promise<DocumentOCRResponse> {
  try {
    // Compute PDF hash for deduplication/caching
    const pdfHash = await computePdfHashFromFile(file)

    // Convert file to base64
    const buffer = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)

    // Call Document AI OCR endpoint
    const proxyUrl = getProxyUrl()
    const response = await fetch(`${proxyUrl}/api/ai/ocr/document-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentBase64: base64,
        mimeType: file.type || 'application/pdf',
        languageHints: ['tr', 'en'], // Turkish primary, English secondary
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: {
          code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'OCR_FAILED',
          message: errorData.error || `Document AI OCR failed: ${response.status}`,
          details: errorData.details,
        },
      }
    }

    const result = await response.json()

    if (!result.success) {
      return {
        success: false,
        error: {
          code: 'OCR_FAILED',
          message: result.error || 'Document AI OCR failed',
        },
      }
    }

    const processingTimeMs = Math.round(performance.now() - startTime)

    // Transform server response to our structured format
    const ocrData = result.data as {
      text: string
      pageCount: number
      confidence: number
      formFields?: Array<{ name: string; value: string; confidence: number; page?: number }>
      tables?: Array<{ rows: TableRow[]; headerRows?: number; confidence?: number; page?: number }>
      pages?: Array<{ pageNumber: number; text: string; confidence: number }>
    }

    // Build per-page text results
    const pages: PageText[] = []
    const warnings: string[] = []

    if (ocrData.pages && ocrData.pages.length > 0) {
      // Use page-by-page data from Document AI
      for (const page of ocrData.pages) {
        const pageWarnings: string[] = []
        // Apply page offset for chunked processing
        const actualPageNumber = page.pageNumber + pageOffset

        // Check for low confidence
        if (page.confidence < 0.7) {
          pageWarnings.push(`Low OCR confidence: ${(page.confidence * 100).toFixed(1)}%`)
        }

        // Check for very short text (might indicate image-only page)
        if (page.text.length < 50) {
          pageWarnings.push('Very little text extracted - page may be image-only')
        }

        pages.push({
          pageNumber: actualPageNumber,
          text: page.text,
          confidence: page.confidence,
          warnings: pageWarnings,
        })

        if (pageWarnings.length > 0) {
          warnings.push(`Page ${actualPageNumber}: ${pageWarnings.join(', ')}`)
        }
      }
    } else {
      // Fallback: split full text by page markers or estimate
      const fullText = ocrData.text
      const pageTexts = splitTextByPages(fullText, ocrData.pageCount)

      for (let i = 0; i < pageTexts.length; i++) {
        pages.push({
          pageNumber: i + 1 + pageOffset, // Apply page offset
          text: pageTexts[i],
          confidence: ocrData.confidence,
          warnings: [],
        })
      }
    }

    // Transform form fields (with page offset)
    const formFields: FormField[] = (ocrData.formFields || []).map(f => ({
      name: f.name,
      value: f.value,
      confidence: f.confidence,
      pageNumber: (f.page || 1) + pageOffset,
    }))

    // Transform tables (with page offset)
    const tables: Table[] = (ocrData.tables || []).map(t => ({
      rows: t.rows,
      headerRows: t.headerRows || 0,
      confidence: t.confidence || ocrData.confidence,
      pageNumber: (t.page || 1) + pageOffset,
    }))

    // Calculate overall confidence
    const avgConfidence = pages.length > 0
      ? pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
      : ocrData.confidence

    return {
      success: true,
      data: {
        text: ocrData.text,
        pages,
        pageCount: ocrData.pageCount,
        confidence: avgConfidence,
        pdfHash,
        formFields,
        tables,
        metadata: {
          backend: 'document-ai',
          processingTimeMs,
          warnings,
        },
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `Failed to connect to Document AI: ${errorMessage}`,
      },
    }
  }
}

// ============================================================================
// CHUNKED EXTRACTION FOR LARGE PDFS
// ============================================================================

/**
 * Extract text from a large PDF by splitting into chunks
 *
 * Document AI has a 15-page limit per request. This function:
 * 1. Splits the PDF into chunks of 15 pages each
 * 2. Processes each chunk with Document AI
 * 3. Combines the results into a single response
 */
async function extractWithDocumentAIChunked(
  file: File,
  startTime: number
): Promise<DocumentOCRResponse> {
  try {
    // Split the PDF into chunks
    const splitResult = await splitPdf(file, DOCUMENT_AI_PAGE_LIMIT)
    console.warn(`[Document AI] Split into ${splitResult.chunks.length} chunks`)

    // Compute hash of original file
    const pdfHash = await computePdfHashFromFile(file)

    // Process each chunk
    const chunkResults: DocumentOCRResult[] = []
    const errors: string[] = []

    for (let i = 0; i < splitResult.chunks.length; i++) {
      const chunk = splitResult.chunks[i]
      const pageRange = splitResult.pageRanges[i]
      const pageOffset = pageRange[0] - 1 // Convert to 0-indexed offset

      console.warn(`[Document AI] Processing chunk ${i + 1}/${splitResult.chunks.length} (pages ${pageRange[0]}-${pageRange[1]})`)

      // Convert chunk to File
      const chunkFile = chunkToFile(chunk, file.name, i, pageRange)

      // Process this chunk
      const chunkStartTime = performance.now()
      const result = await extractSinglePdfWithDocumentAI(chunkFile, chunkStartTime, pageOffset)

      if (result.success) {
        chunkResults.push(result.data)
        console.warn(`[Document AI] Chunk ${i + 1} completed: ${result.data.pages.length} pages, ${result.data.text.length} chars`)
      } else {
        errors.push(`Chunk ${i + 1} (pages ${pageRange[0]}-${pageRange[1]}): ${result.error.message}`)
        console.error(`[Document AI] Chunk ${i + 1} failed:`, result.error.message)
      }
    }

    // If all chunks failed, return error
    if (chunkResults.length === 0) {
      return {
        success: false,
        error: {
          code: 'OCR_FAILED',
          message: `All ${splitResult.chunks.length} chunks failed to process`,
          details: errors.join('; '),
        },
      }
    }

    // Combine results from all chunks
    const combinedResult = combineChunkResults(chunkResults, pdfHash, splitResult.totalPages, startTime)

    // Add warning if some chunks failed
    if (errors.length > 0) {
      combinedResult.metadata.warnings.push(
        `${errors.length} of ${splitResult.chunks.length} chunks failed: ${errors.join('; ')}`
      )
    }

    console.warn(`[Document AI] Combined ${chunkResults.length} chunks: ${combinedResult.pageCount} pages, ${combinedResult.text.length} chars`)

    return {
      success: true,
      data: combinedResult,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        code: 'OCR_FAILED',
        message: `Failed to process chunked PDF: ${errorMessage}`,
      },
    }
  }
}

/**
 * Combine results from multiple chunk extractions
 */
function combineChunkResults(
  chunks: DocumentOCRResult[],
  pdfHash: string,
  totalPages: number,
  startTime: number
): DocumentOCRResult {
  // Combine all pages (already have correct page numbers due to pageOffset)
  const allPages: PageText[] = []
  const allFormFields: FormField[] = []
  const allTables: Table[] = []
  const allWarnings: string[] = []
  let totalConfidence = 0

  for (const chunk of chunks) {
    allPages.push(...chunk.pages)
    allFormFields.push(...chunk.formFields)
    allTables.push(...chunk.tables)
    allWarnings.push(...chunk.metadata.warnings)
    totalConfidence += chunk.confidence * chunk.pages.length
  }

  // Sort pages by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber)

  // Combine text in page order
  const combinedText = allPages.map(p => p.text).join('\n\n')

  // Calculate average confidence
  const avgConfidence = allPages.length > 0
    ? totalConfidence / allPages.length
    : 0

  const processingTimeMs = Math.round(performance.now() - startTime)

  return {
    text: combinedText,
    pages: allPages,
    pageCount: totalPages,
    confidence: avgConfidence,
    pdfHash,
    formFields: allFormFields,
    tables: allTables,
    metadata: {
      backend: 'document-ai',
      processingTimeMs,
      warnings: [
        `Processed as ${chunks.length} chunks (15 pages each) due to Document AI page limit`,
        ...allWarnings,
      ],
    },
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Split full text into pages based on common page markers
 */
function splitTextByPages(text: string, pageCount: number): string[] {
  // Try to find page break markers
  const pageBreakPatterns = [
    /\n---+\s*Page\s*\d+\s*---+\n/gi,
    /\f/g, // Form feed character
    /\n{4,}/g, // Multiple newlines
  ]

  for (const pattern of pageBreakPatterns) {
    const parts = text.split(pattern)
    if (parts.length === pageCount) {
      return parts.map(p => p.trim())
    }
  }

  // Fallback: evenly divide text
  if (pageCount <= 1) {
    return [text]
  }

  const charsPerPage = Math.ceil(text.length / pageCount)
  const pages: string[] = []

  for (let i = 0; i < pageCount; i++) {
    const start = i * charsPerPage
    const end = Math.min((i + 1) * charsPerPage, text.length)
    pages.push(text.slice(start, end).trim())
  }

  return pages
}

/**
 * Check if Document AI OCR is available
 */
export function isDocumentOCRAvailable(): boolean {
  return isProxyConfigured()
}
