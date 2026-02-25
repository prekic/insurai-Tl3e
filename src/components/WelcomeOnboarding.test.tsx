import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { WelcomeOnboarding } from './WelcomeOnboarding'

// Mock i18n
const mockTranslations = {
  onboarding: {
    welcomeTitle: 'Welcome to InsurAI!',
    welcomeWithName: 'Welcome to InsurAI, {name}!',
    welcomeSubtitle: 'Get AI-powered analysis of your insurance policies in seconds.',
    howItWorks: 'How it works',
    step1Title: 'Upload your PDF',
    step1Desc: 'Drop your insurance policy document — we support all Turkish policy types.',
    step2Title: 'AI analyzes it',
    step2Desc: 'Our AI extracts coverage details, limits, exclusions, and key terms.',
    step3Title: 'Get insights & score',
    step3Desc: 'See your coverage score, gap analysis, and actionable recommendations.',
    uploadTitle: 'Drop your policy PDF here',
    uploadSubtitle: 'or click to browse',
    uploadHint: 'PDF files up to 10 MB',
    invalidFile: 'Please select a PDF file.',
    fileTooLarge: 'File is too large. Maximum size is 10 MB.',
    skipForNow: 'Skip for now',
    exploreSamples: 'Or explore sample policies',
  },
}

vi.mock('@/lib/errors', () => ({
  FILE_CONSTRAINTS: {
    MAX_SIZE_MB: 10,
    MAX_SIZE_BYTES: 10 * 1024 * 1024,
    ALLOWED_TYPES: ['application/pdf'],
    ALLOWED_EXTENSIONS: ['.pdf'],
  },
}))

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({
    t: mockTranslations,
    locale: 'en',
    isLoading: false,
  }),
}))

function renderComponent(props: Partial<React.ComponentProps<typeof WelcomeOnboarding>> = {}) {
  const defaultProps = {
    onUpload: vi.fn(),
    onSkip: vi.fn(),
    ...props,
  }
  return render(
    <BrowserRouter>
      <WelcomeOnboarding {...defaultProps} />
    </BrowserRouter>
  )
}

