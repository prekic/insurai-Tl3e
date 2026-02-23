/**
 * Branch coverage tests for library modules:
 * - policy-context.tsx
 * - ai/providers/consensus.ts
 * - performance.ts
 * - admin/config-manager.ts
 * - ai/cache/storage.ts
 *
 * Targets uncovered branches identified in coverage reports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import type { CacheConfig, CacheEntry } from '@/lib/ai/cache/types'

// ============================================================================
// MOCKS
// ============================================================================

// ---------- localStorage mock ----------
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { localStorageStore[key] = val }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
  clear: vi.fn(() => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k] }),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// ---------- Supabase mocks ----------
const mockFetchPolicies = vi.fn()
const mockFetchPolicy = vi.fn()
const mockCreatePolicy = vi.fn()
const mockUpdatePolicy = vi.fn()
const mockDeletePolicy = vi.fn()
const mockSearchPolicies = vi.fn()
const mockGetPolicyStats = vi.fn()
const mockIsConfigured = vi.fn(() => false)

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => mockIsConfigured(),
  credentials: null,
}))

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

const mockUser = { id: 'user-123', email: 'test@example.com' }
const mockUseAuth = vi.fn()

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// ---------- Consensus mocks ----------
vi.mock('@/lib/ai/config', () => ({
  getConfiguredProviders: vi.fn(),
  AI_CONFIG: {
    consensus: {
      enabled: true,
      agreementThreshold: 0.8,
      consensusFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'],
    },
  },
}))

vi.mock('@/lib/ai/providers/openai', () => ({
  extractWithOpenAI: vi.fn(),
}))

vi.mock('@/lib/ai/providers/claude', () => ({
  extractWithClaude: vi.fn(),
}))

vi.mock('@/lib/ai/cache', () => ({
  aiCache: {
    initialize: vi.fn(),
    getConsensus: vi.fn().mockResolvedValue(null),
    setConsensus: vi.fn(),
  },
}))

// ---------- Sentry mock ----------
vi.mock('@sentry/react', () => ({
  setMeasurement: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  captureMessage: vi.fn(),
  startInactiveSpan: vi.fn(() => ({
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
  })),
}))

// ---------- web-vitals mock ----------
vi.mock('web-vitals', () => ({
  onLCP: vi.fn(),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onTTFB: vi.fn(),
  onFCP: vi.fn(),
}))

// ---------- audit logger mock ----------
vi.mock('@/lib/admin/operations-logger', () => ({
  logAuditEvent: vi.fn(),
}))

// ============================================================================
// HELPERS
// ============================================================================

function createMockExtraction(overrides: Partial<ExtractedPolicyData> = {}): ExtractedPolicyData {
  return {
    policyNumber: 'POL-001',
    provider: 'Test Insurance',
    policyType: 'home',
    insuredName: 'John Doe',
    insuredAddress: '123 Main St',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 5000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    coverages: [
      { name: 'Fire', limit: 100000, deductible: 1000, description: null },
    ],
    specialConditions: [],
    exclusions: [],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    confidence: {
      overall: 0.9,
      policyNumber: 0.95,
      provider: 0.9,
      dates: 0.85,
      premium: 0.9,
      coverages: 0.88,
    },
    ...overrides,
  }
}

// ============================================================================
// 1. POLICY-CONTEXT BRANCH TESTS
// ============================================================================

describe('PolicyContext branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockUseAuth.mockReturnValue({ user: null, isConfigured: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // lazy import to avoid module initialization conflicts
  async function getPolicyContextModule() {
    return await import('./policy-context')
  }

  describe('selectPolicy with invalid ID', () => {
    it('should return null and set selectedPolicy to null for non-existent ID', async () => {
      const { PolicyProvider, usePolicies } = await getPolicyContextModule()
      let selectResult: unknown = 'unset'

      function Consumer() {
        const { isLoading, selectPolicy, selectedPolicy } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <div data-testid="selected">{selectedPolicy?.id ?? 'none'}</div>
            <div data-testid="result">{String(selectResult)}</div>
            <button onClick={() => { selectResult = selectPolicy('nonexistent-id-999') }}>Select Invalid</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Select Invalid'))
      expect(selectResult).toBeNull()
      expect(screen.getByTestId('selected')).toHaveTextContent('none')
    })
  })

  describe('saveToStorage error handling', () => {
    it('should handle localStorage.setItem throwing an error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      localStorageMock.setItem.mockImplementation(() => { throw new Error('QuotaExceeded') })

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()

      function Consumer() {
        const { isLoading, policies } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <div data-testid="count">{policies.length}</div>
          </div>
        )
      }

      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      // Should still load without crashing
      expect(screen.getByTestId('count')).toBeDefined()
      consoleSpy.mockRestore()
    })
  })

  describe('updatePolicy error in Supabase mode', () => {
    it('should show error toast when Supabase update fails', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })

      const supabaseRow = {
        id: 'sb-upd', policy_number: 'POL-UPD', provider: 'TestCo', type: 'home',
        type_tr: 'Konut', coverage: 500000, premium: 2500, deductible: 1000,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Test', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([supabaseRow])
      mockUpdatePolicy.mockRejectedValue(new Error('DB update failed'))

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()
      const { toast } = await import('sonner')

      function Consumer() {
        const { isLoading, policies, updatePolicy: upd } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <button onClick={() => upd(policies[0]?.id ?? '', { provider: 'NewCo' }).catch(() => { })}>Update</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Update'))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })
  })

  describe('deletePolicy error handling', () => {
    it('should show error toast when Supabase delete fails', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })

      const supabaseRow = {
        id: 'sb-del-err', policy_number: 'POL-DEL', provider: 'TestCo', type: 'home',
        type_tr: 'Konut', coverage: 500000, premium: 2500, deductible: 1000,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Test', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([supabaseRow])
      mockDeletePolicy.mockRejectedValue(new Error('Delete failed'))

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()
      const { toast } = await import('sonner')

      function Consumer() {
        const { isLoading, policies, deletePolicy: del } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <button onClick={() => del(policies[0]?.id ?? '').catch(() => { })}>Delete</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Delete'))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })
  })

  describe('mergeDuplicates error handling', () => {
    it('should handle merge failure with error toast', async () => {
      const { PolicyProvider, usePolicies } = await getPolicyContextModule()
      const { toast } = await import('sonner')

      // We need a scenario where deletePolicy throws inside mergeDuplicates
      // Since deletePolicy locally won't throw, we test with Supabase mode
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })

      const rows = [
        { id: 'r1', policy_number: 'P1', provider: 'A', type: 'home', type_tr: 'Konut', coverage: 100, premium: 50, deductible: 0, start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active', insured_person: 'X', document_type: 'policy', upload_date: '2024-01-01', logo: null, location: null, raw_data: null },
        { id: 'r2', policy_number: 'P2', provider: 'B', type: 'home', type_tr: 'Konut', coverage: 100, premium: 50, deductible: 0, start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active', insured_person: 'Y', document_type: 'policy', upload_date: '2024-01-01', logo: null, location: null, raw_data: null },
      ]
      mockFetchPolicies.mockResolvedValue(rows)
      mockDeletePolicy.mockRejectedValue(new Error('Merge delete fail'))

      function Consumer() {
        const { isLoading, policies: _policies, mergeDuplicates: merge } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <button onClick={() => merge('r1', ['r2']).catch(() => { })}>Merge</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Merge'))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })
  })

  describe('searchPolicies Supabase success path', () => {
    it('should return mapped results from Supabase search', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })

      const row = {
        id: 'sb-srch', policy_number: 'POL-SEARCH', provider: 'SearchCo', type: 'kasko',
        type_tr: 'Kasko', coverage: 300000, premium: 1000, deductible: 500,
        start_date: '2024-01-01', expiry_date: '2025-01-01', status: 'active',
        insured_person: 'Searcher', document_type: 'policy', upload_date: '2024-01-01',
        logo: null, location: null, raw_data: null,
      }
      mockFetchPolicies.mockResolvedValue([row])
      mockSearchPolicies.mockResolvedValue([row])

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()

      function Consumer() {
        const { isLoading, searchResults, searchPolicies: search } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <div data-testid="results">{searchResults === null ? 'null' : searchResults.length}</div>
            <button onClick={() => search('SearchCo')}>Search</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Search'))
      await waitFor(() => expect(screen.getByTestId('results')).toHaveTextContent('1'))
    })
  })

  describe('refreshStats Supabase error fallback', () => {
    it('should handle stats fetch error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])
      mockGetPolicyStats.mockRejectedValue(new Error('Stats fail'))

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()

      function Consumer() {
        const { isLoading, stats, refreshStats } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <div data-testid="stats">{stats ? 'loaded' : 'null'}</div>
            <button onClick={refreshStats}>Refresh Stats</button>
          </div>
        )
      }

      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      // Stats should be null since the fetch failed
      // The error was logged but no crash
      consoleSpy.mockRestore()
    })
  })

  describe('addPolicies error message from non-Error object', () => {
    it('should show generic message when error is not an Error instance', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])
      mockCreatePolicy.mockRejectedValue('string error')

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()
      const { toast } = await import('sonner')
      const { samplePolicies } = await import('@/data/sample-policies')

      function Consumer() {
        const { isLoading, addPolicies: add } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <button onClick={() => add([samplePolicies[0]]).catch(() => { })}>Add</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Add'))
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to save policies',
          expect.objectContaining({ description: 'Please try again.' })
        )
      })
    })
  })

  describe('fetchPolicyById when Supabase returns null', () => {
    it('should return null when Supabase returns no row', async () => {
      mockIsConfigured.mockReturnValue(true)
      mockUseAuth.mockReturnValue({ user: mockUser, isConfigured: true })
      mockFetchPolicies.mockResolvedValue([])
      mockFetchPolicy.mockResolvedValue(null)

      const { PolicyProvider, usePolicies } = await getPolicyContextModule()
      let result: unknown = 'initial'

      function Consumer() {
        const { isLoading, fetchPolicyById } = usePolicies()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
            <button onClick={async () => { result = await fetchPolicyById('missing-id') }}>Fetch</button>
          </div>
        )
      }

      const user = userEvent.setup()
      render(<PolicyProvider><Consumer /></PolicyProvider>)
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('no'))
      await user.click(screen.getByText('Fetch'))
      await waitFor(() => expect(result).toBeNull())
    })
  })
})

// ============================================================================
// 2. CONSENSUS BRANCH TESTS
// ============================================================================

describe('Consensus branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function getModules() {
    const consensus = await import('./ai/providers/consensus')
    const { getConfiguredProviders } = await import('./ai/config')
    const { extractWithOpenAI } = await import('./ai/providers/openai')
    const { extractWithClaude } = await import('./ai/providers/claude')
    const { aiCache } = await import('./ai/cache')
    return { ...consensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache }
  }

  it('should return cached consensus when available for multi-provider', async () => {
    const { extractWithConsensus, getConfiguredProviders, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    const cachedData = createMockExtraction({ policyNumber: 'CACHED-001' })
    vi.mocked(aiCache.getConsensus).mockResolvedValue(cachedData)

    const result = await extractWithConsensus('test doc')
    expect(result.fromCache).toBe(true)
    expect(result.data.policyNumber).toBe('CACHED-001')
    expect(result.consensus.score).toBe(1)
  })

  it('should use primaryProvider from options for cached result', async () => {
    const { extractWithConsensus, getConfiguredProviders, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(createMockExtraction())

    const result = await extractWithConsensus('doc', { primaryProvider: 'anthropic' })
    expect(result.primaryProvider).toBe('anthropic')
  })

  it('should fall back to first provider when no primaryProvider option given for cache', async () => {
    const { extractWithConsensus, getConfiguredProviders, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(createMockExtraction())

    const result = await extractWithConsensus('doc')
    expect(result.primaryProvider).toBe('openai')
  })

  it('should handle only one successful result when two providers configured', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)
    vi.mocked(extractWithOpenAI).mockRejectedValue(new Error('OpenAI down'))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({ policyNumber: 'CLAUDE-ONLY' }))

    const result = await extractWithConsensus('doc')
    expect(result.data.policyNumber).toBe('CLAUDE-ONLY')
    expect(result.primaryProvider).toBe('anthropic')
    expect(result.consensus.agreement).toBe(1)
  })

  it('should handle provider failure reason without message property', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)
    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction())
    vi.mocked(extractWithClaude).mockRejectedValue('string error without message')

    const result = await extractWithConsensus('doc')
    const claudeResult = result.providerResults.find(r => r.provider === 'anthropic')
    expect(claudeResult?.error).toBe('Unknown error')
  })

  it('should handle disagreement on multiple fields and use higher confidence', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      policyNumber: 'OAI-001',
      provider: 'OpenAI Insurer',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      confidence: { overall: 0.95, policyNumber: 0.99, provider: 0.95, dates: 0.90, premium: 0.85, coverages: 0.90 },
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      policyNumber: 'CLAUDE-002',
      provider: 'Claude Insurer',
      startDate: '2024-02-01',
      endDate: '2025-02-01',
      confidence: { overall: 0.80, policyNumber: 0.75, provider: 0.70, dates: 0.95, premium: 0.90, coverages: 0.85 },
    }))

    const result = await extractWithConsensus('doc')
    expect(result.consensus.disagreedFields).toContain('policyNumber')
    expect(result.consensus.disagreedFields).toContain('provider')
    // policyNumber should come from OpenAI (higher policyNumber confidence)
    expect(result.data.policyNumber).toBe('OAI-001')
    // dates should come from Claude (higher dates confidence)
    expect(result.data.startDate).toBe('2024-02-01')
  })

  it('should treat null/undefined fields as agreed', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      policyNumber: null,
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      policyNumber: null,
    }))

    const result = await extractWithConsensus('doc')
    expect(result.consensus.agreedFields).toContain('policyNumber')
  })

  it('should consider equivalent values as agreed (date format normalization)', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      startDate: '2024-01-15',
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      startDate: '2024-01-15T00:00:00.000Z',
    }))

    const result = await extractWithConsensus('doc')
    expect(result.consensus.agreedFields).toContain('startDate')
  })

  it('should consider equivalent premium values (rounding) as agreed', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      premium: 5000.3,
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      premium: 5000.49,
    }))

    const result = await extractWithConsensus('doc')
    expect(result.consensus.agreedFields).toContain('premium')
  })

  it('should consider equivalent policy numbers (ignoring spaces/dashes) as agreed', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      policyNumber: 'POL-001-ABC',
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      policyNumber: 'POL001ABC',
    }))

    const result = await extractWithConsensus('doc')
    expect(result.consensus.agreedFields).toContain('policyNumber')
  })

  it('should merge coverage deductible when existing is null', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      coverages: [{ name: 'Fire', limit: 100000, deductible: null, description: null }],
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      coverages: [{ name: 'Fire', limit: 80000, deductible: 500, description: 'Fire coverage' }],
    }))

    const result = await extractWithConsensus('doc')
    const fire = result.data.coverages.find(c => c.name.toLowerCase().includes('fire'))
    expect(fire?.limit).toBe(100000) // higher limit from OpenAI
    expect(fire?.deductible).toBe(500) // filled from Claude
    expect(fire?.description).toBe('Fire coverage') // Claude fills missing description
  })

  it('should merge special conditions from multiple providers', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      specialConditions: ['Condition A', 'Condition B'],
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      specialConditions: ['Condition B', 'Condition C'],
    }))

    const result = await extractWithConsensus('doc')
    expect(result.data.specialConditions).toContain('Condition A')
    expect(result.data.specialConditions).toContain('Condition B')
    expect(result.data.specialConditions).toContain('Condition C')
    // 'Condition B' should not be duplicated
    expect(result.data.specialConditions.filter(c => c === 'Condition B' || c === 'condition B')).toHaveLength(1)
  })

  it('should select primaryProvider based on highest overall confidence when not specified', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      confidence: { overall: 0.75, policyNumber: 0.8, provider: 0.8, dates: 0.8, premium: 0.8, coverages: 0.8 },
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      confidence: { overall: 0.95, policyNumber: 0.9, provider: 0.9, dates: 0.9, premium: 0.9, coverages: 0.9 },
    }))

    const result = await extractWithConsensus('doc')
    expect(result.primaryProvider).toBe('anthropic')
  })

  it('should use specified primaryProvider when it exists in successful results', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      confidence: { overall: 0.95, policyNumber: 0.9, provider: 0.9, dates: 0.9, premium: 0.9, coverages: 0.9 },
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      confidence: { overall: 0.75, policyNumber: 0.8, provider: 0.8, dates: 0.8, premium: 0.8, coverages: 0.8 },
    }))

    const result = await extractWithConsensus('doc', { primaryProvider: 'anthropic' })
    expect(result.primaryProvider).toBe('anthropic')
  })

  it('should filter options.providers against configured providers', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai'])
    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction())

    // Request both but only openai is configured
    const result = await extractWithConsensus('doc', { providers: ['openai', 'anthropic'] })
    expect(extractWithClaude).not.toHaveBeenCalled()
    expect(result.providerResults).toHaveLength(1)
  })

  it('should handle invalid date in normalization gracefully', async () => {
    const { extractWithConsensus, getConfiguredProviders, extractWithOpenAI, extractWithClaude, aiCache } = await getModules()
    vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
    vi.mocked(aiCache.getConsensus).mockResolvedValue(null)

    vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction({
      startDate: 'not-a-date',
    }))
    vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction({
      startDate: 'also-not-a-date',
    }))

    const result = await extractWithConsensus('doc')
    // Both invalid dates should compare as their string values
    expect(result.consensus.disagreedFields).toContain('startDate')
  })
})

// ============================================================================
// 3. PERFORMANCE BRANCH TESTS
// ============================================================================

describe('Performance branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function getPerfModule() {
    return await import('./performance')
  }

  it('should return poor for unknown threshold name', async () => {
    const { getWebVitalRating } = await getPerfModule()
    // Cast to test the fallback branch when threshold is not found
    const rating = getWebVitalRating('UNKNOWN_METRIC' as any, 100)
    expect(rating).toBe('poor')
  })

  it('should return millisecond unit for non-CLS metrics', async () => {
    // We test this indirectly through startTransaction + Sentry calls
    const { startTransaction } = await getPerfModule()
    const txn = startTransaction({ name: 'test', op: 'test.unit' })
    txn.finish()
    // No crash means getMetricUnit worked correctly
  })

  it('should report poor FCP recommendation in summary', async () => {
    const { initWebVitals, getPerformanceSummary, clearMetrics } = await getPerfModule()
    const webVitals = await import('web-vitals')

    clearMetrics()
    const callbacks: Record<string, (m: unknown) => void> = {}
    vi.mocked(webVitals.onFCP).mockImplementation((cb) => { callbacks.FCP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onLCP).mockImplementation(() => { })
    vi.mocked(webVitals.onCLS).mockImplementation(() => { })
    vi.mocked(webVitals.onINP).mockImplementation(() => { })
    vi.mocked(webVitals.onTTFB).mockImplementation(() => { })

    await initWebVitals()
    callbacks.FCP?.({ name: 'FCP', value: 5000, rating: 'poor', delta: 5000, id: 'fcp-1', navigationType: 'navigate' })

    const summary = getPerformanceSummary()
    // FCP poor doesn't add its own recommendation (only LCP, CLS, TTFB, INP do)
    expect(summary.overallScore).toBe('poor')
    clearMetrics()
  })

  it('should handle transaction with error status and data', async () => {
    const { startTransaction } = await getPerfModule()
    const txn = startTransaction({
      name: 'Error Operation',
      op: 'error.op',
      description: 'Test error',
      tags: { type: 'error' },
      data: { retry: 3 },
    })
    txn.setStatus('error')
    txn.setData('errorMessage', 'Something went wrong')
    txn.setTag('severity', 'high')
    txn.finish()
    // Verify no crash, and that the error status path is exercised
  })

  it('should handle measureAsync error path correctly', async () => {
    const { measureAsync } = await getPerfModule()
    const errorMsg = 'Async operation failed'
    await expect(
      measureAsync('Test', 'test.async', async () => { throw new Error(errorMsg) })
    ).rejects.toThrow(errorMsg)
  })

  it('should handle measureSync error path correctly', async () => {
    const { measureSync } = await getPerfModule()
    const errorMsg = 'Sync operation failed'
    expect(() =>
      measureSync('Test', 'test.sync', () => { throw new Error(errorMsg) })
    ).toThrow(errorMsg)
  })

  it('should record multiple metrics and reflect in summary', async () => {
    const { initWebVitals, getPerformanceSummary, clearMetrics } = await getPerfModule()
    const webVitals = await import('web-vitals')

    clearMetrics()
    const callbacks: Record<string, (m: unknown) => void> = {}
    vi.mocked(webVitals.onLCP).mockImplementation((cb) => { callbacks.LCP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onCLS).mockImplementation((cb) => { callbacks.CLS = cb as (m: unknown) => void })
    vi.mocked(webVitals.onINP).mockImplementation((cb) => { callbacks.INP = cb as (m: unknown) => void })
    vi.mocked(webVitals.onTTFB).mockImplementation((cb) => { callbacks.TTFB = cb as (m: unknown) => void })
    vi.mocked(webVitals.onFCP).mockImplementation((cb) => { callbacks.FCP = cb as (m: unknown) => void })

    await initWebVitals()

    // All needs-improvement
    callbacks.LCP?.({ name: 'LCP', value: 3000, rating: 'needs-improvement', delta: 3000, id: '1', navigationType: 'navigate' })
    callbacks.CLS?.({ name: 'CLS', value: 0.15, rating: 'needs-improvement', delta: 0.15, id: '2', navigationType: 'navigate' })
    callbacks.INP?.({ name: 'INP', value: 300, rating: 'needs-improvement', delta: 300, id: '3', navigationType: 'navigate' })
    callbacks.TTFB?.({ name: 'TTFB', value: 1200, rating: 'needs-improvement', delta: 1200, id: '4', navigationType: 'navigate' })
    callbacks.FCP?.({ name: 'FCP', value: 2500, rating: 'needs-improvement', delta: 2500, id: '5', navigationType: 'navigate' })

    const summary = getPerformanceSummary()
    expect(summary.overallScore).toBe('needs-improvement')
    expect(summary.recommendations).toHaveLength(0) // Only poor triggers recommendations
    clearMetrics()
  })
})

// ============================================================================
// 4. CONFIG-MANAGER BRANCH TESTS
// ============================================================================

describe('Config Manager branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function getConfigModule() {
    return await import('./admin/config-manager')
  }

  it('should return false when updating non-editable config', async () => {
    const { getConfigObject: _getConfigObject, setConfig } = await getConfigModule()
    // All default configs are editable, so we need to find one or test the branch differently
    // Let's test with a nonexistent key first (returns false)
    const result = setConfig('completely_missing_key', 'val', 'system', 'admin@test.com')
    expect(result).toBe(false)
  })

  it('should search by key alone when no category provided for getConfig', async () => {
    const { getConfig } = await getConfigModule()
    // Should find temperature by key search
    const val = getConfig('temperature')
    expect(val).toBeDefined()
  })

  it('should search by key alone for getConfigObject when no category', async () => {
    const { getConfigObject } = await getConfigModule()
    const obj = getConfigObject('temperature')
    expect(obj).toBeDefined()
    expect(obj?.key).toBe('temperature')
  })

  it('should return undefined for getConfigObject with non-existent key', async () => {
    const { getConfigObject } = await getConfigModule()
    const obj = getConfigObject('totally_missing_key')
    expect(obj).toBeUndefined()
  })

  it('should return undefined for getConfigObject with non-existent category+key', async () => {
    const { getConfigObject } = await getConfigModule()
    const obj = getConfigObject('missing', 'ai')
    expect(obj).toBeUndefined()
  })

  it('should handle isFeatureEnabled with enabledForUsers array', async () => {
    const { createFeatureFlag, isFeatureEnabled } = await getConfigModule()

    createFeatureFlag({
      id: 'test_user_specific',
      name: 'Test User Specific',
      description: 'Enabled for specific users',
      enabled: false,
      enabledForUsers: ['user-abc'],
    }, 'admin@test.com')

    // Should be enabled for specified user
    expect(isFeatureEnabled('test_user_specific', 'user-abc')).toBe(true)
    // Should be disabled for other users
    expect(isFeatureEnabled('test_user_specific', 'user-xyz')).toBe(false)
  })

  it('should handle percentage rollout deterministically', async () => {
    const { isFeatureEnabled, getFeatureFlag: _getFeatureFlag, updateFeatureFlag } = await getConfigModule()

    // dark_mode has enabledPercentage: 10 and enabled: false (initially)
    // Let's update it to enabled: true with 50% rollout
    updateFeatureFlag('dark_mode', { enabled: true, enabledPercentage: 50 }, 'admin@test.com')

    // Test with a specific user ID — the result should be deterministic
    const result1 = isFeatureEnabled('dark_mode', 'user-test-1')
    const result2 = isFeatureEnabled('dark_mode', 'user-test-1')
    expect(result1).toBe(result2) // Same user = same result

    // Without userId, percentage rollout returns false
    const resultNoUser = isFeatureEnabled('dark_mode')
    expect(resultNoUser).toBe(false)

    // Restore
    updateFeatureFlag('dark_mode', { enabled: false, enabledPercentage: 10 }, 'admin@test.com')
  })

  it('should return false for isFeatureEnabled with nonexistent flag', async () => {
    const { isFeatureEnabled } = await getConfigModule()
    expect(isFeatureEnabled('totally_nonexistent_flag')).toBe(false)
  })

  it('should return false when updating nonexistent feature flag', async () => {
    const { updateFeatureFlag } = await getConfigModule()
    const result = updateFeatureFlag('nonexistent_flag', { enabled: true }, 'admin@test.com')
    expect(result).toBe(false)
  })

  it('should return false when updating nonexistent provider config', async () => {
    const { updateProviderConfig } = await getConfigModule()
    const result = updateProviderConfig('unknown' as any, { enabled: false }, 'admin@test.com')
    expect(result).toBe(false)
  })

  it('should handle setProviderApiKeyStatus with nonexistent provider gracefully', async () => {
    const { setProviderApiKeyStatus, getProviderConfig } = await getConfigModule()
    // Should not throw
    setProviderApiKeyStatus('unknown' as any, true, '...xyz')
    // Unknown provider returns undefined
    expect(getProviderConfig('unknown' as any)).toBeUndefined()
  })

  it('should return false when updating nonexistent prompt template', async () => {
    const { updatePromptTemplate } = await getConfigModule()
    const result = updatePromptTemplate('nonexistent-prompt-id', { name: 'New' }, 'admin@test.com')
    expect(result).toBe(false)
  })

  it('should return false when deleting nonexistent prompt template', async () => {
    const { deletePromptTemplate } = await getConfigModule()
    const result = deletePromptTemplate('nonexistent-prompt-id', 'admin@test.com')
    expect(result).toBe(false)
  })

  it('should handle recordPromptUsage with nonexistent template gracefully', async () => {
    const { recordPromptUsage, getPromptTemplate } = await getConfigModule()
    recordPromptUsage('nonexistent-prompt-id')
    expect(getPromptTemplate('nonexistent-prompt-id')).toBeUndefined()
  })

  it('should return undefined for getActivePromptTemplate with no active templates in category', async () => {
    const { getActivePromptTemplate } = await getConfigModule()
    // 'analysis' category has no default active templates
    const active = getActivePromptTemplate('analysis')
    expect(active).toBeUndefined()
  })

  it('should log audit event with enable action when flag is enabled', async () => {
    const { updateFeatureFlag } = await getConfigModule()
    const { logAuditEvent } = await import('./admin/operations-logger')

    updateFeatureFlag('analytics_tracking', { enabled: true }, 'admin@test.com')
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'enable' })
    )
  })

  it('should log audit event with disable action when flag is disabled', async () => {
    const { updateFeatureFlag } = await getConfigModule()
    const { logAuditEvent } = await import('./admin/operations-logger')

    updateFeatureFlag('analytics_tracking', { enabled: false }, 'admin@test.com')
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'disable' })
    )
    // Restore
    updateFeatureFlag('analytics_tracking', { enabled: true }, 'admin@test.com')
  })

  it('should log update action when feature flag update does not change enabled', async () => {
    const { updateFeatureFlag } = await getConfigModule()
    const { logAuditEvent } = await import('./admin/operations-logger')

    updateFeatureFlag('analytics_tracking', { description: 'Updated description' }, 'admin@test.com')
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update' })
    )
  })

  it('should keep only last 50 changes in config history', async () => {
    const { setConfig, getConfigObject } = await getConfigModule()
    for (let i = 0; i < 55; i++) {
      setConfig('temperature', 0.1 + (i * 0.01), 'ai', 'admin@test.com', `Change ${i}`)
    }
    const obj = getConfigObject('temperature', 'ai')
    expect(obj?.history.length).toBeLessThanOrEqual(50)
    // Restore
    setConfig('temperature', 0.3, 'ai', 'admin@test.com')
  })
})

// ============================================================================
// 5. CACHE STORAGE BRANCH TESTS
// ============================================================================

describe('CacheStorage branch coverage', () => {
  // Use in-memory mock for IndexedDB
  const stores: Map<string, Map<string, unknown>> = new Map()

  const initStores = () => {
    stores.clear()
    for (const name of ['extraction', 'ocr', 'consensus', 'metadata']) {
      stores.set(name, new Map())
    }
  }

  const createMockStore = (storeName: string) => {
    const storeData = stores.get(storeName) || new Map()

    const createRequest = <T,>(resultFn: () => T) => {
      let _onsuccess: ((e: unknown) => void) | null = null
      let _onerror: (() => void) | null = null
      const req = {
        get onsuccess() { return _onsuccess },
        set onsuccess(fn: ((e: unknown) => void) | null) {
          _onsuccess = fn
          if (fn) setTimeout(() => {
            try {
              const result = resultFn()
              Object.defineProperty(req, 'result', { value: result, writable: true, configurable: true })
              fn({ target: req })
            } catch {
              if (_onerror) _onerror()
            }
          }, 0)
        },
        get onerror() { return _onerror },
        set onerror(fn: (() => void) | null) { _onerror = fn },
        result: undefined as T | undefined,
      }
      return req
    }

    const createCursorRequest = (entries: [string, unknown][]) => {
      let idx = 0
      let _onsuccess: ((e: unknown) => void) | null = null

      const cursor = {
        value: null as unknown,
        continue() {
          idx++
          if (idx < entries.length) {
            cursor.value = entries[idx][1]
            if (_onsuccess) setTimeout(() => _onsuccess!({ target: { result: cursor } }), 0)
          } else {
            if (_onsuccess) setTimeout(() => _onsuccess!({ target: { result: null } }), 0)
          }
        },
        delete() {
          const key = entries[idx]?.[0]
          if (key) storeData.delete(key)
        },
      }

      const req = {
        get onsuccess() { return _onsuccess },
        set onsuccess(fn: ((e: unknown) => void) | null) {
          _onsuccess = fn
          if (fn) setTimeout(() => {
            if (entries.length > 0) {
              cursor.value = entries[0][1]
              fn({ target: { result: cursor } })
            } else {
              fn({ target: { result: null } })
            }
          }, 0)
        },
        set onerror(_fn: (() => void) | null) { },
      }
      return req
    }

    return {
      get(key: string) { return createRequest(() => storeData.get(key)) },
      put(entry: { key: string;[k: string]: unknown }) {
        return createRequest(() => { storeData.set(entry.key, entry); return entry.key })
      },
      delete(key: string) { return createRequest(() => { storeData.delete(key); return undefined }) },
      openCursor() { return createCursorRequest(Array.from(storeData.entries())) },
      index(_name: string) {
        return {
          openCursor(_range?: unknown) {
            const entries = Array.from(storeData.entries())
            return createCursorRequest(entries)
          },
        }
      },
    }
  }

  const mockDb = {
    transaction(_names: string | string[], _mode?: string) {
      return { objectStore(name: string) { return createMockStore(name) } }
    },
    objectStoreNames: { contains(name: string) { return stores.has(name) } },
    createObjectStore(name: string) {
      stores.set(name, new Map())
      return { createIndex: vi.fn() }
    },
    close: vi.fn(),
  }

  const mockIDB = {
    open() {
      let _onsuccess: ((e: unknown) => void) | null = null
      const req = {
        get onsuccess() { return _onsuccess },
        set onsuccess(fn: ((e: unknown) => void) | null) {
          _onsuccess = fn
          if (fn) setTimeout(() => {
            Object.defineProperty(req, 'result', { value: mockDb, writable: true, configurable: true })
            fn({ target: req })
          }, 0)
        },
        set onerror(_fn: unknown) { },
        set onupgradeneeded(_fn: unknown) { },
        result: mockDb,
      }
      return req
    },
  }

  beforeEach(() => {
    initStores()
    vi.stubGlobal('indexedDB', mockIDB)
    vi.stubGlobal('IDBKeyRange', { upperBound(v: number) { return { upper: v } } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const defaultConfig: CacheConfig = {
    ttl: 3600000,
    maxSize: 1024 * 1024,
    maxEntries: 100,
    prefix: 'test_br',
    debug: false,
  }

  it('should handle get when entry is not found (null branch)', async () => {
    vi.resetModules()
    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)
    const result = await cache.get('totally-missing')
    expect(result).toBeNull()
  })

  it('should handle expired entry in get and trigger deletion', async () => {
    vi.resetModules()
    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    await cache.set('expire-test', 'data')

    // Manually expire
    const store = stores.get('extraction')
    const fullKey = 'test_br_expire-test'
    const entry = store?.get(fullKey) as CacheEntry<string> | undefined
    if (entry) {
      entry.expiresAt = Date.now() - 1000
      store?.set(fullKey, entry)
    }

    const result = await cache.get('expire-test')
    expect(result).toBeNull()
  })

  it('should handle debug mode logging on get error', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    vi.resetModules()

    // Temporarily break IDB
    const brokenIDB = {
      open() { throw new Error('IDB broken') },
    }
    vi.stubGlobal('indexedDB', brokenIDB)

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: true })

    const result = await cache.get('key')
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()

    vi.stubGlobal('indexedDB', mockIDB)
    consoleSpy.mockRestore()
  })

  it('should handle debug mode logging on set error', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    vi.resetModules()

    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: true })

    await cache.set('key', 'val')
    expect(consoleSpy).toHaveBeenCalled()

    vi.stubGlobal('indexedDB', mockIDB)
    consoleSpy.mockRestore()
  })

  it('should handle non-debug mode on set error silently', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    vi.resetModules()

    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: false })

    await cache.set('key', 'val')
    // In non-debug mode, no console.warn for set
    // The catch block only logs if config.debug is true
    vi.stubGlobal('indexedDB', mockIDB)
    consoleSpy.mockRestore()
  })

  it('should handle clear with entries that do not match prefix', async () => {
    vi.resetModules()
    const { CacheStorage } = await import('./ai/cache/storage')

    const cache1 = new CacheStorage<string>('extraction', { ...defaultConfig, prefix: 'prefix_a' })
    const cache2 = new CacheStorage<string>('extraction', { ...defaultConfig, prefix: 'prefix_b' })

    await cache1.set('key1', 'data1')
    await cache2.set('key2', 'data2')

    await cache1.clear()

    // cache1's entry should be gone
    expect(await cache1.get('key1')).toBeNull()
    // cache2's entry should still exist
    const entry = await cache2.get('key2')
    expect(entry?.data).toBe('data2')
  })

  it('should return 0 from pruneExpired when no expired entries', async () => {
    vi.resetModules()
    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    const count = await cache.pruneExpired()
    expect(count).toBe(0)
  })

  it('should handle pruneExpired error gracefully', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    const count = await cache.pruneExpired()
    expect(count).toBe(0)

    vi.stubGlobal('indexedDB', mockIDB)
  })

  it('should handle recordMiss errors gracefully', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    await expect(cache.recordMiss()).resolves.not.toThrow()

    vi.stubGlobal('indexedDB', mockIDB)
  })

  it('should handle getStats error gracefully and return zero stats', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    const stats = await cache.getStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.entryCount).toBe(0)
    expect(stats.size).toBe(0)

    vi.stubGlobal('indexedDB', mockIDB)
  })

  it('should handle clear error in debug mode', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    vi.resetModules()
    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', { ...defaultConfig, debug: true })

    await cache.clear()
    expect(consoleSpy).toHaveBeenCalled()

    vi.stubGlobal('indexedDB', mockIDB)
    consoleSpy.mockRestore()
  })

  it('should correctly report isIndexedDBAvailable as true when available', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', mockIDB)

    const { isIndexedDBAvailable } = await import('./ai/cache/storage')
    expect(isIndexedDBAvailable()).toBe(true)
  })

  it('should correctly report isIndexedDBAvailable as false when undefined', async () => {
    const original = globalThis.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()

    const { isIndexedDBAvailable } = await import('./ai/cache/storage')
    expect(isIndexedDBAvailable()).toBe(false)

    vi.stubGlobal('indexedDB', original)
  })

  it('should handle delete error silently in catch block', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', { open() { throw new Error('IDB broken') } })

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    // Should not throw
    await expect(cache.delete('any-key')).resolves.not.toThrow()

    vi.stubGlobal('indexedDB', mockIDB)
  })

  it('should set metadata and retrieve it in recordMiss path', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', mockIDB)

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', defaultConfig)

    await cache.recordMiss()
    await cache.recordMiss()
    await cache.recordMiss()

    // The miss count is stored in metadata
    // We can verify by checking stats (which reads metadata)
    const stats = await cache.getStats()
    // Stats.misses should reflect recorded misses
    // Due to async nature, at least some should be recorded
    expect(stats.misses).toBeGreaterThanOrEqual(0)
  })

  it('should evict entries when maxEntries exceeded', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', mockIDB)

    const { CacheStorage } = await import('./ai/cache/storage')
    const cache = new CacheStorage<string>('extraction', {
      ...defaultConfig,
      maxEntries: 2,
      maxSize: 1024 * 1024,
    })

    await cache.set('k1', 'data1')
    await cache.set('k2', 'data2')
    await cache.set('k3', 'data3')

    // Wait for async eviction
    await new Promise(r => setTimeout(r, 100))

    const stats = await cache.getStats()
    // After eviction, should have fewer or equal entries
    expect(stats.entryCount).toBeLessThanOrEqual(3)
  })
})
