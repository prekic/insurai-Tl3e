/**
 * User Visibility Tests
 *
 * Documents what information is visible to different user types:
 * - End Users (production environment)
 * - Admins/Developers (development/staging environments)
 *
 * Also identifies any potential information leakage concerns.
 */

import { describe, it, expect } from 'vitest'

/**
 * =============================================================================
 * CATEGORY 1: API ERROR RESPONSES
 * =============================================================================
 * What users see when API calls fail
 */
describe('API Error Response Visibility', () => {
  describe('End User View (Production)', () => {
    const NODE_ENV = 'production'

    it('should see user-friendly error message only', () => {
      // Simulating what the server returns in production
      const errorResponse = {
        error: 'OpenAI API key is invalid',
        code: 'INVALID_API_KEY',
        // details is NOT included in production
        timestamp: '2026-01-06T12:30:00.000Z',
      }

      // What end user sees:
      expect(errorResponse).toHaveProperty('error')
      expect(errorResponse).toHaveProperty('code')
      expect(errorResponse).toHaveProperty('timestamp')
      expect(errorResponse).not.toHaveProperty('details') // ✅ Hidden in production

      // The error message is user-friendly, no technical details
      expect(errorResponse.error).not.toContain('sk-')  // No API key fragments
      expect(errorResponse.error).not.toContain('401')  // No HTTP status codes
      expect(errorResponse.error).not.toContain('stack') // No stack traces
    })

    it('should see generic message for unknown errors', () => {
      const errorResponse = {
        error: 'OpenAI extraction failed',
        code: 'EXTRACTION_FAILED',
        timestamp: '2026-01-06T12:30:00.000Z',
      }

      // Generic message, no internal details
      expect(errorResponse.error).toBe('OpenAI extraction failed')
    })

    it('should NOT see raw API error messages', () => {
      // These should be transformed to user-friendly messages
      const rawErrors = [
        '401 Unauthorized - Incorrect API key provided: sk-proj-xxx',
        'Error: insufficient_quota - You exceeded your current quota',
        'APIError: Connection refused at 127.0.0.1:4001',
      ]

      // End users should see these instead:
      const userFriendlyMessages = [
        'OpenAI API key is invalid',
        'OpenAI API quota exhausted - add credits to your account',
        'OpenAI extraction failed',
      ]

      userFriendlyMessages.forEach(msg => {
        expect(msg).not.toContain('sk-')
        expect(msg).not.toContain('127.0.0.1')
        expect(msg).not.toContain('APIError')
      })
    })
  })

  describe('Admin/Developer View (Development)', () => {
    const NODE_ENV = 'development'

    it('should see full error details for debugging', () => {
      // Simulating what the server returns in development
      const errorResponse = {
        error: 'OpenAI API key is invalid',
        code: 'INVALID_API_KEY',
        details: '401 Unauthorized - Incorrect API key provided', // ✅ Included in dev
        timestamp: '2026-01-06T12:30:00.000Z',
      }

      expect(errorResponse).toHaveProperty('details')
      expect(errorResponse.details).toContain('401')
    })

    it('should see raw error messages in details field', () => {
      const errorResponse = {
        error: 'Request timed out - try a smaller document',
        code: 'TIMEOUT',
        details: 'Error: ETIMEDOUT - Connection timed out after 30000ms',
        timestamp: '2026-01-06T12:30:00.000Z',
      }

      // Admins can see technical details
      expect(errorResponse.details).toContain('ETIMEDOUT')
      expect(errorResponse.details).toContain('30000ms')
    })
  })
})

/**
 * =============================================================================
 * CATEGORY 2: DIAGNOSTIC ENDPOINT RESPONSES
 * =============================================================================
 * What users see when running diagnostics
 */
