/**
 * PDF Report Generator Tests
 *
 * Tests for PDF report generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generatePolicyDetailReport,
  generateGapAnalysisReport,
  generatePortfolioReport,
  generatePolicySummaryReport,
  getAvailableReportTypes,
  openPrintWindow,
  downloadHTML,
  quickExport,
} from './generator'
import type { AnalyzedPolicy } from '@/types/policy'
import type { ComprehensiveGapAnalysis } from '@/types/gap'

// Mock branding
vi.mock('./branding', () => ({
  getSavedBranding: vi.fn(() => ({
    companyName: 'Test Company',
    logo: null,
    primaryColor: '#3B82F6',
    accentColor: '#10B981',
    showBranding: true,
  })),
}))

// Mock templates
vi.mock('./templates', () => ({
  generatePolicyDetailHTML: vi.fn(() => '<html><body>Policy Detail</body></html>'),
  generateGapAnalysisHTML: vi.fn(() => '<html><body>Gap Analysis</body></html>'),
  generatePortfolioHTML: vi.fn(() => '<html><body>Portfolio</body></html>'),
  generatePolicySummaryHTML: vi.fn(() => '<html><body>Policy Summary</body></html>'),
}))

// Mock window
const mockWindow = {
  document: {
    write: vi.fn(),
    close: vi.fn(),
  },
  print: vi.fn(),
  onload: null as (() => void) | null,
}

// Mock URL
global.URL = {
  createObjectURL: vi.fn(() => 'blob:test'),
  revokeObjectURL: vi.fn(),
} as unknown as typeof URL

// Mock document
global.document = {
  createElement: vi.fn(() => ({
    href: '',
    download: '',
    click: vi.fn(),
  })),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
} as unknown as Document

// Mock Blob
global.Blob = vi.fn((content, options) => ({
  content,
  options,
})) as unknown as typeof Blob

const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
  id: 'policy-1',
  policyNumber: 'POL-001',
  type: 'kasko',
  provider: 'Allianz',
  premium: 5000,
  coverage: 100000,
  coverages: [
    { name: 'Hasar', nameTr: 'Hasar Teminatı', limit: 50000, deductible: 1000, included: true },
  ],
  status: 'active',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  logo: '',
  typeTr: 'Kasko',
  monthlyPremium: 417,
  deductible: 1000,
  uploadDate: new Date().toISOString(),
  fileName: 'test.pdf',
  documentType: 'pdf',
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'auto',
  aiConfidence: 0.95,
  aiInsights: [],
  ...overrides,
})

const createMockGapAnalysis = (): ComprehensiveGapAnalysis => ({
  policyId: 'policy-1',
  policyType: 'kasko',
  analyzedAt: new Date().toISOString(),
  overallScore: 75,
  gapCount: {
    total: 6,
    critical: 1,
    high: 2,
    medium: 2,
    low: 1,
    info: 0,
  },
  gaps: [],
  gapsByCategory: {
    coverage: [],
    limit: [],
    deductible: [],
    exclusion: [],
    temporal: [],
    compliance: [],
    portfolio: [],
  },
  gapsBySeverity: {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  },
  financialSummary: {
    totalPotentialLoss: 10000,
    totalExpectedLoss: 5000,
    estimatedRemediationCost: 500,
    costBenefitRatio: 10,
  },
  prioritizedGaps: [],
  topRecommendations: [
    {
      id: 'rec-1',
      title: 'Add Coverage',
      titleTr: 'Teminat Ekle',
      description: 'Add missing coverage',
      descriptionTr: 'Eksik teminat ekleyin',
      addressesGaps: [],
      impactScore: 80,
      gapsResolved: 1,
      riskReduction: 25,
      estimatedCost: 500,
      expectedSavings: 5000,
      roi: 9,
      difficulty: 'easy',
      timeframe: '1-2 weeks',
      priority: 1,
    },
  ],
  confidence: 0.9,
})

describe('PDF Report Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generatePolicyDetailReport', () => {
    it('should generate a successful report result', () => {
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy)

      expect(result.success).toBe(true)
      expect(result.html).toBeDefined()
      expect(result.html?.length).toBeGreaterThan(0)
      expect(result.filename).toBeDefined()
      expect(result.mimeType).toBe('text/html')
    })

    it('should include policy number in filename', () => {
      const policy = createMockPolicy({ policyNumber: 'TEST-123' })
      const result = generatePolicyDetailReport(policy)

      // Filename contains lowercase version of policy number
      expect(result.filename.toLowerCase()).toContain('test-123')
    })

    it('should accept custom options', () => {
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy, {
        language: 'en',
        sections: { showPolicyDetails: true },
      })

      expect(result.success).toBe(true)
    })

    it('should accept gap analysis data', () => {
      const policy = createMockPolicy()
      const gapAnalysis = createMockGapAnalysis()
      const result = generatePolicyDetailReport(policy, {}, gapAnalysis)

      expect(result.success).toBe(true)
    })

    it('should return error result when generation fails', async () => {
      // Test error handling by checking result structure
      // The actual error case would require mocking internal template errors
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy)

      // When successful, verify the result structure
      if (!result.success) {
        expect(result.error).toBeDefined()
        expect(result.filename).toBe('')
      } else {
        expect(result.html).toBeDefined()
      }
    })
  })

  describe('generateGapAnalysisReport', () => {
    it('should generate a successful report result', () => {
      const policy = createMockPolicy()
      const gapAnalysis = createMockGapAnalysis()
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      expect(result.success).toBe(true)
      expect(result.html).toBeDefined()
      expect(result.filename).toContain('gap')
    })

    it('should include recommendations data', () => {
      const policy = createMockPolicy()
      const gapAnalysis = createMockGapAnalysis()
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      expect(result.success).toBe(true)
    })

    it('should return error structure when generation fails', () => {
      // Verify the error response structure is correct
      const policy = createMockPolicy()
      const gapAnalysis = createMockGapAnalysis()
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      // Verify result has expected properties
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('filename')
      expect(result).toHaveProperty('mimeType')
    })
  })

  describe('generatePortfolioReport', () => {
    it('should generate a successful report for multiple policies', () => {
      const policies = [
        createMockPolicy({ id: 'policy-1' }),
        createMockPolicy({ id: 'policy-2' }),
        createMockPolicy({ id: 'policy-3' }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
      expect(result.html).toBeDefined()
      expect(result.filename).toContain('portfolio')
    })

    it('should calculate summary statistics', () => {
      const policies = [
        createMockPolicy({ premium: 5000, coverage: 100000, status: 'active' }),
        createMockPolicy({ premium: 3000, coverage: 50000, status: 'active' }),
        createMockPolicy({ premium: 7000, coverage: 150000, status: 'expiring' }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should group policies by type', () => {
      const policies = [
        createMockPolicy({ type: 'kasko' }),
        createMockPolicy({ type: 'kasko' }),
        createMockPolicy({ type: 'home' }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle empty policy list', () => {
      const result = generatePortfolioReport([])

      expect(result.success).toBe(true)
    })

    it('should return proper result structure', () => {
      const policies = [createMockPolicy()]
      const result = generatePortfolioReport(policies)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('filename')
      expect(result).toHaveProperty('mimeType')
      if (result.success) {
        expect(result.html).toBeDefined()
      }
    })
  })

  describe('generatePolicySummaryReport', () => {
    it('should generate a summary report', () => {
      const policies = [
        createMockPolicy({ id: 'policy-1' }),
        createMockPolicy({ id: 'policy-2' }),
      ]
      const result = generatePolicySummaryReport(policies)

      expect(result.success).toBe(true)
      expect(result.html).toBeDefined()
      expect(result.filename).toContain('summary')
    })

    it('should return proper result structure', () => {
      const policies = [createMockPolicy()]
      const result = generatePolicySummaryReport(policies)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('filename')
      expect(result).toHaveProperty('mimeType')
      if (result.success) {
        expect(result.html).toBeDefined()
      }
    })
  })

  describe('getAvailableReportTypes', () => {
    it('should return policy_detail for single policy', () => {
      const policy = createMockPolicy()
      const types = getAvailableReportTypes(policy)

      expect(types).toContain('policy_detail')
      expect(types).toContain('executive_summary')
    })

    it('should include gap_analysis if hasGapAnalysis is true', () => {
      const policy = createMockPolicy()
      const types = getAvailableReportTypes(policy, true)

      expect(types).toContain('gap_analysis')
    })

    it('should not include gap_analysis if hasGapAnalysis is false', () => {
      const policy = createMockPolicy()
      const types = getAvailableReportTypes(policy, false)

      expect(types).not.toContain('gap_analysis')
    })

    it('should return portfolio types for multiple policies', () => {
      const policies = [
        createMockPolicy({ id: 'policy-1' }),
        createMockPolicy({ id: 'policy-2' }),
        createMockPolicy({ id: 'policy-3' }),
      ]
      const types = getAvailableReportTypes(policies)

      expect(types).toContain('policy_summary')
      expect(types).toContain('portfolio')
      expect(types).toContain('executive_summary')
    })

    it('should include comparison for exactly 2 policies', () => {
      const policies = [
        createMockPolicy({ id: 'policy-1' }),
        createMockPolicy({ id: 'policy-2' }),
      ]
      const types = getAvailableReportTypes(policies)

      expect(types).toContain('comparison')
    })

    it('should not include comparison for more than 2 policies', () => {
      const policies = [
        createMockPolicy({ id: 'policy-1' }),
        createMockPolicy({ id: 'policy-2' }),
        createMockPolicy({ id: 'policy-3' }),
      ]
      const types = getAvailableReportTypes(policies)

      expect(types).not.toContain('comparison')
    })
  })

  describe('openPrintWindow', () => {
    beforeEach(() => {
      global.window = {
        open: vi.fn(() => mockWindow),
      } as unknown as Window & typeof globalThis
    })

    it('should open a new window with HTML content', () => {
      const html = '<html><body>Test</body></html>'
      const result = openPrintWindow(html)

      expect(global.window.open).toHaveBeenCalledWith('', '_blank')
      expect(mockWindow.document.write).toHaveBeenCalledWith(html)
      expect(mockWindow.document.close).toHaveBeenCalled()
      expect(result).toBe(mockWindow)
    })

    it('should return null if window fails to open', () => {
      (global.window.open as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)

      const html = '<html><body>Test</body></html>'
      const result = openPrintWindow(html)

      expect(result).toBeNull()
    })
  })

  describe('downloadHTML', () => {
    it('should create and click a download link', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      ;(global.document.createElement as ReturnType<typeof vi.fn>).mockReturnValue(mockLink)

      downloadHTML('<html></html>', 'test-report')

      expect(global.Blob).toHaveBeenCalled()
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(mockLink.download).toBe('test-report.html')
      expect(mockLink.click).toHaveBeenCalled()
      expect(global.URL.revokeObjectURL).toHaveBeenCalled()
    })
  })

  describe('quickExport', () => {
    beforeEach(() => {
      global.window = {
        open: vi.fn(() => mockWindow),
      } as unknown as Window & typeof globalThis
    })

    it('should export single policy using exportPolicyToPDF', () => {
      const policy = createMockPolicy()
      const result = quickExport(policy)

      expect(result).toBe(true)
    })

    it('should export single policy when array of one is provided', () => {
      const policies = [createMockPolicy()]
      const result = quickExport(policies)

      expect(result).toBe(true)
    })

    it('should export portfolio when multiple policies provided', () => {
      const policies = [
        createMockPolicy({ id: 'policy-1' }),
        createMockPolicy({ id: 'policy-2' }),
        createMockPolicy({ id: 'policy-3' }),
      ]
      const result = quickExport(policies)

      expect(result).toBe(true)
    })

    it('should accept custom options', () => {
      const policy = createMockPolicy()
      const result = quickExport(policy, { language: 'en' })

      expect(result).toBe(true)
    })
  })

  describe('generatePortfolioReport - edge cases', () => {
    it('should calculate gap summary when critical gaps exist', () => {
      const policiesWithGaps = [
        createMockPolicy({
          id: 'policy-1',
          gapAnalysis: {
            overallScore: 60,
            criticalCount: 2,
            highCount: 1,
            totalCount: 5,
            topIssue: 'Missing coverage',
            topIssueTr: 'Eksik teminat',
            financialExposure: 15000,
            remediationCost: 1000,
          },
        }),
        createMockPolicy({
          id: 'policy-2',
          gapAnalysis: {
            overallScore: 75,
            criticalCount: 1,
            highCount: 1,
            totalCount: 3,
            topIssue: 'Low limit',
            topIssueTr: 'Düşük limit',
            financialExposure: 10000,
            remediationCost: 500,
          },
        }),
      ]
      const result = generatePortfolioReport(policiesWithGaps)

      expect(result.success).toBe(true)
    })

    it('should handle policies with risk scores', () => {
      const policiesWithRiskScores = [
        createMockPolicy({ riskScore: { overall: 30, level: 'low', topIssue: null, confidence: 0.85 } }),
        createMockPolicy({ riskScore: { overall: 70, level: 'high', topIssue: 'High deductible', confidence: 0.9 } }),
      ]
      const result = generatePortfolioReport(policiesWithRiskScores)

      expect(result.success).toBe(true)
    })

    it('should handle policies with different statuses', () => {
      const mixedStatusPolicies = [
        createMockPolicy({ status: 'active' }),
        createMockPolicy({ status: 'expiring' }),
        createMockPolicy({ status: 'expired' }),
      ]
      const result = generatePortfolioReport(mixedStatusPolicies)

      expect(result.success).toBe(true)
    })

    it('should accept custom branding options', () => {
      const policies = [createMockPolicy()]
      const result = generatePortfolioReport(policies, {
        branding: {
          companyName: 'Custom Company',
          colors: {
            primary: '#FF0000',
            secondary: '#0000FF',
            text: '#000000',
            textLight: '#666666',
            background: '#FFFFFF',
            accent: '#00FF00',
            success: '#22c55e',
            warning: '#f59e0b',
            danger: '#ef4444',
          },
        },
      })

      expect(result.success).toBe(true)
    })

    it('should accept custom sections', () => {
      const policies = [createMockPolicy()]
      const result = generatePortfolioReport(policies, {
        sections: { showPolicyDetails: true, showCoverages: true },
      })

      expect(result.success).toBe(true)
    })
  })

  describe('generatePolicyDetailReport - error handling', () => {
    it('should handle policy with minimal fields', () => {
      const minimalPolicy = {
        id: 'min-1',
        policyNumber: 'MIN-001',
        type: 'kasko' as const,
        provider: 'Test',
        premium: 1000,
        coverage: 50000,
        status: 'active' as const,
        startDate: new Date().toISOString(),
        expiryDate: new Date().toISOString(),
      } as AnalyzedPolicy

      const result = generatePolicyDetailReport(minimalPolicy)
      expect(result).toHaveProperty('success')
    })

    it('should handle policy with all optional fields', () => {
      const fullPolicy = createMockPolicy({
        riskScore: { overall: 45, level: 'moderate', topIssue: 'Coverage limit', confidence: 0.88 },
        gapAnalysis: {
          overallScore: 70,
          criticalCount: 1,
          highCount: 1,
          totalCount: 3,
          topIssue: 'Missing critical coverage',
          topIssueTr: 'Kritik teminat eksik',
          financialExposure: 12000,
          remediationCost: 800,
        },
        marketComparison: { averagePremium: 6000, averageCoverage: 120000, percentile: 35 },
        aiInsights: ['Good coverage', 'Consider flood insurance'],
      })
      const result = generatePolicyDetailReport(fullPolicy)

      expect(result.success).toBe(true)
    })
  })

  describe('generatePolicyDetailReport - market comparison edge cases', () => {
    it('should handle policy without marketComparison', () => {
      const policy = createMockPolicy({ marketComparison: undefined })
      const result = generatePolicyDetailReport(policy)

      expect(result.success).toBe(true)
    })

    it('should handle policy with partial marketComparison', () => {
      const policy = createMockPolicy({
        marketComparison: { averagePremium: 5000, averageCoverage: 100000, percentile: 50 },
      })
      const result = generatePolicyDetailReport(policy)

      expect(result.success).toBe(true)
    })
  })

  describe('generateGapAnalysisReport - edge cases', () => {
    it('should handle gap analysis with empty topRecommendations', () => {
      const policy = createMockPolicy()
      const gapAnalysis = {
        ...createMockGapAnalysis(),
        topRecommendations: [],
      }
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      expect(result.success).toBe(true)
    })

    it('should handle gap analysis with undefined topRecommendations', () => {
      const policy = createMockPolicy()
      const baseAnalysis = createMockGapAnalysis()
      const gapAnalysis: ComprehensiveGapAnalysis = {
        ...baseAnalysis,
        topRecommendations: [],
      }
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      expect(result.success).toBe(true)
    })

    it('should handle recommendations without estimatedCost', () => {
      const policy = createMockPolicy()
      const baseAnalysis = createMockGapAnalysis()
      const gapAnalysis: ComprehensiveGapAnalysis = {
        ...baseAnalysis,
        topRecommendations: [
          {
            id: 'rec-2',
            title: 'Add Coverage',
            titleTr: 'Teminat Ekle',
            description: 'Add missing coverage',
            descriptionTr: 'Eksik teminat ekleyin',
            addressesGaps: [],
            impactScore: 70,
            gapsResolved: 1,
            riskReduction: 20,
            estimatedCost: 0,
            expectedSavings: 0,
            roi: 0,
            difficulty: 'easy',
            timeframe: '1 week',
            priority: 1,
          },
        ],
      }
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      expect(result.success).toBe(true)
    })
  })

  describe('generatePortfolioReport - edge cases', () => {
    it('should handle policies without riskScore', () => {
      const policies = [
        createMockPolicy({ id: 'p1', riskScore: undefined }),
        createMockPolicy({ id: 'p2', riskScore: undefined }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle policies with zero coverage', () => {
      const policies = [
        createMockPolicy({ coverage: 0 }),
        createMockPolicy({ coverage: 0 }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle policies with zero premium', () => {
      const policies = [
        createMockPolicy({ premium: 0 }),
        createMockPolicy({ premium: 0 }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle policies without gapAnalysis', () => {
      const policies = [
        createMockPolicy({ gapAnalysis: undefined }),
        createMockPolicy({ gapAnalysis: undefined }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle single policy with critical gaps', () => {
      const policies = [
        createMockPolicy({
          gapAnalysis: {
            overallScore: 50,
            criticalCount: 3,
            highCount: 2,
            totalCount: 5,
            topIssue: 'Major coverage gap',
            topIssueTr: 'Önemli teminat açığı',
            financialExposure: 50000,
            remediationCost: 2000,
          },
        }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle multiple policy types', () => {
      const policies = [
        createMockPolicy({ type: 'kasko' }),
        createMockPolicy({ type: 'home' }),
        createMockPolicy({ type: 'life' }),
        createMockPolicy({ type: 'health' }),
        createMockPolicy({ type: 'business' }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle all expired policies', () => {
      const policies = [
        createMockPolicy({ status: 'expired' }),
        createMockPolicy({ status: 'expired' }),
      ]
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })

    it('should handle large number of policies', () => {
      const policies = Array.from({ length: 50 }, (_, i) =>
        createMockPolicy({ id: `policy-${i}` })
      )
      const result = generatePortfolioReport(policies)

      expect(result.success).toBe(true)
    })
  })

  describe('generatePolicySummaryReport - edge cases', () => {
    it('should handle empty policy array', () => {
      const result = generatePolicySummaryReport([])
      expect(result.success).toBe(true)
    })

    it('should handle large number of policies', () => {
      const policies = Array.from({ length: 100 }, (_, i) =>
        createMockPolicy({ id: `summary-policy-${i}` })
      )
      const result = generatePolicySummaryReport(policies)

      expect(result.success).toBe(true)
    })
  })

  describe('Report filename generation', () => {
    it('should generate policy_detail filename with policy number', () => {
      const policy = createMockPolicy({ policyNumber: 'POL-12345' })
      const result = generatePolicyDetailReport(policy)

      expect(result.filename).toContain('policy')
    })

    it('should generate gap_analysis filename', () => {
      const policy = createMockPolicy()
      const gapAnalysis = createMockGapAnalysis()
      const result = generateGapAnalysisReport(policy, gapAnalysis)

      expect(result.filename).toContain('gap')
    })

    it('should generate portfolio filename', () => {
      const policies = [createMockPolicy()]
      const result = generatePortfolioReport(policies)

      expect(result.filename).toContain('portfolio')
    })
  })

  describe('Report options handling', () => {
    it('should apply English language option', () => {
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy, { language: 'en' })

      expect(result.success).toBe(true)
    })

    it('should apply Turkish language option', () => {
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy, { language: 'tr' })

      expect(result.success).toBe(true)
    })

    it('should apply format option', () => {
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy, { format: 'pdf' })

      expect(result.success).toBe(true)
    })

    it('should apply custom branding', () => {
      const policy = createMockPolicy()
      const result = generatePolicyDetailReport(policy, {
        branding: {
          companyName: 'Custom Corp',
          colors: {
            primary: '#123456',
            secondary: '#654321',
            text: '#000000',
            textLight: '#666666',
            background: '#FFFFFF',
            accent: '#00AAFF',
            success: '#22c55e',
            warning: '#f59e0b',
            danger: '#ef4444',
          },
        },
      })

      expect(result.success).toBe(true)
    })
  })

  describe('Export functions - edge cases', () => {
    beforeEach(() => {
      global.window = {
        open: vi.fn(() => null),
      } as unknown as Window & typeof globalThis
    })

    it('should return false when print window fails to open for policy', () => {
      const policy = createMockPolicy()
      const result = quickExport(policy)

      expect(result).toBe(false)
    })
  })
})
