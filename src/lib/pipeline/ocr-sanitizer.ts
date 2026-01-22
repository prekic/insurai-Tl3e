/**
 * OCR Pre-Sanitizer - Deterministic Cleanup
 *
 * Runs BEFORE any LLM call to perform reliable, rule-based cleanup:
 * - Normalizes whitespace and control characters
 * - Removes barcode/QR garbage lines
 * - Merges spaced Turkish letter fragments
 * - Preserves all numbers, dates, IDs exactly
 *
 * NON-NEGOTIABLE: Policy numbers, dates, amounts, currency symbols,
 * VIN/plate/chassis/engine numbers must remain EXACT.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SanitizerStats {
  linesRemoved: number
  garbageLinesRemoved: number
  lowLetterRatioLinesRemoved: number
  spacedFragmentsMerged: number
  controlCharsRemoved: number
  spacesNormalized: number
  newlinesNormalized: number
  barcodeTokensIsolated: number
}

export interface SanitizerResult {
  text: string
  stats: SanitizerStats
  warnings: string[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Turkish uppercase letters (explicit list for Unicode safety)
// Using explicit character list instead of ranges to avoid encoding issues
const TURKISH_UPPER_CHARS = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZÂÎÛ'

// Create a Set of codepoints for fast lookup (Unicode-safe)
const TURKISH_UPPER_CODEPOINTS = new Set(
  [...TURKISH_UPPER_CHARS].map(c => c.codePointAt(0)!)
)

// Also include basic A-Z codepoints (65-90)
for (let i = 65; i <= 90; i++) {
  TURKISH_UPPER_CODEPOINTS.add(i)
}

// For regex patterns (kept as reference): 'A-ZÇĞİÖŞÜÂÎÛ'
// Now using Unicode-safe isAllTurkishUpper() function instead

// Characters that should NOT be merged across (preserve structure)
const MERGE_BLOCKERS = /[\d/:.\-@#$%&*()=+[\]{}|\\<>]/

// Control characters to strip (beyond what normalize handles)
// Includes C0/C1 controls except tab/newline
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g

// Barcode/QR patterns - exact match (for inline removal)
const BARCODE_EXACT_PATTERNS = [
  /B\^+B/gi,                    // B^^^B, B^^B, etc.
  /B\s*\^+\s*B/gi,              // B ^ ^ ^ B with spaces
  /a!{3,}a/gi,                  // a!!!a, a!!!!a, etc.
  /a!{3,}a[!aA]*/gi,            // a!!!a followed by more !aA (like a!!!!!a!AAA)
  /\[QR\]/gi,                   // [QR] markers
  /\[BARCODE\]/gi,              // [BARCODE] markers
]

// Barcode/QR patterns - line match (if line contains these, remove entire line)
const BARCODE_LINE_PATTERNS = [
  /B\s*[\^<>]+\s*B/i,           // B^^^B variations
  /a\s*!{3,}\s*a/i,             // a!!!a variations
  /a!{3,}a.*?(?:!|a|A)+/i,      // a!!!a followed by more noise
  /[<>[\]{}|\\^]{5,}/,         // 5+ consecutive special chars
  // Base64-like: must have mix of upper+lower+digits, not just one char class
  /(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?:[A-Za-z0-9+/]{4}){10,}/,
  /(?:\d[A-Za-z]){10,}/,        // Alternating digit-letter (binary)
  // High-ASCII control characters (extended range)
  /[\x80-\xff]{5,}/,            // 5+ high-ASCII chars in sequence
]

// ============================================================================
// UNICODE-SAFE HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize text to NFC form for consistent Unicode handling
 * This ensures İ (U+0130) and Ş (U+015E) match correctly regardless of input encoding
 */
function normalizeUnicode(text: string): string {
  return text.normalize('NFC')
}

/**
 * Check if a character is a Turkish uppercase letter (Unicode-safe)
 * Uses codepoint checking to handle encoding variations
 */
function isTurkishUpperChar(char: string): boolean {
  if (char.length === 0) return false
  const codepoint = char.codePointAt(0)
  if (!codepoint) return false

  // Check if it's in our explicit Turkish uppercase set
  if (TURKISH_UPPER_CODEPOINTS.has(codepoint)) return true

  // Fallback: Check using Unicode general category for any uppercase letter
  // Then verify it's not in ranges we want to exclude
  // Using Unicode property escape with /u flag
  try {
    if (/^\p{Lu}$/u.test(char)) {
      return true // Accept any uppercase letter
    }
  } catch {
    // Fallback for environments without Unicode property support
    return /^[A-ZÇĞİÖŞÜÂÎÛ]$/.test(char)
  }

  return false
}

