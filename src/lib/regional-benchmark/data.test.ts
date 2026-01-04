/**
 * Regional Benchmark Data Tests
 *
 * Tests for Turkish province and region-level insurance benchmarks
 */

import { describe, it, expect } from 'vitest'
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
import type { TurkishRegion } from '@/types/market-data'

describe('Regional Benchmark Data', () => {
  describe('PROVINCES', () => {
    it('should define major Turkish provinces', () => {
      expect(PROVINCES['34']).toBeDefined() // İstanbul
      expect(PROVINCES['06']).toBeDefined() // Ankara
      expect(PROVINCES['35']).toBeDefined() // İzmir
    })

    it('should have valid province data structure', () => {
      const istanbul = PROVINCES['34']

      expect(istanbul.code).toBe('34')
      expect(istanbul.name).toBe('İstanbul')
      expect(istanbul.nameTr).toBe('İstanbul')
      expect(istanbul.region).toBe('marmara')
      expect(istanbul.population).toBeGreaterThan(0)
      expect(istanbul.area).toBeGreaterThan(0)
      expect(istanbul.density).toBeGreaterThan(0)
      expect(istanbul.urbanRatio).toBeGreaterThan(0)
      expect(istanbul.urbanRatio).toBeLessThanOrEqual(1)
    })

    it('should have coordinates for each province', () => {
      Object.values(PROVINCES).forEach((province) => {
        expect(province.coordinates).toBeDefined()
        expect(province.coordinates.lat).toBeDefined()
        expect(province.coordinates.lng).toBeDefined()
      })
    })

    it('should have valid regions for all provinces', () => {
      const validRegions: TurkishRegion[] = [
        'marmara',
        'ege',
        'akdeniz',
        'ic_anadolu',
        'karadeniz',
        'dogu_anadolu',
        'guneydogu',
      ]

      Object.values(PROVINCES).forEach((province) => {
        expect(validRegions).toContain(province.region)
      })
    })
  })

  describe('REGIONAL_RISK_PROFILES', () => {
    const regions: TurkishRegion[] = [
      'marmara',
      'ege',
      'akdeniz',
      'ic_anadolu',
      'karadeniz',
      'dogu_anadolu',
      'guneydogu',
    ]

    it('should define risk profiles for all regions', () => {
      regions.forEach((region) => {
        expect(REGIONAL_RISK_PROFILES[region]).toBeDefined()
      })
    })

    it('should have valid earthquake data', () => {
      regions.forEach((region) => {
        const profile = REGIONAL_RISK_PROFILES[region]

        expect(profile.earthquake).toBeDefined()
        expect([1, 2, 3, 4, 5]).toContain(profile.earthquake.zone)
        expect(profile.earthquake.historicalEvents).toBeGreaterThanOrEqual(0)
        expect(profile.earthquake.avgMagnitude).toBeGreaterThan(0)
      })
    })

    it('should have valid flood data', () => {
      regions.forEach((region) => {
        const profile = REGIONAL_RISK_PROFILES[region]

        expect(profile.flood).toBeDefined()
        expect(profile.flood.annualFrequency).toBeGreaterThanOrEqual(0)
        expect(profile.flood.avgDamage).toBeGreaterThan(0)
      })
    })

    it('should have valid fire data', () => {
      regions.forEach((region) => {
        const profile = REGIONAL_RISK_PROFILES[region]

        expect(profile.fire).toBeDefined()
        expect(profile.fire.urbanFireRate).toBeGreaterThan(0)
      })
    })

    it('should have valid crime data', () => {
      regions.forEach((region) => {
        const profile = REGIONAL_RISK_PROFILES[region]

        expect(profile.crime).toBeDefined()
        expect(profile.crime.theftRate).toBeGreaterThanOrEqual(0)
        expect(profile.crime.vehicleTheftRate).toBeGreaterThanOrEqual(0)
        expect(profile.crime.burglaryRate).toBeGreaterThanOrEqual(0)
      })
    })

    it('should have valid traffic data', () => {
      regions.forEach((region) => {
        const profile = REGIONAL_RISK_PROFILES[region]

        expect(profile.traffic).toBeDefined()
        expect(profile.traffic.accidentRate).toBeGreaterThan(0)
        expect(profile.traffic.fatalityRate).toBeGreaterThan(0)
      })
    })

    it('should have valid health data', () => {
      regions.forEach((region) => {
        const profile = REGIONAL_RISK_PROFILES[region]

        expect(profile.health).toBeDefined()
        expect(profile.health.hospitalDensity).toBeGreaterThan(0)
        expect(profile.health.avgResponseTime).toBeGreaterThan(0)
      })
    })

    it('should have Marmara as high earthquake risk', () => {
      expect(REGIONAL_RISK_PROFILES.marmara.earthquake.zone).toBe(1)
      expect(REGIONAL_RISK_PROFILES.marmara.earthquake.level).toBe('very_high')
    })

    it('should have Karadeniz as high flood risk', () => {
      expect(REGIONAL_RISK_PROFILES.karadeniz.flood.level).toBe('high')
    })
  })

  describe('REGIONAL_INSURANCE_STATS', () => {
    const regions: TurkishRegion[] = [
      'marmara',
      'ege',
      'akdeniz',
      'ic_anadolu',
      'karadeniz',
      'dogu_anadolu',
      'guneydogu',
    ]

    it('should define insurance stats for all regions', () => {
      regions.forEach((region) => {
        expect(REGIONAL_INSURANCE_STATS[region]).toBeDefined()
      })
    })

    it('should have valid market data', () => {
      regions.forEach((region) => {
        const stats = REGIONAL_INSURANCE_STATS[region]

        expect(stats.totalPolicies).toBeGreaterThan(0)
        expect(stats.totalPremiumVolume).toBeGreaterThan(0)
        expect(stats.marketPenetration).toBeGreaterThan(0)
        expect(stats.marketPenetration).toBeLessThanOrEqual(1)
        expect(stats.insurancePerCapita).toBeGreaterThan(0)
      })
    })

    it('should have policy distribution data', () => {
      regions.forEach((region) => {
        const stats = REGIONAL_INSURANCE_STATS[region]
        const policyTypes = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']

        policyTypes.forEach((type) => {
          expect(
            stats.policyDistribution[type as keyof typeof stats.policyDistribution]
          ).toBeDefined()
        })
      })
    })

    it('should have claims data', () => {
      regions.forEach((region) => {
        const stats = REGIONAL_INSURANCE_STATS[region]

        expect(stats.claimsData).toBeDefined()
        expect(stats.claimsData.totalClaims).toBeGreaterThan(0)
        expect(stats.claimsData.claimsPaid).toBeGreaterThan(0)
        expect(stats.claimsData.avgClaimAmount).toBeGreaterThan(0)
        expect(stats.claimsData.claimsRatio).toBeGreaterThan(0)
        expect(stats.claimsData.claimsRatio).toBeLessThanOrEqual(1)
        expect(stats.claimsData.avgSettlementDays).toBeGreaterThan(0)
      })
    })

    it('should have growth data', () => {
      regions.forEach((region) => {
        const stats = REGIONAL_INSURANCE_STATS[region]

        expect(stats.growth).toBeDefined()
        expect(stats.growth.yoyPremiumGrowth).toBeDefined()
        expect(stats.growth.yoyPolicyGrowth).toBeDefined()
        expect(stats.growth.yoyClaimsGrowth).toBeDefined()
      })
    })

    it('should have Marmara as highest premium region', () => {
      const marmaraPerCapita = REGIONAL_INSURANCE_STATS.marmara.insurancePerCapita
      Object.values(REGIONAL_INSURANCE_STATS).forEach((stats) => {
        expect(marmaraPerCapita).toBeGreaterThanOrEqual(stats.insurancePerCapita)
      })
    })
  })

  describe('getProvince', () => {
    it('should return correct province by code', () => {
      const istanbul = getProvince('34')

      expect(istanbul).toBeDefined()
      expect(istanbul?.name).toBe('İstanbul')
    })

    it('should return undefined for invalid code', () => {
      const result = getProvince('99' as never)

      expect(result).toBeUndefined()
    })

    it('should return Ankara by code', () => {
      const ankara = getProvince('06')

      expect(ankara).toBeDefined()
      expect(ankara?.name).toBe('Ankara')
      expect(ankara?.region).toBe('ic_anadolu')
    })
  })

  describe('getProvincesByRegion', () => {
    it('should return provinces for Marmara region', () => {
      const provinces = getProvincesByRegion('marmara')

      expect(provinces.length).toBeGreaterThan(0)
      provinces.forEach((p) => {
        expect(p.region).toBe('marmara')
      })
    })

    it('should return provinces for each region', () => {
      const regions: TurkishRegion[] = [
        'marmara',
        'ege',
        'akdeniz',
        'ic_anadolu',
        'karadeniz',
        'dogu_anadolu',
        'guneydogu',
      ]

      regions.forEach((region) => {
        const provinces = getProvincesByRegion(region)
        expect(Array.isArray(provinces)).toBe(true)
      })
    })

    it('should include Istanbul in Marmara', () => {
      const provinces = getProvincesByRegion('marmara')
      const istanbul = provinces.find((p) => p.name === 'İstanbul')

      expect(istanbul).toBeDefined()
    })
  })

  describe('getRegionalRiskProfile', () => {
    it('should return risk profile for Marmara', () => {
      const profile = getRegionalRiskProfile('marmara')

      expect(profile).toBeDefined()
      expect(profile.region).toBe('marmara')
    })

    it('should return risk profile for all regions', () => {
      const regions: TurkishRegion[] = [
        'marmara',
        'ege',
        'akdeniz',
        'ic_anadolu',
        'karadeniz',
        'dogu_anadolu',
        'guneydogu',
      ]

      regions.forEach((region) => {
        const profile = getRegionalRiskProfile(region)
        expect(profile).toBeDefined()
        expect(profile.region).toBe(region)
      })
    })
  })

  describe('getRegionalInsuranceStats', () => {
    it('should return stats for Marmara', () => {
      const stats = getRegionalInsuranceStats('marmara')

      expect(stats).toBeDefined()
      expect(stats.region).toBe('marmara')
    })

    it('should return stats for all regions', () => {
      const regions: TurkishRegion[] = [
        'marmara',
        'ege',
        'akdeniz',
        'ic_anadolu',
        'karadeniz',
        'dogu_anadolu',
        'guneydogu',
      ]

      regions.forEach((region) => {
        const stats = getRegionalInsuranceStats(region)
        expect(stats).toBeDefined()
        expect(stats.region).toBe(region)
      })
    })
  })

  describe('calculateRegionalRiskScore', () => {
    it('should return valid risk score for all regions', () => {
      const regions: TurkishRegion[] = [
        'marmara',
        'ege',
        'akdeniz',
        'ic_anadolu',
        'karadeniz',
        'dogu_anadolu',
        'guneydogu',
      ]

      regions.forEach((region) => {
        const score = calculateRegionalRiskScore(region)

        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      })
    })

    it('should return higher score for high-risk regions', () => {
      const marmaraScore = calculateRegionalRiskScore('marmara')
      const icAnadoluScore = calculateRegionalRiskScore('ic_anadolu')

      // Marmara has higher earthquake risk
      expect(marmaraScore).toBeGreaterThan(icAnadoluScore)
    })

    it('should return integer score', () => {
      const score = calculateRegionalRiskScore('marmara')

      expect(Number.isInteger(score)).toBe(true)
    })
  })

  describe('getRegionalPremiumBenchmarks', () => {
    it('should return benchmarks for kasko', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')

      expect(benchmarks).toBeDefined()
      expect(benchmarks.marmara).toBeDefined()
      expect(benchmarks.ege).toBeDefined()
    })

    it('should have valid benchmark structure', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')
      const marmaraBenchmark = benchmarks.marmara

      expect(marmaraBenchmark.region).toBe('marmara')
      expect(marmaraBenchmark.policyType).toBe('kasko')
      expect(marmaraBenchmark.premium).toBeDefined()
      expect(marmaraBenchmark.vsNational).toBeDefined()
      expect(marmaraBenchmark.factors).toBeDefined()
      expect(marmaraBenchmark.trend).toBeDefined()
    })

    it('should have valid premium data', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')
      const marmaraBenchmark = benchmarks.marmara

      expect(marmaraBenchmark.premium.min).toBeLessThan(marmaraBenchmark.premium.max)
      expect(marmaraBenchmark.premium.average).toBeGreaterThan(0)
      expect(marmaraBenchmark.premium.percentile10).toBeLessThan(
        marmaraBenchmark.premium.percentile90
      )
    })

    it('should have valid national comparison', () => {
      const benchmarks = getRegionalPremiumBenchmarks('kasko')
      const marmaraBenchmark = benchmarks.marmara

      expect(marmaraBenchmark.vsNational.ranking).toBeGreaterThanOrEqual(1)
      expect(marmaraBenchmark.vsNational.ranking).toBeLessThanOrEqual(
        marmaraBenchmark.vsNational.totalRegions
      )
    })

    it('should return benchmarks for all policy types', () => {
      const policyTypes = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business'] as const

      policyTypes.forEach((type) => {
        const benchmarks = getRegionalPremiumBenchmarks(type)
        expect(benchmarks).toBeDefined()
        expect(Object.keys(benchmarks).length).toBe(7)
      })
    })
  })

  describe('getRankedRegions', () => {
    it('should return ranked regions by premium', () => {
      const ranked = getRankedRegions('premium')

      expect(ranked).toBeDefined()
      expect(ranked.length).toBe(7)
      ranked.forEach((item, index) => {
        expect(item.rank).toBe(index + 1)
        expect(item.region).toBeDefined()
        expect(item.value).toBeDefined()
      })
    })

    it('should return ranked regions by risk', () => {
      const ranked = getRankedRegions('risk')

      expect(ranked).toBeDefined()
      expect(ranked.length).toBe(7)
    })

    it('should return ranked regions by penetration', () => {
      const ranked = getRankedRegions('penetration')

      expect(ranked).toBeDefined()
      expect(ranked.length).toBe(7)
    })

    it('should return ranked regions by claims', () => {
      const ranked = getRankedRegions('claims')

      expect(ranked).toBeDefined()
      expect(ranked.length).toBe(7)
    })

    it('should accept policy type for premium ranking', () => {
      const ranked = getRankedRegions('premium', 'kasko')

      expect(ranked).toBeDefined()
      expect(ranked.length).toBe(7)
    })

    it('should be sorted ascending by value', () => {
      const ranked = getRankedRegions('penetration')

      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].value).toBeGreaterThanOrEqual(ranked[i - 1].value)
      }
    })
  })
})
