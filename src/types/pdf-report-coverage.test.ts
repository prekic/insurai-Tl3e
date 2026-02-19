/**
 * Comprehensive coverage tests for pdf-report.ts
 * Targets: uncovered branches in getReportTypeLabel, generateReportFilename, mergeBranding
 * Also covers constants: DEFAULT_BRANDING, DEFAULT_SECTIONS, SEVERITY_STYLES, STATUS_STYLES
 */

import { describe, it, expect } from 'vitest'
import {
  getReportTypeLabel,
  generateReportFilename,
  mergeBranding,
  DEFAULT_BRANDING,
  DEFAULT_SECTIONS,
  SEVERITY_STYLES,
  STATUS_STYLES,
} from './pdf-report'
import type { BrandingConfig, ReportType } from './pdf-report'

describe('pdf-report coverage', () => {
  describe('getReportTypeLabel', () => {
    const reportTypes: ReportType[] = [
      'policy_detail',
      'policy_summary',
      'gap_analysis',
      'comparison',
      'portfolio',
      'executive_summary',
      'renewal_reminder',
    ]

    it('should return English labels by default', () => {
      expect(getReportTypeLabel('policy_detail')).toBe('Policy Detail Report')
      expect(getReportTypeLabel('policy_summary')).toBe('Policy Summary')
      expect(getReportTypeLabel('gap_analysis')).toBe('Gap Analysis Report')
      expect(getReportTypeLabel('comparison')).toBe('Policy Comparison')
      expect(getReportTypeLabel('portfolio')).toBe('Portfolio Analysis')
      expect(getReportTypeLabel('executive_summary')).toBe('Executive Summary')
      expect(getReportTypeLabel('renewal_reminder')).toBe('Renewal Reminder')
    })

    it('should return Turkish labels when turkish=true', () => {
      expect(getReportTypeLabel('policy_detail', true)).toBe('Poliçe Detay Raporu')
      expect(getReportTypeLabel('policy_summary', true)).toBe('Poliçe Özeti')
      expect(getReportTypeLabel('gap_analysis', true)).toBe('Teminat Açığı Analiz Raporu')
      expect(getReportTypeLabel('comparison', true)).toBe('Poliçe Karşılaştırması')
      expect(getReportTypeLabel('portfolio', true)).toBe('Portföy Analizi')
      expect(getReportTypeLabel('executive_summary', true)).toBe('Yönetici Özeti')
      expect(getReportTypeLabel('renewal_reminder', true)).toBe('Yenileme Hatırlatması')
    })

    it('should return English when turkish=false', () => {
      for (const type of reportTypes) {
        const label = getReportTypeLabel(type, false)
        expect(label).toBeTruthy()
        expect(typeof label).toBe('string')
      }
    })

    it('should return non-empty labels for all types', () => {
      for (const type of reportTypes) {
        expect(getReportTypeLabel(type).length).toBeGreaterThan(0)
        expect(getReportTypeLabel(type, true).length).toBeGreaterThan(0)
      }
    })
  })

  describe('generateReportFilename', () => {
    it('should generate filename with type only', () => {
      const filename = generateReportFilename('policy_detail', undefined, new Date('2026-03-15'))
      expect(filename).toBe('insurai-policy-detail-2026-03-15')
    })

    it('should generate filename with identifier', () => {
      const filename = generateReportFilename('gap_analysis', 'POL-123', new Date('2026-03-15'))
      expect(filename).toBe('insurai-gap-analysis-pol-123-2026-03-15')
    })

    it('should use current date when no date provided', () => {
      const filename = generateReportFilename('comparison')
      const today = new Date().toISOString().split('T')[0]
      expect(filename).toContain(today)
      expect(filename.startsWith('insurai-comparison-')).toBe(true)
    })

    it('should sanitize identifier with special chars', () => {
      const filename = generateReportFilename('portfolio', 'Poliçe #123/A', new Date('2026-01-01'))
      expect(filename).toBe('insurai-portfolio-poli-e--123-a-2026-01-01')
    })

    it('should lowercase identifier', () => {
      const filename = generateReportFilename('policy_summary', 'ABC-DEF', new Date('2026-01-01'))
      expect(filename).toBe('insurai-policy-summary-abc-def-2026-01-01')
    })

    it('should replace underscores with hyphens in type', () => {
      const filename = generateReportFilename('executive_summary', undefined, new Date('2026-01-01'))
      expect(filename).toBe('insurai-executive-summary-2026-01-01')
    })

    it('should handle empty identifier', () => {
      const filename = generateReportFilename('renewal_reminder', '', new Date('2026-01-01'))
      expect(filename).toBe('insurai-renewal-reminder-2026-01-01')
    })

    it('should handle all report types', () => {
      const types: ReportType[] = ['policy_detail', 'policy_summary', 'gap_analysis', 'comparison', 'portfolio', 'executive_summary', 'renewal_reminder']
      for (const type of types) {
        const filename = generateReportFilename(type, undefined, new Date('2026-01-01'))
        expect(filename.startsWith('insurai-')).toBe(true)
        expect(filename.endsWith('-2026-01-01')).toBe(true)
      }
    })
  })

  describe('mergeBranding', () => {
    const baseBranding: BrandingConfig = {
      companyName: 'Base Company',
      colors: {
        primary: '#000000',
        secondary: '#111111',
        text: '#222222',
        textLight: '#333333',
        background: '#ffffff',
        accent: '#444444',
        success: '#555555',
        warning: '#666666',
        danger: '#777777',
      },
      fonts: {
        heading: 'Arial',
        body: 'Verdana',
      },
      contact: {
        email: 'base@test.com',
        phone: '123',
      },
      footer: {
        text: 'Base footer',
        showPageNumbers: true,
      },
      logo: {
        url: 'base-logo.png',
        width: 100,
      },
      watermark: {
        enabled: true,
        text: 'Base Watermark',
      },
    }

    it('should return base when no overrides', () => {
      const result = mergeBranding(baseBranding)
      expect(result).toBe(baseBranding)
    })

    it('should return base when overrides is undefined', () => {
      const result = mergeBranding(baseBranding, undefined)
      expect(result).toBe(baseBranding)
    })

    it('should merge top-level properties', () => {
      const result = mergeBranding(baseBranding, { companyName: 'Override Company' })
      expect(result.companyName).toBe('Override Company')
    })

    it('should deep merge colors', () => {
      const result = mergeBranding(baseBranding, { colors: { primary: '#ff0000' } as BrandingConfig['colors'] })
      expect(result.colors.primary).toBe('#ff0000')
      expect(result.colors.secondary).toBe('#111111') // preserved from base
    })

    it('should deep merge contact', () => {
      const result = mergeBranding(baseBranding, { contact: { website: 'https://test.com' } })
      expect(result.contact?.email).toBe('base@test.com') // preserved
      expect(result.contact?.website).toBe('https://test.com') // added
    })

    it('should deep merge footer', () => {
      const result = mergeBranding(baseBranding, { footer: { showDate: true } })
      expect(result.footer?.text).toBe('Base footer') // preserved
      expect(result.footer?.showDate).toBe(true) // added
    })

    it('should override logo completely', () => {
      const newLogo = { url: 'new-logo.png', width: 200, height: 50 }
      const result = mergeBranding(baseBranding, { logo: newLogo })
      expect(result.logo).toEqual(newLogo)
    })

    it('should override watermark completely', () => {
      const newWatermark = { enabled: false }
      const result = mergeBranding(baseBranding, { watermark: newWatermark })
      expect(result.watermark).toEqual(newWatermark)
    })

    it('should keep base logo when override has no logo', () => {
      const result = mergeBranding(baseBranding, { companyName: 'Test' })
      expect(result.logo).toEqual(baseBranding.logo)
    })

    it('should keep base watermark when override has no watermark', () => {
      const result = mergeBranding(baseBranding, { companyName: 'Test' })
      expect(result.watermark).toEqual(baseBranding.watermark)
    })

    it('should merge fonts with override heading', () => {
      const result = mergeBranding(baseBranding, { fonts: { heading: 'Georgia', body: '' } })
      expect(result.fonts?.heading).toBe('Georgia')
      // Empty body in override falls through to base body
      expect(result.fonts?.body).toBe('Verdana')
    })

    it('should merge fonts with override body only', () => {
      const result = mergeBranding(baseBranding, { fonts: { heading: '', body: 'Courier' } })
      expect(result.fonts?.heading).toBe('Arial') // falls through to base
      expect(result.fonts?.body).toBe('Courier')
    })

    it('should handle fonts when base has no fonts', () => {
      const baseNoFonts: BrandingConfig = {
        ...baseBranding,
        fonts: undefined,
      }
      const result = mergeBranding(baseNoFonts, { fonts: { heading: 'Georgia', body: 'Courier' } })
      expect(result.fonts?.heading).toBe('Georgia')
      expect(result.fonts?.body).toBe('Courier')
    })

    it('should return inherit fallback when both base and override fonts missing heading', () => {
      const baseNoFonts: BrandingConfig = {
        ...baseBranding,
        fonts: undefined,
      }
      const result = mergeBranding(baseNoFonts, { fonts: { heading: '', body: '' } })
      expect(result.fonts?.heading).toBe('inherit')
      expect(result.fonts?.body).toBe('inherit')
    })

    it('should handle fonts when override has fonts but base does not', () => {
      const baseNoFonts: BrandingConfig = {
        ...baseBranding,
        fonts: undefined,
      }
      const result = mergeBranding(baseNoFonts, { companyName: 'X' })
      // Neither base nor override has fonts -> undefined
      expect(result.fonts).toBeUndefined()
    })

    it('should handle fonts when both base and override have no fonts', () => {
      const baseNoFonts: BrandingConfig = { ...baseBranding, fonts: undefined }
      // overrides exist but have no fonts property
      const result = mergeBranding(baseNoFonts, { companyName: 'Test' })
      expect(result.fonts).toBeUndefined()
    })

    it('should preserve tagline from overrides', () => {
      const result = mergeBranding(baseBranding, { tagline: 'New Tagline', taglineTr: 'Yeni Slogan' })
      expect(result.tagline).toBe('New Tagline')
      expect(result.taglineTr).toBe('Yeni Slogan')
    })

    it('should preserve companyNameTr from overrides', () => {
      const result = mergeBranding(baseBranding, { companyNameTr: 'Firma Adı' })
      expect(result.companyNameTr).toBe('Firma Adı')
    })
  })

  describe('DEFAULT_BRANDING', () => {
    it('should have companyName', () => {
      expect(DEFAULT_BRANDING.companyName).toBe('InsurAI')
    })

    it('should have tagline in both languages', () => {
      expect(DEFAULT_BRANDING.tagline).toBeTruthy()
      expect(DEFAULT_BRANDING.taglineTr).toBeTruthy()
    })

    it('should have all required colors', () => {
      const { colors } = DEFAULT_BRANDING
      expect(colors.primary).toBeTruthy()
      expect(colors.secondary).toBeTruthy()
      expect(colors.text).toBeTruthy()
      expect(colors.textLight).toBeTruthy()
      expect(colors.background).toBeTruthy()
      expect(colors.accent).toBeTruthy()
      expect(colors.success).toBeTruthy()
      expect(colors.warning).toBeTruthy()
      expect(colors.danger).toBeTruthy()
    })

    it('should have valid hex color codes', () => {
      const hexRegex = /^#[0-9a-fA-F]{6}$/
      for (const color of Object.values(DEFAULT_BRANDING.colors)) {
        expect(color).toMatch(hexRegex)
      }
    })

    it('should have font configuration', () => {
      expect(DEFAULT_BRANDING.fonts).toBeTruthy()
      expect(DEFAULT_BRANDING.fonts!.heading).toBeTruthy()
      expect(DEFAULT_BRANDING.fonts!.body).toBeTruthy()
    })

    it('should have footer configuration', () => {
      expect(DEFAULT_BRANDING.footer).toBeTruthy()
      expect(DEFAULT_BRANDING.footer!.showPageNumbers).toBe(true)
      expect(DEFAULT_BRANDING.footer!.showDate).toBe(true)
      expect(DEFAULT_BRANDING.footer!.showDisclaimer).toBe(true)
      expect(DEFAULT_BRANDING.footer!.disclaimer).toBeTruthy()
      expect(DEFAULT_BRANDING.footer!.disclaimerTr).toBeTruthy()
    })
  })

  describe('DEFAULT_SECTIONS', () => {
    it('should have sections for all report types', () => {
      const types: ReportType[] = ['policy_detail', 'policy_summary', 'gap_analysis', 'comparison', 'portfolio', 'executive_summary', 'renewal_reminder']
      for (const type of types) {
        expect(DEFAULT_SECTIONS[type]).toBeTruthy()
      }
    })

    it('policy_detail should show details and coverages', () => {
      const sections = DEFAULT_SECTIONS.policy_detail
      expect(sections.showPolicyDetails).toBe(true)
      expect(sections.showCoverages).toBe(true)
      expect(sections.showExclusions).toBe(true)
      expect(sections.showSpecialConditions).toBe(true)
      expect(sections.showRiskScore).toBe(true)
      expect(sections.showAiInsights).toBe(true)
    })

    it('gap_analysis should show gap-specific sections', () => {
      const sections = DEFAULT_SECTIONS.gap_analysis
      expect(sections.showGapAnalysis).toBe(true)
      expect(sections.showRecommendations).toBe(true)
      expect(sections.showNextSteps).toBe(true)
    })

    it('comparison should show comparison-specific sections', () => {
      const sections = DEFAULT_SECTIONS.comparison
      expect(sections.showMarketComparison).toBe(true)
      expect(sections.showCharts).toBe(true)
    })

    it('portfolio should show comprehensive sections', () => {
      const sections = DEFAULT_SECTIONS.portfolio
      expect(sections.showPolicyDetails).toBe(true)
      expect(sections.showGapAnalysis).toBe(true)
      expect(sections.showCharts).toBe(true)
      expect(sections.showTimeline).toBe(true)
      expect(sections.showRecommendations).toBe(true)
      expect(sections.showNextSteps).toBe(true)
    })

    it('executive_summary should show high-level sections', () => {
      const sections = DEFAULT_SECTIONS.executive_summary
      expect(sections.showPolicyDetails).toBe(true)
      expect(sections.showRiskScore).toBe(true)
      expect(sections.showCharts).toBe(true)
      expect(sections.showRecommendations).toBe(true)
    })

    it('renewal_reminder should show relevant sections', () => {
      const sections = DEFAULT_SECTIONS.renewal_reminder
      expect(sections.showPolicyDetails).toBe(true)
      expect(sections.showCoverages).toBe(true)
      expect(sections.showNextSteps).toBe(true)
    })

    it('policy_summary should show charts', () => {
      const sections = DEFAULT_SECTIONS.policy_summary
      expect(sections.showCharts).toBe(true)
    })
  })

  describe('SEVERITY_STYLES', () => {
    it('should have all severity levels', () => {
      expect(SEVERITY_STYLES.critical).toBeTruthy()
      expect(SEVERITY_STYLES.high).toBeTruthy()
      expect(SEVERITY_STYLES.medium).toBeTruthy()
      expect(SEVERITY_STYLES.low).toBeTruthy()
      expect(SEVERITY_STYLES.info).toBeTruthy()
    })

    it('should have bg, text, and border for each severity', () => {
      for (const severity of Object.values(SEVERITY_STYLES)) {
        expect(severity.bg).toBeTruthy()
        expect(severity.text).toBeTruthy()
        expect(severity.border).toBeTruthy()
      }
    })

    it('should have valid hex colors', () => {
      const hexRegex = /^#[0-9a-fA-F]{6}$/
      for (const severity of Object.values(SEVERITY_STYLES)) {
        expect(severity.bg).toMatch(hexRegex)
        expect(severity.text).toMatch(hexRegex)
        expect(severity.border).toMatch(hexRegex)
      }
    })
  })

  describe('STATUS_STYLES', () => {
    it('should have all status types', () => {
      expect(STATUS_STYLES.active).toBeTruthy()
      expect(STATUS_STYLES.expiring).toBeTruthy()
      expect(STATUS_STYLES.expired).toBeTruthy()
      expect(STATUS_STYLES.pending).toBeTruthy()
    })

    it('should have bg and text for each status', () => {
      for (const status of Object.values(STATUS_STYLES)) {
        expect(status.bg).toBeTruthy()
        expect(status.text).toBeTruthy()
      }
    })

    it('should have valid hex colors', () => {
      const hexRegex = /^#[0-9a-fA-F]{6}$/
      for (const status of Object.values(STATUS_STYLES)) {
        expect(status.bg).toMatch(hexRegex)
        expect(status.text).toMatch(hexRegex)
      }
    })
  })
})
