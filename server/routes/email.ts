/**
 * Email API Routes
 *
 * Handles email preferences and test endpoints.
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  isEmailConfigured,
  getEmailPreferences,
  updateEmailPreferences,
  sendWelcomeEmail,
  sendTrialReminderEmail,
  EmailPreferences,
} from '../services/email-service.js'

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
    console.error('[EmailRoutes] Failed to get preferences:', error)
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
        details: parseResult.error.errors,
      })
    }

    const success = await updateEmailPreferences(userId, parseResult.data as Partial<EmailPreferences>)
    if (!success) {
      return res.status(500).json({ error: 'Failed to update preferences' })
    }

    return res.json({ success: true })
  } catch (error) {
    console.error('[EmailRoutes] Failed to update preferences:', error)
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
        details: parseResult.error.errors,
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
    console.log(`[EmailCapture] Email captured: ${email} (source: ${source || 'unknown'})`)

    return res.json({ success: true, message: 'Email captured successfully' })
  } catch (error) {
    console.error('[EmailRoutes] Failed to capture email:', error)
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
        details: parseResult.error.errors,
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
    console.error('[EmailRoutes] Failed to send test email:', error)
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

    // Validate unsubscribe token if provided
    // Token should be a hash of email + secret to prevent unauthorized unsubscribes
    if (token) {
      // TODO: In production, verify token matches expected hash
      // const expectedToken = crypto.createHash('sha256')
      //   .update(email + process.env.UNSUBSCRIBE_SECRET)
      //   .digest('hex')
      // if (token !== expectedToken) {
      //   return res.status(401).json({ error: 'Invalid unsubscribe token' })
      // }
      console.log(`[EmailRoutes] Unsubscribe with token for: ${email}`)
    } else {
      // Without token, log as potential abuse but still process
      // In production, you might want to require the token
      console.warn(`[EmailRoutes] Unsubscribe without token for: ${email}`)
    }

    // Update preferences to opt out of marketing
    // This would need the user ID from the token in production

    return res.json({
      success: true,
      message: 'Successfully unsubscribed from marketing emails',
    })
  } catch (error) {
    console.error('[EmailRoutes] Failed to unsubscribe:', error)
    return res.status(500).json({ error: 'Failed to unsubscribe' })
  }
})

export default router
