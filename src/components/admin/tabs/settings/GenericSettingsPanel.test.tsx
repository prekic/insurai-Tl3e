/**
 * GenericSettingsPanel Component Tests
 *
 * Tests for JSON validation, save blocking, reset, and error display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GenericSettingsPanel } from './GenericSettingsPanel'
import type { SettingValue } from '../SettingsTab'

const createMockSettings = (): SettingValue[] => [
  {
    key: 'server_cache_ttl_ms',
    value: 21600000,
    valueType: 'number',
    description: 'Server cache TTL',
  },
  {
    key: 'supported_currencies',
    value: '["TRY","USD","EUR"]',
    valueType: 'string',
    description: 'Supported currencies',
  },
  {
    key: 'fallback_rates',
    value: '{"TRYUSD":0.031,"TRYEUR":0.028}',
    valueType: 'string',
    description: 'Fallback rates',
  },
  { key: 'api_timeout_ms', value: 5000, valueType: 'number', description: 'API timeout' },
]

describe('GenericSettingsPanel', () => {
  const mockOnUpdate = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders settings with labels', () => {
    render(
      <GenericSettingsPanel
        settings={createMockSettings()}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
        title="FX Settings"
        description="Configure FX rates"
      />
    )
    expect(screen.getByText('FX Settings')).toBeInTheDocument()
    expect(screen.getByText('Server Cache TTL (ms)')).toBeInTheDocument()
    expect(screen.getByText('Supported Currencies (JSON)')).toBeInTheDocument()
  })

  it('renders loading skeleton when isLoading', () => {
    const { container } = render(
      <GenericSettingsPanel
        settings={[]}
        onUpdate={mockOnUpdate}
        isLoading={true}
        isSaving={false}
        title="Test"
        description="Test"
      />
    )
    // SettingsSkeleton renders animate-pulse elements
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders empty state when no settings', () => {
    render(
      <GenericSettingsPanel
        settings={[]}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
        title="Test"
        description="Test"
      />
    )
    expect(screen.getByText('No settings found for this category.')).toBeInTheDocument()
  })

  describe('JSON Validation', () => {
    it('shows error for invalid JSON array', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      // The supported_currencies field renders as a textarea since its value starts with [
      const textareas = screen.getAllByRole('textbox')
      // Find the textarea with JSON array content
      const jsonTextarea = textareas.find((el) => (el as HTMLTextAreaElement).value.startsWith('['))
      expect(jsonTextarea).toBeDefined()

      fireEvent.change(jsonTextarea!, { target: { value: '[invalid json' } })

      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument()
    })

    it('shows error for invalid JSON object', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) => (el as HTMLTextAreaElement).value.startsWith('{'))
      expect(jsonTextarea).toBeDefined()

      fireEvent.change(jsonTextarea!, { target: { value: '{"broken":' } })

      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument()
    })

    it('clears error when JSON becomes valid', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) =>
        (el as HTMLTextAreaElement).value.startsWith('[')
      )!

      // First make it invalid
      fireEvent.change(jsonTextarea, { target: { value: '[bad' } })
      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument()

      // Then fix it
      fireEvent.change(jsonTextarea, { target: { value: '["TRY","USD"]' } })
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument()
    })

    it('does not validate non-JSON fields', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      // Find the numeric input (server_cache_ttl_ms)
      const inputs = screen.getAllByRole('textbox')
      const numericInput = inputs.find((el) => (el as HTMLInputElement).value === '21600000')
      expect(numericInput).toBeDefined()

      fireEvent.change(numericInput!, { target: { value: 'not a number' } })

      // No JSON validation error should appear
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument()
    })

    it('disables Save button when JSON is invalid', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) =>
        (el as HTMLTextAreaElement).value.startsWith('[')
      )!

      // Make dirty + invalid
      fireEvent.change(jsonTextarea, { target: { value: '[invalid' } })

      // The Save button should be disabled
      const saveButtons = screen.getAllByRole('button', { name: /save/i })
      const saveBtn = saveButtons.find((btn) => !btn.closest('[style*="display: none"]'))
      expect(saveBtn).toBeDisabled()
    })

    it('does not call onUpdate when Save is clicked with invalid JSON', async () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) =>
        (el as HTMLTextAreaElement).value.startsWith('[')
      )!

      fireEvent.change(jsonTextarea, { target: { value: '[invalid' } })

      // Even if we somehow click save, onUpdate should not be called
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('allows save when JSON is valid and dirty', async () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) =>
        (el as HTMLTextAreaElement).value.startsWith('[')
      )!

      // Change to valid different JSON
      fireEvent.change(jsonTextarea, { target: { value: '["TRY","USD","GBP"]' } })

      // Find the enabled Save button
      const saveButtons = screen.getAllByRole('button', { name: /save/i })
      const enabledSaveBtn = saveButtons.find((btn) => !(btn as HTMLButtonElement).disabled)
      expect(enabledSaveBtn).toBeDefined()

      fireEvent.click(enabledSaveBtn!)
      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledWith('supported_currencies', ['TRY', 'USD', 'GBP'])
      })
    })

    it('clears validation error on reset', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) =>
        (el as HTMLTextAreaElement).value.startsWith('[')
      )!

      // Make invalid
      fireEvent.change(jsonTextarea, { target: { value: '[broken' } })
      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument()

      // Click reset button (RotateCcw icon)
      const resetButtons = screen.getAllByRole('button')
      // Reset button is the one right before Save — find it by the order
      const resetBtn = resetButtons.find((btn) => {
        const svg = btn.querySelector('svg')
        return svg && !btn.textContent?.includes('Save')
      })
      expect(resetBtn).toBeDefined()
      fireEvent.click(resetBtn!)

      // Error should be cleared
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument()
    })

    it('applies red border to textarea with invalid JSON', () => {
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
        />
      )
      const textareas = screen.getAllByRole('textbox')
      const jsonTextarea = textareas.find((el) =>
        (el as HTMLTextAreaElement).value.startsWith('[')
      )!

      // Initially no red border
      expect(jsonTextarea.className).toContain('border-gray-300')
      expect(jsonTextarea.className).not.toContain('border-red-400')

      // Make invalid
      fireEvent.change(jsonTextarea, { target: { value: '[bad' } })

      // Should have red border
      expect(jsonTextarea.className).toContain('border-red-400')
      expect(jsonTextarea.className).not.toContain('border-gray-300')
    })
  })

  describe('Groups', () => {
    it('renders settings in groups when groups prop is provided', () => {
      const groups = [
        {
          title: 'Cache Settings',
          description: 'Cache TTL values',
          keys: ['server_cache_ttl_ms', 'api_timeout_ms'],
        },
        {
          title: 'Currency Config',
          description: 'Currency settings',
          keys: ['supported_currencies', 'fallback_rates'],
        },
      ]
      render(
        <GenericSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
          title="FX"
          description="FX"
          groups={groups}
        />
      )
      expect(screen.getByText('Cache Settings')).toBeInTheDocument()
      expect(screen.getByText('Currency Config')).toBeInTheDocument()
    })
  })
})
