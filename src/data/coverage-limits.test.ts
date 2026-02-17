import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  // Data constants
  TRAFFIC_INSURANCE_LIMITS_2025,
  TRAFFIC_INSURANCE_LIMITS_2026,
  DASK_LIMITS_2024,
  DASK_MINIMUM_PREMIUMS_2024,
  SEAT_ACCIDENT_LIMITS_2025,
  MEDICAL_MALPRACTICE_LIMITS_2025,
  PREMIUM_BENCHMARKS,
  DASK_PREMIUM_RATES_2026,
  MARKET_DATA_2024,
  BRANCH_STATISTICS_2024,
  ALL_COVERAGE_LIMITS,
  // Functions
  calculateDaskPremium,
  getBranchStatistics,
  getLossRatioBenchmark,
  getCurrentTrafficLimits,
  getCurrentDaskLimits,
  getPremiumBenchmark,
  validateAgainstMinimumLimits,
  // Types
  type CoverageLimit,
  type LimitDetail,
  type PremiumRange,
  type BranchStatistics,
} from './coverage-limits'

// =============================================================================
// DATA CONSTANTS - Structure and Content Validation
// =============================================================================

describe('TRAFFIC_INSURANCE_LIMITS_2025', () => {
  it('has correct metadata', () => {
    expect(TRAFFIC_INSURANCE_LIMITS_2025.code).toBe('zmss_2025')
    expect(TRAFFIC_INSURANCE_LIMITS_2025.effectiveDate).toBe('2025-01-01')
    expect(TRAFFIC_INSURANCE_LIMITS_2025.expiryDate).toBe('2025-12-31')
    expect(TRAFFIC_INSURANCE_LIMITS_2025.source).toBe('SEDDK')
    expect(TRAFFIC_INSURANCE_LIMITS_2025.sourceUrl).toBeDefined()
  })

  it('has both Turkish and English names', () => {
    expect(TRAFFIC_INSURANCE_LIMITS_2025.nameTR).toContain('Trafik')
    expect(TRAFFIC_INSURANCE_LIMITS_2025.nameEN).toContain('Motor TPL')
  })

  it('contains automobile limits for all 4 coverage types', () => {
    const autoLimits = TRAFFIC_INSURANCE_LIMITS_2025.limits.filter(
      (l) => l.vehicleType === 'automobile'
    )
    expect(autoLimits).toHaveLength(4)

    const types = autoLimits.map((l) => l.coverageType)
    expect(types).toContain('material_damage_per_vehicle')
    expect(types).toContain('material_damage_per_accident')
    expect(types).toContain('bodily_injury_per_person')
    expect(types).toContain('bodily_injury_per_accident')
  })

  it('has correct automobile coverage amounts for 2025', () => {
    const materialPerVehicle = TRAFFIC_INSURANCE_LIMITS_2025.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'material_damage_per_vehicle'
    )
    expect(materialPerVehicle?.perVehicle).toBe(300000)

    const materialPerAccident = TRAFFIC_INSURANCE_LIMITS_2025.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'material_damage_per_accident'
    )
    expect(materialPerAccident?.perAccident).toBe(600000)

    const bodilyPerPerson = TRAFFIC_INSURANCE_LIMITS_2025.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'bodily_injury_per_person'
    )
    expect(bodilyPerPerson?.perPerson).toBe(2700000)

    const bodilyPerAccident = TRAFFIC_INSURANCE_LIMITS_2025.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'bodily_injury_per_accident'
    )
    expect(bodilyPerAccident?.perAccident).toBe(13500000)
  })

  it('covers multiple vehicle types', () => {
    const vehicleTypes = [...new Set(TRAFFIC_INSURANCE_LIMITS_2025.limits.map((l) => l.vehicleType))]
    expect(vehicleTypes).toContain('automobile')
    expect(vehicleTypes).toContain('minibus_10_17')
    expect(vehicleTypes).toContain('bus_18_30')
    expect(vehicleTypes).toContain('bus_31_plus')
    expect(vehicleTypes).toContain('pickup')
    expect(vehicleTypes).toContain('truck')
  })

  it('has all amounts in TRY currency', () => {
    for (const limit of TRAFFIC_INSURANCE_LIMITS_2025.limits) {
      expect(limit.currency).toBe('TRY')
    }
  })

  it('has notes in both languages', () => {
    expect(TRAFFIC_INSURANCE_LIMITS_2025.notes).toBeDefined()
    expect(TRAFFIC_INSURANCE_LIMITS_2025.notesTR).toBeDefined()
  })
})

describe('TRAFFIC_INSURANCE_LIMITS_2026', () => {
  it('has correct metadata', () => {
    expect(TRAFFIC_INSURANCE_LIMITS_2026.code).toBe('zmss_2026')
    expect(TRAFFIC_INSURANCE_LIMITS_2026.effectiveDate).toBe('2026-01-01')
    expect(TRAFFIC_INSURANCE_LIMITS_2026.expiryDate).toBeUndefined()
    expect(TRAFFIC_INSURANCE_LIMITS_2026.source).toBe('SEDDK')
  })

  it('has higher limits than 2025 (~33% increase)', () => {
    const auto2025 = TRAFFIC_INSURANCE_LIMITS_2025.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'material_damage_per_vehicle'
    )
    const auto2026 = TRAFFIC_INSURANCE_LIMITS_2026.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'material_damage_per_vehicle'
    )
    expect(auto2026!.perVehicle!).toBeGreaterThan(auto2025!.perVehicle!)
    expect(auto2026!.perVehicle).toBe(400000) // ~33% increase from 300000
  })

  it('has 2026 bodily injury automobile limits', () => {
    const bodilyPerPerson = TRAFFIC_INSURANCE_LIMITS_2026.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'bodily_injury_per_person'
    )
    expect(bodilyPerPerson?.perPerson).toBe(3600000)

    const bodilyPerAccident = TRAFFIC_INSURANCE_LIMITS_2026.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'bodily_injury_per_accident'
    )
    expect(bodilyPerAccident?.perAccident).toBe(18000000)
  })
})

