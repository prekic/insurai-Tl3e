/**
 * Regional Comparison Utilities
 * Compare insurance metrics across Turkish regions
 */

import type { PolicyType } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type {
  RegionalComparison,
  RegionalInsight,
  LocationAnalysis,
  LocationRecommendation,
  NearbyComparison,
  Province,
  NationalStatistics,
  RegionalRanking,
} from '@/types/regional-benchmark'
import {
  PROVINCES,
  REGIONAL_RISK_PROFILES,
  REGIONAL_INSURANCE_STATS,
  getRegionalPremiumBenchmarks,
  calculateRegionalRiskScore,
  getProvincesByRegion,
} from './data'
import { detectRegionFromAddress } from '@/lib/market-data/region-detector'

// =============================================================================
// Regional Comparison
// =============================================================================

/**
 * Compare two regions for a specific policy type
 */
export function compareRegions(
  sourceRegion: TurkishRegion,
  targetRegion: TurkishRegion,
  policyType: PolicyType
): RegionalComparison {
  const sourceBenchmarks = getRegionalPremiumBenchmarks(policyType)
  const sourceStats = REGIONAL_INSURANCE_STATS[sourceRegion]
  const targetStats = REGIONAL_INSURANCE_STATS[targetRegion]
  const sourceRisk = calculateRegionalRiskScore(sourceRegion)
  const targetRisk = calculateRegionalRiskScore(targetRegion)

  const sourcePremium = sourceStats.policyDistribution[policyType].avgPremium
  const targetPremium = targetStats.policyDistribution[policyType].avgPremium
  const premiumDiff = targetPremium - sourcePremium

  // Determine primary risk difference
  const sourceRiskProfile = REGIONAL_RISK_PROFILES[sourceRegion]
  const targetRiskProfile = REGIONAL_RISK_PROFILES[targetRegion]
  let primaryRiskDifference = 'similar'

  if (sourceRiskProfile.earthquake.zone !== targetRiskProfile.earthquake.zone) {
    primaryRiskDifference = `Earthquake zone ${sourceRiskProfile.earthquake.zone} vs ${targetRiskProfile.earthquake.zone}`
  } else if (Math.abs(sourceRiskProfile.crime.theftRate - targetRiskProfile.crime.theftRate) > 50) {
    primaryRiskDifference = 'Crime rate difference'
  } else if (Math.abs(sourceRiskProfile.flood.annualFrequency - targetRiskProfile.flood.annualFrequency) > 10) {
    primaryRiskDifference = 'Flood risk difference'
  }

  // Generate insights
  const insights: RegionalInsight[] = []

  // Premium insight
  if (premiumDiff < 0) {
    insights.push({
      type: 'advantage',
      category: 'premium',
      message: `${targetRegion} has ${Math.abs(Math.round((premiumDiff / sourcePremium) * 100))}% lower premiums`,
      messageTr: `${getRegionNameTr(targetRegion)} %${Math.abs(Math.round((premiumDiff / sourcePremium) * 100))} daha düşük prim`,
      impact: Math.abs(premiumDiff) > sourcePremium * 0.15 ? 'high' : 'medium',
    })
  } else if (premiumDiff > 0) {
    insights.push({
      type: 'disadvantage',
      category: 'premium',
      message: `${targetRegion} has ${Math.round((premiumDiff / sourcePremium) * 100)}% higher premiums`,
      messageTr: `${getRegionNameTr(targetRegion)} %${Math.round((premiumDiff / sourcePremium) * 100)} daha yüksek prim`,
      impact: premiumDiff > sourcePremium * 0.15 ? 'high' : 'medium',
    })
  }

  // Risk insight
  if (targetRisk < sourceRisk - 10) {
    insights.push({
      type: 'advantage',
      category: 'risk',
      message: `Lower overall risk profile in ${targetRegion}`,
      messageTr: `${getRegionNameTr(targetRegion)} bölgesinde daha düşük risk profili`,
      impact: 'medium',
    })
  } else if (targetRisk > sourceRisk + 10) {
    insights.push({
      type: 'disadvantage',
      category: 'risk',
      message: `Higher risk profile in ${targetRegion}`,
      messageTr: `${getRegionNameTr(targetRegion)} bölgesinde daha yüksek risk profili`,
      impact: 'medium',
    })
  }

  // Market competition insight
  if (targetStats.marketPenetration > sourceStats.marketPenetration + 0.05) {
    insights.push({
      type: 'neutral',
      category: 'market',
      message: `More competitive insurance market in ${targetRegion}`,
      messageTr: `${getRegionNameTr(targetRegion)} bölgesinde daha rekabetçi sigorta pazarı`,
      impact: 'low',
    })
  }

  return {
    sourceRegion,
    targetRegion,
    policyType,
    premiumDifference: {
      amount: premiumDiff,
      percentage: (premiumDiff / sourcePremium) * 100,
      sourceRank: sourceBenchmarks[sourceRegion].vsNational.ranking,
      targetRank: sourceBenchmarks[targetRegion].vsNational.ranking,
    },
    riskComparison: {
      sourceRiskScore: sourceRisk,
      targetRiskScore: targetRisk,
      primaryRiskDifference,
    },
    marketComparison: {
      sourcePenetration: sourceStats.marketPenetration,
      targetPenetration: targetStats.marketPenetration,
      sourceCompetition: Object.keys(sourceStats.policyDistribution).length,
      targetCompetition: Object.keys(targetStats.policyDistribution).length,
    },
    insights,
  }
}

