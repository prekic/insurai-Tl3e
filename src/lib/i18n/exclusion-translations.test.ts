import { describe, it, expect } from 'vitest'
import {
  translateExclusionToEn,
  ensureExclusionsEn,
  EXCLUSION_TR_TO_EN,
} from './exclusion-translations'

describe('translateExclusionToEn', () => {
  it('translates key-in-ignition theft exclusion', () => {
    const result = translateExclusionToEn(
      'Anahtarla çalışan araçlarda, anahtarın kontak üzerinde veya araç içerisinde bırakıldığı sırada gerçekleşen araç çalınmaları teminat kapsamı dışındadır.'
    )
    expect(result).toBeTruthy()
    expect(result).toContain('keys left in the ignition')
  })

  it('translates alcohol exclusion', () => {
    const result = translateExclusionToEn('Alkollü araç kullanımı sonucu meydana gelen hasarlar')
    expect(result).toContain('alcohol')
  })

  it('translates earthquake exclusion', () => {
    const result = translateExclusionToEn('Deprem hasarları teminat kapsamında değildir')
    expect(result).toContain('Earthquake')
  })

  it('translates war exclusion', () => {
    const result = translateExclusionToEn('Savaş ve iç savaş sonucu oluşan hasarlar')
    expect(result).toContain('war')
  })

  it('translates unauthorized driver exclusion', () => {
    const result = translateExclusionToEn('Yetkisiz sürücü tarafından kullanım')
    expect(result).toContain('unauthorized driver')
  })

  it('translates racing exclusion', () => {
    const result = translateExclusionToEn('Yarış ve hız denemelerinde meydana gelen zararlar')
    expect(result).toContain('racing')
  })

  it('translates valet exclusion', () => {
    const result = translateExclusionToEn('Vale park sırasında oluşan hasarlar')
    expect(result).toContain('valet')
  })

  it('translates cyber exclusion', () => {
    const result = translateExclusionToEn('Siber saldırı kaynaklı hasarlar')
    expect(result).toContain('Cyber')
  })

  it('returns null for unrecognized text', () => {
    const result = translateExclusionToEn('This is random English text with no Turkish patterns')
    expect(result).toBeNull()
  })

  it('is case-insensitive', () => {
    const result = translateExclusionToEn('ALKOLLÜ ARAÇ KULLANIMI')
    expect(result).toContain('alcohol')
  })
})

describe('ensureExclusionsEn', () => {
  it('fills in missing English translations from pattern map', () => {
    const exclusions = ['Deprem hasarları hariçtir', 'Alkollü araç kullanımı kapsam dışıdır']
    const result = ensureExclusionsEn(exclusions)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('Earthquake')
    expect(result[1]).toContain('alcohol')
  })

  it('preserves existing English translations', () => {
    const exclusions = ['Deprem hasarları hariçtir']
    const exclusionsEn = ['Earthquake damage is excluded from policy coverage']
    const result = ensureExclusionsEn(exclusions, exclusionsEn)
    expect(result[0]).toBe('Earthquake damage is excluded from policy coverage')
  })

  it('fills gaps in partial exclusionsEn array', () => {
    const exclusions = ['Alkol kullanımı', 'Deprem hasarları', 'Savaş ve terör']
    const exclusionsEn = ['Alcohol use'] // Only first one present
    const result = ensureExclusionsEn(exclusions, exclusionsEn)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('Alcohol use') // preserved
    expect(result[1]).toContain('Earthquake') // filled from pattern
    expect(result[2]).toContain('war') // filled from pattern
  })

  it('falls back to Turkish text when no pattern matches', () => {
    const exclusions = ['Çok özel bir durum açıklaması']
    const result = ensureExclusionsEn(exclusions)
    expect(result[0]).toBe('Çok özel bir durum açıklaması')
  })

  it('handles null exclusionsEn', () => {
    const exclusions = ['Deprem hasarları']
    const result = ensureExclusionsEn(exclusions, null)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Earthquake')
  })

  it('handles empty exclusions', () => {
    const result = ensureExclusionsEn([])
    expect(result).toEqual([])
  })

  it('trims oversized exclusionsEn to match exclusions length', () => {
    const exclusions = ['Deprem hasarları']
    const exclusionsEn = ['Earthquake', 'Extra entry that should be trimmed']
    const result = ensureExclusionsEn(exclusions, exclusionsEn)
    expect(result).toHaveLength(1)
  })

  it('does not replace non-empty exclusionsEn entries', () => {
    const exclusions = ['Deprem hasarları']
    const exclusionsEn = ['My custom translation']
    const result = ensureExclusionsEn(exclusions, exclusionsEn)
    expect(result[0]).toBe('My custom translation')
  })
})

describe('EXCLUSION_TR_TO_EN patterns', () => {
  it('has at least 50 patterns', () => {
    expect(EXCLUSION_TR_TO_EN.length).toBeGreaterThanOrEqual(50)
  })

  it('all patterns have non-empty en translations', () => {
    for (const { pattern, en } of EXCLUSION_TR_TO_EN) {
      expect(pattern.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
    }
  })

  it('all patterns are lowercase', () => {
    for (const { pattern } of EXCLUSION_TR_TO_EN) {
      expect(pattern).toBe(pattern.toLowerCase())
    }
  })
})
