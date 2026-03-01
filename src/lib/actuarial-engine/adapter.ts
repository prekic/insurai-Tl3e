import type { AnalyzedPolicy, Coverage } from '@/types/policy'
import type {
  ActuarialPolicyInput,
  ActuarialPolicyType,
  CanonicalCoverage,
  Money,
  FieldWithEvidence,
  PartsStandard,
  RepairNetworkRule,
  RayicMethod,
} from './types'

/**
 * Maps standard API policy type to Actuarial Policy Type
 */
export function mapPolicyType(type: string): ActuarialPolicyType {
  const t = type.toLowerCase()
  if (t.includes('kasko')) return 'kasko'
  if (t.includes('trafik') || t.includes('zmms')) return 'traffic'
  if (t.includes('dask')) return 'dask'
  if (t.includes('zas')) return 'zas'
  if (t.includes('sağlık') || t.includes('health')) return 'health'
  if (t.includes('hayat') || t.includes('life')) return 'life'
  if (t.includes('isyeri') || t.includes('business') || t.includes('ticari')) return 'business'
  return type as ActuarialPolicyType // Pass through for unsupported types
}

/**
 * Normalizes an amount into a Money object.
 */
function toMoney(amount: number, currency = 'TRY'): Money {
  return { amount, currency: currency as 'TRY' | 'USD' | 'EUR' }
}

/**
 * Ensures evidence pointer mapping for fields parsed during extraction.
 */
function toFieldWithEvidence<T>(value: T): FieldWithEvidence<T> {
  return {
    value,
  }
}

/**
 * Maps standard coverage extraction into CanonicalCoverage to support
 * standard actuarial perils regardless of original OCR naming.
 */
function mapCoverageToCanonical(c: Coverage): CanonicalCoverage {
  // A robust mapping would use a dedicated dictionary (or Layer A semantic mapper).
  // For adapter purposes, we apply heuristic normalization based on the coverage name or category.
  const nameRaw = c.name || c.nameTr || ''
  const nameLower = nameRaw.toLowerCase()
  const nameTrLower = (c.nameTr || '').toLowerCase()
  const searchStr = `${nameLower} ${nameTrLower}`
  let code = 'OTHER'

  // Attempt to match to KASKO_COVERAGE_WEIGHTS codes where applicable
  if (searchStr.includes('çarpışma') || searchStr.includes('collision')) {
    code = 'COLLISION'
  } else if (searchStr.includes('yatarak') || searchStr.includes('inpatient')) {
    code = 'INPATIENT'
  } else if (searchStr.includes('ayakta') || searchStr.includes('outpatient')) {
    code = 'OUTPATIENT'
  } else if (
    searchStr.includes('ilaç') ||
    searchStr.includes('pharmacy') ||
    searchStr.includes('medication')
  ) {
    code = 'PHARMACY'
  } else if (searchStr.includes('vefat') || searchStr.includes('death')) {
    code = 'DEATH_BENEFIT'
  } else if (searchStr.includes('maluliyet') || searchStr.includes('disability')) {
    code = 'DISABILITY'
  } else if (searchStr.includes('tehlikeli hastalık') || searchStr.includes('critical illness')) {
    code = 'CRITICAL_ILLNESS'
  } else if (searchStr.includes('yangın') || searchStr.includes('fire')) {
    code = 'FIRE'
  } else if (searchStr.includes('hırsızlık') || searchStr.includes('theft')) {
    code = 'THEFT'
  } else if (searchStr.includes('deprem') || searchStr.includes('earthquake')) {
    code = 'EARTHQUAKE'
  } else if (searchStr.includes('sel') || searchStr.includes('flood')) {
    code = 'FLOOD'
  } else if (searchStr.includes('cam') || searchStr.includes('glass')) {
    code = 'GLASS'
  } else if (searchStr.includes('ferdi kaza') || searchStr.includes('personal accident')) {
    code = 'PERSONAL_ACCIDENT'
  } else if (searchStr.includes('hukuksal') || searchStr.includes('legal')) {
    code = 'LEGAL_PROTECTION'
  } else if (searchStr.includes('ihtiyari mali') || searchStr.includes('third party liability')) {
    code = 'THIRD_PARTY_LIABILITY'
  } else if (searchStr.includes('doğal afet') || searchStr.includes('natural disaster')) {
    code = 'NATURAL_DISASTER'
  } else if (searchStr.includes('sorumluluk') || searchStr.includes('liability')) {
    code = 'LIABILITY'
  } else {
    // Standardize whatever label we have for unknown coverages into uppercase snake case
    code =
      nameRaw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_') || 'UNKNOWN'
  }

  return {
    code,
    included: c.included !== false, // If undefined or true, treat as included
    limit: toFieldWithEvidence(c.isUnlimited ? { kind: 'unlimited' } : toMoney(c.limit)),
    deductible: toFieldWithEvidence(
      c.deductible && c.deductible > 0 ? toMoney(c.deductible) : { kind: 'none' }
    ),
  }
}

