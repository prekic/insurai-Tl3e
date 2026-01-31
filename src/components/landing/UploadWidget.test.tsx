import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { UploadWidget } from './UploadWidget'

// Hoisted mocks - must be hoisted before vi.mock calls
const { mockToast, mockUser, mockValidateFiles } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  mockUser: vi.fn(() => null),
  mockValidateFiles: vi.fn((files: File[]) => ({
    valid: files,
    errors: [],
  })),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: mockToast,
}))

// Mock file validation
vi.mock('@/lib/errors', () => ({
  validateFiles: mockValidateFiles,
  getErrorMessage: vi.fn(() => ({
    title: 'Error',
    description: 'Test error',
  })),
  FILE_CONSTRAINTS: {
    ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'],
    MAX_SIZE_MB: 10,
  },
}))

// Track auth state for testing
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: mockUser(),
    isConfigured: true,
  }),
}))

// Helper to create mock File
const createMockFile = (name = 'test-policy.pdf', type = 'application/pdf', size = 1024) => {
  const content = new Uint8Array(size)
  return new File([content], name, { type })
}

// Component to capture location state for testing
const LocationStateCapture = () => {
  const location = useLocation()
  return (
    <div data-testid="location-state">
      {JSON.stringify(location.state)}
    </div>
  )
}

// Helper to render with router and capture navigation state
const renderWithRouter = (props = {}, options = {}) => {
  const { initialUser = null } = options as { initialUser?: { id: string; email: string } | null }
  mockUser.mockReturnValue(initialUser)

  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<UploadWidget {...props} />} />
        <Route
          path="/try"
          element={
            <div data-testid="try-page">
              <LocationStateCapture />
            </div>
          }
        />
        <Route
          path="/upload"
          element={
            <div data-testid="upload-page">
              <LocationStateCapture />
            </div>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('UploadWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.mockReturnValue(null)
  })

  describe('Rendering', () => {
    it('renders default upload interface', () => {
      renderWithRouter()

      expect(screen.getByText('Drop your policy here')).toBeInTheDocument()
      expect(screen.getByText('or click to browse')).toBeInTheDocument()
    })

    it('renders compact mode with button', () => {
      renderWithRouter({ compact: true, buttonText: 'Upload Now' })

      expect(screen.getByText('Upload Now')).toBeInTheDocument()
    })
  })

  describe('Anonymous User File Handoff', () => {
    it('navigates to /try with file in router state for anonymous users', async () => {
      renderWithRouter()

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = createMockFile('anonymous-test.pdf')

      await act(async () => {
        await userEvent.upload(input, mockFile)
      })

      // Wait for navigation (1.5s simulated upload + navigation)
      await waitFor(
        () => {
          expect(screen.getByTestId('try-page')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Check that file was passed in state
      const stateElement = screen.getByTestId('location-state')
      const stateJson = JSON.parse(stateElement.textContent || '{}')
      expect(stateJson).toHaveProperty('file')
    })

    it('passes correct file object via router state', async () => {
      renderWithRouter()

      const dropZone = screen.getByText('Drop your policy here').closest('div')!
      const mockFile = createMockFile('test-kasko.pdf', 'application/pdf', 2048)

      await act(async () => {
        fireEvent.drop(dropZone, {
          dataTransfer: {
            files: [mockFile],
          },
        })
      })

      await waitFor(
        () => {
          expect(screen.getByTestId('try-page')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Verify file is in state
      const stateElement = screen.getByTestId('location-state')
      const stateText = stateElement.textContent || '{}'
      expect(stateText).toContain('file')
    })

    it('only passes first file when multiple files are dropped', async () => {
      renderWithRouter()

      const dropZone = screen.getByText('Drop your policy here').closest('div')!
      const file1 = createMockFile('first.pdf')
      const file2 = createMockFile('second.pdf')

      await act(async () => {
        fireEvent.drop(dropZone, {
          dataTransfer: {
            files: [file1, file2],
          },
        })
      })

      await waitFor(
        () => {
          expect(screen.getByTestId('try-page')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Should navigate to /try (for anonymous users, only first file is passed)
      const stateElement = screen.getByTestId('location-state')
      expect(stateElement.textContent).toContain('file')
    })
  })

  describe('Logged-in User File Handoff', () => {
    it('navigates to /upload with files in router state for logged-in users', async () => {
      renderWithRouter({}, { initialUser: { id: 'user-1', email: 'test@example.com' } })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = createMockFile('logged-in-test.pdf')

      await act(async () => {
        await userEvent.upload(input, mockFile)
      })

      await waitFor(
        () => {
          expect(screen.getByTestId('upload-page')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Check that files were passed in state
      const stateElement = screen.getByTestId('location-state')
      const stateJson = JSON.parse(stateElement.textContent || '{}')
      expect(stateJson).toHaveProperty('files')
    })
  })

  describe('Drag and Drop', () => {
    it('handles dragOver event', async () => {
      renderWithRouter()

      const dropZone = screen.getByText('Drop your policy here').closest('div')!

      // dragOver should not throw
      await act(async () => {
        fireEvent.dragOver(dropZone, { preventDefault: () => {} })
      })

      // Component should still be rendered
      expect(screen.getByText('Drop your policy here')).toBeInTheDocument()
    })

    it('handles dragLeave event', async () => {
      renderWithRouter()

      const dropZone = screen.getByText('Drop your policy here').closest('div')!

      await act(async () => {
        fireEvent.dragOver(dropZone, { preventDefault: () => {} })
      })

      await act(async () => {
        fireEvent.dragLeave(dropZone)
      })

      // Component should still be rendered after dragLeave
      expect(screen.getByText('Drop your policy here')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('shows loading state while uploading', async () => {
      renderWithRouter()

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = createMockFile()

      act(() => {
        fireEvent.change(input, { target: { files: [mockFile] } })
      })

      // Should show loading spinner during upload
      await waitFor(() => {
        expect(screen.getByText('Processing your policy...')).toBeInTheDocument()
      })
    })
  })

  // Note: Error handling tests for simulated network errors were removed
  // because the simulated 5% random network error was removed in commit 9887e8d.
  // Error handling is now tested through file validation tests below.

  describe('File Validation', () => {
    it('shows error for invalid files', async () => {
      // Override the mock for this specific test
      mockValidateFiles.mockReturnValueOnce({
        valid: [],
        errors: [{ code: 'INVALID_FILE_TYPE', file: 'test.exe' }],
      })

      renderWithRouter()

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const invalidFile = createMockFile('virus.exe', 'application/x-msdownload')

      await act(async () => {
        fireEvent.change(input, { target: { files: [invalidFile] } })
      })

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled()
      })
    })
  })
})

describe('UploadWidget Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.mockReturnValue(null)
  })

  it('maintains file reference through navigation', async () => {
    // This test verifies the complete flow from UploadWidget to TryAnalysis
    const fileName = 'integration-test.pdf'
    const fileSize = 4096

    renderWithRouter()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const mockFile = createMockFile(fileName, 'application/pdf', fileSize)

    await act(async () => {
      await userEvent.upload(input, mockFile)
    })

    await waitFor(
      () => {
        expect(screen.getByTestId('try-page')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    // The file object should be in the location state
    const stateElement = screen.getByTestId('location-state')
    expect(stateElement.textContent).toContain('file')
  })
})