/**
 * Check if an entire string consists only of Turkish uppercase letters (Unicode-safe)
 */
function isAllTurkishUpper(str: string): boolean {
  if (str.length === 0) return false
  const normalized = normalizeUnicode(str)
  for (const char of normalized) {
    if (!isTurkishUpperChar(char)) return false
  }
  return true
}

/**
 * Strip control characters and replacement characters from text
 */
function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHAR_PATTERN, '')
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate letter ratio for a string
 * @returns ratio of letters to non-space characters (0-1)
 */
function getLetterRatio(line: string): number {
  const nonSpace = line.replace(/\s/g, '')
  if (nonSpace.length === 0) return 1 // Empty lines are "fine"

  const letters = (nonSpace.match(/[a-zA-ZçğıöşüÇĞİÖŞÜâîûÂÎÛ]/g) || []).length
  return letters / nonSpace.length
}

/**
 * Check if a line is likely barcode/QR garbage
 */
function isGarbageLine(line: string): { isGarbage: boolean; reason?: string } {
  const trimmed = line.trim()

  // Empty lines are not garbage
  if (trimmed.length === 0) {
    return { isGarbage: false }
  }

  // Check exact barcode patterns
  for (const pattern of BARCODE_EXACT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    if (pattern.test(trimmed)) {
      return { isGarbage: true, reason: 'barcode_pattern' }
    }
  }

  // Check line-level barcode patterns
  for (const pattern of BARCODE_LINE_PATTERNS) {
    // Reset lastIndex for global patterns
    if (pattern.global) pattern.lastIndex = 0
    if (pattern.test(trimmed)) {
      return { isGarbage: true, reason: 'barcode_line_pattern' }
    }
  }

  // Check for high-ASCII/control character remnants
  const highAsciiCount = (trimmed.match(/[\x80-\xff]/g) || []).length
  if (highAsciiCount > 10 || (trimmed.length > 0 && highAsciiCount / trimmed.length > 0.3)) {
    return { isGarbage: true, reason: 'high_ascii_content' }
  }

  // Check for control characters or replacement chars
  // eslint-disable-next-line no-control-regex
  const controlCount = (trimmed.match(/[\x00-\x1F\x7F-\x9F\uFFFD]/g) || []).length
  if (controlCount > 5 || (trimmed.length > 0 && controlCount / trimmed.length > 0.2)) {
    return { isGarbage: true, reason: 'control_char_content' }
  }

  // Check letter ratio for long lines (potential QR payload)
  const nonSpaceLength = trimmed.replace(/\s/g, '').length
  if (nonSpaceLength > 40) {
    const letterRatio = getLetterRatio(trimmed)
    if (letterRatio < 0.15) {
      return { isGarbage: true, reason: 'low_letter_ratio' }
    }
  }

  return { isGarbage: false }
}

/**
 * Check if a token should block merging (contains digits, punctuation, etc.)
 */
function shouldBlockMerge(token: string): boolean {
  return MERGE_BLOCKERS.test(token)
}

/**
 * Check if a token is a Turkish uppercase fragment (1-10 chars, all Turkish upper)
 * Uses Unicode-safe character checking
 */
function isTurkishUpperFragment(token: string, maxLen: number = 10): boolean {
  if (token.length === 0 || token.length > maxLen) return false
  // Use Unicode-safe check
  return isAllTurkishUpper(token)
}

/**
 * Merge spaced Turkish uppercase fragments
 *
 * Handles both:
 * - Classic: "S Ö Z L E Ş M E" (single chars)
 * - Mixed: "GEN İŞ LETİLM İŞ" (mixed 1-10 char tokens with at least 2 short)
 */
function mergeSpacedTurkishFragments(text: string): { text: string; mergeCount: number } {
  let mergeCount = 0

  // Split into lines to preserve structure
  const lines = text.split('\n')
  const processedLines: string[] = []

  for (const line of lines) {
    let processedLine = line

    // Process the line multiple times until no more merges
    let changed = true
    while (changed) {
      changed = false
      const merged = mergeFragmentsInLine(processedLine)
      if (merged.text !== processedLine) {
        processedLine = merged.text
        mergeCount += merged.mergeCount
        changed = true
      }
    }

    processedLines.push(processedLine)
  }

  return { text: processedLines.join('\n'), mergeCount }
}

