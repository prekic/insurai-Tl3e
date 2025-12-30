/**
 * Data Validators
 * Validation rules and utilities for market data integrity
 */

import type { PolicyType } from '@/types/policy'
import type { PolicyTypeMarketData, InsuranceProvider, TurkishRegion } from '@/types/market-data'
import type {
  ValidationRule,
  ValidationResult,
  ValidationReport,
  DataQualityIssue,
  BenchmarkDataRepository,
  RegionalData,
} from '@/types/data-repository'

// =============================================================================
// Validation Rules
// =============================================================================

/**
 * Rule: Benchmark data must have valid premium ranges
 */
const premiumRangeRule: ValidationRule = {
  id: 'premium-range-valid',
  name: 'Valid Premium Ranges',
  description: 'Premium min must be less than max, and both must be positive',
  severity: 'error',
  validate: (data: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const benchmarks = data as Record<PolicyType, PolicyTypeMarketData>

    for (const [policyType, marketData] of Object.entries(benchmarks)) {
      if (marketData.premiumRange) {
        const { min, max } = marketData.premiumRange
        if (min < 0 || max < 0) {
          issues.push({
            severity: 'error',
            field: `${policyType}.premiumRange`,
            message: `Premium values must be positive (min: ${min}, max: ${max})`,
            suggestion: 'Ensure all premium values are greater than or equal to 0',
          })
        }
        if (min > max) {
          issues.push({
            severity: 'error',
            field: `${policyType}.premiumRange`,
            message: `Min premium (${min}) is greater than max (${max})`,
            suggestion: 'Swap min and max values',
          })
        }
      }
    }

    return { valid: issues.length === 0, issues }
  },
}

/**
 * Rule: Coverage limits must be realistic
 */
const coverageLimitsRule: ValidationRule = {
  id: 'coverage-limits-realistic',
  name: 'Realistic Coverage Limits',
  description: 'Coverage limits should be within realistic ranges for Turkish market',
  severity: 'warning',
  validate: (data: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const benchmarks = data as Record<PolicyType, PolicyTypeMarketData>

    const maxReasonableLimits: Partial<Record<PolicyType, number>> = {
      home: 50_000_000,
      kasko: 20_000_000,
      traffic: 10_000_000,
      health: 100_000_000,
      life: 50_000_000,
      business: 500_000_000,
      dask: 10_000_000,
    }

    for (const [policyType, marketData] of Object.entries(benchmarks)) {
      const maxLimit = maxReasonableLimits[policyType as PolicyType]
      if (maxLimit && marketData.coverageRange?.max > maxLimit) {
        issues.push({
          severity: 'warning',
          field: `${policyType}.coverageRange.max`,
          message: `Coverage max (₺${marketData.coverageRange.max.toLocaleString()}) exceeds typical Turkish market limit`,
          suggestion: `Review if ${marketData.coverageRange.max} is correct for ${policyType}`,
        })
      }
    }

    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
  },
}

/**
 * Rule: Market trends should be within reasonable bounds
 */
const marketTrendsRule: ValidationRule = {
  id: 'market-trends-valid',
  name: 'Valid Market Trends',
  description: 'Market trend percentages should be within realistic ranges',
  severity: 'warning',
  validate: (data: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const benchmarks = data as Record<PolicyType, PolicyTypeMarketData>

    for (const [policyType, marketData] of Object.entries(benchmarks)) {
      if (marketData.trends) {
        // Check year-over-year premium change is realistic
        if (Math.abs(marketData.trends.premiumChangeYoY) > 100) {
          issues.push({
            severity: 'warning',
            field: `${policyType}.trends.premiumChangeYoY`,
            message: `Premium change of ${marketData.trends.premiumChangeYoY}% seems unrealistic`,
            suggestion: 'Verify trend data calculation',
          })
        }
        // Check claims ratio is between 0 and 200%
        if (marketData.trends.claimsRatio < 0 || marketData.trends.claimsRatio > 2) {
          issues.push({
            severity: 'warning',
            field: `${policyType}.trends.claimsRatio`,
            message: `Claims ratio of ${(marketData.trends.claimsRatio * 100).toFixed(1)}% is outside expected range`,
            suggestion: 'Claims ratio typically ranges from 40-120%',
          })
        }
      }
    }

    return { valid: true, issues }
  },
}

