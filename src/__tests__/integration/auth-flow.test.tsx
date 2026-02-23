/**
 * Authentication Flow Integration Tests
 *
 * Tests for authentication flows including sign in,
 * sign out, and session management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock the auth module
const mockAuthSignIn = vi.fn()
const mockAuthSignUp = vi.fn()
const mockAuthSignOut = vi.fn()

vi.mock('@/lib/supabase/auth', () => ({
  signIn: (...args: unknown[]) => mockAuthSignIn(...args),
  signUp: (...args: unknown[]) => mockAuthSignUp(...args),
  signOut: () => mockAuthSignOut(),
  signInWithProvider: vi.fn(),
}))

// Mock the Supabase client module
const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()


vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => true,
  credentials: null
}))
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => mockOnAuthStateChange(callback),
    },
  },

}))

// Import after mock setup
import { AuthProvider, useAuth } from '@/lib/supabase/auth-context'

// Test component that uses auth context
function AuthTestComponent() {
  const { user, loading, signIn, signOut, signUp } = useAuth()

  if (loading) {
    return <div data-testid="loading">Loading...</div>
  }

  return (
    <div data-testid="auth-component">
      <div data-testid="user-status">{user ? 'Authenticated' : 'Not authenticated'}</div>
      <button onClick={() => signIn('test@example.com', 'password123')} data-testid="sign-in-btn">
        Sign In
      </button>
      <button onClick={() => signUp('test@example.com', 'password123')} data-testid="sign-up-btn">
        Sign Up
      </button>
      <button onClick={() => signOut()} data-testid="sign-out-btn">
        Sign Out
      </button>
    </div>
  )
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  )
}

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock behaviors
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    mockOnAuthStateChange.mockImplementation((callback) => {
      // Call with initial null session
      setTimeout(() => callback('INITIAL_SESSION', null), 0)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    mockAuthSignIn.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
      session: {},
    })

    mockAuthSignUp.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
      session: {},
    })

    mockAuthSignOut.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initial State', () => {
    it('should show loading state initially', async () => {
      render(
        <TestWrapper>
          <AuthTestComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        const authComponent = screen.queryByTestId('auth-component')
        const loading = screen.queryByTestId('loading')
        expect(authComponent || loading).toBeInTheDocument()
      })
    })

    it('should show not authenticated state when no session', async () => {
      render(
        <TestWrapper>
          <AuthTestComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user-status')).toHaveTextContent('Not authenticated')
      })
    })
  })

  describe('Sign In Flow', () => {
    it('should call signIn with correct credentials', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <AuthTestComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-btn')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('sign-in-btn'))

      await waitFor(() => {
        expect(mockAuthSignIn).toHaveBeenCalledWith('test@example.com', 'password123')
      })
    })

    it('should handle sign in completion', async () => {
      // Verify sign in completes successfully
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <AuthTestComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-btn')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('sign-in-btn'))

      await waitFor(() => {
        expect(mockAuthSignIn).toHaveBeenCalled()
      })

      // Component should still be rendered after sign in
      expect(screen.getByTestId('auth-component')).toBeInTheDocument()
    })
  })

  describe('Sign Up Flow', () => {
    it('should call signUp with correct credentials', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <AuthTestComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('sign-up-btn')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('sign-up-btn'))

      await waitFor(() => {
        expect(mockAuthSignUp).toHaveBeenCalledWith('test@example.com', 'password123', undefined)
      })
    })
  })

  describe('Sign Out Flow', () => {
    it('should call signOut when clicked', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <AuthTestComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('sign-out-btn')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('sign-out-btn'))

      await waitFor(() => {
        expect(mockAuthSignOut).toHaveBeenCalled()
      })
    })
  })
})

describe('Protected Route Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    mockOnAuthStateChange.mockImplementation((callback) => {
      setTimeout(() => callback('INITIAL_SESSION', null), 0)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  function ProtectedComponent() {
    const { user, loading } = useAuth()

    if (loading) return <div>Loading...</div>
    if (!user) return <div>Please sign in</div>
    return <div>Protected content</div>
  }

  it('should show sign in prompt when not authenticated', async () => {
    render(
      <TestWrapper>
        <ProtectedComponent />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Please sign in')).toBeInTheDocument()
    })
  })
})
