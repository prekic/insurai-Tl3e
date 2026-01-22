/**
 * QA Gates - Quality Assurance with Re-run Logic
 *
 * Validates processed chunks and manages retry logic:
 * 1. Check for remaining artifacts after processing
 * 2. Validate critical data preservation
 * 3. Re-run LLM cleanup on failing chunks (with retry limits)
 * 4. Track all attempts in structured logs
 */

import { hasRemainingArtifacts, validatePreservation } from './ocr-sanitizer'
import type { SanitizedChunk } from './document-chunker'

// ============================================================================
// TYPES
// ============================================================================

export type QAGateId =
  | 'no_artifacts'
  | 'data_preserved'
  | 'no_barcode_patterns'
  | 'no_spaced_fragments'
  | 'min_content_ratio'
  | 'reasonable_length'

export interface QAGateDefinition {
  id: QAGateId
  name: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  check: (chunk: SanitizedChunk, originalText?: string) => QAGateCheckResult
}

export interface QAGateCheckResult {
  passed: boolean
  gateId: QAGateId
  message: string
  details?: Record<string, unknown>
}

export interface QAResult {
  chunkId: string
  chunkIndex: number
  passed: boolean
  gateResults: QAGateCheckResult[]
  failedGates: QAGateId[]
  passedGates: QAGateId[]
  criticalFailures: number
  highFailures: number
  mediumFailures: number
  lowFailures: number
  requiresRetry: boolean
  timestamp: string
}

export interface RetryAttempt {
  attemptNumber: number
  timestamp: string
  chunkId: string
  failedGates: QAGateId[]
  action: 'llm_cleanup' | 'sanitizer_retry' | 'manual_review_needed'
  success: boolean
  resultingGates: QAGateCheckResult[]
  processingTimeMs: number
}

export interface ChunkQAReport {
  chunkId: string
  chunkIndex: number
  originalLength: number
  sanitizedLength: number
  qaResults: QAResult[]
  retryAttempts: RetryAttempt[]
  finalStatus: 'passed' | 'passed_after_retry' | 'failed' | 'manual_review'
  totalAttempts: number
  totalProcessingTimeMs: number
}

export interface DocumentQAReport {
  documentId: string
  totalChunks: number
  passedChunks: number
  failedChunks: number
  retriedChunks: number
  manualReviewChunks: number
  chunkReports: ChunkQAReport[]
  overallStatus: 'passed' | 'partial' | 'failed'
  timestamp: string
}

export interface QAGateOptions {
  maxRetries?: number // Maximum retries per chunk (default: 2)
  retryDelay?: number // Delay between retries in ms (default: 0)
  gates?: QAGateId[] // Which gates to run (default: all)
  failOnCritical?: boolean // Fail immediately on critical gate failure (default: true)
  minContentRatio?: number // Minimum sanitized/original ratio (default: 0.5)
}

// ============================================================================
// QA GATE DEFINITIONS
// ============================================================================

