/**
 * Phase 3 — Typology hashing for the audit-judge cache.
 *
 * The judge runs ONCE per `(insuranceLine × country × yearBucket × insurer)`
 * tuple and caches the result in `audit_judgements`. Subsequent uploads
 * matching the same typology hash skip the LLM call.
 *
 * `yearBucket` is `Math.floor(year / 2) * 2` — 2-year buckets balance
 * model freshness against judge cost (8 active insurers × 2 branches × 5
 * year-buckets × 5 countries ≈ 400 unique typologies).
 *
 * Pure functions, no I/O. Server-side use of `crypto.createHash`; this
 * module is also import-safe in the browser because the typology hash
 * is only invoked from `audit-judge-service.ts` (server-only).
 */

import { createHash } from 'node:crypto'
import { parseTurkishDate } from '@/lib/ai/turkish-utils'

export interface TypologyInput {
  /** Branch / insurance line ('kasko', 'traffic', 'dask', 'zas', 'health', etc.) */
  insuranceLine: string
  /** ISO 3166-1 alpha-2 country code, default 'TR' for the Turkish market */
  country?: string
  /** 4-digit year of policy start; if you only have the raw start-date string, pass it instead via `parseYearBucket` */
  yearBucket: number
  /** Insurer / provider name as extracted; will be normalised. */
  insurer: string
}

export interface TypologyDimensions extends Required<Omit<TypologyInput, 'country'>> {
  country: string
  insurerNormalised: string
}

/**
 * Strip carrier suffixes ("Sigorta", " A.Ş.", "Ltd.", "A.Ş", "AŞ") and
 * collapse whitespace so that "Anadolu Sigorta" and "Anadolu Sigorta A.Ş."
 * hash to the same typology. Lowercase + Turkish-fold via
 * `toLowerCase().replace(/i̇/g, 'i')` (gotcha #62) so that "İSTANBUL"
 * collisions don't drift across the case-folding bug.
 */
export function normaliseInsurer(provider: string): string {
  if (!provider || typeof provider !== 'string') return ''
  let s = provider.trim().toLowerCase().replace(/i̇/g, 'i')
  // Carrier-name suffixes commonly seen in Turkish insurer documents.
  // Order matters — strip longer compound forms first.
  s = s.replace(/\s+a\.?\s*ş\.?\s*$/u, '')
  s = s.replace(/\s+ltd\.?\s*şti\.?\s*$/u, '')
  s = s.replace(/\s+ltd\.?\s*$/u, '')
  s = s.replace(/\s+a\.?\s*ş\s*$/u, '')
  s = s.replace(/\s+sigorta\s*$/u, '')
  s = s.replace(/\s+ı?nsurance\s*$/u, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Compute the 2-year bucket from a Turkish-format start date. Returns null
 * if the input is unparseable. `2024 → 2024`, `2025 → 2024`, `2026 → 2026`.
 */
export function parseYearBucket(startDate: string | null | undefined): number | null {
  if (!startDate) return null
  const iso = parseTurkishDate(startDate)
  if (!iso) return null
  const year = parseInt(iso.slice(0, 4), 10)
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null
  return Math.floor(year / 2) * 2
}

/**
 * Hex SHA-256 of the canonicalised typology tuple. Stable across capitalisation
 * variants of the insurer (via `normaliseInsurer`) and across day-of-year
 * variation (via `yearBucket`). Returns a 64-char lowercase hex string.
 */
export function computeTypologyHash(input: TypologyInput): string {
  const country = (input.country ?? 'TR').toUpperCase()
  const line = (input.insuranceLine ?? '').toLowerCase().trim()
  const bucket = input.yearBucket
  const insurer = normaliseInsurer(input.insurer)
  const canonical = `${line}|${country}|${bucket}|${insurer}`
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Same as `computeTypologyHash` but accepts a raw start-date string and
 * does the year-bucket conversion in one step. Returns null if the date
 * cannot be parsed (caller should skip the judge in that case).
 */
export function computeTypologyHashFromPolicy(input: {
  insuranceLine: string
  country?: string
  startDate: string | null | undefined
  insurer: string
}): { hash: string; dimensions: TypologyDimensions } | null {
  const yearBucket = parseYearBucket(input.startDate)
  if (yearBucket === null) return null
  const country = (input.country ?? 'TR').toUpperCase()
  const insurerNormalised = normaliseInsurer(input.insurer)
  const hash = computeTypologyHash({
    insuranceLine: input.insuranceLine,
    country,
    yearBucket,
    insurer: input.insurer,
  })
  return {
    hash,
    dimensions: {
      insuranceLine: input.insuranceLine.toLowerCase().trim(),
      country,
      yearBucket,
      insurer: input.insurer,
      insurerNormalised,
    },
  }
}
