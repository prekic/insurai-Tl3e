import type { Policy, DuplicatePolicy } from '@/types/policy'
import { parseTurkishDate } from './ai/turkish-utils'

/**
 * Time threshold for considering a policy as "new" (in milliseconds)
 * Default: 24 hours
 */
const NEW_POLICY_THRESHOLD_MS = 24 * 60 * 60 * 1000

/**
 * Tolerance threshold for numeric comparisons (handles AI extraction variance)
 * 2% tolerance - e.g., ₺5,153,000 vs ₺5,203,000 (1% diff) would be considered same
 */
const NUMERIC_TOLERANCE_PERCENT = 0.02

// ============================================================================
// SEDDK STANDARD LIMIT PAIRS (Traffic Insurance - ZMSS)
// AI sometimes extracts per-unit limits, sometimes per-accident limits
// Both are valid representations of the same coverage
// ============================================================================

/**
 * SEDDK 2025 traffic insurance (ZMSS) standard limits
 * Per-unit (kişi/araç başı) and per-accident (kaza başı) limit pairs
 * These are official limits set by SEDDK and updated annually
 */
const SEDDK_LIMIT_PAIRS: Array<{ perUnit: number; perAccident: number; name: string }> = [
  // Maddi Hasar (Material Damage) - 2025 limits
  { perUnit: 300000, perAccident: 600000, name: 'maddi_hasar' },
  // Ölüm ve Sürekli Sakatlık (Death and Permanent Disability) - 2025 limits
  { perUnit: 2700000, perAccident: 13500000, name: 'olum_sakatlik' },
  // Sağlık Giderleri (Medical Expenses) - 2025 limits
  { perUnit: 2700000, perAccident: 13500000, name: 'saglik_giderleri' },
]

/**
 * Total coverage calculation varies based on whether AI uses per-unit or per-accident limits
 * Per-unit sum:    300K + 2.7M + 2.7M = 5.7M
 * Per-accident sum: 600K + 13.5M + 13.5M = 27.6M
 * These represent the SAME policy
 */
const SEDDK_TOTAL_COVERAGE_EQUIVALENTS = [{ perUnitTotal: 5700000, perAccidentTotal: 27600000 }]

/**
 * Check if two limit values are SEDDK equivalent (per-unit ↔ per-accident)
 * Returns true if both are valid representations of the same coverage limit
 */
export function areLimitsSDKEquivalent(limitA: number, limitB: number): boolean {
  if (limitA === limitB) return true

  // Sort to always compare smaller vs larger
  const [smaller, larger] = limitA < limitB ? [limitA, limitB] : [limitB, limitA]

  // Check against SEDDK pairs
  for (const pair of SEDDK_LIMIT_PAIRS) {
    // Allow 5% tolerance for minor extraction differences
    const perUnitMatch = numbersEqualWithTolerance(smaller, pair.perUnit, 0.05)
    const perAccidentMatch = numbersEqualWithTolerance(larger, pair.perAccident, 0.05)
    if (perUnitMatch && perAccidentMatch) {
      return true
    }
  }

  return false
}

/**
 * Check if two total coverage values are SEDDK equivalent
 * (one calculated from per-unit limits, other from per-accident limits)
 */
export function areTotalCoveragesSDKEquivalent(coverageA: number, coverageB: number): boolean {
  if (numbersEqualWithTolerance(coverageA, coverageB, 0.05)) return true

  const [smaller, larger] = coverageA < coverageB ? [coverageA, coverageB] : [coverageB, coverageA]

  for (const pair of SEDDK_TOTAL_COVERAGE_EQUIVALENTS) {
    const perUnitMatch = numbersEqualWithTolerance(smaller, pair.perUnitTotal, 0.1)
    const perAccidentMatch = numbersEqualWithTolerance(larger, pair.perAccidentTotal, 0.1)
    if (perUnitMatch && perAccidentMatch) {
      return true
    }
  }

  return false
}

// ============================================================================
// NORMALIZATION FUNCTIONS - Handle variations in extracted data
// ============================================================================

/**
 * Normalize number for comparison (round to integer to handle float precision)
 */
export function normalizeNumber(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return null
  return Math.round(num)
}

/**
 * Check if two numbers are "equal" within tolerance (for handling AI extraction variance)
 * Returns true if the difference is within NUMERIC_TOLERANCE_PERCENT (default 2%)
 * This handles cases where AI extracts slightly different values from same document
 *
 * @example
 * numbersEqualWithTolerance(5153000, 5203000) // true (0.97% diff < 2%)
 * numbersEqualWithTolerance(100000, 200000)   // false (100% diff > 2%)
 */
export function numbersEqualWithTolerance(
  a: number | null,
  b: number | null,
  tolerancePercent: number = NUMERIC_TOLERANCE_PERCENT
): boolean {
  // Both null = equal
  if (a === null && b === null) return true
  // One null = not equal
  if (a === null || b === null) return false
  // Both zero = equal
  if (a === 0 && b === 0) return true

  // Calculate percentage difference relative to the larger value
  const maxValue = Math.max(Math.abs(a), Math.abs(b))
  if (maxValue === 0) return true

  const diff = Math.abs(a - b)
  const percentDiff = diff / maxValue

  return percentDiff <= tolerancePercent
}

/**
 * Normalize date for comparison (parse to timestamp)
 * Handles: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY formats
 */
export function normalizeDate(value: string | Date | undefined | null): number | null {
  if (!value) return null

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.getTime()
  }

  // Use parseTurkishDate first to avoid V8 DD.MM.YYYY day/month swap (gotcha #52)
  const parsed = parseTurkishDate(value)
  if (parsed) {
    return new Date(parsed + 'T00:00:00Z').getTime()
  }

  // Fallback to Date constructor for other formats (ISO datetimes, etc.)
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date.getTime()
}

