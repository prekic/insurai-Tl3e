import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  isSupabaseConfigured,
  uploadPolicyDocument,
  getPolicyDocumentsWithUrls,
  deletePolicyDocument,
  getDocumentSignedUrl,
} from '@/lib/supabase'
import { useAuth } from '@/lib/supabase/auth-context'
import { sanitizeFileName } from '@/lib/sanitize'

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface UploadedDocument {
  id: string
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  uploadedAt: string
  signedUrl: string | null
}

export interface UseFileUploadOptions {
  onUploadComplete?: (doc: UploadedDocument) => void
  onUploadError?: (error: Error, fileName: string) => void
}

export interface UseFileUploadReturn {
  isUploading: boolean
  uploadProgress: UploadProgress | null
  uploadFile: (policyId: string, file: File) => Promise<UploadedDocument | null>
  documents: UploadedDocument[]
  isLoadingDocuments: boolean
  loadDocuments: (policyId: string) => Promise<void>
  deleteDocument: (documentId: string, filePath: string) => Promise<boolean>
  refreshSignedUrl: (filePath: string) => Promise<string | null>
  isConfigured: boolean
}

/**
 * Hook for managing file uploads to Supabase storage
 */
export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const { onUploadComplete, onUploadError } = options
  const { user, isConfigured: authConfigured } = useAuth()

  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [documents, setDocuments] = useState<UploadedDocument[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)

  const isConfigured = authConfigured && isSupabaseConfigured() && !!user

  /**
   * Upload a file to storage for a specific policy
   */
  const uploadFile = useCallback(
    async (policyId: string, file: File): Promise<UploadedDocument | null> => {
      if (!isConfigured) {
        const error = new Error('Storage is not configured. Please sign in to upload files.')
        onUploadError?.(error, file.name)
        toast.error('Upload failed', { description: error.message })
        return null
      }

      setIsUploading(true)
      setUploadProgress({ loaded: 0, total: file.size, percentage: 0 })

      try {
        // Simulate progress since Supabase doesn't provide real-time progress
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => {
            if (!prev) return null
            const newPercentage = Math.min(prev.percentage + 10, 90)
            return {
              ...prev,
              loaded: Math.floor((newPercentage / 100) * prev.total),
              percentage: newPercentage,
            }
          })
        }, 200)

        const result = await uploadPolicyDocument(policyId, file)

        clearInterval(progressInterval)
        setUploadProgress({ loaded: file.size, total: file.size, percentage: 100 })

        const uploadedDoc: UploadedDocument = {
          id: `doc-${Date.now()}`, // Temporary ID, will be replaced when documents are reloaded
          fileName: sanitizeFileName(file.name),
          filePath: result.path,
          fileSize: file.size,
          mimeType: file.type,
          uploadedAt: new Date().toISOString(),
          signedUrl: result.url,
        }

        // Add to local documents list
        setDocuments((prev) => [uploadedDoc, ...prev])

        onUploadComplete?.(uploadedDoc)
        toast.success('File uploaded', {
          description: `${sanitizeFileName(file.name)} has been uploaded successfully.`,
        })

        return uploadedDoc
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Upload failed')
        onUploadError?.(err, file.name)
        toast.error('Upload failed', {
          description: err.message,
        })
        return null
      } finally {
        setIsUploading(false)
        setUploadProgress(null)
      }
    },
    [isConfigured, onUploadComplete, onUploadError]
  )

  /**
   * Load all documents for a policy
   */
  const loadDocuments = useCallback(
    async (policyId: string): Promise<void> => {
      if (!isConfigured) {
        setDocuments([])
        return
      }

      setIsLoadingDocuments(true)

      try {
        const docs = await getPolicyDocumentsWithUrls(policyId)
        setDocuments(
          docs.map((doc) => ({
            id: doc.id,
            fileName: doc.file_name,
            filePath: doc.file_path,
            fileSize: doc.file_size,
            mimeType: doc.mime_type,
            uploadedAt: doc.uploaded_at,
            signedUrl: doc.signedUrl,
          }))
        )
      } catch (error) {
        console.error('Failed to load documents:', error)
        toast.error('Failed to load documents')
        setDocuments([])
      } finally {
        setIsLoadingDocuments(false)
      }
    },
    [isConfigured]
  )

  /**
   * Delete a document from storage
   */
  const deleteDocumentHandler = useCallback(
    async (documentId: string, filePath: string): Promise<boolean> => {
      if (!isConfigured) {
        toast.error('Not configured', { description: 'Please sign in to delete files.' })
        return false
      }

      try {
        await deletePolicyDocument(documentId, filePath)
        setDocuments((prev) => prev.filter((doc) => doc.id !== documentId))
        toast.success('Document deleted')
        return true
      } catch (error) {
        console.error('Failed to delete document:', error)
        toast.error('Failed to delete document')
        return false
      }
    },
    [isConfigured]
  )

  /**
   * Refresh a signed URL for a document (useful when URLs expire)
   */
  const refreshSignedUrl = useCallback(
    async (filePath: string): Promise<string | null> => {
      if (!isConfigured) return null

      try {
        const newUrl = await getDocumentSignedUrl(filePath)
        if (newUrl) {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.filePath === filePath ? { ...doc, signedUrl: newUrl } : doc
            )
          )
        }
        return newUrl
      } catch (error) {
        console.error('Failed to refresh signed URL:', error)
        return null
      }
    },
    [isConfigured]
  )

  return {
    isUploading,
    uploadProgress,
    uploadFile,
    documents,
    isLoadingDocuments,
    loadDocuments,
    deleteDocument: deleteDocumentHandler,
    refreshSignedUrl,
    isConfigured,
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Get file icon based on MIME type
 */
export function getFileIcon(mimeType: string): 'pdf' | 'image' | 'document' {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'document'
}
