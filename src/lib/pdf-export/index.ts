/**
 * PDF Export Module
 * Professional branded report generation
 */

// Branding
export {
  getSavedBranding,
  saveBranding,
  resetBranding,
  generateBrandingCSS,
  generateBaseStyles,
  generateHeaderHTML,
  generateFooterHTML,
  generateWatermarkHTML,
  getTheme,
  THEME_PROFESSIONAL,
  THEME_MODERN,
  THEME_CORPORATE,
} from './branding'

// Templates
export {
  generatePolicyDetailHTML,
  generateGapAnalysisHTML,
  generatePortfolioHTML,
  generatePolicySummaryHTML,
} from './templates'

// Generator
export {
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
