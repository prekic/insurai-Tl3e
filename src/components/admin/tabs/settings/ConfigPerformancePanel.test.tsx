/**
 * ConfigPerformancePanel Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigPerformancePanel } from './ConfigPerformancePanel'
import { configPerformanceMonitor } from '@/lib/config/config-performance-monitor'

// Mock adminFetch
vi.mock('@/lib/admin/api', () => ({
  adminFetch: vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ success: true, data: { totalEvents: 0, categories: [] } }),
    })
  ),
}))

describe('ConfigPerformancePanel', () => {
  beforeEach(() => {
    // Clear events from the shared singleton (don't reset instance since module-level const holds ref)
    configPerformanceMonitor.clear()
    vi.clearAllMocks()
  })

  it('should render empty state when no events', async () => {
    render(<ConfigPerformancePanel />)
    await waitFor(() => {
      expect(screen.getByText('No performance data yet')).toBeInTheDocument()
    })
  })

  it('should render the header with title', () => {
    render(<ConfigPerformancePanel />)
    expect(screen.getByText('Config Performance')).toBeInTheDocument()
  })

  it('should show Live indicator when auto-refresh is on', () => {
    render(<ConfigPerformancePanel />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('should render Client/Server toggle buttons', () => {
    render(<ConfigPerformancePanel />)
    expect(screen.getByText('Client')).toBeInTheDocument()
    expect(screen.getByText('Server')).toBeInTheDocument()
  })

  it('should render Refresh button', () => {
    render(<ConfigPerformancePanel />)
    expect(screen.getByText('Refresh')).toBeInTheDocument()
  })

  it('should show metrics after recording events', async () => {
    // Pre-populate the shared monitor with events
    for (let i = 0; i < 5; i++) {
      configPerformanceMonitor.record({
        category: 'ai',
        method: 'getCategory',
        latencyMs: 10 + i * 10,
        cacheHit: i < 2,
        success: true,
      })
    }

    render(<ConfigPerformancePanel />)

    // Wait for useEffect to update state
    await waitFor(() => {
      expect(screen.queryByText('No performance data yet')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Total Fetches')).toBeInTheDocument()
    expect(screen.getByText('Cache Hit Rate')).toBeInTheDocument()
    expect(screen.getByText('DB Avg Latency')).toBeInTheDocument()
    expect(screen.getByText('Error Rate')).toBeInTheDocument()
  })

  it('should display per-category breakdown table', async () => {
    configPerformanceMonitor.record({ category: 'ai', method: 'get', latencyMs: 20, cacheHit: false, success: true })
    configPerformanceMonitor.record({ category: 'evaluation', method: 'get', latencyMs: 30, cacheHit: false, success: true })

    render(<ConfigPerformancePanel />)

    await waitFor(() => {
      expect(screen.getByText('Per-Category Breakdown')).toBeInTheDocument()
    })
    // Use getAllByText since 'ai' appears in both the nav and the table
    expect(screen.getAllByText('ai').length).toBeGreaterThan(0)
    expect(screen.getAllByText('evaluation').length).toBeGreaterThan(0)
  })

  it('should display TTL recommendation section', async () => {
    configPerformanceMonitor.setCacheTtl(300000)
    // Need at least 10 events for a meaningful recommendation
    for (let i = 0; i < 12; i++) {
      configPerformanceMonitor.record({ category: 'ai', method: 'get', latencyMs: 30, cacheHit: false, success: true })
    }

    render(<ConfigPerformancePanel />)

    await waitFor(() => {
      expect(screen.getByText('Cache TTL Recommendation')).toBeInTheDocument()
    })
  })

  it('should display recent events table', async () => {
    configPerformanceMonitor.record({ category: 'ai', method: 'get', latencyMs: 15, cacheHit: false, success: true })

    render(<ConfigPerformancePanel />)

    await waitFor(() => {
      expect(screen.getByText('Recent Events (last 20)')).toBeInTheDocument()
    })
  })

  it('should show latency distribution when DB events exist', async () => {
    configPerformanceMonitor.record({ category: 'ai', method: 'get', latencyMs: 15, cacheHit: false, success: true })

    render(<ConfigPerformancePanel />)

    await waitFor(() => {
      expect(screen.getByText('DB Fetch Latency Distribution')).toBeInTheDocument()
    })
    expect(screen.getByText('Min')).toBeInTheDocument()
    expect(screen.getByText('Avg')).toBeInTheDocument()
    expect(screen.getByText('P50')).toBeInTheDocument()
    expect(screen.getByText('P95')).toBeInTheDocument()
    expect(screen.getByText('P99')).toBeInTheDocument()
    expect(screen.getByText('Max')).toBeInTheDocument()
  })

  it('should toggle auto-refresh checkbox', async () => {
    const user = userEvent.setup()

    render(<ConfigPerformancePanel />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()

    // Live indicator should disappear
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })
})
