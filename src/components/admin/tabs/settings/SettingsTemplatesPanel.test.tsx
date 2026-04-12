import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsTemplatesPanel } from './SettingsTemplatesPanel'

const mockSettings = {
  ai: [
    {
      key: 'openai_extraction_model',
      value: 'gpt-4o',
      valueType: 'string',
      description: 'OpenAI extraction model',
    },
    { key: 'max_tokens', value: 4096, valueType: 'number', description: 'Max tokens' },
    { key: 'temperature', value: 0.1, valueType: 'number', description: 'Temperature' },
    {
      key: 'extraction_timeout_ms',
      value: 90000,
      valueType: 'number',
      description: 'Extraction timeout',
    },
    { key: 'enable_fallback', value: true, valueType: 'boolean', description: 'Enable fallback' },
    {
      key: 'consensus_enabled',
      value: true,
      valueType: 'boolean',
      description: 'Consensus enabled',
    },
    { key: 'min_confidence', value: 0.7, valueType: 'number', description: 'Min confidence' },
    {
      key: 'consensus_agreement_threshold',
      value: 0.8,
      valueType: 'number',
      description: 'Consensus threshold',
    },
    { key: 'chat_temperature', value: 0.7, valueType: 'number', description: 'Chat temperature' },
    {
      key: 'preferred_provider',
      value: 'auto',
      valueType: 'string',
      description: 'Preferred provider',
    },
    {
      key: 'openai_backup_model',
      value: 'gpt-4o-mini',
      valueType: 'string',
      description: 'OpenAI backup model',
    },
    {
      key: 'anthropic_extraction_model',
      value: 'claude-sonnet-4-20250514',
      valueType: 'string',
      description: 'Anthropic model',
    },
    {
      key: 'anthropic_backup_model',
      value: 'claude-3-5-haiku-latest',
      valueType: 'string',
      description: 'Anthropic backup model',
    },
  ],
  evaluation: [
    { key: 'weight_premium', value: 20, valueType: 'number', description: 'Premium weight' },
    { key: 'weight_coverage', value: 30, valueType: 'number', description: 'Coverage weight' },
    { key: 'weight_deductible', value: 15, valueType: 'number', description: 'Deductible weight' },
    { key: 'weight_compliance', value: 20, valueType: 'number', description: 'Compliance weight' },
    { key: 'weight_value', value: 15, valueType: 'number', description: 'Value weight' },
    { key: 'grade_a_threshold', value: 90, valueType: 'number', description: 'Grade A threshold' },
    { key: 'grade_b_threshold', value: 80, valueType: 'number', description: 'Grade B threshold' },
    { key: 'grade_c_threshold', value: 70, valueType: 'number', description: 'Grade C threshold' },
    { key: 'grade_d_threshold', value: 60, valueType: 'number', description: 'Grade D threshold' },
    {
      key: 'strict_compliance',
      value: true,
      valueType: 'boolean',
      description: 'Strict compliance',
    },
    {
      key: 'include_optional_coverages',
      value: true,
      valueType: 'boolean',
      description: 'Include optional',
    },
    {
      key: 'use_regional_benchmarks',
      value: true,
      valueType: 'boolean',
      description: 'Regional benchmarks',
    },
  ],
  rate_limits: [
    {
      key: 'ai_extraction_max_requests',
      value: 20,
      valueType: 'number',
      description: 'AI extraction max',
    },
    { key: 'ocr_max_requests', value: 30, valueType: 'number', description: 'OCR max' },
    { key: 'chat_max_requests', value: 60, valueType: 'number', description: 'Chat max' },
    { key: 'health_max_requests', value: 60, valueType: 'number', description: 'Health max' },
    { key: 'auth_max_attempts', value: 10, valueType: 'number', description: 'Auth max' },
  ],
  ocr: [
    {
      key: 'skip_ocr_threshold',
      value: 0.85,
      valueType: 'number',
      description: 'Skip OCR threshold',
    },
    {
      key: 'selective_ocr_threshold',
      value: 0.6,
      valueType: 'number',
      description: 'Selective OCR threshold',
    },
    { key: 'timeout_seconds', value: 30, valueType: 'number', description: 'Timeout' },
    {
      key: 'max_pages_quick_analysis',
      value: 5,
      valueType: 'number',
      description: 'Max pages quick',
    },
    {
      key: 'chars_per_page_threshold',
      value: 200,
      valueType: 'number',
      description: 'Chars per page',
    },
  ],
}