/**
 * Adapter: Converts an AnalyzedPolicy into an ActuarialPolicyInput
 *
 * This bridges the gap between the standard application data model
 * and the canonical Actuarial Engine structures required for Layer B/C/D evaluation.
 *
 * @param policy - The standardized AnalyzedPolicy object from DB / Redux
 * @returns An ActuarialPolicyInput suitable for the Actuarial Engine
 */
export function mapAnalyzedToActuarialInput(policy: AnalyzedPolicy): ActuarialPolicyInput {
  // Try to find marked value or infer it from coverage/premium limits
  const insuredValueAmount = policy.coverage || 0

  // Extract indemnity mechanics from raw data if present, otherwise stub as 'unknown' out-of-the-box defaults.
  // Real implementations populate raw_data.indemnity during extraction stage.
  const rawDataField = (policy as unknown as Record<string, unknown>).raw_data
  const rawData = typeof rawDataField === 'object' && rawDataField !== null ? rawDataField : {}
  const parsedIndemnity = (rawData as Record<string, unknown>).indemnity as Record<
    string,
    unknown
  > | null

  const indemnityMechanics = parsedIndemnity
    ? {
        partsStandard: toFieldWithEvidence(
          (parsedIndemnity.partsStandard as PartsStandard) || 'unspecified'
        ),
        repairNetworkRule: toFieldWithEvidence(
          (parsedIndemnity.repairNetworkRule as RepairNetworkRule) || 'unspecified'
        ),
        rayicMethod: toFieldWithEvidence(
          (parsedIndemnity.rayicMethod as RayicMethod) || 'unspecified'
        ),
        rayicMethodIsConcrete: toFieldWithEvidence(
          typeof parsedIndemnity.rayicMethodIsConcrete === 'boolean'
            ? parsedIndemnity.rayicMethodIsConcrete
            : false
        ),
      }
    : {
        partsStandard: toFieldWithEvidence('unspecified' as const),
        repairNetworkRule: toFieldWithEvidence('unspecified' as const),
        rayicMethod: toFieldWithEvidence('unknown' as const),
        rayicMethodIsConcrete: toFieldWithEvidence(false),
      }

  return {
    policyId: policy.id,
    policyType: mapPolicyType(policy.type),
    marketedProductName: policy.typeTr || undefined,
    premium: toMoney(policy.premium, policy.currency),
    effectiveDate: policy.startDate,
    expiryDate: policy.expiryDate,
    coverages: policy.coverages.map(mapCoverageToCanonical),
    exclusionTexts: (policy.exclusions || []).map((e: unknown) =>
      typeof e === 'string' ? e : ((e as { text?: string })?.text ?? String(e))
    ),
    indemnityMechanics,
    insuredValue: insuredValueAmount > 0 ? toMoney(insuredValueAmount, policy.currency) : undefined,
  }
}
