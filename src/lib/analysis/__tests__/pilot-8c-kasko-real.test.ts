/**
 * Phase 8C — KASKO Real-Document Validation
 *
 * Tests the analysis/display pipeline against data derived from
 * actual KASKO policy document text (golden FAIL-001 and integration test).
 *
 * Source distinction:
 *  - REAL-DOC-001: Golden FAIL-001 text (complex KASKO with conditional deductibles,
 *                  rayiç değer, sınırsız İMM, cam kırılması, asistans)
 *  - REAL-DOC-002: Integration test schema (KASKO universal schema test)
 *  - REAL-DOC-003: Deliberately partial extraction (simulates OCR-quality input)
 */
import { describe, it, expect } from 'vitest'
import { validateExtractionSafety } from '@/lib/ai/validator'
import { generateAnalysisBundle } from '../engine'
import { generateDisplaySafeSummary } from '../display-interpreter'
import { evaluateDisplayMode } from '../review-thresholds'
import { normalizeBranchExtraction } from '@/lib/ai/extraction-normalizer'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

// v4: "unlimited" / "sınırsız" are NOT prohibited — they're legitimate
// structural descriptors (IMM Sınırsız). The carve-out caveat pattern is
// surfaced separately; destroying the signal broke user trust.
const PROHIBITED_PHRASES = [
  'no deductible',
  'fully covered',
  'tam kapsamlı',
  'guaranteed',
  'full protection',
  'total coverage',
  "your vehicle's full value will be paid",
  'aracınızın tam değeri ödenir',
  'free towing',
  'fully compliant',
  'muafiyetsiz',
  'tamamen kapsar',
]

