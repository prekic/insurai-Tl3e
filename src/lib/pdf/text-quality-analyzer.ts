/**
 * PDF Text Quality Analyzer
 *
 * Detects quality issues in extracted PDF text including:
 * - Glyph-splitting (single character ratios)
 * - Barcode/QR code noise
 * - Control character contamination
 * - Turkish character encoding issues
 */

export interface TextQualityMetrics {
  /** Ratio of single-character tokens to total tokens (high = glyph splitting) */
  singleCharRatio: number
  /** Ratio of control/non-printable characters */
  controlCharRatio: number
  /** Ratio of high-ASCII (potential encoding issues) */
  highAsciiRatio: number
  /** Count of barcode-like patterns (^^^, repetitive sequences) */
  barcodePatternCount: number
  /** Average word length (low = splitting issues) */
  averageWordLength: number
  /** Count of recognizable Turkish insurance terms found */
  turkishTermsFound: number
  /** Overall quality score 0-100 (higher = better) */
  qualityScore: number
  /** Whether quality is acceptable for AI extraction */
  qualityOk: boolean
  /** Detected issues for debugging */
  issues: string[]
}

// Turkish insurance terms for quality validation
const TURKISH_INSURANCE_TERMS = [
  'sigorta', 'poliçe', 'prim', 'teminat', 'muafiyet',
  'sigortalı', 'sigortacı', 'kasko', 'trafik', 'sağlık',
  'yangın', 'deprem', 'dask', 'hayat', 'kaza',
  'hasar', 'tazminat', 'riziko', 'ferdi', 'konut',
  'işyeri', 'nakliyat', 'sorumluluk', 'kloz', 'zeyilname',
  // Common document terms
  'tarih', 'numara', 'adres', 'telefon', 'kimlik',
  'başlangıç', 'bitiş', 'tutar', 'toplam', 'genel',
]

// Patterns indicating barcode/QR noise
/* eslint-disable no-control-regex */
const BARCODE_PATTERNS = [
  /\^{3,}/g,                    // ^^^ sequences
  /[!@#$%^&*]{4,}/g,           // Repeated special chars
  /[\x00-\x1F\x7F-\x9F]{2,}/g, // Control character sequences
  /(.)\1{5,}/g,                 // Same char repeated 6+ times (but not spaces/newlines)
  /[B♠♣♦♥█▀▄░▒▓]{3,}/gi,       // Card suits and block chars (common barcode artifacts)
]
/* eslint-enable no-control-regex */

/**
 * Analyze text quality to detect extraction issues
 */
export function analyzeTextQuality(text: string): TextQualityMetrics {
  const issues: string[] = []

  if (!text || text.length === 0) {
    return {
      singleCharRatio: 1,
      controlCharRatio: 0,
      highAsciiRatio: 0,
      barcodePatternCount: 0,
      averageWordLength: 0,
      turkishTermsFound: 0,
      qualityScore: 0,
      qualityOk: false,
      issues: ['Empty text'],
    }
  }

  // Calculate single character ratio
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  const singleCharTokens = tokens.filter(t => t.length === 1 && /[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/.test(t))
  const singleCharRatio = tokens.length > 0 ? singleCharTokens.length / tokens.length : 0

  if (singleCharRatio > 0.15) {
    issues.push(`High single-char ratio: ${(singleCharRatio * 100).toFixed(1)}% (glyph splitting detected)`)
  }

  // Calculate control character ratio
  // eslint-disable-next-line no-control-regex
  const controlChars = text.match(/[\x00-\x1F\x7F-\x9F]/g) || []
  const controlCharRatio = controlChars.length / text.length

  if (controlCharRatio > 0.02) {
    issues.push(`High control char ratio: ${(controlCharRatio * 100).toFixed(1)}%`)
  }

  // Calculate high-ASCII ratio (potential encoding issues)
  const highAsciiChars = text.match(/[\x80-\xFF]/g) || []
  // Exclude Turkish characters which are valid
  const turkishHighAscii = text.match(/[çğıöşüÇĞİÖŞÜ]/g) || []
  const nonTurkishHighAscii = highAsciiChars.length - turkishHighAscii.length
  const highAsciiRatio = Math.max(0, nonTurkishHighAscii) / text.length

  if (highAsciiRatio > 0.05) {
    issues.push(`High non-Turkish high-ASCII ratio: ${(highAsciiRatio * 100).toFixed(1)}%`)
  }

  // Count barcode patterns
  let barcodePatternCount = 0
  for (const pattern of BARCODE_PATTERNS) {
    const matches = text.match(pattern) || []
    // For repetitive char pattern, exclude spaces and newlines
    if (pattern.source.includes('\\1{5,}')) {
      const filtered = matches.filter(m => !/^[\s\n]+$/.test(m))
      barcodePatternCount += filtered.length
    } else {
      barcodePatternCount += matches.length
    }
  }

  if (barcodePatternCount > 3) {
    issues.push(`Barcode/noise patterns detected: ${barcodePatternCount}`)
  }

  // Calculate average word length
  const words = tokens.filter(t => t.length > 1)
  const totalWordLength = words.reduce((sum, w) => sum + w.length, 0)
  const averageWordLength = words.length > 0 ? totalWordLength / words.length : 0

  if (averageWordLength < 3 && words.length > 10) {
    issues.push(`Low average word length: ${averageWordLength.toFixed(1)} (possible splitting)`)
  }

  // Count Turkish insurance terms (case-insensitive)
  const lowerText = text.toLowerCase()
  const turkishTermsFound = TURKISH_INSURANCE_TERMS.filter(term =>
    lowerText.includes(term)
  ).length

  if (turkishTermsFound < 3 && text.length > 500) {
    issues.push(`Few Turkish insurance terms found: ${turkishTermsFound}`)
  }

  // Calculate overall quality score (0-100)
  let qualityScore = 100

  // Deduct for single char ratio (max -40 points)
  qualityScore -= Math.min(40, singleCharRatio * 200)

  // Deduct for control chars (max -20 points)
  qualityScore -= Math.min(20, controlCharRatio * 500)

  // Deduct for high ASCII (max -15 points)
  qualityScore -= Math.min(15, highAsciiRatio * 200)

  // Deduct for barcode patterns (max -15 points)
  qualityScore -= Math.min(15, barcodePatternCount * 3)

  // Bonus for Turkish terms found (up to +10 points)
  qualityScore += Math.min(10, turkishTermsFound * 2)

  // Deduct for low word length (max -10 points)
  if (averageWordLength < 4) {
    qualityScore -= Math.min(10, (4 - averageWordLength) * 5)
  }

  qualityScore = Math.max(0, Math.min(100, qualityScore))

  // Quality is OK if score >= 60 and single char ratio < 0.15
  const qualityOk = qualityScore >= 60 && singleCharRatio < 0.15 && controlCharRatio < 0.05

  return {
    singleCharRatio,
    controlCharRatio,
    highAsciiRatio,
    barcodePatternCount,
    averageWordLength,
    turkishTermsFound,
    qualityScore,
    qualityOk,
    issues,
  }
}

/**
 * Quick check if text quality is acceptable
 */
export function isTextQualityAcceptable(text: string): boolean {
  return analyzeTextQuality(text).qualityOk
}

/**
 * Get quality score only (for quick checks)
 */
export function getTextQualityScore(text: string): number {
  return analyzeTextQuality(text).qualityScore
}
