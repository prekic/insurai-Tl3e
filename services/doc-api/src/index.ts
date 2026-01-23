/**
 * Document API Server
 *
 * Main entry point for the OCR pipeline microservices.
 * Provides REST API for document upload, processing, and retrieval.
 */

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { randomUUID } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Import types
import type {
  Document,
  DocumentStatus,
  DocumentStage,
  CreateDocumentRequest,
  CreateDocumentResponse,
  GetDocumentResponse,
  DocumentHints,
} from '@insurai/types'

// Import rule pack system
import {
  createDefaultRegistry,
  selectRulePacks,
  RulePackRegistry,
} from '@insurai/rule-packs'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  port: parseInt(process.env.API_PORT || '4002', 10),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Bucket: process.env.S3_BUCKET || 'insurai-ocr',
  temporalAddress: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  env: process.env.NODE_ENV || 'development',
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const app = express()

// Middleware
app.use(helmet())
app.use(cors())
app.use(compression())
app.use(express.json({ limit: '10mb' }))

// Initialize rule pack registry
const rulePackRegistry = createDefaultRegistry()

// Initialize Supabase client (if configured)
let supabase: SupabaseClient | null = null
if (config.supabaseUrl && config.supabaseKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseKey)
}

// ============================================================================
// REQUEST CONTEXT MIDDLEWARE
// ============================================================================

interface RequestContext {
  requestId: string
  tenantId: string
  startTime: number
}

declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext
    }
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  req.ctx = {
    requestId: randomUUID(),
    tenantId: req.headers['x-tenant-id'] as string || 'default',
    startTime: Date.now(),
  }
  res.setHeader('X-Request-ID', req.ctx.requestId)
  next()
})

// ============================================================================
// HEALTH ENDPOINT
// ============================================================================

app.get('/v1/health', async (req: Request, res: Response) => {
  const checks: Array<{ name: string; status: 'pass' | 'fail'; latencyMs?: number; message?: string }> = []

  // Check Supabase
  if (supabase) {
    const start = Date.now()
    try {
      const { error } = await supabase.from('ocr_documents').select('count').limit(0)
      checks.push({
        name: 'supabase',
        status: error ? 'fail' : 'pass',
        latencyMs: Date.now() - start,
        message: error?.message,
      })
    } catch (e) {
      checks.push({ name: 'supabase', status: 'fail', message: String(e) })
    }
  }

  // Check rule packs
  checks.push({
    name: 'rule_packs',
    status: rulePackRegistry.hasLocale('tr-TR') ? 'pass' : 'fail',
  })

  const allPassed = checks.every(c => c.status === 'pass')

  res.status(allPassed ? 200 : 503).json({
    status: allPassed ? 'healthy' : 'degraded',
    version: '2.0.0',
    uptime: process.uptime(),
    checks,
  })
})

// ============================================================================
// DOCUMENT ENDPOINTS
// ============================================================================

/**
 * POST /v1/documents - Create a new document
 */
app.post('/v1/documents', async (req: Request, res: Response) => {
  try {
    const body: CreateDocumentRequest = req.body

    if (!body.filename) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FILENAME',
          message: 'filename is required',
        },
      })
    }

    const docId = randomUUID()
    const tenantId = req.ctx.tenantId

    // Create document record
    const document: Partial<Document> = {
      id: docId,
      tenantId,
      status: 'PENDING' as DocumentStatus,
      stage: 'ingest' as DocumentStage,
      hints: body.hints || {},
      metadata: body.metadata || {},
      objectKeys: {
        originalPdf: `s3://${config.s3Bucket}/${tenantId}/${docId}/original.pdf`,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Insert into database (if available)
    if (supabase) {
      const { error } = await supabase.from('ocr_documents').insert({
        id: docId,
        tenant_id: tenantId,
        status: 'PENDING',
        stage: 'ingest',
        hints: body.hints || {},
        metadata: body.metadata || {},
        object_keys: document.objectKeys,
        source_filename: body.filename,
        source_mime: 'application/pdf',
      })

      if (error) {
        console.error('[doc-api] Failed to insert document:', error)
        return res.status(500).json({
          error: {
            code: 'DB_ERROR',
            message: 'Failed to create document',
          },
        })
      }
    }

    // Generate pre-signed upload URL
    // In production, this would use S3 pre-signed URLs
    const uploadUrl = `${req.protocol}://${req.get('host')}/v1/documents/${docId}/upload`
    const expiresAt = new Date(Date.now() + 3600000) // 1 hour

    const response: CreateDocumentResponse = {
      docId,
      uploadUrl,
      expiresAt,
    }

    res.status(201).json(response)
  } catch (e) {
    console.error('[doc-api] Error creating document:', e)
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create document',
      },
    })
  }
})

