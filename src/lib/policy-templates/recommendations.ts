/**
 * Policy Template Recommendations
 * Matching users with appropriate templates
 */

import type { Policy } from '@/types/policy'
import type {
  PolicyTemplate,
  TemplateCoverage,
  UserProfile,
  TemplateRecommendation,
  PolicyTemplateGap,
  TemplateSearchCriteria,
  TemplateSearchResult,
  CoverageTier,
} from '@/types/policy-template'
import { calculateTemplateMatchScore } from '@/types/policy-template'
import { getAllTemplates, getTemplatesByType, getTemplateById } from './templates'

// =============================================================================
// Template Matching
// =============================================================================

/**
 * Find best matching templates for a user profile
 */
export function findMatchingTemplates(
  userProfile: UserProfile,
  _limit: number = 5
): TemplateRecommendation {
  const allTemplates = getAllTemplates()

  // Score all templates
  const scoredTemplates = allTemplates
    .map((template) => ({
      template,
      matchScore: calculateTemplateMatchScore(template, userProfile),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)

  // Get primary recommendation
  const primary = scoredTemplates[0]

  // Get alternatives (next best matches, different from primary tier)
  const alternatives = scoredTemplates
    .slice(1)
    .filter((t) => t.template.tier !== primary.template.tier)
    .slice(0, 3)
    .map((t) => ({
      template: t.template,
      matchScore: t.matchScore,
      tradeoffs: getTradeoffs(primary.template, t.template),
      tradeoffsTr: getTradeoffsTr(primary.template, t.template),
    }))

  // Find budget option (basic tier with good match)
  const budgetOption = scoredTemplates.find(
    (t) =>
      t.template.tier === 'basic' &&
      t.template.policyType === primary.template.policyType &&
      t.matchScore >= 50
  )

  // Find premium option (comprehensive/premium tier)
  const premiumOption = scoredTemplates.find(
    (t) =>
      (t.template.tier === 'comprehensive' || t.template.tier === 'premium') &&
      t.template.policyType === primary.template.policyType &&
      t.template.id !== primary.template.id
  )

  return {
    primary: {
      template: primary.template,
      matchScore: primary.matchScore,
      reasons: getMatchReasons(primary.template, userProfile),
      reasonsTr: getMatchReasonsTr(primary.template, userProfile),
    },
    alternatives,
    budgetOption: budgetOption
      ? {
          template: budgetOption.template,
          savings:
            primary.template.estimatedPremiumRange.typical -
            budgetOption.template.estimatedPremiumRange.typical,
          sacrifices: getSacrifices(primary.template, budgetOption.template),
          sacrificesTr: getSacrificesTr(primary.template, budgetOption.template),
        }
      : undefined,
    premiumOption: premiumOption
      ? {
          template: premiumOption.template,
          additionalCost:
            premiumOption.template.estimatedPremiumRange.typical -
            primary.template.estimatedPremiumRange.typical,
          additionalBenefits: getAdditionalBenefits(primary.template, premiumOption.template),
          additionalBenefitsTr: getAdditionalBenefitsTr(
            primary.template,
            premiumOption.template
          ),
        }
      : undefined,
    notes: generatePersonalizedNotes(userProfile),
    notesTr: generatePersonalizedNotesTr(userProfile),
  }
}

/**
 * Get reasons for template match
 */
function getMatchReasons(template: PolicyTemplate, profile: UserProfile): string[] {
  const reasons: string[] = []

  if (template.audience === profile.audience) {
    reasons.push(`Designed for ${profile.audience} customers`)
  }

  if (template.useCases.includes(profile.useCase)) {
    reasons.push(`Addresses your ${profile.useCase.replace(/_/g, ' ')} needs`)
  }

  if (profile.riskTolerance === 'low' && template.tier !== 'basic') {
    reasons.push('Provides comprehensive protection for risk-averse customers')
  }

  if (profile.budgetConstraint === 'tight' && template.tier === 'basic') {
    reasons.push('Budget-friendly option with essential coverage')
  }

  if (reasons.length === 0) {
    reasons.push('Good overall match for your profile')
  }

  return reasons
}

/**
 * Get reasons for template match (Turkish)
 */
function getMatchReasonsTr(template: PolicyTemplate, profile: UserProfile): string[] {
  const reasons: string[] = []

  const audienceMap: Record<string, string> = {
    individual: 'bireysel',
    family: 'aile',
    small_business: 'küçük işletme',
    enterprise: 'kurumsal',
    professional: 'profesyonel',
  }

  if (template.audience === profile.audience) {
    reasons.push(`${audienceMap[profile.audience] || profile.audience} müşteriler için tasarlandı`)
  }

  if (template.useCases.includes(profile.useCase)) {
    reasons.push(`${profile.useCase.replace(/_/g, ' ')} ihtiyaçlarınızı karşılıyor`)
  }

  if (profile.riskTolerance === 'low' && template.tier !== 'basic') {
    reasons.push('Riskten kaçınan müşteriler için kapsamlı koruma sağlar')
  }

  if (profile.budgetConstraint === 'tight' && template.tier === 'basic') {
    reasons.push('Temel teminatla bütçe dostu seçenek')
  }

  if (reasons.length === 0) {
    reasons.push('Profiliniz için iyi genel eşleşme')
  }

  return reasons
}

/**
 * Get tradeoffs between templates
 */
function getTradeoffs(preferred: PolicyTemplate, alternative: PolicyTemplate): string[] {
  const tradeoffs: string[] = []

  if (alternative.tier !== preferred.tier) {
    const tierDiff =
      alternative.estimatedPremiumRange.typical - preferred.estimatedPremiumRange.typical
    if (tierDiff > 0) {
      tradeoffs.push(`${tierDiff.toLocaleString('tr-TR')} TL higher annual premium`)
    } else {
      tradeoffs.push(`${Math.abs(tierDiff).toLocaleString('tr-TR')} TL lower annual premium`)
    }
  }

  const prefCoverages = preferred.coverages.map((c) => c.name)
  const altCoverages = alternative.coverages.map((c) => c.name)

  const missing = prefCoverages.filter((c) => !altCoverages.includes(c))
  if (missing.length > 0) {
    tradeoffs.push(`Missing: ${missing.slice(0, 2).join(', ')}`)
  }

  const extra = altCoverages.filter((c) => !prefCoverages.includes(c))
  if (extra.length > 0) {
    tradeoffs.push(`Includes: ${extra.slice(0, 2).join(', ')}`)
  }

  return tradeoffs
}

/**
 * Get tradeoffs between templates (Turkish)
 */
function getTradeoffsTr(preferred: PolicyTemplate, alternative: PolicyTemplate): string[] {
  const tradeoffs: string[] = []

  if (alternative.tier !== preferred.tier) {
    const tierDiff =
      alternative.estimatedPremiumRange.typical - preferred.estimatedPremiumRange.typical
    if (tierDiff > 0) {
      tradeoffs.push(`${tierDiff.toLocaleString('tr-TR')} TL daha yüksek yıllık prim`)
    } else {
      tradeoffs.push(`${Math.abs(tierDiff).toLocaleString('tr-TR')} TL daha düşük yıllık prim`)
    }
  }

  const prefCoverages = preferred.coverages.map((c) => c.nameTr)
  const altCoverages = alternative.coverages.map((c) => c.nameTr)

  const missing = prefCoverages.filter((c) => !altCoverages.includes(c))
  if (missing.length > 0) {
    tradeoffs.push(`Eksik: ${missing.slice(0, 2).join(', ')}`)
  }

  const extra = altCoverages.filter((c) => !prefCoverages.includes(c))
  if (extra.length > 0) {
    tradeoffs.push(`Dahil: ${extra.slice(0, 2).join(', ')}`)
  }

  return tradeoffs
}

/**
 * Get sacrifices when choosing budget option
 */
function getSacrifices(full: PolicyTemplate, budget: PolicyTemplate): string[] {
  const sacrifices: string[] = []

  const fullCoverages = full.coverages.map((c) => c.name)
  const budgetCoverages = budget.coverages.map((c) => c.name)

  const missing = fullCoverages.filter((c) => !budgetCoverages.includes(c))
  sacrifices.push(...missing.slice(0, 3).map((c) => `No ${c} coverage`))

  // Check limit differences
  const limitDiff = full.coverages[0]?.recommendedLimit - budget.coverages[0]?.recommendedLimit
  if (limitDiff > 0) {
    sacrifices.push(`Lower coverage limits`)
  }

  return sacrifices
}

/**
 * Get sacrifices when choosing budget option (Turkish)
 */
function getSacrificesTr(full: PolicyTemplate, budget: PolicyTemplate): string[] {
  const sacrifices: string[] = []

  const fullCoverages = full.coverages.map((c) => c.nameTr)
  const budgetCoverages = budget.coverages.map((c) => c.nameTr)

  const missing = fullCoverages.filter((c) => !budgetCoverages.includes(c))
  sacrifices.push(...missing.slice(0, 3).map((c) => `${c} teminatı yok`))

  const limitDiff = full.coverages[0]?.recommendedLimit - budget.coverages[0]?.recommendedLimit
  if (limitDiff > 0) {
    sacrifices.push(`Daha düşük teminat limitleri`)
  }

  return sacrifices
}

/**
 * Get additional benefits of premium option
 */
function getAdditionalBenefits(base: PolicyTemplate, premium: PolicyTemplate): string[] {
  const benefits: string[] = []

  const baseCoverages = base.coverages.map((c) => c.name)
  const premiumCoverages = premium.coverages.map((c) => c.name)

  const extra = premiumCoverages.filter((c) => !baseCoverages.includes(c))
  benefits.push(...extra.slice(0, 3).map((c) => `${c} coverage`))

  if (premium.coverages[0]?.recommendedLimit > base.coverages[0]?.recommendedLimit) {
    benefits.push('Higher coverage limits')
  }

  return benefits
}

/**
 * Get additional benefits of premium option (Turkish)
 */
function getAdditionalBenefitsTr(base: PolicyTemplate, premium: PolicyTemplate): string[] {
  const benefits: string[] = []

  const baseCoverages = base.coverages.map((c) => c.nameTr)
  const premiumCoverages = premium.coverages.map((c) => c.nameTr)

  const extra = premiumCoverages.filter((c) => !baseCoverages.includes(c))
  benefits.push(...extra.slice(0, 3).map((c) => `${c} teminatı`))

  if (premium.coverages[0]?.recommendedLimit > base.coverages[0]?.recommendedLimit) {
    benefits.push('Daha yüksek teminat limitleri')
  }

  return benefits
}

/**
 * Generate personalized notes
 */
function generatePersonalizedNotes(profile: UserProfile): string[] {
  const notes: string[] = []

  if (profile.region) {
    notes.push(`Consider regional risk factors for ${profile.region}`)
  }

  if (profile.sector) {
    notes.push(`Industry-specific coverage may be needed for ${profile.sector}`)
  }

  if (profile.budgetConstraint === 'tight') {
    notes.push('Consider higher deductibles to reduce premium')
  }

  if (profile.riskTolerance === 'low') {
    notes.push('Review exclusions carefully to ensure adequate protection')
  }

  return notes
}

/**
 * Generate personalized notes (Turkish)
 */
function generatePersonalizedNotesTr(profile: UserProfile): string[] {
  const notes: string[] = []

  if (profile.region) {
    notes.push(`${profile.region} için bölgesel risk faktörlerini değerlendirin`)
  }

  if (profile.sector) {
    notes.push(`${profile.sector} sektörü için özel teminat gerekebilir`)
  }

  if (profile.budgetConstraint === 'tight') {
    notes.push('Primi azaltmak için daha yüksek muafiyetleri değerlendirin')
  }

  if (profile.riskTolerance === 'low') {
    notes.push('Yeterli koruma için istisnaları dikkatlice gözden geçirin')
  }

  return notes
}

// =============================================================================
// Policy vs Template Gap Analysis
// =============================================================================

/**
 * Analyze gaps between a policy and a template
 */
export function analyzeTemplateGap(
  policy: Policy,
  templateId: string
): PolicyTemplateGap | null {
  const template = getTemplateById(templateId)
  if (!template) return null

  const missingCoverages: PolicyTemplateGap['missingCoverages'] = []
  const underLimitCoverages: PolicyTemplateGap['underLimitCoverages'] = []
  const overDeductibleCoverages: PolicyTemplateGap['overDeductibleCoverages'] = []

  // Check each template coverage
  for (const templateCoverage of template.coverages) {
    const policyCoverage = policy.coverages.find(
      (c) =>
        c.name.toLowerCase() === templateCoverage.name.toLowerCase() ||
        c.nameTr.toLowerCase() === templateCoverage.nameTr.toLowerCase()
    )

    if (!policyCoverage || !policyCoverage.included) {
      // Missing coverage
      missingCoverages.push({
        coverage: templateCoverage,
        impact: templateCoverage.importance,
        estimatedCost: estimateCoverageCost(templateCoverage),
      })
    } else {
      // Check limit
      if (policyCoverage.limit < templateCoverage.recommendedLimit) {
        const gap = templateCoverage.recommendedLimit - policyCoverage.limit
        underLimitCoverages.push({
          coverageName: templateCoverage.name,
          coverageNameTr: templateCoverage.nameTr,
          currentLimit: policyCoverage.limit,
          recommendedLimit: templateCoverage.recommendedLimit,
          gap,
          gapPercentage: Math.round((gap / templateCoverage.recommendedLimit) * 100),
        })
      }

      // Check deductible
      if (policyCoverage.deductible > templateCoverage.typicalDeductible * 1.5) {
        overDeductibleCoverages.push({
          coverageName: templateCoverage.name,
          coverageNameTr: templateCoverage.nameTr,
          currentDeductible: policyCoverage.deductible,
          recommendedDeductible: templateCoverage.typicalDeductible,
          excess: policyCoverage.deductible - templateCoverage.typicalDeductible,
        })
      }
    }
  }

  // Calculate match score
  const totalCoverages = template.coverages.length
  const matchedCoverages =
    totalCoverages - missingCoverages.length - underLimitCoverages.length * 0.5
  const matchScore = Math.max(0, Math.round((matchedCoverages / totalCoverages) * 100))

  // Generate upgrade path
  const upgradePath = generateUpgradePath(missingCoverages, underLimitCoverages)

  // Calculate total gap cost
  const estimatedGapCost =
    missingCoverages.reduce((sum, m) => sum + m.estimatedCost, 0) +
    underLimitCoverages.length * 500 // Rough estimate for limit increases

  return {
    templateId,
    templateName: template.name,
    templateNameTr: template.nameTr,
    matchScore,
    missingCoverages,
    underLimitCoverages,
    overDeductibleCoverages,
    upgradePath,
    estimatedGapCost,
  }
}

/**
 * Estimate coverage cost
 */
function estimateCoverageCost(coverage: TemplateCoverage): number {
  // Rough estimate based on importance and limit
  const baseRate = coverage.importance === 'critical' ? 0.005 : 0.003
  return Math.round(coverage.recommendedLimit * baseRate)
}

/**
 * Generate upgrade path
 */
function generateUpgradePath(
  missing: PolicyTemplateGap['missingCoverages'],
  underLimit: PolicyTemplateGap['underLimitCoverages']
): PolicyTemplateGap['upgradePath'] {
  const path: PolicyTemplateGap['upgradePath'] = []
  let priority = 1

  // Critical missing coverages first
  for (const m of missing.filter((c) => c.impact === 'critical')) {
    path.push({
      priority: priority++,
      action: `Add ${m.coverage.name} coverage`,
      actionTr: `${m.coverage.nameTr} teminatı ekleyin`,
      estimatedCost: m.estimatedCost,
      impact: 'Critical protection gap closed',
      impactTr: 'Kritik koruma açığı kapatıldı',
    })
  }

  // High importance missing coverages
  for (const m of missing.filter((c) => c.impact === 'high')) {
    path.push({
      priority: priority++,
      action: `Add ${m.coverage.name} coverage`,
      actionTr: `${m.coverage.nameTr} teminatı ekleyin`,
      estimatedCost: m.estimatedCost,
      impact: 'Important protection added',
      impactTr: 'Önemli koruma eklendi',
    })
  }

  // Under-limit coverages
  for (const u of underLimit) {
    path.push({
      priority: priority++,
      action: `Increase ${u.coverageName} limit to ${u.recommendedLimit.toLocaleString('tr-TR')} TL`,
      actionTr: `${u.coverageNameTr} limitini ${u.recommendedLimit.toLocaleString('tr-TR')} TL'ye yükseltin`,
      estimatedCost: 500, // Rough estimate
      impact: `${u.gapPercentage}% coverage gap closed`,
      impactTr: `%${u.gapPercentage} teminat açığı kapatıldı`,
    })
  }

  return path
}

/**
 * Find best matching template for a policy
 */
export function findBestTemplateForPolicy(policy: Policy): PolicyTemplate | null {
  const templates = getTemplatesByType(policy.type)
  if (templates.length === 0) return null

  let bestTemplate: PolicyTemplate | null = null
  let bestScore = -1

  for (const template of templates) {
    const gap = analyzeTemplateGap(policy, template.id)
    if (gap && gap.matchScore > bestScore) {
      bestScore = gap.matchScore
      bestTemplate = template
    }
  }

  return bestTemplate
}

// =============================================================================
// Template Search
// =============================================================================

/**
 * Search templates by criteria
 */
export function searchTemplates(criteria: TemplateSearchCriteria): TemplateSearchResult[] {
  let templates = getAllTemplates()

  // Filter by policy type
  if (criteria.policyType) {
    templates = templates.filter((t) => t.policyType === criteria.policyType)
  }

  // Filter by tier
  if (criteria.tier) {
    templates = templates.filter((t) => t.tier === criteria.tier)
  }

  // Filter by audience
  if (criteria.audience) {
    templates = templates.filter((t) => t.audience === criteria.audience)
  }

  // Filter by use case
  if (criteria.useCase) {
    const useCase = criteria.useCase
    templates = templates.filter((t) => t.useCases.includes(useCase))
  }

  // Filter by premium range
  if (criteria.minPremium !== undefined) {
    const minPremium = criteria.minPremium
    templates = templates.filter((t) => t.estimatedPremiumRange.max >= minPremium)
  }
  if (criteria.maxPremium !== undefined) {
    const maxPremium = criteria.maxPremium
    templates = templates.filter((t) => t.estimatedPremiumRange.min <= maxPremium)
  }

  // Filter by required coverages
  if (criteria.requiredCoverages && criteria.requiredCoverages.length > 0) {
    const requiredCoverages = criteria.requiredCoverages
    templates = templates.filter((t) => {
      const coverageNames = t.coverages.map((c) => c.name.toLowerCase())
      return requiredCoverages.every((rc) =>
        coverageNames.some((cn) => cn.includes(rc.toLowerCase()))
      )
    })
  }

  // Filter by tags
  if (criteria.tags && criteria.tags.length > 0) {
    const tags = criteria.tags
    templates = templates.filter((t) =>
      tags.some(
        (tag) =>
          t.tags.includes(tag.toLowerCase()) || t.tagsTr.includes(tag.toLowerCase())
      )
    )
  }

  // Free text search
  if (criteria.query) {
    const lowerQuery = criteria.query.toLowerCase()
    templates = templates.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.nameTr.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery) ||
        t.descriptionTr.toLowerCase().includes(lowerQuery) ||
        t.tags.some((tag) => tag.includes(lowerQuery)) ||
        t.highlights.some((h) => h.toLowerCase().includes(lowerQuery))
    )
  }

  // Score and sort results
  return templates
    .map((template) => ({
      template,
      relevanceScore: calculateSearchRelevance(template, criteria),
      matchedCriteria: getMatchedCriteria(template, criteria),
      highlights: template.highlights.slice(0, 3),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
}

/**
 * Calculate search relevance score
 */
function calculateSearchRelevance(
  template: PolicyTemplate,
  criteria: TemplateSearchCriteria
): number {
  let score = 50 // Base score

  if (criteria.policyType && template.policyType === criteria.policyType) {
    score += 20
  }

  if (criteria.tier && template.tier === criteria.tier) {
    score += 15
  }

  if (criteria.audience && template.audience === criteria.audience) {
    score += 15
  }

  if (criteria.useCase && template.useCases.includes(criteria.useCase)) {
    score += 10
  }

  if (criteria.query) {
    const lowerQuery = criteria.query.toLowerCase()
    if (template.name.toLowerCase().includes(lowerQuery)) score += 10
    if (template.nameTr.toLowerCase().includes(lowerQuery)) score += 10
  }

  return Math.min(100, score)
}

/**
 * Get matched criteria for search result
 */
function getMatchedCriteria(
  template: PolicyTemplate,
  criteria: TemplateSearchCriteria
): string[] {
  const matched: string[] = []

  if (criteria.policyType && template.policyType === criteria.policyType) {
    matched.push(`Policy type: ${criteria.policyType}`)
  }

  if (criteria.tier && template.tier === criteria.tier) {
    matched.push(`Tier: ${criteria.tier}`)
  }

  if (criteria.audience && template.audience === criteria.audience) {
    matched.push(`Audience: ${criteria.audience}`)
  }

  if (criteria.useCase && template.useCases.includes(criteria.useCase)) {
    matched.push(`Use case: ${criteria.useCase}`)
  }

  return matched
}

// =============================================================================
// Template Comparison
// =============================================================================

/**
 * Compare two templates
 */
export function compareTemplates(
  templateIdA: string,
  templateIdB: string
): {
  templateA: PolicyTemplate
  templateB: PolicyTemplate
  coverageDiff: { name: string; inA: boolean; inB: boolean }[]
  premiumDiff: number
  tierComparison: string
} | null {
  const templateA = getTemplateById(templateIdA)
  const templateB = getTemplateById(templateIdB)

  if (!templateA || !templateB) return null

  // Get all unique coverage names
  const allCoverages = new Set([
    ...templateA.coverages.map((c) => c.name),
    ...templateB.coverages.map((c) => c.name),
  ])

  const coverageDiff = Array.from(allCoverages).map((name) => ({
    name,
    inA: templateA.coverages.some((c) => c.name === name),
    inB: templateB.coverages.some((c) => c.name === name),
  }))

  const premiumDiff =
    templateB.estimatedPremiumRange.typical - templateA.estimatedPremiumRange.typical

  const tierOrder: CoverageTier[] = ['basic', 'standard', 'comprehensive', 'premium']
  const tierA = tierOrder.indexOf(templateA.tier)
  const tierB = tierOrder.indexOf(templateB.tier)

  let tierComparison = 'Same tier'
  if (tierB > tierA) tierComparison = `${templateB.tier} is higher tier`
  if (tierB < tierA) tierComparison = `${templateA.tier} is higher tier`

  return {
    templateA,
    templateB,
    coverageDiff,
    premiumDiff,
    tierComparison,
  }
}

/**
 * Get recommended template for upgrading
 */
export function getUpgradeRecommendation(
  currentTemplateId: string
): PolicyTemplate | null {
  const current = getTemplateById(currentTemplateId)
  if (!current) return null

  const tierOrder: CoverageTier[] = ['basic', 'standard', 'comprehensive', 'premium']
  const currentTierIndex = tierOrder.indexOf(current.tier)

  if (currentTierIndex >= tierOrder.length - 1) return null // Already at top tier

  const nextTier = tierOrder[currentTierIndex + 1]
  const templates = getTemplatesByType(current.policyType)

  return templates.find((t) => t.tier === nextTier) || null
}