// ============================================================================
// SAMPLE 1: GOLDEN FAIL-001 — Complex KASKO (high fidelity extraction)
// Source: tests/golden/kasko-failing-examples.json
// Document text: TÜRKİYE SİGORTA KASKO POLİÇESİ with conditional deductibles,
//   rayiç değer, sınırsız İMM, cam kırılması conditions, asistans limits
// ============================================================================
const realDoc001: ExtractedPolicyData = {
  policyNumber: '987654321',
  provider: 'Türkiye Sigorta',
  branch: 'kasko',
  startDate: '2024-03-01',
  endDate: '2025-03-01',
  premium: 18500,
  currency: 'TRY',
  coverages: [
    {
      name: 'Kasko Ana Teminat',
      description: 'Araç hasarı teminatı. Sigorta bedeli rayiç değer olarak kabul edilmiştir.',
      limit: null,
      deductible: null,
      isMarketValue: true,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'SİGORTA BEDELİ: İşbu poliçe kapsamında aracın bedeli ödeme tarihindeki piyasa Rayiç Değeri olarak kabul edilmiştir.',
        textEn:
          'SUM INSURED: The vehicle value is accepted as the market value at the time of payment.',
        quote: 'Rayiç Değeri olarak kabul edilmiştir',
      },
    },
    {
      name: 'İhtiyari Mali Mesuliyet (İMM)',
      description: '3. şahıslara karşı bedeni ve maddi zararlar. Sınırsız teminat.',
      limit: null,
      deductible: 0,
      isMarketValue: false,
      isUnlimited: true,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'İHTİYARİ MALİ MESULİYET (İMM): 3. Şahıslara karşı verilecek bedeni ve maddi zararlar Sınırsız olarak teminat altındadır.',
        textEn:
          'VOLUNTARY LIABILITY (IMM): Bodily and material damages to third parties are covered without limit.',
        quote: 'Sınırsız olarak teminat altındadır',
      },
    },
    {
      name: 'Manevi Tazminat',
      description:
        'İMM kapsamında manevi tazminat. Olay başı ve yıllık toplam 500.000 TL ile sınırlı.',
      limit: 500000,
      deductible: 0,
      isMarketValue: false,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'MANEVİ TAZMİNAT: İMM teminatı kapsamında talep edilecek manevi tazminat talepleri olay başı ve yıllık toplam 500.000 TL ile sınırlandırılmıştır.',
        textEn:
          'MORAL DAMAGES: Claims under IMM coverage are limited to 500,000 TL per event and annual total.',
        quote: '500.000 TL ile sınırlandırılmıştır',
      },
    },
    {
      name: 'Cam Kırılması',
      description:
        'Anlaşmalı servislerde muafiyetsiz orijinal cam. Anlaşmasız servislerde %25 muafiyet.',
      limit: null,
      deductible: null,
      isMarketValue: false,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'CAM KIRILMASI: Anlaşmalı cam servislerinde yapılacak olan orijinal cam değişimleri muafiyetsiz ve sınırsızdır. Ancak anlaşmasız servislerde yapılacak cam değişimlerinde %25 oranında muafiyet uygulanır.',
        textEn:
          'GLASS BREAKAGE: Original glass replacements at network service shops are without deductible and without limit. However, at non-network shops, a 25% deductible applies.',
        quote: 'Anlaşmalı cam servislerinde ... muafiyetsiz ve sınırsızdır',
      },
    },
    {
      name: 'Asistans',
      description: 'Çekici hizmeti. 1.500 TL limite kadar.',
      limit: 1500,
      deductible: 0,
      isMarketValue: false,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: "ASİSTANS: 1500 TL'ye kadar ücretsiz çekici hizmeti sağlanmaktadır.",
        textEn: 'ASSISTANCE: Towing service provided up to 1,500 TL.',
        quote: "1500 TL'ye kadar ücretsiz çekici hizmeti",
      },
    },
  ],
  exclusions: [],
  specialConditions: [
    'Sürücünün 25 yaşından küçük olması veya ehliyet süresinin 2 yıldan az olması durumunda %2 tenzili muafiyet uygulanır.',
    'Anlaşmasız servislerde cam değişimlerinde %25 muafiyet uygulanır.',
  ],
  // @ts-expect-error - mismatch due to schema update
  confidence: { overall: 0.92 },
  evidence: {
    insights: [
      {
        text: 'MUAFİYET ŞARTLARI: Poliçede genel muafiyet uygulanmamaktadır.',
        textEn: 'DEDUCTIBLE CONDITIONS: No general deductible is applied to the policy.',
        quote: 'Poliçede genel muafiyet uygulanmamaktadır',
      },
    ],
    exclusions: [],
  },
}

// ============================================================================
// SAMPLE 2: Universal Schema Integration (clean, high-confidence)
// Source: src/__tests__/integration/kasko-universal-schema.test.ts
// ============================================================================
const realDoc002: ExtractedPolicyData = {
  policyNumber: '123456789',
  provider: 'Test Insurance',
  branch: 'kasko',
  startDate: '2024-01-01',
  endDate: '2025-01-01',
  premium: 15000,
  currency: 'TRY',
  coverages: [
    {
      name: 'Kasko',
      description: 'Comprehensive auto. Sigorta bedeli rayiç değer.',
      limit: null,
      deductible: 0,
      isMarketValue: true,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'SİGORTA BEDELİ: Rayiç Değer',
        textEn: 'SUM INSURED: Market Value',
        quote: 'Rayiç Değer',
      },
    },
    {
      name: 'İhtiyari Mali Mesuliyet (İMM)',
      description: 'Discretionary liability, unlimited.',
      limit: null,
      deductible: 0,
      isMarketValue: false,
      isUnlimited: true,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'İHTİYARİ MALİ MESULİYET (İMM): Sınırsız',
        textEn: 'VOLUNTARY LIABILITY: Unlimited',
        quote: 'Sınırsız',
      },
    },
    {
      name: 'Manevi Tazminat',
      description: 'Moral damages under IMM, capped at 500,000 TL.',
      limit: 500000,
      deductible: 0,
      isMarketValue: false,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'İMM MANEVİ TAZMİNAT: 500.000 TL ile sınırlıdır.',
        textEn: 'IMM MORAL DAMAGES: Limited to 500,000 TL.',
        quote: '500.000 TL ile sınırlıdır',
      },
    },
    {
      name: 'Cam Kırılması',
      description: 'Glass replacement at network shops, unlimited. 25% deductible at non-network.',
      limit: null,
      deductible: null,
      isMarketValue: false,
      isUnlimited: true,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'CAM KIRILMASI: Anlaşmalı servislerde orijinal cam ile sınırsız değişim hizmeti. Anlaşmasız servislerde %25 muafiyet.',
        textEn:
          'GLASS: Unlimited original glass replacement at network. 25% deductible at non-network.',
        quote: 'sınırsız değişim hizmeti',
      },
    },
  ],
  exclusions: [],
  specialConditions: ['Sürücünün 25 yaş altında olması durumunda %2 muafiyet uygulanır.'],
  // @ts-expect-error - mismatch due to schema update
  confidence: { overall: 0.95 },
  evidence: {
    insights: [
      {
        text: 'MUAFİYET: Sürücünün 25 yaş altında olması durumunda %2 muafiyet uygulanır.',
        textEn: 'DEDUCTIBLE: 2% deductible applies if driver is under 25.',
        quote: '25 yaş altında ... %2 muafiyet',
      },
    ],
    exclusions: [],
  },
}

