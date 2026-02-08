/**
 * Email Routes Tests
 *
 * Tests for the email API endpoints (/api/email/*)
 * including token generation/verification, preferences,
 * capture, test emails, and unsubscribe flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// =============================================================================
// MOCKS
// =============================================================================

// Mock email-service module
const mockIsEmailConfigured = vi.fn()
const mockGetEmailPreferences = vi.fn()
const mockUpdateEmailPreferences = vi.fn()
const mockSendWelcomeEmail = vi.fn()
const mockSendTrialReminderEmail = vi.fn()

vi.mock('../services/email-service.js', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
  getEmailPreferences: (...args: unknown[]) => mockGetEmailPreferences(...args),
  updateEmailPreferences: (...args: unknown[]) => mockUpdateEmailPreferences(...args),
  sendWelcomeEmail: (...args: unknown[]) => mockSendWelcomeEmail(...args),
  sendTrialReminderEmail: (...args: unknown[]) => mockSendTrialReminderEmail(...args),
}))

// Mock rate-limit middleware to be passthrough
vi.mock('../middleware/rate-limit.js', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

// Mock logger to suppress output during tests
vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => childLogger,
  }
  return {
    logger: childLogger,
  }
})

// Store original env
const originalEnv = process.env

describe('Email Routes', () => {
  let app: express.Application
  let generateUnsubscribeToken: (email: string) => string
  let verifyUnsubscribeToken: (email: string, token: string) => boolean

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret-key',
    }

    // Reset module cache for fresh imports
    vi.resetModules()

    // Import fresh instance of routes and token utilities
    const emailModule = await import('../routes/email.js')
    generateUnsubscribeToken = emailModule.generateUnsubscribeToken
    verifyUnsubscribeToken = emailModule.verifyUnsubscribeToken

    app = express()
    app.use(express.json())
    app.use('/api/email', emailModule.default)

    // Set up default mock implementations
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetEmailPreferences.mockResolvedValue({
      marketing: true,
      policy_alerts: true,
      expiration_reminders: true,
      weekly_digest: false,
    })
    mockUpdateEmailPreferences.mockResolvedValue(true)
    mockSendWelcomeEmail.mockResolvedValue({ success: true, messageId: 'msg_welcome_123' })
    mockSendTrialReminderEmail.mockResolvedValue({ success: true, messageId: 'msg_trial_456' })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ===========================================================================
  // TOKEN GENERATION
  // ===========================================================================

  describe('generateUnsubscribeToken', () => {
    it('returns a string of exactly 32 characters', () => {
      const token = generateUnsubscribeToken('user@example.com')
      expect(token).toHaveLength(32)
    })

    it('returns only hex characters', () => {
      const token = generateUnsubscribeToken('user@example.com')
      expect(token).toMatch(/^[0-9a-f]{32}$/)
    })

    it('is deterministic - same email produces same token', () => {
      const token1 = generateUnsubscribeToken('user@example.com')
      const token2 = generateUnsubscribeToken('user@example.com')
      expect(token1).toBe(token2)
    })

    it('normalizes email to lowercase', () => {
      const lower = generateUnsubscribeToken('user@example.com')
      const upper = generateUnsubscribeToken('USER@EXAMPLE.COM')
      const mixed = generateUnsubscribeToken('User@Example.COM')
      expect(lower).toBe(upper)
      expect(lower).toBe(mixed)
    })

    it('trims whitespace from email', () => {
      const normal = generateUnsubscribeToken('user@example.com')
      const padded = generateUnsubscribeToken('  user@example.com  ')
      expect(normal).toBe(padded)
    })

    it('normalizes email with both case and whitespace', () => {
      const normal = generateUnsubscribeToken('user@example.com')
      const messy = generateUnsubscribeToken('  USER@EXAMPLE.COM  ')
      expect(normal).toBe(messy)
    })

    it('produces different tokens for different emails', () => {
      const token1 = generateUnsubscribeToken('user1@example.com')
      const token2 = generateUnsubscribeToken('user2@example.com')
      expect(token1).not.toBe(token2)
    })

    it('produces a token for an empty string without throwing', () => {
      const token = generateUnsubscribeToken('')
      expect(token).toHaveLength(32)
      expect(token).toMatch(/^[0-9a-f]{32}$/)
    })
  })

  // ===========================================================================
  // TOKEN VERIFICATION
  // ===========================================================================

  describe('verifyUnsubscribeToken', () => {
    it('returns true for a valid token', () => {
      const email = 'user@example.com'
      const token = generateUnsubscribeToken(email)
      expect(verifyUnsubscribeToken(email, token)).toBe(true)
    })

    it('returns true regardless of email case', () => {
      const token = generateUnsubscribeToken('user@example.com')
      expect(verifyUnsubscribeToken('USER@EXAMPLE.COM', token)).toBe(true)
    })

    it('returns true regardless of email whitespace', () => {
      const token = generateUnsubscribeToken('user@example.com')
      expect(verifyUnsubscribeToken('  user@example.com  ', token)).toBe(true)
    })

    it('returns false for an invalid token', () => {
      expect(verifyUnsubscribeToken('user@example.com', 'invalid-token-value-here-abcdef')).toBe(false)
    })

    it('returns false for a different email', () => {
      const token = generateUnsubscribeToken('user1@example.com')
      expect(verifyUnsubscribeToken('user2@example.com', token)).toBe(false)
    })

    it('returns false for a token with different length (timing-safe)', () => {
      // timingSafeEqual throws when buffers have different lengths,
      // and the catch block should return false
      expect(verifyUnsubscribeToken('user@example.com', 'short')).toBe(false)
    })

    it('returns false for an empty token', () => {
      expect(verifyUnsubscribeToken('user@example.com', '')).toBe(false)
    })

    it('returns false for a token that is too long', () => {
      const token = generateUnsubscribeToken('user@example.com')
      expect(verifyUnsubscribeToken('user@example.com', token + 'extra')).toBe(false)
    })

    it('returns false for a slightly modified valid token', () => {
      const token = generateUnsubscribeToken('user@example.com')
      // Flip the first character
      const modified = (token[0] === 'a' ? 'b' : 'a') + token.substring(1)
      expect(verifyUnsubscribeToken('user@example.com', modified)).toBe(false)
    })
  })

  // ===========================================================================
  // GET /status
  // ===========================================================================

  describe('GET /api/email/status', () => {
    it('returns configured: true when email service is configured', async () => {
      mockIsEmailConfigured.mockReturnValue(true)

      const response = await request(app).get('/api/email/status')

      expect(response.status).toBe(200)
      expect(response.body.configured).toBe(true)
      expect(response.body.provider).toBe('resend')
    })

    it('returns configured: false when email service is not configured', async () => {
      mockIsEmailConfigured.mockReturnValue(false)

      const response = await request(app).get('/api/email/status')

      expect(response.status).toBe(200)
      expect(response.body.configured).toBe(false)
      expect(response.body.provider).toBeNull()
    })
  })

  // ===========================================================================
  // GET /preferences
  // ===========================================================================

  describe('GET /api/email/preferences', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const response = await request(app).get('/api/email/preferences')

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Unauthorized')
    })

    it('returns 401 when Authorization header is not Bearer', async () => {
      const response = await request(app)
        .get('/api/email/preferences')
        .set('Authorization', 'Basic abc123')

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Unauthorized')
    })

    it('returns 401 when x-user-id header is missing', async () => {
      const response = await request(app)
        .get('/api/email/preferences')
        .set('Authorization', 'Bearer test-jwt-token')

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('User ID required')
    })

    it('returns preferences on success', async () => {
      const expectedPrefs = {
        marketing: false,
        policy_alerts: true,
        expiration_reminders: true,
        weekly_digest: true,
      }
      mockGetEmailPreferences.mockResolvedValue(expectedPrefs)

      const response = await request(app)
        .get('/api/email/preferences')
        .set('Authorization', 'Bearer test-jwt-token')
        .set('x-user-id', 'user-abc-123')

      expect(response.status).toBe(200)
      expect(response.body.preferences).toEqual(expectedPrefs)
      expect(mockGetEmailPreferences).toHaveBeenCalledWith('user-abc-123')
    })

    it('returns 500 when getEmailPreferences throws', async () => {
      mockGetEmailPreferences.mockRejectedValue(new Error('DB connection failed'))

      const response = await request(app)
        .get('/api/email/preferences')
        .set('Authorization', 'Bearer test-jwt-token')
        .set('x-user-id', 'user-abc-123')

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Failed to get preferences')
    })
  })

  // ===========================================================================
  // PUT /preferences
  // ===========================================================================

  describe('PUT /api/email/preferences', () => {
    it('returns 401 when x-user-id header is missing', async () => {
      const response = await request(app)
        .put('/api/email/preferences')
        .send({ marketing: false })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('User ID required')
    })

    it('returns 400 for invalid body (wrong types)', async () => {
      const response = await request(app)
        .put('/api/email/preferences')
        .set('x-user-id', 'user-abc-123')
        .send({ marketing: 'not-a-boolean' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid preferences')
      expect(response.body.details).toBeDefined()
    })

    it('returns 400 for body with unknown fields only', async () => {
      // Zod strict mode would fail, but emailPreferencesSchema uses optional fields
      // so an object with unrecognized keys passes through (Zod strips them)
      // but an invalid type should fail
      const response = await request(app)
        .put('/api/email/preferences')
        .set('x-user-id', 'user-abc-123')
        .send({ marketing: 123 })

      expect(response.status).toBe(400)
    })

    it('updates preferences successfully', async () => {
      mockUpdateEmailPreferences.mockResolvedValue(true)

      const response = await request(app)
        .put('/api/email/preferences')
        .set('x-user-id', 'user-abc-123')
        .send({ marketing: false, weekly_digest: true })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(mockUpdateEmailPreferences).toHaveBeenCalledWith(
        'user-abc-123',
        expect.objectContaining({ marketing: false, weekly_digest: true })
      )
    })

    it('accepts an empty object (no fields to update)', async () => {
      mockUpdateEmailPreferences.mockResolvedValue(true)

      const response = await request(app)
        .put('/api/email/preferences')
        .set('x-user-id', 'user-abc-123')
        .send({})

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('returns 500 when updateEmailPreferences returns false', async () => {
      mockUpdateEmailPreferences.mockResolvedValue(false)

      const response = await request(app)
        .put('/api/email/preferences')
        .set('x-user-id', 'user-abc-123')
        .send({ marketing: true })

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Failed to update preferences')
    })

    it('returns 500 when updateEmailPreferences throws', async () => {
      mockUpdateEmailPreferences.mockRejectedValue(new Error('DB error'))

      const response = await request(app)
        .put('/api/email/preferences')
        .set('x-user-id', 'user-abc-123')
        .send({ marketing: true })

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Failed to update preferences')
    })
  })

  // ===========================================================================
  // POST /capture
  // ===========================================================================

  describe('POST /api/email/capture', () => {
    it('returns 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/email/capture')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid email')
    })

    it('returns 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: 'not-an-email' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid email')
      expect(response.body.details).toBeDefined()
    })

    it('returns 400 for empty email string', async () => {
      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: '' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid email')
    })

    it('captures email successfully and sends trial reminder', async () => {
      mockIsEmailConfigured.mockReturnValue(true)
      mockSendTrialReminderEmail.mockResolvedValue({ success: true, messageId: 'msg_123' })

      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: 'trial@example.com', source: 'trial' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.message).toBe('Email captured successfully')
      expect(mockSendTrialReminderEmail).toHaveBeenCalledWith('trial@example.com', {
        analysisCount: 1,
      })
    })

    it('captures email without source', async () => {
      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: 'user@example.com' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('succeeds even when email is not configured (skips sending)', async () => {
      mockIsEmailConfigured.mockReturnValue(false)

      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: 'user@example.com' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(mockSendTrialReminderEmail).not.toHaveBeenCalled()
    })

    it('returns 500 when sendTrialReminderEmail throws', async () => {
      mockIsEmailConfigured.mockReturnValue(true)
      mockSendTrialReminderEmail.mockRejectedValue(new Error('SMTP failure'))

      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: 'user@example.com', source: 'landing' })

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Failed to capture email')
    })

    it('accepts valid source values', async () => {
      for (const source of ['trial', 'landing', 'exit_intent']) {
        const response = await request(app)
          .post('/api/email/capture')
          .send({ email: 'user@example.com', source })

        expect(response.status).toBe(200)
      }
    })

    it('returns 400 for invalid source value', async () => {
      const response = await request(app)
        .post('/api/email/capture')
        .send({ email: 'user@example.com', source: 'invalid_source' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid email')
    })
  })

  // ===========================================================================
  // POST /test
  // ===========================================================================

  describe('POST /api/email/test', () => {
    it('returns 401 when x-admin-token header is missing', async () => {
      const response = await request(app)
        .post('/api/email/test')
        .send({ email: 'admin@example.com', type: 'welcome' })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Admin authentication required')
    })

    it('returns 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ type: 'welcome' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid request')
    })

    it('returns 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'bad-email', type: 'welcome' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid request')
    })

    it('returns 400 for missing type', async () => {
      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'admin@example.com' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid request')
    })

    it('returns 400 for invalid type', async () => {
      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'admin@example.com', type: 'policy_expiring' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid request')
    })

    it('sends a welcome test email successfully', async () => {
      mockSendWelcomeEmail.mockResolvedValue({ success: true, messageId: 'msg_welcome_789' })

      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'admin@example.com', type: 'welcome' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.messageId).toBe('msg_welcome_789')
      expect(mockSendWelcomeEmail).toHaveBeenCalledWith('admin@example.com', 'Test User')
    })

    it('sends a trial_reminder test email successfully', async () => {
      mockSendTrialReminderEmail.mockResolvedValue({ success: true, messageId: 'msg_trial_789' })

      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'admin@example.com', type: 'trial_reminder' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.messageId).toBe('msg_trial_789')
      expect(mockSendTrialReminderEmail).toHaveBeenCalledWith('admin@example.com', { analysisCount: 1 })
    })

    it('returns 500 when email send fails', async () => {
      mockSendWelcomeEmail.mockResolvedValue({ success: false, error: 'SMTP timeout' })

      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'admin@example.com', type: 'welcome' })

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('SMTP timeout')
    })

    it('returns 500 when email send throws', async () => {
      mockSendWelcomeEmail.mockRejectedValue(new Error('Connection refused'))

      const response = await request(app)
        .post('/api/email/test')
        .set('x-admin-token', 'admin-secret')
        .send({ email: 'admin@example.com', type: 'welcome' })

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Failed to send test email')
    })
  })

  // ===========================================================================
  // POST /unsubscribe
  // ===========================================================================

  describe('POST /api/email/unsubscribe', () => {
    it('returns 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ token: 'some-token' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Email is required')
    })

    it('returns 400 when email is not a string', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 12345, token: 'some-token' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Email is required')
    })

    it('returns 400 when email is empty string', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: '', token: 'some-token' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Email is required')
    })

    it('returns 401 when token is missing', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'user@example.com' })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Invalid unsubscribe link')
      expect(response.body.message).toContain('unsubscribe link from your email')
    })

    it('returns 401 when token is not a string', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'user@example.com', token: 12345 })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Invalid unsubscribe link')
    })

    it('returns 401 when token is empty string', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'user@example.com', token: '' })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Invalid unsubscribe link')
    })

    it('returns 401 when token is invalid', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'user@example.com', token: 'aaaabbbbccccddddeeeeffffgggghhhh' })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Invalid unsubscribe token')
      expect(response.body.message).toContain('invalid or expired')
    })

    it('returns 401 when token belongs to a different email', async () => {
      const token = generateUnsubscribeToken('other@example.com')

      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'user@example.com', token })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Invalid unsubscribe token')
    })

    it('succeeds with a valid email and token', async () => {
      const email = 'user@example.com'
      const token = generateUnsubscribeToken(email)

      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email, token })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain('Successfully unsubscribed')
    })

    it('succeeds with uppercase email when token was generated with lowercase', async () => {
      const token = generateUnsubscribeToken('user@example.com')

      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'USER@EXAMPLE.COM', token })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('succeeds with whitespace-padded email', async () => {
      const token = generateUnsubscribeToken('user@example.com')

      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: '  user@example.com  ', token })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('returns 401 for token with wrong length (timing-safe catch)', async () => {
      const response = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email: 'user@example.com', token: 'short' })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Invalid unsubscribe token')
    })
  })

  // ===========================================================================
  // GET /unsubscribe-token
  // ===========================================================================

  describe('GET /api/email/unsubscribe-token', () => {
    it('returns 400 when email query parameter is missing', async () => {
      const response = await request(app).get('/api/email/unsubscribe-token')

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Email query parameter required')
    })

    it('generates token in non-production mode without admin token', async () => {
      // NODE_ENV is 'test' so admin token is not required
      const response = await request(app)
        .get('/api/email/unsubscribe-token')
        .query({ email: 'user@example.com' })

      expect(response.status).toBe(200)
      expect(response.body.email).toBe('user@example.com')
      expect(response.body.token).toHaveLength(32)
      expect(response.body.token).toMatch(/^[0-9a-f]{32}$/)
      expect(response.body.unsubscribeUrl).toContain('user%40example.com')
      expect(response.body.unsubscribeUrl).toContain(response.body.token)
    })

    it('normalizes the email in the response', async () => {
      const response = await request(app)
        .get('/api/email/unsubscribe-token')
        .query({ email: '  USER@EXAMPLE.COM  ' })

      expect(response.status).toBe(200)
      expect(response.body.email).toBe('user@example.com')
    })

    it('returns a token that verifies correctly', async () => {
      const response = await request(app)
        .get('/api/email/unsubscribe-token')
        .query({ email: 'user@example.com' })

      expect(response.status).toBe(200)
      const isValid = verifyUnsubscribeToken('user@example.com', response.body.token)
      expect(isValid).toBe(true)
    })

    it('returns 401 in production without admin token', async () => {
      // Reload module with production NODE_ENV
      process.env.NODE_ENV = 'production'
      vi.resetModules()

      const emailModule = await import('../routes/email.js')
      const prodApp = express()
      prodApp.use(express.json())
      prodApp.use('/api/email', emailModule.default)

      const response = await request(prodApp)
        .get('/api/email/unsubscribe-token')
        .query({ email: 'user@example.com' })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Admin authentication required')
    })

    it('succeeds in production with admin token', async () => {
      process.env.NODE_ENV = 'production'
      vi.resetModules()

      const emailModule = await import('../routes/email.js')
      const prodApp = express()
      prodApp.use(express.json())
      prodApp.use('/api/email', emailModule.default)

      const response = await request(prodApp)
        .get('/api/email/unsubscribe-token')
        .set('x-admin-token', 'admin-secret')
        .query({ email: 'user@example.com' })

      expect(response.status).toBe(200)
      expect(response.body.token).toHaveLength(32)
    })
  })

  // ===========================================================================
  // SECRET FALLBACK BEHAVIOR
  // ===========================================================================

  describe('Secret fallback chain', () => {
    it('uses UNSUBSCRIBE_SECRET when set', async () => {
      // The beforeEach already sets UNSUBSCRIBE_SECRET
      const token = generateUnsubscribeToken('test@example.com')
      expect(token).toHaveLength(32)
      // Verify it is stable within this secret
      expect(generateUnsubscribeToken('test@example.com')).toBe(token)
    })

    it('produces different tokens with different secrets', async () => {
      const token1 = generateUnsubscribeToken('test@example.com')

      // Reset with a different secret
      process.env.UNSUBSCRIBE_SECRET = 'different-secret-key'
      vi.resetModules()
      const emailModule2 = await import('../routes/email.js')
      const token2 = emailModule2.generateUnsubscribeToken('test@example.com')

      expect(token1).not.toBe(token2)
    })

    it('falls back to ADMIN_JWT_SECRET when UNSUBSCRIBE_SECRET is not set', async () => {
      delete process.env.UNSUBSCRIBE_SECRET
      process.env.ADMIN_JWT_SECRET = 'admin-jwt-fallback-secret'
      vi.resetModules()

      const emailModule2 = await import('../routes/email.js')
      const token = emailModule2.generateUnsubscribeToken('test@example.com')
      expect(token).toHaveLength(32)
      expect(token).toMatch(/^[0-9a-f]{32}$/)
    })
  })

  // ===========================================================================
  // INTEGRATION: capture -> unsubscribe roundtrip
  // ===========================================================================

  describe('Capture and unsubscribe roundtrip', () => {
    it('can generate a token and use it to unsubscribe', async () => {
      const email = 'roundtrip@example.com'

      // Step 1: Generate token
      const tokenResponse = await request(app)
        .get('/api/email/unsubscribe-token')
        .query({ email })

      expect(tokenResponse.status).toBe(200)
      const { token } = tokenResponse.body

      // Step 2: Use token to unsubscribe
      const unsubResponse = await request(app)
        .post('/api/email/unsubscribe')
        .send({ email, token })

      expect(unsubResponse.status).toBe(200)
      expect(unsubResponse.body.success).toBe(true)
    })
  })
})
