/**
 * SEDDK Time-Versioned Compliance Rules
 *
 * Implements time-versioned lookup of mandatory insurance limits
 * set by SEDDK (Sigortacılık ve Özel Emeklilik Düzenleme ve
 * Denetleme Kurumu). The correct limit set is selected based on
 * the policy's effective date.
 */

import type { BlockingReason, ComplianceWarning, Money } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// SEDDK TRAFFIC (ZMMS) LIMIT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SEDDKTrafficLimits {
  /** Year these limits are effective. */
  year: number
  /** Effective start date (inclusive). */
  effectiveFrom: string
  /** Effective end date (inclusive, or null if current). */
  effectiveTo: string | null
  /** Bodily injury per person (Sağlık/Ölüm/Sakatlık kişi başına). */
  bodilyInjuryPerPerson: number
  /** Bodily injury per accident (Sağlık/Ölüm/Sakatlık kaza başına). */
  bodilyInjuryPerAccident: number
  /** Material damage per vehicle (Maddi hasar araç başına). */
  materialDamagePerVehicle: number
  /** Material damage per accident (Maddi hasar kaza başına). */
  materialDamagePerAccident: number
  /** Currency (always TRY for SEDDK limits). */
  currency: 'TRY'
}

// ─────────────────────────────────────────────────────────────────────────────
// SEDDK TRAFFIC LIMITS REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Time-versioned SEDDK traffic insurance minimum limits.
 * These are the official mandatory minimums — policies with limits
 * below these values are NON-COMPLIANT and must be blocked.
 *
 * Source: SEDDK official tariffs (seddk.gov.tr)
 * Note: Limits are for standard automobile (Otomobil) class.
 */
