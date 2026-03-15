/**
 * Realistic synthetic samples for Phase 7 validation.
 *
 * Unlike the golden fixtures (branch-golden-datasets.ts) which are clean and
 * well-formed, these simulate the messiness of real LLM extraction output:
 * - Missing fields, null limits, empty names
 * - Low/mixed confidence scores
 * - Partial OCR artifacts in text
 * - Contradictory conditions
 * - Mixed Turkish/English free-text
 *
 * Categories:
 * - clean: well-formed but with minor gaps (baseline)
 * - noisy: missing fields, low confidence, partial data
 * - contradictory: conflicting limits/conditions
 * - edge: boundary/statutory edge cases
 */
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

// ---- base builder ----

function base(overrides: Partial<ExtractedPolicyData>): ExtractedPolicyData {
  return {
    policyNumber: null,
    provider: null,
    policyType: null,
    insuredName: null,
    insuredAddress: null,
    startDate: null,
    endDate: null,
    premium: null,
    currency: 'TRY',
    paymentFrequency: null,
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
      overall: 0.5,
      policyNumber: 0.5,
      provider: 0.5,
      dates: 0.5,
      premium: 0.5,
      coverages: 0.5,
    },
    ...overrides,
  }
}

// ============================================================================
// SAMPLE METADATA
// ============================================================================

export interface SampleMeta {
  id: string
  branch: string
  quality: 'clean' | 'noisy' | 'contradictory' | 'edge'
  description: string
  expectedDisplayMode: 'full' | 'restricted' | 'human_review_only'
  expectedCriticalFields: string[]
  expectedMissingItems: string[]
  expectedRisks: string[]
}

export interface RealisticSample {
  meta: SampleMeta
  data: ExtractedPolicyData
}

// ============================================================================
// KASKO
// ============================================================================

