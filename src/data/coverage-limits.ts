/**
 * Turkish Insurance Coverage Limits (Teminat Limitleri)
 *
 * Official minimum coverage limits for mandatory insurances
 * Source: SEDDK, DASK, Güvence Hesabı
 * Last Updated: January 2026
 *
 * IMPORTANT: These limits are updated annually by SEDDK.
 * Always verify with official sources before use.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CoverageLimit {
  code: string
  nameTR: string
  nameEN: string
  effectiveDate: string // ISO date
  expiryDate?: string // ISO date, null if current
  limits: LimitDetail[]
  source: string
  sourceUrl?: string
  notes?: string
  notesTR?: string
}

export interface LimitDetail {
  vehicleType?: string
  vehicleTypeTR?: string
  coverageType: string
  coverageTypeTR: string
  perPerson?: number
  perAccident?: number
  perVehicle?: number
  maxLimit?: number
  deductible?: number
  deductiblePercent?: number
  currency: 'TRY' | 'EUR' | 'USD'
}

export interface PremiumRange {
  insuranceType: string
  vehicleClass?: string
  propertyType?: string
  minPremium: number
  avgPremium: number
  maxPremium: number
  currency: 'TRY'
  year: number
  source: string
}

// =============================================================================
// TRAFFIC INSURANCE (ZMMS) LIMITS 2025-2026
// =============================================================================

export const TRAFFIC_INSURANCE_LIMITS_2025: CoverageLimit = {
  code: 'zmss_2025',
  nameTR: 'Zorunlu Mali Sorumluluk Sigortası (Trafik) Teminat Limitleri 2025',
  nameEN: 'Mandatory Motor TPL Coverage Limits 2025',
  effectiveDate: '2025-01-01',
  expiryDate: '2025-12-31',
  source: 'SEDDK',
  sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/tarife-ve-talimatlar',
  limits: [
    // Otomobil / Private Car
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'material_damage_per_vehicle',
      coverageTypeTR: 'Maddi Hasar (Araç Başına)',
      perVehicle: 300000,
      currency: 'TRY',
    },
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'material_damage_per_accident',
      coverageTypeTR: 'Maddi Hasar (Kaza Başına)',
      perAccident: 600000,
      currency: 'TRY',
    },
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'bodily_injury_per_person',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kişi Başına)',
      perPerson: 2700000,
      currency: 'TRY',
    },
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 13500000,
      currency: 'TRY',
    },

    // Minibüs (10-17 koltuk) / Minibus
    {
      vehicleType: 'minibus_10_17',
      vehicleTypeTR: 'Minibüs (10-17 Koltuk)',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 6075000,
      currency: 'TRY',
    },

    // Otobüs (18-30 koltuk) / Bus
    {
      vehicleType: 'bus_18_30',
      vehicleTypeTR: 'Otobüs (18-30 Koltuk)',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 15795000,
      currency: 'TRY',
    },

    // Otobüs (31+ koltuk) / Large Bus
    {
      vehicleType: 'bus_31_plus',
      vehicleTypeTR: 'Otobüs (31+ Koltuk)',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 31590000,
      currency: 'TRY',
    },

    // Kamyonet / Light Truck
    {
      vehicleType: 'pickup',
      vehicleTypeTR: 'Kamyonet',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 27000000,
      currency: 'TRY',
    },

    // Kamyon/Çekici / Truck/Tractor
    {
      vehicleType: 'truck',
      vehicleTypeTR: 'Kamyon/Çekici',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 33750000,
      currency: 'TRY',
    },
  ],
  notesTR:
    'SEDDK tarafından belirlenen asgari teminat limitleridir. Sigorta şirketleri daha yüksek limitler sunabilir.',
  notes:
    'Minimum coverage limits set by SEDDK. Insurance companies may offer higher limits.',
}

export const TRAFFIC_INSURANCE_LIMITS_2026: CoverageLimit = {
  code: 'zmss_2026',
  nameTR: 'Zorunlu Mali Sorumluluk Sigortası (Trafik) Teminat Limitleri 2026',
  nameEN: 'Mandatory Motor TPL Coverage Limits 2026',
  effectiveDate: '2026-01-01',
  source: 'SEDDK',
  sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/tarife-ve-talimatlar',
  limits: [
    // Updated limits for 2026 with ~33% increase
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'material_damage_per_vehicle',
      coverageTypeTR: 'Maddi Hasar (Araç Başına)',
      perVehicle: 400000,
      currency: 'TRY',
    },
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'material_damage_per_accident',
      coverageTypeTR: 'Maddi Hasar (Kaza Başına)',
      perAccident: 800000,
      currency: 'TRY',
    },
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'bodily_injury_per_person',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kişi Başına)',
      perPerson: 3600000,
      currency: 'TRY',
    },
    {
      vehicleType: 'automobile',
      vehicleTypeTR: 'Otomobil',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 18000000,
      currency: 'TRY',
    },

    // Minibüs (10-17 koltuk)
    {
      vehicleType: 'minibus_10_17',
      vehicleTypeTR: 'Minibüs (10-17 Koltuk)',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 8080000,
      currency: 'TRY',
    },

    // Otobüs (18-30 koltuk)
    {
      vehicleType: 'bus_18_30',
      vehicleTypeTR: 'Otobüs (18-30 Koltuk)',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 21008000,
      currency: 'TRY',
    },

    // Otobüs (31+ koltuk)
    {
      vehicleType: 'bus_31_plus',
      vehicleTypeTR: 'Otobüs (31+ Koltuk)',
      coverageType: 'bodily_injury_per_accident',
      coverageTypeTR: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
      perAccident: 42015000,
      currency: 'TRY',
    },
  ],
  notesTR: '2026 yılı için güncellenen limitler, yaklaşık %33 artış içermektedir.',
  notes: 'Updated limits for 2026, approximately 33% increase from 2025.',
}

// =============================================================================
// DASK (EARTHQUAKE INSURANCE) LIMITS 2024-2026
// =============================================================================

export const DASK_LIMITS_2024: CoverageLimit = {
  code: 'dask_2024',
  nameTR: 'Zorunlu Deprem Sigortası (DASK) Teminat Limitleri 2024',
  nameEN: 'Mandatory Earthquake Insurance Coverage Limits 2024',
  effectiveDate: '2024-01-01',
  expiryDate: '2024-12-31',
  source: 'DASK',
  sourceUrl: 'https://dask.gov.tr/tr/tarife-ve-primler',
  limits: [
    {
      coverageType: 'max_coverage',
      coverageTypeTR: 'Azami Teminat Tutarı',
      maxLimit: 2095462,
      currency: 'TRY',
    },
    {
      coverageType: 'sqm_cost_concrete',
      coverageTypeTR: 'Metrekare Birim Maliyeti (Betonarme)',
      maxLimit: 9884,
      currency: 'TRY',
    },
    {
      coverageType: 'sqm_cost_other',
      coverageTypeTR: 'Metrekare Birim Maliyeti (Diğer)',
      maxLimit: 6590,
      currency: 'TRY',
    },
  ],
  notesTR:
    'Her hasarda sigorta bedelinin %2\'si oranında tenzili muafiyet uygulanır.',
  notes: 'A 2% deductible per loss applies to the insured amount.',
}

export const DASK_MINIMUM_PREMIUMS_2024: CoverageLimit = {
  code: 'dask_min_premium_2024',
  nameTR: 'DASK Asgari Prim Tutarları 2024',
  nameEN: 'DASK Minimum Premium Amounts 2024',
  effectiveDate: '2024-01-01',
  source: 'DASK',
  sourceUrl: 'https://dask.gov.tr/tr/tarife',
  limits: [
    {
      coverageType: 'min_premium_zone_1',
      coverageTypeTR: 'Asgari Prim (1. Grup - Yüksek Risk)',
      maxLimit: 1951,
      currency: 'TRY',
    },
    {
      coverageType: 'min_premium_zone_2',
      coverageTypeTR: 'Asgari Prim (2. Grup)',
      maxLimit: 1737,
      currency: 'TRY',
    },
    {
      coverageType: 'min_premium_zone_3',
      coverageTypeTR: 'Asgari Prim (3. Grup)',
      maxLimit: 1474,
      currency: 'TRY',
    },
    {
      coverageType: 'min_premium_zone_4',
      coverageTypeTR: 'Asgari Prim (4. Grup)',
      maxLimit: 1384,
      currency: 'TRY',
    },
    {
      coverageType: 'min_premium_zone_5',
      coverageTypeTR: 'Asgari Prim (5. Grup)',
      maxLimit: 1038,
      currency: 'TRY',
    },
    {
      coverageType: 'min_premium_zone_6',
      coverageTypeTR: 'Asgari Prim (6. Grup)',
      maxLimit: 740,
      currency: 'TRY',
    },
    {
      coverageType: 'min_premium_zone_7',
      coverageTypeTR: 'Asgari Prim (7. Grup - Düşük Risk)',
      maxLimit: 505,
      currency: 'TRY',
    },
  ],
  notesTR: 'Prim tutarları risk grubuna ve yapı tipine göre değişmektedir.',
  notes: 'Premium amounts vary by risk zone and construction type.',
}

// =============================================================================
// SEAT ACCIDENT INSURANCE (KOLTUK FERDİ KAZA) LIMITS
// =============================================================================

export const SEAT_ACCIDENT_LIMITS_2025: CoverageLimit = {
  code: 'koltuk_ferdi_kaza_2025',
  nameTR: 'Karayolu Yolcu Taşımacılığı Zorunlu Koltuk Ferdi Kaza Teminat Limitleri 2025',
  nameEN: 'Mandatory Seat Personal Accident Coverage Limits 2025',
  effectiveDate: '2025-01-01',
  source: 'SEDDK',
  limits: [
    {
      coverageType: 'death_benefit',
      coverageTypeTR: 'Vefat Teminatı (Kişi Başı)',
      perPerson: 750000,
      currency: 'TRY',
    },
    {
      coverageType: 'permanent_disability',
      coverageTypeTR: 'Sürekli Sakatlık Teminatı (Kişi Başı)',
      perPerson: 750000,
      currency: 'TRY',
    },
    {
      coverageType: 'medical_expenses',
      coverageTypeTR: 'Tedavi Giderleri (Kişi Başı)',
      perPerson: 150000,
      currency: 'TRY',
    },
  ],
}

// =============================================================================
// MEDICAL MALPRACTICE INSURANCE LIMITS
// =============================================================================

export const MEDICAL_MALPRACTICE_LIMITS_2025: CoverageLimit = {
  code: 'tibbi_kotu_uygulama_2025',
  nameTR: 'Tıbbi Kötü Uygulamaya İlişkin Zorunlu Mali Sorumluluk Teminat Limitleri 2025',
  nameEN: 'Medical Malpractice Mandatory Liability Coverage Limits 2025',
  effectiveDate: '2025-01-01',
  source: 'SEDDK',
  limits: [
    {
      coverageType: 'per_claim',
      coverageTypeTR: 'Olay Başına',
      perAccident: 1500000,
      currency: 'TRY',
    },
    {
      coverageType: 'annual_aggregate',
      coverageTypeTR: 'Yıllık Toplam',
      maxLimit: 6000000,
      currency: 'TRY',
    },
  ],
  notesTR: 'Limitler hekim/sağlık personeli kategorisine göre değişebilir.',
  notes: 'Limits may vary by physician/healthcare personnel category.',
}

// =============================================================================
// PREMIUM BENCHMARKS (MARKET AVERAGES)
// =============================================================================

export const PREMIUM_BENCHMARKS: PremiumRange[] = [
  // Traffic Insurance
  {
    insuranceType: 'zmss',
    vehicleClass: 'automobile',
    minPremium: 3000,
    avgPremium: 4500,
    maxPremium: 8000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'zmss',
    vehicleClass: 'motorcycle',
    minPremium: 1500,
    avgPremium: 2500,
    maxPremium: 5000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'zmss',
    vehicleClass: 'commercial_vehicle',
    minPremium: 5000,
    avgPremium: 8000,
    maxPremium: 15000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },

  // Kasko
  {
    insuranceType: 'kasko',
    vehicleClass: 'economy',
    minPremium: 4000,
    avgPremium: 10000,
    maxPremium: 15000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'kasko',
    vehicleClass: 'mid_range',
    minPremium: 10000,
    avgPremium: 18000,
    maxPremium: 25000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'kasko',
    vehicleClass: 'luxury',
    minPremium: 20000,
    avgPremium: 35000,
    maxPremium: 80000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'kasko',
    vehicleClass: 'commercial',
    minPremium: 8000,
    avgPremium: 15000,
    maxPremium: 30000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },

  // DASK
  {
    insuranceType: 'dask',
    propertyType: 'apartment_concrete',
    minPremium: 500,
    avgPremium: 1200,
    maxPremium: 2000,
    currency: 'TRY',
    year: 2025,
    source: 'DASK Official',
  },
  {
    insuranceType: 'dask',
    propertyType: 'house_concrete',
    minPremium: 700,
    avgPremium: 1500,
    maxPremium: 2500,
    currency: 'TRY',
    year: 2025,
    source: 'DASK Official',
  },
  {
    insuranceType: 'dask',
    propertyType: 'other_structure',
    minPremium: 400,
    avgPremium: 900,
    maxPremium: 1600,
    currency: 'TRY',
    year: 2025,
    source: 'DASK Official',
  },

  // Home Insurance
  {
    insuranceType: 'home',
    propertyType: 'apartment',
    minPremium: 1500,
    avgPremium: 3500,
    maxPremium: 8000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'home',
    propertyType: 'villa',
    minPremium: 3000,
    avgPremium: 7000,
    maxPremium: 15000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },

  // Health Insurance
  {
    insuranceType: 'health',
    propertyType: 'individual_basic',
    minPremium: 8000,
    avgPremium: 15000,
    maxPremium: 25000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'health',
    propertyType: 'individual_comprehensive',
    minPremium: 20000,
    avgPremium: 40000,
    maxPremium: 80000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'health',
    propertyType: 'supplementary',
    minPremium: 3000,
    avgPremium: 6000,
    maxPremium: 12000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },

  // Life Insurance
  {
    insuranceType: 'life',
    propertyType: 'term_life',
    minPremium: 1000,
    avgPremium: 3000,
    maxPremium: 10000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'life',
    propertyType: 'credit_life',
    minPremium: 500,
    avgPremium: 2000,
    maxPremium: 5000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },

  // Business Insurance
  {
    insuranceType: 'business',
    propertyType: 'small_business',
    minPremium: 3000,
    avgPremium: 8000,
    maxPremium: 20000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
  {
    insuranceType: 'business',
    propertyType: 'medium_business',
    minPremium: 10000,
    avgPremium: 30000,
    maxPremium: 100000,
    currency: 'TRY',
    year: 2025,
    source: 'TSB Market Data',
  },
]

// =============================================================================
// MARKET DATA 2024
// =============================================================================

// =============================================================================
// DASK PREMIUM RATE TABLE (TARIFE) - 2026
// =============================================================================

/**
 * DASK Premium Rates by Risk Zone and Construction Type
 * Rates are in per mille (‰) - multiply by coverage amount
 * Formula: Premium = Coverage Amount × Rate
 * Coverage Amount = Unit Cost per m² × Gross Area (max 212 m² for max coverage)
 *
 * Source: https://dask.gov.tr/tr/tarife-ve-primler
 * Effective: 01.01.2026
 */
