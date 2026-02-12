/**
 * Translation API Routes
 *
 * Public endpoints:
 * - GET /api/translations/locales          - List active locales + version
 * - GET /api/translations/:locale          - Get all translations for a locale
 *
 * Admin endpoints (require authenticateAdmin):
 * - GET    /api/translations/admin/keys              - List all translation keys
 * - POST   /api/translations/admin/keys              - Create a new translation key
 * - DELETE  /api/translations/admin/keys/:section/:key - Delete a translation key
 * - PUT    /api/translations/admin/:locale/:section/:key - Update one translation
 * - PUT    /api/translations/admin/:locale/batch      - Bulk update translations
 * - GET    /api/translations/admin/:locale/coverage   - Coverage stats
 * - GET    /api/translations/admin/:locale/export     - Export locale as JSON
 * - POST   /api/translations/admin/:locale/import     - Import locale from JSON
 * - GET    /api/translations/admin/audit              - Audit log
 * - POST   /api/translations/admin/locales            - Add new language
 * - PUT    /api/translations/admin/locales/:code      - Update language settings
 * - GET    /api/translations/admin/locales/all        - List all locales (incl. inactive)
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { authenticateAdmin, type AuthenticatedRequest } from '../middleware/admin-auth.js'
import { generalLimiter } from '../middleware/rate-limit.js'
import * as translationService from '../services/translation-service.js'
import logger from '../lib/logger.js'

const log = logger.child('TranslationRoutes')
const router = Router()

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const updateTranslationSchema = z.object({
  value: z.string().min(1, 'Translation value cannot be empty'),
})

const batchUpdateSchema = z.object({
  updates: z.array(z.object({
    section: z.string().min(1),
    key: z.string().min(1),
    value: z.string().min(1),
  })).min(1).max(1000),
})

const createKeySchema = z.object({
  section: z.string().min(1).max(50),
  key: z.string().min(1).max(100),
  description: z.string().optional(),
  context: z.string().optional(),
  maxLength: z.number().positive().optional(),
})

const createLocaleSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(1).max(50),
  nativeName: z.string().min(1).max(50),
  flag: z.string().max(10).optional(),
  isRtl: z.boolean().optional(),
  displayOrder: z.number().optional(),
})

const updateLocaleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  nativeName: z.string().min(1).max(50).optional(),
  flag: z.string().max(10).optional(),
  isRtl: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().optional(),
})

const importSchema = z.object({
  translations: z.record(z.string(), z.record(z.string(), z.string())),
})

// =============================================================================
// PUBLIC ENDPOINTS
// =============================================================================

/**
 * GET /api/translations/locales
 * List active locales with current translation version.
 */
router.get('/locales', generalLimiter, async (_req: Request, res: Response) => {
  try {
    const [locales, version] = await Promise.all([
      translationService.getActiveLocales(),
      translationService.getTranslationVersion(),
    ])

    res.json({
      success: true,
      locales,
      translationVersion: version,
    })
  } catch (error) {
    log.error('Failed to fetch locales', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to fetch locales' })
  }
})

/**
 * GET /api/translations/:locale
 * Get all translations for a locale as nested dictionary.
 * Includes version for client-side cache invalidation.
 */
router.get('/:locale', generalLimiter, async (req: Request, res: Response) => {
  try {
    const locale = req.params.locale as string

    if (!locale || locale.length > 10) {
      res.status(400).json({ success: false, error: 'Invalid locale code' })
      return
    }

    const [translations, version] = await Promise.all([
      translationService.getTranslationsForLocale(locale),
      translationService.getTranslationVersion(),
    ])

    if (!translations) {
      res.status(404).json({ success: false, error: `No translations found for locale: ${locale}` })
      return
    }

    res.json({
      success: true,
      locale,
      version,
      translations,
    })
  } catch (error) {
    log.error('Failed to fetch translations', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to fetch translations' })
  }
})

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * GET /api/translations/admin/keys
 * List all translation keys (with optional section filter).
 */
router.get('/admin/keys', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const keys = await translationService.getAllKeys()
    const section = req.query.section as string | undefined

    const filtered = section
      ? keys.filter(k => k.section === section)
      : keys

    // Group by section for easier consumption
    const sections: Record<string, typeof filtered> = {}
    for (const key of filtered) {
      if (!sections[key.section]) sections[key.section] = []
      sections[key.section].push(key)
    }

    res.json({
      success: true,
      total: filtered.length,
      sections: Object.keys(sections),
      keys: filtered,
      bySection: sections,
    })
  } catch (error) {
    log.error('Failed to fetch keys', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to fetch keys' })
  }
})

/**
 * POST /api/translations/admin/keys
 * Create a new translation key.
 */
router.post('/admin/keys', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = createKeySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const key = await translationService.createKey(parsed.data)
    if (!key) {
      res.status(500).json({ success: false, error: 'Failed to create key (may already exist)' })
      return
    }

    res.status(201).json({ success: true, key })
  } catch (error) {
    log.error('Failed to create key', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to create key' })
  }
})

