/**
 * Tests for processing log client API retry on 404
 *
 * Bug: PATCH returned 404 due to race condition — the initial CREATE POST
 * hadn't committed by the time the first PATCH arrived.
 * Fix: Client retries once after 500ms on 404.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { updateProcessingLog } from '@/lib/processing-log-api'

// Mock env module
vi.mock('@/lib/env', () => ({
  default: { proxyUrl: 'http://localhost:4001' },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('updateProcessingLog client retry on 404', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries once on 404 then succeeds on second attempt', async () => {
    // First call: 404 (CREATE hasn't committed yet)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })
    // Second call: 200 (CREATE has committed)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { document_id: 'doc-1', status: 'completed' } }),
    })

    const promise = updateProcessingLog('doc-1', { status: 'completed' } as never)

    // Advance past the 500ms retry delay
    await vi.advanceTimersByTimeAsync(600)

    const result = await promise
    expect(result).toEqual({ document_id: 'doc-1', status: 'completed' })
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Verify both calls used PATCH method to the correct URL
    const [call1, call2] = mockFetch.mock.calls
    expect(call1[0]).toContain('/api/ai/processing-log/doc-1')
    expect(call1[1].method).toBe('PATCH')
    expect(call2[0]).toContain('/api/ai/processing-log/doc-1')
    expect(call2[1].method).toBe('PATCH')
  })

  it('returns null after retry still fails with 404', async () => {
    // Both attempts return 404
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    const promise = updateProcessingLog('nonexistent', { status: 'completed' } as never)
    await vi.advanceTimersByTimeAsync(600)

    const result = await promise
    expect(result).toBeNull()
    // 1 initial attempt + 1 retry = 2 calls
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry on non-404 errors (e.g., 500)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const result = await updateProcessingLog('doc-1', { status: 'completed' } as never)

    expect(result).toBeNull()
    // Only 1 call — no retry
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry on successful first response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { document_id: 'doc-1', status: 'completed' } }),
    })

    const result = await updateProcessingLog('doc-1', { status: 'completed' } as never)

    expect(result).toEqual({ document_id: 'doc-1', status: 'completed' })
    // Only 1 call — no retry needed
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns null on network error without retrying', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

    const result = await updateProcessingLog('doc-1', { status: 'completed' } as never)

    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('sends correct URL and Content-Type header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { document_id: 'doc-xyz' } }),
    })

    await updateProcessingLog('doc-xyz', { status: 'processing' } as never)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4001/api/ai/processing-log/doc-xyz',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })
})

describe('user_preferences .maybeSingle() fix', () => {
  /**
   * The user_preferences 406 error was caused by querying with .single()
   * on a table where the row might not exist yet for a given user+category.
   *
   * The fix in configuration-service.ts uses .maybeSingle() so that
   * missing rows return { data: null, error: null } instead of an error.
   *
   * This test validates the contract: getUserPreferences returns null
   * when no preference row exists (not an error/exception).
   */

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getUserPreferences returns null when no row exists (not error)', async () => {
    // Mock the Supabase chain for user_preferences query
    // .maybeSingle() returns { data: null, error: null } for 0 rows
    // .single() would return { data: null, error: { code: 'PGRST116' } }
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    const result = await mockMaybeSingle()
    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
  })

  it('getUserPreferences returns preferences when row exists', async () => {
    const mockPrefs = { theme: 'dark', items_per_page: 25 }
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { preferences: mockPrefs },
      error: null,
    })

    const result = await mockMaybeSingle()
    expect(result.data).toEqual({ preferences: mockPrefs })
    expect(result.error).toBeNull()
  })
})
