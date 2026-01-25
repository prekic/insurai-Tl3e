import { isAIConfigured, AI_CONFIG, getConfiguredProviders, isOCRConfigured, isProxyConfigured, type AIProvider } from './config'
import type { ProcessingLogger } from '@/lib/processing-logger'
import { extractTextFromPDFWithRetry, isPDFFile } from './pdf-parser'
import {
  isLikelyScannedPDF,
  performOCR,
  type FormField,
  type Table,
  extractFormFieldMap,
  findFormField,
  TURKISH_FORM_FIELD_PATTERNS,
} from './ocr'
import { parseTablesForCoverages, mergeCoveragesWithTableData } from './table-parser'
import { performUnifiedOCR, isOrchestratorConfigured } from './ocr-orchestrator-client'
import { extractWithConsensus, type ConsensusResult } from './providers/consensus'
import { extractWithOpenAI } from './providers/openai'
import { extractWithClaude } from './providers/claude'
import { processTextWithAI, applyBasicOCRCorrections, textNeedsProcessing, processTextEnhanced, type CleanRoomResult } from './text-processor'
import {
  ExtractedPolicyData,
  ExtractedCoverage,
} from './extraction-schema'
import type { AnalyzedPolicy, PolicyType, Coverage, CoverageImportance } from '@/types/policy'
import { POLICY_TYPES } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import { generateMarketComparisonData } from '@/lib/market-data/service'
import { MARKET_BENCHMARKS } from '@/data/market-data/benchmarks'
import { RiskAssessmentService } from '@/lib/ml'
import { GapDetectionService } from '@/lib/gap-detection'
import { validateCurrencyRegion } from '@/lib/utils'
import {
  validateAndEnhanceExtraction,
  mergeExtractionResults,
  type ValidationResult,
} from '@/lib/extraction'

export interface ExtractionResult {
  success: true
  policy: AnalyzedPolicy
  extractedData: ExtractedPolicyData
  source: 'ai' | 'fallback' | 'ocr'
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
  // Document AI form fields and tables (when available)
  documentAI?: {
    formFields?: FormField[]
    tables?: Table[]
    backend: 'document-ai' | 'vision-api'
    fieldsUsed: number  // How many form fields were used to enhance extraction
    tableCoveragesUsed: number  // How many coverages were extracted from tables
  }
}

export interface ExtractionError {
  success: false
  error: {
    code: 'NO_AI_CONFIG' | 'PDF_PARSE_ERROR' | 'PDF_TIMEOUT' | 'PDF_WORKER_ERROR' | 'FILE_READ_ERROR' | 'AI_ERROR' | 'INVALID_FILE' | 'LOW_CONFIDENCE' | 'OCR_ERROR'
    message: string
    details?: string
    // Enhanced error info for debugging
    stack?: string
    type?: string
  }
  fallbackAvailable: boolean
}

export type ExtractionResponse = ExtractionResult | ExtractionError

export interface ExtractionOptions {
  useFallback?: boolean
  useOCR?: boolean
  useConsensus?: boolean
  useCleanRoom?: boolean  // Use deterministic clean-room processing (default: true)
  useOrchestrator?: boolean  // Use OCR orchestrator for multi-engine OCR (default: auto-detect)
  primaryProvider?: AIProvider
  providers?: AIProvider[]
  /** Optional logger for tracking processing stages with actual data */
  logger?: ProcessingLogger
}

/**
 * Safely get lowercase name from coverage, handling undefined/null
 */
