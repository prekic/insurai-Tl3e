/**
 * Server Sentry Tests
 * Tests for server/lib/sentry.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @sentry/node
const { mockInit, mockSetupExpressErrorHandler, mockCaptureException, mockCaptureMessage, mockSetUser, mockSetContext } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockSetupExpressErrorHandler: vi.fn(),
  mockCaptureException: vi.fn().mockReturnValue('event-id-123'),
  mockCaptureMessage: vi.fn(),
  mockSetUser: vi.fn(),
  mockSetContext: vi.fn(),
}))

vi.mock('@sentry/node', () => ({
  init: mockInit,
  setupExpressErrorHandler: mockSetupExpressErrorHandler,
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  setUser: mockSetUser,
  setContext: mockSetContext,
}))

describe('Server Sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear cached modules to test different env configs
    vi.resetModules()
  })

  describe('initServerSentry', () => {
    it('should not initialize when DSN is not set', async () => {
      delete process.env.SENTRY_DSN
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).not.toHaveBeenCalled()
    })

    it('should warn in production when DSN not set', async () => {
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'production'
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DSN not configured'))
      warnSpy.mockRestore()
      process.env.NODE_ENV = 'test'
    })

    it('should initialize with DSN in production', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn: 'https://test@sentry.io/123',
        environment: 'production',
      }))
      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should use custom SENTRY_ENVIRONMENT', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.SENTRY_ENVIRONMENT = 'staging'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment: 'staging',
      }))
      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      delete process.env.SENTRY_ENVIRONMENT
    })

    it('should set beforeSend that sanitizes headers', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()

      const initCall = mockInit.mock.calls[0][0]
      expect(initCall.beforeSend).toBeDefined()

      // Test header sanitization
      const event = {
        request: {
          headers: {
            'authorization': 'Bearer secret',
            'x-api-key': 'secret-key',
            'cookie': 'session=abc',
            'content-type': 'application/json',
          },
        },
      }
      const result = initCall.beforeSend(event)
      expect(result.request.headers.authorization).toBeUndefined()
      expect(result.request.headers['x-api-key']).toBeUndefined()
      expect(result.request.headers.cookie).toBeUndefined()
      expect(result.request.headers['content-type']).toBe('application/json')

      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should sanitize sensitive body data', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()

      const initCall = mockInit.mock.calls[0][0]
      const event = {
        request: {
          data: JSON.stringify({
            apiKey: 'secret',
            password: 'p@ss',
            token: 'tok123',
            content: 'x'.repeat(600),
          }),
        },
      }
      const result = initCall.beforeSend(event)
      const parsed = JSON.parse(result.request.data)
      expect(parsed.apiKey).toBe('[REDACTED]')
      expect(parsed.password).toBe('[REDACTED]')
      expect(parsed.token).toBe('[REDACTED]')
      expect(parsed.content).toContain('...[truncated]')
      expect(parsed.content.length).toBeLessThan(600)

      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should handle non-JSON body data in beforeSend', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()

      const initCall = mockInit.mock.calls[0][0]
      const event = {
        request: {
          data: 'not-json-data',
        },
      }
      // Should not throw
      const result = initCall.beforeSend(event)
      expect(result.request.data).toBe('not-json-data')

      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should handle body data that is already an object', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()

      const initCall = mockInit.mock.calls[0][0]
      const event = {
        request: {
          data: { apiKey: 'secret', message: 'hello' },
        },
      }
      const result = initCall.beforeSend(event)
      const parsed = JSON.parse(result.request.data)
      expect(parsed.apiKey).toBe('[REDACTED]')
      expect(parsed.message).toBe('hello')

      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should handle short content in body data', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()

      const initCall = mockInit.mock.calls[0][0]
      const event = {
        request: {
          data: JSON.stringify({ content: 'short content' }),
        },
      }
      const result = initCall.beforeSend(event)
      const parsed = JSON.parse(result.request.data)
      expect(parsed.content).toBe('short content')

      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should handle event without request', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      process.env.NODE_ENV = 'production'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()

      const initCall = mockInit.mock.calls[0][0]
      const event = {}
      const result = initCall.beforeSend(event)
      expect(result).toEqual({})

      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })
  })

  describe('setupSentryErrorHandler', () => {
    it('should skip when no DSN', async () => {
      delete process.env.SENTRY_DSN
      const { setupSentryErrorHandler } = await import('../lib/sentry.js')
      const mockApp = {} as any
      setupSentryErrorHandler(mockApp)
      expect(mockSetupExpressErrorHandler).not.toHaveBeenCalled()
    })

    it('should setup error handler when DSN exists', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const { setupSentryErrorHandler } = await import('../lib/sentry.js')
      const mockApp = {} as any
      setupSentryErrorHandler(mockApp)
      expect(mockSetupExpressErrorHandler).toHaveBeenCalledWith(mockApp)
      delete process.env.SENTRY_DSN
    })
  })

  describe('captureServerError', () => {
    it('should log to console when no DSN', async () => {
      delete process.env.SENTRY_DSN
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { captureServerError } = await import('../lib/sentry.js')
      const error = new Error('test error')
      const result = captureServerError(error, { context: 'test' })
      expect(result).toBeUndefined()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should capture exception with Sentry when DSN exists', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const { captureServerError } = await import('../lib/sentry.js')
      const error = new Error('test error')
      const result = captureServerError(error, { userId: '123' })
      expect(mockCaptureException).toHaveBeenCalledWith(error, { extra: { userId: '123' } })
      expect(result).toBe('event-id-123')
      delete process.env.SENTRY_DSN
    })
  })

  describe('captureServerMessage', () => {
    it('should log to console when no DSN', async () => {
      delete process.env.SENTRY_DSN
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { captureServerMessage } = await import('../lib/sentry.js')
      captureServerMessage('test message', 'warning')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING'))
      logSpy.mockRestore()
    })

    it('should capture message with Sentry when DSN exists', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const { captureServerMessage } = await import('../lib/sentry.js')
      captureServerMessage('test message', 'error')
      expect(mockCaptureMessage).toHaveBeenCalledWith('test message', 'error')
      delete process.env.SENTRY_DSN
    })

    it('should default to info level', async () => {
      delete process.env.SENTRY_DSN
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { captureServerMessage } = await import('../lib/sentry.js')
      captureServerMessage('test message')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'))
      logSpy.mockRestore()
    })
  })

  describe('setServerUser', () => {
    it('should skip when no DSN', async () => {
      delete process.env.SENTRY_DSN
      const { setServerUser } = await import('../lib/sentry.js')
      setServerUser({ id: '123', email: 'test@test.com' })
      expect(mockSetUser).not.toHaveBeenCalled()
    })

    it('should set user when DSN exists', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const { setServerUser } = await import('../lib/sentry.js')
      setServerUser({ id: '123', email: 'test@test.com' })
      expect(mockSetUser).toHaveBeenCalledWith({ id: '123', email: 'test@test.com' })
      delete process.env.SENTRY_DSN
    })

    it('should clear user when null', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const { setServerUser } = await import('../lib/sentry.js')
      setServerUser(null)
      expect(mockSetUser).toHaveBeenCalledWith(null)
      delete process.env.SENTRY_DSN
    })
  })

  describe('setServerContext', () => {
    it('should skip when no DSN', async () => {
      delete process.env.SENTRY_DSN
      const { setServerContext } = await import('../lib/sentry.js')
      setServerContext('request', { id: '123' })
      expect(mockSetContext).not.toHaveBeenCalled()
    })

    it('should set context when DSN exists', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const { setServerContext } = await import('../lib/sentry.js')
      setServerContext('request', { id: '123' })
      expect(mockSetContext).toHaveBeenCalledWith('request', { id: '123' })
      delete process.env.SENTRY_DSN
    })
  })

  describe('environment detection', () => {
    it('should use development by default', async () => {
      delete process.env.NODE_ENV
      delete process.env.SENTRY_ENVIRONMENT
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment: 'development',
      }))
      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
    })

    it('should detect staging environment', async () => {
      process.env.NODE_ENV = 'staging'
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment: 'staging',
        tracesSampleRate: 0.5,
      }))
      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })
  })

  describe('sample rates', () => {
    it('should use 10% for production', async () => {
      process.env.NODE_ENV = 'production'
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        tracesSampleRate: 0.1,
      }))
      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })

    it('should use 100% for development', async () => {
      process.env.NODE_ENV = 'development'
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initServerSentry } = await import('../lib/sentry.js')
      initServerSentry()
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        tracesSampleRate: 1.0,
      }))
      logSpy.mockRestore()
      delete process.env.SENTRY_DSN
      process.env.NODE_ENV = 'test'
    })
  })

  describe('Sentry export', () => {
    it('should re-export Sentry module', async () => {
      const { Sentry } = await import('../lib/sentry.js')
      expect(Sentry).toBeDefined()
      expect(Sentry.init).toBeDefined()
      expect(Sentry.captureException).toBeDefined()
    })
  })
})
