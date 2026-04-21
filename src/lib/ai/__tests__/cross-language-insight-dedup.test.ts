/**
 * Cross-language insight dedup verification.
 *
 * Validates the bidirectional EN<->TR translation helpers used by the
 * source-level dedup loop in convertToAnalyzedPolicy. The dedup itself
 * is internal, but if both helpers correctly map an EN-TR pair to the
 * same canonical key, the dedup is guaranteed to collapse them.
 */
import { describe, it, expect } from 'vitest'
import { translateInsightToTr, translateInsightToEn } from '../insight-translator'

describe('cross-language insight translation helpers', () => {
  // A pair known to exist in TR_TRANSLATIONS.insightTranslations
  const enInsight = 'Comprehensive coverage with multiple protection areas'
  const trInsight = 'Birçok koruma alanıyla kapsamlı teminat'

  it('translates a known EN insight to its TR equivalent', () => {
    expect(translateInsightToTr(enInsight)).toBe(trInsight)
  })

  it('reverse-translates a known TR insight back to EN', () => {
    expect(translateInsightToEn(trInsight)).toBe(enInsight)
  })

  it('preserves emoji prefix when translating EN→TR', () => {
    expect(translateInsightToTr(`✓ ${enInsight}`)).toBe(`✓ ${trInsight}`)
  })

  it('preserves emoji prefix when translating TR→EN', () => {
    expect(translateInsightToEn(`✓ ${trInsight}`)).toBe(`✓ ${enInsight}`)
  })

  it('returns the input unchanged when no translation exists', () => {
    const unknown = 'A completely novel insight not in the translation map'
    expect(translateInsightToTr(unknown)).toBe(unknown)
    expect(translateInsightToEn(unknown)).toBe(unknown)
  })

  it('produces matching canonical keys for an EN/TR insight pair', () => {
    // This is the exact normalization the dedup loop uses
    const stripAndNormalize = (s: string) =>
      s
        // eslint-disable-next-line no-misleading-character-class
        .replace(/^[✓✔☑⚠💡❌🔍\uFE0F]\s*/gu, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')

    const canonicalize = (raw: string): string => {
      const baseNorm = stripAndNormalize(raw)
      const trVariant = stripAndNormalize(translateInsightToTr(raw))
      const enVariant = stripAndNormalize(translateInsightToEn(raw))
      return [baseNorm, trVariant, enVariant].filter((s) => s.length > 0).sort()[0] || baseNorm
    }

    // The EN-emoji and TR-emoji forms must reduce to the same canonical key
    const canonEn = canonicalize(`✓ ${enInsight}`)
    const canonTr = canonicalize(`✓ ${trInsight}`)
    expect(canonEn).toBe(canonTr)
  })
})