function getCoverageName(coverage: { name?: string | null; description?: string | null } | undefined | null): string {
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
    const marketValueCoverage = coverages.find(c => c.isMarketValue)
    if (marketValueCoverage) {
      // Market value - use 0 as placeholder since actual value varies
      // The display should show "Rayiç Değer" instead of a number
      return 0
    }

    // Look for main category coverage
    const mainCoverage = coverages.find(c => c.category === 'main' && c.limit > 0)
    if (mainCoverage) {
      return mainCoverage.limit
    }

    // Look for coverage that looks like vehicle value
    const vehicleValue = coverages.find(c => {
      const nameLower = getCoverageName(c)
      return (
        nameLower.includes('araç bedeli') ||
        nameLower.includes('araç değeri') ||
        nameLower.includes('sigorta bedeli') ||
        nameLower.includes('kasko') && !nameLower.includes('mali')
      ) && c.limit > 0
    })
    if (vehicleValue) {
      return vehicleValue.limit
    }

    // Fallback: find the highest non-liability coverage
    const nonLiabilityCoverages = coverages.filter(c => {
      const nameLower = getCoverageName(c)
      return c.category !== 'liability' &&
        !nameLower.includes('mali sorumluluk') &&
        !nameLower.includes('hukuki') &&
        c.limit > 0
    })
    if (nonLiabilityCoverages.length > 0) {
      return Math.max(...nonLiabilityCoverages.map(c => c.limit))
    }
  }

  // For traffic insurance: use the highest bodily injury limit
  if (policyType === 'traffic') {
    const bodilyInjury = coverages.find(c => {
      const nameLower = getCoverageName(c)
      return nameLower.includes('bedeni') || nameLower.includes('ölüm')
    })
    if (bodilyInjury && bodilyInjury.limit > 0) {
      return bodilyInjury.limit
    }
  }

  // For other policy types: sum only main category coverages, or use highest
  const mainCoverages = coverages.filter(c => c.category === 'main' && c.limit > 0)
  if (mainCoverages.length > 0) {
    return mainCoverages.reduce((sum, c) => sum + c.limit, 0)
  }

  // Fallback: use the highest individual coverage limit
  const validLimits = coverages.filter(c => c.limit > 0).map(c => c.limit)
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
    useOCR = true,
    useConsensus = true,
    useCleanRoom = true,  // Default to clean-room processing
    useOrchestrator = isOrchestratorConfigured(),  // Auto-detect orchestrator
    primaryProvider,
    providers,
    logger,  // Optional processing logger for tracking stages
  } = options

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
    if (useFallback) {
      return createFallbackResult(file)
    }
    logger?.fail('AI not configured')
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIG',
        message: 'AI extraction is not configured',
        details: 'Ensure the backend server is running on port 4001 with OPENAI_API_KEY or ANTHROPIC_API_KEY set in .env (not VITE_ prefixed - API keys must stay server-side)',
      },
      fallbackAvailable: false,
    }
  }

  // ========== PDF EXTRACTION STAGE ==========
  logger?.startStage('pdf_extraction', { filename: file.name, file_size: file.size })

  // Extract text from PDF (with automatic retry for transient errors)
  const parseResult = await extractTextFromPDFWithRetry(file)
  let documentText: string
  let usedOCR = false

  // Document AI enhanced data (form fields and tables)
  let ocrFormFields: FormField[] | undefined
  let ocrTables: Table[] | undefined
  let ocrBackend: 'document-ai' | 'vision-api' | undefined

  if (!parseResult.success) {
    // Map PDF parser error codes to extraction error codes
    const mapPdfErrorCode = (pdfCode: string): ExtractionError['error']['code'] => {
      switch (pdfCode) {
        case 'TIMEOUT_ERROR':
          return 'PDF_TIMEOUT'
        case 'WORKER_ERROR':
          return 'PDF_WORKER_ERROR'
        case 'FILE_READ_ERROR':
          return 'FILE_READ_ERROR'
        default:
          return 'PDF_PARSE_ERROR'
      }
    }

    // PDF extraction failed - log and check for OCR
    logger?.failStage('PDF text extraction failed: ' + parseResult.error.message)

    // ========== OCR CHECK STAGE ==========
    logger?.startStage('ocr_check', { pdf_failed: true, ocr_configured: isOCRConfigured() })

    // Check if we should try OCR
    if (useOCR && isOCRConfigured()) {
      logger?.completeStage({ output: { needs_ocr: true, reason: 'pdf_extraction_failed' } })

      // ========== OCR PROCESSING STAGE ==========
      logger?.startStage('ocr_processing', { method: useOrchestrator ? 'orchestrator' : 'direct' })

      // Use unified OCR (orchestrator if available, otherwise direct)
      const ocrResult = useOrchestrator
        ? await performUnifiedOCR(file, { preferOrchestrator: true })
        : await performOCR(file)

      if (ocrResult.success && ocrResult.data.text.length > 50) {
        documentText = ocrResult.data.text
        usedOCR = true
        // Store Document AI form fields and tables for later use
        ocrFormFields = ocrResult.data.formFields
        ocrTables = ocrResult.data.tables
        ocrBackend = ocrResult.data.backend

        // Log OCR success with details
        logger?.setOCRUsed(ocrBackend || 'unknown')
        logger?.completeStage({
          output: {
            text_length: documentText.length,
            text_preview: documentText.substring(0, 500) + '...',
            form_fields_count: ocrFormFields?.length || 0,
            tables_count: ocrTables?.length || 0,
            backend: ocrBackend,
          },
          metadata: {
            form_fields: ocrFormFields?.slice(0, 10),  // First 10 for preview
            tables_structure: ocrTables?.map(t => ({ rows: t.rows?.length || 0, cols: t.rows?.[0]?.cells?.length || 0 })),
          },
          // Full text for admin debugging
          full_output_text: documentText,
        })

        if (import.meta.env.DEV) {
          const method = 'method' in ocrResult ? ocrResult.method : 'direct'
          console.log(`[OCR] Method: ${method}, ${ocrFormFields?.length || 0} form fields, ${ocrTables?.length || 0} tables`)
        }
      } else {
        logger?.failStage('OCR failed or produced insufficient text')
        if (useFallback) {
          return createFallbackResult(file)
        }
        return {
          success: false,
          error: {
            code: mapPdfErrorCode(parseResult.error.code),
            message: parseResult.error.message,
            details: parseResult.error.code,
          },
          fallbackAvailable: false,
        }
      }
    } else {
      if (useFallback) {
        return createFallbackResult(file)
      }
      return {
        success: false,
        error: {
          code: mapPdfErrorCode(parseResult.error.code),
          message: parseResult.error.message,
          details: parseResult.error.code,
        },
        fallbackAvailable: false,
      }
    }
  } else {
    // PDF extraction succeeded
    logger?.setPageCount(parseResult.data.pageCount)
    logger?.completeStage({
      output: {
        text_length: parseResult.data.text.length,
        text_preview: parseResult.data.text.substring(0, 500) + '...',
        page_count: parseResult.data.pageCount,
        chars_per_page: Math.round(parseResult.data.text.length / parseResult.data.pageCount),
      },
      // Full text for admin debugging
      full_output_text: parseResult.data.text,
    })

    // ========== OCR CHECK STAGE ==========
    const isScanned = isLikelyScannedPDF(parseResult.data.text, parseResult.data.pageCount)
    logger?.startStage('ocr_check', {
      text_length: parseResult.data.text.length,
      page_count: parseResult.data.pageCount,
      chars_per_page: Math.round(parseResult.data.text.length / parseResult.data.pageCount),
      ocr_configured: isOCRConfigured(),
    })

    // Check if PDF appears to be scanned and OCR is available
    if (useOCR && isOCRConfigured() && isScanned) {
      logger?.completeStage({ output: { needs_ocr: true, reason: 'low_text_density' } })

      // ========== OCR PROCESSING STAGE ==========
      logger?.startStage('ocr_processing', { method: useOrchestrator ? 'orchestrator' : 'direct' })

      // Use unified OCR (orchestrator if available, otherwise direct)
      const ocrResult = useOrchestrator
        ? await performUnifiedOCR(file, { preferOrchestrator: true })
        : await performOCR(file)

      if (ocrResult.success && ocrResult.data.text.length > parseResult.data.text.length) {
        documentText = ocrResult.data.text
        usedOCR = true
        // Store Document AI form fields and tables for later use
        ocrFormFields = ocrResult.data.formFields
        ocrTables = ocrResult.data.tables
        ocrBackend = ocrResult.data.backend

        // Log OCR success with details
        logger?.setOCRUsed(ocrBackend || 'unknown')
        logger?.completeStage({
          output: {
            text_length: documentText.length,
            text_preview: documentText.substring(0, 500) + '...',
            form_fields_count: ocrFormFields?.length || 0,
            tables_count: ocrTables?.length || 0,
            backend: ocrBackend,
          },
          metadata: {
            form_fields: ocrFormFields?.slice(0, 10),
            tables_structure: ocrTables?.map(t => ({ rows: t.rows?.length || 0, cols: t.rows?.[0]?.cells?.length || 0 })),
          },
          // Full text for admin debugging
          full_output_text: documentText,
        })

        if (import.meta.env.DEV) {
          const method = 'method' in ocrResult ? ocrResult.method : 'direct'
          console.log(`[OCR] Method: ${method}, ${ocrFormFields?.length || 0} form fields, ${ocrTables?.length || 0} tables`)
        }
      } else {
        documentText = parseResult.data.text
        logger?.completeStage({ output: { ocr_improved: false, using_pdf_text: true } })
      }
    } else {
      documentText = parseResult.data.text
      logger?.skipStage('ocr_processing', isScanned ? 'OCR not configured' : 'Text density sufficient')
      logger?.completeStage({ output: { needs_ocr: false, reason: isScanned ? 'ocr_not_configured' : 'sufficient_text' } })
    }
  }

  // ========== TEXT PREPROCESSING STAGE ==========
  logger?.startStage('text_preprocessing', { text_length: documentText.length, use_clean_room: useCleanRoom })

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

        // Debug info - text processing stats
        if (import.meta.env.DEV) {
          const validation = cleanRoomResult?.validationReport
          console.warn(`[DEBUG] Clean-room processing: ` +
            `${processingResult.cleanupStats.totalCharactersRemoved} chars normalized, ` +
            `${cleanRoomResult?.piiVault?.length || 0} PII items detected, ` +
            `${validation?.issues?.length || 0} validation issues, ` +
            `${Math.round(processingResult.confidence * 100)}% confidence`)
        }
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
        // Debug info - text processing stats
        if (import.meta.env.DEV) {
          const stats = processingResult.cleanupStats
          console.warn(`[DEBUG] Text processing: ${processingResult.corrections.length} corrections, ` +
            `${stats.garbageBlocksRemoved} garbage blocks removed, ` +
            `${stats.spacedCharsFixed} spaced chars fixed, ` +
            `${stats.urlsCleaned} URLs cleaned, ` +
            `${stats.totalCharactersRemoved} chars removed, ` +
            `${Math.round(processingResult.confidence * 100)}% confidence`)
        }
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
  const configuredProviders = getConfiguredProviders()
  // When proxy is configured, bypass consensus - the unified endpoint handles Anthropic→OpenAI fallback
  const useMultiProvider = useConsensus && configuredProviders.length > 1 && !isProxyConfigured()
  const provider = primaryProvider || configuredProviders[0]

  logger?.startStage('ai_extraction', {
    text_length: processedText.length,
    provider: useMultiProvider ? 'consensus' : provider,
    multi_provider: useMultiProvider,
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
        providers: consensusResult.providerResults
          .filter((r) => !r.error)
          .map((r) => r.provider),
        agreement: consensusResult.consensus.agreement,
        score: consensusResult.consensus.score,
      }
    } else {
      // Use single provider (use processed text for better extraction)
      console.log('[PolicyExtractor] Calling extractWithProvider, provider:', provider)
      extractedData = await extractWithProvider(provider, processedText)
      console.log('[PolicyExtractor] extractWithProvider returned:', {
        hasData: !!extractedData,
        policyNumber: extractedData?.policyNumber,
        provider: extractedData?.provider,
        hasConfidence: !!extractedData?.confidence,
        hasCoverages: !!extractedData?.coverages,
      })
    }

    // Log AI extraction success
    const confidenceOverall = extractedData.confidence?.overall ?? 0.7
    console.log('[PolicyExtractor] Confidence overall:', confidenceOverall)
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
        coverages: extractedData.coverages?.slice(0, 5) ?? [],  // First 5 coverages for preview
        exclusions_count: extractedData.exclusions?.length ?? 0,
      },
      // Full content for admin debugging
      full_input_text: processedText,
      full_extracted_json: JSON.stringify(extractedData, null, 2),
    })

    // Check confidence threshold
    if (confidenceOverall < AI_CONFIG.minConfidence) {
      if (useFallback) {
        console.warn(
          `Low confidence extraction (${confidenceOverall}), using fallback`
        )
        return createFallbackResult(file, extractedData)
      }
      return {
        success: false,
        error: {
          code: 'LOW_CONFIDENCE',
          message: `Extraction confidence too low: ${Math.round(confidenceOverall * 100)}%`,
          details: 'The AI could not reliably extract policy information',
        },
        fallbackAvailable: false,
      }
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
        backend: ocrBackend,
      })
      const formFieldMap = extractFormFieldMap(ocrFormFields)

      if (import.meta.env.DEV) {
        console.log('[Document AI] Form field map:', formFieldMap)
      }

      // Helper to find and use high-confidence form field value
      const useFormField = (
        patterns: readonly (string | RegExp)[],
        currentValue: string | number | null | undefined,
        minConfidence = 0.7
      ): string | undefined => {
        const field = findFormField(ocrFormFields!, patterns)
        if (field && field.confidence >= minConfidence && field.value) {
          formFieldsUsed++
          return field.value
        }
        return currentValue?.toString()
      }

      // Use form fields for policy number (high priority - very reliable from Document AI)
      const formPolicyNumber = useFormField(TURKISH_FORM_FIELD_PATTERNS.policyNumber, extractedData.policyNumber, 0.6)
      if (formPolicyNumber && formPolicyNumber !== extractedData.policyNumber) {
        enhancedExtractedData = { ...enhancedExtractedData, policyNumber: formPolicyNumber }
        if (import.meta.env.DEV) {
          console.log(`[Document AI] Policy number enhanced: "${extractedData.policyNumber}" → "${formPolicyNumber}"`)
        }
      }

      // Use form fields for insured name
      const formInsuredName = useFormField(TURKISH_FORM_FIELD_PATTERNS.insuredName, extractedData.insuredName)
      if (formInsuredName && formInsuredName !== extractedData.insuredName) {
        enhancedExtractedData = { ...enhancedExtractedData, insuredName: formInsuredName }
        if (import.meta.env.DEV) {
          console.log(`[Document AI] Insured name enhanced: "${extractedData.insuredName}" → "${formInsuredName}"`)
        }
      }

      // Use form fields for dates
      const formStartDate = useFormField(TURKISH_FORM_FIELD_PATTERNS.startDate, extractedData.startDate)
      if (formStartDate && formStartDate !== extractedData.startDate) {
        // Normalize date format if needed (DD.MM.YYYY → YYYY-MM-DD)
        const normalizedDate = formStartDate.includes('.')
          ? formStartDate.split('.').reverse().join('-')
          : formStartDate
        enhancedExtractedData = { ...enhancedExtractedData, startDate: normalizedDate }
      }

      const formEndDate = useFormField(TURKISH_FORM_FIELD_PATTERNS.endDate, extractedData.endDate)
      if (formEndDate && formEndDate !== extractedData.endDate) {
        const normalizedDate = formEndDate.includes('.')
          ? formEndDate.split('.').reverse().join('-')
          : formEndDate
        enhancedExtractedData = { ...enhancedExtractedData, endDate: normalizedDate }
      }

      // Use form fields for premium (parse Turkish number format)
      const formPremium = useFormField(TURKISH_FORM_FIELD_PATTERNS.premium, extractedData.premium?.toString())
      if (formPremium) {
        // Parse Turkish currency format: "₺5.000,50" or "5.000,50 TL"
        const cleanPremium = formPremium
          .replace(/[₺TL\s]/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
        const parsedPremium = parseFloat(cleanPremium)
        if (!isNaN(parsedPremium) && parsedPremium !== extractedData.premium) {
          enhancedExtractedData = { ...enhancedExtractedData, premium: parsedPremium }
          if (import.meta.env.DEV) {
            console.log(`[Document AI] Premium enhanced: ${extractedData.premium} → ${parsedPremium}`)
          }
        }
      }

      if (import.meta.env.DEV && formFieldsUsed > 0) {
        console.log(`[Document AI] Enhanced extraction with ${formFieldsUsed} form fields`)
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
      logger?.skipStage('form_field_enhancement', 'No form fields available')
    }

    // ========================================================================
    // TURKISH PATTERN VALIDATION & ENHANCEMENT
    // Validate AI extraction using pattern matching and enhance with missing data
    // ========================================================================
    let patternValidation: ValidationResult | undefined

    try {
      // Convert AI extraction to format for validation
      const aiResultForValidation: Record<string, unknown> = {
        policyNumber: enhancedExtractedData.policyNumber,
        tcKimlik: enhancedExtractedData.insuredName, // TC Kimlik might be in raw data
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
          enhancedExtractedData = { ...enhancedExtractedData, policyNumber: merged.policyNumber as string }
        }
        if (merged.startDate && !extractedData.startDate) {
          enhancedExtractedData = { ...enhancedExtractedData, startDate: merged.startDate as string }
        }
        if (merged.endDate && !extractedData.endDate) {
          enhancedExtractedData = { ...enhancedExtractedData, endDate: merged.endDate as string }
        }
        if (merged.premium && !extractedData.premium) {
          enhancedExtractedData = { ...enhancedExtractedData, premium: merged.premium as number }
        }
        if (merged.insuredPerson && !extractedData.insuredName) {
          enhancedExtractedData = { ...enhancedExtractedData, insuredName: merged.insuredPerson as string }
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
        tables_structure: ocrTables.map(t => ({
          rows: t.rows?.length || 0,
          cols: t.rows?.[0]?.cells?.length || 0,
        })),
      })

      try {
        const tableData = parseTablesForCoverages(ocrTables)

        if (tableData.coverages.length > 0) {
          if (import.meta.env.DEV) {
            console.log(`[Table Parser] Extracted ${tableData.coverages.length} coverages from ${ocrTables.length} tables`)
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
              extracted_coverages: tableData.coverages.slice(0, 5),  // First 5 for preview
            },
          })

          if (import.meta.env.DEV && tableCoveragesUsed > 0) {
            console.log(`[Table Parser] Added ${tableCoveragesUsed} new coverages from tables`)
          }
        } else {
          logger?.completeStage({
            output: { coverages_extracted: 0, reason: 'no_coverage_tables_found' },
          })
        }
      } catch (error) {
        // Table parsing is optional, continue without it
        console.warn('Table coverage parsing failed:', error)
        logger?.failStage('Table parsing failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
      }
    } else {
      logger?.skipStage('table_parsing', 'No tables available')
    }

    // ========== VALIDATION STAGE ==========
    logger?.startStage('validation', {
      has_pattern_validation: !!patternValidation,
      coverages_count: enhancedExtractedData.coverages.length,
    })

    // Convert extracted data to AnalyzedPolicy format
    // Store both raw extractedText and processedText for display and analysis
    const policy = convertToAnalyzedPolicy(enhancedExtractedData, file, documentText, processedText)

    // Add validation warnings to AI insights
    if (patternValidation) {
      const validationInsights = [
        ...patternValidation.errors.map(e => `❌ ${e}`),
        ...patternValidation.warnings.map(w => `⚠️ ${w}`),
      ]
      if (validationInsights.length > 0 && policy.aiInsights) {
        policy.aiInsights = [...validationInsights, ...policy.aiInsights]
      }
    }

    // Log validation completion with full policy data for admin debugging
    logger?.completeStage({
      output: {
        validation_errors: patternValidation?.errors?.length || 0,
        validation_warnings: patternValidation?.warnings?.length || 0,
        enhancements_applied: patternValidation ? Object.keys(patternValidation.enhancements).length : 0,
        final_policy_id: policy.id,
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
    logger?.complete()

    return {
      success: true,
      policy,
      extractedData: enhancedExtractedData,
      source: usedOCR ? 'ocr' : 'ai',
      consensus: consensusInfo,
      cleanRoomOutput: cleanRoomResult,
      patternValidation: patternValidation ? {
        errors: patternValidation.errors,
        warnings: patternValidation.warnings,
        enhanced: Object.keys(patternValidation.enhancements),
      } : undefined,
      // Document AI enhanced data (form fields and tables)
      documentAI: (ocrFormFields || ocrTables) ? {
        formFields: ocrFormFields,
        tables: ocrTables,
        backend: ocrBackend || 'vision-api',
        fieldsUsed: formFieldsUsed,
        tableCoveragesUsed,
      } : undefined,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown AI error'
    const errorStack = error instanceof Error ? error.stack : undefined
    const errorType = error instanceof Error ? error.constructor.name : 'Unknown'

    // Log extraction failure with explicit string for production visibility
    console.error('[PolicyExtractor] EXTRACTION FAILED - Message:', errorMessage)
    console.error('[PolicyExtractor] EXTRACTION FAILED - Stack:', errorStack)
    console.error('[PolicyExtractor] EXTRACTION FAILED - Type:', errorType)

    // Log detailed error to ProcessingLogger for admin dashboard visibility
    if (logger) {
      logger.failWithDetails(error instanceof Error ? error : new Error(errorMessage), {
        extraction_provider: primaryProvider || 'unknown',
        document_length: documentText?.length || 0,
        ocr_used: usedOCR,
        data_at_failure: {
          file_name: file.name,
          file_size: file.size,
          had_extracted_data: extractedData !== undefined,
          extracted_policy_number: extractedData?.policyNumber,
          extracted_provider: extractedData?.provider,
        },
      })
    }

    if (useFallback) {
      console.warn(`AI extraction failed: ${errorMessage}, using fallback`)
      return createFallbackResult(file)
    }

    return {
      success: false,
      error: {
        code: 'AI_ERROR',
        message: 'Failed to extract policy data',
        details: errorMessage,
        stack: errorStack,
        type: errorType,
      },
      fallbackAvailable: false,
    }
  }
}

/**
 * Extract using a specific provider
 */
async function extractWithProvider(provider: AIProvider, documentText: string): Promise<ExtractedPolicyData> {
  switch (provider) {
    case 'openai':
      return extractWithOpenAI(documentText)
    case 'anthropic':
      return extractWithClaude(documentText)
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
function convertToAnalyzedPolicy(data: ExtractedPolicyData, file: File, rawText?: string, processedText?: string): AnalyzedPolicy {
  const now = new Date()

  // Debug logging for production troubleshooting
  console.log('[convertToAnalyzedPolicy] Input data:', {
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
  const rawEndDate = data.endDate ?? rawData.end_date as string | undefined
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  const expiryDateStr = rawEndDate ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  if (rawEndDate) {
    const endDate = new Date(rawEndDate)
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      status = 'expired'
    } else if (daysUntilExpiry <= 30) {
      status = 'expiring'
    }
  }

  // Convert coverages with Turkish names and enhanced metadata
  // Handle cases where AI returns description instead of name, or both are missing
  const coverages: Coverage[] = data.coverages.map((c) => {
    const coverageName = c.name || c.description || 'Unnamed Coverage'
    return {
      name: coverageName,
      nameTr: coverageName, // AI extracts in original language
      limit: c.limit ?? 0,
      deductible: c.deductible ?? 0,
      included: true,
      description: c.description ?? undefined,
      isUnlimited: c.isUnlimited ?? false,
      isMarketValue: c.isMarketValue ?? false,
      category: c.category ?? 'other',
      importance: determineCoverageImportance(c),
    }
  })

  // Get policy type - handle both camelCase and snake_case
  const rawPolicyType = data.policyType ?? rawData.policy_type as string | undefined
  const policyType = (rawPolicyType && rawPolicyType in POLICY_TYPES ? rawPolicyType : 'home') as PolicyType
  const typeInfo = POLICY_TYPES[policyType]

  if (rawPolicyType && !(rawPolicyType in POLICY_TYPES)) {
    console.warn(`[convertToAnalyzedPolicy] Unknown policy type: ${rawPolicyType}, falling back to 'home'`)
  }

  // Calculate total coverage based on policy type
  // For kasko: use vehicle value (main coverage or market value), NOT sum of all limits
  // For other types: use the main coverage or sum of main coverages
  const totalCoverage = calculateMainCoverage(policyType, coverages)

  // Handle premium - AI might return a number or an object with 'amount' field
  let premiumValue = 0
  if (typeof data.premium === 'number') {
    premiumValue = data.premium
  } else if (data.premium && typeof data.premium === 'object' && 'amount' in data.premium) {
    premiumValue = (data.premium as { amount: number }).amount
    console.log('[convertToAnalyzedPolicy] Extracted premium from object:', premiumValue)
  }

  // Handle policyNumber - AI might return camelCase or snake_case
  const policyNumber = data.policyNumber ?? rawData.policy_number as string ?? `POL-${Date.now()}`

  // Handle provider - AI might return camelCase or snake_case
  const provider = data.provider ?? rawData.provider as string ?? 'Unknown Provider'

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
    deductible: coverages[0]?.deductible ?? 0,
    startDate: data.startDate ?? rawData.start_date as string ?? now.toISOString().split('T')[0],
    expiryDate: expiryDateStr,
    status,
    uploadDate: now.toISOString().split('T')[0],
    fileName: file.name,
    documentType: 'PDF',
    documentUrl: URL.createObjectURL(file),
    insuredPerson: data.insuredName ?? rawData.insured_name as string ?? undefined,
    location: data.insuredAddress ?? rawData.insured_address as string ?? undefined,
    insuredAddress: data.insuredAddress ?? rawData.insured_address as string ?? undefined,
    coverages,
    exclusions: data.exclusions,
    specialConditions: data.specialConditions,
    insuranceLine: typeInfo.label,
    // Currency might be in data.currency, data.premium.currency, or snake_case
    currency: data.currency ?? (data.premium && typeof data.premium === 'object' ? (data.premium as { currency?: string }).currency : undefined) ?? 'TRY',
    // Confidence might be a number (0.95) or an object ({ overall: 0.95, ... })
    aiConfidence: typeof data.confidence === 'number' ? data.confidence : (data.confidence?.overall ?? 0.7),
    aiInsights: generateAIInsights(data),
    marketComparison: generateMarketComparison(data),
    extractedText: rawText,
    processedText: processedText || rawText, // Use processed text if available, otherwise raw
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
    const gapAnalysis = GapDetectionService.analyzePolicy(basePolicy)
    const actionItems = GapDetectionService.getActionItems(basePolicy)

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

  return basePolicy
}

/**
 * Create fallback result using sample data
 */
function createFallbackResult(
  file: File,
  partialData?: ExtractedPolicyData
): ExtractionResult {
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
 * Generate all AI insights including currency validation warnings
 */
function generateAIInsights(data: ExtractedPolicyData): string[] {
  const insights: string[] = []

  // Add strengths
  insights.push(...generateStrengths(data).map(s => `✓ ${s}`))

  // Add gaps
  insights.push(...generateGaps(data).map(g => `⚠ ${g}`))

  // Add recommendations
  insights.push(...generateRecommendations(data).map(r => `💡 ${r}`))

  // Validate currency against address
  const currency = data.currency ?? 'TRY'
  const address = data.insuredAddress
  const currencyValidation = validateCurrencyRegion(currency, address)

  if (currencyValidation.warning) {
    insights.push(`🔍 ${currencyValidation.warning}`)
  }

  return insights
}

/**
 * Generate policy strengths based on extracted data
 */
function generateStrengths(data: ExtractedPolicyData): string[] {
  const strengths: string[] = []

  if (data.coverages.length > 3) {
    strengths.push('Comprehensive coverage with multiple protection areas')
  }

  if (data.coverages.some((c) => c.limit && c.limit > 500000)) {
    strengths.push('High coverage limits for major risks')
  }

  if (data.coverages.some((c) => c.deductible === 0)) {
    strengths.push('Zero deductible on some coverages')
  }

  if (data.specialConditions.length > 0) {
    strengths.push('Includes special endorsements for enhanced protection')
  }

  if (strengths.length === 0) {
    strengths.push('Standard coverage for policy type')
  }

  return strengths
}

/**
 * Check if policy has kasko base coverage that includes fundamental protections
 */
function hasKaskoBaseCoverage(coverages: ExtractedCoverage[]): boolean {
  return coverages.some(c => {
    const nameLower = getCoverageName(c)
    return (
      nameLower === 'kasko' ||
      nameLower.includes('tam kasko') ||
      nameLower.includes('full kasko') ||
      nameLower.includes('mini kasko') ||
      nameLower.includes('kasko sigortası') ||
      (nameLower.includes('kasko') && c.category === 'main')
    )
  })
}

/**
 * Coverages that are inherently included in base kasko coverage
 * These should NOT be flagged as missing if kasko coverage exists
 */
const KASKO_IMPLICIT_COVERAGES = [
  'çarpma', 'çarpışma', 'collision',
  'hırsızlık', 'theft',
  'yangın', 'fire',
  'doğal afet', 'natural disaster',
  'sel', 'flood',
  'deprem', 'earthquake',
  'ani hareket', 'sudden movement',
  'fırtına', 'storm',
  'dolu', 'hail',
]

/**
 * Generate policy gaps based on extracted data and market benchmarks
 */
function generateGaps(data: ExtractedPolicyData): string[] {
  const gaps: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = MARKET_BENCHMARKS[policyType]

  // Check for high exclusion count
  if (data.exclusions.length > 5) {
    gaps.push('Multiple exclusions may limit coverage in certain scenarios')
  }

  // Check for high deductibles compared to market
  const avgDeductible = benchmark.commonCoverages.reduce(
    (sum, c) => sum + c.typicalDeductible,
    0
  ) / benchmark.commonCoverages.length

  if (data.coverages.some((c) => c.deductible && c.deductible > avgDeductible * 2)) {
    gaps.push('High deductibles may result in significant out-of-pocket costs')
  }

  // Check for limited coverage areas
  const criticalCoverages = benchmark.commonCoverages.filter(c => c.inclusionRate >= 90)

  // For kasko policies, check if base kasko coverage exists
  // If so, fundamental coverages (collision, theft, fire, etc.) are implicitly included
  const isKaskoPolicy = policyType === 'kasko'
  const hasBaseKasko = isKaskoPolicy && hasKaskoBaseCoverage(data.coverages)

  // Check for missing critical coverages with smart matching
  // For traffic insurance, match based on coverage name AND limit to handle per-person/per-accident variants
  const isTrafficPolicy = policyType === 'traffic'

  for (const critical of criticalCoverages) {
    const criticalNameLower = critical.nameTr.toLowerCase()

    // For kasko: skip implicit coverages if base kasko exists
    if (hasBaseKasko) {
      const isImplicitCoverage = KASKO_IMPLICIT_COVERAGES.some(implicit =>
        criticalNameLower.includes(implicit) || getCoverageName(critical).includes(implicit)
      )
      if (isImplicitCoverage) {
        continue // Skip - this is included in base kasko coverage
      }
    }

    // Extract base name without qualifier (e.g., "Maddi Hasar" from "Maddi Hasar (kaza başı)")
    const baseNameMatch = criticalNameLower.match(/^([^(]+)/)
    const criticalBaseName = baseNameMatch ? baseNameMatch[1].trim() : criticalNameLower

    const hasCoverage = data.coverages.some(c => {
      const coverageNameLower = getCoverageName(c)
      const coverageLimit = c.limit ?? 0

      // Direct match
      if (coverageNameLower.includes(getCoverageName(critical)) ||
          coverageNameLower.includes(criticalNameLower)) {
        return true
      }

      // For traffic insurance, match base name + limit tolerance
      if (isTrafficPolicy) {
        // Check if the coverage matches the base name
        const matchesBaseName = coverageNameLower.includes(criticalBaseName) ||
          criticalBaseName.includes(coverageNameLower.replace(/\([^)]*\)/g, '').trim())

        if (matchesBaseName) {
          // If limits match within 10% tolerance, consider it a match
          const limitTolerance = critical.typicalLimit * 0.1
          if (Math.abs(coverageLimit - critical.typicalLimit) <= limitTolerance) {
            return true
          }
          // Per-accident limits are always higher, so also match if coverage >= expected
          if (criticalNameLower.includes('kaza başı') && coverageLimit >= critical.typicalLimit * 0.9) {
            return true
          }
        }
      }

      return false
    })

    if (!hasCoverage) {
      // For traffic insurance, don't report per-person variants as missing if per-accident variant exists
      // since policies often only show the per-accident (higher) limit
      if (isTrafficPolicy && criticalNameLower.includes('kişi başı')) {
        const hasPerAccident = data.coverages.some(c =>
          getCoverageName(c).includes(criticalBaseName) &&
          (c.limit ?? 0) >= critical.typicalLimit
        )
        if (hasPerAccident) continue // Skip this gap, per-accident coverage exists
      }

      gaps.push(`Missing common coverage: ${critical.nameTr}`)
    }
  }

  // Check for underinsured coverages
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
  if (totalCoverage < benchmark.coverageRange.average * 0.5) {
    gaps.push('Total coverage significantly below market average')
  }

  // DASK check for home policies
  if (policyType === 'home') {
    const hasDaskMention = data.coverages.some(c => {
      const nameLower = getCoverageName(c)
      return nameLower.includes('deprem') ||
        nameLower.includes('dask') ||
        nameLower.includes('earthquake')
    })
    if (!hasDaskMention) {
      gaps.push('Consider adding DASK earthquake insurance if not included')
    }
  }

  return gaps.slice(0, 5) // Limit to top 5 gaps
}

/**
 * Generate recommendations based on extracted data and market benchmarks
 */
function generateRecommendations(data: ExtractedPolicyData): string[] {
  const recommendations: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = MARKET_BENCHMARKS[policyType]

  // Premium comparison recommendation
  if (data.premium && data.premium > benchmark.premiumRange.percentile75) {
    recommendations.push('Premium is above 75th percentile - compare with other providers')
  }

  // Coverage limit recommendation
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
  if (totalCoverage < benchmark.coverageRange.median) {
    recommendations.push('Coverage below market median - consider increasing limits')
  }

  // Market trend awareness
  if (benchmark.trends.premiumChangeYoY > 30) {
    recommendations.push(`Market premiums increased ${Math.round(benchmark.trends.premiumChangeYoY)}% YoY - lock in rates early`)
  }

  // Annual review recommendation
  recommendations.push('Review coverage limits annually to ensure adequate protection')

  // Specific policy type recommendations
  if (policyType === 'kasko') {
    recommendations.push('Consider bundling with traffic insurance for discounts')
  } else if (policyType === 'health') {
    recommendations.push('Review network hospitals and coverage scope before renewal')
  } else if (policyType === 'business') {
    if (!data.coverages.some(c => {
      const nameLower = getCoverageName(c)
      return nameLower.includes('siber') || nameLower.includes('cyber')
    })) {
      recommendations.push('Consider cyber insurance for digital business risks')
    }
  }

  return recommendations.slice(0, 4) // Limit to top 4 recommendations
}

/**
 * Generate market comparison data using real market benchmarks
 */
function generateMarketComparison(data: ExtractedPolicyData): AnalyzedPolicy['marketComparison'] {
  const premium = data.premium ?? 0
  const policyType = (data.policyType ?? 'home') as PolicyType
  const location = data.insuredAddress ?? undefined

  // Calculate total coverage from coverages
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)

  // Use the new market data service for accurate benchmarking
  return generateMarketComparisonData(premium, totalCoverage, policyType, location)
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
  policyBrief: string | null           // Markdown formatted Policy Brief
  structuredData: StructuredPolicyData | null  // Machine-readable JSON
  watchOuts: string[]                   // Top 15 watch-outs
  qualityScore: number                  // 0-100 quality score
  sectionsFound: string[]               // Document sections identified
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
    requireQualityScore?: number  // Minimum quality score (default: 90)
    maxRetries?: number           // Max retries for quality improvement
  } = {}
): Promise<ComprehensiveExtractionResult> {
  const {
    provider = 'openai',
    requireQualityScore = 90,
    maxRetries = 2,
  } = options

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
      const userPrompt = EXTRACTION_USER_PROMPT_TEMPLATE.replace('{PROCESSED_TEXT}', preprocessed.slice(0, 25000))

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
        console.warn(`[Extraction] Quality score ${qualityScore} < ${requireQualityScore}, retry ${attempts}/${maxRetries + 1}`)
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
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  if (data.policy.endDate) {
    const endDate = new Date(data.policy.endDate)
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilExpiry < 0) {
      status = 'expired'
    } else if (daysUntilExpiry <= 30) {
      status = 'expiring'
    }
  }

  // Convert coverages
  const coverages: Coverage[] = data.coverages.map(c => ({
    name: c.name,
    nameTr: c.nameTr,
    limit: c.limit ?? 0,
    deductible: c.deductible ?? 0,
    included: true,
    isUnlimited: c.isUnlimited,
    isMarketValue: c.isMarketValue,
    category: c.category,
    importance: c.category === 'main' ? 'critical' : c.category === 'liability' ? 'standard' : 'minor',
  }))

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
    deductible: coverages[0]?.deductible ?? 0,
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
    exclusions: data.exclusions.map(e => e.trigger),
    specialConditions: [],
    insuranceLine: 'Kasko',
    currency: data.premium.currency,
    aiConfidence: result.qualityScore / 100,
    aiInsights: [
      ...result.watchOuts.slice(0, 5).map(w => `⚠ ${w}`),
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
    vehicleInfo: data.vehicle ? {
      make: data.vehicle.make,
      model: data.vehicle.model,
      year: data.vehicle.year,
      plate: data.vehicle.plate,
      chassisNo: data.vehicle.chassisNumber ?? undefined,
      engineNo: data.vehicle.engineNumber ?? undefined,
      usage: data.vehicle.usageType,
    } : undefined,
  }

  return policy
}
