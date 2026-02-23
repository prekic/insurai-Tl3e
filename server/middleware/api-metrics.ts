/**
 * API Metrics Middleware
 *
 * Automatically records request metrics for all API routes by hooking into
 * the Express response lifecycle. Feeds data to the monitoring system for
 * real-time dashboards, alert evaluation, and trend analysis.
 */

import type { Request, Response, NextFunction } from 'express'
import { recordRequest, type RequestMetric } from './monitoring.js'
import { logger } from '../lib/logger.js'

const log = logger.child('ApiMetrics')

/**
 * Map of route path patterns to normalized endpoint names.
 * Prevents high-cardinality metric keys from dynamic segments (UUIDs, IDs).
 */
const ROUTE_NORMALIZATIONS: Array<{ pattern: RegExp; normalized: string }> = [
  { pattern: /^\/api\/ai\/extract\/openai$/, normalized: '/api/ai/extract/openai' },
  { pattern: /^\/api\/ai\/extract\/anthropic$/, normalized: '/api/ai/extract/anthropic' },
  { pattern: /^\/api\/ai\/extract$/, normalized: '/api/ai/extract' },
  { pattern: /^\/api\/ai\/chat$/, normalized: '/api/ai/chat' },
  { pattern: /^\/api\/ai\/ocr$/, normalized: '/api/ai/ocr' },
  { pattern: /^\/api\/ai\/providers$/, normalized: '/api/ai/providers' },
  { pattern: /^\/api\/ai\/diagnose$/, normalized: '/api/ai/diagnose' },
  { pattern: /^\/api\/ai\/processing-log\/[^/]+\/stage$/, normalized: '/api/ai/processing-log/:id/stage' },
  { pattern: /^\/api\/ai\/processing-log\/[^/]+$/, normalized: '/api/ai/processing-log/:id' },
  { pattern: /^\/api\/ai\/processing-log$/, normalized: '/api/ai/processing-log' },
  { pattern: /^\/api\/health$/, normalized: '/api/health' },
  { pattern: /^\/api\/pdf\/extract$/, normalized: '/api/pdf/extract' },
  { pattern: /^\/api\/notifications\/[^/]+$/, normalized: '/api/notifications/:id' },
  { pattern: /^\/api\/admin\/monitoring\/alerts\/[^/]+\/acknowledge$/, normalized: '/api/admin/monitoring/alerts/:id/acknowledge' },
  { pattern: /^\/api\/admin\/monitoring\/alerts\/[^/]+\/resolve$/, normalized: '/api/admin/monitoring/alerts/:id/resolve' },
  { pattern: /^\/api\/admin\/monitoring\/alert-rules\/[^/]+$/, normalized: '/api/admin/monitoring/alert-rules/:id' },
  { pattern: /^\/api\/admin\//, normalized: '/api/admin/*' },
  { pattern: /^\/api\/translations\//, normalized: '/api/translations/*' },
  { pattern: /^\/api\/email\//, normalized: '/api/email/*' },
  { pattern: /^\/api\/internal\//, normalized: '/api/internal/*' },
]

/**
 * Normalize a request path to avoid high-cardinality metric keys.
 * UUIDs and dynamic segments are replaced with placeholders.
 */
function normalizeEndpoint(path: string): string {
  for (const { pattern, normalized } of ROUTE_NORMALIZATIONS) {
    if (pattern.test(path)) {
      return normalized
    }
  }
  // Fallback: replace UUID-like segments
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
}

/**
 * Detect the AI provider from the request path or body.
 */
function detectProvider(req: Request): string | undefined {
  const path = req.path
  if (path.includes('/extract/openai')) return 'openai'
  if (path.includes('/extract/anthropic')) return 'anthropic'
  if (path.includes('/ocr')) return 'google'
  if (path.includes('/chat')) {
    // Chat endpoint may use different providers — check body if available
    const provider = (req.body as Record<string, unknown>)?.provider
    if (typeof provider === 'string') return provider
  }
  return undefined
}

/**
 * Express middleware that records request metrics on response finish.
 *
 * Must be applied before route handlers. Hooks into the `finish` event
 * on the response object to capture timing and status information.
 */
export function apiMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  res.on('finish', () => {
    try {
      const responseTime = Date.now() - start
      const endpoint = normalizeEndpoint(req.originalUrl.split('?')[0])
      const provider = detectProvider(req)
      const userId = req.headers['x-user-id'] as string | undefined

      const metric: RequestMetric = {
        endpoint,
        method: req.method,
        statusCode: res.statusCode,
        responseTime,
        timestamp: new Date().toISOString(),
        userId,
        provider,
        error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
      }

      recordRequest(metric)
    } catch (err) {
      log.debug('Failed to record request metric', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  next()
}
