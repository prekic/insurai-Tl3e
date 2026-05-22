/**
 * OCR module for scanned PDF documents
 *
 * Uses Vision API via proxy for OCR text extraction.
 *
 * Features:
 * - Caching for cost reduction on repeated documents
 * - Turkish language optimization
 */

import { getGoogleCloudApiKey, isOCRConfigured, isProxyConfigured, getProxyUrl } from './config'
import { aiCache } from './cache'

// ============================================================================
// TYPES
// ============================================================================

export interface OCRResult {
  text: string
  confidence: number
  pageCount: number
  isScanned: boolean
  // Enhanced fields from OCR processing
  formFields?: FormField[]
  tables?: Table[]
  // Processing metadata
  backend?: 'vision-api'
  processingTimeMs?: number
}

export interface FormField {
  name: string
  value: string
  confidence: number
  boundingBox?: BoundingBox
}

export interface Table {
  rows: TableRow[]
  headerRows: number
  confidence: number
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

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface OCRError {
  code: 'NO_OCR_CONFIG' | 'OCR_FAILED' | 'INVALID_DOCUMENT' | 'VISION_API_ERROR'
  message: string
  backend?: 'vision-api'
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if a PDF appears to be scanned (image-based)
 * This is a heuristic based on text extraction results
 */
export function isLikelyScannedPDF(extractedText: string, pageCount: number): boolean {
  // If very little text was extracted relative to page count, likely scanned
  const avgCharsPerPage = extractedText.length / Math.max(1, pageCount)

  // Typical text PDFs have 1000-5000 chars per page
  // Scanned PDFs typically have <100 chars per page from PDF.js
  return avgCharsPerPage < 200
}

// ============================================================================
// VISION API PROCESSING
// ============================================================================

/**
 * Perform OCR using Google Cloud Vision API
 * Simpler fallback when Google Vision API is not available
 */
async function performVisionAPIOCR(
  file: File
): Promise<{ success: true; data: OCRResult } | { success: false; error: OCRError }> {
  const proxyUrl = getProxyUrl()
  const startTime = Date.now()

  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64Content = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    // Use proxy if available, otherwise direct API call
    if (proxyUrl) {
      const response = await fetch(`${proxyUrl}/api/ai/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Content }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `API error: ${response.status}`)
      }

      const result = await response.json()
      const processingTimeMs = Date.now() - startTime

      return {
        success: true,
        data: {
          text: result.data?.text || '',
          confidence: result.data?.confidence || 0,
          pageCount: result.data?.pageCount || 1,
          isScanned: true,
          backend: 'vision-api',
          processingTimeMs,
        },
      }
    }

    // Direct Vision API call (development only)
    const apiKey = getGoogleCloudApiKey()
    if (!apiKey) {
      return {
        success: false,
        error: {
          code: 'NO_OCR_CONFIG',
          message: 'Google Cloud API key not available',
          backend: 'vision-api',
        },
      }
    }

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Content },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['tr', 'en'] },
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `API error: ${response.status}`
      )
    }

    const result = await response.json()
    const annotation = (
      result as {
        responses?: Array<{
          fullTextAnnotation?: {
            text?: string
            pages?: Array<{ blocks?: Array<{ confidence?: number }> }>
          }
        }>
      }
    ).responses?.[0]?.fullTextAnnotation

    // Calculate average confidence
    const pages = annotation?.pages || []
    let totalConfidence = 0
    let blockCount = 0

    for (const page of pages) {
      for (const block of page.blocks || []) {
        if (block.confidence !== undefined) {
          totalConfidence += block.confidence
          blockCount++
        }
      }
    }

    const avgConfidence = blockCount > 0 ? totalConfidence / blockCount : 0.8
    const processingTimeMs = Date.now() - startTime

    return {
      success: true,
      data: {
        text: annotation?.text || '',
        confidence: avgConfidence,
        pageCount: pages.length || 1,
        isScanned: true,
        backend: 'vision-api',
        processingTimeMs,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'VISION_API_ERROR',
        message: error instanceof Error ? error.message : 'Vision API processing failed',
        backend: 'vision-api',
      },
    }
  }
}

// ============================================================================
// MAIN OCR FUNCTION
// ============================================================================

export interface OCROptions {
  /** Force a specific backend */
  backend?: 'vision-api' | 'auto'
  /** Skip cache lookup */
  skipCache?: boolean
}

/**
 * Perform OCR on a scanned document
 *
 * Automatically selects the best backend:
 * 1. Google Vision API (primary) - Text detection from images
 * 2. Vision API (fallback) - Simpler text extraction
 *
 * Implements caching to avoid repeated OCR on same documents
 */
export async function performOCR(
  file: File,
  { skipCache = false }: OCROptions = {}
): Promise<{ success: true; data: OCRResult } | { success: false; error: OCRError }> {
  // Initialize cache
  await aiCache.initialize()

  // Check cache first (unless skipped)
  if (!skipCache) {
    const cached = await aiCache.getOCR(file)
    if (cached) {
      return { success: true, data: cached }
    }
  }

  // Check if any OCR is configured
  if (!isOCRConfigured() && !isProxyConfigured()) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'No OCR backend configured. Configure Google Cloud API key or API proxy.',
      },
    }
  }

  // Use Vision API
  const result = await performVisionAPIOCR(file)

  // Cache successful results
  if (result.success && !skipCache) {
    await aiCache.setOCR(file, result.data)
  }

  return result
}

/**
 * Process multiple pages of a PDF for OCR
 * For multi-page PDFs, we need to process each page separately with Vision API
 */
export async function performMultiPageOCR(
  pages: Blob[],
  _options: OCROptions = {}
): Promise<{ success: true; data: OCRResult } | { success: false; error: OCRError }> {
  const proxyUrl = getProxyUrl()

  // Check configuration
  if (!isOCRConfigured() && !proxyUrl) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'No OCR backend configured',
      },
    }
  }

  try {
    const startTime = Date.now()

    // Process all pages in parallel
    const pageResults = await Promise.all(
      pages.map(async (pageBlob) => {
        const arrayBuffer = await pageBlob.arrayBuffer()
        const base64Content = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )

        // Use proxy if available
        if (proxyUrl) {
          const response = await fetch(`${proxyUrl}/api/ai/ocr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Content }),
          })

