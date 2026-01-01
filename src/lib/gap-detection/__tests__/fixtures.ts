/**
 * Test fixtures for Gap Detection Engine tests
 */

import type { AnalyzedPolicy, Coverage } from '@/types/policy'

/**
 * Create a minimal valid policy for testing
 */
export function createMockPolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'test-policy-1',
    policyNumber: 'POL-2024-001',
    provider: 'Test Insurance',
    logo: '/logos/test.png',
    type: 'home',
    typeTr: 'Konut Sigortası',
    coverage: 1000000,
    premium: 5000,
    monthlyPremium: 417,
    deductible: 1000,
    startDate: '2024-01-01',
    expiryDate: '2025-01-01',
    status: 'active',
    uploadDate: '2024-01-01',
    fileName: 'policy.pdf',
    documentType: 'policy',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'home',
    aiConfidence: 0.95,
    aiInsights: [],
    ...overrides,
  }
}

/**
 * Create a coverage object
 */
export function createCoverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    name: 'Fire',
    nameTr: 'Yangın',
    limit: 500000,
    deductible: 1000,
    included: true,
    ...overrides,
  }
}

/**
 * Home policy with full coverages (good policy)
 */
export const WELL_COVERED_HOME_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'well-covered-home',
  type: 'home',
  typeTr: 'Konut Sigortası',
  coverage: 2500000,
  premium: 6000,
  location: 'Istanbul, Turkey',
  coverages: [
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 1000 }),
    createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 50000, deductible: 1000 }),
    createCoverage({ name: 'Water Damage', nameTr: 'Su Hasarı', limit: 100000, deductible: 500 }),
    createCoverage({ name: 'Storm/Flood', nameTr: 'Fırtına/Sel', limit: 500000, deductible: 2500 }),
    createCoverage({ name: 'Glass Breakage', nameTr: 'Cam Kırılması', limit: 15000, deductible: 0 }),
    createCoverage({ name: 'Contents', nameTr: 'Eşya', limit: 100000, deductible: 1000 }),
    createCoverage({ name: 'Liability', nameTr: 'Sorumluluk', limit: 100000, deductible: 500 }),
    createCoverage({ name: 'Earthquake', nameTr: 'Deprem', limit: 500000, deductible: 5000 }),
  ],
})

/**
 * Home policy with missing critical coverages
 */
export const POORLY_COVERED_HOME_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'poorly-covered-home',
  type: 'home',
  typeTr: 'Konut Sigortası',
  coverage: 200000,
  premium: 2000,
  location: 'Ankara, Turkey',
  coverages: [
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 200000, deductible: 5000 }),
  ],
})

/**
 * Kasko policy with good coverage
 */
export const WELL_COVERED_KASKO_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'well-covered-kasko',
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 600000,
  premium: 20000,
  coverages: [
    createCoverage({ name: 'Collision Damage', nameTr: 'Çarpma/Çarpışma', limit: 500000, deductible: 2500 }),
    createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 500000, deductible: 2500 }),
    createCoverage({ name: 'Natural Disasters', nameTr: 'Doğal Afetler', limit: 500000, deductible: 2500 }),
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 500000, deductible: 2500 }),
    createCoverage({ name: 'Glass Coverage', nameTr: 'Cam Kırılması', limit: 25000, deductible: 0 }),
  ],
})

/**
 * Kasko policy with underinsured limits
 */
export const UNDERINSURED_KASKO_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'underinsured-kasko',
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 150000,
  premium: 8000,
  coverages: [
    createCoverage({ name: 'Collision Damage', nameTr: 'Çarpma/Çarpışma', limit: 150000, deductible: 5000 }),
    createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 100000, deductible: 5000 }),
  ],
})

/**
 * Expired policy for temporal gap testing
 */
export const EXPIRED_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'expired-policy',
  type: 'home',
  typeTr: 'Konut Sigortası',
  status: 'expired',
  startDate: '2023-01-01',
  expiryDate: '2024-01-01', // Expired
  coverages: [
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 500000 }),
  ],
})

