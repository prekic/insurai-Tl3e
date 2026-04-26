import { samplePolicies } from '@/data/sample-policies'
import {
  createPilotQARecord,
  evaluatePilotAdmission,
  evaluateSimpleDisplayMode,
  type PilotAdmissionGateResult,
  type PilotQARecord,
} from '@/lib/analysis/kasko-pilot-gate'
import { getAIConfig } from '@/lib/config'
import {
  mergeExtractionResults,
  validateAndEnhanceExtraction,
  type ValidationResult,
} from '@/lib/extraction'

import { generateMarketComparisonDataAsync } from '@/lib/market-data/service'
import type { ProcessingLogger } from '@/lib/processing-logger'

import type { AnalyzedPolicy, PolicyType } from '@/types/policy'
import {
  AI_CONFIG,
  getConfiguredProviders,
  isAIConfigured,
  isProxyConfigured,
  type AIProvider,
} from './config'
import {
  extractWithDocumentAI,
  isDocumentOCRAvailable,
  type FormField,
  type PageText,
  type Table,
} from './document-ocr'
import { ExtractedCoverage, ExtractedPolicyData } from './extraction-schema'
import { extractFormFieldMap, findFormField, TURKISH_FORM_FIELD_PATTERNS } from './ocr'
import { extractTextFromPDFWithRetry, isPDFFile } from './pdf-parser'
import { extractWithClaude } from './providers/claude'
import { extractWithConsensus, type ConsensusResult } from './providers/consensus'
import { extractWithOpenAI } from './providers/openai'
import { resolveClauseRelationships } from './relationship-resolver'
import { mergeCoveragesWithTableData, parseTablesForCoverages } from './table-parser'
import {
  applyBasicOCRCorrections,
  processTextEnhanced,
  processTextWithAI,
  textNeedsProcessing,
  type CleanRoomResult,
} from './text-processor'
import { validateExtractionSafety } from './validator'

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
        const rawTck = enhancedExtractedData.tcKimlik || enhancedExtractedData.vkn
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
        vehiclePlate: enhancedExtractedData.vehiclePlate,
        vin: enhancedExtractedData.vin,
        vehicleYear: enhancedExtractedData.vehicleYear,
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
    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    vehiclePlate: null,
    vin: null,
    tcKimlik: null,
    vkn: null,
    insuredEntityType: null,
    vehicleUsage: null,
    discounts: {
      ncdDiscount: null,
      groupDiscount: null,
      otherDiscountPct: null,
      evidence: null,
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
 * Generate AI insights (async, DB-backed benchmarks)
 */
export async function generateMarketComparisonAsync(
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

import { env } from '@/lib/env'
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT_TEMPLATE,
  extractQualityScore,
  extractWatchOuts,
  parseStructuredOutput,
  type StructuredPolicyData,
} from './kasko-parser-prompts'
import { addSectionMarkers, applyComprehensivePreprocessing } from './text-processor'
import { parseTurkishCurrency } from './turkish-utils'

// Modular imports:
import { translateInsightsToTr } from './insight-translator'
import { convertToAnalyzedPolicy } from './policy-converter'
export { generateAIInsightsAsync } from './extraction/insights'
import { comprehensiveToAnalyzedPolicy } from './extraction/mappers'
export { comprehensiveToAnalyzedPolicy }

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

  // Pre-inject Regex Premium extraction to prevent LLM inflation errors
  let regexPremiumHint = ''
  const premiumPatterns = [
    /(?:br[uü]t\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
    /(?:toplam\s+(?:net\s+)?pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
    /(?:[oö]denecek\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
    /(?:net\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  ]
  for (const pat of premiumPatterns) {
    const m = preprocessed.match(pat)
    if (m && m[1]) {
      const reparsed = parseTurkishCurrency(m[1])
      if (reparsed && reparsed > 0) {
        regexPremiumHint = `\n\n[SYSTEM HINT]: Based on strict OCR pre-processing, the total premium for this policy is explicitly listed as ${m[1]} TL (Parsed as ${reparsed}). You MUST use this exact value for the totalPremium field. Do not misinterpret the decimal or thousands separators.`
        break
      }
    }
  }

  // Pass 2: AI extraction with structured output
  let attempts = 0
  let bestResult: { response: string; qualityScore: number } | null = null

  while (attempts < maxRetries + 1) {
    attempts++

    try {
      let userPrompt = EXTRACTION_USER_PROMPT_TEMPLATE.replace(
        '{PROCESSED_TEXT}',
        preprocessed.slice(0, 25000)
      )

      if (regexPremiumHint) {
        userPrompt += regexPremiumHint
      }

      const response = await fetch(`${API_URL}/api/ai/extract/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: userPrompt,
          systemPrompt: EXTRACTION_SYSTEM_PROMPT,
          policyType: 'kasko',
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      if (!data.success || (!data.data && !data.response)) {
        throw new Error(data.error || 'Empty response from AI')
      }

      let aiResponse: string
      let qualityScore: number

      if (data.data) {
        aiResponse = JSON.stringify(data.data, null, 2)
        qualityScore = data.data.qualityScore?.total ?? 0
      } else {
        aiResponse = data.response
        qualityScore = extractQualityScore(aiResponse)
      }
      if (import.meta.env.VITE_DEBUG_LOGS === 'true') {
        console.warn('--- AI RESPONSE SCORE ---', qualityScore)
      }

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
