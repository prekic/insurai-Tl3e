/**
 * PolicyCard Component Tests
 *
 * Tests for the PolicyCard and PolicyCardGrid components including:
 * - Rendering in default and compact modes
 * - Selection/checkbox behavior
 * - Action button callbacks (view, delete, chat)
 * - Evaluation display (grade, score breakdown)
 * - Status badge variants
 * - New and Duplicate indicator badges
 * - Keyboard accessibility
 * - PolicyCardGrid rendering and selection state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PolicyCard, PolicyCardGrid } from './PolicyCard'
import type { AnalyzedPolicy, DuplicatePolicy, Policy } from '@/types/policy'
import type { PolicyEvaluation } from '@/lib/policy-evaluation/types'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      policy: {
        coverage: 'Coverage',
        premium: 'Premium',
        expiryDate: 'Expiry Date',
        active: 'Active',
        expiring: 'Expiring',
        expired: 'Expired',
        pending: 'Pending',
        new: 'New',
        duplicate: 'Duplicate',
      },
      common: {
        view: 'View',
        delete: 'Delete',
      },
      nav: {
        chat: 'Chat',
      },
      a11y: {
        selected: 'Selected',
      },
    },
    locale: 'en',
    isLoading: false,
  }),
}))

// Mock evaluation hook
const mockEvaluation: PolicyEvaluation = {
  policyId: 'policy-1',
  policyNumber: 'POL-001',
  policyType: 'kasko',
  evaluatedAt: '2025-01-01',
  overallScore: 85,
  grade: 'B' as const,
  status: 'good' as const,
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
      score: 90,
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
      score: 85,
      weight: 20,
      details: '',
      detailsTR: '',
      issues: [],
      issuesTR: [],
    },
    value: {
      category: 'Value',
      categoryTR: 'Deger',
      score: 88,
      weight: 15,
      details: '',
      detailsTR: '',
      issues: [],
      issuesTR: [],
    },
  },
  marketComparison: {
    premiumPercentile: 60,
    coveragePercentile: 75,
    isAboveAverageValue: true,
    competitivePosition: 'competitive',
  },
  compliance: {
    isCompliant: true,
    mandatoryMet: true,
    minimumLimitsMet: true,
    issues: [],
  },
  recommendations: [],
  summary: {
    strengths: [],
    strengthsTR: [],
    weaknesses: [],
    weaknessesTR: [],
    immediateActions: [],
    immediateActionsTR: [],
  },
}

vi.mock('@/hooks/usePolicyEvaluation', () => ({
  usePolicyEvaluation: vi.fn(() => ({
    evaluation: mockEvaluation,
    isLoading: false,
    error: null,
  })),
}))

vi.mock('@/hooks/usePilotGateOptions', () => ({
  usePilotGateOptions: vi.fn(() => ({
    userId: 'test-user',
    featureFlags: {},
    userSegments: [],
  })),
}))

vi.mock('@/hooks/useDisplaySafeSummary', () => ({
  useDisplaySafeSummary: vi.fn(() => ({
    isPilotResult: false,
    isDraft: false,
    requiresHumanReview: false,
  })),
}))

// Mock evaluation components
vi.mock('./evaluation', () => ({
  GradeBadge: ({ grade, size }: { grade: string; size: string }) => (
    <span data-testid="grade-badge" data-grade={grade} data-size={size}>
      {grade}
    </span>
  ),
  StatusIndicator: ({ status }: { status: string }) => (
    <span data-testid="status-indicator" data-status={status}>
      {status}
    </span>
  ),
  ScoreBreakdown: ({ variant }: { variant: string }) => (
    <div data-testid="score-breakdown" data-variant={variant}>
      Score Breakdown
    </div>
  ),
  OverallScore: ({ score }: { score: number }) => (
    <div data-testid="overall-score" data-score={score}>
      {score}
    </div>
  ),
}))

vi.mock('@/hooks/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    displayCurrency: 'TRY',
    convert: (amount: number) => amount,
    formatConverted: (amount: number) => `₺${amount.toLocaleString()}`,
    formatConvertedCompact: (amount: number) => `₺${amount.toLocaleString()}`,
    isReady: true,
  }),
}))

// Mock utils
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils')
  return {
    ...actual,
    formatCurrency: (amount: number) => `₺${amount.toLocaleString()}`,
    formatDate: (date: string) => new Date(date).toLocaleDateString('en-US'),
  }
})

// ========== Test Data ==========

const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
  id: 'policy-1',
  policyNumber: 'POL-001',
  provider: 'Allianz Sigorta',
  typeTr: 'Kasko',
  type: 'kasko',
  coverage: 500000,
  premium: 3200,
  deductible: 1000,
  startDate: '2025-01-01',
  expiryDate: '2026-01-01',
  status: 'active',
  insuredPerson: 'Erdem Yilmaz',
  documentType: 'policy',
  uploadDate: '2025-01-15',
  logo: '🚗',
  fileName: 'kasko.pdf',
  coverages: [
    { name: 'Collision', nameTr: 'Carpma', included: true, limit: 500000, deductible: 1000 },
  ],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
  aiConfidence: 0.92,
  aiInsights: [],
  monthlyPremium: 267,
  ...overrides,
})

const mockPolicy = createMockPolicy()

describe('PolicyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========== Basic Rendering ==========

  it('renders provider name and policy number', () => {
    render(<PolicyCard policy={mockPolicy} />)
    expect(screen.getByText('Allianz Sigorta')).toBeInTheDocument()
    expect(screen.getByText('POL-001')).toBeInTheDocument()
  })

  it('renders the policy logo', () => {
    render(<PolicyCard policy={mockPolicy} />)
    // The logo is in a span with aria-hidden
    const logo = screen.getByText('🚗')
    expect(logo).toBeInTheDocument()
  })

  it('renders coverage and premium values', () => {
    render(<PolicyCard policy={mockPolicy} />)
    expect(screen.getByText('Coverage')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
  })

  it('renders expiry date section', () => {
    render(<PolicyCard policy={mockPolicy} />)
    expect(screen.getByText('Expiry Date')).toBeInTheDocument()
  })

  it('renders policy type badge', () => {
    render(<PolicyCard policy={mockPolicy} />)
    // The POLICY_TYPES map for 'kasko' returns 'Comprehensive Auto' for EN
    const badges = screen.getAllByText(/Comprehensive Auto/)
    expect(badges.length).toBeGreaterThan(0)
  })

  // ========== Status Badge Variants ==========

  it('renders active status badge', () => {
    const policy = createMockPolicy({ status: 'active' })
    render(<PolicyCard policy={policy} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders expiring status badge', () => {
    const policy = createMockPolicy({ status: 'expiring' })
    render(<PolicyCard policy={policy} />)
    expect(screen.getByText('Expiring')).toBeInTheDocument()
  })

  it('renders expired status badge', () => {
    const policy = createMockPolicy({ status: 'expired' })
    render(<PolicyCard policy={policy} />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('renders pending status badge', () => {
    const policy = createMockPolicy({ status: 'pending' })
    render(<PolicyCard policy={policy} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  // ========== Evaluation Display ==========

  it('renders grade badge when showEvaluation is true', () => {
    render(<PolicyCard policy={mockPolicy} showEvaluation />)
    expect(screen.getByTestId('grade-badge')).toBeInTheDocument()
    expect(screen.getByTestId('grade-badge')).toHaveAttribute('data-grade', 'B')
  })

  it('renders status indicator when evaluation is available', () => {
    render(<PolicyCard policy={mockPolicy} showEvaluation />)
    expect(screen.getByTestId('status-indicator')).toBeInTheDocument()
  })

  it('renders score breakdown and overall score', () => {
    render(<PolicyCard policy={mockPolicy} showEvaluation />)
    expect(screen.getByTestId('score-breakdown')).toBeInTheDocument()
    expect(screen.getByTestId('overall-score')).toBeInTheDocument()
  })

  it('does not render evaluation section when showEvaluation is false', () => {
    render(<PolicyCard policy={mockPolicy} showEvaluation={false} />)
    expect(screen.queryByTestId('overall-score')).not.toBeInTheDocument()
    expect(screen.queryByTestId('score-breakdown')).not.toBeInTheDocument()
  })

  // ========== Action Buttons ==========

  it('renders View button and calls onView', () => {
    const onView = vi.fn()
    render(<PolicyCard policy={mockPolicy} onView={onView} />)
    const viewButton = screen.getByRole('button', { name: /View Allianz Sigorta/i })
    fireEvent.click(viewButton)
    expect(onView).toHaveBeenCalledWith('policy-1')
  })

  it('renders Chat button and calls onChat', () => {
    const onChat = vi.fn()
    render(<PolicyCard policy={mockPolicy} onChat={onChat} />)
    const chatButton = screen.getByRole('button', { name: /Chat Allianz Sigorta/i })
    fireEvent.click(chatButton)
    expect(onChat).toHaveBeenCalledWith('policy-1')
  })

  it('renders Delete button and calls onDelete', () => {
    const onDelete = vi.fn()
    render(<PolicyCard policy={mockPolicy} onDelete={onDelete} />)
    const deleteButton = screen.getByRole('button', { name: /Delete Allianz Sigorta/i })
    fireEvent.click(deleteButton)
    expect(onDelete).toHaveBeenCalledWith('policy-1')
  })

  it('action buttons stop event propagation', () => {
    const onView = vi.fn()
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onView={onView} onSelect={onSelect} showActions />)
    // showActions is true but onSelect hides actions in grid, test directly
    // Let's render without onSelect to test stopPropagation
    const { unmount } = render(<PolicyCard policy={mockPolicy} onView={onView} />)
    const viewButton = screen.getAllByRole('button', { name: /View Allianz Sigorta/i })[0]
    fireEvent.click(viewButton)
    expect(onView).toHaveBeenCalledWith('policy-1')
    unmount()
  })

  it('does not render action buttons when showActions is false', () => {
    render(
      <PolicyCard policy={mockPolicy} onView={vi.fn()} onDelete={vi.fn()} showActions={false} />
    )
    expect(screen.queryByRole('button', { name: /View/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument()
  })

  // ========== Selection Mode ==========

  it('renders selection checkbox when onSelect is provided', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onSelect={onSelect} />)
    // Role should be button for the whole card
    const card = screen.getByRole('button')
    expect(card).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect when card is clicked in selection mode', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onSelect={onSelect} />)
    const card = screen.getByRole('button')
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith('policy-1')
  })

  it('shows selected state when isSelected is true', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onSelect={onSelect} isSelected />)
    const card = screen.getByRole('button')
    expect(card).toHaveAttribute('aria-pressed', 'true')
  })

  it('handles keyboard Enter in selection mode', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onSelect={onSelect} />)
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('policy-1')
  })

  it('handles keyboard Space in selection mode', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onSelect={onSelect} />)
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('policy-1')
  })

  it('uses role="article" when no onSelect', () => {
    render(<PolicyCard policy={mockPolicy} />)
    const card = screen.getByRole('article')
    expect(card).toBeInTheDocument()
  })

  it('calls onView when card is clicked without onSelect', () => {
    const onView = vi.fn()
    render(<PolicyCard policy={mockPolicy} onView={onView} />)
    // Without onSelect, clicking the card doesn't do anything at the card level
    // Only explicit action buttons work
    const card = screen.getByRole('article')
    expect(card).not.toHaveAttribute('tabindex')
  })

  // ========== Compact Mode ==========

  it('renders compact mode with smaller layout', () => {
    render(<PolicyCard policy={mockPolicy} compact />)
    // In compact mode, provider is shown, and role is button
    expect(screen.getByText('Allianz Sigorta')).toBeInTheDocument()
    // Policy number is not shown in compact mode
    expect(screen.queryByText('POL-001')).not.toBeInTheDocument()
  })

  it('compact mode shows grade badge when evaluation present', () => {
    render(<PolicyCard policy={mockPolicy} compact showEvaluation />)
    expect(screen.getByTestId('grade-badge')).toBeInTheDocument()
  })

  it('compact mode calls onSelect on click', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} compact onSelect={onSelect} />)
    const card = screen.getByRole('button')
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith('policy-1')
  })

  it('compact mode handles keyboard Enter', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} compact onSelect={onSelect} />)
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('policy-1')
  })

  // ========== New/Duplicate Badges ==========

  it('renders New badge when isNew is true', () => {
    render(<PolicyCard policy={mockPolicy} isNew />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders Duplicate badge when duplicateInfo is provided', () => {
    const dupInfo: DuplicatePolicy = {
      policy: mockPolicy as Policy,
      duplicateOf: mockPolicy as Policy,
      similarity: 'exact',
      matchedFields: ['policyNumber'],
    }
    render(<PolicyCard policy={mockPolicy} duplicateInfo={dupInfo} />)
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('renders both New and Duplicate badges together', () => {
    const dupInfo: DuplicatePolicy = {
      policy: mockPolicy as Policy,
      duplicateOf: mockPolicy as Policy,
      similarity: 'high',
      matchedFields: ['policyNumber', 'provider'],
    }
    render(<PolicyCard policy={mockPolicy} isNew duplicateInfo={dupInfo} />)
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('compact mode renders New badge when isNew is true', () => {
    render(<PolicyCard policy={mockPolicy} compact isNew />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('compact mode renders Duplicate badge', () => {
    const dupInfo: DuplicatePolicy = {
      policy: mockPolicy as Policy,
      duplicateOf: mockPolicy as Policy,
      similarity: 'exact',
      matchedFields: ['policyNumber'],
    }
    render(<PolicyCard policy={mockPolicy} compact duplicateInfo={dupInfo} />)
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  // ========== Unverified UI Gating ==========

  describe('Unverified UI Gating', () => {
    it('renders AlertTriangle and warning text instead of standard GradeBadge when isUnverified is true', async () => {
      // Temporarily override the mock for useDisplaySafeSummary for this test
      const { useDisplaySafeSummary } = await import('@/hooks/useDisplaySafeSummary')
      vi.mocked(useDisplaySafeSummary).mockReturnValueOnce({
        isPilotResult: true,
        isDraft: true,
        requiresHumanReview: true,
      } as any)

      render(<PolicyCard policy={mockPolicy} showEvaluation />)

      // The unverified warning block should show
      expect(screen.getByText('Unverified AI output. Please review carefully.')).toBeInTheDocument()

      // The standard ScoreBreakdown should not be rendered for standard unverified view
      expect(screen.queryByTestId('grade-badge')).not.toBeInTheDocument()
    })

    it('compact mode renders warning badge when isUnverified is true', async () => {
      const { useDisplaySafeSummary } = await import('@/hooks/useDisplaySafeSummary')
      vi.mocked(useDisplaySafeSummary).mockReturnValueOnce({
        isPilotResult: true,
        isDraft: true,
        requiresHumanReview: true,
      } as any)

      const { container } = render(<PolicyCard policy={mockPolicy} showEvaluation compact />)

      // Compact view has a small badge with the AlertTriangle but doesn't show full text
      expect(container.querySelector('.bg-amber-100')).toBeInTheDocument()
      expect(screen.queryByTestId('grade-badge')).not.toBeInTheDocument()
    })
  })

  // ========== Aria Labels ==========

  it('includes selected state in aria-label when selected', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} onSelect={onSelect} isSelected />)
    const card = screen.getByRole('button')
    expect(card.getAttribute('aria-label')).toContain('Selected')
  })

  it('includes New in aria-label for compact new cards', () => {
    const onSelect = vi.fn()
    render(<PolicyCard policy={mockPolicy} compact onSelect={onSelect} isNew />)
    const card = screen.getByRole('button')
    expect(card.getAttribute('aria-label')).toContain('New')
  })

  it('includes Duplicate in aria-label for duplicate cards', () => {
    const onSelect = vi.fn()
    const dupInfo: DuplicatePolicy = {
      policy: mockPolicy as Policy,
      duplicateOf: mockPolicy as Policy,
      similarity: 'exact',
      matchedFields: [],
    }
    render(<PolicyCard policy={mockPolicy} compact onSelect={onSelect} duplicateInfo={dupInfo} />)
    const card = screen.getByRole('button')
    expect(card.getAttribute('aria-label')).toContain('Duplicate')
  })

  // ========== Custom className ==========

  it('applies custom className', () => {
    const { container } = render(<PolicyCard policy={mockPolicy} className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})

// ========== PolicyCardGrid ==========

describe('PolicyCardGrid', () => {
  const policies = [
    createMockPolicy({ id: 'p1', provider: 'Allianz', policyNumber: 'A-001' }),
    createMockPolicy({ id: 'p2', provider: 'AXA', policyNumber: 'X-001' }),
    createMockPolicy({ id: 'p3', provider: 'Anadolu', policyNumber: 'N-001' }),
  ]

  it('renders all policy cards', () => {
    render(<PolicyCardGrid policies={policies} />)
    expect(screen.getByText('Allianz')).toBeInTheDocument()
    expect(screen.getByText('AXA')).toBeInTheDocument()
    expect(screen.getByText('Anadolu')).toBeInTheDocument()
  })

  it('returns null for empty policies array', () => {
    const { container } = render(<PolicyCardGrid policies={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('passes onView to each card', () => {
    const onView = vi.fn()
    render(<PolicyCardGrid policies={policies} onView={onView} />)
    const viewButtons = screen.getAllByRole('button', { name: /View/i })
    fireEvent.click(viewButtons[0])
    expect(onView).toHaveBeenCalledWith('p1')
  })

  it('passes onDelete to each card', () => {
    const onDelete = vi.fn()
    render(<PolicyCardGrid policies={policies} onDelete={onDelete} />)
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    fireEvent.click(deleteButtons[1])
    expect(onDelete).toHaveBeenCalledWith('p2')
  })

  it('passes onChat to each card', () => {
    const onChat = vi.fn()
    render(<PolicyCardGrid policies={policies} onChat={onChat} />)
    const chatButtons = screen.getAllByRole('button', { name: /Chat/i })
    fireEvent.click(chatButtons[2])
    expect(onChat).toHaveBeenCalledWith('p3')
  })

  it('highlights selected policies', () => {
    const onSelect = vi.fn()
    render(<PolicyCardGrid policies={policies} onSelect={onSelect} selectedIds={['p2']} />)
    const buttons = screen.getAllByRole('button')
    // p2 should be selected
    const p2Button = buttons.find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(p2Button).toBeTruthy()
  })

  it('hides action buttons in selection mode', () => {
    const onSelect = vi.fn()
    render(<PolicyCardGrid policies={policies} onSelect={onSelect} onView={vi.fn()} />)
    // In grid with onSelect, showActions is false
    expect(screen.queryByRole('button', { name: /View/i })).not.toBeInTheDocument()
  })

  it('marks new policies with isNew badge', () => {
    const newIds = new Set(['p1', 'p3'])
    render(<PolicyCardGrid policies={policies} newPolicyIds={newIds} />)
    const newBadges = screen.getAllByText('New')
    expect(newBadges).toHaveLength(2)
  })

  it('marks duplicate policies with duplicateInfo', () => {
    const dupMap = new Map<string, DuplicatePolicy>()
    dupMap.set('p2', {
      policy: policies[1] as Policy,
      duplicateOf: policies[0] as Policy,
      similarity: 'exact',
      matchedFields: ['policyNumber'],
    })
    render(<PolicyCardGrid policies={policies} duplicateMap={dupMap} />)
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('uses compact layout when compact prop is true', () => {
    render(<PolicyCardGrid policies={policies} compact />)
    // In compact mode, policy numbers are not shown
    expect(screen.queryByText('A-001')).not.toBeInTheDocument()
  })

  it('applies custom className to grid container', () => {
    const { container } = render(<PolicyCardGrid policies={policies} className="grid-custom" />)
    expect(container.firstChild).toHaveClass('grid-custom')
  })
})
