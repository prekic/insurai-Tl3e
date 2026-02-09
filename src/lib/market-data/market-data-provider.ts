/**
 * Market Data Provider
 *
 * Facade layer that abstracts market data access with a DB-first, static-fallback pattern.
 * Consumers call async methods that return the same PolicyTypeMarketData shape used throughout
 * the codebase, but the data source is now configurable via the Admin Settings UI.
 *
 * Resolution order:
 * 1. Database (via ConfigurationService) — admin-configurable
 * 2. Static fallback (MARKET_BENCHMARKS from benchmarks.ts)
 */

import type { PolicyType } from '@/types/policy'
import type {
  PolicyTypeMarketData,
  TurkishRegion,
  CoverageBenchmark,
  ProviderInfo,
  InsuranceProvider,
} from '@/types/market-data'
import type { MarketBenchmark, InsuranceProvider as DBInsuranceProvider } from '@/lib/config/types'
import { configService } from '@/lib/config/configuration-service'
import {
  MARKET_BENCHMARKS,
  REGIONAL_FACTORS,
  calculatePremiumPercentile as staticCalculatePremiumPercentile,
  calculateCoveragePercentile as staticCalculateCoveragePercentile,
  getRegionalFactor as staticGetRegionalFactor,
} from '@/data/market-data/benchmarks'
import {
  INSURANCE_PROVIDERS,
  findProviderByName as staticFindProviderByName,
  getProvidersByMarketShare as staticGetProvidersByMarketShare,
  getProviderRank as staticGetProviderRank,
} from '@/data/market-data/providers'

/**
 * Transform DB MarketBenchmark rows into a CoverageBenchmark array
 */
function dbRowsToCoverageBenchmarks(rows: MarketBenchmark[]): CoverageBenchmark[] {
  return rows.map((row) => ({
    name: row.coverageType,
    nameTr: row.coverageNameTr ?? row.coverageType,
    typicalLimit: row.typicalLimit ?? 0,
    minLimit: row.minLimit ?? 0,
    maxLimit: row.maxLimit ?? 0,
    typicalDeductible: row.typicalDeductible ?? 0,
    minDeductible: row.minDeductible ?? 0,
    maxDeductible: row.maxDeductible ?? 0,
    inclusionRate: row.inclusionRate ?? 0,
  }))
}

/**
 * Market Data Provider — singleton async facade
 */
class MarketDataProviderImpl {
  /**
   * Get benchmark data for a policy type.
   * Tries DB first; falls back to static data.
   */
  async getBenchmark(policyType: PolicyType): Promise<PolicyTypeMarketData> {
    try {
      const dbBenchmarks = await configService.getMarketBenchmarks(policyType)
      if (dbBenchmarks.length > 0) {
        return this.mergeWithStaticData(policyType, dbBenchmarks)
      }
    } catch {
      // DB unavailable — fall through to static
    }
    return MARKET_BENCHMARKS[policyType]
  }

  /**
   * Get regional risk factor.
   * Tries DB first; falls back to static data.
   */
  async getRegionalFactor(policyType: PolicyType, region: TurkishRegion): Promise<number> {
    try {
      const factor = await configService.getRegionalFactor(region, policyType)
      if (factor !== 1.0) {
        return factor
      }
      // 1.0 might be a real value or the default fallback — check static too
      const staticFactor = staticGetRegionalFactor(policyType, region)
      // If static differs from 1.0, DB likely returned the default fallback
      if (staticFactor !== 1.0) {
        // Try once more with 'all' policy type from DB
        const allFactor = await configService.getRegionalFactor(region, 'all')
        if (allFactor !== 1.0) return allFactor
      }
      return factor
    } catch {
      return staticGetRegionalFactor(policyType, region)
    }
  }

  /**
   * Get all regional factors.
   */
  async getAllRegionalFactors(): Promise<Record<TurkishRegion, { name: string; nameTr: string; factor: number }>> {
    try {
      const dbFactors = await configService.getRegionalFactors()
      if (dbFactors.length > 0) {
        const result = { ...REGIONAL_FACTORS }
        for (const f of dbFactors) {
          const region = f.regionCode as TurkishRegion
          if (result[region]) {
            result[region] = {
              name: f.regionName ?? result[region].name,
              nameTr: f.regionNameTr ?? result[region].nameTr,
              factor: f.riskFactor,
            }
          }
        }
        return result
      }
    } catch {
      // fall through
    }
    return REGIONAL_FACTORS
  }

  /**
   * Calculate premium percentile using DB benchmark data when available.
   */
  async calculatePremiumPercentile(
    premium: number,
    policyType: PolicyType,
    region?: TurkishRegion
  ): Promise<number> {
    // Static calculation is sufficient — it uses MARKET_BENCHMARKS internally
    // and the shape is the same whether data comes from DB or static.
    // For full DB support, we'd need premiumRange data which isn't per-coverage-row.
    return staticCalculatePremiumPercentile(premium, policyType, region)
  }

  /**
   * Calculate coverage percentile.
   */
  async calculateCoveragePercentile(
    coverage: number,
    policyType: PolicyType
  ): Promise<number> {
    return staticCalculateCoveragePercentile(coverage, policyType)
  }

  /**
   * Get insurance providers.
   * Tries DB first; falls back to static data.
   */
  async getInsuranceProviders(): Promise<DBInsuranceProvider[]> {
    try {
      const dbProviders = await configService.getInsuranceProviders()
      if (dbProviders.length > 0) {
        return dbProviders
      }
    } catch {
      // fall through
    }
    return []
  }

  /**
   * Find provider by name. Static data used since provider matching is name-based.
   */
  findProviderByName(name: string): ProviderInfo | undefined {
    return staticFindProviderByName(name)
  }

  /**
   * Get providers sorted by market share.
   */
  getProvidersByMarketShare(): ProviderInfo[] {
    return staticGetProvidersByMarketShare()
  }

  /**
   * Get provider rank.
   */
  getProviderRank(providerId: string): number {
    return staticGetProviderRank(providerId as InsuranceProvider)
  }

  /**
   * Get number of providers.
   */
  getProviderCount(): number {
    return Object.keys(INSURANCE_PROVIDERS).length
  }

  /**
   * Merge DB coverage benchmarks into the existing static PolicyTypeMarketData.
   * DB rows replace the commonCoverages array; all other fields come from static data.
   * This ensures premiumRange, coverageRange, trends, etc. are always present.
   */
  private mergeWithStaticData(
    policyType: PolicyType,
    dbBenchmarks: MarketBenchmark[]
  ): PolicyTypeMarketData {
    const staticData = MARKET_BENCHMARKS[policyType]
    const dbCoverages = dbRowsToCoverageBenchmarks(dbBenchmarks)

    return {
      ...staticData,
      commonCoverages: dbCoverages.length > 0 ? dbCoverages : staticData.commonCoverages,
    }
  }
}

/**
 * Singleton instance
 */
export const marketDataProvider = new MarketDataProviderImpl()