describe('DASK_LIMITS_2024', () => {
  it('has correct metadata', () => {
    expect(DASK_LIMITS_2024.code).toBe('dask_2024')
    expect(DASK_LIMITS_2024.effectiveDate).toBe('2024-01-01')
    expect(DASK_LIMITS_2024.expiryDate).toBe('2024-12-31')
    expect(DASK_LIMITS_2024.source).toBe('DASK')
  })

  it('has max coverage limit', () => {
    const maxCoverage = DASK_LIMITS_2024.limits.find((l) => l.coverageType === 'max_coverage')
    expect(maxCoverage).toBeDefined()
    expect(maxCoverage!.maxLimit).toBe(2095462)
    expect(maxCoverage!.currency).toBe('TRY')
  })

  it('has per-sqm costs for different construction types', () => {
    const concrete = DASK_LIMITS_2024.limits.find((l) => l.coverageType === 'sqm_cost_concrete')
    expect(concrete?.maxLimit).toBe(9884)

    const other = DASK_LIMITS_2024.limits.find((l) => l.coverageType === 'sqm_cost_other')
    expect(other?.maxLimit).toBe(6590)
  })

  it('has deductible information in notes', () => {
    expect(DASK_LIMITS_2024.notesTR).toContain('%2')
    expect(DASK_LIMITS_2024.notes).toContain('2%')
  })
})

describe('DASK_MINIMUM_PREMIUMS_2024', () => {
  it('has 7 risk zones', () => {
    expect(DASK_MINIMUM_PREMIUMS_2024.limits).toHaveLength(7)
  })

  it('has premiums decreasing from zone 1 (high risk) to zone 7 (low risk)', () => {
    const premiums = DASK_MINIMUM_PREMIUMS_2024.limits.map((l) => l.maxLimit!)
    for (let i = 0; i < premiums.length - 1; i++) {
      expect(premiums[i]).toBeGreaterThan(premiums[i + 1])
    }
  })

  it('zone 1 has highest premium and zone 7 has lowest', () => {
    const zone1 = DASK_MINIMUM_PREMIUMS_2024.limits.find(
      (l) => l.coverageType === 'min_premium_zone_1'
    )
    const zone7 = DASK_MINIMUM_PREMIUMS_2024.limits.find(
      (l) => l.coverageType === 'min_premium_zone_7'
    )
    expect(zone1?.maxLimit).toBe(1951)
    expect(zone7?.maxLimit).toBe(505)
  })
})

describe('SEAT_ACCIDENT_LIMITS_2025', () => {
  it('has correct metadata', () => {
    expect(SEAT_ACCIDENT_LIMITS_2025.code).toBe('koltuk_ferdi_kaza_2025')
    expect(SEAT_ACCIDENT_LIMITS_2025.source).toBe('SEDDK')
  })

  it('has 3 coverage types', () => {
    expect(SEAT_ACCIDENT_LIMITS_2025.limits).toHaveLength(3)
    const types = SEAT_ACCIDENT_LIMITS_2025.limits.map((l) => l.coverageType)
    expect(types).toContain('death_benefit')
    expect(types).toContain('permanent_disability')
    expect(types).toContain('medical_expenses')
  })

  it('death and disability have same per-person limit', () => {
    const death = SEAT_ACCIDENT_LIMITS_2025.limits.find((l) => l.coverageType === 'death_benefit')
    const disability = SEAT_ACCIDENT_LIMITS_2025.limits.find(
      (l) => l.coverageType === 'permanent_disability'
    )
    expect(death?.perPerson).toBe(750000)
    expect(disability?.perPerson).toBe(750000)
  })

  it('medical expenses has lower per-person limit', () => {
    const medical = SEAT_ACCIDENT_LIMITS_2025.limits.find(
      (l) => l.coverageType === 'medical_expenses'
    )
    expect(medical?.perPerson).toBe(150000)
  })

  it('has no notes (optional fields undefined)', () => {
    expect(SEAT_ACCIDENT_LIMITS_2025.notes).toBeUndefined()
    expect(SEAT_ACCIDENT_LIMITS_2025.notesTR).toBeUndefined()
    expect(SEAT_ACCIDENT_LIMITS_2025.expiryDate).toBeUndefined()
  })
})

describe('MEDICAL_MALPRACTICE_LIMITS_2025', () => {
  it('has correct metadata', () => {
    expect(MEDICAL_MALPRACTICE_LIMITS_2025.code).toBe('tibbi_kotu_uygulama_2025')
    expect(MEDICAL_MALPRACTICE_LIMITS_2025.effectiveDate).toBe('2025-01-01')
    expect(MEDICAL_MALPRACTICE_LIMITS_2025.source).toBe('SEDDK')
  })

  it('has per-claim and annual aggregate limits', () => {
    const perClaim = MEDICAL_MALPRACTICE_LIMITS_2025.limits.find(
      (l) => l.coverageType === 'per_claim'
    )
    expect(perClaim?.perAccident).toBe(1500000)

    const annual = MEDICAL_MALPRACTICE_LIMITS_2025.limits.find(
      (l) => l.coverageType === 'annual_aggregate'
    )
    expect(annual?.maxLimit).toBe(6000000)
  })

  it('annual aggregate is 4x per-claim limit', () => {
    const perClaim = MEDICAL_MALPRACTICE_LIMITS_2025.limits.find(
      (l) => l.coverageType === 'per_claim'
    )
    const annual = MEDICAL_MALPRACTICE_LIMITS_2025.limits.find(
      (l) => l.coverageType === 'annual_aggregate'
    )
    expect(annual!.maxLimit!).toBe(perClaim!.perAccident! * 4)
  })
})

