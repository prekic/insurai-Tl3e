/**
 * Contradiction Detector
 *
 * Validates extraction results against source text to detect mismatches.
 * Uses regex/entity scanning on normalized text and compares vs extracted JSON.
 *
 * Detected contradiction types:
 * - Policy number mismatches
 * - Date conflicts
 * - Currency conflicts
 * - Plate/VIN discrepancies
 * - Amount inconsistencies
 */

import type {
  Contradiction,
  ContradictionReport,
  KaskoExtractionJSON,
} from '@/types/extraction-pipeline'

// ============================================================================
// ENTITY DETECTION PATTERNS
// ============================================================================

/**
 * Turkish policy number patterns
 * Examples: "1234567890", "POL-2026-001234", "KSK/2026/123456"
 */
const POLICY_NUMBER_PATTERNS = [
  // Standard numeric (10+ digits)
  /(?:POLİÇE\s*(?:NO|NUMARASI?)?\s*[:\-]?\s*)(\d{8,15})/gi,
  // With prefix
  /(?:POL|KSK|TRF|KONUT)[\/\-]?\d{4}[\/\-]?\d{4,10}/gi,
  // Generic capture near "poliçe" keyword
  /POLİÇE[^0-9]{0,20}(\d{7,15})/gi,
]

/**
 * Turkish date patterns
 * Formats: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
 */
const DATE_PATTERNS = [
  // DD.MM.YYYY or DD/MM/YYYY
  /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/g,
  // YYYY-MM-DD
  /(\d{4})-(\d{2})-(\d{2})/g,
  // Written format: "15 Ocak 2026"
  /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/gi,
]

/**
 * Turkish license plate pattern
 * Format: XX YYY ZZZZ (city code + letters + numbers)
 */
const PLATE_PATTERNS = [
  // Standard format with spaces
  /\b(\d{2})\s*([A-ZÇĞİÖŞÜ]{1,3})\s*(\d{2,4})\b/gi,
  // Near "plaka" keyword
  /PLAKA[^A-Z0-9]{0,10}(\d{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4})/gi,
]

/**
 * VIN/Chassis number pattern (17 characters)
 */
const VIN_PATTERNS = [
  /\b([A-HJ-NPR-Z0-9]{17})\b/gi,
  /ŞASİ\s*(?:NO|NUMARASI?)?\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/gi,
]

/**
 * Currency patterns
 */
const CURRENCY_PATTERNS = [
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(TL|TRY|₺|USD|\$|EUR|€)/gi,
  /(TL|TRY|₺|USD|\$|EUR|€)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/gi,
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize a plate number for comparison
 */
function normalizePlate(plate: string | null | undefined): string {
  if (!plate) return ''
  return plate
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, '')
}

/**
 * Normalize a VIN for comparison
 */
function normalizeVIN(vin: string | null | undefined): string {
  if (!vin) return ''
  return vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '')
}

/**
 * Normalize a date to ISO format for comparison
 */
