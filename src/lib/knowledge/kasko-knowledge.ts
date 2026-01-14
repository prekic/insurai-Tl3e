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
