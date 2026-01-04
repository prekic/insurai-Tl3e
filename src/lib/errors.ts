// Error types and utilities for InsurAI

export const ERROR_CODES = {
  // File errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_SUPPORTED: 'FILE_TYPE_NOT_SUPPORTED',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  FILE_PROCESSING_FAILED: 'FILE_PROCESSING_FAILED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',

  // AI/Analysis errors
  AI_ANALYSIS_FAILED: 'AI_ANALYSIS_FAILED',
  OCR_FAILED: 'OCR_FAILED',

  // Policy errors
  POLICY_NOT_FOUND: 'POLICY_NOT_FOUND',
  POLICY_DELETE_FAILED: 'POLICY_DELETE_FAILED',

  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

export interface AppError {
  code: ErrorCode
  message: string
  details?: string
  retry?: boolean
}

// User-friendly error messages
export const ERROR_MESSAGES: Record<ErrorCode, { title: string; description: string }> = {
  [ERROR_CODES.FILE_TOO_LARGE]: {
    title: 'File too large',
    description: 'Please upload files smaller than 10MB.',
  },
  [ERROR_CODES.FILE_TYPE_NOT_SUPPORTED]: {
    title: 'File type not supported',
    description: 'Please upload PDF, Word documents, or images (PNG, JPG).',
  },
  [ERROR_CODES.FILE_UPLOAD_FAILED]: {
    title: 'Upload failed',
    description: 'There was a problem uploading your file. Please try again.',
  },
  [ERROR_CODES.FILE_PROCESSING_FAILED]: {
    title: 'Processing failed',
    description: 'We couldn\'t process your file. Please ensure it\'s a valid document.',
  },
  [ERROR_CODES.NETWORK_ERROR]: {
    title: 'Connection error',
    description: 'Please check your internet connection and try again.',
  },
  [ERROR_CODES.SERVER_ERROR]: {
    title: 'Server error',
    description: 'Something went wrong on our end. Please try again later.',
  },
  [ERROR_CODES.TIMEOUT]: {
    title: 'Request timed out',
    description: 'The operation took too long. Please try again.',
  },
  [ERROR_CODES.AI_ANALYSIS_FAILED]: {
    title: 'Analysis failed',
    description: 'We couldn\'t analyze your policy. Please try uploading again.',
  },
  [ERROR_CODES.OCR_FAILED]: {
    title: 'Text extraction failed',
    description: 'We couldn\'t read the text from your document. Try uploading a clearer image.',
  },
  [ERROR_CODES.POLICY_NOT_FOUND]: {
    title: 'Policy not found',
    description: 'The requested policy could not be found.',
  },
  [ERROR_CODES.POLICY_DELETE_FAILED]: {
    title: 'Delete failed',
    description: 'We couldn\'t delete the policy. Please try again.',
  },
  [ERROR_CODES.UNKNOWN_ERROR]: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again.',
  },
}

// File validation constants
export const FILE_CONSTRAINTS = {
  MAX_SIZE_MB: 10,
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ],
  ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'],
}

// Validate a single file
export function validateFile(file: File): AppError | null {
  // Check file size
  if (file.size > FILE_CONSTRAINTS.MAX_SIZE_BYTES) {
    return {
      code: ERROR_CODES.FILE_TOO_LARGE,
      message: ERROR_MESSAGES[ERROR_CODES.FILE_TOO_LARGE].description,
      details: `File "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum allowed is ${FILE_CONSTRAINTS.MAX_SIZE_MB}MB.`,
    }
  }

  // Check file type
  const extension = '.' + file.name.split('.').pop()?.toLowerCase()
  const isValidExtension = FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.includes(extension)
  const isValidMimeType = FILE_CONSTRAINTS.ALLOWED_TYPES.includes(file.type)

  if (!isValidExtension && !isValidMimeType) {
    return {
      code: ERROR_CODES.FILE_TYPE_NOT_SUPPORTED,
      message: ERROR_MESSAGES[ERROR_CODES.FILE_TYPE_NOT_SUPPORTED].description,
      details: `File "${file.name}" has an unsupported format. Allowed: PDF, Word, PNG, JPG.`,
    }
  }

  return null
}

// Validate multiple files
export function validateFiles(files: File[]): { valid: File[]; errors: AppError[] } {
  const valid: File[] = []
  const errors: AppError[] = []

  for (const file of files) {
    const error = validateFile(file)
    if (error) {
      errors.push(error)
    } else {
      valid.push(file)
    }
  }

  return { valid, errors }
}

// Get error message for display
export function getErrorMessage(code: ErrorCode): { title: string; description: string } {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR]
}

// Create an AppError from an unknown error
export function createAppError(error: unknown, defaultCode: ErrorCode = ERROR_CODES.UNKNOWN_ERROR): AppError {
  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Network')) {
      return {
        code: ERROR_CODES.NETWORK_ERROR,
        message: ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR].description,
        details: error.message,
        retry: true,
      }
    }

    // Check for timeout errors
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return {
        code: ERROR_CODES.TIMEOUT,
        message: ERROR_MESSAGES[ERROR_CODES.TIMEOUT].description,
        details: error.message,
        retry: true,
      }
    }

    return {
      code: defaultCode,
      message: error.message,
      details: error.stack,
    }
  }

  return {
    code: defaultCode,
    message: ERROR_MESSAGES[defaultCode].description,
  }
}
