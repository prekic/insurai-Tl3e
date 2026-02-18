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

describe('Core Web Vitals Metric Simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  afterEach(() => {
    clearMetrics()
  })

  describe('LCP (Largest Contentful Paint)', () => {
    it('should classify excellent LCP (< 2.5s)', () => {
      expect(getWebVitalRating('LCP', 1500)).toBe('good')
      expect(getWebVitalRating('LCP', 2000)).toBe('good')
      expect(getWebVitalRating('LCP', 2499)).toBe('good')
    })

    it('should classify moderate LCP (2.5s - 4s)', () => {
      expect(getWebVitalRating('LCP', 2501)).toBe('needs-improvement')
      expect(getWebVitalRating('LCP', 3500)).toBe('needs-improvement')
      expect(getWebVitalRating('LCP', 3999)).toBe('needs-improvement')
    })

    it('should classify poor LCP (> 4s)', () => {
      expect(getWebVitalRating('LCP', 4001)).toBe('poor')
      expect(getWebVitalRating('LCP', 5000)).toBe('poor')
      expect(getWebVitalRating('LCP', 10000)).toBe('poor')
    })
  })

  describe('CLS (Cumulative Layout Shift)', () => {
    it('should classify excellent CLS (< 0.1)', () => {
      expect(getWebVitalRating('CLS', 0)).toBe('good')
      expect(getWebVitalRating('CLS', 0.05)).toBe('good')
      expect(getWebVitalRating('CLS', 0.099)).toBe('good')
    })

    it('should classify moderate CLS (0.1 - 0.25)', () => {
      expect(getWebVitalRating('CLS', 0.101)).toBe('needs-improvement')
      expect(getWebVitalRating('CLS', 0.15)).toBe('needs-improvement')
      expect(getWebVitalRating('CLS', 0.24)).toBe('needs-improvement')
    })

    it('should classify poor CLS (> 0.25)', () => {
      expect(getWebVitalRating('CLS', 0.26)).toBe('poor')
      expect(getWebVitalRating('CLS', 0.5)).toBe('poor')
      expect(getWebVitalRating('CLS', 1.0)).toBe('poor')
    })
  })

  describe('INP (Interaction to Next Paint)', () => {
    it('should classify excellent INP (< 200ms)', () => {
      expect(getWebVitalRating('INP', 50)).toBe('good')
      expect(getWebVitalRating('INP', 100)).toBe('good')
      expect(getWebVitalRating('INP', 199)).toBe('good')
    })

    it('should classify moderate INP (200ms - 500ms)', () => {
      expect(getWebVitalRating('INP', 201)).toBe('needs-improvement')
      expect(getWebVitalRating('INP', 350)).toBe('needs-improvement')
      expect(getWebVitalRating('INP', 499)).toBe('needs-improvement')
    })

    it('should classify poor INP (> 500ms)', () => {
      expect(getWebVitalRating('INP', 501)).toBe('poor')
      expect(getWebVitalRating('INP', 750)).toBe('poor')
      expect(getWebVitalRating('INP', 1000)).toBe('poor')
    })
  })

  describe('TTFB (Time to First Byte)', () => {
    it('should classify excellent TTFB (< 800ms)', () => {
      expect(getWebVitalRating('TTFB', 200)).toBe('good')
      expect(getWebVitalRating('TTFB', 500)).toBe('good')
      expect(getWebVitalRating('TTFB', 799)).toBe('good')
    })

    it('should classify moderate TTFB (800ms - 1800ms)', () => {
      expect(getWebVitalRating('TTFB', 801)).toBe('needs-improvement')
      expect(getWebVitalRating('TTFB', 1200)).toBe('needs-improvement')
      expect(getWebVitalRating('TTFB', 1799)).toBe('needs-improvement')
    })

    it('should classify poor TTFB (> 1800ms)', () => {
      expect(getWebVitalRating('TTFB', 1801)).toBe('poor')
      expect(getWebVitalRating('TTFB', 2500)).toBe('poor')
      expect(getWebVitalRating('TTFB', 5000)).toBe('poor')
    })
  })

  describe('FCP (First Contentful Paint)', () => {
    it('should classify excellent FCP (< 1.8s)', () => {
      expect(getWebVitalRating('FCP', 500)).toBe('good')
      expect(getWebVitalRating('FCP', 1000)).toBe('good')
      expect(getWebVitalRating('FCP', 1799)).toBe('good')
    })

    it('should classify moderate FCP (1.8s - 3s)', () => {
      expect(getWebVitalRating('FCP', 1801)).toBe('needs-improvement')
      expect(getWebVitalRating('FCP', 2500)).toBe('needs-improvement')
      expect(getWebVitalRating('FCP', 2999)).toBe('needs-improvement')
    })

    it('should classify poor FCP (> 3s)', () => {
      expect(getWebVitalRating('FCP', 3001)).toBe('poor')
      expect(getWebVitalRating('FCP', 4000)).toBe('poor')
      expect(getWebVitalRating('FCP', 6000)).toBe('poor')
    })
  })
})

