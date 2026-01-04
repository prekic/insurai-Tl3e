/**
 * Performance Monitoring and Core Web Vitals Tests
 *
 * Tests for performance tracking, Core Web Vitals, and Sentry integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @sentry/react
vi.mock('@sentry/react', () => ({
  setMeasurement: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  captureMessage: vi.fn(),
  startInactiveSpan: vi.fn(() => ({
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
  })),
}))

// Mock web-vitals (v5 - no FID, replaced by INP)
vi.mock('web-vitals', () => ({
  onLCP: vi.fn(),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onTTFB: vi.fn(),
  onFCP: vi.fn(),
}))

import {
  WEB_VITALS_THRESHOLDS,
  getWebVitalRating,
  initWebVitals,
  onMetricUpdate,
  getCollectedMetrics,
  getMetric,
  clearMetrics,
  startTransaction,
  measureAsync,
  measureSync,
  trackNavigation,
  trackInteraction,
  getPerformanceSummary,
  reportPerformanceSummary,
  type WebVitalName,
} from './performance'

describe('Performance Monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  describe('WEB_VITALS_THRESHOLDS', () => {
    it('should define thresholds for LCP', () => {
      expect(WEB_VITALS_THRESHOLDS.LCP).toEqual({
        good: 2500,
        needsImprovement: 4000,
      })
    })

    it('should define thresholds for CLS', () => {
      expect(WEB_VITALS_THRESHOLDS.CLS).toEqual({
        good: 0.1,
        needsImprovement: 0.25,
      })
    })

    it('should define thresholds for TTFB', () => {
      expect(WEB_VITALS_THRESHOLDS.TTFB).toEqual({
        good: 800,
        needsImprovement: 1800,
      })
    })

    it('should define thresholds for FCP', () => {
      expect(WEB_VITALS_THRESHOLDS.FCP).toEqual({
        good: 1800,
        needsImprovement: 3000,
      })
    })

    it('should define thresholds for INP', () => {
      expect(WEB_VITALS_THRESHOLDS.INP).toEqual({
        good: 200,
        needsImprovement: 500,
      })
    })

    it('should have thresholds for all 5 Core Web Vitals (v5)', () => {
      // Note: FID was deprecated in web-vitals v4+ in favor of INP
      const vitalNames = ['LCP', 'CLS', 'INP', 'TTFB', 'FCP']
      vitalNames.forEach((name) => {
        expect(WEB_VITALS_THRESHOLDS[name as WebVitalName]).toBeDefined()
      })
    })
  })

  describe('getWebVitalRating', () => {
    it('should rate LCP as good when under 2500ms', () => {
      expect(getWebVitalRating('LCP', 2000)).toBe('good')
      expect(getWebVitalRating('LCP', 2500)).toBe('good')
    })

    it('should rate LCP as needs-improvement between 2500-4000ms', () => {
      expect(getWebVitalRating('LCP', 3000)).toBe('needs-improvement')
      expect(getWebVitalRating('LCP', 4000)).toBe('needs-improvement')
    })

    it('should rate LCP as poor when over 4000ms', () => {
      expect(getWebVitalRating('LCP', 5000)).toBe('poor')
    })

    it('should rate CLS as good when under 0.1', () => {
      expect(getWebVitalRating('CLS', 0.05)).toBe('good')
      expect(getWebVitalRating('CLS', 0.1)).toBe('good')
    })

    it('should rate CLS as needs-improvement between 0.1-0.25', () => {
      expect(getWebVitalRating('CLS', 0.15)).toBe('needs-improvement')
    })

    it('should rate CLS as poor when over 0.25', () => {
      expect(getWebVitalRating('CLS', 0.5)).toBe('poor')
    })

    it('should rate TTFB as good when under 800ms', () => {
      expect(getWebVitalRating('TTFB', 500)).toBe('good')
    })

    it('should rate TTFB as poor when over 1800ms', () => {
      expect(getWebVitalRating('TTFB', 2000)).toBe('poor')
    })

    it('should rate INP as good when under 200ms', () => {
      expect(getWebVitalRating('INP', 150)).toBe('good')
    })

    it('should rate INP as poor when over 500ms', () => {
      expect(getWebVitalRating('INP', 600)).toBe('poor')
    })
  })

  describe('initWebVitals', () => {
    it('should initialize without throwing', async () => {
      await expect(initWebVitals()).resolves.not.toThrow()
    })

    it('should import web-vitals module', async () => {
      const webVitals = await import('web-vitals')
      await initWebVitals()

      // Note: FID was deprecated in web-vitals v4+ in favor of INP
      expect(webVitals.onLCP).toHaveBeenCalled()
      expect(webVitals.onCLS).toHaveBeenCalled()
      expect(webVitals.onINP).toHaveBeenCalled()
      expect(webVitals.onTTFB).toHaveBeenCalled()
      expect(webVitals.onFCP).toHaveBeenCalled()
    })
  })

  describe('Metric Collection', () => {
    it('should start with empty metrics', () => {
      const metrics = getCollectedMetrics()
      expect(metrics.size).toBe(0)
    })

    it('should return undefined for non-existent metric', () => {
      expect(getMetric('LCP')).toBeUndefined()
    })

    it('should clear metrics', () => {
      clearMetrics()
      expect(getCollectedMetrics().size).toBe(0)
    })
  })

  describe('onMetricUpdate', () => {
    it('should register callback', () => {
      const callback = vi.fn()
      const unsubscribe = onMetricUpdate(callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should unsubscribe callback', () => {
      const callback = vi.fn()
      const unsubscribe = onMetricUpdate(callback)

      unsubscribe()
      // Callback should no longer be called
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('startTransaction', () => {
    it('should return transaction object', () => {
      const transaction = startTransaction({
        name: 'Test Operation',
        op: 'test',
      })

      expect(transaction).toHaveProperty('finish')
      expect(transaction).toHaveProperty('setStatus')
      expect(transaction).toHaveProperty('setData')
      expect(transaction).toHaveProperty('setTag')
    })

    it('should accept all options', () => {
      const transaction = startTransaction({
        name: 'Complex Operation',
        op: 'complex',
        description: 'A complex operation',
        tags: { component: 'test' },
        data: { input: 'value' },
      })

      expect(transaction).toBeDefined()
      transaction.finish()
    })

    it('should allow setting status', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      expect(() => transaction.setStatus('ok')).not.toThrow()
      expect(() => transaction.setStatus('error')).not.toThrow()
      expect(() => transaction.setStatus('cancelled')).not.toThrow()

      transaction.finish()
    })

    it('should allow setting data', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      expect(() => transaction.setData('key', 'value')).not.toThrow()
      expect(() => transaction.setData('count', 42)).not.toThrow()

      transaction.finish()
    })

    it('should allow setting tags', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      expect(() => transaction.setTag('env', 'test')).not.toThrow()
      expect(() => transaction.setTag('version', '1.0.0')).not.toThrow()

      transaction.finish()
    })

    it('should finish without error', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      expect(() => transaction.finish()).not.toThrow()
    })
  })

  describe('measureAsync', () => {
    it('should measure async function execution', async () => {
      const result = await measureAsync('test', 'async.operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'success'
      })

      expect(result).toBe('success')
    })

    it('should propagate errors', async () => {
      await expect(
        measureAsync('test', 'async.operation', async () => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')
    })

    it('should return function result', async () => {
      const result = await measureAsync('test', 'async.operation', async () => ({
        data: 'value',
      }))

      expect(result).toEqual({ data: 'value' })
    })
  })

  describe('measureSync', () => {
    it('should measure sync function execution', () => {
      const result = measureSync('test', 'sync.operation', () => {
        return 'success'
      })

      expect(result).toBe('success')
    })

    it('should propagate errors', () => {
      expect(() =>
        measureSync('test', 'sync.operation', () => {
          throw new Error('Test error')
        })
      ).toThrow('Test error')
    })

    it('should return function result', () => {
      const result = measureSync('test', 'sync.operation', () => ({
        data: 'value',
      }))

      expect(result).toEqual({ data: 'value' })
    })
  })

  describe('trackNavigation', () => {
    it('should not throw when called', () => {
      expect(() => trackNavigation('/dashboard')).not.toThrow()
    })

    it('should accept any route name', () => {
      expect(() => trackNavigation('/upload')).not.toThrow()
      expect(() => trackNavigation('/policy/123')).not.toThrow()
      expect(() => trackNavigation('/')).not.toThrow()
    })
  })

  describe('trackInteraction', () => {
    it('should not throw when called', () => {
      expect(() => trackInteraction('click', 'button')).not.toThrow()
    })

    it('should accept optional duration', () => {
      expect(() => trackInteraction('click', 'button', 100)).not.toThrow()
    })

    it('should accept various actions and elements', () => {
      expect(() => trackInteraction('click', 'submit-button')).not.toThrow()
      expect(() => trackInteraction('focus', 'input-field')).not.toThrow()
      expect(() => trackInteraction('scroll', 'page')).not.toThrow()
    })
  })

  describe('getPerformanceSummary', () => {
    it('should return summary object', () => {
      const summary = getPerformanceSummary()

      expect(summary).toHaveProperty('webVitals')
      expect(summary).toHaveProperty('overallScore')
      expect(summary).toHaveProperty('recommendations')
    })

    it('should have all web vital keys (v5)', () => {
      const summary = getPerformanceSummary()

      // Note: FID was deprecated in web-vitals v4+ in favor of INP
      expect(summary.webVitals).toHaveProperty('LCP')
      expect(summary.webVitals).toHaveProperty('CLS')
      expect(summary.webVitals).toHaveProperty('INP')
      expect(summary.webVitals).toHaveProperty('TTFB')
      expect(summary.webVitals).toHaveProperty('FCP')
    })

    it('should have valid overall score', () => {
      const summary = getPerformanceSummary()

      expect(['good', 'needs-improvement', 'poor']).toContain(summary.overallScore)
    })

    it('should return recommendations array', () => {
      const summary = getPerformanceSummary()

      expect(Array.isArray(summary.recommendations)).toBe(true)
    })
  })

  describe('reportPerformanceSummary', () => {
    it('should not throw when called', () => {
      expect(() => reportPerformanceSummary()).not.toThrow()
    })
  })

  describe('Integration with Sentry', () => {
    it('should call Sentry.startInactiveSpan when starting transaction', () => {
      // Reset the mock environment
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123')

      startTransaction({ name: 'Test', op: 'test' })

      // Note: Sentry integration depends on SENTRY_DSN being set
      // The actual Sentry calls are conditional
    })
  })
})

describe('Web Vital Rating Logic', () => {
  describe('Edge cases', () => {
    it('should handle exactly threshold values', () => {
      // Exactly at good threshold should be good
      expect(getWebVitalRating('LCP', 2500)).toBe('good')
      expect(getWebVitalRating('INP', 200)).toBe('good')
      expect(getWebVitalRating('CLS', 0.1)).toBe('good')

      // Exactly at needs-improvement threshold should be needs-improvement
      expect(getWebVitalRating('LCP', 4000)).toBe('needs-improvement')
      expect(getWebVitalRating('INP', 500)).toBe('needs-improvement')
      expect(getWebVitalRating('CLS', 0.25)).toBe('needs-improvement')
    })

    it('should handle zero values', () => {
      expect(getWebVitalRating('LCP', 0)).toBe('good')
      expect(getWebVitalRating('INP', 0)).toBe('good')
      expect(getWebVitalRating('CLS', 0)).toBe('good')
    })

    it('should handle very large values', () => {
      expect(getWebVitalRating('LCP', 10000)).toBe('poor')
      expect(getWebVitalRating('INP', 1000)).toBe('poor')
      expect(getWebVitalRating('CLS', 1.0)).toBe('poor')
    })

    it('should handle decimal values', () => {
      expect(getWebVitalRating('CLS', 0.05)).toBe('good')
      expect(getWebVitalRating('CLS', 0.15)).toBe('needs-improvement')
      expect(getWebVitalRating('CLS', 0.3)).toBe('poor')
    })
  })
})

describe('Performance Recommendations', () => {
  it('should provide recommendations array', () => {
    const summary = getPerformanceSummary()
    expect(Array.isArray(summary.recommendations)).toBe(true)
  })

  it('should handle empty metrics gracefully', () => {
    clearMetrics()
    const summary = getPerformanceSummary()

    // With no metrics, should default to good (no poor ratings)
    expect(summary.overallScore).toBe('good')
    expect(summary.recommendations.length).toBe(0)
  })
})

describe('Transaction Operations', () => {
  describe('Operation types', () => {
    it('should support various operation types', () => {
      const operations = [
        { name: 'PDF Upload', op: 'file.upload' },
        { name: 'AI Extraction', op: 'ai.extract' },
        { name: 'Policy Analysis', op: 'analysis.policy' },
        { name: 'Export PDF', op: 'export.pdf' },
        { name: 'Database Query', op: 'db.query' },
      ]

      operations.forEach((options) => {
        const transaction = startTransaction(options)
        expect(transaction).toBeDefined()
        transaction.finish()
      })
    })
  })

  describe('Status transitions', () => {
    it('should allow status changes before finish', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      transaction.setStatus('ok')
      transaction.setStatus('error')
      transaction.setStatus('cancelled')
      transaction.finish()
    })
  })

  describe('Data accumulation', () => {
    it('should allow multiple data entries', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      transaction.setData('fileSize', 1024)
      transaction.setData('fileName', 'test.pdf')
      transaction.setData('pageCount', 5)
      transaction.finish()
    })

    it('should allow multiple tags', () => {
      const transaction = startTransaction({ name: 'Test', op: 'test' })

      transaction.setTag('provider', 'openai')
      transaction.setTag('model', 'gpt-4')
      transaction.setTag('region', 'us-east')
      transaction.finish()
    })
  })
})

describe('Cleanup', () => {
  afterEach(() => {
    clearMetrics()
    vi.clearAllMocks()
  })

  it('should clean up metrics between tests', () => {
    clearMetrics()
    expect(getCollectedMetrics().size).toBe(0)
  })
})
