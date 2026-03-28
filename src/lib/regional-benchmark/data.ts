/**
 * Regional Benchmark Data
 * Turkish province and region-level insurance benchmarks
 */

import type { PolicyType } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type {
  Province,
  ProvinceCode,
  RegionalRiskProfile,
  RegionalInsuranceStats,
  RegionalPremiumBenchmark,
  RiskLevel,
  EarthquakeZone,
} from '@/types/regional-benchmark'

// =============================================================================
// Province Data
// =============================================================================

/**
 * Major Turkish provinces with insurance-relevant data
 */
export const PROVINCES: Record<ProvinceCode, Province> = {
  '01': {
    code: '01',
    name: 'Adana',
    nameTr: 'Adana',
    region: 'akdeniz',
    population: 2270298,
    area: 14030,
    density: 162,
    urbanRatio: 0.88,
    coordinates: { lat: 37.0, lng: 35.32 },
  },
  '06': {
    code: '06',
    name: 'Ankara',
    nameTr: 'Ankara',
    region: 'ic_anadolu',
    population: 5747325,
    area: 25632,
    density: 224,
    urbanRatio: 0.97,
    coordinates: { lat: 39.93, lng: 32.86 },
  },
  '07': {
    code: '07',
    name: 'Antalya',
    nameTr: 'Antalya',
    region: 'akdeniz',
    population: 2619832,
    area: 20177,
    density: 130,
    urbanRatio: 0.71,
    coordinates: { lat: 36.88, lng: 30.7 },
  },
  '16': {
    code: '16',
    name: 'Bursa',
    nameTr: 'Bursa',
    region: 'marmara',
    population: 3147818,
    area: 10813,
    density: 291,
    urbanRatio: 0.91,
    coordinates: { lat: 40.18, lng: 29.06 },
  },
  '21': {
    code: '21',
    name: 'Diyarbakır',
    nameTr: 'Diyarbakır',
    region: 'guneydogu',
    population: 1804880,
    area: 15168,
    density: 119,
    urbanRatio: 0.76,
    coordinates: { lat: 37.91, lng: 40.24 },
  },
  '25': {
    code: '25',
    name: 'Erzurum',
    nameTr: 'Erzurum',
    region: 'dogu_anadolu',
    population: 749754,
    area: 25066,
    density: 30,
    urbanRatio: 0.64,
    coordinates: { lat: 39.9, lng: 41.27 },
  },
  '27': {
    code: '27',
    name: 'Gaziantep',
    nameTr: 'Gaziantep',
    region: 'guneydogu',
    population: 2154051,
    area: 6887,
    density: 313,
    urbanRatio: 0.9,
    coordinates: { lat: 37.07, lng: 37.38 },
  },
  '34': {
    code: '34',
    name: 'İstanbul',
    nameTr: 'İstanbul',
    region: 'marmara',
    population: 15907951,
    area: 5461,
    density: 2913,
    urbanRatio: 0.99,
    coordinates: { lat: 41.01, lng: 28.98 },
  },
  '35': {
    code: '35',
    name: 'İzmir',
    nameTr: 'İzmir',
    region: 'ege',
    population: 4425789,
    area: 11973,
    density: 370,
    urbanRatio: 0.92,
    coordinates: { lat: 38.42, lng: 27.14 },
  },
  '38': {
    code: '38',
    name: 'Kayseri',
    nameTr: 'Kayseri',
    region: 'ic_anadolu',
    population: 1441523,
    area: 16970,
    density: 85,
    urbanRatio: 0.89,
    coordinates: { lat: 38.73, lng: 35.49 },
  },
  '41': {
    code: '41',
    name: 'Kocaeli',
    nameTr: 'Kocaeli',
    region: 'marmara',
    population: 2079072,
    area: 3626,
    density: 573,
    urbanRatio: 0.96,
    coordinates: { lat: 40.85, lng: 29.88 },
  },
  '42': {
    code: '42',
    name: 'Konya',
    nameTr: 'Konya',
    region: 'ic_anadolu',
    population: 2296347,
    area: 38873,
    density: 59,
    urbanRatio: 0.78,
    coordinates: { lat: 37.87, lng: 32.48 },
  },
  '33': {
    code: '33',
    name: 'Mersin',
    nameTr: 'Mersin',
    region: 'akdeniz',
    population: 1916432,
    area: 15737,
    density: 122,
    urbanRatio: 0.72,
    coordinates: { lat: 36.8, lng: 34.63 },
  },
  '55': {
    code: '55',
    name: 'Samsun',
    nameTr: 'Samsun',
    region: 'karadeniz',
    population: 1368488,
    area: 9352,
    density: 146,
    urbanRatio: 0.68,
    coordinates: { lat: 41.29, lng: 36.33 },
  },
  '61': {
    code: '61',
    name: 'Trabzon',
    nameTr: 'Trabzon',
    region: 'karadeniz',
    population: 818023,
    area: 4495,
    density: 182,
    urbanRatio: 0.59,
    coordinates: { lat: 41.0, lng: 39.72 },
  },
  '63': {
    code: '63',
    name: 'Şanlıurfa',
    nameTr: 'Şanlıurfa',
    region: 'guneydogu',
    population: 2170110,
    area: 19242,
    density: 113,
    urbanRatio: 0.58,
    coordinates: { lat: 37.16, lng: 38.79 },
  },
  '65': {
    code: '65',
    name: 'Van',
    nameTr: 'Van',
    region: 'dogu_anadolu',
    population: 1141015,
    area: 19069,
    density: 60,
    urbanRatio: 0.62,
    coordinates: { lat: 38.49, lng: 43.38 },
  },
  // Add more as needed - keeping key provinces for now
} as Record<ProvinceCode, Province>

