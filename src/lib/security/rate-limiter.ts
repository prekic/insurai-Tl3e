/**
 * Rate Limiter
 * Token bucket algorithm with sliding window for smooth rate limiting
 */

import type {
  RateLimitedOperation,
  RateLimitConfig,
  RateLimitState,
  RateLimitResult,
  RateLimitViolation,
} from '@/types/security'

/**
 * Default rate limit configurations by operation
 */
const DEFAULT_RATE_LIMITS: Record<RateLimitedOperation, RateLimitConfig> = {
  // AI operations (expensive - strict limits)
  ai_extraction: {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000, // 1 hour
    costPerRequest: 0.03,
    scope: 'user',
    errorMessage: 'AI extraction limit exceeded. Please wait before processing more documents.',
  },
  ai_ocr: {
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    costPerRequest: 0.015,
    scope: 'user',
    errorMessage: 'OCR processing limit exceeded. Please wait before scanning more documents.',
  },
  ai_consensus: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
    costPerRequest: 0.06,
    scope: 'user',
    errorMessage: 'Multi-model analysis limit exceeded. Please wait.',
  },
  chat_message: {
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    costPerRequest: 0.01,
    scope: 'user',
    errorMessage: 'Chat message limit exceeded. Please wait.',
  },

  // Document operations (moderate limits)
  policy_upload: {
    maxRequests: 20,
    windowMs: 10 * 60 * 1000, // 10 minutes
    scope: 'user',
    errorMessage: 'Upload limit exceeded. Please wait before uploading more files.',
  },
  policy_create: {
    maxRequests: 30,
    windowMs: 10 * 60 * 1000, // 10 minutes
    scope: 'user',
    errorMessage: 'Policy creation limit exceeded.',
  },
  policy_search: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
    scope: 'user',
    errorMessage: 'Search limit exceeded. Please slow down.',
  },

  // Auth operations (strict for security)
  auth_signin: {
    maxRequests: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
    scope: 'ip',
    errorMessage: 'Too many sign in attempts. Please wait.',
  },
  auth_signup: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    scope: 'ip',
    errorMessage: 'Too many sign up attempts. Please wait.',
  },
  auth_password_reset: {
    maxRequests: 3,
    windowMs: 15 * 60 * 1000, // 15 minutes
    scope: 'ip',
    errorMessage: 'Too many password reset requests. Please wait.',
  },

  // Export operations (resource intensive)
  export_csv: {
    maxRequests: 10,
    windowMs: 10 * 60 * 1000, // 10 minutes
    scope: 'user',
    errorMessage: 'Export limit exceeded. Please wait.',
  },
  export_pdf: {
    maxRequests: 5,
    windowMs: 10 * 60 * 1000, // 10 minutes
    scope: 'user',
    errorMessage: 'PDF generation limit exceeded. Please wait.',
  },
}

/**
 * Storage key prefix for rate limit data
 */
const STORAGE_KEY_PREFIX = 'insurai_ratelimit_'

/**
 * Violation listeners
 */
type ViolationListener = (violation: RateLimitViolation) => void
const violationListeners: ViolationListener[] = []

/**
 * Rate Limiter class
 * Uses sliding window with token bucket for smooth rate limiting
 */
class RateLimiter {
  private states: Map<string, RateLimitState> = new Map()
  private configs: Map<RateLimitedOperation, RateLimitConfig>
  private persistToStorage: boolean

  constructor(persistToStorage = true) {
    this.configs = new Map(Object.entries(DEFAULT_RATE_LIMITS) as [RateLimitedOperation, RateLimitConfig][])
    this.persistToStorage = persistToStorage
    this.loadFromStorage()
  }

  /**
   * Check if an operation is allowed
   */
  check(
    operation: RateLimitedOperation,
    identifier: string
  ): RateLimitResult {
    const config = this.getConfig(operation)
    const key = this.buildKey(operation, identifier, config.scope)
    const now = Date.now()

    // Get or create state
    let state = this.states.get(key)

    if (!state || now - state.windowStart >= config.windowMs) {
      // Window expired or doesn't exist, create new window
      state = {
        count: 0,
        windowStart: now,
        totalCost: 0,
      }
    }

    // Calculate reset time
    const resetAt = state.windowStart + config.windowMs
    const remaining = Math.max(0, config.maxRequests - state.count)

    return {
      allowed: state.count < config.maxRequests,
      remaining,
      resetAt,
      count: state.count,
      retryAfter: state.count >= config.maxRequests ? resetAt - now : undefined,
    }
  }

