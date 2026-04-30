import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PolicyKeyMetricsAndDiscounts } from './PolicyKeyMetricsAndDiscounts'
import type { AnalyzedPolicy } from '@/types/policy'

vi.mock('@/lib/i18n/i18n-context', async () => {
  const { EN_TRANSLATIONS } = await vi.importActual<typeof import('@/lib/i18n/translations-en')>(
    '@/lib/i18n/translations-en'
  )
  return {
    useI18n: () => ({
      t: EN_TRANSLATIONS,
      locale: 'en',
      isLoading: false,
      translate: (key: string) => key,
      setLocale: vi.fn(),
      availableLocales: ['en', 'tr'],
      dynamicLocales: [],
      progress: { loaded: 1, total: 1 },
    }),
  }
})

vi.mock('@/hooks/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    displayCurrency: 'TRY',
    convert: (v: number) => v,
    formatConverted: (v: number) => `₺${v.toLocaleString('en-US')}`,
    formatConvertedCompact: (v: number) => `₺${v}`,
    isReady: true,
  }),
}))

const base: AnalyzedPolicy = {
  id: 'p-metrics',
  policyNumber: 'KAS-002',
  provider: 'Test Insurer',
  typeTr: 'Kasko',
  type: 'kasko',
  coverage: 500000,
  premium: 12500,
  deductible: 1500,
  startDate: '2026-01-01',
  expiryDate: '2027-01-01',
  status: 'active',
  insuredPerson: 'Jane Driver',
  documentType: 'policy',
  uploadDate: '2026-01-15',
  logo: '🚗',
  fileName: 'kasko.pdf',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
  aiConfidence: 0.9,
  aiInsights: [],
}

describe('PolicyKeyMetricsAndDiscounts', () => {
  it('renders premium and deductible in the formatted currency', () => {
    render(<PolicyKeyMetricsAndDiscounts policy={base} />)
    expect(screen.getByText('₺12,500')).toBeInTheDocument()
    expect(screen.getByText('₺1,500')).toBeInTheDocument()
  })

  it('shows "Not specified" amber when premiumMissing is true', () => {
    const policy = { ...base, premiumMissing: true }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    // The English translation for notSpecified renders; should replace the amount
    expect(screen.queryByText('₺12,500')).not.toBeInTheDocument()
  })

  it('shows conditional deductible label when kasko deductible is zero', () => {
    // After the Apr 30 cross-contamination fix the hardcoded AXA-specific
    // "Glass: 20% outside CASU" string was replaced with a generic
    // "Conditional — see details below" pointer that doesn't smuggle one
    // insurer's terminology onto unrelated policies.
    const policy = { ...base, deductible: 0 }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText(/Conditional — see details below/i)).toBeInTheDocument()
  })

  it('shows proportional-deductible label when deductiblePercent is set', () => {
    const policy = { ...base, deductiblePercent: 2, deductible: 0 }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText(/2% proportional deductible/i)).toBeInTheDocument()
  })

  it('omits the discounts block when policy has no discounts', () => {
    render(<PolicyKeyMetricsAndDiscounts policy={base} />)
    expect(screen.queryByText(/Discounts \/ Extra Benefits/i)).not.toBeInTheDocument()
  })

  it('renders NCD discount only when present', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      discounts: { ncdDiscount: 25, groupDiscount: null, otherDiscountPct: null },
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText('No Claims Discount')).toBeInTheDocument()
    expect(screen.getByText('%25')).toBeInTheDocument()
    expect(screen.queryByText('Group/Corporate Discount')).not.toBeInTheDocument()
  })

  it('renders all three discount categories when all are set', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      discounts: { ncdDiscount: 10, groupDiscount: 5, otherDiscountPct: 3 },
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText('No Claims Discount')).toBeInTheDocument()
    expect(screen.getByText('Group/Corporate Discount')).toBeInTheDocument()
    expect(screen.getByText('Other Discounts')).toBeInTheDocument()
  })

  it('hides discounts block when discounts object exists but all fields are null/zero', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      discounts: { ncdDiscount: null, groupDiscount: null, otherDiscountPct: null },
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.queryByText(/Discounts \/ Extra Benefits/i)).not.toBeInTheDocument()
  })
})