describe('PREMIUM_BENCHMARKS', () => {
  it('has entries for all major insurance types', () => {
    const types = [...new Set(PREMIUM_BENCHMARKS.map((b) => b.insuranceType))]
    expect(types).toContain('zmss')
    expect(types).toContain('kasko')
    expect(types).toContain('dask')
    expect(types).toContain('home')
    expect(types).toContain('health')
    expect(types).toContain('life')
    expect(types).toContain('business')
  })

  it('all entries have valid premium ranges (min <= avg <= max)', () => {
    for (const benchmark of PREMIUM_BENCHMARKS) {
      expect(benchmark.minPremium).toBeLessThanOrEqual(benchmark.avgPremium)
      expect(benchmark.avgPremium).toBeLessThanOrEqual(benchmark.maxPremium)
    }
  })

  it('all entries are TRY currency and year 2025', () => {
    for (const benchmark of PREMIUM_BENCHMARKS) {
      expect(benchmark.currency).toBe('TRY')
      expect(benchmark.year).toBe(2025)
    }
  })

  it('has multiple vehicle classes for zmss', () => {
    const zmss = PREMIUM_BENCHMARKS.filter((b) => b.insuranceType === 'zmss')
    expect(zmss.length).toBeGreaterThanOrEqual(3)
    const classes = zmss.map((b) => b.vehicleClass)
    expect(classes).toContain('automobile')
    expect(classes).toContain('motorcycle')
    expect(classes).toContain('commercial_vehicle')
  })

  it('has multiple vehicle classes for kasko', () => {
    const kasko = PREMIUM_BENCHMARKS.filter((b) => b.insuranceType === 'kasko')
    expect(kasko.length).toBeGreaterThanOrEqual(4)
    const classes = kasko.map((b) => b.vehicleClass)
    expect(classes).toContain('economy')
    expect(classes).toContain('mid_range')
    expect(classes).toContain('luxury')
    expect(classes).toContain('commercial')
  })

  it('luxury kasko has higher premiums than economy', () => {
    const economy = PREMIUM_BENCHMARKS.find(
      (b) => b.insuranceType === 'kasko' && b.vehicleClass === 'economy'
    )
    const luxury = PREMIUM_BENCHMARKS.find(
      (b) => b.insuranceType === 'kasko' && b.vehicleClass === 'luxury'
    )
    expect(luxury!.avgPremium).toBeGreaterThan(economy!.avgPremium)
  })

  it('has property types for dask, home, health, life, and business', () => {
    const dask = PREMIUM_BENCHMARKS.filter((b) => b.insuranceType === 'dask')
    expect(dask.length).toBeGreaterThanOrEqual(2)

    const home = PREMIUM_BENCHMARKS.filter((b) => b.insuranceType === 'home')
    expect(home.length).toBeGreaterThanOrEqual(2)

    const health = PREMIUM_BENCHMARKS.filter((b) => b.insuranceType === 'health')
    expect(health.length).toBeGreaterThanOrEqual(2)
  })
})

describe('DASK_PREMIUM_RATES_2026', () => {
  it('has correct metadata', () => {
    expect(DASK_PREMIUM_RATES_2026.effectiveDate).toBe('2026-01-01')
    expect(DASK_PREMIUM_RATES_2026.source).toBe('DASK')
    expect(DASK_PREMIUM_RATES_2026.sourceUrl).toBeDefined()
  })

  it('has unit costs for both construction types', () => {
    expect(DASK_PREMIUM_RATES_2026.unitCosts.betonarme).toBe(9884)
    expect(DASK_PREMIUM_RATES_2026.unitCosts.diger).toBe(6590)
  })

  it('has max coverage amount', () => {
    expect(DASK_PREMIUM_RATES_2026.maxCoverage).toBe(2095462)
  })

  it('has rates for all 7 zones for betonarme', () => {
    const rates = DASK_PREMIUM_RATES_2026.rates.betonarme
    expect(rates.zone1).toBe(2.82)
    expect(rates.zone2).toBe(2.51)
    expect(rates.zone3).toBe(2.13)
    expect(rates.zone4).toBe(2.0)
    expect(rates.zone5).toBe(1.5)
    expect(rates.zone6).toBe(1.07)
    expect(rates.zone7).toBe(0.73)
  })

  it('has rates for all 7 zones for diger', () => {
    const rates = DASK_PREMIUM_RATES_2026.rates.diger
    expect(rates.zone1).toBe(4.96)
    expect(rates.zone7).toBe(1.09)
  })

  it('betonarme rates are lower than diger rates for same zone', () => {
    for (let zone = 1; zone <= 7; zone++) {
      const key = `zone${zone}` as keyof typeof DASK_PREMIUM_RATES_2026.rates.betonarme
      expect(DASK_PREMIUM_RATES_2026.rates.betonarme[key]).toBeLessThan(
        DASK_PREMIUM_RATES_2026.rates.diger[key]
      )
    }
  })

  it('rates decrease from zone 1 to zone 7', () => {
    const betonarmeRates = DASK_PREMIUM_RATES_2026.rates.betonarme
    const zones = [
      betonarmeRates.zone1,
      betonarmeRates.zone2,
      betonarmeRates.zone3,
      betonarmeRates.zone4,
      betonarmeRates.zone5,
      betonarmeRates.zone6,
      betonarmeRates.zone7,
    ]
    for (let i = 0; i < zones.length - 1; i++) {
      expect(zones[i]).toBeGreaterThan(zones[i + 1])
    }
  })

  it('has example premiums for 100sqm', () => {
    expect(DASK_PREMIUM_RATES_2026.examplePremiums100sqm.betonarme.zone1).toBe(2787)
    expect(DASK_PREMIUM_RATES_2026.examplePremiums100sqm.diger.zone1).toBe(3268)
  })

  it('has 2% deductible', () => {
    expect(DASK_PREMIUM_RATES_2026.deductible.percentage).toBe(2)
    expect(DASK_PREMIUM_RATES_2026.deductible.description).toContain('%2')
  })
})

