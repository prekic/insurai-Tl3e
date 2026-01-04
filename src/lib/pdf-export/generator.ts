/**
 * PDF Report Generator
 * Main service for generating branded PDF reports
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type { ComprehensiveGapAnalysis } from '@/types/gap'
import type {
  ReportOptions,
  ReportType,
  ReportGenerationResult,
  PolicyDetailReportData,
  GapAnalysisReportData,
  PortfolioReportData,
} from '@/types/pdf-report'
import {
  DEFAULT_SECTIONS,
  mergeBranding,
  generateReportFilename,
} from '@/types/pdf-report'
import { getSavedBranding } from './branding'
import {
  generatePolicyDetailHTML,
  generateGapAnalysisHTML,
  generatePortfolioHTML,
  generatePolicySummaryHTML,
} from './templates'

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generate a policy detail report
 */
export function generatePolicyDetailReport(
  policy: AnalyzedPolicy,
  options: Partial<ReportOptions> = {},
  gapAnalysis?: ComprehensiveGapAnalysis
): ReportGenerationResult {
  try {
    const branding = mergeBranding(getSavedBranding(), options.branding)
    const fullOptions: ReportOptions = {
      type: 'policy_detail',
      format: 'pdf',
      language: 'tr',
      sections: DEFAULT_SECTIONS.policy_detail,
      ...options,
    }

    const data: PolicyDetailReportData = {
      policy,
      gapAnalysis,
      marketBenchmark: policy.marketComparison ? {
        avgPremium: policy.marketComparison.averagePremium,
        avgCoverage: policy.marketComparison.averageCoverage,
        percentile: policy.marketComparison.percentile,
      } : undefined,
    }

    const html = generatePolicyDetailHTML(data, branding, fullOptions)

    return {
      success: true,
      html,
      filename: generateReportFilename('policy_detail', policy.policyNumber),
      mimeType: 'text/html',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
      filename: '',
      mimeType: '',
    }
  }
}

/**
 * Generate a gap analysis report
 */
export function generateGapAnalysisReport(
  policy: AnalyzedPolicy,
  gapAnalysis: ComprehensiveGapAnalysis,
  options: Partial<ReportOptions> = {}
): ReportGenerationResult {
  try {
    const branding = mergeBranding(getSavedBranding(), options.branding)
    const fullOptions: ReportOptions = {
      type: 'gap_analysis',
      format: 'pdf',
      language: 'tr',
      sections: DEFAULT_SECTIONS.gap_analysis,
      ...options,
    }

    const data: GapAnalysisReportData = {
      policy,
      gapAnalysis,
      recommendations: gapAnalysis.topRecommendations?.map((r, idx) => ({
        priority: idx + 1,
        action: r.title,
        actionTr: r.titleTr,
        impact: r.description,
        impactTr: r.descriptionTr,
        estimatedCost: r.estimatedCost,
      })),
    }

    const html = generateGapAnalysisHTML(data, branding, fullOptions)

    return {
      success: true,
      html,
      filename: generateReportFilename('gap_analysis', policy.policyNumber),
      mimeType: 'text/html',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
      filename: '',
      mimeType: '',
    }
  }
}

/**
 * Generate a portfolio report
 */
export function generatePortfolioReport(
  policies: AnalyzedPolicy[],
  options: Partial<ReportOptions> = {}
): ReportGenerationResult {
  try {
    const branding = mergeBranding(getSavedBranding(), options.branding)
    const fullOptions: ReportOptions = {
      type: 'portfolio',
      format: 'pdf',
      language: 'tr',
      sections: DEFAULT_SECTIONS.portfolio,
      ...options,
    }

    // Calculate summary stats
    const summary = {
      totalPolicies: policies.length,
      activePolicies: policies.filter(p => p.status === 'active').length,
      expiringPolicies: policies.filter(p => p.status === 'expiring').length,
      totalCoverage: policies.reduce((sum, p) => sum + p.coverage, 0),
      totalPremium: policies.reduce((sum, p) => sum + p.premium, 0),
      avgRiskScore: policies.reduce((sum, p) => sum + (p.riskScore?.overall || 50), 0) / policies.length,
      criticalGaps: policies.reduce((sum, p) => sum + (p.gapAnalysis?.criticalCount || 0), 0),
    }

    // Group by type
    const byType = policies.reduce((acc, p) => {
      if (!acc[p.type]) {
        acc[p.type] = { count: 0, totalCoverage: 0, totalPremium: 0 }
      }
      acc[p.type].count++
      acc[p.type].totalCoverage += p.coverage
      acc[p.type].totalPremium += p.premium
      return acc
    }, {} as PortfolioReportData['byType'])

    // Gap summary if available
    const gapSummary = summary.criticalGaps > 0 ? {
      totalGaps: policies.reduce((sum, p) => sum + (p.gapAnalysis?.totalCount || 0), 0),
      criticalGaps: summary.criticalGaps,
      estimatedExposure: policies.reduce((sum, p) => sum + (p.gapAnalysis?.financialExposure || 0), 0),
      topIssues: policies
        .filter(p => p.gapAnalysis?.topIssue)
        .map(p => p.gapAnalysis?.topIssue as string)
        .slice(0, 5),
    } : undefined

    const data: PortfolioReportData = {
      policies,
      summary,
      byType,
      timeline: [],
      gapSummary,
    }

    const html = generatePortfolioHTML(data, branding, fullOptions)

    return {
      success: true,
      html,
      filename: generateReportFilename('portfolio'),
      mimeType: 'text/html',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
      filename: '',
      mimeType: '',
    }
  }
}