/**
 * Rule: Required coverages must be defined
 */
const requiredCoveragesRule: ValidationRule = {
  id: 'required-coverages-defined',
  name: 'Required Coverages Defined',
  description: 'Each policy type should have at least one common coverage defined',
  severity: 'error',
  validate: (data: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const benchmarks = data as Record<PolicyType, PolicyTypeMarketData>

    for (const [policyType, marketData] of Object.entries(benchmarks)) {
      if (!marketData.commonCoverages || marketData.commonCoverages.length === 0) {
        issues.push({
          severity: 'error',
          field: `${policyType}.commonCoverages`,
          message: `No common coverages defined for ${policyType}`,
          suggestion: 'Add at least the mandatory coverages for this policy type',
        })
      }
    }

    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
  },
}

/**
 * Rule: Provider data must have valid contact info
 */
const providerDataRule: ValidationRule = {
  id: 'provider-data-complete',
  name: 'Provider Data Complete',
  description: 'Provider information should include essential fields',
  severity: 'warning',
  validate: (data: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const providers = data as Record<InsuranceProvider, unknown>

    for (const [provider, info] of Object.entries(providers)) {
      const providerInfo = info as { name?: string; website?: string; rating?: number }
      if (!providerInfo.name) {
        issues.push({
          severity: 'error',
          field: `providers.${provider}.name`,
          message: `Missing name for provider ${provider}`,
          suggestion: 'Add provider display name',
        })
      }
      if (!providerInfo.website) {
        issues.push({
          severity: 'info',
          field: `providers.${provider}.website`,
          message: `No website defined for ${provider}`,
          suggestion: 'Add official website URL',
        })
      }
      if (providerInfo.rating && (providerInfo.rating < 0 || providerInfo.rating > 5)) {
        issues.push({
          severity: 'warning',
          field: `providers.${provider}.rating`,
          message: `Rating ${providerInfo.rating} is outside 0-5 range`,
          suggestion: 'Ratings should be between 0 and 5',
        })
      }
    }

    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
  },
}

/**
 * Rule: Regional factors must be within reasonable bounds
 */
const regionalFactorsRule: ValidationRule = {
  id: 'regional-factors-valid',
  name: 'Valid Regional Factors',
  description: 'Regional adjustment factors should be between 0.5 and 2.0',
  severity: 'warning',
  validate: (data: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const regions = data as Record<TurkishRegion, RegionalData>

    for (const [region, regionData] of Object.entries(regions)) {
      if (regionData.baseFactor < 0.5 || regionData.baseFactor > 2.0) {
        issues.push({
          severity: 'warning',
          field: `regions.${region}.baseFactor`,
          message: `Base factor ${regionData.baseFactor} is outside typical range (0.5-2.0)`,
          suggestion: 'Verify regional factor calculation methodology',
        })
      }
      if (regionData.population && regionData.population < 0) {
        issues.push({
          severity: 'error',
          field: `regions.${region}.population`,
          message: 'Population cannot be negative',
          suggestion: 'Use official TÜİK population data',
        })
      }
    }

    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
  },
}

/**
 * Rule: Data freshness check
 */
const dataFreshnessRule: ValidationRule = {
  id: 'data-freshness',
  name: 'Data Freshness',
  description: 'Data should not be older than 90 days',
  severity: 'warning',
  validate: (_data: unknown, context?: unknown): ValidationResult => {
    const issues: DataQualityIssue[] = []
    const metadata = context as { lastUpdated?: string } | undefined

    if (metadata?.lastUpdated) {
      const lastUpdated = new Date(metadata.lastUpdated)
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceUpdate > 365) {
        issues.push({
          severity: 'error',
          field: 'metadata.lastUpdated',
          message: `Data is ${Math.floor(daysSinceUpdate)} days old (last updated: ${metadata.lastUpdated})`,
          suggestion: 'Update market data from SEDDK/TSB sources',
        })
      } else if (daysSinceUpdate > 90) {
        issues.push({
          severity: 'warning',
          field: 'metadata.lastUpdated',
          message: `Data is ${Math.floor(daysSinceUpdate)} days old`,
          suggestion: 'Consider refreshing market data',
        })
      }
    }

    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
  },
}

// =============================================================================
// All Validation Rules
// =============================================================================

