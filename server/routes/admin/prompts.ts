/**
 * Admin Prompt Management Routes
 *
 * Basic CRUD via prompt-service, plus versioned templates, A/B testing,
 * preview, and variable extraction via prompt-versioning.
 */

import { Router, Response } from 'express'
import {
  authenticateAdmin,
  requireRole,
  requireSuperAdmin,
  logAdminAction,
  promptService,
  promptVersioning,
  auditLogs,
  requestCounters,
  qstr,
  getClientIp,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const router = Router()

// ============================================================================
// PROMPT TEMPLATES (Database-backed via prompt-service)
// ============================================================================

router.get('/prompts', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category } = req.query

    let templates
    if (category && typeof category === 'string') {
      templates = await promptService.getPromptsByCategory(
        category as promptService.PromptCategory
      )
    } else {
      templates = await promptService.getAllPrompts()
    }

    res.json({ success: true, data: templates })
  } catch (error) {
    console.error('[Admin] Error fetching prompts:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch prompts' })
  }
})

router.get('/prompts/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await promptService.getPromptById(qstr(req.params.id))

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('[Admin] Error fetching prompt:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch prompt' })
  }
})

router.put('/prompts/:id', authenticateAdmin, requireRole('admin', 'super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)
    const updates = req.body

    // Get current template for audit log
    const previousTemplate = await promptService.getPromptById(id)
    if (!previousTemplate) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    const updatedTemplate = await promptService.updatePrompt(id, {
      name: updates.name,
      description: updates.description,
      systemPrompt: updates.systemPrompt,
      userPromptTemplate: updates.userPromptTemplate,
      isActive: updates.isActive,
      parameters: updates.parameters,
    })

    if (!updatedTemplate) {
      res.status(500).json({ success: false, error: 'Failed to update template' })
      return
    }

    // Audit log
    auditLogs.push({
      id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
      timestamp: new Date().toISOString(),
      actorId: req.adminUser?.id || 'unknown',
      actorEmail: req.adminUser?.email || 'unknown',
      action: 'update',
      resourceType: 'prompt_template',
      resourceId: id,
      ipAddress: getClientIp(req),
    })

    // Log to database
    logAdminAction(req, 'update', 'prompt_template', id, previousTemplate, updatedTemplate)

    res.json({ success: true, data: updatedTemplate })
  } catch (error) {
    console.error('[Admin] Error updating prompt:', error)
    res.status(500).json({ success: false, error: 'Failed to update prompt' })
  }
})

router.post('/prompts', authenticateAdmin, requireRole('admin', 'super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, category, systemPrompt, userPromptTemplate, variables, defaultProvider, defaultModel, parameters } = req.body

    if (!name || !category || !systemPrompt || !userPromptTemplate) {
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }

    const template = await promptService.createPrompt({
      name,
      description: description || '',
      category,
      systemPrompt,
      userPromptTemplate,
      variables: variables || [],
      isActive: true,
      defaultProvider,
      defaultModel,
      parameters,
    })

    if (!template) {
      res.status(500).json({ success: false, error: 'Failed to create template' })
      return
    }

    // Audit log
    auditLogs.push({
      id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
      timestamp: new Date().toISOString(),
      actorId: req.adminUser?.id || 'unknown',
      actorEmail: req.adminUser?.email || 'unknown',
      action: 'create',
      resourceType: 'prompt_template',
      resourceId: template.id,
      ipAddress: getClientIp(req),
    })

    // Log to database
    logAdminAction(req, 'create', 'prompt_template', template.id, undefined, template)

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('[Admin] Error creating prompt:', error)
    res.status(500).json({ success: false, error: 'Failed to create prompt' })
  }
})

// ============================================================================
// PROMPT TEMPLATE MANAGEMENT (Phase 3 - versioned templates)
// ============================================================================

/**
 * List all prompt templates
 * GET /api/admin/prompts/templates
 */
router.get('/prompts/templates', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const category = req.query.category as promptVersioning.PromptCategory | undefined
    const templates = await promptVersioning.getTemplates(category)

    res.json({ success: true, data: templates })
  } catch (error) {
    console.error('Failed to list templates:', error)
    res.status(500).json({ success: false, error: 'Failed to list templates' })
  }
})

