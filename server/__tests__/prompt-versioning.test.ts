/**
 * Prompt Versioning and A/B Testing Middleware Tests
 *
 * Comprehensive tests for server/middleware/prompt-versioning.ts
 * Covers: template management, version management, A/B testing,
 * usage tracking, prompt rendering, and database fallback paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Supabase mock setup
// ---------------------------------------------------------------------------
let mockQueryResult: { data: unknown; error: Error | null } = {
  data: null,
  error: null,
}

const createMockChain = () => {
  const chain: Record<string, unknown> = {}
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'order',
    'single',
    'limit',
  ]

  methods.forEach((method) => {
    if (method === 'single') {
      chain[method] = vi.fn(() => Promise.resolve(mockQueryResult))
    } else {
      chain[method] = vi.fn(() => chain)
    }
  })

  // Make the chain thenable for queries that don't end with .single()
  ;(chain as Record<string, unknown>).then = (
    resolve: (value: unknown) => void
  ) => {
    resolve(mockQueryResult)
  }

  return chain
}

const mockFrom = vi.fn(() => createMockChain())

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Set env vars BEFORE importing the module so getClient() initialises
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Import after mocking
import {
  // Types
  type PromptTemplate,
  type PromptVersion,
  type ABTest,
  type PromptCategory,
  // Templates
  getTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  // Versions
  getVersions,
  getVersion,
  getLatestVersion,
  createVersion,
  rollbackToVersion,
  // A/B Testing
  getABTests,
  getABTest,
  createABTest,
  updateABTestStatus,
  selectVersionForABTest,
  calculateABTestResults,
  // Usage
  logPromptUsage,
  getTemplateStats,
  // Rendering
  extractVariables,
  renderPrompt,
  getRenderedPrompts,
} from '../middleware/prompt-versioning.js'

// Helper to configure the mock query result
function setMockResult(data: unknown, error: Error | null = null) {
  mockQueryResult = { data, error }
}

// Helper: a minimal DB-shape row for a template
function dbTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'Test',
    description: 'desc',
    category: 'extraction',
    system_prompt: 'sys',
    user_prompt_template: '{{doc}}',
    variables: ['doc'],
    is_active: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
    ...overrides,
  }
}

// Helper: a minimal DB-shape row for a version
function dbVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    template_id: 'tpl-1',
    version: 1,
    system_prompt: 'sys',
    user_prompt_template: '{{doc}}',
    variables: ['doc'],
    change_description: 'init',
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
    usage_count: 0,
    success_count: 0,
    error_count: 0,
    avg_response_time: 0,
    avg_tokens_used: 0,
    avg_cost: 0,
    ...overrides,
  }
}

// Helper: a minimal DB-shape row for an AB test
function dbABTestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ab-1',
    name: 'Test AB',
    description: 'desc',
    template_id: 'tpl-1',
    status: 'draft',
    start_date: undefined,
    end_date: undefined,
    control_version_id: 'v-1',
    treatment_version_ids: ['v-2'],
    traffic_allocation: { 'v-1': 50, 'v-2': 50 },
    primary_metric: 'success_rate',
    min_sample_size: 10,
    results: undefined,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
    ...overrides,
  }
}

describe('Prompt Versioning Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryResult = { data: null, error: null }
  })

  // ==========================================================================
  // extractVariables
  // ==========================================================================

  describe('extractVariables', () => {
    it('should extract simple variables', () => {
      const vars = extractVariables('Hello {{name}}, welcome to {{place}}!')
      expect(vars).toContain('name')
      expect(vars).toContain('place')
      expect(vars).toHaveLength(2)
    })

    it('should extract variables from conditional blocks', () => {
      const vars = extractVariables('{{#if policy_context}}Content{{/if}} {{user_msg}}')
      expect(vars).toContain('policy_context')
      expect(vars).toContain('user_msg')
    })

    it('should not include control directives as variables', () => {
      const vars = extractVariables('{{#if foo}}bar{{/if}}')
      expect(vars).toContain('foo')
      expect(vars).not.toContain('#if foo')
      expect(vars).not.toContain('/if')
    })

    it('should deduplicate variables', () => {
      const vars = extractVariables('{{x}} {{x}} {{x}}')
      expect(vars).toEqual(['x'])
    })

    it('should return empty array when no variables', () => {
      expect(extractVariables('No variables here')).toEqual([])
    })

    it('should handle whitespace in variable names', () => {
      const vars = extractVariables('{{ name }} {{ city }}')
      expect(vars).toContain('name')
      expect(vars).toContain('city')
    })

    it('should handle #if with spaces', () => {
      const vars = extractVariables('{{#if  context  }}...{{/if}}')
      expect(vars).toContain('context')
    })

    it('should skip /if closing tags', () => {
      const vars = extractVariables('{{/if}}')
      expect(vars).toEqual([])
    })
  })

  // ==========================================================================
  // renderPrompt
  // ==========================================================================

  describe('renderPrompt', () => {
    it('should replace simple variables', () => {
      const result = renderPrompt('Hello {{name}}!', { name: 'World' })
      expect(result).toBe('Hello World!')
    })

    it('should replace multiple occurrences', () => {
      const result = renderPrompt('{{a}} + {{a}} = 2{{a}}', { a: 'x' })
      expect(result).toBe('x + x = 2x')
    })

    it('should handle undefined variables as empty string', () => {
      const result = renderPrompt('Hello {{name}}!', { name: undefined })
      expect(result).toBe('Hello !')
    })

    it('should handle missing variables as empty string', () => {
      const result = renderPrompt('Hello {{name}}!', {})
      expect(result).toBe('Hello !')
    })

    it('should render conditional block when variable is truthy', () => {
      const result = renderPrompt('{{#if ctx}}Context: {{ctx}}{{/if}}', { ctx: 'data' })
      expect(result).toBe('Context: data')
    })

    it('should remove conditional block when variable is falsy', () => {
      const result = renderPrompt('Before{{#if ctx}}Hidden{{/if}}After', {})
      expect(result).toBe('BeforeAfter')
    })

    it('should handle multiline conditional blocks', () => {
      const template = `Start
{{#if info}}
Info: {{info}}
{{/if}}
End`
      const result = renderPrompt(template, { info: 'details' })
      expect(result).toContain('Info: details')
      expect(result).toContain('Start')
      expect(result).toContain('End')
    })

    it('should trim whitespace from result', () => {
      const result = renderPrompt('  \n  hello  \n  ', {})
      expect(result).toBe('hello')
    })

    it('should handle empty template', () => {
      expect(renderPrompt('', {})).toBe('')
    })

    it('should handle multiple conditional blocks', () => {
      const template = '{{#if a}}A{{/if}} {{#if b}}B{{/if}}'
      expect(renderPrompt(template, { a: 'yes' })).toBe('A')
      expect(renderPrompt(template, { b: 'yes' })).toBe('B')
      expect(renderPrompt(template, { a: 'yes', b: 'yes' })).toBe('A B')
    })
  })

  // ==========================================================================
  // TEMPLATE MANAGEMENT (in-memory fallback)
  // ==========================================================================

  describe('Template Management', () => {
    describe('getTemplates', () => {
      it('should return templates from DB when available', async () => {
        setMockResult([dbTemplateRow(), dbTemplateRow({ id: 'tpl-2', name: 'T2' })])

        const result = await getTemplates()
        expect(mockFrom).toHaveBeenCalledWith('prompt_templates')
        // DB path returns mapped results
        expect(result).toHaveLength(2)
      })

      it('should filter by category from DB', async () => {
        setMockResult([dbTemplateRow({ category: 'chat' })])

        const result = await getTemplates('chat')
        expect(result).toHaveLength(1)
        expect(result[0].category).toBe('chat')
      })

      it('should fall back to in-memory when DB errors', async () => {
        setMockResult(null, new Error('DB error'))

        const result = await getTemplates()
        // Should return default templates initialized in-memory
        expect(result.length).toBeGreaterThan(0)
      })

      it('should filter in-memory templates by category', async () => {
        setMockResult(null, new Error('DB error'))

        const result = await getTemplates('extraction')
        expect(result.every((t) => t.category === 'extraction')).toBe(true)
      })
    })

    describe('getTemplate', () => {
      it('should return template from DB', async () => {
        setMockResult(dbTemplateRow({ id: 'tpl-123' }))

        const result = await getTemplate('tpl-123')
        expect(result?.id).toBe('tpl-123')
      })

      it('should return in-memory template on DB error', async () => {
        setMockResult(null, new Error('err'))

        const result = await getTemplate('extraction-default')
        expect(result?.id).toBe('extraction-default')
        expect(result?.category).toBe('extraction')
      })

      it('should return null when not found anywhere', async () => {
        setMockResult(null, new Error('err'))

        const result = await getTemplate('nonexistent-id')
        expect(result).toBeNull()
      })
    })

    describe('getDefaultTemplate', () => {
      it('should return default template from DB', async () => {
        setMockResult(dbTemplateRow({ is_default: true, is_active: true }))

        const result = await getDefaultTemplate('extraction')
        expect(result?.isDefault).toBe(true)
        expect(result?.isActive).toBe(true)
      })

      it('should fall back to in-memory default', async () => {
        setMockResult(null, new Error('err'))

        const result = await getDefaultTemplate('extraction')
        expect(result).not.toBeNull()
        expect(result?.isDefault).toBe(true)
        expect(result?.isActive).toBe(true)
        expect(result?.category).toBe('extraction')
      })

      it('should return null for category with no in-memory default', async () => {
        setMockResult(null, new Error('err'))

        const result = await getDefaultTemplate('analysis')
        // 'analysis' has no default template in the initialised set
        expect(result).toBeNull()
      })
    })

    describe('createTemplate', () => {
      it('should create template via DB and return mapped result', async () => {
        const created = dbTemplateRow({
          id: 'extraction-999',
          name: 'New',
          is_default: false,
        })
        // First call: insert -> returns created template
        // Second call (createVersion inside): insert -> returns version
        // The createVersion also calls getLatestVersion which calls getVersion
        setMockResult(created)

        const result = await createTemplate({
          name: 'New',
          description: 'new desc',
          category: 'extraction',
          systemPrompt: 'sys {{x}}',
          userPromptTemplate: 'user {{y}}',
          isActive: true,
          isDefault: false,
        })

        expect(result.name).toBe('New')
        expect(result.id).toBeTruthy()
      })

      it('should fall back to in-memory on DB error', async () => {
        setMockResult(null, new Error('insert error'))

        const result = await createTemplate({
          name: 'Mem Template',
          description: 'desc',
          category: 'chat',
          systemPrompt: 'hello {{user}}',
          userPromptTemplate: '{{msg}}',
          isActive: true,
          isDefault: false,
        })

        expect(result.name).toBe('Mem Template')
        expect(result.category).toBe('chat')
        expect(result.variables).toContain('user')
        expect(result.variables).toContain('msg')
      })

      it('should auto-extract variables from prompts', async () => {
        setMockResult(null, new Error('err'))

        const result = await createTemplate({
          name: 'Vars Test',
          description: '',
          category: 'ocr',
          systemPrompt: '{{a}} {{b}}',
          userPromptTemplate: '{{c}} {{#if d}}conditional{{/if}}',
          isActive: true,
          isDefault: false,
        })

        expect(result.variables).toContain('a')
        expect(result.variables).toContain('b')
        expect(result.variables).toContain('c')
        expect(result.variables).toContain('d')
      })
    })

    describe('updateTemplate', () => {
      it('should return null when template not found', async () => {
        setMockResult(null, new Error('not found'))

        const result = await updateTemplate('nonexistent', { name: 'X' }, 'update')
        expect(result).toBeNull()
      })

      it('should update template metadata without creating version', async () => {
        // First call: getTemplate
        setMockResult(dbTemplateRow({ id: 'tpl-up' }))

        const result = await updateTemplate(
          'tpl-up',
          { name: 'Updated Name' },
          'Renamed'
        )
        // The update call goes to DB
        expect(result).not.toBeNull()
      })

      it('should create new version when prompt text changes (in-memory)', async () => {
        // Force in-memory path
        setMockResult(null, new Error('err'))

        // Create a fresh template to avoid mutating shared defaults
        const tpl = await createTemplate({
          name: 'Version Test',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'original sys',
          userPromptTemplate: 'original user',
          isActive: true,
          isDefault: false,
        })

        const versionsBefore = await getVersions(tpl.id)

        const result = await updateTemplate(
          tpl.id,
          {
            systemPrompt: 'Brand new system prompt with {{x}}',
            userPromptTemplate: 'Brand new user prompt with {{y}}',
          },
          'Major prompt rewrite',
          'admin-1'
        )

        expect(result).not.toBeNull()
        expect(result?.systemPrompt).toBe('Brand new system prompt with {{x}}')

        const versionsAfter = await getVersions(tpl.id)
        // A new version should have been created
        expect(versionsAfter.length).toBeGreaterThan(versionsBefore.length)
      })

      it('should NOT create version when only metadata changes (in-memory)', async () => {
        setMockResult(null, new Error('err'))

        // Create a fresh template
        const tpl = await createTemplate({
          name: 'Meta Only',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'sys',
          userPromptTemplate: 'user',
          isActive: true,
          isDefault: false,
        })

        const versionsBefore = await getVersions(tpl.id)

        await updateTemplate(
          tpl.id,
          { name: 'Renamed', isActive: false },
          'Metadata only'
        )

        const versionsAfter = await getVersions(tpl.id)
        expect(versionsAfter.length).toBe(versionsBefore.length)
      })

      it('should recalculate variables when prompts change (in-memory)', async () => {
        setMockResult(null, new Error('err'))

        // Create a fresh template for this test to avoid mutating shared defaults
        const tpl = await createTemplate({
          name: 'Var Recalc',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'old sys {{old}}',
          userPromptTemplate: '{{oldUser}}',
          isActive: true,
          isDefault: false,
        })

        const result = await updateTemplate(
          tpl.id,
          {
            systemPrompt: 'New system {{newVar}}',
            userPromptTemplate: '{{anotherVar}}',
          },
          'Var change'
        )

        expect(result?.variables).toContain('newVar')
        expect(result?.variables).toContain('anotherVar')
      })
    })

    describe('deleteTemplate', () => {
      it('should soft-delete via DB', async () => {
        setMockResult({ id: 'x' }) // success, no error

        const result = await deleteTemplate('tpl-x')
        expect(result).toBe(true)
      })

      it('should return false on DB error for non-existent in-memory template', async () => {
        setMockResult(null, new Error('err'))

        const result = await deleteTemplate('nonexistent')
        expect(result).toBe(false)
      })

      it('should soft-delete and return true on DB success', async () => {
        // Set mock to succeed (no error) for the update call
        setMockResult(null, null)

        const result = await deleteTemplate('any-template-id')
        expect(result).toBe(true)
      })

      it('should return false when DB returns error', async () => {
        setMockResult(null, new Error('DB error'))

        const result = await deleteTemplate('any-template-id')
        // deleteTemplate returns !error, so error means false
        expect(result).toBe(false)
      })
    })
  })

  // ==========================================================================
  // VERSION MANAGEMENT
  // ==========================================================================

  describe('Version Management', () => {
    describe('getVersions', () => {
      it('should return versions from DB', async () => {
        setMockResult([
          dbVersionRow({ id: 'v-1', version: 1 }),
          dbVersionRow({ id: 'v-2', version: 2 }),
        ])

        const result = await getVersions('tpl-1')
        expect(result).toHaveLength(2)
      })

      it('should fall back to in-memory versions on DB error', async () => {
        setMockResult(null, new Error('err'))

        const result = await getVersions('extraction-default')
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].templateId).toBe('extraction-default')
      })

      it('should sort in-memory versions by version number descending', async () => {
        setMockResult(null, new Error('err'))

        // Create a second version in-memory
        await createVersion('extraction-default', {
          systemPrompt: 'v2 sys',
          userPromptTemplate: 'v2 user',
          changeDescription: 'v2',
        })

        const result = await getVersions('extraction-default')
        // Should be sorted descending
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].version).toBeGreaterThan(result[i].version)
        }
      })
    })

    describe('getVersion', () => {
      it('should return version from DB', async () => {
        setMockResult(dbVersionRow({ id: 'v-42' }))

        const result = await getVersion('v-42')
        expect(result?.id).toBe('v-42')
      })

      it('should fall back to in-memory', async () => {
        setMockResult(null, new Error('err'))

        const result = await getVersion('extraction-default-v1')
        expect(result?.id).toBe('extraction-default-v1')
        expect(result?.templateId).toBe('extraction-default')
      })

      it('should return null when not found', async () => {
        setMockResult(null, new Error('err'))

        const result = await getVersion('nonexistent-v1')
        expect(result).toBeNull()
      })
    })

    describe('getLatestVersion', () => {
      it('should return latest version from DB', async () => {
        setMockResult(dbVersionRow({ id: 'v-latest', version: 5 }))

        const result = await getLatestVersion('tpl-1')
        expect(result?.version).toBe(5)
      })

      it('should return latest in-memory version', async () => {
        setMockResult(null, new Error('err'))

        const result = await getLatestVersion('extraction-default')
        expect(result).not.toBeNull()
        expect(result?.templateId).toBe('extraction-default')
      })

      it('should return null for unknown template', async () => {
        setMockResult(null, new Error('err'))

        const result = await getLatestVersion('nonexistent')
        expect(result).toBeNull()
      })
    })

    describe('createVersion', () => {
      it('should create version via DB and return mapped result', async () => {
        // The mock returns the same shape for all DB calls (getLatestVersion + insert)
        // The DB row returned has variables based on what the DB stores, not what we compute
        setMockResult(dbVersionRow({ id: 'tpl-1-v2', version: 2, variables: ['x'] }))

        const result = await createVersion('tpl-1', {
          systemPrompt: 'new sys',
          userPromptTemplate: 'new user {{x}}',
          changeDescription: 'Updated',
          createdBy: 'admin',
        })

        expect(result.version).toBe(2)
        expect(result.variables).toContain('x')
      })

      it('should create version in-memory when DB fails', async () => {
        setMockResult(null, new Error('err'))

        const result = await createVersion('extraction-default', {
          systemPrompt: 'mem sys {{a}}',
          userPromptTemplate: 'mem user {{b}}',
          changeDescription: 'In-memory version',
        })

        expect(result.templateId).toBe('extraction-default')
        expect(result.changeDescription).toBe('In-memory version')
        expect(result.variables).toContain('a')
        expect(result.variables).toContain('b')
        expect(result.usageCount).toBe(0)
        expect(result.successCount).toBe(0)
        expect(result.errorCount).toBe(0)
      })

      it('should increment version number', async () => {
        setMockResult(null, new Error('err'))

        const latest = await getLatestVersion('chat-default')
        const latestNum = latest?.version || 0

        const result = await createVersion('chat-default', {
          systemPrompt: 'v next',
          userPromptTemplate: 'v next user',
          changeDescription: 'bump',
        })

        expect(result.version).toBe(latestNum + 1)
      })

      it('should start at version 1 for new template', async () => {
        setMockResult(null, new Error('err'))

        // Create a fresh template so it has no versions yet
        const tpl = await createTemplate({
          name: 'Blank',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'sys',
          userPromptTemplate: 'user',
          isActive: true,
          isDefault: false,
        })

        // createTemplate already creates v1, so check it
        const versions = await getVersions(tpl.id)
        expect(versions.some((v) => v.version === 1)).toBe(true)
      })
    })

    describe('rollbackToVersion', () => {
      it('should return null when version not found', async () => {
        setMockResult(null, new Error('err'))

        const result = await rollbackToVersion('extraction-default', 'nonexistent-v99')
        expect(result).toBeNull()
      })

      it('should return null when version belongs to different template', async () => {
        setMockResult(null, new Error('err'))

        // chat-default-v1 belongs to chat-default, not extraction-default
        const result = await rollbackToVersion('extraction-default', 'chat-default-v1')
        expect(result).toBeNull()
      })

      it('should rollback successfully in-memory', async () => {
        setMockResult(null, new Error('err'))

        // Create a fresh template to avoid shared-state issues
        const tpl = await createTemplate({
          name: 'Rollback Target',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'V1 system',
          userPromptTemplate: 'V1 user',
          isActive: true,
          isDefault: false,
        })

        // Get v1 info
        const v1Versions = await getVersions(tpl.id)
        const v1 = v1Versions[0]

        // Create v2 with different content
        await updateTemplate(
          tpl.id,
          {
            systemPrompt: 'V2 system',
            userPromptTemplate: 'V2 user',
          },
          'v2 change'
        )

        // Now rollback to v1
        const result = await rollbackToVersion(tpl.id, v1.id, 'admin-rollback')

        expect(result).not.toBeNull()
        expect(result?.systemPrompt).toBe('V1 system')
        expect(result?.userPromptTemplate).toBe('V1 user')
      })
    })
  })

  // ==========================================================================
  // A/B TESTING
  // ==========================================================================

  describe('A/B Testing', () => {
    describe('getABTests', () => {
      it('should return tests from DB', async () => {
        setMockResult([dbABTestRow()])

        const result = await getABTests()
        expect(result).toHaveLength(1)
      })

      it('should filter by status from DB', async () => {
        setMockResult([dbABTestRow({ status: 'running' })])

        const result = await getABTests('running')
        expect(result[0].status).toBe('running')
      })

      it('should fall back to in-memory', async () => {
        setMockResult(null, new Error('err'))

        const result = await getABTests()
        // In-memory starts empty
        expect(result).toEqual([])
      })

      it('should filter in-memory tests by status', async () => {
        setMockResult(null, new Error('err'))

        // Create an in-memory test
        await createABTest({
          name: 'Test A',
          description: 'desc',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: 'v-1',
          treatmentVersionIds: ['v-2'],
          trafficAllocation: { 'v-1': 50, 'v-2': 50 },
          primaryMetric: 'success_rate',
          minSampleSize: 10,
        })

        await createABTest({
          name: 'Test B',
          description: 'desc',
          templateId: 'extraction-default',
          status: 'draft',
          controlVersionId: 'v-1',
          treatmentVersionIds: ['v-2'],
          trafficAllocation: { 'v-1': 50, 'v-2': 50 },
          primaryMetric: 'cost',
          minSampleSize: 5,
        })

        const running = await getABTests('running')
        expect(running.every((t) => t.status === 'running')).toBe(true)

        const draft = await getABTests('draft')
        expect(draft.every((t) => t.status === 'draft')).toBe(true)
      })
    })

    describe('getABTest', () => {
      it('should return test from DB', async () => {
        setMockResult(dbABTestRow({ id: 'ab-42' }))

        const result = await getABTest('ab-42')
        expect(result?.id).toBe('ab-42')
      })

      it('should return null when not found', async () => {
        setMockResult(null, new Error('err'))

        const result = await getABTest('nonexistent')
        expect(result).toBeNull()
      })
    })

    describe('createABTest', () => {
      it('should create test via DB', async () => {
        setMockResult(dbABTestRow({ id: 'ab-new' }))

        const result = await createABTest({
          name: 'New Test',
          description: 'desc',
          templateId: 'tpl-1',
          status: 'draft',
          controlVersionId: 'v-1',
          treatmentVersionIds: ['v-2'],
          trafficAllocation: { 'v-1': 50, 'v-2': 50 },
          primaryMetric: 'success_rate',
          minSampleSize: 100,
        })

        expect(result.id).toBe('ab-new')
      })

      it('should create test in-memory on DB error', async () => {
        setMockResult(null, new Error('err'))

        const result = await createABTest({
          name: 'Memory Test',
          description: 'desc',
          templateId: 'extraction-default',
          status: 'draft',
          controlVersionId: 'v-1',
          treatmentVersionIds: ['v-2'],
          trafficAllocation: { 'v-1': 50, 'v-2': 50 },
          primaryMetric: 'response_time',
          minSampleSize: 20,
        })

        expect(result.name).toBe('Memory Test')
        expect(result.status).toBe('draft')
        expect(result.id).toMatch(/^ab-/)
      })
    })

    describe('updateABTestStatus', () => {
      it('should update status via DB', async () => {
        setMockResult(dbABTestRow({ status: 'running' }))

        const result = await updateABTestStatus('ab-1', 'running')
        expect(result?.status).toBe('running')
      })

      it('should update in-memory status', async () => {
        setMockResult(null, new Error('err'))

        // Create a test first
        const test = await createABTest({
          name: 'Status Test',
          description: '',
          templateId: 'extraction-default',
          status: 'draft',
          controlVersionId: 'v-1',
          treatmentVersionIds: ['v-2'],
          trafficAllocation: { 'v-1': 50, 'v-2': 50 },
          primaryMetric: 'success_rate',
          minSampleSize: 10,
        })

        // Update to running
        const updated = await updateABTestStatus(test.id, 'running')
        expect(updated?.status).toBe('running')
        expect(updated?.startDate).toBeTruthy()
      })

      it('should set endDate when completed', async () => {
        setMockResult(null, new Error('err'))

        const test = await createABTest({
          name: 'End Test',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          startDate: '2026-01-01T00:00:00Z',
          controlVersionId: 'v-1',
          treatmentVersionIds: [],
          trafficAllocation: { 'v-1': 100 },
          primaryMetric: 'cost',
          minSampleSize: 5,
        })

        const completed = await updateABTestStatus(test.id, 'completed')
        expect(completed?.endDate).toBeTruthy()
      })

      it('should set endDate when cancelled', async () => {
        setMockResult(null, new Error('err'))

        const test = await createABTest({
          name: 'Cancel Test',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          startDate: '2026-01-01T00:00:00Z',
          controlVersionId: 'v-1',
          treatmentVersionIds: [],
          trafficAllocation: { 'v-1': 100 },
          primaryMetric: 'cost',
          minSampleSize: 5,
        })

        const cancelled = await updateABTestStatus(test.id, 'cancelled')
        expect(cancelled?.endDate).toBeTruthy()
      })

      it('should return null for nonexistent in-memory test', async () => {
        setMockResult(null, new Error('err'))

        const result = await updateABTestStatus('nonexistent', 'running')
        expect(result).toBeNull()
      })
    })

    describe('selectVersionForABTest', () => {
      it('should return latest version when no running test for that template', async () => {
        setMockResult(null, new Error('err'))

        // Use a fresh template with no AB tests
        const tpl = await createTemplate({
          name: 'No AB',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'sys',
          userPromptTemplate: 'user',
          isActive: true,
          isDefault: false,
        })

        const result = await selectVersionForABTest(tpl.id)
        expect(result).not.toBeNull()
        expect(result?.versionId).toBeTruthy()
        expect(result?.abTestId).toBeUndefined()
      })

      it('should return null for unknown template with no versions', async () => {
        setMockResult(null, new Error('err'))

        const result = await selectVersionForABTest('nonexistent-template')
        expect(result).toBeNull()
      })

      it('should select version from running test based on allocation', async () => {
        setMockResult(null, new Error('err'))

        // Create a running test
        await createABTest({
          name: 'Select Test',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: 'extraction-default-v1',
          treatmentVersionIds: ['extraction-default-v1'],
          trafficAllocation: { 'extraction-default-v1': 100 },
          primaryMetric: 'success_rate',
          minSampleSize: 10,
        })

        const result = await selectVersionForABTest('extraction-default')
        expect(result?.abTestId).toBeTruthy()
        expect(result?.versionId).toBe('extraction-default-v1')
      })

      it('should fallback to control version when random exceeds allocation', async () => {
        setMockResult(null, new Error('err'))

        // Create test with 0% allocation (forces fallback to control)
        await createABTest({
          name: 'Fallback Test',
          description: '',
          templateId: 'chat-default',
          status: 'running',
          controlVersionId: 'chat-default-v1',
          treatmentVersionIds: [],
          trafficAllocation: {}, // empty allocation
          primaryMetric: 'cost',
          minSampleSize: 5,
        })

        const result = await selectVersionForABTest('chat-default')
        expect(result?.versionId).toBe('chat-default-v1')
        expect(result?.abTestId).toBeTruthy()
      })
    })

    describe('calculateABTestResults', () => {
      it('should return null for nonexistent test', async () => {
        setMockResult(null, new Error('err'))

        const result = await calculateABTestResults('nonexistent')
        expect(result).toBeNull()
      })

      it('should calculate results with zero samples', async () => {
        setMockResult(null, new Error('err'))

        const test = await createABTest({
          name: 'Zero Samples',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: 'extraction-default-v1',
          treatmentVersionIds: ['chat-default-v1'],
          trafficAllocation: {
            'extraction-default-v1': 50,
            'chat-default-v1': 50,
          },
          primaryMetric: 'success_rate',
          minSampleSize: 10,
        })

        const results = await calculateABTestResults(test.id)
        expect(results).not.toBeNull()
        expect(results?.totalSamples).toBe(0)
        expect(results?.statisticallySignificant).toBe(false)
      })

      it('should calculate results with usage logs', async () => {
        setMockResult(null, new Error('err'))

        const test = await createABTest({
          name: 'With Logs',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: 'extraction-default-v1',
          treatmentVersionIds: [],
          trafficAllocation: { 'extraction-default-v1': 100 },
          primaryMetric: 'success_rate',
          minSampleSize: 2,
        })

        // Log some usage for this test
        for (let i = 0; i < 5; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: 'extraction-default-v1',
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extraction',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 50,
            responseTime: 500 + i * 100,
            success: i < 4, // 4 success, 1 failure
            cost: 0.01,
            timestamp: new Date().toISOString(),
          })
        }

        const results = await calculateABTestResults(test.id)
        expect(results).not.toBeNull()
        expect(results!.totalSamples).toBe(5)
        expect(results!.byVersion['extraction-default-v1']).toBeDefined()
        expect(results!.byVersion['extraction-default-v1'].samples).toBe(5)
        expect(results!.byVersion['extraction-default-v1'].successRate).toBe(0.8)
      })

      it('should determine winner by response_time metric (lower is better)', async () => {
        setMockResult(null, new Error('err'))

        // Create 2 in-memory versions for this test
        const v1 = await createVersion('extraction-default', {
          systemPrompt: 'fast sys',
          userPromptTemplate: 'fast user',
          changeDescription: 'fast',
        })
        const v2 = await createVersion('extraction-default', {
          systemPrompt: 'slow sys',
          userPromptTemplate: 'slow user',
          changeDescription: 'slow',
        })

        const test = await createABTest({
          name: 'RT Test',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: v1.id,
          treatmentVersionIds: [v2.id],
          trafficAllocation: { [v1.id]: 50, [v2.id]: 50 },
          primaryMetric: 'response_time',
          minSampleSize: 2,
        })

        // v1: fast responses
        for (let i = 0; i < 3; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v1.id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extraction',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 50,
            responseTime: 100,
            success: true,
            cost: 0.01,
            timestamp: new Date().toISOString(),
          })
        }

        // v2: slow responses
        for (let i = 0; i < 3; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v2.id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extraction',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 50,
            responseTime: 1000,
            success: true,
            cost: 0.01,
            timestamp: new Date().toISOString(),
          })
        }

        const results = await calculateABTestResults(test.id)
        // v1 should win because it's faster (lower response time is better)
        expect(results?.winner).toBe(v1.id)
      })

      it('should determine winner by token_efficiency (lower is better)', async () => {
        setMockResult(null, new Error('err'))

        const v1 = await createVersion('extraction-default', {
          systemPrompt: 'efficient',
          userPromptTemplate: 'efficient',
          changeDescription: 'efficient',
        })
        const v2 = await createVersion('extraction-default', {
          systemPrompt: 'wasteful',
          userPromptTemplate: 'wasteful',
          changeDescription: 'wasteful',
        })

        const test = await createABTest({
          name: 'Token Test',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: v1.id,
          treatmentVersionIds: [v2.id],
          trafficAllocation: { [v1.id]: 50, [v2.id]: 50 },
          primaryMetric: 'token_efficiency',
          minSampleSize: 2,
        })

        // v1: few tokens
        for (let i = 0; i < 3; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v1.id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extract',
            inputVariables: {},
            inputTokens: 50,
            outputTokens: 50,
            responseTime: 500,
            success: true,
            cost: 0.005,
            timestamp: new Date().toISOString(),
          })
        }

        // v2: many tokens
        for (let i = 0; i < 3; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v2.id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extract',
            inputVariables: {},
            inputTokens: 500,
            outputTokens: 500,
            responseTime: 500,
            success: true,
            cost: 0.05,
            timestamp: new Date().toISOString(),
          })
        }

        const results = await calculateABTestResults(test.id)
        expect(results?.winner).toBe(v1.id)
      })

      it('should determine winner by cost (lower is better)', async () => {
        setMockResult(null, new Error('err'))

        const v1 = await createVersion('extraction-default', {
          systemPrompt: 'cheap',
          userPromptTemplate: 'cheap',
          changeDescription: 'cheap',
        })
        const v2 = await createVersion('extraction-default', {
          systemPrompt: 'expensive',
          userPromptTemplate: 'expensive',
          changeDescription: 'expensive',
        })

        const test = await createABTest({
          name: 'Cost Test',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: v1.id,
          treatmentVersionIds: [v2.id],
          trafficAllocation: { [v1.id]: 50, [v2.id]: 50 },
          primaryMetric: 'cost',
          minSampleSize: 2,
        })

        for (let i = 0; i < 3; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v1.id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extract',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 100,
            responseTime: 500,
            success: true,
            cost: 0.001,
            timestamp: new Date().toISOString(),
          })
        }

        for (let i = 0; i < 3; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v2.id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extract',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 100,
            responseTime: 500,
            success: true,
            cost: 0.1,
            timestamp: new Date().toISOString(),
          })
        }

        const results = await calculateABTestResults(test.id)
        expect(results?.winner).toBe(v1.id)
      })

      it('should not declare winner when below min sample size', async () => {
        setMockResult(null, new Error('err'))

        const v1 = await createVersion('extraction-default', {
          systemPrompt: 'low',
          userPromptTemplate: 'low',
          changeDescription: 'low',
        })

        const test = await createABTest({
          name: 'Low Sample',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: v1.id,
          treatmentVersionIds: [],
          trafficAllocation: { [v1.id]: 100 },
          primaryMetric: 'success_rate',
          minSampleSize: 100, // Very high threshold
        })

        // Only log 1 usage
        await logPromptUsage({
          templateId: 'extraction-default',
          versionId: v1.id,
          abTestId: test.id,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'extract',
          inputVariables: {},
          inputTokens: 100,
          outputTokens: 50,
          responseTime: 500,
          success: true,
          cost: 0.01,
          timestamp: new Date().toISOString(),
        })

        const results = await calculateABTestResults(test.id)
        expect(results?.winner).toBeUndefined()
      })

      it('should set statisticallySignificant=false when winner equals control', async () => {
        setMockResult(null, new Error('err'))

        const v1Id = 'extraction-default-v1'

        const test = await createABTest({
          name: 'Control Wins',
          description: '',
          templateId: 'extraction-default',
          status: 'running',
          controlVersionId: v1Id,
          treatmentVersionIds: [],
          trafficAllocation: { [v1Id]: 100 },
          primaryMetric: 'success_rate',
          minSampleSize: 2,
        })

        for (let i = 0; i < 5; i++) {
          await logPromptUsage({
            templateId: 'extraction-default',
            versionId: v1Id,
            abTestId: test.id,
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extract',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 50,
            responseTime: 200,
            success: true,
            cost: 0.01,
            timestamp: new Date().toISOString(),
          })
        }

        const results = await calculateABTestResults(test.id)
        // Winner is control, so not statistically significant
        expect(results?.statisticallySignificant).toBe(false)
        expect(results?.confidence).toBe(0.5)
      })
    })
  })

  // ==========================================================================
  // USAGE TRACKING
  // ==========================================================================

  describe('Usage Tracking', () => {
    describe('logPromptUsage', () => {
      it('should log usage and update version metrics', async () => {
        setMockResult(null, new Error('err'))

        const versionId = 'extraction-default-v1'
        const vBefore = await getVersion(versionId)
        const countBefore = vBefore?.usageCount || 0

        await logPromptUsage({
          templateId: 'extraction-default',
          versionId,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'extraction',
          inputVariables: { doc: 'test' },
          inputTokens: 200,
          outputTokens: 100,
          responseTime: 1500,
          success: true,
          cost: 0.02,
          timestamp: new Date().toISOString(),
        })

        const vAfter = await getVersion(versionId)
        expect(vAfter?.usageCount).toBe(countBefore + 1)
        expect(vAfter?.successCount).toBeGreaterThan(0)
      })

      it('should increment error count on failure', async () => {
        setMockResult(null, new Error('err'))

        const versionId = 'ocr-correction-default-v1'
        const vBefore = await getVersion(versionId)
        const errorsBefore = vBefore?.errorCount || 0

        await logPromptUsage({
          templateId: 'ocr-correction-default',
          versionId,
          provider: 'anthropic',
          model: 'claude',
          operation: 'ocr',
          inputVariables: {},
          inputTokens: 50,
          outputTokens: 0,
          responseTime: 3000,
          success: false,
          errorMessage: 'Timeout',
          cost: 0.005,
          timestamp: new Date().toISOString(),
        })

        const vAfter = await getVersion(versionId)
        expect(vAfter?.errorCount).toBe(errorsBefore + 1)
      })

      it('should calculate running averages correctly', async () => {
        setMockResult(null, new Error('err'))

        // Create a fresh version to test averaging
        const v = await createVersion('extraction-default', {
          systemPrompt: 'avg test',
          userPromptTemplate: 'avg test',
          changeDescription: 'avg test',
        })

        // Log first usage: RT=100, tokens=150 (100+50), cost=0.01
        await logPromptUsage({
          templateId: 'extraction-default',
          versionId: v.id,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'test',
          inputVariables: {},
          inputTokens: 100,
          outputTokens: 50,
          responseTime: 100,
          success: true,
          cost: 0.01,
          timestamp: new Date().toISOString(),
        })

        // Log second usage: RT=300, tokens=450 (200+250), cost=0.03
        await logPromptUsage({
          templateId: 'extraction-default',
          versionId: v.id,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'test',
          inputVariables: {},
          inputTokens: 200,
          outputTokens: 250,
          responseTime: 300,
          success: true,
          cost: 0.03,
          timestamp: new Date().toISOString(),
        })

        const updated = await getVersion(v.id)
        expect(updated?.usageCount).toBe(2)
        expect(updated?.avgResponseTime).toBe(200) // (100+300)/2
        expect(updated?.avgTokensUsed).toBe(300)   // (150+450)/2
        expect(updated?.avgCost).toBe(0.02)         // (0.01+0.03)/2
      })

      it('should not crash when version not found', async () => {
        setMockResult(null, new Error('err'))

        // Should not throw
        await expect(
          logPromptUsage({
            templateId: 'nonexistent',
            versionId: 'nonexistent-v1',
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'test',
            inputVariables: {},
            inputTokens: 100,
            outputTokens: 50,
            responseTime: 500,
            success: true,
            cost: 0.01,
            timestamp: new Date().toISOString(),
          })
        ).resolves.toBeUndefined()
      })
    })

    describe('getTemplateStats', () => {
      it('should return stats for template with versions', async () => {
        setMockResult(null, new Error('err'))

        const stats = await getTemplateStats('extraction-default')
        expect(stats.byVersion.length).toBeGreaterThan(0)
        expect(typeof stats.totalUsage).toBe('number')
        expect(typeof stats.successRate).toBe('number')
        expect(typeof stats.avgResponseTime).toBe('number')
        expect(typeof stats.avgCost).toBe('number')
      })

      it('should return zero rates when no usage', async () => {
        setMockResult(null, new Error('err'))

        // Create fresh template with no usage
        const tpl = await createTemplate({
          name: 'No Usage',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'sys',
          userPromptTemplate: 'user',
          isActive: true,
          isDefault: false,
        })

        const stats = await getTemplateStats(tpl.id)
        // The initial version has 0 usage
        const freshVersion = stats.byVersion.find((v) => v.stats.samples === 0)
        expect(freshVersion).toBeDefined()
        expect(freshVersion?.stats.successRate).toBe(0)
      })

      it('should aggregate stats across versions', async () => {
        setMockResult(null, new Error('err'))

        // Create template with 2 versions
        const tpl = await createTemplate({
          name: 'Multi-v Stats',
          description: '',
          category: 'other' as PromptCategory,
          systemPrompt: 'v1 sys',
          userPromptTemplate: 'v1 user',
          isActive: true,
          isDefault: false,
        })

        // Get v1
        const versions1 = await getVersions(tpl.id)
        const v1 = versions1[0]

        // Create v2
        const v2 = await createVersion(tpl.id, {
          systemPrompt: 'v2 sys',
          userPromptTemplate: 'v2 user',
          changeDescription: 'v2',
        })

        // Log usage for v1
        await logPromptUsage({
          templateId: tpl.id,
          versionId: v1.id,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'test',
          inputVariables: {},
          inputTokens: 100,
          outputTokens: 50,
          responseTime: 500,
          success: true,
          cost: 0.01,
          timestamp: new Date().toISOString(),
        })

        // Log usage for v2
        await logPromptUsage({
          templateId: tpl.id,
          versionId: v2.id,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'test',
          inputVariables: {},
          inputTokens: 200,
          outputTokens: 100,
          responseTime: 1000,
          success: true,
          cost: 0.02,
          timestamp: new Date().toISOString(),
        })

        const stats = await getTemplateStats(tpl.id)
        expect(stats.totalUsage).toBe(2)
        expect(stats.successRate).toBe(1)
        expect(stats.byVersion.length).toBe(2)
      })
    })
  })

  // ==========================================================================
  // getRenderedPrompts
  // ==========================================================================

  describe('getRenderedPrompts', () => {
    it('should render prompts using default template for category', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts('extraction', {
        document_text: 'My policy text',
      })

      expect(result).not.toBeNull()
      expect(result?.systemPrompt).toBeTruthy()
      expect(result?.userPrompt).toContain('My policy text')
      expect(result?.templateId).toBe('extraction-default')
    })

    it('should render prompts with conditional blocks', async () => {
      setMockResult(null, new Error('err'))

      // Create a fresh template with conditional blocks to avoid shared-state issues
      const tpl = await createTemplate({
        name: 'Cond Test',
        description: '',
        category: 'other' as PromptCategory,
        systemPrompt: 'System {{#if ctx}}Context: {{ctx}}{{/if}}',
        userPromptTemplate: '{{msg}}',
        isActive: true,
        isDefault: true,
      })

      const result = await getRenderedPrompts(
        'other',
        { ctx: 'Kasko policy #12345', msg: 'What is covered?' },
        { templateId: tpl.id, useABTest: false }
      )

      expect(result).not.toBeNull()
      expect(result?.systemPrompt).toContain('Kasko policy #12345')
      expect(result?.userPrompt).toBe('What is covered?')
    })

    it('should handle falsy conditional blocks', async () => {
      setMockResult(null, new Error('err'))

      // Create a fresh template with conditional blocks
      const tpl = await createTemplate({
        name: 'Cond Falsy',
        description: '',
        category: 'other' as PromptCategory,
        systemPrompt: 'System {{#if ctx}}Hidden: {{ctx}}{{/if}} End',
        userPromptTemplate: '{{msg}}',
        isActive: true,
        isDefault: false,
      })

      const result = await getRenderedPrompts(
        'other',
        { msg: 'General question' },
        { templateId: tpl.id, useABTest: false }
      )

      expect(result).not.toBeNull()
      expect(result?.systemPrompt).not.toContain('Hidden:')
      expect(result?.userPrompt).toBe('General question')
    })

    it('should return null for nonexistent category default', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts('analysis', {})
      // No default template for 'analysis'
      expect(result).toBeNull()
    })

    it('should use specific versionId when provided', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts(
        'extraction',
        { document_text: 'doc' },
        { versionId: 'extraction-default-v1' }
      )

      expect(result).not.toBeNull()
      expect(result?.versionId).toBe('extraction-default-v1')
    })

    it('should return null for invalid versionId', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts(
        'extraction',
        {},
        { versionId: 'nonexistent-version' }
      )

      expect(result).toBeNull()
    })

    it('should use specific templateId when provided', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts(
        'chat',
        { user_message: 'hi' },
        { templateId: 'chat-default' }
      )

      expect(result).not.toBeNull()
      expect(result?.templateId).toBe('chat-default')
    })

    it('should return null for invalid templateId', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts(
        'chat',
        {},
        { templateId: 'nonexistent-template' }
      )

      expect(result).toBeNull()
    })

    it('should include abTestId when A/B test is active', async () => {
      setMockResult(null, new Error('err'))

      // Create a running A/B test for the ocr-correction-default template
      await createABTest({
        name: 'Render AB Test',
        description: '',
        templateId: 'ocr-correction-default',
        status: 'running',
        controlVersionId: 'ocr-correction-default-v1',
        treatmentVersionIds: [],
        trafficAllocation: { 'ocr-correction-default-v1': 100 },
        primaryMetric: 'success_rate',
        minSampleSize: 10,
      })

      const result = await getRenderedPrompts(
        'ocr',
        { ocr_text: 'test' },
        { templateId: 'ocr-correction-default' }
      )

      expect(result).not.toBeNull()
      expect(result?.abTestId).toBeTruthy()
    })

    it('should skip A/B test when useABTest is false', async () => {
      setMockResult(null, new Error('err'))

      const result = await getRenderedPrompts(
        'extraction',
        { document_text: 'doc' },
        { templateId: 'extraction-default', useABTest: false }
      )

      expect(result).not.toBeNull()
      expect(result?.abTestId).toBeUndefined()
    })
  })

  // ==========================================================================
  // DB MAPPING (mapTemplateFromDb, mapVersionFromDb, mapABTestFromDb)
  // ==========================================================================

  describe('DB Mapping', () => {
    it('should map template fields correctly from DB row', async () => {
      const row = dbTemplateRow({
        id: 'map-test',
        name: 'Mapped',
        description: 'A mapped template',
        category: 'chat',
        system_prompt: 'Sys prompt here',
        user_prompt_template: 'User prompt {{x}}',
        variables: ['x'],
        is_active: true,
        is_default: true,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-02T00:00:00Z',
        created_by: 'admin',
      })

      setMockResult(row)

      const result = await getTemplate('map-test')
      expect(result?.id).toBe('map-test')
      expect(result?.name).toBe('Mapped')
      expect(result?.description).toBe('A mapped template')
      expect(result?.category).toBe('chat')
      expect(result?.systemPrompt).toBe('Sys prompt here')
      expect(result?.userPromptTemplate).toBe('User prompt {{x}}')
      expect(result?.variables).toEqual(['x'])
      expect(result?.isActive).toBe(true)
      expect(result?.isDefault).toBe(true)
      expect(result?.createdAt).toBe('2026-02-01T00:00:00Z')
      expect(result?.updatedAt).toBe('2026-02-02T00:00:00Z')
      expect(result?.createdBy).toBe('admin')
    })

    it('should handle null variables from DB', async () => {
      setMockResult(dbTemplateRow({ variables: null }))

      const result = await getTemplate('tpl-null-vars')
      expect(result?.variables).toEqual([])
    })

    it('should map version fields correctly from DB row', async () => {
      const row = dbVersionRow({
        id: 'ver-map',
        template_id: 'tpl-map',
        version: 3,
        system_prompt: 'V3 sys',
        user_prompt_template: 'V3 user {{z}}',
        variables: ['z'],
        change_description: 'Third version',
        created_at: '2026-02-05T00:00:00Z',
        created_by: 'editor',
        usage_count: 42,
        success_count: 40,
        error_count: 2,
        avg_response_time: 750.5,
        avg_tokens_used: 300,
        avg_cost: 0.015,
      })

      setMockResult(row)

      const result = await getVersion('ver-map')
      expect(result?.id).toBe('ver-map')
      expect(result?.templateId).toBe('tpl-map')
      expect(result?.version).toBe(3)
      expect(result?.systemPrompt).toBe('V3 sys')
      expect(result?.userPromptTemplate).toBe('V3 user {{z}}')
      expect(result?.variables).toEqual(['z'])
      expect(result?.changeDescription).toBe('Third version')
      expect(result?.createdBy).toBe('editor')
      expect(result?.usageCount).toBe(42)
      expect(result?.successCount).toBe(40)
      expect(result?.errorCount).toBe(2)
      expect(result?.avgResponseTime).toBe(750.5)
      expect(result?.avgTokensUsed).toBe(300)
      expect(result?.avgCost).toBe(0.015)
    })

    it('should handle null variables in version from DB', async () => {
      setMockResult(dbVersionRow({ variables: null }))

      const result = await getVersion('ver-null')
      expect(result?.variables).toEqual([])
    })

    it('should map AB test fields correctly from DB row', async () => {
      const row = dbABTestRow({
        id: 'ab-map',
        name: 'Mapped AB',
        description: 'Test description',
        template_id: 'tpl-x',
        status: 'running',
        start_date: '2026-02-01',
        end_date: undefined,
        control_version_id: 'v-ctrl',
        treatment_version_ids: ['v-t1', 'v-t2'],
        traffic_allocation: { 'v-ctrl': 33, 'v-t1': 33, 'v-t2': 34 },
        primary_metric: 'cost',
        min_sample_size: 50,
        results: { totalSamples: 10, byVersion: {}, statisticallySignificant: false },
        created_at: '2026-01-15',
        updated_at: '2026-02-01',
        created_by: 'tester',
      })

      setMockResult(row)

      const result = await getABTest('ab-map')
      expect(result?.id).toBe('ab-map')
      expect(result?.name).toBe('Mapped AB')
      expect(result?.templateId).toBe('tpl-x')
      expect(result?.status).toBe('running')
      expect(result?.controlVersionId).toBe('v-ctrl')
      expect(result?.treatmentVersionIds).toEqual(['v-t1', 'v-t2'])
      expect(result?.trafficAllocation).toEqual({ 'v-ctrl': 33, 'v-t1': 33, 'v-t2': 34 })
      expect(result?.primaryMetric).toBe('cost')
      expect(result?.minSampleSize).toBe(50)
      expect(result?.results).toBeDefined()
      expect(result?.createdBy).toBe('tester')
    })

    it('should handle null treatment_version_ids from DB', async () => {
      setMockResult(dbABTestRow({ treatment_version_ids: null }))

      const result = await getABTest('ab-null')
      expect(result?.treatmentVersionIds).toEqual([])
    })

    it('should handle null traffic_allocation from DB', async () => {
      setMockResult(dbABTestRow({ traffic_allocation: null }))

      const result = await getABTest('ab-null-alloc')
      expect(result?.trafficAllocation).toEqual({})
    })
  })

  // ==========================================================================
  // DEFAULT INITIALIZATION
  // ==========================================================================

  describe('Default Initialization', () => {
    it('should have extraction-default template', async () => {
      setMockResult(null, new Error('err'))

      const tpl = await getTemplate('extraction-default')
      expect(tpl).not.toBeNull()
      expect(tpl?.name).toContain('Extraction')
      expect(tpl?.category).toBe('extraction')
      expect(tpl?.isActive).toBe(true)
      expect(tpl?.isDefault).toBe(true)
    })

    it('should have chat-default template', async () => {
      setMockResult(null, new Error('err'))

      const tpl = await getTemplate('chat-default')
      expect(tpl).not.toBeNull()
      expect(tpl?.name).toContain('Chat')
      expect(tpl?.category).toBe('chat')
    })

    it('should have ocr-correction-default template', async () => {
      setMockResult(null, new Error('err'))

      const tpl = await getTemplate('ocr-correction-default')
      expect(tpl).not.toBeNull()
      expect(tpl?.name).toContain('OCR')
      expect(tpl?.category).toBe('ocr')
    })

    it('should have initial versions for all default templates', async () => {
      setMockResult(null, new Error('err'))

      const extractionVersions = await getVersions('extraction-default')
      expect(extractionVersions.length).toBeGreaterThan(0)

      const chatVersions = await getVersions('chat-default')
      expect(chatVersions.length).toBeGreaterThan(0)

      const ocrVersions = await getVersions('ocr-correction-default')
      expect(ocrVersions.length).toBeGreaterThan(0)
    })

    it('extraction-default should recognize Turkish insurance terminology', async () => {
      setMockResult(null, new Error('err'))

      const tpl = await getTemplate('extraction-default')
      expect(tpl?.systemPrompt).toContain('Turkish')
      expect(tpl?.systemPrompt).toContain('Kasko')
      expect(tpl?.systemPrompt).toContain('DASK')
    })

    it('ocr-correction-default should list common OCR errors', async () => {
      setMockResult(null, new Error('err'))

      const tpl = await getTemplate('ocr-correction-default')
      expect(tpl?.systemPrompt).toContain('0/O confusion')
      expect(tpl?.systemPrompt).toContain('1/l/I confusion')
      expect(tpl?.systemPrompt).toContain('Turkish character')
    })
  })

  // ==========================================================================
  // DEFAULT EXPORT
  // ==========================================================================

  describe('Default Export', () => {
    it('should export all functions', async () => {
      const mod = await import('../middleware/prompt-versioning.js')
      const defaultExport = mod.default

      expect(defaultExport.getTemplates).toBe(getTemplates)
      expect(defaultExport.getTemplate).toBe(getTemplate)
      expect(defaultExport.getDefaultTemplate).toBe(getDefaultTemplate)
      expect(defaultExport.createTemplate).toBe(createTemplate)
      expect(defaultExport.updateTemplate).toBe(updateTemplate)
      expect(defaultExport.deleteTemplate).toBe(deleteTemplate)
      expect(defaultExport.getVersions).toBe(getVersions)
      expect(defaultExport.getVersion).toBe(getVersion)
      expect(defaultExport.getLatestVersion).toBe(getLatestVersion)
      expect(defaultExport.createVersion).toBe(createVersion)
      expect(defaultExport.rollbackToVersion).toBe(rollbackToVersion)
      expect(defaultExport.getABTests).toBe(getABTests)
      expect(defaultExport.getABTest).toBe(getABTest)
      expect(defaultExport.createABTest).toBe(createABTest)
      expect(defaultExport.updateABTestStatus).toBe(updateABTestStatus)
      expect(defaultExport.selectVersionForABTest).toBe(selectVersionForABTest)
      expect(defaultExport.calculateABTestResults).toBe(calculateABTestResults)
      expect(defaultExport.logPromptUsage).toBe(logPromptUsage)
      expect(defaultExport.getTemplateStats).toBe(getTemplateStats)
      expect(defaultExport.extractVariables).toBe(extractVariables)
      expect(defaultExport.renderPrompt).toBe(renderPrompt)
      expect(defaultExport.getRenderedPrompts).toBe(getRenderedPrompts)
    })
  })
})