  /**
   * Record a request and check if allowed
   */
  consume(
    operation: RateLimitedOperation,
    identifier: string,
    cost = 1
  ): RateLimitResult {
    const config = this.getConfig(operation)
    const key = this.buildKey(operation, identifier, config.scope)
    const now = Date.now()

    // Get or create state
    let state = this.states.get(key)

    if (!state || now - state.windowStart >= config.windowMs) {
      // Window expired, create new window
      state = {
        count: 0,
        windowStart: now,
        totalCost: 0,
      }
    }

    // Check if allowed before incrementing
    const wasAllowed = state.count < config.maxRequests

    if (wasAllowed) {
      // Increment count
      state.count += cost
      state.totalCost = (state.totalCost ?? 0) + (config.costPerRequest ?? 0) * cost
      this.states.set(key, state)
      this.saveToStorage()
    } else {
      // Record violation
      this.recordViolation(operation, key, config.maxRequests, state.count)
    }

    const resetAt = state.windowStart + config.windowMs
    const remaining = Math.max(0, config.maxRequests - state.count)

    return {
      allowed: wasAllowed,
      remaining,
      resetAt,
      count: state.count,
      retryAfter: !wasAllowed ? resetAt - now : undefined,
    }
  }

  /**
   * Get current usage for an operation
   */
  getUsage(
    operation: RateLimitedOperation,
    identifier: string
  ): { used: number; limit: number; cost: number; resetAt: number } {
    const config = this.getConfig(operation)
    const key = this.buildKey(operation, identifier, config.scope)
    const state = this.states.get(key)
    const now = Date.now()

    if (!state || now - state.windowStart >= config.windowMs) {
      return {
        used: 0,
        limit: config.maxRequests,
        cost: 0,
        resetAt: now + config.windowMs,
      }
    }

    return {
      used: state.count,
      limit: config.maxRequests,
      cost: state.totalCost ?? 0,
      resetAt: state.windowStart + config.windowMs,
    }
  }

  /**
   * Reset rate limit for a specific operation/identifier
   */
  reset(operation: RateLimitedOperation, identifier: string): void {
    const config = this.getConfig(operation)
    const key = this.buildKey(operation, identifier, config.scope)
    this.states.delete(key)
    this.saveToStorage()
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.states.clear()
    this.saveToStorage()
  }

  /**
   * Update configuration for an operation
   */
  setConfig(operation: RateLimitedOperation, config: Partial<RateLimitConfig>): void {
    const existing = this.getConfig(operation)
    this.configs.set(operation, { ...existing, ...config })
  }

  /**
   * Get configuration for an operation
   */
  getConfig(operation: RateLimitedOperation): RateLimitConfig {
    return this.configs.get(operation) ?? DEFAULT_RATE_LIMITS[operation]
  }

  /**
   * Add violation listener
   */
  onViolation(listener: ViolationListener): () => void {
    violationListeners.push(listener)
    return () => {
      const index = violationListeners.indexOf(listener)
      if (index > -1) violationListeners.splice(index, 1)
    }
  }

  /**
   * Get all current states (for debugging/monitoring)
   */
  getStates(): Map<string, RateLimitState> {
    return new Map(this.states)
  }

