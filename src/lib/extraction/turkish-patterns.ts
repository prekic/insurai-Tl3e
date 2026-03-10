/**
 * Turkish Insurance Document Extraction Patterns
 *
 * This module provides pattern-based extraction and validation for Turkish insurance documents.
 * It works alongside AI extraction to validate and enhance extracted data.
 *
 * FLOW:
 * 1. PDF Upload → Text Extraction (pdf.js)
 * 2. AI Extraction (OpenAI/Claude) → Raw JSON
 * 3. Pattern Validation (this module) → Validated & Enhanced JSON
 * 4. Store in Database
 */

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate Turkish TC Kimlik number using the official algorithm
 *
 * TC Kimlik rules:
 * - Exactly 11 digits
 * - Cannot start with 0
 * - 10th digit = ((sum of odd positions × 7) - sum of even positions) mod 10
 * - 11th digit = sum of first 10 digits mod 10
 */
export function validateTCKimlik(tc: string): boolean {
  // Must be exactly 11 digits
  if (!/^\d{11}$/.test(tc)) return false

  // Cannot start with 0
  if (tc[0] === '0') return false

  const digits = tc.split('').map(Number)

  // Algorithm check
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7]
  const check10 = (oddSum * 7 - evenSum) % 10
  const check11 = digits.slice(0, 10).reduce((a, b) => a + b, 0) % 10

  // Handle negative modulo
  const normalizedCheck10 = ((check10 % 10) + 10) % 10

  return normalizedCheck10 === digits[9] && check11 === digits[10]
}

/**
 * Validate Turkish Tax Identification Number (VKN - Vergi Kimlik Numarası)
 *
 * VKN rules:
 * - Exactly 10 digits
 * - Complies with Modulus 10 algorithm
 */
export function validateVKN(vkn: string): boolean {
  if (!/^\d{10}$/.test(vkn)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    const tmp = (parseInt(vkn.charAt(i), 10) + (9 - i)) % 10
    let tmp2 = (tmp * Math.pow(2, 9 - i)) % 9
    if (tmp !== 0 && tmp2 === 0) tmp2 = 9
    sum += tmp === 0 ? 0 : tmp2
  }

  const lastDigit = (10 - (sum % 10)) % 10
  return lastDigit === parseInt(vkn.charAt(9), 10)
}

/**
 * Validate VIN (Vehicle Identification Number)
 *
 * VIN rules:
 * - Exactly 17 characters
 * - Only A-Z (except I, O, Q) and 0-9
 * - Must be uppercase
 * - Note: Checksum validation skipped (only required for North American VINs)
 */
export function validateVIN(vin: string): boolean {
  if (vin.length !== 17) return false
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false
  if (vin !== vin.toUpperCase()) return false
  return true
}

/**
 * Validate Turkish vehicle plate number
 *
 * Format: XX YYY ZZZZ where:
 * - XX = City code (01-81)
 * - YYY = 1-3 letters
 * - ZZZZ = 1-4 digits
 */
export function validateTurkishPlate(plate: string): boolean {
  // Normalize: remove spaces, uppercase
  const normalized = plate.replace(/\s+/g, '').toUpperCase()

  // Pattern: 2 digits + 1-3 letters + 1-4 digits
  if (!/^\d{2}[A-Z]{1,3}\d{1,4}$/.test(normalized)) return false

  // City code must be 01-81
  const cityCode = parseInt(normalized.substring(0, 2))
  if (cityCode < 1 || cityCode > 81) return false

  return true
}

/**
 * Validate Turkish IBAN
 * Format: TR + 2 check digits + 5 bank code + 16 account number = 26 chars
 */
export function validateTurkishIBAN(iban: string): boolean {
  const normalized = iban.replace(/\s+/g, '').toUpperCase()

  if (!/^TR\d{24}$/.test(normalized)) return false

  // IBAN checksum validation (mod 97)
  const rearranged = normalized.slice(4) + normalized.slice(0, 4)
  const numericIBAN = rearranged.replace(/[A-Z]/g, (char) => (char.charCodeAt(0) - 55).toString())

  // Calculate mod 97 for large number
  let remainder = 0
  for (const digit of numericIBAN) {
    remainder = (remainder * 10 + parseInt(digit)) % 97
  }

  return remainder === 1
}

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

/**
 * Normalize Turkish date format to ISO (YYYY-MM-DD)
 *
 * Handles:
 * - DD.MM.YYYY (most common in Turkey)
 * - DD/MM/YYYY
 * - DD-MM-YYYY
 * - 2-digit years (24 → 2024, 95 → 1995)
 */