/**
 * Merge Turkish fragments within a single line
 *
 * Handles both:
 * - Classic: single chars like "S Ö Z L E Ş M E"
 * - Mixed: variable length like "GEN İŞ LETİLM İŞ" (at least 2 short tokens)
 */
function mergeFragmentsInLine(line: string): { text: string; mergeCount: number } {
  // Tokenize by spaces, preserving space positions
  const tokens = line.split(/(\s+)/)
  let mergeCount = 0

  // Find sequences of Turkish upper fragments to merge
  let i = 0
  while (i < tokens.length) {
    // Skip whitespace tokens
    if (/^\s+$/.test(tokens[i])) {
      i++
      continue
    }

    // Look for a sequence of Turkish upper fragments
    const sequence: { index: number; token: string }[] = []
    let j = i

    while (j < tokens.length) {
      const token = tokens[j]

      // Skip whitespace between potential fragments
      if (/^\s+$/.test(token)) {
        j++
        continue
      }

      // Check if this token is a Turkish upper fragment (allow up to 10 chars for mixed patterns)
      if (isTurkishUpperFragment(token, 10) && !shouldBlockMerge(token)) {
        sequence.push({ index: j, token })
        j++
      } else {
        break
      }
    }

    // Need at least 2 fragments to merge (reduced from 3 for mixed patterns)
    if (sequence.length >= 2) {
      // Check if this is a valid merge sequence:
      // - Classic: all tokens are 1-3 chars (need 3+ tokens)
      // - Mixed: at least 2 tokens are <=3 chars AND all tokens are Turkish upper
      const shortTokenCount = sequence.filter(s => s.token.length <= 3).length
      // Use Unicode-safe check for Turkish uppercase
      const allTurkishUpper = sequence.every(s => isAllTurkishUpper(s.token))

      const isClassicPattern = sequence.length >= 3 && sequence.every(s => s.token.length <= 3)
      const isMixedPattern = shortTokenCount >= 2 && allTurkishUpper

      if (isClassicPattern || isMixedPattern) {
        // Merge the sequence
        const merged = sequence.map(s => s.token).join('')

        // Replace tokens with merged result
        // Mark spaces for removal and tokens for replacement
        const firstIdx = sequence[0].index
        const lastIdx = sequence[sequence.length - 1].index

        // Build new tokens array
        const newTokens: string[] = []
        for (let k = 0; k < tokens.length; k++) {
          if (k < firstIdx || k > lastIdx) {
            newTokens.push(tokens[k])
          } else if (k === firstIdx) {
            newTokens.push(merged)
          }
          // Skip other tokens in the sequence (they're merged)
        }

        mergeCount++
        return { text: newTokens.join(''), mergeCount }
      }
    }

    // Move to next non-whitespace token
    i = j > i ? j : i + 1
  }

  return { text: tokens.join(''), mergeCount: 0 }
}

// ============================================================================
// MAIN SANITIZER FUNCTION
// ============================================================================

/**
 * Pre-sanitize OCR text before LLM processing
 *
 * This is a deterministic, rule-based cleanup that:
 * 1. Normalizes newlines and spaces
 * 2. Removes control characters
 * 3. Isolates and removes barcode/QR garbage
 * 4. Merges spaced Turkish letter fragments
 * 5. Preserves all numbers, dates, and identifiers exactly
 */
