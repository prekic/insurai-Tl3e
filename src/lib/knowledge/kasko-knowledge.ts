/**
 * Kasko Insurance Knowledge Hub
 *
 * Comprehensive knowledge base for Turkish Kasko (Comprehensive Vehicle Insurance)
 * This module provides:
 * - Coverage categorization and hierarchy
 * - Implicit vs explicit coverage detection
 * - Vehicle information extraction
 * - Market benchmarks by vehicle type/age
 * - Scoring adjustments for kasko-specific evaluation
 *
 * @module kasko-knowledge
 */

// =============================================================================
// COVERAGE CATEGORIES
// =============================================================================

/**
 * Kasko coverage categories in display order
 * Each category has a priority for sorting and a Turkish label
 */
export const KASKO_COVERAGE_CATEGORIES = {
  main: {
    order: 1,
    labelTr: 'Ana Teminatlar',
    labelEn: 'Main Coverage',
    description: 'Aracın temel hasarlarına karşı koruma',
    color: 'green',
  },
  liability: {
    order: 2,
    labelTr: 'Mali Sorumluluk',
    labelEn: 'Liability Coverage',
    description: '3. şahıslara verilen zararlara karşı koruma',
    color: 'blue',
  },
  personal_accident: {
    order: 3,
    labelTr: 'Ferdi Kaza',
    labelEn: 'Personal Accident',
    description: 'Sürücü ve yolcuların kaza teminatı',
    color: 'purple',
  },
  supplementary: {
    order: 4,
    labelTr: 'Ek Teminatlar',
    labelEn: 'Supplementary Coverage',
    description: 'İlave koruma ve özel durumlar',
    color: 'indigo',
  },
  assistance: {
    order: 5,
    labelTr: 'Asistans Hizmetleri',
    labelEn: 'Assistance Services',
    description: 'Yol yardımı ve destek hizmetleri',
    color: 'teal',
  },
  legal: {
    order: 6,
    labelTr: 'Hukuki Koruma',
    labelEn: 'Legal Protection',
    description: 'Hukuki süreç desteği',
    color: 'slate',
  },
} as const

export type KaskoCoverageCategory = keyof typeof KASKO_COVERAGE_CATEGORIES

// =============================================================================
// IMPLICIT COVERAGES (Always included in Kasko)
// =============================================================================

/**
 * These coverages are IMPLICITLY included in every kasko policy
 * They should NEVER be flagged as "missing"
 * The base kasko premium includes all of these
 */
export const KASKO_IMPLICIT_COVERAGES = [
  // Main coverages - always included in kasko
  {
    name: 'Çarpma/Çarpışma',
    nameTr: 'Çarpma/Çarpışma',
    nameEn: 'Collision',
    category: 'main' as const,
    description: 'Başka araç veya cisme çarpma sonucu oluşan hasarlar',
    alwaysIncluded: true,
    aliases: ['collision', 'çarpma', 'çarpışma', 'crash', 'impact'],
  },
  {
    name: 'Hırsızlık',
    nameTr: 'Hırsızlık',
    nameEn: 'Theft',
    category: 'main' as const,
    description: 'Aracın çalınması veya hırsızlık girişimi sonucu hasar',
    alwaysIncluded: true,
    aliases: ['theft', 'hırsızlık', 'çalınma', 'stealing', 'gasp'],
  },
  {
    name: 'Yangın',
    nameTr: 'Yangın',
    nameEn: 'Fire',
    category: 'main' as const,
    description: 'Yangın, yıldırım düşmesi ve infilak sonucu hasarlar',
    alwaysIncluded: true,
    aliases: ['fire', 'yangın', 'yanma', 'infilak', 'patlama'],
  },
  {
    name: 'Doğal Afet',
    nameTr: 'Doğal Afetler',
    nameEn: 'Natural Disasters',
    category: 'main' as const,
    description: 'Deprem, sel, fırtına, dolu gibi doğal afetler',
    alwaysIncluded: true,
    aliases: ['natural disaster', 'doğal afet', 'tabii afet'],
  },
  {
    name: 'Sel/Su Baskını',
    nameTr: 'Sel/Su Baskını',
    nameEn: 'Flood',
    category: 'main' as const,
    description: 'Sel ve su baskını sonucu oluşan hasarlar',
    alwaysIncluded: true,
    aliases: ['flood', 'sel', 'su baskını', 'taşkın'],
  },
  {
    name: 'Dolu',
    nameTr: 'Dolu',
    nameEn: 'Hail',
    category: 'main' as const,
    description: 'Dolu yağışı sonucu oluşan hasarlar',
    alwaysIncluded: true,
    aliases: ['hail', 'dolu', 'hailstorm'],
  },
  {
    name: 'Deprem',
    nameTr: 'Deprem',
    nameEn: 'Earthquake',
    category: 'main' as const,
    description: 'Deprem sonucu oluşan araç hasarları',
    alwaysIncluded: true,
    aliases: ['earthquake', 'deprem', 'zelzele'],
  },
  {
    name: 'Fırtına',
    nameTr: 'Fırtına',
    nameEn: 'Storm',
    category: 'main' as const,
    description: 'Fırtına ve şiddetli rüzgar sonucu hasarlar',
    alwaysIncluded: true,
    aliases: ['storm', 'fırtına', 'kasırga'],
  },
  {
    name: 'Üçüncü Şahıs Zararları',
    nameTr: 'Üçüncü Şahıs Mali Sorumluluk',
    nameEn: 'Third Party Liability',
    category: 'liability' as const,
    description: 'Üçüncü kişilere verilen zararların karşılanması',
    alwaysIncluded: true,
    aliases: ['third party', 'üçüncü şahıs', '3. şahıs', 'mali sorumluluk'],
  },
] as const

/**
 * Check if a coverage name matches any implicit kasko coverage
 */
export function isImplicitKaskoCoverage(coverageName: string): boolean {
  const nameLower = coverageName.toLowerCase()

  return KASKO_IMPLICIT_COVERAGES.some(implicit =>
    implicit.aliases.some(alias => nameLower.includes(alias.toLowerCase())) ||
    nameLower.includes(implicit.name.toLowerCase()) ||
    nameLower.includes(implicit.nameTr.toLowerCase())
  )
}

// =============================================================================
// COVERAGE TYPE DEFINITIONS
// =============================================================================

/**
 * Complete kasko coverage type definitions
 * Used for categorization, display, and analysis
 */
