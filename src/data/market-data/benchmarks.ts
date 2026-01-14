/**
 * Turkish Insurance Market Benchmark Data
 * Based on SEDDK and TSB statistics for 2024
 * All premiums in TRY (Turkish Lira)
 *
 * Sources:
 * - SEDDK Annual Reports
 * - TSB (Türkiye Sigorta Birliği) Statistics
 * - Market surveys and industry analysis
 */

import type { PolicyType } from '@/types/policy'
import type {
  PolicyTypeMarketData,
  TurkishRegion,
  CoverageBenchmark,
} from '@/types/market-data'

/**
 * Regional adjustment factors
 * Based on risk profiles, claim frequencies, and cost of living
 */
export const REGIONAL_FACTORS: Record<TurkishRegion, { name: string; nameTr: string; factor: number }> = {
  marmara: { name: 'Marmara', nameTr: 'Marmara', factor: 1.15 },
  ege: { name: 'Aegean', nameTr: 'Ege', factor: 1.05 },
  akdeniz: { name: 'Mediterranean', nameTr: 'Akdeniz', factor: 1.08 },
  ic_anadolu: { name: 'Central Anatolia', nameTr: 'İç Anadolu', factor: 0.95 },
  karadeniz: { name: 'Black Sea', nameTr: 'Karadeniz', factor: 0.90 },
  dogu_anadolu: { name: 'Eastern Anatolia', nameTr: 'Doğu Anadolu', factor: 0.85 },
  guneydogu: { name: 'Southeastern Anatolia', nameTr: 'Güneydoğu Anadolu', factor: 0.88 },
}

/**
 * Kasko (Comprehensive Auto Insurance) Benchmark
 */
const KASKO_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Collision Damage',
    nameTr: 'Çarpma/Çarpışma',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 2000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 100,
  },
  {
    name: 'Theft',
    nameTr: 'Hırsızlık',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 2000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 100,
  },
  {
    name: 'Natural Disasters',
    nameTr: 'Doğal Afetler',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 2000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 95,
  },
  {
    name: 'Fire',
    nameTr: 'Yangın',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 2000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 100,
  },
  {
    name: 'Glass Coverage',
    nameTr: 'Cam Kırılması',
    typicalLimit: 25000,
    minLimit: 5000,
    maxLimit: 50000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 1000,
    inclusionRate: 85,
  },
  {
    name: 'Personal Accident',
    nameTr: 'Ferdi Kaza',
    typicalLimit: 100000,
    minLimit: 50000,
    maxLimit: 500000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 70,
  },
  {
    name: 'Roadside Assistance',
    nameTr: 'Yol Yardım',
    typicalLimit: 15000,
    minLimit: 5000,
    maxLimit: 30000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 80,
  },
  {
    name: 'Legal Protection',
    nameTr: 'Hukuki Koruma',
    typicalLimit: 50000,
    minLimit: 20000,
    maxLimit: 100000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 500,
    inclusionRate: 45,
  },
]

const KASKO_EXCLUSIONS = [
  'Savaş, terör ve sabotaj',
  'Alkol veya uyuşturucu etkisi altında kullanım',
  'Ehliyetsiz sürücü kullanımı',
  'Aşırı yüklenme',
  'Yarış veya hız denemeleri',
  'Aracın ticari amaçla kullanılması (özel araç poliçesinde)',
  'Kasıtlı hasar',
  'Düzenli bakım eksikliğinden kaynaklanan arızalar',
]

/**
 * Traffic (Mandatory Third-Party Liability) Benchmark
 * Updated with 2025 SEDDK minimum limits
 *
 * Note: Traffic insurance has specific structure:
 * - Material damage (Maddi Hasar) is per-vehicle and per-accident, NOT per-person
 * - Bodily injury (Ölüm/Sakatlık, Sağlık) is per-person and per-accident
 */
