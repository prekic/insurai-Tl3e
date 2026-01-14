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
} from './types'
import {
  DEFAULT_EVALUATION_CONFIG,
  getGradeFromScore,
  getStatusFromScore,
} from './types'

// Import knowledge database
import {
  getBranchStatistics,
  getPremiumBenchmark,
  getCurrentTrafficLimits,
  getCurrentDaskLimits,
  MARKET_DATA_2024,
  DASK_PREMIUM_RATES_2026,
} from '@/data'

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

export function evaluatePolicy(
  policy: Policy,
  config: Partial<EvaluationConfig> = {}
): PolicyEvaluation {
  const fullConfig = { ...DEFAULT_EVALUATION_CONFIG, ...config }
  const branchCode = POLICY_TYPE_TO_BRANCH[policy.type]
  const branchStats = getBranchStatistics(branchCode)

  // Evaluate each category
  const premiumScore = evaluatePremium(policy, fullConfig)
  const coverageScore = evaluateCoverage(policy, fullConfig)
  const deductibleScore = evaluateDeductible(policy, fullConfig)
  const complianceResult = evaluateCompliance(policy, fullConfig)
  const valueScore = evaluateValue(policy, premiumScore.score, coverageScore.score, fullConfig)

  // Calculate weighted overall score
  const overallScore = calculateOverallScore(
    {
      premium: premiumScore.score,
      coverage: coverageScore.score,
      deductible: deductibleScore.score,
      compliance: complianceResult.score,
      value: valueScore.score,
    },
    fullConfig.weights
  )

  // Generate market comparison
  const marketComparison = generateMarketComparison(policy, branchStats)

  // Generate recommendations
  const recommendations = generateRecommendations(
    policy,
    { premium: premiumScore, coverage: coverageScore, deductible: deductibleScore, compliance: complianceResult, value: valueScore },
    complianceResult.complianceIssues
  )

  // Generate summary
  const summary = generateSummary(
    { premium: premiumScore, coverage: coverageScore, deductible: deductibleScore, compliance: complianceResult, value: valueScore },
    recommendations
  )

  return {
    policyId: policy.id,
    policyNumber: policy.policyNumber,
    policyType: policy.type,
    evaluatedAt: new Date().toISOString(),

    overallScore,
    grade: getGradeFromScore(overallScore),
    status: getStatusFromScore(overallScore),

    scoreBreakdown: {
      premium: premiumScore,
      coverage: coverageScore,
      deductible: deductibleScore,
      compliance: complianceResult,
      value: valueScore,
    },

    marketComparison,

    compliance: {
      isCompliant: complianceResult.complianceIssues.filter(i => i.severity === 'critical').length === 0,
      mandatoryMet: complianceResult.complianceIssues.filter(i => i.type === 'missing_coverage' && i.severity === 'critical').length === 0,
      minimumLimitsMet: complianceResult.complianceIssues.filter(i => i.type === 'below_minimum').length === 0,
      issues: complianceResult.complianceIssues,
    },

    recommendations,
    summary,
  }
}

// =============================================================================
// PREMIUM EVALUATION
// =============================================================================

