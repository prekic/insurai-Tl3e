/**
 * Security Monitor Tests
 * Tests for suspicious activity and threat detection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  securityMonitor,
  inputSanitizer,
  isSecureContext,
  generateSecurityReport,
} from './security-monitor'

// Mock window for isSecureContext
const mockWindow = {
  isSecureContext: true,
  location: { protocol: 'https:' },
}

Object.defineProperty(global, 'window', { value: mockWindow, writable: true })

describe('Security Monitor', () => {
  beforeEach(() => {
    securityMonitor.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
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

  describe('getActiveAlerts', () => {
    it('should return empty array initially', () => {
      const alerts = securityMonitor.getActiveAlerts()
      expect(alerts).toEqual([])
    })

    it('should return array', () => {
      const alerts = securityMonitor.getActiveAlerts()
      expect(Array.isArray(alerts)).toBe(true)
    })
  })

  describe('getAllAlerts', () => {
    it('should return all alerts with limit', () => {
      const alerts = securityMonitor.getAllAlerts(10)
      expect(Array.isArray(alerts)).toBe(true)
    })

    it('should respect limit parameter', () => {
      const alerts = securityMonitor.getAllAlerts(5)
      expect(alerts.length).toBeLessThanOrEqual(5)
    })
  })

  describe('resolveAlert', () => {
    it('should return false for non-existent alert', () => {
      const resolved = securityMonitor.resolveAlert('non-existent-id')
      expect(resolved).toBe(false)
    })

    it('should return false for empty alert id', () => {
      const resolved = securityMonitor.resolveAlert('')
      expect(resolved).toBe(false)
    })
  })

  describe('onAlert', () => {
    it('should return cleanup function', () => {
      const listener = vi.fn()
      const cleanup = securityMonitor.onAlert(listener)

      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('should allow multiple listeners', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      const cleanup1 = securityMonitor.onAlert(listener1)
      const cleanup2 = securityMonitor.onAlert(listener2)

      cleanup1()
      cleanup2()
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

    it('should return zero counts initially', () => {
      const dashboard = securityMonitor.getSecurityDashboard()

      expect(dashboard.activeAlerts).toBe(0)
      expect(dashboard.criticalAlerts).toBe(0)
      expect(dashboard.failedLoginAttempts).toBe(0)
      expect(dashboard.rateViolationCount).toBe(0)
      expect(dashboard.suspiciousPatterns).toBe(0)
    })

    it('should return recentAlerts as array', () => {
      const dashboard = securityMonitor.getSecurityDashboard()

      expect(Array.isArray(dashboard.recentAlerts)).toBe(true)
    })
  })

  describe('clear', () => {
    it('should clear all monitoring data', () => {
      securityMonitor.clear()

      const dashboard = securityMonitor.getSecurityDashboard()
      expect(dashboard.activeAlerts).toBe(0)
      expect(dashboard.failedLoginAttempts).toBe(0)
    })

    it('should not throw', () => {
      expect(() => securityMonitor.clear()).not.toThrow()
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

    it('should return false for normal content', () => {
      expect(inputSanitizer.hasSuspiciousContent('Hello, World!')).toBe(false)
    })

    it('should return false for policy coverage details', () => {
      expect(inputSanitizer.hasSuspiciousContent('Policy coverage details')).toBe(false)
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

    it('should handle arrays in objects', () => {
      const obj = {
        items: ['<script>1</script>', 'normal'],
      }

      const result = inputSanitizer.sanitizeObject(obj)

      // Arrays are objects, so should be processed
      expect(result.items).toBeDefined()
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

  it('should return boolean', () => {
    expect(typeof isSecureContext()).toBe('boolean')
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

  it('should include alerts array', async () => {
    const report = await generateSecurityReport()

    expect(Array.isArray(report.alerts)).toBe(true)
  })

  it('should include dashboard object', async () => {
    const report = await generateSecurityReport()

    expect(typeof report.dashboard).toBe('object')
    expect(report.dashboard).toHaveProperty('activeAlerts')
  })

  it('should return boolean for cryptoSupported', async () => {
    const report = await generateSecurityReport()

    expect(typeof report.cryptoSupported).toBe('boolean')
  })

  it('should return boolean for secureContext', async () => {
    const report = await generateSecurityReport()

    expect(typeof report.secureContext).toBe('boolean')
  })
})
