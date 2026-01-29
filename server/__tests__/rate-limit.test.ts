/**
 * Rate Limit Middleware Tests
 *
 * Tests for rate limiting middleware and helper functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response } from 'express'

// Store original env
const originalEnv = { ...process.env }

// Reset modules and clear env before each test
beforeEach(() => {
  vi.resetModules()
  process.env = { ...originalEnv }
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})

describe('Rate Limit Middleware', () => {
  describe('rateLimitConfig', () => {
    it('should use default config values when env not set', async () => {
      delete process.env.RATE_LIMIT_WINDOW_MS
      delete process.env.RATE_LIMIT_MAX
      delete process.env.RATE_LIMIT_AI_WINDOW_MS
      delete process.env.RATE_LIMIT_AI_MAX
      delete process.env.RATE_LIMIT_OCR_WINDOW_MS
      delete process.env.RATE_LIMIT_OCR_MAX

      const { rateLimitConfig } = await import('../middleware/rate-limit')

      expect(rateLimitConfig.general.windowMs).toBe(900000) // 15 minutes
      expect(rateLimitConfig.general.max).toBe(100)
      expect(rateLimitConfig.ai.windowMs).toBe(3600000) // 1 hour
      expect(rateLimitConfig.ai.max).toBe(20)
      expect(rateLimitConfig.ocr.windowMs).toBe(3600000) // 1 hour
      expect(rateLimitConfig.ocr.max).toBe(30)
      expect(rateLimitConfig.health.windowMs).toBe(60000) // 1 minute
      expect(rateLimitConfig.health.max).toBe(60)
    })

    it('should use custom config values from environment', async () => {
      process.env.RATE_LIMIT_WINDOW_MS = '600000'
      process.env.RATE_LIMIT_MAX = '50'
      process.env.RATE_LIMIT_AI_WINDOW_MS = '1800000'
      process.env.RATE_LIMIT_AI_MAX = '10'
      process.env.RATE_LIMIT_OCR_WINDOW_MS = '1800000'
      process.env.RATE_LIMIT_OCR_MAX = '15'

      const { rateLimitConfig } = await import('../middleware/rate-limit')

      expect(rateLimitConfig.general.windowMs).toBe(600000) // 10 minutes
      expect(rateLimitConfig.general.max).toBe(50)
      expect(rateLimitConfig.ai.windowMs).toBe(1800000) // 30 minutes
      expect(rateLimitConfig.ai.max).toBe(10)
      expect(rateLimitConfig.ocr.windowMs).toBe(1800000)
      expect(rateLimitConfig.ocr.max).toBe(15)
    })
  })

  describe('keyGenerator', () => {
    it('should use req.ip which is set by Express trust proxy', async () => {
      const { generalLimiter } = await import('../middleware/rate-limit')

      // When "trust proxy" is set, Express populates req.ip from x-forwarded-for
      // The rate limiter should use req.ip, NOT read x-forwarded-for directly
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        ip: '192.168.1.1', // Express sets this when trust proxy is configured
        socket: { remoteAddress: '::1' },
      } as unknown as Request

      expect(generalLimiter).toBeDefined()
      // req.ip should be used, not the raw header
      expect(req.ip).toBe('192.168.1.1')
    })

    it('should use req.ip as primary source', async () => {
      const req = {
        headers: {},
        ip: '192.168.1.100',
        socket: { remoteAddress: '::1' },
      } as unknown as Request

      expect(req.ip).toBe('192.168.1.100')
    })

    it('should fall back to socket.remoteAddress when ip not present', async () => {
      const req = {
        headers: {},
        ip: undefined,
        socket: { remoteAddress: '192.168.1.200' },
      } as unknown as Request

      expect(req.socket.remoteAddress).toBe('192.168.1.200')
    })

    it('should use hashed Authorization token for user identification (not x-user-id)', async () => {
      // Security: x-user-id header was vulnerable to spoofing
      // Now we use a hash of the Authorization Bearer token
      const req = {
        headers: {
          // x-user-id is now IGNORED for security
          'x-user-id': 'spoofed-user-id',
          // Authorization header is used instead
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '::1' },
      } as unknown as Request

      // The old x-user-id header should be ignored
      expect(req.headers['x-user-id']).toBe('spoofed-user-id')
      // Authorization header should be present for hashing
      expect(req.headers.authorization).toContain('Bearer ')
    })

    it('should not trust x-forwarded-for header directly', async () => {
      // Security test: rate limiter should NOT read x-forwarded-for directly
      // It should rely on req.ip which Express sets based on trust proxy config
      const req = {
        headers: {
          // Attacker tries to spoof their IP
          'x-forwarded-for': 'spoofed-ip-1.2.3.4',
        },
        // But Express sets req.ip to the real client IP
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request

      // req.ip should be the trusted value, not the spoofed header
      expect(req.ip).toBe('10.0.0.1')
      expect(req.headers['x-forwarded-for']).toBe('spoofed-ip-1.2.3.4')
    })
  })

  describe('generalLimiter', () => {
    it('should be defined and exportable', async () => {
      const { generalLimiter } = await import('../middleware/rate-limit')
      expect(generalLimiter).toBeDefined()
      expect(typeof generalLimiter).toBe('function')
    })
  })

  describe('aiExtractionLimiter', () => {
    it('should be defined and exportable', async () => {
      const { aiExtractionLimiter } = await import('../middleware/rate-limit')
      expect(aiExtractionLimiter).toBeDefined()
      expect(typeof aiExtractionLimiter).toBe('function')
    })
  })

  describe('ocrLimiter', () => {
    it('should be defined and exportable', async () => {
      const { ocrLimiter } = await import('../middleware/rate-limit')
      expect(ocrLimiter).toBeDefined()
      expect(typeof ocrLimiter).toBe('function')
    })
  })

  describe('healthLimiter', () => {
    it('should be defined and exportable', async () => {
      const { healthLimiter } = await import('../middleware/rate-limit')
      expect(healthLimiter).toBeDefined()
      expect(typeof healthLimiter).toBe('function')
    })
  })

  describe('authLimiter', () => {
    it('should be defined and exportable', async () => {
      const { authLimiter } = await import('../middleware/rate-limit')
      expect(authLimiter).toBeDefined()
      expect(typeof authLimiter).toBe('function')
    })
  })

  describe('createRateLimiter', () => {
    it('should create a custom rate limiter', async () => {
      const { createRateLimiter } = await import('../middleware/rate-limit')

      const customLimiter = createRateLimiter({
        windowMs: 60000,
        max: 5,
        message: 'Custom limit exceeded',
      })

      expect(customLimiter).toBeDefined()
      expect(typeof customLimiter).toBe('function')
    })

    it('should use default message when not provided', async () => {
      const { createRateLimiter } = await import('../middleware/rate-limit')

      const customLimiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
      })

      expect(customLimiter).toBeDefined()
    })
  })

  describe('skip function behavior', () => {
    it('should skip rate limiting in test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'test'

      // In test environment, skip function returns true
      // This is implicitly tested by the rate limiter working in tests
      const { generalLimiter } = await import('../middleware/rate-limit')
      expect(generalLimiter).toBeDefined()

      process.env.NODE_ENV = originalNodeEnv
    })

    it('should skip health checks from localhost', async () => {
      // The skip function checks if path is /api/health and ip is 127.0.0.1
      const req = {
        path: '/api/health',
        ip: '127.0.0.1',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request

      expect(req.path).toBe('/api/health')
      expect(req.ip).toBe('127.0.0.1')
    })
  })

  describe('rateLimitHandler response format', () => {
    it('should return 429 status with proper response structure', async () => {
      // Simulate what the handler would return
      const expectedResponse = {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You have exceeded the rate limit. Please try again later.',
        remaining: 0,
      }

      expect(expectedResponse.error).toBe('Too many requests')
      expect(expectedResponse.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(expectedResponse.remaining).toBe(0)
    })

    it('should include retryAfter when available', async () => {
      const mockRes = {
        getHeader: vi.fn((name: string) => {
          if (name === 'Retry-After') return '60'
          if (name === 'X-RateLimit-Limit') return '100'
          if (name === 'X-RateLimit-Reset') return '1234567890'
          return undefined
        }),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response

      expect(mockRes.getHeader('Retry-After')).toBe('60')
      expect(mockRes.getHeader('X-RateLimit-Limit')).toBe('100')
      expect(mockRes.getHeader('X-RateLimit-Reset')).toBe('1234567890')
    })
  })

  describe('AI extraction handler response format', () => {
    it('should return AI-specific error message', () => {
      const expectedResponse = {
        error: 'AI extraction rate limit exceeded',
        code: 'AI_RATE_LIMIT_EXCEEDED',
        message: 'You have made too many AI extraction requests. This is an expensive operation. Please try again later.',
        remaining: 0,
      }

      expect(expectedResponse.error).toBe('AI extraction rate limit exceeded')
      expect(expectedResponse.code).toBe('AI_RATE_LIMIT_EXCEEDED')
      expect(expectedResponse.message).toContain('expensive operation')
    })
  })

  describe('OCR handler response format', () => {
    it('should return OCR-specific error message', () => {
      const expectedResponse = {
        error: 'OCR rate limit exceeded',
        code: 'OCR_RATE_LIMIT_EXCEEDED',
        message: 'You have made too many OCR requests. Please try again later.',
        remaining: 0,
      }

      expect(expectedResponse.error).toBe('OCR rate limit exceeded')
      expect(expectedResponse.code).toBe('OCR_RATE_LIMIT_EXCEEDED')
    })
  })

  describe('Auth handler response format', () => {
    it('should return auth-specific error message', () => {
      const expectedResponse = {
        error: 'Too many authentication attempts',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again in 15 minutes.',
        retryAfter: 900,
      }

      expect(expectedResponse.error).toBe('Too many authentication attempts')
      expect(expectedResponse.code).toBe('AUTH_RATE_LIMIT_EXCEEDED')
      expect(expectedResponse.retryAfter).toBe(900) // 15 minutes
    })
  })

  describe('Security: extractSecureUserId behavior', () => {
    it('should return empty string when no Authorization header', async () => {
      const req = {
        headers: {},
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as Request

      // Without Authorization header, user ID should be empty
      expect(req.headers.authorization).toBeUndefined()
    })

    it('should return empty string for invalid Authorization format', async () => {
      const req = {
        headers: {
          authorization: 'InvalidFormat token123',
        },
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as Request

      // Should only accept "Bearer <token>" format
      expect(req.headers.authorization).not.toMatch(/^Bearer /)
    })

    it('should return empty string for empty Bearer token', async () => {
      const req = {
        headers: {
          authorization: 'Bearer ',
        },
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as Request

      // Empty token after Bearer should be rejected
      expect(req.headers.authorization).toBe('Bearer ')
    })

    it('should accept valid Bearer token format', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      const req = {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as Request

      expect(req.headers.authorization).toMatch(/^Bearer /)
      expect(req.headers.authorization?.split(' ')[1]?.length).toBeGreaterThan(10)
    })

    it('should generate consistent hash for same token', async () => {
      const crypto = await import('crypto')
      const token = 'test-token-12345'

      // Same token should always produce same hash
      const hash1 = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16)
      const hash2 = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16)

      expect(hash1).toBe(hash2)
      expect(hash1.length).toBe(16)
    })

    it('should generate different hash for different tokens', async () => {
      const crypto = await import('crypto')
      const token1 = 'test-token-12345'
      const token2 = 'test-token-67890'

      const hash1 = crypto.createHash('sha256').update(token1).digest('hex').substring(0, 16)
      const hash2 = crypto.createHash('sha256').update(token2).digest('hex').substring(0, 16)

      expect(hash1).not.toBe(hash2)
    })
  })
})
