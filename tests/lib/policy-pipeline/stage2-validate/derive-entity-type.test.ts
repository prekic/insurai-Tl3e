import { describe, expect, it } from 'vitest'
import { deriveEntityType } from '../../../../src/lib/policy-pipeline/stage2-validate/derive-entity-type'

describe('deriveEntityType', () => {
  it('identifies individuals by 11-digit TCKN', () => {
    expect(deriveEntityType('12345678901')).toBe('individual')
    expect(deriveEntityType(' 12345678901 ')).toBe('individual') // handles whitespace
    expect(deriveEntityType('123 456 789 01')).toBe('individual') // handles spaces inside
  })

  it('identifies corporates by 10-digit VKN', () => {
    expect(deriveEntityType('1234567890')).toBe('corporate')
    expect(deriveEntityType(' 1234567890 ')).toBe('corporate')
  })

  it('returns null for invalid lengths', () => {
    expect(deriveEntityType('123456789')).toBeNull() // 9 digits
    expect(deriveEntityType('123456789012')).toBeNull() // 12 digits
  })

  it('returns null for empty or null input', () => {
    expect(deriveEntityType(null)).toBeNull()
    expect(deriveEntityType(undefined)).toBeNull()
    expect(deriveEntityType('')).toBeNull()
  })
})
