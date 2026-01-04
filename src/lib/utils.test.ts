import { describe, it, expect } from 'vitest'
import { cn, formatCurrency, formatDate, formatNumber } from './utils'

describe('cn (classnames utility)', () => {
  it('merges class names correctly', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isInactive = false
    expect(cn('base', isActive && 'active', isInactive && 'inactive')).toBe('base active')
  })

  it('merges Tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('handles undefined and null values', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})

describe('formatCurrency', () => {
  it('formats TRY currency correctly', () => {
    const result = formatCurrency(1000)
    expect(result).toContain('1.000')
    expect(result).toContain('₺')
  })

  it('formats large numbers correctly', () => {
    const result = formatCurrency(500000)
    expect(result).toContain('500.000')
  })

  it('handles zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
  })
})

describe('formatDate', () => {
  it('formats date string correctly', () => {
    const result = formatDate('2024-01-15')
    expect(result).toBe('15.01.2024')
  })

  it('formats Date object correctly', () => {
    const date = new Date(2024, 0, 15) // January 15, 2024
    const result = formatDate(date)
    expect(result).toBe('15.01.2024')
  })
})

describe('formatNumber', () => {
  it('formats numbers with Turkish locale', () => {
    expect(formatNumber(1000)).toBe('1.000')
    expect(formatNumber(1000000)).toBe('1.000.000')
  })

  it('handles small numbers', () => {
    expect(formatNumber(42)).toBe('42')
  })
})
