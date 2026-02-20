/**
 * OCR Statistics Service
 *
 * Aggregates and tracks statistics for OCR cleanup operations.
 * Provides data for the Admin OCR Dashboard.
 *
 * Features:
 * 1. Execution Tracking - Track each pipeline run
 * 2. Aggregation - Hourly/daily/weekly stats
 * 3. Trend Analysis - Performance over time
 * 4. Quality Metrics - Confidence score distributions
 */

import type { PipelineResult, SanitizerStats } from './ocr-cleanup-pipeline'
import type { ConfidenceGrade, ConfidenceStatus } from './ocr-confidence'
import type { PatternStats } from './pattern-store'
import { calculateConfidenceScore } from './ocr-confidence'
import { getPatternStore } from './pattern-store'

// ============================================================================
// TYPES
// ============================================================================

export interface OCRExecution {
  /** Unique execution ID */
  id: string

  /** Document ID being processed */
  documentId: string

  /** User ID who initiated */
  userId?: string

  /** Pipeline type used */
  pipelineType: 'full' | 'standard' | 'quick'

  /** Start time */
  startedAt: string

  /** End time */
  completedAt: string

  /** Duration in milliseconds */
  durationMs: number

  /** Success/failure */
  success: boolean

  /** Error message if failed */
  error?: string

  /** Input size in characters */
  inputSize: number

  /** Output size in characters */
  outputSize: number

  /** Reduction percentage */
  reductionPercent: number

  /** Number of chunks processed */
  totalChunks: number

  /** Chunks that passed QA */
  chunksPassedQA: number

  /** Chunks that needed retry */
  chunksRetried: number

  /** Chunks that failed */
  chunksFailed: number

  /** Confidence score */
  confidenceScore: number

  /** Confidence grade */
  confidenceGrade: ConfidenceGrade

  /** Sanitizer statistics */
  sanitizerStats: SanitizerStats

  /** Patterns detected */
  patternsDetected: number

  /** New patterns learned */
  newPatternsLearned: number
}

export interface OCRAggregatedStats {
  /** Time period for aggregation */
  period: 'hour' | 'day' | 'week' | 'month'

  /** Period start time */
  periodStart: string

  /** Period end time */
  periodEnd: string

  /** Total executions */
  totalExecutions: number

  /** Successful executions */
  successfulExecutions: number

  /** Failed executions */
  failedExecutions: number

  /** Success rate (0-1) */
  successRate: number

  /** Average duration in ms */
  avgDuration: number

  /** Min duration */
  minDuration: number

  /** Max duration */
  maxDuration: number

  /** Total characters processed */
  totalCharsProcessed: number

  /** Total characters output */
  totalCharsOutput: number

  /** Average reduction percent */
  avgReductionPercent: number

  /** Confidence score statistics */
  confidenceStats: {
    average: number
    min: number
    max: number
    gradeDistribution: Record<ConfidenceGrade, number>
    statusDistribution: Record<ConfidenceStatus, number>
  }

  /** QA gate statistics */
  qaStats: {
    totalChunks: number
    chunksPassedFirstTry: number
    chunksPassedAfterRetry: number
    chunksFailed: number
    firstTryPassRate: number
    overallPassRate: number
  }

  /** Sanitizer aggregate stats */
  sanitizerStats: {
    totalLinesRemoved: number
    totalGarbageLinesRemoved: number
    totalFragmentsMerged: number
    totalControlCharsRemoved: number
    avgLinesRemovedPerDoc: number
  }

  /** Pattern statistics */
  patternStats: {
    totalPatternsDetected: number
    newPatternsLearned: number
    avgPatternsPerDoc: number
  }

  /** By pipeline type breakdown */
  byPipelineType: Record<string, number>
}

export interface OCRTrendPoint {
  timestamp: string
  value: number
  label?: string
}

export interface OCRTrends {
  /** Executions over time */
  executions: OCRTrendPoint[]

  /** Success rate over time */
  successRate: OCRTrendPoint[]

  /** Average confidence over time */
  avgConfidence: OCRTrendPoint[]

  /** Average duration over time */
  avgDuration: OCRTrendPoint[]

  /** Patterns detected over time */
  patternsDetected: OCRTrendPoint[]
}

export interface OCRDashboardData {
  /** Current period stats */
  current: OCRAggregatedStats

  /** Previous period stats (for comparison) */
  previous: OCRAggregatedStats | null

