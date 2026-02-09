/**
 * Coverage Gap Analyzer
 * Detects missing and incomplete coverage gaps
 */

import type { Coverage, PolicyType, AnalyzedPolicy } from '@/types/policy'
import type { CoverageBenchmark, TurkishRegion } from '@/types/market-data'
import type { DetectedGap, GapRemediation, GapDetectionConfig } from '@/types/gap'
import { generateGapId, DEFAULT_GAP_CONFIG } from '@/types/gap'
import { marketDataProvider } from '@/lib/market-data/market-data-provider'

/**
 * Analyze coverage gaps in a policy (async, DB-backed with static fallback)
 */
export async function analyzeCoverageGaps(
  policy: AnalyzedPolicy,
  config: GapDetectionConfig = DEFAULT_GAP_CONFIG,
  region: TurkishRegion = 'marmara'
): Promise<DetectedGap[]> {
  const gaps: DetectedGap[] = []
  const benchmark = await marketDataProvider.getBenchmark(policy.type)

  if (!benchmark) return gaps

  // Find missing coverages
  const missingGaps = findMissingCoverages(
    policy.coverages,
    benchmark.commonCoverages,
    policy.type,
    config,
    region
  )
  gaps.push(...missingGaps)

  // Find partial/incomplete coverages
  const partialGaps = findPartialCoverages(
    policy.coverages,
    benchmark.commonCoverages,
    policy.type
  )
  gaps.push(...partialGaps)

  // Check policy-type specific mandatory coverages
  const mandatoryGaps = checkMandatoryCoverages(policy, config)
  gaps.push(...mandatoryGaps)

  return gaps
}

/**
 * Find coverages that are missing from the policy
 */
function findMissingCoverages(
  policyCoverages: Coverage[],
  marketCoverages: CoverageBenchmark[],
  policyType: PolicyType,
  config: GapDetectionConfig,
  region: TurkishRegion
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  let index = 0

  for (const marketCoverage of marketCoverages) {
    // Skip coverages below minimum inclusion threshold
    if (marketCoverage.inclusionRate < config.thresholds.missingCoverageMinInclusionRate) {
      continue
    }

    const hasCoverage = policyCoverages.some((c) =>
      matchesCoverage(c.name, marketCoverage.name) ||
      matchesCoverage(c.nameTr, marketCoverage.nameTr)
    )

    if (!hasCoverage) {
      // Determine severity based on inclusion rate
      let severity: DetectedGap['severity'] = 'info'
      let subCategory: DetectedGap['subCategory'] = 'missing_optional'

      if (marketCoverage.inclusionRate >= 90) {
        severity = 'critical'
        subCategory = 'missing_critical'
      } else if (marketCoverage.inclusionRate >= 70) {
        severity = 'high'
        subCategory = 'missing_recommended'
      } else if (marketCoverage.inclusionRate >= 50) {
        severity = 'medium'
        subCategory = 'missing_optional'
      }

      // Check regional importance
      const regionRules = config.regionRules[region]
      if (regionRules?.regionalCoverages.some(rc =>
        matchesCoverage(rc, marketCoverage.nameTr) ||
        matchesCoverage(rc, marketCoverage.name)
      )) {
        // Bump severity for regionally important coverages
        if (severity === 'medium') severity = 'high'
        if (severity === 'info') severity = 'medium'
      }

      // Calculate financial impact
      const estimatedCost = Math.round(marketCoverage.typicalLimit * 0.008)
      const probability = getClaimProbability(marketCoverage.name, policyType)
      const potentialLoss = marketCoverage.typicalLimit

      const gap: DetectedGap = {
        id: generateGapId('coverage', subCategory, index++),
        category: 'coverage',
        subCategory,
        title: `Missing Coverage: ${marketCoverage.name}`,
        titleTr: `Eksik Teminat: ${marketCoverage.nameTr}`,
        description: `This coverage is included in ${marketCoverage.inclusionRate}% of similar policies in the market.`,
        descriptionTr: `Bu teminat piyasadaki benzer poliçelerin %${marketCoverage.inclusionRate}'inde bulunmaktadır.`,
        severity,
        severityScore: getSeverityScore(severity),
        financialImpact: {
          potentialLoss,
          probability,
          expectedLoss: Math.round(potentialLoss * probability),
        },
        affectedCoverage: marketCoverage.name,
        affectedCoverageTr: marketCoverage.nameTr,
        marketReference: {
          benchmark: marketCoverage,
          comparison: 'missing',
          percentile: 0, // Policy is at 0th percentile since it's missing
        },
        remediation: createCoverageRemediation(marketCoverage, estimatedCost),
        detectedAt: new Date().toISOString(),
        confidence: 0.95,
        source: 'coverage',
      }

      gaps.push(gap)
    }
  }

  return gaps
}

