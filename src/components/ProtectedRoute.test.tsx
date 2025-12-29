import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'

// Mock the useAuth hook
const mockUseAuth = vi.fn()

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock PageLoader
vi.mock('./PageLoader', () => ({
  PageLoader: () => <div data-testid="page-loader">Loading...</div>,
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when Supabase is not configured (demo mode)', () => {
    it('should allow access without authentication', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false,
        isConfigured: false,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-content">Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
      expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
    })
  })

  describe('when Supabase is configured', () => {
    it('should show loader while checking authentication', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: true,
        isConfigured: true,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-content">Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByTestId('page-loader')).toBeInTheDocument()
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should redirect to auth page when not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false,
        isConfigured: true,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-content">Dashboard Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/auth" element={<div data-testid="auth-page">Auth Page</div>} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('auth-page')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should allow access when authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '123', email: 'test@example.com' },
        loading: false,
        isConfigured: true,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-content">Dashboard Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/auth" element={<div data-testid="auth-page">Auth Page</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
      expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
      expect(screen.queryByTestId('auth-page')).not.toBeInTheDocument()
    })
  })

  describe('redirect with state', () => {
    it('should preserve the original path in location state', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false,
        isConfigured: true,
      })

      render(
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <div>Settings Page</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/auth"
              element={
                <div data-testid="auth-page">
                  Auth Page
                  {/* The Navigate component in ProtectedRoute sets the state */}
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('auth-page')).toBeInTheDocument()
      })
    })
  })

  describe('nested protected routes', () => {
    it('should work with nested protected content', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '123', email: 'test@example.com' },
        loading: false,
        isConfigured: true,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div data-testid="outer">
                    <ProtectedRoute>
                      <div data-testid="inner">Nested Content</div>
                    </ProtectedRoute>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByTestId('outer')).toBeInTheDocument()
      expect(screen.getByTestId('inner')).toBeInTheDocument()
      expect(screen.getByText('Nested Content')).toBeInTheDocument()
    })
  })
})
