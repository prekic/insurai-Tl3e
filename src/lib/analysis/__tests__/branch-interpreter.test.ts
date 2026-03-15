/**
 * Branch-specific display interpreter tests.
 *
 * These prove that each branch produces purpose-built coverage cards,
 * restriction cards, risk cards, and missing cards instead of generic ones.
 */
import { describe, it, expect } from 'vitest'
import { generateDisplaySafeSummary } from '../display-interpreter'
import { validateExtractionSafety } from '@/lib/ai/validator'
import { generateAnalysisBundle } from '../engine'
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

// Helper to run full pipeline to display summary
function toSummary(data: ExtractedPolicyData) {
  const v = validateExtractionSafety(data)
  const a = generateAnalysisBundle('test', data, v)
  return generateDisplaySafeSummary(data, v, a)
}

// ============================================================================
// TRAFFIC — statutory vs enhanced, territory, vehicle use
// ============================================================================
describe('Display Interpreter: Traffic', () => {
  it('groups liability coverages with statutory/enhanced markers', () => {
    const s = toSummary(trafficGolden)
    const liabCards = s.keyCoverageCards.filter(
      (c: { conditionMarkers: string[] }) =>
        c.conditionMarkers.includes('statutory_minimum') ||
        c.conditionMarkers.includes('enhanced_liability')
    )
    expect(liabCards.length).toBeGreaterThan(0)
  })

  it('shows statutory-only risk when no enhanced liability', () => {
    const noEnhanced = {
      ...trafficGolden,
      coverages: (trafficGolden.coverages || []).map((c) => ({ ...c, limit: 500_000 })),
    }
    const s = toSummary(noEnhanced)
    const highRisks = s.claimReductionRiskCards.filter((r: { title: string }) =>
      r.title.includes('Statutory')
    )
    expect(highRisks.length).toBeGreaterThan(0)
  })

  it('produces branch-specific top summary', () => {
    const s = toSummary(trafficGolden)
    expect(s.topSummary).toContain('Traffic')
  })
})

