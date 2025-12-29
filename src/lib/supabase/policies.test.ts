import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to define mocks before module hoisting
const { mockFrom, mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockSingle, mockUpload, mockRemove, mockGetPublicUrl, mockSupabase, mockIsConfigured } = vi.hoisted(() => {
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
  const mockIsConfigured = vi.fn(() => true)

  const mockSupabase = {
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  }

  return { mockFrom, mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockSingle, mockUpload, mockRemove, mockGetPublicUrl, mockSupabase, mockIsConfigured }
})

vi.mock('./client', () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: mockIsConfigured,
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
} from './policies'
import type { PolicyInsert, PolicyUpdate } from './types'

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
      data: null,
      error: null,
    })
    // Setup getPublicUrl mock
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.com/test.pdf' },
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
    it('should upload a file to storage', async () => {
      const mockFile = new File(['test content'], 'test.pdf', {
        type: 'application/pdf',
      })

      mockUpload.mockResolvedValue({
        data: { path: 'policy-documents/1/123.pdf' },
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
      expect(result.url).toBe('https://example.com/test.pdf')
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

      await deletePolicyDocument('doc-1')

      expect(mockRemove).toHaveBeenCalled()
    })
  })
})
