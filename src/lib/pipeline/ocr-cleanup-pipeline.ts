/**
 * OCR Cleanup Pipeline - Complete Orchestrator
 *
 * Orchestrates the full OCR cleanup process:
 * 1. Chunk document (by pages or size)
 * 2. Pre-sanitize each chunk (deterministic rules)
 * 3. Run QA gates on each chunk
 * 4. Re-run LLM cleanup on failing chunks (up to N retries)
 * 5. Merge chunks back together
 * 6. Return final text with full audit trail
 *
 * NON-NEGOTIABLE: Policy numbers, dates, amounts, VIN/plates must be EXACT.
 */

import {
  chunkDocument,
  sanitizeChunk,
  mergeChunks,
  validateChunkCoverage,
  type DocumentChunk,
  type ChunkingResult,
  type ChunkingOptions,
  type SanitizedChunk,
} from './document-chunker'

import {
  runQAGates,
  processChunkWithRetry,
  processAllChunksWithQA,
  getQASummary,
  hasQAFailures,
  getFailedChunks,
  type QAGateOptions,
  type QAResult,
  type DocumentQAReport,
  type LLMCleanupFunction,
} from './qa-gates'

import {
  sanitizeOCRText,
  sanitizeOCRTextFull,
  hasRemainingArtifacts,
  validatePreservation,
  type SanitizerResult,
  type SanitizerStats,
} from './ocr-sanitizer'

import { createLogger, type LogCollector, type PipelineLog } from './pipeline-logger'

import {
  preCleanOcrText,
  checkPreCleanQuality,
  type PreCleanResult,
  type PreCleanStats,
} from './deterministic-preclean'

// ============================================================================
// TYPES
// ============================================================================

export interface PipelineOptions {
  // Chunking options
  chunking?: ChunkingOptions

  // QA options
  qa?: QAGateOptions

  // Processing options
  documentId?: string
  skipPreClean?: boolean // Skip deterministic pre-clean (not recommended)
  skipChunking?: boolean // Process as single chunk
  skipQA?: boolean // Skip QA gates (not recommended)
  skipLLMRetry?: boolean // Skip LLM-based retries

  // LLM cleanup function (injected)
  llmCleanup?: LLMCleanupFunction

  // Logging
  debug?: boolean
  logger?: LogCollector
}

export interface PipelineResult {
  // Output
  text: string // Final cleaned text
  success: boolean // Overall success

  // Pre-clean info
  preCleanResult: PreCleanResult | null
  preCleanQuality: { passed: boolean; issues: string[]; warnings: string[] } | null

  // Chunking info
  chunking: ChunkingResult | null
  chunks: SanitizedChunk[]

  // QA info
  qaReport: DocumentQAReport | null
  hasQAFailures: boolean
  failedChunkIndices: number[]

  // Validation
  preservationValid: boolean
  preservationIssues: string[]
  artifactsRemaining: boolean
  remainingArtifacts: string[]

  // Stats
  stats: PipelineStats

  // Logs
  logs: PipelineLog[]
}

