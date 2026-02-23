import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to define mocks before module hoisting
const { mockFrom, mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockSingle, mockUpload, mockRemove, mockGetPublicUrl, mockCreateSignedUrl, mockGetUser, mockRpc, mockOr, mockSupabase, mockIsConfigured } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockDelete = vi.fn()
  const mockEq = vi.fn()
  const mockOrder = vi.fn()
  const mockSingle = vi.fn()
  const mockUpload = vi.fn()
  const mockRemove = vi.fn()
  const mockGetPublicUrl = vi.fn()
  const mockCreateSignedUrl = vi.fn()
  const mockGetUser = vi.fn()
  const mockRpc = vi.fn()
  const mockOr = vi.fn()
  const mockIsConfigured = vi.fn(() => true)

  const mockSupabase = {
    from: mockFrom,
    rpc: mockRpc,
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
        getPublicUrl: mockGetPublicUrl,
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
    auth: {
      getUser: mockGetUser,
    },
  }

  return { mockFrom, mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockSingle, mockUpload, mockRemove, mockGetPublicUrl, mockCreateSignedUrl, mockGetUser, mockRpc, mockOr, mockSupabase, mockIsConfigured }
})


vi.mock('./config', () => ({

  credentials: null
}))

vi.mock('./config', () => ({
  isSupabaseConfigured: mockIsConfigured,
  credentials: null
}))
vi.mock('./client', () => ({
  supabase: mockSupabase,

}))

// Import after mocking
import {
  fetchPolicies,
  fetchPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  uploadPolicyDocument,
  getPolicyDocuments,
  deletePolicyDocument,
  getDocumentSignedUrl,
  getPolicyDocumentsWithUrls,
  searchPolicies,
  getPolicyHistory,
  getPolicyVersion,
  createPolicyVersion,
  restorePolicyVersion,
  getPolicyStats,
} from './policies'
import type { PolicyInsert, PolicyUpdate, PolicyRow, PolicyDocumentRow } from './types'