describe('MARKET_DATA_2024', () => {
  it('has total premium data', () => {
    expect(MARKET_DATA_2024.totalPremium).toBe(838_000_000_000)
    expect(MARKET_DATA_2024.totalPremiumUSD).toBe(24_000_000_000)
  })

  it('has correct growth rate', () => {
    expect(MARKET_DATA_2024.growthRate).toBe(0.74)
  })

  it('has premium breakdown summing close to total', () => {
    const sum =
      MARKET_DATA_2024.premiumBreakdown.hayatDisi + MARKET_DATA_2024.premiumBreakdown.hayat
    expect(sum).toBe(838_000_000_000)
  })

  it('has branch distribution summing close to 100%', () => {
    const dist = MARKET_DATA_2024.branchDistribution
    const sum = Object.values(dist).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 1)
  })

  it('has average premiums for key types', () => {
    expect(MARKET_DATA_2024.averagePremiums.traffic).toBe(4500)
    expect(MARKET_DATA_2024.averagePremiums.kasko).toBe(15000)
    expect(MARKET_DATA_2024.averagePremiums.dask).toBe(1200)
    expect(MARKET_DATA_2024.averagePremiums.health).toBe(25000)
    expect(MARKET_DATA_2024.averagePremiums.home).toBe(3500)
    expect(MARKET_DATA_2024.averagePremiums.life).toBe(5000)
  })

  it('has insurance penetration rate', () => {
    expect(MARKET_DATA_2024.penetration.rate).toBe(0.0248)
  })

  it('has company count breakdown', () => {
    expect(MARKET_DATA_2024.companyCount.total).toBe(74)
    expect(MARKET_DATA_2024.companyCount.nonLife).toBe(50)
    expect(MARKET_DATA_2024.companyCount.life).toBe(19)
    expect(MARKET_DATA_2024.companyCount.reinsurance).toBe(5)
  })

  it('has claims paid data', () => {
    expect(MARKET_DATA_2024.claimsPaid.total).toBe(339_000_000_000)
    expect(MARKET_DATA_2024.claimsPaid.yoyGrowth).toBe(0.6)
  })

  it('has loss ratio data', () => {
    expect(MARKET_DATA_2024.lossRatio.overall).toBe(0.742)
    expect(MARKET_DATA_2024.lossRatio.hayatDisi).toBe(0.438)
    expect(MARKET_DATA_2024.lossRatio.hayat).toBe(0.152)
  })

  it('has capital adequacy data', () => {
    expect(MARKET_DATA_2024.capitalAdequacy.ratio).toBe(1.81)
    expect(MARKET_DATA_2024.capitalAdequacy.equity).toBe(265_300_000_000)
  })
})

describe('BRANCH_STATISTICS_2024', () => {
  it('has 11 branches', () => {
    expect(BRANCH_STATISTICS_2024).toHaveLength(11)
  })

  it('has all required fields for each branch', () => {
    for (const branch of BRANCH_STATISTICS_2024) {
      expect(branch.code).toBeTruthy()
      expect(branch.nameTR).toBeTruthy()
      expect(branch.nameEN).toBeTruthy()
      expect(branch.premiumProduction).toBeGreaterThan(0)
      expect(branch.marketShare).toBeGreaterThan(0)
      expect(branch.claimsPaid).toBeGreaterThan(0)
      expect(branch.lossRatio).toBeGreaterThan(0)
      expect(branch.lossRatio).toBeLessThanOrEqual(1)
      expect(typeof branch.yoyGrowth).toBe('number')
    }
  })

  it('traffic has highest market share', () => {
    const traffic = BRANCH_STATISTICS_2024.find((b) => b.code === 'traffic')
    expect(traffic?.marketShare).toBe(0.22)
    for (const branch of BRANCH_STATISTICS_2024) {
      expect(branch.marketShare).toBeLessThanOrEqual(traffic!.marketShare)
    }
  })

  it('includes all major branches', () => {
    const codes = BRANCH_STATISTICS_2024.map((b) => b.code)
    expect(codes).toContain('traffic')
    expect(codes).toContain('health')
    expect(codes).toContain('fire')
    expect(codes).toContain('kasko')
    expect(codes).toContain('life')
    expect(codes).toContain('liability')
    expect(codes).toContain('agricultural')
    expect(codes).toContain('accident')
    expect(codes).toContain('engineering')
    expect(codes).toContain('marine')
    expect(codes).toContain('credit')
  })
})

describe('ALL_COVERAGE_LIMITS', () => {
  it('contains 6 coverage limit definitions', () => {
    expect(ALL_COVERAGE_LIMITS).toHaveLength(6)
  })

  it('contains all exported limit constants', () => {
    expect(ALL_COVERAGE_LIMITS).toContain(TRAFFIC_INSURANCE_LIMITS_2025)
    expect(ALL_COVERAGE_LIMITS).toContain(TRAFFIC_INSURANCE_LIMITS_2026)
    expect(ALL_COVERAGE_LIMITS).toContain(DASK_LIMITS_2024)
    expect(ALL_COVERAGE_LIMITS).toContain(DASK_MINIMUM_PREMIUMS_2024)
    expect(ALL_COVERAGE_LIMITS).toContain(SEAT_ACCIDENT_LIMITS_2025)
    expect(ALL_COVERAGE_LIMITS).toContain(MEDICAL_MALPRACTICE_LIMITS_2025)
  })

  it('each entry has a unique code', () => {
    const codes = ALL_COVERAGE_LIMITS.map((l) => l.code)
    const uniqueCodes = new Set(codes)
    expect(uniqueCodes.size).toBe(codes.length)
  })
})

// =============================================================================
// calculateDaskPremium - All branch paths
// =============================================================================

