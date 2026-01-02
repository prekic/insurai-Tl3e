/**
 * Server-side Sentry Error Tracking
 *
 * Initializes Sentry for backend error monitoring and performance tracking.
 * Captures unhandled exceptions, request errors, and custom events.
 */

import * as Sentry from '@sentry/node'

const SENTRY_DSN = process.env.SENTRY_DSN
const NODE_ENV = process.env.NODE_ENV || 'development'
const APP_VERSION = process.env.APP_VERSION || '0.1.0'

// Determine environment
const getEnvironment = (): string => {
  if (process.env.SENTRY_ENVIRONMENT) {
    return process.env.SENTRY_ENVIRONMENT
  }
  if (NODE_ENV === 'staging') return 'staging'
  if (NODE_ENV === 'production') return 'production'
  return 'development'
}

const SENTRY_ENVIRONMENT = getEnvironment()
const IS_STAGING = SENTRY_ENVIRONMENT === 'staging'
const IS_PRODUCTION = SENTRY_ENVIRONMENT === 'production'

// Sample rates by environment
const getSampleRate = (): number => {
  if (IS_STAGING) return 0.5 // 50% of transactions
  if (IS_PRODUCTION) return 0.1 // 10% of transactions
  return 1.0 // 100% in development
}

/**
 * Initialize Sentry for server-side error tracking
 */
export function initServerSentry(): void {
  if (!SENTRY_DSN) {
    if (IS_PRODUCTION || IS_STAGING) {
      console.warn('[Sentry] DSN not configured. Server error tracking disabled.')
    }
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: `insurai-server@${APP_VERSION}`,

    // Performance monitoring
    tracesSampleRate: getSampleRate(),

    // Filter out noisy errors
    ignoreErrors: [
      // Network/client errors
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      // Client aborts
      'aborted',
      'socket hang up',
    ],

    // Sanitize sensitive data before sending
    beforeSend(event) {
      // Remove API keys from error data
      if (event.request?.headers) {
        const sanitizedHeaders = { ...event.request.headers }
        delete sanitizedHeaders['authorization']
        delete sanitizedHeaders['x-api-key']
        delete sanitizedHeaders['cookie']
        event.request.headers = sanitizedHeaders
      }

      // Remove sensitive body data
      if (event.request?.data) {
        const data =
          typeof event.request.data === 'string'
            ? JSON.parse(event.request.data)
            : event.request.data

        if (data.apiKey) data.apiKey = '[REDACTED]'
        if (data.password) data.password = '[REDACTED]'
        if (data.token) data.token = '[REDACTED]'
        if (data.content) {
          // Truncate large content to avoid sending full documents
          data.content =
            data.content.length > 500
              ? data.content.substring(0, 500) + '...[truncated]'
              : data.content
        }

        event.request.data = JSON.stringify(data)
      }

      return event
    },

    // Only enable in production/staging
    enabled: IS_PRODUCTION || IS_STAGING,
  })

  console.log(`[Sentry] Server tracking initialized (${SENTRY_ENVIRONMENT})`)
}

/**
 * Express error handler middleware for Sentry
 */
export function sentryErrorHandler() {
  return Sentry.expressErrorHandler()
}

/**
 * Express request handler middleware for Sentry
 */
export function sentryRequestHandler() {
  return Sentry.expressRequestHandler()
}

/**
 * Capture an error with optional context
 */
export function captureServerError(
  error: Error,
  context?: Record<string, unknown>
): string | undefined {
  if (!SENTRY_DSN) {
    console.error('[Server Error]', error, context)
    return undefined
  }

  return Sentry.captureException(error, {
    extra: context,
  })
}

/**
 * Capture a message/event
 */
export function captureServerMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (!SENTRY_DSN) {
    console.log(`[${level.toUpperCase()}] ${message}`)
    return
  }

  Sentry.captureMessage(message, level)
}

/**
 * Set user context for error tracking
 */
export function setServerUser(user: { id: string; email?: string } | null): void {
  if (!SENTRY_DSN) return

  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * Add custom context to errors
 */
export function setServerContext(name: string, context: Record<string, unknown>): void {
  if (!SENTRY_DSN) return
  Sentry.setContext(name, context)
}

// Export Sentry for direct access if needed
export { Sentry }
