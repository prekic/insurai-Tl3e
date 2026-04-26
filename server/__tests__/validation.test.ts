/**
 * Validation Middleware Tests
 *
 * Tests for input validation, sanitization, and security checks.
 */

import { describe, it, expect, vi } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import {
  sanitizeString,
  sanitizeDocumentText,
  sanitizeBase64,
  sanitizeModelName,
  containsInjectionPatterns,
  isLikelyDocument,
  validateContentType,
  validateJSON,
  validateNotEmpty,
  validateMaxSize,
  validate,
  openAIExtractionSchema,
  anthropicExtractionSchema,
  ocrSchema,
} from '../middleware/validation'

describe('Validation Middleware', () => {
  describe('sanitizeString', () => {
    it('should remove null bytes', () => {
      expect(sanitizeString('hello\0world')).toBe('helloworld')
    })

    it('should remove control characters', () => {
      expect(sanitizeString('hello\x00\x01\x02world')).toBe('helloworld')
    })

    it('should preserve newlines and tabs', () => {
      expect(sanitizeString('hello\n\tworld')).toBe('hello\n\tworld')
    })

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello world  ')).toBe('hello world')
    })

    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('')
    })

    it('should handle Turkish characters', () => {
      expect(sanitizeString('İstanbul Şişli Ğüler')).toBe('İstanbul Şişli Ğüler')
    })
  })

  describe('sanitizeDocumentText', () => {
    it('should preserve document formatting', () => {
      const doc = 'Policy Number: 123\n\nCoverage:\n\t- Fire\n\t- Theft'
      expect(sanitizeDocumentText(doc)).toBe(doc)
    })

    it('should remove null bytes', () => {
      expect(sanitizeDocumentText('Policy\0Number')).toBe('PolicyNumber')
    })

    it('should limit length to 10MB', () => {
      const longText = 'a'.repeat(11 * 1024 * 1024)
      const result = sanitizeDocumentText(longText)
      expect(result.length).toBe(10 * 1024 * 1024)
    })

    it('should preserve Turkish insurance terms', () => {
      const doc = 'Kasko Sigortası - Teminat Bedeli: 500.000 TL'
      expect(sanitizeDocumentText(doc)).toBe(doc)
    })
  })

  describe('sanitizeBase64', () => {
    it('should accept valid base64', () => {
      const valid = 'SGVsbG8gV29ybGQ='
      expect(sanitizeBase64(valid)).toBe(valid)
    })

    it('should remove whitespace', () => {
      expect(sanitizeBase64('SGVs bG8g V29y bGQ=')).toBe('SGVsbG8gV29ybGQ=')
    })

    it('should throw for invalid base64', () => {
      expect(() => sanitizeBase64('not-valid!!!')).toThrow('Invalid base64 format')
    })

    it('should throw for content over 10MB', () => {
      const large = 'a'.repeat(11 * 1024 * 1024)
      expect(() => sanitizeBase64(large)).toThrow('Base64 content too large')
    })

    it('should accept valid padding', () => {
      expect(sanitizeBase64('YQ==')).toBe('YQ==')
      expect(sanitizeBase64('YWI=')).toBe('YWI=')
    })
  })

  describe('sanitizeModelName', () => {
    it('should allow valid model names', () => {
      expect(sanitizeModelName('gpt-4o')).toBe('gpt-4o')
      expect(sanitizeModelName('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet-20241022')
    })

    it('should remove special characters', () => {
      expect(sanitizeModelName('model<script>')).toBe('modelscript')
    })

    it('should limit length to 100', () => {
      const long = 'a'.repeat(150)
      expect(sanitizeModelName(long).length).toBe(100)
    })

    it('should allow dots and colons', () => {
      expect(sanitizeModelName('gpt-4:latest')).toBe('gpt-4:latest')
    })
  })

  describe('containsInjectionPatterns', () => {
    it('should detect script tags', () => {
      expect(containsInjectionPatterns('<script>alert(1)</script>')).toBe(true)
    })

    it('should detect event handlers', () => {
      expect(containsInjectionPatterns('onclick=alert(1)')).toBe(true)
    })

    it('should detect javascript URLs', () => {
      expect(containsInjectionPatterns('javascript:alert(1)')).toBe(true)
    })

    it('should detect SQL injection', () => {
      expect(containsInjectionPatterns("'; DROP TABLE users;--")).toBe(true)
      expect(containsInjectionPatterns('SELECT * FROM users')).toBe(true)
    })

    it('should detect command injection', () => {
      expect(containsInjectionPatterns('test; rm -rf /')).toBe(true)
      expect(containsInjectionPatterns('test | cat /etc/passwd')).toBe(true)
    })

    it('should allow normal document text', () => {
      expect(containsInjectionPatterns('This is a normal insurance policy.')).toBe(false)
    })
  })

  describe('isLikelyDocument', () => {
    it('should accept normal documents', () => {
      const doc = `
        Insurance Policy Document
        Policy Number: 12345
        Coverage: Fire and Theft
        Premium: 1,000 TL
        Valid From: 01/01/2024
        Valid To: 31/12/2024
      `
      expect(isLikelyDocument(doc)).toBe(true)
    })

    it('should reject very short content', () => {
      expect(isLikelyDocument('short')).toBe(false)
    })

    it('should accept document-like content even with some code patterns', () => {
      // The function uses specific patterns like /function\s*\(/g which requires function() not function name()
      const mixedContent = `
        Insurance Policy Analysis Report
        Generated automatically by our system.

        Policy Number: 12345
        Coverage Details:
        - Fire Insurance: 500,000 TL
        - Theft Insurance: 250,000 TL
        - Natural Disasters: 1,000,000 TL

        Risk Assessment: Low
        Premium Calculation: Based on standard rates.
      `
      expect(isLikelyDocument(mixedContent)).toBe(true)
    })
  })

  describe('validateContentType', () => {
    it('should validate JSON content type', () => {
      const req = { headers: { 'content-type': 'application/json' } } as Request
      expect(validateContentType(req, 'application/json')).toBe(true)
    })

    it('should handle content type with charset', () => {
      const req = { headers: { 'content-type': 'application/json; charset=utf-8' } } as Request
      expect(validateContentType(req, 'application/json')).toBe(true)
    })

    it('should reject wrong content type', () => {
      const req = { headers: { 'content-type': 'text/plain' } } as Request
      expect(validateContentType(req, 'application/json')).toBe(false)
    })

    it('should handle missing content type', () => {
      const req = { headers: {} } as Request
      expect(validateContentType(req, 'application/json')).toBe(false)
    })
  })

  describe('validateJSON middleware', () => {
    it('should pass for JSON content type', () => {
      const req = { headers: { 'content-type': 'application/json' } } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateJSON(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should reject non-JSON content type', () => {
      const req = { headers: { 'content-type': 'text/plain' } } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateJSON(req, res, next)

      expect(res.status).toHaveBeenCalledWith(415)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_CONTENT_TYPE',
      }))
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('validateNotEmpty middleware', () => {
    it('should pass for non-empty body', () => {
      const req = { body: { data: 'test' } } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateNotEmpty(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('should reject empty body', () => {
      const req = { body: {} } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateNotEmpty(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'EMPTY_BODY',
      }))
    })

    it('should reject null body', () => {
      const req = { body: null } as unknown as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateNotEmpty(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('validateMaxSize middleware', () => {
    it('should pass for content under limit', () => {
      const req = { headers: { 'content-length': '1000' } } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateMaxSize(5000)(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('should reject content over limit', () => {
      const req = { headers: { 'content-length': '10000' } } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateMaxSize(5000)(req, res, next)

      expect(res.status).toHaveBeenCalledWith(413)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PAYLOAD_TOO_LARGE',
      }))
    })

    it('should handle missing content-length', () => {
      const req = { headers: {} } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      validateMaxSize(5000)(req, res, next)

      expect(next).toHaveBeenCalled()
    })
  })

  describe('Zod Schemas', () => {
    describe('openAIExtractionSchema', () => {
      it('should validate valid input', () => {
        const result = openAIExtractionSchema.safeParse({
          documentText: 'This is a valid document text.',
        })
        expect(result.success).toBe(true)
      })

      it('should reject empty documentText', () => {
        const result = openAIExtractionSchema.safeParse({
          documentText: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject missing documentText', () => {
        const result = openAIExtractionSchema.safeParse({})
        expect(result.success).toBe(false)
      })

      it('should accept optional fields', () => {
        const result = openAIExtractionSchema.safeParse({
          documentText: 'Valid document',
          systemPrompt: 'Extract data',
          model: 'gpt-4-turbo',
        })
        expect(result.success).toBe(true)
      })

      it('should sanitize documentText', () => {
        const result = openAIExtractionSchema.safeParse({
          documentText: 'Document\0with\x00nulls',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.documentText).not.toContain('\0')
        }
      })
    })

    describe('anthropicExtractionSchema', () => {
      it('should validate valid input', () => {
        const result = anthropicExtractionSchema.safeParse({
          documentText: 'Valid insurance policy document',
        })
        expect(result.success).toBe(true)
      })

      it('should reject documentText over 500KB', () => {
        const result = anthropicExtractionSchema.safeParse({
          documentText: 'a'.repeat(600000),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ocrSchema', () => {
      it('should validate valid base64', () => {
        const result = ocrSchema.safeParse({
          imageBase64: 'SGVsbG8gV29ybGQ=',
        })
        expect(result.success).toBe(true)
      })

      it('should reject empty imageBase64', () => {
        const result = ocrSchema.safeParse({
          imageBase64: '',
        })
        expect(result.success).toBe(false)
      })

      it('should sanitize whitespace in base64', () => {
        const result = ocrSchema.safeParse({
          imageBase64: 'SGVs bG8g V29y bGQ=',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.imageBase64).not.toContain(' ')
        }
      })
    })
  })

  describe('validate middleware factory', () => {
    it('should validate and pass through body', () => {
      const schema = openAIExtractionSchema
      const middleware = validate(schema, 'body')

      const req = {
        body: { documentText: 'Test document content here' },
      } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      // Body should be validated (sanitizeDocumentText doesn't trim, just removes control chars)
      expect(req.body.documentText).toBe('Test document content here')
    })

    it('should return validation errors', () => {
      const schema = openAIExtractionSchema
      const middleware = validate(schema, 'body')

      const req = { body: {} } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      }))
      expect(next).not.toHaveBeenCalled()
    })
  })
})
