/**
 * Consent Manager Tests
 *
 * Comprehensive branch-coverage tests for KVKK/GDPR compliant consent tracking.
 * Tests every conditional path, switch case, if/else, ternary, and default value
 * in consent-manager.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConsentRecord, ConsentType } from '@/types/privacy'

// =============================================================================
// Mocks
// =============================================================================

// localStorage mock with controllable storage
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
  configurable: true,
})

// Default: IndexedDB unavailable (localStorage-only mode)
Object.defineProperty(global, 'indexedDB', {
  value: undefined,
  writable: true,
  configurable: true,
})

// navigator mock
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'Test User Agent' },
  writable: true,
  configurable: true,
})

// =============================================================================
// Helper to get fresh module
// =============================================================================

const STORAGE_KEY = 'insurai_consents'

async function getFreshModule() {
  vi.resetModules()
  return import('./consent-manager')
}

function clearLocalStorage() {
  Object.keys(localStorageMock).forEach(key => delete localStorageMock[key])
}

function seedLocalStorage(records: Partial<ConsentRecord>[]) {
  localStorageMock[STORAGE_KEY] = JSON.stringify(records)
}

// =============================================================================
// Tests
// =============================================================================

describe('Consent Manager', () => {
  let mod: Awaited<ReturnType<typeof getFreshModule>>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearLocalStorage()
    // Ensure IndexedDB is unavailable for localStorage-only tests
    Object.defineProperty(global, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    mod = await getFreshModule()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // CONSENT_REQUIREMENTS
  // ===========================================================================

  describe('CONSENT_REQUIREMENTS', () => {
    it('should have 8 consent requirements', () => {
      expect(mod.CONSENT_REQUIREMENTS).toHaveLength(8)
    })

    it('should have 4 required consent types', () => {
      const required = mod.CONSENT_REQUIREMENTS.filter(r => r.required)
      expect(required).toHaveLength(4)
      const types = required.map(r => r.type)
      expect(types).toContain('terms_of_service')
      expect(types).toContain('privacy_policy')
      expect(types).toContain('data_processing')
      expect(types).toContain('cookie_essential')
    })

    it('should have 4 optional consent types', () => {
      const optional = mod.CONSENT_REQUIREMENTS.filter(r => !r.required)
      expect(optional).toHaveLength(4)
      const types = optional.map(r => r.type)
      expect(types).toContain('ai_processing')
      expect(types).toContain('analytics')
      expect(types).toContain('marketing_email')
      expect(types).toContain('cookie_analytics')
    })

    it('should have valid legal bases for each requirement', () => {
      for (const req of mod.CONSENT_REQUIREMENTS) {
        expect(['consent', 'contract', 'legitimate_interests', 'legal_obligation', 'vital_interests', 'public_task']).toContain(req.legalBasis)
      }
    })

    it('should have version 1.0.0 for all requirements', () => {
      for (const req of mod.CONSENT_REQUIREMENTS) {
        expect(req.version).toBe('1.0.0')
      }
    })

    it('should have both English and Turkish purpose descriptions', () => {
      for (const req of mod.CONSENT_REQUIREMENTS) {
        expect(req.purpose.length).toBeGreaterThan(0)
        expect(req.purposeTr.length).toBeGreaterThan(0)
      }
    })
  })

  // ===========================================================================
  // initializeConsentManager
  // ===========================================================================

  describe('initializeConsentManager', () => {
    it('should initialize without error', async () => {
      await mod.initializeConsentManager()
      // No error thrown
    })

    it('should return cached initPromise on subsequent calls (no re-initialization)', async () => {
      // First call triggers doInitialize, second should return cached promise
      await mod.consentManager.initialize()
      // Record something
      await mod.recordConsent('cached-test', 'analytics', true)
      // Initialize again - should not reset state
      await mod.consentManager.initialize()
      // Verify data is still present (wasn't reset by second init)
      const has = await mod.hasConsent('cached-test', 'analytics')
      expect(has).toBe(true)
    })

    it('should load records from localStorage during init', async () => {
      // Pre-seed localStorage before importing fresh module
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'consent_pre1',
          userId: 'pre-user',
          type: 'terms_of_service',
          granted: true,
          grantedAt: Date.now(),
          version: '1.0.0',
          source: 'web',
        },
      ])
      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const has = await mod.hasConsent('pre-user', 'terms_of_service')
      expect(has).toBe(true)
    })

    it('should handle corrupted localStorage data during init gracefully', async () => {
      clearLocalStorage()
      localStorageMock[STORAGE_KEY] = 'not-valid-json{{'
      mod = await getFreshModule()

      // Should not throw
      await mod.initializeConsentManager()
    })

    it('should handle empty localStorage during init', async () => {
      clearLocalStorage()
      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const has = await mod.hasConsent('nobody', 'terms_of_service')
      expect(has).toBe(false)
    })

    it('should handle localStorage being undefined during init', async () => {
      const origLocalStorage = global.localStorage
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      // Restore
      Object.defineProperty(global, 'localStorage', {
        value: origLocalStorage,
        writable: true,
        configurable: true,
      })
    })
  })

  // ===========================================================================
  // recordConsent (via consentManager.recordConsent and convenience function)
  // ===========================================================================

  describe('recordConsent', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should record a granted consent with all fields', async () => {
      const record = await mod.recordConsent('u1', 'terms_of_service', true)

      expect(record.id).toMatch(/^consent_/)
      expect(record.userId).toBe('u1')
      expect(record.type).toBe('terms_of_service')
      expect(record.granted).toBe(true)
      expect(record.grantedAt).toBeGreaterThan(0)
      expect(record.revokedAt).toBeUndefined()
      expect(record.version).toBe('1.0.0')
      expect(record.source).toBe('web')
      expect(record.userAgent).toBe('Test User Agent')
    })

    it('should record a revoked consent with revokedAt set', async () => {
      const record = await mod.recordConsent('u1', 'analytics', false)

      expect(record.granted).toBe(false)
      expect(record.revokedAt).toBeDefined()
      expect(record.revokedAt).toBe(record.grantedAt)
    })

    it('should use provided version over requirement version', async () => {
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'terms_of_service',
        granted: true,
        version: '2.0.0',
      })

      expect(record.version).toBe('2.0.0')
    })

    it('should fall back to requirement version when version not provided', async () => {
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'privacy_policy',
        granted: true,
      })

      expect(record.version).toBe('1.0.0')
    })

    it('should fall back to 1.0.0 when type has no matching requirement and no version given', async () => {
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'marketing_sms' as ConsentType, // Not in CONSENT_REQUIREMENTS
        granted: true,
      })

      expect(record.version).toBe('1.0.0')
    })

    it('should use provided source parameter', async () => {
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'terms_of_service',
        granted: true,
        source: 'mobile',
      })

      expect(record.source).toBe('mobile')
    })

    it('should default source to web', async () => {
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'terms_of_service',
        granted: true,
      })

      expect(record.source).toBe('web')
    })

    it('should include metadata when provided', async () => {
      const meta = { reason: 'signup', campaign: 'trial' }
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
        metadata: meta,
      })

      expect(record.metadata).toEqual(meta)
    })

    it('should have undefined metadata when not provided', async () => {
      const record = await mod.recordConsent('u1', 'analytics', true)
      expect(record.metadata).toBeUndefined()
    })

    it('should not set userAgent when navigator is undefined', async () => {
      const origNavigator = global.navigator
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'terms_of_service',
        granted: true,
      })

      expect(record.userAgent).toBeUndefined()

      // Restore
      Object.defineProperty(global, 'navigator', {
        value: origNavigator,
        writable: true,
        configurable: true,
      })
    })

    it('should save to localStorage on each record', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String)
      )

      const stored = JSON.parse(localStorageMock[STORAGE_KEY])
      expect(stored.length).toBeGreaterThanOrEqual(1)
    })

    it('should trim localStorage to 1000 records', async () => {
      // Pre-seed with 999 records
      const existing: Partial<ConsentRecord>[] = Array.from({ length: 999 }, (_, i) => ({
        id: `consent_${i}`,
        userId: 'u1',
        type: 'analytics' as ConsentType,
        granted: true,
        grantedAt: i,
        version: '1.0.0',
        source: 'web' as const,
      }))
      localStorageMock[STORAGE_KEY] = JSON.stringify(existing)

      // Record two more (total 1001 -> trimmed to 1000)
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u1', 'privacy_policy', true)

      const stored = JSON.parse(localStorageMock[STORAGE_KEY])
      expect(stored.length).toBeLessThanOrEqual(1000)
    })

    it('should handle localStorage.setItem throwing (storage full)', async () => {
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      const record = await mod.recordConsent('u1', 'terms_of_service', true)
      expect(record.granted).toBe(true)
    })

    it('should handle localStorage.getItem returning corrupted JSON during save', async () => {
      localStorageMock[STORAGE_KEY] = '{broken'
      mockLocalStorage.getItem.mockReturnValueOnce('{broken')

      // Should not throw - the catch in saveToLocalStorage handles it
      const record = await mod.recordConsent('u1', 'analytics', true)
      expect(record.granted).toBe(true)
    })

    it('should record consent for all 8 defined consent types', async () => {
      for (const req of mod.CONSENT_REQUIREMENTS) {
        const record = await mod.recordConsent('u1', req.type, true)
        expect(record.type).toBe(req.type)
      }
    })

    it('should record consent for types not in CONSENT_REQUIREMENTS', async () => {
      // ConsentType includes types like 'marketing_sms', 'cookie_functional' etc
      // that are not in CONSENT_REQUIREMENTS
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'cookie_functional',
        granted: true,
      })

      expect(record.type).toBe('cookie_functional')
      expect(record.version).toBe('1.0.0') // fallback
    })

    it('should generate unique IDs for each record', async () => {
      const r1 = await mod.recordConsent('u1', 'analytics', true)
      const r2 = await mod.recordConsent('u1', 'analytics', true)
      expect(r1.id).not.toBe(r2.id)
    })
  })

  // ===========================================================================
  // revokeConsent
  // ===========================================================================

  describe('revokeConsent', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should revoke a consent by delegating to recordConsent with granted=false', async () => {
      const record = await mod.consentManager.revokeConsent('u1', 'analytics')

      expect(record.granted).toBe(false)
      expect(record.revokedAt).toBeDefined()
      expect(record.type).toBe('analytics')
      expect(record.userId).toBe('u1')
    })

    it('should revoke consent even if never granted before', async () => {
      const record = await mod.consentManager.revokeConsent('u1', 'marketing_email')
      expect(record.granted).toBe(false)
    })

    it('should make hasConsent return false after revocation', async () => {
      await mod.recordConsent('u1', 'analytics', true)
      await new Promise(r => setTimeout(r, 5))
      await mod.consentManager.revokeConsent('u1', 'analytics')

      expect(await mod.hasConsent('u1', 'analytics')).toBe(false)
    })
  })

  // ===========================================================================
  // grantMultiple
  // ===========================================================================

  describe('grantMultiple', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should grant multiple consent types at once', async () => {
      const records = await mod.consentManager.grantMultiple('u1', [
        'terms_of_service',
        'privacy_policy',
        'data_processing',
      ])

      expect(records).toHaveLength(3)
      for (const r of records) {
        expect(r.granted).toBe(true)
        expect(r.userId).toBe('u1')
      }
    })

    it('should use default source web', async () => {
      const records = await mod.consentManager.grantMultiple('u1', ['analytics'])
      expect(records[0].source).toBe('web')
    })

    it('should use provided source parameter (api)', async () => {
      const records = await mod.consentManager.grantMultiple('u1', ['analytics'], 'api')
      expect(records[0].source).toBe('api')
    })

    it('should use provided source parameter (import)', async () => {
      const records = await mod.consentManager.grantMultiple('u1', ['analytics'], 'import')
      expect(records[0].source).toBe('import')
    })

    it('should use provided source parameter (mobile)', async () => {
      const records = await mod.consentManager.grantMultiple('u1', ['analytics'], 'mobile')
      expect(records[0].source).toBe('mobile')
    })

    it('should handle empty array', async () => {
      const records = await mod.consentManager.grantMultiple('u1', [])
      expect(records).toHaveLength(0)
    })

    it('should record each type sequentially and all be verifiable', async () => {
      await mod.consentManager.grantMultiple('u1', [
        'terms_of_service',
        'privacy_policy',
        'cookie_essential',
        'data_processing',
      ])

      expect(await mod.hasConsent('u1', 'terms_of_service')).toBe(true)
      expect(await mod.hasConsent('u1', 'privacy_policy')).toBe(true)
      expect(await mod.hasConsent('u1', 'cookie_essential')).toBe(true)
      expect(await mod.hasConsent('u1', 'data_processing')).toBe(true)
    })
  })

  // ===========================================================================
  // hasConsent
  // ===========================================================================

  describe('hasConsent', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should return true for granted consent', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      expect(await mod.hasConsent('u1', 'terms_of_service')).toBe(true)
    })

    it('should return false when no records exist for user', async () => {
      expect(await mod.hasConsent('nobody', 'terms_of_service')).toBe(false)
    })

    it('should return false when no records exist for that type', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      expect(await mod.hasConsent('u1', 'analytics')).toBe(false)
    })

    it('should return false for revoked consent (granted=false with revokedAt)', async () => {
      await mod.recordConsent('u1', 'analytics', false)
      expect(await mod.hasConsent('u1', 'analytics')).toBe(false)
    })

    it('should use the most recent record when multiple exist', async () => {
      await mod.recordConsent('u1', 'analytics', true)
      await new Promise(r => setTimeout(r, 5))
      await mod.recordConsent('u1', 'analytics', false)
      await new Promise(r => setTimeout(r, 5))
      await mod.recordConsent('u1', 'analytics', true)

      expect(await mod.hasConsent('u1', 'analytics')).toBe(true)
    })

    it('should return false when latest.granted is true but revokedAt is set', async () => {
      // Construct a record that is granted=true but revokedAt is also set
      // This can happen via manual record construction
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'c1',
          userId: 'u1',
          type: 'analytics',
          granted: true,
          grantedAt: Date.now(),
          revokedAt: Date.now(), // Both granted AND revokedAt set
          version: '1.0.0',
          source: 'web',
        },
      ])

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      expect(await mod.hasConsent('u1', 'analytics')).toBe(false)
    })
  })

  // ===========================================================================
  // hasRequiredConsents / checkRequiredConsents
  // ===========================================================================

  describe('checkRequiredConsents / hasRequiredConsents', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should list all 4 required consents as missing for a new user', async () => {
      const result = await mod.checkRequiredConsents('new-user')

      expect(result.hasAll).toBe(false)
      expect(result.missing).toHaveLength(4)
      expect(result.missing).toContain('terms_of_service')
      expect(result.missing).toContain('privacy_policy')
      expect(result.missing).toContain('data_processing')
      expect(result.missing).toContain('cookie_essential')
    })

    it('should return hasAll=true when all required consents are granted', async () => {
      const requiredTypes = mod.CONSENT_REQUIREMENTS
        .filter(r => r.required)
        .map(r => r.type)

      for (const type of requiredTypes) {
        await mod.recordConsent('u1', type, true)
      }

      const result = await mod.checkRequiredConsents('u1')
      expect(result.hasAll).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('should not include optional consents in missing list', async () => {
      const result = await mod.checkRequiredConsents('u1')

      expect(result.missing).not.toContain('analytics')
      expect(result.missing).not.toContain('marketing_email')
      expect(result.missing).not.toContain('ai_processing')
      expect(result.missing).not.toContain('cookie_analytics')
    })

    it('should show partially missing consents', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u1', 'privacy_policy', true)

      const result = await mod.checkRequiredConsents('u1')

      expect(result.hasAll).toBe(false)
      expect(result.missing).toContain('data_processing')
      expect(result.missing).toContain('cookie_essential')
      expect(result.missing).not.toContain('terms_of_service')
      expect(result.missing).not.toContain('privacy_policy')
    })

    it('should detect revoked required consent as missing', async () => {
      // Grant all required
      const requiredTypes = mod.CONSENT_REQUIREMENTS
        .filter(r => r.required)
        .map(r => r.type)
      for (const type of requiredTypes) {
        await mod.recordConsent('u1', type, true)
      }

      // Revoke one
      await new Promise(r => setTimeout(r, 5))
      await mod.consentManager.revokeConsent('u1', 'terms_of_service')

      const result = await mod.checkRequiredConsents('u1')
      expect(result.hasAll).toBe(false)
      expect(result.missing).toContain('terms_of_service')
    })
  })

  // ===========================================================================
  // getUserConsentStatus
  // ===========================================================================

  describe('getUserConsentStatus', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should initialize all 8 defined consent types as not granted for new user', async () => {
      const status = await mod.getUserConsentStatus('new-user')

      expect(status.userId).toBe('new-user')
      for (const req of mod.CONSENT_REQUIREMENTS) {
        expect(status.consents[req.type]).toBeDefined()
        expect(status.consents[req.type].granted).toBe(false)
      }
    })

    it('should return lastUpdated=0 when user has no records', async () => {
      const status = await mod.getUserConsentStatus('new-user')
      expect(status.lastUpdated).toBe(0)
    })

    it('should return lastUpdated as max grantedAt', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await new Promise(r => setTimeout(r, 10))
      await mod.recordConsent('u1', 'analytics', true)

      const status = await mod.getUserConsentStatus('u1')
      expect(status.lastUpdated).toBeGreaterThan(0)
    })

    it('should reflect granted consent correctly', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)

      const status = await mod.getUserConsentStatus('u1')
      expect(status.consents.terms_of_service.granted).toBe(true)
      expect(status.consents.terms_of_service.grantedAt).toBeGreaterThan(0)
      expect(status.consents.terms_of_service.version).toBe('1.0.0')
    })

    it('should reflect revoked consent correctly', async () => {
      await mod.recordConsent('u1', 'analytics', false)

      const status = await mod.getUserConsentStatus('u1')
      expect(status.consents.analytics.granted).toBe(false)
    })

    it('should use the most recent record for each type', async () => {
      await mod.recordConsent('u1', 'analytics', true)
      await new Promise(r => setTimeout(r, 5))
      await mod.recordConsent('u1', 'analytics', false)

      const status = await mod.getUserConsentStatus('u1')
      expect(status.consents.analytics.granted).toBe(false)
    })

    it('should handle record type not in CONSENT_REQUIREMENTS (unknown type branch)', async () => {
      // Pre-seed with a type that is in ConsentType but not in CONSENT_REQUIREMENTS
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'c1',
          userId: 'u1',
          type: 'cross_border_transfer', // Valid ConsentType but not in CONSENT_REQUIREMENTS
          granted: true,
          grantedAt: Date.now(),
          version: '1.0.0',
          source: 'web',
        },
      ])

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const status = await mod.getUserConsentStatus('u1')
      // The type should be initialized to {granted: false} then updated
      expect(status.consents['cross_border_transfer']).toBeDefined()
      expect(status.consents['cross_border_transfer'].granted).toBe(true)
    })

    it('should handle record with grantedAt=0 via !current.grantedAt branch', async () => {
      // A record where grantedAt is present in consents initialization (no grantedAt initially)
      // Then the first record is processed, hitting the !current.grantedAt branch
      await mod.recordConsent('u1', 'terms_of_service', true)
      const status = await mod.getUserConsentStatus('u1')
      expect(status.consents.terms_of_service.grantedAt).toBeGreaterThan(0)
    })

    it('should keep older record when newer record has earlier timestamp', async () => {
      // Seed two records for same type, first with later timestamp
      const later = Date.now() + 10000
      const earlier = Date.now() - 10000
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'c1',
          userId: 'u1',
          type: 'analytics',
          granted: true,
          grantedAt: later,
          version: '1.0.0',
          source: 'web',
        },
        {
          id: 'c2',
          userId: 'u1',
          type: 'analytics',
          granted: false,
          grantedAt: earlier,
          revokedAt: earlier,
          version: '1.0.0',
          source: 'web',
        },
      ])

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const status = await mod.getUserConsentStatus('u1')
      // Later record should win
      expect(status.consents.analytics.granted).toBe(true)
      expect(status.consents.analytics.grantedAt).toBe(later)
    })
  })

  // ===========================================================================
  // getUserConsents (memory cache vs localStorage)
  // ===========================================================================

  describe('getUserConsents', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should return records from localStorage when no IDB', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u1', 'analytics', true)

      // Get a fresh module to reset memory cache, but keep localStorage
      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const records = await mod.consentManager.getUserConsents('u1')
      expect(records.length).toBeGreaterThanOrEqual(2)
    })

    it('should use memory cache on subsequent calls for same user', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)

      // First call populates cache, second should use it
      const records1 = await mod.consentManager.getUserConsents('u1')
      const records2 = await mod.consentManager.getUserConsents('u1')

      expect(records1).toBe(records2) // Same array reference from cache
    })

    it('should return empty array for unknown user with no localStorage data', async () => {
      const records = await mod.consentManager.getUserConsents('unknown-user')
      expect(records).toEqual([])
    })

    it('should return empty array when localStorage has null stored value', async () => {
      // Ensure no data in localStorage
      delete localStorageMock[STORAGE_KEY]
      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const records = await mod.consentManager.getUserConsents('u1')
      expect(records).toEqual([])
    })
  })

  // ===========================================================================
  // getConsentHistory
  // ===========================================================================

  describe('getConsentHistory', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should return history sorted newest first', async () => {
      await mod.recordConsent('u1', 'analytics', true)
      await new Promise(r => setTimeout(r, 5))
      await mod.recordConsent('u1', 'analytics', false)
      await new Promise(r => setTimeout(r, 5))
      await mod.recordConsent('u1', 'analytics', true)

      const history = await mod.consentManager.getConsentHistory('u1', 'analytics')

      expect(history).toHaveLength(3)
      expect(history[0].grantedAt).toBeGreaterThanOrEqual(history[1].grantedAt)
      expect(history[1].grantedAt).toBeGreaterThanOrEqual(history[2].grantedAt)
      expect(history[0].granted).toBe(true)
    })

    it('should return empty array for type with no history', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)

      const history = await mod.consentManager.getConsentHistory('u1', 'analytics')
      expect(history).toHaveLength(0)
    })

    it('should only return records for the specified type', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u1', 'analytics', true)
      await mod.recordConsent('u1', 'privacy_policy', true)

      const history = await mod.consentManager.getConsentHistory('u1', 'analytics')
      expect(history).toHaveLength(1)
      expect(history[0].type).toBe('analytics')
    })

    it('should return empty array for unknown user', async () => {
      const history = await mod.consentManager.getConsentHistory('unknown', 'terms_of_service')
      expect(history).toHaveLength(0)
    })
  })

  // ===========================================================================
  // needsRenewal
  // ===========================================================================

  describe('needsRenewal', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should return false for unknown consent type (not in CONSENT_REQUIREMENTS)', async () => {
      const needs = await mod.consentManager.needsRenewal('u1', 'cookie_marketing' as ConsentType)
      expect(needs).toBe(false)
    })

    it('should return true when no records exist for the type', async () => {
      const needs = await mod.consentManager.needsRenewal('u1', 'terms_of_service')
      expect(needs).toBe(true)
    })

    it('should return true when latest record is not granted', async () => {
      await mod.recordConsent('u1', 'terms_of_service', false)
      const needs = await mod.consentManager.needsRenewal('u1', 'terms_of_service')
      expect(needs).toBe(true)
    })

    it('should return false when consent is current version and granted', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      const needs = await mod.consentManager.needsRenewal('u1', 'terms_of_service')
      expect(needs).toBe(false)
    })

    it('should return true when consent version differs from requirement version', async () => {
      await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'terms_of_service',
        granted: true,
        version: '0.9.0', // Older version than requirement's 1.0.0
      })

      const needs = await mod.consentManager.needsRenewal('u1', 'terms_of_service')
      expect(needs).toBe(true)
    })

    it('should check all defined consent types', async () => {
      for (const req of mod.CONSENT_REQUIREMENTS) {
        const needs = await mod.consentManager.needsRenewal('u1', req.type)
        expect(needs).toBe(true) // No consent recorded yet
      }
    })
  })

  // ===========================================================================
  // deleteUserConsents
  // ===========================================================================

  describe('deleteUserConsents', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should delete all consents for a user from localStorage', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u1', 'privacy_policy', true)
      await mod.recordConsent('u1', 'analytics', true)

      const deleted = await mod.consentManager.deleteUserConsents('u1')

      expect(deleted).toBe(3)
    })

    it('should return 0 when user has no consents', async () => {
      const deleted = await mod.consentManager.deleteUserConsents('unknown-user')
      expect(deleted).toBe(0)
    })

    it('should make hasConsent return false after deletion', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.consentManager.deleteUserConsents('u1')

      expect(await mod.hasConsent('u1', 'terms_of_service')).toBe(false)
    })

    it('should not affect other users', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u2', 'terms_of_service', true)

      await mod.consentManager.deleteUserConsents('u1')

      expect(await mod.hasConsent('u2', 'terms_of_service')).toBe(true)
    })

    it('should clear memory cache for the user', async () => {
      await mod.recordConsent('u1', 'analytics', true)

      // Verify it's cached
      expect(await mod.hasConsent('u1', 'analytics')).toBe(true)

      await mod.consentManager.deleteUserConsents('u1')

      // After delete, should not find it
      expect(await mod.hasConsent('u1', 'analytics')).toBe(false)
    })

    it('should handle localStorage being undefined', async () => {
      const origLocalStorage = global.localStorage
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const deleted = await mod.consentManager.deleteUserConsents('u1')
      expect(deleted).toBe(0)

      Object.defineProperty(global, 'localStorage', {
        value: origLocalStorage,
        writable: true,
        configurable: true,
      })
    })

    it('should handle localStorage returning null for stored data', async () => {
      // Ensure no data
      delete localStorageMock[STORAGE_KEY]

      const deleted = await mod.consentManager.deleteUserConsents('u1')
      expect(deleted).toBe(0)
    })

    it('should handle corrupted localStorage during delete', async () => {
      await mod.recordConsent('u1', 'analytics', true)
      // Corrupt localStorage
      localStorageMock[STORAGE_KEY] = 'not-json'

      // Clear memory cache so it falls through to localStorage
      mod = await getFreshModule()
      localStorageMock[STORAGE_KEY] = 'not-json'
      await mod.initializeConsentManager()

      const deleted = await mod.consentManager.deleteUserConsents('u1')
      expect(deleted).toBe(0) // catch branch returns 0
    })
  })

  // ===========================================================================
  // getStats
  // ===========================================================================

  describe('getStats', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should return stats with all types initialized', async () => {
      const stats = await mod.consentManager.getStats()

      expect(stats.totalRecords).toBe(0)
      expect(stats.recentGrants).toBe(0)
      expect(stats.recentRevocations).toBe(0)

      for (const req of mod.CONSENT_REQUIREMENTS) {
        expect(stats.byType[req.type]).toBeDefined()
        expect(stats.byType[req.type].granted).toBe(0)
        expect(stats.byType[req.type].revoked).toBe(0)
      }
    })

    it('should count granted records', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u2', 'terms_of_service', true)

      const stats = await mod.consentManager.getStats()

      expect(stats.totalRecords).toBe(2)
      expect(stats.byType.terms_of_service.granted).toBe(2)
      expect(stats.byType.terms_of_service.revoked).toBe(0)
    })

    it('should count revoked records', async () => {
      await mod.recordConsent('u1', 'analytics', false)
      await mod.recordConsent('u2', 'analytics', false)

      const stats = await mod.consentManager.getStats()

      expect(stats.byType.analytics.revoked).toBe(2)
      expect(stats.byType.analytics.granted).toBe(0)
    })

    it('should track recent grants within 24 hours', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u2', 'privacy_policy', true)

      const stats = await mod.consentManager.getStats()
      expect(stats.recentGrants).toBe(2)
    })

    it('should track recent revocations within 24 hours', async () => {
      await mod.recordConsent('u1', 'analytics', false)

      const stats = await mod.consentManager.getStats()
      expect(stats.recentRevocations).toBe(1)
    })

    it('should not count old records as recent', async () => {
      // Seed with old record (>24h ago)
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'old1',
          userId: 'u1',
          type: 'terms_of_service',
          granted: true,
          grantedAt: oldTimestamp,
          version: '1.0.0',
          source: 'web',
        },
        {
          id: 'old2',
          userId: 'u2',
          type: 'analytics',
          granted: false,
          grantedAt: oldTimestamp,
          revokedAt: oldTimestamp,
          version: '1.0.0',
          source: 'web',
        },
      ])

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const stats = await mod.consentManager.getStats()

      expect(stats.totalRecords).toBe(2)
      expect(stats.recentGrants).toBe(0)
      expect(stats.recentRevocations).toBe(0)
    })

    it('should handle record type not in CONSENT_REQUIREMENTS (unknown type branch in byType)', async () => {
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'c1',
          userId: 'u1',
          type: 'third_party_sharing', // Valid ConsentType, not in CONSENT_REQUIREMENTS
          granted: true,
          grantedAt: Date.now(),
          version: '1.0.0',
          source: 'web',
        },
      ])

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const stats = await mod.consentManager.getStats()

      expect(stats.totalRecords).toBe(1)
      expect(stats.byType['third_party_sharing']).toBeDefined()
      expect(stats.byType['third_party_sharing'].granted).toBe(1)
    })

    it('should categorize granted record with revokedAt as revoked', async () => {
      // A record where granted=true but revokedAt is set
      clearLocalStorage()
      seedLocalStorage([
        {
          id: 'c1',
          userId: 'u1',
          type: 'analytics',
          granted: true,
          grantedAt: Date.now(),
          revokedAt: Date.now(),
          version: '1.0.0',
          source: 'web',
        },
      ])

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const stats = await mod.consentManager.getStats()

      // granted=true but revokedAt set -> the condition `record.granted && !record.revokedAt` is false
      expect(stats.byType.analytics.revoked).toBe(1)
      expect(stats.byType.analytics.granted).toBe(0)
    })

    it('should handle mixed grants and revocations across types', async () => {
      await mod.recordConsent('u1', 'terms_of_service', true)
      await mod.recordConsent('u2', 'terms_of_service', true)
      await mod.recordConsent('u3', 'terms_of_service', false)
      await mod.recordConsent('u1', 'analytics', true)
      await mod.recordConsent('u2', 'analytics', false)

      const stats = await mod.consentManager.getStats()

      expect(stats.totalRecords).toBe(5)
      expect(stats.byType.terms_of_service.granted).toBe(2)
      expect(stats.byType.terms_of_service.revoked).toBe(1)
      expect(stats.byType.analytics.granted).toBe(1)
      expect(stats.byType.analytics.revoked).toBe(1)
    })
  })

  // ===========================================================================
  // getConsentRequirement (convenience function)
  // ===========================================================================

  describe('getConsentRequirement', () => {
    it('should return the correct requirement for terms_of_service', () => {
      const req = mod.getConsentRequirement('terms_of_service')
      expect(req).toBeDefined()
      expect(req!.type).toBe('terms_of_service')
      expect(req!.required).toBe(true)
      expect(req!.legalBasis).toBe('contract')
    })

    it('should return the correct requirement for privacy_policy', () => {
      const req = mod.getConsentRequirement('privacy_policy')
      expect(req).toBeDefined()
      expect(req!.type).toBe('privacy_policy')
      expect(req!.required).toBe(true)
      expect(req!.legalBasis).toBe('consent')
    })

    it('should return the correct requirement for analytics', () => {
      const req = mod.getConsentRequirement('analytics')
      expect(req).toBeDefined()
      expect(req!.required).toBe(false)
      expect(req!.legalBasis).toBe('legitimate_interests')
    })

    it('should return the correct requirement for ai_processing', () => {
      const req = mod.getConsentRequirement('ai_processing')
      expect(req).toBeDefined()
      expect(req!.required).toBe(false)
      expect(req!.legalBasis).toBe('consent')
    })

    it('should return the correct requirement for cookie_essential', () => {
      const req = mod.getConsentRequirement('cookie_essential')
      expect(req).toBeDefined()
      expect(req!.required).toBe(true)
      expect(req!.legalBasis).toBe('legitimate_interests')
    })

    it('should return the correct requirement for cookie_analytics', () => {
      const req = mod.getConsentRequirement('cookie_analytics')
      expect(req).toBeDefined()
      expect(req!.required).toBe(false)
    })

    it('should return the correct requirement for marketing_email', () => {
      const req = mod.getConsentRequirement('marketing_email')
      expect(req).toBeDefined()
      expect(req!.required).toBe(false)
    })

    it('should return the correct requirement for data_processing', () => {
      const req = mod.getConsentRequirement('data_processing')
      expect(req).toBeDefined()
      expect(req!.required).toBe(true)
    })

    it('should return undefined for a type not in CONSENT_REQUIREMENTS', () => {
      const req = mod.getConsentRequirement('marketing_sms' as ConsentType)
      expect(req).toBeUndefined()
    })

    it('should return undefined for completely unknown type', () => {
      const req = mod.getConsentRequirement('nonexistent' as ConsentType)
      expect(req).toBeUndefined()
    })
  })

  // ===========================================================================
  // getAllConsentRequirements (convenience function)
  // ===========================================================================

  describe('getAllConsentRequirements', () => {
    it('should return all consent requirements', () => {
      const reqs = mod.getAllConsentRequirements()
      expect(reqs).toHaveLength(8)
    })

    it('should return a defensive copy (mutation does not affect original)', () => {
      const reqs = mod.getAllConsentRequirements()
      reqs.push({} as (typeof reqs)[0])
      reqs.splice(0, 3)

      const again = mod.getAllConsentRequirements()
      expect(again).toHaveLength(8)
    })

    it('should contain all expected types', () => {
      const reqs = mod.getAllConsentRequirements()
      const types = reqs.map(r => r.type)

      expect(types).toContain('terms_of_service')
      expect(types).toContain('privacy_policy')
      expect(types).toContain('data_processing')
      expect(types).toContain('ai_processing')
      expect(types).toContain('analytics')
      expect(types).toContain('marketing_email')
      expect(types).toContain('cookie_essential')
      expect(types).toContain('cookie_analytics')
    })
  })

  // ===========================================================================
  // localStorage edge cases
  // ===========================================================================

  describe('localStorage edge cases', () => {
    it('should handle getFromLocalStorage with undefined localStorage', async () => {
      const origLocalStorage = global.localStorage
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      // getUserConsents falls back to getFromLocalStorage
      const records = await mod.consentManager.getUserConsents('u1')
      expect(records).toEqual([])

      Object.defineProperty(global, 'localStorage', {
        value: origLocalStorage,
        writable: true,
        configurable: true,
      })
    })

    it('should handle getAllFromLocalStorage with undefined localStorage', async () => {
      await mod.initializeConsentManager()

      const origLocalStorage = global.localStorage
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      // getStats calls getAllRecords -> getAllFromLocalStorage
      // Need fresh module since memory cache may be populated
      mod = await getFreshModule()
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })
      await mod.initializeConsentManager()
      const stats = await mod.consentManager.getStats()
      expect(stats.totalRecords).toBe(0)

      Object.defineProperty(global, 'localStorage', {
        value: origLocalStorage,
        writable: true,
        configurable: true,
      })
    })

    it('should handle getAllFromLocalStorage returning corrupted JSON', async () => {
      localStorageMock[STORAGE_KEY] = '!!!not json!!!'

      mod = await getFreshModule()
      // loadFromLocalStorage will fail silently (catch), memory cache empty
      await mod.initializeConsentManager()

      // Force a fresh getStats which goes through getAllFromLocalStorage
      // But memory cache was populated (empty) during init. We need a scenario
      // where getAllRecords hits getAllFromLocalStorage with bad data.
      // Since db is null and loadFromLocalStorage silently fails, getAllFromLocalStorage
      // is called which also catches the error.
      const stats = await mod.consentManager.getStats()
      expect(stats.totalRecords).toBe(0)
    })

    it('should handle getFromLocalStorage with corrupted JSON', async () => {
      clearLocalStorage()
      mod = await getFreshModule()
      await mod.initializeConsentManager()

      // Corrupt after init
      localStorageMock[STORAGE_KEY] = 'bad-json'

      // Force a cache miss by requesting unknown user
      // getUserConsents -> getFromLocalStorage with bad data
      // But memory cache may intercept. The getFromLocalStorage is only
      // called when db is null and cache misses. Since init loaded nothing
      // for 'unknown', it will go to getFromLocalStorage.
      // Actually, after init, the memory cache is populated only for users
      // found in localStorage during loadFromLocalStorage. Unknown user
      // won't be in cache, so it hits getFromLocalStorage.
      const records = await mod.consentManager.getUserConsents('unknown')
      expect(records).toEqual([])
    })

    it('should handle saveToLocalStorage with localStorage undefined', async () => {
      const origLocalStorage = global.localStorage

      // Init with localStorage available
      await mod.initializeConsentManager()

      // Then make localStorage unavailable
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      // recordConsent calls saveToLocalStorage which should handle undefined
      // But wait - the module captured localStorage reference at import time
      // Actually, it checks typeof localStorage at call time.
      // We need a fresh module with localStorage undefined during the save.
      mod = await getFreshModule()
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      })
      await mod.initializeConsentManager()

      // This should not throw - saveToLocalStorage checks typeof localStorage
      const record = await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'analytics',
        granted: true,
      })
      expect(record.granted).toBe(true)

      // Restore
      Object.defineProperty(global, 'localStorage', {
        value: origLocalStorage,
        writable: true,
        configurable: true,
      })
    })

    it('should handle deleteFromLocalStorage with corrupted JSON', async () => {
      await mod.initializeConsentManager()
      await mod.recordConsent('u1', 'analytics', true)

      // Corrupt localStorage after recording
      localStorageMock[STORAGE_KEY] = '{corrupt'

      // Need fresh module so memory cache is empty for u1
      // Actually deleteUserConsents clears memory cache first
      // then calls deleteFromLocalStorage which will hit parse error
      // But deleteUserConsents checks this.db first; since db is null
      // it calls deleteFromLocalStorage directly.
      // The corrupted JSON will cause JSON.parse to throw, caught by try/catch, returns 0.
      // However the memory cache was populated during recordConsent.
      // deleteUserConsents first clears memory cache, then calls deleteFromLocalStorage.
      // Since we corrupted AFTER recording, deleteFromLocalStorage will fail.
      const deleted = await mod.consentManager.deleteUserConsents('u1')
      // Memory cache had the record but deleteFromLocalStorage returns 0 due to parse error
      // Actually, since db is null, deleteUserConsents calls deleteFromLocalStorage.
      // The corrupted JSON causes parse error, returns 0 from catch.
      expect(deleted).toBe(0)
    })
  })

  // ===========================================================================
  // isIndexedDBAvailable edge case: accessing indexedDB throws
  // ===========================================================================

  describe('IndexedDB availability', () => {
    it('should handle indexedDB access throwing an error', async () => {
      // Some environments throw when accessing indexedDB (e.g., sandboxed iframes)
      Object.defineProperty(global, 'indexedDB', {
        get() {
          throw new Error('SecurityError: indexedDB access denied')
        },
        configurable: true,
      })

      mod = await getFreshModule()
      // isIndexedDBAvailable should catch and return false
      await mod.initializeConsentManager()

      // Should work fine with localStorage fallback
      const record = await mod.recordConsent('u1', 'terms_of_service', true)
      expect(record.granted).toBe(true)

      // Restore
      Object.defineProperty(global, 'indexedDB', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })

    it('should handle indexedDB being null', async () => {
      Object.defineProperty(global, 'indexedDB', {
        value: null,
        writable: true,
        configurable: true,
      })

      mod = await getFreshModule()
      await mod.initializeConsentManager()

      const record = await mod.recordConsent('u1', 'analytics', true)
      expect(record.granted).toBe(true)

      // Restore
      Object.defineProperty(global, 'indexedDB', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })
  })

  // ===========================================================================
  // storeRecord private method paths (via recordConsent)
  // ===========================================================================

  describe('storeRecord (internal via recordConsent)', () => {
    it('should update memory cache even when db is null', async () => {
      await mod.initializeConsentManager()
      await mod.recordConsent('u1', 'analytics', true)

      // Memory cache should be populated - getUserConsents should return from cache
      const records = await mod.consentManager.getUserConsents('u1')
      expect(records.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle both memory cache update and localStorage save', async () => {
      await mod.initializeConsentManager()

      await mod.recordConsent('u1', 'terms_of_service', true)

      // Check memory cache (via getUserConsents which checks cache first)
      const has = await mod.hasConsent('u1', 'terms_of_service')
      expect(has).toBe(true)

      // Check localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String)
      )
    })
  })

  // ===========================================================================
  // End-to-end / Integration scenarios
  // ===========================================================================

  describe('integration scenarios', () => {
    beforeEach(async () => {
      await mod.initializeConsentManager()
    })

    it('should support full consent lifecycle: grant -> verify -> revoke -> verify', async () => {
      // Grant
      await mod.recordConsent('u1', 'analytics', true)
      expect(await mod.hasConsent('u1', 'analytics')).toBe(true)

      // Revoke
      await new Promise(r => setTimeout(r, 5))
      await mod.consentManager.revokeConsent('u1', 'analytics')
      expect(await mod.hasConsent('u1', 'analytics')).toBe(false)

      // Re-grant
      await new Promise(r => setTimeout(r, 5))
      await mod.recordConsent('u1', 'analytics', true)
      expect(await mod.hasConsent('u1', 'analytics')).toBe(true)
    })

    it('should support signup flow: grant all required, verify, check status', async () => {
      const requiredTypes = mod.CONSENT_REQUIREMENTS
        .filter(r => r.required)
        .map(r => r.type)

      await mod.consentManager.grantMultiple('signup-user', requiredTypes)

      const check = await mod.checkRequiredConsents('signup-user')
      expect(check.hasAll).toBe(true)
      expect(check.missing).toEqual([])

      const status = await mod.getUserConsentStatus('signup-user')
      for (const type of requiredTypes) {
        expect(status.consents[type].granted).toBe(true)
      }
    })

    it('should support account deletion: delete all consents, verify empty', async () => {
      await mod.consentManager.grantMultiple('u1', [
        'terms_of_service',
        'privacy_policy',
        'data_processing',
        'analytics',
      ])

      const deleted = await mod.consentManager.deleteUserConsents('u1')
      expect(deleted).toBe(4)

      const status = await mod.getUserConsentStatus('u1')
      for (const req of mod.CONSENT_REQUIREMENTS) {
        expect(status.consents[req.type].granted).toBe(false)
      }
    })

    it('should isolate consents between different users', async () => {
      await mod.recordConsent('user-a', 'analytics', true)
      await mod.recordConsent('user-b', 'analytics', false)

      expect(await mod.hasConsent('user-a', 'analytics')).toBe(true)
      expect(await mod.hasConsent('user-b', 'analytics')).toBe(false)
    })

    it('should handle consent renewal workflow', async () => {
      // Grant with old version
      await mod.consentManager.recordConsent({
        userId: 'u1',
        type: 'terms_of_service',
        granted: true,
        version: '0.5.0',
      })

      // Check if renewal needed
      const needs = await mod.consentManager.needsRenewal('u1', 'terms_of_service')
      expect(needs).toBe(true)

      // Delay so new record has later grantedAt and sorts first
      await new Promise(r => setTimeout(r, 5))

      // Re-grant with current version
      await mod.recordConsent('u1', 'terms_of_service', true)

      // Should no longer need renewal
      const needsAfter = await mod.consentManager.needsRenewal('u1', 'terms_of_service')
      expect(needsAfter).toBe(false)
    })

    it('should persist across module reloads via localStorage', async () => {
      await mod.recordConsent('persist-user', 'terms_of_service', true)
      await mod.recordConsent('persist-user', 'analytics', true)

      // Reload module (simulates page refresh)
      mod = await getFreshModule()
      await mod.initializeConsentManager()

      expect(await mod.hasConsent('persist-user', 'terms_of_service')).toBe(true)
      expect(await mod.hasConsent('persist-user', 'analytics')).toBe(true)
    })
  })
})
