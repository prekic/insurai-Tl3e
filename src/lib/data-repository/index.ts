/**
 * Data Repository Module
 * Dynamic market data loading with validation and caching
 */

// Main service
export {
  marketDataService,
  getMarketDataService,
  initializeMarketData,
} from './market-data-service'
export type {
  MarketDataStats,
  BenchmarkComparison,
  RegionalAdjustment,
} from './market-data-service'

// Data loader
export {
  MarketDataLoader,
  marketDataLoader,
  loadMarketData,
  getBenchmark,
  getProviderInfo,
  getRegionalData,
  checkDataFreshness,
  invalidateDataCache,
} from './data-loader'

// Validators
export {
  validateRepository,
  quickValidate,
  calculateQualityScore,
  runValidation,
  BENCHMARK_VALIDATION_RULES,
  PROVIDER_VALIDATION_RULES,
  REGIONAL_VALIDATION_RULES,
  METADATA_VALIDATION_RULES,
} from './validators'

// Re-export types from data-repository types
export type {
  DataVersion,
  DataSetMetadata,
  DataSource,
  DataQualityMetrics,
  DataQualityIssue,
  BenchmarkDataRepository,
  RegionalData,
  HistoricalDataPoint,
  DataLoadOptions,
  DataLoadResult,
  DataUpdateOptions,
  DataUpdateResult,
  PendingDataUpdate,
  ValidationRule,
  ValidationResult,
  ValidationReport,
  DataChangeEntry,
  DataChangeLog,
} from '@/types/data-repository'

// Re-export utilities from data-repository types
export {
  createVersion,
  parseVersion,
  compareVersions,
  calculateFreshnessScore,
  needsRefresh,
  CURRENT_DATA_VERSION,
  DEFAULT_DATA_SOURCE,
  DEFAULT_CACHE_DURATION,
} from '@/types/data-repository'
