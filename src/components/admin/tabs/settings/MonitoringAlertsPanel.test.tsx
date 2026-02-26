import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MonitoringAlertsPanel } from './MonitoringAlertsPanel'

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: {}, locale: 'en', isLoading: false }),
}))

vi.mock('@/lib/admin/api', () => ({
  adminFetch: vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ success: true, data: { lastFired: {} } }) })
  ),
}))

const sampleSettings = [
  { key: 'error_rate_warning_threshold', value: '0.05', valueType: 'number', description: '' },
  { key: 'error_rate_critical_threshold', value: '0.20', valueType: 'number', description: '' },
  { key: 'avg_latency_critical_ms', value: '12000', valueType: 'number', description: '' },
  { key: 'alert_cooldown_minutes', value: '15', valueType: 'number', description: '' },
  { key: 'enable_email_alerts', value: 'false', valueType: 'boolean', description: '' },
  { key: 'alert_email_addresses', value: '', valueType: 'string', description: '' },
]

describe('MonitoringAlertsPanel', () => {
  const onUpdate = vi.fn(() => Promise.resolve())
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeleton when isLoading is true', () => {
    render(
      <MonitoringAlertsPanel settings={[]} onUpdate={onUpdate} isLoading={true} isSaving={false} />
    )
    expect(screen.queryByText('Alert Status')).toBeNull()
  })

  it('renders empty state when settings array is empty', async () => {
    render(
      <MonitoringAlertsPanel settings={[]} onUpdate={onUpdate} isLoading={false} isSaving={false} />
    )
    await waitFor(() =>
      expect(screen.getByText('No Monitoring Settings Found')).toBeInTheDocument()
    )
  })

  it('renders threshold inputs with correct values from settings', async () => {
    render(
      <MonitoringAlertsPanel
        settings={sampleSettings}
        onUpdate={onUpdate}
        isLoading={false}
        isSaving={false}
      />
    )
    await waitFor(() => expect(screen.getByText('Alert Status')).toBeInTheDocument())
    expect(screen.getByText('Error Rate Thresholds')).toBeInTheDocument()
    expect(screen.getByText('Email Notifications')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.05')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.20')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
  })

  it('validation rejects warning >= critical', async () => {
    render(
      <MonitoringAlertsPanel
        settings={sampleSettings}
        onUpdate={onUpdate}
        isLoading={false}
        isSaving={false}
      />
    )
    const warningInput = screen.getByDisplayValue('0.05')
    fireEvent.change(warningInput, { target: { value: '0.50' } })
    await waitFor(() =>
      expect(screen.getByText('Warning must be less than critical')).toBeInTheDocument()
    )
  })

  it('save button calls onUpdate for changed values', async () => {
    render(
      <MonitoringAlertsPanel
        settings={sampleSettings}
        onUpdate={onUpdate}
        isLoading={false}
        isSaving={false}
      />
    )
    const cooldownInput = screen.getByDisplayValue('15')
    fireEvent.change(cooldownInput, { target: { value: '30' } })
    const saveBtn = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveBtn)
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'alert_cooldown_minutes',
        '30',
        'Updated monitoring alert settings'
      )
    )
  })

  it('email textarea hidden when toggle is off', async () => {
    render(
      <MonitoringAlertsPanel
        settings={sampleSettings}
        onUpdate={onUpdate}
        isLoading={false}
        isSaving={false}
      />
    )
    await waitFor(() => expect(screen.getByText('Email Notifications')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('admin@example.com, ops@example.com')).toBeNull()
    const toggle = screen.getByRole('checkbox')
    fireEvent.click(toggle)
    expect(screen.getByPlaceholderText('admin@example.com, ops@example.com')).toBeInTheDocument()
  })
})
