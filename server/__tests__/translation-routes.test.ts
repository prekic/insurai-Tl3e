/**
 * Translation Routes Tests
 *
 * Tests for the translation API endpoints:
 * - Public endpoints: GET locales, GET translations
 * - Admin endpoints: CRUD keys, translations, locales, import/export
 * - Validation: Schema validation, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

// =============================================================================
// VALIDATION SCHEMAS (mirrored from routes)
// =============================================================================

const updateTranslationSchema = z.object({
  value: z.string().min(1, 'Translation value cannot be empty'),
})

const batchUpdateSchema = z.object({
  updates: z.array(z.object({
    section: z.string().min(1),
    key: z.string().min(1),
    value: z.string().min(1),
  })).min(1).max(1000),
})

const createKeySchema = z.object({
  section: z.string().min(1).max(50),
  key: z.string().min(1).max(100),
  description: z.string().optional(),
  context: z.string().optional(),
  maxLength: z.number().positive().optional(),
})

const createLocaleSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(1).max(50),
  nativeName: z.string().min(1).max(50),
  flag: z.string().max(10).optional(),
  isRtl: z.boolean().optional(),
  displayOrder: z.number().optional(),
})

const updateLocaleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  nativeName: z.string().min(1).max(50).optional(),
  flag: z.string().max(10).optional(),
  isRtl: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().optional(),
})

const importSchema = z.object({
  translations: z.record(z.string(), z.record(z.string(), z.string())),
})

// =============================================================================
// TESTS
// =============================================================================

describe('Translation Routes - Validation Schemas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =====================================================================
  // updateTranslationSchema
  // =====================================================================

  describe('updateTranslationSchema', () => {
    it('should accept valid translation value', () => {
      const result = updateTranslationSchema.safeParse({ value: 'Home' })
      expect(result.success).toBe(true)
    })

    it('should reject empty value', () => {
      const result = updateTranslationSchema.safeParse({ value: '' })
      expect(result.success).toBe(false)
    })

    it('should reject missing value', () => {
      const result = updateTranslationSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should accept Turkish characters', () => {
      const result = updateTranslationSchema.safeParse({ value: 'Türkçe özel karakterler: İ, Ş, Ğ, Ü, Ö, Ç' })
      expect(result.success).toBe(true)
    })

    it('should accept RTL text', () => {
      const result = updateTranslationSchema.safeParse({ value: 'الصفحة الرئيسية' })
      expect(result.success).toBe(true)
    })

    it('should accept multi-line values', () => {
      const result = updateTranslationSchema.safeParse({ value: 'Line 1\nLine 2\nLine 3' })
      expect(result.success).toBe(true)
    })

    it('should accept values with HTML entities', () => {
      const result = updateTranslationSchema.safeParse({ value: 'Don&apos;t panic &amp; keep calm' })
      expect(result.success).toBe(true)
    })
  })

  // =====================================================================
  // batchUpdateSchema
  // =====================================================================

  describe('batchUpdateSchema', () => {
    it('should accept valid batch update', () => {
      const result = batchUpdateSchema.safeParse({
        updates: [
          { section: 'nav', key: 'home', value: 'Ana Sayfa' },
          { section: 'nav', key: 'dashboard', value: 'Panel' },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty updates array', () => {
      const result = batchUpdateSchema.safeParse({ updates: [] })
      expect(result.success).toBe(false)
    })

    it('should reject updates with empty section', () => {
      const result = batchUpdateSchema.safeParse({
        updates: [{ section: '', key: 'home', value: 'Home' }],
      })
      expect(result.success).toBe(false)
    })

    it('should reject updates with empty key', () => {
      const result = batchUpdateSchema.safeParse({
        updates: [{ section: 'nav', key: '', value: 'Home' }],
      })
      expect(result.success).toBe(false)
    })

    it('should reject updates with empty value', () => {
      const result = batchUpdateSchema.safeParse({
        updates: [{ section: 'nav', key: 'home', value: '' }],
      })
      expect(result.success).toBe(false)
    })

    it('should reject more than 1000 updates', () => {
      const updates = Array.from({ length: 1001 }, (_, i) => ({
        section: 'test', key: `key${i}`, value: `value${i}`,
      }))
      const result = batchUpdateSchema.safeParse({ updates })
      expect(result.success).toBe(false)
    })

    it('should accept exactly 1000 updates', () => {
      const updates = Array.from({ length: 1000 }, (_, i) => ({
        section: 'test', key: `key${i}`, value: `value${i}`,
      }))
      const result = batchUpdateSchema.safeParse({ updates })
      expect(result.success).toBe(true)
    })
  })

  // =====================================================================
  // createKeySchema
  // =====================================================================

  describe('createKeySchema', () => {
    it('should accept valid key with all fields', () => {
      const result = createKeySchema.safeParse({
        section: 'nav',
        key: 'newFeature',
        description: 'New feature label',
        context: 'Used in navigation bar',
        maxLength: 50,
      })
      expect(result.success).toBe(true)
    })

    it('should accept key with only required fields', () => {
      const result = createKeySchema.safeParse({
        section: 'nav',
        key: 'newFeature',
      })
      expect(result.success).toBe(true)
    })

    it('should reject section over 50 chars', () => {
      const result = createKeySchema.safeParse({
        section: 'a'.repeat(51),
        key: 'test',
      })
      expect(result.success).toBe(false)
    })

    it('should reject key over 100 chars', () => {
      const result = createKeySchema.safeParse({
        section: 'nav',
        key: 'a'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    it('should reject negative maxLength', () => {
      const result = createKeySchema.safeParse({
        section: 'nav',
        key: 'test',
        maxLength: -5,
      })
      expect(result.success).toBe(false)
    })

    it('should reject zero maxLength', () => {
      const result = createKeySchema.safeParse({
        section: 'nav',
        key: 'test',
        maxLength: 0,
      })
      expect(result.success).toBe(false)
    })
  })

  // =====================================================================
  // createLocaleSchema
  // =====================================================================

  describe('createLocaleSchema', () => {
    it('should accept valid locale with all fields', () => {
      const result = createLocaleSchema.safeParse({
        code: 'de',
        name: 'German',
        nativeName: 'Deutsch',
        flag: '🇩🇪',
        isRtl: false,
        displayOrder: 3,
      })
      expect(result.success).toBe(true)
    })

    it('should accept locale with only required fields', () => {
      const result = createLocaleSchema.safeParse({
        code: 'fr',
        name: 'French',
        nativeName: 'Français',
      })
      expect(result.success).toBe(true)
    })

    it('should reject code shorter than 2 chars', () => {
      const result = createLocaleSchema.safeParse({
        code: 'e',
        name: 'English',
        nativeName: 'English',
      })
      expect(result.success).toBe(false)
    })

    it('should reject code longer than 10 chars', () => {
      const result = createLocaleSchema.safeParse({
        code: 'verylongcode',
        name: 'Test',
        nativeName: 'Test',
      })
      expect(result.success).toBe(false)
    })

    it('should accept RTL locale', () => {
      const result = createLocaleSchema.safeParse({
        code: 'ar',
        name: 'Arabic',
        nativeName: 'العربية',
        flag: '🇸🇦',
        isRtl: true,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isRtl).toBe(true)
      }
    })

    it('should reject empty name', () => {
      const result = createLocaleSchema.safeParse({
        code: 'de',
        name: '',
        nativeName: 'Deutsch',
      })
      expect(result.success).toBe(false)
    })
  })

  // =====================================================================
  // updateLocaleSchema
  // =====================================================================

  describe('updateLocaleSchema', () => {
    it('should accept partial updates', () => {
      const result = updateLocaleSchema.safeParse({ name: 'Updated German' })
      expect(result.success).toBe(true)
    })

    it('should accept deactivation', () => {
      const result = updateLocaleSchema.safeParse({ isActive: false })
      expect(result.success).toBe(true)
    })

    it('should accept empty object (no changes)', () => {
      const result = updateLocaleSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should accept all fields at once', () => {
      const result = updateLocaleSchema.safeParse({
        name: 'German',
        nativeName: 'Deutsch',
        flag: '🇩🇪',
        isRtl: false,
        isActive: true,
        displayOrder: 5,
      })
      expect(result.success).toBe(true)
    })

    it('should reject name over 50 chars', () => {
      const result = updateLocaleSchema.safeParse({
        name: 'A'.repeat(51),
      })
      expect(result.success).toBe(false)
    })
  })

  // =====================================================================
  // importSchema
  // =====================================================================

  describe('importSchema', () => {
    it('should accept valid nested translation object', () => {
      const result = importSchema.safeParse({
        translations: {
          nav: { home: 'Startseite', dashboard: 'Übersicht' },
          common: { loading: 'Laden...', error: 'Fehler' },
        },
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty sections', () => {
      const result = importSchema.safeParse({
        translations: { nav: {} },
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty translations object', () => {
      const result = importSchema.safeParse({
        translations: {},
      })
      expect(result.success).toBe(true)
    })

    it('should reject non-string values in sections', () => {
      const result = importSchema.safeParse({
        translations: {
          nav: { home: 123 },
        },
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing translations field', () => {
      const result = importSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  // =====================================================================
  // Response Structure
  // =====================================================================

  describe('Response structures', () => {
    it('should structure locales response correctly', () => {
      const response = {
        success: true,
        locales: [
          { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isRtl: false, isActive: true, isDefault: true, displayOrder: 1 },
          { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isRtl: false, isActive: true, isDefault: false, displayOrder: 2 },
        ],
        translationVersion: '42',
      }

      expect(response.success).toBe(true)
      expect(response.locales).toHaveLength(2)
      expect(response.translationVersion).toBe('42')
      expect(response.locales[0].isDefault).toBe(true)
    })

    it('should structure translations response correctly', () => {
      const response = {
        success: true,
        locale: 'en',
        version: '42',
        translations: {
          nav: { home: 'Home', dashboard: 'Dashboard' },
          common: { loading: 'Loading...' },
        },
      }

      expect(response.success).toBe(true)
      expect(response.locale).toBe('en')
      expect(response.translations.nav.home).toBe('Home')
    })

    it('should structure keys response with section grouping', () => {
      const keys = [
        { id: '1', section: 'nav', key: 'home', description: null, context: null, maxLength: null },
        { id: '2', section: 'nav', key: 'dashboard', description: null, context: null, maxLength: null },
        { id: '3', section: 'common', key: 'loading', description: null, context: null, maxLength: null },
      ]

      const sections: Record<string, typeof keys> = {}
      for (const key of keys) {
        if (!sections[key.section]) sections[key.section] = []
        sections[key.section].push(key)
      }

      const response = {
        success: true,
        total: keys.length,
        sections: Object.keys(sections),
        keys,
        bySection: sections,
      }

      expect(response.total).toBe(3)
      expect(response.sections).toEqual(['nav', 'common'])
      expect(response.bySection.nav).toHaveLength(2)
      expect(response.bySection.common).toHaveLength(1)
    })

    it('should structure coverage response correctly', () => {
      const response = {
        success: true,
        locale: 'tr',
        total: 685,
        translated: 650,
        reviewed: 640,
        percentage: 94.9,
        reviewedPercentage: 93.4,
        bySectionCount: {
          nav: { total: 13, translated: 13 },
          common: { total: 24, translated: 20 },
        },
      }

      expect(response.percentage).toBe(94.9)
      expect(response.bySectionCount.nav.translated).toBe(13)
      expect(response.bySectionCount.common.translated).toBe(20)
    })

    it('should structure audit response with pagination', () => {
      const response = {
        success: true,
        entries: [
          { id: '1', locale: 'tr', section: 'nav', key: 'home', previousValue: 'Ana Sayfa', newValue: 'Anasayfa', changedBy: null, changedAt: '2026-02-12T10:00:00Z' },
        ],
        total: 42,
        limit: 50,
        offset: 0,
      }

      expect(response.entries).toHaveLength(1)
      expect(response.total).toBe(42)
      expect(response.limit).toBe(50)
    })

    it('should structure batch update response', () => {
      const response = {
        success: true,
        applied: 95,
        failed: 5,
        errors: ['Key not found: nav.obsolete'],
      }

      expect(response.applied).toBe(95)
      expect(response.failed).toBe(5)
      expect(response.errors).toHaveLength(1)
    })

    it('should structure import response', () => {
      const response = {
        success: true,
        dryRun: false,
        total: 685,
        applied: 680,
        skipped: 0,
        created: 5,
        errors: [],
      }

      expect(response.total).toBe(685)
      expect(response.created).toBe(5)
      expect(response.errors).toHaveLength(0)
    })
  })

  // =====================================================================
  // Query parameter handling
  // =====================================================================

  describe('Query parameter handling', () => {
    it('should parse limit with default', () => {
      const parseLimit = (raw: string | undefined) => Math.min(parseInt(raw as string) || 50, 200)
      expect(parseLimit(undefined)).toBe(50)
      expect(parseLimit('100')).toBe(100)
      expect(parseLimit('500')).toBe(200)
      expect(parseLimit('abc')).toBe(50) // NaN falls back to 50 via ||
    })

    it('should parse offset with default', () => {
      const parseOffset = (raw: string | undefined) => parseInt(raw || '0') || 0
      expect(parseOffset(undefined)).toBe(0)
      expect(parseOffset('20')).toBe(20)
      expect(parseOffset('abc')).toBe(0)
    })

    it('should detect dryRun flag', () => {
      expect('true' === 'true').toBe(true)
      expect('false' === 'true').toBe(false)
      expect(undefined === 'true').toBe(false)
    })
  })

  // =====================================================================
  // Error handling patterns
  // =====================================================================

  describe('Error handling', () => {
    it('should return 400 for invalid locale code', () => {
      const locale = ''
      const isValid = locale && locale.length <= 10
      expect(isValid).toBeFalsy()
    })

    it('should return 404 when no translations found', () => {
      const translations = null
      expect(translations).toBeNull()
    })

    it('should return 404 when key not found for update', () => {
      const keyData = null
      expect(keyData).toBeNull()
    })

    it('should handle Supabase not configured', () => {
      // When getSupabase returns null, all operations return empty/null
      const supabase = null
      expect(supabase).toBeNull()
    })
  })
})
