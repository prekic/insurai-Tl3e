/**
 * Settings API Routes
 *
 * Admin endpoints for managing application settings:
 * - GET /api/admin/settings - List all settings
 * - GET /api/admin/settings/export - Export all configuration
 * - POST /api/admin/settings/import - Import configuration backup
 * - GET /api/admin/settings/:category - Get settings by category
 * - GET /api/admin/settings/:category/:key - Get specific setting
 * - PUT /api/admin/settings/:category/:key - Update setting
 * - POST /api/admin/settings/:category/:key/reset - Reset to default
 * - GET /api/admin/settings/:category/:key/history - Get audit history
 *
 * Also includes endpoints for:
 * - Feature flags
 * - Regional factors
 * - Insurance providers
 * - Market benchmarks
 */

import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { fireWebhooks } from '../services/webhook-service.js'
import logger from '../lib/logger.js'

const log = logger.child('Settings')

const router = Router()

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return null
  }

  return createClient(supabaseUrl, serviceKey)
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const updateSettingSchema = z.object({
  value: z.unknown(),
  reason: z.string().optional(),
})

const updateFeatureFlagSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  userSegments: z.array(z.string()).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().optional(),
})

const updateRegionalFactorSchema = z.object({
  riskFactor: z.number().min(0).max(5),
  notes: z.string().optional(),
})

const updateProviderSchema = z.object({
  marketShare: z.number().min(0).max(100).optional(),
  customerRating: z.number().min(0).max(5).optional(),
  isActive: z.boolean().optional(),
})

const updateBenchmarkSchema = z.object({
  minLimit: z.number().optional(),
  typicalLimit: z.number().optional(),
  maxLimit: z.number().optional(),
  typicalDeductible: z.number().optional(),
  inclusionRate: z.number().min(0).max(100).optional(),
  importance: z.enum(['critical', 'standard', 'optional']).optional(),
})

const EXPORT_VERSION = 1

const importConfigSchema = z.object({
  version: z.number().int().positive(),
  exportedAt: z.string(),
  settings: z.record(z.string(), z.array(z.object({
    key: z.string(),
    value: z.unknown(),
  }))).optional(),
  featureFlags: z.array(z.object({
    key: z.string(),
    enabled: z.boolean().optional(),
    rolloutPercentage: z.number().min(0).max(100).optional(),
  })).optional(),
  regionalFactors: z.array(z.object({
    regionCode: z.string(),
    policyType: z.string().default('all'),
    riskFactor: z.number().min(0).max(5),
  })).optional(),
})

const importRequestSchema = z.object({
  config: importConfigSchema,
  mode: z.enum(['merge', 'overwrite']).default('merge'),
  sections: z.array(z.enum(['settings', 'featureFlags', 'regionalFactors'])).optional(),
  reason: z.string().optional(),
})

// =============================================================================
// SERVER-SIDE PERFORMANCE MONITOR (in-memory, rolling window)
// =============================================================================

interface ServerConfigEvent {
  timestamp: number
  category: string
  latencyMs: number
  cacheHit: boolean
  success: boolean
}

interface ServerAlertThresholds {
  cacheHitRateWarning: number
  cacheHitRateCritical: number
  errorRateWarning: number
  errorRateCritical: number
  dbLatencyWarning: number
  dbLatencyCritical: number
  minEventsForAlert: number
  alertCooldownMs: number
}

interface ServerPerformanceAlert {
  id: string
  type: 'cache_hit_rate' | 'error_rate' | 'db_latency'
  severity: 'warning' | 'critical'
  message: string
  currentValue: number
  threshold: number
  triggeredAt: number
}

const serverPerfEvents: ServerConfigEvent[] = []
const SERVER_PERF_MAX_EVENTS = 500
const SERVER_PERF_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

let serverAlertThresholds: ServerAlertThresholds = {
  cacheHitRateWarning: 0.5,
  cacheHitRateCritical: 0.3,
  errorRateWarning: 0.05,
  errorRateCritical: 0.15,
  dbLatencyWarning: 200,
  dbLatencyCritical: 500,
  minEventsForAlert: 20,
  alertCooldownMs: 5 * 60 * 1000,
}
const serverLastAlertTimes = new Map<string, number>()
// Active alerts (assigned in evaluateServerAlerts, available via getServerPerformanceSnapshot export)

function pruneServerPerfEvents(): void {
  const cutoff = Date.now() - SERVER_PERF_MAX_AGE_MS
  while (serverPerfEvents.length > 0 && serverPerfEvents[0].timestamp < cutoff) {
    serverPerfEvents.shift()
  }
  if (serverPerfEvents.length > SERVER_PERF_MAX_EVENTS) {
    serverPerfEvents.splice(0, serverPerfEvents.length - SERVER_PERF_MAX_EVENTS)
  }
}

