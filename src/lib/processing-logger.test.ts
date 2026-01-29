/**
 * Processing Logger Tests
 *
 * Tests for the ProcessingLogger class and its error tracking capabilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createProcessingLogger,
  serializeProcessingLog,
  deserializeProcessingLog,
  type ProcessingLogger,
} from './processing-logger'

// Type alias to satisfy eslint - ProcessingLogger is used for type checking
type _Logger = ProcessingLogger

describe('ProcessingLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createProcessingLogger', () => {
    it('should create a new logger with initial state', () => {
      const logger = createProcessingLogger({
        filename: 'test.pdf',
        file_size: 1024,
        mime_type: 'application/pdf',
        user_id: 'user-123',
      })

      const log = logger.getLog()
      expect(log.filename).toBe('test.pdf')
      expect(log.file_size).toBe(1024)
      expect(log.mime_type).toBe('application/pdf')
      expect(log.user_id).toBe('user-123')
      expect(log.status).toBe('pending')
      expect(log.stages).toEqual([])
      expect(log.ocr_used).toBe(false)
    })

    it('should generate a document ID if not provided', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      expect(logger.getDocumentId()).toBeTruthy()
      expect(logger.getDocumentId().length).toBeGreaterThan(0)
    })

    it('should use provided document ID', () => {
      const logger = createProcessingLogger(
        { filename: 'test.pdf' },
        'custom-doc-id'
      )
      expect(logger.getDocumentId()).toBe('custom-doc-id')
    })
  })

  describe('stage management', () => {
    it('should start a new stage', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction', { filename: 'test.pdf' })

      const log = logger.getLog()
      expect(log.stages.length).toBe(1)
      expect(log.stages[0].stage).toBe('pdf_extraction')
      expect(log.stages[0].status).toBe('running')
      expect(log.stages[0].input).toEqual({ filename: 'test.pdf' })
      expect(log.status).toBe('processing')
    })

    it('should complete a stage', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage({ output: { pages: 5 }, metadata: { parser: 'pdf.js' } })

      const log = logger.getLog()
      expect(log.stages[0].status).toBe('completed')
      expect(log.stages[0].output).toEqual({ pages: 5 })
      expect(log.stages[0].metadata).toEqual({ parser: 'pdf.js' })
      expect(log.stages[0].duration_ms).toBeDefined()
    })

    it('should skip a stage with reason', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.skipStage('ocr_processing', 'Text density sufficient')

      const log = logger.getLog()
      expect(log.stages.length).toBe(1)
      expect(log.stages[0].stage).toBe('ocr_processing')
      expect(log.stages[0].status).toBe('skipped')
      expect(log.stages[0].metadata?.skip_reason).toBe('Text density sufficient')
    })

    it('should fail a stage with error', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('ai_extraction')
      logger.failStage('API rate limit exceeded', { retry_after: 60 })

      const log = logger.getLog()
      expect(log.stages[0].status).toBe('failed')
      expect(log.stages[0].error).toBe('API rate limit exceeded')
      expect(log.stages[0].metadata?.error_details).toEqual({ retry_after: 60 })
      expect(log.error_stage).toBe('ai_extraction')
      expect(log.error_message).toBe('API rate limit exceeded')
    })
  })

  describe('fail method', () => {
    it('should mark processing as failed', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()
      logger.startStage('ai_extraction')
      logger.fail('Extraction failed', { reason: 'API error' })

      const log = logger.getLog()
      expect(log.status).toBe('failed')
      expect(log.error_message).toBe('Extraction failed')
      expect(log.error_details).toEqual({ reason: 'API error' })
      expect(log.completed_at).toBeDefined()
      expect(log.total_duration_ms).toBeDefined()
    })
  })

  describe('failWithDetails method', () => {
    it('should capture full error details from Error object', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()
      logger.startStage('ai_extraction')

      const error = new TypeError('Cannot read property "confidence" of undefined')
      logger.failWithDetails(error, {
        extraction_provider: 'openai',
        document_length: 5000,
        ocr_used: false,
        data_at_failure: { policyNumber: 'POL-123' },
      })

      const log = logger.getLog()
      expect(log.status).toBe('failed')
      expect(log.error_message).toBe('Cannot read property "confidence" of undefined')
      expect(log.error_type).toBe('TypeError')
      expect(log.error_stack).toBeDefined()
      expect(log.error_stack).toContain('TypeError')
      expect(log.error_stage).toBe('ai_extraction')
      expect(log.error_context).toBeDefined()
      expect(log.error_context?.extraction_provider).toBe('openai')
      expect(log.error_context?.document_length).toBe(5000)
      expect(log.error_context?.ocr_used).toBe(false)
      expect(log.error_context?.last_successful_stage).toBe('pdf_extraction')
      expect(log.error_context?.data_at_failure).toEqual({ policyNumber: 'POL-123' })
      expect(log.error_context?.timestamp).toBeDefined()
    })

    it('should handle string errors', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('ai_extraction')

      logger.failWithDetails('Simple error message', {
        extraction_provider: 'anthropic',
      })

      const log = logger.getLog()
      expect(log.error_message).toBe('Simple error message')
      expect(log.error_type).toBe('Unknown')
      expect(log.error_stack).toBeUndefined()
      expect(log.error_context?.extraction_provider).toBe('anthropic')
    })

    it('should track last successful stage', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })

      // Complete several stages
      logger.startStage('pdf_extraction')
      logger.completeStage()
      logger.startStage('ocr_check')
      logger.completeStage()
      logger.startStage('text_preprocessing')
      logger.completeStage()
      logger.startStage('ai_extraction')

      // Fail at ai_extraction
      logger.failWithDetails(new Error('AI error'))

      const log = logger.getLog()
      expect(log.error_context?.last_successful_stage).toBe('text_preprocessing')
    })

    it('should handle no previous successful stages', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')

      // Fail immediately at first stage
      logger.failWithDetails(new Error('PDF parse error'))

      const log = logger.getLog()
      expect(log.error_context?.last_successful_stage).toBeUndefined()
    })

    it('should use logger AI provider if not provided in context', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setAIProvider('openai')
      logger.startStage('ai_extraction')
      logger.failWithDetails(new Error('API error'))

      const log = logger.getLog()
      expect(log.error_context?.extraction_provider).toBe('openai')
    })

    it('should use logger OCR status if not provided in context', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setOCRUsed('document-ai')
      logger.startStage('ai_extraction')
      logger.failWithDetails(new Error('API error'))

      const log = logger.getLog()
      expect(log.error_context?.ocr_used).toBe(true)
    })

    it('should include browser info', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('ai_extraction')
      logger.failWithDetails(new Error('Error'))

      const log = logger.getLog()
      expect(log.error_context?.browser_info).toBeDefined()
    })

    it('should capture custom error types', () => {
      class CustomExtractionError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomExtractionError'
        }
      }

      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('ai_extraction')
      logger.failWithDetails(new CustomExtractionError('Custom error'))

      const log = logger.getLog()
      expect(log.error_type).toBe('CustomExtractionError')
    })
  })

  describe('complete method', () => {
    it('should mark processing as completed', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()
      logger.complete()

      const log = logger.getLog()
      expect(log.status).toBe('completed')
      expect(log.completed_at).toBeDefined()
      expect(log.total_duration_ms).toBeDefined()
    })

    it('should mark as partial if any stage failed', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()
      logger.startStage('ocr_check')
      logger.failStage('OCR check failed')
      logger.complete()

      const log = logger.getLog()
      expect(log.status).toBe('partial')
    })
  })

  describe('metadata setters', () => {
    it('should set page count', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setPageCount(10)
      expect(logger.getLog().page_count).toBe(10)
    })

    it('should set OCR used', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setOCRUsed('tesseract')
      const log = logger.getLog()
      expect(log.ocr_used).toBe(true)
      expect(log.ocr_engine).toBe('tesseract')
    })

    it('should set AI provider', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setAIProvider('anthropic')
      expect(logger.getLog().ai_provider).toBe('anthropic')
    })

    it('should set extraction confidence', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setExtractionConfidence(85)
      expect(logger.getLog().extraction_confidence).toBe(85)
    })

    it('should set extracted summary', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setExtractedSummary({
        policy_number: 'POL-123',
        provider: 'Allianz',
        type: 'kasko',
        premium: 5000,
      })
      const log = logger.getLog()
      expect(log.extracted_summary?.policy_number).toBe('POL-123')
      expect(log.extracted_summary?.provider).toBe('Allianz')
    })

    it('should set policy ID', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setPolicyId('policy-uuid')
      expect(logger.getLog().policy_id).toBe('policy-uuid')
    })
  })

  describe('helper methods', () => {
    it('should get stage by name', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()

      const stage = logger.getStage('pdf_extraction')
      expect(stage).toBeDefined()
      expect(stage?.status).toBe('completed')
    })

    it('should return undefined for non-existent stage', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      const stage = logger.getStage('pdf_extraction')
      expect(stage).toBeUndefined()
    })

    it('should check if stage is completed', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      expect(logger.isStageCompleted('pdf_extraction')).toBe(false)

      logger.completeStage()
      expect(logger.isStageCompleted('pdf_extraction')).toBe(true)
    })

    it('should get elapsed time', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      expect(logger.getElapsedTime()).toBeGreaterThanOrEqual(0)
    })
  })

  describe('persistence callback', () => {
    it('should call persist callback on stage start', async () => {
      const persistCallback = vi.fn().mockResolvedValue(undefined)
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setPersistCallback(persistCallback)

      logger.startStage('pdf_extraction')

      // Wait for async persist
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(persistCallback).toHaveBeenCalled()
    })

    it('should call persist callback on failWithDetails', async () => {
      const persistCallback = vi.fn().mockResolvedValue(undefined)
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setPersistCallback(persistCallback)

      logger.startStage('ai_extraction')
      logger.failWithDetails(new Error('Test error'))

      // Wait for async persist
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(persistCallback).toHaveBeenCalledTimes(2) // Once for start, once for fail
    })

    it('should handle persist callback errors gracefully', async () => {
      const persistCallback = vi.fn().mockRejectedValue(new Error('DB error'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.setPersistCallback(persistCallback)

      logger.startStage('pdf_extraction')

      // Wait for async persist
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
    })
  })

  describe('serialization', () => {
    it('should serialize log to JSON', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()

      const json = serializeProcessingLog(logger.getLog())
      expect(typeof json).toBe('string')
      expect(json).toContain('test.pdf')
      expect(json).toContain('pdf_extraction')
    })

    it('should deserialize JSON to log', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      logger.startStage('pdf_extraction')
      logger.completeStage()
      logger.failWithDetails(new Error('Test'), {
        extraction_provider: 'openai',
        document_length: 1000,
      })

      const json = serializeProcessingLog(logger.getLog())
      const restored = deserializeProcessingLog(json)

      expect(restored.filename).toBe('test.pdf')
      expect(restored.error_message).toBe('Test')
      expect(restored.error_context?.extraction_provider).toBe('openai')
      expect(restored.stages.length).toBe(1)
    })
  })

  describe('toJSON', () => {
    it('should return a copy of the log', () => {
      const logger = createProcessingLogger({ filename: 'test.pdf' })
      const json = logger.toJSON()

      expect(json.filename).toBe('test.pdf')
      // Modifying the returned object should not affect the logger
      json.filename = 'modified.pdf'
      expect(logger.getLog().filename).toBe('test.pdf')
    })
  })
})