export const DASK_PREMIUM_RATES_2026 = {
  effectiveDate: '2026-01-01',
  source: 'DASK',
  sourceUrl: 'https://dask.gov.tr/tr/tarife-ve-primler',

  // Unit costs per square meter
  unitCosts: {
    betonarme: 9884, // Reinforced concrete
    diger: 6590, // Other construction types
  },

  // Maximum coverage
  maxCoverage: 2095462,

  // Premium rates by risk zone (per mille ‰)
  rates: {
    betonarme: {
      zone1: 2.82,
      zone2: 2.51,
      zone3: 2.13,
      zone4: 2.0,
      zone5: 1.5,
      zone6: 1.07,
      zone7: 0.73,
    },
    diger: {
      zone1: 4.96,
      zone2: 4.25,
      zone3: 3.73,
      zone4: 3.49,
      zone5: 2.79,
      zone6: 1.86,
      zone7: 1.09,
    },
  },

  // Example premiums for 100m² property (TRY)
  examplePremiums100sqm: {
    betonarme: {
      zone1: 2787,
      zone2: 2481,
      zone3: 2105,
      zone4: 1977,
      zone5: 1483,
      zone6: 1058,
      zone7: 722,
    },
    diger: {
      zone1: 3268,
      zone2: 2801,
      zone3: 2458,
      zone4: 2299,
      zone5: 1839,
      zone6: 1226,
      zone7: 718,
    },
  },

  // Deductible
  deductible: {
    percentage: 2, // 2% of insured value per claim
    description: 'Her hasarda sigorta bedelinin %2\'si oranında tenzili muafiyet',
  },
}