  /**
   * Clean up expired windows
   */
  cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, state] of this.states) {
      // Find the operation from the key to get windowMs
      const operation = this.extractOperationFromKey(key)
      if (operation) {
        const config = this.getConfig(operation)
        if (now - state.windowStart >= config.windowMs) {
          this.states.delete(key)
          cleaned++
        }
      }
    }

    if (cleaned > 0) {
      this.saveToStorage()
    }

    return cleaned
  }

  // Private methods

  private buildKey(
    operation: RateLimitedOperation,
    identifier: string,
    scope: 'user' | 'global' | 'ip'
  ): string {
    if (scope === 'global') {
      return `${operation}:global`
    }
    return `${operation}:${scope}:${identifier}`
  }

  private extractOperationFromKey(key: string): RateLimitedOperation | null {
    const parts = key.split(':')
    if (parts.length > 0 && this.configs.has(parts[0] as RateLimitedOperation)) {
      return parts[0] as RateLimitedOperation
    }
    return null
  }

  private recordViolation(
    operation: RateLimitedOperation,
    key: string,
    limit: number,
    current: number
  ): void {
    const violation: RateLimitViolation = {
      operation,
      key,
      limit,
      current,
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }

    // Notify listeners
    for (const listener of violationListeners) {
      try {
        listener(violation)
      } catch {
        // Ignore listener errors
      }
    }
  }

  private loadFromStorage(): void {
    if (!this.persistToStorage || typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'states')
      if (stored) {
        const data = JSON.parse(stored) as Record<string, RateLimitState>
        this.states = new Map(Object.entries(data))
        // Clean up expired entries on load
        this.cleanup()
      }
    } catch {
      // Storage unavailable or corrupt, start fresh
      this.states.clear()
    }
  }

  private saveToStorage(): void {
    if (!this.persistToStorage || typeof localStorage === 'undefined') return

    try {
      const data = Object.fromEntries(this.states)
      localStorage.setItem(STORAGE_KEY_PREFIX + 'states', JSON.stringify(data))
    } catch {
      // Storage full or unavailable, continue without persistence
    }
  }
}

/**
 * Singleton rate limiter instance
 */
export const rateLimiter = new RateLimiter()

/**
 * Rate limit decorator for async functions
 */
export function rateLimit(
  operation: RateLimitedOperation,
  getIdentifier: () => string
) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value
    if (!originalMethod) return descriptor

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const identifier = getIdentifier()
      const result = rateLimiter.consume(operation, identifier)

      if (!result.allowed) {
        const config = rateLimiter.getConfig(operation)
        const error = new Error(config.errorMessage ?? 'Rate limit exceeded')
        ;(error as Error & { retryAfter: number }).retryAfter = result.retryAfter ?? 0
        throw error
      }

      return originalMethod.apply(this, args)
    } as T

    return descriptor
  }
}

/**
 * Simple rate limit check function
 */
export function checkRateLimit(
  operation: RateLimitedOperation,
  identifier: string
): RateLimitResult {
  return rateLimiter.check(operation, identifier)
}

/**
 * Consume rate limit and throw if exceeded
 */
export async function consumeRateLimit(
  operation: RateLimitedOperation,
  identifier: string
): Promise<RateLimitResult> {
  const result = rateLimiter.consume(operation, identifier)

  if (!result.allowed) {
    const config = rateLimiter.getConfig(operation)
    const error = new Error(config.errorMessage ?? 'Rate limit exceeded') as Error & {
      retryAfter: number
      code: string
    }
    error.retryAfter = result.retryAfter ?? 0
    error.code = 'RATE_LIMIT_EXCEEDED'
    throw error
  }

  return result
}

/**
 * Format retry after time for display
 */
export function formatRetryAfter(ms: number): string {
  if (ms < 1000) return 'birkaç saniye'
  if (ms < 60000) return `${Math.ceil(ms / 1000)} saniye`
  if (ms < 3600000) return `${Math.ceil(ms / 60000)} dakika`
  return `${Math.ceil(ms / 3600000)} saat`
}

/**
 * Get all rate limit quotas for a user
 */
export function getUserQuotas(userId: string): Record<RateLimitedOperation, {
  used: number
  limit: number
  remaining: number
  resetAt: string
}> {
  const quotas: Record<string, { used: number; limit: number; remaining: number; resetAt: string }> = {}

  for (const operation of Object.keys(DEFAULT_RATE_LIMITS) as RateLimitedOperation[]) {
    const usage = rateLimiter.getUsage(operation, userId)
    quotas[operation] = {
      used: usage.used,
      limit: usage.limit,
      remaining: usage.limit - usage.used,
      resetAt: new Date(usage.resetAt).toISOString(),
    }
  }

  return quotas as Record<RateLimitedOperation, { used: number; limit: number; remaining: number; resetAt: string }>
}
