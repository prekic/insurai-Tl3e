/**
 * Public Config Proxy Routes (Plan B from runbook 08)
 *
 * Public endpoints (no auth, IP rate-limited):
 * - GET /api/config/:category          → all (non-sensitive) settings for a category
 * - GET /api/config/:category/:key     → single setting value (or null if missing)
 *
 * Why this exists: the frontend used to read `app_settings` directly from
 * Supabase REST using the anon key. Cloudflare's edge in front of Supabase
 * intermittently 503s OPTIONS preflights (~30-40 % failure rate from real
 * diagnostic), causing the browser to block the actual GET and the client
 * to fall back to hardcoded DEFAULT_*_CONFIG. Routing these reads through
 * the Express server eliminates the CORS preflight entirely (server-to-
 * server fetch with the service-role key is preflight-free).
 *
 * Sensitivity filter: served via `getPublicCategorySettings` which projects
 * out any row flagged `is_sensitive=true`. Defensive — no current rows are
 * sensitive, but protects future admins who mark a row and forget to audit.
 *
 * Pattern mirrors `server/routes/translations.ts` (also public + IP-limited).
 */

import { Router, type Request, type Response } from 'express'
import { generalLimiter } from '../middleware/rate-limit.js'
import { getPublicCategorySettings } from '../services/config-service.js'
import logger from '../lib/logger.js'

const log = logger.child('ConfigRoutes')
const router = Router()

// =============================================================================
// CATEGORY ALLOWLIST
// =============================================================================

/**
 * The 14 admin-tunable categories the frontend reads at runtime. Anything
 * outside this list returns 400 — prevents this from becoming a generic
 * Supabase proxy that could be abused to enumerate other rows.
 *
 * Keep in sync with the `ConfigCategory` union type in
 * `src/lib/config/types.ts` and the `*_KEY_MAP` constants in
 * `server/services/config-service.ts`.
 */
const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'ai',
  'evaluation',
  'rate_limits',
  'ocr',
  'fuzzy_matching',
  'gap_analysis',
  'ui',
  'email',
  'monitoring',
  'retention',
  'fx',
  'server',
  'webhooks',
  'cost',
])

function isValidCategory(c: unknown): c is string {
  return typeof c === 'string' && VALID_CATEGORIES.has(c)
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/config/:category
 * Returns: { success: true, category, data: Record<string, unknown> }
 * Errors:  400 unknown category, 500 service failure.
 */
router.get('/:category', generalLimiter, async (req: Request, res: Response) => {
  const { category } = req.params as { category: string }

  if (!isValidCategory(category)) {
    res.status(400).json({ success: false, error: 'Invalid category' })
    return
  }

  try {
    const data = await getPublicCategorySettings(category)
    res.json({ success: true, category, data })
  } catch (error) {
    log.error('Failed to fetch config category', {
      category,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to fetch config' })
  }
})

/**
 * GET /api/config/:category/:key
 * Returns: { success: true, category, key, value: unknown | null }
 * - value === null when the key isn't in the seeded settings (treat as
 *   "use code default"). NOT a 404 — missing keys are normal because not
 *   every TS-default has a DB row seeded.
 */
router.get('/:category/:key', generalLimiter, async (req: Request, res: Response) => {
  const { category, key } = req.params as { category: string; key: string }

  if (!isValidCategory(category)) {
    res.status(400).json({ success: false, error: 'Invalid category' })
    return
  }
  if (typeof key !== 'string' || key.length === 0 || key.length > 100) {
    res.status(400).json({ success: false, error: 'Invalid key' })
    return
  }

  try {
    const data = await getPublicCategorySettings(category)
    const value = key in data ? data[key] : null
    res.json({ success: true, category, key, value })
  } catch (error) {
    log.error('Failed to fetch config key', {
      category,
      key,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to fetch config' })
  }
})

export default router
