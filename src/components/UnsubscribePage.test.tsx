import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { UnsubscribePage } from './UnsubscribePage'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

// Mock getEnvConfig
vi.mock('@/lib/env', () => ({
  getEnvConfig: () => ({ apiProxyUrl: 'http://localhost:4001' }),
}))

// Mock i18n context with English translations
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('UnsubscribePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const renderWithRouter = (initialRoute: string) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  describe('Initial State', () => {
    it('shows invalid state when email param is missing', () => {
      renderWithRouter('/unsubscribe?token=abc123')

      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleError)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.invalidLink)).toBeInTheDocument()
    })

    it('shows invalid state when token param is missing', () => {
      renderWithRouter('/unsubscribe?email=test@example.com')

      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleError)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.invalidLink)).toBeInTheDocument()
    })

    it('shows invalid state when both params are missing', () => {
      renderWithRouter('/unsubscribe')

      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleError)).toBeInTheDocument()
    })

    it('shows confirmation state when both params are present', () => {
      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken123')

      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.title)).toBeInTheDocument()
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.areYouSure)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton) })
      ).toBeInTheDocument()
    })

    it('displays the email address in confirm state', () => {
      renderWithRouter('/unsubscribe?email=user@domain.com&token=abc')

      expect(screen.getByText('user@domain.com')).toBeInTheDocument()
    })
  })

  describe('Unsubscribe Flow', () => {
    it('calls API with correct payload when unsubscribe button is clicked', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Unsubscribed' }),
      })

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4001/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', token: 'validtoken' }),
      })
    })

    it('shows success state after successful unsubscribe', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully unsubscribed' }),
      })

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleSuccess)).toBeInTheDocument()
      })

      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.successMessage)).toBeInTheDocument()
    })

    it('shows processing state while API call is in progress', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValueOnce(pendingPromise)

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.processing)).toBeInTheDocument()

      // Resolve the promise to clean up
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })
      })
    })
  })

  describe('Error Handling', () => {
    it('shows error state when API returns error response', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'Invalid unsubscribe token',
            message: 'Please use the link from your most recent email.',
          }),
      })

      renderWithRouter('/unsubscribe?email=test@example.com&token=invalidtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleError)).toBeInTheDocument()
      })

      expect(screen.getByText('Invalid unsubscribe token')).toBeInTheDocument()
      expect(
        screen.getByText('Please use the link from your most recent email.')
      ).toBeInTheDocument()
    })

    it('shows network error when fetch fails', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.connectionError)).toBeInTheDocument()
      })

      expect(
        screen.getByText(EN_TRANSLATIONS.unsubscribe.connectionErrorDetails)
      ).toBeInTheDocument()
    })

    it('allows retry after error', async () => {
      const user = userEvent.setup()
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      })
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      // First attempt
      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleError)).toBeInTheDocument()
      })

      // Retry
      const retryButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.retry),
      })
      await user.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleSuccess)).toBeInTheDocument()
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Navigation', () => {
    it('has link back to home page in confirm state', () => {
      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const homeLink = screen.getByRole('link', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.backToHome),
      })
      expect(homeLink).toHaveAttribute('href', '/')
    })

    it('has link back to home page in success state', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.titleSuccess)).toBeInTheDocument()
      })

      const homeLink = screen.getByRole('link', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.backToHome),
      })
      expect(homeLink).toHaveAttribute('href', '/')
    })

    it('has link back to home page in error state', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      renderWithRouter('/unsubscribe?email=test@example.com&token=validtoken')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.unsubscribe.connectionError)).toBeInTheDocument()
      })

      const homeLink = screen.getByRole('link', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.backToHome),
      })
      expect(homeLink).toHaveAttribute('href', '/')
    })
  })

  describe('URL Encoding', () => {
    it('handles URL-encoded email addresses', () => {
      renderWithRouter('/unsubscribe?email=test%2Buser%40example.com&token=abc')

      expect(screen.getByText('test+user@example.com')).toBeInTheDocument()
    })

    it('sends decoded email to API', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      renderWithRouter('/unsubscribe?email=test%2Buser%40example.com&token=abc')

      const unsubscribeButton = screen.getByRole('button', {
        name: new RegExp(EN_TRANSLATIONS.unsubscribe.confirmButton),
      })
      await user.click(unsubscribeButton)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ email: 'test+user@example.com', token: 'abc' }),
        })
      )
    })
  })
})
