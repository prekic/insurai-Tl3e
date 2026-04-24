/**
 * Consumer Path Safety Tests
 *
 * Proves that all consumer-facing rendering paths consume
 * DisplaySafePolicySummary data from the display interpreter,
 * and that prohibited phrases cannot reach rendered output.
 */
import { describe, it, expect } from 'vitest'
import {
  generateDisplaySafeSummary,
  applySafeWording,
  checkProhibitedPhrase,
} from '../display-interpreter'
import { evaluateDisplayMode } from '../review-thresholds'
import { generateAnalysisBundle } from '../engine'

// ============================================================================
// Test fixtures — use the same factory as display-interpreter.test.ts
// ============================================================================

function makeExtraction(overrides: any = {}): any {
  return {
    policyType: 'kasko',
    policyNumber: 'K-2024-001',
    provider: 'AXA Sigorta',
    insuredName: 'Test User',
    insuredAddress: null,
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 15000,
    currency: 'TRY',
    paymentFrequency: null,
    coverages: [
      {
        name: 'Ana Teminat',
        nameTr: 'Ana Teminat',
        limit: 0,
        isUnlimited: false,
        isMarketValue: true,
        deductible: 0,
      },
      {
        name: 'Ferdi Kaza',
        nameTr: 'Ferdi Kaza',
        limit: 150000,
        isUnlimited: false,
        isMarketValue: false,
        deductible: 0,
      },
      {
        name: 'Hukuki Koruma',
        nameTr: 'Hukuki Koruma',
        limit: 50000,
        isUnlimited: false,
        isMarketValue: false,
        deductible: 1000,
      },
    ],
    specialConditions: [],
    exclusions: ['Alkol etkisi altında kaza / Accident under influence of alcohol'],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    confidence: {
      overall: 0.92,
      policyNumber: 0.95,
      provider: 0.95,
      dates: 0.95,
      premium: 0.95,
      coverages: 0.9,
    },
    ...overrides,
  }
}

const cleanValidation = { isValid: true, flags: [] }

// ============================================================================
// Display Interpreter is the sole source for consumer summary data
// ============================================================================

