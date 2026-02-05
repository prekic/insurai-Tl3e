/**
 * RateLimitsPanel Component Tests
 *
 * Tests for the rate limits panel including
 * endpoint configuration and limit controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RateLimitsPanel } from './RateLimitsPanel'
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
  { key: 'chat_requests_per_hour', value: 60, valueType: 'number', description: 'Chat requests per hour' },
  { key: 'chat_window_ms', value: 3600000, valueType: 'number', description: 'Chat window' },
  { key: 'extraction_requests_per_hour', value: 20, valueType: 'number', description: 'Extraction requests per hour' },
  { key: 'extraction_window_ms', value: 3600000, valueType: 'number', description: 'Extraction window' },
  { key: 'ocr_requests_per_hour', value: 30, valueType: 'number', description: 'OCR requests per hour' },
  { key: 'ocr_window_ms', value: 3600000, valueType: 'number', description: 'OCR window' },
  { key: 'health_requests_per_minute', value: 60, valueType: 'number', description: 'Health requests per minute' },
  { key: 'health_window_ms', value: 60000, valueType: 'number', description: 'Health window' },
]

describe('RateLimitsPanel', () => {
  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the panel header', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      expect(screen.getByText('Rate Limiting Overview')).toBeInTheDocument()
    })

    it('should render endpoint sections', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Endpoint titles appear in both overview grid and detailed cards
      expect(screen.getAllByText('Chat Endpoint').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Extraction Endpoints').length).toBeGreaterThan(0)
      expect(screen.getAllByText('OCR Endpoint').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Health Endpoint').length).toBeGreaterThan(0)
    })
  })

  describe('Loading State', () => {
    it('should show loading indicator when isLoading is true', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={true}
          isSaving={false}
        />
      )

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })

  describe('Rate Limit Values', () => {
    it('should display chat rate limit', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // 60 requests per hour
      expect(screen.getAllByText(/60/).length).toBeGreaterThan(0)
    })

    it('should display extraction rate limit', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // 20 requests per hour
      expect(screen.getAllByText(/20/).length).toBeGreaterThan(0)
    })

    it('should display OCR rate limit', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // 30 requests per hour
      expect(screen.getAllByText(/30/).length).toBeGreaterThan(0)
    })
  })

  describe('Edit Mode', () => {
    it('should show edit buttons for rate limit cards', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      const editButtons = screen.getAllByRole('button', { name: /edit|adjust/i })
      expect(editButtons.length).toBeGreaterThan(0)
    })
  })

  describe('Overview Grid', () => {
    it('should display rate limit overview cards', () => {
      render(
        <RateLimitsPanel
          settings={createMockSettings()}
          onUpdate={mockOnUpdate}
          isLoading={false}
          isSaving={false}
        />
      )

      // Should have multiple endpoint cards
      const cards = document.querySelectorAll('[class*="card"]')
      expect(cards.length).toBeGreaterThan(0)
    })
  })
})

describe('RateLimitsPanel - Empty Settings', () => {
  const mockOnUpdate = vi.fn()

  it('should handle empty settings gracefully', () => {
    render(
      <RateLimitsPanel
        settings={[]}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
      />
    )

    // Should show empty state message
    expect(screen.getByText(/No rate limit settings found/)).toBeInTheDocument()
  })
})

describe('RateLimitsPanel - API Paths', () => {
  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display API endpoint paths', () => {
    render(
      <RateLimitsPanel
        settings={createMockSettings()}
        onUpdate={mockOnUpdate}
        isLoading={false}
        isSaving={false}
      />
    )

    // API paths should be visible
    expect(screen.getByText(/\/api\/ai\/chat/)).toBeInTheDocument()
  })
})
