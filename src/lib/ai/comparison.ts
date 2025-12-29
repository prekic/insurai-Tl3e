/**
 * Policy comparison module
 * Compare two or more policies to identify differences and similarities
 */

import type { AnalyzedPolicy } from '@/types/policy'
import { formatCurrency } from '@/lib/utils'

export interface PolicyComparisonResult {
  policies: AnalyzedPolicy[]
  summary: ComparisonSummary
  differences: ComparisonDifference[]
  recommendations: string[]
}

export interface ComparisonSummary {
  // Financial comparison
  premiumRange: { min: number; max: number; diff: number; diffPercent: number }
  coverageRange: { min: number; max: number; diff: number; diffPercent: number }
  deductibleRange: { min: number; max: number; diff: number; diffPercent: number }

  // Coverage comparison
  sharedCoverages: string[]
  uniqueCoverages: Map<string, string[]> // policyId -> unique coverage names

  // Best values
  lowestPremium: { policyId: string; value: number }
  highestCoverage: { policyId: string; value: number }
  lowestDeductible: { policyId: string; value: number }
  bestValue: { policyId: string; score: number } // coverage/premium ratio
}

export interface ComparisonDifference {
  field: string
  fieldTr: string
  values: { policyId: string; provider: string; value: string | number }[]
  recommendation?: string
}

/**
 * Compare multiple policies and generate analysis
 */
export function comparePolicies(policies: AnalyzedPolicy[]): PolicyComparisonResult {
  if (policies.length < 2) {
    throw new Error('At least 2 policies required for comparison')
  }

  const summary = calculateSummary(policies)
  const differences = findDifferences(policies)
  const recommendations = generateRecommendations(policies, summary, differences)

  return {
    policies,
    summary,
    differences,
    recommendations,
  }
}

/**
 * Calculate comparison summary
 */
function calculateSummary(policies: AnalyzedPolicy[]): ComparisonSummary {
  const premiums = policies.map((p) => p.premium)
  const coverages = policies.map((p) => p.coverage)
  const deductibles = policies.map((p) => p.deductible)

  const premiumRange = calculateRange(premiums)
  const coverageRange = calculateRange(coverages)
  const deductibleRange = calculateRange(deductibles)

  // Find shared and unique coverages
  const coveragesByPolicy = new Map<string, Set<string>>()
  for (const policy of policies) {
    const coverageNames = new Set(policy.coverages.map((c) => normalizeCoverageName(c.name)))
    coveragesByPolicy.set(policy.id, coverageNames)
  }

  // Find coverages in all policies
  const allCoverageNames = Array.from(coveragesByPolicy.values())
  const sharedCoverages = allCoverageNames.reduce((shared, current) =>
    shared.filter((name) => current.has(name))
  , [...allCoverageNames[0]])

  // Find unique coverages per policy
  const uniqueCoverages = new Map<string, string[]>()
  for (const [policyId, coverageNames] of coveragesByPolicy) {
    const unique = [...coverageNames].filter((name) => {
      // Check if this coverage is unique to this policy
      for (const [otherId, otherNames] of coveragesByPolicy) {
        if (otherId !== policyId && otherNames.has(name)) {
          return false
        }
      }
      return true
    })
    if (unique.length > 0) {
      uniqueCoverages.set(policyId, unique)
    }
  }

  // Find best values
  const lowestPremiumPolicy = policies.reduce((best, current) =>
    current.premium < best.premium ? current : best
  )
  const highestCoveragePolicy = policies.reduce((best, current) =>
    current.coverage > best.coverage ? current : best
  )
  const lowestDeductiblePolicy = policies.reduce((best, current) =>
    current.deductible < best.deductible ? current : best
  )

  // Calculate value score (coverage per lira of premium)
  const policyScores = policies.map((p) => ({
    policyId: p.id,
    score: p.premium > 0 ? p.coverage / p.premium : 0,
  }))
  const bestValuePolicy = policyScores.reduce((best, current) =>
    current.score > best.score ? current : best
  )

  return {
    premiumRange,
    coverageRange,
    deductibleRange,
    sharedCoverages,
    uniqueCoverages,
    lowestPremium: { policyId: lowestPremiumPolicy.id, value: lowestPremiumPolicy.premium },
    highestCoverage: { policyId: highestCoveragePolicy.id, value: highestCoveragePolicy.coverage },
    lowestDeductible: { policyId: lowestDeductiblePolicy.id, value: lowestDeductiblePolicy.deductible },
    bestValue: bestValuePolicy,
  }
}

/**
 * Find differences between policies
 */