  /** Trends over selected period */
  trends: OCRTrends

  /** Recent executions */
  recentExecutions: OCRExecution[]

  /** Top failing patterns */
  topFailingPatterns: Array<{
    pattern: string
    type: string
    failureCount: number
    occurrenceCount: number
  }>

  /** Pattern store stats */
  patternStats: PatternStats

  /** Last updated timestamp */
  lastUpdated: string
}

// ============================================================================
// STORAGE
// ============================================================================

// In-memory storage (would be replaced with database in production)
const executionStore: OCRExecution[] = []
const MAX_EXECUTIONS = 10000

// ============================================================================
// EXECUTION TRACKING
// ============================================================================

/**
 * Record an OCR pipeline execution
 */
export function recordExecution(
  result: PipelineResult,
  options: {
    documentId: string
    userId?: string
    pipelineType?: 'full' | 'standard' | 'quick'
    startTime?: Date
  }
): OCRExecution {
  const confidenceScore = calculateConfidenceScore(result)

  const execution: OCRExecution = {
    id: generateExecutionId(),
    documentId: options.documentId,
    userId: options.userId,
    pipelineType: options.pipelineType || 'standard',
    startedAt: options.startTime?.toISOString() || new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: result.stats.totalProcessingTimeMs,
    success: result.success,
    error: result.success ? undefined : getErrorFromResult(result),
    inputSize: result.stats.originalLength,
    outputSize: result.stats.finalLength,
    reductionPercent: result.stats.reductionPercent,
    totalChunks: result.stats.totalChunks,
    chunksPassedQA: result.qaReport
      ? result.qaReport.passedChunks + result.qaReport.retriedChunks
      : result.stats.totalChunks,
    chunksRetried: result.stats.chunksRetried,
    chunksFailed: result.stats.chunksFailed,
    confidenceScore: confidenceScore.score,
    confidenceGrade: confidenceScore.grade,
    sanitizerStats: result.stats.sanitizerStats,
    patternsDetected: 0,
    newPatternsLearned: 0,
  }

  // Record patterns from remaining artifacts
  if (result.artifactsRemaining && result.remainingArtifacts.length > 0) {
    const patternStore = getPatternStore()
    const newPatterns = patternStore.recordPatternsFromText(
      result.remainingArtifacts.join('\n'),
      options.documentId,
      true
    )
    execution.patternsDetected = result.remainingArtifacts.length
    execution.newPatternsLearned = newPatterns.filter(p => p.occurrenceCount === 1).length
  }

  // Store execution
  executionStore.push(execution)

  // Prune old executions if over limit
  if (executionStore.length > MAX_EXECUTIONS) {
    executionStore.splice(0, executionStore.length - MAX_EXECUTIONS)
  }

  return execution
}

/**
 * Get execution by ID
 */
export function getExecution(id: string): OCRExecution | undefined {
  return executionStore.find(e => e.id === id)
}

/**
 * Get recent executions
 */
export function getRecentExecutions(limit: number = 50): OCRExecution[] {
  return executionStore.slice(-limit).reverse()
}

/**
 * Get executions within a time range
 */
export function getExecutionsInRange(start: Date, end: Date): OCRExecution[] {
  return executionStore.filter(e => {
    const time = new Date(e.startedAt).getTime()
    return time >= start.getTime() && time <= end.getTime()
  })
}

// ============================================================================
// AGGREGATION
// ============================================================================

/**
 * Aggregate statistics for a time period
 */
