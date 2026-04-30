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

import { KASKO_COMMERCIAL_BENCHMARKS } from '@/data/market-data/benchmarks'
import { inferIndustryFromInsuredName } from '../ai/turkish-utils'
import { evaluateSimpleDisplayMode } from '../analysis/kasko-pilot-gate'

/**
 * Maximum displayed AI confidence when the extraction completeness gate fires.
 *
 * Raw LLM-returned confidence can be 0.95+ even when headline vehicle fields
 * are missing. Without a cap, the UI ends up rendering e.g. "98% confident"
 * next to an "Incomplete extraction" banner — the contradiction the April 24
 * human review flagged as the worst kind of calibration bug ("confidently
 * wrong about confidence").
 *
 * 0.65 is below any green/confident threshold in the UI (which starts at 0.75)
 * and always renders as amber — keeping this file as the single source of truth
 * for the cap value. The same constant is mirrored in
 * `scripts/qa-extraction-quality.ts:INCOMPLETE_CONFIDENCE_CAP`; keep them
 * in sync.
 */
export const INCOMPLETE_CONFIDENCE_CAP = 0.65

/**
 * Safely format a numeric value as Turkish Lira string.
 * Returns '0' for undefined, null, or NaN values instead of crashing.
 */
function formatTRY(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '0'
  return value.toLocaleString('tr-TR')
}

/**
 * Shared IMM (İhtiyari Mali Mesuliyet / Voluntary Liability) coverage
 * name patterns. Used by both the compliance evaluator (sublimit check)
 * and the scenario card generator so they never diverge.
 *
 * Matches against lowercased coverage name/nameTr. Covers:
 * - Turkish labels: Mali Mesuliyet, Mali Sorumluluk, İMM, İhtiyari, etc.
 * - English labels: Voluntary Liability, Excess Liability, Third-Party
 * - Sub-labels: Bedeni ve Maddi, Artan Mali
 */
const IMM_COVERAGE_PATTERNS: string[] = [
  'mali mesuliyet',
  'mali sorumluluk',
  'i\u0307mm', // İMM (with combining dot above)
  ' imm',
  'imm ',
  'i\u0307htiyari',
  'ihtiyari',
  'voluntary liability',
  'excess liability',
  'third.party liability',
  'üçüncü şahıs',
  'ucuncu sahis',
  'bedeni ve maddi',
  'artan mali',
]

/**
 * Test whether a coverage name matches any known IMM label pattern.
 */
function matchesIMMPattern(text: string | undefined | null): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return IMM_COVERAGE_PATTERNS.some((pat) => lower.includes(pat))
}

/**
 * Sprint 2 #7 — parse a conditional-deductible scenario string and bucket it
 * by deductible percentage. The strings are emitted by gotcha #93's
 * `NAMED_DEDUCTIBLE_SCENARIOS` table in the format "Scenario name: %N"
 * (e.g. "Anlaşmalı olmayan servis: %35", "Kullanım Şekli: %80"). Some legacy
 * entries may carry the percentage as a trailing token without a colon.
 *
 * Severity bucketing:
 *   ≥ 80%  → critical (Kullanım Şekli, undeclared LPG fire — practically
 *                       partial exclusions)
 *   30-79% → high     (Anlaşmalı olmayan servis %35, Pert Araç %35)
 *   ≤ 29% OR no %     → medium (İlk cam hasarı %20, lock-replacement caps,
 *                                non-percentage scenarios)
 */
function bucketConditionalDeductibleSeverity(scenario: string): {
  severity: ComplianceIssue['severity']
  percent: number | null
} {
  const m = scenario.match(/%\s*(\d{1,3})(?!\d)/)
  if (!m) return { severity: 'medium', percent: null }
  const percent = Math.min(100, Math.max(0, parseInt(m[1], 10)))
  if (percent >= 80) return { severity: 'critical', percent }
  if (percent >= 30) return { severity: 'high', percent }
  return { severity: 'medium', percent }
}

/**
 * Sprint 2 #7 — translate a Turkish conditional-deductible scenario string to
 * English for the `description` field. Tries known scenario stems
 * (servis, pert, kullanım, lpg, vale, sürücü yaşı, ehliyet, ilk cam) and
 * falls back to the original string when no known stem matches. Keep the
 * percentage in the output regardless.
 */
function translateConditionalDeductibleEN(scenario: string): string {
  const lower = scenario.toLowerCase()
  const pct = scenario.match(/%\s*\d{1,3}/)?.[0] ?? ''
  const tail = pct ? ` ${pct}` : ''
  if (lower.includes('anlaşmalı olmayan servis') || lower.includes('out-of-network'))
    return `Out-of-network repair deductible:${tail}`
  if (lower.includes('pert araç') || lower.includes('pert')) return `Pert Araç deductible:${tail}`
  if (lower.includes('kullanım şekli') || lower.includes('rideshare') || lower.includes('rent'))
    return `Misuse / commercial-use deductible (rideshare/rental/test drive):${tail}`
  if (lower.includes('lpg') || lower.includes('cng'))
    return `Undeclared LPG/CNG fire deductible:${tail}`
  if (lower.includes('vale')) return `Valet-handling theft deductible:${tail}`
  if (lower.includes('sürücü yaşı') || lower.includes('driver age'))
    return `Young-driver deductible:${tail}`
  if (lower.includes('ehliyet süresi') || lower.includes('license tenure'))
    return `Short-licensed driver deductible:${tail}`
  if (lower.includes('ilk cam') || lower.includes('first glass'))
    return `First glass-replacement deductible:${tail}`
  return scenario
}

