import { Router, Request, Response } from 'express'
import { getSupabaseWithError } from './shared.js'
import { logger } from '../../lib/logger.js'

const log = logger.child('actuarial')
const router = Router()

/**
 * GET /api/admin/actuarial/configs
 * Fetches the latest active version for all actuarial config sets.
 */
router.get('/configs', async (_req: Request, res: Response) => {
  try {
    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      return res.status(503).json({ success: false, error: dbError || 'Database not configured' })
    }

    // Query active config sets and join with their latest active version.
    // Using a lateral join or DISTINCT ON in SQL is cleaner, but via Supabase JS
    // we fetch sets and their latest active versions in one query.
    const { data: configSets, error } = await supabase
      .from('actuarial_config_sets')
      .select(
        `
        id,
        name,
        description,
        config_type,
        is_active,
        updated_at,
        versions:actuarial_config_set_versions(
          id,
          version,
          config_data,
          change_summary,
          created_at
        )
      `
      )
      .eq('is_active', true)
      .eq('versions.is_active', true)
      .order('version', { ascending: false, referencedTable: 'actuarial_config_set_versions' })
      .limit(1, { referencedTable: 'actuarial_config_set_versions' })

    if (error) throw error

    // Transform the result to flatten the latest version into the set
    interface ConfigSetRow {
      id: string
      name: string
      description: string | null
      config_type: string
      is_active: boolean
      updated_at: string
      versions: Array<{
        id: string
        version: number
        config_data: unknown
        change_summary: string | null
        created_at: string
      }>
    }

    const result = (configSets as ConfigSetRow[]).map((set) => {
      const latestVersion = set.versions && set.versions.length > 0 ? set.versions[0] : null
      return {
        id: set.id,
        name: set.name,
        description: set.description,
        configType: set.config_type,
        isActive: set.is_active,
        updatedAt: set.updated_at,
        latestVersion: latestVersion
          ? {
              id: latestVersion.id,
              version: latestVersion.version,
              configData: latestVersion.config_data,
              changeSummary: latestVersion.change_summary,
              createdAt: latestVersion.created_at,
            }
          : null,
      }
    })

    res.json({ success: true, data: result })
  } catch (error) {
    log.error('Error fetching actuarial configs', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to fetch actuarial configs' })
  }
})

/**
 * POST /api/admin/actuarial/configs/:name/version
 * Creates a new version for a specific config set.
 */
router.post('/configs/:name/version', async (req: Request, res: Response) => {
  try {
    const { name } = req.params
    const { configData, changeSummary } = req.body

    if (!configData) {
      return res.status(400).json({ success: false, error: 'configData is required' })
    }

    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      return res.status(503).json({ success: false, error: dbError || 'Database not configured' })
    }

    // 1. Get the parent config set ID
    const { data: configSet, error: fetchError } = await supabase
      .from('actuarial_config_sets')
      .select('id')
      .eq('name', name)
      .single()

    if (fetchError || !configSet) {
      return res.status(404).json({ success: false, error: 'Config set not found' })
    }

    // 2. Get the current max version number for this set
    const { data: maxVersionData, error: _maxVersionError } = await supabase
      .from('actuarial_config_set_versions')
      .select('version')
      .eq('config_set_id', configSet.id)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const newVersionNum = maxVersionData ? maxVersionData.version + 1 : 1

    // 3. Insert the new version
    const { data: newVersion, error: insertError } = await supabase
      .from('actuarial_config_set_versions')
      .insert({
        config_set_id: configSet.id,
        version: newVersionNum,
        config_data: configData,
        change_summary: changeSummary || 'Updated via Admin UI',
        is_active: true,
      })
      .select()
      .single()

    if (insertError) throw insertError

    res.json({ success: true, data: newVersion })
  } catch (error) {
    log.error('Error creating actuarial config version', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to create config version' })
  }
})

/**
 * POST /api/admin/actuarial/evaluation-results
 * Persists an evaluation result to the database (P2 + P3).
 */
router.post('/evaluation-results', async (req: Request, res: Response) => {
  try {
    const { persistEvaluationResult } = await import('../../services/actuarial-persistence.js')
    const body = req.body

    if (!body.policyId || !body.resultData) {
      return res.status(400).json({ success: false, error: 'policyId and resultData are required' })
    }

    const resultId = await persistEvaluationResult({
      policyId: body.policyId,
      resultData: body.resultData,
      eligible: body.eligible ?? false,
      blockingReasonCount: body.blockingReasonCount ?? 0,
      warningCount: body.warningCount ?? 0,
      expectedOopAmount: body.expectedOopAmount,
      contractQualityScore: body.contractQualityScore,
      topsisCloseness: body.topsisCloseness,
      topsisRank: body.topsisRank,
      topsisGrade: body.topsisGrade,
      needsReview: body.needsReview ?? false,
      durationMs: body.durationMs,
      layerAMs: body.layerAMs,
      layerBMs: body.layerBMs,
      layerCMs: body.layerCMs,
      layerDMs: body.layerDMs,
      monteCarloLowerBound: body.monteCarloLowerBound,
      monteCarloUpperBound: body.monteCarloUpperBound,
    })

    if (resultId) {
      res.json({ success: true, data: { id: resultId } })
    } else {
      res.status(500).json({ success: false, error: 'Failed to persist evaluation result' })
    }
  } catch (error) {
    log.error('Error persisting evaluation result', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Server error persisting evaluation result' })
  }
})

/**
 * GET /api/admin/actuarial/evaluation-results
 * Retrieves historical evaluation results with optional filtering (P3).
 */
router.get('/evaluation-results', async (_req: Request, res: Response) => {
  try {
    const { getEvaluationHistory } = await import('../../services/actuarial-persistence.js')

    const policyId = typeof _req.query.policyId === 'string' ? _req.query.policyId : undefined
    const limit = Number(_req.query.limit) || 50
    const offset = Number(_req.query.offset) || 0

    const result = await getEvaluationHistory({ policyId, limit, offset })

    if (result) {
      res.json({ success: true, data: result.data, total: result.total })
    } else {
      res.status(500).json({ success: false, error: 'Failed to fetch evaluation history' })
    }
  } catch (error) {
    log.error('Error fetching evaluation history', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Server error fetching history' })
  }
})

/**
 * PATCH /api/admin/actuarial/feature-flag
 * Toggles the actuarial_engine_enabled feature flag (P2).
 */
router.patch('/feature-flag', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' })
    }

    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      return res.status(503).json({ success: false, error: dbError || 'Database not configured' })
    }

    const { error: updateError } = await supabase
      .from('feature_flags')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('key', 'actuarial_engine_enabled')

    if (updateError) {
      throw updateError
    }

    log.info('Actuarial engine feature flag updated', { enabled })
    res.json({ success: true, data: { enabled } })
  } catch (error) {
    log.error('Error updating feature flag', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to update feature flag' })
  }
})

