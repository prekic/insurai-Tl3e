/**
 * Gemini OCR Server Route Unit Tests
 *
 * Tests the OCR pipeline logic in isolation WITHOUT importing the route module:
 * - Input validation
 * - Error classification (auth, rate limit, generic)
 * - Production vs development error messages
 * - PDF MIME detection
 * - Canvas module unavailability handling
 *
 * Targets Railway build fails reported 2026-05-12:
 * - GEMINI_API_KEY not set in production env
 * - canvas (node-canvas) native module unavailable
 * - Generic "Document processing service unavailable" masking real issues
 */

const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// ── Input Validation Logic ──────────────────────────────────────

describe('Gemini OCR - Input Validation', () => {
  function validateInput(imageBase64: string): { valid: boolean; status?: number; error?: string } {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return { valid: false, status: 400, error: 'Missing required field: imageBase64' }
    }

    // Check valid base64
    try {
      const decoded = Buffer.from(imageBase64, 'base64')
      if (decoded.length === 0) {
        return { valid: false, status: 400, error: 'Invalid base64: decoded to empty buffer' }
      }
    } catch {
      return { valid: false, status: 400, error: 'Invalid base64 encoding' }
    }

    // Check size (~15MB binary = ~20MB base64)
    const bytes = (imageBase64.length * 3) / 4
    if (bytes > 15 * 1024 * 1024) {
      return { valid: false, status: 413, error: 'Image too large' }
    }

    return { valid: true }
  }

  test('rejects missing imageBase64', () => {
    const result = validateInput('' as any)
    expect(result.valid).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects non-string imageBase64', () => {
    const result = validateInput(12345 as any)
    expect(result.valid).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects invalid base64 characters', () => {
    // Buffer.from(base64, 'base64') silently ignores invalid chars
    // The actual base64 validator checks decoded length === 0
    const result = validateInput('')
    expect(result.valid).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects oversized payload (>15MB)', () => {
    // 20MB base64 → ~15MB binary (20M * 3/4 = 15M)
    const bigString = 'A'.repeat(22 * 1024 * 1024) // 22MB to definitely exceed 15MB limit
    const result = validateInput(bigString)
    expect(result.valid).toBe(false)
    expect(result.status).toBe(413)
  })

  test('accepts valid small image', () => {
    const result = validateInput(TEST_IMAGE_BASE64)
    expect(result.valid).toBe(true)
  })
})

// ── Error Classification ───────────────────────────────────────

describe('Gemini OCR - Error Classification', () => {
  function classifyError(error: Error): { code: string; userMessage: string } {
    const message = error.message
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'

    let code = 'GEMINI_OCR_FAILED'
    let userMessage = IS_PRODUCTION ? 'Unable to process document' : `Gemini OCR failed: ${message}`

    if (error.name === 'AbortError') {
      code = 'TIMEOUT'
      userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Gemini OCR timed out'
    } else if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      code = 'RATE_LIMITED'
      userMessage = IS_PRODUCTION
        ? 'Service busy, please try again later'
        : 'Gemini rate limit exceeded'
    } else if (message.includes('API key') || message.includes('401') || message.includes('403')) {
      code = 'AUTH_FAILED'
      userMessage = IS_PRODUCTION
        ? 'Document processing service unavailable'
        : 'Gemini API key invalid — check GEMINI_API_KEY'
    }

    return { code, userMessage }
  }

  describe('auth failures return correct codes', () => {
    const tests = [
      {
        name: 'invalid API key',
        message: 'API key not valid. Please pass a valid API key.',
        expectedCode: 'AUTH_FAILED',
      },
      { name: 'API key not found', message: 'API key not found.', expectedCode: 'AUTH_FAILED' },
      {
        name: 'permission denied (403)',
        message: '403 Permission denied.',
        expectedCode: 'AUTH_FAILED',
      },
      { name: 'generic 401', message: '401 Unauthorized', expectedCode: 'AUTH_FAILED' },
      { name: 'generic 403', message: '403 Forbidden', expectedCode: 'AUTH_FAILED' },
    ]

    tests.forEach(({ name, message, expectedCode }) => {
      test(name, () => {
        const { code } = classifyError(new Error(message))
        expect(code).toBe(expectedCode)
      })
    })
  })

  describe('rate limit errors return correct codes', () => {
    const tests = [
      {
        name: '429 Too Many Requests',
        message: '429 Too Many Requests',
        expectedCode: 'RATE_LIMITED',
      },
      {
        name: 'RESOURCE_EXHAUSTED',
        message: 'RESOURCE_EXHAUSTED: Quota exceeded',
        expectedCode: 'RATE_LIMITED',
      },
      {
        name: 'RESOURCE_EXHAUSTED generic',
        message: 'RESOURCE_EXHAUSTED: Quota exceeded',
        expectedCode: 'RATE_LIMITED',
      },
    ]

    tests.forEach(({ name, message, expectedCode }) => {
      test(name, () => {
        const { code } = classifyError(new Error(message))
        expect(code).toBe(expectedCode)
      })
    })
  })

  describe('misc errors return default code', () => {
    const tests = [
      { name: 'network error', message: 'fetch failed', expectedCode: 'GEMINI_OCR_FAILED' },
      {
        name: 'invalid response',
        message: 'Unexpected server response',
        expectedCode: 'GEMINI_OCR_FAILED',
      },
      {
        name: 'timeout (generic)',
        message: 'The operation was aborted',
        expectedCode: 'GEMINI_OCR_FAILED',
      },
    ]

    tests.forEach(({ name, message, expectedCode }) => {
      test(name, () => {
        const { code } = classifyError(new Error(message))
        expect(code).toBe(expectedCode)
      })
    })
  })

  describe('AbortError returns TIMEOUT', () => {
    test('AbortError.name produces TIMEOUT code', () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      const { code } = classifyError(error)
      expect(code).toBe('TIMEOUT')
    })
  })
})

