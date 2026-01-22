/**
 * OCR Confidence Scoring System
 *
 * Calculates confidence scores (0-100) for OCR cleanup results based on:
 * 1. QA Gate Results - pass/fail rates and severity
 * 2. Sanitizer Statistics - amount of cleanup performed
 * 3. Data Preservation - critical data integrity
 * 4. Artifact Detection - remaining noise
 * 5. Content Ratio - reasonable output size
 *
 * Score interpretation:
 * - 90-100: Excellent - High confidence, minimal cleanup needed
 * - 75-89: Good - Reliable output, minor issues
 * - 60-74: Fair - Usable but may need review
 * - 40-59: Poor - Significant issues, manual review recommended
 * - 0-39: Critical - Unreliable, requires manual intervention
 */

import type { PipelineResult, PipelineStats, SanitizerStats } from './ocr-cleanup-pipeline'
import type { DocumentQAReport } from './qa-gates'

// ============================================================================
// TYPES
// ============================================================================

export interface ConfidenceScore {
  /** Overall confidence score (0-100) */
  score: number

  /** Grade based on score */
  grade: ConfidenceGrade

  /** Human-readable status */
  status: ConfidenceStatus

  /** Detailed breakdown of score components */
  breakdown: ScoreBreakdown

  /** Factors that positively affected the score */
  positiveFactors: ScoringFactor[]

  /** Factors that negatively affected the score */
  negativeFactors: ScoringFactor[]

  /** Recommendations for improvement */
  recommendations: string[]

  /** Timestamp of calculation */
  calculatedAt: string
}

export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export type ConfidenceStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical'

export interface ScoreBreakdown {
  /** QA gate score (0-35 points) */
  qaGateScore: number
  qaGateWeight: number

  /** Preservation score (0-25 points) */
  preservationScore: number
  preservationWeight: number

  /** Artifact score (0-20 points) */
  artifactScore: number
  artifactWeight: number

  /** Content ratio score (0-15 points) */
  contentRatioScore: number
  contentRatioWeight: number

  /** Processing efficiency score (0-5 points) */
  efficiencyScore: number
  efficiencyWeight: number

  /** Bonuses and deductions */
  bonuses: Array<{ reason: string; points: number }>
  deductions: Array<{ reason: string; points: number }>
}

export interface ScoringFactor {
  factor: string
  impact: 'high' | 'medium' | 'low'
  details?: string
}

export interface ConfidenceConfig {
  /** Weights for each score component (must sum to 100) */
  weights?: {
    qaGates: number
    preservation: number
    artifacts: number
    contentRatio: number
    efficiency: number
  }