/**
 * Compare all regions against a source region
 */
export function compareAllRegions(
  sourceRegion: TurkishRegion,
  policyType: PolicyType
): RegionalComparison[] {
  const allRegions: TurkishRegion[] = [
    'marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu'
  ]

  return allRegions
    .filter(r => r !== sourceRegion)
    .map(targetRegion => compareRegions(sourceRegion, targetRegion, policyType))
    .sort((a, b) => a.premiumDifference.amount - b.premiumDifference.amount)
}

// =============================================================================
// Location Analysis
// =============================================================================

/**
 * Analyze location for insurance purposes
 */
export function analyzeLocation(address: string): LocationAnalysis {
  const region = detectRegionFromAddress(address)
  const riskProfile = REGIONAL_RISK_PROFILES[region]
  const insuranceStats = REGIONAL_INSURANCE_STATS[region]
  const riskScore = calculateRegionalRiskScore(region)

  // Find matching province
  const provinces = getProvincesByRegion(region)
  let matchedProvince = provinces[0]
  const addressLower = address.toLowerCase()

  for (const province of provinces) {
    if (addressLower.includes(province.name.toLowerCase()) ||
        addressLower.includes(province.nameTr.toLowerCase())) {
      matchedProvince = province
      break
    }
  }

  // Calculate confidence
  let confidence = 0.5
  if (matchedProvince && (
    addressLower.includes(matchedProvince.name.toLowerCase()) ||
    addressLower.includes(matchedProvince.nameTr.toLowerCase())
  )) {
    confidence = 0.9
  } else if (address.length > 20) {
    confidence = 0.7
  }

  // Get all regional risk scores for ranking
  const allRegions: TurkishRegion[] = ['marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu']
  const riskRankings = allRegions
    .map(r => ({ region: r, score: calculateRegionalRiskScore(r) }))
    .sort((a, b) => b.score - a.score)
  const riskRanking = riskRankings.findIndex(r => r.region === region) + 1

  // Generate recommendations
  const recommendations = generateLocationRecommendations(region, riskProfile, riskScore)

  // Get premium benchmarks for all policy types
  const policyTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']
  const premiumBenchmarks: Record<PolicyType, ReturnType<typeof getRegionalPremiumBenchmarks>[TurkishRegion]> = {} as Record<PolicyType, ReturnType<typeof getRegionalPremiumBenchmarks>[TurkishRegion]>

  for (const policyType of policyTypes) {
    premiumBenchmarks[policyType] = getRegionalPremiumBenchmarks(policyType)[region]
  }

  return {
    province: matchedProvince,
    region,
    confidence,
    riskProfile,
    overallRiskScore: riskScore,
    riskRanking,
    insuranceStats,
    premiumBenchmarks,
    recommendations,
  }
}

