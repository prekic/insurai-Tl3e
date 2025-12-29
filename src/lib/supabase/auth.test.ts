import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Use vi.hoisted to define mocks before module hoisting
const { mockSupabaseAuth, mockIsConfigured } = vi.hoisted(() => ({
  mockSupabaseAuth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  mockIsConfigured: vi.fn(() => true),
}))

vi.mock('./client', () => ({
  supabase: {
    auth: mockSupabaseAuth,
  },
  isSupabaseConfigured: mockIsConfigured,
}))

// Import after mocking
import {
  signUp,
  signIn,
  signInWithProvider,
  signOut,
  getSession,
  getUser,
  resetPassword,
  updatePassword,
  updateProfile,
  onAuthStateChange,
} from './auth'

describe('Auth Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure isSupabaseConfigured returns true for all tests
    mockIsConfigured.mockReturnValue(true)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('signUp', () => {
    it('should call supabase signUp with email and password', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const result = await signUp('test@example.com', 'password123')

      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: { full_name: undefined },
        },
      })
      expect(result.user).toEqual(mockUser)
    })

    it('should include full name in metadata when provided', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: { id: '123' } },
        error: null,
      })

      await signUp('test@example.com', 'password123', 'John Doe')

      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: { full_name: 'John Doe' },
        },
      })
    })

    it('should throw error when signUp fails', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: null,
        error: { message: 'Email already exists' },
      })

      await expect(signUp('test@example.com', 'password123')).rejects.toThrow(
        'Email already exists'
      )
    })
  })

  describe('signIn', () => {
    it('should call supabase signInWithPassword', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const result = await signIn('test@example.com', 'password123')

      expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result.user).toEqual(mockUser)
    })

    it('should throw error when signIn fails', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid credentials' },
      })

      await expect(signIn('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials'
      )
    })
  })

  describe('signInWithProvider', () => {
    it('should call supabase signInWithOAuth for Google', async () => {
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://google.com/oauth' },
        error: null,
      })

      await signInWithProvider('google')

      expect(mockSupabaseAuth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: expect.stringContaining('/auth/callback'),
        },
      })
    })

    it('should call supabase signInWithOAuth for GitHub', async () => {
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://github.com/oauth' },
        error: null,
      })

      await signInWithProvider('github')

      expect(mockSupabaseAuth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: expect.stringContaining('/auth/callback'),
        },
      })
    })

    it('should throw error when OAuth fails', async () => {
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: null,
        error: { message: 'OAuth failed' },
      })

      await expect(signInWithProvider('google')).rejects.toThrow('OAuth failed')
    })
  })

  describe('signOut', () => {
    it('should call supabase signOut', async () => {
      mockSupabaseAuth.signOut.mockResolvedValue({ error: null })

      await signOut()

      expect(mockSupabaseAuth.signOut).toHaveBeenCalled()
    })

    it('should throw error when signOut fails', async () => {
      mockSupabaseAuth.signOut.mockResolvedValue({
        error: { message: 'Sign out failed' },
      })

      await expect(signOut()).rejects.toThrow('Sign out failed')
    })
  })

  describe('getSession', () => {
    it('should return session when available', async () => {
      const mockSession = { access_token: 'token', user: { id: '123' } }
      mockSupabaseAuth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      const result = await getSession()

      expect(result).toEqual(mockSession)
    })

    it('should return null when no session', async () => {
      mockSupabaseAuth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const result = await getSession()

      expect(result).toBeNull()
    })
  })

  describe('getUser', () => {
    it('should return user when available', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const result = await getUser()

      expect(result).toEqual(mockUser)
    })

    it('should return null when no user', async () => {
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const result = await getUser()

      expect(result).toBeNull()
    })
  })

  describe('resetPassword', () => {
    it('should call resetPasswordForEmail', async () => {
      mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({ error: null })

      await resetPassword('test@example.com')

      expect(mockSupabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        { redirectTo: expect.stringContaining('/reset-password') }
      )
    })

    it('should throw error when reset fails', async () => {
      mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'Email not found' },
      })

      await expect(resetPassword('notfound@example.com')).rejects.toThrow(
        'Email not found'
      )
    })
  })

  describe('updatePassword', () => {
    it('should call updateUser with new password', async () => {
      mockSupabaseAuth.updateUser.mockResolvedValue({
        data: { user: { id: '123' } },
        error: null,
      })

      await updatePassword('newpassword123')

      expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({
        password: 'newpassword123',
      })
    })

    it('should throw error when update fails', async () => {
      mockSupabaseAuth.updateUser.mockResolvedValue({
        error: { message: 'Password too weak' },
      })

      await expect(updatePassword('weak')).rejects.toThrow('Password too weak')
    })
  })

  describe('updateProfile', () => {
    it('should call updateUser with profile data', async () => {
      mockSupabaseAuth.updateUser.mockResolvedValue({
        data: { user: { id: '123' } },
        error: null,
      })

      await updateProfile({ fullName: 'John Doe', avatarUrl: 'https://example.com/avatar.jpg' })

      expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({
        data: { full_name: 'John Doe', avatar_url: 'https://example.com/avatar.jpg' },
      })
    })
  })

  describe('onAuthStateChange', () => {
    it('should register auth state change listener', () => {
      const callback = vi.fn()
      const mockResult = {
        data: { subscription: { unsubscribe: vi.fn() } },
      }
      mockSupabaseAuth.onAuthStateChange.mockReturnValue(mockResult)

      const result = onAuthStateChange(callback)

      expect(mockSupabaseAuth.onAuthStateChange).toHaveBeenCalledWith(callback)
      expect(result).toEqual(mockResult)
    })
  })
})
