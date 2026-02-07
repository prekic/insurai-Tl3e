/**
 * Config Drift Detection API Routes
 *
 * Endpoints for managing baselines and detecting config drift:
 * - GET    /api/admin/drift/baselines     - List all baselines
 * - POST   /api/admin/drift/baselines     - Create a new baseline (snapshot current config)
 * - PUT    /api/admin/drift/baselines/:id/activate - Set as active baseline
 * - DELETE /api/admin/drift/baselines/:id  - Delete a baseline
 * - GET    /api/admin/drift/check          - Compare current config against active baseline
 * - GET    /api/admin/drift/check/:id      - Compare current config against specific baseline
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  listBaselines,
  createBaseline,
  activateBaseline,
  deleteBaseline,
  detectDrift,
  detectDriftAgainst,
} from '../services/drift-detection-service.js'

const router = Router()

/** Safely extract a string from Express req.params or req.query. */
function qstr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

// =============================================================================
// VALIDATION
// =============================================================================

const createBaselineSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  activate: z.boolean().optional().default(true),
})

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/admin/drift/baselines
 * List all saved baselines.
 */
router.get('/baselines', async (_req: Request, res: Response) => {
  try {
    const baselines = await listBaselines()

    // Don't send the full snapshot in the list — it's large
    const summaries = baselines.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      isActive: b.is_active,
      settingsCount: Object.values(b.snapshot || {}).reduce(
        (sum, cat) => sum + Object.keys(cat).length, 0
      ),
      createdBy: b.created_by,
      createdAt: b.created_at,
    }))

    return res.json({ success: true, data: summaries })
  } catch (error) {
    console.error('[Drift API] List error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/drift/baselines
 * Take a snapshot of current settings and save as a new baseline.
 */
router.post('/baselines', async (req: Request, res: Response) => {
  const parseResult = createBaselineSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const { name, description, activate } = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

  try {
    const baseline = await createBaseline(name, description, adminUserId, activate)
    if (!baseline) {
      return res.status(500).json({ success: false, error: 'Failed to create baseline' })
    }

    return res.status(201).json({
      success: true,
      data: {
        id: baseline.id,
        name: baseline.name,
        description: baseline.description,
        isActive: baseline.is_active,
        settingsCount: Object.values(baseline.snapshot || {}).reduce(
          (sum, cat) => sum + Object.keys(cat).length, 0
        ),
        createdBy: baseline.created_by,
        createdAt: baseline.created_at,
      },
    })
  } catch (error) {
    console.error('[Drift API] Create error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/drift/baselines/:id/activate
 * Set a baseline as the active comparison target.
 */
router.put('/baselines/:id/activate', async (req: Request, res: Response) => {
  try {
    const success = await activateBaseline(qstr(req.params.id))
    if (!success) {
      return res.status(404).json({ success: false, error: 'Baseline not found' })
    }
    return res.json({ success: true })
  } catch (error) {
    console.error('[Drift API] Activate error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * DELETE /api/admin/drift/baselines/:id
 * Delete a baseline.
 */
router.delete('/baselines/:id', async (req: Request, res: Response) => {
  try {
    const success = await deleteBaseline(qstr(req.params.id))
    if (!success) {
      return res.status(404).json({ success: false, error: 'Baseline not found or delete failed' })
    }
    return res.json({ success: true })
  } catch (error) {
    console.error('[Drift API] Delete error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/drift/check
 * Compare current config against the active baseline.
 */
router.get('/check', async (_req: Request, res: Response) => {
  try {
    const report = await detectDrift()
    if (!report) {
      return res.json({
        success: true,
        data: null,
        message: 'No active baseline set. Create a baseline first.',
      })
    }
    return res.json({ success: true, data: report })
  } catch (error) {
    console.error('[Drift API] Check error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/drift/check/:id
 * Compare current config against a specific baseline.
 */
router.get('/check/:id', async (req: Request, res: Response) => {
  try {
    const report = await detectDriftAgainst(qstr(req.params.id))
    if (!report) {
      return res.status(404).json({ success: false, error: 'Baseline not found' })
    }
    return res.json({ success: true, data: report })
  } catch (error) {
    console.error('[Drift API] Check error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router
