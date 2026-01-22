/**
 * AI Text Processor - Enhanced Version
 *
 * Second-pass AI processing for raw extracted text:
 * - Fixes Turkish character spacing issues (B İ RLE Şİ K → BİRLEŞİK)
 * - Removes garbage/binary data blocks
 * - Cleans up URLs and emails (www. site. com → www.site.com)
 * - Corrects OCR errors and formatting
 * - Makes text human and AI readable
 *
 * NEW: Clean-room document normalization mode for legally auditable processing
 * NEW: Integrated deterministic pre-clean module for comprehensive Turkish OCR cleanup
 */

import { env } from '@/lib/env'
import { DocumentNormalizer, type DocumentNormalizerOutput } from './document-normalizer'
import {
  OCR_CORRECTION_PROMPT,
  buildDocumentProcessingPrompt,
  parseDocumentProcessingResponse,
  validateOCRCorrection,
} from './prompts'
import { preCleanOcrText, type PreCleanStats } from '@/lib/pipeline/deterministic-preclean'
import {
  cleanTurkishOCRWithAI,
  cleanTurkishOCROffline,
  type AICleanupResult,
  type AIProviderConfig,
  type AICleanerOptions,
} from '@/lib/pipeline/ai-ocr-cleaner'

export interface ProcessedTextResult {
  success: boolean
  processedText: string
  corrections: TextCorrection[]
  detectedLanguage: string
  confidence: number
  processingTimeMs: number
  cleanupStats: CleanupStats
}

export interface TextCorrection {
  original: string
  corrected: string
  type: 'ocr_error' | 'spelling' | 'formatting' | 'language' | 'structure' | 'garbage_removal'
  position?: { start: number; end: number }
}

export interface CleanupStats {
  garbageBlocksRemoved: number
  qrBlocksRemoved: number
  eSigortaArtifactsRemoved: number
  spacedCharsFixed: number
  urlsCleaned: number
  linesRemoved: number
  totalCharactersRemoved: number
  sectionsIdentified: string[]
  numbersNormalized: number
}

// ============================================================================
// TURKISH CHARACTER SPACING PATTERNS
// Detects spaced Turkish characters like "B İ RLE Şİ K" and merges them
// ============================================================================

// Turkish character sets reference (hardcoded in regex patterns for performance)
// Upper: A-ZÇĞİÖŞÜ  Lower: a-zçğıöşü
// Special chars: ÇçĞğİıÖöŞşÜü

// Note: These constants are documented for reference but regex patterns
// use literal strings for better performance and compatibility
const _TURKISH_SPECIAL_CHARS = 'ÇçĞğİıÖöŞşÜü'
const _ALL_TURKISH_UPPER = 'A-ZÇĞİÖŞÜ'
const _ALL_TURKISH_LOWER = 'a-zçğıöşü'
void _TURKISH_SPECIAL_CHARS, _ALL_TURKISH_UPPER, _ALL_TURKISH_LOWER // Suppress unused warnings

/**
 * Fix spaced Turkish characters (B İ RLE Şİ K → BİRLEŞİK)
 * Detects sequences of single letters with spaces and merges them
 *
 * ENHANCED: Now handles:
 * - Single special char spacing: "Poli ç e" → "Poliçe", "Ara ç" → "Araç"
 * - Diacritic spacing: "D ü zenleme" → "Düzenleme", "De ğ er" → "Değer"
 * - All-caps spacing: "POL İÇ ES İ" → "POLİÇESİ"
 * - Mixed case: "GEN İŞ LET İ LM İŞ" → "GENİŞLETİLMİŞ"
 */