const TRAFFIC_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Property Damage (per vehicle)',
    nameTr: 'Maddi Hasar (araç başı)',
    typicalLimit: 300000, // SEDDK 2025 minimum
    minLimit: 300000,
    maxLimit: 300000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
  {
    name: 'Property Damage (per accident)',
    nameTr: 'Maddi Hasar (kaza başı)',
    typicalLimit: 600000, // SEDDK 2025 minimum
    minLimit: 600000,
    maxLimit: 600000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
  {
    name: 'Death/Permanent Disability (per person)',
    nameTr: 'Ölüm ve Sürekli Sakatlık (kişi başı)',
    typicalLimit: 2700000, // SEDDK 2025 minimum
    minLimit: 2700000,
    maxLimit: 2700000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
  {
    name: 'Death/Permanent Disability (per accident)',
    nameTr: 'Ölüm ve Sürekli Sakatlık (kaza başı)',
    typicalLimit: 13500000, // SEDDK 2025 minimum
    minLimit: 13500000,
    maxLimit: 13500000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
  {
    name: 'Medical Expenses (per person)',
    nameTr: 'Sağlık Giderleri (kişi başı)',
    typicalLimit: 2700000, // SEDDK 2025 minimum
    minLimit: 2700000,
    maxLimit: 2700000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
  {
    name: 'Medical Expenses (per accident)',
    nameTr: 'Sağlık Giderleri (kaza başı)',
    typicalLimit: 13500000, // SEDDK 2025 minimum
    minLimit: 13500000,
    maxLimit: 13500000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
]

const TRAFFIC_EXCLUSIONS = [
  'Sigortalının kendi aracındaki hasar',
  'Sigortalının kendi yaralanması',
  'Kasıtlı olarak verilen zararlar',
  'Alkol veya uyuşturucu etkisi altında kaza',
  'Yarış veya hız denemeleri sırasında meydana gelen kazalar',
]

/**
 * Home Insurance (Konut Sigortası) Benchmark
 */
const HOME_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Fire',
    nameTr: 'Yangın',
    typicalLimit: 1500000,
    minLimit: 500000,
    maxLimit: 10000000,
    typicalDeductible: 1000,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 100,
  },
  {
    name: 'Theft',
    nameTr: 'Hırsızlık',
    typicalLimit: 50000,
    minLimit: 10000,
    maxLimit: 200000,
    typicalDeductible: 1000,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 85,
  },
  {
    name: 'Water Damage',
    nameTr: 'Su Hasarı',
    typicalLimit: 100000,
    minLimit: 25000,
    maxLimit: 500000,
    typicalDeductible: 500,
    minDeductible: 0,
    maxDeductible: 2500,
    inclusionRate: 90,
  },
  {
    name: 'Storm/Flood',
    nameTr: 'Fırtına/Sel',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 2000000,
    typicalDeductible: 2500,
    minDeductible: 500,
    maxDeductible: 10000,
    inclusionRate: 75,
  },
  {
    name: 'Glass Breakage',
    nameTr: 'Cam Kırılması',
    typicalLimit: 15000,
    minLimit: 5000,
    maxLimit: 50000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 500,
    inclusionRate: 70,
  },
  {
    name: 'Contents',
    nameTr: 'Eşya',
    typicalLimit: 100000,
    minLimit: 25000,
    maxLimit: 500000,
    typicalDeductible: 1000,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 80,
  },
  {
    name: 'Liability',
    nameTr: 'Sorumluluk',
    typicalLimit: 100000,
    minLimit: 25000,
    maxLimit: 500000,
    typicalDeductible: 500,
    minDeductible: 0,
    maxDeductible: 2500,
    inclusionRate: 60,
  },
  {
    name: 'Rent Loss',
    nameTr: 'Kira Kaybı',
    typicalLimit: 30000,
    minLimit: 10000,
    maxLimit: 100000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 40,
  },
]

const HOME_EXCLUSIONS = [
  'Deprem hasarı (DASK kapsamında)',
  'Savaş, terör, sabotaj',
  'Nükleer/radyoaktif kirlenme',
  'Kasıtlı hasar',
  'Aşınma ve yıpranma',
  'Bakım eksikliği',
  'İzinsiz tadilat sonucu oluşan hasarlar',
]

/**
 * Health Insurance (Sağlık Sigortası) Benchmark
 */
const HEALTH_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Hospitalization',
    nameTr: 'Yatarak Tedavi',
    typicalLimit: 1000000,
    minLimit: 250000,
    maxLimit: 5000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 100,
  },
  {
    name: 'Outpatient',
    nameTr: 'Ayakta Tedavi',
    typicalLimit: 50000,
    minLimit: 10000,
    maxLimit: 200000,
    typicalDeductible: 500,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 85,
  },
  {
    name: 'Surgery',
    nameTr: 'Ameliyat',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 2000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 100,
  },
  {
    name: 'Prescription Drugs',
    nameTr: 'İlaç',
    typicalLimit: 25000,
    minLimit: 5000,
    maxLimit: 100000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 1000,
    inclusionRate: 90,
  },
  {
    name: 'Maternity',
    nameTr: 'Doğum',
    typicalLimit: 75000,
    minLimit: 25000,
    maxLimit: 200000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 60,
  },
  {
    name: 'Dental',
    nameTr: 'Diş',
    typicalLimit: 10000,
    minLimit: 2500,
    maxLimit: 50000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 500,
    inclusionRate: 45,
  },
  {
    name: 'Optical',
    nameTr: 'Göz',
    typicalLimit: 5000,
    minLimit: 1000,
    maxLimit: 15000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 250,
    inclusionRate: 40,
  },
  {
    name: 'Emergency Abroad',
    nameTr: 'Yurtdışı Acil',
    typicalLimit: 100000,
    minLimit: 25000,
    maxLimit: 500000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 1000,
    inclusionRate: 70,
  },
]

