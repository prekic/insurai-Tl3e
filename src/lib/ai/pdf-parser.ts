/**
 * PDF Parser with Lazy Loading
 *
 * Uses dynamic imports to load pdfjs-dist only when needed,
 * reducing initial bundle size by ~450KB.
 *
 * Includes CDN fallback logic for worker loading reliability.
 * Enhanced error handling for intermittent failures.
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
  code:
    | 'INVALID_PDF'
    | 'EMPTY_PDF'
    | 'PARSE_ERROR'
    | 'PASSWORD_PROTECTED'
    | 'LOAD_ERROR'
    | 'FILE_READ_ERROR'
    | 'TIMEOUT_ERROR'
    | 'WORKER_ERROR'
  message: string
}

// Cached pdfjs-dist module
let pdfjsLib: typeof import('pdfjs-dist') | null = null
let loadPromise: Promise<typeof import('pdfjs-dist')> | null = null
let workerLoadAttempted = false
let workerFailureCount = 0

// Configuration — defaults, overridable via app_settings (ocr.pdf_load_timeout_ms, ocr.max_worker_failures)
let PDF_LOAD_TIMEOUT_MS = 30000 // 30 seconds max for loading a PDF
let MAX_WORKER_FAILURES = 2 // After 2 worker failures, force fake worker

// Lazy-load config overrides (fire-and-forget, non-blocking)
let _configLoaded = false
async function _loadPdfConfig(): Promise<void> {
  if (_configLoaded) return
  _configLoaded = true
  try {
    const { getOCRConfig } = await import('@/lib/config')
    const ocrCfg = await getOCRConfig()
    PDF_LOAD_TIMEOUT_MS = ocrCfg.pdfLoadTimeoutMs
    MAX_WORKER_FAILURES = ocrCfg.maxWorkerFailures
  } catch {
    // Keep defaults
  }
}
_loadPdfConfig()

/**
 * CDN sources for PDF.js worker (in order of preference)
 * Multiple fallbacks to handle CDN outages
 */
const WORKER_CDN_SOURCES = [
  (version: string) => `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`,
  (version: string) =>
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`,
  (version: string) =>
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`,
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
    console.warn(`[PDF.js] Testing worker URL: ${url}`)

    if (await testWorkerUrl(url)) {
      console.warn(`[PDF.js] Found working worker: ${url}`)
      return url
    }
  }

  console.warn('[PDF.js] No CDN worker available, will use fake worker')
  return null
}

/**
 * Create a promise that rejects after a timeout and provides a clear mechanism
 */
