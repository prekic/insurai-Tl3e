/**
 * Deterministic OCR Pre-Clean Module
 *
 * Applies battle-tested regex rules to clean Turkish insurance policy OCR text
 * BEFORE any LLM processing. This dramatically reduces LLM cost and improves accuracy.
 *
 * Processing order (important):
 * 1. Unicode/control character cleanup
 * 2. Line-level barcode/QR payload removal
 * 3. Turkish de-spacing (iterative, multiple passes)
 * 4. Label normalization (SBM fields, glued tokens)
 * 5. Page marker normalization
 * 6. Section header reflow
 * 7. Final whitespace collapse
 *
 * Based on analysis of Turkish kasko/motor policy OCR artifacts.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PreCleanResult {
  /** Cleaned text */
  text: string

  /** Statistics about what was cleaned */
  stats: PreCleanStats

  /** Detailed log of changes */
  changelog: ChangeLogEntry[]
}

export interface PreCleanStats {
  /** Original length */
  originalLength: number

  /** Final length */
  finalLength: number

  /** Lines removed as noise */
  noiseLinesRemoved: number

  /** Turkish words de-spaced */
  turkishWordsDespaced: number

  /** Barcode artifacts removed */
  barcodeArtifactsRemoved: number

  /** Control characters removed */
  controlCharsRemoved: number

  /** Labels normalized */
  labelsNormalized: number

  /** Page markers normalized */
  pageMarkersNormalized: number

  /** Total regex passes */
  totalPasses: number
}

export interface ChangeLogEntry {
  rule: string
  before: string
  after: string
  count: number
}

export interface PreCleanConfig {
  /** Max iterations for de-spacing passes */
  maxDespacingPasses?: number

  /** Enable aggressive noise removal */
  aggressiveNoiseRemoval?: boolean

  /** Enable debug logging */
  debug?: boolean

  /** Custom noise patterns to remove */
  customNoisePatterns?: RegExp[]
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<PreCleanConfig> = {
  maxDespacingPasses: 6,
  aggressiveNoiseRemoval: true,
  debug: false,
  customNoisePatterns: [],
}

// ============================================================================
// A. UNICODE / CONTROL CHARACTER CLEANUP
// ============================================================================

/**
 * A1: Normalize newlines and remove invisible junk
 */
function cleanUnicodeJunk(text: string): { text: string; removed: number } {
  let removed = 0
  let cleaned = text

  // Convert \r\n → \n, and \r → \n
  const crlfCount = (cleaned.match(/\r\n?/g) || []).length
  cleaned = cleaned.replace(/\r\n?/g, '\n')
  removed += crlfCount

  // Remove BOM/zero-width characters
  const zwCount = (cleaned.match(/[\uFEFF\u200B-\u200F\u2060]/g) || []).length
  cleaned = cleaned.replace(/[\uFEFF\u200B-\u200F\u2060]/g, '')
  removed += zwCount

  return { text: cleaned, removed }
}

/**
 * A2: Remove control chars except \n and \t
 */
function removeControlChars(text: string): { text: string; removed: number } {
  // eslint-disable-next-line no-control-regex
  const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  return { text: cleaned, removed: controlChars.length }
}

// ============================================================================
// B. LINE-LEVEL BARCODE/QR PAYLOAD REMOVAL (BIGGEST COST SAVER)
// ============================================================================

// Hard-kill patterns for known barcode sentinels
const BARCODE_HARD_KILL_PATTERNS = [
  /B\^\^\^B/i,           // B^^^B pattern
  /a!{3,}a/i,            // a!!!a pattern and variants
  /a!+!*[aA]+!*/i,       // a!!!!!a!AAAaA!AA!!!aaAA!aAaAA!! variants
]

// Patterns indicating high-entropy garbage lines
const PUNCT_RUN_PATTERN = /([!^~_<>|])\1{2,}/
const SPECIAL_CLUSTER_PATTERN = /[<>[\]{}|\\^$@#]{4,}/
const BRACKET_GARBAGE_PATTERN = /<[^>]*[|$^]+[^>]*>/

/**
 * Check if a line is barcode/QR payload noise
 */
function isNoiseLine(line: string): { isNoise: boolean; reason: string } {
  const trimmed = line.trim()

  // Empty lines are not noise
  if (!trimmed) {
    return { isNoise: false, reason: '' }
  }

  // B1: Hard-kill known barcode sentinels
  for (const pattern of BARCODE_HARD_KILL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isNoise: true, reason: 'barcode_sentinel' }
    }
  }

