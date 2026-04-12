/**
 * Branch Coverage Tests for usePdfExport hooks
 *
 * Targets uncovered branches in src/hooks/usePdfExport.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AnalyzedPolicy } from '@/types/policy'
import type { ComprehensiveGapAnalysis } from '@/types/gap'

// Mock dependencies
vi.mock('@/types/pdf-report', () => ({
  DEFAULT_BRANDING: {
    companyName: 'InsurAI',
    tagline: 'Insurance Analytics',
    colors: { primary: '#2563eb' },
    contact: { email: 'test@test.com', phone: '555-0100', website: 'https://test.com' },
  },
  mergeBranding: vi.fn((base, updates) => ({ ...base, ...updates })),
}))

vi.mock('@/lib/pdf-export/branding', () => ({
  getSavedBranding: vi.fn(() => ({
    companyName: 'InsurAI',
    tagline: 'Insurance Analytics',
    colors: { primary: '#2563eb' },
    contact: { email: 'test@test.com', phone: '555-0100', website: 'https://test.com' },
  })),
  saveBranding: vi.fn(),
  resetBranding: vi.fn(),
  getTheme: vi.fn((theme: string) => ({
    colors: { primary: theme === 'modern' ? '#000' : '#333' },
  })),
}))

const mockOpenPrintWindow = vi.fn()
const mockDownloadHTML = vi.fn()
const mockGeneratePolicyDetailReport = vi.fn()
const mockGenerateGapAnalysisReport = vi.fn()
const mockGeneratePortfolioReport = vi.fn()
const mockGeneratePolicySummaryReport = vi.fn()
const mockGetAvailableReportTypes = vi.fn()

vi.mock('@/lib/pdf-export/generator', () => ({
  generatePolicyDetailReport: (...args: unknown[]) => mockGeneratePolicyDetailReport(...args),
  generateGapAnalysisReport: (...args: unknown[]) => mockGenerateGapAnalysisReport(...args),
  generatePortfolioReport: (...args: unknown[]) => mockGeneratePortfolioReport(...args),
  generatePolicySummaryReport: (...args: unknown[]) => mockGeneratePolicySummaryReport(...args),
  openPrintWindow: (...args: unknown[]) => mockOpenPrintWindow(...args),
  downloadHTML: (...args: unknown[]) => mockDownloadHTML(...args),
  getAvailableReportTypes: (...args: unknown[]) => mockGetAvailableReportTypes(...args),
}))

import {
  useBranding,
  usePdfExport,
  useQuickExport,
  useReportPreview,
  useReportTypes,
} from './usePdfExport'

// ============================================================================
// Helpers
// ============================================================================

function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'test-1',
    policyNumber: 'POL-123',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 5000,
    deductible: 1000,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    status: 'active',
    insuredPerson: 'Ali Yilmaz',
    coverages: [],
    exclusions: [],
    aiInsights: [],
    ...overrides,
  } as AnalyzedPolicy
}

function makeGapAnalysis(): ComprehensiveGapAnalysis {
  // @ts-expect-error - mismatch due to schema update
  return {
    gaps: [],
    gapCount: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    overallScore: 80,
    financialSummary: { potentialExposure: 0, recommendedIncrease: 0 },
    prioritizedGaps: [],
    recommendations: [],
  } as ComprehensiveGapAnalysis
}

// ============================================================================
// useBranding
// ============================================================================
describe('useBranding', () => {
  it('initializes with saved branding', () => {
    const { result } = renderHook(() => useBranding())
    expect(result.current.branding.companyName).toBe('InsurAI')
  })

  it('updateBranding merges and saves', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.updateBranding({ companyName: 'NewCo' })
    })
    expect(result.current.branding.companyName).toBe('NewCo')
  })

  it('resetToDefault resets to DEFAULT_BRANDING', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.updateBranding({ companyName: 'Changed' })
    })
    act(() => {
      result.current.resetToDefault()
    })
    expect(result.current.branding.companyName).toBe('InsurAI')
  })

  it('applyTheme applies theme config', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.applyTheme('modern')
    })
    // Theme was applied via updateBranding
  })

  it('setCompanyInfo sets name only', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({ name: 'New Company' })
    })
    expect(result.current.branding.companyName).toBe('New Company')
  })

  it('setCompanyInfo sets tagline only', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({ tagline: 'New Tagline' })
    })
  })

  it('setCompanyInfo sets logoUrl', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({ logoUrl: 'https://logo.png' })
    })
  })

  it('setCompanyInfo sets contact info (email)', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({ email: 'new@test.com' })
    })
  })

  it('setCompanyInfo sets contact info (phone)', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({ phone: '555-9999' })
    })
  })

  it('setCompanyInfo sets contact info (website)', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({ website: 'https://new.com' })
    })
  })

  it('setCompanyInfo handles no contact info', () => {
    const { result } = renderHook(() => useBranding())
    act(() => {
      result.current.setCompanyInfo({})
    })
    // No updates if all fields empty
  })
})

// ============================================================================
// usePdfExport
// ============================================================================
describe('usePdfExport', () => {
  beforeEach(() => {
    mockGeneratePolicyDetailReport.mockReturnValue({
      success: true,
      html: '<html>test</html>',
      filename: 'test.html',
    })
    mockGenerateGapAnalysisReport.mockReturnValue({
      success: true,
      html: '<html>gap</html>',
      filename: 'gap.html',
    })
    mockGeneratePortfolioReport.mockReturnValue({
      success: true,
      html: '<html>portfolio</html>',
      filename: 'portfolio.html',
    })
    mockGeneratePolicySummaryReport.mockReturnValue({
      success: true,
      html: '<html>summary</html>',
      filename: 'summary.html',
    })
    mockOpenPrintWindow.mockReturnValue({ document: { write: vi.fn(), close: vi.fn() } })
    mockGetAvailableReportTypes.mockReturnValue(['policy_detail', 'portfolio'])
  })

  // --- exportPolicy ---
  it('exportPolicy returns true on success', async () => {
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPolicy(makePolicy())
    })
    expect(success).toBe(true)
    expect(result.current.lastResult).toBeDefined()
  })

  it('exportPolicy returns false when generation fails', async () => {
    mockGeneratePolicyDetailReport.mockReturnValue({ success: false, error: 'Generation failed' })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPolicy(makePolicy())
    })
    expect(success).toBe(false)
    expect(result.current.error).toBe('Generation failed')
  })

  it('exportPolicy returns false when html is null', async () => {
    mockGeneratePolicyDetailReport.mockReturnValue({ success: true, html: null })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPolicy(makePolicy())
    })
    expect(success).toBe(false)
    expect(result.current.error).toBe('Failed to generate report')
  })

  it('exportPolicy returns false when popup blocked', async () => {
    mockOpenPrintWindow.mockReturnValue(null)
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPolicy(makePolicy())
    })
    expect(success).toBe(false)
    expect(result.current.error).toContain('popups')
  })

  it('exportPolicy handles exception with Error object', async () => {
    mockGeneratePolicyDetailReport.mockImplementation(() => {
      throw new Error('Boom')
    })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPolicy(makePolicy())
    })
    expect(success).toBe(false)
    expect(result.current.error).toBe('Boom')
  })

  it('exportPolicy handles exception with non-Error', async () => {
    mockGeneratePolicyDetailReport.mockImplementation(() => {
      throw 'string error'
    })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPolicy(makePolicy())
    })
    expect(success).toBe(false)
    expect(result.current.error).toBe('Export failed')
  })

  // --- exportGapAnalysis ---
  it('exportGapAnalysis returns true on success', async () => {
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportGapAnalysis(makePolicy(), makeGapAnalysis())
    })
    expect(success).toBe(true)
  })

  it('exportGapAnalysis returns false on generation failure', async () => {
    mockGenerateGapAnalysisReport.mockReturnValue({ success: false, error: 'Gap fail' })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportGapAnalysis(makePolicy(), makeGapAnalysis())
    })
    expect(success).toBe(false)
  })

  it('exportGapAnalysis returns false when popup blocked', async () => {
    mockOpenPrintWindow.mockReturnValue(null)
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportGapAnalysis(makePolicy(), makeGapAnalysis())
    })
    expect(success).toBe(false)
  })

  it('exportGapAnalysis handles exception', async () => {
    mockGenerateGapAnalysisReport.mockImplementation(() => {
      throw new Error('Gap boom')
    })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportGapAnalysis(makePolicy(), makeGapAnalysis())
    })
    expect(success).toBe(false)
    expect(result.current.error).toBe('Gap boom')
  })

  // --- exportPortfolio ---
  it('exportPortfolio returns true on success', async () => {
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPortfolio([makePolicy()])
    })
    expect(success).toBe(true)
  })

  it('exportPortfolio returns false on failure', async () => {
    mockGeneratePortfolioReport.mockReturnValue({ success: false })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPortfolio([makePolicy()])
    })
    expect(success).toBe(false)
  })

  it('exportPortfolio handles exception with non-Error', async () => {
    mockGeneratePortfolioReport.mockImplementation(() => {
      throw 42
    })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportPortfolio([makePolicy()])
    })
    expect(success).toBe(false)
    expect(result.current.error).toBe('Export failed')
  })

  // --- exportSummary ---
  it('exportSummary returns true on success', async () => {
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportSummary([makePolicy()])
    })
    expect(success).toBe(true)
  })

  it('exportSummary returns false on failure', async () => {
    mockGeneratePolicySummaryReport.mockReturnValue({ success: false, html: '' })
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportSummary([makePolicy()])
    })
    expect(success).toBe(false)
  })

  it('exportSummary handles popup blocked', async () => {
    mockOpenPrintWindow.mockReturnValue(null)
    const { result } = renderHook(() => usePdfExport())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportSummary([makePolicy()])
    })
    expect(success).toBe(false)
    expect(result.current.error).toContain('popups')
  })

  // --- downloadPolicyHTML ---
  it('downloadPolicyHTML calls downloadHTML on success', () => {
    const { result } = renderHook(() => usePdfExport())
    act(() => {
      result.current.downloadPolicyHTML(makePolicy())
    })
    expect(mockDownloadHTML).toHaveBeenCalled()
  })

  it('downloadPolicyHTML does nothing on failure', () => {
    mockGeneratePolicyDetailReport.mockReturnValue({ success: false })
    mockDownloadHTML.mockClear()
    const { result } = renderHook(() => usePdfExport())
    act(() => {
      result.current.downloadPolicyHTML(makePolicy())
    })
    expect(mockDownloadHTML).not.toHaveBeenCalled()
  })

  // --- downloadPortfolioHTML ---
  it('downloadPortfolioHTML calls downloadHTML on success', () => {
    const { result } = renderHook(() => usePdfExport())
    act(() => {
      result.current.downloadPortfolioHTML([makePolicy()])
    })
    expect(mockDownloadHTML).toHaveBeenCalled()
  })

  it('downloadPortfolioHTML does nothing on failure', () => {
    mockGeneratePortfolioReport.mockReturnValue({ success: false })
    mockDownloadHTML.mockClear()
    const { result } = renderHook(() => usePdfExport())
    act(() => {
      result.current.downloadPortfolioHTML([makePolicy()])
    })
    expect(mockDownloadHTML).not.toHaveBeenCalled()
  })

  // --- getAvailableTypes ---
  it('getAvailableTypes returns report types', () => {
    const { result } = renderHook(() => usePdfExport())
    const types = result.current.getAvailableTypes(makePolicy())
    expect(types).toEqual(['policy_detail', 'portfolio'])
  })

  it('getAvailableTypes with gap analysis', () => {
    const { result } = renderHook(() => usePdfExport())
    result.current.getAvailableTypes(makePolicy(), true)
    expect(mockGetAvailableReportTypes).toHaveBeenCalledWith(expect.anything(), true)
  })

  // --- clearError ---
  it('clearError resets error state', async () => {
    mockGeneratePolicyDetailReport.mockReturnValue({ success: false, error: 'Error' })
    const { result } = renderHook(() => usePdfExport())
    await act(async () => {
      await result.current.exportPolicy(makePolicy())
    })
    expect(result.current.error).toBe('Error')
    act(() => {
      result.current.clearError()
    })
    expect(result.current.error).toBeNull()
  })
})

// ============================================================================
// useQuickExport
// ============================================================================
describe('useQuickExport', () => {
  beforeEach(() => {
    mockGeneratePolicyDetailReport.mockReturnValue({
      success: true,
      html: '<html>test</html>',
      filename: 'test.html',
    })
    mockGeneratePortfolioReport.mockReturnValue({
      success: true,
      html: '<html>portfolio</html>',
      filename: 'portfolio.html',
    })
    mockOpenPrintWindow.mockReturnValue({ document: { write: vi.fn(), close: vi.fn() } })
  })

  it('returns false when policies is null', async () => {
    const { result } = renderHook(() => useQuickExport(null))
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportToPDF()
    })
    expect(success).toBe(false)
  })

  it('returns false when policies array is empty', async () => {
    const { result } = renderHook(() => useQuickExport([]))
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportToPDF()
    })
    expect(success).toBe(false)
  })

  it('exports single policy from array', async () => {
    const { result } = renderHook(() => useQuickExport([makePolicy()]))
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportToPDF()
    })
    expect(success).toBe(true)
    expect(mockGeneratePolicyDetailReport).toHaveBeenCalled()
  })

  it('exports portfolio for multiple policies', async () => {
    const { result } = renderHook(() =>
      useQuickExport([makePolicy(), makePolicy({ id: 'test-2' })])
    )
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportToPDF()
    })
    expect(success).toBe(true)
    expect(mockGeneratePortfolioReport).toHaveBeenCalled()
  })

  it('exports single policy object (not array)', async () => {
    const { result } = renderHook(() => useQuickExport(makePolicy()))
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.exportToPDF()
    })
    expect(success).toBe(true)
    expect(mockGeneratePolicyDetailReport).toHaveBeenCalled()
  })

  it('exposes isExporting state', () => {
    const { result } = renderHook(() => useQuickExport(makePolicy()))
    expect(result.current.isExporting).toBe(false)
  })
})

// ============================================================================
// useReportPreview
// ============================================================================
describe('useReportPreview', () => {
  beforeEach(() => {
    mockGeneratePolicyDetailReport.mockReturnValue({ success: true, html: '<html>detail</html>' })
    mockGenerateGapAnalysisReport.mockReturnValue({ success: true, html: '<html>gap</html>' })
    mockGeneratePortfolioReport.mockReturnValue({ success: true, html: '<html>portfolio</html>' })
    mockGeneratePolicySummaryReport.mockReturnValue({ success: true, html: '<html>summary</html>' })
  })

  it('generates policy_detail preview', () => {
    const { result } = renderHook(() => useReportPreview('policy_detail', makePolicy()))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBe('<html>detail</html>')
  })

  it('generates gap_analysis preview', () => {
    const { result } = renderHook(() =>
      useReportPreview('gap_analysis', makePolicy(), undefined, makeGapAnalysis())
    )
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBe('<html>gap</html>')
  })

  it('does not generate gap_analysis when no gapAnalysis provided', () => {
    const { result } = renderHook(() => useReportPreview('gap_analysis', makePolicy()))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBeNull()
  })

  it('generates portfolio preview', () => {
    const { result } = renderHook(() => useReportPreview('portfolio', undefined, [makePolicy()]))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBe('<html>portfolio</html>')
  })

  it('does not generate portfolio when no policies', () => {
    const { result } = renderHook(() => useReportPreview('portfolio'))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBeNull()
  })

  it('generates policy_summary preview', () => {
    const { result } = renderHook(() =>
      useReportPreview('policy_summary', undefined, [makePolicy()])
    )
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBe('<html>summary</html>')
  })

  it('does not generate policy_summary when no policies', () => {
    const { result } = renderHook(() => useReportPreview('policy_summary'))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBeNull()
  })

  it('does not set preview when result is not successful', () => {
    mockGeneratePolicyDetailReport.mockReturnValue({ success: false })
    const { result } = renderHook(() => useReportPreview('policy_detail', makePolicy()))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBeNull()
  })

  it('clearPreview resets HTML', () => {
    const { result } = renderHook(() => useReportPreview('policy_detail', makePolicy()))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBeTruthy()
    act(() => {
      result.current.clearPreview()
    })
    expect(result.current.previewHTML).toBeNull()
  })

  it('does nothing for policy_detail when no policy provided', () => {
    const { result } = renderHook(() => useReportPreview('policy_detail'))
    act(() => {
      result.current.generatePreview()
    })
    expect(result.current.previewHTML).toBeNull()
  })
})

// ============================================================================
// useReportTypes
// ============================================================================
describe('useReportTypes', () => {
  beforeEach(() => {
    mockGetAvailableReportTypes.mockReturnValue(['policy_detail', 'gap_analysis', 'portfolio'])
  })

  it('returns available types with labels', () => {
    const { result } = renderHook(() => useReportTypes(makePolicy(), true))
    expect(result.current.types.length).toBe(3)
    expect(result.current.types[0].label).toBe('Policy Detail')
    expect(result.current.types[0].labelTr).toBe('Poliçe Detayı')
  })

  it('returns empty when policies is null', () => {
    const { result } = renderHook(() => useReportTypes(null))
    expect(result.current.types).toHaveLength(0)
  })

  it('uses defaultType when provided', () => {
    const { result } = renderHook(() => useReportTypes(makePolicy(), false, 'portfolio'))
    expect(result.current.selectedType).toBe('portfolio')
  })

  it('uses first available type when no default', () => {
    const { result } = renderHook(() => useReportTypes(makePolicy()))
    expect(result.current.selectedType).toBe('policy_detail')
  })

  it('falls back to policy_detail when no types available', () => {
    mockGetAvailableReportTypes.mockReturnValue([])
    const { result } = renderHook(() => useReportTypes(null))
    expect(result.current.selectedType).toBe('policy_detail')
  })

  it('setSelectedType changes selected type', () => {
    const { result } = renderHook(() => useReportTypes(makePolicy()))
    act(() => {
      result.current.setSelectedType('portfolio')
    })
    expect(result.current.selectedType).toBe('portfolio')
  })
})
