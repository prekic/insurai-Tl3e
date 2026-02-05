/**
 * AISettingsPanel Component Tests
 *
 * Tests for the AI settings panel including
 * model selection and temperature controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AISettingsPanel } from './AISettingsPanel'
import type { SettingValue } from '../SettingsTab'

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Create mock settings as array
const createMockSettings = (): SettingValue[] => [
  { key: 'openai_extraction_model', value: 'gpt-4o', valueType: 'string', description: 'OpenAI extraction model' },
  { key: 'openai_backup_model', value: 'gpt-4o-mini', valueType: 'string', description: 'OpenAI backup model' },
  { key: 'anthropic_extraction_model', value: 'claude-sonnet-4-20250514', valueType: 'string', description: 'Anthropic extraction model' },
  { key: 'anthropic_backup_model', value: 'claude-3-5-haiku-20241022', valueType: 'string', description: 'Anthropic backup model' },
  { key: 'temperature', value: 0.1, valueType: 'number', description: 'Extraction temperature' },
  { key: 'chat_temperature', value: 0.7, valueType: 'number', description: 'Chat temperature' },
  { key: 'max_tokens', value: 4096, valueType: 'number', description: 'Max tokens' },
  { key: 'extraction_timeout_ms', value: 90000, valueType: 'number', description: 'Extraction timeout' },
  { key: 'preferred_provider', value: 'auto', valueType: 'string', description: 'Preferred provider' },
  { key: 'enable_fallback', value: true, valueType: 'boolean', description: 'Enable fallback' },
  { key: 'consensus_enabled', value: true, valueType: 'boolean', description: 'Consensus enabled' },
  { key: 'consensus_agreement_threshold', value: 0.8, valueType: 'number', description: 'Consensus threshold' },
]

describe('AISettingsPanel', () => {
  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the AI Models section header', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('AI Models')).toBeInTheDocument()
    })

    it('should render the Model Parameters section', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Model Parameters')).toBeInTheDocument()
    })

    it('should render the Fallback & Consensus section', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Fallback & Consensus')).toBeInTheDocument()
    })

    it('should display current model values', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show loading indicator when isLoading is true', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={true}
          isSaving={false}
        />
      )

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })

  describe('Edit Mode', () => {
    it('should show Change button for model settings', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      const changeButtons = screen.getAllByRole('button', { name: /change/i })
      expect(changeButtons.length).toBeGreaterThan(0)
    })

    it('should show Adjust button for temperature settings', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      const adjustButtons = screen.getAllByRole('button', { name: /adjust/i })
      expect(adjustButtons.length).toBeGreaterThan(0)
    })
  })

  describe('Temperature Settings', () => {
    it('should display extraction temperature value', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('0.1')).toBeInTheDocument()
    })

    it('should display chat temperature value', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('0.7')).toBeInTheDocument()
    })
  })

  describe('Timeout Settings', () => {
    it('should display timeout value in seconds', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // 90000ms = 90s
      expect(screen.getByText(/90/)).toBeInTheDocument()
    })
  })

  describe('Provider Settings', () => {
    it('should show preferred provider setting', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText(/auto/i)).toBeInTheDocument()
    })

    it('should show fallback settings', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Multiple elements with fallback text expected
      expect(screen.getAllByText(/fallback/i).length).toBeGreaterThan(0)
    })
  })

  describe('Consensus Settings', () => {
    it('should show consensus settings', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Multiple elements with consensus text expected
      expect(screen.getAllByText(/consensus/i).length).toBeGreaterThan(0)
    })

    it('should show consensus threshold value', () => {
      render(
        <AISettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText(/0.8|80%/)).toBeInTheDocument()
    })
  })
})

describe('AISettingsPanel - Empty Settings', () => {
  const mockOnUpdate = vi.fn()

  it('should handle empty settings gracefully', () => {
    render(
      <AISettingsPanel
        settings={[]}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
      />
    )

    // Should show empty state message
    expect(screen.getByText(/No AI settings found/i)).toBeInTheDocument()
  })
})
