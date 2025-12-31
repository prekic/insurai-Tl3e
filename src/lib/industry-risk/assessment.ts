/**
 * Industry Risk Assessment
 * Business risk assessment and comparison utilities
 */

import type {
  IndustrySector,
  BusinessInfo,
  BusinessRiskAssessment,
  IndustryComparison,
  IndustryRanking,
  IndustryRiskCategory,
} from '@/types/industry-risk'
import { getRiskLevel } from '@/types/risk'
import { getBusinessSize, DEFAULT_INDUSTRY_CATEGORY_WEIGHTS } from '@/types/industry-risk'
import { INDUSTRY_PROFILES, getIndustryProfile } from './profiles'

// =============================================================================
// Business Risk Assessment
// =============================================================================

/**
 * Assess business risk based on business info
 */
export function assessBusinessRisk(business: BusinessInfo): BusinessRiskAssessment {
  const industryProfile = getIndustryProfile(business.sector)

  // Calculate size if not provided
  const size = business.size ?? getBusinessSize(
    business.employeeCount ?? 10,
    business.annualRevenue ?? 5000000
  )

  // Calculate category scores with business-specific adjustments
  const categoryAssessment = calculateCategoryAssessment(business, industryProfile)

  // Calculate overall score
  const overallRiskScore = calculateOverallScore(categoryAssessment)
  const overallRiskLevel = getRiskLevel(overallRiskScore)

  // Calculate premium estimate
  const premiumEstimate = calculatePremiumEstimate(business, industryProfile, overallRiskScore)

  // Generate coverage recommendations
  const coverageRecommendations = generateCoverageRecommendations(business, industryProfile)

  // Generate mitigation plan
  const mitigationPlan = generateMitigationPlan(categoryAssessment, industryProfile)

  // Calculate peer comparison
  const peerComparison = calculatePeerComparison(overallRiskScore, industryProfile)

  return {
    business: { ...business, size },
    industryProfile,
    overallRiskScore,
    overallRiskLevel,
    categoryAssessment,
    premiumEstimate,
    coverageRecommendations,
    mitigationPlan,
    peerComparison,
    assessedAt: Date.now(),
    validUntil: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
  }
}

/**
 * Calculate category-level risk assessment
 */
function calculateCategoryAssessment(
  business: BusinessInfo,
  profile: ReturnType<typeof getIndustryProfile>
): BusinessRiskAssessment['categoryAssessment'] {
  const categories: IndustryRiskCategory[] = [
    'operational', 'property', 'liability', 'employee', 'cyber',
    'environmental', 'product', 'business_interruption', 'regulatory',
    'supply_chain', 'reputation', 'financial'
  ]

  const assessment: BusinessRiskAssessment['categoryAssessment'] = {} as BusinessRiskAssessment['categoryAssessment']

  for (const category of categories) {
    const baseScore = profile.categoryScores[category]?.score ?? 50
    const adjustedScore = adjustCategoryScore(category, baseScore, business)
    const level = getRiskLevel(adjustedScore)

    // Get relevant factors and recommendations
    const factors = getFactorsForCategory(category, business, profile)
    const recommendations = getRecommendationsForCategory(category, adjustedScore, business)

    assessment[category] = {
      score: Math.round(adjustedScore),
      level,
      factors,
      recommendations,
    }
  }

  return assessment
}

/**
 * Adjust category score based on business characteristics
 */
function adjustCategoryScore(
  category: IndustryRiskCategory,
  baseScore: number,
  business: BusinessInfo
): number {
  let adjustment = 0

  switch (category) {
    case 'cyber':
      if (business.processesPersonalData) adjustment += 15
      if (business.hasEcommerce) adjustment += 10
      if (business.cloudDependency && business.cloudDependency > 0.7) adjustment += 10
      if (!business.processesPersonalData && !business.operatesOnline) adjustment -= 20
      break

    case 'employee':
      if (business.hasHighRiskRoles) adjustment += 20
      if (business.employeeCount && business.employeeCount > 100) adjustment += 10
      if (business.foreignWorkers) adjustment += 5
      if (business.contractorDependency && business.contractorDependency > 0.5) adjustment += 10
      break

    case 'property':
      if (business.ownedProperties) adjustment += 10
      if (business.hasInventory) adjustment += 5
      if (business.inventoryValue && business.inventoryValue > 1000000) adjustment += 10
      if (business.locations && business.locations > 3) adjustment += 5
      break

    case 'supply_chain':
      if (business.singleSourceRisk) adjustment += 20
      if (business.internationalSuppliers) adjustment += 10
      if (business.supplierCount && business.supplierCount < 3) adjustment += 15
      break

    case 'operational':
      if (business.yearsInOperation && business.yearsInOperation < 2) adjustment += 15
      if (business.yearsInOperation && business.yearsInOperation > 10) adjustment -= 10
      break

    case 'liability':
      if (business.hasFleet) adjustment += 15
      if (business.fleetSize && business.fleetSize > 10) adjustment += 10
      break

    case 'regulatory':
      if (business.certifications && business.certifications.length > 2) adjustment -= 15
      if (business.lastAuditDate) {
        const lastAudit = new Date(business.lastAuditDate)
        const monthsSinceAudit = (Date.now() - lastAudit.getTime()) / (30 * 24 * 60 * 60 * 1000)
        if (monthsSinceAudit > 12) adjustment += 10
      }
      break
  }

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, baseScore + adjustment))
}

