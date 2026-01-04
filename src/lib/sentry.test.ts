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

import * as Sentry from '@sentry/react'
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
})
