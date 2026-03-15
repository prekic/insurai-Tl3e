/**
 * Prompt Service Branch Coverage Tests
 *
 * Comprehensive tests targeting all 88 branches in server/services/prompt-service.ts,
 * focusing on the 35 previously uncovered branches.
 *
 * Uses thenable mock pattern for Supabase query chains.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Thenable Supabase mock
// ---------------------------------------------------------------------------

let mockResult: { data: unknown; error: unknown } = { data: null, error: null }

function createThenable() {
  const thenable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi
      .fn()
      .mockImplementation((cb: (val: unknown) => unknown) => Promise.resolve(cb(mockResult))),
  }
  return thenable
}

/**
 * Creates a thenable that synchronously throws when .then() is called,
 * triggering the try/catch branch in the source code.
 */
function createThrowingThenable(error: unknown) {
  const thenable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi
      .fn()
      .mockImplementation((_onFulfilled: unknown, onRejected?: (err: unknown) => void) => {
        // Call the reject callback to properly signal rejection to await
        if (onRejected) {
          onRejected(error)
          return
        }
        throw error
      }),
  }
  return thenable
}

const mockFrom = vi.fn(() => createThenable())

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Set env vars before importing so getClient() can initialise
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Import after mocks
import {
  getPromptById,
  getPromptByName,
  getPromptsByCategory,
  getAllPrompts,
  getRenderedPrompt,
  getExtractionPrompt,
  getChatPrompt,
  getOCRPrompt,
  getTypeDetectionPrompt,
  renderTemplate,
  clearPromptCache,
  updatePrompt,
  createPrompt,
} from '../services/prompt-service.js'

// Helper: set mock result for next DB query
function setMock(data: unknown, error: unknown = null) {
  mockResult = { data, error }
}

// Helper: a realistic DB row for prompt_templates
function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db-prompt-1',
    name: 'DB Prompt',
    description: 'A database prompt',
    category: 'extraction',
    system_prompt: 'System prompt from DB',
    user_prompt_template: 'User prompt {{document_text}}',
    variables: ['document_text'],
    is_active: true,
    version: 3,
    default_provider: 'openai',
    default_model: 'gpt-4o',
    parameters: { temperature: 0.2 },
    ...overrides,
  }
}

