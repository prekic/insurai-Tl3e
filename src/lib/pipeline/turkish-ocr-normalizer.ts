/**
 * Deterministic Turkish OCR Normalizer
 *
 * Stage 0 of the extraction pipeline - runs BEFORE any LLM processing.
 * Fixes common OCR artifacts in Turkish insurance documents.
 *
 * Rules:
 * 1. Drop garbage lines: containing "B^^^B" OR >50% non-alphanumeric
 * 2. Merge spaced letters: "G E N İ Ş" → "GENİŞ"
 * 3. Merge spaced syllables: "GEN İŞ LETİLM İŞ" → "GENİŞLETİLMİŞ"
 * 4. Preserve numbers, dates, plate/VIN, emails exactly
 */

// Turkish uppercase characters including special chars
const TURKISH_UPPER = 'A-ZÇĞİÖŞÜÂÎÛ'
// Regex patterns available for future use:
// const TURKISH_UPPER_REGEX = new RegExp(`[${TURKISH_UPPER}]`)
// const TURKISH_ALPHA_REGEX = new RegExp(`[${TURKISH_UPPER}a-zçğıöşüâîû]`, 'i')

// Patterns to preserve exactly (don't merge across these)
const PRESERVE_PATTERNS = {
  // License plates: 34 ABC 1234, 06 AB 123
  plate: /\b\d{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4}\b/gi,
  // VIN: 17 alphanumeric (no I, O, Q)
  vin: /\b[A-HJ-NPR-Z0-9]{17}\b/gi,
  // Dates: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
  date: /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g,
  // Policy numbers: sequences of digits 7+
  policyNumber: /\b\d{7,15}\b/g,
  // Email patterns
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  // URLs
  url: /https?:\/\/[^\s]+/gi,
  // Phone numbers: +90, 0XXX, (XXX)
  phone: /(?:\+90|0)\s*\(?\d{3}\)?\s*\d{3}\s*\d{2}\s*\d{2}/g,
  // Currency amounts: 1.234,56 TL or 1,234.56 USD
  currency: /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*(?:TL|TRY|₺|USD|\$|EUR|€)\b/gi,
  // TC Kimlik: 11 digits starting with non-zero
  tcKimlik: /\b[1-9]\d{10}\b/g,
  // IBAN: TR followed by digits
  iban: /\bTR\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}\b/gi,
}

// Garbage patterns that indicate line should be dropped
const GARBAGE_PATTERNS = [
  /B\^{2,}B/i, // B^^^B type artifacts
  /[█▀▄▌▐░▒▓■□▪▫●○◆◇]{3,}/, // Block characters
  // eslint-disable-next-line no-control-regex -- intentionally matching control chars for OCR cleanup
  /[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}/, // Control characters
]

/**
 * Check if a line is garbage (should be dropped)
 */
function isGarbageLine(line: string): boolean {
  // Empty or whitespace only
  if (!line.trim()) return false // Keep empty lines for structure

  // Check garbage patterns
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(line)) {
      return true
    }
  }

  // Check if >50% non-alphanumeric (excluding whitespace)
  const trimmed = line.trim()
  if (trimmed.length === 0) return false

  const nonWhitespace = trimmed.replace(/\s/g, '')
  if (nonWhitespace.length === 0) return false

  const alphanumericCount = (nonWhitespace.match(/[a-zA-Z0-9çğıöşüÇĞİÖŞÜâîûÂÎÛ]/g) || []).length
  const ratio = alphanumericCount / nonWhitespace.length

  return ratio < 0.5
}

/**
 * Extract and mark preserved tokens in text
 */
interface PreservedToken {
  placeholder: string
  original: string
  start: number
  end: number
}

function extractPreservedTokens(text: string): { text: string; tokens: PreservedToken[] } {
  const tokens: PreservedToken[] = []
  let result = text
  let placeholderIndex = 0

  // Extract all patterns that should be preserved
  for (const [_name, pattern] of Object.entries(PRESERVE_PATTERNS)) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0

    let match: RegExpExecArray | null
    const tempResult = result
    result = ''
    let lastEnd = 0

    // Create new regex to avoid state issues
    const regex = new RegExp(pattern.source, pattern.flags)

    while ((match = regex.exec(tempResult)) !== null) {
      const placeholder = `__PRESERVE_${placeholderIndex}__`
      tokens.push({
        placeholder,
        original: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })

      result += tempResult.slice(lastEnd, match.index) + placeholder
      lastEnd = match.index + match[0].length
      placeholderIndex++
    }

    result += tempResult.slice(lastEnd)
  }

  return { text: result, tokens }
}

/**
 * Restore preserved tokens in text
 */
function restorePreservedTokens(text: string, tokens: PreservedToken[]): string {
  let result = text
  for (const token of tokens) {
    result = result.replace(token.placeholder, token.original)
  }
  return result
}

