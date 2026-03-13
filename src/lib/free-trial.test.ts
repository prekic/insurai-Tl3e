import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  hasUsedFreeTrial,
  hasValidTrialResult,
  getTrialResult,
  saveTrialResult,
  markTrialUsed,
  clearTrialData,
  getTrialTimeRemaining,
  formatTimeRemaining,
  canPerformFreeTrial,
  saveTrialEmail,
  getTrialEmail,
  getShareId,
  getTrialDataForTransfer,
  hasPendingTrialTransfer,
  getTrialUploadsRemaining,
  getTrialMaxUploads,
} from './free-trial'
import type { AnalyzedPolicy } from '@/types/policy'

// ---------------------------------------------------------------------------
// Constants matching the source
// ---------------------------------------------------------------------------
const TRIAL_EXPIRY_MS = 24 * 60 * 60 * 1000

const STORAGE_KEYS = {
  TRIAL_USED: 'insurai_trial_used',
  TRIAL_RESULT: 'insurai_trial_result',
  TRIAL_TIMESTAMP: 'insurai_trial_timestamp',
  TRIAL_FILE_NAME: 'insurai_trial_filename',
  TRIAL_EMAIL: 'insurai_trial_email',
  TRIAL_SHARE_ID: 'insurai_trial_share_id',
  TRIAL_UPLOAD_COUNT: 'insurai_trial_upload_count',
  TRIAL_WINDOW_START: 'insurai_trial_window_start',
}

const TRIAL_MAX = 3 // default max uploads per day

/** Helper to set count-based trial state in localStorage */
function setTrialCount(count: number, windowStart: number) {
  store.set(STORAGE_KEYS.TRIAL_UPLOAD_COUNT, count.toString())
  store.set(STORAGE_KEYS.TRIAL_WINDOW_START, windowStart.toString())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'test-id-123',
    policyNumber: 'POL-001',
    provider: 'Test Sigorta',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 12000,
    deductible: 1500,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test Kullanici',
    ...overrides,
  } as AnalyzedPolicy
}

// ---------------------------------------------------------------------------
// Mock localStorage as a simple Map-based object
// ---------------------------------------------------------------------------
let store: Map<string, string>

function createMockLocalStorage() {
  store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
    get length() {
      return store.size
    },
    key: vi.fn((index: number) => {
      const keys = Array.from(store.keys())
      return keys[index] ?? null
    }),
  }
}

// ---------------------------------------------------------------------------
// Mock crypto.getRandomValues
// ---------------------------------------------------------------------------
const mockGetRandomValues = vi.fn((arr: Uint8Array) => {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = i // deterministic: 0,1,2,...,15
  }
  return arr
})

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  const mockStorage = createMockLocalStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: mockGetRandomValues },
    writable: true,
    configurable: true,
  })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-02-08T12:00:00Z'))
  mockGetRandomValues.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ===========================================================================
// hasUsedFreeTrial
// ===========================================================================
describe('hasUsedFreeTrial', () => {
  it('returns false when nothing in storage', () => {
    expect(hasUsedFreeTrial()).toBe(false)
  })

  it('returns false when count is below max', () => {
    setTrialCount(1, Date.now())
    expect(hasUsedFreeTrial()).toBe(false)
  })

  it('returns false when count is 2 (below max of 3)', () => {
    setTrialCount(2, Date.now())
    expect(hasUsedFreeTrial()).toBe(false)
  })

  it('returns true when count equals max', () => {
    setTrialCount(TRIAL_MAX, Date.now())
    expect(hasUsedFreeTrial()).toBe(true)
  })

  it('returns true when count exceeds max', () => {
    setTrialCount(TRIAL_MAX + 2, Date.now())
    expect(hasUsedFreeTrial()).toBe(true)
  })

  it('returns false when window has expired (count resets)', () => {
    const expiredTime = Date.now() - TRIAL_EXPIRY_MS - 1
    setTrialCount(TRIAL_MAX, expiredTime)

    expect(hasUsedFreeTrial()).toBe(false)
    // Window should have been reset
    expect(store.has(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_WINDOW_START)).toBe(false)
  })

  it('returns true when count is at max and exactly at the expiry boundary', () => {
    // Exactly at boundary: now - windowStart === TRIAL_EXPIRY_MS, which is NOT > so not expired
    const boundaryTime = Date.now() - TRIAL_EXPIRY_MS
    setTrialCount(TRIAL_MAX, boundaryTime)
    expect(hasUsedFreeTrial()).toBe(true)
  })

  it('returns false when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('Storage unavailable')
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(hasUsedFreeTrial()).toBe(false)
  })
})

