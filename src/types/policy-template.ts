/**
 * Policy Template Library Types
 * Best practices and knowledge base for insurance policy templates
 */

import type { PolicyType } from './policy'
import type { IndustrySector, BusinessSize } from './industry-risk'
import type { TurkishRegion } from './market-data'

// =============================================================================
// Template Classification
// =============================================================================

/**
 * Coverage tier levels
 */
export type CoverageTier = 'basic' | 'standard' | 'comprehensive' | 'premium'

/**
 * Target audience for the template
 */
export type TemplateAudience =
  | 'individual'      // Personal insurance
  | 'family'          // Family coverage
  | 'small_business'  // Small business owners
  | 'enterprise'      // Large corporations
  | 'professional'    // Professionals (doctors, lawyers, etc.)

/**
 * Template use case
 */
export type TemplateUseCase =
  | 'first_time_buyer'    // First-time policy buyers
  | 'renewal'             // Policy renewal optimization
  | 'upgrade'             // Coverage upgrade
  | 'cost_optimization'   // Reducing costs while maintaining coverage
  | 'comprehensive_review' // Full portfolio review
  | 'risk_mitigation'     // Addressing specific risks
  | 'regulatory_compliance' // Meeting legal requirements

// =============================================================================
// Template Structure
// =============================================================================

/**
 * Coverage recommendation within a template
 */
export interface TemplateCoverage {
  name: string
  nameTr: string
  category: 'core' | 'recommended' | 'optional' | 'add_on'
  description: string
  descriptionTr: string
  minLimit: number
  recommendedLimit: number
  maxLimit: number
  typicalDeductible: number
  importance: 'critical' | 'high' | 'medium' | 'low'
  // Why this coverage matters
  rationale: string
  rationaleTr: string
  // Common exclusions to watch for
  watchExclusions: string[]
  watchExclusionsTr: string[]
}

/**
 * Best practice guideline
 */
export interface BestPractice {
  id: string
  title: string
  titleTr: string
  description: string
  descriptionTr: string
  category: 'coverage' | 'limits' | 'deductibles' | 'exclusions' | 'claims' | 'renewal'
  priority: 'essential' | 'recommended' | 'optional'
  // Specific guidance
  guidance: string[]
  guidanceTr: string[]
  // Common mistakes to avoid
  pitfalls: string[]
  pitfallsTr: string[]
}

/**
 * Policy template definition
 */
export interface PolicyTemplate {
  // Identity
  id: string
  name: string
  nameTr: string
  description: string
  descriptionTr: string

  // Classification
  policyType: PolicyType
  tier: CoverageTier
  audience: TemplateAudience
  useCases: TemplateUseCase[]

  // Coverage structure
  coverages: TemplateCoverage[]

  // Limits and pricing
  estimatedPremiumRange: {
    min: number
    max: number
    typical: number
  }

  // Best practices for this template
  bestPractices: BestPractice[]

  // Key features
  highlights: string[]
  highlightsTr: string[]

  // Suitability criteria
  suitableFor: string[]
  suitableForTr: string[]
  notSuitableFor: string[]
  notSuitableForTr: string[]

  // Comparison with other tiers
  comparedToBasic?: string[]
  comparedToBasicTr?: string[]

  // Metadata
  version: string
  lastUpdated: string
  source: 'market_analysis' | 'regulatory' | 'industry_standard' | 'expert_recommendation'

  // Tags for search
  tags: string[]
  tagsTr: string[]
}

// =============================================================================
// Industry-Specific Templates
// =============================================================================

/**
 * Industry-tailored template
 */
export interface IndustryTemplate extends PolicyTemplate {
  sector: IndustrySector
  sectorName: string
  sectorNameTr: string

  // Industry-specific risks addressed
  addressedRisks: {
    risk: string
    riskTr: string
    coverage: string
    coverageTr: string
  }[]

  // Regulatory requirements for the industry
  regulatoryRequirements: {
    requirement: string
    requirementTr: string
    coverage: string
    mandatory: boolean
  }[]

  // Size adjustments
  sizeModifiers: Record<BusinessSize, {
    premiumMultiplier: number
    limitMultiplier: number
    notes: string
    notesTr: string
  }>
}

// =============================================================================
// Regional Templates
// =============================================================================

