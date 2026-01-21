/**
 * Hard-Gated QA Scoring
 *
 * Scores extraction quality with hard gates that cap the maximum score
 * when critical validation failures are detected.
 *
 * Gates:
 * - Missing policy number or dates → max 70
 * - Currency unknown when amounts exist → max 75
 * - VIN/plate in text but missing → max 65
 * - "Rayiç Değer" treated as numeric → max 60
 */

import type {
  KaskoExtractionJSON,
  QAGate,
  QAGateResult,
  QAScoreResult,
  ContradictionReport,
} from '@/types/extraction-pipeline'
import { quickScan } from './contradiction-detector'

// ============================================================================
// HARD GATES DEFINITION
// ============================================================================

const HARD_GATES: QAGate[] = [
  {
    id: 'policy-number-required',
    name: 'Policy Number Required',
    description: 'Policy number must be extracted if present in document',
    maxScoreIfFailed: 70,
    check: (extraction, text) => {
      // If we extracted a policy number, gate passes
      if (extraction.policyNumber) return true

      // Check if text likely contains a policy number
      const scan = quickScan(text)
      // If text has policy number but we didn't extract it, fail
      return !scan.hasPolicyNumber
    },
  },
  {
    id: 'dates-required',
    name: 'Dates Required',
    description: 'Start and end dates must be extracted',
    maxScoreIfFailed: 70,
    check: (extraction, _text) => {
      return Boolean(extraction.startDate && extraction.endDate)
    },
  },
  {
    id: 'currency-known',
    name: 'Currency Must Be Known',
    description: 'Currency must be identified when amounts exist',
    maxScoreIfFailed: 75,
    check: (extraction, _text) => {
      // If no amounts, gate passes
      const hasAmounts =
        extraction.premium?.gross != null ||
        extraction.premium?.net != null ||
        extraction.coverages.some((c) => c.limit != null)

      if (!hasAmounts) return true

      // Check currency is set
      return Boolean(extraction.premium?.currency && extraction.premium.currency !== 'unknown')
    },
  },
  {
    id: 'plate-captured',
    name: 'License Plate Captured',
    description: 'License plate must be extracted if present in document',
    maxScoreIfFailed: 65,
    check: (extraction, text) => {
      // If we have vehicles with plates, gate passes
      const hasExtractedPlate = extraction.vehicles.some((v) => v.plate)
      if (hasExtractedPlate) return true

      // Check if text likely contains a plate
      const scan = quickScan(text)
      // If text has plate but we didn't extract it, fail
      return !scan.hasPlate
    },
  },
  {
    id: 'vin-captured',
    name: 'VIN Captured',
    description: 'VIN/Chassis number must be extracted if present in document',
    maxScoreIfFailed: 65,
    check: (extraction, text) => {
      // If we have vehicles with VIN, gate passes
      const hasExtractedVIN = extraction.vehicles.some((v) => v.chassisNo)
      if (hasExtractedVIN) return true

      // Check if text likely contains a VIN
      const scan = quickScan(text)
      // If text has VIN but we didn't extract it, fail
      return !scan.hasVIN
    },
  },
  {
    id: 'rayic-deger-handling',
    name: 'Market Value Handling',
    description: '"Rayiç Değer" must be flagged as market value, not treated as numeric',
    maxScoreIfFailed: 60,
    check: (extraction, text) => {
      const textLower = text.toLowerCase()
      const hasRayicDeger =
        textLower.includes('rayiç değer') ||
        textLower.includes('rayic deger') ||
        textLower.includes('piyasa değeri')

      if (!hasRayicDeger) return true

      // Check if any vehicle properly has isMarketValue=true
      const hasMarketValueFlag = extraction.vehicles.some((v) => v.vehicleValue?.isMarketValue === true)

      // Also check coverages
      const coverageHasMarketValue = extraction.coverages.some((c) => c.isMarketValue === true)

      return hasMarketValueFlag || coverageHasMarketValue
    },
  },
  {
    id: 'provider-extracted',
    name: 'Insurance Provider Extracted',
    description: 'Insurance provider/company name must be identified',
    maxScoreIfFailed: 75,
    check: (extraction, _text) => {
      return Boolean(extraction.provider && extraction.provider.trim().length > 0)
    },
  },
  {
    id: 'at-least-one-coverage',
    name: 'Coverage Extracted',
    description: 'At least one coverage must be extracted',
    maxScoreIfFailed: 60,
    check: (extraction, _text) => {
      return extraction.coverages.length > 0
    },
  },
]

// ============================================================================
// SCORING COMPONENTS
// ============================================================================

/**
 * Calculate base score from extraction completeness
 */
