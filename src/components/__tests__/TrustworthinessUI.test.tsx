import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { PolicyDetailView } from '../PolicyDetailView'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as usePoliciesHook from '@/lib/policy-context'
import * as useDisplaySafeSummaryHook from '@/hooks/useDisplaySafeSummary'
import * as usePolicyEvaluationHook from '@/hooks/usePolicyEvaluation'
import { toast } from 'sonner'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

// Build mock i18n return value
const mockI18n = {
  locale: 'en',
  t: EN_TRANSLATIONS,
  translate: (k: string) => k,
  isLoading: false,
  isRTL: false,
  setLocale: vi.fn(),
  progress: { status: 'idle', progress: 100, message: '' },
  localeInfo: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  availableLocales: {},
  dynamicLocales: [],
  refreshTranslations: vi.fn(),
}

// Mock all i18n entry points the component may resolve through
vi.mock('@/lib/i18n', () => ({
  useI18n: () => mockI18n,
  useTranslation: () => ({
    t: EN_TRANSLATIONS,
    translate: (k: string) => k,
    locale: 'en',
    isLoading: false,
  }),
}))
vi.mock('@/lib/i18n/i18n-context', () => ({
  useI18n: () => mockI18n,
  useTranslation: () => ({
    t: EN_TRANSLATIONS,
    translate: (k: string) => k,
    locale: 'en',
    isLoading: false,
  }),
  I18nProvider: ({ children }: any) => children,
  useLanguageSelector: () => ({
    currentLocale: 'en',
    locales: [],
    setLocale: vi.fn(),
    isLoading: false,
    progress: { status: 'idle', progress: 100, message: '' },
  }),
}))

