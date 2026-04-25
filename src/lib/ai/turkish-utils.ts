/**
 * Turkish Text Handling Utilities
 *
 * Utilities for parsing and normalizing Turkish insurance documents.
 * Handles date formats, currency, character normalization, and field matching.
 */

import { matchLabeledField } from '../../../shared/field-aliases'

// =============================================================================
// TURKISH CHARACTER NORMALIZATION
// =============================================================================

/**
 * Normalize Turkish characters to ASCII equivalents
 * Useful for fuzzy matching and search
 */
export function normalizeTurkishChars(text: string): string {
  return text
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
}

/**
 * Normalize coverage name for comparison
 * Handles Turkish characters and common variations
 */
export function normalizeCoverageName(name: string): string {
  return normalizeTurkishChars(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
}

/**
 * Check if two coverage names match (fuzzy)
 */
export function coverageNamesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeCoverageName(name1)
  const n2 = normalizeCoverageName(name2)

  // Exact match
  if (n1 === n2) return true

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true

  // Check for common abbreviations and synonyms
  const synonymPairs = [
    ['yangin', 'fire'],
    ['hirsizlik', 'theft'],
    ['deprem', 'earthquake'],
    ['sel', 'flood'],
    ['cam', 'glass'],
    ['hasar', 'damage'],
    ['kaza', 'accident'],
    ['saglik', 'health'],
    ['hayat', 'life'],
    ['vefat', 'death'],
    ['maluliyet', 'disability'],
    ['tedavi', 'treatment'],
    ['hastane', 'hospital'],
  ]

  for (const [tr, en] of synonymPairs) {
    if ((n1.includes(tr) && n2.includes(en)) || (n1.includes(en) && n2.includes(tr))) {
      return true
    }
  }

  return false
}

// =============================================================================
// DATE PARSING
// =============================================================================

/**
 * Turkish date format patterns
 */
const TURKISH_DATE_PATTERNS = [
  // DD.MM.YYYY (most common in Turkish docs)
  /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
  // DD/MM/YYYY
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  // DD-MM-YYYY
  /(\d{1,2})-(\d{1,2})-(\d{4})/,
  // YYYY-MM-DD (ISO format, already correct)
  /(\d{4})-(\d{2})-(\d{2})/,
  // YYYY.MM.DD
  /(\d{4})\.(\d{2})\.(\d{2})/,
  // DD Month YYYY (Turkish)
  /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/i,
]

/**
 * Turkish month names to numbers
 */
const TURKISH_MONTHS: Record<string, string> = {
  ocak: '01',
  subat: '02',
  şubat: '02',
  mart: '03',
  nisan: '04',
  mayis: '05',
  mayıs: '05',
  haziran: '06',
  temmuz: '07',
  agustos: '08',
  ağustos: '08',
  eylul: '09',
  eylül: '09',
  ekim: '10',
  kasim: '11',
  kasım: '11',
  aralik: '12',
  aralık: '12',
}

/**
 * Parse a Turkish date string to ISO format (YYYY-MM-DD)
 * Returns null if parsing fails
 */
export function parseTurkishDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }

  const trimmed = dateStr.trim()

  // Already in ISO format?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  // Try DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  for (const pattern of TURKISH_DATE_PATTERNS.slice(0, 3)) {
    const match = trimmed.match(pattern)
    if (match) {
      const day = match[1].padStart(2, '0')
      const month = match[2].padStart(2, '0')
      const year = match[3]

      // Validate
      if (isValidDate(year, month, day)) {
        return `${year}-${month}-${day}`
      }
    }
  }

  // Try YYYY-MM-DD, YYYY.MM.DD
  for (const pattern of TURKISH_DATE_PATTERNS.slice(3, 5)) {
    const match = trimmed.match(pattern)
    if (match) {
      const year = match[1]
      const month = match[2]
      const day = match[3]

      if (isValidDate(year, month, day)) {
        return `${year}-${month}-${day}`
      }
    }
  }

  // Try Turkish month names
  const monthNamePattern = TURKISH_DATE_PATTERNS[5]
  const monthMatch = trimmed.match(monthNamePattern)
  if (monthMatch) {
    const day = monthMatch[1].padStart(2, '0')
    const monthName = monthMatch[2].toLowerCase()
    const month = TURKISH_MONTHS[normalizeTurkishChars(monthName).toLowerCase()]
    const year = monthMatch[3]

    if (month && isValidDate(year, month, day)) {
      return `${year}-${month}-${day}`
    }
  }

  return null
}