const HEALTH_EXCLUSIONS = [
  'Mevcut hastalıklar (bekleme süresi)',
  'Estetik ameliyatlar',
  'Deneysel tedaviler',
  'Diş implantları',
  'Infertilite tedavileri',
  'Psikolojik tedaviler (sınırlı)',
  'Alkol/uyuşturucu tedavisi',
  'Spor yaralanmaları (profesyonel)',
]

/**
 * Life Insurance (Hayat Sigortası) Benchmark
 */
const LIFE_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Death Benefit',
    nameTr: 'Vefat Teminatı',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 5000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 100,
  },
  {
    name: 'Accidental Death',
    nameTr: 'Kaza Sonucu Vefat',
    typicalLimit: 1000000,
    minLimit: 200000,
    maxLimit: 10000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 85,
  },
  {
    name: 'Permanent Disability',
    nameTr: 'Sürekli Maluliyet',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 5000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 80,
  },
  {
    name: 'Critical Illness',
    nameTr: 'Kritik Hastalık',
    typicalLimit: 250000,
    minLimit: 50000,
    maxLimit: 1000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 55,
  },
  {
    name: 'Hospitalization Daily Benefit',
    nameTr: 'Günlük Hastane Yardımı',
    typicalLimit: 500, // per day
    minLimit: 100,
    maxLimit: 2000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 0,
    inclusionRate: 50,
  },
]

const LIFE_EXCLUSIONS = [
  'İntihar (ilk 2 yıl)',
  'Savaş veya terör eylemleri',
  'Nükleer/radyoaktif olaylar',
  'Alkol/uyuşturucu bağımlılığı',
  'Tehlikeli sporlar (ek teminat olmadan)',
  'Yasadışı faaliyetler sırasında meydana gelen ölüm',
]

/**
 * DASK (Mandatory Earthquake Insurance) Benchmark
 */
const DASK_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Building Damage',
    nameTr: 'Bina Hasarı',
    typicalLimit: 640000, // 2024 maximum
    minLimit: 50000,
    maxLimit: 640000,
    typicalDeductible: 6400, // 2% of coverage
    minDeductible: 1000,
    maxDeductible: 12800,
    inclusionRate: 100,
  },
]

const DASK_EXCLUSIONS = [
  'Eşya ve demirbaşlar',
  'Binanın dışındaki yapılar',
  'İstinat duvarları',
  'Ruhsatsız binalar',
  'Tsunami hasarı (ayrı teminat)',
  'Deprem sonrası yangın (konut sigortası kapsamında)',
]

/**
 * Business Insurance (İşyeri Sigortası) Benchmark
 */
