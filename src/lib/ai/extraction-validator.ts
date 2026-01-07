/**
 * Post-Extraction Validation
 *
 * Validates extracted policy data for consistency and completeness.
 * Provides type-specific validation rules and quality scoring.
 */

import type { PolicyType } from '@/types/policy'
import type { ExtendedExtractedPolicyData } from './extraction-schema-extended'
import {
  parseTurkishDate,
  parseTurkishPlate,
  normalizeCoverageName,
} from './turkish-utils'

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: ValidationSeverity
  field: string
  message: string
  messageTr: string
  suggestion?: string
  suggestionTr?: string
}

export interface ValidationResult {
  isValid: boolean
  score: number // 0-100 quality score
  issues: ValidationIssue[]
  summary: {
    errors: number
    warnings: number
    infos: number
  }
}

// =============================================================================
// MARKET BENCHMARKS FOR VALIDATION
// =============================================================================

interface PremiumRange {
  min: number
  max: number
  typical: number
}

const PREMIUM_RANGES: Record<PolicyType, PremiumRange> = {
  kasko: { min: 8000, max: 45000, typical: 18500 },
  traffic: { min: 2500, max: 8500, typical: 4200 },
  home: { min: 2500, max: 18000, typical: 5800 },
  health: { min: 12000, max: 95000, typical: 32000 },
  life: { min: 3500, max: 35000, typical: 9500 },
  dask: { min: 250, max: 3500, typical: 850 },
  business: { min: 5000, max: 150000, typical: 28000 },
}

// Minimum liability limits (SEDDK 2024)
const MINIMUM_TRAFFIC_LIMITS = {
  bodilyInjuryPerPerson: 1200000,
  propertyDamage: 300000,
}

// =============================================================================
// BASE VALIDATION
// =============================================================================

/**
 * Validate base fields that apply to all policy types
 */
function validateBaseFields(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Policy number
  if (!data.policyNumber) {
    issues.push({
      severity: 'warning',
      field: 'policyNumber',
      message: 'Policy number not extracted',
      messageTr: 'Poliçe numarası çıkarılamadı',
      suggestion: 'Check document header for policy/certificate number',
      suggestionTr: 'Belge başlığında poliçe numarasını kontrol edin',
    })
  }

  // Provider
  if (!data.provider) {
    issues.push({
      severity: 'warning',
      field: 'provider',
      message: 'Insurance provider not identified',
      messageTr: 'Sigorta şirketi tespit edilemedi',
    })
  }

  // Dates
  if (!data.startDate) {
    issues.push({
      severity: 'error',
      field: 'startDate',
      message: 'Start date not extracted',
      messageTr: 'Başlangıç tarihi çıkarılamadı',
    })
  } else {
    const parsed = parseTurkishDate(data.startDate)
    if (!parsed) {
      issues.push({
        severity: 'warning',
        field: 'startDate',
        message: `Invalid date format: ${data.startDate}`,
        messageTr: `Geçersiz tarih formatı: ${data.startDate}`,
        suggestion: 'Expected format: YYYY-MM-DD',
        suggestionTr: 'Beklenen format: YYYY-MM-DD',
      })
    }
  }

  if (!data.endDate) {
    issues.push({
      severity: 'error',
      field: 'endDate',
      message: 'End date not extracted',
      messageTr: 'Bitiş tarihi çıkarılamadı',
    })
  }

  // Validate date logic
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)

    if (end <= start) {
      issues.push({
        severity: 'error',
        field: 'dates',
        message: 'End date must be after start date',
        messageTr: 'Bitiş tarihi başlangıç tarihinden sonra olmalı',
      })
    }

    const termDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (termDays > 400) {
      issues.push({
        severity: 'warning',
        field: 'dates',
        message: `Policy term (${Math.round(termDays)} days) seems unusually long`,
        messageTr: `Poliçe süresi (${Math.round(termDays)} gün) olağandışı uzun görünüyor`,
      })
    }
  }

  // Premium
  if (data.premium === null || data.premium === undefined) {
    issues.push({
      severity: 'warning',
      field: 'premium',
      message: 'Premium amount not extracted',
      messageTr: 'Prim tutarı çıkarılamadı',
    })
  } else if (data.premium <= 0) {
    issues.push({
      severity: 'error',
      field: 'premium',
      message: 'Premium must be a positive number',
      messageTr: 'Prim pozitif bir sayı olmalı',
    })
  }

  // Coverages
  if (!data.coverages || data.coverages.length === 0) {
    issues.push({
      severity: 'warning',
      field: 'coverages',
      message: 'No coverage details extracted',
      messageTr: 'Teminat detayları çıkarılamadı',
    })
  }

  // Confidence check
  if (data.confidence.overall < 0.5) {
    issues.push({
      severity: 'warning',
      field: 'confidence',
      message: `Low extraction confidence (${(data.confidence.overall * 100).toFixed(0)}%)`,
      messageTr: `Düşük çıkarım güveni (%${(data.confidence.overall * 100).toFixed(0)})`,
      suggestion: 'Consider manual review of extracted data',
      suggestionTr: 'Çıkarılan verilerin manuel kontrolünü düşünün',
    })
  }

  return issues
}

