import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigDriftPanel } from './ConfigDriftPanel'

const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

function mockDriftReport(driftCount: number = 0) {
  const drifts = Array.from({ length: driftCount }, (_, i) => ({
    category: 'ai',
    key: `setting_${i}`,
    baselineValue: i,
    currentValue: i + 10,
  }))

  return {
    baseline: { id: 'b-1', name: 'Production Baseline', created_at: '2026-02-06T10:00:00Z' },
    drifts,
    totalSettings: 50,
    driftedCount: driftCount,
    matchedCount: 50 - driftCount,
    missingFromCurrent: 0,
    addedSinceBaseline: 0,
    checkedAt: '2026-02-06T12:00:00Z',
  }
}

describe('ConfigDriftPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render heading and action buttons', async () => {
    // List baselines → empty, Check → no baseline
    mockAdminFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: null, message: 'No active baseline' }) })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('Config Drift Detection')).toBeInTheDocument()
    })
    expect(screen.getByText('Save Baseline')).toBeInTheDocument()
    expect(screen.getByText('Check Now')).toBeInTheDocument()
  })

  it('should show no-baseline prompt when no baseline exists', async () => {
    mockAdminFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: null }) })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('No baseline set')).toBeInTheDocument()
    })
  })

  it('should show green state when no drift detected', async () => {
    mockAdminFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: [{ id: 'b-1', name: 'Test', isActive: true, settingsCount: 50, createdAt: '2026-02-06T10:00:00Z' }],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockDriftReport(0) }),
      })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('No Drift')).toBeInTheDocument()
      expect(screen.getByText(/All 50 settings match/)).toBeInTheDocument()
    })
  })

  it('should show drift report when drifts detected', async () => {
    mockAdminFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: [{ id: 'b-1', name: 'Test', isActive: true, settingsCount: 50, createdAt: '2026-02-06T10:00:00Z' }],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockDriftReport(3) }),
      })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('Drift Detected')).toBeInTheDocument()
      expect(screen.getByText(/3 of 50 settings have changed/)).toBeInTheDocument()
    })
  })

  it('should show drifted setting details', async () => {
    mockAdminFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: [] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockDriftReport(2) }),
      })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('setting_0')).toBeInTheDocument()
      expect(screen.getByText('setting_1')).toBeInTheDocument()
    })
  })

  it('should show create baseline form when Save Baseline clicked', async () => {
    const user = userEvent.setup()
    mockAdminFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: null }) })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('Save Baseline')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Save Baseline'))

    expect(screen.getByText('Save Current Config as Baseline')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Post-deploy Feb 6')).toBeInTheDocument()
  })

  it('should display baseline cards when baselines exist', async () => {
    mockAdminFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: [
            { id: 'b-1', name: 'Production v1', isActive: true, settingsCount: 50, createdAt: '2026-02-05T10:00:00Z' },
            { id: 'b-2', name: 'Staging v1', isActive: false, settingsCount: 48, createdAt: '2026-02-04T10:00:00Z' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockDriftReport(0) }),
      })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('Production v1')).toBeInTheDocument()
      expect(screen.getByText('Staging v1')).toBeInTheDocument()
      expect(screen.getByText('Saved Baselines')).toBeInTheDocument()
    })
  })

  it('should show matched/changed badges in drift report', async () => {
    const report = mockDriftReport(5)
    report.addedSinceBaseline = 1
    report.missingFromCurrent = 1

    mockAdminFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: report }) })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText('45 matched')).toBeInTheDocument()
      expect(screen.getByText('1 added')).toBeInTheDocument()
      expect(screen.getByText('1 removed')).toBeInTheDocument()
    })
  })

  it('should show baseline name in drift report', async () => {
    mockAdminFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: mockDriftReport(1) }) })

    render(<ConfigDriftPanel />)

    await waitFor(() => {
      expect(screen.getByText(/Production Baseline/)).toBeInTheDocument()
    })
  })
})
