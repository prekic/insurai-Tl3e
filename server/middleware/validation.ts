/**
 * Input Validation Middleware
 *
 * Provides comprehensive request validation using Zod schemas.
 * Includes sanitization, type checking, and security filtering.
 */

import { z, ZodError, ZodSchema } from 'zod'
import type { Request, Response, NextFunction } from 'express'

// =============================================================================
// Sanitization Utilities
// =============================================================================

/**
 * Remove potentially dangerous characters from strings
 */
export function sanitizeString(input: string): string {
  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newlines and tabs)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim excessive whitespace
    .trim()
}

/**
 * Sanitize text that may contain document content
 * More permissive than general string sanitization
 */
export function sanitizeDocumentText(input: string): string {
  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove most control characters (keep newlines, tabs, carriage returns)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Limit length to prevent abuse (10MB text limit)
    .slice(0, 10 * 1024 * 1024)
}

/**
 * Validate and sanitize base64 content
 */
export function sanitizeBase64(input: string): string {
  // Remove any whitespace/newlines that might have been added
  const cleaned = input.replace(/\s/g, '')

  // Validate base64 format
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Invalid base64 format')
  }

  // Limit size (10MB base64 = ~7.5MB decoded)
  if (cleaned.length > 10 * 1024 * 1024) {
    throw new Error('Base64 content too large')
  }

  return cleaned
}

/**
 * Sanitize model name to prevent injection
 */
export function sanitizeModelName(input: string): string {
  // Only allow alphanumeric, hyphens, underscores, dots, and colons
  return input.replace(/[^a-zA-Z0-9\-_.:]/g, '').slice(0, 100)
}

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Schema for OpenAI extraction request
 */
export const openAIExtractionSchema = z.object({
  documentText: z
    .string()
    .min(1, 'Document text is required')
    .max(500000, 'Document text too long (max 500KB)')
    .transform(sanitizeDocumentText),
  systemPrompt: z
    .string()
    .max(10000, 'System prompt too long')
    .optional()
    .transform((val) => (val ? sanitizeString(val) : undefined)),
  model: z
    .string()
    .max(100)
    .optional()
    .transform((val) => (val ? sanitizeModelName(val) : undefined)),
})

/**
 * Schema for Anthropic extraction request
 */
export const anthropicExtractionSchema = z.object({
  documentText: z
    .string()
    .min(1, 'Document text is required')
    .max(500000, 'Document text too long (max 500KB)')
    .transform(sanitizeDocumentText),
  systemPrompt: z
    .string()
    .max(10000, 'System prompt too long')
    .optional()
    .transform((val) => (val ? sanitizeString(val) : undefined)),
  model: z
    .string()
    .max(100)
    .optional()
    .transform((val) => (val ? sanitizeModelName(val) : undefined)),
})

/**
 * Schema for OCR request
 */
export const ocrSchema = z.object({
  imageBase64: z
    .string()
    .min(1, 'Image data is required')
    .max(15 * 1024 * 1024, 'Image too large (max 15MB base64)')
    .transform(sanitizeBase64),
})

// =============================================================================
// Validation Middleware Factory
// =============================================================================

/**
 * Create validation middleware for a given Zod schema
 */
export function validate<T extends ZodSchema>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source]

      // Parse and validate
      const result = schema.safeParse(data)

      if (!result.success) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: formatZodError(result.error),
        })
      }

      // Replace request data with validated/sanitized data
      req[source] = result.data as typeof req[typeof source]

      next()
    } catch (error) {
      // Only log validation errors in development
      if (process.env.NODE_ENV !== 'production') {
        console.error('Validation middleware error:', error)
      }
      return res.status(400).json({
        error: 'Invalid request data',
        code: 'VALIDATION_ERROR',
      })
    }
  }
}

/**
 * Format Zod errors for API response
 */
function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }))
}

// =============================================================================
// Security Validation Helpers
// =============================================================================

/**
 * Check for common injection patterns
 */
export function containsInjectionPatterns(input: string): boolean {
  const patterns = [
    // Script injection
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    // Event handlers
    /on\w+\s*=/gi,
    // JavaScript URLs
    /javascript:/gi,
    // Data URLs (potential XSS)
    /data:text\/html/gi,
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/gi,
    // Command injection patterns
    /[;&|`$]/,
  ]

  return patterns.some((pattern) => pattern.test(input))
}

/**
 * Validate that content is likely a document (not malicious code)
 */
export function isLikelyDocument(text: string): boolean {
  // Check minimum meaningful content
  if (text.length < 50) return false

  // Check for excessive code-like patterns
  const codePatterns = [
    /function\s*\(/g,
    /=>\s*\{/g,
    /class\s+\w+/g,
    /<\?php/gi,
    /require\s*\(/g,
    /import\s+.*from/g,
  ]

  let codeMatchCount = 0
  for (const pattern of codePatterns) {
    const matches = text.match(pattern)
    if (matches) codeMatchCount += matches.length
  }

  // If more than 5% of lines look like code, reject
  const lineCount = text.split('\n').length
  if (codeMatchCount / lineCount > 0.05) return false

  return true
}

/**
 * Content-type validation
 */
export function validateContentType(req: Request, expected: string): boolean {
  const contentType = req.headers['content-type'] || ''
  return contentType.includes(expected)
}

// =============================================================================
// Pre-built Validation Middleware
// =============================================================================

/**
 * Validate OpenAI extraction request
 */
export const validateOpenAIExtraction = validate(openAIExtractionSchema)

/**
 * Validate Anthropic extraction request
 */
export const validateAnthropicExtraction = validate(anthropicExtractionSchema)

/**
 * Validate OCR request
 */
export const validateOCR = validate(ocrSchema)

/**
 * Validate request has JSON content type
 */
export function validateJSON(req: Request, res: Response, next: NextFunction) {
  if (!validateContentType(req, 'application/json')) {
    return res.status(415).json({
      error: 'Unsupported Media Type',
      code: 'INVALID_CONTENT_TYPE',
      message: 'Content-Type must be application/json',
    })
  }
  next()
}

/**
 * Validate request body is not empty
 */
export function validateNotEmpty(req: Request, res: Response, next: NextFunction) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      error: 'Empty request body',
      code: 'EMPTY_BODY',
      message: 'Request body cannot be empty',
    })
  }
  next()
}

/**
 * Validate request size (additional check beyond body-parser)
 */
export function validateMaxSize(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10)
    if (contentLength > maxBytes) {
      return res.status(413).json({
        error: 'Request too large',
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request body exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)}MB`,
      })
    }
    next()
  }
}

// =============================================================================
// Export types
// =============================================================================

export type OpenAIExtractionInput = z.infer<typeof openAIExtractionSchema>
export type AnthropicExtractionInput = z.infer<typeof anthropicExtractionSchema>
export type OCRInput = z.infer<typeof ocrSchema>
