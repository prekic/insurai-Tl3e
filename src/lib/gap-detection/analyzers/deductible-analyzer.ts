/**
 * Deductible Gap Analyzer
 * Detects high deductible issues
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type { CoverageBenchmark, TurkishRegion } from '@/types/market-data'
import type { DetectedGap, GapDetectionConfig } from '@/types/gap'
import { generateGapId, DEFAULT_GAP_CONFIG } from '@/types/gap'
import { MARKET_BENCHMARKS } from '@/data/market-data/benchmarks'

/**
 * Analyze deductible gaps
 */
export function analyzeDeductibleGaps(
  policy: AnalyzedPolicy,
  config: GapDetectionConfig = DEFAULT_GAP_CONFIG,
  _region: TurkishRegion = 'marmara'
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  const benchmark = MARKET_BENCHMARKS[policy.type]

  if (!benchmark) return gaps

  let index = 0
  const multiplier = config.thresholds.highDeductibleMultiplier

  for (const policyCoverage of policy.coverages) {
    if (!policyCoverage.deductible || policyCoverage.deductible === 0) continue

    const marketCoverage = benchmark.commonCoverages.find(
      (m) =>
        matchesCoverage(policyCoverage.name, m.name) ||
        matchesCoverage(policyCoverage.nameTr, m.nameTr)
    )

    if (!marketCoverage || marketCoverage.typicalDeductible === 0) continue

    const deductibleRatio = policyCoverage.deductible / marketCoverage.typicalDeductible

    if (deductibleRatio > multiplier) {
      // Determine severity
      let severity: DetectedGap['severity'] = 'low'
      let subCategory: DetectedGap['subCategory'] = 'above_average'

      if (deductibleRatio > 2.5) {
        severity = 'high'
        subCategory = 'excessive_deductible'
      } else if (deductibleRatio > 2) {
        severity = 'medium'
        subCategory = 'high_deductible'
      } else if (deductibleRatio > 1.5) {
        severity = 'low'
        subCategory = 'above_average'
      }

      // Calculate potential out-of-pocket exposure
      const excessDeductible = policyCoverage.deductible - marketCoverage.typicalDeductible
      const percentile = calculateDeductiblePercentile(policyCoverage.deductible, marketCoverage)

      const gap: DetectedGap = {
        id: generateGapId('deductible', subCategory, index++),
        category: 'deductible',
        subCategory,
        title: `High Deductible: ${policyCoverage.name}`,
        titleTr: `Yüksek Muafiyet: ${policyCoverage.nameTr || policyCoverage.name}`,
        description: `Deductible (₺${policyCoverage.deductible.toLocaleString('tr-TR')}) is ${Math.round(deductibleRatio * 100)}% of market average (₺${marketCoverage.typicalDeductible.toLocaleString('tr-TR')}). This means higher out-of-pocket costs in case of a claim.`,
        descriptionTr: `Muafiyet (₺${policyCoverage.deductible.toLocaleString('tr-TR')}) piyasa ortalamasının (₺${marketCoverage.typicalDeductible.toLocaleString('tr-TR')}) %${Math.round(deductibleRatio * 100)}'i. Bu, hasar durumunda daha yüksek cepten ödeme anlamına gelir.`,
        severity,
        severityScore: getSeverityScore(severity),
        financialImpact: {
          potentialLoss: excessDeductible,
          probability: getClaimProbability(policyCoverage.name),
          expectedLoss: Math.round(excessDeductible * getClaimProbability(policyCoverage.name)),
        },
        affectedCoverage: policyCoverage.name,
        affectedCoverageTr: policyCoverage.nameTr,
        marketReference: {
          benchmark: marketCoverage,
          comparison: 'below', // Higher deductible = below standard
          percentile,
        },
        remediation: {
          action: `Reduce ${policyCoverage.name} deductible to market average`,
          actionTr: `${policyCoverage.nameTr || policyCoverage.name} muafiyetini piyasa ortalamasına düşürün`,
          estimatedCost: calculateDeductibleReductionCost(excessDeductible, policy.premium),
          difficulty: 'easy',
          timeToResolve: '1-2 days',
          steps: [
            'Contact your insurance provider',
            'Request deductible reduction quote',
            'Compare additional premium vs out-of-pocket savings',
            'Make decision based on claim likelihood',
          ],
          stepsTr: [
            'Sigorta şirketinizle iletişime geçin',
            'Muafiyet düşürme teklifi talep edin',
            'Ek primi cepten tasarrufla karşılaştırın',
            'Hasar olasılığına göre karar verin',
          ],
          alternatives: [
            {
              action: 'Keep high deductible to save on premium',
              actionTr: 'Primden tasarruf için yüksek muafiyeti koruyun',
              tradeoff: 'Lower premium but higher out-of-pocket in claims',
            },
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.9,
        source: 'deductible',
      }

      gaps.push(gap)
    }
  }

  // Check total deductible exposure
  const totalDeductible = policy.coverages.reduce((sum, c) => sum + (c.deductible || 0), 0)
  const avgMarketDeductible = benchmark.commonCoverages.reduce(
    (sum, c) => sum + c.typicalDeductible, 0
  ) / Math.max(1, benchmark.commonCoverages.length)

  if (totalDeductible > avgMarketDeductible * policy.coverages.length * 2) {
    const gap: DetectedGap = {
      id: generateGapId('deductible', 'excessive_deductible', index++),
      category: 'deductible',
      subCategory: 'excessive_deductible',
      title: 'High Total Deductible Exposure',
      titleTr: 'Yüksek Toplam Muafiyet Maruziyeti',
      description: `Combined deductibles across all coverages (₺${totalDeductible.toLocaleString('tr-TR')}) are significantly higher than market average. This increases your financial exposure in case of claims.`,
      descriptionTr: `Tüm teminatlardaki toplam muafiyet (₺${totalDeductible.toLocaleString('tr-TR')}) piyasa ortalamasından önemli ölçüde yüksek. Bu, hasar durumunda finansal maruziyetinizi artırır.`,
      severity: 'medium',
      severityScore: 55,
      financialImpact: {
        potentialLoss: totalDeductible,
        probability: 0.15, // At least one claim probability
        expectedLoss: Math.round(totalDeductible * 0.15),
      },
      remediation: {
        action: 'Review and reduce deductibles across coverages',
        actionTr: 'Teminatlardaki muafiyetleri gözden geçirin ve azaltın',
        estimatedCost: Math.round(policy.premium * 0.1),
        difficulty: 'moderate',
        timeToResolve: '3-5 days',
        steps: [
          'Request comprehensive deductible review',
          'Identify highest-impact deductibles to reduce',
          'Get quotes for various deductible scenarios',
          'Balance premium increase vs risk reduction',
        ],
        stepsTr: [
          'Kapsamlı muafiyet incelemesi talep edin',
          'Azaltılacak en yüksek etkili muafiyetleri belirleyin',
          'Çeşitli muafiyet senaryoları için teklif alın',
          'Prim artışı ve risk azaltmasını dengeleyin',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 0.85,
      source: 'deductible',
    }

    gaps.push(gap)
  }

  return gaps
}

function matchesCoverage(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zğüşıöç0-9]/gi, '')
  return normalize(name1).includes(normalize(name2)) ||
         normalize(name2).includes(normalize(name1))
}

function getClaimProbability(coverageName: string): number {
  const probabilities: Record<string, number> = {
    'yangın': 0.02, 'fire': 0.02,
    'hırsızlık': 0.05, 'theft': 0.05,
    'kaza': 0.08, 'accident': 0.08,
    'hasar': 0.1, 'damage': 0.1,
    'cam': 0.15, 'glass': 0.15,
  }

  const normalized = coverageName.toLowerCase()
  for (const [key, prob] of Object.entries(probabilities)) {
    if (normalized.includes(key)) return prob
  }
  return 0.05
}

function getSeverityScore(severity: DetectedGap['severity']): number {
  const scores = { critical: 95, high: 75, medium: 50, low: 25, info: 10 }
  return scores[severity]
}

function calculateDeductiblePercentile(deductible: number, benchmark: CoverageBenchmark): number {
  const range = benchmark.maxDeductible - benchmark.minDeductible
  if (range <= 0) return 50
  // Higher deductible = higher percentile (worse position)
  return Math.min(100, Math.round(((deductible - benchmark.minDeductible) / range) * 100))
}

function calculateDeductibleReductionCost(reduction: number, annualPremium: number): number {
  // Rough estimate: reducing deductible by X costs ~X/10 in additional premium
  return Math.round(Math.min(reduction * 0.1, annualPremium * 0.2))
}
