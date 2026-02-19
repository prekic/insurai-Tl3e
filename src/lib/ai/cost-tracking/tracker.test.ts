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

// =============================================================================
// CostTracker recordUsage Tests
// =============================================================================

describe('costTracker.recordUsage', () => {
  beforeEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  afterEach(async () => {
    await costTracker.clearRecords()
  })

  it('should record basic usage', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    expect(record).toBeDefined()
    expect(record.id).toMatch(/^usage_/)
    expect(record.provider).toBe('openai')
    expect(record.model).toBe('gpt-4o')
    expect(record.operation).toBe('extraction')
    expect(record.inputTokens).toBe(1000)
    expect(record.outputTokens).toBe(500)
    expect(record.totalTokens).toBe(1500)
  })

  it('should calculate cost correctly', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    expect(record.inputCost).toBe(0.0025)
    expect(record.outputCost).toBe(0.005)
    expect(record.totalCost).toBe(0.0075)
  })

  it('should estimate tokens from inputText when not provided', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputText: 'This is a sample text for token estimation testing.',
    })

    expect(record.inputTokens).toBeGreaterThan(0)
    expect(record.outputTokens).toBeGreaterThan(0)
  })

  it('should handle cache hit', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      cacheHit: true,
    })

    expect(record.cacheHit).toBe(true)
    expect(record.totalCost).toBe(0) // No cost for cache hit
    expect(record.cacheSavings).toBe(0.0075) // What would have been spent
  })

  it('should record anthropic provider', async () => {
    const record = await costTracker.recordUsage({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      operation: 'analysis',
      inputTokens: 2000,
      outputTokens: 1000,
    })

    expect(record.provider).toBe('anthropic')
    expect(record.model).toBe('claude-3-5-sonnet-20241022')
    expect(record.inputCost).toBe(0.006) // 2000 * 0.003 / 1000
    expect(record.outputCost).toBe(0.015) // 1000 * 0.015 / 1000
  })

  it('should record ocr operation', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'ocr',
      inputTokens: 500,
      outputTokens: 200,
      pageCount: 3,
    })

    expect(record.operation).toBe('ocr')
    expect(record.pageCount).toBe(3)
  })

  it('should record consensus operation', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'consensus',
      inputTokens: 1500,
      outputTokens: 800,
    })

    expect(record.operation).toBe('consensus')
  })

  it('should record optional fields', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      documentLength: 5000,
      pageCount: 2,
      durationMs: 1500,
      userId: 'user-123',
      sessionId: 'session-456',
    })

    expect(record.documentLength).toBe(5000)
    expect(record.pageCount).toBe(2)
    expect(record.durationMs).toBe(1500)
    expect(record.userId).toBe('user-123')
    expect(record.sessionId).toBe('session-456')
  })

  it('should record failed request', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 0,
      success: false,
      errorMessage: 'Rate limit exceeded',
    })

    expect(record.success).toBe(false)
    expect(record.errorMessage).toBe('Rate limit exceeded')
  })

  it('should generate unique IDs', async () => {
    // Generate multiple records and ensure all IDs are unique
    const ids = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const record = await costTracker.recordUsage({
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'extraction',
        inputTokens: 100,
        outputTokens: 50,
      })
      ids.add(record.id)
    }

    expect(ids.size).toBe(10)
  })

  it('should default success to true', async () => {
    const record = await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    expect(record.success).toBe(true)
  })
})

// =============================================================================
// CostTracker getStats Tests
// =============================================================================

