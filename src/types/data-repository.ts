/**
 * Market Data Repository Types
 * Types for managing versioned, validated market data
 */

import type { PolicyType } from './policy'
import type { PolicyTypeMarketData, TurkishRegion, InsuranceProvider, ProviderInfo } from './market-data'

// =============================================================================
// Data Versioning
// =============================================================================

/**
 * Version information for data sets
 */
export interface DataVersion {
  major: number
  minor: number
  patch: number
  toString(): string
}

/**
 * Create a data version
 */
export function createVersion(major: number, minor: number, patch: number): DataVersion {
  return {
    major,
    minor,
    patch,
    toString() {
      return `${this.major}.${this.minor}.${this.patch}`
    },
  }
}

/**
 * Parse version string
 */
export function parseVersion(versionStr: string): DataVersion {
  const parts = versionStr.split('.').map(Number)
  return createVersion(parts[0] || 0, parts[1] || 0, parts[2] || 0)
}

/**
 * Compare versions: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a: DataVersion, b: DataVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return 0
}

// =============================================================================
// Data Metadata
// =============================================================================

/**
 * Metadata for a data set
 */
export interface DataSetMetadata {
  /** Unique identifier for the data set */
  id: string
  /** Human-readable name */
  name: string
  /** Description */
  description: string
  /** Version of the data */
  version: string
  /** When the data was last updated */
  lastUpdated: string
  /** When the data was last validated */
  lastValidated?: string
  /** Data source */
  source: DataSource
  /** Effective date range */
  effectiveFrom: string
  effectiveTo?: string
  /** Data quality metrics */
  quality: DataQualityMetrics
}

/**
 * Data source information
 */
export interface DataSource {
  /** Source name */
  name: string
  /** Source type */
  type: 'official' | 'estimated' | 'historical' | 'user_provided'
  /** URL or reference */
  reference?: string
  /** Confidence level (0-1) */
  confidence: number
}

/**
 * Data quality metrics
 */
export interface DataQualityMetrics {
  /** Completeness score (0-100) */
  completeness: number
  /** Accuracy confidence (0-100) */
  accuracy: number
  /** Timeliness score (0-100) */
  timeliness: number
  /** Overall quality score (0-100) */
  overall: number
  /** Issues found during validation */
  issues: DataQualityIssue[]
}

/**
 * Data quality issue
 */
export interface DataQualityIssue {
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
  suggestion?: string
}

// =============================================================================
// Data Repository
// =============================================================================

/**
 * Complete benchmark data repository
 */
export interface BenchmarkDataRepository {
  /** Repository metadata */
  metadata: DataSetMetadata
  /** Market benchmark data by policy type */
  benchmarks: Record<PolicyType, PolicyTypeMarketData>
  /** Regional factors */
  regionalFactors: Record<TurkishRegion, RegionalData>
  /** Provider data */
  providers: Record<InsuranceProvider, ProviderInfo>
  /** Historical data (optional) */
  historical?: HistoricalDataPoint[]
}

/**
 * Regional data with metadata
 */
export interface RegionalData {
  region: TurkishRegion
  name: string
  nameTr: string
  /** Base factor for premium adjustment */
  baseFactor: number
  /** Risk profile */
  riskProfile: {
    earthquake: 'very_high' | 'high' | 'medium' | 'low'
    flood: 'high' | 'medium' | 'low'
    theft: 'high' | 'medium' | 'low'
    traffic: 'high' | 'medium' | 'low'
  }
  /** Population (for market size estimation) */
  population: number
  /** Economic indicators */
  economicIndex: number
}

/**
 * Historical data point for trend analysis
 */
export interface HistoricalDataPoint {
  date: string
  policyType: PolicyType
  metrics: {
    averagePremium: number
    averageCoverage: number
    marketSize: number
    claimsRatio: number
  }
}

// =============================================================================
// Data Loading
// =============================================================================

/**
 * Data loading options
 */