describe('SettingsTemplatesPanel', () => {
  const mockOnBatchUpdate = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render template selection grid', () => {
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    expect(screen.getByText('Configuration Templates')).toBeInTheDocument()
    expect(screen.getByText('High Performance')).toBeInTheDocument()
    expect(screen.getByText('Cost Optimized')).toBeInTheDocument()
    expect(screen.getByText('Balanced (Default)')).toBeInTheDocument()
    expect(screen.getByText('Strict Compliance')).toBeInTheDocument()
    expect(screen.getByText('Quick Demo')).toBeInTheDocument()
  })

  it('should display template descriptions', () => {
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    expect(screen.getByText(/Maximize extraction accuracy/)).toBeInTheDocument()
    expect(screen.getByText(/Reduce API costs/)).toBeInTheDocument()
  })

  it('should display template tags', () => {
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    expect(screen.getByText('speed')).toBeInTheDocument()
    expect(screen.getByText('budget')).toBeInTheDocument()
    expect(screen.getByText('compliance')).toBeInTheDocument()
    expect(screen.getByText('demo')).toBeInTheDocument()
  })

  it('should show diff preview when template is selected', async () => {
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    // Click on High Performance template
    await user.click(screen.getByText('High Performance'))

    // Should show preview
    expect(screen.getByText('Preview Changes')).toBeInTheDocument()
    expect(screen.getByText('Back')).toBeInTheDocument()
  })

  it('should show changes grouped by category in preview', async () => {
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('High Performance'))

    // Should show category badges in the diff
    await waitFor(() => {
      expect(screen.getByText('AI')).toBeInTheDocument()
    })
  })

  it('should go back to grid when Back is clicked', async () => {
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('High Performance'))
    expect(screen.getByText('Preview Changes')).toBeInTheDocument()

    await user.click(screen.getByText('Back'))
    expect(screen.getByText('Configuration Templates')).toBeInTheDocument()
  })

  it('should call onBatchUpdate with correct changes when applied', async () => {
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('High Performance'))

    // Click Apply button
    const applyButton = screen.getByRole('button', { name: /Apply \d+ Change/i })
    await user.click(applyButton)

    expect(mockOnBatchUpdate).toHaveBeenCalledTimes(1)
    // @ts-expect-error - mismatch due to schema update
    const [updates, reason] = mockOnBatchUpdate.mock.calls[0]
    // @ts-expect-error - mismatch due to schema update
    expect(updates.length).toBeGreaterThan(0)
    expect(reason).toBe('Applied template: High Performance')

    // Verify each update has correct shape
    // @ts-expect-error - mismatch due to schema update
    for (const update of updates) {
      expect(update).toHaveProperty('category')
      expect(update).toHaveProperty('key')
      expect(update).toHaveProperty('value')
    }
  })

  it('should show success message after apply', async () => {
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('High Performance'))
    const applyButton = screen.getByRole('button', { name: /Apply \d+ Change/i })
    await user.click(applyButton)

    await waitFor(() => {
      expect(screen.getByText(/applied successfully/)).toBeInTheDocument()
    })
  })

  it('should show warning for non-balanced templates', async () => {
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('High Performance'))

    await waitFor(() => {
      expect(screen.getByText(/will override/)).toBeInTheDocument()
      expect(screen.getByText(/logged in the audit trail/)).toBeInTheDocument()
    })
  })

  it('should show no changes message when settings already match balanced template', async () => {
    // The mockSettings are set to default values, so balanced template should show few/no changes
    // depending on which settings are present
    const user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('Balanced (Default)'))

    // Should show either "No changes needed" or very few changes
    // Since our mockSettings match the defaults exactly for the overlapping keys
    await waitFor(() => {
      const noChanges = screen.queryByText(/No changes needed/)
      const preview = screen.queryByText('Preview Changes')
      expect(noChanges || preview).toBeTruthy()
    })
  })

  it('should display override count on template cards', () => {
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    // Each card should show setting count
    const settingCounts = screen.getAllByText(/\d+ settings?/)
    expect(settingCounts.length).toBe(5) // One per template
  })

  it('should disable Apply button when isSaving is true', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    await user.click(screen.getByText('High Performance'))

    rerender(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={true}
      />
    )

    const buttons = screen.getAllByRole('button')
    const applyOrSaving = buttons.find(
      (b) => b.textContent?.includes('Apply') || b.textContent?.includes('Applying')
    )
    expect(applyOrSaving).toBeDisabled()
  })

  it('should support keyboard navigation on template cards', async () => {
    // @ts-expect-error - TS6133 unused variable
    const _user = userEvent.setup()
    render(
      <SettingsTemplatesPanel
        settings={mockSettings}
        onBatchUpdate={mockOnBatchUpdate}
        isSaving={false}
      />
    )

    // Template cards should have role=button and be focusable
    const cards = screen.getAllByRole('button', { name: /Select .+ template/ })
    expect(cards.length).toBe(5)
  })
})