export function sanitizeOCRText(text: string): SanitizerResult {
  const stats: SanitizerStats = {
    linesRemoved: 0,
    garbageLinesRemoved: 0,
    lowLetterRatioLinesRemoved: 0,
    spacedFragmentsMerged: 0,
    controlCharsRemoved: 0,
    spacesNormalized: 0,
    newlinesNormalized: 0,
    barcodeTokensIsolated: 0,
  }
  const warnings: string[] = []

  let result = text

  // =========================================================================
  // Step 1: Normalize newlines (\r\n -> \n, \r -> \n)
  // =========================================================================
  const beforeNewlines = result.length
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  stats.newlinesNormalized = beforeNewlines - result.length

  // =========================================================================
  // Step 2: Normalize weird spaces (NBSP, thin space, etc. -> normal space)
  // =========================================================================
  const beforeSpaces = result.length
  result = result.replace(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F]/g, ' ')
  stats.spacesNormalized = beforeSpaces - result.length

  // =========================================================================
  // Step 3: Remove control characters except \n and \t
  // =========================================================================
  const beforeControl = result.length
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  stats.controlCharsRemoved = beforeControl - result.length

  // =========================================================================
  // Step 4: Strip control characters (C0/C1 controls, replacement chars)
  // This handles embedded control chars that may be mixed with garbage
  // =========================================================================
  const beforeControlStrip = result.length
  result = stripControlChars(result)
  stats.controlCharsRemoved += beforeControlStrip - result.length

  // =========================================================================
  // Step 4a: Remove embedded barcode patterns (mid-line cleanup)
  // This handles cases where garbage is embedded with valid text
  // =========================================================================

  // First, remove inline barcode patterns completely
  const inlineBarcodePatterns = [
    /B\^{2,}B/gi,                     // B^^^B exact
    /B\s*\^{2,}\s*B/gi,               // B ^ ^ ^ B with spaces
    /a!{3,}a(?:[!aA]*)?/gi,           // a!!!a and variants like a!!!!!a!AAA
    /a\s*!{3,}\s*a(?:[!aA\s]*)?/gi,   // a ! ! ! a with spaces
    /[\x80-\xff]{3,}/g,               // High-ASCII sequences (lowered to 3+)
    /[\uFFFD]{2,}/g,                  // Multiple replacement characters
  ]

  for (const pattern of inlineBarcodePatterns) {
    pattern.lastIndex = 0
    const matches = result.match(pattern)
    if (matches) {
      stats.barcodeTokensIsolated += matches.length
      result = result.replace(pattern, ' ')
    }
  }

  // Then, force remaining barcode tokens onto their own lines for line-based removal
  for (const pattern of BARCODE_EXACT_PATTERNS) {
    pattern.lastIndex = 0
    const matches = result.match(pattern)
    if (matches) {
      stats.barcodeTokensIsolated += matches.length
      result = result.replace(pattern, '\n$&\n')
    }
  }

  // =========================================================================
  // Step 5: Remove garbage lines (barcode/QR payloads, low letter ratio)
  // =========================================================================
  const lines = result.split('\n')
  const cleanedLines: string[] = []

  for (const line of lines) {
    const { isGarbage, reason } = isGarbageLine(line)

    if (isGarbage) {
      stats.linesRemoved++
      if (reason === 'barcode_pattern' || reason === 'barcode_line_pattern') {
        stats.garbageLinesRemoved++
      } else if (reason === 'low_letter_ratio') {
        stats.lowLetterRatioLinesRemoved++
      }
    } else {
      cleanedLines.push(line)
    }
  }

  result = cleanedLines.join('\n')

  // =========================================================================
  // Step 6: Collapse repeated spaces (but keep line structure)
  // =========================================================================
  result = result.replace(/[ \t]{2,}/g, ' ')

  // =========================================================================
  // Step 7: Merge spaced Turkish uppercase fragments
  // =========================================================================
  const mergeResult = mergeSpacedTurkishFragments(result)
  result = mergeResult.text
  stats.spacedFragmentsMerged = mergeResult.mergeCount

  // =========================================================================
  // Step 8: Final cleanup - remove excessive blank lines
  // =========================================================================
  result = result.replace(/\n{3,}/g, '\n\n')
  result = result.trim()

  // =========================================================================
  // Warnings
  // =========================================================================
  if (stats.linesRemoved > 20) {
    warnings.push(`High garbage removal: ${stats.linesRemoved} lines removed`)
  }
  if (stats.spacedFragmentsMerged === 0 && /[A-ZÇĞİÖŞÜ]\s+[A-ZÇĞİÖŞÜ]/.test(text)) {
    warnings.push('Spaced Turkish fragments detected but not merged - may need manual review')
  }

  return { text: result, stats, warnings }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if text still contains artifacts that need cleanup
 * Uses Unicode-safe checking for Turkish patterns
 */