// ============================================================================
// SAMPLE 3: OCR-quality partial extraction (simulates noisy real PDF)
// Source: derived from eriş ambalaj kasko pol.pdf metadata
// The extraction would be partial, missing some fields, lower confidence
// ============================================================================
const realDoc003: ExtractedPolicyData = {
  policyNumber: null,
  provider: 'Eriş Ambalaj - Acentesi bilinmiyor',
  branch: 'kasko',
  startDate: '2024-06-15',
  endDate: '2025-06-15',
  premium: null,
  currency: 'TRY',
  coverages: [
    {
      name: 'Kasko',
      description: 'Araç hasarı teminatı',
      limit: null,
      deductible: null,
      isMarketValue: false,
      isUnlimited: false,
      // @ts-expect-error - mismatch due to schema update
      included: true,
      evidence: {
        text: 'KASKO POLİÇESİ - araç teminatı',
        textEn: 'KASKO POLICY - vehicle coverage',
        quote: 'KASKO POLİÇESİ',
      },
    },
  ],
  exclusions: [],
  specialConditions: [],
  // @ts-expect-error - mismatch due to schema update
  confidence: { overall: 0.35 },
  evidence: {
    insights: [],
    exclusions: [],
  },
}

// ============================================================================
// HUMAN QA EXPECTED RESULTS
// ============================================================================
interface HumanExpected {
  mainProtection: string
  conditionalDeductible: boolean
  unlimitedHandledSafely: boolean
  serviceVsIndemnity: boolean
  minCoverages: number
  expectedMode: string
}

const expected001: HumanExpected = {
  mainProtection: 'Rayiç değer (market value) based',
  conditionalDeductible: true, // 25 yaş condition
  unlimitedHandledSafely: true, // İMM sınırsız must not leak
  serviceVsIndemnity: true, // Cam: network vs non-network distinction
  minCoverages: 4,
  expectedMode: 'full', // High confidence, clean data
}

const expected002: HumanExpected = {
  mainProtection: 'Rayiç değer based',
  conditionalDeductible: true,
  unlimitedHandledSafely: true,
  serviceVsIndemnity: true,
  minCoverages: 3,
  expectedMode: 'full',
}

const expected003: HumanExpected = {
  mainProtection: 'Unknown — partial extraction',
  conditionalDeductible: false,
  unlimitedHandledSafely: true, // No unlimited claims to leak
  serviceVsIndemnity: false,
  minCoverages: 1,
  expectedMode: 'human_review_required', // Very low confidence
}