/**
 * GET /api/admin/actuarial/performance-metrics
 * Retrieves metrics such as average Monte Carlo execution time over the last 24h.
 */
router.get('/performance-metrics', async (_req: Request, res: Response) => {
  try {
    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      return res.status(503).json({ success: false, error: dbError || 'Database not configured' })
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('actuarial_evaluation_runs')
      .select('layer_c_ms, duration_ms')
      .gte('completed_at', twentyFourHoursAgo)
      .not('layer_c_ms', 'is', null)

    if (error) throw error

    let totalLayerCMs = 0
    let totalDurationMs = 0
    let count = 0

    for (const run of data || []) {
      if (run.layer_c_ms != null) {
        totalLayerCMs += Number(run.layer_c_ms)
        totalDurationMs += Number(run.duration_ms) || 0
        count++
      }
    }

    const avgLayerCMs = count > 0 ? Math.round(totalLayerCMs / count) : null
    const avgDurationMs = count > 0 ? Math.round(totalDurationMs / count) : null

    res.json({
      success: true,
      data: {
        avgLayerCMs,
        avgDurationMs,
        sampleSize: count,
        timeframe: '24h',
      },
    })
  } catch (error) {
    log.error('Error fetching performance metrics', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to fetch performance metrics' })
  }
})

/**
 * GET /api/admin/actuarial/analytics
 * Retrieves historical analytics including daily buckets and component latencies.
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      return res.status(503).json({ success: false, error: dbError || 'Database not configured' })
    }

    const days = Number(req.query.days) || 7
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data: runs, error } = await supabase
      .from('actuarial_evaluation_runs')
      .select(
        'eligible, status, duration_ms, layer_a_ms, layer_b_ms, layer_c_ms, layer_d_ms, completed_at'
      )
      .gte('completed_at', startDate)
      .order('completed_at', { ascending: true })

    if (error) throw error

    // Process data into daily buckets
    const dailyBucketsMap = new Map<string, any>()
    let totalSuccess = 0
    let totalFailed = 0

    for (const run of runs || []) {
      if (!run.completed_at) continue

      const dateStr = run.completed_at.split('T')[0]
      if (!dailyBucketsMap.has(dateStr)) {
        dailyBucketsMap.set(dateStr, {
          date: dateStr,
          total: 0,
          success: 0,
          failed: 0,
          totalDuration: 0,
          totalA: 0,
          totalB: 0,
          totalC: 0,
          totalD: 0,
          validDCount: 0,
        })
      }

      const bucket = dailyBucketsMap.get(dateStr)
      bucket.total += 1
      if (run.eligible) {
        bucket.success += 1
        totalSuccess += 1
      } else {
        bucket.failed += 1
        totalFailed += 1
      }

      bucket.totalDuration += run.duration_ms || 0
      bucket.totalA += run.layer_a_ms || 0
      bucket.totalB += run.layer_b_ms || 0
      bucket.totalC += run.layer_c_ms || 0

      if (run.layer_d_ms != null) {
        bucket.totalD += run.layer_d_ms
        bucket.validDCount += 1
      }
    }

    const daily_buckets = Array.from(dailyBucketsMap.values()).map((b) => ({
      date: b.date,
      total: b.total,
      success: b.success,
      failed: b.failed,
      avg_latency_ms: b.total > 0 ? Math.round(b.totalDuration / b.total) : 0,
      avg_layer_a_ms: b.total > 0 ? Math.round(b.totalA / b.total) : 0,
      avg_layer_b_ms: b.total > 0 ? Math.round(b.totalB / b.total) : 0,
      avg_layer_c_ms: b.total > 0 ? Math.round(b.totalC / b.total) : 0,
      avg_layer_d_ms: b.validDCount > 0 ? Math.round(b.totalD / b.validDCount) : null,
    }))

    const totalRuns = runs?.length || 0
    const overall = {
      total: totalRuns,
      success: totalSuccess,
      failed: totalFailed,
      error_rate: totalRuns > 0 ? totalFailed / totalRuns : 0,
    }

    res.json({
      success: true,
      data: {
        overall,
        daily_buckets,
        buffer_size: totalRuns,
      },
    })
  } catch (error) {
    log.error('Error fetching actuarial analytics', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' })
  }
})

export default router