  // B2: Check for "mostly non-text" lines
  if (trimmed.length >= 20) {
    // Check for punctuation runs
    if (PUNCT_RUN_PATTERN.test(trimmed)) {
      const alnumCount = (trimmed.match(/[0-9A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length
      const ratio = alnumCount / trimmed.length
      if (ratio < 0.35) {
        return { isNoise: true, reason: 'low_alnum_ratio' }
      }
    }

    // Check for special character clusters
    if (SPECIAL_CLUSTER_PATTERN.test(trimmed)) {
      return { isNoise: true, reason: 'special_cluster' }
    }

    // Check for bracket garbage
    if (BRACKET_GARBAGE_PATTERN.test(trimmed)) {
      return { isNoise: true, reason: 'bracket_garbage' }
    }
  }

  // B3: Check for extended ASCII heavy lines
  if (trimmed.length >= 20) {
    // Characters outside normal Turkish text range
    const weirdChars = trimmed.match(/[^\x09\x0A\x0D\x20-\x7EÇĞİÖŞÜçğıöşüÂÎÛâîû]/g) || []
    if (weirdChars.length >= 5 && weirdChars.length / trimmed.length >= 0.10) {
      return { isNoise: true, reason: 'extended_ascii_heavy' }
    }
  }

  // B4: Check for repetitive patterns
  if (/(.)\1{6,}/.test(trimmed)) {
    return { isNoise: true, reason: 'repetitive_chars' }
  }

  // B5: Check for lines that are mostly symbols
  if (trimmed.length >= 15) {
    const symbolCount = (trimmed.match(/[!@#$%^&*()[\]{}|\\<>~`+=]/g) || []).length
    if (symbolCount / trimmed.length > 0.5) {
      return { isNoise: true, reason: 'mostly_symbols' }
    }
  }

  return { isNoise: false, reason: '' }
}

/**
 * Remove noise lines from text
 */
function dropNoiseLines(text: string): { text: string; linesRemoved: number; reasons: Record<string, number> } {
  const lines = text.split('\n')
  const kept: string[] = []
  let linesRemoved = 0
  const reasons: Record<string, number> = {}

  for (const line of lines) {
    const { isNoise, reason } = isNoiseLine(line)

    if (isNoise) {
      linesRemoved++
      reasons[reason] = (reasons[reason] || 0) + 1
    } else {
      kept.push(line)
    }
  }

  return {
    text: kept.join('\n'),
    linesRemoved,
    reasons,
  }
}

/**
 * Remove inline barcode artifacts (within text, not whole lines)
 */
function removeInlineBarcodeArtifacts(text: string): { text: string; removed: number } {
  let removed = 0
  let cleaned = text

  // Remove B^^^B and surrounding garbage
  const bPatterns = [
    /B\^\^\^B[^\s\n]*/gi,
    /B\s*\^\s*\^\s*\^\s*B[^\s\n]*/gi,
  ]

  for (const pattern of bPatterns) {
    const matches = cleaned.match(pattern) || []
    removed += matches.length
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove a!!!a variants
  const aPatterns = [
    /a!{2,}[aA!]*/gi,
    /[aA]!+[aA!]+!*[aA]*/g,
  ]

  for (const pattern of aPatterns) {
    const matches = cleaned.match(pattern) || []
    removed += matches.length
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove other garbage patterns
  const garbagePatterns = [
    /<:[^>]*>/g,                    // <:8@+2ZSM...> patterns
    /\(\([^)]*\$[^)]*\)\)/g,        // (( $ )) patterns
    /\$\$[^$]+\$\$/g,               // $$...$$ patterns
    /\^{2,}[^\s]*/g,                // ^^^ sequences
    /[|]{3,}/g,                     // ||| sequences
  ]

  for (const pattern of garbagePatterns) {
    const matches = cleaned.match(pattern) || []
    removed += matches.length
    cleaned = cleaned.replace(pattern, '')
  }

  return { text: cleaned, removed }
}

// ============================================================================
// C. TURKISH DE-SPACING (ITERATIVE, MULTIPLE PASSES)
// ============================================================================

// Turkish uppercase letters for matching
const TR_UPPER = 'A-ZÇĞİÖŞÜÂÎÛ'
const TR_LOWER = 'a-zçğıöşüâîû'
const TR_ALL = TR_UPPER + TR_LOWER

// Horizontal whitespace only (no newlines) - used for de-spacing
const HWS_PATTERN = '[ \\t]'

/**
 * C1: Join sequences of single-letter tokens (handles B İ R L E Ş İ K)
 *
 * This is the key fix for "B İ RLE Şİ K KASKO S İ GORTA POL İÇ ES İ" etc.
 * Uses horizontal whitespace only to preserve line breaks.
 */
function despaceUppercaseSequences(text: string): { text: string; count: number } {
  let count = 0

  // Pattern: 2+ uppercase Turkish letters separated by spaces (not newlines)
  // Matches: "B İ R L E Ş İ K", "S İ G O R T A", etc.
  const pattern = new RegExp(
    `(?<![${TR_ALL}])([${TR_UPPER}])(?:${HWS_PATTERN}+([${TR_UPPER}])){2,}(?![${TR_LOWER}])`,
    'gu'
  )

  const result = text.replace(pattern, (match) => {
    count++
    return match.replace(/[ \t]+/g, '')
  })

  return { text: result, count }
}

/**
 * C1b: Handle partial spaced sequences like "Şİ RKET", "Ş İ RKET"
 */
function despacePartialSequences(text: string): { text: string; count: number } {
  let count = 0

  // Match patterns like "Şİ RKET" → "ŞİRKET", "Ş asi" → "Şasi"
  // Uses horizontal whitespace only to preserve line breaks
  const patterns = [
    // Capital + İ + space + capitals
    new RegExp(`([${TR_UPPER}])${HWS_PATTERN}*(İ)${HWS_PATTERN}+([${TR_UPPER}]{2,})`, 'gu'),
    // Single uppercase + space + word
    new RegExp(`\\b([${TR_UPPER}])${HWS_PATTERN}+([${TR_UPPER}][${TR_LOWER}]+)\\b`, 'gu'),
  ]

  let result = text
  for (const pattern of patterns) {
    result = result.replace(pattern, (match, ...groups) => {
      count++
      return groups.slice(0, -2).join('')
    })
  }

  return { text: result, count }
}

/**
 * C2: Join "broken word" pattern: single letter + lowercase continuation
 * Fixes: M üş teri → Müşteri, Ş asi → Şasi, D ü zenleme → Düzenleme
 */
function despaceLeadingSplits(text: string): { text: string; count: number } {
  let count = 0

  // Pattern: single Turkish letter + space (not newline) + 2+ lowercase letters
  const pattern = new RegExp(
    `\\b([${TR_ALL}])${HWS_PATTERN}+([${TR_LOWER}]{2,})\\b`,
    'gu'
  )

  const result = text.replace(pattern, (match, letter, rest) => {
    count++
    return letter + rest
  })

  return { text: result, count }
}

/**
 * C3: Fix common word patterns with internal spacing
 * Handles: "M üş teri" → "Müşteri", "T ü rk" → "Türk"
 */
// Horizontal whitespace pattern (space or tab, NOT newline)
const HWS = '[ \\t]*'

function fixCommonTurkishWords(text: string): { text: string; count: number } {
  let count = 0

  // Common Turkish words with their spaced variants
  // Using HWS (horizontal whitespace) instead of \s* to preserve line breaks
  const wordFixes: Array<[RegExp, string]> = [
    // Insurance terms
    [new RegExp(`S${HWS}İ${HWS}G${HWS}O${HWS}R${HWS}T${HWS}A`, 'gi'), 'SİGORTA'],
    [new RegExp(`P${HWS}O${HWS}L${HWS}İ${HWS}Ç${HWS}E`, 'gi'), 'POLİÇE'],
    [new RegExp(`K${HWS}A${HWS}S${HWS}K${HWS}O`, 'gi'), 'KASKO'],
    [new RegExp(`B${HWS}İ${HWS}R${HWS}L${HWS}E${HWS}Ş${HWS}İ${HWS}K`, 'gi'), 'BİRLEŞİK'],
    [new RegExp(`G${HWS}E${HWS}N${HWS}İ${HWS}Ş${HWS}L${HWS}E${HWS}T${HWS}İ${HWS}L${HWS}M${HWS}İ${HWS}Ş`, 'gi'), 'GENİŞLETİLMİŞ'],
    [new RegExp(`T${HWS}Ü${HWS}R${HWS}K${HWS}İ${HWS}Y${HWS}E`, 'gi'), 'TÜRKİYE'],
    [new RegExp(`T${HWS}Ü${HWS}R${HWS}K`, 'gi'), 'TÜRK'],
    [new RegExp(`Ş${HWS}İ${HWS}R${HWS}K${HWS}E${HWS}T`, 'gi'), 'ŞİRKET'],
    [new RegExp(`A${HWS}N${HWS}O${HWS}N${HWS}İ${HWS}M`, 'gi'), 'ANONİM'],

    // Common field labels
    [new RegExp(`S${HWS}Ö${HWS}Z${HWS}L${HWS}E${HWS}Ş${HWS}M${HWS}E`, 'gi'), 'SÖZLEŞME'],
    [new RegExp(`T${HWS}A${HWS}R${HWS}A${HWS}F${HWS}L${HWS}A${HWS}R${HWS}I`, 'gi'), 'TARAFLARI'],
    [new RegExp(`B${HWS}İ${HWS}L${HWS}G${HWS}İ${HWS}L${HWS}E${HWS}R${HWS}İ`, 'gi'), 'BİLGİLERİ'],
    [new RegExp(`P${HWS}R${HWS}İ${HWS}M`, 'gi'), 'PRİM'],
    [new RegExp(`Ö${HWS}D${HWS}E${HWS}M${HWS}E`, 'gi'), 'ÖDEME'],
    [new RegExp(`P${HWS}L${HWS}A${HWS}N${HWS}I`, 'gi'), 'PLANI'],
    [new RegExp(`K${HWS}O${HWS}N${HWS}U${HWS}S${HWS}U`, 'gi'), 'KONUSU'],
    [new RegExp(`A${HWS}R${HWS}A${HWS}Ç`, 'gi'), 'ARAÇ'],

    // Address terms
    [new RegExp(`M${HWS}A${HWS}H${HWS}A${HWS}L${HWS}L${HWS}E${HWS}S${HWS}İ`, 'gi'), 'MAHALLESİ'],
    [new RegExp(`M${HWS}A${HWS}H${HWS}\\.`, 'gi'), 'MAH.'],
    [new RegExp(`S${HWS}O${HWS}K${HWS}A${HWS}K`, 'gi'), 'SOKAK'],
    [new RegExp(`S${HWS}O${HWS}K${HWS}\\.`, 'gi'), 'SOK.'],
    [new RegExp(`C${HWS}A${HWS}D${HWS}D${HWS}E${HWS}S${HWS}İ`, 'gi'), 'CADDESİ'],
    [new RegExp(`C${HWS}A${HWS}D${HWS}\\.`, 'gi'), 'CAD.'],
    [new RegExp(`İ${HWS}S${HWS}T${HWS}A${HWS}N${HWS}B${HWS}U${HWS}L`, 'gi'), 'İSTANBUL'],
    [new RegExp(`A${HWS}N${HWS}K${HWS}A${HWS}R${HWS}A`, 'gi'), 'ANKARA'],
    [new RegExp(`A${HWS}N${HWS}T${HWS}A${HWS}L${HWS}Y${HWS}A`, 'gi'), 'ANTALYA'],

    // Common lowercase patterns with ü/ş/ğ/ö/ç
    [new RegExp(`M${HWS}ü${HWS}ş${HWS}t${HWS}e${HWS}r${HWS}i`, 'gi'), 'Müşteri'],
    [new RegExp(`ü${HWS}ş${HWS}t${HWS}e${HWS}r${HWS}i`, 'gi'), 'üşteri'],
    [new RegExp(`D${HWS}ü${HWS}z${HWS}e${HWS}n${HWS}l${HWS}e`, 'gi'), 'Düzenle'],
    [new RegExp(`ü${HWS}z${HWS}e${HWS}n${HWS}l${HWS}e`, 'gi'), 'üzenle'],
    [new RegExp(`Ş${HWS}a${HWS}s${HWS}i`, 'gi'), 'Şasi'],
    [new RegExp(`ş${HWS}a${HWS}s${HWS}i`, 'gi'), 'şasi'],
    [new RegExp(`Ö${HWS}n${HWS}c${HWS}e${HWS}s${HWS}i`, 'gi'), 'Öncesi'],
    [new RegExp(`ö${HWS}n${HWS}c${HWS}e${HWS}s${HWS}i`, 'gi'), 'öncesi'],

    // Fix trailing İ with space (ŞİRKET İ → ŞİRKETİ, POLİÇES İ → POLİÇESİ)
    [new RegExp(`POL${HWS}İ${HWS}Ç${HWS}E${HWS}S${HWS}İ`, 'gi'), 'POLİÇESİ'],
    [new RegExp(`Ş${HWS}İ${HWS}R${HWS}K${HWS}E${HWS}T${HWS}İ`, 'gi'), 'ŞİRKETİ'],
    [new RegExp(`E${HWS}T${HWS}T${HWS}İ${HWS}R${HWS}E${HWS}N`, 'gi'), 'ETTİREN'],

    // TEMİNATLAR pattern
    [new RegExp(`T${HWS}E${HWS}M${HWS}İ${HWS}N${HWS}A${HWS}T${HWS}L${HWS}A${HWS}R`, 'gi'), 'TEMİNATLAR'],
  ]

  let result = text
  for (const [pattern, replacement] of wordFixes) {
    const matches = result.match(pattern)
    if (matches) {
      count += matches.length
      result = result.replace(pattern, replacement)
    }
  }

  return { text: result, count }
}

/**
 * Iteratively apply de-spacing rules until no more changes
 */
function iterativeDespace(text: string, maxPasses: number): { text: string; totalCount: number; passes: number } {
  let current = text
  let totalCount = 0
  let passes = 0

  for (let i = 0; i < maxPasses; i++) {
    passes++
    let changesMade = 0

    // Apply each de-spacing rule
    const r1 = despaceUppercaseSequences(current)
    current = r1.text
    changesMade += r1.count

    const r2 = despacePartialSequences(current)
    current = r2.text
    changesMade += r2.count

    const r3 = despaceLeadingSplits(current)
    current = r3.text
    changesMade += r3.count

    const r4 = fixCommonTurkishWords(current)
    current = r4.text
    changesMade += r4.count

    totalCount += changesMade

    // Stop if no more changes
    if (changesMade === 0) break
  }

  return { text: current, totalCount, passes }
}

// ============================================================================
// D. LABEL NORMALIZATION (SBM FIELDS, GLUED TOKENS)
// ============================================================================

/**
 * D1: Split common glued label tokens
 */
function normalizeLabels(text: string): { text: string; count: number } {
  let count = 0

  const labelFixes: Array<[RegExp, string]> = [
    // Policy labels
    [/\b(poliçe)\s*No\b/gi, 'Poliçe No'],
    [/\b(Poliçe)\s*No\b/g, 'Poliçe No'],
    [/\bpoliçeNo\b/gi, 'Poliçe No'],
    [/\bpoliçeVadesi\b/gi, 'Poliçe Vadesi'],

    // Name fields - simple patterns that work with Turkish chars
    [/AdıSoyadı/g, 'Adı Soyadı'],
    [/Adı\s*Soyadı/g, 'Adı Soyadı'],
    [/sigortalıAdı/gi, 'Sigortalı Adı'],

    // Company fields
    [/\bSigorta\s*şirket\b/gi, 'Sigorta Şirketi'],
    [/\bSigortaşirket\b/gi, 'Sigorta Şirketi'],
    [/\bŞİRKETİ?\b/g, 'ŞİRKETİ'],

    // Usage fields
    [/\bKullanım\s*Şekli\b/g, 'Kullanım Şekli'],
    [/\bKullanımŞekli\b/g, 'Kullanım Şekli'],

    // Contact fields
    [/\bTelefon\s*Numarası\b/g, 'Telefon Numarası'],
    [/\bE-?posta\s*Adresi\b/gi, 'E-posta Adresi'],

    // Date fields
    [/\bdüzenleme\s*Tarihi\b/gi, 'Düzenleme Tarihi'],
    [/\bDüzenlemeTarihi\b/g, 'Düzenleme Tarihi'],

    // Other glued words
    [/HUSUSİOTOMOBİL/g, 'HUSUSİ OTOMOBİL'],
    [/SANAYİVE/g, 'SANAYİ VE'],
    [/LİMİTEDŞİRKET/g, 'LİMİTED ŞİRKETİ'],
    [/SİTESİSit/g, 'SİTESİ Sit'],
    [/BİLGİLERİPlaka/g, 'BİLGİLERİ Plaka'],
    [/BİLGİLERİTUTAR/g, 'BİLGİLERİ TUTAR'],
    [/TARİHİTUTAR/g, 'TARİHİ TUTAR'],

    // Fix abbreviations followed by words
    [/MAH\.([A-ZÇĞİÖŞÜa-zçğıöşü])/g, 'MAH. $1'],
    [/SOK\.([A-ZÇĞİÖŞÜa-zçğıöşü])/g, 'SOK. $1'],
    [/CAD\.([A-ZÇĞİÖŞÜa-zçğıöşü])/g, 'CAD. $1'],
    [/YoluçSOK/g, 'Yoluç SOK'],
    [/Yoluçsok/g, 'Yoluç sok'],
  ]

  let result = text
  for (const [pattern, replacement] of labelFixes) {
    const matches = result.match(pattern)
    if (matches) {
      count += matches.length
      result = result.replace(pattern, replacement)
    }
  }

  return { text: result, count }
}

/**
 * D2: Standardize SBM fields
 */
function normalizeSbmFields(text: string): { text: string; count: number } {
  let count = 0

  const sbmFixes: Array<[RegExp, string]> = [
    [/\bSBM\s+BIM\s+Ref\s+No\b/gi, 'SBM BIM Ref No'],
    [/\bSBM\s+Poliçe\s+No\b/gi, 'SBM Poliçe No'],
    [/\bSBMPoliçeNo\b/gi, 'SBM Poliçe No'],
  ]

  let result = text
  for (const [pattern, replacement] of sbmFixes) {
    const matches = result.match(pattern)
    if (matches) {
      count += matches.length
      result = result.replace(pattern, replacement)
    }
  }

  return { text: result, count }
}

// ============================================================================
// E. PAGE MARKER NORMALIZATION
// ============================================================================

/**
 * E1: Normalize page marker format
 */
function normalizePageMarkers(text: string): { text: string; count: number } {
  let count = 0

  // Normalize "Sayfa : X/Y" to "Sayfa: X/Y"
  const result = text.replace(/Sayfa\s*:\s*(\d+)\s*\/\s*(\d+)/gi, (match) => {
    count++
    const nums = match.match(/(\d+)\s*\/\s*(\d+)/)
    return nums ? `Sayfa: ${nums[1]}/${nums[2]}` : match
  })

  return { text: result, count }
}

// ============================================================================
// F. NUMERIC AND FORMATTING NORMALIZATION
// ============================================================================

/**
 * F1: Fix spacing around slash for numbers/IDs
 */
function normalizeSlashes(text: string): { text: string; count: number } {
  let count = 0

  // Fix "25 /1A" → "25/1A"
  const result = text.replace(/(\d)\s*\/\s*([0-9A-Za-z])/g, (match, d, c) => {
    count++
    return `${d}/${c}`
  })

  return { text: result, count }
}

/**
 * F2: Collapse excessive whitespace
 */
function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')      // Multiple spaces/tabs to single space
    .replace(/\n{3,}/g, '\n\n')      // Max 2 consecutive newlines
    .replace(/[ \t]+\n/g, '\n')      // Trailing whitespace before newline
    .replace(/\n[ \t]+/g, '\n')      // Leading whitespace after newline (except indentation)
    .trim()
}

// ============================================================================
// G. SECTION HEADER REFLOW
// ============================================================================

const SECTION_HEADERS = [
  'SÖZLEŞME TARAFLARI',
  'SİGORTA KONUSU ARAÇ BİLGİLERİ',
  'PRİM BİLGİLERİ',
  'ÖDEME PLANI',
  'TEMİNATLAR',
  'ÖZEL ŞARTLAR',
  'GENEL ŞARTLAR',
  'MUAFIYETLER',
  'İSTİSNALAR',
]

/**
 * G1: Ensure section headers start on a fresh block
 */
function reflowSectionHeaders(text: string): string {
  let result = text

  for (const header of SECTION_HEADERS) {
    // Create pattern that matches the header with possible spacing issues
    const escapedHeader = header.replace(/\s+/g, '\\s+')
    const pattern = new RegExp(`\\s*(${escapedHeader})\\s*`, 'gi')

    result = result.replace(pattern, `\n\n${header}\n`)
  }

  return result
}

// ============================================================================
// MAIN PRE-CLEAN FUNCTION
// ============================================================================

/**
 * Apply all deterministic pre-clean rules to OCR text
 */
export function preCleanOcrText(rawText: string, config: PreCleanConfig = {}): PreCleanResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const changelog: ChangeLogEntry[] = []
  const stats: PreCleanStats = {
    originalLength: rawText.length,
    finalLength: 0,
    noiseLinesRemoved: 0,
    turkishWordsDespaced: 0,
    barcodeArtifactsRemoved: 0,
    controlCharsRemoved: 0,
    labelsNormalized: 0,
    pageMarkersNormalized: 0,
    totalPasses: 0,
  }

  let text = rawText

  // A. Unicode / control character cleanup
  const unicodeResult = cleanUnicodeJunk(text)
  text = unicodeResult.text
  stats.controlCharsRemoved += unicodeResult.removed

  const controlResult = removeControlChars(text)
  text = controlResult.text
  stats.controlCharsRemoved += controlResult.removed

  // B. Line-level noise removal
  const noiseResult = dropNoiseLines(text)
  text = noiseResult.text
  stats.noiseLinesRemoved = noiseResult.linesRemoved

  if (cfg.debug && noiseResult.linesRemoved > 0) {
    changelog.push({
      rule: 'dropNoiseLines',
      before: `${noiseResult.linesRemoved} lines`,
      after: 'removed',
      count: noiseResult.linesRemoved,
    })
  }

  // B2. Inline barcode artifact removal
  const inlineResult = removeInlineBarcodeArtifacts(text)
  text = inlineResult.text
  stats.barcodeArtifactsRemoved = inlineResult.removed

  // C. Turkish de-spacing (iterative)
  const despaceResult = iterativeDespace(text, cfg.maxDespacingPasses)
  text = despaceResult.text
  stats.turkishWordsDespaced = despaceResult.totalCount
  stats.totalPasses = despaceResult.passes

  if (cfg.debug && despaceResult.totalCount > 0) {
    changelog.push({
      rule: 'iterativeDespace',
      before: `${despaceResult.passes} passes`,
      after: `${despaceResult.totalCount} words fixed`,
      count: despaceResult.totalCount,
    })
  }

  // D. Label normalization
  const labelResult = normalizeLabels(text)
  text = labelResult.text
  stats.labelsNormalized += labelResult.count

  const sbmResult = normalizeSbmFields(text)
  text = sbmResult.text
  stats.labelsNormalized += sbmResult.count

  // E. Page marker normalization
  const pageResult = normalizePageMarkers(text)
  text = pageResult.text
  stats.pageMarkersNormalized = pageResult.count

  // F. Numeric and formatting
  const slashResult = normalizeSlashes(text)
  text = slashResult.text

  // G. Section header reflow
  text = reflowSectionHeaders(text)

  // Final whitespace collapse
  text = collapseWhitespace(text)

  stats.finalLength = text.length

  return {
    text,
    stats,
    changelog,
  }
}

// ============================================================================
// QUALITY CHECK FUNCTION
// ============================================================================

export interface QualityCheckResult {
  passed: boolean
  issues: string[]
  warnings: string[]
}

/**
 * Check if pre-cleaned text still contains known artifacts
 */
export function checkPreCleanQuality(text: string): QualityCheckResult {
  const issues: string[] = []
  const warnings: string[] = []

  // Check for remaining barcode artifacts
  if (/B\^\^\^B/i.test(text)) {
    issues.push('Contains B^^^B barcode artifact')
  }

  if (/a!{3,}/i.test(text)) {
    issues.push('Contains a!!! barcode artifact')
  }

  // Check for excessive spacing in Turkish words
  const spacedUpperMatch = text.match(/(?:[A-ZÇĞİÖŞÜ]\s+){3,}[A-ZÇĞİÖŞÜ]/g)
  if (spacedUpperMatch && spacedUpperMatch.length > 0) {
    warnings.push(`Found ${spacedUpperMatch.length} potentially spaced Turkish word(s)`)
  }

  // Check for low alphanumeric ratio lines
  const lines = text.split('\n')
  let lowRatioLines = 0
  for (const line of lines) {
    if (line.length >= 30) {
      const alnum = (line.match(/[0-9A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length
      if (alnum / line.length < 0.3) {
        lowRatioLines++
      }
    }
  }
  if (lowRatioLines > 0) {
    warnings.push(`Found ${lowRatioLines} line(s) with low alphanumeric ratio`)
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  cleanUnicodeJunk,
  removeControlChars,
  dropNoiseLines,
  removeInlineBarcodeArtifacts,
  iterativeDespace,
  normalizeLabels,
  normalizeSbmFields,
  normalizePageMarkers,
  collapseWhitespace,
  reflowSectionHeaders,
  isNoiseLine,
}
