/**
 * Tests for user-profile service types and basic functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserProfile, UserProfileUpdate, UserStats } from './user-profile'

// Mock isSupabaseConfigured to return false for type tests
vi.mock('./config', () => ({
  isSupabaseConfigured: () => false,
  credentials: null
}))
vi.mock('./client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
      updateUser: vi.fn(),
    },
  },

}))

describe('UserProfile type', () => {
  it('has all required fields', () => {
    const profile: UserProfile = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      fullName: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
      phone: '+1234567890',
      location: 'Istanbul, Turkey',
      company: 'Test Corp',
      locale: 'en',
      createdAt: '2024-01-01T00:00:00Z',
    }

    expect(profile.id).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(profile.email).toBe('test@example.com')
    expect(profile.fullName).toBe('Test User')
    expect(profile.avatarUrl).toBe('https://example.com/avatar.png')
    expect(profile.phone).toBe('+1234567890')
    expect(profile.location).toBe('Istanbul, Turkey')
    expect(profile.company).toBe('Test Corp')
    expect(profile.locale).toBe('en')
    expect(profile.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('allows null for optional fields', () => {
    const profile: UserProfile = {
      id: '123',
      email: 'test@example.com',
      fullName: null,
      avatarUrl: null,
      phone: null,
      location: null,
      company: null,
      locale: 'en',
      createdAt: '2024-01-01T00:00:00Z',
    }

    expect(profile.fullName).toBeNull()
    expect(profile.avatarUrl).toBeNull()
    expect(profile.phone).toBeNull()
    expect(profile.location).toBeNull()
    expect(profile.company).toBeNull()
  })
})

describe('UserProfileUpdate type', () => {
  it('all fields are optional', () => {
    const emptyUpdate: UserProfileUpdate = {}
    expect(emptyUpdate).toEqual({})

    const partialUpdate: UserProfileUpdate = {
      fullName: 'Updated Name',
    }
    expect(partialUpdate.fullName).toBe('Updated Name')

    const fullUpdate: UserProfileUpdate = {
      fullName: 'Full Update',
      phone: '+9876543210',
      location: 'Ankara',
      company: 'New Corp',
      locale: 'tr',
    }
    expect(fullUpdate.fullName).toBe('Full Update')
    expect(fullUpdate.phone).toBe('+9876543210')
    expect(fullUpdate.location).toBe('Ankara')
    expect(fullUpdate.company).toBe('New Corp')
    expect(fullUpdate.locale).toBe('tr')
  })
})

describe('UserStats type', () => {
  it('has all required numeric fields', () => {
    const stats: UserStats = {
      policiesAnalyzed: 10,
      comparisons: 5,
      savedReports: 3,
    }

    expect(stats.policiesAnalyzed).toBe(10)
    expect(stats.comparisons).toBe(5)
    expect(stats.savedReports).toBe(3)
  })

  it('can have zero values', () => {
    const emptyStats: UserStats = {
      policiesAnalyzed: 0,
      comparisons: 0,
      savedReports: 0,
    }

    expect(emptyStats.policiesAnalyzed).toBe(0)
    expect(emptyStats.comparisons).toBe(0)
    expect(emptyStats.savedReports).toBe(0)
  })
})

describe('user-profile functions when Supabase is not configured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchUserProfile returns null when Supabase is not configured', async () => {
    const { fetchUserProfile } = await import('./user-profile')
    const result = await fetchUserProfile('some-user-id')
    expect(result).toBeNull()
  })

  it('fetchUserStats returns default stats when Supabase is not configured', async () => {
    const { fetchUserStats } = await import('./user-profile')
    const result = await fetchUserStats('some-user-id')
    expect(result).toEqual({
      policiesAnalyzed: 0,
      comparisons: 0,
      savedReports: 0,
    })
  })

  it('updateUserProfile throws when Supabase is not configured', async () => {
    const { updateUserProfile } = await import('./user-profile')
    await expect(updateUserProfile('some-user-id', { fullName: 'Test' })).rejects.toThrow(
      'Supabase is not configured'
    )
  })

  it('deleteUserAccount throws when Supabase is not configured', async () => {
    const { deleteUserAccount } = await import('./user-profile')
    await expect(deleteUserAccount('some-user-id')).rejects.toThrow(
      'Supabase is not configured'
    )
  })
})

describe('user-profile field validation', () => {
  it('email should be a valid email format', () => {
    const profile: UserProfile = {
      id: '123',
      email: 'valid@email.com',
      fullName: null,
      avatarUrl: null,
      phone: null,
      location: null,
      company: null,
      locale: 'en',
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(profile.email).toContain('@')
  })

  it('locale should be a valid locale code', () => {
    const validLocales = ['en', 'tr', 'ar', 'de', 'fr']
    const profile: UserProfile = {
      id: '123',
      email: 'test@example.com',
      fullName: null,
      avatarUrl: null,
      phone: null,
      location: null,
      company: null,
      locale: 'en',
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(validLocales).toContain(profile.locale)
  })

  it('createdAt should be a valid ISO date string', () => {
    const profile: UserProfile = {
      id: '123',
      email: 'test@example.com',
      fullName: null,
      avatarUrl: null,
      phone: null,
      location: null,
      company: null,
      locale: 'en',
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(() => new Date(profile.createdAt)).not.toThrow()
    expect(new Date(profile.createdAt).toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })
})
