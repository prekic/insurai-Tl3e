/**
 * Industry Risk Profile Types
 * B2B insurance risk assessment by industry sector
 */

import type { RiskLevel } from './risk'

// =============================================================================
// Industry Classification
// =============================================================================

/**
 * Primary industry sectors (NACE Rev.2 aligned)
 */
export type IndustrySector =
  | 'manufacturing'
  | 'construction'
  | 'retail'
  | 'wholesale'
  | 'transportation'
  | 'hospitality'
  | 'healthcare'
  | 'technology'
  | 'finance'
  | 'real_estate'
  | 'professional_services'
  | 'education'
  | 'agriculture'
  | 'mining'
  | 'utilities'
  | 'food_beverage'
  | 'textile'
  | 'automotive'
  | 'chemical'
  | 'logistics'

/**
 * Business size classification
 */
export type BusinessSize = 'micro' | 'small' | 'medium' | 'large' | 'enterprise'

/**
 * Business size thresholds (Turkish SME definitions)
 */
export interface BusinessSizeDefinition {
  size: BusinessSize
  maxEmployees: number
  maxRevenue: number // TRY annual
  description: string
  descriptionTr: string
}

// =============================================================================
// Industry Risk Profile
// =============================================================================

/**
 * Risk category specific to industries
 */
export type IndustryRiskCategory =
  | 'operational'        // Day-to-day operations risk
  | 'property'          // Physical assets and premises
  | 'liability'         // Third-party claims
  | 'employee'          // Workforce-related risks
  | 'cyber'             // Digital and data risks
  | 'environmental'     // Pollution and environmental damage
  | 'product'           // Product liability
  | 'business_interruption' // Revenue loss from disruption
  | 'regulatory'        // Compliance and legal risks
  | 'supply_chain'      // Supplier and distribution risks
  | 'reputation'        // Brand and reputation damage
  | 'financial'         // Credit, fraud, and financial risks

/**
 * Industry-specific risk factor
 */
export interface IndustryRiskFactor {
  category: IndustryRiskCategory
  name: string
  nameTr: string
  description: string
  descriptionTr: string
  baseScore: number // 0-100
  level: RiskLevel
  frequency: 'rare' | 'occasional' | 'common' | 'frequent'
  severity: 'minor' | 'moderate' | 'major' | 'catastrophic'
  controlMeasures: string[]
  controlMeasuresTr: string[]
}

/**
 * Required coverage for an industry
 */
export interface IndustryCoverageRequirement {
  coverageType: string
  coverageTypeTr: string
  importance: 'mandatory' | 'highly_recommended' | 'recommended' | 'optional'
  minLimit: number // TRY
  recommendedLimit: number
  typicalDeductible: number
  reason: string
  reasonTr: string
  regulatoryBasis?: string // If mandated by law
}

/**
 * Industry risk profile
 */
export interface IndustryRiskProfile {
  sector: IndustrySector
  name: string
  nameTr: string
  description: string
  descriptionTr: string

  // Overall risk assessment
  overallRiskScore: number // 0-100
  overallRiskLevel: RiskLevel

  // Risk factors by category
  riskFactors: IndustryRiskFactor[]

  // Category-level risk scores
  categoryScores: Record<IndustryRiskCategory, {
    score: number
    level: RiskLevel
    weight: number // Importance for this industry
  }>

  // Premium modifiers
  premiumModifiers: {
    baseMultiplier: number // 1.0 = average
    sizeAdjustments: Record<BusinessSize, number>
    regionAdjustments: Record<string, number>
  }

  // Coverage requirements
  coverageRequirements: IndustryCoverageRequirement[]

  // Regulatory requirements
  regulatoryRequirements: {
    mandatory: string[]
    mandatoryTr: string[]
    recommended: string[]
    recommendedTr: string[]
  }

  // Industry trends
  trends: {
    riskTrend: 'increasing' | 'stable' | 'decreasing'
    premiumTrend: 'increasing' | 'stable' | 'decreasing'
    emergingRisks: string[]
    emergingRisksTr: string[]
  }

  // Benchmarks
  benchmarks: {
    avgPremium: number // Per million TRY revenue
    avgClaimsRatio: number
    avgCoverageLimit: number
    marketPenetration: number
  }
}

// =============================================================================
// Business Assessment
// =============================================================================

/**
 * Business information for risk assessment
 */
export interface BusinessInfo {
  // Basic info
  name?: string
  sector: IndustrySector
  subSector?: string
  size: BusinessSize

  // Financials
  annualRevenue?: number
  employeeCount?: number
  yearsInOperation?: number

  // Physical presence
  locations?: number
  ownedProperties?: boolean
  leasedProperties?: boolean
  totalSquareMeters?: number

  // Operations
  operatesOnline?: boolean
  hasInventory?: boolean
  inventoryValue?: number
  hasFleet?: boolean
  fleetSize?: number

  // Workforce
  hasHighRiskRoles?: boolean
  foreignWorkers?: boolean
  contractorDependency?: number // 0-1

  // Digital
  processesPersonalData?: boolean
  hasEcommerce?: boolean
  cloudDependency?: number // 0-1

  // Supply chain
  supplierCount?: number
  internationalSuppliers?: boolean
  singleSourceRisk?: boolean

  // Compliance
  certifications?: string[]
  regulatoryBody?: string
  lastAuditDate?: string
}