export function normalizeTurkishDate(date: string): string {
  const parts = date.split(/[./-]/)
  if (parts.length !== 3) return date

  const [day, month, yearPart] = parts
  let year = yearPart

  // Handle 2-digit year
  if (year.length === 2) {
    const yearNum = parseInt(year)
    year = yearNum > 50 ? `19${year}` : `20${year}`
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * Normalize Turkish currency value to number
 *
 * Handles:
 * - Turkish format: 1.234.567,89 (dots for thousands, comma for decimal)
 * - With currency: ₺15.000 or 15.000 TL or 15.000 TRY
 * - Mixed formats
 */
export function normalizeCurrency(value: string): number {
  // Remove currency symbols and text
  let cleaned = value.replace(/[₺TL TRY]/gi, '').trim()

  // Turkish format: dots are thousands, comma is decimal
  // If there's a comma, treat dots as thousands separators
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // No comma - check if dots are thousands separators
    // Pattern like "15.000" or "1.234.567" = thousands
    // Pattern like "15.50" = decimal
    const dotParts = cleaned.split('.')
    if (dotParts.length > 1) {
      const lastPart = dotParts[dotParts.length - 1]
      // If last part after dot is 3 digits, dots are thousands
      if (lastPart.length === 3) {
        cleaned = cleaned.replace(/\./g, '')
      }
    }
  }

  // Remove any remaining non-numeric except decimal point
  cleaned = cleaned.replace(/[^\d.]/g, '')

  return parseFloat(cleaned) || 0
}

/**
 * Normalize Turkish phone number to standard format
 *
 * Outputs: 05XX XXX XX XX
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '')

  // Handle country code
  if (digits.startsWith('90')) {
    digits = '0' + digits.slice(2)
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '0' + digits
  } else if (!digits.startsWith('0') && digits.length === 10) {
    digits = '0' + digits
  }

  // Format: 0XXX XXX XX XX
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`
  }

  return digits
}

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

export interface ExtractedField {
  value: string | number
  confidence: number
  source: 'pattern' | 'ai' | 'validated'
  isValid: boolean
  rawMatch?: string
}

export interface PatternExtractionResult {
  policyNumber?: ExtractedField
  tcKimlik?: ExtractedField
  insuredName?: ExtractedField
  startDate?: ExtractedField
  endDate?: ExtractedField
  premium?: ExtractedField
  coverage?: ExtractedField
  deductible?: ExtractedField
  vehiclePlate?: ExtractedField
  vin?: ExtractedField
  vehicleBrand?: ExtractedField
  vehicleModel?: ExtractedField
  vehicleYear?: ExtractedField
  phone?: ExtractedField
  address?: ExtractedField
  insurer?: ExtractedField
}

/**
 * Extract fields from text using Turkish insurance patterns
 */
export function extractWithPatterns(text: string): PatternExtractionResult {
  const result: PatternExtractionResult = {}

  // Policy Number
  const policyMatch = text.match(/(?:poli[çc]e\s*(?:no|numaras[ıi])\s*[:\s]*)([A-Z0-9/-]+)/i)
  if (policyMatch) {
    result.policyNumber = {
      value: policyMatch[1].trim(),
      confidence: 0.95,
      source: 'pattern',
      isValid: policyMatch[1].trim().length >= 5,
      rawMatch: policyMatch[0],
    }
  }

  // TC Kimlik / VKN
  const tcMatch = text.match(
    /(?:T\.?C\.?\s*(?:Kimlik)?\s*(?:No|Numaras[ıi])?|VKN|Vergi\s*(?:No|Numaras[ıi])?)\s*[:\s]*(\d{10,11})/i
  )
  if (tcMatch) {
    const matchVal = tcMatch[1]
    const isValid = matchVal.length === 11 ? validateTCKimlik(matchVal) : validateVKN(matchVal)
    result.tcKimlik = {
      value: matchVal,
      confidence: isValid ? 0.98 : 0.5,
      source: 'pattern',
      isValid,
      rawMatch: tcMatch[0],
    }
  }

  // Start Date
  const startMatch = text.match(
    /(?:ba[şs]lang[ıi][çc]\s*tarihi|poli[çc]e\s*ba[şs]lang[ıi][çc]|yürürlük\s*tarihi)\s*[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i
  )
  if (startMatch) {
    const normalized = normalizeTurkishDate(startMatch[1])
    const isValid = !isNaN(new Date(normalized).getTime())
    result.startDate = {
      value: normalized,
      confidence: isValid ? 0.95 : 0.6,
      source: 'pattern',
      isValid,
      rawMatch: startMatch[0],
    }
  }

  // End Date
  const endMatch = text.match(
    /(?:biti[şs]\s*tarihi|poli[çc]e\s*biti[şs]i|son\s*tarih|vade\s*sonu)\s*[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i
  )
  if (endMatch) {
    const normalized = normalizeTurkishDate(endMatch[1])
    const isValid = !isNaN(new Date(normalized).getTime())
    result.endDate = {
      value: normalized,
      confidence: isValid ? 0.95 : 0.6,
      source: 'pattern',
      isValid,
      rawMatch: endMatch[0],
    }
  }

  // Premium (supports ₺ before or after)
  const premiumMatch = text.match(
    /(?:(?:toplam\s*)?prim|net\s*prim|brüt\s*prim)\s*[:\s]*(?:₺|TL|TRY)?\s*([0-9][0-9.,]*)\s*(?:TL|₺|TRY)?/i
  )
  if (premiumMatch) {
    const normalized = normalizeCurrency(premiumMatch[1])
    result.premium = {
      value: normalized,
      confidence: normalized > 0 ? 0.9 : 0.5,
      source: 'pattern',
      isValid: normalized > 0,
      rawMatch: premiumMatch[0],
    }
  }

  // Coverage/Teminat
  const coverageMatch = text.match(
    /(?:teminat\s*(?:tutar[ıi])?|sigorta\s*bedeli|kasko\s*bedeli)\s*[:\s]*(?:₺|TL)?\s*([0-9][0-9.,]*)\s*(?:TL|₺)?/i
  )
  if (coverageMatch) {
    const normalized = normalizeCurrency(coverageMatch[1])
    result.coverage = {
      value: normalized,
      confidence: normalized > 0 ? 0.85 : 0.5,
      source: 'pattern',
      isValid: normalized > 0,
      rawMatch: coverageMatch[0],
    }
  }

  // Vehicle Plate
  const plateMatch = text.match(/(?:plaka\s*(?:no)?)\s*[:\s]*(\d{2}\s*[A-Z]{1,3}\s*\d{1,4})/i)
  if (plateMatch) {
    const normalized = plateMatch[1].replace(/\s+/g, ' ').trim().toUpperCase()
    const isValid = validateTurkishPlate(normalized)
    result.vehiclePlate = {
      value: normalized,
      confidence: isValid ? 0.95 : 0.7,
      source: 'pattern',
      isValid,
      rawMatch: plateMatch[0],
    }
  }

  // VIN/Chassis
  const vinMatch = text.match(
    /(?:[şs]asi\s*(?:no|numaras[ıi])?|vin)\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i
  )
  if (vinMatch) {
    const normalized = vinMatch[1].toUpperCase()
    const isValid = validateVIN(normalized)
    result.vin = {
      value: normalized,
      confidence: isValid ? 0.95 : 0.6,
      source: 'pattern',
      isValid,
      rawMatch: vinMatch[0],
    }
  }

  // Vehicle Year
  const yearMatch = text.match(/(?:model\s*y[ıi]l[ıi]|y[ıi]l)\s*[:\s]*((?:19|20)\d{2})/i)
  if (yearMatch) {
    const year = parseInt(yearMatch[1])
    const currentYear = new Date().getFullYear()
    const isValid = year >= 1950 && year <= currentYear + 1
    result.vehicleYear = {
      value: year,
      confidence: isValid ? 0.95 : 0.5,
      source: 'pattern',
      isValid,
      rawMatch: yearMatch[0],
    }
  }

  // Insured Name
  const nameMatch = text.match(
    /(?:sigortali|sigorta\s*ettiren|ad[ıi]\s*soyad[ıi])\s*[:\s]*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?=\s*(?:T\.?C|Adres|Telefon|\d|$))/i
  )
  if (nameMatch) {
    const name = nameMatch[1].trim().toLocaleUpperCase('tr-TR')
    result.insuredName = {
      value: name,
      confidence: name.length > 3 ? 0.85 : 0.5,
      source: 'pattern',
      isValid: name.length > 3,
      rawMatch: nameMatch[0],
    }
  }

  return result
}

// ============================================================================
// VALIDATION & ENHANCEMENT
// ============================================================================

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  enhancements: Record<string, unknown>
}

/**
 * Validate and enhance AI extraction results using pattern matching
 *
 * This function:
 * 1. Validates fields extracted by AI
 * 2. Fills in missing fields using pattern extraction
 * 3. Corrects invalid values when pattern extraction is more reliable
 * 4. Returns validation errors and warnings
 */
export function validateAndEnhanceExtraction(
  aiResult: Record<string, unknown>,
  originalText: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const enhancements: Record<string, unknown> = {}

  // Extract with patterns for comparison
  const patternResult = extractWithPatterns(originalText)

  // Validate TC Kimlik or VKN
  const aiTcKimlik = aiResult.tcKimlik as string | undefined
  if (aiTcKimlik) {
    const isValidTC = aiTcKimlik.length === 11 && validateTCKimlik(aiTcKimlik)
    const isValidVKN = aiTcKimlik.length === 10 && validateVKN(aiTcKimlik)
    const isValid = isValidTC || isValidVKN

    if (!isValid) {
      if (patternResult.tcKimlik?.isValid) {
        enhancements.tcKimlik = patternResult.tcKimlik.value
        warnings.push(`TC Kimlik / VKN corrected: ${aiTcKimlik} → ${patternResult.tcKimlik.value}`)
      } else {
        // Only error if it looks like a number, otherwise just log a warning
        if (/^\d+$/.test(aiTcKimlik.replace(/\s/g, ''))) {
          errors.push(`Invalid TC Kimlik / VKN: ${aiTcKimlik}`)
        } else {
          warnings.push(`Extracted TC Kimlik / VKN is not numeric: ${aiTcKimlik}`)
        }
      }
    }
  } else if (patternResult.tcKimlik?.isValid) {
    enhancements.tcKimlik = patternResult.tcKimlik.value
  }

  // Validate VIN
  const aiVin = aiResult.vin as string | undefined
  if (aiVin) {
    if (!validateVIN(aiVin.toUpperCase())) {
      if (patternResult.vin?.isValid) {
        enhancements.vin = patternResult.vin.value
        warnings.push(`VIN corrected: ${aiVin} → ${patternResult.vin.value}`)
      } else {
        warnings.push(`VIN may be invalid: ${aiVin}`)
      }
    }
  } else if (patternResult.vin?.isValid) {
    enhancements.vin = patternResult.vin.value
  }

  // Validate Vehicle Plate
  const aiPlate = aiResult.vehiclePlate as string | undefined
  if (aiPlate) {
    if (!validateTurkishPlate(aiPlate)) {
      if (patternResult.vehiclePlate?.isValid) {
        enhancements.vehiclePlate = patternResult.vehiclePlate.value
        warnings.push(`Plate corrected: ${aiPlate} → ${patternResult.vehiclePlate.value}`)
      } else {
        warnings.push(`Vehicle plate may be invalid: ${aiPlate}`)
      }
    }
  } else if (patternResult.vehiclePlate?.isValid) {
    enhancements.vehiclePlate = patternResult.vehiclePlate.value
  }

  // Validate dates
  const aiStartDate = aiResult.startDate as string | undefined
  const aiEndDate = aiResult.endDate as string | undefined

  if (aiStartDate && aiEndDate) {
    const start = new Date(aiStartDate)
    const end = new Date(aiEndDate)
    if (start >= end) {
      errors.push('Start date must be before end date')
    }
  }

  // Fill missing dates from patterns
  if (!aiStartDate && patternResult.startDate?.isValid) {
    enhancements.startDate = patternResult.startDate.value
  }
  if (!aiEndDate && patternResult.endDate?.isValid) {
    enhancements.endDate = patternResult.endDate.value
  }

  // Validate premium
  const aiPremium = aiResult.premium as number | string | undefined
  const premiumNum = typeof aiPremium === 'string' ? normalizeCurrency(aiPremium) : aiPremium

  if (!premiumNum && patternResult.premium?.isValid) {
    enhancements.premium = patternResult.premium.value
  }

  // Fill other missing fields
  if (!aiResult.policyNumber && patternResult.policyNumber?.isValid) {
    enhancements.policyNumber = patternResult.policyNumber.value
  }
  if (!aiResult.coverage && patternResult.coverage?.isValid) {
    enhancements.coverage = patternResult.coverage.value
  }
  if (!aiResult.vehicleYear && patternResult.vehicleYear?.isValid) {
    enhancements.vehicleYear = patternResult.vehicleYear.value
  }
  if (!aiResult.insuredName && patternResult.insuredName?.isValid) {
    enhancements.insuredPerson = patternResult.insuredName.value
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    enhancements,
  }
}

/**
 * Merge AI results with pattern enhancements
 */
export function mergeExtractionResults(
  aiResult: Record<string, unknown>,
  validation: ValidationResult
): Record<string, unknown> {
  return {
    ...aiResult,
    ...validation.enhancements,
    _validation: {
      errors: validation.errors,
      warnings: validation.warnings,
      enhanced: Object.keys(validation.enhancements),
    },
  }
}
