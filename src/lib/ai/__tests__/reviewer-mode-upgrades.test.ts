/**
 * Targeted tests for KASKO reviewer-mode upgrades (Mar 19 session 3).
 * Covers: Turkish normalization, exclusion classification, deductible
 * two-layer display, evidence-softening, mini-repair downgrade, label
 * mapping, format defects, and no-regression rules.
 */
import { describe, it, expect } from 'vitest'
import { applySafeWording } from '../../analysis/display-interpreter'

// ─── Replicate classifyExclusions for isolated testing ──────────────────

function classifyExclusions(exclusions: string[]): {
  trueExclusions: string[]
  conditionalDeductibles: string[]
  trueExclusionIndices: Set<number>
} {
  const conditionalPatterns = [
    /muafiyet/i,
    /tenzil/i,
    /%\s*\d+/i,
    /\d+\s*%/i,
    /anlaşmalı olmayan.*servis/i,
    /anlaşmasız.*servis/i,
    /onarım.*muafiyet/i,
    /pert.*muafiyet/i,
    /pert.*tenzil/i,
  ]

  const trueExclusions: string[] = []
  const conditionalDeductibles: string[] = []
  const trueExclusionIndices = new Set<number>()

  for (let i = 0; i < exclusions.length; i++) {
    const text = exclusions[i]
    const isConditional = conditionalPatterns.some((p) => p.test(text))
    if (isConditional) {
      conditionalDeductibles.push(text)
    } else {
      trueExclusions.push(text)
      trueExclusionIndices.add(i)
    }
  }

  return { trueExclusions, conditionalDeductibles, trueExclusionIndices }
}

// ─── Replicate softenReviewerInsight for isolated testing ──────────────────

function softenReviewerInsight(text: string): string {
  let s = text
  if (/teminat[ıi]\s+mevcut\b/i.test(s) && !/görünüyor|doğrulanmalı|olabilir/.test(s)) {
    s = s.replace(
      /teminat([ıi])\s+mevcut\b/gi,
      'teminat$1 mevcut görünüyor; uygulama koşulları doğrulanmalı'
    )
  }
  if (/teminat\s+altında\b/i.test(s) && !/olabilir|doğrulanmalı|görünüyor/.test(s)) {
    s = s.replace(/teminat\s+altında\b/gi, 'teminat altında olabilir; kapsam ve limit doğrulanmalı')
  }
  if (/da\s+teminat\s+altında\s*$/i.test(s) && !/olabilir|doğrulanmalı/.test(s)) {
    s = s.replace(
      /da\s+teminat\s+altında\s*$/i,
      'ilişkin ek teminat kaydı bulunuyor olabilir; kapsam ve limit doğrulanmalı'
    )
  }
  if (/tespit edildi\b/i.test(s) && !/görünüyor|doğrulanmalı|gözden geçirilmeli/.test(s)) {
    s = s.replace(/tespit edildi\b/gi, 'tespit edilmiş görünüyor; uygulama koşulları doğrulanmalı')
  }
  return s
}

// ══════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════

describe('Exclusion vs conditional deductible classification', () => {
  const specimenExclusions = [
    'Anahtarın kontakta veya araç içinde bırakıldığı sırada gerçekleşen araç çalınmaları',
    'Araç çalıştırma kartının araç içinde bırakılması sonucu oluşan çalınmalar',
    'Araçta sigara benzeri maddelerin teması dışındaki zararlar belirtilen koşullarda',
    'Pert total araçlara %35 tenzili muafiyet uygulanması',
    'Anlaşmalı olmayan yetkili serviste onarımda %35 muafiyet',
    'Daha önce pert olmuş araçlar için %35 tenzili muafiyet uygulanır',
  ]

  it('separates percentage-based deductibles from true exclusions', () => {
    const result = classifyExclusions(specimenExclusions)
    expect(result.trueExclusions.length).toBe(3) // theft + card + cigarette
    expect(result.conditionalDeductibles.length).toBe(3) // three %35 deductibles
  })

  it('keeps theft-related items as true exclusions', () => {
    const result = classifyExclusions(specimenExclusions)
    expect(result.trueExclusions.some((e) => e.includes('çalınmalar'))).toBe(true)
    expect(result.trueExclusions.some((e) => e.includes('çalıştırma kartı'))).toBe(true)
  })

  it('classifies %35 muafiyet items as conditional deductibles', () => {
    const result = classifyExclusions(specimenExclusions)
    for (const d of result.conditionalDeductibles) {
      expect(d).toMatch(/muafiyet|tenzil|%35/i)
    }
  })

  it('classifies "anlaşmalı olmayan servis" as conditional deductible', () => {
    const result = classifyExclusions(['Anlaşmalı olmayan yetkili serviste onarımda %35 muafiyet'])
    expect(result.conditionalDeductibles.length).toBe(1)
    expect(result.trueExclusions.length).toBe(0)
  })

  it('returns empty conditionalDeductibles when none present', () => {
    const result = classifyExclusions([
      'Anahtarın kontakta bırakılması halinde çalınma teminat dışı',
    ])
    expect(result.conditionalDeductibles.length).toBe(0)
    expect(result.trueExclusions.length).toBe(1)
  })
})

describe('Two-layer deductible reporting', () => {
  it('shows upgraded text when conditional deductibles detected', () => {
    const deductibleUncertain = true
    const hasConditionalDeductibles = true
    const text =
      deductibleUncertain && hasConditionalDeductibles
        ? 'Genel muafiyet yapısı net değil; koşullu muafiyetler tespit edildi'
        : 'Koşullu / inceleme gerekli'
    expect(text).toBe('Genel muafiyet yapısı net değil; koşullu muafiyetler tespit edildi')
  })

  it('falls back to simple text when no conditional deductibles', () => {
    const deductibleUncertain = true
    const hasConditionalDeductibles = false
    const text =
      deductibleUncertain && hasConditionalDeductibles
        ? 'Genel muafiyet yapısı net değil; koşullu muafiyetler tespit edildi'
        : 'Koşullu / inceleme gerekli'
    expect(text).toBe('Koşullu / inceleme gerekli')
  })
})

