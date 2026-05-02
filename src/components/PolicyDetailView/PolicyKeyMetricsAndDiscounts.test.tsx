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

  it('renders Net + BSMV breakdown rows when both premiumNet and premiumTax are present', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      premium: 12500,
      premiumNet: 10593,
      premiumTax: 1907,
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    // Headline gross premium still renders
    expect(screen.getByText('₺12,500')).toBeInTheDocument()
    // The two breakdown rows render with their bilingual labels and amounts
    expect(screen.getByText('Net Premium')).toBeInTheDocument()
    expect(screen.getByText('BSMV Tax')).toBeInTheDocument()
    expect(screen.getByText('₺10,593')).toBeInTheDocument()
    expect(screen.getByText('₺1,907')).toBeInTheDocument()
  })

  it('omits the Net + BSMV breakdown when only one of the two is present', () => {
    const onlyNet: AnalyzedPolicy = {
      ...base,
      premium: 12500,
      premiumNet: 10593,
      premiumTax: undefined,
    }
    render(<PolicyKeyMetricsAndDiscounts policy={onlyNet} />)
    expect(screen.queryByText('Net Premium')).not.toBeInTheDocument()
    expect(screen.queryByText('BSMV Tax')).not.toBeInTheDocument()
  })

  // Sprint 3 #14 — AS+ servis network callout
  it('renders the servis network callout when an "Anlaşmalı olmayan servis" scenario is present', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      conditionalDeductibles: ['Anlaşmalı olmayan servis: %35'],
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    const callout = screen.getByTestId('servis-network-callout')
    expect(callout).toBeInTheDocument()
    expect(callout).toHaveTextContent(/authorized service network/i)
    expect(callout.getAttribute('role')).toBe('note')
  })

  it('omits the servis network callout when no AS+ scenario is present', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      conditionalDeductibles: ['Pert araç muafiyeti: %20', 'Sürücü yaşı: %10'],
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.queryByTestId('servis-network-callout')).not.toBeInTheDocument()
  })

  it('omits the servis network callout when conditionalDeductibles is missing/empty', () => {
    render(<PolicyKeyMetricsAndDiscounts policy={base} />)
    expect(screen.queryByTestId('servis-network-callout')).not.toBeInTheDocument()
  })

  // Sprint 3 PR-S3.2 — previousInsurer transfer context on NCD label
  it('appends "preserved from <insurer>" suffix to NCD label when previousInsurer is set', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      discounts: { ncdDiscount: 50, groupDiscount: null, otherDiscountPct: null, evidence: null },
      previousInsurer: 'Sompo Japan',
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText(/No Claims Discount.*preserved from Sompo Japan/i)).toBeInTheDocument()
    expect(screen.getByText('%50')).toBeInTheDocument()
  })

  it('renders bare "No Claims Discount" when previousInsurer is undefined', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      discounts: { ncdDiscount: 50, groupDiscount: null, otherDiscountPct: null, evidence: null },
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText('No Claims Discount')).toBeInTheDocument()
    // No "preserved from" suffix
    expect(screen.queryByText(/preserved from/i)).not.toBeInTheDocument()
  })

  // Sprint 1 PR-S1.1 — hero deductible fallback when deductiblePercent is missing
  it('renders highest-% conditional scenario when deductiblePercent is missing', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      deductible: 0,
      conditionalDeductibles: [
        'Anlaşmalı olmayan servis: %35',
        'Rent-a-car / ticari kullanım: %80',
        'Pert araç muafiyeti: %20',
      ],
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    // Highest-% wins: 80
    expect(screen.getByText(/%80 — Rent-a-car \/ ticari kullanım/i)).toBeInTheDocument()
    // The generic placeholder must NOT render when fallback succeeds
    expect(screen.queryByText(/Conditional — see details below/i)).not.toBeInTheDocument()
  })

  it('falls through to generic Conditional label when conditionalDeductibles has no %N entries', () => {
    const policy: AnalyzedPolicy = {
      ...base,
      deductible: 0,
      // No %N — these don't match the fallback regex
      conditionalDeductibles: ['Some descriptive text without a percent'],
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText(/Conditional — see details below/i)).toBeInTheDocument()
  })

  it('prioritizes existing deductiblePercent over the fallback scenario', () => {
    // When both deductiblePercent AND conditionalDeductibles are present,
    // the explicit deductiblePercent wins (the fallback is a safety net only).
    const policy: AnalyzedPolicy = {
      ...base,
      deductible: 0,
      deductiblePercent: 5,
      conditionalDeductibles: ['Rent-a-car / ticari kullanım: %80'],
    }
    render(<PolicyKeyMetricsAndDiscounts policy={policy} />)
    expect(screen.getByText(/5% proportional deductible/i)).toBeInTheDocument()
    // Fallback string must NOT render when deductiblePercent is set
    expect(screen.queryByText(/%80 — Rent-a-car/i)).not.toBeInTheDocument()
  })
})
