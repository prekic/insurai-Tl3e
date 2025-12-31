/**
 * PDF Report Export Types
 * Professional branded report generation
 */

import type { PolicyType, AnalyzedPolicy } from './policy'
import type { ComprehensiveGapAnalysis } from './gap'

// =============================================================================
// Branding Configuration
// =============================================================================

/**
 * Company branding settings
 */
export interface BrandingConfig {
  // Company identity
  companyName: string
  companyNameTr?: string
  tagline?: string
  taglineTr?: string

  // Logo
  logo?: {
    url: string
    width?: number
    height?: number
    position?: 'left' | 'center' | 'right'
  }

  // Colors
  colors: {
    primary: string      // Main brand color
    secondary: string    // Accent color
    text: string         // Body text color
    textLight: string    // Secondary text
    background: string   // Background color
    accent: string       // Highlights/CTAs
    success: string      // Positive indicators
    warning: string      // Warning indicators
    danger: string       // Critical indicators
  }

  // Typography
  fonts?: {
    heading: string
    body: string
  }

  // Contact information
  contact?: {
    email?: string
    phone?: string
    website?: string
    address?: string
  }

  // Footer
  footer?: {
    text?: string
    textTr?: string
    showPageNumbers?: boolean
    showDate?: boolean
    showDisclaimer?: boolean
    disclaimer?: string
    disclaimerTr?: string
  }

  // Watermark
  watermark?: {
    enabled: boolean
    text?: string
    opacity?: number
  }
}

/**
 * Default InsurAI branding
 */
