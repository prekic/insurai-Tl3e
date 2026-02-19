/**
 * AuthPage Coverage Tests
 *
 * Comprehensive tests targeting uncovered branches, functions, and statements.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthPage } from './AuthPage'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial: _i, animate: _a, exit: _e, className, ...rest } = props
      return <div className={className as string} {...rest}>{children as React.ReactNode}</div>
    },
    h1: ({ children, ...props }: Record<string, unknown>) => {
      const { initial: _i, animate: _a, exit: _e, className, ...rest } = props
      return <h1 className={className as string} {...rest}>{children as React.ReactNode}</h1>
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: EN_TRANSLATIONS, locale: 'en', isRTL: false }),
}))

// Auth mock control
let mockUser: Record<string, unknown> | null = null
let mockLoading = false
let mockIsConfigured = true
const mockSignIn = vi.fn()
const mockSignUp = vi.fn()
const mockSignInWithGoogle = vi.fn()
const mockSignInWithGithub = vi.fn()

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
    isConfigured: mockIsConfigured,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithGithub: mockSignInWithGithub,
  }),
}))

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function renderAuth(initialEntries = ['/auth']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthPage />
    </MemoryRouter>
  )
}

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = null
    mockLoading = false
    mockIsConfigured = true
    mockSignIn.mockResolvedValue(undefined)
    mockSignUp.mockResolvedValue(undefined)
    mockSignInWithGoogle.mockResolvedValue(undefined)
    mockSignInWithGithub.mockResolvedValue(undefined)
  })

  // --- Not configured state ---
  describe('auth not configured', () => {
    beforeEach(() => { mockIsConfigured = false })

    it('shows auth not configured message', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.authNotConfigured)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.auth.authNotConfiguredDesc)).toBeInTheDocument()
    })

    it('shows continue to demo button', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.continueToDemo)).toBeInTheDocument()
    })

    it('navigates to dashboard when continue button clicked', () => {
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.continueToDemo))
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  // --- Sign in mode ---
  describe('sign in mode (default)', () => {
    it('shows Welcome back heading', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.welcomeBack)).toBeInTheDocument()
    })

    it('shows email and password fields', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.email)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.auth.password)).toBeInTheDocument()
    })

    it('shows sign in button', () => {
      renderAuth()
      expect(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) })).toBeInTheDocument()
    })

    it('shows forgot password link', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.forgotPassword)).toBeInTheDocument()
    })

    it('does not show full name or confirm password fields', () => {
      renderAuth()
      expect(screen.queryByText(EN_TRANSLATIONS.auth.fullName)).not.toBeInTheDocument()
      expect(screen.queryByText(EN_TRANSLATIONS.auth.confirmPassword)).not.toBeInTheDocument()
    })

    it('shows sign up toggle link', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.signUp)).toBeInTheDocument()
    })

    it('shows OAuth buttons', () => {
      renderAuth()
      expect(screen.getByText(EN_TRANSLATIONS.auth.google)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.auth.github)).toBeInTheDocument()
    })
  })

  // --- Toggle between modes ---
  describe('mode toggling', () => {
    it('switches to signup mode', () => {
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      expect(screen.getByText(EN_TRANSLATIONS.auth.createYourAccount)).toBeInTheDocument()
    })

    it('shows full name and confirm password in signup mode', () => {
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      expect(screen.getByText(EN_TRANSLATIONS.auth.fullName)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.auth.confirmPassword)).toBeInTheDocument()
    })

    it('switches back to signin mode', () => {
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      // Now in signup mode, click sign in link
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signIn))
      expect(screen.getByText(EN_TRANSLATIONS.auth.welcomeBack)).toBeInTheDocument()
    })

    it('clears error when toggling modes', () => {
      renderAuth()
      // Trigger an error by submitting empty form
      fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      // Toggle to signup
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      // Error should be cleared
      expect(screen.queryByText(EN_TRANSLATIONS.auth.invalidEmail)).not.toBeInTheDocument()
    })
  })

  // --- Form validation ---
  describe('form validation', () => {
    it('shows invalid email error', async () => {
      renderAuth()
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'invalid' } })
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      expect(screen.getByText(EN_TRANSLATIONS.auth.invalidEmail)).toBeInTheDocument()
    })

    it('shows password too short error', async () => {
      renderAuth()
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '12345' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      expect(screen.getByText(EN_TRANSLATIONS.auth.passwordTooShort)).toBeInTheDocument()
    })

    it('shows password mismatch error in signup mode', async () => {
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const passwordInputs = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(passwordInputs[0], { target: { value: '123456' } })
      fireEvent.change(passwordInputs[1], { target: { value: '654321' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.createAccount) }))
      })
      expect(screen.getByText(EN_TRANSLATIONS.auth.passwordMismatch)).toBeInTheDocument()
    })

    it('shows no error for empty email', async () => {
      renderAuth()
      // Submit without entering anything - email empty
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      expect(screen.getByText(EN_TRANSLATIONS.auth.invalidEmail)).toBeInTheDocument()
    })
  })

  // --- Successful sign in ---
  describe('successful sign in', () => {
    it('calls signIn and navigates', async () => {
      renderAuth()
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', '123456')
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })

    it('shows welcome back toast on sign in', async () => {
      renderAuth()
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      const { toast } = await import('sonner')
      expect(toast.success).toHaveBeenCalledWith(EN_TRANSLATIONS.auth.welcomeBack)
    })
  })

  // --- Successful sign up ---
  describe('successful sign up', () => {
    it('calls signUp and shows success', async () => {
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
      const passwordInputs = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(passwordInputs[0], { target: { value: '123456' } })
      fireEvent.change(passwordInputs[1], { target: { value: '123456' } })
      const nameInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.namePlaceholder)
      fireEvent.change(nameInput, { target: { value: 'New User' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.createAccount) }))
      })
      expect(mockSignUp).toHaveBeenCalledWith('new@example.com', '123456', 'New User')
    })
  })

  // --- Sign in error ---
  describe('sign in error', () => {
    it('shows sign in error message', async () => {
      mockSignIn.mockRejectedValue(new Error('Wrong password'))
      renderAuth()
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      expect(screen.getByText(EN_TRANSLATIONS.auth.signInError)).toBeInTheDocument()
    })
  })

  // --- Sign up error ---
  describe('sign up error', () => {
    it('shows sign up error message', async () => {
      mockSignUp.mockRejectedValue(new Error('Email taken'))
      renderAuth()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signUp))
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
      const passwordInputs = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(passwordInputs[0], { target: { value: '123456' } })
      fireEvent.change(passwordInputs[1], { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.createAccount) }))
      })
      expect(screen.getByText(EN_TRANSLATIONS.auth.signUpError)).toBeInTheDocument()
    })
  })

  // --- OAuth sign in ---
  describe('OAuth sign in', () => {
    it('calls signInWithGoogle', async () => {
      renderAuth()
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.google))
      })
      expect(mockSignInWithGoogle).toHaveBeenCalled()
    })

    it('calls signInWithGithub', async () => {
      renderAuth()
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.github))
      })
      expect(mockSignInWithGithub).toHaveBeenCalled()
    })

    it('shows error toast on OAuth failure (google)', async () => {
      mockSignInWithGoogle.mockRejectedValue(new Error('OAuth failed'))
      renderAuth()
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.google))
      })
      const { toast } = await import('sonner')
      expect(toast.error).toHaveBeenCalledWith(EN_TRANSLATIONS.auth.signInError)
    })

    it('shows error toast on OAuth failure (github)', async () => {
      mockSignInWithGithub.mockRejectedValue(new Error('OAuth failed'))
      renderAuth()
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.github))
      })
      const { toast } = await import('sonner')
      expect(toast.error).toHaveBeenCalledWith(EN_TRANSLATIONS.auth.signInError)
    })
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('disables submit button when loading', () => {
      mockLoading = true
      renderAuth()
      const submitBtn = screen.getByRole('button', { name: '' }) // Loader2 with no text
      expect(submitBtn).toBeDisabled()
    })
  })

  // --- Redirect path from state ---
  describe('redirect path', () => {
    it('uses from state for redirect after login', async () => {
      render(
        <MemoryRouter initialEntries={[{ pathname: '/auth', state: { from: '/settings' } }]}>
          <AuthPage />
        </MemoryRouter>
      )
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.auth.emailPlaceholder)
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(passwordInput, { target: { value: '123456' } })
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.auth.signIn) }))
      })
      expect(mockNavigate).toHaveBeenCalledWith('/settings', { replace: true })
    })
  })
})