// ===========================================================================
// hasValidTrialResult
// ===========================================================================
describe('hasValidTrialResult', () => {
  it('returns false when storage is empty', () => {
    expect(hasValidTrialResult()).toBe(false)
  })

  it('returns false when result exists but no timestamp', () => {
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{"id":"x"}')
    expect(hasValidTrialResult()).toBe(false)
  })

  it('returns false when timestamp exists but no result', () => {
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())
    expect(hasValidTrialResult()).toBe(false)
  })

  it('returns true when result and timestamp are valid (not expired)', () => {
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{"id":"x"}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())
    expect(hasValidTrialResult()).toBe(true)
  })

  it('returns false when result is expired', () => {
    const expiredTime = Date.now() - TRIAL_EXPIRY_MS - 1
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{"id":"x"}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, expiredTime.toString())
    expect(hasValidTrialResult()).toBe(false)
  })

  it('returns true when result is at the exact boundary (not yet expired)', () => {
    // now - trialTime < TRIAL_EXPIRY_MS must be true; at exact boundary it equals, so false
    const boundaryTime = Date.now() - TRIAL_EXPIRY_MS
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{"id":"x"}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, boundaryTime.toString())
    // At exact boundary: now - trialTime === TRIAL_EXPIRY_MS, which is NOT < , so false
    expect(hasValidTrialResult()).toBe(false)
  })

  it('returns false when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('QuotaExceeded')
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(hasValidTrialResult()).toBe(false)
  })
})

// ===========================================================================
// getTrialResult
// ===========================================================================
describe('getTrialResult', () => {
  it('returns null when storage is empty', () => {
    expect(getTrialResult()).toBeNull()
  })

  it('returns null when result missing', () => {
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())
    expect(getTrialResult()).toBeNull()
  })

  it('returns null when timestamp missing', () => {
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(makeMockPolicy()))
    expect(getTrialResult()).toBeNull()
  })

  it('returns parsed TrialResult with all fields', () => {
    const now = Date.now()
    const policy = makeMockPolicy()
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(policy))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, now.toString())
    store.set(STORAGE_KEYS.TRIAL_FILE_NAME, 'my-policy.pdf')
    store.set(STORAGE_KEYS.TRIAL_EMAIL, 'test@example.com')
    store.set(STORAGE_KEYS.TRIAL_SHARE_ID, 'abc123')

    const result = getTrialResult()
    expect(result).not.toBeNull()
    expect(result!.policy).toEqual(policy)
    expect(result!.fileName).toBe('my-policy.pdf')
    expect(result!.analyzedAt).toBe(new Date(now).toISOString())
    expect(result!.expiresAt).toBe(new Date(now + TRIAL_EXPIRY_MS).toISOString())
    expect(result!.email).toBe('test@example.com')
    expect(result!.shareId).toBe('abc123')
  })

  it('defaults fileName to "policy.pdf" when not stored', () => {
    const now = Date.now()
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(makeMockPolicy()))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, now.toString())

    const result = getTrialResult()
    expect(result!.fileName).toBe('policy.pdf')
  })

  it('returns undefined for email and shareId when not stored', () => {
    const now = Date.now()
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(makeMockPolicy()))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, now.toString())

    const result = getTrialResult()
    expect(result!.email).toBeUndefined()
    expect(result!.shareId).toBeUndefined()
  })

  it('returns null and clears data when expired', () => {
    const expiredTime = Date.now() - TRIAL_EXPIRY_MS - 1000
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(makeMockPolicy()))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, expiredTime.toString())
    store.set(STORAGE_KEYS.TRIAL_FILE_NAME, 'old.pdf')

    expect(getTrialResult()).toBeNull()
    expect(store.has(STORAGE_KEYS.TRIAL_RESULT)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_TIMESTAMP)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_FILE_NAME)).toBe(false)
  })

  it('returns null when result JSON is invalid', () => {
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{invalid json!!!}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())
    expect(getTrialResult()).toBeNull()
  })

  it('returns null when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('SecurityError')
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(getTrialResult()).toBeNull()
  })
})

