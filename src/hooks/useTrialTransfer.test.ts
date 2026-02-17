import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---- hoisted mocks (available inside vi.mock factories) ----
const {
  mockUseAuth,
  mockCreatePolicy,
  mockGetTrialDataForTransfer,
  mockHasPendingTrialTransfer,
  mockClearTrialData,
  mockTrackTrialPolicyTransferred,
  mockTrackTrialSignupCompleted,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockCreatePolicy: vi.fn(),
  mockGetTrialDataForTransfer: vi.fn(),
  mockHasPendingTrialTransfer: vi.fn(),
  mockClearTrialData: vi.fn(),
  mockTrackTrialPolicyTransferred: vi.fn(),
  mockTrackTrialSignupCompleted: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

// ---- module mocks ----
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: mockUseAuth,
}))

vi.mock('@/lib/supabase/policies', () => ({
  createPolicy: mockCreatePolicy,
}))

vi.mock('@/lib/free-trial', () => ({
  getTrialDataForTransfer: mockGetTrialDataForTransfer,
  hasPendingTrialTransfer: mockHasPendingTrialTransfer,
  clearTrialData: mockClearTrialData,
}))

vi.mock('@/lib/analytics', () => ({
  trackTrialPolicyTransferred: mockTrackTrialPolicyTransferred,
  trackTrialSignupCompleted: mockTrackTrialSignupCompleted,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// ---- import after mocks are registered ----
import { useTrialTransfer, isFromTrialFlow } from './useTrialTransfer'

// ---- helpers ----
const MOCK_USER_ID = 'user-abc-123'
const MOCK_POLICY_ID = 'policy-xyz-789'

function makeMockTrialData() {
  return {
    policy: {
      policyNumber: 'POL-2026-001',
      provider: 'Allianz',
      type: 'kasko' as const,
      typeTr: 'Kasko',
      coverage: 500000,
      premium: 12000,
      deductible: 2000,
      startDate: '2026-01-01',
      expiryDate: '2027-01-01',
      status: 'active',
      insuredPerson: 'Ahmet Yilmaz',
      location: 'Istanbul',
      documentType: 'policy',
      logo: 'allianz-logo.png',
      coverages: [{ name: 'Collision', nameTr: 'Carpma', limit: 500000, deductible: 2000, included: true }],
      exclusions: ['Racing'],
      specialConditions: ['Annual payment'],
      aiInsights: ['Good coverage'],
      aiConfidence: 0.92,
      vehicleInfo: { make: 'Toyota', model: 'Corolla', year: 2024 },
    },
    fileName: 'test-policy.pdf',
    email: 'test@example.com',
  }
}

function setWindowSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: {
      ...window.location,
      search,
      href: `http://localhost:5173${search}`,
      pathname: '/',
    },
    writable: true,
    configurable: true,
  })
}

