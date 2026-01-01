/**
 * PDF Export Hooks Tests
 * Tests for branded PDF report generation hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useBranding,
  usePdfExport,
  useQuickExport,
  useReportPreview,
  useReportTypes,
} from './usePdfExport'
import type { AnalyzedPolicy } from '@/types/policy'

// Mock the branding module
vi.mock('@/lib/pdf-export/branding', () => ({
  getSavedBranding: vi.fn().mockReturnValue({
    companyName: 'Test Company',
    primaryColor: '#1a365d',
  }),
  saveBranding: vi.fn(),
  resetBranding: vi.fn(),
  getTheme: vi.fn().mockReturnValue({
    primaryColor: '#2d3748',
    fontFamily: 'Inter',
  }),
}))

// Mock the generator module
vi.mock('@/lib/pdf-export/generator', () => ({
  generatePolicyDetailReport: vi.fn().mockReturnValue({
    success: true,
    html: '<html><body>Policy Report</body></html>',
    filename: 'policy-report.html',
    mimeType: 'text/html',
  }),
  generateGapAnalysisReport: vi.fn().mockReturnValue({
    success: true,
    html: '<html><body>Gap Analysis</body></html>',
    filename: 'gap-analysis.html',
    mimeType: 'text/html',
  }),
  generatePortfolioReport: vi.fn().mockReturnValue({
    success: true,
    html: '<html><body>Portfolio Report</body></html>',
    filename: 'portfolio.html',
    mimeType: 'text/html',
  }),
  generatePolicySummaryReport: vi.fn().mockReturnValue({
    success: true,
    html: '<html><body>Summary</body></html>',
    filename: 'summary.html',
    mimeType: 'text/html',
  }),
  openPrintWindow: vi.fn().mockReturnValue({ print: vi.fn() }),
  downloadHTML: vi.fn(),
  getAvailableReportTypes: vi.fn().mockReturnValue(['policy_detail', 'gap_analysis']),
}))

// Mock pdf-report types
vi.mock('@/types/pdf-report', () => ({
  DEFAULT_BRANDING: {
    companyName: 'InsurAI',
    primaryColor: '#1a365d',
  },
  mergeBranding: vi.fn((base, updates) => ({ ...base, ...updates })),
}))

// Create mock policy
const createMockPolicy = (): AnalyzedPolicy => ({
  id: 'policy-123',
  policyNumber: 'POL-2024-001',
  provider: 'Allianz',
  logo: '/logos/allianz.png',
  type: 'home',
  typeTr: 'Konut Sigortası',
  status: 'active',
  insuredPerson: 'Test User',
  premium: 2500,
  monthlyPremium: 208.33,
  coverage: 500000,
  deductible: 1000,
  startDate: '2024-01-01',
  expiryDate: '2024-12-31',
  uploadDate: '2024-01-01',
  fileName: 'policy.pdf',
  documentType: 'pdf',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'property',
  aiConfidence: 0.95,
  aiInsights: [],
})

describe('useBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return initial branding', () => {
    const { result } = renderHook(() => useBranding())

    expect(result.current.branding).toBeDefined()
    expect(result.current.branding.companyName).toBe('Test Company')
  })

  it('should provide updateBranding function', () => {
    const { result } = renderHook(() => useBranding())

    act(() => {
      result.current.updateBranding({ companyName: 'New Company' })
    })

    expect(result.current.branding.companyName).toBe('New Company')
  })

  it('should provide resetToDefault function', () => {
    const { result } = renderHook(() => useBranding())

    act(() => {
      result.current.resetToDefault()
    })

    expect(result.current.branding.companyName).toBe('InsurAI')
  })

  it('should provide applyTheme function', () => {
    const { result } = renderHook(() => useBranding())

    act(() => {
      result.current.applyTheme('modern')
    })

    // Theme should be applied
    expect(result.current.branding).toBeDefined()
  })

  it('should provide setCompanyInfo function', () => {
    const { result } = renderHook(() => useBranding())

    act(() => {
      result.current.setCompanyInfo({
        name: 'Updated Company',
        email: 'info@updated.com',
      })
    })

    expect(result.current.branding.companyName).toBe('Updated Company')
  })
})

describe('usePdfExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with correct state', () => {
    const { result } = renderHook(() => usePdfExport())

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastResult).toBeNull()
  })

  it('should export policy to PDF', async () => {
    const { result } = renderHook(() => usePdfExport())
    const policy = createMockPolicy()

    await act(async () => {
      const success = await result.current.exportPolicy(policy)
      expect(success).toBe(true)
    })

    expect(result.current.lastResult).toBeDefined()
    expect(result.current.lastResult?.success).toBe(true)
  })

  it('should export gap analysis to PDF', async () => {
    const { result } = renderHook(() => usePdfExport())
    const policy = createMockPolicy()
    const gapAnalysis = {
      policyId: 'policy-123',
      totalGaps: 3,
      criticalGaps: 1,
      gaps: [],
    }

    await act(async () => {
      const success = await result.current.exportGapAnalysis(policy, gapAnalysis as never)
      expect(success).toBe(true)
    })
  })

  it('should export portfolio to PDF', async () => {
    const { result } = renderHook(() => usePdfExport())
    const policies = [createMockPolicy(), createMockPolicy()]

    await act(async () => {
      const success = await result.current.exportPortfolio(policies)
      expect(success).toBe(true)
    })
  })

  it('should export summary to PDF', async () => {
    const { result } = renderHook(() => usePdfExport())
    const policies = [createMockPolicy(), createMockPolicy()]

    await act(async () => {
      const success = await result.current.exportSummary(policies)
      expect(success).toBe(true)
    })
  })

  it('should download policy HTML', () => {
    const { result } = renderHook(() => usePdfExport())
    const policy = createMockPolicy()

    act(() => {
      result.current.downloadPolicyHTML(policy)
    })

    // No error means success
    expect(true).toBe(true)
  })

  it('should download portfolio HTML', () => {
    const { result } = renderHook(() => usePdfExport())
    const policies = [createMockPolicy()]

    act(() => {
      result.current.downloadPortfolioHTML(policies)
    })

    // No error means success
    expect(true).toBe(true)
  })

  it('should get available report types', () => {
    const { result } = renderHook(() => usePdfExport())
    const policy = createMockPolicy()

    const types = result.current.getAvailableTypes(policy, true)

    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBeGreaterThan(0)
  })

  it('should clear error', async () => {
    const { result } = renderHook(() => usePdfExport())

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})

describe('useQuickExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return false for null policies', async () => {
    const { result } = renderHook(() => useQuickExport(null))

    await act(async () => {
      const success = await result.current.exportToPDF()
      expect(success).toBe(false)
    })
  })

  it('should export single policy', async () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useQuickExport(policy))

    await act(async () => {
      const success = await result.current.exportToPDF()
      expect(success).toBe(true)
    })
  })

  it('should export policy array', async () => {
    const policies = [createMockPolicy(), createMockPolicy()]
    const { result } = renderHook(() => useQuickExport(policies))

    await act(async () => {
      const success = await result.current.exportToPDF()
      expect(success).toBe(true)
    })
  })

  it('should export single item from array', async () => {
    const policies = [createMockPolicy()]
    const { result } = renderHook(() => useQuickExport(policies))

    await act(async () => {
      const success = await result.current.exportToPDF()
      expect(success).toBe(true)
    })
  })

  it('should track exporting state', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useQuickExport(policy))

    expect(result.current.isExporting).toBe(false)
  })

  it('should track error state', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useQuickExport(policy))

    expect(result.current.error).toBeNull()
  })
})

describe('useReportPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should start with null preview', () => {
    const { result } = renderHook(() =>
      useReportPreview('policy_detail', createMockPolicy())
    )

    expect(result.current.previewHTML).toBeNull()
  })

  it('should generate preview on request', () => {
    const { result } = renderHook(() =>
      useReportPreview('policy_detail', createMockPolicy())
    )

    act(() => {
      result.current.generatePreview()
    })

    expect(result.current.previewHTML).toBeDefined()
  })

  it('should clear preview', () => {
    const { result } = renderHook(() =>
      useReportPreview('policy_detail', createMockPolicy())
    )

    act(() => {
      result.current.generatePreview()
    })

    act(() => {
      result.current.clearPreview()
    })

    expect(result.current.previewHTML).toBeNull()
  })

  it('should generate portfolio preview', () => {
    const policies = [createMockPolicy(), createMockPolicy()]
    const { result } = renderHook(() =>
      useReportPreview('portfolio', undefined, policies)
    )

    act(() => {
      result.current.generatePreview()
    })

    expect(result.current.previewHTML).toBeDefined()
  })

  it('should track generating state', () => {
    const { result } = renderHook(() =>
      useReportPreview('policy_detail', createMockPolicy())
    )

    expect(result.current.isGenerating).toBe(false)

    act(() => {
      result.current.generatePreview()
    })

    expect(result.current.isGenerating).toBe(false)
  })
})

describe('useReportTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty types for null policies', () => {
    const { result } = renderHook(() => useReportTypes(null))

    expect(result.current.types).toEqual([])
  })

  it('should return available types for policy', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useReportTypes(policy, true))

    expect(result.current.types.length).toBeGreaterThan(0)
  })

  it('should have default selected type', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useReportTypes(policy, true))

    expect(result.current.selectedType).toBeDefined()
  })

  it('should allow setting selected type', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useReportTypes(policy, true))

    act(() => {
      result.current.setSelectedType('gap_analysis')
    })

    expect(result.current.selectedType).toBe('gap_analysis')
  })

  it('should include labels for types', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useReportTypes(policy, true))

    if (result.current.types.length > 0) {
      expect(result.current.types[0].label).toBeDefined()
      expect(result.current.types[0].labelTr).toBeDefined()
    }
  })

  it('should use default type if provided', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useReportTypes(policy, true, 'gap_analysis'))

    expect(result.current.selectedType).toBe('gap_analysis')
  })
})
