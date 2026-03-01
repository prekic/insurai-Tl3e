/**
 * Configuration System Types
 *
 * Types for the three-tier configuration system:
 * 1. System Defaults (hardcoded fallbacks)
 * 2. Admin Settings (database, org-wide)
 * 3. User Preferences (database, per-user)
 */

// =============================================================================
// CONFIGURATION CATEGORIES
// =============================================================================

export type ConfigCategory =
  | 'ai'
  | 'evaluation'
  | 'rate_limits'
  | 'ocr'
  | 'fuzzy_matching'
  | 'gap_analysis'
  | 'ui'
  | 'email'
  | 'monitoring'
  | 'retention'

export type ConfigValueType = 'string' | 'number' | 'boolean' | 'object' | 'array'

// =============================================================================
// APP SETTINGS (from database)
// =============================================================================

export interface AppSetting {
  id: string
  category: ConfigCategory
  key: string
  value: unknown
  valueType: ConfigValueType
  description?: string
  descriptionTr?: string
  isSensitive: boolean
  isReadonly: boolean
  displayOrder: number
  minValue?: number
  maxValue?: number
  allowedValues?: unknown[]
  updatedBy?: string
  updatedAt: string
  createdAt: string
}

export interface AppSettingInput {
  value: unknown
  reason?: string
}

// =============================================================================
// USER PREFERENCES (from database)
// =============================================================================

export interface UserPreference {
  id: string
  userId: string
  category: string
  preferences: Record<string, unknown>
  updatedAt: string
}

export interface UserPreferenceInput {
  preferences: Record<string, unknown>
}

// =============================================================================
// AI CONFIGURATION
// =============================================================================

export interface AIConfig {
  // OpenAI
  openaiExtractionModel: string
  openaiBackupModel: string
  // Anthropic
  anthropicExtractionModel: string
  anthropicBackupModel: string
  // General
  maxTokens: number
  temperature: number
  chatTemperature: number
  minConfidence: number
  warningConfidence: number
  extractionTimeoutMs: number
  // Provider
  preferredProvider: 'auto' | 'openai' | 'anthropic'
  enableFallback: boolean
  // Consensus
  consensusEnabled: boolean
  consensusAgreementThreshold: number
  consensusFields: string[]
  // Confidence Scoring Weights (must sum to 1.0)
  confidenceWeightPolicyNumber: number
  confidenceWeightProvider: number
  confidenceWeightDates: number
  confidenceWeightPremium: number
  confidenceWeightCoverages: number
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  openaiExtractionModel: 'gpt-4o',
  openaiBackupModel: 'gpt-4o-mini',
  anthropicExtractionModel: 'claude-sonnet-4-20250514',
  anthropicBackupModel: 'claude-3-5-haiku-20241022',
  maxTokens: 4096,
  temperature: 0.1,
  chatTemperature: 0.7,
  minConfidence: 0.4,
  warningConfidence: 0.7,
  extractionTimeoutMs: 90000,
  preferredProvider: 'auto',
  enableFallback: true,
  consensusEnabled: true,
  consensusAgreementThreshold: 0.8,
  consensusFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'],
  confidenceWeightPolicyNumber: 0.2,
  confidenceWeightProvider: 0.15,
  confidenceWeightDates: 0.2,
  confidenceWeightPremium: 0.2,
  confidenceWeightCoverages: 0.25,
}

// =============================================================================
// EVALUATION CONFIGURATION
// =============================================================================

export interface EvaluationConfig {
  // Weights (must sum to 100)
  weightPremium: number
  weightCoverage: number
  weightDeductible: number
  weightCompliance: number
  weightValue: number
  // Grade Thresholds
  gradeAThreshold: number
  gradeBThreshold: number
  gradeCThreshold: number
  gradeDThreshold: number
  // Status Thresholds
  statusExcellentThreshold: number
  statusGoodThreshold: number
  statusFairThreshold: number
  statusPoorThreshold: number
  // Options
  strictCompliance: boolean
  includeOptionalCoverages: boolean
  useRegionalBenchmarks: boolean
  // Worker Settings
  workerEnabled: boolean
  workerIterations: number
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  weightPremium: 20,
  weightCoverage: 30,
  weightDeductible: 15,
  weightCompliance: 20,
  weightValue: 15,
  gradeAThreshold: 90,
  gradeBThreshold: 80,
  gradeCThreshold: 70,
  gradeDThreshold: 60,
  statusExcellentThreshold: 90,
  statusGoodThreshold: 75,
  statusFairThreshold: 60,
  statusPoorThreshold: 40,
  strictCompliance: true,
  includeOptionalCoverages: true,
  useRegionalBenchmarks: true,
  workerEnabled: true,
  workerIterations: 10000,
}

