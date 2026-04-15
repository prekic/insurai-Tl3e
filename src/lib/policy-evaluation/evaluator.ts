/**
 * Policy Evaluator
 *
 * Evaluates a single policy against market benchmarks using the
 * Turkish insurance knowledge database.
 */

import type { Policy, PolicyType } from '@/types/policy'
import type {
  PolicyEvaluation,
  ScoreBreakdown,
  ComplianceIssue,
  Recommendation,
  EvaluationConfig,
  GradeThresholds,
  StatusThresholds,
} from './types'
import {
  DEFAULT_EVALUATION_CONFIG,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_STATUS_THRESHOLDS,
  getGradeFromScore,
  getStatusFromScore,
} from './types'

// Import knowledge database
import {
  getBranchStatistics,
  getCurrentTrafficLimits,
  getCurrentDaskLimits,
  MARKET_DATA_2024,
  DASK_PREMIUM_RATES_2026,
} from '@/data'

// Import benchmark service for database-driven benchmarks
import {
  getPremiumBenchmarkWithFallback,
  isValueBasedBenchmark,
  evaluateValueBasedPremium,
} from './benchmark-service'

// =============================================================================
// BENCHMARK CONFIDENCE ASSESSMENT
// =============================================================================

import type {
  BenchmarkConfidence,
  BenchmarkConfidenceLevel,
  BenchmarkContextFactor,
  BenchmarkFreshness,
} from './types'

/**
 * Assess how much confidence we should place in a benchmark comparison.
 *
 * Premium comparisons are only meaningful when the comparison cohort matches
 * the actual policy. Without key context factors, the "market average" could
 * be for a completely different risk profile.
 *
 * Context factors checked:
 *   1. Vehicle class / type (economy vs luxury vs commercial)
 *   2. Vehicle model year (affects depreciation and premium)
 *   3. Geography / region (Istanbul 1.2x vs rural 0.85x)
 *   4. Insurer (provider-specific pricing tiers)
 *   5. Policy coverage level (market value / sum insured)
 *
 * Thresholds:
 *   - 3+ factors present → 'high' confidence → full comparison shown
 *   - 1-2 factors present → 'low' confidence → comparison with prominent caveat
 *   - 0 factors present  → 'suppressed' → hide comparison entirely
 */
/**
 * Compute benchmark data freshness from dataDate and config thresholds.
 */
function computeBenchmarkFreshness(
  dataDate: string | undefined,
  agingDays: number,
  staleDays: number
): { freshness: BenchmarkFreshness; dataAgeDays: number } {
  if (!dataDate) {
    return { freshness: 'stale', dataAgeDays: Infinity }
  }
  const dataTimestamp = new Date(dataDate).getTime()
  if (isNaN(dataTimestamp)) {
    return { freshness: 'stale', dataAgeDays: Infinity }
  }
  const dataAgeDays = Math.floor((Date.now() - dataTimestamp) / 86_400_000)
  let freshness: BenchmarkFreshness
  if (dataAgeDays <= agingDays) {
    freshness = 'current'
  } else if (dataAgeDays <= staleDays) {
    freshness = 'aging'
  } else {
    freshness = 'stale'
  }
  return { freshness, dataAgeDays }
}

function assessBenchmarkConfidence(
  policy: Policy,
  dataDate?: string,
  evalConfig?: EvaluationConfig
): BenchmarkConfidence {
  const analyzedPolicy = policy as import('@/types/policy').AnalyzedPolicy
  const config = evalConfig || DEFAULT_EVALUATION_CONFIG

  const factors: BenchmarkContextFactor[] = [
    {
      factor: 'Vehicle class',
      factorTr: 'Araç sınıfı',
      present: !!(analyzedPolicy.vehicleInfo?.vehicleClass || analyzedPolicy.vehicleInfo?.usage),
      value: analyzedPolicy.vehicleInfo?.vehicleClass || analyzedPolicy.vehicleInfo?.usage,
    },
    {
      factor: 'Model year',
      factorTr: 'Model yılı',
      present: !!analyzedPolicy.vehicleInfo?.year,
      value: analyzedPolicy.vehicleInfo?.year?.toString(),
    },
    {
      factor: 'Geography',
      factorTr: 'Bölge',
      present: !!(analyzedPolicy.location && analyzedPolicy.location.length > 2),
      value: analyzedPolicy.location || undefined,
    },
    {
      factor: 'Insurer',
      factorTr: 'Sigorta şirketi',
      present: !!(
        policy.provider &&
        policy.provider !== 'Unknown' &&
        policy.provider !== 'Bilinmiyor'
      ),
      value: policy.provider || undefined,
    },
    {
      factor: 'Coverage level',
      factorTr: 'Teminat tutarı',
      present: policy.coverage > 0,
      value: policy.coverage > 0 ? `${policy.coverage.toLocaleString('tr-TR')} TL` : undefined,
    },
  ]

  const presentCount = factors.filter((f) => f.present).length
  const totalCount = factors.length

  // Compute freshness from dataDate
  const { freshness, dataAgeDays } = computeBenchmarkFreshness(
    dataDate,
    config.benchmarkAgingDays ?? 180,
    config.benchmarkStaleDays ?? 365
  )

  // Determine confidence level from context factors
  let level: BenchmarkConfidenceLevel
  let suppressionReason: string | undefined
  let suppressionReasonTr: string | undefined

  if (presentCount >= 3) {
    level = 'high'
  } else if (presentCount >= 1) {
    level = 'low'
  } else {
    level = 'suppressed'
    suppressionReason =
      'Insufficient context for meaningful market comparison — vehicle, location, and coverage data missing'
    suppressionReasonTr =
      'Anlamlı piyasa karşılaştırması için yeterli bağlam yok — araç, konum ve teminat bilgileri eksik'
  }

  // Stale data downgrades confidence by one step
  if (freshness === 'stale' && level !== 'suppressed') {
    if (level === 'high') {
      level = 'low'
    } else if (level === 'low') {
      level = 'suppressed'
      suppressionReason = `Benchmark data is over ${config.benchmarkStaleDays ?? 365} days old (from ${dataDate}) — comparison suppressed`
      suppressionReasonTr = `Karşılaştırma verileri ${config.benchmarkStaleDays ?? 365} günden eski (${dataDate} tarihli) — karşılaştırma yapılamıyor`
    }
  }

  return {
    level,
    factors,
    presentCount,
    totalCount,
    suppressionReason,
    suppressionReasonTr,
    freshness,
    dataAsOf: dataDate,
    dataAgeDays: isFinite(dataAgeDays) ? dataAgeDays : undefined,
  }
}

// =============================================================================
// POLICY TYPE TO BRANCH CODE MAPPING
// =============================================================================

const POLICY_TYPE_TO_BRANCH: Record<PolicyType, string> = {
  kasko: 'kasko',
  traffic: 'traffic',
  home: 'fire',
  health: 'health',
  life: 'life',
  dask: 'fire', // DASK falls under fire/natural disasters
  business: 'fire',
  nakliyat: 'nakliyat', // Transportation/Cargo insurance
}

const POLICY_TYPE_TO_INSURANCE_TYPE: Record<PolicyType, string> = {
  kasko: 'kasko',
  traffic: 'zmss',
  home: 'home',
  health: 'health',
  life: 'life',
  dask: 'dask',
  business: 'business',
  nakliyat: 'nakliyat',
}

// =============================================================================
// MAIN EVALUATION FUNCTION
// =============================================================================

export interface EvaluatePolicyOptions {
  config?: Partial<EvaluationConfig>
  gradeThresholds?: Partial<GradeThresholds>
  statusThresholds?: Partial<StatusThresholds>
}

