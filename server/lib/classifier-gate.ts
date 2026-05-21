/**
 * Document Classifier Gate
 *
 * Server-side layer over the existing heuristic classifier to enforce type
 * consistency at extraction time. Prevents "kasko classified as konut" bugs
 * by rejecting obvious type mismatches before returning the response.
 *
 * This is Fix-5 of the fallback chain hardening.
 */

import { classifyDocumentType, type DocumentType } from '../../src/lib/policy-pipeline/stage1-extract/document-classifier.js'
import { logger as _logger } from '../lib/logger.js'

// Logger imported for future expansion; unused currently

export interface ClassificationResult {
  type: DocumentType
  confidence: 'high' | 'medium' | 'low'
  hints: string[]
}

/**
 * Classify the document text and return type + confidence.
 *
 * Confidence scoring:
 *   - high:   Multiple strong keywords matched
 *   - medium: One strong keyword or multiple weak keywords
 *   - low:    Only weak/indirect hints
 */
export function classifyDocument(documentText: string): ClassificationResult {
  const type = classifyDocumentType(documentText)
  const lower = documentText.toLocaleLowerCase('tr-TR').substring(0, 5000)
  const hints: string[] = []

  // Determine confidence by counting matched indicators
  let matchScore = 0

  switch (type) {
    case 'kasko': {
      const kaskoHints = [
        'kasko sigorta',
        'kasko poliçe',
        'genişletilmiş kasko',
        'dar kasko',
        'birleşik kasko',
        'araç sigorta',
        'rayiç değer',
        'ihtiyari mali mesuliyet',
        'imm',
        'kasko değer',
      ]
      for (const hint of kaskoHints) {
        if (lower.includes(hint)) {
          hints.push(hint)
          matchScore++
        }
      }
      break
    }
    case 'traffic': {
      const trafficHints = ['zmss', 'trafik sigorta', 'zorunlu mali']
      for (const hint of trafficHints) {
        if (lower.includes(hint)) {
          hints.push(hint)
          matchScore++
        }
      }
      break
    }
    case 'home': {
      const homeHints = ['konut sigorta', 'ev sigorta', 'mesken', 'yangın sigorta', 'dask']
      for (const hint of homeHints) {
        if (lower.includes(hint)) {
          hints.push(hint)
          matchScore++
        }
      }
      break
    }
    case 'health': {
      const healthHints = ['sağlık sigorta', 'tamamlayıcı sağlık', 'tss']
      for (const hint of healthHints) {
        if (lower.includes(hint)) {
          hints.push(hint)
          matchScore++
        }
      }
      break
    }
    default: {
      if (lower.includes('sigorta')) {
        hints.push('sigorta (generic)')
        matchScore = 1
      }
    }
  }

  return {
    type,
    confidence: matchScore >= 3 ? 'high' : matchScore >= 2 ? 'medium' : 'low',
    hints: [...new Set(hints)], // dedup
  }
}

/**
 * Check whether the extracted policy type matches the document classification.
 * Returns a mismatch description or null if consistent.
 */
export function checkTypeConsistency(
  classification: ClassificationResult,
  extractedPolicyType: string | undefined | null
): {
  consistent: boolean
  mismatchDescription: string | null
} {
  if (!extractedPolicyType || classification.type === 'unknown') {
    return { consistent: true, mismatchDescription: null }
  }

  const extracted = extractedPolicyType.toLowerCase()

  // Map Turkish document types to extracted policy types
  const typeMap: Record<DocumentType, string[]> = {
    kasko: ['kasko', 'birleşik kasko', 'genişletilmiş kasko', 'motor', 'auto'],
    traffic: ['trafik', 'zmss', 'traffic', 'liability', 'third party'],
    home: ['konut', 'home', 'dask', 'earthquake', 'house', 'ev', 'mesken'],
    health: ['sağlık', 'health', 'tss'],
    life: ['hayat', 'life'],
    business: ['işyeri', 'business', 'commercial', 'ticari'],
    nakliyat: ['nakliyat', 'transport', 'marine'],
    dask: ['dask', 'deprem', 'earthquake', 'konut'],
    unknown: [],
  }

  const expected = typeMap[classification.type] || []

  // If the document is clearly TYPE and extraction says something wildly different
  // e.g. document says "kasko" but extraction says "Konut Sigortası"
  const hasMatch = expected.some((e) => extracted.includes(e))
  if (!hasMatch && classification.confidence !== 'low') {
    return {
      consistent: false,
      mismatchDescription: `Document classified as "${classification.type}" (confidence: ${classification.confidence}) but extraction says "${extractedPolicyType}"`,
    }
  }

  return { consistent: true, mismatchDescription: null }
}
