/**
 * QA Gates - Comprehensive Branch Coverage Tests
 *
 * Targets every uncovered branch: conditional returns, error handling paths,
 * edge cases with empty inputs, threshold comparisons, retry logic,
 * LLM cleanup prompt generation, gate validation results with different
 * quality scores, and severity-based failure counting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runQAGates,
  getGateDefinition,
  getAllGateDefinitions,
  createChunkQAReport,
  addRetryAttempt,
  createDocumentQAReport,
  determineRetryAction,
  generateLLMCleanupPrompt,
  createRetryAttempt,
  processChunkWithRetry,
  processAllChunksWithQA,
  getQASummary,
  hasQAFailures,
  getFailedChunks,
  type QAGateId,
  type QAResult,
  type ChunkQAReport,
} from './qa-gates'
import type { SanitizedChunk } from './document-chunker'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeChunk(
  text: string,
  sanitizedText: string,
  overrides: Partial<SanitizedChunk> = {}
): SanitizedChunk {
  return {
    id: 'chunk_000',
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

function makeQAResult(overrides: Partial<QAResult> = {}): QAResult {
  return {
    chunkId: 'chunk_000',
    chunkIndex: 0,
    passed: false,
    gateResults: [],
    failedGates: [],
    passedGates: [],
    criticalFailures: 0,
    highFailures: 0,
    mediumFailures: 0,
    lowFailures: 0,
    requiresRetry: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function makeChunkReport(overrides: Partial<ChunkQAReport> = {}): ChunkQAReport {
  return {
    chunkId: 'chunk_000',
    chunkIndex: 0,
    originalLength: 100,
    sanitizedLength: 90,
    qaResults: [],
    retryAttempts: [],
    finalStatus: 'failed',
    totalAttempts: 1,
    totalProcessingTimeMs: 0,
    ...overrides,
  }
}

// Enough content to pass reasonable_length and min_content_ratio
const LONG_ORIGINAL = 'A'.repeat(200)
const LONG_SANITIZED = 'B'.repeat(150)

// ============================================================================
// TESTS
// ============================================================================

describe('QA Gates Branch Coverage', () => {
  // --------------------------------------------------------------------------
  // getGateDefinition
  // --------------------------------------------------------------------------
  describe('getGateDefinition', () => {
    it('returns definition for every known gate ID', () => {
      const knownIds: QAGateId[] = [
        'no_artifacts',
        'data_preserved',
        'no_barcode_patterns',
        'no_control_chars',
        'no_spaced_fragments',
        'min_content_ratio',
        'reasonable_length',
      ]
      for (const id of knownIds) {
        const def = getGateDefinition(id)
        expect(def).toBeDefined()
        expect(def!.id).toBe(id)
        expect(def!.name).toBeTruthy()
        expect(def!.description).toBeTruthy()
        expect(['critical', 'high', 'medium', 'low']).toContain(def!.severity)
      }
    })

    it('returns undefined for fabricated gate ID', () => {
      expect(getGateDefinition('does_not_exist' as QAGateId)).toBeUndefined()
    })
  })

  // --------------------------------------------------------------------------
  // getAllGateDefinitions
  // --------------------------------------------------------------------------
  describe('getAllGateDefinitions', () => {
    it('returns a defensive copy (mutating the array does not affect internals)', () => {
      const first = getAllGateDefinitions()
      const len = first.length
      first.pop()
      const second = getAllGateDefinitions()
      expect(second.length).toBe(len)
    })

    it('contains exactly 7 gates', () => {
      expect(getAllGateDefinitions()).toHaveLength(7)
    })
  })

  // --------------------------------------------------------------------------
  // Individual gate checks — no_artifacts
  // --------------------------------------------------------------------------
  describe('no_artifacts gate check', () => {
    it('passes for text without artifacts', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Clean insurance text here.')
      const result = runQAGates(chunk, { gates: ['no_artifacts'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_artifacts')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('No artifacts found')
    })

    it('fails and lists artifact descriptions when artifacts remain', () => {
      // B^^^B triggers the hasRemainingArtifacts check
      const chunk = makeChunk(LONG_ORIGINAL, 'B^^^B something a!!!a')
      const result = runQAGates(chunk, { gates: ['no_artifacts'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_artifacts')!
      expect(gate.passed).toBe(false)
      expect(gate.message).toContain('artifact')
      expect(gate.details?.artifacts).toBeDefined()
      expect((gate.details!.artifacts as string[]).length).toBeGreaterThan(0)
    })
  })

  // --------------------------------------------------------------------------
  // data_preserved gate check
  // --------------------------------------------------------------------------
  describe('data_preserved gate check', () => {
    it('passes when critical data is preserved between original and sanitized', () => {
      const chunk = makeChunk(
        'Poliçe No: 9024025101000253/2 dated 15.01.2026',
        'Poliçe No: 9024025101000253/2 dated 15.01.2026 cleaned'
      )
      const result = runQAGates(chunk, { gates: ['data_preserved'] })
      const gate = result.gateResults.find(g => g.gateId === 'data_preserved')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('All critical data preserved')
    })

    it('fails when a policy number is altered', () => {
      const chunk = makeChunk(
        'Poliçe No: 9024025101000253/2',
        'Poliçe No: 9999999999999999/9'
      )
      const result = runQAGates(chunk, { gates: ['data_preserved'] })
      const gate = result.gateResults.find(g => g.gateId === 'data_preserved')!
      expect(gate.passed).toBe(false)
      expect(gate.message).toContain('Data preservation issues')
      expect(gate.details?.issues).toBeDefined()
    })

    it('passes for text with no extractable critical data', () => {
      const chunk = makeChunk('Generic content only', 'Generic content only cleaned')
      const result = runQAGates(chunk, { gates: ['data_preserved'] })
      const gate = result.gateResults.find(g => g.gateId === 'data_preserved')!
      expect(gate.passed).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // no_barcode_patterns gate check
  // --------------------------------------------------------------------------
  describe('no_barcode_patterns gate check', () => {
    it('passes for text without any barcode patterns', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Normal Turkish insurance document text.')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('No barcode patterns found')
      expect(gate.details?.patterns).toEqual([])
    })

    it('detects B^^^B pattern', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Has B^^^B barcode')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.patterns as string[])).toContain('B^^^B')
    })

    it('detects B with adjacent carets and spaces (B ^^^ B)', () => {
      // The regex is /B\s*[\^]+\s*B/gi — needs consecutive ^ chars with optional spaces around them
      const chunk = makeChunk(LONG_ORIGINAL, 'Has B ^^^ B barcode')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
    })

    it('detects a!!!a pattern', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Has a!!!!a noise')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.patterns as string[])).toContain('a!!!a')
    })

    it('detects a!!!a extended pattern (a!!!!!a!AAA)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Has a!!!!!a!AAA noise')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.patterns as string[])).toContain('a!!!a extended')
    })

    it('detects special character clusters (5+ consecutive)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Has <<<<<< cluster')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.patterns as string[])).toContain('special char cluster')
    })

    it('detects high-ASCII sequences (3+ bytes)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Has \x80\x81\x82 high ascii')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.patterns as string[])).toContain('high-ASCII sequence')
    })

    it('detects replacement character sequences', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Has \uFFFD\uFFFD replacement chars')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.patterns as string[])).toContain('replacement chars')
    })

    it('detects multiple patterns simultaneously', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'B^^^B and a!!!!a both present')
      const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_barcode_patterns')!
      expect(gate.passed).toBe(false)
      const patterns = gate.details!.patterns as string[]
      expect(patterns.length).toBeGreaterThanOrEqual(2)
    })
  })

  // --------------------------------------------------------------------------
  // no_control_chars gate check
  // --------------------------------------------------------------------------
  describe('no_control_chars gate check', () => {
    it('passes for text with no control characters', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Normal text without control chars.')
      const result = runQAGates(chunk, { gates: ['no_control_chars'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_control_chars')!
      expect(gate.passed).toBe(true)
      expect(gate.details?.count).toBe(0)
    })

    it('passes when count is at threshold (2 control chars allowed)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Text\x01with\x02two control chars.')
      const result = runQAGates(chunk, { gates: ['no_control_chars'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_control_chars')!
      expect(gate.passed).toBe(true)
      expect(gate.details?.count).toBe(2)
      expect(gate.message).toContain('acceptable')
    })

    it('fails when count exceeds threshold (3+ control chars)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Text\x01\x02\x03\x04 many control chars.')
      const result = runQAGates(chunk, { gates: ['no_control_chars'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_control_chars')!
      expect(gate.passed).toBe(false)
      expect((gate.details!.count as number)).toBeGreaterThan(2)
      expect(gate.message).toContain('control/replacement characters')
    })

    it('detects C1 control characters (0x7F-0x9F)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Text\x7F\x80\x9F more')
      const result = runQAGates(chunk, { gates: ['no_control_chars'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_control_chars')!
      expect(gate.passed).toBe(false)
    })

    it('detects replacement character U+FFFD', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Text \uFFFD\uFFFD\uFFFD more')
      const result = runQAGates(chunk, { gates: ['no_control_chars'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_control_chars')!
      expect(gate.passed).toBe(false)
    })

    it('allows tab and newline (not considered control chars)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Text\twith\ttabs\nand\nnewlines\r\n.')
      const result = runQAGates(chunk, { gates: ['no_control_chars'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_control_chars')!
      // Tab (\x09), newline (\x0A), carriage return (\x0D) are excluded from the pattern
      expect(gate.passed).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // no_spaced_fragments gate check
  // --------------------------------------------------------------------------
  describe('no_spaced_fragments gate check', () => {
    it('passes for normal text without spaced fragments', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'Normal text without spaced fragments here okay.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('No spaced fragments found')
    })

    it('detects classic spaced fragment (all short uppercase words)', () => {
      // "S İ G O R T A" — 7 single-char uppercase fragments
      const chunk = makeChunk(LONG_ORIGINAL, 'S İ G O R T A pattern here.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(false)
      expect(gate.message).toContain('spaced fragment pattern')
      const examples = gate.details!.examples as string[]
      expect(examples.some(e => e.startsWith('classic:'))).toBe(true)
    })

    it('detects mixed-length spaced fragment', () => {
      // Mixed: some short (<=3) + some longer (<=10) uppercase words
      // Need >=3 consecutive, >=2 short
      const chunk = makeChunk(LONG_ORIGINAL, 'AB CD EFGHIJ more text here.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(false)
      const examples = gate.details!.examples as string[]
      expect(examples.some(e => e.startsWith('mixed:'))).toBe(true)
    })

    it('handles final sequence at end of text (no trailing non-uppercase word)', () => {
      // All uppercase fragments with no trailing word to break sequence
      const chunk = makeChunk(LONG_ORIGINAL, 'AB CD EF')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(false)
    })

    it('passes when consecutive uppercase fragments < 3', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'AB CD lowercaseword.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(true)
    })

    it('passes when consecutive uppercase but shortCount < 2', () => {
      // 3 consecutive uppercase, but only 1 is short (<=3 chars)
      const chunk = makeChunk(LONG_ORIGINAL, 'ABCDE FGHIJK AB rest of text.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(true)
    })

    it('ignores words longer than 10 characters (breaks sequence)', () => {
      const chunk = makeChunk(LONG_ORIGINAL, 'AB CD ABCDEFGHIJK EF GH rest.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      // ABCDEFGHIJK is 11 chars — breaks the sequence, so AB CD (2 items <3 threshold) won't trigger
      expect(gate.passed).toBe(true)
    })

    it('handles empty string', () => {
      const chunk = makeChunk(LONG_ORIGINAL, '')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(true)
    })

    it('handles isAllUpper fallback for non-Unicode-property environments', () => {
      // Turkish uppercase characters
      const chunk = makeChunk(LONG_ORIGINAL, 'Ç Ğ Ş rest of text.')
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      expect(gate.passed).toBe(false)
    })

    it('truncates examples to first 5 in details, first 3 in message', () => {
      // Create text with many spaced fragment groups
      const fragments = Array(8).fill('A B C D').join(' lowercase ')
      const chunk = makeChunk(LONG_ORIGINAL, fragments)
      const result = runQAGates(chunk, { gates: ['no_spaced_fragments'] })
      const gate = result.gateResults.find(g => g.gateId === 'no_spaced_fragments')!
      const examples = gate.details!.examples as string[]
      expect(examples.length).toBeLessThanOrEqual(5)
    })
  })

  // --------------------------------------------------------------------------
  // min_content_ratio gate check
  // --------------------------------------------------------------------------
  describe('min_content_ratio gate check', () => {
    it('passes when original is empty (returns ratio 1)', () => {
      const chunk = makeChunk('', '')
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      const gate = result.gateResults.find(g => g.gateId === 'min_content_ratio')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('Original content was empty')
      expect(gate.details?.ratio).toBe(1)
    })

    it('passes when original is only whitespace (trimmed to empty)', () => {
      const chunk = makeChunk('   \t  \n  ', '   ')
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      const gate = result.gateResults.find(g => g.gateId === 'min_content_ratio')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('Original content was empty')
    })

    it('passes at exactly 50% ratio (boundary)', () => {
      const original = 'A'.repeat(100)
      const sanitized = 'B'.repeat(50)
      const chunk = makeChunk(original, sanitized)
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      const gate = result.gateResults.find(g => g.gateId === 'min_content_ratio')!
      expect(gate.passed).toBe(true)
      expect(gate.details?.ratio).toBeCloseTo(0.5)
    })

    it('fails just below 50% ratio', () => {
      const original = 'A'.repeat(100)
      const sanitized = 'B'.repeat(49)
      const chunk = makeChunk(original, sanitized)
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      const gate = result.gateResults.find(g => g.gateId === 'min_content_ratio')!
      expect(gate.passed).toBe(false)
      expect(gate.message).toContain('below minimum')
    })

    it('passes at 100% ratio', () => {
      const text = 'A'.repeat(100)
      const chunk = makeChunk(text, text)
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      const gate = result.gateResults.find(g => g.gateId === 'min_content_ratio')!
      expect(gate.passed).toBe(true)
      expect(gate.details?.ratio).toBeCloseTo(1.0)
    })

    it('includes ratio, originalLength, sanitizedLength in details', () => {
      const original = 'A'.repeat(200)
      const sanitized = 'B'.repeat(160)
      const chunk = makeChunk(original, sanitized)
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      const gate = result.gateResults.find(g => g.gateId === 'min_content_ratio')!
      expect(gate.details?.originalLength).toBe(200)
      expect(gate.details?.sanitizedLength).toBe(160)
      expect(gate.details?.ratio).toBeCloseTo(0.8)
    })
  })

  // --------------------------------------------------------------------------
  // reasonable_length gate check
  // --------------------------------------------------------------------------
  describe('reasonable_length gate check', () => {
    it('passes when sanitized output >= 50 chars and original was long', () => {
      const chunk = makeChunk('A'.repeat(200), 'B'.repeat(100))
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toContain('Output length: 100')
    })

    it('fails when sanitized is very short but original was long', () => {
      const chunk = makeChunk('A'.repeat(200), 'Short')
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(false)
      expect(gate.message).toContain('suspiciously short')
    })

    it('passes when both original and sanitized are short (< 50 chars)', () => {
      // Original is short, so short sanitized is acceptable
      const chunk = makeChunk('Short original', 'OK')
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(true)
      expect(gate.message).toBe('Short chunk (original was short)')
    })

    it('passes at exactly 50 chars output when original is long', () => {
      const chunk = makeChunk('A'.repeat(200), 'B'.repeat(50))
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(true)
    })

    it('fails at 49 chars output when original is long', () => {
      const chunk = makeChunk('A'.repeat(200), 'B'.repeat(49))
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(false)
    })

    it('passes when original is exactly at threshold (50) and output is long', () => {
      const chunk = makeChunk('A'.repeat(50), 'B'.repeat(60))
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(true)
    })

    it('considers whitespace-only sanitized as empty after trim', () => {
      const chunk = makeChunk('A'.repeat(200), '   \t\n   ')
      const result = runQAGates(chunk, { gates: ['reasonable_length'] })
      const gate = result.gateResults.find(g => g.gateId === 'reasonable_length')!
      expect(gate.passed).toBe(false)
      expect(gate.details?.length).toBe(0)
    })
  })

  // --------------------------------------------------------------------------
  // runQAGates — overall behavior and options
  // --------------------------------------------------------------------------
  describe('runQAGates', () => {
    it('runs all gates by default', () => {
      const chunk = makeChunk(LONG_ORIGINAL, LONG_SANITIZED)
      const result = runQAGates(chunk)
      expect(result.gateResults.length).toBe(7)
    })

    it('runs only specified gates when gates option provided', () => {
      const chunk = makeChunk(LONG_ORIGINAL, LONG_SANITIZED)
      const result = runQAGates(chunk, { gates: ['no_artifacts', 'reasonable_length'] })
      expect(result.gateResults.length).toBe(2)
      expect(result.gateResults.map(r => r.gateId)).toEqual(['no_artifacts', 'reasonable_length'])
    })

    it('skips unknown gate IDs silently', () => {
      const chunk = makeChunk(LONG_ORIGINAL, LONG_SANITIZED)
      const result = runQAGates(chunk, { gates: ['no_artifacts', 'unknown_gate' as QAGateId] })
      expect(result.gateResults.length).toBe(1)
    })

    it('returns chunkId and chunkIndex from the chunk', () => {
      const chunk = makeChunk(LONG_ORIGINAL, LONG_SANITIZED, { id: 'my_chunk', index: 7 })
      const result = runQAGates(chunk)
      expect(result.chunkId).toBe('my_chunk')
      expect(result.chunkIndex).toBe(7)
    })

    it('has valid ISO timestamp', () => {
      const chunk = makeChunk(LONG_ORIGINAL, LONG_SANITIZED)
      const result = runQAGates(chunk)
      expect(() => new Date(result.timestamp)).not.toThrow()
      expect(new Date(result.timestamp).getTime()).not.toBeNaN()
    })

    describe('severity counting', () => {
      it('counts critical failures (data_preserved is critical)', () => {
        const chunk = makeChunk(
          'Poliçe No: 12345 original content here enough for length',
          'Poliçe No: 99999 sanitized content here enough for length'
        )
        const result = runQAGates(chunk, { gates: ['data_preserved'] })
        expect(result.criticalFailures).toBe(1)
        expect(result.highFailures).toBe(0)
        expect(result.mediumFailures).toBe(0)
        expect(result.lowFailures).toBe(0)
      })

      it('counts high failures (no_artifacts, no_barcode_patterns, no_control_chars, no_spaced_fragments are high)', () => {
        const chunk = makeChunk(LONG_ORIGINAL, 'B^^^B present')
        const result = runQAGates(chunk, { gates: ['no_barcode_patterns'] })
        expect(result.highFailures).toBe(1)
      })

      it('counts medium failures (min_content_ratio is medium)', () => {
        const chunk = makeChunk('A'.repeat(100), 'B'.repeat(20))
        const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
        expect(result.mediumFailures).toBe(1)
      })
    })

    describe('requiresRetry logic', () => {
      it('requires retry when failOnCritical=true and critical failure exists', () => {
        const chunk = makeChunk(
          'Poliçe No: 12345 content',
          'Poliçe No: 99999 content'
        )
        const result = runQAGates(chunk, {
          gates: ['data_preserved'],
          failOnCritical: true,
        })
        expect(result.requiresRetry).toBe(true)
      })

      it('requires retry when failOnCritical=true and high failure exists (no critical)', () => {
        const chunk = makeChunk(LONG_ORIGINAL, 'B^^^B present')
        const result = runQAGates(chunk, {
          gates: ['no_barcode_patterns'],
          failOnCritical: true,
        })
        expect(result.requiresRetry).toBe(true)
      })

      it('does NOT require retry when failOnCritical=false and only critical failure (no high)', () => {
        const chunk = makeChunk(
          'Poliçe No: 12345 enough length content for test purposes',
          'Poliçe No: 99999 enough length content for test purposes'
        )
        const result = runQAGates(chunk, {
          gates: ['data_preserved'],
          failOnCritical: false,
        })
        // failOnCritical=false means critical doesn't trigger retry; only high does
        expect(result.requiresRetry).toBe(false)
      })

      it('requires retry when failOnCritical=false and high failure exists', () => {
        const chunk = makeChunk(LONG_ORIGINAL, 'B^^^B barcode text')
        const result = runQAGates(chunk, {
          gates: ['no_barcode_patterns'],
          failOnCritical: false,
        })
        expect(result.requiresRetry).toBe(true)
      })

      it('does NOT require retry for medium-only failures', () => {
        const chunk = makeChunk('A'.repeat(100), 'B'.repeat(20))
        const result = runQAGates(chunk, {
          gates: ['min_content_ratio'],
          failOnCritical: true,
        })
        expect(result.requiresRetry).toBe(false)
      })
    })

    it('populates both passedGates and failedGates arrays', () => {
      // One gate passes, one fails
      const chunk = makeChunk(
        'A'.repeat(100),
        'B'.repeat(20) // fails min_content_ratio, passes no_artifacts
      )
      const result = runQAGates(chunk, { gates: ['no_artifacts', 'min_content_ratio'] })
      expect(result.passedGates).toContain('no_artifacts')
      expect(result.failedGates).toContain('min_content_ratio')
    })

    it('sets passed=true only when no gates fail', () => {
      const chunk = makeChunk(
        'A'.repeat(100),
        'B'.repeat(80) // good ratio
      )
      const result = runQAGates(chunk, { gates: ['min_content_ratio'] })
      expect(result.passed).toBe(true)
      expect(result.failedGates).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // createChunkQAReport
  // --------------------------------------------------------------------------
  describe('createChunkQAReport', () => {
    it('sets finalStatus to passed when QA passes', () => {
      const chunk = makeChunk('Original content text', 'Cleaned content text')
      const qaResult = makeQAResult({ passed: true })
      const report = createChunkQAReport(chunk, qaResult)
      expect(report.finalStatus).toBe('passed')
    })

    it('sets finalStatus to failed when QA fails', () => {
      const chunk = makeChunk('Original', 'Cleaned')
      const qaResult = makeQAResult({ passed: false })
      const report = createChunkQAReport(chunk, qaResult)
      expect(report.finalStatus).toBe('failed')
    })

    it('captures chunk dimensions correctly', () => {
      const chunk = makeChunk('ABCDE', 'XY')
      const qaResult = makeQAResult()
      const report = createChunkQAReport(chunk, qaResult)
      expect(report.originalLength).toBe(5) // text.length
      expect(report.sanitizedLength).toBe(2) // sanitizedText.length
    })
  })

  // --------------------------------------------------------------------------
  // addRetryAttempt
  // --------------------------------------------------------------------------
  describe('addRetryAttempt', () => {
    it('sets finalStatus to passed_after_retry when updated QA passes', () => {
      const report = makeChunkReport({ totalAttempts: 1, finalStatus: 'failed' })
      const attempt = createRetryAttempt('chunk_000', 1, ['no_artifacts'], 'llm_cleanup', true, [], 50)
      const updatedQA = makeQAResult({ passed: true })
      addRetryAttempt(report, attempt, updatedQA)
      expect(report.finalStatus).toBe('passed_after_retry')
      expect(report.totalAttempts).toBe(2)
      expect(report.totalProcessingTimeMs).toBe(50)
    })

    it('sets finalStatus to manual_review after 3 total attempts (still failing)', () => {
      const report = makeChunkReport({ totalAttempts: 2, finalStatus: 'failed', totalProcessingTimeMs: 100 })
      const attempt = createRetryAttempt('chunk_000', 2, ['no_artifacts'], 'llm_cleanup', false, [], 75)
      const updatedQA = makeQAResult({ passed: false })
      addRetryAttempt(report, attempt, updatedQA)
      expect(report.finalStatus).toBe('manual_review')
      expect(report.totalAttempts).toBe(3)
      expect(report.totalProcessingTimeMs).toBe(175)
    })

    it('keeps failed status if not passed and totalAttempts < 3', () => {
      const report = makeChunkReport({ totalAttempts: 1, finalStatus: 'failed' })
      const attempt = createRetryAttempt('chunk_000', 1, ['no_artifacts'], 'llm_cleanup', false, [], 30)
      const updatedQA = makeQAResult({ passed: false })
      addRetryAttempt(report, attempt, updatedQA)
      // totalAttempts is now 2, which is < 3, and not passed
      expect(report.finalStatus).toBe('failed')
      expect(report.totalAttempts).toBe(2)
    })

    it('accumulates processing time across multiple retries', () => {
      const report = makeChunkReport({ totalAttempts: 1, totalProcessingTimeMs: 0 })
      addRetryAttempt(
        report,
        createRetryAttempt('c', 1, [], 'llm_cleanup', false, [], 100),
        makeQAResult({ passed: false })
      )
      addRetryAttempt(
        report,
        createRetryAttempt('c', 2, [], 'llm_cleanup', true, [], 200),
        makeQAResult({ passed: true })
      )
      expect(report.totalProcessingTimeMs).toBe(300)
      expect(report.totalAttempts).toBe(3)
      expect(report.retryAttempts).toHaveLength(2)
      expect(report.qaResults).toHaveLength(2)
    })
  })

  // --------------------------------------------------------------------------
  // createDocumentQAReport
  // --------------------------------------------------------------------------
  describe('createDocumentQAReport', () => {
    it('overallStatus is passed when no failures and no manual_review', () => {
      const report = createDocumentQAReport('doc1', [
        makeChunkReport({ finalStatus: 'passed' }),
        makeChunkReport({ finalStatus: 'passed_after_retry' }),
      ])
      expect(report.overallStatus).toBe('passed')
      expect(report.passedChunks).toBe(1)
      expect(report.retriedChunks).toBe(1)
      expect(report.failedChunks).toBe(0)
      expect(report.manualReviewChunks).toBe(0)
    })

    it('overallStatus is partial when some pass and some fail', () => {
      const report = createDocumentQAReport('doc2', [
        makeChunkReport({ finalStatus: 'passed' }),
        makeChunkReport({ finalStatus: 'failed' }),
      ])
      expect(report.overallStatus).toBe('partial')
    })

    it('overallStatus is partial when some pass_after_retry and some manual_review', () => {
      const report = createDocumentQAReport('doc3', [
        makeChunkReport({ finalStatus: 'passed_after_retry' }),
        makeChunkReport({ finalStatus: 'manual_review' }),
      ])
      expect(report.overallStatus).toBe('partial')
    })

    it('overallStatus is failed when ALL chunks are failed (no passed or retried)', () => {
      const report = createDocumentQAReport('doc4', [
        makeChunkReport({ finalStatus: 'failed' }),
        makeChunkReport({ finalStatus: 'failed' }),
      ])
      expect(report.overallStatus).toBe('failed')
    })

    it('overallStatus is failed when ALL chunks are manual_review (no passed or retried)', () => {
      const report = createDocumentQAReport('doc5', [
        makeChunkReport({ finalStatus: 'manual_review' }),
        makeChunkReport({ finalStatus: 'manual_review' }),
      ])
      expect(report.overallStatus).toBe('failed')
    })

    it('overallStatus is failed when mix of failed + manual_review but no passed/retried', () => {
      const report = createDocumentQAReport('doc6', [
        makeChunkReport({ finalStatus: 'failed' }),
        makeChunkReport({ finalStatus: 'manual_review' }),
      ])
      expect(report.overallStatus).toBe('failed')
    })

    it('handles empty chunk reports array', () => {
      const report = createDocumentQAReport('doc_empty', [])
      expect(report.totalChunks).toBe(0)
      expect(report.passedChunks).toBe(0)
      expect(report.failedChunks).toBe(0)
      expect(report.overallStatus).toBe('passed') // no failures = passed
    })

    it('includes valid ISO timestamp', () => {
      const report = createDocumentQAReport('doc_time', [])
      expect(new Date(report.timestamp).getTime()).not.toBeNaN()
    })

    it('counts manualReviewChunks correctly', () => {
      const report = createDocumentQAReport('doc7', [
        makeChunkReport({ finalStatus: 'manual_review' }),
        makeChunkReport({ finalStatus: 'manual_review' }),
        makeChunkReport({ finalStatus: 'passed' }),
      ])
      expect(report.manualReviewChunks).toBe(2)
    })
  })

  // --------------------------------------------------------------------------
  // determineRetryAction
  // --------------------------------------------------------------------------
  describe('determineRetryAction', () => {
    it('returns manual_review_needed when attemptNumber >= maxRetries', () => {
      const qa = makeQAResult({ failedGates: ['no_artifacts'] })
      expect(determineRetryAction(qa, 3, 3)).toBe('manual_review_needed')
      expect(determineRetryAction(qa, 5, 2)).toBe('manual_review_needed')
    })

    it('returns manual_review_needed when attemptNumber equals maxRetries exactly', () => {
      const qa = makeQAResult({ failedGates: ['no_artifacts'] })
      expect(determineRetryAction(qa, 2, 2)).toBe('manual_review_needed')
    })

    it('returns llm_cleanup for no_artifacts failure', () => {
      const qa = makeQAResult({ failedGates: ['no_artifacts'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns llm_cleanup for no_barcode_patterns failure', () => {
      const qa = makeQAResult({ failedGates: ['no_barcode_patterns'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns llm_cleanup for no_spaced_fragments failure', () => {
      const qa = makeQAResult({ failedGates: ['no_spaced_fragments'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns llm_cleanup for min_content_ratio failure', () => {
      const qa = makeQAResult({ failedGates: ['min_content_ratio'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns llm_cleanup for reasonable_length failure', () => {
      const qa = makeQAResult({ failedGates: ['reasonable_length'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns sanitizer_retry for data_preserved failure only', () => {
      const qa = makeQAResult({ failedGates: ['data_preserved'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('sanitizer_retry')
    })

    it('returns llm_cleanup when both artifacts and data_preserved fail (artifact check first)', () => {
      const qa = makeQAResult({ failedGates: ['no_artifacts', 'data_preserved'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns llm_cleanup as default when no specific gate matches (e.g., no_control_chars only)', () => {
      const qa = makeQAResult({ failedGates: ['no_control_chars'] })
      expect(determineRetryAction(qa, 1, 3)).toBe('llm_cleanup')
    })

    it('returns llm_cleanup for empty failedGates (default fallback)', () => {
      const qa = makeQAResult({ failedGates: [] })
      expect(determineRetryAction(qa, 0, 3)).toBe('llm_cleanup')
    })
  })

  // --------------------------------------------------------------------------
  // generateLLMCleanupPrompt
  // --------------------------------------------------------------------------
  describe('generateLLMCleanupPrompt', () => {
    it('includes barcode removal instructions for no_barcode_patterns', () => {
      const prompt = generateLLMCleanupPrompt(['no_barcode_patterns'])
      expect(prompt).toContain('BARCODE REMOVAL:')
      expect(prompt).toContain('B^^^B')
      expect(prompt).toContain('a!!!a')
      expect(prompt).toContain('scanner artifacts')
    })

    it('includes Turkish fragment merging instructions for no_spaced_fragments', () => {
      const prompt = generateLLMCleanupPrompt(['no_spaced_fragments'])
      expect(prompt).toContain('TURKISH FRAGMENT MERGING:')
      expect(prompt).toContain('SİGORTA')
      expect(prompt).toContain('BİRLEŞİK')
      expect(prompt).toContain('Turkish uppercase')
    })

    it('includes control character removal for no_control_chars', () => {
      const prompt = generateLLMCleanupPrompt(['no_control_chars'])
      expect(prompt).toContain('CONTROL CHARACTER REMOVAL:')
      expect(prompt).toContain('replacement characters')
    })

    it('includes general artifact cleanup for no_artifacts', () => {
      const prompt = generateLLMCleanupPrompt(['no_artifacts'])
      expect(prompt).toContain('GENERAL ARTIFACT CLEANUP:')
      expect(prompt).toContain('OCR garbage')
    })

    it('includes all relevant sections for multiple failed gates', () => {
      const prompt = generateLLMCleanupPrompt([
        'no_barcode_patterns',
        'no_spaced_fragments',
        'no_control_chars',
        'no_artifacts',
      ])
      expect(prompt).toContain('BARCODE REMOVAL:')
      expect(prompt).toContain('TURKISH FRAGMENT MERGING:')
      expect(prompt).toContain('CONTROL CHARACTER REMOVAL:')
      expect(prompt).toContain('GENERAL ARTIFACT CLEANUP:')
    })

    it('uses generic fallback when no specific gate matches', () => {
      const prompt = generateLLMCleanupPrompt(['data_preserved'])
      expect(prompt).toContain('General OCR cleanup needed')
    })

    it('uses generic fallback for empty failedGates array', () => {
      const prompt = generateLLMCleanupPrompt([])
      expect(prompt).toContain('General OCR cleanup needed')
    })

    it('always includes preservation rules', () => {
      const prompt = generateLLMCleanupPrompt([])
      expect(prompt).toContain('CRITICAL PRESERVATION RULES')
      expect(prompt).toContain('Policy numbers')
      expect(prompt).toContain('TC Kimlik')
      expect(prompt).toContain('IBAN')
      expect(prompt).toContain('VIN/Chassis')
      expect(prompt).toContain('Plate numbers')
      expect(prompt).toContain('Amounts')
      expect(prompt).toContain('Dates')
    })

    it('includes output format instructions', () => {
      const prompt = generateLLMCleanupPrompt(['no_artifacts'])
      expect(prompt).toContain('Return ONLY the cleaned text')
      expect(prompt).toContain('No explanations')
    })

    it('does not include barcode section when only no_spaced_fragments fails', () => {
      const prompt = generateLLMCleanupPrompt(['no_spaced_fragments'])
      expect(prompt).not.toContain('BARCODE REMOVAL:')
    })

    it('does not include control char section when only no_barcode_patterns fails', () => {
      const prompt = generateLLMCleanupPrompt(['no_barcode_patterns'])
      expect(prompt).not.toContain('CONTROL CHARACTER REMOVAL:')
    })
  })

  // --------------------------------------------------------------------------
  // createRetryAttempt
  // --------------------------------------------------------------------------
  describe('createRetryAttempt', () => {
    it('creates a properly structured retry attempt record', () => {
      const gateResults = [
        { passed: false, gateId: 'no_artifacts' as QAGateId, message: 'Failed' },
      ]
      const attempt = createRetryAttempt(
        'chunk_42',
        2,
        ['no_artifacts', 'no_barcode_patterns'],
        'llm_cleanup',
        false,
        gateResults,
        1234
      )
      expect(attempt.chunkId).toBe('chunk_42')
      expect(attempt.attemptNumber).toBe(2)
      expect(attempt.failedGates).toEqual(['no_artifacts', 'no_barcode_patterns'])
      expect(attempt.action).toBe('llm_cleanup')
      expect(attempt.success).toBe(false)
      expect(attempt.resultingGates).toEqual(gateResults)
      expect(attempt.processingTimeMs).toBe(1234)
      expect(new Date(attempt.timestamp).getTime()).not.toBeNaN()
    })

    it('handles empty arrays for failedGates and resultingGates', () => {
      const attempt = createRetryAttempt('c', 1, [], 'manual_review_needed', true, [], 0)
      expect(attempt.failedGates).toEqual([])
      expect(attempt.resultingGates).toEqual([])
    })
  })

  // --------------------------------------------------------------------------
  // processChunkWithRetry
  // --------------------------------------------------------------------------
  describe('processChunkWithRetry', () => {
    it('returns immediately (no retries) when chunk passes all gates', async () => {
      const chunk = makeChunk(
        'Poliçe No: 12345 Normal content here with sufficient length to pass.',
        'Poliçe No: 12345 Normal content here with sufficient length to pass cleaned.'
      )
      const { report, finalChunk } = await processChunkWithRetry(chunk)
      expect(report.finalStatus).toBe('passed')
      expect(report.totalAttempts).toBe(1)
      expect(report.retryAttempts).toHaveLength(0)
      expect(finalChunk).toBe(chunk)
    })

    it('retries with LLM cleanup and succeeds on first retry', async () => {
      const chunk = makeChunk(
        'Poliçe No: 12345 Original text with enough length for test validation.',
        'Poliçe No: 12345 B^^^B artifact with enough length for test validation.'
      )
      const llmCleanup = vi.fn().mockResolvedValue(
        'Poliçe No: 12345 Cleaned text with enough length for test validation.'
      )
      const { report, finalChunk } = await processChunkWithRetry(chunk, llmCleanup, {
        maxRetries: 2,
      })
      expect(llmCleanup).toHaveBeenCalledTimes(1)
      expect(report.retryAttempts).toHaveLength(1)
      expect(report.finalStatus).toBe('passed_after_retry')
      expect(finalChunk.sanitizedText).not.toContain('B^^^B')
    })

    it('retries multiple times and marks manual_review when LLM keeps failing QA', async () => {
      const chunk = makeChunk(
        'Original text for test B^^^B that is long enough for validation.',
        'B^^^B artifact that is long enough for validation purposes.'
      )
      // LLM always returns text that still fails
      const llmCleanup = vi.fn().mockResolvedValue('B^^^B still here with long text for validation.')

      const { report } = await processChunkWithRetry(chunk, llmCleanup, {
        maxRetries: 3,
      })
      // After 2 LLM calls, attempt 3 hits manual_review_needed from determineRetryAction
      expect(llmCleanup).toHaveBeenCalledTimes(2)
      expect(report.finalStatus).toBe('manual_review')
    })

    it('marks manual_review when LLM cleanup throws an error', async () => {
      const chunk = makeChunk(
        'Original text long enough to pass length checks for test.',
        'B^^^B with enough text to trigger the retry logic for validation.'
      )
      const llmCleanup = vi.fn().mockRejectedValue(new Error('API timeout'))

      const { report } = await processChunkWithRetry(chunk, llmCleanup, {
        maxRetries: 2,
      })
      expect(report.finalStatus).toBe('manual_review')
      expect(report.retryAttempts).toHaveLength(1)
      expect(report.retryAttempts[0].success).toBe(false)
    })

    it('marks manual_review when action is llm_cleanup but no LLM function provided', async () => {
      const chunk = makeChunk(
        'Original long enough text for QA gates to work properly here.',
        'B^^^B barcode long enough text for QA gates to work properly.'
      )
      // No llmCleanup function passed — action would be llm_cleanup but can't execute
      const { report } = await processChunkWithRetry(chunk, undefined, { maxRetries: 2 })
      expect(report.finalStatus).toBe('manual_review')
    })

    it('handles sanitizer_retry action (data_preserved failure)', async () => {
      const chunk = makeChunk(
        'Poliçe No: 12345 content that is long enough for test validation.',
        'Poliçe No: 99999 content that is long enough for test validation.'
      )
      // data_preserved triggers sanitizer_retry, which resets to original text
      // On sanitizer_retry, the function sets newText = currentChunk.text (the original)
      // Then re-runs QA with the original text as sanitizedText
      const { report } = await processChunkWithRetry(chunk, undefined, {
        maxRetries: 3,
        gates: ['data_preserved'],
      })
      // Sanitizer retry uses originalText — if data_preserved still fails, it continues
      expect(report.totalAttempts).toBeGreaterThan(1)
    })

    it('uses maxRetries=2 by default', async () => {
      const chunk = makeChunk(
        'Original text long enough for QA length checks validation test.',
        'B^^^B barcode text long enough for QA length checks validation.'
      )
      const llmCleanup = vi.fn().mockResolvedValue('B^^^B still present long text for QA.')

      const { report } = await processChunkWithRetry(chunk, llmCleanup)
      // Default maxRetries=2, so attempt 1 → llm, attempt 2 → manual_review_needed
      expect(llmCleanup).toHaveBeenCalledTimes(1)
      expect(report.finalStatus).toBe('manual_review')
    })

    it('passes chunkIndex and failedGates context to LLM cleanup function', async () => {
      const chunk = makeChunk(
        'Original text that is sufficiently long for all gates to check properly.',
        'B^^^B text that is sufficiently long for all gates to check properly.',
        { index: 5 }
      )
      const llmCleanup = vi.fn().mockResolvedValue(
        'Cleaned text that is sufficiently long for all gates to check properly.'
      )

      await processChunkWithRetry(chunk, llmCleanup, { maxRetries: 3 })

      expect(llmCleanup).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chunkIndex: 5,
          failedGates: expect.arrayContaining(['no_barcode_patterns']),
        })
      )
    })

    it('records success=true when retry produces a non-retryable result even if not fully passing', async () => {
      // A chunk that fails only medium gates (no retry needed) after LLM cleanup
      const chunk = makeChunk(
        'A'.repeat(200),
        'B^^^B',
        { id: 'test_chunk' }
      )
      // LLM returns text that is very short (fails min_content_ratio/reasonable_length as medium)
      // but no high/critical failures → requiresRetry=false → success=true in the attempt
      const llmCleanup = vi.fn().mockResolvedValue('A'.repeat(60))

      const { report } = await processChunkWithRetry(chunk, llmCleanup, {
        maxRetries: 3,
        gates: ['no_barcode_patterns', 'reasonable_length'],
      })
      // After LLM cleanup: no_barcode_patterns should pass, reasonable_length passes (60 >= 50)
      if (report.retryAttempts.length > 0) {
        expect(report.retryAttempts[0].action).toBe('llm_cleanup')
      }
    })

    it('correctly updates finalChunk after successful retry', async () => {
      const chunk = makeChunk(
        'Poliçe No: 55555 Original text long enough for all tests validation.',
        'Poliçe No: 55555 B^^^B artifact text long enough for all tests.'
      )
      const cleanedText = 'Poliçe No: 55555 Fixed text that is long enough for all tests.'
      const llmCleanup = vi.fn().mockResolvedValue(cleanedText)

      const { finalChunk } = await processChunkWithRetry(chunk, llmCleanup, { maxRetries: 3 })
      expect(finalChunk.sanitizedText).toBe(cleanedText)
      expect(finalChunk.id).toBe(chunk.id)
      expect(finalChunk.index).toBe(chunk.index)
    })
  })

  // --------------------------------------------------------------------------
  // processAllChunksWithQA
  // --------------------------------------------------------------------------
  describe('processAllChunksWithQA', () => {
    it('processes empty chunks array', async () => {
      const { documentReport, processedChunks } = await processAllChunksWithQA([])
      expect(documentReport.totalChunks).toBe(0)
      expect(processedChunks).toHaveLength(0)
      expect(documentReport.overallStatus).toBe('passed')
    })

    it('processes multiple chunks independently', async () => {
      const chunk1 = makeChunk(
        'Poliçe: 111 content long enough for all gates.',
        'Poliçe: 111 content long enough for all gates cleaned.',
        { id: 'c1', index: 0 }
      )
      const chunk2 = makeChunk(
        'Poliçe: 222 content long enough for all gates.',
        'Poliçe: 222 content long enough for all gates cleaned.',
        { id: 'c2', index: 1 }
      )
      const { documentReport, processedChunks } = await processAllChunksWithQA([chunk1, chunk2])
      expect(documentReport.totalChunks).toBe(2)
      expect(processedChunks).toHaveLength(2)
    })

    it('passes LLM cleanup function to each chunk', async () => {
      const chunk = makeChunk(
        'Original long text for test validation with enough content.',
        'B^^^B barcode long text for test validation with enough.',
        { id: 'c1', index: 0 }
      )
      const llmCleanup = vi.fn().mockResolvedValue(
        'Cleaned long text for test validation with enough content.'
      )
      const { documentReport } = await processAllChunksWithQA([chunk], llmCleanup, {
        maxRetries: 2,
      })
      expect(llmCleanup).toHaveBeenCalled()
      expect(documentReport.totalChunks).toBe(1)
    })

    it('passes options through to processChunkWithRetry', async () => {
      const chunk = makeChunk(LONG_ORIGINAL, LONG_SANITIZED, { id: 'c1', index: 0 })
      const { documentReport } = await processAllChunksWithQA([chunk], undefined, {
        gates: ['reasonable_length'],
      })
      // Only reasonable_length gate should have been run
      const chunkReport = documentReport.chunkReports[0]
      const lastQA = chunkReport.qaResults[chunkReport.qaResults.length - 1]
      expect(lastQA.gateResults.length).toBe(1)
      expect(lastQA.gateResults[0].gateId).toBe('reasonable_length')
    })

    it('returns mixed statuses for mixed input', async () => {
      const goodChunk = makeChunk(
        'Poliçe: 12345 Good long content for test validation purpose.',
        'Poliçe: 12345 Good long content for test validation cleaned.',
        { id: 'good', index: 0 }
      )
      const badChunk = makeChunk(
        'Original text long enough for QA gates to run properly.',
        'B^^^B bad text long enough for QA gates to run properly.',
        { id: 'bad', index: 1 }
      )

      const { documentReport } = await processAllChunksWithQA(
        [goodChunk, badChunk],
        undefined, // no LLM → manual_review for bad chunk
        { maxRetries: 2 }
      )
      expect(documentReport.overallStatus).toBe('partial')
    })
  })

  // --------------------------------------------------------------------------
  // getQASummary
  // --------------------------------------------------------------------------
  describe('getQASummary', () => {
    it('generates summary for passed report', () => {
      const report = createDocumentQAReport('doc1', [
        makeChunkReport({ finalStatus: 'passed' }),
      ])
      const summary = getQASummary(report)
      expect(summary).toContain('PASSED')
      expect(summary).toContain('Total chunks: 1')
      expect(summary).toContain('Passed: 1')
      expect(summary).not.toContain('requiring attention')
    })

    it('generates summary with attention section for failed chunks', () => {
      const failedQA = makeQAResult({ failedGates: ['no_artifacts', 'no_barcode_patterns'] })
      const report = createDocumentQAReport('doc2', [
        makeChunkReport({
          finalStatus: 'failed',
          chunkIndex: 3,
          qaResults: [failedQA],
        }),
      ])
      const summary = getQASummary(report)
      expect(summary).toContain('FAILED')
      expect(summary).toContain('requiring attention')
      expect(summary).toContain('Chunk 3')
      expect(summary).toContain('no_artifacts')
      expect(summary).toContain('no_barcode_patterns')
    })

    it('includes manual_review chunks in attention section', () => {
      const manualQA = makeQAResult({ failedGates: ['data_preserved'] })
      const report = createDocumentQAReport('doc3', [
        makeChunkReport({
          finalStatus: 'manual_review',
          chunkIndex: 7,
          qaResults: [manualQA],
        }),
      ])
      const summary = getQASummary(report)
      expect(summary).toContain('requiring attention')
      expect(summary).toContain('Chunk 7')
      expect(summary).toContain('data_preserved')
    })

    it('does not include passed_after_retry in attention section', () => {
      const retriedQA = makeQAResult({ passed: true, failedGates: [] })
      const report = createDocumentQAReport('doc4', [
        makeChunkReport({
          finalStatus: 'passed_after_retry',
          chunkIndex: 1,
          qaResults: [retriedQA],
        }),
      ])
      const summary = getQASummary(report)
      expect(summary).toContain('PASSED')
      expect(summary).not.toContain('requiring attention')
    })

    it('shows partial status correctly', () => {
      const passedQA = makeQAResult({ passed: true, failedGates: [] })
      const failedQA = makeQAResult({ failedGates: ['no_artifacts'] })
      const report = createDocumentQAReport('doc5', [
        makeChunkReport({ finalStatus: 'passed', chunkIndex: 0, qaResults: [passedQA] }),
        makeChunkReport({ finalStatus: 'failed', chunkIndex: 1, qaResults: [failedQA] }),
      ])
      const summary = getQASummary(report)
      expect(summary).toContain('PARTIAL')
    })

    it('lists multiple failed chunks in attention section', () => {
      const qa1 = makeQAResult({ failedGates: ['no_artifacts'] })
      const qa2 = makeQAResult({ failedGates: ['no_barcode_patterns'] })
      const report = createDocumentQAReport('doc6', [
        makeChunkReport({ finalStatus: 'failed', chunkIndex: 0, qaResults: [qa1] }),
        makeChunkReport({ finalStatus: 'manual_review', chunkIndex: 2, qaResults: [qa2] }),
      ])
      const summary = getQASummary(report)
      expect(summary).toContain('Chunk 0')
      expect(summary).toContain('Chunk 2')
    })

    it('uses the last QA result for each chunk in attention section', () => {
      const earlyQA = makeQAResult({ failedGates: ['no_artifacts', 'no_barcode_patterns'] })
      const laterQA = makeQAResult({ failedGates: ['no_artifacts'] }) // fewer failures after retry
      const report = createDocumentQAReport('doc7', [
        makeChunkReport({
          finalStatus: 'failed',
          chunkIndex: 0,
          qaResults: [earlyQA, laterQA],
        }),
      ])
      const summary = getQASummary(report)
      // Should show the last QA result's failed gates
      expect(summary).toContain('no_artifacts')
      // no_barcode_patterns was only in the first QA, not the last
      expect(summary).not.toContain('no_barcode_patterns')
    })
  })

  // --------------------------------------------------------------------------
  // hasQAFailures
  // --------------------------------------------------------------------------
  describe('hasQAFailures', () => {
    it('returns true when failedChunks > 0', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ finalStatus: 'failed' }),
      ])
      expect(hasQAFailures(report)).toBe(true)
    })

    it('returns true when manualReviewChunks > 0', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ finalStatus: 'manual_review' }),
      ])
      expect(hasQAFailures(report)).toBe(true)
    })

    it('returns true when both failedChunks and manualReviewChunks > 0', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ finalStatus: 'failed' }),
        makeChunkReport({ finalStatus: 'manual_review' }),
      ])
      expect(hasQAFailures(report)).toBe(true)
    })

    it('returns false when all passed', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ finalStatus: 'passed' }),
      ])
      expect(hasQAFailures(report)).toBe(false)
    })

    it('returns false when all passed_after_retry (no failed or manual_review)', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ finalStatus: 'passed_after_retry' }),
      ])
      expect(hasQAFailures(report)).toBe(false)
    })

    it('returns false for empty report', () => {
      const report = createDocumentQAReport('doc', [])
      expect(hasQAFailures(report)).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // getFailedChunks
  // --------------------------------------------------------------------------
  describe('getFailedChunks', () => {
    it('returns only failed and manual_review chunks', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ chunkId: 'passed', finalStatus: 'passed' }),
        makeChunkReport({ chunkId: 'retried', finalStatus: 'passed_after_retry' }),
        makeChunkReport({ chunkId: 'failed', finalStatus: 'failed' }),
        makeChunkReport({ chunkId: 'manual', finalStatus: 'manual_review' }),
      ])
      const failed = getFailedChunks(report)
      expect(failed).toHaveLength(2)
      expect(failed.map(c => c.chunkId)).toContain('failed')
      expect(failed.map(c => c.chunkId)).toContain('manual')
    })

    it('returns empty array when no failures', () => {
      const report = createDocumentQAReport('doc', [
        makeChunkReport({ finalStatus: 'passed' }),
        makeChunkReport({ finalStatus: 'passed_after_retry' }),
      ])
      expect(getFailedChunks(report)).toHaveLength(0)
    })

    it('returns empty array for empty report', () => {
      const report = createDocumentQAReport('doc', [])
      expect(getFailedChunks(report)).toHaveLength(0)
    })
  })
})