// =============================================================================
// KASKO VALIDATION
// =============================================================================

function validateKasko(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Check premium range
  if (data.premium) {
    const range = PREMIUM_RANGES.kasko
    if (data.premium < range.min) {
      issues.push({
        severity: 'warning',
        field: 'premium',
        message: `Premium (${data.premium} TRY) is below typical Kasko range (${range.min}-${range.max} TRY)`,
        messageTr: `Prim (${data.premium} TL) tipik Kasko aralığının altında (${range.min}-${range.max} TL)`,
      })
    } else if (data.premium > range.max) {
      issues.push({
        severity: 'info',
        field: 'premium',
        message: `Premium (${data.premium} TRY) is above typical Kasko range`,
        messageTr: `Prim (${data.premium} TL) tipik Kasko aralığının üstünde`,
      })
    }
  }

  // Vehicle info
  if (!data.vehicle) {
    issues.push({
      severity: 'warning',
      field: 'vehicle',
      message: 'Vehicle information not extracted',
      messageTr: 'Araç bilgileri çıkarılamadı',
    })
  } else {
    // Plate number
    if (data.vehicle.plateNumber) {
      const plate = parseTurkishPlate(data.vehicle.plateNumber)
      if (!plate) {
        issues.push({
          severity: 'warning',
          field: 'vehicle.plateNumber',
          message: `Invalid plate format: ${data.vehicle.plateNumber}`,
          messageTr: `Geçersiz plaka formatı: ${data.vehicle.plateNumber}`,
        })
      }
    } else {
      issues.push({
        severity: 'warning',
        field: 'vehicle.plateNumber',
        message: 'Plate number not extracted',
        messageTr: 'Plaka numarası çıkarılamadı',
      })
    }

    // Vehicle year
    if (data.vehicle.year) {
      const currentYear = new Date().getFullYear()
      if (data.vehicle.year < 1990 || data.vehicle.year > currentYear + 1) {
        issues.push({
          severity: 'warning',
          field: 'vehicle.year',
          message: `Vehicle year (${data.vehicle.year}) seems invalid`,
          messageTr: `Araç yılı (${data.vehicle.year}) geçersiz görünüyor`,
        })
      }
    }

    // Vehicle value
    if (data.vehicle.vehicleValue && data.vehicle.vehicleValue < 50000) {
      issues.push({
        severity: 'info',
        field: 'vehicle.vehicleValue',
        message: 'Vehicle value seems low for Kasko coverage',
        messageTr: 'Araç değeri Kasko teminatı için düşük görünüyor',
      })
    }
  }

  // Check for expected coverages
  const expectedCoverages = ['hasar', 'hirsizlik', 'yangin', 'deprem', 'sel']
  const coverageNames = (data.coverages || []).map((c) => normalizeCoverageName(c.name))

  const missingCoverages = expectedCoverages.filter(
    (exp) => !coverageNames.some((name) => name.includes(exp))
  )

  if (missingCoverages.length > 0) {
    issues.push({
      severity: 'info',
      field: 'coverages',
      message: `Some common Kasko coverages may be missing: ${missingCoverages.join(', ')}`,
      messageTr: `Bazı yaygın Kasko teminatları eksik olabilir: ${missingCoverages.join(', ')}`,
    })
  }

  return issues
}

