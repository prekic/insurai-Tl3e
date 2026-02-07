/**
 * SettingsDiffViewer Component Tests
 *
 * Tests for visual diff rendering including:
 * - Primitive value diffs (strings, numbers, booleans)
 * - Object/JSON diffs with field-level changes
 * - Null/empty value transitions
 * - Inline (compact) mode
 * - Character-level inline highlighting
 * - Change summary computation
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  SettingsDiffViewer,
  computeObjectDiff,
  computeInlineStringDiff,
  getChangeSummary,
  normalizeValue,
  formatDisplayValue,
} from './SettingsDiffViewer'

describe('SettingsDiffViewer', () => {
  describe('Primitive Diff (Full Mode)', () => {
    it('should render string value change with inline highlights', () => {
      render(<SettingsDiffViewer previousValue="gpt-4o" newValue="gpt-4o-mini" />)

      expect(screen.getByText(/Previous/)).toBeInTheDocument()
      expect(screen.getByText(/New/)).toBeInTheDocument()
      expect(screen.getByText(/Text changed/i)).toBeInTheDocument()
    })

    it('should render number change with increase summary', () => {
      render(<SettingsDiffViewer previousValue={100} newValue={150} />)

      expect(screen.getByText(/Increased by 50/)).toBeInTheDocument()
    })

    it('should render number change with decrease summary', () => {
      render(<SettingsDiffViewer previousValue={200} newValue={100} />)

      expect(screen.getByText(/Decreased by 100/)).toBeInTheDocument()
    })

    it('should render boolean toggle on', () => {
      render(<SettingsDiffViewer previousValue={false} newValue={true} />)

      expect(screen.getByText(/Toggled on/i)).toBeInTheDocument()
    })

    it('should render boolean toggle off', () => {
      render(<SettingsDiffViewer previousValue={true} newValue={false} />)

      expect(screen.getByText(/Toggled off/i)).toBeInTheDocument()
    })
  })

  describe('Null/Empty Transitions', () => {
    it('should show "Value Set" badge when previous is null', () => {
      render(<SettingsDiffViewer previousValue={null} newValue="new_value" />)

      expect(screen.getByText(/Value Set/)).toBeInTheDocument()
      expect(screen.getByText('new_value')).toBeInTheDocument()
    })

    it('should show "Value Cleared" badge when new is null', () => {
      render(<SettingsDiffViewer previousValue="old_value" newValue={null} />)

      expect(screen.getByText(/Value Cleared/)).toBeInTheDocument()
      expect(screen.getByText('old_value')).toBeInTheDocument()
    })

    it('should show "Value Set" when previous is undefined', () => {
      render(<SettingsDiffViewer previousValue={undefined} newValue={42} />)

      expect(screen.getByText(/Value Set/)).toBeInTheDocument()
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('should show "Value Cleared" when new is undefined', () => {
      render(<SettingsDiffViewer previousValue="something" newValue={undefined} />)

      expect(screen.getByText(/Value Cleared/)).toBeInTheDocument()
    })
  })

  describe('Object Diff', () => {
    it('should render field-level diff for object changes', () => {
      const prev = { model: 'gpt-4o', temperature: 0.1, maxTokens: 4096 }
      const next = { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 4096 }

      render(<SettingsDiffViewer previousValue={prev} newValue={next} />)

      expect(screen.getByText(/2 fields? changed/i)).toBeInTheDocument()
      expect(screen.getByText('model')).toBeInTheDocument()
      expect(screen.getByText('temperature')).toBeInTheDocument()
    })

    it('should show added fields in object diff', () => {
      const prev = { model: 'gpt-4o' }
      const next = { model: 'gpt-4o', temperature: 0.5 }

      render(<SettingsDiffViewer previousValue={prev} newValue={next} />)

      expect(screen.getByText(/1 field changed/i)).toBeInTheDocument()
      expect(screen.getByText('temperature')).toBeInTheDocument()
    })

    it('should show removed fields in object diff', () => {
      const prev = { model: 'gpt-4o', legacy: true }
      const next = { model: 'gpt-4o' }

      render(<SettingsDiffViewer previousValue={prev} newValue={next} />)

      expect(screen.getByText(/1 field changed/i)).toBeInTheDocument()
      expect(screen.getByText('legacy')).toBeInTheDocument()
    })

    it('should allow toggling unchanged fields visibility', () => {
      const prev = { model: 'gpt-4o', temperature: 0.1, maxTokens: 4096 }
      const next = { model: 'gpt-4o-mini', temperature: 0.1, maxTokens: 4096 }

      render(<SettingsDiffViewer previousValue={prev} newValue={next} />)

      // Unchanged fields should be hidden initially
      const toggleBtn = screen.getByText(/Show 2 unchanged fields/i)
      expect(toggleBtn).toBeInTheDocument()

      // Click to show unchanged
      fireEvent.click(toggleBtn)

      expect(screen.getByText(/Hide 2 unchanged fields/i)).toBeInTheDocument()
      expect(screen.getByText('temperature')).toBeInTheDocument()
      expect(screen.getByText('maxTokens')).toBeInTheDocument()
    })

    it('should not show unchanged toggle when all fields changed', () => {
      const prev = { a: 1 }
      const next = { a: 2 }

      render(<SettingsDiffViewer previousValue={prev} newValue={next} />)

      expect(screen.queryByText(/unchanged field/i)).not.toBeInTheDocument()
    })
  })

  describe('Inline Mode', () => {
    it('should render compact inline diff for strings', () => {
      render(
        <SettingsDiffViewer previousValue="old" newValue="new" inline />
      )

      expect(screen.getByText('old')).toBeInTheDocument()
      expect(screen.getByText('new')).toBeInTheDocument()
    })

    it('should truncate long values in inline mode', () => {
      const longPrev = 'a'.repeat(50)
      const longNew = 'b'.repeat(50)

      render(
        <SettingsDiffViewer previousValue={longPrev} newValue={longNew} inline />
      )

      // Should contain truncated text with ...
      const prevEl = screen.getByText(/a{20,}\.\.\./)
      expect(prevEl).toBeInTheDocument()
    })

    it('should render inline diff for numbers', () => {
      render(
        <SettingsDiffViewer previousValue={100} newValue={200} inline />
      )

      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('200')).toBeInTheDocument()
    })

    it('should show (empty) for null values in inline mode', () => {
      render(
        <SettingsDiffViewer previousValue={null} newValue="value" inline />
      )

      expect(screen.getByText('(empty)')).toBeInTheDocument()
      expect(screen.getByText('value')).toBeInTheDocument()
    })
  })
})

describe('computeObjectDiff', () => {
  it('should detect unchanged fields', () => {
    const result = computeObjectDiff({ a: 1, b: 2 }, { a: 1, b: 2 })

    expect(result).toHaveLength(2)
    expect(result.every(l => l.type === 'unchanged')).toBe(true)
  })

  it('should detect changed fields', () => {
    const result = computeObjectDiff({ a: 1 }, { a: 2 })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      key: 'a',
      oldValue: '1',
      newValue: '2',
      type: 'changed',
    })
  })

  it('should detect added fields', () => {
    const result = computeObjectDiff({}, { a: 1 })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      key: 'a',
      newValue: '1',
      type: 'added',
    })
  })

  it('should detect removed fields', () => {
    const result = computeObjectDiff({ a: 1 }, {})

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      key: 'a',
      oldValue: '1',
      type: 'removed',
    })
  })

  it('should handle mixed changes', () => {
    const result = computeObjectDiff(
      { unchanged: 1, changed: 2, removed: 3 },
      { unchanged: 1, changed: 99, added: 4 }
    )

    expect(result).toHaveLength(4)
    expect(result.find(l => l.key === 'unchanged')?.type).toBe('unchanged')
    expect(result.find(l => l.key === 'changed')?.type).toBe('changed')
    expect(result.find(l => l.key === 'removed')?.type).toBe('removed')
    expect(result.find(l => l.key === 'added')?.type).toBe('added')
  })

  it('should handle nested object values', () => {
    const result = computeObjectDiff(
      { config: { nested: true } },
      { config: { nested: false } }
    )

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('changed')
    expect(result[0].oldValue).toContain('"nested": true')
    expect(result[0].newValue).toContain('"nested": false')
  })
})

describe('computeInlineStringDiff', () => {
  it('should find common prefix and suffix', () => {
    const { oldSegments, newSegments } = computeInlineStringDiff('gpt-4o', 'gpt-4o-mini')

    expect(oldSegments[0]).toEqual({ text: 'gpt-4o', type: 'same' })
    expect(newSegments[0]).toEqual({ text: 'gpt-4o', type: 'same' })
    expect(newSegments[1]).toEqual({ text: '-mini', type: 'added' })
  })

  it('should handle completely different strings', () => {
    const { oldSegments, newSegments } = computeInlineStringDiff('abc', 'xyz')

    expect(oldSegments).toEqual([{ text: 'abc', type: 'removed' }])
    expect(newSegments).toEqual([{ text: 'xyz', type: 'added' }])
  })

  it('should handle identical strings', () => {
    const { oldSegments, newSegments } = computeInlineStringDiff('same', 'same')

    expect(oldSegments).toEqual([{ text: 'same', type: 'same' }])
    expect(newSegments).toEqual([{ text: 'same', type: 'same' }])
  })

  it('should highlight middle changes', () => {
    const { oldSegments, newSegments } = computeInlineStringDiff('hello world!', 'hello earth!')

    // Common prefix: "hello "
    expect(oldSegments[0]).toEqual({ text: 'hello ', type: 'same' })
    // Changed middle
    expect(oldSegments[1]).toEqual({ text: 'world', type: 'removed' })
    expect(newSegments[1]).toEqual({ text: 'earth', type: 'added' })
    // Common suffix: "!"
    expect(oldSegments[2]).toEqual({ text: '!', type: 'same' })
  })

  it('should handle empty old string', () => {
    const { oldSegments, newSegments } = computeInlineStringDiff('', 'new')

    expect(oldSegments).toEqual([])
    expect(newSegments).toEqual([{ text: 'new', type: 'added' }])
  })

  it('should handle empty new string', () => {
    const { oldSegments, newSegments } = computeInlineStringDiff('old', '')

    expect(oldSegments).toEqual([{ text: 'old', type: 'removed' }])
    expect(newSegments).toEqual([])
  })
})

describe('getChangeSummary', () => {
  it('should return "Value set" for null to value', () => {
    expect(getChangeSummary(null, 'hello')).toBe('Value set')
  })

  it('should return "Value cleared" for value to null', () => {
    expect(getChangeSummary('hello', null)).toBe('Value cleared')
  })

  it('should summarize number increase', () => {
    expect(getChangeSummary(100, 150)).toContain('Increased by 50')
  })

  it('should summarize number decrease', () => {
    expect(getChangeSummary(200, 100)).toContain('Decreased by 100')
  })

  it('should summarize number no change', () => {
    expect(getChangeSummary(42, 42)).toBe('No change')
  })

  it('should summarize boolean toggle on', () => {
    expect(getChangeSummary(false, true)).toBe('Toggled on')
  })

  it('should summarize boolean toggle off', () => {
    expect(getChangeSummary(true, false)).toBe('Toggled off')
  })

  it('should summarize string length change', () => {
    expect(getChangeSummary('ab', 'abcde')).toContain('2')
    expect(getChangeSummary('ab', 'abcde')).toContain('5')
  })

  it('should summarize string same-length change', () => {
    expect(getChangeSummary('abc', 'xyz')).toBe('Text changed')
  })

  it('should summarize object changes', () => {
    const result = getChangeSummary(
      { a: 1, b: 2 },
      { a: 1, b: 3, c: 4 }
    )
    expect(result).toContain('1 added')
    expect(result).toContain('1 changed')
  })

  it('should fallback to generic message for mixed types', () => {
    expect(getChangeSummary('string', 42)).toBe('Value changed')
  })
})

describe('normalizeValue', () => {
  it('should return empty string for null', () => {
    expect(normalizeValue(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(normalizeValue(undefined)).toBe('')
  })

  it('should stringify objects', () => {
    expect(normalizeValue({ a: 1 })).toContain('"a"')
  })

  it('should convert numbers to string', () => {
    expect(normalizeValue(42)).toBe('42')
  })

  it('should convert booleans to string', () => {
    expect(normalizeValue(true)).toBe('true')
  })
})

describe('formatDisplayValue', () => {
  it('should return (empty) for null', () => {
    expect(formatDisplayValue(null)).toBe('(empty)')
  })

  it('should return (empty) for undefined', () => {
    expect(formatDisplayValue(undefined)).toBe('(empty)')
  })

  it('should format booleans', () => {
    expect(formatDisplayValue(true)).toBe('true')
    expect(formatDisplayValue(false)).toBe('false')
  })

  it('should format objects as JSON', () => {
    const result = formatDisplayValue({ key: 'val' })
    expect(result).toContain('"key"')
    expect(result).toContain('"val"')
  })

  it('should format strings directly', () => {
    expect(formatDisplayValue('hello')).toBe('hello')
  })

  it('should format numbers directly', () => {
    expect(formatDisplayValue(42)).toBe('42')
  })
})
