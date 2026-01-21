/**
 * Extraction Pipeline Types
 *
 * Types for the 3-step extraction pipeline:
 * Step 1: Normalize - Clean text with section markers
 * Step 2: Extract - Type-specific extraction with evidence tracking
 * Step 3: Analyze - Gap analysis with benchmark citations
 */

import type { PolicyType } from './policy'

// ============================================================================
// STEP 1: NORMALIZATION TYPES
// ============================================================================

export interface SectionMarker {
  section: string // e.g., "TEMİNATLAR", "ÖZEL ŞARTLAR"
  sectionTr: string // Turkish display name
  startLine: number
  endLine: number
  pageNumber?: number
  confidence: number // 0-1
}

export interface NormalizationWarning {
  type:
    | 'ocr_artifact'
    | 'truncation'
    | 'encoding'
    | 'missing_section'
    | 'page_break'
    | 'garbled_text'
  message: string
  location?: { line: number; page?: number }
  severity: 'low' | 'medium' | 'high'
}

export interface NormalizationResult {
  rawText: string // Original, never modified
  normalizedText: string // Cleaned with section markers
  sectionMarkers: SectionMarker[]
  warnings: NormalizationWarning[]
  stats: {
    originalLength: number
    normalizedLength: number
    sectionsIdentified: number
    warningsCount: number
    processingTimeMs: number
  }
}

// ============================================================================
// STEP 2: EXTRACTION TYPES
// ============================================================================

export interface EvidenceEntry {
  quote: string // Exact text from source
  location: string // e.g., "Section: TEMİNATLAR, Line 45"
  pageNumber?: number
  confidence: number // 0-1
}

/**
 * Evidence map: maps field paths to source evidence
 * e.g., "vehicles[0].plate" -> {quote: "Plaka: 34 ABC 123", location: "Line 12"}
 */
export type EvidenceMap = Record<string, EvidenceEntry>

export interface ExtractionError {
  type:
    | 'missing_required'
    | 'parse_error'
    | 'currency_unknown'
    | 'inconsistency'
    | 'validation_failed'
    | 'ambiguous_value'
  field: string // Field path (e.g., "policyNumber", "vehicles[0].plate")
  message: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  evidenceQuote?: string // What we found in the text
}

export interface ExtractionWarning {
  type: 'low_confidence' | 'inferred_value' | 'multiple_values' | 'format_normalized'
  field: string
  message: string
  originalValue?: string
  normalizedValue?: string
}

// ============================================================================
// KASKO-SPECIFIC EXTRACTION SCHEMA
// ============================================================================

export interface KaskoVehicle {
  plate: string | null
  make: string | null // Marka
  model: string | null
  year: number | null
  chassisNo: string | null // Şasi No
  engineNo: string | null // Motor No
  color: string | null
  usage: 'hususi' | 'ticari' | null // Private/Commercial
  vehicleClass: string | null // Binek, Kamyonet, TIR, etc.
  fuelType: string | null
  vehicleValue: {
    amount: number | null
    isMarketValue: boolean // Rayiç Değer
    currency: string // TRY, USD, EUR
  }
}

export interface KaskoCoverage {
  id: string // Unique ID for evidence mapping
  name: string
  nameTr: string
  limit: number | null
  deductible: number | null
  deductiblePercent: number | null // e.g., 10% of damage
  isUnlimited: boolean
  isMarketValue: boolean
  isIncluded: boolean
  category: 'main' | 'liability' | 'supplementary' | 'assistance' | 'legal' | 'other'
  subLimit?: number | null // Sub-limits within coverage
  waitingPeriod?: number | null // Days
  conditions?: string[] // Special conditions
}

export interface KaskoExtractionJSON {
  // Policy identification
  policyNumber: string | null
  endorsementNumber: string | null // Zeyilname no
  provider: string | null
  agencyCode: string | null
  agencyName: string | null

  // Dates
  issueDate: string | null // ISO format
  startDate: string | null
  endDate: string | null
  isRenewal: boolean