export const kaskoClean: RealisticSample = {
  meta: {
    id: 'KASKO-CLEAN-001',
    branch: 'kasko',
    quality: 'clean',
    description: 'Standard kasko policy, well-extracted',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'premium', 'provider'],
    expectedMissingItems: [],
    expectedRisks: [],
  },
  data: base({
    policyType: 'kasko',
    policyNumber: 'KAS-2024-9912',
    provider: 'Allianz Sigorta',
    insuredName: 'Ahmet Yılmaz',
    startDate: '2024-03-01',
    endDate: '2025-03-01',
    premium: 6200,
    currency: 'TRY',
    coverages: [
      {
        name: 'Collision',
        nameTr: 'Çarpışma',
        limit: 750000,
        deductible: 3000,
        isMarketValue: true,
        isUnlimited: false,
      },
      {
        name: 'Theft',
        nameTr: 'Hırsızlık',
        limit: 750000,
        deductible: 1500,
        isMarketValue: true,
        isUnlimited: false,
      },
      {
        name: 'Natural Disaster',
        nameTr: 'Doğal Afet',
        limit: 500000,
        deductible: 5000,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: ['Gece park yeri kapalı otopark olmalıdır'],
    exclusions: ['Yarış', 'Kasıtlı hasar', 'Ehliyetsiz sürüş'],
    confidence: {
      overall: 0.92,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.9,
      coverages: 0.88,
    },
  }),
}

export const kaskoNoisy: RealisticSample = {
  meta: {
    id: 'KASKO-NOISY-001',
    branch: 'kasko',
    quality: 'noisy',
    description: 'Kasko with missing provider, partial coverage names, low confidence',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['provider'],
    expectedRisks: [],
  },
  data: base({
    policyType: 'kasko',
    policyNumber: 'KAS-??-3341',
    provider: null,
    insuredName: 'M. Y.',
    startDate: '2024-01-01',
    endDate: null,
    premium: null,
    coverages: [
      {
        name: 'Çarpışma',
        nameTr: null,
        limit: null,
        deductible: null,
        isMarketValue: true,
        isUnlimited: false,
      },
      {
        name: '',
        nameTr: 'Hırsızlık',
        limit: 500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    confidence: {
      overall: 0.45,
      policyNumber: 0.3,
      provider: 0.1,
      dates: 0.4,
      premium: 0.2,
      coverages: 0.5,
    },
  }),
}

// ============================================================================
// TRAFFIC
// ============================================================================

export const trafficClean: RealisticSample = {
  meta: {
    id: 'TRF-CLEAN-001',
    branch: 'traffic',
    quality: 'clean',
    description: 'Standard traffic (mandatory liability) policy with statutory limits',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'premium'],
    expectedMissingItems: [],
    expectedRisks: ['statutory_only'],
  },
  data: base({
    policyType: 'traffic',
    policyNumber: 'TRF-2024-7821',
    provider: 'AXA Sigorta',
    insuredName: 'Elif Kaya',
    startDate: '2024-06-01',
    endDate: '2025-06-01',
    premium: 2800,
    coverages: [
      {
        name: 'Bodily Injury Per Person',
        nameTr: 'Kişi Başına Bedeni',
        limit: 1200000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'liability',
      },
      {
        name: 'Bodily Injury Total',
        nameTr: 'Kaza Başına Bedeni',
        limit: 6000000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'liability',
      },
      {
        name: 'Property Damage',
        nameTr: 'Maddi Hasar',
        limit: 300000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'liability',
      },
    ],
    specialConditions: ['Ticari kullanıma uygun değildir'],
    exclusions: ['Alkollü sürüş', 'Ehliyetsiz sürüş'],
    confidence: {
      overall: 0.94,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.95,
      premium: 0.9,
      coverages: 0.92,
    },
  }),
}

export const trafficNoisy: RealisticSample = {
  meta: {
    id: 'TRF-NOISY-001',
    branch: 'traffic',
    quality: 'noisy',
    description: 'Traffic with OCR artifacts in text, missing some limits',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['some_coverage_limits'],
    expectedRisks: ['statutory_only'],
  },
  data: base({
    policyType: 'traffic',
    policyNumber: 'TRF-2O24-331I', // OCR confusion: O/0, I/1
    provider: 'Axa Slgorta', // OCR typo
    insuredName: null,
    startDate: '2024-01-01',
    endDate: '2025-O1-O1', // OCR confusion
    premium: 1800,
    coverages: [
      {
        name: 'Bedeni Zarar',
        nameTr: 'Bedeni Zarar',
        limit: 1200000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Maddi Hasar',
        nameTr: 'Maddi Hasar',
        limit: null,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: ['Ticari araç de ğildir'], // OCR spacing artifact
    confidence: {
      overall: 0.52,
      policyNumber: 0.3,
      provider: 0.4,
      dates: 0.4,
      premium: 0.7,
      coverages: 0.55,
    },
  }),
}

export const trafficEdge: RealisticSample = {
  meta: {
    id: 'TRF-EDGE-001',
    branch: 'traffic',
    quality: 'edge',
    description: 'Traffic with only statutory minimum, no enhanced liability — should trigger risk',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: [],
    expectedRisks: ['statutory_only_exposure'],
  },
  data: base({
    policyType: 'traffic',
    policyNumber: 'TRF-2024-MIN',
    provider: 'Güneş Sigorta',
    insuredName: 'Hasan Demir',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 1500,
    coverages: [
      {
        name: 'Bodily',
        nameTr: 'Bedeni',
        limit: 500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'liability',
      },
      {
        name: 'Property',
        nameTr: 'Maddi',
        limit: 100000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'liability',
      },
    ],
    specialConditions: [],
    confidence: {
      overall: 0.88,
      policyNumber: 0.9,
      provider: 0.9,
      dates: 0.9,
      premium: 0.85,
      coverages: 0.85,
    },
  }),
}

// ============================================================================
// HOME
// ============================================================================

export const homeClean: RealisticSample = {
  meta: {
    id: 'HOME-CLEAN-001',
    branch: 'home',
    quality: 'clean',
    description: 'Home policy with clear building/contents split',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'building_contents'],
    expectedMissingItems: [],
    expectedRisks: [],
  },
  data: base({
    policyType: 'home',
    policyNumber: 'KON-2024-4456',
    provider: 'Anadolu Sigorta',
    insuredName: 'Mehmet Özturk',
    startDate: '2024-04-01',
    endDate: '2025-04-01',
    premium: 6500,
    coverages: [
      {
        name: 'Building Fire',
        nameTr: 'Bina Yangın',
        limit: 800000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
      {
        name: 'Contents',
        nameTr: 'Eşya',
        limit: 150000,
        deductible: 1000,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
      {
        name: 'Theft',
        nameTr: 'Hırsızlık',
        limit: 50000,
        deductible: 2000,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Water Damage',
        nameTr: 'Su Hasarı',
        limit: 40000,
        deductible: 500,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: ['Alarm sistemi aktif olmalıdır', 'Bina 30 günden fazla boş olmamalıdır'],
    exclusions: ['Deprem (DASK gerekir)', 'Kasıtlı hasar'],
    confidence: {
      overall: 0.91,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.9,
      coverages: 0.88,
    },
  }),
}

export const homeNoisy: RealisticSample = {
  meta: {
    id: 'HOME-NOISY-001',
    branch: 'home',
    quality: 'noisy',
    description: 'Home with no building/contents separation, missing deductibles, low conf',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['building_contents_separation'],
    expectedRisks: ['underinsurance'],
  },
  data: base({
    policyType: 'home',
    policyNumber: null,
    provider: 'Sigorta A.Ş.',
    insuredName: 'M. Ö.',
    startDate: null,
    endDate: null,
    premium: 4000,
    coverages: [
      {
        name: 'Yangın',
        nameTr: null,
        limit: 300000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Hırsızlık',
        nameTr: null,
        limit: null,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [],
    confidence: {
      overall: 0.42,
      policyNumber: 0.1,
      provider: 0.3,
      dates: 0.2,
      premium: 0.6,
      coverages: 0.45,
    },
  }),
}

export const homeContradictory: RealisticSample = {
  meta: {
    id: 'HOME-CONTRA-001',
    branch: 'home',
    quality: 'contradictory',
    description:
      'Home with contradictory deductible amounts and average clause + no average clause',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: [],
    expectedRisks: ['contradictory_deductible', 'average_clause_ambiguity'],
  },
  data: base({
    policyType: 'home',
    policyNumber: 'KON-2024-CONF',
    provider: 'Mapfre Sigorta',
    insuredName: 'Ayşe Yıldız',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 9000,
    coverages: [
      {
        name: 'Building',
        nameTr: 'Bina',
        limit: 500000,
        deductible: 2500,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Contents',
        nameTr: 'Eşya',
        limit: 200000,
        deductible: 5000,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [
      'Average clause applies: declared < 80% triggers proportional reduction',
      'Muafiyet: ₺2.500 genel, ₺5.000 hırsızlık',
      'Muafiyet: ₺1.000 genel muafiyet uygulanır', // contradicts above
    ],
    exclusions: ['Average clause does NOT apply'], // contradicts condition
    confidence: {
      overall: 0.65,
      policyNumber: 0.8,
      provider: 0.85,
      dates: 0.7,
      premium: 0.75,
      coverages: 0.6,
    },
  }),
}

// ============================================================================
// HEALTH
// ============================================================================

export const healthClean: RealisticSample = {
  meta: {
    id: 'HEALTH-CLEAN-001',
    branch: 'health',
    quality: 'clean',
    description: 'Health with clear inpatient/outpatient split and network info',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'network', 'copay'],
    expectedMissingItems: [],
    expectedRisks: [],
  },
  data: base({
    policyType: 'health',
    policyNumber: 'SAG-2024-7788',
    provider: 'Acibadem Sigorta',
    insuredName: 'Zeynep Arslan',
    startDate: '2024-02-01',
    endDate: '2025-02-01',
    premium: 22000,
    coverages: [
      {
        name: 'Inpatient Treatment',
        nameTr: 'Yatarak Tedavi',
        limit: 500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
      {
        name: 'Outpatient Treatment',
        nameTr: 'Ayakta Tedavi',
        limit: 50000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Maternity',
        nameTr: 'Doğum',
        limit: 30000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Dental',
        nameTr: 'Diş',
        limit: 5000,
        deductible: 200,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [
      'Network: Anlaşmalı hastanelerde %100 karşılanır',
      '30 gün bekleme süresi',
      '%20 katılım payı ayakta tedavide uygulanır',
    ],
    exclusions: ['Estetik cerrahi', 'Mevcut hastalıklar (12 ay)'],
    confidence: {
      overall: 0.9,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.88,
      coverages: 0.87,
    },
  }),
}

export const healthNoisy: RealisticSample = {
  meta: {
    id: 'HEALTH-NOISY-001',
    branch: 'health',
    quality: 'noisy',
    description: 'Health with no network info, missing limits on multiple coverages',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['network_info', 'waiting_period'],
    expectedRisks: ['out_of_network'],
  },
  data: base({
    policyType: 'health',
    policyNumber: 'SAG-2024-???',
    provider: 'Sigorta Şirketi',
    insuredName: null,
    startDate: '2024-01-01',
    endDate: null,
    premium: null,
    coverages: [
      {
        name: 'Yatarak',
        nameTr: null,
        limit: null,
        deductible: null,
        isMarketValue: false,
        isUnlimited: true,
      },
      {
        name: 'Ayakta',
        nameTr: null,
        limit: 30000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: ['Ön onay gereklidir'],
    confidence: {
      overall: 0.4,
      policyNumber: 0.2,
      provider: 0.3,
      dates: 0.4,
      premium: 0.1,
      coverages: 0.45,
    },
  }),
}

export const healthContradictory: RealisticSample = {
  meta: {
    id: 'HEALTH-CONTRA-001',
    branch: 'health',
    quality: 'contradictory',
    description: 'Health with contradictory copay (20% vs 0%) and conflicting waiting periods',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: [],
    expectedRisks: ['contradictory_copay'],
  },
  data: base({
    policyType: 'health',
    policyNumber: 'SAG-2024-CONF',
    provider: 'Mapfre Sigorta',
    insuredName: 'Ali Çelik',
    startDate: '2024-05-01',
    endDate: '2025-05-01',
    premium: 35000,
    coverages: [
      {
        name: 'Inpatient',
        nameTr: 'Yatarak Tedavi',
        limit: 1000000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Outpatient',
        nameTr: 'Ayakta Tedavi',
        limit: 75000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [
      'Copay: %20 katılım payı uygulanır',
      'Katılım payı yoktur — %0 copay', // contradicts above
      'Bekleme süresi: 30 gün',
      'Waiting period: none for inpatient', // contradicts above
      'Network: Anlaşmalı kuruluşlar',
    ],
    confidence: {
      overall: 0.58,
      policyNumber: 0.7,
      provider: 0.8,
      dates: 0.7,
      premium: 0.65,
      coverages: 0.5,
    },
  }),
}

// ============================================================================
// LIFE
// ============================================================================

export const lifeClean: RealisticSample = {
  meta: {
    id: 'LIFE-CLEAN-001',
    branch: 'life',
    quality: 'clean',
    description: 'Life policy with death benefit, rider, and beneficiary confirmed',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'beneficiary'],
    expectedMissingItems: [],
    expectedRisks: ['contestability'],
  },
  data: base({
    policyType: 'life',
    policyNumber: 'HAY-2024-5566',
    provider: 'MetLife',
    insuredName: 'Osman Kara',
    startDate: '2024-01-15',
    endDate: '2044-01-15',
    premium: 4800,
    coverages: [
      {
        name: 'Death Benefit',
        nameTr: 'Vefat Teminatı',
        limit: 500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
      {
        name: 'Accidental Death Rider',
        nameTr: 'Kaza Vefat',
        limit: 1000000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'supplementary',
      },
    ],
    specialConditions: [
      'Beneficiary: Lehdar Fatma Kara (eş)',
      'Contestability: 2 yıl itiraz süresi',
      'Suicide clause: İlk 2 yıl intihar teminat dışı',
    ],
    exclusions: ['İlk 2 yıl intihar', 'Savaş/terör'],
    confidence: {
      overall: 0.93,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.9,
      coverages: 0.9,
    },
  }),
}

export const lifeNoisy: RealisticSample = {
  meta: {
    id: 'LIFE-NOISY-001',
    branch: 'life',
    quality: 'noisy',
    description: 'Life with missing beneficiary, partial coverage data',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['beneficiary'],
    expectedRisks: ['contestability', 'beneficiary_unknown'],
  },
  data: base({
    policyType: 'life',
    policyNumber: 'HAY-???',
    provider: null,
    insuredName: 'O. K.',
    startDate: null,
    endDate: null,
    premium: null,
    coverages: [
      {
        name: 'Vefat',
        nameTr: null,
        limit: 300000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [],
    confidence: {
      overall: 0.38,
      policyNumber: 0.2,
      provider: 0.1,
      dates: 0.2,
      premium: 0.1,
      coverages: 0.55,
    },
  }),
}

export const lifeEdge: RealisticSample = {
  meta: {
    id: 'LIFE-EDGE-001',
    branch: 'life',
    quality: 'edge',
    description: 'Life with no beneficiary at all — must trigger missing card and risk',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['beneficiary'],
    expectedRisks: ['beneficiary_unknown'],
  },
  data: base({
    policyType: 'life',
    policyNumber: 'HAY-2024-NOBEN',
    provider: 'Anadolu Hayat',
    insuredName: 'Mustafa Aydın',
    startDate: '2024-06-01',
    endDate: '2054-06-01',
    premium: 3600,
    coverages: [
      {
        name: 'Death Benefit',
        nameTr: 'Vefat Teminatı',
        limit: 250000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
    ],
    specialConditions: ['Contestability: 2 yıl'],
    exclusions: ['İntihar (2 yıl)', 'Savaş'],
    confidence: {
      overall: 0.85,
      policyNumber: 0.9,
      provider: 0.9,
      dates: 0.85,
      premium: 0.85,
      coverages: 0.8,
    },
  }),
}

// ============================================================================
// DASK
// ============================================================================

export const daskClean: RealisticSample = {
  meta: {
    id: 'DASK-CLEAN-001',
    branch: 'dask',
    quality: 'clean',
    description: 'Standard DASK with building class and area info',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'building_class'],
    expectedMissingItems: [],
    expectedRisks: ['statutory_cap'],
  },
  data: base({
    policyType: 'dask',
    policyNumber: 'DASK-2024-88990',
    provider: 'DASK',
    insuredName: 'Fatma Şahin',
    startDate: '2024-05-01',
    endDate: '2025-05-01',
    premium: 980,
    coverages: [
      {
        name: 'Earthquake Damage',
        nameTr: 'Deprem Hasarı',
        limit: 640000,
        deductible: 12800,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
    ],
    specialConditions: ['Yapı tarzı: Betonarme', 'Brüt alan: 100 m²', 'Deprem bölgesi: 1'],
    exclusions: ['Eşya', 'Araç', 'İş durması'],
    confidence: {
      overall: 0.95,
      policyNumber: 0.98,
      provider: 0.99,
      dates: 0.95,
      premium: 0.95,
      coverages: 0.92,
    },
  }),
}

export const daskNoisy: RealisticSample = {
  meta: {
    id: 'DASK-NOISY-001',
    branch: 'dask',
    quality: 'noisy',
    description: 'DASK with missing building class, OCR limit garbled',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['building_class'],
    expectedRisks: ['statutory_cap'],
  },
  data: base({
    policyType: 'dask',
    policyNumber: null,
    provider: 'DASK',
    insuredName: null,
    startDate: '2024-01-01',
    endDate: null,
    premium: null,
    coverages: [
      {
        name: 'Deprem',
        nameTr: null,
        limit: 640000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [],
    confidence: {
      overall: 0.48,
      policyNumber: 0.1,
      provider: 0.9,
      dates: 0.3,
      premium: 0.1,
      coverages: 0.6,
    },
  }),
}

export const daskEdge: RealisticSample = {
  meta: {
    id: 'DASK-EDGE-001',
    branch: 'dask',
    quality: 'edge',
    description: 'DASK at maximum statutory cap with high-value building',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'statutory_cap'],
    expectedMissingItems: [],
    expectedRisks: ['statutory_cap_ceiling'],
  },
  data: base({
    policyType: 'dask',
    policyNumber: 'DASK-2024-MAX',
    provider: 'DASK',
    insuredName: 'Cemal Usta',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 2400,
    coverages: [
      {
        name: 'Earthquake Damage',
        nameTr: 'Deprem Hasarı',
        limit: 640000,
        deductible: 12800,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
      {
        name: 'Fire Following EQ',
        nameTr: 'Deprem Sonucu Yangın',
        limit: 640000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
    ],
    specialConditions: [
      'Yapı tarzı: Çelik (A sınıfı)',
      'Brüt alan: 250 m²',
      'Bina değeri: ₺3.500.000 — DASK cap ₺640.000 çok altında',
    ],
    exclusions: ['Eşya', 'Araç'],
    confidence: {
      overall: 0.9,
      policyNumber: 0.95,
      provider: 0.99,
      dates: 0.9,
      premium: 0.9,
      coverages: 0.88,
    },
  }),
}

// ============================================================================
// BUSINESS
// ============================================================================

export const businessClean: RealisticSample = {
  meta: {
    id: 'BIZ-CLEAN-001',
    branch: 'business',
    quality: 'clean',
    description: 'Business policy with property/stock/BI/liability separation',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'bi_period'],
    expectedMissingItems: [],
    expectedRisks: ['bi_waiting'],
  },
  data: base({
    policyType: 'business',
    policyNumber: 'ISY-2024-6677',
    provider: 'HDI Sigorta',
    insuredName: 'ABC Sanayi A.Ş.',
    startDate: '2024-03-01',
    endDate: '2025-03-01',
    premium: 45000,
    coverages: [
      {
        name: 'Building Fire',
        nameTr: 'Bina Yangın',
        limit: 3000000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
      {
        name: 'Stock/Inventory',
        nameTr: 'Emtia',
        limit: 800000,
        deductible: 10000,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Machinery',
        nameTr: 'Makine',
        limit: 1500000,
        deductible: 25000,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Business Interruption',
        nameTr: 'İş Durması',
        limit: 600000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Public Liability',
        nameTr: 'Sorumluluk',
        limit: 500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
        category: 'liability',
      },
    ],
    specialConditions: [
      'Alarm sistemi aktif',
      'Sprinkler çalışır durumda',
      'BI indemnity period: 12 months',
      'BI waiting period: 72 hours',
    ],
    exclusions: ['Deprem', 'Terör', 'Siber saldırı'],
    confidence: {
      overall: 0.89,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.9,
      premium: 0.85,
      coverages: 0.86,
    },
  }),
}

export const businessNoisy: RealisticSample = {
  meta: {
    id: 'BIZ-NOISY-001',
    branch: 'business',
    quality: 'noisy',
    description: 'Business with mixed-up coverage names, missing BI period',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['bi_indemnity_period'],
    expectedRisks: ['warranty_breach'],
  },
  data: base({
    policyType: 'business',
    policyNumber: null,
    provider: 'Sigorta A.Ş.',
    insuredName: 'XYZ Ltd.',
    startDate: null,
    endDate: null,
    premium: 20000,
    coverages: [
      {
        name: 'Yangın',
        nameTr: null,
        limit: 1000000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Emtia',
        nameTr: null,
        limit: null,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Business Interruption',
        nameTr: null,
        limit: 200000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: ['Alarm zorunlu'],
    confidence: {
      overall: 0.44,
      policyNumber: 0.1,
      provider: 0.3,
      dates: 0.2,
      premium: 0.5,
      coverages: 0.5,
    },
  }),
}

export const businessContradictory: RealisticSample = {
  meta: {
    id: 'BIZ-CONTRA-001',
    branch: 'business',
    quality: 'contradictory',
    description: 'Business with contradictory BI periods and warranty conditions',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: [],
    expectedRisks: ['contradictory_bi', 'warranty_breach'],
  },
  data: base({
    policyType: 'business',
    policyNumber: 'ISY-2024-CONF',
    provider: 'Zurich Sigorta',
    insuredName: 'DEF Holding',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 75000,
    coverages: [
      {
        name: 'Building',
        nameTr: 'Bina',
        limit: 5000000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Stock',
        nameTr: 'Emtia',
        limit: 2000000,
        deductible: 50000,
        isMarketValue: false,
        isUnlimited: false,
      },
      {
        name: 'Business Interruption',
        nameTr: 'İş Durması',
        limit: 1500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [
      'BI indemnity period: 6 months',
      'BI indemnity period: 18 months', // contradicts above
      'Alarm warranty: must be active 24/7',
      'Alarm not required for ground floor', // contradicts above
      'Average clause applies',
    ],
    confidence: {
      overall: 0.55,
      policyNumber: 0.7,
      provider: 0.8,
      dates: 0.7,
      premium: 0.6,
      coverages: 0.5,
    },
  }),
}

// ============================================================================
// NAKLIYAT
// ============================================================================

export const nakliyatClean: RealisticSample = {
  meta: {
    id: 'NAK-CLEAN-001',
    branch: 'nakliyat',
    quality: 'clean',
    description: 'Nakliyat with ICC (A), W2W, packaging info',
    expectedDisplayMode: 'full',
    expectedCriticalFields: ['coverages', 'icc_basis', 'w2w'],
    expectedMissingItems: [],
    expectedRisks: [],
  },
  data: base({
    policyType: 'nakliyat',
    policyNumber: 'NAK-2024-3344',
    provider: 'Türk P&I',
    insuredName: 'GHI Logistics',
    startDate: '2024-07-01',
    endDate: '2025-07-01',
    premium: 18000,
    coverages: [
      {
        name: 'ICC (A) All Risks',
        nameTr: 'Tüm Riskler',
        limit: 2000000,
        deductible: 5000,
        description: 'Institute Cargo Clauses (A)',
        isMarketValue: false,
        isUnlimited: false,
        category: 'main',
      },
    ],
    specialConditions: [
      'Warehouse-to-warehouse coverage applies',
      'Packaging: Standard export packaging required',
      'Route: Istanbul - Hamburg',
      'Transport: Sea',
      'Incoterms: CIF Hamburg',
    ],
    exclusions: ['Inadequate packaging', 'Delay', 'Inherent vice'],
    confidence: {
      overall: 0.91,
      policyNumber: 0.95,
      provider: 0.9,
      dates: 0.9,
      premium: 0.85,
      coverages: 0.88,
    },
  }),
}

export const nakliyatNoisy: RealisticSample = {
  meta: {
    id: 'NAK-NOISY-001',
    branch: 'nakliyat',
    quality: 'noisy',
    description: 'Nakliyat with no ICC identified, missing W2W info',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: ['icc_basis', 'packaging_requirement'],
    expectedRisks: ['icc_unknown'],
  },
  data: base({
    policyType: 'nakliyat',
    policyNumber: null,
    provider: 'Sigorta',
    insuredName: null,
    startDate: null,
    endDate: null,
    premium: null,
    coverages: [
      {
        name: 'Cargo Coverage',
        nameTr: null,
        limit: 500000,
        deductible: null,
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: ['Route: unspecified'],
    confidence: {
      overall: 0.35,
      policyNumber: 0.1,
      provider: 0.2,
      dates: 0.1,
      premium: 0.1,
      coverages: 0.4,
    },
  }),
}

export const nakliyatContradictory: RealisticSample = {
  meta: {
    id: 'NAK-CONTRA-001',
    branch: 'nakliyat',
    quality: 'contradictory',
    description: 'Nakliyat with ICC (A) in name but (C) in description, conflicting W2W',
    expectedDisplayMode: 'restricted',
    expectedCriticalFields: ['coverages'],
    expectedMissingItems: [],
    expectedRisks: ['icc_conflict'],
  },
  data: base({
    policyType: 'nakliyat',
    policyNumber: 'NAK-2024-CONF',
    provider: 'HDI Sigorta',
    insuredName: 'JKL Trading',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 30000,
    coverages: [
      {
        name: 'ICC (A) All Risks',
        nameTr: 'Tüm Riskler',
        limit: 3000000,
        deductible: 10000,
        description: 'Institute Cargo Clauses (C) — named perils',
        isMarketValue: false,
        isUnlimited: false,
      },
    ],
    specialConditions: [
      'Warehouse-to-warehouse included',
      'W2W EXCLUDED — transit only', // contradicts above
      'Packaging: refrigerated containers required',
      'CIF Istanbul',
    ],
    confidence: {
      overall: 0.5,
      policyNumber: 0.7,
      provider: 0.8,
      dates: 0.6,
      premium: 0.5,
      coverages: 0.4,
    },
  }),
}

// ============================================================================
// ALL SAMPLES EXPORT
// ============================================================================

export const allRealisticSamples: RealisticSample[] = [
  kaskoClean,
  kaskoNoisy,
  trafficClean,
  trafficNoisy,
  trafficEdge,
  homeClean,
  homeNoisy,
  homeContradictory,
  healthClean,
  healthNoisy,
  healthContradictory,
  lifeClean,
  lifeNoisy,
  lifeEdge,
  daskClean,
  daskNoisy,
  daskEdge,
  businessClean,
  businessNoisy,
  businessContradictory,
  nakliyatClean,
  nakliyatNoisy,
  nakliyatContradictory,
]
