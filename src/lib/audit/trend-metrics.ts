/**
 * Phase 4 — Fixture-level trend metrics.
 *
 * Detects the regression class "previous run extracted 10 insights, this
 * run extracted 3" — both runs pass schema validation, but the structured
 * output silently lost signal. Operates on the golden corpus snapshots
 * persisted in `audit_trend_snapshots`.
 *
 * Six metrics are extracted per fixture run:
 *   - coverages
 *   - exclusions
 *   - conditional_deductibles
 *   - ai_insights
 *   - supplementary_count (subset of coverages where category === 'supplementary')
 *   - bundle_products
 *
 * Pure functions, no I/O. Used by `scripts/audit-trend-track.ts` and any
 * future UI surface that wants to display trend deltas.
 */

export interface TrendMetrics {
  coverages: number
  exclusions: number
  conditional_deductibles: number
  ai_insights: number
  supplementary_count: number
  bundle_products: number
}

export type TrendMetricKey = keyof TrendMetrics

export const TREND_METRIC_KEYS: readonly TrendMetricKey[] = [
  'coverages',
  'exclusions',
  'conditional_deductibles',
  'ai_insights',
  'supplementary_count',
  'bundle_products',
] as const

/**
 * Default regression threshold: a metric drop of >30% from baseline
 * triggers a `regression-warn`; >60% triggers `regression-critical`.
 * Tunable per-call but the defaults match the plan's "drops by >30%"
 * sensitivity.
 */
export const DEFAULT_WARN_DROP_RATIO = 0.3
export const DEFAULT_CRITICAL_DROP_RATIO = 0.6

/**
 * Minimum baseline value before regression flags fire. Prevents small-count
 * extraction-noise (e.g. `3 → 0` exclusions on the same policy across two
 * Anthropic runs) from registering as a 100% drop / critical regression.
 *
 * Empirically (Apr-30 → May-1 trend run on the 3-fixture golden corpus),
 * a baseline of `3` was still inside the noise floor: Anthropic re-bucketed
 * what it had previously classified as "exclusions" into other fields,
 * dropping the count from 3 to 0 without any actual signal loss in the
 * underlying policy text. Bumping to `5` adds enough headroom that single
 * paraphrase shifts no longer trip CRIT, while still catching real
 * regressions like a `17 → 6` coverage collapse.
 */
export const MIN_BASELINE_FOR_REGRESSION = 5

// -----------------------------------------------------------------------------
// Metric extraction
// -----------------------------------------------------------------------------

/**
 * Compute the 6 trend metrics from a structured extraction (the JSON
 * returned by `/api/ai/extract` — flat shape with `coverages`,
 * `exclusions`, etc.). Tolerates missing or malformed fields by
 * defaulting to 0; never throws.
 *
 * `aiInsights` is read from `evidence.insights[]` (the live extraction
 * schema's home for AI insights with verifiable quotes) rather than a
 * top-level `aiInsights` array — the latter only exists on the converted
 * `AnalyzedPolicy` shape, not on the raw extraction.
 */
export function extractMetrics(structured: unknown): TrendMetrics {
  if (!structured || typeof structured !== 'object') {
    return zeroMetrics()
  }
  const data = structured as Record<string, unknown>

  const coverages = Array.isArray(data.coverages) ? data.coverages : []
  const exclusions = Array.isArray(data.exclusions) ? data.exclusions : []
  const conditionalDeductibles = Array.isArray(data.conditionalDeductibles)
    ? data.conditionalDeductibles
    : []
  const bundleProducts = Array.isArray(data.bundleProducts) ? data.bundleProducts : []

  // AI insights — primary location is data.evidence.insights[]; fall back to
  // top-level aiInsights[] which converted AnalyzedPolicy shapes carry.
  let aiInsights: unknown[] = []
  const evidence = data.evidence as Record<string, unknown> | null | undefined
  if (evidence && Array.isArray(evidence.insights)) {
    aiInsights = evidence.insights
  } else if (Array.isArray(data.aiInsights)) {
    aiInsights = data.aiInsights
  }

  const supplementaryCount = coverages.filter((c) => {
    if (!c || typeof c !== 'object') return false
    return (c as { category?: string }).category === 'supplementary'
  }).length

  return {
    coverages: coverages.length,
    exclusions: exclusions.length,
    conditional_deductibles: conditionalDeductibles.length,
    ai_insights: aiInsights.length,
    supplementary_count: supplementaryCount,
    bundle_products: bundleProducts.length,
  }
}

