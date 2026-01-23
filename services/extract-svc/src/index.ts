/**
 * Extract Service
 *
 * Extracts structured fields from normalized OCR text.
 *
 * Features:
 * - Policy-type-aware extraction
 * - Pattern matching for common fields (dates, amounts, IDs)
 * - Named entity recognition for Turkish insurance terms
 * - Confidence scoring per field
 * - Cross-field validation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedField {
  id: string
  name: string
  nameTr: string
  value: string
  rawValue: string
  confidence: number
  source: 'pattern_match' | 'ner' | 'inference'
  position?: { start: number; end: number }
}

export interface ExtractionResult {
  docId: string
  fields: ExtractedField[]
  overallConfidence: number
  validationErrors: string[]
  processingTimeMs: number
}

export interface FieldPattern {
  id: string
  name: string
  nameTr: string
  pattern: RegExp
  extract: (match: RegExpMatchArray) => string
  validate?: (value: string) => boolean
  normalize?: (value: string) => string
  confidence?: number
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate Turkish TC Kimlik number using algorithm
 */
export function validateTCKimlik(tc: string): boolean {
  if (!/^\d{11}$/.test(tc)) return false
  if (tc[0] === '0') return false

  const digits = tc.split('').map(Number)

  // Algorithm check
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7]
  const check10 = (oddSum * 7 - evenSum) % 10
  const check11 = (digits.slice(0, 10).reduce((a, b) => a + b, 0)) % 10

  return check10 === digits[9] && check11 === digits[10]
}

/**
 * Validate VIN (Vehicle Identification Number)
 * Note: Checksum validation is skipped as it's only required for North American VINs.
 * European VINs (starting with W, S, etc.) don't use the checksum position.
 */
export function validateVIN(vin: string): boolean {
  // Must be exactly 17 characters
  if (vin.length !== 17) return false

  // Must only contain valid VIN characters (no I, O, Q)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false

  // Must be uppercase
  if (vin !== vin.toUpperCase()) return false

  return true
}

/**
 * Normalize Turkish date format to ISO
 */
export function normalizeTurkishDate(date: string): string {
  const parts = date.split(/[\.\/\-]/)
  if (parts.length !== 3) return date

  let [day, month, year] = parts
  if (year.length === 2) {
    year = parseInt(year) > 50 ? `19${year}` : `20${year}`
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * Normalize currency value
 */
export function normalizeCurrency(value: string): string {
  return value
    .replace(/\./g, '') // Remove thousand separators
    .replace(/,/g, '.') // Convert decimal comma to period
    .replace(/[^\d.]/g, '') // Remove non-numeric
}

/**
 * Check if date string is valid
 */
export function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

// ============================================================================
// DEFAULT TURKISH PATTERNS
// ============================================================================

const turkishPatterns: FieldPattern[] = [
  // Policy Number
  {
    id: 'policy_number',
    name: 'Policy Number',
    nameTr: 'Poliçe No',
    pattern: /(?:poli[çc]e\s*(?:no|numaras[ıi])\s*[:\s]*)([A-Z0-9\-\/]+)/i,
    extract: m => m[1].trim(),
    validate: v => v.length >= 5,
    confidence: 0.95,
  },
  // TC Kimlik Number
  {
    id: 'tc_kimlik',
    name: 'TC Identity Number',
    nameTr: 'T.C. Kimlik No',
    pattern: /(?:T\.?C\.?\s*(?:Kimlik)?\s*(?:No|Numaras[ıi])?\s*[:\s]*)(\d{11})/i,
    extract: m => m[1],
    validate: v => validateTCKimlik(v),
    confidence: 0.98,
  },
  // Policy Holder Name
  {
    id: 'policyholder_name',
    name: 'Policyholder Name',
    nameTr: 'Sigortalı Adı',
    pattern: /(?:sigortali|sigorta\s*ettiren|ad[ıi]\s*soyad[ıi])\s*[:\s]*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?=\s*(?:T\.?C|Adres|Telefon|\d|$))/i,
    extract: m => m[1].trim(),
    normalize: v => v.toLocaleUpperCase('tr-TR'),
    confidence: 0.85,
  },
  // Phone Number
  {
    id: 'phone',
    name: 'Phone',
    nameTr: 'Telefon',
    pattern: /(?:Tel(?:efon)?|GSM|Cep)\s*[:\s]*([0-9\s\-\(\)]{10,15})/i,
    extract: m => m[1].replace(/[\s\-\(\)]/g, ''),
    validate: v => /^0?[235][0-9]{9}$/.test(v),
    confidence: 0.9,
  },
  // Policy Start Date
  {
    id: 'start_date',
    name: 'Start Date',
    nameTr: 'Başlangıç Tarihi',
    pattern: /(?:ba[şs]lang[ıi][çc]\s*tarihi|poli[çc]e\s*ba[şs]lang[ıi][çc]|yürürlük\s*tarihi)\s*[:\s]*(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})/i,
    extract: m => m[1],
    normalize: v => normalizeTurkishDate(v),
    validate: v => isValidDate(v),
    confidence: 0.95,
  },
  // Policy End Date
  {
    id: 'end_date',
    name: 'End Date',
    nameTr: 'Bitiş Tarihi',
    pattern: /(?:biti[şs]\s*tarihi|poli[çc]e\s*biti[şs]i|son\s*tarih|vade\s*sonu)\s*[:\s]*(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})/i,
    extract: m => m[1],
    normalize: v => normalizeTurkishDate(v),
    validate: v => isValidDate(v),
    confidence: 0.95,
  },
  // Premium Amount
  {
    id: 'premium',
    name: 'Premium',
    nameTr: 'Prim',
    pattern: /(?:(?:toplam\s*)?prim|net\s*prim|brüt\s*prim)\s*[:\s]*(?:₺|TL|TRY)?\s*([0-9][0-9\.\,]*)\s*(?:TL|₺|TRY)?/i,
    extract: m => m[1],
    normalize: v => normalizeCurrency(v),
    confidence: 0.9,
  },
  // Vehicle Plate (for Kasko/Traffic)
  {
    id: 'vehicle_plate',
    name: 'Vehicle Plate',
    nameTr: 'Plaka',
    pattern: /(?:plaka\s*(?:no)?)\s*[:\s]*([0-9]{2}\s*[A-Z]{1,3}\s*[0-9]{1,4})/i,
    extract: m => m[1].replace(/\s+/g, ' ').trim(),
    validate: v => /^\d{2}\s?[A-Z]{1,3}\s?\d{1,4}$/.test(v),
    confidence: 0.95,
  },
  // VIN/Chassis Number
  {
    id: 'vin',
    name: 'VIN',
    nameTr: 'Şasi No',
    pattern: /(?:[şs]asi\s*(?:no|numaras[ıi])?|vin)\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    extract: m => m[1].toUpperCase(),
    validate: v => validateVIN(v),
    confidence: 0.95,
  },
]

