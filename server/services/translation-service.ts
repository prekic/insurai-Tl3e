/**
 * Translation Service
 *
 * Provides database-backed translation management with in-memory caching.
 * Handles CRUD operations for translations, locales, and keys.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import logger from '../lib/logger.js'

const log = logger.child('TranslationService')

// =============================================================================
// TYPES
// =============================================================================

export interface TranslationLocale {
  code: string
  name: string
  nativeName: string
  flag: string
  isRtl: boolean
  isActive: boolean
  isDefault: boolean
  displayOrder: number
}

export interface TranslationKey {
  id: string
  section: string
  key: string
  description: string | null
  context: string | null
  maxLength: number | null
}

export interface Translation {
  id: string
  keyId: string
  locale: string
  value: string
  isReviewed: boolean
  updatedBy: string | null
  updatedAt: string
}

export interface TranslationWithKey extends Translation {
  section: string
  key: string
}

export interface CoverageStats {
  locale: string
  total: number
  translated: number
  reviewed: number
  percentage: number
  reviewedPercentage: number
  bySectionCount: Record<string, { total: number; translated: number }>
}

export interface TranslationDictionary {
  [section: string]: {
    [key: string]: string
  }
}

export interface AuditEntry {
  id: string
  locale: string
  section: string
  key: string
  previousValue: string | null
  newValue: string
  changedBy: string | null
  changedAt: string
}

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  data: TranslationDictionary
  timestamp: number
  version: string
}

const translationCache = new Map<string, CacheEntry>()
// Default 300000 (5 min) — configurable via app_settings server.translation_cache_ttl_ms
let CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Lazy-load config override (fire-and-forget, non-blocking)
let _translationConfigLoaded = false
async function _loadTranslationConfig(): Promise<void> {
  if (_translationConfigLoaded) return
  _translationConfigLoaded = true
  try {
    const { getServerConfig } = await import('./config-service.js')
    const serverCfg = await getServerConfig()
    CACHE_TTL_MS = serverCfg.translationCacheTtlMs
  } catch {
    // Keep defaults
  }
}
setTimeout(() => _loadTranslationConfig(), 3000)
let localesCache: { data: TranslationLocale[]; timestamp: number } | null = null
let versionCache: { version: string; timestamp: number } | null = null

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return null
  }

  return createClient(supabaseUrl, serviceKey)
}

// =============================================================================
// VERSION TRACKING
// =============================================================================

export async function getTranslationVersion(): Promise<string> {
  if (versionCache && Date.now() - versionCache.timestamp < CACHE_TTL_MS) {
    return versionCache.version
  }

  const supabase = getSupabase()
  if (!supabase) return '0'

  const { data } = await supabase
    .from('translation_metadata')
    .select('value')
    .eq('key', 'version')
    .single()

  const version = data?.value ? String(data.value).replace(/"/g, '') : '0'
  versionCache = { version, timestamp: Date.now() }
  return version
}

// =============================================================================
// LOCALE OPERATIONS
// =============================================================================

export async function getActiveLocales(): Promise<TranslationLocale[]> {
  if (localesCache && Date.now() - localesCache.timestamp < CACHE_TTL_MS) {
    return localesCache.data
  }

  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('translation_locales')
    .select('*')
    .eq('is_active', true)
    .order('display_order')

  if (error) {
    log.error('Failed to fetch locales', { error: error.message })
    return []
  }

  const locales: TranslationLocale[] = (data || []).map((row: Record<string, unknown>) => ({
    code: row.code as string,
    name: row.name as string,
    nativeName: row.native_name as string,
    flag: row.flag as string,
    isRtl: row.is_rtl as boolean,
    isActive: row.is_active as boolean,
    isDefault: row.is_default as boolean,
    displayOrder: row.display_order as number,
  }))

  localesCache = { data: locales, timestamp: Date.now() }
  return locales
}

export async function getAllLocales(): Promise<TranslationLocale[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('translation_locales')
    .select('*')
    .order('display_order')

  if (error) {
    log.error('Failed to fetch all locales', { error: error.message })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    code: row.code as string,
    name: row.name as string,
    nativeName: row.native_name as string,
    flag: row.flag as string,
    isRtl: row.is_rtl as boolean,
    isActive: row.is_active as boolean,
    isDefault: row.is_default as boolean,
    displayOrder: row.display_order as number,
  }))
}

export async function createLocale(locale: {
  code: string
  name: string
  nativeName: string
  flag?: string
  isRtl?: boolean
  displayOrder?: number
}): Promise<TranslationLocale | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('translation_locales')
    .insert({
      code: locale.code,
      name: locale.name,
      native_name: locale.nativeName,
      flag: locale.flag || '🌐',
      is_rtl: locale.isRtl || false,
      is_active: true,
      is_default: false,
      display_order: locale.displayOrder || 99,
    })
    .select()
    .single()

  if (error) {
    log.error('Failed to create locale', { code: locale.code, error: error.message })
    return null
  }

  localesCache = null // Invalidate cache
  return {
    code: data.code,
    name: data.name,
    nativeName: data.native_name,
    flag: data.flag,
    isRtl: data.is_rtl,
    isActive: data.is_active,
    isDefault: data.is_default,
    displayOrder: data.display_order,
  }
}

export async function updateLocale(
  code: string,
  updates: Partial<{
    name: string
    nativeName: string
    flag: string
    isRtl: boolean
    isActive: boolean
    displayOrder: number
  }>
): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false

  const dbUpdates: Record<string, unknown> = {}
  if (updates.name !== undefined) dbUpdates.name = updates.name
  if (updates.nativeName !== undefined) dbUpdates.native_name = updates.nativeName
  if (updates.flag !== undefined) dbUpdates.flag = updates.flag
  if (updates.isRtl !== undefined) dbUpdates.is_rtl = updates.isRtl
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive
  if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder

  const { error } = await supabase.from('translation_locales').update(dbUpdates).eq('code', code)

  if (error) {
    log.error('Failed to update locale', { code, error: error.message })
    return false
  }

  localesCache = null // Invalidate cache
  return true
}

// =============================================================================
// KEY OPERATIONS
// =============================================================================

export async function getAllKeys(): Promise<TranslationKey[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('translation_keys')
    .select('*')
    .order('section')
    .order('key')

  if (error) {
    log.error('Failed to fetch translation keys', { error: error.message })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    section: row.section as string,
    key: row.key as string,
    description: row.description as string | null,
    context: row.context as string | null,
    maxLength: row.max_length as number | null,
  }))
}

export async function createKey(key: {
  section: string
  key: string
  description?: string
  context?: string
  maxLength?: number
}): Promise<TranslationKey | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('translation_keys')
    .insert({
      section: key.section,
      key: key.key,
      description: key.description || null,
      context: key.context || null,
      max_length: key.maxLength || null,
    })
    .select()
    .single()

  if (error) {
    log.error('Failed to create translation key', {
      section: key.section,
      key: key.key,
      error: error.message,
    })
    return null
  }

  return {
    id: data.id,
    section: data.section,
    key: data.key,
    description: data.description,
    context: data.context,
    maxLength: data.max_length,
  }
}

export async function deleteKey(section: string, key: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false

  const { error } = await supabase
    .from('translation_keys')
    .delete()
    .eq('section', section)
    .eq('key', key)

  if (error) {
    log.error('Failed to delete translation key', { section, key, error: error.message })
    return false
  }

  // Invalidate all caches since translations for this key are cascade-deleted
  translationCache.clear()
  return true
}

// =============================================================================
// TRANSLATION OPERATIONS
// =============================================================================

/**
 * Get all translations for a locale as a nested TranslationDictionary.
 * This is the primary endpoint for the frontend.
 */
