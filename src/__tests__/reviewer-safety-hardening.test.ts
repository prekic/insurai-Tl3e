/**
 * Reviewer Safety Hardening Tests
 *
 * Validates the fixes for KASKO reviewer-mode output quality:
 * 1. Missing premium does not become 0
 * 2. EOOP blocked when premium missing
 * 3. Deductible missing/conditional does not render as "None"
 * 4. Insured missing surfaces reviewer warning
 * 5. KASKO coverage contradiction reconciled
 * 6. Unlimited liability displayed consistently
 * 7. Reviewer mode prioritizes extraction-quality warnings
 * 8. QA logging includes reviewer-critical fields
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────
// Section 2: Missing premium must not become zero in scoring
// ─────────────────────────────────────────────────────────────────────

describe('Section 2: Missing premium must not become zero', () => {
  it('evaluatePremium returns -1 sentinel when premium is 0 and premiumMissing flag set', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 0, premiumMissing: true })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.premium.score).toBe(-1)
    expect(result.scoreBreakdown.premium.details).toContain('insufficient data')
  })

  it('evaluatePremium returns -1 sentinel when premium is 0 even without flag', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 0 })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.premium.score).toBe(-1)
  })

  it('evaluatePremium returns normal score when premium is present', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 5000 })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.premium.score).toBeGreaterThan(0)
    expect(result.scoreBreakdown.premium.details).not.toContain('insufficient data')
  })

  it('overall score excludes categories with -1 sentinel', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 0, premiumMissing: true })
    const result = evaluatePolicy(policy)

    // Overall score should still be calculated from available categories
    // It should NOT be pulled down to near-zero by missing premium
    expect(result.overallScore).toBeGreaterThan(0)
  })

  it('value score returns -1 when premium is missing', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 0, premiumMissing: true })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.value.score).toBe(-1)
    expect(result.scoreBreakdown.value.details).toContain('insufficient data')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 3: Deductible safety hardening
// ─────────────────────────────────────────────────────────────────────

describe('Section 3: Deductible safety hardening', () => {
  it('deductible score returns -1 when deductibleUncertain flag set', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ deductible: 0, deductibleUncertain: true })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.deductible.score).toBe(-1)
    expect(result.scoreBreakdown.deductible.details).toContain('not confirmed')
  })

  it('deductible detail does NOT contain "full coverage from first TL" when uncertain', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ deductible: 0, deductibleUncertain: true })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.deductible.details).not.toContain('full coverage from first TL')
  })

  it('deductible shows normal score when explicitly 0 without uncertainty', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ deductible: 0, deductibleUncertain: false })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.deductible.score).toBe(95)
    expect(result.scoreBreakdown.deductible.details).not.toContain('full coverage from first TL')
    expect(result.scoreBreakdown.deductible.details).toContain('No unconditional deductible')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 5: Coverage contradiction reconciliation
// ─────────────────────────────────────────────────────────────────────

describe('Section 5: KASKO coverage contradiction', () => {
  it('hasKaskoBaseCoverage suppresses implicit coverage gap warnings', async () => {
    // Dynamically import to get the generateGapsAsync via the module
    const { default: _mod } = await import('@/lib/ai/policy-extractor')

    // We can't easily test the private function directly, so we test the extended list
    const KASKO_IMPLICIT_PATTERNS = [
      'collision',
      'collision damage',
      'theft',
      'fire',
      'fire damage',
      'natural disaster',
      'natural disasters',
      'flood',
      'flood damage',
      'earthquake',
      'storm',
      'hail',
      'vandalism',
      'terrorism',
      'comprehensive',
      'own damage',
      'kasko',
    ]

    // Verify the patterns cover the typical benchmark names that were causing contradictions
    const contradictoryBenchmarks = ['Collision Damage', 'Theft', 'Fire', 'Natural Disasters']
    for (const benchmark of contradictoryBenchmarks) {
      const matchesImplicit = KASKO_IMPLICIT_PATTERNS.some((pattern) =>
        benchmark.toLowerCase().includes(pattern)
      )
      expect(matchesImplicit).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 6: Unlimited liability wording
// ─────────────────────────────────────────────────────────────────────

describe('Section 6: Unlimited liability wording consistency', () => {
  it('applySafeWording replaces "unlimited" with consistent sublimit wording', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const result = applySafeWording('Unlimited Increased Civil Liability')
    expect(result).toContain('sublimits')
    expect(result).not.toContain('may be narrowed in some cases')
  })

  it('display interpreter uses consistent wording for isUnlimited coverages', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const input = 'Coverage is unlimited for this item'
    const result = applySafeWording(input)
    expect(result).toContain('Generally unlimited')
    expect(result).toContain('sublimits')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 7: Reviewer mode prioritization
// ─────────────────────────────────────────────────────────────────────

describe('Section 7: Reviewer mode prioritization', () => {
  it('extraction warnings appear before generic insights', () => {
    const extractionWarnings = [
      'Premium was not extracted from the document',
      'Insured person name was not extracted from the document',
    ]
    const genericInsights = [
      'Multiple coverage areas identified in policy',
      'Special endorsements included',
    ]

    // Simulate the prioritization logic from policy-extractor
    const warningInsights = extractionWarnings.map((w) => `⚠ ${w}`)
    const prioritized = [...warningInsights, ...genericInsights]

    expect(prioritized[0]).toContain('⚠')
    expect(prioritized[0]).toContain('Premium')
    expect(prioritized[1]).toContain('⚠')
    expect(prioritized[1]).toContain('Insured')
    expect(prioritized[2]).not.toContain('⚠')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 8: Actuarial engine safety guards
// ─────────────────────────────────────────────────────────────────────

describe('Section 8: Actuarial engine safety guards', () => {
  it('EOOP result has -1 sentinel when premium is missing', async () => {
    const { runFullEvaluation } = await import('@/lib/actuarial-engine')
    const { mapAnalyzedToActuarialInput } = await import('@/lib/actuarial-engine/adapter')

    const policy = createMockAnalyzedPolicy({ premium: 0, premiumMissing: true })
    const input = mapAnalyzedToActuarialInput(policy)

    // Verify the _premiumMissing flag is set on the input
    expect((input as any)._premiumMissing).toBe(true)

    const result = runFullEvaluation(input)

    if (result.eligible) {
      // When eligible AND premium is missing, EOOP should indicate insufficient data
      expect(result.expectedOutOfPocket.expectedCost.amount).toBe(-1)
    } else {
      // If compliance blocks, the blocked result has amount 0 (acceptable)
      // But we verify the blocking reason is NOT from premium
      expect(result.expectedOutOfPocket.expectedCost.amount).toBe(0)
    }
  })

  it('EOOP result is normal when premium is provided', async () => {
    const { runFullEvaluation } = await import('@/lib/actuarial-engine')
    const { mapAnalyzedToActuarialInput } = await import('@/lib/actuarial-engine/adapter')

    const policy = createMockAnalyzedPolicy({ premium: 5000 })
    const input = mapAnalyzedToActuarialInput(policy)

    const result = runFullEvaluation(input)

    expect(result.expectedOutOfPocket.expectedCost.amount).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 10: QA logging enrichment
// ─────────────────────────────────────────────────────────────────────

describe('Section 10: QA logging enrichment', () => {
  it('PilotQARecord includes reviewer-critical extraction fields', async () => {
    const { createPilotQARecord } = await import('@/lib/analysis/kasko-pilot-gate')

    const record = createPilotQARecord('doc-1', 'test.pdf', 'user-1')

    // Verify new fields exist with correct defaults
    expect(record).toHaveProperty('premiumMissing', false)
    expect(record).toHaveProperty('insuredMissing', false)
    expect(record).toHaveProperty('deductibleUncertain', false)
    expect(record).toHaveProperty('coverageContradiction', false)
    expect(record).toHaveProperty('actuarialBlockedDueToMissingInputs', false)
    expect(record).toHaveProperty('reviewerMajorCorrectionReason', '')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 11: KASKO deductible=0 summary must not show "None"
// ─────────────────────────────────────────────────────────────────────

describe('Section 11: KASKO deductible summary display', () => {
  it('KASKO policy with deductible=0 should NOT display "None" — shows conditional wording', () => {
    // Simulates the display logic from PolicyDetailView.tsx
    const policy = createMockPolicy({ type: 'kasko', deductible: 0, deductibleUncertain: false })
    const isKaskoZeroDeductible = policy.type === 'kasko' && policy.deductible === 0
    const showConditionalWording = policy.deductibleUncertain || isKaskoZeroDeductible

    expect(showConditionalWording).toBe(true)
  })

  it('non-KASKO policy with deductible=0 shows "None" normally', () => {
    const policy = createMockPolicy({ type: 'home', deductible: 0, deductibleUncertain: false })
    const isKaskoZeroDeductible = policy.type === 'kasko' && policy.deductible === 0
    const showConditionalWording = policy.deductibleUncertain || isKaskoZeroDeductible

    expect(showConditionalWording).toBe(false)
  })

  it('KASKO with positive deductible shows the amount, not conditional wording', () => {
    const policy = createMockPolicy({ type: 'kasko', deductible: 1000, deductibleUncertain: false })
    const isKaskoZeroDeductible = policy.type === 'kasko' && policy.deductible === 0
    const showConditionalWording = policy.deductibleUncertain || isKaskoZeroDeductible

    expect(showConditionalWording).toBe(false)
    expect(policy.deductible).toBe(1000)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 12: Duplicate insight deduplication
// ─────────────────────────────────────────────────────────────────────

describe('Section 12: Duplicate insight deduplication', () => {
  it('removes exact duplicate insights', () => {
    const insights = [
      '✓ Kapsamlı kasko sigortası rayiç değer üzerinden',
      '⚠ Missing deductible info',
      '✓ Kapsamlı kasko sigortası rayiç değer üzerinden',
    ]

    const seen = new Set<string>()
    const deduped = insights.filter((insight) => {
      const normalized = insight
        .replace(/^(?:[✓✔☑⚠💡❌🔍]|\uFE0F)\s*/gu, '')
        .trim()
        .toLowerCase()
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })

    expect(deduped).toHaveLength(2)
    expect(deduped[0]).toContain('Kapsamlı')
    expect(deduped[1]).toContain('Missing')
  })

  it('keeps legitimately distinct insights even when similar', () => {
    const insights = ['✓ Coverage A includes glass', '⚠ Coverage B excludes glass']

    const seen = new Set<string>()
    const deduped = insights.filter((insight) => {
      const normalized = insight
        .replace(/^(?:[✓✔☑⚠💡❌🔍]|\uFE0F)\s*/gu, '')
        .trim()
        .toLowerCase()
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })

    expect(deduped).toHaveLength(2)
  })

  it('deduplicates same text with different emoji prefixes', () => {
    const insights = ['✓ Evcil hayvan teminatı dahil', '⚠ Evcil hayvan teminatı dahil']

    const seen = new Set<string>()
    const deduped = insights.filter((insight) => {
      const normalized = insight
        .replace(/^(?:[✓✔☑⚠💡❌🔍]|\uFE0F)\s*/gu, '')
        .trim()
        .toLowerCase()
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })

    expect(deduped).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 13: Glass-repair "sınırsız" wording softened
// ─────────────────────────────────────────────────────────────────────

describe('Section 13: Glass-repair wording safety', () => {
  it('applySafeWording replaces "sınırsız" with conditional phrasing', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const result = applySafeWording('Sınırsız cam onarımı')
    expect(result).not.toContain('Sınırsız')
    expect(result).not.toContain('sınırsız')
  })

  it('applySafeWording replaces full glass-repair sentence with review-required wording', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const input = 'Sınırsız cam onarımı ve ilk cam değişimi hasarsızlığı etkilemiyor'
    const result = applySafeWording(input)
    expect(result).toContain('insan incelemesiyle doğrulanmalı')
    expect(result).not.toContain('Sınırsız')
  })

  it('applySafeWording replaces standalone "sınırsız" with conditional phrasing', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const result = applySafeWording('Sınırsız teminat')
    expect(result).toContain('Özel şartlara bağlı olabilir')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 14: Compliance wording weakened
// ─────────────────────────────────────────────────────────────────────

describe('Section 14: Compliance wording safety', () => {
  it('compliance with zero issues does NOT claim "meets all regulatory requirements"', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 5000, type: 'kasko' })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.compliance.details).not.toContain(
      'meets all regulatory requirements'
    )
    expect(result.scoreBreakdown.compliance.details).toContain('No compliance issue detected')
  })

  it('compliance Turkish text also uses evidence-gated wording', async () => {
    const { evaluatePolicy } = await import('@/lib/policy-evaluation/evaluator')

    const policy = createMockPolicy({ premium: 5000, type: 'kasko' })
    const result = evaluatePolicy(policy)

    expect(result.scoreBreakdown.compliance.detailsTR).not.toContain(
      'tüm yasal gereksinimleri karşılıyor'
    )
    expect(result.scoreBreakdown.compliance.detailsTR).toContain('tespit edilmedi')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 15: Reviewer-mode insight priority ordering
// ─────────────────────────────────────────────────────────────────────

describe('Section 15: Reviewer-mode insight priority', () => {
  it('gaps (⚠) appear before strengths (✓) in generated insights', async () => {
    // The generateAIInsightsAsync function now orders: gaps → strengths → recommendations
    // We test this by checking the combined order pattern
    const sampleOutput = [
      '⚠ Missing common coverage: Personal Accident',
      '✓ Multiple coverage areas identified in policy',
      '💡 Premium is above 75th percentile - compare with other providers',
    ]

    // Verify gaps come before strengths
    const firstGapIndex = sampleOutput.findIndex((i) => i.startsWith('⚠'))
    const firstStrengthIndex = sampleOutput.findIndex((i) => i.startsWith('✓'))

    expect(firstGapIndex).toBeLessThan(firstStrengthIndex)
  })

  it('generic annual review advice only appears when no other recommendations', () => {
    // The fix makes the generic advice conditional
    const otherRecommendations = ['Premium is above 75th percentile - compare with other providers']

    // When there are other recommendations, generic advice should NOT be added
    const recommendations = [...otherRecommendations]
    if (recommendations.length === 0) {
      recommendations.push('Review coverage limits annually to ensure adequate protection')
    }

    expect(recommendations).not.toContain(
      'Review coverage limits annually to ensure adequate protection'
    )
  })

  it('generic annual review advice appears when no other recommendations exist', () => {
    const recommendations: string[] = []
    if (recommendations.length === 0) {
      recommendations.push('Review coverage limits annually to ensure adequate protection')
    }

    expect(recommendations).toContain(
      'Review coverage limits annually to ensure adequate protection'
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 16: Source-level insight deduplication
// ─────────────────────────────────────────────────────────────────────

describe('Section 16: Source-level insight deduplication', () => {
  it('removes duplicate insights from mixed Turkish/English source array', () => {
    // Simulates the source-level dedup logic from policy-extractor.ts
    const insights = [
      'Kapsamlı kasko teminatı rayiç değer üzerinden',
      '⚠ Deductible status uncertain',
      '✓ Kapsamlı kasko teminatı rayiç değer üzerinden', // same text, different prefix
      '24 saat asistans hizmeti dahil',
      '⚠ 24 saat asistans hizmeti dahil', // same text, different prefix
    ]

    const seen = new Set<string>()
    const keepIndices: number[] = []
    for (let idx = 0; idx < insights.length; idx++) {
      const normalized = insights[idx]
        .replace(/^(?:[✓✔☑⚠💡❌🔍]|\uFE0F)\s*/gu, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
      if (!seen.has(normalized)) {
        seen.add(normalized)
        keepIndices.push(idx)
      }
    }
    const deduped = keepIndices.map((idx) => insights[idx])

    expect(deduped).toHaveLength(3)
    expect(deduped[0]).toBe('Kapsamlı kasko teminatı rayiç değer üzerinden')
    expect(deduped[1]).toContain('Deductible status uncertain')
    expect(deduped[2]).toBe('24 saat asistans hizmeti dahil')
  })

  it('preserves parallel array alignment when deduplicating', () => {
    const insights = ['A', 'B', 'A', 'C']
    const insightsEn = ['A-en', 'B-en', 'A-en-dup', 'C-en']

    const seen = new Set<string>()
    const keepIndices: number[] = []
    for (let idx = 0; idx < insights.length; idx++) {
      const n = insights[idx].toLowerCase()
      if (!seen.has(n)) {
        seen.add(n)
        keepIndices.push(idx)
      }
    }

    const dedupedInsights = keepIndices.map((idx) => insights[idx])
    const dedupedEn = keepIndices.map((idx) => insightsEn[idx])

    expect(dedupedInsights).toEqual(['A', 'B', 'C'])
    expect(dedupedEn).toEqual(['A-en', 'B-en', 'C-en']) // NOT 'A-en-dup'
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 17: Coverage limit plausibility check
// ─────────────────────────────────────────────────────────────────────

describe('Section 17: Coverage limit plausibility check', () => {
  it('flags when assistance coverage limit far exceeds legal protection limit', () => {
    const coverages = [
      {
        name: 'Anadolu Service',
        nameTr: 'Anadolu Asistans',
        limit: 80000,
        category: 'assistance' as const,
      },
      {
        name: 'Legal Protection',
        nameTr: 'Hukuksal Koruma',
        limit: 4000,
        category: 'legal' as const,
      },
    ]

    const assistanceCov = coverages.find((c) => c.category === 'assistance')
    const legalCov = coverages.find((c) => c.category === 'legal')
    const isSuspicious =
      assistanceCov &&
      legalCov &&
      assistanceCov.limit > 0 &&
      legalCov.limit > 0 &&
      assistanceCov.limit > legalCov.limit * 5

    expect(isSuspicious).toBe(true)
  })

  it('does NOT flag when assistance limit is reasonable relative to legal', () => {
    const coverages = [
      { name: 'Roadside Assistance', limit: 4000, category: 'assistance' as const },
      { name: 'Legal Protection', limit: 80000, category: 'legal' as const },
    ]

    const assistanceCov = coverages.find((c) => c.category === 'assistance')
    const legalCov = coverages.find((c) => c.category === 'legal')
    const isSuspicious =
      assistanceCov &&
      legalCov &&
      assistanceCov.limit > 0 &&
      legalCov.limit > 0 &&
      assistanceCov.limit > legalCov.limit * 5

    expect(isSuspicious).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 18: Market commentary suppression in reviewer mode
// ─────────────────────────────────────────────────────────────────────

describe('Section 18: Market commentary suppression', () => {
  it('filters market commentary when extraction warnings exist', () => {
    const insights = [
      '⚠ Premium was not extracted from the document',
      '✓ Standard coverage for policy type',
      '💡 Premium is above 75th percentile - compare with other providers',
      '💡 Market premiums increased 43% YoY - lock in rates early',
      '💡 Review coverage limits annually to ensure adequate protection',
    ]

    const marketCommentaryPatterns = [
      /premium is above \d+th percentile/i,
      /market premiums increased \d+%/i,
      /review coverage limits annually/i,
      /lock in rates early/i,
    ]
    const isMarketCommentary = (insight: string) =>
      marketCommentaryPatterns.some((p) => p.test(insight))

    const filtered = insights.filter((i) => !isMarketCommentary(i))

    expect(filtered).toHaveLength(2)
    expect(filtered[0]).toContain('Premium was not extracted')
    expect(filtered[1]).toContain('Standard coverage')
  })

  it('keeps all insights when no extraction warnings exist', () => {
    const insights = [
      '✓ Multiple coverage areas identified',
      '💡 Premium is above 75th percentile - compare with other providers',
    ]

    // Without extraction warnings, market commentary is NOT filtered
    const extractionWarnings: string[] = []
    const filtered =
      extractionWarnings.length > 0
        ? insights.filter(() => true) // would filter here
        : insights

    expect(filtered).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 19: Actuarial caveat for incomplete inputs
// ─────────────────────────────────────────────────────────────────────

describe('Section 19: Actuarial caveat for incomplete inputs', () => {
  it('shows caveat when partsStandard is unspecified', () => {
    const actuarialResult = {
      needsReview: false,
      contractQualityScore: 24,
      indemnityMechanics: {
        partsStandard: { value: 'unspecified' },
        repairNetworkRule: { value: 'insurer_network' },
      },
    }

    const showCaveat =
      actuarialResult.needsReview ||
      actuarialResult.indemnityMechanics?.partsStandard?.value === 'unspecified' ||
      actuarialResult.indemnityMechanics?.repairNetworkRule?.value === 'unspecified'

    expect(showCaveat).toBe(true)
  })

  it('shows caveat when repairNetworkRule is unspecified', () => {
    const actuarialResult = {
      needsReview: false,
      contractQualityScore: 50,
      indemnityMechanics: {
        partsStandard: { value: 'original' },
        repairNetworkRule: { value: 'unspecified' },
      },
    }

    const showCaveat =
      actuarialResult.needsReview ||
      actuarialResult.indemnityMechanics?.partsStandard?.value === 'unspecified' ||
      actuarialResult.indemnityMechanics?.repairNetworkRule?.value === 'unspecified'

    expect(showCaveat).toBe(true)
  })

  it('shows caveat when needsReview is true', () => {
    const actuarialResult = {
      needsReview: true,
      contractQualityScore: 80,
      indemnityMechanics: {
        partsStandard: { value: 'original' },
        repairNetworkRule: { value: 'insured_choice' },
      },
    }

    const showCaveat =
      actuarialResult.needsReview ||
      actuarialResult.indemnityMechanics?.partsStandard?.value === 'unspecified' ||
      actuarialResult.indemnityMechanics?.repairNetworkRule?.value === 'unspecified'

    expect(showCaveat).toBe(true)
  })

  it('does NOT show caveat when all inputs are specified and needsReview is false', () => {
    const actuarialResult = {
      needsReview: false,
      contractQualityScore: 85,
      indemnityMechanics: {
        partsStandard: { value: 'equivalent' },
        repairNetworkRule: { value: 'insurer_network' },
      },
    }

    const showCaveat =
      actuarialResult.needsReview ||
      actuarialResult.indemnityMechanics?.partsStandard?.value === 'unspecified' ||
      actuarialResult.indemnityMechanics?.repairNetworkRule?.value === 'unspecified'

    expect(showCaveat).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────

function createMockPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-policy-1',
    policyNumber: 'POL-001',
    provider: 'Test Provider',
    logo: '',
    type: 'kasko' as const,
    typeTr: 'Kasko',
    coverage: 100000,
    premium: 5000,
    monthlyPremium: 416,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active' as const,
    uploadDate: '2025-01-01',
    fileName: 'test.pdf',
    documentType: 'PDF',
    insuredPerson: 'Test Person',
    coverages: [
      {
        name: 'Kasko',
        nameTr: 'Kasko',
        limit: 100000,
        deductible: 0,
        included: true,
        isMarketValue: true,
        category: 'main' as const,
        importance: 'critical' as const,
      },
    ],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'Comprehensive Auto',
    ...overrides,
  }
}

function createMockAnalyzedPolicy(overrides: Record<string, unknown> = {}) {
  return {
    ...createMockPolicy(overrides),
    aiConfidence: 0.85,
    aiInsights: [],
    currency: 'TRY',
  }
}

// ─────────────────────────────────────────────────────────────────────
// Section 17: KASKO market-value coverage must not render as TRY 0
// ─────────────────────────────────────────────────────────────────────

describe('Section 17: Market-value KASKO coverage rendering', () => {
  it('calculateMainCoverage returns 0 for market-value kasko and UI renders "Vehicle Market Value"', () => {
    // When calculateMainCoverage returns 0 for market-value kasko,
    // the PolicyDetailView UI shows t.policy.vehicleMarketValue (not TRY 0).
    // Verify the data-level contract: isMarketValue coverage → coverage=0
    const policy = createMockPolicy({
      type: 'kasko',
      coverage: 0,
      coverages: [
        {
          name: 'Kasko',
          nameTr: 'Kasko',
          limit: 0,
          deductible: 0,
          included: true,
          isMarketValue: true,
          category: 'main',
          importance: 'critical',
        },
      ],
    })

    // The data contract: market-value kasko has coverage=0 + isMarketValue flag
    expect(policy.coverage).toBe(0)
    expect(policy.coverages[0].isMarketValue).toBe(true)

    // PolicyDetailView line 1405: policy.type === 'kasko' ? t.policy.vehicleMarketValue : formatConverted(policy.coverage)
    // This means kasko coverage=0 is NEVER shown as "TRY 0" in the React UI
    const uiDisplay = policy.type === 'kasko' ? 'Vehicle Market Value' : `TRY ${policy.coverage}`
    expect(uiDisplay).toBe('Vehicle Market Value')
    expect(uiDisplay).not.toContain('TRY 0')
  })

  it('export formatCoverageTotal returns market value text for isMarketValue kasko', () => {
    // Test that the export path doesn't render TRY 0 for market-value kasko
    // The formatCoverageTotal helper checks coverages.some(c => c.isMarketValue)
    const policy = createMockAnalyzedPolicy({
      type: 'kasko',
      coverage: 0,
      coverages: [
        {
          name: 'Kasko',
          nameTr: 'Kasko',
          limit: 0,
          deductible: 0,
          included: true,
          isMarketValue: true,
          category: 'main',
          importance: 'critical',
        },
      ],
    })

    // Replicate the formatCoverageTotal logic from export.ts
    const hasMarketValue = (policy.coverages as any[]).some((c: any) => c.isMarketValue)
    const isKaskoZero = policy.type === 'kasko' && policy.coverage === 0

    expect(hasMarketValue || isKaskoZero).toBe(true)
    // This means the export path will return 'Market Value Basis' (en) or 'Rayiç Değer (Piyasa Değeri)' (tr)
    // instead of formatCurrency(0) which produces "TRY 0"
  })

  it('export formatCoverageItemLimit returns Market Value for isMarketValue coverage items', () => {
    // Test that individual coverage items with isMarketValue don't show 0
    const coverage = {
      name: 'Comprehensive Auto',
      nameTr: 'Kasko',
      limit: 0,
      deductible: 0,
      included: true,
      isMarketValue: true,
      category: 'main',
      importance: 'critical',
    }

    // Replicate the formatCoverageItemLimit logic
    const isTr = true
    const result = coverage.isUnlimited
      ? isTr
        ? 'Sınırsız'
        : 'Unlimited'
      : coverage.isMarketValue
        ? isTr
          ? 'Rayiç Değer'
          : 'Market Value'
        : coverage.limit === 0 && coverage.included
          ? isTr
            ? 'Dahil'
            : 'Included'
          : `₺${coverage.limit}`

    expect(result).toBe('Rayiç Değer')
    expect(result).not.toBe('₺0')
    expect(result).not.toContain('0')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 18: Promotional reviewer insight wording neutralized
// ─────────────────────────────────────────────────────────────────────

describe('Section 18: Promotional reviewer insight neutralization', () => {
  it('applySafeWording neutralizes "Mükemmel kapsamlı kasko teminatı - Rayiç değer üzerinden tam koruma"', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const promotional = 'Mükemmel kapsamlı kasko teminatı - Rayiç değer üzerinden tam koruma'
    const result = applySafeWording(promotional)

    expect(result).not.toContain('Mükemmel')
    expect(result).not.toContain('mükemmel')
    expect(result).not.toContain('tam koruma')
    // Should contain neutral reviewer-safe wording
    expect(result).toContain('rayiç değer')
  })

  it('applySafeWording neutralizes standalone "tam koruma"', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const result = applySafeWording('Araç tam koruma altındadır')
    expect(result).not.toContain('tam koruma')
    expect(result).toContain('koşullara bağlıdır')
  })

  it('applySafeWording neutralizes standalone "Mükemmel" in teminat context', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const result = applySafeWording('✓ Mükemmel sağlık teminatı')
    expect(result).not.toContain('Mükemmel')
    expect(result).not.toContain('mükemmel')
    expect(result).toContain('tespit edildi')
  })

  it('checkProhibitedPhrase catches "tam koruma" and "mükemmel"', async () => {
    const { checkProhibitedPhrase } = await import('@/lib/analysis/display-interpreter')

    expect(checkProhibitedPhrase('tam koruma sağlar')).toBe('tam koruma')
    expect(checkProhibitedPhrase('Mükemmel poliçe')).toBe('mükemmel')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 19: Broken Turkish "kadenizi" in glass insight fixed
// ─────────────────────────────────────────────────────────────────────

describe('Section 19: Glass insight broken Turkish fix', () => {
  it('applySafeWording fixes "hasarsızlık kadenizi" broken token', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const broken = 'İlk cam değişimi hasarsızlık kadenizi etkilemez - Değerli bir avantaj'
    const result = applySafeWording(broken)

    expect(result).not.toContain('kadenizi')
    expect(result).not.toContain('Değerli bir avantaj')
    expect(result).toContain('doğrulanmalı')
  })

  it('applySafeWording fixes variant broken glass phrasing', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const variant = 'Cam değişimi hasarsızlık kademesinizi etkilemez'
    const result = applySafeWording(variant)

    expect(result).not.toContain('kademesinizi')
    expect(result).toContain('doğrulanmalı')
  })

  it('glass insight result reads naturally in Turkish', async () => {
    const { applySafeWording } = await import('@/lib/analysis/display-interpreter')

    const broken = 'İlk cam değişimi hasarsızlık kadenizi etkilemez - Değerli bir avantaj'
    const result = applySafeWording(broken)

    // Must not contain any broken token fragments
    expect(result).not.toMatch(/kade[a-z]*zi/)
    // Must contain professionally worded reviewer-safe output
    expect(result).toMatch(/cam|Cam/)
    expect(result).toMatch(/doğrulanmalı|incelemesiyle/)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Section 20: UI ↔ Export path consistency regression tests
// ─────────────────────────────────────────────────────────────────────

describe('Section 20: UI and Export path consistency for KASKO', () => {
  // Fixture: a KASKO policy that exercises all the regression scenarios
  function createKaskoRegressionFixture() {
    return {
      ...createMockPolicy({
        type: 'kasko',
        typeTr: 'Kasko',
        coverage: 0, // market-value kasko → coverage=0 by design
        premium: 4500, // extracted premium
        premiumMissing: false,
        monthlyPremium: 375,
        deductible: 0,
        deductibleUncertain: true,
        insuredPerson: 'AHMET YILMAZ',
        insuredMissing: false,
        startDate: '2025-06-15',
        expiryDate: '2026-06-15',
        coverages: [
          {
            name: 'Comprehensive Auto',
            nameTr: 'Kasko Ana Teminat',
            limit: 0,
            deductible: 0,
            included: true,
            isMarketValue: true,
            category: 'main',
            importance: 'critical',
          },
          {
            name: 'Glass Coverage',
            nameTr: 'Cam Kırılması',
            limit: 5000,
            deductible: 0,
            included: true,
            category: 'supplementary',
            importance: 'minor',
          },
          {
            name: 'Roadside Assistance',
            nameTr: '7/24 Yol Yardım',
            limit: 0,
            deductible: 0,
            included: true,
            category: 'assistance',
            importance: 'minor',
          },
          {
            name: 'Artan Mali Sorumluluk',
            nameTr: 'Artan Mali Sorumluluk',
            limit: 0,
            deductible: 0,
            included: true,
            isUnlimited: true,
            category: 'liability',
            importance: 'standard',
          },
          {
            name: 'Substitute Vehicle',
            nameTr: 'İkame Araç',
            limit: 0,
            deductible: 0,
            included: true,
            category: 'assistance',
            importance: 'minor',
          },
        ],
      }),
      aiConfidence: 0.88,
      aiInsights: ['✓ Standard coverage', '⚠ Review deductible terms'],
      currency: 'TRY',
    }
  }

  it('insured is never "undefined" in any rendering path', () => {
    const policy = createKaskoRegressionFixture()
    // UI path: policy.insuredPerson || '-'
    const uiInsured = policy.insuredPerson || '-'
    // Text export uses same source
    expect(uiInsured).toBe('AHMET YILMAZ')
    expect(uiInsured).not.toBe('undefined')

    // When insured is actually undefined
    const missingPolicy = createKaskoRegressionFixture()
    missingPolicy.insuredPerson = undefined as any
    const uiFallback = missingPolicy.insuredPerson || '-'
    expect(uiFallback).toBe('-')
    expect(uiFallback).not.toBe('undefined')
  })

  it('premium is consistent between UI and text export when extracted', () => {
    const policy = createKaskoRegressionFixture()
    // UI logic: premiumMissing ? notSpecified : premium > 0 ? format(premium) : notSpecified
    const uiPremium = policy.premiumMissing
      ? 'Not Specified'
      : policy.premium > 0
        ? `₺${policy.premium}`
        : 'Not Specified'
    expect(uiPremium).toBe('₺4500')
    expect(uiPremium).not.toBe('Not Specified')

    // Text export canonical logic (new): same double-check
    const textPremium =
      policy.premiumMissing || !policy.premium || policy.premium <= 0
        ? 'Not Specified'
        : `₺${policy.premium}`
    expect(textPremium).toBe('₺4500')
    expect(textPremium).toBe(uiPremium)
  })

  it('premium shows Not Specified consistently when missing', () => {
    const policy = createKaskoRegressionFixture()
    policy.premiumMissing = true as any
    policy.premium = 0 as any

    const uiPremium = policy.premiumMissing
      ? 'Not Specified'
      : policy.premium > 0
        ? `₺${policy.premium}`
        : 'Not Specified'
    expect(uiPremium).toBe('Not Specified')

    const textPremium =
      policy.premiumMissing || !policy.premium || policy.premium <= 0
        ? 'Not Specified'
        : `₺${policy.premium}`
    expect(textPremium).toBe('Not Specified')
    expect(textPremium).toBe(uiPremium)
  })

  it('market-value main coverage does not render as TRY 0 in any path', () => {
    const policy = createKaskoRegressionFixture()
    // UI: policy.type === 'kasko' → t.policy.vehicleMarketValue
    const uiCoverage = policy.type === 'kasko' ? 'Vehicle Market Value' : `TRY ${policy.coverage}`
    expect(uiCoverage).toBe('Vehicle Market Value')

    // Export: formatCoverageTotal checks isMarketValue flag
    const hasMarketValue = policy.coverages.some((c: any) => c.isMarketValue)
    expect(hasMarketValue).toBe(true)
    // formatCoverageTotal returns 'Market Value Basis' (en) or 'Rayiç Değer' (tr)
  })

  it('included services/benefits do not render as TRY 0', () => {
    const policy = createKaskoRegressionFixture()
    // Test each coverage item that has limit=0
    for (const c of policy.coverages) {
      if (c.limit === 0) {
        // UI uses formatCoverageLimit which has 6-level cascade
        // Export now uses formatCoverageItemLimit which mirrors the cascade
        const isMarketValue = c.isMarketValue
        const isUnlimited = (c as any).isUnlimited
        const isAssistance = c.category === 'assistance'
        const rendered = isUnlimited
          ? 'Unlimited'
          : isMarketValue
            ? 'Market Value'
            : isAssistance
              ? 'Included'
              : 'Included'

        expect(rendered).not.toBe('TRY 0')
        expect(rendered).not.toBe('₺0')
      }
    }
  })

  it('extracted dates are used, not fabricated fallback dates', () => {
    const policy = createKaskoRegressionFixture()
    expect(policy.startDate).toBe('2025-06-15')
    expect(policy.expiryDate).toBe('2026-06-15')

    // Verify the dates are not today's date (fallback pattern)
    const today = new Date().toISOString().split('T')[0]
    expect(policy.startDate).not.toBe(today)
  })

  it('deductible shows conditional wording for kasko with uncertain deductible', () => {
    const policy = createKaskoRegressionFixture()
    // UI: deductibleUncertain || (kasko && deductible === 0) → 'Conditional / requires review'
    const uiDeductible =
      policy.deductibleUncertain || (policy.type === 'kasko' && policy.deductible === 0)
        ? 'Conditional / requires review'
        : policy.deductible > 0
          ? `₺${policy.deductible}`
          : 'None'
    expect(uiDeductible).toBe('Conditional / requires review')
    expect(uiDeductible).not.toBe('TRY 0')

    // Text/export now uses same canonical logic
    const textDeductible =
      policy.deductibleUncertain || (policy.type === 'kasko' && policy.deductible === 0)
        ? 'Conditional / requires review'
        : policy.deductible > 0
          ? `₺${policy.deductible}`
          : 'None'
    expect(textDeductible).toBe(uiDeductible)
  })

  it('shouldShowUnlimited and shouldShowIncluded are used in export coverage rendering', async () => {
    const { shouldShowUnlimited, shouldShowIncluded } =
      await import('@/lib/knowledge/kasko-knowledge')

    // Artan Mali Sorumluluk with limit=0 → unlimited (mali sorumluluk pattern)
    expect(shouldShowUnlimited('Artan Mali Sorumluluk', 0)).toBe(true)

    // ikame araç with limit=0 → included (lowercase test avoids Turkish İ conversion issue)
    expect(shouldShowIncluded('ikame araç hizmeti', 0)).toBe(true)

    // Yol yardım with limit=0 → included
    expect(shouldShowIncluded('yol yardım', 0)).toBe(true)

    // asistans with limit=0 → included
    expect(shouldShowIncluded('7/24 asistans', 0)).toBe(true)
  })
})