  // Parties
  insured: {
    name: string | null
    tcKimlikNo: string | null // Redacted token or null
    taxNo: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  policyHolder: {
    name: string | null
    tcKimlikNo: string | null
    isSameAsInsured: boolean
  } | null
  beneficiary: {
    name: string | null
    type: 'dain_mürtehin' | 'lehdar' | null
    bankName: string | null
  } | null

  // Vehicle(s)
  vehicles: KaskoVehicle[]

  // Financial
  premium: {
    gross: number | null
    net: number | null
    tax: number | null
    currency: string // TRY
  }
  paymentInfo: {
    frequency: 'annual' | 'semi-annual' | 'quarterly' | 'monthly' | null
    installments: number | null
    firstPaymentDate: string | null
  } | null

  // Coverages
  coverages: KaskoCoverage[]

  // Exclusions and conditions
  exclusions: string[]
  specialConditions: string[]
  clauses: string[] // Referenced kloz numbers

  // Amendment info (if zeyilname)
  amendment: {
    isAmendment: boolean
    type: 'teminat_artırımı' | 'araç_değişikliği' | 'iptal' | 'other' | null
    reason: string | null
    basePolicyNumber: string | null
    premiumDifference: number | null
  }

  // Metadata
  documentType: 'policy' | 'zeyilname' | 'teklif' | 'unknown'
  extractionConfidence: number // 0-1 overall
}

// ============================================================================
// QA SCORING TYPES
// ============================================================================

export interface QAGate {
  id: string
  name: string
  description: string
  maxScoreIfFailed: number // Score capped at this if gate fails
  check: (extraction: KaskoExtractionJSON, normalizedText: string) => boolean
}

export interface QAGateResult {
  gateId: string
  gateName: string
  passed: boolean
  details: string
  maxScoreIfFailed?: number
}

export interface QAScoreResult {
  score: number // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  passedGates: QAGateResult[]
  failedGates: QAGateResult[]
  scoreBreakdown: {
    baseScore: number
    deductions: { reason: string; points: number }[]
    bonuses: { reason: string; points: number }[]
  }
  recommendations: string[]
}

// ============================================================================
// CONTRADICTION DETECTION TYPES
// ============================================================================

export interface Contradiction {
  id: string
  fieldPath: string // e.g., "policyNumber", "vehicles[0].plate"
  extractedValue: string | number | null
  detectedValue: string // What was found in text via regex/scan
  evidenceQuote: string // The text snippet where detected
  location: string // Where in document
  severity: 'critical' | 'high' | 'medium' | 'low'
  type:
    | 'mismatch'
    | 'missing_in_extraction'
    | 'multiple_values'
    | 'format_difference'
    | 'currency_conflict'
}

export interface ContradictionReport {
  contradictions: Contradiction[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  overallIntegrity: 'high' | 'medium' | 'low' | 'critical'
}

// ============================================================================
// DATA REQUESTS TYPES
// ============================================================================

export interface DataRequest {
  id: string
  type:
    | 'missing_page'
    | 'missing_annex'
    | 'missing_premium_breakdown'
    | 'missing_endorsement'
    | 'missing_schedule'
    | 'illegible_section'
    | 'clarification_needed'
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  affectedFields: string[] // Field paths affected
  suggestedAction: string
}

export interface DataRequestsReport {
  requests: DataRequest[]
  summary: {
    total: number
    critical: number
    blockers: number // Requests that block finalization
  }
  canFinalize: boolean // False if any critical requests
}

// ============================================================================
// STEP 3: ANALYSIS TYPES
// ============================================================================

export interface GapEntry {
  id: string
  type: 'missing_coverage' | 'low_limit' | 'high_deductible' | 'dangerous_exclusion' | 'compliance'
  description: string
  descriptionTr: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  evidenceQuote: string | null // From extraction
  benchmarkRef: {
    packId: string
    entryId: string
    title: string
  } | null
  financialExposure: number | null // Estimated exposure in TRY
  recommendation: string
}

export interface NegotiationPoint {
  id: string
  point: string
  pointTr: string
  rationale: string
  priority: 'high' | 'medium' | 'low'
  evidenceQuote: string // Supporting evidence from policy
  estimatedSavings: number | null // If applicable
}

export interface DraftEndorsement {
  id: string
  title: string
  titleTr: string
  content: string // Suggested endorsement text
  reason: string
  affectedCoverages: string[] // Coverage IDs
  estimatedPremiumImpact: number | null
}

export interface AnalysisResult {
  // Gap analysis
  gapRegister: GapEntry[]
  gapSummary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    totalFinancialExposure: number
  }

  // Negotiation points
  negotiationPoints: NegotiationPoint[]

  // Draft endorsements
  draftEndorsements: DraftEndorsement[]

