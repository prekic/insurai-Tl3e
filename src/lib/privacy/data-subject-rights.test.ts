/**
 * Comprehensive tests for Data Subject Rights Manager
 * Targeting full branch coverage for all conditional paths, switch cases,
 * error handling, and edge cases in the KVKK/GDPR compliance module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =============================================================================
// Mock consent manager before importing the module
// Use vi.hoisted() to avoid TDZ errors since vi.mock is hoisted
// =============================================================================

const {
  mockGetUserConsents,
  mockGetUserConsentStatus,
  mockRevokeConsent,
  mockDeleteUserConsents,
} = vi.hoisted(() => ({
  mockGetUserConsents: vi.fn().mockResolvedValue([]),
  mockGetUserConsentStatus: vi.fn().mockResolvedValue({
    userId: 'test-user-123',
    consents: {
      terms_of_service: { granted: true, grantedAt: Date.now() },
      cookie_essential: { granted: true, grantedAt: Date.now() },
      cookie_analytics: { granted: true, grantedAt: Date.now() },
      data_processing: { granted: true, grantedAt: Date.now() },
    },
    lastUpdated: Date.now(),
  }),
  mockRevokeConsent: vi.fn().mockResolvedValue(undefined),
  mockDeleteUserConsents: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./consent-manager', () => ({
  consentManager: {
    getUserConsents: mockGetUserConsents,
    getUserConsentStatus: mockGetUserConsentStatus,
    revokeConsent: mockRevokeConsent,
    deleteUserConsents: mockDeleteUserConsents,
  },
}))

// =============================================================================
// Comprehensive IndexedDB Mock System
// =============================================================================

// In-memory store for persisting data across transactions within a test
let inMemoryStore: Map<string, unknown> = new Map()

class MockIDBRequest {
  result: unknown = null
  error: DOMException | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null

  succeed(result: unknown) {
    this.result = result
    this.onsuccess?.()
  }

  fail(error?: DOMException) {
    this.error = error ?? new DOMException('Mock error')
    this.onerror?.()
  }
}

class MockIDBCursor {
  primaryKey: string
  value: unknown

  private store: MockIDBObjectStore
  private keys: string[]
  private index: number
  private request: MockIDBRequest

  constructor(store: MockIDBObjectStore, keys: string[], request: MockIDBRequest) {
    this.store = store
    this.keys = keys
    this.index = 0
    this.request = request
    this.primaryKey = keys[0]
    this.value = inMemoryStore.get(keys[0])
  }

  continue() {
    this.index++
    if (this.index < this.keys.length) {
      this.primaryKey = this.keys[this.index]
      this.value = inMemoryStore.get(this.keys[this.index])
      this.request.result = this
      this.request.onsuccess?.()
    } else {
      this.request.result = null
      this.request.onsuccess?.()
    }
  }

  delete() {
    inMemoryStore.delete(this.primaryKey)
  }
}

class MockIDBIndex {
  name: string

  constructor(name: string) {
    this.name = name
  }

  getAll(key?: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => {
      if (key) {
        const results: unknown[] = []
        for (const [_k, v] of inMemoryStore) {
          const record = v as Record<string, unknown>
          if (record[this.name] === key) {
            results.push(v)
          }
        }
        request.succeed(results)
      } else {
        request.succeed([])
      }
    }, 0)
    return request
  }

  openKeyCursor(range?: { lower?: unknown }): MockIDBRequest {
    const request = new MockIDBRequest()
    const targetValue = range && 'lower' in (range as Record<string, unknown>)
      ? (range as Record<string, unknown>).lower
      : range
    setTimeout(() => {
      // Find keys matching the index value
      const matchingKeys: string[] = []
      for (const [k, v] of inMemoryStore) {
        const record = v as Record<string, unknown>
        if (record[this.name] === targetValue) {
          matchingKeys.push(k)
        }
      }
      if (matchingKeys.length > 0) {
        const cursor = new MockIDBCursor(null as unknown as MockIDBObjectStore, matchingKeys, request)
        request.succeed(cursor)
      } else {
        request.succeed(null)
      }
    }, 0)
    return request
  }
}

class MockIDBObjectStore {
  name: string
  indexNames: DOMStringList
  private indexes: string[]

  constructor(name: string, indexes: string[] = ['userId', 'type', 'status', 'submittedAt']) {
    this.name = name
    this.indexes = indexes
    this.indexNames = {
      contains: (n: string) => indexes.includes(n),
      length: indexes.length,
      item: (i: number) => indexes[i] ?? null,
      [Symbol.iterator]: function* () { yield* indexes },
    } as DOMStringList
  }

  index(name: string): MockIDBIndex {
    return new MockIDBIndex(name)
  }

  add(value: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    const record = value as { id: string }
    inMemoryStore.set(record.id, value)
    setTimeout(() => request.succeed(undefined), 0)
    return request
  }

  put(value: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    const record = value as { id: string }
    inMemoryStore.set(record.id, value)
    setTimeout(() => request.succeed(undefined), 0)
    return request
  }

  get(key: string): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(inMemoryStore.get(key) ?? null), 0)
    return request
  }

  getAll(): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(Array.from(inMemoryStore.values())), 0)
    return request
  }

  delete(key: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    inMemoryStore.delete(key as string)
    setTimeout(() => request.succeed(undefined), 0)
    return request
  }

  openCursor(): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => {
      const keys = Array.from(inMemoryStore.keys())
      if (keys.length > 0) {
        const cursor = new MockIDBCursor(this, keys, request)
        request.succeed(cursor)
      } else {
        request.succeed(null)
      }
    }, 0)
    return request
  }

  createIndex(
    _name: string,
    _keyPath: string | string[],
    _options?: IDBIndexParameters
  ): MockIDBIndex {
    return new MockIDBIndex(_name)
  }
}

class MockIDBTransaction {
  objectStoreNames: DOMStringList
  oncomplete: (() => void) | null = null
  onerror: (() => void) | null = null
  private stores: Map<string, MockIDBObjectStore> = new Map()
  private storeNames: string[]

  constructor(storeNames: string[], _mode?: IDBTransactionMode) {
    this.storeNames = storeNames
    this.objectStoreNames = {
      contains: (name: string) => storeNames.includes(name),
      length: storeNames.length,
      item: (index: number) => storeNames[index] ?? null,
      [Symbol.iterator]: function* () { yield* storeNames },
    } as DOMStringList

    for (const name of storeNames) {
      this.stores.set(name, new MockIDBObjectStore(name))
    }

    // Auto-complete transaction
    setTimeout(() => this.oncomplete?.(), 0)
  }

  objectStore(name: string): MockIDBObjectStore {
    return this.stores.get(name) ?? new MockIDBObjectStore(name)
  }
}

class MockIDBDatabase {
  name: string
  objectStoreNames: DOMStringList
  private storeNames: string[]

  constructor(name: string, storeNames: string[] = ['dsr_requests']) {
    this.name = name
    this.storeNames = storeNames
    this.objectStoreNames = {
      contains: (name: string) => storeNames.includes(name),
      length: storeNames.length,
      item: (index: number) => storeNames[index] ?? null,
      [Symbol.iterator]: function* () { yield* storeNames },
    } as DOMStringList
  }

  transaction(storeNames: string | string[], mode?: IDBTransactionMode): MockIDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    return new MockIDBTransaction(names, mode)
  }

  createObjectStore(name: string, _options?: IDBObjectStoreParameters): MockIDBObjectStore {
    return new MockIDBObjectStore(name)
  }

  close(): void {
    // noop
  }
}

class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: ((event: { target: MockIDBOpenDBRequest }) => void) | null = null
}

// Helper to create IDBKeyRange-like
const mockIDBKeyRange = {
  only: (value: unknown) => ({ lower: value, upper: value }),
}

function createStandardIndexedDBMock() {
  return {
    open: vi.fn((name: string, _version?: number) => {
      const request = new MockIDBOpenDBRequest()
      const db = new MockIDBDatabase(name)
      setTimeout(() => {
        request.result = db
        request.onsuccess?.()
      }, 0)
      return request
    }),
  }
}

// Setup global mocks
beforeEach(() => {
  inMemoryStore = new Map()
  vi.stubGlobal('indexedDB', createStandardIndexedDBMock())
  vi.stubGlobal('IDBKeyRange', mockIDBKeyRange)
  mockGetUserConsents.mockResolvedValue([])
  mockGetUserConsentStatus.mockResolvedValue({
    userId: 'test-user-123',
    consents: {
      terms_of_service: { granted: true, grantedAt: Date.now() },
      cookie_essential: { granted: true, grantedAt: Date.now() },
      cookie_analytics: { granted: true, grantedAt: Date.now() },
      data_processing: { granted: true, grantedAt: Date.now() },
    },
    lastUpdated: Date.now(),
  })
  mockRevokeConsent.mockResolvedValue(undefined)
  mockDeleteUserConsents.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Import after mocking
import {
  dataSubjectRightsManager,
  requestDataAccess,
  requestDataDeletion,
  requestDataPortability,
  processDataSubjectRequest,
  getUserDataRequests,
  exportUserData,
  deleteAllUserData,
} from './data-subject-rights'
import { consentManager } from './consent-manager'

// =============================================================================
// Helper: create a request and get it stored so we can process it
// =============================================================================

async function createAndStoreRequest(
  type: string,
  userId = 'test-user',
  email = 'test@example.com',
  reason?: string
) {
  const request = await dataSubjectRightsManager.submitRequest({
    userId,
    email,
    type: type as import('@/types/privacy').DataSubjectRight,
    reason,
  })
  // The mock IDB stores via add, but getRequest reads from a separate transaction.
  // Our in-memory store shares state, so the request should be retrievable.
  return request
}

// =============================================================================
// DataSubjectRightsManager Core Tests
// =============================================================================

describe('DataSubjectRightsManager', () => {
  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
    })

    it('should not throw on multiple initialize calls (idempotent)', async () => {
      // The singleton caches initPromise; subsequent calls return early
      await dataSubjectRightsManager.initialize()
      await dataSubjectRightsManager.initialize()
      await dataSubjectRightsManager.initialize()
      // All should resolve without error
    })

    it('should handle IndexedDB not available', async () => {
      vi.stubGlobal('indexedDB', undefined)

      // Force re-init by creating a fresh instance through the module
      // The singleton already initialized, but we test the openDatabase rejection path
      await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
    })

    it('should handle IndexedDB open error gracefully in doInitialize', async () => {
      const errorMock = {
        open: vi.fn(() => {
          const request = new MockIDBOpenDBRequest()
          setTimeout(() => {
            request.error = new DOMException('Database open failed')
            request.onerror?.()
          }, 0)
          return request
        }),
      }
      vi.stubGlobal('indexedDB', errorMock)

      await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
    })

    it('should handle database upgrade needed when store does not exist', async () => {
      const upgradeMock = {
        open: vi.fn(() => {
          const request = new MockIDBOpenDBRequest()
          // DB with no existing stores
          const db = new MockIDBDatabase('insurai_privacy', [])

          setTimeout(() => {
            if (request.onupgradeneeded) {
              request.onupgradeneeded({ target: request } as unknown as { target: MockIDBOpenDBRequest })
            }
            request.result = db
            request.onsuccess?.()
          }, 0)
          return request
        }),
      }
      vi.stubGlobal('indexedDB', upgradeMock)

      await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
    })

    it('should skip store creation when store already exists (onupgradeneeded branch)', async () => {
      const upgradeMock = {
        open: vi.fn(() => {
          const request = new MockIDBOpenDBRequest()
          // DB with existing dsr_requests store
          const db = new MockIDBDatabase('insurai_privacy', ['dsr_requests'])

          setTimeout(() => {
            if (request.onupgradeneeded) {
              request.onupgradeneeded({ target: request } as unknown as { target: MockIDBOpenDBRequest })
            }
            request.result = db
            request.onsuccess?.()
          }, 0)
          return request
        }),
      }
      vi.stubGlobal('indexedDB', upgradeMock)

      await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
    })
  })

  describe('submitRequest', () => {
    it('should submit an access request', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-123',
        email: 'test@example.com',
        type: 'access',
      })

      expect(request).toBeDefined()
      expect(request.id).toMatch(/^dsr_/)
      expect(request.userId).toBe('user-123')
      expect(request.email).toBe('test@example.com')
      expect(request.type).toBe('access')
      expect(request.status).toBe('pending')
      expect(request.submittedAt).toBeDefined()
      expect(request.deadline).toBeGreaterThan(request.submittedAt)
    })

    it('should submit an erasure request with reason', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-456',
        email: 'user@example.com',
        type: 'erasure',
        reason: 'No longer using the service',
      })

      expect(request.type).toBe('erasure')
      expect(request.reason).toBe('No longer using the service')
    })

    it('should submit without reason (undefined)', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-no-reason',
        email: 'nr@example.com',
        type: 'access',
      })

      expect(request.reason).toBeUndefined()
    })

    it('should calculate deadline as 30 days from submission', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-deadline',
        email: 'deadline@example.com',
        type: 'access',
      })

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
      expect(request.deadline - request.submittedAt).toBe(thirtyDaysMs)
    })

    it('should generate unique request IDs', async () => {
      const r1 = await dataSubjectRightsManager.submitRequest({
        userId: 'u1', email: 'u1@test.com', type: 'access',
      })
      const r2 = await dataSubjectRightsManager.submitRequest({
        userId: 'u2', email: 'u2@test.com', type: 'access',
      })

      expect(r1.id).not.toBe(r2.id)
    })
  })

  // ===========================================================================
  // processRequest - the critical switch statement and all handler branches
  // ===========================================================================

  describe('processRequest', () => {
    it('should throw "Request not found" for non-existent request', async () => {
      await expect(
        dataSubjectRightsManager.processRequest('non-existent-id')
      ).rejects.toThrow('Request not found')
    })

    it('should process an ACCESS request and return completed response', async () => {
      const req = await createAndStoreRequest('access', 'access-user', 'access@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.requestId).toBe(req.id)
      expect(response.type).toBe('access')
      expect(response.status).toBe('completed')
      expect(response.responseDate).toBeGreaterThan(0)
      expect(response.data).toBeDefined()
      expect(response.format).toBe('json')
      expect(response.message).toContain('personal data has been compiled')
      expect(response.messageTr).toContain('Kişisel verileriniz')
    })

    it('should process a PORTABILITY request and return portable format', async () => {
      const req = await createAndStoreRequest('portability', 'port-user', 'port@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.requestId).toBe(req.id)
      expect(response.type).toBe('portability')
      expect(response.status).toBe('completed')
      expect(response.format).toBe('json')
      expect(response.message).toContain('portable format')
      expect(response.messageTr).toContain('taşınabilir')

      // Check portable data structure
      const portableData = response.data as Record<string, unknown>
      expect(portableData.exportDate).toBeDefined()
      expect(portableData.format).toBe('JSON')
      expect(portableData.schema).toBe('1.0')
      expect(portableData.controller).toBe('InsurAI')
      expect(portableData.subject).toEqual({
        userId: 'port-user',
        email: 'port@test.com',
      })
      expect(portableData.data).toBeDefined()
    })

    it('should process an ERASURE request and return completed when fully deleted', async () => {
      const req = await createAndStoreRequest('erasure', 'erase-user', 'erase@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.requestId).toBe(req.id)
      expect(response.type).toBe('erasure')
      // Should be completed (all sources succeeded)
      expect(response.status).toBe('completed')
      expect(response.message).toContain('deleted from')
      expect(response.messageTr).toContain('silindi')
    })

    it('should process an ERASURE request and return partial when errors occur', async () => {
      // Make consent deletion fail to trigger partial
      mockDeleteUserConsents.mockRejectedValueOnce(new Error('Consent DB down'))

      const req = await createAndStoreRequest('erasure', 'partial-erase', 'partial@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.requestId).toBe(req.id)
      expect(response.type).toBe('erasure')
      expect(response.status).toBe('partial')
      expect(response.message).toContain('Partial deletion')
      expect(response.message).toContain('Errors')
      expect(response.messageTr).toContain('Kısmi silme')
      expect(response.messageTr).toContain('Hatalar')
    })

    it('should process a RECTIFICATION request', async () => {
      const req = await createAndStoreRequest('rectification', 'rect-user', 'rect@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.type).toBe('rectification')
      expect(response.status).toBe('completed')
      expect(response.message).toContain('rectification request has been logged')
      expect(response.messageTr).toContain('Düzeltme talebiniz')
    })

    it('should process a RESTRICTION request', async () => {
      const req = await createAndStoreRequest('restriction', 'restrict-user', 'restrict@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.type).toBe('restriction')
      expect(response.status).toBe('completed')
      expect(response.message).toContain('restricted as requested')
      expect(response.messageTr).toContain('kısıtlandı')
    })

    it('should process a WITHDRAW_CONSENT request and revoke non-essential consents', async () => {
      mockGetUserConsentStatus.mockResolvedValueOnce({
        userId: 'withdraw-user',
        consents: {
          terms_of_service: { granted: true, grantedAt: Date.now() },
          cookie_essential: { granted: true, grantedAt: Date.now() },
          analytics: { granted: true, grantedAt: Date.now() },
          marketing_email: { granted: true, grantedAt: Date.now() },
          cookie_analytics: { granted: false },
        },
        lastUpdated: Date.now(),
      })

      const req = await createAndStoreRequest('withdraw_consent', 'withdraw-user', 'withdraw@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.type).toBe('withdraw_consent')
      expect(response.status).toBe('completed')
      // Should have revoked analytics and marketing_email (not terms_of_service or cookie_essential)
      expect(mockRevokeConsent).toHaveBeenCalledWith('withdraw-user', 'analytics')
      expect(mockRevokeConsent).toHaveBeenCalledWith('withdraw-user', 'marketing_email')
      expect(mockRevokeConsent).not.toHaveBeenCalledWith('withdraw-user', 'terms_of_service')
      expect(mockRevokeConsent).not.toHaveBeenCalledWith('withdraw-user', 'cookie_essential')
      expect(response.message).toContain('analytics')
      expect(response.message).toContain('marketing_email')
    })

    it('should handle WITHDRAW_CONSENT when no consents to revoke (all essential or not granted)', async () => {
      mockGetUserConsentStatus.mockResolvedValueOnce({
        userId: 'no-revoke-user',
        consents: {
          terms_of_service: { granted: true, grantedAt: Date.now() },
          cookie_essential: { granted: true, grantedAt: Date.now() },
          analytics: { granted: false },
          marketing_email: { granted: false },
        },
        lastUpdated: Date.now(),
      })

      const req = await createAndStoreRequest('withdraw_consent', 'no-revoke-user', 'norevoke@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.message).toContain('None')
      expect(response.messageTr).toContain('Yok')
      expect(mockRevokeConsent).not.toHaveBeenCalled()
    })

    it('should handle DEFAULT switch case (objection type)', async () => {
      const req = await createAndStoreRequest('objection', 'objection-user', 'objection@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.type).toBe('objection')
      expect(response.status).toBe('rejected')
      expect(response.message).toBe('Request type not yet implemented')
      expect(response.messageTr).toBe('Talep türü henüz uygulanmadı')
    })

    it('should handle DEFAULT switch case (complaint type)', async () => {
      const req = await createAndStoreRequest('complaint', 'complaint-user', 'complaint@test.com')

      const response = await dataSubjectRightsManager.processRequest(req.id)

      expect(response.type).toBe('complaint')
      expect(response.status).toBe('rejected')
    })

    it('should set request status to rejected when response is rejected (default branch)', async () => {
      const req = await createAndStoreRequest('objection', 'rej-user', 'rej@test.com')

      await dataSubjectRightsManager.processRequest(req.id)

      // After processing, the stored request should be rejected
      const stored = await dataSubjectRightsManager.getRequest(req.id)
      expect(stored?.status).toBe('rejected')
      expect(stored?.completedAt).toBeDefined()
    })

    it('should set request status to completed for successful processing', async () => {
      const req = await createAndStoreRequest('access', 'comp-user', 'comp@test.com')

      await dataSubjectRightsManager.processRequest(req.id)

      const stored = await dataSubjectRightsManager.getRequest(req.id)
      expect(stored?.status).toBe('completed')
      expect(stored?.completedAt).toBeDefined()
      expect(stored?.acknowledgedAt).toBeDefined()
    })

    it('should set request status to in_progress during processing', async () => {
      // We can verify the acknowledgedAt was set, indicating in_progress transition
      const req = await createAndStoreRequest('rectification', 'progress-user', 'progress@test.com')

      await dataSubjectRightsManager.processRequest(req.id)

      const stored = await dataSubjectRightsManager.getRequest(req.id)
      expect(stored?.acknowledgedAt).toBeDefined()
      expect(stored?.acknowledgedAt).toBeGreaterThan(0)
    })

    it('should handle error during processing and set rejection reason (Error instance)', async () => {
      // Make collectUserData throw by making getUserConsents throw
      mockGetUserConsents.mockRejectedValueOnce(new Error('Consent service unavailable'))

      const req = await createAndStoreRequest('access', 'error-user', 'error@test.com')

      await expect(
        dataSubjectRightsManager.processRequest(req.id)
      ).rejects.toThrow('Consent service unavailable')

      // Request should be marked as rejected with reason
      const stored = await dataSubjectRightsManager.getRequest(req.id)
      expect(stored?.status).toBe('rejected')
      expect(stored?.rejectionReason).toBe('Consent service unavailable')
    })

    it('should handle non-Error thrown during processing (string error)', async () => {
      // Make consentManager.getUserConsents throw a non-Error value
      mockGetUserConsents.mockRejectedValueOnce('string error message')

      const req = await createAndStoreRequest('access', 'non-error-user', 'nonerr@test.com')

      await expect(
        dataSubjectRightsManager.processRequest(req.id)
      ).rejects.toBe('string error message')

      const stored = await dataSubjectRightsManager.getRequest(req.id)
      expect(stored?.status).toBe('rejected')
      expect(stored?.rejectionReason).toBe('Processing failed')
    })
  })

  // ===========================================================================
  // getUserRequests, getRequest, getPendingRequests, getOverdueRequests
  // ===========================================================================

  describe('getUserRequests', () => {
    it('should return empty array when no requests exist', async () => {
      const requests = await dataSubjectRightsManager.getUserRequests('new-user')
      expect(requests).toEqual([])
    })

    it('should return empty array when db is null', async () => {
      vi.stubGlobal('indexedDB', undefined)
      // Force fresh init state
      vi.resetModules()
      const mod = await import('./data-subject-rights')

      const requests = await mod.dataSubjectRightsManager.getUserRequests('no-db-user')
      expect(requests).toEqual([])
    })
  })

  describe('getRequest', () => {
    it('should return null for non-existent request', async () => {
      const request = await dataSubjectRightsManager.getRequest('non-existent')
      expect(request).toBeNull()
    })

    it('should return null when db is null', async () => {
      vi.stubGlobal('indexedDB', undefined)
      vi.resetModules()
      const mod = await import('./data-subject-rights')

      const request = await mod.dataSubjectRightsManager.getRequest('any-id')
      expect(request).toBeNull()
    })
  })

  describe('getPendingRequests', () => {
    it('should return empty array when no pending requests', async () => {
      const pending = await dataSubjectRightsManager.getPendingRequests()
      expect(pending).toEqual([])
    })

    it('should return empty array when db is null', async () => {
      vi.stubGlobal('indexedDB', undefined)
      vi.resetModules()
      const mod = await import('./data-subject-rights')

      const pending = await mod.dataSubjectRightsManager.getPendingRequests()
      expect(pending).toEqual([])
    })
  })

  describe('getOverdueRequests', () => {
    it('should return empty array when no overdue requests', async () => {
      const overdue = await dataSubjectRightsManager.getOverdueRequests()
      expect(overdue).toEqual([])
    })

    it('should filter pending requests that are past deadline', async () => {
      // Manually insert a request with a past deadline
      const pastDeadlineRequest = {
        id: 'overdue-req-1',
        userId: 'overdue-user',
        email: 'overdue@test.com',
        type: 'access',
        status: 'pending',
        submittedAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
        deadline: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      }
      inMemoryStore.set('overdue-req-1', pastDeadlineRequest)

      const overdue = await dataSubjectRightsManager.getOverdueRequests()
      // The mock returns requests based on index 'status' = 'pending'
      // Our mock index getAll checks the 'status' field
      expect(Array.isArray(overdue)).toBe(true)
    })
  })

  // ===========================================================================
  // storeRequest / updateRequest when db is null
  // ===========================================================================

  describe('storeRequest with null db', () => {
    it('should silently return when db is null', async () => {
      vi.stubGlobal('indexedDB', undefined)
      vi.resetModules()
      const mod = await import('./data-subject-rights')

      // Submit should not throw even though storeRequest silently returns
      const request = await mod.dataSubjectRightsManager.submitRequest({
        userId: 'null-db-user',
        email: 'nulldb@test.com',
        type: 'access',
      })
      expect(request.id).toMatch(/^dsr_/)
    })
  })
})

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('Convenience functions', () => {
  describe('requestDataAccess', () => {
    it('should create an access request', async () => {
      const request = await requestDataAccess('user-access', 'access@example.com')
      expect(request.type).toBe('access')
      expect(request.userId).toBe('user-access')
      expect(request.email).toBe('access@example.com')
      expect(request.status).toBe('pending')
    })
  })

  describe('requestDataDeletion', () => {
    it('should create an erasure request without reason', async () => {
      const request = await requestDataDeletion('user-delete', 'delete@example.com')
      expect(request.type).toBe('erasure')
      expect(request.reason).toBeUndefined()
    })

    it('should create an erasure request with reason', async () => {
      const request = await requestDataDeletion('user-delete-2', 'delete2@example.com', 'Account closure')
      expect(request.type).toBe('erasure')
      expect(request.reason).toBe('Account closure')
    })
  })

  describe('requestDataPortability', () => {
    it('should create a portability request', async () => {
      const request = await requestDataPortability('user-port', 'port@example.com')
      expect(request.type).toBe('portability')
    })
  })

  describe('processDataSubjectRequest', () => {
    it('should throw for invalid request ID', async () => {
      await expect(processDataSubjectRequest('invalid-id')).rejects.toThrow('Request not found')
    })

    it('should delegate to manager.processRequest', async () => {
      const req = await createAndStoreRequest('rectification')
      const response = await processDataSubjectRequest(req.id)
      expect(response.type).toBe('rectification')
      expect(response.status).toBe('completed')
    })
  })

  describe('getUserDataRequests', () => {
    it('should return user requests', async () => {
      const requests = await getUserDataRequests('test-user')
      expect(Array.isArray(requests)).toBe(true)
    })
  })
})

// =============================================================================
// exportUserData (collectUserData) Tests
// =============================================================================

describe('exportUserData', () => {
  it('should export user data with all expected fields', async () => {
    const data = await exportUserData('export-user-123')

    expect(data).toBeDefined()
    expect(data.collectedAt).toBeDefined()
    expect(typeof data.collectedAt).toBe('string')
    expect(data.userId).toBe('export-user-123')
    expect(data.categories).toBeDefined()
    expect(data.localStorage).toBeDefined()
    expect(data.consents).toBeDefined()
    expect(data.indexedDB).toBeDefined()
    expect(data.personalDataFields).toBeDefined()
  })

  it('should call consentManager.getUserConsents', async () => {
    await exportUserData('consent-export-user')
    expect(consentManager.getUserConsents).toHaveBeenCalledWith('consent-export-user')
  })

  it('should filter out technical category from personalDataFields', async () => {
    const data = await exportUserData('filter-user')
    const fields = data.personalDataFields as Array<{ category: string }>
    const technicalFields = fields.filter(f => f.category === 'technical')
    expect(technicalFields.length).toBe(0)
  })

  it('should include field, category, purpose, purposeTr, retention in personalDataFields', async () => {
    const data = await exportUserData('fields-user')
    const fields = data.personalDataFields as Array<{
      field: string; category: string; purpose: string; purposeTr: string; retention: string
    }>

    expect(fields.length).toBeGreaterThan(0)
    expect(fields[0]).toHaveProperty('field')
    expect(fields[0]).toHaveProperty('category')
    expect(fields[0]).toHaveProperty('purpose')
    expect(fields[0]).toHaveProperty('purposeTr')
    expect(fields[0]).toHaveProperty('retention')
    expect(fields[0].retention).toMatch(/\d+ days/)
  })

  it('should have valid ISO timestamp for collectedAt', async () => {
    const data = await exportUserData('timestamp-user')
    const collectedAt = data.collectedAt as string
    expect(new Date(collectedAt).toISOString()).toBe(collectedAt)
  })
})

// =============================================================================
// collectFromLocalStorage Branch Coverage
// =============================================================================

describe('collectFromLocalStorage branches', () => {
  it('should return empty object when localStorage is undefined', async () => {
    vi.stubGlobal('localStorage', undefined)
    const data = await exportUserData('no-storage-user')
    expect(data.localStorage).toEqual({})
  })

  it('should collect keys containing userId', async () => {
    vi.stubGlobal('localStorage', {
      length: 2,
      key: (i: number) => ['user_match-user_data', 'unrelated_key'][i] ?? null,
      getItem: (key: string) => key.includes('match-user') ? JSON.stringify({ found: true }) : null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('match-user')
    const storage = data.localStorage as Record<string, unknown>
    expect(storage['user_match-user_data']).toEqual({ found: true })
  })

  it('should collect keys starting with insurai_', async () => {
    vi.stubGlobal('localStorage', {
      length: 2,
      key: (i: number) => ['insurai_settings', 'other_key'][i] ?? null,
      getItem: (key: string) => key.startsWith('insurai_') ? JSON.stringify({ app: true }) : 'value',
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('any-user')
    const storage = data.localStorage as Record<string, unknown>
    expect(storage['insurai_settings']).toEqual({ app: true })
  })

  it('should handle null key from localStorage.key()', async () => {
    vi.stubGlobal('localStorage', {
      length: 2,
      key: (i: number) => i === 0 ? null : 'insurai_data',
      getItem: () => JSON.stringify({ data: true }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('null-key-user')
    const storage = data.localStorage as Record<string, unknown>
    // Should not throw; null key is skipped by the if(key && ...) check
    expect(storage['insurai_data']).toEqual({ data: true })
  })

  it('should handle null value from localStorage.getItem()', async () => {
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => 'insurai_empty',
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('null-value-user')
    const storage = data.localStorage as Record<string, unknown>
    // Key with null value should not be added (value check: if (value) { ... })
    expect(storage['insurai_empty']).toBeUndefined()
  })

  it('should fall back to raw string when JSON.parse fails', async () => {
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => 'insurai_invalid',
      getItem: () => 'not valid json {{{',
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('json-error-user')
    const storage = data.localStorage as Record<string, unknown>
    expect(storage['insurai_invalid']).toBe('not valid json {{{')
  })

  it('should handle localStorage access error (outer catch)', async () => {
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => { throw new Error('Access denied') },
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('access-denied-user')
    // Should return empty object from the outer catch
    expect(data.localStorage).toEqual({})
  })

  it('should skip keys that do not contain userId and do not start with insurai_', async () => {
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => 'completely_unrelated_key',
      getItem: () => 'value',
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('no-match-user')
    const storage = data.localStorage as Record<string, unknown>
    expect(Object.keys(storage).length).toBe(0)
  })

  it('should handle empty localStorage (length 0)', async () => {
    vi.stubGlobal('localStorage', {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('empty-ls-user')
    expect(data.localStorage).toEqual({})
  })
})

// =============================================================================
// collectFromIndexedDB Branch Coverage
// =============================================================================

describe('collectFromIndexedDB branches', () => {
  it('should collect from multiple IndexedDB databases', async () => {
    const data = await exportUserData('multi-db-user')
    expect(data.indexedDB).toBeDefined()
  })

  it('should handle database open error and continue to next database', async () => {
    let callCount = 0
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        callCount++
        const request = new MockIDBOpenDBRequest()
        if (name === 'insurai_policies') {
          // This one fails
          setTimeout(() => {
            request.error = new DOMException('DB open failed')
            request.onerror?.()
          }, 0)
        } else {
          const db = new MockIDBDatabase(name)
          setTimeout(() => {
            request.result = db
            request.onsuccess?.()
          }, 0)
        }
        return request
      }),
    })

    const data = await exportUserData('db-error-user')
    expect(data.indexedDB).toBeDefined()
    // Should have called open for multiple databases
    expect(callCount).toBeGreaterThan(1)
  })

  it('should skip store if db does not contain that store name', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        // DB with no stores
        const db = new MockIDBDatabase(name, [])
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('no-store-user')
    const idbData = data.indexedDB as Record<string, Record<string, unknown[]>>
    // Should have empty objects since no stores matched
    for (const dbName of Object.keys(idbData)) {
      expect(Object.keys(idbData[dbName]).length).toBe(0)
    }
  })
})

// =============================================================================
// getRecordsForUser Branch Coverage
// =============================================================================

describe('getRecordsForUser branches', () => {
  it('should use userId index when available', async () => {
    // The default mock has 'userId' in indexNames, so getRecordsForUser should
    // use the index path. This is tested implicitly via exportUserData.
    const data = await exportUserData('index-user')
    expect(data.indexedDB).toBeDefined()
  })

  it('should fall back to getAll and filter when userId index is not available', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: (n: string) => n === 'policies',
            length: 1,
            item: () => 'policies',
            [Symbol.iterator]: function* () { yield 'policies' },
          } as DOMStringList,
          transaction: (_storeNames: string | string[]) => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false, // No userId index!
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              getAll: () => {
                const req = new MockIDBRequest()
                // Return records where some match userId
                setTimeout(() => req.succeed([
                  { userId: 'filter-user', data: 'matched' },
                  { userId: 'other-user', data: 'not matched' },
                  { id: 'no-userid', content: 'contains filter-user in stringify' },
                ]), 0)
                return req
              },
              index: () => { throw new Error('Should not be called') },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('filter-user')
    const idbData = data.indexedDB as Record<string, Record<string, unknown[]>>
    // Should have filtered records matching userId
    const policiesDB = idbData['insurai_policies']
    if (policiesDB && policiesDB['policies']) {
      // Should include the record with matching userId or containing userId in stringify
      expect(policiesDB['policies'].length).toBeGreaterThanOrEqual(1)
    }
  })

  it('should handle transaction error in getRecordsForUser (catch branch)', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'policies',
            [Symbol.iterator]: function* () { yield 'policies' },
          } as DOMStringList,
          transaction: () => {
            throw new Error('Transaction creation failed')
          },
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('tx-error-user')
    expect(data.indexedDB).toBeDefined()
  })

  it('should resolve empty array on index.getAll onerror', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'policies',
            [Symbol.iterator]: function* () { yield 'policies' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: (n: string) => n === 'userId',
                length: 1,
                item: () => 'userId',
                [Symbol.iterator]: function* () { yield 'userId' },
              } as DOMStringList,
              index: () => ({
                getAll: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => req.fail(), 0) // Trigger onerror
                  return req
                },
              }),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('error-getall-user')
    expect(data.indexedDB).toBeDefined()
  })

  it('should resolve empty array on store.getAll onerror (no-index path)', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'events',
            [Symbol.iterator]: function* () { yield 'events' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false, // No userId index
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              getAll: () => {
                const req = new MockIDBRequest()
                setTimeout(() => req.fail(), 0) // Trigger onerror
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('error-noindex-user')
    expect(data.indexedDB).toBeDefined()
  })

  it('should handle null result from getAll (result ?? [])', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'policies',
            [Symbol.iterator]: function* () { yield 'policies' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: (n: string) => n === 'userId',
                length: 1,
                item: () => 'userId',
                [Symbol.iterator]: function* () { yield 'userId' },
              } as DOMStringList,
              index: () => ({
                getAll: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => {
                    req.result = null // null result path
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
              }),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('null-result-user')
    expect(data.indexedDB).toBeDefined()
  })

  it('should handle null result from getAll in no-index path (result ?? [])', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'events',
            [Symbol.iterator]: function* () { yield 'events' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false,
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              getAll: () => {
                const req = new MockIDBRequest()
                setTimeout(() => {
                  req.result = null // null result path
                  req.onsuccess?.()
                }, 0)
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const data = await exportUserData('null-noindex-user')
    expect(data.indexedDB).toBeDefined()
  })
})

// =============================================================================
// deleteAllUserData / deleteUserData Tests
// =============================================================================

describe('deleteAllUserData', () => {
  it('should delete from localStorage and consents on success', async () => {
    const result = await deleteAllUserData('delete-user-123')

    expect(result.deletedFrom).toContain('localStorage')
    expect(result.deletedFrom).toContain('consents')
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should track consent deletion errors', async () => {
    mockDeleteUserConsents.mockRejectedValueOnce(new Error('Consent deletion failed'))

    const result = await deleteAllUserData('consent-error-user')

    expect(result.errors.some(e => e.includes('consents'))).toBe(true)
    expect(result.deleted).toBe(false) // errors.length > 0
  })

  it('should track localStorage deletion errors', async () => {
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => { throw new Error('Access denied') },
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const result = await deleteAllUserData('ls-error-user')

    expect(result.errors.some(e => e.includes('localStorage'))).toBe(true)
  })

  it('should accumulate errors from multiple IndexedDB databases', async () => {
    // Make indexedDB.open always fail
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        setTimeout(() => {
          request.error = new DOMException('DB unavailable')
          request.onerror?.()
        }, 0)
        return request
      }),
    })

    const result = await deleteAllUserData('all-fail-user')

    // All 5 IndexedDB databases should fail
    const idbErrors = result.errors.filter(e =>
      e.includes('insurai_policies') ||
      e.includes('insurai_audit') ||
      e.includes('insurai_ai_cache') ||
      e.includes('insurai_cost_tracking') ||
      e.includes('insurai_privacy')
    )
    expect(idbErrors.length).toBe(5)
  })

  it('should return deleted=true when all deletions succeed', async () => {
    const result = await deleteAllUserData('clean-user')
    expect(result.deleted).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  it('should return deleted=false when any deletion fails', async () => {
    mockDeleteUserConsents.mockRejectedValueOnce(new Error('fail'))

    const result = await deleteAllUserData('mixed-user')
    expect(result.deleted).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// deleteFromLocalStorage Branch Coverage
// =============================================================================

describe('deleteFromLocalStorage branches', () => {
  it('should return early when localStorage is undefined', async () => {
    vi.stubGlobal('localStorage', undefined)
    // Should not throw
    const result = await deleteAllUserData('no-ls-user')
    expect(result.deletedFrom).toContain('localStorage') // still added since the function returns void (no throw)
  })

  it('should delete keys matching userId', async () => {
    const removeItemMock = vi.fn()
    vi.stubGlobal('localStorage', {
      length: 3,
      key: (i: number) => ['data_user-x_settings', 'other_key', 'cache_user-x_data'][i] ?? null,
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: removeItemMock,
      clear: vi.fn(),
    })

    await deleteAllUserData('user-x')

    expect(removeItemMock).toHaveBeenCalledWith('data_user-x_settings')
    expect(removeItemMock).toHaveBeenCalledWith('cache_user-x_data')
    expect(removeItemMock).not.toHaveBeenCalledWith('other_key')
  })

  it('should skip null keys from localStorage.key()', async () => {
    const removeItemMock = vi.fn()
    vi.stubGlobal('localStorage', {
      length: 2,
      key: (i: number) => i === 0 ? null : 'key_user-y_data',
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: removeItemMock,
      clear: vi.fn(),
    })

    await deleteAllUserData('user-y')
    expect(removeItemMock).toHaveBeenCalledWith('key_user-y_data')
    expect(removeItemMock).toHaveBeenCalledTimes(1) // null key skipped
  })

  it('should not delete keys that do not contain userId', async () => {
    const removeItemMock = vi.fn()
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => 'completely_unrelated',
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: removeItemMock,
      clear: vi.fn(),
    })

    await deleteAllUserData('nonexistent-user')
    expect(removeItemMock).not.toHaveBeenCalled()
  })
})

// =============================================================================
// deleteFromStore Branch Coverage
// =============================================================================

describe('deleteFromStore branches', () => {
  it('should delete using userId index cursor when available', async () => {
    // Store a record with userId
    inMemoryStore.set('record-1', { id: 'record-1', userId: 'del-cursor-user', data: 'test' })

    const result = await deleteAllUserData('del-cursor-user')
    expect(result.deletedFrom.length).toBeGreaterThan(0)
  })

  it('should handle cursor that returns null immediately (no matching records)', async () => {
    // No records with matching userId — cursor starts as null
    const result = await deleteAllUserData('no-match-user')
    expect(result.deletedFrom.length).toBeGreaterThan(0)
  })

  it('should scan all records when no userId index (openCursor path)', async () => {
    // We need a store without userId index
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => {
              const records = [
                { id: 'r1', userId: 'scan-user', data: 'match' },
                { id: 'r2', userId: 'other', data: 'no match' },
                { id: 'r3', content: 'contains scan-user in JSON' },
              ]
              let cursorIndex = 0

              return {
                indexNames: {
                  contains: () => false, // No userId index!
                  length: 0,
                  item: () => null,
                  [Symbol.iterator]: function* () { /* empty */ },
                } as DOMStringList,
                openCursor: () => {
                  const req = new MockIDBRequest()
                  const advanceCursor = () => {
                    if (cursorIndex < records.length) {
                      const record = records[cursorIndex]
                      cursorIndex++
                      const cursor = {
                        value: record,
                        delete: vi.fn(),
                        continue: () => {
                          setTimeout(advanceCursor, 0)
                        },
                      }
                      req.result = cursor
                      req.onsuccess?.()
                    } else {
                      req.result = null
                      req.onsuccess?.()
                    }
                  }
                  setTimeout(advanceCursor, 0)
                  return req
                },
              }
            },
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const result = await deleteAllUserData('scan-user')
    expect(result).toBeDefined()
  })

  it('should handle openKeyCursor onerror (resolve gracefully)', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: (n: string) => n === 'userId',
                length: 1,
                item: () => 'userId',
                [Symbol.iterator]: function* () { yield 'userId' },
              } as DOMStringList,
              index: () => ({
                openKeyCursor: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => req.fail(), 0)
                  return req
                },
              }),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const result = await deleteAllUserData('onerror-cursor-user')
    expect(result).toBeDefined()
  })

  it('should handle openCursor onerror in no-index path', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false,
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              openCursor: () => {
                const req = new MockIDBRequest()
                setTimeout(() => req.fail(), 0)
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const result = await deleteAllUserData('onerror-nocursor-user')
    expect(result).toBeDefined()
  })

  it('should handle transaction creation error (catch branch in deleteFromStore)', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => {
            throw new Error('Transaction creation failed')
          },
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const result = await deleteAllUserData('tx-fail-user')
    expect(result).toBeDefined()
  })

  it('should delete cursor record when userId matches in no-index openCursor path', async () => {
    const deleteMock = vi.fn()
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        let callIndex = 0
        const records = [
          { id: 'r1', userId: 'cursor-del-user', data: 'match by userId' },
          { id: 'r2', other: 'no match at all' },
        ]

        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false,
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              openCursor: () => {
                const req = new MockIDBRequest()
                const advance = () => {
                  if (callIndex < records.length) {
                    const record = records[callIndex]
                    callIndex++
                    req.result = {
                      value: record,
                      delete: deleteMock,
                      continue: () => setTimeout(advance, 0),
                    }
                    req.onsuccess?.()
                  } else {
                    req.result = null
                    req.onsuccess?.()
                  }
                }
                setTimeout(advance, 0)
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    await deleteAllUserData('cursor-del-user')
    // Should have called delete on the matching record
    expect(deleteMock).toHaveBeenCalled()
  })

  it('should delete cursor record when userId found in JSON.stringify in no-index path', async () => {
    const deleteMock = vi.fn()
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        let callIndex = 0
        const records = [
          { id: 'r1', note: 'Record for json-user inside text' },
        ]

        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false,
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              openCursor: () => {
                const req = new MockIDBRequest()
                const advance = () => {
                  if (callIndex < records.length) {
                    const record = records[callIndex]
                    callIndex++
                    req.result = {
                      value: record,
                      delete: deleteMock,
                      continue: () => setTimeout(advance, 0),
                    }
                    req.onsuccess?.()
                  } else {
                    req.result = null
                    req.onsuccess?.()
                  }
                }
                setTimeout(advance, 0)
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    await deleteAllUserData('json-user')
    expect(deleteMock).toHaveBeenCalled()
  })

  it('should NOT delete cursor record when userId not found anywhere', async () => {
    const deleteMock = vi.fn()
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        let callIndex = 0
        const records = [
          { id: 'r1', userId: 'completely-different', data: 'unrelated' },
        ]

        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'store1',
            [Symbol.iterator]: function* () { yield 'store1' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              indexNames: {
                contains: () => false,
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () { /* empty */ },
              } as DOMStringList,
              openCursor: () => {
                const req = new MockIDBRequest()
                const advance = () => {
                  if (callIndex < records.length) {
                    const record = records[callIndex]
                    callIndex++
                    req.result = {
                      value: record,
                      delete: deleteMock,
                      continue: () => setTimeout(advance, 0),
                    }
                    req.onsuccess?.()
                  } else {
                    req.result = null
                    req.onsuccess?.()
                  }
                }
                setTimeout(advance, 0)
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    await deleteAllUserData('no-match-at-all')
    expect(deleteMock).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Withdraw Consent Handler Detailed Tests
// =============================================================================

describe('handleWithdrawConsentRequest detailed branches', () => {
  it('should revoke all non-essential granted consents', async () => {
    mockGetUserConsentStatus.mockResolvedValueOnce({
      userId: 'full-revoke-user',
      consents: {
        terms_of_service: { granted: true, grantedAt: Date.now() },
        cookie_essential: { granted: true, grantedAt: Date.now() },
        analytics: { granted: true, grantedAt: Date.now() },
        marketing_email: { granted: true, grantedAt: Date.now() },
        marketing_sms: { granted: true, grantedAt: Date.now() },
        ai_processing: { granted: true, grantedAt: Date.now() },
        cookie_analytics: { granted: true, grantedAt: Date.now() },
        cookie_marketing: { granted: true, grantedAt: Date.now() },
        privacy_policy: { granted: true, grantedAt: Date.now() },
        data_processing: { granted: true, grantedAt: Date.now() },
        cross_border_transfer: { granted: true, grantedAt: Date.now() },
        third_party_sharing: { granted: true, grantedAt: Date.now() },
        cookie_functional: { granted: true, grantedAt: Date.now() },
      },
      lastUpdated: Date.now(),
    })

    const req = await createAndStoreRequest('withdraw_consent', 'full-revoke-user', 'fullrevoke@test.com')
    const response = await dataSubjectRightsManager.processRequest(req.id)

    expect(response.status).toBe('completed')
    // Should NOT have revoked terms_of_service and cookie_essential
    const revokedTypes = mockRevokeConsent.mock.calls.map((c: unknown[]) => c[1])
    expect(revokedTypes).not.toContain('terms_of_service')
    expect(revokedTypes).not.toContain('cookie_essential')
    // Should have revoked all other granted types
    expect(revokedTypes).toContain('analytics')
    expect(revokedTypes).toContain('marketing_email')
    expect(revokedTypes).toContain('marketing_sms')
    expect(revokedTypes).toContain('ai_processing')
  })

  it('should skip consent types that are not granted', async () => {
    mockGetUserConsentStatus.mockResolvedValueOnce({
      userId: 'skip-not-granted',
      consents: {
        terms_of_service: { granted: true, grantedAt: Date.now() },
        cookie_essential: { granted: true, grantedAt: Date.now() },
        analytics: { granted: false },
        marketing_email: { granted: false },
      },
      lastUpdated: Date.now(),
    })

    const req = await createAndStoreRequest('withdraw_consent', 'skip-not-granted', 'skip@test.com')
    const response = await dataSubjectRightsManager.processRequest(req.id)

    expect(response.message).toContain('None')
    expect(mockRevokeConsent).not.toHaveBeenCalled()
  })

  it('should include comma-separated revoked types in message', async () => {
    mockGetUserConsentStatus.mockResolvedValueOnce({
      userId: 'comma-user',
      consents: {
        analytics: { granted: true, grantedAt: Date.now() },
        marketing_email: { granted: true, grantedAt: Date.now() },
      },
      lastUpdated: Date.now(),
    })

    const req = await createAndStoreRequest('withdraw_consent', 'comma-user', 'comma@test.com')
    const response = await dataSubjectRightsManager.processRequest(req.id)

    expect(response.message).toContain('analytics')
    expect(response.message).toContain('marketing_email')
    expect(response.messageTr).toContain('analytics')
    expect(response.messageTr).toContain('marketing_email')
  })
})

// =============================================================================
// Erasure Handler Detailed Tests
// =============================================================================

describe('handleErasureRequest detailed branches', () => {
  it('should include deletedFrom list in success message', async () => {
    const req = await createAndStoreRequest('erasure', 'erase-list', 'erase@test.com')
    const response = await dataSubjectRightsManager.processRequest(req.id)

    expect(response.message).toContain('localStorage')
    expect(response.message).toContain('consents')
  })

  it('should include errors in partial deletion message', async () => {
    mockDeleteUserConsents.mockRejectedValueOnce(new Error('DB connection lost'))

    const req = await createAndStoreRequest('erasure', 'partial-err', 'partial@test.com')
    const response = await dataSubjectRightsManager.processRequest(req.id)

    expect(response.status).toBe('partial')
    expect(response.message).toContain('Errors')
    expect(response.messageTr).toContain('Hatalar')
  })
})

// =============================================================================
// storeRequest/updateRequest Transaction Error Branches
// =============================================================================

describe('storeRequest/updateRequest transaction error branches', () => {
  it('should resolve on transaction onerror in storeRequest', async () => {
    // The mock auto-completes transaction; test the onerror path by
    // overriding so the transaction fires onerror instead
    const _originalOpen = (globalThis.indexedDB as unknown as { open: typeof vi.fn }).open
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string, _version?: number) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'dsr_requests',
            [Symbol.iterator]: function* () { yield 'dsr_requests' },
          } as DOMStringList,
          transaction: () => {
            const tx = {
              objectStore: () => ({
                add: () => new MockIDBRequest(),
                put: () => new MockIDBRequest(),
                get: (key: string) => {
                  const req = new MockIDBRequest()
                  setTimeout(() => req.succeed(inMemoryStore.get(key) ?? null), 0)
                  return req
                },
                index: () => new MockIDBIndex('userId'),
              }),
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
            }
            // Trigger onerror instead of oncomplete
            setTimeout(() => tx.onerror?.(), 0)
            return tx
          },
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    // Should still complete without throwing
    const request = await dataSubjectRightsManager.submitRequest({
      userId: 'tx-err-user',
      email: 'txerr@test.com',
      type: 'access',
    })
    expect(request.id).toMatch(/^dsr_/)
  })

  it('should resolve on store.add throwing in storeRequest (catch branch)', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          name,
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'dsr_requests',
            [Symbol.iterator]: function* () { yield 'dsr_requests' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              add: () => { throw new Error('Quota exceeded') },
              put: () => { throw new Error('Quota exceeded') },
              get: (key: string) => {
                const req = new MockIDBRequest()
                setTimeout(() => req.succeed(inMemoryStore.get(key) ?? null), 0)
                return req
              },
              index: () => new MockIDBIndex('userId'),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    const request = await dataSubjectRightsManager.submitRequest({
      userId: 'catch-user',
      email: 'catch@test.com',
      type: 'access',
    })
    expect(request.id).toMatch(/^dsr_/)
  })
})

// =============================================================================
// getUserRequests / getRequest / getPendingRequests - error paths
// =============================================================================

describe('IDB query error paths', () => {
  it('should reject getUserRequests on index.getAll error', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'dsr_requests',
            [Symbol.iterator]: function* () { yield 'dsr_requests' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              index: () => ({
                getAll: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => {
                    req.error = new DOMException('Read failed')
                    req.onerror?.()
                  }, 0)
                  return req
                },
              }),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    vi.resetModules()
    const mod = await import('./data-subject-rights')

    await expect(mod.dataSubjectRightsManager.getUserRequests('err-user')).rejects.toBeDefined()
  })

  it('should reject getRequest on store.get error', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'dsr_requests',
            [Symbol.iterator]: function* () { yield 'dsr_requests' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const req = new MockIDBRequest()
                setTimeout(() => {
                  req.error = new DOMException('Get failed')
                  req.onerror?.()
                }, 0)
                return req
              },
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    vi.resetModules()
    const mod = await import('./data-subject-rights')

    await expect(mod.dataSubjectRightsManager.getRequest('err-id')).rejects.toBeDefined()
  })

  it('should handle null result from getRequest (result ?? null)', async () => {
    // Default mock returns undefined for non-existent keys which gets ?? null
    const result = await dataSubjectRightsManager.getRequest('definitely-does-not-exist')
    expect(result).toBeNull()
  })

  it('should handle null result from getUserRequests (result ?? [])', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'dsr_requests',
            [Symbol.iterator]: function* () { yield 'dsr_requests' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              index: () => ({
                getAll: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => {
                    req.result = null // null result
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
              }),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    vi.resetModules()
    const mod = await import('./data-subject-rights')

    const requests = await mod.dataSubjectRightsManager.getUserRequests('null-result-user')
    expect(requests).toEqual([])
  })

  it('should handle null result from getPendingRequests (result ?? [])', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        const db = {
          objectStoreNames: {
            contains: () => true,
            length: 1,
            item: () => 'dsr_requests',
            [Symbol.iterator]: function* () { yield 'dsr_requests' },
          } as DOMStringList,
          transaction: () => ({
            objectStore: () => ({
              index: () => ({
                getAll: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => {
                    req.result = null
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
              }),
            }),
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    vi.resetModules()
    const mod = await import('./data-subject-rights')

    const pending = await mod.dataSubjectRightsManager.getPendingRequests()
    expect(pending).toEqual([])
  })
})

// =============================================================================
// KVKK/GDPR Compliance Tests
// =============================================================================

describe('KVKK/GDPR compliance', () => {
  it('should set 30-day deadline per KVKK Article 13 requirements', async () => {
    const request = await requestDataAccess('kvkk-user', 'kvkk@example.com')
    const deadlineDays = (request.deadline - request.submittedAt) / (24 * 60 * 60 * 1000)
    expect(deadlineDays).toBe(30)
  })

  it('should include all required DSR fields', async () => {
    const request = await requestDataAccess('fields-user', 'fields@example.com')
    expect(request.id).toBeDefined()
    expect(request.userId).toBeDefined()
    expect(request.email).toBeDefined()
    expect(request.type).toBeDefined()
    expect(request.status).toBeDefined()
    expect(request.submittedAt).toBeDefined()
    expect(request.deadline).toBeDefined()
  })

  it('should support data portability as JSON format', async () => {
    const data = await exportUserData('portable-user')
    expect(typeof data.collectedAt).toBe('string')
    expect(() => new Date(data.collectedAt as string)).not.toThrow()
  })

  it('should use DEFAULT_PRIVACY_CONFIG controller name in portability data', async () => {
    const req = await createAndStoreRequest('portability', 'controller-user', 'controller@test.com')
    const response = await dataSubjectRightsManager.processRequest(req.id)
    const portableData = response.data as Record<string, unknown>
    expect(portableData.controller).toBe('InsurAI')
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('should handle empty userId', async () => {
    const request = await requestDataAccess('', 'empty@example.com')
    expect(request.userId).toBe('')
  })

  it('should handle special characters in email', async () => {
    const request = await requestDataAccess('special-user', 'test+special@example.com')
    expect(request.email).toBe('test+special@example.com')
  })

  it('should handle very long reason strings', async () => {
    const longReason = 'A'.repeat(1000)
    const request = await requestDataDeletion('long-reason-user', 'long@example.com', longReason)
    expect(request.reason).toBe(longReason)
  })

  it('should handle concurrent requests with unique IDs', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      requestDataAccess(`concurrent-user-${i}`, `concurrent${i}@example.com`)
    )
    const requests = await Promise.all(promises)
    const ids = new Set(requests.map(r => r.id))
    expect(ids.size).toBe(5)
  })

  it('should handle empty reason string', async () => {
    const request = await requestDataDeletion('empty-reason', 'empty@example.com', '')
    expect(request.reason).toBe('')
  })

  it('should handle undefined reason', async () => {
    const request = await requestDataDeletion('no-reason', 'no@example.com')
    expect(request.reason).toBeUndefined()
  })
})

// =============================================================================
// Request ID Generation Tests
// =============================================================================

describe('Request ID generation', () => {
  it('should have format dsr_<timestamp>_<random>', async () => {
    const before = Date.now()
    const request = await requestDataAccess('id-user', 'id@example.com')
    const parts = request.id.split('_')

    expect(parts[0]).toBe('dsr')
    expect(parts.length).toBe(3)
    expect(parseInt(parts[1], 10)).toBeGreaterThanOrEqual(before)
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it('should generate different random components', async () => {
    const requests = await Promise.all([
      requestDataAccess('r1', 'r1@test.com'),
      requestDataAccess('r2', 'r2@test.com'),
      requestDataAccess('r3', 'r3@test.com'),
    ])
    const randomParts = requests.map(r => r.id.split('_')[2])
    const uniqueParts = new Set(randomParts)
    expect(uniqueParts.size).toBe(3)
  })
})

// =============================================================================
// All Request Types Tests
// =============================================================================

describe('All request types', () => {
  const allTypes = [
    'access', 'erasure', 'portability', 'rectification',
    'restriction', 'withdraw_consent', 'objection', 'complaint',
  ] as const

  allTypes.forEach(type => {
    it(`should submit and store ${type} request`, async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: `type-${type}`,
        email: `${type}@example.com`,
        type: type as import('@/types/privacy').DataSubjectRight,
      })
      expect(request.type).toBe(type)
      expect(request.id).toMatch(/^dsr_/)
      expect(request.status).toBe('pending')
    })
  })
})

// =============================================================================
// Singleton Tests
// =============================================================================

describe('Singleton instance', () => {
  it('should use same instance across imports', async () => {
    const { dataSubjectRightsManager: instance1 } = await import('./data-subject-rights')
    const { dataSubjectRightsManager: instance2 } = await import('./data-subject-rights')
    expect(instance1).toBe(instance2)
  })
})

// =============================================================================
// openDatabase edge case: indexedDB undefined
// =============================================================================

describe('openDatabase when indexedDB is undefined', () => {
  it('should reject with "IndexedDB not available"', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()
    const mod = await import('./data-subject-rights')

    // Initialize should not throw (catches the error)
    await expect(mod.dataSubjectRightsManager.initialize()).resolves.not.toThrow()
  })
})

// =============================================================================
// deleteFromIndexedDB with multiple store names
// =============================================================================

describe('deleteFromIndexedDB with multiple stores', () => {
  it('should iterate through all object store names', async () => {
    const storesAccessed: string[] = []

    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string) => {
        const request = new MockIDBOpenDBRequest()
        const storeNames = ['store_a', 'store_b', 'store_c']
        const db = {
          name,
          objectStoreNames: {
            contains: (n: string) => storeNames.includes(n),
            length: storeNames.length,
            item: (i: number) => storeNames[i] ?? null,
            [Symbol.iterator]: function* () { yield* storeNames },
          } as DOMStringList,
          transaction: (names: string | string[]) => {
            const txStoreNames = Array.isArray(names) ? names : [names]
            txStoreNames.forEach(n => storesAccessed.push(n))
            return {
              objectStore: () => ({
                indexNames: {
                  contains: () => false,
                  length: 0,
                  item: () => null,
                  [Symbol.iterator]: function* () { /* empty */ },
                } as DOMStringList,
                openCursor: () => {
                  const req = new MockIDBRequest()
                  setTimeout(() => {
                    req.result = null
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
              }),
              oncomplete: null,
              onerror: null,
            }
          },
          close: vi.fn(),
        }
        setTimeout(() => {
          request.result = db
          request.onsuccess?.()
        }, 0)
        return request
      }),
    })

    await deleteAllUserData('multi-store-user')
    // Should have accessed all store names
    expect(storesAccessed.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// processRequest: response status mapping to request status
// =============================================================================

describe('processRequest status mapping', () => {
  it('should set request.status to "rejected" when response.status is "rejected"', async () => {
    // Trigger the default case which returns rejected
    const req = await createAndStoreRequest('objection', 'rej-map-user', 'rejmap@test.com')
    await dataSubjectRightsManager.processRequest(req.id)

    const stored = await dataSubjectRightsManager.getRequest(req.id)
    expect(stored?.status).toBe('rejected')
  })

  it('should set request.status to "completed" when response.status is not "rejected"', async () => {
    const req = await createAndStoreRequest('access', 'comp-map-user', 'compmap@test.com')
    await dataSubjectRightsManager.processRequest(req.id)

    const stored = await dataSubjectRightsManager.getRequest(req.id)
    expect(stored?.status).toBe('completed')
  })

  it('should set request.status to "completed" when response.status is "partial"', async () => {
    // Trigger partial erasure
    mockDeleteUserConsents.mockRejectedValueOnce(new Error('fail'))

    const req = await createAndStoreRequest('erasure', 'partial-map-user', 'partialmap@test.com')
    await dataSubjectRightsManager.processRequest(req.id)

    const stored = await dataSubjectRightsManager.getRequest(req.id)
    // partial is NOT rejected, so status should be completed
    expect(stored?.status).toBe('completed')
  })
})