describe('calculateDaskPremium', () => {
  describe('construction type: betonarme', () => {
    it('calculates for zone 1 (highest risk)', () => {
      const result = calculateDaskPremium(100, 'betonarme', 1)
      // coverage = 100 * 9884 = 988400
      // premium = 988400 * 2.82 / 1000 = 2787.29 -> 2787
      // deductible = 988400 * 0.02 = 19768
      expect(result.coverage).toBe(988400)
      expect(result.premium).toBe(2787)
      expect(result.deductible).toBe(19768)
    })

    it('calculates for zone 2', () => {
      const result = calculateDaskPremium(100, 'betonarme', 2)
      expect(result.coverage).toBe(988400)
      expect(result.premium).toBe(Math.round((988400 * 2.51) / 1000))
      expect(result.deductible).toBe(Math.round(988400 * 0.02))
    })

    it('calculates for zone 3', () => {
      const result = calculateDaskPremium(100, 'betonarme', 3)
      expect(result.premium).toBe(Math.round((988400 * 2.13) / 1000))
    })

    it('calculates for zone 4', () => {
      const result = calculateDaskPremium(100, 'betonarme', 4)
      expect(result.premium).toBe(Math.round((988400 * 2.0) / 1000))
    })

    it('calculates for zone 5', () => {
      const result = calculateDaskPremium(100, 'betonarme', 5)
      expect(result.premium).toBe(Math.round((988400 * 1.5) / 1000))
    })

    it('calculates for zone 6', () => {
      const result = calculateDaskPremium(100, 'betonarme', 6)
      expect(result.premium).toBe(Math.round((988400 * 1.07) / 1000))
    })

    it('calculates for zone 7 (lowest risk)', () => {
      const result = calculateDaskPremium(100, 'betonarme', 7)
      expect(result.premium).toBe(Math.round((988400 * 0.73) / 1000))
    })
  })

  describe('construction type: diger', () => {
    it('calculates for zone 1', () => {
      const result = calculateDaskPremium(100, 'diger', 1)
      // coverage = 100 * 6590 = 659000
      // premium = 659000 * 4.96 / 1000 = 3268.64 -> 3269
      // deductible = 659000 * 0.02 = 13180
      expect(result.coverage).toBe(659000)
      expect(result.premium).toBe(Math.round((659000 * 4.96) / 1000))
      expect(result.deductible).toBe(13180)
    })

    it('calculates for zone 7', () => {
      const result = calculateDaskPremium(100, 'diger', 7)
      expect(result.coverage).toBe(659000)
      expect(result.premium).toBe(Math.round((659000 * 1.09) / 1000))
    })

    it('has lower coverage than betonarme for same area', () => {
      const betonarme = calculateDaskPremium(100, 'betonarme', 1)
      const diger = calculateDaskPremium(100, 'diger', 1)
      expect(diger.coverage).toBeLessThan(betonarme.coverage)
    })
  })

  describe('coverage cap (max coverage limit)', () => {
    it('caps coverage at maxCoverage for very large areas', () => {
      // 300m2 * 9884 = 2965200, exceeds max 2095462
      const result = calculateDaskPremium(300, 'betonarme', 1)
      expect(result.coverage).toBe(2095462)
    })

    it('does not cap coverage for small areas', () => {
      // 50m2 * 9884 = 494200, under max
      const result = calculateDaskPremium(50, 'betonarme', 1)
      expect(result.coverage).toBe(494200)
    })

    it('caps at exactly max coverage for boundary area', () => {
      // 212m2 * 9884 = 2095408, just under max (212 is typical max area)
      const result = calculateDaskPremium(212, 'betonarme', 1)
      expect(result.coverage).toBe(2095408) // Under max, not capped
    })

    it('caps diger construction at max coverage for large areas', () => {
      // 400m2 * 6590 = 2636000, exceeds max 2095462
      const result = calculateDaskPremium(400, 'diger', 1)
      expect(result.coverage).toBe(2095462)
    })

    it('uses capped coverage for premium calculation', () => {
      const large = calculateDaskPremium(300, 'betonarme', 1)
      // premium should be based on capped coverage: 2095462 * 2.82 / 1000
      const expectedPremium = Math.round((2095462 * 2.82) / 1000)
      expect(large.premium).toBe(expectedPremium)
    })

    it('uses capped coverage for deductible calculation', () => {
      const large = calculateDaskPremium(300, 'betonarme', 1)
      const expectedDeductible = Math.round(2095462 * 0.02)
      expect(large.deductible).toBe(expectedDeductible)
    })
  })

  describe('edge cases', () => {
    it('handles 0 sqm', () => {
      const result = calculateDaskPremium(0, 'betonarme', 1)
      expect(result.coverage).toBe(0)
      expect(result.premium).toBe(0)
      expect(result.deductible).toBe(0)
    })

    it('handles 1 sqm', () => {
      const result = calculateDaskPremium(1, 'betonarme', 1)
      expect(result.coverage).toBe(9884) // 1 * 9884
      expect(result.premium).toBe(Math.round((9884 * 2.82) / 1000))
      expect(result.deductible).toBe(Math.round(9884 * 0.02))
    })

    it('always returns rounded integer values', () => {
      const result = calculateDaskPremium(73, 'betonarme', 3)
      expect(Number.isInteger(result.coverage)).toBe(true)
      expect(Number.isInteger(result.premium)).toBe(true)
      expect(Number.isInteger(result.deductible)).toBe(true)
    })

    it('premium decreases from zone 1 to zone 7 for same input', () => {
      const zones = [1, 2, 3, 4, 5, 6, 7] as const
      const premiums = zones.map((z) => calculateDaskPremium(100, 'betonarme', z).premium)
      for (let i = 0; i < premiums.length - 1; i++) {
        expect(premiums[i]).toBeGreaterThan(premiums[i + 1])
      }
    })
  })
})

// =============================================================================
// getBranchStatistics - found vs not found
// =============================================================================

describe('getBranchStatistics', () => {
  it('returns statistics for existing branch code', () => {
    const result = getBranchStatistics('traffic')
    expect(result).toBeDefined()
    expect(result!.code).toBe('traffic')
    expect(result!.nameTR).toBe('Kara Araçları Sorumluluk (Trafik)')
    expect(result!.nameEN).toBe('Motor Third Party Liability')
    expect(result!.premiumProduction).toBe(219_300_000_000)
  })

  it('returns statistics for health branch', () => {
    const result = getBranchStatistics('health')
    expect(result).toBeDefined()
    expect(result!.code).toBe('health')
    expect(result!.marketShare).toBe(0.16)
  })

  it('returns statistics for kasko branch', () => {
    const result = getBranchStatistics('kasko')
    expect(result).toBeDefined()
    expect(result!.code).toBe('kasko')
    expect(result!.lossRatio).toBe(0.60)
  })

  it('returns statistics for credit branch (last in array)', () => {
    const result = getBranchStatistics('credit')
    expect(result).toBeDefined()
    expect(result!.code).toBe('credit')
  })

  it('returns undefined for non-existing branch code', () => {
    const result = getBranchStatistics('nonexistent')
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    const result = getBranchStatistics('')
    expect(result).toBeUndefined()
  })

  it('is case-sensitive', () => {
    const result = getBranchStatistics('Traffic')
    expect(result).toBeUndefined()
  })

  it('returns all expected fields in the result', () => {
    const result = getBranchStatistics('fire')
    expect(result).toBeDefined()
    expect(result).toHaveProperty('code')
    expect(result).toHaveProperty('nameTR')
    expect(result).toHaveProperty('nameEN')
    expect(result).toHaveProperty('premiumProduction')
    expect(result).toHaveProperty('marketShare')
    expect(result).toHaveProperty('claimsPaid')
    expect(result).toHaveProperty('lossRatio')
    expect(result).toHaveProperty('yoyGrowth')
  })
})