// ===========================================================================
// saveTrialResult
// ===========================================================================
describe('saveTrialResult', () => {
  it('sets all required storage keys', () => {
    const policy = makeMockPolicy()
    saveTrialResult(policy, 'test-policy.pdf')

    expect(store.get(STORAGE_KEYS.TRIAL_USED)).toBe('true')
    expect(store.get(STORAGE_KEYS.TRIAL_FILE_NAME)).toBe('test-policy.pdf')
    expect(store.has(STORAGE_KEYS.TRIAL_TIMESTAMP)).toBe(true)
    expect(store.has(STORAGE_KEYS.TRIAL_RESULT)).toBe(true)
    expect(store.has(STORAGE_KEYS.TRIAL_SHARE_ID)).toBe(true)
    expect(store.get(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe('1')
    expect(store.has(STORAGE_KEYS.TRIAL_WINDOW_START)).toBe(true)
  })

  it('stores the policy as JSON', () => {
    const policy = makeMockPolicy({ policyNumber: 'POL-999' })
    saveTrialResult(policy, 'file.pdf')

    const stored = JSON.parse(store.get(STORAGE_KEYS.TRIAL_RESULT)!)
    expect(stored.policyNumber).toBe('POL-999')
  })

  it('stores timestamp as current time string', () => {
    const now = Date.now()
    saveTrialResult(makeMockPolicy(), 'file.pdf')

    const timestamp = parseInt(store.get(STORAGE_KEYS.TRIAL_TIMESTAMP)!, 10)
    expect(timestamp).toBe(now)
  })

  it('generates a 16-character share ID using crypto.getRandomValues', () => {
    saveTrialResult(makeMockPolicy(), 'file.pdf')

    const shareId = store.get(STORAGE_KEYS.TRIAL_SHARE_ID)!
    expect(shareId).toHaveLength(16)
    expect(mockGetRandomValues).toHaveBeenCalledOnce()
    expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array))
  })

  it('produces a deterministic share ID with deterministic random bytes', () => {
    saveTrialResult(makeMockPolicy(), 'file.pdf')

    const shareId = store.get(STORAGE_KEYS.TRIAL_SHARE_ID)!
    // With bytes [0,1,2,...,15] and chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    // char at index 0%62=0 -> 'a', 1%62=1 -> 'b', ... 15%62=15 -> 'p'
    expect(shareId).toBe('abcdefghijklmnop')
  })

  it('does not throw when localStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: () => {
          throw new Error('QuotaExceeded')
        },
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(() => saveTrialResult(makeMockPolicy(), 'f.pdf')).not.toThrow()
  })
})

