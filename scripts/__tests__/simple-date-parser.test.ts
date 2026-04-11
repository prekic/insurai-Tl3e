import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseExtractedDate } from '../_simple-date-parser'

/**
 * Tests for the standalone date parser used by pilot-batch-ingest.ts.
 *
 * This function MIRRORS src/lib/ai/policy-extractor.ts:1609-1637 and is
 * intentionally tested here to catch drift early. If production date parsing
 * is changed without updating this parser, these tests will still pass (they
 * only test this module's behavior), but the MIRRORS comment in
 * _simple-date-parser.ts is the primary drift signal.
 */
describe('parseExtractedDate', () => {
  // Freeze "now" at a known date so fallback offset assertions are stable.
  // 2026-04-11 00:00:00 UTC (milliseconds since epoch)
  const FROZEN_NOW = new Date('2026-04-11T00:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -- ISO 8601 formats (primary AI output shape) ---------------------------

  it('parses ISO date "2024-12-15"', () => {
    expect(parseExtractedDate('2024-12-15', 0)).toBe('2024-12-15')
  })

  it('parses ISO datetime "2024-12-15T00:00:00Z"', () => {
    expect(parseExtractedDate('2024-12-15T00:00:00Z', 0)).toBe('2024-12-15')
  })

  it('parses ISO datetime with timezone offset', () => {
    // 2024-12-15T12:00:00+03:00 = 2024-12-15T09:00:00Z → same UTC date
    expect(parseExtractedDate('2024-12-15T12:00:00+03:00', 0)).toBe('2024-12-15')
  })

  // -- Turkish DD.MM.YYYY (most common real-world input) --------------------

  it('parses DD.MM.YYYY "15.12.2024"', () => {
    expect(parseExtractedDate('15.12.2024', 0)).toBe('2024-12-15')
  })

  it('parses DD.MM.YYYY with single-digit month/day "5.3.2024"', () => {
    expect(parseExtractedDate('5.3.2024', 0)).toBe('2024-03-05')
  })

  it('parses DD.MM.YYYY "31.01.2025" (year boundary adjacent)', () => {
    expect(parseExtractedDate('31.01.2025', 0)).toBe('2025-01-31')
  })

  // -- DD-MM-YYYY and DD/MM/YYYY variants -----------------------------------

  it('parses DD-MM-YYYY "15-12-2024"', () => {
    expect(parseExtractedDate('15-12-2024', 0)).toBe('2024-12-15')
  })

  it('parses DD/MM/YYYY "15/12/2024"', () => {
    expect(parseExtractedDate('15/12/2024', 0)).toBe('2024-12-15')
  })

  // -- YYYY-MM-DD with explicit 4-digit year first --------------------------

  it('parses YYYY-MM-DD "2024-12-15" (explicitly 4-digit head)', () => {
    expect(parseExtractedDate('2024-12-15', 0)).toBe('2024-12-15')
  })

  it('parses YYYY.MM.DD "2024.12.15"', () => {
    expect(parseExtractedDate('2024.12.15', 0)).toBe('2024-12-15')
  })

  // -- Undefined / empty / invalid → fallback -------------------------------

  it('returns today-offset-0 for undefined input', () => {
    expect(parseExtractedDate(undefined, 0)).toBe('2026-04-11')
  })

  it('returns today-offset-0 for empty string', () => {
    expect(parseExtractedDate('', 0)).toBe('2026-04-11')
  })

  it('returns today+365 for undefined expiry input', () => {
    expect(parseExtractedDate(undefined, 365)).toBe('2027-04-11')
  })

  it('returns fallback for unparseable "foo-bar-baz"', () => {
    expect(parseExtractedDate('foo-bar-baz', 0)).toBe('2026-04-11')
  })

  it('returns fallback for obviously-invalid "99.99.9999"', () => {
    // "99.99.9999" will construct Date(9999-99-99) which is invalid → fallback
    expect(parseExtractedDate('99.99.9999', 0)).toBe('2026-04-11')
  })

  it('returns fallback for only 2 parts "12.2024"', () => {
    // parts.length !== 3 → never enters manual-parse branch → falls through to fallback
    expect(parseExtractedDate('12.2024', 0)).toBe('2026-04-11')
  })

  // -- Fallback offset behavior ---------------------------------------------

  it('applies negative offset for past date', () => {
    expect(parseExtractedDate(undefined, -7)).toBe('2026-04-04')
  })

  it('applies large positive offset (leap-year crossing)', () => {
    // 2026-04-11 + 365 days = 2027-04-11 (2026 is not a leap year)
    expect(parseExtractedDate(undefined, 365)).toBe('2027-04-11')
  })

  // -- Real-world KASKO policy dates from upload/real-kasko-pdf/ -----------

  it('parses real KASKO policy start date "01.12.2024"', () => {
    expect(parseExtractedDate('01.12.2024', 0)).toBe('2024-12-01')
  })

  it('parses real KASKO policy expiry date "01.12.2025"', () => {
    expect(parseExtractedDate('01.12.2025', 0)).toBe('2025-12-01')
  })

  // -- Output always YYYY-MM-DD (no time component, no timezone) -----------

  it('output never contains "T" (time component stripped)', () => {
    const result = parseExtractedDate('2024-12-15T12:34:56Z', 0)
    expect(result).not.toContain('T')
  })

  it('output always matches /^\\d{4}-\\d{2}-\\d{2}$/', () => {
    const inputs = ['2024-12-15', '15.12.2024', '15-12-2024', '15/12/2024', undefined, 'invalid']
    for (const raw of inputs) {
      expect(parseExtractedDate(raw, 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