export async function getTranslationsForLocale(
  locale: string
): Promise<TranslationDictionary | null> {
  // Check cache
  const cached = translationCache.get(locale)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('translations')
    .select(
      `
      value,
      translation_keys!inner(section, key)
    `
    )
    .eq('locale', locale)

  if (error) {
    log.error('Failed to fetch translations', { locale, error: error.message })
    return null
  }

  if (!data || data.length === 0) return null

  // Build nested dictionary
  const dict: TranslationDictionary = {}
  for (const row of data) {
    // Supabase-js types row.translation_keys loosely as Json; the runtime
    // shape is always { section, key } from the FK join.
    // eslint-disable-next-line no-restricted-syntax
    const keyInfo = row.translation_keys as unknown as { section: string; key: string }
    const section = keyInfo.section
    const key = keyInfo.key

    if (!dict[section]) dict[section] = {}
    dict[section][key] = row.value
  }

  // Cache result
  const version = await getTranslationVersion()
  translationCache.set(locale, {
    data: dict,
    timestamp: Date.now(),
    version,
  })

  return dict
}

/**
 * Get all translations for a locale as a flat list with key info.
 * Used by admin UI.
 */
export async function getTranslationsFlat(locale: string): Promise<TranslationWithKey[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('translations')
    .select(
      `
      id, key_id, locale, value, is_reviewed, updated_by, updated_at,
      translation_keys!inner(section, key)
    `
    )
    .eq('locale', locale)

  if (error) {
    log.error('Failed to fetch flat translations', { locale, error: error.message })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => {
    // Same Supabase join boundary as above.
    // eslint-disable-next-line no-restricted-syntax
    const keyInfo = row.translation_keys as unknown as { section: string; key: string }
    return {
      id: row.id as string,
      keyId: row.key_id as string,
      locale: row.locale as string,
      value: row.value as string,
      isReviewed: row.is_reviewed as boolean,
      updatedBy: row.updated_by as string | null,
      updatedAt: row.updated_at as string,
      section: keyInfo.section,
      key: keyInfo.key,
    }
  })
}

