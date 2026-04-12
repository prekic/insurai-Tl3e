/**
 * Tests for OCR Statistics Service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  recordExecution,
  getExecution,
  getRecentExecutions,
  getExecutionsInRange,
  aggregateStats,
  getCurrentPeriodStats,
  getTrends,
  getDashboardData,
  clearExecutionStore,
  type OCRExecution,
} from './ocr-stats'
import type { PipelineResult, SanitizerStats } from './ocr-cleanup-pipeline'
import type { DocumentQAReport } from './qa-gates'
import { resetPatternStore } from './pattern-store'

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockSanitizerStats(overrides?: Partial<SanitizerStats>): SanitizerStats {
  return {
    linesRemoved: 10,
    garbageLinesRemoved: 5,
    lowLetterRatioLinesRemoved: 3,
    spacedFragmentsMerged: 2,
    controlCharsRemoved: 1,
    spacesNormalized: 50,
    newlinesNormalized: 10,
    barcodeTokensIsolated: 0,
    ...overrides,
  }
}

function createMockQAReport(overrides?: Partial<DocumentQAReport>): DocumentQAReport {
  return {
    documentId: 'test-doc',
    totalChunks: 3,
    passedChunks: 2,
    failedChunks: 0,
    retriedChunks: 1,
    manualReviewChunks: 0,
    chunkReports: [],
    overallStatus: 'passed',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function createMockPipelineResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    text: 'Cleaned text',
    success: true,
    chunking: null,
    chunks: [],
    qaReport: createMockQAReport(),
    hasQAFailures: false,
    failedChunkIndices: [],
    preservationValid: true,
    preservationIssues: [],
    artifactsRemaining: false,
    remainingArtifacts: [],
    // @ts-expect-error - mismatch due to schema update
    stats: {
      originalLength: 1000,
      finalLength: 800,
      reductionPercent: 20,
      totalChunks: 3,
      chunksRetried: 1,
      chunksFailed: 0,
      totalProcessingTimeMs: 500,
      sanitizerStats: createMockSanitizerStats(),
    },
    logs: [],
    ...overrides,
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('OCR Statistics Service', () => {
  beforeEach(() => {
    clearExecutionStore()
    resetPatternStore()
  })

  afterEach(() => {
    clearExecutionStore()
    resetPatternStore()
  })

  // ============================================================================
  // EXECUTION RECORDING
  // ============================================================================

  describe('recordExecution', () => {
    it('should record a new execution', () => {
      const result = createMockPipelineResult()

      const execution = recordExecution(result, {
        documentId: 'test-doc-1',
        userId: 'user-1',
        pipelineType: 'standard',
      })

      expect(execution.id).toBeDefined()
      expect(execution.documentId).toBe('test-doc-1')
      expect(execution.userId).toBe('user-1')
      expect(execution.pipelineType).toBe('standard')
      expect(execution.success).toBe(true)
    })

    it('should calculate confidence score', () => {
      const result = createMockPipelineResult()

      const execution = recordExecution(result, {
        documentId: 'test-doc',
      })

      expect(execution.confidenceScore).toBeGreaterThan(0)
      expect(execution.confidenceGrade).toMatch(/^[ABCDF]$/)
    })

    it('should store sanitizer stats', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          sanitizerStats: createMockSanitizerStats({
            linesRemoved: 25,
            garbageLinesRemoved: 15,
          }),
        },
      })

      const execution = recordExecution(result, {
        documentId: 'test-doc',
      })

      expect(execution.sanitizerStats.linesRemoved).toBe(25)
      expect(execution.sanitizerStats.garbageLinesRemoved).toBe(15)
    })

    it('should record failed executions', () => {
      const result = createMockPipelineResult({
        success: false,
        preservationValid: false,
        preservationIssues: ['Data not preserved'],
      })

      const execution = recordExecution(result, {
        documentId: 'test-doc',
      })

      expect(execution.success).toBe(false)
      expect(execution.error).toBeDefined()
    })

    it('should handle artifacts and patterns', () => {
      const result = createMockPipelineResult({
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B found'],
      })

      const execution = recordExecution(result, {
        documentId: 'test-doc',
      })

      expect(execution.patternsDetected).toBeGreaterThanOrEqual(0)
    })

    it('should use provided start time', () => {
      const startTime = new Date('2026-01-15T10:00:00Z')
      const result = createMockPipelineResult()

      const execution = recordExecution(result, {
        documentId: 'test-doc',
        startTime,
      })

      expect(execution.startedAt).toBe(startTime.toISOString())
    })
  })

  // ============================================================================
  // EXECUTION RETRIEVAL
  // ============================================================================

  describe('getExecution', () => {
    it('should retrieve execution by ID', () => {
      const result = createMockPipelineResult()
      const recorded = recordExecution(result, { documentId: 'test' })

      const retrieved = getExecution(recorded.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(recorded.id)
    })

    it('should return undefined for non-existent ID', () => {
      const retrieved = getExecution('non-existent-id')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('getRecentExecutions', () => {
    it('should return recent executions in reverse order', () => {
      const result = createMockPipelineResult()

      recordExecution(result, { documentId: 'doc1' })
      recordExecution(result, { documentId: 'doc2' })
      recordExecution(result, { documentId: 'doc3' })

      const recent = getRecentExecutions(10)

      expect(recent.length).toBe(3)
      expect(recent[0].documentId).toBe('doc3') // Most recent first
    })

    it('should respect limit parameter', () => {
      const result = createMockPipelineResult()

      for (let i = 0; i < 10; i++) {
        recordExecution(result, { documentId: `doc${i}` })
      }

      const recent = getRecentExecutions(5)

      expect(recent.length).toBe(5)
    })
  })

  describe('getExecutionsInRange', () => {
    it('should return executions within time range', () => {
      const now = new Date()
      const hourAgo = new Date(now.getTime() - 3600000)
      const twoHoursAgo = new Date(now.getTime() - 7200000)

      const result = createMockPipelineResult()

      // Record with different times
      recordExecution(result, {
        documentId: 'old',
        startTime: new Date(twoHoursAgo.getTime() - 1000),
      })
      recordExecution(result, {
        documentId: 'recent',
        startTime: new Date(now.getTime() - 1000),
      })

      const inRange = getExecutionsInRange(hourAgo, now)

      expect(inRange.some((e) => e.documentId === 'recent')).toBe(true)
    })

    it('should return empty array for empty range', () => {
      const result = createMockPipelineResult()
      recordExecution(result, { documentId: 'test' })

      const inRange = getExecutionsInRange(new Date('2020-01-01'), new Date('2020-01-02'))

      expect(inRange.length).toBe(0)
    })
  })

  // ============================================================================
  // AGGREGATION
  // ============================================================================

  describe('aggregateStats', () => {
    it('should aggregate empty executions array', () => {
      const stats = aggregateStats([], 'day', new Date(), new Date())

      expect(stats.totalExecutions).toBe(0)
      expect(stats.successRate).toBe(0)
    })

    it('should calculate correct totals', () => {
      const result = createMockPipelineResult()
      const executions: OCRExecution[] = []

      // Record multiple executions
      for (let i = 0; i < 5; i++) {
        const exec = recordExecution(result, { documentId: `doc${i}` })
        executions.push(exec)
      }

      const stats = aggregateStats(executions, 'day', new Date(), new Date())

      expect(stats.totalExecutions).toBe(5)
      expect(stats.successfulExecutions).toBe(5)
    })

    it('should calculate success rate correctly', () => {
      const successResult = createMockPipelineResult({ success: true })
      const failResult = createMockPipelineResult({ success: false })

      const executions: OCRExecution[] = [
        recordExecution(successResult, { documentId: 'success1' }),
        recordExecution(successResult, { documentId: 'success2' }),
        recordExecution(failResult, { documentId: 'fail1' }),
      ]

      const stats = aggregateStats(executions, 'day', new Date(), new Date())

      expect(stats.successRate).toBeCloseTo(2 / 3, 2)
    })

    it('should aggregate sanitizer stats', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          sanitizerStats: createMockSanitizerStats({
            linesRemoved: 10,
            garbageLinesRemoved: 5,
            spacedFragmentsMerged: 3,
          }),
        },
      })

      const executions: OCRExecution[] = [
        recordExecution(result, { documentId: 'doc1' }),
        recordExecution(result, { documentId: 'doc2' }),
      ]

      const stats = aggregateStats(executions, 'day', new Date(), new Date())

      expect(stats.sanitizerStats.totalLinesRemoved).toBe(20)
      expect(stats.sanitizerStats.totalGarbageLinesRemoved).toBe(10)
      expect(stats.sanitizerStats.totalFragmentsMerged).toBe(6)
    })

    it('should calculate grade distribution', () => {
      const goodResult = createMockPipelineResult()
      const badResult = createMockPipelineResult({
        success: false,
        preservationValid: false,
        preservationIssues: ['Error 1', 'Error 2', 'Error 3'],
        hasQAFailures: true,
      })

      const executions: OCRExecution[] = [
        recordExecution(goodResult, { documentId: 'good1' }),
        recordExecution(goodResult, { documentId: 'good2' }),
        recordExecution(badResult, { documentId: 'bad1' }),
      ]

      const stats = aggregateStats(executions, 'day', new Date(), new Date())

      expect(stats.confidenceStats.gradeDistribution).toBeDefined()
      const totalGrades = Object.values(stats.confidenceStats.gradeDistribution).reduce(
        (a, b) => a + b,
        0
      )
      expect(totalGrades).toBe(3)
    })

    it('should track pipeline type breakdown', () => {
      const result = createMockPipelineResult()

      const executions: OCRExecution[] = [
        recordExecution(result, { documentId: 'doc1', pipelineType: 'full' }),
        recordExecution(result, { documentId: 'doc2', pipelineType: 'full' }),
        recordExecution(result, { documentId: 'doc3', pipelineType: 'quick' }),
      ]

      const stats = aggregateStats(executions, 'day', new Date(), new Date())

      expect(stats.byPipelineType.full).toBe(2)
      expect(stats.byPipelineType.quick).toBe(1)
    })
  })

  // ============================================================================
  // CURRENT PERIOD STATS
  // ============================================================================

  describe('getCurrentPeriodStats', () => {
    it('should return stats for current day', () => {
      const result = createMockPipelineResult()
      recordExecution(result, { documentId: 'today' })

      const stats = getCurrentPeriodStats('day')

      expect(stats.period).toBe('day')
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(1)
    })

    it('should handle different periods', () => {
      const result = createMockPipelineResult()
      recordExecution(result, { documentId: 'test' })

      const hourStats = getCurrentPeriodStats('hour')
      const dayStats = getCurrentPeriodStats('day')
      const weekStats = getCurrentPeriodStats('week')

      expect(hourStats.period).toBe('hour')
      expect(dayStats.period).toBe('day')
      expect(weekStats.period).toBe('week')
    })
  })

  // ============================================================================
  // TRENDS
  // ============================================================================

  describe('getTrends', () => {
    it('should return trend data', () => {
      const result = createMockPipelineResult()

      // Add some executions
      for (let i = 0; i < 5; i++) {
        recordExecution(result, { documentId: `doc${i}` })
      }

      const trends = getTrends('day')

      expect(trends.executions).toBeDefined()
      expect(trends.successRate).toBeDefined()
      expect(trends.avgConfidence).toBeDefined()
      expect(trends.avgDuration).toBeDefined()
    })

    it('should have trend points with timestamps', () => {
      const result = createMockPipelineResult()
      recordExecution(result, { documentId: 'test' })

      const trends = getTrends('day')

      if (trends.executions.length > 0) {
        expect(trends.executions[0].timestamp).toBeDefined()
        expect(typeof trends.executions[0].value).toBe('number')
      }
    })
  })

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  describe('getDashboardData', () => {
    it('should return complete dashboard data', () => {
      const result = createMockPipelineResult()
      recordExecution(result, { documentId: 'test' })

      const dashboard = getDashboardData('day')

      expect(dashboard.current).toBeDefined()
      expect(dashboard.previous).toBeDefined()
      expect(dashboard.trends).toBeDefined()
      expect(dashboard.recentExecutions).toBeDefined()
      expect(dashboard.topFailingPatterns).toBeDefined()
      expect(dashboard.patternStats).toBeDefined()
      expect(dashboard.lastUpdated).toBeDefined()
    })

    it('should include recent executions', () => {
      const result = createMockPipelineResult()

      recordExecution(result, { documentId: 'doc1' })
      recordExecution(result, { documentId: 'doc2' })

      const dashboard = getDashboardData('day')

      expect(dashboard.recentExecutions.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle different periods', () => {
      const result = createMockPipelineResult()
      recordExecution(result, { documentId: 'test' })

      const dayDashboard = getDashboardData('day')
      const weekDashboard = getDashboardData('week')
      const monthDashboard = getDashboardData('month')

      expect(dayDashboard.current.period).toBe('day')
      expect(weekDashboard.current.period).toBe('week')
      expect(monthDashboard.current.period).toBe('month')
    })
  })

  // ============================================================================
  // STORE MANAGEMENT
  // ============================================================================

  describe('clearExecutionStore', () => {
    it('should clear all executions', () => {
      const result = createMockPipelineResult()

      recordExecution(result, { documentId: 'doc1' })
      recordExecution(result, { documentId: 'doc2' })

      clearExecutionStore()

      const recent = getRecentExecutions(100)
      expect(recent.length).toBe(0)
    })
  })
})
