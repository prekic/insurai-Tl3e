/**
 * EvaluationSettingsPanel Component Tests
 *
 * Tests for the evaluation settings panel including
 * scoring weights and grade thresholds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvaluationSettingsPanel } from './EvaluationSettingsPanel'
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
  { key: 'weight_premium', value: 20, valueType: 'number', description: 'Premium weight' },
  { key: 'weight_coverage', value: 30, valueType: 'number', description: 'Coverage weight' },
  { key: 'weight_deductible', value: 15, valueType: 'number', description: 'Deductible weight' },
  { key: 'weight_compliance', value: 20, valueType: 'number', description: 'Compliance weight' },
  { key: 'weight_value', value: 15, valueType: 'number', description: 'Value weight' },
  { key: 'grade_a_threshold', value: 90, valueType: 'number', description: 'Grade A threshold' },
  { key: 'grade_b_threshold', value: 80, valueType: 'number', description: 'Grade B threshold' },
  { key: 'grade_c_threshold', value: 70, valueType: 'number', description: 'Grade C threshold' },
  { key: 'grade_d_threshold', value: 60, valueType: 'number', description: 'Grade D threshold' },
]

describe('EvaluationSettingsPanel', () => {
  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the Scoring Weights section header', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Scoring Weights')).toBeInTheDocument()
    })

    it('should render the Grade Thresholds section', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Grade Thresholds')).toBeInTheDocument()
    })

    it('should display weight categories', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText(/premium/i)).toBeInTheDocument()
      expect(screen.getByText(/coverage/i)).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show loading indicator when isLoading is true', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={true}
          isSaving={false}
        />
      )

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })

  describe('Weight Values Display', () => {
    it('should display weight values as percentages', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Weights are displayed with % suffix - multiple elements may show same value
      expect(screen.getAllByText('20%').length).toBeGreaterThan(0)
      expect(screen.getAllByText('30%').length).toBeGreaterThan(0)
      expect(screen.getAllByText('15%').length).toBeGreaterThan(0)
    })
  })

  describe('Grade Thresholds Display', () => {
    it('should display grade letters', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Grade letters appear in the scale visualization and/or threshold cards
      expect(screen.getAllByText('A').length).toBeGreaterThan(0)
      expect(screen.getAllByText('B').length).toBeGreaterThan(0)
      expect(screen.getAllByText('C').length).toBeGreaterThan(0)
      expect(screen.getAllByText('D').length).toBeGreaterThan(0)
      expect(screen.getAllByText('F').length).toBeGreaterThan(0)
    })

    it('should display grade threshold values', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Grade A threshold (90) may appear in multiple places
      expect(screen.getAllByText('90').length).toBeGreaterThan(0)
    })
  })

  describe('Edit Mode', () => {
    it('should show Edit Weights button', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByRole('button', { name: /edit weights/i })).toBeInTheDocument()
    })

    it('should show Edit Thresholds button', () => {
      render(
        <EvaluationSettingsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByRole('button', { name: /edit thresholds/i })).toBeInTheDocument()
    })
  })
})

describe('EvaluationSettingsPanel - Empty Settings', () => {
  const mockOnUpdate = vi.fn()

  it('should handle empty settings gracefully', () => {
    render(
      <EvaluationSettingsPanel
        settings={[]}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
      />
    )

    // Should show empty state message
    expect(screen.getByText(/No evaluation settings found/i)).toBeInTheDocument()
  })
})

describe('EvaluationSettingsPanel - Weight Total Validation', () => {
  const mockOnUpdate = vi.fn()

  it('should show that weights sum to 100%', () => {
    render(
      <EvaluationSettingsPanel
        settings={createMockSettings()}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
      />
    )

    // The panel should show that weights total 100% (multiple elements possible)
    expect(screen.getAllByText(/100%|total/i).length).toBeGreaterThan(0)
  })
})
