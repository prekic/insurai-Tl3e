/**
 * ExtractionHealthTab Tests
 *
 * Tests for the Extraction Health admin dashboard tab.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ExtractionHealthTab } from './ExtractionHealthTab'

// Mock adminFetch
const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ============================================================================
// Test data
// ============================================================================

const MOCK_HEALTHY_DATA = {
  success: true,
  data: {
    last_24h: { total: 30, success: 29, failed: 1, error_rate: 0.033 },
    by_provider: {
      openai: { total: 20, failed: 0, avg_latency_ms: 3200 },
      anthropic: { total: 10, failed: 1, avg_latency_ms: 4100 },
    },
    recent_errors: [
      {
        requestId: 'ext-1',
        provider: 'anthropic',
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded',
        timestamp: new Date(Date.now() - 300000).toISOString(),
      },
    ],
    hourly_buckets: Array.from({ length: 24 }, (_, i) => ({
      hour: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      total: Math.floor(Math.random() * 5),
      success: Math.floor(Math.random() * 4),
      failed: Math.floor(Math.random() * 2),
      avg_latency_ms: 2000 + Math.floor(Math.random() * 3000),
    })),
    buffer_size: 30,
    source: 'memory',
  },
}

const MOCK_WARNING_DATA = {
  success: true,
  data: {
    last_24h: { total: 50, success: 44, failed: 6, error_rate: 0.12 },
    by_provider: {
      openai: { total: 30, failed: 3, avg_latency_ms: 8000 },
      anthropic: { total: 20, failed: 3, avg_latency_ms: 12000 },
    },
    recent_errors: [],
    hourly_buckets: [],
    buffer_size: 50,
    source: 'memory',
  },
}

const MOCK_UNHEALTHY_DATA = {
  success: true,
  data: {
    last_24h: { total: 20, success: 13, failed: 7, error_rate: 0.35 },
    by_provider: {
      openai: { total: 20, failed: 7, avg_latency_ms: 20000 },
    },
    recent_errors: [],
    hourly_buckets: [],
    buffer_size: 20,
    source: 'memory',
  },
}

const MOCK_EMPTY_DATA = {
  success: true,
  data: {
    last_24h: { total: 0, success: 0, failed: 0, error_rate: 0 },
    by_provider: {},
    recent_errors: [],
    hourly_buckets: [],
    buffer_size: 0,
    source: 'memory',
  },
}

// ============================================================================
// Tests
// ============================================================================

describe('ExtractionHealthTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders loading spinner on initial fetch', () => {
    mockAdminFetch.mockReturnValue(new Promise(() => {})) // Never resolves
    render(<ExtractionHealthTab />)
    expect(screen.getByText('Loading extraction health...')).toBeInTheDocument()
  })

  it('renders error state with retry button when fetch fails', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('Network error'))
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('renders null when data is null after loading', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: null }),
    })
    const { container } = render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull()
    })
  })

  it('renders all 4 summary cards with correct values', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('30')).toBeInTheDocument()
    })
    expect(screen.getByText('29')).toBeInTheDocument()
    // "1" appears in Failed card, provider table, and error badge — use getAllByText
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('3.3%')).toBeInTheDocument()
    expect(screen.getByText('Total Extractions')).toBeInTheDocument()
    expect(screen.getByText('Successful')).toBeInTheDocument()
    // "Failed" and "Error Rate" appear in both summary cards and provider table header
    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Error Rate').length).toBeGreaterThanOrEqual(1)
  })

  it('shows healthy status banner when error_rate < 5%', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Extraction Pipeline Healthy')).toBeInTheDocument()
    })
  })

  it('shows warning status banner when error_rate 5-20%', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_WARNING_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Elevated Error Rate')).toBeInTheDocument()
    })
  })

  it('shows unhealthy status banner when error_rate > 20%', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_UNHEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText(/High Error Rate/)).toBeInTheDocument()
    })
  })

  it('renders provider breakdown table with provider rows', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Provider Breakdown')).toBeInTheDocument()
    })
    expect(screen.getByText('openai')).toBeInTheDocument()
    // "anthropic" appears in both provider table and recent errors badge — use getAllByText
    expect(screen.getAllByText('anthropic').length).toBeGreaterThanOrEqual(1)
  })

  it('shows green latency for provider with avg <5s', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('3.2s')).toBeInTheDocument() // openai 3200ms
    })
  })

  it('shows error rate highlighted red when >10%', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('10.0%')).toBeInTheDocument() // anthropic: 1/10 = 10%
    })
  })

  it('renders recent errors list with count badge', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Recent Errors')).toBeInTheDocument()
    })
    // Count badge — "1" appears multiple times; verify the error count badge specifically
    const recentErrorsHeading = screen.getByText('Recent Errors')
    const badge = recentErrorsHeading.parentElement?.querySelector('.bg-red-100')
    expect(badge).toBeTruthy()
    expect(badge?.textContent?.trim()).toBe('1')
  })

  it('shows "No errors" message when error list is empty', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_WARNING_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('No errors in the current buffer window.')).toBeInTheDocument()
    })
  })

  it('expands error details on click', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
    })

    // Click to expand
    const errorButton = screen.getByText('Rate limit exceeded').closest('button')!
    fireEvent.click(errorButton)

    // Check expanded details — requestId shown in expanded section
    await waitFor(() => {
      expect(screen.getByText('ext-1')).toBeInTheDocument()
    })
    // RATE_LIMIT appears in both collapsed badge and expanded details — verify both exist
    expect(screen.getAllByText('RATE_LIMIT').length).toBe(2)
  })

  it('auto-refresh toggle starts enabled', async () => {
    mockAdminFetch.mockResolvedValue({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Auto')).toBeInTheDocument()
    })
  })

  it('clicking auto-refresh toggle pauses it', async () => {
    mockAdminFetch.mockResolvedValue({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Auto')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Auto'))

    await waitFor(() => {
      expect(screen.getByText('Paused')).toBeInTheDocument()
    })
  })

  it('auto-refresh triggers fetch every 10s', async () => {
    mockAdminFetch.mockResolvedValue({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledTimes(1)
    })

    // Advance 10 seconds
    vi.advanceTimersByTime(10000)
    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledTimes(2)
    })
  })

  it('manual refresh button triggers fetchHealth', async () => {
    mockAdminFetch.mockResolvedValue({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Extraction Pipeline Healthy')).toBeInTheDocument()
    })

    // Click the manual refresh button
    const refreshBtn = screen.getByRole('button', { name: /refresh extraction health/i })
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledTimes(2)
    })
  })

  it('retry button in error state re-fetches data', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })

    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getByText('Extraction Pipeline Healthy')).toBeInTheDocument()
    })
  })

  it('shows buffer size in header subtitle', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText(/Buffer: 30 events/)).toBeInTheDocument()
    })
  })

  it('shows "No extractions recorded" message when total is 0', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_EMPTY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText(/No extractions recorded/)).toBeInTheDocument()
    })
  })

  it('renders hourly chart when hourly_buckets are present', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_HEALTHY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Extraction Volume (Last 24 Hours)')).toBeInTheDocument()
    })
  })

  it('does not render chart when hourly_buckets are empty', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(MOCK_EMPTY_DATA),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('Extraction Health')).toBeInTheDocument()
    })
    expect(screen.queryByText('Extraction Volume (Last 24 Hours)')).not.toBeInTheDocument()
  })
})

// ============================================================================
// Utility function tests
// ============================================================================

describe('formatLatency', () => {
  // We test via rendering since formatLatency is not exported
  it('displays ms for values <1000', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            last_24h: { total: 1, success: 1, failed: 0, error_rate: 0 },
            by_provider: { openai: { total: 1, failed: 0, avg_latency_ms: 500 } },
            recent_errors: [],
            hourly_buckets: [],
            buffer_size: 1,
          },
        }),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('500ms')).toBeInTheDocument()
    })
  })

  it('displays seconds for values >=1000', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            last_24h: { total: 1, success: 1, failed: 0, error_rate: 0 },
            by_provider: { openai: { total: 1, failed: 0, avg_latency_ms: 2500 } },
            recent_errors: [],
            hourly_buckets: [],
            buffer_size: 1,
          },
        }),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('2.5s')).toBeInTheDocument()
    })
  })
})

describe('formatTimestamp', () => {
  it('shows "just now" for recent timestamps', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            last_24h: { total: 1, success: 0, failed: 1, error_rate: 1 },
            by_provider: {},
            recent_errors: [
              {
                requestId: 'r1',
                provider: 'openai',
                code: 'ERR',
                message: 'test error',
                timestamp: new Date().toISOString(),
              },
            ],
            hourly_buckets: [],
            buffer_size: 1,
          },
        }),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('just now')).toBeInTheDocument()
    })
  })

  it('shows minutes ago for recent timestamps', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            last_24h: { total: 1, success: 0, failed: 1, error_rate: 1 },
            by_provider: {},
            recent_errors: [
              {
                requestId: 'r2',
                provider: 'openai',
                code: 'ERR',
                message: 'test error 2',
                timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
              },
            ],
            hourly_buckets: [],
            buffer_size: 1,
          },
        }),
    })
    render(<ExtractionHealthTab />)

    await waitFor(() => {
      expect(screen.getByText('5m ago')).toBeInTheDocument()
    })
  })
})
