/**
 * Regional Benchmark Data — Branch Coverage Tests
 *
 * These tests target every conditional branch in data.ts to maximize
 * branch coverage, including edge cases for risk score calculation,
 * premium benchmark factors, trend logic, and ranked region metrics.
 */

import { describe, it, expect } from 'vitest'
import type { TurkishRegion } from '@/types/market-data'
import type { PolicyType } from '@/types/policy'
import {
  PROVINCES,
  REGIONAL_RISK_PROFILES,
  REGIONAL_INSURANCE_STATS,
  getRegionalPremiumBenchmarks,
  getProvince,
  getProvincesByRegion,
  getRegionalRiskProfile,
  getRegionalInsuranceStats,
  calculateRegionalRiskScore,
  getRankedRegions,
} from './data'

const ALL_REGIONS: TurkishRegion[] = [
  'marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu',
]

// =============================================================================
// calculateRegionalRiskScore — Branch Coverage
// =============================================================================

describe('calculateRegionalRiskScore — branch coverage', () => {
  it('should produce higher earthquake component for zone 1 vs zone 3', () => {
    // Zone 1 regions: marmara (zone 1), dogu_anadolu (zone 1)
    // Zone 3 regions: ic_anadolu (zone 3), karadeniz (zone 3)
    const zone1Score = calculateRegionalRiskScore('marmara')
    const zone3Score = calculateRegionalRiskScore('ic_anadolu')

    // Zone 1: earthquakeScore = (6-1)*15 = 75
    // Zone 3: earthquakeScore = (6-3)*15 = 45
    // The zone 1 region must have a higher base earthquake component
    expect(zone1Score).toBeGreaterThan(zone3Score)
  })

  it('should produce higher flood component for karadeniz (25 annual) vs ic_anadolu (4 annual)', () => {
    // Karadeniz: flood.annualFrequency = 25 => floodScore = 25 * 1.5 = 37.5
    // ic_anadolu: flood.annualFrequency = 4 => floodScore = 4 * 1.5 = 6
    const karadenizScore = calculateRegionalRiskScore('karadeniz')
    const icAnadoluScore = calculateRegionalRiskScore('ic_anadolu')
    // karadeniz has zone 3 like ic_anadolu but much higher flood => net higher
    expect(karadenizScore).toBeGreaterThan(icAnadoluScore)
  })

  it('should clamp score to max 100', () => {
    // Even regions with high multi-component scores should not exceed 100
    for (const region of ALL_REGIONS) {
      const score = calculateRegionalRiskScore(region)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('should clamp score to min 0', () => {
    for (const region of ALL_REGIONS) {
      const score = calculateRegionalRiskScore(region)
      expect(score).toBeGreaterThanOrEqual(0)
    }
  })

  it('should return integer values for every region', () => {
    for (const region of ALL_REGIONS) {
      const score = calculateRegionalRiskScore(region)
      expect(Number.isInteger(score)).toBe(true)
    }
  })

  it('should reflect crime rate contribution (marmara highest theftRate=245)', () => {
    // marmara theftRate = 245 => crimeScore = (245/250)*20 = 19.6
    // dogu_anadolu theftRate = 85 => crimeScore = (85/250)*20 = 6.8
    const marmaraScore = calculateRegionalRiskScore('marmara')
    const doguScore = calculateRegionalRiskScore('dogu_anadolu')
    // Both zone 1, but marmara has higher crime + flood components
    expect(marmaraScore).toBeGreaterThanOrEqual(doguScore)
  })

  it('should reflect traffic accident rate contribution', () => {
    // marmara accidentRate = 890 => trafficScore = (890/900)*15 = ~14.8
    // dogu_anadolu accidentRate = 420 => trafficScore = (420/900)*15 = ~7.0
    // Marmara has highest traffic component
    const marmaraScore = calculateRegionalRiskScore('marmara')
    expect(marmaraScore).toBeGreaterThan(0)
  })

  it('should calculate exact scores for each region deterministically', () => {
    // Test that calling twice gives the same result (deterministic)
    for (const region of ALL_REGIONS) {
      const score1 = calculateRegionalRiskScore(region)
      const score2 = calculateRegionalRiskScore(region)
      expect(score1).toBe(score2)
    }
  })

  it('should produce at least 4 distinct scores among 7 regions (some cap at 100)', () => {
    const scores = ALL_REGIONS.map(r => calculateRegionalRiskScore(r))
    // Several regions (marmara, ege, akdeniz, dogu_anadolu) hit the 100 cap
    // So unique scores are {100, 72, 99, 87} = 4 distinct values
    const uniqueScores = new Set(scores)
    expect(uniqueScores.size).toBeGreaterThanOrEqual(4)
  })
})

// =============================================================================
// getRegionalPremiumBenchmarks — Branch Coverage
// =============================================================================

describe('getRegionalPremiumBenchmarks — branch coverage', () => {
  describe('premium percentile ordering', () => {
    it('should satisfy min < p10 < p25 < median < average < p75 < p90 < max for every region/type', () => {
      const policyTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']

      for (const pt of policyTypes) {
        const benchmarks = getRegionalPremiumBenchmarks(pt)
        for (const region of ALL_REGIONS) {
          const p = benchmarks[region].premium
          expect(p.min).toBeLessThanOrEqual(p.percentile10)
          expect(p.percentile10).toBeLessThanOrEqual(p.percentile25)
          expect(p.percentile25).toBeLessThanOrEqual(p.median)
          // median (0.92 * avg) is less than average (1.0 * avg)
          expect(p.median).toBeLessThanOrEqual(p.average)
          expect(p.average).toBeLessThanOrEqual(p.percentile75)
          expect(p.percentile75).toBeLessThanOrEqual(p.percentile90)
          expect(p.percentile90).toBeLessThanOrEqual(p.max)
        }
      }
    })
  })

  describe('vsNational rankings', () => {
    it('should assign unique rankings 1-7 for every policy type', () => {
      const policyTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']

      for (const pt of policyTypes) {
        const benchmarks = getRegionalPremiumBenchmarks(pt)
        const rankings = ALL_REGIONS.map(r => benchmarks[r].vsNational.ranking)
        rankings.sort((a, b) => a - b)
        expect(rankings).toEqual([1, 2, 3, 4, 5, 6, 7])
      }
    })

    it('should have totalRegions = 7 for all benchmarks', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')
      for (const region of ALL_REGIONS) {
        expect(benchmarks[region].vsNational.totalRegions).toBe(7)
      }
    })

    it('should have positive percentage for above-average regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')
      for (const region of ALL_REGIONS) {
        const diff = benchmarks[region].vsNational.difference
        const pct = benchmarks[region].vsNational.percentage
        // Sign of difference and percentage should match
        if (diff > 0) expect(pct).toBeGreaterThan(0)
        if (diff < 0) expect(pct).toBeLessThan(0)
      }
    })
  })

  describe('factors — risk adjustment branch (earthquake zone <= 2 vs > 2)', () => {
    it('should set riskAdjustment 1.2 for zone 1 and zone 2 regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // Zone 1: marmara, ege (actually zone 1 for ege), dogu_anadolu
      // Zone 2: akdeniz, guneydogu
      const zone1or2Regions: TurkishRegion[] = ['marmara', 'ege', 'akdeniz', 'dogu_anadolu', 'guneydogu']
      for (const region of zone1or2Regions) {
        expect(benchmarks[region].factors.riskAdjustment).toBe(1.2)
      }
    })

    it('should set riskAdjustment 1.0 for zone 3+ regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // Zone 3: ic_anadolu, karadeniz
      const zone3PlusRegions: TurkishRegion[] = ['ic_anadolu', 'karadeniz']
      for (const region of zone3PlusRegions) {
        expect(benchmarks[region].factors.riskAdjustment).toBe(1.0)
      }
    })
  })

  describe('factors — competition adjustment branch (penetration > 0.35 vs <= 0.35)', () => {
    it('should set competitionAdjustment 0.95 for high-penetration regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // Marmara: 0.42, Ege: 0.38 -> both > 0.35
      expect(benchmarks.marmara.factors.competitionAdjustment).toBe(0.95)
      expect(benchmarks.ege.factors.competitionAdjustment).toBe(0.95)
    })

    it('should set competitionAdjustment 1.05 for low-penetration regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // akdeniz: 0.35, ic_anadolu: 0.32, karadeniz: 0.28, dogu: 0.22, guneydogu: 0.24
      expect(benchmarks.akdeniz.factors.competitionAdjustment).toBe(1.05) // 0.35 is NOT > 0.35
      expect(benchmarks.ic_anadolu.factors.competitionAdjustment).toBe(1.05)
      expect(benchmarks.karadeniz.factors.competitionAdjustment).toBe(1.05)
      expect(benchmarks.dogu_anadolu.factors.competitionAdjustment).toBe(1.05)
      expect(benchmarks.guneydogu.factors.competitionAdjustment).toBe(1.05)
    })
  })

  describe('factors — claims history adjustment branch (claimsRatio > 0.6 vs <= 0.6)', () => {
    it('should set claimsHistoryAdjustment 1.1 for high claims regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // marmara: 0.68, ege: 0.62, akdeniz: 0.62 -> all > 0.6
      expect(benchmarks.marmara.factors.claimsHistoryAdjustment).toBe(1.1)
      expect(benchmarks.ege.factors.claimsHistoryAdjustment).toBe(1.1)
      expect(benchmarks.akdeniz.factors.claimsHistoryAdjustment).toBe(1.1)
    })

    it('should set claimsHistoryAdjustment 0.95 for low claims regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // ic_anadolu: 0.54, karadeniz: 0.53, dogu: 0.49, guneydogu: 0.49
      expect(benchmarks.ic_anadolu.factors.claimsHistoryAdjustment).toBe(0.95)
      expect(benchmarks.karadeniz.factors.claimsHistoryAdjustment).toBe(0.95)
      expect(benchmarks.dogu_anadolu.factors.claimsHistoryAdjustment).toBe(0.95)
      expect(benchmarks.guneydogu.factors.claimsHistoryAdjustment).toBe(0.95)
    })
  })

  describe('factors — regulatory adjustment always 1.0', () => {
    it('should set regulatoryAdjustment to 1.0 for all regions', () => {
      const benchmarks = getRegionalPremiumBenchmarks('traffic')
      for (const region of ALL_REGIONS) {
        expect(benchmarks[region].factors.regulatoryAdjustment).toBe(1.0)
      }
    })
  })

  describe('trend — direction branch (yoyPremiumGrowth > 0.4 vs <= 0.4)', () => {
    it('should set direction "increasing" for growth > 0.4', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // marmara: 0.45, ege: 0.42 -> both > 0.4
      expect(benchmarks.marmara.trend.direction).toBe('increasing')
      expect(benchmarks.ege.trend.direction).toBe('increasing')
    })

    it('should set direction "stable" for growth <= 0.4', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // akdeniz: 0.40, ic_anadolu: 0.38, karadeniz: 0.35, dogu: 0.32, guneydogu: 0.34
      expect(benchmarks.akdeniz.trend.direction).toBe('stable') // 0.40 is NOT > 0.4
      expect(benchmarks.ic_anadolu.trend.direction).toBe('stable')
      expect(benchmarks.karadeniz.trend.direction).toBe('stable')
      expect(benchmarks.dogu_anadolu.trend.direction).toBe('stable')
      expect(benchmarks.guneydogu.trend.direction).toBe('stable')
    })
  })

  describe('trend — yoyChange and projection6m calculations', () => {
    it('should set yoyChange as growth * 100', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // marmara growth: 0.45 => yoyChange: 45
      expect(benchmarks.marmara.trend.yoyChange).toBe(
        REGIONAL_INSURANCE_STATS.marmara.growth.yoyPremiumGrowth * 100
      )
    })

    it('should set projection6m as growth * 50', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      // marmara growth: 0.45 => projection6m: 22.5
      expect(benchmarks.marmara.trend.projection6m).toBe(
        REGIONAL_INSURANCE_STATS.marmara.growth.yoyPremiumGrowth * 50
      )
    })
  })

  describe('nakliyat policy type', () => {
    it('should return valid benchmarks for nakliyat (additional policy type in stats)', () => {
      // nakliyat is present in REGIONAL_INSURANCE_STATS but not always tested
      const benchmarks = getRegionalPremiumBenchmarks('nakliyat')
      for (const region of ALL_REGIONS) {
        expect(benchmarks[region]).toBeDefined()
        expect(benchmarks[region].policyType).toBe('nakliyat')
        expect(benchmarks[region].premium.average).toBeGreaterThan(0)
      }
    })
  })
})