describe('Prompt Service — Branch Coverage', () => {
  beforeEach(() => {
    // Clear call counts but preserve mock implementation
    vi.clearAllMocks()
    // Restore mockFrom implementation after clearAllMocks wipes it
    mockFrom.mockImplementation(() => createThenable())
    clearPromptCache()
    mockResult = { data: null, error: null }
  })

  afterEach(() => {
    clearPromptCache()
  })

  // ==========================================================================
  // CACHE BRANCHES
  // ==========================================================================

  describe('Cache hit / miss / expiry branches', () => {
    it('should return cached prompt on second call (cache hit branch)', async () => {
      setMock(dbRow({ id: 'cache-test-1', name: 'Cache Test' }))
      const first = await getPromptById('cache-test-1')
      expect(first?.id).toBe('cache-test-1')

      // Second call: should return from cache without hitting DB
      mockFrom.mockClear()
      mockFrom.mockImplementation(() => createThenable())
      const second = await getPromptById('cache-test-1')
      expect(second?.id).toBe('cache-test-1')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('should return cached prompt for getPromptByName (cache hit branch)', async () => {
      setMock(dbRow({ id: 'cache-name-1', name: 'Named Cache Test' }))
      const first = await getPromptByName('Named Cache Test')
      expect(first?.name).toBe('Named Cache Test')

      mockFrom.mockClear()
      mockFrom.mockImplementation(() => createThenable())
      const second = await getPromptByName('Named Cache Test')
      expect(second?.name).toBe('Named Cache Test')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('should evict expired cache entries (TTL expiry branch)', async () => {
      setMock(dbRow({ id: 'expiry-test', name: 'Expiry Test' }))
      await getPromptById('expiry-test')

      // Advance time past TTL (5 minutes)
      const realDateNow = Date.now
      Date.now = () => realDateNow() + 6 * 60 * 1000

      try {
        setMock(dbRow({ id: 'expiry-test', name: 'Refreshed' }))
        const refreshed = await getPromptById('expiry-test')
        expect(refreshed?.name).toBe('Refreshed')
        expect(mockFrom).toHaveBeenCalled()
      } finally {
        Date.now = realDateNow
      }
    })

    it('should return null from cache when entry does not exist (cache miss)', async () => {
      setMock(null, { message: 'Not found' })
      const result = await getPromptById('completely-unknown-id')
      expect(result).toBeNull()
    })
  })

  // ==========================================================================
  // getPromptById BRANCHES
  // ==========================================================================

  describe('getPromptById', () => {
    it('should return DB prompt when data exists and no error (success branch)', async () => {
      setMock(dbRow({ id: 'byid-success' }))
      const result = await getPromptById('byid-success')
      expect(result?.id).toBe('byid-success')
      expect(result?.systemPrompt).toBe('System prompt from DB')
    })

    it('should skip DB result when error returned, and find fallback by id', async () => {
      setMock(null, { message: 'DB error' })
      const result = await getPromptById('fallback-chat-assistant')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('fallback-chat-assistant')
      expect(result?.name).toBe('Policy Chat Assistant')
    })

    it('should find fallback OCR prompt by id', async () => {
      setMock(null, { message: 'DB error' })
      const result = await getPromptById('fallback-ocr-correction')
      expect(result?.id).toBe('fallback-ocr-correction')
    })

    it('should find fallback type detection by id', async () => {
      setMock(null, { message: 'DB error' })
      const result = await getPromptById('fallback-type-detection')
      expect(result?.id).toBe('fallback-type-detection')
    })

    it('should return null when DB has error and no fallback matches id', async () => {
      setMock(null, { message: 'Not found' })
      const result = await getPromptById('no-such-fallback-id')
      expect(result).toBeNull()
    })

    it('should handle DB exception (catch branch with Error) and fallback', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(new Error('Connection refused')))

      const result = await getPromptById('fallback-extraction-master')
      expect(result).not.toBeNull()
      expect(result?.name).toBe('Policy Extraction - Master')
    })

    it('should handle DB exception with non-Error object (String(err) branch)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable('string error'))

      const result = await getPromptById('fallback-extraction-master')
      expect(result).not.toBeNull()
      expect(result?.name).toBe('Policy Extraction - Master')
    })

    it('should handle DB returning data WITH error (error takes precedence)', async () => {
      setMock({ id: 'should-be-ignored' }, { message: 'Partial error' })
      const result = await getPromptById('fallback-extraction-master')
      expect(result?.id).toBe('fallback-extraction-master')
    })

    it('should handle DB returning null data without error (no match)', async () => {
      setMock(null, null)
      const result = await getPromptById('some-id-not-in-fallbacks')
      expect(result).toBeNull()
    })
  })

  // ==========================================================================
  // getPromptByName BRANCHES
  // ==========================================================================

  describe('getPromptByName', () => {
    it('should return DB prompt on success (no error, has data)', async () => {
      setMock(dbRow({ name: 'My Named Prompt' }))
      const result = await getPromptByName('My Named Prompt')
      expect(result?.name).toBe('My Named Prompt')
    })

    it('should cache result from DB and return on second call', async () => {
      setMock(dbRow({ name: 'Cached Name' }))
      await getPromptByName('Cached Name')
      mockFrom.mockClear()
      mockFrom.mockImplementation(() => createThenable())

      const cached = await getPromptByName('Cached Name')
      expect(cached?.name).toBe('Cached Name')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('should fall back to hardcoded prompt when DB has error', async () => {
      setMock(null, { message: 'DB error' })
      const result = await getPromptByName('Policy Chat Assistant')
      expect(result?.id).toBe('fallback-chat-assistant')
    })

    it('should fall back to OCR correction fallback', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptByName('OCR Correction - Lightweight')
      expect(result?.id).toBe('fallback-ocr-correction')
    })

    it('should fall back to Policy Type Detection fallback', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptByName('Policy Type Detection')
      expect(result?.id).toBe('fallback-type-detection')
    })

    it('should return null when DB fails and name not in fallbacks', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptByName('Nonexistent Prompt Name')
      expect(result).toBeNull()
    })

    it('should handle DB exception (catch branch with Error)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(new Error('Timeout')))

      const result = await getPromptByName('Policy Extraction - Master')
      expect(result?.id).toBe('fallback-extraction-master')
    })

    it('should handle DB exception with non-Error object', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(42))

      const result = await getPromptByName('Policy Extraction - Master')
      expect(result?.id).toBe('fallback-extraction-master')
    })

    it('should handle DB returning null data without error', async () => {
      setMock(null, null)
      const result = await getPromptByName('Not In Fallbacks')
      expect(result).toBeNull()
    })
  })

  // ==========================================================================
  // getPromptsByCategory BRANCHES
  // ==========================================================================

  describe('getPromptsByCategory', () => {
    it('should return DB results when available (success branch)', async () => {
      const rows = [
        dbRow({ id: 'cat-1', name: 'Extraction 1', category: 'extraction' }),
        dbRow({ id: 'cat-2', name: 'Extraction 2', category: 'extraction' }),
      ]
      setMock(rows)

      const result = await getPromptsByCategory('extraction')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('cat-1')
      expect(result[1].id).toBe('cat-2')
    })

    it('should return fallback prompts when DB has error', async () => {
      setMock(null, { message: 'DB error' })
      const result = await getPromptsByCategory('chat')
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((p) => p.category === 'chat')).toBe(true)
    })

    it('should return fallback prompts for ocr category', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptsByCategory('ocr')
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((p) => p.category === 'ocr')).toBe(true)
    })

    it('should return empty array for category with no fallbacks', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptsByCategory('unknown_category')
      expect(result).toEqual([])
    })

    it('should return empty array for other category with no fallbacks', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptsByCategory('other')
      expect(result).toEqual([])
    })

    it('should handle DB exception (catch branch with Error)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(new Error('Connection lost')))

      const result = await getPromptsByCategory('extraction')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle DB exception with non-Error object', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable({ code: 'ECONNREFUSED' }))

      const result = await getPromptsByCategory('extraction')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return fallback extraction prompts including master and type detection', async () => {
      setMock(null, { message: 'error' })
      const result = await getPromptsByCategory('extraction')
      const names = result.map((p) => p.name)
      expect(names).toContain('Policy Extraction - Master')
      expect(names).toContain('Policy Type Detection')
    })

    it('should handle DB returning null data with no error (falsy data)', async () => {
      setMock(null, null)
      const result = await getPromptsByCategory('extraction')
      // null data => condition !error && data fails => fallback
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return empty array from DB when DB returns empty array', async () => {
      setMock([])
      const result = await getPromptsByCategory('extraction')
      // [] is truthy, so data.map runs => returns []
      expect(result).toEqual([])
    })
  })

  // ==========================================================================
  // getAllPrompts BRANCHES
  // ==========================================================================

  describe('getAllPrompts', () => {
    it('should return DB results when available (success branch)', async () => {
      const rows = [
        dbRow({ id: 'all-1', category: 'extraction' }),
        dbRow({ id: 'all-2', category: 'chat' }),
        dbRow({ id: 'all-3', category: 'ocr' }),
      ]
      setMock(rows)

      const result = await getAllPrompts()
      expect(result).toHaveLength(3)
    })

    it('should return all 5 fallback prompts when DB errors', async () => {
      setMock(null, { message: 'error' })
      const result = await getAllPrompts()
      expect(result).toHaveLength(5)
    })

    it('should handle DB exception (catch branch with Error)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(new Error('Fatal')))

      const result = await getAllPrompts()
      expect(result).toHaveLength(5)
    })

    it('should handle DB exception with non-Error object', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable('string rejection'))

      const result = await getAllPrompts()
      expect(result).toHaveLength(5)
    })

    it('should return fallback when DB returns null data with no error', async () => {
      setMock(null, null)
      const result = await getAllPrompts()
      expect(result).toHaveLength(5)
    })

    it('should return empty array from DB when DB returns empty array', async () => {
      setMock([])
      const result = await getAllPrompts()
      expect(result).toEqual([])
    })
  })

  // ==========================================================================
  // renderTemplate BRANCHES
  // ==========================================================================

  describe('renderTemplate', () => {
    it('should include conditional block content when variable is truthy', () => {
      const result = renderTemplate('{{#if name}}Hello {{name}}!{{/if}}', { name: 'World' })
      expect(result).toBe('Hello World!')
    })

    it('should remove conditional block when variable is falsy (undefined)', () => {
      const result = renderTemplate('Start {{#if ctx}}Hidden{{/if}} End', { ctx: undefined })
      expect(result).toBe('Start  End')
    })

    it('should remove conditional block when variable is missing entirely', () => {
      const result = renderTemplate('A{{#if missing}}B{{/if}}C', {})
      expect(result).toBe('AC')
    })

    it('should remove conditional block when variable is empty string', () => {
      const result = renderTemplate('A{{#if empty}}B{{/if}}C', { empty: '' })
      expect(result).toBe('AC')
    })

    it('should replace variable with empty string when undefined', () => {
      const result = renderTemplate('Value: {{x}}', { x: undefined })
      expect(result).toBe('Value:')
    })

    it('should replace variable with empty string when not provided', () => {
      const result = renderTemplate('Value: {{missing}}', {})
      expect(result).toBe('Value:')
    })

    it('should handle multiple conditional blocks and variables', () => {
      const template = '{{#if a}}A:{{a}}{{/if}} {{#if b}}B:{{b}}{{/if}} {{c}}'
      const result = renderTemplate(template, { a: 'alpha', c: 'charlie' })
      expect(result).toBe('A:alpha  charlie')
    })

    it('should handle nested variable inside conditional', () => {
      const template = '{{#if policy_context}}Context: {{policy_context}}{{/if}}'
      const result = renderTemplate(template, { policy_context: 'Kasko #123' })
      expect(result).toContain('Context: Kasko #123')
    })

    it('should preserve text outside conditionals when var is falsy', () => {
      const template = 'Before {{#if x}}HIDDEN{{/if}} After'
      const result = renderTemplate(template, {})
      expect(result).toBe('Before  After')
    })

    it('should handle empty template', () => {
      expect(renderTemplate('', {})).toBe('')
    })

    it('should trim whitespace from both sides', () => {
      expect(renderTemplate('   hello   ', {})).toBe('hello')
    })

    it('should handle template with no variables at all', () => {
      expect(renderTemplate('Static text only', {})).toBe('Static text only')
    })

    it('should handle template with only whitespace', () => {
      expect(renderTemplate('   \n\t  ', {})).toBe('')
    })

    it('should handle sequential conditionals', () => {
      const template = '{{#if a}}A{{/if}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}'
      expect(renderTemplate(template, { a: '1', c: '3' })).toBe('AC')
      expect(renderTemplate(template, { b: '2' })).toBe('B')
      expect(renderTemplate(template, {})).toBe('')
      expect(renderTemplate(template, { a: '1', b: '2', c: '3' })).toBe('ABC')
    })
  })

  // ==========================================================================
  // getRenderedPrompt BRANCHES
  // ==========================================================================

  describe('getRenderedPrompt', () => {
    it('should return rendered prompt when template found (success)', async () => {
      setMock(
        dbRow({
          id: 'render-1',
          name: 'Render Test',
          system_prompt: 'Sys {{doc}}',
          user_prompt_template: 'User {{doc}}',
          version: 2,
          default_provider: 'anthropic',
          default_model: 'claude-3',
          parameters: { temperature: 0.3 },
        })
      )

      const rendered = await getRenderedPrompt('Render Test', { doc: 'my-doc' })
      expect(rendered).not.toBeNull()
      expect(rendered!.systemPrompt).toBe('Sys my-doc')
      expect(rendered!.userPrompt).toBe('User my-doc')
      expect(rendered!.templateId).toBe('render-1')
      expect(rendered!.templateName).toBe('Render Test')
      expect(rendered!.version).toBe(2)
      expect(rendered!.provider).toBe('anthropic')
      expect(rendered!.model).toBe('claude-3')
      expect(rendered!.parameters).toEqual({ temperature: 0.3 })
    })

    it('should return null when template not found (null branch)', async () => {
      setMock(null, { message: 'error' })
      const result = await getRenderedPrompt('Nonexistent Name', {})
      expect(result).toBeNull()
    })

    it('should render fallback template with variables', async () => {
      setMock(null, { message: 'error' })
      const rendered = await getRenderedPrompt('Policy Chat Assistant', {
        user_message: 'What coverage?',
        policy_context: 'Kasko for Toyota',
      })
      expect(rendered).not.toBeNull()
      expect(rendered!.userPrompt).toContain('What coverage?')
      expect(rendered!.systemPrompt).toContain('Kasko for Toyota')
      expect(rendered!.templateId).toBe('fallback-chat-assistant')
    })

    it('should render without optional fields (no provider, model, parameters)', async () => {
      setMock(
        dbRow({
          name: 'No Extras',
          default_provider: undefined,
          default_model: undefined,
          parameters: undefined,
        })
      )

      const rendered = await getRenderedPrompt('No Extras', {})
      expect(rendered).not.toBeNull()
      expect(rendered!.provider).toBeUndefined()
      expect(rendered!.model).toBeUndefined()
      expect(rendered!.parameters).toBeUndefined()
    })
  })

  // ==========================================================================
  // getExtractionPrompt BRANCHES
  // ==========================================================================

  describe('getExtractionPrompt', () => {
    it('should use type-specific prompt when policyType provided and DB has it', async () => {
      // Mock DB to return a type-specific prompt for the name lookup
      setMock(
        dbRow({
          id: 'kasko-ext',
          name: 'Kasko Extraction',
          system_prompt: 'Kasko specific {{document_text}}',
          user_prompt_template: '{{document_text}}',
        })
      )

      const result = await getExtractionPrompt('Doc text', 'kasko')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('Kasko Extraction')
    })

    it('should fall back to master when type-specific not found', async () => {
      setMock(null, { message: 'not found' })
      const result = await getExtractionPrompt('Doc text', 'health')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('Policy Extraction - Master')
    })

    it('should use master prompt when no policyType provided', async () => {
      setMock(null, { message: 'error' })
      const result = await getExtractionPrompt('Doc text')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('Policy Extraction - Master')
      expect(result!.userPrompt).toContain('Doc text')
    })

    it('should use master for unknown policy type', async () => {
      setMock(null, { message: 'error' })
      const result = await getExtractionPrompt('Doc', 'unknowntype')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('Policy Extraction - Master')
    })

    it('should handle all known policy types via getTypeSpecificPromptName', async () => {
      const types = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat']

      for (const type of types) {
        clearPromptCache()
        // DB fails so type-specific not found => falls to master fallback
        setMock(null, { message: 'error' })
        const result = await getExtractionPrompt('Text', type)
        expect(result).not.toBeNull()
        expect(result!.templateName).toBe('Policy Extraction - Master')
      }
    })

    it('should handle uppercase policy type via toLowerCase()', async () => {
      setMock(null, { message: 'error' })
      const result = await getExtractionPrompt('Doc', 'KASKO')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('Policy Extraction - Master')
    })
  })

  // ==========================================================================
  // getChatPrompt BRANCHES
  // ==========================================================================

  describe('getChatPrompt', () => {
    it('should render with policy context (conditional truthy)', async () => {
      setMock(null, { message: 'error' })
      const result = await getChatPrompt('Question?', 'My Kasko policy')
      expect(result).not.toBeNull()
      expect(result!.systemPrompt).toContain('My Kasko policy')
      expect(result!.userPrompt).toContain('Question?')
    })

    it('should render without policy context (conditional falsy)', async () => {
      setMock(null, { message: 'error' })
      const result = await getChatPrompt('General question')
      expect(result).not.toBeNull()
      expect(result!.systemPrompt).not.toContain('Policy Information:')
      expect(result!.userPrompt).toContain('General question')
    })

    it('should render with undefined policy context', async () => {
      setMock(null, { message: 'error' })
      const result = await getChatPrompt('Hi', undefined)
      expect(result).not.toBeNull()
      expect(result!.userPrompt).toContain('Hi')
    })
  })

  // ==========================================================================
  // getOCRPrompt BRANCHES
  // ==========================================================================

  describe('getOCRPrompt', () => {
    it('should render OCR prompt with raw text', async () => {
      setMock(null, { message: 'error' })
      const result = await getOCRPrompt('B İ RLE Şİ K')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('OCR Correction - Lightweight')
      expect(result!.userPrompt).toContain('B İ RLE Şİ K')
    })
  })

  // ==========================================================================
  // getTypeDetectionPrompt BRANCHES
  // ==========================================================================

  describe('getTypeDetectionPrompt', () => {
    it('should render type detection prompt with document text', async () => {
      setMock(null, { message: 'error' })
      const result = await getTypeDetectionPrompt('Kasko Poliçesi document text')
      expect(result).not.toBeNull()
      expect(result!.templateName).toBe('Policy Type Detection')
      expect(result!.userPrompt).toContain('Kasko Poliçesi document text')
    })
  })

  // ==========================================================================
  // mapFromDatabase BRANCHES
  // ==========================================================================

  describe('mapFromDatabase branches (via getPromptById)', () => {
    it('should handle missing description (empty string fallback)', async () => {
      setMock(dbRow({ description: null }))
      const result = await getPromptById('map-test-1')
      expect(result?.description).toBe('')
    })

    it('should handle empty description string', async () => {
      setMock(dbRow({ description: '' }))
      const result = await getPromptById('map-test-2')
      expect(result?.description).toBe('')
    })

    it('should handle missing variables (empty array fallback)', async () => {
      setMock(dbRow({ variables: null }))
      const result = await getPromptById('map-test-3')
      expect(result?.variables).toEqual([])
    })

    it('should handle undefined variables (empty array fallback)', async () => {
      setMock(dbRow({ variables: undefined }))
      const result = await getPromptById('map-test-4')
      expect(result?.variables).toEqual([])
    })

    it('should handle missing version (default 1 fallback)', async () => {
      setMock(dbRow({ version: null }))
      const result = await getPromptById('map-test-5')
      expect(result?.version).toBe(1)
    })

    it('should handle version 0 (falsy, defaults to 1)', async () => {
      setMock(dbRow({ version: 0 }))
      const result = await getPromptById('map-test-6')
      expect(result?.version).toBe(1)
    })

    it('should preserve provided version number', async () => {
      setMock(dbRow({ version: 42 }))
      const result = await getPromptById('map-test-7')
      expect(result?.version).toBe(42)
    })

    it('should handle missing defaultProvider and defaultModel', async () => {
      setMock(dbRow({ default_provider: undefined, default_model: undefined }))
      const result = await getPromptById('map-test-8')
      expect(result?.defaultProvider).toBeUndefined()
      expect(result?.defaultModel).toBeUndefined()
    })

    it('should handle missing parameters', async () => {
      setMock(dbRow({ parameters: undefined }))
      const result = await getPromptById('map-test-9')
      expect(result?.parameters).toBeUndefined()
    })

    it('should map all fields correctly from DB row', async () => {
      setMock(
        dbRow({
          id: 'full-map',
          name: 'Full Map Test',
          description: 'Full description',
          category: 'chat',
          system_prompt: 'System here',
          user_prompt_template: 'User {{x}}',
          variables: ['x', 'y'],
          is_active: false,
          version: 5,
          default_provider: 'anthropic',
          default_model: 'claude-3',
          parameters: { maxTokens: 1000 },
        })
      )

      const result = await getPromptById('full-map')
      expect(result).toEqual({
        id: 'full-map',
        name: 'Full Map Test',
        description: 'Full description',
        category: 'chat',
        systemPrompt: 'System here',
        userPromptTemplate: 'User {{x}}',
        variables: ['x', 'y'],
        isActive: false,
        version: 5,
        defaultProvider: 'anthropic',
        defaultModel: 'claude-3',
        parameters: { maxTokens: 1000 },
      })
    })
  })

  // ==========================================================================
  // updatePrompt BRANCHES
  // ==========================================================================

  describe('updatePrompt', () => {
    it('should handle current version null (newVersion = 0+1 = 1)', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            // Get current version => null
            return Promise.resolve(cb({ data: null, error: null }))
          } else if (callCount === 2) {
            return Promise.resolve(
              cb({
                data: dbRow({ id: 'upd-1', version: 1 }),
                error: null,
              })
            )
          } else {
            return Promise.resolve(cb({ data: null, error: null }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-1', { systemPrompt: 'New system' })
      expect(result).not.toBeNull()
    })

    it('should increment version from current when found', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(cb({ data: { version: 3 }, error: null }))
          } else if (callCount === 2) {
            return Promise.resolve(
              cb({
                data: dbRow({ id: 'upd-2', version: 4 }),
                error: null,
              })
            )
          } else {
            return Promise.resolve(cb({ data: null, error: null }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-2', { systemPrompt: 'Updated' })
      expect(result).not.toBeNull()
    })

    it('should return null when update returns error', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(cb({ data: { version: 1 }, error: null }))
          } else {
            return Promise.resolve(cb({ data: null, error: { message: 'Update failed' } }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-3', { name: 'New Name' })
      expect(result).toBeNull()
    })

    it('should NOT create version record when only name changes', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(cb({ data: { version: 1 }, error: null }))
          } else {
            return Promise.resolve(
              cb({
                data: dbRow({ id: 'upd-4', version: 2 }),
                error: null,
              })
            )
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-4', { name: 'Just Name Change' })
      expect(result).not.toBeNull()
      // Only 2 calls: get-version + update (no version record insert)
      expect(callCount).toBe(2)
    })

    it('should create version record when userPromptTemplate changes', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(cb({ data: { version: 2 }, error: null }))
          } else if (callCount === 2) {
            return Promise.resolve(
              cb({
                data: dbRow({
                  id: 'upd-5',
                  version: 3,
                  system_prompt: 'Original',
                  user_prompt_template: 'New user template',
                  variables: ['x'],
                }),
                error: null,
              })
            )
          } else {
            return Promise.resolve(cb({ data: null, error: null }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-5', { userPromptTemplate: 'New user template' })
      expect(result).not.toBeNull()
      expect(callCount).toBe(3) // get-version + update + insert-version
    })

    it('should create version record when systemPrompt changes', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(cb({ data: { version: 5 }, error: null }))
          } else if (callCount === 2) {
            return Promise.resolve(
              cb({
                data: dbRow({ id: 'upd-8', version: 6 }),
                error: null,
              })
            )
          } else {
            return Promise.resolve(cb({ data: null, error: null }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-8', { systemPrompt: 'Brand new system' })
      expect(result).not.toBeNull()
      expect(callCount).toBe(3)
    })

    it('should handle exception during update (catch branch with Error)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(new Error('Network timeout')))

      const result = await updatePrompt('upd-6', { name: 'Fail' })
      expect(result).toBeNull()
    })

    it('should handle non-Error exception in update (String(err) branch)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable('non-error string'))

      const result = await updatePrompt('upd-7', { name: 'Fail2' })
      expect(result).toBeNull()
    })

    it('should update with isActive and parameters', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(cb({ data: { version: 1 }, error: null }))
          } else {
            return Promise.resolve(
              cb({
                data: dbRow({ id: 'upd-9', version: 2, is_active: false }),
                error: null,
              })
            )
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await updatePrompt('upd-9', {
        isActive: false,
        parameters: { temperature: 0.5 },
        description: 'Updated description',
      })
      expect(result).not.toBeNull()
    })
  })

  // ==========================================================================
  // createPrompt BRANCHES
  // ==========================================================================

  describe('createPrompt', () => {
    it('should create prompt successfully (success branch)', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(
              cb({
                data: dbRow({
                  id: 'new-1',
                  name: 'New Prompt',
                  category: 'chat',
                  version: 1,
                  default_provider: 'openai',
                  default_model: 'gpt-4o',
                }),
                error: null,
              })
            )
          } else {
            return Promise.resolve(cb({ data: null, error: null }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await createPrompt({
        name: 'New Prompt',
        description: 'Created',
        category: 'chat',
        systemPrompt: 'System',
        userPromptTemplate: 'User {{msg}}',
        variables: ['msg'],
        isActive: true,
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
      })

      expect(result).not.toBeNull()
      expect(result!.id).toBe('new-1')
      expect(callCount).toBe(2) // insert template + insert version
    })

    it('should return null when insert returns error (error branch)', async () => {
      setMock(null, { message: 'Insert failed' })

      const result = await createPrompt({
        name: 'Fail Create',
        description: '',
        category: 'other',
        systemPrompt: 'Sys',
        userPromptTemplate: 'Usr',
        variables: [],
        isActive: true,
      })
      expect(result).toBeNull()
    })

    it('should handle exception during create (catch branch with Error)', async () => {
      mockFrom.mockImplementation(() =>
        createThrowingThenable(new Error('Database connection lost'))
      )

      const result = await createPrompt({
        name: 'Exception Create',
        description: '',
        category: 'other',
        systemPrompt: 'Sys',
        userPromptTemplate: 'Usr',
        variables: [],
        isActive: true,
      })
      expect(result).toBeNull()
    })

    it('should handle non-Error exception in create (String(err) branch)', async () => {
      mockFrom.mockImplementation(() => createThrowingThenable(12345))

      const result = await createPrompt({
        name: 'Non-Error Create',
        description: '',
        category: 'other',
        systemPrompt: 'Sys',
        userPromptTemplate: 'Usr',
        variables: [],
        isActive: true,
      })
      expect(result).toBeNull()
    })

    it('should create prompt with all optional fields', async () => {
      let callCount = 0

      const thenable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: (val: unknown) => unknown) => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve(
              cb({
                data: dbRow({
                  id: 'new-full',
                  name: 'Full Create',
                  default_provider: 'anthropic',
                  default_model: 'claude-3-5-haiku',
                  parameters: { maxTokens: 2048 },
                }),
                error: null,
              })
            )
          } else {
            return Promise.resolve(cb({ data: null, error: null }))
          }
        }),
      }
      mockFrom.mockImplementation(() => thenable as ReturnType<typeof createThenable>)

      const result = await createPrompt({
        name: 'Full Create',
        description: 'Full desc',
        category: 'extraction',
        systemPrompt: 'Sys {{a}}',
        userPromptTemplate: 'Usr {{b}}',
        variables: ['a', 'b'],
        isActive: true,
        defaultProvider: 'anthropic',
        defaultModel: 'claude-3-5-haiku',
        parameters: { maxTokens: 2048 },
      })

      expect(result).not.toBeNull()
      expect(result!.defaultProvider).toBe('anthropic')
      expect(result!.defaultModel).toBe('claude-3-5-haiku')
    })
  })

  // ==========================================================================
  // clearPromptCache
  // ==========================================================================

  describe('clearPromptCache', () => {
    it('should clear the cache so subsequent calls hit DB', async () => {
      setMock(dbRow({ id: 'clear-test', name: 'Before Clear' }))
      await getPromptById('clear-test')

      // Verify cache hit — clear call counts but keep implementation
      mockFrom.mockClear()
      mockFrom.mockImplementation(() => createThenable())
      await getPromptById('clear-test')
      expect(mockFrom).not.toHaveBeenCalled()

      // Clear cache
      clearPromptCache()

      // Next call should hit DB
      setMock(dbRow({ id: 'clear-test', name: 'After Clear' }))
      const result = await getPromptById('clear-test')
      expect(mockFrom).toHaveBeenCalled()
      expect(result?.name).toBe('After Clear')
    })
  })

  // ==========================================================================
  // FALLBACK PROMPT CONTENT VERIFICATION
  // ==========================================================================

  describe('Fallback prompt content branches', () => {
    it('master extraction fallback has expected fields', async () => {
      setMock(null, { message: 'err' })
      const p = await getPromptByName('Policy Extraction - Master')
      expect(p!.id).toBe('fallback-extraction-master')
      expect(p!.category).toBe('extraction')
      expect(p!.isActive).toBe(true)
      expect(p!.version).toBe(1)
      expect(p!.variables).toContain('document_text')
      expect(p!.defaultProvider).toBe('openai')
      expect(p!.defaultModel).toBe('gpt-4o')
      expect(p!.parameters).toEqual({ temperature: 0.1, maxTokens: 4096 })
      expect(p!.systemPrompt).toContain('insurance document analyst')
      expect(p!.userPromptTemplate).toContain('{{document_text}}')
    })

    it('chat assistant fallback has expected fields', async () => {
      setMock(null, { message: 'err' })
      const p = await getPromptByName('Policy Chat Assistant')
      expect(p!.id).toBe('fallback-chat-assistant')
      expect(p!.category).toBe('chat')
      expect(p!.variables).toContain('policy_context')
      expect(p!.variables).toContain('user_message')
      expect(p!.defaultModel).toBe('gpt-4o-mini')
      expect(p!.parameters).toEqual({ temperature: 0.5, maxTokens: 2048 })
      expect(p!.systemPrompt).toContain('{{#if policy_context}}')
    })

    it('OCR correction fallback has expected fields', async () => {
      setMock(null, { message: 'err' })
      const p = await getPromptByName('OCR Correction - Lightweight')
      expect(p!.id).toBe('fallback-ocr-correction')
      expect(p!.category).toBe('ocr')
      expect(p!.variables).toContain('raw_text')
      expect(p!.defaultModel).toBe('gpt-4o-mini')
    })

    it('type detection fallback has expected fields', async () => {
      setMock(null, { message: 'err' })
      const p = await getPromptByName('Policy Type Detection')
      expect(p!.id).toBe('fallback-type-detection')
      expect(p!.category).toBe('extraction')
      expect(p!.variables).toContain('document_text')
      expect(p!.defaultModel).toBe('gpt-4o-mini')
    })
  })

  // ==========================================================================
  // DEFAULT EXPORT
  // ==========================================================================

  describe('default export', () => {
    it('should export all functions', async () => {
      const mod = await import('../services/prompt-service.js')
      const def = mod.default

      expect(def.getPromptById).toBe(getPromptById)
      expect(def.getPromptByName).toBe(getPromptByName)
      expect(def.getPromptsByCategory).toBe(getPromptsByCategory)
      expect(def.getAllPrompts).toBe(getAllPrompts)
      expect(def.getRenderedPrompt).toBe(getRenderedPrompt)
      expect(def.getExtractionPrompt).toBe(getExtractionPrompt)
      expect(def.getChatPrompt).toBe(getChatPrompt)
      expect(def.getOCRPrompt).toBe(getOCRPrompt)
      expect(def.getTypeDetectionPrompt).toBe(getTypeDetectionPrompt)
      expect(def.renderTemplate).toBe(renderTemplate)
      expect(def.clearPromptCache).toBe(clearPromptCache)
      expect(def.updatePrompt).toBe(updatePrompt)
      expect(def.createPrompt).toBe(createPrompt)
    })
  })
})