export const KASKO_COVERAGE_TYPES = {
  // Main Coverages (Ana Teminatlar)
  vehicle_value: {
    category: 'main',
    nameTr: 'Araç Bedeli',
    nameEn: 'Vehicle Value',
    description: 'Aracın rayiç değeri üzerinden teminat',
    isMarketValue: true,
    aliases: ['araç bedeli', 'araç değeri', 'sigorta bedeli', 'rayiç değer', 'vehicle value'],
    importance: 'critical',
  },
  collision: {
    category: 'main',
    nameTr: 'Çarpma/Çarpışma',
    nameEn: 'Collision',
    description: 'Diğer araçlar veya nesnelerle çarpışma',
    isImplicit: true,
    aliases: ['çarpma', 'çarpışma', 'collision'],
    importance: 'critical',
  },
  theft: {
    category: 'main',
    nameTr: 'Hırsızlık',
    nameEn: 'Theft',
    description: 'Araç hırsızlığı ve hırsızlık teşebbüsü',
    isImplicit: true,
    aliases: ['hırsızlık', 'çalınma', 'theft'],
    importance: 'critical',
  },
  fire: {
    category: 'main',
    nameTr: 'Yangın',
    nameEn: 'Fire',
    description: 'Yangın, yıldırım, infilak',
    isImplicit: true,
    aliases: ['yangın', 'fire', 'infilak'],
    importance: 'critical',
  },
  natural_disaster: {
    category: 'main',
    nameTr: 'Doğal Afetler',
    nameEn: 'Natural Disasters',
    description: 'Deprem, sel, dolu, fırtına',
    isImplicit: true,
    aliases: ['doğal afet', 'tabii afet', 'natural disaster'],
    importance: 'critical',
  },

  // Liability (Mali Sorumluluk)
  increased_liability: {
    category: 'liability',
    nameTr: 'Artan Mali Sorumluluk',
    nameEn: 'Increased Liability',
    description: 'Zorunlu trafik limitlerinin üzerinde teminat',
    isUnlimited: true, // Usually unlimited
    aliases: ['artan mali', 'artan mali sorumluluk', 'ihtiyari mali', 'increased liability'],
    importance: 'critical',
  },
  moral_damages: {
    category: 'liability',
    nameTr: 'Manevi Tazminat',
    nameEn: 'Moral Damages',
    description: 'Manevi tazminat talepleri',
    aliases: ['manevi', 'manevi tazminat', 'moral damages'],
    importance: 'standard',
  },

  // Personal Accident (Ferdi Kaza)
  driver_accident: {
    category: 'personal_accident',
    nameTr: 'Sürücü Ferdi Kaza',
    nameEn: 'Driver Personal Accident',
    description: 'Sürücü için kaza teminatı',
    aliases: ['sürücü ferdi kaza', 'sürücü kaza', 'driver accident'],
    importance: 'standard',
  },
  passenger_accident_death: {
    category: 'personal_accident',
    nameTr: 'Koltuk Ferdi Kaza - Ölüm',
    nameEn: 'Seat PA - Death',
    description: 'Yolcu ölüm teminatı',
    aliases: ['koltuk ferdi kaza', 'koltuk ölüm', 'yolcu ölüm', 'seat accident death'],
    importance: 'standard',
  },
  passenger_accident_disability: {
    category: 'personal_accident',
    nameTr: 'Koltuk Ferdi Kaza - Sürekli Sakatlık',
    nameEn: 'Seat PA - Permanent Disability',
    description: 'Yolcu sürekli sakatlık teminatı',
    aliases: ['sürekli sakatlık', 'sakatlık', 'permanent disability'],
    importance: 'standard',
  },
  passenger_accident_medical: {
    category: 'personal_accident',
    nameTr: 'Koltuk Ferdi Kaza - Tedavi',
    nameEn: 'Seat PA - Medical',
    description: 'Yolcu tedavi masrafları',
    aliases: ['tedavi', 'medical', 'tedavi masrafı'],
    importance: 'minor',
  },

  // Supplementary (Ek Teminatlar)
  glass: {
    category: 'supplementary',
    nameTr: 'Cam Kırılması',
    nameEn: 'Glass Breakage',
    description: 'Ön cam ve diğer camların kırılması',
    aliases: ['cam', 'cam kırılması', 'glass'],
    importance: 'standard',
  },
  personal_belongings: {
    category: 'supplementary',
    nameTr: 'Kişisel Eşya',
    nameEn: 'Personal Belongings',
    description: 'Araç içindeki kişisel eşyalar',
    aliases: ['kişisel eşya', 'personal belongings', 'eşya'],
    importance: 'minor',
  },
  key_loss: {
    category: 'supplementary',
    nameTr: 'Anahtar Kaybı',
    nameEn: 'Key Loss',
    description: 'Araç anahtarı kaybı/çalınması',
    aliases: ['anahtar', 'anahtar kaybı', 'key loss'],
    importance: 'minor',
  },
  wrong_fuel: {
    category: 'supplementary',
    nameTr: 'Hatalı Akaryakıt',
    nameEn: 'Wrong Fuel',
    description: 'Yanlış yakıt kullanımından kaynaklanan hasar',
    aliases: ['hatalı akaryakıt', 'yanlış yakıt', 'wrong fuel'],
    importance: 'minor',
  },
  tire_damage: {
    category: 'supplementary',
    nameTr: 'Lastik Hasarı',
    nameEn: 'Tire Damage',
    description: 'Lastik hasar ve patlamaları',
    aliases: ['lastik', 'lastik hasarı', 'tire'],
    importance: 'minor',
  },

  // Assistance (Asistans)
  roadside_assistance: {
    category: 'assistance',
    nameTr: 'Yol Yardım',
    nameEn: 'Roadside Assistance',
    description: '7/24 yol yardım hizmeti',
    isIncludedService: true,
    aliases: ['yol yardım', 'asistans', 'roadside'],
    importance: 'standard',
  },
  replacement_vehicle: {
    category: 'assistance',
    nameTr: 'İkame Araç',
    nameEn: 'Replacement Vehicle',
    description: 'Onarım süresince ikame araç',
    isIncludedService: true,
    aliases: ['ikame araç', 'ikame', 'replacement vehicle', 'kiralık araç'],
    importance: 'standard',
  },
  towing: {
    category: 'assistance',
    nameTr: 'Çekici Hizmeti',
    nameEn: 'Towing Service',
    description: 'Araç çekme hizmeti',
    isIncludedService: true,
    aliases: ['çekici', 'towing', 'çekim'],
    importance: 'standard',
  },

  // Legal Protection (Hukuki Koruma)
  legal_protection: {
    category: 'legal',
    nameTr: 'Hukuki Koruma',
    nameEn: 'Legal Protection',
    description: 'Hukuki süreçlerde destek',
    aliases: ['hukuki koruma', 'hukuki', 'legal protection'],
    importance: 'minor',
  },
  bail_advance: {
    category: 'legal',
    nameTr: 'Kefalet Avansı',
    nameEn: 'Bail Advance',
    description: 'Kefalet için avans',
    aliases: ['kefalet', 'avans', 'bail'],
    importance: 'minor',
  },
} as const

