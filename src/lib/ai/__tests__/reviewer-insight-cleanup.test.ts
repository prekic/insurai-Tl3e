/**
 * Targeted tests for 5 KASKO reviewer-mode output cleanup issues (v2).
 * Each test group maps to one specific issue from the Mar 19 session.
 */
import { describe, it, expect } from 'vitest'

// ─── Issue 1: Personalization leak ─────────────────────────────────────────────

// Replicate the updated isPersonalizationLeak for isolated unit testing.
// Must stay in sync with policy-extractor.ts:isPersonalizationLeak()
function isPersonalizationLeak(text: string): boolean {
  const lower = text.toLowerCase()
  if (/policy\s+owner\s+is\s+not\b/i.test(lower)) return true
  if (/this\s+policy\s+.*\s+is\s+not\s+/i.test(lower)) return true
  if (/not\s+\w+\s*\(insured\s+name/i.test(lower)) return true
  if (/insured\s+(?:person|name|party)\s+is\s+not\b/i.test(lower)) return true
  // New patterns added Mar 19
  if (/poli[çc]e\s+sahibi\b.*\bde[ğg]il/i.test(lower)) return true
  if (/\bowner\s+is\s+not\b/i.test(lower)) return true
  // Catch "is not <ProperName>." at end of sentence (the period-terminated form)
  // Exclude common non-identity phrases: "is not included", "is not covered", etc.
  if (/\bis\s+not\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\.?\s*$/.test(text)) {
    const trailingWord = text.match(/\bis\s+not\s+(\w+)\.?\s*$/)?.[1]?.toLowerCase()
    const nonIdentityWords = [
      'included',
      'covered',
      'available',
      'applicable',
      'recommended',
      'required',
      'specified',
      'confirmed',
    ]
    if (trailingWord && !nonIdentityWords.includes(trailingWord)) return true
  }
  return false
}

describe('Issue 1: No personalization / "not Erdem" leak', () => {
  it('detects "This policy owner is not Erdem" as leak', () => {
    expect(
      isPersonalizationLeak('✗ This policy owner is not Erdem (insured name: ERİŞ AMBALAJ)')
    ).toBe(true)
  })

  it('detects "policy owner is not X" with any name', () => {
    expect(isPersonalizationLeak('This policy owner is not John')).toBe(true)
  })

  it('detects "not X (insured name: Y)" pattern', () => {
    expect(isPersonalizationLeak('not Erdem (insured name: SOME COMPANY)')).toBe(true)
  })

  it('detects "insured person is not X" pattern', () => {
    expect(isPersonalizationLeak('The insured person is not the expected user')).toBe(true)
  })

  // New test cases for patterns added in this session
  it('detects "✓ Policy owner is not Erdem." with period', () => {
    expect(isPersonalizationLeak('✓ Policy owner is not Erdem.')).toBe(true)
  })

  it('detects Turkish variant "Poliçe sahibi Erdem değil"', () => {
    expect(isPersonalizationLeak('Poliçe sahibi Erdem değil')).toBe(true)
  })

  it('detects "owner is not" without "policy" prefix', () => {
    expect(isPersonalizationLeak('The owner is not the expected person')).toBe(true)
  })

  it('detects "is not Erdem." at end of sentence', () => {
    expect(isPersonalizationLeak('This person is not Erdem.')).toBe(true)
  })

  it('does NOT flag normal coverage insights', () => {
    expect(isPersonalizationLeak('✓ Teminat yapısı tespit edildi')).toBe(false)
  })

  it('does NOT flag normal Turkish insight about deductible', () => {
    expect(isPersonalizationLeak('⚠ Muafiyet bilgisi doğrulanmalı')).toBe(false)
  })

  it('does NOT flag insight mentioning insured name in non-comparison context', () => {
    expect(isPersonalizationLeak('Policy insured: Ahmet Yılmaz')).toBe(false)
  })

  it('does NOT flag "is not included" phrasing', () => {
    expect(isPersonalizationLeak('Glass coverage is not included')).toBe(false)
  })
})

// ─── Issue 2: Core-coverage contradiction ────────────────────────────────────

// Replicate hasKaskoBaseCoverage for isolated unit testing.
// Must stay in sync with policy-extractor.ts:hasKaskoBaseCoverage()
interface MinCoverage {
  name?: string | null
  description?: string | null
  isMarketValue?: boolean
  category?: string
}
function getCoverageName(c: MinCoverage): string {
  return (c.name || c.description || '').toLowerCase()
}
function hasKaskoBaseCoverage(coverages: MinCoverage[]): boolean {
  return coverages.some((c) => {
    const nameLower = getCoverageName(c)
    return (
      nameLower === 'kasko' ||
      nameLower.includes('tam kasko') ||
      nameLower.includes('full kasko') ||
      nameLower.includes('mini kasko') ||
      nameLower.includes('kasko sigortası') ||
      (nameLower.includes('kasko') && c.category === 'main') ||
      (nameLower.includes('comprehensive') && nameLower.includes('auto')) ||
      nameLower.includes('motor own damage') ||
      (c.isMarketValue === true && c.category === 'main')
    )
  })
}

describe('Issue 2: KASKO core-coverage contradiction prevention', () => {
  it('detects base kasko via "Comprehensive Auto Insurance"', () => {
    const coverages: MinCoverage[] = [{ name: 'Comprehensive Auto Insurance', category: 'main' }]
    expect(hasKaskoBaseCoverage(coverages)).toBe(true)
  })

  it('detects base kasko via isMarketValue + main category', () => {
    const coverages: MinCoverage[] = [
      { name: 'Market Value Coverage', isMarketValue: true, category: 'main' },
    ]
    expect(hasKaskoBaseCoverage(coverages)).toBe(true)
  })

  it('detects base kasko via "Motor Own Damage"', () => {
    const coverages: MinCoverage[] = [{ name: 'Motor Own Damage', category: 'main' }]
    expect(hasKaskoBaseCoverage(coverages)).toBe(true)
  })

  it('still detects traditional "kasko" name', () => {
    const coverages: MinCoverage[] = [{ name: 'Kasko', category: 'main' }]
    expect(hasKaskoBaseCoverage(coverages)).toBe(true)
  })

  it('does NOT detect non-kasko coverage', () => {
    const coverages: MinCoverage[] = [{ name: 'Health Insurance', category: 'main' }]
    expect(hasKaskoBaseCoverage(coverages)).toBe(false)
  })

  it('does NOT detect isMarketValue without main category', () => {
    const coverages: MinCoverage[] = [
      { name: 'Supplementary', isMarketValue: true, category: 'supplementary' },
    ]
    expect(hasKaskoBaseCoverage(coverages)).toBe(false)
  })
})

// ─── Issue 2b: Malformed Turkish insight ───────────────────────────────────────

import { applySafeWording } from '../../analysis/display-interpreter'

describe('Issue 2b: Malformed Turkish insight is clean after safe wording', () => {
  it('replaces full "mükemmel kapsamlı kasko teminatı...rayiç değer...sınırsız" in one pass', () => {
    const input = 'mükemmel kapsamlı kasko teminatı — rayiç değer üzerinden sınırsız koruma'
    const result = applySafeWording(input)
    expect(result).not.toContain('koşullar doğrulanmalı - Rayiç')
    expect(result).not.toContain('Özel şartlara bağlı olabilir teminat')
    expect(result).toMatch(/rayiç değer/i)
    expect(result).toMatch(/doğrulanmalı/i)
  })

  it('replaces "mükemmel teminatı" without generating fused fragments', () => {
    const input = 'mükemmel teminatı var'
    const result = applySafeWording(input)
    expect(result).toContain('Teminat yapısı tespit edildi')
    expect(result).not.toContain('— koşullar doğrulanmalı - Rayiç')
  })

  it('handles "teminat yapısı...rayiç değer...sınırsız" cascading pattern', () => {
    const input = 'teminat yapısı tespit edildi — rayiç değer esasında sınırsız cam teminatı'
    const result = applySafeWording(input)
    expect(result).toMatch(/rayiç değer/i)
    expect(result).toMatch(/doğrulanmalı/i)
    expect(result).not.toContain('Özel şartlara bağlı olabilir teminat')
  })
})

// ─── Issue 3: Language consistency ────────────────────────────────────────────

describe('Issue 3: Reviewer insights are consistently Turkish', () => {
  it('zero deductible strength is in Turkish', () => {
    const expectedTurkish = 'Bazı teminatlarda muafiyet uygulanmıyor'
    expect(expectedTurkish).not.toContain('Zero deductible')
    expect(expectedTurkish).toMatch(/muafiyet/)
  })

  it('special endorsement insight is in Turkish', () => {
    const expectedTurkish = '7 özel kloz tespit edildi — koşulların geçerliliği doğrulanmalı'
    expect(expectedTurkish).not.toContain('special endorsement')
    expect(expectedTurkish).toMatch(/özel kloz/)
    expect(expectedTurkish).toMatch(/doğrulanmalı/)
  })

  it('standard coverage fallback is in Turkish', () => {
    const expectedTurkish = 'Poliçe türüne uygun standart teminat yapısı'
    expect(expectedTurkish).not.toContain('Standard coverage')
    expect(expectedTurkish).toMatch(/standart/)
  })

  it('extraction warning for missing premium is Turkish', () => {
    const warning = 'Prim bilgisi belgeden çıkarılamadı'
    expect(warning).not.toContain('Premium')
    expect(warning).toMatch(/Prim/)
    expect(warning).toMatch(/çıkarılamadı/)
  })

  it('extraction warning for missing insured is Turkish', () => {
    const warning = 'Sigortalı kişi adı belgeden çıkarılamadı'
    expect(warning).not.toContain('Insured person')
    expect(warning).toMatch(/Sigortalı/)
  })

  it('extraction warning for uncertain deductible is Turkish', () => {
    const warning = 'Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir'
    expect(warning).not.toContain('Deductible status')
    expect(warning).toMatch(/Muafiyet/)
    expect(warning).toMatch(/doğrulanamadı/)
  })
})

// ─── Issue 4: Mapping-review warning ───────────────────────────────────────────

describe('Issue 4: Coverage mapping warning is clean Turkish', () => {
  it('new mapping warning is clean and generic', () => {
    const warning = 'Bazı teminat-limit eşleşmeleri ek kontrol gerektiriyor'
    // Must not contain broken casing or raw AI-extracted names
    expect(warning).not.toMatch(/ANAdolu/)
    expect(warning).not.toContain('ANAdolu')
    // Must be clean Turkish
    expect(warning).toMatch(/eşleşmeleri/)
    expect(warning).toMatch(/kontrol/)
  })

  it('does NOT produce English debug-style mapping warning', () => {
    const warning = 'Bazı teminat-limit eşleşmeleri ek kontrol gerektiriyor'
    expect(warning).not.toMatch(/Coverage limit mapping/)
    expect(warning).not.toMatch(/mapping may need review/)
  })
})

// ─── Issue 5: Awkward glass insight ───────────────────────────────────────────

describe('Issue 5: Glass-repair insight is concise and natural', () => {
  it('simplifies the long awkward glass insight', () => {
    const input =
      'Özel şartlara bağlı olabilir cam onarımı imkanı ile değişim yerine onarım yapıldığında araç değeri korunur'
    const result = applySafeWording(input)
    expect(result).toBe('Cam hasarında onarım önceliği özel şartlara bağlı olabilir')
  })

  it('simplifies "sınırsız cam onarımı...araç değeri korunur"', () => {
    const input =
      'sınırsız cam onarımı imkanı ile değişim yerine onarım yapıldığında araç değeri korunur'
    const result = applySafeWording(input)
    expect(result).toBe('Cam hasarında onarım önceliği özel şartlara bağlı olabilir')
  })

  it('still handles generic sınırsız replacement', () => {
    const input = 'sınırsız teminat var'
    const result = applySafeWording(input)
    expect(result).toBe('Özel şartlara bağlı olabilir teminat var')
  })
})

// ─── Issue 5b: Insured legal entity name spacing (preserved from v1) ─────────

function normalizeTurkishLegalEntityName(name: string): string {
  if (!name) return name
  let result = name
  result = result.replace(/LİMİTED(?=ŞİRKET)/g, 'LİMİTED ')
  result = result.replace(/ANONİM(?=ŞİRKET)/g, 'ANONİM ')
  result = result.replace(/TİCARET(?=LİMİTED)/g, 'TİCARET ')
  result = result.replace(/SANAYİ(?=VE\s)/g, 'SANAYİ ')
  result = result.replace(/limited(?=şirket)/gi, 'limited ')
  result = result.replace(/anonim(?=şirket)/gi, 'anonim ')
  result = result.replace(/ticaret(?=limited)/gi, 'ticaret ')
  result = result.replace(/\s{2,}/g, ' ').trim()
  return result
}

describe('Issue 5b: Insured legal entity name spacing', () => {
  it('splits "LİMİTEDŞİRKETİ" → "LİMİTED ŞİRKETİ"', () => {
    const input = 'ERİŞ AMBALAJ SANAYİ VE TİCARET LİMİTEDŞİRKETİ'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('ERİŞ AMBALAJ SANAYİ VE TİCARET LİMİTED ŞİRKETİ')
  })

  it('splits "ANONİMŞİRKETİ" → "ANONİM ŞİRKETİ"', () => {
    const input = 'ABC HOLDİNG ANONİMŞİRKETİ'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('ABC HOLDİNG ANONİM ŞİRKETİ')
  })

  it('handles "TİCARETLİMİTED" → "TİCARET LİMİTED"', () => {
    const input = 'DEMIR SANAYİ VE TİCARETLİMİTEDŞİRKETİ'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('DEMIR SANAYİ VE TİCARET LİMİTED ŞİRKETİ')
  })

  it('preserves already-correct spacing', () => {
    const input = 'ERİŞ AMBALAJ SANAYİ VE TİCARET LİMİTED ŞİRKETİ'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('ERİŞ AMBALAJ SANAYİ VE TİCARET LİMİTED ŞİRKETİ')
  })

  it('does not over-normalize personal names', () => {
    const input = 'AHMET YILMAZ'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('AHMET YILMAZ')
  })

  it('handles lowercase variants', () => {
    const input = 'Demir Ticaret limitedşirketi'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('Demir Ticaret limited şirketi')
  })

  it('collapses double spaces from normalization', () => {
    const input = 'ABC  LİMİTEDŞİRKETİ'
    const result = normalizeTurkishLegalEntityName(input)
    expect(result).toBe('ABC LİMİTED ŞİRKETİ')
  })
})