export const BENCHMARK_VALIDATION_RULES: ValidationRule[] = [
  premiumRangeRule,
  coverageLimitsRule,
  marketTrendsRule,
  requiredCoveragesRule,
]

export const PROVIDER_VALIDATION_RULES: ValidationRule[] = [
  providerDataRule,
]

export const REGIONAL_VALIDATION_RULES: ValidationRule[] = [
  regionalFactorsRule,
]

export const METADATA_VALIDATION_RULES: ValidationRule[] = [
  dataFreshnessRule,
]

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Run validation rules against data
 */
export function runValidation(
  data: unknown,
  rules: ValidationRule[],
  context?: unknown
): ValidationResult {
  const allIssues: DataQualityIssue[] = []

  for (const rule of rules) {
    const result = rule.validate(data, context)
    allIssues.push(...result.issues)
  }

  return {
    valid: allIssues.filter(i => i.severity === 'error').length === 0,
    issues: allIssues,
  }
}

/**
 * Validate complete benchmark repository
 */
export function validateRepository(repository: BenchmarkDataRepository): ValidationReport {
  const timestamp = new Date().toISOString()
  const errors: DataQualityIssue[] = []
  const warnings: DataQualityIssue[] = []
  const info: DataQualityIssue[] = []
  let rulesPassed = 0
  const allRules = [
    ...BENCHMARK_VALIDATION_RULES,
    ...PROVIDER_VALIDATION_RULES,
    ...REGIONAL_VALIDATION_RULES,
    ...METADATA_VALIDATION_RULES,
  ]

  // Validate benchmarks
  const benchmarkResult = runValidation(repository.benchmarks, BENCHMARK_VALIDATION_RULES)
  if (benchmarkResult.valid) rulesPassed += BENCHMARK_VALIDATION_RULES.length

  // Validate providers
  const providerResult = runValidation(repository.providers, PROVIDER_VALIDATION_RULES)
  if (providerResult.valid) rulesPassed += PROVIDER_VALIDATION_RULES.length

  // Validate regional data
  const regionalResult = runValidation(repository.regionalFactors, REGIONAL_VALIDATION_RULES)
  if (regionalResult.valid) rulesPassed += REGIONAL_VALIDATION_RULES.length

  // Validate metadata/freshness
  const metadataResult = runValidation(repository.benchmarks, METADATA_VALIDATION_RULES, repository.metadata)
  if (metadataResult.valid) rulesPassed += METADATA_VALIDATION_RULES.length

  // Categorize all issues
  const allIssues = [
    ...benchmarkResult.issues,
    ...providerResult.issues,
    ...regionalResult.issues,
    ...metadataResult.issues,
  ]

  for (const issue of allIssues) {
    if (issue.severity === 'error') errors.push(issue)
    else if (issue.severity === 'warning') warnings.push(issue)
    else info.push(issue)
  }

  const valid = errors.length === 0

  return {
    valid,
    timestamp,
    rulesApplied: allRules.length,
    rulesPassed,
    errors,
    warnings,
    info,
    summary: valid
      ? `Validation passed with ${warnings.length} warnings and ${info.length} informational notes`
      : `Validation failed: ${errors.length} errors, ${warnings.length} warnings`,
  }
}

/**
 * Quick validation check (errors only)
 */
export function quickValidate(repository: BenchmarkDataRepository): boolean {
  const benchmarkResult = runValidation(repository.benchmarks, BENCHMARK_VALIDATION_RULES)
  if (!benchmarkResult.valid) return false

  const providerResult = runValidation(repository.providers, PROVIDER_VALIDATION_RULES)
  if (!providerResult.valid) return false

  const regionalResult = runValidation(repository.regionalFactors, REGIONAL_VALIDATION_RULES)
  if (!regionalResult.valid) return false

  return true
}

/**
 * Calculate data quality score from validation report
 */
export function calculateQualityScore(report: ValidationReport): number {
  // Base score
  let score = 100

  // Deduct for errors (severe)
  score -= report.errors.length * 20

  // Deduct for warnings (moderate)
  score -= report.warnings.length * 5

  // Deduct for info items (minor)
  score -= report.info.length * 1

  // Bonus for passing most rules
  const passRate = report.rulesPassed / report.rulesApplied
  score += passRate * 10

  return Math.max(0, Math.min(100, Math.round(score)))
}
