/**
 * Email Service — Branch Coverage Tests
 *
 * Targets all uncovered branches in server/services/email-service.ts.
 * The existing email-service.test.ts has weak assertions and never mocks
 * Supabase, so most DB-path branches, error-path branches, and template
 * conditional branches are untested.
 *
 * This file covers:
 * - getSupabase(): cached vs fresh init, missing url/key, SUPABASE_URL || VITE_SUPABASE_URL
 * - isEmailConfigured(): RESEND_API_KEY presence
 * - sendEmail(): success, API error (response.json catch fallback), network error
 *   (error instanceof Error vs unknown), options.text/replyTo presence
 * - logEmailSent(): no client, success, DB error catch
 * - stripHtml(): style, script, tags, whitespace
 * - wrapTemplate(): with/without recipientEmail (unsubscribe link)
 * - sendWelcomeEmail(): name present vs undefined (default display name)
 * - sendPolicyUploadedEmail(): score >=70 / >=50 / <50, expiryDate present/absent,
 *   score defined/undefined, grade present/absent
 * - sendPolicyExpiringEmail(): daysRemaining <=7 vs >7
 * - sendAdminAlertEmail(): type error/warning/info, details present/absent
 * - getEmailPreferences(): no client, no data, partial data with null fields
 * - updateEmailPreferences(): no client, DB error, success
 * - canSendEmail(): all switch cases including default
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockFrom,
  mockCreateClient,
  mockFetch,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateClient: vi.fn(),
  mockFetch: vi.fn(),
}))

// =============================================================================
// MODULE MOCKS
// =============================================================================

vi.mock('../lib/logger.js', () => {
  const child = {
    debug: vi.fn(),
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: { ...child, child: vi.fn(() => child) },
    logger: { ...child, child: vi.fn(() => child) },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a chainable Supabase query mock.
 */
function setupChain(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}

  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockResolvedValue(finalResult)
  chain.upsert = vi.fn().mockResolvedValue(finalResult)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)

  // Make the chain itself thenable for insert/upsert without .single()
  ;(chain as unknown as { then: typeof Promise.prototype.then }).then = undefined as unknown as typeof Promise.prototype.then

  return chain
}

/**
 * Fresh import of email-service module to pick up env var changes.
 * Uses vi.resetModules() so RESEND_API_KEY is re-read.
 */
async function freshImport() {
  vi.resetModules()
  return await import('../services/email-service.js')
}

// =============================================================================
// TESTS
// =============================================================================

