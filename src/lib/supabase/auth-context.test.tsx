import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './auth-context'

// Mock the Supabase client and auth functions
const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockSignIn = vi.fn()
const mockSignUp = vi.fn()
const mockSignOut = vi.fn()
const mockSignInWithProvider = vi.fn()


vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  credentials: null
}))
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockOnAuthStateChange(callback)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  },

}))

vi.mock('@/lib/supabase/auth', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  signOut: () => mockSignOut(),
  signInWithProvider: (...args: unknown[]) => mockSignInWithProvider(...args),
}))

// Test component that uses the auth context
function TestConsumer() {
  const { user, loading, isConfigured, signIn, signUp, signOut } = useAuth()

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="configured">{isConfigured ? 'configured' : 'not-configured'}</div>
      <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
      <button onClick={() => signUp('test@example.com', 'password', 'Test User')}>
        Sign Up
      </button>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: null } })
  })

  describe('AuthProvider', () => {
    it('should provide initial loading state', async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      // Children render immediately (no blocking), initially loading=true
      expect(screen.getByTestId('loading')).toHaveTextContent('loading')

      // After session check, loading becomes false
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })
    })

    it('should show no user when not authenticated', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } })

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no-user')
      })
    })

    it('should show user when session exists', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
      })

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
      })
    })

    it('should indicate Supabase is configured', async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('configured')).toHaveTextContent('configured')
      })
    })
  })

  describe('signIn', () => {
    it('should call auth signIn function', async () => {
      const user = userEvent.setup()
      mockSignIn.mockResolvedValue({})

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      await user.click(screen.getByText('Sign In'))

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password')
      })
    })
  })

  describe('signUp', () => {
    it('should call auth signUp function with full name', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({})

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      await user.click(screen.getByText('Sign Up'))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password', 'Test User')
      })
    })
  })

  describe('signOut', () => {
    it('should call auth signOut function', async () => {
      const user = userEvent.setup()
      mockSignOut.mockResolvedValue({})

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      await user.click(screen.getByText('Sign Out'))

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })
    })
  })

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('useAuth must be used within an AuthProvider')

      consoleSpy.mockRestore()
    })
  })
})