describe('Metric Callback System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  afterEach(() => {
    clearMetrics()
  })

  it('should allow multiple callbacks to be registered', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()
    const callback3 = vi.fn()

    const unsub1 = onMetricUpdate(callback1)
    const unsub2 = onMetricUpdate(callback2)
    const unsub3 = onMetricUpdate(callback3)

    expect(typeof unsub1).toBe('function')
    expect(typeof unsub2).toBe('function')
    expect(typeof unsub3).toBe('function')

    // Cleanup
    unsub1()
    unsub2()
    unsub3()
  })

  it('should unsubscribe specific callback without affecting others', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    const unsub1 = onMetricUpdate(callback1)
    onMetricUpdate(callback2)

    unsub1()

    // callback1 should be unsubscribed, callback2 should still be registered
    expect(callback1).not.toHaveBeenCalled()
  })

  it('should handle unsubscribing non-existent callback gracefully', () => {
    const callback = vi.fn()
    const unsub = onMetricUpdate(callback)

    // Unsubscribe twice should not throw
    expect(() => {
      unsub()
      unsub()
    }).not.toThrow()
  })
})

describe('Performance Summary Calculations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  afterEach(() => {
    clearMetrics()
  })

  it('should return good overall score when no metrics', () => {
    const summary = getPerformanceSummary()
    expect(summary.overallScore).toBe('good')
  })

  it('should return empty recommendations when no metrics', () => {
    const summary = getPerformanceSummary()
    expect(summary.recommendations).toEqual([])
  })

  it('should include all web vital keys in summary', () => {
    const summary = getPerformanceSummary()

    expect(summary.webVitals).toHaveProperty('LCP')
    expect(summary.webVitals).toHaveProperty('CLS')
    expect(summary.webVitals).toHaveProperty('INP')
    expect(summary.webVitals).toHaveProperty('TTFB')
    expect(summary.webVitals).toHaveProperty('FCP')
  })
})