/**
 * Find coverages that exist but are incomplete
 */
function findPartialCoverages(
  policyCoverages: Coverage[],
  marketCoverages: CoverageBenchmark[],
  policyType: PolicyType
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  let index = 0

  for (const policyCoverage of policyCoverages) {
    const marketCoverage = marketCoverages.find(
      (m) =>
        matchesCoverage(policyCoverage.name, m.name) ||
        matchesCoverage(policyCoverage.nameTr, m.nameTr)
    )

    if (!marketCoverage) continue

    // Check if coverage is partial (has description mentioning limitations)
    const hasLimitations = policyCoverage.description?.toLowerCase().includes('limited') ||
                          policyCoverage.description?.toLowerCase().includes('sınırlı') ||
                          policyCoverage.description?.toLowerCase().includes('partial') ||
                          policyCoverage.description?.toLowerCase().includes('kısmi')

    // Check if limit is very low compared to minimum
    const isVeryLow = policyCoverage.limit < marketCoverage.minLimit * 0.5

    if (hasLimitations || isVeryLow) {
      const gap: DetectedGap = {
        id: generateGapId('coverage', 'partial_coverage', index++),
        category: 'coverage',
        subCategory: 'partial_coverage',
        title: `Partial Coverage: ${policyCoverage.name}`,
        titleTr: `Kısmi Teminat: ${policyCoverage.nameTr || policyCoverage.name}`,
        description: 'This coverage exists but may not provide full protection due to limitations or very low limits.',
        descriptionTr: 'Bu teminat mevcut ancak sınırlamalar veya çok düşük limitler nedeniyle tam koruma sağlamayabilir.',
        severity: 'medium',
        severityScore: 50,
        financialImpact: {
          potentialLoss: marketCoverage.typicalLimit - policyCoverage.limit,
          probability: getClaimProbability(marketCoverage.name, policyType),
          expectedLoss: Math.round((marketCoverage.typicalLimit - policyCoverage.limit) * 0.05),
        },
        affectedCoverage: policyCoverage.name,
        affectedCoverageTr: policyCoverage.nameTr,
        marketReference: {
          benchmark: marketCoverage,
          comparison: 'below',
          percentile: calculatePercentile(policyCoverage.limit, marketCoverage),
        },
        remediation: {
          action: 'Upgrade to full coverage or increase limits',
          actionTr: 'Tam teminata geçin veya limitleri artırın',
          estimatedCost: Math.round((marketCoverage.typicalLimit - policyCoverage.limit) * 0.005),
          difficulty: 'easy',
          timeToResolve: '1-2 days',
          steps: [
            'Contact your insurance provider',
            'Request upgrade to full coverage',
            'Review new terms and pricing',
          ],
          stepsTr: [
            'Sigorta şirketinizle iletişime geçin',
            'Tam teminata geçiş talep edin',
            'Yeni şartları ve fiyatlandırmayı inceleyin',
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.8,
        source: 'coverage',
      }

      gaps.push(gap)
    }
  }

  return gaps
}

/**
 * Check for mandatory coverages based on policy type
 */
function checkMandatoryCoverages(
  policy: AnalyzedPolicy,
  config: GapDetectionConfig
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  const typeRules = config.policyTypeRules[policy.type]

  if (!typeRules) return gaps

  let index = 0
  for (const mandatoryCoverage of typeRules.mandatoryCoverages) {
    const hasCoverage = policy.coverages.some((c) =>
      matchesCoverage(c.name, mandatoryCoverage) ||
      matchesCoverage(c.nameTr, mandatoryCoverage)
    )

    if (!hasCoverage) {
      const gap: DetectedGap = {
        id: generateGapId('coverage', 'missing_critical', index++),
        category: 'coverage',
        subCategory: 'missing_critical',
        title: `Missing Mandatory Coverage: ${mandatoryCoverage}`,
        titleTr: `Eksik Zorunlu Teminat: ${mandatoryCoverage}`,
        description: `This coverage is considered mandatory for ${policy.type} policies.`,
        descriptionTr: `Bu teminat ${policy.typeTr} poliçeleri için zorunlu kabul edilmektedir.`,
        severity: 'critical',
        severityScore: 95,
        financialImpact: {
          potentialLoss: typeRules.minimumLimits[mandatoryCoverage] ?? 100000,
          probability: 0.1,
          expectedLoss: (typeRules.minimumLimits[mandatoryCoverage] ?? 100000) * 0.1,
        },
        affectedCoverage: mandatoryCoverage,
        affectedCoverageTr: mandatoryCoverage,
        remediation: {
          action: `Add ${mandatoryCoverage} coverage immediately`,
          actionTr: `${mandatoryCoverage} teminatını hemen ekleyin`,
          estimatedCost: null,
          difficulty: 'easy',
          timeToResolve: '1-2 days',
          steps: [
            'Contact insurance provider urgently',
            `Request ${mandatoryCoverage} coverage addition`,
            'Review and sign endorsement',
          ],
          stepsTr: [
            'Sigorta şirketinize acil ulaşın',
            `${mandatoryCoverage} teminatı eklenmesini talep edin`,
            'Zeyilnameyi inceleyin ve imzalayın',
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.95,
        source: 'coverage',
      }

      gaps.push(gap)
    }
  }

  return gaps
}

/**
 * Check if two coverage names match (fuzzy matching)
 */
function matchesCoverage(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zğüşıöç0-9]/gi, '')
  const n1 = normalize(name1)
  const n2 = normalize(name2)
  return n1.includes(n2) || n2.includes(n1)
}

/**
 * Get claim probability for a coverage type
 */
function getClaimProbability(coverageName: string, _policyType: PolicyType): number {
  // Note: _policyType reserved for future policy-type-specific probability adjustments
  // Base probabilities by coverage type
  const probabilities: Record<string, number> = {
    'yangın': 0.02,
    'fire': 0.02,
    'hırsızlık': 0.05,
    'theft': 0.05,
    'deprem': 0.01,
    'earthquake': 0.01,
    'sel': 0.03,
    'flood': 0.03,
    'kaza': 0.08,
    'accident': 0.08,
    'hasar': 0.1,
    'damage': 0.1,
    'cam': 0.15,
    'glass': 0.15,
    'sağlık': 0.2,
    'health': 0.2,
  }

  const normalizedName = coverageName.toLowerCase()
  for (const [key, prob] of Object.entries(probabilities)) {
    if (normalizedName.includes(key)) {
      return prob
    }
  }

  return 0.05 // Default probability
}

/**
 * Get severity score from severity level
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
  return Math.round(((value - benchmark.minLimit) / range) * 100)
}

/**
 * Create remediation for missing coverage
 */
function createCoverageRemediation(
  coverage: CoverageBenchmark,
  estimatedCost: number
): GapRemediation {
  return {
    action: `Add ${coverage.name} coverage to your policy`,
    actionTr: `Poliçenize ${coverage.nameTr} teminatı ekleyin`,
    estimatedCost,
    difficulty: 'easy',
    timeToResolve: '2-3 days',
    steps: [
      'Contact your insurance provider or broker',
      `Request to add ${coverage.name} coverage`,
      'Review the additional premium quote',
      'Sign the policy endorsement',
    ],
    stepsTr: [
      'Sigorta şirketiniz veya brokerinizle iletişime geçin',
      `${coverage.nameTr} teminatı eklenmesini talep edin`,
      'Ek prim teklifini inceleyin',
      'Zeyilnameyi imzalayın',
    ],
    alternatives: [
      {
        action: 'Purchase separate standalone policy',
        actionTr: 'Ayrı bir müstakil poliçe satın alın',
        tradeoff: 'May have different terms but could be more comprehensive',
      },
    ],
  }
}