/**
 * DELETE /api/translations/admin/keys/:section/:key
 * Delete a translation key and all its translations.
 */
router.delete('/admin/keys/:section/:key', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { section, key } = req.params

    const deleted = await translationService.deleteKey(section as string, key as string)
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Key not found' })
      return
    }

    res.json({ success: true, message: `Deleted key ${section}.${key}` })
  } catch (error) {
    log.error('Failed to delete key', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to delete key' })
  }
})

/**
 * PUT /api/translations/admin/:locale/:section/:key
 * Update a single translation.
 */
router.put('/admin/:locale/:section/:key', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { locale, section, key } = req.params
    const parsed = updateTranslationSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const adminId = (req as AuthenticatedRequest).adminUser?.id

    const updated = await translationService.updateTranslation(
      locale as string, section as string, key as string, parsed.data.value, adminId
    )

    if (!updated) {
      res.status(404).json({ success: false, error: 'Translation key not found' })
      return
    }

    res.json({ success: true, message: `Updated ${section}.${key} for ${locale}` })
  } catch (error) {
    log.error('Failed to update translation', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to update translation' })
  }
})

/**
 * PUT /api/translations/admin/:locale/batch
 * Bulk update translations for a locale.
 */
router.put('/admin/:locale/batch', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const locale = req.params.locale as string
    const parsed = batchUpdateSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const adminId = (req as AuthenticatedRequest).adminUser?.id

    const result = await translationService.batchUpdateTranslations(
      locale, parsed.data.updates, adminId
    )

    res.json({ success: true, ...result })
  } catch (error) {
    log.error('Failed to batch update', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to batch update translations' })
  }
})

/**
 * GET /api/translations/admin/:locale/coverage
 * Get translation coverage statistics.
 */
router.get('/admin/:locale/coverage', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const locale = req.params.locale as string
    const coverage = await translationService.getCoverage(locale)

    if (!coverage) {
      res.status(500).json({ success: false, error: 'Failed to compute coverage' })
      return
    }

    res.json({ success: true, ...coverage })
  } catch (error) {
    log.error('Failed to get coverage', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to get coverage' })
  }
})

/**
 * GET /api/translations/admin/:locale/export
 * Export all translations for a locale as JSON.
 */
router.get('/admin/:locale/export', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const locale = req.params.locale as string
    const exported = await translationService.exportLocale(locale)

    if (!exported) {
      res.status(404).json({ success: false, error: `No translations found for locale: ${locale}` })
      return
    }

    res.json({ success: true, ...exported })
  } catch (error) {
    log.error('Failed to export', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to export translations' })
  }
})

/**
 * POST /api/translations/admin/:locale/import
 * Import translations for a locale from JSON.
 * Supports ?dryRun=true for preview.
 */