export function evaluatePolicy(
  policy: Policy,
  configOrOptions: Partial<EvaluationConfig> | EvaluatePolicyOptions = {}
): PolicyEvaluation {
  // Handle both old signature (config only) and new signature (options object)
  let config: Partial<EvaluationConfig>
  let gradeThresholds: GradeThresholds
  let statusThresholds: StatusThresholds

  if (
    'config' in configOrOptions ||
    'gradeThresholds' in configOrOptions ||
    'statusThresholds' in configOrOptions
  ) {
    // New signature with options object
    const options = configOrOptions as EvaluatePolicyOptions
    config = options.config || {}
    gradeThresholds = { ...DEFAULT_GRADE_THRESHOLDS, ...options.gradeThresholds }
    statusThresholds = { ...DEFAULT_STATUS_THRESHOLDS, ...options.statusThresholds }
  } else {
    // Old signature - just config
    config = configOrOptions as Partial<EvaluationConfig>
    gradeThresholds = DEFAULT_GRADE_THRESHOLDS
    statusThresholds = DEFAULT_STATUS_THRESHOLDS
  }

  const fullConfig = { ...DEFAULT_EVALUATION_CONFIG, ...config }
  const branchCode = POLICY_TYPE_TO_BRANCH[policy.type]
  const branchStats = getBranchStatistics(branchCode)

  // Get benchmark dataDate for freshness assessment
  const insuranceTypeForDate = POLICY_TYPE_TO_INSURANCE_TYPE[policy.type]
  const benchmarkForDate = getPremiumBenchmarkWithFallback(insuranceTypeForDate)

  // Assess benchmark confidence (context factors + data freshness)
  const benchmarkConfidence = assessBenchmarkConfidence(
    policy,
    benchmarkForDate?.dataDate,
    fullConfig
  )

  // Evaluate each category
  const premiumScore = evaluatePremium(policy, fullConfig, benchmarkConfidence)
  const coverageScore = evaluateCoverage(policy, fullConfig)
  const deductibleScore = evaluateDeductible(policy, fullConfig)
  const complianceResult = evaluateCompliance(policy, fullConfig)
  const valueScore = evaluateValue(policy, premiumScore.score, coverageScore.score, fullConfig)

  // Calculate weighted overall score
  let overallScore = calculateOverallScore(
    {
      premium: premiumScore.score,
      coverage: coverageScore.score,
      deductible: deductibleScore.score,
      compliance: complianceResult.score,
      value: valueScore.score,
    },
    fullConfig.weights
  )

  // Priority 4: Score Safety Capping
  const hasCriticalComplianceIssues = complianceResult.complianceIssues.some(
    (i) => i.severity === 'critical'
  )
  // Safest implementation: apply the same 60 max cap to ALL untrusted benchmark states, including fallback and missing.
  const hasUntrustedBenchmark =
    !benchmarkForDate || benchmarkForDate?.benchmarkStatus === 'untrusted'

  if (hasCriticalComplianceIssues || hasUntrustedBenchmark) {
    overallScore = Math.min(overallScore, 60)
  }

  // Generate market comparison
  const marketComparison = generateMarketComparison(policy, branchStats)

  // Generate recommendations
  const recommendations = generateRecommendations(
    policy,
    {
      premium: premiumScore,
      coverage: coverageScore,
      deductible: deductibleScore,
      compliance: complianceResult,
      value: valueScore,
    },
    complianceResult.complianceIssues
  )

  // Generate summary
  const summary = generateSummary(
    {
      premium: premiumScore,
      coverage: coverageScore,
      deductible: deductibleScore,
      compliance: complianceResult,
      value: valueScore,
    },
    recommendations
  )

  return {
    policyId: policy.id,
    policyNumber: policy.policyNumber,
    policyType: policy.type,
    evaluatedAt: new Date().toISOString(),

    overallScore,
    grade: getGradeFromScore(overallScore, gradeThresholds),
    isProvisional: Boolean(
      (policy as { isDraft?: boolean }).isDraft ||
      ((policy as { aiConfidence?: number }).aiConfidence ?? 1) < 0.85 ||
      !benchmarkForDate ||
      benchmarkForDate.benchmarkStatus === 'untrusted'
    ),
    status: getStatusFromScore(overallScore, statusThresholds),

    scoreBreakdown: {
      premium: premiumScore,
      coverage: coverageScore,
      deductible: deductibleScore,
      compliance: complianceResult,
      value: valueScore,
    },

    marketComparison,

    compliance: {
      isCompliant:
        complianceResult.complianceIssues.filter((i) => i.severity === 'critical').length === 0,
      mandatoryMet:
        complianceResult.complianceIssues.filter(
          (i) => i.type === 'missing_coverage' && i.severity === 'critical'
        ).length === 0,
      minimumLimitsMet:
        complianceResult.complianceIssues.filter((i) => i.type === 'below_minimum').length === 0,
      issues: complianceResult.complianceIssues,
    },

    recommendations,
    summary,
    scenarioCards: generateScenarioCards(policy, complianceResult),

    benchmarkConfidence,

    // Benchmark provenance disclaimer — varies by freshness
    benchmarkDisclaimer:
      benchmarkConfidence.freshness === 'stale'
        ? `Benchmark data is from ${benchmarkConfidence.dataAsOf || 'unknown date'} (${benchmarkConfidence.dataAgeDays ?? '?'} days old). This is a historical reference only — updated market validation recommended.`
        : benchmarkConfidence.freshness === 'aging'
          ? `Market data from ${benchmarkConfidence.dataAsOf || 'unknown date'}. Actual premiums vary by vehicle, driver profile, and region.`
          : 'Market averages are estimates based on indicative data. Actual premiums vary by vehicle, driver profile, and region.',
    benchmarkDisclaimerTr:
      benchmarkConfidence.freshness === 'stale'
        ? `Karşılaştırma verileri ${benchmarkConfidence.dataAsOf || 'bilinmeyen tarih'} tarihli (${benchmarkConfidence.dataAgeDays ?? '?'} gün eski). Bu yalnızca tarihsel referanstır — güncel piyasa doğrulaması önerilir.`
        : benchmarkConfidence.freshness === 'aging'
          ? `Piyasa verileri ${benchmarkConfidence.dataAsOf || 'bilinmeyen tarih'} tarihli. Gerçek primler araca, sürücü profiline ve bölgeye göre değişir.`
          : 'Piyasa ortalamaları gösterge niteliğinde tahminlere dayanmaktadır. Gerçek primler araca, sürücü profiline ve bölgeye göre değişir.',
  }
}

// =============================================================================
// PREMIUM EVALUATION
// =============================================================================