/**
 * GET /v1/documents/:docId - Get document details
 */
app.get('/v1/documents/:docId', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params

    if (!supabase) {
      return res.status(503).json({
        error: {
          code: 'DB_NOT_CONFIGURED',
          message: 'Database not configured',
        },
      })
    }

    const { data: doc, error } = await supabase
      .from('ocr_documents')
      .select('*')
      .eq('id', docId)
      .single()

    if (error || !doc) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Document ${docId} not found`,
        },
      })
    }

    // Get pages
    const { data: pages } = await supabase
      .from('ocr_pages')
      .select('*')
      .eq('doc_id', docId)
      .order('page_no')

    // Get rule packs
    const localePack = doc.detected_locale
      ? rulePackRegistry.getLocalePack(doc.detected_locale)
      : null
    const policyPack = doc.detected_policy_type
      ? rulePackRegistry.getPolicyPack(doc.detected_policy_type)
      : null

    // Get validation summary
    const { data: validationResults } = await supabase
      .from('validation_results')
      .select('severity')
      .eq('doc_id', docId)

    const validationSummary = {
      criticalCount: validationResults?.filter(r => r.severity === 'critical').length || 0,
      errorCount: validationResults?.filter(r => r.severity === 'error').length || 0,
      warningCount: validationResults?.filter(r => r.severity === 'warn').length || 0,
    }

    // Determine completed stages
    const stageOrder: DocumentStage[] = [
      'ingest', 'render', 'preprocess', 'layout', 'ocr',
      'reconcile', 'normalize', 'validate', 'extract', 'finalize'
    ]
    const currentStageIndex = stageOrder.indexOf(doc.stage)
    const completedStages = stageOrder.slice(0, currentStageIndex)

    const response: GetDocumentResponse = {
      document: {
        id: doc.id,
        tenantId: doc.tenant_id,
        status: doc.status,
        stage: doc.stage,
        detectedLocale: doc.detected_locale,
        detectedRegion: doc.detected_region,
        detectedPolicyType: doc.detected_policy_type,
        rulepackLocaleId: doc.rulepack_locale_id,
        rulepackPolicyId: doc.rulepack_policy_id,
        qualityScore: doc.quality_score,
        quarantineReason: doc.quarantine_reason,
        objectKeys: doc.object_keys,
        hints: doc.hints,
        metadata: doc.metadata,
        createdAt: new Date(doc.created_at),
        updatedAt: new Date(doc.updated_at),
      },
      pages: pages?.map(p => ({
        id: p.id,
        docId: p.doc_id,
        pageNo: p.page_no,
        renderKey600dpi: p.render_key_600dpi,
        variants: p.variants || {},
        layoutKey: p.layout_key,
        width: p.width,
        height: p.height,
        createdAt: new Date(p.created_at),
      })) || [],
      currentStage: doc.stage,
      progress: {
        completedStages,
        currentStage: doc.stage,
      },
      rulePacks: {
        locale: localePack,
        policy: policyPack,
      },
      validationSummary,
    }

    res.json(response)
  } catch (e) {
    console.error('[doc-api] Error getting document:', e)
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get document',
      },
    })
  }
})

/**
 * GET /v1/documents/:docId/text - Get final text
 */
app.get('/v1/documents/:docId/text', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params

    if (!supabase) {
      return res.status(503).json({
        error: { code: 'DB_NOT_CONFIGURED', message: 'Database not configured' },
      })
    }

    // Check document status
    const { data: doc, error } = await supabase
      .from('ocr_documents')
      .select('status, object_keys')
      .eq('id', docId)
      .single()

    if (error || !doc) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Document ${docId} not found` },
      })
    }

    if (!['COMPLETED', 'QUARANTINED'].includes(doc.status)) {
      return res.status(409).json({
        error: {
          code: 'NOT_READY',
          message: `Document is still processing (status: ${doc.status})`,
        },
      })
    }

    // Get reconciled tokens
    const { data: tokens } = await supabase
      .from('reconciled_tokens')
      .select('*')
      .eq('doc_id', docId)
      .order('reading_order')

    // Build final text
    const finalText = tokens?.map(t => t.text).join(' ') || ''

    // Build reading order blocks
    const readingOrderBlocks = tokens?.map((t, i) => ({
      id: t.id,
      pageNo: t.page_no,
      bbox: t.bbox,
      text: t.text,
      type: 'paragraph' as const,
      order: t.reading_order,
    })) || []

    // Get normalization info
    const { data: transforms } = await supabase
      .from('normalization_transforms')
      .select('applied_rules')
      .eq('doc_id', docId)

    const normalizationApplied = transforms?.flatMap(t =>
      (t.applied_rules as Array<{ ruleName: string }>)?.map(r => r.ruleName) || []
    ) || []

    res.json({
      docId,
      finalText,
      readingOrderBlocks,
      evidenceIndex: {
        tokens: tokens?.map(t => ({
          text: t.text,
          span: { start: 0, end: t.text.length },
          bbox: t.bbox,
          pageNo: t.page_no,
          confidence: t.confidence,
        })) || [],
      },
      normalizationApplied,
    })
  } catch (e) {
    console.error('[doc-api] Error getting text:', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get text' },
    })
  }
})