export function hasRemainingArtifacts(text: string): {
  hasArtifacts: boolean
  artifacts: string[]
} {
  const artifacts: string[] = []
  const normalizedText = normalizeUnicode(text)

  // Check for barcode patterns
  if (/B\s*[\^]+\s*B/i.test(normalizedText)) {
    artifacts.push('B^^^B barcode pattern')
  }

  if (/a\s*!{3,}\s*a/i.test(normalizedText)) {
    artifacts.push('a!!!a barcode pattern')
  }

  // Extended pattern for a!!!a variants (a!!!!!a!AAA etc.)
  if (/a!{3,}a[!aA]+/i.test(normalizedText)) {
    artifacts.push('a!!!a extended barcode pattern')
  }

  if (/[<>[\]{}|\\^]{5,}/.test(normalizedText)) {
    artifacts.push('Special character cluster')
  }

  // Check for high-ASCII/control character remnants
  if (/[\x80-\xff]{3,}/.test(normalizedText)) {
    artifacts.push('High-ASCII character sequence')
  }

  // Check for control characters and replacement chars
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F-\x9F\uFFFD]{2,}/.test(normalizedText)) {
    artifacts.push('Control character sequence')
  }

  // Check for spaced Turkish uppercase patterns using Unicode-safe detection
  // Instead of regex character classes, we'll scan for space-separated uppercase sequences
  const words = normalizedText.split(/\s+/)
  let consecutiveUpperFragments: string[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word.length > 0 && word.length <= 3 && isAllTurkishUpper(word)) {
      consecutiveUpperFragments.push(word)
    } else if (word.length > 0 && word.length <= 10 && isAllTurkishUpper(word)) {
      // Mixed-length: keep tracking
      consecutiveUpperFragments.push(word)
    } else {
      // Check if we had a valid spaced fragment sequence
      if (consecutiveUpperFragments.length >= 3) {
        const shortCount = consecutiveUpperFragments.filter(w => w.length <= 3).length
        if (shortCount >= 2) {
          artifacts.push(`Spaced Turkish uppercase pattern: "${consecutiveUpperFragments.join(' ')}"`)
        }
      }
      consecutiveUpperFragments = []
    }
  }

  // Check final sequence
  if (consecutiveUpperFragments.length >= 3) {
    const shortCount = consecutiveUpperFragments.filter(w => w.length <= 3).length
    if (shortCount >= 2) {
      artifacts.push(`Spaced Turkish uppercase pattern: "${consecutiveUpperFragments.join(' ')}"`)
    }
  }

  return {
    hasArtifacts: artifacts.length > 0,
    artifacts,
  }
}

/**
 * Validate that critical data was preserved
 */
