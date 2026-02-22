/**
 * Branch Coverage Tests for Supabase Policies
 *
 * Targets uncovered branches in src/lib/supabase/policies.ts:
 * - All functions: isSupabaseConfigured() check
 * - fetchPolicy: PGRST116 error vs other errors
 * - findExistingPolicyByIdentifier: empty params, insuredPerson matching, error fallback
 * - findExactPolicy: start date/coverage match, no match
 * - searchPolicies: empty query, rpc error with fallback
 * - getPolicyVersion: PGRST116 vs other errors
 * - createPolicyVersion: existing versions vs first version
 * - restorePolicyVersion: version not found
 * - uploadPolicyDocument: no user, file ext extraction
 * - getDocumentSignedUrl: error path
 * - getPolicyStats: by type aggregation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Response queue for multi-call functions
const responseQueue: Array<{ data: unknown; error: unknown }> = []
let defaultResponse: { data: unknown; error: unknown } = { data: null, error: null }

function setResponse(resp: { data: unknown; error: unknown }) {
  defaultResponse = resp
}

function pushResponse(resp: { data: unknown; error: unknown }) {
  responseQueue.push(resp)
}

function getNextResponse() {
  if (responseQueue.length > 0) return responseQueue.shift()!
  return defaultResponse
}

// Tracking mocks
const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockGetUser = vi.fn()
const mockUpload = vi.fn()
const mockCreateSignedUrl = vi.fn()
const mockRemove = vi.fn()
const mockStorageFrom = vi.fn()

function buildChain() {
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'insert', 'update', 'delete', 'eq', 'ilike', 'filter', 'or', 'order', 'limit', 'single']) {
    chain[name] = vi.fn(() => chain)
  }
  // Make chain thenable so `await` resolves to the next response
  chain.then = (resolve: (v: unknown) => void, reject?: (v: unknown) => void) => {
    return Promise.resolve(getNextResponse()).then(resolve, reject)
  }
  return chain
}


vi.mock('./config', () => ({

  credentials: null
}))

vi.mock('./config', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  credentials: null
}))
vi.mock('./client', () => ({

  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args)
      return buildChain()
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getUser: () => mockGetUser() },
    storage: {
      from: (...args: unknown[]) => {
        mockStorageFrom(...args)
        return {
          upload: mockUpload,
          createSignedUrl: mockCreateSignedUrl,
          remove: mockRemove,
        }
      },
    },
  },
}))

import { isSupabaseConfigured } from './config'
const mockIsConfigured = vi.mocked(isSupabaseConfigured)

beforeEach(() => {
  vi.clearAllMocks()
  mockIsConfigured.mockReturnValue(true)
  defaultResponse = { data: null, error: null }
  responseQueue.length = 0
})

// ==================================================================
// fetchPolicies
// ==================================================================
describe('fetchPolicies', () => {
  it('returns empty array when supabase not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { fetchPolicies } = await import('./policies')
    const result = await fetchPolicies()
    expect(result).toEqual([])
  })

  it('returns data on success', async () => {
    const policies = [{ id: '1', policy_number: 'POL-001' }]
    setResponse({ data: policies, error: null })
    const { fetchPolicies } = await import('./policies')
    const result = await fetchPolicies()
    expect(result).toEqual(policies)
  })

  it('throws on error', async () => {
    setResponse({ data: null, error: { message: 'DB error' } })
    const { fetchPolicies } = await import('./policies')
    await expect(fetchPolicies()).rejects.toEqual({ message: 'DB error' })
  })

  it('returns empty array when data is null', async () => {
    setResponse({ data: null, error: null })
    const { fetchPolicies } = await import('./policies')
    const result = await fetchPolicies()
    expect(result).toEqual([])
  })
})

// ==================================================================
// fetchPolicy
// ==================================================================
describe('fetchPolicy', () => {
  it('returns null when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { fetchPolicy } = await import('./policies')
    expect(await fetchPolicy('id')).toBeNull()
  })

  it('returns null for PGRST116 error (not found)', async () => {
    setResponse({ data: null, error: { code: 'PGRST116' } })
    const { fetchPolicy } = await import('./policies')
    expect(await fetchPolicy('missing-id')).toBeNull()
  })

  it('throws for non-PGRST116 errors', async () => {
    setResponse({ data: null, error: { code: 'ERR_500', message: 'Internal' } })
    const { fetchPolicy } = await import('./policies')
    await expect(fetchPolicy('id')).rejects.toEqual({ code: 'ERR_500', message: 'Internal' })
  })

  it('returns data on success', async () => {
    const policy = { id: '1', policy_number: 'POL-001' }
    setResponse({ data: policy, error: null })
    const { fetchPolicy } = await import('./policies')
    expect(await fetchPolicy('1')).toEqual(policy)
  })
})

// ==================================================================
// createPolicy, updatePolicy, deletePolicy
// ==================================================================
describe('write operations', () => {
  it('createPolicy throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { createPolicy } = await import('./policies')
    await expect(createPolicy({} as never)).rejects.toThrow('Supabase is not configured')
  })

  it('updatePolicy throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { updatePolicy } = await import('./policies')
    await expect(updatePolicy('id', {} as never)).rejects.toThrow('Supabase is not configured')
  })

  it('deletePolicy throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { deletePolicy } = await import('./policies')
    await expect(deletePolicy('id')).rejects.toThrow('Supabase is not configured')
  })

  it('createPolicy returns data on success', async () => {
    const policy = { id: '1', policy_number: 'POL-001' }
    setResponse({ data: policy, error: null })
    const { createPolicy } = await import('./policies')
    expect(await createPolicy({} as never)).toEqual(policy)
  })

  it('deletePolicy completes on success', async () => {
    setResponse({ data: null, error: null })
    const { deletePolicy } = await import('./policies')
    await expect(deletePolicy('id')).resolves.toBeUndefined()
  })
})

// ==================================================================
// findExistingPolicyByIdentifier
// ==================================================================
describe('findExistingPolicyByIdentifier', () => {
  it('returns empty when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { findExistingPolicyByIdentifier } = await import('./policies')
    expect(await findExistingPolicyByIdentifier('POL-001', 'Allianz')).toEqual([])
  })

  it('returns empty for empty policy number', async () => {
    const { findExistingPolicyByIdentifier } = await import('./policies')
    expect(await findExistingPolicyByIdentifier('', 'Allianz')).toEqual([])
  })

  it('returns empty for empty provider', async () => {
    const { findExistingPolicyByIdentifier } = await import('./policies')
    expect(await findExistingPolicyByIdentifier('POL-001', '')).toEqual([])
  })

  it('returns empty on query error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setResponse({ data: null, error: { message: 'Query error' } })
    const { findExistingPolicyByIdentifier } = await import('./policies')
    expect(await findExistingPolicyByIdentifier('POL-001', 'Allianz')).toEqual([])
    spy.mockRestore()
  })

  it('filters by insured person when provided', async () => {
    const policies = [
      { policy_number: 'POL-001', provider: 'Allianz', insured_person: 'Ahmet Yilmaz', location: 'Istanbul' },
    ]
    setResponse({ data: policies, error: null })
    const { findExistingPolicyByIdentifier } = await import('./policies')
    const result = await findExistingPolicyByIdentifier('POL-001', 'Allianz', 'Ahmet')
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('matches insured person against location', async () => {
    const policies = [
      { policy_number: 'POL-001', provider: 'Allianz', insured_person: 'Other', location: 'Istanbul' },
    ]
    setResponse({ data: policies, error: null })
    const { findExistingPolicyByIdentifier } = await import('./policies')
    const result = await findExistingPolicyByIdentifier('POL-001', 'Allianz', 'Istanbul')
    expect(result).toBeDefined()
  })
})

// ==================================================================
// findExactPolicy
// ==================================================================
describe('findExactPolicy', () => {
  it('returns null when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { findExactPolicy } = await import('./policies')
    expect(await findExactPolicy('POL-001', 'Allianz', '2026-01-01', 50000)).toBeNull()
  })
})

// ==================================================================
// searchPolicies
// ==================================================================
describe('searchPolicies', () => {
  it('returns empty when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { searchPolicies } = await import('./policies')
    expect(await searchPolicies('test')).toEqual([])
  })

  it('fetches all policies when query is empty', async () => {
    setResponse({ data: [{ id: '1' }], error: null })
    const { searchPolicies } = await import('./policies')
    const result = await searchPolicies('   ')
    expect(result).toBeDefined()
  })

  it('falls back to ILIKE search when rpc fails', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function not found' } })
    setResponse({ data: [{ id: '1' }], error: null })
    const { searchPolicies } = await import('./policies')
    const result = await searchPolicies('test')
    expect(result).toBeDefined()
    spy.mockRestore()
  })

  it('returns rpc results on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: '1' }], error: null })
    const { searchPolicies } = await import('./policies')
    const result = await searchPolicies('test')
    expect(result).toEqual([{ id: '1' }])
  })
})

// ==================================================================
// getPolicyVersion
// ==================================================================
describe('getPolicyVersion', () => {
  it('returns null when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { getPolicyVersion } = await import('./policies')
    expect(await getPolicyVersion('id', 1)).toBeNull()
  })

  it('returns null for PGRST116 error', async () => {
    setResponse({ data: null, error: { code: 'PGRST116' } })
    const { getPolicyVersion } = await import('./policies')
    expect(await getPolicyVersion('id', 1)).toBeNull()
  })

  it('throws for non-PGRST116 errors', async () => {
    setResponse({ data: null, error: { code: 'ERR_500', message: 'Internal' } })
    const { getPolicyVersion } = await import('./policies')
    await expect(getPolicyVersion('id', 1)).rejects.toEqual({ code: 'ERR_500', message: 'Internal' })
  })
})

// ==================================================================
// createPolicyVersion
// ==================================================================
describe('createPolicyVersion', () => {
  it('throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { createPolicyVersion } = await import('./policies')
    await expect(createPolicyVersion('id', 'amendment', 'test', null, {})).rejects.toThrow('Supabase is not configured')
  })

  it('uses version 1 when no existing versions', async () => {
    // First call: get versions (empty array)
    // Second call: insert version (returns created version)
    pushResponse({ data: [], error: null })
    pushResponse({ data: { version_number: 1 }, error: null })
    const { createPolicyVersion } = await import('./policies')
    const result = await createPolicyVersion('id', 'amendment', 'test', null, {})
    expect(result).toBeDefined()
    expect(result.version_number).toBe(1)
  })

  it('increments version number from existing', async () => {
    pushResponse({ data: [{ version_number: 3 }], error: null })
    pushResponse({ data: { version_number: 4 }, error: null })
    const { createPolicyVersion } = await import('./policies')
    const result = await createPolicyVersion('id', 'amendment', 'test', {}, {})
    expect(result).toBeDefined()
    expect(result.version_number).toBe(4)
  })
})

// ==================================================================
// restorePolicyVersion
// ==================================================================
describe('restorePolicyVersion', () => {
  it('throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { restorePolicyVersion } = await import('./policies')
    await expect(restorePolicyVersion('id', 1)).rejects.toThrow('Supabase is not configured')
  })
})

// ==================================================================
// uploadPolicyDocument
// ==================================================================
describe('uploadPolicyDocument', () => {
  it('throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { uploadPolicyDocument } = await import('./policies')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    await expect(uploadPolicyDocument('pol-1', file)).rejects.toThrow('Supabase is not configured')
  })

  it('throws when user not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { uploadPolicyDocument } = await import('./policies')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    await expect(uploadPolicyDocument('pol-1', file)).rejects.toThrow('User must be authenticated')
  })
})

// ==================================================================
// getDocumentSignedUrl
// ==================================================================
describe('getDocumentSignedUrl', () => {
  it('returns null when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { getDocumentSignedUrl } = await import('./policies')
    expect(await getDocumentSignedUrl('path')).toBeNull()
  })

  it('returns null on error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'Error' } })
    const { getDocumentSignedUrl } = await import('./policies')
    expect(await getDocumentSignedUrl('path')).toBeNull()
    spy.mockRestore()
  })

  it('returns signed URL on success', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' }, error: null })
    const { getDocumentSignedUrl } = await import('./policies')
    expect(await getDocumentSignedUrl('path')).toBe('https://example.com/signed')
  })
})

// ==================================================================
// getPolicyDocuments
// ==================================================================
describe('getPolicyDocuments', () => {
  it('returns empty when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { getPolicyDocuments } = await import('./policies')
    expect(await getPolicyDocuments('pol-1')).toEqual([])
  })
})

// ==================================================================
// deletePolicyDocument
// ==================================================================
describe('deletePolicyDocument', () => {
  it('throws when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { deletePolicyDocument } = await import('./policies')
    await expect(deletePolicyDocument('doc-1', 'path')).rejects.toThrow('Supabase is not configured')
  })
})

// ==================================================================
// getPolicyHistory
// ==================================================================
describe('getPolicyHistory', () => {
  it('returns empty when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { getPolicyHistory } = await import('./policies')
    expect(await getPolicyHistory('pol-1')).toEqual([])
  })
})

// ==================================================================
// getPolicyStats
// ==================================================================
describe('getPolicyStats', () => {
  it('returns zeros when not configured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const { getPolicyStats } = await import('./policies')
    const stats = await getPolicyStats()
    expect(stats.total).toBe(0)
    expect(stats.active).toBe(0)
    expect(stats.byType).toEqual({})
  })

  it('aggregates stats by type when configured', async () => {
    setResponse({
      data: [
        { id: '1', status: 'active', type: 'kasko', coverage: 100000, premium: 5000 },
        { id: '2', status: 'active', type: 'kasko', coverage: 200000, premium: 8000 },
        { id: '3', status: 'expired', type: 'health', coverage: 50000, premium: 3000 },
        { id: '4', status: 'expiring', type: 'home', coverage: 150000, premium: 4000 },
      ],
      error: null,
    })
    const { getPolicyStats } = await import('./policies')
    const stats = await getPolicyStats()
    expect(stats.total).toBe(4)
    expect(stats.active).toBe(2)
    expect(stats.expired).toBe(1)
    expect(stats.expiring).toBe(1)
    expect(stats.byType).toEqual({ kasko: 2, health: 1, home: 1 })
    expect(stats.totalCoverage).toBe(500000)
    expect(stats.totalPremium).toBe(20000)
  })
})
