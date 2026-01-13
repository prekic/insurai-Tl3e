/**
 * PDF Parser with Lazy Loading
 *
 * Uses dynamic imports to load pdfjs-dist only when needed,
 * reducing initial bundle size by ~450KB.
 *
 * Includes CDN fallback logic for worker loading reliability.
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
let workerLoadAttempted = false

/**
 * CDN sources for PDF.js worker (in order of preference)
 * Multiple fallbacks to handle CDN outages
 */
const WORKER_CDN_SOURCES = [
  (version: string) => `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`,
  (version: string) => `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`,
  (version: string) => `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`,
]

/**
 * Test if a worker URL is accessible
 */
async function testWorkerUrl(url: string, timeout: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Find a working CDN for the PDF.js worker
 */
async function findWorkingWorkerUrl(version: string): Promise<string | null> {
  for (const cdnFn of WORKER_CDN_SOURCES) {
    const url = cdnFn(version)
    console.log(`[PDF.js] Testing worker URL: ${url}`)

    if (await testWorkerUrl(url)) {
      console.log(`[PDF.js] Found working worker: ${url}`)
      return url
    }
  }

  console.warn('[PDF.js] No CDN worker available, will use fake worker')
  return null
}

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
    const PDFJS_VERSION = pdfjs.version

    // Only attempt worker setup once
    if (!workerLoadAttempted) {
      workerLoadAttempted = true

      // Try to find a working CDN for the worker
      const workerUrl = await findWorkingWorkerUrl(PDFJS_VERSION)

      if (workerUrl) {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      } else {
        // All CDNs failed - pdfjs will use fake worker (main thread)
        // This is slower but still works
        console.warn('[PDF.js] Using main thread (fake worker) - parsing may be slower')
      }
    }

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
 * Reset the worker setup to allow retrying CDN selection
 * Called when PDF parsing fails with a load error
 */
function resetWorkerSetup(): void {
  workerLoadAttempted = false
  pdfjsLib = null
  loadPromise = null
}

/**
 * Extract text from PDF with automatic retry for transient errors
 * Retries up to 3 times with exponential backoff for load/parse errors
 */
export async function extractTextFromPDFWithRetry(
  file: File,
  maxRetries: number = 3
): Promise<{ success: true; data: PDFParseResult } | { success: false; error: PDFParseError }> {
  let lastError: PDFParseError | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await extractTextFromPDF(file)

    if (result.success) {
      return result
    }

    lastError = result.error

    // Only retry on transient errors (load errors, parse errors)
    // Don't retry for invalid PDF, empty PDF, or password protected
    const isRetryableError = ['LOAD_ERROR', 'PARSE_ERROR'].includes(result.error.code)

    if (!isRetryableError) {
      return result
    }

    // If it's a load error, reset the worker setup to try different CDN
    if (result.error.code === 'LOAD_ERROR') {
      console.warn(`[PDF.js] Load error on attempt ${attempt}, resetting worker setup`)
      resetWorkerSetup()
    }

    // Don't wait after the last attempt
    if (attempt < maxRetries) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000) // 1s, 2s, 4s
      console.log(`[PDF.js] Retry ${attempt}/${maxRetries} failed, waiting ${delayMs}ms before retry`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  // All retries failed
  console.error(`[PDF.js] All ${maxRetries} attempts failed`)
  return {
    success: false,
    error: lastError || {
      code: 'PARSE_ERROR',
      message: 'Failed to parse PDF after multiple attempts',
    },
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