describe('Consumer Path Safety: Display Interpreter is Sole Source', () => {
  it('generateDisplaySafeSummary returns all required card categories', () => {
    const data = makeExtraction()
    const analysis = generateAnalysisBundle('test-1', data, cleanValidation)
    const summary = generateDisplaySafeSummary(data, cleanValidation, analysis)

    expect(summary).toBeDefined()
    expect(summary.displayMode).toBeDefined()
    expect(summary.topSummary).toBeDefined()
    expect(summary.policyBasicsCard).toBeDefined()
    expect(Array.isArray(summary.keyCoverageCards)).toBe(true)
    expect(Array.isArray(summary.conditionalRestrictionCards)).toBe(true)
    expect(Array.isArray(summary.missingOrUnclearCards)).toBe(true)
    expect(Array.isArray(summary.claimReductionRiskCards)).toBe(true)
    expect(Array.isArray(summary.benchmarkCards)).toBe(true)
    expect(Array.isArray(summary.suppressedStatements)).toBe(true)
    expect(Array.isArray(summary.reviewTriggers)).toBe(true)
  })

  it('coverage cards are correctly generated from extraction data', () => {
    const data = makeExtraction()
    const analysis = generateAnalysisBundle('test-2', data, cleanValidation)
    const summary = generateDisplaySafeSummary(data, cleanValidation, analysis)

    expect(summary.keyCoverageCards.length).toBe(3)
    const mainCoverage = summary.keyCoverageCards.find((c: any) => c.coverageName === 'Ana Teminat')
    expect(mainCoverage).toBeDefined()
    expect(mainCoverage!.body).toBeTruthy()
  })

  it('display mode is full when validation passes', () => {
    const data = makeExtraction()
    const analysis = generateAnalysisBundle('test-3', data, cleanValidation)
    const mode = evaluateDisplayMode(data, cleanValidation, analysis)
    expect(mode.mode).toBe('full')
    expect(mode.triggers.length).toBe(0)
  })

  it('display mode is restricted when validator errors are present', () => {
    const data = makeExtraction()
    const errorValidation = {
      isValid: false,
      flags: [
        {
          level: 'Error' as const,
          message: 'Missing critical field',
          ruleId: 'R001',
          field: 'premium',
        },
      ],
    }
    const analysis = generateAnalysisBundle('test-4', data, errorValidation)
    const mode = evaluateDisplayMode(data, errorValidation, analysis)
    // Errors are critical → human_review_required
    expect(['restricted', 'human_review_required']).toContain(mode.mode)
    expect(mode.triggers.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Prohibited phrases blocked in rendered output
// ============================================================================

describe('Consumer Path Safety: Prohibited Phrases Blocked in Rendered Output', () => {
  // v4: "unlimited" and "sınırsız" were intentionally removed from the
  // prohibited list. They're legitimate structural descriptors (IMM Sınırsız,
  // Artan Mali Sorumluluk Sınırsız) — hedging them destroyed signal users
  // rely on. Carve-outs are surfaced as separate caveat badges.
  const prohibitedPhrases = [
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
  ]

  for (const phrase of prohibitedPhrases) {
    it(`blocks prohibited phrase: "${phrase}"`, () => {
      const result = checkProhibitedPhrase(`This policy is ${phrase} for all scenarios`)
      expect(result).not.toBeNull()
    })
  }

  it('applySafeWording replaces prohibited phrases', () => {
    expect(applySafeWording('This policy is fully covered')).not.toContain('fully covered')
    expect(applySafeWording('No deductible applies')).not.toContain('no deductible')
  })

  it('v4: preserves structural "unlimited" / "Sınırsız" signal without hedging', () => {
    // The old blanket replacement rendered user-hostile output like
    // "Liability — Limit: Coverage subject to sublimits...". Now the
    // signal is preserved; carve-outs are caveat badges, not limit-value
    // replacements.
    expect(applySafeWording('Unlimited towing')).toContain('Unlimited')
    expect(applySafeWording('Unlimited towing')).not.toContain('subject to sublimits')
    expect(checkProhibitedPhrase('This policy is unlimited for all scenarios')).toBeNull()
  })

  it('no prohibited phrase appears in generated summary card bodies', () => {
    const data = makeExtraction()
    const analysis = generateAnalysisBundle('test-5', data, cleanValidation)
    const summary = generateDisplaySafeSummary(data, cleanValidation, analysis)

    const allCards = [
      ...(summary.policyBasicsCard ? [summary.policyBasicsCard] : []),
      ...(summary.protectionBasisCard ? [summary.protectionBasisCard] : []),
      ...summary.keyCoverageCards,
      ...summary.conditionalRestrictionCards,
      ...summary.missingOrUnclearCards,
      ...summary.claimReductionRiskCards,
      ...summary.benchmarkCards,
    ]

    for (const card of allCards) {
      const body = (card as any).body
      if (body) {
        for (const phrase of prohibitedPhrases) {
          expect(body.toLowerCase()).not.toContain(phrase.toLowerCase())
        }
      }
    }
  })
})

// ============================================================================
// Benchmark content stays structurally separate
// ============================================================================

describe('Consumer Path Safety: Benchmark Content Stays Structurally Separate', () => {
  it('benchmark cards have app_benchmark statement type when provenance is complete', () => {
    const data = makeExtraction()
    const analysis = generateAnalysisBundle('test-6', data, cleanValidation)
    const summary = generateDisplaySafeSummary(data, cleanValidation, analysis)

    // If benchmark cards are generated, they must be app_benchmark
    for (const card of summary.benchmarkCards) {
      expect(card.statementType).toBe('app_benchmark')
      expect(card.body).toContain('market comparison')
    }
  })
})

// ============================================================================
// Restricted and Human Review Modes
// ============================================================================

describe('Consumer Path Safety: Restricted and Human Review Modes', () => {
  it('restricted mode is triggered by low confidence', () => {
    const data = makeExtraction({
      confidence: {
        overall: 0.55,
        premium: 0.55,
        coverages: 0.5,
        policyNumber: 0.7,
        provider: 0.7,
        dates: 0.7,
      },
      policyNumber: null,
    })
    const errorValidation = {
      isValid: false,
      flags: [{ level: 'Warning' as const, message: 'Warning', ruleId: 'W1', field: 'f1' }],
    }
    const analysis = generateAnalysisBundle('test-7', data, errorValidation)
    const summary = generateDisplaySafeSummary(data, errorValidation, analysis)

    expect(['restricted', 'human_review_required']).toContain(summary.displayMode)
    expect(summary.reviewTriggers.length).toBeGreaterThan(0)
  })

  it('human_review_required mode generated by blocking errors', () => {
    const data = makeExtraction({
      confidence: {
        overall: 0.3,
        premium: 0.3,
        coverages: 0.2,
        policyNumber: 0.3,
        provider: 0.3,
        dates: 0.3,
      },
    })
    const errorValidation = {
      isValid: false,
      flags: [
        { level: 'Error' as const, message: 'E1', ruleId: 'R1', field: 'f1' },
        { level: 'Error' as const, message: 'E2', ruleId: 'R2', field: 'f2' },
      ],
    }
    const analysis = generateAnalysisBundle('test-8', data, errorValidation)
    const summary = generateDisplaySafeSummary(data, errorValidation, analysis)

    expect(summary.displayMode).toBe('human_review_required')
    expect(summary.reviewTriggers.length).toBeGreaterThan(0)
    expect(summary.topSummary).toContain('human review')
  })
})
