/**
 * Market Data Service
 * High-level service for accessing market data throughout the application
 */

import type { PolicyType } from '@/types/policy'
import type {
  PolicyTypeMarketData,
  InsuranceProvider,
  TurkishRegion,
  ProviderInfo,
  CoverageBenchmark,
} from '@/types/market-data'
import type {
  BenchmarkDataRepository,
  RegionalData,
  DataSetMetadata,
  ValidationReport,
  DataQualityMetrics,
} from '@/types/data-repository'
import { calculateFreshnessScore } from '@/types/data-repository'
import { marketDataLoader, loadMarketData, checkDataFreshness } from './data-loader'
import { validateRepository, calculateQualityScore } from './validators'

// =============================================================================
// Service Types
// =============================================================================

export interface MarketDataStats {
  policyTypes: number
  providers: number
  regions: number
  totalCoverages: number
  lastUpdated: string
  freshnessScore: number
  qualityScore: number
}

export interface BenchmarkComparison {
  policyType: PolicyType
  field: string
  currentValue: number
  marketMin: number
  marketMax: number
  marketAverage: number
  percentile: number
  assessment: 'below_market' | 'at_market' | 'above_market'
}

export interface RegionalAdjustment {
  region: TurkishRegion
  baseFactor: number
  riskMultiplier: number
  adjustedValue: number
}

// =============================================================================
// Market Data Service Class
// =============================================================================

