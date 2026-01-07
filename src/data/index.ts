/**
 * Turkish Insurance Knowledge Database
 *
 * Comprehensive data for Turkish insurance market including:
 * - Insurance lines (branşlar) based on TSB/SEDDK classifications
 * - Coverage limits (teminat limitleri) with annual updates
 * - Regulations (mevzuat), general conditions (genel şartlar), and clauses (klozlar)
 * - Market benchmarks and premium data
 *
 * Sources:
 * - TSB (Türkiye Sigorta Birliği): https://www.tsb.org.tr
 * - SEDDK (Sigortacılık ve Özel Emeklilik Düzenleme ve Denetleme Kurumu): https://www.seddk.gov.tr
 * - DASK (Doğal Afet Sigortaları Kurumu): https://dask.gov.tr
 * - TARSİM (Tarım Sigortaları Havuzu): https://www.tarsim.gov.tr
 *
 * Last Updated: January 2026
 */

// =============================================================================
// INSURANCE LINES
// =============================================================================

export {
  // Types
  type InsuranceCategory,
  type InsuranceBranchCode,
  type InsuranceLine,
  type SubBranch,
  // Data
  NON_LIFE_INSURANCE_LINES,
  LIFE_INSURANCE_LINES,
  AGRICULTURAL_INSURANCE_LINES,
  ENGINEERING_INSURANCE_LINES,
  ALL_INSURANCE_LINES,
  MANDATORY_INSURANCES,
  // Helpers
  getInsuranceLineByCode,
  getSubBranchByCode,
  searchInsuranceLines,
  getMandatoryInsurances,
} from './insurance-lines'

// =============================================================================
// COVERAGE LIMITS & BENCHMARKS
// =============================================================================

export {
  // Types
  type CoverageLimit,
  type LimitDetail,
  type PremiumRange,
  // Traffic Insurance Limits
  TRAFFIC_INSURANCE_LIMITS_2025,
  TRAFFIC_INSURANCE_LIMITS_2026,
  // DASK Limits
  DASK_LIMITS_2024,
  DASK_MINIMUM_PREMIUMS_2024,
  // Other Mandatory Insurance Limits
  SEAT_ACCIDENT_LIMITS_2025,
  MEDICAL_MALPRACTICE_LIMITS_2025,
  // Benchmarks
  PREMIUM_BENCHMARKS,
  MARKET_DATA_2024,
  ALL_COVERAGE_LIMITS,
  // Helpers
  getCurrentTrafficLimits,
  getCurrentDaskLimits,
  getPremiumBenchmark,
  validateAgainstMinimumLimits,
} from './coverage-limits'

// =============================================================================
// REGULATIONS & GENERAL CONDITIONS
// =============================================================================

export {
  // Types
  type RegulationType,
  type InsuranceCategoryRef,
  type Regulation,
  type KeyProvision,
  type GeneralCondition,
  type StandardDeductible,
  type ClaimsProcess,
  type Clause,
  // Laws
  PRIMARY_LAWS,
  // General Conditions
  GENERAL_CONDITIONS,
  // Recent Circulars
  RECENT_CIRCULARS,
  // Clauses
  STANDARD_CLAUSES,
  ALL_REGULATIONS,
  ALL_CLAUSES,
  // Helpers
  getRegulationById,
  getGeneralConditionByCategory,
  getActiveRegulations,
  getClausesByCategory,
  searchRegulations,
  getLatestVersion,
  getRegulationHistory,
} from './regulations'

// =============================================================================
// COMBINED KNOWLEDGE BASE ACCESS
// =============================================================================

import { ALL_INSURANCE_LINES, searchInsuranceLines } from './insurance-lines'
import {
  ALL_COVERAGE_LIMITS,
  PREMIUM_BENCHMARKS,
  MARKET_DATA_2024,
} from './coverage-limits'
import { ALL_REGULATIONS, ALL_CLAUSES, searchRegulations } from './regulations'

/**
 * Search across all knowledge base data
 */
export function searchKnowledgeBase(query: string): {
  insuranceLines: typeof ALL_INSURANCE_LINES
  regulations: typeof ALL_REGULATIONS
  clauses: typeof ALL_CLAUSES
} {
  const q = query.toLowerCase()

  return {
    insuranceLines: searchInsuranceLines(query),
    regulations: searchRegulations(query),
    clauses: ALL_CLAUSES.filter(
      (c) =>
        c.nameTR.toLowerCase().includes(q) ||
        c.nameEN.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    ),
  }
}

