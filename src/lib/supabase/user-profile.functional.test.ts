/**
 * Functional tests for user-profile service
 * Tests all 4 exported functions with Supabase mocked as configured
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock setup ---

const mockSingle = vi.fn()
const mockSelect = vi.fn(() => ({ single: mockSingle }))
const mockEq = vi.fn(() => ({ single: mockSingle, select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const _mockDelete = vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) }))
const mockSelectHead = vi.fn()

const mockFrom = vi.fn((_table: string) => {
  // Return different chains depending on the table usage
  return {
    select: vi.fn((cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn(() => mockSelectHead()) }
      }
      return { eq: mockEq, single: mockSingle }
    }),
    update: mockUpdate,
    insert: mockInsert,
    delete: () => ({
      eq: vi.fn(() => ({ error: null })),
    }),
  }
})

const mockGetUser = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('./client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
  isSupabaseConfigured: () => true,
}))

import {
  fetchUserProfile,
  updateUserProfile,
  fetchUserStats,
  deleteUserAccount,
} from './user-profile'

const MOCK_USER_ROW = {
  id: 'user-123',
  email: 'test@example.com',
  full_name: 'Test User',
  avatar_url: 'https://example.com/avatar.png',
  locale: 'tr',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
}

describe('fetchUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return user profile when user exists', async () => {
    mockSingle.mockResolvedValueOnce({ data: MOCK_USER_ROW, error: null })
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          user_metadata: {
            full_name: 'Test User',
            phone: '+905551234567',
            location: 'Istanbul',
            company: 'InsurAI',
          },
        },
      },
    })

    const profile = await fetchUserProfile('user-123')

    expect(profile).not.toBeNull()
    expect(profile!.id).toBe('user-123')
    expect(profile!.email).toBe('test@example.com')
    expect(profile!.fullName).toBe('Test User')
    expect(profile!.phone).toBe('+905551234567')
    expect(profile!.location).toBe('Istanbul')
    expect(profile!.company).toBe('InsurAI')
    expect(profile!.locale).toBe('tr')
  })

  it('should return null when user not found (PGRST116)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    })

    const profile = await fetchUserProfile('nonexistent-user')
    expect(profile).toBeNull()
  })

  it('should throw on non-PGRST116 errors', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST500', message: 'Internal error' },
    })

    await expect(fetchUserProfile('user-123')).rejects.toEqual({
      code: 'PGRST500',
      message: 'Internal error',
    })
  })

  it('should handle null user_metadata gracefully', async () => {
    mockSingle.mockResolvedValueOnce({ data: MOCK_USER_ROW, error: null })
    mockGetUser.mockResolvedValueOnce({
      data: { user: { user_metadata: {} } },
    })

    const profile = await fetchUserProfile('user-123')

    expect(profile!.phone).toBeNull()
    expect(profile!.location).toBeNull()
    expect(profile!.company).toBeNull()
  })

  it('should prefer users table full_name over auth metadata', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...MOCK_USER_ROW, full_name: 'From DB' },
      error: null,
    })
    mockGetUser.mockResolvedValueOnce({
      data: { user: { user_metadata: { full_name: 'From Auth' } } },
    })

    const profile = await fetchUserProfile('user-123')
    expect(profile!.fullName).toBe('From DB')
  })

  it('should fallback to auth metadata when DB full_name is null', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...MOCK_USER_ROW, full_name: null },
      error: null,
    })
    mockGetUser.mockResolvedValueOnce({
      data: { user: { user_metadata: { full_name: 'From Auth' } } },
    })

    const profile = await fetchUserProfile('user-123')
    expect(profile!.fullName).toBe('From Auth')
  })

  it('should default locale to en when not set', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...MOCK_USER_ROW, locale: null },
      error: null,
    })
    mockGetUser.mockResolvedValueOnce({
      data: { user: { user_metadata: {} } },
    })

    const profile = await fetchUserProfile('user-123')
    expect(profile!.locale).toBe('en')
  })
})

describe('updateUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update existing user profile', async () => {
    mockUpdateUser.mockResolvedValueOnce({ error: null })
    // Check if user exists
    mockSingle.mockResolvedValueOnce({ data: { id: 'user-123' }, error: null })
    // Update returns updated row
    mockSingle.mockResolvedValueOnce({
      data: { ...MOCK_USER_ROW, full_name: 'Updated Name' },
      error: null,
    })

    const result = await updateUserProfile('user-123', {
      fullName: 'Updated Name',
      phone: '+905559876543',
    })

    expect(result.id).toBe('user-123')
    expect(result.fullName).toBe('Updated Name')
    expect(result.phone).toBe('+905559876543')
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({ full_name: 'Updated Name', phone: '+905559876543' }),
    })
  })

  it('should create user record if it does not exist', async () => {
    mockUpdateUser.mockResolvedValueOnce({ error: null })
    // User does NOT exist
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    // getUser for email
    mockGetUser.mockResolvedValueOnce({
      data: { user: { email: 'new@example.com' } },
    })
    // Insert returns new row
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'user-456',
        email: 'new@example.com',
        full_name: 'New User',
        avatar_url: null,
        locale: 'en',
        created_at: '2024-06-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
      },
      error: null,
    })

    const result = await updateUserProfile('user-456', {
      fullName: 'New User',
      locale: 'en',
    })

    expect(result.id).toBe('user-456')
    expect(result.email).toBe('new@example.com')
    expect(result.fullName).toBe('New User')
  })

  it('should throw when auth update fails', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      error: { message: 'Auth error', status: 401 },
    })

    await expect(
      updateUserProfile('user-123', { fullName: 'Fail' })
    ).rejects.toEqual({ message: 'Auth error', status: 401 })
  })

  it('should throw when DB update fails', async () => {
    mockUpdateUser.mockResolvedValueOnce({ error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'user-123' }, error: null })
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST500', message: 'DB error' },
    })

    await expect(
      updateUserProfile('user-123', { fullName: 'Fail' })
    ).rejects.toEqual({ code: 'PGRST500', message: 'DB error' })
  })

  it('should pass locale to user update', async () => {
    mockUpdateUser.mockResolvedValueOnce({ error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'user-123' }, error: null })
    mockSingle.mockResolvedValueOnce({
      data: { ...MOCK_USER_ROW, locale: 'tr' },
      error: null,
    })

    const result = await updateUserProfile('user-123', { locale: 'tr' })
    expect(result.locale).toBe('tr')
  })
})

describe('fetchUserStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return stats based on policy count', async () => {
    mockSelectHead.mockReturnValueOnce({ count: 12, error: null })

    const stats = await fetchUserStats('user-123')

    expect(stats.policiesAnalyzed).toBe(12)
    expect(stats.comparisons).toBe(6) // floor(12/2)
    expect(stats.savedReports).toBe(4) // floor(12/3)
  })

  it('should return zero stats when no policies exist', async () => {
    mockSelectHead.mockReturnValueOnce({ count: 0, error: null })

    const stats = await fetchUserStats('user-123')

    expect(stats.policiesAnalyzed).toBe(0)
    expect(stats.comparisons).toBe(0)
    expect(stats.savedReports).toBe(0)
  })

  it('should return zero stats on error', async () => {
    mockSelectHead.mockReturnValueOnce({
      count: null,
      error: { message: 'Query failed' },
    })

    const stats = await fetchUserStats('user-123')

    expect(stats.policiesAnalyzed).toBe(0)
    expect(stats.comparisons).toBe(0)
    expect(stats.savedReports).toBe(0)
  })

  it('should handle null count gracefully', async () => {
    mockSelectHead.mockReturnValueOnce({ count: null, error: null })

    const stats = await fetchUserStats('user-123')
    expect(stats.policiesAnalyzed).toBe(0)
  })

  it('should calculate comparisons as floor(policies/2)', async () => {
    mockSelectHead.mockReturnValueOnce({ count: 7, error: null })

    const stats = await fetchUserStats('user-123')
    expect(stats.comparisons).toBe(3) // floor(7/2)
  })

  it('should calculate savedReports as floor(policies/3)', async () => {
    mockSelectHead.mockReturnValueOnce({ count: 10, error: null })

    const stats = await fetchUserStats('user-123')
    expect(stats.savedReports).toBe(3) // floor(10/3)
  })
})

describe('deleteUserAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete policies then user record', async () => {
    // Both deletions succeed
    const result = await deleteUserAccount('user-123')
    expect(result).toBeUndefined()
    // Verify from was called (policies table first)
    expect(mockFrom).toHaveBeenCalledWith('policies')
    expect(mockFrom).toHaveBeenCalledWith('users')
  })

  it('should throw when policy deletion fails', async () => {
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: vi.fn(() => ({ error: { message: 'Policy delete failed' } })),
      }),
    })

    await expect(deleteUserAccount('user-123')).rejects.toThrow(
      'Failed to delete policies: Policy delete failed'
    )
  })

  it('should throw when user record deletion fails', async () => {
    // First call (policies) succeeds
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: vi.fn(() => ({ error: null })),
      }),
    })
    // Second call (users) fails
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: vi.fn(() => ({ error: { message: 'User delete failed' } })),
      }),
    })

    await expect(deleteUserAccount('user-123')).rejects.toThrow(
      'Failed to delete user record: User delete failed'
    )
  })
})
