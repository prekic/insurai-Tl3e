/**
 * Server-Side PDF Extraction Service
 *
 * Uses the backend PDF extraction endpoint for better text quality.
 * Automatically falls back to client-side extraction if server is unavailable.
 */

import { env } from '../env'
import type { PDFParseResult, PDFParseError } from '../ai/pdf-parser'

/**
 * Get the API base URL for server requests
 */
function getApiUrl(): string {
  return env.proxyUrl || ''
}

export interface ServerExtractionQuality {
  singleCharRatio: number
  controlCharRatio: number
  highAsciiRatio: number
  barcodePatternCount: number
  averageWordLength: number
  turkishTermsFound: number
  qualityScore: number
  qualityOk: boolean
  issues: string[]
}

export interface ServerExtractionCleaning {
  text: string
  linesRemoved: number
  charsRemoved: number
  noiseTypes: string[]
}

export interface ServerPDFExtractionResult {
  text: string
  cleanedText: string
  pageCount: number
  metadata: {
    title?: string
    author?: string
    creationDate?: string
  }
  quality: ServerExtractionQuality
  cleaning: ServerExtractionCleaning
}

export interface ExtractionWithFallbackResult {
  /** The best text to use for AI extraction */
  text: string
  /** Page count from the PDF */
  pageCount: number
  /** Metadata from the PDF */
  metadata: {
    title?: string
    author?: string
    creationDate?: string
  }
  /** Which extraction method was used */
  method: 'server-cleaned' | 'server-raw' | 'client'
  /** Quality metrics (only available for server extraction) */
  quality?: ServerExtractionQuality
  /** Whether OCR is recommended based on quality */
  ocrRecommended: boolean
}

/**
 * Extract PDF text using the server-side endpoint
 */
export async function extractWithServer(file: File): Promise<
  { success: true; data: ServerPDFExtractionResult } |
  { success: false; error: { code: string; message: string } }
> {
  const apiUrl = getApiUrl()
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await fetch(`${apiUrl}/api/pdf/extract`, {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || {
          code: 'UNKNOWN_ERROR',
          message: 'Server extraction failed',
        },
      }
    }

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `Failed to connect to extraction server: ${errorMessage}`,
      },
    }
  }
}

/**
 * Analyze text quality using the server endpoint
 */
export async function analyzeTextQualityServer(text: string): Promise<
  { success: true; quality: ServerExtractionQuality; cleaning: ServerExtractionCleaning } |
  { success: false; error: string }
> {
  const apiUrl = getApiUrl()

  try {
    const response = await fetch(`${apiUrl}/api/pdf/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error?.message || 'Analysis failed',
      }
    }

    return {
      success: true,
      quality: result.data.quality,
      cleaning: result.data.cleaning,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Extract PDF with intelligent fallback
 *
 * 1. Try server-side extraction (better quality)
 * 2. If quality is good, use cleaned text
 * 3. If quality is poor but text exists, recommend OCR
 * 4. Falls back to client-side if server unavailable
 */
export async function extractWithFallback(
  file: File,
  clientExtractor: (file: File) => Promise<
    { success: true; data: PDFParseResult } |
    { success: false; error: PDFParseError }
  >
): Promise<
  { success: true; data: ExtractionWithFallbackResult } |
  { success: false; error: PDFParseError }
> {
  // Try server extraction first
  const serverResult = await extractWithServer(file)

  if (serverResult.success) {
    const { data } = serverResult
    const quality = data.quality

    // Determine which text to use based on quality
    let textToUse: string
    let method: ExtractionWithFallbackResult['method']

    if (quality.qualityOk) {
      // Good quality - use cleaned text
      textToUse = data.cleanedText
      method = 'server-cleaned'
    } else if (quality.qualityScore >= 40) {
      // Moderate quality - use cleaned text but flag for review
      textToUse = data.cleanedText
      method = 'server-cleaned'
    } else {
      // Poor quality - use raw text, recommend OCR
      textToUse = data.text
      method = 'server-raw'
    }

    return {
      success: true,
      data: {
        text: textToUse,
        pageCount: data.pageCount,
        metadata: data.metadata,
        method,
        quality,
        ocrRecommended: !quality.qualityOk || quality.qualityScore < 50,
      },
    }
  }

  // Server extraction failed - fall back to client-side
  console.warn('[PDF] Server extraction failed, falling back to client:', serverResult.error)

  const clientResult = await clientExtractor(file)

  if (!clientResult.success) {
    return clientResult
  }

  return {
    success: true,
    data: {
      text: clientResult.data.text,
      pageCount: clientResult.data.pageCount,
      metadata: clientResult.data.metadata,
      method: 'client',
      ocrRecommended: false, // Can't assess without quality metrics
    },
  }
}

/**
 * Check if the PDF extraction server is available
 */
export async function isPdfServerAvailable(): Promise<boolean> {
  const apiUrl = getApiUrl()

  try {
    const response = await fetch(`${apiUrl}/api/pdf/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    return response.ok
  } catch {
    return false
  }
}