function calculateBaseScore(extraction: KaskoExtractionJSON): {
  score: number
  details: { field: string; score: number; weight: number }[]
} {
  const fields: { field: string; check: () => boolean; weight: number }[] = [
    // Critical fields (high weight)
    { field: 'policyNumber', check: () => Boolean(extraction.policyNumber), weight: 15 },
    { field: 'provider', check: () => Boolean(extraction.provider), weight: 10 },
    { field: 'startDate', check: () => Boolean(extraction.startDate), weight: 10 },
    { field: 'endDate', check: () => Boolean(extraction.endDate), weight: 10 },
    { field: 'premium', check: () => extraction.premium?.gross != null, weight: 10 },

    // Important fields (medium weight)
    { field: 'insuredName', check: () => Boolean(extraction.insured?.name), weight: 8 },
    { field: 'vehiclePlate', check: () => extraction.vehicles.some((v) => v.plate), weight: 8 },
    { field: 'vehicleMake', check: () => extraction.vehicles.some((v) => v.make), weight: 5 },
    { field: 'vehicleModel', check: () => extraction.vehicles.some((v) => v.model), weight: 5 },
    { field: 'coverages', check: () => extraction.coverages.length > 0, weight: 10 },

    // Optional but valuable (lower weight)
    { field: 'chassisNo', check: () => extraction.vehicles.some((v) => v.chassisNo), weight: 3 },
    { field: 'engineNo', check: () => extraction.vehicles.some((v) => v.engineNo), weight: 2 },
    { field: 'insuredAddress', check: () => Boolean(extraction.insured?.address), weight: 2 },
    { field: 'agencyName', check: () => Boolean(extraction.agencyName), weight: 2 },
  ]

  const details: { field: string; score: number; weight: number }[] = []
  let totalWeight = 0
  let earnedScore = 0

  for (const { field, check, weight } of fields) {
    const passed = check()
    const fieldScore = passed ? weight : 0
    details.push({ field, score: fieldScore, weight })
    totalWeight += weight
    earnedScore += fieldScore
  }

  // Normalize to 0-100
  const normalizedScore = totalWeight > 0 ? (earnedScore / totalWeight) * 100 : 0

  return {
    score: Math.round(normalizedScore),
    details,
  }
}

/**
 * Calculate bonus points for high-quality extraction
 */
function calculateBonuses(
  extraction: KaskoExtractionJSON,
  contradictions: ContradictionReport
): { reason: string; points: number }[] {
  const bonuses: { reason: string; points: number }[] = []

  // Bonus for no contradictions
  if (contradictions.summary.total === 0) {
    bonuses.push({ reason: 'No contradictions detected', points: 5 })
  }

  // Bonus for high confidence
  if (extraction.extractionConfidence >= 0.9) {
    bonuses.push({ reason: 'High extraction confidence (≥90%)', points: 3 })
  }

  // Bonus for complete vehicle info
  const hasCompleteVehicle = extraction.vehicles.some(
    (v) => v.plate && v.make && v.model && v.year && v.chassisNo
  )
  if (hasCompleteVehicle) {
    bonuses.push({ reason: 'Complete vehicle information', points: 3 })
  }

  // Bonus for multiple coverages extracted
  if (extraction.coverages.length >= 5) {
    bonuses.push({ reason: 'Rich coverage extraction (5+ coverages)', points: 2 })
  }

  // Bonus for exclusions extracted
  if (extraction.exclusions.length >= 3) {
    bonuses.push({ reason: 'Exclusions documented', points: 2 })
  }

  return bonuses
}

/**
 * Calculate deductions for quality issues
 */