export function aggregateStats(
  executions: OCRExecution[],
  period: 'hour' | 'day' | 'week' | 'month',
  periodStart: Date,
  periodEnd: Date
): OCRAggregatedStats {
  const successfulExecs = executions.filter(e => e.success)
  const failedExecs = executions.filter(e => !e.success)

  // Grade distribution
  const gradeDistribution: Record<ConfidenceGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  const statusDistribution: Record<ConfidenceStatus, number> = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    critical: 0,
  }

  for (const exec of executions) {
    gradeDistribution[exec.confidenceGrade]++
    statusDistribution[getStatusFromGrade(exec.confidenceGrade)]++
  }

  // QA stats
  let totalChunks = 0
  let chunksPassedFirstTry = 0
  let chunksPassedAfterRetry = 0
  let chunksFailed = 0

  for (const exec of executions) {
    totalChunks += exec.totalChunks
    chunksPassedFirstTry += exec.chunksPassedQA - exec.chunksRetried
    chunksPassedAfterRetry += exec.chunksRetried - exec.chunksFailed
    chunksFailed += exec.chunksFailed
  }

  // Sanitizer stats
  let totalLinesRemoved = 0
  let totalGarbageLinesRemoved = 0
  let totalFragmentsMerged = 0
  let totalControlCharsRemoved = 0

  for (const exec of executions) {
    totalLinesRemoved += exec.sanitizerStats.linesRemoved
    totalGarbageLinesRemoved += exec.sanitizerStats.garbageLinesRemoved
    totalFragmentsMerged += exec.sanitizerStats.spacedFragmentsMerged
    totalControlCharsRemoved += exec.sanitizerStats.controlCharsRemoved
  }

  // Pipeline type breakdown
  const byPipelineType: Record<string, number> = { full: 0, standard: 0, quick: 0 }
  for (const exec of executions) {
    byPipelineType[exec.pipelineType]++
  }

  // Pattern stats
  let totalPatternsDetected = 0
  let newPatternsLearned = 0

  for (const exec of executions) {
    totalPatternsDetected += exec.patternsDetected
    newPatternsLearned += exec.newPatternsLearned
  }

  const durations = executions.map(e => e.durationMs)
  const confidenceScores = executions.map(e => e.confidenceScore)
  const reductionPercents = executions.map(e => e.reductionPercent)

  return {
    period,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalExecutions: executions.length,
    successfulExecutions: successfulExecs.length,
    failedExecutions: failedExecs.length,
    successRate: executions.length > 0 ? successfulExecs.length / executions.length : 0,
    avgDuration: average(durations),
    minDuration: durations.length > 0 ? Math.min(...durations) : 0,
    maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
    totalCharsProcessed: executions.reduce((sum, e) => sum + e.inputSize, 0),
    totalCharsOutput: executions.reduce((sum, e) => sum + e.outputSize, 0),
    avgReductionPercent: average(reductionPercents),
    confidenceStats: {
      average: average(confidenceScores),
      min: confidenceScores.length > 0 ? Math.min(...confidenceScores) : 0,
      max: confidenceScores.length > 0 ? Math.max(...confidenceScores) : 0,
      gradeDistribution,
      statusDistribution,
    },
    qaStats: {
      totalChunks,
      chunksPassedFirstTry,
      chunksPassedAfterRetry,
      chunksFailed,
      firstTryPassRate: totalChunks > 0 ? chunksPassedFirstTry / totalChunks : 0,
      overallPassRate: totalChunks > 0 ? (chunksPassedFirstTry + chunksPassedAfterRetry) / totalChunks : 0,
    },
    sanitizerStats: {
      totalLinesRemoved,
      totalGarbageLinesRemoved,
      totalFragmentsMerged,
      totalControlCharsRemoved,
      avgLinesRemovedPerDoc: executions.length > 0 ? totalLinesRemoved / executions.length : 0,
    },
    patternStats: {
      totalPatternsDetected,
      newPatternsLearned,
      avgPatternsPerDoc: executions.length > 0 ? totalPatternsDetected / executions.length : 0,
    },
    byPipelineType,
  }
}

/**
 * Get stats for current period
 */
export function getCurrentPeriodStats(period: 'hour' | 'day' | 'week' | 'month'): OCRAggregatedStats {
  const now = new Date()
  const { start, end } = getPeriodBounds(now, period)
  const executions = getExecutionsInRange(start, end)
  return aggregateStats(executions, period, start, end)
}

/**
 * Get stats for previous period
 */
export function getPreviousPeriodStats(
  period: 'hour' | 'day' | 'week' | 'month'
): OCRAggregatedStats {
  const now = new Date()
  const { start: currentStart } = getPeriodBounds(now, period)

  // Previous period ends where current starts
  const previousEnd = new Date(currentStart.getTime() - 1)
  const { start: previousStart } = getPeriodBounds(previousEnd, period)

  const executions = getExecutionsInRange(previousStart, previousEnd)
  return aggregateStats(executions, period, previousStart, previousEnd)
}

// ============================================================================
// TRENDS
// ============================================================================

/**
 * Get trend data for the dashboard
 */