function findDifferences(policies: AnalyzedPolicy[]): ComparisonDifference[] {
  const differences: ComparisonDifference[] = []

  // Compare key fields
  const fieldsToCompare: { field: keyof AnalyzedPolicy; fieldTr: string }[] = [
    { field: 'provider', fieldTr: 'Sigorta Şirketi' },
    { field: 'typeTr', fieldTr: 'Poliçe Türü' },
    { field: 'premium', fieldTr: 'Yıllık Prim' },
    { field: 'coverage', fieldTr: 'Toplam Teminat' },
    { field: 'deductible', fieldTr: 'Muafiyet' },
    { field: 'expiryDate', fieldTr: 'Bitiş Tarihi' },
    { field: 'status', fieldTr: 'Durum' },
  ]

  for (const { field, fieldTr } of fieldsToCompare) {
    const values = policies.map((p) => ({
      policyId: p.id,
      provider: p.provider,
      value: formatFieldValue(p[field], field),
    }))

    // Check if values differ
    const uniqueValues = new Set(values.map((v) => String(v.value)))
    if (uniqueValues.size > 1) {
      differences.push({
        field,
        fieldTr,
        values,
        recommendation: getFieldRecommendation(field, values, policies),
      })
    }
  }

  // Compare coverages in detail
  const coverageDiffs = compareCoverages(policies)
  differences.push(...coverageDiffs)

  return differences
}

/**
 * Compare coverage details between policies
 */
function compareCoverages(policies: AnalyzedPolicy[]): ComparisonDifference[] {
  const differences: ComparisonDifference[] = []

  // Get all unique coverage names across all policies
  const allCoverageNames = new Set<string>()
  for (const policy of policies) {
    for (const coverage of policy.coverages) {
      allCoverageNames.add(normalizeCoverageName(coverage.name))
    }
  }

  // For each coverage, compare across policies
  for (const coverageName of allCoverageNames) {
    const coverageValues: { policyId: string; provider: string; value: string | number }[] = []

    for (const policy of policies) {
      const coverage = policy.coverages.find(
        (c) => normalizeCoverageName(c.name) === coverageName
      )

      if (coverage) {
        coverageValues.push({
          policyId: policy.id,
          provider: policy.provider,
          value: `${formatCurrency(coverage.limit)} (muafiyet: ${formatCurrency(coverage.deductible)})`,
        })
      } else {
        coverageValues.push({
          policyId: policy.id,
          provider: policy.provider,
          value: 'Dahil değil',
        })
      }
    }

    // Check if values differ
    const uniqueValues = new Set(coverageValues.map((v) => String(v.value)))
    if (uniqueValues.size > 1) {
      differences.push({
        field: `coverage_${coverageName}`,
        fieldTr: `Teminat: ${coverageName}`,
        values: coverageValues,
      })
    }
  }

  return differences
}

/**
 * Generate recommendations based on comparison
 */
function generateRecommendations(
  policies: AnalyzedPolicy[],
  summary: ComparisonSummary,
  _differences: ComparisonDifference[]
): string[] {
  const recommendations: string[] = []

  // Premium difference recommendation
  if (summary.premiumRange.diffPercent > 20) {
    const cheapest = policies.find((p) => p.id === summary.lowestPremium.policyId)
    const mostExpensive = policies.find(
      (p) => p.premium === summary.premiumRange.max
    )
    if (cheapest && mostExpensive) {
      recommendations.push(
        `Prim farkı %${summary.premiumRange.diffPercent.toFixed(0)} - ${cheapest.provider} en düşük primle ₺${summary.lowestPremium.value.toLocaleString('tr-TR')} sunuyor.`
      )
    }
  }

  // Coverage recommendation
  if (summary.coverageRange.diffPercent > 15) {
    const highest = policies.find((p) => p.id === summary.highestCoverage.policyId)
    if (highest) {
      recommendations.push(
        `${highest.provider} en yüksek teminat limitini sunuyor: ₺${summary.highestCoverage.value.toLocaleString('tr-TR')}`
      )
    }
  }

  // Deductible recommendation
  if (summary.deductibleRange.diff > 1000) {
    const lowest = policies.find((p) => p.id === summary.lowestDeductible.policyId)
    if (lowest) {
      recommendations.push(
        `${lowest.provider} en düşük muafiyetle ₺${summary.lowestDeductible.value.toLocaleString('tr-TR')} sunuyor.`
      )
    }
  }

  // Best value recommendation
  const bestValue = policies.find((p) => p.id === summary.bestValue.policyId)
  if (bestValue) {
    recommendations.push(
      `Değer analizi: ${bestValue.provider} prim/teminat oranında en iyi değeri sunuyor.`
    )
  }

  // Unique coverage recommendations
  if (summary.uniqueCoverages.size > 0) {
    for (const [policyId, coverages] of summary.uniqueCoverages) {
      const policy = policies.find((p) => p.id === policyId)
      if (policy && coverages.length > 0) {
        recommendations.push(
          `${policy.provider} şunları ekstra sunuyor: ${coverages.slice(0, 3).join(', ')}${coverages.length > 3 ? '...' : ''}`
        )
      }
    }
  }

  // Expiring soon warning
  const expiringPolicies = policies.filter((p) => p.status === 'expiring')
  if (expiringPolicies.length > 0) {
    recommendations.push(
      `⚠️ ${expiringPolicies.map((p) => p.provider).join(', ')} poliçe${expiringPolicies.length > 1 ? 'leri' : 'si'} yakında sona eriyor.`
    )
  }

  return recommendations
}