const BUSINESS_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Fire',
    nameTr: 'Yangın',
    typicalLimit: 2000000,
    minLimit: 500000,
    maxLimit: 50000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 100,
  },
  {
    name: 'Theft',
    nameTr: 'Hırsızlık',
    typicalLimit: 200000,
    minLimit: 50000,
    maxLimit: 2000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 90,
  },
  {
    name: 'Business Interruption',
    nameTr: 'İş Durması',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 5000000,
    typicalDeductible: 10000,
    minDeductible: 0,
    maxDeductible: 50000,
    inclusionRate: 65,
  },
  {
    name: 'Equipment',
    nameTr: 'Makine Kırılması',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 10000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 70,
  },
  {
    name: 'Liability',
    nameTr: 'Sorumluluk',
    typicalLimit: 500000,
    minLimit: 100000,
    maxLimit: 5000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 75,
  },
  {
    name: 'Employee Injury',
    nameTr: 'İşçi Kazası',
    typicalLimit: 250000,
    minLimit: 50000,
    maxLimit: 1000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 60,
  },
  {
    name: 'Cyber',
    nameTr: 'Siber',
    typicalLimit: 100000,
    minLimit: 25000,
    maxLimit: 1000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 25,
  },
]

const BUSINESS_EXCLUSIONS = [
  'Savaş, terör, sabotaj',
  'Nükleer/radyoaktif kirlenme',
  'Kasıtlı hasar',
  'Aşınma ve yıpranma',
  'Tasarım hataları',
  'Bilinen kusurlar',
  'Ticari kayıplar (iş durması teminatı olmadan)',
]

/**
 * Nakliyat (Transportation/Cargo Insurance) Benchmark
 */
const NAKLIYAT_COVERAGES: CoverageBenchmark[] = [
  {
    name: 'Cargo Damage - All Risks (ICC-A)',
    nameTr: 'Emtia Hasarı - Tüm Riskler',
    typicalLimit: 500000,
    minLimit: 50000,
    maxLimit: 10000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 100,
  },
  {
    name: 'Loading/Unloading Damage',
    nameTr: 'Yükleme/Boşaltma Hasarı',
    typicalLimit: 500000,
    minLimit: 50000,
    maxLimit: 10000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 95,
  },
  {
    name: 'Theft',
    nameTr: 'Hırsızlık/Gasp',
    typicalLimit: 500000,
    minLimit: 50000,
    maxLimit: 10000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 50000,
    inclusionRate: 90,
  },
  {
    name: 'Natural Perils',
    nameTr: 'Doğal Afetler',
    typicalLimit: 500000,
    minLimit: 50000,
    maxLimit: 10000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 85,
  },
  {
    name: 'Storage Risk',
    nameTr: 'Depoda Bekleme Riski',
    typicalLimit: 250000,
    minLimit: 25000,
    maxLimit: 5000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 70,
  },
  {
    name: 'General Average',
    nameTr: 'Müşterek Avarya',
    typicalLimit: 100000,
    minLimit: 10000,
    maxLimit: 1000000,
    typicalDeductible: 0,
    minDeductible: 0,
    maxDeductible: 5000,
    inclusionRate: 80,
  },
  {
    name: 'War and Strikes (optional)',
    nameTr: 'Savaş ve Grev (isteğe bağlı)',
    typicalLimit: 500000,
    minLimit: 50000,
    maxLimit: 10000000,
    typicalDeductible: 5000,
    minDeductible: 0,
    maxDeductible: 25000,
    inclusionRate: 35,
  },
  {
    name: 'Carrier Liability (CMR)',
    nameTr: 'Taşıyıcı Sorumluluğu (CMR)',
    typicalLimit: 200000,
    minLimit: 25000,
    maxLimit: 2000000,
    typicalDeductible: 2500,
    minDeductible: 0,
    maxDeductible: 10000,
    inclusionRate: 60,
  },
]

const NAKLIYAT_EXCLUSIONS = [
  'Yetersiz ambalaj',
  'Malın doğasından kaynaklanan hasar (bozulma, ağırlık kaybı)',
  'Gecikme kaynaklı dolaylı zararlar',
  'Yaptırım uygulanan ülkelere taşıma',
  'Konteyner iç paketleme kusurları',
  'Gönderenin kusuru',
  'Savaş ve grev (ek teminat olmadan)',
  'Radyoaktif kirlenme',
  'Kasıtlı hasar',
]

/**
 * Complete market data for all policy types
 */
