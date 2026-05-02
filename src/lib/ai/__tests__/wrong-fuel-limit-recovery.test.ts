/**
 * Sprint 3 PR-S3.1 — regression tests for recoverWrongFuelLimit().
 *
 * Round-4 reviewer flagged Anadolu's "Hatalı Akaryakıt" coverage rendering
 * as "Wrong Fuel — Included" with no number, despite the policy text
 * specifying 50,000 TL annual cap on page 10. Recovery scans the
 * description/clause/quote evidence fields for a 50K phrasing and sets
 * the limit when found.
 */
import { describe, it, expect } from 'vitest'
import { recoverWrongFuelLimit } from '../policy-converter'

describe('recoverWrongFuelLimit (PR-S3.1)', () => {
  it('recovers 50000 from "Hatalı Akaryakıt" + "50.000" in description', () => {
    expect(
      recoverWrongFuelLimit(
        'Wrong Fuel',
        'Hatalı Akaryakıt',
        'Yıllık 50.000 TL ile sınırlı',
        null,
        null,
        0
      )
    ).toBe(50000)
  })

  it('recovers 50000 from "50,000" comma format', () => {
    expect(
      recoverWrongFuelLimit('Wrong Fuel', 'Hatalı Akaryakıt', 'Annual cap of 50,000 TL', null, null, 0)
    ).toBe(50000)
  })

  it('recovers 50000 from bare "50000" no separator', () => {
    expect(
      recoverWrongFuelLimit(
        'Wrong Fuel',
        'Hatalı Akaryakıt',
        'Limit: 50000 TL annually',
        null,
        null,
        0
      )
    ).toBe(50000)
  })

  it('recovers 50000 from Turkish "50 bin" phrasing', () => {
    expect(
      recoverWrongFuelLimit(
        'Hatalı Akaryakıt',
        'Hatalı Akaryakıt',
        'Yıllık 50 bin TL ile sınırlı',
        null,
        null,
        0
      )
    ).toBe(50000)
  })

  it('recovers from clause field when description is empty', () => {
    expect(
      recoverWrongFuelLimit(
        'Wrong Fuel',
        'Hatalı Akaryakıt',
        null,
        '50.000 TL üst sınır',
        null,
        0
      )
    ).toBe(50000)
  })

  it('recovers from quote field when other fields are empty', () => {
    expect(
      recoverWrongFuelLimit(
        'Hatalı Akaryakıt Klozu',
        'Hatalı Akaryakıt Klozu',
        null,
        null,
        'Hatalı akaryakıt nedeniyle oluşacak hasarlar yıllık 50.000 TL ile sınırlıdır',
        0
      )
    ).toBe(50000)
  })

  it('returns null when name does NOT match wrong-fuel pattern', () => {
    expect(
      recoverWrongFuelLimit(
        'Theft Coverage',
        'Hırsızlık Teminatı',
        'Yıllık 50.000 TL ile sınırlı',
        null,
        null,
        0
      )
    ).toBeNull()
  })

  it('returns null when wrong-fuel name matches but no 50K text anywhere', () => {
    expect(
      recoverWrongFuelLimit(
        'Wrong Fuel',
        'Hatalı Akaryakıt',
        'Coverage details unspecified',
        null,
        null,
        0
      )
    ).toBeNull()
  })

  it('returns null when limit is already set (defers to LLM)', () => {
    expect(
      recoverWrongFuelLimit(
        'Wrong Fuel',
        'Hatalı Akaryakıt',
        'Yıllık 50.000 TL',
        null,
        null,
        75000 // already set, do not override
      )
    ).toBeNull()
  })

  it('matches "misfuel" English variant', () => {
    expect(
      recoverWrongFuelLimit(
        'Misfuel Coverage',
        'Hatalı Akaryakıt',
        '50.000 TL annual',
        null,
        null,
        0
      )
    ).toBe(50000)
  })

  it('does NOT false-positive on a 50K cap belonging to a different coverage', () => {
    // The 50K text is in description but the coverage is something else.
    expect(
      recoverWrongFuelLimit(
        'Personal Accident',
        'Ferdi Kaza',
        'Sub-limit 50.000 TL on certain medical scenarios',
        null,
        null,
        0
      )
    ).toBeNull()
  })
})
