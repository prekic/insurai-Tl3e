/**
 * Section Normalizer (Step 1 of Pipeline)
 *
 * Takes raw OCR/PDF text and produces normalized text with section markers.
 * Preserves original text and adds structural information for extraction.
 *
 * Output:
 * - rawText: Original unchanged
 * - normalizedText: Cleaned with section markers
 * - sectionMarkers: Array of detected sections
 * - warnings: Issues found during normalization
 */

import type {
  NormalizationResult,
  SectionMarker,
  NormalizationWarning,
} from '@/types/extraction-pipeline'

// ============================================================================
// SECTION PATTERNS
// ============================================================================

/**
 * Known section headers in Turkish insurance documents
 */
const SECTION_PATTERNS: {
  pattern: RegExp
  section: string
  sectionTr: string
  priority: number
}[] = [
  // High priority - major sections
  {
    pattern: /^[\s]*(?:A\.|I\.|\d+\.)?[\s]*TEMİNAT(?:LAR)?[\s]*$/im,
    section: 'COVERAGES',
    sectionTr: 'TEMİNATLAR',
    priority: 1,
  },
  {
    pattern: /^[\s]*(?:B\.|II\.|\d+\.)?[\s]*(?:ÖZEL\s+)?ŞARTLAR[\s]*$/im,
    section: 'CONDITIONS',
    sectionTr: 'ÖZEL ŞARTLAR',
    priority: 1,
  },
  {
    pattern: /^[\s]*(?:C\.|III\.|\d+\.)?[\s]*İSTİSNA(?:LAR)?[\s]*$/im,
    section: 'EXCLUSIONS',
    sectionTr: 'İSTİSNALAR',
    priority: 1,
  },
  {
    pattern: /^[\s]*(?:D\.|IV\.|\d+\.)?[\s]*GENEL\s+ŞARTLAR[\s]*$/im,
    section: 'GENERAL_CONDITIONS',
    sectionTr: 'GENEL ŞARTLAR',
    priority: 1,
  },
  {
    pattern: /^[\s]*ARAÇ\s+BİLGİLERİ[\s]*$/im,
    section: 'VEHICLE_INFO',
    sectionTr: 'ARAÇ BİLGİLERİ',
    priority: 1,
  },
  {
    pattern: /^[\s]*SİGORTALI\s+BİLGİLERİ[\s]*$/im,
    section: 'INSURED_INFO',
    sectionTr: 'SİGORTALI BİLGİLERİ',
    priority: 1,
  },
  {
    pattern: /^[\s]*PRİM\s+(?:BİLGİLERİ|DETAYLARI|TABLOSU)[\s]*$/im,
    section: 'PREMIUM_INFO',
    sectionTr: 'PRİM BİLGİLERİ',
    priority: 1,
  },

  // Medium priority - common subsections
  {
    pattern: /^[\s]*KLOZ(?:LAR)?[\s]*$/im,
    section: 'CLAUSES',
    sectionTr: 'KLOZLAR',
    priority: 2,
  },
  {
    pattern: /^[\s]*EK\s+(?:SÖZLEŞME|TEMİNAT(?:LAR)?|BİLGİLER?)[\s]*$/im,
    section: 'ENDORSEMENTS',
    sectionTr: 'EK TEMINATLAR',
    priority: 2,
  },
  {
    pattern: /^[\s]*MUAFİYET(?:LER)?[\s]*$/im,
    section: 'DEDUCTIBLES',
    sectionTr: 'MUAFİYETLER',
    priority: 2,
  },
  {
    pattern: /^[\s]*(?:ÖDEME|TAKSİT)\s+(?:PLANI|BİLGİLERİ)[\s]*$/im,
    section: 'PAYMENT_PLAN',
    sectionTr: 'ÖDEME PLANI',
    priority: 2,
  },
  {
    pattern: /^[\s]*(?:HASAR|TAZMİNAT)\s+(?:PROSEDÜRÜ|BİLGİLERİ)[\s]*$/im,
    section: 'CLAIMS_INFO',
    sectionTr: 'HASAR BİLGİLERİ',
    priority: 2,
  },

  // Lower priority - structural markers
  {
    pattern: /^[\s]*POLİÇE\s+(?:BİLGİLERİ|ÖZETİ)[\s]*$/im,
    section: 'POLICY_SUMMARY',
    sectionTr: 'POLİÇE ÖZETİ',
    priority: 3,
  },
  {
    pattern: /^[\s]*(?:SİGORTA\s+)?ŞİRKET(?:İ)?\s+BİLGİLERİ[\s]*$/im,
    section: 'COMPANY_INFO',
    sectionTr: 'ŞİRKET BİLGİLERİ',
    priority: 3,
  },
  {
    pattern: /^[\s]*ACİL\s+(?:NUMARALAR|İLETİŞİM|YARDIM)[\s]*$/im,
    section: 'EMERGENCY_CONTACTS',
    sectionTr: 'ACİL NUMARALAR',
    priority: 3,
  },
]

/**
 * Page break patterns
 */
