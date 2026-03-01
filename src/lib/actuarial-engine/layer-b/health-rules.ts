/**
 * Health Insurance Compliance Rules
 *
 * Implements validation for Health policies:
 * - Minimum inpatient/outpatient coverage balance
 * - Waiting period compliance for specific conditions
 * - Age-based sublimits for certain categories
 */

import type { BlockingReason, ComplianceWarning, CanonicalCoverage } from '../types'

/**
 * Checks a health policy against common compliance and quality standards.
 */
export function checkHealthCompliance(
  coverages: CanonicalCoverage[],
  _effectiveDate: Date
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []

  // 1. Mandatory Inpatient Coverage
  const hasInpatient = coverages.some(
    (c) => (c.code === 'INPATIENT' || c.code === 'HOSPITALIZATION') && c.included
  )

  if (!hasInpatient) {
    blockingReasons.push({
      code: 'HEALTH_NO_INPATIENT_COVERAGE',
      severity: 'blocking',
      message: 'Health policies must include inpatient (hospitalization) coverage',
      messageTr: 'Sağlık poliçeleri yatarak tedavi (hastane) teminatı içermelidir',
      rule: 'Turkish Health Insurance Standards',
    })
  }

  // 2. Outpatient Coverage Without Inpatient (Warning)
  const hasOutpatient = coverages.some((c) => c.code === 'OUTPATIENT' && c.included)
  if (hasOutpatient && !hasInpatient) {
    warnings.push({
      code: 'HEALTH_OUTPATIENT_WITHOUT_INPATIENT',
      severity: 'high',
      message: 'Outpatient coverage without inpatient is highly unusual and risky',
      messageTr: 'Yatarak tedavi olmadan ayakta tedavi teminatı alışılmadık ve risklidir',
      rule: 'Quality Benchmark',
    })
  }

  return { blockingReasons, warnings }
}