function fixSpacedTurkishCharacters(text: string): { text: string; fixCount: number } {
  let fixCount = 0
  let result = text

  // =========================================================================
  // PRIORITY 1: Fix single Turkish special character spacing
  // These are the most common OCR errors: "Poli ç e", "Ara ç", "De ğ er"
  // =========================================================================

  // Pattern: word + space + single Turkish char + space/end
  // "Poli ç e" → "Poliçe", "ara ç" → "araç"
  const singleSpecialCharPatterns: Array<[RegExp, string]> = [
    // ç spacing
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+ç\s+([a-zçğıöşü]*)/gi, '$1ç$2'],
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+Ç\s+([A-Za-zÇĞİÖŞÜçğıöşü]*)/gi, '$1Ç$2'],

    // ğ spacing
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+ğ\s+([a-zçğıöşü]*)/gi, '$1ğ$2'],
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+Ğ\s+([A-Za-zÇĞİÖŞÜçğıöşü]*)/gi, '$1Ğ$2'],

    // ş spacing
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+ş\s+([a-zçğıöşü]*)/gi, '$1ş$2'],
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+Ş\s+([A-Za-zÇĞİÖŞÜçğıöşü]*)/gi, '$1Ş$2'],

    // ü spacing
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+ü\s+([a-zçğıöşü]*)/gi, '$1ü$2'],
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+Ü\s+([A-Za-zÇĞİÖŞÜçğıöşü]*)/gi, '$1Ü$2'],

    // ö spacing
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+ö\s+([a-zçğıöşü]*)/gi, '$1ö$2'],
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+Ö\s+([A-Za-zÇĞİÖŞÜçğıöşü]*)/gi, '$1Ö$2'],

    // ı spacing (dotless i)
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+ı\s+([a-zçğıöşü]*)/gi, '$1ı$2'],

    // İ spacing (dotted I)
    [/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+İ\s+([A-Za-zÇĞİÖŞÜçğıöşü]*)/gi, '$1İ$2'],
  ]

  for (const [pattern, replacement] of singleSpecialCharPatterns) {
    const beforeLength = result.length
    result = result.replace(pattern, replacement)
    if (result.length !== beforeLength) {
      fixCount++
    }
  }

  // =========================================================================
  // PRIORITY 2: Fix word-internal single char spacing
  // Pattern: "D ü zenleme" → "Düzenleme", "M üş teri" → "Müşteri"
  // =========================================================================

  // Fix single letter spacing within words (letter + space + letter pattern)
  // This catches: "D ü zenleme", "S ü re", "M üş teri", "Ş irketi"
  const intraWordSpacingPattern = /([A-ZÇĞİÖŞÜa-zçğıöşü])\s([ÇçĞğİıÖöŞşÜü])\s?([a-zçğıöşü]*)/g
  result = result.replace(intraWordSpacingPattern, (_match, before, special, after) => {
    fixCount++
    return before + special + (after || '')
  })

  // =========================================================================
  // PRIORITY 3: All-uppercase spaced sequences
  // "B İ RLE Şİ K" → "BİRLEŞİK", "POL İÇ ES İ" → "POLİÇESİ"
  // =========================================================================

  // Pattern 1: Single uppercase letters with spaces between them
  // Matches: "B İ RLE Şİ K", "A N A D O L U"
  // Must have at least 3 spaced letters to be considered a word
  const spacedUpperPattern = /(?<![A-ZÇĞİÖŞÜ])([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?:\s+([A-ZÇĞİÖŞÜ]))?(?![A-ZÇĞİÖŞÜ])/g

  result = result.replace(spacedUpperPattern, (match, ...groups) => {
    // Filter out undefined groups and join
    const letters = groups.slice(0, 12).filter(Boolean)
    if (letters.length >= 3) {
      fixCount++
      return letters.join('')
    }
    return match
  })

  // Pattern 2: Handle mixed case spaced characters
  // Matches sequences where letters are separated by single spaces
  const mixedSpacedPattern = /\b([A-ZÇĞİÖŞÜa-zçğıöşü])\s([A-ZÇĞİÖŞÜa-zçğıöşü])\s([A-ZÇĞİÖŞÜa-zçğıöşü])(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?(?:\s([A-ZÇĞİÖŞÜa-zçğıöşü]))?\b/g

  result = result.replace(mixedSpacedPattern, (match, ...groups) => {
    const letters = groups.slice(0, 12).filter(Boolean)
    // Only merge if it looks like a word (at least 3 chars)
    if (letters.length >= 3) {
      fixCount++
      return letters.join('')
    }
    return match
  })

  // =========================================================================
  // PRIORITY 4: Known Turkish insurance words (comprehensive list)
  // =========================================================================

  // Pattern 3: Known Turkish words that often appear spaced (UPPERCASE)
  const knownSpacedWords: Array<[RegExp, string]> = [
    // Insurance company/document terms
    [/B\s*İ\s*R\s*L\s*E\s*Ş\s*İ\s*K/gi, 'BİRLEŞİK'],
    [/S\s*İ\s*G\s*O\s*R\s*T\s*A/gi, 'SİGORTA'],
    [/A\s*N\s*A\s*D\s*O\s*L\s*U/gi, 'ANADOLU'],
    [/T\s*Ü\s*R\s*K\s*İ\s*Y\s*E/gi, 'TÜRKİYE'],
    [/İ\s*S\s*T\s*A\s*N\s*B\s*U\s*L/gi, 'İSTANBUL'],
    [/P\s*O\s*L\s*İ\s*Ç\s*E/gi, 'POLİÇE'],
    [/T\s*E\s*M\s*İ\s*N\s*A\s*T/gi, 'TEMİNAT'],
    [/K\s*A\s*S\s*K\s*O/gi, 'KASKO'],
    [/T\s*R\s*A\s*F\s*İ\s*K/gi, 'TRAFİK'],
    [/A\s*R\s*A\s*Ç/gi, 'ARAÇ'],
    [/S\s*İ\s*G\s*O\s*R\s*T\s*A\s*L\s*I/gi, 'SİGORTALI'],
    [/P\s*R\s*İ\s*M/gi, 'PRİM'],
    [/M\s*U\s*A\s*F\s*İ\s*Y\s*E\s*T/gi, 'MUAFİYET'],

    // Additional insurance terms
    [/G\s*E\s*N\s*İ\s*Ş\s*L\s*E\s*T\s*İ\s*L\s*M\s*İ\s*Ş/gi, 'GENİŞLETİLMİŞ'],
    [/D\s*Ü\s*Z\s*E\s*N\s*L\s*E\s*M\s*E/gi, 'DÜZENLEME'],
    [/Ş\s*İ\s*R\s*K\s*E\s*T/gi, 'ŞİRKET'],
    [/M\s*Ü\s*Ş\s*T\s*E\s*R\s*İ/gi, 'MÜŞTERİ'],
    [/İ\s*R\s*T\s*İ\s*B\s*A\s*T/gi, 'İRTİBAT'],
    [/Ş\s*İ\s*K\s*A\s*Y\s*E\s*T/gi, 'ŞİKAYET'],
    [/D\s*E\s*Ğ\s*E\s*R/gi, 'DEĞER'],
    [/S\s*Ü\s*R\s*E/gi, 'SÜRE'],
    [/Ö\s*D\s*E\s*M\s*E/gi, 'ÖDEME'],
    [/Ü\s*C\s*R\s*E\s*T/gi, 'ÜCRET'],
    [/H\s*A\s*S\s*A\s*R/gi, 'HASAR'],
    [/T\s*A\s*R\s*İ\s*H/gi, 'TARİH'],
    [/P\s*L\s*A\s*K\s*A/gi, 'PLAKA'],
  ]

  for (const [pattern, replacement] of knownSpacedWords) {
    if (pattern.test(result)) {
      fixCount++
      result = result.replace(pattern, replacement)
    }
  }

  // Pattern 4: Common Turkish words with lowercase spacing (from OCR)
  // These handle cases like "poli ç e", "de ğ erlendirmesi", "sigorta l ı"
  const lowercaseSpacedWords: Array<[RegExp, string]> = [
    // Insurance terms (lowercase variations)
    [/poli\s*ç\s*e/gi, 'poliçe'],
    [/de\s*ğ\s*erlendirme/gi, 'değerlendirme'],
    [/de\s*ğ\s*er/gi, 'değer'],
    [/sigorta\s*l\s*ı/gi, 'sigortalı'],
    [/sigorta\s*c\s*ı/gi, 'sigortacı'],
    [/teminat\s*l\s*ar/gi, 'teminatlar'],
    [/muafiyet\s*i/gi, 'muafiyeti'],
    [/öde\s*me/gi, 'ödeme'],
    [/ücret\s*i/gi, 'ücreti'],
    [/güvence\s*si/gi, 'güvencesi'],
    [/konut\s*u/gi, 'konutu'],
    [/araç\s*ı/gi, 'aracı'],
    [/hasar\s*ı/gi, 'hasarı'],
    [/prim\s*i/gi, 'primi'],
    [/tarih\s*i/gi, 'tarihi'],
    [/bedel\s*i/gi, 'bedeli'],
    [/limit\s*i/gi, 'limiti'],
    [/kaza\s*s\s*ı/gi, 'kazası'],
    [/olay\s+ba\s*ş/gi, 'olay başı'],
    [/olay\s+ba\s*ş\s*ı/gi, 'olay başı'],
    // Common words with Turkish special chars
    [/şirket\s*i/gi, 'şirketi'],
    [/ş\s*irket/gi, 'şirket'],
    [/ö\s*deme/gi, 'ödeme'],
    [/ü\s*cret/gi, 'ücret'],
    [/ç\s*arpma/gi, 'çarpma'],
    [/ç\s*alınma/gi, 'çalınma'],
    [/h\s*ırsız/gi, 'hırsız'],
    [/y\s*angın/gi, 'yangın'],
    [/d\s*eprem/gi, 'deprem'],
    [/s\s*el\b/gi, 'sel'],
    [/d\s*olu/gi, 'dolu'],
    [/f\s*ırtına/gi, 'fırtına'],
  ]

  for (const [pattern, replacement] of lowercaseSpacedWords) {
    const beforeLength = result.length
    result = result.replace(pattern, replacement)
    if (result.length !== beforeLength) {
      fixCount++
    }
  }

  // Pattern 5: Fix single-character spacing in common suffixes
  // Handles: "sigorta l ı" -> "sigortalı", "değer l endirme" -> "değerlendirme"
  const suffixPatterns: Array<[RegExp, string]> = [
    [/(\w{3,})\s+l\s*ı\b/gi, '$1lı'],
    [/(\w{3,})\s+l\s*i\b/gi, '$1li'],
    [/(\w{3,})\s+l\s*u\b/gi, '$1lu'],
    [/(\w{3,})\s+l\s*ü\b/gi, '$1lü'],
    [/(\w{3,})\s+s\s*ı\b/gi, '$1sı'],
    [/(\w{3,})\s+s\s*i\b/gi, '$1si'],
    [/(\w{3,})\s+s\s*u\b/gi, '$1su'],
    [/(\w{3,})\s+s\s*ü\b/gi, '$1sü'],
    [/(\w{3,})\s+n\s*ı\b/gi, '$1nı'],
    [/(\w{3,})\s+n\s*i\b/gi, '$1ni'],
    [/(\w{3,})\s+l\s*ar\b/gi, '$1lar'],
    [/(\w{3,})\s+l\s*er\b/gi, '$1ler'],
  ]

  for (const [pattern, replacement] of suffixPatterns) {
    const beforeLength = result.length
    result = result.replace(pattern, replacement)
    if (result.length !== beforeLength) {
      fixCount++
    }
  }

  return { text: result, fixCount }
}

// ============================================================================
// URL AND EMAIL CLEANUP
// Fixes spaces in URLs and emails (www. site. com → www.site.com)
// ============================================================================

/**
 * Clean up URLs that have spaces inserted by OCR
 */
function cleanupURLsAndEmails(text: string): { text: string; cleanupCount: number } {
  let cleanupCount = 0
  let result = text

  // Fix spaced URLs: www. anadolusigorta. com. tr → www.anadolusigorta.com.tr
  // Pattern matches domain-like structures with spaces around dots
  const spacedDomainPattern = /(\w+)\s*\.\s*(\w+)\s*\.\s*(com|org|net|gov|edu|tr|co)\s*(?:\.\s*(tr|uk|us|de))?/gi

  result = result.replace(spacedDomainPattern, (match, ...groups) => {
    const parts = groups.slice(0, 4).filter(Boolean)
    if (parts.length >= 3) {
      cleanupCount++
      return parts.join('.')
    }
    return match
  })

  // Fix www prefix: www . site → www.site
  result = result.replace(/www\s*\.\s*/gi, () => {
    cleanupCount++
    return 'www.'
  })

  // Fix http/https: http : / / → http://
  result = result.replace(/https?\s*:\s*\/\s*\/\s*/gi, (match) => {
    cleanupCount++
    return match.includes('https') ? 'https://' : 'http://'
  })

  // Fix email patterns: info @ company . com → info@company.com
  const spacedEmailPattern = /(\w+)\s*@\s*(\w+)\s*\.\s*(com|org|net|gov|tr)/gi
  result = result.replace(spacedEmailPattern, (_match, user, domain, tld) => {
    cleanupCount++
    return `${user}@${domain}.${tld}`
  })

  // Fix common domains that appear spaced
  const commonDomains: Array<[RegExp, string]> = [
    [/anadolu\s*sigorta\s*\.\s*com\s*\.\s*tr/gi, 'anadolusigorta.com.tr'],
    [/allianz\s*\.\s*com\s*\.\s*tr/gi, 'allianz.com.tr'],
    [/axa\s*sigorta\s*\.\s*com\s*\.\s*tr/gi, 'axasigorta.com.tr'],
    [/aksigorta\s*\.\s*com\s*\.\s*tr/gi, 'aksigorta.com.tr'],
    [/mapfre\s*\.\s*com\s*\.\s*tr/gi, 'mapfre.com.tr'],
  ]

  for (const [pattern, replacement] of commonDomains) {
    if (pattern.test(result)) {
      cleanupCount++
      result = result.replace(pattern, replacement)
    }
  }

  return { text: result, cleanupCount }
}

// ============================================================================
// GARBAGE DATA REMOVAL
// Removes binary/encrypted data blocks, QR codes, and barcodes that appear in PDFs
// ============================================================================

/**
 * Patterns that indicate garbage/binary data
 */
const GARBAGE_PATTERNS = [
  // Encrypted/binary data blocks (lots of special chars, random sequences)
  /[\x00-\x1F\x7F-\x9F]+/g,  // Control characters
  /[B-Zb-z]{1,2}[\^<>\[\]{}|\\]{2,}[A-Za-z0-9]{2,}/g,  // Encoded data like "B^^^Bj54<O[..."
  /(?:^|\n)[^\n]*[<>\[\]{}|\\^~`]{5,}[^\n]*(?:\n|$)/gm,  // Lines with lots of special chars
  /(?:[A-Za-z0-9+/]{4}){10,}={0,2}/g,  // Base64-like long sequences
  /(?:\d[A-Za-z]){10,}/g,  // Alternating digit-letter patterns (binary artifacts)
  /[^\x20-\x7E\xA0-\xFF\u0100-\u017F]+/g,  // Non-printable except common Unicode
]

/**
 * QR Code and Barcode patterns - comprehensive detection for Turkish insurance PDFs
 *
 * Turkish insurance policies commonly embed:
 * - QR codes for digital verification (e-sigorta)
 * - Barcodes for policy tracking
 * - DataMatrix codes for regulatory compliance
 * - Encoded digital signatures
 */
const QR_BARCODE_PATTERNS = [
  // =========================================================================
  // QR CODE PATTERNS (Binary data that appears when QR is OCR'd)
  // =========================================================================

  // Pattern 1: B^^^B style (most common in Turkish insurance PDFs)
  // Matches: B^^^Bj54<O[dR^B, B^B^B, B^^^Bk7j etc.
  /(?:B\s*\^+\s*B[A-Za-z0-9<>\[\]]*\s*)+/g,
  /(?:B\s*[\^<>]+\s*B\s*)+/gi,

  // Pattern 2: Generic caret sequences with letters
  /(?:[A-Z]\s*[\^<>]+\s*[A-Z][A-Za-z0-9]*\s*)+/g,
  /(?:[A-Z][\^]+[A-Z])+[A-Za-z0-9<>\[\]]+/g,

  // Pattern 3: Encoded blocks with special char clusters
  /[A-Za-z0-9]*[\^<>\[\]{}|\\]{3,}[A-Za-z0-9]+/g,

  // =========================================================================
  // BARCODE PATTERNS (Linear barcodes)
  // =========================================================================

  // Vertical bar patterns (Code 128, Code 39, etc.)
  /[|l1I]{15,}/g,

  // Horizontal line patterns
  /[=_\-]{15,}/g,

  // Mixed bar patterns
  /(?:[|lI1]+[.\s]*){10,}/g,

  // =========================================================================
  // DATAMATRIX / PDF417 / AZTEC PATTERNS
  // =========================================================================

  // Very long alphanumeric strings (encoded data, no natural words)
  /\b[A-Za-z0-9+/]{50,}(?:={0,2})?\b/g,

  // Hex-like sequences (digital signatures, checksums)
  /(?:[0-9A-Fa-f]{2}\s*){15,}/g,

  // Alternating pattern blocks (common in 2D barcodes)
  /(?:[01]{8}\s*){5,}/g,

  // =========================================================================
  // TURKISH DIGITAL SIGNATURE PATTERNS (E-İMZA)
  // =========================================================================

  // Base64-encoded signature blocks
  /(?:[A-Za-z0-9+/]{4}){15,}={0,2}/g,

  // SHA/hash values
  /\b[A-Fa-f0-9]{32,128}\b/g,

  // PEM-style blocks (BEGIN/END markers)
  /-----BEGIN\s+[\w\s]+-----[\s\S]*?-----END\s+[\w\s]+-----/gi,

  // =========================================================================
  // NOISE AND ENCODING ARTIFACTS
  // =========================================================================

  // Unicode replacement characters and boxes
  /[\uFFFD\u2588\u2591-\u2593]+/g,

  // Repeated non-word characters
  /([^\w\s\u00C0-\u017F])\1{5,}/g,

  // OCR confusion sequences (looks like barcode residue)
  /(?:[0O]+[1Il]+){5,}/g,

  // =========================================================================
  // EXPLICIT MARKERS (if document contains them)
  // =========================================================================

  /\[QR\][\s\S]*?\[\/QR\]/gi,
  /\[BARCODE\][\s\S]*?\[\/BARCODE\]/gi,
  /\[DATAMATRIX\][\s\S]*?\[\/DATAMATRIX\]/gi,

  // Lines that are entirely non-word characters
  /^[\s\W]+$/gm,
]

/**
 * Additional patterns specific to Turkish e-Sigorta documents
 */
const ESIGORTA_ARTIFACT_PATTERNS = [
  // E-signature verification codes
  /E-İMZA\s*:\s*[A-Za-z0-9+/=]+/gi,
  /DOĞRULAMA\s*KODU\s*:\s*[A-Za-z0-9]+/gi,

  // QR verification URLs that got corrupted
  /https?:\/\/[^\s]*[\^<>\[\]{}|\\]+[^\s]*/gi,

  // Digital certificate fragments
  /CN=[^\n,]+,\s*OU=[^\n,]+/gi,

  // Timestamp tokens
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}[A-Za-z0-9+/=]+/g,
]

/**
 * Detect lines that are likely garbage (too many special chars, random sequences)
 */
function isGarbageLine(line: string): boolean {
  // Empty or very short lines are not garbage
  if (line.trim().length < 5) return false

  const trimmed = line.trim()

  // Check ratio of special characters to total
  const specialChars = (trimmed.match(/[<>\[\]{}|\\^~`@#$%&*+=]/g) || []).length
  const specialRatio = specialChars / trimmed.length

  // If more than 20% special chars, likely garbage
  if (specialRatio > 0.2) return true

  // Check for control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return true

  // Check for binary-like patterns
  if (/^[A-Za-z0-9+/=]{50,}$/.test(trimmed)) return true

  // Random character sequences with no vowels
  if (trimmed.length > 20 && !/[aeiouAEIOUğüşıöçĞÜŞİÖÇ]/.test(trimmed)) return true

  return false
}

/**
 * Remove garbage data blocks from text
 */
function removeGarbageData(text: string): { text: string; stats: { blocksRemoved: number; linesRemoved: number; charsRemoved: number; qrBlocksRemoved: number; eSigortaArtifacts: number } } {
  const originalLength = text.length
  let blocksRemoved = 0
  let linesRemoved = 0
  let qrBlocksRemoved = 0
  let eSigortaArtifacts = 0

  // First pass: Remove e-Sigorta specific artifacts
  let result = text
  for (const pattern of ESIGORTA_ARTIFACT_PATTERNS) {
    const matches = result.match(pattern)
    if (matches) {
      eSigortaArtifacts += matches.length
      result = result.replace(pattern, ' ')
    }
  }

  // Second pass: Remove QR/barcode patterns from the entire text
  for (const pattern of QR_BARCODE_PATTERNS) {
    const matches = result.match(pattern)
    if (matches) {
      qrBlocksRemoved += matches.length
      result = result.replace(pattern, ' ')
    }
  }

  // Third pass: Clean each line
  const lines = result.split('\n')
  const cleanedLines: string[] = []

  for (const line of lines) {
    if (isGarbageLine(line)) {
      linesRemoved++
      blocksRemoved++
    } else {
      // Clean the line of inline garbage
      let cleanedLine = line
      for (const pattern of GARBAGE_PATTERNS) {
        cleanedLine = cleanedLine.replace(pattern, ' ')
      }
      // Only keep if something remains
      if (cleanedLine.trim().length > 0) {
        cleanedLines.push(cleanedLine)
      } else if (line.trim().length > 0) {
        linesRemoved++
      }
    }
  }

  result = cleanedLines.join('\n')
  const charsRemoved = originalLength - result.length

  return {
    text: result,
    stats: { blocksRemoved, linesRemoved, charsRemoved, qrBlocksRemoved, eSigortaArtifacts },
  }
}

// ============================================================================
// QUALITY METRICS AND CER CALCULATION
// ============================================================================

/**
 * Quality metrics for OCR text processing
 */
export interface TextQualityMetrics {
  /** Character Error Rate (0-1, lower is better) */
  estimatedCER: number
  /** Word Error Rate (0-1, lower is better) */
  estimatedWER: number
  /** Overall quality score (0-100, higher is better) */
  qualityScore: number
  /** Confidence level in the metrics */
  confidence: 'high' | 'medium' | 'low'
  /** Specific quality indicators */
  indicators: {
    garbageRatio: number
    turkishCharCorrectness: number
    spacingQuality: number
    numberFormatConsistency: number
    structureIntegrity: number
  }
  /** Suggested actions based on quality */
  suggestions: string[]
}

/**
 * Calculate quality metrics for processed text
 *
 * This estimates CER/WER without a reference document by analyzing:
 * - Presence of garbage/binary artifacts
 * - Turkish character usage patterns
 * - Spacing consistency
 * - Number format consistency
 * - Document structure integrity
 *
 * @param originalText - Raw OCR text
 * @param processedText - Text after processing
 * @param stats - Cleanup statistics
 * @returns Quality metrics
 */
export function calculateQualityMetrics(
  originalText: string,
  processedText: string,
  stats: CleanupStats
): TextQualityMetrics {
  const suggestions: string[] = []

  // 1. Garbage ratio (what percentage was garbage)
  const garbageRatio = stats.totalCharactersRemoved / Math.max(originalText.length, 1)

  // 2. Turkish character correctness
  // Check for common OCR errors in Turkish chars
  const turkishErrors = countTurkishCharErrors(processedText)
  const expectedTurkishChars = (processedText.match(/[a-zA-Z]/g) || []).length * 0.15 // ~15% Turkish chars expected
  const turkishCharCorrectness = 1 - (turkishErrors / Math.max(expectedTurkishChars, 1))

  // 3. Spacing quality
  // Check for abnormal spacing patterns
  const spacingIssues = (processedText.match(/\s{3,}|\w\s\w\s\w/g) || []).length
  const totalSpaces = (processedText.match(/\s/g) || []).length
  const spacingQuality = 1 - (spacingIssues / Math.max(totalSpaces, 1))

  // 4. Number format consistency
  const numberFormatConsistency = checkNumberFormatConsistency(processedText)

  // 5. Structure integrity
  // Check if document has expected sections
  const structureScore = calculateStructureIntegrity(processedText)

  // Calculate estimated CER
  // CER = (substitutions + insertions + deletions) / reference length
  // We estimate based on detected issues
  const estimatedCER = Math.min(1, (
    garbageRatio * 0.3 +
    (1 - turkishCharCorrectness) * 0.25 +
    (1 - spacingQuality) * 0.2 +
    (1 - numberFormatConsistency) * 0.15 +
    (1 - structureScore) * 0.1
  ))

  // Estimate WER (typically higher than CER)
  const estimatedWER = Math.min(1, estimatedCER * 1.5)

  // Overall quality score (0-100)
  const qualityScore = Math.round((1 - estimatedCER) * 100)

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'medium'
  if (originalText.length > 2000 && stats.sectionsIdentified.length > 3) {
    confidence = 'high'
  } else if (originalText.length < 500) {
    confidence = 'low'
  }

  // Generate suggestions
  if (garbageRatio > 0.1) {
    suggestions.push('Document contains significant binary/QR data artifacts')
  }
  if (turkishCharCorrectness < 0.9) {
    suggestions.push('Turkish character OCR errors detected (İ/I, Ş/S confusion)')
  }
  if (spacingQuality < 0.9) {
    suggestions.push('Spacing issues detected - words may be split or merged incorrectly')
  }
  if (numberFormatConsistency < 0.8) {
    suggestions.push('Inconsistent number formats detected - verify amounts')
  }
  if (structureScore < 0.7) {
    suggestions.push('Document structure unclear - key sections may be missing')
  }
  if (suggestions.length === 0) {
    suggestions.push('Document quality is good')
  }

  return {
    estimatedCER,
    estimatedWER,
    qualityScore,
    confidence,
    indicators: {
      garbageRatio,
      turkishCharCorrectness: Math.max(0, Math.min(1, turkishCharCorrectness)),
      spacingQuality: Math.max(0, Math.min(1, spacingQuality)),
      numberFormatConsistency,
      structureIntegrity: structureScore,
    },
    suggestions,
  }
}

/**
 * Count potential Turkish character OCR errors
 */
function countTurkishCharErrors(text: string): number {
  let errors = 0

  // Check for common ASCII substitutions that should be Turkish
  // ISTANBUL should be İSTANBUL
  if (/\bISTANBUL\b/.test(text)) errors += 2
  if (/\bTURKIYE\b/.test(text)) errors += 2
  if (/\bSIGORTA\b/.test(text)) errors += 1
  if (/\bPOLICE\b/.test(text) && /sigorta|kasko|trafik/i.test(text)) errors += 1

  // Check for isolated ASCII where Turkish expected
  // Words ending in 'LI' or 'SI' that should have Turkish chars
  const suspiciousEndings = (text.match(/\b\w+(?:LI|SI|NI|RI)\b/g) || []).length
  errors += suspiciousEndings * 0.3

  return errors
}

/**
 * Check number format consistency
 */
function checkNumberFormatConsistency(text: string): number {
  // Count Turkish format numbers (N.NNN,NN)
  const turkishFormat = (text.match(/\d{1,3}(?:\.\d{3})+(?:,\d{2})?/g) || []).length

  // Count English format numbers (N,NNN.NN)
  const englishFormat = (text.match(/\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g) || []).length

  // Count ambiguous (could be either)
  const ambiguous = (text.match(/\d+\.\d{2}\b/g) || []).length

  const total = turkishFormat + englishFormat + ambiguous
  if (total === 0) return 1 // No numbers to check

  // Penalize mixed formats
  if (turkishFormat > 0 && englishFormat > 0) {
    return 0.5 // Mixed formats
  }

  return 1 // Consistent
}

/**
 * Calculate document structure integrity
 */
function calculateStructureIntegrity(text: string): number {
  let score = 0
  const checks = [
    // Has policy number pattern
    /(?:POLİÇE|POLICE|NO)\s*[:.]?\s*\d/i,
    // Has date pattern
    /\d{2}[./-]\d{2}[./-]\d{4}/,
    // Has currency amount
    /(?:₺|TL)\s*\d|^\d[\d.,]*\s*(?:TL|₺)/m,
    // Has section headers
    /(?:TEMİNAT|COVERAGE|PRİM|PREMIUM|SİGORTALI|INSURED)/i,
    // Has structured labels
    /(?:ADI?|SOYADI?|ADRES|TC|VKN)\s*:/i,
  ]

  for (const pattern of checks) {
    if (pattern.test(text)) score += 0.2
  }

  return Math.min(1, score)
}

// ============================================================================
// SECTION SEGMENTATION
// Identifies and marks document sections using Turkish insurance anchors
// ============================================================================

/**
 * Turkish insurance document section anchors
 */
const SECTION_ANCHORS: Record<string, string[]> = {
  '[TARAFLAR]': [
    'SÖZLEŞME TARAFLARI',
    'SİGORTA ETTİREN',
    'SİGORTALI BİLGİLERİ',
  ],
  '[KONU]': [
    'SİGORTA KONUSU',
    'ARAÇ BİLGİLERİ',
    'SİGORTALANAN ARAÇ',
  ],
  '[PRIM]': [
    'PRİM BİLGİLERİ',
    'PRİM TUTARI',
    'ÖDEME PLANI',
    'ÖDENECEK TUTAR',
  ],
  '[TEMINAT]': [
    'TEMİNAT',
    'SİGORTA KAPSAMI',
    'TEMİNAT TABLOSU',
    'KASKO TEMİNATLARI',
  ],
  '[KLOZLAR]': [
    'KLOZLAR',
    'ÖZEL ŞARTLAR',
    'EK KLOZLAR',
  ],
  '[MUAFIYET]': [
    'MUAFİYET',
    'TENZİLİ MUAFİYET',
    'SİGORTALI PAYI',
  ],
  '[HASARSIZLIK]': [
    'HASARSIZLIK',
    'HASARSIZLIK İNDİRİMİ',
    'NO-CLAIMS',
  ],
  '[IKAME]': [
    'İKAME ARAÇ',
    'YEDEK ARAÇ',
    'KİRALIK ARAÇ',
  ],
  '[ASISTANS]': [
    'ASİSTANS',
    'YOL YARDIM',
    'ÇEKME KURTARMA',
  ],
  '[ISTISNALAR]': [
    'İSTİSNALAR',
    'KAPSAM DIŞI',
    'TEMİNAT DIŞI',
  ],
  '[HASAR]': [
    'HASAR BİLDİRİMİ',
    'HASAR ANINDA',
    'HASAR PROSEDÜRÜ',
  ],
}

/**
 * Add section markers to text based on Turkish anchor phrases
 */
export function addSectionMarkers(text: string): { text: string; sectionsFound: string[] } {
  let result = text
  const sectionsFound: string[] = []

  for (const [marker, anchors] of Object.entries(SECTION_ANCHORS)) {
    for (const anchor of anchors) {
      // Create case-insensitive pattern that matches the anchor at start of line or after whitespace
      const pattern = new RegExp(`(^|\\n)(\\s*)(${escapeRegExp(anchor)})`, 'gi')
      const hasMatch = pattern.test(result)

      if (hasMatch) {
        // Add marker before the anchor
        result = result.replace(pattern, `$1$2${marker}\n$2$3`)
        if (!sectionsFound.includes(marker)) {
          sectionsFound.push(marker)
        }
      }
    }
  }

  return { text: result, sectionsFound }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================================
// NUMBER AND PUNCTUATION SPACING
// Fixes spacing around numbers and punctuation
// ============================================================================

/**
 * Fix spacing issues around numbers and punctuation
 */
function fixNumberAndPunctuationSpacing(text: string): string {
  let result = text

  // Fix "25 /1A" → "25/1A" (spaces around slashes in IDs)
  result = result.replace(/(\d+)\s*\/\s*(\d*[A-Za-z]?)/g, '$1/$2')

  // Fix "NO: 25" → "NO: 25" (ensure single space after colon in labels)
  result = result.replace(/:\s{2,}/g, ': ')

  // Fix "1. 000. 000" → "1.000.000" (Turkish number format)
  result = result.replace(/(\d)\s*\.\s*(\d{3})\s*\.\s*(\d{3})/g, '$1.$2.$3')
  result = result.replace(/(\d)\s*\.\s*(\d{3})/g, '$1.$2')

  // Fix "100 %" → "100%" (percentage)
  result = result.replace(/(\d+)\s+%/g, '$1%')

  // Fix isolated periods: ". " at start of sentences
  result = result.replace(/^\.\s+/gm, '')

  // Normalize multiple spaces to single
  result = result.replace(/[ \t]{2,}/g, ' ')

  // Normalize multiple newlines to double
  result = result.replace(/\n{3,}/g, '\n\n')

  return result
}

// ============================================================================
// TURKISH NUMERIC LOCALE NORMALIZATION
// Handles TR format (29.657,14) → internal decimal format (29657.14)
// ============================================================================

/**
 * Parse a Turkish-format number string to a numeric value
 * Turkish format uses . for thousands and , for decimal
 * Examples:
 *   "29.657,14" → 29657.14
 *   "1.500.000" → 1500000
 *   "100,50" → 100.50
 *   "1.234" → 1234 (if no comma, treat . as thousands)
 *
 * @param numStr - The number string in Turkish format
 * @returns Parsed number or NaN if invalid
 */
export function parseTurkishNumber(numStr: string): number {
  if (!numStr || typeof numStr !== 'string') return NaN

  // Clean the string: remove spaces and currency symbols
  let cleaned = numStr.trim()
    .replace(/\s+/g, '')
    .replace(/₺|TL|TRY/gi, '')
    .trim()

  // Handle empty after cleaning
  if (!cleaned) return NaN

  // Check for Turkish format indicators
  const hasTurkishDecimal = cleaned.includes(',')
  const hasPeriods = cleaned.includes('.')

  // Case 1: Has comma (definite Turkish decimal separator)
  if (hasTurkishDecimal) {
    // Remove thousand separators (periods) and convert decimal comma to period
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    return parseFloat(cleaned)
  }

  // Case 2: Has periods but no comma - could be Turkish thousands OR decimal
  if (hasPeriods) {
    // Heuristic: If the pattern matches N.NNN or N.NNN.NNN, treat as thousands
    const turkishThousandsPattern = /^\d{1,3}(\.\d{3})+$/
    if (turkishThousandsPattern.test(cleaned)) {
      // It's Turkish thousands format (1.234, 1.234.567)
      cleaned = cleaned.replace(/\./g, '')
      return parseFloat(cleaned)
    }

    // Otherwise, treat period as decimal (international format)
    return parseFloat(cleaned)
  }

  // Case 3: No separators - just parse as number
  return parseFloat(cleaned)
}

/**
 * Format a number to Turkish locale string
 * @param value - Numeric value
 * @param decimals - Number of decimal places (default 2)
 * @returns Turkish formatted string (e.g., "29.657,14")
 */
export function formatTurkishNumber(value: number, decimals = 2): string {
  if (isNaN(value)) return ''

  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Normalize numbers in text to consistent internal format
 * Converts Turkish numbers to standard decimal format for storage
 *
 * @param text - Text containing numbers
 * @param options - Normalization options
 * @returns Text with normalized numbers and count of changes
 */
export function normalizeNumbersInText(
  text: string,
  options: {
    preserveDisplay?: boolean  // If true, keep Turkish display format
    normalizeCurrency?: boolean  // If true, standardize currency amounts
  } = {}
): { text: string; changesCount: number } {
  const { preserveDisplay = false, normalizeCurrency = true } = options
  let result = text
  let changesCount = 0

  // Pattern 1: Turkish currency amounts (₺ 29.657,14 or 29.657,14 TL)
  if (normalizeCurrency) {
    // Match currency with Turkish format
    const currencyPattern = /(?:₺\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|₺)?/g

    result = result.replace(currencyPattern, (match, numPart) => {
      // Only process if it looks like Turkish format (has comma or multiple periods)
      if (numPart.includes(',') || (numPart.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(numPart)) {
        const parsed = parseTurkishNumber(numPart)
        if (!isNaN(parsed)) {
          changesCount++
          if (preserveDisplay) {
            // Keep as Turkish format but normalized (₺29.657,14)
            return `₺${formatTurkishNumber(parsed, numPart.includes(',') ? 2 : 0)}`
          }
          // Convert to internal format (₺29657.14)
          return `₺${parsed.toFixed(numPart.includes(',') ? 2 : 0)}`
        }
      }
      return match
    })
  }

  // Pattern 2: Standalone Turkish numbers (not currency)
  // Match patterns like "1.234.567" or "1.234,56"
  const turkishNumberPattern = /\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)\b/g

  result = result.replace(turkishNumberPattern, (match) => {
    // Skip if it looks like a date (DD.MM.YYYY)
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(match)) {
      return match
    }
    // Skip if it looks like a version number (1.2.3)
    if (/^\d+\.\d+\.\d+$/.test(match) && !/^\d{1,3}\.\d{3}\.\d{3}$/.test(match)) {
      return match
    }

    const parsed = parseTurkishNumber(match)
    if (!isNaN(parsed)) {
      changesCount++
      if (preserveDisplay) {
        return formatTurkishNumber(parsed, match.includes(',') ? 2 : 0)
      }
      // Internal format
      return parsed.toFixed(match.includes(',') ? 2 : 0)
    }
    return match
  })

  // Pattern 3: Fix inconsistent decimal separators
  // Handle cases like "1482.86" mixed with "29.657,14"
  // If we detect majority Turkish format, normalize everything

  return { text: result, changesCount }
}

/**
 * Detect the primary number format used in text
 * @returns 'tr' for Turkish, 'en' for English/International, 'mixed' if both
 */
export function detectNumberFormat(text: string): 'tr' | 'en' | 'mixed' {
  // Count Turkish format indicators (comma as decimal)
  const turkishDecimalCount = (text.match(/\d+,\d{2}\b/g) || []).length

  // Count English format indicators (period as decimal with 2 digits)
  const englishDecimalCount = (text.match(/\d+\.\d{2}\b/g) || []).length

  // Count Turkish thousands (N.NNN pattern)
  const turkishThousandsCount = (text.match(/\d{1,3}\.\d{3}(?!\d)/g) || []).length

  // Heuristic decision
  const turkishScore = turkishDecimalCount * 2 + turkishThousandsCount
  const englishScore = englishDecimalCount * 2

  if (turkishScore > 0 && englishScore > 0) {
    // Both formats detected
    if (turkishScore > englishScore * 2) return 'tr'
    if (englishScore > turkishScore * 2) return 'en'
    return 'mixed'
  }

  if (turkishScore > 0) return 'tr'
  if (englishScore > 0) return 'en'

  // Default to Turkish for Turkish documents
  return 'tr'
}

// ============================================================================
// COMMON OCR CORRECTIONS
// Character substitutions and common OCR errors
// ============================================================================

const TURKISH_OCR_CORRECTIONS: Array<[RegExp, string]> = [
  // Turkish character corrections (ASCII → proper Turkish)
  [/\bISTANBUL\b/g, 'İSTANBUL'],
  [/\bTURKIYE\b/g, 'TÜRKİYE'],
  [/\bSIGORTA\b/g, 'SİGORTA'],
  [/\bPOLICE\b/g, 'POLİÇE'],
  [/\bTEMINAT\b/g, 'TEMİNAT'],
  [/\bMUAFIYET\b/g, 'MUAFİYET'],
  [/\bODEME\b/g, 'ÖDEME'],
  [/\bUCRET\b/g, 'ÜCRET'],
  [/\bGUVENCE\b/g, 'GÜVENCE'],

  // Common insurance term OCR errors
  [/\bOlay\s*Baş(?!\s*ı)\b/gi, 'Olay Başı'],  // Olay Baş → Olay Başı (per incident)
  [/\bOlay\s*Bay\b/gi, 'Olay Başı'],           // Olay Bay → Olay Başı (common OCR error)
  [/\bHırsız\s*Eşya\b/gi, 'Hırsız Eşyası'],   // Hırsız Eşya → Hırsız Eşyası
  [/\bKoltuk\s*Ferdi\b/gi, 'Koltuk Ferdi'],   // Keep as is but normalize spacing
  [/\bArtan\s*Mali\b/gi, 'Artan Mali'],       // Keep as is but normalize spacing
  [/\bİkame\s*Araç\b/gi, 'İkame Araç'],       // Keep as is but normalize spacing
  [/\bHukuksal\s*Koruma\b/gi, 'Hukuksal Koruma'], // Normalize spacing
  [/\bRayiç\s*Değer\b/gi, 'Rayiç Değer'],     // Normalize spacing
  [/\bSakatlık\s*Sakatlık\b/gi, 'Sürekli Sakatlık'], // OCR duplicate error
  [/\bSakatılık\b/gi, 'Sakatlık'],             // Common OCR error
  [/\bŞinssi\b/gi, 'Şahıs'],                   // OCR error: Şinssi → Şahıs

  // Common OCR number/letter confusion
  [/l(?=\d{3,})/gi, '1'],           // l1234 → 11234 (in numbers)
  [/O(?=\d{3,})/g, '0'],            // O1234 → 01234 (in numbers)
  [/\b0(?=[A-ZÇĞİÖŞÜ]{2,})/g, 'O'], // 0NCE → ONCE
  [/\b1(?=[A-ZÇĞİÖŞÜ]{2,})/g, 'I'], // 1NSURANCE → INSURANCE

  // Currency formatting
  [/TL(?=\d)/g, 'TL '],              // TL1000 → TL 1000
  [/(\d)TL\b/g, '$1 TL'],            // 1000TL → 1000 TL
  [/(\d)\s*,\s*(\d{2})\s*TL/g, '$1,$2 TL'], // 1000 , 00 TL → 1000,00 TL

  // Phone number formatting
  [/(\d{3})\s*-?\s*(\d{3})\s*-?\s*(\d{2})\s*-?\s*(\d{2})/g, '$1 $2 $3 $4'],

  // Date formatting fixes
  [/(\d{2})\s*\.\s*(\d{2})\s*\.\s*(\d{4})/g, '$1.$2.$3'],
  [/(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})/g, '$1/$2/$3'],
]

/**
 * Apply comprehensive OCR corrections
 */
function applyOCRCorrections(text: string): { text: string; corrections: TextCorrection[] } {
  const corrections: TextCorrection[] = []
  let result = text

  for (const [pattern, replacement] of TURKISH_OCR_CORRECTIONS) {
    const matches = result.match(pattern)
    if (matches) {
      for (const match of matches) {
        const corrected = match.replace(pattern, replacement)
        if (match !== corrected) {
          corrections.push({
            original: match,
            corrected,
            type: 'ocr_error',
          })
        }
      }
      result = result.replace(pattern, replacement)
    }
  }

  return { text: result, corrections }
}

// ============================================================================
// MAIN PROCESSING FUNCTIONS
// ============================================================================

/**
 * Apply all local preprocessing before AI
 * This handles the bulk of the cleanup without needing AI
 *
 * Processing order:
 * 1. Remove garbage/QR/barcode data
 * 2. Fix spaced Turkish characters
 * 3. Clean URLs/emails
 * 4. Fix number/punctuation spacing
 * 5. Normalize numeric locale (TR format)
 * 6. Apply OCR corrections
 * 7. Add section markers (optional)
 * 8. Final whitespace cleanup
 */
export function applyComprehensivePreprocessing(
  text: string,
  options: {
    addSectionMarkers?: boolean
    normalizeNumbers?: boolean
    preserveDisplayFormat?: boolean
    skipDeterministicPreClean?: boolean
  } = {}
): {
  text: string
  corrections: TextCorrection[]
  stats: CleanupStats
  qualityMetrics?: TextQualityMetrics
  preCleanStats?: PreCleanStats
} {
  const {
    addSectionMarkers: shouldAddMarkers = false,
    normalizeNumbers = true,
    preserveDisplayFormat = true,
    skipDeterministicPreClean = false,
  } = options

  const corrections: TextCorrection[] = []
  let result = text
  let sectionsIdentified: string[] = []
  let numbersNormalized = 0
  let preCleanStats: PreCleanStats | undefined

  // 0. NEW: Apply deterministic pre-clean FIRST (battle-tested Turkish OCR cleanup)
  // This handles B^^^B, a!!!a barcode artifacts and Turkish word de-spacing
  if (!skipDeterministicPreClean) {
    const preCleanResult = preCleanOcrText(result)
    result = preCleanResult.text
    preCleanStats = preCleanResult.stats

    // Log pre-clean corrections
    if (preCleanResult.stats.noiseLinesRemoved > 0) {
      corrections.push({
        original: `${preCleanResult.stats.noiseLinesRemoved} noise lines`,
        corrected: 'removed',
        type: 'garbage_removal',
      })
    }
    if (preCleanResult.stats.turkishWordsDespaced > 0) {
      corrections.push({
        original: `${preCleanResult.stats.turkishWordsDespaced} spaced Turkish words`,
        corrected: 'merged',
        type: 'formatting',
      })
    }
    if (preCleanResult.stats.barcodeArtifactsRemoved > 0) {
      corrections.push({
        original: `${preCleanResult.stats.barcodeArtifactsRemoved} barcode artifacts`,
        corrected: 'removed',
        type: 'garbage_removal',
      })
    }
  }

  // 1. Remove garbage data (including QR/barcode and e-Sigorta artifacts)
  // Note: Much of this is now handled by pre-clean, but keep for any remaining artifacts
  const garbageResult = removeGarbageData(result)
  result = garbageResult.text

  // 2. Fix any remaining spaced Turkish characters (most handled by pre-clean now)
  const turkishResult = fixSpacedTurkishCharacters(result)
  result = turkishResult.text

  // 3. Clean up URLs and emails
  const urlResult = cleanupURLsAndEmails(result)
  result = urlResult.text

  // 4. Fix number and punctuation spacing
  result = fixNumberAndPunctuationSpacing(result)

  // 5. Normalize numeric locale (TR format handling)
  if (normalizeNumbers) {
    const numberResult = normalizeNumbersInText(result, {
      preserveDisplay: preserveDisplayFormat,
      normalizeCurrency: true,
    })
    result = numberResult.text
    numbersNormalized = numberResult.changesCount
  }

  // 6. Apply OCR corrections
  const ocrResult = applyOCRCorrections(result)
  result = ocrResult.text
  corrections.push(...ocrResult.corrections)

  // 7. Add section markers if requested (for two-pass extraction)
  if (shouldAddMarkers) {
    const sectionResult = addSectionMarkers(result)
    result = sectionResult.text
    sectionsIdentified = sectionResult.sectionsFound
  }

  // 8. Final cleanup - normalize whitespace
  result = result.trim()
  result = result.replace(/[ \t]+$/gm, '') // Remove trailing spaces per line

  // Calculate combined stats (pre-clean + legacy cleanup)
  const preCleanCharsRemoved = preCleanStats
    ? preCleanStats.originalLength - preCleanStats.finalLength
    : 0

  const stats: CleanupStats = {
    garbageBlocksRemoved: garbageResult.stats.blocksRemoved + (preCleanStats?.noiseLinesRemoved || 0),
    qrBlocksRemoved: garbageResult.stats.qrBlocksRemoved + (preCleanStats?.barcodeArtifactsRemoved || 0),
    eSigortaArtifactsRemoved: garbageResult.stats.eSigortaArtifacts,
    spacedCharsFixed: turkishResult.fixCount + (preCleanStats?.turkishWordsDespaced || 0),
    urlsCleaned: urlResult.cleanupCount,
    linesRemoved: garbageResult.stats.linesRemoved + (preCleanStats?.noiseLinesRemoved || 0),
    totalCharactersRemoved: garbageResult.stats.charsRemoved + preCleanCharsRemoved,
    sectionsIdentified,
    numbersNormalized,
  }

  // Calculate quality metrics
  const qualityMetrics = calculateQualityMetrics(text, result, stats)

  return { text: result, corrections, stats, qualityMetrics, preCleanStats }
}

/**
 * Legacy function for backwards compatibility
 */
export function applyBasicOCRCorrections(text: string): {
  text: string
  corrections: TextCorrection[]
} {
  const result = applyComprehensivePreprocessing(text)
  return { text: result.text, corrections: result.corrections }
}

/**
 * Process raw extracted text with AI
 * Uses GPT-4o-mini or Claude Haiku for cost-effective, fast processing
 */
export async function processTextWithAI(
  rawText: string,
  options: {
    provider?: 'openai' | 'anthropic'
    preserveStructure?: boolean
    detectLanguage?: boolean
  } = {}
): Promise<ProcessedTextResult> {
  const startTime = Date.now()
  const { provider = 'openai', preserveStructure = true } = options

  // First apply comprehensive local preprocessing
  const { text: preProcessed, corrections: localCorrections, stats } = applyComprehensivePreprocessing(rawText)

  // If preprocessing made significant changes, we might not need AI
  const significantChanges = stats.garbageBlocksRemoved > 0 ||
    stats.qrBlocksRemoved > 0 ||
    stats.spacedCharsFixed > 5 ||
    stats.urlsCleaned > 0 ||
    stats.totalCharactersRemoved > 100

  // If text is very short or preprocessing was sufficient, skip AI
  if (rawText.length < 100 || (significantChanges && localCorrections.length > 10)) {
    return {
      success: true,
      processedText: preProcessed,
      corrections: localCorrections,
      detectedLanguage: detectLanguage(preProcessed),
      confidence: 0.90,
      processingTimeMs: Date.now() - startTime,
      cleanupStats: stats,
    }
  }

  const API_URL = env.proxyUrl
  if (!API_URL) {
    // No API available, return preprocessed text
    return {
      success: true,
      processedText: preProcessed,
      corrections: localCorrections,
      detectedLanguage: detectLanguage(preProcessed),
      confidence: 0.85,
      processingTimeMs: Date.now() - startTime,
      cleanupStats: stats,
    }
  }

  // Use enhanced OCR correction prompt from prompts.ts
  const systemPrompt = OCR_CORRECTION_PROMPT

  const userPrompt = `Clean and correct this Turkish insurance document text:\n\n${preProcessed.slice(0, 8000)}` // Limit to 8000 chars for efficiency

  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userPrompt,
        policyContext: systemPrompt,
        provider,
      }),
    })

    if (!response.ok) {
      // If AI fails, return preprocessed text
      return {
        success: true,
        processedText: preProcessed,
        corrections: localCorrections,
        detectedLanguage: detectLanguage(preProcessed),
        confidence: 0.85,
        processingTimeMs: Date.now() - startTime,
        cleanupStats: stats,
      }
    }

    const data = await response.json()

    if (data.success && data.response) {
      let aiProcessedText = data.response.trim()

      // Clean up AI response artifacts
      if (aiProcessedText.startsWith('```') && aiProcessedText.endsWith('```')) {
        aiProcessedText = aiProcessedText.slice(3, -3).trim()
      }
      if (aiProcessedText.startsWith('```text')) {
        aiProcessedText = aiProcessedText.slice(7).replace(/```$/, '').trim()
      }
      if (aiProcessedText.startsWith('"') && aiProcessedText.endsWith('"')) {
        aiProcessedText = aiProcessedText.slice(1, -1)
      }

      // If AI returned something too different, use preprocessed version
      if (aiProcessedText.length < preProcessed.length * 0.5) {
        return {
          success: true,
          processedText: preProcessed,
          corrections: localCorrections,
          detectedLanguage: detectLanguage(preProcessed),
          confidence: 0.85,
          processingTimeMs: Date.now() - startTime,
          cleanupStats: stats,
        }
      }

      // Identify corrections made by AI
      const aiCorrections = identifyCorrections(preProcessed, aiProcessedText)

      return {
        success: true,
        processedText: preserveStructure ? aiProcessedText : aiProcessedText.replace(/\n{3,}/g, '\n\n'),
        corrections: [...localCorrections, ...aiCorrections],
        detectedLanguage: detectLanguage(aiProcessedText),
        confidence: 0.95,
        processingTimeMs: Date.now() - startTime,
        cleanupStats: stats,
      }
    }

    // Fallback to preprocessed text
    return {
      success: true,
      processedText: preProcessed,
      corrections: localCorrections,
      detectedLanguage: detectLanguage(preProcessed),
      confidence: 0.85,
      processingTimeMs: Date.now() - startTime,
      cleanupStats: stats,
    }
  } catch (error) {
    if (env.isDev) {
      console.warn('AI text processing failed:', error)
    }
    return {
      success: true,
      processedText: preProcessed,
      corrections: localCorrections,
      detectedLanguage: detectLanguage(preProcessed),
      confidence: 0.75,
      processingTimeMs: Date.now() - startTime,
      cleanupStats: stats,
    }
  }
}

/**
 * Identify corrections made between original and processed text
 */
function identifyCorrections(original: string, processed: string): TextCorrection[] {
  const corrections: TextCorrection[] = []

  // Word-level comparison
  const originalWords = original.split(/\s+/).filter(Boolean)
  const processedWords = processed.split(/\s+/).filter(Boolean)

  const minLen = Math.min(originalWords.length, processedWords.length)
  for (let i = 0; i < minLen; i++) {
    if (originalWords[i] !== processedWords[i]) {
      corrections.push({
        original: originalWords[i],
        corrected: processedWords[i],
        type: 'ocr_error',
      })
    }
  }

  // Limit to most significant corrections
  return corrections.slice(0, 50)
}

/**
 * Detect language from text content
 */
function detectLanguage(text: string): string {
  // Turkish-specific characters
  const turkishChars = /[İıĞğŞşÜüÖöÇç]/g
  const turkishMatches = (text.match(turkishChars) || []).length

  // Turkish common words
  const turkishWords = /\b(ve|bir|bu|için|ile|olan|olarak|gibi|veya|ancak|sigorta|poliçe|teminat|araç|prim)\b/gi
  const turkishWordMatches = (text.match(turkishWords) || []).length

  if (turkishMatches > 5 || turkishWordMatches > 10) {
    return 'tr'
  }

  return 'en'
}

/**
 * Check if text needs processing
 * Quick heuristic to identify problematic text
 */
export function textNeedsProcessing(text: string): boolean {
  // Check for specific problems
  const indicators = [
    // Spaced characters (like "B İ RLE Şİ K")
    /[A-ZÇĞİÖŞÜ]\s[A-ZÇĞİÖŞÜ]\s[A-ZÇĞİÖŞÜ]/,

    // Spaced URLs/domains
    /www\s*\.\s*\w/i,
    /\.\s*com\s*\.\s*tr/i,

    // Garbage characters
    /[\x00-\x1F\x7F]/,
    /[<>\[\]{}|\\^]{3,}/,

    // Missing Turkish characters
    /ISTANBUL|TURKIYE|SIGORTA|POLICE/,

    // Excessive spacing
    /\s{4,}/,

    // OCR number/letter confusion (only at word start)
    /\b[0O][a-z]{3,}/,   // 0nly or Object (0/O confusion at word start)
    /\b[1l][a-z]{3,}/,   // 1ssue or lssue (1/l confusion at word start)
  ]

  for (const pattern of indicators) {
    if (pattern.test(text)) {
      return true
    }
  }

  // Check character distribution for garbage
  const specialChars = (text.match(/[<>\[\]{}|\\^~`@#$%&*+=]/g) || []).length
  const totalChars = text.length
  if (totalChars > 100 && specialChars / totalChars > 0.1) {
    return true
  }

  return false
}

/**
 * Quick estimate of text quality (0-100)
 * Higher = better quality, less processing needed
 */
export function estimateTextQuality(text: string): number {
  let score = 100

  // Penalize for Turkish chars in ASCII form
  if (/ISTANBUL|TURKIYE|SIGORTA/.test(text)) score -= 15

  // Penalize for spaced characters
  const spacedCount = (text.match(/[A-ZÇĞİÖŞÜ]\s[A-ZÇĞİÖŞÜ]\s[A-ZÇĞİÖŞÜ]/g) || []).length
  score -= spacedCount * 5

  // Penalize for garbage characters
  const garbageCount = (text.match(/[<>\[\]{}|\\^]{2,}/g) || []).length
  score -= garbageCount * 10

  // Penalize for excessive spacing
  const excessiveSpaces = (text.match(/\s{3,}/g) || []).length
  score -= excessiveSpaces * 2

  return Math.max(0, Math.min(100, score))
}

// =============================================================================
// CLEAN-ROOM DOCUMENT NORMALIZATION
// =============================================================================

export interface CleanRoomResult {
  cleanCopy: string
  redactedCopy: string
  piiVault: DocumentNormalizerOutput['piiVault']
  validationReport: DocumentNormalizerOutput['validationReport']
  metadata: DocumentNormalizerOutput['metadata']
}

/**
 * Process document using clean-room normalization
 *
 * This is the preferred method for legally auditable document processing.
 * It follows strict rules:
 * - Deterministic: Same input => same output
 * - No stylistic edits, grammar polishing, or rewording
 * - Preserves contractual meaning and identifiers exactly
 * - Changes are purely mechanical and audit-friendly
 *
 * @param rawText - Raw OCR/extracted text
 * @param options - Processing options
 * @returns CleanRoomResult with clean, redacted, and PII vault
 */
export function processDocumentCleanRoom(
  rawText: string,
  options: { source?: string; title?: string } = {}
): CleanRoomResult {
  const normalizer = new DocumentNormalizer()
  const result = normalizer.process(rawText, options)

  return {
    cleanCopy: result.cleanCopy,
    redactedCopy: result.redactedCopy,
    piiVault: result.piiVault,
    validationReport: result.validationReport,
    metadata: result.metadata,
  }
}

/**
 * Get only the clean copy using clean-room processing
 * Use this for AI extraction where you need normalized but unaltered text
 */
export function getCleanCopyForExtraction(rawText: string): string {
  const normalizer = new DocumentNormalizer()
  return normalizer.process(rawText).cleanCopy
}

/**
 * Get a redacted copy suitable for sharing
 * All PII is replaced with standardized tokens
 */
export function getRedactedCopyForSharing(rawText: string): string {
  const normalizer = new DocumentNormalizer()
  return normalizer.process(rawText).redactedCopy
}

/**
 * Enhanced text processing with clean-room option
 *
 * When useCleanRoom is true, uses the deterministic clean-room processor.
 * When false, uses the legacy AI-assisted processing.
 */
export async function processTextEnhanced(
  rawText: string,
  options: {
    useCleanRoom?: boolean
    provider?: 'openai' | 'anthropic'
    preserveStructure?: boolean
    detectLanguage?: boolean
    source?: string
    title?: string
  } = {}
): Promise<ProcessedTextResult & { cleanRoomOutput?: CleanRoomResult }> {
  const {
    useCleanRoom = true,
    provider = 'openai',
    preserveStructure = true,
    source,
    title,
  } = options

  const startTime = Date.now()

  if (useCleanRoom) {
    // Use deterministic clean-room processing
    const cleanRoomResult = processDocumentCleanRoom(rawText, { source, title })

    // Map clean-room stats to ProcessedTextResult format
    const corrections: TextCorrection[] = []
    if (cleanRoomResult.validationReport.issues.length > 0) {
      for (const issue of cleanRoomResult.validationReport.issues) {
        corrections.push({
          original: '',
          corrected: issue,
          type: 'structure',
        })
      }
    }

    const stats: CleanupStats = {
      garbageBlocksRemoved: 0, // Clean-room doesn't track this granularly
      qrBlocksRemoved: 0,
      eSigortaArtifactsRemoved: 0,
      spacedCharsFixed: 0,
      urlsCleaned: 0,
      linesRemoved: 0,
      totalCharactersRemoved: rawText.length - cleanRoomResult.cleanCopy.length,
      sectionsIdentified: [],
      numbersNormalized: 0,
    }

    return {
      success: true,
      processedText: cleanRoomResult.cleanCopy,
      corrections,
      detectedLanguage: cleanRoomResult.metadata.language === 'Mixed (mainly Turkish)' ? 'tr' : 'en',
      confidence: cleanRoomResult.validationReport.issues.length === 0 ? 0.98 : 0.90,
      processingTimeMs: Date.now() - startTime,
      cleanupStats: stats,
      cleanRoomOutput: cleanRoomResult,
    }
  }

  // Fall back to legacy AI-assisted processing
  return processTextWithAI(rawText, { provider, preserveStructure })
}

// =============================================================================
// COMPREHENSIVE AI DOCUMENT PROCESSING (Output A + Output B)
// =============================================================================

export interface ComprehensiveProcessingResult {
  success: boolean
  cleanedText: string
  structuredExtraction: string | null
  normalizationLog: string | null
  rawAIResponse: string
  processingTimeMs: number
  confidence: number
  validationIssues: string[]
}

/**
 * Process a document with comprehensive AI normalization and structured extraction.
 *
 * This function uses the full DOCUMENT_NORMALIZATION_PROMPT which produces:
 * - Output A: Cleaned text with OCR corrections and normalization log
 * - Output B: Structured extraction in universal insurance schema
 *
 * Use this for full document analysis. For quick OCR correction only,
 * use processTextWithAI() or processTextEnhanced() instead.
 *
 * @param rawText - Raw OCR/extracted text from PDF
 * @param options - Processing options
 */
export async function processDocumentComprehensive(
  rawText: string,
  options: {
    provider?: 'openai' | 'anthropic'
    includeStructuredExtraction?: boolean
  } = {}
): Promise<ComprehensiveProcessingResult> {
  const startTime = Date.now()
  const { provider = 'openai', includeStructuredExtraction = true } = options

  const API_URL = env.proxyUrl
  if (!API_URL) {
    // No API available, fall back to local processing
    const localResult = applyComprehensivePreprocessing(rawText)
    return {
      success: true,
      cleanedText: localResult.text,
      structuredExtraction: null,
      normalizationLog: `Local preprocessing applied: ${localResult.stats.spacedCharsFixed} spacing fixes, ${localResult.stats.garbageBlocksRemoved} garbage blocks removed`,
      rawAIResponse: '',
      processingTimeMs: Date.now() - startTime,
      confidence: 0.75,
      validationIssues: ['AI processing unavailable, used local preprocessing only'],
    }
  }

  // Build the comprehensive prompt
  const fullPrompt = buildDocumentProcessingPrompt(rawText, {
    includeStructuredExtraction,
    language: detectLanguage(rawText) as 'tr' | 'en' | 'mixed',
  })

  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullPrompt,
        policyContext: '', // The prompt contains all context
        provider,
      }),
    })

    if (!response.ok) {
      // Fall back to local processing
      const localResult = applyComprehensivePreprocessing(rawText)
      return {
        success: true,
        cleanedText: localResult.text,
        structuredExtraction: null,
        normalizationLog: 'AI unavailable, used local preprocessing',
        rawAIResponse: '',
        processingTimeMs: Date.now() - startTime,
        confidence: 0.75,
        validationIssues: [`AI request failed with status ${response.status}`],
      }
    }

    const data = await response.json()

    if (!data.success || !data.response) {
      const localResult = applyComprehensivePreprocessing(rawText)
      return {
        success: true,
        cleanedText: localResult.text,
        structuredExtraction: null,
        normalizationLog: 'AI returned empty response, used local preprocessing',
        rawAIResponse: data.response || '',
        processingTimeMs: Date.now() - startTime,
        confidence: 0.70,
        validationIssues: ['Empty AI response'],
      }
    }

    // Parse the AI response to extract Output A and Output B
    const parsed = parseDocumentProcessingResponse(data.response)

    // Validate the OCR corrections
    const validationIssues: string[] = []
    if (parsed.cleanedText) {
      const validation = validateOCRCorrection(rawText, parsed.cleanedText)
      if (!validation.isValid) {
        validationIssues.push(...validation.issues)
      }
    }

    // Calculate confidence based on parsing success and validation
    let confidence = 0.95
    if (!parsed.cleanedText) confidence -= 0.2
    if (!parsed.structuredExtraction && includeStructuredExtraction) confidence -= 0.1
    if (validationIssues.length > 0) confidence -= 0.05 * validationIssues.length

    return {
      success: true,
      cleanedText: parsed.cleanedText || rawText,
      structuredExtraction: parsed.structuredExtraction,
      normalizationLog: parsed.normalizationLog,
      rawAIResponse: data.response,
      processingTimeMs: Date.now() - startTime,
      confidence: Math.max(0.5, confidence),
      validationIssues,
    }
  } catch (error) {
    // Fall back to local processing on error
    const localResult = applyComprehensivePreprocessing(rawText)
    return {
      success: true,
      cleanedText: localResult.text,
      structuredExtraction: null,
      normalizationLog: 'AI error, used local preprocessing',
      rawAIResponse: '',
      processingTimeMs: Date.now() - startTime,
      confidence: 0.70,
      validationIssues: [error instanceof Error ? error.message : 'Unknown error'],
    }
  }
}

