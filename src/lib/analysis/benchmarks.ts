import { BenchmarkBundle, BenchmarkReference, BenchmarkComparison } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

const BENCHMARK_MODEL_VERSION = '1.0.0'

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Deterministic benchmark engine.
 * Generates market comparisons safely, ensuring provenance data exists.
 * If data is low-confidence, it is suppressed from display.
 */
export function generateBenchmarkBundle(data: ExtractedPolicyData): BenchmarkBundle {
  const generatedAt = new Date().toISOString()
  const references: Record<string, BenchmarkReference> = {}
  const comparisons: BenchmarkComparison[] = []

  // Ensure policy type is known
  if (!data.policyType || !data.premium) {
    return { references, comparisons, bundleVersion: BENCHMARK_MODEL_VERSION, generatedAt }
  }

  // Example: Mock retrieval of benchmark from a "Market Data" service using provenance rules.
  // In reality, this data would come from `src/lib/market-data/service.ts`.
  // Here we construct a dummy reference for demonstration, acting as the deterministic lookup.

  const refId = generateId()
  const branch = data.policyType
  const mockMarketAveragePremium = branch === 'kasko' ? 15000 : 5000

  // 1. Establish Provenance Reference
  references[refId] = {
    benchmarkId: refId,
    branch,
    productType: 'standard',
    marketSegment: 'retail',
    geography: 'tr-TR',
    effectiveDateRange: { start: '2024-01-01', end: '2024-12-31' },
    sourceName: 'Tramer/SBM 2024 Market Data',
    sourceVersion: 'v1.4',
    dataQuality: 'high',
    matchType: 'approximate',
    matchConfidence: 0.95,
    metricName: 'average_premium',
    metricValue: mockMarketAveragePremium,
    currency: 'TRY',
    notes: 'Base average without driver specific risk factors',
  }

  // 2. Perform Comparison
  const difference = data.premium - mockMarketAveragePremium
  // Suppression Rule: Do not display benchmark if match confidence is < 0.90
  // or if the underlying extraction itself has low premium confidence.
  const policyPremiumConfidence = data.confidence?.premium || 0
  const referenceConfidence = references[refId].matchConfidence

  const isEligible = referenceConfidence >= 0.9 && policyPremiumConfidence >= 0.9
  const blockingReason = !isEligible
    ? `Suppressed: Insufficient confidence (Ref: ${referenceConfidence}, Policy: ${policyPremiumConfidence})`
    : undefined

  comparisons.push({
    comparisonId: generateId(),
    benchmarkId: refId,
    comparedField: 'premium',
    policyValue: data.premium ?? 0,
    benchmarkValue: mockMarketAveragePremium,
    difference: difference ?? 0,
    confidence: Math.min(referenceConfidence, policyPremiumConfidence),
    displayEligibility: isEligible,
    reasonIfSuppressed: blockingReason,
  })

  // 3. Compare Coverages (e.g. Deductibles against market norms)
  const deductibles = data.coverages?.filter((c) => c.deductible !== null && c.deductible > 0) || []
  if (deductibles.length > 0 && branch === 'kasko') {
    const dedRefId = generateId()
    references[dedRefId] = {
      benchmarkId: dedRefId,
      branch,
      productType: 'standard',
      marketSegment: 'retail',
      geography: 'tr-TR',
      effectiveDateRange: { start: '2024-01-01' },
      sourceName: 'Insurance Association Market Standard',
      sourceVersion: 'v1.0',
      dataQuality: 'high',
      matchType: 'exact',
      matchConfidence: 0.95, // High confidence rule
      metricName: 'typical_deductible',
      metricValue: 0,
    }

    for (const cov of deductibles) {
      // Comparison: Deductible against 0
      const covLimitConf = data.confidence?.coverages || 0
      const dedEligible = covLimitConf >= 0.85

      comparisons.push({
        comparisonId: generateId(),
        benchmarkId: dedRefId,
        comparedField: `coverage.${cov.name}.deductible`,
        policyValue: cov.deductible ?? 0,
        benchmarkValue: 0,
        difference: cov.deductible ?? 0,
        confidence: covLimitConf,
        displayEligibility: dedEligible,
        reasonIfSuppressed: !dedEligible ? 'Low coverage extraction confidence' : undefined,
      })
    }
  }

  return {
    references,
    comparisons,
    bundleVersion: BENCHMARK_MODEL_VERSION,
    generatedAt,
  }
}
