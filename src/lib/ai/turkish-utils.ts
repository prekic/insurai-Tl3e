/**
 * Turkish Text Handling Utilities
 *
 * Utilities for parsing and normalizing Turkish insurance documents.
 * Handles date formats, currency, character normalization, and field matching.
 */

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
 * Extract vehicle metadata (make, model, year, plate, chassis) from raw
 * Turkish kasko policy text. Uses regex patterns matching common section
 * labels: "Marka", "Tip", "Model Yılı", "Plaka", "Şasi No".
 *
 * Returns undefined if no fields could be extracted.
 */
export function extractVehicleInfoFromText(rawText: string):
  | {
      make?: string
      model?: string
      year?: number
      plate?: string
      chassisNo?: string
    }
  | undefined {
  if (!rawText || typeof rawText !== 'string') return undefined

  const result: {
    make?: string
    model?: string
    year?: number
    plate?: string
    chassisNo?: string
  } = {}

  // Plate — already-existing PLATE_PATTERN
  const plateMatch = rawText.match(/\b(\d{2})\s*([A-Z]{1,3})\s*(\d{1,4})\b/)
  if (plateMatch) {
    const cityNum = parseInt(plateMatch[1], 10)
    if (cityNum >= 1 && cityNum <= 81) {
      result.plate = `${plateMatch[1]} ${plateMatch[2]} ${plateMatch[3]}`
    }
  }

  // Make — "Marka", "Marka/Tip", or "MARKASI/TİPİ" followed by value
  // e.g. "Marka : PEUGEOT", "MARKASI/TİPİ: IVECO/KAMYON 80-12"
  // Allow wide spacing (column-aligned layouts) between colon and value.
  const makeMatch = rawText.match(
    /Marka(?:s[ıi])?\s*(?:\/\s*T[iİ]p[iİ]?)?\s*[:.]?\s{0,50}([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\d\s.\-/]{1,80})/i
  )
  if (makeMatch) {
    const raw = makeMatch[1].trim()
    // Take the first word as make (e.g., "PEUGEOT" from "PEUGEOT 308 COMFORT")
    const parts = raw.split(/\s+/)
    if (parts[0] && parts[0].length >= 2 && parts[0].length <= 25) {
      result.make = parts[0]
      // Take the rest as model if reasonable length
      if (parts.length > 1) {
        const modelStr = parts
          .slice(1)
          .join(' ')
          .replace(/[\n\r,.;:].*/, '')
          .trim()
        if (modelStr.length >= 1 && modelStr.length <= 60) {
          result.model = modelStr
        }
      }
    }
  }

  // Standalone Tip / Model field — "Tip : 308 COMFORT 1.6"
  if (!result.model) {
    const tipMatch = rawText.match(
      /(?:^|\n)\s*Tip\s*[:.]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\d\s.\-/]{1,60})/i
    )
    if (tipMatch) {
      const cleaned = tipMatch[1].replace(/[\n\r,.;:].*/, '').trim()
      if (cleaned.length >= 2 && cleaned.length <= 60) {
        result.model = cleaned
      }
    }
  }

  // Model year — "Model Yılı : 2010" or standalone "MODEL: 1997"
  // (handle dotless İ + various separators + wide spacing)
  const yearMatch = rawText.match(/Model\s*(?:Y[ıi]l[ıi]?)?\s*[:.]?\s{0,50}(\d{4})/i)
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10)
    if (yr >= 1950 && yr <= new Date().getFullYear() + 1) {
      result.year = yr
    }
  }

  // Chassis — "Şasi No : VF34..." or "Sasi No"
  const chassisMatch = rawText.match(/[ŞS]asi\s*(?:No)?\s*[:.]?\s*([A-Z0-9]{6,20})/i)
  if (chassisMatch) {
    result.chassisNo = chassisMatch[1].toUpperCase()
  }

  return Object.keys(result).length > 0 ? result : undefined
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