describe('costTracker.getStats', () => {
  beforeEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  afterEach(async () => {
    await costTracker.clearRecords()
  })

  it('should return stats for empty records', async () => {
    const stats = await costTracker.getStats()

    expect(stats.totalRequests).toBe(0)
    expect(stats.totalCost).toBe(0)
    expect(stats.netCost).toBe(0)
  })

  it('should calculate total requests', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 200,
      outputTokens: 100,
    })

    const stats = await costTracker.getStats()

    expect(stats.totalRequests).toBe(2)
  })

  it('should sum total tokens', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 2000,
      outputTokens: 1000,
    })

    const stats = await costTracker.getStats()

    expect(stats.totalInputTokens).toBe(3000)
    expect(stats.totalOutputTokens).toBe(1500)
    expect(stats.totalTokens).toBe(4500)
  })

  it('should sum total cost', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const stats = await costTracker.getStats()

    expect(stats.totalCost).toBe(0.015) // 0.0075 * 2
  })

  it('should count successful and failed requests', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      success: true,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 0,
      success: false,
    })

    const stats = await costTracker.getStats()

    expect(stats.successfulRequests).toBe(1)
    expect(stats.failedRequests).toBe(1)
  })

  it('should count cached requests', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      cacheHit: true,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      cacheHit: false,
    })

    const stats = await costTracker.getStats()

    expect(stats.cachedRequests).toBe(1)
  })

  it('should calculate total savings from cache hits', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      cacheHit: true,
    })

    const stats = await costTracker.getStats()

    expect(stats.totalSavings).toBe(0.0075)
    expect(stats.netCost).toBe(stats.totalCost - stats.totalSavings)
  })

  it('should track stats by provider', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const stats = await costTracker.getStats()

    expect(stats.byProvider.openai.requests).toBe(1)
    expect(stats.byProvider.anthropic.requests).toBe(1)
    expect(stats.byProvider.openai.tokens).toBe(1500)
  })

  it('should track stats by operation', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'ocr',
      inputTokens: 200,
      outputTokens: 100,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    const stats = await costTracker.getStats()

    expect(stats.byOperation['extraction'].requests).toBe(2)
    expect(stats.byOperation['ocr'].requests).toBe(1)
  })

  it('should calculate average duration', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1000,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 2000,
    })

    const stats = await costTracker.getStats()

    expect(stats.avgDurationMs).toBe(1500)
  })

  it('should calculate p95 duration', async () => {
    // Add 20 records with varying durations
    for (let i = 1; i <= 20; i++) {
      await costTracker.recordUsage({
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'extraction',
        inputTokens: 100,
        outputTokens: 50,
        durationMs: i * 100,
      })
    }

    const stats = await costTracker.getStats()

    // p95 should be around the 95th percentile
    expect(stats.p95DurationMs).toBeGreaterThanOrEqual(1900)
  })

  it('should track daily costs', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const stats = await costTracker.getStats()

    expect(stats.dailyCosts.length).toBeGreaterThan(0)
    expect(stats.dailyCosts[0]).toHaveProperty('date')
    expect(stats.dailyCosts[0]).toHaveProperty('cost')
  })

  it('should filter by date range', async () => {
    const now = new Date()

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    // Stats for today only
    const stats = await costTracker.getStats(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      now
    )

    expect(stats.totalRequests).toBe(1)
  })

  it('should filter by userId', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      userId: 'user-1',
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
      userId: 'user-2',
    })

    const stats = await costTracker.getStats(undefined, undefined, 'user-1')

    expect(stats.totalRequests).toBe(1)
  })
})

// =============================================================================
// CostTracker getCurrentMonthStatus Tests
// =============================================================================