// =============================================================================
// RATE LIMITS CONFIGURATION
// =============================================================================

export interface RateLimitsConfig {
  // General
  generalWindowMs: number
  generalMaxRequests: number
  // AI Extraction
  aiExtractionWindowMs: number
  aiExtractionMaxRequests: number
  // OCR
  ocrWindowMs: number
  ocrMaxRequests: number
  // Chat
  chatWindowMs: number
  chatMaxRequests: number
  // Health
  healthWindowMs: number
  healthMaxRequests: number
  // Auth
  authWindowMs: number
  authMaxAttempts: number
}

export const DEFAULT_RATE_LIMITS_CONFIG: RateLimitsConfig = {
  generalWindowMs: 900000, // 15 minutes
  generalMaxRequests: 100,
  aiExtractionWindowMs: 3600000, // 1 hour
  aiExtractionMaxRequests: 20,
  ocrWindowMs: 3600000, // 1 hour
  ocrMaxRequests: 30,
  chatWindowMs: 3600000, // 1 hour
  chatMaxRequests: 60,
  healthWindowMs: 60000, // 1 minute
  healthMaxRequests: 60,
  authWindowMs: 900000, // 15 minutes
  authMaxAttempts: 10,
}

// =============================================================================
// OCR CONFIGURATION
// =============================================================================

export interface OCRConfig {
  // Density Analysis
  charsPerPageThreshold: number
  minPagesForAverage: number
  pageVarianceThreshold: number
  minCharsForValidPage: number
  // Confidence Thresholds
  skipOcrThreshold: number
  selectiveOcrThreshold: number
  // Confidence Weights
  weightCharDensity: number
  weightTextQuality: number
  weightPageVariance: number
  weightEncodingCheck: number
  weightFieldExtraction: number
  // Provider Thresholds
  googleVisionConfidence: number
  documentAiConfidence: number
  tesseractConfidence: number
  // Language Detection
  languageMinConfidence: number
  languageSampleSize: number
  // Policy Type Detection
  policyTypeMinConfidence: number
  // Quality Checks
  minWordLengthAverage: number
  maxGarbageCharRatio: number
  minAlphanumericRatio: number
  // Performance
  maxPagesQuickAnalysis: number
  timeoutSeconds: number
  maxTextLength: number
}

export const DEFAULT_OCR_CONFIG: OCRConfig = {
  charsPerPageThreshold: 200,
  minPagesForAverage: 3,
  pageVarianceThreshold: 0.5,
  minCharsForValidPage: 50,
  skipOcrThreshold: 0.85,
  selectiveOcrThreshold: 0.6,
  weightCharDensity: 0.25,
  weightTextQuality: 0.3,
  weightPageVariance: 0.15,
  weightEncodingCheck: 0.15,
  weightFieldExtraction: 0.15,
  googleVisionConfidence: 0.8,
  documentAiConfidence: 0.85,
  tesseractConfidence: 0.7,
  languageMinConfidence: 0.4,
  languageSampleSize: 2000,
  policyTypeMinConfidence: 0.5,
  minWordLengthAverage: 2,
  maxGarbageCharRatio: 0.1,
  minAlphanumericRatio: 0.6,
  maxPagesQuickAnalysis: 5,
  timeoutSeconds: 30,
  maxTextLength: 500000,
}

// =============================================================================
// FUZZY MATCHING CONFIGURATION
// =============================================================================

