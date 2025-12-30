/**
 * OCR module for scanned PDF documents
 * Uses Google Document AI or Vision API for text extraction
 * Implements caching for cost reduction on repeated documents
 */

import { getGoogleCloudApiKey, isOCRConfigured } from './config'
import { aiCache } from './cache'

export interface OCRResult {
  text: string
  confidence: number
  pageCount: number
  isScanned: boolean
}

export interface OCRError {
  code: 'NO_OCR_CONFIG' | 'OCR_FAILED' | 'INVALID_DOCUMENT'
  message: string
}

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

/**
 * Perform OCR on a scanned document using Google Document AI
 * Implements caching to avoid repeated OCR on same documents
 */
export async function performOCR(
  file: File
): Promise<{ success: true; data: OCRResult } | { success: false; error: OCRError }> {
  // Initialize cache
  await aiCache.initialize()

  // Check cache first
  const cached = await aiCache.getOCR(file)
  if (cached) {
    return { success: true, data: cached }
  }

  if (!isOCRConfigured()) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'Google Cloud API key not configured for OCR',
      },
    }
  }

  const apiKey = getGoogleCloudApiKey()
  if (!apiKey) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'Google Cloud API key not available',
      },
    }
  }

  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64Content = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    // Call Google Cloud Vision API for document text detection
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Content,
              },
              features: [
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
              imageContext: {
                languageHints: ['tr', 'en'], // Turkish and English
              },
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API error: ${response.status}`)
    }

    const result = await response.json()
    const annotation = result.responses?.[0]?.fullTextAnnotation

    if (!annotation) {
      // No text detected - might be an image without text
      return {
        success: true,
        data: {
          text: '',
          confidence: 0,
          pageCount: 1,
          isScanned: true,
        },
      }
    }

    // Calculate average confidence from detected blocks
    const pages = annotation.pages || []
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

    const ocrResult: OCRResult = {
      text: annotation.text || '',
      confidence: avgConfidence,
      pageCount: pages.length || 1,
      isScanned: true,
    }

    // Cache the result
    await aiCache.setOCR(file, ocrResult)

    return {
      success: true,
      data: ocrResult,
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'OCR_FAILED',
        message: error instanceof Error ? error.message : 'OCR processing failed',
      },
    }
  }
}

/**
 * Process multiple pages of a PDF for OCR
 * For multi-page PDFs, we need to process each page separately
 */
export async function performMultiPageOCR(
  pages: Blob[]
): Promise<{ success: true; data: OCRResult } | { success: false; error: OCRError }> {
  if (!isOCRConfigured()) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'Google Cloud API key not configured for OCR',
      },
    }
  }

  const apiKey = getGoogleCloudApiKey()
  if (!apiKey) {
    return {
      success: false,
      error: {
        code: 'NO_OCR_CONFIG',
        message: 'Google Cloud API key not available',
      },
    }
  }

  try {
    // Process all pages in parallel
    const pageResults = await Promise.all(
      pages.map(async (pageBlob) => {
        const arrayBuffer = await pageBlob.arrayBuffer()
        const base64Content = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )

        const response = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [
                {
                  image: {
                    content: base64Content,
                  },
                  features: [
                    {
                      type: 'DOCUMENT_TEXT_DETECTION',
                      maxResults: 1,
                    },
                  ],
                  imageContext: {
                    languageHints: ['tr', 'en'],
                  },
                },
              ],
            }),
          }
        )

        if (!response.ok) {
          return { text: '', confidence: 0 }
        }

        const result = await response.json()
        const annotation = result.responses?.[0]?.fullTextAnnotation

        return {
          text: annotation?.text || '',
          confidence: annotation?.pages?.[0]?.blocks?.[0]?.confidence || 0.8,
        }
      })
    )

    // Combine results
    const combinedText = pageResults.map((r) => r.text).join('\n\n')
    const avgConfidence =
      pageResults.reduce((sum, r) => sum + r.confidence, 0) / pageResults.length

    return {
      success: true,
      data: {
        text: combinedText,
        confidence: avgConfidence,
        pageCount: pages.length,
        isScanned: true,
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