export const MARKET_BENCHMARKS: Record<PolicyType, PolicyTypeMarketData> = {
  kasko: {
    type: 'kasko',
    typeTr: 'Kasko',
    premiumRange: {
      min: 8000,
      max: 45000,
      average: 18500,
      median: 16000,
      percentile25: 12000,
      percentile75: 24000,
    },
    coverageRange: {
      min: 150000,
      max: 2500000,
      average: 550000,
      median: 450000,
    },
    commonCoverages: KASKO_COVERAGES,
    commonExclusions: KASKO_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 42.5, // High due to inflation
      claimsRatio: 68.2,
      marketGrowth: 35.8,
    },
    regionalFactors: {
      marmara: 1.20,
      ege: 1.10,
      akdeniz: 1.12,
      ic_anadolu: 0.95,
      karadeniz: 0.88,
      dogu_anadolu: 0.82,
      guneydogu: 0.85,
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  },
  traffic: {
    type: 'traffic',
    typeTr: 'Trafik Sigortası',
    premiumRange: {
      min: 2500,
      max: 8500,
      average: 4200,
      median: 3800,
      percentile25: 3000,
      percentile75: 5500,
    },
    coverageRange: {
      min: 7930000, // SEDDK 2024 minimum total
      max: 7930000,
      average: 7930000,
      median: 7930000,
    },
    commonCoverages: TRAFFIC_COVERAGES,
    commonExclusions: TRAFFIC_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 55.3,
      claimsRatio: 82.5,
      marketGrowth: 48.2,
    },
    regionalFactors: {
      marmara: 1.25,
      ege: 1.12,
      akdeniz: 1.15,
      ic_anadolu: 0.92,
      karadeniz: 0.85,
      dogu_anadolu: 0.78,
      guneydogu: 0.82,
    },
    dataDate: '2024-12-01',
    source: 'SEDDK Tarife',
  },
  home: {
    type: 'home',
    typeTr: 'Konut Sigortası',
    premiumRange: {
      min: 2500,
      max: 18000,
      average: 5800,
      median: 4800,
      percentile25: 3500,
      percentile75: 7500,
    },
    coverageRange: {
      min: 250000,
      max: 15000000,
      average: 1800000,
      median: 1200000,
    },
    commonCoverages: HOME_COVERAGES,
    commonExclusions: HOME_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 38.4,
      claimsRatio: 45.2,
      marketGrowth: 28.5,
    },
    regionalFactors: {
      marmara: 1.18,
      ege: 1.08,
      akdeniz: 1.10,
      ic_anadolu: 0.92,
      karadeniz: 0.88,
      dogu_anadolu: 0.85,
      guneydogu: 0.88,
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  },
  health: {
    type: 'health',
    typeTr: 'Sağlık Sigortası',
    premiumRange: {
      min: 12000,
      max: 95000,
      average: 32000,
      median: 26000,
      percentile25: 18000,
      percentile75: 45000,
    },
    coverageRange: {
      min: 250000,
      max: 10000000,
      average: 1500000,
      median: 1000000,
    },
    commonCoverages: HEALTH_COVERAGES,
    commonExclusions: HEALTH_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 52.8,
      claimsRatio: 78.5,
      marketGrowth: 42.3,
    },
    regionalFactors: {
      marmara: 1.15,
      ege: 1.05,
      akdeniz: 1.02,
      ic_anadolu: 0.95,
      karadeniz: 0.90,
      dogu_anadolu: 0.88,
      guneydogu: 0.90,
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  },
  life: {
    type: 'life',
    typeTr: 'Hayat Sigortası',
    premiumRange: {
      min: 3500,
      max: 35000,
      average: 9500,
      median: 7500,
      percentile25: 5000,
      percentile75: 14000,
    },
    coverageRange: {
      min: 100000,
      max: 10000000,
      average: 750000,
      median: 500000,
    },
    commonCoverages: LIFE_COVERAGES,
    commonExclusions: LIFE_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 28.5,
      claimsRatio: 35.2,
      marketGrowth: 22.8,
    },
    regionalFactors: {
      marmara: 1.08,
      ege: 1.02,
      akdeniz: 1.00,
      ic_anadolu: 0.98,
      karadeniz: 0.95,
      dogu_anadolu: 0.92,
      guneydogu: 0.94,
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  },
  dask: {
    type: 'dask',
    typeTr: 'DASK',
    premiumRange: {
      min: 250,
      max: 3500,
      average: 850,
      median: 650,
      percentile25: 400,
      percentile75: 1200,
    },
    coverageRange: {
      min: 50000,
      max: 640000, // 2024 maximum
      average: 320000,
      median: 280000,
    },
    commonCoverages: DASK_COVERAGES,
    commonExclusions: DASK_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 45.2,
      claimsRatio: 25.8,
      marketGrowth: 12.5,
    },
    regionalFactors: {
      marmara: 1.45, // High earthquake risk
      ege: 1.35,
      akdeniz: 1.20,
      ic_anadolu: 1.00,
      karadeniz: 0.85,
      dogu_anadolu: 1.25,
      guneydogu: 1.10,
    },
    dataDate: '2024-12-01',
    source: 'DASK',
  },
  business: {
    type: 'business',
    typeTr: 'İşyeri Sigortası',
    premiumRange: {
      min: 5000,
      max: 150000,
      average: 28000,
      median: 18000,
      percentile25: 10000,
      percentile75: 40000,
    },
    coverageRange: {
      min: 250000,
      max: 100000000,
      average: 3500000,
      median: 2000000,
    },
    commonCoverages: BUSINESS_COVERAGES,
    commonExclusions: BUSINESS_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 35.8,
      claimsRatio: 52.3,
      marketGrowth: 25.2,
    },
    regionalFactors: {
      marmara: 1.22,
      ege: 1.10,
      akdeniz: 1.08,
      ic_anadolu: 0.95,
      karadeniz: 0.88,
      dogu_anadolu: 0.85,
      guneydogu: 0.90,
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  },
  nakliyat: {
    type: 'nakliyat',
    typeTr: 'Nakliyat Sigortası',
    premiumRange: {
      min: 1500,
      max: 75000,
      average: 12000,
      median: 8000,
      percentile25: 4000,
      percentile75: 18000,
    },
    coverageRange: {
      min: 50000,
      max: 50000000,
      average: 2500000,
      median: 1000000,
    },
    commonCoverages: NAKLIYAT_COVERAGES,
    commonExclusions: NAKLIYAT_EXCLUSIONS,
    trends: {
      premiumChangeYoY: 32.5,
      claimsRatio: 48.5,
      marketGrowth: 28.2,
    },
    regionalFactors: {
      marmara: 1.10, // Major ports and logistics hubs
      ege: 1.05,
      akdeniz: 1.08, // Mersin port
      ic_anadolu: 0.95,
      karadeniz: 0.92,
      dogu_anadolu: 0.88,
      guneydogu: 0.95, // Border trade
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  },
}