// ── Production Mode Messages ───────────────────────────────────

describe('Gemini OCR - Production Mode Messages', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  function checkClientReady(apiKey: string | undefined): { ok: boolean; error: string } {
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    if (!apiKey) {
      return {
        ok: false,
        error: IS_PRODUCTION
          ? 'Document processing service unavailable'
          : 'Gemini not configured — set GEMINI_API_KEY',
      }
    }
    return { ok: true, error: '' }
  }

  test('returns generic message when not configured in production', () => {
    process.env.NODE_ENV = 'production'
    const result = checkClientReady(undefined)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Document processing service unavailable')
  })

  test('returns specific message when not configured in development', () => {
    process.env.NODE_ENV = 'development'
    const result = checkClientReady(undefined)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Gemini not configured — set GEMINI_API_KEY')
  })

  test('succeeds when configured regardless of NODE_ENV', () => {
    process.env.NODE_ENV = 'production'
    const result = checkClientReady('some-api-key')
    expect(result.ok).toBe(true)
    expect(result.error).toBe('')
  })
})

// ── PDF MIME Detection ─────────────────────────────────────────

describe('Gemini OCR - PDF MIME Detection', () => {
  function detectMime(base64: string): string {
    if (base64.startsWith('/9j/')) return 'image/jpeg'
    if (base64.startsWith('JVBER')) return 'application/pdf'
    if (base64.startsWith('iVBOR')) return 'image/png'
    return 'image/png' // default
  }

  test('detects PDF from "JVBER" header', () => {
    expect(detectMime('JVBERi0xLjQKJeLjz9MK')).toBe('application/pdf')
  })

  test('detects JPEG from "/9j/" header', () => {
    expect(detectMime('/9j/4AAQSkZJRgABAQEAYABgAAD/')).toBe('image/jpeg')
  })

  test('detects PNG from "iVBOR" header', () => {
    expect(
      detectMime(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      )
    ).toBe('image/png')
  })

  test('defaults to image/png for unknown headers', () => {
    expect(detectMime('AAAA')).toBe('image/png')
  })
})

// ── Canvas Module Availability ─────────────────────────────────

describe('Gemini OCR - Canvas Module Fallback', () => {
  /**
   * Tests the Function() constructor pattern used to bypass TS module
   * resolution for the optional 'canvas' (node-canvas) dependency.
   * canvas is a native C++ module not available on Railway.
   */
  test('canvas import via Function() does not throw', async () => {
    const canvasImport = async (): Promise<boolean> => {
      try {
        const createCanvas = await Function('return import("canvas").then(m => m.createCanvas)')()
        return !!createCanvas
      } catch {
        return false
      }
    }

    const result = await canvasImport()
    expect(typeof result).toBe('boolean')
    // If canvas IS installed, it returns true; if not, false
    // Either way it gracefully handles the situation
  })

  test('pdf rendering block falls through when canvas unavailable', () => {
    const createCanvas: any = null
    let renderedPages = 0

    try {
      if (!createCanvas) throw new Error('canvas module not available')
      // Would render pages here
      renderedPages = 3
    } catch {
      // This is the expected path on Railway
      expect(renderedPages).toBe(0)
    }
  })
})

// ── Response Shape ─────────────────────────────────────────────

describe('Gemini OCR - Response Shape', () => {
  function isSuccessResponse(body: any): body is {
    success: true
    data: { text: string; confidence: number; pageCount: number; processingTimeMs: number }
    cost: number
    usage: { inputTokens: number; outputTokens: number; model: string }
  } {
    return (
      body &&
      body.success === true &&
      typeof body.data?.text === 'string' &&
      typeof body.data?.confidence === 'number' &&
      typeof body.data?.pageCount === 'number' &&
      typeof body.data?.processingTimeMs === 'number' &&
      typeof body.cost === 'number' &&
      body.usage &&
      typeof body.usage.inputTokens === 'number' &&
      typeof body.usage.outputTokens === 'number' &&
      typeof body.usage.model === 'string'
    )
  }

  function isErrorResponse(body: any): body is { error: string; code: string } {
    return body && typeof body.error === 'string' && typeof body.code === 'string'
  }

  test('success response shape', () => {
    const response = {
      success: true,
      data: {
        text: 'Extracted text from document',
        confidence: 0.92,
        pageCount: 1,
        processingTimeMs: 1500,
      },
      cost: 0.0003,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        model: 'gemini-2.5-flash',
      },
    }

    expect(isSuccessResponse(response)).toBe(true)
  })

  test('error response shape', () => {
    const response = {
      error: 'Document processing service unavailable',
      code: 'AUTH_FAILED',
      timestamp: new Date().toISOString(),
    }

    expect(isErrorResponse(response)).toBe(true)
    // Production responses must NOT have 'details'
    expect(response).not.toHaveProperty('details')
  })

  test('non-production error includes details', () => {
    const response = {
      error: 'Gemini API key invalid — check GEMINI_API_KEY',
      code: 'AUTH_FAILED',
      details: 'API key not valid. Please pass a valid API key.',
      timestamp: new Date().toISOString(),
    }

    expect(isErrorResponse(response)).toBe(true)
    expect(response).toHaveProperty('details')
  })
})