// ---- tests ----
describe('useTrialTransfer', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: no user
    mockUseAuth.mockReturnValue({ user: null })

    // Default: no pending trial
    mockHasPendingTrialTransfer.mockReturnValue(false)
    mockGetTrialDataForTransfer.mockReturnValue(null)

    // Default: createPolicy resolves with an id
    mockCreatePolicy.mockResolvedValue({ id: MOCK_POLICY_ID })

    // Clean URL
    setWindowSearch('')

    // Suppress console.error from the hook's catch block
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Spy on history.replaceState
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    replaceStateSpy.mockRestore()
  })

  // ----------------------------------------------------------------
  // No user -> no transfer
  // ----------------------------------------------------------------
  it('does not transfer when there is no authenticated user', () => {
    mockUseAuth.mockReturnValue({ user: null })

    renderHook(() => useTrialTransfer())

    expect(mockHasPendingTrialTransfer).not.toHaveBeenCalled()
    expect(mockCreatePolicy).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // User exists but no pending trial data
  // ----------------------------------------------------------------
  it('does not transfer when user exists but there is no pending trial data', () => {
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(false)

    renderHook(() => useTrialTransfer())

    expect(mockHasPendingTrialTransfer).toHaveBeenCalled()
    expect(mockGetTrialDataForTransfer).not.toHaveBeenCalled()
    expect(mockCreatePolicy).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // User with pending trial data -> calls createPolicy and clears trial data
  // ----------------------------------------------------------------
  it('transfers trial data when user is present and trial data is pending', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    // Verify policy data shape
    const policyArg = mockCreatePolicy.mock.calls[0][0]
    expect(policyArg.user_id).toBe(MOCK_USER_ID)
    expect(policyArg.policy_number).toBe('POL-2026-001')
    expect(policyArg.provider).toBe('Allianz')
    expect(policyArg.type).toBe('kasko')
    expect(policyArg.type_tr).toBe('Kasko')
    expect(policyArg.coverage).toBe(500000)
    expect(policyArg.premium).toBe(12000)
    expect(policyArg.deductible).toBe(2000)
    expect(policyArg.start_date).toBe('2026-01-01')
    expect(policyArg.expiry_date).toBe('2027-01-01')
    expect(policyArg.status).toBe('active')
    expect(policyArg.insured_person).toBe('Ahmet Yilmaz')
    expect(policyArg.raw_data.fromTrial).toBe(true)
    expect(policyArg.raw_data.originalFileName).toBe('test-policy.pdf')

    // Verify post-transfer side effects
    expect(mockTrackTrialPolicyTransferred).toHaveBeenCalledTimes(1)
    expect(mockClearTrialData).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Policy saved to your dashboard!',
      { description: 'Your trial analysis has been added to your account.' }
    )
  })

  // ----------------------------------------------------------------
  // fromTrial URL param -> calls trackTrialSignupCompleted
  // ----------------------------------------------------------------
  it('calls trackTrialSignupCompleted when fromTrial URL param is present', async () => {
    setWindowSearch('?fromTrial=true')

    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockTrackTrialSignupCompleted).toHaveBeenCalledTimes(1)
    })

    expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
  })

  it('does not call trackTrialSignupCompleted when fromTrial URL param is absent', async () => {
    setWindowSearch('')

    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    expect(mockTrackTrialSignupCompleted).not.toHaveBeenCalled()
  })

  it('cleans up fromTrial URL parameter after successful transfer', async () => {
    setWindowSearch('?fromTrial=true')

    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalled()
    })

    // The URL should no longer contain fromTrial
    const replacedUrl = replaceStateSpy.mock.calls[0][2] as string
    expect(replacedUrl).not.toContain('fromTrial')
  })

  // ----------------------------------------------------------------
  // Transfer error -> allows retry (hasTransferred reset)
  // ----------------------------------------------------------------
  it('allows retry after transfer error by resetting hasTransferred', async () => {
    const trialData = makeMockTrialData()
    const transferError = new Error('Database connection failed')

    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)
    mockCreatePolicy.mockRejectedValueOnce(transferError)

    const { rerender } = renderHook(() => useTrialTransfer())

    // Wait for the failed attempt
    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    // Should NOT have cleared trial data or tracked success
    expect(mockClearTrialData).not.toHaveBeenCalled()
    expect(mockTrackTrialPolicyTransferred).not.toHaveBeenCalled()

    // Now fix the mock so next attempt succeeds
    mockCreatePolicy.mockResolvedValueOnce({ id: MOCK_POLICY_ID })

    // Simulate a user ID change to trigger a "new login" re-attempt
    // (hasTransferred was reset to false in the catch, and we need isNewLogin to be true)
    mockUseAuth.mockReturnValue({ user: { id: 'user-new-456' } })
    rerender()

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(2)
    })

    expect(mockClearTrialData).toHaveBeenCalledTimes(1)
    expect(mockTrackTrialPolicyTransferred).toHaveBeenCalledTimes(1)
  })

  // ----------------------------------------------------------------
  // onTransferComplete callback called on success
  // ----------------------------------------------------------------
  it('calls onTransferComplete callback with saved policy id on success', async () => {
    const onTransferComplete = vi.fn()

    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer({ onTransferComplete }))

    await waitFor(() => {
      expect(onTransferComplete).toHaveBeenCalledWith(MOCK_POLICY_ID)
    })
  })

  // ----------------------------------------------------------------
  // onTransferError callback called on failure
  // ----------------------------------------------------------------
  it('calls onTransferError callback with error on failure', async () => {
    const onTransferError = vi.fn()
    const transferError = new Error('Network timeout')

    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)
    mockCreatePolicy.mockRejectedValueOnce(transferError)

    renderHook(() => useTrialTransfer({ onTransferError }))

    await waitFor(() => {
      expect(onTransferError).toHaveBeenCalledWith(transferError)
    })

    // Should not call success side effects
    expect(mockClearTrialData).not.toHaveBeenCalled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // Same user logged in again -> doesn't transfer twice
  // ----------------------------------------------------------------
  it('does not transfer twice for the same user on re-render', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    const { rerender } = renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    // Re-render with same user (simulate component re-render)
    rerender()

    // Wait a tick and confirm no second call
    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })
  })

  // ----------------------------------------------------------------
  // getTrialDataForTransfer returns null (edge case)
  // ----------------------------------------------------------------
  it('does not create policy when getTrialDataForTransfer returns null despite hasPendingTrialTransfer being true', async () => {
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(null)

    renderHook(() => useTrialTransfer())

    // Allow async effect to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockGetTrialDataForTransfer).toHaveBeenCalled()
    expect(mockCreatePolicy).not.toHaveBeenCalled()
    expect(mockClearTrialData).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // User logs out and logs back in -> resets and allows transfer
  // ----------------------------------------------------------------
  it('resets transfer state when user logs out, allowing transfer on next login', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    const { rerender } = renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    // User logs out
    mockUseAuth.mockReturnValue({ user: null })
    rerender()

    // New trial data becomes available while logged out
    vi.clearAllMocks()
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(makeMockTrialData())
    mockCreatePolicy.mockResolvedValue({ id: 'policy-new-456' })

    // User logs back in (different user ID triggers isNewLogin)
    mockUseAuth.mockReturnValue({ user: { id: 'user-second-789' } })
    rerender()

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })
  })

  // ----------------------------------------------------------------
  // Policy data defaults for optional fields
  // ----------------------------------------------------------------
  it('uses default values for optional policy fields when they are absent', async () => {
    const trialData = makeMockTrialData()
    // Remove optional fields
    delete (trialData.policy as Record<string, unknown>).deductible
    delete (trialData.policy as Record<string, unknown>).status
    delete (trialData.policy as Record<string, unknown>).insuredPerson
    delete (trialData.policy as Record<string, unknown>).location
    delete (trialData.policy as Record<string, unknown>).documentType
    delete (trialData.policy as Record<string, unknown>).logo

    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    const policyArg = mockCreatePolicy.mock.calls[0][0]
    expect(policyArg.deductible).toBe(0)
    expect(policyArg.status).toBe('active')
    expect(policyArg.insured_person).toBe('N/A')
    expect(policyArg.location).toBeUndefined()
    expect(policyArg.document_type).toBe('policy')
    expect(policyArg.logo).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // raw_data includes correct nested data
  // ----------------------------------------------------------------
  it('includes coverages, exclusions, specialConditions, and vehicleInfo in raw_data', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    const rawData = mockCreatePolicy.mock.calls[0][0].raw_data
    expect(rawData.coverages).toEqual(trialData.policy.coverages)
    expect(rawData.exclusions).toEqual(trialData.policy.exclusions)
    expect(rawData.specialConditions).toEqual(trialData.policy.specialConditions)
    expect(rawData.aiInsights).toEqual(trialData.policy.aiInsights)
    expect(rawData.aiConfidence).toBe(0.92)
    expect(rawData.vehicleInfo).toEqual(trialData.policy.vehicleInfo)
    expect(rawData.fromTrial).toBe(true)
    expect(rawData.originalFileName).toBe('test-policy.pdf')
  })

  // ----------------------------------------------------------------
  // upload_date is today's date
  // ----------------------------------------------------------------
  it('sets upload_date to today in YYYY-MM-DD format', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    const policyArg = mockCreatePolicy.mock.calls[0][0]
    const today = new Date().toISOString().split('T')[0]
    expect(policyArg.upload_date).toBe(today)
  })

  // ----------------------------------------------------------------
  // Logs error to console on failure
  // ----------------------------------------------------------------
  it('logs error to console when transfer fails', async () => {
    const transferError = new Error('Supabase unavailable')
    const trialData = makeMockTrialData()

    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)
    mockCreatePolicy.mockRejectedValueOnce(transferError)

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TrialTransfer] Failed to transfer trial data:',
        transferError
      )
    })
  })

  // ----------------------------------------------------------------
  // Does not show success toast on error
  // ----------------------------------------------------------------
  it('does not show success toast when transfer fails', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)
    mockCreatePolicy.mockRejectedValueOnce(new Error('fail'))

    renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    // Give extra time for any async side effects
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // Same user re-login without user change (not a new login)
  // ----------------------------------------------------------------
  it('does not re-transfer on re-render when user ID has not changed', async () => {
    const trialData = makeMockTrialData()
    mockUseAuth.mockReturnValue({ user: { id: MOCK_USER_ID } })
    mockHasPendingTrialTransfer.mockReturnValue(true)
    mockGetTrialDataForTransfer.mockReturnValue(trialData)

    const { rerender } = renderHook(() => useTrialTransfer())

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
    })

    // Re-render multiple times — same user, should not transfer again
    rerender()
    rerender()
    rerender()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockCreatePolicy).toHaveBeenCalledTimes(1)
  })
})

