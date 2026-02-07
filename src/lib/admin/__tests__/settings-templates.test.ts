import { describe, it, expect } from 'vitest'
import {
  SETTINGS_TEMPLATES,
  getTemplate,
  computeTemplateDiff,
  getCategoryLabel,
  type SettingsTemplate,
} from '../settings-templates'

describe('SETTINGS_TEMPLATES', () => {
  it('should have 5 predefined templates', () => {
    expect(SETTINGS_TEMPLATES).toHaveLength(5)
  })

  it('should have unique IDs', () => {
    const ids = SETTINGS_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('should have required fields on every template', () => {
    for (const template of SETTINGS_TEMPLATES) {
      expect(template.id).toBeTruthy()
      expect(template.name).toBeTruthy()
      expect(template.description).toBeTruthy()
      expect(template.icon).toBeTruthy()
      expect(template.color).toBeTruthy()
      expect(template.tags.length).toBeGreaterThan(0)
      expect(template.overrides.length).toBeGreaterThan(0)
    }
  })

  it('should have valid categories in all overrides', () => {
    const validCategories = [
      'ai', 'evaluation', 'rate_limits', 'ocr',
      'fuzzy_matching', 'gap_analysis', 'ui', 'email',
    ]
    for (const template of SETTINGS_TEMPLATES) {
      for (const override of template.overrides) {
        expect(validCategories).toContain(override.category)
      }
    }
  })

  it('should include balanced template with default tag', () => {
    const balanced = SETTINGS_TEMPLATES.find((t) => t.id === 'balanced')
    expect(balanced).toBeDefined()
    expect(balanced!.tags).toContain('default')
  })
})

describe('getTemplate', () => {
  it('should return template by ID', () => {
    const template = getTemplate('high_performance')
    expect(template).toBeDefined()
    expect(template!.name).toBe('High Performance')
  })

  it('should return undefined for unknown ID', () => {
    expect(getTemplate('nonexistent')).toBeUndefined()
  })

  it('should return each known template', () => {
    const ids = ['balanced', 'high_performance', 'cost_optimized', 'strict_compliance', 'quick_demo']
    for (const id of ids) {
      expect(getTemplate(id)).toBeDefined()
    }
  })
})

describe('computeTemplateDiff', () => {
  const mockSettings: Record<string, Array<{ key: string; value: unknown }>> = {
    ai: [
      { key: 'max_tokens', value: 4096 },
      { key: 'temperature', value: 0.1 },
      { key: 'extraction_timeout_ms', value: 90000 },
      { key: 'enable_fallback', value: true },
      { key: 'consensus_enabled', value: true },
      { key: 'min_confidence', value: 0.7 },
      { key: 'consensus_agreement_threshold', value: 0.8 },
    ],
    rate_limits: [
      { key: 'ai_extraction_max_requests', value: 20 },
      { key: 'ocr_max_requests', value: 30 },
      { key: 'chat_max_requests', value: 60 },
    ],
    ocr: [
      { key: 'skip_ocr_threshold', value: 0.85 },
      { key: 'selective_ocr_threshold', value: 0.60 },
      { key: 'timeout_seconds', value: 30 },
    ],
    ui: [
      { key: 'extraction_progress_interval_ms', value: 10000 },
    ],
  }

  it('should detect changes when template differs from current', () => {
    const template = getTemplate('high_performance')!
    const diff = computeTemplateDiff(template, mockSettings)

    expect(diff.changes.length).toBeGreaterThan(0)
    // max_tokens: 4096 -> 8192
    const maxTokensChange = diff.changes.find((c) => c.key === 'max_tokens')
    expect(maxTokensChange).toBeDefined()
    expect(maxTokensChange!.currentValue).toBe(4096)
    expect(maxTokensChange!.newValue).toBe(8192)
  })

  it('should count unchanged settings', () => {
    const template = getTemplate('high_performance')!
    const diff = computeTemplateDiff(template, mockSettings)
    // Some settings match the template (e.g., enable_fallback: true, consensus_enabled: true)
    expect(diff.unchanged).toBeGreaterThanOrEqual(0)
    expect(diff.changes.length + diff.unchanged).toBe(template.overrides.length)
  })

  it('should detect no changes when settings already match', () => {
    // Create a mock where all settings match the template
    const template: SettingsTemplate = {
      id: 'test',
      name: 'Test',
      description: 'Test',
      icon: 'Rocket',
      color: 'blue',
      tags: ['test'],
      overrides: [
        { category: 'ai', key: 'max_tokens', value: 4096 },
        { category: 'ai', key: 'temperature', value: 0.1 },
      ],
    }

    const diff = computeTemplateDiff(template, mockSettings)
    expect(diff.changes).toHaveLength(0)
    expect(diff.unchanged).toBe(2)
  })

  it('should handle missing categories gracefully', () => {
    const template: SettingsTemplate = {
      id: 'test',
      name: 'Test',
      description: 'Test',
      icon: 'Rocket',
      color: 'blue',
      tags: ['test'],
      overrides: [
        { category: 'nonexistent_category', key: 'some_key', value: 42 },
      ],
    }

    const diff = computeTemplateDiff(template, mockSettings)
    // Missing category means current value is undefined, so it should be a change
    expect(diff.changes).toHaveLength(1)
    expect(diff.changes[0].currentValue).toBeUndefined()
  })

  it('should handle string numbers matching numeric values', () => {
    const settingsWithStrings: Record<string, Array<{ key: string; value: unknown }>> = {
      ai: [{ key: 'max_tokens', value: '4096' }], // Stored as string
    }

    const template: SettingsTemplate = {
      id: 'test',
      name: 'Test',
      description: 'Test',
      icon: 'Rocket',
      color: 'blue',
      tags: ['test'],
      overrides: [
        { category: 'ai', key: 'max_tokens', value: 4096 }, // Number
      ],
    }

    const diff = computeTemplateDiff(template, settingsWithStrings)
    // Should recognize that '4096' (string) matches 4096 (number)
    expect(diff.changes).toHaveLength(0)
    expect(diff.unchanged).toBe(1)
  })

  it('should include all fields in each change', () => {
    const template = getTemplate('cost_optimized')!
    const diff = computeTemplateDiff(template, mockSettings)

    for (const change of diff.changes) {
      expect(change).toHaveProperty('category')
      expect(change).toHaveProperty('key')
      expect(change).toHaveProperty('currentValue')
      expect(change).toHaveProperty('newValue')
    }
  })
})

describe('getCategoryLabel', () => {
  it('should return display names for known categories', () => {
    expect(getCategoryLabel('ai')).toBe('AI')
    expect(getCategoryLabel('evaluation')).toBe('Evaluation')
    expect(getCategoryLabel('rate_limits')).toBe('Rate Limits')
    expect(getCategoryLabel('ocr')).toBe('OCR')
    expect(getCategoryLabel('fuzzy_matching')).toBe('Fuzzy Matching')
    expect(getCategoryLabel('gap_analysis')).toBe('Gap Analysis')
    expect(getCategoryLabel('ui')).toBe('UI')
    expect(getCategoryLabel('email')).toBe('Email')
  })

  it('should return raw key for unknown categories', () => {
    expect(getCategoryLabel('unknown')).toBe('unknown')
  })
})
