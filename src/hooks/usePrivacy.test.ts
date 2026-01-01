/**
 * Privacy Hooks Tests
 * Tests for KVKK/GDPR consent and data subject rights hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useConsent,
  useConsentRequirements,
  useDataSubjectRights,
  useDataExport,
  usePrivacy,
} from './usePrivacy'

// Mock the consent manager
vi.mock('@/lib/privacy/consent-manager', () => ({
  consentManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    recordConsent: vi.fn().mockResolvedValue({
      id: 'consent-123',
      type: 'data_processing',
      granted: true,
      timestamp: Date.now(),
    }),
    revokeConsent: vi.fn().mockResolvedValue(undefined),
  },
  CONSENT_REQUIREMENTS: [
    { type: 'terms_of_service', required: true, name: 'Terms of Service' },
    { type: 'data_processing', required: false, name: 'Data Processing' },
    { type: 'marketing_email', required: false, name: 'Marketing Email' },
  ],
  checkRequiredConsents: vi.fn().mockResolvedValue({
    allGranted: true,
    missing: [],
  }),
  getUserConsentStatus: vi.fn().mockResolvedValue({
    userId: 'user-123',
    consents: {
      data_processing: { granted: true, timestamp: Date.now() },
      marketing_email: { granted: false, timestamp: null },
    },
  }),
}))

// Mock the data subject rights manager
vi.mock('@/lib/privacy/data-subject-rights', () => ({
  dataSubjectRightsManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    submitRequest: vi.fn().mockResolvedValue({
      id: 'request-123',
      type: 'access',
      status: 'pending',
      submittedAt: new Date().toISOString(),
    }),
  },
  getUserDataRequests: vi.fn().mockResolvedValue([
    { id: 'req-1', type: 'access', status: 'pending' },
    { id: 'req-2', type: 'erasure', status: 'completed' },
  ]),
  exportUserData: vi.fn().mockResolvedValue({
    user: { id: 'user-123', email: 'test@example.com' },
    policies: [],
    consents: [],
  }),
}))

describe('useConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null consent status for undefined user', async () => {
    const { result } = renderHook(() => useConsent(undefined))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.consentStatus).toBeNull()
  })

  it('should load consent status for user', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.consentStatus).toBeDefined()
    expect(result.current.error).toBeNull()
  })

  it('should identify missing consents', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(Array.isArray(result.current.missingConsents)).toBe(true)
  })

  it('should provide hasAllRequiredConsents flag', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(typeof result.current.hasAllRequiredConsents).toBe('boolean')
  })

  it('should provide grantConsent function', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const record = await result.current.grantConsent('data_processing')
      expect(record).toBeDefined()
    })
  })

  it('should provide withdrawConsent function', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const success = await result.current.withdrawConsent('data_processing')
      expect(typeof success).toBe('boolean')
    })
  })

  it('should provide hasConsent function', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.hasConsent('data_processing')).toBe(true)
    expect(result.current.hasConsent('marketing_email')).toBe(false)
  })

  it('should provide refresh function', async () => {
    const { result } = renderHook(() => useConsent('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.loading).toBe(false)
  })
})

describe('useConsentRequirements', () => {
  it('should return consent requirements', () => {
    const { result } = renderHook(() => useConsentRequirements())

    expect(result.current.requirements).toBeDefined()
    expect(result.current.requirements.length).toBeGreaterThan(0)
  })

  it('should separate required and optional consents', () => {
    const { result } = renderHook(() => useConsentRequirements())

    expect(result.current.requiredConsents.length).toBeGreaterThan(0)
    expect(result.current.optionalConsents.length).toBeGreaterThan(0)
  })

  it('should have terms_of_service in required consents', () => {
    const { result } = renderHook(() => useConsentRequirements())

    const tos = result.current.requiredConsents.find(c => c.type === 'terms_of_service')
    expect(tos).toBeDefined()
  })
})

describe('useDataSubjectRights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty requests for undefined user', async () => {
    const { result } = renderHook(() => useDataSubjectRights(undefined))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.requests).toEqual([])
  })

  it('should load user requests', async () => {
    const { result } = renderHook(() => useDataSubjectRights('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.requests.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('should separate pending and completed requests', async () => {
    const { result } = renderHook(() => useDataSubjectRights('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(Array.isArray(result.current.pendingRequests)).toBe(true)
    expect(Array.isArray(result.current.completedRequests)).toBe(true)
  })

  it('should provide submitRequest function', async () => {
    const { result } = renderHook(() => useDataSubjectRights('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const request = await result.current.submitRequest('test@example.com', 'access')
      expect(request).toBeDefined()
    })
  })

  it('should provide refresh function', async () => {
    const { result } = renderHook(() => useDataSubjectRights('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.loading).toBe(false)
  })
})

describe('useDataExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for undefined user', async () => {
    const { result } = renderHook(() => useDataExport(undefined))

    const data = await result.current.exportData()
    expect(data).toBeNull()
  })

  it('should export user data', async () => {
    const { result } = renderHook(() => useDataExport('user-123'))

    await act(async () => {
      const data = await result.current.exportData()
      expect(data).toBeDefined()
      expect(data?.user).toBeDefined()
    })
  })

  it('should track exporting state', async () => {
    const { result } = renderHook(() => useDataExport('user-123'))

    expect(result.current.exporting).toBe(false)

    // Start export and check state
    const exportPromise = act(async () => {
      await result.current.exportData()
    })

    await exportPromise

    expect(result.current.exporting).toBe(false)
  })

  it('should provide downloadExport function', async () => {
    // Save original URL methods
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    // Mock URL methods
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test')
    URL.revokeObjectURL = vi.fn()

    const { result } = renderHook(() => useDataExport('user-123'))

    await act(async () => {
      await result.current.downloadExport()
    })

    // Restore URL methods
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })
})

describe('usePrivacy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should combine consent and rights functionality', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Check consent properties
    expect(result.current.consentStatus).toBeDefined()
    expect(result.current.missingConsents).toBeDefined()
    expect(result.current.hasAllRequiredConsents).toBeDefined()

    // Check requirements properties
    expect(result.current.consentRequirements).toBeDefined()
    expect(result.current.requiredConsents).toBeDefined()
    expect(result.current.optionalConsents).toBeDefined()

    // Check data subject rights properties
    expect(result.current.requests).toBeDefined()
    expect(result.current.pendingRequests).toBeDefined()
    expect(result.current.completedRequests).toBeDefined()
  })

  it('should provide requestAccess function', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const request = await result.current.requestAccess()
      expect(request).toBeDefined()
    })
  })

  it('should provide requestDeletion function', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const request = await result.current.requestDeletion('No longer using service')
      expect(request).toBeDefined()
    })
  })

  it('should provide requestPortability function', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const request = await result.current.requestPortability()
      expect(request).toBeDefined()
    })
  })

  it('should provide export functions', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(typeof result.current.exportData).toBe('function')
    expect(typeof result.current.downloadExport).toBe('function')
    expect(result.current.exporting).toBe(false)
  })

  it('should combine errors from all sources', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Initial state should have no error
    expect(result.current.error).toBeNull()
  })

  it('should provide combined refresh function', async () => {
    const { result } = renderHook(() => usePrivacy('user-123', 'test@example.com'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.loading).toBe(false)
  })
})
