/**
 * Performance Monitoring and Core Web Vitals Tracking
 *
 * Tracks performance metrics and Core Web Vitals, integrating with Sentry
 * for comprehensive monitoring in production.
 *
 * Core Web Vitals measured (web-vitals v5):
 * - LCP (Largest Contentful Paint): Loading performance
 * - CLS (Cumulative Layout Shift): Visual stability
 * - INP (Interaction to Next Paint): Responsiveness (replaced FID)
 * - TTFB (Time to First Byte): Server response time
 * - FCP (First Contentful Paint): Initial render
 */

import * as Sentry from '@sentry/react'
import type { Metric } from 'web-vitals'

// Environment detection
const IS_PRODUCTION = import.meta.env.PROD
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN

// Performance thresholds based on Google's recommendations
// Note: FID was deprecated in web-vitals v4+ in favor of INP
export const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 }, // milliseconds
  CLS: { good: 0.1, needsImprovement: 0.25 }, // score
  INP: { good: 200, needsImprovement: 500 }, // milliseconds (replaced FID)
  TTFB: { good: 800, needsImprovement: 1800 }, // milliseconds
  FCP: { good: 1800, needsImprovement: 3000 }, // milliseconds
} as const

export type WebVitalName = keyof typeof WEB_VITALS_THRESHOLDS
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor'

export interface WebVitalMetric {
  name: WebVitalName
  value: number
  rating: WebVitalRating
  delta: number
  id: string
  navigationType: string
}

// Store for collected metrics
const collectedMetrics: Map<string, WebVitalMetric> = new Map()

// Callbacks for metric updates
type MetricCallback = (metric: WebVitalMetric) => void
const metricCallbacks: MetricCallback[] = []

/**
 * Get rating for a web vital metric
 */
export function getWebVitalRating(name: WebVitalName, value: number): WebVitalRating {
  const thresholds = WEB_VITALS_THRESHOLDS[name]
  if (!thresholds) return 'poor'

  if (value <= thresholds.good) return 'good'
  if (value <= thresholds.needsImprovement) return 'needs-improvement'
  return 'poor'
}

/**
 * Report a web vital metric to Sentry and callbacks
 */
function reportWebVital(metric: Metric): void {
  const webVitalMetric: WebVitalMetric = {
    name: metric.name as WebVitalName,
    value: metric.value,
    rating: metric.rating as WebVitalRating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType || 'unknown',
  }

  // Store the metric
  collectedMetrics.set(metric.name, webVitalMetric)

  // Notify callbacks
  metricCallbacks.forEach((callback) => {
    try {
      callback(webVitalMetric)
    } catch (error) {
      console.error('Error in metric callback:', error)
    }
  })

  // Report to Sentry if configured
  if (SENTRY_DSN) {
    // Add as a measurement to the current transaction
    Sentry.setMeasurement(metric.name, metric.value, getMetricUnit(metric.name))

    // Log poor performance as a breadcrumb
    if (webVitalMetric.rating === 'poor') {
      Sentry.addBreadcrumb({
        category: 'web-vital',
        message: `Poor ${metric.name}: ${metric.value.toFixed(2)}`,
        level: 'warning',
        data: {
          name: metric.name,
          value: metric.value,
          rating: webVitalMetric.rating,
          threshold: WEB_VITALS_THRESHOLDS[metric.name as WebVitalName]?.needsImprovement,
        },
      })
    }
  }

  // Log in development for debugging
  if (!IS_PRODUCTION) {
    const color = webVitalMetric.rating === 'good' ? '🟢' : webVitalMetric.rating === 'needs-improvement' ? '🟡' : '🔴'
    // eslint-disable-next-line no-console
    console.info(
      `${color} ${metric.name}: ${metric.value.toFixed(2)} (${webVitalMetric.rating})`
    )
  }
}

/**
 * Get the appropriate unit for a metric
 */
