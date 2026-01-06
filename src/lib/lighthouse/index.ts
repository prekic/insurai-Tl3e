/**
 * Lighthouse CI Integration Module
 *
 * Provides utilities for automated performance scoring and analysis.
 * Integrates with Core Web Vitals and performance budgets.
 */

// Performance score thresholds (0-100 scale)
export const SCORE_THRESHOLDS = {
  good: 90,
  needsImprovement: 50,
  poor: 0,
} as const

// Core Web Vitals thresholds (in milliseconds or unitless for CLS)
export const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  INP: { good: 200, needsImprovement: 500 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
  TBT: { good: 200, needsImprovement: 600 },
} as const

export type MetricName = keyof typeof WEB_VITALS_THRESHOLDS
export type ScoreRating = 'good' | 'needs-improvement' | 'poor'

export interface LighthouseScore {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
}

export interface WebVitalMetric {
  name: MetricName
  value: number
  rating: ScoreRating
  threshold: { good: number; needsImprovement: number }
}

export interface PerformanceBudget {
  metric: string
  budget: number
  actual: number
  passed: boolean
  overage?: number
}

export interface LighthouseResult {
  url: string
  timestamp: string
  scores: LighthouseScore
  webVitals: WebVitalMetric[]
  budgets: PerformanceBudget[]
  passed: boolean
  summary: string
}

/**
 * Rate a metric value based on thresholds
 */
export function rateMetric(name: MetricName, value: number): ScoreRating {
  const threshold = WEB_VITALS_THRESHOLDS[name]
  if (!threshold) return 'poor'

  if (value <= threshold.good) return 'good'
  if (value <= threshold.needsImprovement) return 'needs-improvement'
  return 'poor'
}

/**
 * Rate a category score (0-100 scale)
 */
export function rateScore(score: number): ScoreRating {
  if (score >= SCORE_THRESHOLDS.good) return 'good'
  if (score >= SCORE_THRESHOLDS.needsImprovement) return 'needs-improvement'
  return 'poor'
}

/**
 * Convert Lighthouse score (0-1) to percentage (0-100)
 */
export function scoreToPercentage(score: number): number {
  return Math.round(score * 100)
}

/**
 * Convert percentage (0-100) to Lighthouse score (0-1)
 */
export function percentageToScore(percentage: number): number {
  return percentage / 100
}

/**
 * Create a Web Vital metric object
 */
export function createWebVitalMetric(
  name: MetricName,
  value: number
): WebVitalMetric {
  return {
    name,
    value,
    rating: rateMetric(name, value),
    threshold: WEB_VITALS_THRESHOLDS[name],
  }
}

/**
 * Check if a performance budget is met
 */
export function checkBudget(
  metric: string,
  budget: number,
  actual: number
): PerformanceBudget {
  const passed = actual <= budget
  return {
    metric,
    budget,
    actual,
    passed,
    overage: passed ? undefined : actual - budget,
  }
}

/**
 * Calculate overall pass/fail based on scores and budgets
 */
export function calculateOverallResult(
  scores: LighthouseScore,
  budgets: PerformanceBudget[]
): { passed: boolean; summary: string } {
  const criticalScores = {
    performance: scores.performance >= 80,
    accessibility: scores.accessibility >= 90,
    bestPractices: scores.bestPractices >= 90,
    seo: scores.seo >= 90,
  }

  const allScoresPassed = Object.values(criticalScores).every(Boolean)
  const allBudgetsPassed = budgets.every((b) => b.passed)
  const passed = allScoresPassed && allBudgetsPassed

  const failedCategories = Object.entries(criticalScores)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  const failedBudgets = budgets.filter((b) => !b.passed).map((b) => b.metric)

  let summary = ''
  if (passed) {
    summary = 'All performance checks passed'
  } else {
    const issues: string[] = []
    if (failedCategories.length > 0) {
      issues.push(`Failed categories: ${failedCategories.join(', ')}`)
    }
    if (failedBudgets.length > 0) {
      issues.push(`Budget exceeded: ${failedBudgets.join(', ')}`)
    }
    summary = issues.join('. ')
  }

  return { passed, summary }
}

/**
 * Create a full Lighthouse result object
 */
export function createLighthouseResult(
  url: string,
  scores: LighthouseScore,
  webVitals: WebVitalMetric[],
  budgets: PerformanceBudget[]
): LighthouseResult {
  const { passed, summary } = calculateOverallResult(scores, budgets)

  return {
    url,
    timestamp: new Date().toISOString(),
    scores,
    webVitals,
    budgets,
    passed,
    summary,
  }
}

