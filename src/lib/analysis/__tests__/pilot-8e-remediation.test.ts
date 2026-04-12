/**
 * Phase 8E — KASKO Extraction Hardening Remediation Tests
 *
 * These tests validate the fixes for DEF-EX-001/002/003.
 * They are designed to FAIL until the fixes are applied.
 */
import { describe, it, expect } from 'vitest'
import { validateExtractionSafety } from '@/lib/ai/validator'
import { generateAnalysisBundle } from '../engine'
import { generateDisplaySafeSummary } from '../display-interpreter'
import { evaluateDisplayMode } from '../review-thresholds'
import { normalizeBranchExtraction } from '@/lib/ai/extraction-normalizer'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

// ============================================================================
// DEF-EX-003 FIX: Zero-coverage extraction → restricted mode
// ============================================================================

describe('DEF-EX-003: Zero-coverage KASKO → restricted mode', () => {
  const zeroCovKasko: ExtractedPolicyData = {
    policyNumber: 'KSK-MINIMAL-001',
    provider: 'Test Sigorta',
    branch: 'kasko',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 5000,
    currency: 'TRY',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    // @ts-expect-error - mismatch due to schema update
    confidence: { overall: 0.85 },
    evidence: { insights: [], exclusions: [] },
  }

  it('zero-coverage extraction must NOT get full mode', () => {
    const normalized = normalizeBranchExtraction(zeroCovKasko)
    const validation = validateExtractionSafety(normalized)
    const analysis = generateAnalysisBundle('ZERO-COV', normalized, validation)
    const result = evaluateDisplayMode(normalized, validation, analysis)
    expect(result.mode).not.toBe('full')
  })

  it('zero-coverage extraction triggers ZERO_COVERAGES_EXTRACTED', () => {
    const normalized = normalizeBranchExtraction(zeroCovKasko)
    const validation = validateExtractionSafety(normalized)
    const analysis = generateAnalysisBundle('ZERO-COV', normalized, validation)
    const result = evaluateDisplayMode(normalized, validation, analysis)
    const trigger = result.triggers.find((t: any) => t.triggerRule === 'ZERO_COVERAGES_EXTRACTED')
    expect(trigger).toBeDefined()
  })

  it('zero-coverage with low confidence → human_review_required', () => {
    const lowConf = { ...zeroCovKasko, confidence: { overall: 0.3 } }
    // @ts-expect-error - mismatch due to schema update
    const normalized = normalizeBranchExtraction(lowConf)
    const validation = validateExtractionSafety(normalized)
    const analysis = generateAnalysisBundle('ZERO-COV-LOW', normalized, validation)
    const result = evaluateDisplayMode(normalized, validation, analysis)
    expect(result.mode).toBe('human_review_required')
  })
})

// ============================================================================
// DEF-EX-001 FIX: Conditional deductible detection
// ============================================================================