// =============================================================================
// COVERAGE DETECTION & CATEGORIZATION
// =============================================================================

/**
 * Detect the category of a coverage based on its name
 */
export function detectCoverageCategory(coverageName: string): KaskoCoverageCategory {
  const nameLower = coverageName.toLowerCase()

  // Check for liability keywords
  if (nameLower.includes('mali sorumluluk') ||
      nameLower.includes('manevi') ||
      nameLower.includes('artan mali')) {
    return 'liability'
  }

  // Check for personal accident keywords
  if (nameLower.includes('ferdi kaza') ||
      nameLower.includes('koltuk') ||
      nameLower.includes('ölüm') ||
      nameLower.includes('sakatlık') ||
      nameLower.includes('tedavi')) {
    return 'personal_accident'
  }

  // Check for assistance keywords
  if (nameLower.includes('asistans') ||
      nameLower.includes('yol yardım') ||
      nameLower.includes('ikame') ||
      nameLower.includes('çekici') ||
      nameLower.includes('hizmet')) {
    return 'assistance'
  }

  // Check for legal keywords
  if (nameLower.includes('hukuki') ||
      nameLower.includes('kefalet') ||
      nameLower.includes('avukat')) {
    return 'legal'
  }

  // Check for main coverage keywords
  if (nameLower.includes('araç bedeli') ||
      nameLower.includes('rayiç') ||
      nameLower.includes('çarpma') ||
      nameLower.includes('hırsızlık') ||
      nameLower.includes('yangın') ||
      nameLower.includes('doğal afet')) {
    return 'main'
  }

  // Default to supplementary for remaining coverages
  return 'supplementary'
}

/**
 * Detect if a coverage should display as "Sınırsız" (Unlimited)
 */
export function shouldShowUnlimited(coverageName: string, limit: number): boolean {
  const nameLower = coverageName.toLowerCase()

  // These coverage types are typically unlimited
  const unlimitedPatterns = [
    'artan mali sorumluluk',
    'mali sorumluluk', // without specific limit often means unlimited
    'unlimited',
    'sınırsız',
  ]

  // If limit is 0 and name contains unlimited patterns, it's unlimited
  if (limit === 0 || limit === null) {
    return unlimitedPatterns.some(pattern => nameLower.includes(pattern))
  }

  return false
}

/**
 * Detect if a coverage should display as "Dahil" (Included service)
 */
export function shouldShowIncluded(coverageName: string, limit: number): boolean {
  const nameLower = coverageName.toLowerCase()

  // Service coverages without numeric limits
  const servicePatterns = [
    'asistans',
    'yol yardım',
    'ikame araç',
    'çekici',
    'hizmet',
    'onarım',
    'yardım',
  ]

  if (limit === 0 || limit === null) {
    return servicePatterns.some(pattern => nameLower.includes(pattern))
  }

  return false
}

// =============================================================================
// VEHICLE INFORMATION
// =============================================================================

/**
 * Vehicle information structure for kasko policies
 */
export interface VehicleInfo {
  plate?: string          // e.g., "34 RZ 9511"
  make?: string           // e.g., "Ford"
  model?: string          // e.g., "Transit Custom"
  year?: number           // e.g., 2023
  engineNo?: string       // Motor no
  chassisNo?: string      // Şasi no
  color?: string          // Renk
  usage?: string          // Kullanım şekli (Hususi/Ticari)
  vehicleClass?: string   // Araç sınıfı (Binek/Kamyonet/TIR)
  fuelType?: string       // Yakıt tipi (Benzin/Dizel/LPG/Elektrik)
  estimatedValue?: number // Tahmini araç değeri
}

/**
 * Extract vehicle information from policy text or coverages
 */
export function extractVehicleInfo(policyText: string): VehicleInfo {
  const vehicle: VehicleInfo = {}

  // Plate number patterns
  const platePatterns = [
    /plaka[:\s]*([0-9]{2}\s*[A-Z]{1,3}\s*[0-9]{1,4})/i,
    /([0-9]{2}\s+[A-Z]{1,3}\s+[0-9]{1,4})/,
  ]
  for (const pattern of platePatterns) {
    const match = policyText.match(pattern)
    if (match) {
      vehicle.plate = match[1].toUpperCase().trim()
      break
    }
  }

  // Vehicle make/model patterns (common Turkish car brands)
  const makePatterns = [
    /marka[:\s]*([\w\s]+?)(?:\n|model|yıl)/i,
    /(ford|toyota|volkswagen|renault|fiat|mercedes|bmw|audi|hyundai|kia|peugeot|citroen|opel|skoda|seat|dacia|honda|nissan|mazda)/i,
  ]
  for (const pattern of makePatterns) {
    const match = policyText.match(pattern)
    if (match) {
      vehicle.make = match[1].trim()
      break
    }
  }

  // Model year
  const yearPattern = /(?:model\s*yılı|yıl)[:\s]*([0-9]{4})/i
  const yearMatch = policyText.match(yearPattern)
  if (yearMatch) {
    vehicle.year = parseInt(yearMatch[1])
  }

  // Usage type
  if (policyText.toLowerCase().includes('hususi')) {
    vehicle.usage = 'Hususi'
  } else if (policyText.toLowerCase().includes('ticari')) {
    vehicle.usage = 'Ticari'
  }

  return vehicle
}

// =============================================================================
// MARKET BENCHMARKS BY VEHICLE TYPE
// =============================================================================

export interface KaskoMarketBenchmark {
  vehicleClass: string
  ageRange: string
  averagePremium: number
  premiumRange: { min: number; max: number }
  marketValueRange: { min: number; max: number }
  typicalDeductible: number
  commonCoverages: string[]
}

