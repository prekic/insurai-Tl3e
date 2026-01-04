/**
 * Regional Benchmark Comparison Tests
 *
 * Tests for comparing insurance metrics across Turkish regions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  compareRegions,
  compareAllRegions,
  analyzeLocation,
  compareNearbyProvinces,
  getNationalStatistics,
  getRegionalRankings,
} from './comparison'
import type { TurkishRegion } from '@/types/market-data'
import type { PolicyType } from '@/types/policy'

// Mock dependencies
vi.mock('./data', () => ({
  PROVINCES: {
    '34': {
      code: '34',
      name: 'Istanbul',
      nameTr: 'İstanbul',
      region: 'marmara',
      population: 15500000,
      coordinates: { lat: 41.0082, lng: 28.9784 },
    },
    '06': {
      code: '06',
      name: 'Ankara',
      nameTr: 'Ankara',
      region: 'ic_anadolu',
      population: 5500000,
      coordinates: { lat: 39.9334, lng: 32.8597 },
    },
    '35': {
      code: '35',
      name: 'Izmir',
      nameTr: 'İzmir',
      region: 'ege',
      population: 4400000,
      coordinates: { lat: 38.4237, lng: 27.1428 },
    },
  },
  REGIONAL_RISK_PROFILES: {
    marmara: {
      earthquake: { zone: 1, probability: 0.7 },
      flood: { level: 'medium', annualFrequency: 5 },
      crime: { theftRate: 150, overallLevel: 'high' },
      traffic: { congestionLevel: 'very_high' },
      health: { healthcareAccess: 'high' },
    },
    ege: {
      earthquake: { zone: 2, probability: 0.5 },
      flood: { level: 'low', annualFrequency: 2 },
      crime: { theftRate: 100, overallLevel: 'medium' },
      traffic: { congestionLevel: 'medium' },
      health: { healthcareAccess: 'medium' },
    },
    akdeniz: {
      earthquake: { zone: 2, probability: 0.4 },
      flood: { level: 'high', annualFrequency: 8 },
      crime: { theftRate: 120, overallLevel: 'medium' },
      traffic: { congestionLevel: 'high' },
      health: { healthcareAccess: 'medium' },
    },
    ic_anadolu: {
      earthquake: { zone: 2, probability: 0.3 },
      flood: { level: 'low', annualFrequency: 1 },
      crime: { theftRate: 80, overallLevel: 'low' },
      traffic: { congestionLevel: 'medium' },
      health: { healthcareAccess: 'medium' },
    },
    karadeniz: {
      earthquake: { zone: 3, probability: 0.2 },
      flood: { level: 'high', annualFrequency: 10 },
      crime: { theftRate: 60, overallLevel: 'low' },
      traffic: { congestionLevel: 'low' },
      health: { healthcareAccess: 'low' },
    },
    dogu_anadolu: {
      earthquake: { zone: 1, probability: 0.6 },
      flood: { level: 'low', annualFrequency: 2 },
      crime: { theftRate: 40, overallLevel: 'low' },
      traffic: { congestionLevel: 'low' },
      health: { healthcareAccess: 'very_high' },
    },
    guneydogu: {
      earthquake: { zone: 2, probability: 0.4 },
      flood: { level: 'medium', annualFrequency: 4 },
      crime: { theftRate: 70, overallLevel: 'medium' },
      traffic: { congestionLevel: 'low' },
      health: { healthcareAccess: 'high' },
    },
  },
  REGIONAL_INSURANCE_STATS: {
    marmara: {
      totalPolicies: 5000000,
      totalPremiumVolume: 25000000000,
      marketPenetration: 0.35,
      claimsData: { claimsRatio: 0.65 },
      growth: { yoyPremiumGrowth: 0.42 },
      policyDistribution: {
        kasko: { count: 1500000, avgPremium: 8000, premiumVolume: 12000000000 },
        traffic: { count: 2000000, avgPremium: 2000, premiumVolume: 4000000000 },
        home: { count: 500000, avgPremium: 3000, premiumVolume: 1500000000 },
        health: { count: 300000, avgPremium: 10000, premiumVolume: 3000000000 },
        life: { count: 200000, avgPremium: 5000, premiumVolume: 1000000000 },
        dask: { count: 400000, avgPremium: 1000, premiumVolume: 400000000 },
        business: { count: 100000, avgPremium: 20000, premiumVolume: 2000000000 },
      },
    },
    ege: {
      totalPolicies: 2000000,
      totalPremiumVolume: 8000000000,
      marketPenetration: 0.30,
      claimsData: { claimsRatio: 0.60 },
      growth: { yoyPremiumGrowth: 0.38 },
      policyDistribution: {
        kasko: { count: 600000, avgPremium: 6500, premiumVolume: 3900000000 },
        traffic: { count: 800000, avgPremium: 1800, premiumVolume: 1440000000 },
        home: { count: 200000, avgPremium: 2500, premiumVolume: 500000000 },
        health: { count: 150000, avgPremium: 8000, premiumVolume: 1200000000 },
        life: { count: 100000, avgPremium: 4000, premiumVolume: 400000000 },
        dask: { count: 120000, avgPremium: 800, premiumVolume: 96000000 },
        business: { count: 30000, avgPremium: 15000, premiumVolume: 450000000 },
      },
    },
    akdeniz: {
      totalPolicies: 1500000,
      totalPremiumVolume: 6000000000,
      marketPenetration: 0.28,
      claimsData: { claimsRatio: 0.62 },
      growth: { yoyPremiumGrowth: 0.40 },
      policyDistribution: {
        kasko: { count: 450000, avgPremium: 7000, premiumVolume: 3150000000 },
        traffic: { count: 600000, avgPremium: 1900, premiumVolume: 1140000000 },
        home: { count: 150000, avgPremium: 2800, premiumVolume: 420000000 },
        health: { count: 100000, avgPremium: 9000, premiumVolume: 900000000 },
        life: { count: 80000, avgPremium: 4500, premiumVolume: 360000000 },
        dask: { count: 100000, avgPremium: 900, premiumVolume: 90000000 },
        business: { count: 20000, avgPremium: 18000, premiumVolume: 360000000 },
      },
    },
    ic_anadolu: {
      totalPolicies: 1800000,
      totalPremiumVolume: 7000000000,
      marketPenetration: 0.25,
      claimsData: { claimsRatio: 0.55 },
      growth: { yoyPremiumGrowth: 0.35 },
      policyDistribution: {
        kasko: { count: 500000, avgPremium: 5500, premiumVolume: 2750000000 },
        traffic: { count: 700000, avgPremium: 1600, premiumVolume: 1120000000 },
        home: { count: 180000, avgPremium: 2200, premiumVolume: 396000000 },
        health: { count: 120000, avgPremium: 7500, premiumVolume: 900000000 },
        life: { count: 90000, avgPremium: 4000, premiumVolume: 360000000 },
        dask: { count: 150000, avgPremium: 700, premiumVolume: 105000000 },
        business: { count: 60000, avgPremium: 12000, premiumVolume: 720000000 },
      },
    },
    karadeniz: {
      totalPolicies: 800000,
      totalPremiumVolume: 3000000000,
      marketPenetration: 0.22,
      claimsData: { claimsRatio: 0.70 },
      growth: { yoyPremiumGrowth: 0.32 },
      policyDistribution: {
        kasko: { count: 200000, avgPremium: 5000, premiumVolume: 1000000000 },
        traffic: { count: 350000, avgPremium: 1500, premiumVolume: 525000000 },
        home: { count: 80000, avgPremium: 2000, premiumVolume: 160000000 },
        health: { count: 60000, avgPremium: 6000, premiumVolume: 360000000 },
        life: { count: 40000, avgPremium: 3500, premiumVolume: 140000000 },
        dask: { count: 50000, avgPremium: 600, premiumVolume: 30000000 },
        business: { count: 20000, avgPremium: 10000, premiumVolume: 200000000 },
      },
    },
    dogu_anadolu: {
      totalPolicies: 400000,
      totalPremiumVolume: 1500000000,
      marketPenetration: 0.18,
      claimsData: { claimsRatio: 0.58 },
      growth: { yoyPremiumGrowth: 0.30 },
      policyDistribution: {
        kasko: { count: 100000, avgPremium: 4500, premiumVolume: 450000000 },
        traffic: { count: 180000, avgPremium: 1400, premiumVolume: 252000000 },
        home: { count: 40000, avgPremium: 1800, premiumVolume: 72000000 },
        health: { count: 30000, avgPremium: 5500, premiumVolume: 165000000 },
        life: { count: 20000, avgPremium: 3000, premiumVolume: 60000000 },
        dask: { count: 25000, avgPremium: 500, premiumVolume: 12500000 },
        business: { count: 5000, avgPremium: 8000, premiumVolume: 40000000 },
      },
    },
    guneydogu: {
      totalPolicies: 500000,
      totalPremiumVolume: 2000000000,
      marketPenetration: 0.20,
      claimsData: { claimsRatio: 0.60 },
      growth: { yoyPremiumGrowth: 0.33 },
      policyDistribution: {
        kasko: { count: 130000, avgPremium: 5000, premiumVolume: 650000000 },
        traffic: { count: 220000, avgPremium: 1500, premiumVolume: 330000000 },
        home: { count: 50000, avgPremium: 2000, premiumVolume: 100000000 },
        health: { count: 40000, avgPremium: 6000, premiumVolume: 240000000 },
        life: { count: 25000, avgPremium: 3200, premiumVolume: 80000000 },
        dask: { count: 30000, avgPremium: 550, premiumVolume: 16500000 },
        business: { count: 5000, avgPremium: 9000, premiumVolume: 45000000 },
      },
    },
  },
  getRegionalPremiumBenchmarks: vi.fn((_policyType: PolicyType) => {
    const benchmarks: Record<TurkishRegion, { vsNational: { ranking: number } }> = {
      marmara: { vsNational: { ranking: 7 } },
      ege: { vsNational: { ranking: 4 } },
      akdeniz: { vsNational: { ranking: 5 } },
      ic_anadolu: { vsNational: { ranking: 3 } },
      karadeniz: { vsNational: { ranking: 2 } },
      dogu_anadolu: { vsNational: { ranking: 1 } },
      guneydogu: { vsNational: { ranking: 2 } },
    }
    return benchmarks
  }),
  calculateRegionalRiskScore: vi.fn((region: TurkishRegion) => {
    const scores: Record<TurkishRegion, number> = {
      marmara: 75,
      ege: 55,
      akdeniz: 60,
      ic_anadolu: 45,
      karadeniz: 50,
      dogu_anadolu: 65,
      guneydogu: 55,
    }
    return scores[region]
  }),
  getProvincesByRegion: vi.fn((region: TurkishRegion) => {
    if (region === 'marmara') {
      return [{
        code: '34',
        name: 'Istanbul',
        nameTr: 'İstanbul',
        region: 'marmara',
        population: 15500000,
        coordinates: { lat: 41.0082, lng: 28.9784 },
      }]
    }
    return [{
      code: '06',
      name: 'Ankara',
      nameTr: 'Ankara',
      region: 'ic_anadolu',
      population: 5500000,
      coordinates: { lat: 39.9334, lng: 32.8597 },
    }]
  }),
}))

vi.mock('@/lib/market-data/region-detector', () => ({
  detectRegionFromAddress: vi.fn((address: string) => {
    if (address.toLowerCase().includes('istanbul')) return 'marmara'
    if (address.toLowerCase().includes('ankara')) return 'ic_anadolu'
    if (address.toLowerCase().includes('izmir')) return 'ege'
    return 'marmara'
  }),
}))

describe('Regional Benchmark Comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('compareRegions', () => {
    it('should compare two regions for a policy type', () => {
      const comparison = compareRegions('marmara', 'ic_anadolu', 'kasko')

      expect(comparison.sourceRegion).toBe('marmara')
      expect(comparison.targetRegion).toBe('ic_anadolu')
      expect(comparison.policyType).toBe('kasko')
      expect(comparison.premiumDifference).toBeDefined()
      expect(comparison.riskComparison).toBeDefined()
      expect(comparison.marketComparison).toBeDefined()
    })

    it('should calculate premium difference correctly', () => {
      const comparison = compareRegions('marmara', 'ic_anadolu', 'kasko')

      // Marmara kasko avg: 8000, IC Anadolu: 5500
      expect(comparison.premiumDifference.amount).toBe(5500 - 8000)
      expect(comparison.premiumDifference.percentage).toBeLessThan(0)
    })

    it('should include risk comparison', () => {
      const comparison = compareRegions('marmara', 'ic_anadolu', 'kasko')

      expect(comparison.riskComparison.sourceRiskScore).toBe(75)
      expect(comparison.riskComparison.targetRiskScore).toBe(45)
    })

    it('should include market comparison', () => {
      const comparison = compareRegions('marmara', 'ic_anadolu', 'kasko')

      expect(comparison.marketComparison.sourcePenetration).toBe(0.35)
      expect(comparison.marketComparison.targetPenetration).toBe(0.25)
    })

    it('should generate insights', () => {
      const comparison = compareRegions('marmara', 'ic_anadolu', 'kasko')

      expect(comparison.insights.length).toBeGreaterThan(0)
      expect(comparison.insights.some(i => i.category === 'premium' || i.category === 'risk')).toBe(true)
    })
  })

  describe('compareAllRegions', () => {
    it('should compare all regions against a source', () => {
      const comparisons = compareAllRegions('marmara', 'kasko')

      // Should exclude source region
      expect(comparisons.length).toBe(6)
      expect(comparisons.every(c => c.sourceRegion === 'marmara')).toBe(true)
      expect(comparisons.some(c => c.targetRegion === 'marmara')).toBe(false)
    })

    it('should sort by premium difference', () => {
      const comparisons = compareAllRegions('marmara', 'kasko')

      // Should be sorted from lowest to highest premium
      for (let i = 0; i < comparisons.length - 1; i++) {
        expect(comparisons[i].premiumDifference.amount)
          .toBeLessThanOrEqual(comparisons[i + 1].premiumDifference.amount)
      }
    })
  })

  describe('analyzeLocation', () => {
    it('should analyze location for insurance purposes', () => {
      const analysis = analyzeLocation('Istanbul, Turkey')

      expect(analysis.region).toBe('marmara')
      expect(analysis.riskProfile).toBeDefined()
      expect(analysis.overallRiskScore).toBe(75)
      expect(analysis.insuranceStats).toBeDefined()
      expect(analysis.recommendations).toBeDefined()
    })

    it('should match province from address', () => {
      const analysis = analyzeLocation('Kadıköy, Istanbul')

      expect(analysis.province.name).toBe('Istanbul')
      expect(analysis.confidence).toBeGreaterThan(0.5)
    })

    it('should generate location recommendations', () => {
      const analysis = analyzeLocation('Istanbul')

      expect(analysis.recommendations.length).toBeGreaterThan(0)
      // High earthquake zone should trigger DASK recommendation
      expect(analysis.recommendations.some(r => r.title.includes('DASK'))).toBe(true)
    })

    it('should include premium benchmarks for all policy types', () => {
      const analysis = analyzeLocation('Istanbul')

      expect(analysis.premiumBenchmarks.kasko).toBeDefined()
      expect(analysis.premiumBenchmarks.traffic).toBeDefined()
      expect(analysis.premiumBenchmarks.home).toBeDefined()
    })
  })

  describe('compareNearbyProvinces', () => {
    it('should find and compare nearby provinces', () => {
      const province = {
        code: '34' as const,
        name: 'Istanbul',
        nameTr: 'İstanbul',
        region: 'marmara' as TurkishRegion,
        population: 15500000,
        coordinates: { lat: 41.0082, lng: 28.9784 },
        area: 5461,
        density: 2838,
        urbanRatio: 0.99,
      }

      const comparison = compareNearbyProvinces(province, 'kasko')

      expect(comparison.currentProvince).toEqual(province)
      expect(comparison.nearbyProvinces).toBeDefined()
    })

    it('should calculate distances', () => {
      const province = {
        code: '34' as const,
        name: 'Istanbul',
        nameTr: 'İstanbul',
        region: 'marmara' as TurkishRegion,
        population: 15500000,
        coordinates: { lat: 41.0082, lng: 28.9784 },
        area: 5461,
        density: 2838,
        urbanRatio: 0.99,
      }

      const comparison = compareNearbyProvinces(province, 'kasko')

      for (const nearby of comparison.nearbyProvinces) {
        expect(nearby.distance).toBeGreaterThan(0)
        expect(nearby.distance).toBeLessThanOrEqual(300)
      }
    })
  })

  describe('getNationalStatistics', () => {
    it('should return national aggregate statistics', () => {
      const stats = getNationalStatistics()

      expect(stats.totalPolicies).toBeGreaterThan(0)
      expect(stats.totalPremiumVolume).toBeGreaterThan(0)
      expect(stats.marketPenetration).toBeGreaterThan(0)
    })

    it('should include regional breakdown', () => {
      const stats = getNationalStatistics()

      expect(stats.byRegion.marmara).toBeDefined()
      expect(stats.byRegion.ege).toBeDefined()
      expect(stats.byRegion.marmara.policyCount).toBeGreaterThan(0)
    })

    it('should include policy type breakdown', () => {
      const stats = getNationalStatistics()

      expect(stats.byPolicyType.kasko).toBeDefined()
      expect(stats.byPolicyType.traffic).toBeDefined()
      expect(stats.byPolicyType.kasko.policyCount).toBeGreaterThan(0)
    })

    it('should calculate market shares', () => {
      const stats = getNationalStatistics()

      let totalShare = 0
      for (const region of Object.keys(stats.byRegion)) {
        totalShare += stats.byRegion[region as TurkishRegion].marketShare
      }

      expect(totalShare).toBeCloseTo(1, 2)
    })

    it('should include trends data', () => {
      const stats = getNationalStatistics()

      expect(stats.trends.yoyGrowth).toBeDefined()
      expect(stats.trends.projectedGrowth).toBeDefined()
    })
  })

  describe('getRegionalRankings', () => {
    it('should rank regions by premium', () => {
      const rankings = getRegionalRankings('kasko', 'premium')

      expect(rankings.rankings.length).toBe(7)
      expect(rankings.rankings[0].rank).toBe(1)
      expect(rankings.rankings[6].rank).toBe(7)
    })

    it('should rank regions by risk', () => {
      const rankings = getRegionalRankings('kasko', 'risk')

      expect(rankings.rankings.length).toBe(7)
      expect(rankings.metric).toBe('risk')
    })

    it('should rank regions by penetration', () => {
      const rankings = getRegionalRankings('home', 'penetration')

      expect(rankings.rankings.length).toBe(7)
      // Marmara has highest penetration (0.35)
      expect(rankings.rankings[0].region).toBe('marmara')
    })

    it('should include vs average comparison', () => {
      const rankings = getRegionalRankings('kasko', 'premium')

      for (const ranking of rankings.rankings) {
        expect(ranking.vsAverage).toBeDefined()
        expect(typeof ranking.vsAverage).toBe('number')
      }
    })

    it('should generate insights', () => {
      const rankings = getRegionalRankings('kasko', 'premium')

      expect(rankings.insights.length).toBeGreaterThan(0)
    })

    it('should rank regions by claims ratio', () => {
      const rankings = getRegionalRankings('kasko', 'claims')

      expect(rankings.rankings.length).toBe(7)
      expect(rankings.metric).toBe('claims')
      // Claims should be sorted ascending (lower is better)
      for (let i = 0; i < rankings.rankings.length - 1; i++) {
        expect(rankings.rankings[i].value).toBeLessThanOrEqual(rankings.rankings[i + 1].value)
      }
    })

    it('should rank regions by value (coverage/premium ratio)', () => {
      const rankings = getRegionalRankings('kasko', 'value')

      expect(rankings.rankings.length).toBe(7)
      expect(rankings.metric).toBe('value')
      // Value should be sorted descending (higher is better)
      for (let i = 0; i < rankings.rankings.length - 1; i++) {
        expect(rankings.rankings[i].value).toBeGreaterThanOrEqual(rankings.rankings[i + 1].value)
      }
    })

    it('should handle unknown metric with default value of 0', () => {
      // This tests the default case in the switch statement (line 506)
      const rankings = getRegionalRankings('kasko', 'unknown_metric' as 'premium')

      expect(rankings.rankings.length).toBe(7)
      // All values should be 0 for unknown metric
      for (const ranking of rankings.rankings) {
        expect(ranking.value).toBe(0)
      }
    })

    it('should calculate vsAverage correctly for claims', () => {
      const rankings = getRegionalRankings('home', 'claims')

      // Each ranking should have vsAverage relative to the national average
      const avgValue = rankings.rankings.reduce((sum, r) => sum + r.value, 0) / rankings.rankings.length
      expect(avgValue).toBeGreaterThan(0)

      // First ranked (lowest claims) should have negative vsAverage
      expect(rankings.rankings[0].vsAverage).toBeLessThanOrEqual(0)
    })

    it('should calculate value metric using penetration/premium formula', () => {
      const rankings = getRegionalRankings('traffic', 'value')

      // Value = penetration / (avgPremium / 10000)
      // Higher penetration with lower premium = higher value
      expect(rankings.rankings[0].value).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle comparison of same region', () => {
      const comparison = compareRegions('marmara', 'marmara', 'kasko')

      expect(comparison.premiumDifference.amount).toBe(0)
      expect(comparison.premiumDifference.percentage).toBe(0)
    })

    it('should detect earthquake zone differences as primary risk', () => {
      // Marmara is zone 1, ic_anadolu is zone 2
      const comparison = compareRegions('marmara', 'ic_anadolu', 'home')

      expect(comparison.riskComparison.primaryRiskDifference).toContain('Earthquake zone')
    })

    it('should detect crime rate difference when zones are same', () => {
      // ege and akdeniz both have zone 2, but different crime rates
      const comparison = compareRegions('ege', 'akdeniz', 'home')

      // Crime rate diff: 100 vs 120 = 20, not > 50, so should check flood
      expect(comparison.riskComparison.primaryRiskDifference).toBeDefined()
    })

    it('should generate advantage insights for lower target premiums', () => {
      const comparison = compareRegions('marmara', 'ic_anadolu', 'kasko')

      const premiumInsight = comparison.insights.find(i => i.category === 'premium')
      expect(premiumInsight).toBeDefined()
      expect(premiumInsight?.type).toBe('advantage')
      expect(premiumInsight?.messageTr).toBeDefined()
    })

    it('should generate disadvantage insights for higher target premiums', () => {
      const comparison = compareRegions('ic_anadolu', 'marmara', 'kasko')

      const premiumInsight = comparison.insights.find(i => i.category === 'premium')
      expect(premiumInsight).toBeDefined()
      expect(premiumInsight?.type).toBe('disadvantage')
    })

    it('should generate risk advantage insight for lower target risk', () => {
      // Marmara risk: 75, ic_anadolu risk: 45, diff > 10
      const comparison = compareRegions('marmara', 'ic_anadolu', 'home')

      const riskInsight = comparison.insights.find(i => i.category === 'risk')
      expect(riskInsight).toBeDefined()
      expect(riskInsight?.type).toBe('advantage')
    })

    it('should generate risk disadvantage insight for higher target risk', () => {
      // ic_anadolu risk: 45, marmara risk: 75, diff > 10
      const comparison = compareRegions('ic_anadolu', 'marmara', 'home')

      const riskInsight = comparison.insights.find(i => i.category === 'risk')
      expect(riskInsight).toBeDefined()
      expect(riskInsight?.type).toBe('disadvantage')
    })

    it('should generate market competition insight when target has higher penetration', () => {
      // ic_anadolu penetration: 0.25, marmara: 0.35, diff > 0.05
      const comparison = compareRegions('ic_anadolu', 'marmara', 'kasko')

      const marketInsight = comparison.insights.find(i => i.category === 'market')
      expect(marketInsight).toBeDefined()
      expect(marketInsight?.type).toBe('neutral')
    })

    it('should assign high confidence for exact province match in address', () => {
      const analysis = analyzeLocation('İstanbul, Türkiye')

      expect(analysis.confidence).toBe(0.9)
    })

    it('should assign medium confidence for longer unmatched addresses', () => {
      const analysis = analyzeLocation('Some random address with many words but no match')

      expect(analysis.confidence).toBe(0.7)
    })

    it('should assign low confidence for short unmatched addresses', () => {
      const analysis = analyzeLocation('XYZ')

      expect(analysis.confidence).toBe(0.5)
    })

    it('should generate location-based recommendations', () => {
      // Test that recommendations are generated for any location
      const analysis = analyzeLocation('Istanbul')

      // Should have recommendations based on the region's risk profile
      expect(analysis.recommendations).toBeDefined()
      expect(Array.isArray(analysis.recommendations)).toBe(true)
    })

    it('should include DASK recommendation for earthquake-prone areas', () => {
      // Marmara is in earthquake zone 1
      const analysis = analyzeLocation('Istanbul')

      // Should include DASK recommendation for high earthquake zone
      const daskRec = analysis.recommendations.find(r => r.title.includes('DASK'))
      expect(daskRec).toBeDefined()
    })

    it('should include risk ranking in location analysis', () => {
      const analysis = analyzeLocation('Istanbul')

      expect(analysis.riskRanking).toBeGreaterThan(0)
      expect(analysis.riskRanking).toBeLessThanOrEqual(7)
    })
  })
})
