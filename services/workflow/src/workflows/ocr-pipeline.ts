/**
 * OCR Pipeline Workflow - Temporal Workflow Definition
 *
 * Orchestrates the complete document processing pipeline:
 * 1. Ingest → 2. Render → 3. Preprocess → 4. Layout → 5. OCR
 * → 6. Reconcile → 7. Normalize → 8. Validate → 9. Extract → 10. Finalize
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  ApplicationFailure,
} from '@temporalio/workflow'

import type {
  DocumentStatus,
  DocumentStage,
  DocumentHints,
  OCREngine,
  PreprocessVariant,
  ReconcileResult,
  NormalizeResult,
  ValidationGateResult,
  ExtractionResult,
} from '@insurai/types'

// Import activities (proxied)
import type * as activities from './activities'

// ============================================================================
// ACTIVITY PROXIES
// ============================================================================

const {
  ingestDocument,
  detectLocaleAndPolicyType,
  renderPages,
  preprocessPages,
  analyzeLayout,
  runOCR,
  reconcileOCRResults,
  normalizeText,
  validateDocument,
  extractFields,
  generateAuditBundle,
  updateDocumentStatus,
  quarantineDocument,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 8,
    maximumInterval: '15m',
    nonRetryableErrorTypes: ['ValidationError', 'QuarantineError'],
  },
})

// ============================================================================
// SIGNALS AND QUERIES
// ============================================================================

export const cancelSignal = defineSignal('cancel')
export const forceReprocessSignal = defineSignal<[DocumentStage]>('forceReprocess')

export const getStatusQuery = defineQuery<{
  status: DocumentStatus
  stage: DocumentStage
  progress: number
}>('getStatus')

export const getErrorsQuery = defineQuery<string[]>('getErrors')

// ============================================================================
// WORKFLOW STATE
// ============================================================================

interface WorkflowState {
  docId: string
  tenantId: string
  status: DocumentStatus
  stage: DocumentStage
  errors: string[]
  cancelled: boolean
  startTime: number
  stageStartTime: number
}

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

export interface OCRPipelineInput {
  docId: string
  tenantId: string
  filename: string
  objectKey: string
  hints?: DocumentHints
}

export interface OCRPipelineOutput {
  docId: string
  status: DocumentStatus
  qualityScore: number
  finalTextKey: string
  finalDocumentKey: string
  auditBundleKey: string
  extractedFieldsCount: number
  processingTimeMs: number
}

export async function ocrPipelineWorkflow(input: OCRPipelineInput): Promise<OCRPipelineOutput> {
  // Initialize state
  const state: WorkflowState = {
    docId: input.docId,
    tenantId: input.tenantId,
    status: 'PENDING',
    stage: 'ingest',
    errors: [],
    cancelled: false,
    startTime: Date.now(),
    stageStartTime: Date.now(),
  }

  // Set up signal handlers
  setHandler(cancelSignal, () => {
    state.cancelled = true
  })

  setHandler(forceReprocessSignal, (fromStage: DocumentStage) => {
    state.stage = fromStage
    state.errors = []
  })

  // Set up query handlers
  setHandler(getStatusQuery, () => ({
    status: state.status,
    stage: state.stage,
    progress: getStageProgress(state.stage),
  }))

  setHandler(getErrorsQuery, () => state.errors)

  try {
    // =========================================================================
    // STAGE 1: INGEST
    // =========================================================================
    await runStage(state, 'ingest', 'INGESTED', async () => {
      await ingestDocument({
        docId: input.docId,
        tenantId: input.tenantId,
        filename: input.filename,
        objectKey: input.objectKey,
      })
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 2: DETECT LOCALE AND POLICY TYPE
    // =========================================================================
    let detectionResult: { locale: string; policyType: string | null; confidence: number }

    await runStage(state, 'ingest', 'INGESTED', async () => {
      detectionResult = await detectLocaleAndPolicyType({
        docId: input.docId,
        hints: input.hints,
      })
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 3: RENDER PAGES
    // =========================================================================
    let pageCount: number

    await runStage(state, 'render', 'RENDERING', async () => {
      const result = await renderPages({
        docId: input.docId,
        dpi: 600,
      })
      pageCount = result.pageCount
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 4: PREPROCESS PAGES
    // =========================================================================
    await runStage(state, 'preprocess', 'PREPROCESSING', async () => {
      await preprocessPages({
        docId: input.docId,
        pageCount: pageCount!,
        variants: ['A', 'B', 'C', 'D'] as PreprocessVariant[],
      })
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 5: LAYOUT ANALYSIS
    // =========================================================================
    let regions: Array<{ id: string; pageNo: number; type: string }>

    await runStage(state, 'layout', 'LAYOUT_ANALYSIS', async () => {
      const result = await analyzeLayout({
        docId: input.docId,
        pageCount: pageCount!,
      })
      regions = result.regions
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 6: ENSEMBLE OCR
    // =========================================================================
    const engines: OCREngine[] = input.hints?.forceEngines || ['abbyy', 'gcp_docai', 'azure_di']
    let ocrResults: Array<{ engine: OCREngine; resultKey: string }>

    await runStage(state, 'ocr', 'OCR_IN_PROGRESS', async () => {
      // Run OCR with all engines in parallel (handled by activity)
      ocrResults = await runOCR({
        docId: input.docId,
        regions: regions!,
        engines,
        variant: 'A', // Start with variant A
      })
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 7: RECONCILE
    // =========================================================================
    let reconcileResult: ReconcileResult
    let targetedReOCRCount = 0
    const MAX_TARGETED_REOCR = 2

    await runStage(state, 'reconcile', 'RECONCILING', async () => {
      reconcileResult = await reconcileOCRResults({
        docId: input.docId,
        ocrResultKeys: ocrResults!.map(r => r.resultKey),
      })

      // Targeted re-OCR if needed
      while (reconcileResult.needsTargetedReOCR && targetedReOCRCount < MAX_TARGETED_REOCR) {
        targetedReOCRCount++

        // Re-render disputed regions at 900 DPI
        await renderPages({
          docId: input.docId,
          dpi: 900,
          regionIds: reconcileResult.targetedRegions,
        })

        // Re-run OCR on disputed regions with different variant
        const variant = (['B', 'C', 'D'] as PreprocessVariant[])[targetedReOCRCount - 1] || 'B'
        const reOCRResults = await runOCR({
          docId: input.docId,
          regions: regions!.filter(r => reconcileResult.targetedRegions.includes(r.id)),
          engines,
          variant,
        })

        // Re-reconcile
        reconcileResult = await reconcileOCRResults({
          docId: input.docId,
          ocrResultKeys: [...ocrResults!.map(r => r.resultKey), ...reOCRResults.map(r => r.resultKey)],
        })
      }
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 8: NORMALIZE
    // =========================================================================
    let _normalizeResult: NormalizeResult

    await runStage(state, 'normalize', 'NORMALIZING', async () => {
      _normalizeResult = await normalizeText({
        docId: input.docId,
        locale: detectionResult!.locale,
        policyType: detectionResult!.policyType,
      })
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 9: VALIDATE
    // =========================================================================
    let validationResult: ValidationGateResult

    await runStage(state, 'validate', 'VALIDATING', async () => {
      validationResult = await validateDocument({
        docId: input.docId,
        locale: detectionResult!.locale,
        policyType: detectionResult!.policyType,
      })

      // Check for quarantine
      if (!validationResult.passed) {
        if (validationResult.quarantineReason) {
          throw ApplicationFailure.create({
            type: 'QuarantineError',
            message: validationResult.quarantineReason,
          })
        }
      }
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 10: EXTRACT
    // =========================================================================
    let extractionResult: ExtractionResult

    await runStage(state, 'extract', 'EXTRACTING', async () => {
      extractionResult = await extractFields({
        docId: input.docId,
        locale: detectionResult!.locale,
        policyType: detectionResult!.policyType,
      })
    })

    if (state.cancelled) return createCancelledOutput(state)

    // =========================================================================
    // STAGE 11: FINALIZE
    // =========================================================================
    let auditBundle: { key: string; checksums: Record<string, string> }

    await runStage(state, 'finalize', 'COMPLETED', async () => {
      auditBundle = await generateAuditBundle({
        docId: input.docId,
        tenantId: input.tenantId,
      })

      await updateDocumentStatus({
        docId: input.docId,
        status: 'COMPLETED',
        qualityScore: Math.round(validationResult!.overallConfidence * 100),
      })
    })

    // Calculate quality score
    const qualityScore = Math.round(
      (validationResult!.overallConfidence * 0.4 +
        reconcileResult!.agreementRatio * 0.3 +
        extractionResult!.completeness * 0.3) * 100
    )

    return {
      docId: input.docId,
      status: 'COMPLETED',
      qualityScore,
      finalTextKey: `s3://insurai/${input.tenantId}/${input.docId}/final/text.txt`,
      finalDocumentKey: `s3://insurai/${input.tenantId}/${input.docId}/final/document.json`,
      auditBundleKey: auditBundle!.key,
      extractedFieldsCount: extractionResult!.fields.length,
      processingTimeMs: Date.now() - state.startTime,
    }

  } catch (error) {
    // Handle quarantine
    if (error instanceof ApplicationFailure && error.type === 'QuarantineError') {
      await quarantineDocument({
        docId: input.docId,
        reason: error.message,
        stage: state.stage,
      })

      return {
        docId: input.docId,
        status: 'QUARANTINED',
        qualityScore: 0,
        finalTextKey: '',
        finalDocumentKey: '',
        auditBundleKey: '',
        extractedFieldsCount: 0,
        processingTimeMs: Date.now() - state.startTime,
      }
    }

    // Update status to failed
    await updateDocumentStatus({
      docId: input.docId,
      status: 'FAILED',
      error: String(error),
    })

    throw error
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function runStage(
  state: WorkflowState,
  stage: DocumentStage,
  status: DocumentStatus,
  fn: () => Promise<void>
): Promise<void> {
  state.stage = stage
  state.status = status
  state.stageStartTime = Date.now()

  await updateDocumentStatus({
    docId: state.docId,
    status,
    stage,
  })

  await fn()
}

function getStageProgress(stage: DocumentStage): number {
  const stages: DocumentStage[] = [
    'ingest', 'render', 'preprocess', 'layout', 'ocr',
    'reconcile', 'normalize', 'validate', 'extract', 'finalize'
  ]
  const index = stages.indexOf(stage)
  return Math.round((index / stages.length) * 100)
}

function createCancelledOutput(state: WorkflowState): OCRPipelineOutput {
  return {
    docId: state.docId,
    status: 'FAILED',
    qualityScore: 0,
    finalTextKey: '',
    finalDocumentKey: '',
    auditBundleKey: '',
    extractedFieldsCount: 0,
    processingTimeMs: Date.now() - state.startTime,
  }
}
