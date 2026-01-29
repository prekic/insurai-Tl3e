/**
 * Rate Limiting Middleware
 *
 * Provides tiered rate limiting for different API endpoints.
 * AI endpoints have stricter limits due to cost and resource usage.
 *
 * Security: Uses req.ip (set by Express trust proxy) and hashed auth tokens.
 * Does NOT trust user-supplied headers like x-forwarded-for or x-user-id.
 */

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit'
import crypto from 'crypto'
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
 * Extract a secure user identifier from the Authorization header.
 *
 * Uses a truncated hash of the Bearer token to identify unique sessions.
 * This ensures:
 * - Same token always maps to the same rate limit bucket
 * - Different tokens get different buckets (even if forged)
 * - Token content is not exposed in logs or rate limit keys
 *
 * @param authHeader - The Authorization header value
 * @returns A short hash of the token, or empty string if no valid token
 */
function extractSecureUserId(authHeader: string | undefined): string {
  if (!authHeader) return ''

  // Extract Bearer token
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return ''

  const token = parts[1]
  if (!token || token.length < 10) return ''

  // Create a short hash of the token for rate limiting purposes
  // Using first 16 chars of SHA-256 hash (64 bits) - sufficient for rate limit keys
  const hash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16)
  return `user:${hash}`
}

/**
 * Custom key generator that uses IP + optional authenticated user hash
 *
 * Security considerations:
 * - Uses req.ip which respects Express "trust proxy" setting
 * - Does NOT trust x-forwarded-for directly (Express handles this)
 * - Does NOT trust x-user-id header (was vulnerable to spoofing)
 * - Uses hashed auth token for per-user rate limiting
 *
 * @param req - Express request object
 * @returns Rate limit key combining IP and optional user hash
 */
function keyGenerator(req: Request): string {
  // Use req.ip - Express sets this correctly based on "trust proxy" setting
  // Falls back to socket address if req.ip is not set
  const ip = req.ip || req.socket.remoteAddress || 'unknown'

  // Extract user identifier from Authorization header (secure)
  const userId = extractSecureUserId(req.headers.authorization)

  // Combine IP and user ID for rate limit key
  // If authenticated: "192.168.1.1:user:abc123def456"
  // If not authenticated: "192.168.1.1"
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