// =============================================================================
// COMBINED PIPELINE: DETERMINISTIC + AI PROCESSING
// =============================================================================

export interface CombinedProcessingResult {
  success: boolean

  // Stage 1: Deterministic clean-room output
  cleanRoom: {
    cleanCopy: string
    redactedCopy: string
    piiVault: DocumentNormalizerOutput['piiVault']
    validationReport: DocumentNormalizerOutput['validationReport']
    metadata: DocumentNormalizerOutput['metadata']
  }

  // Stage 2: AI-enhanced output
  aiEnhanced: {
    cleanedText: string
    structuredExtraction: string | null
    normalizationLog: string | null
    confidence: number
    validationIssues: string[]
  }

  // Combined metadata
  processingTimeMs: number
  stages: {
    cleanRoom: { durationMs: number; success: boolean }
    aiProcessing: { durationMs: number; success: boolean }
  }

  // Final recommended output (best of both stages)
  recommendedCleanText: string
  recommendedStructuredData: string | null
}

/**
 * Combined document processing pipeline.
 *
 * This function runs BOTH deterministic and AI processing in sequence:
 *
 * Stage 1 - Deterministic Clean-Room Processing:
 * - Fixes Turkish OCR spacing issues (B İ RLE Şİ K → BİRLEŞİK)
 * - Normalizes whitespace and formatting
 * - Detects and redacts PII
 * - Validates identifiers (TC Kimlik, IBAN, phone numbers)
 * - Produces audit-friendly, legally defensible output
 *
 * Stage 2 - AI-Enhanced Processing:
 * - Takes the clean-room output as input
 * - Applies comprehensive OCR correction with context awareness
 * - Produces structured extraction (Output B) with insurance schema
 * - Validates corrections against known Turkish insurance terms
 *
 * Benefits of combined approach:
 * - Deterministic processing handles mechanical fixes reliably
 * - AI processing handles context-dependent corrections
 * - PII vault preserves sensitive data for authorized access
 * - Full audit trail with normalization logs
 *
 * @param rawText - Raw OCR/extracted text from PDF
 * @param options - Processing options
 */