describe('WelcomeOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('welcome header', () => {
    it('renders generic welcome when no userName provided', () => {
      renderComponent()
      expect(screen.getByText('Welcome to InsurAI!')).toBeInTheDocument()
    })

    it('renders personalized welcome when userName provided', () => {
      renderComponent({ userName: 'Erdem' })
      expect(screen.getByText('Welcome to InsurAI, Erdem!')).toBeInTheDocument()
    })

    it('renders subtitle', () => {
      renderComponent()
      expect(
        screen.getByText('Get AI-powered analysis of your insurance policies in seconds.')
      ).toBeInTheDocument()
    })
  })

  describe('how it works cards', () => {
    it('renders all 3 step cards', () => {
      renderComponent()
      expect(screen.getByText('Upload your PDF')).toBeInTheDocument()
      expect(screen.getByText('AI analyzes it')).toBeInTheDocument()
      expect(screen.getByText('Get insights & score')).toBeInTheDocument()
    })

    it('renders step descriptions', () => {
      renderComponent()
      expect(screen.getByText(/Drop your insurance policy document/)).toBeInTheDocument()
      expect(screen.getByText(/Our AI extracts coverage details/)).toBeInTheDocument()
      expect(screen.getByText(/See your coverage score/)).toBeInTheDocument()
    })

    it('renders "How it works" heading', () => {
      renderComponent()
      expect(screen.getByText('How it works')).toBeInTheDocument()
    })
  })

  describe('upload drop zone', () => {
    it('renders upload title and subtitle', () => {
      renderComponent()
      expect(screen.getByText('Drop your policy PDF here')).toBeInTheDocument()
      expect(screen.getByText('or click to browse')).toBeInTheDocument()
    })

    it('renders file size hint', () => {
      renderComponent()
      expect(screen.getByText('PDF files up to 10 MB')).toBeInTheDocument()
    })

    it('has accessible drop zone with role button', () => {
      renderComponent()
      const dropZone = screen.getByRole('button', { name: /drop your policy pdf/i })
      expect(dropZone).toBeInTheDocument()
    })

    it('calls onUpload when valid PDF file is dropped', () => {
      const onUpload = vi.fn()
      renderComponent({ onUpload })

      const dropZone = screen.getByRole('button', { name: /drop your policy pdf/i })
      const pdfFile = new File(['dummy pdf content'], 'policy.pdf', { type: 'application/pdf' })

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [pdfFile] },
      })

      expect(onUpload).toHaveBeenCalledWith(pdfFile)
    })

    it('calls onUpload when PDF file is selected via file input', async () => {
      const user = userEvent.setup()
      const onUpload = vi.fn()
      renderComponent({ onUpload })

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const pdfFile = new File(['dummy pdf content'], 'policy.pdf', { type: 'application/pdf' })

      await user.upload(fileInput, pdfFile)

      expect(onUpload).toHaveBeenCalledWith(pdfFile)
    })

    it('rejects non-PDF files with error message', () => {
      const onUpload = vi.fn()
      renderComponent({ onUpload })

      const dropZone = screen.getByRole('button', { name: /drop your policy pdf/i })
      const txtFile = new File(['text content'], 'document.txt', { type: 'text/plain' })

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [txtFile] },
      })

      expect(onUpload).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent('Please select a PDF file.')
    })

    it('rejects files over 10MB with error message', () => {
      const onUpload = vi.fn()
      renderComponent({ onUpload })

      const dropZone = screen.getByRole('button', { name: /drop your policy pdf/i })
      // Create a File with a large size by overriding the size property
      const largeFile = new File(['x'], 'large.pdf', { type: 'application/pdf' })
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 })

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [largeFile] },
      })

      expect(onUpload).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'File is too large. Maximum size is 10 MB.'
      )
    })

    it('clears error on next valid file drop', () => {
      const onUpload = vi.fn()
      renderComponent({ onUpload })

      const dropZone = screen.getByRole('button', { name: /drop your policy pdf/i })

      // First: drop invalid file
      const txtFile = new File(['text'], 'doc.txt', { type: 'text/plain' })
      fireEvent.drop(dropZone, { dataTransfer: { files: [txtFile] } })
      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Then: drop valid file
      const pdfFile = new File(['pdf'], 'policy.pdf', { type: 'application/pdf' })
      fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile] } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('applies drag-over visual state', () => {
      renderComponent()
      const dropZone = screen.getByRole('button', { name: /drop your policy pdf/i })

      fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } })
      expect(dropZone.className).toContain('border-blue-500')

      fireEvent.dragLeave(dropZone, { dataTransfer: { files: [] } })
      expect(dropZone.className).toContain('border-gray-300')
    })
  })

  describe('footer actions', () => {
    it('renders "Skip for now" button that calls onSkip', async () => {
      const user = userEvent.setup()
      const onSkip = vi.fn()
      renderComponent({ onSkip })

      const skipButton = screen.getByRole('button', { name: /skip for now/i })
      await user.click(skipButton)

      expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it('renders "Explore sample policies" link pointing to /samples', () => {
      renderComponent()
      const link = screen.getByRole('link', { name: /explore sample policies/i })
      expect(link).toHaveAttribute('href', '/samples')
    })
  })

  describe('accessibility', () => {
    it('has proper heading hierarchy', () => {
      renderComponent()
      const h2 = screen.getByRole('heading', { level: 2 })
      expect(h2).toHaveTextContent('Welcome to InsurAI!')

      const h3 = screen.getByRole('heading', { level: 3 })
      expect(h3).toHaveTextContent('How it works')
    })

    it('file input has accept=".pdf" attribute', () => {
      renderComponent()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toHaveAttribute('accept', '.pdf')
    })
  })
})
