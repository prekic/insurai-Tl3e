import { describe, it, expect } from 'vitest'
import { generateDisplaySafeSummary, checkProhibitedPhrase } from '../display-interpreter'
import { generateAnalysisBundle } from '../engine'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

// ============================================================================
// KASKO MOCK DATA
// ============================================================================

function makeKaskoData(overrides: Partial<ExtractedPolicyData> = {}): ExtractedPolicyData {
  return {
    policyType: 'kasko',
    policyNumber: 'K-2024-001',
    provider: 'Test Sigorta A.Ş.',
    insuredName: 'Ahmet Yılmaz',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    premium: 12000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    confidence: {
      overall: 0.95,
      premium: 0.95,
      coverages: 0.9,
      policyNumber: 0.99,
      provider: 0.99,
      dates: 0.99,
    },
    coverages: [
      { name: 'Kasko', isMarketValue: true, deductible: 0 },
      { name: 'İMM', limit: 10000000, isUnlimited: false, deductible: 0 },
      { name: 'Ferdi Kaza', limit: 500000, deductible: 0 },
    ],
    exclusions: ['Alkollü araç kullanımı', 'Ehliyetsiz sürücü'],
    specialConditions: ['Araç ticarî amaçla kullanılamaz'],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    ...overrides,
  } as ExtractedPolicyData
}

const validValidation: ValidationResult = { isValid: true, flags: [] }

// ============================================================================
// WORDING SUPPRESSION TESTS (Workstream C)
// ============================================================================

describe('checkProhibitedPhrase', () => {
  it.each([
    ['no deductible'],
    ['fully covered'],
    ['tam kapsamlı'],
    ['guaranteed'],
    ['full protection'],
    ['total coverage'],
    ["your vehicle's full value will be paid"],
    ['free towing'],
    ['fully compliant'],
    ['muafiyetsiz'],
    ['tamamen kapsar'],
  ])('blocks prohibited phrase: "%s"', (phrase) => {
    expect(checkProhibitedPhrase(`This policy is ${phrase} for all scenarios`)).toBe(phrase)
  })

  // v4: "unlimited" / "sınırsız" are NOT prohibited — they're legitimate
  // structural descriptors when a coverage actually is unlimited (IMM Sınırsız).
  // Hedging them blindly destroyed signals users rely on; narrative-level
  // promotional patterns are caught by the more specific multi-word rules in
  // applySafeWording.
  it.each([['unlimited'], ['sınırsız'], ['Sınırsız'], ['Unlimited']])(
    'does NOT block legitimate structural descriptor: "%s"',
    (phrase) => {
      expect(checkProhibitedPhrase(`Liability coverage: ${phrase}`)).toBeNull()
    }
  )

  it('allows safe text through', () => {
    expect(
      checkProhibitedPhrase('Policy wording indicates coverage, subject to conditions')
    ).toBeNull()
  })

  it('allows Turkish safe text through', () => {
    expect(checkProhibitedPhrase('Poliçe kapsamı koşullara bağlıdır')).toBeNull()
  })
})

// ============================================================================
// DISPLAY INTERPRETER TESTS (Workstreams B, D, F)
// ============================================================================