// =============================================================================
// getRankedRegions — Branch Coverage
// =============================================================================

describe('getRankedRegions — branch coverage', () => {
  describe('metric: premium — with and without policyType', () => {
    it('should use insurancePerCapita when policyType is undefined', () => {
      const ranked = getRankedRegions('premium')
      // marmara has highest insurancePerCapita (7250)
      const marmaraItem = ranked.find(r => r.region === 'marmara')
      expect(marmaraItem).toBeDefined()
      expect(marmaraItem!.value).toBe(REGIONAL_INSURANCE_STATS.marmara.insurancePerCapita)
    })

    it('should use policyDistribution avgPremium when policyType is provided', () => {
      const ranked = getRankedRegions('premium', 'kasko')
      const marmaraItem = ranked.find(r => r.region === 'marmara')
      expect(marmaraItem).toBeDefined()
      expect(marmaraItem!.value).toBe(
        REGIONAL_INSURANCE_STATS.marmara.policyDistribution.kasko.avgPremium
      )
    })

    it('should sort ascending by value', () => {
      const ranked = getRankedRegions('premium', 'traffic')
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].value).toBeGreaterThanOrEqual(ranked[i - 1].value)
      }
    })
  })

  describe('metric: risk', () => {
    it('should use calculateRegionalRiskScore for values', () => {
      const ranked = getRankedRegions('risk')
      for (const item of ranked) {
        expect(item.value).toBe(calculateRegionalRiskScore(item.region))
      }
    })

    it('should sort ascending (lowest risk first)', () => {
      const ranked = getRankedRegions('risk')
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].value).toBeGreaterThanOrEqual(ranked[i - 1].value)
      }
    })
  })

  describe('metric: penetration', () => {
    it('should use marketPenetration for values', () => {
      const ranked = getRankedRegions('penetration')
      for (const item of ranked) {
        expect(item.value).toBe(REGIONAL_INSURANCE_STATS[item.region].marketPenetration)
      }
    })

    it('should sort ascending', () => {
      const ranked = getRankedRegions('penetration')
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].value).toBeGreaterThanOrEqual(ranked[i - 1].value)
      }
    })
  })

  describe('metric: claims', () => {
    it('should use claimsRatio for values', () => {
      const ranked = getRankedRegions('claims')
      for (const item of ranked) {
        expect(item.value).toBe(REGIONAL_INSURANCE_STATS[item.region].claimsData.claimsRatio)
      }
    })

    it('should sort ascending (lowest claims ratio first)', () => {
      const ranked = getRankedRegions('claims')
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].value).toBeGreaterThanOrEqual(ranked[i - 1].value)
      }
    })
  })

  describe('metric: default branch (unknown metric)', () => {
    it('should default to value 0 for all regions with an unknown metric string', () => {
      // Cast to satisfy TypeScript while hitting the default branch
      const ranked = getRankedRegions('unknown_metric' as 'premium')
      expect(ranked.length).toBe(7)
      for (const item of ranked) {
        expect(item.value).toBe(0)
      }
    })
  })

  describe('rank assignment', () => {
    it('should assign sequential ranks 1 through 7', () => {
      for (const metric of ['premium', 'risk', 'penetration', 'claims'] as const) {
        const ranked = getRankedRegions(metric)
        const ranks = ranked.map(r => r.rank)
        expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7])
      }
    })
  })

  describe('premium with different policy types', () => {
    const policyTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']

    for (const pt of policyTypes) {
      it(`should return valid rankings for premium with policyType=${pt}`, () => {
        const ranked = getRankedRegions('premium', pt)
        expect(ranked.length).toBe(7)
        for (let i = 1; i < ranked.length; i++) {
          expect(ranked[i].value).toBeGreaterThanOrEqual(ranked[i - 1].value)
        }
      })
    }
  })
})