/**
 * Region-specific template adjustments
 */
export interface RegionalTemplateAdjustment {
  region: TurkishRegion
  regionName: string
  regionNameTr: string

  // Additional coverages for this region
  additionalCoverages: TemplateCoverage[]

  // Coverage adjustments
  coverageAdjustments: {
    coverageName: string
    limitMultiplier: number
    importanceChange?: 'critical' | 'high' | 'medium' | 'low'
    reason: string
    reasonTr: string
  }[]

  // Premium adjustments
  premiumMultiplier: number

  // Regional risks
  regionalRisks: string[]
  regionalRisksTr: string[]
}

// =============================================================================
// Template Comparison
// =============================================================================

/**
 * Compare two templates or a policy against a template
 */
export interface TemplateComparison {
  templateA: PolicyTemplate
  templateB?: PolicyTemplate

  // Coverage differences
  coverageDifferences: {
    coverage: string
    coverageTr: string
    inA: boolean
    inB: boolean
    limitDifference?: number
    deductibleDifference?: number
  }[]

  // Premium difference
  premiumDifference: {
    absolute: number
    percentage: number
    reason: string
    reasonTr: string
  }

  // Feature comparison
  featureComparison: {
    feature: string
    featureTr: string
    templateA: string
    templateB: string
    winner: 'A' | 'B' | 'tie'
  }[]

  // Recommendation
  recommendation: {
    preferred: 'A' | 'B' | 'depends'
    reason: string
    reasonTr: string
    bestFor: string
    bestForTr: string
  }
}

/**
 * Policy vs template gap analysis
 */
export interface PolicyTemplateGap {
  templateId: string
  templateName: string
  templateNameTr: string

  // Match score (0-100)
  matchScore: number

  // Missing coverages
  missingCoverages: {
    coverage: TemplateCoverage
    impact: 'critical' | 'high' | 'medium' | 'low'
    estimatedCost: number
  }[]

  // Under-limit coverages
  underLimitCoverages: {
    coverageName: string
    coverageNameTr: string
    currentLimit: number
    recommendedLimit: number
    gap: number
    gapPercentage: number
  }[]

  // Over-deductible coverages
  overDeductibleCoverages: {
    coverageName: string
    coverageNameTr: string
    currentDeductible: number
    recommendedDeductible: number
    excess: number
  }[]

  // Upgrade path
  upgradePath: {
    priority: number
    action: string
    actionTr: string
    estimatedCost: number
    impact: string
    impactTr: string
  }[]

  // Total gap cost
  estimatedGapCost: number
}

// =============================================================================
// Template Recommendation
// =============================================================================

/**
 * User profile for template matching
 */
export interface UserProfile {
  // Personal info
  audience: TemplateAudience

  // For individuals
  age?: number
  familySize?: number
  homeOwnership?: 'owner' | 'renter' | 'none'
  vehicleCount?: number

  // For businesses
  sector?: IndustrySector
  businessSize?: BusinessSize
  employeeCount?: number
  annualRevenue?: number

  // Location
  region?: TurkishRegion
  province?: string

  // Preferences
  riskTolerance: 'low' | 'medium' | 'high'
  budgetConstraint: 'tight' | 'moderate' | 'flexible'
  useCase: TemplateUseCase

  // Current coverage (if any)
  currentPolicies?: PolicyType[]
}

/**
 * Template recommendation result
 */
export interface TemplateRecommendation {
  // Top recommendation
  primary: {
    template: PolicyTemplate
    matchScore: number
    reasons: string[]
    reasonsTr: string[]
  }

  // Alternative options
  alternatives: {
    template: PolicyTemplate
    matchScore: number
    tradeoffs: string[]
    tradeoffsTr: string[]
  }[]

  // Budget-friendly option
  budgetOption?: {
    template: PolicyTemplate
    savings: number
    sacrifices: string[]
    sacrificesTr: string[]
  }

  // Premium option
  premiumOption?: {
    template: PolicyTemplate
    additionalCost: number
    additionalBenefits: string[]
    additionalBenefitsTr: string[]
  }

  // Personalized notes
  notes: string[]
  notesTr: string[]
}

// =============================================================================
// Knowledge Base
// =============================================================================

/**
 * Insurance term definition
 */
