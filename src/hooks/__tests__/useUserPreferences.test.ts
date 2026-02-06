import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUserPreferences } from '../useUserPreferences'

// Mock auth context
const mockUser = { id: 'user-123' }
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}))

// Mock configService
const mockGetCategory = vi.fn()
const mockGetUserPreferences = vi.fn()
const mockSetUserPreferences = vi.fn()

vi.mock('@/lib/config/configuration-service', () => ({
  configService: {
    getCategory: (...args: unknown[]) => mockGetCategory(...args),
    getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
    setUserPreferences: (...args: unknown[]) => mockSetUserPreferences(...args),
  },
}))

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks: admin settings and no user overrides
    mockGetCategory.mockImplementation((category: string) => {
      if (category === 'ui') {
        return Promise.resolve({
          default_items_per_page: 10,
          toast_success_duration_ms: 3000,
          max_file_size_mb: 10,
        })
      }
      if (category === 'email') {
        return Promise.resolve({
          default_marketing_enabled: true,
          default_reminders_enabled: true,
        })
      }
      return Promise.resolve({})
    })

    mockGetUserPreferences.mockResolvedValue(null) // No user overrides
    mockSetUserPreferences.mockResolvedValue(true)
  })

  it('should load admin defaults and user preferences on mount', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockGetCategory).toHaveBeenCalledWith('ui')
    expect(mockGetCategory).toHaveBeenCalledWith('email')
    expect(mockGetUserPreferences).toHaveBeenCalledWith('user-123', 'ui')
    expect(mockGetUserPreferences).toHaveBeenCalledWith('user-123', 'email')
  })

  it('should report isAuthenticated as true when user exists', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(true)
  })

  it('should return empty preferences when user has none', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.preferences.ui).toEqual({})
    expect(result.current.preferences.email).toEqual({})
  })

  it('should load existing user preferences', async () => {
    mockGetUserPreferences.mockImplementation((_userId: string, category: string) => {
      if (category === 'ui') {
        return Promise.resolve({ default_items_per_page: 25 })
      }
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.preferences.ui).toEqual({ default_items_per_page: 25 })
  })

  it('should update a preference locally', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.updatePreference('ui', 'default_items_per_page', 25)
    })

    expect(result.current.preferences.ui.default_items_per_page).toBe(25)
  })

  it('should save preferences to database', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.updatePreference('ui', 'default_items_per_page', 25)
    })

    await act(async () => {
      await result.current.savePreferences()
    })

    expect(mockSetUserPreferences).toHaveBeenCalledWith(
      'user-123',
      'ui',
      { default_items_per_page: 25 }
    )
  })

  it('should show success message after saving', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.updatePreference('ui', 'default_items_per_page', 25)
    })

    await act(async () => {
      await result.current.savePreferences()
    })

    expect(result.current.successMessage).toBeTruthy()
  })

  it('should show error on save failure', async () => {
    mockSetUserPreferences.mockResolvedValue(false)

    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.updatePreference('ui', 'default_items_per_page', 25)
    })

    await act(async () => {
      await result.current.savePreferences()
    })

    expect(result.current.error).toBeTruthy()
  })

  it('should reset a single preference', async () => {
    mockGetUserPreferences.mockImplementation((_userId: string, category: string) => {
      if (category === 'ui') {
        return Promise.resolve({ default_items_per_page: 25 })
      }
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isModified('ui', 'default_items_per_page')).toBe(true)

    act(() => {
      result.current.resetPreference('ui', 'default_items_per_page')
    })

    expect(result.current.isModified('ui', 'default_items_per_page')).toBe(false)
    expect(result.current.preferences.ui.default_items_per_page).toBeUndefined()
  })

  it('should reset an entire category', async () => {
    mockGetUserPreferences.mockImplementation((_userId: string, category: string) => {
      if (category === 'ui') {
        return Promise.resolve({
          default_items_per_page: 25,
          toast_success_duration_ms: 5000,
        })
      }
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.resetCategory('ui')
    })

    expect(mockSetUserPreferences).toHaveBeenCalledWith('user-123', 'ui', {})
    expect(result.current.preferences.ui).toEqual({})
  })

  it('should return admin default values', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.getAdminDefault('ui', 'default_items_per_page')).toBe(10)
    expect(result.current.getAdminDefault('email', 'default_marketing_enabled')).toBe(true)
  })

  it('should return field metadata for categories', async () => {
    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const uiFields = result.current.getFieldMeta('ui')
    expect(uiFields.length).toBeGreaterThan(0)
    expect(uiFields[0]).toHaveProperty('key')
    expect(uiFields[0]).toHaveProperty('label')
    expect(uiFields[0]).toHaveProperty('type')

    const emailFields = result.current.getFieldMeta('email')
    expect(emailFields.length).toBeGreaterThan(0)
  })
})
