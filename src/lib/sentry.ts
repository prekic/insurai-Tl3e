/**
 * Sentry Error Tracking Configuration
 *
 * Initializes Sentry for production error monitoring and performance tracking.
 * Only active when VITE_SENTRY_DSN is configured.
 */

import * as Sentry from '@sentry/react'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
const IS_PRODUCTION = import.meta.env.PROD
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0'

/**
 * Initialize Sentry error tracking
 * Call this at app startup before rendering
 */
export function initSentry(): void {
  // Only initialize if DSN is configured
  if (!SENTRY_DSN) {
    if (IS_PRODUCTION) {
      console.warn('Sentry DSN not configured. Error tracking disabled.')
    }
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment and release tracking
    environment: IS_PRODUCTION ? 'production' : 'development',
    release: `insurai@${APP_VERSION}`,

    // Performance monitoring (sample 10% of transactions in production)
    tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

    // Session replay for debugging (sample 10% of sessions, 100% on error)
    replaysSessionSampleRate: IS_PRODUCTION ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,

    // Integration configuration
    integrations: [
      // React Router integration for route tracking
      Sentry.browserTracingIntegration(),
      // Session replay for debugging production issues
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Filter out noisy errors
    ignoreErrors: [
      // Browser extensions
      'ResizeObserver loop',
      'Non-Error promise rejection',
      // Network errors (user connectivity issues)
      'Failed to fetch',
      'NetworkError',
      'Load failed',
      // User navigation
      'AbortError',
    ],

    // Don't send errors in development unless explicitly enabled
    enabled: IS_PRODUCTION || import.meta.env.VITE_SENTRY_DEBUG === 'true',

    // Sanitize sensitive data
    beforeSend(event) {
      // Remove API keys from error data
      if (event.request?.headers) {
        delete event.request.headers['Authorization']
        delete event.request.headers['X-API-Key']
      }

      // Mask policy numbers and personal data in breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.message) {
            // Mask policy numbers (format: XX-XXXXXXXX)
            breadcrumb.message = breadcrumb.message.replace(
              /\b\d{2}-\d{8}\b/g,
              '[POLICY_NUMBER]'
            )
            // Mask TC Kimlik numbers (11 digits)
            breadcrumb.message = breadcrumb.message.replace(
              /\b\d{11}\b/g,
              '[TC_KIMLIK]'
            )
          }
          return breadcrumb
        })
      }

      return event
    },
  })
}

/**
 * Set user context for error tracking
 */
export function setSentryUser(user: { id: string; email?: string } | null): void {
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
export function setSentryContext(name: string, context: Record<string, unknown>): void {
  if (!SENTRY_DSN) return
  Sentry.setContext(name, context)
}

/**
 * Capture a custom error with additional context
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
): string | undefined {
  if (!SENTRY_DSN) {
    console.error('Error captured (Sentry disabled):', error, context)
    return undefined
  }

  return Sentry.captureException(error, {
    extra: context,
  })
}

/**
 * Capture a custom message
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (!SENTRY_DSN) {
    console.log(`[${level}] ${message}`)
    return
  }

  Sentry.captureMessage(message, level)
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  if (!SENTRY_DSN) return

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  })
}

// Re-export Sentry's ErrorBoundary for use in components
export { ErrorBoundary } from '@sentry/react'
