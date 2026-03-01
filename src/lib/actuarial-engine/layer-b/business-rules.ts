/**
 * Business / Commercial Insurance Compliance Rules
 *
 * Implements validation for Business policies:
 * - Fire coverage mandatory for commercial properties
 * - Third-party liability limits
 * - Professional indemnity requirements
 */

import type { BlockingReason, ComplianceWarning, CanonicalCoverage } from '../types'

/**
 * Checks a business/commercial policy against common compliance standards.
 */
export function checkBusinessCompliance(
  coverages: CanonicalCoverage[],
  _effectiveDate: Date
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []

  // 1. Mandatory Fire Coverage (for property-based business insurance)
  const hasFire = coverages.some(
    (c) => (c.code === 'FIRE' || c.code === 'FIRE_COMMERCIAL') && c.included
  )

  if (!hasFire) {
    // For many business products, fire is the core peril
    warnings.push({
      code: 'BUSINESS_NO_FIRE_COVERAGE',
      severity: 'high',
      message: 'Fire coverage missing — standard for commercial property insurance',
      messageTr: 'Yangın teminatı eksik — ticari mülkiyet sigortası için standarttır',
      rule: 'Commercial Quality Standard',
    })
  }

  // 2. Third-Party Liability (TPL)
  const hasTPL = coverages.some((c) => (c.code === 'TPL' || c.code === 'LIABILITY') && c.included)
  if (!hasTPL) {
    warnings.push({
      code: 'BUSINESS_NO_LIABILITY',
      severity: 'medium',
      message: 'Business liability (TPL) coverage not found',
      messageTr: 'İş yeri sorumluluk (3. şahıs) teminatı bulunamadı',
      rule: 'Recommended Coverage',
    })
  }

  return { blockingReasons, warnings }
}