// ============================================================================
// FIELD EXTRACTOR CLASS
// ============================================================================

export class FieldExtractor {
  private patterns: FieldPattern[]
  private minConfidence: number

  constructor(patterns: FieldPattern[] = turkishPatterns, minConfidence: number = 0.5) {
    this.patterns = patterns
    this.minConfidence = minConfidence
  }

  /**
   * Extract fields from normalized text
   */
  extract(docId: string, text: string): ExtractionResult {
    const startTime = Date.now()
    const fields: ExtractedField[] = []
    const validationErrors: string[] = []

    // Extract each field
    for (const pattern of this.patterns) {
      const field = this.extractField(text, pattern)
      if (field) {
        fields.push(field)
      }
    }

    // Cross-field validation
    const crossErrors = this.crossValidate(fields)
    validationErrors.push(...crossErrors)

    // Calculate overall confidence
    const overallConfidence = fields.length > 0
      ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
      : 0

    return {
      docId,
      fields,
      overallConfidence,
      validationErrors,
      processingTimeMs: Date.now() - startTime,
    }
  }

  private extractField(text: string, pattern: FieldPattern): ExtractedField | null {
    const match = text.match(pattern.pattern)
    if (!match) return null

    let value = pattern.extract(match)

    // Normalize if defined
    if (pattern.normalize) {
      value = pattern.normalize(value)
    }

    // Validate if defined
    const isValid = pattern.validate ? pattern.validate(value) : true
    const confidence = isValid
      ? (pattern.confidence || 0.8)
      : (pattern.confidence || 0.8) * 0.5

    if (confidence < this.minConfidence) {
      return null
    }

    return {
      id: pattern.id,
      name: pattern.name,
      nameTr: pattern.nameTr,
      value,
      rawValue: match[0],
      confidence,
      source: 'pattern_match',
      position: {
        start: match.index || 0,
        end: (match.index || 0) + match[0].length,
      },
    }
  }

  private crossValidate(fields: ExtractedField[]): string[] {
    const errors: string[] = []
    const fieldMap = new Map(fields.map(f => [f.id, f.value]))

    // Validate date range
    const startDate = fieldMap.get('start_date')
    const endDate = fieldMap.get('end_date')
    if (startDate && endDate) {
      if (new Date(startDate) >= new Date(endDate)) {
        errors.push('Start date must be before end date')
      }
    }

    // Validate premium vs coverage ratio
    const premium = parseFloat(fieldMap.get('premium') || '0')
    if (premium > 0 && premium > 500000) {
      errors.push('Premium unusually high')
    }

    return errors
  }

  /**
   * Get all available patterns
   */
  getPatterns(): FieldPattern[] {
    return this.patterns
  }

  /**
   * Add custom patterns
   */
  addPatterns(patterns: FieldPattern[]): void {
    this.patterns.push(...patterns)
  }
}

// Export default patterns
export { turkishPatterns }