/**
 * Normalize string for comparison (trim + lowercase)
 */
export function normalizeString(value: string | undefined | null): string {
  if (!value) return ''
  return value.trim().toLowerCase()
}

/**
 * Normalize string for comparison with whitespace and punctuation tolerance
 * - Collapses multiple whitespace to single space
 * - Normalizes common punctuation variations (colon spacing, slash spacing)
 * - Removes extra spaces around punctuation
 */
export function normalizeStringTolerant(value: string | undefined | null): string {
  if (!value) return ''
  return (
    value
      .trim()
      .toLowerCase()
      // Collapse multiple spaces to single space
      .replace(/\s+/g, ' ')
      // Normalize colon spacing (": " or " :" or " : " all become ": ")
      .replace(/\s*:\s*/g, ':')
      // Normalize slash spacing ("/ " or " /" or " / " all become "/")
      .replace(/\s*\/\s*/g, '/')
      // Normalize comma spacing
      .replace(/\s*,\s*/g, ',')
      // Normalize period spacing in addresses
      .replace(/\s*\.\s*/g, '.')
      // Final trim
      .trim()
  )
}

/**
 * Normalize policy number (case-insensitive, remove whitespace)
 */
export function normalizePolicyNumber(value: string | undefined | null): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

// ============================================================================
// FUZZY MATCHING FOR OCR ERRORS
// ============================================================================

/**
 * Common OCR character substitutions
 * Maps visually similar characters that OCR often confuses
 */
const OCR_SUBSTITUTIONS: Record<string, string> = {
  '0': 'o',
  o: 'o',
  О: 'o', // Cyrillic O
  '1': 'i',
  l: 'i',
  I: 'i',
  ı: 'i', // Turkish dotless i
  İ: 'i', // Turkish capital I with dot
  '5': 's',
  s: 's',
  ş: 's', // Turkish ş
  Ş: 's',
  '8': 'b',
  b: 'b',
  ğ: 'g', // Turkish ğ
  Ğ: 'g',
  ö: 'o', // Turkish ö
  Ö: 'o',
  ü: 'u', // Turkish ü
  Ü: 'u',
  ç: 'c', // Turkish ç
  Ç: 'c',
  а: 'a', // Cyrillic а
  е: 'e', // Cyrillic е
  р: 'p', // Cyrillic р
  с: 'c', // Cyrillic с
  у: 'y', // Cyrillic у
  х: 'x', // Cyrillic х
}

/**
 * OCR error patterns specific to Turkish insurance documents
 * These are common misreadings from scanned Turkish policies
 */
const OCR_ERROR_CORRECTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  // Turkish currency symbol variations
  { pattern: /TL\s*\./gi, replacement: 'TL' },
  { pattern: /T\.L\./gi, replacement: 'TL' },
  { pattern: /\bTI\b/g, replacement: 'TL' }, // OCR misreads TL as TI

  // Common Turkish insurance terms OCR errors
  { pattern: /POL[İI1l]CE/gi, replacement: 'POLICE' },
  { pattern: /S[İI1l]GORTA/gi, replacement: 'SIGORTA' },
  { pattern: /TEM[İI1l]NAT/gi, replacement: 'TEMINAT' },
  { pattern: /PR[İI1l]M/gi, replacement: 'PRIM' },
  { pattern: /TAR[İI1l]H/gi, replacement: 'TARIH' },
  { pattern: /MUAF[İI1l]YET/gi, replacement: 'MUAFIYET' },
  { pattern: /ZEY[İI1l]LNAME/gi, replacement: 'ZEYILNAME' },

  // Number/letter confusions in policy numbers
  { pattern: /([A-Z])-?O([0-9])/gi, replacement: '$1-0$2' }, // O after letter is likely 0
  { pattern: /([0-9])-?O([A-Z])/gi, replacement: '$1-0$2' }, // O before letter is likely 0
  { pattern: /([0-9])l([0-9])/g, replacement: '$11$2' }, // l between numbers is likely 1
  { pattern: /([0-9])I([0-9])/g, replacement: '$11$2' }, // I between numbers is likely 1

  // Whitespace normalization
  { pattern: /\s+/g, replacement: ' ' },
  { pattern: /\n\s*\n/g, replacement: '\n' },
]

/**
 * Normalize OCR text BEFORE sending to AI extraction
 * This ensures deterministic input for consistent AI output
 *
 * Unlike normalizeForOCR (used for comparison), this preserves
 * the text structure and only fixes clear OCR errors
 */
export function normalizeOCRTextForExtraction(text: string): string {
  if (!text) return ''

  let normalized = text

  // Apply OCR error corrections
  for (const { pattern, replacement } of OCR_ERROR_CORRECTIONS) {
    normalized = normalized.replace(pattern, replacement)
  }

  // Normalize Turkish currency amounts (ensure consistent format)
  // "1.234.567,89 TL" or "1,234,567.89 TL" -> consistent format
  normalized = normalized.replace(/(\d{1,3})\.(\d{3})\.(\d{3}),(\d{2})/g, '$1$2$3.$4')

  // Normalize dates to ISO-like format for consistency
  // "15.01.2026" -> "15.01.2026" (keep as-is, just ensure consistency)
  // "15/01/2026" -> "15.01.2026"
  normalized = normalized.replace(/(\d{2})\/(\d{2})\/(\d{4})/g, '$1.$2.$3')

  return normalized.trim()
}