/**
 * Validate a date
 */
function isValidDate(year: string, month: string, day: string): boolean {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)

  if (isNaN(y) || isNaN(m) || isNaN(d)) return false
  if (y < 1900 || y > 2100) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false

  // Check days in month
  const daysInMonth = new Date(y, m, 0).getDate()
  if (d > daysInMonth) return false

  return true
}

/**
 * Extract all dates from text
 */
export function extractDatesFromText(text: string): string[] {
  const dates: string[] = []

  for (const pattern of TURKISH_DATE_PATTERNS) {
    const regex = new RegExp(pattern.source, 'gi')
    let match
    while ((match = regex.exec(text)) !== null) {
      const parsed = parseTurkishDate(match[0])
      if (parsed && !dates.includes(parsed)) {
        dates.push(parsed)
      }
    }
  }

  return dates.sort()
}

// =============================================================================
// CURRENCY PARSING
// =============================================================================

/**
 * Turkish currency patterns
 */
const CURRENCY_PATTERNS = [
  // ₺1.234.567,89 or ₺1,234,567.89
  /₺\s*([\d.,]+)/,
  // 1.234.567,89 TL or TRY
  /([\d.,]+)\s*(?:TL|TRY|Türk Lirası)/i,
  // TL 1.234.567,89
  /(?:TL|TRY)\s*([\d.,]+)/i,
]

/**
 * Parse a Turkish currency amount
 * Handles both Turkish (1.234,56) and international (1,234.56) formats
 */
export function parseTurkishCurrency(amountStr: string): number | null {
  if (!amountStr || typeof amountStr !== 'string') {
    return null
  }

  // Extract number from string
  let numberStr = amountStr

  // Try to extract just the number part
  for (const pattern of CURRENCY_PATTERNS) {
    const match = amountStr.match(pattern)
    if (match) {
      numberStr = match[1]
      break
    }
  }

  // Remove all non-numeric except . and ,
  numberStr = numberStr.replace(/[^\d.,]/g, '')

  if (!numberStr) return null

  // Detect format: Turkish uses . for thousands, , for decimal
  const lastDot = numberStr.lastIndexOf('.')
  const lastComma = numberStr.lastIndexOf(',')

  let normalized: string

  if (lastComma > lastDot) {
    // Turkish format: 1.234.567,89
    normalized = numberStr.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // International format: 1,234,567.89
    normalized = numberStr.replace(/,/g, '')
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma, could be decimal: 1234,56
    normalized = numberStr.replace(',', '.')
  } else {
    // No decimal separator or just dots as thousands
    normalized = numberStr.replace(/\./g, '')
  }

  const parsed = parseFloat(normalized)
  return isNaN(parsed) ? null : parsed
}

/**
 * Format number as Turkish currency
 */
export function formatTurkishCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// =============================================================================
// PLATE NUMBER PARSING
// =============================================================================

/**
 * Turkish license plate pattern
 * Format: XX YYY ZZZ or XX Y ZZZZ (city code + letters + numbers)
 */
const PLATE_PATTERN = /\b(\d{2})\s*([A-Z]{1,3})\s*(\d{1,4})\b/i

/**
 * Parse Turkish license plate
 */
export function parseTurkishPlate(plateStr: string): {
  cityCode: string
  letters: string
  numbers: string
  formatted: string
} | null {
  if (!plateStr) return null

  const match = plateStr.toUpperCase().match(PLATE_PATTERN)
  if (!match) return null

  const cityCode = match[1]
  const letters = match[2]
  const numbers = match[3]

  // Validate city code (01-81)
  const cityNum = parseInt(cityCode, 10)
  if (cityNum < 1 || cityNum > 81) return null

  return {
    cityCode,
    letters,
    numbers,
    formatted: `${cityCode} ${letters} ${numbers}`,
  }
}