const PAGE_BREAK_PATTERNS = [
  /^[\s]*-{3,}[\s]*(?:Sayfa|Page)[\s]*(\d+)[\s]*-{3,}[\s]*$/gim,
  /^[\s]*(?:Sayfa|Page)[\s]*(\d+)[\s]*(?:\/|of)?[\s]*\d*[\s]*$/gim,
  /^\f/gm, // Form feed character
  /^[\s]*={5,}[\s]*$/gm, // Long equals line
]

/**
 * OCR artifact patterns to clean
 */
const GARBAGE_PATTERNS = [
  // Binary data - intentionally matching control characters
  // eslint-disable-next-line no-control-regex
  /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
  // Long sequences of special characters
  /[^\S\n]{20,}/g,
  // QR/barcode artifacts
  /(?:^|\n)[█▀▄▌▐░▒▓■□▪▫●○◆◇]+(?:\n|$)/g,
  // Repeated single characters
  /(.)\1{10,}/g,
]

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Remove OCR garbage while preserving important content
 */
function cleanGarbage(text: string): { cleaned: string; removedCount: number } {
  let cleaned = text
  let removedCount = 0

  for (const pattern of GARBAGE_PATTERNS) {
    const before = cleaned.length
    cleaned = cleaned.replace(pattern, ' ')
    removedCount += before - cleaned.length
  }

  return { cleaned, removedCount }
}

/**
 * Normalize whitespace without changing meaningful content
 */
function normalizeWhitespace(text: string): string {
  // Normalize line endings
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Remove trailing whitespace from lines
  normalized = normalized.replace(/[ \t]+$/gm, '')

  // Collapse multiple blank lines to double
  normalized = normalized.replace(/\n{4,}/g, '\n\n\n')

  // Remove leading/trailing whitespace from document
  normalized = normalized.trim()

  return normalized
}

/**
 * Detect and mark page breaks
 */
function detectPageBreaks(
  text: string
): { text: string; pageBreaks: { line: number; pageNumber: number }[] } {
  const pageBreaks: { line: number; pageNumber: number }[] = []
  let pageNumber = 1

  const lines = text.split('\n')
  const processedLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    for (const pattern of PAGE_BREAK_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        if (match[1]) {
          pageNumber = parseInt(match[1], 10)
        } else {
          pageNumber++
        }
        pageBreaks.push({ line: i + 1, pageNumber })
        // Replace with standardized marker
        line = `\n--- PAGE ${pageNumber} ---\n`
        break
      }
    }

    processedLines.push(line)
  }

  return {
    text: processedLines.join('\n'),
    pageBreaks,
  }
}

/**
 * Detect section headers and add markers
 */
function detectSections(text: string): { text: string; markers: SectionMarker[] } {
  const markers: SectionMarker[] = []
  const lines = text.split('\n')
  const processedLines: string[] = []

  let currentPage = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // Track page numbers
    const pageMatch = line.match(/--- PAGE (\d+) ---/)
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10)
    }

    // Check for section headers
    let foundSection = false
    for (const { pattern, section, sectionTr, priority } of SECTION_PATTERNS) {
      if (pattern.test(line)) {
        // Close previous section
        if (markers.length > 0 && markers[markers.length - 1].endLine === 0) {
          markers[markers.length - 1].endLine = lineNumber - 1
        }

        markers.push({
          section,
          sectionTr,
          startLine: lineNumber,
          endLine: 0, // Will be set when next section starts
          pageNumber: currentPage,
          confidence: priority === 1 ? 0.95 : priority === 2 ? 0.85 : 0.75,
        })

        // Add section marker to output
        processedLines.push(`[SECTION:${section}]`)
        processedLines.push(line)
        foundSection = true
        break
      }
    }

    if (!foundSection) {
      processedLines.push(line)
    }
  }

  // Close last section
  if (markers.length > 0 && markers[markers.length - 1].endLine === 0) {
    markers[markers.length - 1].endLine = lines.length
  }

  return {
    text: processedLines.join('\n'),
    markers,
  }
}

/**
 * Fix common Turkish OCR spacing issues
 * e.g., "B İ RLE Şİ K" → "BİRLEŞİK"
 */
function fixTurkishSpacing(text: string): { text: string; fixCount: number } {
  let fixCount = 0
  let result = text

  // Fix all-caps spaced words (e.g., "B İ R L E Ş İ K" → "BİRLEŞİK")
  const fixSpacedCaps = (match: string): string => {
    const fixed = match.replace(/\s+/g, '')
    if (fixed !== match) fixCount++
    return fixed
  }

  // First pass: fix obvious all-caps spacing
  result = result.replace(/\b([A-ZÇĞİÖŞÜ](?:\s+[A-ZÇĞİÖŞÜ]){2,})\b/g, fixSpacedCaps)

  // Common Turkish insurance words with OCR spacing issues
  const turkishWords: Record<string, RegExp> = {
    POLİÇE: /P\s*[O0]\s*L\s*[İI]\s*[ÇC]\s*E/gi,
    SİGORTA: /S\s*[İI]\s*G\s*[O0]\s*R\s*T\s*A/gi,
    TEMİNAT: /T\s*E\s*M\s*[İI]\s*N\s*A\s*T/gi,
    MUAFİYET: /M\s*U\s*A\s*F\s*[İI]\s*Y\s*E\s*T/gi,
    ARAÇ: /A\s*R\s*A\s*[ÇC]/gi,
    KASKO: /K\s*A\s*S\s*K\s*[O0]/gi,
    PRİM: /P\s*R\s*[İI]\s*M/gi,
    ŞARTLAR: /[ŞS]\s*A\s*R\s*T\s*L\s*A\s*R/gi,
  }

  for (const [correct, pattern] of Object.entries(turkishWords)) {
    const before = result
    result = result.replace(pattern, correct)
    if (result !== before) fixCount++
  }

  return { text: result, fixCount }
}

