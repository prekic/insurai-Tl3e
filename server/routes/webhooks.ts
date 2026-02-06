/**
 * Webhook API Routes
 *
 * Admin endpoints for managing settings webhooks:
 * - GET    /api/admin/webhooks          - List all webhooks
 * - POST   /api/admin/webhooks          - Create a webhook
 * - GET    /api/admin/webhooks/:id      - Get a webhook
 * - PUT    /api/admin/webhooks/:id      - Update a webhook
 * - DELETE /api/admin/webhooks/:id      - Delete a webhook
 * - POST   /api/admin/webhooks/:id/test - Send a test ping
 * - POST   /api/admin/webhooks/:id/regenerate-secret - Regenerate signing secret
 * - GET    /api/admin/webhooks/:id/deliveries - Get delivery log
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  regenerateSecret,
  getDeliveries,
  type WebhookEvent,
} from '../services/webhook-service.js'

const router = Router()

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const VALID_EVENTS: WebhookEvent[] = [
  'setting.updated',
  'setting.batch_updated',
  'setting.imported',
  'feature_flag.toggled',
]

const VALID_CATEGORIES = [
  'ai', 'evaluation', 'rate_limits', 'ocr',
  'fuzzy_matching', 'gap_analysis', 'ui', 'email',
]

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1),
  categories: z.array(z.string().refine((c) => VALID_CATEGORIES.includes(c))).optional(),
  enabled: z.boolean().optional(),
})

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1).optional(),
  categories: z.array(z.string().refine((c) => VALID_CATEGORIES.includes(c))).optional(),
  enabled: z.boolean().optional(),
})

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/admin/webhooks
 * List all webhooks (secrets are masked).
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const webhooks = await listWebhooks()

    // Mask secrets in the response
    const masked = webhooks.map((wh) => ({
      ...wh,
      secret: maskSecret(wh.secret),
    }))

    return res.json({ success: true, data: masked })
  } catch (error) {
    console.error('[Webhooks API] List error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/webhooks
 * Create a new webhook. Returns the full secret (only shown once).
 */
router.post('/', async (req: Request, res: Response) => {
  const parseResult = createWebhookSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  try {
    const webhook = await createWebhook(parseResult.data)
    if (!webhook) {
      return res.status(500).json({ success: false, error: 'Failed to create webhook' })
    }

    // Return full secret on creation (only time it's shown in plaintext)
    return res.status(201).json({ success: true, data: webhook })
  } catch (error) {
    console.error('[Webhooks API] Create error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/webhooks/:id
 * Get a single webhook (secret masked).
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const webhook = await getWebhook(req.params.id)
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' })
    }

    return res.json({
      success: true,
      data: { ...webhook, secret: maskSecret(webhook.secret) },
    })
  } catch (error) {
    console.error('[Webhooks API] Get error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/webhooks/:id
 * Update a webhook.
 */
router.put('/:id', async (req: Request, res: Response) => {
  const parseResult = updateWebhookSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  try {
    const webhook = await updateWebhook(req.params.id, parseResult.data)
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' })
    }

    return res.json({
      success: true,
      data: { ...webhook, secret: maskSecret(webhook.secret) },
    })
  } catch (error) {
    console.error('[Webhooks API] Update error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * DELETE /api/admin/webhooks/:id
 * Delete a webhook and its delivery log.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const success = await deleteWebhook(req.params.id)
    if (!success) {
      return res.status(404).json({ success: false, error: 'Webhook not found or delete failed' })
    }

    return res.json({ success: true })
  } catch (error) {
    console.error('[Webhooks API] Delete error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/webhooks/:id/test
 * Send a test ping to the webhook endpoint.
 */
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const result = await testWebhook(req.params.id)
    return res.json({ success: true, data: result })
  } catch (error) {
    console.error('[Webhooks API] Test error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/webhooks/:id/regenerate-secret
 * Regenerate the signing secret. Returns the new secret (only shown once).
 */
router.post('/:id/regenerate-secret', async (req: Request, res: Response) => {
  try {
    const newSecret = await regenerateSecret(req.params.id)
    if (!newSecret) {
      return res.status(404).json({ success: false, error: 'Webhook not found' })
    }

    return res.json({ success: true, data: { secret: newSecret } })
  } catch (error) {
    console.error('[Webhooks API] Regenerate secret error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/webhooks/:id/deliveries
 * Get delivery log for a webhook.
 */
router.get('/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const offset = parseInt(req.query.offset as string) || 0

    const { deliveries, total } = await getDeliveries(req.params.id, { limit, offset })

    return res.json({
      success: true,
      data: deliveries,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error) {
    console.error('[Webhooks API] Deliveries error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// HELPERS
// =============================================================================

function maskSecret(secret: string): string {
  if (secret.length <= 10) return '••••••••'
  return secret.slice(0, 6) + '••••••' + secret.slice(-4)
}

export default router