function evaluatePremium(
  policy: Policy,
  config: EvaluationConfig,
  confidence?: BenchmarkConfidence
): ScoreBreakdown {
  const insuranceType = POLICY_TYPE_TO_INSURANCE_TYPE[policy.type]
  const benchmark = getPremiumBenchmarkWithFallback(insuranceType)
  const issues: string[] = []
  const issuesTR: string[] = []

  // Check if premium is missing (flagged by extractor or zero without explicit data)
  const analyzedPolicy = policy as import('@/types/policy').AnalyzedPolicy
  const isPremiumMissing = analyzedPolicy.premiumMissing === true || policy.premium <= 0

  if (isPremiumMissing) {
    return {
      category: 'Premium',
      categoryTR: 'Prim',
      score: -1, // Sentinel: insufficient data
      weight: config.weights.premium,
      details: 'Premium was not extracted — insufficient data for scoring',
      detailsTR: 'Prim bilgisi çıkarılamadı — puanlama için yeterli veri yok',
      issues: ['Premium not available in extracted data'],
      issuesTR: ['Prim bilgisi çıkarılan veride mevcut değil'],
    }
  }

  // If benchmark confidence is suppressed, return neutral score — comparison is meaningless
  if (confidence?.level === 'suppressed') {
    const missingNames = confidence.factors
      .filter((f) => !f.present)
      .map((f) => f.factor)
      .join(', ')
    const missingNamesTr = confidence.factors
      .filter((f) => !f.present)
      .map((f) => f.factorTr)
      .join(', ')
    return {
      category: 'Premium',
      categoryTR: 'Prim',
      score: 70, // Neutral — no comparison possible
      weight: config.weights.premium,
      details: `Premium of ${policy.premium.toLocaleString('tr-TR')} TL — comparison suppressed (missing: ${missingNames})`,
      detailsTR: `${policy.premium.toLocaleString('tr-TR')} TL prim — karşılaştırma yapılamıyor (eksik: ${missingNamesTr})`,
      issues: ['Market comparison suppressed due to insufficient context data'],
      issuesTR: ['Yetersiz bağlam verisi nedeniyle piyasa karşılaştırması yapılamıyor'],
    }
  }

  let score = 70 // Default score
  let details = `Premium of ${policy.premium.toLocaleString('tr-TR')} TL compared to market estimate`
  let detailsTR = `${policy.premium.toLocaleString('tr-TR')} TL prim, piyasa tahmini ile karşılaştırıldı`

  if (benchmark?.benchmarkStatus === 'untrusted' || !benchmark) {
    return {
      category: 'Premium',
      categoryTR: 'Prim',
      score: 70, // Neutral — no comparison possible
      weight: config.weights.premium,
      details: `Premium of ${policy.premium.toLocaleString('tr-TR')} TL — Market benchmark unavailable.`,
      detailsTR: `${policy.premium.toLocaleString('tr-TR')} TL prim — Piyasa karşılaştırması kullanılamıyor.`,
      issues: ['Benchmark confidence too low for numeric market comparison'],
      issuesTR: ['Sayısal piyasa karşılaştırması için karşılaştırma güveni çok düşük'],
    }
  }

  // Benchmark provenance check: current benchmarks are indicative estimates,
  // not verified against audited market data. Cap scores to prevent false confidence.
  const BENCHMARK_SCORE_CAP = 75 // Max score when benchmark lacks verified provenance

  if (benchmark) {
    // Check if this benchmark uses value-based comparison (% of insured value)
    // This is typical for kasko, where premium depends on vehicle value
    if (isValueBasedBenchmark(benchmark) && policy.coverage > 0) {
      // Use value-based evaluation
      const valueEval = evaluateValueBasedPremium(policy.premium, policy.coverage, benchmark)
      score = Math.min(valueEval.score, BENCHMARK_SCORE_CAP)
      details = valueEval.details
      detailsTR = valueEval.detailsTR

      const isStale = confidence?.freshness === 'stale'
      const dateRef = confidence?.dataAsOf ? ` (data from ${confidence.dataAsOf})` : ''
      const dateRefTr = confidence?.dataAsOf ? ` (${confidence.dataAsOf} tarihli veri)` : ''

      if (valueEval.position === 'high') {
        issues.push(
          isStale
            ? `Premium rate above historical market estimate${dateRef} — updated validation recommended`
            : 'Premium rate is above market estimate for this value (indicative benchmark)'
        )
        issuesTR.push(
          isStale
            ? `Prim oranı tarihsel piyasa tahmininin üzerinde${dateRefTr} — güncel doğrulama önerilir`
            : 'Prim oranı bu değer için piyasa tahmininin üzerinde (gösterge niteliğinde)'
        )
      } else if (valueEval.position === 'very_high') {
        issues.push(
          isStale
            ? `Premium rate significantly exceeds historical market range${dateRef} — updated validation recommended`
            : 'Premium rate significantly exceeds typical market range (indicative benchmark)'
        )
        issuesTR.push(
          isStale
            ? `Prim oranı tarihsel piyasa aralığını önemli ölçüde aşıyor${dateRefTr} — güncel doğrulama önerilir`
            : 'Prim oranı tipik piyasa aralığını önemli ölçüde aşıyor (gösterge niteliğinde)'
        )
      }
    } else {
      // Direct premium comparison
      const { minPremium, avgPremium, maxPremium } = benchmark
      const isStaleD = confidence?.freshness === 'stale'
      const dateRefD = confidence?.dataAsOf ? ` (data from ${confidence.dataAsOf})` : ''
      const dateRefDTr = confidence?.dataAsOf ? ` (${confidence.dataAsOf} tarihli veri)` : ''

      if (policy.premium < minPremium) {
        // Suspiciously low - might be missing coverage
        score = 60
        issues.push('Premium is below market minimum - verify coverage is adequate')
        issuesTR.push('Prim piyasa minimumunun altında - teminatın yeterli olduğunu doğrulayın')
      } else if (policy.premium <= avgPremium) {
        // At or below average — cap at BENCHMARK_SCORE_CAP since benchmark is indicative
        score = Math.min(
          90 + Math.round(((avgPremium - policy.premium) / avgPremium) * 10),
          BENCHMARK_SCORE_CAP
        )
      } else if (policy.premium <= maxPremium) {
        // Above average but within range
        const aboveAvgRatio = (policy.premium - avgPremium) / (maxPremium - avgPremium)
        score = 90 - Math.round(aboveAvgRatio * 30)
        if (aboveAvgRatio > 0.5) {
          issues.push(
            isStaleD
              ? `Premium above historical market estimate${dateRefD} — updated validation recommended`
              : 'Premium is significantly above market estimate'
          )
          issuesTR.push(
            isStaleD
              ? `Prim tarihsel piyasa tahmininin üzerinde${dateRefDTr} — güncel doğrulama önerilir`
              : 'Prim piyasa tahmininin önemli ölçüde üzerinde'
          )
        }
      } else {
        // Above maximum
        score = 40
        issues.push(
          isStaleD
            ? `Premium exceeds historical market range${dateRefD} — updated validation recommended`
            : 'Premium exceeds typical market range'
        )
        issuesTR.push(
          isStaleD
            ? `Prim tarihsel piyasa aralığını aşıyor${dateRefDTr} — güncel doğrulama önerilir`
            : 'Prim tipik piyasa aralığını aşıyor'
        )
      }
    }
  }

  // Check premium relative to coverage (skip for market value policies where coverage is 0)
  if (policy.coverage > 0) {
    const premiumToCoverageRatio = policy.premium / policy.coverage
    const avgRatio =
      MARKET_DATA_2024.averagePremiums[
        insuranceType as keyof typeof MARKET_DATA_2024.averagePremiums
      ] || 5000
    const expectedRatio = avgRatio / 100000 // Rough expected ratio

    if (premiumToCoverageRatio > expectedRatio * 2) {
      score = Math.max(score - 10, 0)
      issues.push('Premium to coverage ratio is high')
      issuesTR.push('Prim/teminat oranı yüksek')
    }
  }

  // Qualify details when confidence is low
  if (confidence?.level === 'low') {
    const missingNames = confidence.factors
      .filter((f) => !f.present)
      .map((f) => f.factor)
      .join(', ')
    const missingNamesTr = confidence.factors
      .filter((f) => !f.present)
      .map((f) => f.factorTr)
      .join(', ')
    details += ` (low confidence — missing: ${missingNames})`
    detailsTR += ` (düşük güven — eksik: ${missingNamesTr})`
  }

  return {
    category: 'Premium',
    categoryTR: 'Prim',
    score,
    weight: config.weights.premium,
    details,
    detailsTR,
    issues,
    issuesTR,
  }
}

// =============================================================================
// COVERAGE EVALUATION
// =============================================================================

function evaluateCoverage(policy: Policy, config: EvaluationConfig): ScoreBreakdown {
  const issues: string[] = []
  const issuesTR: string[] = []
  let score = 70

  // Kasko-specific evaluation
  const isKasko = policy.type === 'kasko'
  const hasMarketValueCoverage = policy.coverages.some((c) => c.isMarketValue)
  const hasUnlimitedLiability = policy.coverages.some(
    (c) => c.isUnlimited && c.name.toLowerCase().includes('mali sorumluluk')
  )

  if (isKasko) {
    // For kasko, base coverages (collision, theft, fire, natural disasters) are IMPLICIT
    // Start with a higher base score since these are always included
    score = 75

    // Bonus for market value coverage (Rayiç Değer)
    if (hasMarketValueCoverage || policy.coverage === 0) {
      score += 10 // Market value coverage is good
    }

    // Bonus for unlimited liability
    if (hasUnlimitedLiability) {
      score += 10
    }

    // Check for valuable kasko additions
    const coverageNames = policy.coverages.map((c) => c.name.toLowerCase())
    if (coverageNames.some((n) => n.includes('ferdi kaza') || n.includes('koltuk'))) {
      score += 5 // Personal accident coverage
    }
    if (coverageNames.some((n) => n.includes('ikame') || n.includes('replacement'))) {
      score += 5 // Replacement vehicle
    }
    if (coverageNames.some((n) => n.includes('hukuki') || n.includes('legal'))) {
      score += 3 // Legal protection
    }
  } else {
    // Non-kasko: Check total coverage amount
    const coveragePerPremium = policy.coverage / policy.premium
    if (coveragePerPremium > 20) {
      score += 15
    } else if (coveragePerPremium < 10) {
      score -= 10
      issues.push('Coverage amount is low relative to premium paid')
      issuesTR.push('Teminat tutarı ödenen prime göre düşük')
    }
  }

  // Check number of coverages (applies to all policy types)
  const includedCoverages = policy.coverages.filter((c) => c.included !== false)
  const coverageCount = includedCoverages.length

  if (coverageCount >= 10) {
    score += 10
  } else if (coverageCount >= 6) {
    score += 5
  } else if (coverageCount < 3 && !isKasko) {
    // Don't penalize kasko for low count - base coverages are implicit
    score -= 15
    issues.push('Limited number of coverages included')
    issuesTR.push('Dahil edilen teminat sayısı sınırlı')
  }

  // Check for essential coverages by policy type (kasko now has different essentials)
  const missingEssential = checkMissingEssentialCoverages(policy)
  if (missingEssential.length > 0) {
    // For kasko, missing "essentials" are recommendations, not critical gaps
    const penalty = isKasko ? 5 : 10
    score -= missingEssential.length * penalty
    missingEssential.forEach((m) => {
      if (isKasko) {
        issues.push(`Recommended coverage: ${m.en}`)
        issuesTR.push(`Önerilen teminat: ${m.tr}`)
      } else {
        issues.push(`Missing essential coverage: ${m.en}`)
        issuesTR.push(`Eksik temel teminat: ${m.tr}`)
      }
    })
  }

  // Check coverage limits (skip for kasko - supplementary coverages like glass, roadside often have low limits)
  if (!isKasko) {
    const lowLimitCoverages = includedCoverages.filter(
      (c) => c.limit > 0 && c.limit < 50000 && !c.isUnlimited
    )
    if (lowLimitCoverages.length > 2) {
      score -= 10
      issues.push('Several coverages have low limits')
      issuesTR.push('Birçok teminatın limiti düşük')
    }
  }

  // Ensure score is in valid range
  score = Math.max(0, Math.min(100, score))

  // Generate appropriate details message
  let details: string
  let detailsTR: string

  if (isKasko && (hasMarketValueCoverage || policy.coverage === 0)) {
    details = `${coverageCount} coverages included, vehicle covered at market value`
    detailsTR = `${coverageCount} teminat dahil, araç rayiç değer üzerinden teminatlı`
  } else {
    details = `${coverageCount} coverages included with total coverage of ${policy.coverage.toLocaleString('tr-TR')} TL`
    detailsTR = `${coverageCount} teminat dahil, toplam ${policy.coverage.toLocaleString('tr-TR')} TL teminat`
  }

  return {
    category: 'Coverage',
    categoryTR: 'Teminat',
    score,
    weight: config.weights.coverage,
    details,
    detailsTR,
    issues,
    issuesTR,
  }
}

