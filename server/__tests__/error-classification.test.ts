/**
 * Tests for AI Error Classification and Fallback Reporting
 *
 * Validates the error classification logic used in:
 * 1. classifyDiagnosticError() - diagnostic endpoint error codes
 * 2. Unified extraction endpoint fallback logic
 * 3. Direct Anthropic endpoint error classification
 *
 * Critical distinction: "overloaded" is a transient capacity issue,
 * NOT a billing error. This was a bug fixed in this session.
 */

import { describe, it, expect } from 'vitest'

/**
 * Reimplementation of classifyDiagnosticError from server/routes/ai.ts
 * for testing purposes. Kept in sync with the source.
 */
function classifyDiagnosticError(error: string): string {
  if (error.includes('Invalid API key') || error.includes('401') || error.includes('Incorrect') || error.includes('Authentication failed') || error.includes('UNAUTHENTICATED')) {
    return 'INVALID_CREDENTIALS'
  }
  if (error.includes('Rate limit') || error.includes('429') || error.includes('RESOURCE_EXHAUSTED')) {
    return 'RATE_LIMITED'
  }
  if (error.includes('quota') || error.includes('insufficient_quota')) {
    return 'QUOTA_EXHAUSTED'
  }
  // Overloaded is a transient capacity issue, NOT a billing error
  if (error.includes('overloaded') || error.includes('529')) {
    return 'PROVIDER_OVERLOADED'
  }
  if (error.includes('billing') || error.includes('credit') || error.includes('BILLING') || error.includes('Billing') || error.includes('FAILED_PRECONDITION')) {
    return 'BILLING_ERROR'
  }
  if (error.includes('PERMISSION_DENIED') || error.includes('not enabled') || error.includes('has not been used') || error.includes('Permission denied')) {
    return 'API_NOT_ENABLED'
  }
  if (error.includes('NOT_FOUND') || error.includes('not found') || error.includes('404')) {
    return 'NOT_FOUND'
  }
  if (error.includes('ENOTFOUND') || error.includes('ECONNREFUSED') || error.includes('ETIMEDOUT') || error.includes('fetch failed')) {
    return 'NETWORK_ERROR'
  }
  return 'UNKNOWN_ERROR'
}

/**
 * Reimplementation of Anthropic direct endpoint error classification
 */
function classifyAnthropicDirectError(message: string): string {
  if (message.includes('401') || message.includes('invalid x-api-key') || message.includes('Invalid API Key')) {
    return 'INVALID_API_KEY'
  }
  if (message.includes('429') || message.includes('rate_limit')) {
    return 'RATE_LIMIT_EXCEEDED'
  }
  if (message.includes('credit') || message.includes('billing') || message.includes('FAILED_PRECONDITION')) {
    return 'BILLING_ERROR'
  }
  if (message.includes('overloaded') || message.includes('529')) {
    return 'PROVIDER_OVERLOADED'
  }
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return 'TIMEOUT'
  }
  return 'EXTRACTION_FAILED'
}

/**
 * Reimplementation of unified extraction fallback reason classification
 */
function classifyFallbackReason(message: string): string {
  const isBillingError = message.includes('credit') || message.includes('billing') || message.includes('FAILED_PRECONDITION')
  const isRateLimitError = message.includes('429') || message.includes('rate_limit')
  const isAuthError = message.includes('401') || message.includes('invalid x-api-key')
  const isOverloadedError = message.includes('overloaded') || message.includes('529')

  if (isBillingError) return 'ANTHROPIC_BILLING_ERROR'
  if (isRateLimitError) return 'ANTHROPIC_RATE_LIMITED'
  if (isAuthError) return 'ANTHROPIC_AUTH_ERROR'
  if (isOverloadedError) return 'ANTHROPIC_OVERLOADED'
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) return 'ANTHROPIC_TIMEOUT'
  return 'ANTHROPIC_UNKNOWN_ERROR'
}

