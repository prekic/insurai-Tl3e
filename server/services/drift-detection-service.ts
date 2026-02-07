/**
 * Config Drift Detection Service
 *
 * Compares current runtime settings against a saved baseline snapshot
 * to detect configuration drift.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const log = logger.child('DriftDetection')

// =============================================================================
// TYPES
// =============================================================================

export interface DriftBaseline {
  id: string
  name: string
  description?: string
  snapshot: Record<string, Record<string, unknown>> // { category: { key: value } }
  created_by?: string
  created_at: string
  is_active: boolean
}

export interface DriftChange {
  category: string
  key: string
  baselineValue: unknown
  currentValue: unknown
}

export interface DriftReport {
  baseline: {
    id: string
    name: string
    created_at: string
  }
  drifts: DriftChange[]
  totalSettings: number
  driftedCount: number
  matchedCount: number
  missingFromCurrent: number
  addedSinceBaseline: number
  checkedAt: string
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    log.warn('Supabase not configured')
    return null
  }

  supabase = createClient(url, key)
  return supabase
}

// =============================================================================
// BASELINE CRUD
// =============================================================================

/**
 * List all baselines ordered by creation date.
 */
export async function listBaselines(): Promise<DriftBaseline[]> {
  const client = getSupabase()
  if (!client) return []

  const { data, error } = await client
    .from('config_drift_baselines')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    log.error('List error', { error: String(error) })
    return []
  }

  return (data || []) as DriftBaseline[]
}

/**
 * Get the currently active baseline.
 */
export async function getActiveBaseline(): Promise<DriftBaseline | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('config_drift_baselines')
    .select('*')
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return data as DriftBaseline
}

/**
 * Take a snapshot of current settings and save as a new baseline.
 */
export async function createBaseline(
  name: string,
  description: string | undefined,
  createdBy: string | undefined,
  activate: boolean = true
): Promise<DriftBaseline | null> {
  const client = getSupabase()
  if (!client) return null

  // Fetch current settings
  const snapshot = await fetchCurrentSettingsSnapshot(client)
  if (!snapshot) return null

  // If activating, deactivate all existing baselines first
  if (activate) {
    await client
      .from('config_drift_baselines')
      .update({ is_active: false })
      .eq('is_active', true)
  }

  const { data, error } = await client
    .from('config_drift_baselines')
    .insert([{
      name,
      description,
      snapshot,
      created_by: createdBy,
      is_active: activate,
    }])
    .select()
    .single()

  if (error) {
    log.error('Create baseline error', { error: String(error) })
    return null
  }

  return data as DriftBaseline
}

/**
 * Set a specific baseline as active.
 */
export async function activateBaseline(id: string): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false

  // Deactivate all, then activate the target
  await client
    .from('config_drift_baselines')
    .update({ is_active: false })
    .eq('is_active', true)

  const { error } = await client
    .from('config_drift_baselines')
    .update({ is_active: true })
    .eq('id', id)

  if (error) {
    log.error('Activate error', { error: String(error) })
    return false
  }

  return true
}

/**
 * Delete a baseline.
 */
export async function deleteBaseline(id: string): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false

  const { error } = await client
    .from('config_drift_baselines')
    .delete()
    .eq('id', id)

  if (error) {
    log.error('Delete error', { error: String(error) })
    return false
  }

  return true
}

// =============================================================================
// DRIFT DETECTION
// =============================================================================

/**
 * Compare current settings against the active baseline and return drifts.
 */
export async function detectDrift(): Promise<DriftReport | null> {
  const client = getSupabase()
  if (!client) return null

  const baseline = await getActiveBaseline()
  if (!baseline) return null

  const current = await fetchCurrentSettingsSnapshot(client)
  if (!current) return null

  return compareSnapshots(baseline, current)
}

/**
 * Compare current settings against a specific baseline.
 */
export async function detectDriftAgainst(baselineId: string): Promise<DriftReport | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('config_drift_baselines')
    .select('*')
    .eq('id', baselineId)
    .single()

  if (error || !data) return null

  const baseline = data as DriftBaseline
  const current = await fetchCurrentSettingsSnapshot(client)
  if (!current) return null

  return compareSnapshots(baseline, current)
}

/**
 * Core comparison: baseline snapshot vs current snapshot.
 */
export function compareSnapshots(
  baseline: DriftBaseline,
  current: Record<string, Record<string, unknown>>
): DriftReport {
  const drifts: DriftChange[] = []
  let totalSettings = 0
  let missingFromCurrent = 0
  let addedSinceBaseline = 0

  // Check every setting in the baseline against current
  for (const [category, settings] of Object.entries(baseline.snapshot)) {
    const currentCategory = current[category] || {}

    for (const [key, baselineValue] of Object.entries(settings)) {
      totalSettings++

      if (!(key in currentCategory)) {
        // Setting was in baseline but missing from current (deleted)
        missingFromCurrent++
        drifts.push({ category, key, baselineValue, currentValue: undefined })
        continue
      }

      const currentValue = currentCategory[key]
      if (!valuesEqual(baselineValue, currentValue)) {
        drifts.push({ category, key, baselineValue, currentValue })
      }
    }
  }

  // Check for settings in current that weren't in baseline (added)
  for (const [category, settings] of Object.entries(current)) {
    const baselineCategory = baseline.snapshot[category] || {}

    for (const key of Object.keys(settings)) {
      if (!(key in baselineCategory)) {
        addedSinceBaseline++
        totalSettings++
        drifts.push({
          category,
          key,
          baselineValue: undefined,
          currentValue: settings[key],
        })
      }
    }
  }

  return {
    baseline: {
      id: baseline.id,
      name: baseline.name,
      created_at: baseline.created_at,
    },
    drifts,
    totalSettings,
    driftedCount: drifts.length,
    matchedCount: totalSettings - drifts.length,
    missingFromCurrent,
    addedSinceBaseline,
    checkedAt: new Date().toISOString(),
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Fetch current settings from DB as a flat { category: { key: value } } map.
 */
async function fetchCurrentSettingsSnapshot(
  client: SupabaseClient
): Promise<Record<string, Record<string, unknown>> | null> {
  const { data, error } = await client
    .from('app_settings')
    .select('category, key, value')
    .order('category')
    .order('key')

  if (error) {
    log.error('Fetch settings error', { error: String(error) })
    return null
  }

  const snapshot: Record<string, Record<string, unknown>> = {}
  for (const row of data || []) {
    if (!snapshot[row.category]) snapshot[row.category] = {}
    snapshot[row.category][row.key] = row.value
  }

  return snapshot
}

/**
 * Deep-equal comparison that handles JSON serialization differences.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  // Handle nullish
  if (a === b) return true
  if (a == null && b == null) return true

  // Normalize: string numbers should match actual numbers
  if (typeof a === 'string' && typeof b === 'number') {
    return !isNaN(Number(a)) && Number(a) === b
  }
  if (typeof a === 'number' && typeof b === 'string') {
    return !isNaN(Number(b)) && a === Number(b)
  }

  // Deep compare via JSON
  return JSON.stringify(a) === JSON.stringify(b)
}

// Export for testing
export { valuesEqual, fetchCurrentSettingsSnapshot }
