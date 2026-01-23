/**
 * Temporal Activities for OCR Pipeline
 *
 * Each activity is an idempotent, retryable unit of work.
 * Activities communicate with other microservices via HTTP/gRPC.
 */

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

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  renderServiceUrl: process.env.RENDER_SERVICE_URL || 'http://localhost:4003',
  preprocServiceUrl: process.env.PREPROC_SERVICE_URL || 'http://localhost:4004',
  layoutServiceUrl: process.env.LAYOUT_SERVICE_URL || 'http://localhost:4005',
  ocrOrchUrl: process.env.OCR_ORCH_URL || 'http://localhost:4006',
  reconcileServiceUrl: process.env.RECONCILE_SERVICE_URL || 'http://localhost:4007',
  normalizeServiceUrl: process.env.NORMALIZE_SERVICE_URL || 'http://localhost:4008',
  validateServiceUrl: process.env.VALIDATE_SERVICE_URL || 'http://localhost:4009',
  extractServiceUrl: process.env.EXTRACT_SERVICE_URL || 'http://localhost:4010',
  auditServiceUrl: process.env.AUDIT_SERVICE_URL || 'http://localhost:4011',
  docApiUrl: process.env.DOC_API_URL || 'http://localhost:4002',
}

// ============================================================================
// HTTP CLIENT HELPER
// ============================================================================

async function httpPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`HTTP ${response.status}: ${error}`)
  }

  return response.json()
}

async function httpPatch<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`HTTP ${response.status}: ${error}`)
  }

  return response.json()
}

// ============================================================================
// INGEST ACTIVITIES
// ============================================================================

export interface IngestDocumentInput {
  docId: string
  tenantId: string
  filename: string
  objectKey: string
}

export async function ingestDocument(input: IngestDocumentInput): Promise<void> {
  await httpPost(`${config.docApiUrl}/internal/documents/${input.docId}/ingest`, {
    filename: input.filename,
    objectKey: input.objectKey,
  })
}

// ============================================================================
// DETECTION ACTIVITIES
// ============================================================================

export interface DetectLocaleAndPolicyTypeInput {
  docId: string
  hints?: DocumentHints
}

export interface DetectLocaleAndPolicyTypeOutput {
  locale: string
  policyType: string | null
  confidence: number
}

export async function detectLocaleAndPolicyType(
  input: DetectLocaleAndPolicyTypeInput
): Promise<DetectLocaleAndPolicyTypeOutput> {
  // Quick OCR on first page for classification
  const result = await httpPost<{
    locale: string
    policyType: string | null
    confidence: number
  }>(`${config.ocrOrchUrl}/classify`, {
    docId: input.docId,
    hints: input.hints,
  })

  return result
}

// ============================================================================
// RENDER ACTIVITIES
// ============================================================================

export interface RenderPagesInput {
  docId: string
  dpi: 300 | 600 | 900
  regionIds?: string[] // For targeted re-render
}

export interface RenderPagesOutput {
  pageCount: number
  renderKeys: string[]
}

export async function renderPages(input: RenderPagesInput): Promise<RenderPagesOutput> {
  return httpPost<RenderPagesOutput>(`${config.renderServiceUrl}/render`, {
    docId: input.docId,
    dpi: input.dpi,
    regionIds: input.regionIds,
  })
}

// ============================================================================
// PREPROCESS ACTIVITIES
// ============================================================================

export interface PreprocessPagesInput {
  docId: string
  pageCount: number
  variants: PreprocessVariant[]
}

export async function preprocessPages(input: PreprocessPagesInput): Promise<void> {
  await httpPost(`${config.preprocServiceUrl}/preprocess`, {
    docId: input.docId,
    pageCount: input.pageCount,
    variants: input.variants,
  })
}

// ============================================================================
// LAYOUT ACTIVITIES
// ============================================================================

export interface AnalyzeLayoutInput {
  docId: string
  pageCount: number
}

export interface AnalyzeLayoutOutput {
  regions: Array<{
    id: string
    pageNo: number
    type: string
    bbox: { x: number; y: number; width: number; height: number }
  }>
}

