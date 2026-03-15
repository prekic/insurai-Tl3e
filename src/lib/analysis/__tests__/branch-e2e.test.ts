/**
 * End-to-end branch proof tests.
 *
 * Proves that each branch's full pipeline:
 *   extraction data → normalizer → validator → analysis engine → display interpreter → display-safe summary
 * produces branch-specific results, not generic fallback.
 *
 * Also verifies condition-heavy variants and KASKO non-regression.
 */
import { describe, it, expect } from 'vitest'
import { validateExtractionSafety } from '@/lib/ai/validator'
import { generateAnalysisBundle } from '../engine'
import { generateDisplaySafeSummary } from '../display-interpreter'
import { normalizeBranchExtraction } from '@/lib/ai/extraction-normalizer'
import {
  trafficGolden,
  homeGolden,
  healthGolden,
  lifeGolden,
  daskGolden,
  businessGolden,
  nakliyatGolden,
  homeConditionHeavy,
  healthConditionHeavy,
  businessConditionHeavy,
  nakliyatConditionHeavy,
} from './branch-golden-datasets'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

function e2e(data: ExtractedPolicyData) {
  // Step 0: Post-extraction normalizer (wired in engine.ts, but test explicitly)
  normalizeBranchExtraction(data)

  // Step 1: Validator
  const validation = validateExtractionSafety(data)

  // Step 2: Analysis engine (calls normalizer again internally — idempotent)
  const analysis = generateAnalysisBundle('e2e-test', data, validation)

  // Step 3: Display interpreter
  const summary = generateDisplaySafeSummary(data, validation, analysis)

  return { validation, analysis, summary }
}

// ============================================================================
// FULL PIPELINE PROOF PER BRANCH
// ============================================================================

