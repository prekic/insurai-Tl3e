/**
 * Policy Extraction Module
 *
 * Comprehensive extraction system with:
 * - Policy-type-specific prompts
 * - Extended schema with type-specific fields
 * - Turkish text handling utilities
 * - Post-extraction validation
 */

// Policy-type-specific extraction prompts
export {
  BASE_EXTRACTION_PROMPT,
  POLICY_TYPE_PROMPTS,
  POLICY_TYPE_DETECTION_PROMPT,
  getExtractionPrompt,
} from '../extraction-prompts'

// Extended extraction schema
export {
  type ExtendedExtractedPolicyData,
  type ExtendedCoverage,
  type VehicleInfo,
  type DriverInfo,
  type PropertyInfo,
  type SecurityFeatures,
  type HealthCostSharing,
  type HealthLimits,
  type HealthWaitingPeriods,
  type HealthNetworkInfo,
  type LifeBeneficiary,
  type LifeRiders,
  type LifeCashValues,
  type DaskBuildingInfo,
  type BusinessInfo,
  type BusinessValues,
  type BusinessLiability,
  type TrafficLiabilityLimits,
  getExtendedJsonSchema,
} from '../extraction-schema-extended'

// Turkish text handling utilities
export {
  normalizeTurkishChars,
  normalizeCoverageName,
  coverageNamesMatch,
  parseTurkishDate,
  extractDatesFromText,
  parseTurkishCurrency,
  formatTurkishCurrency,
  parseTurkishPlate,
  isValidTCKimlik,
  normalizePolicyNumber,
  extractPremiumFromText,
  detectPolicyTypeFromText,
  extractProvinceFromAddress,
} from '../turkish-utils'

// Post-extraction validation
export {
  validateExtraction,
  formatValidationIssues,
  type ValidationResult,
  type ValidationIssue,
  type ValidationSeverity,
} from '../extraction-validator'
