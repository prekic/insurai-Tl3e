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

import type {
  ExtractionResult,
  ExtractionTarget,
  ExtractedField,
  PolicyType,
} from '@insurai/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  minFieldConfidence: 0.5,
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    bucket: process.env.EXTRACT_BUCKET || 'extractions',
  },
}

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractRequest {
  docId: string
  locale: string
  policyType: string | null
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
// FIELD PATTERNS BY LOCALE
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
  // Address
  {
    id: 'address',
    name: 'Address',
    nameTr: 'Adres',
    pattern: /(?:adres[i]?\s*[:\s]*)(.+?)(?=(?:Telefon|Tel|GSM|E-?mail|Faks|\n\n|\d{10,11}))/is,
    extract: m => m[1].trim().replace(/\s+/g, ' '),
    confidence: 0.75,
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
    pattern: /(?:(?:toplam\s*)?prim|net\s*prim|brüt\s*prim)\s*[:\s]*([0-9\.\,]+)\s*(?:TL|₺|TRY)?/i,
    extract: m => m[1],
    normalize: v => normalizeCurrency(v),
    confidence: 0.9,
  },
  // Coverage Amount
  {
    id: 'coverage',
    name: 'Coverage',
    nameTr: 'Teminat',
    pattern: /(?:teminat\s*(?:tutar[ıi])?|sigorta\s*bedeli)\s*[:\s]*([0-9\.\,]+)\s*(?:TL|₺|TRY)?/i,
    extract: m => m[1],
    normalize: v => normalizeCurrency(v),
    confidence: 0.85,
  },
  // Deductible
  {
    id: 'deductible',
    name: 'Deductible',
    nameTr: 'Muafiyet',
    pattern: /(?:muafiyet|öz\s*risk)\s*[:\s]*([0-9\.\,]+\s*(?:TL|₺|TRY|%)?)/i,
    extract: m => m[1].trim(),
    confidence: 0.85,
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
  // Insurance Company
  {
    id: 'insurer',
    name: 'Insurance Company',
    nameTr: 'Sigorta Şirketi',
    pattern: /(?:sigorta\s*[şs]irketi|sigortac[ıi])\s*[:\s]*(.+?)(?=\s*(?:Acente|Poli[çc]e|Tel|\n))/i,
    extract: m => m[1].trim(),
    confidence: 0.8,
  },
  // Agency
  {
    id: 'agency',
    name: 'Agency',
    nameTr: 'Acente',
    pattern: /(?:acent[ae])\s*[:\s]*(.+?)(?=\s*(?:Tel|Adres|Poli[çc]e|\n))/i,
    extract: m => m[1].trim(),
    confidence: 0.75,
  },
]

// Additional patterns for Motor Kasko
const motorKaskoPatterns: FieldPattern[] = [
  {
    id: 'vehicle_brand',
    name: 'Vehicle Brand',
    nameTr: 'Araç Markası',
    pattern: /(?:marka)\s*[:\s]*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?=\s*(?:Model|Tip|Yıl|\n))/i,
    extract: m => m[1].trim(),
    confidence: 0.85,
  },
  {
    id: 'vehicle_model',
    name: 'Vehicle Model',
    nameTr: 'Araç Modeli',
    pattern: /(?:model)\s*[:\s]*([A-ZÇĞİÖŞÜa-zçğıöşü0-9\s]+?)(?=\s*(?:Y[ıi]l|Tip|Renk|\n))/i,
    extract: m => m[1].trim(),
    confidence: 0.8,
  },
  {
    id: 'vehicle_year',
    name: 'Vehicle Year',
    nameTr: 'Model Yılı',
    pattern: /(?:model\s*y[ıi]l[ıi]|y[ıi]l)\s*[:\s]*((?:19|20)\d{2})/i,
    extract: m => m[1],
    validate: v => {
      const year = parseInt(v)
      return year >= 1950 && year <= new Date().getFullYear() + 1
    },
    confidence: 0.95,
  },
  {
    id: 'vehicle_value',
    name: 'Vehicle Value',
    nameTr: 'Araç Değeri',
    pattern: /(?:ara[çc]\s*de[ğg]eri|sigorta\s*de[ğg]eri|rayiç\s*de[ğg]er)\s*[:\s]*([0-9\.\,]+)\s*(?:TL|₺)?/i,
    extract: m => m[1],
    normalize: v => normalizeCurrency(v),
    confidence: 0.85,
  },
]

