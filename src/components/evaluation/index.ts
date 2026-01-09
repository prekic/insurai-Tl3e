/**
 * Evaluation Components
 *
 * Reusable components for displaying policy evaluation results,
 * grades, scores, recommendations, and comparisons.
 */

// Grade and status display
export { GradeBadge, getGradeColor } from './GradeBadge'
export { StatusIndicator, getStatusConfig } from './StatusIndicator'

// Score visualization
export { ScoreBreakdown, OverallScore } from './ScoreBreakdown'

// Winner/rank indicators
export { WinnerBadge, TrophyIndicator, RankBadge } from './WinnerBadge'

// Recommendations
export { RecommendationCard, RecommendationList } from './RecommendationCard'

// Comparison components
export { ComparisonTable, ComparisonSummary } from './ComparisonTable'
export { CoverageMatrix, CoverageSummary } from './CoverageMatrix'
