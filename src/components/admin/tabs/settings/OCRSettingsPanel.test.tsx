/**
 * OCRSettingsPanel Component Tests
 *
 * Tests for the OCR settings panel including
 * confidence thresholds and processing options.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OCRSettingsPanel } from './OCRSettingsPanel'
import type { SettingValue } from '../SettingsTab'

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Create mock settings as array - keys must match SETTING_GROUPS in the component
const createMockSettings = (): SettingValue[] => [
  // Confidence group
  { key: 'min_confidence_threshold', value: 0.7, valueType: 'number', description: 'Min confidence threshold' },
  { key: 'high_confidence_threshold', value: 0.9, valueType: 'number', description: 'High confidence threshold' },
  { key: 'char_confidence_threshold', value: 0.8, valueType: 'number', description: 'Char confidence threshold' },
  { key: 'word_confidence_threshold', value: 0.85, valueType: 'number', description: 'Word confidence threshold' },
  // Density group
  { key: 'min_chars_per_page', value: 200, valueType: 'number', description: 'Min chars per page' },
  { key: 'skip_ocr_chars_threshold', value: 0.7, valueType: 'number', description: 'Skip OCR chars threshold' },
  { key: 'selective_ocr_chars_threshold', value: 0.4, valueType: 'number', description: 'Selective OCR chars threshold' },
  // Quality group
  { key: 'garbage_ratio_threshold', value: 0.3, valueType: 'number', description: 'Garbage ratio threshold' },
  { key: 'min_insurance_terms_ratio', value: 0.1, valueType: 'number', description: 'Min insurance terms ratio' },
  { key: 'encoding_issue_threshold', value: 0.2, valueType: 'number', description: 'Encoding issue threshold' },
  // Processing group
  { key: 'max_pages_per_request', value: 15, valueType: 'number', description: 'Max pages per request' },
  { key: 'enable_page_splitting', value: true, valueType: 'boolean', description: 'Enable page splitting' },
  { key: 'prefer_document_ai', value: true, valueType: 'boolean', description: 'Prefer Document AI' },
]

describe('OCRSettingsPanel', () => {
  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the OCR Decision Flow section', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('OCR Decision Flow')).toBeInTheDocument()
    })

    it('should render the Confidence Thresholds section', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Confidence Thresholds')).toBeInTheDocument()
    })

    it('should render the Text Density Analysis section', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Text Density Analysis')).toBeInTheDocument()
    })

    it('should render the Quality Settings section', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Quality Settings')).toBeInTheDocument()
    })

    it('should render the Processing Options section', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Processing Options')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show loading indicator when isLoading is true', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={true}
          isSaving={false}
        />
      )

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })

  describe('Decision Flow Diagram', () => {
    it('should show OCR decision paths', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // The diagram shows decision flow
      expect(screen.getByText('OCR Decision Flow')).toBeInTheDocument()
    })
  })

  describe('Confidence Threshold Values', () => {
    it('should display confidence thresholds', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Values from mock data
      expect(screen.getAllByText(/0\.7|0\.8|0\.9/).length).toBeGreaterThan(0)
    })
  })

  describe('Text Density Settings', () => {
    it('should display min chars per page', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getAllByText(/200/).length).toBeGreaterThan(0)
    })
  })

  describe('Processing Options', () => {
    it('should show page splitting toggle', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Multiple matches: label and description
      expect(screen.getAllByText(/Enable Page Splitting/i).length).toBeGreaterThan(0)
    })

    it('should show Document AI preference toggle', () => {
      render(
        <OCRSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getAllByText(/Prefer Document Ai/i).length).toBeGreaterThan(0)
    })
  })

  describe('Edit Mode', () => {
    it('should show adjust buttons for threshold settings', () => {
      render(
        <OCRSettingsPanel
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
})

describe('OCRSettingsPanel - Empty Settings', () => {
  const mockOnUpdate = vi.fn()

  it('should handle empty settings gracefully', () => {
    render(
      <OCRSettingsPanel
        settings={[]}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
      />
    )

    // Should show empty state message
    expect(screen.getByText(/No OCR settings found/i)).toBeInTheDocument()
  })
})