export interface InsuranceTerm {
  term: string
  termTr: string
  definition: string
  definitionTr: string
  category: 'general' | 'coverage' | 'claims' | 'legal' | 'financial'
  relatedTerms: string[]
  example?: string
  exampleTr?: string
}

/**
 * FAQ entry
 */
export interface FAQEntry {
  id: string
  question: string
  questionTr: string
  answer: string
  answerTr: string
  category: PolicyType | 'general' | 'claims' | 'renewal' | 'comparison'
  tags: string[]
  relatedFaqs: string[]
  helpful: number
  notHelpful: number
}

/**
 * Regulatory requirement
 */
export interface RegulatoryRequirement {
  id: string
  name: string
  nameTr: string
  description: string
  descriptionTr: string
  applicableTo: PolicyType[]
  mandatoryCoverages: string[]
  minimumLimits: Record<string, number>
  effectiveDate: string
  source: string
  sourceTr: string
  penalties?: {
    description: string
    descriptionTr: string
    amount?: number
  }
}

/**
 * Market insight
 */
export interface MarketInsight {
  id: string
  title: string
  titleTr: string
  insight: string
  insightTr: string
  category: 'trend' | 'pricing' | 'coverage' | 'regulation' | 'technology'
  policyTypes: PolicyType[]
  date: string
  source: string
  impact: 'high' | 'medium' | 'low'
  actionable: boolean
  recommendation?: string
  recommendationTr?: string
}

// =============================================================================
// Template Library
// =============================================================================

/**
 * Full template library structure
 */
export interface PolicyTemplateLibrary {
  // Core templates by policy type
  templates: Record<PolicyType, PolicyTemplate[]>

  // Industry-specific templates
  industryTemplates: Record<IndustrySector, IndustryTemplate[]>

  // Regional adjustments
  regionalAdjustments: Record<TurkishRegion, RegionalTemplateAdjustment>

  // Knowledge base
  terms: InsuranceTerm[]
  faqs: FAQEntry[]
  regulations: RegulatoryRequirement[]
  insights: MarketInsight[]

  // Global best practices
  globalBestPractices: BestPractice[]

  // Metadata
  version: string
  lastUpdated: string
}

// =============================================================================
// Template Search and Filter
// =============================================================================

/**
 * Search criteria for templates
 */
export interface TemplateSearchCriteria {
  policyType?: PolicyType
  tier?: CoverageTier
  audience?: TemplateAudience
  useCase?: TemplateUseCase
  sector?: IndustrySector
  region?: TurkishRegion
  minPremium?: number
  maxPremium?: number
  requiredCoverages?: string[]
  tags?: string[]
  query?: string // Free text search
}

/**
 * Search result
 */
