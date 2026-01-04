/**
 * ML-based Risk Scoring Engine
 * Calculates comprehensive risk scores for insurance policies
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type {
  RiskScore,
  RiskFactor,
  RiskPrediction,
  RiskFeatures,
  RiskCategory,
  RiskLevel,
} from '@/types/risk'
import { getRiskLevel, RISK_THRESHOLDS } from '@/types/risk'
import { extractFeatures, normalizeFeatures } from './feature-extractor'

const MODEL_VERSION = '1.0.0'

/**
 * Category weights for risk calculation
 */
const CATEGORY_WEIGHTS: Record<RiskCategory, number> = {
  coverage_gaps: 0.25,
  pricing: 0.15,
  provider: 0.15,
  temporal: 0.10,
  geographic: 0.10,
  concentration: 0.10,
  deductible: 0.10,
  exclusions: 0.05,
}

/**
 * Calculate comprehensive risk score for a policy
 */
export function calculateRiskScore(policy: AnalyzedPolicy): RiskScore {
  // Extract features
  const features = extractFeatures(policy)
  const normalizedFeatures = normalizeFeatures(features)

  // Calculate category scores
  const categories = calculateCategoryScores(features, normalizedFeatures)

  // Calculate overall score (weighted average)
  let overallScore = 0
  let totalWeight = 0

  for (const [category, data] of Object.entries(categories)) {
    const weight = CATEGORY_WEIGHTS[category as RiskCategory]
    overallScore += data.score * weight
    totalWeight += weight
  }

  overallScore = totalWeight > 0 ? overallScore / totalWeight * 100 : 50
  overallScore = Math.round(Math.min(100, Math.max(0, overallScore)))

  // Get top risk factors
  const allFactors: RiskFactor[] = Object.values(categories)
    .flatMap(c => c.factors)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)

  const topFactors = allFactors.slice(0, 5)

  // Calculate confidence
  const confidence = calculateConfidence(features)

  // Calculate percentile (simplified model)
  const percentile = calculatePercentile(overallScore, features.policyType)

  return {
    overall: overallScore,
    level: getRiskLevel(overallScore),
    categories: categories as RiskScore['categories'],
    topFactors,
    confidence,
    percentile,
    calculatedAt: Date.now(),
    modelVersion: MODEL_VERSION,
  }
}

/**
 * Calculate scores for each risk category
 */
function calculateCategoryScores(
  features: RiskFeatures,
  _normalized: Record<string, number>
): Record<RiskCategory, { score: number; level: RiskLevel; factors: RiskFactor[] }> {
  // Note: _normalized is prepared for future ML model expansion
  return {
    coverage_gaps: calculateCoverageGapRisk(features),
    pricing: calculatePricingRisk(features),
    provider: calculateProviderRisk(features),
    temporal: calculateTemporalRisk(features),
    geographic: calculateGeographicRisk(features),
    concentration: calculateConcentrationRisk(features),
    deductible: calculateDeductibleRisk(features),
    exclusions: calculateExclusionRisk(features),
  }
}

/**
 * Coverage gap risk calculation
 */
function calculateCoverageGapRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  // Missing minimum coverages
  if (!features.hasMinimumCoverages) {
    const gapScore = Math.min(100, features.coverageGapCount * 20)
    factors.push({
      category: 'coverage_gaps',
      name: 'Eksik Teminatlar',
      score: gapScore,
      weight: 0.6,
      level: getRiskLevel(gapScore),
      description: `${features.coverageGapCount} temel teminat eksik`,
      recommendation: 'Eksik teminatları ekleyerek korumayı artırın',
      confidence: 0.9,
    })
  }

  // Low coverage ratio
  if (features.coverageRatio < 0.8) {
    const ratioScore = (1 - features.coverageRatio) * 100
    factors.push({
      category: 'coverage_gaps',
      name: 'Düşük Teminat Oranı',
      score: ratioScore,
      weight: 0.4,
      level: getRiskLevel(ratioScore),
      description: `Teminat oranı: %${Math.round(features.coverageRatio * 100)}`,
      recommendation: 'Kapsamı artırmayı değerlendirin',
      confidence: 0.85,
    })
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Pricing risk calculation
 */
function calculatePricingRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.priceToMarketRatio !== null) {
    const deviation = Math.abs(features.priceToMarketRatio - 1)

    if (deviation > 0.2) {
      const isOverpriced = features.priceToMarketRatio > 1
      const score = Math.min(100, deviation * 100)

      factors.push({
        category: 'pricing',
        name: isOverpriced ? 'Yüksek Fiyatlandırma' : 'Düşük Fiyatlandırma',
        score,
        weight: 0.8,
        level: getRiskLevel(score),
        description: isOverpriced
          ? `Piyasa ortalamasının %${Math.round(deviation * 100)} üzerinde`
          : `Piyasa ortalamasının %${Math.round(deviation * 100)} altında (dikkat!)`,
        recommendation: isOverpriced
          ? 'Alternatif teklifleri karşılaştırın'
          : 'Kapsam detaylarını kontrol edin',
        confidence: 0.75,
      })
    }
  }

  if (features.premiumPercentile !== null) {
    if (features.premiumPercentile < 10 || features.premiumPercentile > 90) {
      const isOutlier = features.premiumPercentile > 90
      const score = isOutlier
        ? (features.premiumPercentile - 50) * 2
        : (50 - features.premiumPercentile) * 2

      factors.push({
        category: 'pricing',
        name: 'Fiyat Aykırılığı',
        score,
        weight: 0.5,
        level: getRiskLevel(score),
        description: `Fiyat %${features.premiumPercentile} diliminde`,
        confidence: 0.7,
      })
    }
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Provider risk calculation
 */
function calculateProviderRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.providerRating !== null) {
    if (features.providerRating < 3.5) {
      const score = (4 - features.providerRating) * 30
      factors.push({
        category: 'provider',
        name: 'Düşük Sigorta Şirketi Puanı',
        score,
        weight: 0.7,
        level: getRiskLevel(score),
        description: `Şirket puanı: ${features.providerRating.toFixed(1)}/5`,
        recommendation: 'Daha yüksek puanlı şirketleri değerlendirin',
        confidence: 0.8,
      })
    }
  } else {
    // Unknown provider
    factors.push({
      category: 'provider',
      name: 'Bilinmeyen Sigorta Şirketi',
      score: 40,
      weight: 0.5,
      level: 'moderate',
      description: 'Sigorta şirketi puanı bulunamadı',
      confidence: 0.5,
    })
  }

  if (features.providerMarketShare !== null && features.providerMarketShare < 0.03) {
    factors.push({
      category: 'provider',
      name: 'Düşük Pazar Payı',
      score: 30,
      weight: 0.3,
      level: 'low',
      description: 'Şirketin pazar payı %3\'ün altında',
      confidence: 0.6,
    })
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Temporal risk calculation
 */
function calculateTemporalRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.isExpired) {
    factors.push({
      category: 'temporal',
      name: 'Süresi Dolmuş Poliçe',
      score: 100,
      weight: 1.0,
      level: 'very_high',
      description: 'Poliçenin süresi dolmuş - koruma yok',
      recommendation: 'ACİL: Poliçeyi yenileyin',
      confidence: 1.0,
    })
  } else if (features.renewalRequired) {
    const daysLeft = features.daysToExpiry ?? 0
    const score = Math.min(80, Math.max(50, 80 - daysLeft * 2))

    factors.push({
      category: 'temporal',
      name: 'Yaklaşan Vade',
      score,
      weight: 0.8,
      level: getRiskLevel(score),
      description: `${daysLeft} gün içinde vade doluyor`,
      recommendation: 'Yenileme sürecini başlatın',
      confidence: 1.0,
    })
  } else if (features.daysToExpiry !== null && features.daysToExpiry < 60) {
    factors.push({
      category: 'temporal',
      name: 'Kısa Süre Kaldı',
      score: 30,
      weight: 0.4,
      level: 'low',
      description: `Vadeye ${features.daysToExpiry} gün var`,
      recommendation: 'Yenileme planlaması yapın',
      confidence: 0.9,
    })
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Geographic risk calculation
 */
function calculateGeographicRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.regionRiskFactor > 1.1) {
    const score = (features.regionRiskFactor - 1) * 200
    factors.push({
      category: 'geographic',
      name: 'Yüksek Riskli Bölge',
      score,
      weight: 0.6,
      level: getRiskLevel(score),
      description: `Bölge risk faktörü: ${features.regionRiskFactor.toFixed(2)}x`,
      recommendation: 'Bölgeye özel teminatları kontrol edin',
      confidence: 0.7,
    })
  }

  if (features.urbanFactor > 1.15) {
    factors.push({
      category: 'geographic',
      name: 'Büyükşehir Riski',
      score: 35,
      weight: 0.4,
      level: 'low',
      description: 'Büyükşehir kaynaklı artan risk',
      confidence: 0.6,
    })
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Concentration risk calculation
 */
function calculateConcentrationRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.coverageCount < 3) {
    const score = (3 - features.coverageCount) * 25
    factors.push({
      category: 'concentration',
      name: 'Sınırlı Teminat Çeşitliliği',
      score,
      weight: 0.7,
      level: getRiskLevel(score),
      description: `Sadece ${features.coverageCount} teminat mevcut`,
      recommendation: 'Ek teminatlarla riski dağıtın',
      confidence: 0.8,
    })
  }

  if (features.totalCoverageLimit !== null && features.premiumAmount !== null) {
    const coveragePerTRY = features.totalCoverageLimit / features.premiumAmount
    if (coveragePerTRY < 50) {
      factors.push({
        category: 'concentration',
        name: 'Düşük Teminat/Prim Oranı',
        score: 40,
        weight: 0.5,
        level: 'moderate',
        description: 'Her 1 TL prim için düşük teminat',
        confidence: 0.6,
      })
    }
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Deductible risk calculation
 */
function calculateDeductibleRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.deductibleToPremiumRatio !== null && features.deductibleToPremiumRatio > 0.5) {
    const score = Math.min(80, features.deductibleToPremiumRatio * 80)
    factors.push({
      category: 'deductible',
      name: 'Yüksek Muafiyet Oranı',
      score,
      weight: 0.7,
      level: getRiskLevel(score),
      description: `Muafiyet primin %${Math.round(features.deductibleToPremiumRatio * 100)}'i`,
      recommendation: 'Muafiyeti düşürmeyi değerlendirin',
      confidence: 0.85,
    })
  }

  if (features.maxDeductible !== null && features.maxDeductible > 10000) {
    const score = Math.min(60, (features.maxDeductible - 10000) / 500)
    factors.push({
      category: 'deductible',
      name: 'Yüksek Maksimum Muafiyet',
      score,
      weight: 0.5,
      level: getRiskLevel(score),
      description: `Maksimum muafiyet: ${features.maxDeductible.toLocaleString('tr-TR')} TL`,
      confidence: 0.8,
    })
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Exclusion risk calculation
 */
function calculateExclusionRisk(
  features: RiskFeatures
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []

  if (features.hasHighRiskExclusions) {
    factors.push({
      category: 'exclusions',
      name: 'Kritik İstisnalar',
      score: 60,
      weight: 0.8,
      level: 'moderate',
      description: 'Yüksek riskli istisnalar mevcut',
      recommendation: 'İstisnaları inceleyin ve alternatif teminat arayın',
      confidence: 0.75,
    })
  }

  if (features.exclusionCount > 10) {
    const score = Math.min(50, features.exclusionCount * 3)
    factors.push({
      category: 'exclusions',
      name: 'Çok Sayıda İstisna',
      score,
      weight: 0.5,
      level: getRiskLevel(score),
      description: `${features.exclusionCount} istisna maddesi`,
      confidence: 0.7,
    })
  }

  const avgScore = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      factors.reduce((sum, f) => sum + f.weight, 0)
    : 0

  return {
    score: avgScore,
    level: getRiskLevel(avgScore),
    factors,
  }
}

/**
 * Calculate confidence scores
 */
function calculateConfidence(features: RiskFeatures): RiskScore['confidence'] {
  // Data quality based on available features
  let dataPoints = 0
  const totalPoints = 10

  if (features.policyType) dataPoints++
  if (features.premiumAmount) dataPoints++
  if (features.totalCoverageLimit) dataPoints++
  if (features.providerRating) dataPoints++
  if (features.daysToExpiry !== null) dataPoints++
  if (features.premiumPercentile !== null) dataPoints++
  if (features.averageDeductible !== null) dataPoints++
  if (features.coverageCount > 0) dataPoints++
  if (features.regionRiskFactor !== 1.0) dataPoints++
  if (features.exclusionCount > 0) dataPoints++

  const dataQuality = dataPoints / totalPoints

  // Model certainty based on feature completeness
  const modelCertainty = Math.min(0.95, 0.6 + dataQuality * 0.35)

  return {
    overall: (dataQuality + modelCertainty) / 2,
    dataQuality,
    modelCertainty,
  }
}

/**
 * Calculate risk percentile
 */
function calculatePercentile(
  score: number,
  policyType: string | null
): number {
  // Simplified percentile calculation
  // In production, this would use historical data
  const basePercentile = score

  // Adjust based on policy type (some types naturally have higher risk)
  const typeAdjustments: Record<string, number> = {
    kasko: -5,
    traffic: 0,
    home: -3,
    health: 5,
    life: 5,
    dask: -10,
    business: 10,
  }

  const adjustment = policyType
    ? typeAdjustments[policyType] ?? 0
    : 0

  return Math.min(99, Math.max(1, basePercentile + adjustment))
}

/**
 * Calculate risk prediction with confidence intervals
 */
export function predictRisk(score: RiskScore): RiskPrediction {
  const uncertainty = 1 - score.confidence.overall
  const spread = uncertainty * 20 // Max ±20 points spread

  return {
    expectedRisk: score.overall,
    intervals: {
      low: Math.max(0, score.overall - spread),
      median: score.overall,
      high: Math.min(100, score.overall + spread),
    },
    probabilities: calculateProbabilities(score.overall, uncertainty),
    trend: 'stable',
    trendConfidence: 0.5, // No historical data for trend
  }
}

/**
 * Calculate probability distribution across risk levels
 */
function calculateProbabilities(
  score: number,
  uncertainty: number
): Record<RiskLevel, number> {
  const levels: RiskLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high']
  const thresholds = [
    RISK_THRESHOLDS.very_low,
    RISK_THRESHOLDS.low,
    RISK_THRESHOLDS.moderate,
    RISK_THRESHOLDS.high,
    RISK_THRESHOLDS.very_high,
  ]

  const probs: Record<RiskLevel, number> = {
    very_low: 0,
    low: 0,
    moderate: 0,
    high: 0,
    very_high: 0,
  }

  // Simple probability distribution based on score proximity
  for (let i = 0; i < levels.length; i++) {
    const levelMid = i === 0
      ? thresholds[0] / 2
      : (thresholds[i] + thresholds[i - 1]) / 2

    const distance = Math.abs(score - levelMid)
    const maxDistance = 50
    const prob = Math.max(0, 1 - distance / maxDistance) * (1 + uncertainty)
    probs[levels[i]] = prob
  }

  // Normalize probabilities
  const total = Object.values(probs).reduce((a, b) => a + b, 0)
  for (const level of levels) {
    probs[level] = total > 0 ? probs[level] / total : 0.2
  }

  return probs
}