/**
 * Get benchmark data for a policy type
 */
export function getBenchmarkData(policyType: PolicyType): PolicyTypeMarketData {
  return MARKET_BENCHMARKS[policyType]
}

/**
 * Get regional adjustment factor
 */
export function getRegionalFactor(policyType: PolicyType, region: TurkishRegion): number {
  const benchmark = MARKET_BENCHMARKS[policyType]
  return benchmark.regionalFactors[region] ?? 1.0
}

/**
 * Calculate premium percentile
 */
export function calculatePremiumPercentile(
  premium: number,
  policyType: PolicyType,
  region?: TurkishRegion
): number {
  const benchmark = MARKET_BENCHMARKS[policyType]
  const { min, max } = benchmark.premiumRange

  // Adjust for region if provided
  let adjustedMin = min
  let adjustedMax = max
  if (region) {
    const factor = getRegionalFactor(policyType, region)
    adjustedMin = min * factor
    adjustedMax = max * factor
  }

  const range = adjustedMax - adjustedMin
  if (range <= 0) return 50

  const percentile = ((premium - adjustedMin) / range) * 100
  return Math.min(100, Math.max(0, Math.round(percentile)))
}

/**
 * Calculate coverage percentile
 */
export function calculateCoveragePercentile(
  coverage: number,
  policyType: PolicyType
): number {
  const benchmark = MARKET_BENCHMARKS[policyType]
  const { min, max } = benchmark.coverageRange

  const range = max - min
  if (range <= 0) return 50

  const percentile = ((coverage - min) / range) * 100
  return Math.min(100, Math.max(0, Math.round(percentile)))
}