function normalizeDate(dateStr: string): string | null {
  // Try DD.MM.YYYY or DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/)
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try YYYY-MM-DD
  const yyyymmdd = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (yyyymmdd) {
    return dateStr
  }

  // Try written format
  const monthNames: Record<string, string> = {
    ocak: '01',
    şubat: '02',
    mart: '03',
    nisan: '04',
    mayıs: '05',
    haziran: '06',
    temmuz: '07',
    ağustos: '08',
    eylül: '09',
    ekim: '10',
    kasım: '11',
    aralık: '12',
  }

  const written = dateStr.match(
    /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/i
  )
  if (written) {
    const [, day, monthName, year] = written
    const month = monthNames[monthName.toLowerCase()]
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`
    }
  }

  return null
}

/**
 * Extract currency from text
 */
function detectCurrencies(text: string): string[] {
  const currencies = new Set<string>()

  for (const pattern of CURRENCY_PATTERNS) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      const currency = match[1].match(/TL|TRY|₺|USD|\$|EUR|€/i)?.[0] || match[2]
      if (currency) {
        // Normalize currency
        const normalized = currency.toUpperCase().replace('₺', 'TRY').replace('$', 'USD').replace('€', 'EUR')
        if (normalized === 'TL') {
          currencies.add('TRY')
        } else {
          currencies.add(normalized)
        }
      }
    }
  }

  return Array.from(currencies)
}

/**
 * Find all matches with context
 */
function findMatchesWithContext(
  text: string,
  pattern: RegExp,
  contextChars: number = 50
): { match: string; context: string; index: number }[] {
  const results: { match: string; context: string; index: number }[] = []
  const matches = text.matchAll(pattern)

  for (const match of matches) {
    if (match.index !== undefined) {
      const start = Math.max(0, match.index - contextChars)
      const end = Math.min(text.length, match.index + match[0].length + contextChars)
      results.push({
        match: match[0],
        context: text.slice(start, end).replace(/\s+/g, ' ').trim(),
        index: match.index,
      })
    }
  }

  return results
}

/**
 * Estimate line number from character index
 */
function estimateLineNumber(text: string, charIndex: number): number {
  return text.slice(0, charIndex).split('\n').length
}

// ============================================================================
// MAIN DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect policy number contradictions
 */
function detectPolicyNumberContradictions(
  extraction: KaskoExtractionJSON,
  text: string
): Contradiction[] {
  const contradictions: Contradiction[] = []
  const extractedPolicyNumber = extraction.policyNumber?.trim() || null

  const detectedNumbers: string[] = []

  for (const pattern of POLICY_NUMBER_PATTERNS) {
    const matches = findMatchesWithContext(text, pattern)
    for (const m of matches) {
      // Extract just the number part
      const numberMatch = m.match.match(/\d{7,15}/)
      if (numberMatch) {
        detectedNumbers.push(numberMatch[0])
      }
    }
  }

  // Deduplicate
  const uniqueNumbers = [...new Set(detectedNumbers)]

  // Check for mismatches
  if (uniqueNumbers.length > 0 && extractedPolicyNumber) {
    const normalizedExtracted = extractedPolicyNumber.replace(/[^0-9]/g, '')

    for (const detected of uniqueNumbers) {
      if (detected !== normalizedExtracted && detected.length >= 7) {
        // Check if it's a partial match (might be endorsement number)
        if (!normalizedExtracted.includes(detected) && !detected.includes(normalizedExtracted)) {
          const match = findMatchesWithContext(text, new RegExp(detected, 'g'))[0]
          contradictions.push({
            id: `policy-number-${detected}`,
            fieldPath: 'policyNumber',
            extractedValue: extractedPolicyNumber,
            detectedValue: detected,
            evidenceQuote: match?.context || detected,
            location: match ? `Line ~${estimateLineNumber(text, match.index)}` : 'Unknown',
            severity: 'critical',
            type: uniqueNumbers.length > 1 ? 'multiple_values' : 'mismatch',
          })
        }
      }
    }
  }

  // Missing in extraction but found in text
  if (!extractedPolicyNumber && uniqueNumbers.length > 0) {
    const match = findMatchesWithContext(text, new RegExp(uniqueNumbers[0], 'g'))[0]
    contradictions.push({
      id: `policy-number-missing`,
      fieldPath: 'policyNumber',
      extractedValue: null,
      detectedValue: uniqueNumbers[0],
      evidenceQuote: match?.context || uniqueNumbers[0],
      location: match ? `Line ~${estimateLineNumber(text, match.index)}` : 'Unknown',
      severity: 'critical',
      type: 'missing_in_extraction',
    })
  }

  return contradictions
}

/**
 * Detect date contradictions
 */
function detectDateContradictions(
  extraction: KaskoExtractionJSON,
  text: string
): Contradiction[] {
  const contradictions: Contradiction[] = []

  // Extract all dates from text
  const detectedDates: { date: string; normalized: string; context: string; index: number }[] = []

  for (const pattern of DATE_PATTERNS) {
    const matches = findMatchesWithContext(text, pattern)
    for (const m of matches) {
      const normalized = normalizeDate(m.match)
      if (normalized) {
        detectedDates.push({
          date: m.match,
          normalized,
          context: m.context,
          index: m.index,
        })
      }
    }
  }

  // Compare with extracted dates
  const datesToCheck: { field: string; value: string | null }[] = [
    { field: 'startDate', value: extraction.startDate },
    { field: 'endDate', value: extraction.endDate },
    { field: 'issueDate', value: extraction.issueDate },
  ]

  for (const { field, value } of datesToCheck) {
    if (!value) continue

    const extractedNormalized = normalizeDate(value)
    if (!extractedNormalized) continue

    // Look for dates near keywords
    const keywords: Record<string, string[]> = {
      startDate: ['BAŞLANGIÇ', 'START', 'YÜRÜRLÜK'],
      endDate: ['BİTİŞ', 'END', 'SONA ERME', 'VADE'],
      issueDate: ['TANZİM', 'DÜZENLEME', 'TARİH'],
    }

    const fieldKeywords = keywords[field] || []
    for (const keyword of fieldKeywords) {
      const keywordIndex = text.toUpperCase().indexOf(keyword)
      if (keywordIndex !== -1) {
        // Look for dates near this keyword (within 100 chars)
        const nearbyDates = detectedDates.filter(
          (d) => Math.abs(d.index - keywordIndex) < 100
        )

        for (const nearbyDate of nearbyDates) {
          if (nearbyDate.normalized !== extractedNormalized) {
            contradictions.push({
              id: `date-${field}-${nearbyDate.normalized}`,
              fieldPath: field,
              extractedValue: value,
              detectedValue: nearbyDate.date,
              evidenceQuote: nearbyDate.context,
              location: `Line ~${estimateLineNumber(text, nearbyDate.index)}`,
              severity: field === 'policyNumber' ? 'critical' : 'high',
              type: 'mismatch',
            })
          }
        }
      }
    }
  }

  return contradictions
}

/**
 * Detect plate/vehicle contradictions
 */
function detectVehicleContradictions(
  extraction: KaskoExtractionJSON,
  text: string
): Contradiction[] {
  const contradictions: Contradiction[] = []

  // Extract plates from text
  const detectedPlates: { plate: string; normalized: string; context: string; index: number }[] = []

  for (const pattern of PLATE_PATTERNS) {
    const matches = findMatchesWithContext(text, pattern)
    for (const m of matches) {
      const normalized = normalizePlate(m.match)
      if (normalized.length >= 6) {
        detectedPlates.push({
          plate: m.match,
          normalized,
          context: m.context,
          index: m.index,
        })
      }
    }
  }

  // Extract VINs from text
  const detectedVINs: { vin: string; normalized: string; context: string; index: number }[] = []

  for (const pattern of VIN_PATTERNS) {
    const matches = findMatchesWithContext(text, pattern)
    for (const m of matches) {
      const normalized = normalizeVIN(m.match)
      if (normalized.length === 17) {
        detectedVINs.push({
          vin: m.match,
          normalized,
          context: m.context,
          index: m.index,
        })
      }
    }
  }

  // Compare with extracted vehicles
  const extractedVehicles = extraction.vehicles || []

  for (let i = 0; i < extractedVehicles.length; i++) {
    const vehicle = extractedVehicles[i]
    const extractedPlate = normalizePlate(vehicle.plate)
    const extractedVIN = normalizeVIN(vehicle.chassisNo)

    // Check plates
    if (extractedPlate) {
      const matchingPlate = detectedPlates.find((p) => p.normalized === extractedPlate)
      if (!matchingPlate && detectedPlates.length > 0) {
        // Plate not found but we detected other plates
        for (const detected of detectedPlates) {
          if (detected.normalized !== extractedPlate) {
            contradictions.push({
              id: `vehicle-${i}-plate-${detected.normalized}`,
              fieldPath: `vehicles[${i}].plate`,
              extractedValue: vehicle.plate,
              detectedValue: detected.plate,
              evidenceQuote: detected.context,
              location: `Line ~${estimateLineNumber(text, detected.index)}`,
              severity: 'high',
              type: 'mismatch',
            })
          }
        }
      }
    } else if (detectedPlates.length > 0) {
      // Plate missing in extraction but found in text
      contradictions.push({
        id: `vehicle-${i}-plate-missing`,
        fieldPath: `vehicles[${i}].plate`,
        extractedValue: null,
        detectedValue: detectedPlates[0].plate,
        evidenceQuote: detectedPlates[0].context,
        location: `Line ~${estimateLineNumber(text, detectedPlates[0].index)}`,
        severity: 'high',
        type: 'missing_in_extraction',
      })
    }

    // Check VINs
    if (extractedVIN) {
      const matchingVIN = detectedVINs.find((v) => v.normalized === extractedVIN)
      if (!matchingVIN && detectedVINs.length > 0) {
        for (const detected of detectedVINs) {
          if (detected.normalized !== extractedVIN) {
            contradictions.push({
              id: `vehicle-${i}-vin-${detected.normalized}`,
              fieldPath: `vehicles[${i}].chassisNo`,
              extractedValue: vehicle.chassisNo,
              detectedValue: detected.vin,
              evidenceQuote: detected.context,
              location: `Line ~${estimateLineNumber(text, detected.index)}`,
              severity: 'high',
              type: 'mismatch',
            })
          }
        }
      }
    } else if (detectedVINs.length > 0) {
      // VIN missing in extraction but found in text
      contradictions.push({
        id: `vehicle-${i}-vin-missing`,
        fieldPath: `vehicles[${i}].chassisNo`,
        extractedValue: null,
        detectedValue: detectedVINs[0].vin,
        evidenceQuote: detectedVINs[0].context,
        location: `Line ~${estimateLineNumber(text, detectedVINs[0].index)}`,
        severity: 'medium',
        type: 'missing_in_extraction',
      })
    }
  }

  // Check for plates in text but no vehicles extracted
  if (extractedVehicles.length === 0 && detectedPlates.length > 0) {
    contradictions.push({
      id: `vehicles-missing`,
      fieldPath: 'vehicles',
      extractedValue: null,
      detectedValue: detectedPlates.map((p) => p.plate).join(', '),
      evidenceQuote: detectedPlates[0].context,
      location: `Line ~${estimateLineNumber(text, detectedPlates[0].index)}`,
      severity: 'critical',
      type: 'missing_in_extraction',
    })
  }

  return contradictions
}

/**
 * Detect currency contradictions
 */
function detectCurrencyContradictions(
  extraction: KaskoExtractionJSON,
  text: string
): Contradiction[] {
  const contradictions: Contradiction[] = []

  const detectedCurrencies = detectCurrencies(text)
  const extractedCurrency = extraction.premium?.currency || 'TRY'

  // If multiple currencies detected
  if (detectedCurrencies.length > 1) {
    contradictions.push({
      id: `currency-multiple`,
      fieldPath: 'premium.currency',
      extractedValue: extractedCurrency,
      detectedValue: detectedCurrencies.join(', '),
      evidenceQuote: `Multiple currencies found in document: ${detectedCurrencies.join(', ')}`,
      location: 'Document-wide',
      severity: 'high',
      type: 'multiple_values',
    })
  }

  // If extracted currency not in detected
  if (detectedCurrencies.length > 0 && !detectedCurrencies.includes(extractedCurrency)) {
    contradictions.push({
      id: `currency-mismatch`,
      fieldPath: 'premium.currency',
      extractedValue: extractedCurrency,
      detectedValue: detectedCurrencies[0],
      evidenceQuote: `Detected currency: ${detectedCurrencies[0]}, Extracted: ${extractedCurrency}`,
      location: 'Document-wide',
      severity: 'high',
      type: 'currency_conflict',
    })
  }

  return contradictions
}

// ============================================================================
// MAIN DETECTOR FUNCTION
// ============================================================================

/**
 * Run full contradiction detection
 */
export function detectContradictions(
  extraction: KaskoExtractionJSON,
  normalizedText: string
): ContradictionReport {
  const allContradictions: Contradiction[] = []

  // Run all detection functions
  allContradictions.push(...detectPolicyNumberContradictions(extraction, normalizedText))
  allContradictions.push(...detectDateContradictions(extraction, normalizedText))
  allContradictions.push(...detectVehicleContradictions(extraction, normalizedText))
  allContradictions.push(...detectCurrencyContradictions(extraction, normalizedText))

  // Deduplicate by ID
  const uniqueContradictions = allContradictions.filter(
    (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i
  )

  // Calculate summary
  const summary = {
    total: uniqueContradictions.length,
    critical: uniqueContradictions.filter((c) => c.severity === 'critical').length,
    high: uniqueContradictions.filter((c) => c.severity === 'high').length,
    medium: uniqueContradictions.filter((c) => c.severity === 'medium').length,
    low: uniqueContradictions.filter((c) => c.severity === 'low').length,
  }

  // Determine overall integrity
  let overallIntegrity: 'high' | 'medium' | 'low' | 'critical'
  if (summary.critical > 0) {
    overallIntegrity = 'critical'
  } else if (summary.high > 0) {
    overallIntegrity = 'low'
  } else if (summary.medium > 0) {
    overallIntegrity = 'medium'
  } else {
    overallIntegrity = 'high'
  }

  return {
    contradictions: uniqueContradictions,
    summary,
    overallIntegrity,
  }
}

/**
 * Quick check if text likely contains key identifiers
 */
export function quickScan(text: string): {
  hasPolicyNumber: boolean
  hasPlate: boolean
  hasVIN: boolean
  hasDates: boolean
  currencies: string[]
} {
  let hasPolicyNumber = false
  let hasPlate = false
  let hasVIN = false
  let hasDates = false

  for (const pattern of POLICY_NUMBER_PATTERNS) {
    if (pattern.test(text)) {
      hasPolicyNumber = true
      break
    }
  }

  for (const pattern of PLATE_PATTERNS) {
    if (pattern.test(text)) {
      hasPlate = true
      break
    }
  }

  for (const pattern of VIN_PATTERNS) {
    if (pattern.test(text)) {
      hasVIN = true
      break
    }
  }

  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(text)) {
      hasDates = true
      break
    }
  }

  return {
    hasPolicyNumber,
    hasPlate,
    hasVIN,
    hasDates,
    currencies: detectCurrencies(text),
  }
}