/**
 * Update a single translation.
 */
export async function updateTranslation(
  locale: string,
  section: string,
  key: string,
  value: string,
  adminId?: string
): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false

  // Find the key ID
  const { data: keyData, error: keyError } = await supabase
    .from('translation_keys')
    .select('id')
    .eq('section', section)
    .eq('key', key)
    .single()

  if (keyError || !keyData) {
    log.error('Translation key not found', { section, key, error: keyError?.message })
    return false
  }

  // Upsert the translation
  const { error } = await supabase.from('translations').upsert(
    {
      key_id: keyData.id,
      locale,
      value,
      is_reviewed: true,
      updated_by: adminId || null,
    },
    { onConflict: 'key_id,locale' }
  )

  if (error) {
    log.error('Failed to update translation', { locale, section, key, error: error.message })
    return false
  }

  // Invalidate cache for this locale
  translationCache.delete(locale)
  versionCache = null
  return true
}

/**
 * Batch update translations for a locale.
 */
export async function batchUpdateTranslations(
  locale: string,
  updates: Array<{ section: string; key: string; value: string }>,
  adminId?: string
): Promise<{ applied: number; failed: number; errors: string[] }> {
  const result = { applied: 0, failed: 0, errors: [] as string[] }

  const supabase = getSupabase()
  if (!supabase) {
    result.errors.push('Database not configured')
    return result
  }

  // Look up all key IDs in one query
  const { data: allKeys } = await supabase.from('translation_keys').select('id, section, key')

  if (!allKeys) {
    result.errors.push('Failed to fetch translation keys')
    return result
  }

  const keyMap = new Map<string, string>()
  for (const k of allKeys) {
    keyMap.set(`${k.section}.${k.key}`, k.id)
  }

  // Build upsert rows
  const rows = []
  for (const update of updates) {
    const keyId = keyMap.get(`${update.section}.${update.key}`)
    if (!keyId) {
      result.failed++
      result.errors.push(`Key not found: ${update.section}.${update.key}`)
      continue
    }
    rows.push({
      key_id: keyId,
      locale,
      value: update.value,
      is_reviewed: true,
      updated_by: adminId || null,
    })
  }

  if (rows.length > 0) {
    // Process in batches of 100
    const BATCH_SIZE = 100
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('translations')
        .upsert(batch, { onConflict: 'key_id,locale' })

      if (error) {
        result.failed += batch.length
        result.errors.push(`Batch ${i / BATCH_SIZE + 1} failed: ${error.message}`)
      } else {
        result.applied += batch.length
      }
    }
  }

  // Invalidate cache
  translationCache.delete(locale)
  versionCache = null

  return result
}

// =============================================================================
// COVERAGE STATS
// =============================================================================

export async function getCoverage(locale: string): Promise<CoverageStats | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  // Get total keys count by section
  const { data: allKeys } = await supabase.from('translation_keys').select('section')

  if (!allKeys) return null

  const sectionTotals: Record<string, number> = {}
  for (const k of allKeys) {
    sectionTotals[k.section] = (sectionTotals[k.section] || 0) + 1
  }

  // Get translated keys for this locale
  const { data: translations } = await supabase
    .from('translations')
    .select(
      `
      is_reviewed,
      translation_keys!inner(section)
    `
    )
    .eq('locale', locale)

  const sectionTranslated: Record<string, number> = {}
  let reviewed = 0
  for (const t of translations || []) {
    // Same Supabase join boundary.
    // eslint-disable-next-line no-restricted-syntax
    const section = (t.translation_keys as unknown as { section: string }).section
    sectionTranslated[section] = (sectionTranslated[section] || 0) + 1
    if (t.is_reviewed) reviewed++
  }

  const total = allKeys.length
  const translated = translations?.length || 0

  const bySectionCount: Record<string, { total: number; translated: number }> = {}
  for (const [section, count] of Object.entries(sectionTotals)) {
    bySectionCount[section] = {
      total: count,
      translated: sectionTranslated[section] || 0,
    }
  }

  return {
    locale,
    total,
    translated,
    reviewed,
    percentage: total > 0 ? Math.round((translated / total) * 1000) / 10 : 0,
    reviewedPercentage: total > 0 ? Math.round((reviewed / total) * 1000) / 10 : 0,
    bySectionCount,
  }
}