/**
 * Default performance budgets for the application
 */
export const DEFAULT_BUDGETS = {
  // Core Web Vitals
  LCP: 2500, // Largest Contentful Paint (ms)
  FCP: 1800, // First Contentful Paint (ms)
  TBT: 300, // Total Blocking Time (ms)
  CLS: 0.1, // Cumulative Layout Shift

  // Resource budgets
  totalBundleSize: 500 * 1024, // 500KB total JS
  initialBundleSize: 200 * 1024, // 200KB initial JS
  cssSize: 50 * 1024, // 50KB CSS
  imageSize: 1024 * 1024, // 1MB images
  fontSize: 100 * 1024, // 100KB fonts

  // Network budgets
  totalRequests: 50,
  thirdPartyRequests: 10,
} as const

/**
 * Validate that all required scores meet minimum thresholds
 */
export function validateScores(
  scores: LighthouseScore,
  minScores: Partial<LighthouseScore> = {}
): { valid: boolean; failures: string[] } {
  const defaults = {
    performance: 80,
    accessibility: 90,
    bestPractices: 90,
    seo: 90,
  }

  const thresholds = { ...defaults, ...minScores }
  const failures: string[] = []

  for (const [key, minScore] of Object.entries(thresholds)) {
    const actual = scores[key as keyof LighthouseScore]
    if (actual < minScore) {
      failures.push(`${key}: ${actual} < ${minScore}`)
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  }
}

/**
 * Format a Lighthouse result for console output
 */
export function formatResult(result: LighthouseResult): string {
  const lines: string[] = [
    `\n📊 Lighthouse Report: ${result.url}`,
    `   Timestamp: ${result.timestamp}`,
    '',
    '   Scores:',
    `   • Performance:    ${result.scores.performance} (${rateScore(result.scores.performance)})`,
    `   • Accessibility:  ${result.scores.accessibility} (${rateScore(result.scores.accessibility)})`,
    `   • Best Practices: ${result.scores.bestPractices} (${rateScore(result.scores.bestPractices)})`,
    `   • SEO:            ${result.scores.seo} (${rateScore(result.scores.seo)})`,
    '',
    '   Web Vitals:',
  ]

  for (const vital of result.webVitals) {
    const unit = vital.name === 'CLS' ? '' : 'ms'
    lines.push(`   • ${vital.name}: ${vital.value}${unit} (${vital.rating})`)
  }

  if (result.budgets.length > 0) {
    lines.push('', '   Budgets:')
    for (const budget of result.budgets) {
      const status = budget.passed ? '✓' : '✗'
      lines.push(
        `   ${status} ${budget.metric}: ${budget.actual} / ${budget.budget}`
      )
    }
  }

  lines.push('', `   Result: ${result.passed ? '✓ PASSED' : '✗ FAILED'}`)
  lines.push(`   ${result.summary}`)

  return lines.join('\n')
}

/**
 * Get color for score (for terminal output)
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return '\x1b[32m' // Green
  if (score >= 50) return '\x1b[33m' // Yellow
  return '\x1b[31m' // Red
}

/**
 * Parse Lighthouse JSON output
 */
export function parseLighthouseOutput(json: {
  categories?: Record<string, { score?: number }>
  audits?: Record<
    string,
    { numericValue?: number; score?: number; displayValue?: string }
  >
}): { scores: LighthouseScore; webVitals: WebVitalMetric[] } {
  const categories = json.categories || {}
  const audits = json.audits || {}

  const scores: LighthouseScore = {
    performance: scoreToPercentage(categories.performance?.score || 0),
    accessibility: scoreToPercentage(categories.accessibility?.score || 0),
    bestPractices: scoreToPercentage(
      categories['best-practices']?.score || 0
    ),
    seo: scoreToPercentage(categories.seo?.score || 0),
  }

  const webVitals: WebVitalMetric[] = []

  // Extract Core Web Vitals
  const metricMappings: Record<string, MetricName> = {
    'largest-contentful-paint': 'LCP',
    'first-contentful-paint': 'FCP',
    'cumulative-layout-shift': 'CLS',
    'total-blocking-time': 'TBT',
    'max-potential-fid': 'FID',
    'interaction-to-next-paint': 'INP',
    'server-response-time': 'TTFB',
  }

  for (const [auditId, metricName] of Object.entries(metricMappings)) {
    const audit = audits[auditId]
    if (audit?.numericValue !== undefined) {
      webVitals.push(createWebVitalMetric(metricName, audit.numericValue))
    }
  }

  return { scores, webVitals }
}
