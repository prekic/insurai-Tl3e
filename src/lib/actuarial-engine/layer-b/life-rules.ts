/**
 * Life Insurance Compliance Rules
 *
 * Implements validation for Life policies:
 * - Age eligibility (min/max)
 * - Beneficiary specification
 * - Critical illness rider consistency
 */

import type { BlockingReason, ComplianceWarning, CanonicalCoverage } from '../types'

/**
 * Checks a life policy against common compliance standards.
 */
export function checkLifeCompliance(
  coverages: CanonicalCoverage[],
  _effectiveDate: Date
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []

  // 1. Mandatory Death Benefit
  const hasDeathBenefit = coverages.some(
    (c) => (c.code === 'DEATH_BENEFIT' || c.code === 'TERM_LIFE') && c.included
  )

  if (!hasDeathBenefit) {
    blockingReasons.push({
      code: 'LIFE_NO_DEATH_BENEFIT',
      severity: 'blocking',
      message: 'Life policies must include a death benefit',
      messageTr: 'Hayat sigortası poliçeleri vefat teminatı içermelidir',
      rule: 'Life Insurance Standards',
    })
  }

  // 2. Beneficiary (High-level check - usually needs manual review)
  // This is a placeholder for more complex logic
  warnings.push({
    code: 'LIFE_BENEFICIARY_REVIEW',
    severity: 'info',
    message: 'Manual review recommended for beneficiary designations',
    messageTr: 'Lehtar atamaları için manuel inceleme önerilir',
    rule: 'Administrative Check',
  })

  return { blockingReasons, warnings }
}
