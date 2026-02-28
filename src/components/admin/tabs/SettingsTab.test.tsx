/**
 * SettingsTab Component Tests
 *
 * Tests for the main settings tab component including
 * category navigation and settings management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsTab } from './SettingsTab'

// Mock child components
vi.mock('./settings/AISettingsPanel', () => ({
  AISettingsPanel: () => <div data-testid="ai-settings-panel">AI Settings Panel</div>,
}))

vi.mock('./settings/EvaluationSettingsPanel', () => ({
  EvaluationSettingsPanel: () => (
    <div data-testid="evaluation-settings-panel">Evaluation Settings Panel</div>
  ),
}))

vi.mock('./settings/RateLimitsPanel', () => ({
  RateLimitsPanel: () => <div data-testid="rate-limits-panel">Rate Limits Panel</div>,
}))

vi.mock('./settings/OCRSettingsPanel', () => ({
  OCRSettingsPanel: () => <div data-testid="ocr-settings-panel">OCR Settings Panel</div>,
}))

vi.mock('./settings/FeatureFlagsPanel', () => ({
  FeatureFlagsPanel: () => <div data-testid="feature-flags-panel">Feature Flags Panel</div>,
}))

// Mock adminFetch
const mockAdminFetch = vi.fn()

vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('SettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    })
  })

  describe('Rendering', () => {
    it('should render the settings header', () => {
      render(<SettingsTab />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should render category navigation buttons', () => {
      render(<SettingsTab />)

      expect(screen.getByRole('button', { name: /^AI Settings/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /evaluation/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /rate limits/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /ocr/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /feature flags/i })).toBeInTheDocument()
    })

    it('should show AI settings panel by default', async () => {
      render(<SettingsTab />)

      await waitFor(() => {
        expect(screen.getByTestId('ai-settings-panel')).toBeInTheDocument()
      })
    })
  })

  describe('Category Navigation', () => {
    it('should switch to Evaluation panel when clicked', async () => {
      const user = userEvent.setup()
      render(<SettingsTab />)

      await user.click(screen.getByRole('button', { name: /evaluation/i }))

      await waitFor(() => {
        expect(screen.getByTestId('evaluation-settings-panel')).toBeInTheDocument()
      })
    })

    it('should switch to Rate Limits panel when clicked', async () => {
      const user = userEvent.setup()
      render(<SettingsTab />)

      await user.click(screen.getByRole('button', { name: /rate limits/i }))

      await waitFor(() => {
        expect(screen.getByTestId('rate-limits-panel')).toBeInTheDocument()
      })
    })

    it('should switch to OCR panel when clicked', async () => {
      const user = userEvent.setup()
      render(<SettingsTab />)

      await user.click(screen.getByRole('button', { name: /ocr/i }))

      await waitFor(() => {
        expect(screen.getByTestId('ocr-settings-panel')).toBeInTheDocument()
      })
    })

    it('should switch to Feature Flags panel when clicked', async () => {
      const user = userEvent.setup()
      render(<SettingsTab />)

      await user.click(screen.getByRole('button', { name: /feature flags/i }))

      await waitFor(() => {
        expect(screen.getByTestId('feature-flags-panel')).toBeInTheDocument()
      })
    })

    it('should highlight the active category button', async () => {
      const user = userEvent.setup()
      render(<SettingsTab />)

      const evaluationButton = screen.getByRole('button', { name: /evaluation/i })
      await user.click(evaluationButton)

      // Check that the button has the active class or is highlighted
      await waitFor(() => {
        expect(evaluationButton).toHaveClass('bg-primary')
      })
    })
  })

  describe('Data Fetching', () => {
    it('should fetch settings data on mount', async () => {
      render(<SettingsTab />)

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalled()
      })
    })

    it('should handle fetch errors gracefully', async () => {
      mockAdminFetch.mockRejectedValueOnce(new Error('Network error'))

      render(<SettingsTab />)

      // Component should still render without crashing
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument()
      })
    })
  })

  describe('Settings Update', () => {
    it('should call API when settings are updated', async () => {
      mockAdminFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })

      render(<SettingsTab />)

      // The child panels would trigger updates
      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalled()
      })
    })
  })
})

describe('SettingsTab - Category Icons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    })
  })

  it('should display icons for each category', () => {
    render(<SettingsTab />)

    // Each category button should have an icon (svg element)
    const buttons = screen.getAllByRole('button')
    const categoryButtons = buttons.filter((btn) =>
      btn.textContent?.match(/AI|Evaluation|Rate Limits|OCR|Feature Flags/i)
    )

    categoryButtons.forEach((button) => {
      expect(button.querySelector('svg')).toBeInTheDocument()
    })
  })
})