describe('costTracker.getCurrentMonthStatus', () => {
  beforeEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  afterEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  it('should return zero spent for no records', async () => {
    const status = await costTracker.getCurrentMonthStatus()

    expect(status.spent).toBe(0)
    expect(status.isOverBudget).toBe(false)
    expect(status.isWarning).toBe(false)
  })

  it('should calculate spent amount', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const status = await costTracker.getCurrentMonthStatus()

    expect(status.spent).toBeGreaterThan(0)
  })

  it('should return budget limit', async () => {
    costTracker.setBudget({ monthlyLimit: 200 })

    const status = await costTracker.getCurrentMonthStatus()

    expect(status.budget).toBe(200)
  })

  it('should calculate percent used', async () => {
    costTracker.setBudget({ monthlyLimit: 0.015 }) // Set low limit

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const status = await costTracker.getCurrentMonthStatus()

    expect(status.percentUsed).toBeGreaterThan(0)
  })

  it('should calculate remaining budget', async () => {
    costTracker.setBudget({ monthlyLimit: 100 })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const status = await costTracker.getCurrentMonthStatus()

    expect(status.remaining).toBeLessThan(100)
    expect(status.remaining).toBeGreaterThan(0)
  })

  it('should detect warning threshold', async () => {
    costTracker.setBudget({ monthlyLimit: 0.0075, warningThreshold: 0.5 })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const status = await costTracker.getCurrentMonthStatus()

    expect(status.isWarning).toBe(true)
  })

  it('should detect over budget', async () => {
    costTracker.setBudget({ monthlyLimit: 0.005 })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const status = await costTracker.getCurrentMonthStatus()

    expect(status.isOverBudget).toBe(true)
  })

  it('should calculate days remaining in month', async () => {
    const status = await costTracker.getCurrentMonthStatus()

    expect(status.daysRemaining).toBeGreaterThanOrEqual(0)
    expect(status.daysRemaining).toBeLessThanOrEqual(31)
  })

  it('should project month end cost', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 10000,
      outputTokens: 5000,
    })

    const status = await costTracker.getCurrentMonthStatus()

    // projectedMonthEnd should be >= spent (with tolerance for floating-point rounding)
    // On the last day of the month, both values are equal after rounding
    expect(status.projectedMonthEnd).toBeGreaterThanOrEqual(status.spent - 0.01)
  })
})

// =============================================================================
// CostTracker checkBudget Tests
// =============================================================================

describe('costTracker.checkBudget', () => {
  beforeEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  afterEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  it('should allow requests when under budget', async () => {
    const result = await costTracker.checkBudget()

    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('should block when hard limit is enabled and over budget', async () => {
    costTracker.setBudget({ monthlyLimit: 0.005, hardLimit: true })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const result = await costTracker.checkBudget()

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Monthly budget')
  })

  it('should allow when over budget but hard limit disabled', async () => {
    costTracker.setBudget({ monthlyLimit: 0.005, hardLimit: false })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const result = await costTracker.checkBudget()

    expect(result.allowed).toBe(true)
  })

  it('should return current spend and limit', async () => {
    costTracker.setBudget({ monthlyLimit: 100 })

    const result = await costTracker.checkBudget()

    expect(result.currentSpend).toBeDefined()
    expect(result.limit).toBe(100)
  })

  it('should check per-user daily limit', async () => {
    costTracker.setBudget({ perUserDaily: 0.005, hardLimit: true })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      userId: 'user-1',
    })

    const result = await costTracker.checkBudget('user-1')

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Daily per-user')
  })

  it('should check per-user monthly limit', async () => {
    costTracker.setBudget({ perUserDaily: 1000, perUserMonthly: 0.005, hardLimit: true })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      userId: 'user-1',
    })

    const result = await costTracker.checkBudget('user-1')

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Monthly per-user')
  })

  it('should allow other users when one user hits limit', async () => {
    costTracker.setBudget({ perUserDaily: 0.005 })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      userId: 'user-1',
    })

    const result = await costTracker.checkBudget('user-2')

    expect(result.allowed).toBe(true)
  })
})

// =============================================================================
// CostTracker getCostByModel Tests
// =============================================================================

describe('costTracker.getCostByModel', () => {
  beforeEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  afterEach(async () => {
    await costTracker.clearRecords()
  })

  it('should return empty object for no records', async () => {
    const result = await costTracker.getCostByModel()

    expect(Object.keys(result).length).toBe(0)
  })

  it('should group by model', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const result = await costTracker.getCostByModel()

    expect(result['gpt-4o']).toBeDefined()
    expect(result['claude-3-5-sonnet-20241022']).toBeDefined()
  })

  it('should count requests per model', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o-mini',
      operation: 'extraction',
      inputTokens: 100,
      outputTokens: 50,
    })

    const result = await costTracker.getCostByModel()

    expect(result['gpt-4o'].requests).toBe(2)
    expect(result['gpt-4o-mini'].requests).toBe(1)
  })

  it('should sum tokens per model', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 2000,
      outputTokens: 1000,
    })

    const result = await costTracker.getCostByModel()

    expect(result['gpt-4o'].inputTokens).toBe(3000)
    expect(result['gpt-4o'].outputTokens).toBe(1500)
  })

  it('should sum cost per model', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const result = await costTracker.getCostByModel()

    expect(result['gpt-4o'].cost).toBe(0.015) // 0.0075 * 2
  })

  it('should calculate average cost per request', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const result = await costTracker.getCostByModel()

    expect(result['gpt-4o'].avgCostPerRequest).toBe(0.0075)
  })

  it('should filter by date range', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const now = new Date()
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const result = await costTracker.getCostByModel(future)

    expect(Object.keys(result).length).toBe(0)
  })
})

