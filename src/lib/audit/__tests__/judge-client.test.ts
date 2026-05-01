/**
 * Phase 3 follow-up — judge-client tests.
 *
 * The wrapper is fire-and-forget so the contract is narrow: dispatch
 * the POST when env is configured AND inputs are valid; never throw;
 * return false (silently skip) when prerequisites are missing.
 *
 * The NODE_ENV='test' guard inside `submitAuditJudge` would normally
 * short-circuit every assertion in this file. We invert the guard for
 * the duration of each test by stashing+restoring NODE_ENV so the
 * actual dispatch logic gets exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock env BEFORE importing the module under test so the proxyUrl
// constant is captured correctly (it's read at module-load time inside env.ts).
vi.mock('@/lib/env', () => ({
  env: {
    proxyUrl: 'http://test-proxy:4001',
    config: {},
    warnings: [],
    isDev: false,
    isProd: false,
    hasSupabase: false,
    hasProxy: true,
    hasAI: true,
  },
}))

import { submitAuditJudge } from '../judge-client'

const VALID_INPUT = {
  insuranceLine: 'kasko',
  country: 'TR',
  startDate: '01.01.2024',
  insurer: 'Anadolu Sigorta',
  rawText: 'Pert araç muafiyeti %35.',
  structuredExtraction: { policyNumber: 'P-1' },
  policyId: '11111111-1111-4111-8111-111111111111',
  fixtureId: null,
}

const savedNodeEnv = process.env.NODE_ENV
const mockFetch = vi.fn()

beforeEach(() => {
  // Lift the NODE_ENV='test' guard so the actual dispatch runs.
  process.env.NODE_ENV = 'production'
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ status: 202 })
})

afterEach(() => {
  process.env.NODE_ENV = savedNodeEnv
  vi.unstubAllGlobals()
})

describe('submitAuditJudge', () => {
  it('returns false (skips dispatch) when NODE_ENV === "test"', async () => {
    process.env.NODE_ENV = 'test'
    const result = await submitAuditJudge(VALID_INPUT)
    expect(result).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('POSTs to /api/ai/audit-judge and returns true on 202', async () => {
    const result = await submitAuditJudge(VALID_INPUT)
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://test-proxy:4001/api/ai/audit-judge')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body ?? '{}')
    expect(body.insuranceLine).toBe('kasko')
    expect(body.insurer).toBe('Anadolu Sigorta')
    expect(body.policyId).toBe(VALID_INPUT.policyId)
    expect(body.country).toBe('TR')
  })

  it('defaults country to TR when omitted', async () => {
    await submitAuditJudge({ ...VALID_INPUT, country: undefined })
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body ?? '{}')
    expect(body.country).toBe('TR')
  })

  it('returns false when startDate is missing', async () => {
    const result = await submitAuditJudge({ ...VALID_INPUT, startDate: null })
    expect(result).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns false when insurer is empty', async () => {
    const result = await submitAuditJudge({ ...VALID_INPUT, insurer: '' })
    expect(result).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns false when rawText is empty', async () => {
    const result = await submitAuditJudge({ ...VALID_INPUT, rawText: '' })
    expect(result).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns false when structuredExtraction is missing', async () => {
    const result = await submitAuditJudge({ ...VALID_INPUT, structuredExtraction: null })
    expect(result).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('swallows fetch errors (never throws)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error('network down'))
    const result = await submitAuditJudge(VALID_INPUT)
    expect(result).toBe(false)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[AuditJudge] dispatch failed:',
      expect.stringContaining('network down')
    )
    consoleSpy.mockRestore()
  })

  it('returns false when server responds with non-202', async () => {
    mockFetch.mockResolvedValueOnce({ status: 500 })
    const result = await submitAuditJudge(VALID_INPUT)
    expect(result).toBe(false)
  })
})