// ================================================================
// isFromTrialFlow
// ================================================================
describe('isFromTrialFlow', () => {
  afterEach(() => {
    // Restore window.location to defaults
    setWindowSearch('')
  })

  it('returns true when ?fromTrial=true is in the URL', () => {
    setWindowSearch('?fromTrial=true')
    expect(isFromTrialFlow()).toBe(true)
  })

  it('returns false when fromTrial param is absent', () => {
    setWindowSearch('')
    expect(isFromTrialFlow()).toBe(false)
  })

  it('returns false when fromTrial has a value other than true', () => {
    setWindowSearch('?fromTrial=false')
    expect(isFromTrialFlow()).toBe(false)
  })

  it('returns false when fromTrial is empty string', () => {
    setWindowSearch('?fromTrial=')
    expect(isFromTrialFlow()).toBe(false)
  })

  it('returns true when fromTrial=true is among other params', () => {
    setWindowSearch('?page=1&fromTrial=true&ref=landing')
    expect(isFromTrialFlow()).toBe(true)
  })

  it('returns false in SSR-like environment where window is undefined', () => {
    // Save original window
    const originalWindow = globalThis.window

    // Simulate SSR by making typeof window === 'undefined'
    // Use Object.defineProperty to temporarily hide window
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
    // @ts-expect-error - intentionally setting to undefined for SSR simulation
    delete globalThis.window

    try {
      expect(isFromTrialFlow()).toBe(false)
    } finally {
      // Restore window
      if (windowDescriptor) {
        Object.defineProperty(globalThis, 'window', windowDescriptor)
      } else {
        globalThis.window = originalWindow
      }
    }
  })
})