/**
 * Policy expiring soon (within 7 days)
 */
export function createExpiringPolicy(daysUntilExpiry: number): AnalyzedPolicy {
  const now = new Date()
  const expiryDate = new Date(now)
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry)

  const startDate = new Date(expiryDate)
  startDate.setFullYear(startDate.getFullYear() - 1)

  return createMockPolicy({
    id: `expiring-policy-${daysUntilExpiry}`,
    type: 'home',
    typeTr: 'Konut Sigortası',
    status: 'expiring',
    startDate: startDate.toISOString().split('T')[0],
    expiryDate: expiryDate.toISOString().split('T')[0],
    coverages: [
      createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 500000 }),
    ],
  })
}

/**
 * Policy with high deductibles
 */
export const HIGH_DEDUCTIBLE_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'high-deductible-policy',
  type: 'home',
  typeTr: 'Konut Sigortası',
  deductible: 10000,
  coverages: [
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 10000 }),
    createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 50000, deductible: 5000 }),
    createCoverage({ name: 'Water Damage', nameTr: 'Su Hasarı', limit: 100000, deductible: 5000 }),
  ],
})

/**
 * Business policy with retroactive limitations
 */
export const BUSINESS_WITH_RETROACTIVE: AnalyzedPolicy = createMockPolicy({
  id: 'business-retroactive',
  type: 'business',
  typeTr: 'İşyeri Sigortası',
  coverage: 3000000,
  specialConditions: [
    'Retroaktif tarih: 01.01.2024',
    'Bu tarihten önce meydana gelen olaylar teminat dışıdır.',
  ],
  coverages: [
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 2000000, deductible: 5000 }),
    createCoverage({ name: 'Liability', nameTr: 'Sorumluluk', limit: 500000, deductible: 2500 }),
  ],
})

/**
 * Health policy for compliance testing
 */
export const HEALTH_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'health-policy',
  type: 'health',
  typeTr: 'Sağlık Sigortası',
  coverage: 1500000,
  premium: 30000,
  coverages: [
    createCoverage({ name: 'Hospitalization', nameTr: 'Yatarak Tedavi', limit: 1000000, deductible: 0 }),
    createCoverage({ name: 'Surgery', nameTr: 'Ameliyat', limit: 500000, deductible: 0 }),
    createCoverage({ name: 'Outpatient', nameTr: 'Ayakta Tedavi', limit: 50000, deductible: 500 }),
  ],
})

/**
 * Policy with partial/limited coverage
 */
export const PARTIAL_COVERAGE_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'partial-coverage',
  type: 'home',
  typeTr: 'Konut Sigortası',
  coverages: [
    createCoverage({
      name: 'Fire',
      nameTr: 'Yangın',
      limit: 100000,  // Very low limit
      deductible: 1000,
      description: 'Limited coverage - sınırlı teminat',
    }),
    createCoverage({
      name: 'Theft',
      nameTr: 'Hırsızlık',
      limit: 5000,  // Below minimum
      deductible: 1000,
      description: 'Partial coverage with restrictions',
    }),
  ],
})

/**
 * Policy with problematic exclusions
 */
export const EXCLUSION_HEAVY_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'exclusion-heavy',
  type: 'kasko',
  typeTr: 'Kasko',
  coverages: [
    createCoverage({ name: 'Collision Damage', nameTr: 'Çarpma/Çarpışma', limit: 500000 }),
  ],
  exclusions: [
    'Hırsızlık zararları',
    'Deprem hasarları',
    'Sel ve su baskını',
    'Cam kırılması',
    'Doğal afetler',
  ],
})

/**
 * Short-term policy (less than 1 year)
 */
export const SHORT_TERM_POLICY: AnalyzedPolicy = createMockPolicy({
  id: 'short-term',
  type: 'home',
  typeTr: 'Konut Sigortası',
  startDate: '2024-06-01',
  expiryDate: '2024-12-01', // Only 6 months
  coverages: [
    createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 500000 }),
  ],
})