/**
 * Generate location-based recommendations
 */
function generateLocationRecommendations(
  _region: TurkishRegion,
  riskProfile: typeof REGIONAL_RISK_PROFILES[TurkishRegion],
  _riskScore: number
): LocationRecommendation[] {
  const recommendations: LocationRecommendation[] = []

  // Earthquake risk recommendations
  if (riskProfile.earthquake.zone <= 2) {
    recommendations.push({
      type: 'coverage',
      priority: 'high',
      title: 'DASK Coverage Essential',
      titleTr: 'DASK Teminatı Zorunlu',
      description: `Your region is in earthquake zone ${riskProfile.earthquake.zone}. Ensure adequate DASK coverage.`,
      descriptionTr: `Bölgeniz deprem bölgesi ${riskProfile.earthquake.zone}. Yeterli DASK teminatı sağlayın.`,
      estimatedImpact: {
        riskReduction: 40,
      },
    })
  }

  // Flood risk recommendations
  if (riskProfile.flood.level === 'high' || riskProfile.flood.level === 'very_high') {
    recommendations.push({
      type: 'coverage',
      priority: 'high',
      title: 'Flood Coverage Recommended',
      titleTr: 'Sel Teminatı Önerilir',
      description: 'High flood risk in your area. Consider adding flood coverage to your home insurance.',
      descriptionTr: 'Bölgenizde sel riski yüksek. Konut sigortanıza sel teminatı eklemeyi düşünün.',
      estimatedImpact: {
        premiumChange: 15,
        riskReduction: 25,
      },
    })
  }

  // Crime risk recommendations
  if (riskProfile.crime.overallLevel === 'high' || riskProfile.crime.overallLevel === 'very_high') {
    recommendations.push({
      type: 'risk_mitigation',
      priority: 'medium',
      title: 'Security Measures',
      titleTr: 'Güvenlik Önlemleri',
      description: 'Higher crime rates in your area. Security systems may reduce premiums.',
      descriptionTr: 'Bölgenizde suç oranı yüksek. Güvenlik sistemleri primleri düşürebilir.',
      estimatedImpact: {
        premiumChange: -10,
        riskReduction: 20,
      },
    })
  }

  // Traffic risk recommendations
  if (riskProfile.traffic.congestionLevel === 'high' || riskProfile.traffic.congestionLevel === 'very_high') {
    recommendations.push({
      type: 'coverage',
      priority: 'medium',
      title: 'Comprehensive Auto Coverage',
      titleTr: 'Kapsamlı Kasko Teminatı',
      description: 'High traffic density. Consider full kasko with roadside assistance.',
      descriptionTr: 'Yoğun trafik. Yol yardımı dahil tam kasko düşünün.',
    })
  }

  // Healthcare access recommendations
  if (riskProfile.health.healthcareAccess === 'high' || riskProfile.health.healthcareAccess === 'very_high') {
    recommendations.push({
      type: 'coverage',
      priority: 'medium',
      title: 'Enhanced Health Coverage',
      titleTr: 'Gelişmiş Sağlık Teminatı',
      description: 'Limited healthcare access. Consider comprehensive health insurance with air ambulance.',
      descriptionTr: 'Sınırlı sağlık erişimi. Hava ambulansı dahil kapsamlı sağlık sigortası düşünün.',
    })
  }

  return recommendations
}

// =============================================================================
// Nearby Comparison
// =============================================================================

/**
 * Find nearby provinces and compare insurance costs
 */
