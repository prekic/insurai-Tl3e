/**
 * FX Routes Tests
 *
 * Tests for GET /api/fx/rates endpoint:
 * - Returns rates object with base, rates, timestamp
 * - Rate caching (same response within TTL)
 * - Error handling (500 response with fallback rates)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('express-rate-limit', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: () => child }
  return { logger: child, default: child }
})

// =============================================================================
// HELPERS
// =============================================================================

const EXPECTED_FALLBACK_RATES = { TRY: 1, USD: 33.5, EUR: 36.5, GBP: 42.5 }

async function buildApp() {
  vi.resetModules()
  const app = express()
  app.use(express.json())
  const { default: fxRouter } = await import('../routes/fx.js')
  app.use('/api/fx', fxRouter)
  return app
}

// =============================================================================
// TESTS
// =============================================================================

describe('GET /api/fx/rates', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    // Build fresh app to reset module-level cachedRates and lastFetchTime
    app = await buildApp()
  })

  it('returns 200 with base, rates, and timestamp', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body).toHaveProperty('base', 'TRY')
    expect(res.body).toHaveProperty('rates')
    expect(res.body).toHaveProperty('timestamp')
    expect(typeof res.body.timestamp).toBe('number')
    expect(res.body.timestamp).toBeGreaterThan(0)
  })

  it('returns all supported currencies in rates', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.rates).toHaveProperty('TRY')
    expect(res.body.rates).toHaveProperty('USD')
    expect(res.body.rates).toHaveProperty('EUR')
    expect(res.body.rates).toHaveProperty('GBP')
  })

  it('returns fallback rates (static values)', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.rates).toEqual(EXPECTED_FALLBACK_RATES)
  })

  it('returns TRY base rate as 1', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.rates.TRY).toBe(1)
    expect(res.body.base).toBe('TRY')
  })

  it('returns cached response on second request within TTL', async () => {
    const res1 = await request(app).get('/api/fx/rates').expect(200)
    const res2 = await request(app).get('/api/fx/rates').expect(200)

    // Same timestamp means cached
    expect(res2.body.timestamp).toBe(res1.body.timestamp)
    expect(res2.body.rates).toEqual(res1.body.rates)
  })

  it('updates timestamp on first request (lastFetchTime was 0)', async () => {
    const before = Date.now()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.timestamp).toBeGreaterThanOrEqual(before)
  })

  it('returns valid JSON content-type', async () => {
    const res = await request(app).get('/api/fx/rates')

    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('all rate values are positive numbers', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    for (const [_currency, rate] of Object.entries(res.body.rates)) {
      expect(typeof rate).toBe('number')
      expect(rate).toBeGreaterThan(0)
    }
  })
})

describe('GET /api/fx/rates — Cache behavior across requests', () => {
  it('returns same timestamp for multiple rapid requests', async () => {
    const app = await buildApp()

    const results = await Promise.all([
      request(app).get('/api/fx/rates'),
      request(app).get('/api/fx/rates'),
      request(app).get('/api/fx/rates'),
    ])

    const timestamps = results.map((r) => r.body.timestamp)
    // All should share the same cached timestamp
    expect(timestamps[0]).toBe(timestamps[1])
    expect(timestamps[1]).toBe(timestamps[2])
  })
})

describe('GET /api/fx/rates — Error handling', () => {
  it('returns 404 for unsupported sub-routes', async () => {
    const app = await buildApp()
    await request(app).get('/api/fx/convert').expect(404)
  })

  it('returns 404 for POST to rates endpoint', async () => {
    const app = await buildApp()
    await request(app).post('/api/fx/rates').expect(404)
  })
})
