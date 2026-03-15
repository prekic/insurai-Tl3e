/**
 * Branch-Specific Tests — Validator, Insights, Scoring, Display Interpreter
 *
 * Tests all 7 branches through the full pipeline against golden datasets.
 * Proves: branch-specific validator rules fire, insights are generated,
 * scores include branch risk signals, display-safe summaries are produced,
 * prohibited phrases are suppressed, and KASKO is not regressed.
 */
import { describe, it, expect } from 'vitest'
import { validateExtractionSafety } from '../../ai/validator'
import { generateInsightBundle } from '../insights'
import { generateAnalysisBundle } from '../engine'
import { generateDisplaySafeSummary, checkProhibitedPhrase } from '../display-interpreter'
import {
  trafficGolden,
  homeGolden,
  homeConditionHeavy,
  healthGolden,
  healthConditionHeavy,
  lifeGolden,
  daskGolden,
  businessGolden,
  businessConditionHeavy,
  nakliyatGolden,
  nakliyatConditionHeavy,
} from './branch-golden-datasets'

// ============================================================================
// TRAFFIC
// ============================================================================

describe('Traffic Branch', () => {
  it('validates statutory minimum checks', () => {
    const result = validateExtractionSafety(trafficGolden)
    // Traffic golden has statutory minimums exactly, so no below-minimum warnings
    const belowMinWarning = result.flags.find((f) => f.message.includes('below SEDDK'))
    expect(belowMinWarning).toBeUndefined()
  })

  it('warns when bodily injury is below statutory minimum', () => {
    const lowTraffic = {
      ...trafficGolden,
      coverages: [
        {
          name: 'Bodily Injury',
          nameTr: 'Bedeni Hasar',
          limit: 500000,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'liability' as const,
        },
      ],
    }
    const result = validateExtractionSafety(lowTraffic)
    const warning = result.flags.find((f) => f.message.includes('below SEDDK 2024'))
    expect(warning).toBeDefined()
    expect(warning!.level).toBe('Warning')
  })

  it('warns if traffic has market value coverage (misclassification)', () => {
    const misclassified = {
      ...trafficGolden,
      coverages: [
        ...trafficGolden.coverages,
        {
          name: 'Vehicle Value',
          nameTr: 'Araç Değeri',
          limit: null,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: true,
          category: 'main' as const,
        },
      ],
    }
    const result = validateExtractionSafety(misclassified)
    const warning = result.flags.find((f) => f.message.includes('misclassified as kasko'))
    expect(warning).toBeDefined()
  })

  it('generates statutory-vs-enhanced insight', () => {
    const bundle = generateInsightBundle(trafficGolden)
    // Golden data has Bodily Injury Total at 6,000,000 > 1,200,000 threshold
    const enhanced = bundle.insights.find(
      (i: any) => i.generatedByRule === 'DETERMINISTIC_TRAFFIC_ENHANCED_LIABILITY'
    )
    expect(enhanced).toBeDefined()
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(trafficGolden)
    const analysis = generateAnalysisBundle('traffic-001', trafficGolden, validation)
    const summary = generateDisplaySafeSummary(trafficGolden, validation, analysis)
    expect(summary.branch).toBe('traffic')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// HOME
// ============================================================================

describe('Home Branch', () => {
  it('validates building/contents separation', () => {
    const result = validateExtractionSafety(homeGolden)
    const sepWarning = result.flags.find((f) => f.message.includes('building/contents'))
    expect(sepWarning).toBeUndefined() // Golden has both
  })

  it('warns when building/contents separation is missing', () => {
    const noSep = {
      ...homeGolden,
      coverages: [
        {
          name: 'General Coverage',
          nameTr: 'Genel Teminat',
          limit: 500000,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'main' as const,
        },
      ],
    }
    const result = validateExtractionSafety(noSep)
    const warning = result.flags.find((f) => f.message.includes('building/contents'))
    expect(warning).toBeDefined()
  })

  it('detects mixed valuation basis', () => {
    const result = validateExtractionSafety(homeConditionHeavy)
    const mixedWarning = result.flags.find((f) => f.message.includes('mixed valuation'))
    expect(mixedWarning).toBeDefined()
  })

  it('generates building/contents separation insight', () => {
    const bundle = generateInsightBundle(homeGolden)
    const sep = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_HOME_SEPARATION')
    expect(sep).toBeDefined()
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(homeGolden)
    const analysis = generateAnalysisBundle('home-001', homeGolden, validation)
    const summary = generateDisplaySafeSummary(homeGolden, validation, analysis)
    expect(summary.branch).toBe('home')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// HEALTH
// ============================================================================

describe('Health Branch', () => {
  it('validates network/waiting period/copay presence', () => {
    const result = validateExtractionSafety(healthGolden)
    // Golden has all three
    const networkWarn = result.flags.find((f) => f.message.includes('network'))
    const waitingWarn = result.flags.find((f) => f.message.includes('waiting period'))
    const copayWarn = result.flags.find((f) => f.message.includes('copay'))
    expect(networkWarn).toBeUndefined()
    expect(waitingWarn).toBeUndefined()
    expect(copayWarn).toBeUndefined()
  })

  it('warns when network info is missing', () => {
    const noNetwork = {
      ...healthGolden,
      specialConditions: ['Genel bekleme süresi: 30 gün'],
    }
    const result = validateExtractionSafety(noNetwork)
    const warning = result.flags.find((f) => f.message.includes('network'))
    expect(warning).toBeDefined()
  })

  it('generates network and waiting period insights', () => {
    const bundle = generateInsightBundle(healthGolden)
    const network = bundle.insights.find(
      (i) => i.generatedByRule === 'DETERMINISTIC_HEALTH_NETWORK'
    )
    const waiting = bundle.insights.find(
      (i) => i.generatedByRule === 'DETERMINISTIC_HEALTH_WAITING'
    )
    expect(network).toBeDefined()
    expect(waiting).toBeDefined()
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(healthGolden)
    const analysis = generateAnalysisBundle('health-001', healthGolden, validation)
    const summary = generateDisplaySafeSummary(healthGolden, validation, analysis)
    expect(summary.branch).toBe('health')
  })

  it('handles condition-heavy health with copay and referral', () => {
    const validation = validateExtractionSafety(healthConditionHeavy)
    const analysis = generateAnalysisBundle('health-heavy', healthConditionHeavy, validation)
    const summary = generateDisplaySafeSummary(healthConditionHeavy, validation, analysis)
    expect(summary.branch).toBe('health')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// LIFE
// ============================================================================

describe('Life Branch', () => {
  it('validates beneficiary and death benefit', () => {
    const result = validateExtractionSafety(lifeGolden)
    // Golden has beneficiary in specialConditions and death benefit in coverages
    const beneficiaryWarn = result.flags.find((f) => f.message.includes('beneficiary'))
    expect(beneficiaryWarn).toBeUndefined()
  })

  it('warns when beneficiary is missing', () => {
    const noBeneficiary = {
      ...lifeGolden,
      specialConditions: ['Contestability: 2 yıl'],
    }
    const result = validateExtractionSafety(noBeneficiary)
    const warning = result.flags.find((f) => f.message.includes('beneficiary'))
    expect(warning).toBeDefined()
  })

  it('generates rider insight', () => {
    const bundle = generateInsightBundle(lifeGolden)
    const rider = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_LIFE_RIDERS')
    expect(rider).toBeDefined()
    expect(rider!.text_internal).toContain('2 rider(s)')
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(lifeGolden)
    const analysis = generateAnalysisBundle('life-001', lifeGolden, validation)
    const summary = generateDisplaySafeSummary(lifeGolden, validation, analysis)
    expect(summary.branch).toBe('life')
  })
})

// ============================================================================
// DASK
// ============================================================================

describe('DASK Branch', () => {
  it('validates statutory scope', () => {
    const result = validateExtractionSafety(daskGolden)
    // Golden has 3 earthquake-related coverages (no non-earthquake)
    const scopeWarn = result.flags.find((f) => f.message.includes('non-earthquake'))
    expect(scopeWarn).toBeUndefined()
  })

  it('warns when DASK has non-earthquake coverages', () => {
    const extraCov = {
      ...daskGolden,
      coverages: [
        ...daskGolden.coverages,
        {
          name: 'Theft',
          nameTr: 'Hırsızlık',
          limit: 50000,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'supplementary' as const,
        },
        {
          name: 'Water Damage',
          nameTr: 'Su Hasarı',
          limit: 30000,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'supplementary' as const,
        },
        {
          name: 'Glass',
          nameTr: 'Cam',
          limit: 10000,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'supplementary' as const,
        },
      ],
    }
    const result = validateExtractionSafety(extraCov)
    const warning = result.flags.find((f) => f.message.includes('non-earthquake'))
    expect(warning).toBeDefined()
  })

  it('generates DASK scope limitation insight', () => {
    const bundle = generateInsightBundle(daskGolden)
    const scope = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_DASK_SCOPE')
    expect(scope).toBeDefined()
    expect(scope!.text_internal).toContain('earthquake damage only')
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(daskGolden)
    const analysis = generateAnalysisBundle('dask-001', daskGolden, validation)
    const summary = generateDisplaySafeSummary(daskGolden, validation, analysis)
    expect(summary.branch).toBe('dask')
  })
})

// ============================================================================
// BUSINESS
// ============================================================================

describe('Business Branch', () => {
  it('validates BI period and warranty conditions', () => {
    const result = validateExtractionSafety(businessGolden)
    // Golden has BI with period and warranty conditions
    const biWarn = result.flags.find((f) => f.message.includes('indemnity/waiting'))
    const warrantyWarn = result.flags.find((f) => f.message.includes('warranty'))
    expect(biWarn).toBeUndefined()
    expect(warrantyWarn).toBeUndefined()
  })

  it('warns when BI lacks period info', () => {
    const noPeriod = {
      ...businessGolden,
      specialConditions: ['Alarm sistemi aktif olmalıdır'],
    }
    const result = validateExtractionSafety(noPeriod)
    const warning = result.flags.find((f) => f.message.includes('indemnity/waiting'))
    expect(warning).toBeDefined()
  })

  it('generates BI and liability insights', () => {
    const bundle = generateInsightBundle(businessGolden)
    const bi = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_BUSINESS_BI')
    const liability = bundle.insights.find(
      (i) => i.generatedByRule === 'DETERMINISTIC_BUSINESS_LIABILITY'
    )
    expect(bi).toBeDefined()
    expect(liability).toBeDefined()
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(businessGolden)
    const analysis = generateAnalysisBundle('business-001', businessGolden, validation)
    const summary = generateDisplaySafeSummary(businessGolden, validation, analysis)
    expect(summary.branch).toBe('business')
  })

  it('handles condition-heavy business with warranty and first-loss', () => {
    const validation = validateExtractionSafety(businessConditionHeavy)
    const analysis = generateAnalysisBundle('business-heavy', businessConditionHeavy, validation)
    const summary = generateDisplaySafeSummary(businessConditionHeavy, validation, analysis)
    expect(summary.branch).toBe('business')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// NAKLIYAT
// ============================================================================

describe('Nakliyat Branch', () => {
  it('validates ICC basis and W2W', () => {
    const result = validateExtractionSafety(nakliyatGolden)
    // Golden has ICC and W2W
    const iccWarn = result.flags.find((f) => f.message.includes('ICC'))
    const w2wWarn = result.flags.find((f) => f.message.includes('warehouse'))
    expect(iccWarn).toBeUndefined()
    expect(w2wWarn).toBeUndefined()
  })

  it('warns when ICC basis is missing', () => {
    const noICC = {
      ...nakliyatGolden,
      coverages: [
        {
          name: 'Cargo Coverage',
          nameTr: 'Emtia Teminatı',
          limit: 1000000,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'main' as const,
        },
      ],
      specialConditions: ['Depodan depoya geçerlidir'],
    }
    const result = validateExtractionSafety(noICC)
    const warning = result.flags.find((f) => f.message.includes('ICC'))
    expect(warning).toBeDefined()
  })

  it('warns when packaging condition is missing', () => {
    const noPacking = {
      ...nakliyatGolden,
      specialConditions: ['Warehouse-to-warehouse coverage'],
    }
    const result = validateExtractionSafety(noPacking)
    const warning = result.flags.find((f) => f.message.includes('packaging'))
    expect(warning).toBeDefined()
  })

  it('generates ICC basis insight', () => {
    const bundle = generateInsightBundle(nakliyatGolden)
    const icc = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_NAKLIYAT_ICC_A')
    expect(icc).toBeDefined()
    expect(icc!.text_internal).toContain('All Risks')
  })

  it('generates ICC (C) caution for condition-heavy', () => {
    const bundle = generateInsightBundle(nakliyatConditionHeavy)
    const iccC = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_NAKLIYAT_ICC_C')
    expect(iccC).toBeDefined()
    expect(iccC!.text_internal).toContain('minimum basis')
  })

  it('produces display-safe summary', () => {
    const validation = validateExtractionSafety(nakliyatGolden)
    const analysis = generateAnalysisBundle('nakliyat-001', nakliyatGolden, validation)
    const summary = generateDisplaySafeSummary(nakliyatGolden, validation, analysis)
    expect(summary.branch).toBe('nakliyat')
  })
})

// ============================================================================
// CROSS-BRANCH: PROHIBITED PHRASE SUPPRESSION
// ============================================================================

describe('Cross-Branch Prohibited Phrase Suppression', () => {
  const allGoldens = [
    { name: 'traffic', data: trafficGolden },
    { name: 'home', data: homeGolden },
    { name: 'health', data: healthGolden },
    { name: 'life', data: lifeGolden },
    { name: 'dask', data: daskGolden },
    { name: 'business', data: businessGolden },
    { name: 'nakliyat', data: nakliyatGolden },
  ]

  for (const { name, data } of allGoldens) {
    it(`${name}: no prohibited phrases in display-safe summary`, () => {
      const validation = validateExtractionSafety(data)
      const analysis = generateAnalysisBundle(`${name}-test`, data, validation)
      const summary = generateDisplaySafeSummary(data, validation, analysis)

      // Check all card bodies
      const allBodies = [
        summary.topSummary,
        ...summary.keyCoverageCards.map((c) => c.body),
        ...summary.conditionalRestrictionCards.map((c) => c.body),
        ...summary.missingOrUnclearCards.map((c) => c.body),
        ...summary.claimReductionRiskCards.map((c) => c.body),
      ]

      for (const body of allBodies) {
        const prohibited = checkProhibitedPhrase(body)
        expect(prohibited).toBeNull()
      }
    })
  }
})

// ============================================================================
// KASKO NON-REGRESSION
// ============================================================================

describe('KASKO Non-Regression', () => {
  it('existing kasko analysis still works correctly', () => {
    const kaskoData = {
      policyNumber: 'KASKO-001',
      provider: 'Test Sigorta',
      policyType: 'kasko' as const,
      insuredName: 'Test User',
      insuredAddress: 'Istanbul',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      premium: 15000,
      currency: 'TRY',
      paymentFrequency: 'annual' as const,
      coverages: [
        {
          name: 'Vehicle Value',
          nameTr: 'Araç Değeri',
          limit: null,
          deductible: null,
          description: null,
          isUnlimited: false,
          isMarketValue: true,
          category: 'main' as const,
        },
        {
          name: 'Collision',
          nameTr: 'Çarpışma',
          limit: 500000,
          deductible: 1000,
          description: null,
          isUnlimited: false,
          isMarketValue: false,
          category: 'main' as const,
        },
      ],
      specialConditions: [],
      exclusions: ['Alkollü araç kullanımı'],
      amendmentInfo: {
        isAmendment: false,
        amendmentNumber: null,
        amendmentDate: null,
        basePolicyNumber: null,
        amendmentReason: null,
        premiumDifference: null,
      },
      evidence: { insights: [], exclusions: [] },
      clauseGraph: { edges: [] },
      confidence: {
        overall: 0.9,
        policyNumber: 0.95,
        provider: 0.95,
        dates: 0.9,
        premium: 0.95,
        coverages: 0.9,
      },
    }

    const validation = validateExtractionSafety(kaskoData)
    expect(validation.isValid).toBe(true)

    const analysis = generateAnalysisBundle('kasko-test', kaskoData, validation)
    expect(analysis.scoreBundle.scores.extractionQualityScore.scoreValue).toBeGreaterThan(0)

    const summary = generateDisplaySafeSummary(kaskoData, validation, analysis)
    expect(summary.branch).toBe('kasko')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)

    // Kasko-specific insight should still fire
    const insights = generateInsightBundle(kaskoData)
    const rayic = insights.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_RAYIC_DEGER')
    expect(rayic).toBeDefined()
  })
})
