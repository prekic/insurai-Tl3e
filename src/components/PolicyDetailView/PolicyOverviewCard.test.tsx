import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PolicyOverviewCard } from './PolicyOverviewCard'
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
  id: 'p-overview',
  policyNumber: 'KAS-100',
  provider: 'Test Insurer',
  type: 'kasko',
  typeTr: 'Kasko',
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

describe('PolicyOverviewCard — bundle policy detection (P1 #4)', () => {
  it('does NOT render bundle badge when isBundle is false/undefined', () => {
    render(<PolicyOverviewCard policy={base} />)
    expect(screen.queryByText(/Bundle Policy/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('bundle-products-block')).not.toBeInTheDocument()
  })

  it('renders bundle badge in header when isBundle=true', () => {
    const bundled: AnalyzedPolicy = { ...base, isBundle: true }
    render(<PolicyOverviewCard policy={bundled} />)
    expect(screen.getByText('Bundle Policy')).toBeInTheDocument()
  })

  it('renders bundleProducts list when isBundle=true and products are present', () => {
    const bundled: AnalyzedPolicy = {
      ...base,
      isBundle: true,
      bundleProducts: [
        'Genişletilmiş Kasko',
        'Koltuk Ferdi Kaza',
        'Artan Mali Sorumluluk',
        'Hukuksal Koruma',
      ],
    }
    render(<PolicyOverviewCard policy={bundled} />)
    expect(screen.getByTestId('bundle-products-block')).toBeInTheDocument()
    expect(screen.getByText('Genişletilmiş Kasko')).toBeInTheDocument()
    expect(screen.getByText('Koltuk Ferdi Kaza')).toBeInTheDocument()
    expect(screen.getByText('Artan Mali Sorumluluk')).toBeInTheDocument()
    expect(screen.getByText('Hukuksal Koruma')).toBeInTheDocument()
  })

  it('hides product list when bundleProducts is empty even if isBundle=true', () => {
    const bundled: AnalyzedPolicy = { ...base, isBundle: true, bundleProducts: [] }
    render(<PolicyOverviewCard policy={bundled} />)
    // Badge still shows (the bundle signal is true), but the product-list
    // block is suppressed when there's nothing to show.
    expect(screen.getByText('Bundle Policy')).toBeInTheDocument()
    expect(screen.queryByTestId('bundle-products-block')).not.toBeInTheDocument()
  })
})