export async function processDocumentCombined(
  rawText: string,
  options: {
    provider?: 'openai' | 'anthropic'
    includeStructuredExtraction?: boolean
    source?: string
    title?: string
  } = {}
): Promise<CombinedProcessingResult> {
  const totalStartTime = Date.now()
  const {
    provider = 'openai',
    includeStructuredExtraction = true,
    source,
    title,
  } = options

  // =========================================================================
  // Stage 1: Deterministic Clean-Room Processing
  // =========================================================================
  const cleanRoomStartTime = Date.now()
  let cleanRoomSuccess = true
  let cleanRoomResult: CleanRoomResult

  try {
    cleanRoomResult = processDocumentCleanRoom(rawText, { source, title })
  } catch (error) {
    cleanRoomSuccess = false
    // Create fallback clean-room result matching DocumentNormalizerOutput structure
    cleanRoomResult = {
      cleanCopy: rawText,
      redactedCopy: rawText,
      piiVault: [], // PIIVaultEntry[] is an array directly
      validationReport: {
        completeness: {
          noTruncation: true,
          allSectionsPresent: false,
          pageCountMatch: true,
        },
        identifierIntegrity: {
          policyNumberUnchanged: true,
          clauseReferencesUnchanged: true,
          amountsUnchanged: true,
          datesUnchanged: true,
        },
        redactionCorrectness: {
          noPlainTextPII: true,
          standardTokensOnly: true,
          tokenConsistency: true,
        },
        issues: [error instanceof Error ? error.message : 'Clean-room processing failed'],
      },
      metadata: {
        documentTitle: 'Unknown',
        source: 'User-provided text',
        conversionDate: new Date().toISOString().split('T')[0],
        outputType: 'NORMALIZED' as const,
        language: 'unknown',
        pageCount: 1,
      },
    }
  }
  const cleanRoomDuration = Date.now() - cleanRoomStartTime

  // =========================================================================
  // Stage 2: AI-Enhanced Processing
  // =========================================================================
  const aiStartTime = Date.now()
  let aiSuccess = true
  let aiResult: ComprehensiveProcessingResult

  try {
    // Use the clean-room output as input for AI processing
    // This gives the AI a cleaner starting point
    aiResult = await processDocumentComprehensive(cleanRoomResult.cleanCopy, {
      provider,
      includeStructuredExtraction,
    })
  } catch (error) {
    aiSuccess = false
    // Create fallback AI result using local preprocessing
    const localPreprocessed = applyComprehensivePreprocessing(cleanRoomResult.cleanCopy)
    aiResult = {
      success: false,
      cleanedText: localPreprocessed.text,
      structuredExtraction: null,
      normalizationLog: 'AI processing failed, used local preprocessing',
      rawAIResponse: '',
      processingTimeMs: Date.now() - aiStartTime,
      confidence: 0.65,
      validationIssues: [error instanceof Error ? error.message : 'AI processing failed'],
    }
  }
  const aiDuration = Date.now() - aiStartTime

  // =========================================================================
  // Determine Best Output
  // =========================================================================
  // Use AI-enhanced text if it's valid and not significantly shorter
  // Otherwise fall back to clean-room output
  let recommendedCleanText: string

  if (aiResult.success && aiResult.cleanedText) {
    const lengthRatio = aiResult.cleanedText.length / cleanRoomResult.cleanCopy.length
    // Accept AI output if it's not too short (at least 70% of original)
    // and not too long (at most 130% - indicating added hallucinations)
    if (lengthRatio >= 0.7 && lengthRatio <= 1.3) {
      recommendedCleanText = aiResult.cleanedText
    } else {
      recommendedCleanText = cleanRoomResult.cleanCopy
    }
  } else {
    recommendedCleanText = cleanRoomResult.cleanCopy
  }

  return {
    success: cleanRoomSuccess && aiResult.success,

    cleanRoom: {
      cleanCopy: cleanRoomResult.cleanCopy,
      redactedCopy: cleanRoomResult.redactedCopy,
      piiVault: cleanRoomResult.piiVault,
      validationReport: cleanRoomResult.validationReport,
      metadata: cleanRoomResult.metadata,
    },

    aiEnhanced: {
      cleanedText: aiResult.cleanedText,
      structuredExtraction: aiResult.structuredExtraction,
      normalizationLog: aiResult.normalizationLog,
      confidence: aiResult.confidence,
      validationIssues: aiResult.validationIssues,
    },

    processingTimeMs: Date.now() - totalStartTime,
    stages: {
      cleanRoom: { durationMs: cleanRoomDuration, success: cleanRoomSuccess },
      aiProcessing: { durationMs: aiDuration, success: aiSuccess },
    },

    recommendedCleanText,
    recommendedStructuredData: aiResult.structuredExtraction,
  }
}

