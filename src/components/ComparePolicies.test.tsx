import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComparePolicies } from './ComparePolicies'
import type { AnalyzedPolicy } from '@/types/policy'

// ─── Mock data ───────────────────────────────────────────────────────

function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'p1',
    policyNumber: 'POL-001',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 12000,
    deductible: 3000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [],
    exclusions: [],
    aiInsights: [],
    aiConfidence: 0.85,
    logo: '🛡️',
    ...overrides,
  } as AnalyzedPolicy
}

const policyA = makePolicy({ id: 'p1', provider: 'Allianz', premium: 12000, coverage: 500000 })
const policyB = makePolicy({ id: 'p2', provider: 'AXA', premium: 15000, coverage: 700000 })
const policyC = makePolicy({ id: 'p3', provider: 'Mapfre', premium: 10000, coverage: 400000 })

// ─── Mocks ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

const mockComparison = {
  comparison: null as ReturnType<typeof buildMockComparison> | null,
  isValid: false,
  validationMessage: 'Select at least 2 policies',
  error: null as Error | null,
}

vi.mock('@/hooks/usePolicyComparison', () => ({
  usePolicyComparison: () => mockComparison,
}))

const mockPoliciesData = {
  policies: [policyA, policyB, policyC] as AnalyzedPolicy[],
  isLoading: false,
}

vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => mockPoliciesData,
}))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      common: { loading: 'Loading...' },
      comparison: {
        title: 'Policy Comparison',
        subtitle: 'Compare your policies side by side',
        selectPolicies: 'Select Policies',
        clearAll: 'Clear All',
        selectedCount: '{count} / 4 selected (min 2)',
        policiesNoLongerExist: '{count} policy(ies) no longer exist',
        policiesDeletedOrMoved: 'These policies may have been deleted or moved.',
        selectPoliciesToCompare: 'Select Policies to Compare',
        uploadFirst: 'Upload policies first to compare them',
        uploadPolicy: 'Upload Policy',
        selectMinTwo: 'Select at least 2 policies to compare',
        comparisonError: 'Comparison error',
        categoryWinners: 'Category Winners',
        metricsComparison: 'Metrics Comparison',
        coverageMatrix: 'Coverage Matrix',
        keyDifferences: 'Key Differences',
        major: 'Major',
        moderate: 'Moderate',
        minor: 'Minor',
        tradeoffs: 'Tradeoffs',
        aiRecommendation: 'AI Recommendation',
        recommendedChoice: 'Top-ranked by model',
        improvementSuggestions: 'Improvement Suggestions',
        recommendation: 'Recommendation:',
        exportComparison: 'Export',
        exportPdf: 'Export PDF',
        exportCsv: 'Export CSV',
        quickStats: 'Quick Stats',
        avgScore: 'Avg Score',
        avgPremium: 'Avg Premium',
        totalCoverage: 'Total Coverage',
        policiesCompared: 'Policies',
        scoreChart: 'Score Comparison',
        premium: 'Premium',
        coverage: 'Coverage',
        deductible: 'Deductible',
        compliance: 'Compliance',
        value: 'Value',
        overall: 'Overall',
        best: 'Best',
        included: 'Included',
        notIncluded: 'Not Included',
        pdfExported: 'PDF opened in print dialog',
        csvExported: 'CSV file downloaded',
        addPolicy: 'Add policy',
        removePolicy: 'Remove policy',
      },
    },
    locale: 'en',
    isRTL: false,
  }),
}))

vi.mock('@/hooks/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    displayCurrency: 'TRY',
    convert: (v: number) => v,
    formatConverted: (v: number) => `₺${v.toLocaleString()}`,
    formatConvertedCompact: (v: number) => `₺${v.toLocaleString()}`,
    isReady: true,
  }),
}))

vi.mock('@/hooks/usePilotGateOptions', () => ({
  usePilotGateOptions: () => ({
    featureFlags: {},
    userSegments: [],
    userId: 'test-user',
    isLoading: false,
  }),
}))

let mockIsDraft = false
vi.mock('@/lib/analysis/kasko-pilot-gate', () => ({
  evaluateKaskoPilotGate: () => ({
    isDraft: mockIsDraft,
    isActive: false,
    reason: 'flag_disabled',
  }),
}))