  /** Thresholds for various checks */
  thresholds?: {
    minContentRatio: number
    maxReductionPercent: number
    maxRetryAttempts: number
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<ConfidenceConfig> = {
  weights: {
    qaGates: 35,
    preservation: 25,
    artifacts: 20,
    contentRatio: 15,
    efficiency: 5,
  },
  thresholds: {
    minContentRatio: 0.5,
    maxReductionPercent: 50,
    maxRetryAttempts: 2,
  },
}


// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Calculate confidence score for a pipeline result
 *
 * @param result - The pipeline result to score
 * @param config - Optional configuration overrides
 * @returns Detailed confidence score
 */
export function calculateConfidenceScore(
  result: PipelineResult,
  config: ConfidenceConfig = {}
): ConfidenceScore {
  const cfg = {
    weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...config.thresholds },
  }

  const breakdown: ScoreBreakdown = {
    qaGateScore: 0,
    qaGateWeight: cfg.weights.qaGates,
    preservationScore: 0,
    preservationWeight: cfg.weights.preservation,
    artifactScore: 0,
    artifactWeight: cfg.weights.artifacts,
    contentRatioScore: 0,
    contentRatioWeight: cfg.weights.contentRatio,
    efficiencyScore: 0,
    efficiencyWeight: cfg.weights.efficiency,
    bonuses: [],
    deductions: [],
  }

  const positiveFactors: ScoringFactor[] = []
  const negativeFactors: ScoringFactor[] = []
  const recommendations: string[] = []

  // Calculate each component
  breakdown.qaGateScore = calculateQAGateScore(result.qaReport, positiveFactors, negativeFactors)
  breakdown.preservationScore = calculatePreservationScore(
    result,
    positiveFactors,
    negativeFactors,
    recommendations
  )
  breakdown.artifactScore = calculateArtifactScore(
    result,
    positiveFactors,
    negativeFactors,
    recommendations
  )
  breakdown.contentRatioScore = calculateContentRatioScore(
    result.stats,
    cfg.thresholds,
    positiveFactors,
    negativeFactors,
    recommendations
  )
  breakdown.efficiencyScore = calculateEfficiencyScore(
    result,
    cfg.thresholds,
    positiveFactors,
    negativeFactors
  )

  // Apply bonuses and deductions
  applyBonusesAndDeductions(result, breakdown, positiveFactors, negativeFactors)

  // Calculate final score
  const baseScore =
    breakdown.qaGateScore +
    breakdown.preservationScore +
    breakdown.artifactScore +
    breakdown.contentRatioScore +
    breakdown.efficiencyScore

  const bonusPoints = breakdown.bonuses.reduce((sum, b) => sum + b.points, 0)
  const deductionPoints = breakdown.deductions.reduce((sum, d) => sum + d.points, 0)

  const finalScore = Math.max(0, Math.min(100, baseScore + bonusPoints - deductionPoints))

  const grade = getGrade(finalScore)
  const status = getStatus(finalScore)

  return {
    score: Math.round(finalScore * 10) / 10, // Round to 1 decimal
    grade,
    status,
    breakdown,
    positiveFactors,
    negativeFactors,
    recommendations: recommendations.slice(0, 5), // Top 5 recommendations
    calculatedAt: new Date().toISOString(),
  }
}

// ============================================================================
// COMPONENT SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate score based on QA gate results
 * Max: 35 points
 */
function calculateQAGateScore(
  qaReport: DocumentQAReport | null,
  positives: ScoringFactor[],
  negatives: ScoringFactor[]
): number {
  if (!qaReport) {
    // No QA report means QA was skipped - neutral score
    return 20
  }

  const { totalChunks, passedChunks, retriedChunks, failedChunks, manualReviewChunks } = qaReport

  if (totalChunks === 0) {
    return 35 // Empty document passes
  }

  // Base score from pass rate
  const directPassRate = passedChunks / totalChunks
  const totalPassRate = (passedChunks + retriedChunks) / totalChunks

  // Start with base score from pass rate (0-25 points)
  let score = totalPassRate * 25

  // Add points for chunks that passed on first try (0-10 points)
  const firstTryBonus = directPassRate * 10
  score += firstTryBonus

  // Deduct for failures
  if (failedChunks > 0) {
    const failureDeduction = Math.min(15, failedChunks * 5)
    score -= failureDeduction
    negatives.push({
      factor: `${failedChunks} chunk(s) failed QA`,
      impact: failedChunks > 2 ? 'high' : 'medium',
      details: `Failed chunks require manual review`,
    })
  }

  if (manualReviewChunks > 0) {
    negatives.push({
      factor: `${manualReviewChunks} chunk(s) need manual review`,
      impact: 'medium',
    })
  }

  // Positive factors
  if (directPassRate === 1) {
    positives.push({
      factor: 'All chunks passed QA on first attempt',
      impact: 'high',
    })
  } else if (totalPassRate === 1) {
    positives.push({
      factor: 'All chunks passed QA after retries',
      impact: 'medium',
    })
  }

  return Math.max(0, Math.min(35, score))
}

/**
 * Calculate score based on data preservation
 * Max: 25 points
 */
function calculatePreservationScore(
  result: PipelineResult,
  positives: ScoringFactor[],
  negatives: ScoringFactor[],
  recommendations: string[]
): number {
  if (result.preservationValid) {
    positives.push({
      factor: 'Critical data preserved correctly',
      impact: 'high',
      details: 'Policy numbers, dates, amounts intact',
    })
    return 25
  }

  // Deduct based on preservation issues
  const issueCount = result.preservationIssues.length
  let score = 25 - Math.min(25, issueCount * 5)

  // Analyze issue types
  const criticalIssues = result.preservationIssues.filter(
    issue =>
      issue.toLowerCase().includes('policy') ||
      issue.toLowerCase().includes('amount') ||
      issue.toLowerCase().includes('date')
  )

  if (criticalIssues.length > 0) {
    score = Math.min(score, 10) // Cap at 10 for critical issues
    negatives.push({
      factor: `Critical preservation issue: ${criticalIssues[0]}`,
      impact: 'high',
    })
    recommendations.push('Review extracted policy numbers and dates for accuracy')
  }

  negatives.push({
    factor: `${issueCount} preservation issue(s) detected`,
    impact: issueCount > 2 ? 'high' : 'medium',
    details: result.preservationIssues.slice(0, 2).join('; '),
  })

  return Math.max(0, score)
}

/**
 * Calculate score based on remaining artifacts
 * Max: 20 points
 */
function calculateArtifactScore(
  result: PipelineResult,
  positives: ScoringFactor[],
  negatives: ScoringFactor[],
  recommendations: string[]
): number {
  if (!result.artifactsRemaining) {
    positives.push({
      factor: 'No OCR artifacts remaining',
      impact: 'medium',
    })
    return 20
  }

  const artifactCount = result.remainingArtifacts.length
  const score = 20 - Math.min(20, artifactCount * 4)

  // Categorize artifacts
  const barcodeArtifacts = result.remainingArtifacts.filter(
    a => a.includes('B^^^B') || a.includes('a!!!a') || a.includes('barcode')
  )
  const spacedFragments = result.remainingArtifacts.filter(
    a => a.includes('spaced') || a.includes('fragment')
  )

  if (barcodeArtifacts.length > 0) {
    negatives.push({
      factor: `Barcode/scanner artifacts detected`,
      impact: 'medium',
      details: barcodeArtifacts.slice(0, 2).join(', '),
    })
    recommendations.push('Consider re-scanning document with cleaner settings')
  }

  if (spacedFragments.length > 0) {
    negatives.push({
      factor: `Spaced Turkish fragments remaining`,
      impact: 'medium',
    })
    recommendations.push('Some Turkish text may need manual joining')
  }

  return Math.max(0, score)
}

/**
 * Calculate score based on content ratio
 * Max: 15 points
 */
function calculateContentRatioScore(
  stats: PipelineStats,
  thresholds: { minContentRatio: number; maxReductionPercent: number },
  positives: ScoringFactor[],
  negatives: ScoringFactor[],
  recommendations: string[]
): number {
  const { originalLength, finalLength, reductionPercent } = stats

  if (originalLength === 0) {
    return 15 // Empty input
  }

  const contentRatio = finalLength / originalLength

  // Ideal content ratio is 0.6-0.9 (40% to 10% reduction)
  if (contentRatio >= 0.6 && contentRatio <= 0.95) {
    positives.push({
      factor: `Healthy content ratio (${(contentRatio * 100).toFixed(0)}%)`,
      impact: 'low',
    })
    return 15
  }

  if (contentRatio > 0.95) {
    // Very little was cleaned - might have missed garbage
    positives.push({
      factor: `Clean input (${reductionPercent}% reduction)`,
      impact: 'low',
    })
    return 14
  }

  if (contentRatio < thresholds.minContentRatio) {
    // Too much was removed
    negatives.push({
      factor: `High content removal (${reductionPercent}% reduction)`,
      impact: reductionPercent > 60 ? 'high' : 'medium',
    })
    recommendations.push('Review sanitization - significant content may have been removed')
    return Math.max(0, 15 - Math.floor((thresholds.minContentRatio - contentRatio) * 30))
  }

  // Between minContentRatio and 0.6
  return Math.max(5, 15 - Math.floor((0.6 - contentRatio) * 20))
}

/**
 * Calculate score based on processing efficiency
 * Max: 5 points
 */
function calculateEfficiencyScore(
  result: PipelineResult,
  _thresholds: { maxRetryAttempts: number },
  positives: ScoringFactor[],
  negatives: ScoringFactor[]
): number {
  const { chunksRetried, totalChunks } = result.stats

  if (totalChunks === 0) {
    return 5
  }

  const retryRate = chunksRetried / totalChunks

  if (retryRate === 0) {
    positives.push({
      factor: 'No retries needed',
      impact: 'low',
    })
    return 5
  }

  if (retryRate < 0.1) {
    return 4 // Minor retries
  }

  if (retryRate < 0.3) {
    negatives.push({
      factor: `${(retryRate * 100).toFixed(0)}% of chunks needed retry`,
      impact: 'low',
    })
    return 3
  }

  negatives.push({
    factor: `High retry rate (${(retryRate * 100).toFixed(0)}%)`,
    impact: 'medium',
  })
  return Math.max(0, 5 - Math.floor(retryRate * 10))
}

// ============================================================================
// BONUSES AND DEDUCTIONS
// ============================================================================

/**
 * Apply bonuses and deductions based on overall result
 */
function applyBonusesAndDeductions(
  result: PipelineResult,
  breakdown: ScoreBreakdown,
  positives: ScoringFactor[],
  negatives: ScoringFactor[]
): void {
  // Bonus: Perfect QA pass
  if (result.qaReport?.overallStatus === 'passed' && result.stats.chunksRetried === 0) {
    breakdown.bonuses.push({ reason: 'Perfect QA pass (no retries)', points: 3 })
    positives.push({
      factor: 'Perfect pipeline execution',
      impact: 'high',
    })
  }

  // Bonus: Fast processing (under 1 second for small docs)
  if (result.stats.totalProcessingTimeMs < 1000 && result.stats.originalLength < 10000) {
    breakdown.bonuses.push({ reason: 'Fast processing', points: 2 })
  }

  // Bonus: Good sanitizer stats
  const stats = result.stats.sanitizerStats
  if (stats.spacedFragmentsMerged > 5) {
    breakdown.bonuses.push({ reason: 'Successfully merged spaced fragments', points: 2 })
    positives.push({
      factor: `Merged ${stats.spacedFragmentsMerged} spaced Turkish fragments`,
      impact: 'medium',
    })
  }

  // Deduction: Overall failure
  if (!result.success) {
    breakdown.deductions.push({ reason: 'Pipeline did not complete successfully', points: 10 })
    negatives.push({
      factor: 'Pipeline execution failed',
      impact: 'high',
    })
  }

  // Deduction: High garbage removal
  if (stats.garbageLinesRemoved > 20) {
    breakdown.deductions.push({
      reason: `Heavy garbage removal (${stats.garbageLinesRemoved} lines)`,
      points: 3,
    })
  }

  // Deduction: Control chars detected
  if (stats.controlCharsRemoved > 10) {
    breakdown.deductions.push({
      reason: `Many control chars removed (${stats.controlCharsRemoved})`,
      points: 2,
    })
    negatives.push({
      factor: 'Document contained many control characters',
      impact: 'low',
    })
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get grade from score
 */
function getGrade(score: number): ConfidenceGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

/**
 * Get status from score
 */
function getStatus(score: number): ConfidenceStatus {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'poor'
  return 'critical'
}

// ============================================================================
// QUICK SCORING FOR SANITIZER RESULTS
// ============================================================================

/**
 * Calculate a quick confidence score for sanitizer-only results
 * Useful for quick cleanup operations without full QA
 */
export function calculateQuickConfidence(
  originalLength: number,
  finalLength: number,
  sanitizerStats: SanitizerStats,
  hasArtifacts: boolean = false
): number {
  let score = 100

  // Content ratio check
  const ratio = originalLength > 0 ? finalLength / originalLength : 1
  if (ratio < 0.3) {
    score -= 30 // Too much removed
  } else if (ratio < 0.5) {
    score -= 15
  } else if (ratio > 0.98 && sanitizerStats.garbageLinesRemoved === 0) {
    score -= 5 // Suspiciously clean
  }

  // Artifact check
  if (hasArtifacts) {
    score -= 20
  }

  // High garbage removal
  if (sanitizerStats.garbageLinesRemoved > 30) {
    score -= 10
  }

  // Control chars
  if (sanitizerStats.controlCharsRemoved > 20) {
    score -= 5
  }

  // Positive: good fragment merging
  if (sanitizerStats.spacedFragmentsMerged > 3) {
    score += 5
  }

  return Math.max(0, Math.min(100, score))
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

/**
 * Aggregate confidence scores from multiple results
 */
export function aggregateConfidenceScores(scores: ConfidenceScore[]): {
  averageScore: number
  minScore: number
  maxScore: number
  gradeDistribution: Record<ConfidenceGrade, number>
  statusDistribution: Record<ConfidenceStatus, number>
} {
  if (scores.length === 0) {
    return {
      averageScore: 0,
      minScore: 0,
      maxScore: 0,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      statusDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 },
    }
  }

  const scoreValues = scores.map(s => s.score)

  const gradeDistribution: Record<ConfidenceGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  const statusDistribution: Record<ConfidenceStatus, number> = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    critical: 0,
  }

  for (const score of scores) {
    gradeDistribution[score.grade]++
    statusDistribution[score.status]++
  }

  return {
    averageScore: scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length,
    minScore: Math.min(...scoreValues),
    maxScore: Math.max(...scoreValues),
    gradeDistribution,
    statusDistribution,
  }
}

/**
 * Get color for confidence grade (for UI)
 */
export function getConfidenceColor(grade: ConfidenceGrade): string {
  switch (grade) {
    case 'A':
      return 'text-green-600 bg-green-100'
    case 'B':
      return 'text-blue-600 bg-blue-100'
    case 'C':
      return 'text-yellow-600 bg-yellow-100'
    case 'D':
      return 'text-orange-600 bg-orange-100'
    case 'F':
      return 'text-red-600 bg-red-100'
  }
}

/**
 * Get icon name for confidence status (for UI)
 */
export function getConfidenceIcon(status: ConfidenceStatus): string {
  switch (status) {
    case 'excellent':
      return 'check-circle'
    case 'good':
      return 'thumbs-up'
    case 'fair':
      return 'alert-circle'
    case 'poor':
      return 'alert-triangle'
    case 'critical':
      return 'x-circle'
  }
}