/**
 * Get risk factors for a category
 */
function getFactorsForCategory(
  category: IndustryRiskCategory,
  business: BusinessInfo,
  profile: ReturnType<typeof getIndustryProfile>
): string[] {
  const factors: string[] = []
  const relevantFactors = profile.riskFactors.filter(f => f.category === category)

  for (const factor of relevantFactors) {
    if (factor.baseScore > 40) {
      factors.push(factor.nameTr)
    }
  }

  // Add business-specific factors
  if (category === 'cyber' && business.processesPersonalData) {
    factors.push('Kişisel veri işleme')
  }
  if (category === 'employee' && business.hasHighRiskRoles) {
    factors.push('Yüksek riskli roller mevcut')
  }
  if (category === 'supply_chain' && business.singleSourceRisk) {
    factors.push('Tek kaynak bağımlılığı')
  }

  return factors.slice(0, 5)
}

/**
 * Get recommendations for a category
 */
function getRecommendationsForCategory(
  category: IndustryRiskCategory,
  score: number,
  business: BusinessInfo
): string[] {
  const recommendations: string[] = []

  if (score > 60) {
    switch (category) {
      case 'cyber':
        recommendations.push('Siber güvenlik sigortası değerlendirin')
        if (!business.processesPersonalData) {
          recommendations.push('Veri güvenliği politikası oluşturun')
        }
        break
      case 'employee':
        recommendations.push('İş güvenliği eğitimlerini artırın')
        recommendations.push('İşveren sorumluluk teminatını gözden geçirin')
        break
      case 'property':
        recommendations.push('Mülk sigortası limitlerini değerlendirin')
        recommendations.push('Güvenlik sistemlerini güncelleyin')
        break
      case 'liability':
        recommendations.push('Sorumluluk sigortası kapsamını genişletin')
        break
      case 'regulatory':
        recommendations.push('Uyum denetimi planlayın')
        recommendations.push('Mevzuat değişikliklerini takip edin')
        break
      case 'supply_chain':
        recommendations.push('Alternatif tedarikçileri değerlendirin')
        recommendations.push('Tedarik zinciri sigortası düşünün')
        break
    }
  }

  return recommendations.slice(0, 3)
}

/**
 * Calculate overall risk score from category scores
 */
function calculateOverallScore(
  categoryAssessment: BusinessRiskAssessment['categoryAssessment']
): number {
  let weightedSum = 0
  let totalWeight = 0

  for (const [category, assessment] of Object.entries(categoryAssessment)) {
    const weight = DEFAULT_INDUSTRY_CATEGORY_WEIGHTS[category as IndustryRiskCategory] ?? 0
    weightedSum += assessment.score * weight
    totalWeight += weight
  }

  return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 50)
}

/**
 * Calculate premium estimate
 */
function calculatePremiumEstimate(
  business: BusinessInfo,
  profile: ReturnType<typeof getIndustryProfile>,
  riskScore: number
): BusinessRiskAssessment['premiumEstimate'] {
  const revenue = business.annualRevenue ?? 5000000
  const size = business.size ?? 'small'

  // Base premium per million revenue
  const basePremiumPerMillion = profile.benchmarks.avgPremium

  // Apply modifiers
  const baseMultiplier = profile.premiumModifiers.baseMultiplier
  const sizeMultiplier = profile.premiumModifiers.sizeAdjustments[size]

  // Risk score adjustment (higher risk = higher premium)
  const riskMultiplier = 0.7 + (riskScore / 100) * 0.6 // 0.7 to 1.3

  const effectivePremiumPerMillion = basePremiumPerMillion * baseMultiplier * sizeMultiplier * riskMultiplier
  const annualPremium = Math.round((revenue / 1000000) * effectivePremiumPerMillion)

  const vsIndustryAverage = ((effectivePremiumPerMillion - basePremiumPerMillion) / basePremiumPerMillion) * 100

  return {
    annualPremium,
    perMillionRevenue: Math.round(effectivePremiumPerMillion),
    vsIndustryAverage: Math.round(vsIndustryAverage),
  }
}

/**
 * Generate coverage recommendations
 */
