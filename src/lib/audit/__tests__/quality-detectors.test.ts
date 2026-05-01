/**
 * Unit tests for Phase 1 self-audit detectors.
 *
 * Each detector is exercised across pass / warn / critical paths plus
 * input-edge cases (null/undefined/empty arrays, missing raw text, no
 * carve-out signals, etc.). Mock data uses Turkish kasko phrasing because
 * the detectors hard-code Turkish keyword regexes via
 * `NAMED_DEDUCTIBLE_SCENARIOS`.
 */
import { describe, it, expect } from 'vitest'
import {
  checkFinancialRisksDedup,
  checkEkSozlesmeBulletParity,
  checkNamedScenarioCoverage,
  checkCarveOutDisplayContract,
  runAllQualityDetectors,
  extractCriticalTriggers,
} from '../quality-detectors'
import type { Coverage } from '@/types/policy'
import type { ScenarioCard } from '@/lib/policy-evaluation/types'

// -----------------------------------------------------------------------------
// 1. Financial risks dedup
// -----------------------------------------------------------------------------

describe('checkFinancialRisksDedup', () => {
  it('passes when input is empty / single entry', () => {
    expect(checkFinancialRisksDedup(undefined).severity).toBe('pass')
    expect(checkFinancialRisksDedup(null).severity).toBe('pass')
    expect(checkFinancialRisksDedup([]).severity).toBe('pass')
    expect(checkFinancialRisksDedup(['Pert araç muafiyeti: %35']).severity).toBe('pass')
  })

  it('passes when entries are semantically distinct', () => {
    const result = checkFinancialRisksDedup([
      'Anlaşmalı olmayan servis: %35',
      'Pert araç muafiyeti: %35',
      'Beyan dışı LPG / CNG donanımı: %80',
    ])
    expect(result.severity).toBe('pass')
    expect(result.detail).toContain('no semantic duplicates')
  })

  it('warns on 1-2 collapses', () => {
    // Two near-identical Pert phrasings should collapse via stemmed-word Jaccard.
    const result = checkFinancialRisksDedup([
      'Pert araç muafiyeti: %35',
      'Pert araç tenzili muafiyet: %35',
      'Anlaşmalı olmayan servis: %35',
    ])
    expect(result.severity).toBe('warn')
    expect(result.detail).toMatch(/Collapsed 3→\d/)
  })

  it('emits critical when 3+ collapses', () => {
    // 4 near-identical Pert phrasings (will all collapse to one) + 1 distinct
    // Pert phrasing pair (collapses to one). Total 5 inputs, 3+ collapses.
    const result = checkFinancialRisksDedup([
      'Pert araç muafiyeti: %35',
      'Pert araç muafiyeti: %35',
      'Pert araç muafiyeti tenzil: %35',
      'Pert araç tenzili muafiyet: %35',
      'Pert araç hasar muafiyeti: %35',
    ])
    expect(result.severity).toBe('critical')
    expect(result.detail).toMatch(/Collapsed 5→\d/)
  })
})

// -----------------------------------------------------------------------------
// 2. EK SÖZLEŞME bullet count parity
// -----------------------------------------------------------------------------