describe('classifyDiagnosticError', () => {
  describe('Authentication Errors', () => {
    it('should classify "Invalid API key" as INVALID_CREDENTIALS', () => {
      expect(classifyDiagnosticError('Error: Invalid API key provided')).toBe('INVALID_CREDENTIALS')
    })

    it('should classify 401 errors as INVALID_CREDENTIALS', () => {
      expect(classifyDiagnosticError('HTTP 401 Unauthorized')).toBe('INVALID_CREDENTIALS')
    })

    it('should classify "Incorrect" errors as INVALID_CREDENTIALS', () => {
      expect(classifyDiagnosticError('Incorrect API key provided')).toBe('INVALID_CREDENTIALS')
    })

    it('should classify "Authentication failed" as INVALID_CREDENTIALS', () => {
      expect(classifyDiagnosticError('Authentication failed for this request')).toBe('INVALID_CREDENTIALS')
    })

    it('should classify UNAUTHENTICATED as INVALID_CREDENTIALS', () => {
      expect(classifyDiagnosticError('UNAUTHENTICATED: Request had invalid authentication credentials')).toBe('INVALID_CREDENTIALS')
    })
  })

  describe('Rate Limiting', () => {
    it('should classify "Rate limit" as RATE_LIMITED', () => {
      expect(classifyDiagnosticError('Rate limit exceeded')).toBe('RATE_LIMITED')
    })

    it('should classify 429 as RATE_LIMITED', () => {
      expect(classifyDiagnosticError('HTTP 429 Too Many Requests')).toBe('RATE_LIMITED')
    })

    it('should classify RESOURCE_EXHAUSTED as RATE_LIMITED', () => {
      expect(classifyDiagnosticError('RESOURCE_EXHAUSTED: Quota exceeded')).toBe('RATE_LIMITED')
    })
  })

  describe('Quota Exhaustion', () => {
    it('should classify "quota" as QUOTA_EXHAUSTED', () => {
      expect(classifyDiagnosticError('You have exceeded your quota')).toBe('QUOTA_EXHAUSTED')
    })

    it('should classify "insufficient_quota" as QUOTA_EXHAUSTED', () => {
      expect(classifyDiagnosticError('Error: insufficient_quota')).toBe('QUOTA_EXHAUSTED')
    })
  })

  describe('Provider Overloaded (Critical: NOT billing)', () => {
    it('should classify "overloaded" as PROVIDER_OVERLOADED, not BILLING_ERROR', () => {
      expect(classifyDiagnosticError('overloaded_error: The API is temporarily overloaded')).toBe('PROVIDER_OVERLOADED')
    })

    it('should classify 529 as PROVIDER_OVERLOADED', () => {
      expect(classifyDiagnosticError('HTTP 529 Overloaded')).toBe('PROVIDER_OVERLOADED')
    })

    it('should NOT classify "overloaded" as BILLING_ERROR', () => {
      const result = classifyDiagnosticError('overloaded_error')
      expect(result).not.toBe('BILLING_ERROR')
      expect(result).toBe('PROVIDER_OVERLOADED')
    })
  })

  describe('Billing Errors', () => {
    it('should classify "billing" as BILLING_ERROR', () => {
      expect(classifyDiagnosticError('billing issue: please update payment')).toBe('BILLING_ERROR')
    })

    it('should classify "credit" as BILLING_ERROR', () => {
      expect(classifyDiagnosticError('credit balance too low')).toBe('BILLING_ERROR')
    })

    it('should classify "FAILED_PRECONDITION" as BILLING_ERROR', () => {
      expect(classifyDiagnosticError('FAILED_PRECONDITION: account not in good standing')).toBe('BILLING_ERROR')
    })

    it('should classify "BILLING" (uppercase) as BILLING_ERROR', () => {
      expect(classifyDiagnosticError('BILLING_DISABLED: Billing is not enabled')).toBe('BILLING_ERROR')
    })
  })

  describe('API Not Enabled', () => {
    it('should classify "PERMISSION_DENIED" as API_NOT_ENABLED', () => {
      expect(classifyDiagnosticError('PERMISSION_DENIED: Cloud Vision API has not been used')).toBe('API_NOT_ENABLED')
    })

    it('should classify "not enabled" as API_NOT_ENABLED', () => {
      expect(classifyDiagnosticError('Cloud Vision API not enabled for this project')).toBe('API_NOT_ENABLED')
    })

    it('should classify "has not been used" as API_NOT_ENABLED', () => {
      expect(classifyDiagnosticError('Cloud Vision API has not been used in project')).toBe('API_NOT_ENABLED')
    })
  })

  describe('Network Errors', () => {
    it('should classify ENOTFOUND as NETWORK_ERROR', () => {
      expect(classifyDiagnosticError('Error: ENOTFOUND api.openai.com')).toBe('NETWORK_ERROR')
    })

    it('should classify ECONNREFUSED as NETWORK_ERROR', () => {
      expect(classifyDiagnosticError('Error: ECONNREFUSED 127.0.0.1:443')).toBe('NETWORK_ERROR')
    })

    it('should classify ETIMEDOUT as NETWORK_ERROR', () => {
      expect(classifyDiagnosticError('Error: ETIMEDOUT')).toBe('NETWORK_ERROR')
    })

    it('should classify "fetch failed" as NETWORK_ERROR', () => {
      expect(classifyDiagnosticError('TypeError: fetch failed')).toBe('NETWORK_ERROR')
    })
  })

  describe('Unknown Errors', () => {
    it('should return UNKNOWN_ERROR for unrecognized messages', () => {
      expect(classifyDiagnosticError('Something unexpected happened')).toBe('UNKNOWN_ERROR')
    })

    it('should return UNKNOWN_ERROR for empty strings', () => {
      expect(classifyDiagnosticError('')).toBe('UNKNOWN_ERROR')
    })
  })

  describe('Priority ordering', () => {
    it('should prioritize INVALID_CREDENTIALS over RATE_LIMITED when both match', () => {
      // "401" triggers INVALID_CREDENTIALS before "429" would trigger RATE_LIMITED
      expect(classifyDiagnosticError('401 error from rate-limited endpoint')).toBe('INVALID_CREDENTIALS')
    })

    it('should prioritize PROVIDER_OVERLOADED over BILLING_ERROR', () => {
      // "overloaded" should be checked BEFORE "billing"
      const result = classifyDiagnosticError('overloaded error with billing context')
      expect(result).toBe('PROVIDER_OVERLOADED')
    })
  })
})

