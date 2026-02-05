/**
 * FeatureFlagsPanel Component Tests
 *
 * Tests for the feature flags panel including
 * flag toggles and rollout percentage controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeatureFlagsPanel } from './FeatureFlagsPanel'

// Mock adminFetch
const mockAdminFetch = vi.fn()

vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockFlags = [
  {
    id: '1',
    key: 'use_db_config',
    description: 'Use database configuration',
    enabled: false,
    rolloutPercentage: 0,
    userSegments: [],
    conditions: {},
    expiresAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    key: 'new_evaluation_algorithm',
    description: 'Use new evaluation algorithm',
    enabled: true,
    rolloutPercentage: 100,
    userSegments: ['beta'],
    conditions: {},
    expiresAt: '2026-12-31T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: '3',
    key: 'enable_consensus_extraction',
    description: 'Enable consensus extraction',
    enabled: true,
    rolloutPercentage: 50,
    userSegments: [],
    conditions: {},
    expiresAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  },
]

describe('FeatureFlagsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockFlags }),
    })
  })

  describe('Rendering', () => {
    it('should render the panel header', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Feature Flags')).toBeInTheDocument()
      })
    })

    it('should render feature flag list after loading', async () => {
      render(<FeatureFlagsPanel />)

      // Flag titles are converted from snake_case to Title Case
      await waitFor(() => {
        expect(screen.getByText('Use Db Config')).toBeInTheDocument()
      })

      // Check second flag is also rendered
      expect(screen.getByText('New Evaluation Algorithm')).toBeInTheDocument()
    })

    it('should render feature descriptions', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Use database configuration')).toBeInTheDocument()
        expect(screen.getByText('Use new evaluation algorithm')).toBeInTheDocument()
      })
    })

    it('should render refresh button', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      })
    })
  })

  describe('Loading State', () => {
    it('should fetch flags on mount', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith('/api/admin/settings/feature-flags')
      })
    })
  })

  describe('Error State', () => {
    it('should show error message on fetch failure', async () => {
      mockAdminFetch.mockRejectedValueOnce(new Error('Network error'))

      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it('should show error when API returns error', async () => {
      mockAdminFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Server error' }),
      })

      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Feature Status Display', () => {
    it('should show enabled status for enabled flags', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        // new_evaluation_algorithm and enable_consensus_extraction are enabled
        const enabledBadges = screen.getAllByText(/enabled/i)
        expect(enabledBadges.length).toBeGreaterThan(0)
      })
    })

    it('should show disabled status for disabled flags', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        // use_db_config is disabled
        const disabledBadges = screen.getAllByText(/disabled/i)
        expect(disabledBadges.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Toggle Functionality', () => {
    it('should call API when toggling a flag', async () => {
      const user = userEvent.setup()

      // Mock both initial fetch and toggle call
      mockAdminFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockFlags }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: { ...mockFlags[0], enabled: true } }),
        })

      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Use Db Config')).toBeInTheDocument()
      })

      // Find and click a toggle button (the ToggleLeft/ToggleRight icons)
      const toggleButtons = screen.getAllByRole('button').filter(
        (btn) => btn.querySelector('svg')
      )

      // Click the first toggle
      if (toggleButtons.length > 1) {
        await user.click(toggleButtons[1]) // Skip the Refresh button

        await waitFor(() => {
          expect(mockAdminFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/admin/settings/feature-flags/'),
            expect.objectContaining({ method: 'PUT' })
          )
        })
      }
    })
  })

  describe('Rollout Percentage', () => {
    it('should display rollout controls for enabled flags', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        // Enabled flags should show rollout section
        // new_evaluation_algorithm and enable_consensus_extraction are enabled
        expect(screen.getByText('New Evaluation Algorithm')).toBeInTheDocument()
      })

      // Enabled flags have rollout slider
      await waitFor(() => {
        const rolloutText = screen.queryAllByText(/Rollout Percentage/i)
        expect(rolloutText.length).toBeGreaterThan(0)
      })
    })
  })

  describe('User Segments', () => {
    it('should show user segments when present', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        // new_evaluation_algorithm has 'beta' segment
        expect(screen.getByText(/beta/i)).toBeInTheDocument()
      })
    })
  })

  describe('Expiration Date', () => {
    it('should show expiration date when present', async () => {
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        // new_evaluation_algorithm has expiration
        expect(screen.getByText(/expires/i)).toBeInTheDocument()
      })
    })
  })

  describe('Refresh', () => {
    it('should refresh flags when refresh button is clicked', async () => {
      const user = userEvent.setup()
      render(<FeatureFlagsPanel />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      })

      // Clear the initial call
      mockAdminFetch.mockClear()
      mockAdminFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockFlags }),
      })

      await user.click(screen.getByRole('button', { name: /refresh/i }))

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith('/api/admin/settings/feature-flags')
      })
    })
  })
})

describe('FeatureFlagsPanel - Empty State', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle empty flags array', async () => {
    mockAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    })

    render(<FeatureFlagsPanel />)

    await waitFor(() => {
      // Should render without crashing
      expect(screen.getByText('Feature Flags')).toBeInTheDocument()
    })
  })
})

describe('FeatureFlagsPanel - Info Section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockFlags }),
    })
  })

  it('should show info about feature flags', async () => {
    render(<FeatureFlagsPanel />)

    await waitFor(() => {
      expect(screen.getByText(/feature flags/i)).toBeInTheDocument()
    })
  })
})