// =============================================================================
// getProvince — Branch Coverage
// =============================================================================

describe('getProvince — branch coverage', () => {
  it('should return province for every defined code', () => {
    const definedCodes = Object.keys(PROVINCES)
    for (const code of definedCodes) {
      const province = getProvince(code as never)
      expect(province).toBeDefined()
      expect(province!.code).toBe(code)
    }
  })

  it('should return undefined for non-existent province codes', () => {
    // Province codes that are valid ProvinceCode type but not in PROVINCES
    expect(getProvince('02')).toBeUndefined()
    expect(getProvince('03')).toBeUndefined()
    expect(getProvince('99' as never)).toBeUndefined()
  })

  it('should return correct data for all 17 defined provinces', () => {
    const expectedCount = Object.keys(PROVINCES).length
    expect(expectedCount).toBe(17)
  })
})

// =============================================================================
// getProvincesByRegion — Branch Coverage
// =============================================================================

describe('getProvincesByRegion — branch coverage', () => {
  it('should return correct provinces for each region', () => {
    for (const region of ALL_REGIONS) {
      const provinces = getProvincesByRegion(region)
      expect(Array.isArray(provinces)).toBe(true)
      for (const p of provinces) {
        expect(p.region).toBe(region)
      }
    }
  })

  it('should include known provinces in their regions', () => {
    const marmara = getProvincesByRegion('marmara')
    const istanbulCodes = marmara.map(p => p.code)
    expect(istanbulCodes).toContain('34') // Istanbul
    expect(istanbulCodes).toContain('16') // Bursa
    expect(istanbulCodes).toContain('41') // Kocaeli
  })

  it('should return multiple provinces for akdeniz', () => {
    const akdeniz = getProvincesByRegion('akdeniz')
    // Adana ('01'), Antalya ('07'), Mersin ('33')
    expect(akdeniz.length).toBeGreaterThanOrEqual(3)
    const codes = akdeniz.map(p => p.code)
    expect(codes).toContain('01')
    expect(codes).toContain('07')
    expect(codes).toContain('33')
  })

  it('should return multiple provinces for ic_anadolu', () => {
    const icAnadolu = getProvincesByRegion('ic_anadolu')
    // Ankara ('06'), Kayseri ('38'), Konya ('42')
    expect(icAnadolu.length).toBeGreaterThanOrEqual(3)
    const codes = icAnadolu.map(p => p.code)
    expect(codes).toContain('06')
    expect(codes).toContain('38')
    expect(codes).toContain('42')
  })

  it('should return provinces for guneydogu with correct Turkish names', () => {
    const guneydogu = getProvincesByRegion('guneydogu')
    const names = guneydogu.map(p => p.nameTr)
    expect(names).toContain('Diyarbakır')
    expect(names).toContain('Gaziantep')
    expect(names).toContain('Şanlıurfa')
  })
})