// =============================================================================
// VEHICLE METADATA EXTRACTION
// =============================================================================

/**
 * Extract vehicle metadata (make, model, year, plate, engine no, chassis no)
 * from raw Turkish kasko policy text.
 *
 * Labels vary across insurers (`Model Yılı` / `Model Bilgisi` / `İmal Yılı` /
 * `Üretim Yılı`, `Marka` / `MARKASI/TİPİ`, `Şasi No` / `VIN`, etc.), so this
 * delegates to `matchLabeledField()` which iterates the canonical alias table
 * in `shared/field-aliases.ts`. Adding a new insurer format is typically a
 * one-line alias addition.
 *
 * Returns undefined if no fields could be extracted.
 */
export function extractVehicleInfoFromText(rawText: string):
  | {
      make?: string
      model?: string
      year?: number
      plate?: string
      engineNo?: string
      chassisNo?: string
    }
  | undefined {
  if (!rawText || typeof rawText !== 'string') return undefined

  // Clean up OCR artifacts that can disrupt regex matching (e.g. \u0014)
  // Fix ISO-8859-9 misinterpreted as ISO-8859-1 (common in Turkish PDFs)
  const sanitizedText = rawText
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/ý/g, 'ı')
    .replace(/þ/g, 'ş')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/Þ/g, 'Ş')
    .replace(/Ð/g, 'Ğ')

  const result: {
    make?: string
    model?: string
    year?: number
    plate?: string
    engineNo?: string
    chassisNo?: string
  } = {}

  // Plate — standalone TR plate pattern (no label required).
  const plateMatch = sanitizedText.match(/\b(\d{2})\s*([A-Z]{1,3})\s*(\d{1,4})\b/)
  if (plateMatch) {
    const cityNum = parseInt(plateMatch[1], 10)
    if (cityNum >= 1 && cityNum <= 81) {
      result.plate = `${plateMatch[1]} ${plateMatch[2]} ${plateMatch[3]}`
    }
  }

  // Make — first word of the labeled value.
  const rawMake = matchLabeledField(sanitizedText, 'make')
  if (rawMake) {
    const firstWord = rawMake.split(/\s+/)[0]
    if (firstWord && firstWord.length >= 2 && firstWord.length <= 25) {
      result.make = firstWord
    }
  }

  // Model — from the dedicated `Model:` / `Tip:` / `Trim:` label.
  // The alias excludes `Model Yılı` / `Model Bilgisi` / bare `Model: <year>`
  // so year-bearing labels don't poison the model value.
  const rawModel = matchLabeledField(sanitizedText, 'model')
  if (rawModel) {
    // Some insurers (Allianz Peugeot) run the full trim string onto one line
    // ("308 COMFORT 1.6 VTI (120) 5 KAPI OV (792)"). STOP_LABELS catches
    // `Kullanım Şekli` / `Yer Adedi` etc. as terminators; the 80-char cap
    // still guards against pathological captures that bypassed those.
    const cleaned = rawModel.replace(/[\n\r].*/, '').trim()
    if (cleaned.length >= 1 && cleaned.length <= 80) {
      result.model = cleaned
    }
  }

  // Model year — accepts Model Yılı / Model Bilgisi / İmal Yılı / Üretim Yılı /
  // Model Year / Araç Yılı / bare `MODEL: <year>`.
  const rawYear = matchLabeledField(sanitizedText, 'modelYear')
  if (rawYear) {
    const y = rawYear.match(/\b(\d{4})\b/)
    if (y) {
      const yr = parseInt(y[1], 10)
      if (yr >= 1950 && yr <= new Date().getFullYear() + 1) {
        result.year = yr
      }
    }
  }

  // Engine / motor number — `Motor No: CZE307964` and variants.
  const rawEngine = matchLabeledField(sanitizedText, 'motorNo')
  if (rawEngine) {
    const m = rawEngine.match(/\b([A-Z0-9]{5,20})\b/i)
    if (m && /\d/.test(m[1])) result.engineNo = m[1].toUpperCase()
  }

  // Chassis / VIN — `Şasi No: WVGZZZ5NZHW862628` and variants.
  const rawChassis = matchLabeledField(sanitizedText, 'chassisNo')
  if (rawChassis) {
    const m = rawChassis.match(/\b([A-Z0-9]{6,20})\b/i)
    if (m && /\d/.test(m[1])) result.chassisNo = m[1].toUpperCase()
  }

  // ---------------------------------------------------------------------------
  // FALLBACK: Global pattern heuristics for broken tabular OCR
  // When OCR splits labels into one text block and values into another block,
  // `matchLabeledField` completely fails. We use global regex heuristics here.
  // ---------------------------------------------------------------------------

  if (!result.chassisNo) {
    const chassisMatches = sanitizedText.match(/\b([A-Z0-9]{17})\b/gi)
    if (chassisMatches) {
      for (const m of chassisMatches) {
        if (/[A-Z]/i.test(m) && /\d/.test(m)) {
          result.chassisNo = m.toUpperCase()
          break
        }
      }
    }
  }

  const standaloneValues =
    sanitizedText.match(/^[:\s]+(.+)$/gim)?.map((l) => l.replace(/^[:\s]+/, '').trim()) || []

  if (!result.engineNo) {
    for (const v of standaloneValues) {
      const upperV = v.toUpperCase()
      if (
        upperV !== result.chassisNo &&
        upperV.length >= 6 &&
        upperV.length <= 15 &&
        /[A-Z]/.test(upperV) &&
        /\d/.test(upperV)
      ) {
        if (/^[A-Z0-9]+$/.test(upperV)) {
          result.engineNo = upperV
          break
        }
      }
    }
  }

  if (!result.year) {
    for (const v of standaloneValues) {
      if (/^(?:19|20)\d{2}$/.test(v)) {
        const parsedYear = parseInt(v, 10)
        if (parsedYear >= 1950 && parsedYear <= new Date().getFullYear() + 1) {
          result.year = parsedYear
          break
        }
      }
    }

    if (!result.year) {
      const lines = sanitizedText.split('\n').map((l) => l.trim())
      const modelIndex = lines.findIndex((l) => /\b(?:MODEL|MODEL[Iİ]? YILI)\b/i.test(l))
      if (modelIndex !== -1) {
        for (let i = modelIndex + 1; i < Math.min(lines.length, modelIndex + 20); i++) {
          if (/^(?:19|20)\d{2}$/.test(lines[i])) {
            const parsedYear = parseInt(lines[i], 10)
            if (parsedYear >= 1950 && parsedYear <= new Date().getFullYear() + 1) {
              result.year = parsedYear
              break
            }
          }
        }
      }
    }
  }

  if (!result.make) {
    const COMMON_MAKES = [
      'RENAULT',
      'FIAT',
      'FORD',
      'VOLKSWAGEN',
      'HYUNDAI',
      'TOYOTA',
      'HONDA',
      'DACIA',
      'PEUGEOT',
      'OPEL',
      'CITROEN',
      'NISSAN',
      'SKODA',
      'SEAT',
      'KIA',
      'AUDI',
      'BMW',
      'MERCEDES-BENZ',
      'MERCEDES',
      'VOLVO',
      'SUZUKI',
      'MAZDA',
      'CHEVROLET',
      'IVECO',
      'ISUZU',
      'MITSUBISHI',
    ]
    for (const v of standaloneValues) {
      const upperV = v.toUpperCase()
      for (const make of COMMON_MAKES) {
        if (upperV.includes(make)) {
          // Store just the first word, or the matching make
          result.make = v.split(/\s+/)[0]
          break
        }
      }
      if (result.make) break
    }
  }

  if (!result.model) {
    const nonModelPatterns = [
      /^(?:evet|hay[ıi]r|var|yok|yoktur|vard[iı]r)$/i, // booleans
      /^(?:standart|muafiyetsiz|di[ğg]er|or[j|i]inal|cam|kasko|i[h|s]tiyari|belirsiz|yeni|ikinci\s*el)$/i, // common policy terms
      /sigorta|poli[çc]e|acente|broker|b[oö]lge|m[uü]d[uü]rl[uü][gğ][uü]|a\.[sş]\.|anonim/i, // company/agency names
      /cad\.|cadde|sok\.|sokak|mah\.|mahalle|bulvar|meydan|plaza|no:|kat:|d:|bulvar[ıi]/i, // addresses
      /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/, // dates
      /^\d+$/, // pure numbers
      /^\d+\s*(?:g[üu]n|ay|y[ıi]l|saat)$/i, // durations
      /hususi|ticari|kamyon|otomobil|m[iı]n[iı]b[üu]s|trakt[öo]r|motosiklet/i, // usage/class
      /^[:\-\s0]+$/, // empty/symbols
      /^\[PAGE\s*\d+\]$/i, // page markers
      /^[A-Z0-9]{2,}-\d{3,}$/i, // agency codes
      /^GSM$/i,
    ]

    let makeIndex = -1
    if (result.make) {
      makeIndex = standaloneValues.findIndex((v) =>
        v.toUpperCase().includes(result.make!.toUpperCase())
      )
    }
    const startIndex = makeIndex >= 0 ? makeIndex + 1 : 0

    for (let i = startIndex; i < standaloneValues.length; i++) {
      const v = standaloneValues[i]
      const isMake = result.make ? v.toUpperCase().includes(result.make.toUpperCase()) : false
      const isYear = v === result.year?.toString()
      const isPlate = result.plate
        ? v.replace(/\s+/g, '') === result.plate.replace(/\s+/g, '')
        : false
      const isChassis = result.chassisNo ? v.toUpperCase() === result.chassisNo : false
      const isEngine = result.engineNo ? v.toUpperCase() === result.engineNo : false

      if (!isMake && !isYear && !isPlate && !isChassis && !isEngine) {
        if (v.length < 3 || v.length > 50) continue

        let isExcluded = false
        for (const pattern of nonModelPatterns) {
          if (pattern.test(v)) {
            isExcluded = true
            break
          }
        }

        if (!isExcluded && /[a-z]/i.test(v)) {
          result.model = v
          break
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

// =============================================================================
// INDUSTRY CLASSIFICATION
// =============================================================================

export type HighRiskIndustry = 'mining' | 'construction' | 'transport' | 'manufacturing'

/**
 * Infer the industry from the insured entity name.
 * Used for contextual risk linking (e.g., checking if a mining company
 * has quarry exclusions).
 */
export function inferIndustryFromInsuredName(
  name: string | null | undefined
): HighRiskIndustry | null {
  if (!name) return null
  const lowerName = normalizeTurkishChars(name).toLowerCase()

  if (lowerName.includes('maden') || lowerName.includes('mermer')) {
    return 'mining'
  }

  if (
    lowerName.includes('insaat') ||
    lowerName.includes('hafriyat') ||
    lowerName.includes('yapi') ||
    lowerName.includes('mimarlik') ||
    lowerName.includes('muhendislik')
  ) {
    return 'construction'
  }

  if (
    lowerName.includes('nakliyat') ||
    lowerName.includes('lojistik') ||
    lowerName.includes('tasimacilik') ||
    lowerName.includes('kargo')
  ) {
    return 'transport'
  }

  if (
    lowerName.includes('uretim') ||
    lowerName.includes('imalat') ||
    lowerName.includes('sanayi') ||
    lowerName.includes('fabrika') ||
    lowerName.includes('tekstil')
  ) {
    return 'manufacturing'
  }

  return null
}

// =============================================================================
// TC KIMLIK (NATIONAL ID) VALIDATION
// =============================================================================

/**
 * Validate Turkish national ID number (TC Kimlik No)
 * 11 digits with checksum validation
 */
export function isValidTCKimlik(tcNo: string): boolean {
  if (!tcNo || typeof tcNo !== 'string') return false

  // Must be 11 digits
  const cleaned = tcNo.replace(/\D/g, '')
  if (cleaned.length !== 11) return false

  // First digit cannot be 0
  if (cleaned[0] === '0') return false

  const digits = cleaned.split('').map(Number)

  // Algorithm validation
  const sumOdd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
  const sumEven = digits[1] + digits[3] + digits[5] + digits[7]

  const check1 = (sumOdd * 7 - sumEven) % 10
  if (check1 !== digits[9]) return false

  const sumFirst10 = digits.slice(0, 10).reduce((a, b) => a + b, 0)
  const check2 = sumFirst10 % 10
  if (check2 !== digits[10]) return false

  return true
}

/**
 * Validate Turkish Tax Identification Number (VKN / Vergi Kimlik No)
 * 10 digits with a checksum. Used for business entities (as opposed to the
 * 11-digit TCKN for individuals).
 *
 * Algorithm: for each of the first 9 digits at position i (0-indexed),
 * compute v = (d + 10 - i) % 10, then t = (v * 2^(9 - i)) % 9 (0 → 9).
 * Sum of the nine t values modulo 10 must equal the 10th digit.
 */
export function isValidVKN(vknNo: string): boolean {
  if (!vknNo || typeof vknNo !== 'string') return false
  const cleaned = vknNo.replace(/\D/g, '')
  if (cleaned.length !== 10) return false

  const digits = cleaned.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const d = digits[i]
    const v = (d + 10 - i) % 10
    // v === 0 → contribution is 0; else (v * 2^(9 - i)) % 9, mapping 0→9
    if (v === 0) continue
    let t = (v * Math.pow(2, 9 - i)) % 9
    if (t === 0) t = 9
    sum += t
  }
  const check = (10 - (sum % 10)) % 10
  return check === digits[9]
}

/**
 * Detect insured-entity type from an insuredPerson / identifier string.
 * Returns 'business' when a valid 10-digit VKN is found, 'personal' when a
 * valid 11-digit TCKN is found, 'unknown' otherwise. Also handles common
 * merged forms like "ŞİRKETİ" / "LİMİTED" / "A.Ş." / "LTD." in the name
 * (business heuristics even if no ID digits are present).
 */
export type InsuredEntityType = 'business' | 'personal' | 'unknown'

export function detectInsuredEntityType(value: string | undefined | null): InsuredEntityType {
  if (!value || typeof value !== 'string') return 'unknown'

  // Extract all digit runs and test for VKN / TCKN
  const digitRuns = value.match(/\d{10,11}/g) ?? []
  for (const run of digitRuns) {
    if (run.length === 11 && isValidTCKimlik(run)) return 'personal'
    if (run.length === 10 && isValidVKN(run)) return 'business'
  }

  // Name-based business heuristics (company suffixes)
  const BUSINESS_NAME_PATTERNS = [
    /\bA\.?Ş\.?\b/i,
    /\bLTD\.?\b/i,
    /\bL[İI]M[İI]TED\b/i,
    /\bANON[İI]M\b/i,
    /\bŞ[İI]RKET[İI]?\b/i,
    /\bT[İI]CARET\b/i,
    /\bSANAY[İI]\b/i,
    /\bHOLDING\b/i,
    /\bKOOPERAT[İI]F\b/i,
    /\bDERNEK\b/i,
  ]
  for (const pattern of BUSINESS_NAME_PATTERNS) {
    if (pattern.test(value)) return 'business'
  }
  return 'unknown'
}

// =============================================================================
// POLICY NUMBER NORMALIZATION
// =============================================================================

/**
 * Normalize policy number format
 */
export function normalizePolicyNumber(policyNo: string): string {
  if (!policyNo) return ''

  return policyNo
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^\w-]/g, '')
    .trim()
}

// =============================================================================
// FIELD EXTRACTION HELPERS
// =============================================================================

/**
 * Extract premium from text with Turkish formatting
 */
export function extractPremiumFromText(text: string): {
  amount: number
  currency: string
} | null {
  // Look for premium-related keywords near amounts
  const premiumKeywords = ['prim', 'premium', 'toplam', 'tutar', 'ödeme', 'net prim', 'brüt prim']

  const lines = text.split('\n')

  for (const line of lines) {
    const lowerLine = line.toLowerCase()

    // Check if line contains premium keyword
    const hasPremiumKeyword = premiumKeywords.some((kw) => lowerLine.includes(kw))
    if (!hasPremiumKeyword) continue

    // Try to extract amount from this line
    for (const pattern of CURRENCY_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        const amount = parseTurkishCurrency(match[0])
        if (amount !== null && amount > 0) {
          return { amount, currency: 'TRY' }
        }
      }
    }

    // Also try plain numbers on premium lines
    const numberMatch = line.match(/[\d.,]+/)
    if (numberMatch) {
      const amount = parseTurkishCurrency(numberMatch[0])
      if (amount !== null && amount > 100 && amount < 10000000) {
        return { amount, currency: 'TRY' }
      }
    }
  }

  return null
}