/**
 * Get a specific template
 * GET /api/admin/prompts/templates/:id
 */
router.get('/prompts/templates/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await promptVersioning.getTemplate(qstr(req.params.id))

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    // Get versions for this template
    const versions = await promptVersioning.getVersions(qstr(req.params.id))

    res.json({ success: true, data: { ...template, versions } })
  } catch (error) {
    console.error('Failed to get template:', error)
    res.status(500).json({ success: false, error: 'Failed to get template' })
  }
})

/**
 * Create a new template
 * POST /api/admin/prompts/templates
 */
router.post('/prompts/templates', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, category, systemPrompt, userPromptTemplate, isDefault } = req.body

    if (!name || !category || !systemPrompt || !userPromptTemplate) {
      res.status(400).json({
        success: false,
        error: 'Name, category, systemPrompt, and userPromptTemplate are required',
      })
      return
    }

    const template = await promptVersioning.createTemplate({
      name,
      description: description || '',
      category,
      systemPrompt,
      userPromptTemplate,
      isActive: true,
      isDefault: isDefault || false,
      createdBy: req.adminUser?.email,
    })

    // Log action
    await logAdminAction(req, 'create', 'prompt_template', template.id, undefined, { name, category })

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to create template:', error)
    res.status(500).json({ success: false, error: 'Failed to create template' })
  }
})

/**
 * Update a template
 * PUT /api/admin/prompts/templates/:id
 */
router.put('/prompts/templates/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)
    const { name, description, systemPrompt, userPromptTemplate, isActive, isDefault, changeDescription } = req.body

    const template = await promptVersioning.updateTemplate(
      id,
      { name, description, systemPrompt, userPromptTemplate, isActive, isDefault },
      changeDescription || 'Update via admin API',
      req.adminUser?.email
    )

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update', 'prompt_template', id)

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to update template:', error)
    res.status(500).json({ success: false, error: 'Failed to update template' })
  }
})

/**
 * Delete a template
 * DELETE /api/admin/prompts/templates/:id
 */
router.delete('/prompts/templates/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)

    const success = await promptVersioning.deleteTemplate(id)

    if (!success) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'delete', 'prompt_template', id)

    res.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Failed to delete template:', error)
    res.status(500).json({ success: false, error: 'Failed to delete template' })
  }
})

/**
 * Get template statistics
 * GET /api/admin/prompts/templates/:id/stats
 */
router.get('/prompts/templates/:id/stats', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await promptVersioning.getTemplateStats(qstr(req.params.id))

    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Failed to get template stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get template stats' })
  }
})

// ============================================================================
// PROMPT VERSION MANAGEMENT
// ============================================================================

/**
 * Get all versions for a template
 * GET /api/admin/prompts/templates/:templateId/versions
 */
router.get('/prompts/templates/:templateId/versions', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versions = await promptVersioning.getVersions(qstr(req.params.templateId))

    res.json({ success: true, data: versions })
  } catch (error) {
    console.error('Failed to get versions:', error)
    res.status(500).json({ success: false, error: 'Failed to get versions' })
  }
})

/**
 * Get a specific version
 * GET /api/admin/prompts/versions/:id
 */
router.get('/prompts/versions/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const version = await promptVersioning.getVersion(qstr(req.params.id))

    if (!version) {
      res.status(404).json({ success: false, error: 'Version not found' })
      return
    }

    res.json({ success: true, data: version })
  } catch (error) {
    console.error('Failed to get version:', error)
    res.status(500).json({ success: false, error: 'Failed to get version' })
  }
})

/**
 * Rollback to a specific version
 * POST /api/admin/prompts/templates/:templateId/rollback/:versionId
 */