// =============================================================================
// EXPORT / IMPORT
// =============================================================================

export async function exportLocale(locale: string): Promise<{
  locale: string
  version: string
  exportedAt: string
  keyCount: number
  translations: TranslationDictionary
} | null> {
  const dict = await getTranslationsForLocale(locale)
  if (!dict) return null

  const version = await getTranslationVersion()
  let keyCount = 0
  for (const section of Object.values(dict)) {
    keyCount += Object.keys(section).length
  }

  return {
    locale,
    version,
    exportedAt: new Date().toISOString(),
    keyCount,
    translations: dict,
  }
}

export async function importLocale(
  locale: string,
  translations: TranslationDictionary,
  adminId?: string,
  dryRun = false
): Promise<{
  total: number
  applied: number
  skipped: number
  created: number
  errors: string[]
}> {
  const result = { total: 0, applied: 0, skipped: 0, created: 0, errors: [] as string[] }

  // Flatten nested dictionary to updates array
  const updates: Array<{ section: string; key: string; value: string }> = []
  for (const [section, keys] of Object.entries(translations)) {
    if (typeof keys !== 'object' || keys === null) continue
    for (const [key, value] of Object.entries(keys)) {
      if (typeof value !== 'string') continue
      updates.push({ section, key, value })
      result.total++
    }
  }

  if (dryRun) {
    result.applied = updates.length
    return result
  }

  // Check which keys exist, create missing ones
  const supabase = getSupabase()
  if (!supabase) {
    result.errors.push('Database not configured')
    return result
  }

  const { data: existingKeys } = await supabase.from('translation_keys').select('section, key')

  const existingSet = new Set(
    (existingKeys || []).map((k: { section: string; key: string }) => `${k.section}.${k.key}`)
  )

  // Create missing keys
  const missingKeys = updates.filter((u) => !existingSet.has(`${u.section}.${u.key}`))
  if (missingKeys.length > 0) {
    const newKeys = missingKeys.map((k) => ({
      section: k.section,
      key: k.key,
      description: `${k.section}.${k.key}`,
    }))

    const { error } = await supabase.from('translation_keys').insert(newKeys)

    if (error) {
      result.errors.push(`Failed to create ${missingKeys.length} keys: ${error.message}`)
    } else {
      result.created = missingKeys.length
    }
  }

  // Now batch update all translations
  const batchResult = await batchUpdateTranslations(locale, updates, adminId)
  result.applied = batchResult.applied
  result.errors.push(...batchResult.errors)

  return result
}

// =============================================================================
// AUDIT LOG
// =============================================================================

export async function getAuditLog(options?: {
  locale?: string
  section?: string
  limit?: number
  offset?: number
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const supabase = getSupabase()
  if (!supabase) return { entries: [], total: 0 }

  let query = supabase.from('translation_audit_log').select('*', { count: 'exact' })

  if (options?.locale) query = query.eq('locale', options.locale)
  if (options?.section) query = query.eq('section', options.section)

  query = query
    .order('changed_at', { ascending: false })
    .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1)

  const { data, error, count } = await query

  if (error) {
    log.error('Failed to fetch audit log', { error: error.message })
    return { entries: [], total: 0 }
  }

  const entries: AuditEntry[] = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    locale: row.locale as string,
    section: row.section as string,
    key: row.key as string,
    previousValue: row.previous_value as string | null,
    newValue: row.new_value as string,
    changedBy: row.changed_by as string | null,
    changedAt: row.changed_at as string,
  }))

  return { entries, total: count || 0 }
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

export function invalidateCache(locale?: string): void {
  if (locale) {
    translationCache.delete(locale)
  } else {
    translationCache.clear()
  }
  localesCache = null
  versionCache = null
}
