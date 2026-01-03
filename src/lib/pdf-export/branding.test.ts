/**
 * Tests for Branding Service
 * Tests branding storage, CSS generation, and theme presets
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
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
import type { BrandingConfig } from '@/types/pdf-report'

// =============================================================================
// Test Fixtures
// =============================================================================

const mockBranding: BrandingConfig = {
  companyName: 'Test Insurance Co',
  tagline: 'Your trusted partner',
  logo: {
    url: 'https://example.com/logo.png',
    height: 50,
  },
  colors: {
    primary: '#1e40af',
    secondary: '#3b82f6',
    text: '#1e293b',
    textLight: '#64748b',
    background: '#ffffff',
    accent: '#0284c7',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
  },
  fonts: {
    heading: 'Arial, sans-serif',
    body: 'Georgia, serif',
  },
  contact: {
    email: 'info@test.com',
    phone: '+90 555 123 4567',
    website: 'https://test.com',
  },
  footer: {
    showDisclaimer: true,
    disclaimer: 'This is a test disclaimer',
    disclaimerTr: 'Bu bir test uyarısıdır',
    showDate: true,
  },
  watermark: {
    enabled: true,
    text: 'CONFIDENTIAL',
    opacity: 0.1,
  },
}

// =============================================================================
// Setup and Teardown
// =============================================================================

describe('Branding Service', () => {
  let storage: Record<string, string>

  beforeEach(() => {
    storage = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ===========================================================================
  // getSavedBranding Tests
  // ===========================================================================

  describe('getSavedBranding', () => {
    it('should return default branding when nothing is saved', () => {
      const branding = getSavedBranding()

      expect(branding).toBeDefined()
      expect(branding.companyName).toBeDefined()
      expect(branding.colors).toBeDefined()
    })

    it('should return saved branding merged with defaults', () => {
      storage['insurai_branding'] = JSON.stringify({ companyName: 'Custom Co' })

      const branding = getSavedBranding()

      expect(branding.companyName).toBe('Custom Co')
      // Should still have default colors
      expect(branding.colors).toBeDefined()
    })

    it('should handle invalid JSON gracefully', () => {
      storage['insurai_branding'] = 'invalid-json'

      const branding = getSavedBranding()

      // Should return defaults
      expect(branding).toBeDefined()
      expect(branding.companyName).toBeDefined()
    })

    it('should merge partial branding with defaults', () => {
      storage['insurai_branding'] = JSON.stringify({
        colors: { primary: '#ff0000' },
      })

      const branding = getSavedBranding()

      expect(branding.colors.primary).toBe('#ff0000')
      // Other colors should be defaults
      expect(branding.colors.secondary).toBeDefined()
    })
  })

  // ===========================================================================
  // saveBranding Tests
  // ===========================================================================

  describe('saveBranding', () => {
    it('should save branding to localStorage', () => {
      saveBranding({ companyName: 'New Company' })

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'insurai_branding',
        JSON.stringify({ companyName: 'New Company' })
      )
    })

    it('should save full branding config', () => {
      saveBranding(mockBranding)

      expect(localStorage.setItem).toHaveBeenCalled()
      const saved = JSON.parse(storage['insurai_branding'])
      expect(saved.companyName).toBe('Test Insurance Co')
    })

    it('should handle storage errors gracefully', () => {
      vi.stubGlobal('localStorage', {
        setItem: vi.fn(() => { throw new Error('Storage full') }),
      })

      expect(() => saveBranding({ companyName: 'Test' })).not.toThrow()
    })
  })

  // ===========================================================================
  // resetBranding Tests
  // ===========================================================================

  describe('resetBranding', () => {
    it('should remove branding from localStorage', () => {
      storage['insurai_branding'] = JSON.stringify({ companyName: 'Custom' })

      resetBranding()

      expect(localStorage.removeItem).toHaveBeenCalledWith('insurai_branding')
    })

    it('should handle storage errors gracefully', () => {
      vi.stubGlobal('localStorage', {
        removeItem: vi.fn(() => { throw new Error('Storage error') }),
      })

      expect(() => resetBranding()).not.toThrow()
    })
  })

  // ===========================================================================
  // generateBrandingCSS Tests
  // ===========================================================================

  describe('generateBrandingCSS', () => {
    it('should generate CSS with color variables', () => {
      const css = generateBrandingCSS(mockBranding)

      expect(css).toContain('--brand-primary: #1e40af')
      expect(css).toContain('--brand-secondary: #3b82f6')
      expect(css).toContain('--brand-text: #1e293b')
    })

    it('should include all color variables', () => {
      const css = generateBrandingCSS(mockBranding)

      expect(css).toContain('--brand-text-light')
      expect(css).toContain('--brand-background')
      expect(css).toContain('--brand-accent')
      expect(css).toContain('--brand-success')
      expect(css).toContain('--brand-warning')
      expect(css).toContain('--brand-danger')
    })

    it('should include font variables', () => {
      const css = generateBrandingCSS(mockBranding)

      expect(css).toContain('--font-heading: Arial, sans-serif')
      expect(css).toContain('--font-body: Georgia, serif')
    })

    it('should handle missing fonts with inherit', () => {
      const brandingWithoutFonts = { ...mockBranding, fonts: undefined }
      const css = generateBrandingCSS(brandingWithoutFonts)

      expect(css).toContain('--font-heading: inherit')
      expect(css).toContain('--font-body: inherit')
    })

    it('should wrap in :root selector', () => {
      const css = generateBrandingCSS(mockBranding)

      expect(css).toContain(':root')
    })
  })

  // ===========================================================================
  // generateBaseStyles Tests
  // ===========================================================================

  describe('generateBaseStyles', () => {
    it('should include branding CSS', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('--brand-primary')
    })

    it('should include reset styles', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('margin: 0')
      expect(styles).toContain('padding: 0')
      expect(styles).toContain('box-sizing: border-box')
    })

    it('should include typography styles', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('font-family: var(--font-body)')
      expect(styles).toContain('h1 {')
      expect(styles).toContain('h2 {')
    })

    it('should include table styles', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('table {')
      expect(styles).toContain('th {')
      expect(styles).toContain('td {')
    })

    it('should include utility classes', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('.text-primary')
      expect(styles).toContain('.text-success')
      expect(styles).toContain('.bg-primary')
      expect(styles).toContain('.badge')
      expect(styles).toContain('.card')
    })

    it('should include print media queries', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('@media print')
      expect(styles).toContain('@page')
      expect(styles).toContain('.no-print')
    })

    it('should include severity classes', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('.severity-critical')
      expect(styles).toContain('.severity-high')
      expect(styles).toContain('.severity-medium')
      expect(styles).toContain('.severity-low')
    })

    it('should include grid classes', () => {
      const styles = generateBaseStyles(mockBranding)

      expect(styles).toContain('.grid-2')
      expect(styles).toContain('.grid-3')
      expect(styles).toContain('.stat-grid')
    })
  })

  // ===========================================================================
  // generateHeaderHTML Tests
  // ===========================================================================

  describe('generateHeaderHTML', () => {
    it('should generate header with logo', () => {
      const html = generateHeaderHTML(mockBranding, 'Report Title')

      expect(html).toContain('<img src="https://example.com/logo.png"')
      expect(html).toContain('alt="Test Insurance Co"')
    })

    it('should use text logo when no logo URL', () => {
      const brandingWithoutLogo = { ...mockBranding, logo: undefined }
      const html = generateHeaderHTML(brandingWithoutLogo, 'Report Title')

      expect(html).toContain('<div class="logo-text">Test Insurance Co</div>')
    })

    it('should include title', () => {
      const html = generateHeaderHTML(mockBranding, 'My Report')

      expect(html).toContain('<h1 class="report-title">My Report</h1>')
    })

    it('should include subtitle when provided', () => {
      const html = generateHeaderHTML(mockBranding, 'Title', 'Subtitle')

      expect(html).toContain('class="report-subtitle"')
      expect(html).toContain('Subtitle')
    })

    it('should not include subtitle when not provided', () => {
      const html = generateHeaderHTML(mockBranding, 'Title')

      // Should not contain a subtitle element with class (the <p> tag)
      expect(html).not.toContain('<p class="report-subtitle">')
    })

    it('should include date when showDate is true', () => {
      const html = generateHeaderHTML(mockBranding, 'Title', undefined, true)

      expect(html).toContain('class="header-date"')
    })

    it('should exclude date when showDate is false', () => {
      const html = generateHeaderHTML(mockBranding, 'Title', undefined, false)

      expect(html).not.toContain('class="header-date"')
    })

    it('should include tagline when available', () => {
      const html = generateHeaderHTML(mockBranding, 'Title')

      expect(html).toContain('Your trusted partner')
    })

    it('should not include tagline when not set', () => {
      const brandingNoTagline = { ...mockBranding, tagline: undefined }
      const html = generateHeaderHTML(brandingNoTagline, 'Title')

      expect(html).not.toContain('class="tagline"')
    })

    it('should include header styles', () => {
      const html = generateHeaderHTML(mockBranding, 'Title')

      expect(html).toContain('<style>')
      expect(html).toContain('.report-header')
    })
  })

  // ===========================================================================
  // generateFooterHTML Tests
  // ===========================================================================

  describe('generateFooterHTML', () => {
    it('should include company name', () => {
      const html = generateFooterHTML(mockBranding)

      expect(html).toContain('Test Insurance Co')
    })

    it('should include contact info when available', () => {
      const html = generateFooterHTML(mockBranding)

      expect(html).toContain('https://test.com')
      expect(html).toContain('info@test.com')
      expect(html).toContain('+90 555 123 4567')
    })

    it('should include English disclaimer when language is en', () => {
      const html = generateFooterHTML(mockBranding, 'en')

      expect(html).toContain('This is a test disclaimer')
    })

    it('should include Turkish disclaimer when language is tr', () => {
      const html = generateFooterHTML(mockBranding, 'tr')

      expect(html).toContain('Bu bir test uyarısıdır')
    })

    it('should not show disclaimer when showDisclaimer is false', () => {
      const brandingNoDisclaimer = {
        ...mockBranding,
        footer: { ...mockBranding.footer, showDisclaimer: false },
      }
      const html = generateFooterHTML(brandingNoDisclaimer)

      // Should not contain a disclaimer div with content
      expect(html).not.toContain('<div class="footer-disclaimer">')
    })

    it('should show timestamp when showDate is true', () => {
      const html = generateFooterHTML(mockBranding, 'en')

      expect(html).toContain('Generated:')
    })

    it('should show Turkish timestamp label when language is tr', () => {
      const html = generateFooterHTML(mockBranding, 'tr')

      expect(html).toContain('Oluşturulma tarihi')
    })

    it('should include footer styles', () => {
      const html = generateFooterHTML(mockBranding)

      expect(html).toContain('<style>')
      expect(html).toContain('.report-footer')
    })

    it('should handle missing contact info', () => {
      const brandingNoContact = { ...mockBranding, contact: undefined }
      const html = generateFooterHTML(brandingNoContact)

      expect(html).toContain('Test Insurance Co')
      // Should not contain divider spans (which separate contact items)
      expect(html).not.toContain('<span class="footer-divider">')
    })

    it('should handle missing footer config', () => {
      const brandingNoFooter = { ...mockBranding, footer: undefined }
      const html = generateFooterHTML(brandingNoFooter)

      expect(html).toContain('Test Insurance Co')
    })
  })

  // ===========================================================================
  // generateWatermarkHTML Tests
  // ===========================================================================

  describe('generateWatermarkHTML', () => {
    it('should generate watermark when enabled', () => {
      const html = generateWatermarkHTML(mockBranding)

      expect(html).toContain('class="watermark"')
      expect(html).toContain('CONFIDENTIAL')
    })

    it('should return empty string when watermark disabled', () => {
      const brandingNoWatermark = {
        ...mockBranding,
        watermark: { enabled: false },
      }
      const html = generateWatermarkHTML(brandingNoWatermark)

      expect(html).toBe('')
    })

    it('should return empty string when no watermark config', () => {
      const brandingNoWatermark = { ...mockBranding, watermark: undefined }
      const html = generateWatermarkHTML(brandingNoWatermark)

      expect(html).toBe('')
    })

    it('should use company name as default text', () => {
      const brandingDefaultText = {
        ...mockBranding,
        watermark: { enabled: true },
      }
      const html = generateWatermarkHTML(brandingDefaultText)

      expect(html).toContain('Test Insurance Co')
    })

    it('should use custom opacity', () => {
      const html = generateWatermarkHTML(mockBranding)

      expect(html).toContain('opacity: 0.1')
    })

    it('should use default opacity when not specified', () => {
      const brandingDefaultOpacity = {
        ...mockBranding,
        watermark: { enabled: true, text: 'TEST' },
      }
      const html = generateWatermarkHTML(brandingDefaultOpacity)

      expect(html).toContain('opacity: 0.05')
    })

    it('should include watermark styles', () => {
      const html = generateWatermarkHTML(mockBranding)

      expect(html).toContain('<style>')
      expect(html).toContain('transform: translate(-50%, -50%) rotate(-45deg)')
    })

    it('should include print media query', () => {
      const html = generateWatermarkHTML(mockBranding)

      expect(html).toContain('@media print')
    })
  })

  // ===========================================================================
  // Theme Presets Tests
  // ===========================================================================

  describe('Theme Presets', () => {
    it('THEME_PROFESSIONAL should have blue colors', () => {
      expect(THEME_PROFESSIONAL.colors?.primary).toBe('#1e40af')
      expect(THEME_PROFESSIONAL.colors?.secondary).toBe('#3b82f6')
    })

    it('THEME_MODERN should have indigo colors', () => {
      expect(THEME_MODERN.colors?.primary).toBe('#6366f1')
      expect(THEME_MODERN.colors?.secondary).toBe('#818cf8')
    })

    it('THEME_CORPORATE should have green colors', () => {
      expect(THEME_CORPORATE.colors?.primary).toBe('#047857')
      expect(THEME_CORPORATE.colors?.secondary).toBe('#059669')
    })

    it('all themes should have complete color sets', () => {
      const themes = [THEME_PROFESSIONAL, THEME_MODERN, THEME_CORPORATE]

      for (const theme of themes) {
        expect(theme.colors?.primary).toBeDefined()
        expect(theme.colors?.secondary).toBeDefined()
        expect(theme.colors?.text).toBeDefined()
        expect(theme.colors?.textLight).toBeDefined()
        expect(theme.colors?.background).toBeDefined()
        expect(theme.colors?.accent).toBeDefined()
        expect(theme.colors?.success).toBeDefined()
        expect(theme.colors?.warning).toBeDefined()
        expect(theme.colors?.danger).toBeDefined()
      }
    })
  })

  // ===========================================================================
  // getTheme Tests
  // ===========================================================================

  describe('getTheme', () => {
    it('should return professional theme', () => {
      const theme = getTheme('professional')

      expect(theme).toEqual(THEME_PROFESSIONAL)
    })

    it('should return modern theme', () => {
      const theme = getTheme('modern')

      expect(theme).toEqual(THEME_MODERN)
    })

    it('should return corporate theme', () => {
      const theme = getTheme('corporate')

      expect(theme).toEqual(THEME_CORPORATE)
    })
  })
})
