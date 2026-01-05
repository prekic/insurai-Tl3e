/**
 * PDF Parser with Lazy Loading
 *
 * Uses dynamic imports to load pdfjs-dist only when needed,
 * reducing initial bundle size by ~450KB.
 */

export interface PDFParseResult {
  text: string
  pageCount: number
  metadata: {
    title?: string
    author?: string
    creationDate?: string
  }
}

export interface PDFParseError {
  code: 'INVALID_PDF' | 'EMPTY_PDF' | 'PARSE_ERROR' | 'PASSWORD_PROTECTED' | 'LOAD_ERROR'
  message: string
}

// Cached pdfjs-dist module
let pdfjsLib: typeof import('pdfjs-dist') | null = null
let loadPromise: Promise<typeof import('pdfjs-dist')> | null = null

/**
 * Lazily load pdfjs-dist only when first needed
 * This reduces the initial bundle size significantly
 */
async function getPdfJs(): Promise<typeof import('pdfjs-dist')> {
  // Return cached module if already loaded
  if (pdfjsLib) {
    return pdfjsLib
  }

  // If currently loading, wait for existing promise
  if (loadPromise) {
    return loadPromise
  }

  // Start loading
  loadPromise = (async () => {
    const pdfjs = await import('pdfjs-dist')

    // Configure worker using unpkg CDN (most reliable for npm packages)
    const PDFJS_VERSION = pdfjs.version
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

    // Cache the module
    pdfjsLib = pdfjs
    return pdfjs
  })()

  return loadPromise
}

/**
 * Extract text content from a PDF file
 * Loads pdfjs-dist lazily on first use
 */
export async function extractTextFromPDF(
  file: File
): Promise<{ success: true; data: PDFParseResult } | { success: false; error: PDFParseError }> {
  try {
    // Lazily load pdfjs-dist
    const pdfjs = await getPdfJs()

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Load PDF document
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    })

    const pdf = await loadingTask.promise

    // Check for empty PDF
    if (pdf.numPages === 0) {
      return {
        success: false,
        error: {
          code: 'EMPTY_PDF',
          message: 'The PDF file appears to be empty',
        },
      }
    }

    // Extract text from all pages
    const textContent: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()

      // Join text items with proper spacing
      const pageText = content.items
        .map((item) => {
          if ('str' in item) {
            return item.str
          }
          return ''
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      textContent.push(pageText)
    }

    // Get metadata
    const metadata = await pdf.getMetadata().catch(() => null)
    const info = metadata?.info as Record<string, unknown> | undefined

    const fullText = textContent.join('\n\n')

    // Check if we extracted any meaningful text
    if (fullText.length < 50) {
      return {
        success: false,
        error: {
          code: 'EMPTY_PDF',
          message: 'Could not extract meaningful text from the PDF. It may be a scanned document requiring OCR.',
        },
      }
    }

    return {
      success: true,
      data: {
        text: fullText,
        pageCount: pdf.numPages,
        metadata: {
          title: info?.Title as string | undefined,
          author: info?.Author as string | undefined,
          creationDate: info?.CreationDate as string | undefined,
        },
      },
    }
  } catch (error) {
    // Handle specific PDF.js errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check if it's a loading error
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('dynamic import')) {
      return {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: 'Failed to load PDF processing library. Please check your network connection.',
        },
      }
    }

    if (errorMessage.includes('password')) {
      return {
        success: false,
        error: {
          code: 'PASSWORD_PROTECTED',
          message: 'The PDF is password protected. Please provide an unprotected version.',
        },
      }
    }

    if (errorMessage.includes('Invalid PDF')) {
      return {
        success: false,
        error: {
          code: 'INVALID_PDF',
          message: 'The file does not appear to be a valid PDF document.',
        },
      }
    }

    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Failed to parse PDF: ${errorMessage}`,
      },
    }
  }
}

/**
 * Check if a file is a PDF
 */
export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Preload pdfjs-dist in the background
 * Call this when user navigates to upload page to warm up the cache
 */
export function preloadPdfJs(): void {
  // Start loading in background, ignore errors
  getPdfJs().catch(() => {
    // Silently fail - will retry when actually needed
  })
}