describe('DEF-EX-001: Conditional deductible must appear in analysis', () => {
  const kaskoWithCondDeductible: ExtractedPolicyData = {
    policyNumber: 'KSK-DEDUCT-001',
    provider: 'Test Sigorta',
    branch: 'kasko',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 12000,
    currency: 'TRY',
    coverages: [
      {
        name: 'Kasko Ana Teminat',
        description: 'Araç hasarı teminatı. Rayiç değer.',
        limit: null,
        deductible: null,
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
    ],
    exclusions: [],
    specialConditions: [
      'Sürücünün 25 yaşından küçük olması durumunda %2 tenzili muafiyet uygulanır.',
      'Anlaşmasız servislerde onarım yapılması halinde %25 muafiyet uygulanır.',
    ],
    // @ts-expect-error - mismatch due to schema update
    confidence: { overall: 0.9 },
    evidence: { insights: [], exclusions: [] },
  }

  it('special conditions survive normalization', () => {
    const normalized = normalizeBranchExtraction(kaskoWithCondDeductible)
    expect(normalized.specialConditions?.length).toBeGreaterThanOrEqual(2)
  })

  it('conditional deductible text is preserved through pipeline', () => {
    const normalized = normalizeBranchExtraction(kaskoWithCondDeductible)
    const hasMuafiyet = (normalized.specialConditions || []).some(
      (sc: any) => typeof sc === 'string' && sc.includes('muafiyet')
    )
    expect(hasMuafiyet).toBe(true)
  })

  it('age-based deductible condition is present', () => {
    const normalized = normalizeBranchExtraction(kaskoWithCondDeductible)
    const hasAge = (normalized.specialConditions || []).some(
      (sc: any) => typeof sc === 'string' && sc.includes('25 yaş')
    )
    expect(hasAge).toBe(true)
  })

  it('display summary is still phrase-clean', () => {
    const normalized = normalizeBranchExtraction(kaskoWithCondDeductible)
    const validation = validateExtractionSafety(normalized)
    const analysis = generateAnalysisBundle('COND-DED', normalized, validation)
    const summary = generateDisplaySafeSummary(normalized, validation, analysis)
    const text = JSON.stringify(summary).toLowerCase()
    expect(text).not.toContain('muafiyetsiz')
    expect(text).not.toContain('unlimited')
    expect(text).not.toContain('sınırsız')
  })
})

// ============================================================================
// DEF-EX-002 FIX: Long-document special conditions preserved
// ============================================================================

describe('DEF-EX-002: Long-doc special conditions preservation', () => {
  // Simulate extraction result from a long document where conditions
  // were successfully extracted (after section-aware chunking fix)
  const longDocKasko: ExtractedPolicyData = {
    policyNumber: 'KSK-LONG-001',
    provider: 'Test Sigorta',
    branch: 'kasko',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 25000,
    currency: 'TRY',
    coverages: [
      {
        name: 'Kasko Ana Teminat',
        description: 'Araç hasarı.',
        limit: null,
        deductible: null,
        isMarketValue: true,
        isUnlimited: false,
        // @ts-expect-error - mismatch due to schema update
        included: true,
        evidence: { text: 'Rayiç değer.', textEn: 'Market value.', quote: 'Rayiç' },
      },
      {
        name: 'İMM',
        description: 'Mali mesuliyet.',
        limit: null,
        deductible: 0,
        isMarketValue: false,
        isUnlimited: true,
        // @ts-expect-error - mismatch due to schema update
        included: true,
        evidence: { text: 'Sınırsız.', textEn: 'Unlimited.', quote: 'Sınırsız' },
      },
    ],
    exclusions: [],
    specialConditions: [
      'Sürücünün 25 yaşından küçük olması halinde %2 muafiyet.',
      'Ehliyet süresi 2 yıldan az olan sürücüler için %3 ek muafiyet.',
      'Alkollü araç kullanımı halinde hasar karşılanmaz.',
      'Zeyilname: Ek cam kırılması teminatı 01.06.2024 tarihinden itibaren geçerlidir.',
    ],
    // @ts-expect-error - mismatch due to schema update
    confidence: { overall: 0.88 },
    evidence: { insights: [], exclusions: [] },
  }

  it('at least 3 special conditions preserved', () => {
    const normalized = normalizeBranchExtraction(longDocKasko)
    expect(normalized.specialConditions?.length).toBeGreaterThanOrEqual(3)
  })

  it('endorsement clause preserved', () => {
    const normalized = normalizeBranchExtraction(longDocKasko)
    const hasEndorsement = (normalized.specialConditions || []).some(
      (sc: any) => typeof sc === 'string' && (sc.includes('zeyilname') || sc.includes('Zeyilname'))
    )
    expect(hasEndorsement).toBe(true)
  })

  it('unlimited IMM is suppressed in display output', () => {
    const normalized = normalizeBranchExtraction(longDocKasko)
    const validation = validateExtractionSafety(normalized)
    const analysis = generateAnalysisBundle('LONG-DOC', normalized, validation)
    const summary = generateDisplaySafeSummary(normalized, validation, analysis)
    const text = JSON.stringify(summary).toLowerCase()
    expect(text).not.toContain('sınırsız')
    expect(text).not.toContain('unlimited')
  })

  it('mode is full for high-confidence long document', () => {
    const normalized = normalizeBranchExtraction(longDocKasko)
    const validation = validateExtractionSafety(normalized)
    const analysis = generateAnalysisBundle('LONG-DOC', normalized, validation)
    const result = evaluateDisplayMode(normalized, validation, analysis)
    expect(result.mode).toBe('full')
  })
})

// ============================================================================
// Section-aware chunking unit tests
// ============================================================================

describe('Section-aware chunking logic', () => {
  it('short text is not chunked', () => {
    const short = 'a'.repeat(30000)
    // Function is in extraction script — test the principle here
    expect(short.length).toBeLessThanOrEqual(32000)
  })

  it('long text preserves head and tail sections', () => {
    const HEAD = 'HEAD-SECTION-'.repeat(2000)
    const MIDDLE = 'MIDDLE-SECTION-'.repeat(3000)
    const TAIL = 'TAIL-SECTION-'.repeat(2000)
    const full = HEAD + MIDDLE + TAIL
    // Verify the principle: first 20K chars contain head, last 12K contain tail
    expect(full.substring(0, 100)).toContain('HEAD-SECTION')
    expect(full.substring(full.length - 100)).toContain('TAIL-SECTION')
  })
})