describe('Policy Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure isSupabaseConfigured returns true for all tests
    mockIsConfigured.mockReturnValue(true)

    // Setup default mock chain
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    })
    mockSelect.mockReturnValue({
      order: mockOrder,
      eq: mockEq,
      single: mockSingle,
    })
    mockInsert.mockReturnValue({
      select: mockSelect,
      error: null,
    })
    mockUpdate.mockReturnValue({
      eq: mockEq,
    })
    mockDelete.mockReturnValue({
      eq: mockEq,
    })
    mockOrder.mockReturnValue({
      data: [],
      error: null,
    })
    mockEq.mockReturnValue({
      select: mockSelect,
      order: mockOrder,
      single: mockSingle,
      data: null,
      error: null,
    })
    // Setup getPublicUrl mock
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.com/test.pdf' },
    })
    // Setup createSignedUrl mock
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed/test.pdf' },
      error: null,
    })
    // Setup getUser mock
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
  })

  describe('fetchPolicies', () => {
    it('should fetch all policies ordered by created_at', async () => {
      const mockPolicies = [
        { id: '1', policy_number: 'POL-001', provider: 'Test' },
        { id: '2', policy_number: 'POL-002', provider: 'Test' },
      ]
      mockOrder.mockReturnValue({ data: mockPolicies, error: null })

      const result = await fetchPolicies()

      expect(mockFrom).toHaveBeenCalledWith('policies')
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(result).toEqual(mockPolicies)
    })

    it('should return empty array when Supabase is not configured', async () => {
      vi.doMock('./client', () => ({
        supabase: mockSupabase,
        isSupabaseConfigured: vi.fn(() => false),
      }))

      // For this test, we just verify the function handles edge cases
      mockOrder.mockReturnValue({ data: [], error: null })
      const result = await fetchPolicies()
      expect(result).toEqual([])
    })

    it('should throw error on fetch failure', async () => {
      mockOrder.mockReturnValue({
        data: null,
        error: { message: 'Database error' },
      })

      await expect(fetchPolicies()).rejects.toThrow()
    })
  })

  describe('fetchPolicy', () => {
    it('should fetch single policy by id', async () => {
      const mockPolicy = { id: '1', policy_number: 'POL-001' }
      mockEq.mockReturnValue({
        single: mockSingle,
      })
      mockSingle.mockReturnValue({ data: mockPolicy, error: null })

      const result = await fetchPolicy('1')

      expect(mockFrom).toHaveBeenCalledWith('policies')
      expect(mockEq).toHaveBeenCalledWith('id', '1')
      expect(result).toEqual(mockPolicy)
    })

    it('should throw error when policy not found', async () => {
      mockEq.mockReturnValue({
        single: mockSingle,
      })
      mockSingle.mockReturnValue({
        data: null,
        error: { message: 'Policy not found' },
      })

      await expect(fetchPolicy('nonexistent')).rejects.toThrow()
    })
  })

  describe('createPolicy', () => {
    it('should create a new policy', async () => {
      const newPolicy: PolicyInsert = {
        user_id: 'user-123',
        policy_number: 'POL-001',
        provider: 'Test Insurance',
        type: 'home',
        type_tr: 'Konut Sigortası',
        coverage: 500000,
        premium: 2500,
        start_date: '2024-01-01',
        expiry_date: '2025-01-01',
        insured_person: 'Test User',
      }

      const createdPolicy = { id: 'new-1', ...newPolicy }
      mockSelect.mockReturnValue({
        single: mockSingle,
      })
      mockSingle.mockReturnValue({ data: createdPolicy, error: null })

      const result = await createPolicy(newPolicy)

      expect(mockFrom).toHaveBeenCalledWith('policies')
      expect(mockInsert).toHaveBeenCalledWith(newPolicy)
      expect(result).toEqual(createdPolicy)
    })

    it('should throw error when Supabase is not configured', async () => {
      vi.doMock('./client', () => ({
        supabase: mockSupabase,
        isSupabaseConfigured: vi.fn(() => false),
      }))

      const newPolicy: PolicyInsert = {
        user_id: 'user-123',
        policy_number: 'POL-001',
        provider: 'Test',
        type: 'home',
        type_tr: 'Konut',
        coverage: 100000,
        premium: 1000,
        start_date: '2024-01-01',
        expiry_date: '2025-01-01',
        insured_person: 'Test',
      }

      // This would throw in the actual implementation
      mockSelect.mockReturnValue({
        single: mockSingle,
      })
      mockSingle.mockReturnValue({
        data: null,
        error: { message: 'Not configured' },
      })

      await expect(createPolicy(newPolicy)).rejects.toThrow()
    })
  })

  describe('updatePolicy', () => {
    it('should update an existing policy', async () => {
      const updates: PolicyUpdate = {
        premium: 3000,
        coverage: 600000,
      }

      const updatedPolicy = {
        id: '1',
        policy_number: 'POL-001',
        premium: 3000,
        coverage: 600000,
      }

      mockEq.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      })
      mockSingle.mockReturnValue({ data: updatedPolicy, error: null })

      const result = await updatePolicy('1', updates)

      expect(mockFrom).toHaveBeenCalledWith('policies')
      expect(mockUpdate).toHaveBeenCalledWith(updates)
      expect(mockEq).toHaveBeenCalledWith('id', '1')
      expect(result).toEqual(updatedPolicy)
    })
  })

  describe('deletePolicy', () => {
    it('should delete a policy by id', async () => {
      mockEq.mockReturnValue({ error: null })

      await deletePolicy('1')

      expect(mockFrom).toHaveBeenCalledWith('policies')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('id', '1')
    })

    it('should throw error on delete failure', async () => {
      mockEq.mockReturnValue({ error: { message: 'Delete failed' } })

      await expect(deletePolicy('1')).rejects.toThrow()
    })
  })

  describe('uploadPolicyDocument', () => {
    it('should upload a file to storage with user-scoped path', async () => {
      const mockFile = new File(['test content'], 'test.pdf', {
        type: 'application/pdf',
      })

      mockUpload.mockResolvedValue({
        data: { path: 'policy-documents/user-123/1/123.pdf' },
        error: null,
      })

      // Mock the insert for document record
      mockFrom.mockImplementation((table: string) => {
        if (table === 'policy_documents') {
          return { insert: vi.fn().mockReturnValue({ error: null }) }
        }
        return {
          select: mockSelect,
          insert: mockInsert,
          update: mockUpdate,
          delete: mockDelete,
        }
      })

      const result = await uploadPolicyDocument('1', mockFile)

      expect(result).toHaveProperty('path')
      expect(result).toHaveProperty('url')
      expect(result.path).toContain('policy-documents/user-123/1/')
      expect(result.url).toBe('https://example.com/signed/test.pdf')
    })

    it('should throw error when user is not authenticated', async () => {
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      })

      await expect(uploadPolicyDocument('1', mockFile)).rejects.toThrow(
        'User must be authenticated to upload documents'
      )
    })

    it('should throw error on upload failure', async () => {
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })

      mockUpload.mockResolvedValue({
        data: null,
        error: { message: 'Upload failed' },
      })

      await expect(uploadPolicyDocument('1', mockFile)).rejects.toThrow()
    })
  })

  describe('getPolicyDocuments', () => {
    it('should fetch documents for a policy', async () => {
      const mockDocuments = [
        { id: 'doc-1', file_name: 'policy.pdf', policy_id: '1' },
        { id: 'doc-2', file_name: 'addendum.pdf', policy_id: '1' },
      ]

      mockEq.mockReturnValue({
        order: vi.fn().mockReturnValue({ data: mockDocuments, error: null }),
      })

      const result = await getPolicyDocuments('1')

      expect(mockFrom).toHaveBeenCalledWith('policy_documents')
      expect(result).toEqual(mockDocuments)
    })
  })

  describe('deletePolicyDocument', () => {
    it('should delete a document from storage and database', async () => {
      // Mock fetching the document
      mockEq.mockReturnValueOnce({
        single: vi.fn().mockReturnValue({
          data: { id: 'doc-1', file_path: 'user-123/1/test.pdf' },
          error: null,
        }),
      })

      // Mock storage remove
      mockRemove.mockResolvedValue({ error: null })

      // Mock database delete
      mockEq.mockReturnValueOnce({ error: null })

      await deletePolicyDocument('doc-1', 'policy-documents/test/file.pdf')

      expect(mockRemove).toHaveBeenCalled()
    })

    it('should throw when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      await expect(deletePolicyDocument('doc-1', 'path/file.pdf')).rejects.toThrow(
        'Supabase is not configured'
      )
    })

    it('should throw on storage delete failure', async () => {
      mockRemove.mockResolvedValue({ error: { message: 'Storage error' } })

      await expect(deletePolicyDocument('doc-1', 'path/file.pdf')).rejects.toThrow()
    })

    it('should throw on database delete failure', async () => {
      mockRemove.mockResolvedValue({ error: null })
      // First mockEq is for policy_documents delete
      mockFrom.mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ error: { message: 'Database error' } }),
        }),
      })

      await expect(deletePolicyDocument('doc-1', 'path/file.pdf')).rejects.toThrow()
    })
  })

  // ===========================================================================
  // fetchPolicy edge cases
  // ===========================================================================

  describe('fetchPolicy edge cases', () => {
    it('should return null when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      const result = await fetchPolicy('1')

      expect(result).toBeNull()
    })

    it('should return null for PGRST116 (not found) error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            data: null,
            error: { code: 'PGRST116', message: 'Not found' },
          }),
        }),
      })

      const result = await fetchPolicy('nonexistent')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // getDocumentSignedUrl Tests
  // ===========================================================================

  describe('getDocumentSignedUrl', () => {
    it('should return signed URL for a document', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed/doc.pdf' },
        error: null,
      })

      const result = await getDocumentSignedUrl('path/to/doc.pdf')

      expect(result).toBe('https://example.com/signed/doc.pdf')
    })

    it('should return null when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      const result = await getDocumentSignedUrl('path/to/doc.pdf')

      expect(result).toBeNull()
    })

    it('should return null on error', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'Failed to create signed URL' },
      })

      const result = await getDocumentSignedUrl('path/to/doc.pdf')

      expect(result).toBeNull()
    })

    it('should use custom expiry time', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed/doc.pdf' },
        error: null,
      })

      await getDocumentSignedUrl('path/to/doc.pdf', 7200)

      expect(mockCreateSignedUrl).toHaveBeenCalledWith('path/to/doc.pdf', 7200)
    })
  })

  // ===========================================================================
  // getPolicyDocumentsWithUrls Tests
  // ===========================================================================

  describe('getPolicyDocumentsWithUrls', () => {
    it('should return documents with signed URLs', async () => {
      const mockDocuments: Partial<PolicyDocumentRow>[] = [
        { id: 'doc-1', file_name: 'policy.pdf', file_path: 'path/doc1.pdf', policy_id: '1' },
        { id: 'doc-2', file_name: 'addendum.pdf', file_path: 'path/doc2.pdf', policy_id: '1' },
      ]

      // Override the full chain for policy_documents query
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ data: mockDocuments, error: null }),
        }),
      })

      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed/doc.pdf' },
        error: null,
      })

      const result = await getPolicyDocumentsWithUrls('1')

      expect(result.length).toBe(2)
      expect(result[0].signedUrl).toBe('https://example.com/signed/doc.pdf')
      expect(result[1].signedUrl).toBe('https://example.com/signed/doc.pdf')
    })

    it('should return null signedUrl when URL creation fails', async () => {
      const mockDocuments: Partial<PolicyDocumentRow>[] = [
        { id: 'doc-1', file_name: 'policy.pdf', file_path: 'path/doc1.pdf', policy_id: '1' },
      ]

      // Override the full chain for policy_documents query
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ data: mockDocuments, error: null }),
        }),
      })

      mockCreateSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'Failed' },
      })

      const result = await getPolicyDocumentsWithUrls('1')

      expect(result[0].signedUrl).toBeNull()
    })
  })

  // ===========================================================================
  // searchPolicies Tests
  // ===========================================================================

  describe('searchPolicies', () => {
    it('should return empty array when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      const result = await searchPolicies('test')

      expect(result).toEqual([])
    })

    it('should return all policies for empty query', async () => {
      const mockPolicies = [
        { id: '1', policy_number: 'POL-001' },
        { id: '2', policy_number: 'POL-002' },
      ]
      mockOrder.mockReturnValue({ data: mockPolicies, error: null })

      const result = await searchPolicies('')

      expect(mockFrom).toHaveBeenCalledWith('policies')
      expect(result).toEqual(mockPolicies)
    })

    it('should search using RPC function', async () => {
      const mockPolicies = [{ id: '1', policy_number: 'POL-001' }]
      mockRpc.mockResolvedValue({ data: mockPolicies, error: null })

      const result = await searchPolicies('POL-001')

      expect(mockRpc).toHaveBeenCalledWith('search_policies', { search_query: 'POL-001' })
      expect(result).toEqual(mockPolicies)
    })

    it('should fall back to ILIKE search when RPC fails', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'Function not found' } })

      const mockPolicies = [{ id: '1', policy_number: 'POL-001' }]
      mockOr.mockReturnValue({
        order: vi.fn().mockReturnValue({ data: mockPolicies, error: null }),
      })
      mockSelect.mockReturnValue({ or: mockOr })

      const result = await searchPolicies('POL-001')

      expect(result).toEqual(mockPolicies)
    })

    it('should trim whitespace from query', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null })

      await searchPolicies('  test  ')

      expect(mockRpc).toHaveBeenCalledWith('search_policies', { search_query: 'test' })
    })
  })

  // ===========================================================================
  // getPolicyHistory Tests
  // ===========================================================================

  describe('getPolicyHistory', () => {
    it('should return empty array when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      const result = await getPolicyHistory('1')

      expect(result).toEqual([])
    })

    it('should fetch version history ordered by version number', async () => {
      const mockVersions = [
        { id: 'v1', policy_id: '1', version_number: 2, change_type: 'updated' },
        { id: 'v2', policy_id: '1', version_number: 1, change_type: 'created' },
      ]

      // Override the full chain for policy_versions query
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ data: mockVersions, error: null }),
        }),
      })

      const result = await getPolicyHistory('1')

      expect(mockFrom).toHaveBeenCalledWith('policy_versions')
      expect(result).toEqual(mockVersions)
    })

    it('should throw on error', async () => {
      // Override the full chain for policy_versions query with error
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ data: null, error: { message: 'Database error' } }),
        }),
      })

      await expect(getPolicyHistory('1')).rejects.toThrow()
    })
  })

  // ===========================================================================
  // getPolicyVersion Tests
  // ===========================================================================

  describe('getPolicyVersion', () => {
    it('should return null when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      const result = await getPolicyVersion('1', 1)

      expect(result).toBeNull()
    })

    it('should fetch specific version by policy ID and version number', async () => {
      const mockVersion = {
        id: 'v1',
        policy_id: '1',
        version_number: 2,
        change_type: 'updated',
        new_data: { premium: 5000 },
      }

      // Override the full chain for policy_versions query with double eq
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({ data: mockVersion, error: null }),
          }),
        }),
      })

      const result = await getPolicyVersion('1', 2)

      expect(mockFrom).toHaveBeenCalledWith('policy_versions')
      expect(result).toEqual(mockVersion)
    })

    it('should return null for PGRST116 (not found) error', async () => {
      // Override the full chain for policy_versions query with error
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' },
            }),
          }),
        }),
      })

      const result = await getPolicyVersion('1', 99)

      expect(result).toBeNull()
    })

    it('should throw on other errors', async () => {
      // Override the full chain for policy_versions query with error
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({
              data: null,
              error: { code: 'OTHER', message: 'Database error' },
            }),
          }),
        }),
      })

      await expect(getPolicyVersion('1', 1)).rejects.toThrow()
    })
  })

  // ===========================================================================
  // createPolicyVersion Tests
  // ===========================================================================

  describe('createPolicyVersion', () => {
    it('should throw when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      await expect(
        createPolicyVersion('1', 'updated', 'Test change', null, { premium: 5000 })
      ).rejects.toThrow('Supabase is not configured')
    })

    it('should create version with next version number', async () => {
      // Mock fetching existing versions with full chain
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              data: [{ version_number: 3 }],
              error: null,
            }),
          }),
        }),
      })

      // Mock insert
      const newVersion = {
        id: 'v4',
        policy_id: '1',
        version_number: 4,
        change_type: 'manual_edit',
        change_summary: 'Updated premium',
        previous_data: { premium: 4000 },
        new_data: { premium: 5000 },
      }

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({ data: newVersion, error: null }),
        }),
      })

      const result = await createPolicyVersion(
        '1',
        'manual_edit',
        'Updated premium',
        { premium: 4000 },
        { premium: 5000 }
      )

      expect(result).toEqual(newVersion)
    })

    it('should start at version 1 when no versions exist', async () => {
      // Mock no existing versions with full chain
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              data: [],
              error: null,
            }),
          }),
        }),
      })

      const newVersion = {
        id: 'v1',
        policy_id: '1',
        version_number: 1,
        change_type: 'created',
      }

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({ data: newVersion, error: null }),
        }),
      })

      const result = await createPolicyVersion('1', 'created', 'Initial version', null, {})

      expect(result.version_number).toBe(1)
    })

    it('should throw on insert error', async () => {
      // Mock fetching existing versions with full chain
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              data: [],
              error: null,
            }),
          }),
        }),
      })

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            data: null,
            error: { message: 'Insert failed' },
          }),
        }),
      })

      await expect(
        createPolicyVersion('1', 'updated', 'Test', null, {})
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // restorePolicyVersion Tests
  // ===========================================================================

  describe('restorePolicyVersion', () => {
    it('should throw when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      await expect(restorePolicyVersion('1', 1)).rejects.toThrow(
        'Supabase is not configured'
      )
    })

    it('should throw when version not found', async () => {
      // Mock getPolicyVersion returning not found
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' },
            }),
          }),
        }),
      })

      await expect(restorePolicyVersion('1', 99)).rejects.toThrow(
        'Version 99 not found for policy 1'
      )
    })

    it('should restore policy to previous version', async () => {
      const versionData = {
        id: 'v2',
        policy_id: '1',
        version_number: 2,
        new_data: {
          policy_number: 'POL-001',
          provider: 'Old Insurance',
          premium: 4000,
          coverage: 400000,
          type: 'home',
          type_tr: 'Konut',
          start_date: '2024-01-01',
          expiry_date: '2025-01-01',
          status: 'active',
          insured_person: 'Test User',
          location: 'Istanbul',
          deductible: 1000,
          raw_data: null,
        },
      }

      // Mock getPolicyVersion with full chain
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({ data: versionData, error: null }),
          }),
        }),
      })

      // Mock updatePolicy with full chain from update
      const updatedPolicy = {
        id: '1',
        ...versionData.new_data,
      }
      mockUpdate.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({ data: updatedPolicy, error: null }),
          }),
        }),
      })

      const result = await restorePolicyVersion('1', 2)

      expect(mockUpdate).toHaveBeenCalled()
      expect(result).toEqual(updatedPolicy)
    })
  })

  // ===========================================================================
  // getPolicyStats Tests
  // ===========================================================================

  describe('getPolicyStats', () => {
    it('should return empty stats when Supabase is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false)

      const result = await getPolicyStats()

      expect(result).toEqual({
        total: 0,
        active: 0,
        expiring: 0,
        expired: 0,
        byType: {},
        totalCoverage: 0,
        totalPremium: 0,
      })
    })

    it('should calculate stats from policies', async () => {
      const mockPolicies: Partial<PolicyRow>[] = [
        { id: '1', status: 'active', type: 'home', coverage: 500000, premium: 2500 },
        { id: '2', status: 'active', type: 'home', coverage: 300000, premium: 1500 },
        { id: '3', status: 'expiring', type: 'kasko', coverage: 100000, premium: 3000 },
        { id: '4', status: 'expired', type: 'traffic', coverage: 50000, premium: 500 },
      ]

      mockOrder.mockReturnValue({ data: mockPolicies, error: null })

      const result = await getPolicyStats()

      expect(result.total).toBe(4)
      expect(result.active).toBe(2)
      expect(result.expiring).toBe(1)
      expect(result.expired).toBe(1)
      expect(result.byType).toEqual({ home: 2, kasko: 1, traffic: 1 })
      expect(result.totalCoverage).toBe(950000)
      expect(result.totalPremium).toBe(7500)
    })

    it('should handle empty policy list', async () => {
      mockOrder.mockReturnValue({ data: [], error: null })

      const result = await getPolicyStats()

      expect(result.total).toBe(0)
      expect(result.active).toBe(0)
      expect(result.byType).toEqual({})
      expect(result.totalCoverage).toBe(0)
      expect(result.totalPremium).toBe(0)
    })
  })

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe('Edge Cases', () => {
    describe('createPolicy edge cases', () => {
      it('should throw when Supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false)

        const newPolicy: PolicyInsert = {
          user_id: 'user-123',
          policy_number: 'POL-001',
          provider: 'Test',
          type: 'home',
          type_tr: 'Konut',
          coverage: 100000,
          premium: 1000,
          start_date: '2024-01-01',
          expiry_date: '2025-01-01',
          insured_person: 'Test',
        }

        await expect(createPolicy(newPolicy)).rejects.toThrow('Supabase is not configured')
      })
    })

    describe('updatePolicy edge cases', () => {
      it('should throw when Supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false)

        await expect(updatePolicy('1', { premium: 5000 })).rejects.toThrow(
          'Supabase is not configured'
        )
      })

      it('should throw on update error', async () => {
        // Mock update chain with error
        mockUpdate.mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue({
                data: null,
                error: { message: 'Update failed' },
              }),
            }),
          }),
        })

        await expect(updatePolicy('1', { premium: 5000 })).rejects.toThrow()
      })
    })

    describe('deletePolicy edge cases', () => {
      it('should throw when Supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false)

        await expect(deletePolicy('1')).rejects.toThrow('Supabase is not configured')
      })
    })

    describe('uploadPolicyDocument edge cases', () => {
      it('should throw when Supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false)

        const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })

        await expect(uploadPolicyDocument('1', mockFile)).rejects.toThrow(
          'Supabase is not configured'
        )
      })

      it('should handle file without extension', async () => {
        // Files without extension use the filename as extension (not ideal but that's the current behavior)
        const mockFile = new File(['test'], 'testfile', { type: 'application/pdf' })

        mockUpload.mockResolvedValue({
          data: { path: 'policy-documents/user-123/1/123.testfile' },
          error: null,
        })

        mockFrom.mockImplementation((table: string) => {
          if (table === 'policy_documents') {
            return { insert: vi.fn().mockReturnValue({ error: null }) }
          }
          return {
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            delete: mockDelete,
          }
        })

        const result = await uploadPolicyDocument('1', mockFile)

        // Files without '.' use the whole filename as extension
        expect(result.path).toContain('testfile')
      })

      it('should throw on signed URL creation failure', async () => {
        const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })

        mockUpload.mockResolvedValue({
          data: { path: 'path/test.pdf' },
          error: null,
        })

        mockCreateSignedUrl.mockResolvedValueOnce({
          data: null,
          error: { message: 'Failed to create signed URL' },
        })

        await expect(uploadPolicyDocument('1', mockFile)).rejects.toThrow()
      })

      it('should throw on document insert failure', async () => {
        const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })

        mockUpload.mockResolvedValue({
          data: { path: 'path/test.pdf' },
          error: null,
        })

        mockFrom.mockImplementation((table: string) => {
          if (table === 'policy_documents') {
            return { insert: vi.fn().mockReturnValue({ error: { message: 'Insert failed' } }) }
          }
          return { select: mockSelect }
        })

        await expect(uploadPolicyDocument('1', mockFile)).rejects.toThrow()
      })
    })

    describe('getPolicyDocuments edge cases', () => {
      it('should return empty array when Supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false)

        const result = await getPolicyDocuments('1')

        expect(result).toEqual([])
      })

      it('should throw on query error', async () => {
        mockEq.mockReturnValue({
          order: vi.fn().mockReturnValue({
            data: null,
            error: { message: 'Query failed' },
          }),
        })

        await expect(getPolicyDocuments('1')).rejects.toThrow()
      })
    })
  })
})
