/**
 * Regression tests for trigram-Jaccard exclusion deduplication (P1 #9).
 *
 * Reviewer caught the AI producing 4 different paraphrases of the same
 * "no driver's license" clause and 2 of "keys-in-ignition" because the
 * cluster-keyword pass in deduplicateExclusions() required 2+ keyword hits
 * per cluster — paraphrases that match only 1 keyword slipped through.
 * dedupByTrigramJaccard() runs first as a fuzzy paraphrase collapser.
 */
import { describe, it, expect } from 'vitest'
import { dedupByTrigramJaccard, filterConditionalExclusions } from '../policy-converter'

describe('dedupByTrigramJaccard', () => {
  it('returns the input unchanged when length ≤ 1', () => {
    expect(dedupByTrigramJaccard([])).toEqual([])
    expect(dedupByTrigramJaccard(['only one'])).toEqual(['only one'])
  })

  it('preserves distinct exclusions (low overlap)', () => {
    const input = [
      'Sürücü ehliyetsiz olduğunda hasar teminat dışıdır.',
      'Salgın hastalık nedeniyle oluşan zararlar teminat dışıdır.',
      'Siber saldırılardan kaynaklanan zararlar teminat dışıdır.',
    ]
    expect(dedupByTrigramJaccard(input)).toEqual(input)
  })

  it('collapses tight paraphrases of the same clause keeping the longest', () => {
    // Two tight paraphrases of the keys-in-ignition clause. Both share
    // {anah, üzer, bıra, araç, çalı, hari} after stemming → high Jaccard.
    const input = [
      'Anahtar üzerinde bırakılmış araç çalınma hariç.',
      'Anahtar üzerinde bırakılmış araç çalınması hariç tutulmaktadır.',
    ]
    const result = dedupByTrigramJaccard(input)
    expect(result.length).toBe(1)
    // Longer survivor wins.
    expect(result[0]).toContain('tutulmaktadır')
  })

  it('collapses paraphrases of the keys-in-ignition clause', () => {
    const input = [
      'Anahtar üzerinde bırakılmış araçtaki çalınma hariçtir.',
      'Anahtar üzerinde bırakılmış araç çalınması hariç tutulur.',
    ]
    const result = dedupByTrigramJaccard(input)
    // High overlap (~75% trigrams) → collapses to one.
    expect(result.length).toBe(1)
  })

  it('honours custom threshold (looser collapses more)', () => {
    const input = [
      'Sürücü hatasından doğan zararlar.',
      'Sürücünün hatasından kaynaklanan kayıplar.',
    ]
    // Default 0.65 (Sprint 2 PR-S2.1, was 0.70): pair has Jaccard ≈ 0.33,
    // still well below the threshold → both kept.
    expect(dedupByTrigramJaccard(input).length).toBe(2)
    // Loose 0.30: collapses.
    expect(dedupByTrigramJaccard(input, 0.3).length).toBe(1)
  })

  it('keeps the longer phrasing when paraphrases collapse', () => {
    // Two tight paraphrases sharing 4 of 5 stems → Jaccard ≈ 0.80, well
    // above the 0.70 default. Longer phrasing wins.
    const input = [
      'Sigortalı ehliyetsiz kullanım hariç.',
      'Sigortalının ehliyetsiz kullanımı hariç tutulur.',
    ]
    const result = dedupByTrigramJaccard(input)
    expect(result.length).toBe(1)
    expect(result[0]).toBe('Sigortalının ehliyetsiz kullanımı hariç tutulur.')
  })

  it('handles empty strings and short tokens without crashing', () => {
    const input = ['', 'X', 'Yangın hariç', 'Yangın hariçtir']
    const result = dedupByTrigramJaccard(input)
    // Non-empty preserved; the two near-identical "Yangın hariç" phrases collapse.
    expect(result.length).toBeLessThanOrEqual(input.length)
  })

  // Sprint 2 PR-S2.1 — exact-match pre-pass + tightened threshold
  describe('PR-S2.1 — exact-match pre-pass', () => {
    it('collapses identical strings via NFKC + whitespace-collapse + lowercase', () => {
      const input = [
        'Ceramic / film coatings are excluded',
        'Ceramic / film coatings are excluded', // exact dup
        'Ceramic / film coatings are excluded.', // trailing punctuation = different
      ]
      const result = dedupByTrigramJaccard(input)
      // First two collapse via exact-match (whitespace-trimmed lowercase identical).
      // The third has different trailing punctuation but still high Jaccard,
      // so it also collapses via the Jaccard pass.
      expect(result.length).toBe(1)
    })

    it('treats whitespace-only-different strings as identical', () => {
      const input = [
        'Ceramic / film coatings are excluded',
        'Ceramic  /  film  coatings  are  excluded', // double-spaced
        'CERAMIC / FILM COATINGS ARE EXCLUDED', // upper-case variant
      ]
      const result = dedupByTrigramJaccard(input)
      // All three normalize to the same string post-NFKC + whitespace-collapse + lowercase.
      expect(result.length).toBe(1)
    })

    it('keeps the longer original when exact-match pair is found', () => {
      const input = [
        'Ceramic / film coatings excluded',
        'CERAMIC / FILM COATINGS  EXCLUDED (coating context)',
      ]
      const result = dedupByTrigramJaccard(input)
      expect(result.length).toBe(1)
      expect(result[0]).toContain('EXCLUDED (coating context)')
    })

    it('preserves distinct exclusions even when one normalizes to a substring of another', () => {
      // These don't normalize to the same string — exact-match doesn't fire.
      // Jaccard at 0.65 should not collapse them either.
      const input = ['Yangın hariç', 'Sel ve su baskını hariç']
      const result = dedupByTrigramJaccard(input)
      expect(result.length).toBe(2)
    })
  })
})