/**
 * Location keywords that indicate the canonical Artan Mali Sorumluluk
 * Sınırsız carve-out: unlimited in theory, capped (typically 2.500.000 TL
 * per event) in specific high-exposure environments.
 */
const IMM_CARVEOUT_LOCATION_HINTS = [
  'havaliman',
  'liman',
  'akaryak',
  'rafineri',
  'benzin istasyon',
  'kimyasal',
  'mühimmat',
  'tren istasyon',
  'demiryolu',
]

/**
 * Inspect an IMM coverage's evidence fields (clause, quote, and any
 * carveOuts the LLM populated) for the 2.5M TL airport/port/fuel-depot
 * carve-out. Returns a short bilingual caveat string when found, else
 * null.
 */
function detectImmCarveOut(
  coverage: import('@/types/policy').Coverage
): { en: string; tr: string } | null {
  const carveOuts = (coverage as { carveOuts?: string[] | null }).carveOuts
  if (Array.isArray(carveOuts) && carveOuts.length > 0) {
    const first = carveOuts[0]
    return {
      en: `Carve-out: ${first}`,
      tr: `İstisna: ${first}`,
    }
  }

  const haystack =
    `${coverage.clause ?? ''} ${coverage.quote ?? ''} ${coverage.description ?? ''}`.toLowerCase()
  if (!haystack.trim()) return null

  const locationHit = IMM_CARVEOUT_LOCATION_HINTS.some((h) => haystack.includes(h))
  // The amount language is usually "2.500.000" or "2,5 milyon"; catch both.
  const amountHit = /2[.,\s]*500[.,\s]*000/.test(haystack) || /2[,.]?5\s*milyon/.test(haystack)

  if (locationHit && amountHit) {
    return {
      en: 'Capped at 2,500,000 TL per event at airports, ports, fuel depots, refineries, and similar high-exposure locations.',
      tr: 'Havalimanı, liman, akaryakıt depoları, rafineri ve benzeri yerlerde meydana gelen olaylarda olay başı 2.500.000 TL üst sınırı uygulanır.',
    }
  }
  if (locationHit) {
    return {
      en: 'A per-event sub-limit applies at airports, ports, fuel depots, refineries, and similar high-exposure locations — verify the exact cap in the policy.',
      tr: 'Havalimanı, liman, akaryakıt depoları ve benzeri yerlerde olay başı özel üst sınır uygulanabilir — tutar için poliçeye bakılmalı.',
    }
  }
  return null
}

/**
 * Check whether a coverage is included in the policy.
 *
 * Insurance documents list coverages that ARE included. The AI extraction
 * often omits the `included` flag (leaving it `undefined` or `null`) rather
 * than explicitly setting it to `true`. Only an explicit `false` means the
 * coverage is excluded. Treating undefined as excluded was the root cause
 * of 21 policies scoring a flat 60 (D-grade).
 */
function isIncluded(c: { included?: boolean }): boolean {
  return c.included !== false
}

/**
 * Compute an inferred total coverage from individual coverage limits.
 * Used as a fallback when `policy.coverage` is 0 or missing but the
 * AI extraction did populate per-coverage limits.
 */
function inferTotalCoverage(
  coverages: Array<{ limit?: number | null; included?: boolean }>
): number {
  return coverages
    .filter(isIncluded)
    .reduce((sum, c) => sum + (typeof c.limit === 'number' && isFinite(c.limit) ? c.limit : 0), 0)
}

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

/**
 * Detect commercial or niche vehicles (trucks, buses, construction equipment,
 * fleet) that fall outside the MARKET_BENCHMARKS private-kasko cohort.
 *
 * Matches Turkish vehicle class / usage strings. Case-insensitive and handles
 * Turkish İ via character class (gotcha #62).
 */
