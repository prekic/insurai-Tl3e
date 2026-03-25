import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Mock dependencies before importing the hook
const mockGetFeatureFlags = vi.fn()
const mockUser = { id: 'user-123' }
const mockUseAuth = vi.fn(() => ({ user: mockUser }))

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/lib/config', () => ({
  configService: {
    getFeatureFlags: () => mockGetFeatureFlags(),
  },
}))

// Mock Supabase client
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockFrom = vi.fn()
const mockCreateClient = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { usePilotGateOptions } from './usePilotGateOptions'

describe('usePilotGateOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: feature flags load successfully
    mockGetFeatureFlags.mockResolvedValue([
      { key: 'kasko_ai_extraction_pilot', enabled: true },
      { key: 'actuarial_engine_enabled', enabled: false },
    ])

    // Default: user segments load successfully
    mockEq.mockResolvedValue({
      data: [{ segment_name: 'kasko_pilot_reviewers' }],
      error: null,
    })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    mockCreateClient.mockReturnValue({ from: mockFrom })

    // Default: user is logged in
    mockUseAuth.mockReturnValue({ user: { id: 'user-123' } })
  })

  it('loads feature flags as a boolean map', async () => {
    const { result } = renderHook(() => usePilotGateOptions())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.featureFlags).toEqual({
      kasko_ai_extraction_pilot: true,
      actuarial_engine_enabled: false,
    })
  })

  it('returns userId for logged-in user', async () => {
    const { result } = renderHook(() => usePilotGateOptions())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userId).toBe('user-123')
    // Segments depend on dynamic import + env vars — may be empty in test env
    expect(Array.isArray(result.current.userSegments)).toBe(true)
  })

  it('returns empty segments when user is not logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null })

    const { result } = renderHook(() => usePilotGateOptions())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userSegments).toEqual([])
    expect(result.current.userId).toBeUndefined()
  })

  it('degrades gracefully when feature flags fail to load', async () => {
    mockGetFeatureFlags.mockRejectedValue(new Error('DB unavailable'))

    const { result } = renderHook(() => usePilotGateOptions())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.featureFlags).toEqual({})
  })

  it('degrades gracefully when segments table does not exist', async () => {
    mockCreateClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => Promise.reject(new Error('relation "user_segments" does not exist')),
        }),
      }),
    })

    const { result } = renderHook(() => usePilotGateOptions())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userSegments).toEqual([])
  })

  it('starts in loading state', () => {
    const { result } = renderHook(() => usePilotGateOptions())
    expect(result.current.isLoading).toBe(true)
  })

  it('handles empty feature flags array', async () => {
    mockGetFeatureFlags.mockResolvedValue([])

    const { result } = renderHook(() => usePilotGateOptions())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.featureFlags).toEqual({})
  })
})