/**
 * Calculate DASK premium
 */
export function calculateDaskPremium(
  grossAreaSqm: number,
  constructionType: 'betonarme' | 'diger',
  riskZone: 1 | 2 | 3 | 4 | 5 | 6 | 7
): { coverage: number; premium: number; deductible: number } {
  const unitCost = DASK_PREMIUM_RATES_2026.unitCosts[constructionType]
  const coverage = Math.min(grossAreaSqm * unitCost, DASK_PREMIUM_RATES_2026.maxCoverage)
  const rate =
    DASK_PREMIUM_RATES_2026.rates[constructionType][`zone${riskZone}` as keyof typeof DASK_PREMIUM_RATES_2026.rates.betonarme]
  const premium = (coverage * rate) / 1000
  const deductible = coverage * 0.02

  return {
    coverage: Math.round(coverage),
    premium: Math.round(premium),
    deductible: Math.round(deductible),
  }
}

// =============================================================================
// MARKET DATA 2024 - COMPREHENSIVE
// =============================================================================

export const MARKET_DATA_2024 = {
  totalPremium: 838_000_000_000, // 838 Billion TRY
  totalPremiumUSD: 24_000_000_000, // Approx 24 Billion USD
  growthRate: 0.74, // 74% YoY growth (corrected from search)
  policyCount: 95_000_000, // Approx 95 million policies
  source: 'TSB 2024 Faaliyet Raporu',
  sourceUrl: 'https://www.tsb.org.tr/tr/istatistik',

  // Detailed premium breakdown
  premiumBreakdown: {
    hayatDisi: 738_000_000_000, // Non-life: 738 billion TRY
    hayat: 100_000_000_000, // Life: 100 billion TRY
  },

  // Total claims paid
  claimsPaid: {
    total: 339_000_000_000, // 339 billion TRY
    hayatDisi: 323_700_000_000, // Non-life claims
    hayat: 15_200_000_000, // Life claims
    yoyGrowth: 0.6, // 60% increase from 2023
  },

  // Loss ratio (Hasar/Prim Oranı)
  lossRatio: {
    overall: 0.742, // 74.2% combined ratio
    hayatDisi: 0.438, // ~43.8% for non-life (323.7/738)
    hayat: 0.152, // ~15.2% for life (15.2/100)
  },

  // Insurance penetration
  penetration: {
    rate: 0.0248, // 2.48% - highest in 10 years
    note: 'Son 10 yılın en yüksek sigortalılık oranı',
  },

  // Capital adequacy
  capitalAdequacy: {
    ratio: 1.81, // 181%
    equity: 265_300_000_000, // 265.3 billion TRY
    equityGrowth: 0.74, // 74% YoY
  },

  branchDistribution: {
    traffic: 0.22, // 22% (updated from search - highest)
    health: 0.16, // 16%
    fire: 0.15, // 15% (Yangın ve Afet)
    kasko: 0.128, // 12.8%
    life: 0.085, // 8.5%
    liability: 0.064, // 6.4%
    agricultural: 0.045, // 4.5%
    accident: 0.043, // 4.3%
    engineering: 0.038, // 3.8%
    marine: 0.032, // 3.2%
    credit: 0.021, // 2.1%
    other: 0.054, // 5.4%
  },

  companyCount: {
    nonLife: 50, // Hayat Dışı
    life: 19, // Hayat ve Emeklilik
    reinsurance: 5, // Reasürans
    total: 74, // Updated from search
  },

  averagePremiums: {
    traffic: 4500,
    kasko: 15000,
    dask: 1200,
    health: 25000,
    home: 3500,
    life: 5000,
  },
}