const SEDDK_TRAFFIC_LIMITS: SEDDKTrafficLimits[] = [
  {
    year: 2025,
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-12-31',
    bodilyInjuryPerPerson: 2_700_000,
    bodilyInjuryPerAccident: 13_500_000,
    materialDamagePerVehicle: 300_000,
    materialDamagePerAccident: 600_000,
    currency: 'TRY',
  },
  {
    year: 2026,
    effectiveFrom: '2026-01-01',
    effectiveTo: null, // Current — no end date
    bodilyInjuryPerPerson: 3_600_000,
    bodilyInjuryPerAccident: 18_000_000,
    materialDamagePerVehicle: 400_000,
    materialDamagePerAccident: 800_000,
    currency: 'TRY',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the SEDDK traffic limits applicable for the given date.
 * Falls back to the most recent limits if the date is beyond all known versions.
 */
export function getSEDDKLimitsForDate(effectiveDate: Date): SEDDKTrafficLimits {
  const dateStr = effectiveDate.toISOString().slice(0, 10)

  for (let i = SEDDK_TRAFFIC_LIMITS.length - 1; i >= 0; i--) {
    const limits = SEDDK_TRAFFIC_LIMITS[i]
    if (dateStr >= limits.effectiveFrom) {
      if (limits.effectiveTo === null || dateStr <= limits.effectiveTo) {
        return limits
      }
    }
  }

  // Fallback: use the earliest known limits for dates before 2025
  return SEDDK_TRAFFIC_LIMITS[0]
}

/**
 * Policy limits to check against SEDDK minimums.
 * These values should be extracted from the policy's coverage data.
 */
export interface TrafficPolicyLimits {
  bodilyInjuryPerPerson?: number
  bodilyInjuryPerAccident?: number
  materialDamagePerVehicle?: number
  materialDamagePerAccident?: number
}

/**
 * Checks a traffic (ZMMS) policy's limits against SEDDK minimums.
 * Returns blocking reasons for any limits below the legal minimum.
 */
export function checkTrafficLimits(
  policyLimits: TrafficPolicyLimits,
  effectiveDate: Date
): { blockingReasons: BlockingReason[]; warnings: ComplianceWarning[] } {
  const seddkLimits = getSEDDKLimitsForDate(effectiveDate)
  const blockingReasons: BlockingReason[] = []
  const warnings: ComplianceWarning[] = []

  const checks: Array<{
    field: keyof TrafficPolicyLimits
    seddkField: keyof Omit<
      SEDDKTrafficLimits,
      'year' | 'effectiveFrom' | 'effectiveTo' | 'currency'
    >
    label: string
    labelTr: string
  }> = [
    {
      field: 'bodilyInjuryPerPerson',
      seddkField: 'bodilyInjuryPerPerson',
      label: 'Bodily Injury per Person',
      labelTr: 'Sağlık/Ölüm/Sakatlık (Kişi Başına)',
    },
    {
      field: 'bodilyInjuryPerAccident',
      seddkField: 'bodilyInjuryPerAccident',
      label: 'Bodily Injury per Accident',
      labelTr: 'Sağlık/Ölüm/Sakatlık (Kaza Başına)',
    },
    {
      field: 'materialDamagePerVehicle',
      seddkField: 'materialDamagePerVehicle',
      label: 'Material Damage per Vehicle',
      labelTr: 'Maddi Hasar (Araç Başına)',
    },
    {
      field: 'materialDamagePerAccident',
      seddkField: 'materialDamagePerAccident',
      label: 'Material Damage per Accident',
      labelTr: 'Maddi Hasar (Kaza Başına)',
    },
  ]

  for (const check of checks) {
    const policyValue = policyLimits[check.field]
    const minimumValue = seddkLimits[check.seddkField]

    if (policyValue === undefined) {
      warnings.push({
        code: `TRAFFIC_LIMIT_MISSING_${check.field.toUpperCase()}`,
        severity: 'high',
        message: `${check.label} limit not specified in policy`,
        messageTr: `${check.labelTr} limiti poliçede belirtilmemiş`,
        rule: `SEDDK ${seddkLimits.year} Traffic Insurance Minimums`,
        details: { field: check.field, requiredMinimum: minimumValue },
      })
      continue
    }

    if (policyValue < minimumValue) {
      blockingReasons.push({
        code: `TRAFFIC_BELOW_SEDDK_${check.field.toUpperCase()}`,
        severity: 'blocking',
        message: `${check.label} (₺${policyValue.toLocaleString()}) is below SEDDK ${seddkLimits.year} minimum (₺${minimumValue.toLocaleString()})`,
        messageTr: `${check.labelTr} (₺${policyValue.toLocaleString()}) SEDDK ${seddkLimits.year} asgari limitinin (₺${minimumValue.toLocaleString()}) altında`,
        rule: `SEDDK ${seddkLimits.year} Traffic Insurance Minimums`,
        details: {
          field: check.field,
          policyValue,
          requiredMinimum: minimumValue,
          deficit: minimumValue - policyValue,
          seddkYear: seddkLimits.year,
        },
      })
    }
  }

  return { blockingReasons, warnings }
}

/**
 * Extracts traffic policy limits from canonical coverages.
 * Maps standardised coverage codes to SEDDK limit categories.
 */
export function extractTrafficLimitsFromCoverages(
  coverages: Array<{
    code: string
    included: boolean
    limit?: { value: Money | { kind: 'unlimited' } }
  }>
): TrafficPolicyLimits {
  const limits: TrafficPolicyLimits = {}

  for (const cov of coverages) {
    if (!cov.included || !cov.limit) continue
    const limitValue = cov.limit.value
    if ('kind' in limitValue && limitValue.kind === 'unlimited') continue

    const amount = (limitValue as Money).amount

    switch (cov.code) {
      case 'BODILY_INJURY_PER_PERSON':
        limits.bodilyInjuryPerPerson = amount
        break
      case 'BODILY_INJURY_PER_ACCIDENT':
        limits.bodilyInjuryPerAccident = amount
        break
      case 'MATERIAL_DAMAGE_PER_VEHICLE':
        limits.materialDamagePerVehicle = amount
        break
      case 'MATERIAL_DAMAGE_PER_ACCIDENT':
        limits.materialDamagePerAccident = amount
        break
    }
  }

  return limits
}