export interface PipelineStats {
  originalLength: number
  finalLength: number
  reductionPercent: number
  totalChunks: number
  chunksRetried: number
  chunksFailed: number
  totalProcessingTimeMs: number
  preCleanStats: PreCleanStats | null
  sanitizerStats: SanitizerStats
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<PipelineOptions, 'llmCleanup' | 'logger'>> = {
  chunking: {},
  qa: { maxRetries: 2 },
  documentId: 'doc',
  skipPreClean: false,
  skipChunking: false,
  skipQA: false,
  skipLLMRetry: false,
  debug: false,
}

// ============================================================================
// MAIN PIPELINE FUNCTION
// ============================================================================

/**
 * Run the complete OCR cleanup pipeline
 *
 * @param text - Raw OCR text to clean
 * @param options - Pipeline configuration options
 * @returns Complete pipeline result with cleaned text and audit trail
 */
export async function runOCRCleanupPipeline(
  text: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const logger = opts.logger || createLogger(opts.documentId)
  const startTime = Date.now()

  // Initialize result
  const result: PipelineResult = {
    text: '',
    success: false,
    preCleanResult: null,
    preCleanQuality: null,
    chunking: null,
    chunks: [],
    qaReport: null,
    hasQAFailures: false,
    failedChunkIndices: [],
    preservationValid: true,
    preservationIssues: [],
    artifactsRemaining: false,
    remainingArtifacts: [],
    stats: {
      originalLength: text.length,
      finalLength: 0,
      reductionPercent: 0,
      totalChunks: 0,
      chunksRetried: 0,
      chunksFailed: 0,
      totalProcessingTimeMs: 0,
      preCleanStats: null,
      sanitizerStats: {
        linesRemoved: 0,
        garbageLinesRemoved: 0,
        lowLetterRatioLinesRemoved: 0,
        spacedFragmentsMerged: 0,
        controlCharsRemoved: 0,
        spacesNormalized: 0,
        newlinesNormalized: 0,
        barcodeTokensIsolated: 0,
      },
    },
    logs: [],
  }

  // Handle empty input
  if (!text || text.trim().length === 0) {
    logger.logStageComplete('pipeline', 0, { skipped: true, reason: 'empty_input' })
    result.text = ''
    result.success = true
    result.logs = logger.getLogs()
    return result
  }

  logger.logStageStart('pipeline', { documentId: opts.documentId, textLength: text.length })

  try {
    // =========================================================================
    // STEP 0: DETERMINISTIC PRE-CLEAN (NEW)
    // =========================================================================
    let processedText = text

    if (!opts.skipPreClean) {
      logger.logStageStart('preclean', { textLength: text.length })
      const preCleanStartTime = Date.now()

      // Run deterministic pre-clean
      const preCleanResult = preCleanOcrText(text, { debug: opts.debug })
      result.preCleanResult = preCleanResult
      result.stats.preCleanStats = preCleanResult.stats

      // Check quality of pre-cleaned text
      const qualityCheck = checkPreCleanQuality(preCleanResult.text)
      result.preCleanQuality = qualityCheck

      // Use pre-cleaned text for rest of pipeline
      processedText = preCleanResult.text

      // Log warnings
      for (const issue of qualityCheck.issues) {
        logger.logWarning('preclean', `Quality issue: ${issue}`)
      }
      for (const warning of qualityCheck.warnings) {
        logger.logWarning('preclean', warning)
      }

      logger.logStageComplete('preclean', Date.now() - preCleanStartTime, {
        originalLength: preCleanResult.stats.originalLength,
        finalLength: preCleanResult.stats.finalLength,
        noiseLinesRemoved: preCleanResult.stats.noiseLinesRemoved,
        turkishWordsDespaced: preCleanResult.stats.turkishWordsDespaced,
        barcodeArtifactsRemoved: preCleanResult.stats.barcodeArtifactsRemoved,
        qualityPassed: qualityCheck.passed,
      })

      if (opts.debug && preCleanResult.stats.turkishWordsDespaced > 0) {
        console.log(`[PreClean] Fixed ${preCleanResult.stats.turkishWordsDespaced} Turkish word spacing issues`)
      }
    } else {
      logger.logStageComplete('preclean', 0, { skipped: true })
    }

    // =========================================================================
    // STEP 1: CHUNKING
    // =========================================================================
    logger.logStageStart('chunking', { skipChunking: opts.skipChunking })

    let chunks: DocumentChunk[]
    let chunkingResult: ChunkingResult | null = null

    if (opts.skipChunking || processedText.length <= 12000) {
      // Single chunk mode
      chunks = [
        {
          id: `${opts.documentId}_chunk_000`,
          index: 0,
          text: processedText,
          pageNumbers: [],
          startOffset: 0,
          endOffset: processedText.length,
          hasOverlap: false,
          overlapChars: 0,
        },
      ]
      logger.logStageComplete('chunking', Date.now() - startTime, {
        method: 'single_chunk',
        chunks: 1,
      })
    } else {
      // Multi-chunk mode
      chunkingResult = chunkDocument(processedText, opts.documentId, opts.chunking)
      chunks = chunkingResult.chunks
      result.chunking = chunkingResult

      // Validate chunk coverage
      const coverage = validateChunkCoverage(processedText, chunks)
      if (!coverage.valid) {
        logger.logWarning('chunking', `Coverage issues: ${coverage.issues.join('; ')}`)
      }

      logger.logStageComplete('chunking', Date.now() - startTime, {
        method: chunkingResult.method,
        chunks: chunks.length,
        pageMarkersFound: chunkingResult.pageMarkersFound,
      })
    }

    result.stats.totalChunks = chunks.length

    // =========================================================================
    // STEP 2: PRE-SANITIZE EACH CHUNK
    // =========================================================================
    logger.logStageStart('sanitization', { chunks: chunks.length })
    const sanitizeStartTime = Date.now()

    const sanitizedChunks: SanitizedChunk[] = []
    const aggregatedStats: SanitizerStats = { ...result.stats.sanitizerStats }

    for (const chunk of chunks) {
      const sanitized = sanitizeChunk(chunk)
      sanitizedChunks.push(sanitized)

      // Aggregate stats
      const stats = sanitized.sanitizerResult.stats
      aggregatedStats.linesRemoved += stats.linesRemoved
      aggregatedStats.garbageLinesRemoved += stats.garbageLinesRemoved
      aggregatedStats.lowLetterRatioLinesRemoved += stats.lowLetterRatioLinesRemoved
      aggregatedStats.spacedFragmentsMerged += stats.spacedFragmentsMerged
      aggregatedStats.controlCharsRemoved += stats.controlCharsRemoved
      aggregatedStats.spacesNormalized += stats.spacesNormalized
      aggregatedStats.newlinesNormalized += stats.newlinesNormalized
      aggregatedStats.barcodeTokensIsolated += stats.barcodeTokensIsolated

      // Log warnings
      for (const warning of sanitized.sanitizerResult.warnings) {
        logger.logWarning('sanitization', `Chunk ${chunk.index}: ${warning}`)
      }
    }

    result.stats.sanitizerStats = aggregatedStats
    logger.logStageComplete('sanitization', Date.now() - sanitizeStartTime, {
      linesRemoved: aggregatedStats.linesRemoved,
      fragmentsMerged: aggregatedStats.spacedFragmentsMerged,
    })

    // =========================================================================
    // STEP 3: QA GATES (with optional retries)
    // =========================================================================
    let processedChunks: SanitizedChunk[]

    if (opts.skipQA) {
      processedChunks = sanitizedChunks
      logger.logStageComplete('qa', 0, { skipped: true })
    } else {
      logger.logStageStart('qa', { maxRetries: opts.qa?.maxRetries || 2 })
      const qaStartTime = Date.now()

      // Determine LLM cleanup function
      const llmCleanup = opts.skipLLMRetry ? undefined : opts.llmCleanup

      // Process all chunks with QA
      const qaResult = await processAllChunksWithQA(sanitizedChunks, llmCleanup, opts.qa)

      result.qaReport = qaResult.documentReport
      processedChunks = qaResult.processedChunks

      // Calculate retry stats
      result.stats.chunksRetried = qaResult.documentReport.retriedChunks
      result.stats.chunksFailed =
        qaResult.documentReport.failedChunks + qaResult.documentReport.manualReviewChunks

      // Get failed chunk indices
      result.failedChunkIndices = getFailedChunks(qaResult.documentReport).map(r => r.chunkIndex)
      result.hasQAFailures = hasQAFailures(qaResult.documentReport)

      logger.logStageComplete('qa', Date.now() - qaStartTime, {
        passed: qaResult.documentReport.passedChunks,
        retried: qaResult.documentReport.retriedChunks,
        failed: result.stats.chunksFailed,
        overallStatus: qaResult.documentReport.overallStatus,
      })

      if (opts.debug && result.hasQAFailures) {
        console.log('\n' + getQASummary(qaResult.documentReport))
      }
    }

    result.chunks = processedChunks

    // =========================================================================
    // STEP 4: MERGE CHUNKS
    // =========================================================================
    logger.logStageStart('merge', { chunks: processedChunks.length })
    const mergeStartTime = Date.now()

    const mergedText = mergeChunks(processedChunks)

    logger.logStageComplete('merge', Date.now() - mergeStartTime, {
      mergedLength: mergedText.length,
    })

    // =========================================================================
    // STEP 5: FINAL VALIDATION
    // =========================================================================
    logger.logStageStart('validation', {})
    const validationStartTime = Date.now()

    // Check preservation
    const preservation = validatePreservation(text, mergedText)
    result.preservationValid = preservation.valid
    result.preservationIssues = preservation.issues

    if (!preservation.valid) {
      for (const issue of preservation.issues) {
        logger.logError('validation', issue)
      }
    }

    // Check remaining artifacts
    const artifacts = hasRemainingArtifacts(mergedText)
    result.artifactsRemaining = artifacts.hasArtifacts
    result.remainingArtifacts = artifacts.artifacts

    if (artifacts.hasArtifacts) {
      logger.logWarning('validation', `Remaining artifacts: ${artifacts.artifacts.join(', ')}`)
    }

    logger.logStageComplete('validation', Date.now() - validationStartTime, {
      preservationValid: preservation.valid,
      artifactsRemaining: artifacts.hasArtifacts,
    })

    // =========================================================================
    // FINALIZE RESULT
    // =========================================================================
    result.text = mergedText
    result.stats.finalLength = mergedText.length
    result.stats.reductionPercent =
      text.length > 0 ? Math.round((1 - mergedText.length / text.length) * 100) : 0
    result.stats.totalProcessingTimeMs = Date.now() - startTime

    // Determine success
    result.success =
      result.preservationValid &&
      !result.hasQAFailures &&
      (result.qaReport?.overallStatus === 'passed' || opts.skipQA)

    logger.logStageComplete('pipeline', Date.now() - startTime, {
      success: result.success,
      finalLength: result.stats.finalLength,
      reductionPercent: result.stats.reductionPercent,
    })
  } catch (error) {
    logger.logError('pipeline', error instanceof Error ? error.message : String(error))
    result.success = false
  }

  result.logs = logger.getLogs()
  return result
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick cleanup without chunking or QA (fastest, least thorough)
 */
export function quickCleanup(text: string): SanitizerResult {
  return sanitizeOCRTextFull(text)
}

/**
 * Standard cleanup with chunking but no LLM retries
 */
export async function standardCleanup(
  text: string,
  documentId?: string
): Promise<PipelineResult> {
  return runOCRCleanupPipeline(text, {
    documentId,
    skipLLMRetry: true,
  })
}

/**
 * Full cleanup with LLM retries for failing chunks
 */
export async function fullCleanup(
  text: string,
  llmCleanup: LLMCleanupFunction,
  documentId?: string
): Promise<PipelineResult> {
  return runOCRCleanupPipeline(text, {
    documentId,
    llmCleanup,
    qa: { maxRetries: 2 },
  })
}

// ============================================================================
// EXPORTS
// ============================================================================

// Re-export types and functions from sub-modules for convenience
export {
  // From deterministic-preclean
  preCleanOcrText,
  checkPreCleanQuality,
  type PreCleanResult,
  type PreCleanStats,

  // From ocr-sanitizer
  sanitizeOCRText,
  sanitizeOCRTextFull,
  hasRemainingArtifacts,
  validatePreservation,
  type SanitizerResult,
  type SanitizerStats,

  // From document-chunker
  chunkDocument,
  sanitizeChunk,
  mergeChunks,
  validateChunkCoverage,
  type DocumentChunk,
  type ChunkingResult,
  type SanitizedChunk,

  // From qa-gates
  runQAGates,
  processChunkWithRetry,
  getQASummary,
  hasQAFailures,
  type QAResult,
  type DocumentQAReport,
  type LLMCleanupFunction,

  // From pipeline-logger
  createLogger,
  type LogCollector,
  type PipelineLog,
}
