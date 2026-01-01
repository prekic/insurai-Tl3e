/**
 * Rate Limiter Tests
 * Tests for token bucket algorithm with sliding window rate limiting
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  rateLimiter,
  checkRateLimit,
  consumeRateLimit,
  formatRetryAfter,
  getUserQuotas,
} from './rate-limiter'

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage })

describe('Rate Limiter', () => {
  beforeEach(() => {
    mockLocalStorage.clear()
    rateLimiter.resetAll()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('check', () => {
    it('should allow requests within limit', () => {
      const result = rateLimiter.check('policy_upload', 'user-123')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeGreaterThan(0)
    })

    it('should return remaining count correctly', () => {
      const result = rateLimiter.check('policy_upload', 'user-123')
      const config = rateLimiter.getConfig('policy_upload')

      expect(result.remaining).toBe(config.maxRequests)
    })

    it('should return resetAt timestamp in the future', () => {
      const result = rateLimiter.check('policy_upload', 'user-123')

      expect(result.resetAt).toBeGreaterThan(Date.now())
    })

    it('should not modify state when checking', () => {
      rateLimiter.check('policy_upload', 'user-123')
      rateLimiter.check('policy_upload', 'user-123')
      rateLimiter.check('policy_upload', 'user-123')

      const usage = rateLimiter.getUsage('policy_upload', 'user-123')
      expect(usage.used).toBe(0)
    })
  })

  describe('consume', () => {
    it('should consume a request', () => {
      const result = rateLimiter.consume('policy_upload', 'user-123')

      expect(result.allowed).toBe(true)
      expect(result.count).toBe(1)
    })

    it('should track multiple consumptions', () => {
      rateLimiter.consume('policy_upload', 'user-123')
      rateLimiter.consume('policy_upload', 'user-123')
      const result = rateLimiter.consume('policy_upload', 'user-123')

      expect(result.count).toBe(3)
    })

    it('should deny requests when limit exceeded', () => {
      const config = rateLimiter.getConfig('auth_password_reset')

      // Consume all allowed requests
      for (let i = 0; i < config.maxRequests; i++) {
        rateLimiter.consume('auth_password_reset', 'user-123')
      }

      // Next request should be denied
      const result = rateLimiter.consume('auth_password_reset', 'user-123')

      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeDefined()
    })

    it('should return retryAfter when denied', () => {
      const config = rateLimiter.getConfig('auth_password_reset')

      for (let i = 0; i < config.maxRequests + 1; i++) {
        rateLimiter.consume('auth_password_reset', 'user-123')
      }

      const result = rateLimiter.consume('auth_password_reset', 'user-123')

      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should track costs for operations with costPerRequest', () => {
      rateLimiter.consume('ai_extraction', 'user-123')
      rateLimiter.consume('ai_extraction', 'user-123')

      const usage = rateLimiter.getUsage('ai_extraction', 'user-123')

      expect(usage.cost).toBeGreaterThan(0)
    })

    it('should support variable cost per request', () => {
      rateLimiter.consume('policy_upload', 'user-123', 3)

      const usage = rateLimiter.getUsage('policy_upload', 'user-123')
      expect(usage.used).toBe(3)
    })
  })

  describe('getUsage', () => {
    it('should return zero usage for new identifier', () => {
      const usage = rateLimiter.getUsage('policy_upload', 'new-user')

      expect(usage.used).toBe(0)
      expect(usage.limit).toBeGreaterThan(0)
    })

    it('should return correct usage after consumption', () => {
      rateLimiter.consume('policy_upload', 'user-123')
      rateLimiter.consume('policy_upload', 'user-123')

      const usage = rateLimiter.getUsage('policy_upload', 'user-123')

      expect(usage.used).toBe(2)
    })

    it('should include resetAt time', () => {
      const usage = rateLimiter.getUsage('policy_upload', 'user-123')

      expect(usage.resetAt).toBeGreaterThan(Date.now())
    })
  })

  describe('reset', () => {
    it('should reset rate limit for specific operation and identifier', () => {
      rateLimiter.consume('policy_upload', 'user-123')
      rateLimiter.consume('policy_upload', 'user-123')

      rateLimiter.reset('policy_upload', 'user-123')

      const usage = rateLimiter.getUsage('policy_upload', 'user-123')
      expect(usage.used).toBe(0)
    })

    it('should not affect other identifiers', () => {
      rateLimiter.consume('policy_upload', 'user-123')
      rateLimiter.consume('policy_upload', 'user-456')

      rateLimiter.reset('policy_upload', 'user-123')

      const usage123 = rateLimiter.getUsage('policy_upload', 'user-123')
      const usage456 = rateLimiter.getUsage('policy_upload', 'user-456')

      expect(usage123.used).toBe(0)
      expect(usage456.used).toBe(1)
    })

    it('should not affect other operations', () => {
      rateLimiter.consume('policy_upload', 'user-123')
      rateLimiter.consume('ai_extraction', 'user-123')

      rateLimiter.reset('policy_upload', 'user-123')

      const uploadUsage = rateLimiter.getUsage('policy_upload', 'user-123')
      const aiUsage = rateLimiter.getUsage('ai_extraction', 'user-123')

      expect(uploadUsage.used).toBe(0)
      expect(aiUsage.used).toBe(1)
    })
  })

  describe('resetAll', () => {
    it('should reset all rate limits', () => {
      rateLimiter.consume('policy_upload', 'user-123')
      rateLimiter.consume('ai_extraction', 'user-456')
      rateLimiter.consume('auth_signin', 'user-789')

      rateLimiter.resetAll()

      expect(rateLimiter.getUsage('policy_upload', 'user-123').used).toBe(0)
      expect(rateLimiter.getUsage('ai_extraction', 'user-456').used).toBe(0)
      expect(rateLimiter.getUsage('auth_signin', 'user-789').used).toBe(0)
    })
  })

  describe('setConfig', () => {
    it('should update configuration for an operation', () => {
      const originalConfig = rateLimiter.getConfig('policy_upload')

      rateLimiter.setConfig('policy_upload', { maxRequests: 100 })

      const newConfig = rateLimiter.getConfig('policy_upload')

      expect(newConfig.maxRequests).toBe(100)
      expect(newConfig.windowMs).toBe(originalConfig.windowMs)
    })

    it('should merge partial configuration', () => {
      rateLimiter.setConfig('policy_upload', { errorMessage: 'Custom error' })

      const config = rateLimiter.getConfig('policy_upload')

      expect(config.errorMessage).toBe('Custom error')
      expect(config.maxRequests).toBeDefined()
    })
  })

  describe('onViolation', () => {
    it('should notify listeners on violation', () => {
      const listener = vi.fn()
      const cleanup = rateLimiter.onViolation(listener)

      const config = rateLimiter.getConfig('auth_password_reset')

      // Exceed limit
      for (let i = 0; i < config.maxRequests + 1; i++) {
        rateLimiter.consume('auth_password_reset', 'user-123')
      }

      expect(listener).toHaveBeenCalled()

      cleanup()
    })

    it('should remove listener on cleanup', () => {
      const listener = vi.fn()
      const cleanup = rateLimiter.onViolation(listener)

      cleanup()
      rateLimiter.resetAll()

      const config = rateLimiter.getConfig('auth_password_reset')
      for (let i = 0; i < config.maxRequests + 1; i++) {
        rateLimiter.consume('auth_password_reset', 'user-123')
      }

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should return count of cleaned entries', () => {
      // Add some entries
      rateLimiter.consume('policy_upload', 'user-123')

      // Nothing to clean immediately
      const cleaned = rateLimiter.cleanup()

      expect(typeof cleaned).toBe('number')
    })
  })

  describe('getStates', () => {
    it('should return current states', () => {
      rateLimiter.consume('policy_upload', 'user-123')

      const states = rateLimiter.getStates()

      expect(states).toBeInstanceOf(Map)
      expect(states.size).toBeGreaterThan(0)
    })

    it('should return a copy of states', () => {
      rateLimiter.consume('policy_upload', 'user-123')

      const states = rateLimiter.getStates()
      states.clear()

      const statesAgain = rateLimiter.getStates()
      expect(statesAgain.size).toBeGreaterThan(0)
    })
  })

  describe('Different Operation Types', () => {
    it('should handle AI operations with strict limits', () => {
      const config = rateLimiter.getConfig('ai_extraction')

      expect(config.maxRequests).toBeLessThan(100)
      expect(config.costPerRequest).toBeGreaterThan(0)
    })

    it('should handle auth operations with stricter limits', () => {
      const signinConfig = rateLimiter.getConfig('auth_signin')
      const uploadConfig = rateLimiter.getConfig('policy_upload')

      expect(signinConfig.maxRequests).toBeLessThan(uploadConfig.maxRequests)
    })

    it('should handle export operations', () => {
      const pdfConfig = rateLimiter.getConfig('export_pdf')

      expect(pdfConfig.maxRequests).toBeGreaterThan(0)
      expect(pdfConfig.windowMs).toBeGreaterThan(0)
    })

    it('should use ip scope for auth operations', () => {
      const signinConfig = rateLimiter.getConfig('auth_signin')
      const signupConfig = rateLimiter.getConfig('auth_signup')

      expect(signinConfig.scope).toBe('ip')
      expect(signupConfig.scope).toBe('ip')
    })
  })
})

describe('checkRateLimit helper', () => {
  beforeEach(() => {
    rateLimiter.resetAll()
  })

  it('should check rate limit without consuming', () => {
    const result1 = checkRateLimit('policy_upload', 'user-123')
    const result2 = checkRateLimit('policy_upload', 'user-123')

    expect(result1.remaining).toBe(result2.remaining)
  })
})

describe('consumeRateLimit helper', () => {
  beforeEach(() => {
    rateLimiter.resetAll()
  })

  it('should consume and return result', async () => {
    const result = await consumeRateLimit('policy_upload', 'user-123')

    expect(result.allowed).toBe(true)
    expect(result.count).toBe(1)
  })

  it('should throw error when limit exceeded', async () => {
    const config = rateLimiter.getConfig('auth_password_reset')

    // Consume all allowed
    for (let i = 0; i < config.maxRequests; i++) {
      await consumeRateLimit('auth_password_reset', 'user-123')
    }

    // Should throw
    await expect(consumeRateLimit('auth_password_reset', 'user-123'))
      .rejects
      .toThrow()
  })

  it('should include retryAfter in error', async () => {
    const config = rateLimiter.getConfig('auth_password_reset')

    for (let i = 0; i < config.maxRequests; i++) {
      await consumeRateLimit('auth_password_reset', 'user-123')
    }

    try {
      await consumeRateLimit('auth_password_reset', 'user-123')
    } catch (error) {
      expect((error as Error & { retryAfter: number }).retryAfter).toBeGreaterThan(0)
      expect((error as Error & { code: string }).code).toBe('RATE_LIMIT_EXCEEDED')
    }
  })
})

describe('formatRetryAfter', () => {
  it('should format seconds', () => {
    const result = formatRetryAfter(45000)
    expect(result).toContain('45')
    expect(result).toContain('saniye')
  })

  it('should format minutes', () => {
    const result = formatRetryAfter(5 * 60 * 1000)
    expect(result).toContain('5')
    expect(result).toContain('dakika')
  })

  it('should format hours', () => {
    const result = formatRetryAfter(2 * 60 * 60 * 1000)
    expect(result).toContain('2')
    expect(result).toContain('saat')
  })

  it('should handle small values', () => {
    const result = formatRetryAfter(500)
    expect(result).toContain('saniye')
  })
})

describe('getUserQuotas', () => {
  beforeEach(() => {
    rateLimiter.resetAll()
  })

  it('should return quotas for all operations', () => {
    const quotas = getUserQuotas('user-123')

    expect(quotas.ai_extraction).toBeDefined()
    expect(quotas.policy_upload).toBeDefined()
    expect(quotas.auth_signin).toBeDefined()
  })

  it('should include usage stats', () => {
    rateLimiter.consume('policy_upload', 'user-123')
    rateLimiter.consume('policy_upload', 'user-123')

    const quotas = getUserQuotas('user-123')

    expect(quotas.policy_upload.used).toBe(2)
    expect(quotas.policy_upload.remaining).toBe(quotas.policy_upload.limit - 2)
  })

  it('should include resetAt as ISO string', () => {
    const quotas = getUserQuotas('user-123')

    expect(quotas.policy_upload.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('Sliding Window Behavior', () => {
  beforeEach(() => {
    rateLimiter.resetAll()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should reset window after windowMs expires', () => {
    const config = rateLimiter.getConfig('policy_upload')

    // Consume some requests
    rateLimiter.consume('policy_upload', 'user-123')
    rateLimiter.consume('policy_upload', 'user-123')

    expect(rateLimiter.getUsage('policy_upload', 'user-123').used).toBe(2)

    // Advance time past window
    vi.advanceTimersByTime(config.windowMs + 1000)

    // Should reset
    const usage = rateLimiter.getUsage('policy_upload', 'user-123')
    expect(usage.used).toBe(0)
  })

  it('should create new window after expiry', () => {
    const config = rateLimiter.getConfig('policy_upload')

    // Fill up the limit
    for (let i = 0; i < config.maxRequests; i++) {
      rateLimiter.consume('policy_upload', 'user-123')
    }

    // Should be denied
    expect(rateLimiter.check('policy_upload', 'user-123').allowed).toBe(false)

    // Advance time
    vi.advanceTimersByTime(config.windowMs + 1000)

    // Should be allowed again
    expect(rateLimiter.check('policy_upload', 'user-123').allowed).toBe(true)
  })
})
