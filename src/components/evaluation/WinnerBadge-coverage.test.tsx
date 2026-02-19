/**
 * WinnerBadge - Coverage Tests
 *
 * Targets uncovered branches in WinnerBadge.tsx
 * Covers: WinnerBadge, TrophyIndicator, RankBadge components
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock i18n
const { mockLocale } = vi.hoisted(() => ({
  mockLocale: { current: 'en' },
}))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: mockLocale.current,
    t: {},
    translate: (key: string) => key,
    isLoading: false,
    progress: { status: 'idle', progress: 100, message: '' },
    localeInfo: { code: mockLocale.current },
    isRTL: false,
    availableLocales: {},
    dynamicLocales: [],
    refreshTranslations: async () => {},
    setLocale: async () => {},
  }),
}))

import { WinnerBadge, TrophyIndicator, RankBadge } from './WinnerBadge'

describe('WinnerBadge coverage', () => {
  beforeEach(() => {
    mockLocale.current = 'en'
  })

  describe('WinnerBadge', () => {
    it('renders with default category (overall) and size (sm)', () => {
      render(<WinnerBadge />)
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveAttribute('aria-label', 'Best Overall')
    })

    it('renders overall category', () => {
      render(<WinnerBadge category="overall" />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveAttribute('title', 'Best Overall')
    })

    it('renders premium category', () => {
      render(<WinnerBadge category="premium" />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveAttribute('title', 'Best Premium')
    })

    it('renders coverage category', () => {
      render(<WinnerBadge category="coverage" />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveAttribute('title', 'Best Coverage')
    })

    it('renders value category', () => {
      render(<WinnerBadge category="value" />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveAttribute('title', 'Best Value')
    })

    it('renders compliance category', () => {
      render(<WinnerBadge category="compliance" />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveAttribute('title', 'Best Compliance')
    })

    it('renders md size', () => {
      render(<WinnerBadge size="md" />)
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })

    it('renders sm size', () => {
      render(<WinnerBadge size="sm" />)
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })

    it('does not show label by default', () => {
      render(<WinnerBadge />)
      const badge = screen.getByRole('status')
      expect(badge.textContent).toBe('')
    })

    it('shows label when showLabel is true', () => {
      render(<WinnerBadge showLabel />)
      expect(screen.getByText('Best Overall')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<WinnerBadge className="custom-class" />)
      const badge = screen.getByRole('status')
      expect(badge.className).toContain('custom-class')
    })

    it('shows Turkish labels when locale is tr', () => {
      mockLocale.current = 'tr'
      render(<WinnerBadge category="overall" showLabel />)
      expect(screen.getByText('En İyi Genel')).toBeInTheDocument()
    })

    it('shows Turkish premium label', () => {
      mockLocale.current = 'tr'
      render(<WinnerBadge category="premium" showLabel />)
      expect(screen.getByText('En İyi Prim')).toBeInTheDocument()
    })

    it('shows Turkish coverage label', () => {
      mockLocale.current = 'tr'
      render(<WinnerBadge category="coverage" showLabel />)
      expect(screen.getByText('En İyi Teminat')).toBeInTheDocument()
    })

    it('shows Turkish value label', () => {
      mockLocale.current = 'tr'
      render(<WinnerBadge category="value" showLabel />)
      expect(screen.getByText('En İyi Değer')).toBeInTheDocument()
    })

    it('shows Turkish compliance label', () => {
      mockLocale.current = 'tr'
      render(<WinnerBadge category="compliance" showLabel />)
      expect(screen.getByText('En İyi Uyumluluk')).toBeInTheDocument()
    })
  })

  describe('TrophyIndicator', () => {
    it('returns null when not winner, best, or worst', () => {
      const { container } = render(
        <TrophyIndicator isWinner={false} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders trophy for winner', () => {
      render(<TrophyIndicator isWinner={true} />)
      const indicator = screen.getByLabelText('Best value')
      expect(indicator).toBeInTheDocument()
    })

    it('renders trophy for isBest', () => {
      render(<TrophyIndicator isWinner={false} isBest={true} />)
      const indicator = screen.getByLabelText('Best value')
      expect(indicator).toBeInTheDocument()
    })

    it('renders dimmed trophy for isWorst', () => {
      render(<TrophyIndicator isWinner={false} isWorst={true} />)
      const indicator = screen.getByLabelText('Lowest value')
      expect(indicator).toBeInTheDocument()
    })

    it('shows worst over winner when both are true', () => {
      // isWorst check comes first in the code
      render(<TrophyIndicator isWinner={true} isWorst={true} />)
      const indicator = screen.getByLabelText('Lowest value')
      expect(indicator).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<TrophyIndicator isWinner={true} className="my-class" />)
      const indicator = screen.getByLabelText('Best value')
      expect(indicator.className).toContain('my-class')
    })

    it('shows Turkish title for best when locale is tr', () => {
      mockLocale.current = 'tr'
      render(<TrophyIndicator isWinner={true} />)
      const indicator = screen.getByLabelText('Best value')
      expect(indicator).toHaveAttribute('title', 'En iyi')
    })

    it('shows Turkish title for worst when locale is tr', () => {
      mockLocale.current = 'tr'
      render(<TrophyIndicator isWinner={false} isWorst={true} />)
      const indicator = screen.getByLabelText('Lowest value')
      expect(indicator).toHaveAttribute('title', 'En düşük')
    })

    it('shows English title for best when locale is en', () => {
      render(<TrophyIndicator isWinner={true} />)
      const indicator = screen.getByLabelText('Best value')
      expect(indicator).toHaveAttribute('title', 'Best')
    })

    it('shows English title for worst when locale is en', () => {
      render(<TrophyIndicator isWinner={false} isWorst={true} />)
      const indicator = screen.getByLabelText('Lowest value')
      expect(indicator).toHaveAttribute('title', 'Lowest')
    })
  })

  describe('RankBadge', () => {
    it('renders rank 1 with correct color and label', () => {
      render(<RankBadge rank={1} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('1st')
      expect(badge).toHaveAttribute('aria-label', 'Rank 1')
      expect(badge.className).toContain('amber')
    })

    it('renders rank 2 with correct color and label', () => {
      render(<RankBadge rank={2} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('2nd')
      expect(badge.className).toContain('gray')
    })

    it('renders rank 3 with correct color and label', () => {
      render(<RankBadge rank={3} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('3rd')
      expect(badge.className).toContain('orange')
    })

    it('renders rank 4+ with th suffix', () => {
      render(<RankBadge rank={4} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('4th')
    })

    it('renders rank 5 with th suffix', () => {
      render(<RankBadge rank={5} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('5th')
    })

    it('renders Turkish rank labels (dot suffix)', () => {
      mockLocale.current = 'tr'
      render(<RankBadge rank={1} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('1.')
    })

    it('renders Turkish rank 2', () => {
      mockLocale.current = 'tr'
      render(<RankBadge rank={2} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('2.')
    })

    it('renders Turkish rank 3', () => {
      mockLocale.current = 'tr'
      render(<RankBadge rank={3} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('3.')
    })

    it('renders Turkish rank 10', () => {
      mockLocale.current = 'tr'
      render(<RankBadge rank={10} />)
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('10.')
    })

    it('renders md size', () => {
      render(<RankBadge rank={1} size="md" />)
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })

    it('renders sm size (default)', () => {
      render(<RankBadge rank={1} />)
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<RankBadge rank={1} className="my-rank" />)
      const badge = screen.getByRole('status')
      expect(badge.className).toContain('my-rank')
    })

    it('rank 4 uses gray color', () => {
      render(<RankBadge rank={4} />)
      const badge = screen.getByRole('status')
      // getRankColor returns bg-gray-50 for rank >= 4
      expect(badge.className).toContain('gray')
    })
  })
})