router.post('/prompts/templates/:templateId/rollback/:versionId', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = qstr(req.params.templateId)
    const versionId = qstr(req.params.versionId)

    const template = await promptVersioning.rollbackToVersion(templateId, versionId, req.adminUser?.email)

    if (!template) {
      res.status(404).json({ success: false, error: 'Template or version not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'rollback', 'prompt_template', templateId, undefined, { versionId })

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to rollback:', error)
    res.status(500).json({ success: false, error: 'Failed to rollback' })
  }
})

/**
 * Compare two versions
 * GET /api/admin/prompts/versions/compare
 */
router.get('/prompts/versions/compare', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { versionA, versionB } = req.query

    if (!versionA || !versionB) {
      res.status(400).json({ success: false, error: 'versionA and versionB are required' })
      return
    }

    const [a, b] = await Promise.all([
      promptVersioning.getVersion(versionA as string),
      promptVersioning.getVersion(versionB as string),
    ])

    if (!a || !b) {
      res.status(404).json({ success: false, error: 'One or both versions not found' })
      return
    }

    res.json({
      success: true,
      data: {
        versionA: a,
        versionB: b,
        diff: {
          systemPromptChanged: a.systemPrompt !== b.systemPrompt,
          userPromptChanged: a.userPromptTemplate !== b.userPromptTemplate,
          variablesChanged: JSON.stringify(a.variables) !== JSON.stringify(b.variables),
        },
      },
    })
  } catch (error) {
    console.error('Failed to compare versions:', error)
    res.status(500).json({ success: false, error: 'Failed to compare versions' })
  }
})

// ============================================================================
// A/B TESTING MANAGEMENT
// ============================================================================

/**
 * List all A/B tests
 * GET /api/admin/prompts/ab-tests
 */
router.get('/prompts/ab-tests', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.query.status as promptVersioning.ABTest['status'] | undefined
    const tests = await promptVersioning.getABTests(status)

    res.json({ success: true, data: tests })
  } catch (error) {
    console.error('Failed to list A/B tests:', error)
    res.status(500).json({ success: false, error: 'Failed to list A/B tests' })
  }
})

/**
 * Get a specific A/B test
 * GET /api/admin/prompts/ab-tests/:id
 */
router.get('/prompts/ab-tests/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const test = await promptVersioning.getABTest(qstr(req.params.id))

    if (!test) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    // Include version details
    const [controlVersion, ...treatmentVersions] = await Promise.all([
      promptVersioning.getVersion(test.controlVersionId),
      ...test.treatmentVersionIds.map((id) => promptVersioning.getVersion(id)),
    ])

    res.json({
      success: true,
      data: {
        ...test,
        controlVersion,
        treatmentVersions: treatmentVersions.filter(Boolean),
      },
    })
  } catch (error) {
    console.error('Failed to get A/B test:', error)
    res.status(500).json({ success: false, error: 'Failed to get A/B test' })
  }
})

/**
 * Create a new A/B test
 * POST /api/admin/prompts/ab-tests
 */
router.post('/prompts/ab-tests', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      description,
      templateId,
      controlVersionId,
      treatmentVersionIds,
      trafficAllocation,
      primaryMetric,
      minSampleSize,
    } = req.body

    if (!name || !templateId || !controlVersionId || !treatmentVersionIds || !trafficAllocation) {
      res.status(400).json({
        success: false,
        error: 'name, templateId, controlVersionId, treatmentVersionIds, and trafficAllocation are required',
      })
      return
    }

    // Validate traffic allocation adds up to 100%
    const totalAllocation = Object.values(trafficAllocation as Record<string, number>).reduce((sum, v) => sum + v, 0)
    if (Math.abs(totalAllocation - 100) > 0.1) {
      res.status(400).json({
        success: false,
        error: 'Traffic allocation must add up to 100%',
      })
      return
    }

    const test = await promptVersioning.createABTest({
      name,
      description: description || '',
      templateId,
      status: 'draft',
      controlVersionId,
      treatmentVersionIds,
      trafficAllocation,
      primaryMetric: primaryMetric || 'success_rate',
      minSampleSize: minSampleSize || 100,
      createdBy: req.adminUser?.email,
    })

    // Log action
    await logAdminAction(req, 'create', 'ab_test', test.id, undefined, { name, templateId })

    res.json({ success: true, data: test })
  } catch (error) {
    console.error('Failed to create A/B test:', error)
    res.status(500).json({ success: false, error: 'Failed to create A/B test' })
  }
})