/**
 * GET /v1/documents/:docId/fields - Get extracted fields
 */
app.get('/v1/documents/:docId/fields', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params

    if (!supabase) {
      return res.status(503).json({
        error: { code: 'DB_NOT_CONFIGURED', message: 'Database not configured' },
      })
    }

    const { data: fields, error } = await supabase
      .from('extracted_fields')
      .select('*')
      .eq('doc_id', docId)

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: 'Failed to get fields' },
      })
    }

    const totalFields = fields?.length || 0
    const validFields = fields?.filter(f => f.validation_status === 'valid').length || 0

    res.json({
      docId,
      schema: 'insurance-policy',
      schemaVersion: '2.0',
      fields: fields?.map(f => ({
        fieldPath: f.field_path,
        valueRaw: f.value_raw,
        valueNormalized: f.value_normalized,
        confidence: f.confidence,
        evidence: f.evidence,
        validationStatus: f.validation_status,
      })) || [],
      completeness: totalFields > 0 ? validFields / totalFields : 0,
      confidence: fields?.reduce((sum, f) => sum + (f.confidence || 0), 0) / (totalFields || 1),
    })
  } catch (e) {
    console.error('[doc-api] Error getting fields:', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get fields' },
    })
  }
})

/**
 * GET /v1/documents/:docId/audit - Get audit bundle
 */
app.get('/v1/documents/:docId/audit', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params

    if (!supabase) {
      return res.status(503).json({
        error: { code: 'DB_NOT_CONFIGURED', message: 'Database not configured' },
      })
    }

    // Get audit bundle
    const { data: bundle, error } = await supabase
      .from('audit_bundles')
      .select('*')
      .eq('doc_id', docId)
      .single()

    if (error || !bundle) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audit bundle not found' },
      })
    }

    // Get pipeline traces
    const { data: traces } = await supabase
      .from('pipeline_traces')
      .select('*')
      .eq('doc_id', docId)
      .order('started_at')

    // Get OCR runs
    const { data: ocrRuns } = await supabase
      .from('ocr_runs')
      .select('engine, page_no, region_id, raw_output_key, engine_confidence')
      .eq('doc_id', docId)

    // Get reconcile decisions
    const { data: reconcileDecisions } = await supabase
      .from('reconcile_decisions')
      .select('*')
      .eq('doc_id', docId)

    // Get normalization transforms
    const { data: normalizations } = await supabase
      .from('normalization_transforms')
      .select('*')
      .eq('doc_id', docId)

    // Get validation results
    const { data: validations } = await supabase
      .from('validation_results')
      .select('*')
      .eq('doc_id', docId)

    res.json({
      docId,
      auditBundle: {
        docId,
        tenantId: bundle.tenant_id,
        version: bundle.bundle_version,
        createdAt: bundle.created_at,
        pipelineTrace: traces || [],
        ocrOutputs: ocrRuns || [],
        reconcileDecisions: reconcileDecisions || [],
        normalizationTransforms: normalizations || [],
        validationResults: validations || [],
        checksums: bundle.checksums,
      },
      downloadUrls: {
        auditBundle: bundle.bundle_key,
        originalPdf: '', // Would generate pre-signed URL
        finalText: '',
        finalDocument: '',
      },
    })
  } catch (e) {
    console.error('[doc-api] Error getting audit:', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get audit' },
    })
  }
})

