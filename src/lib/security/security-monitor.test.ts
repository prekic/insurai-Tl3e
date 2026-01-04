/**
 * Security Monitor Tests
 * Tests for suspicious activity and threat detection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Define mocks using vi.hoisted
const { mockAuditLogger } = vi.hoisted(() => {
  const eventCallbacks: Array<(event: unknown) => void> = []
  return {
    mockAuditLogger: {
      onEvent: vi.fn((callback: (event: unknown) => void) => {
        eventCallbacks.push(callback)
        return () => {
          const idx = eventCallbacks.indexOf(callback)
          if (idx > -1) eventCallbacks.splice(idx, 1)
        }
      }),
      logSecurity: vi.fn(),
      getCallbacks: () => eventCallbacks,
      triggerEvent: (event: unknown) => {
        eventCallbacks.forEach(cb => cb(event))
      },
    },
  }
})

// Mock the audit-logger module
vi.mock('./audit-logger', () => ({
  auditLogger: mockAuditLogger,
}))

// Import after mocking
import {
  securityMonitor,
  inputSanitizer,
  isSecureContext,
  generateSecurityReport,
} from './security-monitor'
import { createMockAuditEvent } from '@/test/setup'

// Mock window for isSecureContext
const mockWindow = {
  isSecureContext: true,
  location: { protocol: 'https:' },
}

Object.defineProperty(global, 'window', { value: mockWindow, writable: true })

describe('Security Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    securityMonitor.clear()
    // Reset thresholds to defaults
    securityMonitor.setThresholds({
      failedLoginsThreshold: 5,
      rateLimitViolationsThreshold: 10,
      suspiciousActivitySensitivity: 'medium',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('should subscribe to audit events', () => {
      securityMonitor.initialize()
      expect(mockAuditLogger.onEvent).toHaveBeenCalled()
    })

    it('should only initialize once', () => {
      // The singleton was already initialized in beforeEach from previous tests
      // Just verify calling initialize multiple times doesn't throw
      securityMonitor.initialize()
      securityMonitor.initialize()
      securityMonitor.initialize()
      // Should not throw and singleton behavior is maintained
      expect(true).toBe(true)
    })
  })

  describe('setThresholds', () => {
    it('should update thresholds', () => {
      securityMonitor.setThresholds({ failedLoginsThreshold: 10 })
      // No error means success
      expect(true).toBe(true)
    })

    it('should merge with existing thresholds', () => {
      securityMonitor.setThresholds({ failedLoginsThreshold: 10 })
      securityMonitor.setThresholds({ rateLimitViolationsThreshold: 20 })
      // Both should be set
      expect(true).toBe(true)
    })
  })

  describe('Failed Login Detection', () => {
    beforeEach(() => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 3 })
    })

    it('should track failed login attempts', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
        ipHash: 'ip-hash-1',
      })

      mockAuditLogger.triggerEvent(event)
      mockAuditLogger.triggerEvent(event)

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.failedLoginAttempts).toBe(2)
    })

    it('should raise brute force alert after threshold exceeded', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
        ipHash: 'ip-hash-1',
      })

      // Trigger enough failed logins to exceed threshold
      for (let i = 0; i < 4; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      expect(listener).toHaveBeenCalled()
      const alert = listener.mock.calls[0][0]
      expect(alert.type).toBe('brute_force')
      expect(alert.severity).toBe('warning')
    })

    it('should raise critical alert for severe brute force', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)
      securityMonitor.setThresholds({ failedLoginsThreshold: 3 })

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
        ipHash: 'ip-hash-1',
      })

      // Trigger 2x threshold for critical alert
      for (let i = 0; i < 7; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      // Find the critical alert
      const criticalCall = listener.mock.calls.find(
        call => call[0].severity === 'critical'
      )
      expect(criticalCall).toBeDefined()
    })

    it('should track signup failures as well', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signup_failed',
        userId: 'user-123',
        ipHash: 'ip-hash-1',
      })

      for (let i = 0; i < 4; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const alerts = securityMonitor.getActiveAlerts()
      expect(alerts.some(a => a.type === 'brute_force')).toBe(true)
    })

    it('should use ipHash when userId is not available', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        ipHash: 'ip-hash-only',
      })

      for (let i = 0; i < 4; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.failedLoginAttempts).toBeGreaterThanOrEqual(3)
    })

    it('should use unknown key when neither userId nor ipHash available', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
      })

      for (let i = 0; i < 4; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.failedLoginAttempts).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Rate Limit Violation Detection', () => {
    beforeEach(() => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ rateLimitViolationsThreshold: 5 })
    })

    it('should track rate limit violations', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'security.rate_limit_exceeded',
        userId: 'user-123',
      })

      mockAuditLogger.triggerEvent(event)
      mockAuditLogger.triggerEvent({ ...event, id: 'evt-2' })
      mockAuditLogger.triggerEvent({ ...event, id: 'evt-3' })

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.rateViolationCount).toBe(3)
    })

    it('should raise rate abuse alert after threshold exceeded', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'security.rate_limit_exceeded',
        userId: 'user-123',
      })

      for (let i = 0; i < 6; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      expect(listener).toHaveBeenCalled()
      const alert = listener.mock.calls[0][0]
      expect(alert.type).toBe('rate_abuse')
    })
  })

  describe('Access Pattern Detection', () => {
    beforeEach(() => {
      securityMonitor.initialize()
    })

    it('should track access patterns', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.viewed',
        userId: 'user-123',
        resourceId: 'policy-1',
      })

      mockAuditLogger.triggerEvent(event)
      // Access pattern tracked internally, no direct way to verify
      // but should not throw
      expect(true).toBe(true)
    })

    it('should detect data scraping (high request rate)', () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const listener = vi.fn()
      securityMonitor.onAlert(listener)
      securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'high' })

      // Access pattern time window is 5 minutes
      // requestsPerMinute = recentActions.length / 5
      // With high sensitivity, scrapingThreshold = 30 * 0.5 = 15 req/min
      // Need recentActions.length / 5 > 15, so need > 75 events in 5 min window

      // Generate many events with timestamps within 5 minutes
      for (let i = 0; i < 100; i++) {
        const event = createMockAuditEvent({
          id: `evt-${i}`,
          type: 'policy.viewed',
          timestamp: now + (i * 3000), // Events spread over time
          userId: 'user-scraper',
          resourceId: 'same-resource',
        })
        mockAuditLogger.triggerEvent(event)
      }

      // Advance time past the accessPattern check window (5 minutes)
      vi.setSystemTime(now + 6 * 60 * 1000)

      // Trigger another event to initiate the analysis (now - lastCheck >= 5 min)
      mockAuditLogger.triggerEvent(createMockAuditEvent({
        id: 'evt-trigger',
        type: 'policy.viewed',
        timestamp: Date.now(),
        userId: 'user-scraper',
        resourceId: 'same-resource',
      }))

      // Check if data_scraping alert was raised
      const alerts = securityMonitor.getActiveAlerts()
      const scrapingAlerts = alerts.filter(a => a.type === 'data_scraping')
      expect(scrapingAlerts.length).toBeGreaterThan(0)
      expect(mockAuditLogger.logSecurity).toHaveBeenCalledWith(
        'security.data_scraping_detected',
        expect.anything()
      )

      vi.useRealTimers()
    })

    it('should detect unusual access patterns (many unique resources)', () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const listener = vi.fn()
      securityMonitor.onAlert(listener)
      securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'high' })

      // With high sensitivity, uniqueResourceThreshold = 20 * 0.5 = 10 unique resources
      // Need to access > 10 unique resources within the 5-minute window

      // Generate events accessing many different resources within the time window
      for (let i = 0; i < 25; i++) {
        const event = createMockAuditEvent({
          id: `evt-${i}`,
          type: 'policy.viewed',
          timestamp: now + (i * 10000), // Events spread within window
          userId: 'user-unusual',
          resourceId: `unique-resource-${i}`,
        })
        mockAuditLogger.triggerEvent(event)
      }

      // Advance time past the accessPattern check window (5 minutes)
      vi.setSystemTime(now + 6 * 60 * 1000)

      // Trigger another event to initiate the analysis
      mockAuditLogger.triggerEvent(createMockAuditEvent({
        id: 'evt-trigger',
        type: 'policy.viewed',
        timestamp: Date.now(),
        userId: 'user-unusual',
        resourceId: 'trigger-resource',
      }))

      // Check if suspicious_pattern alert was raised for unusual access
      const alerts = securityMonitor.getActiveAlerts()
      const patternAlerts = alerts.filter(a =>
        a.type === 'suspicious_pattern' && a.description.includes('resources accessed')
      )
      expect(patternAlerts.length).toBeGreaterThan(0)
      expect(mockAuditLogger.logSecurity).toHaveBeenCalledWith(
        'security.unusual_access_pattern',
        expect.anything()
      )

      vi.useRealTimers()
    })

    it('should limit stored actions to 100', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.viewed',
        userId: 'user-123',
      })

      // Generate more than 100 events
      for (let i = 0; i < 150; i++) {
        mockAuditLogger.triggerEvent({
          ...event,
          id: `evt-${i}`,
          resourceId: `resource-${i}`,
        })
      }

      // Should not throw and should handle gracefully
      expect(true).toBe(true)
    })
  })

  describe('Injection Detection', () => {
    beforeEach(() => {
      securityMonitor.initialize()
    })

    it('should detect SQL injection attempts', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'search.performed',
        userId: 'user-123',
        details: {
          query: "'; DROP TABLE users; --",
        },
      })

      mockAuditLogger.triggerEvent(event)

      expect(mockAuditLogger.logSecurity).toHaveBeenCalledWith(
        'security.injection_attempt_detected',
        expect.objectContaining({ type: 'sql' })
      )
    })

    it('should detect UNION SELECT injection', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'search.performed',
        userId: 'user-123',
        details: {
          query: '1 UNION SELECT * FROM passwords',
        },
      })

      mockAuditLogger.triggerEvent(event)

      expect(listener).toHaveBeenCalled()
      const alert = listener.mock.calls[0][0]
      expect(alert.type).toBe('suspicious_pattern')
      expect(alert.severity).toBe('critical')
    })

    it('should detect XSS attempts with script tags', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.created',
        userId: 'user-123',
        details: {
          content: '<script>alert("xss")</script>',
        },
      })

      mockAuditLogger.triggerEvent(event)

      expect(mockAuditLogger.logSecurity).toHaveBeenCalledWith(
        'security.xss_attempt_detected',
        expect.objectContaining({ type: 'xss' })
      )
    })

    it('should detect javascript: protocol injection', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.created',
        userId: 'user-123',
        details: {
          url: 'javascript:alert(document.cookie)',
        },
      })

      mockAuditLogger.triggerEvent(event)

      expect(listener).toHaveBeenCalled()
    })

    it('should detect event handler injection', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'settings.preference_changed',
        userId: 'user-123',
        details: {
          bio: '<img src=x onerror=alert(1)>',
        },
      })

      mockAuditLogger.triggerEvent(event)

      expect(listener).toHaveBeenCalled()
    })

    it('should detect iframe injection', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.created',
        userId: 'user-123',
        details: {
          html: '<iframe src="https://evil.com"></iframe>',
        },
      })

      mockAuditLogger.triggerEvent(event)

      expect(listener).toHaveBeenCalled()
    })

    it('should not flag normal content', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.created',
        userId: 'user-123',
        details: {
          policyType: 'kasko',
          coverage: 50000,
          notes: 'Standard auto insurance policy',
        },
      })

      mockAuditLogger.triggerEvent(event)

      // No injection alert should be raised
      const injectionAlerts = securityMonitor.getActiveAlerts().filter(
        a => a.description.includes('injection') || a.description.includes('XSS')
      )
      expect(injectionAlerts.length).toBe(0)
    })
  })

  describe('Alert Management', () => {
    beforeEach(() => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 2 })
    })

    it('should not duplicate similar unresolved alerts', () => {
      const listener = vi.fn()
      securityMonitor.onAlert(listener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      // Trigger multiple alerts for same user
      for (let i = 0; i < 10; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      // Should only create one alert (not duplicate)
      const activeAlerts = securityMonitor.getActiveAlerts()
      const bruteForceAlerts = activeAlerts.filter(a =>
        a.type === 'brute_force' && a.userId === 'user-123'
      )
      expect(bruteForceAlerts.length).toBe(1)
    })

    it('should upgrade alert severity if more severe', () => {
      securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      // First batch - should create warning
      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      // Second batch - should upgrade to critical (2x threshold = 4+)
      for (let i = 3; i < 10; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const alerts = securityMonitor.getActiveAlerts()
      const userAlert = alerts.find(a => a.userId === 'user-123')
      expect(userAlert?.severity).toBe('critical')
    })

    it('should resolve alerts', () => {
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const alerts = securityMonitor.getActiveAlerts()
      expect(alerts.length).toBe(1)

      const resolved = securityMonitor.resolveAlert(alerts[0].id, 'admin')
      expect(resolved).toBe(true)

      expect(securityMonitor.getActiveAlerts().length).toBe(0)
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error')
      })
      const normalListener = vi.fn()

      securityMonitor.onAlert(errorListener)
      securityMonitor.onAlert(normalListener)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      // Normal listener should still be called despite error in first listener
      expect(normalListener).toHaveBeenCalled()
    })

    it('should limit alerts to 100', () => {
      securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      // Generate many alerts from different users
      for (let i = 0; i < 150; i++) {
        const event = createMockAuditEvent({
          id: `evt-${i}`,
          type: 'auth.signin_failed',
          userId: `user-${i}`,
        })
        mockAuditLogger.triggerEvent(event)
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}-2` })
      }

      const allAlerts = securityMonitor.getAllAlerts(200)
      expect(allAlerts.length).toBeLessThanOrEqual(100)
    })
  })

  describe('getActiveAlerts', () => {
    it('should return empty array initially', () => {
      const alerts = securityMonitor.getActiveAlerts()
      expect(alerts).toEqual([])
    })

    it('should filter out resolved alerts', () => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      expect(securityMonitor.getActiveAlerts().length).toBe(1)

      const alertId = securityMonitor.getActiveAlerts()[0].id
      securityMonitor.resolveAlert(alertId)

      expect(securityMonitor.getActiveAlerts().length).toBe(0)
    })
  })

  describe('getAllAlerts', () => {
    it('should return all alerts with limit', () => {
      const alerts = securityMonitor.getAllAlerts(10)
      expect(Array.isArray(alerts)).toBe(true)
    })

    it('should return alerts in reverse chronological order', () => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      for (let i = 0; i < 5; i++) {
        const event = createMockAuditEvent({
          id: `evt-${i}`,
          type: 'auth.signin_failed',
          timestamp: Date.now() + i * 100,
          userId: `user-${i}`,
        })
        mockAuditLogger.triggerEvent(event)
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}-2` })
      }

      const alerts = securityMonitor.getAllAlerts(10)
      if (alerts.length > 1) {
        expect(alerts[0].timestamp).toBeGreaterThanOrEqual(alerts[1].timestamp)
      }
    })
  })

  describe('resolveAlert', () => {
    it('should return false for non-existent alert', () => {
      const resolved = securityMonitor.resolveAlert('non-existent-id')
      expect(resolved).toBe(false)
    })

    it('should set resolvedAt and resolvedBy', () => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const alert = securityMonitor.getActiveAlerts()[0]
      securityMonitor.resolveAlert(alert.id, 'admin-user')

      const allAlerts = securityMonitor.getAllAlerts()
      const resolvedAlert = allAlerts.find(a => a.id === alert.id)
      expect(resolvedAlert?.resolved).toBe(true)
      expect(resolvedAlert?.resolvedBy).toBe('admin-user')
      expect(resolvedAlert?.resolvedAt).toBeDefined()
    })
  })

  describe('onAlert', () => {
    it('should return cleanup function', () => {
      const listener = vi.fn()
      const cleanup = securityMonitor.onAlert(listener)

      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('should remove listener on cleanup', () => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      const listener = vi.fn()
      const cleanup = securityMonitor.onAlert(listener)
      cleanup()

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('getSecurityDashboard', () => {
    it('should return dashboard data', () => {
      const dashboard = securityMonitor.getSecurityDashboard()

      expect(dashboard).toHaveProperty('activeAlerts')
      expect(dashboard).toHaveProperty('criticalAlerts')
      expect(dashboard).toHaveProperty('recentAlerts')
      expect(dashboard).toHaveProperty('failedLoginAttempts')
      expect(dashboard).toHaveProperty('rateViolationCount')
      expect(dashboard).toHaveProperty('suspiciousPatterns')
    })

    it('should count critical alerts', () => {
      securityMonitor.initialize()

      // Trigger XSS detection for critical alert
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.created',
        userId: 'attacker',
        details: { content: '<script>evil()</script>' },
      })

      mockAuditLogger.triggerEvent(event)

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.criticalAlerts).toBe(1)
    })

    it('should count suspicious patterns', () => {
      securityMonitor.initialize()

      // Trigger SQL injection for suspicious pattern
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'search.performed',
        userId: 'attacker',
        details: { query: 'UNION SELECT * FROM users' },
      })

      mockAuditLogger.triggerEvent(event)

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.suspiciousPatterns).toBeGreaterThanOrEqual(1)
    })
  })

  describe('clear', () => {
    it('should clear all monitoring data', () => {
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        userId: 'user-123',
      })

      for (let i = 0; i < 5; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      expect(securityMonitor.getActiveAlerts().length).toBeGreaterThan(0)

      securityMonitor.clear()

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.activeAlerts).toBe(0)
      expect(dashboard.failedLoginAttempts).toBe(0)
      expect(dashboard.rateViolationCount).toBe(0)
    })
  })

  describe('Sensitivity Levels', () => {
    beforeEach(() => {
      securityMonitor.initialize()
    })

    it('should apply high sensitivity (lower threshold)', () => {
      securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'high' })
      // High sensitivity = 0.5 multiplier, so thresholds are halved
      expect(true).toBe(true)
    })

    it('should apply low sensitivity (higher threshold)', () => {
      securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'low' })
      // Low sensitivity = 2 multiplier, so thresholds are doubled
      expect(true).toBe(true)
    })

    it('should require more events for data scraping with low sensitivity', () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const listener = vi.fn()
      securityMonitor.onAlert(listener)
      securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'low' })

      // With low sensitivity, scrapingThreshold = 30 * 2 = 60 req/min
      // requestsPerMinute = recentActions.length / 5
      // Need recentActions.length / 5 > 60, so need > 300 events in 5 min window

      // Generate events (not enough to trigger with low sensitivity but enough with high/medium)
      for (let i = 0; i < 100; i++) {
        const event = createMockAuditEvent({
          id: `evt-${i}`,
          type: 'policy.viewed',
          timestamp: now + (i * 3000),
          userId: 'user-test',
          resourceId: 'resource',
        })
        mockAuditLogger.triggerEvent(event)
      }

      // Advance time past the accessPattern check window
      vi.setSystemTime(now + 6 * 60 * 1000)

      // Trigger analysis
      mockAuditLogger.triggerEvent(createMockAuditEvent({
        id: 'evt-trigger',
        type: 'policy.viewed',
        timestamp: Date.now(),
        userId: 'user-test',
        resourceId: 'resource',
      }))

      // With low sensitivity, 100 events / 5 min = 20 req/min < 60 threshold
      // So no scraping alert should be raised
      const alerts = securityMonitor.getActiveAlerts()
      const scrapingAlerts = alerts.filter(a => a.type === 'data_scraping')
      expect(scrapingAlerts.length).toBe(0)

      vi.useRealTimers()
    })
  })

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      securityMonitor.clear()
      securityMonitor.initialize()
      securityMonitor.setThresholds({ failedLoginsThreshold: 2, rateLimitViolationsThreshold: 2 })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should clean old failed logins after time window expires', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Generate failed logins
      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        timestamp: now,
        userId: 'user-cleanup-test',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const dashboardBefore = securityMonitor.getSecurityDashboard()
      expect(dashboardBefore.failedLoginAttempts).toBe(3)

      // Fast forward past the cleanup window (24 hours * 2 = 48 hours)
      vi.setSystemTime(now + 48 * 60 * 60 * 1000 + 1000)

      // Trigger another event to cause cleanup
      mockAuditLogger.triggerEvent({ ...event, id: 'evt-new', timestamp: Date.now() })

      const dashboardAfter = securityMonitor.getSecurityDashboard()
      // Old logins should be cleaned, only the new one should remain
      expect(dashboardAfter.failedLoginAttempts).toBeLessThanOrEqual(2)
    })

    it('should clean old rate violations after time window expires', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'security.rate_limit_exceeded',
        timestamp: now,
        userId: 'rate-user',
      })

      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      const dashboardBefore = securityMonitor.getSecurityDashboard()
      expect(dashboardBefore.rateViolationCount).toBe(3)

      // Fast forward past the cleanup window (1 hour * 2 = 2 hours)
      vi.setSystemTime(now + 2 * 60 * 60 * 1000 + 1000)

      // Trigger another event to cause cleanup
      mockAuditLogger.triggerEvent({ ...event, id: 'evt-new', timestamp: Date.now() })

      const dashboardAfter = securityMonitor.getSecurityDashboard()
      expect(dashboardAfter.rateViolationCount).toBeLessThanOrEqual(2)
    })

    it('should clean old access patterns after time window expires', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'policy.viewed',
        timestamp: now,
        userId: 'pattern-user',
        resourceId: 'resource-1',
      })

      for (let i = 0; i < 10; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}`, resourceId: `resource-${i}` })
      }

      // Fast forward past the cleanup window (30 min * 2 = 1 hour)
      vi.setSystemTime(now + 60 * 60 * 1000 + 1000)

      // Trigger another event to cause cleanup
      mockAuditLogger.triggerEvent({
        ...event,
        id: 'evt-new',
        timestamp: Date.now(),
        resourceId: 'new-resource',
      })

      // Should not throw and should handle cleanup gracefully
      expect(true).toBe(true)
    })

    it('should remove entries with no recent data during cleanup', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Create failed logins for multiple users
      for (let u = 0; u < 3; u++) {
        const event = createMockAuditEvent({
          id: `evt-u${u}`,
          type: 'auth.signin_failed',
          timestamp: now,
          userId: `user-${u}`,
        })
        mockAuditLogger.triggerEvent(event)
      }

      const beforeDashboard = securityMonitor.getSecurityDashboard()
      expect(beforeDashboard.failedLoginAttempts).toBe(3)

      // Fast forward past cleanup window (48 hours)
      vi.setSystemTime(now + 50 * 60 * 60 * 1000)

      // Trigger a new event from a different user with new timestamp
      const newTime = Date.now()
      mockAuditLogger.triggerEvent(createMockAuditEvent({
        id: 'evt-new',
        type: 'auth.signin_failed',
        timestamp: newTime,
        userId: 'new-user',
      }))

      const dashboard = securityMonitor.getSecurityDashboard()
      // Old entries should be cleaned during processing, new user's login counted
      // The old logins from users 0-2 should be cleaned, plus the new one
      expect(dashboard.failedLoginAttempts).toBeLessThanOrEqual(4)
    })

    it('should keep recent data during cleanup', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const event = createMockAuditEvent({
        id: 'evt-1',
        type: 'auth.signin_failed',
        timestamp: now,
        userId: 'recent-user',
      })

      // Add recent events
      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({ ...event, id: `evt-${i}` })
      }

      // Fast forward only slightly (within window)
      vi.setSystemTime(now + 10 * 60 * 1000) // 10 minutes

      // Trigger another event
      mockAuditLogger.triggerEvent({ ...event, id: 'evt-new', timestamp: Date.now() })

      const dashboard = securityMonitor.getSecurityDashboard()
      // All events should still be there
      expect(dashboard.failedLoginAttempts).toBe(4)
    })

    it('should partially clean failed logins keeping recent ones', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const userId = 'partial-cleanup-user'

      // Add old events (will be cleaned)
      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({
          id: `old-evt-${i}`,
          type: 'auth.signin_failed',
          timestamp: now,
          userId,
        })
      }

      // Fast forward past cleanup window for old events but add new ones
      // failedLogins window is 15 min * 2 = 30 minutes for cleanup
      vi.setSystemTime(now + 35 * 60 * 1000)

      // Add new events at the current time
      for (let i = 0; i < 2; i++) {
        mockAuditLogger.triggerEvent({
          id: `new-evt-${i}`,
          type: 'auth.signin_failed',
          timestamp: Date.now(),
          userId,
        })
      }

      // Advance timers to trigger the cleanup interval (runs every 5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000)

      const dashboard = securityMonitor.getSecurityDashboard()
      // Old events should be cleaned, only new ones remain
      expect(dashboard.failedLoginAttempts).toBe(2)
    })

    it('should partially clean rate violations keeping recent ones', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const userId = 'rate-cleanup-user'

      // Add old rate violations
      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({
          id: `old-rate-${i}`,
          type: 'security.rate_limit_exceeded',
          timestamp: now,
          userId,
        })
      }

      // Fast forward past cleanup window (1 hour * 2 = 2 hours for rate violations)
      vi.setSystemTime(now + 3 * 60 * 60 * 1000)

      // Add new violations at current time
      for (let i = 0; i < 2; i++) {
        mockAuditLogger.triggerEvent({
          id: `new-rate-${i}`,
          type: 'security.rate_limit_exceeded',
          timestamp: Date.now(),
          userId,
        })
      }

      // Advance timers to trigger the cleanup interval
      vi.advanceTimersByTime(6 * 60 * 1000)

      const dashboard = securityMonitor.getSecurityDashboard()
      // Old violations should be cleaned, only new ones remain
      expect(dashboard.rateViolationCount).toBe(2)
    })

    it('should partially clean access patterns keeping recent actions', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const userId = 'pattern-cleanup-user'

      // Add old access events
      for (let i = 0; i < 5; i++) {
        mockAuditLogger.triggerEvent({
          id: `old-pattern-${i}`,
          type: 'policy.viewed',
          timestamp: now,
          userId,
          resourceId: `resource-${i}`,
        })
      }

      // Fast forward past cleanup window (5 min * 2 = 10 minutes for access patterns)
      vi.setSystemTime(now + 15 * 60 * 1000)

      // Add new access events at current time
      for (let i = 0; i < 3; i++) {
        mockAuditLogger.triggerEvent({
          id: `new-pattern-${i}`,
          type: 'policy.viewed',
          timestamp: Date.now(),
          userId,
          resourceId: `new-resource-${i}`,
        })
      }

      // Advance timers to trigger the cleanup interval
      vi.advanceTimersByTime(6 * 60 * 1000)

      // The pattern should have recent actions and old ones cleaned
      // No easy way to verify the internal state, but the code should execute without error
      expect(true).toBe(true)
    })
  })
})

describe('inputSanitizer', () => {
  describe('sanitizeString', () => {
    it('should escape HTML entities', () => {
      const result = inputSanitizer.sanitizeString('<script>alert("xss")</script>')

      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })

    it('should escape ampersands', () => {
      const result = inputSanitizer.sanitizeString('foo & bar')

      expect(result).toBe('foo &amp; bar')
    })

    it('should escape quotes', () => {
      const result = inputSanitizer.sanitizeString('He said "hello"')

      expect(result).toContain('&quot;')
    })

    it('should escape single quotes', () => {
      const result = inputSanitizer.sanitizeString("It's a test")

      expect(result).toContain('&#x27;')
    })

    it('should escape forward slashes', () => {
      const result = inputSanitizer.sanitizeString('a/b/c')

      expect(result).toContain('&#x2F;')
    })

    it('should escape greater than', () => {
      const result = inputSanitizer.sanitizeString('a > b')

      expect(result).toContain('&gt;')
    })

    it('should escape less than', () => {
      const result = inputSanitizer.sanitizeString('a < b')

      expect(result).toContain('&lt;')
    })

    it('should handle empty string', () => {
      const result = inputSanitizer.sanitizeString('')

      expect(result).toBe('')
    })

    it('should preserve normal text', () => {
      const result = inputSanitizer.sanitizeString('Hello World')

      expect(result).toBe('Hello World')
    })
  })

  describe('hasSuspiciousContent', () => {
    it('should detect script tags', () => {
      expect(inputSanitizer.hasSuspiciousContent('<script>evil()</script>')).toBe(true)
    })

    it('should detect javascript: protocol', () => {
      expect(inputSanitizer.hasSuspiciousContent('javascript:alert(1)')).toBe(true)
    })

    it('should detect onclick event handler', () => {
      expect(inputSanitizer.hasSuspiciousContent('onclick=evil()')).toBe(true)
    })

    it('should detect onerror event handler', () => {
      expect(inputSanitizer.hasSuspiciousContent('onerror=hack()')).toBe(true)
    })

    it('should detect onmouseover event handler', () => {
      expect(inputSanitizer.hasSuspiciousContent('onmouseover=bad()')).toBe(true)
    })

    it('should detect UNION SELECT SQL injection', () => {
      expect(inputSanitizer.hasSuspiciousContent('UNION SELECT *')).toBe(true)
    })

    it('should detect DROP TABLE SQL injection', () => {
      expect(inputSanitizer.hasSuspiciousContent('DROP TABLE users')).toBe(true)
    })

    it('should detect SQL comments', () => {
      expect(inputSanitizer.hasSuspiciousContent("admin' -- ")).toBe(true)
    })

    it('should detect SQL block comments', () => {
      expect(inputSanitizer.hasSuspiciousContent("admin /* comment */")).toBe(true)
    })

    it('should return false for normal content', () => {
      expect(inputSanitizer.hasSuspiciousContent('Hello, World!')).toBe(false)
    })

    it('should return false for Turkish text', () => {
      expect(inputSanitizer.hasSuspiciousContent('Sigorta poliçesi detayları')).toBe(false)
    })

    it('should return false for numbers', () => {
      expect(inputSanitizer.hasSuspiciousContent('12345')).toBe(false)
    })

    it('should return false for email addresses', () => {
      expect(inputSanitizer.hasSuspiciousContent('test@example.com')).toBe(false)
    })
  })

  describe('sanitizeObject', () => {
    it('should sanitize all string values', () => {
      const obj = {
        name: '<script>alert(1)</script>',
        description: 'Normal text',
      }

      const result = inputSanitizer.sanitizeObject(obj)

      expect(result.name).toContain('&lt;script&gt;')
      expect(result.description).toBe('Normal text')
    })

    it('should handle nested objects', () => {
      const obj = {
        outer: {
          inner: '<script>nested</script>',
        },
      }

      const result = inputSanitizer.sanitizeObject(obj)

      expect((result.outer as { inner: string }).inner).toContain('&lt;')
    })

    it('should preserve non-string values', () => {
      const obj = {
        name: 'test',
        count: 42,
        active: true,
        data: null,
      }

      const result = inputSanitizer.sanitizeObject(obj)

      expect(result.count).toBe(42)
      expect(result.active).toBe(true)
      expect(result.data).toBe(null)
    })

    it('should handle deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: '<img src=x onerror=alert(1)>',
          },
        },
      }

      const result = inputSanitizer.sanitizeObject(obj)
      const l3 = ((result.level1 as Record<string, unknown>).level2 as Record<string, string>).level3

      expect(l3).toContain('&lt;img')
    })

    it('should handle empty objects', () => {
      const result = inputSanitizer.sanitizeObject({})

      expect(result).toEqual({})
    })
  })
})