router.post('/admin/:locale/import', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const locale = req.params.locale as string
    const dryRun = req.query.dryRun === 'true'

    const parsed = importSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const adminId = (req as AuthenticatedRequest).adminUser?.id

    const result = await translationService.importLocale(
      locale, parsed.data.translations, adminId, dryRun
    )

    res.json({ success: true, dryRun, ...result })
  } catch (error) {
    log.error('Failed to import', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to import translations' })
  }
})

/**
 * GET /api/translations/admin/audit
 * Get translation change audit log.
 */
router.get('/admin/audit', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const locale = req.query.locale as string | undefined
    const section = req.query.section as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0

    const { entries, total } = await translationService.getAuditLog({
      locale,
      section,
      limit,
      offset,
    })

    res.json({ success: true, entries, total, limit, offset })
  } catch (error) {
    log.error('Failed to fetch audit log', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to fetch audit log' })
  }
})

/**
 * GET /api/translations/admin/locales/all
 * List all locales including inactive ones.
 */
router.get('/admin/locales/all', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const locales = await translationService.getAllLocales()
    res.json({ success: true, locales })
  } catch (error) {
    log.error('Failed to fetch all locales', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to fetch locales' })
  }
})

/**
 * POST /api/translations/admin/locales
 * Add a new language.
 */
router.post('/admin/locales', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = createLocaleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const locale = await translationService.createLocale(parsed.data)
    if (!locale) {
      res.status(500).json({ success: false, error: 'Failed to create locale (may already exist)' })
      return
    }

    res.status(201).json({ success: true, locale })
  } catch (error) {
    log.error('Failed to create locale', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to create locale' })
  }
})

/**
 * PUT /api/translations/admin/locales/:code
 * Update language settings.
 */
router.put('/admin/locales/:code', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string
    const parsed = updateLocaleSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const updated = await translationService.updateLocale(code, parsed.data)
    if (!updated) {
      res.status(404).json({ success: false, error: 'Locale not found' })
      return
    }

    res.json({ success: true, message: `Updated locale ${code}` })
  } catch (error) {
    log.error('Failed to update locale', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to update locale' })
  }
})

/**
 * POST /api/translations/admin/cache/invalidate
 * Manually invalidate translation cache.
 */
router.post('/admin/cache/invalidate', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const locale = req.query.locale as string | undefined
    translationService.invalidateCache(locale)
    res.json({ success: true, message: locale ? `Cache invalidated for ${locale}` : 'All caches invalidated' })
  } catch (error) {
    log.error('Failed to invalidate cache', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to invalidate cache' })
  }
})

/**
 * POST /api/translations/admin/:locale/ai-translate
 * AI-assisted bulk translation for a target locale.
 * Uses the English source translations and an AI model to generate translations.
 * Body: { sourceLocale?: string } (default: 'en')
 */