// =============================================================================
// Regional Risk Profiles
// =============================================================================

/**
 * Risk profiles by region based on AFAD and insurance industry data
 */
export const REGIONAL_RISK_PROFILES: Record<TurkishRegion, RegionalRiskProfile> = {
  marmara: {
    region: 'marmara',
    earthquake: {
      zone: 1 as EarthquakeZone,
      level: 'very_high' as RiskLevel,
      historicalEvents: 45,
      avgMagnitude: 5.2,
    },
    flood: {
      level: 'moderate' as RiskLevel,
      annualFrequency: 12,
      avgDamage: 85000,
    },
    fire: {
      forestFireRisk: 'moderate' as RiskLevel,
      urbanFireRate: 28,
    },
    storm: {
      level: 'moderate' as RiskLevel,
      annualEvents: 18,
    },
    crime: {
      theftRate: 245,
      vehicleTheftRate: 42,
      burglaryRate: 38,
      overallLevel: 'high' as RiskLevel,
    },
    traffic: {
      accidentRate: 890,
      fatalityRate: 4.2,
      congestionLevel: 'very_high' as RiskLevel,
    },
    health: {
      hospitalDensity: 2.8,
      avgResponseTime: 8,
      healthcareAccess: 'very_low' as RiskLevel,
    },
  },
  ege: {
    region: 'ege',
    earthquake: {
      zone: 1 as EarthquakeZone,
      level: 'high' as RiskLevel,
      historicalEvents: 38,
      avgMagnitude: 4.8,
    },
    flood: {
      level: 'low' as RiskLevel,
      annualFrequency: 5,
      avgDamage: 45000,
    },
    fire: {
      forestFireRisk: 'high' as RiskLevel,
      urbanFireRate: 22,
    },
    storm: {
      level: 'low' as RiskLevel,
      annualEvents: 8,
    },
    crime: {
      theftRate: 185,
      vehicleTheftRate: 28,
      burglaryRate: 25,
      overallLevel: 'moderate' as RiskLevel,
    },
    traffic: {
      accidentRate: 720,
      fatalityRate: 3.8,
      congestionLevel: 'moderate' as RiskLevel,
    },
    health: {
      hospitalDensity: 2.4,
      avgResponseTime: 10,
      healthcareAccess: 'low' as RiskLevel,
    },
  },
  akdeniz: {
    region: 'akdeniz',
    earthquake: {
      zone: 2 as EarthquakeZone,
      level: 'moderate' as RiskLevel,
      historicalEvents: 22,
      avgMagnitude: 4.5,
    },
    flood: {
      level: 'moderate' as RiskLevel,
      annualFrequency: 15,
      avgDamage: 65000,
    },
    fire: {
      forestFireRisk: 'very_high' as RiskLevel,
      urbanFireRate: 24,
    },
    storm: {
      level: 'moderate' as RiskLevel,
      annualEvents: 14,
    },
    crime: {
      theftRate: 195,
      vehicleTheftRate: 32,
      burglaryRate: 28,
      overallLevel: 'moderate' as RiskLevel,
    },
    traffic: {
      accidentRate: 680,
      fatalityRate: 4.5,
      congestionLevel: 'moderate' as RiskLevel,
    },
    health: {
      hospitalDensity: 2.2,
      avgResponseTime: 12,
      healthcareAccess: 'low' as RiskLevel,
    },
  },
  ic_anadolu: {
    region: 'ic_anadolu',
    earthquake: {
      zone: 3 as EarthquakeZone,
      level: 'moderate' as RiskLevel,
      historicalEvents: 15,
      avgMagnitude: 4.2,
    },
    flood: {
      level: 'low' as RiskLevel,
      annualFrequency: 4,
      avgDamage: 35000,
    },
    fire: {
      forestFireRisk: 'low' as RiskLevel,
      urbanFireRate: 18,
    },
    storm: {
      level: 'low' as RiskLevel,
      annualEvents: 6,
    },
    crime: {
      theftRate: 145,
      vehicleTheftRate: 22,
      burglaryRate: 18,
      overallLevel: 'low' as RiskLevel,
    },
    traffic: {
      accidentRate: 580,
      fatalityRate: 3.5,
      congestionLevel: 'moderate' as RiskLevel,
    },
    health: {
      hospitalDensity: 2.6,
      avgResponseTime: 9,
      healthcareAccess: 'low' as RiskLevel,
    },
  },
  karadeniz: {
    region: 'karadeniz',
    earthquake: {
      zone: 3 as EarthquakeZone,
      level: 'moderate' as RiskLevel,
      historicalEvents: 12,
      avgMagnitude: 4.0,
    },
    flood: {
      level: 'high' as RiskLevel,
      annualFrequency: 25,
      avgDamage: 95000,
    },
    fire: {
      forestFireRisk: 'moderate' as RiskLevel,
      urbanFireRate: 16,
    },
    storm: {
      level: 'high' as RiskLevel,
      annualEvents: 22,
    },
    crime: {
      theftRate: 95,
      vehicleTheftRate: 12,
      burglaryRate: 10,
      overallLevel: 'very_low' as RiskLevel,
    },
    traffic: {
      accidentRate: 520,
      fatalityRate: 4.8,
      congestionLevel: 'low' as RiskLevel,
    },
    health: {
      hospitalDensity: 1.8,
      avgResponseTime: 18,
      healthcareAccess: 'moderate' as RiskLevel,
    },
  },
  dogu_anadolu: {
    region: 'dogu_anadolu',
    earthquake: {
      zone: 1 as EarthquakeZone,
      level: 'very_high' as RiskLevel,
      historicalEvents: 52,
      avgMagnitude: 5.5,
    },
    flood: {
      level: 'moderate' as RiskLevel,
      annualFrequency: 8,
      avgDamage: 55000,
    },
    fire: {
      forestFireRisk: 'low' as RiskLevel,
      urbanFireRate: 14,
    },
    storm: {
      level: 'moderate' as RiskLevel,
      annualEvents: 10,
    },
    crime: {
      theftRate: 85,
      vehicleTheftRate: 8,
      burglaryRate: 7,
      overallLevel: 'very_low' as RiskLevel,
    },
    traffic: {
      accidentRate: 420,
      fatalityRate: 5.2,
      congestionLevel: 'very_low' as RiskLevel,
    },
    health: {
      hospitalDensity: 1.4,
      avgResponseTime: 25,
      healthcareAccess: 'high' as RiskLevel,
    },
  },
  guneydogu: {
    region: 'guneydogu',
    earthquake: {
      zone: 2 as EarthquakeZone,
      level: 'high' as RiskLevel,
      historicalEvents: 28,
      avgMagnitude: 4.8,
    },
    flood: {
      level: 'low' as RiskLevel,
      annualFrequency: 6,
      avgDamage: 42000,
    },
    fire: {
      forestFireRisk: 'low' as RiskLevel,
      urbanFireRate: 15,
    },
    storm: {
      level: 'low' as RiskLevel,
      annualEvents: 5,
    },
    crime: {
      theftRate: 125,
      vehicleTheftRate: 18,
      burglaryRate: 15,
      overallLevel: 'low' as RiskLevel,
    },
    traffic: {
      accidentRate: 480,
      fatalityRate: 4.8,
      congestionLevel: 'low' as RiskLevel,
    },
    health: {
      hospitalDensity: 1.6,
      avgResponseTime: 20,
      healthcareAccess: 'high' as RiskLevel,
    },
  },
}

