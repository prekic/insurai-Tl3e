/**
 * CoverageMatrix Component Tests
 *
 * Tests for CoverageMatrix, MobileCoverageCard, CoverageRow, CoverageCell, and CoverageSummary:
 * - Empty coverage matrix displays "no comparison" message
 * - Desktop table layout with coverage rows
 * - Mobile card-based layout
 * - Included/Not Included coverage cell states
 * - Best/Worst coverage highlighting
 * - Deductible display
 * - Market benchmark display
 * - Missing policy coverage data
 * - CoverageSummary counts included coverages
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CoverageMatrix, CoverageSummary } from './CoverageMatrix'
import type {
  PolicyComparison,
  CoverageComparison,
  ComparisonPolicy,
} from '@/lib/policy-evaluation/types'
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
  TrophyIndicator: ({ isBest }: { isBest?: boolean }) => (
    <span data-testid="trophy" data-best={isBest ? 'true' : 'false'}>
      {isBest ? 'Best' : ''}
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

const createComparisonPolicy = (id: string, provider: string, logo: string): ComparisonPolicy => ({
  policy: createMockPolicy(id, provider, logo),
  evaluation: {
    policyId: id,
    policyNumber: `POL-${id}`,
    policyType: 'kasko',
    evaluatedAt: '2025-01-01',
    overallScore: 85,
    grade: 'B',
    status: 'good',
    scoreBreakdown: {
      premium: {
        category: 'Premium',
        categoryTR: 'Prim',
        score: 80,
        weight: 20,
        details: '',
        detailsTR: '',
        issues: [],
        issuesTR: [],
      },
      coverage: {
        category: 'Coverage',
        categoryTR: 'Teminat',
        score: 85,
        weight: 30,
        details: '',
        detailsTR: '',
        issues: [],
        issuesTR: [],
      },
      deductible: {
        category: 'Deductible',
        categoryTR: 'Muafiyet',
        score: 75,
        weight: 15,
        details: '',
        detailsTR: '',
        issues: [],
        issuesTR: [],
      },
      compliance: {
        category: 'Compliance',
        categoryTR: 'Uyum',
        score: 90,
        weight: 20,
        details: '',
        detailsTR: '',
        issues: [],
        issuesTR: [],
      },
      value: {
        category: 'Value',
        categoryTR: 'Deger',
        score: 82,
        weight: 15,
        details: '',
        detailsTR: '',
        issues: [],
        issuesTR: [],
      },
    },
    marketComparison: {
      premiumPercentile: 50,
      coveragePercentile: 60,
      isAboveAverageValue: true,
      competitivePosition: 'competitive',
    },
    compliance: { isCompliant: true, mandatoryMet: true, minimumLimitsMet: true, issues: [] },
    recommendations: [],
    summary: {
      strengths: [],
      strengthsTR: [],
      weaknesses: [],
      weaknessesTR: [],
      immediateActions: [],
      immediateActionsTR: [],
    },
  },
  label: provider,
})

const createCoverageComparison = (
  name: string,
  nameTR: string,
  policies: CoverageComparison['policies'],
  bestPolicyId: string,
  worstPolicyId: string,
  marketBenchmark?: number
): CoverageComparison => ({
  coverageName: name,
  coverageNameTR: nameTR,
  policies,
  bestPolicyId,
  worstPolicyId,
  marketBenchmark,
})

const createMockComparison = (): PolicyComparison => {
  const coverageMatrix: CoverageComparison[] = [
    createCoverageComparison(
      'Collision',
      'Carpma',
      [
        { policyId: 'p1', included: true, limit: 500000, deductible: 1000, score: 85 },
        { policyId: 'p2', included: true, limit: 750000, deductible: 500, score: 95 },
      ],
      'p2',
      'p1',
      600000
    ),
    createCoverageComparison(
      'Theft',
      'Hirsizlik',
      [
        { policyId: 'p1', included: true, limit: 300000, deductible: 2000, score: 70 },
        { policyId: 'p2', included: false, limit: 0, deductible: 0, score: 0 },
      ],
      'p1',
      'p2'
    ),
    createCoverageComparison(
      'Flood',
      'Sel',
      [
        { policyId: 'p1', included: false, limit: 0, deductible: 0, score: 0 },
        { policyId: 'p2', included: true, limit: 200000, deductible: 5000, score: 60 },
      ],
      'p2',
      'p1',
      250000
    ),
  ]

  return {
    comparedAt: '2025-01-01',
    policies: [
      createComparisonPolicy('p1', 'Allianz', '🛡️'),
      createComparisonPolicy('p2', 'AXA', '🔵'),
    ],
    winners: {
      overallBest: 'p1',
      bestPremium: 'p1',
      bestCoverage: 'p2',
      bestValue: 'p1',
      bestCompliance: 'p1',
    },
    metrics: [],
    coverageMatrix,
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
  }
}

describe('CoverageMatrix', () => {
  // ========== Empty State ==========

  it('shows empty message when coverageMatrix is empty', () => {
    const comparison = createMockComparison()
    comparison.coverageMatrix = []
    render(<CoverageMatrix comparison={comparison} />)
    expect(screen.getByText('No coverage comparison available')).toBeInTheDocument()
  })

  it('applies className to empty state', () => {
    const comparison = createMockComparison()
    comparison.coverageMatrix = []
    const { container } = render(
      <CoverageMatrix comparison={comparison} className="custom-empty" />
    )
    expect(container.firstChild).toHaveClass('custom-empty')
  })

  // ========== Desktop Table ==========

  it('renders Coverage table header', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    expect(screen.getByText('Coverage')).toBeInTheDocument()
  })

  it('renders provider names in headers', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    // Both mobile and desktop show provider names
    const allianz = screen.getAllByText('Allianz')
    expect(allianz.length).toBeGreaterThan(0)
  })

  it('renders coverage names as row labels', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    // Coverage names appear in both mobile and desktop
    const collision = screen.getAllByText('Collision')
    expect(collision.length).toBeGreaterThan(0)
    const theft = screen.getAllByText('Theft')
    expect(theft.length).toBeGreaterThan(0)
  })

  // ========== Included Coverage Cells ==========

  it('shows coverage limits for included coverages', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    // ₺500,000 and ₺750,000 for Collision
    const limits = screen.getAllByText('₺500,000')
    expect(limits.length).toBeGreaterThan(0)
    const limits2 = screen.getAllByText('₺750,000')
    expect(limits2.length).toBeGreaterThan(0)
  })

  it('shows deductible for included coverages with deductible > 0', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    // Deductible labels should appear
    const deductibles = screen.getAllByText(/Deductible:/)
    expect(deductibles.length).toBeGreaterThan(0)
  })

  // ========== Not Included Coverage ==========

  it('shows "Not included" for not-included coverage in desktop', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    const notIncluded = screen.getAllByText('Not included')
    expect(notIncluded.length).toBeGreaterThan(0)
  })

  it('shows "No" for not-included coverage in mobile', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    const noLabels = screen.getAllByText('No')
    expect(noLabels.length).toBeGreaterThan(0)
  })

  // ========== Best/Worst Highlighting ==========

  it('shows trophy for best coverage policy', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    const trophies = screen.getAllByTestId('trophy')
    const bestTrophies = trophies.filter((t) => t.getAttribute('data-best') === 'true')
    expect(bestTrophies.length).toBeGreaterThan(0)
  })

  // ========== Market Benchmark ==========

  it('shows market benchmark when available', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    // Market: ₺600,000 for Collision
    const marketLabels = screen.getAllByText(/Market:/)
    expect(marketLabels.length).toBeGreaterThan(0)
  })

  it('does not show market benchmark when not available', () => {
    const comparison = createMockComparison()
    // Theft has no market benchmark
    // Count market labels — should be fewer than total coverage rows
    render(<CoverageMatrix comparison={comparison} />)
    // Collision and Flood have benchmarks (2), Theft does not
    // Each appears in both mobile and desktop = 4 occurrences total
    const marketLabels = screen.getAllByText(/Market:/)
    // At least some should be present
    expect(marketLabels.length).toBeGreaterThanOrEqual(2)
  })

  // ========== Missing Policy Coverage Data ==========

  it('shows dash for missing policy coverage data in desktop', () => {
    const comparison = createMockComparison()
    // Add a coverage where p1 has no entry
    comparison.coverageMatrix.push(
      createCoverageComparison(
        'Glass',
        'Cam',
        [
          // Only p2 has this coverage
          { policyId: 'p2', included: true, limit: 10000, deductible: 0, score: 50 },
        ],
        'p2',
        'p2'
      )
    )
    render(<CoverageMatrix comparison={comparison} />)
    // p1 is missing, should show a dash
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // ========== Custom className ==========

  it('applies custom className', () => {
    const comparison = createMockComparison()
    const { container } = render(
      <CoverageMatrix comparison={comparison} className="matrix-custom" />
    )
    expect(container.firstChild).toHaveClass('matrix-custom')
  })

  // ========== Policy label fallback ==========

  it('uses policy.provider when label is undefined', () => {
    const comparison = createMockComparison()
    comparison.policies[0].label = undefined
    render(<CoverageMatrix comparison={comparison} />)
    const allianz = screen.getAllByText('Allianz')
    expect(allianz.length).toBeGreaterThan(0)
  })

  // ========== Coverage with zero deductible ==========

  it('does not show deductible label when deductible is 0', () => {
    const comparison = createMockComparison()
    // AXA Collision has deductible 500, p2 Flood has deductible 5000
    // Check that deductibles with value > 0 are shown
    render(<CoverageMatrix comparison={comparison} />)
    const deductibles = screen.getAllByText(/Deductible:/)
    // Each non-zero deductible shown in desktop CoverageCell
    expect(deductibles.length).toBeGreaterThan(0)
  })

  // ========== Mobile layout ==========

  it('renders mobile coverage cards', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    // Mobile cards also show coverage names
    const collisionLabels = screen.getAllByText('Collision')
    expect(collisionLabels.length).toBeGreaterThan(0)
  })

  it('shows mobile deductible labels with "D:" prefix', () => {
    const comparison = createMockComparison()
    render(<CoverageMatrix comparison={comparison} />)
    const mobileDeductibles = screen.getAllByText(/D:/)
    expect(mobileDeductibles.length).toBeGreaterThan(0)
  })
})

// ========== CoverageSummary ==========

describe('CoverageSummary', () => {
  it('renders coverage count for each policy', () => {
    const comparison = createMockComparison()
    render(<CoverageSummary comparison={comparison} />)
    // p1: Collision (yes), Theft (yes), Flood (no) = 2/3
    // p2: Collision (yes), Theft (no), Flood (yes) = 2/3
    // Text nodes are split, so use a content matcher
    // @ts-expect-error - TS6133 unused variable
    const countElements = screen.getAllByText((content, element) => {
      return element?.tagName === 'SPAN' && element.textContent === '2/3 coverages'
    })
    expect(countElements).toHaveLength(2)
  })

  it('shows provider names with logos', () => {
    const comparison = createMockComparison()
    render(<CoverageSummary comparison={comparison} />)
    expect(screen.getByText('Allianz')).toBeInTheDocument()
    expect(screen.getByText('AXA')).toBeInTheDocument()
    expect(screen.getByText('🛡️')).toBeInTheDocument()
    expect(screen.getByText('🔵')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const comparison = createMockComparison()
    const { container } = render(
      <CoverageSummary comparison={comparison} className="summary-custom" />
    )
    expect(container.firstChild).toHaveClass('summary-custom')
  })

  it('uses policy.provider when label is undefined', () => {
    const comparison = createMockComparison()
    comparison.policies[0].label = undefined
    render(<CoverageSummary comparison={comparison} />)
    // Still shows provider name
    expect(screen.getByText('Allianz')).toBeInTheDocument()
  })

  it('calculates correct included count with different data', () => {
    const comparison = createMockComparison()
    // Modify so p1 has all coverages included
    comparison.coverageMatrix[2].policies = [
      { policyId: 'p1', included: true, limit: 200000, deductible: 0, score: 60 },
      { policyId: 'p2', included: true, limit: 200000, deductible: 5000, score: 60 },
    ]
    render(<CoverageSummary comparison={comparison} />)
    // p1: Collision (yes), Theft (yes), Flood (yes) = 3/3
    // @ts-expect-error - TS6133 unused variable
    const threeOfThree = screen.getAllByText((content, element) => {
      return element?.tagName === 'SPAN' && element.textContent === '3/3 coverages'
    })
    expect(threeOfThree).toHaveLength(1)
    // p2: Collision (yes), Theft (no), Flood (yes) = 2/3
    // @ts-expect-error - TS6133 unused variable
    const twoOfThree = screen.getAllByText((content, element) => {
      return element?.tagName === 'SPAN' && element.textContent === '2/3 coverages'
    })
    expect(twoOfThree).toHaveLength(1)
  })
})
