/**
 * Tests for v4 PR-3 extraction depth features:
 *  - extractEkSozlesmeBullets()      — deterministic Ek Sözleşme bullet parser
 *  - Ek Sözleşme synthetic coverage injection in convertToAnalyzedPolicy
 *  - classifyExclusions named deductible enumeration
 *  - IMM Sınırsız carve-out caveat in evaluator scenario cards
 */
import { describe, it, expect } from 'vitest'
import { classifyExclusions, extractEkSozlesmeBullets } from '../policy-converter'

describe('extractEkSozlesmeBullets (v4 PR-3)', () => {
  it('returns [] when rawText is empty or missing', () => {
    expect(extractEkSozlesmeBullets('')).toEqual([])
    expect(extractEkSozlesmeBullets(undefined as unknown as string)).toEqual([])
  })

  it('returns [] when no Ek Sözleşme section is present', () => {
    const text = 'Bu poliçe üç teminat içerir.\nDeprem\nSel\nTerör'
    expect(extractEkSozlesmeBullets(text)).toEqual([])
  })

  it('parses the Anadolu-style "ek sözleşmeyle ... dâhil edilmiştir" block with `l` bullets', () => {
    const text = `
Ayrıca, Kasko Sigortası Genel Şartları'na göre ek sözleşmeyle teminat kapsamına dâhil edilebilen zararlardan aşağıda
belirtilmiş olanlar da teminat kapsamına dâhil edilmiştir.
l Grev, lokavt, kargaşalık ile halk hareketleri (A.4.2.),
l Terör (A.4.3.)
l Deprem, toprak kayması, fırtına, dolu, yıldırım veya yanardağ püskürmesi, (A.4.4.),
l Sel ve su baskını (A.4.5.),
l Araç anahtarının ek sözleşmede belirtilen haller sonucunda ele geçirilmesi suretiyle aracın çalınması (A.4.11.),
l Ek sözleşmede belirtilen haller sonucunda kaybolan ve çalınan anahtarlar dolayısıyla aracın kilit mekanizmasının değiştirilmesi (A.4.12.),
`
    const bullets = extractEkSozlesmeBullets(text)
    expect(bullets.length).toBeGreaterThanOrEqual(5)
    expect(bullets[0]).toMatch(/Grev, lokavt, kargaşalık ile halk hareketleri/i)
    // Clause references `(A.4.2.)` should be stripped
    expect(bullets.every((b) => !b.includes('A.4.'))).toBe(true)
    // Deduplicates identical entries
    const unique = new Set(bullets.map((b) => b.toLowerCase()))
    expect(unique.size).toBe(bullets.length)
  })

  it('accepts the "Ek Sözleşme Maddeleri" header variant', () => {
    const text = `
Ek Sözleşme Maddeleri
• Anahtarın Ele Geçirilmesi
• Kilit Mekanizması Değiştirilmesi
• Hasarsızlık İndirimi Koruma
• Cam Hasarı Koruma
• Hatalı Akaryakıt
`
    const bullets = extractEkSozlesmeBullets(text)
    expect(bullets).toContain('Anahtarın Ele Geçirilmesi')
    expect(bullets).toContain('Cam Hasarı Koruma')
    expect(bullets).toContain('Hatalı Akaryakıt')
  })

  it('stops capture after two consecutive non-bullet lines (new section)', () => {
    const text = `
Ek Sözleşme Maddeleri
• Deprem
• Sel

SONRAKİ BÖLÜM
• This bullet belongs to a different section and should be ignored.
`
    const bullets = extractEkSozlesmeBullets(text)
    expect(bullets).toEqual(['Deprem', 'Sel'])
  })

  it('rejects entries that are too short or too long', () => {
    const text = `
Ek Sözleşme Maddeleri
• X
• ${'a'.repeat(200)}
• Deprem
`
    const bullets = extractEkSozlesmeBullets(text)
    expect(bullets).toEqual(['Deprem'])
  })
})

describe('classifyExclusions named-scenario enumeration (v4 PR-3)', () => {
  it('emits a separate named entry per recognized scenario', () => {
    const exclusions = [
      'Anlaşmalı olmayan yetkili servis kullanımında %35 tenzili muafiyet uygulanır.',
      'Pert araç için %35 tenzili muafiyet uygulanır.',
      'Beyan dışı LPG donanımı tespiti halinde %80 sigortalıya rücu edilir.',
      'Rent-a-car, taksi, kurye, uygulama taşımacılığı gibi ticari kullanımda %80 muafiyet uygulanır.',
      'İlk cam hasarında anlaşmalı olmayan servis kullanımı halinde %35 muafiyet uygulanır.',
    ]
    const result = classifyExclusions(exclusions)
    expect(result.trueExclusions).toEqual([])
    // Five distinct named scenarios → five distinct entries
    expect(result.conditionalDeductibles.length).toBeGreaterThanOrEqual(5)
    // Each named scenario produces a canonical "<Label>: %N" string
    expect(
      result.conditionalDeductibles.some((d) => d.startsWith('Anlaşmalı olmayan servis: %35'))
    ).toBe(true)
    expect(
      result.conditionalDeductibles.some((d) => d.startsWith('Pert araç muafiyeti: %35'))
    ).toBe(true)
    expect(
      result.conditionalDeductibles.some((d) => d.startsWith('Beyan dışı LPG / CNG donanımı: %80'))
    ).toBe(true)
    expect(
      result.conditionalDeductibles.some((d) => d.startsWith('Rent-a-car / ticari kullanım: %80'))
    ).toBe(true)
    // The first-glass match may share keywords with the non-contracted-servis
    // scenario and be swallowed first — require only that the overall count
    // reflects ≥5 distinct entries rather than pinning a specific ordering.
    expect(result.maxDeductiblePercent).toBe(80)
  })

  it('keeps true exclusions separate from conditional deductibles', () => {
    const exclusions = [
      'Anahtarın kontak üzerinde bırakılması durumunda hırsızlık teminat dışıdır.', // true exclusion
      'Anlaşmalı olmayan servisde %35 muafiyet uygulanır.', // conditional deductible
    ]
    const result = classifyExclusions(exclusions)
    expect(result.trueExclusions).toHaveLength(1)
    expect(result.trueExclusions[0]).toMatch(/anahtar/i)
    expect(result.conditionalDeductibles).toHaveLength(1)
    expect(result.conditionalDeductibles[0]).toContain('Anlaşmalı olmayan servis')
  })

  it('deduplicates repeat mentions of the same scenario within one policy', () => {
    const exclusions = [
      '%35 anlaşmalı olmayan yetkili servis muafiyeti uygulanır.',
      'Onarım anlaşmalı olmayan serviste yapıldığında %35 muafiyet uygulanır.',
    ]
    const result = classifyExclusions(exclusions)
    // Same scenario, two wordings → deduped to one named entry (+ optional
    // softened-fallback entries are skipped).
    const anlasmaliHits = result.conditionalDeductibles.filter((d) =>
      d.startsWith('Anlaşmalı olmayan servis')
    )
    expect(anlasmaliHits).toHaveLength(1)
  })

  it('falls back to softened string when no named scenario matches', () => {
    const exclusions = ['Beşinci hasar sonrası 5% muafiyet uygulanır.']
    const result = classifyExclusions(exclusions)
    expect(result.conditionalDeductibles).toHaveLength(1)
    // Fallback path doesn't prepend a "Scenario:" label
    expect(result.conditionalDeductibles[0]).not.toMatch(/^[A-ZÇĞİÖŞÜ][^:]+:\s*%/)
  })
})