// =============================================================================
// TRAFFIC INSURANCE VALIDATION
// =============================================================================

function validateTraffic(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Premium range
  if (data.premium) {
    const range = PREMIUM_RANGES.traffic
    if (data.premium < range.min * 0.8) {
      issues.push({
        severity: 'warning',
        field: 'premium',
        message: `Premium (${data.premium} TRY) is unusually low for Traffic Insurance`,
        messageTr: `Prim (${data.premium} TL) Trafik Sigortası için olağandışı düşük`,
      })
    }
  }

  // Traffic liability limits
  if (data.trafficLimits) {
    // Check minimum bodily injury limit
    if (
      data.trafficLimits.bodilyInjuryPerPerson &&
      data.trafficLimits.bodilyInjuryPerPerson < MINIMUM_TRAFFIC_LIMITS.bodilyInjuryPerPerson
    ) {
      issues.push({
        severity: 'error',
        field: 'trafficLimits.bodilyInjuryPerPerson',
        message: `Bodily injury limit (${data.trafficLimits.bodilyInjuryPerPerson} TRY) is below SEDDK minimum (${MINIMUM_TRAFFIC_LIMITS.bodilyInjuryPerPerson} TRY)`,
        messageTr: `Kişi başı bedeni hasar limiti (${data.trafficLimits.bodilyInjuryPerPerson} TL) SEDDK minimumunun altında (${MINIMUM_TRAFFIC_LIMITS.bodilyInjuryPerPerson} TL)`,
      })
    }

    // Check minimum property damage limit
    if (
      data.trafficLimits.propertyDamageLimit &&
      data.trafficLimits.propertyDamageLimit < MINIMUM_TRAFFIC_LIMITS.propertyDamage
    ) {
      issues.push({
        severity: 'error',
        field: 'trafficLimits.propertyDamageLimit',
        message: `Property damage limit (${data.trafficLimits.propertyDamageLimit} TRY) is below SEDDK minimum (${MINIMUM_TRAFFIC_LIMITS.propertyDamage} TRY)`,
        messageTr: `Maddi hasar limiti (${data.trafficLimits.propertyDamageLimit} TL) SEDDK minimumunun altında (${MINIMUM_TRAFFIC_LIMITS.propertyDamage} TL)`,
      })
    }
  } else {
    issues.push({
      severity: 'warning',
      field: 'trafficLimits',
      message: 'Traffic liability limits not extracted',
      messageTr: 'Trafik sorumluluk limitleri çıkarılamadı',
    })
  }

  // Vehicle info required for traffic
  if (!data.vehicle?.plateNumber) {
    issues.push({
      severity: 'warning',
      field: 'vehicle',
      message: 'Vehicle plate number required for Traffic Insurance',
      messageTr: 'Trafik Sigortası için araç plaka numarası gerekli',
    })
  }

  return issues
}

// =============================================================================
// HOME INSURANCE VALIDATION
// =============================================================================

