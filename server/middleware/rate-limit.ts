/**
 * Rate Limiting Middleware
 *
 * Provides tiered rate limiting for different API endpoints.
 * AI endpoints have stricter limits due to cost and resource usage.
 */

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit'
import type { Request, Response } from 'express'

// Rate limit configuration from environment or defaults
const config = {
  // General API limits
  general: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  // AI extraction limits (expensive operations)
  ai: {
    windowMs: parseInt(process.env.RATE_LIMIT_AI_WINDOW_MS || '3600000', 10), // 1 hour
    max: parseInt(process.env.RATE_LIMIT_AI_MAX || '20', 10),
  },
  // OCR limits (expensive operations)
  ocr: {
    windowMs: parseInt(process.env.RATE_LIMIT_OCR_WINDOW_MS || '3600000', 10), // 1 hour
    max: parseInt(process.env.RATE_LIMIT_OCR_MAX || '30', 10),
  },
  // Chat limits (moderate - more requests than extraction)
  chat: {
    windowMs: parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_MS || '3600000', 10), // 1 hour
    max: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '60', 10), // 60 per hour
  },
  // Health check (higher limit for monitoring)
  health: {
    windowMs: 60000, // 1 minute
    max: 60, // 1 per second
  },
}

/**
 * Custom key generator that uses IP + optional user ID
 * This allows per-user rate limiting when authenticated
 */
function keyGenerator(req: Request): string {
  // Get IP address (handle proxies)
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown'

  // If authenticated, include user ID for per-user limits
  const userId = (req.headers['x-user-id'] as string) || ''

  return userId ? `${ip}:${userId}` : ip
}

/**
 * Custom handler for rate limit exceeded
 */
function rateLimitHandler(_req: Request, res: Response): void {
  const retryAfter = res.getHeader('Retry-After')

  res.status(429).json({
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'You have exceeded the rate limit. Please try again later.',
    retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined,
    limit: res.getHeader('X-RateLimit-Limit'),
    remaining: 0,
    resetTime: res.getHeader('X-RateLimit-Reset'),
  })
}

/**
 * Skip rate limiting for certain conditions
 */
function skip(req: Request): boolean {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') {
    return true
  }

  // Skip for internal health checks from localhost
  if (req.path === '/api/health' && req.ip === '127.0.0.1') {
    return true
  }

  return false
}

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.general.windowMs,
  max: config.general.max,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  keyGenerator,
  handler: rateLimitHandler,
  skip,
})

/**
 * AI extraction rate limiter
 * 20 requests per hour per IP (expensive operation)
 */
export const aiExtractionLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.ai.windowMs,
  max: config.ai.max,
  message: {
    error: 'AI extraction rate limit exceeded',
    code: 'AI_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After')
    res.status(429).json({
      error: 'AI extraction rate limit exceeded',
      code: 'AI_RATE_LIMIT_EXCEEDED',
      message:
        'You have made too many AI extraction requests. This is an expensive operation. Please try again later.',
      retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined,
      limit: res.getHeader('X-RateLimit-Limit'),
      remaining: 0,
    })
  },
  skip,
})

/**
 * OCR rate limiter
 * 30 requests per hour per IP
 */
export const ocrLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.ocr.windowMs,
  max: config.ocr.max,
  message: {
    error: 'OCR rate limit exceeded',
    code: 'OCR_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After')
    res.status(429).json({
      error: 'OCR rate limit exceeded',
      code: 'OCR_RATE_LIMIT_EXCEEDED',
      message: 'You have made too many OCR requests. Please try again later.',
      retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined,
      limit: res.getHeader('X-RateLimit-Limit'),
      remaining: 0,
    })
  },
  skip,
})

/**
 * Chat rate limiter
 * 60 requests per hour per IP (more permissive than extraction)
 */
export const chatLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.chat.windowMs,
  max: config.chat.max,
  message: {
    error: 'Chat rate limit exceeded',
    code: 'CHAT_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After')
    res.status(429).json({
      error: 'Chat rate limit exceeded',
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
      message: 'You have sent too many messages. Please try again later.',
      retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined,
      limit: res.getHeader('X-RateLimit-Limit'),
      remaining: 0,
    })
  },
  skip,
})

/**
 * Health check rate limiter
 * More permissive for monitoring tools
 */
export const healthLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.health.windowMs,
  max: config.health.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.ip === '127.0.0.1',
})

/**
 * Strict limiter for authentication endpoints
 * Prevents brute force attacks
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: 900, // 15 minutes in seconds
    })
  },
  skip,
})

/**
 * Create a custom rate limiter with specific settings
 */
export function createRateLimiter(options: {
  windowMs: number
  max: number
  message?: string
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message || 'Rate limit exceeded' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skip,
  })
}

/**
 * Rate limit configuration for logging/debugging
 */
export const rateLimitConfig = config