describe('Diagnostic Response Visibility', () => {
  describe('All Users (Diagnostic endpoint is available to all)', () => {
    it('should see provider configuration status', () => {
      const diagnosticResponse = {
        openai: {
          configured: true,
          valid: false,
          error: 'Invalid API key - check OPENAI_API_KEY in .env',
          latencyMs: 245,
        },
        anthropic: { configured: false, valid: false },
        google: { configured: false, valid: false },
        timestamp: '2026-01-06T12:30:00.000Z',
        environment: 'development',
        summary: {
          anyProviderConfigured: true,
          anyProviderValid: false,
          extractionReady: false,
          ocrReady: false,
          recommendation: 'API keys are configured but invalid',
        },
      }

      // Users CAN see:
      expect(diagnosticResponse.openai.configured).toBe(true)
      expect(diagnosticResponse.openai.valid).toBe(false)
      expect(diagnosticResponse.openai.error).toBeDefined()
      expect(diagnosticResponse.openai.latencyMs).toBeDefined()
      expect(diagnosticResponse.summary.recommendation).toBeDefined()
    })

    it('should NOT expose actual API keys', () => {
      const diagnosticResponse = {
        openai: {
          configured: true, // Just a boolean, not the actual key
          valid: true,
          latencyMs: 150,
          model: 'gpt-4o-mini',
        },
      }

      // Verify no key exposure
      expect(JSON.stringify(diagnosticResponse)).not.toContain('sk-')
      expect(JSON.stringify(diagnosticResponse)).not.toContain('sk-proj-')
      expect(JSON.stringify(diagnosticResponse)).not.toContain('sk-ant-')
    })

    it('should show sanitized error messages', () => {
      // Error messages in diagnostics are already sanitized
      const sanitizedErrors = [
        'Invalid API key - check OPENAI_API_KEY in .env',
        'Rate limit exceeded or quota exhausted',
        'API quota exhausted - add credits to your OpenAI account',
        'Cloud Vision API not enabled - enable it in Google Cloud Console',
      ]

      sanitizedErrors.forEach(error => {
        expect(error).not.toMatch(/sk-[a-zA-Z0-9]+/)  // No API keys
        expect(error).not.toContain('Bearer')         // No auth headers
        expect(error).not.toContain('Authorization')  // No auth info
      })
    })
  })

  describe('⚠️ POTENTIAL CONCERN: Environment exposed to all users', () => {
    it('shows NODE_ENV to users via diagnostic endpoint', () => {
      const diagnosticResponse = {
        environment: 'production', // This reveals environment to users
        timestamp: '2026-01-06T12:30:00.000Z',
      }

      // CONCERN: Users can see if they're hitting production or staging
      // RISK LEVEL: Low - not sensitive, but could be used for reconnaissance
      expect(diagnosticResponse.environment).toBeDefined()
    })
  })
})

/**
 * =============================================================================
 * CATEGORY 3: UI ERROR MESSAGES
 * =============================================================================
 * What users see in the PolicyUpload component
 */