function validateHome(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Premium range
  if (data.premium) {
    const range = PREMIUM_RANGES.home
    if (data.premium < range.min) {
      issues.push({
        severity: 'info',
        field: 'premium',
        message: `Premium (${data.premium} TRY) is below typical home insurance range`,
        messageTr: `Prim (${data.premium} TL) tipik konut sigortası aralığının altında`,
      })
    }
  }

  // Property info
  if (!data.property) {
    issues.push({
      severity: 'warning',
      field: 'property',
      message: 'Property information not extracted',
      messageTr: 'Mülk bilgileri çıkarılamadı',
    })
  } else {
    // Building value
    if (!data.property.buildingValue && !data.property.contentsValue) {
      issues.push({
        severity: 'warning',
        field: 'property',
        message: 'Neither building nor contents value extracted',
        messageTr: 'Bina veya eşya değeri çıkarılamadı',
      })
    }

    // Construction year
    if (data.property.constructionYear) {
      const currentYear = new Date().getFullYear()
      if (
        data.property.constructionYear < 1900 ||
        data.property.constructionYear > currentYear
      ) {
        issues.push({
          severity: 'warning',
          field: 'property.constructionYear',
          message: `Construction year (${data.property.constructionYear}) seems invalid`,
          messageTr: `İnşaat yılı (${data.property.constructionYear}) geçersiz görünüyor`,
        })
      }
    }

    // Area
    if (data.property.totalArea && (data.property.totalArea < 20 || data.property.totalArea > 2000)) {
      issues.push({
        severity: 'info',
        field: 'property.totalArea',
        message: `Property area (${data.property.totalArea} m²) is unusual`,
        messageTr: `Mülk alanı (${data.property.totalArea} m²) olağandışı`,
      })
    }
  }

  // Check for DASK requirement
  const coverageNames = (data.coverages || []).map((c) => normalizeCoverageName(c.name))
  const hasEarthquake = coverageNames.some(
    (name) => name.includes('deprem') || name.includes('earthquake')
  )

  if (!hasEarthquake) {
    issues.push({
      severity: 'warning',
      field: 'coverages',
      message: 'Earthquake coverage not found - DASK may be required separately',
      messageTr: 'Deprem teminatı bulunamadı - DASK ayrıca gerekebilir',
    })
  }

  return issues
}

// =============================================================================
// HEALTH INSURANCE VALIDATION
// =============================================================================

function validateHealth(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Premium range
  if (data.premium) {
    const range = PREMIUM_RANGES.health
    if (data.premium < range.min) {
      issues.push({
        severity: 'warning',
        field: 'premium',
        message: `Health insurance premium (${data.premium} TRY) seems low`,
        messageTr: `Sağlık sigortası primi (${data.premium} TL) düşük görünüyor`,
      })
    }
  }

  // Cost sharing info
  if (!data.healthCostSharing) {
    issues.push({
      severity: 'info',
      field: 'healthCostSharing',
      message: 'Cost sharing details (copay, deductible) not extracted',
      messageTr: 'Katılım payı detayları çıkarılamadı',
    })
  } else {
    // Copay percentage validation
    if (
      data.healthCostSharing.copayPercentage !== null &&
      (data.healthCostSharing.copayPercentage < 0 || data.healthCostSharing.copayPercentage > 50)
    ) {
      issues.push({
        severity: 'warning',
        field: 'healthCostSharing.copayPercentage',
        message: `Copay percentage (${data.healthCostSharing.copayPercentage}%) seems unusual`,
        messageTr: `Katılım payı oranı (%${data.healthCostSharing.copayPercentage}) olağandışı görünüyor`,
      })
    }
  }

  // Health limits
  if (!data.healthLimits) {
    issues.push({
      severity: 'warning',
      field: 'healthLimits',
      message: 'Health coverage limits not extracted',
      messageTr: 'Sağlık teminat limitleri çıkarılamadı',
    })
  }

  // Waiting periods
  if (data.healthWaiting) {
    if (data.healthWaiting.maternity && data.healthWaiting.maternity > 365) {
      issues.push({
        severity: 'info',
        field: 'healthWaiting.maternity',
        message: `Maternity waiting period (${data.healthWaiting.maternity} days) is unusually long`,
        messageTr: `Doğum bekleme süresi (${data.healthWaiting.maternity} gün) olağandışı uzun`,
      })
    }
  }

  return issues
}

// =============================================================================
// LIFE INSURANCE VALIDATION
// =============================================================================