// Additional patterns for Property/Fire
const propertyPatterns: FieldPattern[] = [
  {
    id: 'property_address',
    name: 'Property Address',
    nameTr: 'Riziko Adresi',
    pattern: /(?:riziko\s*adresi|sigortal[ıi]\s*yer)\s*[:\s]*(.+?)(?=\s*(?:Bina|Yap[ıi]|Kat|\n\n))/is,
    extract: m => m[1].trim().replace(/\s+/g, ' '),
    confidence: 0.75,
  },
  {
    id: 'building_type',
    name: 'Building Type',
    nameTr: 'Yapı Tarzı',
    pattern: /(?:yap[ıi]\s*tarz[ıi]|bina\s*tipi)\s*[:\s]*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?=\s*(?:Kat|Alan|m²|\n))/i,
    extract: m => m[1].trim(),
    confidence: 0.8,
  },
  {
    id: 'floor_area',
    name: 'Floor Area',
    nameTr: 'Alan',
    pattern: /(?:alan|brüt\s*alan)\s*[:\s]*([0-9\.\,]+)\s*(?:m²|m2|metrekare)?/i,
    extract: m => m[1],
    normalize: v => normalizeCurrency(v),
    confidence: 0.85,
  },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateTCKimlik(tc: string): boolean {
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

function validateVIN(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false

  // VIN checksum validation
  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  }
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

  let sum = 0
  for (let i = 0; i < 17; i++) {
    const char = vin[i]
    const value = /\d/.test(char) ? parseInt(char) : transliteration[char]
    sum += value * weights[i]
  }

  const remainder = sum % 11
  const checkDigit = remainder === 10 ? 'X' : remainder.toString()

  return vin[8] === checkDigit
}

