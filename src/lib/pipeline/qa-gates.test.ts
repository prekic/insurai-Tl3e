/**
 * QA Gates Tests
 */

import { describe, it, expect, vi } from 'vitest'
import {
  runQAGates,
  getGateDefinition,
  getAllGateDefinitions,
  createChunkQAReport,
  addRetryAttempt,
  createDocumentQAReport,
  determineRetryAction,
  createRetryAttempt,
  processChunkWithRetry,
  processAllChunksWithQA,
  getQASummary,
  hasQAFailures,
  getFailedChunks,
  type QAGateId,
} from './qa-gates'
import type { SanitizedChunk } from './document-chunker'

// Helper to create a test chunk
function createTestChunk(
  text: string,
  sanitizedText: string,
  overrides: Partial<SanitizedChunk> = {}
): SanitizedChunk {
  return {
    id: 'test_chunk_000',
    index: 0,
    text,
    sanitizedText,
    pageNumbers: [],
    startOffset: 0,
    endOffset: text.length,
    hasOverlap: false,
    overlapChars: 0,
    sanitizerResult: {
      text: sanitizedText,
      stats: {
        linesRemoved: 0,
        garbageLinesRemoved: 0,
        lowLetterRatioLinesRemoved: 0,
        spacedFragmentsMerged: 0,
        controlCharsRemoved: 0,
        spacesNormalized: 0,
        newlinesNormalized: 0,
        barcodeTokensIsolated: 0,
      },
      warnings: [],
    },
    ...overrides,
  }
}