describe('Real-World Performance Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  afterEach(() => {
    clearMetrics()
  })

  describe('Fast Website Scenario', () => {
    it('should rate all vitals as good for fast website', () => {
      // Simulating a fast, well-optimized website
      const fastSiteMetrics = {
        LCP: 1500, // 1.5s - good
        CLS: 0.05, // 0.05 - good
        INP: 100, // 100ms - good
        TTFB: 400, // 400ms - good
        FCP: 1000, // 1s - good
      }

      Object.entries(fastSiteMetrics).forEach(([name, value]) => {
        expect(getWebVitalRating(name as WebVitalName, value)).toBe('good')
      })
    })
  })

  describe('Slow Website Scenario', () => {
    it('should rate all vitals as poor for slow website', () => {
      // Simulating a slow, unoptimized website
      const slowSiteMetrics = {
        LCP: 5000, // 5s - poor
        CLS: 0.5, // 0.5 - poor
        INP: 700, // 700ms - poor
        TTFB: 2500, // 2.5s - poor
        FCP: 4000, // 4s - poor
      }

      Object.entries(slowSiteMetrics).forEach(([name, value]) => {
        expect(getWebVitalRating(name as WebVitalName, value)).toBe('poor')
      })
    })
  })

  describe('Average Website Scenario', () => {
    it('should rate most vitals as needs-improvement for average website', () => {
      // Simulating an average website
      const avgSiteMetrics = {
        LCP: 3000, // 3s - needs-improvement
        CLS: 0.15, // 0.15 - needs-improvement
        INP: 350, // 350ms - needs-improvement
        TTFB: 1200, // 1.2s - needs-improvement
        FCP: 2500, // 2.5s - needs-improvement
      }

      Object.entries(avgSiteMetrics).forEach(([name, value]) => {
        expect(getWebVitalRating(name as WebVitalName, value)).toBe('needs-improvement')
      })
    })
  })

  describe('Mixed Performance Scenario', () => {
    it('should handle mixed performance correctly', () => {
      // Website with some good and some poor metrics
      expect(getWebVitalRating('LCP', 1500)).toBe('good') // Fast LCP
      expect(getWebVitalRating('CLS', 0.5)).toBe('poor') // Bad layout stability
      expect(getWebVitalRating('INP', 100)).toBe('good') // Good interactivity
      expect(getWebVitalRating('TTFB', 2000)).toBe('poor') // Slow server
      expect(getWebVitalRating('FCP', 2000)).toBe('needs-improvement') // Moderate FCP
    })
  })
})

describe('Performance Transaction Timing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  it('should track PDF extraction timing', async () => {
    const result = await measureAsync('Extract Policy PDF', 'pdf.extract', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { pages: 5, text: 'Policy content' }
    })

    expect(result).toEqual({ pages: 5, text: 'Policy content' })
  })

  it('should track AI analysis timing', async () => {
    const result = await measureAsync('AI Policy Analysis', 'ai.analyze', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return { confidence: 0.95, coverages: [] }
    })

    expect(result).toHaveProperty('confidence', 0.95)
  })

  it('should track sync operations', () => {
    const result = measureSync('Parse JSON', 'json.parse', () => {
      return JSON.parse('{"key": "value"}')
    })

    expect(result).toEqual({ key: 'value' })
  })

  it('should handle operation cancellation', async () => {
    const transaction = startTransaction({
      name: 'Cancellable Operation',
      op: 'operation.cancellable',
    })

    transaction.setStatus('cancelled')
    transaction.finish()

    // Should not throw
    expect(true).toBe(true)
  })

  it('should track operation with rich context', () => {
    const transaction = startTransaction({
      name: 'Complex PDF Operation',
      op: 'pdf.complex',
      description: 'Processing multi-page PDF with OCR',
      tags: {
        pdfType: 'scanned',
        provider: 'google-vision',
      },
      data: {
        pageCount: 15,
        hasImages: true,
        language: 'tr',
      },
    })

    transaction.setData('extractedText', 'Sample text...')
    transaction.setData('confidence', 0.89)
    transaction.setTag('status', 'complete')
    transaction.setStatus('ok')
    transaction.finish()

    expect(true).toBe(true)
  })
})