export async function analyzeLayout(input: AnalyzeLayoutInput): Promise<AnalyzeLayoutOutput> {
  return httpPost<AnalyzeLayoutOutput>(`${config.layoutServiceUrl}/analyze`, {
    docId: input.docId,
    pageCount: input.pageCount,
  })
}

// ============================================================================
// OCR ACTIVITIES
// ============================================================================

export interface RunOCRInput {
  docId: string
  regions: Array<{ id: string; pageNo: number; type: string }>
  engines: OCREngine[]
  variant: PreprocessVariant
}

export interface RunOCROutput {
  engine: OCREngine
  resultKey: string
}

export async function runOCR(input: RunOCRInput): Promise<RunOCROutput[]> {
  return httpPost<RunOCROutput[]>(`${config.ocrOrchUrl}/ocr`, {
    docId: input.docId,
    regions: input.regions,
    engines: input.engines,
    variant: input.variant,
  })
}

// ============================================================================
// RECONCILE ACTIVITIES
// ============================================================================

export interface ReconcileOCRResultsInput {
  docId: string
  ocrResultKeys: string[]
}

export async function reconcileOCRResults(
  input: ReconcileOCRResultsInput
): Promise<ReconcileResult> {
  return httpPost<ReconcileResult>(`${config.reconcileServiceUrl}/reconcile`, {
    docId: input.docId,
    ocrResultKeys: input.ocrResultKeys,
  })
}

// ============================================================================
// NORMALIZE ACTIVITIES
// ============================================================================

export interface NormalizeTextInput {
  docId: string
  locale: string
  policyType: string | null
}

export async function normalizeText(input: NormalizeTextInput): Promise<NormalizeResult> {
  return httpPost<NormalizeResult>(`${config.normalizeServiceUrl}/normalize`, {
    docId: input.docId,
    locale: input.locale,
    policyType: input.policyType,
  })
}

// ============================================================================
// VALIDATE ACTIVITIES
// ============================================================================

export interface ValidateDocumentInput {
  docId: string
  locale: string
  policyType: string | null
}

export async function validateDocument(
  input: ValidateDocumentInput
): Promise<ValidationGateResult> {
  return httpPost<ValidationGateResult>(`${config.validateServiceUrl}/validate`, {
    docId: input.docId,
    locale: input.locale,
    policyType: input.policyType,
  })
}

// ============================================================================
// EXTRACT ACTIVITIES
// ============================================================================

export interface ExtractFieldsInput {
  docId: string
  locale: string
  policyType: string | null
}

export async function extractFields(input: ExtractFieldsInput): Promise<ExtractionResult> {
  return httpPost<ExtractionResult>(`${config.extractServiceUrl}/extract`, {
    docId: input.docId,
    locale: input.locale,
    policyType: input.policyType,
  })
}

// ============================================================================
// AUDIT ACTIVITIES
// ============================================================================

export interface GenerateAuditBundleInput {
  docId: string
  tenantId: string
}

export interface GenerateAuditBundleOutput {
  key: string
  checksums: Record<string, string>
}

export async function generateAuditBundle(
  input: GenerateAuditBundleInput
): Promise<GenerateAuditBundleOutput> {
  return httpPost<GenerateAuditBundleOutput>(`${config.auditServiceUrl}/bundle`, {
    docId: input.docId,
    tenantId: input.tenantId,
  })
}

// ============================================================================
// STATUS ACTIVITIES
// ============================================================================

export interface UpdateDocumentStatusInput {
  docId: string
  status: DocumentStatus
  stage?: DocumentStage
  qualityScore?: number
  error?: string
}

export async function updateDocumentStatus(input: UpdateDocumentStatusInput): Promise<void> {
  await httpPatch(`${config.docApiUrl}/internal/documents/${input.docId}/status`, {
    status: input.status,
    stage: input.stage,
    qualityScore: input.qualityScore,
    error: input.error,
  })
}

export interface QuarantineDocumentInput {
  docId: string
  reason: string
  stage: DocumentStage
}

export async function quarantineDocument(input: QuarantineDocumentInput): Promise<void> {
  await httpPost(`${config.docApiUrl}/internal/documents/${input.docId}/quarantine`, {
    reason: input.reason,
    stage: input.stage,
  })
}
