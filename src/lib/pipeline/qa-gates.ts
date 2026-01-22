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
  | 'no_control_chars'
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
      // Normalize text for consistent matching
      const text = chunk.sanitizedText.normalize('NFC')
      const patterns = [
        { regex: /B\s*[\^]+\s*B/gi, name: 'B^^^B' },
        { regex: /a\s*!{3,}\s*a/gi, name: 'a!!!a' },
        { regex: /a!{3,}a[!aA]*/gi, name: 'a!!!a extended' },
        { regex: /[<>[\]{}|\\^]{5,}/g, name: 'special char cluster' },
        { regex: /[\x80-\xff]{3,}/g, name: 'high-ASCII sequence' },
        { regex: /[\uFFFD]{2,}/g, name: 'replacement chars' },
      ]

      const found: string[] = []
      for (const { regex, name } of patterns) {
        // Reset lastIndex for global patterns
        regex.lastIndex = 0
        if (regex.test(text)) {
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
    id: 'no_control_chars',
    name: 'No Control Characters',
    description: 'Ensure no control characters (C0/C1) or replacement characters remain',
    severity: 'high',
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      // Check for C0 controls (except tab/newline), C1 controls, and replacement chars
      // eslint-disable-next-line no-control-regex
      const controlPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g
      const matches = chunk.sanitizedText.match(controlPattern) || []
      const count = matches.length

      // Allow up to 2 stray control chars (might be false positives)
      const threshold = 2

      return {
        passed: count <= threshold,
        gateId: 'no_control_chars',
        message: count <= threshold
          ? `Control chars: ${count} (acceptable)`
          : `Found ${count} control/replacement characters`,
        details: { count, threshold },
      }
    },
  },
  {
    id: 'no_spaced_fragments',
    name: 'No Spaced Turkish Fragments',
    description: 'Check that spaced Turkish uppercase fragments (classic and mixed-length) have been merged',
    severity: 'high', // Elevated from medium - these cause extraction issues
    check: (chunk: SanitizedChunk): QAGateCheckResult => {
      const foundPatterns: string[] = []
      // Normalize text for consistent Unicode handling
      const text = chunk.sanitizedText.normalize('NFC')

      // Unicode-safe check for Turkish uppercase using \p{Lu} with /u flag
      // Check if a string is all uppercase letters
      const isAllUpper = (s: string): boolean => {
        if (s.length === 0) return false
        try {
          return /^\p{Lu}+$/u.test(s)
        } catch {
          // Fallback for environments without Unicode property support
          return /^[A-ZÇĞİÖŞÜÂÎÛ]+$/.test(s)
        }
      }

      // Scan for space-separated uppercase sequences
      const words = text.split(/\s+/)
      let consecutiveUpperFragments: string[] = []

      for (const word of words) {
        if (word.length > 0 && word.length <= 10 && isAllUpper(word)) {
          consecutiveUpperFragments.push(word)
        } else {
          // Check if we had a valid spaced fragment sequence
          if (consecutiveUpperFragments.length >= 3) {
            const shortCount = consecutiveUpperFragments.filter(w => w.length <= 3).length
            if (shortCount >= 2) {
              const match = consecutiveUpperFragments.join(' ')
              const type = consecutiveUpperFragments.every(w => w.length <= 3) ? 'classic' : 'mixed'
              foundPatterns.push(`${type}: "${match}"`)
            }
          }
          consecutiveUpperFragments = []
        }
      }

      // Check final sequence
      if (consecutiveUpperFragments.length >= 3) {
        const shortCount = consecutiveUpperFragments.filter(w => w.length <= 3).length
        if (shortCount >= 2) {
          const match = consecutiveUpperFragments.join(' ')
          const type = consecutiveUpperFragments.every(w => w.length <= 3) ? 'classic' : 'mixed'
          foundPatterns.push(`${type}: "${match}"`)
        }
      }

      return {
        passed: foundPatterns.length === 0,
        gateId: 'no_spaced_fragments',
        message: foundPatterns.length === 0
          ? 'No spaced fragments found'
          : `Found ${foundPatterns.length} spaced fragment pattern(s): ${foundPatterns.slice(0, 3).join(', ')}`,
        details: { examples: foundPatterns.slice(0, 5) },
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
 * Generate LLM cleanup prompt based on failed gates (v5 - more robust)
 */
export function generateLLMCleanupPrompt(failedGates: QAGateId[]): string {
  const issues: string[] = []

  if (failedGates.includes('no_barcode_patterns')) {
    issues.push('BARCODE REMOVAL:')
    issues.push('  - Remove "B^^^B" and "B ^ ^ ^ B" patterns completely')
    issues.push('  - Remove "a!!!a", "a!!!!!a", "a!!!a!AAA" patterns completely')
    issues.push('  - Remove sequences of 3+ high-ASCII/garbled characters (�, □, ▪, etc.)')
    issues.push('  - These are scanner artifacts, not real content')
  }

  if (failedGates.includes('no_spaced_fragments')) {
    issues.push('TURKISH FRAGMENT MERGING:')
    issues.push('  - Join spaced uppercase letters: "S İ G O R T A" → "SİGORTA"')
    issues.push('  - Join mixed patterns: "GEN İŞ LETİLM İŞ" → "GENİŞLETİLMİŞ"')
    issues.push('  - Join patterns like "B İ R L E Ş İ K" → "BİRLEŞİK"')
    issues.push('  - Turkish uppercase includes: Ç, Ğ, İ, Ö, Ş, Ü')
  }

  if (failedGates.includes('no_control_chars')) {
    issues.push('CONTROL CHARACTER REMOVAL:')
    issues.push('  - Remove invisible control characters (C0/C1 controls)')
    issues.push('  - Remove replacement characters (�)')
    issues.push('  - These appear as blank or garbled squares')
  }

  if (failedGates.includes('no_artifacts')) {
    issues.push('GENERAL ARTIFACT CLEANUP:')
    issues.push('  - Remove any remaining OCR garbage or scanner noise')
    issues.push('  - Clean up stray punctuation clusters')
  }

  const issueText = issues.length > 0 ? issues.join('\n') : '- General OCR cleanup needed'

  return `# Turkish Insurance Document Cleanup Task

You are cleaning OCR-scanned Turkish insurance document text.

## ISSUES TO FIX:
${issueText}

## CRITICAL PRESERVATION RULES (NON-NEGOTIABLE):
1. Policy numbers: Keep EXACT (e.g., "9024025101000253/2", "POL-2024-12345")
2. Dates: Keep EXACT format (e.g., "15.01.2026", "01/12/2025")
3. Amounts: Keep EXACT Turkish format (e.g., "1.234,56 TL", "₺50.000,00")
4. Plate numbers: Keep EXACT (e.g., "34 ABC 123", "06 A 1234")
5. VIN/Chassis: Keep EXACT 17-char codes (e.g., "WVWZZZ3CZWE123456")
6. TC Kimlik: Keep EXACT 11-digit numbers
7. IBAN: Keep EXACT format (e.g., "TR12 0001 2345 6789 0123 4567 89")

## OUTPUT:
Return ONLY the cleaned text. No explanations, headers, or markdown.
Preserve all paragraph structure and line breaks from the original.`
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
      } catch (_error) {
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
