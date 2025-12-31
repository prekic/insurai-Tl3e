/**
 * Industry Risk Module
 * B2B insurance risk profiles and assessment
 */

// Types
export type {
  IndustrySector,
  BusinessSize,
  BusinessSizeDefinition,
  IndustryRiskCategory,
  IndustryRiskFactor,
  IndustryCoverageRequirement,
  IndustryRiskProfile,
  BusinessInfo,
  BusinessRiskAssessment,
  IndustryComparison,
  IndustryRanking,
} from '@/types/industry-risk'

export {
  BUSINESS_SIZE_DEFINITIONS,
  DEFAULT_INDUSTRY_CATEGORY_WEIGHTS,
  getBusinessSize,
  getIndustrySectorNameTr,
} from '@/types/industry-risk'

// Profiles
export {
  INDUSTRY_PROFILES,
  getIndustryProfile,
  getAllIndustrySectors,
  getIndustriesByRisk,
} from './profiles'

// Assessment
export {
  assessBusinessRisk,
  compareIndustries,
  getIndustryRankings,
  findSimilarIndustries,
} from './assessment'