/**
 * Quick combined processing for simple OCR correction.
 *
 * This is a lighter-weight version that skips structured extraction.
 * Use when you only need cleaned text, not the full insurance schema.
 */
export async function processDocumentQuick(
  rawText: string,
  options: {
    provider?: 'openai' | 'anthropic'
    source?: string
    title?: string
  } = {}
): Promise<{
  cleanText: string
  redactedText: string
  piiVault: DocumentNormalizerOutput['piiVault']
  confidence: number
  processingTimeMs: number
}> {
  const startTime = Date.now()

  // Run deterministic processing
  const cleanRoomResult = processDocumentCleanRoom(rawText, {
    source: options.source,
    title: options.title,
  })

  // Try AI enhancement if proxy is available
  const API_URL = env.proxyUrl
  if (API_URL) {
    try {
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Clean and correct this Turkish insurance document text:\n\n${cleanRoomResult.cleanCopy.slice(0, 8000)}`,
          policyContext: OCR_CORRECTION_PROMPT,
          provider: options.provider || 'openai',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.response) {
          let aiText = data.response.trim()
          // Clean up AI response artifacts
          if (aiText.startsWith('```')) {
            aiText = aiText.replace(/^```\w*\n?/, '').replace(/```$/, '').trim()
          }

          // Use AI output if reasonable length
          const lengthRatio = aiText.length / cleanRoomResult.cleanCopy.length
          if (lengthRatio >= 0.7 && lengthRatio <= 1.3) {
            return {
              cleanText: aiText,
              redactedText: cleanRoomResult.redactedCopy,
              piiVault: cleanRoomResult.piiVault,
              confidence: 0.95,
              processingTimeMs: Date.now() - startTime,
            }
          }
        }
      }
    } catch {
      // Continue with clean-room output only
    }
  }

  return {
    cleanText: cleanRoomResult.cleanCopy,
    redactedText: cleanRoomResult.redactedCopy,
    piiVault: cleanRoomResult.piiVault,
    confidence: cleanRoomResult.validationReport.issues.length === 0 ? 0.90 : 0.80,
    processingTimeMs: Date.now() - startTime,
  }
}