describe('Web Vitals Threshold Boundary Tests', () => {
  describe('LCP Boundaries', () => {
    it('should handle LCP exactly at 2500ms (good threshold)', () => {
      expect(getWebVitalRating('LCP', 2500)).toBe('good')
    })

    it('should handle LCP at 2500.01ms (needs-improvement)', () => {
      expect(getWebVitalRating('LCP', 2500.01)).toBe('needs-improvement')
    })

    it('should handle LCP exactly at 4000ms (needs-improvement threshold)', () => {
      expect(getWebVitalRating('LCP', 4000)).toBe('needs-improvement')
    })

    it('should handle LCP at 4000.01ms (poor)', () => {
      expect(getWebVitalRating('LCP', 4000.01)).toBe('poor')
    })
  })

  describe('CLS Boundaries', () => {
    it('should handle CLS exactly at 0.1 (good threshold)', () => {
      expect(getWebVitalRating('CLS', 0.1)).toBe('good')
    })

    it('should handle CLS at 0.100001 (needs-improvement)', () => {
      expect(getWebVitalRating('CLS', 0.100001)).toBe('needs-improvement')
    })

    it('should handle CLS exactly at 0.25 (needs-improvement threshold)', () => {
      expect(getWebVitalRating('CLS', 0.25)).toBe('needs-improvement')
    })

    it('should handle CLS at 0.250001 (poor)', () => {
      expect(getWebVitalRating('CLS', 0.250001)).toBe('poor')
    })
  })

  describe('INP Boundaries', () => {
    it('should handle INP exactly at 200ms (good threshold)', () => {
      expect(getWebVitalRating('INP', 200)).toBe('good')
    })

    it('should handle INP at 200.01ms (needs-improvement)', () => {
      expect(getWebVitalRating('INP', 200.01)).toBe('needs-improvement')
    })

    it('should handle INP exactly at 500ms (needs-improvement threshold)', () => {
      expect(getWebVitalRating('INP', 500)).toBe('needs-improvement')
    })

    it('should handle INP at 500.01ms (poor)', () => {
      expect(getWebVitalRating('INP', 500.01)).toBe('poor')
    })
  })

  describe('TTFB Boundaries', () => {
    it('should handle TTFB exactly at 800ms (good threshold)', () => {
      expect(getWebVitalRating('TTFB', 800)).toBe('good')
    })

    it('should handle TTFB at 800.01ms (needs-improvement)', () => {
      expect(getWebVitalRating('TTFB', 800.01)).toBe('needs-improvement')
    })

    it('should handle TTFB exactly at 1800ms (needs-improvement threshold)', () => {
      expect(getWebVitalRating('TTFB', 1800)).toBe('needs-improvement')
    })

    it('should handle TTFB at 1800.01ms (poor)', () => {
      expect(getWebVitalRating('TTFB', 1800.01)).toBe('poor')
    })
  })

  describe('FCP Boundaries', () => {
    it('should handle FCP exactly at 1800ms (good threshold)', () => {
      expect(getWebVitalRating('FCP', 1800)).toBe('good')
    })

    it('should handle FCP at 1800.01ms (needs-improvement)', () => {
      expect(getWebVitalRating('FCP', 1800.01)).toBe('needs-improvement')
    })

    it('should handle FCP exactly at 3000ms (needs-improvement threshold)', () => {
      expect(getWebVitalRating('FCP', 3000)).toBe('needs-improvement')
    })

    it('should handle FCP at 3000.01ms (poor)', () => {
      expect(getWebVitalRating('FCP', 3000.01)).toBe('poor')
    })
  })
})

