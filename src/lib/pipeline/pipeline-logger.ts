/**
 * Pipeline Stage Logger
 *
 * Provides structured logging for the 3-step extraction pipeline.
 * Logs stage transitions, metrics, and outcomes for debugging and auditing.
 *
 * Log Levels:
 * - INFO: Normal stage transitions
 * - WARN: Recoverable issues
 * - ERROR: Stage failures
 * - DEBUG: Detailed internal state
 */

// ============================================================================
// TYPES
// ============================================================================

export type PipelineStage = 'normalize' | 'extract' | 'analyze' | 'qa' | 'data_requests'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface StageMetrics {
  inputSize?: number
  outputSize?: number
  duration?: number
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    costEstimate?: number
  }
  itemCount?: number
  warningCount?: number
  errorCount?: number
  [key: string]: unknown
}

export interface LogEntry {
  timestamp: string
  stage: PipelineStage
  level: LogLevel
  message: string
  runId?: string
  documentId?: string
  metrics?: StageMetrics
  error?: {
    name: string
    message: string
    stack?: string
  }
  context?: Record<string, unknown>
}

export interface PipelineLogCollector {
  entries: LogEntry[]
  runId: string
  documentId?: string
  startTime: number
}

// ============================================================================
// LOGGER IMPLEMENTATION
// ============================================================================

/**
 * Create a new log collector for a pipeline run
 */
export function createLogCollector(runId: string, documentId?: string): PipelineLogCollector {
  return {
    entries: [],
    runId,
    documentId,
    startTime: Date.now(),
  }
}

/**
 * Add a log entry to the collector
 */