/**
 * Generate a deterministic hash from OCR text for duplicate detection
 * This should be called on the raw OCR output BEFORE AI extraction
 */
export function generateOCRTextHash(text: string): string {
  // Normalize aggressively for hash comparison
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '') // Remove all punctuation
    .trim()

  // Simple hash (same as generateDocumentHash but more aggressive normalization)
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }

  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Normalize string for OCR-tolerant comparison
 * Converts visually similar characters to a canonical form
 */
export function normalizeForOCR(value: string): string {
  if (!value) return ''

  return value
    .toLowerCase()
    .split('')
    .map((char) => OCR_SUBSTITUTIONS[char] || char)
    .join('')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '') // Remove special chars for comparison
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of identifiers
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0

  const distance = levenshteinDistance(a, b)
  const maxLength = Math.max(a.length, b.length)

  return 1 - distance / maxLength
}

/**
 * Check if two strings match with OCR tolerance
 * Returns true if strings are likely the same despite OCR errors
 */
export function fuzzyMatchOCR(a: string, b: string, threshold: number = 0.85): boolean {
  if (!a && !b) return true
  if (!a || !b) return false

  // First try exact match after normalization
  const normA = normalizeForOCR(a)
  const normB = normalizeForOCR(b)

  if (normA === normB) return true

  // For short strings, require higher similarity
  const minLength = Math.min(normA.length, normB.length)
  const adjustedThreshold = minLength < 5 ? 0.9 : threshold

  // Check similarity
  const similarity = stringSimilarity(normA, normB)

  return similarity >= adjustedThreshold
}

// ============================================================================
// TOLERANCE-BASED COMPARISON
// ============================================================================

/**
 * Compare two values with tolerance based on type
 */
function compareTolerant(a: unknown, b: unknown, type: 'number' | 'date' | 'string'): boolean {
  if (type === 'number') {
    return normalizeNumber(a as number) === normalizeNumber(b as number)
  }
  if (type === 'date') {
    return normalizeDate(a as string) === normalizeDate(b as string)
  }
  return normalizeString(a as string) === normalizeString(b as string)
}

/**
 * Normalize an array item for comparison
 * Handles objects with name/description fields or strings
 */
function normalizeArrayItem(item: unknown): string {
  if (!item) return ''
  if (typeof item === 'string') {
    return normalizeStringTolerant(item)
  }
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>
    // Handle coverage/exclusion objects with name and description
    const name = normalizeStringTolerant(String(obj.name || obj.title || ''))
    const desc = normalizeStringTolerant(String(obj.description || obj.value || ''))
    return `${name}|${desc}`
  }
  return String(item).toLowerCase()
}

/**
 * Compare two arrays with tolerance for:
 * - Different ordering
 * - Minor text differences (whitespace, punctuation)
 * Returns true if arrays are effectively the same
 */
export function arraysEqualTolerant(
  a: unknown[] | undefined | null,
  b: unknown[] | undefined | null
): boolean {
  // Both empty/null
  if (!a?.length && !b?.length) return true
  // One empty, one not
  if (!a?.length || !b?.length) return false
  // Different lengths = different
  if (a.length !== b.length) return false

  // Normalize and sort for comparison
  const normalizedA = a.map(normalizeArrayItem).sort()
  const normalizedB = b.map(normalizeArrayItem).sort()

  // Compare normalized arrays
  for (let i = 0; i < normalizedA.length; i++) {
    // Use fuzzy matching for each item (allows for OCR errors)
    if (!fuzzyMatchOCR(normalizedA[i], normalizedB[i], 0.9)) {
      return false
    }
  }

  return true
}

// ============================================================================
// DOCUMENT HASH FOR DUPLICATE DETECTION
// ============================================================================

/**
 * Generate a simple hash from text content for duplicate detection
 * This is used to identify re-uploads of the same document
 */