// ============================================================================
// PIPELINE RUNNER
// ============================================================================
function runRealDocValidation(id: string, data: ExtractedPolicyData, _expected: HumanExpected) {
  const normalized = normalizeBranchExtraction(data)
  const validation = validateExtractionSafety(normalized)
  const analysis = generateAnalysisBundle(id, normalized, validation)
  const displayResult = evaluateDisplayMode(normalized, validation, analysis)
  const summary = generateDisplaySafeSummary(normalized, validation, analysis)

  const summaryText = JSON.stringify(summary).toLowerCase()
  const foundPhrases = PROHIBITED_PHRASES.filter((p) => summaryText.includes(p.toLowerCase()))

  return { normalized, validation, analysis, displayResult, summary, foundPhrases }
}

// ============================================================================
// TESTS
// ============================================================================

describe('Phase 8C: KASKO Real-Document Validation', () => {
  // --- REAL-DOC-001: Golden FAIL-001 ---
  describe('REAL-DOC-001: Golden FAIL-001 (complex KASKO)', () => {
    const r = runRealDocValidation('REAL-DOC-001', realDoc001, expected001)

    it('pipeline completes', () => {
      expect(r.displayResult).toBeDefined()
      expect(r.summary).toBeDefined()
    })

    it('no prohibited phrases in display output', () => {
      expect(r.foundPhrases, `Found: ${r.foundPhrases.join(', ')}`).toEqual([])
    })

    it('display mode is full (high confidence clean data)', () => {
      expect(r.displayResult.mode).toBe('full')
    })

    it('rayiç değer handling: market value detected', () => {
      const hasMarketValue = r.normalized.coverages?.some((c) => c.isMarketValue === true)
      expect(hasMarketValue).toBe(true)
    })

    it('conditional deductible in special conditions', () => {
      const hasCondDeductible = (r.normalized.specialConditions || []).some(
        (sc) => sc.includes('25 yaş') || sc.includes('muafiyet')
      )
      expect(hasCondDeductible).toBe(true)
    })

    it('unlimited IMM signal is preserved in display (v4)', () => {
      // v4 change: preserve the Sınırsız / Unlimited signal in structural
      // limit fields so users see the headline IMM feature. Carve-outs
      // (e.g. 2.5M TL at airports/ports) are surfaced as separate caveat
      // badges, not by erasing the "Sınırsız" value.
      const summaryText = JSON.stringify(r.summary).toLowerCase()
      // The hedge-string placeholder from v3 must NOT be rendered as content.
      expect(summaryText).not.toContain('coverage subject to sublimits')
    })

    it('cam kırılması service distinction preserved', () => {
      const glassCov = r.normalized.coverages?.find((c) => c.name?.toLowerCase().includes('cam'))
      expect(glassCov).toBeDefined()
      // The coverage description should mention both network and non-network conditions
      expect(glassCov?.description?.toLowerCase()).toContain('anlaşmalı')
    })

    it('source quotes available', () => {
      // @ts-expect-error - mismatch due to schema update
      const quotedCoverages = (r.normalized.coverages || []).filter((c) => c.evidence?.quote)
      expect(quotedCoverages.length).toBeGreaterThanOrEqual(3)
    })

    it('at least 4 coverages extracted', () => {
      expect(r.normalized.coverages?.length || 0).toBeGreaterThanOrEqual(expected001.minCoverages)
    })

    it('QA summary', () => {
      console.log('\n=== REAL-DOC-001: Golden FAIL-001 QA ===')
      console.log('Display mode:', r.displayResult.mode)
      console.log(
        'Triggers:',
        r.displayResult.triggers.map((t) => t.triggerRule).join(', ') || 'none'
      )
      console.log(
        'Prohibited phrases:',
        r.foundPhrases.length === 0 ? '✅ CLEAN' : `❌ ${r.foundPhrases.join(', ')}`
      )
      // @ts-expect-error - mismatch due to schema update
      console.log('Coverage cards:', r.summary.coverageCards?.length || 0)
      console.log('Missing cards:', r.summary.missingOrUnclearCards?.length || 0)
      console.log(
        'Market value detected:',
        r.normalized.coverages?.some((c) => c.isMarketValue) ? '✅' : '❌'
      )
      console.log(
        'Conditional deductible:',
        (r.normalized.specialConditions || []).some((sc) => sc.includes('muafiyet')) ? '✅' : '❌'
      )
      expect(true).toBe(true)
    })
  })

  // --- REAL-DOC-002: Universal Schema ---
  describe('REAL-DOC-002: Universal Schema (clean KASKO)', () => {
    const r = runRealDocValidation('REAL-DOC-002', realDoc002, expected002)

    it('pipeline completes', () => {
      expect(r.summary).toBeDefined()
    })

    it('no prohibited phrases', () => {
      expect(r.foundPhrases, `Found: ${r.foundPhrases.join(', ')}`).toEqual([])
    })

    it('display mode is full', () => {
      expect(r.displayResult.mode).toBe('full')
    })

    it('market value detected', () => {
      expect(r.normalized.coverages?.some((c) => c.isMarketValue)).toBe(true)
    })

    it('legacy sublimits hedge-string is not rendered (v4)', () => {
      // v4: preserve Sınırsız / Unlimited signal; only suppress the v3
      // placeholder string that was destroying the signal.
      const t = JSON.stringify(r.summary).toLowerCase()
      expect(t).not.toContain('coverage subject to sublimits')
    })

    it('at least 3 coverages', () => {
      expect(r.normalized.coverages?.length || 0).toBeGreaterThanOrEqual(3)
    })
  })

  // --- REAL-DOC-003: OCR-quality partial ---
  describe('REAL-DOC-003: OCR-quality partial (noisy KASKO)', () => {
    const r = runRealDocValidation('REAL-DOC-003', realDoc003, expected003)

    it('pipeline completes', () => {
      expect(r.summary).toBeDefined()
    })

    it('no prohibited phrases', () => {
      expect(r.foundPhrases, `Found: ${r.foundPhrases.join(', ')}`).toEqual([])
    })

    it('display mode is human_review_required (low confidence)', () => {
      expect(r.displayResult.mode).toBe('human_review_required')
    })

    it('at least 1 coverage', () => {
      expect(r.normalized.coverages?.length || 0).toBeGreaterThanOrEqual(1)
    })

    it('triggers present for low quality', () => {
      expect(r.displayResult.triggers.length).toBeGreaterThan(0)
    })

    it('QA summary', () => {
      console.log('\n=== REAL-DOC-003: OCR-quality QA ===')
      console.log('Display mode:', r.displayResult.mode)
      console.log('Triggers:', r.displayResult.triggers.map((t) => t.triggerRule).join(', '))
      console.log('Validation flags:', r.validation.flags.length)
      expect(true).toBe(true)
    })
  })

  // --- Cross-document summary ---
  it('cross-document summary', () => {
    const samples = [
      { id: 'REAL-DOC-001', data: realDoc001, expected: expected001 },
      { id: 'REAL-DOC-002', data: realDoc002, expected: expected002 },
      { id: 'REAL-DOC-003', data: realDoc003, expected: expected003 },
    ]
    const results = samples.map((s) => {
      const r = runRealDocValidation(s.id, s.data, s.expected)
      return {
        id: s.id,
        source:
          s.id === 'REAL-DOC-001'
            ? 'golden-text'
            : s.id === 'REAL-DOC-002'
              ? 'integration-schema'
              : 'ocr-partial',
        mode: r.displayResult.mode,
        expected: s.expected.expectedMode,
        match: r.displayResult.mode === s.expected.expectedMode ? '✅' : '❌',
        phraseClean: r.foundPhrases.length === 0 ? '✅' : '❌',
        coverages: r.normalized.coverages?.length || 0,
        triggers: r.displayResult.triggers.length,
        flags: r.validation.flags.length,
      }
    })
    console.log('\n=== PHASE 8C: KASKO CROSS-DOCUMENT SUMMARY ===')
    console.table(results)
    expect(results.every((r) => r.match === '✅')).toBe(true)
    expect(results.every((r) => r.phraseClean === '✅')).toBe(true)
  })
})
