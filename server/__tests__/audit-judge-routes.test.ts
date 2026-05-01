/**
 * /api/ai/audit-judge route tests.
 *
 * Validates: input validation, 202 fast-path response, fire-and-forget
 * dispatch to runAuditJudge. The runAuditJudge service is mocked so
 * these tests don't require Anthropic / Supabase / migration 053.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Hoisted mock — `vi.mock` is hoisted, so we need the mock fn to be
// referenced from inside the factory.
const { mockRunAuditJudge } = vi.hoisted(() => ({
  mockRunAuditJudge: vi.fn(),
}))

vi.mock('../services/audit-judge-service.js', () => ({
  runAuditJudge: mockRunAuditJudge,
}))

vi.mock('../lib/logger.js', () => {
  const child = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: { ...child, child: vi.fn(() => child) },
    logger: { ...child, child: vi.fn(() => child) },
  }
})

const originalEnv = process.env

describe('POST /api/ai/audit-judge', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRunAuditJudge.mockResolvedValue(null) // Default: no-op
    process.env = { ...originalEnv, NODE_ENV: 'test' }
    vi.resetModules()
    const aiRoutes = (await import('../routes/ai')).default
    app = express()
    // Match production limit (server/index.ts:261 uses '10mb') so the
    // 200KB rawText boundary case is exercised by Zod, not by the
    // body-parser default-100KB cap.
    app.use(express.json({ limit: '10mb' }))
    app.use('/api/ai', aiRoutes)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  const VALID_BODY = {
    insuranceLine: 'kasko',
    country: 'TR',
    startDate: '01.01.2024',
    insurer: 'Anadolu Sigorta',
    rawText: 'Pert araç muafiyeti %35 — sample raw text for the audit judge.',
    structuredExtraction: { policyNumber: 'P-1', coverages: [] },
    policyId: '11111111-1111-4111-8111-111111111111',
    fixtureId: null,
  }

  it('returns 202 for a valid request', async () => {
    const res = await request(app).post('/api/ai/audit-judge').send(VALID_BODY)
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ ok: true, message: 'Audit judge enqueued' })
  })

  it('invokes runAuditJudge in the background with the validated body', async () => {
    await request(app).post('/api/ai/audit-judge').send(VALID_BODY)
    // The route returns 202 BEFORE awaiting runAuditJudge — the call
    // is fire-and-forget. Wait a microtask + small tick for the
    // dispatch to land.
    await new Promise((r) => setTimeout(r, 10))
    expect(mockRunAuditJudge).toHaveBeenCalledTimes(1)
    const arg = mockRunAuditJudge.mock.calls[0][0]
    expect(arg.insuranceLine).toBe('kasko')
    expect(arg.country).toBe('TR')
    expect(arg.insurer).toBe('Anadolu Sigorta')
    expect(arg.policyId).toBe(VALID_BODY.policyId)
  })

  it('returns 400 for missing insuranceLine', async () => {
    const { insuranceLine: _, ...rest } = VALID_BODY
    void _
    const res = await request(app).post('/api/ai/audit-judge').send(rest)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing rawText', async () => {
    const { rawText: _, ...rest } = VALID_BODY
    void _
    const res = await request(app).post('/api/ai/audit-judge').send(rest)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing structuredExtraction', async () => {
    const { structuredExtraction: _, ...rest } = VALID_BODY
    void _
    const res = await request(app).post('/api/ai/audit-judge').send(rest)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid policyId UUID', async () => {
    const res = await request(app)
      .post('/api/ai/audit-judge')
      .send({ ...VALID_BODY, policyId: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for rawText that exceeds 200KB', async () => {
    const huge = 'x'.repeat(200_001)
    const res = await request(app)
      .post('/api/ai/audit-judge')
      .send({ ...VALID_BODY, rawText: huge })
    expect(res.status).toBe(400)
  })

  it('still returns 202 even if runAuditJudge fails internally', async () => {
    mockRunAuditJudge.mockRejectedValueOnce(new Error('downstream boom'))
    const res = await request(app).post('/api/ai/audit-judge').send(VALID_BODY)
    expect(res.status).toBe(202)
    // Allow the unhandled rejection to be caught by the route's
    // .catch(); the test ensures the rejection doesn't surface to the
    // client.
    await new Promise((r) => setTimeout(r, 10))
  })

  it('accepts null fixtureId', async () => {
    const res = await request(app)
      .post('/api/ai/audit-judge')
      .send({ ...VALID_BODY, fixtureId: null })
    expect(res.status).toBe(202)
  })

  it('defaults country to TR when omitted', async () => {
    const { country: _, ...rest } = VALID_BODY
    void _
    const res = await request(app).post('/api/ai/audit-judge').send(rest)
    expect(res.status).toBe(202)
    await new Promise((r) => setTimeout(r, 10))
    const arg = mockRunAuditJudge.mock.calls[0][0]
    expect(arg.country).toBe('TR')
  })
})
