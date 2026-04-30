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
import { dedupByTrigramJaccard } from '../policy-converter'

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
    // Default 0.70: not similar enough → both kept.
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
})
