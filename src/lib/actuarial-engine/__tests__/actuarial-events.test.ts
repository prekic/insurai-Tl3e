/**
 * Actuarial Events Tests
 *
 * Tests for the lightweight pub/sub event bus used to communicate
 * evaluation results between consumer components and the admin tab.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subscribeEvaluation, emitEvaluation, getListenerCount } from '../actuarial-events'
import type { PolicyEvaluationResult } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<PolicyEvaluationResult> = {}): PolicyEvaluationResult {
  return {
    eligible: true,
    blockingReasons: [],
    warnings: [],
    productMismatches: [],
    compliance: {
      eligible: true,
      blockingReasons: [],
      warnings: [],
      checkedAt: '2026-01-01T00:00:00Z',
      rulesetVersion: 'test-v1',
    },
    semanticExclusions: [],
    evidenceCoverage: {
      totalFields: 10,
      fieldsWithEvidence: 8,
      coveragePercent: 80,
      fieldsNeedingReview: [],
      overallNeedsReview: false,
    },
    scenarioScores: {},
    expectedOutOfPocket: {
      expectedCost: { amount: 5000, currency: 'TRY' },
      premium: { amount: 4800, currency: 'TRY' },
      expectedUncoveredLoss: { amount: 200, currency: 'TRY' },
      percentiles: { p5: 4000, p25: 4500, p50: 5000, p75: 5500, p95: 7000 },
      scenarioBreakdown: [],
      config: { numSimulations: 1000, confidenceInterval: 0.9 },
      contractQualityFactor: 0.95,
    },
    contractQualityScore: 85,
    configSnapshot: {},
    layerTimings: {
      layerA_ms: 2,
      layerB_ms: 1,
      layerC_ms: 50,
      total_ms: 53,
    },
    needsReview: false,
    evaluatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actuarial-events', () => {
  // Clean up listeners between tests to prevent cross-contamination
  let unsubscribers: (() => void)[] = []

  beforeEach(() => {
    // Remove any leftover listeners from previous tests
    unsubscribers.forEach((unsub) => unsub())
    unsubscribers = []
  })

  describe('subscribeEvaluation', () => {
    it('returns an unsubscribe function', () => {
      const unsub = subscribeEvaluation(() => {})
      unsubscribers.push(unsub)
      expect(typeof unsub).toBe('function')
    })

    it('increments listener count on subscribe', () => {
      const before = getListenerCount()
      const unsub = subscribeEvaluation(() => {})
      unsubscribers.push(unsub)
      expect(getListenerCount()).toBe(before + 1)
    })

    it('decrements listener count on unsubscribe', () => {
      const before = getListenerCount()
      const unsub = subscribeEvaluation(() => {})
      expect(getListenerCount()).toBe(before + 1)
      unsub()
      expect(getListenerCount()).toBe(before)
    })
  })

  describe('emitEvaluation', () => {
    it('calls subscribed listener with correct event shape', () => {
      const listener = vi.fn()
      const unsub = subscribeEvaluation(listener)
      unsubscribers.push(unsub)

      const result = makeResult()
      emitEvaluation('pol-001', result)

      expect(listener).toHaveBeenCalledTimes(1)
      const event = listener.mock.calls[0][0]
      expect(event.policyId).toBe('pol-001')
      expect(event.result).toBe(result)
      expect(event.timestamp).toBeTruthy()
    })

    it('calls multiple listeners', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const unsub1 = subscribeEvaluation(listener1)
      const unsub2 = subscribeEvaluation(listener2)
      unsubscribers.push(unsub1, unsub2)

      emitEvaluation('pol-002', makeResult())

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('does not call unsubscribed listener', () => {
      const listener = vi.fn()
      const unsub = subscribeEvaluation(listener)
      unsub()

      emitEvaluation('pol-003', makeResult())

      expect(listener).not.toHaveBeenCalled()
    })

    it('does not break when listener throws', () => {
      const badListener = vi.fn(() => {
        throw new Error('Boom')
      })
      const goodListener = vi.fn()

      const unsub1 = subscribeEvaluation(badListener)
      const unsub2 = subscribeEvaluation(goodListener)
      unsubscribers.push(unsub1, unsub2)

      // Should not throw
      expect(() => emitEvaluation('pol-004', makeResult())).not.toThrow()

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalledTimes(1)
    })

    it('does nothing when no listeners are subscribed', () => {
      // Should not throw
      expect(() => emitEvaluation('pol-005', makeResult())).not.toThrow()
    })
  })
})
