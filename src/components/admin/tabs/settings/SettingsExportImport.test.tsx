/**
 * Settings Export/Import UI Tests
 *
 * Tests for the export and import functionality in the SettingsTab component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsTab } from '../SettingsTab'

// Mock adminFetch
const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// Mock the sub-panels to avoid their own fetch calls
vi.mock('./AISettingsPanel', () => ({
  AISettingsPanel: () => <div data-testid="ai-panel">AI Panel</div>,
}))
vi.mock('./EvaluationSettingsPanel', () => ({
  EvaluationSettingsPanel: () => <div data-testid="eval-panel">Eval Panel</div>,
}))
vi.mock('./RateLimitsPanel', () => ({
  RateLimitsPanel: () => <div data-testid="rate-panel">Rate Panel</div>,
}))
vi.mock('./OCRSettingsPanel', () => ({
  OCRSettingsPanel: () => <div data-testid="ocr-panel">OCR Panel</div>,
}))
vi.mock('./FeatureFlagsPanel', () => ({
  FeatureFlagsPanel: () => <div data-testid="flags-panel">Flags Panel</div>,
}))
vi.mock('./SettingsHistoryPanel', () => ({
  SettingsHistoryPanel: () => <div data-testid="history-panel">History Panel</div>,
}))

const mockSettingsResponse = (category: string) => ({
  ok: true,
  json: async () => ({
    success: true,
    data: {
      category,
      settings: [
        { key: 'test_key', value: 'test_value', valueType: 'string', description: 'Test' },
      ],
    },
  }),
})

const mockExportData = {
  version: 1,
  exportedAt: '2026-02-06T10:00:00.000Z',
  exportedBy: 'admin@test.com',
  settings: {
    ai: [{ key: 'temperature', value: 0.1, valueType: 'number' }],
    evaluation: [{ key: 'weight_premium', value: 20, valueType: 'number' }],
  },
  featureFlags: [
    { key: 'use_db_config', enabled: true, rolloutPercentage: 100 },
  ],
  regionalFactors: [
    { regionCode: 'marmara', policyType: 'all', riskFactor: 1.15 },
  ],
  providers: [],
  benchmarks: [],
}

function createMockFile(content: string, name: string) {
  const file = new File([content], name, { type: 'application/json' })
  // jsdom File.text() may not work reliably, so polyfill it
  if (!file.text || typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
    })
  }
  return file
}

describe('SettingsTab - Export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFetch.mockImplementation((url: string) => {
      if (url.includes('/export')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: mockExportData }),
        })
      }
      const category = url.split('/').pop()
      return Promise.resolve(mockSettingsResponse(category || 'ai'))
    })
  })

  it('should render Export button', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument()
    })
  })

  it('should render Import button', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })
  })

  it('should have a hidden file input for import', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveClass('hidden')
    })
  })

  it('should only accept .json files for import', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toHaveAttribute('accept', '.json')
    })
  })

  it('should call export API when export button is clicked', async () => {
    // Mock URL methods
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const mockRevokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = mockCreateObjectURL
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL

    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Export'))

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith('/api/admin/settings/export')
    })
  })
})

describe('SettingsTab - Import Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFetch.mockImplementation((url: string) => {
      if (url.includes('/import')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              results: {
                settings: { updated: 2, skipped: 0, errors: [] },
                featureFlags: { updated: 1, skipped: 0, errors: [] },
                regionalFactors: { updated: 1, skipped: 0, errors: [] },
              },
              summary: { totalUpdated: 4, totalSkipped: 0, totalErrors: 0 },
            },
          }),
        })
      }
      const category = url.split('/').pop()
      return Promise.resolve(mockSettingsResponse(category || 'ai'))
    })
  })

  it('should open import dialog when valid file is selected', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('should show file info in import dialog', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('config.json')).toBeInTheDocument()
      expect(screen.getByText('admin@test.com')).toBeInTheDocument()
      expect(screen.getByText('v1')).toBeInTheDocument()
    })
  })

  it('should show contents preview in import dialog', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Contents')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument() // 2 setting categories
      expect(screen.getByText(/setting categories/)).toBeInTheDocument()
    })
  })

  it('should have merge and overwrite mode options', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Merge')).toBeInTheDocument()
      expect(screen.getByText('Overwrite')).toBeInTheDocument()
    })
  })

  it('should show warning when overwrite mode is selected', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Overwrite')).toBeInTheDocument()
    })

    const overwriteRadio = screen.getByDisplayValue('overwrite')
    fireEvent.click(overwriteRadio)

    await waitFor(() => {
      expect(screen.getByText(/Overwrite mode will replace current values/)).toBeInTheDocument()
    })
  })

  it('should close dialog when Cancel is clicked', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('should call import API with merge mode by default', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click the Import Configuration button in the dialog footer
    const importButtons = screen.getAllByText(/Import Configuration/)
    fireEvent.click(importButtons[importButtons.length - 1])

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        '/api/admin/settings/import',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mode":"merge"'),
        })
      )
    })
  })

  it('should show import results after successful import', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify(mockExportData), 'config.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const importButtons = screen.getAllByText(/Import Configuration/)
    fireEvent.click(importButtons[importButtons.length - 1])

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument() // totalUpdated
      expect(screen.getByText('settings updated')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })
  })

  it('should show error for invalid JSON file', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile('not valid json', 'bad.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/Failed to parse configuration file/)).toBeInTheDocument()
    })
  })

  it('should show error for file missing version', async () => {
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile(JSON.stringify({ settings: {} }), 'bad.json')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/Invalid configuration file/)).toBeInTheDocument()
    })
  })
})
