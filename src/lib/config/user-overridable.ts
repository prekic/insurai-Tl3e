/**
 * User-Overridable Settings
 *
 * Defines which admin settings can be overridden by individual users.
 * Only UI and email preferences are user-overridable — system settings
 * like AI models, rate limits, and OCR thresholds remain admin-only.
 */

// =============================================================================
// OVERRIDABLE CATEGORIES
// =============================================================================

/**
 * Categories that users can override with personal preferences.
 */
export const USER_OVERRIDABLE_CATEGORIES = ['ui', 'email'] as const
export type UserOverridableCategory = (typeof USER_OVERRIDABLE_CATEGORIES)[number]

/**
 * Check if a category allows user overrides.
 */
export function isUserOverridableCategory(category: string): category is UserOverridableCategory {
  return (USER_OVERRIDABLE_CATEGORIES as readonly string[]).includes(category)
}

// =============================================================================
// OVERRIDABLE KEYS PER CATEGORY
// =============================================================================

/**
 * Specific keys within each category that users can override.
 * Not all keys in a category may be user-overridable.
 */
export const USER_OVERRIDABLE_KEYS: Record<UserOverridableCategory, string[]> = {
  ui: [
    'display_currency',
    'toast_success_duration_ms',
    'toast_error_duration_ms',
    'toast_warning_duration_ms',
    'default_items_per_page',
    'collapsed_preview_items',
    'max_ai_insights_preview',
    'max_recommendations_preview',
  ],
  email: [
    'default_marketing_enabled',
    'default_reminders_enabled',
    'default_digest_enabled',
    'reminder_days',
    'urgency_threshold_days',
  ],
}

/**
 * Check if a specific key in a category is user-overridable.
 */
export function isUserOverridableKey(category: string, key: string): boolean {
  if (!isUserOverridableCategory(category)) return false
  return USER_OVERRIDABLE_KEYS[category].includes(key)
}

// =============================================================================
// PREFERENCE DISPLAY METADATA
// =============================================================================

export interface PreferenceFieldMeta {
  key: string
  label: string
  labelTr: string
  description: string
  descriptionTr: string
  type: 'number' | 'boolean' | 'array' | 'string'
  options?: Array<{ value: string; label: string; labelTr: string }>
  min?: number
  max?: number
}

/**
 * Display metadata for user-facing preferences UI.
 */
