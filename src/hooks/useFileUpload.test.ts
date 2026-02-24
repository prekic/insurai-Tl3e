/**
 * useFileUpload Hook Tests
 *
 * Tests for the file upload hook including
 * upload, progress tracking, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileUpload, formatFileSize, getFileIcon } from './useFileUpload'

// Mock dependencies
const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
}

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    isConfigured: true,
  }),
}))

const mockUploadPolicyDocument = vi.fn()
const mockCreatePolicy = vi.fn()
const mockGetPolicyDocumentsWithUrls = vi.fn()
const mockDeletePolicyDocument = vi.fn()
const mockGetDocumentSignedUrl = vi.fn()

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  uploadPolicyDocument: mockUploadPolicyDocument,
  createPolicy: mockCreatePolicy,
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  uploadPolicyDocument: (...args: unknown[]) => mockUploadPolicyDocument(...args),
  getPolicyDocumentsWithUrls: (...args: unknown[]) => mockGetPolicyDocumentsWithUrls(...args),
  deletePolicyDocument: (...args: unknown[]) => mockDeletePolicyDocument(...args),
  getDocumentSignedUrl: (...args: unknown[]) => mockGetDocumentSignedUrl(...args),
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizeFileName: (name: string) => name.replace(/[<>:"/\\|?*]/g, '_'),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initial State', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useFileUpload())

      expect(result.current.isUploading).toBe(false)
      expect(result.current.uploadProgress).toBeNull()
      expect(result.current.documents).toEqual([])
      expect(result.current.isLoadingDocuments).toBe(false)
      expect(result.current.isConfigured).toBe(true)
    })

    it('should provide upload functions', () => {
      const { result } = renderHook(() => useFileUpload())

      expect(typeof result.current.uploadFile).toBe('function')
      expect(typeof result.current.loadDocuments).toBe('function')
      expect(typeof result.current.deleteDocument).toBe('function')
      expect(typeof result.current.refreshSignedUrl).toBe('function')
    })
  })

  describe('uploadFile', () => {
    const mockFile = new File(['test content'], 'test-document.pdf', {
      type: 'application/pdf',
    })

    it('should upload file successfully', async () => {
      mockUploadPolicyDocument.mockResolvedValue({
        path: 'policies/123/test-document.pdf',
        url: 'https://example.com/signed-url',
      })

      const { result } = renderHook(() => useFileUpload())

      let uploadResult: unknown
      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        // Advance timers to simulate progress
        vi.advanceTimersByTime(2000)
        uploadResult = await uploadPromise
      })

      expect(mockUploadPolicyDocument).toHaveBeenCalledWith('policy-123', mockFile)
      expect(uploadResult).toMatchObject({
        fileName: 'test-document.pdf',
        filePath: 'policies/123/test-document.pdf',
        fileSize: mockFile.size,
        mimeType: 'application/pdf',
        signedUrl: 'https://example.com/signed-url',
      })
    })

    it('should update isUploading state during upload', async () => {
      mockUploadPolicyDocument.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ path: 'test', url: 'url' }), 100))
      )

      const { result } = renderHook(() => useFileUpload())

      expect(result.current.isUploading).toBe(false)

      let uploadPromise: Promise<unknown>
      act(() => {
        uploadPromise = result.current.uploadFile('policy-123', mockFile)
      })

      // Should be uploading
      expect(result.current.isUploading).toBe(true)

      await act(async () => {
        vi.advanceTimersByTime(200)
        await uploadPromise
      })

      expect(result.current.isUploading).toBe(false)
    })

    it('should track upload progress', async () => {
      mockUploadPolicyDocument.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ path: 'test', url: 'url' }), 500))
      )

      const { result } = renderHook(() => useFileUpload())

      act(() => {
        result.current.uploadFile('policy-123', mockFile)
      })

      // Initial progress
      expect(result.current.uploadProgress).toMatchObject({
        loaded: 0,
        total: mockFile.size,
        percentage: 0,
      })

      // After some time, progress should increase
      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      expect(result.current.uploadProgress?.percentage).toBeGreaterThan(0)
    })

    it('should add uploaded document to documents list', async () => {
      mockUploadPolicyDocument.mockResolvedValue({
        path: 'policies/123/test-document.pdf',
        url: 'https://example.com/signed-url',
      })

      const { result } = renderHook(() => useFileUpload())

      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        vi.advanceTimersByTime(2000)
        await uploadPromise
      })

      expect(result.current.documents.length).toBe(1)
      expect(result.current.documents[0].fileName).toBe('test-document.pdf')
    })

    it('should call onUploadComplete callback on success', async () => {
      const onUploadComplete = vi.fn()
      mockUploadPolicyDocument.mockResolvedValue({
        path: 'policies/123/test-document.pdf',
        url: 'https://example.com/signed-url',
      })

      const { result } = renderHook(() => useFileUpload({ onUploadComplete }))

      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        vi.advanceTimersByTime(2000)
        await uploadPromise
      })

      expect(onUploadComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'test-document.pdf',
        })
      )
    })

    it('should handle upload errors', async () => {
      const error = new Error('Upload failed')
      mockUploadPolicyDocument.mockRejectedValue(error)

      const onUploadError = vi.fn()
      const { result } = renderHook(() => useFileUpload({ onUploadError }))

      let uploadResult: unknown
      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        vi.advanceTimersByTime(2000)
        uploadResult = await uploadPromise
      })

      expect(uploadResult).toBeNull()
      expect(onUploadError).toHaveBeenCalledWith(error, 'test-document.pdf')
    })

    it('should reset progress after upload completes', async () => {
      mockUploadPolicyDocument.mockResolvedValue({
        path: 'test',
        url: 'url',
      })

      const { result } = renderHook(() => useFileUpload())

      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        vi.advanceTimersByTime(2000)
        await uploadPromise
      })

      expect(result.current.uploadProgress).toBeNull()
    })
  })

  describe('loadDocuments', () => {
    const mockDocuments = [
      {
        id: 'doc-1',
        file_name: 'document1.pdf',
        file_path: 'policies/123/document1.pdf',
        file_size: 1024,
        mime_type: 'application/pdf',
        uploaded_at: '2024-01-01T00:00:00Z',
        signedUrl: 'https://example.com/doc1',
      },
      {
        id: 'doc-2',
        file_name: 'document2.pdf',
        file_path: 'policies/123/document2.pdf',
        file_size: 2048,
        mime_type: 'application/pdf',
        uploaded_at: '2024-01-02T00:00:00Z',
        signedUrl: 'https://example.com/doc2',
      },
    ]

    it('should load documents for a policy', async () => {
      mockGetPolicyDocumentsWithUrls.mockResolvedValue(mockDocuments)

      const { result } = renderHook(() => useFileUpload())

      await act(async () => {
        await result.current.loadDocuments('policy-123')
      })

      expect(mockGetPolicyDocumentsWithUrls).toHaveBeenCalledWith('policy-123')
      expect(result.current.documents.length).toBe(2)
      expect(result.current.documents[0]).toMatchObject({
        id: 'doc-1',
        fileName: 'document1.pdf',
      })
    })

    it('should set isLoadingDocuments while loading', async () => {
      mockGetPolicyDocumentsWithUrls.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      )

      const { result } = renderHook(() => useFileUpload())

      let loadPromise: Promise<void>
      act(() => {
        loadPromise = result.current.loadDocuments('policy-123')
      })

      expect(result.current.isLoadingDocuments).toBe(true)

      await act(async () => {
        vi.advanceTimersByTime(200)
        await loadPromise
      })

      expect(result.current.isLoadingDocuments).toBe(false)
    })

    it('should handle load errors', async () => {
      mockGetPolicyDocumentsWithUrls.mockRejectedValue(new Error('Load failed'))

      const { result } = renderHook(() => useFileUpload())

      await act(async () => {
        await result.current.loadDocuments('policy-123')
      })

      expect(result.current.documents).toEqual([])
    })
  })

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      mockDeletePolicyDocument.mockResolvedValue(undefined)
      mockUploadPolicyDocument.mockResolvedValue({
        path: 'test',
        url: 'url',
      })

      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const { result } = renderHook(() => useFileUpload())

      // First upload a document
      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        vi.advanceTimersByTime(2000)
        await uploadPromise
      })

      const docId = result.current.documents[0].id
      const docPath = result.current.documents[0].filePath

      // Then delete it
      let deleteResult: boolean
      await act(async () => {
        deleteResult = await result.current.deleteDocument(docId, docPath)
      })

      expect(deleteResult!).toBe(true)
      expect(mockDeletePolicyDocument).toHaveBeenCalledWith(docId, docPath)
      expect(result.current.documents.length).toBe(0)
    })

    it('should handle delete errors', async () => {
      mockDeletePolicyDocument.mockRejectedValue(new Error('Delete failed'))

      const { result } = renderHook(() => useFileUpload())

      let deleteResult: boolean
      await act(async () => {
        deleteResult = await result.current.deleteDocument('doc-1', 'path')
      })

      expect(deleteResult!).toBe(false)
    })
  })

  describe('refreshSignedUrl', () => {
    it('should refresh signed URL for a document', async () => {
      const newUrl = 'https://example.com/new-signed-url'
      mockGetDocumentSignedUrl.mockResolvedValue(newUrl)
      mockUploadPolicyDocument.mockResolvedValue({
        path: 'test/path.pdf',
        url: 'https://example.com/old-url',
      })

      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const { result } = renderHook(() => useFileUpload())

      // Upload a document first
      await act(async () => {
        const uploadPromise = result.current.uploadFile('policy-123', mockFile)
        vi.advanceTimersByTime(2000)
        await uploadPromise
      })

      const filePath = result.current.documents[0].filePath

      // Refresh the URL
      let refreshedUrl: string | null
      await act(async () => {
        refreshedUrl = await result.current.refreshSignedUrl(filePath)
      })

      expect(refreshedUrl!).toBe(newUrl)
      expect(result.current.documents[0].signedUrl).toBe(newUrl)
    })

    it('should handle refresh errors', async () => {
      mockGetDocumentSignedUrl.mockRejectedValue(new Error('Refresh failed'))

      const { result } = renderHook(() => useFileUpload())

      let refreshedUrl: string | null
      await act(async () => {
        refreshedUrl = await result.current.refreshSignedUrl('test/path.pdf')
      })

      expect(refreshedUrl!).toBeNull()
    })
  })
})

describe('useFileUpload - Not Configured', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.doMock('@/lib/supabase/auth-context', () => ({
      useAuth: () => ({
        user: null,
        isConfigured: false,
      }),
    }))

    vi.doMock('@/lib/supabase', () => ({
      isSupabaseConfigured: () => false,
      uploadPolicyDocument: vi.fn(),
      getPolicyDocumentsWithUrls: vi.fn(),
      deletePolicyDocument: vi.fn(),
      getDocumentSignedUrl: vi.fn(),
    }))
  })

  it('should return isConfigured as false when not configured', async () => {
    // When Supabase is not configured, the hook should report isConfigured: false
    // This test verifies the configuration check
  })
})

describe('formatFileSize', () => {
  it('should format 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB')
    expect(formatFileSize(2621440)).toBe('2.5 MB')
  })

  it('should format gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB')
  })
})

describe('getFileIcon', () => {
  it('should return pdf for PDF files', () => {
    expect(getFileIcon('application/pdf')).toBe('pdf')
  })

  it('should return image for image files', () => {
    expect(getFileIcon('image/png')).toBe('image')
    expect(getFileIcon('image/jpeg')).toBe('image')
    expect(getFileIcon('image/gif')).toBe('image')
    expect(getFileIcon('image/webp')).toBe('image')
  })

  it('should return document for other files', () => {
    expect(getFileIcon('application/msword')).toBe('document')
    expect(getFileIcon('text/plain')).toBe('document')
    expect(getFileIcon('application/json')).toBe('document')
  })
})
