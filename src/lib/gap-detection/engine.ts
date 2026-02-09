/**
 * Gap Detection Engine
 * Comprehensive policy gap analysis
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type {
  DetectedGap,
  ComprehensiveGapAnalysis,
  PrioritizedGap,
  GapRecommendation,
  GapDetectionConfig,
  GapCategory,
  GapSeverity,
} from '@/types/gap'
import {
  DEFAULT_GAP_CONFIG,
  GAP_SEVERITY_CONFIG,
  calculateGapPriority,
  getUrgencyLevel,
} from '@/types/gap'
import {
  analyzeCoverageGaps,
  analyzeLimitGaps,
  analyzeDeductibleGaps,
  analyzeExclusionGaps,
  analyzeTemporalGaps,
  analyzeComplianceGaps,
} from './analyzers'

/**
 * Perform comprehensive gap analysis on a policy (async, DB-backed benchmarks)
 */
export async function analyzeGapsComprehensive(
  policy: AnalyzedPolicy,
  options: {
    config?: Partial<GapDetectionConfig>
    region?: TurkishRegion
    includePortfolio?: boolean
  } = {}
): Promise<ComprehensiveGapAnalysis> {
  const config = { ...DEFAULT_GAP_CONFIG, ...options.config }
  const region = options.region ?? detectRegionFromAddress(policy.location)

  // Run all analyzers (coverage analyzer is async, others are sync)
  const coverageGaps = await analyzeCoverageGaps(policy, config, region)
  const allGaps: DetectedGap[] = [
    ...coverageGaps,
    ...analyzeLimitGaps(policy, config, region),
    ...analyzeDeductibleGaps(policy, config, region),
    ...analyzeExclusionGaps(policy, config, region),
    ...analyzeTemporalGaps(policy, config, region),
    ...analyzeComplianceGaps(policy, config, region),
  ]

  // Deduplicate gaps (same coverage, similar issue)
  const gaps = deduplicateGaps(allGaps)

  // Categorize gaps
  const gapsByCategory = categorizeGaps(gaps)
  const gapsBySeverity = groupBySeverity(gaps)

  // Calculate gap counts
  const gapCount = {
    total: gaps.length,
    critical: gapsBySeverity.critical?.length ?? 0,
    high: gapsBySeverity.high?.length ?? 0,
    medium: gapsBySeverity.medium?.length ?? 0,
    low: gapsBySeverity.low?.length ?? 0,
    info: gapsBySeverity.info?.length ?? 0,
  }

  // Calculate overall score
  const overallScore = calculateOverallGapScore(gaps, config)

  // Calculate financial summary
  const financialSummary = calculateFinancialSummary(gaps)

  // Prioritize gaps
  const prioritizedGaps = prioritizeGaps(gaps)

  // Generate recommendations
  const topRecommendations = generateRecommendations(gaps, prioritizedGaps)

  return {
    overallScore,
    gapCount,
    gaps,
    gapsByCategory,
    gapsBySeverity,
    financialSummary,
    prioritizedGaps,
    topRecommendations,
    analyzedAt: new Date().toISOString(),
    policyId: policy.id,
    policyType: policy.type,
    region,
    confidence: calculateOverallConfidence(gaps),
  }
}

/**
 * Get quick gap summary for dashboard display
 */
export async function getQuickGapSummary(policy: AnalyzedPolicy): Promise<{
  score: number
  criticalCount: number
  topIssue: string | null
  recommendation: string | null
}> {
  const analysis = await analyzeGapsComprehensive(policy)

  return {
    score: analysis.overallScore,
    criticalCount: analysis.gapCount.critical + analysis.gapCount.high,
    topIssue: analysis.prioritizedGaps[0]?.gap.titleTr ?? null,
    recommendation: analysis.topRecommendations[0]?.titleTr ?? null,
  }
}

/**
 * Detect region from address
 */
