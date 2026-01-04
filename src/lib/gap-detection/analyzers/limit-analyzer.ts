/**
 * Limit Gap Analyzer
 * Detects underinsured coverage limits
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type { CoverageBenchmark, TurkishRegion } from '@/types/market-data'
import type { DetectedGap, GapDetectionConfig } from '@/types/gap'
import { generateGapId, DEFAULT_GAP_CONFIG } from '@/types/gap'
import { MARKET_BENCHMARKS } from '@/data/market-data/benchmarks'

/**
 * Analyze coverage limit gaps
 */
export function analyzeLimitGaps(
  policy: AnalyzedPolicy,
  config: GapDetectionConfig = DEFAULT_GAP_CONFIG,
  region: TurkishRegion = 'marmara'
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  const benchmark = MARKET_BENCHMARKS[policy.type]

  if (!benchmark) return gaps

  let index = 0
  for (const policyCoverage of policy.coverages) {
    const marketCoverage = benchmark.commonCoverages.find(
      (m) =>
        matchesCoverage(policyCoverage.name, m.name) ||
        matchesCoverage(policyCoverage.nameTr, m.nameTr)
    )

    if (!marketCoverage) continue

    // Calculate percentage of market average
    const percentOfAverage = (policyCoverage.limit / marketCoverage.typicalLimit) * 100

    // Apply regional multiplier for risk adjustment
    const regionRules = config.regionRules[region]
    const riskMultiplier = regionRules?.riskMultiplier ?? 1.0
    const adjustedThreshold = config.thresholds.underinsuredThreshold / riskMultiplier

    if (percentOfAverage < adjustedThreshold) {
      // Determine severity based on how underinsured
      let severity: DetectedGap['severity'] = 'low'
      let subCategory: DetectedGap['subCategory'] = 'marginally_low'

      if (percentOfAverage < 40) {
        severity = 'critical'
        subCategory = 'severely_underinsured'
      } else if (percentOfAverage < 55) {
        severity = 'high'
        subCategory = 'underinsured'
      } else if (percentOfAverage < 70) {
        severity = 'medium'
        subCategory = 'underinsured'
      }

      // Check if this is a high-inclusion coverage (more important)
      if (marketCoverage.inclusionRate >= 90 && severity !== 'critical') {
        severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : severity
      }

      const shortfall = marketCoverage.typicalLimit - policyCoverage.limit
      const estimatedUpgradeCost = Math.round(shortfall * 0.005)

      const gap: DetectedGap = {
        id: generateGapId('limit', subCategory, index++),
        category: 'limit',
        subCategory,
        title: `Underinsured: ${policyCoverage.name}`,
        titleTr: `Yetersiz Limit: ${policyCoverage.nameTr || policyCoverage.name}`,
        description: `Coverage limit is at ${Math.round(percentOfAverage)}% of market average. Current: ₺${policyCoverage.limit.toLocaleString('tr-TR')}, Recommended: ₺${marketCoverage.typicalLimit.toLocaleString('tr-TR')}`,
        descriptionTr: `Teminat limiti piyasa ortalamasının %${Math.round(percentOfAverage)}'inde. Mevcut: ₺${policyCoverage.limit.toLocaleString('tr-TR')}, Önerilen: ₺${marketCoverage.typicalLimit.toLocaleString('tr-TR')}`,
        severity,
        severityScore: getSeverityScore(severity),
        financialImpact: {
          potentialLoss: shortfall,
          probability: getClaimProbability(policyCoverage.name),
          expectedLoss: Math.round(shortfall * getClaimProbability(policyCoverage.name)),
        },
        affectedCoverage: policyCoverage.name,
        affectedCoverageTr: policyCoverage.nameTr,
        marketReference: {
          benchmark: marketCoverage,
          comparison: 'below',
          percentile: calculatePercentile(policyCoverage.limit, marketCoverage),
        },
        remediation: {
          action: `Increase ${policyCoverage.name} limit to at least ₺${marketCoverage.typicalLimit.toLocaleString('tr-TR')}`,
          actionTr: `${policyCoverage.nameTr || policyCoverage.name} limitini en az ₺${marketCoverage.typicalLimit.toLocaleString('tr-TR')}'ye yükseltin`,
          estimatedCost: estimatedUpgradeCost,
          difficulty: 'easy',
          timeToResolve: '1-2 days',
          steps: [
            'Contact your insurance provider',
            'Request limit increase quote',
            'Review additional premium',
            'Approve changes and update policy',
          ],
          stepsTr: [
            'Sigorta şirketinizle iletişime geçin',
            'Limit artışı teklifi talep edin',
            'Ek primi inceleyin',
            'Değişiklikleri onaylayın ve poliçeyi güncelleyin',
          ],
          alternatives: [
            {
              action: 'Consider umbrella/excess liability policy',
              actionTr: 'Şemsiye/ek sorumluluk poliçesi düşünün',
              tradeoff: 'Broader protection but requires base policy limits',
            },
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.9,
        source: 'limit',
      }

      gaps.push(gap)
    }
  }

  // Check total coverage against market
  const totalCoverage = policy.coverages.reduce((sum, c) => sum + c.limit, 0)
  const marketAvgTotal = benchmark.coverageRange.average

  if (totalCoverage < marketAvgTotal * 0.6) {
    const gap: DetectedGap = {
      id: generateGapId('limit', 'severely_underinsured', index++),
      category: 'limit',
      subCategory: 'severely_underinsured',
      title: 'Total Coverage Significantly Below Market',
      titleTr: 'Toplam Teminat Piyasanın Önemli Ölçüde Altında',
      description: `Total coverage (₺${totalCoverage.toLocaleString('tr-TR')}) is only ${Math.round((totalCoverage / marketAvgTotal) * 100)}% of market average (₺${marketAvgTotal.toLocaleString('tr-TR')}).`,
      descriptionTr: `Toplam teminat (₺${totalCoverage.toLocaleString('tr-TR')}) piyasa ortalamasının (₺${marketAvgTotal.toLocaleString('tr-TR')}) sadece %${Math.round((totalCoverage / marketAvgTotal) * 100)}'i.`,
      severity: 'high',
      severityScore: 80,
      financialImpact: {
        potentialLoss: marketAvgTotal - totalCoverage,
        probability: 0.05,
        expectedLoss: Math.round((marketAvgTotal - totalCoverage) * 0.05),
      },
      remediation: {
        action: 'Review and increase overall coverage limits',
        actionTr: 'Genel teminat limitlerini gözden geçirin ve artırın',
        estimatedCost: Math.round((marketAvgTotal - totalCoverage) * 0.004),
        difficulty: 'moderate',
        timeToResolve: '1 week',
        steps: [
          'Request comprehensive coverage review from provider',
          'Identify which limits need increase',
          'Get quotes for each limit increase',
          'Prioritize based on risk and cost',
        ],
        stepsTr: [
          'Sağlayıcıdan kapsamlı teminat incelemesi talep edin',
          'Hangi limitlerin artırılması gerektiğini belirleyin',
          'Her limit artışı için teklif alın',
          'Risk ve maliyete göre önceliklendirin',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 0.85,
      source: 'limit',
    }

    gaps.push(gap)
  }

  return gaps
}

/**
 * Check if two coverage names match
 */
function matchesCoverage(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zğüşıöç0-9]/gi, '')
  return normalize(name1).includes(normalize(name2)) ||
         normalize(name2).includes(normalize(name1))
}

/**
 * Get claim probability for a coverage type
 */
function getClaimProbability(coverageName: string): number {
  const probabilities: Record<string, number> = {
    'yangın': 0.02, 'fire': 0.02,
    'hırsızlık': 0.05, 'theft': 0.05,
    'deprem': 0.01, 'earthquake': 0.01,
    'sel': 0.03, 'flood': 0.03,
    'kaza': 0.08, 'accident': 0.08,
    'hasar': 0.1, 'damage': 0.1,
  }

  const normalized = coverageName.toLowerCase()
  for (const [key, prob] of Object.entries(probabilities)) {
    if (normalized.includes(key)) return prob
  }
  return 0.05
}

/**
 * Get severity score
 */
function getSeverityScore(severity: DetectedGap['severity']): number {
  const scores = { critical: 95, high: 75, medium: 50, low: 25, info: 10 }
  return scores[severity]
}

/**
 * Calculate percentile position
 */
function calculatePercentile(value: number, benchmark: CoverageBenchmark): number {
  const range = benchmark.maxLimit - benchmark.minLimit
  if (range <= 0) return 50
  return Math.min(100, Math.max(0, Math.round(((value - benchmark.minLimit) / range) * 100)))
}