function checkMissingEssentialCoverages(policy: Policy): { en: string; tr: string }[] {
  const missing: { en: string; tr: string }[] = []
  const coverageNames = policy.coverages.filter((c) => c.included).map((c) => c.name.toLowerCase())

  // IMPORTANT: For kasko, Collision, Theft, Fire, Natural Disasters are IMPLICIT
  // They are included in the base kasko premium - don't flag them as missing!
  // Instead, check for valuable additional coverages that enhance the policy.
  const essentialByType: Record<PolicyType, { en: string; tr: string; implicit?: boolean }[]> = {
    kasko: [
      // NOTE: Collision, Theft, Fire, Natural Disasters are IMPLICIT in kasko
      // They should NOT be listed here as they're always included in base coverage
      // Check for valuable additional coverages instead:
      { en: 'Increased Liability', tr: 'Artan Mali Sorumluluk', implicit: false },
      { en: 'Personal Accident', tr: 'Ferdi Kaza', implicit: false },
    ],
    traffic: [
      { en: 'Bodily Injury', tr: 'Bedensel Hasar' },
      { en: 'Material Damage', tr: 'Maddi Hasar' },
    ],
    home: [
      { en: 'Fire', tr: 'Yangın' },
      { en: 'Theft', tr: 'Hırsızlık' },
      { en: 'Water Damage', tr: 'Su Hasarı' },
    ],
    health: [
      { en: 'Hospitalization', tr: 'Yatarak Tedavi' },
      { en: 'Surgery', tr: 'Ameliyat' },
    ],
    life: [{ en: 'Death Benefit', tr: 'Vefat Teminatı' }],
    dask: [{ en: 'Earthquake', tr: 'Deprem' }],
    business: [
      { en: 'Fire', tr: 'Yangın' },
      { en: 'Theft', tr: 'Hırsızlık' },
      { en: 'Business Interruption', tr: 'İş Durması' },
    ],
    nakliyat: [
      { en: 'Cargo Damage', tr: 'Emtia Hasarı' },
      { en: 'Loading/Unloading', tr: 'Yükleme/Boşaltma' },
      { en: 'Theft', tr: 'Hırsızlık' },
    ],
  }

  const essentials = essentialByType[policy.type] || []

  for (const essential of essentials) {
    const found = coverageNames.some(
      (name) =>
        name.includes(essential.en.toLowerCase()) || name.includes(essential.tr.toLowerCase())
    )
    if (!found) {
      missing.push({ en: essential.en, tr: essential.tr })
    }
  }

  return missing
}

// =============================================================================
// DEDUCTIBLE EVALUATION
// =============================================================================

function evaluateDeductible(policy: Policy, config: EvaluationConfig): ScoreBreakdown {
  const issues: string[] = []
  const issuesTR: string[] = []
  let score = 80

  // Handle market value policies where coverage field is 0
  // In this case, we can only evaluate the absolute deductible amount
  const hasMarketValueCoverage =
    policy.coverage === 0 || policy.coverages.some((c) => c.isMarketValue)

  // Check if deductible status is uncertain (flagged by extractor)
  const analyzedPolicyDed = policy as import('@/types/policy').AnalyzedPolicy
  const isDeductibleUncertain = analyzedPolicyDed.deductibleUncertain === true

  if (policy.deductible === 0) {
    if (isDeductibleUncertain) {
      // Deductible was not confidently extracted — do not claim "no deductible"
      return {
        category: 'Deductible',
        categoryTR: 'Muafiyet',
        score: -1, // Sentinel: insufficient data
        weight: config.weights.deductible,
        details:
          'Deductible status not confirmed — may have conditional or scenario-specific deductibles',
        detailsTR:
          'Muafiyet durumu doğrulanamadı — koşullu veya senaryoya özel muafiyetler olabilir',
        issues: ['Deductible information not confidently extracted'],
        issuesTR: ['Muafiyet bilgisi güvenilir şekilde çıkarılamadı'],
      }
    }
    // Explicitly confirmed zero deductible
    score = 95
    return {
      category: 'Deductible',
      categoryTR: 'Muafiyet',
      score,
      weight: config.weights.deductible,
      details: 'No unconditional deductible identified in policy wording',
      detailsTR: 'Poliçe metninde koşulsuz muafiyet tespit edilmedi',
      issues: [],
      issuesTR: [],
    }
  }

  // For market value policies, evaluate deductible as absolute amount
  if (hasMarketValueCoverage) {
    if (policy.deductible < 5000) {
      score = 90
    } else if (policy.deductible < 10000) {
      score = 80
    } else if (policy.deductible < 25000) {
      score = 65
      issues.push('Deductible is moderately high')
      issuesTR.push('Muafiyet orta düzeyde yüksek')
    } else if (policy.deductible < 50000) {
      score = 50
      issues.push('Deductible is high')
      issuesTR.push('Muafiyet yüksek')
    } else {
      score = 30
      issues.push('Deductible is very high')
      issuesTR.push('Muafiyet çok yüksek')
    }

    return {
      category: 'Deductible',
      categoryTR: 'Muafiyet',
      score,
      weight: config.weights.deductible,
      details: `Deductible of ${policy.deductible.toLocaleString('tr-TR')} TL`,
      detailsTR: `${policy.deductible.toLocaleString('tr-TR')} TL muafiyet`,
      issues,
      issuesTR,
    }
  }

  // Standard evaluation: Check deductible as percentage of coverage
  const deductibleRatio = policy.deductible / policy.coverage

  if (deductibleRatio < 0.01) {
    score = 90 // Less than 1%
  } else if (deductibleRatio < 0.02) {
    score = 80 // 1-2% is standard
  } else if (deductibleRatio < 0.05) {
    score = 65
    issues.push('Deductible is moderately high (2-5% of coverage)')
    issuesTR.push("Muafiyet orta düzeyde yüksek (teminatın %2-5'i)")
  } else if (deductibleRatio < 0.1) {
    score = 50
    issues.push('Deductible is high (5-10% of coverage)')
    issuesTR.push("Muafiyet yüksek (teminatın %5-10'u)")
  } else {
    score = 30
    issues.push('Deductible is very high (>10% of coverage)')
    issuesTR.push("Muafiyet çok yüksek (teminatın >%10'u)")
  }

  // Check individual coverage deductibles
  const highDeductibleCoverages = policy.coverages.filter(
    (c) => c.included && c.deductible > 0 && c.limit > 0 && c.deductible / c.limit > 0.1
  )

  if (highDeductibleCoverages.length > 0) {
    score -= highDeductibleCoverages.length * 5
    issues.push(`${highDeductibleCoverages.length} coverage(s) have high deductibles`)
    issuesTR.push(`${highDeductibleCoverages.length} teminatın muafiyeti yüksek`)
  }

  // DASK has mandatory 2% deductible
  if (policy.type === 'dask') {
    const expectedDeductible = policy.coverage * 0.02
    if (Math.abs(policy.deductible - expectedDeductible) < 1000) {
      score = 80 // Standard DASK deductible
      issues.length = 0
      issuesTR.length = 0
    }
  }

  score = Math.max(0, Math.min(100, score))

  return {
    category: 'Deductible',
    categoryTR: 'Muafiyet',
    score,
    weight: config.weights.deductible,
    details: `Deductible of ${policy.deductible.toLocaleString('tr-TR')} TL (${(deductibleRatio * 100).toFixed(1)}% of coverage)`,
    detailsTR: `${policy.deductible.toLocaleString('tr-TR')} TL muafiyet (teminatın %${(deductibleRatio * 100).toFixed(1)}'i)`,
    issues,
    issuesTR,
  }
}

// =============================================================================
// COMPLIANCE EVALUATION
// =============================================================================

interface ComplianceResult extends ScoreBreakdown {
  complianceIssues: ComplianceIssue[]
}