const QA_GATES: QAGateDefinition[] = [
  {
    id: 'no_artifacts',
    name: 'No Remaining Artifacts',
    description: 'Check that no OCR artifacts (B^^^B, a!!!a, etc.) remain in the text',
    severity: 'high',
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const result = hasRemainingArtifacts(chunk.sanitizedText)
      return {
        passed: !result.hasArtifacts,
        gateId: 'no_artifacts',
        message: result.hasArtifacts
          ? `Found ${result.artifacts.length} artifact(s): ${result.artifacts.join(', ')}`
          : 'No artifacts found',
        details: { artifacts: result.artifacts },
      }
    },
  },
  {
    id: 'data_preserved',
    name: 'Critical Data Preserved',
    description: 'Verify that policy numbers, dates, amounts, and IDs are preserved exactly',
    severity: 'critical',
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const result = validatePreservation(chunk.text, chunk.sanitizedText)
      return {
        passed: result.valid,
        gateId: 'data_preserved',
        message: result.valid
          ? 'All critical data preserved'
          : `Data preservation issues: ${result.issues.join('; ')}`,
        details: { issues: result.issues },
      }
    },
  },
  {
    id: 'no_barcode_patterns',
    name: 'No Barcode Patterns',
    description: 'Ensure no barcode/QR code patterns or high-ASCII remnants remain',
    severity: 'high',
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const patterns = [
        { regex: /B\s*[\^]+\s*B/gi, name: 'B^^^B' },
        { regex: /a\s*!{3,}\s*a/gi, name: 'a!!!a' },
        { regex: /a!{3,}a[!aA]+/gi, name: 'a!!!a extended' },
        { regex: /[<>\[\]{}|\\^]{5,}/g, name: 'special char cluster' },
        { regex: /[\x80-\xff]{5,}/g, name: 'high-ASCII sequence' },
      ]

      const found: string[] = []
      for (const { regex, name } of patterns) {
        // Reset lastIndex for global patterns
        regex.lastIndex = 0
        if (regex.test(chunk.sanitizedText)) {
          found.push(name)
        }
      }

      return {
        passed: found.length === 0,
        gateId: 'no_barcode_patterns',
        message: found.length === 0
          ? 'No barcode patterns found'
          : `Found barcode patterns: ${found.join(', ')}`,
        details: { patterns: found },
      }
    },
  },
  {
    id: 'no_spaced_fragments',
    name: 'No Spaced Turkish Fragments',
    description: 'Check that spaced Turkish uppercase fragments (classic and mixed-length) have been merged',
    severity: 'high', // Elevated from medium - these cause extraction issues
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const TURKISH_UPPER = 'A-ZÇĞİÖŞÜÂÎÛ'
      const foundPatterns: string[] = []

      // Classic pattern: 3+ Turkish uppercase tokens (1-3 chars each) separated by spaces
      const classicPattern = new RegExp(
        `\\b(?:[${TURKISH_UPPER}]{1,3}\\s){2,}[${TURKISH_UPPER}]{1,3}\\b`,
        'g'
      )
      const classicMatches = chunk.sanitizedText.match(classicPattern) || []
      if (classicMatches.length > 0) {
        foundPatterns.push(...classicMatches.slice(0, 2).map(m => `classic: "${m}"`))
      }

      // Mixed-length pattern: 2+ Turkish uppercase tokens (1-10 chars) with at least 2 short (<=3)
      const mixedPattern = new RegExp(
        `\\b(?:[${TURKISH_UPPER}]{1,10}\\s+){1,}[${TURKISH_UPPER}]{1,10}\\b`,
        'g'
      )
      const mixedMatches = chunk.sanitizedText.match(mixedPattern) || []
      for (const match of mixedMatches) {
        const tokens = match.split(/\s+/).filter(Boolean)
        if (tokens.length < 2) continue

        const shortCount = tokens.filter(t => t.length <= 3).length
        const turkishUpperPattern = new RegExp(`^[${TURKISH_UPPER}]+$`)
        const allTurkishUpper = tokens.every(t => turkishUpperPattern.test(t))

        // Mixed pattern: at least 2 short tokens and all Turkish upper
        if (shortCount >= 2 && allTurkishUpper) {
          foundPatterns.push(`mixed: "${match}"`)
          if (foundPatterns.length >= 3) break
        }
      }

      return {
        passed: foundPatterns.length === 0,
        gateId: 'no_spaced_fragments',
        message: foundPatterns.length === 0
          ? 'No spaced fragments found'
          : `Found ${foundPatterns.length} spaced fragment pattern(s): ${foundPatterns.join(', ')}`,
        details: { examples: foundPatterns },
      }
    },
  },
  {
    id: 'min_content_ratio',
    name: 'Minimum Content Ratio',
    description: 'Ensure sanitization did not remove too much content',
    severity: 'medium',
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const originalLength = chunk.text.trim().length
      const sanitizedLength = chunk.sanitizedText.trim().length

      if (originalLength === 0) {
        return {
          passed: true,
          gateId: 'min_content_ratio',
          message: 'Original content was empty',
          details: { ratio: 1 },
        }
      }

      const ratio = sanitizedLength / originalLength
      const minRatio = 0.5 // Allow up to 50% reduction

      return {
        passed: ratio >= minRatio,
        gateId: 'min_content_ratio',
        message: ratio >= minRatio
          ? `Content ratio: ${(ratio * 100).toFixed(1)}%`
          : `Content ratio ${(ratio * 100).toFixed(1)}% is below minimum ${(minRatio * 100).toFixed(0)}%`,
        details: { ratio, originalLength, sanitizedLength },
      }
    },
  },
  {
    id: 'reasonable_length',
    name: 'Reasonable Output Length',
    description: 'Ensure sanitized output is not suspiciously short or empty',
    severity: 'high',
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const length = chunk.sanitizedText.trim().length
      const minLength = 50 // Minimum reasonable chunk length

      // Empty or very short output is concerning
      if (chunk.text.trim().length < minLength) {
        // Original was short, so sanitized being short is OK
        return {
          passed: true,
          gateId: 'reasonable_length',
          message: 'Short chunk (original was short)',
          details: { length, originalLength: chunk.text.trim().length },
        }
      }

      return {
        passed: length >= minLength,
        gateId: 'reasonable_length',
        message: length >= minLength
          ? `Output length: ${length} chars`
          : `Output length ${length} is suspiciously short`,
        details: { length, minLength },
      }
    },
  },
]