          if (!response.ok) {
            return { text: '', confidence: 0 }
          }

          const result = await response.json()
          return {
            text: result.data?.text || '',
            confidence: result.data?.confidence || 0,
          }
        }

        // Direct Vision API call (fallback)
        const apiKey = getGoogleCloudApiKey()
        if (!apiKey) {
          return { text: '', confidence: 0 }
        }

        const response = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [
                {
                  image: { content: base64Content },
                  features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
                  imageContext: { languageHints: ['tr', 'en'] },
                },
              ],
            }),
          }
        )

        if (!response.ok) {
          return { text: '', confidence: 0 }
        }

        const result = await response.json()
        const annotation = (
          result as {
            responses?: Array<{
              fullTextAnnotation?: {
                text?: string
                pages?: Array<{ blocks?: Array<{ confidence?: number }> }>
              }
            }>
          }
        ).responses?.[0]?.fullTextAnnotation

        return {
          text: annotation?.text || '',
          confidence: annotation?.pages?.[0]?.blocks?.[0]?.confidence || 0.8,
        }
      })
    )

    // Combine results
    const combinedText = pageResults.map((r) => r.text).join('\n\n')
    const avgConfidence = pageResults.reduce((sum, r) => sum + r.confidence, 0) / pageResults.length
    const processingTimeMs = Date.now() - startTime

    return {
      success: true,
      data: {
        text: combinedText,
        confidence: avgConfidence,
        pageCount: pages.length,
        isScanned: true,
        backend: 'vision-api',
        processingTimeMs,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'OCR_FAILED',
        message: error instanceof Error ? error.message : 'Multi-page OCR processing failed',
      },
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract key-value pairs from form fields
 * Useful for structured data extraction from Turkish insurance documents
 */
export function extractFormFieldMap(formFields: FormField[]): Record<string, string> {
  const map: Record<string, string> = {}

  for (const field of formFields) {
    if (field.name && field.value && field.confidence > 0.5) {
      // Normalize field name for lookup
      const normalizedName = field.name.trim().toLowerCase()
      map[normalizedName] = field.value.trim()
    }
  }

  return map
}

/**
 * Find a form field by name pattern
 * Supports Turkish insurance document field names
 */
export function findFormField(
  formFields: FormField[],
  patterns: readonly (string | RegExp)[]
): FormField | undefined {
  for (const pattern of patterns) {
    const found = formFields.find((field) => {
      const name = field.name.toLowerCase()
      if (typeof pattern === 'string') {
        return name.includes(pattern.toLowerCase())
      }
      return pattern.test(name)
    })
    if (found) return found
  }
  return undefined
}

/**
 * Common Turkish insurance form field patterns
 */
export const TURKISH_FORM_FIELD_PATTERNS = {
  policyNumber: ['poliçe no', 'poliçe numarası', 'police no', /poli[çc]e\s*n/i],
  tcKimlik: ['t.c. kimlik', 'tc kimlik', 'kimlik no', /t\.?c\.?\s*kimlik/i],
  insuredName: ['sigortalı', 'sigorta ettiren', 'ad soyad', /sigortal[ıi]/i],
  startDate: ['başlangıç tarihi', 'yürürlük tarihi', /ba[şs]lang[ıi][çc]/i],
  endDate: ['bitiş tarihi', 'vade sonu', /biti[şs]\s*tarihi/i],
  premium: ['prim', 'toplam prim', 'net prim', /(?:toplam\s*)?prim/i],
  vehiclePlate: ['plaka', 'araç plaka', /plaka/i],
  vin: ['şasi no', 'şasi numarası', /[şs]asi\s*n/i],
} as const
