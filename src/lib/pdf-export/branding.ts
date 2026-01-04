/**
 * Branding Service
 * Manages company branding for PDF reports
 */

import type { BrandingConfig } from '@/types/pdf-report'
import { DEFAULT_BRANDING, mergeBranding } from '@/types/pdf-report'

// =============================================================================
// Branding Storage
// =============================================================================

const STORAGE_KEY = 'insurai_branding'

/**
 * Get saved branding configuration
 */
export function getSavedBranding(): BrandingConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<BrandingConfig>
      return mergeBranding(DEFAULT_BRANDING, parsed)
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_BRANDING
}

/**
 * Save branding configuration
 */
export function saveBranding(branding: Partial<BrandingConfig>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branding))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset to default branding
 */
export function resetBranding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// CSS Generation
// =============================================================================

/**
 * Generate CSS variables from branding config
 */
export function generateBrandingCSS(branding: BrandingConfig): string {
  return `
    :root {
      --brand-primary: ${branding.colors.primary};
      --brand-secondary: ${branding.colors.secondary};
      --brand-text: ${branding.colors.text};
      --brand-text-light: ${branding.colors.textLight};
      --brand-background: ${branding.colors.background};
      --brand-accent: ${branding.colors.accent};
      --brand-success: ${branding.colors.success};
      --brand-warning: ${branding.colors.warning};
      --brand-danger: ${branding.colors.danger};
      --font-heading: ${branding.fonts?.heading || 'inherit'};
      --font-body: ${branding.fonts?.body || 'inherit'};
    }
  `
}

/**
 * Generate base styles for PDF reports
 */
export function generateBaseStyles(branding: BrandingConfig): string {
  return `
    ${generateBrandingCSS(branding)}

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      font-family: var(--font-body);
      font-size: 12px;
      line-height: 1.5;
      color: var(--brand-text);
      background: var(--brand-background);
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-heading);
      font-weight: 600;
      line-height: 1.3;
      color: var(--brand-text);
    }

    h1 { font-size: 24px; margin-bottom: 16px; }
    h2 { font-size: 18px; margin-bottom: 12px; color: var(--brand-primary); border-bottom: 2px solid var(--brand-primary); padding-bottom: 6px; }
    h3 { font-size: 14px; margin-bottom: 8px; color: var(--brand-secondary); }

    p { margin-bottom: 8px; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }

    th {
      background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }

    td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 11px;
    }

    tr:nth-child(even) { background: #f9fafb; }
    tr:hover { background: #f3f4f6; }

    .text-primary { color: var(--brand-primary); }
    .text-secondary { color: var(--brand-secondary); }
    .text-success { color: var(--brand-success); }
    .text-warning { color: var(--brand-warning); }
    .text-danger { color: var(--brand-danger); }
    .text-light { color: var(--brand-text-light); }

    .bg-primary { background-color: var(--brand-primary); color: white; }
    .bg-success { background-color: #dcfce7; color: #166534; }
    .bg-warning { background-color: #fef9c3; color: #854d0e; }
    .bg-danger { background-color: #fee2e2; color: #991b1b; }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .highlight-card {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 1px solid var(--brand-primary);
      border-left: 4px solid var(--brand-primary);
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 20px 0;
    }

    .stat-card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--brand-primary);
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--brand-text-light);
    }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

    .field {
      margin-bottom: 12px;
    }

    .field-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--brand-text-light);
      margin-bottom: 2px;
    }

    .field-value {
      font-size: 13px;
      font-weight: 500;
    }

    .divider {
      height: 1px;
      background: #e5e7eb;
      margin: 20px 0;
    }

    .severity-critical { background: #fee2e2; color: #991b1b; border-left: 3px solid #ef4444; }
    .severity-high { background: #ffedd5; color: #9a3412; border-left: 3px solid #f97316; }
    .severity-medium { background: #fef9c3; color: #854d0e; border-left: 3px solid #eab308; }
    .severity-low { background: #dbeafe; color: #1e40af; border-left: 3px solid #3b82f6; }
    .severity-info { background: #f3f4f6; color: #4b5563; border-left: 3px solid #9ca3af; }

    .gap-item {
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 6px;
    }

    .recommendation {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .recommendation-number {
      width: 24px;
      height: 24px;
      background: var(--brand-success);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }

    ul, ol {
      padding-left: 20px;
      margin-bottom: 12px;
    }

    li {
      margin-bottom: 4px;
    }

    @media print {
      body {
        padding: 0;
        font-size: 11px;
      }

      @page {
        margin: 15mm;
        size: A4;
      }

      .no-print { display: none !important; }

      .page-break {
        page-break-before: always;
        margin-top: 0;
        padding-top: 20px;
      }

      h2 { page-break-after: avoid; }

      table, .card { page-break-inside: avoid; }
    }
  `
}

// =============================================================================
// Header/Footer Components
// =============================================================================

/**
 * Generate report header HTML
 */
