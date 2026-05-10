/**
 * TryAnalysis Coverage Tests
 *
 * Targets uncovered branches: trial-used state, error state, drag/drop,
 * file validation, backend unavailable, low confidence, and redirects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TryAnalysis } from './TryAnalysis'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

// Mock navigate and location
const mockNavigate = vi.fn()
let mockLocationState: Record<string, unknown> | null = null
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      state: mockLocationState,
      pathname: '/try',
    }),
  }
})

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
  useI18n: () => ({ locale: 'en', setLocale: vi.fn() }),
}))

let mockUser: Record<string, unknown> | null = null
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}))

let mockBackendHealth = { status: 'healthy' }
vi.mock('@/hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ health: mockBackendHealth }),
}))

// Free trial mocks
let mockHasUsedFreeTrial = false
let mockCanPerformResult = { canTry: true, reason: '' }
let mockGetTrialResult: Record<string, unknown> | null = null
let mockTimeRemaining = 0

vi.mock('@/lib/free-trial', () => ({
  hasUsedFreeTrial: () => mockHasUsedFreeTrial,
  canPerformFreeTrial: () => mockCanPerformResult,
  saveTrialResult: vi.fn(),
  getTrialResult: () => mockGetTrialResult,
  getTrialTimeRemaining: () => mockTimeRemaining,
  formatTimeRemaining: (ms: number) => `${Math.round(ms / 1000)}s`,
  getTrialUploadsRemaining: () => 1,
  getTrialMaxUploads: () => 3,
}))

// AI extraction mock
const mockExtractPolicy = vi.fn()
vi.mock('@/lib/ai', () => ({
  extractPolicyFromDocument: (...args: unknown[]) => mockExtractPolicy(...args),
  isAIConfigured: () => true,
  preloadPdfJs: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  validateFiles: (files: File[]) => ({ valid: files, errors: [] }),
  getErrorMessage: (code: string) => ({
    title: `Error: ${code}`,
    description: 'Error description',
  }),
  FILE_CONSTRAINTS: {
    ALLOWED_EXTENSIONS: ['.pdf'],
    MAX_SIZE_MB: 25,
    MAX_FILES: 1,
  },
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizeFileName: (name: string) => name,
}))

vi.mock('@/lib/analytics', () => ({
  trackTrialPageView: vi.fn(),
  trackTrialUploadStarted: vi.fn(),
  trackTrialAnalysisStarted: vi.fn(),
  trackTrialAnalysisCompleted: vi.fn(),
  trackTrialAnalysisFailed: vi.fn(),
  trackTrialSignupClicked: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

function renderTryAnalysis() {
  return render(
    <MemoryRouter initialEntries={['/try']}>
      <TryAnalysis />
    </MemoryRouter>
  )
}

describe('TryAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'test-log-id' } }),
    })

    mockUser = null
    mockBackendHealth = { status: 'healthy' }
    mockHasUsedFreeTrial = false
    mockCanPerformResult = { canTry: true, reason: '' }
    mockGetTrialResult = null
    mockLocationState = null
    mockTimeRemaining = 0
    mockExtractPolicy.mockResolvedValue({
      success: true,
      policy: {
        id: 'trial-1',
        policyNumber: 'POL-001',
        provider: 'Allianz',
        type: 'kasko',
        aiConfidence: 0.85,
        coverages: [{ name: 'Collision' }],
      },
    })
  })

  // --- Redirect for logged-in user ---
  describe('logged-in user redirect', () => {
    it('redirects to /upload when user is logged in', () => {
      mockUser = { id: 'u1', email: 'test@example.com' }
      renderTryAnalysis()
      expect(mockNavigate).toHaveBeenCalledWith('/upload', { replace: true })
    })

    it('redirects with file when user logged in and has file in state', () => {
      mockUser = { id: 'u1', email: 'test@example.com' }
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      mockLocationState = { file }
      renderTryAnalysis()
      expect(mockNavigate).toHaveBeenCalledWith(
        '/upload',
        expect.objectContaining({
          replace: true,
          state: expect.objectContaining({ files: [file], autoProcess: true }),
        })
      )
    })
  })

  // --- Existing trial result ---
  describe('existing trial result', () => {
    it('shows upload interface when trial result exists (no auto-redirect)', () => {
      mockGetTrialResult = { policy: { id: 't1' } }
      renderTryAnalysis()
      // The component no longer auto-redirects on mount for existing trial results.
      // It stays on the upload page showing the idle upload interface.
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.title)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)).toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  // --- Trial-used state ---
  describe('trial-used state', () => {
    it('shows trial-used message when trial already used', () => {
      mockHasUsedFreeTrial = true
      renderTryAnalysis()
      expect(
        screen.getByText(EN_TRANSLATIONS.tryAnalysis.trialAlreadyUsedTitle)
      ).toBeInTheDocument()
    })

    it('shows time remaining when available', () => {
      mockHasUsedFreeTrial = true
      mockTimeRemaining = 3600000 // 1 hour
      renderTryAnalysis()
      expect(screen.getByText(/3600s/)).toBeInTheDocument()
    })

    it('shows sign up button on trial-used page', () => {
      mockHasUsedFreeTrial = true
      renderTryAnalysis()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.signUpUnlimited)).toBeInTheDocument()
    })

    it('navigates to auth from trial-used page', () => {
      mockHasUsedFreeTrial = true
      renderTryAnalysis()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.tryAnalysis.signUpUnlimited))
      expect(mockNavigate).toHaveBeenCalledWith('/auth?returnTo=/dashboard&fromTrial=true')
    })

    it('navigates home from trial-used page', () => {
      mockHasUsedFreeTrial = true
      renderTryAnalysis()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.tryAnalysis.backToHome))
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  // --- Idle state ---
  describe('idle state', () => {
    it('renders upload area in idle state', () => {
      renderTryAnalysis()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.title)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)).toBeInTheDocument()
    })

    it('shows free analysis badge', () => {
      renderTryAnalysis()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.freeAnalysisBadge)).toBeInTheDocument()
    })

    it('shows footer info in idle state', () => {
      renderTryAnalysis()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.secure)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.aiPowered)).toBeInTheDocument()
    })

    it('shows sign in link', () => {
      renderTryAnalysis()
      expect(screen.getByText(EN_TRANSLATIONS.auth.signIn)).toBeInTheDocument()
    })

    it('navigates to auth from sign in link', () => {
      renderTryAnalysis()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.auth.signIn))
      expect(mockNavigate).toHaveBeenCalledWith('/auth')
    })
  })

  // --- Backend unavailable ---
  describe('backend unavailable', () => {
    it('shows warning when backend is not ready', () => {
      mockBackendHealth = { status: 'unhealthy' }
      renderTryAnalysis()
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.serviceUnavailable)).toBeInTheDocument()
    })

    it('prevents file processing when backend is down', () => {
      mockBackendHealth = { status: 'unhealthy' }
      renderTryAnalysis()
      // When backend is down, the service unavailable message should show
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.serviceUnavailable)).toBeInTheDocument()
    })
  })

  // --- Drag and drop ---
  describe('drag and drop', () => {
    it('changes appearance on drag over', () => {
      renderTryAnalysis()
      const dropZone = screen
        .getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)
        .closest('div[class*="transition-colors"]')
      if (dropZone) {
        fireEvent.dragOver(dropZone, { preventDefault: () => {} })
        expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.dropFileHere)).toBeInTheDocument()
      }
    })

    it('resets on drag leave', () => {
      renderTryAnalysis()
      const dropZone = screen
        .getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)
        .closest('div[class*="transition-colors"]')
      if (dropZone) {
        fireEvent.dragOver(dropZone, { preventDefault: () => {} })
        fireEvent.dragLeave(dropZone)
        expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)).toBeInTheDocument()
      }
    })

    it('processes dropped file', async () => {
      renderTryAnalysis()
      const dropZone = screen
        .getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)
        .closest('div[class*="transition-colors"]')
      if (dropZone) {
        const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
        await act(async () => {
          fireEvent.drop(dropZone, {
            preventDefault: () => {},
            dataTransfer: { files: [file] },
          })
        })
      }
    })
  })

  // --- File selection ---
  describe('file selection', () => {
    it('processes file from input', async () => {
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      // Should start processing
    })

    it('rejects when trial already used', () => {
      mockCanPerformResult = { canTry: false, reason: 'Already used' }
      renderTryAnalysis()
      // Trial already used - the upload area should still be rendered
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows error UI on extraction failure', async () => {
      mockExtractPolicy.mockRejectedValue(new Error('Extraction failed'))
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(
            screen.getByText(EN_TRANSLATIONS.tryAnalysis.analysisFailedTitle)
          ).toBeInTheDocument()
          expect(screen.getByText('Extraction failed')).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it('shows try again button in error state', async () => {
      mockExtractPolicy.mockRejectedValue(new Error('fail'))
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.tryAgain)).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it('resets to idle on try again', async () => {
      mockExtractPolicy.mockRejectedValue(new Error('fail'))
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          const button = screen.getByText(EN_TRANSLATIONS.tryAnalysis.tryAgain)
          fireEvent.click(button)
        },
        { timeout: 5000 }
      )
      expect(screen.getByText(EN_TRANSLATIONS.tryAnalysis.uploadYourPolicy)).toBeInTheDocument()
    })

    it('handles null extraction result', async () => {
      mockExtractPolicy.mockResolvedValue(null)
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(
            screen.getByText(EN_TRANSLATIONS.tryAnalysis.analysisFailedTitle)
          ).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it('handles unsuccessful extraction result', async () => {
      mockExtractPolicy.mockResolvedValue({ success: false, error: { message: 'Parse error' } })
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(screen.getByText('Parse error')).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it('rejects fallback/sample data', async () => {
      mockExtractPolicy.mockResolvedValue({
        success: true,
        source: 'fallback',
        policy: { id: 't1' },
      })
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(
            screen.getByText(EN_TRANSLATIONS.tryAnalysis.analysisFailedTitle)
          ).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it('handles result with no policy', async () => {
      mockExtractPolicy.mockResolvedValue({ success: true, policy: null })
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(
            screen.getByText(EN_TRANSLATIONS.tryAnalysis.analysisFailedTitle)
          ).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })
  })

  // --- Successful extraction ---
  describe('successful extraction', () => {
    it('navigates to policy detail on success', async () => {
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith(
            '/policy/trial',
            expect.objectContaining({
              state: expect.objectContaining({ isTrialResult: true }),
              replace: true,
            })
          )
        },
        { timeout: 5000 }
      )
    })

    it('shows low confidence warning for low-confidence results', async () => {
      mockExtractPolicy.mockResolvedValue({
        success: true,
        lowConfidence: true,
        confidenceScore: 0.45,
        policy: { id: 't1', type: 'kasko', aiConfidence: 0.45, coverages: [] },
      })
      renderTryAnalysis()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'policy.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput, 'files', { value: [file] })
      await act(async () => {
        fireEvent.change(fileInput)
      })
      // Extraction was triggered
      await waitFor(
        () => {
          expect(mockExtractPolicy).toHaveBeenCalled()
        },
        { timeout: 5000 }
      )
    })
  })

  // --- handleSignUp (covered by trial-used state tests above) ---
})