// ===========================================================================
// markTrialUsed
// ===========================================================================
describe('markTrialUsed', () => {
  it('sets TRIAL_USED to "true"', () => {
    markTrialUsed()
    expect(store.get(STORAGE_KEYS.TRIAL_USED)).toBe('true')
  })

  it('sets TRIAL_TIMESTAMP to current time', () => {
    const now = Date.now()
    markTrialUsed()
    const ts = parseInt(store.get(STORAGE_KEYS.TRIAL_TIMESTAMP)!, 10)
    expect(ts).toBe(now)
  })

  it('increments upload count and sets window start', () => {
    markTrialUsed()
    expect(store.get(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe('1')
    expect(store.has(STORAGE_KEYS.TRIAL_WINDOW_START)).toBe(true)
  })

  it('increments count on repeated calls', () => {
    markTrialUsed()
    expect(store.get(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe('1')
    markTrialUsed()
    expect(store.get(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe('2')
    markTrialUsed()
    expect(store.get(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe('3')
  })

  it('does not set TRIAL_RESULT or TRIAL_FILE_NAME', () => {
    markTrialUsed()
    expect(store.has(STORAGE_KEYS.TRIAL_RESULT)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_FILE_NAME)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_SHARE_ID)).toBe(false)
  })

  it('does not throw when localStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: () => {
          throw new Error('QuotaExceeded')
        },
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(() => markTrialUsed()).not.toThrow()
  })
})

// ===========================================================================
// clearTrialData
// ===========================================================================
describe('clearTrialData', () => {
  it('removes all trial storage keys', () => {
    store.set(STORAGE_KEYS.TRIAL_USED, 'true')
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, '123')
    store.set(STORAGE_KEYS.TRIAL_FILE_NAME, 'f.pdf')
    store.set(STORAGE_KEYS.TRIAL_EMAIL, 'a@b.com')
    store.set(STORAGE_KEYS.TRIAL_SHARE_ID, 'abc')
    store.set(STORAGE_KEYS.TRIAL_UPLOAD_COUNT, '3')
    store.set(STORAGE_KEYS.TRIAL_WINDOW_START, '123')

    clearTrialData()

    expect(store.has(STORAGE_KEYS.TRIAL_USED)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_RESULT)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_TIMESTAMP)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_FILE_NAME)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_EMAIL)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_SHARE_ID)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)).toBe(false)
    expect(store.has(STORAGE_KEYS.TRIAL_WINDOW_START)).toBe(false)
  })

  it('does not affect unrelated storage keys', () => {
    store.set('other_key', 'keep me')
    store.set(STORAGE_KEYS.TRIAL_USED, 'true')

    clearTrialData()

    expect(store.get('other_key')).toBe('keep me')
  })

  it('does not throw when localStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: () => {
          throw new Error('SecurityError')
        },
      },
      writable: true,
      configurable: true,
    })
    expect(() => clearTrialData()).not.toThrow()
  })
})

// ===========================================================================
// getTrialTimeRemaining
// ===========================================================================
describe('getTrialTimeRemaining', () => {
  it('returns 0 when no window start in storage', () => {
    expect(getTrialTimeRemaining()).toBe(0)
  })

  it('returns the remaining time in ms', () => {
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000
    store.set(STORAGE_KEYS.TRIAL_WINDOW_START, oneHourAgo.toString())

    const remaining = getTrialTimeRemaining()
    // 24h - 1h = 23h in ms
    expect(remaining).toBe(23 * 60 * 60 * 1000)
  })

  it('returns 0 when trial has expired', () => {
    const pastExpiry = Date.now() - TRIAL_EXPIRY_MS - 5000
    store.set(STORAGE_KEYS.TRIAL_WINDOW_START, pastExpiry.toString())

    expect(getTrialTimeRemaining()).toBe(0)
  })

  it('returns 0 (not negative) for long-expired trials', () => {
    const longAgo = Date.now() - TRIAL_EXPIRY_MS * 10
    store.set(STORAGE_KEYS.TRIAL_WINDOW_START, longAgo.toString())

    expect(getTrialTimeRemaining()).toBe(0)
  })

  it('returns full expiry time when trial just started', () => {
    store.set(STORAGE_KEYS.TRIAL_WINDOW_START, Date.now().toString())
    expect(getTrialTimeRemaining()).toBe(TRIAL_EXPIRY_MS)
  })

  it('returns 0 when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('Error')
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(getTrialTimeRemaining()).toBe(0)
  })
})

// ===========================================================================
// formatTimeRemaining
// ===========================================================================
describe('formatTimeRemaining', () => {
  it('returns "Expired" for 0 ms', () => {
    expect(formatTimeRemaining(0)).toBe('Expired')
  })

  it('returns "Expired" for negative values', () => {
    expect(formatTimeRemaining(-1000)).toBe('Expired')
    expect(formatTimeRemaining(-999999)).toBe('Expired')
  })

  it('returns minutes only when less than 1 hour', () => {
    const thirtyMinutes = 30 * 60 * 1000
    expect(formatTimeRemaining(thirtyMinutes)).toBe('30m remaining')
  })

  it('returns hours and minutes when 1+ hours', () => {
    const twoHoursThirty = (2 * 60 + 30) * 60 * 1000
    expect(formatTimeRemaining(twoHoursThirty)).toBe('2h 30m remaining')
  })

  it('returns "0m remaining" for very small positive values (< 1 minute)', () => {
    expect(formatTimeRemaining(1000)).toBe('0m remaining')
    expect(formatTimeRemaining(59999)).toBe('0m remaining')
  })

  it('returns "1h 0m remaining" for exactly 1 hour', () => {
    const oneHour = 60 * 60 * 1000
    expect(formatTimeRemaining(oneHour)).toBe('1h 0m remaining')
  })

  it('returns "23h 59m remaining" for nearly full 24 hours', () => {
    const nearly24h = 23 * 60 * 60 * 1000 + 59 * 60 * 1000
    expect(formatTimeRemaining(nearly24h)).toBe('23h 59m remaining')
  })

  it('returns "24h 0m remaining" for exactly 24 hours', () => {
    expect(formatTimeRemaining(TRIAL_EXPIRY_MS)).toBe('24h 0m remaining')
  })
})