function normalizeTurkishDate(date: string): string {
  // Convert DD.MM.YYYY or DD/MM/YY to YYYY-MM-DD
  const parts = date.split(/[\.\/\-]/)
  if (parts.length !== 3) return date

  let [day, month, year] = parts
  if (year.length === 2) {
    year = parseInt(year) > 50 ? `19${year}` : `20${year}`
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function normalizeCurrency(value: string): string {
  // Remove thousand separators and normalize decimal
  return value
    .replace(/\./g, '') // Remove thousand separators
    .replace(/,/g, '.') // Convert decimal comma to period
    .replace(/[^\d.]/g, '') // Remove non-numeric
}

function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

// ============================================================================
// FIELD EXTRACTOR
// ============================================================================

export class FieldExtractor {
  private patterns: Map<string, FieldPattern[]> = new Map()

  constructor() {
    // Register patterns by policy type
    this.patterns.set('default', turkishPatterns)
    this.patterns.set('motor_kasko', [...turkishPatterns, ...motorKaskoPatterns])
    this.patterns.set('motor_traffic', [...turkishPatterns, ...motorKaskoPatterns])
    this.patterns.set('property_fire', [...turkishPatterns, ...propertyPatterns])
  }

  /**
   * Extract fields from normalized text
   */
  async extract(
    docId: string,
    normalizedText: string,
    locale: string,
    policyType: string | null
  ): Promise<ExtractionResult> {
    const startTime = Date.now()
    const extractedFields: ExtractedField[] = []
    const targets: ExtractionTarget[] = []

    // Get patterns for policy type
    const patterns = this.patterns.get(policyType || 'default') || this.patterns.get('default')!

    // Build extraction targets from patterns
    for (const pattern of patterns) {
      targets.push({
        fieldId: pattern.id,
        fieldName: pattern.name,
        required: ['policy_number', 'start_date', 'end_date', 'premium'].includes(pattern.id),
        patterns: [pattern.pattern.source],
        validators: pattern.validate ? ['custom'] : [],
      })
    }

    // Extract each field
    for (const pattern of patterns) {
      const field = await this.extractField(normalizedText, pattern)
      if (field) {
        extractedFields.push(field)
      }
    }

    // Cross-field validation
    const validationErrors = this.crossValidate(extractedFields)

    // Calculate overall confidence
    const avgConfidence = extractedFields.length > 0
      ? extractedFields.reduce((sum, f) => sum + f.confidence, 0) / extractedFields.length
      : 0

    return {
      docId,
      fields: extractedFields,
      targets,
      overallConfidence: avgConfidence,
      validationErrors,
      processingTimeMs: Date.now() - startTime,
    }
  }

  private async extractField(
    text: string,
    pattern: FieldPattern
  ): Promise<ExtractedField | null> {
    const match = text.match(pattern.pattern)
    if (!match) return null

    let value = pattern.extract(match)

    // Normalize if defined
    if (pattern.normalize) {
      value = pattern.normalize(value)
    }

    // Validate if defined
    const isValid = pattern.validate ? pattern.validate(value) : true
    const confidence = isValid ? (pattern.confidence || 0.8) : (pattern.confidence || 0.8) * 0.5

    if (confidence < config.minFieldConfidence) {
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
      boundingBoxes: [], // Would be populated if we had token positions
    }
  }

  private crossValidate(fields: ExtractedField[]): string[] {
    const errors: string[] = []

    // Get field map for easy lookup
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
    const coverage = parseFloat(fieldMap.get('coverage') || '0')
    if (premium > 0 && coverage > 0) {
      const ratio = premium / coverage
      if (ratio > 0.5) {
        errors.push('Premium to coverage ratio unusually high')
      }
    }

    // Validate vehicle year for motor policies
    const vehicleYear = fieldMap.get('vehicle_year')
    if (vehicleYear) {
      const year = parseInt(vehicleYear)
      if (year > new Date().getFullYear() + 1) {
        errors.push('Vehicle year is in the future')
      }
    }

    return errors
  }

  /**
   * Get extraction targets for a policy type
   */
  getTargets(policyType: string | null): ExtractionTarget[] {
    const patterns = this.patterns.get(policyType || 'default') || this.patterns.get('default')!

    return patterns.map(p => ({
      fieldId: p.id,
      fieldName: p.name,
      required: ['policy_number', 'start_date', 'end_date', 'premium'].includes(p.id),
      patterns: [p.pattern.source],
      validators: p.validate ? ['custom'] : [],
    }))
  }
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

import express from 'express'

const app = express()
app.use(express.json({ limit: '10mb' }))

const extractor = new FieldExtractor()

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    supportedPolicyTypes: ['motor_kasko', 'motor_traffic', 'property_fire', 'default'],
  })
})

// Extract fields
app.post('/extract', async (req, res) => {
  try {
    const { docId, locale, policyType, normalizedText } = req.body

    // If normalizedText not provided, fetch from storage
    const text = normalizedText || await fetchNormalizedText(docId)

    const result = await extractor.extract(docId, text, locale, policyType)
    res.json(result)
  } catch (error) {
    console.error('[Extract] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Get extraction targets
app.get('/targets/:policyType', (req, res) => {
  const { policyType } = req.params
  const targets = extractor.getTargets(policyType)
  res.json({ targets })
})

async function fetchNormalizedText(docId: string): Promise<string> {
  const url = `${config.storage.endpoint}/${config.storage.bucket}/${docId}/normalized.txt`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch normalized text: ${response.statusText}`)
  }

  return response.text()
}

const PORT = process.env.PORT || 4010

app.listen(PORT, () => {
  console.log(`[Extract Service] Listening on port ${PORT}`)
})

export { FieldExtractor }
