/**
 * Local cache for ConfigurationService — last-known-good fallback.
 *
 * Defense-in-depth layer that survives Cloudflare-edge 503s on Supabase
 * preflights and eventual Express proxy outages. When the in-memory cache
 * misses AND the network fetch (with retry) exhausts, the caller reads from
 * here as a fourth-tier fallback before giving up to hardcoded defaults.
 *
 * Design mirrors `src/lib/i18n/translation-cache.ts`:
 *   - JSON-serialized entries with a schema version
 *   - quota errors swallowed silently
 *   - guarded against SSR / Node test environments without `localStorage`
 *
 * Stale window is 7 days. Older entries are removed on read so admin tunings
 * never get permanently pinned to a stale value.
 */

const CACHE_KEY_PREFIX = 'insurai_config_'
const CACHE_SCHEMA_VERSION = 1
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface CacheEntry {
  version: number
  timestamp: number
  value: unknown
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/**
 * Storage-key shape:
 *   - per-key:      `insurai_config_${category}__${key}`
 *   - per-category: `insurai_config_category__${category}`
 *
 * Double-underscore separator avoids collisions between a category named
 * `category` and the per-category index.
 */
function buildKey(category: string, key?: string): string {
  if (key) return `${CACHE_KEY_PREFIX}${category}__${key}`
  return `${CACHE_KEY_PREFIX}category__${category}`
}

/**
 * Read a cached config value if present, fresh, and on the current schema
 * version. Returns null on any failure mode.
 *
 * Removes the entry as a side-effect when it's malformed, version-mismatched,
 * or stale — keeps the cache self-healing without an explicit invalidation
 * job.
 */
export function getLocalCachedConfig<T = unknown>(category: string, key?: string): T | null {
  if (!hasLocalStorage()) return null
  const storageKey = buildKey(category, key)
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.version !== CACHE_SCHEMA_VERSION) {
      localStorage.removeItem(storageKey)
      return null
    }
    if (Date.now() - entry.timestamp > STALE_THRESHOLD_MS) {
      localStorage.removeItem(storageKey)
      return null
    }
    return entry.value as T
  } catch {
    // Parse error or any other read failure — treat as cache miss.
    return null
  }
}

/**
 * Persist a successfully-fetched config value. Quota errors are swallowed
 * silently — caching is best-effort, never blocks the caller.
 */
export function setLocalCachedConfig(category: string, value: unknown, key?: string): void {
  if (!hasLocalStorage()) return
  const storageKey = buildKey(category, key)
  try {
    const entry: CacheEntry = {
      version: CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
      value,
    }
    localStorage.setItem(storageKey, JSON.stringify(entry))
  } catch {
    // QuotaExceededError or storage disabled — not blocking, caller continues.
  }
}

/**
 * Invalidation helper. With no argument, removes every `insurai_config_*`
 * entry. With a category argument, removes the per-category entry plus all
 * `${category}__*` per-key entries belonging to that category.
 */
export function clearLocalCachedConfig(category?: string): void {
  if (!hasLocalStorage()) return
  try {
    const keys = Object.keys(localStorage)
    const categoryEntryPrefix = `${CACHE_KEY_PREFIX}category__`
    const categoryKeyPrefix = category ? `${CACHE_KEY_PREFIX}${category}__` : CACHE_KEY_PREFIX
    const targetCategoryEntry = category ? `${categoryEntryPrefix}${category}` : null

    for (const k of keys) {
      if (category) {
        if (k === targetCategoryEntry) localStorage.removeItem(k)
        else if (k.startsWith(categoryKeyPrefix)) localStorage.removeItem(k)
      } else {
        if (k.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(k)
      }
    }
  } catch {
    // Ignore — clear is best-effort.
  }
}

// Exposed for tests + future schema migrations.
export const __testing = {
  CACHE_KEY_PREFIX,
  CACHE_SCHEMA_VERSION,
  STALE_THRESHOLD_MS,
  buildKey,
}
