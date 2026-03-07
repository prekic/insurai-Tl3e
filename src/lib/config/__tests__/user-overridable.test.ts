import { describe, it, expect } from 'vitest'
import {
  USER_OVERRIDABLE_CATEGORIES,
  USER_OVERRIDABLE_KEYS,
  PREFERENCE_FIELDS,
  isUserOverridableCategory,
  isUserOverridableKey,
  mergeWithUserPreferences,
  extractOverridableValues,
} from '../user-overridable'

describe('isUserOverridableCategory', () => {
  it('should return true for ui category', () => {
    expect(isUserOverridableCategory('ui')).toBe(true)
  })

  it('should return true for email category', () => {
    expect(isUserOverridableCategory('email')).toBe(true)
  })

  it('should return false for ai category', () => {
    expect(isUserOverridableCategory('ai')).toBe(false)
  })

  it('should return false for rate_limits category', () => {
    expect(isUserOverridableCategory('rate_limits')).toBe(false)
  })

  it('should return false for ocr category', () => {
    expect(isUserOverridableCategory('ocr')).toBe(false)
  })

  it('should return false for unknown category', () => {
    expect(isUserOverridableCategory('unknown')).toBe(false)
  })
})

describe('isUserOverridableKey', () => {
  it('should return true for ui overridable keys', () => {
    expect(isUserOverridableKey('ui', 'default_items_per_page')).toBe(true)
    expect(isUserOverridableKey('ui', 'toast_success_duration_ms')).toBe(true)
  })

  it('should return true for email overridable keys', () => {
    expect(isUserOverridableKey('email', 'default_marketing_enabled')).toBe(true)
    expect(isUserOverridableKey('email', 'reminder_days')).toBe(true)
  })

  it('should return false for non-overridable keys in overridable category', () => {
    expect(isUserOverridableKey('ui', 'max_file_size_mb')).toBe(false)
    expect(isUserOverridableKey('ui', 'allowed_file_extensions')).toBe(false)
  })

  it('should return false for keys in non-overridable category', () => {
    expect(isUserOverridableKey('ai', 'temperature')).toBe(false)
    expect(isUserOverridableKey('rate_limits', 'chat_max_requests')).toBe(false)
  })
})

describe('mergeWithUserPreferences', () => {
  const UI_KEY_MAP: Record<string, string> = {
    default_items_per_page: 'defaultItemsPerPage',
    toast_success_duration_ms: 'toastSuccessDurationMs',
    max_file_size_mb: 'maxFileSizeMb',
  }

  it('should return admin config when user preferences are null', () => {
    const adminConfig = {
      defaultItemsPerPage: 10,
      toastSuccessDurationMs: 3000,
      maxFileSizeMb: 10,
    }

    const result = mergeWithUserPreferences(adminConfig, null, 'ui', UI_KEY_MAP)
    expect(result).toEqual(adminConfig)
  })

  it('should override admin values with user preferences for overridable keys', () => {
    const adminConfig = {
      defaultItemsPerPage: 10,
      toastSuccessDurationMs: 3000,
      maxFileSizeMb: 10,
    }

    const userPrefs = {
      default_items_per_page: 25,
      toast_success_duration_ms: 5000,
    }

    const result = mergeWithUserPreferences(adminConfig, userPrefs, 'ui', UI_KEY_MAP)
    expect(result.defaultItemsPerPage).toBe(25)
    expect(result.toastSuccessDurationMs).toBe(5000)
  })

  it('should NOT override non-overridable keys even if present in user preferences', () => {
    const adminConfig = {
      defaultItemsPerPage: 10,
      toastSuccessDurationMs: 3000,
      maxFileSizeMb: 10,
    }

    const userPrefs = {
      default_items_per_page: 25,
      max_file_size_mb: 100, // NOT overridable
    }

    const result = mergeWithUserPreferences(adminConfig, userPrefs, 'ui', UI_KEY_MAP)
    expect(result.defaultItemsPerPage).toBe(25)
    expect(result.maxFileSizeMb).toBe(10) // Should remain admin value
  })

  it('should handle empty user preferences', () => {
    const adminConfig = { defaultItemsPerPage: 10 }
    const result = mergeWithUserPreferences(adminConfig, {}, 'ui', UI_KEY_MAP)
    expect(result.defaultItemsPerPage).toBe(10)
  })
})

