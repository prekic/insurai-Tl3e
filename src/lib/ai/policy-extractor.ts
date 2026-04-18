import {
  isAIConfigured,
  AI_CONFIG,
  getConfiguredProviders,
  isProxyConfigured,
  getProxyUrl,
  type AIProvider,
} from './config'
import { getAIConfig } from '@/lib/config'
import type { ProcessingLogger } from '@/lib/processing-logger'
import { isPDFFile, extractTextFromPDFWithRetry } from './pdf-parser'
import {
  extractWithDocumentAI,
  isDocumentOCRAvailable,
  type PageText,
  type FormField,
  type Table,
} from './document-ocr'
import { extractFormFieldMap, findFormField, TURKISH_FORM_FIELD_PATTERNS } from './ocr'
import { parseTurkishCurrency, extractVehicleInfoFromText, parseTurkishDate } from './turkish-utils'
import { parseTablesForCoverages, mergeCoveragesWithTableData } from './table-parser'
import { extractWithConsensus, type ConsensusResult } from './providers/consensus'
import { extractWithOpenAI } from './providers/openai'
import { extractWithClaude } from './providers/claude'
import {
  processTextWithAI,
  applyBasicOCRCorrections,
  textNeedsProcessing,
  processTextEnhanced,
  type CleanRoomResult,
} from './text-processor'
import { ExtractedPolicyData, ExtractedCoverage } from './extraction-schema'
import type { AnalyzedPolicy, PolicyType, Coverage, CoverageImportance } from '@/types/policy'
import { POLICY_TYPES } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import { generateAnalysisBundle } from '@/lib/analysis/engine'
import {
  generateMarketComparisonData,
  generateMarketComparisonDataAsync,
} from '@/lib/market-data/service'
import { marketDataProvider } from '@/lib/market-data/market-data-provider'
import { RiskAssessmentService } from '@/lib/ml'
import { GapDetectionService } from '@/lib/gap-detection'
import { validateCurrencyRegion } from '@/lib/utils'
import {
  validateAndEnhanceExtraction,
  mergeExtractionResults,
  type ValidationResult,
} from '@/lib/extraction'
import { lookupCoverageNameTr } from '@/lib/i18n/coverage-names'
import { ensureExclusionsEn } from '@/lib/i18n/exclusion-translations'
import { TR_TRANSLATIONS } from '@/lib/i18n/translations-tr'
import { validateExtractionSafety } from './validator'
import { resolveClauseRelationships } from './relationship-resolver'
import {
  evaluatePilotAdmission,
  createPilotQARecord,
  evaluateSimpleDisplayMode,
  type PilotAdmissionGateResult,
  type PilotQARecord,
} from '@/lib/analysis/kasko-pilot-gate'

export interface ExtractionResult {
  success: true
  policy: AnalyzedPolicy
  extractedData: ExtractedPolicyData
  source: 'ai' | 'fallback' | 'ocr'
  /** True when extraction confidence is below warningConfidence but above minConfidence */
  lowConfidence?: boolean
  /** The raw AI confidence score (0-1) */
  confidenceScore?: number
  // Multi-model consensus info
  consensus?: {
    providers: AIProvider[]
    agreement: number
    score: number
  }
  // Clean-room processing output (when enabled)
  cleanRoomOutput?: CleanRoomResult
  // Turkish pattern validation results
  patternValidation?: {
    errors: string[]
    warnings: string[]
    enhanced: string[]
  }
  // Document AI OCR data (always present with OCR-first approach)
  documentOCR?: {
    /** SHA-256 hash of original PDF */
    pdfHash: string
    /** Per-page text extraction */
    pages: PageText[]
    /** Overall OCR confidence */
    confidence: number
    /** Form fields extracted */
    formFields: FormField[]
    /** Tables extracted */
    tables: Table[]
    /** Fields used to enhance AI extraction */
    fieldsUsed: number
    /** Coverages extracted from tables */
    tableCoveragesUsed: number
    /** Processing time in ms */
    processingTimeMs: number
    /** Warnings from OCR */
    warnings: string[]
  }
  /** Client-side pipeline phase timing breakdown (ms) */
  clientPhaseTiming?: Record<string, number>
  /** Pilot admission gate result (KASKO only, when pilot is active) */
  pilotAdmission?: {
    status: string
    reason: string
    countedInPilotMetrics: boolean
  }
}

export interface ExtractionError {
  success: false
  error: {
    code:
      | 'NO_AI_CONFIG'
      | 'PDF_PARSE_ERROR'
      | 'PDF_TIMEOUT'
      | 'PDF_WORKER_ERROR'
      | 'FILE_READ_ERROR'
      | 'AI_ERROR'
      | 'INVALID_FILE'
      | 'LOW_CONFIDENCE'
      | 'OCR_ERROR'
      | 'NETWORK_ERROR'
      | 'TIMEOUT'
      | 'RATE_LIMIT_EXCEEDED'
      | 'INVALID_API_KEY'
      | 'BILLING_ERROR'
      | 'DOCUMENT_TOO_LARGE'
      | 'INVALID_RESPONSE'
      | 'PROVIDER_OVERLOADED'
    message: string
    details?: string
    // Enhanced error info for debugging
    stack?: string
    type?: string
  }
  fallbackAvailable: boolean
  /** Client-side pipeline phase timing breakdown (ms) */
  clientPhaseTiming?: Record<string, number>
  /** Server or client error code for diagnostic display */
  errorCode?: string
  /** Server request ID for log correlation */
  requestId?: string
}

export type ExtractionResponse = ExtractionResult | ExtractionError

export interface ExtractionOptions {
  useFallback?: boolean
  useOCR?: boolean // Legacy option, OCR-first is now always used
  useConsensus?: boolean
  useCleanRoom?: boolean // Use deterministic clean-room processing (default: true)
  primaryProvider?: AIProvider
  providers?: AIProvider[]
  /** Optional logger for tracking processing stages with actual data */
  logger?: ProcessingLogger
  /** Authenticated user's Supabase UUID — forwarded as x-user-id to trigger push notifications */
  userId?: string
  /** AbortSignal to cancel in-flight extraction requests on component unmount */
  signal?: AbortSignal
}

/**
 * Default confidence scoring weights (used when DB config unavailable).
 */
const DEFAULT_CONFIDENCE_WEIGHTS = {
  policyNumber: 0.2,
  provider: 0.15,
  dates: 0.2,
  premium: 0.2,
  coverages: 0.25,
}

/**
 * Recalculate overall confidence using weighted formula.
 * Weights are configurable via Admin Settings > AI > Confidence Scoring Weights.
 * This ensures consistent scoring regardless of AI model behavior.
 */
function recalculateOverallConfidence(
  confidence:
    | {
        overall?: number
        policyNumber?: number
        provider?: number
        dates?: number
        premium?: number
        coverages?: number
      }
    | undefined
    | null,
  fallback: number,
  weights = DEFAULT_CONFIDENCE_WEIGHTS
): number {
  if (!confidence) {
    return fallback
  }

  const pn = confidence.policyNumber
  const pr = confidence.provider
  const dt = confidence.dates
  const pm = confidence.premium
  const cv = confidence.coverages

  // If any per-field scores are missing, use the AI-reported overall
  if (pn == null || pr == null || dt == null || pm == null || cv == null) {
    return fallback
  }

  const calculated =
    pn * weights.policyNumber +
    pr * weights.provider +
    dt * weights.dates +
    pm * weights.premium +
    cv * weights.coverages

  return calculated
}

/**
 * Safely get lowercase name from coverage, handling undefined/null
 */
function getCoverageName(
  coverage: { name?: string | null; description?: string | null } | undefined | null
): string {
  if (!coverage) return ''
  // Try name first, fall back to description
  return (coverage.name || coverage.description || '').toLowerCase()
}

/**
 * Determine coverage importance based on category and characteristics
 */
function determineCoverageImportance(coverage: ExtractedCoverage): CoverageImportance {
  const nameLower = getCoverageName(coverage)

  // Critical coverages - main coverage, high limits, or essential protections
  if (coverage.category === 'main') return 'critical'
  if (coverage.isMarketValue) return 'critical'
  if (coverage.isUnlimited) return 'critical'

  // Standard coverages - liability, legal, most supplementary
  if (coverage.category === 'liability') return 'standard'
  if (coverage.category === 'legal') return 'standard'
  if (coverage.limit && coverage.limit >= 100000) return 'standard'

  // Check for important coverage names
  if (nameLower.includes('mali sorumluluk')) return 'standard'
  if (nameLower.includes('hırsızlık')) return 'standard'
  if (nameLower.includes('deprem')) return 'standard'
  if (nameLower.includes('yangın')) return 'standard'

  // Minor coverages - assistance, small limits
  if (coverage.category === 'assistance') return 'minor'
  if (coverage.limit && coverage.limit < 50000) return 'minor'

  return 'standard'
}

/**
 * Calculate the main coverage value based on policy type
 * For kasko: use vehicle value (Rayiç Değer) or main coverage, NOT sum of all limits
 * For other types: use sum of main coverages or highest coverage
 */
function calculateMainCoverage(policyType: PolicyType, coverages: Coverage[]): number {
  // For kasko and nakliyat: find the main/vehicle coverage
  if (policyType === 'kasko' || policyType === 'nakliyat') {
    // Look for market value coverage first
    const marketValueCoverage = coverages.find((c) => c.isMarketValue)
    if (marketValueCoverage) {
      // Market value - use 0 as placeholder since actual value varies
      // The display should show "Rayiç Değer" instead of a number
      return 0
    }

    // Look for main category coverage
    const mainCoverage = coverages.find((c) => c.category === 'main' && c.limit > 0)
    if (mainCoverage) {
      return mainCoverage.limit
    }

    // Look for coverage that looks like vehicle value
    const vehicleValue = coverages.find((c) => {
      const nameLower = getCoverageName(c)
      return (
        (nameLower.includes('araç bedeli') ||
          nameLower.includes('araç değeri') ||
          nameLower.includes('sigorta bedeli') ||
          (nameLower.includes('kasko') && !nameLower.includes('mali'))) &&
        c.limit > 0
      )
    })
    if (vehicleValue) {
      return vehicleValue.limit
    }

    // Fallback: find the highest non-liability coverage
    const nonLiabilityCoverages = coverages.filter((c) => {
      const nameLower = getCoverageName(c)
      return (
        c.category !== 'liability' &&
        !nameLower.includes('mali sorumluluk') &&
        !nameLower.includes('hukuki') &&
        c.limit > 0
      )
    })
    if (nonLiabilityCoverages.length > 0) {
      return Math.max(...nonLiabilityCoverages.map((c) => c.limit))
    }
  }

  // For traffic insurance: use the highest bodily injury limit
  if (policyType === 'traffic') {
    const bodilyInjury = coverages.find((c) => {
      const nameLower = getCoverageName(c)
      return nameLower.includes('bedeni') || nameLower.includes('ölüm')
    })
    if (bodilyInjury && bodilyInjury.limit > 0) {
      return bodilyInjury.limit
    }
  }

  // For other policy types: sum only main category coverages, or use highest
  const mainCoverages = coverages.filter((c) => c.category === 'main' && c.limit > 0)
  if (mainCoverages.length > 0) {
    return mainCoverages.reduce((sum, c) => sum + c.limit, 0)
  }

  // Fallback: use the highest individual coverage limit
  const validLimits = coverages.filter((c) => c.limit > 0).map((c) => c.limit)
  if (validLimits.length > 0) {
    return Math.max(...validLimits)
  }

  return 0
}

/**
 * Extract policy data from a document file
 * Uses AI when available, falls back to sample data otherwise
 * Supports multi-model consensus and OCR for scanned documents
 */