export interface FuzzyMatchingConfig {
  // General Thresholds
  defaultThreshold: number
  shortStringThreshold: number
  // Field-Specific Thresholds
  policyNumberThreshold: number
  providerNameThreshold: number
  insuredNameThreshold: number
  coverageNameThreshold: number
  // Array Comparison
  arrayMatchRatio: number
  keywordOverlapRatio: number
  // Numeric Tolerance
  numericTolerancePercent: number
  seddkLimitTolerance: number
  coverageLimitTolerance: number
  deductibleTolerance: number
}

export const DEFAULT_FUZZY_MATCHING_CONFIG: FuzzyMatchingConfig = {
  defaultThreshold: 0.85,
  shortStringThreshold: 0.9,
  policyNumberThreshold: 0.85,
  providerNameThreshold: 0.8,
  insuredNameThreshold: 0.8,
  coverageNameThreshold: 0.85,
  arrayMatchRatio: 0.7,
  keywordOverlapRatio: 0.8,
  numericTolerancePercent: 0.02,
  seddkLimitTolerance: 0.05,
  coverageLimitTolerance: 0.1,
  deductibleTolerance: 0.2,
}

// =============================================================================
// GAP ANALYSIS CONFIGURATION
// =============================================================================

export interface GapAnalysisConfig {
  // Missing Coverage Thresholds
  missingCoverageThreshold: number
  criticalImportanceThreshold: number
  recommendedImportanceThreshold: number
  // Underinsured Thresholds
  underinsuredThreshold: number
  highRiskUnderinsured: number
  mediumRiskUnderinsured: number
  // Deductible Thresholds
  highDeductibleMultiplier: number
  // Gap Score Penalties
  penaltyCriticalMissing: number
  penaltyRecommendedMissing: number
  penaltyOptionalMissing: number
  penaltyHighRiskUnderinsured: number
  penaltyMediumRiskUnderinsured: number
  // Score Interpretation
  goodAlignmentThreshold: number
  significantGapsThreshold: number
  maxGapScore: number
}

export const DEFAULT_GAP_ANALYSIS_CONFIG: GapAnalysisConfig = {
  missingCoverageThreshold: 50,
  criticalImportanceThreshold: 90,
  recommendedImportanceThreshold: 70,
  underinsuredThreshold: 70,
  highRiskUnderinsured: 40,
  mediumRiskUnderinsured: 55,
  highDeductibleMultiplier: 1.5,
  penaltyCriticalMissing: 15,
  penaltyRecommendedMissing: 8,
  penaltyOptionalMissing: 3,
  penaltyHighRiskUnderinsured: 12,
  penaltyMediumRiskUnderinsured: 6,
  goodAlignmentThreshold: 20,
  significantGapsThreshold: 50,
  maxGapScore: 100,
}

// =============================================================================
// UI CONFIGURATION
// =============================================================================

export interface UIConfig {
  // Toast Settings
  toastSuccessDurationMs: number
  toastErrorDurationMs: number
  toastWarningDurationMs: number
  // Dashboard Settings
  defaultItemsPerPage: number
  maxItemsPerPage: number
  // Progress Updates
  extractionProgressIntervalMs: number
  // Preview Settings
  collapsedPreviewItems: number
  maxAiInsightsPreview: number
  maxRecommendationsPreview: number
  // File Upload
  maxFileSizeMb: number
  allowedFileExtensions: string[]
}

export const DEFAULT_UI_CONFIG: UIConfig = {
  toastSuccessDurationMs: 3000,
  toastErrorDurationMs: 5000,
  toastWarningDurationMs: 4000,
  defaultItemsPerPage: 10,
  maxItemsPerPage: 50,
  extractionProgressIntervalMs: 10000,
  collapsedPreviewItems: 2,
  maxAiInsightsPreview: 3,
  maxRecommendationsPreview: 2,
  maxFileSizeMb: 10,
  allowedFileExtensions: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'],
}

// =============================================================================
// EMAIL CONFIGURATION
// =============================================================================

export interface EmailConfig {
  // Reminder Settings
  reminderDays: number[]
  urgencyThresholdDays: number
  // Score Thresholds
  scoreGoodThreshold: number
  scoreWarningThreshold: number
  // Default Preferences
  defaultMarketingEnabled: boolean
  defaultRemindersEnabled: boolean
  defaultDigestEnabled: boolean
}

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  reminderDays: [30, 14, 7, 3, 1],
  urgencyThresholdDays: 7,
  scoreGoodThreshold: 70,
  scoreWarningThreshold: 50,
  defaultMarketingEnabled: true,
  defaultRemindersEnabled: true,
  defaultDigestEnabled: false,
}

