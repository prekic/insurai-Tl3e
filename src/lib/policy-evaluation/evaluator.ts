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
  const benchmark = getPremiumBenchmarkWithFallback(insuranceType)
  const issues: string[] = []
  const issuesTR: string[] = []

  let score = 70 // Default score
  let details = `Premium of ${policy.premium.toLocaleString('tr-TR')} TL compared to market average`
  let detailsTR = `${policy.premium.toLocaleString('tr-TR')} TL prim, piyasa ortalaması ile karşılaştırıldı`

  if (benchmark) {
    // Check if this benchmark uses value-based comparison (% of insured value)
    // This is typical for kasko, where premium depends on vehicle value
    if (isValueBasedBenchmark(benchmark) && policy.coverage > 0) {
      // Use value-based evaluation
      const valueEval = evaluateValueBasedPremium(policy.premium, policy.coverage, benchmark)
      score = valueEval.score
      details = valueEval.details
      detailsTR = valueEval.detailsTR

      if (valueEval.position === 'high') {
        issues.push('Premium rate is above market average for this value')
        issuesTR.push('Prim oranı bu değer için piyasa ortalamasının üzerinde')
      } else if (valueEval.position === 'very_high') {
        issues.push('Premium rate significantly exceeds typical market range')
        issuesTR.push('Prim oranı tipik piyasa aralığını önemli ölçüde aşıyor')
      }
    } else {
      // Direct premium comparison
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
  }

  // Check premium relative to coverage (skip for market value policies where coverage is 0)
  if (policy.coverage > 0) {
    const premiumToCoverageRatio = policy.premium / policy.coverage
    const avgRatio = MARKET_DATA_2024.averagePremiums[insuranceType as keyof typeof MARKET_DATA_2024.averagePremiums] || 5000
    const expectedRatio = avgRatio / 100000 // Rough expected ratio

    if (premiumToCoverageRatio > expectedRatio * 2) {
      score = Math.max(score - 10, 0)
      issues.push('Premium to coverage ratio is high')
      issuesTR.push('Prim/teminat oranı yüksek')
    }
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
  const hasMarketValueCoverage = policy.coverages.some(c => c.isMarketValue)
  const hasUnlimitedLiability = policy.coverages.some(c =>
    c.isUnlimited && c.name.toLowerCase().includes('mali sorumluluk')
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
    const coverageNames = policy.coverages.map(c => c.name.toLowerCase())
    if (coverageNames.some(n => n.includes('ferdi kaza') || n.includes('koltuk'))) {
      score += 5 // Personal accident coverage
    }
    if (coverageNames.some(n => n.includes('ikame') || n.includes('replacement'))) {
      score += 5 // Replacement vehicle
    }
    if (coverageNames.some(n => n.includes('hukuki') || n.includes('legal'))) {
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
  const includedCoverages = policy.coverages.filter(c => c.included !== false)
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
    missingEssential.forEach(m => {
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
    const lowLimitCoverages = includedCoverages.filter(c => c.limit > 0 && c.limit < 50000 && !c.isUnlimited)
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
  const coverageNames = policy.coverages.filter(c => c.included).map(c => c.name.toLowerCase())

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
  const hasMarketValueCoverage = policy.coverage === 0 || policy.coverages.some(c => c.isMarketValue)

  if (policy.deductible === 0) {
    // No deductible is excellent
    score = 95
    return {
      category: 'Deductible',
      categoryTR: 'Muafiyet',
      score,
      weight: config.weights.deductible,
      details: 'No deductible - full coverage from first TL',
      detailsTR: 'Muafiyet yok - ilk TL\'den itibaren tam teminat',
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
    c.included && c.deductible > 0 && c.limit > 0 && (c.deductible / c.limit) > 0.1
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

  // Handle market value policies where coverage is 0
  const hasMarketValueCoverage = policy.coverage === 0 || policy.coverages.some(c => c.isMarketValue)

  // Calculate base value score
  let score = (premiumScore * 0.4 + coverageScore * 0.6)

  // For market value policies, evaluate based on coverage quality and features
  if (hasMarketValueCoverage) {
    // Check for value-added coverages
    const valueCoverages = ['roadside assistance', 'yol yardım', 'anadolu hizmet', 'replacement vehicle', 'ikame araç', 'legal protection', 'hukuki koruma', 'mini onarım', 'cam', 'glass']
    const valueAddedCount = policy.coverages.filter(c =>
      c.included && valueCoverages.some(vc => c.name.toLowerCase().includes(vc))
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
  const benchmark = getPremiumBenchmarkWithFallback(insuranceType)

  let premiumPercentile = 50
  let coveragePercentile = 50

  if (benchmark) {
    // Check if value-based comparison is appropriate
    if (isValueBasedBenchmark(benchmark) && policy.coverage > 0) {
      // For value-based benchmarks (like kasko), compare rate instead of absolute premium
      const actualRate = policy.premium / policy.coverage
      const rateRange = (benchmark.valueMaxRate || 0) - (benchmark.valueMinRate || 0)

      if (rateRange > 0 && benchmark.valueMinRate) {
        premiumPercentile = Math.max(0, Math.min(100,
          100 - ((actualRate - benchmark.valueMinRate) / rateRange * 100)
        ))
      }

      // Coverage percentile is less meaningful for value-based, use 70 as neutral
      coveragePercentile = 70
    } else {
      // Direct premium comparison
      const premiumRange = benchmark.maxPremium - benchmark.minPremium
      if (premiumRange > 0) {
        premiumPercentile = Math.max(0, Math.min(100,
          100 - ((policy.premium - benchmark.minPremium) / premiumRange * 100)
        ))
      }

      // Estimate coverage percentile based on premium
      const expectedCoverage = policy.premium * 20 // Rough estimate
      coveragePercentile = policy.coverage > 0
        ? Math.min(100, (policy.coverage / expectedCoverage) * 50)
        : 50
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
  for (const issue of complianceIssues.filter(i => i.severity === 'critical')) {
    let specificTitle = 'Address Compliance Issue'
    let specificTitleTR = 'Uyumluluk Sorununu Giderin'

    if (issue.type === 'expired') {
      specificTitle = 'Renew Expired Policy Immediately'
      specificTitleTR = 'Süresi Dolan Poliçeyi Hemen Yenileyin'
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
    const missingIssues = scores.coverage.issues.filter(i => i.includes('Missing') || i.includes('essential'))
    const missingCoverages = missingIssues.length > 0
      ? missingIssues.map(i => i.replace('Missing essential coverage: ', '')).join(', ')
      : null

    const specificDescription = missingCoverages
      ? `Add missing coverages: ${missingCoverages}. These are standard in most ${policy.type} policies.`
      : 'Your policy has fewer coverages than typical market offerings. Request quotes with additional protections.'

    const specificDescriptionTR = missingCoverages
      ? `Eksik teminatları ekleyin: ${scores.coverage.issuesTR.filter(i => i.includes('Eksik')).map(i => i.replace('Eksik temel teminat: ', '')).join(', ')}. Bunlar çoğu ${policy.typeTr} poliçesinde standart olarak bulunur.`
      : 'Poliçenizde piyasa ortalamasından daha az teminat var. Ek korumalar içeren teklifler isteyin.'

    recommendations.push({
      priority: 'high',
      type: 'add_coverage',
      title: missingCoverages ? `Add Missing: ${missingCoverages.substring(0, 30)}${missingCoverages.length > 30 ? '...' : ''}` : 'Expand Coverage Portfolio',
      titleTR: missingCoverages ? `Eksik Ekleyin: ${scores.coverage.issuesTR.filter(i => i.includes('Eksik')).map(i => i.replace('Eksik temel teminat: ', '')).join(', ').substring(0, 30)}` : 'Teminat Portföyünü Genişletin',
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
    const hasMarketValueCoverage = policy.coverage === 0 || policy.coverages.some(c => c.isMarketValue)
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
  const hasMarketValuePolicyValue = policy.coverage === 0 || policy.coverages.some(c => c.isMarketValue)
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
      description: 'Your policy offers good value. Consider reviewing annually before renewal to ensure continued competitiveness.',
      descriptionTR: 'Poliçeniz iyi değer sunuyor. Rekabetçiliğin devam etmesini sağlamak için yenileme öncesi yıllık incelemeyi düşünün.',
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