export function generateDocumentHash(text: string): string {
  // Normalize text: remove extra whitespace, lowercase
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()

  // Simple hash using string reduction (not cryptographic, but fast)
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Check if two document hashes match (indicating same document)
 */
export function documentHashesMatch(hash1?: string, hash2?: string): boolean {
  if (!hash1 || !hash2) return false
  return hash1 === hash2
}

// ============================================================================
// SMART COVERAGE ARRAY COMPARISON
// ============================================================================

interface CoverageItem {
  name?: string
  nameTr?: string
  limit?: number
  deductible?: number
  description?: string
  included?: boolean
}

/**
 * Extract normalized name from a coverage item for matching
 */
function extractCoverageName(item: unknown): string {
  if (!item) return ''
  if (typeof item === 'string') return normalizeStringTolerant(item)

  const obj = item as CoverageItem
  const name = obj.name || obj.nameTr || ''
  return normalizeStringTolerant(String(name))
}

/**
 * Smart coverage comparison that matches items by NAME, ignoring:
 * - Description differences (AI often paraphrases)
 * - Property order differences
 * - Different number of items IF names match
 *
 * Returns true if coverages are "effectively the same" (same core coverages)
 *
 * IMPORTANT: This is LENIENT to avoid false positives on extraction variance.
 * Real changes (new coverage added, limit changed significantly) will still be detected.
 */
export function coveragesEqualSmart(
  a: unknown[] | undefined | null,
  b: unknown[] | undefined | null,
  options: { tolerantMode?: boolean } = {}
): boolean {
  const { tolerantMode = true } = options

  // Both empty = equal
  if (!a?.length && !b?.length) return true
  // One empty, one not = different (this is a real change)
  if (!a?.length || !b?.length) return false

  // Extract names from both arrays
  const namesA = a.map(extractCoverageName).filter((n) => n.length > 0)
  const namesB = b.map(extractCoverageName).filter((n) => n.length > 0)

  // In tolerant mode, we care about:
  // 1. Whether the same coverage NAMES exist (fuzzy match)
  // 2. Whether limits/deductibles are significantly different
  if (tolerantMode) {
    // Try to match each item in A to an item in B by name
    const usedB = new Set<number>()

    for (let iA = 0; iA < namesA.length; iA++) {
      const nameA = namesA[iA]
      let found = false
      for (let j = 0; j < namesB.length; j++) {
        if (usedB.has(j)) continue

        // Fuzzy match on name (0.85 threshold)
        if (fuzzyMatchOCR(nameA, namesB[j], 0.85)) {
          found = true
          usedB.add(j)

          // Check if limits/deductibles differ significantly
          const itemA = a[iA] as CoverageItem
          const itemB = b[j] as CoverageItem

          // If limit differs, check if it's a SEDDK per-unit vs per-accident difference
          // For traffic insurance, 300K vs 600K and 2.7M vs 13.5M are equivalent limits
          if (itemA?.limit !== undefined && itemB?.limit !== undefined) {
            const limitsMatch =
              numbersEqualWithTolerance(itemA.limit, itemB.limit, 0.1) ||
              areLimitsSDKEquivalent(itemA.limit, itemB.limit)
            if (!limitsMatch) {
              return false
            }
          }

          // If deductible differs significantly, flag
          if (itemA?.deductible !== undefined && itemB?.deductible !== undefined) {
            if (!numbersEqualWithTolerance(itemA.deductible, itemB.deductible, 0.2)) {
              return false
            }
          }

          break
        }
      }

      // If we couldn't find a match, check if it's a significant coverage
      if (!found && nameA.length > 2) {
        // Very short names (1-2 chars) might be parsing artifacts, ignore them
        // But missing significant coverages = different
        return false
      }
    }

    // Check if B has coverages not in A (new coverages added)
    for (let j = 0; j < namesB.length; j++) {
      if (usedB.has(j)) continue
      if (namesB[j].length > 2) {
        // New significant coverage = different
        return false
      }
    }

    return true
  }

  // Strict mode: use original comparison
  return arraysEqualTolerant(a, b)
}

/**
 * Smart string array comparison (for exclusions, conditions)
 * More lenient: considers arrays equal if:
 * 1. >70% of items fuzzy match, OR
 * 2. Combined text is semantically equivalent (split/merged differently)
 */
export function stringsArrayEqualSmart(
  a: string[] | undefined | null,
  b: string[] | undefined | null,
  options: { tolerantMode?: boolean } = {}
): boolean {
  const { tolerantMode = true } = options

  // Both empty = equal
  if (!a?.length && !b?.length) return true
  // One empty, one not = different
  if (!a?.length || !b?.length) return false

  if (tolerantMode) {
    // Normalize all strings
    const normalizedA = a.map(normalizeStringTolerant).filter((s) => s.length > 10)
    const normalizedB = b.map(normalizeStringTolerant).filter((s) => s.length > 10)

    if (normalizedA.length === 0 && normalizedB.length === 0) return true

    // Count matches (allowing fuzzy matching)
    let matchCount = 0
    const usedB = new Set<number>()

    for (const strA of normalizedA) {
      for (let j = 0; j < normalizedB.length; j++) {
        if (usedB.has(j)) continue
        if (fuzzyMatchOCR(strA, normalizedB[j], 0.85)) {
          matchCount++
          usedB.add(j)
          break
        }
      }
    }

    // Consider equal if >70% of significant items match
    const totalItems = Math.max(normalizedA.length, normalizedB.length)
    const matchRatio = matchCount / totalItems

    if (matchRatio >= 0.7) return true

    // FALLBACK: Check if arrays are semantically equivalent (split/merged differently)
    // Only use this fallback when arrays have significantly different lengths
    // (suggesting the same content was split differently)
    const lengthRatio =
      Math.min(normalizedA.length, normalizedB.length) /
      Math.max(normalizedA.length, normalizedB.length)

    // If one array has WAY more items (e.g., 1 vs 3), it might be split/merged content
    // But if lengths are similar (e.g., 1 vs 2), it's likely a real addition
    if (lengthRatio > 0.5) {
      // Lengths are similar - probably not split/merge, likely real change
      return false
    }

    // Lengths differ significantly - check if content is semantically equivalent
    // (one long exclusion split into multiple shorter ones, or vice versa)
    const combinedA = normalizedA.join(' ')
    const combinedB = normalizedB.join(' ')

    // Extract key terms (words >4 chars) and compare
    const keywordsA = new Set(combinedA.split(/\s+/).filter((w) => w.length > 4))
    const keywordsB = new Set(combinedB.split(/\s+/).filter((w) => w.length > 4))

    if (keywordsA.size === 0 && keywordsB.size === 0) return true

    // Count shared keywords
    let sharedKeywords = 0
    for (const word of keywordsA) {
      if (keywordsB.has(word)) sharedKeywords++
    }

    const totalUniqueKeywords = new Set([...keywordsA, ...keywordsB]).size
    const keywordOverlapRatio = totalUniqueKeywords > 0 ? sharedKeywords / totalUniqueKeywords : 1

    // Need high keyword overlap (80%+) for significantly different array lengths
    // This catches cases where one long exclusion is split into multiple shorter ones
    return keywordOverlapRatio >= 0.8
  }

  return arraysEqualTolerant(a, b)
}

// ============================================================================
// POLICY IDENTIFIER MATCHING
// ============================================================================

/**
 * Check if policies have matching identifiers (tolerant comparison with OCR support)
 * Uses: policyNumber + provider + insuredPerson (or location for property)
 *
 * @param a - First policy
 * @param b - Second policy
 * @param useFuzzyMatch - Whether to use fuzzy matching for OCR errors (default: true)
 */
export function isPolicyIdentifierMatch(
  a: Policy,
  b: Policy,
  useFuzzyMatch: boolean = true
): boolean {
  // Check policy number match
  let sameNumber: boolean
  if (useFuzzyMatch) {
    sameNumber = fuzzyMatchOCR(a.policyNumber || '', b.policyNumber || '', 0.85)
  } else {
    sameNumber = normalizePolicyNumber(a.policyNumber) === normalizePolicyNumber(b.policyNumber)
  }

  if (!sameNumber) {
    return false
  }

  // Check provider match (more lenient - just needs to contain similar text)
  let sameProvider: boolean
  if (useFuzzyMatch) {
    sameProvider = fuzzyMatchOCR(a.provider || '', b.provider || '', 0.8)
  } else {
    sameProvider = normalizeString(a.provider) === normalizeString(b.provider)
  }

  if (!sameProvider) {
    return false
  }

  // Also check insured person/item (if available)
  const aInsured = a.insuredPerson || a.location || ''
  const bInsured = b.insuredPerson || b.location || ''

  // If both have insured info, they must match (with fuzzy tolerance)
  // If neither has it, consider it a match (legacy data)
  if (aInsured && bInsured) {
    if (useFuzzyMatch) {
      return fuzzyMatchOCR(aInsured, bInsured, 0.8)
    } else {
      return normalizeString(aInsured) === normalizeString(bInsured)
    }
  }

  return true
}

/**
 * Get similarity score between two policies' identifiers (0-1)
 * Useful for ranking potential matches
 */
export function getPolicyIdentifierSimilarity(a: Policy, b: Policy): number {
  const normA = normalizeForOCR(a.policyNumber || '')
  const normB = normalizeForOCR(b.policyNumber || '')

  const numberSimilarity = stringSimilarity(normA, normB)
  const providerSimilarity = stringSimilarity(
    normalizeForOCR(a.provider || ''),
    normalizeForOCR(b.provider || '')
  )

  const aInsured = a.insuredPerson || a.location || ''
  const bInsured = b.insuredPerson || b.location || ''
  const insuredSimilarity =
    aInsured && bInsured
      ? stringSimilarity(normalizeForOCR(aInsured), normalizeForOCR(bInsured))
      : 1 // If no insured info, don't penalize

  // Weighted average: policy number is most important
  return numberSimilarity * 0.5 + providerSimilarity * 0.3 + insuredSimilarity * 0.2
}

// ============================================================================
// POLICY DIFF CALCULATION
// ============================================================================

export interface PolicyFieldDiff {
  field: string
  fieldLabel: string
  fieldLabelTr: string
  oldValue: unknown
  newValue: unknown
  type: 'number' | 'date' | 'string' | 'array'
  significance: 'critical' | 'major' | 'moderate' | 'minor'
}

/**
 * Field configuration for diff comparison
 */
const DIFF_FIELD_CONFIG: Array<{
  field: keyof Policy
  label: string
  labelTr: string
  type: 'number' | 'date' | 'string' | 'array'
  significance: 'critical' | 'major' | 'moderate' | 'minor'
}> = [
  // Critical - core policy terms
  {
    field: 'coverage',
    label: 'Coverage',
    labelTr: 'Teminat',
    type: 'number',
    significance: 'critical',
  },
  { field: 'premium', label: 'Premium', labelTr: 'Prim', type: 'number', significance: 'critical' },
  {
    field: 'startDate',
    label: 'Start Date',
    labelTr: 'Başlangıç Tarihi',
    type: 'date',
    significance: 'critical',
  },
  {
    field: 'expiryDate',
    label: 'Expiry Date',
    labelTr: 'Bitiş Tarihi',
    type: 'date',
    significance: 'critical',
  },

  // Major - important financial/coverage terms
  {
    field: 'deductible',
    label: 'Deductible',
    labelTr: 'Muafiyet',
    type: 'number',
    significance: 'major',
  },
  {
    field: 'type',
    label: 'Policy Type',
    labelTr: 'Poliçe Türü',
    type: 'string',
    significance: 'major',
  },
  {
    field: 'monthlyPremium',
    label: 'Monthly Premium',
    labelTr: 'Aylık Prim',
    type: 'number',
    significance: 'major',
  },

  // Moderate - policyholder details
  {
    field: 'insuredPerson',
    label: 'Insured Person',
    labelTr: 'Sigortalı',
    type: 'string',
    significance: 'moderate',
  },
  {
    field: 'beneficiary',
    label: 'Beneficiary',
    labelTr: 'Lehdar',
    type: 'string',
    significance: 'moderate',
  },
  {
    field: 'location',
    label: 'Risk Address',
    labelTr: 'Riziko Adresi',
    type: 'string',
    significance: 'moderate',
  },

  // Minor - administrative
  {
    field: 'paymentFrequency',
    label: 'Payment Frequency',
    labelTr: 'Ödeme Sıklığı',
    type: 'string',
    significance: 'minor',
  },
  { field: 'agentName', label: 'Agent', labelTr: 'Acente', type: 'string', significance: 'minor' },
  { field: 'status', label: 'Status', labelTr: 'Durum', type: 'string', significance: 'minor' },
]

/**
 * Fields that should use fuzzy/tolerant matching (typically addresses, names)
 * These fields often have OCR errors or formatting differences
 */
const FUZZY_MATCH_FIELDS = ['location', 'insuredPerson', 'beneficiary', 'agentName']

/**
 * Fields that should use numeric tolerance (for AI extraction variance)
 * These are financial fields where AI might extract slightly different values
 */
const NUMERIC_TOLERANCE_FIELDS = ['coverage', 'premium', 'deductible', 'monthlyPremium']

export interface PolicyDiffOptions {
  /**
   * When true, uses relaxed comparison that tolerates extraction variance:
   * - 2% tolerance for numeric fields (coverage, premium)
   * - Fuzzy matching for text fields
   * - Ignores array length differences within 20%
   *
   * Use tolerant mode when the new document does NOT have amendment markers.
   * Use strict mode (false) when the document HAS amendment markers.
   */
  tolerantMode?: boolean
}

/**
 * Calculate field differences between two policies
 * Returns all fields that have changed
 * Uses tolerant comparison for strings and fuzzy matching for addresses/names
 *
 * @param tolerantMode - When true, applies extra tolerance for AI extraction variance
 */
export function calculatePolicyDiff(
  oldPolicy: Policy,
  newPolicy: Policy,
  options: PolicyDiffOptions = {}
): PolicyFieldDiff[] {
  const { tolerantMode = true } = options
  const diffs: PolicyFieldDiff[] = []

  for (const config of DIFF_FIELD_CONFIG) {
    const oldVal = oldPolicy[config.field]
    const newVal = newPolicy[config.field]

    let areSame: boolean

    if (config.type === 'number') {
      const oldNorm = normalizeNumber(oldVal as number)
      const newNorm = normalizeNumber(newVal as number)

      // Use numeric tolerance for financial fields when in tolerant mode
      if (tolerantMode && NUMERIC_TOLERANCE_FIELDS.includes(config.field)) {
        areSame = numbersEqualWithTolerance(oldNorm, newNorm)

        // Special case for 'coverage' field in traffic insurance
        // AI may calculate total using per-unit OR per-accident limits
        // Both are valid - check SEDDK equivalents
        if (!areSame && config.field === 'coverage' && oldNorm !== null && newNorm !== null) {
          const isTrafficInsurance =
            newPolicy.type === 'traffic' ||
            oldPolicy.type === 'traffic' ||
            newPolicy.typeTr?.toLowerCase().includes('trafik') ||
            oldPolicy.typeTr?.toLowerCase().includes('trafik')

          if (isTrafficInsurance) {
            areSame = areTotalCoveragesSDKEquivalent(oldNorm, newNorm)
          }
        }
      } else {
        areSame = oldNorm === newNorm || (oldNorm === null && newNorm === null)
      }
    } else if (config.type === 'date') {
      const oldNorm = normalizeDate(oldVal as string)
      const newNorm = normalizeDate(newVal as string)
      areSame = oldNorm === newNorm || (oldNorm === null && newNorm === null)
    } else {
      // String comparison - use fuzzy matching for address/name fields
      const oldStr = String(oldVal || '')
      const newStr = String(newVal || '')

      if (!oldStr && !newStr) {
        areSame = true
      } else if (FUZZY_MATCH_FIELDS.includes(config.field)) {
        // Use fuzzy OCR-tolerant matching for addresses and names
        // First check with tolerant string normalization
        const oldNorm = normalizeStringTolerant(oldStr)
        const newNorm = normalizeStringTolerant(newStr)
        areSame = oldNorm === newNorm || fuzzyMatchOCR(oldStr, newStr, 0.9)
      } else {
        // Use tolerant string normalization for other string fields
        areSame = normalizeStringTolerant(oldStr) === normalizeStringTolerant(newStr)
      }
    }

    if (areSame) continue

    diffs.push({
      field: config.field,
      fieldLabel: config.label,
      fieldLabelTr: config.labelTr,
      oldValue: oldVal,
      newValue: newVal,
      type: config.type,
      significance: config.significance,
    })
  }

  // Check coverages array with smart comparison (matches by name, ignores description differences)
  const coveragesEqual = tolerantMode
    ? coveragesEqualSmart(oldPolicy.coverages, newPolicy.coverages, { tolerantMode })
    : arraysEqualTolerant(oldPolicy.coverages, newPolicy.coverages)

  if (!coveragesEqual) {
    diffs.push({
      field: 'coverages',
      fieldLabel: 'Coverage Details',
      fieldLabelTr: 'Teminat Detayları',
      oldValue: oldPolicy.coverages,
      newValue: newPolicy.coverages,
      type: 'array',
      significance: 'major',
    })
  }

  // Check exclusions array with smart comparison (70% match threshold)
  const exclusionsEqual = tolerantMode
    ? stringsArrayEqualSmart(oldPolicy.exclusions, newPolicy.exclusions, { tolerantMode })
    : arraysEqualTolerant(oldPolicy.exclusions, newPolicy.exclusions)

  if (!exclusionsEqual) {
    diffs.push({
      field: 'exclusions',
      fieldLabel: 'Exclusions',
      fieldLabelTr: 'İstisnalar',
      oldValue: oldPolicy.exclusions,
      newValue: newPolicy.exclusions,
      type: 'array',
      significance: 'major',
    })
  }

  // Check special conditions array with smart comparison (70% match threshold)
  const conditionsEqual = tolerantMode
    ? stringsArrayEqualSmart(oldPolicy.specialConditions, newPolicy.specialConditions, {
        tolerantMode,
      })
    : arraysEqualTolerant(oldPolicy.specialConditions, newPolicy.specialConditions)

  if (!conditionsEqual) {
    diffs.push({
      field: 'specialConditions',
      fieldLabel: 'Special Conditions',
      fieldLabelTr: 'Özel Şartlar',
      oldValue: oldPolicy.specialConditions,
      newValue: newPolicy.specialConditions,
      type: 'array',
      significance: 'moderate',
    })
  }

  return diffs
}

// ============================================================================
// PRE-UPLOAD CHECK RESULT TYPES
// ============================================================================

export type PreUploadCheckResult =
  | { type: 'noConflict' }
  | { type: 'exactDuplicate'; existingPolicy: Policy }
  | { type: 'extractionVariance'; existingPolicy: Policy; changes: PolicyFieldDiff[] }
  | {
      type: 'amendment'
      existingPolicy: Policy
      changes: PolicyFieldDiff[]
      isVerifiedAmendment: boolean
    }

/**
 * Check if a policy has valid amendment markers (Zeyilname indicators)
 * Turkish insurance amendments always have explicit markers in the document
 */
export function hasAmendmentMarkers(policy: Policy): boolean {
  if (!policy.amendmentInfo) return false

  // Check for explicit amendment flag
  if (policy.amendmentInfo.isAmendment) return true

  // Additional validation: must have at least an amendment number
  // to be considered a real amendment
  if (policy.amendmentInfo.amendmentNumber) return true

  return false
}

/**
 * Compare policies and determine conflict type
 *
 * Logic:
 * 1. If identifiers don't match → no conflict
 * 2. If new document has amendment markers (Zeyilname) → real amendment
 * 3. If no markers, compare with tolerance:
 *    - No differences → exact duplicate
 *    - Only minor differences within tolerance → extraction variance
 *    - Significant differences → suspicious (possible amendment without markers)
 */
export function comparePoliciesAdvanced(
  newPolicy: Policy,
  existingPolicy: Policy
): PreUploadCheckResult {
  const isIdentifierMatch = isPolicyIdentifierMatch(newPolicy, existingPolicy)

  if (!isIdentifierMatch) {
    return { type: 'noConflict' }
  }

  // STEP 1: Check document hash (exact same document re-uploaded)
  // If hashes match, it's definitely the same document - no need for AI diff
  if (newPolicy.documentHash && existingPolicy.documentHash) {
    if (documentHashesMatch(newPolicy.documentHash, existingPolicy.documentHash)) {
      return { type: 'exactDuplicate', existingPolicy }
    }
  }

  // STEP 2: Check if the NEW document has explicit amendment markers
  const isVerifiedAmendment = hasAmendmentMarkers(newPolicy)

  if (isVerifiedAmendment) {
    // This is a verified Zeyilname/Amendment document
    // Use strict comparison to show actual differences
    const changes = calculatePolicyDiff(existingPolicy, newPolicy, { tolerantMode: false })
    return {
      type: 'amendment',
      existingPolicy,
      changes,
      isVerifiedAmendment: true,
    }
  }

  // STEP 3: No hash match, no amendment markers
  // Compare using STRICT mode (no tolerance that could mask real changes)
  const changes = calculatePolicyDiff(existingPolicy, newPolicy, { tolerantMode: false })

  if (changes.length === 0) {
    // Identical after strict comparison - exact duplicate
    return { type: 'exactDuplicate', existingPolicy }
  }

  // STEP 4: There are differences - determine if OCR variance or real change
  // OCR-sensitive fields: text arrays and addresses often have OCR/formatting variance
  const ocrSensitiveFields = [
    'coverages',
    'exclusions',
    'specialConditions',
    'location',
    'insuredPerson',
  ]
  const coreFieldChanges = changes.filter((c) => !ocrSensitiveFields.includes(c.field))
  const ocrFieldChanges = changes.filter((c) => ocrSensitiveFields.includes(c.field))

  // If there are changes to core fields (coverage amount, premium, dates, etc.)
  // these are likely REAL changes, not OCR variance
  if (coreFieldChanges.length > 0) {
    // Check if changes are significant enough to be a real amendment
    const hasSignificantChange = coreFieldChanges.some(
      (c) => c.significance === 'critical' || c.significance === 'major'
    )

    if (hasSignificantChange) {
      // Real policy change without amendment markers
      return {
        type: 'amendment',
        existingPolicy,
        changes,
        isVerifiedAmendment: false,
      }
    }
  }

  // Only OCR-sensitive fields changed, or only minor/moderate changes
  // This is likely extraction variance from re-scanning or AI variance
  return {
    type: 'extractionVariance',
    existingPolicy,
    changes: ocrFieldChanges.length > 0 ? ocrFieldChanges : changes,
  }
}

// ============================================================================
// LEGACY COMPARISON (for existing duplicate detection in Dashboard)
// ============================================================================

/**
 * Compare two policies to determine their similarity level (TOLERANT)
 */
function comparePolicies(
  a: Policy,
  b: Policy
): { similarity: 'exact' | 'high' | 'medium' | null; matchedFields: string[] } {
  const matchedFields: string[] = []

  // Primary identifiers (tolerant)
  if (
    normalizePolicyNumber(a.policyNumber) === normalizePolicyNumber(b.policyNumber) &&
    a.policyNumber
  ) {
    matchedFields.push('policyNumber')
  }
  if (normalizeString(a.provider) === normalizeString(b.provider)) {
    matchedFields.push('provider')
  }

  // Financial fields (tolerant - round to integer)
  if (compareTolerant(a.coverage, b.coverage, 'number')) {
    matchedFields.push('coverage')
  }
  if (compareTolerant(a.premium, b.premium, 'number')) {
    matchedFields.push('premium')
  }
  if (compareTolerant(a.deductible, b.deductible, 'number')) {
    matchedFields.push('deductible')
  }

  // Date fields (tolerant - parse to timestamp)
  if (compareTolerant(a.startDate, b.startDate, 'date')) {
    matchedFields.push('startDate')
  }
  if (compareTolerant(a.expiryDate, b.expiryDate, 'date')) {
    matchedFields.push('expiryDate')
  }

  // Type and insured (tolerant)
  if (normalizeString(a.type) === normalizeString(b.type)) {
    matchedFields.push('type')
  }
  if (
    a.insuredPerson &&
    b.insuredPerson &&
    normalizeString(a.insuredPerson) === normalizeString(b.insuredPerson)
  ) {
    matchedFields.push('insuredPerson')
  }

  // Determine similarity level
  const hasExactMatch =
    matchedFields.includes('policyNumber') &&
    matchedFields.includes('provider') &&
    matchedFields.includes('coverage') &&
    matchedFields.includes('premium') &&
    matchedFields.includes('startDate') &&
    matchedFields.includes('expiryDate')

  if (hasExactMatch) {
    return { similarity: 'exact', matchedFields }
  }

  // High similarity: same policy number + provider + insuredPerson
  const hasHighSimilarity =
    matchedFields.includes('policyNumber') &&
    matchedFields.includes('provider') &&
    (matchedFields.includes('insuredPerson') || !a.insuredPerson || !b.insuredPerson)

  if (hasHighSimilarity) {
    return { similarity: 'high', matchedFields }
  }

  // Medium similarity: provider + type + similar financial values
  const hasMediumSimilarity =
    matchedFields.includes('provider') &&
    matchedFields.includes('type') &&
    (matchedFields.includes('coverage') || matchedFields.includes('premium')) &&
    matchedFields.length >= 4

  if (hasMediumSimilarity) {
    return { similarity: 'medium', matchedFields }
  }

  return { similarity: null, matchedFields }
}

// ============================================================================
// NEW POLICY DETECTION
// ============================================================================

/**
 * Check if a policy is considered "new" based on its createdAt timestamp
 */
export function isNewPolicy(
  policy: Policy,
  thresholdMs: number = NEW_POLICY_THRESHOLD_MS
): boolean {
  if (!policy.createdAt) {
    return false
  }

  const createdTime = new Date(policy.createdAt).getTime()
  const now = Date.now()

  return now - createdTime < thresholdMs
}

/**
 * Check if a policy was added in the current session
 */
export function isSessionNewPolicy(policy: Policy, sessionStartTime: string): boolean {
  if (!policy.createdAt) {
    return false
  }

  return new Date(policy.createdAt) > new Date(sessionStartTime)
}

// ============================================================================
// DUPLICATE DETECTION (for Dashboard)
// ============================================================================

/**
 * Find duplicate policies within a list
 */
export function findDuplicatePolicies(policies: Policy[]): DuplicatePolicy[] {
  const duplicates: DuplicatePolicy[] = []
  const processedPairs = new Set<string>()

  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const pairKey = `${policies[i].id}-${policies[j].id}`
      if (processedPairs.has(pairKey)) continue
      processedPairs.add(pairKey)

      const { similarity, matchedFields } = comparePolicies(policies[i], policies[j])

      if (similarity) {
        duplicates.push({
          policy: policies[j],
          duplicateOf: policies[i],
          similarity,
          matchedFields,
        })
      }
    }
  }

  return duplicates
}