/**
 * Helper: Calculate range statistics
 */
function calculateRange(values: number[]): { min: number; max: number; diff: number; diffPercent: number } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const diff = max - min
  const diffPercent = min > 0 ? (diff / min) * 100 : 0

  return { min, max, diff, diffPercent }
}

/**
 * Helper: Normalize coverage name for comparison
 */
function normalizeCoverageName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Helper: Format field value for display
 */
function formatFieldValue(value: unknown, field: string): string | number {
  if (value === null || value === undefined) return 'N/A'

  if (field === 'premium' || field === 'coverage' || field === 'deductible') {
    return formatCurrency(Number(value))
  }

  return String(value)
}

/**
 * Helper: Get recommendation for a specific field difference
 */
function getFieldRecommendation(
  field: string,
  values: { policyId: string; provider: string; value: string | number }[],
  _policies: AnalyzedPolicy[]
): string | undefined {
  switch (field) {
    case 'premium': {
      const lowestValue = values.reduce((min, v) =>
        typeof v.value === 'number' && (typeof min.value !== 'number' || v.value < min.value) ? v : min
      )
      return `${lowestValue.provider} en düşük primi sunuyor`
    }
    case 'coverage': {
      const highestValue = values.reduce((max, v) =>
        typeof v.value === 'number' && (typeof max.value !== 'number' || v.value > max.value) ? v : max
      )
      return `${highestValue.provider} en yüksek teminatı sunuyor`
    }
    case 'deductible': {
      const lowestValue = values.reduce((min, v) =>
        typeof v.value === 'number' && (typeof min.value !== 'number' || v.value < min.value) ? v : min
      )
      return `${lowestValue.provider} en düşük muafiyeti sunuyor`
    }
    case 'status': {
      const expired = values.filter((v) => v.value === 'expired')
      if (expired.length > 0) {
        return `${expired.map((v) => v.provider).join(', ')} poliçesi süresi dolmuş`
      }
      return undefined
    }
    default:
      return undefined
  }
}

/**
 * Generate comparison report as formatted text
 */
export function generateComparisonReport(result: PolicyComparisonResult): string {
  const lines: string[] = []

  lines.push('='.repeat(60))
  lines.push('POLİÇE KARŞILAŞTIRMA RAPORU')
  lines.push('='.repeat(60))
  lines.push('')

  // Policy list
  lines.push('Karşılaştırılan Poliçeler:')
  for (const policy of result.policies) {
    lines.push(`  • ${policy.provider} - ${policy.typeTr} (${policy.policyNumber})`)
  }
  lines.push('')

  // Summary
  lines.push('-'.repeat(40))
  lines.push('ÖZET')
  lines.push('-'.repeat(40))
  lines.push(`Prim aralığı: ${formatCurrency(result.summary.premiumRange.min)} - ${formatCurrency(result.summary.premiumRange.max)}`)
  lines.push(`Teminat aralığı: ${formatCurrency(result.summary.coverageRange.min)} - ${formatCurrency(result.summary.coverageRange.max)}`)
  lines.push(`Muafiyet aralığı: ${formatCurrency(result.summary.deductibleRange.min)} - ${formatCurrency(result.summary.deductibleRange.max)}`)
  lines.push('')

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('-'.repeat(40))
    lines.push('ÖNERİLER')
    lines.push('-'.repeat(40))
    for (const rec of result.recommendations) {
      lines.push(`  → ${rec}`)
    }
    lines.push('')
  }

  // Key differences
  const keyDifferences = result.differences.filter(
    (d) => d.field === 'premium' || d.field === 'coverage' || d.field === 'deductible'
  )
  if (keyDifferences.length > 0) {
    lines.push('-'.repeat(40))
    lines.push('TEMEL FARKLAR')
    lines.push('-'.repeat(40))
    for (const diff of keyDifferences) {
      lines.push(`${diff.fieldTr}:`)
      for (const value of diff.values) {
        lines.push(`  • ${value.provider}: ${value.value}`)
      }
    }
  }

  lines.push('')
  lines.push('='.repeat(60))
  lines.push(`Rapor tarihi: ${new Date().toLocaleDateString('tr-TR')}`)
  lines.push('='.repeat(60))

  return lines.join('\n')
}