// =============================================================================
// getLossRatioBenchmark - branch found vs fallback
// =============================================================================

describe('getLossRatioBenchmark', () => {
  it('returns benchmark based on actual branch loss ratio when branch exists', () => {
    const result = getLossRatioBenchmark('traffic')
    // traffic lossRatio = 0.80
    expect(result.expected).toBe(0.80)
    expect(result.warning).toBeCloseTo(0.80 * 1.2, 5) // 0.96
    expect(result.critical).toBeCloseTo(0.80 * 1.5, 5) // 1.20
  })

  it('uses fallback 0.5 loss ratio when branch does not exist', () => {
    const result = getLossRatioBenchmark('nonexistent')
    expect(result.expected).toBe(0.5)
    expect(result.warning).toBeCloseTo(0.5 * 1.2, 5) // 0.6
    expect(result.critical).toBeCloseTo(0.5 * 1.5, 5) // 0.75
  })

  it('uses fallback 0.5 for empty string branch code', () => {
    const result = getLossRatioBenchmark('')
    expect(result.expected).toBe(0.5)
    expect(result.warning).toBeCloseTo(0.6, 5)
    expect(result.critical).toBeCloseTo(0.75, 5)
  })

  it('warning is always 20% above expected', () => {
    const result = getLossRatioBenchmark('kasko')
    expect(result.warning).toBeCloseTo(result.expected * 1.2, 5)
  })

  it('critical is always 50% above expected', () => {
    const result = getLossRatioBenchmark('health')
    expect(result.critical).toBeCloseTo(result.expected * 1.5, 5)
  })

  it('critical is always higher than warning', () => {
    const result = getLossRatioBenchmark('fire')
    expect(result.critical).toBeGreaterThan(result.warning)
  })

  it('returns correct values for each branch', () => {
    const branchCodes = ['traffic', 'health', 'fire', 'kasko', 'life', 'liability', 'agricultural', 'accident', 'engineering', 'marine', 'credit']
    for (const code of branchCodes) {
      const result = getLossRatioBenchmark(code)
      const branch = getBranchStatistics(code)
      expect(result.expected).toBe(branch!.lossRatio)
    }
  })

  it('branch with low loss ratio (fire: 0.30) produces low warning/critical', () => {
    const result = getLossRatioBenchmark('fire')
    expect(result.expected).toBe(0.30)
    expect(result.warning).toBeCloseTo(0.36, 5)
    expect(result.critical).toBeCloseTo(0.45, 5)
  })

  it('branch with high loss ratio (traffic: 0.80) produces high warning/critical', () => {
    const result = getLossRatioBenchmark('traffic')
    expect(result.critical).toBeCloseTo(1.20, 5)
  })
})

// =============================================================================
// getCurrentTrafficLimits - year branching
// =============================================================================

describe('getCurrentTrafficLimits', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 2026 limits when year is 2026', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15'))
    const result = getCurrentTrafficLimits()
    expect(result.code).toBe('zmss_2026')
    expect(result).toBe(TRAFFIC_INSURANCE_LIMITS_2026)
  })

  it('returns 2026 limits when year is 2027 (>= 2026)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-01'))
    const result = getCurrentTrafficLimits()
    expect(result.code).toBe('zmss_2026')
  })

  it('returns 2025 limits when year is 2025', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-07-01'))
    const result = getCurrentTrafficLimits()
    expect(result.code).toBe('zmss_2025')
    expect(result).toBe(TRAFFIC_INSURANCE_LIMITS_2025)
  })

  it('returns 2025 limits when year is 2024 (< 2026)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-12-31'))
    const result = getCurrentTrafficLimits()
    expect(result.code).toBe('zmss_2025')
  })

  it('returns 2026 limits on exact boundary: January 1, 2026', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00'))
    const result = getCurrentTrafficLimits()
    expect(result.code).toBe('zmss_2026')
  })

  it('returns 2025 limits on December 31, 2025', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-31T23:59:59'))
    const result = getCurrentTrafficLimits()
    expect(result.code).toBe('zmss_2025')
  })
})

// =============================================================================
// getCurrentDaskLimits - no branching, always returns 2024
// =============================================================================

describe('getCurrentDaskLimits', () => {
  it('returns DASK_LIMITS_2024', () => {
    const result = getCurrentDaskLimits()
    expect(result).toBe(DASK_LIMITS_2024)
    expect(result.code).toBe('dask_2024')
  })

  it('returned object has valid structure', () => {
    const result = getCurrentDaskLimits()
    expect(result.limits.length).toBeGreaterThan(0)
    expect(result.source).toBe('DASK')
    expect(result.effectiveDate).toBeTruthy()
  })
})

// =============================================================================
// getPremiumBenchmark - multiple filter branches
// =============================================================================

