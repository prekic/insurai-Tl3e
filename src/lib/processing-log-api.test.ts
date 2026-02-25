import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the env module before importing the module under test
vi.mock('./env', () => ({
  default: {
    proxyUrl: 'http://localhost:4001',
    isDev: true,
    isProd: false,
    hasProxy: true,
    hasAI: true,
    hasSupabase: false,
  },
}))

import {
  createProcessingLog,
  updateProcessingLog,
  addProcessingStage,
  getProcessingLog,
} from './processing-log-api'
import type { DocumentProcessingLog, ProcessingStageRecord } from '@/types/processing-log'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Suppress console.error from the module's error handling
vi.spyOn(console, 'error').mockImplementation(() => {})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLog(
  overrides: Partial<DocumentProcessingLog> = {}
): DocumentProcessingLog {
  return {
    id: 'log-abc-123',
    document_id: 'doc-001',
    filename: 'policy.pdf',
    stages: [],
    status: 'completed',
    started_at: '2026-02-17T10:00:00Z',
    completed_at: '2026-02-17T10:01:00Z',
    total_duration_ms: 60000,
    ocr_used: false,
    created_at: '2026-02-17T10:00:00Z',
    updated_at: '2026-02-17T10:01:00Z',
    ...overrides,
  }
}

function makeStage(
  overrides: Partial<ProcessingStageRecord> = {}
): ProcessingStageRecord {
  return {
    stage: 'pdf_extraction',
    status: 'completed',
    started_at: '2026-02-17T10:00:01Z',
    completed_at: '2026-02-17T10:00:05Z',
    duration_ms: 4000,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processing-log-api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // createProcessingLog
  // =========================================================================
  describe('createProcessingLog', () => {
    it('sends POST to correct URL with JSON body', async () => {
      const logData = makeLog()
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: logData })
      )

      const input = {
        document_id: 'doc-001',
        filename: 'policy.pdf',
        stages: [] as ProcessingStageRecord[],
        status: 'processing' as const,
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      }

      await createProcessingLog(input)

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/processing-log',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      )
    })

    it('returns the created log on success', async () => {
      const logData = makeLog({ id: 'new-log-id' })
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: logData })
      )

      const result = await createProcessingLog({
        document_id: 'doc-001',
        filename: 'policy.pdf',
        stages: [],
        status: 'processing',
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      })

      expect(result).toEqual(logData)
      expect(result!.id).toBe('new-log-id')
    })

    it('returns null when API responds with success: false', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Validation failed' })
      )

      const result = await createProcessingLog({
        document_id: 'doc-002',
        filename: 'bad.pdf',
        stages: [],
        status: 'processing',
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      })

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Create failed:',
        'Validation failed',
        { documentId: 'doc-002' }
      )
    })

    it('returns null and logs error when fetch throws a network error', async () => {
      const networkError = new Error('Network request failed')
      mockFetch.mockRejectedValueOnce(networkError)

      const result = await createProcessingLog({
        document_id: 'doc-003',
        filename: 'policy.pdf',
        stages: [],
        status: 'processing',
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      })

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Create error:',
        networkError,
        expect.objectContaining({ documentId: 'doc-003' })
      )
    })

    it('returns null when response.json() throws', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response)

      const result = await createProcessingLog({
        document_id: 'doc-004',
        filename: 'broken.pdf',
        stages: [],
        status: 'processing',
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      })

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Create error:',
        expect.any(Error),
        expect.objectContaining({ documentId: 'doc-004' })
      )
    })

    it('sends all fields including optional ones in the body', async () => {
      const fullInput = {
        document_id: 'doc-full',
        policy_id: 'pol-123',
        user_id: 'user-abc',
        filename: 'comprehensive.pdf',
        file_size: 1048576,
        mime_type: 'application/pdf',
        page_count: 12,
        stages: [makeStage()],
        status: 'processing' as const,
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: true,
        ocr_engine: 'document_ai',
        ai_provider: 'openai',
        extraction_confidence: 0.92,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      }

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog(fullInput) })
      )

      await createProcessingLog(fullInput)

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentBody.policy_id).toBe('pol-123')
      expect(sentBody.file_size).toBe(1048576)
      expect(sentBody.page_count).toBe(12)
      expect(sentBody.ocr_engine).toBe('document_ai')
      expect(sentBody.stages).toHaveLength(1)
    })
  })

  // =========================================================================
  // updateProcessingLog
  // =========================================================================
  describe('updateProcessingLog', () => {
    it('sends PATCH to correct URL with document ID', async () => {
      const updatedLog = makeLog({ status: 'completed' })
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: updatedLog })
      )

      await updateProcessingLog('doc-001', { status: 'completed' })

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/processing-log/doc-001',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        }
      )
    })

    it('returns updated log on success', async () => {
      const updatedLog = makeLog({
        status: 'completed',
        total_duration_ms: 45000,
      })
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: updatedLog })
      )

      const result = await updateProcessingLog('doc-001', {
        status: 'completed',
        total_duration_ms: 45000,
      })

      expect(result).toEqual(updatedLog)
      expect(result!.status).toBe('completed')
      expect(result!.total_duration_ms).toBe(45000)
    })

    it('returns null when API responds with success: false', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Document not found' })
      )

      const result = await updateProcessingLog('nonexistent-doc', {
        status: 'completed',
      })

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Update failed:',
        'Document not found',
        { documentId: 'nonexistent-doc' }
      )
    })

    it('returns null and logs error when fetch throws', async () => {
      const error = new TypeError('Failed to fetch')
      mockFetch.mockRejectedValueOnce(error)

      const result = await updateProcessingLog('doc-001', {
        status: 'failed',
      })

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Update error:',
        error,
        { documentId: 'doc-001' }
      )
    })

    it('sends partial updates correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() })
      )

      const updates = {
        error_message: 'Extraction failed',
        error_stage: 'ai_extraction',
        status: 'failed' as const,
      }
      await updateProcessingLog('doc-005', updates)

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentBody).toEqual(updates)
    })

    it('handles update with error context fields', async () => {
      const updates: Partial<DocumentProcessingLog> = {
        status: 'failed',
        error_message: 'AI provider timeout',
        error_stage: 'ai_extraction',
        error_type: 'TIMEOUT',
        error_code: 'EXTRACTION_TIMEOUT',
        error_context: {
          extraction_provider: 'openai',
          document_length: 50000,
          ocr_used: true,
          last_successful_stage: 'text_preprocessing',
        },
      }

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog(updates) })
      )

      const result = await updateProcessingLog('doc-006', updates)

      expect(result).not.toBeNull()
      expect(result!.error_code).toBe('EXTRACTION_TIMEOUT')
    })
  })

  // =========================================================================
  // addProcessingStage
  // =========================================================================
  describe('addProcessingStage', () => {
    it('sends POST to correct stage URL', async () => {
      const stage = makeStage()
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true })
      )

      await addProcessingStage('doc-001', stage)

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/processing-log/doc-001/stage',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stage),
        }
      )
    })

    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true })
      )

      const result = await addProcessingStage('doc-001', makeStage())

      expect(result).toBe(true)
    })

    it('returns false when API responds with success: false', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Invalid stage data' })
      )

      const result = await addProcessingStage('doc-001', makeStage())

      expect(result).toBe(false)
    })

    it('returns false and logs error when fetch throws', async () => {
      const error = new Error('Connection refused')
      mockFetch.mockRejectedValueOnce(error)

      const result = await addProcessingStage('doc-001', makeStage())

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Add stage error:',
        error
      )
    })

    it('sends stage with full content fields', async () => {
      const stageWithContent: ProcessingStageRecord = {
        stage: 'text_preprocessing',
        status: 'completed',
        started_at: '2026-02-17T10:00:01Z',
        completed_at: '2026-02-17T10:00:03Z',
        duration_ms: 2000,
        full_input_text: 'Raw OCR text with errors...',
        full_output_text: 'Cleaned text after normalization...',
        diff_summary: {
          characters_added: 50,
          characters_removed: 120,
          lines_changed: 15,
          major_changes: ['Fixed Turkish characters', 'Removed noise patterns'],
        },
      }

      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      const result = await addProcessingStage('doc-010', stageWithContent)

      expect(result).toBe(true)
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentBody.full_input_text).toBe('Raw OCR text with errors...')
      expect(sentBody.diff_summary.lines_changed).toBe(15)
    })

    it('sends stage with decision context for skipped stages', async () => {
      const skippedStage: ProcessingStageRecord = {
        stage: 'ocr_processing',
        status: 'skipped',
        started_at: '2026-02-17T10:00:02Z',
        completed_at: '2026-02-17T10:00:02Z',
        duration_ms: 5,
        decision_context: {
          assessment_performed: 'Text density analysis',
          threshold: {
            name: 'chars_per_page',
            value: 200,
            comparison: 'less_than',
          },
          actual_values: {
            chars_per_page: 12492,
            is_likely_scanned: false,
          },
          decision_logic: 'Text density sufficient (12492 >= 200 threshold)',
          alternatives: ['OCR triggered if chars_per_page < 200'],
        },
      }

      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      const result = await addProcessingStage('doc-011', skippedStage)

      expect(result).toBe(true)
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentBody.decision_context.assessment_performed).toBe(
        'Text density analysis'
      )
      expect(sentBody.decision_context.threshold.value).toBe(200)
    })

    it('sends stage with metadata and input/output', async () => {
      const stageWithMeta: ProcessingStageRecord = {
        stage: 'ai_extraction',
        status: 'completed',
        started_at: '2026-02-17T10:00:05Z',
        completed_at: '2026-02-17T10:00:20Z',
        duration_ms: 15000,
        input: { text_length: 50000, provider: 'openai' },
        output: { fields_extracted: 25, confidence: 0.89 },
        metadata: { model: 'gpt-4o', tokens_used: 3200 },
        full_extracted_json: '{"policyNumber":"POL-001","provider":"Allianz"}',
      }

      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      await addProcessingStage('doc-012', stageWithMeta)

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentBody.input.text_length).toBe(50000)
      expect(sentBody.output.confidence).toBe(0.89)
      expect(sentBody.metadata.model).toBe('gpt-4o')
      expect(sentBody.full_extracted_json).toContain('POL-001')
    })

    it('handles failed stage with error field', async () => {
      const failedStage: ProcessingStageRecord = {
        stage: 'ai_extraction',
        status: 'failed',
        started_at: '2026-02-17T10:00:05Z',
        completed_at: '2026-02-17T10:00:10Z',
        duration_ms: 5000,
        error: 'OpenAI API returned 429: Rate limit exceeded',
      }

      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      const result = await addProcessingStage('doc-013', failedStage)

      expect(result).toBe(true)
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentBody.error).toBe('OpenAI API returned 429: Rate limit exceeded')
      expect(sentBody.status).toBe('failed')
    })
  })

  // =========================================================================
  // getProcessingLog
  // =========================================================================
  describe('getProcessingLog', () => {
    it('sends GET to correct URL with document ID', async () => {
      const logData = makeLog()
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: logData })
      )

      await getProcessingLog('doc-001')

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/processing-log/doc-001'
      )
    })

    it('does not send request body or method for GET', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() })
      )

      await getProcessingLog('doc-001')

      // GET requests should only have the URL argument
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String)
      )
      expect(mockFetch.mock.calls[0]).toHaveLength(1)
    })

    it('returns the log data on success', async () => {
      const logData = makeLog({
        document_id: 'doc-result',
        filename: 'result-policy.pdf',
        ai_provider: 'anthropic',
        extraction_confidence: 0.95,
        stages: [
          makeStage({ stage: 'upload', status: 'completed' }),
          makeStage({ stage: 'pdf_extraction', status: 'completed' }),
          makeStage({ stage: 'ai_extraction', status: 'completed' }),
        ],
      })
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: logData })
      )

      const result = await getProcessingLog('doc-result')

      expect(result).toEqual(logData)
      expect(result!.document_id).toBe('doc-result')
      expect(result!.stages).toHaveLength(3)
      expect(result!.ai_provider).toBe('anthropic')
    })

    it('returns null when API responds with success: false', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Not found' })
      )

      const result = await getProcessingLog('nonexistent')

      expect(result).toBeNull()
    })

    it('does not log console.error for success: false (no error log in source)', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Not found' })
      )

      await getProcessingLog('nonexistent')

      // getProcessingLog does NOT call console.error for success: false
      // (unlike create and update which do log)
      expect(console.error).not.toHaveBeenCalled()
    })

    it('returns null and logs error when fetch throws', async () => {
      const error = new Error('DNS resolution failed')
      mockFetch.mockRejectedValueOnce(error)

      const result = await getProcessingLog('doc-001')

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Get error:',
        error
      )
    })

    it('returns null when response.json() throws', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      } as Response)

      const result = await getProcessingLog('doc-bad-json')

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Get error:',
        expect.any(SyntaxError)
      )
    })

    it('returns a log with extracted summary', async () => {
      const logData = makeLog({
        extracted_summary: {
          policy_number: 'POL-2026-001',
          provider: 'Allianz Sigorta',
          type: 'kasko',
          type_tr: 'Kasko',
          insured_person: 'Ahmet Yilmaz',
          premium: 15000,
          coverage: 500000,
          start_date: '2026-01-01',
          expiry_date: '2027-01-01',
        },
      })
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: logData })
      )

      const result = await getProcessingLog('doc-with-summary')

      expect(result!.extracted_summary).toBeDefined()
      expect(result!.extracted_summary!.policy_number).toBe('POL-2026-001')
      expect(result!.extracted_summary!.provider).toBe('Allianz Sigorta')
      expect(result!.extracted_summary!.premium).toBe(15000)
    })

    it('returns a log with fallback chain data', async () => {
      const logData = makeLog({
        fallback_used: true,
        fallback_chain: [
          {
            provider: 'anthropic',
            success: false,
            duration_ms: 5000,
            error: 'Billing error',
            error_code: 'ANTHROPIC_BILLING_ERROR',
          },
          {
            provider: 'openai',
            success: true,
            duration_ms: 12000,
          },
        ],
      })
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: logData })
      )

      const result = await getProcessingLog('doc-fallback')

      expect(result!.fallback_used).toBe(true)
      expect(result!.fallback_chain).toHaveLength(2)
      expect(result!.fallback_chain![0].error_code).toBe(
        'ANTHROPIC_BILLING_ERROR'
      )
      expect(result!.fallback_chain![1].success).toBe(true)
    })
  })

  // =========================================================================
  // API_BASE / URL construction
  // =========================================================================
  describe('URL construction', () => {
    it('uses proxyUrl from env module as base URL', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() })
      )

      await getProcessingLog('test-doc')

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:4001/api/ai/processing-log/test-doc'
      )
    })

    it('includes document ID in URL for update', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() })
      )

      await updateProcessingLog('special-doc-id', { status: 'completed' })

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:4001/api/ai/processing-log/special-doc-id'
      )
    })

    it('appends /stage to URL for addProcessingStage', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      await addProcessingStage('my-doc', makeStage())

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:4001/api/ai/processing-log/my-doc/stage'
      )
    })

    it('uses root path for createProcessingLog', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() })
      )

      await createProcessingLog({
        document_id: 'new-doc',
        filename: 'test.pdf',
        stages: [],
        status: 'processing',
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      })

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:4001/api/ai/processing-log'
      )
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles undefined success field in response as falsy', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: makeLog() }) // no success field
      )

      const result = await getProcessingLog('doc-no-success')

      // success is undefined which is falsy, so returns null
      expect(result).toBeNull()
    })

    it('handles empty object response without crashing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}))

      const result = await createProcessingLog({
        document_id: 'doc-empty',
        filename: 'empty.pdf',
        stages: [],
        status: 'processing',
        started_at: '2026-02-17T10:00:00Z',
        ocr_used: false,
        created_at: '2026-02-17T10:00:00Z',
        updated_at: '2026-02-17T10:00:00Z',
      })

      expect(result).toBeNull()
    })

    it('handles non-Error throw in fetch (e.g., string thrown)', async () => {
      mockFetch.mockRejectedValueOnce('Connection timeout')

      const result = await getProcessingLog('doc-string-error')

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[ProcessingLogAPI] Get error:',
        'Connection timeout'
      )
    })

    it('addProcessingStage returns falsy when response has no success field', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'ok' }))

      const result = await addProcessingStage('doc-x', makeStage())

      // data.success is undefined — the function returns data.success directly,
      // so the result is undefined (falsy but not strictly false)
      expect(result).toBeFalsy()
    })

    it('handles HTTP error status but valid JSON with success: true', async () => {
      // The code does not check response.ok, only data.success
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() }, 500)
      )

      const result = await getProcessingLog('doc-500')

      // Returns data because only data.success matters, not HTTP status
      expect(result).not.toBeNull()
    })

    it('handles special characters in document ID', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: makeLog() })
      )

      await getProcessingLog('doc/with/slashes')

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:4001/api/ai/processing-log/doc/with/slashes'
      )
    })
  })
})