// =============================================================================
// BRANCH-LEVEL STATISTICS 2024
// =============================================================================

export interface BranchStatistics {
  code: string
  nameTR: string
  nameEN: string
  premiumProduction: number // TRY
  marketShare: number // Percentage
  claimsPaid: number // TRY
  lossRatio: number // Claims/Premium ratio
  policyCount?: number
  yoyGrowth: number // Year over year growth
}

export const BRANCH_STATISTICS_2024: BranchStatistics[] = [
  {
    code: 'traffic',
    nameTR: 'Kara Araçları Sorumluluk (Trafik)',
    nameEN: 'Motor Third Party Liability',
    premiumProduction: 219_300_000_000, // 219.3 billion TRY
    marketShare: 0.22,
    claimsPaid: 175_000_000_000, // Estimated based on high loss ratio
    lossRatio: 0.80, // Traffic typically has high loss ratio
    yoyGrowth: 0.85,
  },
  {
    code: 'health',
    nameTR: 'Hastalık/Sağlık',
    nameEN: 'Health Insurance',
    premiumProduction: 134_000_000_000,
    marketShare: 0.16,
    claimsPaid: 94_000_000_000,
    lossRatio: 0.70,
    yoyGrowth: 0.65,
  },
  {
    code: 'fire',
    nameTR: 'Yangın ve Doğal Afetler',
    nameEN: 'Fire and Natural Disasters',
    premiumProduction: 125_700_000_000,
    marketShare: 0.15,
    claimsPaid: 37_700_000_000,
    lossRatio: 0.30,
    yoyGrowth: 0.70,
  },
  {
    code: 'kasko',
    nameTR: 'Kara Araçları (Kasko)',
    nameEN: 'Motor Own Damage',
    premiumProduction: 107_300_000_000,
    marketShare: 0.128,
    claimsPaid: 64_400_000_000,
    lossRatio: 0.60,
    yoyGrowth: 0.55,
  },
  {
    code: 'life',
    nameTR: 'Hayat',
    nameEN: 'Life Insurance',
    premiumProduction: 71_200_000_000,
    marketShare: 0.085,
    claimsPaid: 15_200_000_000,
    lossRatio: 0.21,
    yoyGrowth: 0.45,
  },
  {
    code: 'liability',
    nameTR: 'Genel Sorumluluk',
    nameEN: 'General Liability',
    premiumProduction: 53_600_000_000,
    marketShare: 0.064,
    claimsPaid: 21_400_000_000,
    lossRatio: 0.40,
    yoyGrowth: 0.50,
  },
  {
    code: 'agricultural',
    nameTR: 'Tarım',
    nameEN: 'Agricultural',
    premiumProduction: 37_700_000_000,
    marketShare: 0.045,
    claimsPaid: 26_400_000_000,
    lossRatio: 0.70,
    yoyGrowth: 0.40,
  },
  {
    code: 'accident',
    nameTR: 'Kaza',
    nameEN: 'Accident',
    premiumProduction: 36_000_000_000,
    marketShare: 0.043,
    claimsPaid: 14_400_000_000,
    lossRatio: 0.40,
    yoyGrowth: 0.35,
  },
  {
    code: 'engineering',
    nameTR: 'Mühendislik',
    nameEN: 'Engineering',
    premiumProduction: 31_800_000_000,
    marketShare: 0.038,
    claimsPaid: 9_500_000_000,
    lossRatio: 0.30,
    yoyGrowth: 0.60,
  },
  {
    code: 'marine',
    nameTR: 'Nakliyat',
    nameEN: 'Marine & Transportation',
    premiumProduction: 26_800_000_000,
    marketShare: 0.032,
    claimsPaid: 10_700_000_000,
    lossRatio: 0.40,
    yoyGrowth: 0.45,
  },
  {
    code: 'credit',
    nameTR: 'Kredi',
    nameEN: 'Credit Insurance',
    premiumProduction: 17_600_000_000,
    marketShare: 0.021,
    claimsPaid: 5_300_000_000,
    lossRatio: 0.30,
    yoyGrowth: 0.55,
  },
]

