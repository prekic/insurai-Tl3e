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

  // Sprint 2 PR-S2.3 — Round-4 reviewer's Anadolu phrasings
  describe('PR-S2.3 — Round-4 Anadolu phrasings', () => {
    it('matches Valet template via "otopark" / "servis/tamirhane" / "oto yıkama"', () => {
      // Verbatim from Anadolu page 9 item (c) — vale parking covered
      // conditionally if both parties acknowledge in writing.
      const result = analyzeExclusionsComprehensive(
        [
          'Otopark, servis/tamirhane, oto yıkama vb. yerlerde her iki tarafın yazılı kabulü ile vale çalınma teminat altındadır.',
        ],
        [],
        false
      )
      const valet = result.addressedByPolicy.find((a) => a.nameEn === 'Valet Theft/Damage')
      expect(valet).toBeDefined()
      expect(valet!.answer).toContain('otopark')
    })

    it('matches Additional Drivers template via "bordrolu / kiralama isimli"', () => {
      // Anadolu page 13 — rental-named companies restrict drivers to
      // family + bordrolu (payroll) personnel.
      const result = analyzeExclusionsComprehensive(
        [
          'Kiralama isimli şirketler için aile bireyi ve bordrolu personel dışındaki sürücülerde teminat geçersizdir.',
        ],
        [],
        false
      )
      const drivers = result.addressedByPolicy.find((a) => a.nameEn === 'Additional Drivers')
      expect(drivers).toBeDefined()
      expect(drivers!.answer).toContain('bordrolu')
    })

    it('matches Commercial Use template via canonical "Rent-a-car / ticari kullanım: %80" label', () => {
      // After PR-S1.2, classifyExclusions emits this exact canonical label.
      // The matcher should recognize it as addressing the Commercial Use
      // question.
      const result = analyzeExclusionsComprehensive(
        [],
        [],
        false,
        ['Rent-a-car / ticari kullanım: %80']
      )
      const commercial = result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')
      expect(commercial).toBeDefined()
      expect(commercial!.answer).toBe('Rent-a-car / ticari kullanım: %80')
    })

    it('matches Commercial Use template via "kiralık araç / ikame araç / test sürüşü"', () => {
      // Verbatim Anadolu Kullanım Şekli kloz phrasings.
      const result = analyzeExclusionsComprehensive(
        [
          'Aracın kiralık araç, ikame araç ya da test sürüşü aracı olarak kullanılması durumunda %80 muafiyet uygulanır.',
        ],
        [],
        false
      )
      const commercial = result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')
      expect(commercial).toBeDefined()
      expect(commercial!.answer).toContain('kiralık araç')
    })

    it('matches Commercial Use via "dolmuş / kargo" — additional Anadolu kloz scenarios', () => {
      const result = analyzeExclusionsComprehensive(
        ['Aracın taksi/dolmuş veya kargo amaçlı kullanımı %80 muafiyete tabidir.'],
        [],
        false
      )
      const commercial = result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')
      expect(commercial).toBeDefined()
    })

    it('matches Commercial Use via "mobil uygulama yolcu/yük taşımacılığı"', () => {
      const result = analyzeExclusionsComprehensive(
        [
          'Mobil uygulamalar/internet ile yolcu taşımacılığı veya yük taşımacılığı yapılması halinde teminat dışıdır.',
        ],
        [],
        false
      )
      const commercial = result.addressedByPolicy.find((a) => a.nameEn === 'Commercial Use')
      expect(commercial).toBeDefined()
    })

    it('all 3 Anadolu templates match together when policy has all 3 phrasings', () => {
      const result = analyzeExclusionsComprehensive(
        [
          'Otopark teslimleri için yazılı kabul gerekir.',
          'Bordrolu personel ve aile bireyi sürücülerde geçerlidir.',
        ],
        [],
        false,
        ['Rent-a-car / ticari kullanım: %80']
      )
      const matched = result.addressedByPolicy.map((a) => a.nameEn)
      expect(matched).toContain('Valet Theft/Damage')
      expect(matched).toContain('Additional Drivers')
      expect(matched).toContain('Commercial Use')
    })
  })
})
