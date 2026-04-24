import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VehicleInfoCard } from './VehicleInfoCard'
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

const basePolicy: AnalyzedPolicy = {
  id: 'p-veh',
  policyNumber: 'KAS-001',
  provider: 'Test Insurer',
  typeTr: 'Kasko',
  type: 'kasko',
  coverage: 500000,
  premium: 5000,
  deductible: 1000,
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

describe('VehicleInfoCard', () => {
  it('returns null for non-kasko policies', () => {
    const { container } = render(<VehicleInfoCard policy={{ ...basePolicy, type: 'home' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when vehicleInfo is missing', () => {
    const { container } = render(<VehicleInfoCard policy={basePolicy} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all vehicle fields when provided', () => {
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: {
        plate: '34 ABC 1234',
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        usage: 'personal',
        vehicleClass: 'M1',
      },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.getByText('34 ABC 1234')).toBeInTheDocument()
    expect(screen.getByText('Toyota')).toBeInTheDocument()
    expect(screen.getByText('Corolla')).toBeInTheDocument()
    expect(screen.getByText('2022')).toBeInTheDocument()
    expect(screen.getByText('personal')).toBeInTheDocument()
    expect(screen.getByText('M1')).toBeInTheDocument()
  })

  it('renders headline fields as "Cannot Verify" when missing instead of hiding them', () => {
    // Reviewer feedback (Apr 24): hiding rows is worse than showing empty —
    // hidden rows look intentional (as if the policy didn't contain the data),
    // whereas an explicit "Cannot Verify" row signals extraction failure.
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: {
        plate: '06 XYZ 5678',
      },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.getByText('06 XYZ 5678')).toBeInTheDocument()
    // Plate, Make, Model, Year are headline fields and always render. When
    // missing, the value text is the locale-aware "Cannot Verify" placeholder.
    const cannotVerifyRows = screen.getAllByTestId('vehicle-field-cannot-verify')
    // make + model + year are missing → 3 placeholder rows.
    expect(cannotVerifyRows).toHaveLength(3)
    cannotVerifyRows.forEach((row) => {
      expect(row).toHaveTextContent('Cannot Verify')
    })
    // Raw values that aren't in the fixture must still not appear.
    expect(screen.queryByText('Toyota')).not.toBeInTheDocument()
  })

  it('does not render "Cannot Verify" rows for optional fields (usage, vehicleClass)', () => {
    // Usage and vehicleClass are optional metadata — showing "Cannot Verify"
    // for them would add noise; they stay conditionally rendered.
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: {
        plate: '06 XYZ 5678',
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
      },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.queryAllByTestId('vehicle-field-cannot-verify')).toHaveLength(0)
    expect(screen.queryByText('Usage Type')).not.toBeInTheDocument()
    expect(screen.queryByText('Vehicle Class')).not.toBeInTheDocument()
  })

  it('shows the commercial-vehicle callout when usage is "commercial"', () => {
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: { plate: '34 COM 1000', usage: 'commercial' },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.getByText(/Commercial Vehicle Policy/i)).toBeInTheDocument()
    expect(
      screen.getByText(/market benchmark and price analyses are disabled/i)
    ).toBeInTheDocument()
  })

  it('hides the commercial callout for personal usage', () => {
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: { plate: '34 PER 1001', usage: 'personal' },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.queryByText(/Commercial Vehicle Policy/i)).not.toBeInTheDocument()
  })

  it('matches commercial usage case-insensitively', () => {
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: { plate: '34 COM 1002', usage: 'COMMERCIAL' },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.getByText(/Commercial Vehicle Policy/i)).toBeInTheDocument()
  })
})