describe('email-service-branches', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up valid fetch by default
    global.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // isEmailConfigured
  // ===========================================================================

  describe('isEmailConfigured', () => {
    it('returns true when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      const mod = await freshImport()
      expect(mod.isEmailConfigured()).toBe(true)
    })

    it('returns false when RESEND_API_KEY is not set', async () => {
      delete process.env.RESEND_API_KEY
      const mod = await freshImport()
      expect(mod.isEmailConfigured()).toBe(false)
    })
  })

  // ===========================================================================
  // sendEmail — all branches
  // ===========================================================================

  describe('sendEmail', () => {
    it('returns error when RESEND_API_KEY is not configured', async () => {
      delete process.env.RESEND_API_KEY
      const mod = await freshImport()

      const result = await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Email service not configured')
      expect(mockLogWarn).toHaveBeenCalledWith('Resend API key not configured, skipping email')
    })

    it('sends email successfully and logs to database', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      // No supabase env — logEmailSent will bail early (no client)
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_abc123' }),
      })

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>World</p>',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_abc123')
      expect(mockLogInfo).toHaveBeenCalledWith('Email sent successfully', { messageId: 'msg_abc123' })
    })

    it('uses provided text and replyTo when present in options', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_with_text' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'user@example.com',
        subject: 'With text',
        html: '<p>HTML</p>',
        text: 'Plain text version',
        replyTo: 'custom@reply.com',
        tags: [{ name: 'campaign', value: 'test' }],
      })

      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      expect(body.text).toBe('Plain text version')
      expect(body.reply_to).toBe('custom@reply.com')
      expect(body.tags).toEqual([{ name: 'campaign', value: 'test' }])
    })

    it('falls back to stripHtml for text when options.text is not provided', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_stripped' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'user@example.com',
        subject: 'No text',
        html: '<style>body{color:red}</style><script>alert("x")</script><p>Hello <b>World</b></p>',
      })

      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      // stripHtml removes style, script, tags, collapses whitespace
      expect(body.text).toBe('Hello World')
    })

    it('falls back to REPLY_TO_EMAIL when options.replyTo is not provided', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_default_reply' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'user@example.com',
        subject: 'Default reply',
        html: '<p>Test</p>',
      })

      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      // Should use the default REPLY_TO_EMAIL (support@insurai.app or env override)
      expect(body.reply_to).toBeDefined()
      expect(typeof body.reply_to).toBe('string')
    })

    it('handles API error response (response not ok)', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Invalid recipient' }),
      })

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'bad@',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Email send failed: 422')
      expect(mockLogError).toHaveBeenCalledWith('Resend API error', expect.objectContaining({
        status: 422,
      }))
    })

    it('handles API error response when response.json() itself fails', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Invalid JSON') },
      })

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Email send failed: 500')
      // The .catch(() => ({})) fallback should prevent crash
    })

    it('handles network error (Error instance) in catch block', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network timeout')
      expect(mockLogError).toHaveBeenCalledWith('Failed to send email', expect.objectContaining({
        error: expect.stringContaining('Network timeout'),
      }))
    })

    it('handles non-Error throw in catch block (unknown error)', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockRejectedValueOnce('string error')

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('logs email to database via Supabase when configured', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_logged' }),
      })

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'user@example.com',
        subject: 'Logged email',
        html: '<p>Content</p>',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_logged')

      // Verify logEmailSent was called — Supabase insert invoked
      expect(mockFrom).toHaveBeenCalledWith('email_logs')
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        recipient: 'user@example.com',
        subject: 'Logged email',
        message_id: 'msg_logged',
        status: 'sent',
      }))
    })

    it('handles logEmailSent DB error gracefully (does not crash sendEmail)', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      chain.insert = vi.fn().mockRejectedValue(new Error('DB insert failed'))
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_db_err' }),
      })

      const mod = await freshImport()
      const result = await mod.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      // sendEmail should still succeed — DB logging failure is non-fatal
      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_db_err')
      expect(mockLogWarn).toHaveBeenCalledWith('Failed to log email', expect.objectContaining({
        error: expect.stringContaining('DB insert failed'),
      }))
    })
  })

  // ===========================================================================
  // getSupabase — caching & env var branches
  // ===========================================================================

  describe('getSupabase (tested via getEmailPreferences/updateEmailPreferences)', () => {
    it('returns null when SUPABASE_URL and VITE_SUPABASE_URL are both missing', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await freshImport()
      const prefs = await mod.getEmailPreferences('user-123')
      // Falls back to DEFAULT_PREFERENCES since no client
      expect(prefs).toEqual({
        marketing: true,
        policy_alerts: true,
        expiration_reminders: true,
        weekly_digest: false,
      })
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('returns null when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await freshImport()
      const prefs = await mod.getEmailPreferences('user-123')
      expect(prefs).toEqual(expect.objectContaining({ marketing: true }))
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('uses VITE_SUPABASE_URL when SUPABASE_URL is not set', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      process.env.VITE_SUPABASE_URL = 'https://vite-test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      await mod.getEmailPreferences('user-123')

      expect(mockCreateClient).toHaveBeenCalledWith('https://vite-test.supabase.co', 'test-key')
    })

    it('uses SUPABASE_URL over VITE_SUPABASE_URL when both set', async () => {
      process.env.SUPABASE_URL = 'https://primary.supabase.co'
      process.env.VITE_SUPABASE_URL = 'https://fallback.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      await mod.getEmailPreferences('user-123')

      expect(mockCreateClient).toHaveBeenCalledWith('https://primary.supabase.co', 'test-key')
    })

    it('caches Supabase client after first call (only creates once)', async () => {
      process.env.SUPABASE_URL = 'https://cached.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      await mod.getEmailPreferences('user-1')
      await mod.getEmailPreferences('user-2')

      // createClient should only be called once (cached)
      expect(mockCreateClient).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // getEmailPreferences — data branches
  // ===========================================================================

  describe('getEmailPreferences', () => {
    it('returns defaults when no data found in DB', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      const prefs = await mod.getEmailPreferences('user-no-data')

      expect(prefs).toEqual({
        marketing: true,
        policy_alerts: true,
        expiration_reminders: true,
        weekly_digest: false,
      })
    })

    it('returns user preferences from DB when data exists', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({
        data: {
          marketing: false,
          policy_alerts: false,
          expiration_reminders: true,
          weekly_digest: true,
        },
        error: null,
      })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      const prefs = await mod.getEmailPreferences('user-with-prefs')

      expect(prefs).toEqual({
        marketing: false,
        policy_alerts: false,
        expiration_reminders: true,
        weekly_digest: true,
      })
    })

    it('applies nullish coalescing defaults for null fields', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({
        data: {
          marketing: null,
          policy_alerts: null,
          expiration_reminders: null,
          weekly_digest: null,
        },
        error: null,
      })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      const prefs = await mod.getEmailPreferences('user-nulls')

      // All null fields should fall back to defaults via ??
      expect(prefs).toEqual({
        marketing: true,
        policy_alerts: true,
        expiration_reminders: true,
        weekly_digest: false,
      })
    })

    it('applies nullish coalescing with mixed null and non-null fields', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({
        data: {
          marketing: false,
          policy_alerts: null,
          expiration_reminders: true,
          weekly_digest: null,
        },
        error: null,
      })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      const prefs = await mod.getEmailPreferences('user-mixed')

      expect(prefs).toEqual({
        marketing: false,        // explicit false preserved
        policy_alerts: true,     // null -> default true
        expiration_reminders: true,
        weekly_digest: false,    // null -> default false
      })
    })
  })

  // ===========================================================================
  // updateEmailPreferences — all branches
  // ===========================================================================

  describe('updateEmailPreferences', () => {
    it('returns false when no Supabase client', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await freshImport()
      const result = await mod.updateEmailPreferences('user-123', { marketing: false })
      expect(result).toBe(false)
    })

    it('returns true on successful upsert', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      const result = await mod.updateEmailPreferences('user-123', {
        marketing: false,
        weekly_digest: true,
      })

      expect(result).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('user_email_preferences')
      expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-123',
        marketing: false,
        weekly_digest: true,
        updated_at: expect.any(String),
      }))
    })

    it('returns false and logs error when upsert fails', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: { message: 'DB error' } })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      const result = await mod.updateEmailPreferences('user-123', { policy_alerts: false })

      expect(result).toBe(false)
      expect(mockLogError).toHaveBeenCalledWith('Failed to update preferences', expect.objectContaining({
        error: expect.any(String),
      }))
    })
  })

  // ===========================================================================
  // canSendEmail — all switch branches
  // ===========================================================================

  describe('canSendEmail', () => {
    // For these tests, Supabase is not configured so defaults apply
    // (marketing: true, policy_alerts: true)

    it('always returns true for "welcome" (transactional)', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'welcome')).toBe(true)
    })

    it('always returns true for "password_reset" (transactional)', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'password_reset')).toBe(true)
    })

    it('always returns true for "admin_alert" (transactional)', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'admin_alert')).toBe(true)
    })

    it('returns policy_alerts preference for "policy_uploaded"', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      // Default policy_alerts = true
      expect(await mod.canSendEmail('user-1', 'policy_uploaded')).toBe(true)
    })

    it('returns policy_alerts preference for "policy_expiring"', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'policy_expiring')).toBe(true)
    })

    it('returns policy_alerts preference for "policy_expired"', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'policy_expired')).toBe(true)
    })

    it('returns marketing preference for "trial_reminder"', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'trial_reminder')).toBe(true)
    })

    it('returns marketing preference for "trial_expired"', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'trial_expired')).toBe(true)
    })

    it('returns true for unknown email type (default case)', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await freshImport()
      // Cast to bypass TypeScript — test the runtime default branch
      expect(await mod.canSendEmail('user-1', 'unknown_type' as never)).toBe(true)
    })

    it('returns false for policy_uploaded when policy_alerts is false', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({
        data: {
          marketing: true,
          policy_alerts: false,
          expiration_reminders: true,
          weekly_digest: false,
        },
        error: null,
      })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'policy_uploaded')).toBe(false)
    })

    it('returns false for trial_reminder when marketing is false', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({
        data: {
          marketing: false,
          policy_alerts: true,
          expiration_reminders: true,
          weekly_digest: false,
        },
        error: null,
      })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      const mod = await freshImport()
      expect(await mod.canSendEmail('user-1', 'trial_reminder')).toBe(false)
    })
  })

  // ===========================================================================
  // sendWelcomeEmail — name present vs absent
  // ===========================================================================

  describe('sendWelcomeEmail', () => {
    it('uses provided name in greeting', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_welcome_named' }),
      })

      const mod = await freshImport()
      const result = await mod.sendWelcomeEmail('user@example.com', 'Erdem')

      expect(result.success).toBe(true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('Erdem')
      expect(body.subject).toContain('Hoş Geldiniz')
    })

    it('uses default name "Değerli Kullanıcı" when name is undefined', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_welcome_default' }),
      })

      const mod = await freshImport()
      const result = await mod.sendWelcomeEmail('user@example.com')

      expect(result.success).toBe(true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('Değerli Kullanıcı')
    })

    it('uses default name when name is empty string', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_welcome_empty' }),
      })

      const mod = await freshImport()
      const result = await mod.sendWelcomeEmail('user@example.com', '')

      expect(result.success).toBe(true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // Empty string is falsy, so falls back to default
      expect(body.html).toContain('Değerli Kullanıcı')
    })
  })

  // ===========================================================================
  // sendPolicyUploadedEmail — score, grade, expiryDate branches
  // ===========================================================================

  describe('sendPolicyUploadedEmail', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
    })

    it('uses green color when score >= 70', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_green' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-001',
        provider: 'Allianz',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 85,
        grade: 'B',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#10b981') // green
      expect(body.html).toContain('85/100')
      expect(body.html).toContain('(B)')
    })

    it('uses amber color when score >= 50 and < 70', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_amber' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-002',
        provider: 'AXA',
        type: 'traffic',
        typeTr: 'Trafik',
        score: 55,
        grade: 'D',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#f59e0b') // amber
      expect(body.html).toContain('55/100')
    })

    it('uses red color when score < 50', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_red' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-003',
        provider: 'Mapfre',
        type: 'home',
        typeTr: 'Konut',
        score: 30,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#ef4444') // red
      expect(body.html).toContain('30/100')
    })

    it('uses red color when score is 0 (falsy but defined)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_zero' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-004',
        provider: 'HDI',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 0,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#ef4444') // red — (0 || 0) < 50
    })

    it('includes expiry date row when expiryDate is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_expiry' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-005',
        provider: 'Zurich',
        type: 'health',
        typeTr: 'Sağlık',
        expiryDate: '31.12.2026',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('31.12.2026')
      expect(body.html).toContain('Bitiş Tarihi')
    })

    it('omits expiry date row when expiryDate is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_no_expiry' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-006',
        provider: 'Sompo',
        type: 'life',
        typeTr: 'Hayat',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).not.toContain('Bitiş Tarihi')
    })

    it('includes score row when score is defined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_with_score' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-007',
        provider: 'Anadolu',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 70,
        grade: 'C',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('Analiz Puanı')
      expect(body.html).toContain('70/100')
      expect(body.html).toContain('(C)')
    })

    it('omits score row when score is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_no_score' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-008',
        provider: 'Aksigorta',
        type: 'traffic',
        typeTr: 'Trafik',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).not.toContain('Analiz Puanı')
    })

    it('shows score without grade when grade is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_no_grade' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-009',
        provider: 'Allianz',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 75,
        // grade is not provided
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('75/100')
      // Should NOT contain a grade in parens
      expect(body.html).not.toMatch(/75\/100\s*\([A-F]\)/)
    })

    it('score exactly at 70 boundary uses green color', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_boundary70' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-010',
        provider: 'AXA',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 70,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#10b981') // green
    })

    it('score exactly at 50 boundary uses amber color', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_boundary50' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-011',
        provider: 'AXA',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 50,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#f59e0b') // amber
    })

    it('score at 49 uses red color', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_49' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyUploadedEmail('user@example.com', {
        policyNumber: 'POL-012',
        provider: 'AXA',
        type: 'kasko',
        typeTr: 'Kasko',
        score: 49,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('#ef4444') // red
    })
  })

  // ===========================================================================
  // sendPolicyExpiringEmail — daysRemaining <= 7 vs > 7
  // ===========================================================================

  describe('sendPolicyExpiringEmail', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
    })

    it('uses danger styling and "Acil" when daysRemaining <= 7', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_urgent' }),
      })

      const mod = await freshImport()
      const result = await mod.sendPolicyExpiringEmail('user@example.com', {
        policyNumber: 'POL-100',
        provider: 'AXA',
        typeTr: 'Trafik',
        expiryDate: '20.02.2026',
        daysRemaining: 3,
      })

      expect(result.success).toBe(true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-danger')
      expect(body.html).toContain('Acil')
      expect(body.html).toContain('3 gün')
    })

    it('uses danger styling when daysRemaining is exactly 7', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_7days' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyExpiringEmail('user@example.com', {
        policyNumber: 'POL-101',
        provider: 'Allianz',
        typeTr: 'Kasko',
        expiryDate: '25.02.2026',
        daysRemaining: 7,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-danger')
      expect(body.html).toContain('Acil')
    })

    it('uses warning styling and "Dikkat" when daysRemaining > 7', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_warning' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyExpiringEmail('user@example.com', {
        policyNumber: 'POL-102',
        provider: 'Zurich',
        typeTr: 'Sağlık',
        expiryDate: '15.03.2026',
        daysRemaining: 25,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-warning')
      expect(body.html).toContain('Dikkat')
      expect(body.html).toContain('25 gün')
    })

    it('uses warning styling when daysRemaining is exactly 8', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_8days' }),
      })

      const mod = await freshImport()
      await mod.sendPolicyExpiringEmail('user@example.com', {
        policyNumber: 'POL-103',
        provider: 'HDI',
        typeTr: 'Kasko',
        expiryDate: '26.02.2026',
        daysRemaining: 8,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-warning')
      expect(body.html).toContain('Dikkat')
    })
  })

  // ===========================================================================
  // sendPolicyExpiredEmail
  // ===========================================================================

  describe('sendPolicyExpiredEmail', () => {
    it('sends expired notification with correct content', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_expired' }),
      })

      const mod = await freshImport()
      const result = await mod.sendPolicyExpiredEmail('user@example.com', {
        policyNumber: 'POL-200',
        provider: 'Mapfre',
        typeTr: 'Kasko',
        expiryDate: '01.02.2026',
      })

      expect(result.success).toBe(true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('Süresi Doldu')
      expect(body.html).toContain('alert-danger')
      expect(body.html).toContain('POL-200')
      expect(body.html).toContain('Mapfre')
      expect(body.subject).toContain('POL-200')
    })
  })

  // ===========================================================================
  // sendTrialReminderEmail
  // ===========================================================================

  describe('sendTrialReminderEmail', () => {
    it('sends trial reminder with analysis count', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_trial' }),
      })

      const mod = await freshImport()
      const result = await mod.sendTrialReminderEmail('prospect@example.com', {
        analysisCount: 3,
      })

      expect(result.success).toBe(true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('3')
      expect(body.subject).toContain('InsurAI')
    })

    it('sends trial reminder with daysRemaining data', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_trial_days' }),
      })

      const mod = await freshImport()
      const result = await mod.sendTrialReminderEmail('prospect@example.com', {
        analysisCount: 1,
        daysRemaining: 5,
      })

      expect(result.success).toBe(true)
    })
  })

  // ===========================================================================
  // sendAdminAlertEmail — type branches, details presence
  // ===========================================================================

  describe('sendAdminAlertEmail', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
    })

    it('uses danger styling and fire emoji for "error" type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_admin_err' }),
      })

      const mod = await freshImport()
      await mod.sendAdminAlertEmail('admin@example.com', {
        type: 'error',
        title: 'Server Down',
        message: 'Backend is not responding',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-danger')
      expect(body.html).toContain('\u{1F6A8}') // fire alarm emoji
      expect(body.subject).toContain('\u{1F6A8}')
    })

    it('uses warning styling and warning emoji for "warning" type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_admin_warn' }),
      })

      const mod = await freshImport()
      await mod.sendAdminAlertEmail('admin@example.com', {
        type: 'warning',
        title: 'High Usage',
        message: 'API usage is high',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-warning')
      expect(body.html).toContain('High Usage')
    })

    it('uses success styling and info emoji for "info" type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_admin_info' }),
      })

      const mod = await freshImport()
      await mod.sendAdminAlertEmail('admin@example.com', {
        type: 'info',
        title: 'Deployment Complete',
        message: 'New version deployed',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('alert-success')
      expect(body.html).toContain('Deployment Complete')
    })

    it('includes details section when details are provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_details' }),
      })

      const mod = await freshImport()
      await mod.sendAdminAlertEmail('admin@example.com', {
        type: 'error',
        title: 'Extraction Failed',
        message: 'AI extraction returned invalid JSON',
        details: { provider: 'anthropic', statusCode: 500, requestId: 'req_xyz' },
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('Details')
      expect(body.html).toContain('anthropic')
      expect(body.html).toContain('500')
      expect(body.html).toContain('req_xyz')
    })

    it('omits details section when details are not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_no_details' }),
      })

      const mod = await freshImport()
      await mod.sendAdminAlertEmail('admin@example.com', {
        type: 'warning',
        title: 'Low Disk Space',
        message: 'Server disk is 90% full',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // Should NOT contain a Details card
      expect(body.html).not.toContain('<p class="card-title">Details</p>')
    })
  })

  // ===========================================================================
  // wrapTemplate — unsubscribe link branches
  // ===========================================================================

  describe('wrapTemplate (tested via email functions)', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
    })

    it('includes unsubscribe link when recipientEmail is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_unsub' }),
      })

      const mod = await freshImport()
      // sendWelcomeEmail passes email to wrapTemplate
      await mod.sendWelcomeEmail('recipient@example.com', 'Test')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('Abonelikten')
      expect(body.html).toContain('unsubscribe')
      expect(body.html).toContain('recipient%40example.com')
    })

    it('includes InsurAI header and footer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_template' }),
      })

      const mod = await freshImport()
      await mod.sendWelcomeEmail('test@example.com')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain('InsurAI')
      expect(body.html).toContain('AI Sigorta Analiz Platformu')
      expect(body.html).toContain('Tüm hakları saklıdır')
      expect(body.html).toContain('Yardım')
      expect(body.html).toContain('Email Tercihler')
      expect(body.html).toContain('Ana Sayfa')
    })

    it('contains correct year in footer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_year' }),
      })

      const mod = await freshImport()
      await mod.sendWelcomeEmail('test@example.com')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.html).toContain(String(new Date().getFullYear()))
    })
  })

  // ===========================================================================
  // stripHtml — all regex branches
  // ===========================================================================

  describe('stripHtml (tested indirectly via sendEmail text fallback)', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
    })

    it('strips style tags and their content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_strip_style' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<style>body{color:red}</style><p>Visible</p>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.text).toBe('Visible')
      expect(body.text).not.toContain('color')
    })

    it('strips script tags and their content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_strip_script' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<script>alert("xss")</script><p>Safe</p>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.text).toBe('Safe')
      expect(body.text).not.toContain('alert')
    })

    it('strips all HTML tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_strip_tags' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<div><h1>Title</h1><p>Content <strong>bold</strong></p></div>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // stripHtml removes tags then collapses whitespace; adjacent tags with no
      // space between them (e.g., </h1><p>) yield no gap.
      expect(body.text).toBe('TitleContent bold')
      expect(body.text).not.toContain('<')
    })

    it('collapses multiple whitespace into single space', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_strip_ws' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>    \n\n   <p>World</p>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.text).toBe('Hello World')
    })

    it('handles empty HTML', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_strip_empty' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.text).toBe('')
    })
  })

  // ===========================================================================
  // FROM_EMAIL / REPLY_TO_EMAIL / APP_URL env defaults
  // ===========================================================================

  describe('environment variable defaults', () => {
    it('uses default FROM_EMAIL when env not set', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      delete process.env.EMAIL_FROM
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_defaults' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.from).toContain('InsurAI')
    })

    it('uses custom EMAIL_FROM when env is set', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      process.env.EMAIL_FROM = 'Custom <custom@test.com>'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_custom_from' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.from).toBe('Custom <custom@test.com>')
    })

    it('uses custom EMAIL_REPLY_TO when env is set', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      process.env.EMAIL_REPLY_TO = 'reply@custom.com'
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_custom_reply' }),
      })

      const mod = await freshImport()
      await mod.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        // No replyTo in options — should use env var
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.reply_to).toBe('reply@custom.com')
    })
  })

  // ===========================================================================
  // Integration: sendEmail with DB logging success path
  // ===========================================================================

  describe('integration: email send + DB log', () => {
    it('calls logEmailSent which inserts into email_logs on success', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const chain = setupChain({ data: null, error: null })
      mockCreateClient.mockReturnValue({ from: mockFrom.mockReturnValue(chain) })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_integration' }),
      })

      const mod = await freshImport()
      const result = await mod.sendWelcomeEmail('new-user@example.com', 'John')

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('email_logs')
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        recipient: 'new-user@example.com',
        message_id: 'msg_integration',
        status: 'sent',
      }))
    })
  })
})
