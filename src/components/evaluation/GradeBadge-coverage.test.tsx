/**
 * GradeBadge Coverage Tests
 *
 * Comprehensive tests for GradeBadge component and getGradeColor utility
 * targeting all uncovered branches, functions, and statements.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GradeBadge, getGradeColor } from './GradeBadge'
import type { EvaluationGrade } from '@/lib/policy-evaluation/types'

describe('GradeBadge', () => {
  const grades: EvaluationGrade[] = ['A', 'B', 'C', 'D', 'F']

  describe('renders all grades correctly', () => {
    it.each(grades)('renders grade %s', (grade) => {
      render(<GradeBadge grade={grade} />)
      expect(screen.getByRole('status')).toHaveTextContent(grade)
    })
  })

  describe('aria-label', () => {
    it.each(grades)('has correct aria-label for grade %s', (grade) => {
      render(<GradeBadge grade={grade} />)
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', `Grade ${grade}`)
    })
  })

  describe('showLabel prop', () => {
    it('shows just the letter when showLabel is false (default)', () => {
      render(<GradeBadge grade="A" />)
      expect(screen.getByRole('status')).toHaveTextContent('A')
      expect(screen.getByRole('status')).not.toHaveTextContent('Grade A')
    })

    it('shows "Grade X" when showLabel is true', () => {
      render(<GradeBadge grade="A" showLabel={true} />)
      expect(screen.getByRole('status')).toHaveTextContent('Grade A')
    })

    it.each(grades)('shows "Grade %s" when showLabel is true', (grade) => {
      render(<GradeBadge grade={grade} showLabel={true} />)
      expect(screen.getByRole('status')).toHaveTextContent(`Grade ${grade}`)
    })

    it('explicitly sets showLabel to false', () => {
      render(<GradeBadge grade="B" showLabel={false} />)
      expect(screen.getByRole('status').textContent).toBe('B')
    })
  })

  describe('size prop', () => {
    it('applies md size by default', () => {
      render(<GradeBadge grade="A" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('text-sm')
    })

    it('applies sm size', () => {
      render(<GradeBadge grade="A" size="sm" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('text-xs')
    })

    it('applies lg size', () => {
      render(<GradeBadge grade="A" size="lg" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('text-base')
    })
  })

  describe('grade color styling', () => {
    it('applies emerald styles for grade A', () => {
      render(<GradeBadge grade="A" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('bg-emerald-100')
      expect(el.className).toContain('text-emerald-800')
    })

    it('applies blue styles for grade B', () => {
      render(<GradeBadge grade="B" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('bg-blue-100')
      expect(el.className).toContain('text-blue-800')
    })

    it('applies amber styles for grade C', () => {
      render(<GradeBadge grade="C" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('bg-amber-100')
      expect(el.className).toContain('text-amber-800')
    })

    it('applies orange styles for grade D', () => {
      render(<GradeBadge grade="D" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('bg-orange-100')
      expect(el.className).toContain('text-orange-800')
    })

    it('applies red styles for grade F', () => {
      render(<GradeBadge grade="F" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('bg-red-100')
      expect(el.className).toContain('text-red-800')
    })
  })

  describe('className prop', () => {
    it('applies custom className', () => {
      render(<GradeBadge grade="A" className="my-custom-class" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('my-custom-class')
    })

    it('works without custom className', () => {
      render(<GradeBadge grade="A" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('inline-flex')
    })
  })

  describe('base styling', () => {
    it('always includes base classes', () => {
      render(<GradeBadge grade="A" />)
      const el = screen.getByRole('status')
      expect(el.className).toContain('inline-flex')
      expect(el.className).toContain('items-center')
      expect(el.className).toContain('justify-center')
      expect(el.className).toContain('font-bold')
      expect(el.className).toContain('rounded')
      expect(el.className).toContain('border')
    })
  })
})

describe('getGradeColor', () => {
  it('returns emerald for grade A', () => {
    expect(getGradeColor('A')).toBe('emerald')
  })

  it('returns blue for grade B', () => {
    expect(getGradeColor('B')).toBe('blue')
  })

  it('returns amber for grade C', () => {
    expect(getGradeColor('C')).toBe('amber')
  })

  it('returns orange for grade D', () => {
    expect(getGradeColor('D')).toBe('orange')
  })

  it('returns red for grade F', () => {
    expect(getGradeColor('F')).toBe('red')
  })
})