export const KASKO_MARKET_BENCHMARKS: KaskoMarketBenchmark[] = [
  {
    vehicleClass: 'Binek (Sedan/Hatchback)',
    ageRange: '0-3 yıl',
    averagePremium: 25000,
    premiumRange: { min: 18000, max: 45000 },
    marketValueRange: { min: 500000, max: 2000000 },
    typicalDeductible: 0,
    commonCoverages: [
      'Rayiç Değer',
      'Artan Mali Sorumluluk',
      'Ferdi Kaza',
      'Cam Kırılması',
      'İkame Araç',
    ],
  },
  {
    vehicleClass: 'Binek (Sedan/Hatchback)',
    ageRange: '4-7 yıl',
    averagePremium: 18000,
    premiumRange: { min: 12000, max: 30000 },
    marketValueRange: { min: 300000, max: 800000 },
    typicalDeductible: 500,
    commonCoverages: [
      'Rayiç Değer',
      'Artan Mali Sorumluluk',
      'Ferdi Kaza',
    ],
  },
  {
    vehicleClass: 'SUV/Crossover',
    ageRange: '0-3 yıl',
    averagePremium: 35000,
    premiumRange: { min: 25000, max: 60000 },
    marketValueRange: { min: 800000, max: 4000000 },
    typicalDeductible: 0,
    commonCoverages: [
      'Rayiç Değer',
      'Artan Mali Sorumluluk',
      'Ferdi Kaza',
      'Cam Kırılması',
      'İkame Araç',
      'Anahtar Kaybı',
    ],
  },
  {
    vehicleClass: 'Ticari (Kamyonet/Panelvan)',
    ageRange: '0-5 yıl',
    averagePremium: 28000,
    premiumRange: { min: 20000, max: 50000 },
    marketValueRange: { min: 600000, max: 2500000 },
    typicalDeductible: 1000,
    commonCoverages: [
      'Rayiç Değer',
      'Artan Mali Sorumluluk',
      'Hukuki Koruma',
    ],
  },
  {
    vehicleClass: 'Motosiklet',
    ageRange: '0-5 yıl',
    averagePremium: 8000,
    premiumRange: { min: 4000, max: 15000 },
    marketValueRange: { min: 50000, max: 500000 },
    typicalDeductible: 500,
    commonCoverages: [
      'Rayiç Değer',
      'Hırsızlık',
      'Ferdi Kaza',
    ],
  },
]

/**
 * Find the appropriate benchmark for a vehicle
 */
export function findKaskoBenchmark(
  vehicleClass?: string,
  vehicleAge?: number
): KaskoMarketBenchmark | undefined {
  if (!vehicleClass) return KASKO_MARKET_BENCHMARKS[0] // Default to sedan

  const classLower = vehicleClass.toLowerCase()
  let matchedClass = 'Binek'

  if (classLower.includes('suv') || classLower.includes('crossover')) {
    matchedClass = 'SUV/Crossover'
  } else if (classLower.includes('kamyonet') || classLower.includes('ticari') || classLower.includes('panel')) {
    matchedClass = 'Ticari'
  } else if (classLower.includes('motor') || classLower.includes('motosiklet')) {
    matchedClass = 'Motosiklet'
  }

  const ageCategory = vehicleAge !== undefined
    ? (vehicleAge <= 3 ? '0-3 yıl' : vehicleAge <= 7 ? '4-7 yıl' : '0-5 yıl')
    : '0-3 yıl'

  return KASKO_MARKET_BENCHMARKS.find(
    b => b.vehicleClass.includes(matchedClass) && b.ageRange === ageCategory
  ) || KASKO_MARKET_BENCHMARKS.find(b => b.vehicleClass.includes(matchedClass))
}

// =============================================================================
// POLICY EVALUATION ADJUSTMENTS
// =============================================================================

/**
 * Kasko-specific evaluation criteria
 * Adjusts scores based on kasko-specific factors
 */
export interface KaskoEvaluationResult {
  hasMarketValueCoverage: boolean
  hasUnlimitedLiability: boolean
  hasPersonalAccident: boolean
  hasReplacementVehicle: boolean
  hasLegalProtection: boolean
  coverageCompleteness: number // 0-100
  premiumValueScore: number    // 0-100
  recommendations: string[]
  positives: string[]
}

export function evaluateKaskoPolicy(
  coverages: Array<{ name: string; limit: number; isUnlimited?: boolean; isMarketValue?: boolean }>,
  premium: number,
  vehicleInfo?: VehicleInfo
): KaskoEvaluationResult {
  const result: KaskoEvaluationResult = {
    hasMarketValueCoverage: false,
    hasUnlimitedLiability: false,
    hasPersonalAccident: false,
    hasReplacementVehicle: false,
    hasLegalProtection: false,
    coverageCompleteness: 0,
    premiumValueScore: 0,
    recommendations: [],
    positives: [],
  }

  // Analyze coverages
  for (const coverage of coverages) {
    const nameLower = coverage.name.toLowerCase()

    if (coverage.isMarketValue || nameLower.includes('rayiç') || nameLower.includes('araç bedeli')) {
      result.hasMarketValueCoverage = true
      result.positives.push('Araç rayiç değer üzerinden teminatlı')
    }

    if (coverage.isUnlimited || shouldShowUnlimited(coverage.name, coverage.limit)) {
      if (nameLower.includes('mali sorumluluk') || nameLower.includes('artan mali')) {
        result.hasUnlimitedLiability = true
        result.positives.push('Sınırsız mali sorumluluk teminatı mevcut')
      }
    }

    if (nameLower.includes('ferdi kaza') || nameLower.includes('koltuk')) {
      result.hasPersonalAccident = true
    }

    if (nameLower.includes('ikame') || nameLower.includes('replacement')) {
      result.hasReplacementVehicle = true
      result.positives.push('İkame araç hizmeti dahil')
    }

    if (nameLower.includes('hukuki') || nameLower.includes('legal')) {
      result.hasLegalProtection = true
    }
  }

  // Calculate completeness score
  let completenessScore = 60 // Base score for any kasko (implicit coverages)

  if (result.hasMarketValueCoverage) completenessScore += 10
  if (result.hasUnlimitedLiability) completenessScore += 15
  if (result.hasPersonalAccident) completenessScore += 5
  if (result.hasReplacementVehicle) completenessScore += 5
  if (result.hasLegalProtection) completenessScore += 5

  result.coverageCompleteness = Math.min(completenessScore, 100)

  // Premium value analysis
  const benchmark = findKaskoBenchmark(vehicleInfo?.vehicleClass, vehicleInfo?.year ? new Date().getFullYear() - vehicleInfo.year : undefined)
  if (benchmark) {
    if (premium <= benchmark.premiumRange.min) {
      result.premiumValueScore = 90
      result.positives.push('Prim piyasa ortalamasının altında')
    } else if (premium <= benchmark.averagePremium) {
      result.premiumValueScore = 70
    } else if (premium <= benchmark.premiumRange.max) {
      result.premiumValueScore = 50
      result.recommendations.push('Prim piyasa ortalamasının üzerinde - alternatif teklifler alın')
    } else {
      result.premiumValueScore = 30
      result.recommendations.push('Prim çok yüksek - mutlaka karşılaştırmalı teklif alın')
    }
  }

  // Generate recommendations
  if (!result.hasUnlimitedLiability) {
    result.recommendations.push('Sınırsız mali sorumluluk teminatı ekleyin')
  }
  if (!result.hasReplacementVehicle) {
    result.recommendations.push('İkame araç hizmeti eklemeyi değerlendirin')
  }
  if (!result.hasPersonalAccident) {
    result.recommendations.push('Ferdi kaza teminatı ekleyin')
  }

  return result
}

// =============================================================================
// EXCLUSION ANALYSIS
// =============================================================================

/**
 * Categorize exclusions by severity and type
 */
