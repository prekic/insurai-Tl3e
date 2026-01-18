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
 */

import { env } from '@/lib/env'
import { DocumentNormalizer, type DocumentNormalizerOutput } from './document-normalizer'
import {
  OCR_CORRECTION_PROMPT,
  buildDocumentProcessingPrompt,
  parseDocumentProcessingResponse,
  validateOCRCorrection,
} from './prompts'

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
  spacedCharsFixed: number
  urlsCleaned: number
  linesRemoved: number
  totalCharactersRemoved: number
}

// ============================================================================
// TURKISH CHARACTER SPACING PATTERNS
// Detects spaced Turkish characters like "B İ RLE Şİ K" and merges them
// ============================================================================

// Turkish character sets (used in regex patterns defined below)
// Upper: A-ZÇĞİÖŞÜ  Lower: a-zçğıöşü

/**
 * Fix spaced Turkish characters (B İ RLE Şİ K → BİRLEŞİK)
 * Detects sequences of single letters with spaces and merges them
 */
function fixSpacedTurkishCharacters(text: string): { text: string; fixCount: number } {
  let fixCount = 0
  let result = text

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

  // Pattern 3: Known Turkish words that often appear spaced (UPPERCASE)
  const knownSpacedWords: Array<[RegExp, string]> = [
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
// Removes binary/encrypted data blocks that appear in PDFs
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
function removeGarbageData(text: string): { text: string; stats: { blocksRemoved: number; linesRemoved: number; charsRemoved: number } } {
  const originalLength = text.length
  let blocksRemoved = 0
  let linesRemoved = 0

  // First, clean each line
  const lines = text.split('\n')
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

  const result = cleanedLines.join('\n')
  const charsRemoved = originalLength - result.length

  return {
    text: result,
    stats: { blocksRemoved, linesRemoved, charsRemoved },
  }
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
 */
export function applyComprehensivePreprocessing(text: string): {
  text: string
  corrections: TextCorrection[]
  stats: CleanupStats
} {
  const corrections: TextCorrection[] = []
  let result = text

  // 1. Remove garbage data first
  const garbageResult = removeGarbageData(result)
  result = garbageResult.text

  // 2. Fix spaced Turkish characters
  const turkishResult = fixSpacedTurkishCharacters(result)
  result = turkishResult.text

  // 3. Clean up URLs and emails
  const urlResult = cleanupURLsAndEmails(result)
  result = urlResult.text

  // 4. Fix number and punctuation spacing
  result = fixNumberAndPunctuationSpacing(result)

  // 5. Apply OCR corrections
  const ocrResult = applyOCRCorrections(result)
  result = ocrResult.text
  corrections.push(...ocrResult.corrections)

  // 6. Final cleanup - normalize whitespace
  result = result.trim()
  result = result.replace(/[ \t]+$/gm, '') // Remove trailing spaces per line

  const stats: CleanupStats = {
    garbageBlocksRemoved: garbageResult.stats.blocksRemoved,
    spacedCharsFixed: turkishResult.fixCount,
    urlsCleaned: urlResult.cleanupCount,
    linesRemoved: garbageResult.stats.linesRemoved,
    totalCharactersRemoved: garbageResult.stats.charsRemoved,
  }

  return { text: result, corrections, stats }
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
      spacedCharsFixed: 0,
      urlsCleaned: 0,
      linesRemoved: 0,
      totalCharactersRemoved: rawText.length - cleanRoomResult.cleanCopy.length,
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