function generateCoverageRecommendations(
  business: BusinessInfo,
  profile: ReturnType<typeof getIndustryProfile>
): BusinessRiskAssessment['coverageRecommendations'] {
  const revenue = business.annualRevenue ?? 5000000
  const recommendations: BusinessRiskAssessment['coverageRecommendations'] = []

  let priority = 1
  for (const coverage of profile.coverageRequirements) {
    // Customize limit based on revenue
    const revenueMultiplier = Math.max(0.5, Math.min(3, revenue / 10000000))
    const customizedLimit = Math.round(coverage.recommendedLimit * revenueMultiplier)

    let rationale = coverage.reasonTr

    // Add business-specific rationale
    if (coverage.coverageType.includes('Cyber') && business.processesPersonalData) {
      rationale += ' - Kişisel veri işleme nedeniyle kritik öneme sahip'
    }
    if (coverage.coverageType.includes('Employer') && business.hasHighRiskRoles) {
      rationale += ' - Yüksek riskli roller nedeniyle önemli'
    }

    recommendations.push({
      coverage,
      customizedLimit,
      priority: priority++,
      rationale,
    })
  }

  // Sort by importance
  return recommendations.sort((a, b) => {
    const importanceOrder = { mandatory: 0, highly_recommended: 1, recommended: 2, optional: 3 }
    return importanceOrder[a.coverage.importance] - importanceOrder[b.coverage.importance]
  })
}

/**
 * Generate mitigation plan
 */
function generateMitigationPlan(
  categoryAssessment: BusinessRiskAssessment['categoryAssessment'],
  profile: ReturnType<typeof getIndustryProfile>
): BusinessRiskAssessment['mitigationPlan'] {
  const plan: BusinessRiskAssessment['mitigationPlan'] = []

  // Find high-risk categories
  const highRiskCategories = Object.entries(categoryAssessment)
    .filter(([, assessment]) => assessment.score > 55)
    .sort(([, a], [, b]) => b.score - a.score)

  for (const [category, assessment] of highRiskCategories.slice(0, 5)) {
    const priority = assessment.score > 75 ? 'critical' : assessment.score > 60 ? 'high' : 'medium'

    // Get relevant risk factor for control measures
    const relevantFactor = profile.riskFactors.find(f => f.category === category)

    if (relevantFactor && relevantFactor.controlMeasuresTr.length > 0) {
      plan.push({
        priority,
        action: relevantFactor.controlMeasures[0],
        actionTr: relevantFactor.controlMeasuresTr[0],
        expectedImpact: Math.round(assessment.score * 0.2), // 20% reduction
        timeline: priority === 'critical' ? '30 gün' : priority === 'high' ? '90 gün' : '180 gün',
      })
    }

    // Add recommendations as actions
    for (const rec of assessment.recommendations.slice(0, 1)) {
      plan.push({
        priority: 'medium' as const,
        action: rec,
        actionTr: rec,
        expectedImpact: 5,
        timeline: '90 gün',
      })
    }
  }

  return plan.slice(0, 8)
}

/**
 * Calculate peer comparison
 */
function calculatePeerComparison(
  riskScore: number,
  profile: ReturnType<typeof getIndustryProfile>
): BusinessRiskAssessment['peerComparison'] {
  // Estimate percentile based on industry average
  const industryAvg = profile.overallRiskScore
  const diff = riskScore - industryAvg

  // Assume normal distribution with std dev of 15
  const zScore = diff / 15
  const percentile = Math.round(50 + (zScore * 34)) // Rough approximation
  const clampedPercentile = Math.max(1, Math.min(99, percentile))

  const keyDifferences: string[] = []
  if (riskScore > industryAvg + 10) {
    keyDifferences.push('Sektör ortalamasının üzerinde risk')
  } else if (riskScore < industryAvg - 10) {
    keyDifferences.push('Sektör ortalamasının altında risk')
  }

  return {
    percentile: clampedPercentile,
    betterThan: 100 - clampedPercentile,
    keyDifferences,
  }
}

// =============================================================================
// Industry Comparison
// =============================================================================

/**
 * Compare two industries
 */