/**
 * Detect potential issues and generate warnings
 */
function detectWarnings(
  rawText: string,
  normalizedText: string,
  markers: SectionMarker[]
): NormalizationWarning[] {
  const warnings: NormalizationWarning[] = []

  // Check for truncation
  if (rawText.length < 500) {
    warnings.push({
      type: 'truncation',
      message: 'Document appears very short, may be truncated',
      severity: 'high',
    })
  }

  // Check for missing expected sections in Kasko
  const expectedSections = ['COVERAGES', 'VEHICLE_INFO']
  for (const expected of expectedSections) {
    if (!markers.find((m) => m.section === expected)) {
      warnings.push({
        type: 'missing_section',
        message: `Expected section "${expected}" not found`,
        severity: 'medium',
      })
    }
  }

  // Check for garbled text (high ratio of special characters)
  const specialCharRatio =
    (normalizedText.match(/[^\w\s.,;:'"()\-/\\çğıöşüÇĞİÖŞÜ]/g)?.length || 0) /
    normalizedText.length
  if (specialCharRatio > 0.1) {
    warnings.push({
      type: 'garbled_text',
      message: 'High ratio of special characters detected, OCR quality may be poor',
      severity: 'medium',
    })
  }

  // Check for encoding issues (replacement character)
  if (normalizedText.includes('�') || normalizedText.includes('ï¿½')) {
    warnings.push({
      type: 'encoding',
      message: 'Character encoding issues detected',
      severity: 'medium',
    })
  }

  return warnings
}

// ============================================================================
// MAIN NORMALIZATION FUNCTION
// ============================================================================

/**
 * Normalize a document for extraction
 */
export function normalizeDocument(rawText: string): NormalizationResult {
  const startTime = Date.now()

  // Step 1: Clean garbage
  const { cleaned, removedCount } = cleanGarbage(rawText)

  // Step 2: Normalize whitespace
  let normalized = normalizeWhitespace(cleaned)

  // Step 3: Fix Turkish spacing
  const { text: spacingFixed, fixCount: _fixCount } = fixTurkishSpacing(normalized)
  normalized = spacingFixed

  // Step 4: Detect and mark page breaks
  const { text: withPageBreaks, pageBreaks: _pageBreaks } = detectPageBreaks(normalized)
  normalized = withPageBreaks

  // Step 5: Detect sections and add markers
  const { text: withSections, markers } = detectSections(normalized)
  normalized = withSections

  // Step 6: Detect warnings
  const warnings = detectWarnings(rawText, normalized, markers)

  // Add OCR artifact warning if significant cleanup was done
  if (removedCount > 100) {
    warnings.push({
      type: 'ocr_artifact',
      message: `Removed ${removedCount} characters of OCR artifacts`,
      severity: 'low',
    })
  }

  const processingTimeMs = Date.now() - startTime

  return {
    rawText,
    normalizedText: normalized,
    sectionMarkers: markers,
    warnings,
    stats: {
      originalLength: rawText.length,
      normalizedLength: normalized.length,
      sectionsIdentified: markers.length,
      warningsCount: warnings.length,
      processingTimeMs,
    },
  }
}

/**
 * Extract text from a specific section
 */
export function extractSection(
  normalizedText: string,
  sectionName: string,
  markers: SectionMarker[]
): string | null {
  const marker = markers.find((m) => m.section === sectionName)
  if (!marker) return null

  const lines = normalizedText.split('\n')
  const sectionLines = lines.slice(marker.startLine - 1, marker.endLine)

  return sectionLines.join('\n')
}

/**
 * Get all text with line numbers for evidence mapping
 */
export function getTextWithLineNumbers(normalizedText: string): string {
  const lines = normalizedText.split('\n')
  return lines.map((line, i) => `${(i + 1).toString().padStart(4, ' ')} | ${line}`).join('\n')
}

/**
 * Find line number for a text snippet
 */
export function findLineNumber(normalizedText: string, snippet: string): number | null {
  const lines = normalizedText.split('\n')

  // First try exact match
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(snippet)) {
      return i + 1
    }
  }

  // Try case-insensitive
  const snippetLower = snippet.toLowerCase()
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(snippetLower)) {
      return i + 1
    }
  }

  return null
}
