/**
 * SegmentsTab Tests
 * Covers: empty state, member list rendering, bulk-add UUID parsing,
 * 409 ALREADY_ASSIGNED handling, remove flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SegmentsTab } from './SegmentsTab'

// Mock the admin API module — we mock each helper individually so we can
// assert per-call behavior (bulk-add flow visits addSegmentMember N times).
const mockFetch = vi.fn()
const mockAdd = vi.fn()
const mockBulkAdd = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/lib/admin/api', () => ({
  fetchSegmentMembers: (...args: unknown[]) => mockFetch(...args),
  addSegmentMember: (...args: unknown[]) => mockAdd(...args),
  bulkAddSegmentMembers: (...args: unknown[]) => mockBulkAdd(...args),
  removeSegmentMember: (...args: unknown[]) => mockRemove(...args),
}))

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111'
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222'

describe('SegmentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when segment has no members', async () => {
    mockFetch.mockResolvedValue([])
    render(<SegmentsTab />)

    await waitFor(() => {
      expect(screen.getByText(/No members in/i)).toBeInTheDocument()
    })
    // Segment name appears in both the selector option and the empty-state copy
    expect(screen.getAllByText(/kasko_pilot_reviewers/).length).toBeGreaterThan(0)
    expect(screen.getByText(/0 members/i)).toBeInTheDocument()
  })

  it('renders a populated member list', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 'row-1',
        user_id: VALID_UUID_1,
        segment_name: 'kasko_pilot_reviewers',
        assigned_at: '2026-04-10T00:00:00Z',
        assigned_by: 'admin-uuid-aaaa',
      },
      {
        id: 'row-2',
        user_id: VALID_UUID_2,
        segment_name: 'kasko_pilot_reviewers',
        assigned_at: '2026-04-12T00:00:00Z',
        assigned_by: null,
      },
    ])
    render(<SegmentsTab />)

    await waitFor(() => {
      expect(screen.getByTestId(`member-row-${VALID_UUID_1}`)).toBeInTheDocument()
    })
    expect(screen.getByTestId(`member-row-${VALID_UUID_2}`)).toBeInTheDocument()
    expect(screen.getByText(/2 members/i)).toBeInTheDocument()
  })

  it('surfaces load error when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'))
    render(<SegmentsTab />)

    await waitFor(() => {
      expect(screen.getByText(/Network down/i)).toBeInTheDocument()
    })
  })

  it('parses pasted UUIDs and shows valid / invalid counts', async () => {
    mockFetch.mockResolvedValue([])
    render(<SegmentsTab />)
    await waitFor(() => screen.getByText(/No members/i))

    fireEvent.click(screen.getByTestId('add-members-open'))

    const textarea = screen.getByTestId('add-members-textarea')
    fireEvent.change(textarea, {
      target: {
        value: `${VALID_UUID_1}\n${VALID_UUID_2}\nnot-a-uuid`,
      },
    })

    expect(screen.getByTestId('valid-count')).toHaveTextContent('2 valid')
    expect(screen.getByTestId('invalid-count')).toHaveTextContent('1 invalid')
  })

  it('bulk-add collects per-user results (added + already_assigned)', async () => {
    mockFetch.mockResolvedValue([])
    mockBulkAdd.mockResolvedValue([
      { userId: VALID_UUID_1, status: 'added' },
      { userId: VALID_UUID_2, status: 'already_assigned', message: 'dup' },
    ])
    render(<SegmentsTab />)
    await waitFor(() => screen.getByText(/No members/i))

    fireEvent.click(screen.getByTestId('add-members-open'))
    fireEvent.change(screen.getByTestId('add-members-textarea'), {
      target: { value: `${VALID_UUID_1}\n${VALID_UUID_2}` },
    })
    fireEvent.click(screen.getByTestId('bulk-submit'))

    await waitFor(() => {
      expect(screen.getByText(/Bulk-add complete/i)).toBeInTheDocument()
    })
    expect(mockBulkAdd).toHaveBeenCalledWith([VALID_UUID_1, VALID_UUID_2], 'kasko_pilot_reviewers')
    // Summary text: "Added: 1 · Already assigned: 1 · Errors: 0"
    expect(screen.getByText(/Added:/)).toBeInTheDocument()
  })

  it('bulk-submit disabled when no valid UUIDs entered', async () => {
    mockFetch.mockResolvedValue([])
    render(<SegmentsTab />)
    await waitFor(() => screen.getByText(/No members/i))

    fireEvent.click(screen.getByTestId('add-members-open'))
    const submit = screen.getByTestId('bulk-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.change(screen.getByTestId('add-members-textarea'), {
      target: { value: 'not-a-uuid' },
    })
    expect((screen.getByTestId('bulk-submit') as HTMLButtonElement).disabled).toBe(true)
  })

  it('removes a member via Remove button (with confirm)', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 'row-1',
        user_id: VALID_UUID_1,
        segment_name: 'kasko_pilot_reviewers',
        assigned_at: '2026-04-10T00:00:00Z',
        assigned_by: null,
      },
    ])
    mockRemove.mockResolvedValue(undefined)
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )

    render(<SegmentsTab />)
    await waitFor(() => screen.getByTestId(`member-row-${VALID_UUID_1}`))

    fireEvent.click(screen.getByTestId(`remove-${VALID_UUID_1}`))

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(VALID_UUID_1, 'kasko_pilot_reviewers')
    })
    // Row should be removed from the DOM after successful remove
    await waitFor(() => {
      expect(screen.queryByTestId(`member-row-${VALID_UUID_1}`)).not.toBeInTheDocument()
    })

    vi.unstubAllGlobals()
  })

  it('does not remove when confirm is cancelled', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 'row-1',
        user_id: VALID_UUID_1,
        segment_name: 'kasko_pilot_reviewers',
        assigned_at: '2026-04-10T00:00:00Z',
        assigned_by: null,
      },
    ])
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    )

    render(<SegmentsTab />)
    await waitFor(() => screen.getByTestId(`member-row-${VALID_UUID_1}`))

    fireEvent.click(screen.getByTestId(`remove-${VALID_UUID_1}`))
    expect(mockRemove).not.toHaveBeenCalled()
    // Row still there
    expect(screen.getByTestId(`member-row-${VALID_UUID_1}`)).toBeInTheDocument()

    vi.unstubAllGlobals()
  })
})