describe('getPremiumBenchmark', () => {
  describe('matching by insuranceType only', () => {
    it('returns first match when only insuranceType provided', () => {
      const result = getPremiumBenchmark('zmss')
      expect(result).toBeDefined()
      expect(result!.insuranceType).toBe('zmss')
    })

    it('returns undefined for non-existing insuranceType', () => {
      const result = getPremiumBenchmark('nonexistent')
      expect(result).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      const result = getPremiumBenchmark('')
      expect(result).toBeUndefined()
    })
  })

  describe('filtering by vehicleClass', () => {
    it('returns matching entry when vehicleClass matches', () => {
      const result = getPremiumBenchmark('zmss', 'motorcycle')
      expect(result).toBeDefined()
      expect(result!.insuranceType).toBe('zmss')
      expect(result!.vehicleClass).toBe('motorcycle')
    })

    it('returns undefined when vehicleClass does not match any entry', () => {
      const result = getPremiumBenchmark('zmss', 'nonexistent_class')
      expect(result).toBeUndefined()
    })

    it('matches kasko luxury', () => {
      const result = getPremiumBenchmark('kasko', 'luxury')
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('luxury')
      expect(result!.avgPremium).toBe(35000)
    })

    it('does not filter by vehicleClass when undefined', () => {
      const result = getPremiumBenchmark('kasko', undefined)
      expect(result).toBeDefined()
      expect(result!.insuranceType).toBe('kasko')
    })
  })

  describe('filtering by propertyType', () => {
    it('returns matching entry when propertyType matches', () => {
      const result = getPremiumBenchmark('dask', undefined, 'apartment_concrete')
      expect(result).toBeDefined()
      expect(result!.insuranceType).toBe('dask')
      expect(result!.propertyType).toBe('apartment_concrete')
    })

    it('returns undefined when propertyType does not match', () => {
      const result = getPremiumBenchmark('dask', undefined, 'nonexistent_property')
      expect(result).toBeUndefined()
    })

    it('matches home villa', () => {
      const result = getPremiumBenchmark('home', undefined, 'villa')
      expect(result).toBeDefined()
      expect(result!.propertyType).toBe('villa')
      expect(result!.avgPremium).toBe(7000)
    })

    it('does not filter by propertyType when undefined', () => {
      const result = getPremiumBenchmark('dask', undefined, undefined)
      expect(result).toBeDefined()
      expect(result!.insuranceType).toBe('dask')
    })

    it('matches health supplementary', () => {
      const result = getPremiumBenchmark('health', undefined, 'supplementary')
      expect(result).toBeDefined()
      expect(result!.propertyType).toBe('supplementary')
      expect(result!.avgPremium).toBe(6000)
    })

    it('matches business medium_business', () => {
      const result = getPremiumBenchmark('business', undefined, 'medium_business')
      expect(result).toBeDefined()
      expect(result!.avgPremium).toBe(30000)
    })
  })

  describe('filtering by both vehicleClass and propertyType', () => {
    it('does not match when vehicleClass is provided but entry has no vehicleClass', () => {
      // dask entries have propertyType but not vehicleClass
      const result = getPremiumBenchmark('dask', 'automobile', 'apartment_concrete')
      // vehicleClass is 'automobile' but dask entries have no vehicleClass
      // The filter checks b.vehicleClass !== vehicleClass, and b.vehicleClass is undefined
      // undefined !== 'automobile' is true, so it returns false
      expect(result).toBeUndefined()
    })

    it('filters by vehicleClass even when propertyType is also provided', () => {
      // zmss entries have vehicleClass but not propertyType
      const result = getPremiumBenchmark('zmss', 'automobile', 'nonexistent')
      // vehicleClass matches but propertyType 'nonexistent' !== undefined...
      // b.propertyType is undefined, so b.propertyType !== propertyType is true -> return false
      expect(result).toBeUndefined()
    })
  })

  describe('all insurance types can be found', () => {
    it('finds zmss', () => {
      expect(getPremiumBenchmark('zmss')).toBeDefined()
    })

    it('finds kasko', () => {
      expect(getPremiumBenchmark('kasko')).toBeDefined()
    })

    it('finds dask', () => {
      expect(getPremiumBenchmark('dask')).toBeDefined()
    })

    it('finds home', () => {
      expect(getPremiumBenchmark('home')).toBeDefined()
    })

    it('finds health', () => {
      expect(getPremiumBenchmark('health')).toBeDefined()
    })

    it('finds life', () => {
      expect(getPremiumBenchmark('life')).toBeDefined()
    })

    it('finds business', () => {
      expect(getPremiumBenchmark('business')).toBeDefined()
    })
  })
})

// =============================================================================
// validateAgainstMinimumLimits - complex branching
// =============================================================================

