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

export const MARKET_DATA_2024 = {
  totalPremium: 838_000_000_000, // 838 Billion TRY
  totalPremiumUSD: 24_000_000_000, // Approx 24 Billion USD
  growthRate: 0.42, // 42% YoY growth
  policyCount: 95_000_000, // Approx 95 million policies
  source: 'TSB 2024 Faaliyet Raporu',

  branchDistribution: {
    traffic: 0.185, // 18.5%
    health: 0.157, // 15.7%
    kasko: 0.128, // 12.8%
    life: 0.085, // 8.5%
    fire: 0.082, // 8.2%
    liability: 0.064, // 6.4%
    agricultural: 0.045, // 4.5%
    accident: 0.043, // 4.3%
    engineering: 0.038, // 3.8%
    marine: 0.032, // 3.2%
    credit: 0.021, // 2.1%
    other: 0.12, // 12%
  },

  companyCount: {
    nonLife: 50, // Hayat Dışı
    life: 19, // Hayat ve Emeklilik
    total: 69,
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