/**
 * Update A/B test status
 * PUT /api/admin/prompts/ab-tests/:id/status
 */
router.put('/prompts/ab-tests/:id/status', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)
    const { status } = req.body

    if (!status || !['draft', 'running', 'paused', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Valid status is required (draft, running, paused, completed, cancelled)',
      })
      return
    }

    const test = await promptVersioning.updateABTestStatus(id, status)

    if (!test) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update_status', 'ab_test', id, undefined, { status })

    res.json({ success: true, data: test })
  } catch (error) {
    console.error('Failed to update A/B test status:', error)
    res.status(500).json({ success: false, error: 'Failed to update A/B test status' })
  }
})

/**
 * Get A/B test results
 * GET /api/admin/prompts/ab-tests/:id/results
 */
router.get('/prompts/ab-tests/:id/results', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results = await promptVersioning.calculateABTestResults(qstr(req.params.id))

    if (!results) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    res.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get A/B test results:', error)
    res.status(500).json({ success: false, error: 'Failed to get A/B test results' })
  }
})

/**
 * Apply winning version from A/B test
 * POST /api/admin/prompts/ab-tests/:id/apply-winner
 */
router.post('/prompts/ab-tests/:id/apply-winner', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)

    // Get test results
    const test = await promptVersioning.getABTest(id)
    if (!test) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    if (!test.results?.winner) {
      res.status(400).json({ success: false, error: 'No winner determined yet' })
      return
    }

    // Get winning version
    const winningVersion = await promptVersioning.getVersion(test.results.winner)
    if (!winningVersion) {
      res.status(404).json({ success: false, error: 'Winning version not found' })
      return
    }

    // Update template with winning version's prompts
    const template = await promptVersioning.updateTemplate(
      test.templateId,
      {
        systemPrompt: winningVersion.systemPrompt,
        userPromptTemplate: winningVersion.userPromptTemplate,
      },
      `Applied winning version from A/B test: ${test.name}`,
      req.adminUser?.email
    )

    // Mark test as completed
    await promptVersioning.updateABTestStatus(id, 'completed')

    // Log action
    await logAdminAction(req, 'apply_winner', 'ab_test', id, undefined, { winnerId: test.results.winner })

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to apply winner:', error)
    res.status(500).json({ success: false, error: 'Failed to apply winner' })
  }
})

// ============================================================================
// PROMPT PREVIEW & TESTING
// ============================================================================

/**
 * Preview rendered prompt with variables
 * POST /api/admin/prompts/preview
 */
router.post('/prompts/preview', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId, versionId, variables } = req.body

    if (!templateId && !versionId) {
      res.status(400).json({ success: false, error: 'templateId or versionId is required' })
      return
    }

    let version: promptVersioning.PromptVersion | null = null

    if (versionId) {
      version = await promptVersioning.getVersion(versionId)
    } else {
      version = await promptVersioning.getLatestVersion(templateId)
    }

    if (!version) {
      res.status(404).json({ success: false, error: 'Version not found' })
      return
    }

    const rendered = {
      systemPrompt: promptVersioning.renderPrompt(version.systemPrompt, variables || {}),
      userPrompt: promptVersioning.renderPrompt(version.userPromptTemplate, variables || {}),
      variables: version.variables,
      missingVariables: version.variables.filter((v) => !variables?.[v]),
    }

    res.json({ success: true, data: rendered })
  } catch (error) {
    console.error('Failed to preview prompt:', error)
    res.status(500).json({ success: false, error: 'Failed to preview prompt' })
  }
})

/**
 * Extract variables from a template string
 * POST /api/admin/prompts/extract-variables
 */
router.post('/prompts/extract-variables', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { template } = req.body

    if (!template) {
      res.status(400).json({ success: false, error: 'template is required' })
      return
    }

    const variables = promptVersioning.extractVariables(template)

    res.json({ success: true, data: { variables } })
  } catch (error) {
    console.error('Failed to extract variables:', error)
    res.status(500).json({ success: false, error: 'Failed to extract variables' })
  }
})

export default router