function evaluateCompliance(policy: Policy, config: EvaluationConfig): ComplianceResult {
  const issues: ComplianceIssue[] = []
  const textIssues: string[] = []
  const textIssuesTR: string[] = []
  let score = 100

  // Check policy expiry
  const expiryDate = new Date(policy.expiryDate)
  const now = new Date()
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    score -= 40
    issues.push({
      type: 'expired',
      severity: 'critical',
      description: 'Policy has expired',
      descriptionTR: 'Poliçe süresi dolmuş',
    })
    textIssues.push('Policy has expired')
    textIssuesTR.push('Poliçe süresi dolmuş')
  } else if (daysUntilExpiry < 30) {
    score -= 10
    issues.push({
      type: 'expired',
      severity: 'high',
      description: 'Policy expires within 30 days',
      descriptionTR: 'Poliçe 30 gün içinde sona eriyor',
    })
    textIssues.push('Policy expires soon')
    textIssuesTR.push('Poliçe yakında sona eriyor')
  }

  // Check minimum limits for traffic insurance
  if (policy.type === 'traffic') {
    const limits = getCurrentTrafficLimits()
    const autoLimit = limits.limits.find(
      (l) => l.vehicleType === 'automobile' && l.coverageType === 'bodily_injury_per_person'
    )

    if (autoLimit && policy.coverage < (autoLimit.perPerson || 0)) {
      score -= 30
      issues.push({
        type: 'below_minimum',
        severity: 'critical',
        description: 'Coverage below SEDDK minimum limits',
        descriptionTR: 'Teminat SEDDK asgari limitlerinin altında',
        regulation: 'ZMMS Tarife ve Talimat',
        requiredValue: autoLimit.perPerson,
        actualValue: policy.coverage,
      })
      textIssues.push('Below minimum SEDDK limits')
      textIssuesTR.push('SEDDK asgari limitlerinin altında')
    }
  }

  // Check DASK compliance
  if (policy.type === 'dask') {
    const daskLimits = getCurrentDaskLimits()
    const maxCoverage =
      daskLimits.limits.find((l) => l.coverageType === 'max_coverage')?.maxLimit ||
      DASK_PREMIUM_RATES_2026.maxCoverage

    if (policy.coverage > maxCoverage) {
      // Over-insured - unusual but not critical
      score -= 5
      issues.push({
        type: 'regulatory',
        severity: 'low',
        description: 'Coverage exceeds DASK maximum limit',
        descriptionTR: 'Teminat DASK azami limitini aşıyor',
        requiredValue: maxCoverage,
        actualValue: policy.coverage,
      })
    }

    // Check deductible is 2%
    const expectedDeductible = policy.coverage * 0.02
    if (
      policy.deductible > 0 &&
      Math.abs(policy.deductible - expectedDeductible) > expectedDeductible * 0.1
    ) {
      issues.push({
        type: 'regulatory',
        severity: 'medium',
        description: 'DASK deductible should be 2% of insured value',
        descriptionTR: "DASK muafiyeti sigorta bedelinin %2'si olmalıdır",
        requiredValue: expectedDeductible,
        actualValue: policy.deductible,
      })
    }
  }

  // Check for Conditional Deductibles
  const analyzedPolicy = policy as import('@/types/policy').AnalyzedPolicy
  const hasConditionalDeductibles =
    analyzedPolicy.conditionalDeductibles && analyzedPolicy.conditionalDeductibles.length > 0

  // Check for IMM Sublimits (Limited IMM) - Kasko typically
  const hasImmSublimits = policy.coverages.some(
    (c) =>
      c.included &&
      (c.name.toLowerCase().includes('mali mesuliyet') ||
        c.name.toLowerCase().includes('mali sorumluluk') ||
        c.name.toLowerCase().includes('imm')) &&
      !c.isUnlimited &&
      c.limit > 0 &&
      c.limit < 100000000 // Sublimit threshold
  )

  if (hasConditionalDeductibles || hasImmSublimits) {
    if (hasConditionalDeductibles) {
      score -= 15
      issues.push({
        type: 'regulatory',
        severity: 'high',
        description: 'Policy contains conditional deductibles requiring review',
        descriptionTR: 'Poliçe inceleme gerektiren koşullu muafiyetler içeriyor',
      })
      textIssues.push('Contains conditional deductibles')
      textIssuesTR.push('Koşullu muafiyet içeriyor')
    }

    if (hasImmSublimits) {
      score -= 10
      issues.push({
        type: 'regulatory',
        severity: 'medium',
        description: 'Policy contains IMM sublimits instead of unlimited coverage',
        descriptionTR: 'Poliçe sınırsız yerine İMM alt limitleri içeriyor',
      })
      textIssues.push('Contains IMM sublimits')
      textIssuesTR.push('İMM alt limitleri içeriyor')
    }
  }

  // Check for Sanctions clause
  const hasSanctions =
    policy.exclusions.some(
      (e) =>
        typeof e === 'string' &&
        (e.toLowerCase().includes('yaptırım') || e.toLowerCase().includes('sanction'))
    ) ||
    (policy as { specialConditions?: unknown[] }).specialConditions?.some(
      (c) =>
        typeof c === 'string' &&
        (c.toLowerCase().includes('yaptırım') || c.toLowerCase().includes('sanction'))
    )

  if (hasSanctions) {
    score -= 20
    issues.push({
      type: 'regulatory',
      severity: 'critical',
      description:
        'Policy contains international sanctions clause (Yaptırım Klozu) which may entirely void coverage',
      descriptionTR:
        'Poliçe, teminatı tamamen geçersiz kılabilecek uluslararası yaptırımlar klozu (Sanctions Clause) içeriyor',
    })
    textIssues.push('Contains sanctions clause')
    textIssuesTR.push('Yaptırım klozu içeriyor')
  }

  // Ensure minimum score
  score = Math.max(0, score)

  return {
    category: 'Compliance',
    categoryTR: 'Uyumluluk',
    score,
    weight: config.weights.compliance,
    details:
      issues.length === 0
        ? 'No compliance issue detected in extracted fields'
        : `${issues.length} compliance issue(s) found`,
    detailsTR:
      issues.length === 0
        ? 'Çıkarılan alanlarda uyumluluk sorunu tespit edilmedi'
        : `${issues.length} uyumluluk sorunu bulundu`,
    issues: textIssues,
    issuesTR: textIssuesTR,
    complianceIssues: issues,
  }
}

// =============================================================================
// VALUE EVALUATION
// =============================================================================

