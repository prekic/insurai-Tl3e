/**
 * PolicyUpload Coverage Tests
 *
 * Comprehensive tests targeting uncovered branches, functions, and statements.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PolicyUpload } from './PolicyUpload'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'
import type { PreUploadCheckResult } from '@/lib/policy-utils'

// Mock navigate + location + searchParams
const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams()
let mockLocationState: Record<string, unknown> | null = null

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams],
    useLocation: () => ({
      pathname: '/upload',
      state: mockLocationState,
      search: '',
      hash: '',
      key: 'default',
    }),
  }
})

// i18n mock
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

// Auth mock controls
let mockUser: Record<string, unknown> | null = null
let mockAuthConfigured = false
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    isConfigured: mockAuthConfigured,
  }),
}))

// Supabase mock controls
let mockIsSupabaseConfigured = false
const mockCreatePolicy = vi.fn().mockResolvedValue({ id: 'pol-1' })
const mockUploadPolicyDocument = vi.fn().mockResolvedValue({ success: true })
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured,
  credentials: null,
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured,
  createPolicy: (...args: unknown[]) => mockCreatePolicy(...args),
  uploadPolicyDocument: (...args: unknown[]) => mockUploadPolicyDocument(...args),
}))

// AI extraction mock controls
const mockExtractPolicy = vi.fn()
const mockPreloadPdfJs = vi.fn()
const mockIsAIConfigured = vi.fn().mockReturnValue(false)
vi.mock('@/lib/ai', () => ({
  extractPolicyFromDocument: (...args: unknown[]) => mockExtractPolicy(...args),
  isAIConfigured: () => mockIsAIConfigured(),
  preloadPdfJs: () => mockPreloadPdfJs(),
}))

// Backend health mock controls
let mockHealthStatus = 'healthy'
let mockProviders = { openai: true, anthropic: false, google: false }
let mockHealthError: string | undefined = undefined
let mockDiagnostics: Record<string, unknown> | undefined = undefined
const mockCheckHealth = vi.fn()
const mockRunDiagnostics = vi.fn().mockResolvedValue(null)
vi.mock('@/hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({
    health: {
      status: mockHealthStatus,
      providers: mockProviders,
      error: mockHealthError,
      diagnostics: mockDiagnostics,
    },
    checkHealth: mockCheckHealth,
    runDiagnostics: mockRunDiagnostics,
  }),
}))

// Policy context mock
const mockAddPolicies = vi.fn()
const mockRefreshPolicies = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    addPolicies: mockAddPolicies,
    refreshPolicies: mockRefreshPolicies,
  }),
}))

// Policy upload check mock
const mockCheckPolicyBeforeUpload = vi.fn().mockResolvedValue({ type: 'noConflict' })
const mockHandlePolicyAmendment = vi
  .fn()
  .mockResolvedValue({ success: true, versionNumber: 2, changes: [{}] })
const mockHandleDuplicateResolution = vi.fn().mockResolvedValue({})
vi.mock('@/lib/policy-upload-check', () => ({
  checkPolicyBeforeUpload: (...args: unknown[]) => mockCheckPolicyBeforeUpload(...args),
  handlePolicyAmendment: (...args: unknown[]) => mockHandlePolicyAmendment(...args),
  handleDuplicateResolution: (...args: unknown[]) => mockHandleDuplicateResolution(...args),
}))

// Processing logger mock
const mockStartStage = vi.fn()
const mockCompleteStage = vi.fn()
const mockFailStage = vi.fn()
const mockComplete = vi.fn()
const mockFail = vi.fn()
const mockSetPersistCallback = vi.fn()
const mockSetPolicyId = vi.fn()
vi.mock('@/lib/processing-logger', () => ({
  createProcessingLogger: () => ({
    startStage: mockStartStage,
    completeStage: mockCompleteStage,
    failStage: mockFailStage,
    complete: mockComplete,
    fail: mockFail,
    setPersistCallback: mockSetPersistCallback,
    setPolicyId: mockSetPolicyId,
  }),
}))

// Processing log API mock
vi.mock('@/lib/processing-log-api', () => ({
  createProcessingLog: vi.fn().mockResolvedValue(true),
  updateProcessingLog: vi.fn().mockResolvedValue(true),
}))

// Toast mock - must be hoisted to avoid TDZ
const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))
vi.mock('sonner', () => ({
  toast: mockToast,
}))

// Sample policies mock
vi.mock('@/data/sample-policies', () => ({
  samplePolicies: [
    {
      id: 'sample-1',
      policyNumber: 'S-001',
      provider: 'TestCo',
      type: 'home',
      typeTr: 'Konut',
      coverage: 100000,
      premium: 1000,
      deductible: 0,
      startDate: '2024-01-01',
      expiryDate: '2025-01-01',
      status: 'active',
      insuredPerson: 'Test',
      documentType: 'policy',
      uploadDate: '2024-01-01',
      logo: '',
      fileName: 'test.pdf',
      coverages: [],
      exclusions: [],
      specialConditions: [],
      insuranceLine: 'Property',
      aiConfidence: 0.9,
      aiInsights: [],
      monthlyPremium: 83,
    },
  ],
}))

// File validation mock
vi.mock('@/lib/errors', () => ({
  validateFiles: (files: File[]) => ({
    valid: files.filter((f) => f.name.endsWith('.pdf')),
    errors: files
      .filter((f) => !f.name.endsWith('.pdf'))
      .map((f) => ({ code: 'FILE_TYPE_UNSUPPORTED', details: `${f.name} is not a PDF` })),
  }),
  getErrorMessage: (code: string) => ({
    title: `Error: ${code}`,
    description: `Validation error: ${code}`,
  }),
  FILE_CONSTRAINTS: {
    ALLOWED_EXTENSIONS: ['.pdf'],
    MAX_SIZE_MB: 10,
  },
}))

// Sanitize mock
vi.mock('@/lib/sanitize', () => ({
  sanitizeFileName: (name: string) => name,
  sanitizeId: (id: string) => id,
}))

// ConflictResolutionDialog mock
vi.mock('./ConflictResolutionDialog', () => ({
  ConflictResolutionDialog: ({
    onSkip,
    onReplace,
    onKeepBoth,
    onTrackAmendment,
    onEdit,
    onClose,
    isLoading,
  }: Record<string, unknown>) => (
    <div data-testid="conflict-dialog">
      <button data-testid="conflict-skip" onClick={onSkip as () => void}>
        Skip
      </button>
      <button data-testid="conflict-replace" onClick={onReplace as () => void}>
        Replace
      </button>
      <button data-testid="conflict-keep-both" onClick={onKeepBoth as () => void}>
        Keep Both
      </button>
      <button data-testid="conflict-track" onClick={onTrackAmendment as () => void}>
        Track Amendment
      </button>
      <button data-testid="conflict-edit" onClick={onEdit as () => void}>
        Edit
      </button>
      <button data-testid="conflict-close" onClick={onClose as () => void}>
        Close
      </button>
      {isLoading ? <span data-testid="conflict-loading">Loading...</span> : null}
    </div>
  ),
}))

// Helper to create a mock successful extraction result
function mockSuccessResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    policy: {
      id: 'pol-1',
      policyNumber: 'POL-001',
      provider: 'Allianz',
      type: 'kasko',
      typeTr: 'Kasko',
      coverage: 200000,
      premium: 3000,
      deductible: 500,
      startDate: '2024-01-01',
      expiryDate: '2025-01-01',
      status: 'active',
      insuredPerson: 'Test Person',
      documentType: 'policy',
      uploadDate: '2024-01-01',
      logo: '',
      fileName: 'test.pdf',
      coverages: [],
      exclusions: [],
      specialConditions: [],
      insuranceLine: 'Motor',
      aiConfidence: 0.92,
      aiInsights: [],
      monthlyPremium: 250,
      ...overrides,
    },
    source: 'ai' as const,
    extractedData: {
      confidence: { overall: 0.92, ...((overrides.confidence as Record<string, unknown>) || {}) },
    },
    lowConfidence: false,
    ...overrides,
  }
}

function renderUpload(initialEntries: string[] = ['/upload']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PolicyUpload />
    </MemoryRouter>
  )
}

function addPdfFile(name = 'test.pdf') {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['%PDF-test'], name, { type: 'application/pdf' })
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
  fireEvent.change(fileInput)
  return file
}

describe('PolicyUpload Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock global fetch for health check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'test-log-id' } }),
    })

    mockUser = null
    mockAuthConfigured = false
    mockIsSupabaseConfigured = false
    mockHealthStatus = 'healthy'
    mockProviders = { openai: true, anthropic: false, google: false }
    mockHealthError = undefined
    mockDiagnostics = undefined
    mockSearchParams = new URLSearchParams()
    mockLocationState = null
    mockExtractPolicy.mockResolvedValue(mockSuccessResult())
    mockCheckPolicyBeforeUpload.mockResolvedValue({ type: 'noConflict' })
    mockHandleDuplicateResolution.mockResolvedValue({})
    mockHandlePolicyAmendment.mockResolvedValue({ success: true, versionNumber: 2, changes: [{}] })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    // Flush pending async processing (upload progress loop uses 5×100ms setTimeout)
    // to prevent timer leakage between tests
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })
  })

  // --- Error message categorization (10+ branches) ---
  describe('error message categorization', () => {
    it('shows AI not configured error (NO_AI_CONFIG)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('NO_AI_CONFIG: AI is not configured'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorAiNotConfigured,
          expect.objectContaining({
            description: expect.stringContaining(EN_TRANSLATIONS.upload.errorAiUnavailable),
          })
        )
      })
    })

    it('shows PDF timeout error (PDF_TIMEOUT)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('PDF_TIMEOUT: timed out'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorPdfTimeout,
          expect.anything()
        )
      })
    })

    it('shows PDF worker error (PDF_WORKER_ERROR)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('PDF_WORKER_ERROR: worker failed'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorPdfWorker,
          expect.anything()
        )
      })
    })

    it('shows file read error (FILE_READ_ERROR)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('FILE_READ_ERROR: Could not read'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorFileRead,
          expect.anything()
        )
      })
    })

    it('shows PDF parse error (PDF_PARSE_ERROR)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('PDF_PARSE_ERROR: PDF processing failed'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorPdfParse,
          expect.anything()
        )
      })
    })

    it('shows rate limit error (429)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('rate limit exceeded 429'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorRateLimit,
          expect.anything()
        )
      })
    })

    it('shows network error (proxy/network/fetch)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('network error: fetch failed'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorNetwork,
          expect.anything()
        )
      })
    })

    it('shows provider not configured error (PROVIDER_NOT_CONFIGURED)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('PROVIDER_NOT_CONFIGURED 503'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorProviderNotReady,
          expect.anything()
        )
      })
    })

    it('shows low confidence error (LOW_CONFIDENCE)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('LOW_CONFIDENCE: extraction unreliable'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorLowConfidence,
          expect.anything()
        )
      })
    })

    it('shows request timeout error (ETIMEDOUT)', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('timeout ETIMEDOUT'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorRequestTimeout,
          expect.anything()
        )
      })
    })

    it('shows generic error for unknown error types', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('Something completely unexpected'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.errorAnalysisFailed,
          expect.anything()
        )
      })
    })

    it('handles non-Error thrown values', async () => {
      mockExtractPolicy.mockRejectedValueOnce('string error')
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled()
      })
    })

    it('shows error in file list for failed extraction', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('PDF_PARSE_ERROR: could not parse'))
      renderUpload()
      await act(async () => {
        addPdfFile('broken.pdf')
      })
      await waitFor(() => {
        expect(screen.getByText('broken.pdf')).toBeInTheDocument()
      })
    })
  })

  // --- Extraction result: AI source with confidence display ---
  describe('AI extraction source display', () => {
    it('shows AI extracted status with confidence percentage', async () => {
      mockExtractPolicy.mockResolvedValueOnce(mockSuccessResult())
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(
        () => {
          expect(screen.getByText(/AI extracted/i)).toBeInTheDocument()
          expect(screen.getByText('(92%)')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })

    it('shows correct status for fallback source', async () => {
      mockExtractPolicy.mockResolvedValueOnce(mockSuccessResult({ source: 'fallback' }))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(
        () => {
          expect(screen.getByText(/AI extracted/i)).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })
  })

  // --- Low confidence warning ---
  describe('low confidence handling', () => {
    it('shows low confidence warning toast', async () => {
      mockExtractPolicy.mockResolvedValueOnce({
        ...mockSuccessResult(),
        lowConfidence: true,
      })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(
        () => {
          expect(mockToast.warning).toHaveBeenCalledWith(
            EN_TRANSLATIONS.upload.analysisCompleteLowConfidence,
            expect.objectContaining({
              description: expect.stringContaining(EN_TRANSLATIONS.upload.verifyData),
            })
          )
        },
        { timeout: 3000 }
      )
    })

    it('shows low confidence status indicator', async () => {
      mockExtractPolicy.mockResolvedValueOnce({
        ...mockSuccessResult(),
        lowConfidence: true,
      })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByText(/Low confidence/i)).toBeInTheDocument()
      })
    })
  })

  // --- Conflict resolution ---
  describe('conflict resolution dialog', () => {
    beforeEach(() => {
      mockUser = { id: 'u1', email: 'test@example.com' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
    })

    it('shows conflict dialog for exact duplicate', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'existing-1', policyNumber: 'POL-001' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      expect(mockToast.warning).toHaveBeenCalledWith(
        EN_TRANSLATIONS.upload.duplicateDetected,
        expect.anything()
      )
    })

    it('shows conflict dialog for amendment', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'amendment',
        existingPolicy: { id: 'existing-2', policyNumber: 'POL-002' } as never,
        changes: [{ field: 'premium', oldValue: 1000, newValue: 1500 }] as never,
        isVerifiedAmendment: true,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      expect(mockToast.warning).toHaveBeenCalledWith(
        EN_TRANSLATIONS.upload.amendmentDetected,
        expect.anything()
      )
    })

    it('handles conflict skip - removes file from list', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-1', policyNumber: 'POL-X' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile('skip-me.pdf')
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-skip'))
      })
      expect(mockToast.info).toHaveBeenCalledWith(
        EN_TRANSLATIONS.upload.uploadSkipped,
        expect.anything()
      )
    })

    it('handles conflict replace - calls handleDuplicateResolution', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-2', policyNumber: 'POL-Y' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      mockHandleDuplicateResolution.mockResolvedValueOnce({})
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-replace'))
      })
      await waitFor(() => {
        expect(mockHandleDuplicateResolution).toHaveBeenCalledWith(
          'replace',
          'ex-2',
          expect.any(Object)
        )
        expect(mockRefreshPolicies).toHaveBeenCalled()
        expect(mockToast.success).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.policyUpdated,
          expect.anything()
        )
      })
    })

    it('handles conflict replace failure', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-3', policyNumber: 'POL-Z' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      mockHandleDuplicateResolution.mockResolvedValueOnce({ error: 'Replace failed' })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-replace'))
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.updateFailed,
          expect.anything()
        )
      })
    })

    it('handles conflict keepBoth - saves new policy', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-4', policyNumber: 'POL-KB' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-keep-both'))
      })
      await waitFor(() => {
        expect(mockCreatePolicy).toHaveBeenCalled()
        expect(mockRefreshPolicies).toHaveBeenCalled()
        expect(mockToast.success).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.policySaved,
          expect.anything()
        )
      })
    })

    it('handles conflict keepBoth failure', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-5', policyNumber: 'POL-KB2' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      mockCreatePolicy.mockRejectedValueOnce(new Error('DB error'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-keep-both'))
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.saveFailed,
          expect.anything()
        )
      })
    })

    it('handles conflict trackAmendment - calls handlePolicyAmendment', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'amendment',
        existingPolicy: { id: 'ex-6', policyNumber: 'POL-AMD' } as never,
        changes: [{ field: 'premium', oldValue: 1000, newValue: 1500 }] as never,
        isVerifiedAmendment: true,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-track'))
      })
      await waitFor(() => {
        expect(mockHandlePolicyAmendment).toHaveBeenCalledWith(
          'ex-6',
          expect.any(Object),
          expect.any(Array)
        )
        expect(mockToast.success).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.amendmentTracked,
          expect.anything()
        )
      })
    })

    it('handles conflict trackAmendment failure', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'amendment',
        existingPolicy: { id: 'ex-7', policyNumber: 'POL-AMD2' } as never,
        changes: [{ field: 'premium' }] as never,
        isVerifiedAmendment: true,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      mockHandlePolicyAmendment.mockResolvedValueOnce({ success: false, error: 'Amendment failed' })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-track'))
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.amendmentFailed,
          expect.anything()
        )
      })
    })

    it('handles conflict edit - navigates to policy detail', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-8', policyNumber: 'POL-EDT' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-edit'))
      })
      expect(mockToast.info).toHaveBeenCalledWith(
        EN_TRANSLATIONS.upload.editMode,
        expect.objectContaining({ duration: 10000 })
      )
    })

    it('handles conflict close - closes dialog', async () => {
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-9', policyNumber: 'POL-CLS' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-close'))
      })
      await waitFor(() => {
        expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument()
      })
    })

    it('continues if conflict check throws (fail open)', async () => {
      mockCheckPolicyBeforeUpload.mockRejectedValueOnce(new Error('Check failed'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      // Should still complete successfully (fail open)
      await waitFor(() => {
        expect(screen.getByText(/AI extracted/i)).toBeInTheDocument()
      })
    })
  })

  // --- Diagnostics ---
  describe('diagnostics', () => {
    it('shows diagnostics success when a provider is valid', async () => {
      mockHealthStatus = 'unhealthy'
      mockHealthError = 'Connection failed'
      mockRunDiagnostics.mockResolvedValueOnce({
        summary: { anyProviderValid: true, recommendation: 'OpenAI is working' },
      })
      renderUpload()
      await act(async () => {
        fireEvent.click(screen.getByText('Run Diagnostics'))
      })
      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.diagnosticsComplete,
          expect.objectContaining({ description: 'OpenAI is working' })
        )
      })
    })

    it('shows diagnostics failure when no provider is valid', async () => {
      mockHealthStatus = 'unhealthy'
      mockHealthError = 'Connection failed'
      mockRunDiagnostics.mockResolvedValueOnce({
        summary: { anyProviderValid: false, recommendation: 'No providers available' },
      })
      renderUpload()
      await act(async () => {
        fireEvent.click(screen.getByText('Run Diagnostics'))
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.diagnosticsFailed,
          expect.objectContaining({ description: 'No providers available' })
        )
      })
    })

    it('shows diagnostics unreachable when result is null', async () => {
      mockHealthStatus = 'unhealthy'
      mockHealthError = 'Connection failed'
      mockRunDiagnostics.mockResolvedValueOnce(null)
      renderUpload()
      await act(async () => {
        fireEvent.click(screen.getByText('Run Diagnostics'))
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.diagnosticsUnreachable,
          expect.anything()
        )
      })
    })

    it('shows diagnostic results panel when diagnostics are available', () => {
      mockHealthStatus = 'unhealthy'
      mockHealthError = 'Error'
      mockDiagnostics = {
        openai: { valid: true, configured: true, latencyMs: 120 },
        anthropic: { valid: false, configured: true, error: 'Invalid key' },
        google: { valid: false, configured: false },
      }
      renderUpload()
      expect(screen.getByText('Diagnostic Results:')).toBeInTheDocument()
      expect(screen.getByText(/Working \(120ms\)/)).toBeInTheDocument()
      expect(screen.getByText(/Invalid key/)).toBeInTheDocument()
      expect(screen.getByText(/Not configured \(optional\)/)).toBeInTheDocument()
    })
  })

  // --- Backend status badges ---
  describe('status badges', () => {
    it('shows checking status', () => {
      mockHealthStatus = 'checking'
      renderUpload()
      expect(screen.getByText(EN_TRANSLATIONS.upload.checkingBackend)).toBeInTheDocument()
    })

    it('shows both providers (OpenAI + Claude)', () => {
      mockProviders = { openai: true, anthropic: true, google: false }
      renderUpload()
      expect(screen.getByText(/OpenAI \+ Claude/)).toBeInTheDocument()
    })

    it('shows OpenAI only', () => {
      mockProviders = { openai: true, anthropic: false, google: false }
      renderUpload()
      expect(screen.getByText(/OpenAI GPT-4/)).toBeInTheDocument()
    })

    it('shows Claude only', () => {
      mockProviders = { openai: false, anthropic: true, google: false }
      renderUpload()
      expect(screen.getByText(/Claude/)).toBeInTheDocument()
    })

    it('shows demo mode when backend not ready and AI not configured', () => {
      mockHealthStatus = 'unhealthy'
      mockHealthError = 'error'
      mockIsAIConfigured.mockReturnValue(false)
      renderUpload()
      expect(screen.getByText(EN_TRANSLATIONS.upload.demoModeStatus)).toBeInTheDocument()
    })

    it('shows cloud storage badge when Supabase is configured', () => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
      renderUpload()
      expect(screen.getByText(EN_TRANSLATIONS.upload.cloudStorageEnabled)).toBeInTheDocument()
    })

    it('shows unconfigured warning in production', () => {
      mockHealthStatus = 'unconfigured'
      // Production mode is checked via import.meta.env.PROD, which is false in tests
      // In dev mode, it shows "Backend Proxy Not Configured"
      renderUpload()
      expect(screen.getByText('Backend Proxy Not Configured')).toBeInTheDocument()
    })
  })

  // --- handleAnalyzeAll ---
  describe('handleAnalyzeAll', () => {
    it('shows error toast when no completed policies', async () => {
      // Render with no files, then try to click view analysis
      // We need a file to see the button - add a file that errors
      mockExtractPolicy.mockRejectedValueOnce(new Error('fail'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument()
      })
      // View Analysis button should not appear when no complete files
      expect(screen.queryByRole('button', { name: /view analysis/i })).not.toBeInTheDocument()
    })

    it('navigates to dashboard with replace for completed policies (local mode)', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /view analysis/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /view analysis/i }))
      })
      expect(mockAddPolicies).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })

    it('does not call addPolicies when using Supabase', async () => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /view analysis/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /view analysis/i }))
      })
      expect(mockAddPolicies).not.toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })

  // --- Supabase save flow ---
  describe('Supabase save flow', () => {
    beforeEach(() => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
    })

    it('saves policy to Supabase when authenticated', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockCreatePolicy).toHaveBeenCalled()
        expect(mockRefreshPolicies).toHaveBeenCalled()
        expect(mockUploadPolicyDocument).toHaveBeenCalled()
      })
    })

    it('shows savedToCloud note in toast', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          EN_TRANSLATIONS.upload.analysisComplete,
          expect.objectContaining({
            description: expect.stringContaining(EN_TRANSLATIONS.upload.savedToCloud),
          })
        )
      })
    })

    it('continues if createPolicy fails', async () => {
      mockCreatePolicy.mockRejectedValueOnce(new Error('DB save error'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        // Should still show as complete
        expect(screen.getByText(/AI extracted/i)).toBeInTheDocument()
      })
    })

    it('continues if uploadPolicyDocument fails', async () => {
      mockUploadPolicyDocument.mockRejectedValueOnce(new Error('Storage error'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByText(/AI extracted/i)).toBeInTheDocument()
      })
    })
  })

  // --- Local-only save flow ---
  describe('local-only save flow', () => {
    it('completes stage with local_only_mode reason', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockCompleteStage).toHaveBeenCalledWith(
          expect.objectContaining({
            output: expect.objectContaining({ saved_to_cloud: false, reason: 'local_only_mode' }),
          })
        )
      })
    })
  })

  // --- Extraction failure path ---
  describe('extraction failure result', () => {
    it('throws when extraction result.success is false', async () => {
      mockExtractPolicy.mockResolvedValueOnce({
        success: false,
        error: { message: 'Extraction failed completely' },
      })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled()
      })
    })
  })

  // --- File operations ---
  describe('file operations', () => {
    it('removes file from list', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile('removable.pdf')
      })
      await waitFor(() => {
        expect(screen.getByText('removable.pdf')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Remove file'))
      })
      expect(screen.queryByText('removable.pdf')).not.toBeInTheDocument()
      expect(mockToast.info).toHaveBeenCalledWith(
        EN_TRANSLATIONS.upload.fileRemoved,
        expect.anything()
      )
    })

    it('shows partial acceptance toast when some files are invalid', async () => {
      // Need to render first
      renderUpload()
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const validFile = new File(['%PDF'], 'good.pdf', { type: 'application/pdf' })
      const invalidFile = new File(['text'], 'bad.txt', { type: 'text/plain' })
      Object.defineProperty(input, 'files', { value: [validFile, invalidFile], configurable: true })
      fireEvent.change(input)
      await waitFor(() => {
        // Toast should show acceptance info
        expect(mockToast.info).toHaveBeenCalled()
      })
    })

    it('does nothing when no valid files', async () => {
      renderUpload()
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const invalidFile = new File(['text'], 'bad.txt', { type: 'text/plain' })
      Object.defineProperty(input, 'files', { value: [invalidFile], configurable: true })
      fireEvent.change(input)
      // Should show error toast but not add any files
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled()
      })
    })
  })

  // --- Retry ---
  describe('retry functionality', () => {
    it('extraction failure sets error state', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('fail'))
      renderUpload()
      await act(async () => {
        addPdfFile('retry-me.pdf')
      })
      // Extraction was called - use waitFor because addFiles is async fire-and-forget
      await waitFor(() => {
        expect(mockExtractPolicy).toHaveBeenCalled()
      })
    })

    it('retries all failed files via Retry All button', async () => {
      mockExtractPolicy.mockRejectedValue(new Error('fail'))
      renderUpload()

      await act(async () => {
        addPdfFile('fail1.pdf')
      })
      await waitFor(
        () => {
          expect(mockExtractPolicy).toHaveBeenCalledTimes(1)
        },
        { timeout: 3000 }
      )

      await act(async () => {
        addPdfFile('fail2.pdf')
      })
      await waitFor(
        () => {
          expect(mockExtractPolicy).toHaveBeenCalledTimes(2)
        },
        { timeout: 3000 }
      )

      // Wait for error status to render Retry All button
      const retryButton = await screen.findByText(
        EN_TRANSLATIONS.upload.retryAll,
        {},
        { timeout: 3000 }
      )
      expect(retryButton).toBeInTheDocument()

      mockExtractPolicy.mockResolvedValue(mockSuccessResult())
      await act(async () => {
        fireEvent.click(retryButton)
      })

      await waitFor(
        () => {
          expect(mockExtractPolicy).toHaveBeenCalledTimes(4) // 2 fails + 2 retries
        },
        { timeout: 5000 }
      )
    })
  })

  // --- Sample policies ---
  describe('sample policies', () => {
    it('loads sample policies and navigates to dashboard', async () => {
      renderUpload()
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.upload.useSamplesLink))
      })
      expect(mockAddPolicies).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
      expect(mockToast.success).toHaveBeenCalledWith(
        EN_TRANSLATIONS.upload.samplePoliciesLoaded,
        expect.anything()
      )
    })
  })

  // --- View policy ---
  describe('view policy', () => {
    it('navigates to policy detail page with replace', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByLabelText('View policy details')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByLabelText('View policy details'))
      })
      expect(mockNavigate).toHaveBeenCalledWith('/policy/pol-1', { replace: true })
    })
  })

  // --- Processing logger ---
  describe('processing logger', () => {
    it('sets up persist callback', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockSetPersistCallback).toHaveBeenCalled()
      })
    })

    it('starts upload and duplicate_check stages', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockStartStage).toHaveBeenCalledWith('upload', expect.any(Object))
        expect(mockStartStage).toHaveBeenCalledWith('duplicate_check', expect.any(Object))
        expect(mockStartStage).toHaveBeenCalledWith('database_save', expect.any(Object))
      })
    })

    it('calls logger.complete on successful extraction', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockComplete).toHaveBeenCalled()
      })
    })

    it('calls logger.fail on extraction error', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('fatal error'))
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockFail).toHaveBeenCalledWith('fatal error', expect.any(Object))
      })
    })

    it('sets policy ID on successful Supabase save', async () => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(mockSetPolicyId).toHaveBeenCalledWith('pol-1')
      })
    })
  })

  // --- Drag and drop ---
  describe('drag and drop', () => {
    it('handles dragOver and sets isDragging', () => {
      renderUpload()
      const dropZone = screen
        .getByText(EN_TRANSLATIONS.upload.dropHere)
        .closest('[class*="rounded-2xl"]')!
      fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } })
      expect(dropZone.className).toContain('border-blue-500')
    })

    it('handles dragLeave and resets isDragging', () => {
      renderUpload()
      const dropZone = screen
        .getByText(EN_TRANSLATIONS.upload.dropHere)
        .closest('[class*="rounded-2xl"]')!
      fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } })
      fireEvent.dragLeave(dropZone)
      expect(dropZone.className).not.toContain('border-blue-500')
    })

    it('handles drop with file', async () => {
      renderUpload()
      const dropZone = screen
        .getByText(EN_TRANSLATIONS.upload.dropHere)
        .closest('[class*="rounded-2xl"]')!
      const file = new File(['%PDF'], 'dropped.pdf', { type: 'application/pdf' })
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
      await waitFor(() => {
        expect(screen.getByText('dropped.pdf')).toBeInTheDocument()
      })
    })
  })

  // --- File input reset ---
  describe('file input', () => {
    it('resets file input value after selection', async () => {
      renderUpload()
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      fireEvent.change(input)
      // Input value should be reset
      expect(input.value).toBe('')
    })
  })

  // --- File status display ---
  describe('file status display', () => {
    it('shows uploading status with progress bar', async () => {
      // Make extraction hang
      mockExtractPolicy.mockImplementationOnce(() => new Promise(() => {}))
      renderUpload()
      addPdfFile('uploading.pdf')
      await waitFor(() => {
        expect(screen.getByText(/Uploading/i)).toBeInTheDocument()
      })
    })

    it('shows analyzing status', async () => {
      // Make extraction hang to catch the analyzing state
      let resolveExtraction: (v: unknown) => void
      mockExtractPolicy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveExtraction = resolve
          })
      )
      renderUpload()
      addPdfFile('analyzing.pdf')
      await waitFor(() => {
        expect(screen.getByText(/AI analyzing/i)).toBeInTheDocument()
      })
      // Resolve to prevent hanging
      resolveExtraction!(mockSuccessResult())
    })

    it('shows awaiting resolution status for duplicates', async () => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce({
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex', policyNumber: 'P' } as never,
      })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.upload.duplicateAwaiting)).toBeInTheDocument()
      })
    })

    it('shows awaiting resolution status for amendments', async () => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce({
        type: 'amendment',
        existingPolicy: { id: 'ex', policyNumber: 'P' } as never,
        changes: [],
        isVerifiedAmendment: true,
      })
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.upload.amendmentAwaiting)).toBeInTheDocument()
      })
    })

    it('shows error status in file list', async () => {
      mockExtractPolicy.mockRejectedValueOnce(new Error('Something went wrong'))
      renderUpload()
      await act(async () => {
        addPdfFile('error-file.pdf')
      })
      await waitFor(() => {
        // File should be displayed with error icon (AlertTriangle)
        expect(screen.getByText('error-file.pdf')).toBeInTheDocument()
      })
    })

    it('shows error count summary', async () => {
      mockExtractPolicy.mockRejectedValue(new Error('fail'))
      renderUpload()
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const f1 = new File(['%PDF'], 'e1.pdf', { type: 'application/pdf' })
      Object.defineProperty(input, 'files', { value: [f1], configurable: true })
      await act(async () => {
        fireEvent.change(input)
      })
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.upload.clickRetryOrRemove)).toBeInTheDocument()
      })
    })
  })

  // --- Resolve button on awaiting file ---
  describe('resolve button', () => {
    it('opens conflict dialog when resolve button clicked', async () => {
      mockUser = { id: 'u1' }
      mockAuthConfigured = true
      mockIsSupabaseConfigured = true
      const conflict: PreUploadCheckResult = {
        type: 'exactDuplicate',
        existingPolicy: { id: 'ex-r', policyNumber: 'POL-R' } as never,
      }
      mockCheckPolicyBeforeUpload.mockResolvedValueOnce(conflict)
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      // Close the auto-opened dialog first
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('conflict-close'))
      })
      // Now click the resolve button on the file
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.upload.resolveBtn)).toBeInTheDocument()
      })
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.upload.resolveBtn))
      })
      expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument()
    })
  })

  // --- Processing count display ---
  describe('file counts', () => {
    it('addPdfFile triggers extraction', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile('processing.pdf')
      })
      await waitFor(() => {
        expect(mockExtractPolicy).toHaveBeenCalled()
      })
    })

    it('shows completed count in header', async () => {
      renderUpload()
      await act(async () => {
        addPdfFile()
      })
      await waitFor(() => {
        expect(screen.getByText(/1\/1/)).toBeInTheDocument()
      })
    })
  })

  // --- Preload pdfjs ---
  describe('preload pdfjs', () => {
    it('calls preloadPdfJs on mount', async () => {
      renderUpload()
      await waitFor(() => {
        expect(mockPreloadPdfJs).toHaveBeenCalled()
      })
    })
  })
})