export interface ExclusionAnalysis {
  critical: string[]      // Very important exclusions
  standard: string[]      // Normal exclusions
  informational: string[] // FYI exclusions
}

export const CRITICAL_EXCLUSION_PATTERNS = [
  { pattern: 'nükleer', label: 'Nükleer riskler', severity: 'critical' },
  { pattern: 'savaş', label: 'Savaş ve iç savaş', severity: 'critical' },
  { pattern: 'terör', label: 'Terör eylemleri', severity: 'critical' },
  { pattern: 'kasıt', label: 'Kasıtlı hasar', severity: 'critical' },
  { pattern: 'alkol', label: 'Alkollü sürüş', severity: 'critical' },
  { pattern: 'ehliyet', label: 'Ehliyetsiz sürüş', severity: 'critical' },
  { pattern: 'yarış', label: 'Yarış ve hız denemeleri', severity: 'critical' },
]

export function analyzeExclusions(exclusions: string[]): ExclusionAnalysis {
  const result: ExclusionAnalysis = {
    critical: [],
    standard: [],
    informational: [],
  }

  for (const exclusion of exclusions) {
    const lower = exclusion.toLowerCase()

    const isCritical = CRITICAL_EXCLUSION_PATTERNS.some(
      p => lower.includes(p.pattern)
    )

    if (isCritical) {
      result.critical.push(exclusion)
    } else if (lower.includes('siber') || lower.includes('salgın') || lower.includes('yaptırım')) {
      result.standard.push(exclusion)
    } else {
      result.informational.push(exclusion)
    }
  }

  return result
}

// =============================================================================
// COVERAGE DISPLAY HELPERS
// =============================================================================

/**
 * Sort coverages by category and importance
 */
export function sortCoveragesByCategory<T extends { name: string; category?: string }>(
  coverages: T[]
): T[] {
  const categoryOrder: Record<string, number> = {
    main: 1,
    liability: 2,
    personal_accident: 3,
    supplementary: 4,
    assistance: 5,
    legal: 6,
    other: 7,
  }

  return [...coverages].sort((a, b) => {
    const catA = a.category || detectCoverageCategory(a.name)
    const catB = b.category || detectCoverageCategory(b.name)
    return (categoryOrder[catA] || 7) - (categoryOrder[catB] || 7)
  })
}

/**
 * Group coverages by category for display
 */
export function groupCoveragesByCategory<T extends { name: string; category?: string }>(
  coverages: T[]
): Record<KaskoCoverageCategory, T[]> {
  const groups: Record<string, T[]> = {
    main: [],
    liability: [],
    personal_accident: [],
    supplementary: [],
    assistance: [],
    legal: [],
  }

  for (const coverage of coverages) {
    const category = coverage.category || detectCoverageCategory(coverage.name)
    if (groups[category]) {
      groups[category].push(coverage)
    } else {
      groups.supplementary.push(coverage)
    }
  }

  return groups as Record<KaskoCoverageCategory, T[]>
}

/**
 * Format coverage limit for display
 */
export function formatKaskoCoverageLimit(
  coverage: { name: string; limit: number; isUnlimited?: boolean; isMarketValue?: boolean }
): string {
  if (coverage.isUnlimited) return 'Sınırsız'
  if (coverage.isMarketValue) return 'Rayiç Değer'

  if (shouldShowUnlimited(coverage.name, coverage.limit)) return 'Sınırsız'
  if (shouldShowIncluded(coverage.name, coverage.limit)) return 'Dahil'

  if (coverage.limit === 0) return 'Dahil'

  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(coverage.limit)
}

// =============================================================================
// SUB-LIMIT GROUPING
// =============================================================================

/**
 * Coverage group prefixes that should be consolidated into a single display item
 * Each prefix groups multiple sub-limit coverages under one parent
 */
export const COVERAGE_GROUP_PREFIXES = [
  {
    prefix: 'Hukuksal Koruma',
    displayName: 'Hukuksal Koruma',
    displayNameEn: 'Legal Protection',
    subLimitLabels: {
      'kefalet': 'Olay Başı Kefalet',
      'avans': 'Olay Başı Avans',
      'olay başına azami limit': 'Olay Başı Limit',
      'sigorta süresi': 'Yıllık Limit',
    },
  },
  {
    prefix: 'Koltuk Ferdi Kaza',
    displayName: 'Koltuk Ferdi Kaza',
    displayNameEn: 'Seat Personal Accident',
    subLimitLabels: {
      'ölüm': 'Ölüm',
      'sürekli sakatlık': 'Sürekli Sakatlık',
      'tedavi': 'Tedavi Masrafları',
    },
  },
  {
    prefix: 'Artan Mali Sorumluluk',
    displayName: 'Artan Mali Sorumluluk',
    displayNameEn: 'Increased Liability',
    subLimitLabels: {
      'maddi': 'Maddi Hasar',
      'bedeni': 'Bedeni Hasar',
      'manevi': 'Manevi Tazminat',
    },
  },
  {
    prefix: 'Ferdi Kaza',
    displayName: 'Ferdi Kaza',
    displayNameEn: 'Personal Accident',
    subLimitLabels: {
      'ölüm': 'Ölüm',
      'sakatlık': 'Sürekli Sakatlık',
      'tedavi': 'Tedavi',
    },
  },
] as const

/**
 * Represents a coverage with its sub-limits grouped together
 */
export interface GroupedCoverage {
  /** Main coverage name */
  name: string
  nameTr: string
  nameEn: string
  /** Category for display */
  category: string
  /** Whether this is a grouped coverage with sub-limits */
  isGrouped: boolean
  /** Sub-limits if grouped */
  subLimits?: Array<{
    label: string
    limit: number
    isUnlimited?: boolean
  }>
  /** Single limit if not grouped */
  limit?: number
  deductible?: number
  isUnlimited?: boolean
  isMarketValue?: boolean
  included?: boolean
  importance?: string
}

/**
 * Service coverages that need clarification about terms
 */