function getMetricUnit(name: string): 'millisecond' | 'none' {
  if (name === 'CLS') return 'none'
  return 'millisecond'
}

/**
 * Initialize Core Web Vitals monitoring
 * Call this at app startup after Sentry initialization
 */
export async function initWebVitals(): Promise<void> {
  try {
    // Dynamic import to enable tree-shaking when not used
    const webVitals = await import('web-vitals')

    // Track all Core Web Vitals (web-vitals v5)
    // Note: FID was deprecated in favor of INP
    webVitals.onLCP(reportWebVital)
    webVitals.onCLS(reportWebVital)
    webVitals.onINP(reportWebVital)
    webVitals.onTTFB(reportWebVital)
    webVitals.onFCP(reportWebVital)

    if (!IS_PRODUCTION) {
      // eslint-disable-next-line no-console
      console.info('📊 Core Web Vitals monitoring initialized')
    }
  } catch (error) {
    console.error('Failed to initialize web-vitals:', error)
  }
}

/**
 * Subscribe to metric updates
 */
export function onMetricUpdate(callback: MetricCallback): () => void {
  metricCallbacks.push(callback)
  return () => {
    const index = metricCallbacks.indexOf(callback)
    if (index > -1) {
      metricCallbacks.splice(index, 1)
    }
  }
}

/**
 * Get all collected metrics
 */
export function getCollectedMetrics(): Map<string, WebVitalMetric> {
  return new Map(collectedMetrics)
}

/**
 * Get a specific metric
 */
export function getMetric(name: WebVitalName): WebVitalMetric | undefined {
  return collectedMetrics.get(name)
}

/**
 * Clear all collected metrics (useful for testing)
 */
export function clearMetrics(): void {
  collectedMetrics.clear()
}

/**
 * Custom Performance Transaction Tracking
 *
 * Use these functions to track custom operations like:
 * - PDF extraction
 * - AI analysis
 * - File uploads
 */

interface TransactionOptions {
  name: string
  op: string
  description?: string
  tags?: Record<string, string>
  data?: Record<string, unknown>
}

interface ActiveTransaction {
  finish: () => void
  setStatus: (status: 'ok' | 'error' | 'cancelled') => void
  setData: (key: string, value: unknown) => void
  setTag: (key: string, value: string) => void
}

/**
 * Start a performance transaction for tracking an operation
 */
export function startTransaction(options: TransactionOptions): ActiveTransaction {
  const startTime = performance.now()
  let status: 'ok' | 'error' | 'cancelled' = 'ok'
  const data: Record<string, unknown> = { ...options.data }
  const tags: Record<string, string> = { ...options.tags }

  // Create a Sentry span if available
  const span = SENTRY_DSN
    ? Sentry.startInactiveSpan({
        name: options.name,
        op: options.op,
        attributes: {
          description: options.description,
          ...tags,
        },
      })
    : null

  return {
    finish: () => {
      const duration = performance.now() - startTime

      if (span) {
        span.end()
      }

      // Add measurement to Sentry
      if (SENTRY_DSN) {
        Sentry.setMeasurement(`${options.op}.duration`, duration, 'millisecond')

        // Log slow operations
        if (duration > 5000) {
          Sentry.addBreadcrumb({
            category: 'performance',
            message: `Slow ${options.op}: ${options.name} took ${duration.toFixed(0)}ms`,
            level: 'warning',
            data: { duration, status, ...data },
          })
        }
      }

      // Log in development for debugging
      if (!IS_PRODUCTION) {
        const emoji = status === 'ok' ? '✅' : status === 'error' ? '❌' : '⚠️'
        // eslint-disable-next-line no-console
        console.info(
          `${emoji} ${options.op}: ${options.name} - ${duration.toFixed(0)}ms (${status})`
        )
      }
    },
    setStatus: (s) => {
      status = s
      if (span) {
        span.setStatus({ code: s === 'ok' ? 1 : 2 })
      }
    },
    setData: (key, value) => {
      data[key] = value
      if (span) {
        span.setAttribute(key, String(value))
      }
    },
    setTag: (key, value) => {
      tags[key] = value
      if (span) {
        span.setAttribute(key, value)
      }
    },
  }
}