export function getTrends(period: 'day' | 'week' | 'month'): OCRTrends {
  const now = new Date()
  const { start, end } = getPeriodBounds(now, period)
  const executions = getExecutionsInRange(start, end)

  // Group by hour/day depending on period
  const groupBy = period === 'day' ? 'hour' : 'day'
  const groups = groupExecutionsByTime(executions, groupBy)

  const executionsTrend: OCRTrendPoint[] = []
  const successRateTrend: OCRTrendPoint[] = []
  const avgConfidenceTrend: OCRTrendPoint[] = []
  const avgDurationTrend: OCRTrendPoint[] = []
  const patternsDetectedTrend: OCRTrendPoint[] = []

  for (const [timestamp, execs] of groups) {
    executionsTrend.push({
      timestamp,
      value: execs.length,
    })

    successRateTrend.push({
      timestamp,
      value: execs.length > 0 ? execs.filter(e => e.success).length / execs.length : 0,
    })

    avgConfidenceTrend.push({
      timestamp,
      value: average(execs.map(e => e.confidenceScore)),
    })

    avgDurationTrend.push({
      timestamp,
      value: average(execs.map(e => e.durationMs)),
    })

    patternsDetectedTrend.push({
      timestamp,
      value: execs.reduce((sum, e) => sum + e.patternsDetected, 0),
    })
  }

  return {
    executions: executionsTrend,
    successRate: successRateTrend,
    avgConfidence: avgConfidenceTrend,
    avgDuration: avgDurationTrend,
    patternsDetected: patternsDetectedTrend,
  }
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

/**
 * Get all data needed for the OCR Dashboard
 */
export function getDashboardData(period: 'day' | 'week' | 'month' = 'day'): OCRDashboardData {
  const current = getCurrentPeriodStats(period)
  const previous = getPreviousPeriodStats(period)
  const trends = getTrends(period)
  const recentExecutions = getRecentExecutions(20)
  const patternStore = getPatternStore()
  const patternStats = patternStore.getStats()

  // Get top failing patterns
  const topFailingPatterns = patternStore
    .getTopFailingPatterns(10)
    .map(p => ({
      pattern: p.pattern,
      type: p.type,
      failureCount: p.failureCount,
      occurrenceCount: p.occurrenceCount,
    }))

  return {
    current,
    previous,
    trends,
    recentExecutions,
    topFailingPatterns,
    patternStats,
    lastUpdated: new Date().toISOString(),
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getErrorFromResult(result: PipelineResult): string {
  if (!result.preservationValid) {
    return `Preservation failed: ${result.preservationIssues.join('; ')}`
  }
  if (result.hasQAFailures) {
    return `QA failed for ${result.failedChunkIndices.length} chunk(s)`
  }
  if (result.artifactsRemaining) {
    return `Artifacts remaining: ${result.remainingArtifacts.join(', ')}`
  }
  return 'Unknown error'
}

function getStatusFromGrade(grade: ConfidenceGrade): ConfidenceStatus {
  switch (grade) {
    case 'A':
      return 'excellent'
    case 'B':
      return 'good'
    case 'C':
      return 'fair'
    case 'D':
      return 'poor'
    case 'F':
      return 'critical'
  }
}

function getPeriodBounds(
  date: Date,
  period: 'hour' | 'day' | 'week' | 'month'
): { start: Date; end: Date } {
  const start = new Date(date)
  const end = new Date(date)

  switch (period) {
    case 'hour':
      start.setMinutes(0, 0, 0)
      end.setMinutes(59, 59, 999)
      break
    case 'day':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'week':
      start.setDate(start.getDate() - start.getDay())
      start.setHours(0, 0, 0, 0)
      end.setDate(end.getDate() + (6 - end.getDay()))
      end.setHours(23, 59, 59, 999)
      break
    case 'month':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1, 0)
      end.setHours(23, 59, 59, 999)
      break
  }

  return { start, end }
}

function groupExecutionsByTime(
  executions: OCRExecution[],
  groupBy: 'hour' | 'day'
): Map<string, OCRExecution[]> {
  const groups = new Map<string, OCRExecution[]>()

  for (const exec of executions) {
    const date = new Date(exec.startedAt)
    let key: string

    if (groupBy === 'hour') {
      key = `${date.toISOString().slice(0, 13)}:00:00Z`
    } else {
      key = date.toISOString().slice(0, 10)
    }

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    const group = groups.get(key)
    if (group) group.push(exec)
  }

  // Sort by key
  return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((a, b) => a + b, 0) / numbers.length
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Clear all execution data (mainly for testing)
 */
export function clearExecutionStore(): void {
  executionStore.length = 0
}
