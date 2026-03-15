import { ExtractedPolicyData, ExtractedCoverage } from '@/lib/ai/extraction-schema'

export type SafetyFlagLevel = 'Safe' | 'Warning' | 'Error'

export interface SafetyFlag {
  level: SafetyFlagLevel
  message: string
  field?: string
}

export interface ValidationResult {
  isValid: boolean
  flags: SafetyFlag[]
  blockReason?: string
}

/**
 * Deterministic validator to ensure extracted policy data is evidence-backed
 * and does not contain dangerous defaults or conflicting information.
 */
export function validateExtractionSafety(data: Partial<ExtractedPolicyData>): ValidationResult {
  const flags: SafetyFlag[] = []
  let isValid = true
  let blockReason: string | undefined

  // 1. Currency Validation
  // Currency is strictly required to be known. Ambiguous or missing currency is a critical error.
  if (!data.currency) {
    flags.push({
      level: 'Error',
      message: 'Currency must be explicitly extracted. Null or missing currency is unsafe.',
      field: 'currency',
    })
    isValid = false
    blockReason = 'Unsafe default risk: Currency missing.'
  }

  // 2. Premium Validation
  if (data.premium === null || data.premium === undefined) {
    flags.push({
      level: 'Warning',
      message: 'Premium amount is missing.',
      field: 'premium',
    })
  }

  // 3. Coverages Validation
  if (!data.coverages || data.coverages.length === 0) {
    flags.push({
      level: 'Warning',
      message: 'No coverages were extracted.',
      field: 'coverages',
    })
  } else {
    data.coverages.forEach((coverage: ExtractedCoverage, index: number) => {
      // Deductible sanity check
      if (coverage.deductible !== null && coverage.deductible < 0) {
        flags.push({
          level: 'Error',
          message: `Coverage '${coverage.name}' has a negative deductible.`,
          field: `coverages[${index}].deductible`,
        })
        isValid = false
        if (!blockReason) blockReason = 'Unsafe data: Negative deductible.'
      }

      // Limit sanity check
      if (!coverage.isUnlimited && !coverage.isMarketValue && coverage.limit === null) {
        flags.push({
          level: 'Warning',
          message: `Coverage '${coverage.name}' has no limit specified but is not marked as unlimited or market value.`,
          field: `coverages[${index}].limit`,
        })
      }
    })
  }

  // 4. Traceability/Evidence Check
  if (!data.evidence || !data.evidence.insights || !data.evidence.exclusions) {
    flags.push({
      level: 'Warning',
      message: 'Missing explicit evidence mapping for insights or exclusions.',
      field: 'evidence',
    })
  } else {
    // Check if any insights lack quotes
    const missingQuotes = data.evidence.insights.filter(
      (i: { quote?: string }) => !i.quote || i.quote.trim() === ''
    )
    if (missingQuotes.length > 0) {
      flags.push({
        level: 'Warning',
        message: `${missingQuotes.length} insights lack verbatim quotes.`,
        field: 'evidence.insights',
      })
    }
  }

  return {
    isValid,
    flags,
    blockReason,
  }
}