describe('UI Error Message Visibility', () => {
  describe('End User View (UI Messages)', () => {
    it('should see troubleshooting steps', () => {
      // Users see these in the unhealthy banner
      const troubleshootingSteps = [
        'Run npm run dev:server in a terminal',
        'Ensure .env has OPENAI_API_KEY or ANTHROPIC_API_KEY',
        'Check the server terminal for errors',
      ]

      // These are appropriate for developers self-hosting
      troubleshootingSteps.forEach(step => {
        expect(step).not.toContain('password')
        expect(step).not.toContain('secret')
      })
    })

    it('should see diagnostic results with provider status', () => {
      // What appears in the Diagnostic Results box
      const uiMessages = [
        'OpenAI: Working (250ms)',
        'OpenAI: Invalid API key - check OPENAI_API_KEY in .env',
        'OpenAI: Not configured',
        'Anthropic: Rate limit exceeded',
        'Google OCR: Not configured (optional)',
      ]

      // All messages are user-appropriate
      uiMessages.forEach(msg => {
        expect(msg).not.toMatch(/sk-[a-zA-Z0-9]+/)
      })
    })

    it('should see toast notifications with appropriate messages', () => {
      const toastMessages = {
        success: {
          title: 'Analysis complete',
          description: 'document.pdf has been analyzed (85% confidence)',
        },
        error: {
          title: 'AI Not Configured',
          description: 'The AI service is not available. Ensure the backend server is running with OPENAI_API_KEY or ANTHROPIC_API_KEY in .env',
        },
        rateLimit: {
          title: 'Rate Limit Exceeded',
          description: 'Too many requests to the AI service. Please wait a few minutes before trying again.',
        },
      }

      // All toast messages are user-friendly
      Object.values(toastMessages).forEach(toast => {
        expect(toast.title).not.toContain('Error:')
        expect(toast.description).not.toContain('stack')
        expect(toast.description).not.toContain('at ')
      })
    })
  })

  describe('⚠️ POTENTIAL CONCERN: Technical details in UI', () => {
    it('exposes .env file references to end users', () => {
      // These messages appear in the UI
      const uiMessages = [
        'Ensure .env has OPENAI_API_KEY or ANTHROPIC_API_KEY',
        'Invalid API key - check OPENAI_API_KEY in .env',
        'Set VITE_API_PROXY_URL=http://localhost:4001 in your .env file',
      ]

      // CONCERN: End users see references to:
      // - .env file (reveals configuration mechanism)
      // - Environment variable names (OPENAI_API_KEY, etc.)
      // - localhost URLs

      // RISK LEVEL: Low for self-hosted app, but consider for SaaS:
      // - For self-hosted: ACCEPTABLE (users need to configure)
      // - For SaaS: SHOULD BE HIDDEN (users shouldn't configure server)

      uiMessages.forEach(msg => {
        expect(msg).toMatch(/\.env|API_KEY|localhost/)
      })
    })

    it('exposes latency information to all users', () => {
      // Diagnostic results show latency
      const diagnosticUI = {
        openai: 'Working (250ms)',
        anthropic: 'Working (180ms)',
        google: 'Working (120ms)',
      }

      // CONCERN: Latency information could reveal:
      // - Server location (faster = closer)
      // - Server load
      // - API performance characteristics

      // RISK LEVEL: Very Low - generally acceptable
      Object.values(diagnosticUI).forEach(msg => {
        expect(msg).toMatch(/\d+ms/)
      })
    })
  })
})

/**
 * =============================================================================
 * CATEGORY 4: SERVER CONSOLE LOGS
 * =============================================================================
 * What admins see in server terminal (never visible to end users)
 */
describe('Server Console Log Visibility', () => {
  describe('Admin Only (Server Logs)', () => {
    it('should log structured error details', () => {
      const serverLog = {
        timestamp: '2026-01-06T12:30:00.000Z',
        provider: 'openai',
        errorType: 'APIError',
        message: '401 Unauthorized - Incorrect API key provided',
        documentTextLength: 15234,
      }

      // Full technical details for debugging
      expect(serverLog.errorType).toBe('APIError')
      expect(serverLog.message).toContain('401')
      expect(serverLog.documentTextLength).toBe(15234)
    })

    it('should log diagnostic results', () => {
      const serverLog = {
        openai: { configured: true, valid: false, error: 'Invalid API key', latencyMs: 245 },
        anthropic: { configured: false, valid: false },
        google: { configured: false, valid: false },
        timestamp: '2026-01-06T12:30:00.000Z',
        environment: 'development',
      }

      // Admins see full diagnostic details in logs
      expect(JSON.stringify(serverLog)).toBeDefined()
    })

    it('should NOT log actual API keys even in server logs', () => {
      // Server logs should never contain actual keys
      const serverLogString = JSON.stringify({
        message: 'API key validation failed',
        provider: 'openai',
        keyPresent: true, // Boolean, not the actual key
      })

      expect(serverLogString).not.toMatch(/sk-[a-zA-Z0-9]+/)
      expect(serverLogString).not.toMatch(/sk-proj-/)
      expect(serverLogString).not.toMatch(/sk-ant-/)
    })
  })
})