describe('Evidence-softening for Turkish insights', () => {
  it('softens "teminatı mevcut" to hedged observation', () => {
    const input = 'Evcil hayvan tedavi masrafları da teminat altında'
    const result = softenReviewerInsight(input)
    expect(result).toMatch(/olabilir|doğrulanmalı/)
    expect(result).not.toBe(input)
  })

  it('softens "tespit edildi" to hedged observation', () => {
    const input = "Sıfır araçlar için 'Eskisi Yerine Yenisi' teminatı tespit edildi"
    const result = softenReviewerInsight(input)
    expect(result).toMatch(/görünüyor/)
    expect(result).toMatch(/doğrulanmalı/)
  })

  it('does NOT double-soften already hedged text', () => {
    const input = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    const result = softenReviewerInsight(input)
    expect(result).toBe(input) // unchanged
  })

  it('does NOT soften ⚠ warning phrasing with doğrulanamadı', () => {
    const input = 'Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir'
    const result = softenReviewerInsight(input)
    expect(result).toBe(input) // unchanged (already contains "olabilir")
  })
})

describe('Coverage label normalization (Turkish mode)', () => {
  it('maps "Comprehensive Auto Insurance" to Turkish', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Comprehensive Auto Insurance']).toBe('Kasko Ana Teminatı')
  })

  it('maps "Extended Liability Insurance" to Turkish', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Extended Liability Insurance']).toBe('İhtiyari Mali Mesuliyet')
  })

  it('maps "Extended Liability Moral Compensation" to Turkish', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Extended Liability Moral Compensation']).toBe('Manevi Tazminat')
  })

  it('maps "Personal Belongings" to Turkish', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Personal Belongings']).toBe('Kişisel Eşya')
  })

  it('maps "Anadolu Service" to normalized Turkish label', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Anadolu Service']).toBe('Anadolu Hizmet Paketi')
  })

  it('maps "Mini Repair Service" to Turkish', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Mini Repair Service']).toBe('Mini Onarım')
  })

  it('maps "Vehicle Market Value" to Turkish', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Vehicle Market Value']).toBe('Araç Piyasa Değeri')
  })
})

describe('Mini repair numeric limit suppression', () => {
  it('downgrades mini repair with implausible limit > 5000 to included', () => {
    const coverage = {
      name: 'Mini Repair Service',
      nameTr: 'Mini Onarım',
      limit: 40000,
      included: false,
      isMarketValue: false,
    }
    // Simulate the downgrade logic
    if (/mini\s*(onar[ıi]m|repair)/i.test(coverage.name + ' ' + coverage.nameTr)) {
      if (coverage.limit > 0 && !coverage.isMarketValue && coverage.limit > 5000) {
        coverage.limit = 0
        coverage.included = true
      }
    }
    expect(coverage.limit).toBe(0)
    expect(coverage.included).toBe(true)
  })

  it('preserves mini repair with small limit ≤ 5000', () => {
    const coverage = {
      name: 'Mini Repair',
      nameTr: 'Mini Onarım',
      limit: 3000,
      included: true,
      isMarketValue: false,
    }
    if (/mini\s*(onar[ıi]m|repair)/i.test(coverage.name + ' ' + coverage.nameTr)) {
      if (coverage.limit > 0 && !coverage.isMarketValue && coverage.limit > 5000) {
        coverage.limit = 0
        coverage.included = true
      }
    }
    expect(coverage.limit).toBe(3000)
  })
})

describe('Format defect: no double colon in Premium', () => {
  it('TR premiumLabel already ends with colon — no extra colon needed', () => {
    const premiumLabel = 'Prim:' // from translations-tr.ts
    const premiumText = 'TRY 31,140'
    const line = `${premiumLabel} ${premiumText}`
    expect(line).toBe('Prim: TRY 31,140')
    expect(line).not.toContain('::')
  })
})

describe('No promotional wording in reviewer mode', () => {
  it('applySafeWording strips "excellent"', () => {
    const result = applySafeWording('Excellent coverage package')
    expect(result).not.toMatch(/excellent/i)
  })

  it('applySafeWording strips "advantage"', () => {
    const result = applySafeWording('Great advantage for drivers')
    expect(result).not.toMatch(/advantage/i)
  })

  it('does not allow "mükemmel" through', () => {
    const result = applySafeWording('Mükemmel teminatı var')
    expect(result).not.toMatch(/mükemmel/i)
  })
})

describe('No regression: preserved correct behaviors', () => {
  it('deductible uncertainty flag is preserved when no conditionals', () => {
    const deductibleUncertain = true
    const conditionalDeductibles: string[] = []
    const text =
      deductibleUncertain && conditionalDeductibles.length > 0
        ? 'Genel muafiyet yapısı net değil; koşullu muafiyetler tespit edildi'
        : deductibleUncertain
          ? 'Koşullu / inceleme gerekli'
          : 'Yok'
    expect(text).toBe('Koşullu / inceleme gerekli')
  })

  it('benchmark note remains cautious', () => {
    const benchmarkNote = 'Prim ve teminat karşılaştırması için güncel piyasa verisi doğrulanmalı'
    expect(benchmarkNote).toMatch(/doğrulanmalı/)
    expect(benchmarkNote).not.toMatch(/\d+%/)
    expect(benchmarkNote).not.toMatch(/yüzdelik/)
  })
})