function evaluatePremium(policy: Policy, config: EvaluationConfig): ScoreBreakdown {
  const insuranceType = POLICY_TYPE_TO_INSURANCE_TYPE[policy.type]
  const benchmark = getPremiumBenchmark(insuranceType)
  const issues: string[] = []
  const issuesTR: string[] = []

  let score = 70 // Default score

  if (benchmark) {
    const { minPremium, avgPremium, maxPremium } = benchmark

    if (policy.premium < minPremium) {
      // Suspiciously low - might be missing coverage
      score = 60
      issues.push('Premium is below market minimum - verify coverage is adequate')
      issuesTR.push('Prim piyasa minimumunun altında - teminatın yeterli olduğunu doğrulayın')
    } else if (policy.premium <= avgPremium) {
      // Great - at or below average
      score = 90 + Math.round((avgPremium - policy.premium) / avgPremium * 10)
      score = Math.min(100, score)
    } else if (policy.premium <= maxPremium) {
      // Above average but within range
      const aboveAvgRatio = (policy.premium - avgPremium) / (maxPremium - avgPremium)
      score = 90 - Math.round(aboveAvgRatio * 30)
      if (aboveAvgRatio > 0.5) {
        issues.push('Premium is significantly above market average')
        issuesTR.push('Prim piyasa ortalamasının önemli ölçüde üzerinde')
      }
    } else {
      // Above maximum
      score = 40
      issues.push('Premium exceeds typical market range')
      issuesTR.push('Prim tipik piyasa aralığını aşıyor')
    }
  }

  // Check premium relative to coverage
  const premiumToCoverageRatio = policy.premium / policy.coverage
  const avgRatio = MARKET_DATA_2024.averagePremiums[insuranceType as keyof typeof MARKET_DATA_2024.averagePremiums] || 5000
  const expectedRatio = avgRatio / 100000 // Rough expected ratio

  if (premiumToCoverageRatio > expectedRatio * 2) {
    score = Math.max(score - 10, 0)
    issues.push('Premium to coverage ratio is high')
    issuesTR.push('Prim/teminat oranı yüksek')
  }

  return {
    category: 'Premium',
    categoryTR: 'Prim',
    score,
    weight: config.weights.premium,
    details: `Premium of ${policy.premium.toLocaleString('tr-TR')} TL compared to market average`,
    detailsTR: `${policy.premium.toLocaleString('tr-TR')} TL prim, piyasa ortalaması ile karşılaştırıldı`,
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

  // Check total coverage amount
  const coveragePerPremium = policy.coverage / policy.premium
  if (coveragePerPremium > 20) {
    score += 15
  } else if (coveragePerPremium < 10) {
    score -= 10
    issues.push('Coverage amount is low relative to premium paid')
    issuesTR.push('Teminat tutarı ödenen prime göre düşük')
  }

  // Check number of coverages
  const includedCoverages = policy.coverages.filter(c => c.included)
  const coverageCount = includedCoverages.length

  if (coverageCount >= 8) {
    score += 10
  } else if (coverageCount >= 5) {
    score += 5
  } else if (coverageCount < 3) {
    score -= 15
    issues.push('Limited number of coverages included')
    issuesTR.push('Dahil edilen teminat sayısı sınırlı')
  }

  // Check for essential coverages by policy type
  const missingEssential = checkMissingEssentialCoverages(policy)
  if (missingEssential.length > 0) {
    score -= missingEssential.length * 10
    missingEssential.forEach(m => {
      issues.push(`Missing essential coverage: ${m.en}`)
      issuesTR.push(`Eksik temel teminat: ${m.tr}`)
    })
  }

  // Check coverage limits
  const lowLimitCoverages = includedCoverages.filter(c => c.limit < 50000)
  if (lowLimitCoverages.length > 2) {
    score -= 10
    issues.push('Several coverages have low limits')
    issuesTR.push('Birçok teminatın limiti düşük')
  }

  // Ensure score is in valid range
  score = Math.max(0, Math.min(100, score))

  return {
    category: 'Coverage',
    categoryTR: 'Teminat',
    score,
    weight: config.weights.coverage,
    details: `${coverageCount} coverages included with total coverage of ${policy.coverage.toLocaleString('tr-TR')} TL`,
    detailsTR: `${coverageCount} teminat dahil, toplam ${policy.coverage.toLocaleString('tr-TR')} TL teminat`,
    issues,
    issuesTR,
  }
}

function checkMissingEssentialCoverages(policy: Policy): { en: string; tr: string }[] {
  const missing: { en: string; tr: string }[] = []
  const coverageNames = policy.coverages.filter(c => c.included).map(c => c.name.toLowerCase())

  const essentialByType: Record<PolicyType, { en: string; tr: string }[]> = {
    kasko: [
      { en: 'Collision', tr: 'Çarpışma' },
      { en: 'Theft', tr: 'Hırsızlık' },
      { en: 'Fire', tr: 'Yangın' },
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
    life: [
      { en: 'Death Benefit', tr: 'Vefat Teminatı' },
    ],
    dask: [
      { en: 'Earthquake', tr: 'Deprem' },
    ],
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
    const found = coverageNames.some(name =>
      name.includes(essential.en.toLowerCase()) ||
      name.includes(essential.tr.toLowerCase())
    )
    if (!found) {
      missing.push(essential)
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

  // Check main deductible
  const deductibleRatio = policy.deductible / policy.coverage

  if (deductibleRatio === 0) {
    score = 95 // No deductible is great
  } else if (deductibleRatio < 0.01) {
    score = 90 // Less than 1%
  } else if (deductibleRatio < 0.02) {
    score = 80 // 1-2% is standard
  } else if (deductibleRatio < 0.05) {
    score = 65
    issues.push('Deductible is moderately high (2-5% of coverage)')
    issuesTR.push('Muafiyet orta düzeyde yüksek (teminatın %2-5\'i)')
  } else if (deductibleRatio < 0.10) {
    score = 50
    issues.push('Deductible is high (5-10% of coverage)')
    issuesTR.push('Muafiyet yüksek (teminatın %5-10\'u)')
  } else {
    score = 30
    issues.push('Deductible is very high (>10% of coverage)')
    issuesTR.push('Muafiyet çok yüksek (teminatın >%10\'u)')
  }

  // Check individual coverage deductibles
  const highDeductibleCoverages = policy.coverages.filter(c =>
    c.included && c.deductible > 0 && (c.deductible / c.limit) > 0.1
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
    const autoLimit = limits.limits.find(l => l.vehicleType === 'automobile' && l.coverageType === 'bodily_injury_per_person')

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
    const maxCoverage = daskLimits.limits.find(l => l.coverageType === 'max_coverage')?.maxLimit || DASK_PREMIUM_RATES_2026.maxCoverage

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
    if (policy.deductible > 0 && Math.abs(policy.deductible - expectedDeductible) > expectedDeductible * 0.1) {
      issues.push({
        type: 'regulatory',
        severity: 'medium',
        description: 'DASK deductible should be 2% of insured value',
        descriptionTR: 'DASK muafiyeti sigorta bedelinin %2\'si olmalıdır',
        requiredValue: expectedDeductible,
        actualValue: policy.deductible,
      })
    }
  }

  // Ensure minimum score
  score = Math.max(0, score)

  return {
    category: 'Compliance',
    categoryTR: 'Uyumluluk',
    score,
    weight: config.weights.compliance,
    details: issues.length === 0 ? 'Policy meets all regulatory requirements' : `${issues.length} compliance issue(s) found`,
    detailsTR: issues.length === 0 ? 'Poliçe tüm yasal gereksinimleri karşılıyor' : `${issues.length} uyumluluk sorunu bulundu`,
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

  // Value is a combination of coverage quality vs premium paid
  const coverageToPremiumRatio = policy.coverage / policy.premium

  // Calculate base value score
  let score = (premiumScore * 0.4 + coverageScore * 0.6)

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
  const valueCoverages = ['roadside assistance', 'yol yardım', 'replacement vehicle', 'ikame araç', 'legal protection', 'hukuki koruma']
  const hasValueAdded = policy.coverages.some(c =>
    c.included && valueCoverages.some(vc => c.name.toLowerCase().includes(vc))
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
  const benchmark = getPremiumBenchmark(insuranceType)

  let premiumPercentile = 50
  let coveragePercentile = 50

  if (benchmark) {
    // Calculate premium percentile
    const premiumRange = benchmark.maxPremium - benchmark.minPremium
    if (premiumRange > 0) {
      premiumPercentile = Math.max(0, Math.min(100,
        100 - ((policy.premium - benchmark.minPremium) / premiumRange * 100)
      ))
    }

    // Estimate coverage percentile based on premium
    const expectedCoverage = policy.premium * 20 // Rough estimate
    coveragePercentile = Math.min(100, (policy.coverage / expectedCoverage) * 50)
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
  _policy: Policy,
  scores: Record<string, ScoreBreakdown>,
  complianceIssues: ComplianceIssue[]
): Recommendation[] {
  const recommendations: Recommendation[] = []

  // Critical compliance issues first
  for (const issue of complianceIssues.filter(i => i.severity === 'critical')) {
    recommendations.push({
      priority: 'critical',
      type: 'compliance',
      title: 'Address Compliance Issue',
      titleTR: 'Uyumluluk Sorununu Giderin',
      description: issue.description,
      descriptionTR: issue.descriptionTR,
    })
  }

  // Coverage improvements
  if (scores.coverage.score < 70) {
    recommendations.push({
      priority: 'high',
      type: 'add_coverage',
      title: 'Improve Coverage',
      titleTR: 'Teminatı İyileştirin',
      description: 'Consider adding essential coverages that are currently missing',
      descriptionTR: 'Şu anda eksik olan temel teminatları eklemeyi düşünün',
      estimatedImpact: {
        coverageChange: 20,
        premiumChange: 15,
      },
    })
  }

  // Deductible optimization
  if (scores.deductible.score < 60) {
    recommendations.push({
      priority: 'medium',
      type: 'reduce_deductible',
      title: 'Reduce Deductible',
      titleTR: 'Muafiyeti Azaltın',
      description: 'High deductible may leave you exposed to significant out-of-pocket costs',
      descriptionTR: 'Yüksek muafiyet önemli cepten harcamalara maruz kalmanıza neden olabilir',
      estimatedImpact: {
        premiumChange: 10,
        riskReduction: 25,
      },
    })
  }

  // Premium optimization
  if (scores.premium.score < 60) {
    recommendations.push({
      priority: 'medium',
      type: 'review_premium',
      title: 'Review Premium',
      titleTR: 'Primi Gözden Geçirin',
      description: 'Premium appears high compared to market. Consider getting competitive quotes.',
      descriptionTR: 'Prim piyasaya göre yüksek görünüyor. Rekabetçi teklifler almayı düşünün.',
    })
  }

  // Value optimization
  if (scores.value.score < 60) {
    recommendations.push({
      priority: 'low',
      type: 'optimize',
      title: 'Optimize Value',
      titleTR: 'Değeri Optimize Edin',
      description: 'Consider adjusting coverage mix to improve overall value',
      descriptionTR: 'Genel değeri artırmak için teminat karışımını ayarlamayı düşünün',
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
    .filter(r => r.priority === 'critical' || r.priority === 'high')
    .map(r => r.title)

  const immediateActionsTR = recommendations
    .filter(r => r.priority === 'critical' || r.priority === 'high')
    .map(r => r.titleTR)

  return {
    strengths,
    strengthsTR,
    weaknesses,
    weaknessesTR,
    immediateActions,
    immediateActionsTR,
  }
}