/**
 * Merge spaced single letters: "G E N İ Ş" → "GENİŞ"
 *
 * Matches sequences like: X Y Z where X, Y, Z are single Turkish uppercase letters
 */
function mergeSpacedLetters(text: string): string {
  // Pattern: Single Turkish letter followed by space and another single letter (2+ times)
  // Example: "G E N İ Ş" matches as a sequence
  const spacedLetterPattern = new RegExp(
    `\\b([${TURKISH_UPPER}])(?:\\s+([${TURKISH_UPPER}]))+\\b`,
    'g'
  )

  return text.replace(spacedLetterPattern, (match) => {
    // Remove all spaces
    return match.replace(/\s+/g, '')
  })
}

/**
 * Merge spaced syllable chunks: "GEN İŞ LETİLM İŞ" → "GENİŞLETİLMİŞ"
 *
 * Matches sequences of 1-4 char Turkish uppercase tokens separated by single spaces,
 * BUT stops at tokens containing digits or punctuation.
 */
function mergeSpacedSyllables(text: string): string {
  // Split by whitespace preserving multiple spaces
  const parts = text.split(/(\s+)/)
  const result: string[] = []
  let currentChunk: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    // If it's whitespace
    if (/^\s+$/.test(part)) {
      // Single space between potential syllables - continue accumulating
      if (part === ' ' && currentChunk.length > 0) {
        continue // Don't add space yet, might merge
      }
      // Multiple spaces or other whitespace - flush and add
      if (currentChunk.length > 0) {
        result.push(currentChunk.join(''))
        currentChunk = []
      }
      result.push(part)
      continue
    }

    // Check if this is a Turkish uppercase syllable (1-4 chars, no digits/punctuation)
    const isSyllable =
      part.length >= 1 &&
      part.length <= 4 &&
      new RegExp(`^[${TURKISH_UPPER}]+$`).test(part)

    // Check if it contains digits or punctuation (stop merging)
    const hasDigitsOrPunct = /[\d:/.@\-,;()[\]{}]/.test(part)

    if (isSyllable && !hasDigitsOrPunct) {
      currentChunk.push(part)
    } else {
      // Flush current chunk if any
      if (currentChunk.length > 0) {
        // Only merge if we have multiple chunks
        if (currentChunk.length > 1) {
          result.push(currentChunk.join(''))
        } else {
          result.push(currentChunk[0])
        }
        currentChunk = []
      }
      result.push(part)
    }
  }

  // Flush remaining chunk
  if (currentChunk.length > 0) {
    if (currentChunk.length > 1) {
      result.push(currentChunk.join(''))
    } else {
      result.push(currentChunk[0])
    }
  }

  return result.join('')
}

/**
 * Known Turkish words with common OCR spacing errors
 */
const KNOWN_WORD_FIXES: Record<string, RegExp> = {
  GENİŞLETİLMİŞ: /G\s*E\s*N\s*[İI]\s*[SŞ]\s*L\s*E\s*T\s*[İI]\s*L\s*M\s*[İI]\s*[SŞ]/gi,
  SÖZLEŞME: /S\s*[ÖO]\s*Z\s*L\s*E\s*[SŞ]\s*M\s*E/gi,
  POLİÇE: /P\s*O\s*L\s*[İI]\s*[CÇ]\s*E/gi,
  SİGORTA: /S\s*[İI]\s*G\s*O\s*R\s*T\s*A/gi,
  TEMİNAT: /T\s*E\s*M\s*[İI]\s*N\s*A\s*T/gi,
  MUAFİYET: /M\s*U\s*A\s*F\s*[İI]\s*Y\s*E\s*T/gi,
  HASAR: /H\s*A\s*S\s*A\s*R/gi,
  ARAÇ: /A\s*R\s*A\s*[CÇ]/gi,
  KASKO: /K\s*A\s*S\s*K\s*O/gi,
  KONUT: /K\s*O\s*N\s*U\s*T/gi,
  YANGIN: /Y\s*A\s*N\s*G\s*[İI]\s*N/gi,
  DEPREM: /D\s*E\s*P\s*R\s*E\s*M/gi,
  SEL: /S\s*E\s*L/gi,
  DOLU: /D\s*O\s*L\s*U/gi,
  HIRSIZLIK: /H\s*[İI]\s*R\s*S\s*[İI]\s*Z\s*L\s*[İI]\s*K/gi,
  SORUMLULUK: /S\s*O\s*R\s*U\s*M\s*L\s*U\s*L\s*U\s*K/gi,
  TAZMİNAT: /T\s*A\s*Z\s*M\s*[İI]\s*N\s*A\s*T/gi,
  SİGORTALI: /S\s*[İI]\s*G\s*O\s*R\s*T\s*A\s*L\s*[İI]/gi,
  ŞARTLAR: /[SŞ]\s*A\s*R\s*T\s*L\s*A\s*R/gi,
  KLOZLAR: /K\s*L\s*O\s*Z\s*L\s*A\s*R/gi,
  İSTİSNA: /[İI]\s*S\s*T\s*[İI]\s*S\s*N\s*A/gi,
  ÖZEL: /[ÖO]\s*Z\s*E\s*L/gi,
  GENEL: /G\s*E\s*N\s*E\s*L/gi,
}

