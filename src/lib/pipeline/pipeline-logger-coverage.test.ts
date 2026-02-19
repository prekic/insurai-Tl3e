/**
 * Pipeline Logger - Coverage Tests
 *
 * Targets uncovered branches in pipeline-logger.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createLogCollector,
  log,
  logStageStart,
  logStageComplete,
  logStageError,
  logWarning,
  logDebug,
  logNormalization,
  logExtraction,
  logQAScoring,
  logDataRequests,
  logAnalysis,
  getLogSummary,
  formatLogsAsJSON,
  formatLogsAsText,
  createLogger,
} from './pipeline-logger'

describe('pipeline-logger coverage', () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    vi.restoreAllMocks()
  })

  describe('createLogCollector', () => {
    it('creates collector with runId', () => {
      const c = createLogCollector('run-1')
      expect(c.runId).toBe('run-1')
      expect(c.entries).toHaveLength(0)
      expect(c.startTime).toBeGreaterThan(0)
    })

    it('creates collector with optional documentId', () => {
      const c = createLogCollector('run-2', 'doc-1')
      expect(c.documentId).toBe('doc-1')
    })
  })

  describe('log', () => {
    it('adds entry to collector', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Test message')
      expect(c.entries).toHaveLength(1)
      expect(c.entries[0].message).toBe('Test message')
      expect(c.entries[0].stage).toBe('normalize')
      expect(c.entries[0].level).toBe('info')
      expect(c.entries[0].runId).toBe('run-1')
    })

    it('includes error details when provided', () => {
      const c = createLogCollector('run-1')
      const err = new Error('Test error')
      log(c, 'extract', 'error', 'Failed', { error: err })
      expect(c.entries[0].error).toBeDefined()
      expect(c.entries[0].error!.name).toBe('Error')
      expect(c.entries[0].error!.message).toBe('Test error')
    })

    it('includes metrics when provided', () => {
      const c = createLogCollector('run-1')
      log(c, 'qa', 'info', 'QA done', { metrics: { inputSize: 100, outputSize: 90 } })
      expect(c.entries[0].metrics).toEqual({ inputSize: 100, outputSize: 90 })
    })

    it('includes context when provided', () => {
      const c = createLogCollector('run-1')
      log(c, 'analyze', 'info', 'Analysis', { context: { key: 'value' } })
      expect(c.entries[0].context).toEqual({ key: 'value' })
    })

    it('logs to console in development', () => {
      process.env.NODE_ENV = 'development'
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Dev message')
      expect(console.warn).toHaveBeenCalled()
    })

    it('logs errors to console in production', () => {
      process.env.NODE_ENV = 'production'
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'error', 'Prod error')
      expect(console.error).toHaveBeenCalled()
    })

    it('does not log non-errors in production', () => {
      process.env.NODE_ENV = 'production'
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Prod info')
      expect(console.warn).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })

    it('uses console.error for error level, console.warn for others', () => {
      process.env.NODE_ENV = 'development'
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'warn', 'Warning')
      expect(console.warn).toHaveBeenCalled()
    })
  })

  describe('logStageStart', () => {
    it('returns start time', () => {
      const c = createLogCollector('run-1')
      const t = logStageStart(c, 'normalize')
      expect(t).toBeGreaterThan(0)
      expect(c.entries).toHaveLength(1)
      expect(c.entries[0].message).toBe('Stage started')
    })

    it('includes inputSize in metrics when provided', () => {
      const c = createLogCollector('run-1')
      logStageStart(c, 'extract', 5000)
      expect(c.entries[0].metrics).toEqual({ inputSize: 5000 })
    })

    it('does not include metrics when inputSize is undefined', () => {
      const c = createLogCollector('run-1')
      logStageStart(c, 'extract')
      expect(c.entries[0].metrics).toBeUndefined()
    })

    it('passes context', () => {
      const c = createLogCollector('run-1')
      logStageStart(c, 'analyze', undefined, { model: 'gpt-4o' })
      expect(c.entries[0].context).toEqual({ model: 'gpt-4o' })
    })
  })

  describe('logStageComplete', () => {
    it('calculates duration from startTime', () => {
      const c = createLogCollector('run-1')
      const start = Date.now() - 100
      logStageComplete(c, 'normalize', start)
      expect(c.entries[0].metrics!.duration).toBeGreaterThanOrEqual(99)
    })

    it('includes additional metrics', () => {
      const c = createLogCollector('run-1')
      logStageComplete(c, 'extract', Date.now(), { itemCount: 10 })
      expect(c.entries[0].metrics!.itemCount).toBe(10)
    })

    it('includes context', () => {
      const c = createLogCollector('run-1')
      logStageComplete(c, 'qa', Date.now(), undefined, { score: 85 })
      expect(c.entries[0].context).toEqual({ score: 85 })
    })
  })

  describe('logStageError', () => {
    it('logs error with message', () => {
      const c = createLogCollector('run-1')
      logStageError(c, 'extract', new Error('Extraction failed'))
      expect(c.entries[0].level).toBe('error')
      expect(c.entries[0].message).toContain('Extraction failed')
      expect(c.entries[0].error).toBeDefined()
    })

    it('calculates duration when startTime provided', () => {
      const c = createLogCollector('run-1')
      const start = Date.now() - 200
      logStageError(c, 'extract', new Error('Fail'), start)
      expect(c.entries[0].metrics!.duration).toBeGreaterThanOrEqual(199)
    })

    it('omits metrics when startTime undefined', () => {
      const c = createLogCollector('run-1')
      logStageError(c, 'extract', new Error('Fail'))
      expect(c.entries[0].metrics).toBeUndefined()
    })

    it('passes context', () => {
      const c = createLogCollector('run-1')
      logStageError(c, 'normalize', new Error('Err'), undefined, { step: 'ocr' })
      expect(c.entries[0].context).toEqual({ step: 'ocr' })
    })
  })

  describe('logWarning', () => {
    it('logs warning', () => {
      const c = createLogCollector('run-1')
      logWarning(c, 'normalize', 'Low confidence')
      expect(c.entries[0].level).toBe('warn')
      expect(c.entries[0].message).toBe('Low confidence')
    })

    it('passes context', () => {
      const c = createLogCollector('run-1')
      logWarning(c, 'qa', 'Bad gate', { gate: 'no_barcode' })
      expect(c.entries[0].context).toEqual({ gate: 'no_barcode' })
    })
  })

  describe('logDebug', () => {
    it('logs debug message', () => {
      const c = createLogCollector('run-1')
      logDebug(c, 'extract', 'Debug info')
      expect(c.entries[0].level).toBe('debug')
    })
  })

  describe('stage-specific loggers', () => {
    it('logNormalization logs normalize stage', () => {
      const c = createLogCollector('run-1')
      const start = Date.now() - 50
      logNormalization(c, start, {
        originalLength: 1000,
        normalizedLength: 900,
        sectionsIdentified: 3,
        warningsCount: 1,
        linesDropped: 5,
        wordsFixed: 2,
      })
      expect(c.entries).toHaveLength(1)
      expect(c.entries[0].stage).toBe('normalize')
      expect(c.entries[0].context).toHaveProperty('linesDropped', 5)
      expect(c.entries[0].context).toHaveProperty('wordsFixed', 2)
    })

    it('logExtraction logs extract stage with token usage', () => {
      const c = createLogCollector('run-1')
      logExtraction(c, Date.now(), {
        fieldsExtracted: 20,
        evidenceCount: 15,
        errorsCount: 1,
        warningsCount: 2,
        tokenUsage: { inputTokens: 500, outputTokens: 300 },
        policyType: 'kasko',
        promptVersion: '2.0',
      })
      expect(c.entries[0].stage).toBe('extract')
      expect(c.entries[0].metrics!.tokenUsage).toEqual({ inputTokens: 500, outputTokens: 300 })
      expect(c.entries[0].context).toHaveProperty('policyType', 'kasko')
    })

    it('logQAScoring logs qa stage', () => {
      const c = createLogCollector('run-1')
      logQAScoring(c, Date.now(), {
        rawScore: 85,
        finalScore: 80,
        gatesTriggered: ['gate1', 'gate2'],
        contradictionCount: 1,
        meetsMinimum: true,
      })
      expect(c.entries[0].stage).toBe('qa')
      expect(c.entries[0].context).toHaveProperty('rawScore', 85)
    })

    it('logDataRequests logs data_requests stage', () => {
      const c = createLogCollector('run-1')
      logDataRequests(c, Date.now(), {
        totalRequests: 3,
        criticalRequests: 1,
        canFinalize: false,
      })
      expect(c.entries[0].stage).toBe('data_requests')
      expect(c.entries[0].context).toHaveProperty('canFinalize', false)
    })

    it('logAnalysis logs analyze stage', () => {
      const c = createLogCollector('run-1')
      logAnalysis(c, Date.now(), {
        gapsIdentified: 5,
        negotiationPoints: 3,
        benchmarkCitations: 10,
        tokenUsage: { inputTokens: 1000, outputTokens: 500, costEstimate: 0.02 },
      })
      expect(c.entries[0].stage).toBe('analyze')
      expect(c.entries[0].context).toHaveProperty('negotiationPoints', 3)
    })
  })

  describe('getLogSummary', () => {
    it('returns summary for empty collector', () => {
      const c = createLogCollector('run-1', 'doc-1')
      const summary = getLogSummary(c)
      expect(summary.runId).toBe('run-1')
      expect(summary.documentId).toBe('doc-1')
      expect(summary.stages).toHaveLength(0)
      expect(summary.errorCount).toBe(0)
      expect(summary.warningCount).toBe(0)
    })

    it('counts errors and warnings', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'error', 'Err1')
      log(c, 'normalize', 'warn', 'Warn1')
      log(c, 'extract', 'error', 'Err2')
      const summary = getLogSummary(c)
      expect(summary.errorCount).toBe(2)
      expect(summary.warningCount).toBe(1)
    })

    it('determines stage status: error overrides success', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Start')
      log(c, 'normalize', 'error', 'Fail')
      const summary = getLogSummary(c)
      const stage = summary.stages.find(s => s.stage === 'normalize')
      expect(stage!.status).toBe('error')
    })

    it('determines stage status: warning overrides success', () => {
      const c = createLogCollector('run-1')
      log(c, 'extract', 'info', 'Start')
      log(c, 'extract', 'warn', 'Warning')
      const summary = getLogSummary(c)
      const stage = summary.stages.find(s => s.stage === 'extract')
      expect(stage!.status).toBe('warning')
    })

    it('picks up duration from metrics', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Complete', { metrics: { duration: 123 } })
      const summary = getLogSummary(c)
      expect(summary.stages[0].duration).toBe(123)
    })

    it('updates duration if first entry had none', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Start')
      log(c, 'normalize', 'info', 'Complete', { metrics: { duration: 100 } })
      const summary = getLogSummary(c)
      expect(summary.stages[0].duration).toBe(100)
    })
  })

  describe('formatLogsAsJSON', () => {
    it('returns valid JSON', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Test')
      const json = formatLogsAsJSON(c)
      const parsed = JSON.parse(json)
      expect(parsed.summary.runId).toBe('run-1')
      expect(parsed.entries).toHaveLength(1)
    })
  })

  describe('formatLogsAsText', () => {
    it('includes run id', () => {
      const c = createLogCollector('run-1', 'doc-1')
      const text = formatLogsAsText(c)
      expect(text).toContain('run-1')
      expect(text).toContain('doc-1')
    })

    it('includes stage summary', () => {
      const c = createLogCollector('run-1')
      log(c, 'normalize', 'info', 'Done', { metrics: { duration: 50 } })
      const text = formatLogsAsText(c)
      expect(text).toContain('normalize')
      expect(text).toContain('SUCCESS')
    })

    it('includes log entries with metrics', () => {
      const c = createLogCollector('run-1')
      log(c, 'extract', 'info', 'Processing', { metrics: { inputSize: 500 } })
      const text = formatLogsAsText(c)
      expect(text).toContain('metrics')
      expect(text).toContain('500')
    })

    it('includes error details in entries', () => {
      const c = createLogCollector('run-1')
      log(c, 'extract', 'error', 'Failed', { error: new Error('Test') })
      const text = formatLogsAsText(c)
      expect(text).toContain('error: Test')
    })

    it('filters empty lines (no documentId)', () => {
      const c = createLogCollector('run-1')
      const text = formatLogsAsText(c)
      // Should not have empty lines from missing documentId
      expect(text).not.toContain('\n\n\n')
    })
  })

  describe('createLogger', () => {
    it('creates a logger with bound methods', () => {
      const logger = createLogger('run-1', 'doc-1')
      expect(logger.logStageStart).toBeTypeOf('function')
      expect(logger.logStageComplete).toBeTypeOf('function')
      expect(logger.logWarning).toBeTypeOf('function')
      expect(logger.logError).toBeTypeOf('function')
      expect(logger.getLogs).toBeTypeOf('function')
    })

    it('logStageStart returns timestamp and logs', () => {
      const logger = createLogger('run-1')
      const t = logger.logStageStart('pipeline')
      expect(t).toBeGreaterThan(0)
      expect(logger.getLogs()).toHaveLength(1)
    })

    it('logStageComplete calculates duration from start time', () => {
      const logger = createLogger('run-1')
      const start = logger.logStageStart('chunking')
      logger.logStageComplete('chunking', start, { chunks: 3 })
      const logs = logger.getLogs()
      expect(logs).toHaveLength(2)
      expect(logs[1].metrics!.duration).toBeGreaterThanOrEqual(0)
    })

    it('logStageComplete treats small numbers as duration when no start recorded', () => {
      const logger = createLogger('run-1')
      // Pass small number and stage has no recorded start time
      logger.logStageComplete('merge', 50)
      const logs = logger.getLogs()
      expect(logs[0].metrics!.duration).toBe(50)
    })

    it('logWarning logs to normalize for extended stages', () => {
      const logger = createLogger('run-1')
      logger.logWarning('sanitization', 'Bad chars')
      const logs = logger.getLogs()
      expect(logs[0].stage).toBe('normalize')
      expect(logs[0].level).toBe('warn')
    })

    it('logError logs to qa for validation stage', () => {
      const logger = createLogger('run-1')
      logger.logError('validation', 'QA gate failed')
      const logs = logger.getLogs()
      expect(logs[0].stage).toBe('qa')
      expect(logs[0].level).toBe('error')
    })

    it('maps extended stages: pipeline -> normalize', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('pipeline')
      expect(logger.getLogs()[0].stage).toBe('normalize')
    })

    it('maps extended stages: chunking -> normalize', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('chunking')
      expect(logger.getLogs()[0].stage).toBe('normalize')
    })

    it('maps extended stages: merge -> normalize', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('merge')
      expect(logger.getLogs()[0].stage).toBe('normalize')
    })

    it('maps extended stages: sanitization -> normalize', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('sanitization')
      expect(logger.getLogs()[0].stage).toBe('normalize')
    })

    it('maps extended stages: validation -> qa', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('validation')
      expect(logger.getLogs()[0].stage).toBe('qa')
    })

    it('maps extended stages: preclean passes through default case', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('preclean')
      // 'preclean' falls through to default case which casts as PipelineStage
      expect(logger.getLogs()[0].stage).toBe('preclean')
    })

    it('passes base PipelineStage through unchanged', () => {
      const logger = createLogger('run-1')
      logger.logStageStart('extract')
      expect(logger.getLogs()[0].stage).toBe('extract')
    })
  })
})
