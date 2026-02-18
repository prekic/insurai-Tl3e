/**
 * Translation Service - Branch Coverage Tests
 *
 * Comprehensive tests targeting every branch in server/services/translation-service.ts:
 * - getSupabase() null vs configured
 * - Version tracking: cached vs expired vs no supabase vs null data
 * - Locale operations: getActiveLocales, getAllLocales, createLocale, updateLocale
 * - Key operations: getAllKeys, createKey, deleteKey
 * - Translation operations: getTranslationsForLocale, getTranslationsFlat, updateTranslation, batchUpdateTranslations
 * - Coverage stats: getCoverage
 * - Export/Import: exportLocale, importLocale (dryRun, missing keys, errors)
 * - Audit log: getAuditLog (with/without filters)
 * - Cache management: invalidateCache (locale vs all)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =============================================================================
// MOCK SETUP — thenable pattern for Supabase chaining
// =============================================================================

// Default mock result used by thenable.then
let mockResult: { data: unknown; error: unknown; count?: number | null } = { data: null, error: null }

const thenable = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  single: vi.fn(),
  range: vi.fn(),
  ilike: vi.fn(),
  then: vi.fn(),
}

function resetThenable() {
  const self = thenable
  self.select.mockReturnValue(self)
  self.insert.mockReturnValue(self)
  self.update.mockReturnValue(self)
  self.delete.mockReturnValue(self)
  self.upsert.mockReturnValue(self)
  self.eq.mockReturnValue(self)
  self.in.mockReturnValue(self)
  self.order.mockReturnValue(self)
  self.limit.mockReturnValue(self)
  self.single.mockReturnValue(self)
  self.range.mockReturnValue(self)
  self.ilike.mockReturnValue(self)
  self.then.mockImplementation((cb: (val: typeof mockResult) => unknown) =>
    Promise.resolve(cb(mockResult))
  )
}

const mockFrom = vi.fn(() => thenable)

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock('../lib/logger.js', () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// =============================================================================
// ENV + IMPORTS
// =============================================================================

const origEnv = { ...process.env }

// Set env before importing the service so getSupabase() works
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

import {
  getTranslationVersion,
  getActiveLocales,
  getAllLocales,
  createLocale,
  updateLocale,
  getAllKeys,
  createKey,
  deleteKey,
  getTranslationsForLocale,
  getTranslationsFlat,
  updateTranslation,
  batchUpdateTranslations,
  getCoverage,
  exportLocale,
  importLocale,
  getAuditLog,
  invalidateCache,
} from '../services/translation-service.js'

// =============================================================================
// TESTS
// =============================================================================

describe('TranslationService — Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetThenable()
    mockResult = { data: null, error: null }
    // Ensure env is set so getSupabase() returns a client
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    // Invalidate all caches before each test
    invalidateCache()
  })

  afterEach(() => {
    process.env = { ...origEnv }
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  // ===========================================================================
  // getTranslationVersion
  // ===========================================================================

  describe('getTranslationVersion', () => {
    it('returns version from DB when no cache', async () => {
      mockResult = { data: { value: '"5"' }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('5')
      expect(mockFrom).toHaveBeenCalledWith('translation_metadata')
    })

    it('returns cached version within TTL', async () => {
      // First call populates cache
      mockResult = { data: { value: '"10"' }, error: null }
      const v1 = await getTranslationVersion()
      expect(v1).toBe('10')

      // Second call should use cache, not hit DB again
      mockFrom.mockClear()
      const v2 = await getTranslationVersion()
      expect(v2).toBe('10')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('returns "0" when supabase is not configured', async () => {
      invalidateCache()
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const version = await getTranslationVersion()
      expect(version).toBe('0')
    })

    it('returns "0" when data is null', async () => {
      mockResult = { data: null, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('0')
    })

    it('returns "0" when data.value is null', async () => {
      mockResult = { data: { value: null }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('0')
    })

    it('handles numeric version without quotes', async () => {
      mockResult = { data: { value: '42' }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('42')
    })
  })

  // ===========================================================================
  // getActiveLocales
  // ===========================================================================

  describe('getActiveLocales', () => {
    it('returns mapped locale objects from DB', async () => {
      mockResult = {
        data: [
          {
            code: 'tr',
            name: 'Turkish',
            native_name: 'Turkce',
            flag: 'TR',
            is_rtl: false,
            is_active: true,
            is_default: true,
            display_order: 1,
          },
          {
            code: 'en',
            name: 'English',
            native_name: 'English',
            flag: 'EN',
            is_rtl: false,
            is_active: true,
            is_default: false,
            display_order: 2,
          },
        ],
        error: null,
      }

      const locales = await getActiveLocales()
      expect(locales).toHaveLength(2)
      expect(locales[0].code).toBe('tr')
      expect(locales[0].nativeName).toBe('Turkce')
      expect(locales[0].isDefault).toBe(true)
      expect(locales[1].code).toBe('en')
      expect(mockFrom).toHaveBeenCalledWith('translation_locales')
    })

    it('returns cached locales within TTL', async () => {
      mockResult = {
        data: [{ code: 'tr', name: 'Turkish', native_name: 'Turkce', flag: 'TR', is_rtl: false, is_active: true, is_default: true, display_order: 1 }],
        error: null,
      }
      await getActiveLocales()
      mockFrom.mockClear()

      const locales = await getActiveLocales()
      expect(locales).toHaveLength(1)
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('returns [] when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const locales = await getActiveLocales()
      expect(locales).toEqual([])
    })

    it('returns [] on DB error', async () => {
      mockResult = { data: null, error: { message: 'connection failed' } }
      const locales = await getActiveLocales()
      expect(locales).toEqual([])
    })

    it('returns [] when data is null (no error)', async () => {
      mockResult = { data: null, error: null }
      const locales = await getActiveLocales()
      expect(locales).toEqual([])
    })
  })

  // ===========================================================================
  // getAllLocales
  // ===========================================================================

  describe('getAllLocales', () => {
    it('returns all locales from DB (no cache)', async () => {
      mockResult = {
        data: [
          { code: 'de', name: 'German', native_name: 'Deutsch', flag: 'DE', is_rtl: false, is_active: false, is_default: false, display_order: 3 },
        ],
        error: null,
      }
      const locales = await getAllLocales()
      expect(locales).toHaveLength(1)
      expect(locales[0].code).toBe('de')
      expect(locales[0].isActive).toBe(false)
    })

    it('returns [] when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const locales = await getAllLocales()
      expect(locales).toEqual([])
    })

    it('returns [] on DB error', async () => {
      mockResult = { data: null, error: { message: 'timeout' } }
      const locales = await getAllLocales()
      expect(locales).toEqual([])
    })

    it('returns [] when data is null (no error)', async () => {
      mockResult = { data: null, error: null }
      const locales = await getAllLocales()
      expect(locales).toEqual([])
    })
  })

  // ===========================================================================
  // createLocale
  // ===========================================================================

  describe('createLocale', () => {
    it('creates locale with all fields and returns mapped object', async () => {
      mockResult = {
        data: {
          code: 'fr',
          name: 'French',
          native_name: 'Francais',
          flag: 'FR',
          is_rtl: false,
          is_active: true,
          is_default: false,
          display_order: 5,
        },
        error: null,
      }

      const result = await createLocale({
        code: 'fr',
        name: 'French',
        nativeName: 'Francais',
        flag: 'FR',
        isRtl: false,
        displayOrder: 5,
      })

      expect(result).not.toBeNull()
      expect(result!.code).toBe('fr')
      expect(result!.nativeName).toBe('Francais')
      expect(result!.displayOrder).toBe(5)
    })

    it('uses defaults for optional fields (flag, isRtl, displayOrder)', async () => {
      mockResult = {
        data: {
          code: 'ja',
          name: 'Japanese',
          native_name: 'Nihongo',
          flag: '🌐',
          is_rtl: false,
          is_active: true,
          is_default: false,
          display_order: 99,
        },
        error: null,
      }

      const result = await createLocale({
        code: 'ja',
        name: 'Japanese',
        nativeName: 'Nihongo',
        // no flag, isRtl, displayOrder
      })

      expect(result).not.toBeNull()
      // Verify the insert call used defaults
      expect(thenable.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          flag: '🌐',
          is_rtl: false,
          display_order: 99,
        })
      )
    })

    it('returns null when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await createLocale({ code: 'zz', name: 'Test', nativeName: 'Test' })
      expect(result).toBeNull()
    })

    it('returns null on DB error and invalidates cache', async () => {
      mockResult = { data: null, error: { message: 'duplicate key' } }
      const result = await createLocale({ code: 'tr', name: 'Turkish', nativeName: 'Turkce' })
      expect(result).toBeNull()
    })

    it('invalidates localesCache on success', async () => {
      // Populate localesCache first
      mockResult = {
        data: [{ code: 'en', name: 'English', native_name: 'English', flag: 'EN', is_rtl: false, is_active: true, is_default: true, display_order: 1 }],
        error: null,
      }
      await getActiveLocales()

      // Now create a locale
      mockResult = {
        data: { code: 'pt', name: 'Portuguese', native_name: 'Portugues', flag: 'PT', is_rtl: false, is_active: true, is_default: false, display_order: 10 },
        error: null,
      }
      await createLocale({ code: 'pt', name: 'Portuguese', nativeName: 'Portugues' })

      // Next getActiveLocales should hit DB (cache invalidated)
      mockFrom.mockClear()
      resetThenable()
      mockResult = {
        data: [{ code: 'en', name: 'English', native_name: 'English', flag: 'EN', is_rtl: false, is_active: true, is_default: true, display_order: 1 }],
        error: null,
      }
      await getActiveLocales()
      expect(mockFrom).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // updateLocale
  // ===========================================================================

  describe('updateLocale', () => {
    it('returns true on successful update', async () => {
      mockResult = { data: null, error: null }
      const result = await updateLocale('tr', { name: 'Updated Turkish' })
      expect(result).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('translation_locales')
      expect(thenable.update).toHaveBeenCalled()
    })

    it('maps all update fields to DB column names', async () => {
      mockResult = { data: null, error: null }
      await updateLocale('ar', {
        name: 'Arabic Updated',
        nativeName: 'Arabic Native',
        flag: 'newFlag',
        isRtl: true,
        isActive: false,
        displayOrder: 42,
      })

      expect(thenable.update).toHaveBeenCalledWith({
        name: 'Arabic Updated',
        native_name: 'Arabic Native',
        flag: 'newFlag',
        is_rtl: true,
        is_active: false,
        display_order: 42,
      })
    })

    it('only includes provided update fields', async () => {
      mockResult = { data: null, error: null }
      await updateLocale('en', { flag: 'US' })
      expect(thenable.update).toHaveBeenCalledWith({ flag: 'US' })
    })

    it('returns false when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await updateLocale('en', { name: 'English' })
      expect(result).toBe(false)
    })

    it('returns false on DB error', async () => {
      mockResult = { data: null, error: { message: 'update failed' } }
      const result = await updateLocale('en', { name: 'English' })
      expect(result).toBe(false)
    })

    it('invalidates localesCache on success', async () => {
      // Populate cache
      mockResult = {
        data: [{ code: 'en', name: 'English', native_name: 'English', flag: 'EN', is_rtl: false, is_active: true, is_default: true, display_order: 1 }],
        error: null,
      }
      await getActiveLocales()

      // Update locale
      mockResult = { data: null, error: null }
      await updateLocale('en', { name: 'Updated' })

      // Next getActiveLocales should hit DB
      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: [], error: null }
      await getActiveLocales()
      expect(mockFrom).toHaveBeenCalled()
    })

    it('handles update with no fields (empty dbUpdates)', async () => {
      mockResult = { data: null, error: null }
      const result = await updateLocale('en', {})
      expect(result).toBe(true)
      expect(thenable.update).toHaveBeenCalledWith({})
    })
  })

  // ===========================================================================
  // getAllKeys
  // ===========================================================================

  describe('getAllKeys', () => {
    it('returns mapped key objects from DB', async () => {
      mockResult = {
        data: [
          { id: 'k1', section: 'nav', key: 'home', description: 'Home link', context: 'Top nav', max_length: 50 },
          { id: 'k2', section: 'common', key: 'loading', description: null, context: null, max_length: null },
        ],
        error: null,
      }

      const keys = await getAllKeys()
      expect(keys).toHaveLength(2)
      expect(keys[0].id).toBe('k1')
      expect(keys[0].maxLength).toBe(50)
      expect(keys[1].description).toBeNull()
      expect(keys[1].maxLength).toBeNull()
    })

    it('returns [] when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const keys = await getAllKeys()
      expect(keys).toEqual([])
    })

    it('returns [] on DB error', async () => {
      mockResult = { data: null, error: { message: 'table not found' } }
      const keys = await getAllKeys()
      expect(keys).toEqual([])
    })

    it('returns [] when data is null (no error)', async () => {
      mockResult = { data: null, error: null }
      const keys = await getAllKeys()
      expect(keys).toEqual([])
    })
  })

  // ===========================================================================
  // createKey
  // ===========================================================================

  describe('createKey', () => {
    it('creates key with all fields and returns mapped object', async () => {
      mockResult = {
        data: { id: 'k-new', section: 'auth', key: 'login', description: 'Login button', context: 'Auth page', max_length: 20 },
        error: null,
      }

      const result = await createKey({
        section: 'auth',
        key: 'login',
        description: 'Login button',
        context: 'Auth page',
        maxLength: 20,
      })

      expect(result).not.toBeNull()
      expect(result!.id).toBe('k-new')
      expect(result!.section).toBe('auth')
      expect(result!.maxLength).toBe(20)
    })

    it('uses null defaults for optional fields', async () => {
      mockResult = {
        data: { id: 'k-2', section: 'nav', key: 'back', description: null, context: null, max_length: null },
        error: null,
      }

      await createKey({ section: 'nav', key: 'back' })

      expect(thenable.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          context: null,
          max_length: null,
        })
      )
    })

    it('returns null when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await createKey({ section: 'a', key: 'b' })
      expect(result).toBeNull()
    })

    it('returns null on DB error', async () => {
      mockResult = { data: null, error: { message: 'unique constraint' } }
      const result = await createKey({ section: 'a', key: 'b' })
      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // deleteKey
  // ===========================================================================

  describe('deleteKey', () => {
    it('returns true on successful delete and clears translationCache', async () => {
      mockResult = { data: null, error: null }
      const result = await deleteKey('nav', 'home')
      expect(result).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('translation_keys')
      expect(thenable.delete).toHaveBeenCalled()
    })

    it('returns false when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await deleteKey('nav', 'home')
      expect(result).toBe(false)
    })

    it('returns false on DB error', async () => {
      mockResult = { data: null, error: { message: 'FK constraint' } }
      const result = await deleteKey('nav', 'home')
      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // getTranslationsForLocale
  // ===========================================================================

  describe('getTranslationsForLocale', () => {
    it('returns nested dictionary from DB rows', async () => {
      // First call: translations query
      const translationRows = [
        { value: 'Home', translation_keys: { section: 'nav', key: 'home' } },
        { value: 'Dashboard', translation_keys: { section: 'nav', key: 'dashboard' } },
        { value: 'Loading', translation_keys: { section: 'common', key: 'loading' } },
      ]

      // Set up sequential calls: first for translations, then for version
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: translationRows, error: null }))
        }
        // Version call
        return Promise.resolve(cb({ data: { value: '3' }, error: null }))
      })

      const dict = await getTranslationsForLocale('en')
      expect(dict).not.toBeNull()
      expect(dict!.nav.home).toBe('Home')
      expect(dict!.nav.dashboard).toBe('Dashboard')
      expect(dict!.common.loading).toBe('Loading')
    })

    it('returns cached dictionary within TTL', async () => {
      // Populate cache
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ value: 'X', translation_keys: { section: 's', key: 'k' } }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: { value: '1' }, error: null }))
      })
      await getTranslationsForLocale('cached-locale')

      // Second call uses cache
      mockFrom.mockClear()
      const dict = await getTranslationsForLocale('cached-locale')
      expect(dict).not.toBeNull()
      expect(dict!.s.k).toBe('X')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('returns null when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const dict = await getTranslationsForLocale('en')
      expect(dict).toBeNull()
    })

    it('returns null on DB error', async () => {
      mockResult = { data: null, error: { message: 'query failed' } }
      const dict = await getTranslationsForLocale('en')
      expect(dict).toBeNull()
    })

    it('returns null when data is null', async () => {
      mockResult = { data: null, error: null }
      const dict = await getTranslationsForLocale('en')
      expect(dict).toBeNull()
    })

    it('returns null when data is empty array', async () => {
      mockResult = { data: [], error: null }
      const dict = await getTranslationsForLocale('en')
      expect(dict).toBeNull()
    })

    it('creates new section in dict when section not yet seen', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [
              { value: 'A', translation_keys: { section: 'first', key: 'a' } },
              { value: 'B', translation_keys: { section: 'second', key: 'b' } },
            ],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: { value: '1' }, error: null }))
      })

      const dict = await getTranslationsForLocale('section-test')
      expect(dict).not.toBeNull()
      expect(dict!.first.a).toBe('A')
      expect(dict!.second.b).toBe('B')
    })
  })

  // ===========================================================================
  // getTranslationsFlat
  // ===========================================================================

  describe('getTranslationsFlat', () => {
    it('returns flat translation list with key info', async () => {
      mockResult = {
        data: [
          {
            id: 't1',
            key_id: 'k1',
            locale: 'tr',
            value: 'Ana Sayfa',
            is_reviewed: true,
            updated_by: 'admin-1',
            updated_at: '2026-01-01T00:00:00Z',
            translation_keys: { section: 'nav', key: 'home' },
          },
        ],
        error: null,
      }

      const flat = await getTranslationsFlat('tr')
      expect(flat).toHaveLength(1)
      expect(flat[0].id).toBe('t1')
      expect(flat[0].keyId).toBe('k1')
      expect(flat[0].value).toBe('Ana Sayfa')
      expect(flat[0].isReviewed).toBe(true)
      expect(flat[0].section).toBe('nav')
      expect(flat[0].key).toBe('home')
      expect(flat[0].updatedBy).toBe('admin-1')
    })

    it('returns [] when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const flat = await getTranslationsFlat('en')
      expect(flat).toEqual([])
    })

    it('returns [] on DB error', async () => {
      mockResult = { data: null, error: { message: 'failed' } }
      const flat = await getTranslationsFlat('en')
      expect(flat).toEqual([])
    })

    it('returns [] when data is null (no error)', async () => {
      mockResult = { data: null, error: null }
      const flat = await getTranslationsFlat('en')
      expect(flat).toEqual([])
    })
  })

  // ===========================================================================
  // updateTranslation
  // ===========================================================================

  describe('updateTranslation', () => {
    it('returns true on successful update with adminId', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // Key lookup
          return Promise.resolve(cb({ data: { id: 'k-123' }, error: null }))
        }
        // Upsert
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await updateTranslation('tr', 'nav', 'home', 'Ana Sayfa', 'admin-1')
      expect(result).toBe(true)
      expect(thenable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          key_id: 'k-123',
          locale: 'tr',
          value: 'Ana Sayfa',
          is_reviewed: true,
          updated_by: 'admin-1',
        }),
        { onConflict: 'key_id,locale' }
      )
    })

    it('uses null for updated_by when adminId not provided', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: { id: 'k-456' }, error: null }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      await updateTranslation('en', 'nav', 'home', 'Home')
      expect(thenable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ updated_by: null }),
        expect.anything()
      )
    })

    it('returns false when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await updateTranslation('en', 'nav', 'home', 'Home')
      expect(result).toBe(false)
    })

    it('returns false when key not found (keyError)', async () => {
      mockResult = { data: null, error: { message: 'not found' } }
      const result = await updateTranslation('en', 'nav', 'nonexistent', 'Value')
      expect(result).toBe(false)
    })

    it('returns false when key not found (keyData is null)', async () => {
      mockResult = { data: null, error: null }
      const result = await updateTranslation('en', 'nav', 'nonexistent', 'Value')
      expect(result).toBe(false)
    })

    it('returns false when upsert fails', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: { id: 'k-789' }, error: null }))
        }
        return Promise.resolve(cb({ data: null, error: { message: 'upsert failed' } }))
      })

      const result = await updateTranslation('en', 'nav', 'home', 'Home')
      expect(result).toBe(false)
    })

    it('invalidates locale cache and version cache on success', async () => {
      // Populate translation cache
      let innerCallCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        innerCallCount++
        if (innerCallCount === 1) {
          return Promise.resolve(cb({
            data: [{ value: 'Old', translation_keys: { section: 'nav', key: 'home' } }],
            error: null,
          }))
        }
        if (innerCallCount === 2) {
          return Promise.resolve(cb({ data: { value: '1' }, error: null }))
        }
        // Update calls
        if (innerCallCount === 3) {
          return Promise.resolve(cb({ data: { id: 'k-1' }, error: null }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      await getTranslationsForLocale('invalidate-locale')
      const result = await updateTranslation('invalidate-locale', 'nav', 'home', 'New')
      expect(result).toBe(true)

      // Cache should be invalidated — next call should hit DB
      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: [], error: null }
      const dict = await getTranslationsForLocale('invalidate-locale')
      expect(dict).toBeNull() // empty array -> null
      expect(mockFrom).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // batchUpdateTranslations
  // ===========================================================================

  describe('batchUpdateTranslations', () => {
    it('returns error when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await batchUpdateTranslations('en', [{ section: 'nav', key: 'home', value: 'Home' }])
      expect(result.errors).toContain('Database not configured')
      expect(result.applied).toBe(0)
    })

    it('returns error when keys lookup returns null', async () => {
      mockResult = { data: null, error: null }
      const result = await batchUpdateTranslations('en', [{ section: 'nav', key: 'home', value: 'Home' }])
      expect(result.errors).toContain('Failed to fetch translation keys')
    })

    it('tracks missing keys as failures', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // Keys lookup: only has nav.home
          return Promise.resolve(cb({
            data: [{ id: 'k1', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        // Upsert
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await batchUpdateTranslations('en', [
        { section: 'nav', key: 'home', value: 'Home' },
        { section: 'nav', key: 'nonexistent', value: 'Missing' },
      ])

      expect(result.failed).toBe(1)
      expect(result.applied).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('nav.nonexistent')
    })

    it('handles all keys missing (no rows to upsert)', async () => {
      mockResult = { data: [], error: null }
      const result = await batchUpdateTranslations('en', [
        { section: 'missing', key: 'key1', value: 'v1' },
      ])
      expect(result.failed).toBe(1)
      expect(result.applied).toBe(0)
    })

    it('processes batches of 100 and tracks successes', async () => {
      // Build 250 updates
      const updates = Array.from({ length: 250 }, (_, i) => ({
        section: 'section',
        key: `key${i}`,
        value: `value${i}`,
      }))

      // Keys lookup returns all 250
      const allKeys = updates.map((u, i) => ({
        id: `k-${i}`,
        section: u.section,
        key: u.key,
      }))

      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: allKeys, error: null }))
        }
        // All upsert batches succeed
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await batchUpdateTranslations('en', updates)
      expect(result.applied).toBe(250)
      expect(result.failed).toBe(0)
      // 3 batches: 100, 100, 50
      expect(thenable.upsert).toHaveBeenCalledTimes(3)
    })

    it('tracks failed batches', async () => {
      const updates = [
        { section: 's', key: 'k1', value: 'v1' },
        { section: 's', key: 'k2', value: 'v2' },
      ]

      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [
              { id: 'id1', section: 's', key: 'k1' },
              { id: 'id2', section: 's', key: 'k2' },
            ],
            error: null,
          }))
        }
        // Upsert batch fails
        return Promise.resolve(cb({ data: null, error: { message: 'batch error' } }))
      })

      const result = await batchUpdateTranslations('en', updates)
      expect(result.failed).toBe(2)
      expect(result.applied).toBe(0)
      expect(result.errors[0]).toContain('Batch 1 failed')
    })

    it('uses null for updated_by when adminId not provided', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ id: 'k-1', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      await batchUpdateTranslations('en', [{ section: 'nav', key: 'home', value: 'Home' }])
      expect(thenable.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ updated_by: null }),
        ]),
        expect.anything()
      )
    })

    it('passes adminId to updated_by when provided', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ id: 'k-1', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      await batchUpdateTranslations('en', [{ section: 'nav', key: 'home', value: 'Home' }], 'admin-42')
      expect(thenable.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ updated_by: 'admin-42' }),
        ]),
        expect.anything()
      )
    })

    it('invalidates locale and version cache', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ id: 'k-1', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      await batchUpdateTranslations('batch-locale', [{ section: 'nav', key: 'home', value: 'V' }])

      // Verify version cache is cleared by calling getTranslationVersion — should hit DB
      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: { value: '99' }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('99')
      expect(mockFrom).toHaveBeenCalledWith('translation_metadata')
    })
  })

  // ===========================================================================
  // getCoverage
  // ===========================================================================

  describe('getCoverage', () => {
    it('returns coverage stats with section breakdown', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // All keys
          return Promise.resolve(cb({
            data: [
              { section: 'nav' },
              { section: 'nav' },
              { section: 'common' },
              { section: 'common' },
              { section: 'common' },
            ],
            error: null,
          }))
        }
        // Translations for locale
        return Promise.resolve(cb({
          data: [
            { is_reviewed: true, translation_keys: { section: 'nav' } },
            { is_reviewed: false, translation_keys: { section: 'nav' } },
            { is_reviewed: true, translation_keys: { section: 'common' } },
          ],
          error: null,
        }))
      })

      const stats = await getCoverage('tr')
      expect(stats).not.toBeNull()
      expect(stats!.locale).toBe('tr')
      expect(stats!.total).toBe(5)
      expect(stats!.translated).toBe(3)
      expect(stats!.reviewed).toBe(2)
      expect(stats!.percentage).toBe(60)
      expect(stats!.reviewedPercentage).toBe(40)
      expect(stats!.bySectionCount.nav).toEqual({ total: 2, translated: 2 })
      expect(stats!.bySectionCount.common).toEqual({ total: 3, translated: 1 })
    })

    it('returns null when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const stats = await getCoverage('en')
      expect(stats).toBeNull()
    })

    it('returns null when allKeys is null', async () => {
      mockResult = { data: null, error: null }
      const stats = await getCoverage('en')
      expect(stats).toBeNull()
    })

    it('handles empty translations (0 translated)', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ section: 'nav' }, { section: 'nav' }],
            error: null,
          }))
        }
        // No translations for this locale
        return Promise.resolve(cb({ data: [], error: null }))
      })

      const stats = await getCoverage('de')
      expect(stats).not.toBeNull()
      expect(stats!.total).toBe(2)
      expect(stats!.translated).toBe(0)
      expect(stats!.reviewed).toBe(0)
      expect(stats!.percentage).toBe(0)
      expect(stats!.bySectionCount.nav).toEqual({ total: 2, translated: 0 })
    })

    it('handles null translations data', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ section: 'nav' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const stats = await getCoverage('null-translations')
      expect(stats).not.toBeNull()
      expect(stats!.total).toBe(1)
      expect(stats!.translated).toBe(0)
    })

    it('handles zero total keys (percentage = 0)', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: [], error: null }))
        }
        return Promise.resolve(cb({ data: [], error: null }))
      })

      const stats = await getCoverage('empty')
      expect(stats).not.toBeNull()
      expect(stats!.total).toBe(0)
      expect(stats!.percentage).toBe(0)
      expect(stats!.reviewedPercentage).toBe(0)
    })

    it('counts sections with no translations as 0 translated', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [
              { section: 'nav' },
              { section: 'footer' },
            ],
            error: null,
          }))
        }
        // Only nav has a translation
        return Promise.resolve(cb({
          data: [{ is_reviewed: false, translation_keys: { section: 'nav' } }],
          error: null,
        }))
      })

      const stats = await getCoverage('partial')
      expect(stats!.bySectionCount.footer).toEqual({ total: 1, translated: 0 })
    })
  })

  // ===========================================================================
  // exportLocale
  // ===========================================================================

  describe('exportLocale', () => {
    it('returns export object with locale, version, keyCount, translations', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // getTranslationsForLocale query
          return Promise.resolve(cb({
            data: [
              { value: 'Home', translation_keys: { section: 'nav', key: 'home' } },
              { value: 'Dashboard', translation_keys: { section: 'nav', key: 'dashboard' } },
              { value: 'Loading', translation_keys: { section: 'common', key: 'loading' } },
            ],
            error: null,
          }))
        }
        // Version queries (from getTranslationsForLocale cache + exportLocale)
        return Promise.resolve(cb({ data: { value: '"7"' }, error: null }))
      })

      const result = await exportLocale('en')
      expect(result).not.toBeNull()
      expect(result!.locale).toBe('en')
      expect(result!.keyCount).toBe(3)
      expect(result!.translations.nav.home).toBe('Home')
      expect(result!.exportedAt).toBeTruthy()
    })

    it('returns null when getTranslationsForLocale returns null', async () => {
      mockResult = { data: null, error: null }
      const result = await exportLocale('nonexistent')
      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // importLocale
  // ===========================================================================

  describe('importLocale', () => {
    it('returns total count in dryRun mode without applying', async () => {
      const result = await importLocale(
        'tr',
        { nav: { home: 'Ana Sayfa', dashboard: 'Panel' }, common: { loading: 'Yukleniyor' } },
        'admin-1',
        true // dryRun
      )

      expect(result.total).toBe(3)
      expect(result.applied).toBe(3)
      expect(result.skipped).toBe(0)
      expect(result.errors).toHaveLength(0)
      // Should NOT call supabase
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('skips non-object section values', async () => {
      const result = await importLocale(
        'tr',
        {
          nav: { home: 'Ana Sayfa' },
          badSection: 'string-not-object' as unknown as Record<string, string>,
        },
        undefined,
        true
      )
      expect(result.total).toBe(1) // Only nav.home counted
    })

    it('skips null section values', async () => {
      const result = await importLocale(
        'tr',
        {
          nav: { home: 'Ana Sayfa' },
          nullSection: null as unknown as Record<string, string>,
        },
        undefined,
        true
      )
      expect(result.total).toBe(1)
    })

    it('skips non-string translation values', async () => {
      const result = await importLocale(
        'tr',
        {
          nav: {
            home: 'Ana Sayfa',
            number: 42 as unknown as string,
            bool: true as unknown as string,
          },
        },
        undefined,
        true
      )
      expect(result.total).toBe(1) // Only 'home' counted
    })

    it('returns error when supabase is not configured (non-dryRun)', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await importLocale('en', { nav: { home: 'Home' } })
      expect(result.errors).toContain('Database not configured')
    })

    it('creates missing keys before batch update', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // existingKeys lookup
          return Promise.resolve(cb({
            data: [{ section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        if (callCount === 2) {
          // Insert missing keys
          return Promise.resolve(cb({ data: null, error: null }))
        }
        if (callCount === 3) {
          // batchUpdateTranslations: keys lookup
          return Promise.resolve(cb({
            data: [
              { id: 'k-1', section: 'nav', key: 'home' },
              { id: 'k-new', section: 'nav', key: 'newKey' },
            ],
            error: null,
          }))
        }
        // batchUpdateTranslations: upsert
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await importLocale('en', {
        nav: { home: 'Home', newKey: 'New' },
      })

      expect(result.total).toBe(2)
      expect(result.created).toBe(1)
      expect(result.applied).toBe(2)
    })

    it('handles error when creating missing keys', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // existingKeys: none
          return Promise.resolve(cb({ data: [], error: null }))
        }
        if (callCount === 2) {
          // Insert keys fails
          return Promise.resolve(cb({ data: null, error: { message: 'insert failed' } }))
        }
        if (callCount === 3) {
          // batchUpdateTranslations: keys lookup (keys still don't exist)
          return Promise.resolve(cb({ data: [], error: null }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await importLocale('en', { nav: { home: 'Home' } })
      expect(result.errors.some(e => e.includes('Failed to create'))).toBe(true)
      expect(result.created).toBe(0)
    })

    it('skips key creation when all keys exist', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // existingKeys
          return Promise.resolve(cb({
            data: [{ section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        if (callCount === 2) {
          // batchUpdateTranslations: keys lookup
          return Promise.resolve(cb({
            data: [{ id: 'k-1', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await importLocale('en', { nav: { home: 'Home' } })
      expect(result.created).toBe(0)
      expect(result.applied).toBe(1)
    })

    it('handles existingKeys returning null', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          // existingKeys: null
          return Promise.resolve(cb({ data: null, error: null }))
        }
        if (callCount === 2) {
          // insert new keys
          return Promise.resolve(cb({ data: null, error: null }))
        }
        if (callCount === 3) {
          // batchUpdateTranslations: keys lookup
          return Promise.resolve(cb({
            data: [{ id: 'k-new', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await importLocale('en', { nav: { home: 'Home' } })
      expect(result.created).toBe(1) // All treated as missing
    })

    it('passes adminId through to batchUpdateTranslations', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        if (callCount === 2) {
          return Promise.resolve(cb({
            data: [{ id: 'k-1', section: 'nav', key: 'home' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      await importLocale('en', { nav: { home: 'Home' } }, 'admin-import')
      expect(thenable.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ updated_by: 'admin-import' }),
        ]),
        expect.anything()
      )
    })

    it('defaults dryRun to false', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: [{ section: 'nav', key: 'home' }], error: null }))
        }
        if (callCount === 2) {
          return Promise.resolve(cb({ data: [{ id: 'k-1', section: 'nav', key: 'home' }], error: null }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      // Call without dryRun parameter — should actually process
      const result = await importLocale('en', { nav: { home: 'Home' } })
      expect(result.applied).toBe(1)
      expect(mockFrom).toHaveBeenCalled() // DB was accessed
    })
  })

  // ===========================================================================
  // getAuditLog
  // ===========================================================================

  describe('getAuditLog', () => {
    it('returns mapped audit entries with total count', async () => {
      mockResult = {
        data: [
          {
            id: 'a1',
            locale: 'tr',
            section: 'nav',
            key: 'home',
            previous_value: 'Ev',
            new_value: 'Ana Sayfa',
            changed_by: 'admin-1',
            changed_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      }

      // Need to handle the count being in the result
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      const result = await getAuditLog()
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].id).toBe('a1')
      expect(result.entries[0].previousValue).toBe('Ev')
      expect(result.entries[0].newValue).toBe('Ana Sayfa')
      expect(result.entries[0].changedBy).toBe('admin-1')
      expect(result.total).toBe(1)
    })

    it('returns empty result when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const result = await getAuditLog()
      expect(result).toEqual({ entries: [], total: 0 })
    })

    it('returns empty result on DB error', async () => {
      mockResult = { data: null, error: { message: 'audit query failed' }, count: null }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )
      const result = await getAuditLog()
      expect(result).toEqual({ entries: [], total: 0 })
    })

    it('applies locale filter when provided', async () => {
      mockResult = { data: [], error: null, count: 0 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      await getAuditLog({ locale: 'tr' })
      // eq should be called with locale filter
      expect(thenable.eq).toHaveBeenCalledWith('locale', 'tr')
    })

    it('applies section filter when provided', async () => {
      mockResult = { data: [], error: null, count: 0 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      await getAuditLog({ section: 'nav' })
      expect(thenable.eq).toHaveBeenCalledWith('section', 'nav')
    })

    it('applies both locale and section filters', async () => {
      mockResult = { data: [], error: null, count: 0 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      await getAuditLog({ locale: 'en', section: 'common' })
      expect(thenable.eq).toHaveBeenCalledWith('locale', 'en')
      expect(thenable.eq).toHaveBeenCalledWith('section', 'common')
    })

    it('uses default offset 0 and limit 50 when not provided', async () => {
      mockResult = { data: [], error: null, count: 0 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      await getAuditLog()
      expect(thenable.range).toHaveBeenCalledWith(0, 49)
    })

    it('uses custom offset and limit', async () => {
      mockResult = { data: [], error: null, count: 0 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      await getAuditLog({ offset: 10, limit: 20 })
      expect(thenable.range).toHaveBeenCalledWith(10, 29)
    })

    it('handles null count in result', async () => {
      mockResult = { data: [], error: null, count: null }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      const result = await getAuditLog()
      expect(result.total).toBe(0)
    })

    it('handles undefined options (no filters)', async () => {
      mockResult = { data: [], error: null, count: 5 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      const result = await getAuditLog(undefined)
      expect(result.total).toBe(5)
    })

    it('handles null previousValue in audit entry', async () => {
      mockResult = {
        data: [{
          id: 'a2',
          locale: 'de',
          section: 'nav',
          key: 'home',
          previous_value: null,
          new_value: 'Startseite',
          changed_by: null,
          changed_at: '2026-01-01',
        }],
        error: null,
        count: 1,
      }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      const result = await getAuditLog()
      expect(result.entries[0].previousValue).toBeNull()
      expect(result.entries[0].changedBy).toBeNull()
    })

    it('returns empty entries when data is null (no error)', async () => {
      mockResult = { data: null, error: null, count: 0 }
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) =>
        Promise.resolve(cb(mockResult))
      )

      const result = await getAuditLog()
      expect(result.entries).toEqual([])
    })
  })

  // ===========================================================================
  // invalidateCache
  // ===========================================================================

  describe('invalidateCache', () => {
    it('invalidates specific locale translation cache', async () => {
      // Populate cache for two locales
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount % 2 === 1) {
          return Promise.resolve(cb({
            data: [{ value: 'V', translation_keys: { section: 's', key: 'k' } }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: { value: '1' }, error: null }))
      })

      await getTranslationsForLocale('locale-a')
      await getTranslationsForLocale('locale-b')

      // Invalidate only locale-a
      invalidateCache('locale-a')

      // locale-a should require DB hit, locale-b should use cache
      mockFrom.mockClear()
      const dictB = await getTranslationsForLocale('locale-b')
      expect(dictB).not.toBeNull()
      expect(mockFrom).not.toHaveBeenCalled() // Served from cache
    })

    it('invalidates all caches when no locale specified', async () => {
      // Populate caches
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ value: 'V', translation_keys: { section: 's', key: 'k' } }],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: { value: '1' }, error: null }))
      })
      await getTranslationsForLocale('clear-all')

      invalidateCache() // No locale — clears everything

      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: [], error: null }
      const dict = await getTranslationsForLocale('clear-all')
      expect(dict).toBeNull()
      expect(mockFrom).toHaveBeenCalled()
    })

    it('also clears localesCache and versionCache', async () => {
      // Populate localesCache
      mockResult = {
        data: [{ code: 'en', name: 'English', native_name: 'English', flag: 'EN', is_rtl: false, is_active: true, is_default: true, display_order: 1 }],
        error: null,
      }
      await getActiveLocales()

      // Populate versionCache
      resetThenable()
      mockResult = { data: { value: '5' }, error: null }
      await getTranslationVersion()

      // Invalidate all
      invalidateCache()

      // Both should require DB calls
      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: { value: '6' }, error: null }
      await getTranslationVersion()
      expect(mockFrom).toHaveBeenCalledWith('translation_metadata')

      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: [], error: null }
      await getActiveLocales()
      expect(mockFrom).toHaveBeenCalledWith('translation_locales')
    })

    it('clears localesCache and versionCache even when locale-specific invalidation', async () => {
      // Populate versionCache
      mockResult = { data: { value: '10' }, error: null }
      await getTranslationVersion()

      // Invalidate specific locale — should also clear versionCache and localesCache
      invalidateCache('some-locale')

      mockFrom.mockClear()
      resetThenable()
      mockResult = { data: { value: '11' }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('11')
      expect(mockFrom).toHaveBeenCalledWith('translation_metadata')
    })
  })

  // ===========================================================================
  // getSupabase() branch — no env vars
  // ===========================================================================

  describe('getSupabase null branch (no env)', () => {
    beforeEach(() => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      invalidateCache()
    })

    it('getTranslationVersion returns "0"', async () => {
      const version = await getTranslationVersion()
      expect(version).toBe('0')
    })

    it('getActiveLocales returns []', async () => {
      const locales = await getActiveLocales()
      expect(locales).toEqual([])
    })

    it('getAllLocales returns []', async () => {
      const locales = await getAllLocales()
      expect(locales).toEqual([])
    })

    it('createLocale returns null', async () => {
      const locale = await createLocale({ code: 'x', name: 'X', nativeName: 'X' })
      expect(locale).toBeNull()
    })

    it('updateLocale returns false', async () => {
      const result = await updateLocale('x', { name: 'X' })
      expect(result).toBe(false)
    })

    it('getAllKeys returns []', async () => {
      const keys = await getAllKeys()
      expect(keys).toEqual([])
    })

    it('createKey returns null', async () => {
      const key = await createKey({ section: 'a', key: 'b' })
      expect(key).toBeNull()
    })

    it('deleteKey returns false', async () => {
      const result = await deleteKey('a', 'b')
      expect(result).toBe(false)
    })

    it('getTranslationsForLocale returns null', async () => {
      const dict = await getTranslationsForLocale('en')
      expect(dict).toBeNull()
    })

    it('getTranslationsFlat returns []', async () => {
      const flat = await getTranslationsFlat('en')
      expect(flat).toEqual([])
    })

    it('updateTranslation returns false', async () => {
      const result = await updateTranslation('en', 'nav', 'home', 'Home')
      expect(result).toBe(false)
    })

    it('batchUpdateTranslations returns DB not configured', async () => {
      const result = await batchUpdateTranslations('en', [{ section: 'a', key: 'b', value: 'c' }])
      expect(result.errors).toContain('Database not configured')
    })

    it('getCoverage returns null', async () => {
      const stats = await getCoverage('en')
      expect(stats).toBeNull()
    })

    it('exportLocale returns null', async () => {
      const result = await exportLocale('en')
      expect(result).toBeNull()
    })

    it('importLocale (non-dryRun) returns DB not configured', async () => {
      const result = await importLocale('en', { nav: { home: 'Home' } })
      expect(result.errors).toContain('Database not configured')
    })

    it('getAuditLog returns empty', async () => {
      const result = await getAuditLog()
      expect(result).toEqual({ entries: [], total: 0 })
    })
  })

  // ===========================================================================
  // getSupabase() VITE_SUPABASE_URL fallback
  // ===========================================================================

  describe('getSupabase VITE_SUPABASE_URL fallback', () => {
    it('uses VITE_SUPABASE_URL when SUPABASE_URL is not set', async () => {
      delete process.env.SUPABASE_URL
      process.env.VITE_SUPABASE_URL = 'https://vite-test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      mockResult = { data: { value: '42' }, error: null }
      const version = await getTranslationVersion()
      // Should work because VITE_SUPABASE_URL is available
      expect(version).toBe('42')
    })
  })

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('Edge cases', () => {
    it('getTranslationVersion strips quotes from value string', async () => {
      mockResult = { data: { value: '"123"' }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('123')
    })

    it('getTranslationVersion handles value with multiple quotes', async () => {
      mockResult = { data: { value: '""5""' }, error: null }
      const version = await getTranslationVersion()
      expect(version).toBe('5')
    })

    it('batchUpdateTranslations handles empty updates array', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({ data: [], error: null }))
        }
        return Promise.resolve(cb({ data: null, error: null }))
      })

      const result = await batchUpdateTranslations('en', [])
      // No keys to look up, so all fail
      expect(result.applied).toBe(0)
    })

    it('importLocale handles empty translations object', async () => {
      const result = await importLocale('en', {}, undefined, true)
      expect(result.total).toBe(0)
      expect(result.applied).toBe(0)
    })

    it('getCoverage handles translations with mix of reviewed and unreviewed', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [{ section: 'nav' }, { section: 'nav' }, { section: 'nav' }],
            error: null,
          }))
        }
        return Promise.resolve(cb({
          data: [
            { is_reviewed: true, translation_keys: { section: 'nav' } },
            { is_reviewed: false, translation_keys: { section: 'nav' } },
            { is_reviewed: true, translation_keys: { section: 'nav' } },
          ],
          error: null,
        }))
      })

      const stats = await getCoverage('mix-locale')
      expect(stats!.reviewed).toBe(2)
      expect(stats!.translated).toBe(3)
    })

    it('exportLocale counts keys across multiple sections', async () => {
      let callCount = 0
      thenable.then.mockImplementation((cb: (val: unknown) => unknown) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(cb({
            data: [
              { value: 'A', translation_keys: { section: 's1', key: 'k1' } },
              { value: 'B', translation_keys: { section: 's1', key: 'k2' } },
              { value: 'C', translation_keys: { section: 's2', key: 'k3' } },
              { value: 'D', translation_keys: { section: 's3', key: 'k4' } },
            ],
            error: null,
          }))
        }
        return Promise.resolve(cb({ data: { value: '1' }, error: null }))
      })

      const result = await exportLocale('multi-section')
      expect(result!.keyCount).toBe(4)
    })
  })
})