/**
 * Detect policy type from document text
 */
export function detectPolicyTypeFromText(
  text: string
): 'kasko' | 'traffic' | 'home' | 'health' | 'life' | 'dask' | 'business' | null {
  const lowerText = normalizeTurkishChars(text.toLowerCase())

  // Type indicators with weights
  const indicators: Record<string, { patterns: string[]; weight: number }> = {
    kasko: {
      patterns: ['kasko', 'arac sigortasi', 'comprehensive', 'sasi no', 'plaka'],
      weight: 0,
    },
    traffic: {
      patterns: ['trafik sigortasi', 'zorunlu mali sorumluluk', 'mtpl', 'traffic insurance'],
      weight: 0,
    },
    home: {
      patterns: ['konut', 'ev sigortasi', 'mesken', 'bina', 'esya'],
      weight: 0,
    },
    health: {
      patterns: ['saglik', 'hastane', 'tedavi', 'health', 'tibbi'],
      weight: 0,
    },
    life: {
      patterns: ['hayat', 'vefat', 'lehdar', 'life insurance', 'olum'],
      weight: 0,
    },
    dask: {
      patterns: ['dask', 'zorunlu deprem', 'deprem sigortasi'],
      weight: 0,
    },
    business: {
      patterns: ['isyeri', 'ticari', 'isletme', 'sirket', 'business'],
      weight: 0,
    },
  }

  // Count matches
  for (const [type, config] of Object.entries(indicators)) {
    for (const pattern of config.patterns) {
      if (lowerText.includes(pattern)) {
        indicators[type].weight += 1
      }
    }
  }

  // Find type with highest weight
  let maxWeight = 0
  let detectedType: string | null = null

  for (const [type, config] of Object.entries(indicators)) {
    if (config.weight > maxWeight) {
      maxWeight = config.weight
      detectedType = type
    }
  }

  // Require at least 1 match
  if (maxWeight === 0) return null

  return detectedType as ReturnType<typeof detectPolicyTypeFromText>
}

// =============================================================================
// ADDRESS PARSING
// =============================================================================

/**
 * Turkish province codes and names
 */
const PROVINCE_CODES: Record<string, string> = {
  '01': 'Adana',
  '06': 'Ankara',
  '07': 'Antalya',
  '16': 'Bursa',
  '34': 'İstanbul',
  '35': 'İzmir',
  '41': 'Kocaeli',
  // ... add more as needed
}

/**
 * Extract province from address
 */
export function extractProvinceFromAddress(address: string): { code: string; name: string } | null {
  if (!address) return null

  const upperAddress = address.toUpperCase()

  // Check for province names
  for (const [code, name] of Object.entries(PROVINCE_CODES)) {
    if (upperAddress.includes(name.toUpperCase())) {
      return { code, name }
    }
  }

  // Check for province codes at start (common in addresses)
  const codeMatch = address.match(/\b(\d{2})\b/)
  if (codeMatch) {
    const code = codeMatch[1]
    if (PROVINCE_CODES[code]) {
      return { code, name: PROVINCE_CODES[code] }
    }
  }

  return null
}
