/**
 * DASK / ZAS Compliance Rules
 *
 * Implements mandatory earthquake insurance (DASK) rules and the
 * emerging ZAS (Zorunlu Afet Sigortası) extension framework.
 *
 * DASK: Every residential property in Turkey must have DASK coverage
 * with a mandatory 2% deductible per loss event.
 *
 * ZAS: Proposed extension to cover multiple natural perils (flood,
 * landslide, storm, wildfire) in addition to earthquake. Rules are
 * draft and not yet enforced by SEDDK.
 */

import type {
  BlockingReason,
  ComplianceWarning,
  CanonicalCoverage,
  ZASPeril,
  ZASRule,
  DeductibleSpec,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// DASK LIMITS
// ─────────────────────────────────────────────────────────────────────────────

export interface DASKLimits {
  year: number
  effectiveFrom: string
  effectiveTo: string | null
  /** Maximum insurable coverage amount. */
  maxCoverage: number
  /** Mandatory deductible as a percentage of insured amount. */
  mandatoryDeductiblePercent: number
  currency: 'TRY'
}

const DASK_LIMITS: DASKLimits[] = [
  {
    year: 2024,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2024-12-31',
    maxCoverage: 2_095_462,
    mandatoryDeductiblePercent: 2,
    currency: 'TRY',
  },
  {
    year: 2025,
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-12-31',
    maxCoverage: 2_800_000,
    mandatoryDeductiblePercent: 2,
    currency: 'TRY',
  },
  {
    year: 2026,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    maxCoverage: 3_200_000,
    mandatoryDeductiblePercent: 2,
    currency: 'TRY',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ZAS RULES (DRAFT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default ZAS rules. All marked as draft since SEDDK has not
 * finalised the ZAS framework. These follow the DASK pattern
 * (2% deductible, max coverage) but for additional perils.
 */
const DEFAULT_ZAS_RULES: ZASRule[] = [
  {
    peril: 'earthquake',
    enforced: true, // Already enforced via DASK
    requiredDeductiblePercent: 2,
    draft: false,
  },
  {
    peril: 'flood',
    enforced: false,
    requiredDeductiblePercent: 2,
    draft: true,
    effectiveDate: undefined,
  },
  {
    peril: 'landslide',
    enforced: false,
    requiredDeductiblePercent: 2,
    draft: true,
    effectiveDate: undefined,
  },
  {
    peril: 'storm',
    enforced: false,
    requiredDeductiblePercent: 2,
    draft: true,
    effectiveDate: undefined,
  },
  {
    peril: 'wildfire',
    enforced: false,
    requiredDeductiblePercent: 2,
    draft: true,
    effectiveDate: undefined,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the DASK limits applicable for the given date.
 */
export function getDASKLimitsForDate(effectiveDate: Date): DASKLimits {
  const dateStr = effectiveDate.toISOString().slice(0, 10)

  for (let i = DASK_LIMITS.length - 1; i >= 0; i--) {
    const limits = DASK_LIMITS[i]
    if (dateStr >= limits.effectiveFrom) {
      if (limits.effectiveTo === null || dateStr <= limits.effectiveTo) {
        return limits
      }
    }
  }

  return DASK_LIMITS[0]
}

/**
 * Returns the currently applicable ZAS rules.
 * Filters to only enforced rules by default.
 */
export function getZASRules(options?: { includeDraft?: boolean }): ZASRule[] {
  if (options?.includeDraft) {
    return [...DEFAULT_ZAS_RULES]
  }
  return DEFAULT_ZAS_RULES.filter((r) => r.enforced)
}

/**
 * Extracts the deductible percentage from a CanonicalCoverage's deductible spec.
 * Returns undefined if the deductible is not percentage-based.
 */
function getDeductiblePercent(
  deductible: DeductibleSpec | undefined,
  coverageAmount: number | undefined
): number | undefined {
  if (!deductible) return undefined

  if ('kind' in deductible) {
    if (deductible.kind === 'pct') return deductible.percent
    if (deductible.kind === 'none') return 0
    return undefined
  }

  // Absolute Money deductible — calculate as percentage of coverage
  if (coverageAmount && coverageAmount > 0) {
    return (deductible.amount / coverageAmount) * 100
  }

  return undefined
}

/**
 * Checks a DASK policy against mandatory rules.
 * The primary check is the 2% mandatory deductible.
 */
export function checkDASKCompliance(
  coverages: CanonicalCoverage[],
  coverageAmount: number | undefined,
  effectiveDate: Date
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []
  const daskLimits = getDASKLimitsForDate(effectiveDate)

  // Find earthquake coverage
  const eqCoverage = coverages.find((c) => c.code === 'EARTHQUAKE' || c.code === 'EQ_STRUCTURAL')

  if (!eqCoverage || !eqCoverage.included) {
    blockingReasons.push({
      code: 'DASK_NO_EARTHQUAKE_COVERAGE',
      severity: 'blocking',
      message: 'DASK policy must include earthquake coverage',
      messageTr: 'DASK poliçesi deprem teminatı içermelidir',
      rule: `DASK ${daskLimits.year} Mandatory Coverage`,
    })
    return { blockingReasons, warnings }
  }

  // Check deductible = 2%
  const deductibleValue = eqCoverage.deductible?.value
  const deductiblePct = getDeductiblePercent(deductibleValue, coverageAmount)

  if (deductiblePct === undefined) {
    warnings.push({
      code: 'DASK_DEDUCTIBLE_NOT_SPECIFIED',
      severity: 'high',
      message: 'DASK deductible not specified — mandatory 2% required',
      messageTr: 'DASK muafiyeti belirtilmemiş — zorunlu %2 muafiyet gerekli',
      rule: `DASK ${daskLimits.year} Deductible Rule`,
    })
  } else if (Math.abs(deductiblePct - daskLimits.mandatoryDeductiblePercent) > 0.5) {
    // Allow 0.5% tolerance for rounding
    blockingReasons.push({
      code: 'DASK_WRONG_DEDUCTIBLE',
      severity: 'blocking',
      message: `DASK deductible is ${deductiblePct.toFixed(1)}% — must be ${daskLimits.mandatoryDeductiblePercent}%`,
      messageTr: `DASK muafiyeti %${deductiblePct.toFixed(1)} — %${daskLimits.mandatoryDeductiblePercent} olmalıdır`,
      rule: `DASK ${daskLimits.year} Deductible Rule`,
      details: {
        actualPercent: deductiblePct,
        requiredPercent: daskLimits.mandatoryDeductiblePercent,
      },
    })
  }

  // Check coverage amount doesn't exceed maximum
  if (coverageAmount !== undefined && coverageAmount > daskLimits.maxCoverage) {
    warnings.push({
      code: 'DASK_EXCEEDS_MAX_COVERAGE',
      severity: 'medium',
      message: `Coverage (₺${coverageAmount.toLocaleString()}) exceeds DASK maximum (₺${daskLimits.maxCoverage.toLocaleString()})`,
      messageTr: `Teminat tutarı (₺${coverageAmount.toLocaleString()}) DASK azami tutarını (₺${daskLimits.maxCoverage.toLocaleString()}) aşıyor`,
      rule: `DASK ${daskLimits.year} Coverage Maximum`,
      details: {
        coverageAmount,
        maxCoverage: daskLimits.maxCoverage,
        excess: coverageAmount - daskLimits.maxCoverage,
      },
    })
  }

  return { blockingReasons, warnings }
}

/**
 * Checks a ZAS policy against applicable rules.
 * Only checks enforced rules by default.
 */
export function checkZASCompliance(
  coverages: CanonicalCoverage[],
  coverageAmount: number | undefined,
  _effectiveDate: Date,
  options?: { includeDraft?: boolean }
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []
  const zasRules = getZASRules(options)

  const PERIL_TO_COVERAGE_CODE: Record<ZASPeril, string[]> = {
    earthquake: ['EARTHQUAKE', 'EQ_STRUCTURAL', 'EQ_LANDSLIDE'],
    flood: ['FLOOD', 'FLOOD_INUNDATION'],
    landslide: ['LANDSLIDE'],
    storm: ['STORM', 'WINDSTORM'],
    wildfire: ['WILDFIRE', 'FIRE_FOREST'],
  }

  for (const rule of zasRules) {
    const coverageCodes = PERIL_TO_COVERAGE_CODE[rule.peril] ?? []
    const matchingCoverage = coverages.find((c) => coverageCodes.includes(c.code) && c.included)

    if (!matchingCoverage) {
      if (rule.enforced) {
        blockingReasons.push({
          code: `ZAS_MISSING_${rule.peril.toUpperCase()}`,
          severity: 'blocking',
          message: `ZAS requires ${rule.peril} coverage`,
          messageTr: `ZAS ${rule.peril} teminatı gerektirmektedir`,
          rule: 'ZAS Mandatory Coverage',
        })
      } else if (rule.draft) {
        warnings.push({
          code: `ZAS_DRAFT_MISSING_${rule.peril.toUpperCase()}`,
          severity: 'info',
          message: `ZAS draft rule: ${rule.peril} coverage will be required`,
          messageTr: `ZAS taslak kuralı: ${rule.peril} teminatı zorunlu olacak`,
          rule: 'ZAS Draft Rules',
        })
      }
      continue
    }

    // Check deductible matches requirement
    const deductibleValue = matchingCoverage.deductible?.value
    const deductiblePct = getDeductiblePercent(deductibleValue, coverageAmount)

    if (
      rule.enforced &&
      deductiblePct !== undefined &&
      Math.abs(deductiblePct - rule.requiredDeductiblePercent) > 0.5
    ) {
      blockingReasons.push({
        code: `ZAS_WRONG_DEDUCTIBLE_${rule.peril.toUpperCase()}`,
        severity: 'blocking',
        message: `${rule.peril} deductible is ${deductiblePct.toFixed(1)}% — ZAS requires ${rule.requiredDeductiblePercent}%`,
        messageTr: `${rule.peril} muafiyeti %${deductiblePct.toFixed(1)} — ZAS %${rule.requiredDeductiblePercent} gerektirmektedir`,
        rule: 'ZAS Deductible Rule',
        details: {
          peril: rule.peril,
          actualPercent: deductiblePct,
          requiredPercent: rule.requiredDeductiblePercent,
        },
      })
    }
  }

  return { blockingReasons, warnings }
}