// =============================================================================
// CostTracker clearRecords Tests
// =============================================================================

describe('costTracker.clearRecords', () => {
  it('should clear all records', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    let stats = await costTracker.getStats()
    expect(stats.totalRequests).toBe(1)

    await costTracker.clearRecords()

    stats = await costTracker.getStats()
    expect(stats.totalRequests).toBe(0)
  })

  it('should clear stats cache', async () => {
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    // Get stats to populate cache
    await costTracker.getStats()

    await costTracker.clearRecords()

    const stats = await costTracker.getStats()
    expect(stats.totalRequests).toBe(0)
  })
})

// =============================================================================
// CostTracker Initialize Tests
// =============================================================================

describe('costTracker.initialize', () => {
  it('should initialize successfully', async () => {
    // initialize should not throw
    await expect(costTracker.initialize()).resolves.not.toThrow()
  })

  it('should be idempotent', async () => {
    await costTracker.initialize()
    await costTracker.initialize()
    await costTracker.initialize()

    // Should not throw and should work normally
    const budget = costTracker.getBudget()
    expect(budget).toBeDefined()
  })
})

// =============================================================================
// CostTracker Integration Tests
// =============================================================================

describe('CostTracker Integration', () => {
  beforeEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  afterEach(async () => {
    await costTracker.clearRecords()
    costTracker.setBudget(DEFAULT_BUDGET)
  })

  it('should track full workflow', async () => {
    // Record multiple operations
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      userId: 'user-1',
    })

    await costTracker.recordUsage({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      operation: 'consensus',
      inputTokens: 2000,
      outputTokens: 1000,
      userId: 'user-1',
    })

    // Check stats
    const stats = await costTracker.getStats()
    expect(stats.totalRequests).toBe(2)
    expect(stats.byProvider.openai.requests).toBe(1)
    expect(stats.byProvider.anthropic.requests).toBe(1)

    // Check budget
    const budgetCheck = await costTracker.checkBudget('user-1')
    expect(budgetCheck.allowed).toBe(true)

    // Check month status
    const monthStatus = await costTracker.getCurrentMonthStatus()
    expect(monthStatus.spent).toBeGreaterThan(0)

    // Check cost by model
    const byModel = await costTracker.getCostByModel()
    expect(byModel['gpt-4o']).toBeDefined()
    expect(byModel['claude-3-5-sonnet-20241022']).toBeDefined()
  })

  it('should enforce budget limits', async () => {
    costTracker.setBudget({ monthlyLimit: 0.01, hardLimit: true })

    // First request
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    let check = await costTracker.checkBudget()
    expect(check.allowed).toBe(true)

    // Second request should push over budget
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
    })

    check = await costTracker.checkBudget()
    expect(check.allowed).toBe(false)
  })

  it('should calculate cache savings correctly', async () => {
    // Regular request
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      cacheHit: false,
    })

    // Cached request
    await costTracker.recordUsage({
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'extraction',
      inputTokens: 1000,
      outputTokens: 500,
      cacheHit: true,
    })

    const stats = await costTracker.getStats()

    expect(stats.totalCost).toBe(0.0075) // Only non-cached request
    expect(stats.totalSavings).toBe(0.0075) // Cached request savings
    expect(stats.netCost).toBe(0) // totalCost - totalSavings
  })
})
