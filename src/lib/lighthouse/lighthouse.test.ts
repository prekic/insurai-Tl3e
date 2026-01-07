/**
 * Lighthouse CI Integration Tests
 *
 * Tests for performance scoring utilities and budget checking.
 */

import { describe, it, expect } from 'vitest'
import {
  SCORE_THRESHOLDS,
  WEB_VITALS_THRESHOLDS,
  rateMetric,
  rateScore,
  scoreToPercentage,
  percentageToScore,
  createWebVitalMetric,
  checkBudget,
  calculateOverallResult,
  createLighthouseResult,
  DEFAULT_BUDGETS,
  validateScores,
  formatResult,
  getScoreColor,
  parseLighthouseOutput,
  type LighthouseScore,
  type WebVitalMetric,
  type PerformanceBudget,
  type LighthouseResult,
  type MetricName,
} from './index'

describe('Lighthouse CI Integration', () => {
  describe('Constants', () => {
    it('should have correct score thresholds', () => {
      expect(SCORE_THRESHOLDS.good).toBe(90)
      expect(SCORE_THRESHOLDS.needsImprovement).toBe(50)
      expect(SCORE_THRESHOLDS.poor).toBe(0)
    })

    it('should have Core Web Vitals thresholds', () => {
      expect(WEB_VITALS_THRESHOLDS.LCP).toEqual({
        good: 2500,
        needsImprovement: 4000,
      })
      expect(WEB_VITALS_THRESHOLDS.FID).toEqual({
        good: 100,
        needsImprovement: 300,
      })
      expect(WEB_VITALS_THRESHOLDS.CLS).toEqual({
        good: 0.1,
        needsImprovement: 0.25,
      })
      expect(WEB_VITALS_THRESHOLDS.INP).toEqual({
        good: 200,
        needsImprovement: 500,
      })
    })

    it('should have all required Core Web Vitals metrics', () => {
      const requiredMetrics = ['LCP', 'FID', 'INP', 'CLS', 'FCP', 'TTFB', 'TBT']
      for (const metric of requiredMetrics) {
        expect(WEB_VITALS_THRESHOLDS).toHaveProperty(metric)
      }
    })

    it('should have default performance budgets', () => {
      expect(DEFAULT_BUDGETS.LCP).toBe(2500)
      expect(DEFAULT_BUDGETS.FCP).toBe(1800)
      expect(DEFAULT_BUDGETS.TBT).toBe(300)
      expect(DEFAULT_BUDGETS.CLS).toBe(0.1)
      expect(DEFAULT_BUDGETS.totalBundleSize).toBe(500 * 1024)
    })
  })

  describe('rateMetric', () => {
    it('should rate LCP as good when below threshold', () => {
      expect(rateMetric('LCP', 2000)).toBe('good')
      expect(rateMetric('LCP', 2500)).toBe('good')
    })

    it('should rate LCP as needs-improvement when between thresholds', () => {
      expect(rateMetric('LCP', 2501)).toBe('needs-improvement')
      expect(rateMetric('LCP', 4000)).toBe('needs-improvement')
    })

    it('should rate LCP as poor when above threshold', () => {
      expect(rateMetric('LCP', 4001)).toBe('poor')
      expect(rateMetric('LCP', 10000)).toBe('poor')
    })

    it('should rate CLS correctly (unitless metric)', () => {
      expect(rateMetric('CLS', 0.05)).toBe('good')
      expect(rateMetric('CLS', 0.1)).toBe('good')
      expect(rateMetric('CLS', 0.15)).toBe('needs-improvement')
      expect(rateMetric('CLS', 0.3)).toBe('poor')
    })

    it('should rate FID correctly', () => {
      expect(rateMetric('FID', 50)).toBe('good')
      expect(rateMetric('FID', 100)).toBe('good')
      expect(rateMetric('FID', 200)).toBe('needs-improvement')
      expect(rateMetric('FID', 400)).toBe('poor')
    })

    it('should rate INP correctly', () => {
      expect(rateMetric('INP', 150)).toBe('good')
      expect(rateMetric('INP', 200)).toBe('good')
      expect(rateMetric('INP', 350)).toBe('needs-improvement')
      expect(rateMetric('INP', 600)).toBe('poor')
    })

    it('should rate TTFB correctly', () => {
      expect(rateMetric('TTFB', 500)).toBe('good')
      expect(rateMetric('TTFB', 1000)).toBe('needs-improvement')
      expect(rateMetric('TTFB', 2000)).toBe('poor')
    })

    it('should rate TBT correctly', () => {
      expect(rateMetric('TBT', 100)).toBe('good')
      expect(rateMetric('TBT', 400)).toBe('needs-improvement')
      expect(rateMetric('TBT', 700)).toBe('poor')
    })

    it('should handle unknown metrics as poor', () => {
      expect(rateMetric('UNKNOWN' as MetricName, 100)).toBe('poor')
    })

    it('should handle edge cases at exact thresholds', () => {
      // Exactly at good threshold
      expect(rateMetric('LCP', 2500)).toBe('good')
      // Exactly at needs-improvement threshold
      expect(rateMetric('LCP', 4000)).toBe('needs-improvement')
    })
  })

  describe('rateScore', () => {
    it('should rate score as good when >= 90', () => {
      expect(rateScore(90)).toBe('good')
      expect(rateScore(95)).toBe('good')
      expect(rateScore(100)).toBe('good')
    })

    it('should rate score as needs-improvement when 50-89', () => {
      expect(rateScore(50)).toBe('needs-improvement')
      expect(rateScore(70)).toBe('needs-improvement')
      expect(rateScore(89)).toBe('needs-improvement')
    })

    it('should rate score as poor when < 50', () => {
      expect(rateScore(0)).toBe('poor')
      expect(rateScore(25)).toBe('poor')
      expect(rateScore(49)).toBe('poor')
    })
  })

  describe('Score Conversion', () => {
    describe('scoreToPercentage', () => {
      it('should convert 0-1 score to 0-100 percentage', () => {
        expect(scoreToPercentage(0)).toBe(0)
        expect(scoreToPercentage(0.5)).toBe(50)
        expect(scoreToPercentage(1)).toBe(100)
        expect(scoreToPercentage(0.85)).toBe(85)
      })

      it('should round to nearest integer', () => {
        expect(scoreToPercentage(0.856)).toBe(86)
        expect(scoreToPercentage(0.854)).toBe(85)
      })
    })

    describe('percentageToScore', () => {
      it('should convert 0-100 percentage to 0-1 score', () => {
        expect(percentageToScore(0)).toBe(0)
        expect(percentageToScore(50)).toBe(0.5)
        expect(percentageToScore(100)).toBe(1)
        expect(percentageToScore(85)).toBe(0.85)
      })
    })

    it('should be reversible', () => {
      const original = 0.85
      const percentage = scoreToPercentage(original)
      const restored = percentageToScore(percentage)
      expect(restored).toBe(original)
    })
  })

  describe('createWebVitalMetric', () => {
    it('should create a valid WebVitalMetric object', () => {
      const metric = createWebVitalMetric('LCP', 2000)

      expect(metric.name).toBe('LCP')
      expect(metric.value).toBe(2000)
      expect(metric.rating).toBe('good')
      expect(metric.threshold).toEqual({
        good: 2500,
        needsImprovement: 4000,
      })
    })

    it('should assign correct rating based on value', () => {
      expect(createWebVitalMetric('LCP', 2000).rating).toBe('good')
      expect(createWebVitalMetric('LCP', 3000).rating).toBe('needs-improvement')
      expect(createWebVitalMetric('LCP', 5000).rating).toBe('poor')
    })

    it('should handle all metric types', () => {
      const metrics: MetricName[] = [
        'LCP',
        'FID',
        'INP',
        'CLS',
        'FCP',
        'TTFB',
        'TBT',
      ]
      for (const name of metrics) {
        const metric = createWebVitalMetric(name, 100)
        expect(metric.name).toBe(name)
        expect(metric.threshold).toBeDefined()
      }
    })
  })

  describe('checkBudget', () => {
    it('should pass when actual is below budget', () => {
      const result = checkBudget('LCP', 2500, 2000)
      expect(result.passed).toBe(true)
      expect(result.overage).toBeUndefined()
    })

    it('should pass when actual equals budget', () => {
      const result = checkBudget('LCP', 2500, 2500)
      expect(result.passed).toBe(true)
      expect(result.overage).toBeUndefined()
    })

    it('should fail when actual exceeds budget', () => {
      const result = checkBudget('LCP', 2500, 3000)
      expect(result.passed).toBe(false)
      expect(result.overage).toBe(500)
    })

    it('should return correct structure', () => {
      const result = checkBudget('Total JS', 500000, 450000)
      expect(result).toEqual({
        metric: 'Total JS',
        budget: 500000,
        actual: 450000,
        passed: true,
        overage: undefined,
      })
    })

    it('should calculate overage correctly', () => {
      const result = checkBudget('CSS Size', 50000, 75000)
      expect(result.overage).toBe(25000)
    })
  })

  describe('calculateOverallResult', () => {
    const goodScores: LighthouseScore = {
      performance: 90,
      accessibility: 95,
      bestPractices: 92,
      seo: 98,
    }

    const passingBudgets: PerformanceBudget[] = [
      { metric: 'LCP', budget: 2500, actual: 2000, passed: true },
      { metric: 'CLS', budget: 0.1, actual: 0.05, passed: true },
    ]

    it('should pass when all scores and budgets meet thresholds', () => {
      const result = calculateOverallResult(goodScores, passingBudgets)
      expect(result.passed).toBe(true)
      expect(result.summary).toBe('All performance checks passed')
    })

    it('should fail when performance score is below threshold', () => {
      const scores = { ...goodScores, performance: 70 }
      const result = calculateOverallResult(scores, passingBudgets)
      expect(result.passed).toBe(false)
      expect(result.summary).toContain('performance')
    })

    it('should fail when accessibility score is below threshold', () => {
      const scores = { ...goodScores, accessibility: 80 }
      const result = calculateOverallResult(scores, passingBudgets)
      expect(result.passed).toBe(false)
      expect(result.summary).toContain('accessibility')
    })

    it('should fail when a budget is exceeded', () => {
      const failingBudgets: PerformanceBudget[] = [
        { metric: 'LCP', budget: 2500, actual: 3000, passed: false, overage: 500 },
      ]
      const result = calculateOverallResult(goodScores, failingBudgets)
      expect(result.passed).toBe(false)
      expect(result.summary).toContain('LCP')
    })

    it('should report multiple failures', () => {
      const badScores = { ...goodScores, performance: 70, accessibility: 80 }
      const failingBudgets: PerformanceBudget[] = [
        { metric: 'LCP', budget: 2500, actual: 3000, passed: false, overage: 500 },
      ]
      const result = calculateOverallResult(badScores, failingBudgets)
      expect(result.passed).toBe(false)
      expect(result.summary).toContain('performance')
      expect(result.summary).toContain('accessibility')
      expect(result.summary).toContain('LCP')
    })

    it('should handle empty budgets array', () => {
      const result = calculateOverallResult(goodScores, [])
      expect(result.passed).toBe(true)
    })
  })

  describe('createLighthouseResult', () => {
    const url = 'http://localhost:5173/'
    const scores: LighthouseScore = {
      performance: 92,
      accessibility: 95,
      bestPractices: 90,
      seo: 100,
    }
    const webVitals: WebVitalMetric[] = [
      createWebVitalMetric('LCP', 2000),
      createWebVitalMetric('CLS', 0.05),
    ]
    const budgets: PerformanceBudget[] = [
      { metric: 'LCP', budget: 2500, actual: 2000, passed: true },
    ]

    it('should create a complete LighthouseResult object', () => {
      const result = createLighthouseResult(url, scores, webVitals, budgets)

      expect(result.url).toBe(url)
      expect(result.scores).toEqual(scores)
      expect(result.webVitals).toEqual(webVitals)
      expect(result.budgets).toEqual(budgets)
      expect(result.passed).toBe(true)
      expect(result.timestamp).toBeDefined()
    })

    it('should include valid ISO timestamp', () => {
      const result = createLighthouseResult(url, scores, webVitals, budgets)
      const timestamp = new Date(result.timestamp)
      expect(timestamp.toISOString()).toBe(result.timestamp)
    })

    it('should calculate passed status correctly', () => {
      const failingScores = { ...scores, performance: 50 }
      const result = createLighthouseResult(
        url,
        failingScores,
        webVitals,
        budgets
      )
      expect(result.passed).toBe(false)
    })
  })

  describe('validateScores', () => {
    it('should validate all scores pass default thresholds', () => {
      const scores: LighthouseScore = {
        performance: 85,
        accessibility: 95,
        bestPractices: 92,
        seo: 98,
      }
      const result = validateScores(scores)
      expect(result.valid).toBe(true)
      expect(result.failures).toHaveLength(0)
    })

    it('should detect failing performance score', () => {
      const scores: LighthouseScore = {
        performance: 70, // Below 80 threshold
        accessibility: 95,
        bestPractices: 92,
        seo: 98,
      }
      const result = validateScores(scores)
      expect(result.valid).toBe(false)
      expect(result.failures).toContain('performance: 70 < 80')
    })

    it('should detect failing accessibility score', () => {
      const scores: LighthouseScore = {
        performance: 85,
        accessibility: 85, // Below 90 threshold
        bestPractices: 92,
        seo: 98,
      }
      const result = validateScores(scores)
      expect(result.valid).toBe(false)
      expect(result.failures).toContain('accessibility: 85 < 90')
    })

    it('should support custom minimum scores', () => {
      const scores: LighthouseScore = {
        performance: 95,
        accessibility: 85,
        bestPractices: 92,
        seo: 98,
      }
      const result = validateScores(scores, { accessibility: 80 })
      expect(result.valid).toBe(true)
    })

    it('should detect multiple failures', () => {
      const scores: LighthouseScore = {
        performance: 50,
        accessibility: 70,
        bestPractices: 80,
        seo: 60,
      }
      const result = validateScores(scores)
      expect(result.valid).toBe(false)
      expect(result.failures.length).toBeGreaterThan(1)
    })
  })

  describe('formatResult', () => {
    const result: LighthouseResult = {
      url: 'http://localhost:5173/',
      timestamp: '2024-01-15T10:30:00.000Z',
      scores: {
        performance: 92,
        accessibility: 95,
        bestPractices: 90,
        seo: 100,
      },
      webVitals: [
        createWebVitalMetric('LCP', 2000),
        createWebVitalMetric('CLS', 0.05),
      ],
      budgets: [
        { metric: 'LCP', budget: 2500, actual: 2000, passed: true },
      ],
      passed: true,
      summary: 'All performance checks passed',
    }

    it('should format result as string', () => {
      const formatted = formatResult(result)
      expect(typeof formatted).toBe('string')
    })

    it('should include URL', () => {
      const formatted = formatResult(result)
      expect(formatted).toContain(result.url)
    })

    it('should include all scores', () => {
      const formatted = formatResult(result)
      expect(formatted).toContain('Performance')
      expect(formatted).toContain('92')
      expect(formatted).toContain('Accessibility')
      expect(formatted).toContain('95')
    })

    it('should include Web Vitals', () => {
      const formatted = formatResult(result)
      expect(formatted).toContain('LCP')
      expect(formatted).toContain('2000')
      expect(formatted).toContain('CLS')
      expect(formatted).toContain('0.05')
    })

    it('should include budgets', () => {
      const formatted = formatResult(result)
      expect(formatted).toContain('Budgets')
      expect(formatted).toContain('LCP')
    })

    it('should show PASSED for passing result', () => {
      const formatted = formatResult(result)
      expect(formatted).toContain('PASSED')
    })

    it('should show FAILED for failing result', () => {
      const failingResult = { ...result, passed: false }
      const formatted = formatResult(failingResult)
      expect(formatted).toContain('FAILED')
    })
  })

  describe('getScoreColor', () => {
    it('should return green for good scores', () => {
      expect(getScoreColor(90)).toContain('32m') // Green ANSI code
      expect(getScoreColor(100)).toContain('32m')
    })

    it('should return yellow for needs-improvement scores', () => {
      expect(getScoreColor(50)).toContain('33m') // Yellow ANSI code
      expect(getScoreColor(89)).toContain('33m')
    })

    it('should return red for poor scores', () => {
      expect(getScoreColor(0)).toContain('31m') // Red ANSI code
      expect(getScoreColor(49)).toContain('31m')
    })
  })

  describe('parseLighthouseOutput', () => {
    it('should parse Lighthouse JSON with categories', () => {
      const json = {
        categories: {
          performance: { score: 0.92 },
          accessibility: { score: 0.95 },
          'best-practices': { score: 0.9 },
          seo: { score: 1.0 },
        },
        audits: {},
      }

      const { scores } = parseLighthouseOutput(json)
      expect(scores.performance).toBe(92)
      expect(scores.accessibility).toBe(95)
      expect(scores.bestPractices).toBe(90)
      expect(scores.seo).toBe(100)
    })

    it('should parse Web Vitals from audits', () => {
      const json = {
        categories: {},
        audits: {
          'largest-contentful-paint': { numericValue: 2000 },
          'cumulative-layout-shift': { numericValue: 0.05 },
          'first-contentful-paint': { numericValue: 1500 },
          'total-blocking-time': { numericValue: 150 },
        },
      }

      const { webVitals } = parseLighthouseOutput(json)
      expect(webVitals.find((v) => v.name === 'LCP')?.value).toBe(2000)
      expect(webVitals.find((v) => v.name === 'CLS')?.value).toBe(0.05)
      expect(webVitals.find((v) => v.name === 'FCP')?.value).toBe(1500)
      expect(webVitals.find((v) => v.name === 'TBT')?.value).toBe(150)
    })

    it('should handle missing categories gracefully', () => {
      const json = { audits: {} }
      const { scores } = parseLighthouseOutput(json)
      expect(scores.performance).toBe(0)
      expect(scores.accessibility).toBe(0)
    })

    it('should handle missing audits gracefully', () => {
      const json = { categories: {} }
      const { webVitals } = parseLighthouseOutput(json)
      expect(webVitals).toHaveLength(0)
    })

    it('should handle empty input', () => {
      const { scores, webVitals } = parseLighthouseOutput({})
      expect(scores.performance).toBe(0)
      expect(webVitals).toHaveLength(0)
    })

    it('should assign correct ratings to parsed Web Vitals', () => {
      const json = {
        categories: {},
        audits: {
          'largest-contentful-paint': { numericValue: 2000 }, // good
          'cumulative-layout-shift': { numericValue: 0.15 }, // needs-improvement
        },
      }

      const { webVitals } = parseLighthouseOutput(json)
      const lcp = webVitals.find((v) => v.name === 'LCP')
      const cls = webVitals.find((v) => v.name === 'CLS')

      expect(lcp?.rating).toBe('good')
      expect(cls?.rating).toBe('needs-improvement')
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle typical good performance result', () => {
      const scores: LighthouseScore = {
        performance: 95,
        accessibility: 100,
        bestPractices: 92,
        seo: 100,
      }
      const webVitals = [
        createWebVitalMetric('LCP', 1800),
        createWebVitalMetric('FCP', 1200),
        createWebVitalMetric('CLS', 0.02),
        createWebVitalMetric('TBT', 100),
      ]
      const budgets = [
        checkBudget('LCP', 2500, 1800),
        checkBudget('FCP', 1800, 1200),
        checkBudget('CLS', 0.1, 0.02),
      ]

      const result = createLighthouseResult(
        'http://localhost:5173/',
        scores,
        webVitals,
        budgets
      )

      expect(result.passed).toBe(true)
      expect(result.webVitals.every((v) => v.rating === 'good')).toBe(true)
      expect(result.budgets.every((b) => b.passed)).toBe(true)
    })

    it('should handle typical poor performance result', () => {
      const scores: LighthouseScore = {
        performance: 45,
        accessibility: 72,
        bestPractices: 67,
        seo: 78,
      }
      const webVitals = [
        createWebVitalMetric('LCP', 6000),
        createWebVitalMetric('FCP', 4500),
        createWebVitalMetric('CLS', 0.35),
        createWebVitalMetric('TBT', 800),
      ]
      const budgets = [
        checkBudget('LCP', 2500, 6000),
        checkBudget('FCP', 1800, 4500),
        checkBudget('CLS', 0.1, 0.35),
      ]

      const result = createLighthouseResult(
        'http://localhost:5173/',
        scores,
        webVitals,
        budgets
      )

      expect(result.passed).toBe(false)
      expect(result.webVitals.every((v) => v.rating === 'poor')).toBe(true)
      expect(result.budgets.every((b) => !b.passed)).toBe(true)
    })

    it('should handle mixed results with some passing and some failing', () => {
      const scores: LighthouseScore = {
        performance: 82, // Passing
        accessibility: 95, // Passing
        bestPractices: 85, // Failing
        seo: 92, // Passing
      }
      const webVitals = [
        createWebVitalMetric('LCP', 2200), // good
        createWebVitalMetric('FCP', 2500), // needs-improvement
        createWebVitalMetric('CLS', 0.08), // good
        createWebVitalMetric('TBT', 450), // needs-improvement
      ]

      const result = createLighthouseResult(
        'http://localhost:5173/',
        scores,
        webVitals,
        []
      )

      expect(result.passed).toBe(false) // bestPractices < 90
      expect(result.webVitals.some((v) => v.rating === 'good')).toBe(true)
      expect(result.webVitals.some((v) => v.rating === 'needs-improvement')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero values', () => {
      expect(rateMetric('LCP', 0)).toBe('good')
      expect(rateMetric('CLS', 0)).toBe('good')
      expect(rateScore(0)).toBe('poor')
    })

    it('should handle very large values', () => {
      expect(rateMetric('LCP', 100000)).toBe('poor')
      expect(rateMetric('CLS', 10)).toBe('poor')
    })

    it('should handle decimal precision for CLS', () => {
      expect(rateMetric('CLS', 0.099999)).toBe('good')
      expect(rateMetric('CLS', 0.100001)).toBe('needs-improvement')
    })

    it('should handle boundary values for scores', () => {
      expect(rateScore(89.9)).toBe('needs-improvement')
      expect(rateScore(90.0)).toBe('good')
      expect(rateScore(49.9)).toBe('poor')
      expect(rateScore(50.0)).toBe('needs-improvement')
    })
  })

  describe('Type Safety', () => {
    it('should enforce MetricName type', () => {
      const validMetrics: MetricName[] = [
        'LCP',
        'FID',
        'INP',
        'CLS',
        'FCP',
        'TTFB',
        'TBT',
      ]
      validMetrics.forEach((name) => {
        const metric = createWebVitalMetric(name, 100)
        expect(metric.name).toBe(name)
      })
    })

    it('should return complete LighthouseResult type', () => {
      const result = createLighthouseResult(
        'http://test.com',
        { performance: 90, accessibility: 90, bestPractices: 90, seo: 90 },
        [],
        []
      )

      // Type should include all required properties
      expect(result).toHaveProperty('url')
      expect(result).toHaveProperty('timestamp')
      expect(result).toHaveProperty('scores')
      expect(result).toHaveProperty('webVitals')
      expect(result).toHaveProperty('budgets')
      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('summary')
    })
  })
})