export interface DataLoadOptions {
  /** Force refresh from source */
  forceRefresh?: boolean
  /** Skip validation */
  skipValidation?: boolean
  /** Maximum cache age in milliseconds */
  maxCacheAge?: number
  /** Fallback to cached data on error */
  fallbackToCache?: boolean
}

/**
 * Data load result
 */
export interface DataLoadResult<T> {
  success: boolean
  data?: T
  error?: string
  source: 'cache' | 'file' | 'api' | 'embedded'
  loadedAt: string
  metadata?: DataSetMetadata
}

// =============================================================================
// Data Updates
// =============================================================================

/**
 * Data update options
 */
export interface DataUpdateOptions {
  /** Whether to merge with existing data */
  merge?: boolean
  /** Fields to update (if merge is true) */
  fields?: string[]
  /** Whether to validate before applying */
  validate?: boolean
  /** Whether to backup before updating */
  backup?: boolean
}

/**
 * Data update result
 */
export interface DataUpdateResult {
  success: boolean
  previousVersion?: string
  newVersion: string
  changedFields: string[]
  validationIssues?: DataQualityIssue[]
  error?: string
}

/**
 * Pending data update
 */
export interface PendingDataUpdate {
  id: string
  type: 'benchmark' | 'provider' | 'regional'
  targetId: string
  changes: Record<string, unknown>
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  notes?: string
}

// =============================================================================
// Data Validation
// =============================================================================

/**
 * Validation rule
 */
export interface ValidationRule {
  id: string
  name: string
  description: string
  severity: 'error' | 'warning' | 'info'
  validate: (data: unknown, context?: unknown) => ValidationResult
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  issues: DataQualityIssue[]
}

/**
 * Complete validation report
 */
export interface ValidationReport {
  valid: boolean
  timestamp: string
  rulesApplied: number
  rulesPassed: number
  errors: DataQualityIssue[]
  warnings: DataQualityIssue[]
  info: DataQualityIssue[]
  summary: string
}

// =============================================================================
// Data Change Tracking
// =============================================================================

/**
 * Data change entry
 */
export interface DataChangeEntry {
  id: string
  timestamp: string
  type: 'create' | 'update' | 'delete'
  entityType: 'benchmark' | 'provider' | 'regional' | 'metadata'
  entityId: string
  previousValue?: unknown
  newValue?: unknown
  changedBy?: string
  reason?: string
}

/**
 * Data change log
 */
export interface DataChangeLog {
  entries: DataChangeEntry[]
  startDate: string
  endDate: string
  totalChanges: number
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Current data version
 */
export const CURRENT_DATA_VERSION = createVersion(1, 0, 0)

/**
 * Default data source for embedded data
 */
export const DEFAULT_DATA_SOURCE: DataSource = {
  name: 'SEDDK/TSB',
  type: 'official',
  reference: 'https://www.tsb.org.tr/',
  confidence: 0.85,
}

/**
 * Default cache duration (24 hours)
 */
export const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000

/**
 * Calculate data freshness score (0-100)
 */
export function calculateFreshnessScore(lastUpdated: string, effectiveTo?: string): number {
  const now = Date.now()
  const updated = new Date(lastUpdated).getTime()
  const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24)

  // If we have an effective end date and it's passed, data is stale
  if (effectiveTo && new Date(effectiveTo).getTime() < now) {
    return 0
  }

  // Score based on age
  if (daysSinceUpdate <= 7) return 100
  if (daysSinceUpdate <= 30) return 90
  if (daysSinceUpdate <= 90) return 70
  if (daysSinceUpdate <= 180) return 50
  if (daysSinceUpdate <= 365) return 30
  return 10
}

/**
 * Determine if data needs refresh
 */
export function needsRefresh(metadata: DataSetMetadata, maxAgeDays = 30): boolean {
  const lastUpdated = new Date(metadata.lastUpdated).getTime()
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000
  return Date.now() - lastUpdated > maxAge
}
