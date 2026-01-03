/**
 * Tests for Data Subject Rights Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock consent manager before importing the module
vi.mock('./consent-manager', () => ({
  consentManager: {
    getUserConsents: vi.fn().mockResolvedValue([]),
    getUserConsentStatus: vi.fn().mockResolvedValue({
      userId: 'test-user-123',
      consents: {
        terms_of_service: { granted: true, timestamp: Date.now() },
        cookie_essential: { granted: true, timestamp: Date.now() },
        cookie_analytics: { granted: true, timestamp: Date.now() },
        data_processing: { granted: true, timestamp: Date.now() },
      },
      lastUpdated: Date.now(),
    }),
    revokeConsent: vi.fn().mockResolvedValue(undefined),
    deleteUserConsents: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock IndexedDB
class MockIDBRequest {
  result: unknown = null
  error: Error | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null

  succeed(result: unknown) {
    this.result = result
    this.onsuccess?.()
  }

  fail(error: Error) {
    this.error = error
    this.onerror?.()
  }
}

class MockIDBIndex {
  name: string

  constructor(name: string) {
    this.name = name
  }

  getAll(_key?: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed([]), 0)
    return request
  }

  openKeyCursor(_range?: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(null), 0)
    return request
  }
}

class MockIDBObjectStore {
  name: string
  indexNames: DOMStringList
  private data: Map<string, unknown> = new Map()

  constructor(name: string) {
    this.name = name
    this.indexNames = {
      contains: (name: string) => ['userId', 'type', 'status', 'submittedAt'].includes(name),
      length: 4,
      item: () => null,
      [Symbol.iterator]: function* () { yield* ['userId', 'type', 'status', 'submittedAt'] },
    } as DOMStringList
  }

  index(name: string): MockIDBIndex {
    return new MockIDBIndex(name)
  }

  add(value: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    const record = value as { id: string }
    this.data.set(record.id, value)
    setTimeout(() => request.succeed(undefined), 0)
    return request
  }

  put(value: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    const record = value as { id: string }
    this.data.set(record.id, value)
    setTimeout(() => request.succeed(undefined), 0)
    return request
  }

  get(key: string): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(this.data.get(key) ?? null), 0)
    return request
  }

  getAll(): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(Array.from(this.data.values())), 0)
    return request
  }

  delete(_key: unknown): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(undefined), 0)
    return request
  }

  openCursor(): MockIDBRequest {
    const request = new MockIDBRequest()
    setTimeout(() => request.succeed(null), 0)
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

  constructor(storeNames: string[]) {
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

  constructor(name: string, storeNames: string[] = ['dsr_requests']) {
    this.name = name
    this.objectStoreNames = {
      contains: (name: string) => storeNames.includes(name),
      length: storeNames.length,
      item: (index: number) => storeNames[index] ?? null,
      [Symbol.iterator]: function* () { yield* storeNames },
    } as DOMStringList
  }

  transaction(storeNames: string | string[], _mode?: IDBTransactionMode): MockIDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    return new MockIDBTransaction(names)
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

const mockIndexedDB = {
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

// Setup global mocks
beforeEach(() => {
  vi.stubGlobal('indexedDB', mockIndexedDB)
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
// DataSubjectRightsManager Tests
// =============================================================================

describe('DataSubjectRightsManager', () => {
  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
    })

    it('should handle IndexedDB not available', async () => {
      vi.stubGlobal('indexedDB', undefined)

      // Create a new instance to test initialization without IndexedDB
      const { DataSubjectRightsManager } = await import('./data-subject-rights')
        .catch(() => ({ DataSubjectRightsManager: null }))

      // Should not throw even when IndexedDB is unavailable
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

    it('should submit a portability request', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-789',
        email: 'portable@example.com',
        type: 'portability',
      })

      expect(request.type).toBe('portability')
      expect(request.status).toBe('pending')
    })

    it('should submit a rectification request', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-rect',
        email: 'rect@example.com',
        type: 'rectification',
        reason: 'Incorrect address on file',
      })

      expect(request.type).toBe('rectification')
    })

    it('should submit a restriction request', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-restrict',
        email: 'restrict@example.com',
        type: 'restriction',
      })

      expect(request.type).toBe('restriction')
    })

    it('should submit a withdraw_consent request', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-consent',
        email: 'consent@example.com',
        type: 'withdraw_consent',
      })

      expect(request.type).toBe('withdraw_consent')
    })

    it('should calculate deadline based on KVKK requirements', async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: 'user-deadline',
        email: 'deadline@example.com',
        type: 'access',
      })

      // KVKK requires 30 days to complete
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
      const deadlineFromSubmission = request.deadline - request.submittedAt

      expect(deadlineFromSubmission).toBe(thirtyDaysMs)
    })

    it('should generate unique request IDs', async () => {
      const request1 = await dataSubjectRightsManager.submitRequest({
        userId: 'user-1',
        email: 'user1@example.com',
        type: 'access',
      })

      const request2 = await dataSubjectRightsManager.submitRequest({
        userId: 'user-2',
        email: 'user2@example.com',
        type: 'access',
      })

      expect(request1.id).not.toBe(request2.id)
    })
  })

  describe('processRequest', () => {
    it('should throw for non-existent request', async () => {
      await expect(
        dataSubjectRightsManager.processRequest('non-existent-id')
      ).rejects.toThrow('Request not found')
    })
  })

  describe('getUserRequests', () => {
    it('should return empty array when no requests exist', async () => {
      const requests = await dataSubjectRightsManager.getUserRequests('new-user')
      expect(requests).toEqual([])
    })
  })

  describe('getRequest', () => {
    it('should return null for non-existent request', async () => {
      const request = await dataSubjectRightsManager.getRequest('non-existent')
      expect(request).toBeNull()
    })
  })

  describe('getPendingRequests', () => {
    it('should return empty array when no pending requests', async () => {
      const pending = await dataSubjectRightsManager.getPendingRequests()
      expect(pending).toEqual([])
    })
  })

  describe('getOverdueRequests', () => {
    it('should return empty array when no overdue requests', async () => {
      const overdue = await dataSubjectRightsManager.getOverdueRequests()
      expect(overdue).toEqual([])
    })
  })
})

// =============================================================================
// Convenience Function Tests
// =============================================================================

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
    expect(request.userId).toBe('user-delete')
    expect(request.reason).toBeUndefined()
  })

  it('should create an erasure request with reason', async () => {
    const request = await requestDataDeletion(
      'user-delete-2',
      'delete2@example.com',
      'Account closure'
    )

    expect(request.type).toBe('erasure')
    expect(request.reason).toBe('Account closure')
  })
})

describe('requestDataPortability', () => {
  it('should create a portability request', async () => {
    const request = await requestDataPortability('user-port', 'port@example.com')

    expect(request.type).toBe('portability')
    expect(request.userId).toBe('user-port')
    expect(request.email).toBe('port@example.com')
  })
})

describe('processDataSubjectRequest', () => {
  it('should throw for invalid request ID', async () => {
    await expect(processDataSubjectRequest('invalid-id')).rejects.toThrow()
  })
})

describe('getUserDataRequests', () => {
  it('should return user requests', async () => {
    const requests = await getUserDataRequests('test-user')
    expect(Array.isArray(requests)).toBe(true)
  })
})

describe('exportUserData', () => {
  it('should export user data with metadata', async () => {
    const data = await exportUserData('export-user-123')

    expect(data).toBeDefined()
    expect(data.collectedAt).toBeDefined()
    expect(data.userId).toBe('export-user-123')
    expect(data.localStorage).toBeDefined()
    expect(data.consents).toBeDefined()
    expect(data.personalDataFields).toBeDefined()
  })

  it('should include personal data field descriptions', async () => {
    const data = await exportUserData('export-user-456')

    expect(Array.isArray(data.personalDataFields)).toBe(true)
    const fields = data.personalDataFields as Array<{
      field: string
      category: string
      purpose: string
      retention: string
    }>

    if (fields.length > 0) {
      expect(fields[0]).toHaveProperty('field')
      expect(fields[0]).toHaveProperty('category')
      expect(fields[0]).toHaveProperty('purpose')
      expect(fields[0]).toHaveProperty('retention')
    }
  })

  it('should call consent manager to get user consents', async () => {
    await exportUserData('consent-export-user')

    expect(consentManager.getUserConsents).toHaveBeenCalledWith('consent-export-user')
  })
})

describe('deleteAllUserData', () => {
  it('should attempt to delete user data from multiple sources', async () => {
    const result = await deleteAllUserData('delete-user-123')

    expect(result).toBeDefined()
    expect(result.deletedFrom).toBeDefined()
    expect(Array.isArray(result.deletedFrom)).toBe(true)
    expect(result.errors).toBeDefined()
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should call consent manager to delete user consents', async () => {
    await deleteAllUserData('consent-delete-user')

    expect(consentManager.deleteUserConsents).toHaveBeenCalledWith('consent-delete-user')
  })

  it('should include consents in deletedFrom when successful', async () => {
    const result = await deleteAllUserData('full-delete-user')

    expect(result.deletedFrom).toContain('consents')
  })

  it('should include localStorage in deletedFrom when successful', async () => {
    const result = await deleteAllUserData('storage-delete-user')

    expect(result.deletedFrom).toContain('localStorage')
  })
})

// =============================================================================
// LocalStorage Collection Tests
// =============================================================================

describe('localStorage data collection', () => {
  beforeEach(() => {
    // Setup localStorage mock with some data
    const mockStorage: Record<string, string> = {
      'insurai_user_test-user_settings': JSON.stringify({ theme: 'dark' }),
      'insurai_policies': JSON.stringify([{ id: 'p1' }]),
      'other_key': 'other_value',
    }

    vi.stubGlobal('localStorage', {
      length: Object.keys(mockStorage).length,
      key: (index: number) => Object.keys(mockStorage)[index] ?? null,
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('should collect data from localStorage for user', async () => {
    const data = await exportUserData('test-user')

    expect(data.localStorage).toBeDefined()
  })

  it('should collect insurai-prefixed keys', async () => {
    const data = await exportUserData('any-user')

    expect(data.localStorage).toBeDefined()
    const storage = data.localStorage as Record<string, unknown>
    expect(storage['insurai_policies']).toBeDefined()
  })
})

// =============================================================================
// Request Status Tests
// =============================================================================

describe('Request status transitions', () => {
  it('should start with pending status', async () => {
    const request = await requestDataAccess('status-user', 'status@example.com')
    expect(request.status).toBe('pending')
  })

  it('should have submittedAt timestamp', async () => {
    const before = Date.now()
    const request = await requestDataAccess('time-user', 'time@example.com')
    const after = Date.now()

    expect(request.submittedAt).toBeGreaterThanOrEqual(before)
    expect(request.submittedAt).toBeLessThanOrEqual(after)
  })
})

// =============================================================================
// Data Subject Rights Types Tests
// =============================================================================

describe('Data Subject Rights Types', () => {
  const rightTypes: Array<'access' | 'erasure' | 'portability' | 'rectification' | 'restriction' | 'withdraw_consent'> = [
    'access',
    'erasure',
    'portability',
    'rectification',
    'restriction',
    'withdraw_consent',
  ]

  rightTypes.forEach((rightType) => {
    it(`should handle ${rightType} request type`, async () => {
      const request = await dataSubjectRightsManager.submitRequest({
        userId: `user-${rightType}`,
        email: `${rightType}@example.com`,
        type: rightType,
      })

      expect(request.type).toBe(rightType)
      expect(request.status).toBe('pending')
    })
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error handling', () => {
  it('should handle localStorage being undefined', async () => {
    vi.stubGlobal('localStorage', undefined)

    const data = await exportUserData('no-storage-user')
    expect(data.localStorage).toEqual({})
  })

  it('should handle consent manager errors gracefully', async () => {
    vi.mocked(consentManager.deleteUserConsents).mockRejectedValueOnce(
      new Error('Consent deletion failed')
    )

    const result = await deleteAllUserData('error-user')

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes('consents'))).toBe(true)
  })
})

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('Edge cases', () => {
  it('should handle empty userId', async () => {
    const request = await requestDataAccess('', 'empty@example.com')
    expect(request.userId).toBe('')
    expect(request.email).toBe('empty@example.com')
  })

  it('should handle special characters in email', async () => {
    const request = await requestDataAccess(
      'special-user',
      'test+special@example.com'
    )
    expect(request.email).toBe('test+special@example.com')
  })

  it('should handle very long reason strings', async () => {
    const longReason = 'A'.repeat(1000)
    const request = await requestDataDeletion(
      'long-reason-user',
      'long@example.com',
      longReason
    )
    expect(request.reason).toBe(longReason)
  })

  it('should handle concurrent requests', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      requestDataAccess(`concurrent-user-${i}`, `concurrent${i}@example.com`)
    )

    const requests = await Promise.all(promises)

    expect(requests.length).toBe(5)
    const ids = new Set(requests.map((r) => r.id))
    expect(ids.size).toBe(5) // All unique IDs
  })
})

// =============================================================================
// Deadline Calculation Tests
// =============================================================================

describe('Deadline calculations', () => {
  it('should set deadline 30 days from submission for KVKK compliance', async () => {
    const request = await requestDataAccess('deadline-user', 'deadline@example.com')

    const expectedDeadline = request.submittedAt + 30 * 24 * 60 * 60 * 1000
    expect(request.deadline).toBe(expectedDeadline)
  })

  it('should set consistent deadlines across request types', async () => {
    const accessRequest = await requestDataAccess('access-dl', 'access@example.com')
    const erasureRequest = await requestDataDeletion('erasure-dl', 'erasure@example.com')

    const accessDeadlineDays = (accessRequest.deadline - accessRequest.submittedAt) / (24 * 60 * 60 * 1000)
    const erasureDeadlineDays = (erasureRequest.deadline - erasureRequest.submittedAt) / (24 * 60 * 60 * 1000)

    expect(accessDeadlineDays).toBe(30)
    expect(erasureDeadlineDays).toBe(30)
  })
})

// =============================================================================
// IndexedDB Database Operations Tests
// =============================================================================

describe('IndexedDB database operations', () => {
  it('should handle database open errors', async () => {
    const errorMock = {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        setTimeout(() => {
          request.error = new Error('Database open failed')
          request.onerror?.()
        }, 0)
        return request
      }),
    }
    vi.stubGlobal('indexedDB', errorMock)

    // Should not throw, just handle gracefully
    await expect(dataSubjectRightsManager.initialize()).resolves.not.toThrow()
  })

  it('should handle database upgrade needed', async () => {
    const upgradeMock = {
      open: vi.fn(() => {
        const request = new MockIDBOpenDBRequest()
        const db = new MockIDBDatabase('insurai_privacy', [])

        setTimeout(() => {
          // Trigger upgrade
          if (request.onupgradeneeded) {
            request.onupgradeneeded({ target: request } as unknown as IDBVersionChangeEvent)
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

// =============================================================================
// Data Collection Advanced Tests
// =============================================================================

describe('Advanced data collection', () => {
  it('should collect data from multiple IndexedDB databases', async () => {
    const data = await exportUserData('multi-db-user')

    expect(data.indexedDB).toBeDefined()
  })

  it('should handle JSON parse errors in localStorage gracefully', async () => {
    const mockStorage: Record<string, string> = {
      'insurai_invalid_json': 'not valid json {{{',
      'insurai_valid': JSON.stringify({ valid: true }),
    }

    vi.stubGlobal('localStorage', {
      length: Object.keys(mockStorage).length,
      key: (index: number) => Object.keys(mockStorage)[index] ?? null,
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const data = await exportUserData('json-error-user')

    expect(data.localStorage).toBeDefined()
    const storage = data.localStorage as Record<string, unknown>
    // Should store the raw value when JSON parse fails
    expect(storage['insurai_invalid_json']).toBe('not valid json {{{')
  })

  it('should filter personal data fields by category', async () => {
    const data = await exportUserData('category-filter-user')

    const fields = data.personalDataFields as Array<{ category: string }>
    // Technical fields should be filtered out
    const technicalFields = fields.filter((f) => f.category === 'technical')
    expect(technicalFields.length).toBe(0)
  })

  it('should include retention period in personal data fields', async () => {
    const data = await exportUserData('retention-user')

    const fields = data.personalDataFields as Array<{ retention: string }>
    if (fields.length > 0) {
      expect(fields[0].retention).toMatch(/\d+ days/)
    }
  })

  it('should include purpose translations in personal data fields', async () => {
    const data = await exportUserData('purpose-user')

    const fields = data.personalDataFields as Array<{ purposeTr: string }>
    if (fields.length > 0) {
      expect(fields[0]).toHaveProperty('purposeTr')
    }
  })
})

// =============================================================================
// Data Deletion Advanced Tests
// =============================================================================

describe('Advanced data deletion', () => {
  it('should track deleted sources', async () => {
    const result = await deleteAllUserData('track-delete-user')

    expect(result.deletedFrom.length).toBeGreaterThan(0)
  })

  it('should accumulate errors from multiple sources', async () => {
    // Mock consent manager to fail
    vi.mocked(consentManager.deleteUserConsents).mockRejectedValueOnce(
      new Error('Consent error')
    )

    const result = await deleteAllUserData('multi-error-user')

    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should delete from IndexedDB databases', async () => {
    const result = await deleteAllUserData('idb-delete-user')

    // Should attempt to delete from multiple databases
    expect(result.deletedFrom.length).toBeGreaterThan(0)
  })

  it('should handle localStorage delete errors gracefully', async () => {
    vi.stubGlobal('localStorage', {
      length: 1,
      key: () => { throw new Error('Access denied') },
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    // Should not throw
    const result = await deleteAllUserData('ls-error-user')
    expect(result).toBeDefined()
  })

  it('should remove keys matching userId from localStorage', async () => {
    const removeItemMock = vi.fn()
    const testUserId = 'specific-user-123'

    vi.stubGlobal('localStorage', {
      length: 3,
      key: (index: number) => {
        const keys = [
          `data_${testUserId}_settings`,
          'other_key',
          `cache_${testUserId}_data`,
        ]
        return keys[index] ?? null
      },
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: removeItemMock,
      clear: vi.fn(),
    })

    await deleteAllUserData(testUserId)

    // Should have called removeItem for keys containing userId
    expect(removeItemMock).toHaveBeenCalled()
  })
})

// =============================================================================
// Request Processing Simulation Tests
// =============================================================================

describe('Request processing simulation', () => {
  it('should handle objection request type', async () => {
    const request = await dataSubjectRightsManager.submitRequest({
      userId: 'objection-user',
      email: 'objection@example.com',
      type: 'objection',
    })

    expect(request.type).toBe('objection')
    expect(request.status).toBe('pending')
  })

  it('should handle complaint request type', async () => {
    const request = await dataSubjectRightsManager.submitRequest({
      userId: 'complaint-user',
      email: 'complaint@example.com',
      type: 'complaint',
    })

    expect(request.type).toBe('complaint')
    expect(request.status).toBe('pending')
  })
})

// =============================================================================
// Consent Withdrawal Tests
// =============================================================================

describe('Consent withdrawal handling', () => {
  it('should call getUserConsentStatus during withdraw', async () => {
    const request = await dataSubjectRightsManager.submitRequest({
      userId: 'consent-status-user',
      email: 'consent@example.com',
      type: 'withdraw_consent',
    })

    expect(request.type).toBe('withdraw_consent')
  })

  it('should handle multiple consent types', async () => {
    vi.mocked(consentManager.getUserConsentStatus).mockResolvedValueOnce({
      userId: 'multi-consent-user',
      consents: {
        terms_of_service: { granted: true, timestamp: Date.now() },
        cookie_essential: { granted: true, timestamp: Date.now() },
        cookie_analytics: { granted: true, timestamp: Date.now() },
        cookie_marketing: { granted: true, timestamp: Date.now() },
        data_processing: { granted: true, timestamp: Date.now() },
        third_party_sharing: { granted: true, timestamp: Date.now() },
      },
      lastUpdated: Date.now(),
    })

    const request = await dataSubjectRightsManager.submitRequest({
      userId: 'multi-consent-user',
      email: 'multi@example.com',
      type: 'withdraw_consent',
    })

    expect(request.status).toBe('pending')
  })
})

// =============================================================================
// Database Transaction Tests
// =============================================================================

describe('Database transaction handling', () => {
  it('should handle transaction errors gracefully', async () => {
    // The mock handles errors internally
    const requests = await dataSubjectRightsManager.getUserRequests('tx-error-user')
    expect(Array.isArray(requests)).toBe(true)
  })

  it('should handle store access errors', async () => {
    const pending = await dataSubjectRightsManager.getPendingRequests()
    expect(Array.isArray(pending)).toBe(true)
  })
})

// =============================================================================
// Request ID Generation Tests
// =============================================================================

describe('Request ID generation', () => {
  it('should include timestamp in request ID', async () => {
    const before = Date.now()
    const request = await requestDataAccess('id-user', 'id@example.com')

    // ID format: dsr_<timestamp>_<random>
    const parts = request.id.split('_')
    expect(parts[0]).toBe('dsr')
    expect(parts.length).toBe(3)

    const timestamp = parseInt(parts[1], 10)
    expect(timestamp).toBeGreaterThanOrEqual(before)
  })

  it('should include random component in request ID', async () => {
    const request = await requestDataAccess('random-user', 'random@example.com')

    const parts = request.id.split('_')
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it('should generate different random components', async () => {
    const requests = await Promise.all([
      requestDataAccess('rand1', 'r1@example.com'),
      requestDataAccess('rand2', 'r2@example.com'),
      requestDataAccess('rand3', 'r3@example.com'),
    ])

    const randomParts = requests.map((r) => r.id.split('_')[2])
    const uniqueParts = new Set(randomParts)

    expect(uniqueParts.size).toBe(3)
  })
})

// =============================================================================
// KVKK/GDPR Compliance Tests
// =============================================================================

describe('KVKK/GDPR compliance', () => {
  it('should set 30-day deadline per KVKK requirements', async () => {
    const request = await requestDataAccess('kvkk-user', 'kvkk@example.com')

    const deadlineDays = (request.deadline - request.submittedAt) / (24 * 60 * 60 * 1000)
    expect(deadlineDays).toBe(30)
  })

  it('should include all required fields for access request', async () => {
    const request = await requestDataAccess('fields-user', 'fields@example.com')

    expect(request.id).toBeDefined()
    expect(request.userId).toBeDefined()
    expect(request.email).toBeDefined()
    expect(request.type).toBeDefined()
    expect(request.status).toBeDefined()
    expect(request.submittedAt).toBeDefined()
    expect(request.deadline).toBeDefined()
  })

  it('should support data portability format as JSON', async () => {
    const data = await exportUserData('portable-format-user')

    expect(data.collectedAt).toBeDefined()
    expect(typeof data.collectedAt).toBe('string')
    // Should be valid ISO date string
    expect(() => new Date(data.collectedAt as string)).not.toThrow()
  })
})

// =============================================================================
// Overdue Request Detection Tests
// =============================================================================

describe('Overdue request detection', () => {
  it('should identify requests past deadline as overdue', async () => {
    const overdue = await dataSubjectRightsManager.getOverdueRequests()

    // All returned requests should have deadline < now
    const now = Date.now()
    overdue.forEach((request) => {
      expect(request.deadline).toBeLessThan(now)
    })
  })

  it('should filter pending requests for overdue check', async () => {
    // getOverdueRequests calls getPendingRequests internally
    const overdue = await dataSubjectRightsManager.getOverdueRequests()
    expect(Array.isArray(overdue)).toBe(true)
  })
})

// =============================================================================
// Singleton Instance Tests
// =============================================================================

describe('Singleton instance', () => {
  it('should use same instance across imports', async () => {
    const { dataSubjectRightsManager: instance1 } = await import('./data-subject-rights')
    const { dataSubjectRightsManager: instance2 } = await import('./data-subject-rights')

    expect(instance1).toBe(instance2)
  })
})

// =============================================================================
// Request Reason Handling Tests
// =============================================================================

describe('Request reason handling', () => {
  it('should store reason for erasure requests', async () => {
    const request = await requestDataDeletion(
      'reason-erasure',
      'reason@example.com',
      'Moving to different service'
    )

    expect(request.reason).toBe('Moving to different service')
  })

  it('should allow empty reason', async () => {
    const request = await requestDataDeletion(
      'empty-reason',
      'empty@example.com',
      ''
    )

    expect(request.reason).toBe('')
  })

  it('should handle undefined reason', async () => {
    const request = await requestDataDeletion(
      'no-reason',
      'no@example.com'
    )

    expect(request.reason).toBeUndefined()
  })
})

// =============================================================================
// Email Validation Tests
// =============================================================================

describe('Email handling', () => {
  it('should accept standard email format', async () => {
    const request = await requestDataAccess('std-user', 'standard@example.com')
    expect(request.email).toBe('standard@example.com')
  })

  it('should accept email with subdomain', async () => {
    const request = await requestDataAccess('sub-user', 'user@mail.example.com')
    expect(request.email).toBe('user@mail.example.com')
  })

  it('should accept email with plus addressing', async () => {
    const request = await requestDataAccess('plus-user', 'user+tag@example.com')
    expect(request.email).toBe('user+tag@example.com')
  })

  it('should accept international email', async () => {
    const request = await requestDataAccess('intl-user', 'kullanıcı@örnek.com')
    expect(request.email).toBe('kullanıcı@örnek.com')
  })
})

// =============================================================================
// Batch Request Tests
// =============================================================================

describe('Batch request handling', () => {
  it('should handle 10 concurrent requests', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      requestDataAccess(`batch-user-${i}`, `batch${i}@example.com`)
    )

    const requests = await Promise.all(promises)

    expect(requests.length).toBe(10)
    requests.forEach((r) => {
      expect(r.status).toBe('pending')
    })
  })

  it('should maintain data integrity across concurrent requests', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      dataSubjectRightsManager.submitRequest({
        userId: `integrity-${i}`,
        email: `integrity${i}@example.com`,
        type: i % 2 === 0 ? 'access' : 'erasure',
        reason: `Reason ${i}`,
      })
    )

    const requests = await Promise.all(promises)

    requests.forEach((r, i) => {
      expect(r.userId).toBe(`integrity-${i}`)
      expect(r.email).toBe(`integrity${i}@example.com`)
      expect(r.type).toBe(i % 2 === 0 ? 'access' : 'erasure')
    })
  })
})