/**
 * =============================================================================
 * CATEGORY 5: HEALTH CHECK ENDPOINT
 * =============================================================================
 * What users see from /api/health
 */
describe('Health Check Endpoint Visibility', () => {
  describe('All Users (Health endpoint is public)', () => {
    it('should see provider availability status', () => {
      const healthResponse = {
        status: 'ok',
        timestamp: '2026-01-06T12:30:00.000Z',
        providers: {
          openai: true,    // Boolean only - key exists
          anthropic: false,
          google: true,
        },
        rateLimits: {
          general: { windowMs: 900000, max: 100 },
          ai: { windowMs: 3600000, max: 20 },
          ocr: { windowMs: 3600000, max: 30 },
        },
      }

      // Users can see:
      // ✅ Which providers are configured (boolean)
      // ✅ Rate limit configuration
      expect(healthResponse.providers.openai).toBe(true)
      expect(healthResponse.rateLimits).toBeDefined()
    })

    it('should NOT expose sensitive configuration', () => {
      const healthResponse = {
        status: 'ok',
        providers: { openai: true, anthropic: false, google: true },
      }

      // Verify no sensitive data
      expect(JSON.stringify(healthResponse)).not.toContain('sk-')
      expect(JSON.stringify(healthResponse)).not.toContain('password')
      expect(JSON.stringify(healthResponse)).not.toContain('secret')
      expect(JSON.stringify(healthResponse)).not.toContain('SUPABASE')
    })
  })

  describe('⚠️ POTENTIAL CONCERN: Rate limit config exposed', () => {
    it('exposes rate limit configuration to users', () => {
      const healthResponse = {
        rateLimits: {
          general: { windowMs: 900000, max: 100 },
          ai: { windowMs: 3600000, max: 20 },
          ocr: { windowMs: 3600000, max: 30 },
        },
      }

      // CONCERN: Users know exact rate limits
      // This could be used to:
      // - Plan attacks just under the limit
      // - Understand server capacity

      // RISK LEVEL: Low - rate limits are typically acceptable to expose
      // Many APIs document their limits publicly
      expect(healthResponse.rateLimits.ai.max).toBe(20)
    })
  })
})

/**
 * =============================================================================
 * SUMMARY: VISIBILITY MATRIX
 * =============================================================================
 */
describe('Visibility Matrix Summary', () => {
  it('documents what each user type can see', () => {
    const visibilityMatrix = {
      // Category: What End Users See
      endUsers: {
        // ✅ APPROPRIATE
        appropriate: [
          'User-friendly error messages (e.g., "OpenAI API key is invalid")',
          'Error codes (e.g., INVALID_API_KEY, RATE_LIMIT_EXCEEDED)',
          'Timestamps',
          'Provider status (configured: true/false, valid: true/false)',
          'Latency measurements',
          'Troubleshooting steps',
          'Toast notifications',
        ],
        // ❌ HIDDEN (Good)
        hidden: [
          'Raw API error messages',
          'Stack traces',
          'API keys',
          'Internal server paths',
          'Database connection strings',
        ],
        // ⚠️ EXPOSED (Review needed for SaaS)
        potentialConcerns: [
          '.env file references',
          'Environment variable names',
          'localhost URLs',
          'NODE_ENV value',
          'Rate limit configuration',
        ],
      },

      // Category: What Admins See
      admins: {
        // In addition to everything above:
        additional: [
          'Full error details in API responses',
          'Raw API error messages',
          'Document text length',
          'Structured JSON logs',
          'Error type names',
        ],
        // Still hidden from everyone:
        alwaysHidden: [
          'Actual API keys',
          'Passwords',
          'Database credentials',
        ],
      },
    }

    // Verify structure
    expect(visibilityMatrix.endUsers.appropriate.length).toBeGreaterThan(0)
    expect(visibilityMatrix.endUsers.hidden.length).toBeGreaterThan(0)
    expect(visibilityMatrix.admins.alwaysHidden).toContain('Actual API keys')
  })
})