export async function extractPolicyFromDocument(
  file: File,
  options: ExtractionOptions = {}
): Promise<ExtractionResponse> {
  const {
    useFallback = true,
    // useOCR is a legacy option, OCR-first is now always used
    useConsensus = true,
    useCleanRoom = true, // Default to clean-room processing
    primaryProvider,
    providers,
    logger, // Optional processing logger for tracking stages
    userId, // Authenticated user ID for push notification targeting
    signal, // AbortSignal for cancelling in-flight requests on unmount
  } = options

  // Pipeline phase timing for diagnostic visibility
  const pipelineStart = performance.now()
  const clientPhaseTiming: Record<string, number> = {}
  function markClientPhase(name: string, startMs: number) {
    clientPhaseTiming[name] = Math.round(performance.now() - startMs)
  }

  // Validate file type
  if (!isPDFFile(file)) {
    logger?.fail('Invalid file type: ' + file.type)
    return {
      success: false,
      error: {
        code: 'INVALID_FILE',
        message: 'Only PDF files are supported for AI extraction',
        details: `Received file type: ${file.type}`,
      },
      fallbackAvailable: useFallback,
    }
  }

  // Check if AI is configured
  if (!isAIConfigured()) {
    console.error(
      '[PolicyExtractor] FALLBACK TRIGGERED: AI not configured. isProxyConfigured:',
      isProxyConfigured()
    )
    if (useFallback) {
      return createFallbackResult(file)
    }
    logger?.fail('AI not configured')
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIG',
        message: 'AI extraction is not configured',
        details:
          'Ensure the backend server is running on port 4001 with OPENAI_API_KEY or ANTHROPIC_API_KEY set in .env (not VITE_ prefixed - API keys must stay server-side)',
      },
      fallbackAvailable: false,
    }
  }

  // ========== TEXT EXTRACTION STAGE ==========
  // Try Document AI OCR first, fall back to pdf.js if unavailable
  logger?.startStage('ocr_processing', {
    filename: file.name,
    file_size: file.size,
    strategy: 'document-ai-first-with-pdfjs-fallback',
    backend: 'document-ai',
  })

  // Variables to hold extraction results (from either Document AI or pdf.js)
  let documentText: string = ''
  let ocrFormFields: FormField[] = []
  let ocrTables: Table[] = []
  let usedOCR = false
  let extractionMethod: 'document-ai' | 'pdf.js' | 'none' = 'none'
  let pageCount = 0
  // Store full Document AI data for result object (when available)
  let documentAIOcrData: {
    pdfHash: string
    pages: PageText[]
    confidence: number
    metadata: { processingTimeMs: number; warnings: string[] }
  } | null = null

  // Try Document AI OCR first (if available)
  const documentAIAvailable = isDocumentOCRAvailable()
  console.warn('[PolicyExtractor] Document AI available:', documentAIAvailable)

  const ocrPhaseStart = performance.now()
  if (documentAIAvailable) {
    console.warn('[PolicyExtractor] Attempting Document AI extraction...')
    const ocrResult = await extractWithDocumentAI(file)
    markClientPhase('documentAI_ms', ocrPhaseStart)
    console.warn(
      '[PolicyExtractor] Document AI result success:',
      ocrResult.success,
      `(${clientPhaseTiming['documentAI_ms']}ms)`
    )

    if (ocrResult.success) {
      // Document AI succeeded - use its results
      const ocrData = ocrResult.data
      documentText = ocrData.text
      ocrFormFields = ocrData.formFields
      ocrTables = ocrData.tables
      usedOCR = true
      extractionMethod = 'document-ai'
      pageCount = ocrData.pageCount
      // Store full data for result object
      documentAIOcrData = {
        pdfHash: ocrData.pdfHash,
        pages: ocrData.pages,
        confidence: ocrData.confidence,
        metadata: ocrData.metadata,
      }

      // Log Document AI success
      logger?.setOCRUsed('document-ai')
      logger?.setPageCount(ocrData.pageCount)
      logger?.completeStage({
        output: {
          text_length: documentText.length,
          text_preview: documentText.substring(0, 500) + '...',
          page_count: ocrData.pageCount,
          confidence: ocrData.confidence,
          pdf_hash: ocrData.pdfHash,
          form_fields_count: ocrFormFields.length,
          tables_count: ocrTables.length,
          processing_time_ms: ocrData.metadata.processingTimeMs,
          warnings: ocrData.metadata.warnings,
        },
        metadata: {
          pages: ocrData.pages.map((p) => ({
            page: p.pageNumber,
            chars: p.text.length,
            confidence: p.confidence,
            warnings: p.warnings,
          })),
          form_fields: ocrFormFields.slice(0, 10),
          tables_structure: ocrTables.map((t) => ({
            page: t.pageNumber,
            rows: t.rows?.length || 0,
            cols: t.rows?.[0]?.cells?.length || 0,
          })),
        },
        full_output_text: documentText,
      })

      if (import.meta.env.DEV) {
        console.warn(
          `[Document AI OCR] ${ocrData.pageCount} pages, ` +
            `${(ocrData.confidence * 100).toFixed(1)}% confidence, ` +
            `${ocrFormFields.length} form fields, ` +
            `${ocrTables.length} tables, ` +
            `${ocrData.metadata.processingTimeMs}ms`
        )
      }
    } else {
      // Document AI failed - properly close the stage and log error details
      console.warn('[PolicyExtractor] Document AI FAILED:', ocrResult.error.message)
      console.warn('[PolicyExtractor] Document AI error code:', ocrResult.error.code)
      console.warn('[PolicyExtractor] Document AI error details:', ocrResult.error.details)
      console.warn('[PolicyExtractor] Will try pdf.js fallback...')

      // IMPORTANT: Fail the ocr_processing stage BEFORE starting pdf_extraction
      // This prevents "Stage interrupted by new stage" error
      logger?.failStage(`Document AI OCR failed: ${ocrResult.error.message}`, {
        error_code: ocrResult.error.code,
        error_details: ocrResult.error.details,
        will_try_fallback: true,
        fallback_method: 'pdf.js',
      })
    }
  } else {
    // Document AI not available - fail the already-started ocr_processing stage
    console.warn('[PolicyExtractor] Document AI not available, will try pdf.js fallback')

    // IMPORTANT: Fail the ocr_processing stage BEFORE starting pdf_extraction
    // The stage was already started at line 268, so we must fail it (not skip)
    // This prevents "Stage interrupted by new stage" error
    logger?.failStage('Document AI not configured', {
      reason: 'not_configured',
      proxy_url_set: !!import.meta.env.VITE_API_PROXY_URL,
      will_try_fallback: true,
      fallback_method: 'pdf.js',
      note: 'Configure GCP_SERVICE_ACCOUNT_BASE64 environment variable for Document AI',
    })
  }

  // If Document AI didn't work (not available or failed), try pdf.js
  console.warn('[PolicyExtractor] extractionMethod after Document AI attempt:', extractionMethod)
  if (extractionMethod === 'none') {
    const pdfjsStart = performance.now()
    console.warn('[PolicyExtractor] Starting pdf.js fallback extraction...')
    logger?.startStage('pdf_extraction', {
      filename: file.name,
      file_size: file.size,
      fallback_reason: documentAIAvailable ? 'document-ai-failed' : 'document-ai-not-configured',
    })

    const pdfResult = await extractTextFromPDFWithRetry(file)
    markClientPhase('pdfjs_ms', pdfjsStart)
    console.warn(
      '[PolicyExtractor] pdf.js extraction result success:',
      pdfResult.success,
      `(${clientPhaseTiming['pdfjs_ms']}ms)`
    )

    if (pdfResult.success) {
      // pdf.js succeeded
      documentText = pdfResult.data.text
      pageCount = pdfResult.data.pageCount
      extractionMethod = 'pdf.js'
      usedOCR = false // pdf.js extracts native text, not OCR
      console.warn(
        `[PolicyExtractor] pdf.js SUCCESS: ${pageCount} pages, ${documentText.length} chars`
      )

      logger?.setOCRUsed('pdf.js')
      logger?.setPageCount(pageCount)
      logger?.completeStage({
        output: {
          text_length: documentText.length,
          text_preview: documentText.substring(0, 500) + '...',
          page_count: pageCount,
          metadata: pdfResult.data.metadata,
        },
        full_output_text: documentText,
      })
    } else {
      console.error('[PolicyExtractor] pdf.js ALSO FAILED:', pdfResult.error.message)
      // Both Document AI and pdf.js failed
      logger?.failStage(`pdf.js extraction also failed: ${pdfResult.error.message}`)

      if (useFallback) {
        console.error(
          '[PolicyExtractor] FALLBACK TRIGGERED: Both Document AI and pdf.js text extraction failed'
        )
        return createFallbackResult(file)
      }

      return {
        success: false,
        error: {
          code: 'OCR_ERROR',
          message: documentAIAvailable
            ? `Document AI failed and pdf.js fallback also failed: ${pdfResult.error.message}`
            : `Document AI not configured and pdf.js extraction failed: ${pdfResult.error.message}`,
          details:
            'Ensure the backend server is running with Document AI configured, or the PDF contains extractable text',
        },
        fallbackAvailable: true,
      }
    }
  }

  if (!documentText || documentText.trim().length === 0) {
    console.error(
      '[PolicyExtractor] FALLBACK TRIGGERED: No text extracted from document (empty after OCR/pdf.js)'
    )
    logger?.failStage('No text could be extracted from the document')
    if (useFallback) {
      return createFallbackResult(file)
    }
    return {
      success: false,
      error: {
        code: 'OCR_ERROR',
        message: 'No text could be extracted from the document',
        details: 'The PDF appears to be empty or contains only images without OCR text',
      },
      fallbackAvailable: true,
    }
  }

  // ========== TEXT PREPROCESSING STAGE ==========
  markClientPhase('textExtraction_total_ms', ocrPhaseStart) // Total time for OCR/pdf.js phase
  const preprocessStart = performance.now()
  logger?.startStage('text_preprocessing', {
    text_length: documentText.length,
    use_clean_room: useCleanRoom,
  })

  // Process text to correct OCR errors and improve readability
  let processedText = documentText
  let cleanRoomResult: CleanRoomResult | undefined

  // Use clean-room processing for deterministic, auditable results
  if (useCleanRoom) {
    try {
      const processingResult = await processTextEnhanced(documentText, {
        useCleanRoom: true,
        provider: primaryProvider || 'openai',
        preserveStructure: true,
        source: file.name,
      })

      if (processingResult.success) {
        processedText = processingResult.processedText
        cleanRoomResult = processingResult.cleanRoomOutput
      }
    } catch (error) {
      // Clean-room processing failed, fall back to legacy
      console.warn('Clean-room processing failed, using legacy:', error)
      if (textNeedsProcessing(documentText)) {
        const basicResult = applyBasicOCRCorrections(documentText)
        processedText = basicResult.text
      }
    }
  } else if (textNeedsProcessing(documentText)) {
    // Legacy AI-assisted processing
    try {
      const processingResult = await processTextWithAI(documentText, {
        provider: primaryProvider || 'openai',
        preserveStructure: true,
      })

      if (processingResult.success) {
        processedText = processingResult.processedText
      }
    } catch (error) {
      // Text processing is optional, continue with raw text
      console.warn('Text processing failed, using raw text:', error)
      // At minimum apply basic OCR corrections
      const basicResult = applyBasicOCRCorrections(documentText)
      processedText = basicResult.text
    }
  }

  // Calculate diff summary for admin debugging
  const calculateDiffSummary = (before: string, after: string) => {
    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    const changedLines = beforeLines.filter((line, i) => line !== afterLines[i]).length

    // Find major changes (lines that are substantially different)
    const majorChanges: string[] = []
    for (let i = 0; i < Math.min(beforeLines.length, afterLines.length, 100); i++) {
      if (beforeLines[i] !== afterLines[i]) {
        const before_trimmed = beforeLines[i]?.substring(0, 50) || ''
        const after_trimmed = afterLines[i]?.substring(0, 50) || ''
        if (before_trimmed.length > 5 || after_trimmed.length > 5) {
          majorChanges.push(`Line ${i + 1}: "${before_trimmed}..." → "${after_trimmed}..."`)
          if (majorChanges.length >= 10) break
        }
      }
    }

    return {
      characters_added: Math.max(0, after.length - before.length),
      characters_removed: Math.max(0, before.length - after.length),
      lines_changed: changedLines,
      major_changes: majorChanges,
    }
  }

  // Log text preprocessing completion with full content for admin debugging
  logger?.completeStage({
    output: {
      processed_text_length: processedText.length,
      processed_text_preview: processedText.substring(0, 500) + '...',
      chars_changed: documentText.length - processedText.length,
      clean_room_used: useCleanRoom,
    },
    // Full text content for admin debugging
    full_input_text: documentText,
    full_output_text: processedText,
    diff_summary: calculateDiffSummary(documentText, processedText),
  })

  // ========== AI EXTRACTION STAGE ==========
  markClientPhase('textPreprocessing_ms', preprocessStart)
  const aiExtractionStart = performance.now()
  const configuredProviders = getConfiguredProviders()
  // When proxy is configured, bypass consensus - the unified endpoint handles Anthropic→OpenAI fallback
  const useMultiProvider = useConsensus && configuredProviders.length > 1 && !isProxyConfigured()
  const provider = primaryProvider || configuredProviders[0]

  // Set extraction mode for observability
  if (useMultiProvider) {
    logger?.setExtractionMode('consensus')
  } else if (isProxyConfigured()) {
    logger?.setExtractionMode('proxy')
  } else {
    logger?.setExtractionMode('direct')
  }

  logger?.startStage('ai_extraction', {
    text_length: processedText.length,
    provider: useMultiProvider ? 'consensus' : provider,
    multi_provider: useMultiProvider,
    extraction_mode: isProxyConfigured() ? 'proxy' : 'direct',
  })
  logger?.setAIProvider(provider)

  // Declare extractedData outside try block so it's accessible in catch for error context
  let extractedData: ExtractedPolicyData | undefined
  let consensusInfo: ExtractionResult['consensus'] | undefined

  // Call AI for extraction (use processed text for better results)
  try {
    if (useMultiProvider) {
      // Use multi-model consensus (use processed text for better extraction)
      const consensusResult: ConsensusResult = await extractWithConsensus(processedText, {
        providers,
        primaryProvider,
      })

      extractedData = consensusResult.data
      consensusInfo = {
        providers: consensusResult.providerResults.filter((r) => !r.error).map((r) => r.provider),
        agreement: consensusResult.consensus.agreement,
        score: consensusResult.consensus.score,
      }
    } else {
      // Use single provider (use processed text for better extraction)
      console.warn('[PolicyExtractor] Calling extractWithProvider, provider:', provider)
      extractedData = await extractWithProvider(provider, processedText, userId, signal)
      console.warn('[PolicyExtractor] extractWithProvider returned:', {
        hasData: !!extractedData,
        policyNumber: extractedData?.policyNumber,
        provider: extractedData?.provider,
        hasConfidence: !!extractedData?.confidence,
        hasCoverages: !!extractedData?.coverages,
      })
    }

    // Record proxy metadata for observability (route, fallback, request ID)
    if (extractedData._proxyMeta) {
      const meta = extractedData._proxyMeta
      if (meta.requestId) logger?.setRequestId(meta.requestId)
      if (meta.route) logger?.setExtractionRoute(meta.route)
      if (meta.provider) logger?.setAIProvider(meta.provider)
      if (meta.fallback !== undefined || meta.fallbackChain) {
        logger?.setFallbackInfo({
          fallback_used: !!meta.fallback,
          chain: meta.fallbackChain || [{ provider: meta.provider || provider, success: true }],
        })
      }
      // Include server-side timing in client phase timing for full picture
      if (meta.serverPhaseTiming) {
        for (const [key, value] of Object.entries(meta.serverPhaseTiming)) {
          clientPhaseTiming[`server_${key}`] = value
        }
      }
      if (meta.serverElapsedMs !== undefined) {
        clientPhaseTiming['server_total_ms'] = meta.serverElapsedMs
      }
      // Clean up metadata before further processing
      delete extractedData._proxyMeta
    }

    // Recalculate overall confidence using admin-configurable weighted formula.
    // Weights are loaded from DB config; falls back to hardcoded defaults.
    const rawOverall = extractedData.confidence?.overall ?? 0.7
    let confidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS
    try {
      const aiCfg = await getAIConfig()
      confidenceWeights = {
        policyNumber: aiCfg.confidenceWeightPolicyNumber,
        provider: aiCfg.confidenceWeightProvider,
        dates: aiCfg.confidenceWeightDates,
        premium: aiCfg.confidenceWeightPremium,
        coverages: aiCfg.confidenceWeightCoverages,
      }
    } catch {
      // DB unavailable — use hardcoded defaults
    }

    const confidenceOverall = recalculateOverallConfidence(
      extractedData.confidence,
      rawOverall,
      confidenceWeights
    )
    if (extractedData.confidence) {
      extractedData.confidence.overall = confidenceOverall
    }
    logger?.setExtractionConfidence(confidenceOverall * 100)
    logger?.completeStage({
      output: {
        policy_number: extractedData.policyNumber,
        provider: extractedData.provider,
        policy_type: extractedData.policyType,
        insured_name: extractedData.insuredName,
        premium: extractedData.premium,
        start_date: extractedData.startDate,
        end_date: extractedData.endDate,
        coverages_count: extractedData.coverages?.length ?? 0,
        confidence: extractedData.confidence,
      },
      metadata: {
        consensus: consensusInfo,
        coverages: extractedData.coverages?.slice(0, 5) ?? [], // First 5 coverages for preview
        exclusions_count: extractedData.exclusions?.length ?? 0,
      },
      // Full content for admin debugging
      full_input_text: processedText,
      full_extracted_json: JSON.stringify(extractedData, null, 2),
    })

    // Tiered confidence check:
    // - Below minConfidence (default 0.4): hard reject — data too unreliable
    // - Between minConfidence and warningConfidence (default 0.7): show results with warning
    // - At or above warningConfidence: full confidence results
    const isLowConfidence = confidenceOverall < AI_CONFIG.warningConfidence
    if (confidenceOverall < AI_CONFIG.minConfidence) {
      if (useFallback) {
        console.error(
          `[PolicyExtractor] FALLBACK TRIGGERED: Low confidence extraction (${confidenceOverall} < ${AI_CONFIG.minConfidence})`
        )
        return createFallbackResult(file, extractedData)
      }
      return {
        success: false,
        error: {
          code: 'LOW_CONFIDENCE',
          message: `Extraction confidence too low: ${Math.round(confidenceOverall * 100)}%`,
          details:
            'The AI could not reliably extract policy information. Please try with a clearer document.',
        },
        fallbackAvailable: false,
      }
    }
    if (isLowConfidence) {
      console.warn(
        `[PolicyExtractor] Low confidence extraction (${Math.round(confidenceOverall * 100)}%) — results will include warning`
      )
    }

    // ========================================================================
    // DOCUMENT AI FORM FIELD ENHANCEMENT
    // Use high-confidence form fields from Document AI to enhance/override AI extraction
    // ========================================================================
    let enhancedExtractedData = extractedData
    let formFieldsUsed = 0

    // ========== FORM FIELD ENHANCEMENT STAGE ==========
    if (ocrFormFields && ocrFormFields.length > 0) {
      logger?.startStage('form_field_enhancement', {
        form_fields_available: ocrFormFields.length,
        backend: 'document-ai',
      })
      const formFieldMap = extractFormFieldMap(ocrFormFields)
      const narrowedFormFields = ocrFormFields

      if (import.meta.env.DEV) {
        console.warn('[Document AI] Form field map:', formFieldMap)
      }

      // Helper to find and use high-confidence form field value
      const getFormFieldValue = (
        patterns: readonly (string | RegExp)[],
        currentValue: string | number | null | undefined,
        minConfidence = 0.7
      ): string | undefined => {
        const field = findFormField(narrowedFormFields, patterns)
        if (field && field.confidence >= minConfidence && field.value) {
          formFieldsUsed++
          return field.value
        }
        return currentValue?.toString()
      }

      // Use form fields for policy number (high priority - very reliable from Document AI)
      const formPolicyNumber = getFormFieldValue(
        TURKISH_FORM_FIELD_PATTERNS.policyNumber,
        extractedData.policyNumber,
        0.6
      )
      if (formPolicyNumber && formPolicyNumber !== extractedData.policyNumber) {
        enhancedExtractedData = { ...enhancedExtractedData, policyNumber: formPolicyNumber }
        if (import.meta.env.DEV) {
          console.warn(
            `[Document AI] Policy number enhanced: "${extractedData.policyNumber}" → "${formPolicyNumber}"`
          )
        }
      }

      // Use form fields for insured name
      const formInsuredName = getFormFieldValue(
        TURKISH_FORM_FIELD_PATTERNS.insuredName,
        extractedData.insuredName
      )
      if (formInsuredName && formInsuredName !== extractedData.insuredName) {
        enhancedExtractedData = { ...enhancedExtractedData, insuredName: formInsuredName }
        if (import.meta.env.DEV) {
          console.warn(
            `[Document AI] Insured name enhanced: "${extractedData.insuredName}" → "${formInsuredName}"`
          )
        }
      }

      // Use form fields for dates
      const formStartDate = getFormFieldValue(
        TURKISH_FORM_FIELD_PATTERNS.startDate,
        extractedData.startDate
      )
      if (formStartDate && formStartDate !== extractedData.startDate) {
        // Normalize date format if needed (DD.MM.YYYY → YYYY-MM-DD)
        const normalizedDate = formStartDate.includes('.')
          ? formStartDate.split('.').reverse().join('-')
          : formStartDate
        enhancedExtractedData = { ...enhancedExtractedData, startDate: normalizedDate }
      }

      const formEndDate = getFormFieldValue(
        TURKISH_FORM_FIELD_PATTERNS.endDate,
        extractedData.endDate
      )
      if (formEndDate && formEndDate !== extractedData.endDate) {
        const normalizedDate = formEndDate.includes('.')
          ? formEndDate.split('.').reverse().join('-')
          : formEndDate
        enhancedExtractedData = { ...enhancedExtractedData, endDate: normalizedDate }
      }

      // Use form fields for premium (parse Turkish number format)
      const formPremium = getFormFieldValue(
        TURKISH_FORM_FIELD_PATTERNS.premium,
        extractedData.premium?.toString()
      )
      if (formPremium) {
        // Parse Turkish currency format: "₺5.000,50" or "5.000,50 TL"
        const cleanPremium = formPremium
          .replace(/[₺TL\s]/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
        const parsedPremium = parseFloat(cleanPremium)
        if (!isNaN(parsedPremium) && parsedPremium !== extractedData.premium) {
          // Magnitude sanity check: Prevent extracting vehicle market value as premium
          // Kasko premiums are rarely over 500,000 TL, but vehicle values are usually 1M+ TL
          const isSuspiciousVehicleValue =
            parsedPremium > 500000 && (!extractedData.premium || extractedData.premium < 500000)

          if (isSuspiciousVehicleValue) {
            console.warn(
              `[Document AI] Rejected suspicious premium OCR enhancement. OCR value ${parsedPremium} resembles vehicle value. Keeping AI value: ${extractedData.premium}`
            )
          } else {
            enhancedExtractedData = { ...enhancedExtractedData, premium: parsedPremium }
            if (import.meta.env.DEV) {
              console.warn(
                `[Document AI] Premium enhanced: ${extractedData.premium} → ${parsedPremium}`
              )
            }
          }
        }
      }

      if (import.meta.env.DEV && formFieldsUsed > 0) {
        console.warn(`[Document AI] Enhanced extraction with ${formFieldsUsed} form fields`)
      }

      // Log form field enhancement completion
      logger?.completeStage({
        output: {
          fields_used: formFieldsUsed,
          enhanced_policy_number: enhancedExtractedData.policyNumber !== extractedData.policyNumber,
          enhanced_insured_name: enhancedExtractedData.insuredName !== extractedData.insuredName,
          enhanced_premium: enhancedExtractedData.premium !== extractedData.premium,
        },
      })
    } else {
      // Provide detailed decision context for why form field enhancement was skipped
      logger?.skipStage('form_field_enhancement', {
        reason: 'No form fields available',
        decision_context: {
          assessment_performed: 'Check for Document AI form fields from OCR stage',
          actual_values: {
            form_fields_count: ocrFormFields?.length || 0,
            ocr_used: usedOCR,
            ocr_backend: 'document-ai',
            has_form_fields: !!(ocrFormFields && ocrFormFields.length > 0),
          },
          decision_logic:
            'OCR was performed with Document AI backend, but no form fields were detected. Document may not have structured form fields.',
          alternatives: usedOCR
            ? [
                'Use Google Document AI which has better form field detection',
                'Document may need cleaner scan quality for form field detection',
              ]
            : [
                'Form fields are only available when using Document AI OCR',
                'For native text PDFs, AI extraction typically captures all data without needing form field enhancement',
              ],
        },
      })
    }

    // ========================================================================
    // TURKISH PATTERN VALIDATION & ENHANCEMENT
    // Validate AI extraction using pattern matching and enhance with missing data
    // ========================================================================
    let patternValidation: ValidationResult | undefined

    try {
      // Convert AI extraction to format for validation
      // Extract numeric TC/VKN from insuredName if it exists, otherwise use what might be mapped directly (if any)
      const potentialTcKimlikMatch = enhancedExtractedData.insuredName?.match(/\b(\d{10,11})\b/)
      let extractedTcKimlik: string | undefined

      if (potentialTcKimlikMatch) {
        extractedTcKimlik = potentialTcKimlikMatch[1]
      } else {
        const rawTck =
          (enhancedExtractedData as unknown as Record<string, unknown>).tcKimlik ||
          (enhancedExtractedData as unknown as Record<string, unknown>).vkn
        if (typeof rawTck === 'string') extractedTcKimlik = rawTck
      }

      const aiResultForValidation: Record<string, unknown> = {
        policyNumber: enhancedExtractedData.policyNumber,
        tcKimlik: extractedTcKimlik,
        insuredName: enhancedExtractedData.insuredName,
        startDate: enhancedExtractedData.startDate,
        endDate: enhancedExtractedData.endDate,
        premium: enhancedExtractedData.premium,
        coverage: enhancedExtractedData.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0),
        vehiclePlate: (enhancedExtractedData as unknown as Record<string, unknown>).vehiclePlate,
        vin: (enhancedExtractedData as unknown as Record<string, unknown>).vin,
        vehicleYear: (enhancedExtractedData as unknown as Record<string, unknown>).vehicleYear,
      }

      // Validate and enhance with Turkish patterns
      patternValidation = validateAndEnhanceExtraction(aiResultForValidation, processedText)

      // Log validation results in development
      if (import.meta.env.DEV) {
        if (patternValidation.errors.length > 0) {
          console.warn('[Turkish Validation] Errors:', patternValidation.errors)
        }
        if (patternValidation.warnings.length > 0) {
          console.warn('[Turkish Validation] Warnings:', patternValidation.warnings)
        }
        if (Object.keys(patternValidation.enhancements).length > 0) {
          console.warn('[Turkish Validation] Enhancements:', patternValidation.enhancements)
        }
      }

      // Merge enhancements into extracted data
      if (Object.keys(patternValidation.enhancements).length > 0) {
        const merged = mergeExtractionResults(aiResultForValidation, patternValidation)

        // Update extractedData with enhancements
        if (merged.policyNumber && !extractedData.policyNumber) {
          enhancedExtractedData = {
            ...enhancedExtractedData,
            policyNumber: merged.policyNumber as string,
          }
        }
        if (merged.startDate && !extractedData.startDate) {
          enhancedExtractedData = {
            ...enhancedExtractedData,
            startDate: merged.startDate as string,
          }
        }
        if (merged.endDate && !extractedData.endDate) {
          enhancedExtractedData = { ...enhancedExtractedData, endDate: merged.endDate as string }
        }
        if (merged.premium && !extractedData.premium) {
          enhancedExtractedData = { ...enhancedExtractedData, premium: merged.premium as number }
        }
        if (merged.insuredPerson && !extractedData.insuredName) {
          enhancedExtractedData = {
            ...enhancedExtractedData,
            insuredName: merged.insuredPerson as string,
          }
        }
      }
    } catch (error) {
      // Pattern validation is optional, continue without it
      console.warn('Turkish pattern validation failed:', error)
    }

    // ========================================================================
    // TABLE-BASED COVERAGE ENHANCEMENT
    // Parse Document AI tables to extract structured coverage information
    // ========================================================================
    let tableCoveragesUsed = 0

    // ========== TABLE PARSING STAGE ==========
    if (ocrTables && ocrTables.length > 0) {
      logger?.startStage('table_parsing', {
        tables_count: ocrTables.length,
        tables_structure: ocrTables.map((t) => ({
          rows: t.rows?.length || 0,
          cols: t.rows?.[0]?.cells?.length || 0,
        })),
      })

      try {
        const tableData = parseTablesForCoverages(ocrTables)

        if (tableData.coverages.length > 0) {
          if (import.meta.env.DEV) {
            console.warn(
              `[Table Parser] Extracted ${tableData.coverages.length} coverages from ${ocrTables.length} tables`
            )
          }

          // Merge table coverages with AI-extracted coverages
          const mergedCoverages = mergeCoveragesWithTableData(
            enhancedExtractedData.coverages,
            tableData.coverages,
            tableData.confidence, // Table parsing confidence
            0.7 // Minimum confidence threshold
          )

          // Count how many table coverages were actually used
          tableCoveragesUsed = mergedCoverages.length - enhancedExtractedData.coverages.length
          if (tableCoveragesUsed < 0) tableCoveragesUsed = 0

          // Update enhanced data with merged coverages
          enhancedExtractedData = {
            ...enhancedExtractedData,
            coverages: mergedCoverages as ExtractedCoverage[],
          }

          // Log table parsing success
          logger?.completeStage({
            output: {
              coverages_extracted: tableData.coverages.length,
              coverages_merged: tableCoveragesUsed,
              total_coverages: mergedCoverages.length,
              table_confidence: tableData.confidence,
            },
            metadata: {
              extracted_coverages: tableData.coverages.slice(0, 5), // First 5 for preview
            },
          })

          if (import.meta.env.DEV && tableCoveragesUsed > 0) {
            console.warn(`[Table Parser] Added ${tableCoveragesUsed} new coverages from tables`)
          }
        } else {
          logger?.completeStage({
            output: { coverages_extracted: 0, reason: 'no_coverage_tables_found' },
          })
        }
      } catch (error) {
        // Table parsing is optional, continue without it
        console.warn('Table coverage parsing failed:', error)
        logger?.failStage(
          'Table parsing failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        )
      }
    } else {
      // Provide detailed decision context for why table parsing was skipped
      logger?.skipStage('table_parsing', {
        reason: 'No tables available',
        decision_context: {
          assessment_performed: 'Check for Document AI tables from OCR stage',
          actual_values: {
            tables_count: ocrTables?.length || 0,
            ocr_used: usedOCR,
            ocr_backend: 'document-ai',
            has_tables: !!(ocrTables && ocrTables.length > 0),
            ai_coverages_count: enhancedExtractedData.coverages?.length || 0,
          },
          decision_logic: `OCR was performed with Document AI backend, but no tables were detected in the document. The AI extraction found ${enhancedExtractedData.coverages?.length || 0} coverages from the text.`,
          alternatives: [
            'Document may not contain structured coverage tables',
            'Coverage information may be in paragraph form rather than tables',
          ],
        },
      })
    }

    // ========== VALIDATION STAGE ==========
    logger?.startStage('validation', {
      has_pattern_validation: !!patternValidation,
      coverages_count: enhancedExtractedData.coverages.length,
    })

    const safetyResult = validateExtractionSafety(enhancedExtractedData)

    if (!safetyResult.isValid) {
      console.warn(`[PolicyExtractor] Data extraction safety warnings/errors:`, safetyResult.flags)
      if (import.meta.env.DEV) {
        console.warn(`[PolicyExtractor] Safety block reason: ${safetyResult.blockReason}`)
      }
    }

    // Convert extracted data to AnalyzedPolicy format
    // Store both raw extractedText and processedText for display and analysis
    let policy = await convertToAnalyzedPolicy(
      enhancedExtractedData,
      file,
      documentText,
      processedText,
      safetyResult
    )

    // Apply relationship resolution and precedence rules
    const resolverStats = { unresolvedCount: 0 }
    policy = resolveClauseRelationships(
      policy,
      enhancedExtractedData.clauseGraph as Parameters<typeof resolveClauseRelationships>[1],
      resolverStats
    )

    // Bug #14 — confidence post-processing. A graph with many unresolved edges
    // means the LLM returned ambiguous relationships even while self-reporting
    // 99% confidence. Apply a soft penalty: -1% per unresolved edge, floored
    // at 50% so we never over-penalize. Keeps trustworthiness UI honest.
    if (resolverStats.unresolvedCount > 0 && typeof policy.aiConfidence === 'number') {
      const original = policy.aiConfidence
      const penalized = Math.max(0.5, original * (1 - resolverStats.unresolvedCount / 100))
      if (penalized < original) {
        policy.aiConfidence = penalized
        policy.extractionWarnings = [
          ...(policy.extractionWarnings ?? []),
          `Güven skoru ${Math.round(original * 100)}% → ${Math.round(penalized * 100)}% düşürüldü (${resolverStats.unresolvedCount} çözülemeyen ilişki)`,
        ]
      }
    }

    // Add validation warnings to AI insights
    if (patternValidation) {
      const validationInsights = [
        ...patternValidation.errors.map((e) => `❌ ${e}`),
        ...patternValidation.warnings.map((w) => `⚠️ ${w}`),
      ]
      if (validationInsights.length > 0 && policy.aiInsights) {
        policy.aiInsights = [...validationInsights, ...policy.aiInsights]
        // Re-translate after prepending validation insights
        policy.aiInsightsTr = translateInsightsToTr(policy.aiInsights)
      }
    }

    // Log validation completion with full policy data for admin debugging
    logger?.completeStage({
      output: {
        validation_errors: patternValidation?.errors?.length || 0,
        validation_warnings: patternValidation?.warnings?.length || 0,
        enhancements_applied: patternValidation
          ? Object.keys(patternValidation.enhancements).length
          : 0,
        final_policy_id: policy.id,
      },
      metadata: {
        phaseTiming: clientPhaseTiming,
      },
      // Full policy JSON for admin debugging
      full_extracted_json: JSON.stringify(policy, null, 2),
    })

    // Set extracted summary for admin display
    logger?.setExtractedSummary({
      policy_number: policy.policyNumber,
      provider: policy.provider,
      type: policy.type,
      type_tr: policy.typeTr,
      insured_person: policy.insuredPerson,
      premium: policy.premium,
      coverage: policy.coverage,
      start_date: policy.startDate,
      expiry_date: policy.expiryDate,
    })

    // Mark extraction as complete
    markClientPhase('aiExtraction_ms', aiExtractionStart)
    clientPhaseTiming['pipeline_total_ms'] = Math.round(performance.now() - pipelineStart)
    console.warn('[PolicyExtractor] Pipeline timing breakdown:', clientPhaseTiming)
    logger?.complete()

    // ========== KASKO PILOT ADMISSION GATE ==========
    // For KASKO extractions, evaluate document admission and create QA record
    let pilotAdmission: PilotAdmissionGateResult | undefined
    if (policy.type === 'kasko') {
      pilotAdmission = evaluatePilotAdmission(policy, {
        textCharCount: documentText.length,
      })
      console.warn(
        '[PolicyExtractor] KASKO pilot admission:',
        pilotAdmission.status,
        pilotAdmission.reason
      )

      // Create and persist QA record for pilot-eligible documents
      if (pilotAdmission.countedInPilotMetrics) {
        try {
          const qaRecord = createPilotQARecord(
            policy.id || crypto.randomUUID(),
            file.name,
            userId || 'anonymous'
          )
          qaRecord.extractionSuccess = true
          qaRecord.extractionModel = primaryProvider || 'auto'
          qaRecord.textCharCount = documentText.length
          qaRecord.pageCount = pageCount
          qaRecord.admissionStatus = pilotAdmission.status
          qaRecord.admissionReason = pilotAdmission.reason
          qaRecord.countedInPilotMetrics = pilotAdmission.countedInPilotMetrics
          qaRecord.coverageCountExtracted = policy.coverages?.length || 0
          qaRecord.confidenceScore = confidenceOverall

          // Populate QA fields from extraction results (WS-1 fix)
          qaRecord.specialConditionCount = policy.specialConditions?.length || 0
          qaRecord.hasRayicDeger = policy.coverages?.some((c) => c.isMarketValue) || false
          qaRecord.hasConditionalDeductible = Boolean(
            (policy.conditionalDeductibles && policy.conditionalDeductibles.length > 0) ||
            policy.deductibleUncertain
          )
          qaRecord.sourceQuoteCount = Object.keys(policy.evidenceData || {}).length
          qaRecord.zeroCoverage = (policy.coverages?.length || 0) === 0

          // Evaluate display mode based on extraction quality
          const displayModeResult = evaluateSimpleDisplayMode(confidenceOverall, {
            policyNumber: enhancedExtractedData?.policyNumber,
            provider: enhancedExtractedData?.provider,
            coverages: enhancedExtractedData?.coverages,
          })
          qaRecord.displayMode = displayModeResult.mode
          qaRecord.triggersFired = displayModeResult.triggers

          // Fire-and-forget: persist QA record to Supabase
          persistPilotQARecord(qaRecord).catch((err) =>
            console.warn(
              '[PolicyExtractor] Failed to persist pilot QA record:',
              err instanceof Error ? err.message : String(err)
            )
          )
        } catch (err) {
          console.warn(
            '[PolicyExtractor] Failed to create pilot QA record:',
            err instanceof Error ? err.message : String(err)
          )
        }
      }
    }

    return {
      success: true,
      policy,
      extractedData: enhancedExtractedData,
      source: usedOCR ? 'ocr' : 'ai',
      lowConfidence: isLowConfidence || undefined,
      confidenceScore: confidenceOverall,
      consensus: consensusInfo,
      cleanRoomOutput: cleanRoomResult,
      clientPhaseTiming, // Diagnostic: per-phase timing breakdown
      pilotAdmission: pilotAdmission
        ? {
            status: pilotAdmission.status,
            reason: pilotAdmission.reason,
            countedInPilotMetrics: pilotAdmission.countedInPilotMetrics,
          }
        : undefined,
      patternValidation: patternValidation
        ? {
            errors: patternValidation.errors,
            warnings: patternValidation.warnings,
            enhanced: Object.keys(patternValidation.enhancements),
          }
        : undefined,
      // Document AI OCR data (when available) or pdf.js extraction info
      documentOCR: documentAIOcrData
        ? {
            pdfHash: documentAIOcrData.pdfHash,
            pages: documentAIOcrData.pages,
            confidence: documentAIOcrData.confidence,
            formFields: ocrFormFields,
            tables: ocrTables,
            fieldsUsed: formFieldsUsed,
            tableCoveragesUsed,
            processingTimeMs: documentAIOcrData.metadata.processingTimeMs,
            warnings: documentAIOcrData.metadata.warnings,
          }
        : {
            // pdf.js fallback - minimal data
            pdfHash: '',
            pages: [] as PageText[],
            confidence: 0.9, // Assumed good quality for native text
            formFields: [] as FormField[],
            tables: [] as Table[],
            fieldsUsed: 0, // No form fields used in pdf.js extraction
            tableCoveragesUsed: 0,
            processingTimeMs: 0,
            warnings: ['Extracted with pdf.js (Document AI unavailable)'],
          },
    }
  } catch (error) {
    markClientPhase('aiExtraction_ms', aiExtractionStart)
    clientPhaseTiming['pipeline_total_ms'] = Math.round(performance.now() - pipelineStart)
    console.warn('[PolicyExtractor] Pipeline timing at failure:', clientPhaseTiming)

    const errorMessage = error instanceof Error ? error.message : 'Unknown AI error'
    const errorStack = error instanceof Error ? error.stack : undefined
    const errorType = error instanceof Error ? error.constructor.name : 'Unknown'

    // Extract proxy diagnostic fields attached by openai.ts/claude.ts
    const proxyErrorCode = (error as Error & { errorCode?: string })?.errorCode
    const proxyRequestId = (error as Error & { requestId?: string })?.requestId
    const proxyServerTiming = (error as Error & { serverPhaseTiming?: Record<string, number> })
      ?.serverPhaseTiming
    const proxyServerElapsed = (error as Error & { serverElapsedMs?: number })?.serverElapsedMs

    // Merge server-side timing into client phase timing for unified diagnostic view
    if (proxyServerTiming) {
      for (const [key, value] of Object.entries(proxyServerTiming)) {
        clientPhaseTiming[`server_${key}`] = value
      }
    }
    if (proxyServerElapsed !== undefined) {
      clientPhaseTiming['server_total_ms'] = proxyServerElapsed
    }

    // Classify error code for structured logging
    let errorCode: ExtractionError['error']['code'] = 'AI_ERROR'
    if (
      errorMessage.includes('Load failed') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('NetworkError')
    ) {
      errorCode = 'NETWORK_ERROR'
    } else if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      errorCode = 'TIMEOUT'
    } else if (
      errorMessage.includes('429') ||
      errorMessage.includes('rate_limit') ||
      errorMessage.includes('Rate limit')
    ) {
      errorCode = 'RATE_LIMIT_EXCEEDED'
    } else if (
      errorMessage.includes('401') ||
      errorMessage.includes('API key') ||
      errorMessage.includes('Unauthorized')
    ) {
      errorCode = 'INVALID_API_KEY'
    } else if (
      errorMessage.includes('billing') ||
      errorMessage.includes('credit') ||
      errorMessage.includes('quota')
    ) {
      errorCode = 'BILLING_ERROR'
    } else if (errorMessage.includes('context_length') || errorMessage.includes('too large')) {
      errorCode = 'DOCUMENT_TOO_LARGE'
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      errorCode = 'INVALID_RESPONSE'
    } else if (
      errorMessage.includes('overloaded') ||
      errorMessage.includes('529') ||
      errorMessage.includes('503')
    ) {
      errorCode = 'PROVIDER_OVERLOADED'
    }

    // Log extraction failure with explicit string for production visibility
    console.error(
      '[PolicyExtractor] EXTRACTION FAILED - Code:',
      errorCode,
      '- Message:',
      errorMessage
    )
    console.error('[PolicyExtractor] EXTRACTION FAILED - Stack:', errorStack)
    console.error('[PolicyExtractor] EXTRACTION FAILED - Type:', errorType)

    // Log detailed error to ProcessingLogger for admin dashboard visibility
    if (logger) {
      logger.failWithDetails(error instanceof Error ? error : new Error(errorMessage), {
        extraction_provider: primaryProvider || 'unknown',
        document_length: documentText?.length || 0,
        ocr_used: usedOCR,
        error_code: errorCode,
        data_at_failure: {
          file_name: file.name,
          file_size: file.size,
          had_extracted_data: extractedData !== undefined,
          extracted_policy_number: extractedData?.policyNumber,
          extracted_provider: extractedData?.provider,
          phaseTiming: clientPhaseTiming,
        },
      })
    }

    if (useFallback) {
      console.error(
        `[PolicyExtractor] FALLBACK TRIGGERED: AI extraction threw error: ${errorMessage}`,
        { errorType, errorStack: errorStack?.substring(0, 500) }
      )
      return createFallbackResult(file)
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message: `Failed to extract policy data: ${errorMessage}`,
        details: errorMessage,
        stack: errorStack,
        type: errorType,
      },
      fallbackAvailable: false,
      clientPhaseTiming, // Diagnostic: per-phase timing at failure point
      errorCode: proxyErrorCode, // Server/client error code for diagnostic display
      requestId: proxyRequestId, // Server request ID for log correlation
    }
  }
}