function detectRegionFromAddress(address: string | undefined): TurkishRegion {
  if (!address) return 'marmara'

  const addressLower = address.toLowerCase()

  const regionPatterns: [RegExp, TurkishRegion][] = [
    [/istanbul|kocaeli|bursa|edirne|tekirdağ|kırklareli|çanakkale|balıkesir|yalova|sakarya|bilecik/i, 'marmara'],
    [/izmir|aydın|muğla|denizli|manisa|afyon|kütahya|uşak/i, 'ege'],
    [/antalya|mersin|adana|hatay|osmaniye|kahramanmaraş|gaziantep|kilis|isparta|burdur/i, 'akdeniz'],
    [/trabzon|rize|artvin|giresun|ordu|samsun|sinop|kastamonu|bartın|zonguldak|karabük|bolu|düzce/i, 'karadeniz'],
    [/ankara|eskişehir|konya|aksaray|karaman|niğde|nevşehir|kayseri|kırşehir|kırıkkale|çankırı|yozgat|sivas/i, 'ic_anadolu'],
    [/erzurum|erzincan|kars|ardahan|iğdır|ağrı|van|hakkari|muş|bitlis|bingöl|tunceli|elazığ|malatya/i, 'dogu_anadolu'],
    [/diyarbakır|şanlıurfa|mardin|batman|siirt|şırnak/i, 'guneydogu'],
  ]

  for (const [pattern, region] of regionPatterns) {
    if (pattern.test(addressLower)) {
      return region
    }
  }

  return 'marmara' // Default to Marmara (most populous)
}

/**
 * Deduplicate gaps that refer to the same issue
 */
function deduplicateGaps(gaps: DetectedGap[]): DetectedGap[] {
  const seen = new Map<string, DetectedGap>()

  for (const gap of gaps) {
    const key = `${gap.category}-${gap.affectedCoverage || 'general'}-${gap.subCategory}`

    const existing = seen.get(key)
    if (!existing || gap.severityScore > existing.severityScore) {
      seen.set(key, gap)
    }
  }

  return Array.from(seen.values())
}

/**
 * Categorize gaps by category
 */
function categorizeGaps(gaps: DetectedGap[]): Record<GapCategory, DetectedGap[]> {
  const categories: Record<GapCategory, DetectedGap[]> = {
    coverage: [],
    limit: [],
    deductible: [],
    exclusion: [],
    temporal: [],
    compliance: [],
    portfolio: [],
  }

  for (const gap of gaps) {
    categories[gap.category].push(gap)
  }

  return categories
}

/**
 * Group gaps by severity
 */
function groupBySeverity(gaps: DetectedGap[]): Record<GapSeverity, DetectedGap[]> {
  const groups: Record<GapSeverity, DetectedGap[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  }

  for (const gap of gaps) {
    groups[gap.severity].push(gap)
  }

  return groups
}

/**
 * Calculate overall gap score (0-100, higher = more gaps)
 */
function calculateOverallGapScore(gaps: DetectedGap[], config: GapDetectionConfig): number {
  if (gaps.length === 0) return 0

  let totalScore = 0
  let totalWeight = 0

  for (const gap of gaps) {
    const categoryWeight = config.categoryWeights[gap.category] ?? 1
    const severityWeight = GAP_SEVERITY_CONFIG[gap.severity].weight
    const gapWeight = categoryWeight * (severityWeight / 100)

    totalScore += gap.severityScore * gapWeight
    totalWeight += gapWeight
  }

  // Normalize score considering gap count
  const countFactor = Math.min(1, gaps.length / 10) // Max impact at 10+ gaps
  const baseScore = totalWeight > 0 ? totalScore / totalWeight : 0

  return Math.min(100, Math.round(baseScore * (0.7 + 0.3 * countFactor)))
}

/**
 * Calculate financial summary
 */
