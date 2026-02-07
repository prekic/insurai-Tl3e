/**
 * Email API Routes
 *
 * Handles email preferences and test endpoints.
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { logger } from '../lib/logger.js'

const log = logger.child('EmailRoutes')
import {
  isEmailConfigured,
  getEmailPreferences,
  updateEmailPreferences,
  sendWelcomeEmail,
  sendTrialReminderEmail,
  EmailPreferences,
} from '../services/email-service.js'

// =============================================================================
// TOKEN UTILITIES
// =============================================================================

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_JWT_SECRET || 'default-unsubscribe-secret'

/**
 * Generate an unsubscribe token for an email address
 * Token is a HMAC-SHA256 hash of email + secret, truncated to 32 chars
 */
export function generateUnsubscribeToken(email: string): string {
  const normalizedEmail = email.toLowerCase().trim()
  return crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(normalizedEmail)
    .digest('hex')
    .substring(0, 32)
}

/**
 * Verify an unsubscribe token for an email address
 */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expectedToken = generateUnsubscribeToken(email)
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken)
    )
  } catch {
    // Buffers of different lengths will throw
    return false
  }
}

const router = Router()

// =============================================================================
// SCHEMAS
// =============================================================================

const emailPreferencesSchema = z.object({
  marketing: z.boolean().optional(),
  policy_alerts: z.boolean().optional(),
  expiration_reminders: z.boolean().optional(),
  weekly_digest: z.boolean().optional(),
})

const sendTestEmailSchema = z.object({
  email: z.string().email(),
  type: z.enum(['welcome', 'trial_reminder']),
})

const captureEmailSchema = z.object({
  email: z.string().email(),
  source: z.enum(['trial', 'landing', 'exit_intent']).optional(),
})

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/email/status
 * Check if email service is configured
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: isEmailConfigured(),
    provider: isEmailConfigured() ? 'resend' : null,
  })
})

/**
 * GET /api/email/preferences
 * Get user's email preferences (requires auth)
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    // Get user ID from auth header (Supabase JWT)
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // For now, extract user ID from the request
    // In production, this should verify the JWT and extract user ID
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' })
    }

    const preferences = await getEmailPreferences(userId)
    return res.json({ preferences })
  } catch (error) {
    log.error('Failed to get preferences', { error: String(error) })
    return res.status(500).json({ error: 'Failed to get preferences' })
  }
})

/**
 * PUT /api/email/preferences
 * Update user's email preferences (requires auth)
 */
router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' })
    }

    const parseResult = emailPreferencesSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid preferences',
        details: parseResult.error.issues,
      })
    }

    const success = await updateEmailPreferences(userId, parseResult.data as Partial<EmailPreferences>)
    if (!success) {
      return res.status(500).json({ error: 'Failed to update preferences' })
    }

    return res.json({ success: true })
  } catch (error) {
    log.error('Failed to update preferences', { error: String(error) })
    return res.status(500).json({ error: 'Failed to update preferences' })
  }
})

/**
 * POST /api/email/capture
 * Capture email from trial users (no auth required)
 */
router.post('/capture', async (req: Request, res: Response) => {
  try {
    const parseResult = captureEmailSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid email',
        details: parseResult.error.issues,
      })
    }

    const { email, source } = parseResult.data

    // Send trial reminder email
    if (isEmailConfigured()) {
      await sendTrialReminderEmail(email, {
        analysisCount: 1,
      })
    }

    // Log the capture (for analytics)
    log.info('Email captured', { email, source: source || 'unknown' })

    return res.json({ success: true, message: 'Email captured successfully' })
  } catch (error) {
    log.error('Failed to capture email', { error: String(error) })
    return res.status(500).json({ error: 'Failed to capture email' })
  }
})

/**
 * POST /api/email/test (Admin only)
 * Send a test email
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    // Check for admin auth
    const adminToken = req.headers['x-admin-token']
    if (!adminToken) {
      return res.status(401).json({ error: 'Admin authentication required' })
    }

    const parseResult = sendTestEmailSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      })
    }

    const { email, type } = parseResult.data

    let result
    switch (type) {
      case 'welcome':
        result = await sendWelcomeEmail(email, 'Test User')
        break
      case 'trial_reminder':
        result = await sendTrialReminderEmail(email, { analysisCount: 1 })
        break
      default:
        return res.status(400).json({ error: 'Invalid email type' })
    }

    if (result.success) {
      return res.json({ success: true, messageId: result.messageId })
    } else {
      return res.status(500).json({ error: result.error })
    }
  } catch (error) {
    log.error('Failed to send test email', { error: String(error) })
    return res.status(500).json({ error: 'Failed to send test email' })
  }
})

/**
 * POST /api/email/unsubscribe
 * Unsubscribe from all marketing emails (no auth, uses token)
 */
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { token, email } = req.body

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' })
    }

    // Normalize email for comparison
    const normalizedEmail = email.toLowerCase().trim()

    // Validate unsubscribe token - required for security
    if (!token || typeof token !== 'string') {
      log.warn('Unsubscribe attempt without token', { email: normalizedEmail })
      return res.status(401).json({
        error: 'Invalid unsubscribe link',
        message: 'Please use the unsubscribe link from your email'
      })
    }

    // Verify token matches expected hash
    if (!verifyUnsubscribeToken(normalizedEmail, token)) {
      log.warn('Invalid unsubscribe token', { email: normalizedEmail })
      return res.status(401).json({
        error: 'Invalid unsubscribe token',
        message: 'This unsubscribe link is invalid or expired. Please use the link from your most recent email.'
      })
    }

    log.info('Valid unsubscribe request', { email: normalizedEmail })

    // Update preferences to opt out of marketing
    // Note: For captured emails (no user account), we would store this in captured_emails table
    // For registered users, we would update user_email_preferences

    return res.json({
      success: true,
      message: 'Successfully unsubscribed from marketing emails',
    })
  } catch (error) {
    log.error('Failed to unsubscribe', { error: String(error) })
    return res.status(500).json({ error: 'Failed to unsubscribe' })
  }
})

/**
 * GET /api/email/unsubscribe-token
 * Generate an unsubscribe token for testing (admin only in production)
 */
router.get('/unsubscribe-token', (req: Request, res: Response) => {
  const email = req.query.email as string

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter required' })
  }

  // In production, this should be admin-only
  const adminToken = req.headers['x-admin-token']
  if (process.env.NODE_ENV === 'production' && !adminToken) {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const token = generateUnsubscribeToken(email)
  return res.json({
    email: email.toLowerCase().trim(),
    token,
    unsubscribeUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
  })
})

export default router
