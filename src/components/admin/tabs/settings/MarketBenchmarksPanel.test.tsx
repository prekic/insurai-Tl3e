import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarketBenchmarksPanel } from './MarketBenchmarksPanel'
import { adminFetch } from '@/lib/admin/api'

// Mock the API module
vi.mock('@/lib/admin/api', () => ({
  adminFetch: vi.fn(),
}))

const mockBenchmarks = [
  {
    id: '1',
    policy_type: 'kasko',
    coverage_type: 'IMM',
    coverage_name_tr: 'İhtiyari Mali Mesuliyet',
    region_code: null,
    year: 2024,
    min_limit: 1000000,
    typical_limit: 5000000,
    max_limit: null,
    min_deductible: null,
    typical_deductible: 0,
    max_deductible: null,
    inclusion_rate: 95.5,
    importance: 'critical',
    source: null,
    notes: null,
    is_active: true,
    currency: 'TRY',
    created_at: '2024-03-24T12:00:00Z',
    updated_at: '2024-03-24T12:00:00Z',
  },
]

describe('MarketBenchmarksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeleton initially', () => {
    // Keep it pending
    vi.mocked(adminFetch).mockImplementation(() => new Promise(() => {}))

    render(<MarketBenchmarksPanel />)

    // Skeleton indicator
    expect(screen.getByLabelText('Loading settings')).toBeInTheDocument()
  })

  it('fetches and displays benchmarks', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: mockBenchmarks }),
    } as Response)

    render(<MarketBenchmarksPanel />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('kasko')).toBeInTheDocument()
    })

    expect(screen.getByText('İhtiyari Mali Mesuliyet')).toBeInTheDocument()
    expect(screen.getByText('5,000,000 TRY')).toBeInTheDocument() // typical limit formatting
    expect(screen.getByText('0 TRY')).toBeInTheDocument() // typical deductible formatting
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('displays empty state when no benchmarks exist', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: [] }),
    } as Response)

    render(<MarketBenchmarksPanel />)

    await waitFor(() => {
      expect(screen.getByText('No market benchmarks configured yet.')).toBeInTheDocument()
    })
  })

  it('opens add benchmark form', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: mockBenchmarks }),
    } as Response)

    render(<MarketBenchmarksPanel />)
    await waitFor(() => {
      expect(screen.getByText('Add Benchmark')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add Benchmark'))

    expect(screen.getByText('Add New Benchmark')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('opens edit form with prepopulated data', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: mockBenchmarks }),
    } as Response)

    render(<MarketBenchmarksPanel />)
    await waitFor(() => {
      expect(screen.getByText('İhtiyari Mali Mesuliyet')).toBeInTheDocument()
    })

    const editBtn = screen.getByRole('button', { name: 'Edit' })
    fireEvent.click(editBtn)

    expect(screen.getByText('Edit Benchmark')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()

    // Check if input is prepopulated
    const input = screen.getByDisplayValue('İhtiyari Mali Mesuliyet')
    expect(input).toBeInTheDocument()
  })

  it('soft deletes a benchmark when trash is clicked', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: mockBenchmarks }),
    } as Response)

    render(<MarketBenchmarksPanel />)
    await waitFor(() => {
      expect(screen.getByText('kasko')).toBeInTheDocument()
    })

    // Mock the window.confirm
    const originalConfirm = window.confirm
    window.confirm = vi.fn().mockImplementation(() => true)

    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    } as Response)

    const deleteBtn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(adminFetch).toHaveBeenCalledWith(
        '/api/admin/settings/benchmarks/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ is_active: false }),
        })
      )
    })

    // Wait for UI to update to Inactive
    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument()
    })

    window.confirm = originalConfirm
  })
})