function calculateFinancialSummary(gaps: DetectedGap[]): ComprehensiveGapAnalysis['financialSummary'] {
  let totalPotentialLoss = 0
  let totalExpectedLoss = 0
  let estimatedRemediationCost = 0

  for (const gap of gaps) {
    totalPotentialLoss += gap.financialImpact.potentialLoss
    totalExpectedLoss += gap.financialImpact.expectedLoss
    estimatedRemediationCost += gap.remediation.estimatedCost ?? 0
  }

  const costBenefitRatio = estimatedRemediationCost > 0
    ? totalExpectedLoss / estimatedRemediationCost
    : 0

  return {
    totalPotentialLoss,
    totalExpectedLoss,
    estimatedRemediationCost,
    costBenefitRatio,
  }
}

/**
 * Prioritize gaps
 */
function prioritizeGaps(gaps: DetectedGap[]): PrioritizedGap[] {
  const prioritized = gaps.map((gap) => {
    const priorityScore = calculateGapPriority(gap)
    const urgencyLevel = getUrgencyLevel(priorityScore)

    return {
      gap,
      priorityScore,
      priorityRank: 0, // Will be set after sorting
      urgencyLevel,
      reasoning: generatePriorityReasoning(gap, priorityScore),
    }
  })

  // Sort by priority score
  prioritized.sort((a, b) => b.priorityScore - a.priorityScore)

  // Assign ranks
  prioritized.forEach((p, i) => {
    p.priorityRank = i + 1
  })

  return prioritized
}

/**
 * Generate priority reasoning
 */
