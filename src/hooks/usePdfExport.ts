/**
 * PDF Export Hooks
 * React hooks for generating and exporting branded PDF reports
 */

import { useState, useCallback, useMemo } from 'react'
import type { AnalyzedPolicy } from '@/types/policy'
import type { ComprehensiveGapAnalysis } from '@/types/gap'
import type {
  BrandingConfig,
  ReportOptions,
  ReportType,
  ReportGenerationResult,
} from '@/types/pdf-report'
import { DEFAULT_BRANDING, mergeBranding } from '@/types/pdf-report'
import {
  getSavedBranding,
  saveBranding,
  resetBranding,
  getTheme,
} from '@/lib/pdf-export/branding'
import {
  generatePolicyDetailReport,
  generateGapAnalysisReport,
  generatePortfolioReport,
  generatePolicySummaryReport,
  openPrintWindow,
  downloadHTML,
  getAvailableReportTypes,
} from '@/lib/pdf-export/generator'

// =============================================================================
// Branding Hook
// =============================================================================

interface UseBrandingResult {
  branding: BrandingConfig
  updateBranding: (updates: Partial<BrandingConfig>) => void
  resetToDefault: () => void
  applyTheme: (theme: 'professional' | 'modern' | 'corporate') => void
  setCompanyInfo: (info: {
    name?: string
    tagline?: string
    logoUrl?: string
    email?: string
    phone?: string
    website?: string
  }) => void
}

/**
 * Manage report branding configuration
 */
export function useBranding(): UseBrandingResult {
  const [branding, setBranding] = useState<BrandingConfig>(() => getSavedBranding())

  const updateBranding = useCallback((updates: Partial<BrandingConfig>) => {
    const newBranding = mergeBranding(branding, updates)
    setBranding(newBranding)
    saveBranding(newBranding)
  }, [branding])

  const resetToDefault = useCallback(() => {
    resetBranding()
    setBranding(DEFAULT_BRANDING)
  }, [])

  const applyTheme = useCallback((theme: 'professional' | 'modern' | 'corporate') => {
    const themeConfig = getTheme(theme)
    updateBranding(themeConfig)
  }, [updateBranding])

  const setCompanyInfo = useCallback((info: {
    name?: string
    tagline?: string
    logoUrl?: string
    email?: string
    phone?: string
    website?: string
  }) => {
    const updates: Partial<BrandingConfig> = {}

    if (info.name) updates.companyName = info.name
    if (info.tagline) updates.tagline = info.tagline
    if (info.logoUrl) updates.logo = { url: info.logoUrl }
    if (info.email || info.phone || info.website) {
      updates.contact = {
        ...branding.contact,
        email: info.email || branding.contact?.email,
        phone: info.phone || branding.contact?.phone,
        website: info.website || branding.contact?.website,
      }
    }

    updateBranding(updates)
  }, [branding, updateBranding])

  return {
    branding,
    updateBranding,
    resetToDefault,
    applyTheme,
    setCompanyInfo,
  }
}

// =============================================================================
// PDF Export Hook
// =============================================================================

interface UsePdfExportResult {
  isGenerating: boolean
  error: string | null
  lastResult: ReportGenerationResult | null

  // Export functions
  exportPolicy: (policy: AnalyzedPolicy, options?: Partial<ReportOptions>) => Promise<boolean>
  exportGapAnalysis: (
    policy: AnalyzedPolicy,
    gapAnalysis: ComprehensiveGapAnalysis,
    options?: Partial<ReportOptions>
  ) => Promise<boolean>
  exportPortfolio: (policies: AnalyzedPolicy[], options?: Partial<ReportOptions>) => Promise<boolean>
  exportSummary: (policies: AnalyzedPolicy[], options?: Partial<ReportOptions>) => Promise<boolean>

  // Download HTML
  downloadPolicyHTML: (policy: AnalyzedPolicy, options?: Partial<ReportOptions>) => void
  downloadPortfolioHTML: (policies: AnalyzedPolicy[], options?: Partial<ReportOptions>) => void

