/**
 * Insurance Display Utilities
 * Helper functions for displaying insurance data in user-friendly format
 */

import type { PolicyType, AnalyzedPolicy, Coverage } from '@/types/policy'

/**
 * Mapping of full Turkish insurance company names to their common short names
 */
const COMPANY_SHORT_NAMES: Record<string, string> = {
  // Full legal names to common names
  'ANADOLU ANONİM TÜRK SİGORTA ŞİRKETİ': 'Anadolu Sigorta',
  'ANADOLU ANONIM TÜRK SİGORTA ŞİRKETİ': 'Anadolu Sigorta',
  'AKSİGORTA A.Ş.': 'Aksigorta',
  'AKSIGORTA A.Ş.': 'Aksigorta',
  'AKSIGORTA ANONİM ŞİRKETİ': 'Aksigorta',
  'ALLİANZ SİGORTA A.Ş.': 'Allianz',
  'ALLIANZ SİGORTA A.Ş.': 'Allianz',
  'ALLIANZ SIGORTA A.Ş.': 'Allianz',
  'AXA SİGORTA A.Ş.': 'AXA Sigorta',
  'AXA SIGORTA A.Ş.': 'AXA Sigorta',
  'MAPFRE SİGORTA A.Ş.': 'Mapfre',
  'MAPFRE SIGORTA A.Ş.': 'Mapfre',
  'SOMPO JAPAN SİGORTA A.Ş.': 'Sompo Japan',
  'SOMPO JAPAN SIGORTA A.Ş.': 'Sompo Japan',
  'SOMPO SİGORTA A.Ş.': 'Sompo',
  'ZURİCH SİGORTA A.Ş.': 'Zurich',
  'ZURICH SİGORTA A.Ş.': 'Zurich',
  'ZURICH SIGORTA A.Ş.': 'Zurich',
  'HDI SİGORTA A.Ş.': 'HDI Sigorta',
  'HDI SIGORTA A.Ş.': 'HDI Sigorta',
  'GROUPAMA SİGORTA A.Ş.': 'Groupama',
  'GROUPAMA SIGORTA A.Ş.': 'Groupama',
  'TÜRK NİPPON SİGORTA A.Ş.': 'Türk Nippon',
  'TURK NIPPON SIGORTA A.Ş.': 'Türk Nippon',
  'GÜNEŞ SİGORTA A.Ş.': 'Güneş Sigorta',
  'GUNES SIGORTA A.Ş.': 'Güneş Sigorta',
  'EUREKO SİGORTA A.Ş.': 'Eureko',
  'EUREKO SIGORTA A.Ş.': 'Eureko',
  'ERGO SİGORTA A.Ş.': 'Ergo',
  'ERGO SIGORTA A.Ş.': 'Ergo',
  'HALK SİGORTA A.Ş.': 'Halk Sigorta',
  'HALK SIGORTA A.Ş.': 'Halk Sigorta',
  'RAY SİGORTA A.Ş.': 'Ray Sigorta',
  'RAY SIGORTA A.Ş.': 'Ray Sigorta',
  'TÜRK SİGORTA A.Ş.': 'Türk Sigorta',
  'TURK SIGORTA A.Ş.': 'Türk Sigorta',
  'DOĞA SİGORTA A.Ş.': 'Doğa Sigorta',
  'DOGA SIGORTA A.Ş.': 'Doğa Sigorta',
  'NEOVA SİGORTA A.Ş.': 'Neova',
  'NEOVA SIGORTA A.Ş.': 'Neova',
  'QUICK SİGORTA A.Ş.': 'Quick Sigorta',
  'QUICK SIGORTA A.Ş.': 'Quick Sigorta',
  'HEPIYI SİGORTA A.Ş.': 'Hepiyi',
  'HEPIYI SIGORTA A.Ş.': 'Hepiyi',
  'MAGDEBURGER SİGORTA A.Ş.': 'Magdeburger',
  'MAGDEBURGER SIGORTA A.Ş.': 'Magdeburger',
  'ANKARA ANONİM TÜRK SİGORTA ŞİRKETİ': 'Ankara Sigorta',
  'ANKARA ANONIM TÜRK SİGORTA ŞİRKETİ': 'Ankara Sigorta',
  'BNP PARIBAS CARDIF SİGORTA A.Ş.': 'BNP Cardif',
  'BNP PARIBAS CARDIF SIGORTA A.Ş.': 'BNP Cardif',
  'CIGNA SAĞLIK HAYAT VE EMEKLİLİK A.Ş.': 'Cigna',
  'CIGNA SAGLIK HAYAT VE EMEKLILIK A.Ş.': 'Cigna',
}