describe('extractOverridableValues', () => {
  const UI_KEY_MAP: Record<string, string> = {
    default_items_per_page: 'defaultItemsPerPage',
    toast_success_duration_ms: 'toastSuccessDurationMs',
    max_file_size_mb: 'maxFileSizeMb',
  }

  it('should extract only overridable values', () => {
    const config = {
      defaultItemsPerPage: 10,
      toastSuccessDurationMs: 3000,
      maxFileSizeMb: 10,
    }

    const result = extractOverridableValues(config, 'ui', UI_KEY_MAP)
    expect(result).toHaveProperty('default_items_per_page', 10)
    expect(result).toHaveProperty('toast_success_duration_ms', 3000)
    expect(result).not.toHaveProperty('max_file_size_mb')
  })
})

describe('USER_OVERRIDABLE_CATEGORIES', () => {
  it('should contain exactly ui and email', () => {
    expect(USER_OVERRIDABLE_CATEGORIES).toEqual(['ui', 'email'])
  })
})

describe('USER_OVERRIDABLE_KEYS', () => {
  it('should have keys for all overridable categories', () => {
    for (const cat of USER_OVERRIDABLE_CATEGORIES) {
      expect(USER_OVERRIDABLE_KEYS[cat]).toBeDefined()
      expect(USER_OVERRIDABLE_KEYS[cat].length).toBeGreaterThan(0)
    }
  })

  it('should include expected ui keys', () => {
    expect(USER_OVERRIDABLE_KEYS.ui).toContain('default_items_per_page')
    expect(USER_OVERRIDABLE_KEYS.ui).toContain('toast_success_duration_ms')
  })

  it('should include expected email keys', () => {
    expect(USER_OVERRIDABLE_KEYS.email).toContain('default_marketing_enabled')
    expect(USER_OVERRIDABLE_KEYS.email).toContain('default_reminders_enabled')
  })

  it('should NOT include non-overridable ui keys', () => {
    expect(USER_OVERRIDABLE_KEYS.ui).not.toContain('max_file_size_mb')
    expect(USER_OVERRIDABLE_KEYS.ui).not.toContain('allowed_file_extensions')
    expect(USER_OVERRIDABLE_KEYS.ui).not.toContain('max_items_per_page')
  })
})

describe('PREFERENCE_FIELDS', () => {
  it('should have metadata for all overridable categories', () => {
    for (const cat of USER_OVERRIDABLE_CATEGORIES) {
      expect(PREFERENCE_FIELDS[cat]).toBeDefined()
      expect(PREFERENCE_FIELDS[cat].length).toBeGreaterThan(0)
    }
  })

  it('should have valid types for each field', () => {
    for (const cat of USER_OVERRIDABLE_CATEGORIES) {
      for (const field of PREFERENCE_FIELDS[cat]) {
        expect(['number', 'boolean', 'array', 'string']).toContain(field.type)
        expect(field.key).toBeTruthy()
        expect(field.label).toBeTruthy()
        expect(field.description).toBeTruthy()
      }
    }
  })

  it('should have number fields with min/max constraints', () => {
    for (const cat of USER_OVERRIDABLE_CATEGORIES) {
      for (const field of PREFERENCE_FIELDS[cat]) {
        if (field.type === 'number') {
          expect(field.min).toBeDefined()
          expect(field.max).toBeDefined()
          expect(field.min!).toBeLessThan(field.max!)
        }
      }
    }
  })
})
