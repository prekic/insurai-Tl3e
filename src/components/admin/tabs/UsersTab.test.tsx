/**
 * UsersTab Tests
 * Covers: action menu functionality, segment assignment/removal,
 * segment rendering, pilot flag visibility, three-dot menu fix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { UsersTab } from './UsersTab'

// Mock adminFetch
const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockUsers = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    display_name: 'Alice',
    role: 'super_admin',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    last_login_at: '2026-03-15T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'bob@example.com',
    display_name: 'Bob',
    role: 'admin',
    status: 'active',
    created_at: '2026-02-01T00:00:00Z',
    last_login_at: null,
  },
]

const mockReviewerSegments = [
  {
    id: 'seg-1',
    user_id: 'user-1',
    segment_name: 'kasko_pilot_reviewers',
    assigned_at: '2026-03-10T00:00:00Z',
    assigned_by: 'admin@insurai.com',
  },
]

const mockPilotFlag = {
  key: 'kasko_ai_extraction_pilot',
  enabled: false,
  rolloutPercentage: 0,
  userSegments: [],
}

function setupMocks(overrides?: { users?: unknown; segments?: unknown; flags?: unknown }) {
  mockAdminFetch.mockImplementation(async (url: string) => {
    if (url.includes('/api/admin/users')) {
      return {
        json: async () => overrides?.users ?? { success: true, data: mockUsers },
      }
    }
    if (url.includes('/api/admin/segments')) {
      return {
        json: async () =>
          overrides?.segments ?? {
            success: true,
            data: mockReviewerSegments,
          },
      }
    }
    if (url.includes('/api/admin/settings/feature-flags')) {
      return {
        json: async () =>
          overrides?.flags ?? {
            success: true,
            data: [mockPilotFlag],
          },
      }
    }
    return { json: async () => ({ success: true, data: [] }) }
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders users from real API', async () => {
    setupMocks()
    render(<UsersTab />)
    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    })
    // Verify adminFetch was called for users
    expect(mockAdminFetch).toHaveBeenCalledWith('/api/admin/users')
  })

  it('shows KASKO Reviewer badge for users in segment', async () => {
    setupMocks()
    render(<UsersTab />)
    await waitFor(() => {
      expect(screen.getByText('KASKO Reviewer')).toBeInTheDocument()
    })
    // user-2 is NOT a reviewer — should show dash
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows pilot status banner with INACTIVE when flag is disabled', async () => {
    setupMocks()
    render(<UsersTab />)
    await waitFor(() => {
      expect(screen.getByText('INACTIVE')).toBeInTheDocument()
      expect(screen.getByText(/KASKO AI Extraction Pilot/)).toBeInTheDocument()
      expect(screen.getByText(/Disabled/)).toBeInTheDocument()
    })
  })

  it('shows pilot status banner with ACTIVE when flag is enabled', async () => {
    setupMocks({
      flags: {
        success: true,
        data: [
          {
            key: 'kasko_ai_extraction_pilot',
            enabled: true,
            rolloutPercentage: 100,
            userSegments: ['kasko_pilot_reviewers'],
          },
        ],
      },
    })
    render(<UsersTab />)
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
      expect(screen.getByText(/100% rollout/)).toBeInTheDocument()
    })
  })

  it('shows "flag not found" when migration 040 not applied', async () => {
    setupMocks({ flags: { success: true, data: [] } })
    render(<UsersTab />)
    await waitFor(() => {
      expect(screen.getByText(/KASKO Pilot flag not found/)).toBeInTheDocument()
    })
  })

  describe('Action Menu', () => {
    it('opens dropdown when three-dot button is clicked', async () => {
      setupMocks()
      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const menuBtn = screen.getByTestId('action-menu-user-1')
      fireEvent.click(menuBtn)

      await waitFor(() => {
        expect(screen.getByTestId('action-dropdown-user-1')).toBeInTheDocument()
        expect(screen.getByText('View Details')).toBeInTheDocument()
      })
    })

    it('shows "Remove from KASKO Reviewers" for reviewer users', async () => {
      setupMocks()
      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('action-menu-user-1'))
      await waitFor(() => {
        expect(screen.getByText('Remove from KASKO Reviewers')).toBeInTheDocument()
      })
    })

    it('shows "Assign as KASKO Reviewer" for non-reviewer users', async () => {
      setupMocks()
      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('bob@example.com')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('action-menu-user-2'))
      await waitFor(() => {
        expect(screen.getByText('Assign as KASKO Reviewer')).toBeInTheDocument()
      })
    })

    it('opens user detail modal on "View Details" click', async () => {
      setupMocks()
      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('action-menu-user-1'))
      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('View Details'))

      await waitFor(() => {
        expect(screen.getByText('User Details')).toBeInTheDocument()
        expect(screen.getByLabelText(/Close modal/)).toBeInTheDocument()
      })
    })
  })

  describe('Segment Assignment', () => {
    it('calls POST /api/admin/segments when assigning reviewer', async () => {
      setupMocks()
      mockAdminFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url === '/api/admin/segments' && opts?.method === 'POST') {
          return {
            json: async () => ({
              success: true,
              data: {
                id: 'seg-new',
                user_id: 'user-2',
                segment_name: 'kasko_pilot_reviewers',
                assigned_at: new Date().toISOString(),
                assigned_by: 'admin',
              },
            }),
          }
        }
        if (url.includes('/api/admin/users')) {
          return { json: async () => ({ success: true, data: mockUsers }) }
        }
        if (url.includes('/api/admin/segments')) {
          return {
            json: async () => ({
              success: true,
              data: mockReviewerSegments,
            }),
          }
        }
        if (url.includes('/api/admin/settings/feature-flags')) {
          return {
            json: async () => ({
              success: true,
              data: [mockPilotFlag],
            }),
          }
        }
        return { json: async () => ({ success: true, data: [] }) }
      })

      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('bob@example.com')).toBeInTheDocument()
      })

      // Open action menu for non-reviewer user
      fireEvent.click(screen.getByTestId('action-menu-user-2'))
      await waitFor(() => {
        expect(screen.getByText('Assign as KASKO Reviewer')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Assign as KASKO Reviewer'))

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith(
          '/api/admin/segments',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              userId: 'user-2',
              segmentName: 'kasko_pilot_reviewers',
            }),
          })
        )
      })
    })

    it('calls DELETE /api/admin/segments when removing reviewer', async () => {
      setupMocks()
      mockAdminFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (
          url.includes('/api/admin/segments/user-1/kasko_pilot_reviewers') &&
          opts?.method === 'DELETE'
        ) {
          return {
            json: async () => ({
              success: true,
              message: 'User removed from segment',
            }),
          }
        }
        if (url.includes('/api/admin/users')) {
          return { json: async () => ({ success: true, data: mockUsers }) }
        }
        if (url.includes('/api/admin/segments')) {
          return {
            json: async () => ({
              success: true,
              data: mockReviewerSegments,
            }),
          }
        }
        if (url.includes('/api/admin/settings/feature-flags')) {
          return {
            json: async () => ({
              success: true,
              data: [mockPilotFlag],
            }),
          }
        }
        return { json: async () => ({ success: true, data: [] }) }
      })

      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      // Open action menu for reviewer user
      fireEvent.click(screen.getByTestId('action-menu-user-1'))
      await waitFor(() => {
        expect(screen.getByText('Remove from KASKO Reviewers')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Remove from KASKO Reviewers'))

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith(
          '/api/admin/segments/user-1/kasko_pilot_reviewers',
          expect.objectContaining({ method: 'DELETE' })
        )
      })
    })

    it('shows toast on successful assignment', async () => {
      setupMocks()
      mockAdminFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url === '/api/admin/segments' && opts?.method === 'POST') {
          return { json: async () => ({ success: true, data: {} }) }
        }
        if (url.includes('/api/admin/users')) {
          return { json: async () => ({ success: true, data: mockUsers }) }
        }
        if (url.includes('/api/admin/segments')) {
          return {
            json: async () => ({
              success: true,
              data: mockReviewerSegments,
            }),
          }
        }
        if (url.includes('/api/admin/settings/feature-flags')) {
          return {
            json: async () => ({
              success: true,
              data: [mockPilotFlag],
            }),
          }
        }
        return { json: async () => ({ success: true, data: [] }) }
      })

      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('bob@example.com')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('action-menu-user-2'))
      await waitFor(() => {
        expect(screen.getByText('Assign as KASKO Reviewer')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Assign as KASKO Reviewer'))

      await waitFor(() => {
        expect(screen.getByText('User assigned as KASKO reviewer')).toBeInTheDocument()
      })
    })
  })

  describe('Stats', () => {
    it('shows reviewer count from segment data', async () => {
      setupMocks()
      render(<UsersTab />)
      await waitFor(() => {
        // 1 reviewer (user-1) from mockReviewerSegments
        expect(screen.getByText('KASKO Reviewers')).toBeInTheDocument()
        expect(screen.getByText('1')).toBeInTheDocument()
      })
    })
  })

  describe('Error handling', () => {
    it('shows error message when users API fails', async () => {
      setupMocks({ users: { success: false, error: 'Unauthorized' } })
      render(<UsersTab />)
      await waitFor(() => {
        expect(screen.getByText('Unauthorized')).toBeInTheDocument()
      })
    })

    it('degrades gracefully when segments API fails', async () => {
      mockAdminFetch.mockImplementation(async (url: string) => {
        if (url.includes('/api/admin/users')) {
          return { json: async () => ({ success: true, data: mockUsers }) }
        }
        if (url.includes('/api/admin/segments')) {
          throw new Error('Network error')
        }
        if (url.includes('/api/admin/settings/feature-flags')) {
          return {
            json: async () => ({
              success: true,
              data: [mockPilotFlag],
            }),
          }
        }
        return { json: async () => ({ success: true, data: [] }) }
      })

      render(<UsersTab />)
      // Users should still render even if segments fail
      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
        expect(screen.getByText('bob@example.com')).toBeInTheDocument()
      })
    })
  })
})
