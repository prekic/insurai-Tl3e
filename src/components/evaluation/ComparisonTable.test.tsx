/**
 * ComparisonTable Component Tests
 *
 * Tests for ComparisonTable, MobileMetricCard, MetricRow, and ComparisonSummary:
 * - Desktop table layout rendering
 * - Mobile card-based layout rendering
 * - Overall score row with grades and ranking
 * - Metric value formatting (currency, %, days, default)
 * - Market benchmark display
 * - Best/worst indicators (TrophyIndicator)
 * - Winner highlighting
 * - ComparisonSummary category winners
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComparisonTable, ComparisonSummary } from './ComparisonTable'
import type { PolicyComparison, ComparisonMetric, ComparisonPolicy } from '@/lib/policy-evaluation/types'
import type { Policy } from '@/types/policy'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {},
    locale: 'en',
    isLoading: false,
  }),
}))

// Mock utils
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils')
  return {
    ...actual,
    formatCurrency: (amount: number) => `₺${amount.toLocaleString()}`,
  }
})

// Mock evaluation sub-components
vi.mock('./WinnerBadge', () => ({
  TrophyIndicator: ({ isBest, isWorst, isWinner }: { isBest?: boolean; isWorst?: boolean; isWinner?: boolean }) => (
    <span data-testid="trophy" data-best={isBest ? 'true' : 'false'} data-worst={isWorst ? 'true' : 'false'} data-winner={isWinner ? 'true' : 'false'}>
      {isBest ? 'Best' : isWorst ? 'Worst' : isWinner ? 'Winner' : ''}
    </span>
  ),
  RankBadge: ({ rank }: { rank: number }) => (
    <span data-testid="rank-badge">#{rank}</span>
  ),
}))

vi.mock('./GradeBadge', () => ({
  GradeBadge: ({ grade, size }: { grade: string; size: string }) => (
    <span data-testid="grade-badge" data-grade={grade} data-size={size}>
      {grade}
    </span>
  ),
}))

// ========== Test Data ==========

const createMockPolicy = (id: string, provider: string, logo: string): Policy => ({
  id,
  policyNumber: `POL-${id}`,
  provider,
  logo,
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 500000,
  premium: 3200,
  monthlyPremium: 267,
  deductible: 1000,
  startDate: '2025-01-01',
  expiryDate: '2026-01-01',
  status: 'active',
  uploadDate: '2025-01-15',
  fileName: 'policy.pdf',
  documentType: 'policy',
  insuredPerson: 'Test User',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
})

const createComparisonPolicy = (id: string, provider: string, logo: string, score: number, grade: string): ComparisonPolicy => ({
  policy: createMockPolicy(id, provider, logo),
  evaluation: {
    policyId: id,
    policyNumber: `POL-${id}`,
    policyType: 'kasko',
    evaluatedAt: '2025-01-01',
    overallScore: score,
    grade: grade as 'A' | 'B' | 'C',
    status: score >= 90 ? 'excellent' : score >= 75 ? 'good' : 'fair',
    scoreBreakdown: {
      premium: { category: 'Premium', categoryTR: 'Prim', score: 80, weight: 20, details: '', detailsTR: '', issues: [], issuesTR: [] },
      coverage: { category: 'Coverage', categoryTR: 'Teminat', score: 85, weight: 30, details: '', detailsTR: '', issues: [], issuesTR: [] },
      deductible: { category: 'Deductible', categoryTR: 'Muafiyet', score: 75, weight: 15, details: '', detailsTR: '', issues: [], issuesTR: [] },
      compliance: { category: 'Compliance', categoryTR: 'Uyum', score: 90, weight: 20, details: '', detailsTR: '', issues: [], issuesTR: [] },
      value: { category: 'Value', categoryTR: 'Deger', score: 82, weight: 15, details: '', detailsTR: '', issues: [], issuesTR: [] },
    },
    marketComparison: { premiumPercentile: 50, coveragePercentile: 60, isAboveAverageValue: true, competitivePosition: 'competitive' },
    compliance: { isCompliant: true, mandatoryMet: true, minimumLimitsMet: true, issues: [] },
    recommendations: [],
    summary: { strengths: [], strengthsTR: [], weaknesses: [], weaknessesTR: [], immediateActions: [], immediateActionsTR: [] },
  },
  label: provider,
})

const createMockMetrics = (): ComparisonMetric[] => [
  {
    name: 'Annual Premium',
    nameTR: 'Yillik Prim',
    unit: 'TRY',
    values: [
      { policyId: 'p1', value: 3200, isBest: true, isWorst: false, percentile: 80 },
      { policyId: 'p2', value: 4500, isBest: false, isWorst: true, percentile: 40 },
    ],
    marketBenchmark: 3800,
    higherIsBetter: false,
  },
  {
    name: 'Coverage Score',
    nameTR: 'Teminat Puani',
    unit: '%',
    values: [
      { policyId: 'p1', value: 85.5, isBest: false, isWorst: false },
      { policyId: 'p2', value: 92.3, isBest: true, isWorst: false },
    ],
    higherIsBetter: true,
  },
  {
    name: 'Claim Duration',
    nameTR: 'Hasar Suresi',
    unit: 'days',
    values: [
      { policyId: 'p1', value: 15, isBest: true, isWorst: false },
      { policyId: 'p2', value: 30, isBest: false, isWorst: true },
    ],
    higherIsBetter: false,
  },
]

const createMockComparison = (): PolicyComparison => ({
  comparedAt: '2025-01-01',
  policies: [
    createComparisonPolicy('p1', 'Allianz', '🛡️', 92, 'A'),
    createComparisonPolicy('p2', 'AXA', '🔵', 78, 'B'),
  ],
  winners: {
    overallBest: 'p1',
    bestPremium: 'p1',
    bestCoverage: 'p2',
    bestValue: 'p1',
    bestCompliance: 'p1',
  },
  metrics: createMockMetrics(),
  coverageMatrix: [],
  rankings: [
    { policyId: 'p1', overallRank: 1, premiumRank: 1, coverageRank: 2, valueRank: 1 },
    { policyId: 'p2', overallRank: 2, premiumRank: 2, coverageRank: 1, valueRank: 2 },
  ],
  analysis: {
    recommendation: 'Go with Allianz',
    recommendationTR: 'Allianz secin',
    keyDifferences: [],
    tradeoffs: [],
  },
})

describe('ComparisonTable', () => {
  // ========== Desktop Table ==========

  it('renders desktop table with Metric header', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    expect(screen.getByText('Metric')).toBeInTheDocument()
  })

  it('renders provider names in table headers', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    // Provider names appear in both mobile and desktop layouts
    const allianzElements = screen.getAllByText('Allianz')
    expect(allianzElements.length).toBeGreaterThan(0)
    const axaElements = screen.getAllByText('AXA')
    expect(axaElements.length).toBeGreaterThan(0)
  })

  it('renders policy numbers in table headers', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const policyNumbers = screen.getAllByText('POL-p1')
    expect(policyNumbers.length).toBeGreaterThan(0)
  })

  it('renders Overall Score row', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const overallScoreLabels = screen.getAllByText('Overall Score')
    expect(overallScoreLabels.length).toBeGreaterThan(0)
  })

  it('renders grade badges in Overall Score row', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const gradeBadges = screen.getAllByTestId('grade-badge')
    expect(gradeBadges.length).toBeGreaterThanOrEqual(2)
  })

  it('shows overall scores as numbers', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const score92 = screen.getAllByText('92')
    const score78 = screen.getAllByText('78')
    expect(score92.length).toBeGreaterThan(0)
    expect(score78.length).toBeGreaterThan(0)
  })

  it('renders rank badges', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const rankBadges = screen.getAllByTestId('rank-badge')
    expect(rankBadges.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0)
  })

  it('marks overall winner with trophy', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    // There should be trophy indicators
    const trophies = screen.getAllByTestId('trophy')
    const winnerTrophies = trophies.filter(t => t.getAttribute('data-winner') === 'true')
    expect(winnerTrophies.length).toBeGreaterThan(0)
  })

  // ========== Metric Rows ==========

  it('renders metric names in rows', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    // Both mobile and desktop render metric names
    const premiumLabels = screen.getAllByText('Annual Premium')
    expect(premiumLabels.length).toBeGreaterThan(0)
    const coverageLabels = screen.getAllByText('Coverage Score')
    expect(coverageLabels.length).toBeGreaterThan(0)
  })

  it('formats currency values (TRY unit)', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    // ₺3,200 appears in both mobile and desktop
    const currency = screen.getAllByText('₺3,200')
    expect(currency.length).toBeGreaterThan(0)
  })

  it('formats percentage values', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const pct = screen.getAllByText('85.5%')
    expect(pct.length).toBeGreaterThan(0)
  })

  it('formats day values', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const days = screen.getAllByText('15 days')
    expect(days.length).toBeGreaterThan(0)
  })

  it('shows market benchmark in metric rows', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    // Market: ₺3,800 should appear
    const marketLabels = screen.getAllByText(/Market:/)
    expect(marketLabels.length).toBeGreaterThan(0)
  })

  it('shows percentile when available', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    // Desktop shows "Percentile: 80%"
    const percentile = screen.getAllByText(/80%/)
    expect(percentile.length).toBeGreaterThan(0)
  })

  it('renders dash for missing metric values', () => {
    const comparison = createMockComparison()
    // Add a metric where p2 has no value
    comparison.metrics.push({
      name: 'Extra Metric',
      nameTR: 'Ekstra',
      unit: '',
      values: [
        { policyId: 'p1', value: 100, isBest: true, isWorst: false },
        // p2 is missing
      ],
      higherIsBetter: true,
    })
    render(<ComparisonTable comparison={comparison} />)
    // The missing cell shows "-"
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // ========== Best/Worst Styling ==========

  it('shows trophy for best metric values', () => {
    const comparison = createMockComparison()
    render(<ComparisonTable comparison={comparison} />)
    const trophies = screen.getAllByTestId('trophy')
    const bestTrophies = trophies.filter(t => t.getAttribute('data-best') === 'true')
    expect(bestTrophies.length).toBeGreaterThan(0)
  })

  // ========== Custom className ==========

  it('applies custom className', () => {
    const comparison = createMockComparison()
    const { container } = render(
      <ComparisonTable comparison={comparison} className="custom-table" />
    )
    expect(container.firstChild).toHaveClass('custom-table')
  })

  // ========== String Value Formatting ==========

  it('handles string metric values', () => {
    const comparison = createMockComparison()
    comparison.metrics.push({
      name: 'Provider Rating',
      nameTR: 'Tedarikci Puani',
      unit: '',
      values: [
        { policyId: 'p1', value: 'A+' as unknown as number, isBest: true, isWorst: false },
        { policyId: 'p2', value: 'B' as unknown as number, isBest: false, isWorst: true },
      ],
      higherIsBetter: true,
    })
    render(<ComparisonTable comparison={comparison} />)
    const aPlus = screen.getAllByText('A+')
    expect(aPlus.length).toBeGreaterThan(0)
  })

  // ========== Policy label fallback ==========

  it('uses policy.provider when label is undefined', () => {
    const comparison = createMockComparison()
    comparison.policies[0].label = undefined
    render(<ComparisonTable comparison={comparison} />)
    // Should still show provider name
    const allianzEls = screen.getAllByText('Allianz')
    expect(allianzEls.length).toBeGreaterThan(0)
  })
})

// ========== ComparisonSummary ==========

describe('ComparisonSummary', () => {
  it('renders all winner categories', () => {
    const comparison = createMockComparison()
    render(<ComparisonSummary comparison={comparison} />)
    expect(screen.getByText('Overall Best')).toBeInTheDocument()
    expect(screen.getByText('Best Premium')).toBeInTheDocument()
    expect(screen.getByText('Best Coverage')).toBeInTheDocument()
    expect(screen.getByText('Best Value')).toBeInTheDocument()
  })

  it('shows winner provider names', () => {
    const comparison = createMockComparison()
    render(<ComparisonSummary comparison={comparison} />)
    // Allianz wins overall, premium, value
    const allianz = screen.getAllByText('Allianz')
    expect(allianz.length).toBeGreaterThanOrEqual(3)
    // AXA wins coverage
    const axa = screen.getAllByText('AXA')
    expect(axa.length).toBeGreaterThanOrEqual(1)
  })

  it('shows winner policy logos', () => {
    const comparison = createMockComparison()
    render(<ComparisonSummary comparison={comparison} />)
    const shields = screen.getAllByText('🛡️')
    expect(shields.length).toBeGreaterThanOrEqual(1)
  })

  it('applies custom className', () => {
    const comparison = createMockComparison()
    const { container } = render(
      <ComparisonSummary comparison={comparison} className="summary-custom" />
    )
    expect(container.firstChild).toHaveClass('summary-custom')
  })

  it('skips rendering for invalid winner policyId', () => {
    const comparison = createMockComparison()
    comparison.winners.overallBest = 'non-existent'
    render(<ComparisonSummary comparison={comparison} />)
    // "Overall Best" category card should not render because winner policy not found
    // But other categories should still render
    expect(screen.getByText('Best Premium')).toBeInTheDocument()
  })
})
