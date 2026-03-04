/**
 * PolicyDocuments Component Tests
 *
 * Tests for the policy documents component including document list,
 * upload functionality, delete confirmation, and loading states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PolicyDocuments, PolicyDocumentsInline } from './PolicyDocuments'
import type { UploadedDocument } from '@/hooks/useFileUpload'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      policyDocuments: {
        title: 'Documents',
        loading: 'Loading documents...',
        upload: 'Upload',
        uploading: 'Uploading...',
        uploadingProgress: 'Uploading... {percentage}%',
        openInNewTab: 'Open in new tab',
        refreshLink: 'Refresh download link',
        download: 'Download',
        confirmDelete: 'Click again to confirm',
        deleteDoc: 'Delete',
        noDocuments: 'No documents uploaded yet',
        clickUpload: 'Click Upload to add policy documents',
        documentCount: '{count} document',
        documentsCount: '{count} documents',
      },
    },
    locale: 'en',
    isLoading: false,
  }),
}))

// Mock data
const mockDocuments: UploadedDocument[] = [
  {
    id: 'doc-1',
    fileName: 'policy-document.pdf',
    fileSize: 1024 * 500, // 500 KB
    mimeType: 'application/pdf',
    filePath: 'policies/123/policy-document.pdf',
    uploadedAt: '2024-01-15T10:30:00Z',
    signedUrl: 'https://example.com/signed-url-1',
  },
  {
    id: 'doc-2',
    fileName: 'insurance-card.png',
    fileSize: 1024 * 200, // 200 KB
    mimeType: 'image/png',
    filePath: 'policies/123/insurance-card.png',
    uploadedAt: '2024-01-16T14:45:00Z',
    signedUrl: 'https://example.com/signed-url-2',
  },
  {
    id: 'doc-3',
    fileName: 'contract.docx',
    fileSize: 1024 * 1024, // 1 MB
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filePath: 'policies/123/contract.docx',
    uploadedAt: '2024-01-17T09:00:00Z',
    signedUrl: null,
  },
]

const mockUploadFile = vi.fn()
const mockLoadDocuments = vi.fn()
const mockDeleteDocument = vi.fn()
const mockRefreshSignedUrl = vi.fn()

// Mutable mock state
let mockState = {
  isUploading: false,
  uploadProgress: null as { percentage: number } | null,
  documents: mockDocuments,
  isLoadingDocuments: false,
  isConfigured: true,
}

vi.mock('@/hooks/useFileUpload', () => ({
  useFileUpload: () => ({
    isUploading: mockState.isUploading,
    uploadProgress: mockState.uploadProgress,
    uploadFile: mockUploadFile,
    documents: mockState.documents,
    isLoadingDocuments: mockState.isLoadingDocuments,
    loadDocuments: mockLoadDocuments,
    deleteDocument: mockDeleteDocument,
    refreshSignedUrl: mockRefreshSignedUrl,
    isConfigured: mockState.isConfigured,
  }),
  formatFileSize: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  },
  getFileIcon: (mimeType: string) => {
    if (mimeType.includes('pdf')) return 'pdf'
    if (mimeType.includes('image')) return 'image'
    return 'file'
  },
}))

vi.mock('@/lib/errors', () => ({
  FILE_CONSTRAINTS: {
    ALLOWED_EXTENSIONS: ['.pdf', '.png', '.jpg', '.jpeg'],
    MAX_SIZE_MB: 10,
  },
}))

describe('PolicyDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock state
    mockState = {
      isUploading: false,
      uploadProgress: null,
      documents: mockDocuments,
      isLoadingDocuments: false,
      isConfigured: true,
    }
  })

  describe('Rendering', () => {
    it('should render document list header', () => {
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText(/documents/i)).toBeInTheDocument()
    })

    it('should show document count in header', () => {
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText(/\(3\)/)).toBeInTheDocument()
    })

    it('should render Upload button when allowUpload is true', () => {
      render(<PolicyDocuments policyId="123" allowUpload={true} />)

      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
    })

    it('should not render Upload button when allowUpload is false', () => {
      render(<PolicyDocuments policyId="123" allowUpload={false} />)

      expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument()
    })

    it('should call loadDocuments on mount', () => {
      render(<PolicyDocuments policyId="123" />)

      expect(mockLoadDocuments).toHaveBeenCalledWith('123')
    })
  })

  describe('Document List', () => {
    it('should display all documents', () => {
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText('policy-document.pdf')).toBeInTheDocument()
      expect(screen.getByText('insurance-card.png')).toBeInTheDocument()
      expect(screen.getByText('contract.docx')).toBeInTheDocument()
    })

    it('should display file sizes', () => {
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText(/500 KB/)).toBeInTheDocument()
      expect(screen.getByText(/200 KB/)).toBeInTheDocument()
      expect(screen.getByText(/1\.0 MB/)).toBeInTheDocument()
    })
  })

  describe('Document Actions', () => {
    it('should show external link button when signedUrl is available', () => {
      render(<PolicyDocuments policyId="123" />)

      const links = screen.getAllByTitle('Open in new tab')
      expect(links.length).toBeGreaterThan(0)
    })

    it('should show download button when signedUrl is available', () => {
      render(<PolicyDocuments policyId="123" />)

      const downloadLinks = screen.getAllByTitle('Download')
      expect(downloadLinks.length).toBeGreaterThan(0)
    })

    it('should show refresh button when signedUrl is null', () => {
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByTitle('Refresh download link')).toBeInTheDocument()
    })

    it('should call refreshSignedUrl when refresh button is clicked', async () => {
      const user = userEvent.setup()
      render(<PolicyDocuments policyId="123" />)

      await user.click(screen.getByTitle('Refresh download link'))

      expect(mockRefreshSignedUrl).toHaveBeenCalledWith('policies/123/contract.docx')
    })

    it('should show delete button for each document', () => {
      render(<PolicyDocuments policyId="123" />)

      const deleteButtons = screen.getAllByTitle('Delete')
      expect(deleteButtons).toHaveLength(3)
    })
  })

  describe('Delete Confirmation', () => {
    it('should show confirmation state on first delete click', async () => {
      const user = userEvent.setup()
      render(<PolicyDocuments policyId="123" />)

      const deleteButtons = screen.getAllByTitle('Delete')
      await user.click(deleteButtons[0])

      expect(screen.getByTitle('Click again to confirm')).toBeInTheDocument()
    })

    it('should delete document on second click', async () => {
      const user = userEvent.setup()
      render(<PolicyDocuments policyId="123" />)

      const deleteButton = screen.getAllByTitle('Delete')[0]
      await user.click(deleteButton)

      // Second click on confirmation
      const confirmButton = screen.getByTitle('Click again to confirm')
      await user.click(confirmButton)

      expect(mockDeleteDocument).toHaveBeenCalledWith('doc-1', 'policies/123/policy-document.pdf')
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no documents', () => {
      mockState.documents = []
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText('No documents uploaded yet')).toBeInTheDocument()
    })

    it('should show upload hint in empty state when allowUpload is true', () => {
      mockState.documents = []
      render(<PolicyDocuments policyId="123" allowUpload={true} />)

      expect(screen.getByText(/click upload/i)).toBeInTheDocument()
    })

    it('should hide component when showEmpty is false and no documents and no upload', () => {
      mockState.documents = []
      const { container } = render(
        <PolicyDocuments policyId="123" showEmpty={false} allowUpload={false} />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Loading State', () => {
    it('should show loading state when loading documents', () => {
      mockState.isLoadingDocuments = true
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText('Loading documents...')).toBeInTheDocument()
    })
  })

  describe('Upload Progress', () => {
    it('should show upload progress when uploading', () => {
      mockState.isUploading = true
      mockState.uploadProgress = { percentage: 45 }
      render(<PolicyDocuments policyId="123" />)

      expect(screen.getByText(/uploading.*45%/i)).toBeInTheDocument()
    })

    it('should disable upload button while uploading', () => {
      mockState.isUploading = true
      mockState.uploadProgress = { percentage: 50 }
      render(<PolicyDocuments policyId="123" />)

      const uploadButton = screen.getByRole('button', { name: /uploading/i })
      expect(uploadButton).toBeDisabled()
    })
  })

  describe('Not Configured', () => {
    it('should return null when not configured', () => {
      mockState.isConfigured = false
      const { container } = render(<PolicyDocuments policyId="123" />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('File Upload', () => {
    it('should have hidden file input', () => {
      render(<PolicyDocuments policyId="123" />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeInTheDocument()
      expect(fileInput.classList.contains('hidden')).toBe(true)
    })

    it('should accept multiple files', () => {
      render(<PolicyDocuments policyId="123" />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput?.multiple).toBe(true)
    })

    it('should accept correct file types', () => {
      render(<PolicyDocuments policyId="123" />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput?.accept).toContain('.pdf')
    })
  })

  describe('File Icons', () => {
    it('should show PDF icon for PDF files', () => {
      render(<PolicyDocuments policyId="123" />)

      // PDF icon should be present (red-500 color indicates PDF)
      const pdfIcons = document.querySelectorAll('.text-red-500')
      expect(pdfIcons.length).toBeGreaterThan(0)
    })

    it('should show image icon for image files', () => {
      render(<PolicyDocuments policyId="123" />)

      // Image icon should be present (blue-500 color indicates image)
      const imageIcons = document.querySelectorAll('.text-blue-500')
      expect(imageIcons.length).toBeGreaterThan(0)
    })
  })
})

describe('PolicyDocumentsInline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState = {
      isUploading: false,
      uploadProgress: null,
      documents: mockDocuments,
      isLoadingDocuments: false,
      isConfigured: true,
    }
  })

  it('should render document count', () => {
    render(<PolicyDocumentsInline policyId="123" />)

    expect(screen.getByText('3 documents')).toBeInTheDocument()
  })

  it('should use singular form for one document', () => {
    mockState.documents = [mockDocuments[0]]
    render(<PolicyDocumentsInline policyId="123" />)

    expect(screen.getByText('1 document')).toBeInTheDocument()
  })

  it('should return null when not configured', () => {
    mockState.isConfigured = false
    const { container } = render(<PolicyDocumentsInline policyId="123" />)

    expect(container.firstChild).toBeNull()
  })

  it('should return null when loading', () => {
    mockState.isLoadingDocuments = true
    const { container } = render(<PolicyDocumentsInline policyId="123" />)

    expect(container.firstChild).toBeNull()
  })

  it('should return null when no documents', () => {
    mockState.documents = []
    const { container } = render(<PolicyDocumentsInline policyId="123" />)

    expect(container.firstChild).toBeNull()
  })

  it('should call loadDocuments on mount', () => {
    render(<PolicyDocumentsInline policyId="123" />)

    expect(mockLoadDocuments).toHaveBeenCalledWith('123')
  })
})