function generatePriorityReasoning(gap: DetectedGap, score: number): string {
  const parts: string[] = []

  if (gap.severity === 'critical') {
    parts.push('Critical severity requires immediate attention')
  } else if (gap.severity === 'high') {
    parts.push('High severity issue')
  }

  if (gap.financialImpact.expectedLoss > 10000) {
    parts.push(`significant financial exposure (₺${gap.financialImpact.expectedLoss.toLocaleString('tr-TR')})`)
  }

  if (gap.remediation.difficulty === 'easy') {
    parts.push('easy to resolve')
  }

  if (gap.category === 'compliance') {
    parts.push('regulatory compliance concern')
  }

  return parts.join(', ') || `Priority score: ${Math.round(score)}`
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  gaps: DetectedGap[],
  prioritizedGaps: PrioritizedGap[]
): GapRecommendation[] {
  const recommendations: GapRecommendation[] = []
  let recIndex = 0

  // Group related gaps
  const coverageGaps = gaps.filter(g => g.category === 'coverage')
  const limitGaps = gaps.filter(g => g.category === 'limit')
  const complianceGaps = gaps.filter(g => g.category === 'compliance')

  // Coverage bundle recommendation
  if (coverageGaps.length > 2) {
    const totalCost = coverageGaps.reduce((sum, g) => sum + (g.remediation.estimatedCost ?? 0), 0)
    const totalSavings = coverageGaps.reduce((sum, g) => sum + g.financialImpact.expectedLoss, 0)

    recommendations.push({
      id: `rec-${recIndex++}`,
      title: 'Add Missing Coverages Bundle',
      titleTr: 'Eksik Teminat Paketini Ekleyin',
      description: `Add ${coverageGaps.length} missing coverages to eliminate major protection gaps.`,
      descriptionTr: `Büyük koruma boşluklarını ortadan kaldırmak için ${coverageGaps.length} eksik teminatı ekleyin.`,
      addressesGaps: coverageGaps.map(g => g.id),
      impactScore: Math.min(100, coverageGaps.length * 15),
      gapsResolved: coverageGaps.length,
      riskReduction: Math.min(60, coverageGaps.length * 10),
      estimatedCost: totalCost,
      expectedSavings: totalSavings,
      roi: totalCost > 0 ? (totalSavings - totalCost) / totalCost : 0,
      difficulty: 'moderate',
      timeframe: '1-2 weeks',
      priority: 1,
    })
  }

  // Limit increase recommendation
  if (limitGaps.length > 1) {
    const totalCost = limitGaps.reduce((sum, g) => sum + (g.remediation.estimatedCost ?? 0), 0)
    const totalSavings = limitGaps.reduce((sum, g) => sum + g.financialImpact.expectedLoss, 0)

    recommendations.push({
      id: `rec-${recIndex++}`,
      title: 'Increase Coverage Limits',
      titleTr: 'Teminat Limitlerini Artırın',
      description: `Increase limits on ${limitGaps.length} underinsured coverages to market average.`,
      descriptionTr: `${limitGaps.length} yetersiz teminatta limitleri piyasa ortalamasına yükseltin.`,
      addressesGaps: limitGaps.map(g => g.id),
      impactScore: Math.min(80, limitGaps.length * 12),
      gapsResolved: limitGaps.length,
      riskReduction: Math.min(40, limitGaps.length * 8),
      estimatedCost: totalCost,
      expectedSavings: totalSavings,
      roi: totalCost > 0 ? (totalSavings - totalCost) / totalCost : 0,
      difficulty: 'easy',
      timeframe: '3-5 days',
      priority: 2,
    })
  }

  // Compliance recommendation
  if (complianceGaps.length > 0) {
    const criticalCompliance = complianceGaps.filter(g => g.severity === 'critical')

    if (criticalCompliance.length > 0) {
      recommendations.push({
        id: `rec-${recIndex++}`,
        title: 'Address Compliance Issues Immediately',
        titleTr: 'Uyumluluk Sorunlarını Hemen Çözün',
        description: `${criticalCompliance.length} mandatory insurance requirement(s) not met.`,
        descriptionTr: `${criticalCompliance.length} zorunlu sigorta gereksinimi karşılanmıyor.`,
        addressesGaps: criticalCompliance.map(g => g.id),
        impactScore: 95,
        gapsResolved: criticalCompliance.length,
        riskReduction: 50,
        estimatedCost: 0,
        expectedSavings: criticalCompliance.reduce((sum, g) => sum + g.financialImpact.expectedLoss, 0),
        roi: 100,
        difficulty: 'easy',
        timeframe: '1-3 days',
        priority: 1,
      })
    }
  }

  // Quick wins from top 3 easy-to-fix prioritized gaps
  const quickWins = prioritizedGaps
    .filter(pg => pg.gap.remediation.difficulty === 'easy' && pg.priorityScore >= 50)
    .slice(0, 3)

  if (quickWins.length > 0) {
    recommendations.push({
      id: `rec-${recIndex++}`,
      title: 'Quick Wins - Easy Improvements',
      titleTr: 'Hızlı Kazanımlar - Kolay İyileştirmeler',
      description: `${quickWins.length} high-impact issues that can be resolved quickly.`,
      descriptionTr: `Hızlıca çözülebilecek ${quickWins.length} yüksek etkili sorun.`,
      addressesGaps: quickWins.map(qw => qw.gap.id),
      impactScore: Math.round(quickWins.reduce((sum, qw) => sum + qw.priorityScore, 0) / quickWins.length),
      gapsResolved: quickWins.length,
      riskReduction: Math.min(30, quickWins.length * 10),
      estimatedCost: quickWins.reduce((sum, qw) => sum + (qw.gap.remediation.estimatedCost ?? 0), 0),
      expectedSavings: quickWins.reduce((sum, qw) => sum + qw.gap.financialImpact.expectedLoss, 0),
      roi: 2.0,
      difficulty: 'easy',
      timeframe: '1-3 days',
      priority: 2,
    })
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority)

  return recommendations.slice(0, 5) // Return top 5 recommendations
}

/**
 * Calculate overall confidence
 */
function calculateOverallConfidence(gaps: DetectedGap[]): number {
  if (gaps.length === 0) return 1.0

  const totalConfidence = gaps.reduce((sum, g) => sum + g.confidence, 0)
  return totalConfidence / gaps.length
}