vi.mock('@/lib/actuarial-engine', () => ({
  emitEvaluation: vi.fn(),
  DEFAULT_TOPSIS_CRITERIA: [
    { code: 'premium', label: 'Premium', labelTr: 'Prim', weight: 0.2, direction: 'cost' },
    { code: 'coverage', label: 'Coverage', labelTr: 'Teminat', weight: 0.25, direction: 'benefit' },
    {
      code: 'deductible',
      label: 'Deductible',
      labelTr: 'Muafiyet',
      weight: 0.15,
      direction: 'cost',
    },
    { code: 'compliance', label: 'Compliance', labelTr: 'Uyum', weight: 0.2, direction: 'benefit' },
    { code: 'value', label: 'Value', labelTr: 'Değer', weight: 0.1, direction: 'benefit' },
    { code: 'eoop', label: 'EOOP', labelTr: 'EOOP', weight: 0.1, direction: 'cost' },
  ],
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockExportPdf = vi.fn()
const mockExportCsv = vi.fn()
vi.mock('@/lib/export', () => ({
  exportComparisonToPDF: (...args: unknown[]) => mockExportPdf(...args),
  exportComparisonToCSV: (...args: unknown[]) => mockExportCsv(...args),
}))

// Mock child evaluation components
vi.mock('./evaluation', () => ({
  ComparisonTable: () => <div data-testid="comparison-table">ComparisonTable</div>,
  ComparisonSummary: () => <div data-testid="comparison-summary">ComparisonSummary</div>,
  CoverageMatrix: () => <div data-testid="coverage-matrix">CoverageMatrix</div>,
  CoverageSummary: () => <div data-testid="coverage-summary">CoverageSummary</div>,
  RecommendationList: () => <div data-testid="recommendation-list">RecommendationList</div>,
  GradeBadge: ({ grade }: { grade: string }) => <span data-testid="grade-badge">{grade}</span>,
}))

vi.mock('./PolicyCard', () => ({
  PolicyCard: ({
    policy,
    isSelected,
    onSelect,
  }: {
    policy: AnalyzedPolicy
    isSelected?: boolean
    onSelect?: () => void
  }) => (
    <div data-testid={`policy-card-${policy.id}`} data-selected={isSelected} onClick={onSelect}>
      {policy.provider}
    </div>
  ),
}))

// ─── Helpers ─────────────────────────────────────────────────────────

function buildMockComparison() {
  const makeEval = (score: number, grade: string) => ({
    overallScore: score,
    grade,
    status: 'good' as const,
    recommendations: [
      {
        type: 'coverage',
        priority: 'medium',
        title: 'Improve',
        description: 'Add more',
        titleTr: 'Geliştir',
        descriptionTr: 'Daha fazla',
      },
    ],
    scoreBreakdown: {
      premium: { score: score - 5, weight: 20, weightedScore: (score - 5) * 0.2 },
      coverage: { score: score + 3, weight: 30, weightedScore: (score + 3) * 0.3 },
      deductible: { score: score - 2, weight: 15, weightedScore: (score - 2) * 0.15 },
      compliance: { score, weight: 20, weightedScore: score * 0.2 },
      value: { score: score + 1, weight: 15, weightedScore: (score + 1) * 0.15 },
    },
  })

  return {
    policies: [
      { policy: policyA, label: 'Allianz', evaluation: makeEval(82, 'B') },
      { policy: policyB, label: 'AXA', evaluation: makeEval(75, 'B') },
    ],
    rankings: [
      {
        policyId: 'p1',
        rank: 1,
        score: 82,
        actuarialRank: 1,
        actuarialCloseness: 0.78,
        actuarialGrade: 'B',
      },
      {
        policyId: 'p2',
        rank: 2,
        score: 75,
        actuarialRank: 2,
        actuarialCloseness: 0.65,
        actuarialGrade: 'C',
      },
    ],
    winners: {
      overallBest: 'p1',
      premium: 'p1',
      coverage: 'p2',
      deductible: 'p1',
      compliance: 'p1',
      value: 'p1',
    },
    analysis: {
      recommendation: 'Allianz offers better overall value.',
      recommendationTR: 'Allianz daha iyi genel değer sunuyor.',
      keyDifferences: [
        {
          aspect: 'Premium',
          aspectTR: 'Prim',
          description: 'Allianz costs less',
          descriptionTR: 'Allianz daha ucuz',
          significance: 'major' as const,
          favoredPolicy: 'p1',
        },
      ],
      tradeoffs: [
        {
          option1: { policyId: 'p1', advantage: 'Lower premium', advantageTR: 'Düşük prim' },
          option2: { policyId: 'p2', advantage: 'Higher coverage', advantageTR: 'Yüksek teminat' },
          recommendation: 'Choose based on budget',
          recommendationTR: 'Bütçeye göre seçin',
        },
      ],
    },
    coverageMatrix: [
      {
        coverageName: 'Collision',
        coverageNameTR: 'Çarpışma',
        policies: [
          { policyId: 'p1', included: true, limit: 500000 },
          { policyId: 'p2', included: true, limit: 700000 },
        ],
      },
      {
        coverageName: 'Theft',
        coverageNameTR: 'Hırsızlık',
        policies: [
          { policyId: 'p1', included: true, limit: 500000 },
          { policyId: 'p2', included: false, limit: 0 },
        ],
      },
    ],
    actuarialResults: undefined,
  }
}

function resetMocks() {
  mockNavigate.mockClear()
  mockSetSearchParams.mockClear()
  mockExportPdf.mockClear()
  mockExportCsv.mockClear()
  mockSearchParams = new URLSearchParams()
  mockComparison.comparison = null
  mockComparison.isValid = false
  mockComparison.validationMessage = 'Select at least 2 policies'
  mockComparison.error = null
  mockPoliciesData.policies = [policyA, policyB, policyC]
  mockPoliciesData.isLoading = false
  mockIsDraft = false
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ComparePolicies', () => {
  beforeEach(() => {
    resetMocks()
  })

  // ── Loading state ──

  it('renders loading state', () => {
    mockPoliciesData.isLoading = true
    render(<ComparePolicies />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  // ── Empty / Initial state ──

  it('renders page title and subtitle', () => {
    render(<ComparePolicies />)
    expect(screen.getByText('Policy Comparison')).toBeInTheDocument()
    expect(screen.getByText('Compare your policies side by side')).toBeInTheDocument()
  })

  it('shows policy selector by default when no policies selected', () => {
    render(<ComparePolicies />)
    expect(screen.getByText('Select Policies to Compare')).toBeInTheDocument()
  })

  it('renders policy cards in the selector', () => {
    render(<ComparePolicies />)
    expect(screen.getByTestId('policy-card-p1')).toBeInTheDocument()
    expect(screen.getByTestId('policy-card-p2')).toBeInTheDocument()
    expect(screen.getByTestId('policy-card-p3')).toBeInTheDocument()
  })

  it('shows empty state when no policies exist', () => {
    mockPoliciesData.policies = []
    render(<ComparePolicies />)
    expect(screen.getByText('Upload policies first to compare them')).toBeInTheDocument()
    expect(screen.getByText('Upload Policy')).toBeInTheDocument()
  })

  it('navigates to upload on Upload Policy button click', () => {
    mockPoliciesData.policies = []
    render(<ComparePolicies />)
    fireEvent.click(screen.getByText('Upload Policy'))
    expect(mockNavigate).toHaveBeenCalledWith('/upload?autoOpen=true')
  })

  // ── Validation message ──

  it('shows validation message when fewer than 2 policies selected', () => {
    mockComparison.isValid = false
    mockComparison.validationMessage = 'Select at least 2 policies'
    render(<ComparePolicies />)
    expect(screen.getByText('Select at least 2 policies to compare')).toBeInTheDocument()
  })

  // ── URL param handling ──

  it('reads policy IDs from URL params', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    mockComparison.validationMessage = ''
    render(<ComparePolicies />)
    // Selected policies preview shows provider names (may appear multiple times in preview + chart)
    expect(screen.getAllByText('Allianz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AXA').length).toBeGreaterThan(0)
  })

  it('shows warning for invalid URL IDs', () => {
    mockSearchParams = new URLSearchParams('ids=p1,nonexistent')
    render(<ComparePolicies />)
    expect(screen.getByText(/1 policy\(ies\) no longer exist/)).toBeInTheDocument()
  })

  // ── Selection interactions ──

  it('selects a policy when card is clicked', () => {
    render(<ComparePolicies />)
    fireEvent.click(screen.getByTestId('policy-card-p1'))
    expect(mockSetSearchParams).toHaveBeenCalled()
    const [params] = mockSetSearchParams.mock.calls[0]
    expect(params.get('ids')).toBe('p1')
  })

  it('deselects a policy when already-selected card is clicked', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    render(<ComparePolicies />)
    // Open selector first (it's hidden when policies are selected)
    fireEvent.click(screen.getByText('Select Policies'))
    // Click on p1 card in selector to toggle off
    fireEvent.click(screen.getByTestId('policy-card-p1'))
    expect(mockSetSearchParams).toHaveBeenCalled()
    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1]
    const [params] = lastCall
    expect(params.get('ids')).toBe('p2')
  })

  it('shows Clear All button when policies are selected', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    render(<ComparePolicies />)
    expect(screen.getByText('Clear All')).toBeInTheDocument()
  })

  it('clears all selections when Clear All is clicked', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    render(<ComparePolicies />)
    fireEvent.click(screen.getByText('Clear All'))
    expect(mockSetSearchParams).toHaveBeenCalled()
    const [params] = mockSetSearchParams.mock.calls[0]
    expect(params.has('ids')).toBe(false)
  })

  it('removes a policy via the X button in selected preview', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    render(<ComparePolicies />)
    const removeBtn = screen.getByLabelText('Remove policy Allianz')
    fireEvent.click(removeBtn)
    expect(mockSetSearchParams).toHaveBeenCalled()
    const [params] = mockSetSearchParams.mock.calls[0]
    expect(params.get('ids')).toBe('p2')
  })

  // ── Selected policies preview ──

  it('shows numbered badges and provider names in preview', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    render(<ComparePolicies />)
    // Numbered badges may appear in preview + chart legend — check at least one
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
  })

  it('shows Add policy button when fewer than 4 policies selected', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true
    render(<ComparePolicies />)
    expect(screen.getByText('Add policy')).toBeInTheDocument()
  })

  // ── Error state ──

  it('renders error message when comparison fails', () => {
    mockComparison.error = new Error('Something went wrong')
    render(<ComparePolicies />)
    expect(screen.getByText('Comparison error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  // ── Comparison results ──

  describe('with comparison results', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('ids=p1,p2')
      mockComparison.comparison = buildMockComparison()
      mockComparison.isValid = true
      mockComparison.validationMessage = ''
      mockComparison.error = null
    })

    it('renders Quick Stats card', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Quick Stats')).toBeInTheDocument()
      expect(screen.getByText('Policies')).toBeInTheDocument()
      // '2' may appear in multiple places (Quick Stats, preview badges, chart legend)
      expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    })

    it('renders avg score in Quick Stats', () => {
      render(<ComparePolicies />)
      // (82 + 75) / 2 = 78.5 → 79 rounded
      expect(screen.getByText('79/100')).toBeInTheDocument()
    })

    it('renders Score Comparison Chart', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Score Comparison')).toBeInTheDocument()
      // Category labels appear in both Score Chart and other sections
      expect(screen.getAllByText('Premium').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Coverage').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Deductible').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Compliance').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Value').length).toBeGreaterThan(0)
    })

    it('renders Overall section with scores', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Overall')).toBeInTheDocument()
    })

    it('renders Category Winners section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Category Winners')).toBeInTheDocument()
      expect(screen.getByTestId('comparison-summary')).toBeInTheDocument()
    })

    it('renders Metrics Comparison collapsible section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Metrics Comparison')).toBeInTheDocument()
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument()
    })

    it('renders Coverage Matrix collapsible section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Coverage Matrix')).toBeInTheDocument()
      expect(screen.getByTestId('coverage-summary')).toBeInTheDocument()
    })

    it('renders Key Differences section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Key Differences')).toBeInTheDocument()
      // 'Premium' appears in multiple sections (Score Chart, Key Differences, etc.)
      expect(screen.getAllByText('Premium').length).toBeGreaterThan(0)
      expect(screen.getByText('Major')).toBeInTheDocument()
    })

    it('renders Tradeoffs section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Tradeoffs')).toBeInTheDocument()
      expect(screen.getByText('Lower premium')).toBeInTheDocument()
      expect(screen.getByText('Higher coverage')).toBeInTheDocument()
    })

    it('renders AI Recommendation section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('AI Recommendation')).toBeInTheDocument()
      expect(screen.getByText('Allianz offers better overall value.')).toBeInTheDocument()
    })

    it('renders winner highlight in recommendation', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Top-ranked by model')).toBeInTheDocument()
    })

    it('renders GradeBadge for winner', () => {
      render(<ComparePolicies />)
      const badges = screen.getAllByTestId('grade-badge')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders improvement suggestions list', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Improvement Suggestions')).toBeInTheDocument()
      expect(screen.getByTestId('recommendation-list')).toBeInTheDocument()
    })

    // ── TOPSIS section ──

    it('renders Model-Based Ranking section', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Model-Based Ranking')).toBeInTheDocument()
      expect(screen.getByText('Beta Engine')).toBeInTheDocument()
    })

    it('shows TOPSIS rank and closeness for each policy', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('#1 (78)')).toBeInTheDocument()
      expect(screen.getByText('#2 (65)')).toBeInTheDocument()
    })

    it('shows actuarial grade badges in legend', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Actuarial: B')).toBeInTheDocument()
      expect(screen.getByText('Actuarial: C')).toBeInTheDocument()
    })

    // ── TOPSIS Transparency Panel ──

    it('renders Ranking Criteria & Weights as collapsible details', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Ranking Criteria & Weights')).toBeInTheDocument()
    })

    it('shows criteria with direction badges and weights', () => {
      render(<ComparePolicies />)
      // Open the details panel
      fireEvent.click(screen.getByText('Ranking Criteria & Weights'))
      expect(screen.getAllByText('lower better').length).toBeGreaterThan(0)
      expect(screen.getAllByText('higher better').length).toBeGreaterThan(0)
    })

    it('shows disclaimer about model-based ranking', () => {
      render(<ComparePolicies />)
      fireEvent.click(screen.getByText('Ranking Criteria & Weights'))
      expect(
        screen.getByText(/This is a model-based ranking, not an objective truth/)
      ).toBeInTheDocument()
    })

    // ── Enhanced Coverage Matrix ──

    it('renders coverage matrix with diff highlighting', () => {
      render(<ComparePolicies />)
      // Coverage names from the mock
      expect(screen.getByText('Collision')).toBeInTheDocument()
      expect(screen.getByText('Theft')).toBeInTheDocument()
    })

    it('shows Not Included for missing coverage', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Not Included')).toBeInTheDocument()
    })

    it('shows Best label for highest limit', () => {
      render(<ComparePolicies />)
      // AXA has 700000 for Collision — highest
      const bestLabels = screen.getAllByText('Best')
      expect(bestLabels.length).toBeGreaterThan(0)
    })

    // ── Collapsible sections ──

    it('toggles Metrics Comparison section collapsed/expanded', () => {
      render(<ComparePolicies />)
      const sectionButton = screen.getByText('Metrics Comparison').closest('button')!
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument()
      fireEvent.click(sectionButton)
      expect(screen.queryByTestId('comparison-table')).not.toBeInTheDocument()
      fireEvent.click(sectionButton)
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument()
    })

    // ── Export dropdown ──

    it('shows export dropdown button', () => {
      render(<ComparePolicies />)
      expect(screen.getByText('Export')).toBeInTheDocument()
    })

    it('opens export dropdown on click', () => {
      render(<ComparePolicies />)
      fireEvent.click(screen.getByText('Export'))
      expect(screen.getByText('Export PDF')).toBeInTheDocument()
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
    })

    it('calls exportComparisonToPDF on PDF click', async () => {
      render(<ComparePolicies />)
      fireEvent.click(screen.getByText('Export'))
      fireEvent.click(screen.getByText('Export PDF'))
      expect(mockExportPdf).toHaveBeenCalledWith([policyA, policyB])
    })

    it('calls exportComparisonToCSV on CSV click', async () => {
      render(<ComparePolicies />)
      fireEvent.click(screen.getByText('Export'))
      fireEvent.click(screen.getByText('Export CSV'))
      expect(mockExportCsv).toHaveBeenCalledWith([policyA, policyB])
    })

    it('shows toast after export', async () => {
      const { toast } = await import('sonner')
      render(<ComparePolicies />)
      fireEvent.click(screen.getByText('Export'))
      fireEvent.click(screen.getByText('Export PDF'))
      expect(toast.success).toHaveBeenCalledWith('PDF opened in print dialog')
    })
  })

  // ── Draft TASLAK badge ──

  describe('draft policy badge', () => {
    it('shows TASLAK badge when policy is draft', () => {
      mockIsDraft = true
      mockSearchParams = new URLSearchParams('ids=p1,p2')
      mockComparison.comparison = buildMockComparison()
      mockComparison.isValid = true

      render(<ComparePolicies />)
      const badges = screen.getAllByText('TASLAK')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('does not show TASLAK badge when policy is not draft', () => {
      mockIsDraft = false
      mockSearchParams = new URLSearchParams('ids=p1,p2')
      mockComparison.comparison = buildMockComparison()
      mockComparison.isValid = true

      render(<ComparePolicies />)
      expect(screen.queryByText('TASLAK')).not.toBeInTheDocument()
    })
  })

  // ── Selector toggle ──

  it('toggles policy selector visibility', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    mockComparison.comparison = buildMockComparison()
    mockComparison.isValid = true

    render(<ComparePolicies />)
    // Selector should be hidden initially with 2+ policies
    // Click Select Policies button to toggle
    const toggleBtn = screen.getByText('Select Policies')
    fireEvent.click(toggleBtn)
    expect(screen.getByText('Select Policies to Compare')).toBeInTheDocument()
  })

  // ── DifferenceCard significance styling ──

  it('shows correct significance labels for differences', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    const comp = buildMockComparison()
    comp.analysis.keyDifferences = [
      {
        aspect: 'Premium',
        aspectTR: 'Prim',
        description: 'Much cheaper',
        descriptionTR: 'Çok daha ucuz',
        significance: 'major',
        favoredPolicy: 'p1',
      },
      {
        aspect: 'Coverage',
        aspectTR: 'Teminat',
        description: 'Slightly more',
        descriptionTR: 'Biraz daha fazla',
        // @ts-expect-error - mismatch due to schema update
        significance: 'minor',
        favoredPolicy: 'p2',
      },
    ]
    mockComparison.comparison = comp
    mockComparison.isValid = true

    render(<ComparePolicies />)
    expect(screen.getByText('Major')).toBeInTheDocument()
    expect(screen.getByText('Minor')).toBeInTheDocument()
  })

  // ── No differences/tradeoffs ──

  it('hides Key Differences when none exist', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    const comp = buildMockComparison()
    comp.analysis.keyDifferences = []
    mockComparison.comparison = comp
    mockComparison.isValid = true

    render(<ComparePolicies />)
    expect(screen.queryByText('Key Differences')).not.toBeInTheDocument()
  })

  it('hides Tradeoffs when none exist', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    const comp = buildMockComparison()
    comp.analysis.tradeoffs = []
    mockComparison.comparison = comp
    mockComparison.isValid = true

    render(<ComparePolicies />)
    expect(screen.queryByText('Tradeoffs')).not.toBeInTheDocument()
  })

  // ── No winner ──

  it('handles missing overallBest gracefully', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    const comp = buildMockComparison()
    comp.winners.overallBest = ''
    mockComparison.comparison = comp
    mockComparison.isValid = true

    render(<ComparePolicies />)
    expect(screen.getByText('AI Recommendation')).toBeInTheDocument()
    // No winner highlight should be shown
    expect(screen.queryByText('Top-ranked by model')).not.toBeInTheDocument()
  })

  // ── No recommendations for winner ──

  it('hides Improvement Suggestions when winner has no recommendations', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    const comp = buildMockComparison()
    comp.policies[0].evaluation.recommendations = []
    mockComparison.comparison = comp
    mockComparison.isValid = true

    render(<ComparePolicies />)
    expect(screen.queryByText('Improvement Suggestions')).not.toBeInTheDocument()
  })

  // ── Coverage matrix fallback ──

  it('falls back to CoverageMatrix when coverageMatrix is empty', () => {
    mockSearchParams = new URLSearchParams('ids=p1,p2')
    const comp = buildMockComparison()
    comp.coverageMatrix = []
    mockComparison.comparison = comp
    mockComparison.isValid = true

    render(<ComparePolicies />)
    expect(screen.getByTestId('coverage-matrix')).toBeInTheDocument()
  })
})