export function compareNearbyProvinces(
  province: Province,
  policyType: PolicyType
): NearbyComparison {
  const allProvinces = Object.values(PROVINCES)
  const sourceStats = REGIONAL_INSURANCE_STATS[province.region]
  const sourcePremium = sourceStats.policyDistribution[policyType].avgPremium
  const sourceRisk = calculateRegionalRiskScore(province.region)

  // Calculate distances and filter nearby
  const nearbyWithDistances = allProvinces
    .filter(p => p.code !== province.code)
    .map(p => ({
      province: p,
      distance: calculateDistance(
        province.coordinates.lat,
        province.coordinates.lng,
        p.coordinates.lat,
        p.coordinates.lng
      ),
    }))
    .filter(p => p.distance <= 300) // Within 300km
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5) // Top 5 nearest

  const nearbyProvinces = nearbyWithDistances.map(({ province: nearbyProvince, distance }) => {
    const nearbyStats = REGIONAL_INSURANCE_STATS[nearbyProvince.region]
    const nearbyPremium = nearbyStats.policyDistribution[policyType].avgPremium
    const nearbyRisk = calculateRegionalRiskScore(nearbyProvince.region)

    // Calculate premium differences for all policy types
    const premiumDifference: Record<PolicyType, number> = {} as Record<PolicyType, number>
    const policyTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']

    for (const pt of policyTypes) {
      const srcPrem = sourceStats.policyDistribution[pt].avgPremium
      const nearPrem = nearbyStats.policyDistribution[pt].avgPremium
      premiumDifference[pt] = nearPrem - srcPrem
    }

    // Determine advantages and disadvantages
    const advantages: string[] = []
    const disadvantages: string[] = []

    if (nearbyPremium < sourcePremium * 0.9) {
      advantages.push(`${Math.round((1 - nearbyPremium / sourcePremium) * 100)}% lower premiums`)
    }
    if (nearbyRisk < sourceRisk - 10) {
      advantages.push('Lower risk profile')
    }
    if (nearbyStats.marketPenetration > sourceStats.marketPenetration) {
      advantages.push('More competitive market')
    }

    if (nearbyPremium > sourcePremium * 1.1) {
      disadvantages.push(`${Math.round((nearbyPremium / sourcePremium - 1) * 100)}% higher premiums`)
    }
    if (nearbyRisk > sourceRisk + 10) {
      disadvantages.push('Higher risk profile')
    }

    return {
      province: nearbyProvince,
      distance: Math.round(distance),
      premiumDifference,
      riskDifference: nearbyRisk - sourceRisk,
      advantages,
      disadvantages,
    }
  })

  return {
    currentProvince: province,
    nearbyProvinces,
  }
}

// =============================================================================
// National Statistics
// =============================================================================

/**
 * Get national aggregate statistics
 */
export function getNationalStatistics(): NationalStatistics {
  const regions: TurkishRegion[] = ['marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu']

  let totalPolicies = 0
  let totalPremiumVolume = 0

  const byRegion: NationalStatistics['byRegion'] = {} as NationalStatistics['byRegion']
  const byPolicyType: NationalStatistics['byPolicyType'] = {} as NationalStatistics['byPolicyType']

  // Initialize policy type aggregates
  const policyTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']
  for (const pt of policyTypes) {
    byPolicyType[pt] = { policyCount: 0, premiumVolume: 0, avgPremium: 0, growth: 0 }
  }

  // Aggregate by region
  for (const region of regions) {
    const stats = REGIONAL_INSURANCE_STATS[region]
    totalPolicies += stats.totalPolicies
    totalPremiumVolume += stats.totalPremiumVolume

    byRegion[region] = {
      policyCount: stats.totalPolicies,
      premiumVolume: stats.totalPremiumVolume,
      marketShare: 0, // Calculate after totals
      penetration: stats.marketPenetration,
    }

    // Aggregate by policy type
    for (const pt of policyTypes) {
      const policyData = stats.policyDistribution[pt]
      byPolicyType[pt].policyCount += policyData.count
      byPolicyType[pt].premiumVolume += policyData.premiumVolume
    }
  }

  // Calculate market shares
  for (const region of regions) {
    byRegion[region].marketShare = byRegion[region].premiumVolume / totalPremiumVolume
  }

  // Calculate averages for policy types
  for (const pt of policyTypes) {
    if (byPolicyType[pt].policyCount > 0) {
      byPolicyType[pt].avgPremium = byPolicyType[pt].premiumVolume / byPolicyType[pt].policyCount
    }
    // Use marmara's growth as proxy for national (largest market)
    byPolicyType[pt].growth = REGIONAL_INSURANCE_STATS.marmara.growth.yoyPremiumGrowth
  }

  // Estimate population for per capita calculation (~85M)
  const totalPopulation = 85000000
  const avgPremiumPerCapita = totalPremiumVolume / totalPopulation

  return {
    totalPolicies,
    totalPremiumVolume,
    marketPenetration: totalPolicies / totalPopulation,
    avgPremiumPerCapita,
    byRegion,
    byPolicyType,
    trends: {
      yoyGrowth: 0.42, // National average
      projectedGrowth: 0.35,
      marketConcentration: 0.18, // HHI estimate
    },
    dataDate: '2024-12-01',
    source: 'TSB/SEDDK',
  }
}