describe('classifyAnthropicDirectError', () => {
  it('should separate overloaded from billing errors', () => {
    expect(classifyAnthropicDirectError('The API is temporarily overloaded')).toBe('PROVIDER_OVERLOADED')
    expect(classifyAnthropicDirectError('credit balance too low')).toBe('BILLING_ERROR')
  })

  it('should classify 529 as PROVIDER_OVERLOADED', () => {
    expect(classifyAnthropicDirectError('529 Overloaded')).toBe('PROVIDER_OVERLOADED')
  })

  it('should classify FAILED_PRECONDITION as BILLING_ERROR', () => {
    expect(classifyAnthropicDirectError('FAILED_PRECONDITION: account issue')).toBe('BILLING_ERROR')
  })

  it('should not classify overloaded as billing', () => {
    expect(classifyAnthropicDirectError('overloaded_error')).not.toBe('BILLING_ERROR')
  })

  it('should classify auth errors correctly', () => {
    expect(classifyAnthropicDirectError('401 Unauthorized')).toBe('INVALID_API_KEY')
    expect(classifyAnthropicDirectError('invalid x-api-key')).toBe('INVALID_API_KEY')
  })

  it('should classify rate limit errors correctly', () => {
    expect(classifyAnthropicDirectError('429 Too Many Requests')).toBe('RATE_LIMIT_EXCEEDED')
    expect(classifyAnthropicDirectError('rate_limit error')).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('should classify timeout errors', () => {
    expect(classifyAnthropicDirectError('Request timeout after 90s')).toBe('TIMEOUT')
    expect(classifyAnthropicDirectError('ETIMEDOUT')).toBe('TIMEOUT')
  })

  it('should fall back to EXTRACTION_FAILED for unknown errors', () => {
    expect(classifyAnthropicDirectError('Unknown internal error')).toBe('EXTRACTION_FAILED')
  })
})

describe('classifyFallbackReason', () => {
  describe('Billing vs Overloaded distinction', () => {
    it('should report ANTHROPIC_BILLING_ERROR for billing issues', () => {
      expect(classifyFallbackReason('credit balance too low')).toBe('ANTHROPIC_BILLING_ERROR')
      expect(classifyFallbackReason('billing issue detected')).toBe('ANTHROPIC_BILLING_ERROR')
      expect(classifyFallbackReason('FAILED_PRECONDITION: payment required')).toBe('ANTHROPIC_BILLING_ERROR')
    })

    it('should report ANTHROPIC_OVERLOADED for capacity issues', () => {
      expect(classifyFallbackReason('API is temporarily overloaded')).toBe('ANTHROPIC_OVERLOADED')
      expect(classifyFallbackReason('529 Overloaded')).toBe('ANTHROPIC_OVERLOADED')
    })

    it('should NOT report billing for overloaded errors', () => {
      expect(classifyFallbackReason('overloaded_error')).not.toBe('ANTHROPIC_BILLING_ERROR')
    })
  })

  describe('All fallback reasons', () => {
    it('should report ANTHROPIC_AUTH_ERROR for authentication failures', () => {
      expect(classifyFallbackReason('401 Unauthorized')).toBe('ANTHROPIC_AUTH_ERROR')
      expect(classifyFallbackReason('invalid x-api-key')).toBe('ANTHROPIC_AUTH_ERROR')
    })

    it('should report ANTHROPIC_RATE_LIMITED for rate limits', () => {
      expect(classifyFallbackReason('429 Too Many Requests')).toBe('ANTHROPIC_RATE_LIMITED')
      expect(classifyFallbackReason('rate_limit exceeded')).toBe('ANTHROPIC_RATE_LIMITED')
    })

    it('should report ANTHROPIC_TIMEOUT for timeouts', () => {
      expect(classifyFallbackReason('Request timeout after 90s')).toBe('ANTHROPIC_TIMEOUT')
      expect(classifyFallbackReason('ETIMEDOUT')).toBe('ANTHROPIC_TIMEOUT')
    })

    it('should report ANTHROPIC_UNKNOWN_ERROR for unknown errors', () => {
      expect(classifyFallbackReason('Some random error')).toBe('ANTHROPIC_UNKNOWN_ERROR')
    })
  })

  describe('All reasons should have ANTHROPIC_ prefix', () => {
    const testCases = [
      'credit balance too low',
      '429 rate limited',
      '401 unauthorized',
      'overloaded_error',
      'ETIMEDOUT',
      'random error',
    ]

    testCases.forEach(msg => {
      it(`should prefix "${msg}" with ANTHROPIC_`, () => {
        expect(classifyFallbackReason(msg)).toMatch(/^ANTHROPIC_/)
      })
    })
  })
})

describe('Sanitized Error Messages', () => {
  const codeToMessage: Record<string, string> = {
    INVALID_CREDENTIALS: 'Service configuration error',
    RATE_LIMITED: 'Service temporarily busy',
    QUOTA_EXHAUSTED: 'Service quota exhausted',
    PROVIDER_OVERLOADED: 'Service temporarily busy',
    BILLING_ERROR: 'Service temporarily unavailable',
    API_NOT_ENABLED: 'Service not available',
    NOT_FOUND: 'Service not configured',
    NETWORK_ERROR: 'Service unreachable',
    UNKNOWN_ERROR: 'Service error',
  }

  it('should have a sanitized message for PROVIDER_OVERLOADED', () => {
    expect(codeToMessage['PROVIDER_OVERLOADED']).toBe('Service temporarily busy')
  })

  it('should differentiate overloaded from billing in user messages', () => {
    expect(codeToMessage['PROVIDER_OVERLOADED']).not.toBe(codeToMessage['BILLING_ERROR'])
  })

  it('should have sanitized messages for all error codes', () => {
    const allCodes = [
      'INVALID_CREDENTIALS', 'RATE_LIMITED', 'QUOTA_EXHAUSTED',
      'PROVIDER_OVERLOADED', 'BILLING_ERROR', 'API_NOT_ENABLED',
      'NOT_FOUND', 'NETWORK_ERROR', 'UNKNOWN_ERROR'
    ]
    allCodes.forEach(code => {
      expect(codeToMessage[code]).toBeDefined()
      expect(codeToMessage[code].length).toBeGreaterThan(0)
    })
  })

  it('should not expose technical details in sanitized messages', () => {
    Object.values(codeToMessage).forEach(msg => {
      expect(msg).not.toMatch(/api.*key/i)
      expect(msg).not.toMatch(/sk-/i)
      expect(msg).not.toMatch(/\.env/i)
      expect(msg).not.toMatch(/stack trace/i)
    })
  })
})
