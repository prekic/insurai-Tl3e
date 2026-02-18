/**
 * Branch Coverage Tests for processing-logger.ts
 *
 * Targets uncovered branches:
 * - Constructor: with/without documentId
 * - startStage: auto-fail running stage, pending→processing transition
 * - completeStage: no active stage, full options, without stageStartTime
 * - failStage: no active stage, with/without details
 * - skipStage: string reason, SkipStageOptions, no reason
 * - complete: with/without failed stages
 * - fail: basic failure
 * - failWithDetails: Error vs string, with/without context, navigator check
 * - getElapsedTime: completed vs in-progress
 * - persist: with callback, callback error, no callback
 * - serialize/deserialize
 * - resumeProcessingLogger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ProcessingLogger,
  createProcessingLogger,
  resumeProcessingLogger,
  serializeProcessingLog,
  deserializeProcessingLog,
} from './processing-logger'

beforeEach(() => {
  vi.restoreAllMocks()
})

// ==================================================================
// Constructor & Factory
// ==================================================================
describe('ProcessingLogger constructor', () => {
  it('creates logger with auto-generated documentId', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    expect(logger.getDocumentId()).toBeDefined()
    expect(logger.getDocumentId().length).toBeGreaterThan(0)
  })

  it('creates logger with provided documentId', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' }, 'custom-id')
    expect(logger.getDocumentId()).toBe('custom-id')
  })

  it('initializes with pending status', () => {
    const logger = createProcessingLogger({
      filename: 'test.pdf',
      file_size: 1024,
      mime_type: 'application/pdf',
      user_id: 'u1',
    })
    const log = logger.getLog()
    expect(log.status).toBe('pending')
    expect(log.filename).toBe('test.pdf')
    expect(log.file_size).toBe(1024)
    expect(log.mime_type).toBe('application/pdf')
    expect(log.user_id).toBe('u1')
    expect(log.stages).toEqual([])
    expect(log.ocr_used).toBe(false)
  })
})

// ==================================================================
// startStage
// ==================================================================
describe('startStage', () => {
  it('starts a new stage', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction', { pages: 5 })
    const log = logger.getLog()
    expect(log.stages).toHaveLength(1)
    expect(log.stages[0].stage).toBe('pdf_extraction')
    expect(log.stages[0].status).toBe('running')
    expect(log.stages[0].input).toEqual({ pages: 5 })
  })

  it('transitions status from pending to processing', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    expect(logger.getLog().status).toBe('pending')
    logger.startStage('pdf_extraction')
    expect(logger.getLog().status).toBe('processing')
  })

  it('does not re-transition if already processing', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    logger.startStage('text_preprocessing')
    expect(logger.getLog().status).toBe('processing')
  })

  it('auto-fails current running stage when starting a new one', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.startStage('text_preprocessing') // Should auto-fail pdf_extraction
    const log = logger.getLog()
    expect(log.stages).toHaveLength(2)
    expect(log.stages[0].status).toBe('failed')
    expect(log.stages[0].error).toBe('Stage interrupted by new stage')
    expect(log.stages[1].status).toBe('running')
  })
})

// ==================================================================
// completeStage
// ==================================================================
describe('completeStage', () => {
  it('warns when no active stage', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.completeStage()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no active stage'))
  })

  it('completes with no options', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    const stage = logger.getLog().stages[0]
    expect(stage.status).toBe('completed')
    expect(stage.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('completes with full options', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('text_preprocessing')
    logger.completeStage({
      output: { text_length: 500 },
      metadata: { custom: 'data' },
      full_input_text: 'input text',
      full_output_text: 'output text',
      full_extracted_json: '{"key":"value"}',
      diff_summary: {
        characters_added: 10,
        characters_removed: 5,
        lines_changed: 3,
        major_changes: ['Fixed spacing'],
      },
    })
    const stage = logger.getLog().stages[0]
    expect(stage.full_input_text).toBe('input text')
    expect(stage.full_output_text).toBe('output text')
    expect(stage.full_extracted_json).toBe('{"key":"value"}')
    expect(stage.diff_summary?.characters_added).toBe(10)
    expect(stage.output?.text_length).toBe(500)
    expect(stage.metadata?.custom).toBe('data')
  })
})

// ==================================================================
// failStage
// ==================================================================
describe('failStage', () => {
  it('warns when no active stage', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.failStage('error')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no active stage'))
  })

  it('fails the current stage with error', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('ai_extraction')
    logger.failStage('Timeout', { provider: 'openai' })
    const log = logger.getLog()
    expect(log.stages[0].status).toBe('failed')
    expect(log.stages[0].error).toBe('Timeout')
    expect(log.error_stage).toBe('ai_extraction')
    expect(log.error_message).toBe('Timeout')
    expect(log.error_details).toEqual({ provider: 'openai' })
  })
})

// ==================================================================
// skipStage
// ==================================================================
describe('skipStage', () => {
  it('skips with a simple string reason', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.skipStage('ocr_processing', 'Text density sufficient')
    const stage = logger.getLog().stages[0]
    expect(stage.status).toBe('skipped')
    expect(stage.metadata?.skip_reason).toBe('Text density sufficient')
    expect(stage.decision_context).toBeUndefined()
  })

  it('skips with detailed SkipStageOptions', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.skipStage('ocr_processing', {
      reason: 'Text density sufficient',
      decision_context: {
        assessment_performed: 'Text density analysis',
        threshold: { name: 'chars_per_page', value: 200, comparison: 'less_than' },
        actual_values: { chars_per_page: 12000 },
        decision_logic: 'Text density 12000 >= 200 threshold',
        alternatives: ['OCR triggered if chars_per_page < 200'],
      },
    })
    const stage = logger.getLog().stages[0]
    expect(stage.metadata?.skip_reason).toBe('Text density sufficient')
    expect(stage.decision_context?.assessment_performed).toBe('Text density analysis')
    expect(stage.decision_context?.threshold?.name).toBe('chars_per_page')
    expect(stage.decision_context?.alternatives).toHaveLength(1)
  })

  it('skips with no reason', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.skipStage('form_field_enhancement')
    const stage = logger.getLog().stages[0]
    expect(stage.status).toBe('skipped')
    expect(stage.metadata).toBeUndefined()
  })
})

// ==================================================================
// Setters
// ==================================================================
describe('setter methods', () => {
  it('setPageCount', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setPageCount(5)
    expect(logger.getLog().page_count).toBe(5)
  })

  it('setOCRUsed', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setOCRUsed('google_vision')
    const log = logger.getLog()
    expect(log.ocr_used).toBe(true)
    expect(log.ocr_engine).toBe('google_vision')
  })

  it('setAIProvider', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setAIProvider('openai')
    expect(logger.getLog().ai_provider).toBe('openai')
  })

  it('setRequestId', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setRequestId('req-123')
    expect(logger.getLog().request_id).toBe('req-123')
  })

  it('setExtractionRoute', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setExtractionRoute('/api/ai/extract/openai')
    expect(logger.getLog().extraction_route).toBe('/api/ai/extract/openai')
  })

  it('setExtractionMode', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setExtractionMode('proxy')
    expect(logger.getLog().extraction_mode).toBe('proxy')
  })

  it('setFallbackInfo', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setFallbackInfo({
      fallback_used: true,
      chain: [
        { provider: 'openai', success: false, error: 'Timeout', duration_ms: 5000 },
        { provider: 'anthropic', success: true, duration_ms: 3000 },
      ],
    })
    const log = logger.getLog()
    expect(log.fallback_used).toBe(true)
    expect(log.fallback_chain).toHaveLength(2)
  })

  it('setExtractionConfidence', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setExtractionConfidence(0.95)
    expect(logger.getLog().extraction_confidence).toBe(0.95)
  })

  it('setExtractedSummary', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setExtractedSummary({
      policy_number: 'P-001',
      provider: 'Allianz',
      type: 'kasko',
    } as any)
    expect(logger.getLog().extracted_summary?.policy_number).toBe('P-001')
  })

  it('setPolicyId', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setPolicyId('pol-123')
    expect(logger.getLog().policy_id).toBe('pol-123')
  })
})

// ==================================================================
// complete
// ==================================================================
describe('complete', () => {
  it('sets status to completed when no failed stages', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    logger.complete()
    const log = logger.getLog()
    expect(log.status).toBe('completed')
    expect(log.completed_at).toBeDefined()
    expect(log.total_duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('sets status to partial when there are failed stages', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.failStage('error')
    logger.startStage('ai_extraction')
    logger.completeStage()
    logger.complete()
    expect(logger.getLog().status).toBe('partial')
  })
})

// ==================================================================
// fail
// ==================================================================
describe('fail', () => {
  it('marks the entire log as failed', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.fail('Network error', { code: 'NETWORK_ERROR' })
    const log = logger.getLog()
    expect(log.status).toBe('failed')
    expect(log.error_message).toBe('Network error')
    expect(log.error_details).toEqual({ code: 'NETWORK_ERROR' })
    expect(log.total_duration_ms).toBeGreaterThanOrEqual(0)
  })
})

// ==================================================================
// failWithDetails
// ==================================================================
describe('failWithDetails', () => {
  it('handles Error objects', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('ai_extraction')
    const err = new TypeError('Cannot read property')
    logger.failWithDetails(err, {
      extraction_provider: 'openai',
      document_length: 5000,
      ocr_used: true,
    })
    const log = logger.getLog()
    expect(log.status).toBe('failed')
    expect(log.error_message).toBe('Cannot read property')
    expect(log.error_stack).toBeDefined()
    expect(log.error_type).toBe('TypeError')
    expect(log.error_stage).toBe('ai_extraction')
    expect(log.error_context?.extraction_provider).toBe('openai')
    expect(log.error_context?.document_length).toBe(5000)
    expect(log.error_context?.ocr_used).toBe(true)
  })

  it('handles string errors', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.failWithDetails('Simple error message')
    const log = logger.getLog()
    expect(log.error_message).toBe('Simple error message')
    expect(log.error_type).toBe('Unknown')
    expect(log.error_stack).toBeUndefined()
  })

  it('finds last successful stage', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    logger.startStage('text_preprocessing')
    logger.completeStage()
    logger.startStage('ai_extraction')
    logger.failWithDetails('AI error')
    const log = logger.getLog()
    expect(log.error_context?.last_successful_stage).toBe('text_preprocessing')
  })

  it('uses log.ai_provider when context provider not provided', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setAIProvider('anthropic')
    logger.failWithDetails('error')
    expect(logger.getLog().error_context?.extraction_provider).toBe('anthropic')
  })

  it('uses log.ocr_used when context ocr_used not provided', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setOCRUsed('google_vision')
    logger.failWithDetails('error')
    expect(logger.getLog().error_context?.ocr_used).toBe(true)
  })
})

// ==================================================================
// getStage and isStageCompleted
// ==================================================================
describe('getStage and isStageCompleted', () => {
  it('returns undefined for missing stage', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    expect(logger.getStage('pdf_extraction')).toBeUndefined()
  })

  it('returns the stage record', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    const stage = logger.getStage('pdf_extraction')
    expect(stage?.status).toBe('completed')
  })

  it('isStageCompleted returns true for completed stage', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    expect(logger.isStageCompleted('pdf_extraction')).toBe(true)
  })

  it('isStageCompleted returns false for incomplete stage', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    expect(logger.isStageCompleted('pdf_extraction')).toBe(false)
  })

  it('isStageCompleted returns false for missing stage', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    expect(logger.isStageCompleted('pdf_extraction')).toBe(false)
  })
})

// ==================================================================
// getElapsedTime
// ==================================================================
describe('getElapsedTime', () => {
  it('returns elapsed time for in-progress log', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    const elapsed = logger.getElapsedTime()
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('returns total time for completed log', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage()
    logger.complete()
    const elapsed = logger.getElapsedTime()
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })
})

// ==================================================================
// toJSON
// ==================================================================
describe('toJSON', () => {
  it('returns a copy of the log', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    const json = logger.toJSON()
    expect(json.filename).toBe('test.pdf')
    expect(json).not.toBe(logger.getLog())
  })
})

// ==================================================================
// persist callback
// ==================================================================
describe('persist callback', () => {
  it('calls persist callback on stage changes', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setPersistCallback(callback)

    logger.startStage('pdf_extraction')
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1))

    logger.completeStage()
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(2))
  })

  it('handles persist callback errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const callback = vi.fn().mockRejectedValue(new Error('DB error'))
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.setPersistCallback(callback)

    logger.startStage('pdf_extraction')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist'),
      expect.any(Error)
    ))
  })
})

// ==================================================================
// resumeProcessingLogger
// ==================================================================
describe('resumeProcessingLogger', () => {
  it('creates a logger from existing log', () => {
    const existingLog = {
      document_id: 'existing-id',
      filename: 'resume.pdf',
      file_size: 2048,
      mime_type: 'application/pdf',
      user_id: 'u1',
      stages: [],
      status: 'processing' as const,
      started_at: new Date().toISOString(),
      ocr_used: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const logger = resumeProcessingLogger(existingLog)
    expect(logger.getDocumentId()).toBe('existing-id')
  })
})

// ==================================================================
// serialize/deserialize
// ==================================================================
describe('serializeProcessingLog and deserializeProcessingLog', () => {
  it('round-trips a processing log', () => {
    const logger = createProcessingLogger({ filename: 'test.pdf' })
    logger.startStage('pdf_extraction')
    logger.completeStage({ output: { pages: 3 } })
    logger.complete()

    const serialized = serializeProcessingLog(logger.getLog())
    expect(typeof serialized).toBe('string')

    const deserialized = deserializeProcessingLog(serialized)
    expect(deserialized.filename).toBe('test.pdf')
    expect(deserialized.stages).toHaveLength(1)
    expect(deserialized.status).toBe('completed')
  })
})
