import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpecialProvisionsPanel } from './SpecialProvisionsPanel'

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

describe('SpecialProvisionsPanel', () => {
  it('renders nothing when provisions array is empty', () => {
    const { container } = render(<SpecialProvisionsPanel provisions={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when isUnverified is true even with provisions present', () => {
    const { container } = render(
      <SpecialProvisionsPanel
        provisions={['Anlaşmalı olmayan servis: %35']}
        isUnverified={true}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows count badge and collapsed-state count text when provisions exist', () => {
    render(
      <SpecialProvisionsPanel
        provisions={[
          'Anlaşmalı olmayan servis: %35',
          'Pert araç muafiyeti: %20',
          'Beyan dışı LPG / CNG donanımı: %50',
        ]}
      />
    )
    // Badge with count
    expect(screen.getByText('3')).toBeInTheDocument()
    // Header label
    expect(screen.getByText('Special Provisions')).toBeInTheDocument()
    // Collapsed-state hint message
    expect(screen.getByText(/3 scenarios/i)).toBeInTheDocument()
  })

  it('expands on click and renders each provision split into label + percentage', () => {
    render(
      <SpecialProvisionsPanel
        provisions={[
          'Anlaşmalı olmayan servis: %35',
          'Pert araç muafiyeti: %20',
        ]}
      />
    )
    const toggleButton = screen.getByRole('button')
    fireEvent.click(toggleButton)

    // Both labels render (without the percentage)
    expect(screen.getByText('Anlaşmalı olmayan servis')).toBeInTheDocument()
    expect(screen.getByText('Pert araç muafiyeti')).toBeInTheDocument()
    // Both percentages render separately (right-aligned)
    expect(screen.getByText('%35')).toBeInTheDocument()
    expect(screen.getByText('%20')).toBeInTheDocument()
  })

  it('renders a provision verbatim when it has no ": " separator (graceful fallback)', () => {
    render(<SpecialProvisionsPanel provisions={['No-separator legacy entry']} />)
    fireEvent.click(screen.getByRole('button'))
    // The whole string lands in the label slot since there's no ":" to split on
    expect(screen.getByText('No-separator legacy entry')).toBeInTheDocument()
  })

  it('toggles expanded state on each click', () => {
    render(
      <SpecialProvisionsPanel
        provisions={['Anlaşmalı olmayan servis: %35']}
      />
    )
    const toggleButton = screen.getByRole('button')

    // Initially collapsed — count text visible, list not
    expect(screen.queryByText('Anlaşmalı olmayan servis')).not.toBeInTheDocument()
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')

    // Expand
    fireEvent.click(toggleButton)
    expect(screen.getByText('Anlaşmalı olmayan servis')).toBeInTheDocument()
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')

    // Collapse again
    fireEvent.click(toggleButton)
    expect(screen.queryByText('Anlaşmalı olmayan servis')).not.toBeInTheDocument()
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
  })
})