describe('checkEkSozlesmeBulletParity', () => {
  const RAW_TEXT_WITH_11_BULLETS = `
    EK SÖZLEŞME MADDELERİ
    • Hatalı Akaryakıt
    • Cam Hasar Koruma
    • Hasarsızlık İndirimi Koruma
    • Mini Repair Service
    • Personal Belongings
    • Pet Coverage
    • New Vehicle Replacement
    • Roadside Assistance
    • Towing
    • Medical Transport
    • Valet Park
    SONRAKİ BÖLÜM
  `

  it('passes when raw text is unavailable', () => {
    expect(checkEkSozlesmeBulletParity(null, 0).severity).toBe('pass')
    expect(checkEkSozlesmeBulletParity(undefined, 5).severity).toBe('pass')
    expect(checkEkSozlesmeBulletParity('short', 5).severity).toBe('pass')
  })

  it('passes when bullet count is too low to validate (≤ 2)', () => {
    const text = `EK SÖZLEŞME MADDELERİ
    • Item one
    • Item two
    SONRAKİ BÖLÜM`
    expect(checkEkSozlesmeBulletParity(text, 0).severity).toBe('pass')
  })

  it('passes when ratio ≥ 0.9', () => {
    const result = checkEkSozlesmeBulletParity(RAW_TEXT_WITH_11_BULLETS, 10)
    expect(result.severity).toBe('pass')
    expect(result.detail).toContain('10')
    expect(result.detail).toContain('11')
  })

  it('warns on moderate shortfall (ratio 0.5-0.89)', () => {
    const result = checkEkSozlesmeBulletParity(RAW_TEXT_WITH_11_BULLETS, 7)
    expect(result.severity).toBe('warn')
    expect(result.detail).toContain('shortfall 4')
  })

  it('emits critical when ratio < 0.5 AND shortfall ≥ 5 (reviewer 11→1 regression)', () => {
    const result = checkEkSozlesmeBulletParity(RAW_TEXT_WITH_11_BULLETS, 1)
    expect(result.severity).toBe('critical')
    expect(result.detail).toContain('11')
    expect(result.detail).toContain('1')
  })
})

// -----------------------------------------------------------------------------
// 3. Named-scenario coverage probe
// -----------------------------------------------------------------------------

describe('checkNamedScenarioCoverage', () => {
  const RAW_TEXT_WITH_KULLANIM_SEKLI = `
    Kullanım şekli aracın ticari olarak kullanılması, rent-a-car veya
    taksi olarak işletilmesi durumunda %80 oranında tenzili muafiyet
    uygulanır.
  `

  const RAW_TEXT_WITH_PERT = `
    Pert araç hasarlarında %35 oranında muafiyet uygulanır.
  `

  it('passes when raw text is unavailable', () => {
    expect(checkNamedScenarioCoverage(null, []).severity).toBe('pass')
  })

  it('passes when all detected scenarios already in conditionalDeductibles', () => {
    const result = checkNamedScenarioCoverage(RAW_TEXT_WITH_PERT, ['Pert araç muafiyeti: %35'])
    expect(result.severity).toBe('pass')
  })

  it('emits critical when ≥80% scenario missing (reviewer Kullanım Şekli regression)', () => {
    const result = checkNamedScenarioCoverage(RAW_TEXT_WITH_KULLANIM_SEKLI, [])
    expect(result.severity).toBe('critical')
    expect(result.check).toBe('NAMED_SCENARIO_MISSING_HIGH_IMPACT')
    expect(result.detail).toContain('Rent-a-car')
    expect(result.detail).toContain('%80')
  })

  it('warns when low-percent scenario is missing', () => {
    const text = `İlk cam hasarı için %20 muafiyet uygulanır.`
    const result = checkNamedScenarioCoverage(text, [])
    expect(result.severity).toBe('warn')
    expect(result.check).toBe('NAMED_SCENARIO_MISSING')
  })

  it('falls back to warn when scenario found but no percent in window', () => {
    const text = `Beyan edilmemiş LPG donanımı için ek muafiyet uygulanır.`
    const result = checkNamedScenarioCoverage(text, [])
    expect(result.severity).toBe('warn')
  })
})

// -----------------------------------------------------------------------------
// 4. Carve-out display contract
// -----------------------------------------------------------------------------

function makeCoverage(partial: Partial<Coverage>): Coverage {
  return {
    name: partial.name ?? 'Test Coverage',
    nameTr: partial.nameTr ?? 'Test',
    limit: partial.limit ?? 0,
    deductible: partial.deductible ?? 0,
    included: partial.included ?? true,
    ...partial,
  }
}

