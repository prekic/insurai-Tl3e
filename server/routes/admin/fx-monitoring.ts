import { Router, Response } from 'express'
import { authenticateAdmin, getSupabaseWithError, logger } from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const log = logger.child('AdminFX')
const router = Router()

/**
 * Get FX rate history
 * GET /api/admin/fx/history
 */
router.get('/fx/history', authenticateAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { client: supabase, error: dbError } = getSupabaseWithError()

    if (!supabase) {
      res.status(503).json({ success: false, error: dbError || 'Database not configured' })
      return
    }

    const { data: history, error } = await supabase
      .from('fx_rate_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      throw error
    }

    res.json({ success: true, data: history })
  } catch (error) {
    log.error('Failed to get FX history', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to get FX history' })
  }
})

export default router
