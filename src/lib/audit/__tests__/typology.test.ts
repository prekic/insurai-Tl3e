/**
 * Phase 3 — typology hash tests.
 *
 * Verifies hash stability across capitalisation/suffix variants of the
 * insurer name and bucket boundaries. Pure-function tests; no I/O.
 */
import { describe, it, expect } from 'vitest'
import {
  computeTypologyHash,
  computeTypologyHashFromPolicy,
  normaliseInsurer,
  parseYearBucket,
} from '../typology'

describe('normaliseInsurer', () => {
  it('strips Sigorta / A.Ş. / Ltd. suffixes and lowercases', () => {
    expect(normaliseInsurer('Anadolu Sigorta')).toBe('anadolu')
    expect(normaliseInsurer('Anadolu Sigorta A.Ş.')).toBe('anadolu')
    expect(normaliseInsurer('AXA SIGORTA A.Ş.')).toBe('axa')
    expect(normaliseInsurer('Allianz Sigorta Ltd. Şti.')).toBe('allianz')
  })

  it('handles empty / null-ish input gracefully', () => {
    expect(normaliseInsurer('')).toBe('')
    // @ts-expect-error testing runtime null
    expect(normaliseInsurer(null)).toBe('')
    // @ts-expect-error testing runtime undefined
    expect(normaliseInsurer(undefined)).toBe('')
  })

  it('Turkish İ → i case-fold (gotcha #62)', () => {
    expect(normaliseInsurer('İSTANBUL Sigorta')).toBe('istanbul')
  })

  it('collapses internal whitespace', () => {
    expect(normaliseInsurer('Türkiye  Sigorta   A.Ş.')).toBe('türkiye')
  })
})

describe('parseYearBucket', () => {
  it('rounds down to even-year boundary', () => {
    expect(parseYearBucket('01.01.2024')).toBe(2024)
    expect(parseYearBucket('15.06.2025')).toBe(2024)
    expect(parseYearBucket('01.01.2026')).toBe(2026)
    expect(parseYearBucket('31.12.2027')).toBe(2026)
  })

  it('returns null for unparseable inputs', () => {
    expect(parseYearBucket(null)).toBeNull()
    expect(parseYearBucket(undefined)).toBeNull()
    expect(parseYearBucket('')).toBeNull()
    expect(parseYearBucket('not a date')).toBeNull()
  })

  it('accepts ISO format', () => {
    expect(parseYearBucket('2024-06-15')).toBe(2024)
  })

  it('rejects out-of-range years', () => {
    expect(parseYearBucket('01.01.1899')).toBeNull()
    expect(parseYearBucket('01.01.2300')).toBeNull()
  })
})

describe('computeTypologyHash', () => {
  it('produces a 64-char lowercase hex string', () => {
    const hash = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'Anadolu Sigorta',
    })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable across insurer capitalisation variants', () => {
    const hash1 = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'Anadolu Sigorta',
    })
    const hash2 = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'ANADOLU SİGORTA A.Ş.',
    })
    const hash3 = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'anadolu',
    })
    expect(hash1).toBe(hash2)
    expect(hash1).toBe(hash3)
  })

  it('differs across distinct typologies', () => {
    const hashA = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'Anadolu',
    })
    const hashB = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2026,
      insurer: 'Anadolu',
    })
    const hashC = computeTypologyHash({
      insuranceLine: 'traffic',
      yearBucket: 2024,
      insurer: 'Anadolu',
    })
    const hashD = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'AXA',
    })
    expect(new Set([hashA, hashB, hashC, hashD]).size).toBe(4)
  })

  it("defaults country to 'TR' when omitted", () => {
    const implicit = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'Anadolu',
    })
    const explicit = computeTypologyHash({
      insuranceLine: 'kasko',
      country: 'TR',
      yearBucket: 2024,
      insurer: 'Anadolu',
    })
    expect(implicit).toBe(explicit)
  })
})

describe('computeTypologyHashFromPolicy', () => {
  it('returns null when start date is unparseable', () => {
    const result = computeTypologyHashFromPolicy({
      insuranceLine: 'kasko',
      startDate: 'not a date',
      insurer: 'Anadolu',
    })
    expect(result).toBeNull()
  })

  it('returns hash + dimensions on success', () => {
    const result = computeTypologyHashFromPolicy({
      insuranceLine: 'kasko',
      startDate: '15.06.2025',
      insurer: 'Anadolu Sigorta A.Ş.',
    })
    expect(result).not.toBeNull()
    expect(result!.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(result!.dimensions).toEqual({
      insuranceLine: 'kasko',
      country: 'TR',
      yearBucket: 2024,
      insurer: 'Anadolu Sigorta A.Ş.',
      insurerNormalised: 'anadolu',
    })
  })

  it('hash matches direct computeTypologyHash with the same dimensions', () => {
    const direct = computeTypologyHash({
      insuranceLine: 'kasko',
      yearBucket: 2024,
      insurer: 'Anadolu Sigorta',
    })
    const fromPolicy = computeTypologyHashFromPolicy({
      insuranceLine: 'kasko',
      startDate: '01.01.2024',
      insurer: 'Anadolu Sigorta',
    })
    expect(fromPolicy!.hash).toBe(direct)
  })
})
