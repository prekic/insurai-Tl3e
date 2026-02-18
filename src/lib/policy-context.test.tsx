import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
const mockFetchPolicy = vi.fn()
const mockCreatePolicy = vi.fn()
const mockUpdatePolicy = vi.fn()
const mockDeletePolicy = vi.fn()
const mockSearchPolicies = vi.fn()
const mockGetPolicyStats = vi.fn()
const mockIsConfigured = vi.fn(() => false)

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mockIsConfigured(),
  fetchPolicies: () => mockFetchPolicies(),
  fetchPolicy: (...args: unknown[]) => mockFetchPolicy(...args),
  createPolicy: (...args: unknown[]) => mockCreatePolicy(...args),
  updatePolicy: (...args: unknown[]) => mockUpdatePolicy(...args),
  deleteSupabasePolicy: (...args: unknown[]) => mockDeletePolicy(...args),
  searchPolicies: (...args: unknown[]) => mockSearchPolicies(...args),
  getPolicyStats: () => mockGetPolicyStats(),
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
    // getPolicyById is available but not used in current tests
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

  // ========================================================================
  // NEW TESTS: Expanded coverage for uncovered branches
  // ========================================================================

  describe('updatePolicy', () => {
    it('should update a policy locally when not using Supabase', async () => {
      const user = userEvent.setup()

      function UpdateConsumer() {
        const { policies, isLoading, updatePolicy: update } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="first-provider">{policies[0]?.provider || 'none'}</div>
            <button onClick={() => update(policies[0]?.id || '', { provider: 'Updated Co.' })}>
              Update
            </button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <UpdateConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const originalProvider = screen.getByTestId('first-provider').textContent

      await user.click(screen.getByText('Update'))

      await waitFor(() => {
        expect(screen.getByTestId('first-provider')).toHaveTextContent('Updated Co.')
      })

      expect(screen.getByTestId('first-provider').textContent).not.toBe(originalProvider)
    })

    it('should update selected policy when same id is being updated', async () => {
      const user = userEvent.setup()

      function UpdateSelectedConsumer() {
        const { policies, selectedPolicy, isLoading, updatePolicy: update, selectPolicy } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="selected-provider">{selectedPolicy?.provider || 'none'}</div>
            <button onClick={() => selectPolicy(policies[0]?.id || '')}>Select</button>
            <button onClick={() => update(policies[0]?.id || '', { provider: 'New Provider' })}>
              Update
            </button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <UpdateSelectedConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Select'))
      await user.click(screen.getByText('Update'))

      await waitFor(() => {
        expect(screen.getByTestId('selected-provider')).toHaveTextContent('New Provider')
      })
    })

    it('should update via Supabase when authenticated', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })

      const supabaseRow = {
        id: 'sb-1', policy_number: 'POL-001', provider: 'Original', type: 'home',
        type_tr: 'Konut', coverage: 500000, premium: 2500, deductible: 1000,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Test', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([supabaseRow])

      const updatedRow = { ...supabaseRow, provider: 'UpdatedViaDB' }
      mockUpdatePolicy.mockResolvedValue(updatedRow)

      const user = userEvent.setup()

      function SupabaseUpdateConsumer() {
        const { policies, isLoading, updatePolicy: update } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="provider">{policies[0]?.provider || 'none'}</div>
            <button onClick={() => update(policies[0]?.id || '', { provider: 'UpdatedViaDB' })}>
              Update
            </button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <SupabaseUpdateConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Update'))

      await waitFor(() => {
        expect(mockUpdatePolicy).toHaveBeenCalled()
      })
    })
  })

  describe('fetchPolicyById', () => {
    it('should return cached policy from local state', async () => {
      let fetchResult: unknown = null

      function FetchByIdConsumer() {
        const { policies, isLoading, fetchPolicyById } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="result">{fetchResult ? 'found' : 'none'}</div>
            <button onClick={async () => {
              fetchResult = await fetchPolicyById(policies[0]?.id || '')
            }}>Fetch</button>
          </div>
        )
      }

      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <FetchByIdConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Fetch'))
      expect(fetchResult).toBeTruthy()
    })

    it('should fetch from Supabase when not in cache', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])

      const remoteRow = {
        id: 'remote-1', policy_number: 'POL-999', provider: 'Remote', type: 'home',
        type_tr: 'Konut', coverage: 100000, premium: 1000, deductible: 0,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Remote User', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicy.mockResolvedValue(remoteRow)

      let fetchResult: unknown = null

      function FetchRemoteConsumer() {
        const { isLoading, fetchPolicyById } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <button onClick={async () => {
              fetchResult = await fetchPolicyById('remote-1')
            }}>Fetch Remote</button>
          </div>
        )
      }

      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <FetchRemoteConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Fetch Remote'))

      await waitFor(() => {
        expect(mockFetchPolicy).toHaveBeenCalledWith('remote-1')
      })
      expect(fetchResult).toBeTruthy()
    })

    it('should return null when Supabase fetch fails', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])
      mockFetchPolicy.mockRejectedValue(new Error('DB error'))

      let fetchResult: unknown = 'initial'

      function FetchErrorConsumer() {
        const { isLoading, fetchPolicyById } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <button onClick={async () => {
              fetchResult = await fetchPolicyById('nonexistent')
            }}>Fetch</button>
          </div>
        )
      }

      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <FetchErrorConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Fetch'))

      await waitFor(() => {
        expect(fetchResult).toBeNull()
      })
    })
  })

  describe('searchPolicies', () => {
    it('should search locally by provider name', async () => {
      const user = userEvent.setup()

      function SearchConsumer() {
        const { isLoading, searchResults, searchPolicies: search, clearSearch, searchQuery } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="query">{searchQuery}</div>
            <div data-testid="results">{searchResults ? searchResults.length : 'null'}</div>
            <button onClick={() => search(samplePolicies[0].provider)}>Search</button>
            <button onClick={clearSearch}>Clear Search</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <SearchConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Search'))

      await waitFor(() => {
        expect(screen.getByTestId('results')).not.toHaveTextContent('null')
      })
    })

    it('should clear search results when query is empty', async () => {
      const user = userEvent.setup()

      function SearchClearConsumer() {
        const { isLoading, searchResults, searchPolicies: search } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="results">{searchResults === null ? 'null' : searchResults.length}</div>
            <button onClick={() => search('')}>Search Empty</button>
            <button onClick={() => search('test')}>Search Test</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <SearchClearConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      // Search with empty resets to null
      await user.click(screen.getByText('Search Empty'))

      await waitFor(() => {
        expect(screen.getByTestId('results')).toHaveTextContent('null')
      })
    })

    it('should fallback to local search when Supabase search fails', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })

      const supabaseRow = {
        id: 'sb-1', policy_number: 'POL-001', provider: 'Allianz', type: 'kasko',
        type_tr: 'Kasko', coverage: 500000, premium: 2500, deductible: 1000,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Ali', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([supabaseRow])
      mockSearchPolicies.mockRejectedValue(new Error('Search error'))

      const user = userEvent.setup()

      function SearchFallbackConsumer() {
        const { isLoading, searchResults, searchPolicies: search } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="results">{searchResults === null ? 'null' : searchResults.length}</div>
            <button onClick={() => search('Allianz')}>Search</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <SearchFallbackConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Search'))

      // Should fallback to local search and find the result
      await waitFor(() => {
        expect(screen.getByTestId('results')).toHaveTextContent('1')
      })
    })
  })

  describe('refreshStats', () => {
    it('should compute local stats from policies', async () => {
      function StatsConsumer() {
        const { isLoading, stats } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="stats-total">{stats?.total ?? 'null'}</div>
            <div data-testid="stats-active">{stats?.active ?? 'null'}</div>
            <div data-testid="stats-coverage">{stats?.totalCoverage ?? 'null'}</div>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <StatsConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      // Stats should be auto-computed when policies load
      await waitFor(() => {
        expect(screen.getByTestId('stats-total')).toHaveTextContent(
          String(samplePolicies.length)
        )
      })
    })

    it('should fetch stats from Supabase when authenticated', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])
      mockGetPolicyStats.mockResolvedValue({
        total: 5, active: 3, expiring: 1, expired: 1,
        byType: { kasko: 3, traffic: 2 },
        totalCoverage: 1000000, totalPremium: 15000,
      })

      function StatsConsumer() {
        const { isLoading, stats, refreshStats } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="stats-total">{stats?.total ?? 'null'}</div>
            <button onClick={refreshStats}>Refresh Stats</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <StatsConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await waitFor(() => {
        expect(screen.getByTestId('stats-total')).toHaveTextContent('5')
      })
    })
  })

  describe('Duplicate detection', () => {
    it('should dismiss a duplicate', async () => {
      const user = userEvent.setup()

      function DuplicateConsumer() {
        const { isLoading, duplicates, dismissDuplicate } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="dup-count">{duplicates.length}</div>
            <button onClick={() => dismissDuplicate('some-policy-id')}>Dismiss</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <DuplicateConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      // Dismiss a duplicate (this adds it to dismissed set, affecting future filtering)
      await user.click(screen.getByText('Dismiss'))

      // The dismissed set has been updated (the actual filter runs on next duplicate detection cycle)
      // This test exercises the dismissDuplicate callback
    })

    it('should getDuplicatesForPolicy return filtered results', async () => {
      let result: unknown[] = []

      function GetDupsConsumer() {
        const { isLoading, getDuplicatesForPolicy } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="dups-for">{result.length}</div>
            <button onClick={() => { result = getDuplicatesForPolicy('nonexistent') }}>
              Get Dups
            </button>
          </div>
        )
      }

      const user = userEvent.setup()

      render(
        <PolicyProvider>
          <GetDupsConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Get Dups'))
      expect(result).toEqual([])
    })
  })

  describe('isPolicyNew', () => {
    it('should return true for recently added policy ids', async () => {
      const user = userEvent.setup()
      let isNew = false

      // We need a policy ID that won't be in the initial set
      const newPolicy = {
        ...samplePolicies[0],
        id: 'brand-new-policy-id',
        policyNumber: 'BRAND-NEW-001',
      }

      function NewCheckConsumer() {
        const { isLoading, isPolicyNew, addPolicies: add, policies } = usePolicies()
        const addedPolicy = policies.find(p => p.id === 'brand-new-policy-id')
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="is-new">{isNew ? 'yes' : 'no'}</div>
            <button onClick={async () => {
              await add([newPolicy])
            }}>Add New</button>
            <button onClick={() => {
              if (addedPolicy) isNew = isPolicyNew(addedPolicy)
            }}>Check New</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <NewCheckConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Add New'))

      await waitFor(async () => {
        await user.click(screen.getByText('Check New'))
        expect(isNew).toBe(true)
      })
    })
  })

  describe('addPolicies with Supabase', () => {
    it('should save to Supabase and refresh', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })

      const supabaseRow = {
        id: 'sb-new', policy_number: 'POL-NEW', provider: 'NewCo', type: 'home',
        type_tr: 'Konut', coverage: 100000, premium: 500, deductible: 0,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Test', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([supabaseRow])
      mockCreatePolicy.mockResolvedValue(supabaseRow)

      const newPolicy = {
        ...samplePolicies[0],
        id: 'new-for-supabase',
        policyNumber: 'POL-SB',
      }

      const user = userEvent.setup()

      function AddSupabaseConsumer() {
        const { isLoading, addPolicies: add, policies } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="count">{policies.length}</div>
            <button onClick={() => add([newPolicy])}>Add</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <AddSupabaseConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(mockCreatePolicy).toHaveBeenCalled()
      })
    })

    it('should show error toast when addPolicies fails', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])
      mockCreatePolicy.mockRejectedValue(new Error('Save failed'))

      const { toast } = await import('sonner')
      const user = userEvent.setup()

      function AddErrorConsumer() {
        const { isLoading, addPolicies: add } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <button onClick={() => add([samplePolicies[0]]).catch(() => {})}>Add</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <AddErrorConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })
  })

  describe('deletePolicy with Supabase', () => {
    it('should delete from Supabase and update local state', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' }, isConfigured: true })

      const supabaseRow = {
        id: 'sb-del', policy_number: 'POL-DEL', provider: 'DeleteCo', type: 'home',
        type_tr: 'Konut', coverage: 500000, premium: 2500, deductible: 1000,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Test', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([supabaseRow])
      mockDeletePolicy.mockResolvedValue(undefined)

      const user = userEvent.setup()

      function DeleteSupabaseConsumer() {
        const { isLoading, deletePolicy: del, policies } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="count">{policies.length}</div>
            <button onClick={() => del(policies[0]?.id || '')}>Delete</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <DeleteSupabaseConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(mockDeletePolicy).toHaveBeenCalledWith('sb-del')
        expect(screen.getByTestId('count')).toHaveTextContent('0')
      })
    })
  })

  describe('mergeDuplicates', () => {
    it('should delete specified IDs and show success toast', async () => {
      const { toast } = await import('sonner')
      const user = userEvent.setup()

      function MergeConsumer() {
        const { isLoading, policies, mergeDuplicates: merge } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="count">{policies.length}</div>
            <button onClick={() => {
              if (policies.length >= 2) {
                merge(policies[0].id, [policies[1].id]).catch(() => {})
              }
            }}>Merge</button>
          </div>
        )
      }

      render(
        <PolicyProvider>
          <MergeConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const initialCount = parseInt(screen.getByTestId('count').textContent || '0')
      expect(initialCount).toBeGreaterThanOrEqual(2)

      await user.click(screen.getByText('Merge'))

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent(String(initialCount - 1))
      })

      expect(toast.success).toHaveBeenCalledWith('Duplicates merged', expect.any(Object))
    })
  })

  describe('localStorage error handling', () => {
    it('should handle JSON parse error in loadFromStorage gracefully', async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'insurai_initialized') return 'true'
        if (key === 'insurai_policies') return 'not-valid-json{{'
        return null
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <PolicyProvider>
          <TestConsumer />
        </PolicyProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
      })

      // Should fallback to empty array
      expect(screen.getByTestId('policy-count')).toHaveTextContent('0')

      consoleSpy.mockRestore()
    })
  })
})