// ============================================================================
// QA GATE FUNCTIONS
// ============================================================================

/**
 * Get a gate definition by ID
 */
export function getGateDefinition(gateId: QAGateId): QAGateDefinition | undefined {
  return QA_GATES.find(g => g.id === gateId)
}

/**
 * Get all gate definitions
 */
export function getAllGateDefinitions(): QAGateDefinition[] {
  return [...QA_GATES]
}

/**
 * Run all QA gates on a chunk
 */
export function runQAGates(
  chunk: SanitizedChunk,
  options: QAGateOptions = {}
): QAResult {
  const { gates = QA_GATES.map(g => g.id), failOnCritical = true } = options

  const gateResults: QAGateCheckResult[] = []
  const failedGates: QAGateId[] = []
  const passedGates: QAGateId[] = []

  let criticalFailures = 0
  let highFailures = 0
  let mediumFailures = 0
  let lowFailures = 0

  for (const gateId of gates) {
    const gateDef = getGateDefinition(gateId)
    if (!gateDef) continue

    const result = gateDef.check(chunk)
    gateResults.push(result)

    if (result.passed) {
      passedGates.push(gateId)
    } else {
      failedGates.push(gateId)

      switch (gateDef.severity) {
        case 'critical':
          criticalFailures++
          break
        case 'high':
          highFailures++
          break
        case 'medium':
          mediumFailures++
          break
        case 'low':
          lowFailures++
          break
      }
    }
  }

  // Determine if retry is needed
  // Retry if there are high or critical failures (not for medium/low)
  const requiresRetry = failOnCritical
    ? criticalFailures > 0 || highFailures > 0
    : highFailures > 0

  return {
    chunkId: chunk.id,
    chunkIndex: chunk.index,
    passed: failedGates.length === 0,
    gateResults,
    failedGates,
    passedGates,
    criticalFailures,
    highFailures,
    mediumFailures,
    lowFailures,
    requiresRetry,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Create a QA report for a chunk with retry tracking
 */
export function createChunkQAReport(
  chunk: SanitizedChunk,
  qaResult: QAResult
): ChunkQAReport {
  return {
    chunkId: chunk.id,
    chunkIndex: chunk.index,
    originalLength: chunk.text.length,
    sanitizedLength: chunk.sanitizedText.length,
    qaResults: [qaResult],
    retryAttempts: [],
    finalStatus: qaResult.passed ? 'passed' : 'failed',
    totalAttempts: 1,
    totalProcessingTimeMs: 0,
  }
}

/**
 * Add a retry attempt to a chunk report
 */
export function addRetryAttempt(
  report: ChunkQAReport,
  attempt: RetryAttempt,
  updatedQAResult: QAResult
): void {
  report.retryAttempts.push(attempt)
  report.qaResults.push(updatedQAResult)
  report.totalAttempts++
  report.totalProcessingTimeMs += attempt.processingTimeMs

  if (updatedQAResult.passed) {
    report.finalStatus = 'passed_after_retry'
  } else if (report.totalAttempts >= 3) {
    // After max retries, mark for manual review
    report.finalStatus = 'manual_review'
  }
}

/**
 * Create a document-level QA report
 */
export function createDocumentQAReport(
  documentId: string,
  chunkReports: ChunkQAReport[]
): DocumentQAReport {
  const passedChunks = chunkReports.filter(r => r.finalStatus === 'passed').length
  const failedChunks = chunkReports.filter(r => r.finalStatus === 'failed').length
  const retriedChunks = chunkReports.filter(r => r.finalStatus === 'passed_after_retry').length
  const manualReviewChunks = chunkReports.filter(r => r.finalStatus === 'manual_review').length

  let overallStatus: DocumentQAReport['overallStatus']
  if (failedChunks === 0 && manualReviewChunks === 0) {
    overallStatus = 'passed'
  } else if (passedChunks + retriedChunks > 0) {
    overallStatus = 'partial'
  } else {
    overallStatus = 'failed'
  }

  return {
    documentId,
    totalChunks: chunkReports.length,
    passedChunks,
    failedChunks,
    retriedChunks,
    manualReviewChunks,
    chunkReports,
    overallStatus,
    timestamp: new Date().toISOString(),
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Type for the LLM cleanup function that can be injected
 */
export type LLMCleanupFunction = (
  text: string,
  context?: { chunkIndex: number; failedGates: QAGateId[] }
) => Promise<string>

/**
 * Determine what action to take for a failing chunk
 */
export function determineRetryAction(
  qaResult: QAResult,
  attemptNumber: number,
  maxRetries: number
): RetryAttempt['action'] {
  if (attemptNumber >= maxRetries) {
    return 'manual_review_needed'
  }

  // If we have artifact issues, try LLM cleanup
  // These are the most common issues that LLM can help fix
  if (
    qaResult.failedGates.includes('no_artifacts') ||
    qaResult.failedGates.includes('no_barcode_patterns') ||
    qaResult.failedGates.includes('no_spaced_fragments') ||
    qaResult.failedGates.includes('min_content_ratio') ||
    qaResult.failedGates.includes('reasonable_length')
  ) {
    return 'llm_cleanup'
  }

  // If we have preservation issues, try sanitizer with different settings
  if (qaResult.failedGates.includes('data_preserved')) {
    return 'sanitizer_retry'
  }

  // Default to LLM cleanup
  return 'llm_cleanup'
}

/**
 * Generate LLM cleanup prompt based on failed gates
 */
export function generateLLMCleanupPrompt(failedGates: QAGateId[]): string {
  const issues: string[] = []

  if (failedGates.includes('no_barcode_patterns')) {
    issues.push('- Remove any barcode/QR patterns like "B^^^B", "a!!!a", "a!!!!!a!AAA"')
    issues.push('- Remove sequences of high-ASCII characters (garbled text)')
  }

  if (failedGates.includes('no_spaced_fragments')) {
    issues.push('- Merge spaced Turkish uppercase letters: "S İ G O R T A" → "SİGORTA"')
    issues.push('- Merge mixed-length patterns: "GEN İŞ LETİLM İŞ" → "GENİŞLETİLMİŞ"')
  }

  if (failedGates.includes('no_artifacts')) {
    issues.push('- Remove any remaining OCR artifacts and garbage characters')
  }

  return `Clean this Turkish insurance document text. Fix these specific issues:
${issues.join('\n')}

CRITICAL RULES:
1. PRESERVE ALL: policy numbers, dates (DD.MM.YYYY), amounts (1.234,56 TL), plate numbers (34 ABC 123), VINs exactly
2. Only remove garbage/artifacts, do not change valid Turkish text
3. Return only the cleaned text, no explanations`
}

/**
 * Create a retry attempt record
 */
export function createRetryAttempt(
  chunkId: string,
  attemptNumber: number,
  failedGates: QAGateId[],
  action: RetryAttempt['action'],
  success: boolean,
  resultingGates: QAGateCheckResult[],
  processingTimeMs: number
): RetryAttempt {
  return {
    attemptNumber,
    timestamp: new Date().toISOString(),
    chunkId,
    failedGates,
    action,
    success,
    resultingGates,
    processingTimeMs,
  }
}

/**
 * Process a chunk with retry logic
 *
 * @param chunk - The sanitized chunk to validate and potentially retry
 * @param llmCleanup - Optional LLM cleanup function for retries
 * @param options - QA gate options including retry settings
 * @returns The chunk QA report with all attempts
 */
export async function processChunkWithRetry(
  chunk: SanitizedChunk,
  llmCleanup?: LLMCleanupFunction,
  options: QAGateOptions = {}
): Promise<{ report: ChunkQAReport; finalChunk: SanitizedChunk }> {
  const { maxRetries = 2 } = options

  // Run initial QA
  let currentQAResult = runQAGates(chunk, options)
  const report = createChunkQAReport(chunk, currentQAResult)

  let currentChunk = chunk

  // Retry loop
  let attemptNumber = 0
  while (currentQAResult.requiresRetry && attemptNumber < maxRetries) {
    attemptNumber++

    const action = determineRetryAction(currentQAResult, attemptNumber, maxRetries)

    if (action === 'manual_review_needed') {
      report.finalStatus = 'manual_review'
      break
    }

    const startTime = Date.now()
    let newText: string

    if (action === 'llm_cleanup' && llmCleanup) {
      // Run LLM cleanup
      try {
        newText = await llmCleanup(currentChunk.sanitizedText, {
          chunkIndex: currentChunk.index,
          failedGates: currentQAResult.failedGates,
        })
      } catch (error) {
        // LLM cleanup failed, mark for manual review
        const attempt = createRetryAttempt(
          chunk.id,
          attemptNumber,
          currentQAResult.failedGates,
          action,
          false,
          [],
          Date.now() - startTime
        )
        addRetryAttempt(report, attempt, currentQAResult)
        report.finalStatus = 'manual_review'
        break
      }
    } else if (action === 'sanitizer_retry') {
      // Re-run sanitizer (with same settings for now)
      // In future, could try different sanitizer settings
      newText = currentChunk.text
    } else {
      // No LLM function provided, can't retry
      report.finalStatus = 'manual_review'
      break
    }

    // Create updated chunk
    const updatedChunk: SanitizedChunk = {
      ...currentChunk,
      sanitizedText: newText,
    }

    // Re-run QA
    const newQAResult = runQAGates(updatedChunk, options)
    const processingTime = Date.now() - startTime

    // Record attempt
    const attempt = createRetryAttempt(
      chunk.id,
      attemptNumber,
      currentQAResult.failedGates,
      action,
      newQAResult.passed || !newQAResult.requiresRetry,
      newQAResult.gateResults,
      processingTime
    )
    addRetryAttempt(report, attempt, newQAResult)

    currentChunk = updatedChunk
    currentQAResult = newQAResult

    if (newQAResult.passed) {
      report.finalStatus = 'passed_after_retry'
      break
    }
  }

  return { report, finalChunk: currentChunk }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process all chunks with QA gates and retry logic
 */
export async function processAllChunksWithQA(
  chunks: SanitizedChunk[],
  llmCleanup?: LLMCleanupFunction,
  options: QAGateOptions = {}
): Promise<{
  documentReport: DocumentQAReport
  processedChunks: SanitizedChunk[]
}> {
  const chunkReports: ChunkQAReport[] = []
  const processedChunks: SanitizedChunk[] = []

  for (const chunk of chunks) {
    const { report, finalChunk } = await processChunkWithRetry(chunk, llmCleanup, options)
    chunkReports.push(report)
    processedChunks.push(finalChunk)
  }

  const documentReport = createDocumentQAReport('document', chunkReports)

  return { documentReport, processedChunks }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a summary of QA results
 */
export function getQASummary(report: DocumentQAReport): string {
  const lines = [
    `Document QA Report: ${report.overallStatus.toUpperCase()}`,
    `Total chunks: ${report.totalChunks}`,
    `  Passed: ${report.passedChunks}`,
    `  Passed after retry: ${report.retriedChunks}`,
    `  Failed: ${report.failedChunks}`,
    `  Manual review: ${report.manualReviewChunks}`,
  ]

  if (report.overallStatus !== 'passed') {
    lines.push('\nChunks requiring attention:')
    for (const chunk of report.chunkReports) {
      if (chunk.finalStatus === 'failed' || chunk.finalStatus === 'manual_review') {
        const lastQA = chunk.qaResults[chunk.qaResults.length - 1]
        lines.push(`  - Chunk ${chunk.chunkIndex}: ${lastQA.failedGates.join(', ')}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Check if any chunks failed QA
 */
export function hasQAFailures(report: DocumentQAReport): boolean {
  return report.failedChunks > 0 || report.manualReviewChunks > 0
}

/**
 * Get failed chunks from a report
 */
export function getFailedChunks(report: DocumentQAReport): ChunkQAReport[] {
  return report.chunkReports.filter(
    r => r.finalStatus === 'failed' || r.finalStatus === 'manual_review'
  )
}