  // Citations
  benchmarkCitations: {
    entryId: string
    packId: string
    title: string
    usedFor: string // What analysis point this was used for
  }[]
  evidenceCitations: {
    fieldPath: string
    quote: string
    analysisPoint: string
  }[]

  // Summary
  summary: {
    overallRating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
    topRecommendation: string
    estimatedTotalExposure: number
    keyStrengths: string[]
    keyWeaknesses: string[]
  }

  // Metadata
  analysisVersion: string
  benchmarkPackVersion: string | null
  timestamp: string
}

// ============================================================================
// BENCHMARK PACK TYPES
// ============================================================================

export type BenchmarkSourceType = 'SEDDK' | 'GenelSart' | 'MarketPractice' | 'Regulation'
export type BenchmarkCategory =
  | 'coverage_limit'
  | 'deductible'
  | 'exclusion'
  | 'premium'
  | 'general'
  | 'compliance'

export interface BenchmarkEntry {
  entryId: string
  title: string
  titleTr: string
  text: string // The benchmark content
  sourceType: BenchmarkSourceType
  sourceDocument?: string // e.g., "SEDDK Genelge 2025/5"
  dateEffective: string // ISO date
  category: BenchmarkCategory
  policyType: PolicyType
  tags: string[]
  numericValue?: number // For limits/deductibles
  unit?: string // TRY, %, days, etc.
}

export interface BenchmarkPack {
  id: string
  policyType: PolicyType
  version: string // e.g., "2026-01"
  name: string
  description: string
  entries: BenchmarkEntry[]
  entryCount: number
  sourceDocuments: { name: string; url?: string; date: string }[]
  isActive: boolean
  isDefault: boolean
  effectiveDate: string
  expiresDate?: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// FULL PIPELINE TYPES
// ============================================================================

export interface ExtractionRunRecord {
  id: string
  documentId: string
  policyType: PolicyType
  promptVersion: string
  model: string
  provider: 'openai' | 'anthropic'
  extractionJson: KaskoExtractionJSON // Or generic type for other policy types
  evidenceMap: EvidenceMap
  scoreJson: QAScoreResult
  contradictionsJson: ContradictionReport
  errors: ExtractionError[]
  warnings: ExtractionWarning[]
  dataRequests: DataRequest[]
  processingTimeMs: number
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    costEstimate: number
  }
  isLatest: boolean
  createdAt: string
}

export interface AnalysisRunRecord {
  id: string
  extractionRunId: string
  benchmarkPackId: string | null
  promptVersion: string
  model: string
  provider: 'openai' | 'anthropic'
  result: AnalysisResult
  processingTimeMs: number
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    costEstimate: number
  }
  createdAt: string
}

export interface DocumentRecord {
  id: string
  userId: string
  fileName: string
  fileHash: string | null
  fileSizeBytes: number | null
  pageCount: number | null
  rawText: string
  normalizedText: string | null
  normalizationWarnings: NormalizationWarning[]
  sectionMarkers: SectionMarker[]
  status: 'pending' | 'normalized' | 'extracted' | 'analyzed' | 'failed'
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================================
// PIPELINE REQUEST/RESPONSE TYPES
// ============================================================================

export interface PipelineOptions {
  // Step 1: Normalization
  skipNormalization?: boolean
  preserveFormatting?: boolean

  // Step 2: Extraction
  policyType?: PolicyType // Auto-detect if not provided
  provider?: 'openai' | 'anthropic'
  model?: string
  promptVersion?: string
  consensusMode?: boolean // Use multiple providers

  // Step 3: Analysis
  skipAnalysis?: boolean
  benchmarkPackId?: string // Use specific pack
  includeNegotiationPoints?: boolean
  includeDraftEndorsements?: boolean
}

export interface PipelineResult {
  // Document
  document: {
    id: string
    fileName: string
    status: DocumentRecord['status']
  }

  // Step 1 result
  normalization: NormalizationResult | null

  // Step 2 result
  extraction: {
    runId: string
    policyType: PolicyType
    data: KaskoExtractionJSON // Or generic
    evidenceMap: EvidenceMap
    errors: ExtractionError[]
    warnings: ExtractionWarning[]
  } | null

  // QA result
  qa: QAScoreResult | null

  // Contradiction check
  contradictions: ContradictionReport | null

  // Data requests
  dataRequests: DataRequestsReport | null

  // Step 3 result
  analysis: AnalysisResult | null

  // Overall status
  status: 'success' | 'partial' | 'failed'
  errors: string[]
  processingTimeMs: number
}
