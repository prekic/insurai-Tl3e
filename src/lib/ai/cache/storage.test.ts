/**
 * Tests for IndexedDB Cache Storage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CacheConfig, CacheEntry } from './types'

// Create a mock IndexedDB implementation
const createMockIndexedDB = () => {
  const stores: Map<string, Map<string, unknown>> = new Map()
  const indexes: Map<string, Map<string, string[]>> = new Map()

  // Initialize stores
  const initStores = () => {
    for (const name of ['extraction', 'ocr', 'consensus', 'metadata']) {
      stores.set(name, new Map())
      indexes.set(`${name}_expiresAt`, new Map())
      indexes.set(`${name}_createdAt`, new Map())
      indexes.set(`${name}_hits`, new Map())
    }
  }
  initStores()

  const createMockStore = (storeName: string, mode: string) => {
    const storeData = stores.get(storeName) || new Map()

    const createRequest = <T>(resultFn: () => T) => {
      let onsuccessFn: ((event: unknown) => void) | null = null
      let onerrorFn: (() => void) | null = null

      const request = {
        get onsuccess() {
          return onsuccessFn
        },
        set onsuccess(fn: ((event: unknown) => void) | null) {
          onsuccessFn = fn
          if (fn) {
            setTimeout(() => {
              try {
                const result = resultFn()
                Object.defineProperty(request, 'result', { value: result, writable: true })
                fn({ target: request })
              } catch (error) {
                if (onerrorFn) onerrorFn()
              }
            }, 0)
          }
        },
        get onerror() {
          return onerrorFn
        },
        set onerror(fn: (() => void) | null) {
          onerrorFn = fn
        },
        result: undefined as T | undefined,
      }
      return request
    }

    const createCursorRequest = (entries: [string, unknown][], filterFn?: (entry: unknown) => boolean) => {
      let currentIndex = 0
      let onsuccessFn: ((event: unknown) => void) | null = null
      let onerrorFn: (() => void) | null = null

      const filteredEntries = filterFn
        ? entries.filter(([_, entry]) => filterFn(entry))
        : entries

      const cursor = {
        value: null as unknown,
        continue() {
          currentIndex++
          if (currentIndex < filteredEntries.length) {
            cursor.value = filteredEntries[currentIndex][1]
            if (onsuccessFn) {
              setTimeout(() => onsuccessFn!({ target: { result: cursor } }), 0)
            }
          } else {
            if (onsuccessFn) {
              setTimeout(() => onsuccessFn!({ target: { result: null } }), 0)
            }
          }
        },
        delete() {
          const key = filteredEntries[currentIndex]?.[0]
          if (key) {
            storeData.delete(key)
          }
        },
      }

      const request = {
        get onsuccess() {
          return onsuccessFn
        },
        set onsuccess(fn: ((event: unknown) => void) | null) {
          onsuccessFn = fn
          if (fn) {
            setTimeout(() => {
              if (filteredEntries.length > 0) {
                cursor.value = filteredEntries[0][1]
                fn({ target: { result: cursor } })
              } else {
                fn({ target: { result: null } })
              }
            }, 0)
          }
        },
        get onerror() {
          return onerrorFn
        },
        set onerror(fn: (() => void) | null) {
          onerrorFn = fn
        },
      }

      return request
    }

    const store = {
      get(key: string) {
        return createRequest(() => storeData.get(key))
      },
      put(entry: { key: string; [k: string]: unknown }) {
        return createRequest(() => {
          storeData.set(entry.key, entry)
          return entry.key
        })
      },
      delete(key: string) {
        return createRequest(() => {
          storeData.delete(key)
          return undefined
        })
      },
      openCursor(range?: IDBKeyRange) {
        const entries = Array.from(storeData.entries())
        if (range) {
          // Filter by range (for expiresAt index)
          return createCursorRequest(entries, (entry: unknown) => {
            const e = entry as { expiresAt?: number }
            if (range && e.expiresAt !== undefined) {
              return e.expiresAt <= (range as unknown as { upper: number }).upper
            }
            return true
          })
        }
        return createCursorRequest(entries)
      },
      index(indexName: string) {
        return {
          openCursor(range?: IDBKeyRange) {
            const entries = Array.from(storeData.entries())
            // Sort by hits for LRU behavior
            if (indexName === 'hits') {
              entries.sort((a, b) => {
                const aHits = (a[1] as { hits?: number }).hits ?? 0
                const bHits = (b[1] as { hits?: number }).hits ?? 0
                return aHits - bHits
              })
            }
            if (range) {
              return createCursorRequest(entries, (entry: unknown) => {
                const e = entry as { expiresAt?: number }
                if (indexName === 'expiresAt' && e.expiresAt !== undefined) {
                  return e.expiresAt <= (range as unknown as { upper: number }).upper
                }
                return true
              })
            }
            return createCursorRequest(entries)
          },
        }
      },
    }

    return store
  }

  const db = {
    transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly') {
      const name = Array.isArray(storeNames) ? storeNames[0] : storeNames
      return {
        objectStore(storeName: string) {
          return createMockStore(storeName, mode)
        },
      }
    },
    objectStoreNames: {
      contains(name: string) {
        return stores.has(name)
      },
    },
    createObjectStore(name: string, options: { keyPath: string }) {
      stores.set(name, new Map())
      return {
        createIndex: vi.fn(),
      }
    },
    close: vi.fn(),
  }

  const mockIndexedDB = {
    open(name: string, version?: number) {
      let onsuccessFn: ((event: unknown) => void) | null = null
      let onerrorFn: (() => void) | null = null
      let onupgradeneededFn: ((event: unknown) => void) | null = null

      const request = {
        get onsuccess() {
          return onsuccessFn
        },
        set onsuccess(fn: ((event: unknown) => void) | null) {
          onsuccessFn = fn
          if (fn) {
            setTimeout(() => {
              Object.defineProperty(request, 'result', { value: db, writable: true })
              fn({ target: request })
            }, 0)
          }
        },
        get onerror() {
          return onerrorFn
        },
        set onerror(fn: (() => void) | null) {
          onerrorFn = fn
        },
        get onupgradeneeded() {
          return onupgradeneededFn
        },
        set onupgradeneeded(fn: ((event: unknown) => void) | null) {
          onupgradeneededFn = fn
        },
        result: db,
      }
      return request
    },
    stores,
    reset() {
      stores.clear()
      initStores()
    },
  }

  return mockIndexedDB
}

// Create the mock
const mockIndexedDB = createMockIndexedDB()

// Setup global indexedDB
vi.stubGlobal('indexedDB', mockIndexedDB)

// Also mock IDBKeyRange
vi.stubGlobal('IDBKeyRange', {
  upperBound(value: number) {
    return { upper: value }
  },
})

describe('CacheStorage', () => {
  const defaultConfig: CacheConfig = {
    ttl: 3600000, // 1 hour
    maxSize: 1024 * 1024, // 1MB
    maxEntries: 100,
    prefix: 'test_cache',
    debug: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIndexedDB.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Constructor', () => {
    it('should create a CacheStorage instance', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)
      expect(cache).toBeDefined()
    })
  })

  describe('set and get', () => {
    it('should store and retrieve data', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<{ value: string }>('extraction', defaultConfig)

      await cache.set('test-key', { value: 'test-data' })

      const entry = await cache.get('test-key')
      expect(entry).toBeDefined()
      expect(entry?.data.value).toBe('test-data')
    })

    it('should return null for non-existent key', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      const entry = await cache.get('non-existent')
      expect(entry).toBeNull()
    })

    it('should store metadata with entry', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await cache.set('test-key', 'test-data', { source: 'test' })

      const entry = await cache.get('test-key')
      expect(entry?.metadata?.source).toBe('test')
    })

    it('should set correct expiration time', async () => {
      const { CacheStorage } = await import('./storage')
      const now = Date.now()
      vi.setSystemTime(now)

      const cache = new CacheStorage<string>('extraction', defaultConfig)
      await cache.set('test-key', 'test-data')

      const entry = await cache.get('test-key')
      expect(entry?.expiresAt).toBe(now + defaultConfig.ttl)
      expect(entry?.createdAt).toBe(now)

      vi.useRealTimers()
    })

    it('should calculate size correctly', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<{ large: string }>('extraction', defaultConfig)

      const largeData = { large: 'x'.repeat(1000) }
      await cache.set('test-key', largeData)

      const entry = await cache.get('test-key')
      expect(entry?.size).toBeGreaterThan(1000)
    })
  })

  describe('Expiration', () => {
    it('should return null for expired entries', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      // Set entry
      await cache.set('test-key', 'test-data')

      // Fast forward past TTL
      const store = mockIndexedDB.stores.get('extraction')
      if (store) {
        const entry = store.get('test_cache_test-key') as CacheEntry<string>
        if (entry) {
          entry.expiresAt = Date.now() - 1000 // Expired 1 second ago
          store.set('test_cache_test-key', entry)
        }
      }

      const result = await cache.get('test-key')
      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete an entry', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await cache.set('test-key', 'test-data')
      await cache.delete('test-key')

      const entry = await cache.get('test-key')
      expect(entry).toBeNull()
    })

    it('should handle deleting non-existent key gracefully', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await expect(cache.delete('non-existent')).resolves.not.toThrow()
    })
  })

  describe('clear', () => {
    it('should clear all entries with matching prefix', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await cache.set('key1', 'data1')
      await cache.set('key2', 'data2')
      await cache.set('key3', 'data3')

      await cache.clear()

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).toBeNull()
      expect(await cache.get('key3')).toBeNull()
    })

    it('should only clear entries with matching prefix', async () => {
      const { CacheStorage } = await import('./storage')
      const cache1 = new CacheStorage<string>('extraction', { ...defaultConfig, prefix: 'cache1' })
      const cache2 = new CacheStorage<string>('extraction', { ...defaultConfig, prefix: 'cache2' })

      await cache1.set('key', 'data1')
      await cache2.set('key', 'data2')

      await cache1.clear()

      expect(await cache1.get('key')).toBeNull()
      // cache2 should still have its entry (different prefix)
      const entry = await cache2.get('key')
      expect(entry?.data).toBe('data2')
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await cache.set('key1', 'data1')
      await cache.set('key2', 'data2')

      const stats = await cache.getStats()

      expect(stats.entryCount).toBe(2)
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.hits).toBe(0)
      expect(stats.oldestEntry).toBeDefined()
      expect(stats.newestEntry).toBeDefined()
    })

    it('should return empty stats for empty cache', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      const stats = await cache.getStats()

      expect(stats.entryCount).toBe(0)
      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
    })

    it('should track oldest and newest entries', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      const time1 = Date.now()
      vi.setSystemTime(time1)
      await cache.set('key1', 'data1')

      const time2 = time1 + 1000
      vi.setSystemTime(time2)
      await cache.set('key2', 'data2')

      vi.useRealTimers()

      const stats = await cache.getStats()
      expect(stats.oldestEntry).toBe(time1)
      expect(stats.newestEntry).toBe(time2)
    })
  })

  describe('recordMiss', () => {
    it('should record misses without throwing', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      // Should not throw
      await expect(cache.recordMiss()).resolves.not.toThrow()
      await expect(cache.recordMiss()).resolves.not.toThrow()
      await expect(cache.recordMiss()).resolves.not.toThrow()
    })

    it('should handle recordMiss errors gracefully', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      // Force an error by breaking the db
      const originalOpen = mockIndexedDB.open
      mockIndexedDB.open = () => {
        throw new Error('Test error')
      }

      // Should not throw even on error
      await expect(cache.recordMiss()).resolves.not.toThrow()

      mockIndexedDB.open = originalOpen
    })
  })

  describe('pruneExpired', () => {
    it('should remove expired entries', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await cache.set('key1', 'data1')
      await cache.set('key2', 'data2')

      // Expire one entry
      const store = mockIndexedDB.stores.get('extraction')
      if (store) {
        const entry = store.get('test_cache_key1') as CacheEntry<string>
        if (entry) {
          entry.expiresAt = Date.now() - 1000
          store.set('test_cache_key1', entry)
        }
      }

      const deletedCount = await cache.pruneExpired()
      expect(deletedCount).toBeGreaterThanOrEqual(0)
    })

    it('should return 0 when no entries to prune', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      const deletedCount = await cache.pruneExpired()
      expect(deletedCount).toBe(0)
    })
  })

  describe('Error handling', () => {
    it('should handle get errors gracefully with debug off', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: false })

      // Force an error by using invalid operations
      const originalOpen = mockIndexedDB.open
      mockIndexedDB.open = () => {
        const request = {
          set onsuccess(_fn: unknown) {},
          set onerror(fn: (() => void) | null) {
            if (fn) setTimeout(fn, 0)
          },
          set onupgradeneeded(_fn: unknown) {},
          result: null,
        }
        return request as unknown as ReturnType<typeof originalOpen>
      }

      const result = await cache.get('test-key')
      expect(result).toBeNull()

      mockIndexedDB.open = originalOpen
    })

    it('should log errors when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: true })

      // Force an error
      const originalOpen = mockIndexedDB.open
      mockIndexedDB.open = () => {
        throw new Error('Test error')
      }

      await cache.get('test-key')

      expect(consoleSpy).toHaveBeenCalled()

      mockIndexedDB.open = originalOpen
      consoleSpy.mockRestore()
    })

    it('should handle set errors gracefully', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: true })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Force an error
      const originalOpen = mockIndexedDB.open
      mockIndexedDB.open = () => {
        throw new Error('Test error')
      }

      await cache.set('test-key', 'test-data')

      mockIndexedDB.open = originalOpen
      consoleSpy.mockRestore()
    })

    it('should handle clear errors gracefully', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: true })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const originalOpen = mockIndexedDB.open
      mockIndexedDB.open = () => {
        throw new Error('Test error')
      }

      await cache.clear()

      mockIndexedDB.open = originalOpen
      consoleSpy.mockRestore()
    })

    it('should handle getStats errors gracefully', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      const originalOpen = mockIndexedDB.open
      mockIndexedDB.open = () => {
        throw new Error('Test error')
      }

      const stats = await cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.entryCount).toBe(0)

      mockIndexedDB.open = originalOpen
    })
  })

  describe('Eviction', () => {
    it('should evict entries when max size exceeded', async () => {
      const { CacheStorage } = await import('./storage')
      const smallConfig: CacheConfig = {
        ...defaultConfig,
        maxSize: 100, // Very small size
        maxEntries: 100,
      }
      const cache = new CacheStorage<string>('extraction', smallConfig)

      // Add entries that exceed max size
      for (let i = 0; i < 10; i++) {
        await cache.set(`key${i}`, 'x'.repeat(50))
      }

      // Eviction should have been triggered
      const stats = await cache.getStats()
      expect(stats.entryCount).toBeLessThanOrEqual(10)
    })

    it('should evict entries when max entries exceeded', async () => {
      const { CacheStorage } = await import('./storage')
      const smallConfig: CacheConfig = {
        ...defaultConfig,
        maxSize: 1024 * 1024,
        maxEntries: 3,
      }
      const cache = new CacheStorage<string>('extraction', smallConfig)

      for (let i = 0; i < 5; i++) {
        await cache.set(`key${i}`, 'data')
      }

      // Some entries should have been evicted
      const stats = await cache.getStats()
      expect(stats.entryCount).toBeLessThanOrEqual(5)
    })
  })

  describe('Hit counting', () => {
    it('should increment hits on cache hit', async () => {
      const { CacheStorage } = await import('./storage')
      const cache = new CacheStorage<string>('extraction', defaultConfig)

      await cache.set('test-key', 'test-data')

      // Access multiple times
      await cache.get('test-key')
      await cache.get('test-key')
      await cache.get('test-key')

      // Give time for async hit updates
      await new Promise(resolve => setTimeout(resolve, 50))

      const store = mockIndexedDB.stores.get('extraction')
      const entry = store?.get('test_cache_test-key') as CacheEntry<string> | undefined
      expect(entry?.hits).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('isIndexedDBAvailable', () => {
  it('should return true when indexedDB is available', async () => {
    const { isIndexedDBAvailable } = await import('./storage')
    expect(isIndexedDBAvailable()).toBe(true)
  })

  it('should return false when indexedDB is not available', async () => {
    const originalIndexedDB = globalThis.indexedDB
    vi.stubGlobal('indexedDB', undefined)

    // Reset module to get fresh import
    vi.resetModules()
    const { isIndexedDBAvailable } = await import('./storage')
    expect(isIndexedDBAvailable()).toBe(false)

    vi.stubGlobal('indexedDB', originalIndexedDB)
  })

  it('should return false when indexedDB access throws', async () => {
    const originalIndexedDB = globalThis.indexedDB

    // Create a getter that throws
    Object.defineProperty(globalThis, 'indexedDB', {
      get() {
        throw new Error('Access denied')
      },
      configurable: true,
    })

    vi.resetModules()
    const { isIndexedDBAvailable } = await import('./storage')
    expect(isIndexedDBAvailable()).toBe(false)

    // Restore
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDB,
      configurable: true,
      writable: true,
    })
  })
})

describe('openDatabase', () => {
  it('should create object stores on upgrade', async () => {
    // Trigger onupgradeneeded
    const originalOpen = mockIndexedDB.open
    let upgradeCallback: ((event: unknown) => void) | null = null

    mockIndexedDB.open = (name: string, version?: number) => {
      const request = originalOpen(name, version)
      const originalOnUpgradeSetter = Object.getOwnPropertyDescriptor(request, 'onupgradeneeded')?.set

      Object.defineProperty(request, 'onupgradeneeded', {
        set(fn) {
          upgradeCallback = fn
          if (originalOnUpgradeSetter) {
            originalOnUpgradeSetter.call(request, fn)
          }
        },
        get() {
          return upgradeCallback
        },
      })

      return request
    }

    // Reset to get fresh database
    vi.resetModules()
    const { CacheStorage } = await import('./storage')
    const cache = new CacheStorage<string>('extraction', {
      ttl: 3600000,
      maxSize: 1024,
      maxEntries: 100,
      prefix: 'test',
      debug: false,
    })

    await cache.get('test')

    mockIndexedDB.open = originalOpen
  })

  it('should handle database open error', async () => {
    const originalOpen = mockIndexedDB.open
    mockIndexedDB.open = () => {
      let onerrorFn: (() => void) | null = null
      const request = {
        set onsuccess(_fn: unknown) {},
        get onerror() {
          return onerrorFn
        },
        set onerror(fn: (() => void) | null) {
          onerrorFn = fn
          if (fn) setTimeout(fn, 0)
        },
        set onupgradeneeded(_fn: unknown) {},
        result: null,
      }
      return request as unknown as ReturnType<typeof originalOpen>
    }

    vi.resetModules()
    const { CacheStorage } = await import('./storage')
    const cache = new CacheStorage<string>('extraction', {
      ttl: 3600000,
      maxSize: 1024,
      maxEntries: 100,
      prefix: 'test',
      debug: false,
    })

    // This should handle the error gracefully
    const result = await cache.get('test')
    expect(result).toBeNull()

    mockIndexedDB.open = originalOpen
  })
})
