/**
 * Branch Golden Datasets
 *
 * Realistic extraction fixtures for each branch, used by test suites
 * to verify branch-specific validator, insight, and display-interpreter behavior.
 */
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

function basePolicy(overrides: Partial<ExtractedPolicyData>): ExtractedPolicyData {
  return {
    policyNumber: 'GOLD-001',
    provider: 'Test Sigorta',
    policyType: null,
    insuredName: 'Ahmet Yılmaz',
    insuredAddress: 'Istanbul, Turkey',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    premium: 5000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    coverages: [],
    specialConditions: [],
    exclusions: [],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    evidence: { insights: [], exclusions: [] },
    clauseGraph: { edges: [] },
    confidence: {
      overall: 0.9,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.95,
      coverages: 0.9,
    },
    ...overrides,
  }
}

// ========================================================================
// TRAFFIC
// ========================================================================

export const trafficGolden = basePolicy({
  policyType: 'traffic',
  policyNumber: 'TRF-2024-001',
  premium: 3500,
  coverages: [
    {
      name: 'Bodily Injury Per Person',
      nameTr: 'Kişi Başına Bedeni',
      limit: 1200000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
    {
      name: 'Bodily Injury Total',
      nameTr: 'Kaza Başına Bedeni',
      limit: 6000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
    {
      name: 'Property Damage',
      nameTr: 'Maddi Hasar',
      limit: 300000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
    {
      name: 'Death Benefit',
      nameTr: 'Vefat Teminatı',
      limit: 1200000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
  ],
  specialConditions: ['Araç ticari kullanıma uygun değildir'],
  exclusions: ['Alkollü araç kullanımı', 'Ehliyetsiz sürüş'],
})

// ========================================================================
// HOME
// ========================================================================

export const homeGolden = basePolicy({
  policyType: 'home',
  policyNumber: 'KON-2024-001',
  premium: 8000,
  coverages: [
    {
      name: 'Building Fire',
      nameTr: 'Bina Yangın',
      limit: 500000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Contents',
      nameTr: 'Eşya',
      limit: 100000,
      deductible: 500,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Theft',
      nameTr: 'Hırsızlık',
      limit: 50000,
      deductible: 1000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Water Damage',
      nameTr: 'Su Hasarı',
      limit: 30000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Glass Breakage',
      nameTr: 'Cam Kırılması',
      limit: 10000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Landlord Liability',
      nameTr: 'Ev Sahibi Sorumluluk',
      limit: 50000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
  ],
  specialConditions: [
    'Alarm sistemi aktif olmalıdır',
    'Bina 30 günden fazla boş bırakılmamalıdır',
    'Underinsurance average clause applies if declared value is below 80% of actual',
  ],
  exclusions: ['Deprem (ayrı DASK poliçesi gerektirir)', 'Kasıtlı hasar'],
})

/** Condition-heavy home example */
export const homeConditionHeavy = basePolicy({
  policyType: 'home',
  policyNumber: 'KON-2024-HEAVY',
  premium: 12000,
  coverages: [
    {
      name: 'Building',
      nameTr: 'Bina',
      limit: null,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: true,
      category: 'main',
    },
    {
      name: 'Contents',
      nameTr: 'Eşya',
      limit: 200000,
      deductible: 1000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Valuables',
      nameTr: 'Kıymetli Eşya',
      limit: 50000,
      deductible: 2000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Alarm sistemi aktif olmalıdır',
    'Çelik kapı zorunludur',
    '24 saat güvenlik mevcut olmalıdır',
    'Bina 14 günden fazla boş bırakılmamalıdır',
    'Kiracı mali sorumluluk eklenmiştir',
    'Average clause: declared value < 80% triggers proportional reduction',
  ],
  exclusions: ['Deprem', 'Terör', 'Savaş', 'Nükleer', 'Kasıtlı hasar', 'Doğal yıpranma'],
})

// ========================================================================
// HEALTH
// ========================================================================

export const healthGolden = basePolicy({
  policyType: 'health',
  policyNumber: 'SAG-2024-001',
  premium: 25000,
  coverages: [
    {
      name: 'Inpatient Treatment',
      nameTr: 'Yatarak Tedavi',
      limit: 500000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Outpatient Treatment',
      nameTr: 'Ayakta Tedavi',
      limit: 50000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Maternity',
      nameTr: 'Doğum',
      limit: 30000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Dental',
      nameTr: 'Diş',
      limit: 5000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Network: Anlaşmalı hastanelerde geçerlidir',
    'Waiting period: 30 days general, 12 months maternity',
    'Copay: %20 katılım payı uygulanır',
    'Pre-authorization required for hospitalization > 3 days',
  ],
  exclusions: ['Estetik operasyonlar', 'Mevcut hastalıklar (ilk 1 yıl)'],
})

/** Condition-heavy health */
export const healthConditionHeavy = basePolicy({
  policyType: 'health',
  policyNumber: 'SAG-2024-HEAVY',
  premium: 45000,
  coverages: [
    {
      name: 'Inpatient',
      nameTr: 'Yatarak Tedavi',
      limit: null,
      deductible: null,
      description: null,
      isUnlimited: true,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Outpatient',
      nameTr: 'Ayakta Tedavi',
      limit: 100000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Mental Health',
      nameTr: 'Psikolojik Destek',
      limit: 10000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Vision',
      nameTr: 'Göz',
      limit: 5000,
      deductible: 500,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Network: Geniş ağ - tüm anlaşmalı hastaneler',
    'Waiting: 90 gün bekleme süresi',
    'Co-pay: %10 katılım payı, yıllık max ₺10,000',
    'Pre-authorization: Tüm yatışlarda ön onay gereklidir',
    'Referral: Uzman için aile hekimi sevki gerekir',
  ],
  exclusions: ['Estetik', 'IVF (ilk 2 yıl)', 'Mevcut hastalıklar (bekleme süresi sonrası)'],
})

// ========================================================================
// LIFE
// ========================================================================

export const lifeGolden = basePolicy({
  policyType: 'life',
  policyNumber: 'HAY-2024-001',
  premium: 6000,
  coverages: [
    {
      name: 'Death Benefit',
      nameTr: 'Vefat Teminatı',
      limit: 500000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Accidental Death Rider',
      nameTr: 'Kaza Sonucu Vefat',
      limit: 1000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Critical Illness Rider',
      nameTr: 'Kritik Hastalık',
      limit: 250000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Beneficiary: Lehdar Ayşe Yılmaz (eş)',
    'Contestability: 2 yıl itiraz hakkı süresi',
    'Suicide clause: İlk 2 yıl intihar hariç',
  ],
  exclusions: ['İlk 2 yıl intihar', 'Savaş/terör kaynaklı vefat', 'Aşırı riskli spor aktiviteleri'],
})

// ========================================================================
// DASK
// ========================================================================

export const daskGolden = basePolicy({
  policyType: 'dask',
  policyNumber: 'DASK-2024-001',
  premium: 1200,
  coverages: [
    {
      name: 'Earthquake Damage',
      nameTr: 'Deprem Hasarı',
      limit: 640000,
      deductible: 12800,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Fire Following Earthquake',
      nameTr: 'Deprem Sonucu Yangın',
      limit: 640000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Tsunami Following Earthquake',
      nameTr: 'Deprem Sonucu Tsunami',
      limit: 640000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
  ],
  specialConditions: ['Yapı tarzı: Betonarme (A sınıfı)', 'Brüt alan: 120 m²', 'Deprem bölgesi: 1'],
  exclusions: ['Eşya hasarı', 'Araç hasarı', 'İş durması'],
})

// ========================================================================
// BUSINESS
// ========================================================================

export const businessGolden = basePolicy({
  policyType: 'business',
  policyNumber: 'ISY-2024-001',
  premium: 35000,
  coverages: [
    {
      name: 'Building Fire',
      nameTr: 'Bina Yangın',
      limit: 2000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Stock/Inventory',
      nameTr: 'Emtia/Stok',
      limit: 500000,
      deductible: 5000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Machinery',
      nameTr: 'Makine/Teçhizat',
      limit: 1000000,
      deductible: 10000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Business Interruption',
      nameTr: 'İş Durması',
      limit: 500000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Public Liability',
      nameTr: 'Üçüncü Şahıs Sorumluluk',
      limit: 250000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
    {
      name: 'Employer Liability',
      nameTr: 'İşveren Sorumluluk',
      limit: 500000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
  ],
  specialConditions: [
    'Alarm sistemi aktif olmalıdır',
    'Sprinkler sistemi çalışır durumda olmalıdır',
    'Business interruption indemnity period: 12 months',
    'BI waiting period: 72 hours',
  ],
  exclusions: ['Deprem (ayrı poliçe)', 'Terör', 'Siber saldırı', 'Kasıtlı hasar'],
})

/** Condition-heavy business */
export const businessConditionHeavy = basePolicy({
  policyType: 'business',
  policyNumber: 'ISY-2024-HEAVY',
  premium: 80000,
  coverages: [
    {
      name: 'Building',
      nameTr: 'Bina',
      limit: 5000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Stock',
      nameTr: 'Emtia',
      limit: 2000000,
      deductible: 25000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Machinery',
      nameTr: 'Makine',
      limit: 3000000,
      deductible: 50000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Business Interruption',
      nameTr: 'İş Durması',
      limit: 2000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
    {
      name: 'Public Liability',
      nameTr: 'Sorumluluk',
      limit: 1000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'liability',
    },
    {
      name: 'Electronic Equipment',
      nameTr: 'Elektronik Cihaz',
      limit: 500000,
      deductible: 5000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Alarm warranty: must be set nightly',
    'Sprinkler warranty: must be inspected quarterly',
    'Security guard 24h on weekends',
    'First loss basis for stock: only first ₺500,000 covered',
    'Average clause: if under-declared, proportional reduction applies',
    'Indemnity period: 18 months for BI',
    'Waiting period: 14 days for BI',
  ],
  exclusions: [
    'Deprem',
    'Terör',
    'Nükleer',
    'Savaş',
    'Kasıtlı hasar',
    'Wear and tear',
    'Gradual deterioration',
  ],
})

// ========================================================================
// NAKLIYAT
// ========================================================================

export const nakliyatGolden = basePolicy({
  policyType: 'nakliyat',
  policyNumber: 'NAK-2024-001',
  premium: 15000,
  coverages: [
    {
      name: 'ICC (A) All Risks',
      nameTr: 'Tüm Riskler',
      limit: 1000000,
      deductible: null,
      description: 'Institute Cargo Clauses (A)',
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'War and Strike Risks',
      nameTr: 'Savaş ve Grev',
      limit: 1000000,
      deductible: null,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Warehouse-to-warehouse coverage applies (depodan depoya)',
    'Transport mode: Sea (denizyolu)',
    'Packing: Standard export packaging required',
    'Route: Istanbul - Rotterdam',
  ],
  exclusions: ['Yetersiz ambalaj', 'Doğal yıpranma', 'Gecikme zararı', 'Gizli kusur'],
})

/** Condition-heavy nakliyat */
export const nakliyatConditionHeavy = basePolicy({
  policyType: 'nakliyat',
  policyNumber: 'NAK-2024-HEAVY',
  premium: 45000,
  coverages: [
    {
      name: 'ICC (C) Minimum Coverage',
      nameTr: 'Dar Teminat',
      limit: 5000000,
      deductible: 25000,
      description: 'Institute Cargo Clauses (C) - named perils only',
      isUnlimited: false,
      isMarketValue: false,
      category: 'main',
    },
    {
      name: 'Storage Risks',
      nameTr: 'Depoda Bekleme',
      limit: 1000000,
      deductible: 10000,
      description: null,
      isUnlimited: false,
      isMarketValue: false,
      category: 'supplementary',
    },
  ],
  specialConditions: [
    'Warehouse-to-warehouse EXCLUDED — transit only (depodan depoya HARİÇ)',
    'Transport mode: Multimodal (kombine)',
    'Route: Shanghai - Ankara via Mersin port',
    'Packaging: Special refrigerated containers required',
    'Storage: Max 30 days at intermediate port',
    'Incoterms: CIF Istanbul',
  ],
  exclusions: [
    'War/strike',
    'Yetersiz ambalaj',
    'Gecikme',
    'Gizli kusur',
    'Temperature deviation',
    'Insect/vermin',
    'Radioactive contamination',
  ],
})
