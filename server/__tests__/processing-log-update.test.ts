/**
 * Tests for processing log update fix — .single() → .maybeSingle()
 *
 * Bug: PATCH /api/ai/processing-log/:documentId returned 404 after POST succeeded.
 * Root cause: .single() throws PGRST116 error when 0 rows match (race condition
 * where the initial POST hasn't committed yet). .maybeSingle() returns null data
 * instead, allowing the client-side retry to succeed on the next attempt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase mock chain ---
const mockMaybeSingle = vi.fn()
const mockSelectAfterUpdate = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockEqDocumentId = vi.fn(() => ({ select: mockSelectAfterUpdate }))
const mockUpdate = vi.fn(() => ({ eq: mockEqDocumentId }))

const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))

const mockFrom = vi.fn(() => ({
  update: mockUpdate,
  insert: mockInsert,
}))

const mockSupabaseClient = { from: mockFrom }

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

describe('updateProcessingLog — .maybeSingle() fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure Supabase env vars are set so getSupabase() returns a client
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.NODE_ENV = 'test'
  })

  it('returns data when document exists and update succeeds', async () => {
    const mockData = {
      id: 'uuid-1',
      document_id: 'doc-123',
      status: 'completed',
      filename: 'test.pdf',
      stages: [],
      ocr_used: false,
      started_at: '2026-03-27T00:00:00Z',
      created_at: '2026-03-27T00:00:00Z',
      updated_at: '2026-03-27T00:00:01Z',
    }
    mockMaybeSingle.mockResolvedValue({ data: mockData, error: null })

    const { updateProcessingLog } = await import('../services/processing-log-service.js')
    const result = await updateProcessingLog('doc-123', { status: 'completed' })

    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('document_processing_logs')
    expect(mockEqDocumentId).toHaveBeenCalledWith('document_id', 'doc-123')
    // Verify .maybeSingle() is called (the fix), not .single()
    expect(mockMaybeSingle).toHaveBeenCalled()
  })

  it('returns null (not error) when document does not exist yet — the core fix', async () => {
    // .maybeSingle() returns { data: null, error: null } for 0 rows
    // .single() would return { data: null, error: { code: 'PGRST116', message: '...' } }
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const { updateProcessingLog } = await import('../services/processing-log-service.js')
    const result = await updateProcessingLog('nonexistent-doc', { status: 'completed' })

    // Should return null gracefully, not throw or return an error object
    expect(result).toBeNull()
    expect(mockMaybeSingle).toHaveBeenCalled()
  })

  it('returns null on actual database error', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST000', message: 'Connection refused' },
    })

    const { updateProcessingLog } = await import('../services/processing-log-service.js')
    const result = await updateProcessingLog('doc-123', { status: 'failed' })

    expect(result).toBeNull()
  })

  it('returns null when Supabase is not configured', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    // Need fresh module to pick up missing env vars
    vi.resetModules()
    const { updateProcessingLog } = await import('../services/processing-log-service.js')
    const result = await updateProcessingLog('doc-123', { status: 'completed' })

    expect(result).toBeNull()
    // Should not attempt any DB operations
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('includes updated_at in the update payload', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: '1', document_id: 'doc-1', status: 'completed' },
      error: null,
    })

    const { updateProcessingLog } = await import('../services/processing-log-service.js')
    await updateProcessingLog('doc-1', { status: 'completed' })

    // Verify update was called with updated_at field added
    const updateArg = mockUpdate.mock.calls[0][0]
    expect(updateArg).toHaveProperty('updated_at')
    expect(updateArg).toHaveProperty('status', 'completed')
  })
})

describe('createProcessingLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.NODE_ENV = 'test'
  })

  it('returns created log on success', async () => {
    const mockData = {
      id: 'uuid-new',
      document_id: 'doc-new',
      filename: 'new.pdf',
      status: 'processing',
      stages: [],
      ocr_used: false,
      started_at: '2026-03-27T00:00:00Z',
      created_at: '2026-03-27T00:00:00Z',
      updated_at: '2026-03-27T00:00:00Z',
    }
    mockInsertSingle.mockResolvedValue({ data: mockData, error: null })

    const { createProcessingLog } = await import('../services/processing-log-service.js')
    const result = await createProcessingLog({
      document_id: 'doc-new',
      filename: 'new.pdf',
      status: 'processing',
      stages: [],
      ocr_used: false,
      started_at: '2026-03-27T00:00:00Z',
    } as any)

    expect(result.data).toEqual(mockData)
    expect(result.error).toBeNull()
  })

  it('returns error string on insert failure', async () => {
    mockInsertSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })

    const { createProcessingLog } = await import('../services/processing-log-service.js')
    const result = await createProcessingLog({
      document_id: 'doc-dup',
      filename: 'dup.pdf',
      status: 'processing',
      stages: [],
      ocr_used: false,
      started_at: '2026-03-27T00:00:00Z',
    } as any)

    expect(result.data).toBeNull()
    expect(result.error).toContain('23505')
    expect(result.error).toContain('duplicate key')
  })
})
