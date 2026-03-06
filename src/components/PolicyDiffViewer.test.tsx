/**
 * PolicyDiffViewer Component Tests
 *
 * Tests for PolicyDiffViewer, DiffRow, ArrayDiffDetail, and PolicyDiffSummary:
 * - Empty changes displays "no changes" message
 * - Changes sorted by significance (critical > major > moderate > minor)
 * - Compact vs full DiffRow rendering
 * - Value formatting (number, date, array, string, empty)
 * - Significance styling (critical, major, moderate, minor)
 * - Array diff details (added/removed items, truncation at 5)
 * - PolicyDiffSummary counts critical, major, and other
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PolicyDiffViewer, PolicyDiffSummary } from './PolicyDiffViewer'
import type { PolicyFieldDiff } from '@/lib/policy-utils'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: EN_TRANSLATIONS,
    locale: 'en',
    isLoading: false,
  }),
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
    formatDate: (date: string) => {
      const d = new Date(date)
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
    },
  }
})

// ========== Test Data ==========

const createChange = (overrides: Partial<PolicyFieldDiff> = {}): PolicyFieldDiff => ({
  field: 'premium',
  fieldLabel: 'Premium',
  fieldLabelTr: 'Prim',
  oldValue: 3200,
  newValue: 3500,
  type: 'number',
  significance: 'major',
  ...overrides,
})

describe('PolicyDiffViewer', () => {
  // ========== Empty State ==========

  it('shows "No changes detected" when changes array is empty', () => {
    render(<PolicyDiffViewer changes={[]} />)
    expect(screen.getByText('No changes detected')).toBeInTheDocument()
  })

  it('applies custom className to empty state', () => {
    const { container } = render(<PolicyDiffViewer changes={[]} className="custom" />)
    expect(container.firstChild).toHaveClass('custom')
  })

  // ========== Sorting by Significance ==========

  it('sorts changes by significance: critical first, minor last', () => {
    const changes: PolicyFieldDiff[] = [
      createChange({ field: 'f1', fieldLabel: 'Minor Field', significance: 'minor' }),
      createChange({ field: 'f2', fieldLabel: 'Critical Field', significance: 'critical' }),
      createChange({ field: 'f3', fieldLabel: 'Major Field', significance: 'major' }),
      createChange({ field: 'f4', fieldLabel: 'Moderate Field', significance: 'moderate' }),
    ]
    render(<PolicyDiffViewer changes={changes} />)

    const labels = screen.getAllByText(/Field/)
    const labelTexts = labels.map((el) => el.textContent)
    // Critical should come before Major, Major before Moderate, Moderate before Minor
    const criticalIdx = labelTexts.findIndex((t) => t?.includes('Critical'))
    const majorIdx = labelTexts.findIndex((t) => t?.includes('Major'))
    const moderateIdx = labelTexts.findIndex((t) => t?.includes('Moderate'))
    const minorIdx = labelTexts.findIndex((t) => t?.includes('Minor'))

    expect(criticalIdx).toBeLessThan(majorIdx)
    expect(majorIdx).toBeLessThan(moderateIdx)
    expect(moderateIdx).toBeLessThan(minorIdx)
  })

  // ========== Full Mode Rendering ==========

  it('renders field label and significance label in full mode', () => {
    const change = createChange({ significance: 'critical' })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('renders Previous Value and New Value headers in full mode', () => {
    render(<PolicyDiffViewer changes={[createChange()]} />)
    expect(screen.getByText('Previous Value')).toBeInTheDocument()
    expect(screen.getByText('New Value')).toBeInTheDocument()
  })

  it('renders significance labels for all levels', () => {
    const changes: PolicyFieldDiff[] = [
      createChange({ field: 'f1', fieldLabel: 'F1', significance: 'critical' }),
      createChange({ field: 'f2', fieldLabel: 'F2', significance: 'major' }),
      createChange({ field: 'f3', fieldLabel: 'F3', significance: 'moderate' }),
      createChange({ field: 'f4', fieldLabel: 'F4', significance: 'minor' }),
    ]
    render(<PolicyDiffViewer changes={changes} />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Major')).toBeInTheDocument()
    expect(screen.getByText('Moderate')).toBeInTheDocument()
    expect(screen.getByText('Minor')).toBeInTheDocument()
  })

  // ========== Compact Mode ==========

  it('renders compact diff rows with inline layout', () => {
    const change = createChange()
    render(<PolicyDiffViewer changes={[change]} compact />)
    // In compact mode, label is followed by colon
    expect(screen.getByText('Premium:')).toBeInTheDocument()
  })

  // ========== Value Formatting ==========

  it('formats number values as currency', () => {
    const change = createChange({
      type: 'number',
      oldValue: 3200,
      newValue: 3500,
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('₺3,200')).toBeInTheDocument()
    expect(screen.getByText('₺3,500')).toBeInTheDocument()
  })

  it('formats date values', () => {
    const change = createChange({
      field: 'expiryDate',
      fieldLabel: 'Expiry',
      type: 'date',
      oldValue: '2025-01-15',
      newValue: '2026-01-15',
    })
    render(<PolicyDiffViewer changes={[change]} />)
    // formatDate outputs MM/DD/YYYY
    expect(screen.getByText('1/15/2025')).toBeInTheDocument()
    expect(screen.getByText('1/15/2026')).toBeInTheDocument()
  })

  it('formats array values with item count', () => {
    const change = createChange({
      field: 'exclusions',
      fieldLabel: 'Exclusions',
      type: 'array',
      oldValue: ['war', 'nuclear'],
      newValue: ['war', 'nuclear', 'flood'],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('2 item(s)')).toBeInTheDocument()
    expect(screen.getByText('3 item(s)')).toBeInTheDocument()
  })

  it('shows "(empty)" for null/undefined/empty values', () => {
    const change = createChange({
      field: 'location',
      fieldLabel: 'Location',
      type: 'string',
      oldValue: null,
      newValue: 'Istanbul',
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('(empty)')).toBeInTheDocument()
    expect(screen.getByText('Istanbul')).toBeInTheDocument()
  })

  it('shows "(empty)" for empty string value', () => {
    const change = createChange({
      type: 'string',
      oldValue: '',
      newValue: 'New value',
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('shows "(empty)" for empty array', () => {
    const change = createChange({
      type: 'array',
      oldValue: [],
      newValue: ['item'],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('handles string value type', () => {
    const change = createChange({
      type: 'string',
      oldValue: 'Old Provider',
      newValue: 'New Provider',
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Old Provider')).toBeInTheDocument()
    expect(screen.getByText('New Provider')).toBeInTheDocument()
  })

  // ========== Array Diff Detail ==========

  it('shows added items in array diff', () => {
    const change = createChange({
      type: 'array',
      oldValue: ['war'],
      newValue: ['war', 'flood', 'earthquake'],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Added:')).toBeInTheDocument()
    expect(screen.getByText(/flood/)).toBeInTheDocument()
    expect(screen.getByText(/earthquake/)).toBeInTheDocument()
  })

  it('shows removed items in array diff', () => {
    const change = createChange({
      type: 'array',
      oldValue: ['war', 'nuclear'],
      newValue: ['war'],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Removed:')).toBeInTheDocument()
    expect(screen.getByText(/nuclear/)).toBeInTheDocument()
  })

  it('truncates array diff at 5 items and shows "+N more"', () => {
    const oldItems = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const change = createChange({
      type: 'array',
      oldValue: oldItems,
      newValue: [],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Removed:')).toBeInTheDocument()
    // Shows 5 items then "+3 more"
    expect(screen.getByText('+3 more')).toBeInTheDocument()
  })

  it('truncates added items at 5 and shows "+N more"', () => {
    const newItems = Array.from({ length: 8 }, (_, i) => `item-${i}`)
    const change = createChange({
      type: 'array',
      oldValue: [],
      newValue: newItems,
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Added:')).toBeInTheDocument()
    expect(screen.getByText('+3 more')).toBeInTheDocument()
  })

  it('does not render array detail when no items added or removed', () => {
    const change = createChange({
      type: 'array',
      oldValue: ['same'],
      newValue: ['same'],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.queryByText('Added:')).not.toBeInTheDocument()
    expect(screen.queryByText('Removed:')).not.toBeInTheDocument()
  })

  it('handles non-string array items (JSON stringified)', () => {
    const change = createChange({
      type: 'array',
      oldValue: [],
      newValue: [{ name: 'coverage-obj' }],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Added:')).toBeInTheDocument()
    expect(screen.getByText(/coverage-obj/)).toBeInTheDocument()
  })

  it('handles non-array values gracefully in ArrayDiffDetail', () => {
    const change = createChange({
      type: 'array',
      oldValue: 'not-an-array',
      newValue: ['item'],
    })
    render(<PolicyDiffViewer changes={[change]} />)
    expect(screen.getByText('Added:')).toBeInTheDocument()
  })

  // ========== Custom className ==========

  it('applies custom className to viewer container', () => {
    const { container } = render(
      <PolicyDiffViewer changes={[createChange()]} className="custom-diff" />
    )
    expect(container.firstChild).toHaveClass('custom-diff')
  })
})

// ========== PolicyDiffSummary ==========

describe('PolicyDiffSummary', () => {
  it('shows critical count', () => {
    const changes: PolicyFieldDiff[] = [
      createChange({ significance: 'critical' }),
      createChange({ significance: 'critical', field: 'f2' }),
    ]
    render(<PolicyDiffSummary changes={changes} />)
    expect(screen.getByText('2 critical')).toBeInTheDocument()
  })

  it('shows major count', () => {
    const changes: PolicyFieldDiff[] = [createChange({ significance: 'major' })]
    render(<PolicyDiffSummary changes={changes} />)
    expect(screen.getByText('1 major')).toBeInTheDocument()
  })

  it('shows other count for moderate and minor', () => {
    const changes: PolicyFieldDiff[] = [
      createChange({ significance: 'moderate' }),
      createChange({ significance: 'minor', field: 'f2' }),
    ]
    render(<PolicyDiffSummary changes={changes} />)
    expect(screen.getByText('2 other')).toBeInTheDocument()
  })

  it('shows all categories when mixed', () => {
    const changes: PolicyFieldDiff[] = [
      createChange({ significance: 'critical', field: 'f1' }),
      createChange({ significance: 'major', field: 'f2' }),
      createChange({ significance: 'moderate', field: 'f3' }),
    ]
    render(<PolicyDiffSummary changes={changes} />)
    expect(screen.getByText('1 critical')).toBeInTheDocument()
    expect(screen.getByText('1 major')).toBeInTheDocument()
    expect(screen.getByText('1 other')).toBeInTheDocument()
  })

  it('does not show categories with 0 count', () => {
    const changes: PolicyFieldDiff[] = [createChange({ significance: 'minor' })]
    render(<PolicyDiffSummary changes={changes} />)
    expect(screen.queryByText(/critical/)).not.toBeInTheDocument()
    expect(screen.queryByText(/major/)).not.toBeInTheDocument()
    expect(screen.getByText('1 other')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <PolicyDiffSummary changes={[createChange()]} className="custom-summary" />
    )
    expect(container.firstChild).toHaveClass('custom-summary')
  })
})
