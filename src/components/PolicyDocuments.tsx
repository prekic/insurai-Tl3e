import { useEffect, useState, useRef } from 'react'
import {
  FileText,
  Image,
  File,
  Download,
  Trash2,
  Upload,
  RefreshCw,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Button } from './ui/button'
import { useFileUpload, formatFileSize, getFileIcon, type UploadedDocument } from '@/hooks/useFileUpload'
import { FILE_CONSTRAINTS } from '@/lib/errors'

interface PolicyDocumentsProps {
  policyId: string
  className?: string
  allowUpload?: boolean
  showEmpty?: boolean
}

export function PolicyDocuments({
  policyId,
  className = '',
  allowUpload = true,
  showEmpty = true,
}: PolicyDocumentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const {
    isUploading,
    uploadProgress,
    uploadFile,
    documents,
    isLoadingDocuments,
    loadDocuments,
    deleteDocument,
    refreshSignedUrl,
    isConfigured,
  } = useFileUpload()

  // Load documents when component mounts or policyId changes
  useEffect(() => {
    if (policyId && isConfigured) {
      loadDocuments(policyId)
    }
  }, [policyId, isConfigured, loadDocuments])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Upload files sequentially
    for (const file of files) {
      await uploadFile(policyId, file)
    }

    // Reset input
    e.target.value = ''
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDelete = async (doc: UploadedDocument) => {
    if (confirmDelete === doc.id) {
      await deleteDocument(doc.id, doc.filePath)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(doc.id)
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  const handleRefreshUrl = async (doc: UploadedDocument) => {
    await refreshSignedUrl(doc.filePath)
  }

  const getIcon = (mimeType: string) => {
    const iconType = getFileIcon(mimeType)
    switch (iconType) {
      case 'pdf':
        return <FileText className="text-red-500" size={20} />
      case 'image':
        return <Image className="text-blue-500" size={20} />
      default:
        return <File className="text-gray-500" size={20} />
    }
  }

  if (!isConfigured) {
    return null // Don't show anything if storage isn't configured
  }

  if (isLoadingDocuments) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <Loader2 size={20} className="animate-spin" />
          <span>Loading documents...</span>
        </div>
      </div>
    )
  }

  if (documents.length === 0 && !showEmpty && !allowUpload) {
    return null
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-gray-500" />
          <h3 className="font-semibold text-gray-900">
            Documents {documents.length > 0 && `(${documents.length})`}
          </h3>
        </div>
        {allowUpload && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={14} className="mr-2" />
                  Upload
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Upload Progress */}
      {isUploading && uploadProgress && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Loader2 size={14} className="animate-spin" />
            <span>Uploading... {uploadProgress.percentage}%</span>
          </div>
          <div className="mt-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${uploadProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Document List */}
      {documents.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => {
                // Open document in new tab when clicking anywhere on the row
                if (doc.signedUrl) {
                  window.open(doc.signedUrl, '_blank', 'noopener,noreferrer')
                } else {
                  handleRefreshUrl(doc)
                }
              }}
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                {getIcon(doc.mimeType)}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                  {doc.fileName}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(doc.fileSize)} • {new Date(doc.uploadedAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions - stop propagation to prevent row click */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {doc.signedUrl ? (
                  <a
                    href={doc.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={16} />
                  </a>
                ) : (
                  <button
                    onClick={() => handleRefreshUrl(doc)}
                    className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    title="Refresh download link"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}

                {doc.signedUrl && (
                  <a
                    href={doc.signedUrl}
                    download={doc.fileName}
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download size={16} />
                  </a>
                )}

                <button
                  onClick={() => handleDelete(doc)}
                  className={`p-2 rounded-lg transition-colors ${
                    confirmDelete === doc.id
                      ? 'text-red-600 bg-red-100'
                      : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                  }`}
                  title={confirmDelete === doc.id ? 'Click again to confirm' : 'Delete'}
                >
                  {confirmDelete === doc.id ? (
                    <AlertCircle size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500 text-sm">No documents uploaded yet</p>
          {allowUpload && (
            <p className="text-gray-400 text-xs mt-1">
              Click Upload to add policy documents
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for inline use
 */
export function PolicyDocumentsInline({
  policyId,
  className = '',
}: {
  policyId: string
  className?: string
}) {
  const { documents, isLoadingDocuments, loadDocuments, isConfigured } = useFileUpload()

  useEffect(() => {
    if (policyId && isConfigured) {
      loadDocuments(policyId)
    }
  }, [policyId, isConfigured, loadDocuments])

  if (!isConfigured || isLoadingDocuments) {
    return null
  }

  if (documents.length === 0) {
    return null
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FileText size={14} className="text-gray-400" />
      <span className="text-sm text-gray-500">
        {documents.length} document{documents.length !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