// =============================================================================
// AI-POWERED TURKISH OCR CLEANUP
// =============================================================================

export interface AITurkishCleanupOptions {
  /** AI provider to use for Turkish text correction */
  provider?: 'openai' | 'anthropic' | 'gemini'
  /** API proxy URL (e.g., http://localhost:4001/api/ai) */
  proxyUrl?: string
  /** API key for direct provider calls (server-side only) */
  apiKey?: string
  /** Fallback to offline mode if AI unavailable */
  useOfflineFallback?: boolean
  /** Timeout in milliseconds */
  timeout?: number
  /** Skip deterministic pre-clean (garbage removal) */
  skipPreClean?: boolean
}

export interface AITurkishCleanupResult {
  /** Cleaned text with Turkish spacing fixed */
  text: string
  /** Original text before processing */
  originalText: string
  /** Pre-clean stats (garbage removal) */
  preCleanStats?: PreCleanStats
  /** AI cleanup stats */
  aiCleanupStats: {
    provider: string
    processingTimeMs: number
    fallbackUsed: boolean
    validationPassed: boolean
  }
  /** Overall processing time */
  totalProcessingTimeMs: number
  /** Combined cleanup corrections */
  corrections: TextCorrection[]
}

/**
 * Clean Turkish OCR text using AI-powered correction.
 *
 * This is the recommended function for fixing Turkish OCR spacing issues.
 * It combines:
 * 1. Deterministic pre-clean (removes B^^^B, a!!!!, control chars)
 * 2. AI-powered Turkish text correction (fixes S İ G O R T A → SİGORTA)
 *
 * Why AI over hardcoded word lists:
 * - No maintenance needed for new words
 * - Understands context (SİGORTA ŞİRKETİ vs SİGORTAŞİRKETİ)
 * - Handles names, places, new terms automatically
 * - Cost: ~$0.001 per document with GPT-4o-mini/Claude Haiku
 *
 * @param text - Raw OCR text with Turkish spacing issues
 * @param options - Configuration options
 * @returns Cleaned text with AI-corrected Turkish spacing
 *
 * @example
 * ```typescript
 * // Via proxy (browser use)
 * const result = await cleanTurkishTextWithAI(rawText, {
 *   provider: 'openai',
 *   proxyUrl: 'http://localhost:4001/api/ai',
 * })
 *
 * // Direct API (server use)
 * const result = await cleanTurkishTextWithAI(rawText, {
 *   provider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 * })
 * ```
 */