// =============================================================================
// MONITORING CONFIGURATION
// =============================================================================

export interface MonitoringConfig {
  errorRateWarningThreshold: number
  errorRateCriticalThreshold: number
  avgLatencyCriticalMs: number
  checkIntervalMs: number
  alertCooldownMinutes: number
  enableEmailAlerts: boolean
  alertEmailAddresses: string
  minProviderRequestsForLatencyAlert: number
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  errorRateWarningThreshold: 0.05,
  errorRateCriticalThreshold: 0.2,
  avgLatencyCriticalMs: 12000,
  checkIntervalMs: 300000,
  alertCooldownMinutes: 15,
  enableEmailAlerts: false,
  alertEmailAddresses: '',
  minProviderRequestsForLatencyAlert: 3,
}

// =============================================================================
// RETENTION CONFIGURATION
// =============================================================================

export interface RetentionConfig {
  processingLogRetentionDays: number
  extractionMetricsRetentionDays: number
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  processingLogRetentionDays: 90,
  extractionMetricsRetentionDays: 30,
}

// =============================================================================
// COMBINED CONFIGURATION
// =============================================================================

export interface AppConfig {
  ai: AIConfig
  evaluation: EvaluationConfig
  rateLimits: RateLimitsConfig
  ocr: OCRConfig
  fuzzyMatching: FuzzyMatchingConfig
  gapAnalysis: GapAnalysisConfig
  ui: UIConfig
  email: EmailConfig
  monitoring: MonitoringConfig
  retention: RetentionConfig
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  ai: DEFAULT_AI_CONFIG,
  evaluation: DEFAULT_EVALUATION_CONFIG,
  rateLimits: DEFAULT_RATE_LIMITS_CONFIG,
  ocr: DEFAULT_OCR_CONFIG,
  fuzzyMatching: DEFAULT_FUZZY_MATCHING_CONFIG,
  gapAnalysis: DEFAULT_GAP_ANALYSIS_CONFIG,
  ui: DEFAULT_UI_CONFIG,
  email: DEFAULT_EMAIL_CONFIG,
  monitoring: DEFAULT_MONITORING_CONFIG,
  retention: DEFAULT_RETENTION_CONFIG,
}

// =============================================================================
// CACHE TYPES
// =============================================================================

export interface CacheEntry<T = unknown> {
  value: T
  expiresAt: number
}

export interface ConfigurationServiceOptions {
  cacheTtlMs?: number
  enableCache?: boolean
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export interface FeatureFlag {
  id: string
  key: string
  name: string
  description?: string
  enabled: boolean
  rolloutPercentage: number
  userSegments: string[]
  conditions: Record<string, unknown>
  expiresAt?: string
  updatedAt: string
}

// =============================================================================
// REGIONAL FACTOR
// =============================================================================

export interface RegionalFactor {
  id: string
  regionCode: string
  regionName: string
  regionNameTr: string
  policyType: string
  riskFactor: number
  year: number
  source?: string
  notes?: string
  isActive: boolean
}

// =============================================================================
// INSURANCE PROVIDER
// =============================================================================

export interface InsuranceProvider {
  id: string
  code: string
  name: string
  nameTr?: string
  marketShare?: number
  customerRating?: number
  establishedYear?: number
  headquarters?: string
  website?: string
  logoUrl?: string
  specialties: string[]
  isActive: boolean
}

// =============================================================================
// MARKET BENCHMARK
// =============================================================================

export interface MarketBenchmark {
  id: string
  policyType: string
  coverageType: string
  coverageNameTr?: string
  regionCode: string
  year: number
  minLimit?: number
  typicalLimit?: number
  maxLimit?: number
  minDeductible?: number
  typicalDeductible?: number
  maxDeductible?: number
  inclusionRate?: number
  importance: 'critical' | 'standard' | 'optional'
  source?: string
  notes?: string
  isActive: boolean
}
