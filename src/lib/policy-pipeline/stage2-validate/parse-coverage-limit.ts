export type ParsedCoverageLimit =
  | { type: 'numeric'; amount: number }
  | { type: 'unlimited' }
  | { type: 'market_value' }
  | { type: 'unknown' }

/**
 * Parses coverage limit values, prioritizing 'Sınırsız' (unlimited) and
 * 'Rayiç Değer' (market value) over numeric amounts to output a
 * discriminated union for Stage 2 validation.
 */
export function parseCoverageLimit(
  limit?: number | null,
  isUnlimited?: boolean | null,
  isMarketValue?: boolean | null
): ParsedCoverageLimit {
  if (isUnlimited) return { type: 'unlimited' }
  if (isMarketValue) return { type: 'market_value' }
  if (typeof limit === 'number' && limit > 0) return { type: 'numeric', amount: limit }
  return { type: 'unknown' }
}
