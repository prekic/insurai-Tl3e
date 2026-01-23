/**
 * Core Types Package
 * Shared types across all OCR microservices
 */

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

export type DocumentStatus =
  | 'PENDING'
  | 'INGESTED'
  | 'RENDERING'
  | 'PREPROCESSING'
  | 'LAYOUT_ANALYSIS'
  | 'OCR_IN_PROGRESS'
  | 'RECONCILING'
  | 'NORMALIZING'
  | 'VALIDATING'
  | 'EXTRACTING'
  | 'COMPLETED'
  | 'QUARANTINED'
  | 'FAILED'

export type DocumentStage =
  | 'ingest'
  | 'render'
  | 'preprocess'
  | 'layout'
  | 'ocr'
  | 'reconcile'
  | 'normalize'
  | 'validate'
  | 'extract'
  | 'finalize'

export interface Document {
  id: string
  tenantId: string
  status: DocumentStatus
  stage: DocumentStage
  detectedLocale: string | null // e.g., 'tr-TR'
  detectedRegion: string | null // e.g., 'TR'
  detectedPolicyType: string | null // e.g., 'motor_kasko'
  rulepackLocaleId: string | null
  rulepackPolicyId: string | null
  qualityScore: number | null // 0-100
  quarantineReason: string | null
  objectKeys: DocumentObjectKeys
  hints: DocumentHints
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface DocumentObjectKeys {
  originalPdf: string
  finalText?: string
  finalDocument?: string
  auditBundle?: string
}

export interface DocumentHints {
  locale?: string
  policyType?: string
  forceEngines?: OCREngine[]
  skipValidation?: boolean
}

// ============================================================================
// PAGE & REGION TYPES
// ============================================================================

export interface Page {
  id: string
  docId: string
  pageNo: number
  renderKey600dpi: string
  renderKey900dpi?: string
  variants: Record<PreprocessVariant, string>
  layoutKey: string | null
  width: number
  height: number
  createdAt: Date
}

export type PreprocessVariant = 'A' | 'B' | 'C' | 'D'

export type RegionType =
  | 'text'
  | 'table'
  | 'header'
  | 'footer'
  | 'qr'
  | 'barcode'
  | 'logo'
  | 'signature'
  | 'stamp'
  | 'handwriting'

export interface Region {
  id: string
  docId: string
  pageNo: number
  type: RegionType
  bbox: BoundingBox
  cropKey: string
  confidence: number
  metadata: Record<string, unknown>
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  // Optional polygon for non-rectangular regions
  polygon?: Array<{ x: number; y: number }>
}

// ============================================================================
// OCR TYPES
// ============================================================================

export type OCREngine = 'abbyy' | 'gcp_docai' | 'azure_di' | 'tesseract'

export interface OCRRun {
  id: string
  docId: string
  pageNo: number
  regionId: string
  engine: OCREngine
  variantId: PreprocessVariant
  rawOutputKey: string
  engineConfidence: number | null
  tokens: OCRToken[]
  processingTimeMs: number
  createdAt: Date
}

export interface OCRToken {
  id: string
  text: string
  bbox: BoundingBox
  confidence: number
  engine: OCREngine
  pageNo: number
  regionId: string
  lineIndex: number
  wordIndex: number
  // Character-level alternatives (for dispute resolution)
  alternatives?: Array<{ text: string; confidence: number }>
}

export interface OCRResult {
  engine: OCREngine
  tokens: OCRToken[]
  fullText: string
  confidence: number
  processingTimeMs: number
  rawOutput: unknown
}

// ============================================================================
// RECONCILIATION TYPES
// ============================================================================

export interface ReconcileDecision {
  docId: string
  pageNo: number
  regionId: string
  tokenSpanId: string
  chosenText: string
  candidates: ReconcileCandidate[]
  ruleApplied: string
  isDisputed: boolean
  disputeReason?: string
  confidence: number
}

export interface ReconcileCandidate {
  engine: OCREngine
  text: string
  confidence: number
  bbox: BoundingBox
}

export interface ReconcileResult {
  docId: string
  finalTokens: ReconciledToken[]
  disputedRegions: DisputedRegion[]
  agreementRatio: number
  needsTargetedReOCR: boolean
  targetedRegions: string[]
}

export interface ReconciledToken {
  id: string
  text: string
  bbox: BoundingBox
  confidence: number
  sourceEngines: OCREngine[]
  pageNo: number
  regionId: string
  lineIndex: number
  wordIndex: number
  isDisputed: boolean
}

export interface DisputedRegion {
  regionId: string
  pageNo: number
  bbox: BoundingBox
  candidates: ReconcileCandidate[]
  disputeType: 'character_mismatch' | 'word_mismatch' | 'missing_content' | 'extra_content'
  severity: 'low' | 'medium' | 'high' | 'critical'
}

// ============================================================================
// NORMALIZATION TYPES
// ============================================================================

export interface NormalizationTransform {
  docId: string
  stage: string
  appliedRules: AppliedRule[]
  diffKey?: string
  inputHash: string
  outputHash: string
  createdAt: Date
}

export interface AppliedRule {
  ruleId: string
  ruleName: string
  matches: number
  examples: Array<{ before: string; after: string }>
}

export interface NormalizeResult {
  normalizedText: string
  transforms: NormalizationTransform[]
  readingOrderBlocks: ReadingOrderBlock[]
  evidenceIndex: EvidenceIndex
}

export interface ReadingOrderBlock {
  id: string
  pageNo: number
  bbox: BoundingBox
  text: string
  type: 'paragraph' | 'heading' | 'list_item' | 'table_cell' | 'footer' | 'header'
  order: number
}

export interface EvidenceIndex {
  tokens: Array<{
    text: string
    span: { start: number; end: number }
    sourceTokenIds: string[]
    bbox: BoundingBox
    pageNo: number
    confidence: number
  }>
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export type ValidationSeverity = 'info' | 'warn' | 'error' | 'critical'

export interface ValidationResult {
  docId: string
  severity: ValidationSeverity
  code: string
  message: string
  field: string | null
  evidence: ValidationEvidence | null
  rulePackId: string
  ruleId: string
  createdAt: Date
}

export interface ValidationEvidence {
  pageNo: number
  bbox: BoundingBox
  quote: string
  context?: string
}

export interface ValidationGateResult {
  passed: boolean
  criticalIssues: ValidationResult[]
  errors: ValidationResult[]
  warnings: ValidationResult[]
  infos: ValidationResult[]
  overallConfidence: number
  needsTargetedReOCR: boolean
  quarantineReason?: string
}

// ============================================================================
// EXTRACTION TYPES
// ============================================================================

export interface ExtractedField {
  docId: string
  fieldPath: string // e.g., 'vehicle.plate', 'policy.policyNo'
  valueRaw: string
  valueNormalized: string
  confidence: number
  evidence: FieldEvidence
  validationStatus: 'valid' | 'invalid' | 'uncertain'
}

export interface FieldEvidence {
  pageNo: number
  bbox: BoundingBox
  quote: string
  sourceTokenIds: string[]
  extractionMethod: 'regex' | 'layout' | 'llm' | 'hybrid'
}

export interface ExtractionResult {
  docId: string
  fields: ExtractedField[]
  schema: string
  schemaVersion: string
  completeness: number // 0-1, ratio of required fields found
  confidence: number
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export interface AuditBundle {
  docId: string
  tenantId: string
  version: string
  createdAt: Date

  // Pipeline trace
  pipelineTrace: PipelineTraceEntry[]

  // Per-engine raw outputs
  ocrOutputs: Array<{
    engine: OCREngine
    pageNo: number
    regionId: string
    rawOutputKey: string
    confidence: number
  }>

  // Reconciliation decisions
  reconcileDecisions: ReconcileDecision[]

  // Normalization transforms
  normalizationTransforms: NormalizationTransform[]

  // Validation results
  validationResults: ValidationResult[]

  // Final outputs
  finalTextKey: string
  finalDocumentKey: string

  // Checksums
  checksums: {
    originalPdf: string
    finalText: string
    finalDocument: string
  }
}

export interface PipelineTraceEntry {
  stage: DocumentStage
  status: 'started' | 'completed' | 'failed' | 'skipped'
  startedAt: Date
  completedAt?: Date
  durationMs?: number
  error?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// RULE PACK TYPES
// ============================================================================

export type RulePackType = 'locale' | 'policy'

export interface RulePack {
  id: string
  type: RulePackType
  version: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface LocaleRulePack extends RulePack {
  type: 'locale'
  locale: string // e.g., 'tr-TR'
  normalization: LocaleNormalizationRules
  validators: LocaleValidators
}

export interface PolicyRulePack extends RulePack {
  type: 'policy'
  policyType: string // e.g., 'motor_kasko'
  locales: string[] // Applicable locales
  classifiers: PolicyClassifiers
  validators: PolicyValidators
  extractionTargets: string[]
}

export interface LocaleNormalizationRules {
  unicode: string[] // e.g., ['NFKC']
  whitespace: {
    collapseRuns: boolean
    preserveParagraphs: boolean
    trimLines: boolean
  }
  turkishDiacritics?: {
    normalizeII: boolean
    preserveCase: boolean
  }
  splitLetterMerge: {
    enabled: boolean
    patterns: Array<{
      regex: string
      action: 'mergeRemoveSpaces' | 'mergeRemoveSpacesIfAllCaps' | 'custom'
      customHandler?: string
    }>
  }
  numberCanonicalization: {
    decimalSeparator: string
    thousandSeparator: string
    outputDecimalSeparator: string
    preserveOriginal: boolean
  }
  customRules?: Array<{
    id: string
    name: string
    pattern: string
    replacement: string
    flags: string
    order: number
  }>
}

export interface LocaleValidators {
  date: Array<{ format: string; strict?: boolean }>
  currency: Array<{ code: string; symbols: string[] }>
  phone?: Array<{ pattern: string; description: string }>
  postalCode?: Array<{ pattern: string; description: string }>
  nationalId?: Array<{ pattern: string; checksum?: string; description: string }>
}

export interface PolicyClassifiers {
  keywordsAny: string[]
  keywordsStrong: string[]
  keywordsExclude?: string[]
  layoutPatterns?: Array<{
    description: string
    requiredRegions: RegionType[]
    optionalRegions: RegionType[]
  }>
}

export interface PolicyValidators {
  [fieldPath: string]: Array<{
    regex?: string
    parse?: 'money' | 'date' | 'number' | 'percent'
    min?: number
    max?: number
    required?: boolean
    severity: ValidationSeverity
    message?: string
    rule?: string
  }>
}

// ============================================================================
// QUEUE MESSAGE TYPES
// ============================================================================

export interface BaseQueueMessage {
  messageId: string
  docId: string
  tenantId: string
  timestamp: Date
  idempotencyKey: string
  retryCount: number
  metadata?: Record<string, unknown>
}

export interface DocIngestedMessage extends BaseQueueMessage {
  type: 'doc.ingested'
  source: {
    filename: string
    mime: string
    sizeBytes: number
  }
  objectKeys: {
    originalPdf: string
  }
  hints: DocumentHints
}

export interface PageRenderRequestedMessage extends BaseQueueMessage {
  type: 'page.render.requested'
  pageNo: number
  dpi: 300 | 600 | 900
  outputKey: string
}

export interface PageRenderCompletedMessage extends BaseQueueMessage {
  type: 'page.render.completed'
  pageNo: number
  dpi: number
  outputKey: string
  width: number
  height: number
}

export interface RegionOCRRequestedMessage extends BaseQueueMessage {
  type: 'region.ocr.requested'
  pageNo: number
  regionId: string
  variantId: PreprocessVariant
  engine: OCREngine
  imageKey: string
}

export interface RegionOCRCompletedMessage extends BaseQueueMessage {
  type: 'region.ocr.completed'
  pageNo: number
  regionId: string
  variantId: PreprocessVariant
  engine: OCREngine
  resultKey: string
  confidence: number
  tokenCount: number
}

export interface DocReconcileRequestedMessage extends BaseQueueMessage {
  type: 'doc.reconcile.requested'
  ocrRunIds: string[]
}

export interface DocReconcileCompletedMessage extends BaseQueueMessage {
  type: 'doc.reconcile.completed'
  agreementRatio: number
  disputedRegionCount: number
  needsTargetedReOCR: boolean
  targetedRegions: string[]
}

export interface DocNormalizeRequestedMessage extends BaseQueueMessage {
  type: 'doc.normalize.requested'
  localePackId: string
  policyPackId: string | null
}

export interface DocNormalizeCompletedMessage extends BaseQueueMessage {
  type: 'doc.normalize.completed'
  transformCount: number
  outputKey: string
}

export interface DocValidateRequestedMessage extends BaseQueueMessage {
  type: 'doc.validate.requested'
  localePackId: string
  policyPackId: string | null
}

export interface DocValidateCompletedMessage extends BaseQueueMessage {
  type: 'doc.validate.completed'
  passed: boolean
  criticalCount: number
  errorCount: number
  warningCount: number
  quarantineReason?: string
}

export interface DocExtractRequestedMessage extends BaseQueueMessage {
  type: 'doc.extract.requested'
  policyPackId: string
  extractionTargets: string[]
}

export interface DocExtractCompletedMessage extends BaseQueueMessage {
  type: 'doc.extract.completed'
  fieldCount: number
  completeness: number
  outputKey: string
}

export interface DocCompletedMessage extends BaseQueueMessage {
  type: 'doc.completed'
  qualityScore: number
  finalTextKey: string
  finalDocumentKey: string
  auditBundleKey: string
}

export interface DocQuarantinedMessage extends BaseQueueMessage {
  type: 'doc.quarantined'
  reason: string
  failedStage: DocumentStage
  lastError?: string
}

export type QueueMessage =
  | DocIngestedMessage
  | PageRenderRequestedMessage
  | PageRenderCompletedMessage
  | RegionOCRRequestedMessage
  | RegionOCRCompletedMessage
  | DocReconcileRequestedMessage
  | DocReconcileCompletedMessage
  | DocNormalizeRequestedMessage
  | DocNormalizeCompletedMessage
  | DocValidateRequestedMessage
  | DocValidateCompletedMessage
  | DocExtractRequestedMessage
  | DocExtractCompletedMessage
  | DocCompletedMessage
  | DocQuarantinedMessage

// ============================================================================
// API TYPES
// ============================================================================

export interface CreateDocumentRequest {
  filename: string
  hints?: DocumentHints
  metadata?: Record<string, unknown>
}

export interface CreateDocumentResponse {
  docId: string
  uploadUrl: string
  expiresAt: Date
}

export interface GetDocumentResponse {
  document: Document
  pages: Page[]
  currentStage: DocumentStage
  progress: {
    completedStages: DocumentStage[]
    currentStage: DocumentStage
    estimatedRemainingMs?: number
  }
  rulePacks: {
    locale: LocaleRulePack | null
    policy: PolicyRulePack | null
  }
  validationSummary?: {
    criticalCount: number
    errorCount: number
    warningCount: number
  }
}

export interface GetDocumentTextResponse {
  docId: string
  finalText: string
  readingOrderBlocks: ReadingOrderBlock[]
  evidenceIndex: EvidenceIndex
  normalizationApplied: string[]
}

export interface GetDocumentFieldsResponse {
  docId: string
  schema: string
  schemaVersion: string
  fields: ExtractedField[]
  completeness: number
  confidence: number
}

export interface GetDocumentAuditResponse {
  docId: string
  auditBundle: AuditBundle
  downloadUrls: {
    auditBundle: string
    originalPdf: string
    finalText: string
    finalDocument: string
  }
}

export interface ReprocessDocumentRequest {
  forceLocale?: string
  forcePolicyType?: string
  forceEngines?: OCREngine[]
  reprocessFrom?: DocumentStage
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    traceId?: string
  }
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  uptime: number
  checks: Array<{
    name: string
    status: 'pass' | 'fail'
    latencyMs?: number
    message?: string
  }>
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const SUPPORTED_LOCALES = [
  'tr-TR', // Turkish (Turkey)
  'de-DE', // German (Germany)
  'en-GB', // English (UK)
  'en-US', // English (US)
  'fr-FR', // French (France)
  'es-ES', // Spanish (Spain)
  'it-IT', // Italian (Italy)
  'nl-NL', // Dutch (Netherlands)
  'pl-PL', // Polish (Poland)
] as const

export const SUPPORTED_POLICY_TYPES = [
  'motor_kasko', // Comprehensive auto
  'motor_traffic', // Third-party liability
  'property_fire', // Fire insurance
  'property_dask', // Earthquake (Turkey)
  'marine_cargo', // Cargo insurance
  'marine_hull', // Hull insurance
  'liability_general', // General liability
  'liability_professional', // Professional liability
  'health_individual', // Individual health
  'health_group', // Group health
  'life_term', // Term life
  'life_whole', // Whole life
  'travel', // Travel insurance
  'cyber', // Cyber insurance
  'unknown', // Fallback
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export type SupportedPolicyType = (typeof SUPPORTED_POLICY_TYPES)[number]