/**
 * Get regional rankings for a metric
 */
export function getRegionalRankings(
  policyType: PolicyType,
  metric: 'premium' | 'claims' | 'penetration' | 'risk' | 'value'
): RegionalRanking {
  const regions: TurkishRegion[] = ['marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu']

  // Calculate values and national average
  const values = regions.map(region => {
    const stats = REGIONAL_INSURANCE_STATS[region]
    let value: number

    switch (metric) {
      case 'premium':
        value = stats.policyDistribution[policyType].avgPremium
        break
      case 'claims':
        value = stats.claimsData.claimsRatio
        break
      case 'penetration':
        value = stats.marketPenetration
        break
      case 'risk':
        value = calculateRegionalRiskScore(region)
        break
      case 'value': {
        // Value = coverage / premium ratio (lower premium with same coverage = better value)
        const avgPremium = stats.policyDistribution[policyType].avgPremium
        const penetration = stats.marketPenetration
        value = penetration / (avgPremium / 10000) // Normalize
        break
      }
      default:
        value = 0
    }

    return { region, value }
  })

  const avgValue = values.reduce((sum, v) => sum + v.value, 0) / values.length

  // Sort (ascending for premium/claims/risk, descending for penetration/value)
  const ascending = ['premium', 'claims', 'risk'].includes(metric)
  values.sort((a, b) => ascending ? a.value - b.value : b.value - a.value)

  const rankings = values.map((item, index) => ({
    rank: index + 1,
    region: item.region,
    value: Math.round(item.value * 100) / 100,
    vsAverage: Math.round(((item.value - avgValue) / avgValue) * 100),
  }))

  // Generate insights
  const insights: string[] = []
  const best = rankings[0]
  const worst = rankings[rankings.length - 1]

  if (metric === 'premium') {
    insights.push(`${getRegionNameTr(best.region)} has the lowest ${policyType} premiums`)
    insights.push(`${getRegionNameTr(worst.region)} has ${Math.abs(worst.vsAverage)}% above average premiums`)
  } else if (metric === 'risk') {
    insights.push(`${getRegionNameTr(best.region)} is the safest region`)
    insights.push(`${getRegionNameTr(worst.region)} has highest risk exposure`)
  }

  return {
    policyType,
    metric,
    rankings,
    insights,
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Get Turkish name for region
 */
function getRegionNameTr(region: TurkishRegion): string {
  const names: Record<TurkishRegion, string> = {
    marmara: 'Marmara',
    ege: 'Ege',
    akdeniz: 'Akdeniz',
    ic_anadolu: 'İç Anadolu',
    karadeniz: 'Karadeniz',
    dogu_anadolu: 'Doğu Anadolu',
    guneydogu: 'Güneydoğu Anadolu',
  }
  return names[region]
}