describe('checkCarveOutDisplayContract', () => {
  it('passes when no unlimited coverages present', () => {
    const result = checkCarveOutDisplayContract(
      [makeCoverage({ name: 'A', isUnlimited: false })],
      []
    )
    expect(result.severity).toBe('pass')
  })

  it('emits critical when carveOuts populated but no scenario card has a caveat', () => {
    const cov = makeCoverage({
      name: 'Artan Mali Sorumluluk',
      isUnlimited: true,
      carveOuts: ['2,500,000 TL at airports/ports/fuel depots'],
    })
    const cards: ScenarioCard[] = [
      {
        id: '1',
        title: 'Liability scenario',
        titleTR: 'Sorumluluk',
        description: 'desc',
        descriptionTR: 'açıklama',
        financialStatus: 'covered',
      },
    ]
    const result = checkCarveOutDisplayContract([cov], cards)
    expect(result.severity).toBe('critical')
    expect(result.detail).toContain('Artan Mali Sorumluluk')
  })

  it('passes when at least one scenario card surfaces a caveat', () => {
    const cov = makeCoverage({
      name: 'Artan Mali',
      isUnlimited: true,
      carveOuts: ['2.5M at airports'],
    })
    const cards: ScenarioCard[] = [
      {
        id: '1',
        title: 'X',
        titleTR: 'X',
        description: '',
        descriptionTR: '',
        financialStatus: 'covered',
        caveat: 'Capped at 2,500,000 TL at airports',
      },
    ]
    const result = checkCarveOutDisplayContract([cov], cards)
    expect(result.severity).toBe('pass')
  })

  it('warns when latent carve-out signals exist in clause text but carveOuts is empty', () => {
    const cov = makeCoverage({
      name: 'Excess Liability',
      isUnlimited: true,
      carveOuts: null,
      clause: 'Havalimanı, liman, akaryakıt depoları için',
      quote: 'olay başı 2.500.000 TL üst sınırı uygulanır',
    })
    const result = checkCarveOutDisplayContract([cov], [])
    expect(result.severity).toBe('warn')
    expect(result.detail).toContain('Excess Liability')
  })

  it('passes when unlimited coverage has no carve-out signals at all', () => {
    const cov = makeCoverage({
      name: 'Unlimited Glass',
      isUnlimited: true,
      carveOuts: null,
      clause: 'Cam Koruma',
      quote: 'Tüm cam hasarları sınırsız teminat altındadır.',
    })
    const result = checkCarveOutDisplayContract([cov], [])
    expect(result.severity).toBe('pass')
  })
})

// -----------------------------------------------------------------------------
// 5. Aggregator + critical-trigger extractor
// -----------------------------------------------------------------------------

describe('runAllQualityDetectors + extractCriticalTriggers', () => {
  it('returns 4 findings even on empty inputs', () => {
    const findings = runAllQualityDetectors({})
    expect(findings).toHaveLength(4)
    expect(findings.map((f) => f.check)).toEqual(
      expect.arrayContaining([
        'FINANCIAL_RISKS_DUPLICATED',
        'EK_SOZLESME_BULLETS_UNDERREPORTED',
        'NAMED_SCENARIO_MISSING',
        'CARVE_OUT_DISPLAY_MISMATCH',
      ])
    )
  })

  it('extractCriticalTriggers pulls only critical-severity check codes', () => {
    const findings = [
      { check: 'A', severity: 'pass' as const, detail: '' },
      { check: 'B', severity: 'warn' as const, detail: '' },
      { check: 'C', severity: 'critical' as const, detail: '' },
      { check: 'D', severity: 'critical' as const, detail: '' },
    ]
    expect(extractCriticalTriggers(findings)).toEqual(['C', 'D'])
  })

  it('infers supplementaryCount from coverages.category when not explicitly passed', () => {
    const findings = runAllQualityDetectors({
      rawText: '', // skipped; supplementary count infer happens regardless
      coverages: [
        makeCoverage({ name: 'A', category: 'main' }),
        makeCoverage({ name: 'B', category: 'supplementary' }),
        makeCoverage({ name: 'C', category: 'supplementary' }),
      ],
    })
    // The bullet-parity detector with empty raw text returns pass; the test
    // here is mainly that the call doesn't crash with the supplementary
    // inference path.
    expect(findings).toHaveLength(4)
  })
})