/**
 * Measure a function's execution time
 */
export async function measureAsync<T>(
  name: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  const transaction = startTransaction({ name, op })
  try {
    const result = await fn()
    transaction.setStatus('ok')
    return result
  } catch (error) {
    transaction.setStatus('error')
    throw error
  } finally {
    transaction.finish()
  }
}

/**
 * Measure a synchronous function's execution time
 */
export function measureSync<T>(name: string, op: string, fn: () => T): T {
  const transaction = startTransaction({ name, op })
  try {
    const result = fn()
    transaction.setStatus('ok')
    return result
  } catch (error) {
    transaction.setStatus('error')
    throw error
  } finally {
    transaction.finish()
  }
}

/**
 * Track page navigation performance
 */
export function trackNavigation(routeName: string): void {
  if (!SENTRY_DSN) return

  Sentry.addBreadcrumb({
    category: 'navigation',
    message: `Navigated to ${routeName}`,
    level: 'info',
    data: {
      route: routeName,
      timestamp: Date.now(),
    },
  })
}

/**
 * Track user interaction performance
 */
export function trackInteraction(
  action: string,
  element: string,
  duration?: number
): void {
  if (!SENTRY_DSN) return

  Sentry.addBreadcrumb({
    category: 'ui.interaction',
    message: `${action} on ${element}`,
    level: 'info',
    data: {
      action,
      element,
      duration,
      timestamp: Date.now(),
    },
  })
}

/**
 * Get performance summary for the current session
 */
export function getPerformanceSummary(): {
  webVitals: Record<string, WebVitalMetric | undefined>
  overallScore: 'good' | 'needs-improvement' | 'poor'
  recommendations: string[]
} {
  const metrics = {
    LCP: getMetric('LCP'),
    CLS: getMetric('CLS'),
    INP: getMetric('INP'),
    TTFB: getMetric('TTFB'),
    FCP: getMetric('FCP'),
  }

  const recommendations: string[] = []

  // Check each metric and add recommendations
  if (metrics.LCP?.rating === 'poor') {
    recommendations.push('Optimize images and reduce server response time to improve LCP')
  }
  if (metrics.CLS?.rating === 'poor') {
    recommendations.push('Add size attributes to images and avoid inserting content above existing content')
  }
  if (metrics.TTFB?.rating === 'poor') {
    recommendations.push('Optimize server response time and consider using a CDN')
  }
  if (metrics.INP?.rating === 'poor') {
    recommendations.push('Break up long tasks and optimize event handlers')
  }

  // Calculate overall score
  const ratings = Object.values(metrics)
    .filter((m): m is WebVitalMetric => m !== undefined)
    .map((m) => m.rating)

  let overallScore: 'good' | 'needs-improvement' | 'poor' = 'good'
  if (ratings.includes('poor')) {
    overallScore = 'poor'
  } else if (ratings.includes('needs-improvement')) {
    overallScore = 'needs-improvement'
  }

  return {
    webVitals: metrics,
    overallScore,
    recommendations,
  }
}

/**
 * Report performance summary to Sentry
 */
export function reportPerformanceSummary(): void {
  if (!SENTRY_DSN) return

  const summary = getPerformanceSummary()

  Sentry.setContext('performance', {
    overallScore: summary.overallScore,
    lcp: summary.webVitals.LCP?.value,
    cls: summary.webVitals.CLS?.value,
    inp: summary.webVitals.INP?.value,
    ttfb: summary.webVitals.TTFB?.value,
    fcp: summary.webVitals.FCP?.value,
    recommendationCount: summary.recommendations.length,
  })

  if (summary.overallScore === 'poor') {
    Sentry.captureMessage('Poor performance detected', 'warning')
  }
}