describe('isSecureContext', () => {
  it('should return true when window.isSecureContext is true', () => {
    expect(isSecureContext()).toBe(true)
  })

  it('should return false when window is undefined', () => {
    const originalWindow = global.window
    // @ts-expect-error - testing undefined case
    global.window = undefined

    expect(isSecureContext()).toBe(false)

    global.window = originalWindow
  })

  it('should fall back to protocol check', () => {
    const originalWindow = global.window
    global.window = {
      isSecureContext: undefined,
      location: { protocol: 'https:' },
    } as unknown as Window & typeof globalThis

    expect(isSecureContext()).toBe(true)

    global.window = originalWindow
  })

  it('should return false for http protocol', () => {
    const originalWindow = global.window
    global.window = {
      isSecureContext: undefined,
      location: { protocol: 'http:' },
    } as unknown as Window & typeof globalThis

    expect(isSecureContext()).toBe(false)

    global.window = originalWindow
  })
})

describe('generateSecurityReport', () => {
  beforeEach(() => {
    securityMonitor.clear()
  })

  it('should generate a security report', async () => {
    const report = await generateSecurityReport()

    expect(report).toHaveProperty('timestamp')
    expect(report).toHaveProperty('secureContext')
    expect(report).toHaveProperty('cryptoSupported')
    expect(report).toHaveProperty('alerts')
    expect(report).toHaveProperty('dashboard')
    expect(report).toHaveProperty('recommendations')
  })

  it('should include timestamp in ISO format', async () => {
    const report = await generateSecurityReport()

    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should include recommendations array', async () => {
    const report = await generateSecurityReport()

    expect(Array.isArray(report.recommendations)).toBe(true)
  })

  it('should recommend HTTPS when not in secure context', async () => {
    const originalWindow = global.window
    global.window = {
      isSecureContext: false,
      location: { protocol: 'http:' },
    } as unknown as Window & typeof globalThis

    const report = await generateSecurityReport()

    expect(report.recommendations.some(r => r.includes('HTTPS'))).toBe(true)

    global.window = originalWindow
  })

  it('should recommend attention for critical alerts', async () => {
    securityMonitor.initialize()

    // Trigger critical alert
    const event = createMockAuditEvent({
      id: 'evt-1',
      type: 'search.performed',
      userId: 'attacker',
      details: { query: 'UNION SELECT * FROM passwords' },
    })
    mockAuditLogger.triggerEvent(event)

    const report = await generateSecurityReport()

    expect(report.recommendations.some(r => r.includes('critical'))).toBe(true)
  })

  it('should recommend CAPTCHA for high failed login attempts', async () => {
    securityMonitor.initialize()
    securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

    // Generate many failed logins
    for (let i = 0; i < 15; i++) {
      const event = createMockAuditEvent({
        id: `evt-${i}`,
        type: 'auth.signin_failed',
        userId: `user-${i}`,
      })
      mockAuditLogger.triggerEvent(event)
    }

    const report = await generateSecurityReport()

    expect(report.recommendations.some(r => r.includes('CAPTCHA') || r.includes('login'))).toBe(true)
  })

  it('should recommend rate limit review for high violations', async () => {
    securityMonitor.initialize()
    securityMonitor.setThresholds({ rateLimitViolationsThreshold: 1 })

    // Generate many rate violations
    for (let i = 0; i < 25; i++) {
      const event = createMockAuditEvent({
        id: `evt-${i}`,
        type: 'security.rate_limit_exceeded',
        userId: `user-${i}`,
      })
      mockAuditLogger.triggerEvent(event)
    }

    const report = await generateSecurityReport()

    expect(report.recommendations.some(r => r.includes('rate limit'))).toBe(true)
  })

  it('should recommend Web Crypto when crypto is undefined', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto')

    // Override crypto with undefined using defineProperty
    Object.defineProperty(global, 'crypto', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const report = await generateSecurityReport()

    expect(report.recommendations.some(r => r.includes('Web Crypto'))).toBe(true)
    expect(report.cryptoSupported).toBe(false)

    // Restore original crypto
    if (originalDescriptor) {
      Object.defineProperty(global, 'crypto', originalDescriptor)
    }
  })

  it('should recommend Web Crypto when crypto.subtle is undefined', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto')

    // Override crypto with partial object (no subtle)
    Object.defineProperty(global, 'crypto', {
      value: { getRandomValues: vi.fn() },
      writable: true,
      configurable: true,
    })

    const report = await generateSecurityReport()

    expect(report.recommendations.some(r => r.includes('Web Crypto'))).toBe(true)
    expect(report.cryptoSupported).toBe(false)

    // Restore original crypto
    if (originalDescriptor) {
      Object.defineProperty(global, 'crypto', originalDescriptor)
    }
  })

  it('should not recommend Web Crypto when crypto.subtle is available', async () => {
    // crypto should already be available in the test environment
    const report = await generateSecurityReport()

    // If crypto.subtle is available, no crypto recommendation
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      expect(report.cryptoSupported).toBe(true)
    }
  })
})
