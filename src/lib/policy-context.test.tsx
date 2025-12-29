import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PolicyProvider, usePolicies, useDashboardPolicies } from './policy-context'
import { samplePolicies } from '@/data/sample-policies'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock Supabase
const mockFetchPolicies = vi.fn()
const mockCreatePolicy = vi.fn()
const mockDeletePolicy = vi.fn()
const mockIsConfigured = vi.fn(() => false)

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mockIsConfigured(),
  fetchPolicies: () => mockFetchPolicies(),
  createPolicy: (...args: unknown[]) => mockCreatePolicy(...args),
  deleteSupabasePolicy: (...args: unknown[]) => mockDeletePolicy(...args),
}))

// Mock useAuth
const mockUser = { id: 'user-123', email: 'test@example.com' }
const mockUseAuth = vi.fn()

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// Test component that uses the policy context
function TestConsumer() {
  const {
    policies,
    selectedPolicy,
    isLoading,
    addPolicies,
    deletePolicy,
    selectPolicy,
    clearSelectedPolicy,
    getPolicyById,
    clearAllPolicies,
    resetToSamplePolicies,
    refreshPolicies,
  } = usePolicies()

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="policy-count">{policies.length}</div>
      <div data-testid="selected-policy">{selectedPolicy?.id || 'none'}</div>
      <ul data-testid="policy-list">
        {policies.map((p) => (
          <li key={p.id} data-testid={`policy-${p.id}`}>
            {p.provider} - {p.typeTr}
          </li>
        ))}
      </ul>
      <button onClick={() => addPolicies([samplePolicies[0]])}>Add Policy</button>
      <button onClick={() => deletePolicy(policies[0]?.id || '')}>Delete First</button>
      <button onClick={() => selectPolicy(policies[0]?.id || '')}>Select First</button>
      <button onClick={clearSelectedPolicy}>Clear Selection</button>
      <button onClick={clearAllPolicies}>Clear All</button>
      <button onClick={resetToSamplePolicies}>Reset to Samples</button>
      <button onClick={refreshPolicies}>Refresh</button>
    </div>
  )
}

// Test component for dashboard policies
function DashboardConsumer() {
  const dashboardPolicies = useDashboardPolicies()
  return (
    <div>
      <div data-testid="dashboard-count">{dashboardPolicies.length}</div>
      {dashboardPolicies.map((p) => (
        <div key={p.id} data-testid={`dashboard-${p.id}`}>
          {p.policyNumber}
        </div>
      ))}
    </div>
  )
}

describe('PolicyContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockUseAuth.mockReturnValue({
      user: null,
      isConfigured: false,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Initial Load (localStorage mode)', () => {
    it('should load sample policies on first visit', async () => {
      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      expect(screen.getByTestId('policy-count')).toHaveTextContent(
        String(samplePolicies.length)
      )
      expect(localStorageMock.setItem).toHaveBeenCalled()
    })

    it('should load saved policies from localStorage', async () => {
      const savedPolicies = [samplePolicies[0], samplePolicies[1]]
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'insurai_initialized') return 'true'
        if (key === 'insurai_policies') return JSON.stringify(savedPolicies)
        return null
      })

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      expect(screen.getByTestId('policy-count')).toHaveTextContent('2')
    })
  })

  describe('Supabase Mode', () => {
    beforeEach(() => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isConfigured: true,
      })
    })

    it('should fetch policies from Supabase when authenticated', async () => {
      const supabasePolicies = [
        {
          id: 'sb-1',
          policy_number: 'POL-001',
          provider: 'Test Insurance',
          type: 'home',
          type_tr: 'Konut Sigortası',
          coverage: 500000,
          premium: 2500,
          deductible: 1000,
          start_date: '2024-01-01',
          expiry_date: '2025-01-01',
          status: 'active',
          insured_person: 'Test User',
          document_type: 'policy',
          upload_date: '2024-01-01',
          logo: null,
          location: null,
          raw_data: null,
        },
      ]
      mockFetchPolicies.mockResolvedValue(supabasePolicies)

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      expect(mockFetchPolicies).toHaveBeenCalled()
      expect(screen.getByTestId('policy-count')).toHaveTextContent('1')
    })

    it('should fall back to localStorage on Supabase error', async () => {
      mockFetchPolicies.mockRejectedValue(new Error('Network error'))
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'insurai_policies') return JSON.stringify(samplePolicies)
        return null
      })

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      // Should have loaded from localStorage as fallback
      expect(screen.getByTestId('policy-count')).toHaveTextContent(
        String(samplePolicies.length)
      )
    })
  })

  describe('Policy Operations', () => {
    it('should add policies', async () => {
      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      const initialCount = parseInt(
        screen.getByTestId('policy-count').textContent || '0'
      )

      await user.click(screen.getByText('Add Policy'))

      // Should not add duplicate
      expect(screen.getByTestId('policy-count')).toHaveTextContent(
        String(initialCount)
      )
    })

    it('should delete policies', async () => {
      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      const initialCount = parseInt(
        screen.getByTestId('policy-count').textContent || '0'
      )

      await user.click(screen.getByText('Delete First'))

      await waitFor(() => {
        expect(screen.getByTestId('policy-count')).toHaveTextContent(
          String(initialCount - 1)
        )
      })
    })

    it('should select and clear policy', async () => {
      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      // Initially no selection
      expect(screen.getByTestId('selected-policy')).toHaveTextContent('none')

      // Select first policy
      await user.click(screen.getByText('Select First'))

      await waitFor(() => {
        expect(screen.getByTestId('selected-policy')).not.toHaveTextContent('none')
      })

      // Clear selection
      await user.click(screen.getByText('Clear Selection'))

      expect(screen.getByTestId('selected-policy')).toHaveTextContent('none')
    })

    it('should clear all policies', async () => {
      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      await user.click(screen.getByText('Clear All'))

      expect(screen.getByTestId('policy-count')).toHaveTextContent('0')
    })

    it('should reset to sample policies', async () => {
      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      // Clear first
      await user.click(screen.getByText('Clear All'))
      expect(screen.getByTestId('policy-count')).toHaveTextContent('0')

      // Reset to samples
      await user.click(screen.getByText('Reset to Samples'))

      expect(screen.getByTestId('policy-count')).toHaveTextContent(
        String(samplePolicies.length)
      )
    })
  })

  describe('usePolicies hook', () => {
    it('should throw error when used outside PolicyProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('usePolicies must be used within a PolicyProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('useDashboardPolicies hook', () => {
    it('should return formatted policies for dashboard', async () => {
      render(
        <PolicyProvider>
          <DashboardConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-count')).toHaveTextContent(
          String(samplePolicies.length)
        )
      })

      // Check that formatted policies have the expected structure
      const firstPolicy = samplePolicies[0]
      expect(
        screen.getByTestId(`dashboard-${firstPolicy.id}`)
      ).toHaveTextContent(firstPolicy.policyNumber)
    })
  })
})