function validateLife(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Sum assured
  if (!data.sumAssured) {
    issues.push({
      severity: 'warning',
      field: 'sumAssured',
      message: 'Sum assured (death benefit) not extracted',
      messageTr: 'Sigorta bedeli (vefat teminatı) çıkarılamadı',
    })
  }

  // Beneficiaries
  if (!data.lifeBeneficiaries || data.lifeBeneficiaries.length === 0) {
    issues.push({
      severity: 'warning',
      field: 'lifeBeneficiaries',
      message: 'Beneficiary information not extracted',
      messageTr: 'Lehdar bilgileri çıkarılamadı',
    })
  } else {
    // Check beneficiary percentages sum to 100
    const totalPercentage = data.lifeBeneficiaries.reduce(
      (sum, b) => sum + (b.percentage || 0),
      0
    )
    if (totalPercentage > 0 && Math.abs(totalPercentage - 100) > 1) {
      issues.push({
        severity: 'warning',
        field: 'lifeBeneficiaries',
        message: `Beneficiary percentages sum to ${totalPercentage}%, not 100%`,
        messageTr: `Lehdar yüzdeleri toplamı %${totalPercentage}, %100 değil`,
      })
    }
  }

  // Policy variant
  if (!data.policyVariant) {
    issues.push({
      severity: 'info',
      field: 'policyVariant',
      message: 'Life insurance type (term/whole/endowment) not identified',
      messageTr: 'Hayat sigortası türü (vadeli/ömür boyu/karma) tespit edilemedi',
    })
  }

  return issues
}

// =============================================================================
// DASK VALIDATION
// =============================================================================

function validateDask(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Premium range for DASK
  if (data.premium) {
    const range = PREMIUM_RANGES.dask
    if (data.premium < range.min) {
      issues.push({
        severity: 'warning',
        field: 'premium',
        message: `DASK premium (${data.premium} TRY) seems too low`,
        messageTr: `DASK primi (${data.premium} TL) çok düşük görünüyor`,
      })
    }
    if (data.premium > range.max * 1.5) {
      issues.push({
        severity: 'warning',
        field: 'premium',
        message: `DASK premium (${data.premium} TRY) seems unusually high`,
        messageTr: `DASK primi (${data.premium} TL) olağandışı yüksek görünüyor`,
      })
    }
  }

  // DASK building info
  if (!data.daskBuilding) {
    issues.push({
      severity: 'warning',
      field: 'daskBuilding',
      message: 'DASK building information not extracted',
      messageTr: 'DASK bina bilgileri çıkarılamadı',
    })
  } else {
    // Building class
    if (!data.daskBuilding.buildingClass) {
      issues.push({
        severity: 'warning',
        field: 'daskBuilding.buildingClass',
        message: 'Building class (A/B) not identified',
        messageTr: 'Yapı tarzı (A/B) tespit edilemedi',
      })
    }

    // Total area
    if (!data.daskBuilding.totalArea) {
      issues.push({
        severity: 'warning',
        field: 'daskBuilding.totalArea',
        message: 'Building area not extracted',
        messageTr: 'Bina alanı çıkarılamadı',
      })
    } else if (data.daskBuilding.totalArea > 320) {
      // DASK has coverage limits
      issues.push({
        severity: 'info',
        field: 'daskBuilding.totalArea',
        message: `Large area (${data.daskBuilding.totalArea} m²) may exceed DASK coverage limits`,
        messageTr: `Büyük alan (${data.daskBuilding.totalArea} m²) DASK teminat limitlerini aşabilir`,
      })
    }

    // Earthquake zone
    if (!data.daskBuilding.earthquakeZone) {
      issues.push({
        severity: 'info',
        field: 'daskBuilding.earthquakeZone',
        message: 'Earthquake zone not identified',
        messageTr: 'Deprem bölgesi tespit edilemedi',
      })
    }
  }

  return issues
}

// =============================================================================
// BUSINESS INSURANCE VALIDATION
// =============================================================================

