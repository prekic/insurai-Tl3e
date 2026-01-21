/**
 * Unit tests for Pipeline Logger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createLogCollector,
  log,
  logStageStart,
  logStageComplete,
  logStageError,
  logWarning,
  logNormalization,
  logExtraction,
  logQAScoring,
  logDataRequests,
  getLogSummary,
  formatLogsAsJSON,
  formatLogsAsText,
} from '../pipeline-logger'

describe('Pipeline Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('createLogCollector', () => {
    it('should create a new collector with run ID', () => {
      const collector = createLogCollector('run-123')
      expect(collector.runId).toBe('run-123')
      expect(collector.entries).toEqual([])
      expect(collector.startTime).toBeGreaterThan(0)
    })

    it('should optionally include document ID', () => {
      const collector = createLogCollector('run-123', 'doc-456')
      expect(collector.documentId).toBe('doc-456')
    })
  })

  describe('log', () => {
    it('should add entry to collector', () => {
      const collector = createLogCollector('run-1')
      log(collector, 'normalize', 'info', 'Test message')

      expect(collector.entries).toHaveLength(1)
      expect(collector.entries[0].stage).toBe('normalize')
      expect(collector.entries[0].level).toBe('info')
      expect(collector.entries[0].message).toBe('Test message')
      expect(collector.entries[0].runId).toBe('run-1')
    })

    it('should include metrics when provided', () => {
      const collector = createLogCollector('run-1')
      log(collector, 'extract', 'info', 'Extraction complete', {
        metrics: { inputSize: 1000, outputSize: 500 },
      })

      expect(collector.entries[0].metrics).toEqual({
        inputSize: 1000,
        outputSize: 500,
      })
    })

    it('should capture error details', () => {
      const collector = createLogCollector('run-1')
      const error = new Error('Test error')
      log(collector, 'normalize', 'error', 'Stage failed', { error })

      expect(collector.entries[0].error).toBeDefined()
      expect(collector.entries[0].error?.name).toBe('Error')
      expect(collector.entries[0].error?.message).toBe('Test error')
    })

    it('should include timestamp', () => {
      const collector = createLogCollector('run-1')
      log(collector, 'normalize', 'info', 'Test')

      expect(collector.entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('logStageStart', () => {
    it('should return start time', () => {
      const collector = createLogCollector('run-1')
      const startTime = logStageStart(collector, 'normalize', 5000)

      expect(startTime).toBeGreaterThan(0)
      expect(collector.entries[0].message).toBe('Stage started')
      expect(collector.entries[0].metrics?.inputSize).toBe(5000)
    })
  })

  describe('logStageComplete', () => {
    it('should log completion with duration', async () => {
      const collector = createLogCollector('run-1')
      const startTime = Date.now() - 100 // 100ms ago

      logStageComplete(collector, 'normalize', startTime, { outputSize: 4000 })

      expect(collector.entries[0].message).toBe('Stage completed')
      expect(collector.entries[0].metrics?.duration).toBeGreaterThanOrEqual(100)
      expect(collector.entries[0].metrics?.outputSize).toBe(4000)
    })
  })

  describe('logStageError', () => {
    it('should log error with details', () => {
      const collector = createLogCollector('run-1')
      const error = new Error('Extraction failed')
      const startTime = Date.now() - 50

      logStageError(collector, 'extract', error, startTime)

      expect(collector.entries[0].level).toBe('error')
      expect(collector.entries[0].error?.message).toBe('Extraction failed')
      expect(collector.entries[0].metrics?.duration).toBeGreaterThanOrEqual(50)
    })
  })

  describe('logWarning', () => {
    it('should log warning with context', () => {
      const collector = createLogCollector('run-1')
      logWarning(collector, 'normalize', 'Document may be truncated', {
        originalLength: 100
      })

      expect(collector.entries[0].level).toBe('warn')
      expect(collector.entries[0].context?.originalLength).toBe(100)
    })
  })

  describe('Stage-specific loggers', () => {
    it('logNormalization should include all stats', () => {
      const collector = createLogCollector('run-1')
      const startTime = Date.now() - 50

      logNormalization(collector, startTime, {
        originalLength: 10000,
        normalizedLength: 8000,
        sectionsIdentified: 5,
        warningsCount: 2,
        linesDropped: 3,
        wordsFixed: 10,
      })

      const entry = collector.entries[0]
      expect(entry.metrics?.inputSize).toBe(10000)
      expect(entry.metrics?.outputSize).toBe(8000)
      expect(entry.metrics?.itemCount).toBe(5)
      expect(entry.context?.linesDropped).toBe(3)
      expect(entry.context?.wordsFixed).toBe(10)
    })

    it('logExtraction should include token usage', () => {
      const collector = createLogCollector('run-1')
      const startTime = Date.now() - 1000

      logExtraction(collector, startTime, {
        fieldsExtracted: 25,
        evidenceCount: 20,
        errorsCount: 2,
        warningsCount: 3,
        tokenUsage: {
          inputTokens: 5000,
          outputTokens: 2000,
          costEstimate: 0.05,
        },
        policyType: 'kasko',
        promptVersion: 'kasko-extract-v3.0',
      })

      const entry = collector.entries[0]
      expect(entry.metrics?.tokenUsage?.inputTokens).toBe(5000)
      expect(entry.context?.policyType).toBe('kasko')
      expect(entry.context?.promptVersion).toBe('kasko-extract-v3.0')
    })

    it('logQAScoring should include gate information', () => {
      const collector = createLogCollector('run-1')
      const startTime = Date.now() - 30

      logQAScoring(collector, startTime, {
        rawScore: 85,
        finalScore: 70,
        gatesTriggered: ['missing_dates', 'rayic_deger_numeric'],
        contradictionCount: 1,
        meetsMinimum: true,
      })

      const entry = collector.entries[0]
      expect(entry.context?.gatesTriggered).toEqual(['missing_dates', 'rayic_deger_numeric'])
      expect(entry.context?.finalScore).toBe(70)
      expect(entry.context?.meetsMinimum).toBe(true)
    })

    it('logDataRequests should track critical requests', () => {
      const collector = createLogCollector('run-1')
      const startTime = Date.now() - 20

      logDataRequests(collector, startTime, {
        totalRequests: 5,
        criticalRequests: 2,
        canFinalize: false,
      })

      const entry = collector.entries[0]
      expect(entry.metrics?.itemCount).toBe(5)
      expect(entry.metrics?.errorCount).toBe(2)
      expect(entry.context?.canFinalize).toBe(false)
    })
  })

  describe('getLogSummary', () => {
    it('should provide summary of pipeline run', () => {
      const collector = createLogCollector('run-123', 'doc-456')

      // Simulate a pipeline run
      logStageComplete(collector, 'normalize', Date.now() - 100, { outputSize: 8000 })
      logStageComplete(collector, 'extract', Date.now() - 500, { itemCount: 25 })
      logWarning(collector, 'qa', 'Low confidence detected')
      logStageComplete(collector, 'qa', Date.now() - 50)

      const summary = getLogSummary(collector)

      expect(summary.runId).toBe('run-123')
      expect(summary.documentId).toBe('doc-456')
      expect(summary.stages).toHaveLength(3)
      expect(summary.warningCount).toBe(1)
      expect(summary.errorCount).toBe(0)
    })

    it('should mark stage as error if any entry is error', () => {
      const collector = createLogCollector('run-1')

      logStageComplete(collector, 'normalize', Date.now() - 100)
      logStageError(collector, 'extract', new Error('Failed'))

      const summary = getLogSummary(collector)

      const extractStage = summary.stages.find(s => s.stage === 'extract')
      expect(extractStage?.status).toBe('error')
    })
  })

  describe('formatLogsAsJSON', () => {
    it('should return valid JSON', () => {
      const collector = createLogCollector('run-1')
      logStageComplete(collector, 'normalize', Date.now() - 100)

      const json = formatLogsAsJSON(collector)
      const parsed = JSON.parse(json)

      expect(parsed.summary).toBeDefined()
      expect(parsed.entries).toBeDefined()
      expect(parsed.entries).toHaveLength(1)
    })
  })

  describe('formatLogsAsText', () => {
    it('should return human-readable output', () => {
      const collector = createLogCollector('run-1')
      logStageStart(collector, 'normalize', 5000)
      logStageComplete(collector, 'normalize', Date.now() - 100, { outputSize: 4000 })

      const text = formatLogsAsText(collector)

      expect(text).toContain('Pipeline Run: run-1')
      expect(text).toContain('normalize')
      expect(text).toContain('Stage started')
      expect(text).toContain('Stage completed')
    })
  })
})
