import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateNotification, mockWarn } = vi.hoisted(() => ({
  mockCreateNotification: vi.fn().mockResolvedValue(undefined),
  mockWarn: vi.fn(),
}))

vi.mock('../services/admin-notification-service.js', () => ({
  createNotification: mockCreateNotification,
}))

vi.mock('../lib/logger.js', () => ({
  logger: { child: () => ({ warn: mockWarn, info: vi.fn(), error: vi.fn() }) },
}))

import {
  evaluateAndDispatchAlerts,
  getAlertState,
  resetAlertState,
} from '../services/extraction-alert-service.js'

const defaultConfig = {
  errorRateWarningThreshold: 0.05,
  errorRateCriticalThreshold: 0.2,
  avgLatencyCriticalMs: 12000,
  checkIntervalMs: 300000,
  alertCooldownMinutes: 15,
  enableEmailAlerts: false,
  alertEmailAddresses: '',
}

const emptySnapshot = { last_24h: { total: 0, error_rate: 0 }, by_provider: {} }

describe('extraction-alert-service', () => {
  beforeEach(() => {
    resetAlertState()
    mockCreateNotification.mockClear()
    mockWarn.mockClear()
  })

  it('skips evaluation when total is 0', async () => {
    await evaluateAndDispatchAlerts(emptySnapshot, defaultConfig)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('fires warning notification when error rate exceeds warning threshold', async () => {
    const snapshot = { last_24h: { total: 100, error_rate: 0.08 }, by_provider: {} }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(mockCreateNotification).toHaveBeenCalledOnce()
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', title: expect.stringContaining('Warning') })
    )
  })

  it('fires critical notification when error rate exceeds critical threshold', async () => {
    const snapshot = { last_24h: { total: 100, error_rate: 0.25 }, by_provider: {} }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(mockCreateNotification).toHaveBeenCalledOnce()
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: expect.stringContaining('Critical') })
    )
  })

  it('does not fire alert below warning threshold', async () => {
    const snapshot = { last_24h: { total: 100, error_rate: 0.02 }, by_provider: {} }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('fires latency alert for slow provider with 3+ requests', async () => {
    const snapshot = {
      last_24h: { total: 10, error_rate: 0 },
      by_provider: { openai: { total: 5, failed: 0, avg_latency_ms: 15000 } },
    }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(mockCreateNotification).toHaveBeenCalledOnce()
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Slow Extraction: openai' })
    )
  })

  it('does not fire latency alert for provider with <3 requests', async () => {
    const snapshot = {
      last_24h: { total: 5, error_rate: 0 },
      by_provider: { openai: { total: 2, failed: 0, avg_latency_ms: 15000 } },
    }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('cooldown prevents double-firing', async () => {
    const snapshot = { last_24h: { total: 100, error_rate: 0.25 }, by_provider: {} }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(mockCreateNotification).toHaveBeenCalledOnce()
  })

  it('getAlertState returns fired alert timestamps', async () => {
    const snapshot = { last_24h: { total: 100, error_rate: 0.25 }, by_provider: {} }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    const state = getAlertState()
    expect(state).toHaveProperty('error_rate_critical')
    expect(typeof state['error_rate_critical']).toBe('number')
  })

  it('resetAlertState clears all alerts', async () => {
    const snapshot = { last_24h: { total: 100, error_rate: 0.25 }, by_provider: {} }
    await evaluateAndDispatchAlerts(snapshot, defaultConfig)
    expect(Object.keys(getAlertState()).length).toBeGreaterThan(0)
    resetAlertState()
    expect(getAlertState()).toEqual({})
  })
})
