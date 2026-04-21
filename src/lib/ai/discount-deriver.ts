import type { AnalyzedPolicy } from '@/types/policy'

/**
 * Derive the canonical `discounts` field from the comprehensive extraction
 * path when the AI didn't populate `data.discounts` directly. Reuses the
 * existing `noClaimsBonus.discountRate` value (already extracted by the
 * kasko parser prompt) so NCD surfaces through the unified field path.
 *
 * Returns undefined when no NCD / discount data is recoverable, matching
 * the `discounts?:` optional semantics.
 */
export function deriveDiscountsFromStructured(data: any): AnalyzedPolicy['discounts'] | undefined {
  const ncb = data?.noClaimsBonus
  if (!ncb || !ncb.discountRate) return undefined

  // Parse "40%" / "%40" / "40" / "%40,5" → 40 (int). If unparseable, skip.
  const digits = String(ncb.discountRate).match(/(\d+(?:[.,]\d+)?)/)
  if (!digits) return undefined
  const parsed = Math.round(Number(digits[1].replace(',', '.')))
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined

  return {
    ncdDiscount: parsed,
    groupDiscount: null,
    otherDiscountPct: null,
    evidence: ncb.discountRate,
  }
}