function evaluateValue(
  policy: Policy,
  premiumScore: number,
  coverageScore: number,
  config: EvaluationConfig
): ScoreBreakdown {
  const issues: string[] = []
  const issuesTR: string[] = []

  // Handle market value policies where coverage is 0
  const hasMarketValueCoverage =
    policy.coverage === 0 || policy.coverages.some((c) => c.isMarketValue)

  // If premium score is insufficient data (-1), value score is also insufficient
  if (premiumScore < 0) {
    return {
      category: 'Value',
      categoryTR: 'Değer',
      score: -1,
      weight: config.weights.value,
      details: 'Value assessment requires premium data — insufficient data',
      detailsTR: 'Değer değerlendirmesi prim bilgisi gerektirir — yeterli veri yok',
      issues: ['Cannot assess value without premium data'],
      issuesTR: ['Prim verisi olmadan değer değerlendirilemez'],
    }
  }

  // Calculate base value score
  let score = premiumScore * 0.4 + coverageScore * 0.6

  // For market value policies, evaluate based on coverage quality and features
  if (hasMarketValueCoverage) {
    // Check for value-added coverages
    const valueCoverages = [
      'roadside assistance',
      'yol yardım',
      'anadolu hizmet',
      'replacement vehicle',
      'ikame araç',
      'legal protection',
      'hukuki koruma',
      'mini onarım',
      'cam',
      'glass',
    ]
    const valueAddedCount = policy.coverages.filter(
      (c) => c.included && valueCoverages.some((vc) => c.name.toLowerCase().includes(vc))
    ).length

    if (valueAddedCount >= 3) {
      score += 15 // Excellent value-added features
    } else if (valueAddedCount >= 2) {
      score += 10
    } else if (valueAddedCount >= 1) {
      score += 5
    }

    // Check number of exclusions
    if (policy.exclusions.length > 10) {
      score -= 10
      issues.push('High number of exclusions reduces coverage value')
      issuesTR.push('Yüksek istisna sayısı teminat değerini düşürür')
    }

    score = Math.max(0, Math.min(100, score))

    return {
      category: 'Value',
      categoryTR: 'Değer',
      score,
      weight: config.weights.value,
      details: `Market value coverage with ${valueAddedCount} value-added features`,
      detailsTR: `Rayiç değer teminatı, ${valueAddedCount} katma değerli özellik ile`,
      issues,
      issuesTR,
    }
  }

  // Standard evaluation: Value is a combination of coverage quality vs premium paid
  const coverageToPremiumRatio = policy.coverage / policy.premium

  // Adjust for coverage to premium ratio
  if (coverageToPremiumRatio > 50) {
    score += 15 // Excellent value
  } else if (coverageToPremiumRatio > 30) {
    score += 10
  } else if (coverageToPremiumRatio > 20) {
    score += 5
  } else if (coverageToPremiumRatio < 10) {
    score -= 10
    issues.push('Low coverage-to-premium ratio indicates poor value')
    issuesTR.push('Düşük teminat/prim oranı zayıf değer göstergesi')
  }

  // Check for value-added coverages
  const valueCoverages = [
    'roadside assistance',
    'yol yardım',
    'replacement vehicle',
    'ikame araç',
    'legal protection',
    'hukuki koruma',
  ]
  const hasValueAdded = policy.coverages.some(
    (c) => c.included && valueCoverages.some((vc) => c.name.toLowerCase().includes(vc))
  )

  if (hasValueAdded) {
    score += 5
  }

  // Check number of exclusions
  if (policy.exclusions.length > 10) {
    score -= 10
    issues.push('High number of exclusions reduces coverage value')
    issuesTR.push('Yüksek istisna sayısı teminat değerini düşürür')
  }

  score = Math.max(0, Math.min(100, score))

  return {
    category: 'Value',
    categoryTR: 'Değer',
    score,
    weight: config.weights.value,
    details: `Coverage-to-premium ratio: ${coverageToPremiumRatio.toFixed(1)}x`,
    detailsTR: `Teminat/prim oranı: ${coverageToPremiumRatio.toFixed(1)}x`,
    issues,
    issuesTR,
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function calculateOverallScore(
  scores: Record<string, number>,
  weights: Record<string, number>
): number {
  let totalWeight = 0
  let weightedSum = 0

  for (const [category, score] of Object.entries(scores)) {
    const weight = weights[category] || 0
    // Skip categories with -1 sentinel (insufficient data) — do not include in score
    if (score < 0) continue
    weightedSum += score * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}

function generateMarketComparison(
  policy: Policy,
  _branchStats: ReturnType<typeof getBranchStatistics>
): PolicyEvaluation['marketComparison'] {
  const insuranceType = POLICY_TYPE_TO_INSURANCE_TYPE[policy.type]
  const benchmark = getPremiumBenchmarkWithFallback(insuranceType)

  let premiumPercentile = 50
  let coveragePercentile = 50

  if (!benchmark || benchmark.benchmarkStatus === 'untrusted') {
    return {
      premiumPercentile: 50,
      coveragePercentile: 50,
      isAboveAverageValue: false,
      competitivePosition: 'average', // Neutral
      // Additional flag to indicate this is an untrusted/missing comparison
      untrusted: true,
    } as unknown as PolicyEvaluation['marketComparison'] // The UI might need to know to suppress numeric info. We will handle this in UI side.
  }

  if (benchmark) {
    // Check if value-based comparison is appropriate
    if (isValueBasedBenchmark(benchmark) && policy.coverage > 0) {
      // For value-based benchmarks (like kasko), compare rate instead of absolute premium
      const actualRate = policy.premium / policy.coverage
      const rateRange = (benchmark.valueMaxRate || 0) - (benchmark.valueMinRate || 0)

      if (rateRange > 0 && benchmark.valueMinRate) {
        premiumPercentile = Math.max(
          0,
          Math.min(100, 100 - ((actualRate - benchmark.valueMinRate) / rateRange) * 100)
        )
      }

      // Coverage percentile is less meaningful for value-based, use 70 as neutral
      coveragePercentile = 70
    } else {
      // Direct premium comparison
      const premiumRange = benchmark.maxPremium - benchmark.minPremium
      if (premiumRange > 0) {
        premiumPercentile = Math.max(
          0,
          Math.min(100, 100 - ((policy.premium - benchmark.minPremium) / premiumRange) * 100)
        )
      }

      // Estimate coverage percentile based on premium
      const expectedCoverage = policy.premium * 20 // Rough estimate
      coveragePercentile =
        policy.coverage > 0 ? Math.min(100, (policy.coverage / expectedCoverage) * 50) : 50
    }
  }

  const avgPercentile = (premiumPercentile + coveragePercentile) / 2

  let competitivePosition: PolicyEvaluation['marketComparison']['competitivePosition']
  if (avgPercentile >= 80) competitivePosition = 'leader'
  else if (avgPercentile >= 60) competitivePosition = 'competitive'
  else if (avgPercentile >= 40) competitivePosition = 'average'
  else if (avgPercentile >= 20) competitivePosition = 'below_average'
  else competitivePosition = 'lagging'

  return {
    premiumPercentile,
    coveragePercentile,
    isAboveAverageValue: avgPercentile > 50,
    competitivePosition,
  }
}

function generateRecommendations(
  policy: Policy,
  scores: Record<string, ScoreBreakdown>,
  complianceIssues: ComplianceIssue[]
): Recommendation[] {
  const recommendations: Recommendation[] = []

  // Critical compliance issues first - with specific details
  for (const issue of complianceIssues.filter((i) => i.severity === 'critical')) {
    let specificTitle = 'Address Compliance Issue'
    let specificTitleTR = 'Uyumluluk Sorununu Giderin'

    if (issue.type === 'expired') {
      // Distinguish recently-expired from historically-expired policies
      const expiryDate = new Date(policy.expiryDate)
      const now = new Date()
      const yearsExpired = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)

      if (yearsExpired > 2) {
        specificTitle = 'Historical Policy — For Reference Only'
        specificTitleTR = 'Tarihsel Poliçe — Yalnızca Referans Amaçlı'
        issue.description = `Policy expired ${Math.floor(yearsExpired)} years ago. This analysis is for archival/reference purposes only.`
        issue.descriptionTR = `Poliçe ${Math.floor(yearsExpired)} yıl önce sona ermiş. Bu analiz yalnızca arşiv/referans amacıyla yapılmıştır.`
      } else {
        specificTitle = 'Renew Expired Policy Immediately'
        specificTitleTR = 'Süresi Dolan Poliçeyi Hemen Yenileyin'
      }
    } else if (issue.type === 'below_minimum') {
      specificTitle = 'Increase Coverage to Meet Legal Minimums'
      specificTitleTR = 'Yasal Asgari Limitleri Karşılamak İçin Teminatı Artırın'
    }

    recommendations.push({
      priority: 'critical',
      type: 'compliance',
      title: specificTitle,
      titleTR: specificTitleTR,
      description: issue.description,
      descriptionTR: issue.descriptionTR,
    })
  }

  // Coverage improvements - with specific missing coverages
  if (scores.coverage.score < 70) {
    const missingIssues = scores.coverage.issues.filter(
      (i) => i.includes('Missing') || i.includes('essential')
    )
    const missingCoverages =
      missingIssues.length > 0
        ? missingIssues.map((i) => i.replace('Missing essential coverage: ', '')).join(', ')
        : null

    const specificDescription = missingCoverages
      ? `Add missing coverages: ${missingCoverages}. These are standard in most ${policy.type} policies.`
      : 'Your policy has fewer coverages than typical market offerings. Request quotes with additional protections.'

    const specificDescriptionTR = missingCoverages
      ? `Eksik teminatları ekleyin: ${scores.coverage.issuesTR
          .filter((i) => i.includes('Eksik'))
          .map((i) => i.replace('Eksik temel teminat: ', ''))
          .join(', ')}. Bunlar çoğu ${policy.typeTr} poliçesinde standart olarak bulunur.`
      : 'Poliçenizde piyasa ortalamasından daha az teminat var. Ek korumalar içeren teklifler isteyin.'

    recommendations.push({
      priority: 'high',
      type: 'add_coverage',
      title: missingCoverages
        ? `Add Missing: ${missingCoverages.substring(0, 30)}${missingCoverages.length > 30 ? '...' : ''}`
        : 'Expand Coverage Portfolio',
      titleTR: missingCoverages
        ? `Eksik Ekleyin: ${scores.coverage.issuesTR
            .filter((i) => i.includes('Eksik'))
            .map((i) => i.replace('Eksik temel teminat: ', ''))
            .join(', ')
            .substring(0, 30)}`
        : 'Teminat Portföyünü Genişletin',
      description: specificDescription,
      descriptionTR: specificDescriptionTR,
      estimatedImpact: {
        coverageChange: 20,
        premiumChange: 15,
      },
    })
  }

  // Deductible optimization - only if deductible is actually high (not 0)
  // Note: When deductible is 0, the score should be 95 (handled in evaluateDeductible)
  if (scores.deductible.score < 60 && policy.deductible > 0) {
    const deductibleAmount = policy.deductible.toLocaleString('tr-TR')
    // Handle market value policies where coverage is 0
    const hasMarketValueCoverage =
      policy.coverage === 0 || policy.coverages.some((c) => c.isMarketValue)
    const deductibleDesc = hasMarketValueCoverage
      ? `Your deductible of ₺${deductibleAmount} is high. In a claim, you'd pay this amount out-of-pocket. Ask your agent about reducing it.`
      : `Your deductible of ₺${deductibleAmount} (${((policy.deductible / policy.coverage) * 100).toFixed(1)}% of coverage) is high. In a claim, you'd pay this amount out-of-pocket. Ask your agent about reducing it by 50%.`
    const deductibleDescTR = hasMarketValueCoverage
      ? `₺${deductibleAmount} muafiyetiniz yüksek. Bir hasarda bu tutarı cebinizden ödemeniz gerekir. Temsilcinizden azaltma konusunda bilgi alın.`
      : `₺${deductibleAmount} muafiyetiniz (teminatın %${((policy.deductible / policy.coverage) * 100).toFixed(1)}'i) yüksek. Bir hasarda bu tutarı cebinizden ödemeniz gerekir. Temsilcinizden %50 azaltma konusunda bilgi alın.`

    recommendations.push({
      priority: 'medium',
      type: 'reduce_deductible',
      title: `Negotiate Lower Deductible (Currently ₺${deductibleAmount})`,
      titleTR: `Daha Düşük Muafiyet Pazarlığı Yapın (Mevcut: ₺${deductibleAmount})`,
      description: deductibleDesc,
      descriptionTR: deductibleDescTR,
      estimatedImpact: {
        premiumChange: 10,
        riskReduction: 25,
      },
    })
  }

  // Premium optimization - only show if there are actual issues identified
  // Don't show generic "Compare Alternative Quotes" for well-covered policies
  const hasPremiumIssues = scores.premium.issues.length > 0
  const isComprehensivePolicy = scores.coverage.score >= 80 || policy.coverages.length >= 8

  if (scores.premium.score < 60 && hasPremiumIssues && !isComprehensivePolicy) {
    const premiumAmount = policy.premium.toLocaleString('tr-TR')

    recommendations.push({
      priority: 'medium',
      type: 'review_premium',
      title: 'Review Premium at Renewal',
      titleTR: 'Yenileme Zamanı Primi Gözden Geçirin',
      description: `Your premium of ₺${premiumAmount} may be above market average. At renewal time, get 2-3 competitive quotes to compare.`,
      descriptionTR: `₺${premiumAmount} priminiz piyasa ortalamasının üzerinde olabilir. Yenileme zamanında karşılaştırma için 2-3 rekabetçi teklif alın.`,
    })
  }

  // Value optimization - specific suggestions
  // Skip for market value policies where coverage is 0 (ratio would be 0/premium = 0)
  const hasMarketValuePolicyValue =
    policy.coverage === 0 || policy.coverages.some((c) => c.isMarketValue)
  if (scores.value.score < 60 && !hasMarketValuePolicyValue) {
    const coverageToPremium = (policy.coverage / policy.premium).toFixed(1)

    recommendations.push({
      priority: 'low',
      type: 'optimize',
      title: 'Improve Coverage-to-Premium Ratio',
      titleTR: 'Teminat/Prim Oranını İyileştirin',
      description: `Your ratio of ${coverageToPremium}x coverage per TL premium is below optimal. Consider: (1) Bundling policies for discounts, (2) Increasing deductibles slightly to lower premium, (3) Removing rarely-used coverages.`,
      descriptionTR: `TL prim başına ${coverageToPremium}x teminat oranınız optimal seviyenin altında. Şunları değerlendirin: (1) İndirim için poliçeleri birleştirme, (2) Primi düşürmek için muafiyeti biraz artırma, (3) Nadiren kullanılan teminatları kaldırma.`,
    })
  }

  // Add positive recommendation if policy is good
  if (recommendations.length === 0 && scores.coverage.score >= 70 && scores.premium.score >= 70) {
    recommendations.push({
      priority: 'low',
      type: 'optimize',
      title: 'Policy Well-Structured',
      titleTR: 'Poliçe İyi Yapılandırılmış',
      description:
        'Your policy offers good value. Consider reviewing annually before renewal to ensure continued competitiveness.',
      descriptionTR:
        'Poliçeniz iyi değer sunuyor. Rekabetçiliğin devam etmesini sağlamak için yenileme öncesi yıllık incelemeyi düşünün.',
    })
  }

  return recommendations
}

function generateSummary(
  scores: Record<string, ScoreBreakdown>,
  recommendations: Recommendation[]
): PolicyEvaluation['summary'] {
  const strengths: string[] = []
  const strengthsTR: string[] = []
  const weaknesses: string[] = []
  const weaknessesTR: string[] = []

  for (const [, scoreData] of Object.entries(scores)) {
    if (scoreData.score >= 80) {
      strengths.push(`Strong ${scoreData.category.toLowerCase()}`)
      strengthsTR.push(`Güçlü ${scoreData.categoryTR.toLowerCase()}`)
    } else if (scoreData.score < 60) {
      weaknesses.push(`Weak ${scoreData.category.toLowerCase()}`)
      weaknessesTR.push(`Zayıf ${scoreData.categoryTR.toLowerCase()}`)
    }
  }

  const immediateActions = recommendations
    .filter((r) => r.priority === 'critical' || r.priority === 'high')
    .map((r) => r.title)

  const immediateActionsTR = recommendations
    .filter((r) => r.priority === 'critical' || r.priority === 'high')
    .map((r) => r.titleTR)

  return {
    strengths,
    strengthsTR,
    weaknesses,
    weaknessesTR,
    immediateActions,
    immediateActionsTR,
  }
}

// =============================================================================
// SCENARIO CARDS GENERATION
// =============================================================================

function generateScenarioCards(
  policy: Policy,

  _complianceResult: ComplianceResult
): import('./types').ScenarioCard[] {
  const cards: import('./types').ScenarioCard[] = []

  // 1. IMM (Limits of liability) Scenario for vehicles
  // Match against both English and Turkish coverage names. The AI may return
  // the coverage as "Excess Liability", "Voluntary Liability Coverage",
  // "İhtiyari Mali Mesuliyet", "İMM", etc. — check all common variants on
  // BOTH name and nameTr to avoid scenario engine vs coverage extractor drift.
  const IMM_NAME_PATTERNS = [
    'mali mesuliyet',
    'i̇mm',
    ' imm',
    'imm ',
    'i̇htiyari',
    'ihtiyari',
    'voluntary liability',
    'excess liability',
    'third.party liability',
    'üçüncü şahıs',
    'ucuncu sahis',
  ]
  const matchesIMM = (text: string | undefined | null): boolean => {
    if (!text) return false
    const lower = text.toLowerCase()
    return IMM_NAME_PATTERNS.some((pat) => lower.includes(pat))
  }
  const immCoverage = policy.coverages.find(
    (c) => (matchesIMM(c.name) || matchesIMM(c.nameTr)) && c.included
  )

  if (immCoverage) {
    if (immCoverage.isUnlimited) {
      cards.push({
        id: 'imm-scenario',
        title: 'At-Fault Major Accident',
        titleTR: 'Kusurlu Büyük Kazada',
        description:
          'If you cause an accident involving multiple luxury vehicles, your policy covers all third-party damages without limit, protecting you from major unexpected costs.',
        descriptionTR:
          'Birden fazla lüks aracın karıştığı bir kazaya sebep olursanız, poliçeniz sınırlar olmadan tüm üçüncü taraf hasarlarını karşılar ve sizi beklenmedik büyük masraflardan korur.',
        financialStatus: 'covered',
        insurerPays: 'Unlimited',
        insurerPaysTR: 'Sınırsız',
        userPays: '0 TL',
        userPaysTR: '0 TL',
        trigger: 'Causing a major accident with third-party claims exceeding mandatory limits.',
        triggerTR:
          'Zorunlu limitleri aşan üçüncü şahıs hasarlarına yol açan büyük bir kazada kusurlu olma.',
        whyItMatters: 'IMM protects you from lawsuits when your compulsory insurance runs out.',
        whyItMattersTR:
          'İMM, zorunlu trafik sigortası limitiniz tükendiğinde sizi davalardan korur.',
      })
    } else {
      cards.push({
        id: 'imm-scenario',
        title: 'At-Fault Major Accident',
        titleTR: 'Kusurlu Büyük Kazada',
        description: `Your policy caps liability at ${immCoverage.limit.toLocaleString('tr-TR')} TL. Damages exceeding this limit must be paid out-of-pocket, creating significant financial exposure.`,
        descriptionTR: `Poliçeniz mali sorumluluğu ${immCoverage.limit.toLocaleString('tr-TR')} TL ile sınırlar. Bu limiti aşan hasarlar trafik sigortası olsa bile cebinizden ödenmelidir, bu da yüksek mali yükümlülük yaratabilir.`,
        financialStatus: 'risk',
        riskAmount: `Over ${immCoverage.limit.toLocaleString('tr-TR')} TL`,
        riskAmountTR: `${immCoverage.limit.toLocaleString('tr-TR')} TL Üzeri`,
        insurerPays: `Up to ${immCoverage.limit.toLocaleString('tr-TR')} TL`,
        insurerPaysTR: `Maksimum ${immCoverage.limit.toLocaleString('tr-TR')} TL`,
        userPays: 'unknown (out of pocket)',
        userPaysTR: 'bilinmiyor (cepten)',
        trigger: 'Third-party damages exceeding the policy IMM limits.',
        triggerTR: 'Poliçe İMM limitlerini aşan üçüncü taraf hasarları.',
        whyItMatters:
          'Without unlimited coverage, your personal assets are at risk in catastrophic accidents.',
        whyItMattersTR:
          'Sınırsız teminat olmadan, feci kazalarda kişisel varlıklarınız risk altındadır.',
      })
    }
  } else if (policy.type === 'kasko' || policy.type === 'traffic') {
    cards.push({
      id: 'imm-scenario',
      title: 'At-Fault Major Accident',
      titleTR: 'Kusurlu Büyük Kazada',
      description:
        'Your policy lacks Voluntary Liability Coverage (IMM). You are entirely responsible for damages exceeding the state minimum limit, exposing you to significant out-of-pocket costs.',
      descriptionTR:
        'Poliçenizde İhtiyari Mali Mesuliyet (İMM) teminatı yok. Devletin zorunlu limitini aşan tüm hasarlardan bizzat sorumlusunuz, bu da sizi ciddi masraflara açık hale getirir.',
      financialStatus: 'risk',
      insurerPays: '0 TL',
      insurerPaysTR: '0 TL',
      userPays: 'unknown (out of pocket)',
      userPaysTR: 'bilinmiyor (cepten)',
      trigger: 'Third-party claim beyond statutory traffic insurance bounds.',
      triggerTR: 'Zorunlu trafik sigortası sınırlarını aşan üçüncü taraf talepleri.',
      whyItMatters:
        'You are completely exposed to third-party lawsuits and substantial financial liability.',
      whyItMattersTR: 'Üçüncü şahıs davalarına ve yüksek mali yükümlülüklere tamamen açıksınız.',
    })
  }

  // 2. Network Repair Scenario (Kasko specific)
  const hasNetworkRestriction = policy.exclusions.some(
    (e) =>
      typeof e === 'string' &&
      e.toLowerCase().includes('servis') &&
      (e.toLowerCase().includes('anlaşmalı') || e.toLowerCase().includes('yetkili'))
  )

  if (policy.type === 'kasko') {
    if (hasNetworkRestriction) {
      cards.push({
        id: 'repair-scenario',
        title: 'Repair at Unauthorized Service',
        titleTR: 'Yetkisiz Kurumda Onarım',
        description:
          "You are restricted to the insurer's contracted repair network. Taking your vehicle to your preferred unauthorized shop may result in high out-of-pocket costs up to 50% or denial.",
        descriptionTR:
          'Sigorta şirketinin anlaşmalı servis ağına tabisiniz. Aracınızı kendi tercih ettiğiniz yetkisiz servise götürmek, faturanın yarısının ödenmemesine veya hasarın reddine yol açabilir.',
        financialStatus: 'partially_covered',
        insurerPays: 'unknown (often 50% max)',
        insurerPaysTR: 'bilinmiyor (genellikle maks %50)',
        userPays: 'unknown (often 50% + difference)',
        userPaysTR: 'bilinmiyor (genellikle %50 + fark)',
        trigger: 'Vehicle repaired at a non-contracted/unauthorized mechanic.',
        triggerTR: 'Aracın anlaşmalı olmayan/yetkisiz bir serviste onarılması.',
        whyItMatters: 'Forces you to use specific repair shops, removing your freedom of choice.',
        whyItMattersTR: 'Sizi belirli servislere zorlar, seçim özgürlüğünüzü ortadan kaldırır.',
      })
    } else {
      cards.push({
        id: 'repair-scenario',
        title: 'Repair at Your Choice of Shop',
        titleTR: 'Kendi Seçtiğiniz Serviste Onarım',
        description:
          'Your policy allows repairs at any authorized or preferred shop without heavy network penalties.',
        descriptionTR:
          'Poliçeniz, ağır ağ kısıtlaması kesintileri olmadan, istediğiniz yetkili veya özel serviste onarıma izin verir.',
        financialStatus: 'covered',
        insurerPays: 'Full invoice amount (subject to usual deductibles)',
        insurerPaysTR: 'Tam fatura tutarı (olağan muafiyetlere tabi)',
        userPays: 'Only your fixed deductible',
        userPaysTR: 'Sadece sabit muafiyetiniz',
        trigger: 'Vehicle repaired at any mechanic after covered damage.',
        triggerTR: 'Teminat kapsamındaki hasar sonrası aracın herhangi bir serviste onarılması.',
        whyItMatters: 'You can take your car to the mechanic you trust.',
        whyItMattersTR: 'Aracınızı güvendiğiniz tamirciye götürebilirsiniz.',
      })
    }
  }

  // 3. Total Loss Scenario
  const newValueClause = policy.coverages.find(
    (c) => c.name.toLowerCase().includes('yeni değer') && c.included
  )
  if (policy.type === 'kasko') {
    cards.push({
      id: 'total-loss-scenario',
      title: 'Total Loss Vehicle Replacement',
      titleTR: 'Tam Hasar (Pert) Durumu',
      description: newValueClause
        ? 'In a total loss, your policy promises a payout referencing the new vehicle replacement value, shielding you from normal depreciation.'
        : 'In a total loss, the payout will be strictly constrained to the current market value (Rayiç Bedel) minus any conditionally applied deductibles.',
      descriptionTR: newValueClause
        ? 'Poliçenizde "Yenileme Bedeli" klozu mevcuttur. Pert durumunda poliçeniz normal değer kaybından korur.'
        : 'Poliçeniz standart pert ödemesi içerir. Güncel rayiç bedel üzerinden, poliçedeki koşullu muafiyet kesintileri düşülerek ödeme yapılır.',
      financialStatus: newValueClause ? 'covered' : 'partially_covered',
      insurerPays: newValueClause ? 'New vehicle replacement cost' : 'Current Market Value (Rayiç)',
      insurerPaysTR: newValueClause ? 'Yeni araç ikame bedeli' : 'Güncel Piyasa Değeri (Rayiç)',
      userPays: newValueClause ? '0 TL' : 'Depreciation difference',
      userPaysTR: newValueClause ? '0 TL' : 'Değer kaybı farkı',
      trigger: 'Vehicle is deemed a total loss (pert).',
      triggerTR: 'Aracın tam hasarlı (pert) sayılması.',
      whyItMatters: newValueClause
        ? 'Protects against depreciation.'
        : 'You may not receive enough to buy the same car again.',
      whyItMattersTR: newValueClause
        ? 'Değer kaybına karşı korur.'
        : 'Aynı aracı tekrar alabilmek için yeterli ödeme almayabilirsiniz.',
    })
  }

  // Fallback for non-auto
  if (cards.length === 0) {
    cards.push({
      id: 'general-deductible',
      title: 'General Claim Incident',
      titleTR: 'Genel Hasar Durumu',
      description:
        policy.deductible > 0
          ? `You will pay the first ${policy.deductible.toLocaleString('tr-TR')} TL out of pocket for any claimed loss.`
          : 'You have no fixed deductible. The insurer will cover verified claims directly, subject to limits.',
      descriptionTR:
        policy.deductible > 0
          ? `Herhangi bir hasar talebinde ilk ${policy.deductible.toLocaleString('tr-TR')} TL'yi cepten ödeyeceksiniz.`
          : 'Sabit bir muafiyetiniz yok. Sigortacı onaylanan hasarları doğrudan teminat limitleri dahilinde öder.',
      financialStatus: policy.deductible > 0 ? 'partially_covered' : 'covered',
      riskAmount:
        policy.deductible > 0 ? `Up to ${policy.deductible.toLocaleString('tr-TR')} TL` : undefined,
      riskAmountTR:
        policy.deductible > 0
          ? `${policy.deductible.toLocaleString('tr-TR')} TL'ye kadar`
          : undefined,
      insurerPays: policy.deductible > 0 ? 'Claim minus deductible' : 'Full verified claim',
      insurerPaysTR: policy.deductible > 0 ? 'Hasar eksi muafiyet' : 'Doğrulanmış hasarın tamamı',
      userPays: policy.deductible > 0 ? `${policy.deductible.toLocaleString('tr-TR')} TL` : '0 TL',
      userPaysTR:
        policy.deductible > 0 ? `${policy.deductible.toLocaleString('tr-TR')} TL` : '0 TL',
      trigger: 'Any eligible claim occurs.',
      triggerTR: 'Uygun bir hasar talebinin oluşması.',
      whyItMatters: 'Shows your guaranteed out-of-pocket minimum for any claim.',
      whyItMattersTR: 'Herhangi bir hasarda kesin cebinizden çıkacak minimum tutarı gösterir.',
    })
  }

  return cards
}
