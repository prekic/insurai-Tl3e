/**
 * PDF Text Noise Stripper
 *
 * Removes barcode artifacts, control characters, and other noise
 * from extracted PDF text while preserving meaningful content.
 */

export interface NoiseStrippingResult {
  /** Cleaned text */
  text: string
  /** Number of lines removed */
  linesRemoved: number
  /** Number of characters removed */
  charsRemoved: number
  /** Types of noise detected */
  noiseTypes: string[]
}

/**
 * Remove barcode/QR code noise and control characters from text
 */
export function stripBarcodeNoise(text: string): NoiseStrippingResult {
  const originalLength = text.length
  const originalLines = text.split('\n')
  const noiseTypes = new Set<string>()

  const cleanLines: string[] = []

  for (const line of originalLines) {
    const trimmedLine = line.trim()

    // Skip empty lines (but preserve some structure)
    if (trimmedLine.length === 0) {
      // Keep empty line if previous line was meaningful
      if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim().length > 0) {
        cleanLines.push('')
      }
      continue
    }

    // Check printable ratio
    const printableChars = trimmedLine.replace(
      /[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F]/g,
      ''
    )
    const printableRatio = printableChars.length / trimmedLine.length

    // Skip lines with too many non-printable characters
    if (printableRatio < 0.7 && trimmedLine.length > 3) {
      noiseTypes.add('non-printable')
      continue
    }

    // Skip lines with barcode-like patterns
    if (/\^{3,}/.test(trimmedLine)) {
      noiseTypes.add('caret-sequence')
      continue
    }

    // Skip lines that are mostly special characters
    if (/^[!@#$%^&*()_+=[\]{}|\\:;"'<>,.?/~`\s]+$/.test(trimmedLine)) {
      noiseTypes.add('special-chars-only')
      continue
    }

    // Skip lines with card suit symbols and block characters (common barcode artifacts)
    if (/[♠♣♦♥█▀▄░▒▓]{2,}/.test(trimmedLine)) {
      noiseTypes.add('block-chars')
      continue
    }

    // Skip lines with excessive repetition (e.g., "BBBBBBBB" or "========")
    // But allow valid repeated chars like "---" separators if short
    if (/(.)\1{7,}/.test(trimmedLine) && trimmedLine.length > 10) {
      noiseTypes.add('repetitive')
      continue
    }

    // Skip lines that look like binary/hex dumps
    if (
      /^[0-9A-Fa-f\s]{20,}$/.test(trimmedLine) &&
      !/[gGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ]/.test(trimmedLine)
    ) {
      noiseTypes.add('hex-dump')
      continue
    }

    // Keep the line, but clean it
    let cleanedLine = trimmedLine

    // Remove control characters (but keep Turkish chars)
    // eslint-disable-next-line no-control-regex
    cleanedLine = cleanedLine.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '')

    // Remove isolated caret sequences
    cleanedLine = cleanedLine.replace(/\^+/g, '')

    // Remove excessive whitespace
    cleanedLine = cleanedLine.replace(/\s{3,}/g, '  ')

    // Only add if there's meaningful content left
    if (cleanedLine.trim().length > 0) {
      cleanLines.push(cleanedLine)
    }
  }

  const cleanedText = cleanLines.join('\n')
  const linesRemoved =
    originalLines.length - cleanLines.filter((l) => l.length > 0 || l === '').length
  const charsRemoved = originalLength - cleanedText.length

  return {
    text: cleanedText,
    linesRemoved,
    charsRemoved,
    noiseTypes: Array.from(noiseTypes),
  }
}

/**
 * Remove control characters while preserving text structure
 */
export function stripControlCharacters(text: string): string {
  // Remove C0 control chars except tab, newline, carriage return
  // Remove C1 control chars entirely
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // C0 except \t \n \r

      .replace(/[\x7f-\x9f]/g, '')
  ) // C1 control chars
}

/**
 * Attempt to fix glyph-split Turkish words
 * This is a best-effort heuristic for common patterns
 */
export function fixGlyphSplitTurkish(text: string): string {
  // Common Turkish words that get split
  let result = text

  // Generic fix: collapse sequences of single letters separated by exactly one space or tab
  // This correctly merges glyph-split words of any length (>10 characters)
  // while preserving multiple spaces that delimit distinct words.
  result = result.replace(
    /(?<=[^A-ZÇĞİÖŞÜa-zçğıöşü]|^)[A-ZÇĞİÖŞÜ](?:[ \t][A-ZÇĞİÖŞÜ]){2,}(?=[^A-ZÇĞİÖŞÜa-zçğıöşü]|$)/g,
    (match) => match.replace(/[ \t]/g, '')
  )

  return result
}

/**
 * Full noise cleaning pipeline
 */
export function cleanExtractedText(text: string): NoiseStrippingResult {
  // First strip barcode noise
  const barcodeResult = stripBarcodeNoise(text)

  // Then strip control characters
  let cleanedText = stripControlCharacters(barcodeResult.text)

  // Attempt to fix glyph splits
  cleanedText = fixGlyphSplitTurkish(cleanedText)

  // Final cleanup: normalize whitespace
  cleanedText = cleanedText
    .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim()

  return {
    text: cleanedText,
    linesRemoved: barcodeResult.linesRemoved,
    charsRemoved: text.length - cleanedText.length,
    noiseTypes: barcodeResult.noiseTypes,
  }
}