function createTimeout<T>(
  ms: number,
  operation: string,
  controller?: { clear?: () => void }
): Promise<T> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${ms}ms`))
    }, ms)
    if (controller) {
      controller.clear = () => clearTimeout(timeoutId)
    }
  })
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
    try {
      return await loadPromise
    } catch {
      // Previous load failed - clear and retry
      console.warn('[PDF.js] Previous load attempt failed, retrying...')
      loadPromise = null
    }
  }

  // Start loading
  loadPromise = (async () => {
    try {
      const pdfjs = await import('pdfjs-dist')
      const PDFJS_VERSION = pdfjs.version

      // Only attempt worker setup once (unless too many failures)
      if (!workerLoadAttempted || workerFailureCount >= MAX_WORKER_FAILURES) {
        workerLoadAttempted = true

        // If too many worker failures, force fake worker mode
        if (workerFailureCount >= MAX_WORKER_FAILURES) {
          console.warn(
            `[PDF.js] Too many worker failures (${workerFailureCount}), forcing fake worker mode`
          )
          // Don't set workerSrc - this forces PDF.js to use main thread
          pdfjs.GlobalWorkerOptions.workerSrc = ''
        } else {
          // Try to find a working CDN for the worker
          const workerUrl = await findWorkingWorkerUrl(PDFJS_VERSION)

          // Check if we are running in Node/jsdom (where ESM loader restricts https workers)
          const isNode =
            typeof process !== 'undefined' &&
            process.versions != null &&
            process.versions.node != null

          if (workerUrl && !isNode) {
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
          } else {
            // Node/jsdom environments or failed CDNs - use fake worker
            pdfjs.GlobalWorkerOptions.workerSrc = ''
            console.warn(
              '[PDF.js] Using main thread (fake worker) - parsing may be slower or running in Node environment'
            )
          }
        }
      }

      // Cache the module
      pdfjsLib = pdfjs
      return pdfjs
    } catch (error) {
      // Clear the promise so next call can retry
      loadPromise = null
      throw error
    }
  })()

  return loadPromise
}

/**
 * Check if error message indicates a worker-related failure
 */
function isWorkerError(errorMessage: string): boolean {
  const workerErrorPatterns = [
    'worker',
    'postMessage',
    'message port',
    'MessageChannel',
    'terminated',
    'communication',
    'not respond',
    'script error',
  ]
  const lowerMessage = errorMessage.toLowerCase()
  return workerErrorPatterns.some((pattern) => lowerMessage.includes(pattern.toLowerCase()))
}

/**
 * Check if error indicates a transient/retryable failure
 */
function isTransientError(errorMessage: string): boolean {
  const transientPatterns = [
    'network',
    'timeout',
    'aborted',
    'connection',
    'ECONNRESET',
    'ETIMEDOUT',
    'temporarily',
    'try again',
    'busy',
    'overloaded',
  ]
  const lowerMessage = errorMessage.toLowerCase()
  return transientPatterns.some((pattern) => lowerMessage.includes(pattern.toLowerCase()))
}

/**
 * Extract text content from a PDF file
 * Loads pdfjs-dist lazily on first use
 */
export async function extractTextFromPDF(
  file: File
): Promise<{ success: true; data: PDFParseResult } | { success: false; error: PDFParseError }> {
  let pdfDocument: Awaited<
    ReturnType<(typeof import('pdfjs-dist'))['getDocument']>['promise']
  > | null = null

  try {
    // Lazily load pdfjs-dist
    const pdfjs = await getPdfJs()

    // Read file as ArrayBuffer with explicit error handling
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await file.arrayBuffer()
    } catch (readError) {
      const readErrorMsg = readError instanceof Error ? readError.message : 'Unknown error'
      console.error('[PDF.js] Failed to read file:', readErrorMsg)
      return {
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: `Could not read the file: ${readErrorMsg}. The file may have been moved, deleted, or is too large.`,
        },
      }
    }

    // Validate we got actual data
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return {
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: 'The file appears to be empty or could not be read properly.',
        },
      }
    }

    // Load PDF document with timeout
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    })

    const timeoutCtrl: { clear?: () => void } = {}
    try {
      // Race between PDF loading and timeout
      pdfDocument = await Promise.race([
        loadingTask.promise,
        createTimeout<never>(PDF_LOAD_TIMEOUT_MS, 'PDF loading', timeoutCtrl),
      ])
    } catch (loadError) {
      // Cancel the loading task if it's still running
      try {
        loadingTask.destroy()
      } catch {
        // Ignore destroy errors
      }

      const loadErrorMsg = loadError instanceof Error ? loadError.message : 'Unknown error'

      // Check if it's a timeout
      if (loadErrorMsg.includes('timed out')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'PDF loading took too long. The file may be too large or complex.',
          },
        }
      }

      // Re-throw to be handled by outer catch
      throw loadError
    } finally {
      if (timeoutCtrl.clear) timeoutCtrl.clear()
    }

    // Check for empty PDF
    if (pdfDocument.numPages === 0) {
      return {
        success: false,
        error: {
          code: 'EMPTY_PDF',
          message: 'The PDF file appears to be empty',
        },
      }
    }

    // Extract text from all pages with per-page timeout protection
    const textContent: string[] = []

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum)
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
      } catch (pageError) {
        // Log but continue - partial extraction is better than complete failure
        console.warn(`[PDF.js] Failed to extract page ${pageNum}:`, pageError)
        textContent.push('') // Add empty string to maintain page count
      }
    }

    // Get metadata (optional, don't fail if this errors)
    let info: Record<string, unknown> | undefined
    try {
      const metadata = await pdfDocument.getMetadata()
      info = metadata?.info as Record<string, unknown> | undefined
    } catch {
      // Metadata extraction is optional
    }

    const fullText = textContent.join('\n\n')

    // Check if we extracted any meaningful text
    if (fullText.length < 50) {
      return {
        success: false,
        error: {
          code: 'EMPTY_PDF',
          message:
            'Could not extract meaningful text from the PDF. It may be a scanned document requiring OCR.',
        },
      }
    }

    if (fullText.includes('%DûODQJÖo') || fullText.includes('ûWHUL')) {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Axa Sigorta Font Encoding Corruption Detected (Requires OCR)',
        },
      }
    }

    // Success - reset worker failure count since this worked
    workerFailureCount = Math.max(0, workerFailureCount - 1)

    return {
      success: true,
      data: {
        text: fullText,
        pageCount: pdfDocument.numPages,
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

    // Check if it's a worker-related error
    if (isWorkerError(errorMessage)) {
      workerFailureCount++
      console.warn(
        `[PDF.js] Worker error detected (failure count: ${workerFailureCount}):`,
        errorMessage
      )
      return {
        success: false,
        error: {
          code: 'WORKER_ERROR',
          message: 'PDF processing worker failed. Will retry with fallback method.',
        },
      }
    }

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

    if (errorMessage.includes('Invalid PDF') || errorMessage.includes('not a PDF')) {
      return {
        success: false,
        error: {
          code: 'INVALID_PDF',
          message: 'The file does not appear to be a valid PDF document.',
        },
      }
    }

    // Check for transient errors that should be retried
    if (isTransientError(errorMessage)) {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: `Temporary error while parsing PDF. Please try again.`,
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
  } finally {
    // Clean up: destroy the PDF document to free memory
    if (pdfDocument) {
      try {
        pdfDocument.destroy()
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Reset the worker setup to allow retrying CDN selection
 * Called when PDF parsing fails with a load error
 * @param forceResetWorkerCount - If true, also reset the worker failure count
 */
function resetWorkerSetup(forceResetWorkerCount: boolean = false): void {
  workerLoadAttempted = false
  pdfjsLib = null
  loadPromise = null
  if (forceResetWorkerCount) {
    workerFailureCount = 0
  }
}

/**
 * Determine if an error code should trigger a retry
 */
function isRetryableErrorCode(code: PDFParseError['code']): boolean {
  const retryableCodes: PDFParseError['code'][] = [
    'LOAD_ERROR',
    'PARSE_ERROR',
    'WORKER_ERROR',
    'TIMEOUT_ERROR',
    'FILE_READ_ERROR', // Can be transient on mobile/low-memory devices
  ]
  return retryableCodes.includes(code)
}

/**
 * Extract text from PDF with automatic retry for transient errors
 * Retries up to 3 times with exponential backoff for load/parse/worker errors
 */
export async function extractTextFromPDFWithRetry(
  file: File,
  maxRetries: number = 3
): Promise<{ success: true; data: PDFParseResult } | { success: false; error: PDFParseError }> {
  let lastError: PDFParseError | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await extractTextFromPDF(file)

    if (result.success) {
      // Log success after retry
      if (attempt > 1) {
        console.warn(`[PDF.js] Successfully parsed PDF on attempt ${attempt}`)
      }
      return result
    }

    lastError = result.error

    // Check if this error type should be retried
    if (!isRetryableErrorCode(result.error.code)) {
      // Non-retryable error (e.g., INVALID_PDF, EMPTY_PDF, PASSWORD_PROTECTED)
      console.warn(`[PDF.js] Non-retryable error: ${result.error.code}`)
      return result
    }

    // Log the retry attempt
    console.warn(
      `[PDF.js] Attempt ${attempt}/${maxRetries} failed with ${result.error.code}: ${result.error.message}`
    )

    // Handle specific error types
    if (result.error.code === 'LOAD_ERROR') {
      // Reset worker setup to try different CDN
      console.warn(`[PDF.js] Load error, resetting worker setup`)
      resetWorkerSetup(false)
    } else if (result.error.code === 'WORKER_ERROR') {
      // Worker error - increment failure count and reset
      // After enough failures, getPdfJs will switch to fake worker mode
      console.warn(`[PDF.js] Worker error (count: ${workerFailureCount}), resetting worker setup`)
      resetWorkerSetup(false)
    } else if (result.error.code === 'TIMEOUT_ERROR') {
      // Timeout - try again with a fresh worker
      console.warn(`[PDF.js] Timeout error, resetting worker setup`)
      resetWorkerSetup(false)
    }

    // Don't wait after the last attempt
    if (attempt < maxRetries) {
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000)
      console.warn(`[PDF.js] Waiting ${delayMs}ms before retry ${attempt + 1}/${maxRetries}`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
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