function calculateDeductions(
  extraction: KaskoExtractionJSON,
  contradictions: ContradictionReport
): { reason: string; points: number }[] {
  const deductions: { reason: string; points: number }[] = []

  // Deduction for critical contradictions
  if (contradictions.summary.critical > 0) {
    deductions.push({
      reason: `${contradictions.summary.critical} critical contradiction(s)`,
      points: contradictions.summary.critical * 10,
    })
  }

  // Deduction for high-severity contradictions
  if (contradictions.summary.high > 0) {
    deductions.push({
      reason: `${contradictions.summary.high} high-severity contradiction(s)`,
      points: contradictions.summary.high * 5,
    })
  }

  // Deduction for low confidence
  if (extraction.extractionConfidence < 0.6) {
    deductions.push({ reason: 'Low extraction confidence (<60%)', points: 10 })
  } else if (extraction.extractionConfidence < 0.75) {
    deductions.push({ reason: 'Moderate extraction confidence (<75%)', points: 5 })
  }

  // Deduction for missing premium breakdown
  if (extraction.premium?.gross && !extraction.premium?.net && !extraction.premium?.tax) {
    deductions.push({ reason: 'Incomplete premium breakdown', points: 3 })
  }

  // Deduction for no vehicle year
  const missingYearCount = extraction.vehicles.filter((v) => v.plate && !v.year).length
  if (missingYearCount > 0) {
    deductions.push({ reason: `${missingYearCount} vehicle(s) missing year`, points: 2 })
  }

  return deductions
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Calculate QA score with hard gates
 */
export function calculateQAScore(
  extraction: KaskoExtractionJSON,
  normalizedText: string,
  contradictions: ContradictionReport
): QAScoreResult {
  // Run hard gates
  const gateResults: QAGateResult[] = HARD_GATES.map((gate) => {
    const passed = gate.check(extraction, normalizedText)
    return {
      gateId: gate.id,
      gateName: gate.name,
      passed,
      details: passed
        ? `Gate passed: ${gate.description}`
        : `Gate failed: ${gate.description}`,
      maxScoreIfFailed: gate.maxScoreIfFailed,
    }
  })

  const passedGates = gateResults.filter((g) => g.passed)
  const failedGates = gateResults.filter((g) => !g.passed)

  // Calculate base score
  const baseResult = calculateBaseScore(extraction)

  // Calculate bonuses and deductions
  const bonuses = calculateBonuses(extraction, contradictions)
  const deductions = calculateDeductions(extraction, contradictions)

  // Sum up
  const totalBonus = bonuses.reduce((sum, b) => sum + b.points, 0)
  const totalDeduction = deductions.reduce((sum, d) => sum + d.points, 0)

  let score = baseResult.score + totalBonus - totalDeduction

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score))

  // Apply hard gate caps
  for (const failedGate of failedGates) {
    if (failedGate.maxScoreIfFailed !== undefined) {
      score = Math.min(score, failedGate.maxScoreIfFailed)
    }
  }

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F'
  if (score >= 90) grade = 'A'
  else if (score >= 75) grade = 'B'
  else if (score >= 60) grade = 'C'
  else if (score >= 40) grade = 'D'
  else grade = 'F'

  // Generate recommendations
  const recommendations: string[] = []

  for (const failedGate of failedGates) {
    switch (failedGate.gateId) {
      case 'policy-number-required':
        recommendations.push('Extract policy number from document header or footer')
        break
      case 'dates-required':
        recommendations.push('Ensure start and end dates are captured from coverage period section')
        break
      case 'currency-known':
        recommendations.push('Identify currency from premium amounts (TRY is default for Turkish policies)')
        break
      case 'plate-captured':
        recommendations.push('Extract license plate from vehicle details section')
        break
      case 'vin-captured':
        recommendations.push('Extract chassis/VIN number from vehicle identification section')
        break
      case 'rayic-deger-handling':
        recommendations.push('Flag "Rayiç Değer" (market value) properly instead of treating as numeric')
        break
      case 'provider-extracted':
        recommendations.push('Extract insurance company name from document header')
        break
      case 'at-least-one-coverage':
        recommendations.push('Extract coverage details from TEMİNATLAR section')
        break
    }
  }

  if (contradictions.summary.critical > 0) {
    recommendations.push('Review and resolve critical contradictions before finalizing')
  }

  if (extraction.extractionConfidence < 0.75) {
    recommendations.push('Consider re-running extraction with better quality source document')
  }

  return {
    score: Math.round(score),
    grade,
    passedGates,
    failedGates,
    scoreBreakdown: {
      baseScore: baseResult.score,
      deductions,
      bonuses,
    },
    recommendations,
  }
}

/**
 * Quick quality check - returns true if extraction meets minimum quality
 */
export function meetsMinimumQuality(qaScore: QAScoreResult): boolean {
  // Minimum requirements:
  // - Score >= 60
  // - No more than 1 failed critical gate
  // - Grade at least C

  const criticalGates = ['policy-number-required', 'dates-required', 'at-least-one-coverage']
  const failedCriticalGates = qaScore.failedGates.filter((g) => criticalGates.includes(g.gateId))

  return qaScore.score >= 60 && failedCriticalGates.length <= 1 && qaScore.grade !== 'F'
}

/**
 * Get human-readable quality summary
 */
export function getQualitySummary(qaScore: QAScoreResult): string {
  const { score, grade, failedGates } = qaScore

  if (grade === 'A') {
    return 'Excellent extraction quality. All critical fields captured with high confidence.'
  }

  if (grade === 'B') {
    return 'Good extraction quality. Minor improvements possible.'
  }

  if (grade === 'C') {
    const issues = failedGates.map((g) => g.gateName).join(', ')
    return `Fair extraction quality. Issues: ${issues}`
  }

  if (grade === 'D') {
    return `Poor extraction quality (score: ${score}). Multiple critical fields missing or contradictions detected.`
  }

  return `Critical extraction quality issues (score: ${score}). Extraction may be unusable without manual review.`
}
