/**
 * Processing Log Service
 *
 * Handles persistence and retrieval of document processing logs.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const log = logger.child('ProcessingLogService')

// Import types - use relative path to avoid module issues
interface ProcessingStageRecord {
  stage: string
  status: string
  started_at: string
  completed_at?: string
  duration_ms?: number
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  metadata?: Record<string, unknown>
  error?: string
}

interface DocumentProcessingLog {
  id: string
  document_id: string
  policy_id?: string
  user_id?: string
  filename: string
  file_size?: number
  mime_type?: string
  page_count?: number
  stages: ProcessingStageRecord[]
  status: string
  started_at: string
  completed_at?: string
  total_duration_ms?: number
  error_message?: string
  error_stage?: string
  error_details?: Record<string, unknown>
  ocr_used: boolean
  ocr_engine?: string
  ai_provider?: string
  extraction_confidence?: number
  extracted_summary?: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface ProcessingLogFilters {
  user_id?: string
  status?: string
  ocr_used?: boolean
  ai_provider?: string
  from_date?: string
  to_date?: string
  search?: string
  limit?: number
  offset?: number
}

interface ProcessingLogStats {
  total: number
  completed: number
  failed: number
  processing: number
  avg_duration_ms: number
  ocr_usage_rate: number
  ai_provider_breakdown: Record<string, number>
}

let supabase: SupabaseClient | null = null

/**
 * Get Supabase client for processing logs (uses service role)
 */
function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    log.warn('Supabase not configured', {
      hasUrl: String(!!url),
      hasKey: String(!!key),
      urlSource: process.env.SUPABASE_URL ? 'SUPABASE_URL' : (process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : 'none'),
    })
    return null
  }

  log.info('Supabase configured', { url: url.substring(0, 30) + '...' })
  supabase = createClient(url, key)
  return supabase
}

/**
 * Create a new processing log entry
 */
export async function createProcessingLog(
  log: Omit<DocumentProcessingLog, 'id' | 'created_at' | 'updated_at'>
): Promise<{ data: DocumentProcessingLog | null; error: string | null }> {
  const client = getSupabase()
  if (!client) {
    return { data: null, error: 'Supabase client not configured' }
  }

  logger.child('ProcessingLogService').info('Inserting log', { documentId: log.document_id })

  const { data, error } = await client
    .from('document_processing_logs')
    .insert([log])
    .select()
    .single()

  if (error) {
    logger.child('ProcessingLogService').error('Failed to create log', { code: error.code, message: error.message })
    return { data: null, error: `${error.code}: ${error.message}` }
  }

  logger.child('ProcessingLogService').info('Log created successfully', { id: data?.id })
  return { data: data as DocumentProcessingLog, error: null }
}

/**
 * Update an existing processing log
 */
export async function updateProcessingLog(
  documentId: string,
  updates: Partial<DocumentProcessingLog>
): Promise<DocumentProcessingLog | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('document_processing_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('document_id', documentId)
    .select()
    .single()

  if (error) {
    console.error('[ProcessingLogService] Failed to update log:', error)
    return null
  }

  return data as DocumentProcessingLog
}

/**
 * Add a stage to an existing processing log
 */
export async function addProcessingStage(
  documentId: string,
  stage: ProcessingStageRecord
): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false

  // First get the current stages
  const { data: current, error: fetchError } = await client
    .from('document_processing_logs')
    .select('stages')
    .eq('document_id', documentId)
    .single()

  if (fetchError) {
    console.error('[ProcessingLogService] Failed to fetch log for stage update:', fetchError)
    return false
  }

  const currentStages = (current?.stages as ProcessingStageRecord[]) || []
  const newStages = [...currentStages, stage]

  const { error: updateError } = await client
    .from('document_processing_logs')
    .update({
      stages: newStages,
      updated_at: new Date().toISOString(),
    })
    .eq('document_id', documentId)

  if (updateError) {
    console.error('[ProcessingLogService] Failed to add stage:', updateError)
    return false
  }

  return true
}

/**
 * Get a processing log by document ID
 */
export async function getProcessingLog(
  documentId: string
): Promise<DocumentProcessingLog | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('document_processing_logs')
    .select('*')
    .eq('document_id', documentId)
    .single()

  if (error) {
    console.error('[ProcessingLogService] Failed to get log:', error)
    return null
  }

  return data as DocumentProcessingLog
}