function recordServerConfigFetch(category: string, latencyMs: number, cacheHit: boolean, success: boolean): void {
  serverPerfEvents.push({ timestamp: Date.now(), category, latencyMs, cacheHit, success })
  pruneServerPerfEvents()
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

function getServerPerformanceSnapshot() {
  pruneServerPerfEvents()
  const events = serverPerfEvents

  const dbEvents = events.filter((e) => !e.cacheHit && e.success)
  const dbLatencies = dbEvents.map((e) => e.latencyMs).sort((a, b) => a - b)
  const allLatencies = events.filter((e) => e.success).map((e) => e.latencyMs).sort((a, b) => a - b)
  const totalHits = events.filter((e) => e.cacheHit).length

  // Per-category breakdown
  const catMap = new Map<string, ServerConfigEvent[]>()
  for (const ev of events) {
    const arr = catMap.get(ev.category) || []
    arr.push(ev)
    catMap.set(ev.category, arr)
  }

  const categories = Array.from(catMap.entries()).map(([cat, evts]) => {
    const success = evts.filter((e) => e.success)
    const avgLatency = success.length > 0 ? success.reduce((s, e) => s + e.latencyMs, 0) / success.length : 0
    return {
      category: cat,
      fetchCount: evts.length,
      avgLatencyMs: Math.round(avgLatency * 100) / 100,
      cacheHitRate: evts.length > 0 ? Math.round((evts.filter((e) => e.cacheHit).length / evts.length) * 10000) / 10000 : 0,
      errorCount: evts.filter((e) => !e.success).length,
    }
  }).sort((a, b) => b.fetchCount - a.fetchCount)

  const computeStats = (latencies: number[]) => {
    if (latencies.length === 0) return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 }
    const sum = latencies.reduce((a, b) => a + b, 0)
    return {
      count: latencies.length,
      avgMs: Math.round((sum / latencies.length) * 100) / 100,
      minMs: latencies[0],
      maxMs: latencies[latencies.length - 1],
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
    }
  }

  return {
    snapshotAt: new Date().toISOString(),
    totalEvents: events.length,
    dbLatency: computeStats(dbLatencies),
    overallLatency: computeStats(allLatencies),
    cache: {
      totalRequests: events.length,
      cacheHits: totalHits,
      cacheMisses: events.length - totalHits,
      hitRate: events.length > 0 ? Math.round((totalHits / events.length) * 10000) / 10000 : 0,
    },
    categories,
    errorRate: events.length > 0 ? events.filter((e) => !e.success).length / events.length : 0,
  }
}

