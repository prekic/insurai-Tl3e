/**
 * Comprehensive coverage tests for generator.ts
 * Targets: all report generation functions, export utilities, quick export, available report types
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AnalyzedPolicy } from '@/types/policy'
import type { ComprehensiveGapAnalysis } from '@/types/gap'

// Mock branding module
vi.mock('./branding', () => ({
  getSavedBranding: vi.fn(() => ({
    companyName: 'TestCo',
    logo: undefined,
    colors: { primary: '#000' },
  })),
}))

// Mock templates module
vi.mock('./templates', () => ({
  generatePolicyDetailHTML: vi.fn(() => '<html>policy-detail</html>'),
  generateGapAnalysisHTML: vi.fn(() => '<html>gap-analysis</html>'),
  generatePortfolioHTML: vi.fn(() => '<html>portfolio</html>'),
  generatePolicySummaryHTML: vi.fn(() => '<html>policy-summary</html>'),
}))

import {
  generatePolicyDetailReport,
  generateGapAnalysisReport,
  generatePortfolioReport,
  generatePolicySummaryReport,
  openPrintWindow,
  downloadHTML,
  exportPolicyToPDF,
  exportGapAnalysisToPDF,
  exportPortfolioToPDF,
  exportPolicySummaryToPDF,
  quickExport,
  getAvailableReportTypes,
} from './generator'

import { getSavedBranding } from './branding'
import {
  generatePolicyDetailHTML,
  generateGapAnalysisHTML,
  generatePortfolioHTML,
  generatePolicySummaryHTML,
} from './templates'

// Helper factories
function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'p-1',
    policyNumber: 'POL-001',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 200000,
    premium: 5000,
    deductible: 1000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    aiInsights: [],
    confidence: { overall: 0.9, fields: {} },
    uploadDate: '2026-01-01',
    ...overrides,
  } as unknown as AnalyzedPolicy
}

function makeGapAnalysis(overrides: Partial<ComprehensiveGapAnalysis> = {}): ComprehensiveGapAnalysis {
  return {
    gaps: [],
    gapCount: { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 },
    overallScore: 75,
    financialSummary: { potentialExposure: 10000, recommendedIncrease: 5000 },
    prioritizedGaps: [],
    recommendations: [],
    topRecommendations: [],
    ...overrides,
  } as unknown as ComprehensiveGapAnalysis
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generator coverage', () => {
  // ==========================================================================
  // generatePolicyDetailReport
  // ==========================================================================
  describe('generatePolicyDetailReport', () => {
    it('should generate a report with defaults', () => {
      const policy = makePolicy()
      const result = generatePolicyDetailReport(policy)
      expect(result.success).toBe(true)
      expect(result.html).toBe('<html>policy-detail</html>')
      expect(result.mimeType).toBe('text/html')
      expect(result.filename).toBeTruthy()
      expect(getSavedBranding).toHaveBeenCalled()
      expect(generatePolicyDetailHTML).toHaveBeenCalled()
    })

    it('should pass gapAnalysis data when provided', () => {
      const policy = makePolicy()
      const gap = makeGapAnalysis()
      const result = generatePolicyDetailReport(policy, {}, gap)
      expect(result.success).toBe(true)
      const callArgs = vi.mocked(generatePolicyDetailHTML).mock.calls[0]
      expect(callArgs[0].gapAnalysis).toBe(gap)
    })

    it('should include marketBenchmark when marketComparison exists', () => {
      const policy = makePolicy({
        marketComparison: {
          averagePremium: 6000,
          averageCoverage: 250000,
          percentile: 45,
        },
      } as Partial<AnalyzedPolicy>)
      const result = generatePolicyDetailReport(policy)
      expect(result.success).toBe(true)
      const callArgs = vi.mocked(generatePolicyDetailHTML).mock.calls[0]
      expect(callArgs[0].marketBenchmark).toEqual({
        avgPremium: 6000,
        avgCoverage: 250000,
        percentile: 45,
      })
    })

    it('should set marketBenchmark to undefined when no marketComparison', () => {
      const policy = makePolicy()
      generatePolicyDetailReport(policy)
      const callArgs = vi.mocked(generatePolicyDetailHTML).mock.calls[0]
      expect(callArgs[0].marketBenchmark).toBeUndefined()
    })

    it('should apply custom options', () => {
      const policy = makePolicy()
      generatePolicyDetailReport(policy, {
        language: 'en',
        format: 'html',
      })
      const callArgs = vi.mocked(generatePolicyDetailHTML).mock.calls[0]
      expect(callArgs[2].language).toBe('en')
      expect(callArgs[2].format).toBe('html')
    })

    it('should merge custom branding via options', () => {
      const policy = makePolicy()
      generatePolicyDetailReport(policy, {
        branding: { companyName: 'Override Inc' },
      })
      expect(getSavedBranding).toHaveBeenCalled()
    })

    it('should return error when template throws', () => {
      vi.mocked(generatePolicyDetailHTML).mockImplementationOnce(() => {
        throw new Error('Template error')
      })
      const result = generatePolicyDetailReport(makePolicy())
      expect(result.success).toBe(false)
      expect(result.error).toBe('Template error')
      expect(result.filename).toBe('')
      expect(result.mimeType).toBe('')
    })

    it('should handle non-Error throw', () => {
      vi.mocked(generatePolicyDetailHTML).mockImplementationOnce(() => {
        throw 'string error'
      })
      const result = generatePolicyDetailReport(makePolicy())
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to generate report')
    })

    it('should generate filename from policy number', () => {
      const policy = makePolicy({ policyNumber: 'K-12345' })
      const result = generatePolicyDetailReport(policy)
      expect(result.filename.toLowerCase()).toContain('k-12345')
    })
  })

  // ==========================================================================
  // generateGapAnalysisReport
  // ==========================================================================
  describe('generateGapAnalysisReport', () => {
    it('should generate gap analysis report with defaults', () => {
      const policy = makePolicy()
      const gap = makeGapAnalysis()
      const result = generateGapAnalysisReport(policy, gap)
      expect(result.success).toBe(true)
      expect(result.html).toBe('<html>gap-analysis</html>')
      expect(generateGapAnalysisHTML).toHaveBeenCalled()
    })

    it('should map topRecommendations to recommendations data', () => {
      const policy = makePolicy()
      const gap = makeGapAnalysis({
        topRecommendations: [
          {
            title: 'Add collision',
            titleTr: 'Kasko ekle',
            description: 'Important for protection',
            descriptionTr: 'Koruma icin onemli',
            estimatedCost: 500,
          },
          {
            title: 'Increase limits',
            titleTr: 'Limitleri artir',
            description: 'Below market average',
            descriptionTr: 'Piyasa ortalamasinin altinda',
            estimatedCost: 200,
          },
        ],
      } as unknown as Partial<ComprehensiveGapAnalysis>)

      generateGapAnalysisReport(policy, gap)
      const callArgs = vi.mocked(generateGapAnalysisHTML).mock.calls[0]
      const data = callArgs[0]
      expect(data.recommendations).toHaveLength(2)
      expect(data.recommendations![0]).toEqual({
        priority: 1,
        action: 'Add collision',
        actionTr: 'Kasko ekle',
        impact: 'Important for protection',
        impactTr: 'Koruma icin onemli',
        estimatedCost: 500,
      })
      expect(data.recommendations![1].priority).toBe(2)
    })

    it('should handle undefined topRecommendations', () => {
      const policy = makePolicy()
      const gap = makeGapAnalysis({ topRecommendations: undefined } as unknown as Partial<ComprehensiveGapAnalysis>)
      generateGapAnalysisReport(policy, gap)
      const callArgs = vi.mocked(generateGapAnalysisHTML).mock.calls[0]
      expect(callArgs[0].recommendations).toBeUndefined()
    })

    it('should return error on template failure', () => {
      vi.mocked(generateGapAnalysisHTML).mockImplementationOnce(() => {
        throw new Error('Gap template error')
      })
      const result = generateGapAnalysisReport(makePolicy(), makeGapAnalysis())
      expect(result.success).toBe(false)
      expect(result.error).toBe('Gap template error')
    })

    it('should handle non-Error throw', () => {
      vi.mocked(generateGapAnalysisHTML).mockImplementationOnce(() => {
        throw 42
      })
      const result = generateGapAnalysisReport(makePolicy(), makeGapAnalysis())
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to generate report')
    })

    it('should apply custom options', () => {
      generateGapAnalysisReport(makePolicy(), makeGapAnalysis(), { language: 'en' })
      const callArgs = vi.mocked(generateGapAnalysisHTML).mock.calls[0]
      expect(callArgs[2].language).toBe('en')
    })
  })

  // ==========================================================================
  // generatePortfolioReport
  // ==========================================================================
  describe('generatePortfolioReport', () => {
    it('should generate portfolio report', () => {
      const policies = [makePolicy(), makePolicy({ id: 'p-2', type: 'health', typeTr: 'Saglik' })]
      const result = generatePortfolioReport(policies)
      expect(result.success).toBe(true)
      expect(result.html).toBe('<html>portfolio</html>')
      expect(generatePortfolioHTML).toHaveBeenCalled()
    })

    it('should calculate summary stats correctly', () => {
      const policies = [
        makePolicy({ status: 'active', coverage: 100000, premium: 3000 }),
        makePolicy({ id: 'p-2', status: 'expiring', coverage: 200000, premium: 5000 }),
        makePolicy({ id: 'p-3', status: 'active', coverage: 150000, premium: 4000 }),
      ]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      const data = callArgs[0]
      expect(data.summary.totalPolicies).toBe(3)
      expect(data.summary.activePolicies).toBe(2)
      expect(data.summary.expiringPolicies).toBe(1)
      expect(data.summary.totalCoverage).toBe(450000)
      expect(data.summary.totalPremium).toBe(12000)
    })

    it('should use fallback riskScore of 50 when missing', () => {
      const policies = [makePolicy(), makePolicy({ id: 'p-2' })]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].summary.avgRiskScore).toBe(50)
    })

    it('should use riskScore.overall when present', () => {
      const policies = [
        makePolicy({ riskScore: { overall: 80 } } as Partial<AnalyzedPolicy>),
        makePolicy({ id: 'p-2', riskScore: { overall: 60 } } as Partial<AnalyzedPolicy>),
      ]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].summary.avgRiskScore).toBe(70)
    })

    it('should calculate criticalGaps from gapAnalysis', () => {
      const policies = [
        makePolicy({ gapAnalysis: { criticalCount: 2, totalCount: 5, financialExposure: 10000, topIssue: 'Missing fire' } } as unknown as Partial<AnalyzedPolicy>),
        makePolicy({ id: 'p-2', gapAnalysis: { criticalCount: 1, totalCount: 3, financialExposure: 5000, topIssue: 'Low limits' } } as unknown as Partial<AnalyzedPolicy>),
      ]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].summary.criticalGaps).toBe(3)
    })

    it('should build gapSummary when criticalGaps > 0', () => {
      const policies = [
        makePolicy({ gapAnalysis: { criticalCount: 2, totalCount: 5, financialExposure: 10000, topIssue: 'Issue A' } } as unknown as Partial<AnalyzedPolicy>),
        makePolicy({ id: 'p-2', gapAnalysis: { criticalCount: 1, totalCount: 3, financialExposure: 5000, topIssue: 'Issue B' } } as unknown as Partial<AnalyzedPolicy>),
      ]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      const gapSummary = callArgs[0].gapSummary
      expect(gapSummary).toBeDefined()
      expect(gapSummary!.totalGaps).toBe(8)
      expect(gapSummary!.criticalGaps).toBe(3)
      expect(gapSummary!.estimatedExposure).toBe(15000)
      expect(gapSummary!.topIssues).toEqual(['Issue A', 'Issue B'])
    })

    it('should omit gapSummary when criticalGaps is 0', () => {
      const policies = [makePolicy(), makePolicy({ id: 'p-2' })]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].gapSummary).toBeUndefined()
    })

    it('should filter out policies without topIssue from topIssues', () => {
      const policies = [
        makePolicy({ gapAnalysis: { criticalCount: 1, totalCount: 2, financialExposure: 5000, topIssue: 'Has issue' } } as unknown as Partial<AnalyzedPolicy>),
        makePolicy({ id: 'p-2', gapAnalysis: { criticalCount: 1, totalCount: 1, financialExposure: 3000 } } as unknown as Partial<AnalyzedPolicy>),
      ]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].gapSummary!.topIssues).toEqual(['Has issue'])
    })

    it('should limit topIssues to 5', () => {
      const policies = Array.from({ length: 7 }, (_, i) =>
        makePolicy({
          id: `p-${i}`,
          gapAnalysis: { criticalCount: 1, totalCount: 1, financialExposure: 1000, topIssue: `Issue ${i}` },
        } as unknown as Partial<AnalyzedPolicy>)
      )
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].gapSummary!.topIssues).toHaveLength(5)
    })

    it('should group policies by type', () => {
      const policies = [
        makePolicy({ type: 'kasko', coverage: 100000, premium: 3000 }),
        makePolicy({ id: 'p-2', type: 'kasko', coverage: 150000, premium: 4000 }),
        makePolicy({ id: 'p-3', type: 'health', coverage: 50000, premium: 2000 }),
      ]
      generatePortfolioReport(policies)
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      const byType = callArgs[0].byType
      expect(byType.kasko.count).toBe(2)
      expect(byType.kasko.totalCoverage).toBe(250000)
      expect(byType.kasko.totalPremium).toBe(7000)
      expect(byType.health.count).toBe(1)
    })

    it('should set timeline to empty array', () => {
      generatePortfolioReport([makePolicy()])
      const callArgs = vi.mocked(generatePortfolioHTML).mock.calls[0]
      expect(callArgs[0].timeline).toEqual([])
    })

    it('should return error on template failure', () => {
      vi.mocked(generatePortfolioHTML).mockImplementationOnce(() => {
        throw new Error('Portfolio error')
      })
      const result = generatePortfolioReport([makePolicy()])
      expect(result.success).toBe(false)
      expect(result.error).toBe('Portfolio error')
    })

    it('should handle non-Error throw', () => {
      vi.mocked(generatePortfolioHTML).mockImplementationOnce(() => {
        throw null
      })
      const result = generatePortfolioReport([makePolicy()])
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to generate report')
    })
  })

  // ==========================================================================
  // generatePolicySummaryReport
  // ==========================================================================
  describe('generatePolicySummaryReport', () => {
    it('should generate summary report', () => {
      const result = generatePolicySummaryReport([makePolicy()])
      expect(result.success).toBe(true)
      expect(result.html).toBe('<html>policy-summary</html>')
      expect(generatePolicySummaryHTML).toHaveBeenCalled()
    })

    it('should apply custom options', () => {
      generatePolicySummaryReport([makePolicy()], { language: 'en' })
      const callArgs = vi.mocked(generatePolicySummaryHTML).mock.calls[0]
      expect(callArgs[2].language).toBe('en')
    })

    it('should return error on template failure', () => {
      vi.mocked(generatePolicySummaryHTML).mockImplementationOnce(() => {
        throw new Error('Summary error')
      })
      const result = generatePolicySummaryReport([makePolicy()])
      expect(result.success).toBe(false)
      expect(result.error).toBe('Summary error')
    })

    it('should handle non-Error throw', () => {
      vi.mocked(generatePolicySummaryHTML).mockImplementationOnce(() => {
        throw undefined
      })
      const result = generatePolicySummaryReport([makePolicy()])
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to generate report')
    })
  })

  // ==========================================================================
  // openPrintWindow
  // ==========================================================================
  describe('openPrintWindow', () => {
    it('should open a new window and write HTML', () => {
      const mockPrintWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))

      const result = openPrintWindow('<html>test</html>')
      expect(result).toBe(mockPrintWindow)
      expect(mockPrintWindow.document.write).toHaveBeenCalledWith('<html>test</html>')
      expect(mockPrintWindow.document.close).toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it('should return null when window.open returns null (popup blocker)', () => {
      vi.stubGlobal('open', vi.fn(() => null))

      const result = openPrintWindow('<html>test</html>')
      expect(result).toBeNull()

      vi.unstubAllGlobals()
    })

    it('should trigger print after onload', () => {
      vi.useFakeTimers()
      const mockPrintWindow = {
        document: { write: vi.fn(), close: vi.fn() },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))

      openPrintWindow('<html>test</html>')

      expect(mockPrintWindow.onload).toBeTruthy()
      mockPrintWindow.onload!()

      vi.advanceTimersByTime(250)
      expect(mockPrintWindow.print).toHaveBeenCalled()

      vi.useRealTimers()
      vi.unstubAllGlobals()
    })
  })

  // ==========================================================================
  // downloadHTML
  // ==========================================================================
  describe('downloadHTML', () => {
    it('should create blob, link element, click, and clean up', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      const createObjectURLMock = vi.fn(() => 'blob:test-url')
      const revokeObjectURLMock = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      })

      const appendChildMock = vi.fn()
      const removeChildMock = vi.fn()
      const createElementMock = vi.fn(() => mockLink)

      vi.spyOn(document, 'createElement').mockImplementation(createElementMock as unknown as typeof document.createElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock)
      vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock)

      downloadHTML('<html>content</html>', 'test-report')

      expect(createObjectURLMock).toHaveBeenCalled()
      expect(mockLink.href).toBe('blob:test-url')
      expect(mockLink.download).toBe('test-report.html')
      expect(mockLink.click).toHaveBeenCalled()
      expect(removeChildMock).toHaveBeenCalled()
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url')

      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })
  })

  // ==========================================================================
  // exportPolicyToPDF
  // ==========================================================================
  describe('exportPolicyToPDF', () => {
    it('should return true on success', () => {
      const mockPrintWindow = {
        document: { write: vi.fn(), close: vi.fn() },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))

      const result = exportPolicyToPDF(makePolicy())
      expect(result).toBe(true)

      vi.unstubAllGlobals()
    })

    it('should return false when report generation fails', () => {
      vi.mocked(generatePolicyDetailHTML).mockImplementationOnce(() => {
        throw new Error('fail')
      })
      const result = exportPolicyToPDF(makePolicy())
      expect(result).toBe(false)
    })

    it('should return false when popup is blocked', () => {
      vi.stubGlobal('open', vi.fn(() => null))

      const result = exportPolicyToPDF(makePolicy())
      expect(result).toBe(false)

      vi.unstubAllGlobals()
    })
  })

  // ==========================================================================
  // exportGapAnalysisToPDF
  // ==========================================================================
  describe('exportGapAnalysisToPDF', () => {
    it('should return true on success', () => {
      const mockPrintWindow = {
        document: { write: vi.fn(), close: vi.fn() },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))

      const result = exportGapAnalysisToPDF(makePolicy(), makeGapAnalysis())
      expect(result).toBe(true)

      vi.unstubAllGlobals()
    })

    it('should return false when report generation fails', () => {
      vi.mocked(generateGapAnalysisHTML).mockImplementationOnce(() => {
        throw new Error('fail')
      })
      const result = exportGapAnalysisToPDF(makePolicy(), makeGapAnalysis())
      expect(result).toBe(false)
    })

    it('should return false when popup is blocked', () => {
      vi.stubGlobal('open', vi.fn(() => null))

      const result = exportGapAnalysisToPDF(makePolicy(), makeGapAnalysis())
      expect(result).toBe(false)

      vi.unstubAllGlobals()
    })
  })

  // ==========================================================================
  // exportPortfolioToPDF
  // ==========================================================================
  describe('exportPortfolioToPDF', () => {
    it('should return true on success', () => {
      const mockPrintWindow = {
        document: { write: vi.fn(), close: vi.fn() },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))

      const result = exportPortfolioToPDF([makePolicy()])
      expect(result).toBe(true)

      vi.unstubAllGlobals()
    })

    it('should return false when report generation fails', () => {
      vi.mocked(generatePortfolioHTML).mockImplementationOnce(() => {
        throw new Error('fail')
      })
      const result = exportPortfolioToPDF([makePolicy()])
      expect(result).toBe(false)
    })
  })

  // ==========================================================================
  // exportPolicySummaryToPDF
  // ==========================================================================
  describe('exportPolicySummaryToPDF', () => {
    it('should return true on success', () => {
      const mockPrintWindow = {
        document: { write: vi.fn(), close: vi.fn() },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))

      const result = exportPolicySummaryToPDF([makePolicy()])
      expect(result).toBe(true)

      vi.unstubAllGlobals()
    })

    it('should return false when report generation fails', () => {
      vi.mocked(generatePolicySummaryHTML).mockImplementationOnce(() => {
        throw new Error('fail')
      })
      const result = exportPolicySummaryToPDF([makePolicy()])
      expect(result).toBe(false)
    })
  })

  // ==========================================================================
  // quickExport
  // ==========================================================================
  describe('quickExport', () => {
    beforeEach(() => {
      const mockPrintWindow = {
        document: { write: vi.fn(), close: vi.fn() },
        onload: null as (() => void) | null,
        print: vi.fn(),
      }
      vi.stubGlobal('open', vi.fn(() => mockPrintWindow))
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should export single policy via exportPolicyToPDF', () => {
      const result = quickExport(makePolicy())
      expect(result).toBe(true)
      expect(generatePolicyDetailHTML).toHaveBeenCalled()
    })

    it('should export array of 1 via exportPolicyToPDF', () => {
      const result = quickExport([makePolicy()])
      expect(result).toBe(true)
      expect(generatePolicyDetailHTML).toHaveBeenCalled()
    })

    it('should export array of multiple via exportPortfolioToPDF', () => {
      const result = quickExport([makePolicy(), makePolicy({ id: 'p-2' })])
      expect(result).toBe(true)
      expect(generatePortfolioHTML).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // getAvailableReportTypes
  // ==========================================================================
  describe('getAvailableReportTypes', () => {
    it('should return policy_detail for single policy', () => {
      const types = getAvailableReportTypes(makePolicy())
      expect(types).toContain('policy_detail')
      expect(types).toContain('executive_summary')
      expect(types).not.toContain('portfolio')
      expect(types).not.toContain('policy_summary')
    })

    it('should include gap_analysis when hasGapAnalysis is true', () => {
      const types = getAvailableReportTypes(makePolicy(), true)
      expect(types).toContain('policy_detail')
      expect(types).toContain('gap_analysis')
      expect(types).toContain('executive_summary')
    })

    it('should not include gap_analysis when hasGapAnalysis is false', () => {
      const types = getAvailableReportTypes(makePolicy(), false)
      expect(types).not.toContain('gap_analysis')
    })

    it('should return policy_summary and portfolio for array', () => {
      const types = getAvailableReportTypes([makePolicy(), makePolicy({ id: 'p-2' }), makePolicy({ id: 'p-3' })])
      expect(types).toContain('policy_summary')
      expect(types).toContain('portfolio')
      expect(types).toContain('executive_summary')
      expect(types).not.toContain('policy_detail')
    })

    it('should include comparison for exactly 2 policies', () => {
      const types = getAvailableReportTypes([makePolicy(), makePolicy({ id: 'p-2' })])
      expect(types).toContain('comparison')
    })

    it('should not include comparison for 3 policies', () => {
      const types = getAvailableReportTypes([makePolicy(), makePolicy({ id: 'p-2' }), makePolicy({ id: 'p-3' })])
      expect(types).not.toContain('comparison')
    })

    it('should not include comparison for 1 policy in array', () => {
      const types = getAvailableReportTypes([makePolicy()])
      expect(types).not.toContain('comparison')
    })

    it('should always include executive_summary', () => {
      expect(getAvailableReportTypes(makePolicy())).toContain('executive_summary')
      expect(getAvailableReportTypes([makePolicy()])).toContain('executive_summary')
      expect(getAvailableReportTypes([makePolicy(), makePolicy({ id: 'p-2' })])).toContain('executive_summary')
    })
  })
})
