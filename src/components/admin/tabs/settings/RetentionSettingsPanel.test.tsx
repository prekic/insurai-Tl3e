import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RetentionSettingsPanel } from './RetentionSettingsPanel'

const mockAdminFetch = vi.fn()
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: {}, locale: 'en', isLoading: false }),
}))
vi.mock('@/lib/admin/api', () => ({ adminFetch: (...args: unknown[]) => mockAdminFetch(...args) }))

const sampleSettings = [
  { key: 'processing_log_retention_days', value: '90', valueType: 'number', description: '' },
  { key: 'extraction_metrics_retention_days', value: '30', valueType: 'number', description: '' },
]
const noop = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RetentionSettingsPanel', () => {
  it('renders loading skeleton when isLoading is true', () => {
    render(
      <RetentionSettingsPanel settings={[]} onUpdate={noop} isLoading={true} isSaving={false} />
    )
    expect(screen.getByLabelText('Loading settings')).toBeInTheDocument()
  })

  it('renders empty state when settings array is empty', () => {
    render(
      <RetentionSettingsPanel settings={[]} onUpdate={noop} isLoading={false} isSaving={false} />
    )
    expect(screen.getByText('No Retention Settings Found')).toBeInTheDocument()
  })

  it('renders two retention inputs with correct values', () => {
    render(
      <RetentionSettingsPanel
        settings={sampleSettings}
        onUpdate={noop}
        isLoading={false}
        isSaving={false}
      />
    )
    expect(screen.getByText('Data Retention Periods')).toBeInTheDocument()
    expect(screen.getByText('Manual Cleanup')).toBeInTheDocument()
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveValue(90)
    expect(inputs[1]).toHaveValue(30)
  })

  it('validation rejects 0 or values > 365', async () => {
    render(
      <RetentionSettingsPanel
        settings={sampleSettings}
        onUpdate={noop}
        isLoading={false}
        isSaving={false}
      />
    )
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '0' } })
    fireEvent.change(inputs[1], { target: { value: '999' } })
    expect(screen.getByText('Processing log retention must be 1-365 days')).toBeInTheDocument()
    expect(screen.getByText('Extraction metrics retention must be 1-365 days')).toBeInTheDocument()
  })

  it('manual cleanup button calls POST cleanup endpoint', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, deleted: 5 }),
    })
    render(
      <RetentionSettingsPanel
        settings={sampleSettings}
        onUpdate={noop}
        isLoading={false}
        isSaving={false}
      />
    )
    fireEvent.click(screen.getByText('Run Cleanup Now'))
    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith('/api/admin/processing-logs/cleanup?daysOld=90', {
        method: 'POST',
      })
    )
    await waitFor(() => expect(screen.getByText(/5 old logs removed/)).toBeInTheDocument())
  })

  it('save button calls onUpdate for changed values', async () => {
    render(
      <RetentionSettingsPanel
        settings={sampleSettings}
        onUpdate={noop}
        isLoading={false}
        isSaving={false}
      />
    )
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '60' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(noop).toHaveBeenCalledWith(
        'processing_log_retention_days',
        '60',
        'Updated retention settings'
      )
    )
  })
})