router.post('/admin/:locale/ai-translate', authenticateAdmin, async (req: Request, res: Response) => {
  const locale = req.params.locale as string
  const { sourceLocale = 'en' } = req.body || {}

  if (locale === sourceLocale) {
    res.status(400).json({ success: false, error: 'Target locale cannot be the same as source locale' })
    return
  }

  try {
    log.info('AI translation requested', { targetLocale: locale, sourceLocale })

    // 1. Get source translations
    const sourceTranslations = await translationService.getTranslationsForLocale(sourceLocale)
    if (!sourceTranslations || Object.keys(sourceTranslations).length === 0) {
      res.status(404).json({ success: false, error: `No translations found for source locale "${sourceLocale}"` })
      return
    }

    // 2. Get existing target translations (to skip already-translated keys)
    const existingTarget = await translationService.getTranslationsForLocale(locale)

    // 3. Build list of missing translations
    const missing: Array<{ section: string; key: string; sourceValue: string }> = []
    for (const [section, keys] of Object.entries(sourceTranslations)) {
      for (const [key, value] of Object.entries(keys as Record<string, string>)) {
        const existingValue = existingTarget?.[section]?.[key]
        if (!existingValue) {
          missing.push({ section, key, sourceValue: value })
        }
      }
    }

    if (missing.length === 0) {
      res.json({
        success: true,
        message: 'All keys already translated',
        stats: { translated: 0, total: 0, skipped: 0 },
      })
      return
    }

    // 4. Get locale info for the AI prompt
    const allLocales = await translationService.getAllLocales()
    const localeInfo = allLocales.find((l) => l.code === locale)
    const targetLanguageName = localeInfo?.name || locale

    // 5. Translate in chunks using the AI proxy
    // Build translation batches (max 50 keys per batch to avoid token limits)
    const BATCH_SIZE = 50
    const batches: typeof missing[] = []
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      batches.push(missing.slice(i, i + BATCH_SIZE))
    }

    let totalTranslated = 0
    let totalFailed = 0

    for (const batch of batches) {
      // Build AI prompt
      const sourceEntries = batch.map((m) => `"${m.section}.${m.key}": "${m.sourceValue.replace(/"/g, '\\"')}"`).join(',\n  ')

      const prompt = `Translate the following UI text strings from English to ${targetLanguageName}.
Return ONLY a valid JSON object with the same keys and translated values.
Keep any placeholders like {count}, {name} unchanged.
Keep HTML entities and special characters as-is.
Do not add explanations, just the JSON.

Source (English):
{
  ${sourceEntries}
}

Return the translations as JSON:`

      try {
        // Try OpenAI proxy first
        const apiResponse = await fetch(`${getApiBaseUrl()}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: prompt,
            provider: 'openai',
          }),
          signal: AbortSignal.timeout(60000),
        })

        if (!apiResponse.ok) {
          log.warn('AI translation API call failed', { status: apiResponse.status })
          totalFailed += batch.length
          continue
        }

        const aiResult = (await apiResponse.json()) as { success?: boolean; response?: string }
        if (!aiResult.success || !aiResult.response) {
          log.warn('AI translation returned no response')
          totalFailed += batch.length
          continue
        }

        // Parse the AI response - extract JSON from the response text
        let translatedPairs: Record<string, string> = {}
        try {
          // Try to extract JSON from the response
          const jsonMatch = aiResult.response.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            translatedPairs = JSON.parse(jsonMatch[0])
          }
        } catch {
          log.warn('Failed to parse AI translation response as JSON')
          totalFailed += batch.length
          continue
        }

        // 6. Save translations to database
        const updates: Array<{ section: string; key: string; value: string }> = []
        for (const item of batch) {
          const fullKey = `${item.section}.${item.key}`
          const translatedValue = translatedPairs[fullKey]
          if (translatedValue && typeof translatedValue === 'string') {
            updates.push({
              section: item.section,
              key: item.key,
              value: translatedValue,
            })
          }
        }

        if (updates.length > 0) {
          const adminId = (req as AuthenticatedRequest).adminUser?.id || 'system'
          await translationService.batchUpdateTranslations(locale, updates, adminId)
          totalTranslated += updates.length
        }

        totalFailed += batch.length - updates.length
      } catch (batchError) {
        log.error('AI translation batch failed', { error: batchError instanceof Error ? batchError.message : String(batchError) })
        totalFailed += batch.length
      }
    }

    // Invalidate cache for the target locale
    translationService.invalidateCache(locale)

    log.info('AI translation completed', { locale, translated: totalTranslated, failed: totalFailed })

    res.json({
      success: true,
      message: `AI translation completed for ${locale}`,
      stats: {
        total: missing.length,
        translated: totalTranslated,
        failed: totalFailed,
        skipped: Object.values(existingTarget || {}).reduce(
          (sum, section) => sum + Object.keys(section as Record<string, string>).length, 0
        ),
      },
    })
  } catch (error) {
    log.error('AI translation failed', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'AI translation failed' })
  }
})

function getApiBaseUrl(): string {
  // In server context, use localhost since the AI routes are on the same server
  const port = process.env.API_PORT || '4001'
  return `http://localhost:${port}`
}

export default router
