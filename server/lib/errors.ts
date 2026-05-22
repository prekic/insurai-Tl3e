/**
 * Shared error types for AI provider calls.
 *
 * These were originally defined in extraction-pipeline.ts. They are factored
 * out here so that extraction.ts can import them without pulling in the entire
 * pipeline module (which is being broken apart).
 */

// ── Error types ──

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'BillingError'
  }
}

export class TransientError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'TransientError'
  }
}

/**
 * Classify a provider error into BillingError, TransientError, or the original error.
 * Billing = credit/quota/precondition failure (needs operator action).
 * Transient = rate-limit/timeout/overload (should retry next provider).
 */
export function classifyProviderError(
  error: unknown,
  provider: string,
  _requestId?: string
): Error {
  const message = error instanceof Error ? error.message : String(error)

  // Billing/quota errors (operator must act)
  const billingPatterns = [
    'credit',
    'billing',
    'insufficient_quota',
    'quota',
    'FAILED_PRECONDITION',
    'account_balance',
    'insufficient',
    'rate limit exceeded for org',
    'exceeded your current quota',
    'Insufficient',
    'payment required',
  ]
  for (const p of billingPatterns) {
    if (message.toLowerCase().includes(p)) {
      return new BillingError(message, provider, error)
    }
  }

  // AbortError = SDK timeout (transient)
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new TransientError(message, provider, error)
  }

  // Auth errors usually transient
  if (error instanceof Error && error.name === 'AuthenticationError') {
    return new TransientError(message, provider, error)
  }

  // Transient patterns: rate limit, 429, overloaded, 529, network timeouts
  const transientPatterns = [
    '429',
    '529',
    '503',
    'rate_limit',
    'rate limit',
    'overloaded',
    'overloaded_error',
    'too many requests',
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'context_length_exceeded',
    'bad gateway',
    'service unavailable',
    'internal server error',
    'Please try again',
    'try again later',
  ]
  for (const p of transientPatterns) {
    if (message.toLowerCase().includes(p.toLowerCase())) {
      return new TransientError(message, provider, error)
    }
  }

  // Default: return original
  if (error instanceof Error) return error
  return new Error(String(error))
}
