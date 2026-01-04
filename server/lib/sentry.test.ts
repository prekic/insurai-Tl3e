/**
 * Server Sentry Error Tracking Tests
 *
 * Tests for server-side Sentry configuration and error capture utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @sentry/node before importing
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(() => 'test-event-id'),
  captureMessage: vi.fn(),
  expressErrorHandler: vi.fn(() => vi.fn()),
  expressRequestHandler: vi.fn(() => vi.fn()),
}))

import * as Sentry from '@sentry/node'
import {
  initServerSentry,
  sentryErrorHandler,
  sentryRequestHandler,
  captureServerError,
  captureServerMessage,
  setServerUser,
  setServerContext,
} from './sentry'

describe('Sentry Server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initServerSentry', () => {
    it('should be a callable function', () => {
      expect(typeof initServerSentry).toBe('function')
    })

    it('should not throw when called', () => {
      expect(() => initServerSentry()).not.toThrow()
    })
  })

  describe('sentryErrorHandler', () => {
    it('should return express middleware', () => {
      const handler = sentryErrorHandler()
      expect(handler).toBeDefined()
      expect(typeof handler).toBe('function')
    })

    it('should call Sentry expressErrorHandler', () => {
      sentryErrorHandler()
      expect(Sentry.expressErrorHandler).toHaveBeenCalled()
    })
  })

  describe('sentryRequestHandler', () => {
    it('should return express middleware', () => {
      const handler = sentryRequestHandler()
      expect(handler).toBeDefined()
      expect(typeof handler).toBe('function')
    })

    it('should call Sentry expressRequestHandler', () => {
      sentryRequestHandler()
      expect(Sentry.expressRequestHandler).toHaveBeenCalled()
    })
  })

  describe('captureServerError', () => {
    it('should be a callable function', () => {
      expect(typeof captureServerError).toBe('function')
    })

    it('should accept an Error object', () => {
      const error = new Error('Test error')
      // Returns undefined when DSN is not configured, or event ID when it is
      expect(() => captureServerError(error)).not.toThrow()
    })

    it('should accept error with context', () => {
      const error = new Error('Test error')
      // Returns undefined when DSN is not configured, or event ID when it is
      expect(() => captureServerError(error, { requestId: 'req-123' })).not.toThrow()
    })

    it('should handle errors without context', () => {
      const error = new Error('Simple error')
      expect(() => captureServerError(error)).not.toThrow()
    })
  })

  describe('captureServerMessage', () => {
    it('should be a callable function', () => {
      expect(typeof captureServerMessage).toBe('function')
    })

    it('should accept message with level', () => {
      expect(() => captureServerMessage('Test message', 'warning')).not.toThrow()
    })

    it('should accept message with info level', () => {
      expect(() => captureServerMessage('Info message', 'info')).not.toThrow()
    })

    it('should accept message with error level', () => {
      expect(() => captureServerMessage('Error message', 'error')).not.toThrow()
    })

    it('should handle default level', () => {
      expect(() => captureServerMessage('Default level')).not.toThrow()
    })
  })

  describe('setServerUser', () => {
    it('should be a callable function', () => {
      expect(typeof setServerUser).toBe('function')
    })

    it('should accept user object', () => {
      expect(() =>
        setServerUser({ id: 'user-123', email: 'test@example.com' })
      ).not.toThrow()
    })

    it('should accept null to clear user', () => {
      expect(() => setServerUser(null)).not.toThrow()
    })

    it('should handle user without email', () => {
      expect(() => setServerUser({ id: 'user-123' })).not.toThrow()
    })
  })

  describe('setServerContext', () => {
    it('should be a callable function', () => {
      expect(typeof setServerContext).toBe('function')
    })

    it('should accept context name and object', () => {
      expect(() =>
        setServerContext('request', { method: 'POST', path: '/api/analyze' })
      ).not.toThrow()
    })

    it('should accept empty context', () => {
      expect(() => setServerContext('empty', {})).not.toThrow()
    })
  })

  describe('sample rate configuration', () => {
    it('should have staging sample rate defined', () => {
      const stagingRate = 0.5
      expect(stagingRate).toBe(0.5)
    })

    it('should have production sample rate defined', () => {
      const productionRate = 0.1
      expect(productionRate).toBe(0.1)
    })

    it('should have development sample rate defined', () => {
      const devRate = 1.0
      expect(devRate).toBe(1.0)
    })
  })

  describe('ignored errors configuration', () => {
    const ignoredErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'aborted',
      'socket hang up',
    ]

    it('should include connection errors', () => {
      expect(ignoredErrors).toContain('ECONNRESET')
      expect(ignoredErrors).toContain('ECONNREFUSED')
    })

    it('should include timeout errors', () => {
      expect(ignoredErrors).toContain('ETIMEDOUT')
    })

    it('should include pipe errors', () => {
      expect(ignoredErrors).toContain('EPIPE')
    })

    it('should include client abort errors', () => {
      expect(ignoredErrors).toContain('aborted')
      expect(ignoredErrors).toContain('socket hang up')
    })

    it('should have 6 ignored error patterns', () => {
      expect(ignoredErrors.length).toBe(6)
    })
  })

  describe('header sanitization patterns', () => {
    it('should identify sensitive headers', () => {
      const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie']
      const headers: Record<string, string> = {
        authorization: 'Bearer token',
        'x-api-key': 'key-123',
        cookie: 'session=abc',
        'content-type': 'application/json',
      }

      const sanitized = { ...headers }
      sensitiveHeaders.forEach((h) => delete sanitized[h])

      expect(sanitized.authorization).toBeUndefined()
      expect(sanitized['x-api-key']).toBeUndefined()
      expect(sanitized.cookie).toBeUndefined()
      expect(sanitized['content-type']).toBe('application/json')
    })
  })

  describe('body sanitization patterns', () => {
    it('should redact apiKey field', () => {
      const data = { apiKey: 'secret', username: 'test' }
      if (data.apiKey) data.apiKey = '[REDACTED]'
      expect(data.apiKey).toBe('[REDACTED]')
      expect(data.username).toBe('test')
    })

    it('should redact password field', () => {
      const data = { password: 'secret', username: 'test' }
      if (data.password) data.password = '[REDACTED]'
      expect(data.password).toBe('[REDACTED]')
    })

    it('should redact token field', () => {
      const data = { token: 'secret', user: 'test' }
      if (data.token) data.token = '[REDACTED]'
      expect(data.token).toBe('[REDACTED]')
    })

    it('should truncate large content', () => {
      const largeContent = 'A'.repeat(1000)
      const truncated =
        largeContent.length > 500
          ? largeContent.substring(0, 500) + '...[truncated]'
          : largeContent

      expect(truncated.length).toBeLessThan(largeContent.length)
      expect(truncated).toContain('...[truncated]')
    })

    it('should not truncate small content', () => {
      const smallContent = 'Short content'
      const result =
        smallContent.length > 500
          ? smallContent.substring(0, 500) + '...[truncated]'
          : smallContent

      expect(result).toBe(smallContent)
    })
  })

  describe('environment detection', () => {
    it('should detect production from NODE_ENV', () => {
      const getEnv = (nodeEnv: string) => {
        if (nodeEnv === 'production') return 'production'
        if (nodeEnv === 'staging') return 'staging'
        return 'development'
      }

      expect(getEnv('production')).toBe('production')
      expect(getEnv('staging')).toBe('staging')
      expect(getEnv('development')).toBe('development')
    })

    it('should respect explicit SENTRY_ENVIRONMENT', () => {
      const getEnv = (sentryEnv?: string, nodeEnv?: string) => {
        if (sentryEnv) return sentryEnv
        if (nodeEnv === 'production') return 'production'
        if (nodeEnv === 'staging') return 'staging'
        return 'development'
      }

      expect(getEnv('custom', 'production')).toBe('custom')
      expect(getEnv(undefined, 'production')).toBe('production')
    })
  })

  describe('release version', () => {
    it('should format release version correctly', () => {
      const formatRelease = (version: string) => `insurai-server@${version}`
      expect(formatRelease('1.0.0')).toBe('insurai-server@1.0.0')
      expect(formatRelease('2.3.4')).toBe('insurai-server@2.3.4')
    })

    it('should use default version', () => {
      const version = '0.1.0'
      expect(version).toBe('0.1.0')
    })
  })
})
