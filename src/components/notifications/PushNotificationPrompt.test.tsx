/**
 * Tests for src/components/notifications/PushNotificationPrompt.tsx
 *
 * Covers: show/hide logic, localStorage cooldown, permission denied state,
 * enable button flow, dismiss (maybe later) flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockIsSupported, mockPermission, mockIsSubscribed, mockIsLoading, mockSubscribe } =
  vi.hoisted(() => ({
    mockIsSupported: { value: true },
    mockPermission: { value: 'default' as NotificationPermission },
    mockIsSubscribed: { value: false },
    mockIsLoading: { value: false },
    mockSubscribe: vi.fn().mockResolvedValue(true),
  }))

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isSupported: mockIsSupported.value,
    permission: mockPermission.value,
    isSubscribed: mockIsSubscribed.value,
    isLoading: mockIsLoading.value,
    subscribe: mockSubscribe,
    unsubscribe: vi.fn(),
    error: null,
  }),
}))

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({
    t: EN_TRANSLATIONS,
    locale: 'en',
    isLoading: false,
  }),
}))

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const DISMISSED_KEY = 'insurai_push_dismissed_until'

function clearDismissed(): void {
  localStorage.removeItem(DISMISSED_KEY)
}

function setDismissed(daysFromNow = 7): void {
  const until = Date.now() + daysFromNow * 24 * 60 * 60 * 1000
  localStorage.setItem(DISMISSED_KEY, String(until))
}

function setDismissedExpired(): void {
  // Set a past timestamp
  const past = Date.now() - 1000
  localStorage.setItem(DISMISSED_KEY, String(past))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PushNotificationPrompt', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearDismissed()

    // Reset to defaults: supported, default permission, not subscribed
    mockIsSupported.value = true
    mockPermission.value = 'default'
    mockIsSubscribed.value = false
    mockIsLoading.value = false
    mockSubscribe.mockResolvedValue(true)
  })

  afterEach(() => {
    clearDismissed()
  })

  async function renderPrompt(onDismiss?: () => void) {
    const { PushNotificationPrompt } = await import('./PushNotificationPrompt')
    return render(<PushNotificationPrompt onDismiss={onDismiss} />)
  }

  // -------------------------------------------------------------------------
  // Visibility conditions
  // -------------------------------------------------------------------------
  describe('visibility', () => {
    it('renders the opt-in banner when all conditions are met', async () => {
      await renderPrompt()
      expect(screen.getByText(EN_TRANSLATIONS.notifications.promptTitle)).toBeInTheDocument()
    })

    it('does NOT render when push is not supported', async () => {
      mockIsSupported.value = false
      const { container } = await renderPrompt()
      expect(container).toBeEmptyDOMElement()
    })

    it('does NOT render when already subscribed', async () => {
      mockIsSubscribed.value = true
      const { container } = await renderPrompt()
      expect(container).toBeEmptyDOMElement()
    })

    it('does NOT render when permission is already granted', async () => {
      mockPermission.value = 'granted'
      const { container } = await renderPrompt()
      expect(container).toBeEmptyDOMElement()
    })

    it('does NOT render when dismissed within cooldown period', async () => {
      setDismissed(7) // dismissed, still valid
      const { container } = await renderPrompt()
      expect(container).toBeEmptyDOMElement()
    })

    it('DOES render when cooldown has expired', async () => {
      setDismissedExpired()
      await renderPrompt()
      expect(screen.getByText(EN_TRANSLATIONS.notifications.promptTitle)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Permission denied state
  // -------------------------------------------------------------------------
  describe('permission denied state', () => {
    it('shows permission denied message when permission is denied', async () => {
      mockPermission.value = 'denied'
      await renderPrompt()
      expect(
        screen.getByText(EN_TRANSLATIONS.notifications.permissionDenied, { exact: false })
      ).toBeInTheDocument()
    })

    it('shows the permission denied hint text', async () => {
      mockPermission.value = 'denied'
      await renderPrompt()
      expect(
        screen.getByText(EN_TRANSLATIONS.notifications.permissionDeniedHint)
      ).toBeInTheDocument()
    })

    it('does NOT show the enable button in denied state', async () => {
      mockPermission.value = 'denied'
      await renderPrompt()
      expect(
        screen.queryByText(EN_TRANSLATIONS.notifications.enableButton)
      ).not.toBeInTheDocument()
    })

    it('dismissing the denied state calls onDismiss', async () => {
      mockPermission.value = 'denied'
      const onDismiss = vi.fn()
      await renderPrompt(onDismiss)

      fireEvent.click(screen.getByLabelText('Dismiss'))
      expect(onDismiss).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Opt-in banner content
  // -------------------------------------------------------------------------
  describe('opt-in banner', () => {
    it('shows the prompt title', async () => {
      await renderPrompt()
      expect(screen.getByText(EN_TRANSLATIONS.notifications.promptTitle)).toBeInTheDocument()
    })

    it('shows the prompt body', async () => {
      await renderPrompt()
      expect(screen.getByText(EN_TRANSLATIONS.notifications.promptBody)).toBeInTheDocument()
    })

    it('shows enable button', async () => {
      await renderPrompt()
      expect(screen.getByText(EN_TRANSLATIONS.notifications.enableButton)).toBeInTheDocument()
    })

    it('shows maybe later button', async () => {
      await renderPrompt()
      expect(screen.getByText(EN_TRANSLATIONS.notifications.maybeLater)).toBeInTheDocument()
    })

    it('shows dismiss X button', async () => {
      await renderPrompt()
      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Enable button (subscribe flow)
  // -------------------------------------------------------------------------
  describe('enable button', () => {
    it('calls subscribe() when enable is clicked', async () => {
      await renderPrompt()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.enableButton))

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled()
      })
    })

    it('hides the banner after successful subscribe', async () => {
      mockSubscribe.mockResolvedValue(true)
      const { container } = await renderPrompt()

      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.enableButton))

      await waitFor(() => {
        expect(container).toBeEmptyDOMElement()
      })
    })

    it('calls onDismiss after successful subscribe', async () => {
      mockSubscribe.mockResolvedValue(true)
      const onDismiss = vi.fn()
      await renderPrompt(onDismiss)

      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.enableButton))

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalled()
      })
    })

    it('shows loading state while subscribe is in progress', async () => {
      mockIsLoading.value = true
      await renderPrompt()
      expect(screen.getByText('…')).toBeInTheDocument()
    })

    it('disables enable button while loading', async () => {
      mockIsLoading.value = true
      await renderPrompt()
      const enableButton = screen.getByText('…').closest('button')
      expect(enableButton).toBeDisabled()
    })

    it('closes banner when notification permission is already denied after subscribe attempt', async () => {
      // subscribe returns false but Notification.permission is denied
      mockSubscribe.mockResolvedValue(false)
      Object.defineProperty(globalThis, 'Notification', {
        value: { permission: 'denied', requestPermission: vi.fn() },
        writable: true,
        configurable: true,
      })

      const { container } = await renderPrompt()
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.enableButton))

      await waitFor(() => {
        expect(container).toBeEmptyDOMElement()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Maybe later (dismiss) flow
  // -------------------------------------------------------------------------
  describe('maybe later', () => {
    it('hides the banner when maybe later is clicked', async () => {
      const { container } = await renderPrompt()

      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.maybeLater))

      expect(container).toBeEmptyDOMElement()
    })

    it('sets localStorage cooldown when maybe later is clicked', async () => {
      await renderPrompt()

      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.maybeLater))

      const stored = localStorage.getItem(DISMISSED_KEY)
      expect(stored).not.toBeNull()
      const until = parseInt(stored!, 10)
      // Should be approximately 7 days from now
      expect(until).toBeGreaterThan(Date.now())
      expect(until).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000 + 1000)
    })

    it('calls onDismiss when maybe later is clicked', async () => {
      const onDismiss = vi.fn()
      await renderPrompt(onDismiss)

      fireEvent.click(screen.getByText(EN_TRANSLATIONS.notifications.maybeLater))

      expect(onDismiss).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // X dismiss button
  // -------------------------------------------------------------------------
  describe('X dismiss button', () => {
    it('hides the banner when X is clicked', async () => {
      const { container } = await renderPrompt()

      fireEvent.click(screen.getByLabelText('Dismiss'))

      expect(container).toBeEmptyDOMElement()
    })

    it('sets localStorage cooldown when X is clicked', async () => {
      await renderPrompt()

      fireEvent.click(screen.getByLabelText('Dismiss'))

      expect(localStorage.getItem(DISMISSED_KEY)).not.toBeNull()
    })

    it('calls onDismiss when X is clicked', async () => {
      const onDismiss = vi.fn()
      await renderPrompt(onDismiss)

      fireEvent.click(screen.getByLabelText('Dismiss'))

      expect(onDismiss).toHaveBeenCalled()
    })
  })
})