export function generateHeaderHTML(
  branding: BrandingConfig,
  title: string,
  subtitle?: string,
  showDate = true
): string {
  const logoHTML = branding.logo
    ? `<img src="${branding.logo.url}" alt="${branding.companyName}" style="height: ${branding.logo.height || 40}px; width: auto;" />`
    : `<div class="logo-text">${branding.companyName}</div>`

  return `
    <header class="report-header">
      <div class="header-left">
        <div class="logo">
          ${logoHTML}
        </div>
        ${branding.tagline ? `<div class="tagline">${branding.tagline}</div>` : ''}
      </div>
      <div class="header-right">
        ${showDate ? `
          <div class="header-date">
            <span class="date-label">Generated</span>
            <span class="date-value">${new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        ` : ''}
      </div>
    </header>
    <div class="report-title-section">
      <h1 class="report-title">${title}</h1>
      ${subtitle ? `<p class="report-subtitle">${subtitle}</p>` : ''}
    </div>
    <style>
      .report-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 16px;
        border-bottom: 3px solid var(--brand-primary);
        margin-bottom: 24px;
      }
      .logo-text {
        font-size: 28px;
        font-weight: 700;
        color: var(--brand-primary);
        letter-spacing: -0.5px;
      }
      .tagline {
        font-size: 11px;
        color: var(--brand-text-light);
        margin-top: 4px;
      }
      .header-right {
        text-align: right;
      }
      .header-date {
        display: flex;
        flex-direction: column;
      }
      .date-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--brand-text-light);
      }
      .date-value {
        font-size: 12px;
        font-weight: 500;
      }
      .report-title-section {
        margin-bottom: 24px;
      }
      .report-title {
        font-size: 28px;
        color: var(--brand-text);
        margin-bottom: 8px;
      }
      .report-subtitle {
        font-size: 14px;
        color: var(--brand-text-light);
      }
    </style>
  `
}

/**
 * Generate report footer HTML
 */
export function generateFooterHTML(
  branding: BrandingConfig,
  language: 'en' | 'tr' = 'en'
): string {
  const footer = branding.footer || {}
  const contact = branding.contact || {}
  const disclaimer = language === 'tr' ? footer.disclaimerTr : footer.disclaimer

  return `
    <footer class="report-footer">
      <div class="footer-content">
        <div class="footer-brand">
          <strong>${branding.companyName}</strong>
          ${contact.website ? `<span class="footer-divider">|</span><span>${contact.website}</span>` : ''}
          ${contact.email ? `<span class="footer-divider">|</span><span>${contact.email}</span>` : ''}
          ${contact.phone ? `<span class="footer-divider">|</span><span>${contact.phone}</span>` : ''}
        </div>
        ${footer.showDisclaimer && disclaimer ? `
          <div class="footer-disclaimer">${disclaimer}</div>
        ` : ''}
        ${footer.showDate ? `
          <div class="footer-timestamp">
            ${language === 'tr' ? 'Oluşturulma tarihi' : 'Generated'}: ${new Date().toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}
          </div>
        ` : ''}
      </div>
    </footer>
    <style>
      .report-footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 2px solid var(--brand-primary);
      }
      .footer-content {
        text-align: center;
      }
      .footer-brand {
        font-size: 11px;
        color: var(--brand-text);
        margin-bottom: 8px;
      }
      .footer-divider {
        margin: 0 8px;
        color: var(--brand-text-light);
      }
      .footer-disclaimer {
        font-size: 9px;
        color: var(--brand-text-light);
        max-width: 600px;
        margin: 0 auto 8px;
        line-height: 1.4;
      }
      .footer-timestamp {
        font-size: 9px;
        color: var(--brand-text-light);
      }
    </style>
  `
}

/**
 * Generate watermark HTML
 */
export function generateWatermarkHTML(branding: BrandingConfig): string {
  if (!branding.watermark?.enabled) return ''

  const text = branding.watermark.text || branding.companyName
  const opacity = branding.watermark.opacity || 0.05

  return `
    <div class="watermark">${text}</div>
    <style>
      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 120px;
        font-weight: 700;
        color: var(--brand-primary);
        opacity: ${opacity};
        pointer-events: none;
        white-space: nowrap;
        z-index: -1;
      }
      @media print {
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
        }
      }
    </style>
  `
}

// =============================================================================
// Preset Themes
// =============================================================================

/**
 * Professional blue theme (default)
 */
export const THEME_PROFESSIONAL: Partial<BrandingConfig> = {
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
}

/**
 * Modern dark theme
 */
export const THEME_MODERN: Partial<BrandingConfig> = {
  colors: {
    primary: '#6366f1',
    secondary: '#818cf8',
    text: '#1f2937',
    textLight: '#6b7280',
    background: '#ffffff',
    accent: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
}

/**
 * Corporate green theme
 */
export const THEME_CORPORATE: Partial<BrandingConfig> = {
  colors: {
    primary: '#047857',
    secondary: '#059669',
    text: '#1f2937',
    textLight: '#6b7280',
    background: '#ffffff',
    accent: '#0d9488',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
}

/**
 * Get theme by name
 */
export function getTheme(name: 'professional' | 'modern' | 'corporate'): Partial<BrandingConfig> {
  const themes = {
    professional: THEME_PROFESSIONAL,
    modern: THEME_MODERN,
    corporate: THEME_CORPORATE,
  }
  return themes[name]
}
