/**
 * Regression tests for Sprint 2 P1 #11B — Ask Your Insurer answer pre-fill.
 *
 * Reviewer caught the panel showing "Not specified in policy" for every
 * template question even when the policy clearly addressed them. Example:
 * the Anadolu Birleşik Kasko fixture has a Kullanım Şekli klozu (80%
 * deductible on rideshare/rental/test drive) that answers the "Commercial
 * Use" template question, but the matcher missed it because the keyword
 * derivation was just `name.toLowerCase().split(/[\s/]+/)`.
 *
 * The fix:
 *   1. Each COMMON_EXCLUSIONS_TO_CHECK entry now carries an explicit
 *      `keywords` array
 *   2. analyzeExclusionsComprehensive() scans 3 sources: exclusions,
 *      conditionalDeductibles, coverageCarveOuts
 *   3. When a keyword hits, the verbatim source string lands in
 *      `addressedByPolicy[]` with the matched answer; otherwise it falls
 *      through to `missingImportantExclusions[]` as before.
 */
import { describe, it, expect } from 'vitest'
import { analyzeExclusionsComprehensive } from './kasko-knowledge'

describe('analyzeExclusionsComprehensive — addressedByPolicy (P1 #11B)', () => {
  it('returns empty addressedByPolicy when nothing matches', () => {
    const result = analyzeExclusionsComprehensive([], [], false)
    expect(result.addressedByPolicy).toEqual([])
    expect(result.missingImportantExclusions.length).toBeGreaterThan(0)
  })

  it('matches "Commercial Use" question against a Kullanım Şekli conditional deductible', () => {
    // The Anadolu Birleşik Kasko regression case: the Kullanım Şekli klozu
    // (rideshare/rental/test-drive 80% deductible) is in
    // conditionalDeductibles, NOT exclusions.
    const result = analyzeExclusionsComprehensive(
      [], // exclusions
      [], // exclusionsEn
      false, // private vehicle
      ['Kullanım Şekli: %80'], // conditionalDeductibles
      [] // coverageCarveOuts
    )
    const commercial = result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')
    expect(commercial).toBeDefined()
    expect(commercial!.answer).toBe('Kullanım Şekli: %80')
    expect(commercial!.importance).toBe('high')
    // Should NOT also appear in missingImportantExclusions
    expect(
      result.missingImportantExclusions.find((m) => m.nameEn === 'Commercial Use')
    ).toBeUndefined()
  })

  it('matches "Valet Theft/Damage" via the vale keyword in exclusions', () => {
    const result = analyzeExclusionsComprehensive(
      ['Vale park hizmeti sırasında anahtarın ele geçirilmesi sonucu çalınma hariç.'],
      [],
      false
    )
    const valet = result.addressedByPolicy.find((a) => a.nameEn === 'Valet Theft/Damage')
    expect(valet).toBeDefined()
    expect(valet!.answer).toContain('Vale')
  })

  it('matches via flattened coverage carveOuts', () => {
    // E.g. an IMM Sınırsız carveOut that mentions commercial-use restriction.
    const result = analyzeExclusionsComprehensive(
      [],
      [],
      false,
      [],
      ['Subject to ticari kullanım restriction at airports']
    )
    const commercial = result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')
    expect(commercial).toBeDefined()
    expect(commercial!.answer).toContain('ticari')
  })

  it('falls through to missingImportantExclusions for templates with no match', () => {
    const result = analyzeExclusionsComprehensive(
      ['Some unrelated exclusion text here.'],
      [],
      false
    )
    expect(result.addressedByPolicy.length).toBe(0)
    // All applicable templates land in missing instead.
    expect(result.missingImportantExclusions.length).toBeGreaterThan(0)
  })

  it('respects Kullanım Tarzı filter (commercial vehicles skip Vale + Ticari)', () => {
    const result = analyzeExclusionsComprehensive([], [], true) // commercial
    // Commercial Use template has affectsCommercial: false → it should NOT
    // appear in either bucket on a commercial vehicle.
    expect(result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')).toBeUndefined()
    expect(
      result.missingImportantExclusions.find((m) => m.nameEn === 'Commercial Use')
    ).toBeUndefined()
  })

  it('a policy can match multiple templates simultaneously', () => {
    const result = analyzeExclusionsComprehensive(
      ['Alkol limiti %0.5 promil olarak belirlenmiştir.'],
      [],
      false,
      ['Kullanım Şekli: %80', 'Sürücü yaşı 25 altı: %20']
    )
    const matched = result.addressedByPolicy.map((a) => a.nameEn)
    expect(matched).toContain('Alcohol Limit')
    expect(matched).toContain('Commercial Use')
    expect(matched).toContain('Additional Drivers')
  })
})
