/**
 * Unit tests for local-cache helpers — verifies the JSON shape, schema-version
 * gating, staleness window, and quota-error swallowing in isolation. The
 * integration with ConfigurationService is covered separately in
 * configuration-service.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getLocalCachedConfig,
  setLocalCachedConfig,
  clearLocalCachedConfig,
  __testing,
} from '../local-cache'

const { CACHE_KEY_PREFIX, CACHE_SCHEMA_VERSION, STALE_THRESHOLD_MS, buildKey } = __testing

describe('local-cache helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('round-trip set/get', () => {
    it('persists and reads a per-key value', () => {
      setLocalCachedConfig('ai', { hello: 'world' }, 'min_confidence')
      expect(getLocalCachedConfig('ai', 'min_confidence')).toEqual({ hello: 'world' })
    })

    it('persists and reads a per-category value', () => {
      setLocalCachedConfig('ocr', { skip_threshold: 0.9, max_pages: 10 })
      expect(getLocalCachedConfig('ocr')).toEqual({ skip_threshold: 0.9, max_pages: 10 })
    })

    it('per-key and per-category entries do not collide', () => {
      setLocalCachedConfig('ai', { full: 'category' })
      setLocalCachedConfig('ai', { single: 'key' }, 'min_confidence')
      expect(getLocalCachedConfig('ai')).toEqual({ full: 'category' })
      expect(getLocalCachedConfig('ai', 'min_confidence')).toEqual({ single: 'key' })
    })

    it('returns null for missing entries', () => {
      expect(getLocalCachedConfig('ai')).toBeNull()
      expect(getLocalCachedConfig('ai', 'unknown_key')).toBeNull()
    })
  })

  describe('schema versioning', () => {
    it('returns null and removes the entry when version is wrong', () => {
      const key = buildKey('ai', 'min_confidence')
      localStorage.setItem(
        key,
        JSON.stringify({
          version: CACHE_SCHEMA_VERSION + 1,
          timestamp: Date.now(),
          value: 'stale-version',
        })
      )

      expect(getLocalCachedConfig('ai', 'min_confidence')).toBeNull()
      expect(localStorage.getItem(key)).toBeNull() // self-healed
    })
  })

  describe('staleness window', () => {
    it('returns null and removes entries older than 7 days', () => {
      const key = buildKey('ai', 'min_confidence')
      const ancient = Date.now() - STALE_THRESHOLD_MS - 1000
      localStorage.setItem(
        key,
        JSON.stringify({ version: CACHE_SCHEMA_VERSION, timestamp: ancient, value: 0.42 })
      )

      expect(getLocalCachedConfig('ai', 'min_confidence')).toBeNull()
      expect(localStorage.getItem(key)).toBeNull()
    })

    it('returns the value when it is just under 7 days old', () => {
      const key = buildKey('ai', 'min_confidence')
      const justFresh = Date.now() - STALE_THRESHOLD_MS + 60_000 // 1 min margin
      localStorage.setItem(
        key,
        JSON.stringify({ version: CACHE_SCHEMA_VERSION, timestamp: justFresh, value: 0.42 })
      )

      expect(getLocalCachedConfig('ai', 'min_confidence')).toBe(0.42)
    })
  })

  describe('error handling', () => {
    it('returns null on malformed JSON without throwing', () => {
      localStorage.setItem(buildKey('ai', 'min_confidence'), '{not valid json')
      expect(() => getLocalCachedConfig('ai', 'min_confidence')).not.toThrow()
      expect(getLocalCachedConfig('ai', 'min_confidence')).toBeNull()
    })

    it('swallows QuotaExceededError on set without throwing', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      expect(() => setLocalCachedConfig('ai', { large: 'object' })).not.toThrow()
    })
  })

  describe('clear', () => {
    it('clears every insurai_config_* entry when called without args', () => {
      setLocalCachedConfig('ai', { x: 1 })
      setLocalCachedConfig('ocr', { y: 2 })
      setLocalCachedConfig('ai', { z: 3 }, 'min_confidence')
      // Unrelated keys must NOT be touched.
      localStorage.setItem('insurai_i18n_en', 'unrelated')
      localStorage.setItem('some_user_pref', 'unrelated')

      clearLocalCachedConfig()

      expect(getLocalCachedConfig('ai')).toBeNull()
      expect(getLocalCachedConfig('ocr')).toBeNull()
      expect(getLocalCachedConfig('ai', 'min_confidence')).toBeNull()
      expect(localStorage.getItem('insurai_i18n_en')).toBe('unrelated')
      expect(localStorage.getItem('some_user_pref')).toBe('unrelated')
    })

    it('clears only the targeted category when given an arg', () => {
      setLocalCachedConfig('ai', { x: 1 })
      setLocalCachedConfig('ai', { z: 3 }, 'min_confidence')
      setLocalCachedConfig('ocr', { y: 2 })

      clearLocalCachedConfig('ai')

      expect(getLocalCachedConfig('ai')).toBeNull()
      expect(getLocalCachedConfig('ai', 'min_confidence')).toBeNull()
      // OCR untouched.
      expect(getLocalCachedConfig('ocr')).toEqual({ y: 2 })
    })
  })

  describe('storage-key shape', () => {
    it('uses the documented prefix + double-underscore separator', () => {
      const k1 = buildKey('ai', 'min_confidence')
      const k2 = buildKey('ai')
      expect(k1).toBe(`${CACHE_KEY_PREFIX}ai__min_confidence`)
      expect(k2).toBe(`${CACHE_KEY_PREFIX}category__ai`)
    })
  })
})
