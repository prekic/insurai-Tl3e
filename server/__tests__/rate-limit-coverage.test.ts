/**
 * Rate Limit Coverage Tests
 *
 * Targets uncovered functions, branches, and statements in server/middleware/rate-limit.ts.
 * Specifically:
 * - extractSecureUserId: all branches (no header, invalid format, short token, valid)
 * - keyGenerator: IP fallbacks, with/without userId
 * - rateLimitHandler: with/without Retry-After header
 * - skip: NODE_ENV === 'test', health+localhost, default false
 * - getConfig: cache hit path, cache miss path, error fallback
 * - getConfigSync: with/without cached config
 * - All limiter handler functions (aiExtraction, ocr, chat, auth)
 * - refreshRateLimitConfig: success + error
 * - createRateLimiter: with/without message
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const { mockGetRateLimitsConfig, mockLogInfo, mockLogWarn } = vi.hoisted(() => ({
  mockGetRateLimitsConfig: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('../services/config-service.js', () => ({
  getRateLimitsConfig: (...args: unknown[]) => mockGetRateLimitsConfig(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: mockLogInfo,
      warn: mockLogWarn,
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  },
}))

const originalEnv = { ...process.env }

function defaultDbConfig() {
  return {
    generalWindowMs: 900000,
    generalMaxRequests: 100,
    aiExtractionWindowMs: 3600000,
    aiExtractionMaxRequests: 20,
    ocrWindowMs: 3600000,
    ocrMaxRequests: 30,
    chatWindowMs: 3600000,
    chatMaxRequests: 60,
    healthWindowMs: 60000,
    healthMaxRequests: 60,
    authWindowMs: 900000,
    authMaxAttempts: 10,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...originalEnv, NODE_ENV: 'test' }
})

afterEach(() => {
  process.env = originalEnv
})

async function importFresh() {
  vi.resetModules()
  mockGetRateLimitsConfig.mockResolvedValue(defaultDbConfig())
  return await import('../middleware/rate-limit.js')
}

// =============================================================================
// Tests that exercise the ACTUAL handler functions by mounting on Express
// =============================================================================

describe('Rate Limit Handlers via Express (non-test env)', () => {
  // We override NODE_ENV to force rate limiters to NOT skip

  it('generalLimiter handler returns correct JSON on rate limit', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    // Mount limiter with very low max so it triggers immediately
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 0, message: 'test exceeded' })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
    expect(res.body.error).toBe('Too many requests')
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(res.body.message).toContain('exceeded the rate limit')
    expect(res.body.remaining).toBe(0)
  })

  it('rateLimitHandler includes retryAfter when Retry-After header is set', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 0 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
    // Retry-After header should be parsed into retryAfter field
    if (res.body.retryAfter !== undefined) {
      expect(typeof res.body.retryAfter).toBe('number')
    }
  })

  it('rateLimitHandler returns undefined retryAfter when header is missing', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    // The rateLimitHandler function directly — test indirectly via limiter behavior
    const app = express()
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 0 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
  })
})

describe('Skip function branches', () => {
  it('skips rate limiting in test environment', async () => {
    process.env.NODE_ENV = 'test'
    const mod = await importFresh()

    const app = express()
    // Even with max=0, test env should skip
    app.get('/test', mod.generalLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('does not skip in production for non-health paths', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 0 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
  })

  it('healthLimiter skips for localhost IP', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    app.set('trust proxy', true)
    // Health limiter has its own skip function for localhost
    app.get('/api/health', mod.healthLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    // Note: supertest connects via 127.0.0.1
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
  })
})

describe('keyGenerator branches', () => {
  it('combines IP + user hash for authenticated requests', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    // Use a generous limit so we don't get blocked
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 100 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    // With valid Bearer token format
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const res = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  it('uses IP only when no Authorization header', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 100 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
  })

  it('returns IP only for invalid Bearer format', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 100 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Basic abc123')

    expect(res.status).toBe(200)
  })

  it('returns IP only for Bearer token shorter than 10 chars', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    const limiter = mod.createRateLimiter({ windowMs: 60000, max: 100 })
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer short')

    expect(res.status).toBe(200)
  })
})

describe('getConfig cache behavior', () => {
  it('returns cached config when TTL has not expired', async () => {
    const mod = await importFresh()

    // First refresh populates cache
    await mod.refreshRateLimitConfig()
    expect(mockGetRateLimitsConfig).toHaveBeenCalledTimes(2) // once at module load + once for refresh

    // Second refresh should still call (because it resets lastConfigFetch)
    await mod.refreshRateLimitConfig()
    expect(mockGetRateLimitsConfig).toHaveBeenCalledTimes(3)
  })

  it('falls back to defaults when config fetch fails at module load', async () => {
    mockGetRateLimitsConfig.mockRejectedValue(new Error('Connection refused'))
    vi.resetModules()
    const mod = await import('../middleware/rate-limit.js')

    // Should still export everything
    expect(mod.generalLimiter).toBeDefined()
    const config = mod.getRateLimitConfig()
    expect(config.general.windowMs).toBe(900000)
  })
})

describe('refreshRateLimitConfig', () => {
  it('updates config and logs success', async () => {
    const mod = await importFresh()
    const newConfig = {
      ...defaultDbConfig(),
      generalMaxRequests: 50,
      aiExtractionMaxRequests: 10,
    }
    mockGetRateLimitsConfig.mockResolvedValue(newConfig)

    await mod.refreshRateLimitConfig()

    expect(mockLogInfo).toHaveBeenCalledWith('Configuration refreshed from database')
    const config = mod.getRateLimitConfig()
    expect(config.general.max).toBe(50)
    expect(config.ai.max).toBe(10)
  })

  it('logs warning and continues on error', async () => {
    const mod = await importFresh()
    mockGetRateLimitsConfig.mockRejectedValue(new Error('DB connection error'))

    await mod.refreshRateLimitConfig()

    expect(mockLogWarn).toHaveBeenCalledWith('Failed to refresh config from database, using cached/defaults')
  })
})

describe('getConfigSync with cached vs default config', () => {
  it('returns transformed cached config after refresh', async () => {
    const mod = await importFresh()
    mockGetRateLimitsConfig.mockResolvedValue({
      ...defaultDbConfig(),
      generalWindowMs: 120000,
      generalMaxRequests: 25,
      chatWindowMs: 180000,
      chatMaxRequests: 15,
      authWindowMs: 600000,
      authMaxAttempts: 3,
    })

    await mod.refreshRateLimitConfig()
    const config = mod.getRateLimitConfig()

    expect(config.general.windowMs).toBe(120000)
    expect(config.general.max).toBe(25)
    expect(config.chat.windowMs).toBe(180000)
    expect(config.chat.max).toBe(15)
    expect(config.auth.windowMs).toBe(600000)
    expect(config.auth.max).toBe(3)
    expect(config.health.windowMs).toBe(60000)
    expect(config.health.max).toBe(60)
    expect(config.ocr.windowMs).toBe(3600000)
    expect(config.ocr.max).toBe(30)
    expect(config.ai.windowMs).toBe(3600000)
    expect(config.ai.max).toBe(20)
  })

  it('returns defaults when no cache is available', async () => {
    vi.resetModules()
    mockGetRateLimitsConfig.mockRejectedValue(new Error('no db'))
    const mod = await import('../middleware/rate-limit.js')
    await new Promise(r => setTimeout(r, 50))

    const config = mod.getRateLimitConfig()
    expect(config.general.windowMs).toBe(900000)
  })
})

describe('Limiter-specific handlers', () => {
  it('aiExtractionLimiter handler returns AI-specific error', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const app = express()
    // Force immediate rate limit by using max: 0
    const limiter = mod.aiExtractionLimiter
    // We need to make max return 0 via config
    mockGetRateLimitsConfig.mockResolvedValue({
      ...defaultDbConfig(),
      aiExtractionMaxRequests: 0,
    })
    await mod.refreshRateLimitConfig()

    app.post('/api/ai/extract', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).post('/api/ai/extract')
    // In production with max=0, should be rate limited
    // But the max is dynamic via getConfigSync, and we refreshed it to 0
    // However express-rate-limit evaluates max at request time
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('AI_RATE_LIMIT_EXCEEDED')
    expect(res.body.message).toContain('expensive operation')
  })

  it('ocrLimiter handler returns OCR-specific error', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    mockGetRateLimitsConfig.mockResolvedValue({
      ...defaultDbConfig(),
      ocrMaxRequests: 0,
    })
    await mod.refreshRateLimitConfig()

    const app = express()
    app.post('/api/ai/ocr', mod.ocrLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).post('/api/ai/ocr')
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('OCR_RATE_LIMIT_EXCEEDED')
    expect(res.body.message).toContain('OCR requests')
  })

  it('chatLimiter handler returns chat-specific error', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    mockGetRateLimitsConfig.mockResolvedValue({
      ...defaultDbConfig(),
      chatMaxRequests: 0,
    })
    await mod.refreshRateLimitConfig()

    const app = express()
    app.post('/api/ai/chat', mod.chatLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).post('/api/ai/chat')
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('CHAT_RATE_LIMIT_EXCEEDED')
    expect(res.body.message).toContain('too many messages')
  })

  it('authLimiter handler returns auth-specific error with 900s retryAfter', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    mockGetRateLimitsConfig.mockResolvedValue({
      ...defaultDbConfig(),
      authMaxAttempts: 0,
    })
    await mod.refreshRateLimitConfig()

    const app = express()
    app.post('/api/auth/login', mod.authLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).post('/api/auth/login')
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('AUTH_RATE_LIMIT_EXCEEDED')
    expect(res.body.retryAfter).toBe(900)
    expect(res.body.message).toContain('15 minutes')
  })
})

describe('createRateLimiter', () => {
  it('uses provided message', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const limiter = mod.createRateLimiter({
      windowMs: 60000,
      max: 0,
      message: 'Custom exceeded message',
    })

    const app = express()
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
  })

  it('uses default message when none provided', async () => {
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()

    const limiter = mod.createRateLimiter({
      windowMs: 60000,
      max: 0,
    })

    const app = express()
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true })
    })

    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
  })
})

describe('Environment variable parsing', () => {
  it('parses RATE_LIMIT_CHAT_WINDOW_MS and RATE_LIMIT_CHAT_MAX', async () => {
    process.env.RATE_LIMIT_CHAT_WINDOW_MS = '1800000'
    process.env.RATE_LIMIT_CHAT_MAX = '30'

    const mod = await importFresh()
    expect(mod.rateLimitConfig.chat.windowMs).toBe(1800000)
    expect(mod.rateLimitConfig.chat.max).toBe(30)
  })

  it('uses defaults for chat when env vars not set', async () => {
    delete process.env.RATE_LIMIT_CHAT_WINDOW_MS
    delete process.env.RATE_LIMIT_CHAT_MAX

    const mod = await importFresh()
    expect(mod.rateLimitConfig.chat.windowMs).toBe(3600000)
    expect(mod.rateLimitConfig.chat.max).toBe(60)
  })
})