export const SERVICE_COVERAGE_CLARIFICATIONS: Record<string, {
  question: string
  questionEn: string
  details: string[]
  detailsEn: string[]
}> = {
  'ikame araç': {
    question: 'İkame araç kaç gün ve hangi şartlarda sağlanıyor?',
    questionEn: 'How many days and under what conditions is replacement vehicle provided?',
    details: ['Gün limiti (genellikle 15-30 gün)', 'Araç sınıfı', 'Minimum hasar tutarı şartı'],
    detailsEn: ['Day limit (usually 15-30 days)', 'Vehicle class', 'Minimum damage amount requirement'],
  },
  'çekici': {
    question: 'Çekici hizmeti limitsiz mi yoksa km sınırı var mı?',
    questionEn: 'Is towing unlimited or is there a distance limit?',
    details: ['Mesafe limiti (km)', 'Yıllık kullanım sayısı'],
    detailsEn: ['Distance limit (km)', 'Annual usage limit'],
  },
  'asistans': {
    question: 'Asistans hizmetlerinin kapsamı ve limitleri nedir?',
    questionEn: 'What is the scope and limits of assistance services?',
    details: ['7/24 erişim', 'Yol yardımı kapsamı', 'Konaklama desteği'],
    detailsEn: ['24/7 access', 'Roadside assistance scope', 'Accommodation support'],
  },
  'cam': {
    question: 'Cam hasarında muafiyet var mı?',
    questionEn: 'Is there a deductible for glass damage?',
    details: ['Ön cam muafiyeti', 'Yan cam muafiyeti', 'Onarım vs değişim'],
    detailsEn: ['Windshield deductible', 'Side window deductible', 'Repair vs replacement'],
  },
}

/**
 * Get clarification questions for a coverage
 */
export function getCoverageClarifications(coverageName: string): {
  question: string
  questionEn: string
  details: string[]
  detailsEn: string[]
} | null {
  const nameLower = coverageName.toLowerCase()
  for (const [key, value] of Object.entries(SERVICE_COVERAGE_CLARIFICATIONS)) {
    if (nameLower.includes(key)) {
      return value
    }
  }
  return null
}

/**
 * Importance order for sorting coverages
 */
export const IMPORTANCE_ORDER: Record<string, number> = {
  critical: 1,
  standard: 2,
  minor: 3,
}

/**
 * Sort grouped coverages by importance within each category
 */
export function sortByImportance(coverages: GroupedCoverage[]): GroupedCoverage[] {
  return [...coverages].sort((a, b) => {
    const importanceA = IMPORTANCE_ORDER[a.importance || 'standard'] || 2
    const importanceB = IMPORTANCE_ORDER[b.importance || 'standard'] || 2
    return importanceA - importanceB
  })
}

/**
 * Groups coverages that share a common prefix into consolidated items
 * e.g., "Hukuksal Koruma - Kefalet", "Hukuksal Koruma - Avans" become one item
 */
export function groupCoverageSubLimits<T extends {
  name: string
  nameTr?: string
  limit: number
  deductible?: number
  isUnlimited?: boolean
  isMarketValue?: boolean
  included?: boolean
  category?: string
  importance?: string
}>(coverages: T[]): GroupedCoverage[] {
  const result: GroupedCoverage[] = []
  const processedIndices = new Set<number>()

  // First pass: identify and group coverages with known prefixes
  for (const groupDef of COVERAGE_GROUP_PREFIXES) {
    const matchingCoverages: Array<{ coverage: T; index: number; subKey: string }> = []

    coverages.forEach((coverage, index) => {
      if (processedIndices.has(index)) return

      const nameLower = coverage.name.toLowerCase()
      const prefixLower = groupDef.prefix.toLowerCase()

      if (nameLower.startsWith(prefixLower) || nameLower.includes(prefixLower + ' -')) {
        // Find which sub-limit this is
        let subKey = ''
        for (const [key] of Object.entries(groupDef.subLimitLabels)) {
          if (nameLower.includes(key)) {
            subKey = key
            break
          }
        }
        matchingCoverages.push({ coverage, index, subKey })
      }
    })

    // If we found multiple coverages with this prefix, group them
    if (matchingCoverages.length > 1) {
      const firstCoverage = matchingCoverages[0].coverage
      const category = firstCoverage.category || detectCoverageCategory(firstCoverage.name)

      const grouped: GroupedCoverage = {
        name: groupDef.displayName,
        nameTr: groupDef.displayName,
        nameEn: groupDef.displayNameEn,
        category,
        isGrouped: true,
        subLimits: matchingCoverages.map(({ coverage, subKey }) => ({
          label: groupDef.subLimitLabels[subKey as keyof typeof groupDef.subLimitLabels] || extractSubLimitLabel(coverage.name, groupDef.prefix),
          limit: coverage.limit,
          // Check for unlimited status using both explicit flag and name pattern
          isUnlimited: coverage.isUnlimited || shouldShowUnlimited(coverage.name, coverage.limit),
        })),
        included: true,
        importance: firstCoverage.importance,
      }

      result.push(grouped)
      matchingCoverages.forEach(({ index }) => processedIndices.add(index))
    }
  }

  // Second pass: add remaining coverages as-is
  coverages.forEach((coverage, index) => {
    if (processedIndices.has(index)) return

    // Check if this should be displayed as unlimited (even if not explicitly flagged)
    const shouldBeUnlimited = coverage.isUnlimited || shouldShowUnlimited(coverage.name, coverage.limit)

    result.push({
      name: coverage.name,
      nameTr: coverage.nameTr || coverage.name,
      nameEn: coverage.name,
      category: coverage.category || detectCoverageCategory(coverage.name),
      isGrouped: false,
      limit: coverage.limit,
      deductible: coverage.deductible,
      isUnlimited: shouldBeUnlimited,
      isMarketValue: coverage.isMarketValue,
      included: coverage.included,
      importance: coverage.importance,
    })
  })

  return result
}

/**
 * Extract a clean sub-limit label from a full coverage name
 * e.g., "Hukuksal Koruma - Olay Başına Azami Kefalet" -> "Olay Başına Kefalet"
 */
