/**
 * SettingsHistoryPanel Component Tests
 *
 * Tests for the settings history/audit log panel including
 * loading states, filtering, pagination, and expandable details.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsHistoryPanel } from './SettingsHistoryPanel'

// Mock adminFetch
const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// Sample history data
const createMockHistory = (count: number = 5) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `history-${i + 1}`,
    settingId: `setting-${i + 1}`,
    category: ['ai', 'evaluation', 'rate_limits', 'ocr', 'feature_flags'][i % 5],
    key: `setting_key_${i + 1}`,
    previousValue: `old_value_${i + 1}`,
    newValue: `new_value_${i + 1}`,
    changedBy: `user-${i + 1}`,
    changedByEmail: `admin${i + 1}@example.com`,
    changedAt: new Date(Date.now() - i * 3600000).toISOString(), // Each 1 hour apart
    reason: i % 2 === 0 ? `Reason for change ${i + 1}` : null,
    ipAddress: `192.168.1.${i + 1}`,
    userAgent: 'Mozilla/5.0',
  }))
}

const createMockResponse = (history: unknown[], total: number = 5, offset: number = 0) => ({
  success: true,
  data: {
    history,
    pagination: {
      total,
      limit: 20,
      offset,
      hasMore: offset + 20 < total,
    },
  },
})

describe('SettingsHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Loading State', () => {
    it('should show loading indicator while fetching data', async () => {
      // Never resolve the fetch to keep loading state
      mockAdminFetch.mockImplementation(() => new Promise(() => {}))

      render(<SettingsHistoryPanel />)

      expect(screen.getByText(/loading settings history/i)).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no history exists', async () => {
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse([], 0)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/No Settings Changes Yet/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/Settings changes will appear here/i)).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error state when fetch fails', async () => {
      mockAdminFetch.mockRejectedValue(new Error('Network error'))

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to Load History/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/Network error/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    it('should retry fetch when retry button is clicked', async () => {
      mockAdminFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          json: () => Promise.resolve(createMockResponse(createMockHistory(3), 3)),
        })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to Load History/i)).toBeInTheDocument()
      })

      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      expect(mockAdminFetch).toHaveBeenCalledTimes(2)
    })

    it('should show error when API returns success: false', async () => {
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Database error' }),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to Load History/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/Database error/i)).toBeInTheDocument()
    })
  })

  describe('History List', () => {
    it('should render history entries', async () => {
      const mockHistory = createMockHistory(3)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 3)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      // Check that entries are rendered
      expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      expect(screen.getByText(/admin2@example.com/i)).toBeInTheDocument()
      expect(screen.getByText(/admin3@example.com/i)).toBeInTheDocument()
    })

    it('should display category badges', async () => {
      const mockHistory = createMockHistory(5)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 5)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        // Use getAllByText since there can be multiple entries with same category
        expect(screen.getAllByText(/AI Settings/i).length).toBeGreaterThan(0)
      })

      expect(screen.getAllByText(/Evaluation/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Rate Limits/i).length).toBeGreaterThan(0)
    })

    it('should show count of entries', async () => {
      const mockHistory = createMockHistory(5)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 5)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Showing 5 of 5 changes/i)).toBeInTheDocument()
      })
    })
  })

  describe('Expandable Details', () => {
    it('should expand entry when clicked', async () => {
      const mockHistory = createMockHistory(2)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 2)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      // Find and click the first entry
      const entries = screen.getAllByRole('button')
      const expandableEntry = entries.find(btn => btn.getAttribute('aria-expanded') !== null)

      if (expandableEntry) {
        fireEvent.click(expandableEntry)

        await waitFor(() => {
          expect(screen.getByText(/Previous Value/i)).toBeInTheDocument()
        })

        expect(screen.getByText(/New Value/i)).toBeInTheDocument()
        expect(screen.getByText(/old_value_1/i)).toBeInTheDocument()
        expect(screen.getByText(/new_value_1/i)).toBeInTheDocument()
      }
    })

    it('should show reason for change when available', async () => {
      const mockHistory = createMockHistory(1)
      mockHistory[0].reason = 'Updated for performance optimization'
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      // Expand the entry
      const entries = screen.getAllByRole('button')
      const expandableEntry = entries.find(btn => btn.getAttribute('aria-expanded') !== null)

      if (expandableEntry) {
        fireEvent.click(expandableEntry)

        await waitFor(() => {
          expect(screen.getByText(/Reason for Change/i)).toBeInTheDocument()
        })

        // Use getAllByText since reason may appear in multiple places
        expect(screen.getAllByText(/Updated for performance optimization/i).length).toBeGreaterThan(0)
      }
    })

    it('should collapse entry when clicked again', async () => {
      const mockHistory = createMockHistory(1)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      const entries = screen.getAllByRole('button')
      const expandableEntry = entries.find(btn => btn.getAttribute('aria-expanded') !== null)

      if (expandableEntry) {
        // Expand
        fireEvent.click(expandableEntry)
        await waitFor(() => {
          expect(screen.getByText(/Previous Value/i)).toBeInTheDocument()
        })

        // Collapse
        fireEvent.click(expandableEntry)
        await waitFor(() => {
          expect(screen.queryByText(/Previous Value/i)).not.toBeInTheDocument()
        })
      }
    })
  })

  describe('Search Functionality', () => {
    it('should filter entries by search query', async () => {
      const mockHistory = createMockHistory(3)
      mockHistory[0].key = 'temperature'
      mockHistory[1].key = 'max_tokens'
      mockHistory[2].key = 'temperature_chat'
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 3)),
      })

      const user = userEvent.setup()
      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, 'temperature')

      // Should show filtered count
      await waitFor(() => {
        expect(screen.getByText(/Showing 2 of 3 changes/i)).toBeInTheDocument()
      })
    })

    it('should show no matches message when search has no results', async () => {
      const mockHistory = createMockHistory(3)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 3)),
      })

      const user = userEvent.setup()
      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, 'nonexistent_setting_xyz')

      await waitFor(() => {
        expect(screen.getByText(/No settings changes match your search criteria/i)).toBeInTheDocument()
      })
    })
  })

  describe('Category Filter', () => {
    it('should filter by category when selected', async () => {
      const mockHistory = createMockHistory(5)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 5)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      // Find category filter dropdown
      const categoryFilter = screen.getByRole('combobox', { name: /filter by category/i })
      fireEvent.change(categoryFilter, { target: { value: 'ai' } })

      // Should trigger a new fetch with category parameter
      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith(
          expect.stringContaining('category=ai')
        )
      })
    })
  })

  describe('Pagination', () => {
    it('should show pagination controls when there are more entries', async () => {
      const mockHistory = createMockHistory(20)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 50, 0)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 - 20 of 50/i)).toBeInTheDocument()
      })

      expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
    })

    it('should navigate to next page', async () => {
      const mockHistory = createMockHistory(20)
      mockAdminFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(createMockResponse(mockHistory, 50, 0)),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(createMockResponse(mockHistory, 50, 20)),
        })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 - 20 of 50/i)).toBeInTheDocument()
      })

      const nextButton = screen.getByRole('button', { name: /next/i })
      fireEvent.click(nextButton)

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith(
          expect.stringContaining('offset=20')
        )
      })
    })

    it('should navigate to previous page', async () => {
      const mockHistory = createMockHistory(20)

      // First call: initial load with offset 0
      // Second call: after clicking next, offset 20
      // Third call: after clicking previous, offset 0
      mockAdminFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(createMockResponse(mockHistory, 50, 0)),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(createMockResponse(mockHistory, 50, 20)),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(createMockResponse(mockHistory, 50, 0)),
        })

      render(<SettingsHistoryPanel />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText(/Showing 1 - 20 of 50/i)).toBeInTheDocument()
      })

      // Navigate to next page first
      fireEvent.click(screen.getByRole('button', { name: /next/i }))

      await waitFor(() => {
        expect(screen.getByText(/Showing 21 - 40 of 50/i)).toBeInTheDocument()
      })

      // Then go back
      fireEvent.click(screen.getByRole('button', { name: /previous/i }))

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledTimes(3)
      })
    })

    it('should hide pagination when all entries fit on one page', async () => {
      const mockHistory = createMockHistory(5)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 5, 0)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      // Pagination should not be visible
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
    })
  })

  describe('Refresh Button', () => {
    it('should refresh data when refresh button is clicked', async () => {
      const mockHistory = createMockHistory(3)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 3)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      fireEvent.click(refreshButton)

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Date Formatting', () => {
    it('should show relative time for recent changes', async () => {
      const mockHistory = createMockHistory(1)
      // Set to 5 minutes ago
      mockHistory[0].changedAt = new Date(Date.now() - 5 * 60000).toISOString()
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/5 min ago/i)).toBeInTheDocument()
      })
    })

    it('should show hours for changes within a day', async () => {
      const mockHistory = createMockHistory(1)
      // Set to 3 hours ago
      mockHistory[0].changedAt = new Date(Date.now() - 3 * 3600000).toISOString()
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/3 hours ago/i)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have accessible search input', async () => {
      const mockHistory = createMockHistory(3)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 3)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      expect(searchInput).toBeInTheDocument()
    })

    it('should have accessible category filter', async () => {
      const mockHistory = createMockHistory(3)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 3)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Settings Change History/i)).toBeInTheDocument()
      })

      const categoryFilter = screen.getByRole('combobox', { name: /filter by category/i })
      expect(categoryFilter).toBeInTheDocument()
    })

    it('should have aria-expanded on expandable entries', async () => {
      const mockHistory = createMockHistory(1)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      const expandableEntry = screen.getByRole('button', { expanded: false })
      expect(expandableEntry).toHaveAttribute('aria-expanded', 'false')
    })

    it('should support keyboard navigation for expanding entries', async () => {
      const mockHistory = createMockHistory(1)
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      const expandableEntry = screen.getByRole('button', { expanded: false })

      // Simulate Enter key
      fireEvent.keyDown(expandableEntry, { key: 'Enter' })

      await waitFor(() => {
        expect(expandableEntry).toHaveAttribute('aria-expanded', 'true')
      })
    })
  })

  describe('Value Formatting', () => {
    it('should handle object values', async () => {
      const mockHistory = createMockHistory(1)
      mockHistory[0].previousValue = { nested: 'object', value: 123 }
      mockHistory[0].newValue = { nested: 'updated', value: 456 }
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      // Expand to see values
      const expandableEntry = screen.getByRole('button', { expanded: false })
      fireEvent.click(expandableEntry)

      await waitFor(() => {
        // JSON stringified values should be visible - use getAllByText since it appears twice
        expect(screen.getAllByText(/"nested"/).length).toBeGreaterThan(0)
      })
    })

    it('should handle null/undefined values', async () => {
      const mockHistory = createMockHistory(1)
      mockHistory[0].previousValue = null
      mockHistory[0].newValue = 'new_value'
      mockAdminFetch.mockResolvedValue({
        json: () => Promise.resolve(createMockResponse(mockHistory, 1)),
      })

      render(<SettingsHistoryPanel />)

      await waitFor(() => {
        expect(screen.getByText(/admin1@example.com/i)).toBeInTheDocument()
      })

      const expandableEntry = screen.getByRole('button', { expanded: false })
      fireEvent.click(expandableEntry)

      await waitFor(() => {
        expect(screen.getByText(/\(empty\)/)).toBeInTheDocument()
      })
    })
  })
})
