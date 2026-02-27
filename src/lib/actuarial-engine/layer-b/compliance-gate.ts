/**
 * Layer B — Compliance Gate Orchestrator
 *
 * Compliance is an absolute boolean gate. If a policy fails any
 * blocking check, it CANNOT proceed to actuarial valuation (Layer C).
 *
 * Checks performed:
 * 1. Policy date validity (not expired, valid date range)
 * 2. SEDDK traffic limits (time-versioned)
 * 3. DASK mandatory deductible and coverage rules
 * 4. ZAS emerging rules (if enforced)
 * 5. Product name mismatch (Tam Kasko contradiction)
 */

import type {
  ActuarialPolicyInput,
  BlockingReason,
  ComplianceResult,
  ComplianceWarning,
  ProductMismatch,
} from '../types'
import { checkTrafficLimits, extractTrafficLimitsFromCoverages } from './seddk-rules'
import { checkDASKCompliance, checkZASCompliance } from './dask-rules'
import { validateProductName } from './product-rules'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const RULESET_VERSION = '2026-02-27-v1'

// ─────────────────────────────────────────────────────────────────────────────
// DATE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function checkDateValidity(
  effectiveDate: string,
  expiryDate: string,
  checkDate: Date
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []

  const effective = new Date(effectiveDate)
  const expiry = new Date(expiryDate)

  // Check for invalid dates
  if (isNaN(effective.getTime())) {
    blockingReasons.push({
      code: 'INVALID_EFFECTIVE_DATE',
      severity: 'blocking',
      message: `Invalid effective date: ${effectiveDate}`,
      messageTr: `Geçersiz başlangıç tarihi: ${effectiveDate}`,
      rule: 'Date Validation',
    })
    return { blockingReasons, warnings }
  }

  if (isNaN(expiry.getTime())) {
    blockingReasons.push({
      code: 'INVALID_EXPIRY_DATE',
      severity: 'blocking',
      message: `Invalid expiry date: ${expiryDate}`,
      messageTr: `Geçersiz bitiş tarihi: ${expiryDate}`,
      rule: 'Date Validation',
    })
    return { blockingReasons, warnings }
  }

  // Check date range validity
  if (expiry <= effective) {
    blockingReasons.push({
      code: 'INVALID_DATE_RANGE',
      severity: 'blocking',
      message: `Expiry date (${expiryDate}) is not after effective date (${effectiveDate})`,
      messageTr: `Bitiş tarihi (${expiryDate}) başlangıç tarihinden (${effectiveDate}) sonra değil`,
      rule: 'Date Range Validation',
      details: { effectiveDate, expiryDate },
    })
    return { blockingReasons, warnings }
  }

  // Check if policy is expired
  const checkDateStr = checkDate.toISOString().slice(0, 10)
  const expiryStr = expiryDate.slice(0, 10)

  if (checkDateStr > expiryStr) {
    const daysSinceExpiry = Math.floor(
      (checkDate.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24)
    )
    blockingReasons.push({
      code: 'POLICY_EXPIRED',
      severity: 'blocking',
      message: `Policy expired on ${expiryDate} (${daysSinceExpiry} days ago)`,
      messageTr: `Poliçe ${expiryDate} tarihinde sona ermiş (${daysSinceExpiry} gün önce)`,
      rule: 'Policy Expiry',
      details: { expiryDate, daysSinceExpiry },
    })
  }

  // Warn if expiring within 30 days
  const thirtyDaysFromNow = new Date(checkDate)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const thirtyDayStr = thirtyDaysFromNow.toISOString().slice(0, 10)

  if (checkDateStr <= expiryStr && expiryStr <= thirtyDayStr) {
    const daysUntilExpiry = Math.floor(
      (expiry.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    warnings.push({
      code: 'POLICY_EXPIRING_SOON',
      severity: 'high',
      message: `Policy expires in ${daysUntilExpiry} days (${expiryDate})`,
      messageTr: `Poliçe ${daysUntilExpiry} gün içinde sona erecek (${expiryDate})`,
      rule: 'Policy Expiry Warning',
      details: { expiryDate, daysUntilExpiry },
    })
  }

  return { blockingReasons, warnings }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPLIANCE GATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the full compliance gate against a policy.
 *
 * This is a hard boolean check. If `eligible === false`, the policy
 * MUST NOT proceed to Layer C (actuarial valuation) or Layer D (ranking).
 *
 * @param policy - The actuarial policy input to check
 * @param checkDate - The date to check against (defaults to today)
 * @returns ComplianceResult with eligible flag, blocking reasons, and warnings
 */
export function executeComplianceGate(
  policy: ActuarialPolicyInput,
  checkDate?: Date
): { compliance: ComplianceResult; productMismatches: ProductMismatch[] } {
  const effectiveCheckDate = checkDate ?? new Date()
  const allBlockingReasons: BlockingReason[] = []
  const allWarnings: ComplianceWarning[] = []
  let productMismatches: ProductMismatch[] = []

  // ── 1. Date Validity ──────────────────────────────────────────────────
  const dateResult = checkDateValidity(policy.effectiveDate, policy.expiryDate, effectiveCheckDate)
  allBlockingReasons.push(...dateResult.blockingReasons)
  allWarnings.push(...dateResult.warnings)

  // ── 2. Policy-Type-Specific Compliance ────────────────────────────────
  const policyEffective = new Date(policy.effectiveDate)

  switch (policy.policyType) {
    case 'traffic': {
      const trafficLimits = extractTrafficLimitsFromCoverages(
        policy.coverages.map((c) => ({
          code: c.code,
          included: c.included,
          limit: c.limit,
        }))
      )
      const trafficResult = checkTrafficLimits(trafficLimits, policyEffective)
      allBlockingReasons.push(...trafficResult.blockingReasons)
      allWarnings.push(...trafficResult.warnings)
      break
    }

    case 'dask': {
      const coverageAmount = policy.insuredValue?.amount
      const daskResult = checkDASKCompliance(policy.coverages, coverageAmount, policyEffective)
      allBlockingReasons.push(...daskResult.blockingReasons)
      allWarnings.push(...daskResult.warnings)
      break
    }

    case 'zas': {
      const zasCoverageAmount = policy.insuredValue?.amount
      const zasResult = checkZASCompliance(policy.coverages, zasCoverageAmount, policyEffective, {
        includeDraft: true,
      })
      allBlockingReasons.push(...zasResult.blockingReasons)
      allWarnings.push(...zasResult.warnings)
      break
    }

    case 'kasko': {
      // Kasko has product name validation (Tam vs Dar)
      productMismatches = validateProductName(policy.marketedProductName, policy.coverages)

      // Convert blocking product mismatches to blocking reasons
      for (const mismatch of productMismatches) {
        if (mismatch.severity === 'blocking') {
          allBlockingReasons.push({
            code: 'PRODUCT_NAME_MISMATCH',
            severity: 'blocking',
            message: mismatch.message,
            messageTr: mismatch.messageTr,
            rule: 'Product Name Validation',
            details: {
              marketedName: mismatch.marketedName,
              missingCoverages: mismatch.missingCoverages,
            },
          })
        }
      }
      break
    }
  }

  // ── 3. Premium Validation ─────────────────────────────────────────────
  if (policy.premium.amount <= 0) {
    allBlockingReasons.push({
      code: 'INVALID_PREMIUM',
      severity: 'blocking',
      message: 'Premium must be greater than zero',
      messageTr: 'Prim sıfırdan büyük olmalıdır',
      rule: 'Premium Validation',
      details: { premium: policy.premium.amount },
    })
  }

  // ── Assemble Result ───────────────────────────────────────────────────
  const eligible = allBlockingReasons.length === 0

  const compliance: ComplianceResult = {
    eligible,
    blockingReasons: allBlockingReasons,
    warnings: allWarnings,
    checkedAt: effectiveCheckDate.toISOString(),
    rulesetVersion: RULESET_VERSION,
  }

  return { compliance, productMismatches }
}
