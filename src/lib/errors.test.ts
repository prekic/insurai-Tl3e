/**
 * Error Handling Tests
 *
 * Tests for error creation, validation, and recovery utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  FILE_CONSTRAINTS,
  validateFile,
  validateFiles,
  getErrorMessage,
  createAppError,
} from './errors'
import type { ErrorCode, AppError } from './errors'

describe('Error Codes', () => {
  it('should have all required error codes defined', () => {
    expect(ERROR_CODES.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR')
    expect(ERROR_CODES.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ERROR_CODES.TIMEOUT).toBe('TIMEOUT')
    expect(ERROR_CODES.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE')
    expect(ERROR_CODES.FILE_TYPE_NOT_SUPPORTED).toBe('FILE_TYPE_NOT_SUPPORTED')
    expect(ERROR_CODES.FILE_UPLOAD_FAILED).toBe('FILE_UPLOAD_FAILED')
    expect(ERROR_CODES.FILE_PROCESSING_FAILED).toBe('FILE_PROCESSING_FAILED')
    expect(ERROR_CODES.AI_ANALYSIS_FAILED).toBe('AI_ANALYSIS_FAILED')
    expect(ERROR_CODES.OCR_FAILED).toBe('OCR_FAILED')
    expect(ERROR_CODES.SERVER_ERROR).toBe('SERVER_ERROR')
  })

  it('should have corresponding error messages for all codes', () => {
    Object.values(ERROR_CODES).forEach((code) => {
      expect(ERROR_MESSAGES[code as ErrorCode]).toBeDefined()
      expect(ERROR_MESSAGES[code as ErrorCode].title).toBeDefined()
      expect(ERROR_MESSAGES[code as ErrorCode].description).toBeDefined()
    })
  })
})

describe('FILE_CONSTRAINTS', () => {
  it('should define maximum file size', () => {
    expect(FILE_CONSTRAINTS.MAX_SIZE_MB).toBe(10)
    expect(FILE_CONSTRAINTS.MAX_SIZE_BYTES).toBe(10 * 1024 * 1024)
  })

  it('should define allowed extensions', () => {
    expect(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS).toContain('.pdf')
    expect(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS).toContain('.png')
    expect(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS).toContain('.jpg')
    expect(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS).toContain('.jpeg')
  })

  it('should define allowed MIME types', () => {
    expect(FILE_CONSTRAINTS.ALLOWED_TYPES).toContain('application/pdf')
    expect(FILE_CONSTRAINTS.ALLOWED_TYPES).toContain('image/png')
    expect(FILE_CONSTRAINTS.ALLOWED_TYPES).toContain('image/jpeg')
  })
})

describe('validateFile', () => {
  const createMockFile = (
    name: string,
    size: number,
    type: string
  ): File => {
    return {
      name,
      size,
      type,
      lastModified: Date.now(),
      webkitRelativePath: '',
      arrayBuffer: vi.fn(),
      slice: vi.fn(),
      stream: vi.fn(),
      text: vi.fn(),
    } as unknown as File
  }

  it('should return null for valid PDF file', () => {
    const file = createMockFile('document.pdf', 1024 * 100, 'application/pdf')
    const result = validateFile(file)

    expect(result).toBeNull()
  })

  it('should return null for valid PNG file', () => {
    const file = createMockFile('image.png', 1024 * 100, 'image/png')
    const result = validateFile(file)

    expect(result).toBeNull()
  })

  it('should return null for valid JPEG file', () => {
    const file = createMockFile('photo.jpg', 1024 * 100, 'image/jpeg')
    const result = validateFile(file)

    expect(result).toBeNull()
  })

  it('should return error for file exceeding size limit', () => {
    const largeFile = createMockFile('large.pdf', 15 * 1024 * 1024, 'application/pdf')
    const result = validateFile(largeFile)

    expect(result).not.toBeNull()
    expect(result?.code).toBe(ERROR_CODES.FILE_TOO_LARGE)
    expect(result?.message).toBeDefined()
    expect(result?.details).toContain('15.0MB')
    expect(result?.details).toContain(`${FILE_CONSTRAINTS.MAX_SIZE_MB}MB`)
  })

  it('should return error for file at exact size limit', () => {
    // File just over the limit
    const file = createMockFile('exact.pdf', FILE_CONSTRAINTS.MAX_SIZE_BYTES + 1, 'application/pdf')
    const result = validateFile(file)

    expect(result).not.toBeNull()
    expect(result?.code).toBe(ERROR_CODES.FILE_TOO_LARGE)
  })

  it('should return error for unsupported file type', () => {
    const file = createMockFile('document.exe', 1024, 'application/x-executable')
    const result = validateFile(file)

    expect(result).not.toBeNull()
    expect(result?.code).toBe(ERROR_CODES.FILE_TYPE_NOT_SUPPORTED)
    expect(result?.details).toContain('unsupported format')
  })

  it('should return error for unsupported extension', () => {
    const file = createMockFile('script.js', 1024, 'text/javascript')
    const result = validateFile(file)

    expect(result).not.toBeNull()
    expect(result?.code).toBe(ERROR_CODES.FILE_TYPE_NOT_SUPPORTED)
  })

  it('should accept file with valid extension but unknown MIME type', () => {
    // Some browsers might report different MIME types
    const file = createMockFile('document.pdf', 1024, 'application/octet-stream')
    const result = validateFile(file)

    // Should still accept because extension is valid
    expect(result).toBeNull()
  })

  it('should accept file with valid MIME type but unusual extension', () => {
    // Accept based on MIME type
    const file = createMockFile('document.PDF', 1024, 'application/pdf')
    const result = validateFile(file)

    expect(result).toBeNull()
  })
})

describe('validateFiles', () => {
  const createMockFile = (
    name: string,
    size: number,
    type: string
  ): File => {
    return {
      name,
      size,
      type,
      lastModified: Date.now(),
      webkitRelativePath: '',
      arrayBuffer: vi.fn(),
      slice: vi.fn(),
      stream: vi.fn(),
      text: vi.fn(),
    } as unknown as File
  }

  it('should return all valid files with no errors', () => {
    const files = [
      createMockFile('doc1.pdf', 1024, 'application/pdf'),
      createMockFile('doc2.pdf', 2048, 'application/pdf'),
      createMockFile('image.png', 512, 'image/png'),
    ]
    const result = validateFiles(files)

    expect(result.valid).toHaveLength(3)
    expect(result.errors).toHaveLength(0)
  })

  it('should separate valid and invalid files', () => {
    const files = [
      createMockFile('valid.pdf', 1024, 'application/pdf'),
      createMockFile('invalid.exe', 1024, 'application/x-executable'),
      createMockFile('also-valid.png', 1024, 'image/png'),
    ]
    const result = validateFiles(files)

    expect(result.valid).toHaveLength(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe(ERROR_CODES.FILE_TYPE_NOT_SUPPORTED)
  })

  it('should return all errors for multiple invalid files', () => {
    const files = [
      createMockFile('large.pdf', 15 * 1024 * 1024, 'application/pdf'),
      createMockFile('invalid.exe', 1024, 'application/x-executable'),
    ]
    const result = validateFiles(files)

    expect(result.valid).toHaveLength(0)
    expect(result.errors).toHaveLength(2)
  })

  it('should handle empty file array', () => {
    const result = validateFiles([])

    expect(result.valid).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})

describe('getErrorMessage', () => {
  it('should return correct message for known error code', () => {
    const message = getErrorMessage(ERROR_CODES.NETWORK_ERROR)

    expect(message.title).toBeDefined()
    expect(message.description).toBeDefined()
  })

  it('should return unknown error message for invalid code', () => {
    const message = getErrorMessage('INVALID_CODE' as ErrorCode)

    expect(message).toEqual(ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR])
  })

  it('should return correct messages for all error codes', () => {
    expect(getErrorMessage(ERROR_CODES.FILE_TOO_LARGE).title).toBe('File too large')
    expect(getErrorMessage(ERROR_CODES.FILE_TYPE_NOT_SUPPORTED).title).toBe('File type not supported')
    expect(getErrorMessage(ERROR_CODES.AI_ANALYSIS_FAILED).title).toBe('Analysis failed')
    expect(getErrorMessage(ERROR_CODES.OCR_FAILED).title).toBe('Text extraction failed')
    expect(getErrorMessage(ERROR_CODES.SERVER_ERROR).title).toBe('Server error')
  })
})

describe('createAppError', () => {
  it('should create AppError from Error object', () => {
    const error = new Error('Something went wrong')
    const appError = createAppError(error)

    expect(appError.code).toBe(ERROR_CODES.UNKNOWN_ERROR)
    expect(appError.message).toBe('Something went wrong')
    expect(appError.details).toBeDefined()
  })

  it('should use custom default code', () => {
    const error = new Error('API failed')
    const appError = createAppError(error, ERROR_CODES.SERVER_ERROR)

    expect(appError.code).toBe(ERROR_CODES.SERVER_ERROR)
  })

  it('should detect network errors from message', () => {
    const networkError = new Error('fetch failed: network error')
    const appError = createAppError(networkError)

    expect(appError.code).toBe(ERROR_CODES.NETWORK_ERROR)
    expect(appError.retry).toBe(true)
  })

  it('should detect network errors with "Network" keyword', () => {
    const networkError = new Error('Network request failed')
    const appError = createAppError(networkError)

    expect(appError.code).toBe(ERROR_CODES.NETWORK_ERROR)
    expect(appError.retry).toBe(true)
  })

  it('should detect timeout errors', () => {
    const timeoutError = new Error('Request timeout after 30s')
    const appError = createAppError(timeoutError)

    expect(appError.code).toBe(ERROR_CODES.TIMEOUT)
    expect(appError.retry).toBe(true)
  })

  it('should detect timeout errors with "Timeout" keyword', () => {
    const timeoutError = new Error('Connection Timeout')
    const appError = createAppError(timeoutError)

    expect(appError.code).toBe(ERROR_CODES.TIMEOUT)
    expect(appError.retry).toBe(true)
  })

  it('should handle non-Error objects', () => {
    const appError = createAppError('string error')

    expect(appError.code).toBe(ERROR_CODES.UNKNOWN_ERROR)
    expect(appError.message).toBe(ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR].description)
  })

  it('should handle null', () => {
    const appError = createAppError(null)

    expect(appError.code).toBe(ERROR_CODES.UNKNOWN_ERROR)
  })

  it('should handle undefined', () => {
    const appError = createAppError(undefined)

    expect(appError.code).toBe(ERROR_CODES.UNKNOWN_ERROR)
  })

  it('should handle objects without message property', () => {
    const appError = createAppError({ foo: 'bar' })

    expect(appError.code).toBe(ERROR_CODES.UNKNOWN_ERROR)
  })

  it('should include stack trace in details for Error objects', () => {
    const error = new Error('Test error')
    const appError = createAppError(error)

    expect(appError.details).toContain('Error: Test error')
  })

  it('should prioritize network detection over default code', () => {
    const error = new Error('Network unavailable')
    const appError = createAppError(error, ERROR_CODES.SERVER_ERROR)

    expect(appError.code).toBe(ERROR_CODES.NETWORK_ERROR)
  })

  it('should prioritize timeout detection over default code', () => {
    const error = new Error('Operation timeout')
    const appError = createAppError(error, ERROR_CODES.SERVER_ERROR)

    expect(appError.code).toBe(ERROR_CODES.TIMEOUT)
  })
})

describe('Error Message Content', () => {
  it('should have user-friendly error titles', () => {
    expect(ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR].title).toBe('Connection error')
    expect(ERROR_MESSAGES[ERROR_CODES.TIMEOUT].title).toBe('Request timed out')
    expect(ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR].title).toBe('Something went wrong')
  })

  it('should have helpful error descriptions', () => {
    expect(ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR].description).toContain('connection')
    expect(ERROR_MESSAGES[ERROR_CODES.FILE_TOO_LARGE].description).toContain('10MB')
  })
})
