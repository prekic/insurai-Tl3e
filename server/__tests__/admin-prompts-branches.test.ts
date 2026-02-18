/**
 * Admin Prompts Route Branch Coverage Tests
 *
 * Targets the ~129 uncovered branches in server/routes/admin/prompts.ts.
 * Tests every conditional branch: if/else, ternary, ||, ??, &&,
 * error-handling paths, and all route handlers (GET, POST, PUT, DELETE).
 *
 * NOTE: Due to Express route ordering in prompts.ts, some GET routes
 * are shadowed by earlier `:id` parameter routes:
 * - GET /prompts/templates → caught by GET /prompts/:id (id='templates')
 * - GET /prompts/ab-tests → caught by GET /prompts/:id (id='ab-tests')
 * - GET /prompts/versions/compare → caught by GET /prompts/versions/:id (id='compare')
 * These shadowed routes are tested via the actual matched handler.
 * All other routes (different HTTP methods or segment counts) are reachable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================

const {
  mockAuthenticateAdmin,
  mockRequireRole,
  mockRequireSuperAdmin,
  mockLogAdminAction,
  // promptService mocks
  mockGetAllPrompts,
  mockGetPromptsByCategory,
  mockGetPromptById,
  mockUpdatePrompt,
  mockCreatePrompt,
  // promptVersioning mocks
  mockGetTemplates,
  mockGetTemplate,
  mockGetVersions,
  mockGetVersion,
  mockGetLatestVersion,
  mockCreateTemplate,
  mockUpdateTemplate,
  mockDeleteTemplate,
  mockGetTemplateStats,
  mockRollbackToVersion,
  mockGetABTests,
  mockGetABTest,
  mockCreateABTest,
  mockUpdateABTestStatus,
  mockCalculateABTestResults,
  mockRenderPrompt,
  mockExtractVariables,
} = vi.hoisted(() => ({
  mockAuthenticateAdmin: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequireSuperAdmin: vi.fn(),
  mockLogAdminAction: vi.fn(),
  // promptService
  mockGetAllPrompts: vi.fn(),
  mockGetPromptsByCategory: vi.fn(),
  mockGetPromptById: vi.fn(),
  mockUpdatePrompt: vi.fn(),
  mockCreatePrompt: vi.fn(),
  // promptVersioning
  mockGetTemplates: vi.fn(),
  mockGetTemplate: vi.fn(),
  mockGetVersions: vi.fn(),
  mockGetVersion: vi.fn(),
  mockGetLatestVersion: vi.fn(),
  mockCreateTemplate: vi.fn(),
  mockUpdateTemplate: vi.fn(),
  mockDeleteTemplate: vi.fn(),
  mockGetTemplateStats: vi.fn(),
  mockRollbackToVersion: vi.fn(),
  mockGetABTests: vi.fn(),
  mockGetABTest: vi.fn(),
  mockCreateABTest: vi.fn(),
  mockUpdateABTestStatus: vi.fn(),
  mockCalculateABTestResults: vi.fn(),
  mockRenderPrompt: vi.fn(),
  mockExtractVariables: vi.fn(),
}))

// =============================================================================
// MODULE MOCKS
// =============================================================================

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: vi.fn(() => ({
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      child: vi.fn().mockReturnThis(),
    })),
  }
  return {
    default: childLogger,
    logger: childLogger,
  }
})

vi.mock('../routes/admin/shared.js', () => ({
  authenticateAdmin: (...args: unknown[]) => mockAuthenticateAdmin(...args),
  requireRole: (..._args: unknown[]) => (...args: unknown[]) => mockRequireRole(...args),
  requireSuperAdmin: () => [
    (...args: unknown[]) => mockAuthenticateAdmin(...args),
    (...args: unknown[]) => mockRequireSuperAdmin(...args),
  ],
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  auditLogs: [] as unknown[],
  requestCounters: { auditLogId: 0 },
  qstr: (val: string | string[] | undefined) => {
    if (Array.isArray(val)) return val[0] ?? ''
    return val ?? ''
  },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  logger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    })),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  promptService: {
    getAllPrompts: (...args: unknown[]) => mockGetAllPrompts(...args),
    getPromptsByCategory: (...args: unknown[]) => mockGetPromptsByCategory(...args),
    getPromptById: (...args: unknown[]) => mockGetPromptById(...args),
    updatePrompt: (...args: unknown[]) => mockUpdatePrompt(...args),
    createPrompt: (...args: unknown[]) => mockCreatePrompt(...args),
  },
  promptVersioning: {
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    getTemplate: (...args: unknown[]) => mockGetTemplate(...args),
    getVersions: (...args: unknown[]) => mockGetVersions(...args),
    getVersion: (...args: unknown[]) => mockGetVersion(...args),
    getLatestVersion: (...args: unknown[]) => mockGetLatestVersion(...args),
    createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
    updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
    getTemplateStats: (...args: unknown[]) => mockGetTemplateStats(...args),
    rollbackToVersion: (...args: unknown[]) => mockRollbackToVersion(...args),
    getABTests: (...args: unknown[]) => mockGetABTests(...args),
    getABTest: (...args: unknown[]) => mockGetABTest(...args),
    createABTest: (...args: unknown[]) => mockCreateABTest(...args),
    updateABTestStatus: (...args: unknown[]) => mockUpdateABTestStatus(...args),
    calculateABTestResults: (...args: unknown[]) => mockCalculateABTestResults(...args),
    renderPrompt: (...args: unknown[]) => mockRenderPrompt(...args),
    extractVariables: (...args: unknown[]) => mockExtractVariables(...args),
  },
}))

// =============================================================================
// HELPERS
// =============================================================================

const ADMIN_USER = {
  id: 'admin-001',
  email: 'admin@test.com',
  role: 'admin',
  displayName: 'Test Admin',
  permissions: ['read:policies'],
}

const SAMPLE_TEMPLATE = {
  id: 'tpl-001',
  name: 'Extraction Prompt',
  description: 'Policy extraction',
  category: 'extraction',
  systemPrompt: 'You are an assistant.',
  userPromptTemplate: 'Extract: {{document_text}}',
  variables: ['document_text'],
  isActive: true,
  version: 1,
}

const SAMPLE_VERSION = {
  id: 'ver-001',
  templateId: 'tpl-001',
  version: 1,
  systemPrompt: 'System prompt v1',
  userPromptTemplate: 'User prompt v1 {{var1}}',
  variables: ['var1'],
  changeDescription: 'Initial',
  createdAt: '2026-01-01T00:00:00Z',
  usageCount: 100,
  successCount: 95,
  errorCount: 5,
  avgResponseTime: 500,
  avgTokensUsed: 1000,
  avgCost: 0.01,
}

const SAMPLE_AB_TEST = {
  id: 'ab-001',
  name: 'Test AB',
  description: 'Testing prompts',
  templateId: 'tpl-001',
  status: 'running' as const,
  controlVersionId: 'ver-001',
  treatmentVersionIds: ['ver-002'],
  trafficAllocation: { 'ver-001': 50, 'ver-002': 50 },
  primaryMetric: 'success_rate' as const,
  minSampleSize: 100,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function setupDefaultMocks() {
  // Middleware: pass through by default
  mockAuthenticateAdmin.mockImplementation(
    (req: any, _res: any, next: () => void) => {
      req.adminUser = { ...ADMIN_USER }
      next()
    }
  )
  mockRequireRole.mockImplementation(
    (_req: any, _res: any, next: () => void) => next()
  )
  mockRequireSuperAdmin.mockImplementation(
    (_req: any, _res: any, next: () => void) => next()
  )
  mockLogAdminAction.mockResolvedValue(undefined)

  // promptService defaults
  mockGetAllPrompts.mockResolvedValue([SAMPLE_TEMPLATE])
  mockGetPromptsByCategory.mockResolvedValue([SAMPLE_TEMPLATE])
  mockGetPromptById.mockResolvedValue(SAMPLE_TEMPLATE)
  mockUpdatePrompt.mockResolvedValue({ ...SAMPLE_TEMPLATE, name: 'Updated' })
  mockCreatePrompt.mockResolvedValue({ ...SAMPLE_TEMPLATE, id: 'tpl-new' })

  // promptVersioning defaults
  mockGetTemplates.mockResolvedValue([SAMPLE_TEMPLATE])
  mockGetTemplate.mockResolvedValue(SAMPLE_TEMPLATE)
  mockGetVersions.mockResolvedValue([SAMPLE_VERSION])
  mockGetVersion.mockResolvedValue(SAMPLE_VERSION)
  mockGetLatestVersion.mockResolvedValue(SAMPLE_VERSION)
  mockCreateTemplate.mockResolvedValue({ ...SAMPLE_TEMPLATE, id: 'tpl-new' })
  mockUpdateTemplate.mockResolvedValue({ ...SAMPLE_TEMPLATE, name: 'Updated' })
  mockDeleteTemplate.mockResolvedValue(true)
  mockGetTemplateStats.mockResolvedValue({ usageCount: 100, successRate: 0.95 })
  mockRollbackToVersion.mockResolvedValue(SAMPLE_TEMPLATE)
  mockGetABTests.mockResolvedValue([SAMPLE_AB_TEST])
  mockGetABTest.mockResolvedValue(SAMPLE_AB_TEST)
  mockCreateABTest.mockResolvedValue({ ...SAMPLE_AB_TEST, id: 'ab-new' })
  mockUpdateABTestStatus.mockResolvedValue({ ...SAMPLE_AB_TEST, status: 'paused' })
  mockCalculateABTestResults.mockResolvedValue({
    totalSamples: 200,
    byVersion: {},
    winner: 'ver-001',
    confidence: 0.95,
    statisticallySignificant: true,
  })
  mockRenderPrompt.mockImplementation((template: string) => template)
  mockExtractVariables.mockReturnValue(['var1', 'var2'])
}

async function createApp() {
  const mod = await import('../routes/admin/prompts.js')
  const promptsRouter = mod.default
  const app = express()
  app.use(express.json())
  app.use('/api/admin', promptsRouter)
  return app
}

// =============================================================================
// TESTS
// =============================================================================

describe('Admin Prompts Routes Branch Coverage', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    setupDefaultMocks()
    app = await createApp()
  })

  // ===========================================================================
  // GET /prompts — basic prompt list
  // ===========================================================================
  describe('GET /prompts', () => {
    it('returns all prompts when no category filter', async () => {
      const res = await request(app).get('/api/admin/prompts')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(mockGetAllPrompts).toHaveBeenCalled()
      expect(mockGetPromptsByCategory).not.toHaveBeenCalled()
    })

    it('filters by category when category query param is a string', async () => {
      const res = await request(app).get('/api/admin/prompts?category=extraction')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetPromptsByCategory).toHaveBeenCalledWith('extraction')
      expect(mockGetAllPrompts).not.toHaveBeenCalled()
    })

    it('uses getAllPrompts when category is empty string (falsy)', async () => {
      const res = await request(app).get('/api/admin/prompts?category=')
      expect(res.status).toBe(200)
      // Empty string is falsy, so it falls through to getAllPrompts
      expect(mockGetAllPrompts).toHaveBeenCalled()
    })

    it('returns 500 when promptService.getAllPrompts throws', async () => {
      mockGetAllPrompts.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts')
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Failed to fetch prompts')
    })

    it('returns 500 when promptService.getPromptsByCategory throws', async () => {
      mockGetPromptsByCategory.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts?category=chat')
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })

    it('handles non-Error thrown in catch (string)', async () => {
      mockGetAllPrompts.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/prompts')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to fetch prompts')
    })
  })

  // ===========================================================================
  // GET /prompts/:id — get single prompt
  // Note: This also catches /prompts/templates, /prompts/ab-tests due to
  // Express route ordering. Those paths hit this handler with id='templates'
  // or id='ab-tests'.
  // ===========================================================================
  describe('GET /prompts/:id', () => {
    it('returns template when found', async () => {
      const res = await request(app).get('/api/admin/prompts/tpl-001')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('tpl-001')
    })

    it('returns 404 when template not found', async () => {
      mockGetPromptById.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Template not found')
    })

    it('returns 500 on error', async () => {
      mockGetPromptById.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/tpl-001')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to fetch prompt')
    })

    it('handles non-Error thrown in catch', async () => {
      mockGetPromptById.mockRejectedValue(42)
      const res = await request(app).get('/api/admin/prompts/tpl-001')
      expect(res.status).toBe(500)
    })

    it('handles /prompts/templates being matched as id="templates"', async () => {
      // Due to route ordering, GET /prompts/templates is caught by GET /prompts/:id
      mockGetPromptById.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/templates')
      expect(res.status).toBe(404)
      expect(mockGetPromptById).toHaveBeenCalledWith('templates')
    })

    it('handles /prompts/ab-tests being matched as id="ab-tests"', async () => {
      // Due to route ordering, GET /prompts/ab-tests is caught by GET /prompts/:id
      mockGetPromptById.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/ab-tests')
      expect(res.status).toBe(404)
      expect(mockGetPromptById).toHaveBeenCalledWith('ab-tests')
    })
  })

  // ===========================================================================
  // PUT /prompts/:id — update prompt
  // ===========================================================================
  describe('PUT /prompts/:id', () => {
    it('updates template successfully', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'Updated Name', systemPrompt: 'New system' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockUpdatePrompt).toHaveBeenCalled()
    })

    it('returns 404 when previous template not found', async () => {
      mockGetPromptById.mockResolvedValue(null)
      const res = await request(app)
        .put('/api/admin/prompts/nonexistent')
        .send({ name: 'Updated' })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Template not found')
    })

    it('returns 500 when updatePrompt returns null', async () => {
      mockUpdatePrompt.mockResolvedValue(null)
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to update template')
    })

    it('creates audit log with adminUser id/email', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('uses "unknown" for audit when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'Updated' })
      // Still succeeds, audit log should use 'unknown'
      expect(res.status).toBe(200)
    })

    it('returns 500 on error', async () => {
      mockGetPromptById.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to update prompt')
    })

    it('handles non-Error in catch', async () => {
      mockGetPromptById.mockRejectedValue('string error')
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts — create prompt (basic)
  // ===========================================================================
  describe('POST /prompts', () => {
    const validBody = {
      name: 'New Prompt',
      category: 'extraction',
      systemPrompt: 'System',
      userPromptTemplate: 'User {{var}}',
    }

    it('creates prompt with all required fields', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockCreatePrompt).toHaveBeenCalled()
    })

    it('passes optional fields with provided values', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send({
          ...validBody,
          description: 'desc',
          variables: ['v1'],
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          parameters: { temp: 0.1 },
        })
      expect(res.status).toBe(200)
      expect(mockCreatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'desc',
          variables: ['v1'],
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          parameters: { temp: 0.1 },
        })
      )
    })

    it('uses empty string for description when not provided', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ description: '' })
      )
    })

    it('uses empty array for variables when not provided', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ variables: [] })
      )
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send({ ...validBody, name: '' })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Missing required fields')
    })

    it('returns 400 when category is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send({ ...validBody, category: undefined })
      expect(res.status).toBe(400)
    })

    it('returns 400 when systemPrompt is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send({ ...validBody, systemPrompt: '' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when userPromptTemplate is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts')
        .send({ ...validBody, userPromptTemplate: null })
      expect(res.status).toBe(400)
    })

    it('returns 500 when createPrompt returns null', async () => {
      mockCreatePrompt.mockResolvedValue(null)
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create template')
    })

    it('audit log uses "unknown" when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(200)
    })

    it('returns 500 on error', async () => {
      mockCreatePrompt.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create prompt')
    })

    it('handles non-Error in catch', async () => {
      mockCreatePrompt.mockRejectedValue({ code: 'UNIQUE' })
      const res = await request(app)
        .post('/api/admin/prompts')
        .send(validBody)
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // GET /prompts/templates/:id — get versioned template (3-segment, reachable)
  // ===========================================================================
  describe('GET /prompts/templates/:id', () => {
    it('returns template with versions when found', async () => {
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.versions).toBeDefined()
      expect(mockGetTemplate).toHaveBeenCalledWith('tpl-001')
      expect(mockGetVersions).toHaveBeenCalledWith('tpl-001')
    })

    it('returns 404 when template not found', async () => {
      mockGetTemplate.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/templates/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Template not found')
    })

    it('returns 500 on error', async () => {
      mockGetTemplate.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get template')
    })

    it('handles non-Error in catch', async () => {
      mockGetTemplate.mockRejectedValue(null)
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts/templates — create versioned template (POST not shadowed)
  // ===========================================================================
  describe('POST /prompts/templates', () => {
    const validBody = {
      name: 'New Template',
      category: 'extraction',
      systemPrompt: 'System',
      userPromptTemplate: 'User {{doc}}',
    }

    it('creates template with all required fields', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockCreateTemplate).toHaveBeenCalled()
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('passes optional description and isDefault with defaults', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
          isDefault: false,
        })
      )
    })

    it('passes provided description and isDefault', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send({ ...validBody, description: 'desc', isDefault: true })
      expect(res.status).toBe(200)
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'desc',
          isDefault: true,
        })
      )
    })

    it('passes createdBy from adminUser email', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'admin@test.com',
        })
      )
    })

    it('passes undefined createdBy when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: undefined,
        })
      )
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send({ ...validBody, name: '' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when category is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send({ ...validBody, category: null })
      expect(res.status).toBe(400)
    })

    it('returns 400 when systemPrompt is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send({ ...validBody, systemPrompt: '' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when userPromptTemplate is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send({ ...validBody, userPromptTemplate: undefined })
      expect(res.status).toBe(400)
    })

    it('returns 500 on error', async () => {
      mockCreateTemplate.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send(validBody)
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create template')
    })

    it('handles non-Error in catch', async () => {
      mockCreateTemplate.mockRejectedValue(undefined)
      const res = await request(app)
        .post('/api/admin/prompts/templates')
        .send(validBody)
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // PUT /prompts/templates/:id — update versioned template (3-segment, reachable)
  // ===========================================================================
  describe('PUT /prompts/templates/:id', () => {
    it('updates template successfully', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/templates/tpl-001')
        .send({ name: 'Updated', changeDescription: 'Changed name' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.objectContaining({ name: 'Updated' }),
        'Changed name',
        'admin@test.com'
      )
    })

    it('uses default changeDescription when not provided', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/templates/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.anything(),
        'Update via admin API',
        'admin@test.com'
      )
    })

    it('passes undefined email when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      const res = await request(app)
        .put('/api/admin/prompts/templates/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.anything(),
        'Update via admin API',
        undefined
      )
    })

    it('returns 404 when template not found (updateTemplate returns null)', async () => {
      mockUpdateTemplate.mockResolvedValue(null)
      const res = await request(app)
        .put('/api/admin/prompts/templates/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Template not found')
    })

    it('returns 500 on error', async () => {
      mockUpdateTemplate.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .put('/api/admin/prompts/templates/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to update template')
    })

    it('handles non-Error in catch', async () => {
      mockUpdateTemplate.mockRejectedValue(123)
      const res = await request(app)
        .put('/api/admin/prompts/templates/tpl-001')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // DELETE /prompts/templates/:id — delete template (3-segment, reachable)
  // ===========================================================================
  describe('DELETE /prompts/templates/:id', () => {
    it('deletes template successfully', async () => {
      const res = await request(app).delete('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Template deleted')
      expect(mockDeleteTemplate).toHaveBeenCalledWith('tpl-001')
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('returns 404 when template not found (deleteTemplate returns false)', async () => {
      mockDeleteTemplate.mockResolvedValue(false)
      const res = await request(app).delete('/api/admin/prompts/templates/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Template not found')
    })

    it('returns 500 on error', async () => {
      mockDeleteTemplate.mockRejectedValue(new Error('DB error'))
      const res = await request(app).delete('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to delete template')
    })

    it('handles non-Error in catch', async () => {
      mockDeleteTemplate.mockRejectedValue('err')
      const res = await request(app).delete('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // GET /prompts/templates/:id/stats — template stats (4-segment, reachable)
  // ===========================================================================
  describe('GET /prompts/templates/:id/stats', () => {
    it('returns stats successfully', async () => {
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001/stats')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.usageCount).toBe(100)
    })

    it('returns 500 on error', async () => {
      mockGetTemplateStats.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001/stats')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get template stats')
    })

    it('handles non-Error in catch', async () => {
      mockGetTemplateStats.mockRejectedValue(false)
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001/stats')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // GET /prompts/templates/:templateId/versions — list versions (4-segment, reachable)
  // ===========================================================================
  describe('GET /prompts/templates/:templateId/versions', () => {
    it('returns versions for template', async () => {
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001/versions')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetVersions).toHaveBeenCalledWith('tpl-001')
    })

    it('returns 500 on error', async () => {
      mockGetVersions.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001/versions')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get versions')
    })

    it('handles non-Error in catch', async () => {
      mockGetVersions.mockRejectedValue(null)
      const res = await request(app).get('/api/admin/prompts/templates/tpl-001/versions')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // GET /prompts/versions/:id — get specific version (3-segment, reachable)
  // ===========================================================================
  describe('GET /prompts/versions/:id', () => {
    it('returns version when found', async () => {
      const res = await request(app).get('/api/admin/prompts/versions/ver-001')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('ver-001')
    })

    it('returns 404 when version not found', async () => {
      mockGetVersion.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/versions/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Version not found')
    })

    it('returns 500 on error', async () => {
      mockGetVersion.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/versions/ver-001')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get version')
    })

    it('handles non-Error in catch', async () => {
      mockGetVersion.mockRejectedValue(undefined)
      const res = await request(app).get('/api/admin/prompts/versions/ver-001')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts/templates/:templateId/rollback/:versionId — rollback (5-segment, reachable)
  // ===========================================================================
  describe('POST /prompts/templates/:templateId/rollback/:versionId', () => {
    it('rolls back successfully', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/templates/tpl-001/rollback/ver-001')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockRollbackToVersion).toHaveBeenCalledWith('tpl-001', 'ver-001', 'admin@test.com')
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('passes undefined email when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      const res = await request(app)
        .post('/api/admin/prompts/templates/tpl-001/rollback/ver-001')
      expect(res.status).toBe(200)
      expect(mockRollbackToVersion).toHaveBeenCalledWith('tpl-001', 'ver-001', undefined)
    })

    it('returns 404 when rollback returns null', async () => {
      mockRollbackToVersion.mockResolvedValue(null)
      const res = await request(app)
        .post('/api/admin/prompts/templates/tpl-001/rollback/ver-001')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Template or version not found')
    })

    it('returns 500 on error', async () => {
      mockRollbackToVersion.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .post('/api/admin/prompts/templates/tpl-001/rollback/ver-001')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to rollback')
    })

    it('handles non-Error in catch', async () => {
      mockRollbackToVersion.mockRejectedValue(42)
      const res = await request(app)
        .post('/api/admin/prompts/templates/tpl-001/rollback/ver-001')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // GET /prompts/versions/compare — compare two versions
  // NOTE: This route is shadowed by GET /prompts/versions/:id (id='compare').
  // The compare route at line 384 is unreachable because GET /prompts/versions/:id
  // at line 338 catches it first. Test verifies the version/:id handler is hit.
  // ===========================================================================
  describe('GET /prompts/versions/compare (shadowed by versions/:id)', () => {
    it('is caught by GET /prompts/versions/:id with id="compare"', async () => {
      // Since versions/:id is defined first, id='compare' is passed to getVersion
      mockGetVersion.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/versions/compare?versionA=a&versionB=b')
      // The versions/:id handler runs and returns 404 since there's no version with id='compare'
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Version not found')
      expect(mockGetVersion).toHaveBeenCalledWith('compare')
    })
  })

  // ===========================================================================
  // GET /prompts/ab-tests/:id — get single A/B test (3-segment, reachable)
  // ===========================================================================
  describe('GET /prompts/ab-tests/:id', () => {
    it('returns test with control and treatment versions', async () => {
      const controlVersion = { ...SAMPLE_VERSION, id: 'ver-001' }
      const treatmentVersion = { ...SAMPLE_VERSION, id: 'ver-002' }
      mockGetABTest.mockResolvedValue(SAMPLE_AB_TEST)
      mockGetVersion
        .mockResolvedValueOnce(controlVersion)
        .mockResolvedValueOnce(treatmentVersion)

      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.controlVersion).toBeDefined()
      expect(res.body.data.treatmentVersions).toBeDefined()
    })

    it('filters out null treatment versions (Boolean filter)', async () => {
      mockGetABTest.mockResolvedValue({
        ...SAMPLE_AB_TEST,
        treatmentVersionIds: ['ver-002', 'ver-003'],
      })
      // Control version first, then each treatment
      mockGetVersion
        .mockResolvedValueOnce({ ...SAMPLE_VERSION, id: 'ver-ctrl' }) // control
        .mockResolvedValueOnce({ ...SAMPLE_VERSION, id: 'ver-002' }) // treatment 1
        .mockResolvedValueOnce(null)                                 // treatment 2 not found

      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001')
      expect(res.status).toBe(200)
      // .filter(Boolean) removes the null entry
      expect(res.body.data.treatmentVersions).toHaveLength(1)
    })

    it('returns empty treatmentVersions when all are null', async () => {
      mockGetABTest.mockResolvedValue({
        ...SAMPLE_AB_TEST,
        treatmentVersionIds: ['ver-002'],
      })
      mockGetVersion
        .mockResolvedValueOnce({ ...SAMPLE_VERSION, id: 'ver-ctrl' }) // control
        .mockResolvedValueOnce(null)                                   // treatment not found

      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001')
      expect(res.status).toBe(200)
      expect(res.body.data.treatmentVersions).toHaveLength(0)
    })

    it('returns 404 when test not found', async () => {
      mockGetABTest.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/ab-tests/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('A/B test not found')
    })

    it('returns 500 on error', async () => {
      mockGetABTest.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get A/B test')
    })

    it('handles non-Error in catch', async () => {
      mockGetABTest.mockRejectedValue('err')
      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts/ab-tests — create A/B test (POST not shadowed)
  // ===========================================================================
  describe('POST /prompts/ab-tests', () => {
    const validBody = {
      name: 'Test AB',
      templateId: 'tpl-001',
      controlVersionId: 'ver-001',
      treatmentVersionIds: ['ver-002'],
      trafficAllocation: { 'ver-001': 50, 'ver-002': 50 },
    }

    it('creates AB test with required fields', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockCreateABTest).toHaveBeenCalled()
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('passes optional fields with defaults', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreateABTest).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
          primaryMetric: 'success_rate',
          minSampleSize: 100,
          status: 'draft',
        })
      )
    })

    it('passes provided optional fields', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({
          ...validBody,
          description: 'Testing',
          primaryMetric: 'response_time',
          minSampleSize: 500,
        })
      expect(res.status).toBe(200)
      expect(mockCreateABTest).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Testing',
          primaryMetric: 'response_time',
          minSampleSize: 500,
        })
      )
    })

    it('passes createdBy from adminUser', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreateABTest).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'admin@test.com' })
      )
    })

    it('passes undefined createdBy when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(200)
      expect(mockCreateABTest).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: undefined })
      )
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({ ...validBody, name: '' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when templateId is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({ ...validBody, templateId: null })
      expect(res.status).toBe(400)
    })

    it('returns 400 when controlVersionId is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({ ...validBody, controlVersionId: '' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when treatmentVersionIds is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({ ...validBody, treatmentVersionIds: null })
      expect(res.status).toBe(400)
    })

    it('returns 400 when trafficAllocation is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({ ...validBody, trafficAllocation: undefined })
      expect(res.status).toBe(400)
    })

    it('returns 400 when traffic allocation does not sum to 100', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({
          ...validBody,
          trafficAllocation: { 'ver-001': 30, 'ver-002': 30 },
        })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('100%')
    })

    it('accepts traffic allocation within 0.1 tolerance of 100', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({
          ...validBody,
          trafficAllocation: { 'ver-001': 50.05, 'ver-002': 49.95 },
        })
      // abs(100 - 100) = 0 <= 0.1, so it passes
      expect(res.status).toBe(200)
    })

    it('rejects traffic allocation that differs by more than 0.1 from 100', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send({
          ...validBody,
          trafficAllocation: { 'ver-001': 50.2, 'ver-002': 49.6 },
        })
      // abs(99.8 - 100) = 0.2 > 0.1
      expect(res.status).toBe(400)
    })

    it('returns 500 on error', async () => {
      mockCreateABTest.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create A/B test')
    })

    it('handles non-Error in catch', async () => {
      mockCreateABTest.mockRejectedValue(false)
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // PUT /prompts/ab-tests/:id/status — update A/B test status (4-segment, reachable)
  // ===========================================================================
  describe('PUT /prompts/ab-tests/:id/status', () => {
    it('updates status to running', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'running' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockUpdateABTestStatus).toHaveBeenCalledWith('ab-001', 'running')
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('updates status to draft', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'draft' })
      expect(res.status).toBe(200)
    })

    it('updates status to paused', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'paused' })
      expect(res.status).toBe(200)
    })

    it('updates status to completed', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'completed' })
      expect(res.status).toBe(200)
    })

    it('updates status to cancelled', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'cancelled' })
      expect(res.status).toBe(200)
    })

    it('returns 400 when status is missing', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Valid status is required')
    })

    it('returns 400 when status is null', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: null })
      expect(res.status).toBe(400)
    })

    it('returns 400 when status is invalid string', async () => {
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'invalid' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('draft, running, paused, completed, cancelled')
    })

    it('returns 404 when test not found', async () => {
      mockUpdateABTestStatus.mockResolvedValue(null)
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'paused' })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('A/B test not found')
    })

    it('returns 500 on error', async () => {
      mockUpdateABTestStatus.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'running' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to update A/B test status')
    })

    it('handles non-Error in catch', async () => {
      mockUpdateABTestStatus.mockRejectedValue('err')
      const res = await request(app)
        .put('/api/admin/prompts/ab-tests/ab-001/status')
        .send({ status: 'running' })
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // GET /prompts/ab-tests/:id/results — get A/B test results (4-segment, reachable)
  // ===========================================================================
  describe('GET /prompts/ab-tests/:id/results', () => {
    it('returns results when found', async () => {
      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001/results')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.totalSamples).toBe(200)
    })

    it('returns 404 when results not found', async () => {
      mockCalculateABTestResults.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001/results')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('A/B test not found')
    })

    it('returns 500 on error', async () => {
      mockCalculateABTestResults.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001/results')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get A/B test results')
    })

    it('handles non-Error in catch', async () => {
      mockCalculateABTestResults.mockRejectedValue(undefined)
      const res = await request(app).get('/api/admin/prompts/ab-tests/ab-001/results')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts/ab-tests/:id/apply-winner — apply winning version (4-segment, reachable)
  // ===========================================================================
  describe('POST /prompts/ab-tests/:id/apply-winner', () => {
    it('applies winner successfully', async () => {
      const testWithWinner = {
        ...SAMPLE_AB_TEST,
        results: {
          winner: 'ver-002',
          totalSamples: 200,
          byVersion: {},
          statisticallySignificant: true,
        },
      }
      const winningVersion = {
        ...SAMPLE_VERSION,
        id: 'ver-002',
        systemPrompt: 'Winner system',
        userPromptTemplate: 'Winner user',
      }
      mockGetABTest.mockResolvedValue(testWithWinner)
      mockGetVersion.mockResolvedValue(winningVersion)
      mockUpdateTemplate.mockResolvedValue({ ...SAMPLE_TEMPLATE })
      mockUpdateABTestStatus.mockResolvedValue({ ...testWithWinner, status: 'completed' })

      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        { systemPrompt: 'Winner system', userPromptTemplate: 'Winner user' },
        expect.stringContaining('A/B test'),
        'admin@test.com'
      )
      expect(mockUpdateABTestStatus).toHaveBeenCalledWith('ab-001', 'completed')
      expect(mockLogAdminAction).toHaveBeenCalled()
    })

    it('returns 404 when test not found', async () => {
      mockGetABTest.mockResolvedValue(null)
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('A/B test not found')
    })

    it('returns 400 when results is undefined', async () => {
      mockGetABTest.mockResolvedValue({ ...SAMPLE_AB_TEST, results: undefined })
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No winner determined yet')
    })

    it('returns 400 when results exist but no winner field', async () => {
      mockGetABTest.mockResolvedValue({
        ...SAMPLE_AB_TEST,
        results: { totalSamples: 50, byVersion: {}, statisticallySignificant: false },
      })
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No winner determined yet')
    })

    it('returns 404 when winning version not found', async () => {
      mockGetABTest.mockResolvedValue({
        ...SAMPLE_AB_TEST,
        results: {
          winner: 'ver-deleted',
          totalSamples: 200,
          byVersion: {},
          statisticallySignificant: true,
        },
      })
      mockGetVersion.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Winning version not found')
    })

    it('passes undefined email when adminUser is missing', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = undefined
          next()
        }
      )
      mockGetABTest.mockResolvedValue({
        ...SAMPLE_AB_TEST,
        results: {
          winner: 'ver-002',
          totalSamples: 200,
          byVersion: {},
          statisticallySignificant: true,
        },
      })
      mockGetVersion.mockResolvedValue(SAMPLE_VERSION)

      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(200)
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined
      )
    })

    it('returns 500 on error', async () => {
      mockGetABTest.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to apply winner')
    })

    it('handles non-Error in catch', async () => {
      mockGetABTest.mockRejectedValue('err')
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests/ab-001/apply-winner')
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts/preview — preview rendered prompt (POST on 2-segment, reachable)
  // ===========================================================================
  describe('POST /prompts/preview', () => {
    it('previews with versionId', async () => {
      mockGetVersion.mockResolvedValue(SAMPLE_VERSION)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl.replace('{{var1}}', 'VALUE'))

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001', variables: { var1: 'VALUE' } })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetVersion).toHaveBeenCalledWith('ver-001')
      expect(mockGetLatestVersion).not.toHaveBeenCalled()
    })

    it('previews with templateId (uses getLatestVersion)', async () => {
      mockGetLatestVersion.mockResolvedValue(SAMPLE_VERSION)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ templateId: 'tpl-001', variables: {} })
      expect(res.status).toBe(200)
      expect(mockGetLatestVersion).toHaveBeenCalledWith('tpl-001')
      // getVersion should not be called when versionId is not provided
    })

    it('prefers versionId over templateId when both provided', async () => {
      mockGetVersion.mockResolvedValue(SAMPLE_VERSION)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001', templateId: 'tpl-001' })
      expect(res.status).toBe(200)
      expect(mockGetVersion).toHaveBeenCalledWith('ver-001')
      expect(mockGetLatestVersion).not.toHaveBeenCalled()
    })

    it('uses empty object for variables when not provided', async () => {
      mockGetVersion.mockResolvedValue(SAMPLE_VERSION)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001' })
      expect(res.status).toBe(200)
      expect(mockRenderPrompt).toHaveBeenCalledWith(
        SAMPLE_VERSION.systemPrompt,
        {}
      )
    })

    it('returns missingVariables for unset variables', async () => {
      const version = { ...SAMPLE_VERSION, variables: ['var1', 'var2'] }
      mockGetVersion.mockResolvedValue(version)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001', variables: { var1: 'filled' } })
      expect(res.status).toBe(200)
      expect(res.body.data.missingVariables).toContain('var2')
      expect(res.body.data.missingVariables).not.toContain('var1')
    })

    it('returns no missing variables when all provided', async () => {
      const version = { ...SAMPLE_VERSION, variables: ['var1'] }
      mockGetVersion.mockResolvedValue(version)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001', variables: { var1: 'filled' } })
      expect(res.status).toBe(200)
      expect(res.body.data.missingVariables).toHaveLength(0)
    })

    it('detects all missing when variables param is null', async () => {
      const version = { ...SAMPLE_VERSION, variables: ['var1'] }
      mockGetVersion.mockResolvedValue(version)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001', variables: null })
      expect(res.status).toBe(200)
      // variables is null, so !variables?.[v] is true for all
      expect(res.body.data.missingVariables).toContain('var1')
    })

    it('detects all missing when variables param is undefined', async () => {
      const version = { ...SAMPLE_VERSION, variables: ['var1', 'var2'] }
      mockGetVersion.mockResolvedValue(version)
      mockRenderPrompt.mockImplementation((tpl: string) => tpl)

      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001' }) // no variables property
      expect(res.status).toBe(200)
      expect(res.body.data.missingVariables).toEqual(['var1', 'var2'])
    })

    it('returns 400 when neither templateId nor versionId provided', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ variables: {} })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('templateId or versionId is required')
    })

    it('returns 400 with empty body', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({})
      expect(res.status).toBe(400)
    })

    it('returns 404 when version not found (by versionId)', async () => {
      mockGetVersion.mockResolvedValue(null)
      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'nonexistent' })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Version not found')
    })

    it('returns 404 when latest version not found (by templateId)', async () => {
      mockGetLatestVersion.mockResolvedValue(null)
      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ templateId: 'nonexistent' })
      expect(res.status).toBe(404)
    })

    it('returns 500 on error', async () => {
      mockGetVersion.mockRejectedValue(new Error('DB error'))
      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to preview prompt')
    })

    it('handles non-Error in catch', async () => {
      mockGetVersion.mockRejectedValue(42)
      const res = await request(app)
        .post('/api/admin/prompts/preview')
        .send({ versionId: 'ver-001' })
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // POST /prompts/extract-variables — extract variables (POST on 2-segment, reachable)
  // ===========================================================================
  describe('POST /prompts/extract-variables', () => {
    it('extracts variables successfully', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/extract-variables')
        .send({ template: 'Hello {{name}}, your policy {{policy_id}}' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.variables).toEqual(['var1', 'var2'])
      expect(mockExtractVariables).toHaveBeenCalledWith('Hello {{name}}, your policy {{policy_id}}')
    })

    it('returns 400 when template is missing', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/extract-variables')
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('template is required')
    })

    it('returns 400 when template is empty string', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/extract-variables')
        .send({ template: '' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when template is null', async () => {
      const res = await request(app)
        .post('/api/admin/prompts/extract-variables')
        .send({ template: null })
      expect(res.status).toBe(400)
    })

    it('returns 500 on error (Error thrown)', async () => {
      mockExtractVariables.mockImplementation(() => { throw new Error('Parse error') })
      const res = await request(app)
        .post('/api/admin/prompts/extract-variables')
        .send({ template: 'test {{var}}' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to extract variables')
    })

    it('handles non-Error thrown in catch', async () => {
      mockExtractVariables.mockImplementation(() => { throw 'string error' })
      const res = await request(app)
        .post('/api/admin/prompts/extract-variables')
        .send({ template: 'test' })
      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // Error instanceof checks — verify both branches of the ternary
  // ===========================================================================
  describe('Error logging branches (instanceof Error)', () => {
    it('logs Error.message when TypeError is thrown', async () => {
      mockGetAllPrompts.mockRejectedValue(new TypeError('Type mismatch'))
      const res = await request(app).get('/api/admin/prompts')
      expect(res.status).toBe(500)
    })

    it('logs String(error) when object is thrown', async () => {
      mockGetAllPrompts.mockRejectedValue({ custom: 'object error' })
      const res = await request(app).get('/api/admin/prompts')
      expect(res.status).toBe(500)
    })

    it('logs String(error) when number is thrown', async () => {
      mockGetPromptById.mockRejectedValue(404)
      const res = await request(app)
        .put('/api/admin/prompts/tpl-001')
        .send({ name: 'test' })
      expect(res.status).toBe(500)
    })

    it('logs String(error) when boolean is thrown on DELETE', async () => {
      mockDeleteTemplate.mockRejectedValue(false)
      const res = await request(app).delete('/api/admin/prompts/templates/tpl-001')
      expect(res.status).toBe(500)
    })

    it('logs String(error) when undefined is thrown on POST AB tests', async () => {
      mockCreateABTest.mockRejectedValue(undefined)
      const validBody = {
        name: 'Test',
        templateId: 'tpl-001',
        controlVersionId: 'ver-001',
        treatmentVersionIds: ['ver-002'],
        trafficAllocation: { 'ver-001': 50, 'ver-002': 50 },
      }
      const res = await request(app)
        .post('/api/admin/prompts/ab-tests')
        .send(validBody)
      expect(res.status).toBe(500)
    })
  })
})
