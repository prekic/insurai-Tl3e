/**
 * Admin Backfill Pilot Routes Tests
 *
 * Tests for:
 *   GET  /backfill/pilot   — dry-run classification
 *   POST /backfill/pilot   — execute header hydration
 *   GET  /backfill/verify   — verify specific records
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Mocks — hoisted so they can be referenced inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockLogError,
  mockLogInfo,
  mockLogWarn,
  mockFrom,
  mockSelect,
  mockRange,
  mockIn,
  mockEq,
  mockUpdate,
  mockSingle,
  mockLogAdminAction,
  mockGetSupabaseWithError,
} = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockEq = vi.fn()
  const mockUpdate = vi.fn()
  const mockIn = vi.fn()
  const mockRange = vi.fn()
  const mockSelect = vi.fn()
  const mockFrom = vi.fn()

  return {
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
    mockLogWarn: vi.fn(),
    mockFrom,
    mockSelect,
    mockRange,
    mockIn,
    mockEq,
    mockUpdate,
    mockSingle,
    mockLogAdminAction: vi.fn().mockResolvedValue(undefined),
    mockGetSupabaseWithError: vi.fn(),
  }
})

// Mock logger
vi.mock('../lib/logger.js', () => {
  const child = {
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

// Mock shared module
vi.mock('../routes/admin/shared.js', () => {
  const loggerChild = {
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    authenticateAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireSuperAdmin: () => [(_req: unknown, _res: unknown, next: () => void) => next()],
    logAdminAction: mockLogAdminAction,
    getSupabaseWithError: mockGetSupabaseWithError,
    logger: {
      ...loggerChild,
      child: vi.fn(() => loggerChild),
    },
  }
})

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

import backfillRouter from '../routes/admin/backfill.js'

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
  app.use('/', backfillRouter)
  return app
}

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const UUID_1 = '11111111-1111-1111-1111-111111111111'
const UUID_2 = '22222222-2222-2222-2222-222222222222'
const UUID_3 = '33333333-3333-3333-3333-333333333333'

function makePolicy(
  overrides: Partial<{
    id: string
    policy_number: string
    insured_person: string | null
    start_date: string | null
    expiry_date: string | null
    raw_data: Record<string, unknown> | null
    extracted_data: Record<string, unknown> | null
    user_id: string
    type: string
    provider: string
  }> = {}
) {
  return {
    id: UUID_1,
    policy_number: 'POL-001',
    insured_person: null,
    start_date: null,
    expiry_date: null,
    raw_data: null,
    extracted_data: null,
    user_id: 'user-001',
    type: 'kasko',
    provider: 'Allianz',
    ...overrides,
  }
}

/** A modern policy — all header fields populated */
function modernPolicy(id = UUID_1) {
  return makePolicy({
    id,
    insured_person: 'Test User',
    start_date: '2026-01-01',
    expiry_date: '2027-01-01',
    raw_data: { coverages: [1, 2], exclusions: [1], insights: [1, 2, 3] },
  })
}

/** A policy recoverable from raw_data */
function recoverablePolicy(id = UUID_2) {
  return makePolicy({
    id,
    insured_person: null,
    start_date: null,
    expiry_date: null,
    raw_data: {
      insured: { name: 'Recovered Person' },
      startDate: '2025-06-01',
      endDate: '2026-06-01',
      coverages: [1, 2, 3],
      exclusions: [],
      insights: [1],
    },
  })
}

/** A policy requiring re-extraction (has processedText but no recoverable headers) */
function reExtractionPolicy(id = UUID_3) {
  return makePolicy({
    id,
    raw_data: { processedText: 'Some OCR text...' },
  })
}

