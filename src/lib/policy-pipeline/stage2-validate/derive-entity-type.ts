/**
 * Deterministically derives the insured entity type from a TCKN or VKN.
 *
 * - TCKN (Individual): 11 digits
 * - VKN (Corporate): 10 digits
 *
 * Falls back to null if the ID is invalid or ambiguous.
 */
export function deriveEntityType(idNumber?: string | null): 'individual' | 'corporate' | null {
  if (!idNumber) return null

  // Remove all non-digit characters
  const digits = idNumber.replace(/\D/g, '')

  if (digits.length === 11) {
    return 'individual'
  }

  if (digits.length === 10) {
    return 'corporate'
  }

  return null
}
