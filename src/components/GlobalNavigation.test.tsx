/**
 * GlobalNavigation Component Tests
 *
 * Tests for the main navigation bar component including
 * navigation links, profile menu, and accessibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { GlobalNavigation } from './GlobalNavigation'

// Mock hooks and dependencies
const mockNavigate = vi.fn()
const mockSignOut = vi.fn()

const mockPolicies = [
  { id: '1', policyNumber: 'POL-001' },
  { id: '2', policyNumber: 'POL-002' },
]

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
}

// Mutable mock user — set to null for anonymous user tests
let currentMockUser: typeof mockUser | null = mockUser

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/dashboard' }),
  }
})

vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    policies: mockPolicies,
  }),
}))

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: currentMockUser,
    signOut: mockSignOut,
  }),
}))

function renderNavigation() {
  return render(
    <BrowserRouter>
      <GlobalNavigation />
    </BrowserRouter>
  )
}

describe('GlobalNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
  })

  describe('Rendering', () => {
    it('should render the navigation bar', () => {
      renderNavigation()

      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    it('should render the InsurAI logo', () => {
      renderNavigation()

      expect(screen.getByText('InsurAI')).toBeInTheDocument()
      expect(screen.getByText('Policy Analysis')).toBeInTheDocument()
    })

    it('should render the home link', () => {
      renderNavigation()

      expect(screen.getByLabelText('Go to home page')).toBeInTheDocument()
    })

    it('should render main navigation links', () => {
      renderNavigation()

      expect(screen.getByRole('menuitem', { name: /dashboard/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /compare/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /chat/i })).toBeInTheDocument()
    })

    it('should render search button', () => {
      renderNavigation()

      expect(screen.getByLabelText('Search policies')).toBeInTheDocument()
    })

    it('should render notifications button', () => {
      renderNavigation()

      expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument()
    })

    it('should render upload button', () => {
      renderNavigation()

      // Upload can be a button (triggers file picker) or a link to /upload
      const uploadElement = screen.queryByRole('link', { name: /upload/i }) ||
                           screen.queryByRole('button', { name: /upload/i })
      expect(uploadElement).toBeInTheDocument()
    })

    it('should render profile menu button', () => {
      renderNavigation()

      expect(screen.getByLabelText('User menu')).toBeInTheDocument()
    })
  })

  describe('Active State', () => {
    it('should mark current page as active', () => {
      renderNavigation()

      const dashboardLink = screen.getByRole('menuitem', { name: /dashboard/i })
      expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('Policy Count Badge', () => {
    it('should show policy count badge on chat link when user is logged in', () => {
      renderNavigation()

      // The badge shows count for loaded policies (user is logged in via mock)
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should render notification button with correct aria attributes', () => {
      renderNavigation()

      const notifButton = screen.getByLabelText('Notifications')
      expect(notifButton).toBeInTheDocument()
      expect(notifButton).toHaveAttribute('aria-haspopup', 'true')
    })

    it('should open notification dropdown when clicked by logged-in user', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('Notifications'))

      await waitFor(() => {
        expect(screen.getByText('No notifications yet')).toBeInTheDocument()
      })
    })
  })

  describe('Profile Menu', () => {
    it('should open profile menu when clicked', async () => {
      const user = userEvent.setup()
      renderNavigation()

      const menuButton = screen.getByLabelText('User menu')
      await user.click(menuButton)

      await waitFor(() => {
        expect(screen.getByRole('menu', { name: 'User menu' })).toBeInTheDocument()
      })
    })

    it('should show user info in profile menu', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument()
        expect(screen.getByText('test@example.com')).toBeInTheDocument()
      })
    })

    it('should show menu items in profile menu', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /my account/i })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /help center/i })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
      })
    })

    it('should close profile menu when clicking outside', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menu', { name: 'User menu' })).toBeInTheDocument()
      })

      // Click on the overlay
      const overlay = document.querySelector('.fixed.inset-0')
      if (overlay) {
        await user.click(overlay)
      }

      await waitFor(() => {
        expect(screen.queryByRole('menu', { name: 'User menu' })).not.toBeInTheDocument()
      })
    })

    it('should navigate to account when My Account is clicked', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /my account/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: /my account/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/account')
    })

    it('should navigate to settings when Settings is clicked', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: /settings/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })

    it('should navigate to help when Help Center is clicked', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /help center/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: /help center/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/help')
    })

    it('should call signOut and navigate when Sign Out is clicked', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })

    it('should navigate to home even if signOut fails', async () => {
      mockSignOut.mockRejectedValueOnce(new Error('Sign out failed'))
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })
  })

  describe('Keyboard Navigation', () => {
    it('should close menu on Escape key', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        expect(screen.getByRole('menu', { name: 'User menu' })).toBeInTheDocument()
      })

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByRole('menu', { name: 'User menu' })).not.toBeInTheDocument()
      })
    })

    it('should focus first menu item when menu opens', async () => {
      const user = userEvent.setup()
      renderNavigation()

      await user.click(screen.getByLabelText('User menu'))

      await waitFor(() => {
        const menu = screen.getByRole('menu', { name: 'User menu' })
        const firstMenuItem = within(menu).getAllByRole('menuitem')[0]
        expect(document.activeElement).toBe(firstMenuItem)
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper navigation aria-label', () => {
      renderNavigation()

      const nav = screen.getByRole('navigation')
      expect(nav).toHaveAttribute('aria-label', 'Main navigation')
    })

    it('should have proper menubar role', () => {
      renderNavigation()

      expect(screen.getByRole('menubar')).toBeInTheDocument()
    })

    it('should have aria-expanded on profile menu button', async () => {
      const user = userEvent.setup()
      renderNavigation()

      const menuButton = screen.getByLabelText('User menu')
      expect(menuButton).toHaveAttribute('aria-expanded', 'false')
      expect(menuButton).toHaveAttribute('aria-haspopup', 'menu')

      await user.click(menuButton)

      await waitFor(() => {
        expect(menuButton).toHaveAttribute('aria-expanded', 'true')
      })
    })
  })
})

describe('GlobalNavigation - No User', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentMockUser = null
    mockSignOut.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Restore default mock user
    currentMockUser = mockUser
  })

  it('should hide policy count badge when user is not logged in', () => {
    renderNavigation()

    // Badge showing "2" should NOT be present for anonymous users
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  it('should navigate to auth when anonymous user clicks notification bell', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByLabelText('Notifications'))

    expect(mockNavigate).toHaveBeenCalledWith('/auth')
    // Should NOT show notification dropdown
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument()
  })

  it('should show Sign In button in profile menu instead of Sign Out', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByLabelText('User menu'))

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /sign in/i })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    })
  })
})