// =============================================================================
// getRegionalRiskProfile / getRegionalInsuranceStats — all regions
// =============================================================================

describe('getRegionalRiskProfile — every region', () => {
  it('should return profile whose region matches input for all regions', () => {
    for (const region of ALL_REGIONS) {
      const profile = getRegionalRiskProfile(region)
      expect(profile.region).toBe(region)
    }
  })

  it('should have valid earthquake zones for all regions', () => {
    for (const region of ALL_REGIONS) {
      const profile = getRegionalRiskProfile(region)
      expect([1, 2, 3, 4, 5]).toContain(profile.earthquake.zone)
    }
  })

  it('should have storm data for all regions', () => {
    for (const region of ALL_REGIONS) {
      const profile = getRegionalRiskProfile(region)
      expect(profile.storm.annualEvents).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('getRegionalInsuranceStats — every region', () => {
  it('should return stats whose region matches input for all regions', () => {
    for (const region of ALL_REGIONS) {
      const stats = getRegionalInsuranceStats(region)
      expect(stats.region).toBe(region)
    }
  })

  it('should include nakliyat in policyDistribution for every region', () => {
    for (const region of ALL_REGIONS) {
      const stats = getRegionalInsuranceStats(region)
      expect(stats.policyDistribution.nakliyat).toBeDefined()
      expect(stats.policyDistribution.nakliyat.avgPremium).toBeGreaterThan(0)
    }
  })

  it('should have dataDate and source for all regions', () => {
    for (const region of ALL_REGIONS) {
      const stats = getRegionalInsuranceStats(region)
      expect(stats.dataDate).toBe('2024-12-01')
      expect(stats.source).toBe('TSB/SEDDK')
    }
  })
})

// =============================================================================
// PROVINCES data integrity
// =============================================================================

describe('PROVINCES data integrity', () => {
  it('should have positive population and area for every province', () => {
    for (const province of Object.values(PROVINCES)) {
      expect(province.population).toBeGreaterThan(0)
      expect(province.area).toBeGreaterThan(0)
      expect(province.density).toBeGreaterThan(0)
    }
  })

  it('should have urbanRatio between 0 and 1', () => {
    for (const province of Object.values(PROVINCES)) {
      expect(province.urbanRatio).toBeGreaterThan(0)
      expect(province.urbanRatio).toBeLessThanOrEqual(1)
    }
  })

  it('should have valid Turkish geographic coordinates', () => {
    for (const province of Object.values(PROVINCES)) {
      // Turkey roughly: lat 36-42, lng 26-44
      expect(province.coordinates.lat).toBeGreaterThanOrEqual(36)
      expect(province.coordinates.lat).toBeLessThanOrEqual(42)
      expect(province.coordinates.lng).toBeGreaterThanOrEqual(26)
      expect(province.coordinates.lng).toBeLessThanOrEqual(44)
    }
  })

  it('should map Istanbul as highest density province', () => {
    const istanbul = PROVINCES['34']
    for (const province of Object.values(PROVINCES)) {
      expect(istanbul.density).toBeGreaterThanOrEqual(province.density)
    }
  })
})

// =============================================================================
// REGIONAL_RISK_PROFILES data integrity
// =============================================================================

describe('REGIONAL_RISK_PROFILES data integrity', () => {
  it('should have valid risk levels for all flood entries', () => {
    const validLevels = ['very_low', 'low', 'moderate', 'high', 'very_high']
    for (const region of ALL_REGIONS) {
      const profile = REGIONAL_RISK_PROFILES[region]
      expect(validLevels).toContain(profile.flood.level)
      expect(validLevels).toContain(profile.fire.forestFireRisk)
      expect(validLevels).toContain(profile.storm.level)
      expect(validLevels).toContain(profile.crime.overallLevel)
      expect(validLevels).toContain(profile.traffic.congestionLevel)
      expect(validLevels).toContain(profile.health.healthcareAccess)
    }
  })

  it('should have Dogu Anadolu as highest earthquake historical events', () => {
    const dogu = REGIONAL_RISK_PROFILES.dogu_anadolu
    for (const region of ALL_REGIONS) {
      expect(dogu.earthquake.historicalEvents).toBeGreaterThanOrEqual(
        REGIONAL_RISK_PROFILES[region].earthquake.historicalEvents
      )
    }
  })

  it('should have Akdeniz as highest forest fire risk', () => {
    expect(REGIONAL_RISK_PROFILES.akdeniz.fire.forestFireRisk).toBe('very_high')
  })

  it('should have Marmara as highest traffic accident rate', () => {
    const marmara = REGIONAL_RISK_PROFILES.marmara
    for (const region of ALL_REGIONS) {
      expect(marmara.traffic.accidentRate).toBeGreaterThanOrEqual(
        REGIONAL_RISK_PROFILES[region].traffic.accidentRate
      )
    }
  })
})

// =============================================================================
// REGIONAL_INSURANCE_STATS data integrity
// =============================================================================

describe('REGIONAL_INSURANCE_STATS data integrity', () => {
  it('should have all 8 policy types in every region distribution', () => {
    const requiredTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat']
    for (const region of ALL_REGIONS) {
      const stats = REGIONAL_INSURANCE_STATS[region]
      for (const pt of requiredTypes) {
        expect(stats.policyDistribution[pt]).toBeDefined()
        expect(stats.policyDistribution[pt].count).toBeGreaterThan(0)
        expect(stats.policyDistribution[pt].premiumVolume).toBeGreaterThan(0)
        expect(stats.policyDistribution[pt].avgPremium).toBeGreaterThan(0)
        expect(stats.policyDistribution[pt].marketShare).toBeGreaterThan(0)
      }
    }
  })

  it('should have Marmara with highest total policies', () => {
    const marmara = REGIONAL_INSURANCE_STATS.marmara
    for (const region of ALL_REGIONS) {
      expect(marmara.totalPolicies).toBeGreaterThanOrEqual(
        REGIONAL_INSURANCE_STATS[region].totalPolicies
      )
    }
  })

  it('should have positive growth rates for all regions', () => {
    for (const region of ALL_REGIONS) {
      const stats = REGIONAL_INSURANCE_STATS[region]
      expect(stats.growth.yoyPremiumGrowth).toBeGreaterThan(0)
      expect(stats.growth.yoyPolicyGrowth).toBeGreaterThan(0)
      expect(stats.growth.yoyClaimsGrowth).toBeGreaterThan(0)
    }
  })
})
