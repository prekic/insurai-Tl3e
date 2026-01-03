/**
 * Tests for Cost Tracker
 * Tests CostTracker singleton with IndexedDB and budget management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { costTracker } from './tracker'
import type { UsageRecord, CostBudget } from './types'
import {
  MODEL_PRICING,
  estimateTokens,
  estimateExtractionOutputTokens,
  calculateCost,
  formatCost,
  formatTokens,
  DEFAULT_BUDGET,
} from './types'

// =============================================================================
// Types Module Tests
// =============================================================================

describe('MODEL_PRICING', () => {
  it('should have pricing for OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined()
    expect(MODEL_PRICING['gpt-4o'].inputPer1K).toBe(0.0025)
    expect(MODEL_PRICING['gpt-4o'].outputPer1K).toBe(0.01)
    expect(MODEL_PRICING['gpt-4o'].contextLimit).toBe(128000)
  })

  it('should have pricing for gpt-4o-mini', () => {
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined()
    expect(MODEL_PRICING['gpt-4o-mini'].inputPer1K).toBe(0.00015)
    expect(MODEL_PRICING['gpt-4o-mini'].outputPer1K).toBe(0.0006)
  })

  it('should have pricing for gpt-4-turbo', () => {
    expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined()
    expect(MODEL_PRICING['gpt-4-turbo'].inputPer1K).toBe(0.01)
    expect(MODEL_PRICING['gpt-4-turbo'].outputPer1K).toBe(0.03)
  })

  it('should have pricing for Claude models', () => {
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022']).toBeDefined()
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022'].inputPer1K).toBe(0.003)
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022'].outputPer1K).toBe(0.015)
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022'].contextLimit).toBe(200000)
  })

  it('should have pricing for claude-3-5-haiku', () => {
    expect(MODEL_PRICING['claude-3-5-haiku-20241022']).toBeDefined()
    expect(MODEL_PRICING['claude-3-5-haiku-20241022'].inputPer1K).toBe(0.001)
    expect(MODEL_PRICING['claude-3-5-haiku-20241022'].outputPer1K).toBe(0.005)
  })

  it('should have pricing for claude-3-opus', () => {
    expect(MODEL_PRICING['claude-3-opus-20240229']).toBeDefined()
    expect(MODEL_PRICING['claude-3-opus-20240229'].inputPer1K).toBe(0.015)
    expect(MODEL_PRICING['claude-3-opus-20240229'].outputPer1K).toBe(0.075)
  })

  it('should have pricing for google-document-ai', () => {
    expect(MODEL_PRICING['google-document-ai']).toBeDefined()
    expect(MODEL_PRICING['google-document-ai'].inputPer1K).toBe(1.5)
  })
})

describe('estimateTokens', () => {
  it('should estimate tokens for short text', () => {
    const tokens = estimateTokens('Hello world')
    expect(tokens).toBeGreaterThan(0)
  })

  it('should estimate tokens for longer text', () => {
    const text = 'This is a longer piece of text that should result in more tokens. '.repeat(10)
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(50)
  })

  it('should use character-based estimation', () => {
    const text = 'abcd' // 4 characters = ~1 token
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThanOrEqual(1)
  })

  it('should use word-based estimation for short texts', () => {
    const text = 'word'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
  })

  it('should return higher estimate for safety', () => {
    const text = 'Testing token estimation with various word lengths'
    const tokens = estimateTokens(text)
    // Should be at least character-based or word-based estimate
    expect(tokens).toBeGreaterThanOrEqual(Math.ceil(text.length / 4))
  })
})

describe('estimateExtractionOutputTokens', () => {
  it('should estimate output tokens based on input', () => {
    const output = estimateExtractionOutputTokens(1000)
    expect(output).toBeGreaterThan(0)
  })

  it('should include base output tokens', () => {
    const output = estimateExtractionOutputTokens(100)
    expect(output).toBeGreaterThan(800) // Base output is 800
  })

  it('should scale with input size', () => {
    const small = estimateExtractionOutputTokens(100)
    const large = estimateExtractionOutputTokens(10000)
    expect(large).toBeGreaterThan(small)
  })
})

describe('calculateCost', () => {
  it('should calculate cost for gpt-4o', () => {
    const result = calculateCost('gpt-4o', 1000, 500)

    expect(result.inputCost).toBe(0.0025) // 1000 * 0.0025 / 1000
    expect(result.outputCost).toBe(0.005) // 500 * 0.01 / 1000
    expect(result.totalCost).toBe(0.0075)
  })

  it('should calculate cost for claude model', () => {
    const result = calculateCost('claude-3-5-sonnet-20241022', 1000, 500)

    expect(result.inputCost).toBe(0.003)
    expect(result.outputCost).toBe(0.0075)
    expect(result.totalCost).toBe(0.0105)
  })

  it('should round to 4 decimal places', () => {
    const result = calculateCost('gpt-4o', 1, 1)

    expect(result.inputCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(4)
    expect(result.outputCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(4)
  })

  it('should use gpt-4o pricing for unknown models', () => {
    const result = calculateCost('unknown-model', 1000, 500)
    const gpt4oResult = calculateCost('gpt-4o', 1000, 500)

    expect(result.totalCost).toBe(gpt4oResult.totalCost)
  })

  it('should handle zero tokens', () => {
    const result = calculateCost('gpt-4o', 0, 0)

    expect(result.inputCost).toBe(0)
    expect(result.outputCost).toBe(0)
    expect(result.totalCost).toBe(0)
  })
})

describe('formatCost', () => {
  it('should format cost in dollars', () => {
    const formatted = formatCost(1.5)
    expect(formatted).toBe('$1.5000')
  })

  it('should format small costs in cents', () => {
    const formatted = formatCost(0.005)
    expect(formatted).toBe('$0.50¢')
  })

  it('should handle zero cost', () => {
    const formatted = formatCost(0)
    expect(formatted).toBe('$0.00¢')
  })

  it('should format larger costs', () => {
    const formatted = formatCost(10.5)
    expect(formatted).toBe('$10.5000')
  })
})

describe('formatTokens', () => {
  it('should format small token counts as is', () => {
    expect(formatTokens(500)).toBe('500')
  })

  it('should format thousands with K suffix', () => {
    expect(formatTokens(5000)).toBe('5.0K')
  })

  it('should format millions with M suffix', () => {
    expect(formatTokens(1500000)).toBe('1.50M')
  })

  it('should format boundary values', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1000)).toBe('1.0K')
    expect(formatTokens(999999)).toBe('1000.0K')
    expect(formatTokens(1000000)).toBe('1.00M')
  })
})

describe('DEFAULT_BUDGET', () => {
  it('should have default monthly limit', () => {
    expect(DEFAULT_BUDGET.monthlyLimit).toBe(100)
  })

  it('should have warning threshold at 80%', () => {
    expect(DEFAULT_BUDGET.warningThreshold).toBe(0.8)
  })

  it('should not have hard limit by default', () => {
    expect(DEFAULT_BUDGET.hardLimit).toBe(false)
  })

  it('should have per-user limits', () => {
    expect(DEFAULT_BUDGET.perUserDaily).toBe(5)
    expect(DEFAULT_BUDGET.perUserMonthly).toBe(50)
  })
})

// =============================================================================
// costTracker Singleton Tests
// =============================================================================

describe('costTracker singleton', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Clear any stored records by calling clearRecords
    try {
      await costTracker.clearRecords()
    } catch {
      // Ignore errors during cleanup
    }
  })

  describe('getModelPricing', () => {
    it('should return pricing for gpt-4o', () => {
      const pricing = costTracker.getModelPricing('gpt-4o')

      expect(pricing.inputPer1K).toBe(0.0025)
      expect(pricing.outputPer1K).toBe(0.01)
      expect(pricing.contextLimit).toBe(128000)
    })

    it('should return pricing for Claude models', () => {
      const pricing = costTracker.getModelPricing('claude-3-5-sonnet-20241022')

      expect(pricing.inputPer1K).toBe(0.003)
      expect(pricing.outputPer1K).toBe(0.015)
      expect(pricing.contextLimit).toBe(200000)
    })

    it('should return default pricing for unknown models', () => {
      const pricing = costTracker.getModelPricing('unknown-model')

      expect(pricing).toBeDefined()
      expect(pricing.inputPer1K).toBeGreaterThan(0)
    })
  })

  describe('getBudget', () => {
    it('should return budget configuration', () => {
      const budget = costTracker.getBudget()

      expect(budget).toHaveProperty('monthlyLimit')
      expect(budget).toHaveProperty('warningThreshold')
      expect(budget).toHaveProperty('hardLimit')
      expect(budget).toHaveProperty('perUserDaily')
      expect(budget).toHaveProperty('perUserMonthly')
    })

    it('should return a copy of budget', () => {
      const budget1 = costTracker.getBudget()
      const originalLimit = budget1.monthlyLimit
      budget1.monthlyLimit = 999

      const budget2 = costTracker.getBudget()
      expect(budget2.monthlyLimit).toBe(originalLimit)
    })
  })

  describe('setBudget', () => {
    afterEach(() => {
      // Reset to defaults
      costTracker.setBudget(DEFAULT_BUDGET)
    })

    it('should update budget settings', () => {
      const originalBudget = costTracker.getBudget()
      const newLimit = originalBudget.monthlyLimit + 100

      costTracker.setBudget({ monthlyLimit: newLimit })

      const budget = costTracker.getBudget()
      expect(budget.monthlyLimit).toBe(newLimit)
    })

    it('should merge with existing budget', () => {
      const originalBudget = costTracker.getBudget()

      costTracker.setBudget({ hardLimit: true })

      const budget = costTracker.getBudget()
      expect(budget.hardLimit).toBe(true)
      expect(budget.warningThreshold).toBe(originalBudget.warningThreshold)
    })
  })
})

// =============================================================================
// UsageRecord Type Tests
// =============================================================================

describe('UsageRecord type', () => {
  it('should have required fields', () => {
    const record: UsageRecord = {
      id: 'test-1',
      timestamp: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      inputCost: 0.0025,
      outputCost: 0.005,
      totalCost: 0.0075,
      cacheHit: false,
      cacheSavings: 0,
      success: true,
    }

    expect(record.id).toBe('test-1')
    expect(record.provider).toBe('openai')
    expect(record.model).toBe('gpt-4o')
    expect(record.operation).toBe('extraction')
  })

  it('should support optional fields', () => {
    const record: UsageRecord = {
      id: 'test-2',
      timestamp: Date.now(),
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      operation: 'analysis',
      inputTokens: 500,
      outputTokens: 300,
      totalTokens: 800,
      inputCost: 0.0015,
      outputCost: 0.0045,
      totalCost: 0.006,
      cacheHit: false,
      cacheSavings: 0,
      success: true,
      documentLength: 10000,
      pageCount: 5,
      durationMs: 2500,
      userId: 'user-123',
      sessionId: 'session-456',
    }

    expect(record.documentLength).toBe(10000)
    expect(record.pageCount).toBe(5)
    expect(record.durationMs).toBe(2500)
    expect(record.userId).toBe('user-123')
    expect(record.sessionId).toBe('session-456')
  })

  it('should support error fields', () => {
    const record: UsageRecord = {
      id: 'test-3',
      timestamp: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 0,
      totalTokens: 100,
      inputCost: 0.00025,
      outputCost: 0,
      totalCost: 0.00025,
      cacheHit: false,
      cacheSavings: 0,
      success: false,
      errorMessage: 'API rate limit exceeded',
    }

    expect(record.success).toBe(false)
    expect(record.errorMessage).toBe('API rate limit exceeded')
  })
})

// =============================================================================
// CostBudget Type Tests
// =============================================================================

describe('CostBudget type', () => {
  it('should have all required properties', () => {
    const budget: CostBudget = {
      monthlyLimit: 100,
      warningThreshold: 0.8,
      hardLimit: true,
      perUserDaily: 5,
      perUserMonthly: 50,
    }

    expect(budget.monthlyLimit).toBe(100)
    expect(budget.warningThreshold).toBe(0.8)
    expect(budget.hardLimit).toBe(true)
    expect(budget.perUserDaily).toBe(5)
    expect(budget.perUserMonthly).toBe(50)
  })

  it('should support optional alert configuration', () => {
    const budget: CostBudget = {
      monthlyLimit: 100,
      warningThreshold: 0.8,
      hardLimit: false,
      perUserDaily: 5,
      perUserMonthly: 50,
      alertEmail: 'alerts@example.com',
      slackWebhook: 'https://hooks.slack.com/...',
    }

    expect(budget.alertEmail).toBe('alerts@example.com')
    expect(budget.slackWebhook).toBe('https://hooks.slack.com/...')
  })
})

// =============================================================================
// Cost Calculation Edge Cases
// =============================================================================

describe('Cost Calculation Edge Cases', () => {
  it('should handle very large token counts', () => {
    const result = calculateCost('gpt-4o', 100000, 50000)

    expect(result.inputCost).toBe(0.25) // 100000 * 0.0025 / 1000
    expect(result.outputCost).toBe(0.5) // 50000 * 0.01 / 1000
    expect(result.totalCost).toBe(0.75)
  })

  it('should handle fractional token counts gracefully', () => {
    const result = calculateCost('gpt-4o', 1, 1)

    // 1 token at 0.0025 per 1000 = 0.0000025 which rounds to 0
    expect(result.inputCost).toBe(0)
    expect(result.outputCost).toBe(0)
    expect(result.totalCost).toBe(0)
  })

  it('should calculate costs for cheap models', () => {
    const result = calculateCost('gpt-4o-mini', 10000, 5000)

    expect(result.inputCost).toBe(0.0015) // 10000 * 0.00015 / 1000
    expect(result.outputCost).toBe(0.003) // 5000 * 0.0006 / 1000
    expect(result.totalCost).toBe(0.0045)
  })

  it('should calculate costs for expensive models', () => {
    const result = calculateCost('claude-3-opus-20240229', 1000, 500)

    expect(result.inputCost).toBe(0.015) // 1000 * 0.015 / 1000
    expect(result.outputCost).toBe(0.0375) // 500 * 0.075 / 1000
    expect(result.totalCost).toBe(0.0525)
  })
})

// =============================================================================
// Token Estimation Edge Cases
// =============================================================================

describe('Token Estimation Edge Cases', () => {
  it('should handle empty string', () => {
    const tokens = estimateTokens('')
    // Empty string splits to [''] which has length 1
    // Word-based: 1 * 1.3 = 1.3, rounds to 2
    // Char-based: 0 / 4 = 0
    // Max of both = 2
    expect(tokens).toBeGreaterThanOrEqual(0)
  })

  it('should handle single character', () => {
    const tokens = estimateTokens('a')
    expect(tokens).toBeGreaterThan(0)
  })

  it('should handle very long text', () => {
    const longText = 'word '.repeat(10000)
    const tokens = estimateTokens(longText)
    expect(tokens).toBeGreaterThan(10000)
  })

  it('should handle text with special characters', () => {
    const text = 'Türkçe karakterler: İşte öğrenci şişman çöp üzümü'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
  })

  it('should handle text with JSON structure', () => {
    const json = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } })
    const tokens = estimateTokens(json)
    expect(tokens).toBeGreaterThan(0)
  })
})

// =============================================================================
// Format Functions Edge Cases
// =============================================================================

describe('Format Functions Edge Cases', () => {
  describe('formatCost edge cases', () => {
    it('should handle very small costs', () => {
      const formatted = formatCost(0.00001)
      expect(formatted).toContain('¢')
    })

    it('should handle large costs', () => {
      const formatted = formatCost(1000)
      expect(formatted).toContain('$')
      expect(formatted).toContain('1000')
    })

    it('should handle negative costs', () => {
      const formatted = formatCost(-1.5)
      expect(formatted).toContain('-')
    })
  })

  describe('formatTokens edge cases', () => {
    it('should handle zero tokens', () => {
      expect(formatTokens(0)).toBe('0')
    })

    it('should handle very large token counts', () => {
      const formatted = formatTokens(1000000000)
      expect(formatted).toContain('M')
    })

    it('should handle exact boundaries', () => {
      expect(formatTokens(1000)).toBe('1.0K')
      expect(formatTokens(1000000)).toBe('1.00M')
    })
  })
})