describe('QA Gates', () => {
  describe('getGateDefinition', () => {
    it('should return gate definition by ID', () => {
      const gate = getGateDefinition('no_artifacts')
      expect(gate).toBeDefined()
      expect(gate?.id).toBe('no_artifacts')
      expect(gate?.name).toBe('No Remaining Artifacts')
    })

    it('should return undefined for unknown gate', () => {
      const gate = getGateDefinition('unknown_gate' as QAGateId)
      expect(gate).toBeUndefined()
    })
  })

  describe('getAllGateDefinitions', () => {
    it('should return all gate definitions', () => {
      const gates = getAllGateDefinitions()
      expect(gates.length).toBeGreaterThan(0)

      const ids = gates.map(g => g.id)
      expect(ids).toContain('no_artifacts')
      expect(ids).toContain('data_preserved')
      expect(ids).toContain('no_barcode_patterns')
    })
  })

  describe('runQAGates', () => {
    describe('no_artifacts gate', () => {
      it('should pass for clean text', () => {
        const chunk = createTestChunk('Original text', 'Clean sanitized text')
        const result = runQAGates(chunk)

        const artifactGate = result.gateResults.find(g => g.gateId === 'no_artifacts')
        expect(artifactGate?.passed).toBe(true)
      })

      it('should fail for text with B^^^B pattern', () => {
        const chunk = createTestChunk('Original', 'Text with B^^^B artifact')
        const result = runQAGates(chunk)

        const artifactGate = result.gateResults.find(g => g.gateId === 'no_artifacts')
        expect(artifactGate?.passed).toBe(false)
      })

      it('should fail for text with spaced Turkish pattern', () => {
        const chunk = createTestChunk('Original', 'S Ö Z L E Ş M E pattern')
        const result = runQAGates(chunk)

        const artifactGate = result.gateResults.find(g => g.gateId === 'no_artifacts')
        expect(artifactGate?.passed).toBe(false)
      })
    })

    describe('data_preserved gate', () => {
      it('should pass when policy numbers preserved', () => {
        const chunk = createTestChunk(
          'Poliçe No: 12345 original',
          'Poliçe No: 12345 cleaned'
        )
        const result = runQAGates(chunk)

        const preservedGate = result.gateResults.find(g => g.gateId === 'data_preserved')
        expect(preservedGate?.passed).toBe(true)
      })

      it('should fail when policy number altered', () => {
        const chunk = createTestChunk('Poliçe No: 12345 original', 'Poliçe No: 54321 cleaned')
        const result = runQAGates(chunk)

        const preservedGate = result.gateResults.find(g => g.gateId === 'data_preserved')
        expect(preservedGate?.passed).toBe(false)
      })
    })

    describe('no_barcode_patterns gate', () => {
      it('should pass for clean text', () => {
        const chunk = createTestChunk('Original', 'Clean text without patterns')
        const result = runQAGates(chunk)

        const barcodeGate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')
        expect(barcodeGate?.passed).toBe(true)
      })

      it('should fail for B^^^B pattern', () => {
        const chunk = createTestChunk('Original', 'Has B^^^B barcode')
        const result = runQAGates(chunk)

        const barcodeGate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')
        expect(barcodeGate?.passed).toBe(false)
      })

      it('should fail for a!!!a pattern', () => {
        const chunk = createTestChunk('Original', 'Has a!!!!a pattern')
        const result = runQAGates(chunk)

        const barcodeGate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')
        expect(barcodeGate?.passed).toBe(false)
      })
    })

    describe('min_content_ratio gate', () => {
      it('should pass when ratio is acceptable', () => {
        const original = 'A'.repeat(100)
        const sanitized = 'A'.repeat(80) // 80% retained
        const chunk = createTestChunk(original, sanitized)
        const result = runQAGates(chunk)

        const ratioGate = result.gateResults.find(g => g.gateId === 'min_content_ratio')
        expect(ratioGate?.passed).toBe(true)
      })

      it('should fail when too much content removed', () => {
        const original = 'A'.repeat(100)
        const sanitized = 'A'.repeat(30) // Only 30% retained
        const chunk = createTestChunk(original, sanitized)
        const result = runQAGates(chunk)

        const ratioGate = result.gateResults.find(g => g.gateId === 'min_content_ratio')
        expect(ratioGate?.passed).toBe(false)
      })
    })

    describe('reasonable_length gate', () => {
      it('should pass for adequate length', () => {
        const chunk = createTestChunk(
          'A'.repeat(200),
          'B'.repeat(100) // 100 chars output
        )
        const result = runQAGates(chunk)

        const lengthGate = result.gateResults.find(g => g.gateId === 'reasonable_length')
        expect(lengthGate?.passed).toBe(true)
      })

      it('should fail for suspiciously short output', () => {
        const chunk = createTestChunk(
          'A'.repeat(1000),
          'Short' // Only 5 chars
        )
        const result = runQAGates(chunk)

        const lengthGate = result.gateResults.find(g => g.gateId === 'reasonable_length')
        expect(lengthGate?.passed).toBe(false)
      })

      it('should pass for short original with short output', () => {
        const chunk = createTestChunk('Short', 'OK')
        const result = runQAGates(chunk)

        const lengthGate = result.gateResults.find(g => g.gateId === 'reasonable_length')
        expect(lengthGate?.passed).toBe(true)
      })
    })

    describe('overall result', () => {
      it('should pass when all gates pass', () => {
        const chunk = createTestChunk(
          'Poliçe No: 12345. Normal content here with sufficient length.',
          'Poliçe No: 12345. Normal content here with sufficient length cleaned.'
        )
        const result = runQAGates(chunk)

        expect(result.passed).toBe(true)
        expect(result.failedGates).toHaveLength(0)
      })

      it('should fail when any gate fails', () => {
        const chunk = createTestChunk('Original', 'B^^^B artifact present')
        const result = runQAGates(chunk)

        expect(result.passed).toBe(false)
        expect(result.failedGates.length).toBeGreaterThan(0)
      })

      it('should count failures by severity', () => {
        const chunk = createTestChunk('Poliçe No: 12345', 'Poliçe No: 54321') // Critical failure
        const result = runQAGates(chunk)

        expect(result.criticalFailures).toBeGreaterThan(0)
      })

      it('should set requiresRetry for high/critical failures', () => {
        const chunk = createTestChunk('Original', 'B^^^B artifact') // High failure
        const result = runQAGates(chunk)

        expect(result.requiresRetry).toBe(true)
      })
    })
  })

  describe('createChunkQAReport', () => {
    it('should create report with initial QA result', () => {
      const chunk = createTestChunk('Original', 'Cleaned')
      const qaResult = runQAGates(chunk)
      const report = createChunkQAReport(chunk, qaResult)

      expect(report.chunkId).toBe(chunk.id)
      expect(report.chunkIndex).toBe(chunk.index)
      expect(report.qaResults).toHaveLength(1)
      expect(report.retryAttempts).toHaveLength(0)
      expect(report.totalAttempts).toBe(1)
    })

    it('should set finalStatus based on QA result', () => {
      const goodChunk = createTestChunk(
        'Poliçe: 123. Content.',
        'Poliçe: 123. Content cleaned.'
      )
      const goodResult = runQAGates(goodChunk)
      const goodReport = createChunkQAReport(goodChunk, goodResult)
      expect(goodReport.finalStatus).toBe('passed')

      const badChunk = createTestChunk('Original', 'B^^^B')
      const badResult = runQAGates(badChunk)
      const badReport = createChunkQAReport(badChunk, badResult)
      expect(badReport.finalStatus).toBe('failed')
    })
  })

  describe('addRetryAttempt', () => {
    it('should add retry attempt to report', () => {
      const chunk = createTestChunk('Original', 'B^^^B')
      const qaResult = runQAGates(chunk)
      const report = createChunkQAReport(chunk, qaResult)

      const attempt = createRetryAttempt(
        chunk.id,
        1,
        ['no_artifacts'],
        'llm_cleanup',
        true,
        [],
        100
      )

      const newQAResult = { ...qaResult, passed: true, failedGates: [] }
      addRetryAttempt(report, attempt, newQAResult)

      expect(report.retryAttempts).toHaveLength(1)
      expect(report.qaResults).toHaveLength(2)
      expect(report.totalAttempts).toBe(2)
      expect(report.finalStatus).toBe('passed_after_retry')
    })
  })

  describe('createDocumentQAReport', () => {
    it('should aggregate chunk reports', () => {
      const chunkReports = [
        {
          chunkId: 'chunk_000',
          chunkIndex: 0,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'passed' as const,
          totalAttempts: 1,
          totalProcessingTimeMs: 10,
        },
        {
          chunkId: 'chunk_001',
          chunkIndex: 1,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'passed_after_retry' as const,
          totalAttempts: 2,
          totalProcessingTimeMs: 20,
        },
      ]

      const report = createDocumentQAReport('doc123', chunkReports)

      expect(report.documentId).toBe('doc123')
      expect(report.totalChunks).toBe(2)
      expect(report.passedChunks).toBe(1)
      expect(report.retriedChunks).toBe(1)
      expect(report.overallStatus).toBe('passed')
    })

    it('should set partial status when some chunks fail', () => {
      const chunkReports = [
        {
          chunkId: 'chunk_000',
          chunkIndex: 0,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'passed' as const,
          totalAttempts: 1,
          totalProcessingTimeMs: 10,
        },
        {
          chunkId: 'chunk_001',
          chunkIndex: 1,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'failed' as const,
          totalAttempts: 3,
          totalProcessingTimeMs: 50,
        },
      ]

      const report = createDocumentQAReport('doc123', chunkReports)

      expect(report.overallStatus).toBe('partial')
      expect(report.failedChunks).toBe(1)
    })
  })

  describe('determineRetryAction', () => {
    it('should return manual_review when max retries reached', () => {
      const qaResult = {
        chunkId: 'test',
        chunkIndex: 0,
        passed: false,
        gateResults: [],
        failedGates: ['no_artifacts'] as QAGateId[],
        passedGates: [],
        criticalFailures: 0,
        highFailures: 1,
        mediumFailures: 0,
        lowFailures: 0,
        requiresRetry: true,
        timestamp: new Date().toISOString(),
      }

      const action = determineRetryAction(qaResult, 3, 2)
      expect(action).toBe('manual_review_needed')
    })

    it('should return llm_cleanup for artifact failures', () => {
      const qaResult = {
        chunkId: 'test',
        chunkIndex: 0,
        passed: false,
        gateResults: [],
        failedGates: ['no_artifacts'] as QAGateId[],
        passedGates: [],
        criticalFailures: 0,
        highFailures: 1,
        mediumFailures: 0,
        lowFailures: 0,
        requiresRetry: true,
        timestamp: new Date().toISOString(),
      }

      const action = determineRetryAction(qaResult, 1, 2)
      expect(action).toBe('llm_cleanup')
    })

    it('should return sanitizer_retry for preservation failures', () => {
      const qaResult = {
        chunkId: 'test',
        chunkIndex: 0,
        passed: false,
        gateResults: [],
        failedGates: ['data_preserved'] as QAGateId[],
        passedGates: [],
        criticalFailures: 1,
        highFailures: 0,
        mediumFailures: 0,
        lowFailures: 0,
        requiresRetry: true,
        timestamp: new Date().toISOString(),
      }

      const action = determineRetryAction(qaResult, 1, 2)
      expect(action).toBe('sanitizer_retry')
    })
  })

  describe('processChunkWithRetry', () => {
    it('should pass immediately for clean chunk', async () => {
      const chunk = createTestChunk(
        'Poliçe: 12345. Good content here.',
        'Poliçe: 12345. Good content here cleaned.'
      )

      const { report, finalChunk } = await processChunkWithRetry(chunk)

      expect(report.finalStatus).toBe('passed')
      expect(report.totalAttempts).toBe(1)
      expect(report.retryAttempts).toHaveLength(0)
      expect(finalChunk).toBe(chunk)
    })

    it('should retry with LLM cleanup on artifact failure', async () => {
      const chunk = createTestChunk('Poliçe: 12345 Original text here', 'Poliçe: 12345 B^^^B artifact present')

      const mockLLMCleanup = vi.fn().mockResolvedValue('Poliçe: 12345 Cleaned text without artifacts')

      const { report, finalChunk } = await processChunkWithRetry(chunk, mockLLMCleanup, {
        maxRetries: 2,
      })

      expect(mockLLMCleanup).toHaveBeenCalled()
      expect(report.retryAttempts.length).toBeGreaterThan(0)
      expect(finalChunk.sanitizedText).not.toContain('B^^^B')
    })

    it('should mark as manual_review after max retries', async () => {
      const chunk = createTestChunk('Original', 'B^^^B still here')

      const mockLLMCleanup = vi.fn().mockResolvedValue('B^^^B still not fixed')

      // maxRetries=3 allows for 2 actual LLM calls before hitting max
      // (first retry at attempt 1, second at attempt 2, then attempt 3 returns manual_review_needed)
      const { report } = await processChunkWithRetry(chunk, mockLLMCleanup, {
        maxRetries: 3,
      })

      expect(report.finalStatus).toBe('manual_review')
      expect(mockLLMCleanup).toHaveBeenCalledTimes(2)
    })

    it('should handle LLM cleanup failure gracefully', async () => {
      const chunk = createTestChunk('Original', 'B^^^B artifact')

      const mockLLMCleanup = vi.fn().mockRejectedValue(new Error('LLM error'))

      const { report } = await processChunkWithRetry(chunk, mockLLMCleanup)

      expect(report.finalStatus).toBe('manual_review')
    })
  })

  describe('processAllChunksWithQA', () => {
    it('should process multiple chunks', async () => {
      const chunks = [
        createTestChunk('Original 1. Good content.', 'Cleaned 1. Good content.', { id: 'chunk_000', index: 0 }),
        createTestChunk('Original 2. More content.', 'Cleaned 2. More content.', { id: 'chunk_001', index: 1 }),
      ]

      const { documentReport, processedChunks } = await processAllChunksWithQA(chunks)

      expect(documentReport.totalChunks).toBe(2)
      expect(processedChunks).toHaveLength(2)
    })
  })

  describe('getQASummary', () => {
    it('should generate readable summary', () => {
      const report = createDocumentQAReport('doc', [
        {
          chunkId: 'chunk_000',
          chunkIndex: 0,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'passed',
          totalAttempts: 1,
          totalProcessingTimeMs: 10,
        },
      ])

      const summary = getQASummary(report)

      expect(summary).toContain('PASSED')
      expect(summary).toContain('Total chunks: 1')
    })
  })

  describe('hasQAFailures', () => {
    it('should return true when chunks failed', () => {
      const report = createDocumentQAReport('doc', [
        {
          chunkId: 'chunk_000',
          chunkIndex: 0,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'failed',
          totalAttempts: 3,
          totalProcessingTimeMs: 50,
        },
      ])

      expect(hasQAFailures(report)).toBe(true)
    })

    it('should return false when all chunks passed', () => {
      const report = createDocumentQAReport('doc', [
        {
          chunkId: 'chunk_000',
          chunkIndex: 0,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'passed',
          totalAttempts: 1,
          totalProcessingTimeMs: 10,
        },
      ])

      expect(hasQAFailures(report)).toBe(false)
    })
  })

  describe('getFailedChunks', () => {
    it('should return failed and manual_review chunks', () => {
      const report = createDocumentQAReport('doc', [
        {
          chunkId: 'chunk_000',
          chunkIndex: 0,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'passed',
          totalAttempts: 1,
          totalProcessingTimeMs: 10,
        },
        {
          chunkId: 'chunk_001',
          chunkIndex: 1,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'failed',
          totalAttempts: 3,
          totalProcessingTimeMs: 50,
        },
        {
          chunkId: 'chunk_002',
          chunkIndex: 2,
          originalLength: 100,
          sanitizedLength: 90,
          qaResults: [],
          retryAttempts: [],
          finalStatus: 'manual_review',
          totalAttempts: 3,
          totalProcessingTimeMs: 50,
        },
      ])

      const failed = getFailedChunks(report)

      expect(failed).toHaveLength(2)
      expect(failed.map(c => c.chunkId)).toContain('chunk_001')
      expect(failed.map(c => c.chunkId)).toContain('chunk_002')
    })
  })
})