function validateBusiness(data: ExtendedExtractedPolicyData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Premium range
  if (data.premium) {
    const range = PREMIUM_RANGES.business
    if (data.premium < range.min * 0.5) {
      issues.push({
        severity: 'warning',
        field: 'premium',
        message: `Business insurance premium (${data.premium} TRY) seems low`,
        messageTr: `İşyeri sigortası primi (${data.premium} TL) düşük görünüyor`,
      })
    }
  }

  // Business info
  if (!data.business) {
    issues.push({
      severity: 'warning',
      field: 'business',
      message: 'Business information not extracted',
      messageTr: 'İşletme bilgileri çıkarılamadı',
    })
  } else {
    if (!data.business.businessType) {
      issues.push({
        severity: 'info',
        field: 'business.businessType',
        message: 'Business type not identified',
        messageTr: 'İşyeri türü tespit edilemedi',
      })
    }
  }

  // Business values
  if (!data.businessValues) {
    issues.push({
      severity: 'warning',
      field: 'businessValues',
      message: 'Business asset values not extracted',
      messageTr: 'İşyeri varlık değerleri çıkarılamadı',
    })
  }

  // Check for liability coverage
  if (!data.businessLiability?.publicLiabilityLimit) {
    issues.push({
      severity: 'info',
      field: 'businessLiability',
      message: 'Public liability coverage not found',
      messageTr: 'Üçüncü şahıs sorumluluk teminatı bulunamadı',
    })
  }

  return issues
}

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validate extracted policy data
 * Returns validation result with issues and quality score
 */
export function validateExtraction(data: ExtendedExtractedPolicyData): ValidationResult {
  const issues: ValidationIssue[] = []

  // Run base validation
  issues.push(...validateBaseFields(data))

  // Run type-specific validation
  switch (data.policyType) {
    case 'kasko':
      issues.push(...validateKasko(data))
      break
    case 'traffic':
      issues.push(...validateTraffic(data))
      break
    case 'home':
      issues.push(...validateHome(data))
      break
    case 'health':
      issues.push(...validateHealth(data))
      break
    case 'life':
      issues.push(...validateLife(data))
      break
    case 'dask':
      issues.push(...validateDask(data))
      break
    case 'business':
      issues.push(...validateBusiness(data))
      break
  }

  // Calculate summary
  const summary = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  }

  // Calculate quality score (0-100)
  // Start at 100, deduct for issues
  let score = 100
  score -= summary.errors * 15 // Errors are severe
  score -= summary.warnings * 5 // Warnings are moderate
  score -= summary.infos * 1 // Info is minor

  // Bonus for high confidence
  if (data.confidence.overall >= 0.9) {
    score += 5
  }

  // Bonus for complete data
  const completenessBonus = calculateCompletenessBonus(data)
  score += completenessBonus

  // Clamp score
  score = Math.max(0, Math.min(100, score))

  return {
    isValid: summary.errors === 0,
    score: Math.round(score),
    issues,
    summary,
  }
}

/**
 * Calculate bonus points for data completeness
 */
function calculateCompletenessBonus(data: ExtendedExtractedPolicyData): number {
  let bonus = 0

  // Core fields present
  if (data.policyNumber) bonus += 1
  if (data.provider) bonus += 1
  if (data.startDate && data.endDate) bonus += 1
  if (data.premium) bonus += 1
  if (data.coverages && data.coverages.length > 0) bonus += 2

  // Type-specific fields present
  if (data.policyType === 'kasko' && data.vehicle) bonus += 2
  if (data.policyType === 'health' && data.healthLimits) bonus += 2
  if (data.policyType === 'dask' && data.daskBuilding) bonus += 2
  if (data.policyType === 'life' && data.lifeBeneficiaries) bonus += 2

  return Math.min(10, bonus) // Cap at 10 bonus points
}

/**
 * Get validation issues formatted for display
 */
export function formatValidationIssues(
  issues: ValidationIssue[],
  locale: 'en' | 'tr' = 'en'
): string[] {
  return issues.map((issue) => {
    const prefix =
      issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'
    const message = locale === 'tr' ? issue.messageTr : issue.message
    const suggestion =
      locale === 'tr' ? issue.suggestionTr : issue.suggestion

    return suggestion ? `${prefix} ${message} (${suggestion})` : `${prefix} ${message}`
  })
}
