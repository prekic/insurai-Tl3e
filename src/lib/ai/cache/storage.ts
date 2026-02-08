/**
 * IndexedDB-based cache storage
 * Provides persistent, high-capacity storage for AI response caching
 */

import type { CacheEntry, CacheConfig, CacheStats } from './types'

const DB_NAME = 'insurai_ai_cache'
const DB_VERSION = 1

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open cache database'))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create stores for different cache types
      const storeNames = ['extraction', 'ocr', 'consensus', 'metadata']

      for (const storeName of storeNames) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'key' })
          store.createIndex('expiresAt', 'expiresAt', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('hits', 'hits', { unique: false })
        }
      }
    }
  })
}

/**
 * Cache Storage class using IndexedDB
 */
export class CacheStorage<T> {
  private config: CacheConfig
  private storeName: string
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(storeName: string, config: CacheConfig) {
    this.storeName = storeName
    this.config = config
  }

  /**
   * Get database connection (lazy initialization)
   */
  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase()
    }
    return this.dbPromise
  }

  /**
   * Get a cached entry by key
   */
  async get(key: string): Promise<CacheEntry<T> | null> {
    try {
      const db = await this.getDb()
      const fullKey = `${this.config.prefix}_${key}`

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly')
        const store = transaction.objectStore(this.storeName)
        const request = store.get(fullKey)

        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined

          if (!entry) {
            resolve(null)
            return
          }

          // Check expiration
          if (entry.expiresAt < Date.now()) {
            // Entry expired, delete it asynchronously
            this.delete(key).catch((err) => {
              if (this.config.debug) console.warn('[AICache] Failed to delete expired entry:', err)
            })
            resolve(null)
            return
          }

          // Update hit count asynchronously
          this.incrementHits(fullKey).catch((err) => {
            if (this.config.debug) console.warn('[AICache] Failed to increment hits:', err)
          })

          resolve(entry)
        }

        request.onerror = () => {
          reject(new Error('Failed to read from cache'))
        }
      })
    } catch (error) {
      if (this.config.debug) {
        console.warn('[AICache] Get error:', error)
      }
      return null
    }
  }

  /**
   * Store an entry in the cache
   */
  async set(key: string, data: T, metadata?: Record<string, unknown>): Promise<void> {
    try {
      const db = await this.getDb()
      const fullKey = `${this.config.prefix}_${key}`

      // Estimate size
      const size = new Blob([JSON.stringify(data)]).size

      const entry: CacheEntry<T> = {
        key: fullKey,
        data,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        hits: 0,
        size,
        metadata,
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.put(entry)

        request.onsuccess = () => {
          // Check if we need to evict old entries
          this.evictIfNeeded().catch((err) => {
            if (this.config.debug) console.warn('[AICache] Cache eviction failed:', err)
          })
          resolve()
        }

        request.onerror = () => {
          reject(new Error('Failed to write to cache'))
        }
      })
    } catch (error) {
      if (this.config.debug) {
        console.warn('[AICache] Set error:', error)
      }
    }
  }

  /**
   * Delete an entry from the cache
   */
  async delete(key: string): Promise<void> {
    try {
      const db = await this.getDb()
      const fullKey = `${this.config.prefix}_${key}`

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.delete(fullKey)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error('Failed to delete from cache'))
      })
    } catch {
      // Ignore delete errors
    }
  }

  /**
   * Clear all entries from this cache
   */
  async clear(): Promise<void> {
    try {
      const db = await this.getDb()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)

        // Only delete entries with our prefix
        const request = store.openCursor()

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            if (cursor.value.key.startsWith(this.config.prefix)) {
              cursor.delete()
            }
            cursor.continue()
          } else {
            resolve()
          }
        }

        request.onerror = () => reject(new Error('Failed to clear cache'))
      })
    } catch (error) {
      if (this.config.debug) {
        console.warn('[AICache] Clear error:', error)
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const db = await this.getDb()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly')
        const store = transaction.objectStore(this.storeName)
        const request = store.openCursor()

        let hits = 0
        let size = 0
        let entryCount = 0
        let oldestEntry: number | null = null
        let newestEntry: number | null = null

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

          if (cursor) {
            const entry = cursor.value as CacheEntry<T>

            if (entry.key.startsWith(this.config.prefix)) {
              hits += entry.hits
              size += entry.size
              entryCount++

              if (oldestEntry === null || entry.createdAt < oldestEntry) {
                oldestEntry = entry.createdAt
              }
              if (newestEntry === null || entry.createdAt > newestEntry) {
                newestEntry = entry.createdAt
              }
            }

            cursor.continue()
          } else {
            // Retrieve miss count from metadata
            this.getMetadata('stats').then(stats => {
              const misses = typeof stats?.misses === 'number' ? stats.misses : 0
              const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0
              const estimatedSavings = hits * 0.015 // Rough estimate

              resolve({
                hits,
                misses,
                size,
                entryCount,
                hitRate,
                estimatedSavings,
                oldestEntry,
                newestEntry,
              })
            }).catch((err) => {
              if (this.config.debug) console.warn('[AICache] Failed to retrieve stats metadata:', err)
              resolve({
                hits,
                misses: 0,
                size,
                entryCount,
                hitRate: 0,
                estimatedSavings: 0,
                oldestEntry,
                newestEntry,
              })
            })
          }
        }

        request.onerror = () => reject(new Error('Failed to get cache stats'))
      })
    } catch {
      return {
        hits: 0,
        misses: 0,
        size: 0,
        entryCount: 0,
        hitRate: 0,
        estimatedSavings: 0,
        oldestEntry: null,
        newestEntry: null,
      }
    }
  }

  /**
   * Record a cache miss
   */
  async recordMiss(): Promise<void> {
    try {
      const stats = await this.getMetadata('stats') ?? { misses: 0 }
      const currentMisses = typeof stats.misses === 'number' ? stats.misses : 0
      stats.misses = currentMisses + 1
      await this.setMetadata('stats', stats)
    } catch {
      // Ignore miss recording errors
    }
  }

  /**
   * Increment hit count for an entry
   */
  private async incrementHits(fullKey: string): Promise<void> {
    try {
      const db = await this.getDb()

      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.get(fullKey)

        request.onsuccess = () => {
          const entry = request.result
          if (entry) {
            entry.hits++
            store.put(entry)
          }
          resolve()
        }

        request.onerror = () => resolve()
      })
    } catch {
      // Ignore hit increment errors
    }
  }

  /**
   * Evict entries if cache is full
   */
  private async evictIfNeeded(): Promise<void> {
    try {
      const stats = await this.getStats()

      // Check if we need to evict
      const needsSizeEviction = stats.size > this.config.maxSize
      const needsCountEviction = stats.entryCount > this.config.maxEntries

      if (!needsSizeEviction && !needsCountEviction) {
        return
      }

      const db = await this.getDb()

      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const index = store.index('hits') // LRU based on hit count

        const request = index.openCursor()
        let deletedCount = 0
        const targetDeletions = Math.ceil(stats.entryCount * 0.2) // Delete 20%

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

          if (cursor && deletedCount < targetDeletions) {
            const entry = cursor.value as CacheEntry<T>

            if (entry.key.startsWith(this.config.prefix)) {
              cursor.delete()
              deletedCount++
            }

            cursor.continue()
          } else {
            resolve()
          }
        }

        request.onerror = () => resolve()
      })
    } catch {
      // Ignore eviction errors
    }
  }

  /**
   * Delete expired entries
   */
  async pruneExpired(): Promise<number> {
    try {
      const db = await this.getDb()
      const now = Date.now()

      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const index = store.index('expiresAt')
        const range = IDBKeyRange.upperBound(now)

        const request = index.openCursor(range)
        let deletedCount = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

          if (cursor) {
            const entry = cursor.value as CacheEntry<T>

            if (entry.key.startsWith(this.config.prefix)) {
              cursor.delete()
              deletedCount++
            }

            cursor.continue()
          } else {
            resolve(deletedCount)
          }
        }

        request.onerror = () => resolve(0)
      })
    } catch {
      return 0
    }
  }

  /**
   * Get metadata value
   */
  private async getMetadata(key: string): Promise<Record<string, unknown> | null> {
    try {
      const db = await this.getDb()
      const fullKey = `${this.config.prefix}_meta_${key}`

      return new Promise((resolve) => {
        const transaction = db.transaction('metadata', 'readonly')
        const store = transaction.objectStore('metadata')
        const request = store.get(fullKey)

        request.onsuccess = () => {
          resolve(request.result?.data ?? null)
        }

        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  /**
   * Set metadata value
   */
  private async setMetadata(key: string, value: Record<string, unknown>): Promise<void> {
    try {
      const db = await this.getDb()
      const fullKey = `${this.config.prefix}_meta_${key}`

      return new Promise((resolve) => {
        const transaction = db.transaction('metadata', 'readwrite')
        const store = transaction.objectStore('metadata')
        store.put({ key: fullKey, data: value })
        resolve()
      })
    } catch {
      // Ignore metadata errors
    }
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}