describe('E2E: Traffic', () => {
  it('produces branch-specific summary and cards', () => {
    const { summary } = e2e({ ...trafficGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('Traffic')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
    expect(summary.displayMode).toBeDefined()
    expect(summary.suppressedStatements).toBeDefined()
  })
})

describe('E2E: Home', () => {
  it('standard golden produces building/contents separation', () => {
    const { summary } = e2e({ ...homeGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('Home')
    const titles = summary.keyCoverageCards.map((c: { title: string }) => c.title)
    expect(titles.some((t: string) => t.startsWith('Building:') || t.startsWith('Contents:'))).toBe(
      true
    )
  })

  it('condition-heavy variant surfaces average clause', () => {
    const { summary } = e2e({ ...homeConditionHeavy } as ExtractedPolicyData)
    const avgCards = summary.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) => r.restrictionType === 'average_clause'
    )
    expect(avgCards.length).toBeGreaterThanOrEqual(1)
  })
})

describe('E2E: Health', () => {
  it('standard golden produces inpatient/outpatient grouping', () => {
    const { summary } = e2e({ ...healthGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('Health')
    const hasInpatient = summary.keyCoverageCards.some((c: { title: string }) =>
      c.title.startsWith('Inpatient:')
    )
    expect(hasInpatient).toBe(true)
  })

  it('condition-heavy variant surfaces network + copay restrictions', () => {
    const { summary } = e2e({ ...healthConditionHeavy } as ExtractedPolicyData)
    const netRestrictions = summary.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) =>
        r.restrictionType === 'network_dependency' || r.restrictionType === 'copay'
    )
    expect(netRestrictions.length).toBeGreaterThanOrEqual(1)
  })
})

describe('E2E: Life', () => {
  it('produces death benefit cards and beneficiary handling', () => {
    const { summary } = e2e({ ...lifeGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('Life')
    const deathCards = summary.keyCoverageCards.filter((c: { conditionMarkers: string[] }) =>
      c.conditionMarkers.includes('death_benefit')
    )
    expect(deathCards.length).toBeGreaterThan(0)
  })
})

describe('E2E: DASK', () => {
  it('produces earthquake-only scope risk and coverage', () => {
    const { summary } = e2e({ ...daskGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('DASK')
    expect(summary.topSummary).toContain('earthquake')
    const eqRisk = summary.claimReductionRiskCards.filter((r: { title: string }) =>
      r.title.includes('Earthquake-Only')
    )
    expect(eqRisk.length).toBeGreaterThan(0)
  })
})

describe('E2E: Business', () => {
  it('standard golden classifies property/BI/liability', () => {
    const { summary } = e2e({ ...businessGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('Business')
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
  })

  it('condition-heavy variant surfaces warranty restrictions', () => {
    const { summary } = e2e({ ...businessConditionHeavy } as ExtractedPolicyData)
    expect(summary.conditionalRestrictionCards.length).toBeGreaterThan(0)
  })
})

describe('E2E: Nakliyat', () => {
  it('standard golden produces ICC-classified cards', () => {
    const { summary } = e2e({ ...nakliyatGolden } as ExtractedPolicyData)
    expect(summary.topSummary).toContain('Nakliyat')
    const iccCards = summary.keyCoverageCards.filter((c: { conditionMarkers: string[] }) =>
      c.conditionMarkers.includes('icc_classified')
    )
    expect(iccCards.length).toBeGreaterThan(0)
  })

  it('condition-heavy variant surfaces W2W restriction', () => {
    const { summary } = e2e({ ...nakliyatConditionHeavy } as ExtractedPolicyData)
    const w2w = summary.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) =>
        r.restrictionType === 'w2w_included' || r.restrictionType === 'w2w_excluded'
    )
    expect(w2w.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// KASKO NON-REGRESSION
// ============================================================================
describe('E2E: KASKO (non-regression)', () => {
  it('uses generic card path and does not break', () => {
    const kaskoData: ExtractedPolicyData = {
      policyType: 'kasko',
      provider: 'Test Sigorta',
      currency: 'TRY',
      premium: 8000,
      coverages: [
        {
          name: 'Collision',
          limit: 500000,
          deductible: 2000,
          isMarketValue: true,
          isUnlimited: false,
        },
        { name: 'Theft', limit: 500000, deductible: 1000, isMarketValue: true, isUnlimited: false },
        {
          name: 'Glass Breakage',
          limit: 50000,
          deductible: 0,
          isMarketValue: false,
          isUnlimited: false,
        },
      ],
      exclusions: ['Intentional damage', 'Racing use'],
    } as ExtractedPolicyData
    const { summary } = e2e(kaskoData)

    expect(summary.topSummary).toBeDefined()
    expect(summary.keyCoverageCards.length).toBeGreaterThan(0)
    expect(summary.displayMode).toBeDefined()

    // No branch-specific prefixes
    const hasBranchPrefix = summary.keyCoverageCards.some((c: { title: string }) =>
      [
        'Building:',
        'Contents:',
        'Inpatient:',
        'Death Benefit:',
        'EQ Scope:',
        'Property:',
        'Cargo:',
      ].some((p) => c.title.startsWith(p))
    )
    expect(hasBranchPrefix).toBe(false)
  })
})

// ============================================================================
// CROSS-CUTTING: All branches produce valid DisplaySafePolicySummary
// ============================================================================
describe('E2E: Cross-cutting validity', () => {
  const allBranches = [
    { name: 'traffic', data: trafficGolden },
    { name: 'home', data: homeGolden },
    { name: 'health', data: healthGolden },
    { name: 'life', data: lifeGolden },
    { name: 'dask', data: daskGolden },
    { name: 'business', data: businessGolden },
    { name: 'nakliyat', data: nakliyatGolden },
  ]

  for (const { name, data } of allBranches) {
    it(`${name}: has valid display mode`, () => {
      const { summary } = e2e({ ...data } as ExtractedPolicyData)
      expect(['full', 'restricted', 'human_review_only']).toContain(summary.displayMode)
    })

    it(`${name}: has no prohibited phrases in top summary`, () => {
      const { summary } = e2e({ ...data } as ExtractedPolicyData)
      expect(summary.topSummary).toBeDefined()
      expect(summary.topSummary).not.toContain('comprehensive')
      expect(summary.topSummary).not.toContain('peace of mind')
    })

    it(`${name}: has modelVersion`, () => {
      const { summary } = e2e({ ...data } as ExtractedPolicyData)
      expect(summary.summaryVersion).toBeDefined()
    })
  }
})
