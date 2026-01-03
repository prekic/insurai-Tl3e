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
