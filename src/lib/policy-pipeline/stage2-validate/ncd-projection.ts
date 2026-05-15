/**
 * NCD (No-Claim Discount / Hasarsızlık İndirimi) Projection
 *
 * Turkish motor insurance NCD rules (Anadolu Sigorta standard):
 * - Kademe 1: 0%
 * - Kademe 2: 20%
 * - Kademe 3: 40%  (or 50% for some insurers)
 * - Kademe 4: 50%  (or 60%)
 * - Kademe 5: 50%
 * - Kademe 6: 50%
 *
 * Standard Anadolu Sigorta kademe progression:
 *   Kademe 1 (0%)  → Kademe 2 (20%) → Kademe 3 (50%) → Kademe 4 (60%) → ...
 * After one claim-free year: advance 1 kademe.
 * After a claim: retreat 2-3 kademe (or reset to 1 depending on severity).
 *
 * This module projects next-year NCD from current kademe / discount rate.
 */

export interface NCDState {
  /** Current discount percentage (e.g. 50 for 50%) */
  currentDiscount: number | null
  /** Current kademe (1-6), null if unknown */
  currentKademe: number | null
  /** The source evidence text from the policy */
  evidence: string | null
}

export interface NCDProjection {
  current: NCDState
  /** Projected values after one claim-free year */
  nextYear: {
    kademe: number | null
    discount: number | null
  }
  /** Projected values if a claim occurs */
  afterClaim: {
    kademe: number | null
    discount: number | null
  }
}

// Anadolu Sigorta standard kademe → discount rate mapping
const KADEME_DISCOUNT_MAP: Record<number, number> = {
  1: 0,
  2: 20,
  3: 50,
  4: 60,
  5: 60,
  6: 60,
}

/**
 * Derive kademe from discount percentage (reverse lookup).
 */
function deriveKademeFromDiscount(discount: number): number | null {
  const sorted = Object.entries(KADEME_DISCOUNT_MAP)
    .map(([k, v]) => [parseInt(k), v] as const)
    .sort((a, b) => a[0] - b[0])

  // Find the kademe whose discount matches (exact match)
  for (const [kademe, pct] of sorted) {
    if (pct === discount) return kademe
  }

  // Approximate: closest discount ≤ given value
  let best: number | null = null
  for (const [kademe, pct] of sorted) {
    if (pct <= discount) best = kademe
  }
  return best
}

/**
 * Get discount percentage for a given kademe.
 */
function discountForKademe(kademe: number): number {
  return KADEME_DISCOUNT_MAP[kademe] ?? 0
}

/**
 * Project NCD forward based on current state.
 *
 * @param currentDiscount - Current discount percentage (0-100)
 * @param currentKademe - Current kademe (1-6), null if from discount only
 * @returns Full projection with current, next-year, and after-claim state
 */
export function projectNCD(
  currentDiscount: number | null,
  currentKademe: number | null
): NCDProjection {
  // If no data at all, return empty projection
  if (currentDiscount === null && currentKademe === null) {
    return {
      current: { currentDiscount: null, currentKademe: null, evidence: null },
      nextYear: { kademe: null, discount: null },
      afterClaim: { kademe: null, discount: null },
    }
  }

  // Derive kademe from discount if not given
  let resolvedKademe = currentKademe ?? deriveKademeFromDiscount(currentDiscount ?? 0)

  // Clamp to valid range
  if (resolvedKademe !== null) {
    resolvedKademe = Math.min(Math.max(resolvedKademe, 1), 6)
  }

  const resolvedDiscount = resolvedKademe !== null ? discountForKademe(resolvedKademe) : null

  // Project one claim-free year: advance 1 kademe
  const nextKademe = resolvedKademe !== null ? Math.min(resolvedKademe + 1, 6) : null
  const nextDiscount = nextKademe !== null ? discountForKademe(nextKademe) : null

  // Project after a claim: retreat 2 kademe (standard), minimum 1
  const afterClaimKademe = resolvedKademe !== null ? Math.max(resolvedKademe - 2, 1) : null
  const afterClaimDiscount = afterClaimKademe !== null ? discountForKademe(afterClaimKademe) : null

  return {
    current: {
      currentDiscount: resolvedDiscount,
      currentKademe: resolvedKademe,
      evidence: null,
    },
    nextYear: { kademe: nextKademe, discount: nextDiscount },
    afterClaim: { kademe: afterClaimKademe, discount: afterClaimDiscount },
  }
}