export interface TemplateSearchResult {
  template: PolicyTemplate
  relevanceScore: number
  matchedCriteria: string[]
  highlights: string[]
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Coverage tier descriptions
 */
export const COVERAGE_TIER_INFO: Record<CoverageTier, {
  label: string
  labelTr: string
  description: string
  descriptionTr: string
  priceRange: string
  priceRangeTr: string
}> = {
  basic: {
    label: 'Basic',
    labelTr: 'Temel',
    description: 'Essential coverage meeting minimum requirements',
    descriptionTr: 'Minimum gereksinimleri karşılayan temel teminatlar',
    priceRange: 'Budget-friendly',
    priceRangeTr: 'Bütçe dostu',
  },
  standard: {
    label: 'Standard',
    labelTr: 'Standart',
    description: 'Balanced coverage for typical needs',
    descriptionTr: 'Tipik ihtiyaçlar için dengeli teminatlar',
    priceRange: 'Moderate',
    priceRangeTr: 'Orta düzey',
  },
  comprehensive: {
    label: 'Comprehensive',
    labelTr: 'Kapsamlı',
    description: 'Extensive coverage with additional protections',
    descriptionTr: 'Ek korumalar içeren geniş kapsamlı teminatlar',
    priceRange: 'Higher',
    priceRangeTr: 'Yüksek',
  },
  premium: {
    label: 'Premium',
    labelTr: 'Premium',
    description: 'Maximum coverage with all available protections',
    descriptionTr: 'Mevcut tüm korumaları içeren maksimum teminat',
    priceRange: 'Highest',
    priceRangeTr: 'En yüksek',
  },
}

/**
 * Template audience descriptions
 */
export const TEMPLATE_AUDIENCE_INFO: Record<TemplateAudience, {
  label: string
  labelTr: string
  description: string
  descriptionTr: string
}> = {
  individual: {
    label: 'Individual',
    labelTr: 'Bireysel',
    description: 'Single person coverage',
    descriptionTr: 'Tek kişilik teminat',
  },
  family: {
    label: 'Family',
    labelTr: 'Aile',
    description: 'Coverage for household members',
    descriptionTr: 'Hane üyeleri için teminat',
  },
  small_business: {
    label: 'Small Business',
    labelTr: 'Küçük İşletme',
    description: 'SME and startup coverage',
    descriptionTr: 'KOBİ ve girişim teminatı',
  },
  enterprise: {
    label: 'Enterprise',
    labelTr: 'Kurumsal',
    description: 'Large corporation coverage',
    descriptionTr: 'Büyük şirket teminatı',
  },
  professional: {
    label: 'Professional',
    labelTr: 'Profesyonel',
    description: 'Licensed professionals coverage',
    descriptionTr: 'Lisanslı profesyoneller için teminat',
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get coverage tier premium multiplier
 */
export function getTierMultiplier(tier: CoverageTier): number {
  const multipliers: Record<CoverageTier, number> = {
    basic: 1.0,
    standard: 1.3,
    comprehensive: 1.7,
    premium: 2.2,
  }
  return multipliers[tier]
}

/**
 * Calculate template match score
 */
export function calculateTemplateMatchScore(
  template: PolicyTemplate,
  userProfile: UserProfile
): number {
  let score = 0
  let maxScore = 0

  // Audience match (25 points)
  maxScore += 25
  if (template.audience === userProfile.audience) {
    score += 25
  } else if (
    (template.audience === 'individual' && userProfile.audience === 'family') ||
    (template.audience === 'small_business' && userProfile.audience === 'enterprise')
  ) {
    score += 15 // Partial match
  }

  // Use case match (25 points)
  maxScore += 25
  if (template.useCases.includes(userProfile.useCase)) {
    score += 25
  }

  // Risk tolerance alignment (20 points)
  maxScore += 20
  const tierRiskMap: Record<CoverageTier, 'low' | 'medium' | 'high'> = {
    basic: 'high',
    standard: 'medium',
    comprehensive: 'low',
    premium: 'low',
  }
  if (tierRiskMap[template.tier] === userProfile.riskTolerance) {
    score += 20
  } else if (
    Math.abs(['low', 'medium', 'high'].indexOf(tierRiskMap[template.tier]) -
             ['low', 'medium', 'high'].indexOf(userProfile.riskTolerance)) === 1
  ) {
    score += 10 // Adjacent tolerance
  }

  // Budget alignment (20 points)
  maxScore += 20
  const tierBudgetMap: Record<CoverageTier, 'tight' | 'moderate' | 'flexible'> = {
    basic: 'tight',
    standard: 'moderate',
    comprehensive: 'flexible',
    premium: 'flexible',
  }
  if (tierBudgetMap[template.tier] === userProfile.budgetConstraint) {
    score += 20
  } else if (
    Math.abs(['tight', 'moderate', 'flexible'].indexOf(tierBudgetMap[template.tier]) -
             ['tight', 'moderate', 'flexible'].indexOf(userProfile.budgetConstraint)) === 1
  ) {
    score += 10
  }

  // Policy type relevance (10 points)
  maxScore += 10
  if (userProfile.currentPolicies?.includes(template.policyType)) {
    score += 5 // Already has this type
  } else {
    score += 10 // New coverage type
  }

  return Math.round((score / maxScore) * 100)
}

/**
 * Get best practice priority label
 */
export function getBestPracticePriorityLabel(
  priority: BestPractice['priority'],
  turkish = false
): string {
  const labels: Record<BestPractice['priority'], { en: string; tr: string }> = {
    essential: { en: 'Essential', tr: 'Zorunlu' },
    recommended: { en: 'Recommended', tr: 'Önerilen' },
    optional: { en: 'Optional', tr: 'İsteğe Bağlı' },
  }
  return turkish ? labels[priority].tr : labels[priority].en
}
