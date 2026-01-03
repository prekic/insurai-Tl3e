/**
 * Consent Manager Tests
 *
 * Tests for KVKK/GDPR compliant consent tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock localStorage
const localStorageMock: Record<string, string> = {}
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock[key]
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageMock).forEach(key => delete localStorageMock[key])
  }),
}

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

// Mock IndexedDB as undefined
Object.defineProperty(global, 'indexedDB', {
  value: undefined,
  writable: true,
  configurable: true,
})

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Test User Agent',
  },
  writable: true,
  configurable: true,
})

describe('Consent Manager', () => {
  // Dynamic imports for fresh module instances
  let consentManager: typeof import('./consent-manager').consentManager
  let initializeConsentManager: typeof import('./consent-manager').initializeConsentManager
  let recordConsent: typeof import('./consent-manager').recordConsent
  let hasConsent: typeof import('./consent-manager').hasConsent
  let checkRequiredConsents: typeof import('./consent-manager').checkRequiredConsents
  let getUserConsentStatus: typeof import('./consent-manager').getUserConsentStatus
  let getConsentRequirement: typeof import('./consent-manager').getConsentRequirement
  let getAllConsentRequirements: typeof import('./consent-manager').getAllConsentRequirements
  let CONSENT_REQUIREMENTS: typeof import('./consent-manager').CONSENT_REQUIREMENTS

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    Object.keys(localStorageMock).forEach(key => delete localStorageMock[key])

    // Dynamic import for fresh instance
    const module = await import('./consent-manager')
    consentManager = module.consentManager
    initializeConsentManager = module.initializeConsentManager
    recordConsent = module.recordConsent
    hasConsent = module.hasConsent
    checkRequiredConsents = module.checkRequiredConsents
    getUserConsentStatus = module.getUserConsentStatus
    getConsentRequirement = module.getConsentRequirement
    getAllConsentRequirements = module.getAllConsentRequirements
    CONSENT_REQUIREMENTS = module.CONSENT_REQUIREMENTS
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializeConsentManager', () => {
    it('should initialize the consent manager', async () => {
      await initializeConsentManager()

      // Should complete without error
      expect(true).toBe(true)
    })

    it('should load existing consents from localStorage', async () => {
      localStorageMock['insurai_consents'] = JSON.stringify([
        {
          id: 'consent_1',
          userId: 'user-123',
          type: 'terms_of_service',
          granted: true,
          grantedAt: Date.now(),
          version: '1.0.0',
        },
      ])

      await initializeConsentManager()

      const hasIt = await hasConsent('user-123', 'terms_of_service')
      expect(hasIt).toBe(true)
    })
  })

  describe('recordConsent', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should record a consent grant', async () => {
      const record = await recordConsent('user-123', 'terms_of_service', true)

      expect(record).toHaveProperty('id')
      expect(record.userId).toBe('user-123')
      expect(record.type).toBe('terms_of_service')
      expect(record.granted).toBe(true)
      expect(record.grantedAt).toBeDefined()
    })

    it('should record a consent revocation', async () => {
      const record = await recordConsent('user-123', 'analytics', false)

      expect(record.granted).toBe(false)
      expect(record.revokedAt).toBeDefined()
    })

    it('should include version from requirement', async () => {
      const record = await recordConsent('user-123', 'privacy_policy', true)

      expect(record.version).toBe('1.0.0')
    })

    it('should include user agent', async () => {
      const record = await recordConsent('user-123', 'data_processing', true)

      expect(record.userAgent).toBe('Test User Agent')
    })

    it('should save to localStorage', async () => {
      await recordConsent('user-123', 'terms_of_service', true)

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'insurai_consents',
        expect.any(String)
      )
    })
  })

  describe('hasConsent', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should return true for granted consent', async () => {
      await recordConsent('user-123', 'terms_of_service', true)

      const result = await hasConsent('user-123', 'terms_of_service')

      expect(result).toBe(true)
    })

    it('should return false for revoked consent', async () => {
      // Grant then revoke
      await recordConsent('user-123', 'analytics', true)
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5))
      await recordConsent('user-123', 'analytics', false)

      const result = await hasConsent('user-123', 'analytics')

      expect(result).toBe(false)
    })

    it('should return false for non-existent consent', async () => {
      const result = await hasConsent('user-456', 'terms_of_service')

      expect(result).toBe(false)
    })

    it('should use the most recent consent record', async () => {
      await recordConsent('user-123', 'marketing_email', true)
      await new Promise(resolve => setTimeout(resolve, 5))
      await recordConsent('user-123', 'marketing_email', false)
      await new Promise(resolve => setTimeout(resolve, 5))
      await recordConsent('user-123', 'marketing_email', true)

      const result = await hasConsent('user-123', 'marketing_email')

      expect(result).toBe(true)
    })
  })

  describe('checkRequiredConsents', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should identify missing required consents', async () => {
      const result = await checkRequiredConsents('new-user')

      expect(result.hasAll).toBe(false)
      expect(result.missing.length).toBeGreaterThan(0)
      expect(result.missing).toContain('terms_of_service')
      expect(result.missing).toContain('privacy_policy')
    })

    it('should return hasAll true when all required consents granted', async () => {
      const requiredTypes = CONSENT_REQUIREMENTS
        .filter(r => r.required)
        .map(r => r.type)

      for (const type of requiredTypes) {
        await recordConsent('user-123', type, true)
      }

      const result = await checkRequiredConsents('user-123')

      expect(result.hasAll).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('should not include optional consents in missing', async () => {
      const result = await checkRequiredConsents('user-123')

      expect(result.missing).not.toContain('analytics')
      expect(result.missing).not.toContain('marketing_email')
    })
  })

  describe('getUserConsentStatus', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should return consent status for all types', async () => {
      await recordConsent('user-123', 'terms_of_service', true)
      await recordConsent('user-123', 'analytics', false)

      const status = await getUserConsentStatus('user-123')

      expect(status.userId).toBe('user-123')
      expect(status.consents.terms_of_service.granted).toBe(true)
      expect(status.consents.analytics.granted).toBe(false)
    })

    it('should include lastUpdated timestamp', async () => {
      await recordConsent('user-123', 'terms_of_service', true)

      const status = await getUserConsentStatus('user-123')

      expect(status.lastUpdated).toBeGreaterThan(0)
    })

    it('should initialize all consent types as not granted', async () => {
      const status = await getUserConsentStatus('new-user')

      for (const req of CONSENT_REQUIREMENTS) {
        expect(status.consents[req.type]).toBeDefined()
        expect(status.consents[req.type].granted).toBe(false)
      }
    })
  })

  describe('revokeConsent', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should revoke a previously granted consent', async () => {
      await recordConsent('user-123', 'analytics', true)
      await new Promise(resolve => setTimeout(resolve, 5))
      await consentManager.revokeConsent('user-123', 'analytics')

      const hasIt = await hasConsent('user-123', 'analytics')
      expect(hasIt).toBe(false)
    })
  })

  describe('grantMultiple', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should grant multiple consents at once', async () => {
      const records = await consentManager.grantMultiple('user-123', [
        'terms_of_service',
        'privacy_policy',
        'data_processing',
      ])

      expect(records.length).toBe(3)
      expect(await hasConsent('user-123', 'terms_of_service')).toBe(true)
      expect(await hasConsent('user-123', 'privacy_policy')).toBe(true)
      expect(await hasConsent('user-123', 'data_processing')).toBe(true)
    })
  })

  describe('getConsentHistory', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should return history for a consent type', async () => {
      await recordConsent('user-123', 'analytics', true)
      await new Promise(resolve => setTimeout(resolve, 5))
      await recordConsent('user-123', 'analytics', false)
      await new Promise(resolve => setTimeout(resolve, 5))
      await recordConsent('user-123', 'analytics', true)

      const history = await consentManager.getConsentHistory('user-123', 'analytics')

      expect(history.length).toBe(3)
      // Should be sorted newest first
      expect(history[0].granted).toBe(true)
    })
  })

  describe('needsRenewal', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should return true if no consent exists', async () => {
      const needs = await consentManager.needsRenewal('user-123', 'terms_of_service')

      expect(needs).toBe(true)
    })

    it('should return true if consent is revoked', async () => {
      await recordConsent('user-123', 'terms_of_service', false)

      const needs = await consentManager.needsRenewal('user-123', 'terms_of_service')

      expect(needs).toBe(true)
    })

    it('should return false if consent is current', async () => {
      await recordConsent('user-123', 'terms_of_service', true)

      const needs = await consentManager.needsRenewal('user-123', 'terms_of_service')

      expect(needs).toBe(false)
    })
  })

  describe('deleteUserConsents', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should delete all consents for a user', async () => {
      await recordConsent('user-123', 'terms_of_service', true)
      await recordConsent('user-123', 'privacy_policy', true)
      await recordConsent('user-123', 'analytics', true)

      const deleted = await consentManager.deleteUserConsents('user-123')

      expect(deleted).toBe(3)
      expect(await hasConsent('user-123', 'terms_of_service')).toBe(false)
    })

    it('should not affect other users', async () => {
      await recordConsent('user-123', 'terms_of_service', true)
      await recordConsent('user-456', 'terms_of_service', true)

      await consentManager.deleteUserConsents('user-123')

      expect(await hasConsent('user-456', 'terms_of_service')).toBe(true)
    })
  })

  describe('getStats', () => {
    beforeEach(async () => {
      await initializeConsentManager()
    })

    it('should return consent statistics', async () => {
      await recordConsent('user-1', 'terms_of_service', true)
      await recordConsent('user-2', 'terms_of_service', true)
      await recordConsent('user-3', 'analytics', false)

      const stats = await consentManager.getStats()

      expect(stats.totalRecords).toBe(3)
      expect(stats.byType.terms_of_service.granted).toBe(2)
      expect(stats.byType.analytics.revoked).toBe(1)
    })

    it('should track recent grants and revocations', async () => {
      await recordConsent('user-1', 'terms_of_service', true)
      await recordConsent('user-2', 'analytics', false)

      const stats = await consentManager.getStats()

      expect(stats.recentGrants).toBeGreaterThanOrEqual(1)
      expect(stats.recentRevocations).toBeGreaterThanOrEqual(1)
    })
  })

  describe('getConsentRequirement', () => {
    it('should return requirement for a type', () => {
      const req = getConsentRequirement('terms_of_service')

      expect(req).toBeDefined()
      expect(req?.required).toBe(true)
      expect(req?.legalBasis).toBe('contract')
    })

    it('should return undefined for unknown type', () => {
      const req = getConsentRequirement('unknown_type' as 'terms_of_service')

      expect(req).toBeUndefined()
    })
  })

  describe('getAllConsentRequirements', () => {
    it('should return all consent requirements', () => {
      const reqs = getAllConsentRequirements()

      expect(reqs.length).toBe(CONSENT_REQUIREMENTS.length)
      expect(reqs).toContainEqual(expect.objectContaining({ type: 'terms_of_service' }))
      expect(reqs).toContainEqual(expect.objectContaining({ type: 'analytics' }))
    })

    it('should return a copy of requirements', () => {
      const reqs = getAllConsentRequirements()
      reqs.push({} as typeof CONSENT_REQUIREMENTS[0])

      expect(getAllConsentRequirements().length).toBe(CONSENT_REQUIREMENTS.length)
    })
  })
})