/**
 * Fix known Turkish words with OCR spacing
 */
function fixKnownWords(text: string): string {
  let result = text

  for (const [correct, pattern] of Object.entries(KNOWN_WORD_FIXES)) {
    result = result.replace(pattern, correct)
  }

  return result
}

/**
 * Main normalization function
 *
 * @param text Raw OCR text
 * @returns Normalized text with line breaks preserved
 */
export function normalizeTurkishOcr(text: string): string {
  // Step 1: Process line by line, dropping garbage lines
  const lines = text.split('\n')
  const cleanedLines: string[] = []

  for (const line of lines) {
    if (isGarbageLine(line)) {
      // Skip garbage lines entirely
      continue
    }
    cleanedLines.push(line)
  }

  let result = cleanedLines.join('\n')

  // Step 2: Extract and mark tokens that should be preserved
  const { text: markedText, tokens } = extractPreservedTokens(result)

  // Step 3: Fix known Turkish words first (most reliable)
  let processed = fixKnownWords(markedText)

  // Step 4: Merge spaced single letters
  processed = mergeSpacedLetters(processed)

  // Step 5: Merge spaced syllables (more aggressive)
  processed = mergeSpacedSyllables(processed)

  // Step 6: Restore preserved tokens
  result = restorePreservedTokens(processed, tokens)

  // Step 7: Clean up multiple spaces (but preserve line structure)
  result = result.replace(/[^\S\n]+/g, ' ')

  // Step 8: Trim lines
  result = result
    .split('\n')
    .map((line) => line.trim())
    .join('\n')

  return result
}

/**
 * Stats about what was normalized
 */
export interface NormalizationStats {
  linesDropped: number
  wordsFixed: number
  syllablesMerged: number
  preservedTokens: number
  originalLength: number
  normalizedLength: number
}

/**
 * Normalize with stats for debugging/logging
 */
export function normalizeTurkishOcrWithStats(text: string): {
  text: string
  stats: NormalizationStats
} {
  const originalLength = text.length
  // Note: line count available via text.split('\n').length if needed for debugging

  // Count garbage lines
  const lines = text.split('\n')
  let linesDropped = 0
  const cleanedLines: string[] = []

  for (const line of lines) {
    if (isGarbageLine(line)) {
      linesDropped++
      continue
    }
    cleanedLines.push(line)
  }

  let result = cleanedLines.join('\n')

  // Track preserved tokens
  const { text: markedText, tokens } = extractPreservedTokens(result)
  const preservedTokens = tokens.length

  // Track word fixes (approximate by checking known patterns)
  let wordsFixed = 0
  for (const [, pattern] of Object.entries(KNOWN_WORD_FIXES)) {
    const matches = markedText.match(pattern)
    if (matches) {
      wordsFixed += matches.length
    }
  }

  // Apply fixes
  let processed = fixKnownWords(markedText)
  processed = mergeSpacedLetters(processed)

  // Count syllable merges (approximate)
  const beforeSyllables = processed
  processed = mergeSpacedSyllables(processed)
  const syllablesMerged = Math.max(
    0,
    (beforeSyllables.match(/\s/g) || []).length - (processed.match(/\s/g) || []).length
  )

  // Restore and clean
  result = restorePreservedTokens(processed, tokens)
  result = result.replace(/[^\S\n]+/g, ' ')
  result = result
    .split('\n')
    .map((line) => line.trim())
    .join('\n')

  return {
    text: result,
    stats: {
      linesDropped,
      wordsFixed,
      syllablesMerged,
      preservedTokens,
      originalLength,
      normalizedLength: result.length,
    },
  }
}

/**
 * Check if text needs normalization
 */
export function needsNormalization(text: string): boolean {
  // Check for garbage patterns
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(text)) return true
  }

  // Check for spaced Turkish letters
  const spacedLetterPattern = new RegExp(
    `[${TURKISH_UPPER}]\\s+[${TURKISH_UPPER}]\\s+[${TURKISH_UPPER}]`,
    'g'
  )
  if (spacedLetterPattern.test(text)) return true

  // Check for known word patterns that need fixing
  for (const [, pattern] of Object.entries(KNOWN_WORD_FIXES)) {
    if (pattern.test(text)) return true
  }

  return false
}
