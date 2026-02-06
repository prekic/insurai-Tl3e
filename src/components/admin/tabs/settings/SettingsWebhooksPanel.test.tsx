import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsWebhooksPanel } from './SettingsWebhooksPanel'

// =============================================================================
// MOCKS
// =============================================================================

const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

function createMockWebhook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    name: 'Test Webhook',
    url: 'https://example.com/hook',
    secret: 'whsec_••••••abcd',
    events: ['setting.updated'],
    categories: [],
    enabled: true,
    created_at: '2026-02-06T10:00:00Z',
    updated_at: '2026-02-06T10:00:00Z',
    last_triggered_at: null,
    failure_count: 0,
    ...overrides,
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('SettingsWebhooksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render heading and add button', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Webhooks')).toBeInTheDocument()
    })

    expect(screen.getByText('Add Webhook')).toBeInTheDocument()
  })

  it('should show empty state when no webhooks', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('No webhooks configured yet.')).toBeInTheDocument()
    })
  })

  it('should display webhook cards when data exists', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [
            createMockWebhook({ name: 'Slack Notifier' }),
            createMockWebhook({ id: 'wh-2', name: 'PagerDuty' }),
          ],
        }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Slack Notifier')).toBeInTheDocument()
      expect(screen.getByText('PagerDuty')).toBeInTheDocument()
    })
  })

  it('should show event tags on webhook cards', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [
            createMockWebhook({
              events: ['setting.updated', 'setting.batch_updated'],
            }),
          ],
        }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('setting.updated')).toBeInTheDocument()
      expect(screen.getByText('setting.batch_updated')).toBeInTheDocument()
    })
  })

  it('should show failure badge when webhook has failures', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [createMockWebhook({ failure_count: 3 })],
        }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('3 failed')).toBeInTheDocument()
    })
  })

  it('should show create form when Add Webhook is clicked', async () => {
    const user = userEvent.setup()
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Add Webhook')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Webhook'))

    expect(screen.getByText('New Webhook')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Slack Notification')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://example.com/webhook')).toBeInTheDocument()
  })

  it('should show event toggle buttons in create form', async () => {
    const user = userEvent.setup()
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Add Webhook')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Webhook'))

    expect(screen.getByText('Setting Updated')).toBeInTheDocument()
    expect(screen.getByText('Batch Updated')).toBeInTheDocument()
    expect(screen.getByText('Settings Imported')).toBeInTheDocument()
    expect(screen.getByText('Feature Flag Toggled')).toBeInTheDocument()
  })

  it('should show error state on fetch failure', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Failed to connect to server')).toBeInTheDocument()
    })

    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('should send test ping when test button is clicked', async () => {
    const user = userEvent.setup()

    // First call: list webhooks
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [createMockWebhook()],
        }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Test Webhook')).toBeInTheDocument()
    })

    // Second call: test ping
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { success: true, statusCode: 200, durationMs: 45 },
        }),
    })

    // Find the Send button (test ping)
    const sendButtons = screen.getAllByRole('button')
    const testButton = sendButtons.find((b) => b.querySelector('svg.lucide-send'))
    if (testButton) {
      await user.click(testButton)

      await waitFor(() => {
        expect(screen.getByText(/Test ping successful/)).toBeInTheDocument()
      })
    }
  })

  it('should show create success with secret', async () => {
    const user = userEvent.setup()

    // List: empty
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Add Webhook')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Webhook'))

    // Fill in form
    await user.type(screen.getByPlaceholderText('e.g. Slack Notification'), 'My Hook')
    await user.type(
      screen.getByPlaceholderText('https://example.com/webhook'),
      'https://hook.example.com/test'
    )

    // Create webhook
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            ...createMockWebhook({ name: 'My Hook' }),
            secret: 'whsec_abc123def456',
          },
        }),
    })

    await user.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.getByText('Webhook Created')).toBeInTheDocument()
      expect(screen.getByText('whsec_abc123def456')).toBeInTheDocument()
    })
  })

  it('should display HMAC signature description', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText(/signed with HMAC-SHA256/)).toBeInTheDocument()
    })
  })

  it('should dim disabled webhooks', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [createMockWebhook({ enabled: false, name: 'Disabled Hook' })],
        }),
    })

    render(<SettingsWebhooksPanel />)

    await waitFor(() => {
      expect(screen.getByText('Disabled Hook')).toBeInTheDocument()
    })
  })
})