/**
 * POST /v1/documents/:docId/reprocess - Reprocess document
 */
app.post('/v1/documents/:docId/reprocess', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params
    const body = req.body

    if (!supabase) {
      return res.status(503).json({
        error: { code: 'DB_NOT_CONFIGURED', message: 'Database not configured' },
      })
    }

    // Update document with new hints
    const { error } = await supabase
      .from('ocr_documents')
      .update({
        status: 'PENDING',
        stage: body.reprocessFrom || 'ingest',
        hints: {
          locale: body.forceLocale,
          policyType: body.forcePolicyType,
          forceEngines: body.forceEngines,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: 'Failed to update document' },
      })
    }

    // In production, this would trigger a Temporal workflow
    // await temporalClient.workflow.start(...)

    res.status(202).json({
      docId,
      message: 'Reprocessing initiated',
    })
  } catch (e) {
    console.error('[doc-api] Error reprocessing:', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to reprocess' },
    })
  }
})

// ============================================================================
// RULE PACK ENDPOINTS
// ============================================================================

/**
 * GET /v1/rulepacks - List rule packs
 */
app.get('/v1/rulepacks', (req: Request, res: Response) => {
  const { type, active } = req.query

  let packs: Array<{ id: string; type: string; locale?: string; policyType?: string; version: string; active: boolean }> = []

  if (!type || type === 'locale') {
    packs.push(...rulePackRegistry.getAllLocalePacks().map(p => ({
      id: p.id,
      type: 'locale' as const,
      locale: p.locale,
      version: p.version,
      active: p.active,
    })))
  }

  if (!type || type === 'policy') {
    packs.push(...rulePackRegistry.getAllPolicyPacks().map(p => ({
      id: p.id,
      type: 'policy' as const,
      policyType: p.policyType,
      version: p.version,
      active: p.active,
    })))
  }

  if (active !== undefined) {
    const isActive = active === 'true'
    packs = packs.filter(p => p.active === isActive)
  }

  res.json({ items: packs })
})

/**
 * GET /v1/rulepacks/:packId - Get rule pack details
 */
app.get('/v1/rulepacks/:packId', (req: Request, res: Response) => {
  const { packId } = req.params

  // Search in both locale and policy packs
  for (const pack of rulePackRegistry.getAllLocalePacks()) {
    if (pack.id === packId) {
      return res.json(pack)
    }
  }

  for (const pack of rulePackRegistry.getAllPolicyPacks()) {
    if (pack.id === packId) {
      return res.json(pack)
    }
  }

  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Rule pack ${packId} not found` },
  })
})

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[doc-api] Unhandled error:', err)
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.env === 'development' ? err.message : 'Internal server error',
      traceId: req.ctx?.requestId,
    },
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  })
})

// ============================================================================
// START SERVER
// ============================================================================

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[doc-api] Server running on port ${config.port}`)
    console.log(`[doc-api] Environment: ${config.env}`)
    console.log(`[doc-api] Rule packs loaded: ${rulePackRegistry.getAllLocalePacks().length} locales, ${rulePackRegistry.getAllPolicyPacks().length} policies`)
  })
}

export { app, rulePackRegistry }