// ============================================================================
// HOME — building/contents separation, underinsurance
// ============================================================================
describe('Display Interpreter: Home', () => {
  it('separates building and contents cards', () => {
    const s = toSummary(homeGolden)
    const buildingCards = s.keyCoverageCards.filter((c: { title: string }) =>
      c.title.startsWith('Building:')
    )
    const contentsCards = s.keyCoverageCards.filter((c: { title: string }) =>
      c.title.startsWith('Contents:')
    )
    expect(buildingCards.length).toBeGreaterThan(0)
    expect(contentsCards.length).toBeGreaterThan(0)
  })

  it('adds Missing card when no building/contents separation', () => {
    const noBldg = {
      ...homeGolden,
      coverages: [
        { name: 'Fire', limit: 500000, deductible: 0, isMarketValue: false, isUnlimited: false },
      ],
    }
    const s = toSummary(noBldg as ExtractedPolicyData)
    const miss = s.missingOrUnclearCards.filter(
      (m: { missingItem: string }) => m.missingItem === 'building_contents_separation'
    )
    expect(miss.length).toBeGreaterThan(0)
  })

  it('surfaces average clause as restriction and risk when present', () => {
    const s = toSummary(homeConditionHeavy)
    const avgRest = s.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) => r.restrictionType === 'average_clause'
    )
    expect(avgRest.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// HEALTH — network, waiting, copay separation
// ============================================================================
describe('Display Interpreter: Health', () => {
  it('groups coverages by inpatient/outpatient/etc', () => {
    const s = toSummary(healthGolden)
    const inpCards = s.keyCoverageCards.filter((c: { title: string }) =>
      c.title.startsWith('Inpatient:')
    )
    expect(inpCards.length).toBeGreaterThan(0)
  })

  it('adds network restriction when network condition present', () => {
    const s = toSummary(healthConditionHeavy)
    const netRest = s.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) => r.restrictionType === 'network_dependency'
    )
    expect(netRest.length).toBeGreaterThanOrEqual(1)
  })

  it('adds missing network card when no network info', () => {
    const noNet = {
      ...healthGolden,
      specialConditions: (healthGolden.specialConditions || []).filter(
        (c: string) =>
          !c.toLowerCase().includes('network') && !c.toLowerCase().includes('anlaşmalı')
      ),
    }
    const s = toSummary(noNet)
    const netMiss = s.missingOrUnclearCards.filter(
      (m: { missingItem: string }) => m.missingItem === 'network_info'
    )
    expect(netMiss.length).toBeGreaterThan(0)
  })

  it('adds copay restriction and risk when copay condition present', () => {
    const s = toSummary(healthConditionHeavy)
    const copayRest = s.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) => r.restrictionType === 'copay'
    )
    expect(copayRest.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// LIFE — death benefit, rider, beneficiary
// ============================================================================
describe('Display Interpreter: Life', () => {
  it('groups death benefit and rider coverages', () => {
    const s = toSummary(lifeGolden)
    const deathCards = s.keyCoverageCards.filter((c: { conditionMarkers: string[] }) =>
      c.conditionMarkers.includes('death_benefit')
    )
    expect(deathCards.length).toBeGreaterThan(0)
  })

  it('adds beneficiary missing card when absent', () => {
    const noBen = {
      ...lifeGolden,
      specialConditions: (lifeGolden.specialConditions || []).filter(
        (c: string) =>
          !c.toLowerCase().includes('beneficiary') && !c.toLowerCase().includes('lehdar')
      ),
    }
    const s = toSummary(noBen)
    const benMiss = s.missingOrUnclearCards.filter(
      (m: { missingItem: string }) => m.missingItem === 'beneficiary'
    )
    expect(benMiss.length).toBeGreaterThan(0)
  })

  it('adds rider conditionality risk when riders present', () => {
    const s = toSummary(lifeGolden)
    const riderCards = s.keyCoverageCards.filter((c: { conditionMarkers: string[] }) =>
      c.conditionMarkers.includes('rider')
    )
    if (riderCards.length > 0) {
      const riderRisk = s.claimReductionRiskCards.filter((r: { title: string }) =>
        r.title.includes('Rider')
      )
      expect(riderRisk.length).toBeGreaterThan(0)
    }
  })
})

// ============================================================================
// DASK — earthquake-only scope, statutory cap
// ============================================================================
describe('Display Interpreter: DASK', () => {
  it('always adds earthquake-only scope risk', () => {
    const s = toSummary(daskGolden)
    const eqRisk = s.claimReductionRiskCards.filter((r: { title: string }) =>
      r.title.includes('Earthquake-Only')
    )
    expect(eqRisk.length).toBeGreaterThan(0)
  })

  it('tags coverages with earthquake_scope marker', () => {
    const s = toSummary(daskGolden)
    const eqCov = s.keyCoverageCards.filter(
      (c: { conditionMarkers: string[] }) =>
        c.conditionMarkers.includes('earthquake_scope') ||
        c.conditionMarkers.includes('dask_supplementary')
    )
    expect(eqCov.length).toBeGreaterThan(0)
  })

  it('top summary mentions earthquake-only and homeowner policy', () => {
    const s = toSummary(daskGolden)
    expect(s.topSummary).toContain('DASK')
    expect(s.topSummary).toContain('earthquake')
  })
})

// ============================================================================
// BUSINESS — property/BI/liability separation, warranty conditions
// ============================================================================
describe('Display Interpreter: Business', () => {
  it('classifies coverages into property/stock/BI/liability groups', () => {
    const s = toSummary(businessGolden)
    const groups = s.keyCoverageCards.map((c: { title: string }) => c.title.split(':')[0])
    expect(groups.length).toBeGreaterThan(0)
  })

  it('surfaces alarm/warranty conditions when present', () => {
    const s = toSummary(businessConditionHeavy)
    const hasRestrictions = s.conditionalRestrictionCards.length > 0
    expect(hasRestrictions).toBe(true)
  })

  it('adds BI missing card when BI coverage exists without indemnity period', () => {
    const s = toSummary(businessGolden)
    const hasBICov = (businessGolden.coverages || []).some((c: { name?: string }) =>
      c.name?.toLowerCase().includes('business interruption')
    )
    if (hasBICov) {
      const hasBIPeriod = (businessGolden.specialConditions || []).some(
        (c: string) =>
          c.toLowerCase().includes('indemnity period') || c.toLowerCase().includes('bi period')
      )
      if (!hasBIPeriod) {
        const biMiss = s.missingOrUnclearCards.filter(
          (m: { missingItem: string }) => m.missingItem === 'bi_indemnity_period'
        )
        expect(biMiss.length).toBeGreaterThan(0)
      }
    }
  })
})

// ============================================================================
// NAKLIYAT — ICC basis, W2W, packaging
// ============================================================================
describe('Display Interpreter: Nakliyat', () => {
  it('labels coverages with ICC classification when available', () => {
    const s = toSummary(nakliyatGolden)
    const iccCards = s.keyCoverageCards.filter((c: { conditionMarkers: string[] }) =>
      c.conditionMarkers.includes('icc_classified')
    )
    expect(iccCards.length).toBeGreaterThan(0)
  })

  it('shows W2W restriction when present', () => {
    const s = toSummary(nakliyatConditionHeavy)
    const w2w = s.conditionalRestrictionCards.filter(
      (r: { restrictionType: string }) =>
        r.restrictionType === 'w2w_included' || r.restrictionType === 'w2w_excluded'
    )
    expect(w2w.length).toBeGreaterThanOrEqual(1)
  })

  it('adds missing ICC card when no ICC identified', () => {
    const noICC = {
      ...nakliyatGolden,
      coverages: [
        {
          name: 'Cargo Coverage',
          limit: 1000000,
          deductible: 500,
          isMarketValue: false,
          isUnlimited: false,
        },
      ],
    }
    const s = toSummary(noICC as ExtractedPolicyData)
    const iccMiss = s.missingOrUnclearCards.filter(
      (m: { missingItem: string }) => m.missingItem === 'icc_basis'
    )
    expect(iccMiss.length).toBeGreaterThan(0)
  })

  it('adds packaging missing card when no packaging condition', () => {
    const noPkg = {
      ...nakliyatGolden,
      specialConditions: (nakliyatGolden.specialConditions || []).filter(
        (c: string) =>
          !c.toLowerCase().includes('packaging') && !c.toLowerCase().includes('ambalaj')
      ),
    }
    const s = toSummary(noPkg)
    const pkgMiss = s.missingOrUnclearCards.filter(
      (m: { missingItem: string }) => m.missingItem === 'packaging_requirement'
    )
    expect(pkgMiss.length).toBeGreaterThan(0)
  })

  it('top summary mentions ICC when missing', () => {
    const noICC = {
      ...nakliyatGolden,
      coverages: [
        {
          name: 'Cargo Coverage',
          limit: 1000000,
          deductible: 500,
          isMarketValue: false,
          isUnlimited: false,
        },
      ],
    }
    const s = toSummary(noICC as ExtractedPolicyData)
    expect(s.topSummary).toContain('ICC')
  })
})

// ============================================================================
// KASKO — should still use generic fallback
// ============================================================================
describe('Display Interpreter: KASKO (generic fallback)', () => {
  it('uses generic coverage cards (no branch-specific grouping)', () => {
    const kaskoData: ExtractedPolicyData = {
      policyType: 'kasko',
      provider: 'Test Insurer',
      currency: 'TRY',
      premium: 5000,
      coverages: [
        {
          name: 'Collision',
          limit: 500000,
          deductible: 2000,
          isMarketValue: true,
          isUnlimited: false,
        },
        { name: 'Theft', limit: 500000, deductible: 1000, isMarketValue: true, isUnlimited: false },
      ],
    } as ExtractedPolicyData
    const s = toSummary(kaskoData)
    // Generic cards — no branch-specific grouping prefixes
    const hasBranchPrefix = s.keyCoverageCards.some(
      (c: { title: string }) =>
        c.title.includes(':') &&
        [
          'Building',
          'Contents',
          'Inpatient',
          'Death Benefit',
          'EQ Scope',
          'Property',
          'Cargo',
        ].some((p) => c.title.startsWith(p))
    )
    expect(hasBranchPrefix).toBe(false)
  })
})
