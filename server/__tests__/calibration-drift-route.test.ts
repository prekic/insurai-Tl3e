/**
 * Tests for GET /api/admin/monitoring/calibration-drift.
 *
 * Covers:
 *   - Supabase not configured → honest null payload
 *   - app_settings query failure → degraded response, defaults used
 *   - policies query failure → degraded response with message
 *   - zero scored policies → sampleCount 0, no false-positive drift
 *   - normal distribution, drift within tolerance → driftExceedsTolerance false
 *   - shifted distribution, drift outside tolerance → driftExceedsTolerance true
 *   - malformed raw_data rows are skipped, not crashed on
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockLogWarn, mockLogError, mockLogInfo, mockLogDebug, mockSupabaseClient } = vi.hoisted(
  () => ({
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
    mockLogDebug: vi.fn(),
    mockSupabaseClient: {
      _settingsRows: null as unknown,
      _settingsError: null as unknown,
      _policyRows: null as unknown,
      _policiesError: null as unknown,
    },
  })
)

vi.mock('../lib/logger.js', () => {
  const child = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: { ...child, child: vi.fn(() => child) },
    logger: { ...child, child: vi.fn(() => child) },
  }
})

vi.mock('../routes/admin/shared.js', () => {
  const loggerChild = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }

  // Build a chainable mock matching the real supabase-js surface we use:
  //   .from(table).select(cols).eq(col, val).in(col, vals)           (app_settings)
  //   .from(table).select(cols).gte(col, val)                        (policies)
  function buildChain(isSettingsTable: boolean) {
    const promise = isSettingsTable
      ? Promise.resolve({
          data: mockSupabaseClient._settingsRows,
          error: mockSupabaseClient._settingsError,
        })
      : Promise.resolve({
          data: mockSupabaseClient._policyRows,
          error: mockSupabaseClient._policiesError,
        })
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(() => promise),
      gte: vi.fn(() => promise),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    } as unknown as Record<string, unknown>
    return chain
  }

  const supabase = {
    from: vi.fn((table: string) => buildChain(table === 'app_settings')),
  }

  return {
    authenticateAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireSuperAdmin: () => [(_req: unknown, _res: unknown, next: () => void) => next()],
    requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    logAdminAction: vi.fn().mockResolvedValue(undefined),
    getSupabaseWithError: vi.fn(() => ({ client: supabase, error: null })),
    logger: { ...loggerChild, child: vi.fn(() => loggerChild) },
  }
})

// Secondary import of the mocked shared module so individual tests can flip
// getSupabaseWithError between configured/unconfigured states.
import * as sharedMocks from '../routes/admin/shared.js'
import calibrationDriftRouter from '../routes/admin/calibration-drift.js'

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

function createApp() {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = {
      id: 'admin-test-001',
      email: 'admin@test.com',
      role: 'super_admin',
      status: 'active',
      permissions: [],
    }
    next()
  })
  app.use('/', calibrationDriftRouter)
  return app
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function settingsRows(
  gradeA: number,
  gradeB: number,
  gradeC: number,
  gradeD: number
): Array<{ key: string; value: string }> {
  return [
    { key: 'grade_a_threshold', value: String(gradeA) },
    { key: 'grade_b_threshold', value: String(gradeB) },
    { key: 'grade_c_threshold', value: String(gradeC) },
    { key: 'grade_d_threshold', value: String(gradeD) },
  ]
}

function scoredPolicyRow(score: number) {
  return {
    raw_data: { evaluation: { overallScore: score } },
    created_at: new Date().toISOString(),
  }
}

function resetSupabaseState() {
  mockSupabaseClient._settingsRows = settingsRows(90, 80, 70, 60)
  mockSupabaseClient._settingsError = null
  mockSupabaseClient._policyRows = []
  mockSupabaseClient._policiesError = null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /monitoring/calibration-drift', () => {
  beforeEach(() => {
    resetSupabaseState()
    vi.clearAllMocks()
    // Ensure the default mock has supabase configured (each test that wants
    // to override can flip it).
    vi.mocked(sharedMocks.getSupabaseWithError).mockReturnValue({
      client: {
        from: (table: string) => {
          const promise =
            table === 'app_settings'
              ? Promise.resolve({
                  data: mockSupabaseClient._settingsRows,
                  error: mockSupabaseClient._settingsError,
                })
              : Promise.resolve({
                  data: mockSupabaseClient._policyRows,
                  error: mockSupabaseClient._policiesError,
                })
          const chain = {
            select: () => chain,
            eq: () => chain,
            in: () => promise,
            gte: () => promise,
            then: promise.then.bind(promise),
            catch: promise.catch.bind(promise),
          }
          return chain
        },
      } as unknown as ReturnType<typeof sharedMocks.getSupabaseWithError>['client'],
      error: null,
    })
  })

  it('returns honest null payload when Supabase is not configured', async () => {
    vi.mocked(sharedMocks.getSupabaseWithError).mockReturnValueOnce({
      client: null,
      error: 'SUPABASE_URL not set',
    })

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.sampleCount).toBe(0)
    expect(res.body.data.driftExceedsTolerance).toBe(false)
    expect(res.body.data.message).toMatch(/SUPABASE_URL not set/)
    expect(res.body.data.currentThresholds).toEqual({
      gradeA: 90,
      gradeB: 80,
      gradeC: 70,
      gradeD: 60,
    })
  })

  it('returns sampleCount=0 when no policies have scores yet', async () => {
    mockSupabaseClient._policyRows = []

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.sampleCount).toBe(0)
    expect(res.body.data.driftExceedsTolerance).toBe(false)
    expect(res.body.data.message).toMatch(/No scored policies/i)
  })

  it('surfaces a degraded payload when policies query errors', async () => {
    mockSupabaseClient._policiesError = { message: 'permission denied' }

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.sampleCount).toBe(0)
    expect(res.body.data.message).toMatch(/Unable to query policies/)
  })

  it('uses defaults when app_settings lookup fails', async () => {
    mockSupabaseClient._settingsRows = null
    mockSupabaseClient._settingsError = { message: 'settings not found' }
    // Tight distribution around the defaults.
    mockSupabaseClient._policyRows = [
      scoredPolicyRow(92),
      scoredPolicyRow(84),
      scoredPolicyRow(72),
      scoredPolicyRow(62),
    ]

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.data.currentThresholds).toEqual({
      gradeA: 90,
      gradeB: 80,
      gradeC: 70,
      gradeD: 60,
    })
    expect(res.body.data.sampleCount).toBe(4)
  })

  it('reports drift within tolerance when distribution matches thresholds', async () => {
    // 10 samples hand-tuned so each percentile lands within ±5 of the
    // default (90, 80, 70, 60) thresholds:
    //   p25 = 60.0, p50 = 71.0, p75 = 83.75, p90 = 90.2
    //   drifts: (+0.2, +3.75, +1.0, 0.0) — all within tolerance 5.
    const scores = [58, 60, 60, 60, 70, 72, 80, 85, 90, 92]
    mockSupabaseClient._policyRows = scores.map(scoredPolicyRow)

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.data.sampleCount).toBe(10)
    expect(res.body.data.driftExceedsTolerance).toBe(false)
    // Drifts should be numeric and bounded in |5|.
    const { gradeA, gradeB, gradeC, gradeD } = res.body.data.drifts
    for (const d of [gradeA, gradeB, gradeC, gradeD]) {
      expect(typeof d).toBe('number')
      expect(Math.abs(d)).toBeLessThanOrEqual(5)
    }
  })

  it('flags driftExceedsTolerance when distribution shifts far above thresholds', async () => {
    // Everyone scores 95+. p90 = 97, so drift on grade A = +7 > tolerance 5.
    const scores = [95, 96, 97, 98, 99, 97, 96, 98, 95, 99]
    mockSupabaseClient._policyRows = scores.map(scoredPolicyRow)

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.data.sampleCount).toBe(10)
    expect(res.body.data.driftExceedsTolerance).toBe(true)
    expect(res.body.data.drifts.gradeA).toBeGreaterThan(5)
  })

  it('skips rows with missing or malformed raw_data', async () => {
    mockSupabaseClient._policyRows = [
      scoredPolicyRow(85),
      { raw_data: null, created_at: new Date().toISOString() },
      { raw_data: { evaluation: null }, created_at: new Date().toISOString() },
      { raw_data: { evaluation: { overallScore: 'nope' } }, created_at: new Date().toISOString() },
      scoredPolicyRow(92),
    ]

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    // Only the two numeric scores should be counted.
    expect(res.body.data.sampleCount).toBe(2)
    expect(res.body.data.driftExceedsTolerance).toBeDefined()
  })

  it('honors overridden thresholds when app_settings rows are present', async () => {
    // Admin configured stricter thresholds (A raised to 95, B to 85, C to 75, D to 65).
    mockSupabaseClient._settingsRows = settingsRows(95, 85, 75, 65)
    // 10 samples tuned so each percentile lands within ±5 of the overrides:
    //   p25 = 65.0, p50 = 76.0, p75 = 88.75, p90 = 95.2
    const scores = [63, 65, 65, 65, 75, 77, 85, 90, 95, 97]
    mockSupabaseClient._policyRows = scores.map(scoredPolicyRow)

    const res = await request(createApp()).get('/monitoring/calibration-drift')

    expect(res.status).toBe(200)
    expect(res.body.data.currentThresholds.gradeA).toBe(95)
    expect(res.body.data.currentThresholds.gradeB).toBe(85)
    expect(res.body.data.currentThresholds.gradeC).toBe(75)
    expect(res.body.data.currentThresholds.gradeD).toBe(65)
    // All drifts should be within ±5 of the overridden thresholds.
    const { gradeA, gradeB, gradeC, gradeD } = res.body.data.drifts
    for (const d of [gradeA, gradeB, gradeC, gradeD]) {
      expect(Math.abs(d)).toBeLessThanOrEqual(5)
    }
    expect(res.body.data.driftExceedsTolerance).toBe(false)
  })
})