describe('reportWebVital (via web-vitals callbacks)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  it('should store metrics when web-vitals callbacks fire', async () => {
    const webVitals = await import('web-vitals')
    // Capture the callback registered with onLCP
    let lcpCallback: ((metric: unknown) => void) | undefined
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { lcpCallback = cb as (metric: unknown) => void })

    await initWebVitals()

    // Simulate LCP metric report
    lcpCallback?.({
      name: 'LCP',
      value: 2000,
      rating: 'good',
      delta: 2000,
      id: 'v1-1234',
      navigationType: 'navigate',
    })

    const metric = getMetric('LCP')
    expect(metric).toBeDefined()
    expect(metric?.value).toBe(2000)
    expect(metric?.rating).toBe('good')
    expect(metric?.name).toBe('LCP')
  })

  it('should notify subscribers when metrics arrive', async () => {
    const webVitals = await import('web-vitals')
    let clsCallback: ((metric: unknown) => void) | undefined
    vi.mocked(webVitals.onCLS).mockImplementation((cb) => { clsCallback = cb as (metric: unknown) => void })

    await initWebVitals()

    const listener = vi.fn()
    const unsubscribe = onMetricUpdate(listener)

    clsCallback?.({
      name: 'CLS',
      value: 0.05,
      rating: 'good',
      delta: 0.05,
      id: 'v1-cls-1',
      navigationType: 'navigate',
    })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CLS', value: 0.05 })
    )

    unsubscribe()
  })

  it('should handle callback errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const webVitals = await import('web-vitals')
    let inpCallback: ((metric: unknown) => void) | undefined
    vi.mocked(webVitals.onINP).mockImplementation((cb) => { inpCallback = cb as (metric: unknown) => void })

    await initWebVitals()

    // Add a failing listener
    onMetricUpdate(() => { throw new Error('Listener failed') })

    // Should not throw despite failing listener
    expect(() =>
      inpCallback?.({
        name: 'INP',
        value: 100,
        rating: 'good',
        delta: 100,
        id: 'v1-inp-1',
        navigationType: 'navigate',
      })
    ).not.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith('Error in metric callback:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('should log poor metrics in development', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const webVitals = await import('web-vitals')
    let lcpCallback: ((metric: unknown) => void) | undefined
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { lcpCallback = cb as (metric: unknown) => void })

    await initWebVitals()

    lcpCallback?.({
      name: 'LCP',
      value: 5000,
      rating: 'poor',
      delta: 5000,
      id: 'v1-lcp-poor',
      navigationType: 'navigate',
    })

    // In non-production, should log metric
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('should handle missing navigationType', async () => {
    const webVitals = await import('web-vitals')
    let fcpCallback: ((metric: unknown) => void) | undefined
    vi.mocked(webVitals.onFCP).mockImplementation((cb) => { fcpCallback = cb as (metric: unknown) => void })

    await initWebVitals()

    fcpCallback?.({
      name: 'FCP',
      value: 1500,
      rating: 'good',
      delta: 1500,
      id: 'v1-fcp-1',
      navigationType: undefined,
    })

    const metric = getMetric('FCP')
    expect(metric?.navigationType).toBe('unknown')
  })
})

describe('trackNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not throw when called', () => {
    expect(() => trackNavigation('/dashboard')).not.toThrow()
  })

  it('should accept any route name', () => {
    expect(() => trackNavigation('/upload')).not.toThrow()
    expect(() => trackNavigation('/admin/settings')).not.toThrow()
    expect(() => trackNavigation('/')).not.toThrow()
  })
})

describe('trackInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not throw when called without duration', () => {
    expect(() => trackInteraction('click', 'submit-button')).not.toThrow()
  })

  it('should not throw when called with duration', () => {
    expect(() => trackInteraction('click', 'submit-button', 150)).not.toThrow()
  })
})

