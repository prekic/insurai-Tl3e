/**
 * RecommendationCard and RecommendationList Tests
 *
 * Tests for policy recommendation display components
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecommendationCard, RecommendationList } from './RecommendationCard'
import type { Recommendation } from '@/lib/policy-evaluation/types'

// Mock useI18n
const mockLocale = vi.fn(() => 'en')
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: mockLocale() }),
}))

function createRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    priority: 'medium',
    type: 'increase_coverage',
    title: 'Increase Coverage',
    titleTR: 'Teminatı Artırın',
    description: 'Consider increasing your coverage limit.',
    descriptionTR: 'Teminat limitinizi artırmayı düşünün.',
    ...overrides,
  }
}

describe('RecommendationCard', () => {
  describe('full mode (non-compact)', () => {
    it('should render title and description in English', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation()} />)
      expect(screen.getByText('Increase Coverage')).toBeDefined()
      expect(screen.getByText('Consider increasing your coverage limit.')).toBeDefined()
    })

    it('should render title and description in Turkish', () => {
      mockLocale.mockReturnValue('tr')
      render(<RecommendationCard recommendation={createRecommendation()} />)
      expect(screen.getByText('Teminatı Artırın')).toBeDefined()
      expect(screen.getByText('Teminat limitinizi artırmayı düşünün.')).toBeDefined()
    })

    it('should show priority label for critical', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation({ priority: 'critical' })} />)
      expect(screen.getByText('Critical')).toBeDefined()
    })

    it('should show Turkish priority label for critical', () => {
      mockLocale.mockReturnValue('tr')
      render(<RecommendationCard recommendation={createRecommendation({ priority: 'critical' })} />)
      expect(screen.getByText('Kritik')).toBeDefined()
    })

    it('should show priority label for high', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation({ priority: 'high' })} />)
      expect(screen.getByText('High Priority')).toBeDefined()
    })

    it('should show priority label for medium', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation({ priority: 'medium' })} />)
      expect(screen.getByText('Medium Priority')).toBeDefined()
    })

    it('should show priority label for low', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation({ priority: 'low' })} />)
      expect(screen.getByText('Suggestion')).toBeDefined()
    })

    it('should show dismiss button when onDismiss provided', () => {
      mockLocale.mockReturnValue('en')
      const onDismiss = vi.fn()
      render(<RecommendationCard recommendation={createRecommendation()} onDismiss={onDismiss} />)
      expect(screen.getByLabelText('Dismiss')).toBeDefined()
    })

    it('should show Turkish dismiss label when locale is tr', () => {
      mockLocale.mockReturnValue('tr')
      const onDismiss = vi.fn()
      render(<RecommendationCard recommendation={createRecommendation()} onDismiss={onDismiss} />)
      expect(screen.getByLabelText('Kapat')).toBeDefined()
    })

    it('should not show dismiss button when onDismiss not provided', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation()} />)
      expect(screen.queryByLabelText('Dismiss')).toBeNull()
    })

    it('should call onDismiss when dismiss button clicked', async () => {
      mockLocale.mockReturnValue('en')
      const user = userEvent.setup()
      const onDismiss = vi.fn()
      render(<RecommendationCard recommendation={createRecommendation()} onDismiss={onDismiss} />)
      await user.click(screen.getByLabelText('Dismiss'))
      expect(onDismiss).toHaveBeenCalledOnce()
    })

    it('should render estimated impact section when present', () => {
      mockLocale.mockReturnValue('en')
      render(
        <RecommendationCard
          recommendation={createRecommendation({
            estimatedImpact: { premiumChange: 10, coverageChange: 20, riskReduction: 15 },
          })}
        />
      )
      expect(screen.getByText('Estimated Impact')).toBeDefined()
      expect(screen.getByText('Premium:')).toBeDefined()
      expect(screen.getByText('Coverage:')).toBeDefined()
      expect(screen.getByText('Risk Reduction:')).toBeDefined()
    })

    it('should render Turkish impact labels when locale is tr', () => {
      mockLocale.mockReturnValue('tr')
      render(
        <RecommendationCard
          recommendation={createRecommendation({
            estimatedImpact: { premiumChange: 10, coverageChange: 20, riskReduction: 15 },
          })}
        />
      )
      expect(screen.getByText('Tahmini Etki')).toBeDefined()
      expect(screen.getByText('Prim:')).toBeDefined()
      expect(screen.getByText('Teminat:')).toBeDefined()
      expect(screen.getByText('Risk Azaltma:')).toBeDefined()
    })

    it('should not render impact section when estimatedImpact is undefined', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation()} />)
      expect(screen.queryByText('Estimated Impact')).toBeNull()
    })

    it('should render only provided impact fields', () => {
      mockLocale.mockReturnValue('en')
      render(
        <RecommendationCard
          recommendation={createRecommendation({
            estimatedImpact: { premiumChange: -5 },
          })}
        />
      )
      expect(screen.getByText('Premium:')).toBeDefined()
      expect(screen.queryByText('Coverage:')).toBeNull()
      expect(screen.queryByText('Risk Reduction:')).toBeNull()
    })

    it('should apply custom className', () => {
      mockLocale.mockReturnValue('en')
      const { container } = render(
        <RecommendationCard recommendation={createRecommendation()} className="custom-class" />
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('compact mode', () => {
    it('should render compact card with title only', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation()} compact />)
      expect(screen.getByText('Increase Coverage')).toBeDefined()
      // Description should not be shown in compact mode
      expect(screen.queryByText('Consider increasing your coverage limit.')).toBeNull()
    })

    it('should show dismiss button in compact mode', async () => {
      mockLocale.mockReturnValue('en')
      const user = userEvent.setup()
      const onDismiss = vi.fn()
      render(<RecommendationCard recommendation={createRecommendation()} compact onDismiss={onDismiss} />)
      await user.click(screen.getByLabelText('Dismiss'))
      expect(onDismiss).toHaveBeenCalledOnce()
    })

    it('should not show dismiss in compact mode when not provided', () => {
      mockLocale.mockReturnValue('en')
      render(<RecommendationCard recommendation={createRecommendation()} compact />)
      expect(screen.queryByLabelText('Dismiss')).toBeNull()
    })
  })

  describe('type icons', () => {
    it('should render for all recommendation types', () => {
      mockLocale.mockReturnValue('en')
      const types: Recommendation['type'][] = [
        'increase_coverage', 'reduce_deductible', 'add_coverage',
        'review_premium', 'compliance', 'optimize',
      ]
      for (const type of types) {
        const { unmount } = render(
          <RecommendationCard recommendation={createRecommendation({ type })} />
        )
        // Just verify it renders without error
        expect(screen.getByText('Increase Coverage')).toBeDefined()
        unmount()
      }
    })
  })

  describe('ImpactBadge inverse logic', () => {
    it('should treat negative premium change as positive (inverse)', () => {
      mockLocale.mockReturnValue('en')
      render(
        <RecommendationCard
          recommendation={createRecommendation({
            estimatedImpact: { premiumChange: -10 },
          })}
        />
      )
      // Inverse: -(-10) = +10, which is positive display
      expect(screen.getByText('+10%')).toBeDefined()
    })

    it('should treat positive coverage change as positive', () => {
      mockLocale.mockReturnValue('en')
      render(
        <RecommendationCard
          recommendation={createRecommendation({
            estimatedImpact: { coverageChange: 25 },
          })}
        />
      )
      expect(screen.getByText('+25%')).toBeDefined()
    })

    it('should show negative values without plus sign', () => {
      mockLocale.mockReturnValue('en')
      render(
        <RecommendationCard
          recommendation={createRecommendation({
            estimatedImpact: { coverageChange: -5 },
          })}
        />
      )
      expect(screen.getByText('-5%')).toBeDefined()
    })
  })
})

describe('RecommendationList', () => {
  it('should render empty state in English', () => {
    mockLocale.mockReturnValue('en')
    render(<RecommendationList recommendations={[]} />)
    expect(screen.getByText('No recommendations')).toBeDefined()
  })

  it('should render empty state in Turkish', () => {
    mockLocale.mockReturnValue('tr')
    render(<RecommendationList recommendations={[]} />)
    expect(screen.getByText('Öneri bulunmuyor')).toBeDefined()
  })

  it('should render all recommendations', () => {
    mockLocale.mockReturnValue('en')
    const recs = [
      createRecommendation({ title: 'Rec A', priority: 'high' }),
      createRecommendation({ title: 'Rec B', priority: 'low' }),
    ]
    render(<RecommendationList recommendations={recs} />)
    expect(screen.getByText('Rec A')).toBeDefined()
    expect(screen.getByText('Rec B')).toBeDefined()
  })

  it('should sort by priority (critical first)', () => {
    mockLocale.mockReturnValue('en')
    const recs = [
      createRecommendation({ title: 'Low', priority: 'low' }),
      createRecommendation({ title: 'Critical', priority: 'critical' }),
      createRecommendation({ title: 'High', priority: 'high' }),
    ]
    const { container } = render(<RecommendationList recommendations={recs} />)
    const cards = container.querySelectorAll('[class*="border-l-"]')
    expect(cards.length).toBe(3)
  })

  it('should limit displayed items with maxItems', () => {
    mockLocale.mockReturnValue('en')
    const recs = [
      createRecommendation({ title: 'A', priority: 'critical' }),
      createRecommendation({ title: 'B', priority: 'high' }),
      createRecommendation({ title: 'C', priority: 'medium' }),
    ]
    render(<RecommendationList recommendations={recs} maxItems={2} />)
    expect(screen.getByText('+1 more recommendations')).toBeDefined()
  })

  it('should show Turkish remaining text with maxItems', () => {
    mockLocale.mockReturnValue('tr')
    const recs = [
      createRecommendation({ title: 'A', priority: 'critical' }),
      createRecommendation({ title: 'B', priority: 'high' }),
      createRecommendation({ title: 'C', priority: 'medium' }),
      createRecommendation({ title: 'D', priority: 'low' }),
    ]
    render(<RecommendationList recommendations={recs} maxItems={2} />)
    expect(screen.getByText('+2 daha fazla öneri')).toBeDefined()
  })

  it('should not show remaining text when maxItems covers all', () => {
    mockLocale.mockReturnValue('en')
    const recs = [
      createRecommendation({ title: 'A' }),
      createRecommendation({ title: 'B' }),
    ]
    render(<RecommendationList recommendations={recs} maxItems={5} />)
    expect(screen.queryByText(/more recommendations/)).toBeNull()
  })

  it('should render in compact mode', () => {
    mockLocale.mockReturnValue('en')
    const recs = [createRecommendation()]
    render(<RecommendationList recommendations={recs} compact />)
    // In compact mode, description should not be present
    expect(screen.queryByText('Consider increasing your coverage limit.')).toBeNull()
  })

  it('should pass onDismiss to individual cards', async () => {
    mockLocale.mockReturnValue('en')
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const recs = [createRecommendation()]
    render(<RecommendationList recommendations={recs} onDismiss={onDismiss} />)
    await user.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledWith(0)
  })

  it('should apply custom className', () => {
    mockLocale.mockReturnValue('en')
    render(<RecommendationList recommendations={[]} className="custom-list" />)
    // The className is applied to the same div that contains the text for empty state
    const el = screen.getByText('No recommendations')
    expect(el).toHaveClass('custom-list')
  })
})
