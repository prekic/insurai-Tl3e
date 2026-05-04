import { describe, expect, it } from 'vitest'
import { parseTurkishNumber, OutOfMagnitudeError } from '../../../src/lib/ai/turkish-utils'

describe('parseTurkishNumber', () => {
  it('parses Turkish number formats correctly', () => {
    expect(parseTurkishNumber('1.234,56')).toBe(1234.56)
    expect(parseTurkishNumber('1.234.567,89')).toBe(1234567.89)
    expect(parseTurkishNumber('123,45')).toBe(123.45)
  })

  it('parses International number formats correctly', () => {
    expect(parseTurkishNumber('1,234.56')).toBe(1234.56)
    expect(parseTurkishNumber('1,234,567.89')).toBe(1234567.89)
    expect(parseTurkishNumber('123.45')).toBe(123.45)
  })

  it('handles negative numbers', () => {
    expect(parseTurkishNumber('-1.234,56')).toBe(-1234.56)
    expect(parseTurkishNumber('-1,234.56')).toBe(-1234.56)
  })

  describe('Magnitude Validation', () => {
    it('returns parsed number if within bounds', () => {
      expect(parseTurkishNumber('1.000,00', { min: 0, max: 2000 })).toBe(1000)
    })

    it('returns null when value violates minimum bound and throwOnViolation is false', () => {
      expect(parseTurkishNumber('1.000,00', { min: 2000, throwOnViolation: false })).toBeNull()
      expect(parseTurkishNumber('1.000,00', { min: 2000 })).toBeNull()
    })

    it('returns null when value violates maximum bound and throwOnViolation is false', () => {
      expect(parseTurkishNumber('5.000,00', { max: 2000, throwOnViolation: false })).toBeNull()
      expect(parseTurkishNumber('5.000,00', { max: 2000 })).toBeNull()
    })

    it('throws OutOfMagnitudeError when value violates minimum bound and throwOnViolation is true', () => {
      expect(() => parseTurkishNumber('1.000,00', { min: 2000, throwOnViolation: true })).toThrow(
        OutOfMagnitudeError
      )
      expect(() => parseTurkishNumber('1.000,00', { min: 2000, throwOnViolation: true })).toThrow(
        /Value 1000 is below minimum 2000/
      )
    })

    it('throws OutOfMagnitudeError when value violates maximum bound and throwOnViolation is true', () => {
      expect(() => parseTurkishNumber('5.000,00', { max: 2000, throwOnViolation: true })).toThrow(
        OutOfMagnitudeError
      )
      expect(() => parseTurkishNumber('5.000,00', { max: 2000, throwOnViolation: true })).toThrow(
        /Value 5000 is above maximum 2000/
      )
    })
  })
})
