/**
 * Sprint 1 PR-S1.4 — regression tests for detectImmCarveOut().
 *
 * Round-4 Anadolu reviewer flagged the "Artan Mali Sorumluluk Sınırsız"
 * coverage as missing its 2.5M TL industrial-site sub-limit caveat. The
 * coverage rendered "Unlimited / 0 TL user pays" without the carve-out
 * caveat because the LLM extracted the carve-out clause text into
 * policy.specialConditions[] rather than onto the coverage's own
 * clause/quote/description fields.
 *
 * This PR extended detectImmCarveOut() with an optional fallbackTexts
 * parameter so callers can supply policy-level adjacent text fields
 * (exclusions, specialConditions) as additional haystacks.
 */
import { describe, it, expect } from 'vitest'
import { detectImmCarveOut } from '../evaluator'
import type { Coverage } from '@/types/policy'

const baseUnlimitedImm: Coverage = {
  name: 'IMM Sınırsız',
  nameTr: 'İhtiyari Mali Mesuliyet Sınırsız',
  limit: 0,
  deductible: 0,
  included: true,
  isUnlimited: true,
  category: 'liability',
}

describe('detectImmCarveOut — primary haystack (existing behavior)', () => {
  it('returns null when no fields contain the carve-out pattern', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      clause: 'Standard liability clause with no special caps',
    }
    expect(detectImmCarveOut(coverage)).toBeNull()
  })

  it('returns the carveOuts[0] entry verbatim when populated', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      carveOuts: ['Subject to 2,500,000 TL cap at airports'],
    }
    const result = detectImmCarveOut(coverage)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('Carve-out:')
    expect(result!.en).toContain('2,500,000 TL cap at airports')
    expect(result!.tr).toContain('İstisna:')
  })

  it('returns the full caveat (location+amount) when both hit on the clause field', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      clause:
        'Bu klozda olay başına teminat limiti, havalimanı, liman, akaryakıt depoları gibi yerlerde 2.500.000 TL ile sınırlanmıştır.',
    }
    const result = detectImmCarveOut(coverage)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('2,500,000 TL')
    expect(result!.en).toContain('airports, ports, fuel depots')
  })

  it('returns the hedged caveat when only location hits (no amount)', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      clause: 'Havalimanı ve liman bölgelerinde özel teminat koşulları uygulanır.',
    }
    const result = detectImmCarveOut(coverage)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('verify the exact cap in the policy')
  })
})

describe('detectImmCarveOut — Sprint 1 PR-S1.4 fallback haystack', () => {
  it('matches when the carve-out text lives on policy.specialConditions[] not on the coverage', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      // No clause / quote / description — empty primary haystack
    }
    const fallback = [
      "Artan Mali Sorumluluk Sınırsız Teminatı Klozu — olay başına teminat limiti, tüm teminat türleri için toplam 2.500.000,00 TL ile sınırlanmıştır. Bu kapsam havalimanı, liman, akaryakıt depoları gibi yerlerde geçerlidir.",
    ]
    const result = detectImmCarveOut(coverage, fallback)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('2,500,000 TL')
    expect(result!.en).toContain('airports, ports, fuel depots')
  })

  it('matches when the carve-out text lives on policy.exclusions[]', () => {
    const coverage: Coverage = { ...baseUnlimitedImm }
    const fallback = [
      'Sınırsız teminat istisnası: havalimanı, liman, kimyasal depolarında 2,5 milyon TL üst sınır geçerlidir.',
    ]
    const result = detectImmCarveOut(coverage, fallback)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('2,500,000 TL')
  })

  it('combines location hit on coverage with amount hit on fallback (composite haystack)', () => {
    // Realistic LLM output — location keyword on the coverage's clause but
    // the explicit 2.500.000 amount placed in a separate special-conditions
    // entry. Should still resolve to the full caveat.
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      clause: 'Havalimanı, liman ve rafineri bölgelerinde özel hüküm uygulanır.',
    }
    const fallback = [
      'Olay başına 2.500.000 TL üst sınır uygulanır (yukarıdaki klozdaki yerler için).',
    ]
    const result = detectImmCarveOut(coverage, fallback)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('2,500,000 TL')
  })

  it('returns null when neither primary nor fallback haystacks have the pattern', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      clause: 'Standard liability with no special locations',
    }
    const fallback = ['Some unrelated exclusion text about driving violations']
    expect(detectImmCarveOut(coverage, fallback)).toBeNull()
  })

  it('handles empty/non-string entries in fallbackTexts gracefully', () => {
    const coverage: Coverage = { ...baseUnlimitedImm }
    const fallback = [
      '',
      'Havalimanı ve liman bölgelerinde 2.500.000 TL üst sınır',
      // @ts-expect-error — defensive guard against legacy fixtures with non-strings
      undefined,
      // @ts-expect-error
      null,
    ]
    const result = detectImmCarveOut(coverage, fallback as string[])
    expect(result).not.toBeNull()
    expect(result!.en).toContain('2,500,000 TL')
  })

  it('short-circuits once both hits accumulate (no error on subsequent entries)', () => {
    const coverage: Coverage = { ...baseUnlimitedImm }
    const fallback = [
      'Havalimanı, liman, akaryakıt depolarında 2.500.000 TL üst sınır',
      'unrelated text 1',
      'unrelated text 2',
    ]
    const result = detectImmCarveOut(coverage, fallback)
    expect(result).not.toBeNull()
    expect(result!.en).toContain('2,500,000 TL')
  })

  it('precedence: explicit carveOuts[] still wins over both haystacks', () => {
    const coverage: Coverage = {
      ...baseUnlimitedImm,
      carveOuts: ['Explicit operator-set caveat string'],
      clause: 'Havalimanı bölgesinde 2.500.000 TL', // would otherwise match
    }
    const fallback = ['Some other 2.500.000 TL liman blob']
    const result = detectImmCarveOut(coverage, fallback)
    expect(result).not.toBeNull()
    // Verbatim carveOuts[0] takes precedence — does NOT use the location+amount template
    expect(result!.en).toContain('Explicit operator-set caveat string')
    expect(result!.en).not.toContain('airports, ports, fuel depots')
  })
})