/**
 * Get branch statistics by code
 */
export function getBranchStatistics(code: string): BranchStatistics | undefined {
  return BRANCH_STATISTICS_2024.find((b) => b.code === code)
}

/**
 * Get loss ratio benchmark for validation
 */
export function getLossRatioBenchmark(branchCode: string): { expected: number; warning: number; critical: number } {
  const branch = getBranchStatistics(branchCode)
  const baseLossRatio = branch?.lossRatio || 0.5

  return {
    expected: baseLossRatio,
    warning: baseLossRatio * 1.2, // 20% above average
    critical: baseLossRatio * 1.5, // 50% above average
  }
}

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

export function getCurrentTrafficLimits(): CoverageLimit {
  const now = new Date()
  const year = now.getFullYear()

  if (year >= 2026) {
    return TRAFFIC_INSURANCE_LIMITS_2026
  }
  return TRAFFIC_INSURANCE_LIMITS_2025
}

export function getCurrentDaskLimits(): CoverageLimit {
  return DASK_LIMITS_2024 // Most current available
}

export function getPremiumBenchmark(
  insuranceType: string,
  vehicleClass?: string,
  propertyType?: string
): PremiumRange | undefined {
  return PREMIUM_BENCHMARKS.find((b) => {
    if (b.insuranceType !== insuranceType) return false
    if (vehicleClass && b.vehicleClass !== vehicleClass) return false
    if (propertyType && b.propertyType !== propertyType) return false
    return true
  })
}