// ===========================================================================
// canPerformFreeTrial
// ===========================================================================
describe('canPerformFreeTrial', () => {
  it('returns canTry: true with full uploads remaining when no usage', () => {
    const result = canPerformFreeTrial()
    expect(result.canTry).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.uploadsRemaining).toBe(TRIAL_MAX)
    expect(result.maxUploads).toBe(TRIAL_MAX)
  })

  it('returns canTry: true with reduced remaining when partially used', () => {
    setTrialCount(1, Date.now())
    const result = canPerformFreeTrial()
    expect(result.canTry).toBe(true)
    expect(result.uploadsRemaining).toBe(2)
    expect(result.maxUploads).toBe(TRIAL_MAX)
  })

  it('returns canTry: false with reason when all uploads used and not expired', () => {
    setTrialCount(TRIAL_MAX, Date.now())

    const result = canPerformFreeTrial()
    expect(result.canTry).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain(`used all ${TRIAL_MAX} free analyses`)
    expect(result.uploadsRemaining).toBe(0)
    expect(result.maxUploads).toBe(TRIAL_MAX)
  })

  it('returns canTry: true when all uploads used but window has expired', () => {
    const expiredTime = Date.now() - TRIAL_EXPIRY_MS - 1
    setTrialCount(TRIAL_MAX, expiredTime)

    const result = canPerformFreeTrial()
    expect(result.canTry).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.uploadsRemaining).toBe(TRIAL_MAX) // reset after expiry
  })

  it('includes formatted time remaining in the reason', () => {
    // Set window 1 hour ago, count at max
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000
    setTrialCount(TRIAL_MAX, oneHourAgo)

    const result = canPerformFreeTrial()
    expect(result.canTry).toBe(false)
    // 23h remaining
    expect(result.reason).toContain('23h 0m remaining')
  })
})

// ===========================================================================
// saveTrialEmail / getTrialEmail
// ===========================================================================
describe('saveTrialEmail', () => {
  it('stores email in localStorage', () => {
    saveTrialEmail('user@example.com')
    expect(store.get(STORAGE_KEYS.TRIAL_EMAIL)).toBe('user@example.com')
  })

  it('overwrites previously stored email', () => {
    saveTrialEmail('old@example.com')
    saveTrialEmail('new@example.com')
    expect(store.get(STORAGE_KEYS.TRIAL_EMAIL)).toBe('new@example.com')
  })

  it('does not throw when localStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: () => {
          throw new Error('QuotaExceeded')
        },
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(() => saveTrialEmail('test@test.com')).not.toThrow()
  })
})

describe('getTrialEmail', () => {
  it('returns null when no email stored', () => {
    expect(getTrialEmail()).toBeNull()
  })

  it('returns stored email', () => {
    store.set(STORAGE_KEYS.TRIAL_EMAIL, 'hello@world.com')
    expect(getTrialEmail()).toBe('hello@world.com')
  })

  it('returns null when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('SecurityError')
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(getTrialEmail()).toBeNull()
  })
})