function evaluateServerAlerts(): { alerts: ServerPerformanceAlert[]; suppressedCount: number } {
  pruneServerPerfEvents()
  const events = serverPerfEvents
  const thresholds = serverAlertThresholds
  const now = Date.now()
  const alerts: ServerPerformanceAlert[] = []
  let suppressedCount = 0

  if (events.length < thresholds.minEventsForAlert) {
    return { alerts: [], suppressedCount: 0 }
  }

  const totalHits = events.filter((e) => e.cacheHit).length
  const hitRate = events.length > 0 ? totalHits / events.length : 0
  const errorRate = events.length > 0 ? events.filter((e) => !e.success).length / events.length : 0
  const dbEvents = events.filter((e) => !e.cacheHit && e.success)
  const dbLatencies = dbEvents.map((e) => e.latencyMs)
  const avgDbLatency = dbLatencies.length > 0 ? dbLatencies.reduce((a, b) => a + b, 0) / dbLatencies.length : 0

  const tryCreateAlert = (
    type: ServerPerformanceAlert['type'],
    severity: 'warning' | 'critical',
    currentValue: number,
    threshold: number
  ): void => {
    const key = `${type}:${severity}`
    const last = serverLastAlertTimes.get(key) || 0
    if (now - last < thresholds.alertCooldownMs) {
      suppressedCount++
      return
    }
    serverLastAlertTimes.set(key, now)
    const messages: Record<string, string> = {
      cache_hit_rate: `${severity === 'critical' ? 'Critical' : 'Warning'}: Cache hit rate at ${(currentValue * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
      error_rate: `${severity === 'critical' ? 'Critical' : 'Warning'}: Error rate at ${(currentValue * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
      db_latency: `${severity === 'critical' ? 'Critical' : 'Warning'}: DB latency at ${currentValue.toFixed(0)}ms (threshold: ${threshold.toFixed(0)}ms)`,
    }
    alerts.push({
      id: `${type}-${severity}-${now}`,
      type,
      severity,
      message: messages[type],
      currentValue,
      threshold,
      triggeredAt: now,
    })
  }

  // Cache hit rate checks
  if (hitRate < thresholds.cacheHitRateCritical) {
    tryCreateAlert('cache_hit_rate', 'critical', hitRate, thresholds.cacheHitRateCritical)
  } else if (hitRate < thresholds.cacheHitRateWarning) {
    tryCreateAlert('cache_hit_rate', 'warning', hitRate, thresholds.cacheHitRateWarning)
  }

  // Error rate checks
  if (errorRate > thresholds.errorRateCritical) {
    tryCreateAlert('error_rate', 'critical', errorRate, thresholds.errorRateCritical)
  } else if (errorRate > thresholds.errorRateWarning) {
    tryCreateAlert('error_rate', 'warning', errorRate, thresholds.errorRateWarning)
  }

  // DB latency checks
  if (dbLatencies.length > 0) {
    if (avgDbLatency > thresholds.dbLatencyCritical) {
      tryCreateAlert('db_latency', 'critical', avgDbLatency, thresholds.dbLatencyCritical)
    } else if (avgDbLatency > thresholds.dbLatencyWarning) {
      tryCreateAlert('db_latency', 'warning', avgDbLatency, thresholds.dbLatencyWarning)
    }
  }

  return { alerts, suppressedCount }
}

// Make the record function available to other server modules
export { recordServerConfigFetch, getServerPerformanceSnapshot, evaluateServerAlerts }

// =============================================================================
// SETTINGS ROUTES
// =============================================================================

/**
 * GET /api/admin/settings
 * List all settings grouped by category
 */
router.get('/', async (_req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .order('category')
      .order('display_order')

    if (error) {
      log.error('Error fetching settings', { error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch settings' })
    }

    // Group by category
    const grouped = (data || []).reduce(
      (acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = []
        }
        acc[setting.category].push({
          id: setting.id,
          key: setting.key,
          value: setting.value,
          valueType: setting.value_type,
          description: setting.description,
          descriptionTr: setting.description_tr,
          isSensitive: setting.is_sensitive,
          isReadonly: setting.is_readonly,
          displayOrder: setting.display_order,
          minValue: setting.min_value,
          maxValue: setting.max_value,
          allowedValues: setting.allowed_values,
          updatedAt: setting.updated_at,
        })
        return acc
      },
      {} as Record<string, unknown[]>
    )

    return res.json({
      success: true,
      data: {
        categories: Object.keys(grouped),
        settings: grouped,
        totalCount: data?.length || 0,
      },
    })
  } catch (error) {
    log.error('Unhandled exception listing settings', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// PERFORMANCE MONITORING ROUTES (must be before /:category to avoid route conflict)
// =============================================================================

/**
 * GET /api/admin/settings/performance
 * Get server-side config performance metrics with alert evaluation
 */
router.get('/performance', async (_req: Request, res: Response) => {
  try {
    const snapshot = getServerPerformanceSnapshot()
    const alertEvaluation = evaluateServerAlerts()

    // Fire notifications for new alerts
    if (alertEvaluation.alerts.length > 0) {
      // Lazy import to avoid circular dependencies
      import('../services/admin-notification-service.js').then(({ notifyPerformanceAlert }) => {
        for (const alert of alertEvaluation.alerts) {
          const typeLabels: Record<string, string> = {
            cache_hit_rate: 'Low Cache Hit Rate',
            error_rate: 'High Error Rate',
            db_latency: 'High DB Latency',
          }
          notifyPerformanceAlert(
            typeLabels[alert.type] || alert.type,
            alert.severity,
            alert.message,
            { currentValue: alert.currentValue, threshold: alert.threshold }
          ).catch((err: unknown) => log.warn('Failed to create performance notification', { error: String(err) }))
        }
      }).catch(() => { /* notification service not available */ })
    }

    return res.json({
      success: true,
      data: {
        ...snapshot,
        alerts: alertEvaluation.alerts,
        alertThresholds: serverAlertThresholds,
        suppressedAlertCount: alertEvaluation.suppressedCount,
      },
    })
  } catch (error) {
    log.error('Performance snapshot error', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Failed to get performance metrics' })
  }
})

/**
 * PUT /api/admin/settings/performance/thresholds
 * Update server-side alert thresholds
 */
const alertThresholdsSchema = z.object({
  cacheHitRateWarning: z.number().min(0).max(1).optional(),
  cacheHitRateCritical: z.number().min(0).max(1).optional(),
  errorRateWarning: z.number().min(0).max(1).optional(),
  errorRateCritical: z.number().min(0).max(1).optional(),
  dbLatencyWarning: z.number().min(0).optional(),
  dbLatencyCritical: z.number().min(0).optional(),
  minEventsForAlert: z.number().int().min(1).optional(),
  alertCooldownMs: z.number().min(0).optional(),
})

router.put('/performance/thresholds', async (req: Request, res: Response) => {
  try {
    const parsed = alertThresholdsSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid thresholds',
        details: parsed.error.issues,
      })
    }

    serverAlertThresholds = { ...serverAlertThresholds, ...parsed.data }

    return res.json({
      success: true,
      data: { thresholds: serverAlertThresholds },
    })
  } catch (error) {
    log.error('Update thresholds error', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Failed to update thresholds' })
  }
})

/**
 * POST /api/admin/settings/performance
 * Accept client-side performance metrics for centralized monitoring
 */
router.post('/performance', async (req: Request, res: Response) => {
  try {
    // Accept and log client-side metrics (for future aggregation)
    const clientSnapshot = req.body
    if (clientSnapshot?.totalEvents !== undefined) {
      log.info('Client performance report received', {
        totalEvents: clientSnapshot.totalEvents,
        cacheHitRate: clientSnapshot.cache?.hitRate,
        dbAvgLatency: clientSnapshot.dbLatency?.avgMs,
        dbP95Latency: clientSnapshot.dbLatency?.p95Ms,
        errorRate: clientSnapshot.errorRate,
        recommendation: clientSnapshot.ttlRecommendation?.reason,
        alerts: clientSnapshot.alerts?.length ?? 0,
      })
    }
    return res.json({ success: true })
  } catch (error) {
    log.error('Performance report error', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Failed to process performance report' })
  }
})

// =============================================================================
// EXPORT / IMPORT ROUTES (must be before /:category to avoid route conflict)
// =============================================================================

/**
 * GET /api/admin/settings/export
 * Export all configuration as a JSON backup
 */
router.get('/export', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  try {
    // Fetch all data in parallel
    const [settingsResult, flagsResult, factorsResult, providersResult, benchmarksResult] =
      await Promise.all([
        supabase.from('app_settings').select('category, key, value, value_type').order('category').order('display_order'),
        supabase.from('feature_flags').select('key, description, enabled, rollout_percentage, user_segments, conditions, expires_at').order('key'),
        supabase.from('regional_factors').select('region_code, region_name, region_name_tr, policy_type, risk_factor, year, source, notes').eq('is_active', true).order('region_code'),
        supabase.from('insurance_providers').select('code, name, name_tr, market_share, customer_rating, established_year, headquarters, website, specialties, is_active').order('code'),
        supabase.from('market_benchmarks').select('policy_type, coverage_type, coverage_name_tr, region_code, year, min_limit, typical_limit, max_limit, min_deductible, typical_deductible, max_deductible, inclusion_rate, importance, source').eq('is_active', true).order('policy_type').order('coverage_type'),
      ])

    if (settingsResult.error) {
      log.error('Export failed to fetch settings', { error: String(settingsResult.error) })
      return res.status(500).json({ success: false, error: 'Failed to export settings' })
    }

    // Group settings by category
    const groupedSettings: Record<string, Array<{ key: string; value: unknown; valueType: string }>> = {}
    for (const row of settingsResult.data || []) {
      if (!groupedSettings[row.category]) {
        groupedSettings[row.category] = []
      }
      groupedSettings[row.category].push({
        key: row.key,
        value: row.value,
        valueType: row.value_type,
      })
    }

    // Build the admin email for exportedBy
    const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id
    let exportedBy = 'unknown'
    if (adminUserId) {
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('email')
        .eq('id', adminUserId)
        .single()
      if (adminUser) {
        exportedBy = adminUser.email
      }
    }

    const exportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy,
      settings: groupedSettings,
      featureFlags: (flagsResult.data || []).map((f) => ({
        key: f.key,
        description: f.description,
        enabled: f.enabled,
        rolloutPercentage: f.rollout_percentage,
        userSegments: f.user_segments,
        conditions: f.conditions,
        expiresAt: f.expires_at,
      })),
      regionalFactors: (factorsResult.data || []).map((f) => ({
        regionCode: f.region_code,
        regionName: f.region_name,
        regionNameTr: f.region_name_tr,
        policyType: f.policy_type,
        riskFactor: f.risk_factor,
        year: f.year,
        source: f.source,
        notes: f.notes,
      })),
      providers: (providersResult.data || []).map((p) => ({
        code: p.code,
        name: p.name,
        nameTr: p.name_tr,
        marketShare: p.market_share,
        customerRating: p.customer_rating,
        establishedYear: p.established_year,
        headquarters: p.headquarters,
        website: p.website,
        specialties: p.specialties,
        isActive: p.is_active,
      })),
      benchmarks: (benchmarksResult.data || []).map((b) => ({
        policyType: b.policy_type,
        coverageType: b.coverage_type,
        coverageNameTr: b.coverage_name_tr,
        regionCode: b.region_code,
        year: b.year,
        minLimit: b.min_limit,
        typicalLimit: b.typical_limit,
        maxLimit: b.max_limit,
        minDeductible: b.min_deductible,
        typicalDeductible: b.typical_deductible,
        maxDeductible: b.max_deductible,
        inclusionRate: b.inclusion_rate,
        importance: b.importance,
        source: b.source,
      })),
    }

    // Log the export action
    await supabase.from('settings_audit_log').insert({
      category: '_system',
      key: 'config_export',
      previous_value: null,
      new_value: { sections: Object.keys(groupedSettings), featureFlags: (flagsResult.data || []).length, regionalFactors: (factorsResult.data || []).length },
      changed_by: adminUserId,
      reason: 'Configuration exported',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    })

    return res.json({ success: true, data: exportData })
  } catch (error) {
    log.error('Unhandled exception during export', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/settings/import
 * Import configuration from a backup file
 *
 * Body: { config: ExportData, mode: 'merge' | 'overwrite', sections?: string[], reason?: string }
 * - merge: Only update settings that exist in both backup and DB
 * - overwrite: Replace all values with backup values (still respects readonly)
 * - sections: Limit import to specific sections (defaults to all)
 */
router.post('/import', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const parseResult = importRequestSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid import data',
      details: parseResult.error.issues,
    })
  }

  const { config, mode, sections, reason } = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id
  const importReason = reason || `Configuration imported (mode: ${mode})`

  const results = {
    settings: { updated: 0, skipped: 0, errors: [] as string[] },
    featureFlags: { updated: 0, skipped: 0, errors: [] as string[] },
    regionalFactors: { updated: 0, skipped: 0, errors: [] as string[] },
  }

  try {
    // 1. Import app_settings
    const shouldImportSettings = !sections || sections.includes('settings')
    if (shouldImportSettings && config.settings) {
      for (const [category, settingsList] of Object.entries(config.settings)) {
        for (const setting of settingsList) {
          try {
            // Find the existing setting
            const { data: existing } = await supabase
              .from('app_settings')
              .select('id, value, is_readonly, min_value, max_value, allowed_values')
              .eq('category', category)
              .eq('key', setting.key)
              .single()

            if (!existing) {
              if (mode === 'merge') {
                results.settings.skipped++
                continue
              }
              results.settings.errors.push(`${category}.${setting.key}: not found in database`)
              continue
            }

            if (existing.is_readonly) {
              results.settings.skipped++
              continue
            }

            // Validate value constraints
            if (existing.min_value !== null && typeof setting.value === 'number' && setting.value < existing.min_value) {
              results.settings.errors.push(`${category}.${setting.key}: value ${setting.value} below minimum ${existing.min_value}`)
              continue
            }
            if (existing.max_value !== null && typeof setting.value === 'number' && setting.value > existing.max_value) {
              results.settings.errors.push(`${category}.${setting.key}: value ${setting.value} above maximum ${existing.max_value}`)
              continue
            }
            if (existing.allowed_values && Array.isArray(existing.allowed_values)) {
              if (!(existing.allowed_values as unknown[]).includes(setting.value)) {
                results.settings.errors.push(`${category}.${setting.key}: value not in allowed values`)
                continue
              }
            }

            // Skip if value is the same
            if (JSON.stringify(existing.value) === JSON.stringify(setting.value)) {
              results.settings.skipped++
              continue
            }

            // Update the setting
            const { error: updateError } = await supabase
              .from('app_settings')
              .update({
                value: setting.value,
                updated_by: adminUserId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)

            if (updateError) {
              log.error('Settings import: update failed', { category, key: setting.key, error: updateError.message })
              results.settings.errors.push(`${category}.${setting.key}: update failed`)
              continue
            }

            // Audit log
            await supabase.from('settings_audit_log').insert({
              setting_id: existing.id,
              category,
              key: setting.key,
              previous_value: existing.value,
              new_value: setting.value,
              changed_by: adminUserId,
              reason: importReason,
              ip_address: req.ip,
              user_agent: req.get('user-agent'),
            })

            results.settings.updated++
          } catch (error) {
            results.settings.errors.push(`${category}.${setting.key}: ${error instanceof Error ? error.message : 'unknown error'}`)
          }
        }
      }
    }

    // 2. Import feature flags
    const shouldImportFlags = !sections || sections.includes('featureFlags')
    if (shouldImportFlags && config.featureFlags) {
      for (const flag of config.featureFlags) {
        try {
          const updateData: Record<string, unknown> = {
            updated_by: adminUserId,
            updated_at: new Date().toISOString(),
          }

          if (flag.enabled !== undefined) updateData.enabled = flag.enabled
          if (flag.rolloutPercentage !== undefined) updateData.rollout_percentage = flag.rolloutPercentage

          const { data: existing } = await supabase
            .from('feature_flags')
            .select('id, enabled, rollout_percentage')
            .eq('key', flag.key)
            .single()

          if (!existing) {
            if (mode === 'merge') {
              results.featureFlags.skipped++
              continue
            }
            results.featureFlags.errors.push(`${flag.key}: not found in database`)
            continue
          }

          const { error: updateError } = await supabase
            .from('feature_flags')
            .update(updateData)
            .eq('key', flag.key)

          if (updateError) {
            log.error('Settings import: flag update failed', { key: flag.key, error: updateError.message })
            results.featureFlags.errors.push(`${flag.key}: update failed`)
            continue
          }

          results.featureFlags.updated++
        } catch (error) {
          results.featureFlags.errors.push(`${flag.key}: ${error instanceof Error ? error.message : 'unknown error'}`)
        }
      }
    }

    // 3. Import regional factors
    const shouldImportFactors = !sections || sections.includes('regionalFactors')
    if (shouldImportFactors && config.regionalFactors) {
      for (const factor of config.regionalFactors) {
        try {
          const { data: existing } = await supabase
            .from('regional_factors')
            .select('id, risk_factor')
            .eq('region_code', factor.regionCode)
            .eq('policy_type', factor.policyType)
            .eq('is_active', true)
            .single()

          if (!existing) {
            if (mode === 'merge') {
              results.regionalFactors.skipped++
              continue
            }
            results.regionalFactors.errors.push(`${factor.regionCode}/${factor.policyType}: not found`)
            continue
          }

          if (existing.risk_factor === factor.riskFactor) {
            results.regionalFactors.skipped++
            continue
          }

          const { error: updateError } = await supabase
            .from('regional_factors')
            .update({
              risk_factor: factor.riskFactor,
              updated_by: adminUserId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)

          if (updateError) {
            log.error('Settings import: factor update failed', { regionCode: factor.regionCode, error: updateError.message })
            results.regionalFactors.errors.push(`${factor.regionCode}: update failed`)
            continue
          }

          results.regionalFactors.updated++
        } catch (error) {
          results.regionalFactors.errors.push(`${factor.regionCode}: ${error instanceof Error ? error.message : 'unknown error'}`)
        }
      }
    }

    // Log the import action
    const totalUpdated = results.settings.updated + results.featureFlags.updated + results.regionalFactors.updated
    const totalErrors = results.settings.errors.length + results.featureFlags.errors.length + results.regionalFactors.errors.length

    await supabase.from('settings_audit_log').insert({
      category: '_system',
      key: 'config_import',
      previous_value: null,
      new_value: {
        mode,
        sections: sections || ['settings', 'featureFlags', 'regionalFactors'],
        totalUpdated,
        totalErrors,
        exportedAt: config.exportedAt,
      },
      changed_by: adminUserId,
      reason: importReason,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    })

    // Fire webhooks for import (async, non-blocking)
    if (totalUpdated > 0) {
      fireWebhooks('setting.imported', {
        category: '_system',
        changes: [{ key: 'config_import', previous_value: null, new_value: { totalUpdated, totalErrors } }],
        reason: importReason,
        changed_by: adminUserId,
      }).catch((err) => log.warn('Webhook fire error on import', { error: String(err) }))
    }

    return res.json({
      success: true,
      data: {
        results,
        summary: {
          totalUpdated,
          totalSkipped: results.settings.skipped + results.featureFlags.skipped + results.regionalFactors.skipped,
          totalErrors,
        },
      },
    })
  } catch (error) {
    log.error('Unhandled exception during import', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// BATCH UPDATE ROUTE (must be before /:category to avoid route conflict)
// =============================================================================

const batchUpdateSchema = z.object({
  updates: z.array(z.object({
    category: z.string().min(1),
    key: z.string().min(1),
    value: z.unknown(),
  })).min(1).max(50),
  reason: z.string().optional(),
})

/**
 * PUT /api/admin/settings/batch
 * Update multiple settings in a single request.
 * Validates all settings upfront before applying any changes.
 * Returns per-setting results with overall success/failure.
 */
router.put('/batch', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const parseResult = batchUpdateSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const { updates, reason } = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

  // Phase 1: Fetch all existing settings and validate
  const validationErrors: Array<{ category: string; key: string; error: string }> = []
  const validatedUpdates: Array<{
    category: string
    key: string
    value: unknown
    existing: { id: string; value: unknown; is_readonly: boolean; min_value: number | null; max_value: number | null; allowed_values: unknown[] | null }
  }> = []

  // Supabase doesn't support OR-ing multiple AND conditions easily,
  // so fetch all settings for the relevant categories and filter client-side
  const uniqueCategories = [...new Set(updates.map((u) => u.category))]
  const { data: allSettings, error: fetchError } = await supabase
    .from('app_settings')
    .select('*')
    .in('category', uniqueCategories)

  if (fetchError) {
    log.error('Batch fetch error', { error: String(fetchError) })
    return res.status(500).json({ success: false, error: 'Failed to fetch settings' })
  }

  // Build lookup map
  const settingsMap = new Map<string, typeof allSettings[0]>()
  for (const s of allSettings || []) {
    settingsMap.set(`${s.category}:${s.key}`, s)
  }

  // Validate each update
  for (const update of updates) {
    const mapKey = `${update.category}:${update.key}`
    const existing = settingsMap.get(mapKey)

    if (!existing) {
      validationErrors.push({ category: update.category, key: update.key, error: 'Setting not found' })
      continue
    }

    if (existing.is_readonly) {
      validationErrors.push({ category: update.category, key: update.key, error: 'Setting is read-only' })
      continue
    }

    if (existing.min_value !== null && typeof update.value === 'number' && update.value < existing.min_value) {
      validationErrors.push({ category: update.category, key: update.key, error: `Value must be at least ${existing.min_value}` })
      continue
    }

    if (existing.max_value !== null && typeof update.value === 'number' && update.value > existing.max_value) {
      validationErrors.push({ category: update.category, key: update.key, error: `Value must be at most ${existing.max_value}` })
      continue
    }

    if (existing.allowed_values && Array.isArray(existing.allowed_values)) {
      const allowedValues = existing.allowed_values as unknown[]
      if (!allowedValues.includes(update.value)) {
        validationErrors.push({ category: update.category, key: update.key, error: `Value must be one of: ${allowedValues.join(', ')}` })
        continue
      }
    }

    // Skip if value unchanged
    if (JSON.stringify(existing.value) === JSON.stringify(update.value)) {
      continue
    }

    validatedUpdates.push({
      category: update.category,
      key: update.key,
      value: update.value,
      existing,
    })
  }

  // If there are validation errors, return them all (don't apply any changes)
  if (validationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed for one or more settings',
      validationErrors,
      validCount: validatedUpdates.length,
    })
  }

  // Phase 2: Apply all validated updates
  const results: Array<{ category: string; key: string; previousValue: unknown; newValue: unknown }> = []
  const errors: Array<{ category: string; key: string; error: string }> = []

  for (const update of validatedUpdates) {
    try {
      const { error: updateError } = await supabase
        .from('app_settings')
        .update({
          value: update.value,
          updated_by: adminUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('category', update.category)
        .eq('key', update.key)

      if (updateError) {
        errors.push({ category: update.category, key: update.key, error: 'Database update failed' })
        continue
      }

      results.push({
        category: update.category,
        key: update.key,
        previousValue: update.existing.value,
        newValue: update.value,
      })

      // Log audit entry
      if (reason) {
        await supabase.from('settings_audit_log').insert({
          setting_id: update.existing.id,
          category: update.category,
          key: update.key,
          previous_value: update.existing.value,
          new_value: update.value,
          changed_by: adminUserId,
          reason: `[Batch] ${reason}`,
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
        })
      }
    } catch (error) {
      log.error('Batch update error for individual setting', { category: update.category, key: update.key, error: String(error) })
      errors.push({ category: update.category, key: update.key, error: 'Internal error' })
    }
  }

  const skippedCount = updates.length - validatedUpdates.length - validationErrors.length

  // Fire webhooks for batch update (async, non-blocking)
  if (results.length > 0) {
    // Group changes by category for cleaner payloads
    const byCategory = results.reduce<Record<string, Array<{ key: string; previous_value: unknown; new_value: unknown }>>>(
      (acc, r) => {
        if (!acc[r.category]) acc[r.category] = []
        acc[r.category].push({ key: r.key, previous_value: r.previousValue, new_value: r.newValue })
        return acc
      }, {}
    )
    for (const [cat, changes] of Object.entries(byCategory)) {
      fireWebhooks('setting.batch_updated', {
        category: cat,
        changes,
        reason,
        changed_by: adminUserId,
      }).catch((err) => log.warn('Webhook fire error on batch update', { category: cat, error: String(err) }))
    }
  }

  return res.json({
    success: errors.length === 0,
    data: {
      updated: results.length,
      skipped: skippedCount,
      errors: errors.length,
      results,
      ...(errors.length > 0 ? { errorDetails: errors } : {}),
    },
  })
})

// =============================================================================
// FEATURE FLAGS ROUTES (must be before /:category to avoid route conflict)
// =============================================================================

/**
 * GET /api/admin/settings/feature-flags
 * List all feature flags
 */
router.get('/feature-flags', async (_req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  try {
    const { data, error } = await supabase.from('feature_flags').select('*').order('key')

    if (error) {
      log.error('Error fetching feature flags', { error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch feature flags' })
    }

    return res.json({
      success: true,
      data: (data || []).map((flag) => ({
        id: flag.id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercentage: flag.rollout_percentage,
        userSegments: flag.user_segments,
        conditions: flag.conditions,
        expiresAt: flag.expires_at,
        createdAt: flag.created_at,
        updatedAt: flag.updated_at,
      })),
    })
  } catch (error) {
    log.error('Unhandled exception listing feature flags', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/settings/feature-flags/:key
 * Update a feature flag
 */
router.put('/feature-flags/:key', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const { key } = req.params

  const parseResult = updateFeatureFlagSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const updates = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

  try {
    const updateData: Record<string, unknown> = {
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    }

    if (updates.enabled !== undefined) updateData.enabled = updates.enabled
    if (updates.rolloutPercentage !== undefined)
      updateData.rollout_percentage = updates.rolloutPercentage
    if (updates.userSegments !== undefined) updateData.user_segments = updates.userSegments
    if (updates.conditions !== undefined) updateData.conditions = updates.conditions
    if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt

    const { data, error } = await supabase
      .from('feature_flags')
      .update(updateData)
      .eq('key', key)
      .select()
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Feature flag not found' })
    }

    // Fire webhooks for feature flag toggle (async, non-blocking)
    fireWebhooks('feature_flag.toggled', {
      category: 'feature_flags',
      changes: [{ key: data.key, previous_value: null, new_value: { enabled: data.enabled, rolloutPercentage: data.rollout_percentage } }],
      changed_by: adminUserId,
    }).catch((err) => log.warn('Webhook fire error on feature flag toggle', { error: String(err) }))

    return res.json({
      success: true,
      data: {
        key: data.key,
        enabled: data.enabled,
        rolloutPercentage: data.rollout_percentage,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    log.error('Unhandled exception updating feature flag', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// SETTINGS HISTORY ROUTES (must be before /:category catch-all)
// =============================================================================

/**
 * GET /api/admin/settings/history
 * Get audit history for all settings (paginated)
 */
router.get('/history', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const offset = parseInt(req.query.offset as string) || 0
  const category = req.query.category as string | undefined

  try {
    let query = supabase
      .from('settings_audit_log')
      .select(
        `
        id,
        setting_id,
        category,
        key,
        previous_value,
        new_value,
        changed_by,
        changed_at,
        reason,
        ip_address,
        user_agent
      `,
        { count: 'exact' }
      )
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error, count } = await query

    if (error) {
      log.error('Error fetching settings history', { error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch history' })
    }

    // Try to get admin user emails for the changed_by UUIDs
    const changedByIds = [...new Set((data || []).map((entry) => entry.changed_by).filter(Boolean))]
    let adminUsers: Record<string, string> = {}

    if (changedByIds.length > 0) {
      const { data: users } = await supabase
        .from('admin_users')
        .select('id, email')
        .in('id', changedByIds)

      if (users) {
        adminUsers = users.reduce(
          (acc, user) => {
            acc[user.id] = user.email
            return acc
          },
          {} as Record<string, string>
        )
      }
    }

    return res.json({
      success: true,
      data: {
        history: (data || []).map((entry) => ({
          id: entry.id,
          settingId: entry.setting_id,
          category: entry.category,
          key: entry.key,
          previousValue: entry.previous_value,
          newValue: entry.new_value,
          changedBy: entry.changed_by,
          changedByEmail: adminUsers[entry.changed_by] || 'Unknown',
          changedAt: entry.changed_at,
          reason: entry.reason,
          ipAddress: entry.ip_address,
          userAgent: entry.user_agent,
        })),
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit,
        },
      },
    })
  } catch (error) {
    log.error('Unhandled exception fetching settings history', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// REGIONAL FACTORS ROUTES (must be before /:category catch-all)
// =============================================================================

/**
 * GET /api/admin/settings/regional-factors
 * List all regional factors
 */
router.get('/regional-factors', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear()

  try {
    const { data, error } = await supabase
      .from('regional_factors')
      .select('*')
      .eq('year', year)
      .eq('is_active', true)
      .order('region_code')

    if (error) {
      log.error('Error fetching regional factors', { error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch regional factors' })
    }

    return res.json({
      success: true,
      data: (data || []).map((factor) => ({
        id: factor.id,
        regionCode: factor.region_code,
        regionName: factor.region_name,
        regionNameTr: factor.region_name_tr,
        policyType: factor.policy_type,
        riskFactor: factor.risk_factor,
        year: factor.year,
        source: factor.source,
        notes: factor.notes,
      })),
    })
  } catch (error) {
    log.error('Unhandled exception listing regional factors', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/settings/regional-factors/:id
 * Update a regional factor
 */
router.put('/regional-factors/:id', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const { id } = req.params

  const parseResult = updateRegionalFactorSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const { riskFactor, notes } = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

  try {
    const { data, error } = await supabase
      .from('regional_factors')
      .update({
        risk_factor: riskFactor,
        notes,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Regional factor not found' })
    }

    return res.json({
      success: true,
      data: {
        id: data.id,
        regionCode: data.region_code,
        riskFactor: data.risk_factor,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    log.error('Unhandled exception updating regional factor', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// INSURANCE PROVIDERS ROUTES (must be before /:category catch-all)
// =============================================================================

/**
 * GET /api/admin/settings/providers
 * List all insurance providers
 */
router.get('/providers', async (_req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  try {
    const { data, error } = await supabase
      .from('insurance_providers')
      .select('*')
      .order('market_share', { ascending: false })

    if (error) {
      log.error('Error fetching providers', { error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch providers' })
    }

    return res.json({
      success: true,
      data: (data || []).map((provider) => ({
        id: provider.id,
        code: provider.code,
        name: provider.name,
        nameTr: provider.name_tr,
        marketShare: provider.market_share,
        customerRating: provider.customer_rating,
        establishedYear: provider.established_year,
        headquarters: provider.headquarters,
        website: provider.website,
        logoUrl: provider.logo_url,
        specialties: provider.specialties,
        isActive: provider.is_active,
      })),
    })
  } catch (error) {
    log.error('Unhandled exception listing providers', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/settings/providers/:id
 * Update an insurance provider
 */
router.put('/providers/:id', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const { id } = req.params

  const parseResult = updateProviderSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const updates = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

  try {
    const updateData: Record<string, unknown> = {
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    }

    if (updates.marketShare !== undefined) updateData.market_share = updates.marketShare
    if (updates.customerRating !== undefined) updateData.customer_rating = updates.customerRating
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive

    const { data, error } = await supabase
      .from('insurance_providers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Provider not found' })
    }

    return res.json({
      success: true,
      data: {
        id: data.id,
        code: data.code,
        name: data.name,
        marketShare: data.market_share,
        customerRating: data.customer_rating,
        isActive: data.is_active,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    log.error('Unhandled exception updating provider', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// MARKET BENCHMARKS ROUTES (must be before /:category catch-all)
// =============================================================================

/**
 * GET /api/admin/settings/benchmarks
 * List all market benchmarks
 */
router.get('/benchmarks', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const policyType = req.query.policyType as string | undefined
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear()

  try {
    let query = supabase
      .from('market_benchmarks')
      .select('*')
      .eq('year', year)
      .eq('is_active', true)
      .order('policy_type')
      .order('coverage_type')

    if (policyType) {
      query = query.eq('policy_type', policyType)
    }

    const { data, error } = await query

    if (error) {
      log.error('Error fetching benchmarks', { error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch benchmarks' })
    }

    return res.json({
      success: true,
      data: (data || []).map((benchmark) => ({
        id: benchmark.id,
        policyType: benchmark.policy_type,
        coverageType: benchmark.coverage_type,
        coverageNameTr: benchmark.coverage_name_tr,
        regionCode: benchmark.region_code,
        year: benchmark.year,
        minLimit: benchmark.min_limit,
        typicalLimit: benchmark.typical_limit,
        maxLimit: benchmark.max_limit,
        minDeductible: benchmark.min_deductible,
        typicalDeductible: benchmark.typical_deductible,
        maxDeductible: benchmark.max_deductible,
        inclusionRate: benchmark.inclusion_rate,
        importance: benchmark.importance,
        source: benchmark.source,
      })),
    })
  } catch (error) {
    log.error('Unhandled exception listing benchmarks', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/settings/benchmarks/:id
 * Update a market benchmark
 */
router.put('/benchmarks/:id', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const { id } = req.params

  const parseResult = updateBenchmarkSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const updates = parseResult.data
  const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

  try {
    const updateData: Record<string, unknown> = {
      created_by: adminUserId, // Note: using created_by as there's no updated_by in benchmarks
      updated_at: new Date().toISOString(),
    }

    if (updates.minLimit !== undefined) updateData.min_limit = updates.minLimit
    if (updates.typicalLimit !== undefined) updateData.typical_limit = updates.typicalLimit
    if (updates.maxLimit !== undefined) updateData.max_limit = updates.maxLimit
    if (updates.typicalDeductible !== undefined)
      updateData.typical_deductible = updates.typicalDeductible
    if (updates.inclusionRate !== undefined) updateData.inclusion_rate = updates.inclusionRate
    if (updates.importance !== undefined) updateData.importance = updates.importance

    const { data, error } = await supabase
      .from('market_benchmarks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Benchmark not found' })
    }

    return res.json({
      success: true,
      data: {
        id: data.id,
        policyType: data.policy_type,
        coverageType: data.coverage_type,
        typicalLimit: data.typical_limit,
        inclusionRate: data.inclusion_rate,
        importance: data.importance,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    log.error('Unhandled exception updating benchmark', { error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// =============================================================================
// CATEGORY-BASED SETTINGS ROUTES (catch-all — MUST be last)
// =============================================================================

/**
 * GET /api/admin/settings/:category
 * Get all settings for a specific category
 */
router.get('/:category', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const { category } = req.params

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('category', category)
      .order('display_order')

    if (error) {
      log.error('Error fetching category', { category, error: String(error) })
      return res.status(500).json({ success: false, error: 'Failed to fetch settings' })
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' })
    }

    return res.json({
      success: true,
      data: {
        category,
        settings: data.map((setting) => ({
          id: setting.id,
          key: setting.key,
          value: setting.value,
          valueType: setting.value_type,
          description: setting.description,
          descriptionTr: setting.description_tr,
          isSensitive: setting.is_sensitive,
          isReadonly: setting.is_readonly,
          displayOrder: setting.display_order,
          minValue: setting.min_value,
          maxValue: setting.max_value,
          allowedValues: setting.allowed_values,
          updatedAt: setting.updated_at,
        })),
      },
    })
  } catch (error) {
    log.error('Unhandled exception fetching category settings', { category, error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/settings/:category/:key
 * Get a specific setting
 */
router.get('/:category/:key', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const { category, key } = req.params

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('category', category)
      .eq('key', key)
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Setting not found' })
    }

    return res.json({
      success: true,
      data: {
        id: data.id,
        category: data.category,
        key: data.key,
        value: data.value,
        valueType: data.value_type,
        description: data.description,
        descriptionTr: data.description_tr,
        isSensitive: data.is_sensitive,
        isReadonly: data.is_readonly,
        minValue: data.min_value,
        maxValue: data.max_value,
        allowedValues: data.allowed_values,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    log.error('Unhandled exception fetching specific setting', { category, key, error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/settings/:category/:key
 * Update a specific setting
 */
router.put('/:category/:key', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const category = req.params.category as string
  const key = req.params.key as string

  // Validate request body
  const parseResult = updateSettingSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: parseResult.error.issues,
    })
  }

  const { value, reason } = parseResult.data

  try {
    // First, get the current setting to check if it exists and is not readonly
    const { data: existing, error: fetchError } = await supabase
      .from('app_settings')
      .select('*')
      .eq('category', category)
      .eq('key', key)
      .single()

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Setting not found' })
    }

    if (existing.is_readonly) {
      return res.status(403).json({ success: false, error: 'Setting is read-only' })
    }

    // Validate value against constraints
    if (existing.min_value !== null && typeof value === 'number' && value < existing.min_value) {
      return res.status(400).json({
        success: false,
        error: `Value must be at least ${existing.min_value}`,
      })
    }

    if (existing.max_value !== null && typeof value === 'number' && value > existing.max_value) {
      return res.status(400).json({
        success: false,
        error: `Value must be at most ${existing.max_value}`,
      })
    }

    if (existing.allowed_values && Array.isArray(existing.allowed_values)) {
      const allowedValues = existing.allowed_values as unknown[]
      if (!allowedValues.includes(value)) {
        return res.status(400).json({
          success: false,
          error: `Value must be one of: ${allowedValues.join(', ')}`,
        })
      }
    }

    // Get admin user ID from the request (set by admin auth middleware)
    const adminUserId = (req as Request & { adminUser?: { id: string } }).adminUser?.id

    // Update the setting
    const { data: updated, error: updateError } = await supabase
      .from('app_settings')
      .update({
        value,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('category', category)
      .eq('key', key)
      .select()
      .single()

    if (updateError) {
      log.error('Error updating setting', { category, key, error: String(updateError) })
      return res.status(500).json({ success: false, error: 'Failed to update setting' })
    }

    // Log the change with reason if provided
    if (reason) {
      await supabase.from('settings_audit_log').insert({
        setting_id: existing.id,
        category,
        key,
        previous_value: existing.value,
        new_value: value,
        changed_by: adminUserId,
        reason,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      })
    }

    // Fire webhooks (async, non-blocking)
    fireWebhooks('setting.updated', {
      category,
      changes: [{ key, previous_value: existing.value, new_value: value }],
      reason,
      changed_by: adminUserId,
    }).catch((err) => log.warn('Webhook fire error on setting update', { category, key, error: String(err) }))

    return res.json({
      success: true,
      data: {
        key,
        previousValue: existing.value,
        newValue: value,
        updatedAt: updated.updated_at,
      },
    })
  } catch (error) {
    log.error('Unhandled exception updating setting', { category, key, error: String(error) })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router