function isCommercialOrNicheVehicle(
  analyzedPolicy: import('@/types/policy').AnalyzedPolicy
): boolean {
  if (
    analyzedPolicy.vehicleUsage === 'commercial' ||
    analyzedPolicy.insuredEntityType === 'corporate'
  ) {
    return true
  }

  const signals = [analyzedPolicy.vehicleInfo?.vehicleClass, analyzedPolicy.vehicleInfo?.usage]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => s.toLowerCase())

  if (signals.length === 0) return false

  // Kamyon, Kamyonet, Tır, Otobüs, Minibüs, Midibüs, İş makinesi, Ticari, Filo
  const NICHE_PATTERNS: RegExp[] = [
    /\bkamyon(et)?\b/i,
    /\bt[iı]r\b/i,
    /\botob[uü]s\b/i,
    /\bmin[iı]b[uü]s\b/i,
    /\bmid[iı]b[uü]s\b/i,
    /\b[iı]ş\s*mak[iı]nes[iı]\b/i,
    /\btar[iı]m\s*mak[iı]nes[iı]\b/i,
    /\bt[iı]car[iı]\b/i, // "ticari" — commercial usage flag
    /\bf[iı]lo\b/i,
    /\bkrom\b|\bçek[iı]c[iı]\b/i, // tractor/tractor-trailer
  ]

  for (const signal of signals) {
    for (const pattern of NICHE_PATTERNS) {
      if (pattern.test(signal)) return true
    }
  }
  return false
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
      value: policy.coverage > 0 ? `${formatTRY(policy.coverage)} TL` : undefined,
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

  // Determine baseline confidence from context factors
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

  // Commercial / niche-vehicle downgrade
  if (isCommercialOrNicheVehicle(analyzedPolicy) && level !== 'suppressed') {
    if (level === 'high') {
      level = 'low'
    } else if (level === 'low') {
      level = 'suppressed'
      suppressionReason = 'Benchmark data excludes niche commercial vehicles and fleets'
      suppressionReasonTr = 'Karşılaştırma verileri ticari araçları ve filoları kapsamaz'
    }
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
  const analyzedPolicy = policy as import('@/types/policy').AnalyzedPolicy
  let subType: string | undefined
  if (isCommercialOrNicheVehicle(analyzedPolicy)) {
    subType = insuranceTypeForDate === 'zmss' ? 'commercial_vehicle' : 'commercial'
  }
  const benchmarkForDate = getPremiumBenchmarkWithFallback(insuranceTypeForDate, subType)

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
  const hasUntrustedBenchmark =
    !benchmarkForDate || benchmarkForDate?.benchmarkStatus === 'untrusted'

  // Critical compliance issues (e.g., expired policy) warrant a hard cap.
  if (hasCriticalComplianceIssues) {
    overallScore = Math.min(overallScore, 60)
  }

  // For untrusted benchmarks: the premium evaluator already returns neutral (70)
  // or sentinel (-1) scores, so the weighted average self-corrects. We mark the
  // evaluation as provisional instead of capping to 60, which was causing 21
  // policies with valid coverage/deductible/compliance data to score D-grade.
  // A softer cap of 85 prevents inflated A-grades without crushing good policies.
  if (hasUntrustedBenchmark && !hasCriticalComplianceIssues) {
    overallScore = Math.min(overallScore, 85)
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

  // Extraction completeness gate — blank vehicle fields or legacy placeholder
  // coverage rows downgrade the grade to provisional and surface the reason
  // via extractionGateTriggers. See evaluateSimpleDisplayMode() for the full
  // trigger list. This is the single chokepoint for "the extraction produced
  // output that isn't trustworthy enough to show a confident letter grade".
  const gateResult = evaluateSimpleDisplayMode(
    (policy as { aiConfidence?: number }).aiConfidence ?? 1,
    {
      policyNumber: policy.policyNumber,
      provider: policy.provider,
      coverages: policy.coverages as unknown[],
      vehicle: analyzedPolicy.vehicleInfo
        ? {
            make: analyzedPolicy.vehicleInfo.make,
            model: analyzedPolicy.vehicleInfo.model,
            year: analyzedPolicy.vehicleInfo.year,
          }
        : null,
      policyType: policy.type,
    }
  )
  const extractionCompletenessTriggers = gateResult.triggers.filter(
    (t) => t.startsWith('MISSING_VEHICLE_') || t === 'COVERAGE_PLACEHOLDER_DETECTED'
  )
  const extractionIncomplete = extractionCompletenessTriggers.length > 0

  // Displayed confidence is capped when the gate fires so the UI cannot show
  // a high confidence % next to the "Incomplete extraction" banner. The raw
  // value on AnalyzedPolicy.aiConfidence is preserved for audit/debug.
  const rawAiConfidence = (policy as { aiConfidence?: number }).aiConfidence
  let displayedAiConfidence = rawAiConfidence
  if (typeof displayedAiConfidence === 'number') {
    if (extractionIncomplete) {
      displayedAiConfidence = Math.min(displayedAiConfidence, INCOMPLETE_CONFIDENCE_CAP)
    }
    // Cap AI confidence for commercial/fleet policies at ~75% until the extractor handles fleet-specific fields
    if (isCommercialOrNicheVehicle(analyzedPolicy)) {
      displayedAiConfidence = Math.min(displayedAiConfidence, 0.75)
    }
  }

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
      benchmarkForDate.benchmarkStatus === 'untrusted' ||
      extractionIncomplete
    ),
    extractionIncomplete: extractionIncomplete || undefined,
    extractionGateTriggers:
      extractionCompletenessTriggers.length > 0 ? extractionCompletenessTriggers : undefined,
    displayedAiConfidence,
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
  const analyzedPolicy = policy as import('@/types/policy').AnalyzedPolicy
  const insuranceType = POLICY_TYPE_TO_INSURANCE_TYPE[policy.type]
  let subType: string | undefined
  if (isCommercialOrNicheVehicle(analyzedPolicy)) {
    subType = insuranceType === 'zmss' ? 'commercial_vehicle' : 'commercial'
  }
  let benchmark = getPremiumBenchmarkWithFallback(insuranceType, subType)

  if (policy.type === 'kasko' && isCommercialOrNicheVehicle(analyzedPolicy)) {
    benchmark = {
      insuranceType: 'kasko',
      vehicleClass: 'commercial',
      minPremium: KASKO_COMMERCIAL_BENCHMARKS.premiumRange.min,
      avgPremium: KASKO_COMMERCIAL_BENCHMARKS.premiumRange.average,
      maxPremium: KASKO_COMMERCIAL_BENCHMARKS.premiumRange.max,
      currency: 'TRY',
      year: parseInt(KASKO_COMMERCIAL_BENCHMARKS.dataDate.substring(0, 4), 10) || 2025,
      source: KASKO_COMMERCIAL_BENCHMARKS.source,
      comparisonMethod: 'direct_premium',
      benchmarkStatus: 'trusted',
      dataDate: KASKO_COMMERCIAL_BENCHMARKS.dataDate,
    }
  }
  const issues: string[] = []
  const issuesTR: string[] = []

  // Check if premium is missing (flagged by extractor or zero without explicit data)
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
      details: `Premium of ${formatTRY(policy.premium)} TL — comparison suppressed (missing: ${missingNames})`,
      detailsTR: `${formatTRY(policy.premium)} TL prim — karşılaştırma yapılamıyor (eksik: ${missingNamesTr})`,
      issues: ['Market comparison suppressed due to insufficient context data'],
      issuesTR: ['Yetersiz bağlam verisi nedeniyle piyasa karşılaştırması yapılamıyor'],
    }
  }

  let score = 70 // Default score
  let details = `Premium of ${formatTRY(policy.premium)} TL compared to market estimate`
  let detailsTR = `${formatTRY(policy.premium)} TL prim, piyasa tahmini ile karşılaştırıldı`

  if (benchmark?.benchmarkStatus === 'untrusted' || !benchmark) {
    return {
      category: 'Premium',
      categoryTR: 'Prim',
      score: 70, // Neutral — no comparison possible
      weight: config.weights.premium,
      details: `Premium of ${formatTRY(policy.premium)} TL — Market benchmark unavailable.`,
      detailsTR: `${formatTRY(policy.premium)} TL prim — Piyasa karşılaştırması kullanılamıyor.`,
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
    // Use inferred coverage when the extraction didn't set a top-level total
    const effectiveCoverage =
      policy.coverage > 0 ? policy.coverage : inferTotalCoverage(policy.coverages)
    const coveragePerPremium = policy.premium > 0 ? effectiveCoverage / policy.premium : 0
    if (coveragePerPremium > 20) {
      score += 15
    } else if (coveragePerPremium < 10 && policy.premium > 0) {
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
    details = `${coverageCount} coverages included with total coverage of ${formatTRY(policy.coverage)} TL`
    detailsTR = `${coverageCount} teminat dahil, toplam ${formatTRY(policy.coverage)} TL teminat`
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
  const coverageNames = policy.coverages.filter(isIncluded).map((c) => c.name.toLowerCase())

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

    // Bug #4 fix: Even if flat deductible is 0, check for conditional deductibles.
    // A policy with conditional deductibles (e.g., 20% on glass repairs outside
    // network) should NOT score 95 — cap at 80 and surface the conditionals.
    const conditionals = analyzedPolicyDed.conditionalDeductibles
    const hasConditionals = Array.isArray(conditionals) && conditionals.length > 0

    if (hasConditionals) {
      score = 80
      const condCount = conditionals.length
      issues.push(
        `No flat deductible, but ${condCount} conditional deductible${condCount > 1 ? 's' : ''} apply (e.g., network/glass/age penalties)`
      )
      issuesTR.push(
        `Sabit muafiyet yok, ancak ${condCount} koşullu muafiyet uygulanıyor (ör. servis ağı/cam/yaş cezaları)`
      )
      return {
        category: 'Deductible',
        categoryTR: 'Muafiyet',
        score,
        weight: config.weights.deductible,
        details: `No flat deductible, but ${condCount} conditional deductible${condCount > 1 ? 's' : ''} detected`,
        detailsTR: `Sabit muafiyet yok, ancak ${condCount} koşullu muafiyet tespit edildi`,
        issues,
        issuesTR,
      }
    }

    // Explicitly confirmed zero deductible with no conditionals
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
      details: `Deductible of ${formatTRY(policy.deductible)} TL`,
      detailsTR: `${formatTRY(policy.deductible)} TL muafiyet`,
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
    (c) => isIncluded(c) && c.deductible > 0 && c.limit > 0 && c.deductible / c.limit > 0.1
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
    details: `Deductible of ${formatTRY(policy.deductible)} TL (${(deductibleRatio * 100).toFixed(1)}% of coverage)`,
    detailsTR: `${formatTRY(policy.deductible)} TL muafiyet (teminatın %${(deductibleRatio * 100).toFixed(1)}'i)`,
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
    score -= 10
    issues.push({
      type: 'expired',
      severity: 'low',
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
  let hasConditionalDeductibles = !!(
    analyzedPolicy.conditionalDeductibles && analyzedPolicy.conditionalDeductibles.length > 0
  )

  // Avoid flagging standard network/glass deductibles as a critical risk on commercial policies
  if (hasConditionalDeductibles && isCommercialOrNicheVehicle(analyzedPolicy)) {
    const onlyMinorDeductibles = analyzedPolicy.conditionalDeductibles!.every((d) => {
      const lower = d.toLowerCase()
      return lower.includes('cam') || lower.includes('servis') || lower.includes('casu')
    })

    if (onlyMinorDeductibles) {
      hasConditionalDeductibles = false
    }
  }

  // Check for IMM Sublimits (Limited IMM) - Kasko typically
  // Uses the shared IMM_COVERAGE_PATTERNS constant to stay in sync with
  // scenario card generation (Bug #2 fix).
  const hasImmSublimits = policy.coverages.some(
    (c) =>
      isIncluded(c) &&
      (matchesIMMPattern(c.name) || matchesIMMPattern((c as { nameTr?: string }).nameTr)) &&
      !c.isUnlimited &&
      c.limit > 0 &&
      c.limit < 100000000 // Sublimit threshold
  )

  if (hasConditionalDeductibles || hasImmSublimits) {
    if (hasConditionalDeductibles) {
      score -= 15
      // Sprint 2 #7 — emit ONE Issue per named conditional deductible scenario
      // (was: a single generic "Policy contains conditional deductibles
      // requiring review" warning that the reviewer correctly flagged as
      // useless to users). The data is already classified by named scenario
      // per gotcha #93; we just surface each entry with severity bucketed by
      // the deductible percentage. Score deduction stays at a single -15 to
      // avoid compounding across many conditional rows.
      // Defensive — the field is typed `string[]` but legacy test fixtures
      // and older extractions occasionally put objects in here. Filter to
      // strings to keep .match() / .toLowerCase() from blowing up.
      const scenarios = (analyzedPolicy.conditionalDeductibles ?? []).filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0
      )
      for (const scenario of scenarios) {
        const { severity, percent } = bucketConditionalDeductibleSeverity(scenario)
        issues.push({
          type: 'regulatory',
          severity,
          description: translateConditionalDeductibleEN(scenario),
          descriptionTR: scenario,
        })
        const shortLabel = percent ? `${percent}% deductible` : 'Conditional deductible'
        textIssues.push(`${shortLabel}: ${scenario}`)
        textIssuesTR.push(scenario)
      }
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

  // Sprint 2 #7 — surface Coverage.carveOuts[] as individual Issues. These
  // are per-coverage caveats populated at extraction time (gotcha #94 — IMM
  // 2.5M TL airport/port/fuel-depot cap, etc.) that the previous generic
  // financial-risks panel never reached. Each carve-out becomes its own
  // medium-severity Issue so the user sees the specific exposure.
  for (const coverage of policy.coverages) {
    const carveOuts = (coverage as { carveOuts?: string[] | null }).carveOuts
    if (!Array.isArray(carveOuts) || carveOuts.length === 0) continue
    for (const carveOut of carveOuts) {
      if (typeof carveOut !== 'string' || !carveOut.trim()) continue
      issues.push({
        type: 'regulatory',
        severity: 'medium',
        description: `${coverage.name}: ${carveOut}`,
        descriptionTR: `${coverage.nameTr || coverage.name}: ${carveOut}`,
      })
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

  // Check for non-OEM parts clause
  const hasNonOemParts =
    (policy as import('@/types/policy').AnalyzedPolicy).aiInsights?.some(
      (i: string) =>
        i.toLowerCase().includes('yan sanayi') ||
        i.toLowerCase().includes('eşdeğer parça') ||
        i.toLowerCase().includes('orijinal olmayan') ||
        i.toLowerCase().includes('çıkma parça') ||
        i.toLowerCase().includes('logolu olmayan')
    ) ||
    (policy as import('@/types/policy').AnalyzedPolicy).aiInsightsEn?.some(
      (i: string) => i.toLowerCase().includes('non-oem') || i.toLowerCase().includes('aftermarket')
    ) ||
    (policy as { specialConditions?: unknown[] }).specialConditions?.some(
      (c) =>
        typeof c === 'string' &&
        (c.toLowerCase().includes('yan sanayi') ||
          c.toLowerCase().includes('eşdeğer parça') ||
          c.toLowerCase().includes('orijinal olmayan') ||
          c.toLowerCase().includes('çıkma parça') ||
          c.toLowerCase().includes('logolu olmayan') ||
          c.toLowerCase().includes('non-oem') ||
          c.toLowerCase().includes('aftermarket'))
    )

  if (hasNonOemParts) {
    score -= 15
    issues.push({
      type: 'regulatory',
      severity: 'medium',
      description: 'Policy enforces use of non-OEM or aftermarket parts for repairs',
      descriptionTR:
        'Poliçe, onarımlarda yan sanayi veya eşdeğer parça kullanımını zorunlu kılıyor',
    })
    textIssues.push('Enforces non-OEM parts')
    textIssuesTR.push('Yan sanayi parça zorunluluğu')
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
      (c) => isIncluded(c) && valueCoverages.some((vc) => c.name.toLowerCase().includes(vc))
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
  // Use inferred coverage when the extraction didn't set a top-level total
  const effectiveCoverage =
    policy.coverage > 0 ? policy.coverage : inferTotalCoverage(policy.coverages)
  const coverageToPremiumRatio = policy.premium > 0 ? effectiveCoverage / policy.premium : 0

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
    (c) => isIncluded(c) && valueCoverages.some((vc) => c.name.toLowerCase().includes(vc))
  )

  if (hasValueAdded) {
    score += 5
  }

  // Bug #8 fix: Assistance package bonus — comprehensive roadside/towing/hotel
  // services add real monetary value that was previously ignored.
  const ASSISTANCE_PATTERNS = [
    'yol yardım',
    'roadside',
    'çekici',
    'towing',
    'vinç',
    'crane',
    'otel',
    'hotel',
    'konaklama',
    'accommodation',
    'sağlık nakil',
    'medical transport',
    'ambulans',
    'ambulance',
    'ikame araç',
    'replacement vehicle',
    'rent a car',
    'anahtar',
    'key',
    'lastik',
    'tire',
    'yakıt',
    'fuel',
  ]
  const assistanceCount = policy.coverages.filter(
    (c) => isIncluded(c) && ASSISTANCE_PATTERNS.some((p) => c.name.toLowerCase().includes(p))
  ).length
  if (assistanceCount >= 6) {
    score += 5
  } else if (assistanceCount >= 3) {
    score += 3
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
    details: `Coverage-to-premium ratio: ${isFinite(coverageToPremiumRatio) ? coverageToPremiumRatio.toFixed(1) : '0.0'}x`,
    detailsTR: `Teminat/prim oranı: ${isFinite(coverageToPremiumRatio) ? coverageToPremiumRatio.toFixed(1) : '0,0'}x`,
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
  const analyzedPolicy = policy as import('@/types/policy').AnalyzedPolicy
  const insuranceType = POLICY_TYPE_TO_INSURANCE_TYPE[policy.type]
  let subType: string | undefined
  if (isCommercialOrNicheVehicle(analyzedPolicy)) {
    subType = insuranceType === 'zmss' ? 'commercial_vehicle' : 'commercial'
  }
  let benchmark = getPremiumBenchmarkWithFallback(insuranceType, subType)

  if (policy.type === 'kasko' && isCommercialOrNicheVehicle(analyzedPolicy)) {
    benchmark = {
      insuranceType: 'kasko',
      vehicleClass: 'commercial',
      minPremium: KASKO_COMMERCIAL_BENCHMARKS.premiumRange.min,
      avgPremium: KASKO_COMMERCIAL_BENCHMARKS.premiumRange.average,
      maxPremium: KASKO_COMMERCIAL_BENCHMARKS.premiumRange.max,
      currency: 'TRY',
      year: parseInt(KASKO_COMMERCIAL_BENCHMARKS.dataDate.substring(0, 4), 10) || 2025,
      source: KASKO_COMMERCIAL_BENCHMARKS.source,
      comparisonMethod: 'direct_premium',
      benchmarkStatus: 'trusted',
      dataDate: KASKO_COMMERCIAL_BENCHMARKS.dataDate,
    }
  }

  let premiumPercentile = 50
  let coveragePercentile = 50

  if (!benchmark || benchmark.benchmarkStatus === 'untrusted') {
    // eslint-disable-next-line no-restricted-syntax
    return {
      premiumPercentile: 50,
      coveragePercentile: 50,
      isAboveAverageValue: false,
      competitivePosition: 'average', // Neutral
      // Additional flag to indicate this is an untrusted/missing comparison
      untrusted: true,
      // The `untrusted` flag is not in PolicyEvaluation['marketComparison'] —
      // the UI narrows on it to suppress numeric info. This is a deliberate
      // augmentation rather than a shape bug; future work: add an optional
      // `untrusted?: boolean` to the type so the cast becomes unnecessary.
    } as unknown as PolicyEvaluation['marketComparison']
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

    if (issue.type === 'below_minimum') {
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

  // Expired policy recommendations — severity is 'low' (informational)
  // but we still surface renewal/archival guidance
  for (const issue of complianceIssues.filter((i) => i.type === 'expired')) {
    const expiryDate = new Date(policy.expiryDate)
    const now = new Date()
    const yearsExpired = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)

    let specificTitle: string
    let specificTitleTR: string

    if (yearsExpired > 2) {
      specificTitle = 'Historical Policy — For Reference Only'
      specificTitleTR = 'Tarihsel Poliçe — Yalnızca Referans Amaçlı'
      issue.description = `Policy expired ${Math.floor(yearsExpired)} years ago. This analysis is for archival/reference purposes only.`
      issue.descriptionTR = `Poliçe ${Math.floor(yearsExpired)} yıl önce sona ermiş. Bu analiz yalnızca arşiv/referans amacıyla yapılmıştır.`
    } else {
      specificTitle = 'Renew Expired Policy Immediately'
      specificTitleTR = 'Süresi Dolan Poliçeyi Hemen Yenileyin'
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
    const deductibleAmount = formatTRY(policy.deductible)
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
    const premiumAmount = formatTRY(policy.premium)

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
  // Uses the shared IMM_COVERAGE_PATTERNS constant (defined at module top)
  // to stay in sync with the compliance evaluator. Bug #2 fix.
  const immCoverage = policy.coverages.find(
    (c) => (matchesIMMPattern(c.name) || matchesIMMPattern(c.nameTr)) && isIncluded(c)
  )

  if (immCoverage) {
    if (immCoverage.isUnlimited) {
      // Detect the Artan Mali Sorumluluk Sınırsız carve-out: unlimited IMM
      // is routinely capped at 2.5M TL per event at airports, ports, fuel
      // depots, refineries, chemical storage, and similar high-exposure
      // locations. If the coverage's quote / clause / explicit carveOuts
      // hint at that pattern, surface it as a caveat badge rather than
      // claiming the user truly pays 0 TL in every scenario.
      const carveOutCaveat = detectImmCarveOut(immCoverage)
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
        ...(carveOutCaveat ? { caveat: carveOutCaveat.en, caveatTR: carveOutCaveat.tr } : {}),
      })
    } else {
      const limitStr = formatTRY(immCoverage.limit)
      cards.push({
        id: 'imm-scenario',
        title: 'At-Fault Major Accident',
        titleTR: 'Kusurlu Büyük Kazada',
        description: `Your policy caps liability at ${limitStr} TL. Damages exceeding this limit must be paid out-of-pocket, creating significant financial exposure.`,
        descriptionTR: `Poliçeniz mali sorumluluğu ${limitStr} TL ile sınırlar. Bu limiti aşan hasarlar trafik sigortası olsa bile cebinizden ödenmelidir, bu da yüksek mali yükümlülük yaratabilir.`,
        financialStatus: 'risk',
        riskAmount: `Over ${limitStr} TL`,
        riskAmountTR: `${limitStr} TL Üzeri`,
        insurerPays: `Up to ${limitStr} TL`,
        insurerPaysTR: `Maksimum ${limitStr} TL`,
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
    (c) => c.name.toLowerCase().includes('yeni değer') && isIncluded(c)
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

  // 4. Fleet Count Trap Scenario (Bug #5)
  // Detect POLİÇE ADET KONTROL clauses: if fleet drops below N vehicles,
  // premium surcharge applies (typically +50%).
  const fleetClauseTexts = [
    ...(policy.exclusions || []),
    ...((policy as { specialConditions?: string[] }).specialConditions || []),
  ]
  const hasFleetClause = fleetClauseTexts.some((text) => {
    if (typeof text !== 'string') return false
    const lower = text.toLowerCase()
    return (
      lower.includes('adet kontrol') ||
      lower.includes('adet altı') ||
      lower.includes('filo asgari') ||
      lower.includes('araç sayısı') ||
      (lower.includes('filo') && lower.includes('düşüş'))
    )
  })
  if (hasFleetClause) {
    cards.push({
      id: 'fleet-risk',
      title: 'Fleet Size Drop Risk',
      titleTR: 'Filo Adet Düşüş Riski',
      description:
        'Your policy contains a fleet count control clause (Poliçe Adet Kontrol Klozu). If the number of vehicles in the fleet falls below the minimum threshold, a significant premium surcharge (often +50%) may be applied retroactively.',
      descriptionTR:
        'Poliçenizde Poliçe Adet Kontrol Klozu bulunmaktadır. Filodaki araç sayısı minimum eşiğin altına düşerse, geriye dönük ciddi bir prim zammı (genellikle +%50) uygulanabilir.',
      financialStatus: 'risk',
      insurerPays: 'Standard coverage continues',
      insurerPaysTR: 'Standart teminat devam eder',
      userPays: 'Up to +50% premium surcharge',
      userPaysTR: "+%50'ye kadar prim zammı",
      trigger: 'Fleet vehicle count drops below the policy-specified minimum.',
      triggerTR: 'Filo araç sayısı poliçede belirtilen asgari seviyenin altına düşmesi.',
      whyItMatters:
        'Selling or decommissioning vehicles could trigger a massive retroactive surcharge.',
      whyItMattersTR:
        'Araç satışı veya çıkarılması, geriye dönük büyük prim zammını tetikleyebilir.',
    })
  }

  // 5. Manevi Tazminat (Moral Damages) Positive Finding (Bug #9)
  const allTexts = [
    ...policy.coverages.map(
      (c) => `${c.name || ''} ${c.description || ''} ${(c as { nameTr?: string }).nameTr || ''}`
    ),
    ...(policy.exclusions || []),
    ...((policy as { specialConditions?: string[] }).specialConditions || []),
  ]
  const hasManevi = allTexts.some(
    (t) => typeof t === 'string' && t.toLowerCase().includes('manevi tazminat')
  )
  if (hasManevi && (policy.type === 'kasko' || policy.type === 'traffic')) {
    cards.push({
      id: 'manevi-tazminat',
      title: 'Moral Damages Coverage',
      titleTR: 'Manevi Tazminat Teminatı',
      description:
        'Your policy includes moral damages (Manevi Tazminat) coverage within the bodily injury limits. This protects against non-economic compensation claims by accident victims.',
      descriptionTR:
        'Poliçeniz bedeni zarar limitleri dahilinde manevi tazminat teminatı içermektedir. Bu, kaza mağdurlarının manevi tazminat taleplerinden sizi korur.',
      financialStatus: 'covered',
      insurerPays: 'Moral damages claims (within bodily injury limits)',
      insurerPaysTR: 'Manevi tazminat talepleri (bedeni zarar limitleri dahilinde)',
      userPays: '0 TL',
      userPaysTR: '0 TL',
      trigger: 'Third-party moral damages claim after an at-fault accident.',
      triggerTR: 'Kusurlu kazada üçüncü şahıs manevi tazminat talebi.',
      whyItMatters: 'Moral damages can add significant liability beyond physical damage costs.',
      whyItMattersTR:
        'Manevi tazminat, fiziksel hasar maliyetlerinin ötesinde ciddi yükümlülük ekleyebilir.',
    })
  }

  // 6. Contextual Risk Linking (Bug #6)
  // Infer industry from insured name and check for high-risk exclusions
  const industry = inferIndustryFromInsuredName(policy.insuredPerson)
  if (industry === 'mining' || industry === 'construction') {
    const hasQuarryExclusion = allTexts.some((text) => {
      if (typeof text !== 'string') return false
      const lower = text.toLowerCase()
      return (
        lower.includes('maden ocakları') ||
        lower.includes('şantiye') ||
        lower.includes('santiye') ||
        lower.includes('hafriyat sahası') ||
        lower.includes('maden sahası')
      )
    })

    if (hasQuarryExclusion) {
      cards.push({
        id: 'contextual-risk',
        title: 'Industry-Specific Exclusion Risk',
        titleTR: 'Sektöre Özel İstisna Riski',
        description: `Your policy excludes damages occurring in high-risk areas like quarries or construction sites, but your insured entity (${policy.insuredPerson}) indicates operations in the ${industry} industry.`,
        descriptionTR: `Poliçeniz maden ocakları veya şantiye sahaları gibi yüksek riskli alanlarda meydana gelen hasarları kapsam dışında tutmaktadır. Ancak sigortalı şirketiniz (${policy.insuredPerson}) bu sektörde faaliyet göstermektedir.`,
        financialStatus: 'risk',
        insurerPays: '0 TL (Claims denied in work zones)',
        insurerPaysTR: '0 TL (Çalışma sahalarındaki hasarlar reddedilir)',
        userPays: 'Full cost of damage',
        userPaysTR: 'Hasarın tamamı',
        trigger:
          'An accident occurs while the vehicle is operating in a quarry or construction site.',
        triggerTR: 'Aracın şantiye veya maden sahasında çalışırken hasar görmesi.',
        whyItMatters:
          'Major operations gap. Your primary business activity locations are explicitly excluded from coverage.',
        whyItMattersTR: 'Büyük operasyonel risk. Ana faaliyet alanlarınız teminat dışı bırakılmış.',
      })
    }
  }

  // Fallback for non-auto
  if (cards.length === 0) {
    cards.push({
      id: 'general-deductible',
      title: 'General Claim Incident',
      titleTR: 'Genel Hasar Durumu',
      description:
        policy.deductible > 0
          ? `You will pay the first ${formatTRY(policy.deductible)} TL out of pocket for any claimed loss.`
          : 'You have no fixed deductible. The insurer will cover verified claims directly, subject to limits.',
      descriptionTR:
        policy.deductible > 0
          ? `Herhangi bir hasar talebinde ilk ${formatTRY(policy.deductible)} TL'yi cepten ödeyeceksiniz.`
          : 'Sabit bir muafiyetiniz yok. Sigortacı onaylanan hasarları doğrudan teminat limitleri dahilinde öder.',
      financialStatus: policy.deductible > 0 ? 'partially_covered' : 'covered',
      riskAmount: policy.deductible > 0 ? `Up to ${formatTRY(policy.deductible)} TL` : undefined,
      riskAmountTR:
        policy.deductible > 0 ? `${formatTRY(policy.deductible)} TL'ye kadar` : undefined,
      insurerPays: policy.deductible > 0 ? 'Claim minus deductible' : 'Full verified claim',
      insurerPaysTR: policy.deductible > 0 ? 'Hasar eksi muafiyet' : 'Doğrulanmış hasarın tamamı',
      userPays: policy.deductible > 0 ? `${formatTRY(policy.deductible)} TL` : '0 TL',
      userPaysTR: policy.deductible > 0 ? `${formatTRY(policy.deductible)} TL` : '0 TL',
      trigger: 'Any eligible claim occurs.',
      triggerTR: 'Uygun bir hasar talebinin oluşması.',
      whyItMatters: 'Shows your guaranteed out-of-pocket minimum for any claim.',
      whyItMattersTR: 'Herhangi bir hasarda kesin cebinizden çıkacak minimum tutarı gösterir.',
    })
  }

  return cards
}