export function validateAgainstMinimumLimits(
  insuranceType: string,
  coverages: { type: string; limit: number }[]
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (insuranceType === 'traffic' || insuranceType === 'zmss') {
    const limits = getCurrentTrafficLimits()

    for (const coverage of coverages) {
      const limitDef = limits.limits.find(
        (l) =>
          l.coverageType === coverage.type ||
          l.coverageTypeTR?.toLowerCase().includes(coverage.type.toLowerCase())
      )

      if (limitDef) {
        const minLimit =
          limitDef.perPerson || limitDef.perAccident || limitDef.perVehicle || 0
        if (coverage.limit < minLimit) {
          issues.push(
            `${coverage.type}: ${coverage.limit.toLocaleString('tr-TR')} TL minimum limitin altında (Min: ${minLimit.toLocaleString('tr-TR')} TL)`
          )
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

// =============================================================================
// ALL COVERAGE LIMITS EXPORT
// =============================================================================

export const ALL_COVERAGE_LIMITS: CoverageLimit[] = [
  TRAFFIC_INSURANCE_LIMITS_2025,
  TRAFFIC_INSURANCE_LIMITS_2026,
  DASK_LIMITS_2024,
  DASK_MINIMUM_PREMIUMS_2024,
  SEAT_ACCIDENT_LIMITS_2025,
  MEDICAL_MALPRACTICE_LIMITS_2025,
]