/**
 * Get short/common name for an insurance company
 */
export function getShortCompanyName(fullName: string): string {
  // First try exact match (case-insensitive)
  const upperName = fullName.toUpperCase().trim()

  for (const [key, value] of Object.entries(COMPANY_SHORT_NAMES)) {
    if (key.toUpperCase() === upperName) {
      return value
    }
  }

  // Try partial match for common patterns
  const lowerName = fullName.toLowerCase()

  if (lowerName.includes('anadolu')) return 'Anadolu Sigorta'
  if (lowerName.includes('aksigorta')) return 'Aksigorta'
  if (lowerName.includes('allianz')) return 'Allianz'
  if (lowerName.includes('axa')) return 'AXA Sigorta'
  if (lowerName.includes('mapfre')) return 'Mapfre'
  if (lowerName.includes('sompo')) return 'Sompo'
  if (lowerName.includes('zurich') || lowerName.includes('zürich')) return 'Zurich'
  if (lowerName.includes('hdi')) return 'HDI Sigorta'
  if (lowerName.includes('groupama')) return 'Groupama'
  if (lowerName.includes('güneş') || lowerName.includes('gunes')) return 'Güneş Sigorta'
  if (lowerName.includes('ergo')) return 'Ergo'
  if (lowerName.includes('halk')) return 'Halk Sigorta'
  if (lowerName.includes('ray')) return 'Ray Sigorta'
  if (lowerName.includes('quick')) return 'Quick Sigorta'
  if (lowerName.includes('neova')) return 'Neova'
  if (lowerName.includes('eureko')) return 'Eureko'
  if (lowerName.includes('nippon')) return 'Türk Nippon'
  if (lowerName.includes('cardif') || lowerName.includes('bnp')) return 'BNP Cardif'
  if (lowerName.includes('cigna')) return 'Cigna'

  // If name is short enough (< 20 chars), return as-is
  if (fullName.length <= 20) {
    return fullName
  }

  // Fallback: remove common suffixes and truncate
  let shortName = fullName
    .replace(/A\.?Ş\.?$/i, '')
    .replace(/ANONİM ŞİRKETİ$/i, '')
    .replace(/ANONIM ŞİRKETİ$/i, '')
    .replace(/SİGORTA ŞİRKETİ$/i, '')
    .replace(/SIGORTA ŞİRKETİ$/i, '')
    .replace(/TÜRK SİGORTA$/i, '')
    .replace(/TURK SIGORTA$/i, '')
    .trim()

  // If still too long, just take first two words
  if (shortName.length > 20) {
    const words = shortName.split(/\s+/)
    shortName = words.slice(0, 2).join(' ')
  }

  return shortName
}

/**
 * Policy types that use "limit" (liability-based)
 * These are typically third-party liability insurances where you don't have a sum insured
 */
const LIMIT_BASED_TYPES: PolicyType[] = ['traffic']

/**
 * Policy types that use "sum insured" (asset-based)
 * These are insurances where you insure a specific value
 */
const SUM_INSURED_TYPES: PolicyType[] = ['kasko', 'home', 'dask', 'business']

/**
 * Policy types that are neither (benefit-based)
 * These are insurances like health/life where coverage structure varies
 */
// Note: Benefit-based types are determined by exclusion from limit and sum insured types
// const BENEFIT_BASED_TYPES: PolicyType[] = ['health', 'life']

/**
 * Determine the coverage type for a policy
 */
export function getCoverageType(type: PolicyType): 'limit' | 'sumInsured' | 'benefit' {
  if (LIMIT_BASED_TYPES.includes(type)) return 'limit'
  if (SUM_INSURED_TYPES.includes(type)) return 'sumInsured'
  return 'benefit'
}

/**
 * Get the main coverage/limit value to display for a policy
 * For traffic insurance, finds the highest bodily injury limit
 * For other policies, returns the sum insured (coverage field)
 */