export function log(
  collector: PipelineLogCollector,
  stage: PipelineStage,
  level: LogLevel,
  message: string,
  options: {
    metrics?: StageMetrics
    error?: Error
    context?: Record<string, unknown>
  } = {}
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    stage,
    level,
    message,
    runId: collector.runId,
    documentId: collector.documentId,
    metrics: options.metrics,
    context: options.context,
  }

  if (options.error) {
    entry.error = {
      name: options.error.name,
      message: options.error.message,
      stack: options.error.stack,
    }
  }

  collector.entries.push(entry)

  // Also output to console in development
  if (process.env.NODE_ENV !== 'production' || level === 'error') {
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    logFn(`[Pipeline:${stage}] ${message}`, options.metrics || '')
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Log stage start
 */
export function logStageStart(
  collector: PipelineLogCollector,
  stage: PipelineStage,
  inputSize?: number,
  context?: Record<string, unknown>
): number {
  const startTime = Date.now()
  log(collector, stage, 'info', `Stage started`, {
    metrics: inputSize !== undefined ? { inputSize } : undefined,
    context,
  })
  return startTime
}

/**
 * Log stage completion
 */
export function logStageComplete(
  collector: PipelineLogCollector,
  stage: PipelineStage,
  startTime: number,
  metrics?: Omit<StageMetrics, 'duration'>,
  context?: Record<string, unknown>
): void {
  const duration = Date.now() - startTime
  log(collector, stage, 'info', `Stage completed`, {
    metrics: {
      ...metrics,
      duration,
    },
    context,
  })
}

/**
 * Log stage failure
 */
export function logStageError(
  collector: PipelineLogCollector,
  stage: PipelineStage,
  error: Error,
  startTime?: number,
  context?: Record<string, unknown>
): void {
  const metrics: StageMetrics = {}
  if (startTime !== undefined) {
    metrics.duration = Date.now() - startTime
  }

  log(collector, stage, 'error', `Stage failed: ${error.message}`, {
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    error,
    context,
  })
}

/**
 * Log a warning during stage processing
 */
export function logWarning(
  collector: PipelineLogCollector,
  stage: PipelineStage,
  message: string,
  context?: Record<string, unknown>
): void {
  log(collector, stage, 'warn', message, { context })
}

/**
 * Log debug information
 */
export function logDebug(
  collector: PipelineLogCollector,
  stage: PipelineStage,
  message: string,
  context?: Record<string, unknown>
): void {
  log(collector, stage, 'debug', message, { context })
}

// ============================================================================
// STAGE-SPECIFIC LOGGERS
// ============================================================================

/**
 * Log normalization stage details
 */
export function logNormalization(
  collector: PipelineLogCollector,
  startTime: number,
  stats: {
    originalLength: number
    normalizedLength: number
    sectionsIdentified: number
    warningsCount: number
    linesDropped?: number
    wordsFixed?: number
  }
): void {
  logStageComplete(collector, 'normalize', startTime, {
    inputSize: stats.originalLength,
    outputSize: stats.normalizedLength,
    itemCount: stats.sectionsIdentified,
    warningCount: stats.warningsCount,
  }, {
    linesDropped: stats.linesDropped,
    wordsFixed: stats.wordsFixed,
    compressionRatio: stats.normalizedLength / Math.max(stats.originalLength, 1),
  })
}

/**
 * Log extraction stage details
 */
export function logExtraction(
  collector: PipelineLogCollector,
  startTime: number,
  stats: {
    fieldsExtracted: number
    evidenceCount: number
    errorsCount: number
    warningsCount: number
    tokenUsage?: {
      inputTokens: number
      outputTokens: number
      costEstimate?: number
    }
    policyType?: string
    promptVersion?: string
  }
): void {
  logStageComplete(collector, 'extract', startTime, {
    itemCount: stats.fieldsExtracted,
    errorCount: stats.errorsCount,
    warningCount: stats.warningsCount,
    tokenUsage: stats.tokenUsage,
  }, {
    evidenceCount: stats.evidenceCount,
    policyType: stats.policyType,
    promptVersion: stats.promptVersion,
  })
}

/**
 * Log QA scoring details
 */
export function logQAScoring(
  collector: PipelineLogCollector,
  startTime: number,
  stats: {
    rawScore: number
    finalScore: number
    gatesTriggered: string[]
    contradictionCount: number
    meetsMinimum: boolean
  }
): void {
  logStageComplete(collector, 'qa', startTime, {
    itemCount: stats.gatesTriggered.length,
  }, {
    rawScore: stats.rawScore,
    finalScore: stats.finalScore,
    gatesTriggered: stats.gatesTriggered,
    contradictionCount: stats.contradictionCount,
    meetsMinimum: stats.meetsMinimum,
  })
}

/**
 * Log data requests generation
 */
export function logDataRequests(
  collector: PipelineLogCollector,
  startTime: number,
  stats: {
    totalRequests: number
    criticalRequests: number
    canFinalize: boolean
  }
): void {
  logStageComplete(collector, 'data_requests', startTime, {
    itemCount: stats.totalRequests,
    errorCount: stats.criticalRequests,
  }, {
    canFinalize: stats.canFinalize,
  })
}

/**
 * Log analysis stage details
 */
export function logAnalysis(
  collector: PipelineLogCollector,
  startTime: number,
  stats: {
    gapsIdentified: number
    negotiationPoints: number
    benchmarkCitations: number
    tokenUsage?: {
      inputTokens: number
      outputTokens: number
      costEstimate?: number
    }
  }
): void {
  logStageComplete(collector, 'analyze', startTime, {
    itemCount: stats.gapsIdentified,
    tokenUsage: stats.tokenUsage,
  }, {
    negotiationPoints: stats.negotiationPoints,
    benchmarkCitations: stats.benchmarkCitations,
  })
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

/**
 * Get a summary of the pipeline run
 */
export function getLogSummary(collector: PipelineLogCollector): {
  runId: string
  documentId?: string
  totalDuration: number
  stages: {
    stage: PipelineStage
    status: 'success' | 'warning' | 'error'
    duration?: number
  }[]
  errorCount: number
  warningCount: number
} {
  const totalDuration = Date.now() - collector.startTime

  const stageStatus = new Map<PipelineStage, { status: 'success' | 'warning' | 'error'; duration?: number }>()

  for (const entry of collector.entries) {
    const current = stageStatus.get(entry.stage)
    const newStatus = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warning' : 'success'

    if (!current || (newStatus === 'error') || (newStatus === 'warning' && current.status === 'success')) {
      stageStatus.set(entry.stage, {
        status: newStatus,
        duration: entry.metrics?.duration,
      })
    } else if (current.duration === undefined && entry.metrics?.duration) {
      stageStatus.set(entry.stage, {
        ...current,
        duration: entry.metrics.duration,
      })
    }
  }

  const stages = Array.from(stageStatus.entries()).map(([stage, info]) => ({
    stage,
    ...info,
  }))

  return {
    runId: collector.runId,
    documentId: collector.documentId,
    totalDuration,
    stages,
    errorCount: collector.entries.filter(e => e.level === 'error').length,
    warningCount: collector.entries.filter(e => e.level === 'warn').length,
  }
}

/**
 * Format logs as JSON for storage
 */
export function formatLogsAsJSON(collector: PipelineLogCollector): string {
  return JSON.stringify({
    summary: getLogSummary(collector),
    entries: collector.entries,
  }, null, 2)
}

/**
 * Format logs as human-readable text
 */
export function formatLogsAsText(collector: PipelineLogCollector): string {
  const summary = getLogSummary(collector)
  const lines: string[] = [
    `Pipeline Run: ${summary.runId}`,
    summary.documentId ? `Document: ${summary.documentId}` : '',
    `Total Duration: ${summary.totalDuration}ms`,
    `Errors: ${summary.errorCount}, Warnings: ${summary.warningCount}`,
    '',
    'Stage Summary:',
    ...summary.stages.map(s =>
      `  ${s.stage.padEnd(15)} ${s.status.toUpperCase().padEnd(10)} ${s.duration ? `${s.duration}ms` : ''}`
    ),
    '',
    'Log Entries:',
    ...collector.entries.map(e => {
      const prefix = `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.stage}]`
      let line = `${prefix} ${e.message}`
      if (e.metrics) {
        line += ` | metrics: ${JSON.stringify(e.metrics)}`
      }
      if (e.error) {
        line += ` | error: ${e.error.message}`
      }
      return line
    }),
  ].filter(Boolean)

  return lines.join('\n')
}