/**
 * Extract using a specific provider
 */
async function extractWithProvider(
  provider: AIProvider,
  documentText: string,
  notifyUserId?: string,
  signal?: AbortSignal
): Promise<ExtractedPolicyData> {
  switch (provider) {
    case 'openai':
      return extractWithOpenAI(documentText, notifyUserId, signal)
    case 'anthropic':
      return extractWithClaude(documentText, notifyUserId, signal)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Convert extracted data to AnalyzedPolicy format
 * @param data - Extracted policy data from AI
 * @param file - Original PDF file
 * @param rawText - Raw extracted text from PDF/OCR (for reference)
 * @param processedText - AI-processed text with OCR corrections (for display and chat)
 */
async function convertToAnalyzedPolicy(
  data: ExtractedPolicyData,
  file: File,
  rawText?: string,
  processedText?: string,
  safetyResult?: {
    flags: Array<{ level: 'Safe' | 'Warning' | 'Error'; message: string; field?: string }>
    isValid: boolean
    blockReason?: string
  }
): Promise<AnalyzedPolicy> {
  const now = new Date()

  // Debug logging for production troubleshooting
  console.warn('[convertToAnalyzedPolicy] Input data:', {
    hasCoverages: !!data.coverages,
    coveragesIsArray: Array.isArray(data.coverages),
    coveragesLength: Array.isArray(data.coverages) ? data.coverages.length : 'N/A',
    policyType: data.policyType,
    hasExclusions: !!data.exclusions,
    hasSpecialConditions: !!data.specialConditions,
  })

  // Ensure coverages is always an array (defensive check)
  if (!data.coverages || !Array.isArray(data.coverages)) {
    console.warn('[convertToAnalyzedPolicy] coverages missing or not array, defaulting to []')
    data.coverages = []
  }

  // Ensure exclusions and specialConditions are arrays
  if (!data.exclusions || !Array.isArray(data.exclusions)) {
    data.exclusions = []
  }
  if (!data.specialConditions || !Array.isArray(data.specialConditions)) {
    data.specialConditions = []
  }

  // Cast data to allow accessing snake_case fields that AI might return
  const rawData = data as unknown as Record<string, unknown>

  // Determine status based on dates
  // Handle both camelCase (endDate) and snake_case (end_date) from AI
  const rawEndDate = data.endDate ?? (rawData.end_date as string | undefined)
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  let expiryDateStr = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  if (rawEndDate) {
    // Use parseTurkishDate first to avoid V8 Date constructor silently swapping
    // day/month on Turkish DD.MM.YYYY strings when day ≤ 12 (see gotcha #52)
    const parsedEnd = parseTurkishDate(rawEndDate)
    let endDate: Date | null = null

    if (parsedEnd) {
      expiryDateStr = parsedEnd
      endDate = new Date(parsedEnd + 'T00:00:00Z')
    } else {
      // Fallback for ISO datetimes (e.g. "2024-12-15T00:00:00Z") that parseTurkishDate doesn't cover
      const d = new Date(rawEndDate)
      if (!isNaN(d.getTime())) {
        expiryDateStr = d.toISOString().split('T')[0]
        endDate = d
      } else {
        expiryDateStr = rawEndDate // totally unparseable — keep raw string
      }
    }

    if (endDate && !isNaN(endDate.getTime())) {
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntilExpiry < 0) {
        status = 'expired'
      } else if (daysUntilExpiry <= 30) {
        status = 'expiring'
      }
    }
  }

  // Convert coverages with Turkish names and enhanced metadata
  // Handle cases where AI returns description instead of name, or both are missing
  // Resolution order for nameTr:
  //   1. AI-provided nameTr (if different from name)
  //   2. Lookup in canonical coverage names map
  //   3. Fall back to English name
  const coverages: Coverage[] = data.coverages.map((c) => {
    const coverageName = c.name || c.description || 'Unnamed Coverage'
    const aiNameTr = c.nameTr && c.nameTr !== coverageName ? c.nameTr : null
    const mappedNameTr = lookupCoverageNameTr(coverageName)
    return {
      name: coverageName,
      nameTr: aiNameTr ?? mappedNameTr ?? coverageName,
      limit: c.limit ?? 0,
      deductible: c.deductible ?? 0,
      included: c.included ?? true,
      description: c.description ?? undefined,
      isUnlimited: c.isUnlimited ?? false,
      isMarketValue: c.isMarketValue ?? false,
      category: c.category ?? 'other',
      importance: determineCoverageImportance(c),
    }
  })

  // Get policy type - handle both camelCase and snake_case
  const rawPolicyType = data.policyType ?? (rawData.policy_type as string | undefined)
  const policyType = (
    rawPolicyType && rawPolicyType in POLICY_TYPES ? rawPolicyType : 'home'
  ) as PolicyType
  const typeInfo = POLICY_TYPES[policyType]

  if (rawPolicyType && !(rawPolicyType in POLICY_TYPES)) {
    console.warn(
      `[convertToAnalyzedPolicy] Unknown policy type: ${rawPolicyType}, falling back to 'home'`
    )
  }

  // Calculate total coverage based on policy type
  // For kasko: use vehicle value (main coverage or market value), NOT sum of all limits
  // For other types: use the main coverage or sum of main coverages
  let totalCoverage = calculateMainCoverage(policyType, coverages)

  // Sigorta Bedeli raw text fallback for kasko/nakliyat — the AI may miss the
  // sum insured when it appears in free-text paragraphs rather than structured
  // tables (e.g., "sigorta bedeli ... (16750 -TL) sigortalanır").
  if ((policyType === 'kasko' || policyType === 'nakliyat') && totalCoverage < 1000 && rawText) {
    const bedelPatterns = [
      /s[iİ]gorta\s+bedel[iİ][\s:.]*([\d.,]+)\s*[-–]?\s*(?:TL|TRY|₺)/i,
      /\((\d[\d.,]*)\s*[-–]?\s*TL\)/i, // Parenthesized amount: (16750 -TL)
    ]
    for (const pat of bedelPatterns) {
      const m = rawText.match(pat)
      if (m?.[1]) {
        const parsed = parseTurkishCurrency(m[1])
        if (parsed && parsed > totalCoverage && parsed < 50_000_000) {
          totalCoverage = parsed
          break
        }
      }
    }
  }

  // Handle premium - AI might return a number or an object with 'amount' field
  let premiumValue = 0
  let premiumMissing = true
  if (typeof data.premium === 'number' && data.premium > 0) {
    premiumValue = data.premium
    premiumMissing = false
  } else if (data.premium && typeof data.premium === 'object' && 'amount' in data.premium) {
    const amt = (data.premium as { amount: number }).amount
    if (amt > 0) {
      premiumValue = amt
      premiumMissing = false
    }
    console.warn('[convertToAnalyzedPolicy] Extracted premium from object:', premiumValue)
  }

  // Turkish premium magnitude sanity check — fix 100× / 1000× errors caused by
  // AI mis-parsing Turkish thousands/decimal separators (e.g., "1.659,72 TL"
  // becoming 165972 instead of 1659.72). Look for "Brüt Prim" / "Net Prim"
  // strings in the raw text and re-parse with the locale-aware utility.
  if (premiumValue > 0 && rawText) {
    try {
      // Match premium labels in raw text. Turkish İ (U+0130) is NOT case-folded
      // by JS /i flag, so we match both ASCII i and İ explicitly with [iİ].
      // "TOPLAM NET PRİM" has an intervening word — allow optional "NET".
      const premiumPatterns = [
        /(?:br[uü]t\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
        /(?:toplam\s+(?:net\s+)?pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
        /(?:[oö]denecek\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
        /(?:net\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
      ]
      for (const pat of premiumPatterns) {
        const m = rawText.match(pat)
        if (m && m[1]) {
          const reparsed = parseTurkishCurrency(m[1])
          if (reparsed && reparsed > 0) {
            // If our extracted premium differs from re-parsed by ≥50× and
            // the re-parsed value is plausible (< 500K TL for kasko), trust it
            const ratio = premiumValue / reparsed
            const isLikelyMisparsed =
              (ratio >= 50 || ratio <= 0.02) && reparsed < 500000 && reparsed > 50
            if (isLikelyMisparsed) {
              console.warn(
                `[convertToAnalyzedPolicy] Premium magnitude correction: ${premiumValue} → ${reparsed} (raw: "${m[0]}")`
              )
              premiumValue = reparsed
              break
            }
          }
        }
      }
    } catch (err) {
      console.warn('[convertToAnalyzedPolicy] Premium re-parse failed:', err)
    }
  }

  // Handle policyNumber - AI might return camelCase or snake_case
  const policyNumber = data.policyNumber ?? (rawData.policy_number as string) ?? `POL-${Date.now()}`

  // Handle provider - AI might return camelCase or snake_case
  const provider = data.provider ?? (rawData.provider as string) ?? 'Unknown Provider'

  // Handle insured - check multiple AI response patterns
  const insuredPerson =
    data.insuredName ??
    (rawData.insured_name as string) ??
    (rawData.insuredPerson as string) ??
    (rawData.policyholder as string) ??
    (rawData.sigortalı as string) ??
    (rawData.sigortali as string) ??
    undefined
  const insuredMissing =
    !insuredPerson ||
    insuredPerson.trim() === '' ||
    insuredPerson.toLowerCase() === 'unknown' ||
    insuredPerson.toLowerCase() === 'bilinmiyor'

  // Determine deductible uncertainty for KASKO
  // For KASKO, deductible=0 from first coverage is NOT proof of zero deductible —
  // it may just mean the AI didn't extract a specific deductible
  const rawPolicyTypeForDeductible = data.policyType ?? (rawData.policy_type as string | undefined)
  const isKaskoForDeductible = rawPolicyTypeForDeductible?.toLowerCase().includes('kasko') ?? false
  const topDeductible = coverages[0]?.deductible ?? 0
  const hasExplicitDeductible = data.coverages.some(
    (c) => c.deductible !== undefined && c.deductible !== null && c.deductible > 0
  )
  const deductibleUncertain = isKaskoForDeductible && topDeductible === 0 && !hasExplicitDeductible

  // Build extraction warnings for reviewer mode (Turkish for language consistency)
  const extractionWarnings: string[] = []
  if (premiumMissing) {
    extractionWarnings.push('Prim bilgisi belgeden çıkarılamadı')
  }
  if (insuredMissing) {
    extractionWarnings.push('Sigortalı kişi adı belgeden çıkarılamadı')
  }
  if (deductibleUncertain) {
    extractionWarnings.push('Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir')
  }

  // Coverage-limit plausibility check: flag potential AI mis-mapping
  // Assistance/service coverages typically have lower limits than legal protection
  if (isKaskoForDeductible) {
    const assistanceCov = coverages.find(
      (c) =>
        c.category === 'assistance' ||
        /\b(asistans|assist|service|servis|yol\s*yard)/i.test(c.name + ' ' + (c.nameTr || ''))
    )
    const legalCov = coverages.find(
      (c) =>
        c.category === 'legal' ||
        /\b(hukuk|legal|protection|koruma)/i.test(c.name + ' ' + (c.nameTr || ''))
    )
    if (assistanceCov && legalCov && assistanceCov.limit > 0 && legalCov.limit > 0) {
      if (assistanceCov.limit > legalCov.limit * 5) {
        // Use a clean generic Turkish warning — avoid raw AI-extracted names
        // which may have broken casing (e.g. "ANAdolu Hizmet")
        extractionWarnings.push('Bazı teminat-limit eşleşmeleri ek kontrol gerektiriyor')
      }
    }
  }

  // Build the base policy first for risk assessment
  const basePolicy: AnalyzedPolicy = {
    id: crypto.randomUUID(),
    policyNumber,
    type: policyType,
    typeTr: typeInfo.labelTr,
    provider,
    logo: '', // Would need to be mapped from provider name
    coverage: totalCoverage,
    premium: premiumValue,
    monthlyPremium: premiumValue / 12,
    deductible: coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0,
    startDate: (() => {
      const rawStartDate = data.startDate ?? (rawData.start_date as string)
      if (!rawStartDate) return now.toISOString().split('T')[0]
      // Use parseTurkishDate first to avoid V8 DD.MM.YYYY day/month swap (gotcha #52)
      const parsed = parseTurkishDate(rawStartDate)
      if (parsed) return parsed
      // Fallback for ISO datetimes
      const sd = new Date(rawStartDate)
      return !isNaN(sd.getTime()) ? sd.toISOString().split('T')[0] : rawStartDate
    })(),
    expiryDate: expiryDateStr,
    status,
    uploadDate: now.toISOString().split('T')[0],
    fileName: file.name,
    documentType: 'PDF',
    documentUrl: URL.createObjectURL(file),
    insuredPerson: insuredMissing
      ? undefined
      : normalizeTurkishLegalEntityName(insuredPerson ?? ''),
    location: data.insuredAddress ?? (rawData.insured_address as string) ?? undefined,
    insuredAddress: data.insuredAddress ?? (rawData.insured_address as string) ?? undefined,
    // Extract vehicle metadata from raw text for kasko/traffic policies.
    // The standard ExtractedPolicyData schema does not request vehicle fields,
    // so we recover them from the document text via regex patterns.
    vehicleInfo:
      (policyType === 'kasko' || policyType === 'traffic') && rawText
        ? extractVehicleInfoFromText(rawText)
        : undefined,
    coverages,
    exclusions: data.exclusions,
    exclusionsEn: ensureExclusionsEn(data.exclusions, data.exclusionsEn),
    specialConditions: data.specialConditions,
    insuranceLine: typeInfo.label,
    // Currency might be in data.currency, data.premium.currency, or snake_case
    currency:
      data.currency ??
      (data.premium && typeof data.premium === 'object'
        ? (data.premium as { currency?: string }).currency
        : undefined) ??
      'TRY',
    // Confidence might be a number (0.95) or an object ({ overall: 0.95, ... })
    aiConfidence:
      typeof data.confidence === 'number' ? data.confidence : (data.confidence?.overall ?? 0.7),
    aiInsights: [],
    marketComparison: await generateMarketComparisonAsync(data),
    extractedText: rawText,
    processedText: processedText || rawText, // Use processed text if available, otherwise raw
    evidenceData: (() => {
      const insights: Record<string, string> = {}
      const exclusions: Record<string, string> = {}
      const quoteTranslations = {
        insights: {} as Record<string, string>,
        exclusions: {} as Record<string, string>,
      }

      if (data.evidence?.insights) {
        data.evidence.insights.forEach((i) => {
          const key = i.text.trim().toLowerCase()
          insights[key] = i.quote
          if ('quoteTr' in i && typeof i.quoteTr === 'string') {
            quoteTranslations.insights[key] = i.quoteTr
          }
        })
      }
      if (data.evidence?.exclusions) {
        data.evidence.exclusions.forEach((e) => {
          const key = e.text.trim().toLowerCase()
          exclusions[key] = e.quote
          if ('quoteTr' in e && typeof e.quoteTr === 'string') {
            quoteTranslations.exclusions[key] = e.quoteTr
          }
        })
      }
      return { insights, exclusions, quoteTranslations }
    })(),
    safetyFlags: safetyResult?.flags,
    safetyBlockReason: safetyResult?.blockReason,
    premiumMissing,
    insuredMissing,
    deductibleUncertain,
    extractionWarnings: extractionWarnings.length > 0 ? extractionWarnings : undefined,
    discounts: data.discounts ?? undefined,
  }

  // Prepend AI generated evidence-based insights
  // Filter out personalization leaks: insights that compare the insured name
  // against user identity (e.g., "This policy owner is not Erdem")
  const aiInsightsEn = [...(basePolicy.aiInsightsEn || [])]
  if (data.evidence?.insights) {
    const filteredInsights = data.evidence.insights.filter((i) => !isPersonalizationLeak(i.text))
    basePolicy.aiInsights = [
      ...filteredInsights.map((i) => i.text.trim()),
      ...basePolicy.aiInsights,
    ]
    const prependEn = filteredInsights.map((i) => i.textEn?.trim() || i.text.trim())
    basePolicy.aiInsightsEn = [...prependEn, ...aiInsightsEn]
  }

  // Generate base strings (Strengths, Gaps, Recs)
  const generatedInsights = await generateAIInsightsAsync(data)

  // ── Bug #7 — Parts clause flag for older vehicles ─────────────────────
  // Non-OEM (eşdeğer) or salvage (çıkma parça) parts materially affect repair
  // quality on older cars. If vehicle age ≥7yr AND the policy text mentions
  // these terms in exclusions or special conditions, surface a Turkish warning.
  const partsClauseInsight = derivePartsClauseInsight(basePolicy, data)
  if (partsClauseInsight) {
    generatedInsights.unshift(partsClauseInsight)
  }

  // ── Reviewer-mode prioritization ──────────────────────────────────────
  // Prepend extraction-quality warnings BEFORE generic insights so reviewers
  // see the most critical correction points first.
  if (extractionWarnings.length > 0) {
    const warningInsights = extractionWarnings.map((w) => `⚠ ${w}`)
    basePolicy.aiInsights = [...warningInsights, ...basePolicy.aiInsights, ...generatedInsights]
  } else {
    basePolicy.aiInsights.push(...generatedInsights)
  }

  // Pad the English array with the same generated insights
  // (The UI will translate "Missing common coverage: X" automatically)
  if (basePolicy.aiInsightsEn) {
    if (extractionWarnings.length > 0) {
      const warningInsightsEn = extractionWarnings.map((w) => `⚠ ${w}`)
      basePolicy.aiInsightsEn = [
        ...warningInsightsEn,
        ...basePolicy.aiInsightsEn,
        ...generatedInsights,
      ]
    } else {
      basePolicy.aiInsightsEn.push(...generatedInsights)
    }
  }

  // ── Suppress unprovenanced market commentary ─────────────────────────
  // Percentile and YoY claims lack benchmark provenance metadata.
  // Until provenance is wired, suppress these universally (not just when
  // extraction warnings exist) to avoid presenting unverified market claims.
  // Matches both English originals and Turkish translations.
  {
    const marketCommentaryPatterns = [
      /premium is above \d+th percentile/i,
      /prim \d+\.\s*yüzdeliğin üzerinde/i,
      /market premiums increased \d+%/i,
      /piyasa primleri yıllık %\d+ arttı/i,
      /review coverage limits annually/i,
      /lock in rates early/i,
      /oranları erkenden sabitleyin/i,
    ]
    const isMarketCommentary = (insight: string) =>
      marketCommentaryPatterns.some((p) => p.test(insight))
    basePolicy.aiInsights = basePolicy.aiInsights.filter((i) => !isMarketCommentary(i))
    if (basePolicy.aiInsightsEn) {
      basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.filter((i) => !isMarketCommentary(i))
    }
  }

  // ── Final personalization leak sweep ─────────────────────────────────
  // The initial filter runs on evidence.insights, but AI-generated insights
  // from generateStrengths/generateGapsAsync or the sense-check endpoint
  // can also inject identity comparisons. Sweep the final merged array.
  basePolicy.aiInsights = basePolicy.aiInsights.filter((i) => !isPersonalizationLeak(i))
  if (basePolicy.aiInsightsEn) {
    basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.filter((i) => !isPersonalizationLeak(i))
  }

  // Merge AI generated evidence-based exclusions if they aren't already grouped
  if (data.evidence?.exclusions) {
    const existingExclusions = new Set(basePolicy.exclusions.map((e) => e.toLowerCase().trim()))
    const existingExclusionsEn = new Set(
      (basePolicy.exclusionsEn || []).map((e) => e.toLowerCase().trim())
    )

    basePolicy.exclusionsEn = basePolicy.exclusionsEn || []

    for (const e of data.evidence.exclusions) {
      if (!existingExclusions.has(e.text.toLowerCase().trim())) {
        basePolicy.exclusions.push(e.text)
      }
      if (e.textEn && !existingExclusionsEn.has(e.textEn.toLowerCase().trim())) {
        // Find if this specific exclusion text was already in the Turkish list, if so, put its translation in the same index
        const trIndex = basePolicy.exclusions.findIndex(
          (trEx) => trEx.toLowerCase().trim() === e.text.toLowerCase().trim()
        )
        if (trIndex !== -1) {
          basePolicy.exclusionsEn[trIndex] = e.textEn
        } else {
          basePolicy.exclusionsEn.push(e.textEn)
        }
      }
    }
  }

  // Final pass: ensure every exclusion has an English translation
  basePolicy.exclusionsEn = ensureExclusionsEn(basePolicy.exclusions, basePolicy.exclusionsEn)

  // ── Semantic exclusion deduplication ──────────────────────────────────
  // AI extraction often produces overlapping exclusions that describe the
  // same restriction differently (e.g. "key left in ignition → theft" and
  // "vehicle left running → theft"). Collapse semantically similar pairs.
  {
    const dedupResult = deduplicateExclusions(basePolicy.exclusions)
    if (dedupResult.length < basePolicy.exclusions.length) {
      // Rebuild English array from the kept indices
      const keptIndicesSet = new Set(
        dedupResult.map((kept) => basePolicy.exclusions.findIndex((e) => e === kept))
      )
      basePolicy.exclusions = dedupResult
      if (basePolicy.exclusionsEn && basePolicy.exclusionsEn.length > 0) {
        basePolicy.exclusionsEn = basePolicy.exclusionsEn.filter((_, idx) =>
          keptIndicesSet.has(idx)
        )
      }
    }
  }

  // ── Classify exclusions vs conditional deductibles ──────────────────
  // AI extraction (legacy path) dumps everything into exclusions[]. Items
  // that describe scenario-based deductibles (e.g. "%35 tenzili muafiyet")
  // or repair conditions belong in a separate conditionalDeductibles
  // section. classifyExclusions() splits them post-hoc via regex.
  //
  // Newer schema (Apr 2026+): the LLM may populate a structured
  // `conditionalDeductibles` array directly. When non-empty, prefer the
  // structured data (it carries explicit trigger/rate/evidence triplets
  // that the regex path cannot reconstruct). We still run classifyExclusions
  // to split the exclusions array, but we do not overwrite the structured
  // conditionalDeductibles. Precedent: same conditional-merge pattern used
  // for exclusionsEn above.
  {
    const classified = classifyExclusions(basePolicy.exclusions)
    basePolicy.exclusions = classified.trueExclusions
    const llmProvided = Array.isArray(data.conditionalDeductibles)
      ? data.conditionalDeductibles.filter((d) => d && typeof d === 'object')
      : []
    if (llmProvided.length > 0) {
      // Keep LLM-structured entries as-is (plus any regex-derived strings as
      // additional context). Store as stringified "trigger — rate — evidence"
      // to match AnalyzedPolicy.conditionalDeductibles shape (string[]).
      const fromLlm = llmProvided.map((d) =>
        `${d.trigger || ''} — ${d.rate || ''}${d.evidence ? ` (${d.evidence})` : ''}`.trim()
      )
      basePolicy.conditionalDeductibles = [...fromLlm, ...classified.conditionalDeductibles]
    } else {
      basePolicy.conditionalDeductibles = classified.conditionalDeductibles
    }
    if (classified.maxDeductiblePercent > 0) {
      basePolicy.deductiblePercent = classified.maxDeductiblePercent
    }
    // Rebuild English arrays if they exist
    if (basePolicy.exclusionsEn && basePolicy.exclusionsEn.length > 0) {
      const trueIndices = classified.trueExclusionIndices
      basePolicy.exclusionsEn = basePolicy.exclusionsEn.filter((_, idx) => trueIndices.has(idx))
    }
  }

  // ── Two-layer deductible reporting ─────────────────────────────────
  // Once classifyExclusions has run, we know whether explicit conditional
  // deductibles were detected. If so, deductible status is NOT uncertain —
  // it is "explicit but conditional", which the UI handles with richer text.
  // Clear the uncertainty flag and remove any "doğrulanamadı" extraction
  // warning to avoid contradicting the deductible section users will see.
  if (
    basePolicy.conditionalDeductibles &&
    basePolicy.conditionalDeductibles.length > 0 &&
    basePolicy.deductibleUncertain
  ) {
    basePolicy.deductibleUncertain = false
    if (basePolicy.extractionWarnings && basePolicy.extractionWarnings.length > 0) {
      basePolicy.extractionWarnings = basePolicy.extractionWarnings.filter(
        (w) => !/muafiyet.*do[ğg]rulanamad/i.test(w)
      )
      if (basePolicy.extractionWarnings.length === 0) {
        basePolicy.extractionWarnings = undefined
      }
    }
    // Also strip the warning insight from aiInsights so it doesn't render
    if (basePolicy.aiInsights && basePolicy.aiInsights.length > 0) {
      basePolicy.aiInsights = basePolicy.aiInsights.filter(
        (i) => !/muafiyet.*do[ğg]rulanamad/i.test(i)
      )
    }
    if (basePolicy.aiInsightsEn && basePolicy.aiInsightsEn.length > 0) {
      basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.filter(
        (i) => !/deductible.*not\s*confirmed|deductible.*could\s*not/i.test(i)
      )
    }
  }

  // ── Mini repair confidence downgrade ───────────────────────────────
  // Mini repair/onarım coverages with numeric limits may be AI mis-extractions.
  // If the limit seems implausible for a service-type coverage, downgrade to
  // a reviewer-safe label instead of presenting a possibly incorrect amount.
  for (const c of basePolicy.coverages) {
    const nameLower = (c.name + ' ' + (c.nameTr || '')).toLowerCase()
    if (/mini\s*(onar[ıi]m|repair)/i.test(nameLower)) {
      if (c.limit > 0 && !c.isMarketValue) {
        // Service-type coverages rarely have explicit monetary limits.
        // Downgrade to included-with-review unless the amount is very small
        // (under 5000 TRY) which could be a legitimate mini repair cap.
        if (c.limit > 5000) {
          c.limit = 0
          c.included = true
          // nameTr will be set by the coverage-names map during rendering
        }
      }
    }
  }

  // Calculate ML-based risk score
  try {
    const quickRisk = RiskAssessmentService.getQuickRiskScore(basePolicy)
    const actionItems = RiskAssessmentService.getActionItems(basePolicy)

    basePolicy.riskScore = {
      overall: quickRisk.score,
      level: quickRisk.level,
      topIssue: quickRisk.topIssue,
      confidence: data.confidence?.overall ?? 0.7,
    }

    basePolicy.riskActions = actionItems
  } catch {
    // Risk scoring is optional, continue without it
  }

  // Perform comprehensive gap analysis
  try {
    const gapAnalysis = await GapDetectionService.analyzePolicy(basePolicy)
    const actionItems = await GapDetectionService.getActionItems(basePolicy)

    basePolicy.gapAnalysis = {
      overallScore: gapAnalysis.overallScore,
      criticalCount: gapAnalysis.gapCount.critical,
      highCount: gapAnalysis.gapCount.high,
      totalCount: gapAnalysis.gapCount.total,
      topIssue: gapAnalysis.prioritizedGaps[0]?.gap.title ?? null,
      topIssueTr: gapAnalysis.prioritizedGaps[0]?.gap.titleTr ?? null,
      financialExposure: gapAnalysis.financialSummary.totalExpectedLoss,
      remediationCost: gapAnalysis.financialSummary.estimatedRemediationCost,
    }

    basePolicy.gapActions = actionItems
  } catch {
    // Gap analysis is optional, continue without it
  }

  // Phase 4: Unified Analysis Bundle Engine
  try {
    const defaultValidation = { isValid: true, flags: [] }
    const validationRes = {
      isValid: safetyResult?.isValid ?? defaultValidation.isValid,
      flags: (safetyResult?.flags ?? defaultValidation.flags).map((f) => ({
        ...f,
        ruleId: 'MIGRATION_PLACEHOLDER',
      })),
      blockReason: safetyResult?.blockReason,
    }

    basePolicy.analysisBundle = generateAnalysisBundle(basePolicy.id, data, validationRes)
  } catch (err) {
    console.error('[PolicyExtractor] Failed to generate AnalysisBundle', err)
  }

  // ── Source-level deduplication ──────────────────────────────────────
  // Evidence-based insights (Turkish) and generated insights (English) can
  // express the same idea. Dedup BEFORE translation so parallel arrays
  // (aiInsights, aiInsightsTr, aiInsightsEn) stay index-aligned.
  //
  // Cross-language dedup: an insight expressed in EN and an equivalent in TR
  // would survive plain string dedup. We canonicalize each insight by trying
  // BOTH translation directions (translateInsightToTr and translateInsightToEn)
  // and using the lexicographically smallest variant as the dedup key, so any
  // pair of {EN,TR} variants of the same insight collapse to one entry.
  {
    const seen = new Set<string>()
    const keepIndices: number[] = []
    const stripAndNormalize = (s: string) =>
      s
        // eslint-disable-next-line no-misleading-character-class
        .replace(/^[✓✔☑⚠💡❌🔍\uFE0F]\s*/gu, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')

    for (let idx = 0; idx < basePolicy.aiInsights.length; idx++) {
      const raw = basePolicy.aiInsights[idx]
      const baseNorm = stripAndNormalize(raw)
      // Cross-language canonicalization via translation map (best-effort)
      const trVariant = stripAndNormalize(translateInsightToTr(raw))
      const enVariant = stripAndNormalize(translateInsightToEn(raw))
      // Pick the lexicographically smallest non-empty variant as the canonical key
      const canonical =
        [baseNorm, trVariant, enVariant].filter((s) => s.length > 0).sort()[0] || baseNorm

      if (!seen.has(canonical)) {
        seen.add(canonical)
        keepIndices.push(idx)
      }
    }
    if (keepIndices.length < basePolicy.aiInsights.length) {
      basePolicy.aiInsights = keepIndices.map((idx) => basePolicy.aiInsights[idx])
      const insightsEn = basePolicy.aiInsightsEn
      if (insightsEn) {
        basePolicy.aiInsightsEn = keepIndices.map((idx) => insightsEn[idx])
      }
    }
  }

  // ── Reviewer-mode insight sanitization ────────────────────────────────
  // Runs on the final merged array BEFORE translation. Handles:
  // - Promotional/sales wording removal (Excellent, advantage, etc.)
  // - English→Turkish normalization for mixed-language bullets
  // - Duplicated fragment cleanup (e.g. "unlimited...unlimited" assembly)
  // - Evidence-first ordering
  basePolicy.aiInsights = sanitizeReviewerInsights(basePolicy.aiInsights)
  if (basePolicy.aiInsightsEn) {
    // Keep English array aligned by length (may be shorter after sanitization)
    basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.slice(0, basePolicy.aiInsights.length)
  }

  // Translate final aiInsights to Turkish (after all modifications like validation warnings)
  basePolicy.aiInsightsTr = translateInsightsToTr(basePolicy.aiInsights)

  return basePolicy
}

/**
 * Create fallback result using sample data
 */
function createFallbackResult(file: File, partialData?: ExtractedPolicyData): ExtractionResult {
  console.error(
    '[PolicyExtractor] createFallbackResult called - returning SAMPLE data instead of real AI extraction',
    {
      fileName: file.name,
      fileSize: file.size,
      hasPartialData: !!partialData,
      partialPolicyNumber: partialData?.policyNumber,
    }
  )
  // Pick a random sample policy
  const samplePolicy = samplePolicies[Math.floor(Math.random() * samplePolicies.length)]

  // Create a new policy based on sample
  const policy: AnalyzedPolicy = {
    ...samplePolicy,
    id: crypto.randomUUID(),
    documentUrl: URL.createObjectURL(file),
    uploadDate: new Date().toISOString().split('T')[0],
    aiConfidence: partialData?.confidence?.overall ?? 0.5,
  }

  return {
    success: true,
    policy,
    extractedData: partialData ?? createEmptyExtractedData(),
    source: 'fallback',
  }
}

/**
 * Create empty extracted data structure
 */
function createEmptyExtractedData(): ExtractedPolicyData {
  return {
    policyNumber: null,
    provider: null,
    policyType: null,
    insuredName: null,
    insuredAddress: null,
    startDate: null,
    endDate: null,
    premium: null,
    currency: null,
    paymentFrequency: null,
    coverages: [],
    specialConditions: [],
    exclusions: [],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    confidence: {
      overall: 0,
      policyNumber: 0,
      provider: 0,
      dates: 0,
      premium: 0,
      coverages: 0,
    },
  }
}

/**
 * Translate an English insight string to Turkish at extraction time.
 * Mirrors the display-time translateInsight() logic in PolicyDetailView
 * but runs once at extraction so the result is persisted.
 */
// Exported for unit tests verifying cross-language deduplication
export function translateInsightToTr(insight: string): string {
  const trMap = TR_TRANSLATIONS.insightTranslations

  // Extract emoji prefix if present (✓ ⚠ 💡 ❌ 🔍 etc.)
  // eslint-disable-next-line no-misleading-character-class
  const prefixMatch = insight.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  const text = prefix ? insight.slice(prefix.length).trim() : insight

  // Exact match from translation map
  if (trMap[text] && trMap[text] !== text) {
    return prefix ? `${prefix}${trMap[text]}` : trMap[text]
  }

  // Dynamic pattern: "Missing common coverage: X"
  if (text.startsWith('Missing common coverage:')) {
    const name = text.replace('Missing common coverage:', '').trim()
    const template = trMap['missingCoverage'] || 'Yaygın teminat eksik: {name}'
    const translated = template.replace('{name}', name)
    return prefix ? `${prefix}${translated}` : translated
  }

  // Dynamic pattern: "Invalid TC Kimlik" or "Invalid TC Kimlik / VKN"
  if (text.startsWith('Invalid TC Kimlik') || text.startsWith('Invalid VKN')) {
    const value = text.split(':').slice(1).join(':').trim()
    const template = trMap['invalidTcKimlik'] || 'Geçersiz TC Kimlik / VKN: {value}'
    const translated = template.replace('{value}', value)
    return prefix ? `${prefix}${translated}` : translated
  }

  // Dynamic pattern: "Market premiums increased N% YoY..."
  const yoyMatch = text.match(/^Market premiums increased (\d+)% YoY - lock in rates early$/)
  if (yoyMatch) {
    const template =
      trMap['marketPremiumsYoY'] ||
      'Piyasa primleri yıllık %{percent} arttı - oranları erkenden sabitleyin'
    const translated = template.replace('{percent}', yoyMatch[1])
    return prefix ? `${prefix}${translated}` : translated
  }

  // No translation found — flag in DEV so locale-mixing regressions are visible
  // during development (Bug #15). Guard by `process.env.NODE_ENV !== 'production'`
  // so Railway stays quiet.
  if (
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV !== 'production' &&
    /^[\x20-\x7E]{6,}$/.test(text) && // mostly ASCII → likely English
    /\s[a-z]+\s/i.test(text) // has multi-word spacing
  ) {
    // Skip known safe patterns (emoji-only, short tokens).
    console.warn(
      `[LocaleMixAudit] insight passed through untranslated — consider adding to insightTranslations: "${text.slice(0, 120)}"`
    )
  }
  return insight
}

/**
 * Reverse-translate a Turkish insight to its English equivalent if known.
 * Iterates the EN→TR translation map looking for a matching TR value, and
 * returns the EN key. Used for cross-language deduplication so an insight
 * present in both languages collapses to a single entry.
 *
 * If no match is found (e.g., new dynamic insight), returns the input unchanged.
 */
// Exported for unit tests verifying cross-language deduplication
export function translateInsightToEn(insight: string): string {
  const trMap = TR_TRANSLATIONS.insightTranslations
  // eslint-disable-next-line no-misleading-character-class
  const prefixMatch = insight.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  const text = prefix ? insight.slice(prefix.length).trim() : insight

  for (const [enKey, trValue] of Object.entries(trMap)) {
    if (trValue === text) {
      return prefix ? `${prefix}${enKey}` : enKey
    }
  }
  return insight
}

/**
 * Translate an array of English insight strings to Turkish.
 */
function translateInsightsToTr(insights: string[]): string[] {
  return insights.map(translateInsightToTr)
}

/**
 * Bug #7 — Detect replacement-parts clauses (Eşdeğer / Çıkma Parça) on older
 * vehicles. Returns a Turkish reviewer insight or null if not applicable.
 *
 * Fires when:
 *   - Vehicle model year is known AND age ≥ 7yr
 *   - Any exclusion / special condition mentions "eşdeğer parça", "çıkma parça",
 *     "orijinal olmayan", or similar OEM-restricting language.
 *
 * Turkish İ handled via character classes (gotcha #62).
 */
export function derivePartsClauseInsight(
  policy: AnalyzedPolicy,
  data: ExtractedPolicyData
): string | null {
  const year = policy.vehicleInfo?.year
  if (!year || year <= 0) return null
  const age = new Date().getFullYear() - year
  if (age < 7) return null

  const NON_OEM_PATTERNS = [
    /eşdeğer\s+parça/i,
    /ç[iı]kma\s+parça/i,
    /or[iı]j[iı]nal\s+olmayan/i,
    /yan\s+sanay[iı]/i,
    /OEM\s+olmayan/i,
  ]

  const hayBlob = [
    ...(data.exclusions ?? []),
    ...(policy.exclusions ?? []),
    ...(data.specialConditions ?? []),
    ...(policy.specialConditions ?? []),
  ]
    .filter((s): s is string => typeof s === 'string')
    .join(' | ')

  if (!hayBlob) return null

  for (const pattern of NON_OEM_PATTERNS) {
    if (pattern.test(hayBlob)) {
      return `⚠ ${age} yaşında araçta eşdeğer/çıkma parça kullanımı — onarım kalitesi ve ikinci el değeri etkilenebilir; orijinal parça (OEM) zeyilnamesi düşünülmelidir`
    }
  }
  return null
}

/**
 * Generate AI insights (async, DB-backed benchmarks)
 */
async function generateAIInsightsAsync(data: ExtractedPolicyData): Promise<string[]> {
  const insights: string[] = []
  // Reviewer-mode priority order: gaps/warnings first, then strengths, then recommendations
  // Gaps and recommendations are generated in English, then translated to Turkish
  // for language-consistent reviewer output. Strengths are already Turkish.
  const gaps = await generateGapsAsync(data)
  insights.push(...gaps.map((g) => `⚠ ${translateInsightToTr(g)}`))
  insights.push(...generateStrengths(data).map((s) => `✓ ${s}`))
  const recs = await generateRecommendationsAsync(data)
  insights.push(...recs.map((r) => `💡 ${translateInsightToTr(r)}`))

  const currency = data.currency ?? 'TRY'
  const address = data.insuredAddress
  const currencyValidation = validateCurrencyRegion(currency, address)
  if (currencyValidation.warning) {
    insights.push(`⚠ ${currencyValidation.warning}`)
  }

  // AI Sense-Checking Layer: Filter out false-positives based on broader logic
  try {
    const proxyUrl = getProxyUrl()
    if (proxyUrl) {
      const response = await fetch(`${proxyUrl}/api/ai/sense-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof localStorage !== 'undefined' && {
            'x-user-id': localStorage.getItem('insurai_user_id') || '',
          }),
        },
        body: JSON.stringify({ rawInsights: insights, policyData: data }),
      })
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.validInsights) {
          // In development mode, log discard reason context if needed
          if (import.meta.env.DEV && result.validInsights.length !== insights.length) {
            console.warn('[AI Sense-Check] Filtered insights:', {
              original: insights,
              filtered: result.validInsights,
            })
          }
          return result.validInsights
        }
      }
    }
  } catch (err) {
    console.warn('[AI Sense-Check] Handled failure, falling back to raw insights', err)
  }

  return insights
}

/**
 * Detect personalization leaks in AI-generated insights.
 * The AI sometimes injects identity comparisons like
 * "This policy owner is not Erdem" which must never appear in output.
 */
function isPersonalizationLeak(text: string): boolean {
  const lower = text.toLowerCase()
  // "policy owner is not X" / "insured name: X" identity comparison patterns
  if (/policy\s+owner\s+is\s+not\b/i.test(lower)) return true
  if (/this\s+policy\s+.*\s+is\s+not\s+/i.test(lower)) return true
  // "✗ ... not <Name> (insured name: ...)" pattern
  if (/not\s+\w+\s*\(insured\s+name/i.test(lower)) return true
  // Generic "insured.*is not <proper noun>" comparison
  if (/insured\s+(?:person|name|party)\s+is\s+not\b/i.test(lower)) return true
  // Turkish variants: "poliçe sahibi ... değil" identity comparison
  if (/poli[çc]e\s+sahibi\b.*\bde[ğg]il/i.test(lower)) return true
  // "owner is not" / "sahibi ... değil" with any prefix
  if (/\bowner\s+is\s+not\b/i.test(lower)) return true
  // Catch "is not <ProperName>." at end of sentence (the period-terminated form)
  // Exclude common non-identity phrases: "is not included", "is not covered", "is not available"
  if (/\bis\s+not\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\.?\s*$/.test(text)) {
    const trailingWord = text.match(/\bis\s+not\s+(\w+)\.?\s*$/)?.[1]?.toLowerCase()
    const nonIdentityWords = [
      'included',
      'covered',
      'available',
      'applicable',
      'recommended',
      'required',
      'specified',
      'confirmed',
    ]
    if (trailingWord && !nonIdentityWords.includes(trailingWord)) return true
  }
  return false
}

/**
 * Sanitize reviewer-mode insights: enforce Turkish, strip promotional wording,
 * fix duplicated fragment assembly, reorder to evidence-first.
 *
 * Runs AFTER dedup, BEFORE translation. The primary aiInsights array is the
 * canonical source; aiInsightsTr is derived from it.
 */
function sanitizeReviewerInsights(insights: string[]): string[] {
  const result: string[] = []

  for (const raw of insights) {
    const line = raw

    // ── Strip emoji prefix for analysis, re-add later ──
    // eslint-disable-next-line no-misleading-character-class
    const prefixMatch = line.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
    const prefix = prefixMatch ? prefixMatch[1] : ''
    let body = prefix ? line.slice(prefix.length).trim() : line.trim()

    // ── BLOCK: Promotional / sales wording ──
    // "Excellent", "advantage", "perfect", "best", "superior"
    if (/\b(excellent|advantage|perfect|best|superior|outstanding)\b/i.test(body)) {
      // Rewrite to neutral Turkish evidence phrasing
      if (/comprehensive.*coverage|kasko.*coverage|market.*value/i.test(body)) {
        body =
          'Kasko ana teminatı araç piyasa değeri üzerinden tanımlanmış görünüyor; standart kapsam ayrıntıları poliçe şartlarıyla doğrulanmalı'
      } else if (/glass|cam/i.test(body)) {
        body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
      } else if (/excess.*liab|mali.*mesuliyet|ihtiyari/i.test(body)) {
        body =
          'İhtiyari mali mesuliyet teminatı mevcut görünüyor; kapsam üst sınırı ve istisnalar poliçe şartlarından doğrulanmalı'
      } else {
        // Generic neutralization
        body = body
          .replace(/\b(excellent|advantage|perfect|best|superior|outstanding)\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        if (!body) continue // empty after stripping
      }
    }

    // ── FIX: Duplicated fragment assembly ──
    // Detect patterns like "X - X protection for Y" where X repeats
    // e.g. "Generally unlimited...sublimits...carve-outs excess liability - Generally unlimited...sublimits...carve-outs protection"
    if (/generally unlimited.*generally unlimited/i.test(body)) {
      body =
        'İhtiyari mali mesuliyet teminatı mevcut görünüyor; kapsam üst sınırı genel olarak geniş olmakla birlikte alt limitler ve istisnalar poliçe şartlarından doğrulanmalı'
    }

    // ── FIX: Remaining English-only insights → Turkish ──
    // Evidence insights from AI may be fully English. Translate known patterns.
    if (/^[A-Za-z]/.test(body) && !/[çğıöşüÇĞİÖŞÜ]/.test(body)) {
      // Fully English body — translate via the insight translator
      const translated = translateInsightToTr(body)
      if (translated !== body) {
        body = translated
      } else {
        // No translation found — try applySafeWording to at least neutralize
        body = applySafeWordingForInsight(body)
      }
    }

    // ── FIX: Glass-related promotional patterns ──
    if (/glass.*(?:bonus|advantage|doesn.?t affect)/i.test(body)) {
      body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    }
    if (/first.*glass.*replacement.*(?:no.?claims|bonus)/i.test(body)) {
      body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    }

    // ── Evidence-softening: replace overclaiming with hedged observation ──
    // "X teminatı mevcut" → "X teminatı mevcut görünüyor; ... doğrulanmalı"
    // "X teminat altında" → "X teminat altında olabilir; ... doğrulanmalı"
    body = softenReviewerInsight(body)

    result.push(prefix ? `${prefix}${body}` : body)
  }

  // ── Evidence-first ordering ──
  // a) ⚠ review-required / uncertainty
  // b) ✓ material coverage observations
  // c) other (special conditions etc.)
  // d) 💡 benchmark / recommendations (last)
  const warnings = result.filter((i) => i.startsWith('⚠'))
  const observations = result.filter((i) => i.startsWith('✓'))
  const recommendations = result.filter((i) => i.startsWith('💡'))
  const other = result.filter(
    (i) => !i.startsWith('⚠') && !i.startsWith('✓') && !i.startsWith('💡')
  )

  return [...warnings, ...observations, ...other, ...recommendations]
}

/**
 * Lightweight safe-wording for insight strings that remain in English.
 * Mirrors the key patterns from display-interpreter's applySafeWording
 * without importing it (to avoid circular dependency).
 */
function applySafeWordingForInsight(text: string): string {
  return text
    .replace(/\bunlimited\b/gi, 'genel olarak geniş kapsamlı, alt limitler ve istisnalara tabi')
    .replace(/\bfully covered\b/gi, 'poliçe koşullarına tabi kapsam')
    .replace(/\bfull protection\b/gi, 'poliçe koşullarına tabi koruma')
    .replace(/\bno deductible\b/gi, 'muafiyet durumu senaryoya bağlıdır')
    .replace(/\bguaranteed\b/gi, 'poliçe şartlarına tabi')
}

/**
 * Soften overclaiming Turkish insight phrasing to reviewer-safe evidence language.
 * Transforms assertive claims into hedged observations.
 */
function softenReviewerInsight(text: string): string {
  let s = text

  // "X teminatı mevcut" → "X teminatı mevcut görünüyor; uygulama koşulları doğrulanmalı"
  // but only if not already hedged
  if (/teminat[ıi]\s+mevcut\b/i.test(s) && !/görünüyor|doğrulanmalı|olabilir/.test(s)) {
    s = s.replace(
      /teminat([ıi])\s+mevcut\b/gi,
      'teminat$1 mevcut görünüyor; uygulama koşulları doğrulanmalı'
    )
  }

  // "X teminat altında" → "X teminat altında olabilir; kapsam doğrulanmalı"
  if (/teminat\s+altında\b/i.test(s) && !/olabilir|doğrulanmalı|görünüyor/.test(s)) {
    s = s.replace(/teminat\s+altında\b/gi, 'teminat altında olabilir; kapsam ve limit doğrulanmalı')
  }

  // "da teminat altında" at end → soften
  if (/da\s+teminat\s+altında\s*$/i.test(s) && !/olabilir|doğrulanmalı/.test(s)) {
    s = s.replace(
      /da\s+teminat\s+altında\s*$/i,
      'ilişkin ek teminat kaydı bulunuyor olabilir; kapsam ve limit doğrulanmalı'
    )
  }

  // "tespit edildi" without hedge → "tespit edilmiş görünüyor; ... doğrulanmalı"
  // But only for ✓ style observations, not ⚠ warnings
  if (/tespit edildi\b/i.test(s) && !/görünüyor|doğrulanmalı|gözden geçirilmeli/.test(s)) {
    s = s.replace(/tespit edildi\b/gi, 'tespit edilmiş görünüyor; uygulama koşulları doğrulanmalı')
  }

  return s
}

/**
 * Normalize Turkish legal entity name spacing.
 * Handles OCR/AI artifacts like "LİMİTEDŞİRKETİ" → "LİMİTED ŞİRKETİ"
 */
function normalizeTurkishLegalEntityName(name: string): string {
  if (!name) return name
  let result = name
  // Insert space before common Turkish legal suffixes that are merged
  // LİMİTEDŞİRKETİ → LİMİTED ŞİRKETİ
  result = result.replace(/LİMİTED(?=ŞİRKET)/g, 'LİMİTED ')
  // ANONİMŞİRKETİ → ANONİM ŞİRKETİ
  result = result.replace(/ANONİM(?=ŞİRKET)/g, 'ANONİM ')
  // TİCARETLİMİTED → TİCARET LİMİTED
  result = result.replace(/TİCARET(?=LİMİTED)/g, 'TİCARET ')
  // SANAYİVE → SANAYİ VE
  result = result.replace(/SANAYİ(?=VE\s)/g, 'SANAYİ ')
  // Lowercase variants
  result = result.replace(/limited(?=şirket)/gi, 'limited ')
  result = result.replace(/anonim(?=şirket)/gi, 'anonim ')
  result = result.replace(/ticaret(?=limited)/gi, 'ticaret ')
  // Collapse any resulting double spaces
  result = result.replace(/\s{2,}/g, ' ').trim()
  return result
}

/**
 * Deduplicate semantically overlapping exclusions.
 * Groups exclusions by semantic key-phrase clusters. When two exclusions
 * share a cluster, the longer (more informative) one is kept.
 */
/**
 * Classify exclusions into true exclusions vs conditional deductibles.
 * Items that describe percentage-based deductibles, repair conditions,
 * or application-specific muafiyet rules are separated from true
 * non-coverage exclusions (theft scenarios, licence requirements, etc.).
 */
function classifyExclusions(exclusions: string[]): {
  trueExclusions: string[]
  conditionalDeductibles: string[]
  trueExclusionIndices: Set<number>
  /** Highest percentage-based deductible found (e.g., 35 for "35% tenzili muafiyet") */
  maxDeductiblePercent: number
} {
  const conditionalPatterns = [
    /muafiyet/i, // "muafiyet" = deductible
    /tenzil/i, // "tenzili muafiyet" = applied deductible
    /%\s*\d+/i, // percentage like %35
    /\d+\s*%/i, // percentage like 35%
    /anlaşmalı olmayan.*servis/i, // non-contracted repair
    /anlaşmasız.*servis/i, // same variant
    /onarım.*muafiyet/i, // repair deductible
    /pert.*muafiyet/i, // total loss deductible
    /pert.*tenzil/i, // total loss applied deductible
  ]

  const trueExclusions: string[] = []
  const conditionalDeductibles: string[] = []
  const trueExclusionIndices = new Set<number>()
  let maxDeductiblePercent = 0

  for (let i = 0; i < exclusions.length; i++) {
    const text = exclusions[i]
    const isConditional = conditionalPatterns.some((p) => p.test(text))
    if (isConditional) {
      // Extract percentage value if present (e.g., "35%" or "%35")
      const pctMatch = text.match(/(\d{1,3})\s*%/) || text.match(/%\s*(\d{1,3})/)
      if (pctMatch) {
        const pct = parseInt(pctMatch[1], 10)
        if (pct > 0 && pct <= 100 && pct > maxDeductiblePercent) {
          maxDeductiblePercent = pct
        }
      }
      // Apply evidence-softened wording
      conditionalDeductibles.push(softenConditionalDeductible(text))
    } else {
      trueExclusions.push(text)
      trueExclusionIndices.add(i)
    }
  }

  return { trueExclusions, conditionalDeductibles, trueExclusionIndices, maxDeductiblePercent }
}

/**
 * Soften a conditional deductible statement to reviewer-safe evidence language.
 * Replaces assertive phrasing with hedged observation language.
 */
function softenConditionalDeductible(text: string): string {
  let softened = text
  // "uygulanır" (is applied) → "uygulanabileceği görülüyor" (appears to be applicable)
  softened = softened.replace(/uygulanır\b/gi, 'uygulanabileceği görülüyor')
  // "uygulanması" (application of) → "uygulanabileceği görülüyor" if at end
  if (/uygulanması\s*$/.test(softened)) {
    softened = softened.replace(/uygulanması\s*$/, 'uygulanabileceği görülüyor')
  }
  // If no transformation happened, add a hedge
  if (softened === text && !/görülüyor|görünüyor|anlaşılıyor|olabilir/.test(softened)) {
    softened = softened + ' şartı bulunduğu anlaşılıyor'
  }
  return softened
}

function deduplicateExclusions(exclusions: string[]): string[] {
  if (exclusions.length <= 1) return exclusions

  // Semantic clusters: each array of keywords defines one concept.
  // If two exclusions both match the same cluster, they are duplicates.
  const clusters: string[][] = [
    ['anahtar', 'kontak', 'çalın'], // key-in-ignition theft
    ['çalışır', 'vaziyette', 'çalın'], // vehicle-left-running theft
    ['ehliyet', 'sürücü belgesi', 'kullanım'], // no valid licence
    ['özel tertibatlı', 'ruhsat', 'tescil'], // special vehicle registration
  ]

  // For each exclusion, find which clusters it matches
  const exclusionClusters: Map<number, number[]> = new Map()
  for (let i = 0; i < exclusions.length; i++) {
    const lower = exclusions[i].toLowerCase()
    const matched: number[] = []
    for (let c = 0; c < clusters.length; c++) {
      const hits = clusters[c].filter((kw) => lower.includes(kw))
      if (hits.length >= 2) matched.push(c) // require 2+ keyword hits
    }
    exclusionClusters.set(i, matched)
  }

  // Group exclusions by cluster. For each cluster, keep the longest.
  const keptIndices = new Set<number>()
  const clusterWinner = new Map<number, number>() // cluster → winning exclusion index

  for (let i = 0; i < exclusions.length; i++) {
    const myClust = exclusionClusters.get(i) || []
    if (myClust.length === 0) {
      keptIndices.add(i) // no cluster match → always keep
      continue
    }
    let dominated = false
    for (const c of myClust) {
      const existing = clusterWinner.get(c)
      if (existing !== undefined) {
        // This cluster already has a winner — keep the longer one
        if (exclusions[i].length > exclusions[existing].length) {
          keptIndices.delete(existing)
          keptIndices.add(i)
          clusterWinner.set(c, i)
        }
        dominated = true
      } else {
        clusterWinner.set(c, i)
        keptIndices.add(i)
      }
    }
    if (!dominated) keptIndices.add(i)
  }

  // Preserve original order
  return exclusions.filter((_, idx) => keptIndices.has(idx))
}

/**
 * Generate policy strengths based on extracted data
 */
function generateStrengths(data: ExtractedPolicyData): string[] {
  const strengths: string[] = []

  // Only claim zero deductible if there are also positive deductibles elsewhere
  // (proving the AI actually extracted deductible data rather than defaulting everything to 0)
  const hasPositiveDeductible = data.coverages.some((c) => c.deductible && c.deductible > 0)
  if (hasPositiveDeductible && data.coverages.some((c) => c.deductible === 0)) {
    strengths.push('Bazı teminatlarda muafiyet uygulanmıyor')
  }

  if (data.specialConditions.length > 0) {
    strengths.push(
      `${data.specialConditions.length} özel kloz tespit edildi — koşulların geçerliliği doğrulanmalı`
    )
  }

  // Generic structural observations (coverage count, limit thresholds) are suppressed
  // in reviewer mode because they provide no actionable correction information.
  // If no specific strengths were found, note standard coverage.
  if (strengths.length === 0) {
    strengths.push('Poliçe türüne uygun standart teminat yapısı')
  }

  return strengths
}

/**
 * Check if policy has kasko base coverage that includes fundamental protections.
 * Expanded to detect market-value main coverages and comprehensive auto naming
 * that AI may produce without the literal word "kasko".
 */
function hasKaskoBaseCoverage(coverages: ExtractedCoverage[]): boolean {
  return coverages.some((c) => {
    const nameLower = getCoverageName(c)
    return (
      nameLower === 'kasko' ||
      nameLower.includes('tam kasko') ||
      nameLower.includes('full kasko') ||
      nameLower.includes('mini kasko') ||
      nameLower.includes('kasko sigortası') ||
      (nameLower.includes('kasko') && c.category === 'main') ||
      // AI may extract main coverage as "Comprehensive Auto Insurance" or
      // "Market Value Coverage" without "kasko" in the name — these are KASKO
      (nameLower.includes('comprehensive') && nameLower.includes('auto')) ||
      nameLower.includes('motor own damage') ||
      // isMarketValue on a main category coverage is a strong KASKO signal
      (c.isMarketValue === true && c.category === 'main')
    )
  })
}

/**
 * Coverages that are inherently included in base kasko coverage
 * These should NOT be flagged as missing if kasko coverage exists
 */
const KASKO_IMPLICIT_COVERAGES = [
  'çarpma',
  'çarpışma',
  'collision',
  'collision damage',
  'hırsızlık',
  'theft',
  'yangın',
  'fire',
  'fire damage',
  'doğal afet',
  'natural disaster',
  'natural disasters',
  'sel',
  'flood',
  'flood damage',
  'deprem',
  'earthquake',
  'ani hareket',
  'sudden movement',
  'fırtına',
  'storm',
  'dolu',
  'hail',
  // Additional benchmark names that are inherent in KASKO products
  'kara araçları',
  'motor own damage',
  'own damage',
  'kasko',
  'comprehensive',
  'vandalism',
  'vandalizm',
  'terör',
  'terrorism',
  'grev',
  'strike',
  'toprak kayması',
  'landslide',
]

/**
 * Generate policy gaps (async, DB-backed benchmarks)
 */
async function generateGapsAsync(data: ExtractedPolicyData): Promise<string[]> {
  const gaps: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = await marketDataProvider.getBenchmark(policyType)

  if (data.exclusions.length > 5) {
    gaps.push('Multiple exclusions may limit coverage in certain scenarios')
  }

  const avgDeductible =
    benchmark.commonCoverages.reduce((sum, c) => sum + c.typicalDeductible, 0) /
    benchmark.commonCoverages.length

  if (data.coverages.some((c) => c.deductible && c.deductible > avgDeductible * 2)) {
    gaps.push('High deductibles may result in significant out-of-pocket costs')
  }

  const criticalCoverages = benchmark.commonCoverages.filter((c) => c.inclusionRate >= 90)
  const isKaskoPolicy = policyType === 'kasko'
  const hasBaseKasko = isKaskoPolicy && hasKaskoBaseCoverage(data.coverages)
  const isTrafficPolicy = policyType === 'traffic'

  // For KASKO policies where base coverage was NOT positively identified by name,
  // but policyType is 'kasko', emit ONE coherent uncertainty message instead of
  // individual "Missing common coverage: X" for each implicit peril.
  // This avoids the contradiction of labeling a policy as KASKO while also
  // claiming collision/fire/theft are missing.
  let kaskoImplicitUncertaintyEmitted = false

  for (const critical of criticalCoverages) {
    const criticalNameLower = critical.nameTr.toLowerCase()
    const criticalNameEn = getCoverageName(critical)
    const isImplicitCoverage = KASKO_IMPLICIT_COVERAGES.some(
      (implicit) => criticalNameLower.includes(implicit) || criticalNameEn.includes(implicit)
    )

    if (hasBaseKasko && isImplicitCoverage) {
      // KASKO base coverage positively identified — suppress implicit warnings
      continue
    }

    if (isKaskoPolicy && !hasBaseKasko && isImplicitCoverage) {
      // policyType is 'kasko' but base coverage not identified by name —
      // emit a single reviewer-safe uncertainty message, not individual warnings
      if (!kaskoImplicitUncertaintyEmitted) {
        gaps.push(
          'Ana teminat kapsamı standart kasko risklerini işaret ediyor, ancak temel teminatların açık listesi insan incelemesiyle doğrulanmalı'
        )
        kaskoImplicitUncertaintyEmitted = true
      }
      continue
    }

    const baseNameMatch = criticalNameLower.match(/^([^(]+)/)
    const criticalBaseName = baseNameMatch ? baseNameMatch[1].trim() : criticalNameLower

    const hasCoverage = data.coverages.some((c) => {
      const coverageNameLower = getCoverageName(c)
      const coverageLimit = c.limit ?? 0

      if (
        coverageNameLower.includes(getCoverageName(critical)) ||
        coverageNameLower.includes(criticalNameLower)
      ) {
        return true
      }

      if (isTrafficPolicy) {
        const matchesBaseName =
          coverageNameLower.includes(criticalBaseName) ||
          criticalBaseName.includes(coverageNameLower.replace(/\([^)]*\)/g, '').trim())

        if (matchesBaseName) {
          const limitTolerance = critical.typicalLimit * 0.1
          if (Math.abs(coverageLimit - critical.typicalLimit) <= limitTolerance) return true
          if (
            criticalNameLower.includes('kaza başı') &&
            coverageLimit >= critical.typicalLimit * 0.9
          )
            return true
        }
      }

      return false
    })

    if (!hasCoverage) {
      if (isTrafficPolicy && criticalNameLower.includes('kişi başı')) {
        const hasPerAccident = data.coverages.some(
          (c) =>
            getCoverageName(c).includes(criticalBaseName) && (c.limit ?? 0) >= critical.typicalLimit
        )
        if (hasPerAccident) continue
      }
      // Use English name by default, we will translate in the UI
      gaps.push(`Missing common coverage: ${critical.name}`)
    }
  }

  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
  if (totalCoverage < benchmark.coverageRange.average * 0.5) {
    gaps.push('Total coverage significantly below market average')
  }

  if (policyType === 'home') {
    const hasDaskMention = data.coverages.some((c) => {
      const nameLower = getCoverageName(c)
      return (
        nameLower.includes('deprem') ||
        nameLower.includes('dask') ||
        nameLower.includes('earthquake')
      )
    })
    if (!hasDaskMention) {
      gaps.push('Consider adding DASK earthquake insurance if not included')
    }
  }

  return gaps.slice(0, 5)
}

/**
 * Generate recommendations (async, DB-backed benchmarks)
 */
async function generateRecommendationsAsync(data: ExtractedPolicyData): Promise<string[]> {
  const recommendations: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = await marketDataProvider.getBenchmark(policyType)

  // ── Benchmark provenance gate ──────────────────────────────────────
  // Percentile and YoY claims require provenance: source, date, cohort.
  // All three fields must be non-empty strings for the gate to open.
  const p = benchmark.provenance
  const hasBenchmarkProvenance = !!(p?.source && p?.date && p?.cohort)

  if (hasBenchmarkProvenance) {
    if (data.premium && data.premium > benchmark.premiumRange.percentile75) {
      recommendations.push('Premium is above 75th percentile - compare with other providers')
    }

    const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
    if (totalCoverage < benchmark.coverageRange.median) {
      recommendations.push('Coverage below market median - consider increasing limits')
    }

    if (benchmark.trends.premiumChangeYoY > 30) {
      recommendations.push(
        `Market premiums increased ${Math.round(benchmark.trends.premiumChangeYoY)}% YoY - lock in rates early`
      )
    }
  }

  // Only add generic advice when no more critical recommendations were found
  if (recommendations.length === 0) {
    recommendations.push('Prim ve teminat karşılaştırması için güncel piyasa verisi doğrulanmalı')
  }
  return recommendations.slice(0, 5)
}

/**
 * Generate market comparison (async, DB-backed)
 */
async function generateMarketComparisonAsync(
  data: ExtractedPolicyData
): Promise<AnalyzedPolicy['marketComparison']> {
  const premium = data.premium ?? 0
  const policyType = (data.policyType ?? 'home') as PolicyType
  const location = data.insuredAddress ?? undefined
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)

  return generateMarketComparisonDataAsync(premium, totalCoverage, policyType, location)
}

// ============================================================================
// TWO-PASS COMPREHENSIVE EXTRACTION
// Implements the enhanced extraction with structured output
// ============================================================================

import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT_TEMPLATE,
  parseStructuredOutput,
  extractQualityScore,
  extractWatchOuts,
  type StructuredPolicyData,
} from './kasko-parser-prompts'
import { applyComprehensivePreprocessing, addSectionMarkers } from './text-processor'
import { env } from '@/lib/env'

/**
 * Result from comprehensive two-pass extraction
 */
export interface ComprehensiveExtractionResult {
  success: boolean
  policyBrief: string | null // Markdown formatted Policy Brief
  structuredData: StructuredPolicyData | null // Machine-readable JSON
  watchOuts: string[] // Top 15 watch-outs
  qualityScore: number // 0-100 quality score
  sectionsFound: string[] // Document sections identified
  preprocessingStats: {
    garbageBlocksRemoved: number
    qrBlocksRemoved: number
    spacedCharsFixed: number
    totalCharactersRemoved: number
  }
  error?: string
}

/**
 * Comprehensive two-pass policy extraction
 *
 * Pass 1: Preprocess text (remove garbage, fix OCR, segment sections)
 * Pass 2: Extract structured data with quality scoring
 *
 * Returns both human-readable Policy Brief and machine-readable JSON.
 */
export async function extractPolicyComprehensive(
  rawText: string,
  options: {
    provider?: 'openai' | 'anthropic'
    requireQualityScore?: number // Minimum quality score (default: 90)
    maxRetries?: number // Max retries for quality improvement
  } = {}
): Promise<ComprehensiveExtractionResult> {
  const { provider = 'openai', requireQualityScore = 90, maxRetries = 2 } = options

  // Pass 1: Comprehensive preprocessing
  const { text: preprocessed, stats } = applyComprehensivePreprocessing(rawText, {
    addSectionMarkers: true,
  })

  // Get sections found
  const { sectionsFound } = addSectionMarkers(rawText)

  const API_URL = env.proxyUrl
  if (!API_URL) {
    return {
      success: false,
      policyBrief: null,
      structuredData: null,
      watchOuts: [],
      qualityScore: 0,
      sectionsFound,
      preprocessingStats: {
        garbageBlocksRemoved: stats.garbageBlocksRemoved,
        qrBlocksRemoved: stats.qrBlocksRemoved,
        spacedCharsFixed: stats.spacedCharsFixed,
        totalCharactersRemoved: stats.totalCharactersRemoved,
      },
      error: 'AI service not configured',
    }
  }

  // Pass 2: AI extraction with structured output
  let attempts = 0
  let bestResult: { response: string; qualityScore: number } | null = null

  while (attempts < maxRetries + 1) {
    attempts++

    try {
      const userPrompt = EXTRACTION_USER_PROMPT_TEMPLATE.replace(
        '{PROCESSED_TEXT}',
        preprocessed.slice(0, 25000)
      )

      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userPrompt,
          policyContext: EXTRACTION_SYSTEM_PROMPT,
          provider,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      if (!data.success || !data.response) {
        throw new Error(data.error || 'Empty response from AI')
      }

      const aiResponse = data.response
      const qualityScore = extractQualityScore(aiResponse)

      // Keep best result
      if (!bestResult || qualityScore > bestResult.qualityScore) {
        bestResult = { response: aiResponse, qualityScore }
      }

      // If quality score meets requirement, we're done
      if (qualityScore >= requireQualityScore) {
        break
      }

      // Log quality issue in development
      if (import.meta.env.DEV) {
        console.warn(
          `[Extraction] Quality score ${qualityScore} < ${requireQualityScore}, retry ${attempts}/${maxRetries + 1}`
        )
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(`[Extraction] Attempt ${attempts} failed:`, error)
      }
      // Continue to next attempt
    }
  }

  if (!bestResult) {
    return {
      success: false,
      policyBrief: null,
      structuredData: null,
      watchOuts: [],
      qualityScore: 0,
      sectionsFound,
      preprocessingStats: {
        garbageBlocksRemoved: stats.garbageBlocksRemoved,
        qrBlocksRemoved: stats.qrBlocksRemoved,
        spacedCharsFixed: stats.spacedCharsFixed,
        totalCharactersRemoved: stats.totalCharactersRemoved,
      },
      error: 'All extraction attempts failed',
    }
  }

  // Parse the best result
  const structuredData = parseStructuredOutput(bestResult.response)
  const watchOuts = extractWatchOuts(bestResult.response)

  // Extract policy brief (everything before the JSON block)
  let policyBrief = bestResult.response
  const jsonStart = bestResult.response.indexOf('```json')
  if (jsonStart > 0) {
    policyBrief = bestResult.response.substring(0, jsonStart).trim()
  }

  return {
    success: true,
    policyBrief,
    structuredData,
    watchOuts,
    qualityScore: bestResult.qualityScore,
    sectionsFound,
    preprocessingStats: {
      garbageBlocksRemoved: stats.garbageBlocksRemoved,
      qrBlocksRemoved: stats.qrBlocksRemoved,
      spacedCharsFixed: stats.spacedCharsFixed,
      totalCharactersRemoved: stats.totalCharactersRemoved,
    },
  }
}

/**
 * Convert comprehensive extraction result to AnalyzedPolicy
 * Bridges the new extraction format with existing policy type
 */
export function comprehensiveToAnalyzedPolicy(
  result: ComprehensiveExtractionResult,
  file: File,
  rawText: string,
  processedText: string
): AnalyzedPolicy | null {
  if (!result.success || !result.structuredData) {
    return null
  }

  const data = result.structuredData
  const now = new Date()

  // Determine status based on dates
  // Use parseTurkishDate first to avoid V8 DD.MM.YYYY day/month swap (gotcha #52)
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  if (data.policy.endDate) {
    const parsedEnd = parseTurkishDate(data.policy.endDate)
    const endDate = parsedEnd ? new Date(parsedEnd + 'T00:00:00Z') : new Date(data.policy.endDate)
    if (!isNaN(endDate.getTime())) {
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry < 0) {
        status = 'expired'
      } else if (daysUntilExpiry <= 30) {
        status = 'expiring'
      }
    }
  }

  // Convert coverages — resolve nameTr via AI value, then canonical map fallback
  const coverages: Coverage[] = data.coverages.map((c) => {
    const aiNameTr = c.nameTr && c.nameTr !== c.name ? c.nameTr : null
    const mappedNameTr = lookupCoverageNameTr(c.name)
    return {
      name: c.name,
      nameTr: aiNameTr ?? mappedNameTr ?? c.name,
      limit: c.limit ?? 0,
      deductible: c.deductible ?? 0,
      included: c.included ?? true,
      isUnlimited: c.isUnlimited,
      isMarketValue: c.isMarketValue,
      category: c.category,
      importance:
        c.category === 'main' ? 'critical' : c.category === 'liability' ? 'standard' : 'minor',
    }
  })

  // Calculate main coverage
  const totalCoverage = calculateMainCoverage('kasko', coverages)

  const policy: AnalyzedPolicy = {
    id: crypto.randomUUID(),
    policyNumber: data.policy.policyNumber ?? `POL-${Date.now()}`,
    type: 'kasko',
    typeTr: 'Kasko',
    provider: data.policy.provider,
    logo: '',
    coverage: totalCoverage,
    premium: data.premium.totalPremium,
    monthlyPremium: data.premium.totalPremium / 12,
    deductible: coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0,
    startDate: data.policy.startDate,
    expiryDate: data.policy.endDate,
    status,
    uploadDate: now.toISOString().split('T')[0],
    fileName: file.name,
    documentType: 'PDF',
    documentUrl: URL.createObjectURL(file),
    insuredPerson: data.insured.name,
    location: data.insured.address ?? undefined,
    insuredAddress: data.insured.address ?? undefined,
    coverages,
    exclusions: data.exclusions.map((e) => e.trigger),
    exclusionsEn: ensureExclusionsEn(data.exclusions.map((e) => e.trigger)),
    specialConditions: [],
    insuranceLine: 'Kasko',
    currency: data.premium.currency,
    aiConfidence: result.qualityScore / 100,
    aiInsights: [
      ...result.watchOuts.slice(0, 5).map((w) => `⚠ ${w}`),
      `🔍 Kalite skoru: ${result.qualityScore}/100`,
    ],
    marketComparison: generateMarketComparisonData(
      data.premium.totalPremium,
      totalCoverage,
      'kasko',
      data.insured.address ?? undefined
    ),
    extractedText: rawText,
    processedText,
    vehicleInfo: data.vehicle
      ? {
          make: data.vehicle.make,
          model: data.vehicle.model,
          year: data.vehicle.year,
          plate: data.vehicle.plate,
          chassisNo: data.vehicle.chassisNumber ?? undefined,
          engineNo: data.vehicle.engineNumber ?? undefined,
          usage: data.vehicle.usageType,
        }
      : undefined,
  }

  // Translate insights to Turkish at extraction time
  policy.aiInsightsTr = translateInsightsToTr(policy.aiInsights)

  return policy
}

// ============================================================================
// KASKO PILOT QA RECORD PERSISTENCE
// ============================================================================

/**
 * Persist a pilot QA record to Supabase kasko_pilot_qa_records table.
 * Fire-and-forget: failures are logged but never block the extraction pipeline.
 */
async function persistPilotQARecord(record: PilotQARecord): Promise<void> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[PilotQA] Supabase not configured, skipping QA record persistence')
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase.from('kasko_pilot_qa_records').insert({
      document_id: record.documentId,
      filename: record.filename,
      branch: record.branch,
      review_date: record.reviewDate,
      reviewer_user_id: record.reviewerUserId,
      extraction_success: record.extractionSuccess,
      extraction_model: record.extractionModel,
      text_char_count: record.textCharCount,
      page_count: record.pageCount,
      reviewer_outcome: record.reviewerOutcome,
      review_time_minutes: record.reviewTimeMinutes,
      correction_categories: record.correctionCategories,
      critical_fields_missed: record.criticalFieldsMissed,
      display_mode: record.displayMode,
      triggers_fired: record.triggersFired,
      phrase_clean: record.phraseClean,
      found_prohibited_phrases: record.foundProhibitedPhrases,
      admission_status: record.admissionStatus,
      admission_reason: record.admissionReason,
      counted_in_pilot_metrics: record.countedInPilotMetrics,
      coverage_count_extracted: record.coverageCountExtracted,
      special_condition_count: record.specialConditionCount,
      has_rayic_deger: record.hasRayicDeger,
      has_conditional_deductible: record.hasConditionalDeductible,
      source_quote_count: record.sourceQuoteCount,
      confidence_score: record.confidenceScore,
      zero_coverage: record.zeroCoverage,
      deductible_miss: record.deductibleMiss,
      special_condition_miss: record.specialConditionMiss,
      major_correction: record.majorCorrection,
      reviewer_notes: record.reviewerNotes,
    })

    if (error) {
      console.warn('[PilotQA] Failed to insert QA record:', error.message)
    } else {
      console.warn('[PilotQA] QA record persisted for document:', record.documentId)
    }
  } catch (err) {
    console.warn('[PilotQA] Persistence error:', err instanceof Error ? err.message : String(err))
  }
}
