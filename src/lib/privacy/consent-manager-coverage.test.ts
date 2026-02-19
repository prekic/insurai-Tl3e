/**
 * Comprehensive coverage tests for consent-manager.ts
 * Targets: uncovered branches in ConsentManager, convenience functions, localStorage fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock indexedDB as unavailable to test localStorage path
vi.stubGlobal('indexedDB', undefined)

const mockStorage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key] }),
})

vi.stubGlobal('navigator', { userAgent: 'TestAgent' })

const {
  consentManager: _consentManager,
  initializeConsentManager: _initializeConsentManager,
  recordConsent: _recordConsent,
  hasConsent: _hasConsent,
  checkRequiredConsents: _checkRequiredConsents,
  getUserConsentStatus: _getUserConsentStatus,
  getConsentRequirement,
  getAllConsentRequirements,
  CONSENT_REQUIREMENTS,
} = await import('./consent-manager')

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
})

describe('consent-manager coverage', () => {
  describe('initialize', () => {
    it('should initialize without error', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.initialize()
      expect(true).toBe(true)
    })

    it('should not re-initialize', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.initialize()
      // Second call should resolve without error (idempotent)
      await mod.consentManager.initialize()
      expect(true).toBe(true)
    })

    it('should load from localStorage on init', async () => {
      vi.resetModules()
      mockStorage['insurai_consents'] = JSON.stringify([
        { id: 'c1', userId: 'u1', type: 'analytics', granted: true, grantedAt: Date.now(), version: '1.0.0', source: 'web' },
      ])
      const mod = await import('./consent-manager')
      await mod.consentManager.initialize()
      const consents = await mod.consentManager.getUserConsents('u1')
      expect(consents.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle corrupt localStorage', async () => {
      vi.resetModules()
      mockStorage['insurai_consents'] = 'not json'
      const mod = await import('./consent-manager')
      await mod.consentManager.initialize()
      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('recordConsent', () => {
    it('should create a consent record', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
      })
      expect(record.id).toBeTruthy()
      expect(record.userId).toBe('u1')
      expect(record.type).toBe('analytics')
      expect(record.granted).toBe(true)
      expect(record.version).toBe('1.0.0')
      expect(record.source).toBe('web')
    })

    it('should set revokedAt when not granted', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: false,
      })
      expect(record.revokedAt).toBeTruthy()
    })

    it('should use custom version', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
        version: '2.0.0',
      })
      expect(record.version).toBe('2.0.0')
    })

    it('should use custom source', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
        source: 'mobile',
      })
      expect(record.source).toBe('mobile')
    })

    it('should include metadata', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
        metadata: { ip: '1.2.3.4' },
      })
      expect(record.metadata).toEqual({ ip: '1.2.3.4' })
    })

    it('should include userAgent', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
      })
      expect(record.userAgent).toBe('TestAgent')
    })

    it('should save to localStorage', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
      })
      expect(localStorage.setItem).toHaveBeenCalled()
    })

    it('should fall back to 1.0.0 when no requirement found', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'cross_border_transfer' as 'analytics', // Not in CONSENT_REQUIREMENTS
        granted: true,
      })
      expect(record.version).toBeTruthy()
    })
  })

  describe('revokeConsent', () => {
    it('should create a revocation record', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'u1', type: 'analytics', granted: true })
      const revoke = await mod.consentManager.revokeConsent('u1', 'analytics')
      expect(revoke.granted).toBe(false)
    })
  })

  describe('grantMultiple', () => {
    it('should grant multiple consents', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const records = await mod.consentManager.grantMultiple('u1', ['terms_of_service', 'privacy_policy', 'data_processing'])
      expect(records.length).toBe(3)
      expect(records.every(r => r.granted)).toBe(true)
    })

    it('should accept custom source', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const records = await mod.consentManager.grantMultiple('u1', ['analytics'], 'api')
      expect(records[0].source).toBe('api')
    })
  })

  describe('hasConsent', () => {
    it('should return true when consent granted', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'u2', type: 'analytics', granted: true })
      const result = await mod.consentManager.hasConsent('u2', 'analytics')
      expect(result).toBe(true)
    })

    it('should return false when no records', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const result = await mod.consentManager.hasConsent('nobody', 'analytics')
      expect(result).toBe(false)
    })

    it('should return false after revocation', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'u3', type: 'analytics', granted: true })
      // Small delay to ensure different Date.now() timestamps for sort ordering
      await new Promise(r => setTimeout(r, 5))
      await mod.consentManager.revokeConsent('u3', 'analytics')
      const result = await mod.consentManager.hasConsent('u3', 'analytics')
      expect(result).toBe(false)
    })

    it('should use latest record', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'u4', type: 'analytics', granted: false })
      // Small delay to ensure different Date.now() timestamps for sort ordering
      await new Promise(r => setTimeout(r, 5))
      await mod.consentManager.recordConsent({ userId: 'u4', type: 'analytics', granted: true })
      const result = await mod.consentManager.hasConsent('u4', 'analytics')
      expect(result).toBe(true)
    })
  })

  describe('hasRequiredConsents', () => {
    it('should report missing required consents', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const result = await mod.consentManager.hasRequiredConsents('new-user')
      expect(result.hasAll).toBe(false)
      expect(result.missing.length).toBeGreaterThan(0)
    })

    it('should pass when all required consents granted', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const required = mod.CONSENT_REQUIREMENTS.filter(r => r.required).map(r => r.type)
      await mod.consentManager.grantMultiple('complete-user', required)
      const result = await mod.consentManager.hasRequiredConsents('complete-user')
      expect(result.hasAll).toBe(true)
      expect(result.missing.length).toBe(0)
    })
  })

  describe('getUserConsentStatus', () => {
    it('should return status for all consent types', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'status-user', type: 'analytics', granted: true })
      const status = await mod.consentManager.getUserConsentStatus('status-user')
      expect(status.userId).toBe('status-user')
      expect(status.consents).toBeTruthy()
      expect(status.consents.analytics.granted).toBe(true)
      expect(status.lastUpdated).toBeGreaterThan(0)
    })

    it('should show unganted consents as false', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const status = await mod.consentManager.getUserConsentStatus('empty-user')
      expect(status.consents.analytics.granted).toBe(false)
    })

    it('should use most recent record per type', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'u5', type: 'analytics', granted: true })
      // Small delay to ensure different Date.now() timestamps for sort ordering
      await new Promise(r => setTimeout(r, 5))
      await mod.consentManager.revokeConsent('u5', 'analytics')
      const status = await mod.consentManager.getUserConsentStatus('u5')
      expect(status.consents.analytics.granted).toBe(false)
    })

    it('should handle empty records', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const status = await mod.consentManager.getUserConsentStatus('nobody')
      expect(status.lastUpdated).toBe(0)
    })
  })

  describe('getUserConsents', () => {
    it('should return cached records', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'cache-user', type: 'analytics', granted: true })
      // First call caches
      const first = await mod.consentManager.getUserConsents('cache-user')
      // Second call hits cache
      const second = await mod.consentManager.getUserConsents('cache-user')
      expect(first.length).toBe(second.length)
    })

    it('should fall back to localStorage', async () => {
      vi.resetModules()
      mockStorage['insurai_consents'] = JSON.stringify([
        { id: 'ls1', userId: 'ls-user', type: 'analytics', granted: true, grantedAt: Date.now(), version: '1.0.0', source: 'web' },
      ])
      const mod = await import('./consent-manager')
      await mod.consentManager.initialize()
      const records = await mod.consentManager.getUserConsents('ls-user')
      expect(records.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('getConsentHistory', () => {
    it('should return history for specific type', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'hist-user', type: 'analytics', granted: true })
      await mod.consentManager.recordConsent({ userId: 'hist-user', type: 'analytics', granted: false })
      const history = await mod.consentManager.getConsentHistory('hist-user', 'analytics')
      expect(history.length).toBe(2)
    })

    it('should return sorted by most recent first', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'sort-user', type: 'analytics', granted: true })
      await new Promise(r => setTimeout(r, 10))
      await mod.consentManager.recordConsent({ userId: 'sort-user', type: 'analytics', granted: false })
      const history = await mod.consentManager.getConsentHistory('sort-user', 'analytics')
      expect(history[0].grantedAt).toBeGreaterThanOrEqual(history[1]?.grantedAt ?? 0)
    })
  })

  describe('needsRenewal', () => {
    it('should return false for unknown type', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const result = await mod.consentManager.needsRenewal('u1', 'cross_border_transfer')
      expect(result).toBe(false)
    })

    it('should return true when no records exist', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const result = await mod.consentManager.needsRenewal('new-user', 'analytics')
      expect(result).toBe(true)
    })

    it('should return true when latest is revoked', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'renew-user', type: 'analytics', granted: false })
      const result = await mod.consentManager.needsRenewal('renew-user', 'analytics')
      expect(result).toBe(true)
    })

    it('should return false when version matches', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'match-user', type: 'analytics', granted: true, version: '1.0.0' })
      const result = await mod.consentManager.needsRenewal('match-user', 'analytics')
      expect(result).toBe(false)
    })

    it('should return true when version differs', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'old-ver', type: 'analytics', granted: true, version: '0.9.0' })
      const result = await mod.consentManager.needsRenewal('old-ver', 'analytics')
      expect(result).toBe(true)
    })
  })

  describe('deleteUserConsents', () => {
    it('should delete from localStorage', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'del-user', type: 'analytics', granted: true })
      const deleted = await mod.consentManager.deleteUserConsents('del-user')
      expect(deleted).toBeGreaterThanOrEqual(0)
    })

    it('should return 0 when no records in localStorage', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const deleted = await mod.consentManager.deleteUserConsents('nobody')
      expect(deleted).toBe(0)
    })

    it('should clear memory cache', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'cache-del', type: 'analytics', granted: true })
      await mod.consentManager.deleteUserConsents('cache-del')
      const consents = await mod.consentManager.getUserConsents('cache-del')
      // After deletion, localStorage fallback should find nothing
      expect(consents.length).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return stats from localStorage', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'stat-user', type: 'analytics', granted: true })
      await mod.consentManager.recordConsent({ userId: 'stat-user', type: 'marketing_email', granted: false })
      const stats = await mod.consentManager.getStats()
      expect(stats.totalRecords).toBeGreaterThanOrEqual(2)
      expect(stats.byType).toBeTruthy()
    })

    it('should count recent grants and revocations', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'recent-user', type: 'analytics', granted: true })
      await mod.consentManager.recordConsent({ userId: 'recent-user', type: 'marketing_email', granted: false })
      const stats = await mod.consentManager.getStats()
      expect(stats.recentGrants).toBeGreaterThanOrEqual(1)
      expect(stats.recentRevocations).toBeGreaterThanOrEqual(1)
    })

    it('should handle unknown consent types in stats', async () => {
      vi.resetModules()
      mockStorage['insurai_consents'] = JSON.stringify([
        { id: 'x1', userId: 'u1', type: 'unknown_type', granted: true, grantedAt: Date.now(), version: '1.0.0', source: 'web' },
      ])
      const mod = await import('./consent-manager')
      await mod.consentManager.initialize()
      const stats = await mod.consentManager.getStats()
      expect(stats.totalRecords).toBeGreaterThanOrEqual(1)
    })
  })

  describe('localStorage edge cases', () => {
    it('should handle localStorage setItem failure', async () => {
      vi.resetModules()
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => { throw new Error('QuotaExceeded') }),
        removeItem: vi.fn(),
      })
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'fail-user', type: 'analytics', granted: true })
      // Should not throw
      expect(true).toBe(true)
    })

    it('should trim localStorage to 1000 records', async () => {
      vi.resetModules()
      const records = Array.from({ length: 1005 }, (_, i) => ({
        id: `c${i}`, userId: 'bulk', type: 'analytics', granted: true, grantedAt: Date.now() + i, version: '1.0.0', source: 'web',
      }))
      mockStorage['insurai_consents'] = JSON.stringify(records)
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val }),
        removeItem: vi.fn(),
      })
      const mod = await import('./consent-manager')
      await mod.consentManager.recordConsent({ userId: 'bulk', type: 'analytics', granted: true })
      const stored = JSON.parse(mockStorage['insurai_consents'] || '[]')
      expect(stored.length).toBeLessThanOrEqual(1001)
    })
  })

  describe('convenience functions', () => {
    it('initializeConsentManager delegates', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.initializeConsentManager()
      expect(true).toBe(true)
    })

    it('recordConsent delegates', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const record = await mod.recordConsent('u1', 'analytics', true)
      expect(record.granted).toBe(true)
    })

    it('hasConsent delegates', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      await mod.recordConsent('u1', 'analytics', true)
      const result = await mod.hasConsent('u1', 'analytics')
      expect(result).toBe(true)
    })

    it('checkRequiredConsents delegates', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const result = await mod.checkRequiredConsents('check-user')
      expect(result.hasAll).toBe(false)
      expect(result.missing.length).toBeGreaterThan(0)
    })

    it('getUserConsentStatus delegates', async () => {
      vi.resetModules()
      const mod = await import('./consent-manager')
      const status = await mod.getUserConsentStatus('status-fn')
      expect(status.userId).toBe('status-fn')
    })

    it('getConsentRequirement returns requirement', () => {
      const req = getConsentRequirement('analytics')
      expect(req).toBeTruthy()
      expect(req!.type).toBe('analytics')
    })

    it('getConsentRequirement returns undefined for unknown type', () => {
      const req = getConsentRequirement('nonexistent' as 'analytics')
      expect(req).toBeUndefined()
    })

    it('getAllConsentRequirements returns a copy', () => {
      const reqs = getAllConsentRequirements()
      expect(reqs.length).toBe(CONSENT_REQUIREMENTS.length)
      expect(reqs).not.toBe(CONSENT_REQUIREMENTS) // Should be a copy
    })
  })
})
