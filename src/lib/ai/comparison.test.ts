import { describe, it, expect } from 'vitest'
import { comparePolicies, generateComparisonReport } from './comparison'
import type { AnalyzedPolicy } from '@/types/policy'

// Helper to create mock policies
function createMockPolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: `policy-${Math.random().toString(36).slice(2, 9)}`,
    policyNumber: 'POL-001',
    type: 'home',
    typeTr: 'Konut Sigortası',
    provider: 'Test Insurance',
    logo: '',
    coverage: 100000,
    premium: 5000,
    monthlyPremium: 417,
    deductible: 1000,
    startDate: '2024-01-01',
    expiryDate: '2025-01-01',
    status: 'active',
    uploadDate: '2024-01-01',
    fileName: 'test.pdf',
    documentType: 'PDF',
    documentUrl: 'blob:test',
    coverages: [
      { name: 'Fire Protection', nameTr: 'Yangın', limit: 50000, deductible: 500, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 30000, deductible: 500, included: true },
    ],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'Home',
    aiConfidence: 0.95,
    aiInsights: ['Good coverage'],
    marketComparison: {
      averagePremium: 5500,
      averageCoverage: 110000,
      percentile: 60,
    },
    ...overrides,
  }
}

describe('Policy Comparison', () => {
  describe('comparePolicies', () => {
    it('should throw error when less than 2 policies provided', () => {
      const policy = createMockPolicy()
      expect(() => comparePolicies([policy])).toThrow('At least 2 policies required')
      expect(() => comparePolicies([])).toThrow('At least 2 policies required')
    })

    it('should compare two policies successfully', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Allianz', premium: 5000, coverage: 100000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Axa', premium: 6000, coverage: 120000 })

      const result = comparePolicies([policy1, policy2])

      expect(result.policies).toHaveLength(2)
      expect(result.summary).toBeDefined()
      expect(result.differences).toBeDefined()
      expect(result.recommendations).toBeDefined()
    })

    it('should calculate correct premium range', () => {
      const policy1 = createMockPolicy({ id: '1', premium: 3000 })
      const policy2 = createMockPolicy({ id: '2', premium: 5000 })
      const policy3 = createMockPolicy({ id: '3', premium: 4000 })

      const result = comparePolicies([policy1, policy2, policy3])

      expect(result.summary.premiumRange.min).toBe(3000)
      expect(result.summary.premiumRange.max).toBe(5000)
      expect(result.summary.premiumRange.diff).toBe(2000)
    })

    it('should identify lowest premium policy', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Expensive Co', premium: 8000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Cheap Co', premium: 3000 })

      const result = comparePolicies([policy1, policy2])

      expect(result.summary.lowestPremium.policyId).toBe('2')
      expect(result.summary.lowestPremium.value).toBe(3000)
    })

    it('should identify highest coverage policy', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Basic Co', coverage: 50000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Premium Co', coverage: 200000 })

      const result = comparePolicies([policy1, policy2])

      expect(result.summary.highestCoverage.policyId).toBe('2')
      expect(result.summary.highestCoverage.value).toBe(200000)
    })

    it('should identify lowest deductible policy', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'High Deductible', deductible: 5000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Low Deductible', deductible: 500 })

      const result = comparePolicies([policy1, policy2])

      expect(result.summary.lowestDeductible.policyId).toBe('2')
      expect(result.summary.lowestDeductible.value).toBe(500)
    })

    it('should calculate best value (coverage/premium ratio)', () => {
      const policy1 = createMockPolicy({ id: '1', coverage: 100000, premium: 5000 }) // ratio: 20
      const policy2 = createMockPolicy({ id: '2', coverage: 150000, premium: 5000 }) // ratio: 30

      const result = comparePolicies([policy1, policy2])

      expect(result.summary.bestValue.policyId).toBe('2')
      expect(result.summary.bestValue.score).toBe(30)
    })

    it('should find shared coverages', () => {
      const policy1 = createMockPolicy({
        id: '1',
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 50000, deductible: 500, included: true },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 30000, deductible: 500, included: true },
        ],
      })
      const policy2 = createMockPolicy({
        id: '2',
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 60000, deductible: 600, included: true },
          { name: 'Flood', nameTr: 'Sel', limit: 40000, deductible: 1000, included: true },
        ],
      })

      const result = comparePolicies([policy1, policy2])

      expect(result.summary.sharedCoverages).toContain('fire')
    })

    it('should find unique coverages per policy', () => {
      const policy1 = createMockPolicy({
        id: '1',
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 50000, deductible: 500, included: true },
          { name: 'Earthquake', nameTr: 'Deprem', limit: 100000, deductible: 2000, included: true },
        ],
      })
      const policy2 = createMockPolicy({
        id: '2',
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 60000, deductible: 600, included: true },
        ],
      })

      const result = comparePolicies([policy1, policy2])

      expect(result.summary.uniqueCoverages.get('1')).toContain('earthquake')
    })

    it('should find differences in key fields', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Allianz', premium: 5000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Axa', premium: 7000 })

      const result = comparePolicies([policy1, policy2])

      const providerDiff = result.differences.find((d) => d.field === 'provider')
      expect(providerDiff).toBeDefined()
      expect(providerDiff?.values).toHaveLength(2)

      const premiumDiff = result.differences.find((d) => d.field === 'premium')
      expect(premiumDiff).toBeDefined()
    })

    it('should generate recommendations for significant premium difference', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Cheap', premium: 3000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Expensive', premium: 5000 })

      const result = comparePolicies([policy1, policy2])

      // 66% difference should trigger recommendation
      const premiumRec = result.recommendations.find((r) => r.includes('Prim farkı'))
      expect(premiumRec).toBeDefined()
    })

    it('should generate best value recommendation', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Best Value', coverage: 200000, premium: 4000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Poor Value', coverage: 100000, premium: 5000 })

      const result = comparePolicies([policy1, policy2])

      const valueRec = result.recommendations.find((r) => r.includes('Değer analizi'))
      expect(valueRec).toBeDefined()
      expect(valueRec).toContain('Best Value')
    })

    it('should warn about expiring policies', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Expiring', status: 'expiring' })
      const policy2 = createMockPolicy({ id: '2', provider: 'Active', status: 'active' })

      const result = comparePolicies([policy1, policy2])

      const expiringRec = result.recommendations.find((r) => r.includes('sona eriyor'))
      expect(expiringRec).toBeDefined()
    })
  })

  describe('generateComparisonReport', () => {
    it('should generate formatted report text', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Allianz', policyNumber: 'POL-001' })
      const policy2 = createMockPolicy({ id: '2', provider: 'Axa', policyNumber: 'POL-002' })

      const comparison = comparePolicies([policy1, policy2])
      const report = generateComparisonReport(comparison)

      expect(report).toContain('POLİÇE KARŞILAŞTIRMA RAPORU')
      expect(report).toContain('Allianz')
      expect(report).toContain('Axa')
      expect(report).toContain('POL-001')
      expect(report).toContain('POL-002')
      expect(report).toContain('ÖZET')
      expect(report).toContain('Prim aralığı')
    })

    it('should include recommendations in report', () => {
      const policy1 = createMockPolicy({ id: '1', provider: 'Cheap', premium: 3000 })
      const policy2 = createMockPolicy({ id: '2', provider: 'Expensive', premium: 6000 })

      const comparison = comparePolicies([policy1, policy2])
      const report = generateComparisonReport(comparison)

      expect(report).toContain('ÖNERİLER')
    })

    it('should include report date', () => {
      const policy1 = createMockPolicy({ id: '1' })
      const policy2 = createMockPolicy({ id: '2' })

      const comparison = comparePolicies([policy1, policy2])
      const report = generateComparisonReport(comparison)

      expect(report).toContain('Rapor tarihi')
    })
  })
})
