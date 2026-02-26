import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BenchmarksTab } from './BenchmarksTab'
import { adminFetch } from '@/lib/admin/api'

// Mock the API module
vi.mock('@/lib/admin/api', () => ({
  adminFetch: vi.fn(),
}))

const mockBenchmarks = [
  {
    id: '1',
    insurance_type: 'kasko',
    insurance_type_tr: 'Kasko',
    sub_type: 'economy',
    sub_type_tr: 'Ekonomik Araç',
    min_premium: 3000,
    avg_premium: 4500,
    max_premium: 8000,
    comparison_method: 'direct_premium',
    value_min_rate: null,
    value_avg_rate: null,
    value_max_rate: null,
    currency: 'TRY',
    year: 2024,
    source: 'TSB Market Data',
    source_tr: 'TSB Piyasa Verileri',
    notes: null,
    notes_tr: null,
    is_active: true,
    created_at: '2024-03-24T12:00:00Z',
    updated_at: '2024-03-24T12:00:00Z',
  },
]

describe('BenchmarksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading indicator initially', () => {
    // Keep it pending
    vi.mocked(adminFetch).mockImplementation(() => new Promise(() => {}))

    render(<BenchmarksTab />)

    // Skeleton indicator
    expect(screen.getByText('Benchmark verileri yükleniyor...')).toBeInTheDocument()
  })

  it('fetches and displays benchmarks', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: mockBenchmarks }),
    } as Response)

    render(<BenchmarksTab />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Kasko')).toBeInTheDocument()
    })

    expect(screen.getByText('Ekonomik Araç')).toBeInTheDocument()
    // Using string matching for numbers with potentially different spaces
    expect(screen.getAllByText(/4\.?500/)[0]).toBeInTheDocument()
    expect(screen.getByText('TSB Piyasa Verileri')).toBeInTheDocument()
  })

  it('displays empty state when no benchmarks exist', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: [] }),
    } as Response)

    render(<BenchmarksTab />)

    await waitFor(() => {
      expect(screen.getByText(/Henüz benchmark verisi bulunmuyor/)).toBeInTheDocument()
    })
  })

  it('opens add benchmark form', async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      json: async () => ({ success: true, data: [] }),
    } as Response)

    render(<BenchmarksTab />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yeni Benchmark/ })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Yeni Benchmark/ }))

    expect(screen.getByText('Yeni Benchmark Ekle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ekle/ })).toBeInTheDocument()
  })
})