/**
 * Check if a new policy is a duplicate of any existing policies
 */
export function checkForDuplicate(
  newPolicy: Policy,
  existingPolicies: Policy[]
): DuplicatePolicy | null {
  for (const existing of existingPolicies) {
    if (existing.id === newPolicy.id) continue

    const { similarity, matchedFields } = comparePolicies(newPolicy, existing)

    if (similarity) {
      return {
        policy: newPolicy,
        duplicateOf: existing,
        similarity,
        matchedFields,
      }
    }
  }

  return null
}

/**
 * Group policies by their duplicate status
 */
export function groupDuplicatePolicies(policies: Policy[]): {
  uniquePolicies: Policy[]
  duplicateGroups: Map<string, Policy[]>
} {
  const duplicates = findDuplicatePolicies(policies)
  const duplicateIds = new Set<string>()
  const duplicateGroups = new Map<string, Policy[]>()

  // Build groups of duplicate policies
  for (const dup of duplicates) {
    const originalId = dup.duplicateOf.id
    duplicateIds.add(dup.policy.id)

    if (!duplicateGroups.has(originalId)) {
      duplicateGroups.set(originalId, [dup.duplicateOf])
    }
    const group = duplicateGroups.get(originalId)
    if (group) {
      group.push(dup.policy)
    }
  }

  // Get unique policies (not part of any duplicate group as secondary)
  const uniquePolicies = policies.filter((p) => !duplicateIds.has(p.id))

  return { uniquePolicies, duplicateGroups }
}

// ============================================================================
// LABELS
// ============================================================================

export function getSimilarityLabel(similarity: 'exact' | 'high' | 'medium'): string {
  switch (similarity) {
    case 'exact':
      return 'Exact duplicate'
    case 'high':
      return 'Very similar'
    case 'medium':
      return 'Possibly duplicate'
  }
}

// ============================================================================
// TIMESTAMPS
// ============================================================================

export function createPolicyTimestamp(): string {
  return new Date().toISOString()
}

export function ensurePolicyTimestamps<T extends Policy>(policies: T[]): T[] {
  const now = createPolicyTimestamp()
  return policies.map((p) => ({
    ...p,
    createdAt: p.createdAt || now,
  }))
}
