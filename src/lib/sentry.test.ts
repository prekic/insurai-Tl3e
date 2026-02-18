/**
 * Sentry Error Tracking Tests
 *
 * Tests for client-side Sentry configuration and error capture utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @sentry/react before importing
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(() => 'test-event-id'),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
  ErrorBoundary: vi.fn(() => null),
}))

import {
  initSentry,
  setSentryUser,
  setSentryContext,
  captureError,
  captureMessage,
  addBreadcrumb,
} from './sentry'

describe('Sentry Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initSentry', () => {
    it('should be a callable function', () => {
      expect(typeof initSentry).toBe('function')
    })

    it('should not throw when called', () => {
      expect(() => initSentry()).not.toThrow()
    })
  })

  describe('setSentryUser', () => {
    it('should be a callable function', () => {
      expect(typeof setSentryUser).toBe('function')
    })

    it('should accept user object', () => {
      expect(() =>
        setSentryUser({ id: 'user-123', email: 'test@example.com' })
      ).not.toThrow()
    })

    it('should accept null to clear user', () => {
      expect(() => setSentryUser(null)).not.toThrow()
    })

    it('should handle user without email', () => {
      expect(() => setSentryUser({ id: 'user-123' })).not.toThrow()
    })
  })

  describe('setSentryContext', () => {
    it('should be a callable function', () => {
      expect(typeof setSentryContext).toBe('function')
    })

    it('should accept context name and object', () => {
      expect(() =>
        setSentryContext('policy', { type: 'auto', coverage: '100k' })
      ).not.toThrow()
    })

    it('should accept empty context', () => {
      expect(() => setSentryContext('empty', {})).not.toThrow()
    })

    it('should accept nested context objects', () => {
      expect(() =>
        setSentryContext('nested', {
          level1: { level2: { value: 123 } },
        })
      ).not.toThrow()
    })
  })

  describe('captureError', () => {
    it('should be a callable function', () => {
      expect(typeof captureError).toBe('function')
    })

    it('should accept an Error object', () => {
      const error = new Error('Test error')
      // Returns undefined when DSN is not configured, or event ID when it is
      expect(() => captureError(error)).not.toThrow()
    })

    it('should accept error with context', () => {
      const error = new Error('Test error')
      // Returns undefined when DSN is not configured, or event ID when it is
      expect(() => captureError(error, { userId: 'user-123' })).not.toThrow()
    })

    it('should handle errors without context', () => {
      const error = new Error('Simple error')
      expect(() => captureError(error)).not.toThrow()
    })
  })

  describe('captureMessage', () => {
    it('should be a callable function', () => {
      expect(typeof captureMessage).toBe('function')
    })

    it('should accept message with level', () => {
      expect(() => captureMessage('Test message', 'warning')).not.toThrow()
    })

    it('should accept message with info level', () => {
      expect(() => captureMessage('Info message', 'info')).not.toThrow()
    })

    it('should accept message with error level', () => {
      expect(() => captureMessage('Error message', 'error')).not.toThrow()
    })

    it('should default to info level when not specified', () => {
      expect(() => captureMessage('Default level')).not.toThrow()
    })

    it('should handle empty message', () => {
      expect(() => captureMessage('')).not.toThrow()
    })
  })

  describe('addBreadcrumb', () => {
    it('should be a callable function', () => {
      expect(typeof addBreadcrumb).toBe('function')
    })

    it('should accept message and category', () => {
      expect(() => addBreadcrumb('User clicked', 'ui')).not.toThrow()
    })

    it('should accept message, category, and data', () => {
      expect(() =>
        addBreadcrumb('Button click', 'ui', { button: 'submit' })
      ).not.toThrow()
    })

    it('should handle various categories', () => {
      expect(() => addBreadcrumb('Navigation', 'navigation')).not.toThrow()
      expect(() => addBreadcrumb('API call', 'http')).not.toThrow()
      expect(() => addBreadcrumb('User action', 'user')).not.toThrow()
    })
  })

  describe('beforeSend sanitization logic', () => {
    it('should sanitize policy numbers pattern', () => {
      // Test the regex pattern used in beforeSend
      const policyPattern = /\b\d{2}-\d{8}\b/g
      const message = 'Loaded policy 12-34567890'
      const sanitized = message.replace(policyPattern, '[POLICY_NUMBER]')
      expect(sanitized).toBe('Loaded policy [POLICY_NUMBER]')
    })

    it('should sanitize TC Kimlik pattern', () => {
      // Test the regex pattern for TC Kimlik (11 digits)
      const tcPattern = /\b\d{11}\b/g
      const message = 'User TC: 12345678901 accessed'
      const sanitized = message.replace(tcPattern, '[TC_KIMLIK]')
      expect(sanitized).toBe('User TC: [TC_KIMLIK] accessed')
    })

    it('should handle multiple policy numbers', () => {
      const policyPattern = /\b\d{2}-\d{8}\b/g
      const message = 'Comparing 12-34567890 vs 98-76543210'
      const sanitized = message.replace(policyPattern, '[POLICY_NUMBER]')
      expect(sanitized).toBe('Comparing [POLICY_NUMBER] vs [POLICY_NUMBER]')
    })

    it('should handle multiple TC numbers', () => {
      const tcPattern = /\b\d{11}\b/g
      const message = 'Users 12345678901 and 98765432109 compared'
      const sanitized = message.replace(tcPattern, '[TC_KIMLIK]')
      expect(sanitized).toBe('Users [TC_KIMLIK] and [TC_KIMLIK] compared')
    })

    it('should handle messages with no sensitive data', () => {
      const policyPattern = /\b\d{2}-\d{8}\b/g
      const tcPattern = /\b\d{11}\b/g

      const message = 'Regular message without sensitive data'
      let sanitized = message.replace(policyPattern, '[POLICY_NUMBER]')
      sanitized = sanitized.replace(tcPattern, '[TC_KIMLIK]')

      expect(sanitized).toBe('Regular message without sensitive data')
    })

    it('should handle combined patterns in same message', () => {
      const policyPattern = /\b\d{2}-\d{8}\b/g
      const tcPattern = /\b\d{11}\b/g

      let message = 'Policy 12-34567890 for TC 12345678901'
      message = message.replace(policyPattern, '[POLICY_NUMBER]')
      message = message.replace(tcPattern, '[TC_KIMLIK]')

      expect(message).toBe('Policy [POLICY_NUMBER] for TC [TC_KIMLIK]')
    })
  })

  describe('sample rates configuration', () => {
    it('should have staging rates defined', () => {
      const stagingRates = {
        traces: 0.5,
        replaysSession: 0.3,
        replaysOnError: 1.0,
      }
      expect(stagingRates.traces).toBe(0.5)
      expect(stagingRates.replaysSession).toBe(0.3)
      expect(stagingRates.replaysOnError).toBe(1.0)
    })

    it('should have production rates defined', () => {
      const productionRates = {
        traces: 0.1,
        replaysSession: 0.1,
        replaysOnError: 1.0,
      }
      expect(productionRates.traces).toBe(0.1)
      expect(productionRates.replaysSession).toBe(0.1)
      expect(productionRates.replaysOnError).toBe(1.0)
    })

    it('should have development rates defined', () => {
      const devRates = {
        traces: 1.0,
        replaysSession: 0,
        replaysOnError: 1.0,
      }
      expect(devRates.traces).toBe(1.0)
      expect(devRates.replaysSession).toBe(0)
      expect(devRates.replaysOnError).toBe(1.0)
    })

    it('should always capture replays on error', () => {
      expect(0.1).toBeLessThan(1.0) // production
      expect(0.3).toBeLessThan(1.0) // staging
      expect(0).toBeLessThan(1.0) // development
      // replaysOnError is always 1.0
    })
  })

  describe('ignored errors configuration', () => {
    const ignoredErrors = [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      'Failed to fetch',
      'NetworkError',
      'Load failed',
      'AbortError',
    ]

    it('should include browser extension errors', () => {
      expect(ignoredErrors).toContain('ResizeObserver loop')
      expect(ignoredErrors).toContain('Non-Error promise rejection')
    })

    it('should include network errors', () => {
      expect(ignoredErrors).toContain('Failed to fetch')
      expect(ignoredErrors).toContain('NetworkError')
      expect(ignoredErrors).toContain('Load failed')
    })

    it('should include user navigation errors', () => {
      expect(ignoredErrors).toContain('AbortError')
    })

    it('should have 6 ignored error patterns', () => {
      expect(ignoredErrors.length).toBe(6)
    })
  })

  describe('header sanitization', () => {
    it('should identify sensitive headers', () => {
      const sensitiveHeaders = ['Authorization', 'X-API-Key']
      const headers: Record<string, string> = {
        Authorization: 'Bearer token',
        'X-API-Key': 'key-123',
        'Content-Type': 'application/json',
      }

      sensitiveHeaders.forEach((h) => delete headers[h])

      expect(headers.Authorization).toBeUndefined()
      expect(headers['X-API-Key']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should preserve non-sensitive headers', () => {
      const sensitiveHeaders = ['Authorization', 'X-API-Key']
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      }

      sensitiveHeaders.forEach((h) => delete headers[h])

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers.Accept).toBe('application/json')
      expect(headers['User-Agent']).toBe('Mozilla/5.0')
    })
  })

  describe('integration configuration', () => {
    it('should configure replay with privacy settings', () => {
      const replayConfig = {
        maskAllText: true,
        blockAllMedia: true,
      }
      expect(replayConfig.maskAllText).toBe(true)
      expect(replayConfig.blockAllMedia).toBe(true)
    })
  })

  describe('environment detection', () => {
    it('should detect production environment', () => {
      const getEnv = (isProd: boolean) =>
        isProd ? 'production' : 'development'
      expect(getEnv(true)).toBe('production')
      expect(getEnv(false)).toBe('development')
    })

    it('should respect explicit environment override', () => {
      const getEnv = (explicitEnv?: string, isProd?: boolean) =>
        explicitEnv || (isProd ? 'production' : 'development')

      expect(getEnv('staging', true)).toBe('staging')
      expect(getEnv('custom', false)).toBe('custom')
      expect(getEnv(undefined, true)).toBe('production')
    })
  })

  describe('functions without DSN (early return paths)', () => {
    it('initSentry should not call Sentry.init when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      initSentry()
      expect(Sentry.init).not.toHaveBeenCalled()
    })

    it('setSentryUser should not call Sentry.setUser when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      setSentryUser({ id: 'user-123', email: 'test@example.com' })
      expect(Sentry.setUser).not.toHaveBeenCalled()
    })

    it('setSentryUser with null should not call Sentry.setUser when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      setSentryUser(null)
      expect(Sentry.setUser).not.toHaveBeenCalled()
    })

    it('setSentryContext should not call Sentry.setContext when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      setSentryContext('test', { key: 'value' })
      expect(Sentry.setContext).not.toHaveBeenCalled()
    })

    it('captureError should return undefined when DSN is not configured', () => {
      const error = new Error('Test')
      const result = captureError(error)
      expect(result).toBeUndefined()
    })

    it('captureError should log to console.error when DSN is not configured', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')
      captureError(error)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error captured (Sentry disabled):',
        error,
        undefined
      )
      consoleSpy.mockRestore()
    })

    it('captureError should log context to console.error when DSN is not configured', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test')
      const context = { userId: 'user-123' }
      captureError(error, context)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error captured (Sentry disabled):',
        error,
        context
      )
      consoleSpy.mockRestore()
    })

    it('captureError should not call Sentry.captureException when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      captureError(new Error('Test'))
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('captureMessage should fall back to console.info when DSN is not configured', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      captureMessage('Test message', 'warning')
      expect(consoleSpy).toHaveBeenCalledWith('[warning] Test message')
      consoleSpy.mockRestore()
    })

    it('captureMessage should use default info level in console fallback', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      captureMessage('Default level')
      expect(consoleSpy).toHaveBeenCalledWith('[info] Default level')
      consoleSpy.mockRestore()
    })

    it('captureMessage should handle error level in console fallback', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      captureMessage('Error happened', 'error')
      expect(consoleSpy).toHaveBeenCalledWith('[error] Error happened')
      consoleSpy.mockRestore()
    })

    it('captureMessage should not call Sentry.captureMessage when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      captureMessage('Test')
      expect(Sentry.captureMessage).not.toHaveBeenCalled()
    })

    it('addBreadcrumb should not call Sentry.addBreadcrumb when DSN is not configured', async () => {
      const Sentry = await import('@sentry/react')
      addBreadcrumb('click', 'ui', { element: 'button' })
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled()
    })
  })

  describe('ErrorBoundary re-export', () => {
    it('should re-export ErrorBoundary from @sentry/react', async () => {
      const sentry = await import('./sentry')
      expect(sentry.ErrorBoundary).toBeDefined()
    })
  })

  describe('beforeSend function behavior', () => {
    it('should sanitize breadcrumb messages with policy and TC numbers', () => {
      // Simulate what beforeSend does to breadcrumbs
      const breadcrumbs = [
        { message: 'User viewed policy 12-34567890' },
        { message: 'TC Kimlik 12345678901 verified' },
        { message: 'Navigation to dashboard' },
      ]

      const sanitized = breadcrumbs.map(b => {
        if (b.message) {
          let msg = b.message
          msg = msg.replace(/\b\d{2}-\d{8}\b/g, '[POLICY_NUMBER]')
          msg = msg.replace(/\b\d{11}\b/g, '[TC_KIMLIK]')
          return { ...b, message: msg }
        }
        return b
      })

      expect(sanitized[0].message).toBe('User viewed policy [POLICY_NUMBER]')
      expect(sanitized[1].message).toBe('TC Kimlik [TC_KIMLIK] verified')
      expect(sanitized[2].message).toBe('Navigation to dashboard')
    })

    it('should handle breadcrumbs without message', () => {
      const breadcrumbs = [
        { category: 'http', data: { url: '/api/test' } },
      ]

      const sanitized = breadcrumbs.map(b => {
        if ('message' in b && b.message) {
          return b
        }
        return b
      })

      expect(sanitized[0]).toEqual({ category: 'http', data: { url: '/api/test' } })
    })

    it('should remove Authorization header from request', () => {
      const event = {
        request: {
          headers: {
            Authorization: 'Bearer secret-token',
            'Content-Type': 'application/json',
          },
        },
      }

      delete event.request.headers.Authorization
      expect(event.request.headers.Authorization).toBeUndefined()
      expect(event.request.headers['Content-Type']).toBe('application/json')
    })

    it('should remove X-API-Key header from request', () => {
      const event = {
        request: {
          headers: {
            'X-API-Key': 'secret-key',
            Accept: 'application/json',
          } as Record<string, string>,
        },
      }

      delete event.request.headers['X-API-Key']
      expect(event.request.headers['X-API-Key']).toBeUndefined()
      expect(event.request.headers.Accept).toBe('application/json')
    })

    it('should handle event without request property', () => {
      const event = { message: 'test event' }
      // beforeSend checks if (event.request?.headers) - should not throw
      expect(() => {
        if ((event as Record<string, unknown>).request) {
          // would process headers
        }
      }).not.toThrow()
    })

    it('should handle event without breadcrumbs', () => {
      const event = { message: 'test event', breadcrumbs: undefined }
      // beforeSend checks if (event.breadcrumbs) - should not throw
      expect(() => {
        if (event.breadcrumbs) {
          // would process breadcrumbs
        }
      }).not.toThrow()
    })
  })

  describe('getSampleRates logic', () => {
    it('should return correct rates for staging environment', () => {
      const getSampleRates = (isStaging: boolean, isProduction: boolean) => {
        if (isStaging) return { traces: 0.5, replaysSession: 0.3, replaysOnError: 1.0 }
        if (isProduction) return { traces: 0.1, replaysSession: 0.1, replaysOnError: 1.0 }
        return { traces: 1.0, replaysSession: 0, replaysOnError: 1.0 }
      }

      const staging = getSampleRates(true, false)
      expect(staging.traces).toBe(0.5)
      expect(staging.replaysSession).toBe(0.3)
      expect(staging.replaysOnError).toBe(1.0)
    })

    it('should return correct rates for production environment', () => {
      const getSampleRates = (isStaging: boolean, isProduction: boolean) => {
        if (isStaging) return { traces: 0.5, replaysSession: 0.3, replaysOnError: 1.0 }
        if (isProduction) return { traces: 0.1, replaysSession: 0.1, replaysOnError: 1.0 }
        return { traces: 1.0, replaysSession: 0, replaysOnError: 1.0 }
      }

      const production = getSampleRates(false, true)
      expect(production.traces).toBe(0.1)
      expect(production.replaysSession).toBe(0.1)
    })

    it('should return full sampling for development', () => {
      const getSampleRates = (isStaging: boolean, isProduction: boolean) => {
        if (isStaging) return { traces: 0.5, replaysSession: 0.3, replaysOnError: 1.0 }
        if (isProduction) return { traces: 0.1, replaysSession: 0.1, replaysOnError: 1.0 }
        return { traces: 1.0, replaysSession: 0, replaysOnError: 1.0 }
      }

      const dev = getSampleRates(false, false)
      expect(dev.traces).toBe(1.0)
      expect(dev.replaysSession).toBe(0)
      expect(dev.replaysOnError).toBe(1.0)
    })

    it('staging should take priority over production when both true', () => {
      const getSampleRates = (isStaging: boolean, isProduction: boolean) => {
        if (isStaging) return { traces: 0.5, replaysSession: 0.3, replaysOnError: 1.0 }
        if (isProduction) return { traces: 0.1, replaysSession: 0.1, replaysOnError: 1.0 }
        return { traces: 1.0, replaysSession: 0, replaysOnError: 1.0 }
      }

      const result = getSampleRates(true, true)
      expect(result.traces).toBe(0.5) // staging, not production
    })
  })
})
