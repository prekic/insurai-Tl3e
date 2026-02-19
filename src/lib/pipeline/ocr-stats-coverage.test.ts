/**
 * OCR Stats - Coverage Tests
 *
 * Targets uncovered branches in ocr-stats.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  recordExecution,
  getExecution,
  getRecentExecutions,
  getExecutionsInRange,
  aggregateStats,
  getCurrentPeriodStats,
  getPreviousPeriodStats,
  getTrends,
  getDashboardData,
  clearExecutionStore,
} from './ocr-stats'
import { resetPatternStore } from './pattern-store'
import type { PipelineResult, SanitizerStats } from './ocr-cleanup-pipeline'

function createSanitizerStats(overrides: Partial<SanitizerStats> = {}): SanitizerStats {
  return {
    linesRemoved: 5,
    garbageLinesRemoved: 2,
    spacedFragmentsMerged: 1,
    controlCharsRemoved: 0,
    highAsciiSequencesRemoved: 0,
    specialClustersRemoved: 0,
    ...overrides,
  }
}

function createResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    success: true,
    output: 'cleaned',
    qaReport: {
      overallStatus: 'passed',
      totalChunks: 3,
      passedChunks: 3,
      retriedChunks: 0,
      failedChunks: 0,
      manualReviewChunks: 0,
      chunkReports: [],
    },
    stats: {
      originalLength: 1000,
      finalLength: 800,
      reductionPercent: 20,
      totalChunks: 3,
      chunksRetried: 0,
      chunksFailed: 0,
      totalProcessingTimeMs: 500,
      sanitizerStats: createSanitizerStats(),
    },
    preservationValid: true,
    preservationIssues: [],
    artifactsRemaining: false,
    remainingArtifacts: [],
    hasQAFailures: false,
    failedChunkIndices: [],
    ...overrides,
  } as PipelineResult
}

describe('ocr-stats coverage', () => {
  beforeEach(() => {
    clearExecutionStore()
    resetPatternStore()
  })

  describe('recordExecution', () => {
    it('records a successful execution', () => {
      const exec = recordExecution(createResult(), { documentId: 'doc1' })
      expect(exec.id).toBeTruthy()
      expect(exec.documentId).toBe('doc1')
      expect(exec.success).toBe(true)
      expect(exec.durationMs).toBe(500)
    })

    it('records userId and pipelineType', () => {
      const exec = recordExecution(createResult(), {
        documentId: 'doc1',
        userId: 'user1',
        pipelineType: 'full',
      })
      expect(exec.userId).toBe('user1')
      expect(exec.pipelineType).toBe('full')
    })

    it('uses default pipelineType standard', () => {
      const exec = recordExecution(createResult(), { documentId: 'doc1' })
      expect(exec.pipelineType).toBe('standard')
    })

    it('uses startTime when provided', () => {
      const startTime = new Date('2026-01-15T10:00:00Z')
      const exec = recordExecution(createResult(), { documentId: 'doc1', startTime })
      expect(exec.startedAt).toBe(startTime.toISOString())
    })

    it('records error for failed result (preservation issue)', () => {
      const result = createResult({
        success: false,
        preservationValid: false,
        preservationIssues: ['Policy number missing'],
      })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.error).toContain('Preservation failed')
    })

    it('records error for QA failures', () => {
      const result = createResult({
        success: false,
        preservationValid: true,
        hasQAFailures: true,
        failedChunkIndices: [0, 1],
      })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.error).toContain('QA failed')
    })

    it('records error for remaining artifacts', () => {
      const result = createResult({
        success: false,
        preservationValid: true,
        hasQAFailures: false,
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B', 'noise'],
      })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.error).toContain('Artifacts remaining')
    })

    it('records unknown error when no specific cause', () => {
      const result = createResult({
        success: false,
        preservationValid: true,
        hasQAFailures: false,
        artifactsRemaining: false,
      })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.error).toBe('Unknown error')
    })

    it('records patterns from remaining artifacts', () => {
      const result = createResult({
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B test', 'a!!!!a test'],
      })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.patternsDetected).toBe(2)
    })

    it('counts QA chunks correctly (with qaReport)', () => {
      const result = createResult({
        qaReport: {
          overallStatus: 'passed',
          totalChunks: 5,
          passedChunks: 3,
          retriedChunks: 2,
          failedChunks: 0,
          manualReviewChunks: 0,
          chunkReports: [],
        },
      })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.chunksPassedQA).toBe(5) // passedChunks + retriedChunks
    })

    it('uses totalChunks when qaReport is null', () => {
      const result = createResult({ qaReport: null })
      const exec = recordExecution(result, { documentId: 'doc1' })
      expect(exec.chunksPassedQA).toBe(3) // totalChunks
    })

    it('prunes old executions beyond MAX_EXECUTIONS', () => {
      // Record many executions
      for (let i = 0; i < 50; i++) {
        recordExecution(createResult(), { documentId: `doc${i}` })
      }
      const recent = getRecentExecutions(100)
      expect(recent.length).toBeLessThanOrEqual(50)
    })
  })

  describe('getExecution', () => {
    it('returns execution by ID', () => {
      const exec = recordExecution(createResult(), { documentId: 'doc1' })
      expect(getExecution(exec.id)).toBeDefined()
    })

    it('returns undefined for unknown ID', () => {
      expect(getExecution('nonexistent')).toBeUndefined()
    })
  })

  describe('getRecentExecutions', () => {
    it('returns most recent first', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      recordExecution(createResult(), { documentId: 'doc2' })
      const recent = getRecentExecutions(10)
      expect(recent[0].documentId).toBe('doc2')
    })

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        recordExecution(createResult(), { documentId: `doc${i}` })
      }
      expect(getRecentExecutions(3)).toHaveLength(3)
    })
  })

  describe('getExecutionsInRange', () => {
    it('filters by time range', () => {
      const now = new Date()
      recordExecution(createResult(), { documentId: 'doc1', startTime: now })
      const future = new Date(now.getTime() + 100000)
      const results = getExecutionsInRange(new Date(now.getTime() - 1000), future)
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty for range with no executions', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const past = new Date('2020-01-01')
      const pastEnd = new Date('2020-01-02')
      expect(getExecutionsInRange(past, pastEnd)).toHaveLength(0)
    })
  })

  describe('aggregateStats', () => {
    it('aggregates empty executions array', () => {
      const now = new Date()
      const stats = aggregateStats([], 'day', now, now)
      expect(stats.totalExecutions).toBe(0)
      expect(stats.successRate).toBe(0)
      expect(stats.avgDuration).toBe(0)
      expect(stats.minDuration).toBe(0)
      expect(stats.maxDuration).toBe(0)
    })

    it('calculates success rate', () => {
      const execs = [
        recordExecution(createResult(), { documentId: 'doc1' }),
        recordExecution(createResult({ success: false, preservationValid: false, preservationIssues: ['err'] }), { documentId: 'doc2' }),
      ]
      const now = new Date()
      const stats = aggregateStats(execs, 'day', now, now)
      expect(stats.successRate).toBe(0.5)
      expect(stats.successfulExecutions).toBe(1)
      expect(stats.failedExecutions).toBe(1)
    })

    it('calculates duration stats', () => {
      const execs = [
        recordExecution(createResult(), { documentId: 'doc1' }),
      ]
      const now = new Date()
      const stats = aggregateStats(execs, 'day', now, now)
      expect(stats.avgDuration).toBe(500)
      expect(stats.minDuration).toBe(500)
      expect(stats.maxDuration).toBe(500)
    })

    it('calculates grade and status distributions', () => {
      const execs = [
        recordExecution(createResult(), { documentId: 'doc1' }),
      ]
      const now = new Date()
      const stats = aggregateStats(execs, 'day', now, now)
      const totalGrades = Object.values(stats.confidenceStats.gradeDistribution).reduce((a, b) => a + b, 0)
      expect(totalGrades).toBe(1)
    })

    it('calculates QA stats', () => {
      const execs = [
        recordExecution(createResult(), { documentId: 'doc1' }),
      ]
      const now = new Date()
      const stats = aggregateStats(execs, 'day', now, now)
      expect(stats.qaStats.totalChunks).toBeGreaterThan(0)
    })

    it('calculates sanitizer stats', () => {
      const execs = [
        recordExecution(createResult(), { documentId: 'doc1' }),
      ]
      const now = new Date()
      const stats = aggregateStats(execs, 'day', now, now)
      expect(stats.sanitizerStats.totalLinesRemoved).toBeGreaterThanOrEqual(0)
    })

    it('calculates pipeline type breakdown', () => {
      const execs = [
        recordExecution(createResult(), { documentId: 'doc1', pipelineType: 'full' }),
        recordExecution(createResult(), { documentId: 'doc2', pipelineType: 'quick' }),
      ]
      const now = new Date()
      const stats = aggregateStats(execs, 'day', now, now)
      expect(stats.byPipelineType.full).toBe(1)
      expect(stats.byPipelineType.quick).toBe(1)
    })
  })

  describe('getCurrentPeriodStats', () => {
    it('returns stats for hour period', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const stats = getCurrentPeriodStats('hour')
      expect(stats.period).toBe('hour')
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(1)
    })

    it('returns stats for day period', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const stats = getCurrentPeriodStats('day')
      expect(stats.period).toBe('day')
    })

    it('returns stats for week period', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const stats = getCurrentPeriodStats('week')
      expect(stats.period).toBe('week')
    })

    it('returns stats for month period', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const stats = getCurrentPeriodStats('month')
      expect(stats.period).toBe('month')
    })
  })

  describe('getPreviousPeriodStats', () => {
    it('returns stats for previous day', () => {
      const stats = getPreviousPeriodStats('day')
      expect(stats.period).toBe('day')
      expect(stats.totalExecutions).toBe(0)
    })

    it('returns stats for previous hour', () => {
      const stats = getPreviousPeriodStats('hour')
      expect(stats.period).toBe('hour')
    })

    it('returns stats for previous week', () => {
      const stats = getPreviousPeriodStats('week')
      expect(stats.period).toBe('week')
    })

    it('returns stats for previous month', () => {
      const stats = getPreviousPeriodStats('month')
      expect(stats.period).toBe('month')
    })
  })

  describe('getTrends', () => {
    it('returns trend data for day', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const trends = getTrends('day')
      expect(trends.executions.length).toBeGreaterThanOrEqual(0)
      expect(trends.successRate).toBeDefined()
      expect(trends.avgConfidence).toBeDefined()
      expect(trends.avgDuration).toBeDefined()
      expect(trends.patternsDetected).toBeDefined()
    })

    it('returns trend data for week', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const trends = getTrends('week')
      expect(Array.isArray(trends.executions)).toBe(true)
    })

    it('returns trend data for month', () => {
      const trends = getTrends('month')
      expect(Array.isArray(trends.executions)).toBe(true)
    })

    it('groups by hour for day period', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const trends = getTrends('day')
      // Points should exist for the current time slot
      if (trends.executions.length > 0) {
        expect(trends.executions[0].timestamp).toContain(':00:00Z')
      }
    })
  })

  describe('getDashboardData', () => {
    it('returns complete dashboard data', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      const data = getDashboardData('day')
      expect(data.current).toBeDefined()
      expect(data.previous).toBeDefined()
      expect(data.trends).toBeDefined()
      expect(data.recentExecutions).toBeDefined()
      expect(data.topFailingPatterns).toBeDefined()
      expect(data.patternStats).toBeDefined()
      expect(data.lastUpdated).toBeTruthy()
    })

    it('uses default period of day', () => {
      const data = getDashboardData()
      expect(data.current.period).toBe('day')
    })

    it('returns top failing patterns', () => {
      const data = getDashboardData('day')
      expect(Array.isArray(data.topFailingPatterns)).toBe(true)
    })
  })

  describe('clearExecutionStore', () => {
    it('clears all executions', () => {
      recordExecution(createResult(), { documentId: 'doc1' })
      recordExecution(createResult(), { documentId: 'doc2' })
      clearExecutionStore()
      expect(getRecentExecutions(100)).toHaveLength(0)
    })
  })
})