class MarketDataService {
  private repository: BenchmarkDataRepository | null = null
  private initPromise: Promise<void> | null = null
  private subscribers: Set<(repo: BenchmarkDataRepository) => void> = new Set()

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.loadData()
    await this.initPromise
  }

  /**
   * Load data from loader
   */
  private async loadData(): Promise<void> {
    const result = await loadMarketData()
    if (result.success && result.data) {
      this.repository = result.data
      this.notifySubscribers()
    }
  }

  /**
   * Subscribe to data updates
   */
  subscribe(callback: (repo: BenchmarkDataRepository) => void): () => void {
    this.subscribers.add(callback)
    if (this.repository) {
      callback(this.repository)
    }
    return () => this.subscribers.delete(callback)
  }

  /**
   * Notify subscribers of data change
   */
  private notifySubscribers(): void {
    if (!this.repository) return
    for (const callback of this.subscribers) {
      callback(this.repository)
    }
  }

  /**
   * Ensure repository is loaded
   */
  private async ensureLoaded(): Promise<BenchmarkDataRepository> {
    if (!this.repository) {
      await this.initialize()
    }
    if (!this.repository) {
      throw new Error('Failed to load market data repository')
    }
    return this.repository
  }

  // =========================================================================
  // Benchmark Access
  // =========================================================================

  /**
   * Get all available policy types
   */
  async getPolicyTypes(): Promise<PolicyType[]> {
    const repo = await this.ensureLoaded()
    return Object.keys(repo.benchmarks) as PolicyType[]
  }

  /**
   * Get benchmark data for a policy type
   */
  async getBenchmark(policyType: PolicyType): Promise<PolicyTypeMarketData | null> {
    const repo = await this.ensureLoaded()
    return repo.benchmarks[policyType] ?? null
  }

  /**
   * Get all benchmarks
   */
  async getAllBenchmarks(): Promise<Record<PolicyType, PolicyTypeMarketData>> {
    const repo = await this.ensureLoaded()
    return repo.benchmarks
  }

  /**
   * Get premium range for policy type
   */
  async getPremiumRange(
    policyType: PolicyType
  ): Promise<{ min: number; max: number; average: number } | null> {
    const benchmark = await this.getBenchmark(policyType)
    if (!benchmark?.premiumRange) return null

    return {
      min: benchmark.premiumRange.min,
      max: benchmark.premiumRange.max,
      average: benchmark.premiumRange.average ?? (benchmark.premiumRange.min + benchmark.premiumRange.max) / 2,
    }
  }

  /**
   * Get coverage range for policy type
   */
  async getCoverageRange(
    policyType: PolicyType
  ): Promise<{ min: number; max: number; recommended: number } | null> {
    const benchmark = await this.getBenchmark(policyType)
    if (!benchmark?.coverageRange) return null

    return {
      min: benchmark.coverageRange.min,
      max: benchmark.coverageRange.max,
      recommended: benchmark.coverageRange.median ?? benchmark.coverageRange.max * 0.7,
    }
  }

  /**
   * Get common coverages for policy type
   */
  async getCommonCoverages(policyType: PolicyType): Promise<CoverageBenchmark[]> {
    const benchmark = await this.getBenchmark(policyType)
    return benchmark?.commonCoverages ?? []
  }

  /**
   * Get market leaders (top providers by market share)
   */
  async getMarketLeaders(_policyType: PolicyType): Promise<ProviderInfo[]> {
    // Return top providers by market share as market leaders
    return this.getTopProviders(5)
  }

  // =========================================================================
  // Provider Access
  // =========================================================================

  /**
   * Get all providers
   */
  async getAllProviders(): Promise<Record<InsuranceProvider, ProviderInfo>> {
    const repo = await this.ensureLoaded()
    return repo.providers
  }

  /**
   * Get provider info
   */
  async getProvider(provider: InsuranceProvider): Promise<ProviderInfo | null> {
    const repo = await this.ensureLoaded()
    return repo.providers[provider] ?? null
  }

  /**
   * Get providers by specialty (returns all providers for now)
   * Note: Provider specialties not currently tracked in data model
   */
  async getProvidersBySpecialty(_policyType: PolicyType): Promise<ProviderInfo[]> {
    const repo = await this.ensureLoaded()
    // Return all providers sorted by market share
    return Object.values(repo.providers).sort((a, b) => b.marketShare - a.marketShare)
  }

  /**
   * Get top-rated providers
   */
  async getTopProviders(limit = 5): Promise<ProviderInfo[]> {
    const repo = await this.ensureLoaded()
    return Object.values(repo.providers)
      .filter(p => p.rating !== undefined)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, limit)
  }

  // =========================================================================
  // Regional Access
  // =========================================================================

  /**
   * Get all regions
   */
  async getAllRegions(): Promise<Record<TurkishRegion, RegionalData>> {
    const repo = await this.ensureLoaded()
    return repo.regionalFactors
  }

  /**
   * Get regional data
   */
  async getRegion(region: TurkishRegion): Promise<RegionalData | null> {
    const repo = await this.ensureLoaded()
    return repo.regionalFactors[region] ?? null
  }

  /**
   * Calculate regional premium adjustment
   */
  async calculateRegionalAdjustment(
    basePremium: number,
    region: TurkishRegion,
    policyType: PolicyType
  ): Promise<RegionalAdjustment> {
    const regionData = await this.getRegion(region)
    if (!regionData) {
      return {
        region,
        baseFactor: 1.0,
        riskMultiplier: 1.0,
        adjustedValue: basePremium,
      }
    }

    // Get risk multiplier based on policy type
    let riskMultiplier = 1.0
    if (policyType === 'home' || policyType === 'dask') {
      // Factor in earthquake and flood risk
      const earthquakeRisk = { very_high: 1.3, high: 1.15, medium: 1.0, low: 0.9 }
      const floodRisk = { high: 1.1, medium: 1.0, low: 0.95 }
      riskMultiplier = (earthquakeRisk[regionData.riskProfile.earthquake] ?? 1) *
                       (floodRisk[regionData.riskProfile.flood] ?? 1)
    } else if (policyType === 'kasko' || policyType === 'traffic') {
      // Factor in theft and traffic risk
      const theftRisk = { high: 1.15, medium: 1.0, low: 0.9 }
      const trafficRisk = { high: 1.2, medium: 1.0, low: 0.85 }
      riskMultiplier = (theftRisk[regionData.riskProfile.theft] ?? 1) *
                       (trafficRisk[regionData.riskProfile.traffic] ?? 1)
    }

    const totalFactor = regionData.baseFactor * riskMultiplier

    return {
      region,
      baseFactor: regionData.baseFactor,
      riskMultiplier,
      adjustedValue: Math.round(basePremium * totalFactor),
    }
  }

  // =========================================================================
  // Comparison & Analysis
  // =========================================================================

  /**
   * Compare a value against market benchmark
   */
  async compareToBenchmark(
    policyType: PolicyType,
    field: 'premium' | 'coverage' | 'deductible',
    currentValue: number
  ): Promise<BenchmarkComparison | null> {
    const benchmark = await this.getBenchmark(policyType)
    if (!benchmark) return null

    let min: number
    let max: number
    let average: number

    if (field === 'premium' && benchmark.premiumRange) {
      min = benchmark.premiumRange.min
      max = benchmark.premiumRange.max
      average = benchmark.premiumRange.average ?? (min + max) / 2
    } else if (field === 'coverage' && benchmark.coverageRange) {
      min = benchmark.coverageRange.min
      max = benchmark.coverageRange.max
      average = benchmark.coverageRange.median ?? (min + max) / 2
    } else if (field === 'deductible' && benchmark.commonCoverages?.length) {
      // Use typical deductible from common coverages
      const deductibles = benchmark.commonCoverages.map(c => c.typicalDeductible).filter(d => d > 0)
      if (deductibles.length === 0) return null
      min = Math.min(...deductibles)
      max = Math.max(...deductibles)
      average = deductibles.reduce((a, b) => a + b, 0) / deductibles.length
    } else {
      return null
    }

    // Calculate percentile
    const range = max - min
    const percentile = range > 0 ? Math.round(((currentValue - min) / range) * 100) : 50

    // Determine assessment
    let assessment: 'below_market' | 'at_market' | 'above_market'
    if (percentile < 25) {
      assessment = 'below_market'
    } else if (percentile > 75) {
      assessment = 'above_market'
    } else {
      assessment = 'at_market'
    }

    return {
      policyType,
      field,
      currentValue,
      marketMin: min,
      marketMax: max,
      marketAverage: average,
      percentile: Math.max(0, Math.min(100, percentile)),
      assessment,
    }
  }

  /**
   * Get coverage importance ranking
   */
  async getCoverageImportance(policyType: PolicyType): Promise<Map<string, number>> {
    const coverages = await this.getCommonCoverages(policyType)
    const importance = new Map<string, number>()

    for (const coverage of coverages) {
      // Score based on inclusion rate (percentage of policies that include this coverage)
      const score = coverage.inclusionRate ?? 50
      importance.set(coverage.name, Math.min(100, score))
    }

    return importance
  }

  // =========================================================================
  // Metadata & Quality
  // =========================================================================

  /**
   * Get repository metadata
   */
  async getMetadata(): Promise<DataSetMetadata | null> {
    const repo = await this.ensureLoaded()
    return repo.metadata
  }

  /**
   * Get data quality metrics
   */
  async getQualityMetrics(): Promise<DataQualityMetrics | null> {
    const repo = await this.ensureLoaded()
    return repo.metadata.quality
  }

  /**
   * Validate current data
   */
  async validateData(): Promise<ValidationReport> {
    const repo = await this.ensureLoaded()
    return validateRepository(repo)
  }

  /**
   * Get overall statistics
   */
  async getStats(): Promise<MarketDataStats> {
    const repo = await this.ensureLoaded()
    const validation = validateRepository(repo)

    let totalCoverages = 0
    for (const benchmark of Object.values(repo.benchmarks)) {
      totalCoverages += benchmark.commonCoverages?.length ?? 0
    }

    return {
      policyTypes: Object.keys(repo.benchmarks).length,
      providers: Object.keys(repo.providers).length,
      regions: Object.keys(repo.regionalFactors).length,
      totalCoverages,
      lastUpdated: repo.metadata.lastUpdated,
      freshnessScore: calculateFreshnessScore(repo.metadata.lastUpdated, repo.metadata.effectiveTo),
      qualityScore: calculateQualityScore(validation),
    }
  }

  /**
   * Check if data refresh is needed
   */
  async needsRefresh(): Promise<boolean> {
    const freshness = await checkDataFreshness()
    return !freshness.fresh
  }

  /**
   * Refresh data from sources
   */
  async refresh(): Promise<boolean> {
    marketDataLoader.invalidateCache()
    try {
      await this.loadData()
      return true
    } catch {
      return false
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const marketDataService = new MarketDataService()

// =============================================================================
// React Hook Support
// =============================================================================

/**
 * Get market data service for React components
 * Can be used with useSyncExternalStore or custom hooks
 */
export function getMarketDataService(): MarketDataService {
  return marketDataService
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize market data service (call at app startup)
 */
export async function initializeMarketData(): Promise<void> {
  await marketDataService.initialize()
}