export function getMainCoverageValue(policy: AnalyzedPolicy): number {
  const coverageType = getCoverageType(policy.type)

  if (coverageType === 'limit' && policy.coverages && policy.coverages.length > 0) {
    // For traffic insurance, find the highest limit (usually bodily injury per accident)
    const relevantCoverages = policy.coverages.filter(
      (c) =>
        c.included &&
        c.limit > 0 &&
        (c.nameTr?.toLowerCase().includes('ölüm') ||
          c.nameTr?.toLowerCase().includes('sakatlık') ||
          c.nameTr?.toLowerCase().includes('kaza başı') ||
          c.name?.toLowerCase().includes('death') ||
          c.name?.toLowerCase().includes('bodily') ||
          c.name?.toLowerCase().includes('per accident'))
    )

    if (relevantCoverages.length > 0) {
      return Math.max(...relevantCoverages.map((c) => c.limit))
    }

    // Fallback to highest limit overall
    const maxLimit = Math.max(...policy.coverages.filter((c) => c.included).map((c) => c.limit))
    return maxLimit > 0 ? maxLimit : policy.coverage
  }

  // For sum insured and benefit types, use the coverage field
  return policy.coverage
}

/**
 * Extract the insured subject from a policy
 * Returns plate number for auto, address for property, etc.
 */
export function getInsuredSubject(policy: AnalyzedPolicy): string | null {
  // Check for vehicle info (kasko, traffic)
  if (policy.type === 'kasko' || policy.type === 'traffic') {
    // Try to find plate number in various locations
    const plate =
      policy.vehicleInfo?.plate ||
      extractPlateFromCoverages(policy.coverages) ||
      extractPlateFromConditions(policy.specialConditions)

    if (plate) return plate

    // Try vehicle info
    const vehicle =
      [policy.vehicleInfo?.make, policy.vehicleInfo?.model].filter(Boolean).join(' ') || null

    if (vehicle) return vehicle
  }

  // Check for property address (home, dask, business)
  if (policy.type === 'home' || policy.type === 'dask' || policy.type === 'business') {
    if (policy.location) return policy.location
    if (policy.insuredAddress) return policy.insuredAddress
  }

  // For health/life, return the insured person
  if (policy.type === 'health' || policy.type === 'life') {
    return policy.insuredPerson || null
  }

  return null
}

/**
 * Try to extract plate number from coverage descriptions
 */
function extractPlateFromCoverages(coverages: Coverage[]): string | null {
  if (!coverages) return null

  for (const coverage of coverages) {
    const desc = coverage.description || ''
    const plateMatch = desc.match(/\b([0-9]{2}\s*[A-Z]{1,3}\s*[0-9]{2,4})\b/i)
    if (plateMatch) return plateMatch[1].replace(/\s+/g, ' ')
  }

  return null
}

/**
 * Try to extract plate number from special conditions
 */
function extractPlateFromConditions(conditions: string[]): string | null {
  if (!conditions) return null

  for (const condition of conditions) {
    const plateMatch = condition.match(/\b([0-9]{2}\s*[A-Z]{1,3}\s*[0-9]{2,4})\b/i)
    if (plateMatch) return plateMatch[1].replace(/\s+/g, ' ')
  }

  return null
}

/**
 * Get a descriptive subject label for the policy table
 * Returns both the label and value
 */
export function getSubjectDisplay(
  policy: AnalyzedPolicy,
  locale: 'en' | 'tr' = 'en'
): { label: string; value: string } | null {
  const subject = getInsuredSubject(policy)

  if (!subject) {
    // Fallback to insured person if no specific subject found
    if (policy.insuredPerson) {
      return {
        label: locale === 'tr' ? 'Sigortalı' : 'Insured',
        value: policy.insuredPerson,
      }
    }
    return null
  }

  // Determine appropriate label based on policy type
  if (policy.type === 'kasko' || policy.type === 'traffic') {
    // Check if it looks like a plate number
    const isPlate = /^[0-9]{2}\s*[A-Z]{1,3}\s*[0-9]{2,4}$/i.test(subject.trim())
    return {
      label: locale === 'tr' ? (isPlate ? 'Plaka' : 'Araç') : isPlate ? 'Plate' : 'Vehicle',
      value: subject,
    }
  }

  if (policy.type === 'home' || policy.type === 'dask') {
    return {
      label: locale === 'tr' ? 'Adres' : 'Address',
      value: subject.length > 30 ? subject.substring(0, 30) + '...' : subject,
    }
  }

  if (policy.type === 'business') {
    return {
      label: locale === 'tr' ? 'İşyeri' : 'Business',
      value: subject.length > 30 ? subject.substring(0, 30) + '...' : subject,
    }
  }

  // Default to insured person
  return {
    label: locale === 'tr' ? 'Sigortalı' : 'Insured',
    value: subject,
  }
}