export const PREFERENCE_FIELDS: Record<UserOverridableCategory, PreferenceFieldMeta[]> = {
  ui: [
    {
      key: 'display_currency',
      label: 'Display currency',
      labelTr: 'Görüntüleme para birimi',
      description: 'Currency to display monetary values in',
      descriptionTr: 'Parasal değerlerin gösterileceği para birimi',
      type: 'string',
      options: [
        { value: 'TRY', label: 'Turkish Lira (₺)', labelTr: 'Türk Lirası (₺)' },
        { value: 'USD', label: 'US Dollar ($)', labelTr: 'Amerikan Doları ($)' },
        { value: 'EUR', label: 'Euro (€)', labelTr: 'Euro (€)' },
        { value: 'GBP', label: 'British Pound (£)', labelTr: 'İngiliz Sterlini (£)' },
        { value: 'CHF', label: 'Swiss Franc (CHF)', labelTr: 'İsviçre Frangı (CHF)' },
        { value: 'SAR', label: 'Saudi Riyal (SAR)', labelTr: 'Suudi Riyali (SAR)' },
        { value: 'AED', label: 'UAE Dirham (AED)', labelTr: 'BAE Dirhemi (AED)' },
        { value: 'JPY', label: 'Japanese Yen (JPY)', labelTr: 'Japon Yeni (JPY)' },
        { value: 'CAD', label: 'Canadian Dollar (CAD)', labelTr: 'Kanada Doları (CAD)' },
        { value: 'AUD', label: 'Australian Dollar (AUD)', labelTr: 'Avustralya Doları (AUD)' },
      ],
    },
    {
      key: 'default_items_per_page',
      label: 'Items per page',
      labelTr: 'Sayfa basina ogeler',
      description: 'Number of items to show per page in lists',
      descriptionTr: 'Listelerde sayfa basina gosterilecek oge sayisi',
      type: 'number',
      min: 5,
      max: 50,
    },
    {
      key: 'toast_success_duration_ms',
      label: 'Success notification duration',
      labelTr: 'Basari bildirimi suresi',
      description: 'How long success messages are shown (milliseconds)',
      descriptionTr: 'Basari mesajlarinin gosterilme suresi (milisaniye)',
      type: 'number',
      min: 1000,
      max: 10000,
    },
    {
      key: 'toast_error_duration_ms',
      label: 'Error notification duration',
      labelTr: 'Hata bildirimi suresi',
      description: 'How long error messages are shown (milliseconds)',
      descriptionTr: 'Hata mesajlarinin gosterilme suresi (milisaniye)',
      type: 'number',
      min: 2000,
      max: 15000,
    },
    {
      key: 'toast_warning_duration_ms',
      label: 'Warning notification duration',
      labelTr: 'Uyari bildirimi suresi',
      description: 'How long warning messages are shown (milliseconds)',
      descriptionTr: 'Uyari mesajlarinin gosterilme suresi (milisaniye)',
      type: 'number',
      min: 1000,
      max: 10000,
    },
    {
      key: 'collapsed_preview_items',
      label: 'Preview items when collapsed',
      labelTr: 'Daraltilmis onizleme sayisi',
      description: 'Number of items to show in collapsed sections',
      descriptionTr: 'Daraltilmis bolumlerde gosterilecek oge sayisi',
      type: 'number',
      min: 1,
      max: 10,
    },
    {
      key: 'max_ai_insights_preview',
      label: 'AI insights preview count',
      labelTr: 'AI icerik onizleme sayisi',
      description: 'Number of AI insights shown before "show more"',
      descriptionTr: '"Daha fazla goster" oncesi gosterilen AI icerik sayisi',
      type: 'number',
      min: 1,
      max: 10,
    },
    {
      key: 'max_recommendations_preview',
      label: 'Recommendations preview count',
      labelTr: 'Oneri onizleme sayisi',
      description: 'Number of recommendations shown before "show more"',
      descriptionTr: '"Daha fazla goster" oncesi gosterilen oneri sayisi',
      type: 'number',
      min: 1,
      max: 10,
    },
  ],
  email: [
    {
      key: 'default_marketing_enabled',
      label: 'Marketing emails',
      labelTr: 'Pazarlama e-postalari',
      description: 'Receive product updates and promotional emails',
      descriptionTr: 'Urun guncellemeleri ve promosyon e-postalari al',
      type: 'boolean',
    },
    {
      key: 'default_reminders_enabled',
      label: 'Policy reminders',
      labelTr: 'Police hatirlaticlari',
      description: 'Receive reminders before policy expiration',
      descriptionTr: 'Police suresi dolmadan once hatirlatici al',
      type: 'boolean',
    },
    {
      key: 'default_digest_enabled',
      label: 'Weekly digest',
      labelTr: 'Haftalik ozet',
      description: 'Receive a weekly summary of your policies',
      descriptionTr: 'Policelerinizin haftalik ozetini alin',
      type: 'boolean',
    },
    {
      key: 'reminder_days',
      label: 'Reminder schedule (days before expiry)',
      labelTr: 'Hatirlatma programi (son kullanma oncesi gun)',
      description: 'When to send reminders before policy expiration',
      descriptionTr: 'Police suresi dolmadan kac gun once hatirlatma gonderilecegi',
      type: 'array',
    },
    {
      key: 'urgency_threshold_days',
      label: 'Urgency threshold (days)',
      labelTr: 'Aciliyet esigi (gun)',
      description: 'Mark reminders as urgent when this many days remain',
      descriptionTr: 'Bu kadar gun kaldiginda hatirlaticlari acil olarak isaretle',
      type: 'number',
      min: 1,
      max: 30,
    },
  ],
}

// =============================================================================
// MERGE UTILITY
// =============================================================================

/**
 * Merge admin settings with user preferences.
 * User preferences take priority over admin settings for overridable keys.
 */
export function mergeWithUserPreferences<T extends object>(
  adminConfig: T,
  userPreferences: Record<string, unknown> | null,
  category: UserOverridableCategory,
  keyMap: Record<string, string>
): T {
  if (!userPreferences) return adminConfig

  const merged = { ...adminConfig }
  const overridableKeys = USER_OVERRIDABLE_KEYS[category]

  for (const [dbKey, tsKey] of Object.entries(keyMap)) {
    if (overridableKeys.includes(dbKey) && userPreferences[dbKey] !== undefined) {
      ;(merged as Record<string, unknown>)[tsKey] = userPreferences[dbKey]
    }
  }

  return merged
}

/**
 * Extract only the overridable keys from a full config for display.
 */
export function extractOverridableValues(
  config: Record<string, unknown>,
  category: UserOverridableCategory,
  keyMap: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const overridableKeys = USER_OVERRIDABLE_KEYS[category]

  // Reverse the keyMap: tsKey -> dbKey
  const reverseMap: Record<string, string> = {}
  for (const [dbKey, tsKey] of Object.entries(keyMap)) {
    reverseMap[tsKey] = dbKey
  }

  for (const [tsKey, value] of Object.entries(config)) {
    const dbKey = reverseMap[tsKey]
    if (dbKey && overridableKeys.includes(dbKey)) {
      result[dbKey] = value
    }
  }

  return result
}
