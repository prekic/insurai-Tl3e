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

// Turkish uppercase letters (including special chars)
const TURKISH_UPPER = 'A-ZÇĞİÖŞÜÂÎÛ'
const TURKISH_UPPER_CHARS = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZÂÎÛ'

// Characters that should NOT be merged across (preserve structure)
const MERGE_BLOCKERS = /[\d\/:.\-@#$%&*()=+\[\]{}|\\<>]/

// Barcode/QR patterns - exact match
const BARCODE_EXACT_PATTERNS = [
  /B\^+B/gi,                    // B^^^B, B^^B, etc.
  /B\s*\^+\s*B/gi,              // B ^ ^ ^ B with spaces
  /a!{3,}a/gi,                  // a!!!a, a!!!!a, etc.
  /\[QR\]/gi,                   // [QR] markers
  /\[BARCODE\]/gi,              // [BARCODE] markers
]

// Barcode/QR patterns - line match (if line contains these, remove entire line)
const BARCODE_LINE_PATTERNS = [
  /B\s*[\^<>]+\s*B/i,           // B^^^B variations
  /a\s*!{3,}\s*a/i,             // a!!!a variations
  /[<>\[\]{}|\\^]{5,}/,         // 5+ consecutive special chars
  // Base64-like: must have mix of upper+lower+digits, not just one char class
  /(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?:[A-Za-z0-9+/]{4}){10,}/,
  /(?:\d[A-Za-z]){10,}/,        // Alternating digit-letter (binary)
]

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
    if (pattern.test(trimmed)) {
      return { isGarbage: true, reason: 'barcode_pattern' }
    }
  }

  // Check line-level barcode patterns
  for (const pattern of BARCODE_LINE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isGarbage: true, reason: 'barcode_line_pattern' }
    }
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
 */
function isTurkishUpperFragment(token: string, maxLen: number = 10): boolean {
  if (token.length === 0 || token.length > maxLen) return false
  // Must be all Turkish uppercase letters
  const pattern = new RegExp(`^[${TURKISH_UPPER}]+$`)
  return pattern.test(token)
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
  let result = text

  // Split into lines to preserve structure
  const lines = result.split('\n')
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

      // Check if this token is a Turkish upper fragment
      if (isTurkishUpperFragment(token) && !shouldBlockMerge(token)) {
        sequence.push({ index: j, token })
        j++
      } else {
        break
      }
    }

    // Need at least 3 fragments to merge
    if (sequence.length >= 3) {
      // Check if this is a valid merge sequence:
      // - Classic: all tokens are 1-3 chars
      // - Mixed: at least 2 tokens are <=3 chars
      const shortTokenCount = sequence.filter(s => s.token.length <= 3).length

      const isClassicPattern = sequence.every(s => s.token.length <= 3)
      const isMixedPattern = shortTokenCount >= 2

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
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  stats.controlCharsRemoved = beforeControl - result.length

  // =========================================================================
  // Step 4: Force barcode tokens onto their own lines
  // This helps the line-based removal work even with long lines
  // =========================================================================
  for (const pattern of BARCODE_EXACT_PATTERNS) {
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
 */
export function hasRemainingArtifacts(text: string): {
  hasArtifacts: boolean
  artifacts: string[]
} {
  const artifacts: string[] = []

  // Check for barcode patterns
  if (/B\s*[\^]+\s*B/i.test(text)) {
    artifacts.push('B^^^B barcode pattern')
  }

  if (/a\s*!{3,}\s*a/i.test(text)) {
    artifacts.push('a!!!a barcode pattern')
  }

  if (/[<>\[\]{}|\\^]{5,}/.test(text)) {
    artifacts.push('Special character cluster')
  }

  // Check for spaced Turkish uppercase patterns
  // Pattern: 3+ Turkish uppercase tokens (1-3 chars each) separated by spaces
  const spacedPattern = new RegExp(
    `\\b(?:[${TURKISH_UPPER}]{1,3}\\s+){2,}[${TURKISH_UPPER}]{1,3}\\b`
  )
  if (spacedPattern.test(text)) {
    artifacts.push('Spaced Turkish uppercase pattern')
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
  const policyPattern = /(?:Poli[çc]e\s*(?:No|Numaras[ıi])?\s*[:\.]?\s*)(\d+[\d\/A-Za-z]*)/gi
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
  const datePattern = /\b(\d{2}[.\/]\d{2}[.\/]\d{4})\b/g
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