/**
 * Get knowledge base statistics
 */
export function getKnowledgeBaseStats() {
  return {
    insuranceLines: ALL_INSURANCE_LINES.length,
    subBranches: ALL_INSURANCE_LINES.reduce((acc, l) => acc + l.subBranches.length, 0),
    coverageLimits: ALL_COVERAGE_LIMITS.length,
    premiumBenchmarks: PREMIUM_BENCHMARKS.length,
    regulations: ALL_REGULATIONS.length,
    clauses: ALL_CLAUSES.length,
    marketData: MARKET_DATA_2024,
    lastUpdated: '2026-01-07',
    sources: ['TSB', 'SEDDK', 'DASK', 'TARSİM', 'Resmi Gazete'],
  }
}

/**
 * Get data for a specific insurance type
 */
export function getInsuranceTypeData(typeCode: string) {
  const insuranceLine = ALL_INSURANCE_LINES.find(
    (l) => l.code === typeCode || l.subBranches.some((sb) => sb.code === typeCode)
  )

  if (!insuranceLine) return null

  // Get related regulations
  const categoryMap: Record<string, string> = {
    kara_araclari: 'kasko',
    kara_araclari_sorumluluk: 'traffic',
    zmss: 'traffic',
    yangin_dogal_afet: 'fire',
    dask: 'dask',
    saglik: 'health',
    hayat: 'life',
    kaza: 'accident',
    genel_sorumluluk: 'liability',
  }

  const category = categoryMap[typeCode] || 'all'

  const relatedRegulations = ALL_REGULATIONS.filter(
    (r) =>
      r.category.includes(category as never) || r.category.includes('all' as never)
  )

  const relatedClauses = ALL_CLAUSES.filter((c) =>
    c.category.includes(category as never)
  )

  const benchmark = PREMIUM_BENCHMARKS.find((b) => b.insuranceType === typeCode)

  return {
    insuranceLine,
    regulations: relatedRegulations,
    clauses: relatedClauses,
    premiumBenchmark: benchmark,
    marketShare: insuranceLine.marketShare2024,
    avgPremium: insuranceLine.avgPremium2024,
  }
}

/**
 * Get compliance requirements for a policy type
 */
export function getComplianceRequirements(policyType: string) {
  const requirements: {
    mandatory: boolean
    minimumLimits?: { type: string; amount: number; currency: string }[]
    requiredDocuments?: string[]
    regulatoryBody: string
    keyRegulations: string[]
  } = {
    mandatory: false,
    regulatoryBody: 'SEDDK',
    keyRegulations: [],
  }

  // Check if mandatory
  const insuranceLine = ALL_INSURANCE_LINES.find(
    (l) => l.code === policyType || l.subBranches.some((sb) => sb.code === policyType)
  )

  if (insuranceLine) {
    const subBranch = insuranceLine.subBranches.find((sb) => sb.code === policyType)
    requirements.mandatory = subBranch?.mandatory || insuranceLine.mandatory

    if (insuranceLine.keyRegulations) {
      requirements.keyRegulations = insuranceLine.keyRegulations
    }

    requirements.regulatoryBody = insuranceLine.regulatedBy
  }

  // Add minimum limits for mandatory insurances
  if (policyType === 'zmss' || policyType === 'traffic') {
    const limits = ALL_COVERAGE_LIMITS.find((l) => l.code.startsWith('zmss_'))
    if (limits) {
      requirements.minimumLimits = limits.limits.map((l) => ({
        type: l.coverageTypeTR,
        amount: l.perPerson || l.perAccident || l.perVehicle || l.maxLimit || 0,
        currency: l.currency,
      }))
    }
  }

  if (policyType === 'dask') {
    const limits = ALL_COVERAGE_LIMITS.find((l) => l.code === 'dask_2024')
    if (limits) {
      requirements.minimumLimits = limits.limits.map((l) => ({
        type: l.coverageTypeTR,
        amount: l.maxLimit || 0,
        currency: l.currency,
      }))
    }
  }

  return requirements
}