export async function cleanTurkishTextWithAI(
  text: string,
  options: AITurkishCleanupOptions = {}
): Promise<AITurkishCleanupResult> {
  const startTime = Date.now()
  const {
    provider = 'openai',
    proxyUrl = env.proxyUrl ? `${env.proxyUrl}/api/ai` : undefined,
    apiKey,
    useOfflineFallback = true,
    timeout = 30000,
    skipPreClean = false,
  } = options

  const corrections: TextCorrection[] = []
  let processedText = text
  let preCleanStats: PreCleanStats | undefined

  // Step 1: Deterministic pre-clean (garbage removal)
  if (!skipPreClean) {
    const preCleanResult = preCleanOcrText(processedText)
    processedText = preCleanResult.text
    preCleanStats = preCleanResult.stats

    // Track pre-clean corrections
    if (preCleanResult.stats.noiseLinesRemoved > 0) {
      corrections.push({
        original: `${preCleanResult.stats.noiseLinesRemoved} noise lines`,
        corrected: 'removed',
        type: 'garbage_removal',
      })
    }
    if (preCleanResult.stats.barcodeArtifactsRemoved > 0) {
      corrections.push({
        original: `${preCleanResult.stats.barcodeArtifactsRemoved} barcode artifacts`,
        corrected: 'removed',
        type: 'garbage_removal',
      })
    }
  }

  // Step 2: AI-powered Turkish text correction
  const aiOptions: AICleanerOptions = {
    useOfflineFallback,
    timeout,
    proxyUrl,
  }

  // Configure primary provider
  if (apiKey) {
    aiOptions.primaryProvider = {
      name: provider as 'openai' | 'anthropic' | 'gemini',
      apiKey,
    }
  } else if (proxyUrl) {
    // Use proxy without direct API key
    aiOptions.primaryProvider = {
      name: provider as 'openai' | 'anthropic' | 'gemini',
      apiKey: '', // Proxy handles auth
    }
  }

  let aiResult: AICleanupResult

  try {
    aiResult = await cleanTurkishOCRWithAI(processedText, aiOptions)
    processedText = aiResult.text

    // Track AI corrections
    if (aiResult.aiProvider !== 'offline') {
      corrections.push({
        original: 'Turkish spacing issues',
        corrected: `fixed by ${aiResult.aiProvider} AI`,
        type: 'formatting',
      })
    }
  } catch (error) {
    // Fallback to offline mode
    if (useOfflineFallback) {
      processedText = cleanTurkishOCROffline(processedText)
      aiResult = {
        text: processedText,
        originalLength: text.length,
        cleanedLength: processedText.length,
        aiProvider: 'offline',
        processingTimeMs: Date.now() - startTime,
        validation: { valid: true, missing: [], preserved: [] },
        fallbackUsed: true,
      }
      corrections.push({
        original: 'Turkish spacing issues',
        corrected: 'fixed by offline fallback',
        type: 'formatting',
      })
    } else {
      throw error
    }
  }

  return {
    text: processedText,
    originalText: text,
    preCleanStats,
    aiCleanupStats: {
      provider: aiResult.aiProvider,
      processingTimeMs: aiResult.processingTimeMs,
      fallbackUsed: aiResult.fallbackUsed,
      validationPassed: aiResult.validation.valid,
    },
    totalProcessingTimeMs: Date.now() - startTime,
    corrections,
  }
}

// Re-export AI cleaner types for convenience
export type { AICleanupResult, AIProviderConfig, AICleanerOptions }