export function validatePreservation(
  original: string,
  sanitized: string
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  // Extract and compare policy numbers (format: digits with optional slashes, letters)
  const policyPattern = /(?:Poli[çc]e\s*(?:No|Numaras[ıi])?\s*[:.]\s*)(\d+[\d/A-Za-z]*)/gi
  const originalPolicies = [...original.matchAll(policyPattern)].map(m => m[1])
  const sanitizedPolicies = [...sanitized.matchAll(policyPattern)].map(m => m[1])

  for (const policy of originalPolicies) {
    if (!sanitizedPolicies.some(p => p === policy)) {
      // Check if it's still in the text somewhere
      if (!sanitized.includes(policy)) {
        issues.push(`Policy number may have been altered: ${policy}`)
      }
    }
  }

  // Extract and compare dates (DD.MM.YYYY or DD/MM/YYYY)
  const datePattern = /\b(\d{2}[./]\d{2}[./]\d{4})\b/g
  const originalDates = [...original.matchAll(datePattern)].map(m => m[1])
  const sanitizedDates = [...sanitized.matchAll(datePattern)].map(m => m[1])

  for (const date of originalDates) {
    if (!sanitizedDates.includes(date) && !sanitized.includes(date)) {
      issues.push(`Date may have been altered: ${date}`)
    }
  }

  // Extract and compare currency amounts (Turkish format: 1.234,56 or 1.234.567)
  const amountPattern = /\b(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|₺)/g
  const originalAmounts = [...original.matchAll(amountPattern)].map(m => m[1])
  const sanitizedAmounts = [...sanitized.matchAll(amountPattern)].map(m => m[1])

  for (const amount of originalAmounts) {
    if (!sanitizedAmounts.includes(amount) && !sanitized.includes(amount)) {
      issues.push(`Amount may have been altered: ${amount}`)
    }
  }

  // Check plate numbers (Turkish format: 34 ABC 123)
  const platePattern = /\b(\d{2}\s*[A-Z]{1,3}\s*\d{2,4})\b/gi
  const originalPlates = [...original.matchAll(platePattern)].map(m => m[1].replace(/\s+/g, ''))

  for (const plate of originalPlates) {
    // Plate might have different spacing but same content
    const normalizedPlate = plate.replace(/\s+/g, '')
    if (!sanitized.replace(/\s+/g, '').includes(normalizedPlate)) {
      issues.push(`Plate number may have been altered: ${plate}`)
    }
  }

  // Check VIN/Chassis numbers (17 alphanumeric chars)
  const vinPattern = /\b([A-HJ-NPR-Z0-9]{17})\b/gi
  const originalVINs = [...original.matchAll(vinPattern)].map(m => m[1])

  for (const vin of originalVINs) {
    if (!sanitized.includes(vin)) {
      issues.push(`VIN may have been altered: ${vin}`)
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

// ============================================================================
// KNOWN WORD MERGING (for common Turkish insurance terms)
// ============================================================================

const KNOWN_SPACED_WORDS: Array<{ pattern: RegExp; replacement: string }> = [
  // Insurance terms
  { pattern: /S\s*Ö\s*Z\s*L\s*E\s*Ş\s*M\s*E/gi, replacement: 'SÖZLEŞME' },
  { pattern: /G\s*E\s*N\s*İ\s*Ş\s*L\s*E\s*T\s*İ\s*L\s*M\s*İ\s*Ş/gi, replacement: 'GENİŞLETİLMİŞ' },
  { pattern: /B\s*İ\s*R\s*L\s*E\s*Ş\s*İ\s*K/gi, replacement: 'BİRLEŞİK' },
  { pattern: /S\s*İ\s*G\s*O\s*R\s*T\s*A/gi, replacement: 'SİGORTA' },
  { pattern: /P\s*O\s*L\s*İ\s*Ç\s*E/gi, replacement: 'POLİÇE' },
  { pattern: /T\s*E\s*M\s*İ\s*N\s*A\s*T/gi, replacement: 'TEMİNAT' },
  { pattern: /M\s*U\s*A\s*F\s*İ\s*Y\s*E\s*T/gi, replacement: 'MUAFİYET' },
  { pattern: /K\s*A\s*S\s*K\s*O/gi, replacement: 'KASKO' },
  { pattern: /T\s*R\s*A\s*F\s*İ\s*K/gi, replacement: 'TRAFİK' },
  { pattern: /A\s*N\s*A\s*D\s*O\s*L\s*U/gi, replacement: 'ANADOLU' },
  { pattern: /İ\s*S\s*T\s*A\s*N\s*B\s*U\s*L/gi, replacement: 'İSTANBUL' },
  { pattern: /T\s*Ü\s*R\s*K\s*İ\s*Y\s*E/gi, replacement: 'TÜRKİYE' },
  { pattern: /H\s*A\s*S\s*A\s*R/gi, replacement: 'HASAR' },
  { pattern: /P\s*R\s*İ\s*M/gi, replacement: 'PRİM' },
  { pattern: /A\s*R\s*A\s*Ç/gi, replacement: 'ARAÇ' },
  { pattern: /P\s*L\s*A\s*K\s*A/gi, replacement: 'PLAKA' },

  // Mixed-length patterns (like GEN İŞ LETİLM İŞ)
  { pattern: /GEN\s+İŞ\s+LETİLM\s+İŞ/gi, replacement: 'GENİŞLETİLMİŞ' },
  { pattern: /GEN\s+İŞ/gi, replacement: 'GENİŞ' },
  { pattern: /SİGORTA\s+LI/gi, replacement: 'SİGORTALI' },
  { pattern: /TEMİNAT\s+LAR/gi, replacement: 'TEMİNATLAR' },
]

/**
 * Apply known word merging for common Turkish insurance terms
 * This is more aggressive and handles cases the generic algorithm misses
 */
export function applyKnownWordMerging(text: string): { text: string; mergeCount: number } {
  let result = text
  let mergeCount = 0

  for (const { pattern, replacement } of KNOWN_SPACED_WORDS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    const before = result
    result = result.replace(pattern, replacement)
    // Only count if text actually changed
    if (result !== before) {
      mergeCount++
    }
  }

  return { text: result, mergeCount }
}

/**
 * Full sanitization with known word merging
 */
export function sanitizeOCRTextFull(text: string): SanitizerResult {
  // First pass: standard sanitization
  const result = sanitizeOCRText(text)

  // Second pass: known word merging
  const knownWordResult = applyKnownWordMerging(result.text)
  result.text = knownWordResult.text
  result.stats.spacedFragmentsMerged += knownWordResult.mergeCount

  return result
}
