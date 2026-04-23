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

  it('omits fields that are not present', () => {
    const policy: AnalyzedPolicy = {
      ...basePolicy,
      vehicleInfo: {
        plate: '06 XYZ 5678',
      },
    }

    render(<VehicleInfoCard policy={policy} />)

    expect(screen.getByText('06 XYZ 5678')).toBeInTheDocument()
    // Make/Model/Year/Usage/Class should not render their labels when absent
    expect(screen.queryByText('Toyota')).not.toBeInTheDocument()
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