/**
 * Business risk assessment result
 */
export interface BusinessRiskAssessment {
  // Input
  business: BusinessInfo
  industryProfile: IndustryRiskProfile

  // Calculated scores
  overallRiskScore: number
  overallRiskLevel: RiskLevel

  // Category breakdown
  categoryAssessment: Record<IndustryRiskCategory, {
    score: number
    level: RiskLevel
    factors: string[]
    recommendations: string[]
  }>

  // Premium estimate
  premiumEstimate: {
    annualPremium: number
    perMillionRevenue: number
    vsIndustryAverage: number // Percentage difference
  }

  // Coverage recommendations
  coverageRecommendations: {
    coverage: IndustryCoverageRequirement
    customizedLimit: number
    priority: number
    rationale: string
  }[]

  // Risk mitigation plan
  mitigationPlan: {
    priority: 'critical' | 'high' | 'medium' | 'low'
    action: string
    actionTr: string
    expectedImpact: number // Risk score reduction
    estimatedCost?: number
    timeline: string
  }[]

  // Peer comparison
  peerComparison: {
    percentile: number // Where this business ranks
    betterThan: number // Percentage of peers with higher risk
    keyDifferences: string[]
  }

  // Generated at
  assessedAt: number
  validUntil: number
}

// =============================================================================
// Industry Comparison
// =============================================================================

/**
 * Compare two industries
 */
export interface IndustryComparison {
  industry1: IndustrySector
  industry2: IndustrySector

  riskDifference: {
    overall: number
    byCategory: Record<IndustryRiskCategory, number>
  }

  premiumDifference: number // Percentage

  coverageDifferences: {
    coverage: string
    industry1Importance: string
    industry2Importance: string
  }[]

  insights: {
    type: 'advantage' | 'disadvantage' | 'neutral'
    message: string
    messageTr: string
  }[]
}

/**
 * Industry ranking by metric
 */
export interface IndustryRanking {
  metric: 'risk' | 'premium' | 'claims' | 'growth'
  rankings: {
    rank: number
    sector: IndustrySector
    value: number
    trend: 'up' | 'down' | 'stable'
  }[]
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Business size definitions (Turkish KOSGEB standards)
 */
export const BUSINESS_SIZE_DEFINITIONS: BusinessSizeDefinition[] = [
  {
    size: 'micro',
    maxEmployees: 10,
    maxRevenue: 5000000,
    description: 'Micro enterprise (1-9 employees)',
    descriptionTr: 'Mikro işletme (1-9 çalışan)',
  },
  {
    size: 'small',
    maxEmployees: 50,
    maxRevenue: 50000000,
    description: 'Small enterprise (10-49 employees)',
    descriptionTr: 'Küçük işletme (10-49 çalışan)',
  },
  {
    size: 'medium',
    maxEmployees: 250,
    maxRevenue: 250000000,
    description: 'Medium enterprise (50-249 employees)',
    descriptionTr: 'Orta işletme (50-249 çalışan)',
  },
  {
    size: 'large',
    maxEmployees: 1000,
    maxRevenue: 1000000000,
    description: 'Large enterprise (250-999 employees)',
    descriptionTr: 'Büyük işletme (250-999 çalışan)',
  },
  {
    size: 'enterprise',
    maxEmployees: Infinity,
    maxRevenue: Infinity,
    description: 'Enterprise (1000+ employees)',
    descriptionTr: 'Kurumsal (1000+ çalışan)',
  },
]

/**
 * Industry category weights (default)
 */
export const DEFAULT_INDUSTRY_CATEGORY_WEIGHTS: Record<IndustryRiskCategory, number> = {
  operational: 0.15,
  property: 0.12,
  liability: 0.15,
  employee: 0.10,
  cyber: 0.10,
  environmental: 0.05,
  product: 0.08,
  business_interruption: 0.10,
  regulatory: 0.05,
  supply_chain: 0.05,
  reputation: 0.03,
  financial: 0.02,
}

/**
 * Get business size from metrics
 */
export function getBusinessSize(employees: number, revenue: number): BusinessSize {
  for (const def of BUSINESS_SIZE_DEFINITIONS) {
    if (employees <= def.maxEmployees && revenue <= def.maxRevenue) {
      return def.size
    }
  }
  return 'enterprise'
}

/**
 * Get Turkish name for industry sector
 */
export function getIndustrySectorNameTr(sector: IndustrySector): string {
  const names: Record<IndustrySector, string> = {
    manufacturing: 'İmalat',
    construction: 'İnşaat',
    retail: 'Perakende',
    wholesale: 'Toptan Ticaret',
    transportation: 'Ulaştırma',
    hospitality: 'Konaklama ve Yiyecek',
    healthcare: 'Sağlık',
    technology: 'Teknoloji',
    finance: 'Finans',
    real_estate: 'Gayrimenkul',
    professional_services: 'Profesyonel Hizmetler',
    education: 'Eğitim',
    agriculture: 'Tarım',
    mining: 'Madencilik',
    utilities: 'Kamu Hizmetleri',
    food_beverage: 'Gıda ve İçecek',
    textile: 'Tekstil',
    automotive: 'Otomotiv',
    chemical: 'Kimya',
    logistics: 'Lojistik',
  }
  return names[sector]
}