export const DEFAULT_BRANDING: BrandingConfig = {
  companyName: 'InsurAI',
  tagline: 'Intelligent Insurance Analysis',
  taglineTr: 'Akıllı Sigorta Analizi',
  colors: {
    primary: '#3b82f6',     // Blue-500
    secondary: '#1e40af',   // Blue-800
    text: '#1a1a1a',
    textLight: '#6b7280',
    background: '#ffffff',
    accent: '#0ea5e9',      // Sky-500
    success: '#22c55e',     // Green-500
    warning: '#f59e0b',     // Amber-500
    danger: '#ef4444',      // Red-500
  },
  fonts: {
    heading: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  footer: {
    showPageNumbers: true,
    showDate: true,
    showDisclaimer: true,
    disclaimer: 'This report is for informational purposes only. Please refer to your original policy documents for official terms and conditions.',
    disclaimerTr: 'Bu rapor yalnızca bilgilendirme amaçlıdır. Resmi şartlar ve koşullar için lütfen orijinal poliçe belgelerinize başvurun.',
  },
}

// =============================================================================
// Report Types
// =============================================================================

/**
 * Types of reports that can be generated
 */
export type ReportType =
  | 'policy_detail'      // Single policy detailed report
  | 'policy_summary'     // Multiple policies overview
  | 'gap_analysis'       // Gap analysis report
  | 'comparison'         // Policy comparison report
  | 'portfolio'          // Full portfolio analysis
  | 'executive_summary'  // High-level executive brief
  | 'renewal_reminder'   // Renewal notification

/**
 * Report format options
 */
export type ReportFormat = 'pdf' | 'html'

/**
 * Report language
 */
export type ReportLanguage = 'en' | 'tr' | 'bilingual'

// =============================================================================
// Report Configuration
// =============================================================================

/**
 * Report generation options
 */
export interface ReportOptions {
  // Type and format
  type: ReportType
  format?: ReportFormat
  language?: ReportLanguage

  // Content options
  title?: string
  titleTr?: string
  subtitle?: string
  subtitleTr?: string

  // Sections to include
  sections?: ReportSectionConfig

  // Branding
  branding?: Partial<BrandingConfig>

  // Layout
  layout?: {
    orientation?: 'portrait' | 'landscape'
    pageSize?: 'a4' | 'letter'
    margins?: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }

  // Metadata
  generatedBy?: string
  generatedFor?: string
  confidential?: boolean
  expiresAt?: string
}

/**
 * Report section configuration
 */
export interface ReportSectionConfig {
  // Policy details
  showPolicyDetails?: boolean
  showCoverages?: boolean
  showExclusions?: boolean
  showSpecialConditions?: boolean

  // Analysis
  showGapAnalysis?: boolean
  showRiskScore?: boolean
  showMarketComparison?: boolean
  showRecommendations?: boolean

  // Financial
  showPremiumBreakdown?: boolean
  showCostSavings?: boolean

  // Visuals
  showCharts?: boolean
  showTimeline?: boolean

  // Additional
  showAiInsights?: boolean
  showGlossary?: boolean
  showNextSteps?: boolean
}

/**
 * Default report sections by type
 */
export const DEFAULT_SECTIONS: Record<ReportType, ReportSectionConfig> = {
  policy_detail: {
    showPolicyDetails: true,
    showCoverages: true,
    showExclusions: true,
    showSpecialConditions: true,
    showRiskScore: true,
    showAiInsights: true,
  },
  policy_summary: {
    showPolicyDetails: true,
    showCoverages: true,
    showCharts: true,
  },
  gap_analysis: {
    showPolicyDetails: true,
    showCoverages: true,
    showGapAnalysis: true,
    showRiskScore: true,
    showRecommendations: true,
    showNextSteps: true,
  },
  comparison: {
    showPolicyDetails: true,
    showCoverages: true,
    showMarketComparison: true,
    showCharts: true,
    showRecommendations: true,
  },
  portfolio: {
    showPolicyDetails: true,
    showCoverages: true,
    showGapAnalysis: true,
    showRiskScore: true,
    showCharts: true,
    showTimeline: true,
    showRecommendations: true,
    showNextSteps: true,
  },
  executive_summary: {
    showPolicyDetails: true,
    showRiskScore: true,
    showCharts: true,
    showRecommendations: true,
  },
  renewal_reminder: {
    showPolicyDetails: true,
    showCoverages: true,
    showNextSteps: true,
  },
}

// =============================================================================
// Report Content
// =============================================================================

/**
 * Content for a report section
 */
export interface ReportSection {
  id: string
  title: string
  titleTr: string
  content: string  // HTML content
  pageBreakBefore?: boolean
  pageBreakAfter?: boolean
}

/**
 * Complete report structure
 */
export interface Report {
  // Metadata
  id: string
  type: ReportType
  generatedAt: string
  expiresAt?: string

  // Header
  title: string
  titleTr: string
  subtitle?: string
  subtitleTr?: string

  // Content
  sections: ReportSection[]

  // Summary
  executiveSummary?: {
    keyFindings: string[]
    keyFindingsTr: string[]
    recommendations: string[]
    recommendationsTr: string[]
  }

  // Data references
  policies?: AnalyzedPolicy[]
  gapAnalysis?: ComprehensiveGapAnalysis

  // Branding
  branding: BrandingConfig

  // Options used
  options: ReportOptions
}

// =============================================================================
// Report Data Inputs
// =============================================================================

/**
 * Input data for policy detail report
 */
export interface PolicyDetailReportData {
  policy: AnalyzedPolicy
  gapAnalysis?: ComprehensiveGapAnalysis
  marketBenchmark?: {
    avgPremium: number
    avgCoverage: number
    percentile: number
  }
}

/**
 * Input data for gap analysis report
 */
export interface GapAnalysisReportData {
  policy: AnalyzedPolicy
  gapAnalysis: ComprehensiveGapAnalysis
  recommendations?: {
    priority: number
    action: string
    actionTr: string
    impact: string
    impactTr: string
    estimatedCost?: number
  }[]
}

/**
 * Input data for comparison report
 */
export interface ComparisonReportData {
  policies: AnalyzedPolicy[]
  comparisonMetrics: {
    metric: string
    metricTr: string
    values: (string | number)[]
    winner?: number  // Index of winning policy
    notes?: string
  }[]
}

/**
 * Input data for portfolio report
 */
export interface PortfolioReportData {
  policies: AnalyzedPolicy[]
  summary: {
    totalPolicies: number
    activePolicies: number
    expiringPolicies: number
    totalCoverage: number
    totalPremium: number
    avgRiskScore: number
    criticalGaps: number
  }
  byType: Record<PolicyType, {
    count: number
    totalCoverage: number
    totalPremium: number
  }>
  timeline: {
    date: string
    event: string
    eventTr: string
    policyId: string
  }[]
  gapSummary?: {
    totalGaps: number
    criticalGaps: number
    estimatedExposure: number
    topIssues: string[]
  }
}

// =============================================================================
// Export Results
// =============================================================================

/**
 * Result of report generation
 */
export interface ReportGenerationResult {
  success: boolean
  report?: Report
  html?: string
  error?: string

  // Download info
  filename: string
  mimeType: string
  size?: number
}

// =============================================================================
// Template Helpers
// =============================================================================

/**
 * Severity indicator styles
 */
export const SEVERITY_STYLES = {
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  high: { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  medium: { bg: '#fef9c3', text: '#854d0e', border: '#fde68a' },
  low: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  info: { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
} as const

/**
 * Status styles
 */
export const STATUS_STYLES = {
  active: { bg: '#dcfce7', text: '#166534' },
  expiring: { bg: '#fef9c3', text: '#854d0e' },
  expired: { bg: '#fee2e2', text: '#991b1b' },
  pending: { bg: '#e0e7ff', text: '#3730a3' },
} as const

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get report type label
 */
export function getReportTypeLabel(type: ReportType, turkish = false): string {
  const labels: Record<ReportType, { en: string; tr: string }> = {
    policy_detail: { en: 'Policy Detail Report', tr: 'Poliçe Detay Raporu' },
    policy_summary: { en: 'Policy Summary', tr: 'Poliçe Özeti' },
    gap_analysis: { en: 'Gap Analysis Report', tr: 'Teminat Açığı Analiz Raporu' },
    comparison: { en: 'Policy Comparison', tr: 'Poliçe Karşılaştırması' },
    portfolio: { en: 'Portfolio Analysis', tr: 'Portföy Analizi' },
    executive_summary: { en: 'Executive Summary', tr: 'Yönetici Özeti' },
    renewal_reminder: { en: 'Renewal Reminder', tr: 'Yenileme Hatırlatması' },
  }
  return turkish ? labels[type].tr : labels[type].en
}

/**
 * Generate report filename
 */
export function generateReportFilename(
  type: ReportType,
  identifier?: string,
  date?: Date
): string {
  const dateStr = (date || new Date()).toISOString().split('T')[0]
  const typeSlug = type.replace(/_/g, '-')
  const idSlug = identifier?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || ''

  return `insurai-${typeSlug}${idSlug ? `-${idSlug}` : ''}-${dateStr}`
}

/**
 * Merge branding configs
 */
export function mergeBranding(
  base: BrandingConfig,
  overrides?: Partial<BrandingConfig>
): BrandingConfig {
  if (!overrides) return base

  return {
    ...base,
    ...overrides,
    colors: { ...base.colors, ...overrides.colors },
    fonts: base.fonts || overrides.fonts ? {
      heading: overrides.fonts?.heading || base.fonts?.heading || 'inherit',
      body: overrides.fonts?.body || base.fonts?.body || 'inherit',
    } : undefined,
    contact: { ...base.contact, ...overrides.contact },
    footer: { ...base.footer, ...overrides.footer },
    logo: overrides.logo || base.logo,
    watermark: overrides.watermark || base.watermark,
  }
}