describe('generateDisplaySafeSummary', () => {
  it('KASKO: rayiç değer displays as policy basis, not app-estimated payout', () => {
    const data = makeKaskoData()
    const analysis = generateAnalysisBundle('pol-1', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    expect(summary.protectionBasisCard).toBeDefined()
    expect(summary.protectionBasisCard!.basisType).toBe('market_value')
    expect(summary.protectionBasisCard!.body).toContain('market value')
    expect(summary.protectionBasisCard!.body).toContain('Rayiç Değer')
    expect(summary.protectionBasisCard!.statementType).toBe('confirmed_from_policy')
    // Must NOT contain app-estimated payout language
    expect(summary.protectionBasisCard!.body).not.toContain('we estimate')
    expect(summary.protectionBasisCard!.body).not.toContain('app calculates')
  })

  it('KASKO: conditional deductible does NOT become "no deductible"', () => {
    const data = makeKaskoData()
    const analysis = generateAnalysisBundle('pol-2', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    // Kasko coverage has deductible=0 → conditional wording
    const kaskoCov = summary.keyCoverageCards.find((c) => c.coverageName === 'Kasko')
    expect(kaskoCov).toBeDefined()
    expect(kaskoCov!.deductibleStatement).toBeDefined()
    expect(kaskoCov!.deductibleStatement!.toLowerCase()).not.toContain('no deductible')
    expect(kaskoCov!.conditionMarkers).toContain('deductible_conditional')
    expect(kaskoCov!.statementType).toBe('conditional_from_policy')
  })

  it('KASKO: unlimited coverage renders the Sınırsız signal + limit_conditional marker', () => {
    const data = makeKaskoData({
      // @ts-expect-error - mismatch due to schema update
      coverages: [{ name: 'Kasko', isMarketValue: true, isUnlimited: true, deductible: 0 }],
    })
    const analysis = generateAnalysisBundle('pol-3', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    const kaskoCov = summary.keyCoverageCards.find((c) => c.coverageName === 'Kasko')
    expect(kaskoCov).toBeDefined()
    // We intentionally preserve the "Sınırsız" signal instead of replacing it
    // with a hedge string — carve-outs (e.g. 2.5M TL cap at airports on IMM)
    // surface as a separate caveat, not by destroying the limit value.
    expect(kaskoCov!.limit).toContain('Sınırsız')
    expect(kaskoCov!.limit!.toLowerCase()).not.toContain('subject to sublimits')
    expect(kaskoCov!.conditionMarkers).toContain('limit_conditional')
  })

  it('KASKO: benchmark card is hidden when provenance insufficient', () => {
    const data = makeKaskoData({
      premium: null, // No premium → no benchmark
    })
    const analysis = generateAnalysisBundle('pol-4', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    expect(summary.benchmarkCards).toHaveLength(0)
  })

  it('KASKO: benchmark card shows when eligible with provenance', () => {
    const data = makeKaskoData()
    const analysis = generateAnalysisBundle('pol-5', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    expect(summary.benchmarkCards.length).toBeGreaterThan(0)
    for (const bc of summary.benchmarkCards) {
      expect(bc.statementType).toBe('app_benchmark')
      expect(bc.body).toContain('market comparison')
      expect(bc.body).toContain('not a contractual policy term')
      expect(bc.provenanceSummary).toContain('Source:')
    }
  })

  it('KASKO: missing/unclear clauses appear in Missing section', () => {
    const data = makeKaskoData({ currency: null })
    const warningValidation: ValidationResult = {
      isValid: false,
      // @ts-expect-error - mismatch due to schema update
      flags: [{ level: 'Warning', message: 'Unclear clause scope', ruleId: 'W1' }],
    }
    const analysis = generateAnalysisBundle('pol-6', data, warningValidation)
    const summary = generateDisplaySafeSummary(data, warningValidation, analysis)

    expect(summary.missingOrUnclearCards.length).toBeGreaterThan(0)
    const currencyMissing = summary.missingOrUnclearCards.find((c) => c.missingItem === 'currency')
    expect(currencyMissing).toBeDefined()
    expect(currencyMissing!.statementType).toBe('unclear_not_verified')
  })

  it('KASKO: high ambiguity triggers restricted mode', () => {
    const data = makeKaskoData({
      confidence: {
        overall: 0.55,
        premium: 0.55,
        coverages: 0.5,
        policyNumber: 0.7,
        provider: 0.7,
        dates: 0.7,
      },
      policyNumber: null, // Missing critical field → restricted
    })
    const warningValidation: ValidationResult = {
      isValid: false,
      flags: Array.from({ length: 6 }, (_, i) => ({
        level: 'Warning' as const,
        message: `Ambiguity ${i}`,
        ruleId: `W${i}`,
      })),
    }
    const analysis = generateAnalysisBundle('pol-7', data, warningValidation)
    const summary = generateDisplaySafeSummary(data, warningValidation, analysis)

    // Should be restricted (not human_review) because warnings don't trigger critical
    expect(['restricted', 'human_review_required']).toContain(summary.displayMode)
    expect(summary.reviewTriggers.length).toBeGreaterThan(0)
    expect(summary.displayWarnings.length).toBeGreaterThan(0)
  })

  it('KASKO: blocking errors trigger human_review_required mode', () => {
    const data = makeKaskoData({
      confidence: {
        overall: 0.3,
        premium: 0.3,
        coverages: 0.2,
        policyNumber: 0.3,
        provider: 0.3,
        dates: 0.3,
      },
    })
    const errorValidation: ValidationResult = {
      isValid: false,
      // @ts-expect-error - mismatch due to schema update
      flags: [{ level: 'Error', message: 'Critical data conflict', ruleId: 'E1' }],
    }
    const analysis = generateAnalysisBundle('pol-8', data, errorValidation)
    const summary = generateDisplaySafeSummary(data, errorValidation, analysis)

    expect(summary.displayMode).toBe('human_review_required')
    expect(summary.topSummary).toContain('human review')
    // Confirmed claims should be suppressed in human_review mode
    // There should be suppression records
    expect(summary.suppressedStatements.length).toBeGreaterThan(0)
  })

  it('generates complete summary structure', () => {
    const data = makeKaskoData()
    const analysis = generateAnalysisBundle('pol-9', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    // Top-level fields
    expect(summary.summaryVersion).toBe('1.0.0')
    expect(summary.policyId).toBe('pol-9')
    expect(summary.branch).toBe('kasko')
    expect(summary.displayMode).toBe('full')

    // Policy basics card
    expect(summary.policyBasicsCard.insurer).toBe('Test Sigorta A.Ş.')
    expect(summary.policyBasicsCard.branch).toBe('kasko')
    expect(summary.policyBasicsCard.policyNumber).toBe('K-2024-001')

    // Coverage cards correspond to coverages
    expect(summary.keyCoverageCards.length).toBe(3)

    // Source quote map
    expect(Array.isArray(summary.sourceQuoteMap)).toBe(true)

    // Suppressed statements tracked
    expect(Array.isArray(summary.suppressedStatements)).toBe(true)

    // Display warnings
    expect(Array.isArray(summary.displayWarnings)).toBe(true)
  })

  it('source quotes are mapped from evidence', () => {
    const data = makeKaskoData({
      evidence: {
        insights: [
          {
            text: 'Rayiç değer',
            textEn: 'Market value coverage',
            quote: 'Araç rayiç değeri üzerinden teminat altındadır',
          },
        ],
        exclusions: [
          {
            text: 'Alkol',
            textEn: 'Alcohol exclusion',
            quote: 'Alkollü araç kullanımı durumunda teminat dışıdır',
          },
        ],
      },
    })
    const analysis = generateAnalysisBundle('pol-10', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    expect(summary.sourceQuoteMap.length).toBe(2)
    expect(summary.sourceQuoteMap[0].snippet).toContain('rayiç değeri')
    expect(summary.sourceQuoteMap[1].snippet).toContain('Alkollü')
  })

  it('restriction cards are built from special conditions', () => {
    const data = makeKaskoData({
      specialConditions: [
        'Araç ticarî amaçla kullanılamaz',
        'Sadece sigortalı sürücü kullanabilir',
      ],
    })
    const analysis = generateAnalysisBundle('pol-11', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    expect(summary.conditionalRestrictionCards.length).toBe(2)
    expect(summary.conditionalRestrictionCards[0].statementType).toBe('conditional_from_policy')
  })

  it('claim risk cards include deductible risk when present', () => {
    const data = makeKaskoData({
      coverages: [
        // @ts-expect-error - mismatch due to schema update
        { name: 'Kasko', isMarketValue: true, deductible: 5000 },
        { name: 'IMM', limit: 10000000, deductible: 2000 },
      ],
    })
    const analysis = generateAnalysisBundle('pol-12', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    const dedRisk = summary.claimReductionRiskCards.find((c) =>
      c.riskDescription.includes('Deductible')
    )
    expect(dedRisk).toBeDefined()
  })

  it('no prohibited phrases appear in any card body', () => {
    const data = makeKaskoData({
      // @ts-expect-error - mismatch due to schema update
      coverages: [{ name: 'Kasko', isMarketValue: true, isUnlimited: true, deductible: 0 }],
    })
    const analysis = generateAnalysisBundle('pol-13', data, validValidation)
    const summary = generateDisplaySafeSummary(data, validValidation, analysis)

    const allBodies = [
      summary.topSummary,
      summary.policyBasicsCard.body,
      summary.protectionBasisCard?.body,
      ...summary.keyCoverageCards.map((c) => c.body),
      ...summary.conditionalRestrictionCards.map((c) => c.body),
      ...summary.claimReductionRiskCards.map((c) => c.body),
      ...summary.missingOrUnclearCards.map((c) => c.body),
      ...summary.benchmarkCards.map((c) => c.body),
    ].filter(Boolean)

    for (const body of allBodies) {
      expect(checkProhibitedPhrase(body!)).toBeNull()
    }
  })
})