// ===========================================================================
// getShareId
// ===========================================================================
describe('getShareId', () => {
  it('returns null when no share ID stored', () => {
    expect(getShareId()).toBeNull()
  })

  it('returns null when share ID exists but trial result is invalid', () => {
    store.set(STORAGE_KEYS.TRIAL_SHARE_ID, 'abc')
    // No result or timestamp
    expect(getShareId()).toBeNull()
  })

  it('returns the share ID when valid trial result exists', () => {
    store.set(STORAGE_KEYS.TRIAL_SHARE_ID, 'validShareId')
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())

    expect(getShareId()).toBe('validShareId')
  })

  it('returns null when trial result is expired', () => {
    const expired = Date.now() - TRIAL_EXPIRY_MS - 1
    store.set(STORAGE_KEYS.TRIAL_SHARE_ID, 'expiredId')
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, expired.toString())

    expect(getShareId()).toBeNull()
  })

  it('returns null when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('Error')
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    expect(getShareId()).toBeNull()
  })
})

// ===========================================================================
// getTrialDataForTransfer
// ===========================================================================
describe('getTrialDataForTransfer', () => {
  it('returns null when no trial result', () => {
    expect(getTrialDataForTransfer()).toBeNull()
  })

  it('returns policy, fileName, and email when valid result exists', () => {
    const policy = makeMockPolicy({ policyNumber: 'TRANSFER-001' })
    const now = Date.now()
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(policy))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, now.toString())
    store.set(STORAGE_KEYS.TRIAL_FILE_NAME, 'transfer.pdf')
    store.set(STORAGE_KEYS.TRIAL_EMAIL, 'transfer@example.com')

    const data = getTrialDataForTransfer()
    expect(data).not.toBeNull()
    expect(data!.policy.policyNumber).toBe('TRANSFER-001')
    expect(data!.fileName).toBe('transfer.pdf')
    expect(data!.email).toBe('transfer@example.com')
  })

  it('returns data without email when email not stored', () => {
    const policy = makeMockPolicy()
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(policy))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())

    const data = getTrialDataForTransfer()
    expect(data).not.toBeNull()
    expect(data!.email).toBeUndefined()
  })

  it('returns null when trial is expired', () => {
    const expired = Date.now() - TRIAL_EXPIRY_MS - 1
    store.set(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(makeMockPolicy()))
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, expired.toString())

    expect(getTrialDataForTransfer()).toBeNull()
  })
})

// ===========================================================================
// hasPendingTrialTransfer
// ===========================================================================
describe('hasPendingTrialTransfer', () => {
  it('returns false when no trial data exists', () => {
    expect(hasPendingTrialTransfer()).toBe(false)
  })

  it('returns true when a valid trial result exists', () => {
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())
    expect(hasPendingTrialTransfer()).toBe(true)
  })

  it('returns false when trial result is expired', () => {
    const expired = Date.now() - TRIAL_EXPIRY_MS - 1
    store.set(STORAGE_KEYS.TRIAL_RESULT, '{}')
    store.set(STORAGE_KEYS.TRIAL_TIMESTAMP, expired.toString())
    expect(hasPendingTrialTransfer()).toBe(false)
  })
})

// ===========================================================================
// Integration / Cross-function tests
// ===========================================================================
describe('getTrialUploadsRemaining', () => {
  it('returns max when no uploads used', () => {
    expect(getTrialUploadsRemaining()).toBe(TRIAL_MAX)
  })

  it('returns correct remaining after partial use', () => {
    setTrialCount(1, Date.now())
    expect(getTrialUploadsRemaining()).toBe(2)
  })

  it('returns 0 when all uploads used', () => {
    setTrialCount(TRIAL_MAX, Date.now())
    expect(getTrialUploadsRemaining()).toBe(0)
  })

  it('returns max after window expires', () => {
    setTrialCount(TRIAL_MAX, Date.now() - TRIAL_EXPIRY_MS - 1)
    expect(getTrialUploadsRemaining()).toBe(TRIAL_MAX)
  })
})

describe('getTrialMaxUploads', () => {
  it('returns the default max uploads', () => {
    expect(getTrialMaxUploads()).toBe(TRIAL_MAX)
  })
})