/** An unrecoverable policy — nothing useful */
function unrecoverablePolicy(id = UUID_3) {
  return makePolicy({ id, raw_data: null })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupSupabaseMock(supabase: unknown) {
  mockGetSupabaseWithError.mockReturnValue({ client: supabase, error: null })
}

function setupNoSupabase() {
  mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Not configured' })
}

/** Build a chainable mock Supabase client for SELECT queries */
function buildSelectChain(data: unknown[], error: unknown = null) {
  const result = { data, error }
  // Terminal methods
  mockSingle.mockReturnValue(result)
  mockRange.mockReturnValue(result)
  mockIn.mockReturnValue(result)
  mockEq.mockReturnValue({ ...result, single: mockSingle })

  mockSelect.mockReturnValue({
    range: mockRange,
    in: mockIn,
    eq: mockEq,
  })

  mockUpdate.mockReturnValue({
    eq: mockEq,
  })

  mockFrom.mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
  })

  return { from: mockFrom }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin Backfill Pilot Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // =========================================================================
  // GET /backfill/pilot — dry-run
  // =========================================================================

  describe('GET /backfill/pilot', () => {
    it('returns 503 when Supabase is not configured', async () => {
      setupNoSupabase()
      const res = await request(app).get('/backfill/pilot')
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })

    it('returns classified policies with correct bucket counts', async () => {
      const policies = [modernPolicy(UUID_1), recoverablePolicy(UUID_2), reExtractionPolicy(UUID_3)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.mode).toBe('dry-run')
      expect(data.total).toBe(3)
      expect(data.buckets.modern).toBe(1)
      expect(data.buckets.recoverableFromRawData).toBe(1)
      expect(data.buckets.requiresReExtraction).toBe(1)
      expect(data.buckets.unrecoverable).toBe(0)
    })

    it('classifies unrecoverable policies correctly', async () => {
      const policies = [unrecoverablePolicy(UUID_1)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.status).toBe(200)
      expect(res.body.data.buckets.unrecoverable).toBe(1)
      expect(res.body.data.records[0].bucket).toBe('unrecoverable')
    })

    it('uses default limit=10 and offset=0', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      await request(app).get('/backfill/pilot')

      // range(0, 9) means offset=0, limit=10 → range(0, 0+10-1)
      expect(mockRange).toHaveBeenCalledWith(0, 9)
    })

    it('respects limit and offset query params', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      await request(app).get('/backfill/pilot?limit=25&offset=50')

      expect(mockRange).toHaveBeenCalledWith(50, 74)
    })

    it('caps limit at 200', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      await request(app).get('/backfill/pilot?limit=999')

      // parseLimit(999) → min(999, 200) = 200; range(0, 199)
      expect(mockRange).toHaveBeenCalledWith(0, 199)
    })

    it('defaults invalid limit to 10', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      await request(app).get('/backfill/pilot?limit=abc')

      expect(mockRange).toHaveBeenCalledWith(0, 9)
    })

    it('defaults negative offset to 0', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      await request(app).get('/backfill/pilot?offset=-5')

      expect(mockRange).toHaveBeenCalledWith(0, 9)
    })

    it('returns 500 on database query failure', async () => {
      const supabase = buildSelectChain([], { message: 'connection refused' })
      setupSupabaseMock(supabase)

      // Make range return error
      mockRange.mockReturnValue({ data: null, error: { message: 'connection refused' } })

      const res = await request(app).get('/backfill/pilot')

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Database query failed')
      expect(res.body.details).toBe('connection refused')
    })

    it('includes proposed values and deltas for recoverable policies', async () => {
      const supabase = buildSelectChain([recoverablePolicy(UUID_1)])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.status).toBe(200)
      const record = res.body.data.records[0]
      expect(record.bucket).toBe('recoverableFromRawData')
      expect(record.proposed).toBeDefined()
      expect(record.proposed.insured_person).toBe('Recovered Person')
      expect(record.proposed.start_date).toBe('2025-06-01')
      expect(record.proposed.expiry_date).toBe('2026-06-01')
      expect(record.proposed.source).toBe('raw_data')
      expect(record.deltas).toHaveLength(3)
      // All deltas should show changed=true since current is null
      expect(record.deltas.every((d: { changed: boolean }) => d.changed)).toBe(true)
    })

    it('includes legacy_arrays counts for each record', async () => {
      const supabase = buildSelectChain([modernPolicy(UUID_1)])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.legacy_arrays).toEqual({ coverages: 2, exclusions: 1, insights: 3 })
    })

    it('warns about non-YYYY-MM-DD date formats', async () => {
      const policy = makePolicy({
        id: UUID_1,
        insured_person: null,
        start_date: null,
        expiry_date: null,
        raw_data: {
          insured: { name: 'Person' },
          startDate: '01/06/2025',
          endDate: 'June 2026',
        },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.body.data.warnings).toHaveLength(2)
      expect(res.body.data.warnings[0]).toContain('start_date')
      expect(res.body.data.warnings[0]).toContain('not YYYY-MM-DD')
      expect(res.body.data.warnings[1]).toContain('expiry_date')
    })

    it('logs admin action on successful dry-run', async () => {
      const supabase = buildSelectChain([modernPolicy(UUID_1)])
      setupSupabaseMock(supabase)

      await request(app).get('/backfill/pilot')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'backfill_pilot_dryrun',
        'policies',
        undefined,
        undefined,
        expect.objectContaining({ limit: 10, offset: 0, total: 1 })
      )
    })

    it('returns 500 on unexpected error', async () => {
      // Make getSupabaseWithError throw
      mockGetSupabaseWithError.mockImplementation(() => {
        throw new Error('unexpected boom')
      })

      const res = await request(app).get('/backfill/pilot')

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
    })

    it('recovers insured from extracted_data.insured (string)', async () => {
      const policy = makePolicy({
        id: UUID_1,
        raw_data: { startDate: '2025-01-01', endDate: '2026-01-01' },
        extracted_data: { insured: 'John Doe' },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.bucket).toBe('recoverableFromRawData')
      expect(record.proposed.insured_person).toBe('John Doe')
    })

    it('recovers insured from extracted_data.metadata.insured', async () => {
      const policy = makePolicy({
        id: UUID_1,
        raw_data: { startDate: '2025-01-01', endDate: '2026-01-01' },
        extracted_data: { metadata: { insured: 'Jane Doe' } },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.bucket).toBe('recoverableFromRawData')
      expect(record.proposed.insured_person).toBe('Jane Doe')
    })

    it('recovers dates from extracted_data when raw_data is empty', async () => {
      const policy = makePolicy({
        id: UUID_1,
        raw_data: { insured: { name: 'Person' } },
        extracted_data: { startDate: '2025-03-01', expiryDate: '2026-03-01' },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.bucket).toBe('recoverableFromRawData')
      expect(record.proposed.start_date).toBe('2025-03-01')
      expect(record.proposed.expiry_date).toBe('2026-03-01')
    })
  })

  // =========================================================================
  // POST /backfill/pilot — execute
  // =========================================================================

  describe('POST /backfill/pilot', () => {
    it('returns 400 when confirm is not true', async () => {
      const res = await request(app).post('/backfill/pilot').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('confirm')
      expect(res.body.hint).toBeDefined()
    })

    it('returns 400 when confirm is false', async () => {
      const res = await request(app).post('/backfill/pilot').send({ confirm: false })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('confirm')
    })

    it('returns 400 when confirm is string "true"', async () => {
      const res = await request(app).post('/backfill/pilot').send({ confirm: 'true' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('confirm')
    })

    it('returns 400 for invalid UUIDs in ids array', async () => {
      const res = await request(app)
        .post('/backfill/pilot')
        .send({ confirm: true, ids: ['not-a-uuid', 'also-bad'] })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid UUID')
      expect(res.body.error).toContain('not-a-uuid')
    })

    it('returns 503 when Supabase is not configured', async () => {
      setupNoSupabase()

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })

    it('returns 500 on database query failure', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      // Override range to return error for the fetch step
      mockRange.mockReturnValue({ data: null, error: { message: 'timeout' } })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Database query failed')
    })

    it('uses ids filter when provided (skips range)', async () => {
      const supabase = buildSelectChain([modernPolicy(UUID_1)])
      setupSupabaseMock(supabase)
      // Override in to return data
      mockIn.mockReturnValue({ data: [modernPolicy(UUID_1)], error: null })

      const res = await request(app)
        .post('/backfill/pilot')
        .send({ confirm: true, ids: [UUID_1] })

      expect(res.status).toBe(200)
      expect(mockIn).toHaveBeenCalledWith('id', [UUID_1])
      // range should NOT have been called when ids are provided
      expect(mockRange).not.toHaveBeenCalled()
    })

    it('skips non-recoverable records during write', async () => {
      const policies = [modernPolicy(UUID_1)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.mode).toBe('write')
      expect(data.records[0].write_action).toBe('skipped_wrong_bucket')
      expect(data.write_summary.attempted).toBe(0)
      expect(data.write_summary.updated).toBe(0)
    })

    it('executes hydration for recoverable records', async () => {
      const policies = [recoverablePolicy(UUID_1)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      // Mock the update chain: update returns eq, eq returns { error: null }
      mockEq.mockReturnValueOnce({ data: null, error: null })
      // Mock the post-write verification select
      mockEq.mockReturnValueOnce({
        single: vi.fn().mockReturnValue({
          data: { raw_data: { coverages: [1, 2, 3], exclusions: [], insights: [1] } },
          error: null,
        }),
      })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.write_summary.attempted).toBe(1)
      expect(data.write_summary.updated).toBe(1)

      const record = data.records.find(
        (r: { bucket: string }) => r.bucket === 'recoverableFromRawData'
      )
      expect(record.write_action).toBe('updated')
    })

    it('skips update when proposed values match current (no changes)', async () => {
      // Policy has insured but missing dates, and raw_data also has same insured but no dates
      const policy = makePolicy({
        id: UUID_1,
        insured_person: 'Already There',
        start_date: null,
        expiry_date: null,
        raw_data: {
          insured: { name: 'Already There' },
          startDate: '2025-01-01',
          endDate: '2026-01-01',
        },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      // The update eq mock for writing dates
      mockEq.mockReturnValueOnce({ data: null, error: null })
      // Post-write verification
      mockEq.mockReturnValueOnce({
        single: vi.fn().mockReturnValue({ data: { raw_data: {} }, error: null }),
      })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(200)
      // Should still attempt because dates changed
      expect(res.body.data.write_summary.attempted).toBe(1)
    })

    it('reports error when update fails', async () => {
      const policies = [recoverablePolicy(UUID_1)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      // Make update fail
      mockEq.mockReturnValueOnce({ data: null, error: { message: 'permission denied' } })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(200)
      const record = res.body.data.records.find(
        (r: { bucket: string }) => r.bucket === 'recoverableFromRawData'
      )
      expect(record.write_action).toBe('error')
      expect(record.write_error).toBe('permission denied')
      expect(res.body.data.errors).toContain(`${UUID_1}: permission denied`)
    })

    it('detects legacy array instability after write', async () => {
      const policies = [recoverablePolicy(UUID_1)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      // Update succeeds
      mockEq.mockReturnValueOnce({ data: null, error: null })
      // Post-write verification shows arrays changed (coverages went from 3 to 1)
      mockEq.mockReturnValueOnce({
        single: vi.fn().mockReturnValue({
          data: { raw_data: { coverages: [1], exclusions: [], insights: [1] } },
          error: null,
        }),
      })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(200)
      const record = res.body.data.records.find(
        (r: { bucket: string }) => r.bucket === 'recoverableFromRawData'
      )
      expect(record.verification.arrays_stable).toBe(false)
      expect(res.body.data.errors.some((e: string) => e.includes('CRITICAL'))).toBe(true)
      expect(res.body.data.write_summary.all_arrays_stable).toBe(false)
    })

    it('confirms arrays_stable=true when arrays unchanged', async () => {
      const policies = [recoverablePolicy(UUID_1)]
      const supabase = buildSelectChain(policies)
      setupSupabaseMock(supabase)

      // Update succeeds
      mockEq.mockReturnValueOnce({ data: null, error: null })
      // Post-write verification — same arrays as before
      mockEq.mockReturnValueOnce({
        single: vi.fn().mockReturnValue({
          data: { raw_data: { coverages: [1, 2, 3], exclusions: [], insights: [1] } },
          error: null,
        }),
      })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      const record = res.body.data.records.find(
        (r: { bucket: string }) => r.bucket === 'recoverableFromRawData'
      )
      expect(record.verification.arrays_stable).toBe(true)
      expect(res.body.data.write_summary.all_arrays_stable).toBe(true)
    })

    it('logs admin action on successful execution', async () => {
      const supabase = buildSelectChain([modernPolicy(UUID_1)])
      setupSupabaseMock(supabase)

      await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'backfill_pilot_execute',
        'policies',
        undefined,
        undefined,
        expect.objectContaining({ write_summary: expect.any(Object) })
      )
    })

    it('accepts valid UUIDs in ids array', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: [], error: null })

      const res = await request(app)
        .post('/backfill/pilot')
        .send({ confirm: true, ids: [UUID_1, UUID_2] })

      expect(res.status).toBe(200)
      expect(mockIn).toHaveBeenCalledWith('id', [UUID_1, UUID_2])
    })

    it('returns 500 on unexpected error', async () => {
      mockGetSupabaseWithError.mockImplementation(() => {
        throw new Error('unexpected')
      })

      const res = await request(app).post('/backfill/pilot').send({ confirm: true })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
    })

    it('respects limit from body (string)', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      // parseLimit expects string input (from query or body stringified)
      await request(app).post('/backfill/pilot').send({ confirm: true, limit: '50' })

      expect(mockRange).toHaveBeenCalledWith(0, 49)
    })

    it('caps limit at 200 for POST', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      await request(app).post('/backfill/pilot').send({ confirm: true, limit: '500' })

      expect(mockRange).toHaveBeenCalledWith(0, 199)
    })

    it('defaults to 10 when body limit is a number (parseLimit expects string)', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)

      // parseLimit checks typeof raw === 'string', so numeric 50 falls through to default 10
      await request(app).post('/backfill/pilot').send({ confirm: true, limit: 50 })

      expect(mockRange).toHaveBeenCalledWith(0, 9)
    })
  })

  // =========================================================================
  // GET /backfill/verify
  // =========================================================================

  describe('GET /backfill/verify', () => {
    it('returns 400 when ids param is missing', async () => {
      const res = await request(app).get('/backfill/verify')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('ids')
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when ids is empty string', async () => {
      const res = await request(app).get('/backfill/verify?ids=')

      expect(res.status).toBe(400)
      // Empty string is falsy, so hits the "required" check
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when more than 50 IDs provided', async () => {
      const manyIds = Array.from(
        { length: 51 },
        (_, i) => `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`
      ).join(',')

      const res = await request(app).get(`/backfill/verify?ids=${manyIds}`)

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('1-50')
    })

    it('returns 400 for invalid UUID format', async () => {
      const res = await request(app).get('/backfill/verify?ids=not-a-uuid')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid UUID')
      expect(res.body.error).toContain('not-a-uuid')
    })

    it('returns 400 when mix of valid and invalid UUIDs', async () => {
      const res = await request(app).get(`/backfill/verify?ids=${UUID_1},bad-id`)

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('bad-id')
    })

    it('returns 503 when Supabase is not configured', async () => {
      setupNoSupabase()

      const res = await request(app).get(`/backfill/verify?ids=${UUID_1}`)

      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })

    it('returns 500 on database query failure', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: null, error: { message: 'table not found' } })

      const res = await request(app).get(`/backfill/verify?ids=${UUID_1}`)

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('table not found')
    })

    it('returns verification data for valid IDs', async () => {
      const policy = modernPolicy(UUID_1)
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: [policy], error: null })

      const res = await request(app).get(`/backfill/verify?ids=${UUID_1}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.total).toBe(1)
      const record = res.body.data.records[0]
      expect(record.id).toBe(UUID_1)
      expect(record.insured_person).toBe('Test User')
      expect(record.start_date).toBe('2026-01-01')
      expect(record.expiry_date).toBe('2027-01-01')
      expect(record.legacy_arrays).toEqual({ coverages: 2, exclusions: 1, insights: 3 })
      expect(record.has_processed_text).toBe(false)
    })

    it('reports has_processed_text=true when processedText exists', async () => {
      const policy = makePolicy({
        id: UUID_1,
        insured_person: 'Person',
        start_date: '2025-01-01',
        expiry_date: '2026-01-01',
        raw_data: { processedText: 'Some text', coverages: [] },
      })
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: [policy], error: null })

      const res = await request(app).get(`/backfill/verify?ids=${UUID_1}`)

      expect(res.body.data.records[0].has_processed_text).toBe(true)
    })

    it('accepts multiple comma-separated UUIDs', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: [modernPolicy(UUID_1), modernPolicy(UUID_2)], error: null })

      const res = await request(app).get(`/backfill/verify?ids=${UUID_1},${UUID_2}`)

      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(2)
      expect(mockIn).toHaveBeenCalledWith('id', [UUID_1, UUID_2])
    })

    it('trims whitespace from IDs', async () => {
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: [], error: null })

      const res = await request(app).get(`/backfill/verify?ids= ${UUID_1} , ${UUID_2} `)

      expect(res.status).toBe(200)
      expect(mockIn).toHaveBeenCalledWith('id', [UUID_1, UUID_2])
    })

    it('returns 500 on unexpected error', async () => {
      mockGetSupabaseWithError.mockImplementation(() => {
        throw new Error('boom')
      })

      const res = await request(app).get(`/backfill/verify?ids=${UUID_1}`)

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
    })

    it('accepts exactly 50 IDs', async () => {
      const ids = Array.from(
        { length: 50 },
        (_, i) => `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`
      )
      const supabase = buildSelectChain([])
      setupSupabaseMock(supabase)
      mockIn.mockReturnValue({ data: [], error: null })

      const res = await request(app).get(`/backfill/verify?ids=${ids.join(',')}`)

      expect(res.status).toBe(200)
    })
  })

  // =========================================================================
  // Classification logic edge cases
  // =========================================================================

  describe('Classification logic', () => {
    it('preserves DB columns when already present (modern bucket)', async () => {
      const policy = modernPolicy(UUID_1)
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.bucket).toBe('modern')
      expect(record.current.insured_person).toBe('Test User')
      expect(record.current.start_date).toBe('2026-01-01')
      expect(record.proposed).toBeUndefined()
    })

    it('uses DB values for partially populated policies', async () => {
      // Has insured in DB but dates only in raw_data
      const policy = makePolicy({
        id: UUID_1,
        insured_person: 'DB Person',
        start_date: null,
        expiry_date: null,
        raw_data: {
          startDate: '2025-01-01',
          endDate: '2026-01-01',
        },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.bucket).toBe('recoverableFromRawData')
      // Proposed insured_person should keep the DB value since recovery chain returns null
      // but the proposed takes recovered.insured || p.insured_person
      expect(record.proposed.insured_person).toBe('DB Person')
      expect(record.proposed.start_date).toBe('2025-01-01')
    })

    it('recovers from raw_data.insuredName', async () => {
      const policy = makePolicy({
        id: UUID_1,
        raw_data: {
          insuredName: 'From InsuredName',
          startDate: '2025-01-01',
          endDate: '2026-01-01',
        },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.body.data.records[0].proposed.insured_person).toBe('From InsuredName')
    })

    it('recovers expiry from raw_data.expiryDate as fallback', async () => {
      const policy = makePolicy({
        id: UUID_1,
        raw_data: {
          insured: { name: 'Person' },
          startDate: '2025-01-01',
          expiryDate: '2026-01-01',
          // No endDate — so expiryDate is the third fallback for expiry
        },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      const record = res.body.data.records[0]
      expect(record.bucket).toBe('recoverableFromRawData')
      expect(record.proposed.expiry_date).toBe('2026-01-01')
    })

    it('recovers from extracted_data.insured.name (object)', async () => {
      const policy = makePolicy({
        id: UUID_1,
        raw_data: { startDate: '2025-01-01', endDate: '2026-01-01' },
        extracted_data: { insured: { name: 'Extracted Insured' } },
      })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.body.data.records[0].proposed.insured_person).toBe('Extracted Insured')
    })

    it('counts zero for missing legacy arrays', async () => {
      const policy = makePolicy({ id: UUID_1, raw_data: {} })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.body.data.records[0].legacy_arrays).toEqual({
        coverages: 0,
        exclusions: 0,
        insights: 0,
      })
    })

    it('handles null raw_data and extracted_data gracefully', async () => {
      const policy = makePolicy({ id: UUID_1, raw_data: null, extracted_data: null })
      const supabase = buildSelectChain([policy])
      setupSupabaseMock(supabase)

      const res = await request(app).get('/backfill/pilot')

      expect(res.status).toBe(200)
      expect(res.body.data.records[0].bucket).toBe('unrecoverable')
    })
  })
})