/**
 * Generate a policy summary report
 */
export function generatePolicySummaryReport(
  policies: AnalyzedPolicy[],
  options: Partial<ReportOptions> = {}
): ReportGenerationResult {
  try {
    const branding = mergeBranding(getSavedBranding(), options.branding)
    const fullOptions: ReportOptions = {
      type: 'policy_summary',
      format: 'pdf',
      language: 'tr',
      sections: DEFAULT_SECTIONS.policy_summary,
      ...options,
    }

    const html = generatePolicySummaryHTML(policies, branding, fullOptions)

    return {
      success: true,
      html,
      filename: generateReportFilename('policy_summary'),
      mimeType: 'text/html',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
      filename: '',
      mimeType: '',
    }
  }
}

// =============================================================================
// Print / Export Utilities
// =============================================================================

/**
 * Open HTML content in a new window for printing
 */
export function openPrintWindow(html: string): Window | null {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    return null
  }

  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for content to load then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  return printWindow
}

/**
 * Download HTML as a file
 */
export function downloadHTML(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.html`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export policy detail to PDF
 */
export function exportPolicyToPDF(
  policy: AnalyzedPolicy,
  options: Partial<ReportOptions> = {}
): boolean {
  const result = generatePolicyDetailReport(policy, options)
  if (!result.success || !result.html) {
    return false
  }

  const printWindow = openPrintWindow(result.html)
  return printWindow !== null
}

/**
 * Export gap analysis to PDF
 */
export function exportGapAnalysisToPDF(
  policy: AnalyzedPolicy,
  gapAnalysis: ComprehensiveGapAnalysis,
  options: Partial<ReportOptions> = {}
): boolean {
  const result = generateGapAnalysisReport(policy, gapAnalysis, options)
  if (!result.success || !result.html) {
    return false
  }

  const printWindow = openPrintWindow(result.html)
  return printWindow !== null
}

/**
 * Export portfolio to PDF
 */
export function exportPortfolioToPDF(
  policies: AnalyzedPolicy[],
  options: Partial<ReportOptions> = {}
): boolean {
  const result = generatePortfolioReport(policies, options)
  if (!result.success || !result.html) {
    return false
  }

  const printWindow = openPrintWindow(result.html)
  return printWindow !== null
}

/**
 * Export policy summary to PDF
 */
export function exportPolicySummaryToPDF(
  policies: AnalyzedPolicy[],
  options: Partial<ReportOptions> = {}
): boolean {
  const result = generatePolicySummaryReport(policies, options)
  if (!result.success || !result.html) {
    return false
  }

  const printWindow = openPrintWindow(result.html)
  return printWindow !== null
}

// =============================================================================
// Quick Export Functions
// =============================================================================

/**
 * Quick export - automatically selects best report type based on data
 */
export function quickExport(
  policies: AnalyzedPolicy | AnalyzedPolicy[],
  options: Partial<ReportOptions> = {}
): boolean {
  if (Array.isArray(policies)) {
    if (policies.length === 1) {
      return exportPolicyToPDF(policies[0], options)
    }
    return exportPortfolioToPDF(policies, options)
  }
  return exportPolicyToPDF(policies, options)
}

/**
 * Get available report types for given data
 */
export function getAvailableReportTypes(
  policies: AnalyzedPolicy | AnalyzedPolicy[],
  hasGapAnalysis = false
): ReportType[] {
  const types: ReportType[] = []

  if (Array.isArray(policies)) {
    types.push('policy_summary', 'portfolio')
    if (policies.length === 2) {
      types.push('comparison')
    }
  } else {
    types.push('policy_detail')
    if (hasGapAnalysis) {
      types.push('gap_analysis')
    }
  }

  types.push('executive_summary')

  return types
}
