/**
 * Regional Benchmark Module
 * Location intelligence for Turkish insurance market
 */

// Types
export type {
  ProvinceCode,
  Province,
  RiskLevel,
  EarthquakeZone,
  RegionalRiskProfile,
  RegionalInsuranceStats,
  RegionalPremiumBenchmark,
  RegionalComparison,
  RegionalInsight,
  LocationAnalysis,
  LocationRecommendation,
  NearbyComparison,
  NationalStatistics,
  RegionalRanking,
} from '@/types/regional-benchmark'

// Data
export {
  PROVINCES,
  REGIONAL_RISK_PROFILES,
  REGIONAL_INSURANCE_STATS,
  getProvince,
  getProvincesByRegion,
  getRegionalRiskProfile,
  getRegionalInsuranceStats,
  getRegionalPremiumBenchmarks,
  calculateRegionalRiskScore,
  getRankedRegions,
} from './data'

// Comparison utilities
export {
  compareRegions,
  compareAllRegions,
  analyzeLocation,
  compareNearbyProvinces,
  getNationalStatistics,
  getRegionalRankings,
} from './comparison'