  // Utilities
  getAvailableTypes: (
    policies: AnalyzedPolicy | AnalyzedPolicy[],
    hasGapAnalysis?: boolean
  ) => ReportType[]
  clearError: () => void
}

/**
 * PDF export functionality hook
 */
export function usePdfExport(): UsePdfExportResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ReportGenerationResult | null>(null)

  const exportPolicy = useCallback(async (
    policy: AnalyzedPolicy,
    options: Partial<ReportOptions> = {}
  ): Promise<boolean> => {
    setIsGenerating(true)
    setError(null)

    try {
      const result = generatePolicyDetailReport(policy, options)
      setLastResult(result)

      if (!result.success || !result.html) {
        setError(result.error || 'Failed to generate report')
        return false
      }

      const printWindow = openPrintWindow(result.html)
      if (!printWindow) {
        setError('Please allow popups to export PDF')
        return false
      }

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
      return false
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const exportGapAnalysis = useCallback(async (
    policy: AnalyzedPolicy,
    gapAnalysis: ComprehensiveGapAnalysis,
    options: Partial<ReportOptions> = {}
  ): Promise<boolean> => {
    setIsGenerating(true)
    setError(null)

    try {
      const result = generateGapAnalysisReport(policy, gapAnalysis, options)
      setLastResult(result)

      if (!result.success || !result.html) {
        setError(result.error || 'Failed to generate report')
        return false
      }

      const printWindow = openPrintWindow(result.html)
      if (!printWindow) {
        setError('Please allow popups to export PDF')
        return false
      }

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
      return false
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const exportPortfolio = useCallback(async (
    policies: AnalyzedPolicy[],
    options: Partial<ReportOptions> = {}
  ): Promise<boolean> => {
    setIsGenerating(true)
    setError(null)

    try {
      const result = generatePortfolioReport(policies, options)
      setLastResult(result)

      if (!result.success || !result.html) {
        setError(result.error || 'Failed to generate report')
        return false
      }

      const printWindow = openPrintWindow(result.html)
      if (!printWindow) {
        setError('Please allow popups to export PDF')
        return false
      }

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
      return false
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const exportSummary = useCallback(async (
    policies: AnalyzedPolicy[],
    options: Partial<ReportOptions> = {}
  ): Promise<boolean> => {
    setIsGenerating(true)
    setError(null)

    try {
      const result = generatePolicySummaryReport(policies, options)
      setLastResult(result)

      if (!result.success || !result.html) {
        setError(result.error || 'Failed to generate report')
        return false
      }

      const printWindow = openPrintWindow(result.html)
      if (!printWindow) {
        setError('Please allow popups to export PDF')
        return false
      }

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
      return false
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const downloadPolicyHTML = useCallback((
    policy: AnalyzedPolicy,
    options: Partial<ReportOptions> = {}
  ) => {
    const result = generatePolicyDetailReport(policy, options)
    if (result.success && result.html) {
      downloadHTML(result.html, result.filename)
    }
  }, [])

  const downloadPortfolioHTML = useCallback((
    policies: AnalyzedPolicy[],
    options: Partial<ReportOptions> = {}
  ) => {
    const result = generatePortfolioReport(policies, options)
    if (result.success && result.html) {
      downloadHTML(result.html, result.filename)
    }
  }, [])

  const getAvailableTypes = useCallback((
    policies: AnalyzedPolicy | AnalyzedPolicy[],
    hasGapAnalysis = false
  ): ReportType[] => {
    return getAvailableReportTypes(policies, hasGapAnalysis)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isGenerating,
    error,
    lastResult,
    exportPolicy,
    exportGapAnalysis,
    exportPortfolio,
    exportSummary,
    downloadPolicyHTML,
    downloadPortfolioHTML,
    getAvailableTypes,
    clearError,
  }
}

// =============================================================================
// Quick Export Hook
// =============================================================================

interface UseQuickExportResult {
  exportToPDF: () => Promise<boolean>
  isExporting: boolean
  error: string | null
}

/**
 * Quick export for a single policy or list
 */
export function useQuickExport(
  policies: AnalyzedPolicy | AnalyzedPolicy[] | null,
  options: Partial<ReportOptions> = {}
): UseQuickExportResult {
  const { exportPolicy, exportPortfolio, isGenerating, error } = usePdfExport()

  const exportToPDF = useCallback(async (): Promise<boolean> => {
    if (!policies) return false

    if (Array.isArray(policies)) {
      if (policies.length === 0) return false
      if (policies.length === 1) {
        return exportPolicy(policies[0], options)
      }
      return exportPortfolio(policies, options)
    }

    return exportPolicy(policies, options)
  }, [policies, options, exportPolicy, exportPortfolio])

  return {
    exportToPDF,
    isExporting: isGenerating,
    error,
  }
}

// =============================================================================
// Report Preview Hook
// =============================================================================

interface UseReportPreviewResult {
  previewHTML: string | null
  isGenerating: boolean
  generatePreview: () => void
  clearPreview: () => void
}

/**
 * Generate report preview without printing
 */
export function useReportPreview(
  reportType: ReportType,
  policy?: AnalyzedPolicy,
  policies?: AnalyzedPolicy[],
  gapAnalysis?: ComprehensiveGapAnalysis,
  options: Partial<ReportOptions> = {}
): UseReportPreviewResult {
  const [previewHTML, setPreviewHTML] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const generatePreview = useCallback(() => {
    setIsGenerating(true)

    try {
      let result: ReportGenerationResult | null = null

      switch (reportType) {
        case 'policy_detail':
          if (policy) {
            result = generatePolicyDetailReport(policy, options, gapAnalysis)
          }
          break
        case 'gap_analysis':
          if (policy && gapAnalysis) {
            result = generateGapAnalysisReport(policy, gapAnalysis, options)
          }
          break
        case 'portfolio':
          if (policies) {
            result = generatePortfolioReport(policies, options)
          }
          break
        case 'policy_summary':
          if (policies) {
            result = generatePolicySummaryReport(policies, options)
          }
          break
      }

      if (result?.success && result.html) {
        setPreviewHTML(result.html)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [reportType, policy, policies, gapAnalysis, options])

  const clearPreview = useCallback(() => {
    setPreviewHTML(null)
  }, [])

  return {
    previewHTML,
    isGenerating,
    generatePreview,
    clearPreview,
  }
}

// =============================================================================
// Report Types Hook
// =============================================================================

interface UseReportTypesResult {
  types: { type: ReportType; label: string; labelTr: string }[]
  selectedType: ReportType
  setSelectedType: (type: ReportType) => void
}

/**
 * Manage report type selection
 */
export function useReportTypes(
  policies: AnalyzedPolicy | AnalyzedPolicy[] | null,
  hasGapAnalysis = false,
  defaultType?: ReportType
): UseReportTypesResult {
  const availableTypes = useMemo(() => {
    if (!policies) return []
    return getAvailableReportTypes(policies, hasGapAnalysis)
  }, [policies, hasGapAnalysis])

  const [selectedType, setSelectedType] = useState<ReportType>(
    defaultType || availableTypes[0] || 'policy_detail'
  )

  const types = useMemo(() => {
    const labels: Record<ReportType, { label: string; labelTr: string }> = {
      policy_detail: { label: 'Policy Detail', labelTr: 'Poliçe Detayı' },
      policy_summary: { label: 'Policy Summary', labelTr: 'Poliçe Özeti' },
      gap_analysis: { label: 'Gap Analysis', labelTr: 'Açık Analizi' },
      comparison: { label: 'Comparison', labelTr: 'Karşılaştırma' },
      portfolio: { label: 'Portfolio', labelTr: 'Portföy' },
      executive_summary: { label: 'Executive Summary', labelTr: 'Yönetici Özeti' },
      renewal_reminder: { label: 'Renewal Reminder', labelTr: 'Yenileme Hatırlatması' },
    }

    return availableTypes.map(type => ({
      type,
      ...labels[type],
    }))
  }, [availableTypes])

  return {
    types,
    selectedType,
    setSelectedType,
  }
}
