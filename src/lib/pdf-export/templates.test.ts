/**
 * Tests for PDF Report Templates
 * Tests HTML template generation for various report types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generatePolicyDetailHTML,
  generateGapAnalysisHTML,
  generatePortfolioHTML,
  generatePolicySummaryHTML,
} from './templates'
import type { AnalyzedPolicy, Coverage } from '@/types/policy'
import type { DetectedGap } from '@/types/gap'
import type {
  BrandingConfig,
  ReportOptions,
  PolicyDetailReportData,
  GapAnalysisReportData,
  PortfolioReportData,
} from '@/types/pdf-report'

// Mock branding functions
vi.mock('./branding', () => ({
  generateBaseStyles: vi.fn(() => `
    :root { --brand-primary: #3b82f6; }
    body { font-family: sans-serif; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
    .stat-card { padding: 12px; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  `),
  generateHeaderHTML: vi.fn((branding, title, subtitle) => `
    <header>
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </header>
  `),
  generateFooterHTML: vi.fn((branding, lang) => `
    <footer>
      <p>${lang === 'tr' ? 'Oluşturulma tarihi' : 'Generated'}: ${new Date().toISOString().split('T')[0]}</p>
    </footer>
  `),
  generateWatermarkHTML: vi.fn(() => '<div class="watermark"></div>'),
}))

// Mock utils
vi.mock('@/lib/utils', () => ({
  formatCurrency: vi.fn((value: number) => `₺${value.toLocaleString('tr-TR')}`),
  formatDate: vi.fn((date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('tr-TR')
  }),
}))

// =============================================================================
// Test Data Factories
// =============================================================================

function createMockPolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'policy-1',
    policyNumber: 'POL-2024-001',
    type: 'home',
    typeTr: 'Konut',
    provider: 'AXA Sigorta',
    logo: '',
    coverage: 500000,
    premium: 3500,
    monthlyPremium: 291.67,
    deductible: 1000,
    startDate: '2024-01-01',
    expiryDate: '2025-01-01',
    status: 'active',
    uploadDate: '2024-01-01',
    fileName: 'policy.pdf',
    documentType: 'PDF',
    documentUrl: 'blob:url',
    insuredPerson: 'Ahmet Yılmaz',
    location: 'Istanbul, Turkey',
    coverages: [
      { name: 'Fire', nameTr: 'Yangın', limit: 400000, deductible: 500, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 100000, deductible: 500, included: true },
    ],
    exclusions: ['War damage', 'Nuclear incidents'],
    specialConditions: ['24-hour emergency support'],
    insuranceLine: 'Home',
    aiConfidence: 0.85,
    aiInsights: ['✓ Good coverage levels', '⚠ Consider DASK', '💡 Review annually'],
    marketComparison: {
      percentile: 65,
      avgPremium: 3000,
      avgCoverage: 450000,
    },
    riskScore: {
      overall: 35,
      level: 'low',
      topIssue: null,
      confidence: 0.85,
    },
    ...overrides,
  }
}

function createMockBranding(): BrandingConfig {
  return {
    logo: '/logo.png',
    primaryColor: '#3b82f6',
    secondaryColor: '#10b981',
    fontFamily: 'Inter, sans-serif',
    companyName: 'InsurAI',
    contactInfo: 'info@insurai.com',
  }
}

function createMockOptions(overrides: Partial<ReportOptions> = {}): ReportOptions {
  return {
    language: 'en',
    includeHeader: true,
    includeFooter: true,
    includeWatermark: false,
    ...overrides,
  }
}

function createMockGap(overrides: Partial<DetectedGap> = {}): DetectedGap {
  return {
    id: 'gap-1',
    title: 'Missing Flood Coverage',
    titleTr: 'Eksik Sel Teminatı',
    description: 'Property is in flood-prone area without coverage',
    descriptionTr: 'Mülk sel riski yüksek bölgede ancak teminat yok',
    severity: 'high',
    category: 'coverage',
    policyTypes: ['home'],
    financialImpact: {
      potentialLoss: 50000,
      probability: 0.15,
      expectedLoss: 7500,
    },
    confidence: 0.8,
    detectedAt: Date.now(),
    ...overrides,
  }
}

// =============================================================================
// Policy Detail Template Tests
// =============================================================================

describe('generatePolicyDetailHTML', () => {
  const branding = createMockBranding()
  const options = createMockOptions()
  const policy = createMockPolicy()

  it('should generate valid HTML document', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
  })

  it('should include policy number in output', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('POL-2024-001')
  })

  it('should include provider name', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('AXA Sigorta')
  })

  it('should include coverage amount', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺500.000')
  })

  it('should include premium amount', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺3.500')
  })

  it('should show Turkish labels when language is tr', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, trOptions)

    expect(html).toContain('Poliçe Detay Raporu')
    expect(html).toContain('Toplam Teminat')
    expect(html).toContain('Yıllık Prim')
  })

  it('should show English labels when language is en', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('Policy Detail Report')
    expect(html).toContain('Total Coverage')
    expect(html).toContain('Annual Premium')
  })

  it('should include coverages table when showCoverages is true', () => {
    const data: PolicyDetailReportData = { policy }
    const optionsWithCoverages = createMockOptions({
      sections: { showCoverages: true },
    })
    const html = generatePolicyDetailHTML(data, branding, optionsWithCoverages)

    expect(html).toContain('Coverages')
    expect(html).toContain('Fire')
    expect(html).toContain('Theft')
  })

  it('should exclude coverages when showCoverages is false', () => {
    const data: PolicyDetailReportData = { policy }
    const optionsNoCoverages = createMockOptions({
      sections: { showCoverages: false },
    })
    const html = generatePolicyDetailHTML(data, branding, optionsNoCoverages)

    expect(html).not.toContain('<h2>Coverages</h2>')
  })

  it('should include exclusions when present', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('War damage')
    expect(html).toContain('Nuclear incidents')
  })

  it('should include AI insights when present', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('Good coverage levels')
    expect(html).toContain('Consider DASK')
  })

  it('should include risk score when present', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('Risk Assessment')
    expect(html).toContain('35') // Risk score
  })

  it('should include market comparison when provided', () => {
    const data: PolicyDetailReportData = {
      policy,
      marketBenchmark: {
        percentile: 65,
        avgPremium: 3000,
        avgCoverage: 450000,
      },
    }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('Market Comparison')
    expect(html).toContain('65%')
  })

  it('should include status badge', () => {
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('ACTIVE')
  })

  it('should handle expired status', () => {
    const expiredPolicy = createMockPolicy({ status: 'expired' })
    const data: PolicyDetailReportData = { policy: expiredPolicy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('EXPIRED')
  })

  it('should handle expiring status', () => {
    const expiringPolicy = createMockPolicy({ status: 'expiring' })
    const data: PolicyDetailReportData = { policy: expiringPolicy }
    const html = generatePolicyDetailHTML(data, branding, options)

    expect(html).toContain('EXPIRING')
  })

  it('should include custom title when provided', () => {
    const optionsWithTitle = createMockOptions({
      title: 'Custom Report Title',
    })
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, optionsWithTitle)

    expect(html).toContain('Custom Report Title')
  })

  it('should include custom subtitle when provided', () => {
    const optionsWithSubtitle = createMockOptions({
      subtitle: 'Custom Subtitle',
    })
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, optionsWithSubtitle)

    expect(html).toContain('Custom Subtitle')
  })
})

// =============================================================================
// Gap Analysis Template Tests
// =============================================================================

describe('generateGapAnalysisHTML', () => {
  const branding = createMockBranding()
  const options = createMockOptions()
  const policy = createMockPolicy()

  const gapAnalysis = {
    overallScore: 45,
    gapCount: { critical: 1, high: 2, medium: 3, low: 1, total: 7 },
    gapsBySeverity: {
      critical: [createMockGap({ severity: 'critical', title: 'Critical Gap' })],
      high: [createMockGap({ severity: 'high' }), createMockGap({ severity: 'high', title: 'Second High Gap' })],
      medium: [createMockGap({ severity: 'medium' })],
      low: [createMockGap({ severity: 'low' })],
    },
    financialSummary: {
      totalExpectedLoss: 75000,
      estimatedRemediationCost: 5000,
    },
  }

  it('should generate valid HTML document', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
  })

  it('should include gap score', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('45')
  })

  it('should include total gap count', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('7') // Total gaps
  })

  it('should include critical gap count', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('Critical Gap')
  })

  it('should include executive summary', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('Executive Summary')
    expect(html).toContain('7 coverage gaps')
  })

  it('should show Turkish executive summary in Turkish', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, trOptions)

    expect(html).toContain('Yönetici Özeti')
    expect(html).toContain('7 teminat açığı')
  })

  it('should include financial summary', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺75.000') // Expected loss
  })

  it('should display critical gaps section', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('Critical Gaps')
    expect(html).toContain('Critical Gap')
  })

  it('should display high priority gaps section', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('High Priority Gaps')
    expect(html).toContain('Missing Flood Coverage')
  })

  it('should include severity badges', () => {
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations: [] }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('CRITICAL')
    expect(html).toContain('HIGH')
  })

  it('should include recommendations when provided', () => {
    const recommendations = [
      {
        action: 'Add flood coverage',
        actionTr: 'Sel teminatı ekleyin',
        impact: 'Reduces risk exposure by 50%',
        impactTr: 'Risk maruziyetini %50 azaltır',
        estimatedCost: 500,
      },
    ]
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('Recommendations')
    expect(html).toContain('Add flood coverage')
  })

  it('should show Turkish recommendations in Turkish', () => {
    const recommendations = [
      {
        action: 'Add flood coverage',
        actionTr: 'Sel teminatı ekleyin',
        impact: 'Reduces risk',
        impactTr: 'Risk azaltır',
        estimatedCost: 500,
      },
    ]
    const trOptions = createMockOptions({ language: 'tr' })
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations }
    const html = generateGapAnalysisHTML(data, branding, trOptions)

    expect(html).toContain('Öneriler')
    expect(html).toContain('Sel teminatı ekleyin')
  })

  it('should include page break class', () => {
    const recommendations = [{ action: 'Test', actionTr: 'Test', impact: '', impactTr: '' }]
    const data: GapAnalysisReportData = { policy, gapAnalysis, recommendations }
    const html = generateGapAnalysisHTML(data, branding, options)

    expect(html).toContain('page-break')
  })
})

// =============================================================================
// Portfolio Template Tests
// =============================================================================

describe('generatePortfolioHTML', () => {
  const branding = createMockBranding()
  const options = createMockOptions()

  const policies = [
    createMockPolicy({ id: '1', policyNumber: 'POL-001', type: 'home', premium: 3500, coverage: 500000 }),
    createMockPolicy({ id: '2', policyNumber: 'POL-002', type: 'kasko', typeTr: 'Kasko', premium: 8000, coverage: 300000 }),
    createMockPolicy({ id: '3', policyNumber: 'POL-003', type: 'health', typeTr: 'Sağlık', premium: 5000, coverage: 200000, status: 'expiring' }),
  ]

  const summary = {
    totalPolicies: 3,
    activePolicies: 2,
    expiringPolicies: 1,
    expiredPolicies: 0,
    totalCoverage: 1000000,
    totalPremium: 16500,
  }

  const byType = {
    home: { count: 1, totalCoverage: 500000, totalPremium: 3500 },
    kasko: { count: 1, totalCoverage: 300000, totalPremium: 8000 },
    health: { count: 1, totalCoverage: 200000, totalPremium: 5000 },
  }

  it('should generate valid HTML document', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
  })

  it('should include portfolio title', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('Portfolio Analysis Report')
  })

  it('should show Turkish title in Turkish', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, trOptions)

    expect(html).toContain('Portföy Analiz Raporu')
  })

  it('should include total policies count', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('3') // Total policies
  })

  it('should include active policies count', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('2') // Active policies
  })

  it('should include total coverage', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺1.000.000')
  })

  it('should include total premium', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺16.500')
  })

  it('should show expiring policies alert', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('1 policies are expiring soon')
  })

  it('should show Turkish expiring alert in Turkish', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, trOptions)

    expect(html).toContain('poliçenin süresi yakında doluyor')
  })

  it('should include policies by type table', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('Policies by Type')
    expect(html).toContain('home')
    expect(html).toContain('kasko')
    expect(html).toContain('health')
  })

  it('should include policy list table', () => {
    const data: PortfolioReportData = { policies, summary, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('Policy List')
    expect(html).toContain('POL-001')
    expect(html).toContain('POL-002')
    expect(html).toContain('POL-003')
  })

  it('should show gap summary alert when critical gaps exist', () => {
    const gapSummary = {
      criticalGaps: 3,
      estimatedExposure: 100000,
      topIssues: ['Missing flood coverage', 'Low liability limits'],
    }
    const data: PortfolioReportData = { policies, summary, byType, gapSummary }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('Critical Gaps')
    expect(html).toContain('3 critical coverage gaps')
  })

  it('should include top issues from gap summary', () => {
    const gapSummary = {
      criticalGaps: 2,
      estimatedExposure: 50000,
      topIssues: ['Missing flood coverage', 'Low liability limits'],
    }
    const data: PortfolioReportData = { policies, summary, byType, gapSummary }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).toContain('Missing flood coverage')
    expect(html).toContain('Low liability limits')
  })

  it('should not show expiring alert when no policies expiring', () => {
    const noExpiringSum = { ...summary, expiringPolicies: 0 }
    const data: PortfolioReportData = { policies, summary: noExpiringSum, byType }
    const html = generatePortfolioHTML(data, branding, options)

    expect(html).not.toContain('expiring soon')
  })
})

// =============================================================================
// Policy Summary Template Tests
// =============================================================================

describe('generatePolicySummaryHTML', () => {
  const branding = createMockBranding()
  const options = createMockOptions()

  const policies = [
    createMockPolicy({ policyNumber: 'POL-001', premium: 3500, coverage: 500000, status: 'active' }),
    createMockPolicy({ policyNumber: 'POL-002', premium: 8000, coverage: 300000, status: 'active' }),
    createMockPolicy({ policyNumber: 'POL-003', premium: 5000, coverage: 200000, status: 'expiring' }),
  ]

  it('should generate valid HTML document', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
  })

  it('should include summary title', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    expect(html).toContain('Policy Summary Report')
  })

  it('should show Turkish title in Turkish', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const html = generatePolicySummaryHTML(policies, branding, trOptions)

    expect(html).toContain('Poliçe Özet Raporu')
  })

  it('should calculate and display total policies', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    expect(html).toContain('3') // Total policies
  })

  it('should calculate and display active policies', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    expect(html).toContain('2') // Active policies
  })

  it('should calculate and display total coverage', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺1.000.000') // 500k + 300k + 200k
  })

  it('should calculate and display total premium', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    // Turkish locale uses period as thousands separator
    expect(html).toContain('₺16.500') // 3500 + 8000 + 5000
  })

  it('should include policy table with all policies', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    expect(html).toContain('POL-001')
    expect(html).toContain('POL-002')
    expect(html).toContain('POL-003')
  })

  it('should show status badges for each policy', () => {
    const html = generatePolicySummaryHTML(policies, branding, options)

    expect(html).toContain('ACTIVE')
    expect(html).toContain('EXPIRING')
  })

  it('should use Turkish labels when language is tr', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const html = generatePolicySummaryHTML(policies, branding, trOptions)

    expect(html).toContain('Toplam Poliçe')
    expect(html).toContain('Aktif')
    expect(html).toContain('Toplam Teminat')
  })

  it('should use custom title when provided', () => {
    const customOptions = createMockOptions({ title: 'My Custom Summary' })
    const html = generatePolicySummaryHTML(policies, branding, customOptions)

    expect(html).toContain('My Custom Summary')
  })

  it('should handle empty policies array', () => {
    const html = generatePolicySummaryHTML([], branding, options)

    expect(html).toContain('0') // Total policies
    expect(html).toContain('₺0') // Total coverage
  })
})

// =============================================================================
// Helper Function Tests (via generated HTML)
// =============================================================================

describe('Template Helper Functions', () => {
  const branding = createMockBranding()
  const options = createMockOptions()

  describe('Status Badge Generation', () => {
    it('should generate green badge for active status', () => {
      const policy = createMockPolicy({ status: 'active' })
      const data: PolicyDetailReportData = { policy }
      const html = generatePolicyDetailHTML(data, branding, options)

      expect(html).toContain('#dcfce7') // Green background
      expect(html).toContain('#166534') // Green text
    })

    it('should generate yellow badge for expiring status', () => {
      const policy = createMockPolicy({ status: 'expiring' })
      const data: PolicyDetailReportData = { policy }
      const html = generatePolicyDetailHTML(data, branding, options)

      expect(html).toContain('#fef9c3') // Yellow background
    })

    it('should generate red badge for expired status', () => {
      const policy = createMockPolicy({ status: 'expired' })
      const data: PolicyDetailReportData = { policy }
      const html = generatePolicyDetailHTML(data, branding, options)

      expect(html).toContain('#fee2e2') // Red background
    })
  })

  describe('Risk Score Visualization', () => {
    it('should show low risk in green', () => {
      const policy = createMockPolicy({ riskScore: { overall: 25, level: 'low', topIssue: null, confidence: 0.8 } })
      const data: PolicyDetailReportData = { policy }
      const html = generatePolicyDetailHTML(data, branding, options)

      expect(html).toContain('#22c55e') // Green color
      expect(html).toContain('Low Risk')
    })

    it('should show high risk in orange/red', () => {
      const policy = createMockPolicy({ riskScore: { overall: 75, level: 'high', topIssue: 'Major gap', confidence: 0.8 } })
      const data: PolicyDetailReportData = { policy }
      const html = generatePolicyDetailHTML(data, branding, options)

      expect(html).toContain('#f97316') // Orange color
      expect(html).toContain('High')
    })

    it('should display top issue when present', () => {
      const policy = createMockPolicy({
        riskScore: { overall: 60, level: 'elevated', topIssue: 'Missing flood coverage', confidence: 0.8 },
      })
      const data: PolicyDetailReportData = { policy }
      const html = generatePolicyDetailHTML(data, branding, options)

      expect(html).toContain('Missing flood coverage')
      expect(html).toContain('Key Finding')
    })
  })
})

// =============================================================================
// Language Support Tests
// =============================================================================

describe('Bilingual Support', () => {
  const branding = createMockBranding()
  const policy = createMockPolicy()

  it('should support bilingual mode', () => {
    const bilingualOptions = createMockOptions({ language: 'bilingual' })
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, bilingualOptions)

    // Bilingual should use Turkish labels
    expect(html).toContain('Poliçe Detay Raporu')
  })

  it('should use Turkish coverage names in Turkish mode', () => {
    const trOptions = createMockOptions({ language: 'tr' })
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, trOptions)

    expect(html).toContain('Yangın')
    expect(html).toContain('Hırsızlık')
  })

  it('should use English coverage names in English mode', () => {
    const enOptions = createMockOptions({ language: 'en' })
    const data: PolicyDetailReportData = { policy }
    const html = generatePolicyDetailHTML(data, branding, enOptions)

    expect(html).toContain('Fire')
    expect(html).toContain('Theft')
  })
})