// =============================================================================
// Regional Insurance Statistics
// =============================================================================

/**
 * Insurance market statistics by region (2024 data)
 */
export const REGIONAL_INSURANCE_STATS: Record<TurkishRegion, RegionalInsuranceStats> = {
  marmara: {
    region: 'marmara',
    totalPolicies: 12500000,
    totalPremiumVolume: 185000000000,
    marketPenetration: 0.42,
    insurancePerCapita: 7250,
    policyDistribution: {
      kasko: { count: 3200000, premiumVolume: 65000000000, avgPremium: 20312, marketShare: 0.256 },
      traffic: { count: 4800000, premiumVolume: 22000000000, avgPremium: 4583, marketShare: 0.384 },
      home: { count: 1800000, premiumVolume: 12000000000, avgPremium: 6667, marketShare: 0.144 },
      health: { count: 1200000, premiumVolume: 45000000000, avgPremium: 37500, marketShare: 0.096 },
      life: { count: 800000, premiumVolume: 9000000000, avgPremium: 11250, marketShare: 0.064 },
      dask: { count: 2500000, premiumVolume: 2500000000, avgPremium: 1000, marketShare: 0.2 },
      business: {
        count: 450000,
        premiumVolume: 29500000000,
        avgPremium: 65556,
        marketShare: 0.036,
      },
      nakliyat: { count: 380000, premiumVolume: 5700000000, avgPremium: 15000, marketShare: 0.03 },
    },
    claimsData: {
      totalClaims: 2800000,
      claimsPaid: 125000000000,
      avgClaimAmount: 44643,
      claimsRatio: 0.68,
      avgSettlementDays: 18,
    },
    growth: {
      yoyPremiumGrowth: 0.45,
      yoyPolicyGrowth: 0.12,
      yoyClaimsGrowth: 0.38,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
  ege: {
    region: 'ege',
    totalPolicies: 4200000,
    totalPremiumVolume: 52000000000,
    marketPenetration: 0.38,
    insurancePerCapita: 5800,
    policyDistribution: {
      kasko: { count: 1100000, premiumVolume: 19000000000, avgPremium: 17273, marketShare: 0.262 },
      traffic: { count: 1600000, premiumVolume: 6800000000, avgPremium: 4250, marketShare: 0.381 },
      home: { count: 650000, premiumVolume: 3800000000, avgPremium: 5846, marketShare: 0.155 },
      health: { count: 380000, premiumVolume: 12500000000, avgPremium: 32895, marketShare: 0.09 },
      life: { count: 280000, premiumVolume: 2800000000, avgPremium: 10000, marketShare: 0.067 },
      dask: { count: 850000, premiumVolume: 750000000, avgPremium: 882, marketShare: 0.202 },
      business: { count: 180000, premiumVolume: 6350000000, avgPremium: 35278, marketShare: 0.043 },
      nakliyat: { count: 145000, premiumVolume: 1740000000, avgPremium: 12000, marketShare: 0.035 },
    },
    claimsData: {
      totalClaims: 850000,
      claimsPaid: 32000000000,
      avgClaimAmount: 37647,
      claimsRatio: 0.62,
      avgSettlementDays: 15,
    },
    growth: {
      yoyPremiumGrowth: 0.42,
      yoyPolicyGrowth: 0.1,
      yoyClaimsGrowth: 0.35,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
  akdeniz: {
    region: 'akdeniz',
    totalPolicies: 3800000,
    totalPremiumVolume: 45000000000,
    marketPenetration: 0.35,
    insurancePerCapita: 4800,
    policyDistribution: {
      kasko: { count: 950000, premiumVolume: 16500000000, avgPremium: 17368, marketShare: 0.25 },
      traffic: { count: 1500000, premiumVolume: 6200000000, avgPremium: 4133, marketShare: 0.395 },
      home: { count: 580000, premiumVolume: 3200000000, avgPremium: 5517, marketShare: 0.153 },
      health: { count: 320000, premiumVolume: 10500000000, avgPremium: 32813, marketShare: 0.084 },
      life: { count: 240000, premiumVolume: 2300000000, avgPremium: 9583, marketShare: 0.063 },
      dask: { count: 720000, premiumVolume: 580000000, avgPremium: 806, marketShare: 0.189 },
      business: { count: 160000, premiumVolume: 5720000000, avgPremium: 35750, marketShare: 0.042 },
      nakliyat: { count: 130000, premiumVolume: 1430000000, avgPremium: 11000, marketShare: 0.034 },
    },
    claimsData: {
      totalClaims: 780000,
      claimsPaid: 28000000000,
      avgClaimAmount: 35897,
      claimsRatio: 0.62,
      avgSettlementDays: 16,
    },
    growth: {
      yoyPremiumGrowth: 0.4,
      yoyPolicyGrowth: 0.08,
      yoyClaimsGrowth: 0.32,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
  ic_anadolu: {
    region: 'ic_anadolu',
    totalPolicies: 4500000,
    totalPremiumVolume: 48000000000,
    marketPenetration: 0.32,
    insurancePerCapita: 4200,
    policyDistribution: {
      kasko: { count: 1050000, premiumVolume: 15500000000, avgPremium: 14762, marketShare: 0.233 },
      traffic: { count: 1800000, premiumVolume: 6800000000, avgPremium: 3778, marketShare: 0.4 },
      home: { count: 700000, premiumVolume: 3500000000, avgPremium: 5000, marketShare: 0.156 },
      health: { count: 420000, premiumVolume: 13000000000, avgPremium: 30952, marketShare: 0.093 },
      life: { count: 320000, premiumVolume: 3000000000, avgPremium: 9375, marketShare: 0.071 },
      dask: { count: 900000, premiumVolume: 650000000, avgPremium: 722, marketShare: 0.2 },
      business: { count: 210000, premiumVolume: 5550000000, avgPremium: 26429, marketShare: 0.047 },
      nakliyat: { count: 155000, premiumVolume: 1705000000, avgPremium: 11000, marketShare: 0.034 },
    },
    claimsData: {
      totalClaims: 820000,
      claimsPaid: 26000000000,
      avgClaimAmount: 31707,
      claimsRatio: 0.54,
      avgSettlementDays: 14,
    },
    growth: {
      yoyPremiumGrowth: 0.38,
      yoyPolicyGrowth: 0.09,
      yoyClaimsGrowth: 0.3,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
  karadeniz: {
    region: 'karadeniz',
    totalPolicies: 2200000,
    totalPremiumVolume: 18000000000,
    marketPenetration: 0.28,
    insurancePerCapita: 3200,
    policyDistribution: {
      kasko: { count: 480000, premiumVolume: 6500000000, avgPremium: 13542, marketShare: 0.218 },
      traffic: { count: 950000, premiumVolume: 3200000000, avgPremium: 3368, marketShare: 0.432 },
      home: { count: 320000, premiumVolume: 1500000000, avgPremium: 4688, marketShare: 0.145 },
      health: { count: 180000, premiumVolume: 4200000000, avgPremium: 23333, marketShare: 0.082 },
      life: { count: 140000, premiumVolume: 1100000000, avgPremium: 7857, marketShare: 0.064 },
      dask: { count: 420000, premiumVolume: 280000000, avgPremium: 667, marketShare: 0.191 },
      business: { count: 85000, premiumVolume: 1220000000, avgPremium: 14353, marketShare: 0.039 },
      nakliyat: { count: 75000, premiumVolume: 750000000, avgPremium: 10000, marketShare: 0.034 },
    },
    claimsData: {
      totalClaims: 380000,
      claimsPaid: 9500000000,
      avgClaimAmount: 25000,
      claimsRatio: 0.53,
      avgSettlementDays: 20,
    },
    growth: {
      yoyPremiumGrowth: 0.35,
      yoyPolicyGrowth: 0.06,
      yoyClaimsGrowth: 0.28,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
  dogu_anadolu: {
    region: 'dogu_anadolu',
    totalPolicies: 1200000,
    totalPremiumVolume: 8500000000,
    marketPenetration: 0.22,
    insurancePerCapita: 2100,
    policyDistribution: {
      kasko: { count: 220000, premiumVolume: 2800000000, avgPremium: 12727, marketShare: 0.183 },
      traffic: { count: 580000, premiumVolume: 1800000000, avgPremium: 3103, marketShare: 0.483 },
      home: { count: 150000, premiumVolume: 650000000, avgPremium: 4333, marketShare: 0.125 },
      health: { count: 85000, premiumVolume: 1800000000, avgPremium: 21176, marketShare: 0.071 },
      life: { count: 70000, premiumVolume: 480000000, avgPremium: 6857, marketShare: 0.058 },
      dask: { count: 280000, premiumVolume: 320000000, avgPremium: 1143, marketShare: 0.233 },
      business: { count: 42000, premiumVolume: 650000000, avgPremium: 15476, marketShare: 0.035 },
      nakliyat: { count: 36000, premiumVolume: 324000000, avgPremium: 9000, marketShare: 0.03 },
    },
    claimsData: {
      totalClaims: 180000,
      claimsPaid: 4200000000,
      avgClaimAmount: 23333,
      claimsRatio: 0.49,
      avgSettlementDays: 25,
    },
    growth: {
      yoyPremiumGrowth: 0.32,
      yoyPolicyGrowth: 0.05,
      yoyClaimsGrowth: 0.25,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
  guneydogu: {
    region: 'guneydogu',
    totalPolicies: 1800000,
    totalPremiumVolume: 14000000000,
    marketPenetration: 0.24,
    insurancePerCapita: 2400,
    policyDistribution: {
      kasko: { count: 380000, premiumVolume: 4800000000, avgPremium: 12632, marketShare: 0.211 },
      traffic: { count: 850000, premiumVolume: 2800000000, avgPremium: 3294, marketShare: 0.472 },
      home: { count: 220000, premiumVolume: 1100000000, avgPremium: 5000, marketShare: 0.122 },
      health: { count: 140000, premiumVolume: 3200000000, avgPremium: 22857, marketShare: 0.078 },
      life: { count: 95000, premiumVolume: 720000000, avgPremium: 7579, marketShare: 0.053 },
      dask: { count: 380000, premiumVolume: 380000000, avgPremium: 1000, marketShare: 0.211 },
      business: { count: 65000, premiumVolume: 1000000000, avgPremium: 15385, marketShare: 0.036 },
      nakliyat: { count: 58000, premiumVolume: 522000000, avgPremium: 9000, marketShare: 0.032 },
    },
    claimsData: {
      totalClaims: 280000,
      claimsPaid: 6800000000,
      avgClaimAmount: 24286,
      claimsRatio: 0.49,
      avgSettlementDays: 22,
    },
    growth: {
      yoyPremiumGrowth: 0.34,
      yoyPolicyGrowth: 0.07,
      yoyClaimsGrowth: 0.26,
    },
    dataDate: '2026-03-28',
    source: 'TSB/SEDDK',
  },
}

// =============================================================================
// Regional Premium Benchmarks
// =============================================================================

/**
 * Generate regional premium benchmarks for a policy type
 */
export function getRegionalPremiumBenchmarks(
  policyType: PolicyType
): Record<TurkishRegion, RegionalPremiumBenchmark> {
  const regions: TurkishRegion[] = [
    'marmara',
    'ege',
    'akdeniz',
    'ic_anadolu',
    'karadeniz',
    'dogu_anadolu',
    'guneydogu',
  ]

  // Get national average
  const nationalAvg =
    regions.reduce((sum, region) => {
      const stats = REGIONAL_INSURANCE_STATS[region]
      return sum + stats.policyDistribution[policyType].avgPremium
    }, 0) / regions.length

  // Sort regions by premium to determine rankings
  const sortedRegions = [...regions].sort((a, b) => {
    const aAvg = REGIONAL_INSURANCE_STATS[a].policyDistribution[policyType].avgPremium
    const bAvg = REGIONAL_INSURANCE_STATS[b].policyDistribution[policyType].avgPremium
    return aAvg - bAvg
  })

  const benchmarks: Record<TurkishRegion, RegionalPremiumBenchmark> = {} as Record<
    TurkishRegion,
    RegionalPremiumBenchmark
  >

  for (const region of regions) {
    const stats = REGIONAL_INSURANCE_STATS[region]
    const policyStats = stats.policyDistribution[policyType]
    const avgPremium = policyStats.avgPremium

    benchmarks[region] = {
      region,
      policyType,
      premium: {
        min: Math.round(avgPremium * 0.4),
        max: Math.round(avgPremium * 2.5),
        average: avgPremium,
        median: Math.round(avgPremium * 0.92),
        percentile10: Math.round(avgPremium * 0.5),
        percentile25: Math.round(avgPremium * 0.7),
        percentile75: Math.round(avgPremium * 1.3),
        percentile90: Math.round(avgPremium * 1.8),
      },
      vsNational: {
        difference: avgPremium - nationalAvg,
        percentage: ((avgPremium - nationalAvg) / nationalAvg) * 100,
        ranking: sortedRegions.indexOf(region) + 1,
        totalRegions: regions.length,
      },
      factors: {
        riskAdjustment: REGIONAL_RISK_PROFILES[region].earthquake.zone <= 2 ? 1.2 : 1.0,
        competitionAdjustment: stats.marketPenetration > 0.35 ? 0.95 : 1.05,
        claimsHistoryAdjustment: stats.claimsData.claimsRatio > 0.6 ? 1.1 : 0.95,
        regulatoryAdjustment: 1.0,
      },
      trend: {
        direction: stats.growth.yoyPremiumGrowth > 0.4 ? 'increasing' : 'stable',
        yoyChange: stats.growth.yoyPremiumGrowth * 100,
        projection6m: stats.growth.yoyPremiumGrowth * 50,
      },
    }
  }

  return benchmarks
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get province by code
 */
export function getProvince(code: ProvinceCode): Province | undefined {
  return PROVINCES[code]
}

/**
 * Get provinces by region
 */
export function getProvincesByRegion(region: TurkishRegion): Province[] {
  return Object.values(PROVINCES).filter((p) => p.region === region)
}

/**
 * Get regional risk profile
 */
export function getRegionalRiskProfile(region: TurkishRegion): RegionalRiskProfile {
  return REGIONAL_RISK_PROFILES[region]
}

/**
 * Get regional insurance stats
 */
export function getRegionalInsuranceStats(region: TurkishRegion): RegionalInsuranceStats {
  return REGIONAL_INSURANCE_STATS[region]
}

/**
 * Calculate overall risk score for a region (0-100)
 */
export function calculateRegionalRiskScore(region: TurkishRegion): number {
  const profile = REGIONAL_RISK_PROFILES[region]

  // Weighted risk calculation
  const earthquakeScore = (6 - profile.earthquake.zone) * 15 // Max 75 for zone 1
  const floodScore = profile.flood.annualFrequency * 1.5 // Max ~40
  const crimeScore = (profile.crime.theftRate / 250) * 20 // Max ~20
  const trafficScore = (profile.traffic.accidentRate / 900) * 15 // Max ~15

  const totalScore = Math.min(100, earthquakeScore + floodScore + crimeScore + trafficScore)
  return Math.round(totalScore)
}

/**
 * Get regions ranked by a specific metric
 */
export function getRankedRegions(
  metric: 'premium' | 'risk' | 'penetration' | 'claims',
  policyType?: PolicyType
): { region: TurkishRegion; value: number; rank: number }[] {
  const regions: TurkishRegion[] = [
    'marmara',
    'ege',
    'akdeniz',
    'ic_anadolu',
    'karadeniz',
    'dogu_anadolu',
    'guneydogu',
  ]

  const values = regions.map((region) => {
    let value: number

    switch (metric) {
      case 'premium':
        value = policyType
          ? REGIONAL_INSURANCE_STATS[region].policyDistribution[policyType].avgPremium
          : REGIONAL_INSURANCE_STATS[region].insurancePerCapita
        break
      case 'risk':
        value = calculateRegionalRiskScore(region)
        break
      case 'penetration':
        value = REGIONAL_INSURANCE_STATS[region].marketPenetration
        break
      case 'claims':
        value = REGIONAL_INSURANCE_STATS[region].claimsData.claimsRatio
        break
      default:
        value = 0
    }

    return { region, value }
  })

  // Sort ascending
  values.sort((a, b) => a.value - b.value)

  return values.map((item, index) => ({
    ...item,
    rank: index + 1,
  }))
}