function extractSubLimitLabel(fullName: string, prefix: string): string {
  // Remove the prefix and any separator
  let label = fullName
    .replace(new RegExp(prefix, 'i'), '')
    .replace(/^\s*[-–—:]\s*/, '')
    .trim()

  // Clean up common verbose parts
  label = label
    .replace(/azami\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return label || fullName
}

// =============================================================================
// EXCLUSION ANALYSIS & EXPLANATIONS
// =============================================================================

/**
 * Comprehensive exclusion explanations for kasko policies
 * Each exclusion has plain-language explanation and examples
 */
export const KASKO_EXCLUSION_EXPLANATIONS: Record<string, {
  explanation: string
  explanationEn: string
  examples?: string[]
  severity: 'critical' | 'important' | 'standard' | 'informational'
  affectsPrivate?: boolean  // Does this affect private/personal vehicles?
  affectsCommercial?: boolean  // Does this affect commercial vehicles?
}> = {
  // Critical exclusions - always important
  'alkol': {
    explanation: 'Sürücünün alkollü olması durumunda meydana gelen hasarlar karşılanmaz. Yasal alkol sınırı 0.50 promil\'dir.',
    explanationEn: 'Damages that occur while the driver is under the influence of alcohol are not covered. Legal limit is 0.50 promil.',
    examples: ['Alkollü sürüş sonucu kaza', 'İçki içtikten sonra araç kullanımı'],
    severity: 'critical',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'uyuşturucu': {
    explanation: 'Uyuşturucu veya uyarıcı madde etkisi altında oluşan hasarlar karşılanmaz.',
    explanationEn: 'Damages occurring under the influence of drugs or stimulants are not covered.',
    examples: ['İlaç etkisi altında kaza', 'Uyuşturucu kullanımı sonrası kaza'],
    severity: 'critical',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'ehliyet': {
    explanation: 'Geçerli ehliyeti olmayan sürücünün kullanımı sırasında oluşan hasarlar karşılanmaz.',
    explanationEn: 'Damages that occur while the vehicle is driven by an unlicensed driver are not covered.',
    examples: ['Ehliyetsiz sürüş', 'Süresi dolmuş ehliyet', 'Uygun sınıf ehliyet olmadan kullanım'],
    severity: 'critical',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'yetkisiz sürücü': {
    explanation: 'Poliçede belirtilen sürücü dışında birinin aracı kullanması durumunda hasar karşılanmayabilir. Bazı poliçelerde "belirli sürücü" şartı vardır.',
    explanationEn: 'Damages may not be covered if someone other than the designated driver operates the vehicle.',
    examples: ['Arkadaşa araç vermek', 'Aile üyesi dışında kullanım'],
    severity: 'important',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'vale': {
    explanation: 'Vale (otopark görevlisi) kullanımı sırasında oluşan hasarlar genellikle kapsam dışıdır. Vale hizmeti aldığınızda dikkatli olun.',
    explanationEn: 'Damages during valet parking are typically excluded. Be careful when using valet services.',
    examples: ['Vale park sırasında çizik', 'Otoparkta hasar', 'Vale tarafından kaza'],
    severity: 'important',
    affectsPrivate: true,
    affectsCommercial: false,
  },
  'yarış': {
    explanation: 'Yarış, hız denemesi veya ralli gibi etkinliklerde oluşan hasarlar karşılanmaz.',
    explanationEn: 'Damages during racing, speed tests, or rally events are not covered.',
    examples: ['Drag yarışı', 'Pist günü', 'Hız denemesi'],
    severity: 'critical',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'kasıt': {
    explanation: 'Bilerek ve isteyerek yapılan hasarlar karşılanmaz.',
    explanationEn: 'Intentional damages are not covered.',
    examples: ['Kasıtlı hasar', 'Sigorta dolandırıcılığı'],
    severity: 'critical',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'siber': {
    explanation: 'Siber saldırı, bilgisayar virüsü veya yazılım hatası kaynaklı hasarlar karşılanmaz. Modern araçlarda önemli bir risk.',
    explanationEn: 'Damages from cyber attacks, computer viruses, or software failures are not covered.',
    examples: ['Araç yazılımının hacklenmesi', 'Uzaktan erişim saldırısı'],
    severity: 'standard',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'salgın': {
    explanation: 'Salgın hastalık (pandemi) döneminde karantina veya kısıtlamalar nedeniyle oluşan dolaylı zararlar karşılanmaz.',
    explanationEn: 'Indirect damages due to pandemic quarantine or restrictions are not covered.',
    examples: ['COVID-19 döneminde araç kullanılamama'],
    severity: 'informational',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'nükleer': {
    explanation: 'Nükleer, biyolojik veya kimyasal riskler çoğu poliçede kapsam dışıdır veya sınırlı teminatlıdır.',
    explanationEn: 'Nuclear, biological, or chemical risks are excluded or have limited coverage.',
    examples: ['Radyoaktif kirlilik', 'Kimyasal sızıntı'],
    severity: 'informational',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'savaş': {
    explanation: 'Savaş, iç savaş, isyan veya halk hareketleri sırasında oluşan hasarlar karşılanmaz.',
    explanationEn: 'Damages during war, civil war, riots, or civil unrest are not covered.',
    examples: ['Savaş hasarı', 'İsyan sırasında zarar'],
    severity: 'informational',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'terör': {
    explanation: 'Terör eylemleri sonucu oluşan hasarlar genellikle ayrı değerlendirilir. DASK benzeri özel fonlar devreye girebilir.',
    explanationEn: 'Damages from terrorist acts may be covered separately through special funds.',
    examples: ['Bombalı saldırı hasarı', 'Terör olayı sonucu zarar'],
    severity: 'important',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'yaptırım': {
    explanation: 'Uluslararası yaptırımlar kapsamındaki kişi veya kuruluşlarla yapılan işlemlerle ilgili talepler karşılanmaz. Sigorta şirketleri yasal olarak bu ödemeleri yapamaz.',
    explanationEn: 'Claims related to sanctioned persons or entities cannot be paid due to international sanctions compliance.',
    examples: ['Yaptırım listesindeki şirketle iş yapma', 'Ambargo uygulanan ülkelerle işlem'],
    severity: 'informational',
    affectsPrivate: false,
    affectsCommercial: true,
  },
  'lpg': {
    explanation: 'Ruhsata işlenmemiş veya yetkisiz LPG dönüşümü olan araçlarda yangın hasarları karşılanmayabilir.',
    explanationEn: 'Fire damages may not be covered for vehicles with unauthorized LPG conversions.',
    examples: ['Kaçak LPG tüpü', 'Ruhsatsız dönüşüm'],
    severity: 'important',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'kiralık': {
    explanation: 'Aracın taksi, dolmuş veya kiralık araç olarak kullanılması durumunda özel şartlar geçerlidir. Hususi kullanım poliçeleri bu durumları kapsamaz.',
    explanationEn: 'Special conditions apply if vehicle is used as taxi, minibus, or rental car.',
    examples: ['Uber/Bolt gibi servislerde kullanım', 'Araç kiralama işi'],
    severity: 'important',
    affectsPrivate: true,
    affectsCommercial: false,
  },
  'aşınma': {
    explanation: 'Normal kullanım sonucu oluşan yıpranma, aşınma ve eskime hasarları karşılanmaz.',
    explanationEn: 'Wear and tear from normal use is not covered.',
    examples: ['Lastik aşınması', 'Fren balatası eskimesi', 'Motor yıpranması'],
    severity: 'standard',
    affectsPrivate: true,
    affectsCommercial: true,
  },
  'bakım': {
    explanation: 'Yetersiz bakım veya periyodik bakım yapılmaması nedeniyle oluşan hasarlar karşılanmayabilir.',
    explanationEn: 'Damages due to lack of maintenance may not be covered.',
    examples: ['Yağ değişimi yapılmadan motor arızası', 'Bakımsızlık nedeniyle hasar'],
    severity: 'standard',
    affectsPrivate: true,
    affectsCommercial: true,
  },
}

/**
 * Common exclusions that users SHOULD know about but may not be in their policy
 * These are important items to clarify with insurance
 */
export const COMMON_EXCLUSIONS_TO_CHECK = [
  {
    name: 'Vale Hırsızlığı/Hasarı',
    nameEn: 'Valet Theft/Damage',
    question: 'Vale park hizmeti sırasında araç çalınırsa veya hasar görürse karşılanıyor mu?',
    questionEn: 'Is theft or damage during valet parking covered?',
    importance: 'high',
  },
  {
    name: 'Alkollü Sürücü Limiti',
    nameEn: 'Alcohol Limit',
    question: 'Hangi promil seviyesinden sonra teminat geçersiz oluyor?',
    questionEn: 'At what blood alcohol level does coverage become invalid?',
    importance: 'high',
  },
  {
    name: 'Yedek Sürücü',
    nameEn: 'Additional Drivers',
    question: 'Poliçede belirtilen sürücü dışında başkası aracı kullanabilir mi?',
    questionEn: 'Can someone other than the named driver operate the vehicle?',
    importance: 'high',
  },
  {
    name: 'Yurt Dışı Kullanımı',
    nameEn: 'International Use',
    question: 'Araç yurt dışında kullanılırsa teminat geçerli mi?',
    questionEn: 'Is coverage valid when the vehicle is used abroad?',
    importance: 'medium',
  },
  {
    name: 'Ticari Kullanım',
    nameEn: 'Commercial Use',
    question: 'Aracı ticari amaçla (Uber, teslimat vb.) kullanabilir miyim?',
    questionEn: 'Can I use the vehicle commercially (Uber, delivery, etc.)?',
    importance: 'high',
  },
  {
    name: 'Modifikasyon',
    nameEn: 'Vehicle Modifications',
    question: 'Araçta modifikasyon yaparsam (jant, cam filmi, ses sistemi) teminat etkilenir mi?',
    questionEn: 'Does modifying the vehicle affect coverage?',
    importance: 'medium',
  },
]

/**
 * Analyzed exclusion with explanation and classification
 */
export interface AnalyzedExclusion {
  original: string
  type: 'exclusion' | 'coverage_with_limit' | 'condition'
  severity: 'critical' | 'important' | 'standard' | 'informational'
  explanation?: string
  explanationEn?: string
  examples?: string[]
  extractedLimit?: number  // If it's actually a coverage with limit
  needsClarification?: boolean
  clarificationQuestion?: string
}

/**
 * Full exclusion analysis result
 */
export interface ExclusionAnalysisResult {
  exclusions: AnalyzedExclusion[]
  coveragesInExclusions: AnalyzedExclusion[]  // Items that are actually coverages
  clarificationNeeded: Array<{
    item: string
    question: string
    questionEn: string
  }>
  missingImportantExclusions: Array<{
    name: string
    nameEn: string
    question: string
    importance: string
  }>
}

/**
 * Analyze exclusions comprehensively
 * - Detect if items are actually coverages (have limits mentioned)
 * - Add explanations
 * - Flag items needing clarification
 */
export function analyzeExclusionsComprehensive(
  exclusions: string[],
  isCommercial: boolean = false
): ExclusionAnalysisResult {
  const result: ExclusionAnalysisResult = {
    exclusions: [],
    coveragesInExclusions: [],
    clarificationNeeded: [],
    missingImportantExclusions: [],
  }

  // Pattern to detect if an "exclusion" is actually a coverage with limit
  const limitPattern = /\(?\s*(\d+(?:[.,]\d+)*)\s*(?:TL|₺|lira)?\s*(?:limit|teminat)?\s*\)?/i

  for (const exclusion of exclusions) {
    const exclusionLower = exclusion.toLowerCase()

    // Check if this is actually a coverage with a limit
    const limitMatch = exclusion.match(limitPattern)
    if (limitMatch) {
      // This is a coverage, not an exclusion
      const limitStr = limitMatch[1].replace(/[.,]/g, '')
      const limit = parseInt(limitStr)

      result.coveragesInExclusions.push({
        original: exclusion,
        type: 'coverage_with_limit',
        severity: 'informational',
        explanation: `Bu bir teminat limiti, istisna değil. ${exclusion.replace(limitMatch[0], '').trim()} için ${formatTurkishCurrency(limit)} limite kadar teminat verilmektedir.`,
        explanationEn: `This is a coverage limit, not an exclusion. Coverage up to ${formatTurkishCurrency(limit)} for ${exclusion.replace(limitMatch[0], '').trim()}.`,
        extractedLimit: limit,
      })
      continue
    }

    // Find explanation for this exclusion
    let analyzed: AnalyzedExclusion = {
      original: exclusion,
      type: 'exclusion',
      severity: 'standard',
    }

    // Match against known exclusion patterns
    for (const [key, info] of Object.entries(KASKO_EXCLUSION_EXPLANATIONS)) {
      if (exclusionLower.includes(key)) {
        // Check if this exclusion applies to the vehicle type
        if (isCommercial && info.affectsCommercial === false) continue
        if (!isCommercial && info.affectsPrivate === false) continue

        analyzed = {
          ...analyzed,
          severity: info.severity,
          explanation: info.explanation,
          explanationEn: info.explanationEn,
          examples: info.examples,
        }
        break
      }
    }

    // Check if this exclusion is unclear and needs clarification
    const unclearPatterns = [
      {
        pattern: 'yetkisiz',
        question: 'Yetkisiz sürücü tam olarak nasıl tanımlanıyor?',
        questionEn: 'How exactly is an unauthorized driver defined?',
      },
      {
        pattern: 'belirli sürücü',
        question: 'Hangi sürücüler bu poliçe kapsamında?',
        questionEn: 'Which drivers are covered under this policy?',
      },
      {
        pattern: 'ruhsata',
        question: 'Ruhsat bilgilerinin güncel olduğundan emin misiniz?',
        questionEn: 'Are you sure the registration information is up to date?',
      },
    ]

    for (const { pattern, question, questionEn } of unclearPatterns) {
      if (exclusionLower.includes(pattern)) {
        analyzed.needsClarification = true
        analyzed.clarificationQuestion = question
        result.clarificationNeeded.push({
          item: exclusion,
          question,
          questionEn,
        })
        break
      }
    }

    result.exclusions.push(analyzed)
  }

  // Check for important exclusions that SHOULD be mentioned but aren't
  const mentionedTopics = exclusions.map(e => e.toLowerCase()).join(' ')

  for (const check of COMMON_EXCLUSIONS_TO_CHECK) {
    const keywords = check.name.toLowerCase().split(/[\s/]+/)
    const isMentioned = keywords.some(kw => mentionedTopics.includes(kw))

    if (!isMentioned) {
      result.missingImportantExclusions.push({
        name: check.name,
        nameEn: check.nameEn,
        question: check.question,
        importance: check.importance,
      })
    }
  }

  return result
}

/**
 * Format number as Turkish currency
 */
function formatTurkishCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(amount)
}