function zeroMetrics(): TrendMetrics {
  return {
    coverages: 0,
    exclusions: 0,
    conditional_deductibles: 0,
    ai_insights: 0,
    supplementary_count: 0,
    bundle_products: 0,
  }
}

// -----------------------------------------------------------------------------
// Metric comparison
// -----------------------------------------------------------------------------

export type RegressionSeverity = 'pass' | 'warn' | 'critical'

export interface MetricDelta {
  key: TrendMetricKey
  baseline: number
  current: number
  delta: number
  /** Negative = regression (drop); positive = increase. */
  ratio: number
  severity: RegressionSeverity
}

export interface RegressionResult {
  /** Worst severity across all 6 metrics. */
  severity: RegressionSeverity
  deltas: MetricDelta[]
  /** Subset of deltas where severity !== 'pass'. */
  flagged: MetricDelta[]
}

export interface CompareOptions {
  /** Drop ratio that triggers `'warn'`. Default 0.3 (30%). */
  warnDropRatio?: number
  /** Drop ratio that triggers `'critical'`. Default 0.6 (60%). */
  criticalDropRatio?: number
  /** Minimum baseline value before regression flags fire. Default 3. */
  minBaseline?: number
}

/**
 * Compare current metrics against a baseline snapshot. Each metric
 * key is evaluated independently; the overall `severity` is the worst
 * single-metric severity. Increases (positive ratio) always pass —
 * we only flag DROPS as regressions.
 *
 * Edge cases:
 *   - baseline < minBaseline → metric severity is `'pass'` regardless
 *     of drop magnitude (avoids false alarms on small samples).
 *   - baseline === 0 → severity is `'pass'` (cannot compute drop ratio).
 */
export function compareMetrics(
  baseline: TrendMetrics | null | undefined,
  current: TrendMetrics,
  options: CompareOptions = {}
): RegressionResult {
  const warnDrop = options.warnDropRatio ?? DEFAULT_WARN_DROP_RATIO
  const criticalDrop = options.criticalDropRatio ?? DEFAULT_CRITICAL_DROP_RATIO
  const minBaseline = options.minBaseline ?? MIN_BASELINE_FOR_REGRESSION

  if (!baseline) {
    // No prior snapshot — first run for this fixture. Always pass; the
    // current row becomes the baseline for the next comparison.
    const deltas: MetricDelta[] = TREND_METRIC_KEYS.map((key) => ({
      key,
      baseline: 0,
      current: current[key],
      delta: current[key],
      ratio: 0,
      severity: 'pass' as const,
    }))
    return { severity: 'pass', deltas, flagged: [] }
  }

  const deltas: MetricDelta[] = TREND_METRIC_KEYS.map((key) => {
    const b = baseline[key]
    const c = current[key]
    const delta = c - b
    const ratio = b === 0 ? 0 : delta / b
    let severity: RegressionSeverity = 'pass'
    if (b >= minBaseline && ratio < 0) {
      const dropRatio = -ratio
      if (dropRatio >= criticalDrop) severity = 'critical'
      else if (dropRatio >= warnDrop) severity = 'warn'
    }
    return { key, baseline: b, current: c, delta, ratio, severity }
  })

  const flagged = deltas.filter((d) => d.severity !== 'pass')
  let severity: RegressionSeverity = 'pass'
  for (const d of deltas) {
    if (d.severity === 'critical') {
      severity = 'critical'
      break
    }
    if (d.severity === 'warn') {
      severity = 'warn'
      // Don't break — keep scanning in case a later metric is critical.
    }
  }
  return { severity, deltas, flagged }
}

/**
 * Format a delta as a `+N` / `-N` / `(=)` annotation suitable for the
 * markdown report. Pure formatting — no severity annotation.
 */
export function formatDelta(d: MetricDelta): string {
  if (d.delta === 0) return `${d.current} (=)`
  const sign = d.delta > 0 ? '+' : ''
  return `${d.current} (${sign}${d.delta})`
}
