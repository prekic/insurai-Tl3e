/**
 * Navigation Flow Integration Tests
 *
 * Tests for application routing and navigation
 * between different views.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/lib/supabase/auth-context'
import { PolicyProvider } from '@/lib/policy-context'

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
  isSupabaseConfigured: () => false,
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  fetchPolicies: vi.fn().mockResolvedValue([]),
  createPolicy: vi.fn().mockResolvedValue({ id: 'new-id' }),
  deleteSupabasePolicy: vi.fn().mockResolvedValue(undefined),
  updateSupabasePolicy: vi.fn().mockResolvedValue(undefined),
  getPolicyStats: vi.fn().mockResolvedValue({
    total: 0,
    byType: {},
    avgRiskScore: 0,
    totalGaps: 0,
  }),
}))

// Simple test components for routing
function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link to="/dashboard">Go to Dashboard</Link>
      <Link to="/upload">Go to Upload</Link>
    </div>
  )
}

function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Link to="/">Go Home</Link>
    </div>
  )
}

function UploadPage() {
  return (
    <div>
      <h1>Upload</h1>
      <Link to="/">Go Home</Link>
    </div>
  )
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function TestApp({ initialPath = '/' }: { initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <PolicyProvider>
          <LocationDisplay />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
          </Routes>
        </PolicyProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('Navigation Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initial Routing', () => {
    it('should render home page at root path', () => {
      render(<TestApp />)

      expect(screen.getByText('Home Page')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/')
    })

    it('should render dashboard at /dashboard path', () => {
      render(<TestApp initialPath="/dashboard" />)

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    })

    it('should render upload at /upload path', () => {
      render(<TestApp initialPath="/upload" />)

      expect(screen.getByText('Upload')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/upload')
    })
  })

  describe('Link Navigation', () => {
    it('should navigate from home to dashboard', async () => {
      const user = userEvent.setup()
      render(<TestApp />)

      await user.click(screen.getByText('Go to Dashboard'))

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
      })
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('should navigate from home to upload', async () => {
      const user = userEvent.setup()
      render(<TestApp />)

      await user.click(screen.getByText('Go to Upload'))

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/upload')
      })
      expect(screen.getByText('Upload')).toBeInTheDocument()
    })

    it('should navigate from dashboard back to home', async () => {
      const user = userEvent.setup()
      render(<TestApp initialPath="/dashboard" />)

      await user.click(screen.getByText('Go Home'))

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/')
      })
      expect(screen.getByText('Home Page')).toBeInTheDocument()
    })
  })

  describe('Multiple Navigation', () => {
    it('should handle multiple navigations correctly', async () => {
      const user = userEvent.setup()
      render(<TestApp />)

      // Navigate to dashboard
      await user.click(screen.getByText('Go to Dashboard'))
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
      })

      // Navigate back to home
      await user.click(screen.getByText('Go Home'))
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/')
      })

      // Navigate to upload
      await user.click(screen.getByText('Go to Upload'))
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/upload')
      })
    })
  })
})

describe('Deep Linking', () => {
  it('should handle direct URL access to dashboard', () => {
    render(<TestApp initialPath="/dashboard" />)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('should handle direct URL access to upload', () => {
    render(<TestApp initialPath="/upload" />)

    expect(screen.getByText('Upload')).toBeInTheDocument()
  })
})