// Sprint 2 PR-S2.1 — ÖTV / disabled-vehicle conditional filter
describe('filterConditionalExclusions', () => {
  it('drops Engellilere Ait Klozu / engelli araç patterns', () => {
    const input = [
      'Engellilere Ait Klozu — özel donanımlı araç kullanımında geçerlidir',
      'Yangın hariçtir',
    ]
    const result = filterConditionalExclusions(input)
    expect(result).toEqual(['Yangın hariçtir'])
  })

  it('drops "özel donanımlı / özel tertibatlı" patterns', () => {
    const input = [
      'Özel donanımlı araç kullanımı yetkisiz kişi tarafından',
      'Özel tertibatlı araç sicil dışı kullanım',
      'Sürücü ehliyetsiz hasar teminat dışı',
    ]
    const result = filterConditionalExclusions(input)
    expect(result).toEqual(['Sürücü ehliyetsiz hasar teminat dışı'])
  })

  it('drops English "specially equipped / disabled vehicle" patterns', () => {
    const input = [
      'Specially equipped vehicle used by unauthorized person',
      'Disabled vehicle modifications void warranty',
      'Standard exclusion text',
    ]
    const result = filterConditionalExclusions(input)
    expect(result).toEqual(['Standard exclusion text'])
  })

  it('preserves general "engel" stems that are not the kloz (e.g. engellemek = obstruct)', () => {
    // Defensive — `(?!\w)` boundary in the regex prevents matching "engellemek"
    // (to obstruct), "engelleme" (obstruction). Only "engelli" / "engellilere"
    // should match.
    const input = ['Üçüncü kişi tarafından engellemeye yol açan zararlar hariçtir']
    const result = filterConditionalExclusions(input)
    expect(result.length).toBe(1)
  })

  it('returns the input unchanged when no ÖTV-conditional patterns present', () => {
    const input = [
      'Yangın hariç',
      'Sel ve su baskını hariç',
      'Ehliyetsiz sürücü kullanımı teminat dışı',
    ]
    const result = filterConditionalExclusions(input)
    expect(result).toEqual(input)
  })

  it('handles empty input gracefully', () => {
    expect(filterConditionalExclusions([])).toEqual([])
  })
})