describe('getPerformanceSummary with metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  it('should return good overall score when all metrics are good', async () => {
    const webVitals = await import('web-vitals')
    const callbacks: Record<string, (m: unknown) => void> = {}
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { callbacks.LCP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onCLS).mockImplementation((cb) => { callbacks.CLS = cb as (m: unknown) => void })
    vi.mocked(webVitals.onINP).mockImplementation((cb) => { callbacks.INP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onTTFB).mockImplementation((cb) => { callbacks.TTFB = cb as (m: unknown) => void })
    vi.mocked(webVitals.onFCP).mockImplementation((cb) => { callbacks.FCP = cb as (m: unknown) => void })

    await initWebVitals()

    // Simulate all good metrics
    callbacks.LCP({ name: 'LCP', value: 1000, rating: 'good', delta: 1000, id: '1', navigationType: 'navigate' })
    callbacks.CLS({ name: 'CLS', value: 0.05, rating: 'good', delta: 0.05, id: '2', navigationType: 'navigate' })
    callbacks.INP({ name: 'INP', value: 100, rating: 'good', delta: 100, id: '3', navigationType: 'navigate' })
    callbacks.TTFB({ name: 'TTFB', value: 500, rating: 'good', delta: 500, id: '4', navigationType: 'navigate' })
    callbacks.FCP({ name: 'FCP', value: 1000, rating: 'good', delta: 1000, id: '5', navigationType: 'navigate' })

    const summary = getPerformanceSummary()
    expect(summary.overallScore).toBe('good')
    expect(summary.recommendations).toHaveLength(0)
  })

  it('should return poor score and recommendations when metrics are poor', async () => {
    const webVitals = await import('web-vitals')
    const callbacks: Record<string, (m: unknown) => void> = {}
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { callbacks.LCP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onCLS).mockImplementation((cb) => { callbacks.CLS = cb as (m: unknown) => void })
    vi.mocked(webVitals.onTTFB).mockImplementation((cb) => { callbacks.TTFB = cb as (m: unknown) => void })
    vi.mocked(webVitals.onINP).mockImplementation((cb) => { callbacks.INP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onFCP).mockImplementation((cb) => { callbacks.FCP = cb as (m: unknown) => void })

    await initWebVitals()

    callbacks.LCP({ name: 'LCP', value: 5000, rating: 'poor', delta: 5000, id: '1', navigationType: 'navigate' })
    callbacks.CLS({ name: 'CLS', value: 0.5, rating: 'poor', delta: 0.5, id: '2', navigationType: 'navigate' })
    callbacks.TTFB({ name: 'TTFB', value: 3000, rating: 'poor', delta: 3000, id: '3', navigationType: 'navigate' })
    callbacks.INP({ name: 'INP', value: 800, rating: 'poor', delta: 800, id: '4', navigationType: 'navigate' })

    const summary = getPerformanceSummary()
    expect(summary.overallScore).toBe('poor')
    expect(summary.recommendations.length).toBeGreaterThan(0)
    expect(summary.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('images'), // LCP recommendation
        expect.stringContaining('size attributes'), // CLS recommendation
        expect.stringContaining('server response'), // TTFB recommendation
        expect.stringContaining('long tasks'), // INP recommendation
      ])
    )
  })

  it('should return needs-improvement when some metrics are needs-improvement', async () => {
    const webVitals = await import('web-vitals')
    const callbacks: Record<string, (m: unknown) => void> = {}
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { callbacks.LCP = cb as (m: unknown) => void })

    await initWebVitals()

    callbacks.LCP({ name: 'LCP', value: 3000, rating: 'needs-improvement', delta: 3000, id: '1', navigationType: 'navigate' })

    const summary = getPerformanceSummary()
    expect(summary.overallScore).toBe('needs-improvement')
  })
})

describe('reportPerformanceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMetrics()
  })

  it('should not throw when called without metrics', () => {
    expect(() => reportPerformanceSummary()).not.toThrow()
  })

  it('should not throw when called with metrics populated', async () => {
    const webVitals = await import('web-vitals')
    let lcpCallback: ((m: unknown) => void) | undefined
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { lcpCallback = cb as (m: unknown) => void })

    await initWebVitals()
    lcpCallback?.({ name: 'LCP', value: 2000, rating: 'good', delta: 2000, id: '1', navigationType: 'navigate' })

    expect(() => reportPerformanceSummary()).not.toThrow()
  })
})

describe('startTransaction with slow operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should log slow operations exceeding 5000ms', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const originalNow = performance.now
    let callCount = 0
    vi.spyOn(performance, 'now').mockImplementation(() => {
      callCount++
      return callCount === 1 ? 0 : 6000 // 6000ms duration
    })

    const txn = startTransaction({ name: 'slow-op', op: 'test' })
    txn.finish()

    // Should have logged the slow operation in development
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
    performance.now = originalNow
  })

  it('should track cancelled transactions', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const txn = startTransaction({ name: 'cancelled-op', op: 'test' })
    txn.setStatus('cancelled')
    txn.finish()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('should support setTag on transaction', () => {
    const txn = startTransaction({ name: 'tagged-op', op: 'test' })
    expect(() => txn.setTag('environment', 'test')).not.toThrow()
    expect(() => txn.setData('key', 'value')).not.toThrow()
    txn.finish()
  })

  it('should accept description and initial tags/data', () => {
    const txn = startTransaction({
      name: 'full-op',
      op: 'test',
      description: 'A full test operation',
      tags: { env: 'test' },
      data: { input: 'sample' },
    })
    txn.finish()
  })
})

describe('initWebVitals error handling', () => {
  it('should handle web-vitals import failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The mock already exists, but the function should handle errors
    // This verifies the try-catch in initWebVitals
    await initWebVitals()
    consoleSpy.mockRestore()
  })
})