// Mock remaining dependencies
vi.mock('@/lib/policy-context')
vi.mock('@/hooks/useDisplaySafeSummary')
vi.mock('@/hooks/usePolicyEvaluation')
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ formatConverted: (val: any) => String(val), targetCurrency: 'TRY' }),
}))
vi.mock('@/hooks/usePilotGateOptions', () => ({
  // Return shape mirrors the real hook — `featureFlags`, NOT `flags`. The old
  // mock used `{ flags: {} }` which only passed because `useDisplaySafeSummary`
  // has a defensive `options?.featureFlags || {}` fallback. Using the real key
  // here means tests regress loudly if that fallback ever tightens.
  usePilotGateOptions: () => ({
    featureFlags: {},
    userSegments: [],
    userId: undefined,
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useFileUpload', () => ({
  useFileUpload: () => ({ uploadFiles: vi.fn(), isUploading: false }),
}))

const mockPolicy = {
  id: 'test-policy',
  policyNumber: 'TEST-123',
  type: 'kasko',
  status: 'active',
  insuranceCompany: 'Test Co',
  provider: 'Test Co',
  premium: { amount: 1000, currency: 'TRY' },
  coverageLimit: { amount: 1000000, currency: 'TRY' },
  coverages: [],
  exclusions: [],
  aiInsights: [],
}

const renderComponent = (locationState = {}) => {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/policy/test-policy', state: locationState }]}>
      <Routes>
        <Route path="/policy/:id" element={<PolicyDetailView />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Sprint 1: Trustworthiness Hardening UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(usePoliciesHook, 'usePolicies').mockReturnValue({
      getPolicyById: () => mockPolicy,
      fetchPolicyById: vi.fn().mockResolvedValue(mockPolicy),
    } as any)
    vi.spyOn(usePolicyEvaluationHook, 'usePolicyEvaluation').mockReturnValue({
      evaluation: {
        grade: 'B',
        status: 'fair',
        overallScore: 80,
        scoreBreakdown: {
          premium: { score: 80 },
          coverage: { score: 80 },
          deductible: { score: 80 },
          compliance: { score: 80 },
          value: { score: 80 },
        },
        marketComparison: {
          premiumPercentile: 50,
          coveragePercentile: 50,
          competitivePosition: 'average',
        },
        recommendations: [],
        scenarioCards: [],
      },
      isEvaluating: false,
    } as any)
  })

  it('Renders UNVERIFIED banner and blocks export/share when isDraft is true', () => {
    vi.spyOn(useDisplaySafeSummaryHook, 'useDisplaySafeSummary').mockReturnValue({
      isDraft: true,
      isPilotResult: false,
    } as any)

    renderComponent()

    // Banner renders (English since locale = 'en')
    expect(screen.getByText(/UNVERIFIED AI OUTPUT/i)).toBeInTheDocument()

    // Export blocked: the button inside the titled wrapper should be disabled
    const exportWrapper = screen.getByTitle('Export disabled for unverified policies')
    const exportBtn = exportWrapper.querySelector('button')
    expect(exportBtn).toBeTruthy()
    expect(exportBtn!.disabled).toBe(true)

    // Share blocked
    const shareButton = screen.getByLabelText(/Share/i)
    fireEvent.click(shareButton)
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'))
  })

  it('Renders UNVERIFIED banner and blocks export/share when isVerificationPending is true', () => {
    vi.spyOn(useDisplaySafeSummaryHook, 'useDisplaySafeSummary').mockReturnValue({
      isDraft: false,
      isPilotResult: true,
      pilotReviewStatus: 'pending_review',
    } as any)

    renderComponent()
    expect(screen.getByText(/UNVERIFIED AI OUTPUT/i)).toBeInTheDocument()

    // Share blocked
    const shareButton = screen.getByLabelText(/Share/i)
    fireEvent.click(shareButton)
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'))
  })

  it('Renders UNVERIFIED banner and blocks export/share when lowConfidence is true', () => {
    vi.spyOn(useDisplaySafeSummaryHook, 'useDisplaySafeSummary').mockReturnValue({
      isDraft: false,
      isPilotResult: false,
    } as any)

    renderComponent({ lowConfidence: true })
    expect(screen.getByText(/UNVERIFIED AI OUTPUT/i)).toBeInTheDocument()

    // Share blocked
    const shareButton = screen.getByLabelText(/Share/i)
    fireEvent.click(shareButton)
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'))
  })

  it('Renders UNVERIFIED banner and blocks export/share when evaluation.isProvisional is true because aiConfidence < 0.85', () => {
    vi.spyOn(useDisplaySafeSummaryHook, 'useDisplaySafeSummary').mockReturnValue({
      isDraft: false,
      isPilotResult: false,
    } as any)
    vi.spyOn(usePolicyEvaluationHook, 'usePolicyEvaluation').mockReturnValue({
      evaluation: {
        isProvisional: true,
        aiConfidence: 0.8,
        grade: 'C',
        status: 'fair',
        overallScore: 60,
        scoreBreakdown: {
          premium: { score: 60 },
          coverage: { score: 60 },
          deductible: { score: 60 },
          compliance: { score: 60 },
          value: { score: 60 },
        },
        recommendations: [],
        scenarioCards: [],
      },
      isEvaluating: false,
    } as any)

    renderComponent()
    expect(screen.getByText(/UNVERIFIED AI OUTPUT/i)).toBeInTheDocument()
    expect(
      screen.getByTitle('Export disabled for unverified policies').querySelector('button')!.disabled
    ).toBe(true)
    fireEvent.click(screen.getByLabelText(/Share/i))
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'))
  })

  it("Renders UNVERIFIED banner and blocks export/share when evaluation.isProvisional is true because benchmarkStatus === 'untrusted'", () => {
    vi.spyOn(useDisplaySafeSummaryHook, 'useDisplaySafeSummary').mockReturnValue({
      isDraft: false,
      isPilotResult: false,
    } as any)
    vi.spyOn(usePolicyEvaluationHook, 'usePolicyEvaluation').mockReturnValue({
      evaluation: {
        isProvisional: true,
        benchmarkStatus: 'untrusted',
        grade: 'C',
        status: 'fair',
        overallScore: 60,
        scoreBreakdown: {
          premium: { score: 60 },
          coverage: { score: 60 },
          deductible: { score: 60 },
          compliance: { score: 60 },
          value: { score: 60 },
        },
        recommendations: [],
        scenarioCards: [],
      },
      isEvaluating: false,
    } as any)

    renderComponent()
    expect(screen.getByText(/UNVERIFIED AI OUTPUT/i)).toBeInTheDocument()
    expect(
      screen.getByTitle('Export disabled for unverified policies').querySelector('button')!.disabled
    ).toBe(true)
    fireEvent.click(screen.getByLabelText(/Share/i))
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'))
  })

  it('Renders UNVERIFIED banner and blocks export/share when evaluation.isProvisional is true because benchmark is missing', () => {
    vi.spyOn(useDisplaySafeSummaryHook, 'useDisplaySafeSummary').mockReturnValue({
      isDraft: false,
      isPilotResult: false,
    } as any)
    vi.spyOn(usePolicyEvaluationHook, 'usePolicyEvaluation').mockReturnValue({
      evaluation: {
        isProvisional: true,
        benchmark: undefined,
        grade: 'C',
        status: 'fair',
        overallScore: 60,
        scoreBreakdown: {
          premium: { score: 60 },
          coverage: { score: 60 },
          deductible: { score: 60 },
          compliance: { score: 60 },
          value: { score: 60 },
        },
        recommendations: [],
        scenarioCards: [],
      },
      isEvaluating: false,
    } as any)

    renderComponent()
    expect(screen.getByText(/UNVERIFIED AI OUTPUT/i)).toBeInTheDocument()
    expect(
      screen.getByTitle('Export disabled for unverified policies').querySelector('button')!.disabled
    ).toBe(true)
    fireEvent.click(screen.getByLabelText(/Share/i))
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'))
  })
  it('Renders new ScenarioCard structures without errors', () => {
    vi.spyOn(usePolicyEvaluationHook, 'usePolicyEvaluation').mockReturnValue({
      evaluation: {
        grade: 'A',
        status: 'excellent',
        overallScore: 90,
        scoreBreakdown: {
          premium: { score: 90 },
          coverage: { score: 90 },
          deductible: { score: 90 },
          compliance: { score: 90 },
          value: { score: 90 },
        },
        marketComparison: {
          premiumPercentile: 50,
          coveragePercentile: 50,
          competitivePosition: 'average',
        },
        recommendations: [],
        scenarioCards: [
          {
            id: 'mock-scenario-1',
            title: 'Earthquake Damage',
            description: 'Major earthquake damage to vehicle',
            financialStatus: 'partially_covered',
            insurerPays: 'Depends on sublimit',
            userPays: 'Remaining balance',
            trigger: 'Trigger condition met',
            whyItMatters: 'Important to know for safety',
          },
        ],
      },
      isEvaluating: false,
    } as any)

    renderComponent()

    // Assert components of ScenarioCard render correctly
    expect(screen.getByText('Earthquake Damage')).toBeInTheDocument()
    expect(screen.getByText('Major earthquake damage to vehicle')).toBeInTheDocument()

    // Check specific fields using the expected labels and values format
    expect(screen.getByText(/Depends on sublimit/i)).toBeInTheDocument()
    expect(screen.getByText(/Remaining balance/i)).toBeInTheDocument()
    expect(screen.getByText(/Trigger condition met/i)).toBeInTheDocument()
    expect(screen.getByText(/Important to know for safety/i)).toBeInTheDocument()
  })
})
