/**
 * Prompt Service Tests
 *
 * Tests for server/services/prompt-service.ts
 * Tests prompt fetching, caching, rendering, and admin operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create a configurable mock chain
let mockQueryResult: { data: unknown; error: Error | null } = { data: null, error: null }

const createMockChain = () => {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single']

  methods.forEach(method => {
    if (method === 'single') {
      chain[method] = vi.fn(() => Promise.resolve(mockQueryResult))
    } else {
      chain[method] = vi.fn(() => chain)
    }
  })

  // Also make chain itself a promise for order().order() pattern
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => {
    resolve(mockQueryResult)
  }

  return chain
}

const mockFrom = vi.fn(() => createMockChain())

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Set environment variables before importing the module
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Import after mocking
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

// Helper to set mock result
function setMockResult(data: unknown, error: Error | null = null) {
  mockQueryResult = { data, error }
}

describe('Prompt Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPromptCache()
    mockQueryResult = { data: null, error: null }
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearPromptCache()
  })

  // ==========================================================================
  // TEMPLATE RENDERING
  // ==========================================================================

  describe('renderTemplate', () => {
    it('should replace simple variables', () => {
      const template = 'Hello {{name}}, welcome to {{place}}!'
      const variables = { name: 'John', place: 'InsurAI' }

      const result = renderTemplate(template, variables)

      expect(result).toBe('Hello John, welcome to InsurAI!')
    })

    it('should handle missing variables by replacing with empty string', () => {
      const template = 'Hello {{name}}, your ID is {{id}}'
      const variables = { name: 'John' }

      const result = renderTemplate(template, variables)

      expect(result).toBe('Hello John, your ID is')
    })

    it('should handle conditional blocks - truthy value', () => {
      const template = '{{#if name}}Hello {{name}}!{{/if}}'
      const variables = { name: 'John' }

      const result = renderTemplate(template, variables)

      expect(result).toBe('Hello John!')
    })

    it('should handle conditional blocks - falsy value', () => {
      const template = '{{#if name}}Hello {{name}}!{{/if}}Default message'
      const variables = {}

      const result = renderTemplate(template, variables)

      expect(result).toBe('Default message')
    })

    it('should handle nested conditionals and variables', () => {
      const template = `System prompt
{{#if policy_context}}Policy Info:
{{policy_context}}
{{/if}}
End of prompt`
      const variables = { policy_context: 'Kasko policy #12345' }

      const result = renderTemplate(template, variables)

      expect(result).toContain('Policy Info:')
      expect(result).toContain('Kasko policy #12345')
    })

    it('should handle undefined values', () => {
      const template = '{{name}}: {{value}}'
      const variables = { name: 'Test', value: undefined }

      const result = renderTemplate(template, variables)

      expect(result).toBe('Test:')
    })

    it('should trim whitespace from result', () => {
      const template = '  \n{{text}}\n  '
      const variables = { text: 'Hello' }

      const result = renderTemplate(template, variables)

      expect(result).toBe('Hello')
    })

    it('should handle multiple occurrences of same variable', () => {
      const template = '{{word}} {{word}} {{word}}'
      const variables = { word: 'test' }

      const result = renderTemplate(template, variables)

      expect(result).toBe('test test test')
    })
  })

  // ==========================================================================
  // PROMPT FETCHING BY ID
  // ==========================================================================

  describe('getPromptById', () => {
    it('should fetch prompt from database', async () => {
      const mockDbPrompt = {
        id: 'prompt-123',
        name: 'Test Prompt',
        description: 'Test description',
        category: 'extraction',
        system_prompt: 'System prompt text',
        user_prompt_template: 'User prompt {{input}}',
        variables: ['input'],
        is_active: true,
        version: 2,
        default_provider: 'openai',
        default_model: 'gpt-4o',
        parameters: { temperature: 0.1 },
      }

      setMockResult(mockDbPrompt)

      const prompt = await getPromptById('prompt-123')

      expect(mockFrom).toHaveBeenCalledWith('prompt_templates')
      expect(prompt?.id).toBe('prompt-123')
      expect(prompt?.name).toBe('Test Prompt')
      expect(prompt?.version).toBe(2)
    })

    it('should return fallback prompt when not in database', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptById('fallback-extraction-master')

      expect(prompt).toBeTruthy()
      expect(prompt?.name).toBe('Policy Extraction - Master')
    })

    it('should return null when prompt does not exist', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptById('nonexistent-id')

      expect(prompt).toBeNull()
    })
  })

  // ==========================================================================
  // PROMPT FETCHING BY NAME
  // ==========================================================================

  describe('getPromptByName', () => {
    it('should fetch prompt by name from database', async () => {
      const mockDbPrompt = {
        id: 'prompt-789',
        name: 'Policy Extraction - Master',
        category: 'extraction',
        system_prompt: 'Extract insurance data...',
        user_prompt_template: 'Document: {{document_text}}',
        variables: ['document_text'],
        is_active: true,
        version: 5,
      }

      setMockResult(mockDbPrompt)

      const prompt = await getPromptByName('Policy Extraction - Master')

      expect(prompt?.id).toBe('prompt-789')
      expect(prompt?.version).toBe(5)
    })

    it('should use fallback when database fails', async () => {
      setMockResult(null, new Error('DB error'))

      const prompt = await getPromptByName('Policy Extraction - Master')

      expect(prompt).toBeTruthy()
      expect(prompt?.category).toBe('extraction')
      expect(prompt?.id).toBe('fallback-extraction-master')
    })

    it('should return null for unknown prompt name', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptByName('Unknown Prompt Name')

      expect(prompt).toBeNull()
    })
  })

  // ==========================================================================
  // PROMPT FETCHING BY CATEGORY
  // ==========================================================================

  describe('getPromptsByCategory', () => {
    it('should return fallback prompts when database fails', async () => {
      setMockResult(null, new Error('DB error'))

      const prompts = await getPromptsByCategory('extraction')

      // Should return at least the fallback extraction prompts
      expect(prompts.length).toBeGreaterThan(0)
      expect(prompts.every((p) => p.category === 'extraction')).toBe(true)
    })
  })

  // ==========================================================================
  // GET ALL PROMPTS
  // ==========================================================================

  describe('getAllPrompts', () => {
    it('should return fallback prompts when database fails', async () => {
      setMockResult(null, new Error('DB error'))

      const prompts = await getAllPrompts()

      // Should return the 4 hardcoded fallback prompts
      expect(prompts.length).toBeGreaterThanOrEqual(4)
    })
  })

  // ==========================================================================
  // RENDERED PROMPTS
  // ==========================================================================

  describe('getRenderedPrompt', () => {
    it('should render a prompt with variables', async () => {
      const mockDbPrompt = {
        id: 'render-test',
        name: 'Render Test',
        category: 'extraction',
        system_prompt: 'You are analyzing {{document_type}} documents',
        user_prompt_template: 'Extract from: {{document_text}}',
        variables: ['document_type', 'document_text'],
        is_active: true,
        version: 1,
        default_provider: 'openai',
        default_model: 'gpt-4o',
        parameters: { temperature: 0.1 },
      }

      setMockResult(mockDbPrompt)

      const rendered = await getRenderedPrompt('Render Test', {
        document_type: 'insurance',
        document_text: 'Policy content here...',
      })

      expect(rendered).toBeTruthy()
      expect(rendered?.systemPrompt).toBe('You are analyzing insurance documents')
      expect(rendered?.userPrompt).toBe('Extract from: Policy content here...')
      expect(rendered?.templateId).toBe('render-test')
      expect(rendered?.version).toBe(1)
      expect(rendered?.provider).toBe('openai')
    })

    it('should return null for nonexistent prompt', async () => {
      setMockResult(null, new Error('Not found'))

      const rendered = await getRenderedPrompt('Nonexistent', {})

      expect(rendered).toBeNull()
    })
  })

  // ==========================================================================
  // CONVENIENCE FUNCTIONS
  // ==========================================================================

  describe('Convenience Functions', () => {
    describe('getExtractionPrompt', () => {
      it('should get extraction prompt with document text', async () => {
        setMockResult(null, new Error('Not found'))

        const prompt = await getExtractionPrompt('Sample document text')

        // Falls back to hardcoded master extraction prompt
        expect(prompt).toBeTruthy()
        expect(prompt?.templateName).toBe('Policy Extraction - Master')
        expect(prompt?.userPrompt).toContain('Sample document text')
      })
    })

    describe('getChatPrompt', () => {
      it('should get chat prompt with message and context', async () => {
        setMockResult(null, new Error('Not found'))

        const prompt = await getChatPrompt('What is my coverage?', 'Kasko policy for vehicle ABC123')

        expect(prompt).toBeTruthy()
        expect(prompt?.templateName).toBe('Policy Chat Assistant')
        expect(prompt?.userPrompt).toContain('What is my coverage?')
        expect(prompt?.systemPrompt).toContain('Kasko policy for vehicle ABC123')
      })

      it('should work without policy context', async () => {
        setMockResult(null, new Error('Not found'))

        const prompt = await getChatPrompt('General insurance question')

        expect(prompt).toBeTruthy()
        expect(prompt?.userPrompt).toContain('General insurance question')
      })
    })

    describe('getOCRPrompt', () => {
      it('should get OCR correction prompt', async () => {
        setMockResult(null, new Error('Not found'))

        const prompt = await getOCRPrompt('B İ RLE Şİ K S İ GORTA')

        expect(prompt).toBeTruthy()
        expect(prompt?.templateName).toBe('OCR Correction - Lightweight')
        expect(prompt?.userPrompt).toContain('B İ RLE Şİ K S İ GORTA')
      })
    })

    describe('getTypeDetectionPrompt', () => {
      it('should get policy type detection prompt', async () => {
        setMockResult(null, new Error('Not found'))

        const prompt = await getTypeDetectionPrompt('Kasko Sigorta Poliçesi...')

        expect(prompt).toBeTruthy()
        expect(prompt?.templateName).toBe('Policy Type Detection')
        expect(prompt?.userPrompt).toContain('Kasko Sigorta Poliçesi')
      })
    })
  })

  // ==========================================================================
  // ADMIN OPERATIONS
  // ==========================================================================

  describe('Admin Operations', () => {
    describe('updatePrompt', () => {
      it('should return null when template not found', async () => {
        setMockResult(null, new Error('Not found'))

        const result = await updatePrompt('invalid-id', { name: 'New Name' })

        expect(result).toBeNull()
      })
    })

    describe('createPrompt', () => {
      it('should return null on create error', async () => {
        setMockResult(null, new Error('Create failed'))

        const result = await createPrompt({
          name: 'Test',
          description: '',
          category: 'other',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
          variables: [],
          isActive: false,
        })

        expect(result).toBeNull()
      })
    })
  })

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  describe('Cache Management', () => {
    describe('clearPromptCache', () => {
      it('should clear cache successfully', () => {
        // Just verify it doesn't throw
        expect(() => clearPromptCache()).not.toThrow()
      })
    })
  })

  // ==========================================================================
  // FALLBACK PROMPTS
  // ==========================================================================

  describe('Fallback Prompts', () => {
    it('should have master extraction prompt', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptByName('Policy Extraction - Master')

      expect(prompt).toBeTruthy()
      expect(prompt?.category).toBe('extraction')
      expect(prompt?.systemPrompt).toContain('insurance document analyst')
      expect(prompt?.variables).toContain('document_text')
    })

    it('should have chat assistant prompt', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptByName('Policy Chat Assistant')

      expect(prompt).toBeTruthy()
      expect(prompt?.category).toBe('chat')
      expect(prompt?.systemPrompt).toContain('insurance policy assistant')
      expect(prompt?.variables).toContain('user_message')
      expect(prompt?.variables).toContain('policy_context')
    })

    it('should have OCR correction prompt', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptByName('OCR Correction - Lightweight')

      expect(prompt).toBeTruthy()
      expect(prompt?.category).toBe('ocr')
      expect(prompt?.systemPrompt).toContain('OCR')
      expect(prompt?.variables).toContain('raw_text')
    })

    it('should have policy type detection prompt', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getPromptByName('Policy Type Detection')

      expect(prompt).toBeTruthy()
      expect(prompt?.category).toBe('extraction')
      expect(prompt?.systemPrompt).toContain('policy type')
    })
  })

  // ==========================================================================
  // TYPE SPECIFIC PROMPT MAPPING
  // ==========================================================================

  describe('Type Specific Prompt Mapping', () => {
    it('should fall back to master for unknown types', async () => {
      setMockResult(null, new Error('Not found'))

      const prompt = await getExtractionPrompt('Document', 'unknown_type')

      expect(prompt).toBeTruthy()
      expect(prompt?.templateName).toBe('Policy Extraction - Master')
    })
  })
})