/**
 * Get a processing log by policy ID
 */
export async function getProcessingLogByPolicyId(
  policyId: string
): Promise<DocumentProcessingLog | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('document_processing_logs')
    .select('*')
    .eq('policy_id', policyId)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    console.error('[ProcessingLogService] Failed to get log by policy:', error)
    return null
  }

  return data as DocumentProcessingLog | null
}

/**
 * List processing logs with filtering and pagination
 */
export async function listProcessingLogs(
  filters: ProcessingLogFilters = {}
): Promise<{ logs: DocumentProcessingLog[]; total: number }> {
  const client = getSupabase()
  if (!client) return { logs: [], total: 0 }

  const { limit = 50, offset = 0, ...queryFilters } = filters

  let query = client
    .from('document_processing_logs')
    .select('*', { count: 'exact' })

  // Apply filters
  if (queryFilters.user_id) {
    query = query.eq('user_id', queryFilters.user_id)
  }
  if (queryFilters.status) {
    query = query.eq('status', queryFilters.status)
  }
  if (queryFilters.ocr_used !== undefined) {
    query = query.eq('ocr_used', queryFilters.ocr_used)
  }
  if (queryFilters.ai_provider) {
    query = query.eq('ai_provider', queryFilters.ai_provider)
  }
  if (queryFilters.from_date) {
    query = query.gte('started_at', queryFilters.from_date)
  }
  if (queryFilters.to_date) {
    query = query.lte('started_at', queryFilters.to_date)
  }
  if (queryFilters.search) {
    query = query.ilike('filename', `%${queryFilters.search}%`)
  }

  // Apply pagination and ordering
  query = query
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[ProcessingLogService] Failed to list logs:', error)
    return { logs: [], total: 0 }
  }

  return {
    logs: (data || []) as DocumentProcessingLog[],
    total: count || 0,
  }
}

/**
 * Get processing statistics for admin dashboard
 */
export async function getProcessingStats(
  days: number = 30
): Promise<ProcessingLogStats> {
  const client = getSupabase()
  if (!client) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      processing: 0,
      avg_duration_ms: 0,
      ocr_usage_rate: 0,
      ai_provider_breakdown: {},
    }
  }

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  const { data, error } = await client
    .from('document_processing_logs')
    .select('status, total_duration_ms, ocr_used, ai_provider')
    .gte('started_at', fromDate.toISOString())

  if (error) {
    console.error('[ProcessingLogService] Failed to get stats:', error)
    return {
      total: 0,
      completed: 0,
      failed: 0,
      processing: 0,
      avg_duration_ms: 0,
      ocr_usage_rate: 0,
      ai_provider_breakdown: {},
    }
  }

  const logs = data || []
  const total = logs.length
  const completed = logs.filter((l) => l.status === 'completed').length
  const failed = logs.filter((l) => l.status === 'failed').length
  const processing = logs.filter((l) => l.status === 'processing').length
  const ocrUsed = logs.filter((l) => l.ocr_used).length

  const durations = logs
    .filter((l) => l.total_duration_ms)
    .map((l) => l.total_duration_ms as number)
  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0

  const providerCounts: Record<string, number> = {}
  logs.forEach((l) => {
    if (l.ai_provider) {
      providerCounts[l.ai_provider] = (providerCounts[l.ai_provider] || 0) + 1
    }
  })

  return {
    total,
    completed,
    failed,
    processing,
    avg_duration_ms: Math.round(avgDuration),
    ocr_usage_rate: total > 0 ? (ocrUsed / total) * 100 : 0,
    ai_provider_breakdown: providerCounts,
  }
}

/**
 * Delete old processing logs (for cleanup)
 */
export async function deleteOldLogs(daysOld: number = 90): Promise<number> {
  const client = getSupabase()
  if (!client) return 0

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  const { data, error } = await client
    .from('document_processing_logs')
    .delete()
    .lt('started_at', cutoffDate.toISOString())
    .select('id')

  if (error) {
    console.error('[ProcessingLogService] Failed to delete old logs:', error)
    return 0
  }

  return data?.length || 0
}