export function compareIndustries(
  industry1: IndustrySector,
  industry2: IndustrySector
): IndustryComparison {
  const profile1 = getIndustryProfile(industry1)
  const profile2 = getIndustryProfile(industry2)

  // Risk differences
  const riskDifference: IndustryComparison['riskDifference'] = {
    overall: profile2.overallRiskScore - profile1.overallRiskScore,
    byCategory: {} as Record<IndustryRiskCategory, number>,
  }

  const categories: IndustryRiskCategory[] = Object.keys(profile1.categoryScores) as IndustryRiskCategory[]
  for (const category of categories) {
    const score1 = profile1.categoryScores[category]?.score ?? 50
    const score2 = profile2.categoryScores[category]?.score ?? 50
    riskDifference.byCategory[category] = score2 - score1
  }

  // Premium difference
  const premiumDifference = ((profile2.premiumModifiers.baseMultiplier - profile1.premiumModifiers.baseMultiplier) /
    profile1.premiumModifiers.baseMultiplier) * 100

  // Coverage differences
  const coverageDifferences: IndustryComparison['coverageDifferences'] = []
  const allCoverages = new Set([
    ...profile1.coverageRequirements.map(c => c.coverageType),
    ...profile2.coverageRequirements.map(c => c.coverageType),
  ])

  for (const coverage of allCoverages) {
    const cov1 = profile1.coverageRequirements.find(c => c.coverageType === coverage)
    const cov2 = profile2.coverageRequirements.find(c => c.coverageType === coverage)

    if (cov1?.importance !== cov2?.importance) {
      coverageDifferences.push({
        coverage,
        industry1Importance: cov1?.importance ?? 'not_required',
        industry2Importance: cov2?.importance ?? 'not_required',
      })
    }
  }

  // Generate insights
  const insights: IndustryComparison['insights'] = []

  if (riskDifference.overall > 15) {
    insights.push({
      type: 'advantage',
      message: `${profile1.name} has ${Math.abs(riskDifference.overall)} points lower risk`,
      messageTr: `${profile1.nameTr} ${Math.abs(riskDifference.overall)} puan daha düşük risk`,
    })
  } else if (riskDifference.overall < -15) {
    insights.push({
      type: 'disadvantage',
      message: `${profile1.name} has ${Math.abs(riskDifference.overall)} points higher risk`,
      messageTr: `${profile1.nameTr} ${Math.abs(riskDifference.overall)} puan daha yüksek risk`,
    })
  }

  if (Math.abs(premiumDifference) > 20) {
    insights.push({
      type: premiumDifference > 0 ? 'advantage' : 'disadvantage',
      message: `${Math.abs(Math.round(premiumDifference))}% premium difference`,
      messageTr: `%${Math.abs(Math.round(premiumDifference))} prim farkı`,
    })
  }

  return {
    industry1,
    industry2,
    riskDifference,
    premiumDifference: Math.round(premiumDifference),
    coverageDifferences,
    insights,
  }
}

/**
 * Get industry rankings by metric
 */
export function getIndustryRankings(
  metric: 'risk' | 'premium' | 'claims' | 'growth'
): IndustryRanking {
  const sectors = Object.keys(INDUSTRY_PROFILES) as IndustrySector[]

  const values = sectors.map(sector => {
    const profile = INDUSTRY_PROFILES[sector]
    let value: number

    switch (metric) {
      case 'risk':
        value = profile.overallRiskScore
        break
      case 'premium':
        value = profile.benchmarks.avgPremium
        break
      case 'claims':
        value = profile.benchmarks.avgClaimsRatio * 100
        break
      case 'growth':
        value = profile.trends.premiumTrend === 'increasing' ? 1 : profile.trends.premiumTrend === 'stable' ? 0 : -1
        break
      default:
        value = 0
    }

    return { sector, value }
  })

  // Sort (descending for risk/claims, ascending for premium)
  const ascending = metric === 'premium'
  values.sort((a, b) => ascending ? a.value - b.value : b.value - a.value)

  return {
    metric,
    rankings: values.map((item, index) => ({
      rank: index + 1,
      sector: item.sector,
      value: Math.round(item.value * 100) / 100,
      trend: INDUSTRY_PROFILES[item.sector].trends.riskTrend === 'increasing' ? 'up' :
             INDUSTRY_PROFILES[item.sector].trends.riskTrend === 'decreasing' ? 'down' : 'stable',
    })),
  }
}

/**
 * Find similar industries by risk profile
 */
export function findSimilarIndustries(
  sector: IndustrySector,
  count: number = 3
): { sector: IndustrySector; similarity: number }[] {
  const baseProfile = getIndustryProfile(sector)
  const sectors = Object.keys(INDUSTRY_PROFILES) as IndustrySector[]

  const similarities = sectors
    .filter(s => s !== sector)
    .map(s => {
      const profile = INDUSTRY_PROFILES[s]

      // Calculate similarity based on risk scores
      const riskDiff = Math.abs(profile.overallRiskScore - baseProfile.overallRiskScore)
      const premiumDiff = Math.abs(profile.premiumModifiers.baseMultiplier - baseProfile.premiumModifiers.baseMultiplier)

      const similarity = 100 - (riskDiff * 0.5 + premiumDiff * 20)

      return { sector: s, similarity: Math.max(0, Math.round(similarity)) }
    })
    .sort((a, b) => b.similarity - a.similarity)

  return similarities.slice(0, count)
}
