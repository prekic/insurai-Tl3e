import { describe, it, expect } from 'vitest'
import { classifyRow } from '../backfill-date-bug'

/**
 * Unit tests for the corruption classifier. These exercise the pure function
 * without touching Supabase — they pin the runbook 05 §3 CASE logic into code.
 */
describe('classifyRow', () => {
  // -- CORRUPTED: raw says Dec 1, DB holds Jan 12 (V8 swap). ------------------
  it('flags CORRUPTED when DB date matches V8 swap and disagrees with Turkish', () => {
    const verdict = classifyRow('01.12.2024', '2024-01-12')
    expect(verdict).not.toBeNull()
    expect(verdict!.status).toBe('CORRUPTED')
    expect(verdict!.trInterpreted).toBe('2024-12-01')
    expect(verdict!.v8Interpreted).toBe('2024-01-12')
  })

  it('flags CORRUPTED for another day-<=12 / month-<=12 swap', () => {
    // Raw: 05.08.2023 = Aug 5. V8 would read as May 8 → 2023-05-08.
    const v = classifyRow('05.08.2023', '2023-05-08')
    expect(v!.status).toBe('CORRUPTED')
  })

  // -- OK: DB already holds the correct Turkish interpretation. ---------------
  it('returns OK when DB matches Turkish DD.MM.YYYY interpretation', () => {
    const v = classifyRow('01.12.2024', '2024-12-01')
    expect(v!.status).toBe('OK')
  })

  it('returns OK when day > 12 (bug cannot happen — V8 returned NaN, fallback ran correctly)', () => {
    // Raw: 15.03.2024 = Mar 15. V8 would NaN on month=15, so fallback produced
    // the correct Turkish parse.
    const v = classifyRow('15.03.2024', '2024-03-15')
    expect(v!.status).toBe('OK')
  })

  it('returns OK for ISO datetime DB values (PostgREST sometimes returns datetime for date cols)', () => {
    const v = classifyRow('01.12.2024', '2024-12-01T00:00:00+00:00')
    expect(v!.status).toBe('OK')
  })

  // -- MANUAL_REVIEW: DB matches neither interpretation. ----------------------
  it('flags MANUAL_REVIEW when DB matches neither interpretation', () => {
    const v = classifyRow('01.12.2024', '2024-07-04')
    expect(v!.status).toBe('MANUAL_REVIEW')
  })

  it('flags MANUAL_REVIEW when DB is empty but raw matches candidate pattern', () => {
    const v = classifyRow('01.12.2024', '')
    expect(v!.status).toBe('MANUAL_REVIEW')
  })

  it('flags MANUAL_REVIEW when DB is null but raw matches candidate pattern', () => {
    const v = classifyRow('01.12.2024', null)
    expect(v!.status).toBe('MANUAL_REVIEW')
  })

  // -- Non-candidates (return null, meaning "not a candidate at all"). --------
  it('returns null when rawStart is not in DD.MM.YYYY pattern', () => {
    expect(classifyRow('2024-12-01', '2024-12-01')).toBeNull()
    expect(classifyRow('2024/12/01', '2024-12-01')).toBeNull()
    expect(classifyRow('', '2024-12-01')).toBeNull()
    expect(classifyRow(null, '2024-12-01')).toBeNull()
    expect(classifyRow(undefined, '2024-12-01')).toBeNull()
  })

  it('returns null when rawStart is Turkish DD/MM/YYYY (slash) — not the bug pattern', () => {
    // The bug was specifically dot-separated; slash-separated was never
    // affected because the old code's fallback was a manual regex on `.`.
    expect(classifyRow('01/12/2024', '2024-01-12')).toBeNull()
  })

  it('returns null for non-string raw inputs', () => {
    // Defensive: the function signature accepts unknown shapes from raw_data.
    expect(classifyRow(123 as unknown as string, '2024-12-01')).toBeNull()
  })

  // -- Pad/zero-pad semantics. ------------------------------------------------
  it('pads single-digit day and month correctly in both interpretations', () => {
    const v = classifyRow('1.2.2024', '2024-01-02')
    expect(v!.status).toBe('CORRUPTED')
    expect(v!.trInterpreted).toBe('2024-02-01')
    expect(v!.v8Interpreted).toBe('2024-01-02')
  })
})
