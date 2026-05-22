/**
 * OCR Document Types
 *
 * Shared types for OCR document processing.
 */

import { isProxyConfigured } from './config'

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
  /** Form fields extracted */
  formFields: FormField[]
  /** Tables extracted */
  tables: Table[]
  /** Processing metadata */
  metadata: {
    backend: 'vision-api'
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

export type DocumentOCRResponse = { success: true; data: DocumentOCRResult } | DocumentOCRError

// ============================================================================
// PDF HASH COMPUTATION
// ============================================================================

/**
 * Compute SHA-256 hash of PDF buffer
 */
export async function computePdfHash(pdfBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', pdfBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compute SHA-256 hash from File object
 */
export async function computePdfHashFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return computePdfHash(buffer)
}

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * Check if OCR backend is available
 */
export function isDocumentOCRAvailable(): boolean {
  return isProxyConfigured()
}