describe('integration', () => {
  it('full lifecycle: save results up to max, verify, expire, reset', () => {
    const policy = makeMockPolicy({ policyNumber: 'LIFECYCLE-001' })

    // 1. Initially, no trial used
    expect(hasUsedFreeTrial()).toBe(false)
    expect(canPerformFreeTrial().canTry).toBe(true)
    expect(getTrialUploadsRemaining()).toBe(TRIAL_MAX)

    // 2. Save first trial result — still can upload more
    saveTrialResult(policy, 'lifecycle.pdf')
    expect(hasUsedFreeTrial()).toBe(false) // 1 of 3
    expect(hasValidTrialResult()).toBe(true)
    expect(canPerformFreeTrial().canTry).toBe(true)
    expect(getTrialUploadsRemaining()).toBe(2)

    // 3. Second upload
    saveTrialResult(makeMockPolicy({ policyNumber: 'LIFECYCLE-002' }), 'second.pdf')
    expect(hasUsedFreeTrial()).toBe(false) // 2 of 3
    expect(canPerformFreeTrial().canTry).toBe(true)
    expect(getTrialUploadsRemaining()).toBe(1)

    // 4. Third upload — now exhausted
    saveTrialResult(makeMockPolicy({ policyNumber: 'LIFECYCLE-003' }), 'third.pdf')
    expect(hasUsedFreeTrial()).toBe(true) // 3 of 3
    expect(canPerformFreeTrial().canTry).toBe(false)
    expect(getTrialUploadsRemaining()).toBe(0)

    // 5. Retrieve last result
    const result = getTrialResult()
    expect(result).not.toBeNull()
    expect(result!.policy.policyNumber).toBe('LIFECYCLE-003')
    expect(result!.fileName).toBe('third.pdf')

    // 6. Share link works
    expect(getShareId()).not.toBeNull()

    // 7. Time remaining is about 24h
    expect(getTrialTimeRemaining()).toBe(TRIAL_EXPIRY_MS)

    // 8. Advance time past expiry
    vi.setSystemTime(new Date(Date.now() + TRIAL_EXPIRY_MS + 1))

    // 9. Trial now expired — count resets
    expect(hasUsedFreeTrial()).toBe(false)
    expect(canPerformFreeTrial().canTry).toBe(true)
    expect(getTrialUploadsRemaining()).toBe(TRIAL_MAX)
    expect(getTrialTimeRemaining()).toBe(0)
  })

  it('markTrialUsed increments count but does not save result', () => {
    markTrialUsed()
    expect(getTrialUploadsRemaining()).toBe(2) // 1 used of 3
    expect(getTrialResult()).toBeNull()
    expect(hasValidTrialResult()).toBe(false)

    // After 3 markTrialUsed calls, trial is exhausted
    markTrialUsed()
    markTrialUsed()
    expect(hasUsedFreeTrial()).toBe(true)
    expect(getTrialUploadsRemaining()).toBe(0)
  })

  it('saveTrialEmail persists through getTrialResult', () => {
    const policy = makeMockPolicy()
    saveTrialResult(policy, 'email-test.pdf')
    saveTrialEmail('captured@example.com')

    const result = getTrialResult()
    expect(result!.email).toBe('captured@example.com')
  })

  it('clearTrialData resets everything', () => {
    saveTrialResult(makeMockPolicy(), 'f.pdf')
    saveTrialEmail('e@e.com')

    // 1 of 3 used
    expect(hasValidTrialResult()).toBe(true)

    clearTrialData()

    expect(hasUsedFreeTrial()).toBe(false)
    expect(hasValidTrialResult()).toBe(false)
    expect(getTrialResult()).toBeNull()
    expect(getTrialEmail()).toBeNull()
    expect(getShareId()).toBeNull()
    expect(getTrialDataForTransfer()).toBeNull()
    expect(hasPendingTrialTransfer()).toBe(false)
    expect(getTrialUploadsRemaining()).toBe(TRIAL_MAX)
  })

  it('canPerformFreeTrial reason includes formatted time when exhausted', () => {
    // Use all 3 uploads
    markTrialUsed()
    markTrialUsed()
    markTrialUsed()

    // Advance 12 hours
    vi.setSystemTime(new Date(Date.now() + 12 * 60 * 60 * 1000))

    const result = canPerformFreeTrial()
    expect(result.canTry).toBe(false)
    expect(result.reason).toContain('12h 0m remaining')
  })
})