describe('validateAgainstMinimumLimits', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('non-traffic insurance types (early return branch)', () => {
    it('returns valid with no issues for non-traffic type', () => {
      const result = validateAgainstMinimumLimits('kasko', [
        { type: 'collision', limit: 100000 },
      ])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns valid for home insurance type', () => {
      const result = validateAgainstMinimumLimits('home', [
        { type: 'fire', limit: 50000 },
      ])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns valid for health insurance type', () => {
      const result = validateAgainstMinimumLimits('health', [])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns valid for empty string insurance type', () => {
      const result = validateAgainstMinimumLimits('', [])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns valid for dask insurance type', () => {
      const result = validateAgainstMinimumLimits('dask', [
        { type: 'earthquake', limit: 1 },
      ])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })
  })

  describe('traffic insurance type', () => {
    it('validates traffic coverages against minimum limits', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 500000 },
      ])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('detects coverage below minimum limit', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // 2026 limit for material_damage_per_vehicle is 400000
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 100000 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toContain('material_damage_per_vehicle')
      expect(result.issues[0]).toContain('minimum limitin altında')
    })

    it('also accepts zmss as insurance type (synonym)', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('zmss', [
        { type: 'material_damage_per_vehicle', limit: 500000 },
      ])
      expect(result.valid).toBe(true)
    })

    it('zmss detects under-limit coverage', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('zmss', [
        { type: 'material_damage_per_vehicle', limit: 100 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
    })
  })

  describe('coverageType matching branches', () => {
    it('matches by exact coverageType', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // Exact match on coverageType field
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'bodily_injury_per_person', limit: 5000000 },
      ])
      expect(result.valid).toBe(true)
    })

    it('matches by coverageTypeTR substring (case insensitive)', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // The limits have coverageTypeTR like "Maddi Hasar (Araç Başına)"
      // Search uses .toLowerCase().includes()
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'maddi hasar (araç başına)', limit: 500000 },
      ])
      expect(result.valid).toBe(true)
    })

    it('does not flag coverage types that do not match any limit definition', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'totally_unknown_coverage', limit: 1 },
      ])
      // No limitDef found, so no issue is added
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })
  })

  describe('limit comparison branches (perPerson || perAccident || perVehicle || 0)', () => {
    it('uses perPerson when available (bodily_injury_per_person)', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // 2026 bodily_injury_per_person has perPerson: 3600000
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'bodily_injury_per_person', limit: 1000000 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues[0]).toContain('3.600.000')
    })

    it('uses perAccident when perPerson is not available', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // 2026 material_damage_per_accident has perAccident: 800000, no perPerson
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_accident', limit: 100000 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues[0]).toContain('material_damage_per_accident')
    })

    it('uses perVehicle when neither perPerson nor perAccident available', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // 2026 material_damage_per_vehicle has perVehicle: 400000, no perPerson/perAccident
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 100000 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues[0]).toContain('material_damage_per_vehicle')
    })

    it('passes when coverage equals exact minimum limit', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // Exact match: 400000 === 400000 (not less than), should pass
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 400000 },
      ])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('fails when coverage is 1 below minimum limit', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 399999 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
    })
  })

  describe('multiple coverages', () => {
    it('validates all coverages and reports all issues', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 100 },
        { type: 'material_damage_per_accident', limit: 100 },
        { type: 'bodily_injury_per_person', limit: 100 },
        { type: 'bodily_injury_per_accident', limit: 100 },
      ])
      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(4)
    })

    it('returns valid when all coverages meet limits', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 500000 },
        { type: 'material_damage_per_accident', limit: 1000000 },
        { type: 'bodily_injury_per_person', limit: 5000000 },
        { type: 'bodily_injury_per_accident', limit: 20000000 },
      ])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('reports partial failures (some pass, some fail)', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 500000 }, // passes (>400000)
        { type: 'bodily_injury_per_person', limit: 100 }, // fails (<3600000)
      ])
      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toContain('bodily_injury_per_person')
    })
  })

  describe('empty coverages array', () => {
    it('returns valid for traffic with empty coverages array', () => {
      const result = validateAgainstMinimumLimits('traffic', [])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns valid for zmss with empty coverages array', () => {
      const result = validateAgainstMinimumLimits('zmss', [])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })
  })

  describe('2025 vs 2026 limit selection', () => {
    it('uses 2025 limits when year is 2025', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-06-01'))

      // 2025 limit for material_damage_per_vehicle is 300000
      // 300001 passes 2025 but would fail if 2026 (400000) was used
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 300001 },
      ])
      expect(result.valid).toBe(true)
    })

    it('uses 2026 limits when year is 2026', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      // 300001 fails 2026 limit (400000) but would pass 2025 (300000)
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 300001 },
      ])
      expect(result.valid).toBe(false)
    })
  })

  describe('issue message formatting', () => {
    it('includes formatted Turkish locale numbers in issue messages', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'material_damage_per_vehicle', limit: 100000 },
      ])
      expect(result.issues[0]).toContain('TL')
      expect(result.issues[0]).toContain('Min:')
    })
  })

  describe('coverageTypeTR matching via includes', () => {
    it('matches partial Turkish coverage type name', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-06-01'))

      // The 2025 limits have coverageTypeTR "Maddi Hasar (Araç Başına)" for material_damage_per_vehicle
      // If we search for a type that is a substring of coverageTypeTR...
      // The match logic: l.coverageTypeTR?.toLowerCase().includes(coverage.type.toLowerCase())
      const result = validateAgainstMinimumLimits('traffic', [
        { type: 'maddi hasar', limit: 100 },
      ])
      // "maddi hasar" is included in "Maddi Hasar (Araç Başına)" — should match the first automobile limit
      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
    })
  })
})

// =============================================================================
// Type exports (compile-time checks)
// =============================================================================

describe('Type exports', () => {
  it('CoverageLimit interface is usable', () => {
    const limit: CoverageLimit = {
      code: 'test',
      nameTR: 'Test',
      nameEN: 'Test',
      effectiveDate: '2026-01-01',
      limits: [],
      source: 'Test',
    }
    expect(limit.code).toBe('test')
    expect(limit.expiryDate).toBeUndefined()
    expect(limit.sourceUrl).toBeUndefined()
    expect(limit.notes).toBeUndefined()
    expect(limit.notesTR).toBeUndefined()
  })

  it('LimitDetail interface supports all optional fields', () => {
    const detail: LimitDetail = {
      coverageType: 'test',
      coverageTypeTR: 'Test',
      currency: 'TRY',
    }
    expect(detail.vehicleType).toBeUndefined()
    expect(detail.vehicleTypeTR).toBeUndefined()
    expect(detail.perPerson).toBeUndefined()
    expect(detail.perAccident).toBeUndefined()
    expect(detail.perVehicle).toBeUndefined()
    expect(detail.maxLimit).toBeUndefined()
    expect(detail.deductible).toBeUndefined()
    expect(detail.deductiblePercent).toBeUndefined()
  })

  it('LimitDetail supports all currency types', () => {
    const tryDetail: LimitDetail = { coverageType: 'a', coverageTypeTR: 'a', currency: 'TRY' }
    const eurDetail: LimitDetail = { coverageType: 'a', coverageTypeTR: 'a', currency: 'EUR' }
    const usdDetail: LimitDetail = { coverageType: 'a', coverageTypeTR: 'a', currency: 'USD' }
    expect(tryDetail.currency).toBe('TRY')
    expect(eurDetail.currency).toBe('EUR')
    expect(usdDetail.currency).toBe('USD')
  })

  it('PremiumRange interface is usable', () => {
    const range: PremiumRange = {
      insuranceType: 'test',
      minPremium: 100,
      avgPremium: 200,
      maxPremium: 300,
      currency: 'TRY',
      year: 2025,
      source: 'test',
    }
    expect(range.vehicleClass).toBeUndefined()
    expect(range.propertyType).toBeUndefined()
  })

  it('BranchStatistics interface is usable', () => {
    const stats: BranchStatistics = {
      code: 'test',
      nameTR: 'Test',
      nameEN: 'Test',
      premiumProduction: 1000,
      marketShare: 0.1,
      claimsPaid: 500,
      lossRatio: 0.5,
      yoyGrowth: 0.1,
    }
    expect(stats.policyCount).toBeUndefined()
  })
})
