/**
 * Cost Tracking Hooks Tests
 * Tests for AI cost tracking and budget monitoring hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Create mock functions using vi.hoisted
const {
  mockInitialize,
  mockGetStats,
  mockGetCurrentMonthStatus,
  mockSetBudget,
  mockGetCostByModel,
} = vi.hoisted(() => ({
  mockInitialize: vi.fn().mockResolvedValue(undefined),
  mockGetStats: vi.fn().mockResolvedValue({
    totalCost: 50,
    totalRequests: 100,
    totalInputTokens: 10000,
    totalOutputTokens: 5000,
    totalSavings: 15,
    dailyCosts: [
      { date: '2024-01-01', cost: 10 },
      { date: '2024-01-02', cost: 15 },
    ],
  }),
  mockGetCurrentMonthStatus: vi.fn().mockResolvedValue({
    spent: 45,
    budget: 100,
    percentUsed: 0.45,
    isOverBudget: false,
    isWarning: false,
    projectedMonthEnd: 90,
  }),
  mockSetBudget: vi.fn(),
  mockGetCostByModel: vi.fn().mockResolvedValue({
    'gpt-4': {
      requests: 50,
      inputTokens: 5000,
      outputTokens: 2500,
      cost: 25,
      avgCostPerRequest: 0.5,
    },
    'gpt-3.5-turbo': {
      requests: 50,
      inputTokens: 5000,
      outputTokens: 2500,
      cost: 5,
      avgCostPerRequest: 0.1,
    },
  }),
}))

// Mock the cost tracking module
vi.mock('@/lib/ai/cost-tracking', () => ({
  costTracker: {
    initialize: mockInitialize,
    getStats: mockGetStats,
    getCurrentMonthStatus: mockGetCurrentMonthStatus,
    setBudget: mockSetBudget,
    getCostByModel: mockGetCostByModel,
  },
  formatCost: (cost: number) => `$${cost.toFixed(2)}`,
  formatTokens: (tokens: number) => `${tokens.toLocaleString()}`,
}))

// Import after mocking
import {
  useCostTracking,
  useBudgetAlert,
  useCostByModel,
  useDailyCosts,
} from './useCostTracking'

describe('useCostTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useCostTracking())

    expect(result.current.isLoading).toBe(true)
  })

  it('should load cost data', async () => {
    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.stats).toBeDefined()
  })

  it('should return monthly status', async () => {
    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.monthlySpent).toBe(45)
    expect(result.current.monthlyBudget).toBe(100)
    expect(result.current.percentUsed).toBe(0.45)
    expect(result.current.isOverBudget).toBe(false)
  })

  it('should provide cost savings', async () => {
    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalCostSavings).toBe(15)
  })

  it('should provide formatting functions', async () => {
    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.formatCost(10)).toBe('$10.00')
    expect(result.current.formatTokens(1000)).toBe('1,000')
  })

  it('should provide refresh function', async () => {
    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockGetStats).toHaveBeenCalled()
  })

  it('should provide setBudget function', async () => {
    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setBudget({ monthlyLimit: 200 })
    })

    expect(mockSetBudget).toHaveBeenCalledWith({ monthlyLimit: 200 })
  })

  it('should handle errors', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('Failed to load'))

    const { result } = renderHook(() => useCostTracking())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeDefined()
  })

  it('should accept date range', async () => {
    const startDate = new Date('2024-01-01')
    const endDate = new Date('2024-01-31')

    const { result } = renderHook(() => useCostTracking(startDate, endDate))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockGetStats).toHaveBeenCalledWith(startDate, endDate)
  })
})

describe('useBudgetAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not show alert when under budget', async () => {
    const { result } = renderHook(() => useBudgetAlert())

    await waitFor(() => {
      expect(result.current.showAlert).toBe(false)
    })

    expect(result.current.alertType).toBeNull()
    expect(result.current.message).toBeNull()
  })

  it('should show warning when in warning state', async () => {
    mockGetCurrentMonthStatus.mockResolvedValueOnce({
      spent: 80,
      budget: 100,
      percentUsed: 0.8,
      isOverBudget: false,
      isWarning: true,
      projectedMonthEnd: 120,
    })

    const { result } = renderHook(() => useBudgetAlert())

    await waitFor(() => {
      expect(result.current.showAlert).toBe(true)
    })

    expect(result.current.alertType).toBe('warning')
    expect(result.current.message).toContain('80%')
  })

  it('should show error when over budget', async () => {
    mockGetCurrentMonthStatus.mockResolvedValueOnce({
      spent: 110,
      budget: 100,
      percentUsed: 1.1,
      isOverBudget: true,
      isWarning: false,
      projectedMonthEnd: 150,
    })

    const { result } = renderHook(() => useBudgetAlert())

    await waitFor(() => {
      expect(result.current.showAlert).toBe(true)
    })

    expect(result.current.alertType).toBe('error')
  })

  it('should provide dismiss function', async () => {
    mockGetCurrentMonthStatus.mockResolvedValueOnce({
      spent: 80,
      budget: 100,
      percentUsed: 0.8,
      isOverBudget: false,
      isWarning: true,
      projectedMonthEnd: 120,
    })

    const { result } = renderHook(() => useBudgetAlert())

    await waitFor(() => {
      expect(result.current.showAlert).toBe(true)
    })

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.showAlert).toBe(false)
  })
})

describe('useCostByModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should load cost by model data', async () => {
    const { result } = renderHook(() => useCostByModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data.length).toBeGreaterThan(0)
  })

  it('should sort by cost descending', async () => {
    const { result } = renderHook(() => useCostByModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    if (result.current.data.length >= 2) {
      expect(result.current.data[0].cost).toBeGreaterThanOrEqual(result.current.data[1].cost)
    }
  })

  it('should include model stats', async () => {
    const { result } = renderHook(() => useCostByModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const model = result.current.data[0]
    expect(model.model).toBeDefined()
    expect(model.requests).toBeDefined()
    expect(model.cost).toBeDefined()
  })
})

describe('useDailyCosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should load daily cost data', async () => {
    const { result } = renderHook(() => useDailyCosts())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data.length).toBeGreaterThan(0)
  })

  it('should accept days parameter', async () => {
    const { result } = renderHook(() => useDailyCosts(7))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockGetStats).toHaveBeenCalled()
  })

  it('should return date and cost pairs', async () => {
    const { result } = renderHook(() => useDailyCosts())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const day = result.current.data[0]
    expect(day.date).toBeDefined()
    expect(day.cost).toBeDefined()
  })
})
